
import fetch from "node-fetch";

const UPS_OAUTH_URL =
  process.env.UPS_ENV === "production"
    ? "https://onlinetools.ups.com/security/v1/oauth/token"
    : "https://wwwcie.ups.com/security/v1/oauth/token";

const UPS_SHIP_URL_BASE =
  process.env.UPS_ENV === "production"
    ? "https://onlinetools.ups.com/api/shipments"
    : "https://wwwcie.ups.com/api/shipments";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch(UPS_OAUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-merchant-id": process.env.UPS_ACCOUNT_NUMBER ?? "",
      Authorization:
        "Basic " +
        Buffer.from(
          `${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`
        ).toString("base64"),
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });

  if (!res.ok) throw new Error(`UPS OAuth failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export type ShipTo = {
  name: string;
  attention?: string;
  phone?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
};

export async function createShipment(opts: {
  shipTo: ShipTo;
  serviceCode: string; // e.g. "03"
  weightLbs: number;
  referenceNumber?: string;
}) {
  const token = await getAccessToken();

  const labelFormatEnv = (process.env.UPS_LABEL_FORMAT ?? "PDF").toUpperCase();
  const labelImageCode = labelFormatEnv === "ZPL" ? "ZPL" : "GIF"; // UPS returns base64(ZPL or GIF). We'll wrap GIF into PDF later.

  const body = {
    ShipmentRequest: {
      Shipment: {
        Shipper: {
          Name: process.env.SHIP_FROM_NAME,
          AttentionName: process.env.SHIP_FROM_ATTENTION,
          ShipperNumber: process.env.UPS_SHIPPER_NUMBER,
          Phone: { Number: process.env.SHIP_FROM_PHONE },
          Address: {
            AddressLine: [process.env.SHIP_FROM_ADDRESS1],
            City: process.env.SHIP_FROM_CITY,
            StateProvinceCode: process.env.SHIP_FROM_STATE,
            PostalCode: process.env.SHIP_FROM_POSTAL,
            CountryCode: process.env.SHIP_FROM_COUNTRY,
          },
        },
        ShipTo: {
          Name: opts.shipTo.name,
          AttentionName: opts.shipTo.attention ?? opts.shipTo.name,
          Phone: { Number: opts.shipTo.phone ?? "0000000000" },
          Address: {
            AddressLine: [opts.shipTo.address1, opts.shipTo.address2 ?? ""].filter(Boolean),
            City: opts.shipTo.city,
            StateProvinceCode: opts.shipTo.state,
            PostalCode: opts.shipTo.postalCode,
            CountryCode: opts.shipTo.country ?? "US",
          },
        },
        ShipFrom: {
          Name: process.env.SHIP_FROM_NAME,
          AttentionName: process.env.SHIP_FROM_ATTENTION,
          Phone: { Number: process.env.SHIP_FROM_PHONE },
          Address: {
            AddressLine: [process.env.SHIP_FROM_ADDRESS1],
            City: process.env.SHIP_FROM_CITY,
            StateProvinceCode: process.env.SHIP_FROM_STATE,
            PostalCode: process.env.SHIP_FROM_POSTAL,
            CountryCode: process.env.SHIP_FROM_COUNTRY,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01", // Transportation
            BillShipper: { AccountNumber: process.env.UPS_ACCOUNT_NUMBER },
          },
        },
        Service: { Code: opts.serviceCode }, // "03" Ground
        Package: [
          {
            Packaging: { Code: "02" }, // Customer supplied package
            PackageWeight: {
              UnitOfMeasurement: { Code: "LBS" },
              Weight: String(Math.max(opts.weightLbs, 1)),
            },
            ReferenceNumber: opts.referenceNumber
              ? [{ Code: "PO", Value: opts.referenceNumber }]
              : undefined,
          },
        ],
      },
      LabelSpecification: {
        LabelImageFormat: { Code: labelImageCode },
        HTTPUserAgent: "AGC-Shipping",
      },
    },
  };

  const res = await fetch(UPS_SHIP_URL_BASE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;
  if (!res.ok) throw new Error(`UPS create shipment failed: ${JSON.stringify(data)}`);

  const pkg =
    data?.ShipmentResponse?.ShipmentResults?.PackageResults?.[0] ??
    data?.ShipmentResponse?.ShipmentResults?.PackageResults;

  const tracking: string =
    pkg?.TrackingNumber ??
    data?.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber;

  const labelBase64: string | undefined =
    pkg?.ShippingLabel?.GraphicImage ?? pkg?.ShippingLabel?.HTMLImage;

  return {
    trackingNumber: tracking,
    labelBase64,
    returnedFormat: labelImageCode, // "GIF" or "ZPL"
  };
}

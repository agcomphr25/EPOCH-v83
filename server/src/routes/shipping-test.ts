import { Router, Request, Response } from 'express';
import axios from 'axios';

const router = Router();

// Simple UPS API test endpoint
router.post('/test-ups', async (req: Request, res: Response) => {
  try {
    console.log('Testing UPS API with minimal payload...');
    
    // Minimal UPS test payload
    const testPayload = {
      UPSSecurity: {
        UsernameToken: {
          Username: process.env.UPS_USERNAME,
          Password: process.env.UPS_PASSWORD,
        },
        ServiceAccessToken: {
          AccessLicenseNumber: process.env.UPS_ACCESS_KEY,
        },
      },
      ShipmentRequest: {
        Request: {
          RequestOption: 'nonvalidate',
          TransactionReference: {
            CustomerContext: 'Test Shipment',
          },
        },
        Shipment: {
          Description: 'Test Package',
          Shipper: {
            Name: process.env.SHIP_FROM_NAME || 'AG Composites',
            AttentionName: process.env.SHIP_FROM_ATTENTION || 'Shipping', 
            CompanyDisplayableName: process.env.SHIP_FROM_NAME || 'AG Composites',
            Phone: {
              Number: process.env.SHIP_FROM_PHONE || '256-723-8381',
            },
            ShipperNumber: process.env.UPS_SHIPPER_NUMBER,
            Address: {
              AddressLine: [process.env.SHIP_FROM_ADDRESS1 || '230 Hamer Rd.'],
              City: process.env.SHIP_FROM_CITY || 'Owens Crossroads',
              StateProvinceCode: process.env.SHIP_FROM_STATE || 'AL',
              PostalCode: process.env.SHIP_FROM_POSTAL || '35763',
              CountryCode: 'US',
            },
          },
          ShipTo: {
            Name: 'Test Customer',
            AttentionName: 'Test Customer',
            Address: {
              AddressLine: ['123 Test St'],
              City: 'Austin',
              StateProvinceCode: 'TX',
              PostalCode: '78701',
              CountryCode: 'US',
            },
          },
          PaymentInformation: {
            ShipmentCharge: {
              Type: '01',
              BillShipper: {
                AccountNumber: process.env.UPS_SHIPPER_NUMBER,
              },
            },
          },
          Service: {
            Code: '03', // Ground
          },
          Package: {
            Description: 'Test Package',
            Packaging: {
              Code: '02', // Customer Package
            },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS',
              },
              Weight: '10',
            },
          },
          LabelSpecification: {
            LabelImageFormat: {
              Code: 'GIF',
            },
            HTTPUserAgent: 'Mozilla/4.0',
            LabelStockSize: {
              Height: '6',
              Width: '4',
            },
          },
        },
      },
    };

    console.log('UPS Test Payload:', JSON.stringify(testPayload, null, 2));

    const upsEndpoint = 'https://wwwcie.ups.com/rest/Ship';
    
    const response = await axios.post(upsEndpoint, testPayload, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000,
    });

    console.log('UPS API Success Response:', JSON.stringify(response.data, null, 2));
    res.json({ success: true, data: response.data });

  } catch (error: any) {
    console.error('UPS Test Error:', JSON.stringify(error.response?.data, null, 2));
    res.status(500).json({ 
      error: 'UPS Test Failed',
      details: error.response?.data,
      message: error.message
    });
  }
});

export default router;
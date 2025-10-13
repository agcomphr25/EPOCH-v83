
import { z } from "zod";

export const CreateLabelInput = z.object({
  orderId: z.number().int().positive(),
  serviceCode: z.string().default("03"),
});

export const CreateLabelsInput = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
  serviceCode: z.string().default("03"),
});

export type CreateLabelInput = z.infer<typeof CreateLabelInput>;
export type CreateLabelsInput = z.infer<typeof CreateLabelsInput>;

export type ShipLabelResult = { 
  ok: true; 
  trackingNumber: string; 
  labelUrl: string; 
};

export type ShipBatchResult = {
  ok: true;
  labels: Array<{ orderId: number; trackingNumber: string; labelUrl: string }>;
  invoiceUrl: string;
  errors?: string[];
};

export async function createUpsLabel(input: { orderId: number; serviceCode?: string }): Promise<ShipLabelResult> {
  const res = await fetch("/api/ship/ups/label", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ShipLabelResult;
}

export async function createUpsLabels(input: { orderIds: number[]; serviceCode?: string }): Promise<ShipBatchResult> {
  const res = await fetch("/api/ship/ups/labels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as ShipBatchResult;
}

export async function getShippingStatus(orderId: number) {
  const res = await fetch(`/api/ship/status/${orderId}`);
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

export async function notifyCustomer(orderId: number, method: 'email' | 'sms' = 'email') {
  const res = await fetch(`/api/ship/notify/${orderId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

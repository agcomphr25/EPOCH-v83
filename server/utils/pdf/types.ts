export interface PackingSlipItem {
  partNumber?: string;
  description: string;
  quantity: number;
  unitNumber?: string;
  serialNumbers?: string[];
  lotNumber?: string;
  specifications?: string;
  contents?: string;
  stickerRange?: string;
  weeklyBoxNumber?: string;
  shipmentNumber?: string;
}

export interface PackingSlipData {
  packingSlipNumber: string;
  invoiceNumber?: string;
  poNumber?: string;
  lotNumber?: string;
  date: string;
  customerName: string;
  customerAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    rawLines?: string[];
  };
  trackingNumber?: string;
  totalQuantity: number;
  packedBy?: string;
  verifiedBy?: string;
  items: PackingSlipItem[];
  weeklyBoxNumber?: string;
  shipmentNumber?: string;
}

// PDFME PDF Generation System - DISABLED
// This file is a stub. The actual implementation using @pdfme/generator has been disabled.
// To re-enable, install @pdfme packages and restore the original implementation.

export interface PdfGenerationInput {
  template: any;
  inputs: Record<string, any>[];
}

export async function generatePdf(input: PdfGenerationInput): Promise<Buffer> {
  throw new Error('PDF generation is currently disabled. Install @pdfme packages to enable.');
}

export async function generateMultiPagePdf(
  template: any,
  dataRecords: Record<string, any>[]
): Promise<Buffer> {
  throw new Error('PDF generation is currently disabled. Install @pdfme packages to enable.');
}

export function prepareVendorPOData(poData: any): Record<string, string> {
  return {
    companyName: poData.companyName || 'N/A',
    poNumber: poData.poNumber || 'N/A',
    date: poData.date || new Date().toLocaleDateString(),
    vendorName: poData.vendorName || 'N/A',
    vendorAddress: poData.vendorAddress || 'N/A',
    vendorCity: poData.vendorCity || 'N/A',
    vendorState: poData.vendorState || 'N/A',
    vendorZip: poData.vendorZip || 'N/A',
    vendorPhone: poData.vendorPhone || 'N/A',
    vendorEmail: poData.vendorEmail || 'N/A',
    shipToName: poData.shipToName || 'N/A',
    shipToAddress: poData.shipToAddress || 'N/A',
    shipToCity: poData.shipToCity || 'N/A',
    shipToState: poData.shipToState || 'N/A',
    shipToZip: poData.shipToZip || 'N/A',
    notes: poData.notes || '',
    subtotal: poData.subtotal?.toString() || '0.00',
    tax: poData.tax?.toString() || '0.00',
    shipping: poData.shipping?.toString() || '0.00',
    total: poData.total?.toString() || '0.00',
  };
}

import { generate } from '@pdfme/generator';
import { Template } from '@pdfme/common';
import { text, image, barcodes } from '@pdfme/schemas';

const plugins = {
  text,
  image,
  qrcode: barcodes.qrcode,
};

export interface PdfGenerationInput {
  template: Template;
  inputs: Record<string, any>[];
}

export async function generatePdf(input: PdfGenerationInput): Promise<Buffer> {
  try {
    const pdf = await generate({
      template: input.template as any,
      inputs: input.inputs,
      plugins,
    });

    return Buffer.from(pdf);
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function generateMultiPagePdf(
  template: Template,
  dataRecords: Record<string, any>[]
): Promise<Buffer> {
  try {
    const pdf = await generate({
      template: template as any,
      inputs: dataRecords,
      plugins,
    });

    return Buffer.from(pdf);
  } catch (error) {
    console.error('Multi-page PDF generation error:', error);
    throw new Error(`Failed to generate multi-page PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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

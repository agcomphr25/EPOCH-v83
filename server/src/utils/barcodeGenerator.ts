import bwipjs from 'bwip-js';

export interface BarcodeOptions {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
}

export async function generateBarcodeImage(
  value: string,
  options: BarcodeOptions = {}
): Promise<string> {
  const {
    format = 'CODE128',
    width = 3,
    height = 10,
    displayValue = true,
    fontSize = 10,
    margin = 5,
  } = options;

  try {
    const bcidMap: Record<string, string> = {
      'CODE128': 'code128',
      'CODE39': 'code39',
      'EAN13': 'ean13',
      'EAN8': 'ean8',
      'UPC': 'upca',
      'UPCA': 'upca',
      'ITF14': 'itf14',
      'MSI': 'msi',
      'PHARMACODE': 'pharmacode',
      'CODABAR': 'rationalizedCodabar',
    };

    const bcid = bcidMap[format.toUpperCase()] || 'code128';

    const pngBuffer = await bwipjs.toBuffer({
      bcid: bcid,
      text: value,
      scale: width,
      height: height,
      includetext: displayValue,
      textxalign: 'center',
      textsize: fontSize,
      paddingwidth: margin,
      paddingheight: margin,
    });

    const base64Png = pngBuffer.toString('base64');
    return `data:image/png;base64,${base64Png}`;
  } catch (error) {
    console.error('Error generating barcode:', error);
    throw new Error(`Failed to generate barcode for value: ${value}`);
  }
}

/**
 * Generate multiple barcode images
 * @param values - Array of values to encode
 * @param options - Barcode generation options
 * @returns Array of base64-encoded SVG data URL images
 */
export async function generateBarcodeImages(
  values: string[],
  options: BarcodeOptions = {}
): Promise<string[]> {
  return Promise.all(values.map((value) => generateBarcodeImage(value, options)));
}

/**
 * Generate a receiving unit barcode string.
 * Format: {receiptNumber}-{unitSequence} → e.g., "RCV-20260401-001-003"
 * @param receiptNumber - Full receipt number, e.g. "RCV-YYYYMMDD-NNN"
 * @param unitSequence - Zero-based unit sequence number within the receipt
 */
export function generateReceivingUnitBarcodeValue(receiptNumber: string, unitSequence: number): string {
  return `${receiptNumber}-${String(unitSequence).padStart(3, '0')}`;
}

import bwipjs from 'bwip-js';

export interface BarcodeOptions {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
}

/**
 * Generate a barcode image as a base64-encoded SVG data URL
 * Uses bwip-js which is pure JavaScript with no native dependencies
 * @param value - The value to encode in the barcode
 * @param options - Barcode generation options
 * @returns Base64-encoded SVG data URL string
 */
export async function generateBarcodeImage(
  value: string,
  options: BarcodeOptions = {}
): Promise<string> {
  const {
    format = 'CODE128',
    width = 2,
    height = 100,
    displayValue = true,
    fontSize = 20,
    margin = 10,
  } = options;

  try {
    // Map common format names to bwip-js bcid values
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

    // Generate SVG barcode using bwip-js (pure JavaScript, no native deps)
    const svg = bwipjs.toSVG({
      bcid: bcid,
      text: value,
      scale: width,
      height: Math.round(height / 10), // bwip-js uses mm, convert from px
      includetext: displayValue,
      textxalign: 'center',
      textsize: fontSize,
      paddingwidth: margin,
      paddingheight: margin,
    });

    // Convert SVG to base64 data URL
    const base64Svg = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64Svg}`;
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

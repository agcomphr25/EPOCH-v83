import JsBarcode from 'jsbarcode';
import { createCanvas } from 'canvas';

export interface BarcodeOptions {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
}

/**
 * Generate a barcode image as a base64-encoded PNG
 * @param value - The value to encode in the barcode
 * @param options - Barcode generation options
 * @returns Base64-encoded PNG image string
 */
export function generateBarcodeImage(
  value: string,
  options: BarcodeOptions = {}
): string {
  const {
    format = 'CODE128',
    width = 2,
    height = 100,
    displayValue = true,
    fontSize = 20,
    margin = 10,
  } = options;

  // Calculate canvas dimensions based on barcode value
  // CODE128 uses approximately 11 modules per character
  // Width = (value.length * 11 * barWidth) + (2 * margin) + quiet zones
  const barcodeWidth = Math.ceil(value.length * 11 * width) + (margin * 2) + 20;
  const canvasWidth = Math.max(barcodeWidth, 300); // Minimum 300px width
  
  // Height includes barcode height + text (if displayed) + margins
  const canvasHeight = height + (displayValue ? fontSize + 10 : 0) + (margin * 2);

  // Create a canvas with appropriate dimensions
  const canvas = createCanvas(canvasWidth, canvasHeight);

  try {
    // Generate barcode on canvas
    JsBarcode(canvas, value, {
      format,
      width,
      height,
      displayValue,
      fontSize,
      margin,
    });

    // Convert canvas to base64 PNG
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generating barcode:', error);
    throw new Error(`Failed to generate barcode for value: ${value}`);
  }
}

/**
 * Generate multiple barcode images
 * @param values - Array of values to encode
 * @param options - Barcode generation options
 * @returns Array of base64-encoded PNG images
 */
export function generateBarcodeImages(
  values: string[],
  options: BarcodeOptions = {}
): string[] {
  return values.map((value) => generateBarcodeImage(value, options));
}

export function getBarcodeFormat(barcodeValue: string): 'CODE128' | 'CODE39' {
  if (barcodeValue.startsWith('P1-') || barcodeValue.startsWith('P2-')) {
    return 'CODE128';
  }
  return 'CODE39';
}

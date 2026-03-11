export const DEPARTMENTS = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
] as const;

export type Department = (typeof DEPARTMENTS)[number];

export const VALID_DEPARTMENTS = new Set<string>(DEPARTMENTS);

export const PIPELINE_DEPARTMENTS = [
  "P1 Production Queue",
  "Layup/Plugging",
  "Barcode",
  "CNC",
  "Gunsmith",
  "Finish",
  "Finish QC",
  "Paint",
  "Shipping QC",
  "Shipping",
] as const;

export type PipelineDepartment = (typeof PIPELINE_DEPARTMENTS)[number];

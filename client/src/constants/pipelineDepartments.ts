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

export const DEPARTMENT_COLORS: Record<PipelineDepartment, { bg: string; hex: string; text: string; border: string }> = {
  "P1 Production Queue": { bg: "bg-blue-600",    hex: "#2563EB", text: "text-white",  border: "border-blue-600" },
  "Layup/Plugging":      { bg: "bg-fuchsia-600", hex: "#C026D3", text: "text-white",  border: "border-fuchsia-600" },
  "Barcode":             { bg: "bg-teal-500",    hex: "#14B8A6", text: "text-white",  border: "border-teal-500" },
  "CNC":                 { bg: "bg-amber-500",   hex: "#F59E0B", text: "text-white",  border: "border-amber-500" },
  "Gunsmith":            { bg: "bg-slate-600",   hex: "#475569", text: "text-white",  border: "border-slate-600" },
  "Finish":              { bg: "bg-rose-500",    hex: "#F43F5E", text: "text-white",  border: "border-rose-500" },
  "Finish QC":           { bg: "bg-lime-500",    hex: "#84CC16", text: "text-white",  border: "border-lime-500" },
  "Paint":               { bg: "bg-indigo-500",  hex: "#6366F1", text: "text-white",  border: "border-indigo-500" },
  "Shipping QC":         { bg: "bg-red-700",     hex: "#B91C1C", text: "text-white",  border: "border-red-700" },
  "Shipping":            { bg: "bg-cyan-600",    hex: "#0891B2", text: "text-white",  border: "border-cyan-600" },
};

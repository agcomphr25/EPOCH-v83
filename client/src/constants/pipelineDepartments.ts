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
  "P1 Production Queue": { bg: "bg-blue-500",    hex: "#3B82F6", text: "text-white",  border: "border-blue-500" },
  "Layup/Plugging":      { bg: "bg-purple-500",  hex: "#A855F7", text: "text-white",  border: "border-purple-500" },
  "Barcode":             { bg: "bg-teal-500",    hex: "#14B8A6", text: "text-white",  border: "border-teal-500" },
  "CNC":                 { bg: "bg-amber-500",   hex: "#F59E0B", text: "text-white",  border: "border-amber-500" },
  "Gunsmith":            { bg: "bg-slate-500",   hex: "#64748B", text: "text-white",  border: "border-slate-500" },
  "Finish":              { bg: "bg-rose-500",    hex: "#F43F5E", text: "text-white",  border: "border-rose-500" },
  "Finish QC":           { bg: "bg-emerald-500", hex: "#10B981", text: "text-white",  border: "border-emerald-500" },
  "Paint":               { bg: "bg-indigo-500",  hex: "#6366F1", text: "text-white",  border: "border-indigo-500" },
  "Shipping QC":         { bg: "bg-orange-500",  hex: "#F97316", text: "text-white",  border: "border-orange-500" },
  "Shipping":            { bg: "bg-green-600",   hex: "#16A34A", text: "text-white",  border: "border-green-600" },
};

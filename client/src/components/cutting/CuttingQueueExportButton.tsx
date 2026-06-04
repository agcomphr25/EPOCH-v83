import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

type CuttingQueueExportItem = {
  id?: number | string | null;
  partNumber?: string | null;
  partName?: string | null;
  displayName?: string | null;
  packetName?: string | null;
  materialType?: string | null;
  status?: string | null;
  quantityRequested?: number | null;
  quantityOrdered?: number | null;
  quantityCompleted?: number | null;
  printableBarcodeCount?: number | null;
  builtPacketCount?: number | null;
  allocatedPacketCount?: number | null;
  productionProtected?: boolean | null;
  productionProtectionReason?: string | null;
  bomMatchReason?: string | null;
  bomMatchConfidence?: string | null;
};

type Props<T extends CuttingQueueExportItem> = {
  items: T[];
  filenamePrefix: string;
};

const columns: Array<{ header: string; value: (item: CuttingQueueExportItem) => unknown }> = [
  { header: "Queue ID", value: (item) => item.id ?? "" },
  { header: "Part Number", value: (item) => item.partNumber ?? "" },
  { header: "Description", value: (item) => item.displayName ?? item.packetName ?? item.partName ?? "" },
  { header: "Material Type", value: (item) => item.materialType ?? "" },
  { header: "Status", value: (item) => item.status ?? "" },
  { header: "Quantity Requested", value: (item) => item.quantityRequested ?? item.quantityOrdered ?? 0 },
  { header: "Quantity Completed", value: (item) => item.quantityCompleted ?? 0 },
  { header: "Printable Labels", value: (item) => item.printableBarcodeCount ?? 0 },
  { header: "Built Packets", value: (item) => item.builtPacketCount ?? 0 },
  { header: "Trace/Allocated Packets", value: (item) => item.allocatedPacketCount ?? 0 },
  { header: "Production Protected", value: (item) => item.productionProtected ? "Yes" : "No" },
  { header: "Protection Reason", value: (item) => item.productionProtectionReason ?? "" },
  { header: "BOM Match", value: (item) => item.bomMatchReason ?? "" },
  { header: "BOM Confidence", value: (item) => item.bomMatchConfidence ?? "" },
];

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function exportRows(items: CuttingQueueExportItem[], filenamePrefix: string) {
  const header = columns.map((column) => csvCell(column.header)).join(",");
  const rows = items.map((item) => columns.map((column) => csvCell(column.value(item))).join(","));
  const csv = [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `${filenamePrefix}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function CuttingQueueExportButton<T extends CuttingQueueExportItem>({ items, filenamePrefix }: Props<T>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 gap-1.5 px-2"
      onClick={() => exportRows(items, filenamePrefix)}
      disabled={items.length === 0}
      data-testid={`button-export-${filenamePrefix}`}
    >
      <Download className="h-3.5 w-3.5" />
      Export view
    </Button>
  );
}

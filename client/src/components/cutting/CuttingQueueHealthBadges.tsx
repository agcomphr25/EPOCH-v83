import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Layers, PackageCheck, Printer, Route } from "lucide-react";

export type CuttingQueueHealthItem = {
  status?: string | null;
  packetBomId?: string | null;
  bomPartNumber?: string | null;
  poNumbers?: Array<unknown> | null;
  quantityRequested?: number | null;
  quantityOrdered?: number | null;
  quantityCompleted?: number | null;
  allocatedPacketCount?: number | null;
  printableBarcodeCount?: number | null;
};

type Props = {
  item: CuttingQueueHealthItem;
  compact?: boolean;
};

function numberValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function CuttingQueueHealthBadges({ item, compact = false }: Props) {
  const quantityRequested = numberValue(item.quantityRequested ?? item.quantityOrdered);
  const quantityCompleted = numberValue(item.quantityCompleted);
  const allocatedPacketCount = numberValue(item.allocatedPacketCount);
  const printableBarcodeCount = numberValue(item.printableBarcodeCount);
  const hasBom = Boolean(item.packetBomId || item.bomPartNumber);
  const groupedPoCount = Array.isArray(item.poNumbers) ? item.poNumbers.length : 0;
  const status = item.status || "PENDING";
  const isActive = status === "PENDING" || status === "IN_PROGRESS";
  const isPartial = quantityCompleted > 0 && quantityCompleted < quantityRequested;
  const hasTrace = allocatedPacketCount > 0 || quantityCompleted > 0;
  const traceComplete = quantityRequested > 0 && quantityCompleted >= quantityRequested && hasTrace;
  const needsLabels = isActive && printableBarcodeCount > 0;

  const className = compact ? "h-6 gap-1 px-1.5 text-[11px]" : "gap-1";
  const iconClassName = "h-3 w-3";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {hasBom ? (
        <Badge variant="secondary" className={className} title="Active BOM matched">
          <CheckCircle2 className={iconClassName} />
          BOM OK
        </Badge>
      ) : (
        <Badge variant="destructive" className={className} title="No active BOM matched this queue row">
          <AlertTriangle className={iconClassName} />
          No BOM
        </Badge>
      )}

      {groupedPoCount > 0 && (
        <Badge variant="outline" className={className} title="Grouped demand from multiple PO contributors">
          <Route className={iconClassName} />
          {groupedPoCount} PO{groupedPoCount === 1 ? "" : "s"}
        </Badge>
      )}

      {needsLabels && (
        <Badge variant="outline" className={className} title={`${printableBarcodeCount} packet barcode(s) still printable`}>
          <Printer className={iconClassName} />
          {printableBarcodeCount} labels
        </Badge>
      )}

      {isPartial && (
        <Badge variant="secondary" className={className} title="Some packet trace records have been completed">
          <Layers className={iconClassName} />
          Partial
        </Badge>
      )}

      {hasTrace && !traceComplete && !isPartial && (
        <Badge variant="outline" className={className} title="Trace records or allocations exist for this work order">
          <PackageCheck className={iconClassName} />
          Trace started
        </Badge>
      )}

      {traceComplete && (
        <Badge className={className} title="Completed quantity has packet trace records">
          <PackageCheck className={iconClassName} />
          Trace complete
        </Badge>
      )}
    </div>
  );
}

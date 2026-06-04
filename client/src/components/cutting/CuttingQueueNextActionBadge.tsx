import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, ClipboardCheck, PackageCheck, PlayCircle, Printer, Scissors } from "lucide-react";

export type CuttingQueueNextActionItem = {
  status?: string | null;
  packetBomId?: string | null;
  bomPartNumber?: string | null;
  bomMatchConfidence?: string | null;
  quantityRequested?: number | null;
  quantityOrdered?: number | null;
  quantityCompleted?: number | null;
  allocatedPacketCount?: number | null;
  printableBarcodeCount?: number | null;
  productionProtected?: boolean | null;
  productionProtectionReason?: string | null;
};

type Props = {
  item: CuttingQueueNextActionItem;
  compact?: boolean;
};

function numberValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hasBomMatch(item: CuttingQueueNextActionItem): boolean {
  return Boolean(item.packetBomId || item.bomPartNumber || (item.bomMatchConfidence && item.bomMatchConfidence !== "none"));
}

export function CuttingQueueNextActionBadge({ item, compact = false }: Props) {
  const status = item.status || "PENDING";
  const quantityRequested = numberValue(item.quantityRequested ?? item.quantityOrdered);
  const quantityCompleted = numberValue(item.quantityCompleted);
  const printableBarcodeCount = numberValue(item.printableBarcodeCount);
  const allocatedPacketCount = numberValue(item.allocatedPacketCount);
  const hasTrace = allocatedPacketCount > 0 || quantityCompleted > 0 || Boolean(item.productionProtected);
  const className = compact ? "h-6 gap-1 px-1.5 text-[11px]" : "gap-1";
  const iconClassName = "h-3 w-3";

  if (!hasBomMatch(item)) {
    return (
      <Badge variant="destructive" className={className} title="Add or repair the BOM link before cutting">
        <AlertTriangle className={iconClassName} />
        Fix BOM
      </Badge>
    );
  }

  if (status === "COMPLETED") {
    return (
      <Badge className={className} title={hasTrace ? "Completed with packet trace records" : "Completed queue row needs trace review"}>
        <CheckCircle2 className={iconClassName} />
        {hasTrace ? "Done" : "Review trace"}
      </Badge>
    );
  }

  if (hasTrace) {
    const fullyAccountedFor = quantityRequested > 0 && allocatedPacketCount >= quantityRequested;
    const reason = item.productionProtectionReason === "built_packets_exist"
      ? "Built packet records already exist"
      : item.productionProtectionReason === "quantity_completed"
        ? "Completed quantity is already recorded"
        : "Packets already have production trace or allocation";
    return (
      <Badge variant="outline" className={className} title={`${reason}; review only`}>
        <PackageCheck className={iconClassName} />
        {fullyAccountedFor ? "In production" : "Review trace"}
      </Badge>
    );
  }

  if (printableBarcodeCount > 0) {
    return (
      <Badge variant="outline" className={className} title={`${printableBarcodeCount} packet barcode label(s) can still be printed`}>
        <Printer className={iconClassName} />
        Print labels
      </Badge>
    );
  }

  if (status === "PENDING") {
    return (
      <Badge variant="secondary" className={className} title="Labels are accounted for; start the cutting workflow">
        <PlayCircle className={iconClassName} />
        Start cut
      </Badge>
    );
  }

  if (status === "IN_PROGRESS" && quantityRequested > 0 && quantityCompleted >= quantityRequested) {
    return (
      <Badge variant="secondary" className={className} title="Requested quantity is complete; review and close traceability">
        <ClipboardCheck className={iconClassName} />
        Close trace
      </Badge>
    );
  }

  if (status === "IN_PROGRESS") {
    return (
      <Badge variant="secondary" className={className} title="Cutting is in progress; continue scanning material and completing packets">
        <Scissors className={iconClassName} />
        Continue
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={className} title="Review this queue row before taking action">
      <ClipboardCheck className={iconClassName} />
      Review
    </Badge>
  );
}

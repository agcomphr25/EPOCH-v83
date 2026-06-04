import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type CuttingQueueFilterValue = "all" | "needs_bom" | "needs_labels" | "ready_to_cut" | "in_production" | "trace_review";

export type CuttingQueueFilterItem = {
  status?: string | null;
  packetBomId?: string | null;
  bomPartNumber?: string | null;
  bomMatchConfidence?: string | null;
  quantityRequested?: number | null;
  quantityOrdered?: number | null;
  quantityCompleted?: number | null;
  builtPacketCount?: number | null;
  allocatedPacketCount?: number | null;
  printableBarcodeCount?: number | null;
  productionProtected?: boolean | null;
};

type Props<T extends CuttingQueueFilterItem> = {
  items: T[];
  value: CuttingQueueFilterValue;
  onChange: (value: CuttingQueueFilterValue) => void;
};

const filterLabels: Record<CuttingQueueFilterValue, string> = {
  all: "All",
  needs_bom: "Needs BOM",
  needs_labels: "Needs labels",
  ready_to_cut: "Ready to cut",
  in_production: "In production",
  trace_review: "Trace review",
};

function numberValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function isCuttingQueueProductionProtected(item: CuttingQueueFilterItem): boolean {
  return Boolean(
    item.productionProtected ||
    numberValue(item.quantityCompleted) > 0 ||
    numberValue(item.builtPacketCount) > 0 ||
    numberValue(item.allocatedPacketCount) > 0
  );
}

function hasBomMatch(item: CuttingQueueFilterItem): boolean {
  return Boolean(item.packetBomId || item.bomPartNumber || (item.bomMatchConfidence && item.bomMatchConfidence !== "none"));
}

function hasPrintableLabels(item: CuttingQueueFilterItem): boolean {
  const status = item.status || "PENDING";
  return (status === "PENDING" || status === "IN_PROGRESS")
    && !isCuttingQueueProductionProtected(item)
    && numberValue(item.printableBarcodeCount) > 0;
}

function isReadyToCut(item: CuttingQueueFilterItem): boolean {
  const status = item.status || "PENDING";
  return status === "PENDING"
    && hasBomMatch(item)
    && !isCuttingQueueProductionProtected(item)
    && !hasPrintableLabels(item);
}

function needsTraceReview(item: CuttingQueueFilterItem): boolean {
  const requested = numberValue(item.quantityRequested ?? item.quantityOrdered);
  const completed = numberValue(item.quantityCompleted);
  const protectedRow = isCuttingQueueProductionProtected(item);
  return protectedRow && item.status !== "COMPLETED" && (requested === 0 || completed < requested);
}

export function filterCuttingQueueItems<T extends CuttingQueueFilterItem>(items: T[], filter: CuttingQueueFilterValue): T[] {
  if (filter === "all") return items;
  if (filter === "needs_bom") return items.filter((item) => !hasBomMatch(item));
  if (filter === "needs_labels") return items.filter(hasPrintableLabels);
  if (filter === "ready_to_cut") return items.filter(isReadyToCut);
  if (filter === "in_production") return items.filter(isCuttingQueueProductionProtected);
  if (filter === "trace_review") return items.filter(needsTraceReview);
  return items;
}

export function CuttingQueueFilterBar<T extends CuttingQueueFilterItem>({ items, value, onChange }: Props<T>) {
  const counts = {
    all: items.length,
    needs_bom: filterCuttingQueueItems(items, "needs_bom").length,
    needs_labels: filterCuttingQueueItems(items, "needs_labels").length,
    ready_to_cut: filterCuttingQueueItems(items, "ready_to_cut").length,
    in_production: filterCuttingQueueItems(items, "in_production").length,
    trace_review: filterCuttingQueueItems(items, "trace_review").length,
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(Object.keys(filterLabels) as CuttingQueueFilterValue[]).map((filter) => (
        <Button
          key={filter}
          type="button"
          variant={value === filter ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 px-2"
          onClick={() => onChange(filter)}
          data-testid={`cutting-queue-filter-${filter}`}
        >
          <span>{filterLabels[filter]}</span>
          <Badge variant={value === filter ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">
            {counts[filter]}
          </Badge>
        </Button>
      ))}
    </div>
  );
}

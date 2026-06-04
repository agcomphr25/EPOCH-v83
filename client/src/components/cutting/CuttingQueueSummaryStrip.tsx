import { Badge } from "@/components/ui/badge";
import {
  cuttingQueueFilterLabels,
  getCuttingQueueFilterCounts,
  type CuttingQueueFilterItem,
  type CuttingQueueFilterValue,
} from "@/components/cutting/CuttingQueueFilterBar";

type Props<T extends CuttingQueueFilterItem> = {
  items: T[];
};

const summaryOrder: CuttingQueueFilterValue[] = [
  "all",
  "ready_to_cut",
  "needs_labels",
  "needs_bom",
  "in_production",
  "trace_review",
];

function summaryVariant(filter: CuttingQueueFilterValue): "default" | "secondary" | "destructive" | "outline" {
  if (filter === "ready_to_cut") return "secondary";
  if (filter === "needs_bom") return "destructive";
  return "outline";
}

export function CuttingQueueSummaryStrip<T extends CuttingQueueFilterItem>({ items }: Props<T>) {
  const counts = getCuttingQueueFilterCounts(items);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {summaryOrder.map((filter) => (
        <Badge
          key={filter}
          variant={summaryVariant(filter)}
          className="h-7 gap-1 px-2 text-xs"
          data-testid={`cutting-queue-summary-${filter}`}
        >
          <span>{cuttingQueueFilterLabels[filter]}</span>
          <span className="font-mono font-semibold">{counts[filter]}</span>
        </Badge>
      ))}
    </div>
  );
}

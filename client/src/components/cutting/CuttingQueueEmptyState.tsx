import { Button } from "@/components/ui/button";
import { ClipboardList, FilterX, Scissors } from "lucide-react";
import { cuttingQueueFilterLabels, type CuttingQueueFilterValue } from "@/components/cutting/CuttingQueueFilterBar";

type Props = {
  mode: "empty" | "filtered";
  filter?: CuttingQueueFilterValue;
  onClearFilter?: () => void;
  className?: string;
};

const filterMessages: Partial<Record<CuttingQueueFilterValue, string>> = {
  needs_bom: "Every visible row has an active BOM match.",
  needs_labels: "No visible rows currently need packet labels.",
  ready_to_cut: "No visible rows are ready to start cutting.",
  in_production: "No visible rows are locked by production trace.",
  trace_review: "No visible rows need trace review.",
};

export function CuttingQueueEmptyState({ mode, filter = "all", onClearFilter, className = "" }: Props) {
  if (mode === "empty") {
    return (
      <div className={`text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg ${className}`}>
        <Scissors className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>No packets are scheduled for cutting</p>
        <p className="text-sm">New demand will appear here after scheduling.</p>
      </div>
    );
  }

  const label = cuttingQueueFilterLabels[filter] || "selected";
  const message = filterMessages[filter] || "No visible rows match this filter.";

  return (
    <div className={`text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg ${className}`}>
      <FilterX className="h-8 w-8 mx-auto mb-2 opacity-30" />
      <p>No rows in {label}</p>
      <p className="text-sm">{message}</p>
      {onClearFilter && filter !== "all" && (
        <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={onClearFilter}>
          <ClipboardList className="h-3.5 w-3.5" />
          Show all rows
        </Button>
      )}
    </div>
  );
}

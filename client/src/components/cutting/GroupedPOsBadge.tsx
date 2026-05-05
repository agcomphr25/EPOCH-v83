import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ExternalLink, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type GroupedPOEntry = {
  poNumber: string;
  quantity: number;
  p2PoItemId?: number | null;
  p2PoId?: number | null;
};

interface GroupedPOsBadgeProps {
  poNumbers: GroupedPOEntry[] | null | undefined;
  className?: string;
  testIdPrefix?: string;
}

export function GroupedPOsBadge({ poNumbers, className, testIdPrefix = "grouped-pos" }: GroupedPOsBadgeProps) {
  const entries = Array.isArray(poNumbers) ? poNumbers.filter(p => p && (p.poNumber || p.p2PoId || p.p2PoItemId)) : [];
  if (entries.length === 0) return null;

  const totalQty = entries.reduce((sum, p) => sum + (p.quantity || 0), 0);
  const isGrouped = entries.length > 1;
  const label = `${entries.length} PO${entries.length === 1 ? '' : 's'}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant={isGrouped ? "default" : "outline"}
          className={cn(
            "cursor-pointer gap-1 hover-elevate active-elevate-2",
            isGrouped && "bg-purple-600 hover:bg-purple-700 text-white",
            className
          )}
          data-testid={`badge-${testIdPrefix}`}
        >
          <Layers className="h-3 w-3" />
          {label}
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" data-testid={`popover-${testIdPrefix}`}>
        <div className="p-3 border-b">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Bundled POs ({entries.length})
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Total quantity: {totalQty}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {entries.map((entry, idx) => {
            const key = entry.p2PoItemId ?? entry.p2PoId ?? entry.poNumber ?? idx;
            const previewHref = entry.p2PoId
              ? `/p2/purchase-orders/${entry.p2PoId}/preview`
              : null;
            return (
              <div
                key={`${key}-${idx}`}
                className="flex items-center justify-between gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-muted/50"
                data-testid={`row-${testIdPrefix}-${entry.poNumber || entry.p2PoId || idx}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-medium truncate" data-testid={`text-${testIdPrefix}-po-${entry.poNumber || idx}`}>
                    {entry.poNumber || `PO #${entry.p2PoId ?? '?'}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Qty {entry.quantity}
                  </div>
                </div>
                {previewHref ? (
                  <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    data-testid={`link-${testIdPrefix}-po-${entry.poNumber || entry.p2PoId || idx}`}
                  >
                    <a href={previewHref} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground italic">No link</span>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

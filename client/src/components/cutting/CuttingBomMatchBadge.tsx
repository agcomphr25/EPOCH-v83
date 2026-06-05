import { Badge } from "@/components/ui/badge";
import { CheckCircle2, HelpCircle, Link2, Search } from "lucide-react";

type Props = {
  reason?: string | null;
  confidence?: "strong" | "medium" | "fallback" | "none" | string | null;
  compact?: boolean;
};

const labels: Record<string, string> = {
  notes_bom_id: "BOM ID",
  inventory_item: "Item link",
  part_number: "Part #",
  material_type: "Material",
  packet_name: "Name",
  item_name: "Item name",
};

export function CuttingBomMatchBadge({ reason, confidence, compact = false }: Props) {
  const normalizedConfidence = confidence || "none";
  const label = reason ? labels[reason] || reason.replace(/_/g, " ") : "No BOM";
  const className = compact ? "h-6 gap-1 px-1.5 text-[11px]" : "gap-1";

  if (normalizedConfidence === "strong") {
    return (
      <Badge variant="secondary" className={className} title={`BOM matched by ${label}`}>
        <CheckCircle2 className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  if (normalizedConfidence === "medium") {
    return (
      <Badge variant="outline" className={className} title={`BOM matched by ${label}`}>
        <Link2 className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  if (normalizedConfidence === "fallback") {
    return (
      <Badge variant="outline" className={className} title={`Fallback BOM match by ${label}`}>
        <Search className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  return (
    <Badge variant="destructive" className={className} title="No active BOM matched this queue row">
      <HelpCircle className="h-3 w-3" />
      No BOM
    </Badge>
  );
}

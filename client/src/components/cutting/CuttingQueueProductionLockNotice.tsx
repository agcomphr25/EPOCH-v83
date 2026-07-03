import { Badge } from "@/components/ui/badge";
import { LockKeyhole, PackageCheck } from "lucide-react";

export type CuttingQueueProductionLockItem = {
  productionProtected?: boolean | null;
  productionProtectionReason?: string | null;
  builtPacketCount?: number | null;
  allocatedPacketCount?: number | null;
  quantityCompleted?: number | null;
};

type Props = {
  item: CuttingQueueProductionLockItem;
  compact?: boolean;
};

function numberValue(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function lockReasonLabel(reason: string | null | undefined): string {
  if (reason === "built_packets_exist") return "built packets exist";
  if (reason === "quantity_completed") return "completed quantity recorded";
  return "production trace exists";
}

export function CuttingQueueProductionLockNotice({ item, compact = false }: Props) {
  const builtPacketCount = numberValue(item.builtPacketCount);
  const allocatedPacketCount = numberValue(item.allocatedPacketCount);
  const quantityCompleted = numberValue(item.quantityCompleted);
  const isProtected = Boolean(item.productionProtected || builtPacketCount > 0 || allocatedPacketCount > 0 || quantityCompleted > 0);

  if (!isProtected) return null;

  const traceParts = [
    builtPacketCount > 0 ? `${builtPacketCount} built` : null,
    allocatedPacketCount > 0 ? `${allocatedPacketCount} traced` : null,
    quantityCompleted > 0 ? `${quantityCompleted} completed` : null,
  ].filter(Boolean);
  const title = [
    "This queue row is read-only because production trace already exists.",
    lockReasonLabel(item.productionProtectionReason),
    traceParts.join(", "),
  ].filter(Boolean).join(" ");

  if (compact) {
    return (
      <Badge variant="outline" className="mt-1 h-6 w-fit gap-1 px-1.5 text-[11px]" title={title}>
        <LockKeyhole className="h-3 w-3" />
        Locked
      </Badge>
    );
  }

  const className = compact
    ? "mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
    : "mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground";

  return (
    <div className={className}>
      <Badge variant="outline" className="h-6 gap-1 px-1.5 text-[11px]" title={title}>
        <LockKeyhole className="h-3 w-3" />
        Production locked
      </Badge>
      <span>{lockReasonLabel(item.productionProtectionReason)}.</span>
      {builtPacketCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <PackageCheck className="h-3 w-3" />
          {builtPacketCount} built
        </span>
      )}
      {allocatedPacketCount > 0 && <span>{allocatedPacketCount} traced</span>}
      {quantityCompleted > 0 && <span>{quantityCompleted} completed</span>}
    </div>
  );
}

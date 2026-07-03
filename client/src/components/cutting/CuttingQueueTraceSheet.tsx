import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { History, PackageCheck, Route, ScanLine, Layers, AlertTriangle } from "lucide-react";
import { CuttingBomMatchBadge } from "@/components/cutting/CuttingBomMatchBadge";

type TraceContributor = {
  poNumber: string;
  quantity: number;
  p2PoItemId?: number | null;
  p2PoId?: number | null;
};

type TraceFabricSource = {
  id: number;
  fabricType: string | null;
  lotNumber: string | null;
  batchNumber: string | null;
  rollNumber: string | null;
  supplierPartNumber: string | null;
  internalControlNumber: string | null;
  quantityUsed: number;
  isPrimary: boolean;
};

type TraceBuiltPacket = {
  id: number;
  barcode: string;
  packetNumber: number;
  buildDate: string;
  status: string;
  isMixedFabric: boolean;
  createdBy: string | null;
  allocatedToOrder: string | null;
  fabricSources: TraceFabricSource[];
};

type CuttingQueueTrace = {
  queueItem: {
    id: number;
    status: string;
    priority: number;
    quantityRequested: number;
    quantityCompleted: number;
    remainingQuantity: number;
    dueDate: string | null;
    requestedBy: string | null;
    assignedTo: string | null;
    startedAt: string | null;
    completedAt: string | null;
    completedBy: string | null;
    completionNotes: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  inventoryItem: {
    agPartNumber: string | null;
    name: string | null;
    manufacturedCategory: string | null;
    quantityInStock: number | null;
    onHand?: number | null;
  } | null;
  demand: {
    source: string;
    orderId: string | null;
    packetName: string | null;
    materialType: string | null;
    userNotes: string | null;
    grouped: boolean;
    contributors: TraceContributor[];
    contributorCount: number;
    contributorQuantity: number;
  };
  bom: {
    id: string;
    partNumber: string;
    packetType: string;
    yieldPerCut: number;
    squareMetersPerCut: number;
    noPlySchedule: boolean | null;
    matchReason: string | null;
    matchConfidence?: string | null;
    materials: Array<{ id: string; fabricType: string | null; commonName: string | null; rollsRequired: number | null }>;
    parts: Array<{ id: string; partNumber: string; partDescription: string | null; fabricType: string | null; commonName: string | null; yieldPerCut: number | null }>;
  } | null;
  builtPackets: TraceBuiltPacket[];
  traceSummary: {
    bomConfigured: boolean;
    builtPacketCount: number;
    fabricSourceCount: number;
    mixedFabricCount: number;
    availablePacketCount: number;
    allocatedPacketCount: number;
    completed: boolean;
  };
};

type Props = {
  queueId: number;
  label?: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "icon";
  iconOnly?: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "COMPLETED" || status === "AVAILABLE") return "default";
  if (status === "IN_PROGRESS" || status === "ALLOCATED") return "secondary";
  if (status === "CANCELLED") return "destructive";
  return "outline";
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  const displayValue = value === null || value === undefined || value === "" ? "-" : value;
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{displayValue}</span>
    </div>
  );
}

export function CuttingQueueTraceSheet({ queueId, label = "Trace", variant = "ghost", size = "sm", iconOnly = false }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery<CuttingQueueTrace>({
    queryKey: ["/api/cutting-table-mfg-queue", queueId, "trace"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/cutting-table-mfg-queue/${queueId}/trace`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Failed to fetch trace");
      return body;
    },
  });

  const title = useMemo(() => {
    if (!data) return `Queue #${queueId}`;
    return data.demand.packetName || data.inventoryItem?.name || `Queue #${queueId}`;
  }, [data, queueId]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} size={size} className="gap-1" data-testid={`button-trace-${queueId}`}>
          <History className="h-4 w-4" />
          {!iconOnly && label}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Work Order Trace
          </SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-88px)]">
          <div className="space-y-5 p-6">
            {isLoading && <div className="text-sm text-muted-foreground">Loading trace...</div>}
            {error && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                {(error as Error).message}
              </div>
            )}

            {data && (
              <>
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{title}</h3>
                      <p className="text-sm text-muted-foreground">{data.inventoryItem?.agPartNumber || "No part number"}</p>
                    </div>
                    <Badge variant={statusVariant(data.queueItem.status)}>{data.queueItem.status}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Requested</div>
                      <div className="text-lg font-semibold">{data.queueItem.quantityRequested}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Completed</div>
                      <div className="text-lg font-semibold">{data.queueItem.quantityCompleted}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">Remaining</div>
                      <div className="text-lg font-semibold">{data.queueItem.remainingQuantity}</div>
                    </div>
                  </div>
                </section>

                <Separator />

                <section className="space-y-3">
                  <h4 className="flex items-center gap-2 font-semibold">
                    <PackageCheck className="h-4 w-4" />
                    Demand
                  </h4>
                  <DetailRow label="Source" value={data.demand.source} />
                  <DetailRow label="Order ID" value={data.demand.orderId} />
                  <DetailRow label="Due" value={formatDate(data.queueItem.dueDate)} />
                  <DetailRow label="Notes" value={data.demand.userNotes} />
                  {data.demand.contributors.length > 0 && (
                    <div className="rounded-md border">
                      <div className="border-b px-3 py-2 text-sm font-medium">
                        {data.demand.contributorCount} source PO{data.demand.contributorCount === 1 ? "" : "s"} / {data.demand.contributorQuantity} packets
                      </div>
                      <div className="max-h-40 overflow-auto">
                        {data.demand.contributors.map((po, idx) => (
                          <div key={`${po.poNumber}-${idx}`} className="flex justify-between gap-3 px-3 py-2 text-sm odd:bg-muted/40">
                            <span className="font-mono">{po.poNumber || `P2 item ${po.p2PoItemId || po.p2PoId || idx + 1}`}</span>
                            <span>{po.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <Separator />

                <section className="space-y-3">
                  <h4 className="flex items-center gap-2 font-semibold">
                    <Layers className="h-4 w-4" />
                    BOM Readiness
                  </h4>
                  {data.bom ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{data.bom.packetType}</Badge>
                        <Badge variant="outline">{data.bom.partNumber}</Badge>
                        <CuttingBomMatchBadge reason={data.bom.matchReason} confidence={data.bom.matchConfidence} compact />
                      </div>
                      <DetailRow label="Yield per cut" value={data.bom.yieldPerCut} />
                      <DetailRow label="Sq m per cut" value={data.bom.squareMetersPerCut} />
                      <DetailRow label="Materials" value={data.bom.materials.length} />
                      <DetailRow label="Parts" value={data.bom.parts.length} />
                    </>
                  ) : (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                      No active BOM matched this work order. Operators can lose material validation protection until this is corrected.
                    </div>
                  )}
                </section>

                <Separator />

                <section className="space-y-3">
                  <h4 className="flex items-center gap-2 font-semibold">
                    <ScanLine className="h-4 w-4" />
                    Execution
                  </h4>
                  <DetailRow label="Assigned to" value={data.queueItem.assignedTo} />
                  <DetailRow label="Started" value={formatDate(data.queueItem.startedAt)} />
                  <DetailRow label="Completed" value={formatDate(data.queueItem.completedAt)} />
                  <DetailRow label="Completed by" value={data.queueItem.completedBy} />
                  <DetailRow label="Completion notes" value={data.queueItem.completionNotes} />
                </section>

                <Separator />

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Built Packets</h4>
                    <div className="flex gap-2">
                      <Badge variant="outline">{data.traceSummary.builtPacketCount} built</Badge>
                      <Badge variant="outline">{data.traceSummary.fabricSourceCount} sources</Badge>
                    </div>
                  </div>
                  {data.builtPackets.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No completed packet records yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {data.builtPackets.map((packet) => (
                        <div key={packet.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-mono text-xs">{packet.barcode}</div>
                              <div className="text-xs text-muted-foreground">Built {formatDate(packet.buildDate)} by {packet.createdBy || "-"}</div>
                            </div>
                            <Badge variant={statusVariant(packet.status)}>{packet.status}</Badge>
                          </div>
                          {packet.fabricSources.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {packet.fabricSources.map((source) => (
                                <div key={source.id} className="rounded bg-muted/50 p-2 text-xs">
                                  <div className="font-medium">{source.fabricType || "Fabric source"}</div>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                                    <span>ICN: {source.internalControlNumber || "-"}</span>
                                    <span>Roll: {source.rollNumber || "-"}</span>
                                    <span>Lot: {source.lotNumber || "-"}</span>
                                    <span>Batch: {source.batchNumber || "-"}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

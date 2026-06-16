import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Truck, Package, CalendarClock, Plus, DollarSign } from 'lucide-react';

type SerializedUnit = {
  id: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  poNumber: string;
  poId: number;
  poItemId: number;
  sequenceNumber: number;
  customerName: string;
};

type BillingAllocation = {
  id: string;
  po_item_id: number;
  part_number: string;
  bucket_label: string;
  description: string | null;
  customer_po_line: string | null;
  quantity_authorized: number;
  unit_price: string;
  assigned_quantity: number;
};

type PoItem = {
  id: number;
  part_number: string;
  part_name: string;
  quantity: number;
  unit_price: number | null;
};

interface ShipmentSummaryModalProps {
  serials: SerializedUnit[];
  onConfirm: (assignments: { serializedItemId: string; allocationId: string }[]) => void;
  onCancel: () => void;
}

export default function ShipmentSummaryModal({
  serials,
  onConfirm,
  onCancel,
}: ShipmentSummaryModalProps) {
  const customer = serials[0]?.customerName ?? '-';
  const poNumber = serials[0]?.poNumber ?? '-';
  const poId = serials[0]?.poId;
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [newBucket, setNewBucket] = useState({
    poItemId: serials[0]?.poItemId ? String(serials[0].poItemId) : '',
    bucketLabel: '',
    description: '',
    customerPoLine: '',
    quantityAuthorized: String(serials.length || 1),
    unitPrice: '',
    notes: '',
  });

  const { data: allocationData, isLoading: loadingAllocations } = useQuery<{ poItems: PoItem[]; allocations: BillingAllocation[] }>({
    queryKey: ['/api/p2/billing-allocations', poId],
    queryFn: async () => apiRequest(`/api/p2/billing-allocations?poId=${encodeURIComponent(String(poId))}`),
    enabled: !!poId,
  });

  const poItems = allocationData?.poItems ?? [];
  const allocations = allocationData?.allocations ?? [];
  const serialPoItems = useMemo(() => {
    const byPoItemId = new Map<number, PoItem>();
    for (const serial of serials) {
      if (!serial.poItemId || byPoItemId.has(serial.poItemId)) continue;
      byPoItemId.set(serial.poItemId, {
        id: serial.poItemId,
        part_number: serial.partNumber,
        part_name: serial.partName,
        quantity: serials.filter((candidate) => candidate.poItemId === serial.poItemId).length,
        unit_price: null,
      });
    }
    return Array.from(byPoItemId.values()).sort((a, b) => a.id - b.id);
  }, [serials]);
  const selectablePoItems = poItems.length > 0 ? poItems : serialPoItems;

  useEffect(() => {
    if (newBucket.poItemId || selectablePoItems.length === 0) return;
    setNewBucket((prev) => ({ ...prev, poItemId: String(selectablePoItems[0].id) }));
  }, [newBucket.poItemId, selectablePoItems]);

  useEffect(() => {
    if (!allocations.length || !serials.length) return;
    setAssignments((current) => {
      const next = { ...current };
      const remainingByAllocation = new Map(
        allocations.map((allocation) => [
          allocation.id,
          Math.max(0, Number(allocation.quantity_authorized) - Number(allocation.assigned_quantity || 0)),
        ]),
      );

      for (const serial of [...serials].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
        if (next[serial.id]) continue;
        const allocation = allocations.find((candidate) =>
          candidate.po_item_id === serial.poItemId &&
          (remainingByAllocation.get(candidate.id) ?? 0) > 0
        );
        if (!allocation) continue;
        next[serial.id] = allocation.id;
        remainingByAllocation.set(allocation.id, (remainingByAllocation.get(allocation.id) ?? 0) - 1);
      }

      return next;
    });
  }, [allocations, serials]);

  const createAllocationMutation = useMutation({
    mutationFn: () => apiRequest('/api/p2/billing-allocations', {
      method: 'POST',
      body: {
        poId,
        poItemId: Number(newBucket.poItemId),
        bucketLabel: newBucket.bucketLabel,
        description: newBucket.description,
        customerPoLine: newBucket.customerPoLine,
        quantityAuthorized: Number(newBucket.quantityAuthorized),
        unitPrice: Number(newBucket.unitPrice),
        notes: newBucket.notes,
      },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/billing-allocations', poId] });
      setNewBucket((prev) => ({
        ...prev,
        bucketLabel: '',
        description: '',
        customerPoLine: '',
        quantityAuthorized: '1',
        unitPrice: '',
        notes: '',
      }));
    },
  });

  const grouped: Record<string, SerializedUnit[]> = {};
  for (const serial of serials) {
    if (!grouped[serial.partNumber]) grouped[serial.partNumber] = [];
    grouped[serial.partNumber].push(serial);
  }

  const missingAssignments = serials.filter((serial) => !assignments[serial.id]);
  const confirmAssignments = serials.map((serial) => ({
    serializedItemId: serial.id,
    allocationId: assignments[serial.id],
  }));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-4xl max-h-[86vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Shipment Summary
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-muted/40 rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Customer</div>
            <div className="font-medium truncate">{customer}</div>
          </div>
          <div className="bg-muted/40 rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-0.5">PO Number</div>
            <div className="font-medium">{poNumber}</div>
          </div>
          <div className="bg-muted/40 rounded-md p-3">
            <div className="text-xs text-muted-foreground mb-0.5">Total Units</div>
            <div className="font-bold text-blue-600">{serials.length}</div>
          </div>
        </div>

        <Separator />

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <div className="font-medium text-sm">Billing Bucket / CLIN Assignment</div>
              {missingAssignments.length > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  {missingAssignments.length} unassigned
                </Badge>
              )}
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <div className="grid grid-cols-6 gap-2">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">PO Item</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={newBucket.poItemId}
                    onChange={(e) => setNewBucket((prev) => ({ ...prev, poItemId: e.target.value }))}
                  >
                    {selectablePoItems.map((item) => (
                      <option key={item.id} value={String(item.id)}>
                        {item.part_number} - {item.part_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CLIN/Bucket</Label>
                  <Input
                    className="h-9"
                    value={newBucket.bucketLabel}
                    onChange={(e) => setNewBucket((prev) => ({ ...prev, bucketLabel: e.target.value }))}
                    placeholder="CLIN 0001"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min="1"
                    value={newBucket.quantityAuthorized}
                    onChange={(e) => setNewBucket((prev) => ({ ...prev, quantityAuthorized: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unit Price</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newBucket.unitPrice}
                    onChange={(e) => setNewBucket((prev) => ({ ...prev, unitPrice: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">PO Line Ref</Label>
                  <Input
                    className="h-9"
                    value={newBucket.customerPoLine}
                    onChange={(e) => setNewBucket((prev) => ({ ...prev, customerPoLine: e.target.value }))}
                    placeholder="optional"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  className="h-9"
                  value={newBucket.description}
                  onChange={(e) => setNewBucket((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Bucket description or pricing note"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!newBucket.poItemId || !newBucket.bucketLabel.trim() || !newBucket.unitPrice || createAllocationMutation.isPending}
                  onClick={() => createAllocationMutation.mutate()}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bucket
                </Button>
              </div>
              {createAllocationMutation.isError && (
                <p className="text-xs text-red-600">{(createAllocationMutation.error as any)?.message || 'Failed to add bucket'}</p>
              )}
            </div>

            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-xs">Serial</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Part</th>
                    <th className="text-left px-3 py-2 font-medium text-xs">Billing Bucket</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {serials.map((serial) => {
                    const matchingAllocations = allocations.filter((allocation) => allocation.po_item_id === serial.poItemId);
                    return (
                      <tr key={serial.id}>
                        <td className="px-3 py-2 font-mono text-xs">{serial.serialNumber}</td>
                        <td className="px-3 py-2 text-xs">
                          <div className="font-mono">{serial.partNumber}</div>
                          <div className="text-muted-foreground">{serial.partName}</div>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={assignments[serial.id] || ''}
                            onChange={(e) => setAssignments((prev) => ({ ...prev, [serial.id]: e.target.value }))}
                            disabled={loadingAllocations}
                          >
                            <option value="">Select bucket...</option>
                            {matchingAllocations.map((allocation) => (
                              <option key={allocation.id} value={allocation.id}>
                                {allocation.bucket_label} - ${Number(allocation.unit_price).toFixed(2)}
                                {' '}({allocation.assigned_quantity}/{allocation.quantity_authorized} assigned)
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Separator />

          {Object.entries(grouped).map(([partNumber, group]) => (
            <div key={partNumber} className="border rounded-md p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-mono text-sm font-semibold">{partNumber}</span>
                    <Badge variant="secondary" className="text-xs">{group.length} unit{group.length !== 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 ml-6">{group[0].partName}</div>
                </div>
              </div>
              <div className="ml-6 flex flex-wrap gap-1.5">
                {group.map((serial) => (
                  <span
                    key={serial.id}
                    className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border"
                  >
                    {serial.serialNumber}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
          Lot number will be generated upon confirmation (format: YYMMDD-XX)
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={missingAssignments.length > 0}
            onClick={() => onConfirm(confirmAssignments)}
          >
            <Truck className="h-4 w-4 mr-2" />
            Confirm Shipment ({serials.length} unit{serials.length !== 1 ? 's' : ''})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

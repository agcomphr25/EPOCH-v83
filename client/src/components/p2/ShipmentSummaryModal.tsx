import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { apiRequest } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';
import { Truck, Package, CalendarClock, Receipt, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

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
  sku?: string | null;
};

type BillingBucketOverride = {
  poItemId: number;
  bucketLabel: string;
  description?: string;
  customerPoLine?: string;
  quantityAuthorized?: number;
  unitPrice?: number;
  serialIds?: string[];
};

type BucketOverrideDraft = {
  enabled: boolean;
  bucketLabel: string;
  description: string;
  customerPoLine: string;
  quantityAuthorized: string;
  unitPrice: string;
};

type PoItem = {
  id: number;
  poId?: number;
  partNumber: string;
  partName: string | null;
  quantity: number | null;
  unitPrice: string | number | null;
};

interface ShipmentSummaryModalProps {
  serials: SerializedUnit[];
  onConfirm: (
    assignments?: { serializedItemId: string; allocationId: string }[],
    bucketOverrides?: BillingBucketOverride[],
  ) => void;
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
  const [bucketMode, setBucketMode] = useState<'combined' | 'split'>('combined');
  const [selectedPoItemId, setSelectedPoItemId] = useState<number | null>(null);
  const [bucketOverrides, setBucketOverrides] = useState<Record<number, BucketOverrideDraft>>({});

  const { data: poItems = [] } = useQuery<PoItem[]>({
    queryKey: ['/api/p2-purchase-order-items', poId],
    queryFn: async () => apiRequest(`/api/p2-purchase-order-items/${encodeURIComponent(String(poId))}`),
    enabled: !!poId,
  });

  const poItemGroups = useMemo(() => {
    const groups = new Map<number, SerializedUnit[]>();
    for (const serial of serials) {
      const existing = groups.get(serial.poItemId) ?? [];
      groups.set(serial.poItemId, [...existing, serial]);
    }

    return Array.from(groups.entries())
      .map(([poItemId, units]) => ({
        poItemId,
        units: units.sort((a, b) => a.sequenceNumber - b.sequenceNumber),
        partNumber: units[0]?.partNumber ?? '',
        itemName: units.find((unit) => unit.sku)?.sku || units[0]?.partNumber || '',
        partName: units[0]?.partName ?? '',
      }))
      .sort((a, b) => a.poItemId - b.poItemId);
  }, [serials]);

  const poItemOptions = useMemo(() => {
    const groupByPoItemId = new Map(poItemGroups.map((group) => [group.poItemId, group]));
    const fetchedOptions = poItems.map((item) => {
      const group = groupByPoItemId.get(item.id);
      return {
        poItemId: item.id,
        partNumber: item.partNumber,
        itemName: item.partNumber || `PO Item #${item.id}`,
        partName: item.partName ?? group?.partName ?? '',
        quantity: Number(item.quantity) || group?.units.length || 0,
        unitPrice: Number(item.unitPrice) || 0,
        units: group?.units ?? [],
      };
    });

    const fetchedIds = new Set(fetchedOptions.map((option) => option.poItemId));
    const serialOnlyOptions = poItemGroups
      .filter((group) => !fetchedIds.has(group.poItemId))
      .map((group) => ({
        poItemId: group.poItemId,
        partNumber: group.partNumber,
        itemName: group.itemName || `PO Item #${group.poItemId}`,
        partName: group.partName,
        quantity: group.units.length,
        unitPrice: 0,
        units: group.units,
      }));

    return [...fetchedOptions, ...serialOnlyOptions].sort((a, b) => a.poItemId - b.poItemId);
  }, [poItems, poItemGroups]);

  const effectiveSelectedPoItemId = selectedPoItemId ?? poItemOptions[0]?.poItemId ?? poItemGroups[0]?.poItemId ?? null;
  const selectedPoItemOption =
    poItemOptions.find((option) => option.poItemId === effectiveSelectedPoItemId) ??
    poItemOptions[0] ??
    (poItemGroups[0]
      ? {
          poItemId: poItemGroups[0].poItemId,
          partNumber: poItemGroups[0].partNumber,
          itemName: poItemGroups[0].itemName || `PO Item #${poItemGroups[0].poItemId}`,
          partName: poItemGroups[0].partName,
          quantity: poItemGroups[0].units.length,
          unitPrice: 0,
          units: poItemGroups[0].units,
        }
      : null);

  const enabledBucketOverrides: BillingBucketOverride[] = poItemGroups.flatMap((group) => {
    const override = bucketOverrides[group.poItemId];
    if (!override?.enabled || !override.bucketLabel.trim()) return [];
    return [{
      poItemId: group.poItemId,
      bucketLabel: override.bucketLabel.trim(),
      description: override.description.trim() || undefined,
      customerPoLine: override.customerPoLine.trim() || undefined,
      quantityAuthorized: Number(override.quantityAuthorized) || group.units.length,
      unitPrice: Number(override.unitPrice) || 0,
      serialIds: group.units.map((serial) => serial.id),
    }];
  });

  const shipmentBucketOverrides: BillingBucketOverride[] =
    bucketMode === 'combined' && selectedPoItemOption
      ? [{
          poItemId: selectedPoItemOption.poItemId,
          bucketLabel: selectedPoItemOption.itemName || `PO Item #${selectedPoItemOption.poItemId}`,
          description: selectedPoItemOption.partName || undefined,
          customerPoLine: String(selectedPoItemOption.poItemId),
          quantityAuthorized: serials.length,
          unitPrice: selectedPoItemOption.unitPrice || undefined,
          serialIds: serials.map((serial) => serial.id),
        }]
      : enabledBucketOverrides;

  const toggleBucketOverride = (group: (typeof poItemGroups)[number]) => {
    setBucketOverrides((prev) => {
      const current = prev[group.poItemId];
      if (current?.enabled) {
        return { ...prev, [group.poItemId]: { ...current, enabled: false } };
      }

      return {
        ...prev,
        [group.poItemId]: {
          enabled: true,
          bucketLabel: current?.bucketLabel || `Pending revised PO item #${group.poItemId}`,
          description: current?.description || group.partName,
          customerPoLine: current?.customerPoLine || '',
          quantityAuthorized: current?.quantityAuthorized || String(group.units.length),
          unitPrice: current?.unitPrice || '',
        },
      };
    });
  };

  const updateBucketOverride = (
    poItemId: number,
    field: keyof Omit<BucketOverrideDraft, 'enabled'>,
    value: string,
  ) => {
    setBucketOverrides((prev) => ({
      ...prev,
      [poItemId]: {
        enabled: true,
        bucketLabel: '',
        description: '',
        customerPoLine: '',
        quantityAuthorized: '',
        unitPrice: '',
        ...prev[poItemId],
        [field]: value,
      },
    }));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-3xl max-h-[84vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Shipment Summary
          </DialogTitle>
          <DialogDescription>
            Confirm the PO line item bucket for the selected serialized units.
          </DialogDescription>
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

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Bucket / CLIN Handling</div>
          <RadioGroup
            value={bucketMode}
            onValueChange={(value) => setBucketMode(value as 'combined' | 'split')}
            className="grid gap-2"
          >
            <Label
              htmlFor="ship-bucket-combined"
              className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40"
            >
              <RadioGroupItem id="ship-bucket-combined" value="combined" className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Process all selected units under one bucket / CLIN</span>
                <span className="block text-xs text-muted-foreground">
                  Default. Select the PO item/SKU bucket below.
                </span>
              </span>
            </Label>
            {poItemGroups.length > 1 && (
              <Label
                htmlFor="ship-bucket-split"
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40"
              >
                <RadioGroupItem id="ship-bucket-split" value="split" className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">Break out separately by PO item</span>
                  <span className="block text-xs text-muted-foreground">
                    Creates separate bucket / CLIN assignments by PO item.
                  </span>
                </span>
              </Label>
            )}
          </RadioGroup>
        </div>

        {bucketMode === 'combined' && (
          <>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">PO Item Bucket / CLIN</div>
              <RadioGroup
                value={effectiveSelectedPoItemId ? String(effectiveSelectedPoItemId) : ''}
                onValueChange={(value) => setSelectedPoItemId(Number(value))}
                className="space-y-2"
              >
                {poItemOptions.map((group) => (
                  <Label
                    key={group.poItemId}
                    htmlFor={`ship-po-item-${group.poItemId}`}
                    className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40"
                  >
                    <RadioGroupItem
                      id={`ship-po-item-${group.poItemId}`}
                      value={String(group.poItemId)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{group.itemName || `PO Item #${group.poItemId}`}</span>
                        <Badge variant="secondary" className="text-xs">
                          {group.units.length > 0 ? `${group.units.length} selected` : `${group.quantity} on PO`}
                        </Badge>
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">
                        PO item {group.poItemId} - {group.partName}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <Separator />
          </>
        )}

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {poItemGroups.map((group) => (
            <div key={group.poItemId} className="border rounded-md p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-xs text-muted-foreground">Bucket / CLIN</span>
                    <span className="font-mono text-sm font-semibold">{group.itemName || `PO Item #${group.poItemId}`}</span>
                    <Badge variant="secondary" className="text-xs">
                      {group.units.length} unit{group.units.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono text-foreground">{group.partNumber}</span>
                    <span className="truncate">{group.partName}</span>
                  </div>
                </div>
                {bucketMode === 'split' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => toggleBucketOverride(group)}
                  >
                    {bucketOverrides[group.poItemId]?.enabled ? (
                      <><X className="h-3.5 w-3.5 mr-1" />Use PO Line</>
                    ) : (
                      <><Plus className="h-3.5 w-3.5 mr-1" />Add Bucket</>
                    )}
                  </Button>
                )}
              </div>

              {bucketOverrides[group.poItemId]?.enabled && (
                <div className="grid grid-cols-6 gap-2 rounded-md border bg-muted/20 p-3">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Bucket</Label>
                    <Input
                      className="h-9"
                      value={bucketOverrides[group.poItemId]?.bucketLabel || ''}
                      onChange={(e) => updateBucketOverride(group.poItemId, 'bucketLabel', e.target.value)}
                      placeholder="Pending revised PO item"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Description</Label>
                    <Input
                      className="h-9"
                      value={bucketOverrides[group.poItemId]?.description || ''}
                      onChange={(e) => updateBucketOverride(group.poItemId, 'description', e.target.value)}
                      placeholder={group.partName}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      className="h-9"
                      type="number"
                      min="1"
                      value={bucketOverrides[group.poItemId]?.quantityAuthorized || ''}
                      onChange={(e) => updateBucketOverride(group.poItemId, 'quantityAuthorized', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit Price</Label>
                    <Input
                      className="h-9"
                      type="number"
                      min="0"
                      step="0.01"
                      value={bucketOverrides[group.poItemId]?.unitPrice || ''}
                      onChange={(e) => updateBucketOverride(group.poItemId, 'unitPrice', e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1 col-span-6">
                    <Label className="text-xs">Revised PO Line Reference</Label>
                    <Input
                      className="h-9"
                      value={bucketOverrides[group.poItemId]?.customerPoLine || ''}
                      onChange={(e) => updateBucketOverride(group.poItemId, 'customerPoLine', e.target.value)}
                      placeholder="optional"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {group.units.map((serial) => (
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
          Default shipments use one bucket / CLIN; choose breakout to assign separate PO item buckets.
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={serials.length === 0}
            onClick={() => onConfirm([], shipmentBucketOverrides)}
          >
            <Truck className="h-4 w-4 mr-2" />
            Confirm Shipment ({serials.length} unit{serials.length !== 1 ? 's' : ''})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

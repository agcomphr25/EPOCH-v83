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
import { Truck, Package, CalendarClock } from 'lucide-react';

type SerializedUnit = {
  id: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  poNumber: string;
  customerName: string;
};

interface ShipmentSummaryModalProps {
  serials: SerializedUnit[];
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ShipmentSummaryModal({
  serials,
  onConfirm,
  onCancel,
}: ShipmentSummaryModalProps) {
  const customer = serials[0]?.customerName ?? '—';
  const poNumber = serials[0]?.poNumber ?? '—';

  const grouped: Record<string, SerializedUnit[]> = {};
  for (const s of serials) {
    if (!grouped[s.partNumber]) grouped[s.partNumber] = [];
    grouped[s.partNumber].push(s);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-blue-600" />
            Shipment Summary
          </DialogTitle>
        </DialogHeader>

        {/* Meta row */}
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

        {/* Line items */}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
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
                {group.map((s) => (
                  <span
                    key={s.id}
                    className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border"
                  >
                    {s.serialNumber}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Lot preview notice */}
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
            onClick={onConfirm}
          >
            <Truck className="h-4 w-4 mr-2" />
            Confirm Shipment ({serials.length} unit{serials.length !== 1 ? 's' : ''})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';

interface OverrideShippingDataModalProps {
  lotId: string;
  currentLotNumber: string;
  currentShippedAt: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export default function OverrideShippingDataModal({
  lotId,
  currentLotNumber,
  currentShippedAt,
  onSuccess,
  onClose,
}: OverrideShippingDataModalProps) {
  const [lotNumber, setLotNumber] = useState(currentLotNumber);
  const [shippedDate, setShippedDate] = useState(
    currentShippedAt ? new Date(currentShippedAt).toISOString().slice(0, 10) : ''
  );
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges =
    lotNumber !== currentLotNumber ||
    shippedDate !== (currentShippedAt ? new Date(currentShippedAt).toISOString().slice(0, 10) : '');

  async function handleConfirm() {
    if (!reason.trim()) {
      setError('A reason is required for compliance.');
      return;
    }
    if (!hasChanges) {
      setError('No changes detected. Modify at least one field before submitting.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = { reason: reason.trim() };
      if (lotNumber !== currentLotNumber) body.lot_number = lotNumber;
      if (shippedDate !== (currentShippedAt ? new Date(currentShippedAt).toISOString().slice(0, 10) : '')) {
        body.shipped_date = shippedDate;
      }

      const res = await fetch(`/api/p2/lots/${lotId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Override request failed');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5" />
            Override Shipping Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              This action is permanently logged for CMMC/DCAA compliance. The original records are never deleted.
              All overrides are visible to authorized personnel.
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-lot-number">Lot Number</Label>
            <Input
              id="override-lot-number"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="e.g. 260318-01"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-shipped-date">Shipped Date</Label>
            <Input
              id="override-shipped-date"
              type="date"
              value={shippedDate}
              onChange={(e) => setShippedDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this correction is necessary..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting || !reason.trim() || !hasChanges}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <ShieldAlert className="h-4 w-4 mr-1" />
            )}
            Confirm Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CheckCircle, Edit3 } from 'lucide-react';

interface AddressValidationError {
  error: string;
  message: string;
  validationStatus: string;
  dpvMatchCode?: string;
  suggestedAddress?: {
    street1?: string;
    street?: string;
    city: string;
    state: string;
    postalCode?: string;
    zipCode?: string;
  };
  originalAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
}

interface AddressValidationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  validationError: AddressValidationError | null;
  onUseSuggested: (address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  }) => void;
  onOverride: (reason: string) => void;
  onEdit: () => void;
}

export default function AddressValidationModal({
  open,
  onOpenChange,
  validationError,
  onUseSuggested,
  onOverride,
  onEdit,
}: AddressValidationModalProps) {
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverrideInput, setShowOverrideInput] = useState(false);

  if (!validationError) return null;

  const suggested = validationError.suggestedAddress;
  const original = validationError.originalAddress;

  const hasSuggestion = suggested && (suggested.street1 || suggested.street);

  const suggestedStreet = suggested?.street1 || suggested?.street || '';
  const suggestedZip = suggested?.postalCode || suggested?.zipCode || '';

  const handleOverrideSubmit = () => {
    if (overrideReason.trim().length < 5) return;
    onOverride(overrideReason.trim());
    setOverrideReason('');
    setShowOverrideInput(false);
  };

  const handleClose = () => {
    setOverrideReason('');
    setShowOverrideInput(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Address Could Not Be Verified
          </DialogTitle>
          <DialogDescription>
            {validationError.message}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-3 bg-gray-50">
            <p className="text-xs font-medium text-gray-500 mb-1">You entered:</p>
            <p className="text-sm">
              {original.street}<br />
              {original.city}, {original.state} {original.zipCode}
            </p>
          </div>

          {hasSuggestion && (
            <div className="rounded-md border p-3 bg-green-50 border-green-200">
              <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> Suggested correction:
              </p>
              <p className="text-sm">
                {suggestedStreet}<br />
                {suggested!.city}, {suggested!.state} {suggestedZip}
              </p>
            </div>
          )}

          {showOverrideInput && (
            <div className="space-y-2">
              <Label htmlFor="override-reason" className="text-sm font-medium">
                Why are you overriding validation?
              </Label>
              <Textarea
                id="override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Customer confirmed address is correct, new construction not in USPS database yet..."
                rows={3}
              />
              <p className="text-xs text-gray-500">
                Minimum 5 characters required.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {hasSuggestion && (
            <Button
              variant="default"
              onClick={() => {
                onUseSuggested({
                  street: suggestedStreet,
                  city: suggested!.city,
                  state: suggested!.state,
                  zipCode: suggestedZip,
                });
                handleClose();
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Use Suggested
            </Button>
          )}

          <Button variant="outline" onClick={() => { onEdit(); handleClose(); }}>
            <Edit3 className="h-4 w-4 mr-1" />
            Edit Address
          </Button>

          {!showOverrideInput ? (
            <Button
              variant="ghost"
              className="text-amber-600 hover:text-amber-700"
              onClick={() => setShowOverrideInput(true)}
            >
              Override
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={overrideReason.trim().length < 5}
              onClick={handleOverrideSubmit}
            >
              Save with Override
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

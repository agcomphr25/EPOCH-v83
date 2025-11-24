import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface TraceabilityConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedFields: string[]) => void;
  initialFields?: string[];
}

const TRACEABILITY_OPTIONS = [
  { id: 'lot', label: 'Lot #' },
  { id: 'batch', label: 'Batch #' },
  { id: 'expDate', label: 'Exp Date' },
  { id: 'part', label: 'Part #' },
];

export default function TraceabilityConfigModal({
  isOpen,
  onClose,
  onSave,
  initialFields = [],
}: TraceabilityConfigModalProps) {
  const [selectedFields, setSelectedFields] = useState<string[]>(initialFields);

  useEffect(() => {
    setSelectedFields(initialFields);
  }, [initialFields]);

  const handleToggle = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((f) => f !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleSave = () => {
    onSave(selectedFields);
    onClose();
  };

  const handleCancel = () => {
    setSelectedFields(initialFields);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Configure Traceability Requirements</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select which traceability fields are required for this inventory item:
          </p>
          
          <div className="space-y-4">
            {TRACEABILITY_OPTIONS.map((option) => (
              <div key={option.id} className="flex items-center space-x-3">
                <Checkbox
                  id={`traceability-${option.id}`}
                  checked={selectedFields.includes(option.id)}
                  onCheckedChange={() => handleToggle(option.id)}
                  data-testid={`checkbox-traceability-${option.id}`}
                />
                <Label
                  htmlFor={`traceability-${option.id}`}
                  className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            {selectedFields.length === 0 
              ? "No fields selected. Traceability will be marked as required but no specific fields will be enforced."
              : `${selectedFields.length} field${selectedFields.length !== 1 ? 's' : ''} selected.`
            }
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            data-testid="button-cancel-traceability"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            data-testid="button-save-traceability"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

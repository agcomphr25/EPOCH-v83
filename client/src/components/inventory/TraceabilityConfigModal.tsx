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
import { Separator } from '@/components/ui/separator';

interface TraceabilityConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selectedFields: string[]) => void;
  initialFields?: string[];
}

const TRACEABILITY_OPTIONS = [
  { id: 'supplierPartNumber', label: 'Supplier Part Number', category: 'supplier' },
  { id: 'batchLotNumber', label: 'Batch/Lot #', category: 'supplier' },
  { id: 'rollNumber', label: 'Roll Number', category: 'manufacturing' },
  { id: 'manufactureDate', label: 'Manufacture Date', category: 'manufacturing' },
  { id: 'expirationDate', label: 'Expiration Date', category: 'dates' },
  { id: 'receivedDate', label: 'Received Date', category: 'dates' },
  { id: 'aluminumHeat', label: 'Aluminum Heat #', category: 'material' },
];

export default function TraceabilityConfigModal({
  isOpen,
  onClose,
  onSave,
  initialFields = [],
}: TraceabilityConfigModalProps) {
  const validIds = TRACEABILITY_OPTIONS.map((o) => o.id);
  const sanitize = (fields: string[]) => fields.filter((f) => validIds.includes(f));

  const [selectedFields, setSelectedFields] = useState<string[]>(() => sanitize(initialFields));

  useEffect(() => {
    setSelectedFields(sanitize(initialFields));
  }, [initialFields]);

  const handleToggle = (fieldId: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((f) => f !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleSelectAll = () => {
    if (selectedFields.length === TRACEABILITY_OPTIONS.length) {
      setSelectedFields([]);
    } else {
      setSelectedFields(TRACEABILITY_OPTIONS.map((o) => o.id));
    }
  };

  const handleSave = () => {
    onSave(selectedFields);
    onClose();
  };

  const handleCancel = () => {
    setSelectedFields(initialFields);
    onClose();
  };

  const allSelected = selectedFields.length === TRACEABILITY_OPTIONS.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Configure Traceability Requirements</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select which traceability fields are required for this inventory item:
          </p>

          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="traceability-select-all"
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                data-testid="checkbox-traceability-select-all"
              />
              <Label
                htmlFor="traceability-select-all"
                className="cursor-pointer text-sm font-semibold"
              >
                Select All
              </Label>
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedFields.length} of {TRACEABILITY_OPTIONS.length} selected
            </span>
          </div>

          <Separator className="mb-4" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TRACEABILITY_OPTIONS.map((option) => (
              <div 
                key={option.id} 
                className={`flex items-center space-x-3 p-2 rounded-md border transition-colors ${
                  selectedFields.includes(option.id) 
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800' 
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'
                }`}
              >
                <Checkbox
                  id={`traceability-${option.id}`}
                  checked={selectedFields.includes(option.id)}
                  onCheckedChange={() => handleToggle(option.id)}
                  data-testid={`checkbox-traceability-${option.id}`}
                />
                <Label
                  htmlFor={`traceability-${option.id}`}
                  className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            {selectedFields.length === 0 
              ? "No fields selected. Traceability will be marked as required but no specific fields will be enforced."
              : `${selectedFields.length} field${selectedFields.length !== 1 ? 's' : ''} will be required during receiving.`
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

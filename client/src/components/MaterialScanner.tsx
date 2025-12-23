import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Scan,
  Package,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Info,
} from 'lucide-react';

interface MaterialLot {
  id: string;
  internalControlNumber: string;
  materialPartNumber: string;
  materialName: string;
  supplier: string;
  supplierLotNumber?: string;
  remainingQty: string;
  unitOfMeasure: string;
  expirationDate?: string;
  status: string;
  maxOutTimeMinutes?: number;
  totalOutTimeMinutes?: number;
  currentlyOutOfStorage?: boolean;
  storageLocation?: string;
}

interface ValidationResult {
  valid: boolean;
  lot: MaterialLot;
  warnings: string[];
  errors: string[];
  requiresOverride: boolean;
}

interface MaterialScannerProps {
  travelerId: string;
  travelerStepId: string;
  requiredPartNumber?: string;
  requiredQty?: number;
  onMaterialConsumed?: (consumption: any) => void;
  onClose?: () => void;
}

export default function MaterialScanner({
  travelerId,
  travelerStepId,
  requiredPartNumber,
  requiredQty,
  onMaterialConsumed,
  onClose,
}: MaterialScannerProps) {
  const [scanInput, setScanInput] = useState('');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [qtyToUse, setQtyToUse] = useState('');
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideApprovedBy, setOverrideApprovedBy] = useState('');
  const queryClient = useQueryClient();

  const validateMutation = useMutation({
    mutationFn: async (icn: string) => {
      return apiRequest(`/api/material-lots/validate/${encodeURIComponent(icn)}`, {
        method: 'POST',
        body: JSON.stringify({
          requiredPartNumber,
          requiredQty: requiredQty ? requiredQty.toString() : undefined,
        }),
      });
    },
    onSuccess: (result: ValidationResult) => {
      setValidationResult(result);
      if (requiredQty) {
        setQtyToUse(requiredQty.toString());
      } else {
        setQtyToUse(result.lot.remainingQty);
      }
      if (result.errors.length > 0) {
        toast.error(`Material validation failed: ${result.errors.join(', ')}`);
      } else if (result.warnings.length > 0) {
        toast(result.warnings.join('. '), { icon: '⚠️' });
      } else {
        toast.success('Material validated successfully');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to validate material');
      setValidationResult(null);
    },
  });

  const consumeMutation = useMutation({
    mutationFn: async (data: {
      qtyUsed: string;
      overrideReason?: string;
      overrideApprovedBy?: string;
    }) => {
      if (!validationResult?.lot) throw new Error('No material selected');
      return apiRequest('/api/material-lots/consume', {
        method: 'POST',
        body: JSON.stringify({
          materialLotId: validationResult.lot.id,
          travelerId,
          travelerStepId,
          internalControlNumber: validationResult.lot.internalControlNumber,
          qtyUsed: data.qtyUsed,
          unitOfMeasure: validationResult.lot.unitOfMeasure,
          scannedBy: 'Current User',
          wasOverride: !!data.overrideReason,
          overrideReason: data.overrideReason,
          overrideApprovedBy: data.overrideApprovedBy,
        }),
      });
    },
    onSuccess: (result) => {
      toast.success('Material consumption recorded');
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      onMaterialConsumed?.(result);
      resetScanner();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to record consumption');
    },
  });

  const handleScan = () => {
    const icn = scanInput.trim();
    if (!icn) {
      toast.error('Please enter or scan an ICN');
      return;
    }
    validateMutation.mutate(icn);
  };

  const handleConsume = () => {
    if (!qtyToUse || parseFloat(qtyToUse) <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    if (validationResult?.requiresOverride && !overrideReason) {
      setShowOverrideDialog(true);
      return;
    }

    consumeMutation.mutate({
      qtyUsed: qtyToUse,
      overrideReason: overrideReason || undefined,
      overrideApprovedBy: overrideApprovedBy || undefined,
    });
  };

  const handleOverrideConfirm = () => {
    if (!overrideReason || !overrideApprovedBy) {
      toast.error('Override reason and approver are required');
      return;
    }
    setShowOverrideDialog(false);
    consumeMutation.mutate({
      qtyUsed: qtyToUse,
      overrideReason,
      overrideApprovedBy,
    });
  };

  const resetScanner = () => {
    setScanInput('');
    setValidationResult(null);
    setQtyToUse('');
    setOverrideReason('');
    setOverrideApprovedBy('');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACCEPTED':
      case 'ISSUED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'QUARANTINE':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'REJECTED':
      case 'EXPIRED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Package className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          Material Traceability Scanner
        </CardTitle>
        <CardDescription>
          Scan material ICN barcode to record consumption and maintain AS9100 traceability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              placeholder="Scan or enter ICN (e.g., ICN-MAT-20241223-000001)"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScan()}
              autoFocus
              data-testid="input-icn-scan"
            />
          </div>
          <Button
            onClick={handleScan}
            disabled={validateMutation.isPending}
            data-testid="button-validate-scan"
          >
            {validateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Scan className="h-4 w-4" />
            )}
          </Button>
        </div>

        {requiredPartNumber && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Required Material</AlertTitle>
            <AlertDescription>
              Part Number: <span className="font-mono font-medium">{requiredPartNumber}</span>
              {requiredQty && ` | Quantity: ${requiredQty}`}
            </AlertDescription>
          </Alert>
        )}

        {validationResult && (
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium text-lg">
                  {validationResult.lot.internalControlNumber}
                </span>
                <Badge variant={validationResult.valid ? 'default' : 'destructive'}>
                  {getStatusIcon(validationResult.lot.status)}
                  <span className="ml-1">{validationResult.lot.status}</span>
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Part #:</span>
                  <span className="ml-2 font-medium">{validationResult.lot.materialPartNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Material:</span>
                  <span className="ml-2">{validationResult.lot.materialName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="ml-2">{validationResult.lot.supplier}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Lot #:</span>
                  <span className="ml-2">{validationResult.lot.supplierLotNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Available:</span>
                  <span className="ml-2 font-medium">
                    {validationResult.lot.remainingQty} {validationResult.lot.unitOfMeasure}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Location:</span>
                  <span className="ml-2">{validationResult.lot.storageLocation || 'N/A'}</span>
                </div>
                {validationResult.lot.expirationDate && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Expires:</span>
                    <span className="ml-2">
                      {format(new Date(validationResult.lot.expirationDate), 'MM/dd/yyyy')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {validationResult.warnings.length > 0 && (
              <Alert variant="default" className="border-amber-500 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Warnings</AlertTitle>
                <AlertDescription className="text-amber-700">
                  <ul className="list-disc list-inside">
                    {validationResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {validationResult.errors.length > 0 && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Validation Errors</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {validationResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {validationResult.requiresOverride && (
                    <p className="mt-2 font-medium">
                      Supervisor override required to proceed.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {(validationResult.valid || validationResult.requiresOverride) && (
              <div className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="qtyToUse">Quantity to Consume</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="qtyToUse"
                      type="number"
                      step="0.001"
                      value={qtyToUse}
                      onChange={(e) => setQtyToUse(e.target.value)}
                      className="w-32"
                      data-testid="input-qty-to-consume"
                    />
                    <span className="text-muted-foreground">
                      {validationResult.lot.unitOfMeasure}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Available: {validationResult.lot.remainingQty})
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={resetScanner} data-testid="button-cancel-scan">
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConsume}
                    disabled={consumeMutation.isPending}
                    data-testid="button-confirm-consume"
                  >
                    {consumeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Record Consumption
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Supervisor Override Required
            </DialogTitle>
            <DialogDescription>
              This material has validation issues that require supervisor approval to proceed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {validationResult?.errors.map((e, i) => (
              <Alert key={i} variant="destructive">
                <AlertDescription>{e}</AlertDescription>
              </Alert>
            ))}
            <div className="space-y-2">
              <Label htmlFor="overrideApprovedBy">Supervisor Badge/ID</Label>
              <Input
                id="overrideApprovedBy"
                value={overrideApprovedBy}
                onChange={(e) => setOverrideApprovedBy(e.target.value)}
                placeholder="Scan supervisor badge or enter ID"
                data-testid="input-override-approver"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overrideReason">Override Justification</Label>
              <Input
                id="overrideReason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for override"
                data-testid="input-override-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOverrideDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleOverrideConfirm}
              disabled={!overrideReason || !overrideApprovedBy}
              data-testid="button-confirm-override"
            >
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

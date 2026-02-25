import { useState, useReducer, useEffect, useMemo, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, ChevronRight, ChevronLeft, Package, CreditCard, FileCheck, Printer, FileText, X, CheckCircle, AlertTriangle, Shield, ScanBarcode } from 'lucide-react';
import { z } from 'zod';

type ShipmentDialogState = {
  currentStep: 0 | 1 | 2 | 3;
  serviceCode: string;
  billingOption: 'sender' | 'receiver' | 'third-party';
  thirdPartyAccountNumber: string;
  thirdPartyPostalCode: string;
  thirdPartyCountryCode: string;
  weightLbs: string;
  boxSize: string;
  customLength: string;
  customWidth: string;
  customHeight: string;
  validationErrors: Record<string, string>;
  previewData: {
    trackingNumber?: string;
    labelUrl?: string;
    packingSlipUrls?: string[];
  } | null;
};

type ShipmentDialogAction =
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_STEP'; step: 0 | 1 | 2 | 3 }
  | { type: 'SET_SERVICE_CODE'; value: string }
  | { type: 'SET_BILLING_OPTION'; value: 'sender' | 'receiver' | 'third-party' }
  | { type: 'SET_THIRD_PARTY_ACCOUNT'; value: string }
  | { type: 'SET_THIRD_PARTY_POSTAL'; value: string }
  | { type: 'SET_THIRD_PARTY_COUNTRY'; value: string }
  | { type: 'SET_WEIGHT_LBS'; value: string }
  | { type: 'SET_BOX_SIZE'; value: string }
  | { type: 'SET_CUSTOM_LENGTH'; value: string }
  | { type: 'SET_CUSTOM_WIDTH'; value: string }
  | { type: 'SET_CUSTOM_HEIGHT'; value: string }
  | { type: 'SET_VALIDATION_ERRORS'; errors: Record<string, string> }
  | { type: 'SET_PREVIEW_DATA'; data: ShipmentDialogState['previewData'] }
  | { type: 'RESET' };

const initialState: ShipmentDialogState = {
  currentStep: 0,
  serviceCode: '03',
  billingOption: 'sender',
  thirdPartyAccountNumber: '',
  thirdPartyPostalCode: '',
  thirdPartyCountryCode: 'US',
  weightLbs: '',
  boxSize: 'medium',
  customLength: '',
  customWidth: '',
  customHeight: '',
  validationErrors: {},
  previewData: null,
};

function shipmentReducer(state: ShipmentDialogState, action: ShipmentDialogAction): ShipmentDialogState {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(3, state.currentStep + 1) as 0 | 1 | 2 | 3 };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(0, state.currentStep - 1) as 0 | 1 | 2 | 3 };
    case 'SET_STEP':
      return { ...state, currentStep: action.step };
    case 'SET_SERVICE_CODE':
      return { ...state, serviceCode: action.value };
    case 'SET_BILLING_OPTION':
      return { ...state, billingOption: action.value };
    case 'SET_THIRD_PARTY_ACCOUNT':
      return { ...state, thirdPartyAccountNumber: action.value };
    case 'SET_THIRD_PARTY_POSTAL':
      return { ...state, thirdPartyPostalCode: action.value };
    case 'SET_THIRD_PARTY_COUNTRY':
      return { ...state, thirdPartyCountryCode: action.value };
    case 'SET_WEIGHT_LBS':
      return { ...state, weightLbs: action.value };
    case 'SET_BOX_SIZE':
      return { ...state, boxSize: action.value };
    case 'SET_CUSTOM_LENGTH':
      return { ...state, customLength: action.value };
    case 'SET_CUSTOM_WIDTH':
      return { ...state, customWidth: action.value };
    case 'SET_CUSTOM_HEIGHT':
      return { ...state, customHeight: action.value };
    case 'SET_VALIDATION_ERRORS':
      return { ...state, validationErrors: action.errors };
    case 'SET_PREVIEW_DATA':
      return { ...state, previewData: action.data };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const serviceLevelSchema = z.object({
  serviceCode: z.string().min(1, 'Service level is required'),
  billingOption: z.enum(['sender', 'receiver', 'third-party']),
  thirdPartyAccountNumber: z.string().optional(),
  thirdPartyPostalCode: z.string().optional(),
  thirdPartyCountryCode: z.string().optional(),
}).refine(
  (data) => {
    if (data.billingOption === 'third-party') {
      return !!data.thirdPartyAccountNumber && !!data.thirdPartyPostalCode && !!data.thirdPartyCountryCode;
    }
    return true;
  },
  {
    message: 'Third-party billing requires account number, postal code, and country code',
    path: ['thirdPartyAccountNumber'],
  }
);

interface ShipmentDialogProps {
  open: boolean;
  onClose: () => void;
  selectedItems: Array<{
    poItemId: number;
    orderId: string;
    quantity: number;
    description: string;
    customerName: string;
    poNumber: string;
  }>;
  onSuccess?: (data: any) => void;
}

export function ShipmentDialog({ open, onClose, selectedItems, onSuccess }: ShipmentDialogProps) {
  const [state, dispatch] = useReducer(shipmentReducer, initialState);
  const [printPopup, setPrintPopup] = useState<{
    show: boolean;
    trackingNumber: string;
    items: typeof selectedItems;
    customerName: string;
    poNumbers: string[];
    shippingLabel?: { format: string; data: string } | null;
    packingSlips?: Array<{ poNumber: string; filename: string; data: string }>;
  } | null>(null);
  const [hasP2Units, setHasP2Units] = useState<boolean | null>(null);
  const [allFinalized, setAllFinalized] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const processShipmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/po-orders/process-shipment', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Shipment Created',
        description: `Tracking number: ${data.trackingNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/all-p1-with-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
      
      const poNumbers = Array.from(new Set(selectedItems.map(item => item.poNumber)));
      const customerName = selectedItems[0]?.customerName || 'Customer';
      
      setPrintPopup({
        show: true,
        trackingNumber: data.trackingNumber,
        items: [...selectedItems],
        customerName,
        poNumbers,
        shippingLabel: data.shippingLabel || null,
        packingSlips: data.packingSlips || [],
      });
      
      if (onSuccess) {
        onSuccess(data);
      }
      
      dispatch({ type: 'RESET' });
    },
    onError: (error: any) => {
      const msg = error.message || 'Failed to create shipment';
      if (msg.includes('FINALIZATION_REQUIRED') || error?.guard === 'FINALIZATION_REQUIRED') {
        toast({
          title: 'Finalization Required',
          description: 'Some units still need SKU/Drawing assignment. Go back to Step 0.',
          variant: 'destructive',
        });
        dispatch({ type: 'SET_STEP', step: 0 });
        return;
      }
      toast({
        title: 'Shipment Failed',
        description: msg,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!open) {
      dispatch({ type: 'RESET' });
      setHasP2Units(null);
      setAllFinalized(false);
    }
  }, [open]);

  const uniquePoItemIds = useMemo(() => {
    return Array.from(new Set(selectedItems.map(i => i.poItemId).filter(Boolean)));
  }, [selectedItems]);

  const stepLabel = (step: number) => {
    if (step === 0) return 'Finalize P2 Units';
    if (step === 1) return 'Review Selected Items';
    if (step === 2) return 'Service & Billing Options';
    return 'Review & Submit';
  };

  const showP2Step = hasP2Units === true;
  const minStep = showP2Step ? 0 : 1;

  const userStepNumber = showP2Step ? state.currentStep + 1 : state.currentStep;
  const userTotalSteps = showP2Step ? 4 : 3;

  useEffect(() => {
    if (hasP2Units === false && state.currentStep === 0) {
      dispatch({ type: 'SET_STEP', step: 1 });
    }
  }, [hasP2Units, state.currentStep]);

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 0) {
      if (hasP2Units && !allFinalized) {
        errors.finalization = 'All P2 units must be finalized before proceeding';
      }
    }

    if (step === 1) {
      if (selectedItems.length === 0) {
        errors.items = 'No items selected';
      }
      if (!state.weightLbs || parseFloat(state.weightLbs) <= 0) {
        errors.weightLbs = 'Weight is required';
      }
      if (!state.boxSize) {
        errors.boxSize = 'Box size is required';
      }
      if (state.boxSize === 'custom') {
        if (!state.customLength || parseFloat(state.customLength) <= 0) {
          errors.customLength = 'Length is required';
        }
        if (!state.customWidth || parseFloat(state.customWidth) <= 0) {
          errors.customWidth = 'Width is required';
        }
        if (!state.customHeight || parseFloat(state.customHeight) <= 0) {
          errors.customHeight = 'Height is required';
        }
      }
    }

    if (step === 2) {
      const result = serviceLevelSchema.safeParse({
        serviceCode: state.serviceCode,
        billingOption: state.billingOption,
        thirdPartyAccountNumber: state.thirdPartyAccountNumber,
        thirdPartyPostalCode: state.thirdPartyPostalCode,
        thirdPartyCountryCode: state.thirdPartyCountryCode,
      });

      if (!result.success) {
        result.error.errors.forEach((err) => {
          errors[err.path.join('.')] = err.message;
        });
      }
    }

    dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(state.currentStep)) {
      dispatch({ type: 'NEXT_STEP' });
    }
  };

  const handleBack = () => {
    if (state.currentStep <= minStep) return;
    dispatch({ type: 'PREV_STEP' });
  };

  const handleSubmit = async () => {
    if (!validateStep(state.currentStep)) return;

    const payload: any = {
      items: selectedItems.map((item) => ({
        poItemId: item.poItemId,
        orderId: item.orderId,
        quantity: item.quantity,
      })),
      serviceCode: state.serviceCode,
      billingOption: state.billingOption,
      thirdPartyAccountNumber: state.thirdPartyAccountNumber || undefined,
      thirdPartyPostalCode: state.thirdPartyPostalCode || undefined,
      thirdPartyCountryCode: state.thirdPartyCountryCode || undefined,
      weightLbs: parseFloat(state.weightLbs) || 5,
      boxSize: state.boxSize || 'medium',
    };

    if (state.boxSize === 'custom') {
      payload.customDimensions = {
        length: parseFloat(state.customLength) || 0,
        width: parseFloat(state.customWidth) || 0,
        height: parseFloat(state.customHeight) || 0,
      };
    }

    processShipmentMutation.mutate(payload);
  };

  const itemsByCustomer = selectedItems.reduce((acc, item) => {
    if (!acc[item.customerName]) {
      acc[item.customerName] = {};
    }
    if (!acc[item.customerName][item.poNumber]) {
      acc[item.customerName][item.poNumber] = [];
    }
    acc[item.customerName][item.poNumber].push(item);
    return acc;
  }, {} as Record<string, Record<string, typeof selectedItems>>);

  return (
    <>
    <Dialog open={open && !printPopup?.show} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
          <DialogDescription>
            Step {userStepNumber} of {userTotalSteps}: {stepLabel(state.currentStep)}
          </DialogDescription>
        </DialogHeader>

        {state.currentStep === 0 && (
          <StepFinalizeP2Units
            selectedItems={selectedItems}
            poItemIds={uniquePoItemIds}
            onP2UnitsDetected={(detected) => setHasP2Units(detected)}
            onAllFinalized={(finalized) => setAllFinalized(finalized)}
          />
        )}

        {state.currentStep === 1 && (
          <StepSelectionRecap
            itemsByCustomer={itemsByCustomer}
            selectedItems={selectedItems}
            errors={state.validationErrors}
            state={state}
            dispatch={dispatch}
          />
        )}

        {state.currentStep === 2 && (
          <StepServiceBilling
            state={state}
            dispatch={dispatch}
            errors={state.validationErrors}
          />
        )}

        {state.currentStep === 3 && (
          <StepReviewPreview
            state={state}
            selectedItems={selectedItems}
            itemsByCustomer={itemsByCustomer}
          />
        )}

        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <div className="flex gap-2">
            {state.currentStep > minStep && (
              <Button
                onClick={handleBack}
                variant="outline"
                disabled={processShipmentMutation.isPending}
                data-testid="button-shipment-back"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onClose}
              variant="ghost"
              disabled={processShipmentMutation.isPending}
              data-testid="button-shipment-cancel"
            >
              Cancel
            </Button>

            {state.currentStep < 3 && (
              <Button
                onClick={handleNext}
                disabled={state.currentStep === 0 && showP2Step && !allFinalized}
                data-testid="button-shipment-next"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}

            {state.currentStep === 3 && (
              <Button
                onClick={handleSubmit}
                disabled={processShipmentMutation.isPending}
                data-testid="button-shipment-submit"
              >
                {processShipmentMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Shipment...
                  </>
                ) : (
                  'Create Shipment'
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    {printPopup?.show && (
      <PrintShipmentPopup
        trackingNumber={printPopup.trackingNumber}
        customerName={printPopup.customerName}
        poNumbers={printPopup.poNumbers}
        items={printPopup.items}
        shippingLabel={printPopup.shippingLabel}
        packingSlips={printPopup.packingSlips}
        onClose={() => {
          setPrintPopup(null);
          onClose();
        }}
      />
    )}
    </>
  );
}

interface SerializedUnit {
  id: string;
  barcode: string;
  serialNumber: string;
  sequenceNumber: number;
  partNumber: string;
  partName: string;
  status: string;
  currentDepartment: string;
  currentStageIndex: number;
  buildFamilyKey: string | null;
  sku: string | null;
  drawingName: string | null;
  customerSerialNumber: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
}

function StepFinalizeP2Units({
  selectedItems,
  poItemIds,
  onP2UnitsDetected,
  onAllFinalized,
}: {
  selectedItems: Array<{ poItemId: number; orderId: string; description: string; poNumber: string }>;
  poItemIds: number[];
  onP2UnitsDetected: (detected: boolean) => void;
  onAllFinalized: (finalized: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sku, setSku] = useState('');
  const [drawingName, setDrawingName] = useState('');
  const [customerSerial, setCustomerSerial] = useState('');
  const [performedBy, setPerformedBy] = useState('');
  const [selectedPoItemId, setSelectedPoItemId] = useState<number | null>(null);
  const [unitData, setUnitData] = useState<Record<number, SerializedUnit[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAllUnits = useCallback(async () => {
    setLoading(true);
    const results: Record<number, SerializedUnit[]> = {};
    let foundAny = false;

    for (const poItemId of poItemIds) {
      try {
        const url = `/api/p2/serialized-items?poItemId=${poItemId}`;
        const res = await fetch(url);
        if (res.ok) {
          const units: SerializedUnit[] = await res.json();
          if (units.length > 0) {
            results[poItemId] = units;
            foundAny = true;
          }
        }
      } catch {
      }
    }

    setUnitData(results);
    onP2UnitsDetected(foundAny);
    setLoading(false);

    if (foundAny && !selectedPoItemId) {
      const firstKey = Object.keys(results).map(Number)[0];
      if (firstKey) setSelectedPoItemId(firstKey);
    }
  }, [poItemIds, onP2UnitsDetected]);

  useEffect(() => {
    if (poItemIds.length > 0) {
      fetchAllUnits();
    } else {
      onP2UnitsDetected(false);
      setLoading(false);
    }
  }, [poItemIds, refreshKey]);

  useEffect(() => {
    const allUnits = Object.values(unitData).flat();
    if (allUnits.length === 0) {
      onAllFinalized(true);
      return;
    }
    const unfinalized = allUnits.filter(u => !u.finalizedAt || !u.sku || !u.drawingName);
    onAllFinalized(unfinalized.length === 0);
  }, [unitData, onAllFinalized]);

  const finalizeMutation = useMutation({
    mutationFn: async (data: { serializedItemIds: string[]; sku: string; drawingName: string; customerSerialNumber?: string; performedBy: string }) => {
      return await apiRequest('/api/p2/serialized-items/finalize', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Units Finalized',
        description: `${data.updatedCount} unit(s) finalized successfully.`,
      });
      setRefreshKey(k => k + 1);
    },
    onError: (error: any) => {
      toast({
        title: 'Finalization Failed',
        description: error.message || 'Failed to finalize units',
        variant: 'destructive',
      });
    },
  });

  const handleFinalizePoItem = (poItemId: number) => {
    const units = unitData[poItemId] || [];
    const unfinalized = units.filter(u => !u.finalizedAt || !u.sku || !u.drawingName);

    if (unfinalized.length === 0) {
      toast({ title: 'Already finalized', description: 'All units for this item are finalized.' });
      return;
    }

    if (!sku.trim()) {
      toast({ title: 'SKU required', description: 'Enter a SKU before finalizing.', variant: 'destructive' });
      return;
    }
    if (!drawingName.trim()) {
      toast({ title: 'Drawing required', description: 'Enter a drawing name before finalizing.', variant: 'destructive' });
      return;
    }
    if (!performedBy.trim()) {
      toast({ title: 'Name required', description: 'Enter your name/employee code.', variant: 'destructive' });
      return;
    }

    finalizeMutation.mutate({
      serializedItemIds: unfinalized.map(u => u.id),
      sku: sku.trim(),
      drawingName: drawingName.trim(),
      customerSerialNumber: customerSerial.trim() || undefined,
      performedBy: performedBy.trim(),
    });
  };

  const handleFinalizeAll = () => {
    const allUnfinalized = Object.values(unitData).flat().filter(u => !u.finalizedAt || !u.sku || !u.drawingName);
    if (allUnfinalized.length === 0) {
      toast({ title: 'Already finalized', description: 'All units are finalized.' });
      return;
    }
    if (!sku.trim() || !drawingName.trim() || !performedBy.trim()) {
      toast({ title: 'Missing fields', description: 'SKU, Drawing Name, and Performed By are required.', variant: 'destructive' });
      return;
    }
    finalizeMutation.mutate({
      serializedItemIds: allUnfinalized.map(u => u.id),
      sku: sku.trim(),
      drawingName: drawingName.trim(),
      customerSerialNumber: customerSerial.trim() || undefined,
      performedBy: performedBy.trim(),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-muted-foreground">Checking P2 serialized units...</span>
      </div>
    );
  }

  const allUnits = Object.values(unitData).flat();
  const totalUnfinalized = allUnits.filter(u => !u.finalizedAt || !u.sku || !u.drawingName);

  if (allUnits.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <p>No P2 serialized units found for these items.</p>
        <p className="text-sm">You can proceed to the next step.</p>
      </div>
    );
  }

  if (totalUnfinalized.length === 0) {
    return (
      <div className="py-8 text-center">
        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
        <p className="font-medium text-green-700 dark:text-green-400">All {allUnits.length} unit(s) finalized</p>
        <p className="text-sm text-muted-foreground mt-1">SKU and drawing assigned. Ready to ship.</p>
      </div>
    );
  }

  const poItemEntries = Object.entries(unitData).map(([poItemId, units]) => ({
    poItemId: Number(poItemId),
    units,
    item: selectedItems.find(i => i.poItemId === Number(poItemId)),
  }));

  const currentUnits = selectedPoItemId ? (unitData[selectedPoItemId] || []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Shield className="w-5 h-5" />
        <span className="font-medium">
          {totalUnfinalized.length} unit(s) need finalization before shipping
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fin-sku" className="text-xs font-medium">SKU *</Label>
          <Input
            id="fin-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. TUBE-12x98-RevN"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fin-drawing" className="text-xs font-medium">Drawing Name *</Label>
          <Input
            id="fin-drawing"
            value={drawingName}
            onChange={(e) => setDrawingName(e.target.value)}
            placeholder="e.g. DWG-4002P0001-N"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fin-by" className="text-xs font-medium">Performed By *</Label>
          <Input
            id="fin-by"
            value={performedBy}
            onChange={(e) => setPerformedBy(e.target.value)}
            placeholder="Employee code"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="fin-custserial" className="text-xs font-medium">Customer Serial (optional)</Label>
          <Input
            id="fin-custserial"
            value={customerSerial}
            onChange={(e) => setCustomerSerial(e.target.value)}
            placeholder="e.g. CUST-SN-001"
          />
        </div>
        <div className="flex items-end">
          <Button
            onClick={handleFinalizeAll}
            disabled={finalizeMutation.isPending || !sku.trim() || !drawingName.trim() || !performedBy.trim()}
            className="w-full"
          >
            {finalizeMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...</>
            ) : (
              <><Shield className="w-4 h-4 mr-2" /> Finalize All ({totalUnfinalized.length} units)</>
            )}
          </Button>
        </div>
      </div>

      {poItemEntries.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {poItemEntries.map(({ poItemId, units, item }) => {
            const unfin = units.filter(u => !u.finalizedAt || !u.sku || !u.drawingName);
            return (
              <Button
                key={poItemId}
                variant={selectedPoItemId === poItemId ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPoItemId(poItemId)}
              >
                {item?.description || `Item ${poItemId}`}
                {unfin.length > 0 ? (
                  <span className="ml-2 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{unfin.length}</span>
                ) : (
                  <CheckCircle className="ml-2 w-3 h-3 text-green-500" />
                )}
              </Button>
            );
          })}
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Barcode</th>
              <th className="px-3 py-2 text-left font-medium">Department</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-left font-medium">Drawing</th>
              <th className="px-3 py-2 text-left font-medium">Finalized</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {currentUnits.map((unit) => {
              const isFinalized = !!(unit.finalizedAt && unit.sku && unit.drawingName);
              return (
                <tr key={unit.id} className={isFinalized ? 'bg-green-50/50 dark:bg-green-900/10' : 'bg-amber-50/50 dark:bg-amber-900/10'}>
                  <td className="px-3 py-2 font-mono text-xs">{unit.barcode}</td>
                  <td className="px-3 py-2 text-xs">{unit.currentDepartment}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      unit.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      unit.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                      unit.status === 'HOLD' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                      'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    }`}>
                      {unit.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{unit.sku || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="px-3 py-2 text-xs">{unit.drawingName || <span className="text-muted-foreground italic">—</span>}</td>
                  <td className="px-3 py-2">
                    {isFinalized ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedPoItemId && poItemEntries.length > 1 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleFinalizePoItem(selectedPoItemId)}
            disabled={finalizeMutation.isPending || !sku.trim() || !drawingName.trim() || !performedBy.trim()}
          >
            Finalize This Item Only
          </Button>
        </div>
      )}
    </div>
  );
}

function StepSelectionRecap({
  itemsByCustomer,
  selectedItems,
  errors,
  state,
  dispatch,
}: {
  itemsByCustomer: Record<string, Record<string, any[]>>;
  selectedItems: any[];
  errors: Record<string, string>;
  state: ShipmentDialogState;
  dispatch: React.Dispatch<ShipmentDialogAction>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Package className="w-5 h-5" />
        <span className="font-medium">Selected Items ({selectedItems.length})</span>
      </div>

      {errors.items && (
        <div className="text-sm text-destructive">{errors.items}</div>
      )}

      <div className="space-y-4 max-h-60 overflow-y-auto">
        {Object.entries(itemsByCustomer).map(([customerName, pos]) => (
          <div key={customerName} className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">{customerName}</h4>
            {Object.entries(pos).map(([poNumber, items]) => (
              <div key={poNumber} className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">PO: {poNumber}</div>
                <div className="space-y-1">
                  {items.map((item, idx) => (
                    <div key={`${item.poItemId}-${item.orderId}-${idx}`} className="flex justify-between text-sm pl-4">
                      <span>{item.description || 'Unknown Item'} (Order: {item.orderId})</span>
                      <span className="text-muted-foreground">Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t pt-4 space-y-4">
        <h4 className="font-semibold text-sm text-muted-foreground">Package Details</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="weightLbs">Total Weight (lbs) *</Label>
            <Input
              id="weightLbs"
              type="number"
              step="0.1"
              min="0.1"
              placeholder="Enter weight"
              value={state.weightLbs}
              onChange={(e) => dispatch({ type: 'SET_WEIGHT_LBS', value: e.target.value })}
              className={errors.weightLbs ? 'border-destructive' : ''}
            />
            {errors.weightLbs && (
              <div className="text-sm text-destructive">{errors.weightLbs}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="boxSize">Box Size *</Label>
            <Select
              value={state.boxSize}
              onValueChange={(value) => dispatch({ type: 'SET_BOX_SIZE', value })}
            >
              <SelectTrigger id="boxSize" className={errors.boxSize ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select box size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="small">Small (10x8x6)</SelectItem>
                <SelectItem value="medium">Medium (14x10x8)</SelectItem>
                <SelectItem value="large">Large (18x14x10)</SelectItem>
                <SelectItem value="xlarge">X-Large (24x18x12)</SelectItem>
                <SelectItem value="custom">Custom Size</SelectItem>
              </SelectContent>
            </Select>
            {errors.boxSize && (
              <div className="text-sm text-destructive">{errors.boxSize}</div>
            )}
          </div>
        </div>

        {state.boxSize === 'custom' && (
          <div className="mt-4 p-4 bg-muted/30 rounded-lg space-y-3">
            <Label className="font-medium">Custom Dimensions (inches)</Label>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="customLength" className="text-xs text-muted-foreground">Length</Label>
                <Input
                  id="customLength"
                  type="number"
                  step="0.5"
                  min="1"
                  placeholder="L"
                  value={state.customLength}
                  onChange={(e) => dispatch({ type: 'SET_CUSTOM_LENGTH', value: e.target.value })}
                  className={errors.customLength ? 'border-destructive' : ''}
                />
                {errors.customLength && (
                  <div className="text-xs text-destructive">{errors.customLength}</div>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="customWidth" className="text-xs text-muted-foreground">Width</Label>
                <Input
                  id="customWidth"
                  type="number"
                  step="0.5"
                  min="1"
                  placeholder="W"
                  value={state.customWidth}
                  onChange={(e) => dispatch({ type: 'SET_CUSTOM_WIDTH', value: e.target.value })}
                  className={errors.customWidth ? 'border-destructive' : ''}
                />
                {errors.customWidth && (
                  <div className="text-xs text-destructive">{errors.customWidth}</div>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="customHeight" className="text-xs text-muted-foreground">Height</Label>
                <Input
                  id="customHeight"
                  type="number"
                  step="0.5"
                  min="1"
                  placeholder="H"
                  value={state.customHeight}
                  onChange={(e) => dispatch({ type: 'SET_CUSTOM_HEIGHT', value: e.target.value })}
                  className={errors.customHeight ? 'border-destructive' : ''}
                />
                {errors.customHeight && (
                  <div className="text-xs text-destructive">{errors.customHeight}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepServiceBilling({
  state,
  dispatch,
  errors,
}: {
  state: ShipmentDialogState;
  dispatch: React.Dispatch<ShipmentDialogAction>;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CreditCard className="w-5 h-5" />
          <Label className="font-medium">Service Level</Label>
        </div>
        <Select
          value={state.serviceCode}
          onValueChange={(value) => dispatch({ type: 'SET_SERVICE_CODE', value })}
        >
          <SelectTrigger data-testid="select-service-level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="03">UPS Ground</SelectItem>
            <SelectItem value="02">UPS 2nd Day Air</SelectItem>
            <SelectItem value="01">UPS Next Day Air</SelectItem>
            <SelectItem value="13">UPS Next Day Air Saver</SelectItem>
            <SelectItem value="14">UPS Next Day Air Early</SelectItem>
          </SelectContent>
        </Select>
        {errors.serviceCode && (
          <div className="text-sm text-destructive">{errors.serviceCode}</div>
        )}
      </div>

      <div className="space-y-3">
        <Label className="font-medium">Billing Option</Label>
        <RadioGroup
          value={state.billingOption}
          onValueChange={(value: any) => dispatch({ type: 'SET_BILLING_OPTION', value })}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sender" id="sender" data-testid="radio-billing-sender" />
            <Label htmlFor="sender" className="font-normal cursor-pointer">
              Bill Sender (AG Composites)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="receiver" id="receiver" data-testid="radio-billing-receiver" />
            <Label htmlFor="receiver" className="font-normal cursor-pointer">
              Bill Receiver (Customer pays)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="third-party" id="third-party" data-testid="radio-billing-third-party" />
            <Label htmlFor="third-party" className="font-normal cursor-pointer">
              Bill Third Party
            </Label>
          </div>
        </RadioGroup>
      </div>

      {state.billingOption === 'third-party' && (
        <div className="space-y-3 pl-6 border-l-2 border-muted">
          <div className="space-y-2">
            <Label htmlFor="thirdPartyAccount">Account Number *</Label>
            <Input
              id="thirdPartyAccount"
              value={state.thirdPartyAccountNumber}
              onChange={(e) => dispatch({ type: 'SET_THIRD_PARTY_ACCOUNT', value: e.target.value })}
              placeholder="Enter UPS account number"
              data-testid="input-third-party-account"
            />
            {errors.thirdPartyAccountNumber && (
              <div className="text-sm text-destructive">{errors.thirdPartyAccountNumber}</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="thirdPartyPostal">Postal Code *</Label>
            <Input
              id="thirdPartyPostal"
              value={state.thirdPartyPostalCode}
              onChange={(e) => dispatch({ type: 'SET_THIRD_PARTY_POSTAL', value: e.target.value })}
              placeholder="ZIP/Postal Code"
              data-testid="input-third-party-postal"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thirdPartyCountry">Country Code *</Label>
            <Input
              id="thirdPartyCountry"
              value={state.thirdPartyCountryCode}
              onChange={(e) => dispatch({ type: 'SET_THIRD_PARTY_COUNTRY', value: e.target.value.toUpperCase() })}
              placeholder="US"
              maxLength={2}
              data-testid="input-third-party-country"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepReviewPreview({
  state,
  selectedItems,
  itemsByCustomer,
}: {
  state: ShipmentDialogState;
  selectedItems: any[];
  itemsByCustomer: Record<string, Record<string, any[]>>;
}) {
  const serviceNames: Record<string, string> = {
    '01': 'UPS Next Day Air',
    '02': 'UPS 2nd Day Air',
    '03': 'UPS Ground',
    '13': 'UPS Next Day Air Saver',
    '14': 'UPS Next Day Air Early',
  };

  const billingLabels: Record<string, string> = {
    sender: 'Bill Sender (AG Composites)',
    receiver: 'Bill Receiver (Customer)',
    'third-party': 'Bill Third Party',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <FileCheck className="w-5 h-5" />
        <span className="font-medium">Review Shipment Details</span>
      </div>

      <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
        <div>
          <div className="text-sm text-muted-foreground">Service Level</div>
          <div className="font-medium">{serviceNames[state.serviceCode] || state.serviceCode}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Billing</div>
          <div className="font-medium">{billingLabels[state.billingOption]}</div>
        </div>
        {state.billingOption === 'third-party' && (
          <div className="col-span-2">
            <div className="text-sm text-muted-foreground">Third Party Account</div>
            <div className="font-medium">{state.thirdPartyAccountNumber}</div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium">Items to Ship ({selectedItems.length})</div>
        <div className="max-h-48 overflow-y-auto space-y-2">
          {Object.entries(itemsByCustomer).map(([customerName, pos]) => (
            <div key={customerName} className="border rounded p-3 space-y-2 text-sm">
              <div className="font-medium">{customerName}</div>
              {Object.entries(pos).map(([poNumber, items]) => (
                <div key={poNumber} className="pl-3 space-y-1">
                  <div className="text-muted-foreground text-xs">PO: {poNumber}</div>
                  {items.map((item, idx) => (
                    <div key={`${item.poItemId}-${item.orderId}-${idx}`} className="text-xs pl-2">
                      • {item.description || 'Unknown Item'} - Qty: {item.quantity}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="text-sm text-muted-foreground italic">
        Click "Create Shipment" to generate shipping label and packing slips.
      </div>
    </div>
  );
}

function PrintShipmentPopup({
  trackingNumber,
  customerName,
  poNumbers,
  items,
  shippingLabel,
  packingSlips,
  onClose,
}: {
  trackingNumber: string;
  customerName: string;
  poNumbers: string[];
  items: Array<{
    poItemId: number;
    orderId: string;
    quantity: number;
    description: string;
    poNumber?: string;
  }>;
  shippingLabel?: { format: string; data: string } | null;
  packingSlips?: Array<{ poNumber: string; filename: string; data: string }>;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isFulfilled, setIsFulfilled] = useState(false);

  const fulfillMutation = useMutation({
    mutationFn: async () => {
      if (!items || items.length === 0) {
        throw new Error('No items to mark as fulfilled');
      }
      const orderIds = items.map(item => item.orderId);
      const response = await apiRequest('/api/po-orders/toggle-fulfilled', {
        method: 'POST',
        body: JSON.stringify({ orderIds, fulfilled: true }),
      });
      return response;
    },
    onSuccess: () => {
      setIsFulfilled(true);
      toast({
        title: 'Items Marked as Fulfilled',
        description: `${items.length} item(s) have been moved to OEM Shipments.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/all-p1-with-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/shipping-qc'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Mark as Fulfilled',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    },
  });
  const handlePrintPackingSlip = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert('Please allow popups for this site to print');
      return;
    }

    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.poNumber || '-'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.orderId}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${item.description || 'Item'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing Slip - ${poNumbers.join(', ')}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 24px; font-weight: bold; }
          .title { font-size: 28px; text-align: center; margin-bottom: 30px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
          .info-box { background: #f9fafb; padding: 15px; border-radius: 8px; }
          .info-label { font-size: 12px; color: #6b7280; text-transform: uppercase; margin-bottom: 5px; }
          .info-value { font-size: 16px; font-weight: 500; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #f3f4f6; padding: 12px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #d1d5db; }
          .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">AG Composites</div>
          <div style="text-align: right; color: #6b7280;">
            <div>Date: ${today}</div>
          </div>
        </div>
        <h1 class="title">PACKING SLIP</h1>
        <div class="info-grid">
          <div class="info-box">
            <div class="info-label">Ship To</div>
            <div class="info-value">${customerName}</div>
          </div>
          <div class="info-box">
            <div class="info-label">PO Number(s)</div>
            <div class="info-value">${poNumbers.join(', ')}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Tracking Number</div>
            <div class="info-value" style="font-family: monospace;">${trackingNumber}</div>
          </div>
          <div class="info-box">
            <div class="info-label">Total Items</div>
            <div class="info-value">${items.length} item(s)</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Order ID</th>
              <th>Item Name</th>
              <th style="text-align: center;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="footer">
          <p>Thank you for your business!</p>
          <p>AG Composites</p>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  const handlePrintShippingLabel = () => {
    const labelData = shippingLabel?.data;
    const labelFormat = shippingLabel?.format || 'GIF';

    if (!labelData) {
      alert('No shipping label available. The UPS label was not returned.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) {
      alert('Please allow popups for this site to print');
      return;
    }

    const mimeType = labelFormat === 'ZPL' ? 'text/plain' : 'image/gif';

    if (labelFormat === 'ZPL') {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shipping Label - ${trackingNumber}</title>
          <style>
            body { font-family: monospace; padding: 20px; white-space: pre-wrap; font-size: 10px; }
            @media print { body { padding: 0; margin: 0; } }
          </style>
        </head>
        <body>${atob(labelData)}</body>
        </html>
      `);
    } else {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shipping Label - ${trackingNumber}</title>
          <style>
            @page {
              size: 4in 6in;
              margin: 0;
            }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              width: 4in;
              height: 6in;
              display: flex;
              align-items: center;
              justify-content: center;
              background: #fff;
            }
            img {
              width: 4in;
              height: 6in;
              object-fit: contain;
            }
            @media print {
              body { width: 4in; height: 6in; }
              img { width: 4in; height: 6in; }
            }
          </style>
        </head>
        <body>
          <img src="data:${mimeType};base64,${labelData}" alt="UPS Shipping Label" />
        </body>
        </html>
      `);
    }

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-green-600" />
            Shipment Created Successfully
          </DialogTitle>
          <DialogDescription>
            Print the packing slip and shipping label for this shipment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="text-sm text-muted-foreground">Tracking Number</div>
            <div className="font-mono text-lg font-semibold">{trackingNumber}</div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-sm text-muted-foreground">Customer</div>
              <div className="font-medium">{customerName}</div>
            </div>
            <div className="p-3 bg-muted/30 rounded-lg">
              <div className="text-sm text-muted-foreground">PO Number(s)</div>
              <div className="font-medium">{poNumbers.join(', ')}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={handlePrintPackingSlip}
            className="w-full"
            size="lg"
          >
            <FileText className="w-4 h-4 mr-2" />
            Print Packing Slip
          </Button>
          
          <Button
            onClick={handlePrintShippingLabel}
            variant="outline"
            className="w-full"
            size="lg"
          >
            <Printer className="w-4 h-4 mr-2" />
            Print Shipping Label
          </Button>

          <Button
            onClick={() => fulfillMutation.mutate()}
            disabled={isFulfilled || fulfillMutation.isPending}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            {fulfillMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            {isFulfilled ? 'Marked as Fulfilled' : 'Mark as Fulfilled'}
          </Button>

          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full"
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useReducer, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Loader2, ChevronRight, ChevronLeft, Package, CreditCard, FileCheck } from 'lucide-react';
import { z } from 'zod';

type ShipmentDialogState = {
  currentStep: 1 | 2 | 3;
  serviceCode: string;
  billingOption: 'sender' | 'receiver' | 'third-party';
  thirdPartyAccountNumber: string;
  thirdPartyPostalCode: string;
  thirdPartyCountryCode: string;
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
  | { type: 'SET_SERVICE_CODE'; value: string }
  | { type: 'SET_BILLING_OPTION'; value: 'sender' | 'receiver' | 'third-party' }
  | { type: 'SET_THIRD_PARTY_ACCOUNT'; value: string }
  | { type: 'SET_THIRD_PARTY_POSTAL'; value: string }
  | { type: 'SET_THIRD_PARTY_COUNTRY'; value: string }
  | { type: 'SET_VALIDATION_ERRORS'; errors: Record<string, string> }
  | { type: 'SET_PREVIEW_DATA'; data: ShipmentDialogState['previewData'] }
  | { type: 'RESET' };

const initialState: ShipmentDialogState = {
  currentStep: 1,
  serviceCode: '03', // Ground by default
  billingOption: 'sender',
  thirdPartyAccountNumber: '',
  thirdPartyPostalCode: '',
  thirdPartyCountryCode: 'US',
  validationErrors: {},
  previewData: null,
};

function shipmentReducer(state: ShipmentDialogState, action: ShipmentDialogAction): ShipmentDialogState {
  switch (action.type) {
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(3, state.currentStep + 1) as 1 | 2 | 3 };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(1, state.currentStep - 1) as 1 | 2 | 3 };
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
      
      // Call parent onSuccess handler if provided
      if (onSuccess) {
        onSuccess(data);
      }
      
      dispatch({ type: 'RESET' });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Shipment Failed',
        description: error.message || 'Failed to create shipment',
        variant: 'destructive',
      });
    },
  });

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      dispatch({ type: 'RESET' });
    }
  }, [open]);

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (selectedItems.length === 0) {
        errors.items = 'No items selected';
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
    dispatch({ type: 'PREV_STEP' });
  };

  const handleSubmit = async () => {
    if (!validateStep(state.currentStep)) return;

    const payload = {
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
    };

    processShipmentMutation.mutate(payload);
  };

  // Group items by customer and PO
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
          <DialogDescription>
            Step {state.currentStep} of 3: {
              state.currentStep === 1 ? 'Review Selected Items' :
              state.currentStep === 2 ? 'Service & Billing Options' :
              'Review & Submit'
            }
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Selection Recap */}
        {state.currentStep === 1 && (
          <StepSelectionRecap
            itemsByCustomer={itemsByCustomer}
            selectedItems={selectedItems}
            errors={state.validationErrors}
          />
        )}

        {/* Step 2: Service & Billing */}
        {state.currentStep === 2 && (
          <StepServiceBilling
            state={state}
            dispatch={dispatch}
            errors={state.validationErrors}
          />
        )}

        {/* Step 3: Review & Preview */}
        {state.currentStep === 3 && (
          <StepReviewPreview
            state={state}
            selectedItems={selectedItems}
            itemsByCustomer={itemsByCustomer}
          />
        )}

        {/* Dialog Actions */}
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <div className="flex gap-2">
            {state.currentStep > 1 && (
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
  );
}

// Step 1: Selection Recap Component
function StepSelectionRecap({
  itemsByCustomer,
  selectedItems,
  errors,
}: {
  itemsByCustomer: Record<string, Record<string, any[]>>;
  selectedItems: any[];
  errors: Record<string, string>;
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

      <div className="space-y-4 max-h-96 overflow-y-auto">
        {Object.entries(itemsByCustomer).map(([customerName, pos]) => (
          <div key={customerName} className="border rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-sm">{customerName}</h4>
            {Object.entries(pos).map(([poNumber, items]) => (
              <div key={poNumber} className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">PO: {poNumber}</div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div key={item.poItemId} className="flex justify-between text-sm pl-4">
                      <span>{item.description} (Order: {item.orderId})</span>
                      <span className="text-muted-foreground">Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Step 2: Service & Billing Component
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
      {/* Service Level Selection */}
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

      {/* Billing Options */}
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

      {/* Third-Party Fields (conditional) */}
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

// Step 3: Review & Preview Component
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

      {/* Shipment Summary */}
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

      {/* Items Summary */}
      <div className="space-y-3">
        <div className="text-sm font-medium">Items to Ship ({selectedItems.length})</div>
        <div className="max-h-48 overflow-y-auto space-y-2">
          {Object.entries(itemsByCustomer).map(([customerName, pos]) => (
            <div key={customerName} className="border rounded p-3 space-y-2 text-sm">
              <div className="font-medium">{customerName}</div>
              {Object.entries(pos).map(([poNumber, items]) => (
                <div key={poNumber} className="pl-3 space-y-1">
                  <div className="text-muted-foreground text-xs">PO: {poNumber}</div>
                  {items.map((item) => (
                    <div key={item.poItemId} className="text-xs pl-2">
                      • {item.description} - Qty: {item.quantity}
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

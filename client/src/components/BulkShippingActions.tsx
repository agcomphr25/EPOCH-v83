import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Truck, Package, X, ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface BulkShippingActionsProps {
  selectedOrders: string[];
  onClearSelection: () => void;
  shippingOrders: any[];
}

interface PackageDefaults {
  weight: number;
  length: number;
  width: number;
  height: number;
  declaredValue: number;
}

interface ReceiverAccount {
  accountNumber: string;
  zipCode: string;
}

interface ShipmentPreference {
  orderId: string;
  serviceCode: string;
  billingOption: 'sender' | 'receiver';
  receiverAccount?: ReceiverAccount;
  declaredValue: number;
}

export function BulkShippingActions({
  selectedOrders,
  onClearSelection,
  shippingOrders,
}: BulkShippingActionsProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingRates, setLoadingRates] = useState(false);

  // Step 1: Package Defaults
  const [packageDefaults, setPackageDefaults] = useState<PackageDefaults>({
    weight: 5,
    length: 12,
    width: 12,
    height: 12,
    declaredValue: 100,
  });

  // Step 2: Service Selection
  const [applyServiceToAll, setApplyServiceToAll] = useState(true);
  const [selectedService, setSelectedService] = useState('03'); // UPS Ground default
  const [ordersWithRates, setOrdersWithRates] = useState<any[]>([]);
  const [perOrderServices, setPerOrderServices] = useState<Record<string, string>>({});

  // Step 3: Billing Options
  const [billingOption, setBillingOption] = useState<'sender' | 'receiver'>('sender');
  const [receiverAccount, setReceiverAccount] = useState<ReceiverAccount>({
    accountNumber: '',
    zipCode: '',
  });

  const selectedOrdersData = shippingOrders.filter((order) =>
    selectedOrders.includes(order.orderId)
  );

  const resetForm = () => {
    setCurrentStep(1);
    setPackageDefaults({
      weight: 5,
      length: 12,
      width: 12,
      height: 12,
      declaredValue: 100,
    });
    setApplyServiceToAll(true);
    setSelectedService('03');
    setOrdersWithRates([]);
    setPerOrderServices({});
    setBillingOption('sender');
    setReceiverAccount({ accountNumber: '', zipCode: '' });
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleGetRates = async () => {
    setLoadingRates(true);
    try {
      const response = await axios.post('/api/shipping/bulk/rates', {
        orderIds: selectedOrders,
        packageDefaults,
      });

      setOrdersWithRates(response.data.orders || []);
      
      // Initialize per-order services to Ground
      const initialServices: Record<string, string> = {};
      selectedOrders.forEach(orderId => {
        initialServices[orderId] = '03';
      });
      setPerOrderServices(initialServices);

      toast({
        title: 'Rates Retrieved',
        description: `Fetched rates for ${selectedOrders.length} orders`,
      });
    } catch (error: any) {
      console.error('Error fetching rates:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to fetch shipping rates',
        variant: 'destructive',
      });
    } finally {
      setLoadingRates(false);
    }
  };

  const handleCreateBulkLabels = async () => {
    setIsProcessing(true);
    try {
      // Validate receiver billing if needed
      if (billingOption === 'receiver') {
        if (!receiverAccount.accountNumber || !receiverAccount.zipCode) {
          toast({
            title: 'Validation Error',
            description: 'Please enter receiver UPS account number and ZIP code',
            variant: 'destructive',
          });
          setIsProcessing(false);
          return;
        }
      }

      // Build shipments array
      const shipments: ShipmentPreference[] = selectedOrders.map(orderId => ({
        orderId,
        serviceCode: applyServiceToAll ? selectedService : (perOrderServices[orderId] || '03'),
        billingOption,
        receiverAccount: billingOption === 'receiver' ? receiverAccount : undefined,
        declaredValue: packageDefaults.declaredValue,
      }));

      const response = await axios.post('/api/shipping/bulk/create-labels', {
        shipments,
        packageDefaults: {
          weight: packageDefaults.weight,
          length: packageDefaults.length,
          width: packageDefaults.width,
          height: packageDefaults.height,
        },
      });

      const { summary, results } = response.data;

      // Show success/failure summary
      if (summary.successful > 0) {
        toast({
          title: 'Bulk Shipping Complete',
          description: `Successfully created ${summary.successful} labels. ${summary.failed > 0 ? `${summary.failed} failed.` : ''}`,
        });

        // Download labels as needed
        results.forEach((result: any) => {
          if (result.success && result.labelImage) {
            // You can implement label download here if needed
            console.log(`Label created for ${result.orderId}: ${result.trackingNumber}`);
          }
        });
      } else {
        toast({
          title: 'All Labels Failed',
          description: 'No shipping labels were created. Please check order details.',
          variant: 'destructive',
        });
      }

      // Close dialog and clear selection
      setDialogOpen(false);
      onClearSelection();
      resetForm();
    } catch (error: any) {
      console.error('Error creating bulk labels:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create shipping labels',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getServiceName = (code: string) => {
    const serviceNames: Record<string, string> = {
      '01': 'UPS Next Day Air',
      '02': 'UPS 2nd Day Air',
      '03': 'UPS Ground',
      '12': 'UPS 3 Day Select',
      '13': 'UPS Next Day Air Saver',
      '14': 'UPS Next Day Air Early',
      '59': 'UPS 2nd Day Air A.M.',
    };
    return serviceNames[code] || `Service ${code}`;
  };

  return (
    <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bulk Shipping Actions
            <Badge variant="secondary" data-testid="badge-selected-count">{selectedOrders.length} selected</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="text-blue-600 hover:text-blue-800"
            data-testid="button-clear-selection"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Selected Orders Summary */}
          <div className="text-sm text-blue-600 dark:text-blue-400">
            <strong>Selected Orders:</strong> {selectedOrders.join(', ')}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button className="flex-1" data-testid="button-create-bulk-labels">
                  <Truck className="h-4 w-4 mr-2" />
                  Create Bulk Shipping Labels
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Bulk Shipping Wizard - Step {currentStep} of 3
                  </DialogTitle>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <div className={`h-2 w-16 rounded ${currentStep >= 1 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    <div className={`h-2 w-16 rounded ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    <div className={`h-2 w-16 rounded ${currentStep >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                  </div>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {/* Step 1: Package Defaults */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">Package Defaults</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Set default package dimensions and insurance value for all {selectedOrders.length} orders
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="weight">Weight (lbs)</Label>
                          <Input
                            id="weight"
                            type="number"
                            value={packageDefaults.weight}
                            onChange={(e) => setPackageDefaults({ ...packageDefaults, weight: parseFloat(e.target.value) || 0 })}
                            data-testid="input-weight"
                          />
                        </div>
                        <div>
                          <Label htmlFor="declaredValue">Declared Value ($)</Label>
                          <Input
                            id="declaredValue"
                            type="number"
                            value={packageDefaults.declaredValue}
                            onChange={(e) => setPackageDefaults({ ...packageDefaults, declaredValue: parseFloat(e.target.value) || 0 })}
                            data-testid="input-declared-value"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor="length">Length (in)</Label>
                          <Input
                            id="length"
                            type="number"
                            value={packageDefaults.length}
                            onChange={(e) => setPackageDefaults({ ...packageDefaults, length: parseFloat(e.target.value) || 0 })}
                            data-testid="input-length"
                          />
                        </div>
                        <div>
                          <Label htmlFor="width">Width (in)</Label>
                          <Input
                            id="width"
                            type="number"
                            value={packageDefaults.width}
                            onChange={(e) => setPackageDefaults({ ...packageDefaults, width: parseFloat(e.target.value) || 0 })}
                            data-testid="input-width"
                          />
                        </div>
                        <div>
                          <Label htmlFor="height">Height (in)</Label>
                          <Input
                            id="height"
                            type="number"
                            value={packageDefaults.height}
                            onChange={(e) => setPackageDefaults({ ...packageDefaults, height: parseFloat(e.target.value) || 0 })}
                            data-testid="input-height"
                          />
                        </div>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm">
                        <strong>Note:</strong> These defaults will be used for all selected orders. You'll be able to choose different shipping services in the next step.
                      </div>
                    </div>
                  )}

                  {/* Step 2: Service Selection */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">Shipping Service Selection</h3>
                        <Button
                          onClick={handleGetRates}
                          disabled={loadingRates}
                          variant="outline"
                          size="sm"
                          data-testid="button-get-rates"
                        >
                          {loadingRates ? 'Loading Rates...' : 'Refresh Rates'}
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="applyToAll"
                          checked={applyServiceToAll}
                          onChange={(e) => setApplyServiceToAll(e.target.checked)}
                          className="rounded"
                          data-testid="checkbox-apply-to-all"
                        />
                        <Label htmlFor="applyToAll" className="cursor-pointer">
                          Apply same service to all orders
                        </Label>
                      </div>

                      {applyServiceToAll ? (
                        <div className="space-y-2">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Select one service for all {selectedOrders.length} orders:
                          </p>
                          {ordersWithRates.length > 0 && ordersWithRates[0].rates?.length > 0 ? (
                            ordersWithRates[0].rates.map((rate: any) => (
                              <div
                                key={rate.serviceCode}
                                onClick={() => setSelectedService(rate.serviceCode)}
                                className={`p-3 border rounded-lg cursor-pointer transition-all ${
                                  selectedService === rate.serviceCode
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                                }`}
                                data-testid={`service-option-${rate.serviceCode}`}
                              >
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                        selectedService === rate.serviceCode
                                          ? 'border-blue-500'
                                          : 'border-gray-300'
                                      }`}
                                    >
                                      {selectedService === rate.serviceCode && (
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      )}
                                    </div>
                                    <div>
                                      <div className="font-semibold">{rate.serviceName}</div>
                                      {rate.guaranteedDaysToDelivery && (
                                        <div className="text-xs text-gray-500">
                                          {rate.guaranteedDaysToDelivery} business day{rate.guaranteedDaysToDelivery !== '1' ? 's' : ''}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-lg font-bold text-green-600 dark:text-green-400">
                                    ${rate.totalCharges.toFixed(2)} each
                                  </div>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              Click "Refresh Rates" to see shipping options
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Select shipping service for each order individually:
                          </p>
                          {ordersWithRates.map((orderData: any) => (
                            <Card key={orderData.orderId}>
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm">{orderData.orderId}</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {orderData.rates?.map((rate: any) => (
                                  <div
                                    key={rate.serviceCode}
                                    onClick={() => setPerOrderServices({ ...perOrderServices, [orderData.orderId]: rate.serviceCode })}
                                    className={`p-2 border rounded cursor-pointer text-sm ${
                                      perOrderServices[orderData.orderId] === rate.serviceCode
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                                        : 'border-gray-200'
                                    }`}
                                  >
                                    <div className="flex justify-between">
                                      <span>{rate.serviceName}</span>
                                      <span className="font-semibold text-green-600">${rate.totalCharges.toFixed(2)}</span>
                                    </div>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Billing Options */}
                  {currentStep === 3 && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">Billing Options</h3>

                      <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="billing"
                            checked={billingOption === 'sender'}
                            onChange={() => setBillingOption('sender')}
                            className="rounded-full"
                            data-testid="radio-bill-sender"
                          />
                          <span>Bill to Sender (Our Account)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="billing"
                            checked={billingOption === 'receiver'}
                            onChange={() => setBillingOption('receiver')}
                            className="rounded-full"
                            data-testid="radio-bill-receiver"
                          />
                          <span>Bill to Receiver</span>
                        </label>
                      </div>

                      {billingOption === 'receiver' && (
                        <div className="ml-6 space-y-3 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Enter receiver's UPS account information (will be used for all {selectedOrders.length} orders):
                          </p>
                          <div>
                            <Label htmlFor="accountNumber">UPS Account Number</Label>
                            <Input
                              id="accountNumber"
                              value={receiverAccount.accountNumber}
                              onChange={(e) => setReceiverAccount({ ...receiverAccount, accountNumber: e.target.value })}
                              placeholder="Enter UPS account number"
                              data-testid="input-receiver-account"
                            />
                          </div>
                          <div>
                            <Label htmlFor="accountZip">Account ZIP Code</Label>
                            <Input
                              id="accountZip"
                              value={receiverAccount.zipCode}
                              onChange={(e) => setReceiverAccount({ ...receiverAccount, zipCode: e.target.value })}
                              placeholder="12345"
                              data-testid="input-receiver-zip"
                            />
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
                        <h4 className="font-semibold">Summary</h4>
                        <div className="text-sm space-y-1">
                          <div>Orders: <strong>{selectedOrders.length}</strong></div>
                          <div>Service: <strong>{getServiceName(selectedService)}</strong></div>
                          <div>Declared Value: <strong>${packageDefaults.declaredValue}</strong> each</div>
                          <div>Billing: <strong>{billingOption === 'sender' ? 'Our Account' : 'Receiver Account'}</strong></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex gap-2 pt-4 border-t">
                    {currentStep > 1 && (
                      <Button
                        variant="outline"
                        onClick={() => setCurrentStep(currentStep - 1)}
                        data-testid="button-previous"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                    )}
                    <div className="flex-1" />
                    {currentStep < 3 && (
                      <Button
                        onClick={() => {
                          if (currentStep === 1) {
                            // Moving to step 2, fetch rates
                            handleGetRates();
                            setCurrentStep(2);
                          } else {
                            setCurrentStep(currentStep + 1);
                          }
                        }}
                        disabled={currentStep === 2 && loadingRates}
                        data-testid="button-next"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                    {currentStep === 3 && (
                      <Button
                        onClick={handleCreateBulkLabels}
                        disabled={isProcessing || (billingOption === 'receiver' && (!receiverAccount.accountNumber || !receiverAccount.zipCode))}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-create-labels"
                      >
                        <DollarSign className="h-4 w-4 mr-2" />
                        {isProcessing ? 'Creating Labels...' : `Create ${selectedOrders.length} Labels`}
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

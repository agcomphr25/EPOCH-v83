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
import { Truck, Package, X, ChevronLeft, ChevronRight, DollarSign, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface BulkShippingActionsProps {
  selectedOrders: string[];
  onClearSelection: () => void;
  shippingOrders: any[];
}

interface PackageDetails {
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
  const [addressValidation, setAddressValidation] = useState<{ valid: boolean; message: string } | null>(null);

  // Package details for consolidated shipment
  const [packageDetails, setPackageDetails] = useState<PackageDetails>({
    weight: 5,
    length: 12,
    width: 12,
    height: 12,
    declaredValue: 100,
  });

  // Service Selection
  const [selectedService, setSelectedService] = useState('03');
  const [availableRates, setAvailableRates] = useState<any[]>([]);

  // Billing Options
  const [billingOption, setBillingOption] = useState<'sender' | 'receiver'>('sender');
  const [receiverAccount, setReceiverAccount] = useState<ReceiverAccount>({
    accountNumber: '',
    zipCode: '',
  });

  const selectedOrdersData = shippingOrders.filter((order) =>
    selectedOrders.includes(order.orderId)
  );

  // Validate all orders have same shipping address
  useEffect(() => {
    if (dialogOpen && selectedOrders.length > 0) {
      console.log('🔍 Validating addresses for orders:', selectedOrders);
      console.log('🔍 Selected orders data:', selectedOrdersData);
      
      const addresses = selectedOrdersData.map(order => {
        // Use the enriched shippingAddress from parent component
        const addr = order.shippingAddress;
        console.log(`🔍 Order ${order.orderId} shipping address:`, addr);
        if (!addr) return null;
        return `${addr.street || ''}|${addr.city || ''}|${addr.state || ''}|${addr.zipCode || ''}`;
      });

      console.log('🔍 Raw addresses:', addresses);
      const validAddresses = addresses.filter(addr => addr && addr !== '|||');
      console.log('🔍 Valid addresses:', validAddresses);
      const uniqueAddresses = [...new Set(validAddresses)];
      console.log('🔍 Unique addresses:', uniqueAddresses);
      
      let newValidation;
      if (validAddresses.length === 0) {
        newValidation = { valid: false, message: 'No shipping addresses found for selected orders' };
      } else if (uniqueAddresses.length > 1) {
        newValidation = { valid: false, message: 'Selected orders have different shipping addresses. Bulk shipping requires all orders to go to the same address.' };
      } else {
        newValidation = { valid: true, message: `All ${selectedOrders.length} orders shipping to same address` };
      }
      
      console.log('🔍 Validation result:', newValidation);
      
      // Only update if validation result actually changed
      setAddressValidation(prev => {
        if (!prev || prev.valid !== newValidation.valid || prev.message !== newValidation.message) {
          return newValidation;
        }
        return prev;
      });
    }
  }, [dialogOpen, selectedOrders.length]);

  const resetForm = () => {
    setCurrentStep(1);
    setPackageDetails({
      weight: 5,
      length: 12,
      width: 12,
      height: 12,
      declaredValue: 100,
    });
    setSelectedService('03');
    setAvailableRates([]);
    setBillingOption('sender');
    setReceiverAccount({ accountNumber: '', zipCode: '' });
    setAddressValidation(null);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleGetRates = async () => {
    if (!addressValidation?.valid) {
      toast({
        title: 'Address Validation Failed',
        description: addressValidation?.message || 'Please verify addresses match',
        variant: 'destructive',
      });
      return;
    }

    setLoadingRates(true);
    try {
      // Use first order's enriched shipping address
      const firstOrder = selectedOrdersData[0];
      if (!firstOrder) {
        throw new Error('No orders selected');
      }

      const shippingAddress = firstOrder.shippingAddress;
      if (!shippingAddress) {
        throw new Error('No shipping address found for selected orders');
      }

      const response = await axios.post('/api/shipping/get-rates', {
        shipToAddress: {
          street: shippingAddress.street || '',
          city: shippingAddress.city || '',
          state: shippingAddress.state || '',
          zipCode: shippingAddress.zipCode || '',
          country: shippingAddress.country || 'US',
        },
        packageWeight: packageDetails.weight,
        packageDimensions: {
          length: packageDetails.length,
          width: packageDetails.width,
          height: packageDetails.height,
        },
      });

      setAvailableRates(response.data.rates || []);
      
      toast({
        title: 'Rates Retrieved',
        description: `Found ${response.data.rates?.length || 0} shipping options`,
      });
    } catch (error: any) {
      console.error('Error fetching rates:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to fetch shipping rates',
        variant: 'destructive',
      });
    } finally {
      setLoadingRates(false);
    }
  };

  const handleCreateConsolidatedLabel = async () => {
    if (!addressValidation?.valid) {
      toast({
        title: 'Cannot Create Label',
        description: 'All orders must have the same shipping address',
        variant: 'destructive',
      });
      return;
    }

    if (billingOption === 'receiver') {
      if (!receiverAccount.accountNumber || !receiverAccount.zipCode) {
        toast({
          title: 'Validation Error',
          description: 'Please enter receiver UPS account number and ZIP code',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsProcessing(true);
    try {
      const response = await axios.post('/api/shipping/bulk/create-consolidated-label', {
        orderIds: selectedOrders,
        packageDetails: {
          weight: packageDetails.weight,
          length: packageDetails.length,
          width: packageDetails.width,
          height: packageDetails.height,
        },
        serviceCode: selectedService,
        billingOption,
        receiverAccount: billingOption === 'receiver' ? receiverAccount : undefined,
        declaredValue: packageDetails.declaredValue,
      });

      const { success, trackingNumber, labelImage } = response.data;

      if (success && trackingNumber) {
        toast({
          title: 'Bulk Shipping Label Created',
          description: `Tracking #${trackingNumber} applied to all ${selectedOrders.length} orders`,
        });

        // Download label
        if (labelImage) {
          const link = document.createElement('a');
          link.href = `data:image/png;base64,${labelImage}`;
          link.download = `bulk-label-${selectedOrders.join('-')}.png`;
          link.click();
        }

        setDialogOpen(false);
        onClearSelection();
        resetForm();
      } else {
        toast({
          title: 'Label Creation Failed',
          description: response.data.error || 'Failed to create shipping label',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error creating consolidated label:', error);
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create shipping label',
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
            Consolidated Shipping
            <Badge variant="secondary" data-testid="badge-selected-count">{selectedOrders.length} orders</Badge>
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
            <strong>Orders:</strong> {selectedOrders.join(', ')}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            📦 All orders will be packed in one box with one tracking number
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button className="flex-1" data-testid="button-create-bulk-labels">
                  <Truck className="h-4 w-4 mr-2" />
                  Create Consolidated Shipping Label
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    Consolidated Shipping - Step {currentStep} of 3
                  </DialogTitle>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <div className={`h-2 w-16 rounded ${currentStep >= 1 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    <div className={`h-2 w-16 rounded ${currentStep >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                    <div className={`h-2 w-16 rounded ${currentStep >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`} />
                  </div>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {/* Step 1: Address Validation & Package Details */}
                  {currentStep === 1 && (
                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">Package Details</h3>

                      {/* Address Validation Alert */}
                      {addressValidation && (
                        <Alert variant={addressValidation.valid ? 'default' : 'destructive'}>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{addressValidation.message}</AlertDescription>
                        </Alert>
                      )}

                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Enter total package weight and dimensions for the consolidated shipment containing all {selectedOrders.length} orders
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="weight">Total Weight (lbs)</Label>
                          <Input
                            id="weight"
                            type="number"
                            value={packageDetails.weight}
                            onChange={(e) => setPackageDetails({ ...packageDetails, weight: parseFloat(e.target.value) || 0 })}
                            data-testid="input-weight"
                          />
                        </div>
                        <div>
                          <Label htmlFor="declaredValue">Declared Value ($)</Label>
                          <Input
                            id="declaredValue"
                            type="number"
                            value={packageDetails.declaredValue}
                            onChange={(e) => setPackageDetails({ ...packageDetails, declaredValue: parseFloat(e.target.value) || 0 })}
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
                            value={packageDetails.length}
                            onChange={(e) => setPackageDetails({ ...packageDetails, length: parseFloat(e.target.value) || 0 })}
                            data-testid="input-length"
                          />
                        </div>
                        <div>
                          <Label htmlFor="width">Width (in)</Label>
                          <Input
                            id="width"
                            type="number"
                            value={packageDetails.width}
                            onChange={(e) => setPackageDetails({ ...packageDetails, width: parseFloat(e.target.value) || 0 })}
                            data-testid="input-width"
                          />
                        </div>
                        <div>
                          <Label htmlFor="height">Height (in)</Label>
                          <Input
                            id="height"
                            type="number"
                            value={packageDetails.height}
                            onChange={(e) => setPackageDetails({ ...packageDetails, height: parseFloat(e.target.value) || 0 })}
                            data-testid="input-height"
                          />
                        </div>
                      </div>

                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm space-y-1">
                        <div><strong>📦 Consolidated Shipping:</strong></div>
                        <div>• ONE box containing all {selectedOrders.length} orders</div>
                        <div>• ONE tracking number applied to all orders</div>
                        <div>• All orders must ship to the same address</div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Service Selection */}
                  {currentStep === 2 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-lg">Select Shipping Service</h3>
                        <Button
                          onClick={handleGetRates}
                          disabled={loadingRates || !addressValidation?.valid}
                          variant="outline"
                          size="sm"
                          data-testid="button-get-rates"
                        >
                          {loadingRates ? 'Loading...' : 'Refresh Rates'}
                        </Button>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Compare UPS shipping rates for the consolidated package:
                      </p>

                      <div className="space-y-2">
                        {availableRates.length > 0 ? (
                          availableRates.map((rate: any) => (
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
                                  ${rate.totalCharges.toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-gray-500 bg-gray-50 dark:bg-gray-900 rounded-lg">
                            <Package className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            <p>Click "Refresh Rates" to see shipping options</p>
                          </div>
                        )}
                      </div>
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
                        <h4 className="font-semibold">Consolidated Shipment Summary</h4>
                        <div className="text-sm space-y-1">
                          <div>📦 Orders in Package: <strong>{selectedOrders.join(', ')}</strong></div>
                          <div>📊 Total Weight: <strong>{packageDetails.weight} lbs</strong></div>
                          <div>🚚 Service: <strong>{getServiceName(selectedService)}</strong></div>
                          <div>💰 Declared Value: <strong>${packageDetails.declaredValue}</strong></div>
                          <div>💳 Billing: <strong>{billingOption === 'sender' ? 'Our Account' : 'Receiver Account'}</strong></div>
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
                          if (currentStep === 1 && !addressValidation?.valid) {
                            toast({
                              title: 'Address Validation Required',
                              description: addressValidation?.message || 'All orders must have the same shipping address',
                              variant: 'destructive',
                            });
                            return;
                          }
                          setCurrentStep(currentStep + 1);
                        }}
                        disabled={!addressValidation?.valid}
                        data-testid="button-next"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    )}
                    {currentStep === 3 && (
                      <Button
                        onClick={handleCreateConsolidatedLabel}
                        disabled={isProcessing || !addressValidation?.valid || (billingOption === 'receiver' && (!receiverAccount.accountNumber || !receiverAccount.zipCode))}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="button-create-labels"
                      >
                        <Package className="h-4 w-4 mr-2" />
                        {isProcessing ? 'Creating Label...' : 'Create Consolidated Label'}
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

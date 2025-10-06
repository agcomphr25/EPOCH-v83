import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Package, X, Mail, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface BulkShippingActionsProps {
  selectedOrders: string[];
  onClearSelection: () => void;
  shippingOrders: any[];
}

interface ShippingAddress {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface PackageDetails {
  weight: string;
  length: string;
  width: string;
  height: string;
}

interface ReceiverAccount {
  accountNumber: string;
  zipCode: string;
}

interface UPSRate {
  serviceCode: string;
  serviceName: string;
  totalCharges: string;
  estimatedDelivery: string;
}

export function BulkShippingActions({ selectedOrders, onClearSelection, shippingOrders }: BulkShippingActionsProps) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: ''
  });

  // Get customers data for auto-populating address
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
  });

  // Get the first selected order's customer ID for address lookup
  const firstOrderCustomerId = selectedOrders.length > 0 
    ? shippingOrders.find(order => order.orderId === selectedOrders[0])?.customerId 
    : null;

  // Fetch customer address for the first selected order
  const { data: customerAddresses = [] } = useQuery({
    queryKey: ['/api/customers', firstOrderCustomerId, 'addresses'],
    queryFn: async () => {
      if (!firstOrderCustomerId) return [];
      const response = await fetch(`/api/customers/${firstOrderCustomerId}/addresses`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!firstOrderCustomerId && dialogOpen,
  });
  
  const [packageDetails, setPackageDetails] = useState<PackageDetails>({
    weight: '',
    length: '',
    width: '',
    height: ''
  });

  const [communicationMethod, setCommunicationMethod] = useState<'email' | 'sms'>('email');
  const [billingOption, setBillingOption] = useState<'sender' | 'receiver'>('sender');
  const [receiverAccount, setReceiverAccount] = useState<ReceiverAccount>({
    accountNumber: '',
    zipCode: ''
  });
  const [isCalculatingRates, setIsCalculatingRates] = useState(false);
  const [shippingRates, setShippingRates] = useState<UPSRate[]>([]);
  const [selectedRate, setSelectedRate] = useState<UPSRate | null>(null);

  const selectedOrdersData = shippingOrders.filter(order => 
    selectedOrders.includes(order.orderId)
  );

  // Auto-populate shipping address when dialog opens
  useEffect(() => {
    if (dialogOpen && customerAddresses.length > 0 && firstOrderCustomerId) {
      const customersList = customers as any[];
      const customerInfo = customersList.find((c: any) => c.id.toString() === firstOrderCustomerId.toString());
      
      // Find default shipping address or fallback to first address
      let address = customerAddresses.find((a: any) => 
        a.type === 'shipping' && a.isDefault
      );
      
      if (!address) {
        address = customerAddresses.find((a: any) => 
          a.type === 'both' && a.isDefault
        );
      }
      
      if (!address) {
        address = customerAddresses.find((a: any) => a.isDefault);
      }
      
      if (!address && customerAddresses.length > 0) {
        address = customerAddresses[0];
      }

      if (address && customerInfo) {
        setShippingAddress({
          name: customerInfo.name || '',
          street: address.street || '',
          city: address.city || '',
          state: address.state || '',
          zip: address.zipCode || ''
        });
      }
    }
  }, [dialogOpen, customerAddresses, customers, firstOrderCustomerId]);

  const resetForm = () => {
    setShippingAddress({
      name: '',
      street: '',
      city: '',
      state: '',
      zip: ''
    });
    setPackageDetails({
      weight: '',
      length: '',
      width: '',
      height: ''
    });
    setBillingOption('sender');
    setReceiverAccount({
      accountNumber: '',
      zipCode: ''
    });
    setShippingRates([]);
    setSelectedRate(null);
  };

  const calculateUPSRates = async () => {
    if (!shippingAddress.zip || !packageDetails.weight) {
      toast({
        title: "Missing Information",
        description: "Please enter destination ZIP code and package weight first",
        variant: "destructive"
      });
      return;
    }

    setIsCalculatingRates(true);
    try {
      const response = await axios.post('/api/shipping/calculate-rates', {
        destination: {
          zipCode: shippingAddress.zip,
          country: 'US'
        },
        packageDetails: {
          weight: parseFloat(packageDetails.weight),
          dimensions: {
            length: parseFloat(packageDetails.length) || 12,
            width: parseFloat(packageDetails.width) || 12,
            height: parseFloat(packageDetails.height) || 12
          }
        }
      });

      setShippingRates(response.data.rates || []);
      if (response.data.rates && response.data.rates.length > 0) {
        setSelectedRate(response.data.rates[0]); // Select first rate by default
      }
    } catch (error) {
      console.error('Error calculating UPS rates:', error);
      toast({
        title: "Rate Calculation Failed",
        description: "Unable to calculate shipping rates. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCalculatingRates(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const downloadPdf = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const generateTrackingNumber = () => {
    // Generate a realistic UPS tracking number format
    const prefix = '1Z';
    const account = 'A999';
    const service = '00';
    const sequence = Math.random().toString().substr(2, 8);
    const checkDigit = Math.floor(Math.random() * 10);
    return `${prefix}${account}${service}${sequence}${checkDigit}`;
  };

  const sendCustomerNotification = async (orderId: string, trackingNumber: string, customerInfo: any) => {
    try {
      const notificationData = {
        orderId,
        trackingNumber,
        customerName: customerInfo.customer || 'Customer',
        customerEmail: customerInfo.email || null,
        customerPhone: customerInfo.phone || null,
        method: communicationMethod,
        message: `Your order ${orderId} has been shipped! Tracking number: ${trackingNumber}. You can track your package at ups.com.`
      };

      const response = await axios.post('/api/communications/send-notification', notificationData);
      
      return response.data;
    } catch (error) {
      console.error('Error sending notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const handleBulkShipping = async () => {
    setIsProcessing(true);
    let successCount = 0;
    let notificationResults: any[] = [];

    try {
      // Use real UPS tracking if rate is selected, otherwise use mock
      const useRealUPS = selectedRate && billingOption;
      let trackingNumber;

      if (useRealUPS) {
        // Create real UPS shipping label with selected service
        const upsResponse = await axios.post('/api/shipping/create-bulk-label', {
          orderIds: selectedOrders,
          shipTo: shippingAddress,
          packageDetails: {
            weight: parseFloat(packageDetails.weight),
            dimensions: {
              length: parseFloat(packageDetails.length),
              width: parseFloat(packageDetails.width), 
              height: parseFloat(packageDetails.height)
            }
          },
          serviceCode: selectedRate.serviceCode,
          billingOption,
          receiverAccount: billingOption === 'receiver' ? receiverAccount : undefined
        });

        trackingNumber = upsResponse.data.trackingNumber;
        
        // Download the actual UPS label
        if (upsResponse.data.labelBase64) {
          const link = document.createElement('a');
          link.href = `data:image/gif;base64,${upsResponse.data.labelBase64}`;
          link.download = `UPS-Bulk-Label-${trackingNumber}.gif`;
          link.click();
        }
      } else {
        // Fallback to mock PDF generation
        trackingNumber = generateTrackingNumber();
        
        const response = await axios.post('/api/shipping-pdf/bulk-shipping-labels', {
          orderIds: selectedOrders,
          shippingAddress,
          packageDetails,
          trackingNumber
        }, {
          responseType: 'blob'
        });

        downloadPdf(response.data, `Bulk-Shipping-Label-${trackingNumber}.pdf`);
      }

      // Send notifications to customers
      for (const order of selectedOrdersData) {
        try {
          const result = await sendCustomerNotification(
            order.orderId, 
            trackingNumber, 
            { customer: order.customer, email: order.customerEmail, phone: order.customerPhone }
          );
          notificationResults.push({ orderId: order.orderId, ...result });
          if (result.success) successCount++;
        } catch (error) {
          notificationResults.push({ 
            orderId: order.orderId, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Show success message
      toast({
        title: "Bulk Shipping Completed",
        description: `${selectedOrders.length} orders shipped with tracking ${trackingNumber}. ${successCount} notifications sent successfully.`,
      });

      // Close dialog and clear selection
      setDialogOpen(false);
      onClearSelection();
      
      // Reset form
      resetForm();

    } catch (error) {
      console.error('Error processing bulk shipping:', error);
      toast({
        title: "Error",
        description: "Failed to process bulk shipping. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Bulk Shipping Actions
            <Badge variant="secondary">{selectedOrders.length} selected</Badge>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClearSelection}
            className="text-blue-600 hover:text-blue-800"
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
                <Button className="flex-1">
                  <Truck className="h-4 w-4 mr-2" />
                  Create Bulk Shipping Label
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Bulk Shipping for {selectedOrders.length} Orders</DialogTitle>
                  <DialogDescription>
                    Create shipping labels and track packages for multiple orders at once. Fill in the shipping address, package details, and billing options below.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-4">
                  {/* Left Column - Shipping & Package Details */}
                  <div className="space-y-6">
                    {/* Shipping Address */}
                    <div>
                      <Label className="text-base font-semibold">Shipping Address</Label>
                      <div className="space-y-3 mt-3">
                        <Input
                          placeholder="Customer Name"
                          value={shippingAddress.name}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, name: e.target.value })}
                        />
                        <Input
                          placeholder="Street Address"
                          value={shippingAddress.street}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, street: e.target.value })}
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            placeholder="City"
                            value={shippingAddress.city}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                          />
                          <Input
                            placeholder="State"
                            value={shippingAddress.state}
                            onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                          />
                        </div>
                        <Input
                          placeholder="ZIP Code"
                          value={shippingAddress.zip}
                          onChange={(e) => setShippingAddress({ ...shippingAddress, zip: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Package Details */}
                    <div>
                      <Label className="text-base font-semibold">Package Details</Label>
                      <div className="space-y-3 mt-3">
                        <Input
                          placeholder="Total Weight (lbs)"
                          value={packageDetails.weight}
                          onChange={(e) => setPackageDetails({ ...packageDetails, weight: e.target.value })}
                        />
                        <div className="grid grid-cols-3 gap-3">
                          <Input
                            placeholder="Length (in)"
                            value={packageDetails.length}
                            onChange={(e) => setPackageDetails({ ...packageDetails, length: e.target.value })}
                          />
                          <Input
                            placeholder="Width (in)"
                            value={packageDetails.width}
                            onChange={(e) => setPackageDetails({ ...packageDetails, width: e.target.value })}
                          />
                          <Input
                            placeholder="Height (in)"
                            value={packageDetails.height}
                            onChange={(e) => setPackageDetails({ ...packageDetails, height: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Billing & Orders */}
                  <div className="space-y-6">
                    {/* Billing Options */}
                    <div>
                      <Label className="text-base font-semibold">Billing Options</Label>
                      <div className="space-y-3 mt-3">
                        <Select value={billingOption} onValueChange={(value: 'sender' | 'receiver') => setBillingOption(value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select billing option" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sender">Bill Sender (AG Composites)</SelectItem>
                            <SelectItem value="receiver">Bill Receiver</SelectItem>
                          </SelectContent>
                        </Select>
                        
                        {billingOption === 'receiver' && (
                          <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border">
                            <Label className="text-sm font-medium">Receiver UPS Account</Label>
                            <Input
                              placeholder="UPS Account Number"
                              value={receiverAccount.accountNumber}
                              onChange={(e) => setReceiverAccount({ ...receiverAccount, accountNumber: e.target.value })}
                            />
                            <Input
                              placeholder="Account ZIP Code"
                              value={receiverAccount.zipCode}
                              onChange={(e) => setReceiverAccount({ ...receiverAccount, zipCode: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* UPS Rate Calculator */}
                    <div>
                      <Label className="text-base font-semibold">UPS Rate Calculator</Label>
                      <div className="mt-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={calculateUPSRates}
                          disabled={!shippingAddress.zip || !packageDetails.weight || isCalculatingRates}
                          className="w-full"
                        >
                          {isCalculatingRates ? 'Calculating...' : 'Get UPS Shipping Rates'}
                        </Button>
                        
                        {shippingRates.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <Label className="text-sm font-medium">Available Services</Label>
                            <div className="max-h-40 overflow-y-auto space-y-2">
                              {shippingRates.map((rate) => (
                                <div
                                  key={rate.serviceCode}
                                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                    selectedRate?.serviceCode === rate.serviceCode
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => setSelectedRate(rate)}
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium">{rate.serviceName}</span>
                                    <span className="font-bold">${rate.totalCharges}</span>
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    Est. Delivery: {rate.estimatedDelivery}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Communication Method */}
                    <div>
                      <Label className="text-base font-semibold">Customer Notification Method</Label>
                      <Select value={communicationMethod} onValueChange={(value: 'email' | 'sms') => setCommunicationMethod(value)}>
                        <SelectTrigger className="mt-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              Email Notification
                            </div>
                          </SelectItem>
                          <SelectItem value="sms">
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              SMS Notification
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Selected Orders List */}
                    <div>
                      <Label className="text-base font-semibold">Orders to Ship ({selectedOrders.length})</Label>
                      <div className="mt-3 max-h-48 overflow-y-auto border rounded-lg p-3 bg-gray-50 dark:bg-gray-800">
                        <div className="space-y-2">
                          {selectedOrdersData.map((order, index) => (
                            <div key={order.orderId} className="flex justify-between items-center py-2 px-3 bg-white dark:bg-gray-700 rounded border">
                              <span className="font-medium">{order.orderId}</span>
                              <span className="text-gray-600 dark:text-gray-300 text-sm">{order.customer}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => handleDialogClose(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleBulkShipping}
                    disabled={isProcessing || !shippingAddress.name || !shippingAddress.street}
                    className="flex-1"
                  >
                    {isProcessing ? 'Processing...' : 'Ship & Notify Customers'}
                  </Button>
                </div>
                
                <div className="text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg mt-4">
                  <strong>Note:</strong> This will generate a single shipping label for all selected orders 
                  and automatically send tracking information to each customer via their preferred communication method.
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, Truck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export default function ShippingLabelPage() {
  const [location, setLocation] = useLocation();
  const [match, params] = useRoute('/shipping/label/:orderId');
  const { toast } = useToast();
  
  const orderId = params?.orderId;
  
  const [shippingDetails, setShippingDetails] = useState({
    weight: '10',
    length: '12',
    width: '12', 
    height: '12',
    value: '500',
    billingOption: 'sender', // 'sender', 'receiver'
    receiverAccount: {
      accountNumber: '',
      zipCode: ''
    },
    address: {
      name: '',
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'US'
    }
  });

  // Get order details
  const { data: orderDetails, isLoading: orderLoading } = useQuery({
    queryKey: [`/api/orders/${orderId}`],
    enabled: !!orderId
  });

  // Get customer data
  const { data: customers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['/api/customers']
  });

  // Get customer addresses
  const customerId = (orderDetails as any)?.customerId;
  const { data: customerAddresses = [], isLoading: addressLoading } = useQuery({
    queryKey: [`/api/customers/${customerId}/addresses`],
    enabled: !!customerId
  });

  // Try different ways to match customer ID (handles string/number mismatches)
  const customerInfo = (customers as any[]).find((c: any) => 
    c.id === customerId || 
    c.id === String(customerId) || 
    String(c.id) === String(customerId)
  );
  const customerAddress = (customerAddresses as any[])?.[0];
  


  // Pre-populate address when customer data loads
  useEffect(() => {
    if (customerAddress && customerInfo) {
      setShippingDetails(prev => ({
        ...prev,
        address: {
          name: customerInfo.name || '',
          street: customerAddress.street || '',
          city: customerAddress.city || '',
          state: customerAddress.state || '',
          zip: customerAddress.zipCode || '',
          country: customerAddress.country === 'United States' ? 'US' : customerAddress.country || 'US'
        }
      }));
    }
  }, [customerAddress, customerInfo]);

  const generateShippingLabel = async () => {
    if (!orderId) return;
    
    try {
      const response = await fetch('/api/shipping/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderId,
          shipTo: shippingDetails.address,
          package: {
            weight: parseFloat(shippingDetails.weight),
            length: parseFloat(shippingDetails.length),
            width: parseFloat(shippingDetails.width),
            height: parseFloat(shippingDetails.height)
          },
          declaredValue: parseFloat(shippingDetails.value),
          billingOption: shippingDetails.billingOption,
          receiverAccount: shippingDetails.billingOption === 'receiver' ? shippingDetails.receiverAccount : undefined
        })
      });

      if (response.ok) {
        const labelData = await response.json();
        toast({
          title: "Shipping Label Generated",
          description: `Label created with tracking number: ${labelData.trackingNumber}`,
        });
        
        // Open label PDF in new window
        if (labelData.labelUrl) {
          window.open(labelData.labelUrl, '_blank');
        }
      } else {
        const error = await response.json();
        toast({
          title: "Error generating label",
          description: error.message || "Failed to create shipping label",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error generating shipping label:', error);
      toast({
        title: "Error generating label",
        description: "Failed to create shipping label",
        variant: "destructive"
      });
    }
  };

  if (!orderId) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Invalid Order</h1>
          <p className="mb-4">No order ID provided</p>
          <Button onClick={() => setLocation('/shipping')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Shipping
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button 
            variant="outline" 
            onClick={() => setLocation('/shipping')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Shipping
          </Button>
          <div className="flex items-center gap-3">
            <Package className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Create Shipping Label for Order {orderId}
            </h1>
          </div>
        </div>


        {/* Order Summary */}
        {orderDetails && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Order Summary
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p><span className="font-medium">Customer:</span> {
                    customersLoading ? 'Loading...' : 
                    customerInfo?.name || `Unknown Customer (ID: ${customerId})`
                  }</p>
                  <p><span className="font-medium">Order Date:</span> {(orderDetails as any)?.orderDate ? format(new Date((orderDetails as any).orderDate), 'MMM dd, yyyy') : 'N/A'}</p>
                  {(orderDetails as any)?.dueDate && (
                    <p><span className="font-medium">Due Date:</span> {format(new Date((orderDetails as any).dueDate), 'MMM dd, yyyy')}</p>
                  )}
                </div>
                <div>
                  <p><span className="font-medium">Department:</span> {(orderDetails as any)?.currentDept || 'N/A'}</p>
                  <p><span className="font-medium">Total:</span> ${(orderDetails as any)?.totalAmount || '0.00'}</p>
                  <p><span className="font-medium">Customer ID:</span> {customerId || 'Not found'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Package Details */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Package Details</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
                    <input
                      type="number"
                      value={shippingDetails.weight}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, weight: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Declared Value ($)</label>
                    <input
                      type="number"
                      value={shippingDetails.value}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, value: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="500"
                    />
                  </div>
                </div>
                
                <h4 className="font-medium">Dimensions (inches)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Length</label>
                    <input
                      type="number"
                      value={shippingDetails.length}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, length: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Width</label>
                    <input
                      type="number"
                      value={shippingDetails.width}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, width: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="12"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Height</label>
                    <input
                      type="number"
                      value={shippingDetails.height}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, height: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="12"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Address & Billing */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-4">Shipping & Billing</h3>
              
              {/* Shipping Address */}
              <div className="mb-6">
                <h4 className="font-medium mb-2">Ship To Address</h4>
                {addressLoading ? (
                  <div className="p-3 bg-blue-50 rounded-md text-sm">
                    Loading address...
                  </div>
                ) : customerAddress ? (
                  <div className="p-3 bg-gray-50 rounded-md text-sm">
                    <div className="font-medium">{customerInfo?.name || 'Customer'}</div>
                    <div>{customerAddress.street}</div>
                    {customerAddress.street2 && <div>{customerAddress.street2}</div>}
                    <div>{customerAddress.city}, {customerAddress.state} {customerAddress.zipCode}</div>
                    {customerAddress.country !== 'United States' && (
                      <div>{customerAddress.country}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-red-500 text-sm">
                    ⚠️ No shipping address found
                    <br />
                    <small>Customer ID: {customerId || 'None'}</small>
                  </div>
                )}
              </div>

              {/* Billing Options */}
              <div className="space-y-4">
                <h4 className="font-medium">Billing Options</h4>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="billing"
                      checked={shippingDetails.billingOption === 'sender'}
                      onChange={() => setShippingDetails(prev => ({ ...prev, billingOption: 'sender' }))}
                      className="mr-2"
                    />
                    Bill to Sender (Our Account)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="billing"
                      checked={shippingDetails.billingOption === 'receiver'}
                      onChange={() => setShippingDetails(prev => ({ ...prev, billingOption: 'receiver' }))}
                      className="mr-2"
                    />
                    Bill to Receiver
                  </label>
                </div>
                
                {shippingDetails.billingOption === 'receiver' && (
                  <div className="ml-6 space-y-3 p-4 bg-blue-50 rounded-lg">
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">UPS Account Number</label>
                        <input
                          type="text"
                          value={shippingDetails.receiverAccount.accountNumber}
                          onChange={(e) => setShippingDetails(prev => ({ 
                            ...prev, 
                            receiverAccount: { ...prev.receiverAccount, accountNumber: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="Enter UPS account number"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Account ZIP Code</label>
                        <input
                          type="text"
                          value={shippingDetails.receiverAccount.zipCode}
                          onChange={(e) => setShippingDetails(prev => ({ 
                            ...prev, 
                            receiverAccount: { ...prev.receiverAccount, zipCode: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="12345"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4 justify-end">
          <Button 
            variant="outline" 
            onClick={() => setLocation('/shipping')}
            className="px-6"
          >
            Cancel
          </Button>
          <Button 
            onClick={generateShippingLabel}
            className="px-6 bg-blue-600 hover:bg-blue-700"
          >
            <Package className="h-4 w-4 mr-2" />
            Generate Shipping Label
          </Button>
        </div>
      </div>
    </div>
  );
}
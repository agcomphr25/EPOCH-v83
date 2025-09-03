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
    weight: '3',
    length: '8',
    width: '4', 
    height: '36',
    value: '400',
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

  // Get order details with customer data in single request for better performance
  const { data: orderDetails, isLoading: orderLoading } = useQuery({
    queryKey: [`/api/shipping/order/${orderId}`],
    enabled: !!orderId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes to reduce API calls
  });

  // Customer info now comes directly from the order details API
  const customerInfo = (orderDetails as any)?.customer;
  const customerAddress = (orderDetails as any)?.addresses?.[0];
  const shippingAddress = (orderDetails as any)?.shippingAddress;
  

  // Pre-populate address when order data loads - prioritize order-specific shipping address
  useEffect(() => {
    if (shippingAddress) {
      setShippingDetails(prev => ({
        ...prev,
        address: {
          name: shippingAddress.name || '',
          street: shippingAddress.street || '',
          city: shippingAddress.city || '',
          state: shippingAddress.state || '',
          zip: shippingAddress.zipCode || '',
          country: shippingAddress.country === 'United States' ? 'US' : shippingAddress.country || 'US'
        }
      }));
    } else if (customerAddress && customerInfo) {
      // Fallback to customer address if no shipping address
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
  }, [shippingAddress, customerAddress, customerInfo]);

  const generateShippingLabel = async () => {
    if (!orderId) return;
    
    // Show loading state immediately
    toast({
      title: "Creating Label",
      description: "Generating UPS shipping label... This may take up to 2 minutes in deployment.",
    });
    
    try {
      // Create abort controller for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout
      
      const response = await fetch('/api/shipping/create-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderId,
          shipTo: shippingDetails.address,
          packageDetails: {
            weight: parseFloat(shippingDetails.weight),
            dimensions: {
              length: parseFloat(shippingDetails.length),
              width: parseFloat(shippingDetails.width),
              height: parseFloat(shippingDetails.height)
            }
          },
          declaredValue: parseFloat(shippingDetails.value),
          billingOption: shippingDetails.billingOption,
          receiverAccount: shippingDetails.billingOption === 'receiver' ? shippingDetails.receiverAccount : undefined
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (response.ok) {
        const labelData = await response.json();
        toast({
          title: "Shipping Label Generated",
          description: `Label created with tracking number: ${labelData.trackingNumber}`,
        });
        
        // Handle label display and download
        if (labelData.labelBase64) {
          // Create a data URL from the Base64 string
          const dataUrl = `data:image/gif;base64,${labelData.labelBase64}`;
          
          // Always trigger automatic download for deployment compatibility
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = `UPS_Label_${orderId}_${labelData.trackingNumber || 'label'}.gif`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          toast({
            title: "Label Downloaded",
            description: "Shipping label has been downloaded. You can now print it from your downloads folder.",
            variant: "default"
          });
        }
      } else {
        const error = await response.json();
        let errorMessage = "Failed to create shipping label";
        
        if (error.error?.includes("Invalid Access License")) {
          errorMessage = "UPS API credentials need to be updated. Please contact system administrator.";
        } else if (error.error) {
          errorMessage = error.error;
        }
        
        toast({
          title: "Error generating label",
          description: errorMessage,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Error generating shipping label:', error);
      
      let errorMessage = "Failed to create shipping label";
      let errorTitle = "Error generating label";
      
      if (error.name === 'AbortError') {
        errorTitle = "Request Timeout";
        errorMessage = "Label creation took too long and was cancelled. This can happen in slow network conditions. Please try again.";
      } else if (error.message?.includes('fetch')) {
        errorMessage = "Network error - please check your connection and try again.";
      }
      
      toast({
        title: errorTitle,
        description: errorMessage,
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
                    orderLoading ? 'Loading...' : 
                    customerInfo?.name || `Unknown Customer (ID: ${(orderDetails as any)?.customerId || 'None'})`
                  }</p>
                  <p><span className="font-medium">Order Date:</span> {(orderDetails as any)?.orderDate ? format(new Date((orderDetails as any).orderDate), 'MMM dd, yyyy') : 'N/A'}</p>
                  {(orderDetails as any)?.dueDate && (
                    <p><span className="font-medium">Due Date:</span> {format(new Date((orderDetails as any).dueDate), 'MMM dd, yyyy')}</p>
                  )}
                </div>
                <div>
                  <p><span className="font-medium">Department:</span> {(orderDetails as any)?.currentDept || 'N/A'}</p>
                  <p><span className="font-medium">Total:</span> ${(orderDetails as any)?.totalAmount || '0.00'}</p>
                  <p><span className="font-medium">Customer ID:</span> {(orderDetails as any)?.customerId || 'Not found'}</p>
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
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium">Ship To Address</h4>
                  {shippingAddress && (
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      shippingAddress.source === 'order_specific' ? 'bg-green-100 text-green-800' :
                      shippingAddress.source === 'alternate_customer' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {shippingAddress.source === 'order_specific' ? '📦 Order-Specific Address' :
                       shippingAddress.source === 'alternate_customer' ? '🔄 Alternate Customer' :
                       '👤 Customer Default'}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Customer Name</label>
                    <input
                      type="text"
                      value={shippingDetails.address.name}
                      onChange={(e) => setShippingDetails(prev => ({ 
                        ...prev, 
                        address: { ...prev.address, name: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                      placeholder="Customer name"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Street Address</label>
                    <input
                      type="text"
                      value={shippingDetails.address.street}
                      onChange={(e) => setShippingDetails(prev => ({ 
                        ...prev, 
                        address: { ...prev.address, street: e.target.value }
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                      placeholder="Street address"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">City</label>
                      <input
                        type="text"
                        value={shippingDetails.address.city}
                        onChange={(e) => setShippingDetails(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, city: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">State</label>
                      <input
                        type="text"
                        value={shippingDetails.address.state}
                        onChange={(e) => setShippingDetails(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, state: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                        placeholder="State"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">ZIP Code</label>
                      <input
                        type="text"
                        value={shippingDetails.address.zip}
                        onChange={(e) => setShippingDetails(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, zip: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                        placeholder="ZIP code"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Country</label>
                      <select
                        value={shippingDetails.address.country}
                        onChange={(e) => setShippingDetails(prev => ({ 
                          ...prev, 
                          address: { ...prev.address, country: e.target.value }
                        }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                      >
                        <option value="US">United States</option>
                        <option value="CA">Canada</option>
                        <option value="MX">Mexico</option>
                      </select>
                    </div>
                  </div>
                  
                  {orderLoading && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900 rounded-md text-sm">
                      Loading customer address...
                    </div>
                  )}
                  
                  {!orderLoading && !customerAddress && (
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded-md text-sm">
                      ⚠️ No default customer address found. Please enter shipping address manually.
                    </div>
                  )}
                </div>
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
            onClick={() => setLocation('/departments/shipping')}
            className="px-6"
          >
            Back to Shipping Department
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
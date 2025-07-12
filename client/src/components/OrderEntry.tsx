import React, { useEffect, useState, useCallback } from 'react';
import { Combobox } from '@headlessui/react';
import { generateP1OrderId } from '@/utils/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Package, Users } from 'lucide-react';
import debounce from 'lodash.debounce';

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface StockModel {
  id: string;
  name: string;
  cost: number;
}

interface FeatureDefinition {
  id: string;
  name: string;
  type: 'dropdown' | 'search' | 'text';
  options?: { value: string; label: string }[];
}

export default function OrderEntry() {
  const { toast } = useToast();

  // Form state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);

  const [modelOptions, setModelOptions] = useState<StockModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [rushLevel, setRushLevel] = useState('none');
  const [orderDate, setOrderDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCustomerPO, setHasCustomerPO] = useState(false);
  const [customerPO, setCustomerPO] = useState('');
  const [handedness, setHandedness] = useState('');
  
  // Paint options data
  const [paintFeatures, setPaintFeatures] = useState<any[]>([]);
  const [paintQuery, setPaintQuery] = useState('');
  
  // Order summary data
  const [discountCode, setDiscountCode] = useState('');
  const [shipping, setShipping] = useState(36.95);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [additionalItems, setAdditionalItems] = useState<any[]>([]);

  // Load initial data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load last order ID
        const lastIdResponse = await apiRequest('/api/orders/last-id');
        setLastOrderId(lastIdResponse.lastOrderId);

        // Mock data for now - in real implementation, load from API
        setModelOptions([
          { id: 'model1', name: 'AR-15 Basic', cost: 800 },
          { id: 'model2', name: 'AR-15 Enhanced', cost: 1200 },
          { id: 'model3', name: 'AR-10 Standard', cost: 1500 },
        ]);

        // Load features from API (group paint options under one feature)
        const featuresResponse = await apiRequest('/api/features');
        const activeFeatures = featuresResponse.filter((feature: any) => feature.isActive);
        
        // Group paint options into a single feature
        const paintFeatures = activeFeatures.filter((feature: any) => feature.category === 'paint_options');
        const nonPaintFeatures = activeFeatures.filter((feature: any) => feature.category !== 'paint_options');
        
        // Store paint features for modal use
        setPaintFeatures(paintFeatures);
        
        // Create a single Paint Options feature with all options from all sub-categories
        const allPaintOptions = paintFeatures.flatMap((feature: any) => 
          (feature.options || []).map((option: any) => ({
            value: `${feature.id}:${option.value}`,
            label: `${feature.displayName || feature.name} - ${option.label}`,
            category: feature.displayName || feature.name
          }))
        );
        
        const paintOptionsFeature = {
          id: 'paint_options_combined',
          name: 'Paint Options',
          type: 'combobox',
          options: allPaintOptions
        };
        
        const finalFeatures = paintFeatures.length > 0 
          ? [...nonPaintFeatures, paintOptionsFeature]
          : nonPaintFeatures;
        
        setFeatureDefs(finalFeatures.map((feature: any) => ({
          id: feature.id,
          name: feature.displayName || feature.name,
          type: feature.type,
          options: feature.options || []
        })));

        setCustomerOptions([
          { id: 'cust1', name: 'ABC Defense', email: 'contact@abcdefense.com' },
          { id: 'cust2', name: 'XYZ Tactical', email: 'orders@xyztactical.com' },
          { id: 'cust3', name: 'Smith Industries', email: 'john@smithind.com' },
        ]);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Generate order ID when order date changes
  useEffect(() => {
    if (lastOrderId) {
      const newOrderId = generateP1OrderId(orderDate, lastOrderId);
      setOrderId(newOrderId);
    }
  }, [orderDate, lastOrderId]);

  // Calculate order totals
  const calculateTotals = () => {
    const selectedModel = modelOptions.find(m => m.id === modelId);
    const basePrice = selectedModel?.cost || 0;
    
    // Calculate feature costs (in real implementation, features would have prices)
    const featureCost = 0; // Placeholder - would calculate based on selected features
    
    // Calculate rush cost
    const rushCost = rushLevel === '4wk' ? 200 : rushLevel === '6wk' ? 250 : 0;
    
    const subtotal = basePrice + featureCost + rushCost;
    const total = subtotal + shipping;
    
    return { basePrice, featureCost, rushCost, subtotal, total };
  };

  const { basePrice, featureCost, rushCost, subtotal, total } = calculateTotals();

  // Debounced customer search
  const debouncedCustomerSearch = useCallback(
    debounce((query: string) => {
      // In real implementation, this would search via API
      console.log('Searching customers:', query);
    }, 300),
    []
  );

  useEffect(() => {
    if (customerQuery.length > 0) {
      debouncedCustomerSearch(customerQuery);
    }
  }, [customerQuery, debouncedCustomerSearch]);

  const onSingleSubmit = async () => {
    setErrors({});
    setIsSubmitting(true);

    try {
      await apiRequest('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          orderDate: orderDate.toISOString(),
          customerId: customer?.id,
          modelId,
          features,
          rushLevel,
        }),
      });

      // Update last order ID
      setLastOrderId(orderId);
      
      toast({
        title: "Order Created",
        description: `Order ${orderId} created successfully!`,
      });

      // Reset form
      setCustomer(null);
      setCustomerQuery('');
      setModelId('');
      setFeatures({});
      setRushLevel('none');
      
    } catch (error: any) {
      if (error.response?.data?.errors) {
        setErrors(error.response.data.errors);
      } else {
        toast({
          title: "Error",
          description: "Failed to create order",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          Order Entry
        </h1>
        <p className="text-gray-600 mt-2">Create new stock order</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Form */}
        <div className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Order Entry
              </CardTitle>
            </CardHeader>
            <CardContent>
          <div className="space-y-6">
            {/* Order Info Row - Order ID, Order Date, Due Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orderId">Order ID</Label>
                <Input
                  value={orderId}
                  readOnly
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderDate">Order Date</Label>
                <Input
                  type="date"
                  value={orderDate.toISOString().substr(0, 10)}
                  onChange={(e) => setOrderDate(new Date(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  type="date"
                  value={dueDate.toISOString().substr(0, 10)}
                  onChange={(e) => setDueDate(new Date(e.target.value))}
                />
              </div>
            </div>

            {/* Main Order Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Selection */}
              <div className="space-y-2">
                <Label htmlFor="customer">Customer</Label>
                <Combobox value={customer} onChange={setCustomer}>
                  <div className="relative">
                    <Combobox.Input
                      className="w-full border rounded-md px-3 py-2"
                      placeholder="Search customer..."
                      displayValue={(customer: Customer) => customer?.name || ''}
                      onChange={(event) => setCustomerQuery(event.target.value)}
                    />
                    <Combobox.Options className="absolute z-10 w-full bg-white border rounded-md mt-1 max-h-60 overflow-auto">
                      {customerOptions.map((customer) => (
                        <Combobox.Option
                          key={customer.id}
                          value={customer}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2 pl-3 pr-9 ${
                              active ? 'bg-blue-600 text-white' : 'text-gray-900'
                            }`
                          }
                        >
                          {customer.name}
                        </Combobox.Option>
                      ))}
                    </Combobox.Options>
                  </div>
                </Combobox>
                {errors.customerId && <p className="text-red-500 text-sm">{errors.customerId}</p>}
              </div>

              {/* Customer PO */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hasCustomerPO"
                    checked={hasCustomerPO}
                    onChange={(e) => {
                      setHasCustomerPO(e.target.checked);
                      if (!e.target.checked) {
                        setCustomerPO('');
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="hasCustomerPO">Customer PO</Label>
                </div>
                {hasCustomerPO && (
                  <Input
                    type="text"
                    placeholder="Enter customer PO number..."
                    value={customerPO}
                    onChange={(e) => setCustomerPO(e.target.value)}
                  />
                )}
                {errors.customerPO && <p className="text-red-500 text-sm">{errors.customerPO}</p>}
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <Label htmlFor="model">Stock Model</Label>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.modelId && <p className="text-red-500 text-sm">{errors.modelId}</p>}
              </div>

              {/* Handedness */}
              <div className="space-y-2">
                <Label htmlFor="handedness">Handedness</Label>
                <Select value={handedness} onValueChange={setHandedness}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select handedness..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                  </SelectContent>
                </Select>
                {errors.handedness && <p className="text-red-500 text-sm">{errors.handedness}</p>}
              </div>

              {/* Dynamic Feature Inputs */}
              {featureDefs.map((featureDef) => (
                <div key={featureDef.id} className="space-y-2">
                  <Label className="capitalize">{featureDef.name}</Label>
                  {featureDef.type === 'dropdown' && (
                    <Select
                      value={features[featureDef.id] || ''}
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, [featureDef.id]: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDef.options?.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {featureDef.type === 'combobox' && (
                    <Combobox
                      value={features[featureDef.id] || ''}
                      onChange={(value) => {
                        setFeatures(prev => ({ ...prev, [featureDef.id]: value }));
                        setPaintQuery('');
                      }}
                    >
                      <div className="relative">
                        <Combobox.Input
                          className="w-full border rounded-md px-3 py-2 bg-white"
                          placeholder="Select or search..."
                          displayValue={(value: string) => {
                            const option = featureDef.options?.find(opt => opt.value === value);
                            return option ? option.label : '';
                          }}
                          onChange={(event) => setPaintQuery(event.target.value)}
                        />
                        <Combobox.Options className="absolute z-10 w-full bg-white border rounded-md shadow-lg max-h-60 overflow-auto">
                          {featureDef.options?.filter((option) => 
                            option.label.toLowerCase().includes(paintQuery.toLowerCase())
                          ).map((option) => (
                            <Combobox.Option
                              key={option.value}
                              value={option.value}
                              className={({ active }) =>
                                `relative cursor-default select-none py-2 pl-3 pr-9 ${
                                  active ? 'bg-blue-600 text-white' : 'text-gray-900'
                                }`
                              }
                            >
                              {option.label}
                            </Combobox.Option>
                          ))}
                        </Combobox.Options>
                      </div>
                    </Combobox>
                  )}
                  {featureDef.type === 'textarea' && (
                    <textarea
                      className="w-full border rounded-md px-3 py-2 min-h-[80px] resize-vertical"
                      placeholder={featureDef.placeholder || 'Enter details...'}
                      value={features[featureDef.id] || ''}
                      onChange={(e) =>
                        setFeatures(prev => ({ ...prev, [featureDef.id]: e.target.value }))
                      }
                    />
                  )}
                  {featureDef.type === 'text' && (
                    <Input
                      type="text"
                      placeholder={featureDef.placeholder || 'Enter text...'}
                      value={features[featureDef.id] || ''}
                      onChange={(e) =>
                        setFeatures(prev => ({ ...prev, [featureDef.id]: e.target.value }))
                      }
                    />
                  )}
                  {featureDef.type === 'number' && (
                    <Input
                      type="number"
                      placeholder={featureDef.placeholder || 'Enter number...'}
                      value={features[featureDef.id] || ''}
                      onChange={(e) =>
                        setFeatures(prev => ({ ...prev, [featureDef.id]: e.target.value }))
                      }
                    />
                  )}
                  {errors[`features.${featureDef.id}`] && (
                    <p className="text-red-500 text-sm">{errors[`features.${featureDef.id}`]}</p>
                  )}
                </div>
              ))}

              {/* Rush Level */}
              <div className="space-y-2">
                <Label htmlFor="rush">Rush Option</Label>
                <Select value={rushLevel} onValueChange={setRushLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="4wk">4 wk (+$200)</SelectItem>
                    <SelectItem value="6wk">6 wk (+$250)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Special Instructions */}
              <div className="md:col-span-2 space-y-2">
                <Label>Special Instructions</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 min-h-[100px] resize-vertical"
                  placeholder="Any special requirements or notes..."
                  value={features.specialInstructions || ''}
                  onChange={(e) => setFeatures(prev => ({ ...prev, specialInstructions: e.target.value }))}
                />
              </div>
            </div>
          </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary Sidebar */}
        <div className="w-full lg:w-96">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Pricing */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">1</span>
                  <span className="text-2xl font-bold text-blue-600">${basePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Items</span>
                  <span>Current Stock</span>
                </div>
              </div>

              {/* Discount Code */}
              <div className="space-y-2">
                <Label>Discount Code</Label>
                <Select value={discountCode} onValueChange={setDiscountCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select discount code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SAVE10">SAVE10 - 10% Off</SelectItem>
                    <SelectItem value="SAVE20">SAVE20 - 20% Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Shipping */}
              <div className="space-y-2">
                <Label>Shipping & Handling</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={shipping}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                />
              </div>

              {/* Totals */}
              <div className="space-y-2 pt-4 border-t">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping & Handling:</span>
                  <span>${shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-blue-600">${total.toFixed(2)}</span>
                </div>
              </div>

              {/* Mark as Paid */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="markAsPaid"
                  checked={markAsPaid}
                  onChange={(e) => setMarkAsPaid(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="markAsPaid">Mark as Paid</Label>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    // Save to pending logic
                    console.log('Saving to pending...');
                  }}
                >
                  Save to Pending
                </Button>
                <Button
                  className="w-full"
                  onClick={onSingleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating...' : 'Create Order'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
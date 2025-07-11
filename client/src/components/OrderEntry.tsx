import React, { useEffect, useState, useCallback } from 'react';
import { Combobox } from '@headlessui/react';
import { generateP1OrderId } from '@/utils/orderUtils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

        setFeatureDefs([
          {
            id: 'barrel',
            name: 'Barrel Length',
            type: 'dropdown',
            options: [
              { value: '16in', label: '16 inch' },
              { value: '18in', label: '18 inch' },
              { value: '20in', label: '20 inch' },
            ],
          },
          {
            id: 'finish',
            name: 'Finish',
            type: 'dropdown',
            options: [
              { value: 'black', label: 'Black Anodized' },
              { value: 'fde', label: 'FDE' },
              { value: 'odg', label: 'OD Green' },
            ],
          },
        ]);

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
        <p className="text-gray-600 mt-2">Create new manufacturing orders</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Single Order Entry
          </CardTitle>
        </CardHeader>
        <CardContent>
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

            {/* Dynamic Feature Inputs */}
            {featureDefs.map((featureDef) => (
              <div key={featureDef.id} className="space-y-2">
                <Label className="capitalize">{featureDef.name}</Label>
                {featureDef.type === 'dropdown' && (
                  <Select
                    value={features[featureDef.id] || ''}
                    onValueChange={(value) =>
                      setFeatures(prev => ({ ...prev, [featureDef.id]: value }))
                    }
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

            {/* Order Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Order Date</Label>
              <Input
                type="date"
                value={orderDate.toISOString().substr(0, 10)}
                onChange={(e) => setOrderDate(new Date(e.target.value))}
              />
            </div>

            {/* Auto-generated Order ID */}
            <div className="space-y-2">
              <Label htmlFor="orderId">Order ID</Label>
              <Input
                value={orderId}
                readOnly
                className="bg-gray-50"
              />
            </div>

            {/* Submit Button */}
            <div className="md:col-span-2">
              <Button
                onClick={onSingleSubmit}
                disabled={isSubmitting}
                className="w-full md:w-auto"
              >
                {isSubmitting ? 'Creating...' : 'Submit Order'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
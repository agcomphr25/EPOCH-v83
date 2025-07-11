import React, { useEffect, useState, useCallback } from 'react';
import { Tab } from '@headlessui/react';
import { Combobox } from '@headlessui/react';
import { generateP1OrderId } from '@/utils/orderUtils';
import { CsvDataImporter } from './CsvDataImporter';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Package, Upload, Users } from 'lucide-react';
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

interface BulkOrderData {
  orderId: string;
  orderDate: string;
  customerId?: string;
  customerName?: string;
  modelId: string;
  features: Record<string, any>;
  rushLevel: string;
  status: string;
}

export default function OrderEntry() {
  const { toast } = useToast();
  const [tabIndex, setTabIndex] = useState(0);

  // Single entry state
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

  // Bulk upload state
  const [bulkData, setBulkData] = useState<BulkOrderData[]>([]);
  const [bulkStatus, setBulkStatus] = useState<{ success: boolean; summary?: any; error?: string } | null>(null);

  // Load initial data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Get last order ID for P1 orders
        const lastIdRes = await apiRequest('/api/orders/last-id?p1=true');
        setLastOrderId(lastIdRes.lastOrderId || 'AN000');

        // Load stock models (using existing CSV data as mock for now)
        const mockModels: StockModel[] = [
          { id: '1', name: 'Adj K2 - Fiberglass', cost: 0 },
          { id: '2', name: 'Privateer - Carbon Fiber', cost: 689 },
          { id: '3', name: 'Chalk Branch - Carbon Fiber', cost: 719 },
          { id: '4', name: 'Alpine Hunter - Carbon Fiber', cost: 719 },
          { id: '5', name: 'CAT - Carbon Fiber', cost: 689 },
        ];
        setModelOptions(mockModels);
        
        setOrderDate(new Date());
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Compute orderId when date or lastOrderId changes
  useEffect(() => {
    if (orderDate && lastOrderId) {
      setOrderId(generateP1OrderId(orderDate, lastOrderId));
    }
  }, [orderDate, lastOrderId]);

  // Load features when model changes
  useEffect(() => {
    if (!modelId) return;
    
    // Mock feature definitions for now
    const mockFeatures: FeatureDefinition[] = [
      {
        id: 'hand',
        name: 'Hand',
        type: 'dropdown',
        options: [
          { value: 'right', label: 'Right' },
          { value: 'left', label: 'Left' }
        ]
      },
      {
        id: 'barrel',
        name: 'Barrel',
        type: 'dropdown',
        options: [
          { value: 'remington-varmint', label: 'Remington Varmint' },
          { value: 'benchmark-5', label: 'Benchmark #5' },
          { value: 'proof-sendero', label: 'Proof Sendero' }
        ]
      },
      {
        id: 'paint',
        name: 'Paint',
        type: 'dropdown',
        options: [
          { value: 'blue-camo', label: 'Blue Camo' },
          { value: 'carbon-zebra', label: 'Carbon Zebra Camo' },
          { value: 'erosion-rogue', label: 'Erosion Rogue' }
        ]
      }
    ];
    
    setFeatureDefs(mockFeatures);
    setFeatures({});
  }, [modelId]);

  // Debounced customer search
  const doCustomerSearch = useCallback(
    debounce(async (query: string) => {
      try {
        // Mock customer data for now
        const mockCustomers: Customer[] = [
          { id: '1', name: 'Mark Graziano', email: 'm55graziano@yahoo.com' },
          { id: '2', name: 'Meredith Rifles', email: '' },
          { id: '3', name: 'Thomas Hale', email: 'hale_tommy@hotmail.com' },
          { id: '4', name: 'Andrew Johnson', email: 'andrewjohnsonplumbing@gmail.com' },
        ].filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
        
        setCustomerOptions(mockCustomers);
      } catch (error) {
        console.error('Customer search failed:', error);
      }
    }, 300),
    []
  );

  useEffect(() => {
    if (customerQuery.trim()) {
      doCustomerSearch(customerQuery);
    } else {
      setCustomerOptions([]);
    }
  }, [customerQuery, doCustomerSearch]);

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

  const handleBulkParsed = (rows: any[]) => {
    let currLast = lastOrderId || 'AN000';
    const mapped = rows.map((row, idx) => {
      const dt = new Date();
      currLast = generateP1OrderId(dt, currLast);
      return {
        ...row,
        orderId: currLast,
        orderDate: dt.toISOString(),
        status: 'pending',
      };
    });
    setBulkData(mapped);
    setLastOrderId(currLast);
  };

  const uploadBulk = async () => {
    try {
      const payload = bulkData.map(r => ({
        orderId: r.orderId,
        orderDate: r.orderDate,
        customerId: r.customerId,
        modelId: r.modelId,
        features: r.features,
        rushLevel: r.rushLevel,
      }));

      const res = await apiRequest('/api/orders/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setBulkStatus({ success: true, summary: res });
      toast({
        title: "Bulk Upload Complete",
        description: `Successfully uploaded ${payload.length} orders`,
      });
    } catch (error: any) {
      setBulkStatus({ success: false, error: error.message });
      toast({
        title: "Bulk Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          Order Entry
        </h1>
        <p className="text-gray-600 mt-2">Create single orders or bulk upload from CSV</p>
      </div>

      <Tab.Group selectedIndex={tabIndex} onChange={setTabIndex}>
        <Tab.List className="flex space-x-1 rounded-xl bg-blue-900/20 p-1 mb-6">
          {['Single Entry', 'Bulk Upload'].map((tab) => (
            <Tab
              key={tab}
              className={({ selected }) =>
                `w-full rounded-lg py-2.5 text-sm font-medium leading-5 text-blue-700 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
                  selected
                    ? 'bg-white shadow'
                    : 'text-blue-100 hover:bg-white/[0.12] hover:text-white'
                }`
              }
            >
              {tab}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels>
          {/* Single Entry Panel */}
          <Tab.Panel>
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
          </Tab.Panel>

          {/* Bulk Upload Panel */}
          <Tab.Panel>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Bulk Order Upload
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CsvDataImporter onDataParsed={handleBulkParsed} />

                {bulkData.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h3 className="text-lg font-semibold">Preview ({bulkData.length} orders)</h3>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Order ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Model</TableHead>
                            <TableHead>Rush</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bulkData.map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono">{row.orderId}</TableCell>
                              <TableCell>{row.customerName || row.customerId}</TableCell>
                              <TableCell>{row.modelId}</TableCell>
                              <TableCell>{row.rushLevel}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{row.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <Button onClick={uploadBulk} className="w-full md:w-auto">
                      Upload All Orders
                    </Button>

                    {bulkStatus && (
                      <div className={`p-4 rounded-lg ${
                        bulkStatus.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                      }`}>
                        {bulkStatus.success
                          ? `Successfully uploaded ${bulkStatus.summary?.count || bulkData.length} orders.`
                          : `Error uploading bulk orders: ${bulkStatus.error}`}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
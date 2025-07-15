import React, { useEffect, useState, useCallback, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Package, Users, ChevronDown, Send, CheckCircle } from 'lucide-react';
import debounce from 'lodash.debounce';
import { useLocation, useRoute } from 'wouter';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import type { Customer } from '@shared/schema';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

interface FeatureDefinition {
  id: string;
  name: string;
  type: 'dropdown' | 'search' | 'text';
  options?: { value: string; label: string }[];
}

export default function OrderEntry() {
  const { toast } = useToast();
  const [location] = useLocation();

  // Extract draft ID from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const draftId = urlParams.get('draft');

  // Draft management state
  const [orderStatus, setOrderStatus] = useState('DRAFT');
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Form state
  const [customer, setCustomer] = useState<Customer | null>(null);

  const [modelOptions, setModelOptions] = useState<StockModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [features, setFeatures] = useState<Record<string, any>>({});

  const [orderDate, setOrderDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCustomerPO, setHasCustomerPO] = useState(false);
  const [customerPO, setCustomerPO] = useState('');
  const [fbOrderNumber, setFbOrderNumber] = useState('');
  const [hasAgrOrder, setHasAgrOrder] = useState(false);
  const [agrOrderDetails, setAgrOrderDetails] = useState('');
  const [handedness, setHandedness] = useState('');
  const [shankLength, setShankLength] = useState('');

  // Paint options data
  const [paintFeatures, setPaintFeatures] = useState<any[]>([]);
  const [paintQuery, setPaintQuery] = useState('');
  const [allFeatures, setAllFeatures] = useState<any[]>([]);

  // Quantities for checkbox options (feature_id -> { option_value: quantity })
  const [featureQuantities, setFeatureQuantities] = useState<Record<string, Record<string, number>>>({});

  // Order summary data
  const [discountCode, setDiscountCode] = useState('');
  const [shipping, setShipping] = useState(36.95);
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [additionalItems, setAdditionalItems] = useState<any[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [payments, setPayments] = useState<{type: string, date: Date, amount: number}[]>([]);

  // Discount data
  const [shortTermSales, setShortTermSales] = useState<any[]>([]);
  const [persistentDiscounts, setPersistentDiscounts] = useState<any[]>([]);
  const [customerTypes, setCustomerTypes] = useState<any[]>([]);
  const [subCategories, setSubCategories] = useState<any[]>([]);

  // Load initial data on mount
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Set loading state if there's a draft ID
        if (draftId) {
          setIsLoadingDraft(true);
        }

        // Load all data in parallel
        const [lastIdResponse, featuresResponse, salesResponse, discountsResponse, typesResponse, subCategoriesResponse] = await Promise.all([
          apiRequest('/api/orders/last-id'),
          apiRequest('/api/features'),
          apiRequest('/api/short-term-sales'),
          apiRequest('/api/persistent-discounts'),
          apiRequest('/api/customer-types'),
          apiRequest('/api/feature-sub-categories')
        ]);

        // Load customer options first

        // Load stock models
        const stockModelsResponse = await apiRequest('/api/stock-models');
        setModelOptions(stockModelsResponse || []);

        // Set last order ID
        setLastOrderId(lastIdResponse?.lastOrderId || null);

        // Load discounts data
        setShortTermSales(salesResponse || []);
        setPersistentDiscounts(discountsResponse || []);
        setCustomerTypes(typesResponse || []);
        setSubCategories(subCategoriesResponse || []);

        // Store all features for processing
        const allFeatures = featuresResponse || [];
        setAllFeatures(allFeatures);

        // Debug: Log all features to see what we're working with
        console.log('All features loaded:', allFeatures);

        // Separate paint features from other features
        const paintFeatures = allFeatures.filter((f: any) => f.category === 'paint_options');
        const nonPaintFeatures = allFeatures.filter((f: any) => f.category !== 'paint_options');

        console.log('Paint features:', paintFeatures);
        console.log('Non-paint features:', nonPaintFeatures);

        setPaintFeatures(paintFeatures);

        // Create combined paint options from all paint features
        const allPaintOptions = paintFeatures.reduce((acc: any[], feature: any) => {
          if (feature.options && Array.isArray(feature.options)) {
            const optionsWithFeatureId = feature.options.map((option: any) => ({
              value: `${feature.id}:${option.value}`,
              label: `${feature.displayName || feature.name} - ${option.label}`,
              price: option.price || 0
            }));
            return [...acc, ...optionsWithFeatureId];
          }
          return acc;
        }, []);

        const paintOptionsFeature = {
          id: 'paint_options_combined',
          name: 'Paint Options',
          type: 'combobox',
          options: allPaintOptions
        };

        const finalFeatures = paintFeatures.length > 0 
          ? [...nonPaintFeatures, paintOptionsFeature]
          : nonPaintFeatures;

        const mappedFeatures = finalFeatures.map((feature: any) => ({
          id: feature.id,
          name: feature.displayName || feature.name,
          type: feature.type,
          options: feature.options || []
        }));

        console.log('Final mapped features for display:', mappedFeatures);
        setFeatureDefs(mappedFeatures);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setIsLoadingDraft(false);
      }
    };

    loadInitialData();
  }, [draftId]);

  // Load draft data if draft ID is present
  useEffect(() => {
    if (draftId && !isLoadingDraft) {
      const loadDraftData = async () => {
        try {
          const draftResponse = await apiRequest(`/api/orders/draft/${draftId}`);
          if (draftResponse) {
            // Populate form with draft data
            setCustomer(draftResponse.customer || null);
            setModelId(draftResponse.modelId || '');
            setFeatures(draftResponse.features || {});
            setOrderDate(new Date(draftResponse.orderDate || new Date()));
            setDueDate(new Date(draftResponse.dueDate || new Date()));
            setOrderId(draftResponse.orderId || '');
            setHasCustomerPO(draftResponse.hasCustomerPO || false);
            setCustomerPO(draftResponse.customerPO || '');
            setFbOrderNumber(draftResponse.fbOrderNumber || '');
            setHasAgrOrder(draftResponse.hasAgrOrder || false);
            setAgrOrderDetails(draftResponse.agrOrderDetails || '');
            setHandedness(draftResponse.handedness || '');
            setShankLength(draftResponse.shankLength || '');
            setDiscountCode(draftResponse.discountCode || '');
            setShipping(draftResponse.shipping || 36.95);
            setMarkAsPaid(draftResponse.markAsPaid || false);
            setAdditionalItems(draftResponse.additionalItems || []);
            setPayments(draftResponse.payments || []);
            setFeatureQuantities(draftResponse.featureQuantities || {});
            setOrderStatus(draftResponse.status || 'DRAFT');
          }
        } catch (error) {
          console.error('Failed to load draft data:', error);
          toast({
            title: "Error",
            description: "Failed to load draft data",
            variant: "destructive",
          });
        }
      };
      loadDraftData();
    }
  }, [draftId, isLoadingDraft, toast]);

  // Generate order ID when needed
  useEffect(() => {
    if (!orderId && lastOrderId) {
      generateOrderId();
    }
  }, [lastOrderId]);

  const generateOrderId = useCallback(async () => {
    try {
      const response = await apiRequest('/api/orders/generate-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: orderDate.toISOString(), 
          lastId: lastOrderId 
        })
      });
      setOrderId(response.orderId);
    } catch (error) {
      console.error('Failed to generate order ID:', error);
    }
  }, [orderDate, lastOrderId]);

  // Calculate total price
  const calculateTotal = useCallback(() => {
    const selectedModel = modelOptions.find(m => m.id === modelId);
    const basePrice = selectedModel?.price || 0;

    // Calculate feature costs - includes both individual feature prices and paint sub-category pricing
    let featureCost = 0;

    // Calculate paint options cost based on sub-category pricing
    const paintOptionsValue = features['paint_options_combined'];
    if (paintOptionsValue) {
      // Extract the feature ID from the paint options value (format: "featureId:optionValue")
      const [featureId, optionValue] = paintOptionsValue.split(':');

      // Find the original paint feature from the loaded features to get its sub-category
      const paintFeature = paintFeatures.find(f => f.id === featureId);
      if (paintFeature && paintFeature.subCategory) {
        // Find the sub-category and its price
        const subCategory = subCategories.find(sc => sc.id === paintFeature.subCategory);
        if (subCategory && subCategory.price) {
          featureCost += subCategory.price;
        }
      }
    }

    // Calculate non-paint feature costs
    for (const [featureId, value] of Object.entries(features)) {
      if (featureId === 'paint_options_combined') continue; // Already handled above

      const feature = allFeatures.find(f => f.id === featureId);
      if (feature && feature.options) {
        if (feature.type === 'checkbox') {
          // For checkbox features, calculate based on quantities
          const quantities = featureQuantities[featureId] || {};
          for (const [optionValue, quantity] of Object.entries(quantities)) {
            const option = feature.options.find((opt: any) => opt.value === optionValue);
            if (option && option.price && quantity > 0) {
              featureCost += option.price * quantity;
            }
          }
        } else {
          // For other feature types, find the selected option
          const selectedOption = feature.options.find((opt: any) => opt.value === value);
          if (selectedOption && selectedOption.price) {
            featureCost += selectedOption.price;
          }
        }
      }
    }

    // Calculate additional items cost
    const additionalItemsCost = additionalItems.reduce((sum, item) => sum + item.price, 0);

    // Calculate discount
    let discountAmount = 0;
    if (discountCode) {
      const sale = shortTermSales.find(s => s.code === discountCode);
      if (sale) {
        if (sale.type === 'percentage') {
          discountAmount = (basePrice + featureCost) * (sale.value / 100);
        } else {
          discountAmount = sale.value;
        }
      }
    }

    // Calculate customer type discount
    let customerTypeDiscount = 0;
    if (customer && customer.customerType) {
      const customerType = customerTypes.find(ct => ct.id === customer.customerType);
      if (customerType && customerType.discountPercentage) {
        customerTypeDiscount = (basePrice + featureCost) * (customerType.discountPercentage / 100);
      }
    }

    // Calculate persistent discount
    let persistentDiscount = 0;
    if (customer) {
      const discount = persistentDiscounts.find(pd => pd.customerId === customer.id);
      if (discount) {
        if (discount.type === 'percentage') {
          persistentDiscount = (basePrice + featureCost) * (discount.value / 100);
        } else {
          persistentDiscount = discount.value;
        }
      }
    }

    const totalDiscount = discountAmount + customerTypeDiscount + persistentDiscount;
    const subtotal = basePrice + featureCost + additionalItemsCost - totalDiscount;
    const total = subtotal + shipping;

    return {
      basePrice,
      featureCost,
      additionalItemsCost,
      discountAmount,
      customerTypeDiscount,
      persistentDiscount,
      totalDiscount,
      subtotal,
      shipping,
      total
    };
  }, [modelId, modelOptions, features, additionalItems, discountCode, shipping, shortTermSales, customer, customerTypes, persistentDiscounts, paintFeatures, subCategories, allFeatures, featureQuantities]);

  const pricing = calculateTotal();

  const handleSubmit = async (action: 'save' | 'confirm' | 'finalize') => {
    setErrors({});
    const isSubmittingState = action === 'save' ? setIsSubmitting : (action === 'confirm' ? setIsConfirming : setIsFinalizing);
    
    isSubmittingState(true);
    
    try {
      const orderData = {
        customerId: customer?.id,
        modelId,
        features,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        orderId,
        hasCustomerPO,
        customerPO,
        fbOrderNumber,
        hasAgrOrder,
        agrOrderDetails,
        handedness,
        shankLength,
        discountCode,
        shipping,
        markAsPaid,
        additionalItems,
        payments,
        featureQuantities,
        status: action === 'save' ? 'DRAFT' : (action === 'confirm' ? 'CONFIRMED' : 'FINALIZED'),
        pricing: calculateTotal()
      };

      const endpoint = action === 'save' ? '/api/orders/draft' : '/api/orders';
      const method = draftId && action === 'save' ? 'PUT' : 'POST';
      const url = draftId && action === 'save' ? `/api/orders/draft/${draftId}` : endpoint;

      const response = await apiRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      if (action === 'save') {
        toast({
          title: "Success",
          description: "Order saved as draft",
        });
      } else if (action === 'confirm') {
        toast({
          title: "Success", 
          description: "Order confirmed successfully",
        });
        setOrderStatus('CONFIRMED');
      } else {
        toast({
          title: "Success",
          description: "Order finalized successfully",
        });
        setOrderStatus('FINALIZED');
      }

    } catch (error: any) {
      console.error('Submit error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save order",
        variant: "destructive",
      });
    } finally {
      isSubmittingState(false);
    }
  };

  const filteredPaintOptions = paintFeatures.filter(feature => {
    const searchTerm = paintQuery.toLowerCase();
    return feature.displayName?.toLowerCase().includes(searchTerm) || 
           feature.name?.toLowerCase().includes(searchTerm) ||
           feature.options?.some((option: any) => option.label?.toLowerCase().includes(searchTerm));
  });

  const allPaintOptions = paintFeatures.reduce((acc: any[], feature: any) => {
    if (feature.options && Array.isArray(feature.options)) {
      const optionsWithFeatureId = feature.options.map((option: any) => ({
        value: `${feature.id}:${option.value}`,
        label: `${feature.displayName || feature.name} - ${option.label}`,
        price: option.price || 0
      }));
      return [...acc, ...optionsWithFeatureId];
    }
    return acc;
  }, []);

  const filteredAllPaintOptions = allPaintOptions.filter(option => {
    const searchTerm = paintQuery.toLowerCase();
    return option.label.toLowerCase().includes(searchTerm);
  });

  if (isLoadingDraft) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardHeader>
            <CardTitle>Loading Draft...</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Entry
                {orderStatus !== 'DRAFT' && (
                  <Badge variant={orderStatus === 'CONFIRMED' ? 'default' : 'secondary'}>
                    {orderStatus}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Order ID, Date, Due Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orderId">Order ID</Label>
                  <Input
                    id="orderId"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="Generated automatically"
                  />
                  {errors.orderId && <p className="text-red-500 text-sm">{errors.orderId}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orderDate">Order Date</Label>
                  <Input
                    id="orderDate"
                    type="date"
                    value={orderDate.toISOString().split('T')[0]}
                    onChange={(e) => setOrderDate(new Date(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={dueDate.toISOString().split('T')[0]}
                    onChange={(e) => setDueDate(new Date(e.target.value))}
                  />
                </div>
              </div>

              {/* Customer Selection */}
              <div className="space-y-2">
                <Label>Customer</Label>
                <CustomerSearchInput
                  value={customer}
                  onValueChange={setCustomer}
                  error={errors.customer}
                />
                {errors.customer && <p className="text-red-500 text-sm">{errors.customer}</p>}
              </div>

              {/* Customer PO Checkbox */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="hasCustomerPO"
                  checked={hasCustomerPO}
                  onChange={(e) => setHasCustomerPO(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="hasCustomerPO">Customer PO</Label>
              </div>

              {/* Customer PO Input (conditional) */}
              {hasCustomerPO && (
                <div className="space-y-2">
                  <Label htmlFor="customerPO">Customer PO Number</Label>
                  <Input
                    id="customerPO"
                    value={customerPO}
                    onChange={(e) => setCustomerPO(e.target.value)}
                    placeholder="Enter Customer PO"
                  />
                </div>
              )}

              {/* Stock Model Selection */}
              <div className="space-y-2">
                <Label>Stock Model</Label>
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={modelOpen}
                      className="w-full justify-between"
                    >
                      {modelId 
                        ? modelOptions.find(model => model.id === modelId)?.displayName 
                        : "Select model..."
                      }
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search models..." />
                      <CommandEmpty>No models found.</CommandEmpty>
                      <CommandGroup>
                        <CommandList>
                          {modelOptions.map((model) => (
                            <CommandItem
                              key={model.id}
                              value={model.id}
                              onSelect={() => {
                                setModelId(model.id);
                                setModelOpen(false);
                              }}
                            >
                              <div className="flex justify-between items-center w-full">
                                <span>{model.displayName}</span>
                                <span className="text-sm text-gray-500">
                                  ${model.price.toFixed(2)}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.modelId && <p className="text-red-500 text-sm">{errors.modelId}</p>}
              </div>

              {/* Handedness Selection */}
              <div className="space-y-2">
                <Label>Handedness</Label>
                <Select value={handedness} onValueChange={setHandedness}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select handedness" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="right">Right</SelectItem>
                    <SelectItem value="left">Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dynamic Features */}
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
                  {featureDef.type === 'text' && (
                    <Input
                      value={features[featureDef.id] || ''}
                      onChange={(e) => setFeatures(prev => ({ ...prev, [featureDef.id]: e.target.value }))}
                      placeholder={`Enter ${featureDef.name.toLowerCase()}...`}
                    />
                  )}
                  {featureDef.type === 'search' && featureDef.id === 'paint_options_combined' && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {features[featureDef.id] 
                            ? allPaintOptions.find(option => option.value === features[featureDef.id])?.label
                            : "Select paint option..."
                          }
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput 
                            placeholder="Search paint options..." 
                            value={paintQuery}
                            onValueChange={setPaintQuery}
                          />
                          <CommandEmpty>No paint options found.</CommandEmpty>
                          <CommandGroup>
                            <CommandList>
                              {filteredAllPaintOptions.map((option) => (
                                <CommandItem
                                  key={option.value}
                                  value={option.value}
                                  onSelect={() => {
                                    setFeatures(prev => ({ ...prev, [featureDef.id]: option.value }));
                                    setPaintQuery('');
                                  }}
                                >
                                  <div className="flex justify-between items-center w-full">
                                    <span>{option.label}</span>
                                    {option.price > 0 && (
                                      <span className="text-sm text-gray-500">
                                        +${option.price.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandList>
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              ))}

              {/* Special Instructions */}
              <div className="md:col-span-2 space-y-2">
                <Label>Special Notes</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 min-h-[100px] resize-vertical"
                  placeholder="Any special requirements or notes..."
                  value={features.specialInstructions || ''}
                  onChange={(e) => setFeatures(prev => ({ ...prev, specialInstructions: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Base Price:</span>
                  <span>${pricing.basePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Features:</span>
                  <span>${pricing.featureCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Additional Items:</span>
                  <span>${pricing.additionalItemsCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping:</span>
                  <span>${pricing.shipping.toFixed(2)}</span>
                </div>
                {pricing.totalDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Total Discount:</span>
                    <span>-${pricing.totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-2">
                  <div className="flex justify-between font-bold">
                    <span>Total:</span>
                    <span>${pricing.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={() => handleSubmit('save')}
                  variant="outline"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button
                  onClick={() => handleSubmit('confirm')}
                  className="w-full"
                  disabled={isConfirming || orderStatus === 'FINALIZED'}
                >
                  {isConfirming ? 'Confirming...' : 'Confirm Order'}
                </Button>
                <Button
                  onClick={() => handleSubmit('finalize')}
                  className="w-full"
                  disabled={isFinalizing || orderStatus !== 'CONFIRMED'}
                >
                  {isFinalizing ? 'Finalizing...' : 'Finalize Order'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
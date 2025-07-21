import { useEffect, useState, useCallback, useRef } from 'react';
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
  type: 'dropdown' | 'search' | 'text' | 'multiselect';
  options?: { value: string; label: string; price?: number }[];
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
  const [tikkaOption, setTikkaOption] = useState('');

  // Paint options data
  const [paintFeatures, setPaintFeatures] = useState<any[]>([]);
  const [paintQuery, setPaintQuery] = useState('');
  const [allFeatures, setAllFeatures] = useState<any[]>([]);

  // Quantities for checkbox options (feature_id -> { option_value: quantity })
  const [featureQuantities, setFeatureQuantities] = useState<Record<string, Record<string, number>>>({});

  // Order summary data
  const [discountCode, setDiscountCode] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<'percent' | 'amount'>('percent');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [showCustomDiscount, setShowCustomDiscount] = useState(false);
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

        // Features loaded successfully

        setAllFeatures(allFeatures);

        // Separate paint features from other features
        const paintFeatures = allFeatures.filter((f: any) => f.category === 'paint_options');
        const nonPaintFeatures = allFeatures.filter((f: any) => f.category !== 'paint_options');

        console.log('All features:', allFeatures);
        console.log('Barrel inlet feature:', allFeatures.find(f => f.id === 'barrel_inlet'));

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

        console.log('Final mapped features:', mappedFeatures);
        console.log('Barrel inlet in mapped features:', mappedFeatures.find(f => f.id === 'barrel_inlet'));
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
            setCustomDiscountType(draftResponse.customDiscountType || 'percent');
            setCustomDiscountValue(draftResponse.customDiscountValue || 0);
            setShowCustomDiscount(draftResponse.showCustomDiscount || false);
            setShipping(draftResponse.shipping || 36.95);
            setMarkAsPaid(draftResponse.markAsPaid || false);
            setAdditionalItems(draftResponse.additionalItems || []);
            setPayments(draftResponse.payments || []);
            setFeatureQuantities(draftResponse.featureQuantities || {});
            setTikkaOption(draftResponse.tikkaOption || '');
            setOrderStatus(draftResponse.status || 'DRAFT');

            console.log('=== LOADED DRAFT DATA ===');
            console.log('tikkaOption from draft:', draftResponse.tikkaOption);
            console.log('Setting tikkaOption state to:', draftResponse.tikkaOption || '');
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
    if (!orderId && !draftId) {
      generateOrderId();
    }
  }, [draftId]);

  const generateOrderId = useCallback(async () => {
    try {
      const response = await apiRequest('/api/orders/generate-id', {
        method: 'POST'
      });
      setOrderId(response.orderId);
      console.log('Generated order ID:', response.orderId);
    } catch (error) {
      console.error('Failed to generate order ID:', error);
      // Fallback to timestamp-based ID if atomic generation fails
      const fallbackId = `AG${Date.now().toString().slice(-6)}`;
      setOrderId(fallbackId);
    }
  }, []);

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
      if (featureId === 'paint_options_combined' || !value) continue; // Skip empty values and paint options

      const feature = allFeatures.find(f => f.id === featureId);

      // Debug logging for "Other Options"
      if (featureId === 'other_options') {
        console.log('Processing other_options:', { featureId, value, feature });
      }

      if (feature && feature.options && Array.isArray(feature.options)) {
        if (feature.type === 'checkbox') {
          // For checkbox features, calculate based on quantities
          const quantities = featureQuantities[featureId] || {};
          for (const [optionValue, quantity] of Object.entries(quantities)) {
            const option = feature.options.find((opt: any) => opt.value === optionValue);
            if (option && typeof option.price === 'number' && quantity > 0) {
              featureCost += option.price * quantity;
            }
          }
        } else if (feature.type === 'multiselect') {
          // For multiselect features, value is an array of selected option values
          const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);

          // Debug logging for "Other Options"
          if (featureId === 'other_options') {
            console.log('Processing multiselect other_options:', { selectedValues, options: feature.options });
          }

          selectedValues.forEach((selectedValue: string) => {
            const option = feature.options.find((opt: any) => opt.value === selectedValue);
            if (featureId === 'other_options') {
              console.log('Found option for', selectedValue, ':', option);
            }
            if (option && typeof option.price === 'number' && option.price > 0) {
              featureCost += option.price;
            }
          });
        } else {
          // For other feature types, find the selected option
          const selectedOption = feature.options.find((opt: any) => opt.value === value);
          if (selectedOption && typeof selectedOption.price === 'number') {
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

    // Calculate custom discount (ad-hoc discount entry)
    let customDiscount = 0;
    if (showCustomDiscount && customDiscountValue > 0) {
      if (customDiscountType === 'percent') {
        customDiscount = (basePrice + featureCost) * (customDiscountValue / 100);
      } else {
        customDiscount = customDiscountValue;
      }
    }

    const totalDiscount = discountAmount + customerTypeDiscount + persistentDiscount + customDiscount;
    const subtotal = basePrice + featureCost + additionalItemsCost - totalDiscount;
    const total = subtotal + shipping;

    return {
      basePrice,
      featureCost,
      additionalItemsCost,
      discountAmount,
      customerTypeDiscount,
      persistentDiscount,
      customDiscount,
      totalDiscount,
      subtotal,
      shipping,
      total
    };
  }, [modelId, modelOptions, features, additionalItems, discountCode, shipping, shortTermSales, customer, customerTypes, persistentDiscounts, paintFeatures, subCategories, allFeatures, featureQuantities, showCustomDiscount, customDiscountType, customDiscountValue]);

  const pricing = calculateTotal();

  const handleSubmit = async (action: 'save' | 'confirm' | 'finalize') => {
    setErrors({});
    const isSubmittingState = action === 'save' ? setIsSubmitting : (action === 'confirm' ? setIsConfirming : setIsFinalizing);

    isSubmittingState(true);

    try {
      // Validate required fields for draft saving
      if (!orderId) {
        await generateOrderId();
        // Wait a moment for the order ID to be set
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (!orderId) {
        throw new Error('Order ID is required but could not be generated');
      }

      const orderData = {
        customerId: customer?.id?.toString() || '',
        modelId: modelId || '',
        features: features || {},
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        orderId,
        hasCustomerPO,
        customerPO: customerPO || '',
        fbOrderNumber: fbOrderNumber || '',
        hasAgrOrder,
        agrOrderDetails: agrOrderDetails || '',
        handedness: handedness || '',
        shankLength: shankLength || '',
        discountCode: discountCode || '',
        customDiscountType: customDiscountType || 'percent',
        customDiscountValue: customDiscountValue || 0,
        showCustomDiscount: showCustomDiscount || false,
        shipping: shipping || 0,
        markAsPaid: markAsPaid || false,
        additionalItems: additionalItems || [],
        payments: payments || [],
        featureQuantities: featureQuantities || {},
        tikkaOption: tikkaOption || '',
        status: action === 'save' ? 'DRAFT' : (action === 'confirm' ? 'CONFIRMED' : 'FINALIZED'),
        pricing: calculateTotal()
      };

      console.log('=== FRONTEND ORDER DATA ===');
      console.log('Order ID:', orderId);
      console.log('Customer ID:', orderData.customerId);
      console.log('Full orderData:', JSON.stringify(orderData, null, 2));

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
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      let errorMessage = "Failed to save order";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      // If it's an order ID conflict, try generating a new one
      if (errorMessage.includes('order ID') || errorMessage.includes('duplicate')) {
        try {
          await generateOrderId();
          toast({
            title: "Info",
            description: "Order ID conflict detected. Please try saving again.",
          });
        } catch (genError) {
          console.error('Failed to generate new order ID:', genError);
        }
      } else {
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      }
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

  // Function to generate a new unique order ID
  const generateNewOrderId = async () => {
    try {
      const response = await apiRequest('/api/orders/generate-id', {
        method: 'POST'
      });
      return response.orderId;
    } catch (error) {
      console.error('Failed to generate order ID:', error);
      // Fallback to client-side generation if server fails
      // return generateP1OrderId(new Date(), lastOrderData?.lastOrderId || ''); // Removed as generateP1OrderId is not defined here and potentially a code smell.
      return null; // Added a null return here because the generateP1OrderId function has been removed.
    }
  };

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

              {/* Tikka Options Test Field */}
              {modelId && (
                <div className="space-y-2 p-4 border border-red-500 bg-red-50">
                  <Label className="text-red-700 font-bold">TEST: Tikka Options (Model ID: {modelId})</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTikkaOption('set')}
                      className={`px-3 py-1 border rounded ${tikkaOption === 'set' ? 'bg-blue-500 text-white' : 'bg-white'}`}
                    >
                      Set
                    </button>
                    <button
                      type="button"
                      onClick={() => setTikkaOption('loose')}
                      className={`px-3 py-1 border rounded ${tikkaOption === 'loose' ? 'bg-blue-500 text-white' : 'bg-white'}`}
                    >
                      Loose
                    </button>
                  </div>
                  <div className="text-sm text-gray-600">Selected: {tikkaOption || 'None'}</div>
                </div>
              )}

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
                  {featureDef.type === 'multiselect' && (
                    <div className="space-y-2">
                      {featureDef.options?.map((option) => (
                        <div key={option.value} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`${featureDef.id}-${option.value}`}
                            checked={Array.isArray(features[featureDef.id]) 
                              ? features[featureDef.id].includes(option.value)
                              : features[featureDef.id] === option.value
                            }
                            onChange={(e) => {
                              const currentValues = Array.isArray(features[featureDef.id]) 
                                ? features[featureDef.id] 
                                : (features[featureDef.id] ? [features[featureDef.id]] : []);

                              if (e.target.checked) {
                                // Add the option to the array
                                const newValues = [...currentValues, option.value];
                                setFeatures(prev => ({ ...prev, [featureDef.id]: newValues }));
                              } else {
                                // Remove the option from the array
                                const newValues = currentValues.filter((v: string) => v !== option.value);
                                setFeatures(prev => ({ ...prev, [featureDef.id]: newValues }));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor={`${featureDef.id}-${option.value}`} className="flex-1 cursor-pointer">
                            <span>{option.label}</span>
                            {option.price > 0 && (
                              <span className="text-sm text-gray-500 ml-2">
                                (+${option.price.toFixed(2)})
                              </span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
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

                {/* Feature Breakdown */}
                <div className="border-t pt-2">
                  <div className="text-sm font-medium mb-2">Features:</div>
                  <div className="space-y-1 text-sm">
                    {Object.entries(features).map(([featureId, value]) => {
                      if (!value || featureId === 'specialInstructions') return null;

                      const feature = allFeatures.find(f => f.id === featureId);
                      if (!feature) return null;

                      // Handle paint options
                      if (featureId === 'paint_options_combined') {
                        const [paintFeatureId, optionValue] = value.split(':');
                        const paintFeature = paintFeatures.find(f => f.id === paintFeatureId);
                        if (paintFeature && paintFeature.subCategory) {
                          const subCategory = subCategories.find(sc => sc.id === paintFeature.subCategory);
                          const option = paintFeature.options?.find((opt: any) => opt.value === optionValue);
                          if (option && subCategory) {
                            return (
                              <div key={featureId} className="flex justify-between">
                                <span className="text-xs">{option.label}</span>
                                <span className="text-xs">${subCategory.price.toFixed(2)}</span>
                              </div>
                            );
                          }
                        }
                        return null;
                      }

                      // Handle multiselect features
                      if (feature.type === 'multiselect' && Array.isArray(value)) {
                        return value.map((selectedValue: string) => {
                          const option = feature.options?.find((opt: any) => opt.value === selectedValue);
                          if (option && option.price > 0) {
                            return (
                              <div key={`${featureId}-${selectedValue}`} className="flex justify-between">
                                <span className="text-xs">{option.label}</span>
                                <span className="text-xs">${option.price.toFixed(2)}</span>
                              </div>
                            );
                          }
                          return null;
                        });
                      }

                      // Handle other feature types
                      if (feature.options) {
                        const selectedOption = feature.options.find((opt: any) => opt.value === value);
                        if (selectedOption && selectedOption.price > 0) {
                          return (
                            <div key={featureId} className="flex justify-between">
                              <span className="text-xs">{selectedOption.label}</span>
                              <span className="text-xs">${selectedOption.price.toFixed(2)}</span>
                            </div>
                          );
                        }
                      }

                      return null;
                    })}
                  </div>
                  <div className="flex justify-between font-medium mt-2 pt-1 border-t">
                    <span>Features Total:</span>
                    <span>${pricing.featureCost.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Additional Items:</span>
                  <span>${pricing.additionalItemsCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping:</span>
                  <span>${pricing.shipping.toFixed(2)}</span>
                </div>
                
                {/* Discount Section in Pricing Summary */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Discount:</span>
                    <Select 
                      value={showCustomDiscount ? 'CUSTOM' : (discountCode || 'NONE')} 
                      onValueChange={(value) => {
                        if (value === 'CUSTOM') {
                          setDiscountCode('');
                          setShowCustomDiscount(true);
                        } else if (value === 'NONE') {
                          setDiscountCode('');
                          setShowCustomDiscount(false);
                          setCustomDiscountValue(0);
                        } else {
                          setDiscountCode(value);
                          setShowCustomDiscount(false);
                          setCustomDiscountValue(0);
                        }
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">No Discount</SelectItem>
                        {shortTermSales.map((sale) => (
                          <SelectItem key={sale.id} value={sale.name}>
                            {sale.name} ({sale.percent}%)
                          </SelectItem>
                        ))}
                        <SelectItem value="CUSTOM">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {showCustomDiscount && (
                    <div className="flex gap-2 items-center">
                      <Select value={customDiscountType} onValueChange={(value: 'percent' | 'amount') => setCustomDiscountType(value)}>
                        <SelectTrigger className="w-16">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="amount">$</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="0"
                        value={customDiscountValue || ''}
                        onChange={(e) => setCustomDiscountValue(parseFloat(e.target.value) || 0)}
                        className="w-20"
                      />
                    </div>
                  )}
                  
                  {pricing.totalDiscount > 0 && (
                    <div className="flex justify-between text-green-600 font-medium">
                      <span>Total Discount Applied:</span>
                      <span>-${pricing.totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
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
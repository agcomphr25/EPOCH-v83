import React, { useEffect, useState, useCallback } from 'react';
import { generateP1OrderId } from '@/utils/orderUtils';
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
  
  // Debug logging (can be removed after testing)
  // console.log('OrderEntry component - Location:', location);
  // console.log('OrderEntry component - Window URL:', window.location.href);
  // console.log('OrderEntry component - Draft ID:', draftId);
  // console.log('OrderEntry component - URL search params:', window.location.search || 'none');
  
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


        // If there's a draft ID, load the draft
        if (draftId) {
          try {
            const draftResponse = await apiRequest(`/api/orders/draft/${draftId}`);
            
            // Wait for all the data to be loaded first
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Populate form with draft data
            setOrderId(draftResponse.orderId);
            setOrderDate(new Date(draftResponse.orderDate));
            setDueDate(new Date(draftResponse.dueDate));
            setCustomerPO(draftResponse.customerPO || '');
            setFbOrderNumber(draftResponse.fbOrderNumber || '');
            setAgrOrderDetails(draftResponse.agrOrderDetails || '');
            setModelId(draftResponse.modelId || '');
            setHandedness(draftResponse.handedness || '');
            setFeatures(draftResponse.features || {});
            setFeatureQuantities(draftResponse.featureQuantities || {});
            setDiscountCode(draftResponse.discountCode || '');
            setShipping(draftResponse.shipping || 36.95);
            setOrderStatus(draftResponse.status || 'DRAFT');
            
            // Set customer object properly - load from database if customerId exists
            if (draftResponse.customerId) {
              try {
                const customerResponse = await apiRequest(`/api/customers/${draftResponse.customerId}`);
                setCustomer(customerResponse);
              } catch (error) {
                console.error('Error loading customer:', error);
              }
            }
            
            // Set checkbox states
            setHasCustomerPO(!!draftResponse.customerPO);
            setHasAgrOrder(!!draftResponse.agrOrderDetails);
            
            toast({
              title: "Draft Loaded",
              description: `Loaded draft order ${draftResponse.orderId}`,
            });
          } catch (error) {
            console.error('Failed to load draft:', error);
            toast({
              title: "Error",
              description: "Failed to load draft order",
              variant: "destructive",
            });
          }
        }

        setLastOrderId(lastIdResponse.lastOrderId);
        setShortTermSales(salesResponse);
        setPersistentDiscounts(discountsResponse);
        setCustomerTypes(typesResponse);
        setSubCategories(subCategoriesResponse);
        
        // Debug logging to check percentage values
        console.log('Short-term sales:', salesResponse);
        console.log('Persistent discounts:', discountsResponse);

        // Load stock models from API
        const stockModelsResponse = await apiRequest('/api/stock-models');
        setModelOptions(stockModelsResponse.filter((model: any) => model.isActive));

        // Load features from API (group paint options under one feature)
        const activeFeatures = featuresResponse.filter((feature: any) => feature.isActive);
        
        // Store all features for pricing calculations
        setAllFeatures(activeFeatures);
        
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
            category: feature.displayName || feature.name,
            subCategory: feature.subCategory, // Include sub-category info
            featureId: feature.id // Include feature ID for lookup
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
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setIsLoadingDraft(false);
      }
    };

    loadInitialData();
  }, [draftId, location]);

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
    
    // Calculate individual feature prices for non-paint features
    Object.entries(features).forEach(([featureId, featureValue]) => {
      // Skip paint options as they're handled above
      if (featureId === 'paint_options_combined' || !featureValue) return;
      
      // Find the feature definition to get its price
      const featureDefinition = allFeatures.find(f => f.id === featureId);
      if (featureDefinition) {
        // Add the base feature price
        if (featureDefinition.price) {
          featureCost += featureDefinition.price;
        }
        
        // Add the specific option price if this is a dropdown with options
        if (featureDefinition.type === 'dropdown' && featureDefinition.options) {
          const selectedOption = featureDefinition.options.find(opt => opt.value === featureValue);
          if (selectedOption && selectedOption.price) {
            featureCost += selectedOption.price;
          }
        }
        
        // Handle checkbox arrays - add prices for each selected option with quantities
        if (featureDefinition.type === 'checkbox' && Array.isArray(featureValue) && featureDefinition.options) {
          featureValue.forEach(selectedValue => {
            const selectedOption = featureDefinition.options.find(opt => opt.value === selectedValue);
            const quantity = featureQuantities[featureId]?.[selectedValue] || 1;
            if (selectedOption && selectedOption.price) {
              featureCost += selectedOption.price * quantity;
            }
          });
        }
      }
    });
    
    let subtotal = basePrice + featureCost;
    
    // Apply discount if selected
    let discountAmount = 0;
    if (discountCode && discountCode !== 'none') {
      if (discountCode.startsWith('sale-')) {
        const saleId = parseInt(discountCode.replace('sale-', ''));
        const sale = shortTermSales.find(s => s.id === saleId);
        if (sale) {
          discountAmount = (subtotal * sale.percent) / 100;
        }
      } else if (discountCode.startsWith('discount-')) {
        const discountId = parseInt(discountCode.replace('discount-', ''));
        const discount = persistentDiscounts.find(d => d.id === discountId);
        if (discount) {
          if (discount.percent) {
            // Percentage discount
            discountAmount = (subtotal * discount.percent) / 100;
          } else if (discount.fixedAmount) {
            // Fixed amount discount
            discountAmount = discount.fixedAmount;
          }
        }
      }
    }
    
    const subtotalAfterDiscount = subtotal - discountAmount;
    const total = subtotalAfterDiscount + shipping;
    
    return { basePrice, featureCost, subtotal: subtotalAfterDiscount, total, discountAmount };
  };

  const { basePrice, featureCost, subtotal, total, discountAmount } = calculateTotals();
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balanceDue = total - totalPaid;

  // Helper function to get display value for feature selections
  const getFeatureDisplayValue = (featureId: string, value: any) => {
    const feature = featureDefs.find(f => f.id === featureId);
    if (!feature) return value || 'Not selected';
    
    if (feature.type === 'dropdown' || feature.type === 'combobox') {
      const option = feature.options?.find(opt => opt.value === value);
      return option ? option.label : (value || 'Not selected');
    }
    
    if (feature.type === 'checkbox' && Array.isArray(value)) {
      if (value.length === 0) return 'None selected';
      
      const selectedLabels = value.map(val => {
        const option = feature.options?.find(opt => opt.value === val);
        const quantity = featureQuantities[featureId]?.[val] || 1;
        const label = option ? option.label : val;
        return quantity > 1 ? `${label} (${quantity})` : label;
      });
      
      return selectedLabels.join(', ');
    }
    
    return value || 'Not selected';
  };

  // Helper function to get price for feature selections
  const getFeaturePrice = (featureId: string, value: any) => {
    if (!value) return 0;
    
    const feature = featureDefs.find(f => f.id === featureId);
    if (!feature) return 0;
    
    // Handle paint options combined feature
    if (featureId === 'paint_options_combined') {
      const [originalFeatureId, optionValue] = value.split(':');
      const paintFeature = paintFeatures.find(f => f.id === originalFeatureId);
      if (paintFeature && paintFeature.subCategory) {
        const subCategory = subCategories.find(sc => sc.id === paintFeature.subCategory);
        return subCategory?.price || 0;
      }
      return 0;
    }
    
    // Handle checkbox arrays with quantities
    if (feature.type === 'checkbox' && Array.isArray(value)) {
      return value.reduce((total, val) => {
        const option = feature.options?.find(opt => opt.value === val);
        const quantity = featureQuantities[featureId]?.[val] || 1;
        return total + (option?.price || 0) * quantity;
      }, 0);
    }
    
    // Handle regular features with options
    if (feature.type === 'dropdown' || feature.type === 'combobox') {
      const option = feature.options?.find(opt => opt.value === value);
      return option?.price || 0;
    }
    
    // Handle features with base price
    const originalFeature = allFeatures.find(f => f.id === featureId);
    return originalFeature?.price || 0;
  };

  // Debounced customer search


  const onSingleSubmit = async () => {
    setErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        orderId,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        customerId: customer?.id.toString(),
        customerPO: hasCustomerPO ? customerPO : null,
        fbOrderNumber: fbOrderNumber || null,
        agrOrderDetails: hasAgrOrder ? agrOrderDetails : null,
        modelId,
        handedness,
        features,
        featureQuantities,
        discountCode,
        shipping,
        status: 'FINALIZED' // Create directly as finalized instead of draft
      };

      await apiRequest('/api/orders/draft', {
        method: 'POST',
        body: payload,
      });

      // Update last order ID
      setLastOrderId(orderId);
      
      toast({
        title: "Order Created",
        description: `Order ${orderId} created successfully!`,
      });

      // Reset form
      setCustomer(null);
      setModelId('');
      setFeatures({});
      setFeatureQuantities({});
      setDiscountCode('');
      setCustomerPO('');
      setFbOrderNumber('');
      setAgrOrderDetails('');
      setHandedness('');
      setHasCustomerPO(false);
      setHasAgrOrder(false);
      
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

  // Handle sending draft for confirmation
  const handleSendForConfirmation = async () => {
    if (!draftId) {
      toast({
        title: "Error",
        description: "Please save as draft first",
        variant: "destructive",
      });
      return;
    }
    
    setIsConfirming(true);
    
    try {
      await apiRequest(`/api/orders/draft/${draftId}/send-confirmation`, {
        method: 'POST',
      });
      
      setOrderStatus('CONFIRMED');
      toast({
        title: "Sent for Confirmation",
        description: "Order has been sent for confirmation",
      });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to send for confirmation",
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle finalizing order
  const handleFinalize = async () => {
    if (!draftId) {
      toast({
        title: "Error",
        description: "Please save as draft first",
        variant: "destructive",
      });
      return;
    }
    
    setIsFinalizing(true);
    
    try {
      await apiRequest(`/api/orders/draft/${draftId}/finalize`, {
        method: 'POST',
      });
      
      setOrderStatus('FINALIZED');
      toast({
        title: "Order Finalized",
        description: "Order has been finalized successfully",
      });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to finalize order",
        variant: "destructive",
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  const saveDraft = async () => {
    setIsSubmitting(true);
    
    try {
      const payload = {
        orderId,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        customerId: customer?.id.toString(),
        customerPO: hasCustomerPO ? customerPO : null,
        fbOrderNumber: fbOrderNumber || null,
        agrOrderDetails: hasAgrOrder ? agrOrderDetails : null,
        modelId,
        handedness,
        features,
        featureQuantities,
        discountCode,
        shipping,
        status: 'DRAFT'
      };
      
      const method = draftId ? 'PUT' : 'POST';
      const url = draftId ? `/api/orders/draft/${draftId}` : '/api/orders/draft';
      
      await apiRequest(url, {
        method,
        body: payload,
      });
      
      toast({
        title: "Draft Saved",
        description: `Draft order ${orderId} saved successfully!`,
      });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to save draft",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading spinner when loading draft
  if (isLoadingDraft) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

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
              <CustomerSearchInput
                value={customer}
                onValueChange={setCustomer}
                placeholder="Search customer..."
                error={errors.customerId}
              />

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

              {/* FB Order # Field */}
              <div className="space-y-2">
                <Label htmlFor="fbOrderNumber">FB Order #</Label>
                <Input
                  type="text"
                  id="fbOrderNumber"
                  placeholder="Enter FB Order #..."
                  value={fbOrderNumber}
                  onChange={(e) => setFbOrderNumber(e.target.value)}
                />
                {errors.fbOrderNumber && <p className="text-red-500 text-sm">{errors.fbOrderNumber}</p>}
              </div>

              {/* AGR Order Field */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="hasAgrOrder"
                    checked={hasAgrOrder}
                    onChange={(e) => {
                      setHasAgrOrder(e.target.checked);
                      if (!e.target.checked) {
                        setAgrOrderDetails('');
                      }
                    }}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="hasAgrOrder">AGR Order?</Label>
                </div>
                {hasAgrOrder && (
                  <Input
                    type="text"
                    placeholder="Enter Order Details (e.g., AGR-11865 (00586B))..."
                    value={agrOrderDetails}
                    onChange={(e) => setAgrOrderDetails(e.target.value)}
                  />
                )}
                {errors.agrOrderDetails && <p className="text-red-500 text-sm">{errors.agrOrderDetails}</p>}
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <Label htmlFor="model">Stock Model</Label>
                <Popover open={modelOpen} onOpenChange={setModelOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={modelOpen}
                      className="w-full justify-between"
                    >
                      {modelId 
                        ? modelOptions.find(m => m.id === modelId)?.displayName
                        : "Select or search model..."}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0">
                    <Command>
                      <CommandInput placeholder="Search models..." />
                      <CommandList>
                        <CommandEmpty>No model found.</CommandEmpty>
                        <CommandGroup>
                          {modelOptions.map((model) => (
                            <CommandItem
                              key={model.id}
                              value={model.displayName}
                              onSelect={() => {
                                setModelId(model.id);
                                setModelOpen(false);
                              }}
                            >
                              {model.displayName}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {features[featureDef.id] 
                            ? featureDef.options?.find(opt => opt.value === features[featureDef.id])?.label || features[featureDef.id]
                            : "Select or search..."}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search options..." />
                          <CommandList>
                            <CommandEmpty>No option found.</CommandEmpty>
                            <CommandGroup>
                              {featureDef.options?.map((option) => (
                                <CommandItem
                                  key={option.value}
                                  value={option.label}
                                  onSelect={() => {
                                    setFeatures(prev => ({ ...prev, [featureDef.id]: option.value }));
                                  }}
                                >
                                  {option.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                  {featureDef.type === 'checkbox' && (
                    <div className="space-y-2">
                      {featureDef.options?.map((option) => {
                        const selectedOptions = features[featureDef.id] || [];
                        const isChecked = selectedOptions.includes(option.value);
                        const quantity = featureQuantities[featureDef.id]?.[option.value] || 1;
                        
                        return (
                          <div key={option.value} className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`${featureDef.id}-${option.value}`}
                                checked={isChecked}
                                onChange={(e) => {
                                  const currentSelection = features[featureDef.id] || [];
                                  let newSelection;
                                  
                                  if (e.target.checked) {
                                    newSelection = [...currentSelection, option.value];
                                    // Initialize quantity to 1 when first selected
                                    setFeatureQuantities(prev => ({
                                      ...prev,
                                      [featureDef.id]: {
                                        ...prev[featureDef.id],
                                        [option.value]: 1
                                      }
                                    }));
                                  } else {
                                    newSelection = currentSelection.filter((val: string) => val !== option.value);
                                    // Remove quantity when deselected
                                    setFeatureQuantities(prev => {
                                      const newQuantities = { ...prev };
                                      if (newQuantities[featureDef.id]) {
                                        delete newQuantities[featureDef.id][option.value];
                                      }
                                      return newQuantities;
                                    });
                                  }
                                  
                                  setFeatures(prev => ({ ...prev, [featureDef.id]: newSelection }));
                                }}
                                className="rounded border-gray-300"
                              />
                              <label 
                                htmlFor={`${featureDef.id}-${option.value}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {option.label}
                                {option.price && option.price > 0 && (
                                  <span className="ml-2 text-blue-600 font-medium">
                                    (+${option.price})
                                  </span>
                                )}
                              </label>
                            </div>
                            
                            {/* Quantity input - only shown when checkbox is selected */}
                            {isChecked && (
                              <div className="ml-6 flex items-center space-x-2">
                                <Label htmlFor={`${featureDef.id}-${option.value}-qty`} className="text-xs text-gray-600">
                                  Quantity:
                                </Label>
                                <Input
                                  type="number"
                                  id={`${featureDef.id}-${option.value}-qty`}
                                  min="1"
                                  value={quantity}
                                  onChange={(e) => {
                                    const newQuantity = parseInt(e.target.value) || 1;
                                    setFeatureQuantities(prev => ({
                                      ...prev,
                                      [featureDef.id]: {
                                        ...prev[featureDef.id],
                                        [option.value]: newQuantity
                                      }
                                    }));
                                  }}
                                  className="w-20 text-sm"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {errors[`features.${featureDef.id}`] && (
                    <p className="text-red-500 text-sm">{errors[`features.${featureDef.id}`]}</p>
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

              {/* Feature Selections */}
              <div className="space-y-3 pt-4 border-t">
                <h4 className="font-semibold text-sm text-gray-700">Feature Selections</h4>
                <div className="space-y-2">
                  {/* Stock Model */}
                  <div className="flex justify-between items-start text-sm">
                    <span className="text-gray-600 flex-1">Stock Model:</span>
                    <div className="flex-1 text-right">
                      <span className="font-medium">
                        {modelOptions.find(m => m.id === modelId)?.displayName || 'Not selected'}
                      </span>
                    </div>
                    <div className="w-16 text-right ml-2">
                      <span className="font-medium text-blue-600">
                        {modelId ? `$${(modelOptions.find(m => m.id === modelId)?.price || 0).toFixed(2)}` : '$0.00'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Handedness */}
                  <div className="flex justify-between items-start text-sm">
                    <span className="text-gray-600 flex-1">Handedness:</span>
                    <div className="flex-1 text-right">
                      <span className="font-medium">
                        {handedness ? (handedness === 'right' ? 'Right' : 'Left') : 'Not selected'}
                      </span>
                    </div>
                    <div className="w-16 text-right ml-2">
                      <span className="font-medium text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* Dynamic Features */}
                  {featureDefs.map((feature) => {
                    const value = features[feature.id];
                    const displayValue = getFeatureDisplayValue(feature.id, value);
                    const price = getFeaturePrice(feature.id, value);
                    const hasValue = value && value !== '';
                    
                    return (
                      <div key={feature.id} className="flex justify-between items-start text-sm">
                        <span className="text-gray-600 flex-1">{feature.name}:</span>
                        <div className="flex-1 text-right">
                          <span className={`${hasValue ? 'font-medium' : 'text-gray-400'}`}>
                            {displayValue}
                          </span>
                        </div>
                        <div className="w-16 text-right ml-2">
                          <span className="font-medium text-blue-600">
                            ${price.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
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
                    <SelectItem value="none">None</SelectItem>
                    
                    {/* Short-Term Sales */}
                    {shortTermSales.map((sale: any) => {
                      const now = new Date();
                      const startDate = new Date(sale.startDate);
                      const endDate = new Date(sale.endDate);
                      const isActive = now >= startDate && now <= endDate;
                      
                      return (
                        <SelectItem 
                          key={sale.id} 
                          value={`sale-${sale.id}`}
                          disabled={!isActive}
                        >
                          {sale.name} - {sale.percent}% Off
                          {!isActive && " (Expired)"}
                        </SelectItem>
                      );
                    })}
                    
                    {/* Persistent Discounts */}
                    {persistentDiscounts.map((discount: any) => {
                      const customerType = customerTypes.find((ct: any) => ct.id === discount.customerTypeId);
                      
                      // Display logic for percentage vs fixed amount
                      const discountText = discount.percent 
                        ? `${discount.percent}% Off`
                        : `$${discount.fixedAmount} Off`;
                      
                      return (
                        <SelectItem 
                          key={discount.id} 
                          value={`discount-${discount.id}`}
                        >
                          {customerType?.name || 'Unknown'} - {discountText}
                        </SelectItem>
                      );
                    })}
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
                  <span>${(basePrice + featureCost).toFixed(2)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Shipping & Handling:</span>
                  <span>${shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-blue-600">${total.toFixed(2)}</span>
                </div>
                {totalPaid > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Paid:</span>
                    <span>-${totalPaid.toFixed(2)}</span>
                  </div>
                )}
                {balanceDue !== total && (
                  <div className="flex justify-between font-bold text-lg pt-1 border-t">
                    <span>Balance Due:</span>
                    <span className={balanceDue > 0 ? "text-red-600" : "text-green-600"}>
                      ${balanceDue.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>

              {/* Mark as Paid */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="markAsPaid"
                  checked={markAsPaid}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setPaymentAmount(total);
                      setShowPaymentModal(true);
                    } else {
                      setMarkAsPaid(false);
                    }
                  }}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="markAsPaid">Mark as Paid</Label>
              </div>

              {/* Order Status */}
              {draftId && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium">Status:</span>
                  <Badge variant={orderStatus === 'DRAFT' ? 'secondary' : orderStatus === 'CONFIRMED' ? 'default' : 'outline'}>
                    {orderStatus}
                  </Badge>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={saveDraft}
                  disabled={isSubmitting || isConfirming || isFinalizing}
                >
                  {isSubmitting ? 'Saving...' : draftId ? 'Update Draft' : 'Save as Draft'}
                </Button>
                
                {draftId && (
                  <>
                    <Button
                      variant="default"
                      className="w-full bg-yellow-600 hover:bg-yellow-700"
                      onClick={handleSendForConfirmation}
                      disabled={isSubmitting || isConfirming || isFinalizing || orderStatus !== 'DRAFT'}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {isConfirming ? 'Sending...' : 'Send for Confirmation'}
                    </Button>
                    
                    <Button
                      variant="default"
                      className="w-full bg-green-600 hover:bg-green-700"
                      onClick={handleFinalize}
                      disabled={isSubmitting || isConfirming || isFinalizing}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {isFinalizing ? 'Finalizing...' : 'Finalize Order'}
                    </Button>
                  </>
                )}
                
                {!draftId && (
                  <Button
                    className="w-full"
                    onClick={onSingleSubmit}
                    disabled={isSubmitting || isConfirming || isFinalizing}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Order'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Payment Type */}
            <div className="space-y-2">
              <Label>Payment Type</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Date */}
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentDate.toISOString().split('T')[0]}
                onChange={(e) => setPaymentDate(new Date(e.target.value))}
              />
            </div>

            {/* Payment Amount */}
            <div className="space-y-2">
              <Label>Payment Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentModal(false);
                  setMarkAsPaid(false);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  // Add payment to payments array
                  setPayments(prev => [...prev, {
                    type: paymentType,
                    date: paymentDate,
                    amount: paymentAmount
                  }]);
                  
                  // Check if fully paid
                  const newTotalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0) + paymentAmount;
                  setMarkAsPaid(newTotalPaid >= total);
                  
                  // Reset modal state
                  setShowPaymentModal(false);
                  setPaymentType('');
                  setPaymentDate(new Date());
                  setPaymentAmount(0);
                  
                  toast({
                    title: "Payment Recorded",
                    description: `Payment of $${paymentAmount.toFixed(2)} recorded for ${paymentDate.toLocaleDateString()}`,
                  });
                }}
                disabled={!paymentType || paymentAmount <= 0}
                className="flex-1"
              >
                Save Payment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
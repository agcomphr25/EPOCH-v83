
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
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

import { useToast } from '@/hooks/use-toast';
import { Package, Users, ChevronDown, Send, CheckCircle, Check, ChevronsUpDown } from 'lucide-react';
// @ts-ignore
import debounce from 'lodash.debounce';
import { useLocation, useRoute } from 'wouter';
import CustomerSearchInput from '@/components/CustomerSearchInput';
import type { Customer } from '@shared/schema';
import { useFeatureValidation, useFeatureStateValidation } from '@/hooks/useFeatureValidation';
import { FEATURE_IDS, findFeature, getFeatureOptionDisplay, getPaintFeatures } from '@/utils/featureMapping';

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
  displayName: string;
  type: 'dropdown' | 'search' | 'text' | 'multiselect' | 'checkbox';
  options?: { value: string; label: string; price?: number }[];
  category?: string;
  subcategory?: string;
}

export default function OrderEntry() {
  const { toast } = useToast();
  const [location] = useLocation();

  // Form state
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [modelOptions, setModelOptions] = useState<StockModel[]>([]);
  const [modelId, setModelId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [discountOptions, setDiscountOptions] = useState<{value: string; label: string}[]>([]);
  
  const [orderDate, setOrderDate] = useState(new Date());
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); // 30 days from now
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCustomerPO, setHasCustomerPO] = useState(false);
  const [customerPO, setCustomerPO] = useState('');
  const [fbOrderNumber, setFbOrderNumber] = useState('');
  const [hasAGROrder, setHasAGROrder] = useState(false);
  const [agrOrderDetails, setAgrOrderDetails] = useState('');
  const [handedness, setHandedness] = useState('');
  const [actionLength, setActionLength] = useState('');
  const [bottomMetal, setBottomMetal] = useState('');
  const [barrelInlet, setBarrelInlet] = useState('');
  const [qdQuickDetach, setQdQuickDetach] = useState('');
  const [swivelStuds, setSwivelStuds] = useState('');
  const [texture, setTexture] = useState('');
  const [paintOptions, setPaintOptions] = useState('');
  const [otherOptions, setOtherOptions] = useState<string[]>([]);
  const [railAccessory, setRailAccessory] = useState<string[]>([]);

  // Feature validation hooks (development only)
  useFeatureValidation(featureDefs);
  useFeatureStateValidation(features, {
    paintOptions,
    bottomMetal,
    railAccessory,
    otherOptions,
    actionLength
  });

  // Price Override state
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [showPriceOverride, setShowPriceOverride] = useState(false);
  
  // Discount and pricing
  const [discountCode, setDiscountCode] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<'percent' | 'amount'>('percent');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [showCustomDiscount, setShowCustomDiscount] = useState(false);
  const [shipping, setShipping] = useState(36.95);
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [notes, setNotes] = useState('');
  
  // Payment state
  const [isPaid, setIsPaid] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentTimestamp, setPaymentTimestamp] = useState<Date | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Unified price calculation function
  const calculateTotalPrice = useCallback(() => {
    let total = 0;

    // Add stock model price (use override if set, otherwise use standard price)
    const selectedModel = modelOptions.find(model => model.id === modelId);
    if (selectedModel) {
      total += priceOverride !== null ? priceOverride : (selectedModel.price || 0);
    }

    // Add feature prices from features object (but NOT bottom_metal, paint_options, rail_accessory, other_options as they are handled separately)
    Object.entries(features).forEach(([featureId, value]) => {
      // Skip features that have separate state variables to avoid double counting
      if (featureId === 'bottom_metal' || featureId === 'paint_options' || featureId === 'rail_accessory' || featureId === 'other_options') {
        return;
      }
      
      if (value && value !== 'none') {
        const feature = featureDefs.find(f => f.id === featureId);
        if (feature?.options) {
          if (Array.isArray(value)) {
            // Handle multi-select features
            value.forEach(optionValue => {
              const option = feature.options!.find(opt => opt.value === optionValue);
              if (option?.price) {
                total += option.price;
              }
            });
          } else {
            // Handle single-select features
            const option = feature.options.find(opt => opt.value === value);
            if (option?.price) {
              total += option.price;
            }
          }
        }
      }
    });

    // Add bottom metal price (separate state variable)
    if (bottomMetal) {
      const bottomMetalFeature = featureDefs.find(f => f.id === 'bottom_metal');
      if (bottomMetalFeature?.options) {
        const option = bottomMetalFeature.options.find(opt => opt.value === bottomMetal);
        if (option?.price) {
          total += option.price;
        }
      }
    }

    // Add paint options price (separate state variable)
    if (paintOptions && paintOptions !== 'none') {
      const paintFeatures = featureDefs.filter(f => 
        f.displayName === 'Premium Options' ||
        f.displayName === 'Terrain Options' ||
        f.displayName === 'Rogue Options' ||
        f.displayName === 'Standard Options' ||
        f.displayName === 'Carbon Camo Ready' ||
        f.displayName === 'Camo Options' ||
        f.id === 'metallic_finishes' ||
        f.name === 'metallic_finishes' ||
        f.category === 'paint_options'
      );
      
      for (const feature of paintFeatures) {
        if (feature.options) {
          const option = feature.options.find(opt => opt.value === paintOptions);
          if (option?.price) {
            total += option.price;
            break; // Only add price once
          }
        }
      }
    }

    // Add rail accessory prices (separate state variable)
    if (railAccessory && railAccessory.length > 0) {
      const railFeature = featureDefs.find(f => f.id === 'rail_accessory');
      if (railFeature?.options) {
        railAccessory.forEach(optionValue => {
          const option = railFeature.options!.find(opt => opt.value === optionValue);
          if (option?.price) {
            total += option.price;
          }
        });
      }
    }

    // Add other options prices (separate state variable)
    if (otherOptions && otherOptions.length > 0) {
      const otherFeature = featureDefs.find(f => f.id === 'other_options');
      if (otherFeature?.options) {
        otherOptions.forEach(optionValue => {
          const option = otherFeature.options!.find(opt => opt.value === optionValue);
          if (option?.price) {
            total += option.price;
          }
        });
      }
    }

    return total;
  }, [modelOptions, modelId, priceOverride, featureDefs, features, bottomMetal, paintOptions, railAccessory, otherOptions]);

  // Store discount details for appliesTo logic
  const [discountDetails, setDiscountDetails] = useState<any>(null);

  // Calculate discount amount based on selected discount code
  const calculateDiscountAmount = useCallback((subtotal: number) => {
    if (!discountCode || discountCode === 'none') return 0;
    
    // Handle custom discount
    if (showCustomDiscount) {
      if (customDiscountType === 'percent') {
        return (subtotal * customDiscountValue) / 100;
      } else {
        return customDiscountValue;
      }
    }
    
    // Handle predefined discount codes
    const selectedDiscount = discountOptions.find(d => d.value === discountCode);
    if (!selectedDiscount) return 0;
    
    // For persistent discounts, check appliesTo setting
    if (discountCode.startsWith('persistent_') && discountDetails) {
      const baseAmount = priceOverride !== null ? priceOverride : (modelOptions.find(m => m.id === modelId)?.price || 0);
      
      // If appliesTo is 'stock_model', apply discount only to base model price
      if (discountDetails.appliesTo === 'stock_model') {
        // Extract percentage from label (e.g., "10% off")
        const percentMatch = selectedDiscount.label.match(/(\d+)% off/);
        if (percentMatch) {
          const percent = parseInt(percentMatch[1]);
          return (baseAmount * percent) / 100;
        }
        
        // Extract dollar amount from label (e.g., "$50.00 off")
        const dollarMatch = selectedDiscount.label.match(/\$(\d+\.?\d*) off/);
        if (dollarMatch) {
          const amount = parseFloat(dollarMatch[1]);
          return amount;
        }
      }
      // If appliesTo is 'total_order', apply to full subtotal (existing behavior)
    }
    
    // Default behavior for short-term sales and total_order persistent discounts
    // Extract percentage from label (e.g., "10% off")
    const percentMatch = selectedDiscount.label.match(/(\d+)% off/);
    if (percentMatch) {
      const percent = parseInt(percentMatch[1]);
      return (subtotal * percent) / 100;
    }
    
    // Extract dollar amount from label (e.g., "$50.00 off")
    const dollarMatch = selectedDiscount.label.match(/\$(\d+\.?\d*) off/);
    if (dollarMatch) {
      const amount = parseFloat(dollarMatch[1]);
      return amount;
    }
    
    return 0;
  }, [discountCode, discountOptions, showCustomDiscount, customDiscountType, customDiscountValue, discountDetails, priceOverride, modelOptions, modelId]);

  const subtotalPrice = calculateTotalPrice();
  const discountAmount = calculateDiscountAmount(subtotalPrice);
  const totalPrice = subtotalPrice - discountAmount;

  // Helper function to format currency with commas
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Extract order ID from URL if editing existing order
  const getOrderIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('draft');
  };

  // Load initial data
  useEffect(() => {
    loadStockModels();
    loadFeatures();
    loadDiscountCodes();
    
    const editOrderId = getOrderIdFromUrl();
    if (editOrderId) {
      loadExistingOrder(editOrderId);
    } else {
      generateOrderId();
    }
  }, []);

  // Load existing order data for editing
  const loadExistingOrder = async (orderIdToEdit: string) => {
    try {
      console.log('Loading existing order:', orderIdToEdit);
      const order = await apiRequest(`/api/orders/draft/${orderIdToEdit}`);
      console.log('Received order data:', order);
      if (order) {
        // Populate form with existing order data
        setOrderId(order.orderId);
        setOrderDate(new Date(order.orderDate));
        setDueDate(new Date(order.dueDate));
        
        if (order.customerId) {
          // Load customer data
          const customers = await apiRequest('/api/customers');
          const customer = customers.find((c: any) => c.id.toString() === order.customerId.toString());
          if (customer) {
            setCustomer(customer);
          }
        }
        
        console.log('Setting modelId:', order.modelId || '');
        setModelId(order.modelId || '');
        console.log('Setting features object:', order.features || {});
        setFeatures(order.features || {});
        
        // Set individual feature states from features object
        const featuresObj = order.features || {};
        console.log('Loading order features:', featuresObj);
        console.log('Available featuresObj keys:', Object.keys(featuresObj));
        
        setHandedness(featuresObj.handedness || order.handedness || '');
        setActionLength(featuresObj.action_length || '');
        setBottomMetal(featuresObj.bottom_metal || '');
        setBarrelInlet(featuresObj.barrel_inlet || '');
        setQdQuickDetach(featuresObj.qd_accessory || '');
        setSwivelStuds(featuresObj.swivel_studs || '');
        setTexture(featuresObj.texture_options || '');
        
        // CRITICAL FIX: Handle paint options - check multiple possible field names
        const paintValue = featuresObj.paint_options || featuresObj.paintOptions || featuresObj.paint || '';
        console.log('Setting paint options:', paintValue);
        setPaintOptions(paintValue);
        
        // CRITICAL FIX: Handle rail accessories - check multiple possible field names and ensure array format
        const railValue = featuresObj.rail_accessory || featuresObj.railAccessory || featuresObj.rail_accessories || [];
        const railArray = Array.isArray(railValue) ? railValue : (railValue ? [railValue] : []);
        console.log('Setting rail accessories:', railArray);
        setRailAccessory(railArray);
        
        // CRITICAL FIX: Handle other options - check multiple possible field names and ensure array format
        const otherValue = featuresObj.other_options || featuresObj.otherOptions || featuresObj.other || [];
        const otherArray = Array.isArray(otherValue) ? otherValue : (otherValue ? [otherValue] : []);
        console.log('Setting other options:', otherArray);
        setOtherOptions(otherArray);
        
        // Set the main features object which will populate form dropdowns
        console.log('Setting features object with length_of_pull:', featuresObj.length_of_pull);
        
        setCustomerPO(order.customerPO || '');
        setHasCustomerPO(!!order.customerPO);
        setFbOrderNumber(order.fbOrderNumber || '');
        setAgrOrderDetails(order.agrOrderDetails || '');
        setHasAGROrder(!!order.agrOrderDetails);
        setShipping(order.shipping || 36.95);
        setIsCustomOrder(order.isCustomOrder === 'yes');
        setNotes(order.notes || '');
        setDiscountCode(order.discountCode || '');
        setCustomDiscountType(order.customDiscountType || 'percent');
        setCustomDiscountValue(order.customDiscountValue || 0);
        setShowCustomDiscount(order.showCustomDiscount || false);
        setPriceOverride(order.priceOverride);
        setShowPriceOverride(!!order.priceOverride);
        
        // CRITICAL FIX: Load discount details after setting discount code
        if (order.discountCode && order.discountCode !== 'none') {
          const loadDiscountDetailsForEdit = async () => {
            try {
              if (order.discountCode.startsWith('persistent_')) {
                const discountId = order.discountCode.replace('persistent_', '');
                const persistentDiscounts = await apiRequest('/api/persistent-discounts');
                const discount = persistentDiscounts.find((d: any) => d.id.toString() === discountId);
                setDiscountDetails(discount || null);
              } else if (order.discountCode.startsWith('short_term_')) {
                const saleId = order.discountCode.replace('short_term_', '');
                const shortTermSales = await apiRequest('/api/short-term-sales');
                const sale = shortTermSales.find((s: any) => s.id.toString() === saleId);
                setDiscountDetails(sale ? { ...sale, appliesTo: sale.appliesTo || 'total_order' } : null);
              }
            } catch (error) {
              console.error('Failed to load discount details for edit:', error);
              setDiscountDetails(null);
            }
          };
          loadDiscountDetailsForEdit();
        }
        
        // Reset payment state (orders don't store payment info currently)
        setIsPaid(false);
        setShowPaymentModal(false);
        setPaymentType('');
        setPaymentDate(new Date());
        setPaymentAmount('');
        setPaymentTimestamp(null);
        setShowTooltip(false);
        
        console.log('All order fields loaded:', {
          orderId: order.orderId,
          modelId: order.modelId,
          customerId: order.customerId,
          customerPO: order.customerPO,
          fbOrderNumber: order.fbOrderNumber,
          agrOrderDetails: order.agrOrderDetails,
          handedness: order.handedness,
          features: order.features,
          shipping: order.shipping,
          isCustomOrder: order.isCustomOrder,
          discountCode: order.discountCode
        });
        
        toast({
          title: "Order Loaded",
          description: `Editing order ${order.orderId}`,
        });
      }
    } catch (error) {
      console.error('Failed to load existing order:', error);
      toast({
        title: "Error",
        description: "Failed to load order for editing",
        variant: "destructive",
      });
      generateOrderId(); // Fallback to new order
    }
  };

  const loadStockModels = async () => {
    try {
      const models = await apiRequest('/api/stock-models');
      setModelOptions(models.filter((m: StockModel) => m.isActive));
    } catch (error) {
      console.error('Failed to load stock models:', error);
    }
  };

  const loadFeatures = async () => {
    try {
      const features = await apiRequest('/api/features');
      setFeatureDefs(features);
    } catch (error) {
      console.error('Failed to load features:', error);
    }
  };

  const loadDiscountCodes = async () => {
    try {
      const [shortTermSales, persistentDiscounts] = await Promise.all([
        apiRequest('/api/short-term-sales'),
        apiRequest('/api/persistent-discounts')
      ]);
      
      const discounts: {value: string; label: string}[] = [];
      const discountDetailsMap: Record<string, any> = {};
      
      // Add active short-term sales
      const now = new Date();
      shortTermSales
        .filter((sale: any) => {
          const startDate = new Date(sale.startDate);
          const endDate = new Date(sale.endDate);
          return startDate <= now && now <= endDate && sale.isActive;
        })
        .forEach((sale: any) => {
          const value = `short_term_${sale.id}`;
          discounts.push({
            value,
            label: `${sale.name} (${sale.percent}% off)`
          });
          discountDetailsMap[value] = {
            ...sale,
            appliesTo: sale.appliesTo || 'total_order'
          };
        });
      
      // Add active persistent discounts
      persistentDiscounts
        .filter((discount: any) => discount.isActive)
        .forEach((discount: any) => {
          const displayValue = discount.percent 
            ? `${discount.percent}% off`
            : `$${(discount.fixedAmount / 100).toFixed(2)} off`;
          const value = `persistent_${discount.id}`;
          discounts.push({
            value,
            label: `${discount.name} (${displayValue})`
          });
          discountDetailsMap[value] = discount;
        });
      
      setDiscountOptions(discounts);
      // Store discount details for appliesTo logic
      if (discountCode && discountDetailsMap[discountCode]) {
        setDiscountDetails(discountDetailsMap[discountCode]);
      }
    } catch (error) {
      console.error('Failed to load discount codes:', error);
    }
  };

  const generateOrderId = async () => {
    try {
      const response = await apiRequest('/api/orders/generate-id', {
        method: 'POST'
      });
      
      // Validate the generated ID format (e.g., AG001)
      const orderIdPattern = /^[A-Z]{1,2}[A-Z]\d{3,}$/;
      if (!orderIdPattern.test(response.orderId)) {
        throw new Error('Invalid Order ID format generated');
      }
      
      setOrderId(response.orderId);
      setErrors(prev => ({ ...prev, orderId: '' })); // Clear any previous errors
    } catch (error) {
      console.error('Failed to generate order ID:', error);
      setErrors(prev => ({ 
        ...prev, 
        orderId: 'Failed to generate Order ID. Please refresh the page.' 
      }));
      // Set fallback ID with error indicator
      setOrderId('ERROR-001');
    }
  };

  // Use unified pricing calculation (calculated above with discount already included)

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }
    
    setErrors({});
    setIsSubmitting(true);

    try {
      // Validate required fields
      if (!customer) {
        setErrors(prev => ({ ...prev, customer: 'Customer is required' }));
        return;
      }
      
      if (!orderId || orderId.startsWith('ERROR')) {
        setErrors(prev => ({ ...prev, orderId: 'Valid Order ID is required' }));
        return;
      }
      
      // Validate Order ID format
      const orderIdPattern = /^[A-Z]{1,2}[A-Z]\d{3,}$/;
      if (!orderIdPattern.test(orderId)) {
        setErrors(prev => ({ ...prev, orderId: 'Invalid Order ID format' }));
        return;
      }

      if (!modelId) {
        setErrors(prev => ({ ...prev, modelId: 'Stock model is required' }));
        return;
      }

      if (!orderId) {
        setErrors(prev => ({ ...prev, orderId: 'Order ID is required' }));
        return;
      }

      // CRITICAL FIX: Merge all features including rails, other options, and paint into features object
      // This solves the issue where railAccessory, otherOptions, paintOptions, bottomMetal, and handedness
      // were stored as separate state variables but not being saved to the database features field.
      // Without this consolidation, these fields would appear empty when editing orders.
      const completeFeatures = {
        ...features,
        // Add handedness to features if set
        ...(handedness && { handedness }),
        // Add action length to features if set
        ...(actionLength && { action_length: actionLength }),
        // Add bottom metal to features if set  
        ...(bottomMetal && { bottom_metal: bottomMetal }),
        // Add paint options to features if set
        ...(paintOptions && { paint_options: paintOptions }),
        // Add rail accessories if any selected (array field)
        ...(railAccessory && railAccessory.length > 0 && { rail_accessory: railAccessory }),
        // Add other options if any selected (array field)
        ...(otherOptions && otherOptions.length > 0 && { other_options: otherOptions })
      };

      console.log('Complete features being saved:', completeFeatures);

      const orderData = {
        customerId: customer.id.toString(),
        modelId,
        features: completeFeatures,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        orderId,
        customerPO: hasCustomerPO ? customerPO : '',
        fbOrderNumber,
        agrOrderDetails: hasAGROrder ? agrOrderDetails : '',
        handedness,
        shipping,
        status: 'FINALIZED',
        isCustomOrder: isCustomOrder ? 'yes' : 'no',
        notes,
        discountCode,
        customDiscountType,
        customDiscountValue,
        showCustomDiscount,
        priceOverride
      };

      const response = await apiRequest('/api/orders/draft', {
        method: 'POST',
        body: orderData
      });

      toast({
        title: "Success",
        description: "Order created successfully",
      });

      // Reset form
      console.log('Before resetForm - paymentAmount:', paymentAmount, 'isPaid:', isPaid);
      resetForm();
      console.log('After resetForm - paymentAmount should be empty');

    } catch (error: any) {
      console.error('Submit error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save order",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setCustomer(null);
    setModelId('');
    setFeatures({});
    setOrderDate(new Date());
    setDueDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    setHasCustomerPO(false);
    setCustomerPO('');
    setFbOrderNumber('');
    setHasAGROrder(false);
    setAgrOrderDetails('');
    setHandedness('');
    setActionLength('');
    setBottomMetal('');
    setBarrelInlet('');
    setQdQuickDetach('');
    setSwivelStuds('');
    setTexture('');
    setPaintOptions('');
    setOtherOptions([]);
    setRailAccessory([]);
    setDiscountCode('');
    setCustomDiscountType('percent');
    setCustomDiscountValue(0);
    setShowCustomDiscount(false);
    setPriceOverride(null);
    setShowPriceOverride(false);
    setShipping(36.95);
    setIsCustomOrder(false);
    setNotes('');
    setErrors({});
    // Reset payment state
    setIsPaid(false);
    setShowPaymentModal(false);
    setPaymentType('');
    setPaymentDate(new Date());
    setPaymentAmount('');
    setPaymentTimestamp(null);
    setShowTooltip(false);
    generateOrderId();
  };

  const selectedModel = modelOptions.find(m => m.id === modelId);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Order Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Entry
              </CardTitle>
              <p className="text-sm text-muted-foreground">Create new stock order</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSubmit} className="space-y-4">
              {/* Order ID and Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="orderId">Order ID</Label>
                  <Input
                    id="orderId"
                    name="orderId"
                    value={orderId}
                    readOnly
                    className="bg-gray-50 cursor-not-allowed"
                    placeholder="Generating..."
                  />
                  {errors.orderId && <p className="text-sm text-red-500">{errors.orderId}</p>}
                </div>
                <div>
                  <Label htmlFor="orderDate">Order Date</Label>
                  <Input
                    id="orderDate"
                    name="orderDate"
                    type="date"
                    value={orderDate.toISOString().split('T')[0]}
                    onChange={(e) => setOrderDate(new Date(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">Estimated Completion Date</Label>
                  <Input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={dueDate.toISOString().split('T')[0]}
                    onChange={(e) => setDueDate(new Date(e.target.value))}
                  />
                </div>
              </div>

              {/* Customer Selection and Customer PO */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <CustomerSearchInput
                    value={customer}
                    onValueChange={setCustomer}
                    placeholder="Search customer..."
                    error={errors.customer}
                  />
                </div>
                
                <div>
                  <Label htmlFor="customer-po">Customer PO</Label>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="customer-po-checkbox"
                      checked={hasCustomerPO}
                      onCheckedChange={(checked) => {
                        setHasCustomerPO(!!checked);
                        if (!checked) {
                          setCustomerPO('');
                        }
                      }}
                    />
                    <Label 
                      htmlFor="customer-po-checkbox" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Enable Customer PO
                    </Label>
                  </div>
                  
                  {hasCustomerPO && (
                    <div className="mt-2">
                      <Input
                        placeholder="Enter Customer PO"
                        value={customerPO}
                        onChange={(e) => setCustomerPO(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* FB Order and AGR Order */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <Label>FB Order #</Label>
                  <Input
                    name="fbOrderNumber"
                    value={fbOrderNumber}
                    onChange={(e) => setFbOrderNumber(e.target.value)}
                    placeholder="Enter FB Order #"
                  />
                </div>
                
                <div>
                  <Label htmlFor="agr-order">AGR Order</Label>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="agr-order-checkbox"
                        checked={hasAGROrder}
                        onCheckedChange={(checked) => {
                          setHasAGROrder(!!checked);
                          if (!checked) {
                            setAgrOrderDetails('');
                          }
                        }}
                      />
                      <Label 
                        htmlFor="agr-order-checkbox" 
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Enable AGR Order
                      </Label>
                    </div>
                  </div>
                  
                  {hasAGROrder && (
                    <div className="mt-2">
                      <Input
                        placeholder="Enter Order Details (e.g., AGR-11865 (00586B))"
                        value={agrOrderDetails}
                        onChange={(e) => setAgrOrderDetails(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Stock Model Selection and Price Override Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Stock Model Selection */}
                <div>
                  <Label>Stock Model</Label>
                  <Select value={modelId} onValueChange={setModelId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select or search model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.modelId && <p className="text-sm text-red-500">{errors.modelId}</p>}
                </div>

                {/* Alamo Price Override */}
                {modelId && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 pl-[16px] pr-[16px] pt-[0px] pb-[0px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-600">💰</span>
                        <span className="font-medium text-gray-900">Alamo Price Override</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPriceOverride(!showPriceOverride)}
                        className="flex items-center gap-2"
                      >
                        <span>✏️</span>
                        Override Price
                      </Button>
                    </div>
                    
                    {showPriceOverride && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm text-gray-600">Original Price</Label>
                            <div className="text-lg font-semibold text-gray-900">
                              ${(() => {
                                const selectedModel = modelOptions.find(model => model.id === modelId);
                                return selectedModel ? selectedModel.price.toFixed(2) : '0.00';
                              })()}
                            </div>
                          </div>
                          <div>
                            <Label htmlFor="price-override">Override Price</Label>
                            <Input
                              id="price-override"
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="Enter override price"
                              value={priceOverride || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setPriceOverride(value ? parseFloat(value) : null);
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setPriceOverride(null);
                              setShowPriceOverride(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setShowPriceOverride(false)}
                          >
                            Apply Override
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {priceOverride !== null && !showPriceOverride && (
                      <div className="mt-2 text-sm text-green-700">
                        Price overridden to: <span className="font-semibold">${priceOverride.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Product Features - Two Column Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Handedness */}
                  <div>
                    <Label>Handedness</Label>
                    <Select value={handedness} onValueChange={setHandedness}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select handedness..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="right">Right</SelectItem>
                        <SelectItem value="left">Left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Action Inlet */}
                  <div>
                    <Label>Action Inlet</Label>
                    <Select 
                      value={features.action_inlet || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, action_inlet: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs
                          .find(f => f.name === 'action_inlet' || f.id === 'action_inlet')
                          ?.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          )) || []}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Barrel Inlet */}
                  <div>
                    <Label>Barrel Inlet</Label>
                    <Select 
                      value={features.barrel_inlet || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, barrel_inlet: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs
                          .find(f => f.name === 'barrel_inlet' || f.id === 'barrel_inlet')
                          ?.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          )) || []}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* LOP Length Of Pull */}
                  <div>
                    <Label>LOP Length Of Pull</Label>
                    <Select 
                      value={features.length_of_pull || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, length_of_pull: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          // Try multiple possible IDs for the LOP feature
                          const lopFeature = featureDefs.find(f => 
                            f.id === 'length_of_pull' || 
                            f.name === 'length_of_pull' || 
                            f.id?.toLowerCase().includes('lop') ||
                            f.name?.toLowerCase().includes('lop') ||
                            f.displayName?.toLowerCase().includes('length of pull') ||
                            f.displayName?.toLowerCase().includes('lop')
                          );
                          
                          if (!lopFeature || !lopFeature.options) {
                            return null;
                          }
                          
                          return lopFeature.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Texture */}
                  <div>
                    <Label>Texture</Label>
                    <Select 
                      value={features.texture_options || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, texture_options: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const textureFeature = featureDefs.find(f => 
                            f.id === 'texture_options' || 
                            f.name === 'texture_options' || 
                            f.id?.toLowerCase().includes('texture') ||
                            f.name?.toLowerCase().includes('texture') ||
                            f.displayName?.toLowerCase().includes('texture')
                          );
                          
                          if (!textureFeature || !textureFeature.options) {
                            return null;
                          }
                          
                          return textureFeature.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Other Options */}
                  <div>
                    <Label>Other Options</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                      {(() => {
                        const otherOptionsFeature = featureDefs.find(f => f.id === 'other_options');
                        
                        if (!otherOptionsFeature || !otherOptionsFeature.options) {
                          return <div className="text-gray-500 text-sm">No options available</div>;
                        }
                        
                        return otherOptionsFeature.options.map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`other-option-${option.value}`}
                              checked={otherOptions.includes(option.value)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setOtherOptions(prev => [...prev, option.value]);
                                } else {
                                  setOtherOptions(prev => prev.filter(item => item !== option.value));
                                }
                              }}
                            />
                            <label
                              htmlFor={`other-option-${option.value}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {option.label}
                              {option.price && option.price > 0 && (
                                <span className="ml-2 text-blue-600 font-bold">+${option.price.toFixed(2)}</span>
                              )}
                            </label>
                          </div>
                        ));
                      })()}
                      {otherOptions.length === 0 && (
                        <div className="text-gray-400 text-sm italic">No options selected</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  {/* Action Length */}
                  <div>
                    <Label>Action Length</Label>
                    <Select value={actionLength} onValueChange={setActionLength}>
                      <SelectTrigger>
                        <SelectValue placeholder="Short" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="long">Long</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Bottom Metal */}
                  <div>
                    <Label>Bottom Metal</Label>
                    <Select 
                      value={bottomMetal} 
                      onValueChange={setBottomMetal}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs
                          .find(f => f.name === 'bottom_metal' || f.id === 'bottom_metal')
                          ?.options?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          )) || []}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* QD Quick Detach Cups */}
                  <div>
                    <Label>QD Quick Detach Cups</Label>
                    <Select 
                      value={features.qd_accessory || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, qd_accessory: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const qdFeature = featureDefs.find(f => 
                            f.id === 'qd_accessory' || 
                            f.name === 'qd_accessory' || 
                            f.id?.toLowerCase().includes('qd') ||
                            f.name?.toLowerCase().includes('qd') ||
                            f.displayName?.toLowerCase().includes('qd') ||
                            f.displayName?.toLowerCase().includes('quick detach')
                          );
                          
                          if (!qdFeature || !qdFeature.options) {
                            return null;
                          }
                          
                          return qdFeature.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Rails */}
                  <div>
                    <Label>Rails</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                      {(() => {
                        const railsFeature = featureDefs.find(f => f.id === 'rail_accessory');
                        
                        if (!railsFeature || !railsFeature.options) {
                          return <div className="text-gray-500 text-sm">No options available</div>;
                        }
                        
                        return railsFeature.options.map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <Checkbox
                              id={`rail-option-${option.value}`}
                              checked={railAccessory.includes(option.value)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setRailAccessory(prev => [...prev, option.value]);
                                } else {
                                  setRailAccessory(prev => prev.filter(item => item !== option.value));
                                }
                              }}
                            />
                            <label
                              htmlFor={`rail-option-${option.value}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {option.label}
                              {option.price && option.price > 0 && (
                                <span className="ml-2 text-blue-600 font-bold">+${option.price.toFixed(2)}</span>
                              )}
                            </label>
                          </div>
                        ));
                      })()}
                      {railAccessory.length === 0 && (
                        <div className="text-gray-400 text-sm italic">No options selected</div>
                      )}
                    </div>
                  </div>

                  {/* Swivel Studs */}
                  <div>
                    <Label>Swivel Studs</Label>
                    <Select 
                      value={features.swivel_studs || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, swivel_studs: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const swivelFeature = featureDefs.find(f => 
                            f.id === 'swivel_studs' || 
                            f.name === 'swivel_studs' || 
                            f.id?.toLowerCase().includes('swivel') ||
                            f.name?.toLowerCase().includes('swivel') ||
                            f.displayName?.toLowerCase().includes('swivel') ||
                            f.displayName?.toLowerCase().includes('stud')
                          );
                          
                          if (!swivelFeature || !swivelFeature.options) {
                            return null;
                          }
                          
                          return swivelFeature.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Paint Options */}
                  <div>
                    <Label>Paint Options</Label>
                    <Select 
                      value={paintOptions} 
                      onValueChange={setPaintOptions}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select or search..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          // Find all paint-related features from different sub-categories
                          const paintFeatures = featureDefs.filter(f => 
                            f.category === 'paint_options' ||
                            f.displayName === 'Premium Options' ||
                            f.displayName === 'Terrain Options' ||
                            f.displayName === 'Rogue Options' ||
                            f.displayName === 'Standard Options' ||
                            f.displayName === 'Carbon Camo Ready' ||
                            f.displayName === 'Camo Options' ||
                            f.id === 'metallic_finishes' ||
                            f.name === 'metallic_finishes'
                          );
                          
                          if (!paintFeatures || paintFeatures.length === 0) {
                            return <SelectItem value="none">No paint options available</SelectItem>;
                          }
                          
                          // Collect all options from all paint features
                          const allOptions: { value: string; label: string; category?: string }[] = [];
                          
                          paintFeatures.forEach(feature => {
                            if (feature.options) {
                              feature.options.forEach(option => {
                                allOptions.push({
                                  value: option.value,
                                  label: `${feature.displayName || feature.name} - ${option.label}`,
                                  category: feature.displayName || feature.name
                                });
                              });
                            }
                          });
                          
                          return allOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ));
                        })()}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Custom Order and Notes */}
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add special instructions or notes..."
                  rows={3}
                />
              </div>


              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Order Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Main Total Display */}
              <div className="text-center space-y-2 border-b pb-4">
                <div className="flex justify-between items-center">
                  <span className="text-3xl font-bold">1</span>
                  <span className="text-3xl font-bold text-blue-600">${(totalPrice + shipping).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Items</span>
                  <span>Total with Shipping</span>
                </div>
              </div>

              {/* Feature Selections */}
              <div className="space-y-3">
                <div className="font-medium text-base">Feature Selections</div>
                
                {/* Stock Model - Always Show */}
                <div className="flex justify-between items-center">
                  <span>Stock Model:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{selectedModel?.displayName || 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">
                      ${priceOverride !== null ? priceOverride.toFixed(2) : (selectedModel?.price?.toFixed(2) || '0.00')}
                      {priceOverride !== null && (
                        <span className="text-xs text-green-600 ml-1">(Override)</span>
                      )}
                    </span>
                  </div>
                </div>
                
                {/* Handedness - Show if selected or as "Not selected" */}
                <div className="flex justify-between items-center">
                  <span>Handedness:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{handedness ? (handedness === 'right' ? 'Right' : 'Left') : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">$0.00</span>
                  </div>
                </div>
                
                {/* Action Length - Show if selected or as "Not selected" */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'action_length');
                    return feature?.displayName || 'Action Length';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{actionLength ? (() => {
                      const feature = featureDefs.find(f => f.id === 'action_length');
                      const option = feature?.options?.find(opt => opt.value === actionLength);
                      return option?.label || actionLength.charAt(0).toUpperCase() + actionLength.slice(1);
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${actionLength ? (() => {
                      const feature = featureDefs.find(f => f.id === 'action_length');
                      const option = feature?.options?.find(opt => opt.value === actionLength);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Action Inlet */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'action_inlet');
                    return feature?.displayName || 'Action Inlet';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.action_inlet ? (() => {
                      const feature = featureDefs.find(f => f.id === 'action_inlet' || f.name === 'action_inlet');
                      const option = feature?.options?.find(opt => opt.value === features.action_inlet);
                      return option?.label || 'Not selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.action_inlet ? (() => {
                      const feature = featureDefs.find(f => f.id === 'action_inlet');
                      const option = feature?.options?.find(opt => opt.value === features.action_inlet);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Bottom Metal */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'bottom_metal');
                    return feature?.displayName || 'Bottom Metal';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{bottomMetal ? (() => {
                      const feature = featureDefs.find(f => f.id === 'bottom_metal');
                      const option = feature?.options?.find(opt => opt.value === bottomMetal);
                      return option?.label || bottomMetal;
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${bottomMetal ? (() => {
                      const feature = featureDefs.find(f => f.id === 'bottom_metal');
                      const option = feature?.options?.find(opt => opt.value === bottomMetal);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Barrel Inlet */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'barrel_inlet' || f.name === 'barrel_inlet');
                    return feature?.displayName || 'Barrel Inlet';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.barrel_inlet ? (() => {
                      const feature = featureDefs.find(f => f.id === 'barrel_inlet' || f.name === 'barrel_inlet');
                      const option = feature?.options?.find(opt => opt.value === features.barrel_inlet);
                      return option?.label || 'Not selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.barrel_inlet ? (() => {
                      const feature = featureDefs.find(f => f.id === 'barrel_inlet' || f.name === 'barrel_inlet');
                      const option = feature?.options?.find(opt => opt.value === features.barrel_inlet);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* QDs (Quick Detach Cups) */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'qd_accessory' || f.name === 'qd_accessory');
                    return feature?.displayName || 'QDs (Quick Detach Cups)';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.qd_accessory ? (() => {
                      const feature = featureDefs.find(f => f.id === 'qd_accessory' || f.name === 'qd_accessory');
                      const option = feature?.options?.find(opt => opt.value === features.qd_accessory);
                      return option?.label || 'Not selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.qd_accessory ? (() => {
                      const feature = featureDefs.find(f => f.id === 'qd_accessory' || f.name === 'qd_accessory');
                      const option = feature?.options?.find(opt => opt.value === features.qd_accessory);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* LOP (Length of Pull) */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'length_of_pull' || f.name === 'length_of_pull');
                    return feature?.displayName || 'LOP (Length of Pull)';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.length_of_pull ? (() => {
                      const feature = featureDefs.find(f => f.id === 'length_of_pull' || f.name === 'length_of_pull');
                      const option = feature?.options?.find(opt => opt.value === features.length_of_pull);
                      return option?.label || 'Not selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.length_of_pull ? (() => {
                      const feature = featureDefs.find(f => f.id === 'length_of_pull' || f.name === 'length_of_pull');
                      const option = feature?.options?.find(opt => opt.value === features.length_of_pull);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Rails */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'rail_accessory');
                    return feature?.displayName || 'Rails';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{railAccessory && railAccessory.length > 0 ? (() => {
                      const feature = featureDefs.find(f => f.id === 'rail_accessory');
                      if (!feature?.options) return railAccessory.join(', ');
                      const labels = railAccessory.map(optionValue => {
                        const option = feature.options!.find(opt => opt.value === optionValue);
                        return option?.label || optionValue;
                      });
                      return labels.join(', ');
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${railAccessory && railAccessory.length > 0 ? (() => {
                      const feature = featureDefs.find(f => f.id === 'rail_accessory');
                      if (!feature?.options) return '0.00';
                      const totalPrice = railAccessory.reduce((sum, optionValue) => {
                        const option = feature.options!.find(opt => opt.value === optionValue);
                        return sum + (option?.price || 0);
                      }, 0);
                      return totalPrice.toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Texture */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'texture_options' || f.name === 'texture_options');
                    return feature?.displayName || 'Texture';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.texture_options ? (() => {
                      const feature = featureDefs.find(f => f.id === 'texture_options' || f.name === 'texture_options');
                      const option = feature?.options?.find(opt => opt.value === features.texture_options);
                      return option?.label || 'Not selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.texture_options ? (() => {
                      const feature = featureDefs.find(f => f.id === 'texture_options' || f.name === 'texture_options');
                      const option = feature?.options?.find(opt => opt.value === features.texture_options);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Swivel Studs */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'swivel_studs' || f.name === 'swivel_studs');
                    return feature?.displayName || 'Swivel Studs';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.swivel_studs ? (() => {
                      const feature = featureDefs.find(f => f.id === 'swivel_studs' || f.name === 'swivel_studs');
                      const option = feature?.options?.find(opt => opt.value === features.swivel_studs);
                      return option?.label || 'Not selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.swivel_studs ? (() => {
                      const feature = featureDefs.find(f => f.id === 'swivel_studs' || f.name === 'swivel_studs');
                      const option = feature?.options?.find(opt => opt.value === features.swivel_studs);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Other Options */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'other_options');
                    return feature?.displayName || 'Other Options';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{otherOptions && otherOptions.length > 0 ? (() => {
                      const feature = featureDefs.find(f => f.id === 'other_options');
                      if (!feature?.options) return otherOptions.join(', ');
                      const labels = otherOptions.map(optionValue => {
                        const option = feature.options!.find(opt => opt.value === optionValue);
                        return option?.label || optionValue;
                      });
                      return labels.join(', ');
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${otherOptions && otherOptions.length > 0 ? (() => {
                      const feature = featureDefs.find(f => f.id === 'other_options');
                      if (!feature?.options) return '0.00';
                      const totalPrice = otherOptions.reduce((sum, optionValue) => {
                        const option = feature.options!.find(opt => opt.value === optionValue);
                        return sum + (option?.price || 0);
                      }, 0);
                      return totalPrice.toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Paint Options */}
                <div className="flex justify-between items-center">
                  <span>Paint Options:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{paintOptions && paintOptions !== 'none' ? (() => {
                      // Search through ALL paint-related features to find the matching option
                      const paintFeatures = featureDefs.filter(f => 
                        f.displayName?.includes('Options') || 
                        f.displayName?.includes('Camo') || 
                        f.displayName?.includes('Cerakote') ||
                        f.displayName?.includes('Terrain') ||
                        f.displayName?.includes('Rogue') ||
                        f.displayName?.includes('Standard') ||
                        f.id === 'metallic_finishes' ||
                        f.name === 'metallic_finishes' ||
                        f.category === 'paint' ||
                        f.subcategory === 'paint'
                      );
                      
                      for (const feature of paintFeatures) {
                        if (feature.options) {
                          const option = feature.options.find(opt => opt.value === paintOptions);
                          if (option) {
                            return option.label;
                          }
                        }
                      }
                      return 'Selected';
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${paintOptions && paintOptions !== 'none' ? (() => {
                      // Search through ALL paint-related features to find the matching option
                      const paintFeatures = featureDefs.filter(f => 
                        f.displayName?.includes('Options') || 
                        f.displayName?.includes('Camo') || 
                        f.displayName?.includes('Cerakote') ||
                        f.displayName?.includes('Terrain') ||
                        f.displayName?.includes('Rogue') ||
                        f.displayName?.includes('Standard') ||
                        f.id === 'metallic_finishes' ||
                        f.name === 'metallic_finishes' ||
                        f.category === 'paint' ||
                        f.subcategory === 'paint'
                      );
                      
                      for (const feature of paintFeatures) {
                        if (feature.options) {
                          const option = feature.options.find(opt => opt.value === paintOptions);
                          if (option) {
                            return (option.price || 0).toFixed(2);
                          }
                        }
                      }
                      return '0.00';
                    })() : '0.00'}</span>
                  </div>
                </div>
              </div>

              {/* Discount Code */}
              <div className="border-t pt-4">
                <div className="font-medium text-base mb-2">Discount Code</div>
                <Select value={discountCode} onValueChange={(value) => {
                  setDiscountCode(value);
                  // Load discount details when selection changes
                  if (value && value !== 'none') {
                    const loadDiscountDetails = async () => {
                      try {
                        if (value.startsWith('persistent_')) {
                          const discountId = value.replace('persistent_', '');
                          const persistentDiscounts = await apiRequest('/api/persistent-discounts');
                          const discount = persistentDiscounts.find((d: any) => d.id.toString() === discountId);
                          setDiscountDetails(discount || null);
                        } else if (value.startsWith('short_term_')) {
                          const saleId = value.replace('short_term_', '');
                          const shortTermSales = await apiRequest('/api/short-term-sales');
                          const sale = shortTermSales.find((s: any) => s.id.toString() === saleId);
                          setDiscountDetails(sale ? { ...sale, appliesTo: sale.appliesTo || 'total_order' } : null);
                        }
                      } catch (error) {
                        console.error('Failed to load discount details:', error);
                        setDiscountDetails(null);
                      }
                    };
                    loadDiscountDetails();
                  } else {
                    setDiscountDetails(null);
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select discount code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No discount</SelectItem>
                    {discountOptions.map((discount) => (
                      <SelectItem key={discount.value} value={discount.value}>
                        {discount.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Show what the discount applies to */}
                {discountDetails && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Applies to: {discountDetails.appliesTo === 'stock_model' ? 'Stock Model Only' : 'Total Order'}
                  </div>
                )}
              </div>

              {/* Shipping & Handling */}
              <div className="border-t pt-4">
                <div className="font-medium text-base mb-2">Shipping & Handling</div>
                <input 
                  type="number" 
                  placeholder="36.95"
                  value={shipping}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                  className="w-full p-3 border rounded-lg"
                  step="0.01"
                />
              </div>

              {/* Order Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Subtotal:</span>
                  <span className="font-bold">{formatCurrency(subtotalPrice)}</span>
                </div>
                
                {/* Display selected discount */}
                {discountCode && discountCode !== 'none' && discountAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-green-600">
                      Discount ({discountOptions.find(d => d.value === discountCode)?.label || 'Custom'}):
                    </span>
                    <span className="font-bold text-green-600">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <span className="font-medium">Shipping & Handling:</span>
                  <span className="font-bold">{formatCurrency(shipping)}</span>
                </div>
                <div className="flex justify-between items-center text-lg border-t pt-2">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(totalPrice + shipping)}</span>
                </div>
                
                {/* Payment Amount - Only show if payment exists */}
                {isPaid && paymentAmount && paymentAmount.trim() !== '' && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Payment Amount:</span>
                    <span className="font-bold text-green-600">-{formatCurrency(parseFloat(paymentAmount))}</span>
                  </div>
                )}
                
                {/* Balance Due/Credit - Only show if payment exists */}
                {isPaid && paymentAmount && paymentAmount.trim() !== '' && (() => {
                  const remainingBalance = (totalPrice + shipping) - parseFloat(paymentAmount || '0');
                  const isCredit = remainingBalance < 0;
                  const balanceAmount = Math.abs(remainingBalance);
                  
                  return (
                    <div className="flex justify-between items-center text-lg border-t pt-2">
                      <span className="font-bold">
                        {isCredit ? 'Credit Balance:' : 'Balance Due:'}
                      </span>
                      <span className={`font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(balanceAmount)}
                      </span>
                    </div>
                  );
                })()}
                
                {/* Paid Checkbox */}
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox 
                    id="paid-checkbox"
                    checked={isPaid}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setShowPaymentModal(true);
                      } else {
                        setIsPaid(false);
                        setPaymentType('');
                        setPaymentAmount('');
                        setPaymentTimestamp(null);
                      }
                    }}
                  />
                  <div className="relative">
                    <span 
                      className={`font-medium cursor-pointer ${
                        isPaid && paymentType && paymentAmount && paymentTimestamp 
                          ? 'text-green-600 hover:text-green-700' 
                          : ''
                      }`}
                      onMouseEnter={() => {
                        if (isPaid && paymentType && paymentAmount && paymentTimestamp) {
                          setShowTooltip(true);
                        }
                      }}
                      onMouseLeave={() => setShowTooltip(false)}
                      onClick={() => {
                        if (isPaid && paymentType && paymentAmount && paymentTimestamp) {
                          setShowPaymentModal(true);
                        }
                      }}
                      title={isPaid && paymentType && paymentAmount ? "Click to edit payment" : ""}
                    >
                      Paid
                    </span>
                    
                    {/* Custom Tooltip */}
                    {showTooltip && isPaid && paymentType && paymentAmount && paymentTimestamp && (
                      <div className="absolute bottom-full left-0 mb-2 w-64 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg z-50">
                        <div className="space-y-1">
                          <div className="font-semibold">Payment Details:</div>
                          <div>Type: {paymentType.replace('_', ' ').toUpperCase()}</div>
                          <div>Date: {paymentDate.toLocaleDateString()}</div>
                          <div>Amount: {formatCurrency(parseFloat(paymentAmount))}</div>
                          <div>Recorded: {paymentTimestamp.toLocaleString()}</div>
                        </div>
                        {/* Tooltip Arrow */}
                        <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900"></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4">
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit()}
                >
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  variant="default"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit()}
                >
                  {isSubmitting ? "Processing..." : "Create Order"}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Payment Type */}
            <div className="space-y-2">
              <Label htmlFor="payment-type">Payment Type</Label>
              <Select value={paymentType} onValueChange={setPaymentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="agr">AGR</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Payment Date */}
            <div className="space-y-2">
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input
                type="date"
                value={paymentDate.toISOString().split('T')[0]}
                onChange={(e) => setPaymentDate(new Date(e.target.value))}
              />
            </div>

            {/* Payment Amount */}
            <div className="space-y-2">
              <Label htmlFor="payment-amount">Payment Amount</Label>
              <Input
                type="number"
                placeholder="0.00"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="flex gap-2 justify-end">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowPaymentModal(false);
                setPaymentType('');
                setPaymentAmount('');
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (paymentType && paymentAmount) {
                  setIsPaid(true);
                  // Only update timestamp if this is a new payment (no existing timestamp)
                  if (!paymentTimestamp) {
                    setPaymentTimestamp(new Date());
                  }
                  setShowPaymentModal(false);
                  toast({
                    title: paymentTimestamp ? "Payment Updated" : "Payment Saved",
                    description: `Payment of ${formatCurrency(parseFloat(paymentAmount))} via ${paymentType.replace('_', ' ').toUpperCase()} ${paymentTimestamp ? 'updated' : 'recorded'}.`,
                  });
                } else {
                  toast({
                    title: "Missing Information",
                    description: "Please select a payment type and enter an amount.",
                    variant: "destructive",
                  });
                }
              }}
            >
              {paymentTimestamp ? "Update Payment" : "Save Payment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

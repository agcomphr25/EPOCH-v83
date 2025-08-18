import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { apiRequest, queryClient } from '@/lib/queryClient';
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
import PaymentManager from '@/components/PaymentManager';
import { OrderAttachments } from '@/components/OrderAttachments';
import type { Customer } from '@shared/schema';
import { useFeatureValidation, useFeatureStateValidation } from '@/hooks/useFeatureValidation';
import { useDataConsistencyValidation } from '@/hooks/useDataConsistencyValidation';
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

interface MiscItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export default function OrderEntry() {
  console.log("OrderEntry component rendering...");
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
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 98 * 24 * 60 * 60 * 1000)); // 98 days from now (default)
  const [orderId, setOrderId] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasCustomerPO, setHasCustomerPO] = useState(false);
  const [customerPO, setCustomerPO] = useState('');
  const [fbOrderNumber, setFbOrderNumber] = useState('');
  const [hasAGROrder, setHasAGROrder] = useState(false);
  const [agrOrderDetails, setAgrOrderDetails] = useState('');
  const [isFlattop, setIsFlattop] = useState(false);
  
  // Track if we're editing an existing order (needs to be early for useEffect dependencies)
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Note: All feature data is now stored in the unified features object
  // Legacy separate state variables removed to prevent data consistency issues

  // Feature validation hooks (development only)
  useFeatureValidation(featureDefs);

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

  // Payment state - simplified for multiple payments
  const [orderPayments, setOrderPayments] = useState<any[]>([]);
  
  // Miscellaneous items state
  const [miscItems, setMiscItems] = useState<MiscItem[]>([]);
  
  // Other options quantities - tracks qty for options that don't include "No"
  const [otherOptionsQuantities, setOtherOptionsQuantities] = useState<Record<string, number>>({});

  // Track base due date for rush fee calculations
  const [baseDueDate, setBaseDueDate] = useState(new Date(Date.now() + 98 * 24 * 60 * 60 * 1000));

  // Calculate base due date based on stock model
  const calculateBaseDueDate = useCallback(() => {
    const selectedModel = modelOptions.find(m => m.id === modelId);
    const modelName = selectedModel?.displayName || selectedModel?.name || '';
    const isAdjModel = modelName.toLowerCase().includes('adj');
    const daysFromNow = isAdjModel ? 112 : 98;
    return new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  }, [modelId, modelOptions]);

  // Update base due date when stock model changes (only for new orders, not when editing existing ones)
  useEffect(() => {
    if (modelId && modelOptions.length > 0 && !isEditMode) {
      const newBaseDueDate = calculateBaseDueDate();
      setBaseDueDate(newBaseDueDate);
      
      // Only update actual due date if no rush fees are currently selected
      const otherOptions = features.other_options || [];
      const hasAnyRushFee = otherOptions.some((option: string) => 
        option.toLowerCase().includes('rush') && option.toLowerCase().includes('fee')
      );
      
      if (!hasAnyRushFee) {
        setDueDate(newBaseDueDate);
      }
    }
  }, [modelId, modelOptions, calculateBaseDueDate, features.other_options, isEditMode]);

  // Auto-adjust due date based on rush fee selections (only for new orders, not when editing existing ones)
  useEffect(() => {
    // Skip auto-adjustment for existing orders being edited
    if (isEditMode) return;
    
    const otherOptions = features.other_options || [];
    
    // Check for rush fee options
    const hasRushFee1 = otherOptions.some((option: string) => 
      option.toLowerCase().includes('rush') && option.toLowerCase().includes('fee') && option.includes('1')
    );
    const hasRushFee2 = otherOptions.some((option: string) => 
      option.toLowerCase().includes('rush') && option.toLowerCase().includes('fee') && option.includes('2')
    );

    let adjustedDate = new Date(baseDueDate);
    
    if (hasRushFee2) {
      // Rush Fee 2: reduce by 42 days (6 weeks)
      adjustedDate.setDate(adjustedDate.getDate() - 42);
    } else if (hasRushFee1) {
      // Rush Fee 1: reduce by 28 days (4 weeks)
      adjustedDate.setDate(adjustedDate.getDate() - 28);
    }

    // Only update if the calculated date is different from current due date
    if (adjustedDate.getTime() !== dueDate.getTime()) {
      setDueDate(adjustedDate);
      
      // Show user feedback about the date change
      const selectedModel = modelOptions.find(m => m.id === modelId);
      const modelName = selectedModel?.displayName || selectedModel?.name || '';
      const isAdjModel = modelName.toLowerCase().includes('adj');
      const baseWeeks = isAdjModel ? 16 : 14; // 112 days = 16 weeks, 98 days = 14 weeks

      if (hasRushFee2) {
        const finalWeeks = baseWeeks - 6; // 42 days = 6 weeks
        toast({
          title: "Due Date Updated",
          description: `Due date reduced from ${baseWeeks} weeks to ${finalWeeks} weeks due to Rush Fee 2 selection`,
          duration: 3000,
        });
      } else if (hasRushFee1) {
        const finalWeeks = baseWeeks - 4; // 28 days = 4 weeks
        toast({
          title: "Due Date Updated", 
          description: `Due date reduced from ${baseWeeks} weeks to ${finalWeeks} weeks due to Rush Fee 1 selection`,
          duration: 3000,
        });
      } else {
        toast({
          title: "Due Date Reset",
          description: `Due date restored to ${baseWeeks} weeks (${isAdjModel ? 'Adj model' : 'Standard model'})`,
          duration: 3000,
        });
      }
    }
  }, [features.other_options, baseDueDate, toast, modelId, isEditMode]); // Include modelId to recalculate when model changes

  // Update base due date when user manually changes due date (and no rush fees are selected)
  useEffect(() => {
    const otherOptions = features.other_options || [];
    const hasAnyRushFee = otherOptions.some((option: string) => 
      option.toLowerCase().includes('rush') && option.toLowerCase().includes('fee')
    );
    
    // Only update base due date if no rush fees are currently selected
    // Add a small delay to prevent immediate recalculation cycles
    if (!hasAnyRushFee) {
      const timeoutId = setTimeout(() => {
        setBaseDueDate(new Date(dueDate));
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [dueDate, features.other_options]);

  // Miscellaneous items functions
  const addMiscItem = () => {
    const newItem: MiscItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setMiscItems(prev => [...prev, newItem]);
  };

  const updateMiscItem = (id: string, field: keyof MiscItem, value: string | number) => {
    setMiscItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        // Recalculate total when quantity or unitPrice changes
        if (field === 'quantity' || field === 'unitPrice') {
          updated.total = updated.quantity * updated.unitPrice;
        }
        return updated;
      }
      return item;
    }));
  };

  const removeMiscItem = (id: string) => {
    setMiscItems(prev => prev.filter(item => item.id !== id));
  };

  // Unified price calculation function
  const calculateTotalPrice = useCallback(() => {
    let total = 0;

    // Add stock model price (use override if set, otherwise use standard price)
    const selectedModel = modelOptions.find(model => model.id === modelId);
    if (selectedModel) {
      const basePrice = priceOverride !== null ? priceOverride : (selectedModel.price || 0);
      total += basePrice;
      console.log('💰 Price calculation - Base price:', basePrice);
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

    // Add bottom metal price (from features object)
    if (features.bottom_metal) {
      const bottomMetalFeature = featureDefs.find(f => f.id === 'bottom_metal');
      if (bottomMetalFeature?.options) {
        const option = bottomMetalFeature.options.find(opt => opt.value === features.bottom_metal);
        if (option?.price) {
          total += option.price;
          console.log('💰 Price calculation - Bottom metal:', features.bottom_metal, 'price:', option.price);
        }
      }
    }

    // Add paint options price (from features object)
    const currentPaint = features.metallic_finishes || features.paint_options || features.paint_options_combined;

    if (currentPaint && currentPaint !== 'none') {
      console.log('💰 Paint calculation - current paint:', currentPaint);
      console.log('💰 Paint calculation - from features object');

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

      console.log('💰 Paint calculation - found features:', paintFeatures.length, paintFeatures.map(f => f.displayName));

      let paintPriceAdded = false;
      for (const feature of paintFeatures) {
        if (feature.options) {
          const option = feature.options.find(opt => opt.value === currentPaint);
          if (option?.price) {
            console.log('💰 Paint calculation - FOUND and ADDED:', option.label, 'price:', option.price);
            total += option.price;
            paintPriceAdded = true;
            break; // Only add price once
          }
        }
      }

      if (!paintPriceAdded) {
        console.log('💰 Paint calculation - NO PRICE FOUND for:', currentPaint);
      }
    }

    // Add rail accessory prices (from features object)
    const currentRails = Array.isArray(features.rail_accessory) ? features.rail_accessory : [];
    if (currentRails && currentRails.length > 0) {
      console.log('💰 Rails calculation - current rails:', currentRails);
      const railFeature = featureDefs.find(f => f.id === 'rail_accessory');
      console.log('💰 Rails calculation - found feature:', railFeature?.displayName || railFeature?.name);

      if (railFeature?.options) {
        console.log('💰 Rails calculation - available options:', railFeature.options.map(opt => `${opt.label}: ${opt.value} = $${opt.price}`));
        let railsTotal = 0;
        currentRails.forEach((optionValue: string) => {
          const option = railFeature.options!.find(opt => opt.value === optionValue);
          if (option?.price) {
            railsTotal += option.price;
            total += option.price;
            console.log('💰 Rails calculation - FOUND and ADDED:', option.label, 'price:', option.price);
          } else {
            console.log('💰 Rails calculation - NO PRICE FOUND for:', optionValue);
          }
        });
        console.log('💰 Rails calculation - Total rails price:', railsTotal);
      } else {
        console.log('💰 Rails calculation - NO FEATURE or OPTIONS found for rail_accessory');
      }
    } else {
      console.log('💰 Rails calculation - No rails selected');
    }

    // Add other options prices with quantities (from features object)
    const currentOtherOptions = Array.isArray(features.other_options) ? features.other_options : [];
    if (currentOtherOptions && currentOtherOptions.length > 0) {
      const otherFeature = featureDefs.find(f => f.id === 'other_options');
      if (otherFeature?.options) {
        let otherTotal = 0;
        currentOtherOptions.forEach((optionValue: string) => {
          const option = otherFeature.options!.find(opt => opt.value === optionValue);
          if (option?.price) {
            const quantity = otherOptionsQuantities[optionValue] || 1;
            const optionTotal = option.price * quantity;
            otherTotal += optionTotal;
            total += optionTotal;
          }
        });
        console.log('💰 Price calculation - Other options total:', otherTotal, 'from', currentOtherOptions, 'with quantities:', otherOptionsQuantities);
      }
    }

    // Add miscellaneous items total
    const miscTotal = miscItems.reduce((sum, item) => sum + item.total, 0);
    total += miscTotal;
    console.log('💰 Price calculation - Misc items total:', miscTotal);

    console.log('💰 Price calculation - Final total:', total);
    return total;
  }, [modelOptions, modelId, priceOverride, featureDefs, features, miscItems, otherOptionsQuantities]);

  // Store discount details for appliesTo logic
  const [discountDetails, setDiscountDetails] = useState<any>(null);

  // Calculate discount amount based on selected discount code
  const calculateDiscountAmount = useCallback((subtotal: number) => {
    if (!discountCode || discountCode === 'none') return 0;

    // Handle custom discount
    if (discountCode === 'custom' || showCustomDiscount) {
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
        // Handle percentage discounts
        if (discountDetails.percent) {
          return (baseAmount * discountDetails.percent) / 100;
        }

        // Handle fixed amount discounts
        if (discountDetails.fixedAmount) {
          return discountDetails.fixedAmount / 100; // Convert from cents to dollars
        }
      }
      // If appliesTo is 'total_order', apply to full subtotal (existing behavior)
      else {
        // Handle percentage discounts on total order
        if (discountDetails.percent) {
          return (subtotal * discountDetails.percent) / 100;
        }

        // Handle fixed amount discounts on total order
        if (discountDetails.fixedAmount) {
          return discountDetails.fixedAmount / 100; // Convert from cents to dollars
        }
      }
    }

    // For short-term sales, check appliesTo setting
    if (discountCode.startsWith('short_term_') && discountDetails) {
      if (discountDetails.appliesTo === 'stock_model') {
        const baseAmount = priceOverride !== null ? priceOverride : (modelOptions.find(m => m.id === modelId)?.price || 0);
        if (discountDetails.percent) {
          return (baseAmount * discountDetails.percent) / 100;
        }
      } else {
        // Apply to total order
        if (discountDetails.percent) {
          return (subtotal * discountDetails.percent) / 100;
        }
      }
    }

    // Fallback to label parsing for compatibility
    const percentMatch = selectedDiscount.label.match(/(\d+)% off/);
    if (percentMatch) {
      const percent = parseInt(percentMatch[1]);
      return (subtotal * percent) / 100;
    }

    const dollarMatch = selectedDiscount.label.match(/\$(\d+\.?\d*) off/);
    if (dollarMatch) {
      const amount = parseFloat(dollarMatch[1]);
      return amount;
    }

    return 0;
  }, [discountCode, discountOptions, showCustomDiscount, customDiscountType, customDiscountValue, discountDetails, priceOverride, modelOptions, modelId]);

  const subtotalPrice = useMemo(() => {
    const result = calculateTotalPrice();
    console.log('💰 Subtotal recalculated:', result);
    return result;
  }, [calculateTotalPrice]);

  const discountAmount = useMemo(() => {
    const result = calculateDiscountAmount(subtotalPrice);
    console.log('💰 Discount recalculated:', result);
    console.log('💰 Discount details:', discountDetails);
    console.log('💰 Base model price:', priceOverride !== null ? priceOverride : (modelOptions.find(m => m.id === modelId)?.price || 0));
    console.log('💰 Subtotal price:', subtotalPrice);
    if (discountDetails && discountDetails.appliesTo === 'stock_model') {
      console.log('💰 Stock model discount applied - discount only affects base model price');
    } else if (discountDetails && discountDetails.appliesTo === 'total_order') {
      console.log('💰 Total order discount applied - discount affects entire subtotal');
    }
    return result;
  }, [calculateDiscountAmount, subtotalPrice, discountDetails, priceOverride, modelOptions, modelId]);

  const totalPrice = useMemo(() => {
    const result = subtotalPrice - discountAmount;
    console.log('💰 Total recalculated:', result);
    return result;
  }, [subtotalPrice, discountAmount]);

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
    return urlParams.get('draft') || urlParams.get('edit');
  };

  // Track loading state to ensure proper order
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  // Force component re-render when loading existing order
  const [renderKey, setRenderKey] = useState(0);

  // Load initial data first
  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([
        loadStockModels(),
        loadFeatures(),
        loadDiscountCodes()
      ]);
      setInitialDataLoaded(true);
    };

    loadInitialData();
  }, []);

  // Load order data only after initial data is loaded
  useEffect(() => {
    if (!initialDataLoaded) return;

    const editOrderId = getOrderIdFromUrl();
    if (editOrderId) {
      setIsEditMode(true);
      setEditingOrderId(editOrderId);
      loadExistingOrder(editOrderId);
    } else {
      setIsEditMode(false);
      setEditingOrderId(null);
      generateOrderId();
    }
  }, [initialDataLoaded]);

  // Clear Medium action length when switching to Ferrata/Armor models and LOP for CAT/Visigoth models
  useEffect(() => {
    if (modelId) {
      const selectedModel = modelOptions.find(m => m.id === modelId);
      const modelName = selectedModel?.displayName || selectedModel?.name || '';
      
      // Handle Medium action length exclusion for Ferrata/Armor models
      if (features.action_length === 'medium') {
        const shouldExcludeMedium = modelName.toLowerCase().includes('ferrata') || 
                                    modelName.toLowerCase().includes('armor');
        
        if (shouldExcludeMedium) {
          setFeatures(prev => ({ 
            ...prev, 
            action_length: undefined // Clear the medium selection
          }));
          toast({
            title: "Action Length Updated",
            description: "Medium action length is not available for this model. Please select Short or Long.",
            variant: "default",
          });
        }
      }
      
      // Handle LOP exclusion for CAT/Visigoth models
      if (features.length_of_pull) {
        const shouldExcludeLOP = modelName.toLowerCase().includes('cat') || 
                                 modelName.toLowerCase().includes('visigoth');
        
        if (shouldExcludeLOP) {
          setFeatures(prev => ({ 
            ...prev, 
            length_of_pull: undefined // Clear the LOP selection
          }));
          toast({
            title: "LOP Option Removed",
            description: "Length of Pull options are not available for this model.",
            variant: "default",
          });
        }
      }
    }
  }, [modelId, modelOptions, features.action_length, features.length_of_pull, toast]);

  // Business rule: Impact Action Inlet + Long Action Length cannot have Left handedness
  useEffect(() => {
    const hasImpactInlet = features.action_inlet && features.action_inlet.toLowerCase().includes('impact');
    const isLongAction = features.action_length === 'long';
    const isLeftHanded = features.handedness === 'left';
    
    if (hasImpactInlet && isLongAction && isLeftHanded) {
      setFeatures(prev => ({ 
        ...prev, 
        handedness: undefined // Clear the left handedness selection
      }));
      toast({
        title: "Handedness Updated",
        description: "Left handedness is not available for Impact Action Inlet with Long Action Length.",
        variant: "default",
      });
    }
  }, [features.action_inlet, features.action_length, features.handedness, toast]);

  // Business rule: Clear Impact Action Inlet when Long Action Length + Left Handedness is selected
  useEffect(() => {
    const isLongAction = features.action_length === 'long';
    const isLeftHanded = features.handedness === 'left';
    const hasImpactInlet = features.action_inlet && 
                          (features.action_inlet.toLowerCase().includes('impact'));

    if (isLongAction && isLeftHanded && hasImpactInlet) {
      setFeatures(prev => ({
        ...prev,
        action_inlet: undefined // Clear the Impact action inlet selection
      }));
      toast({
        title: "Action Inlet Updated",
        description: "Impact Action Inlet is not available for Long Action Length with Left handedness.",
        variant: "default",
      });
    }
  }, [features.action_length, features.handedness, features.action_inlet, toast]);

  // Business rule: Clear restricted bottom metals when Medium Action Length is selected
  useEffect(() => {
    const isMediumAction = features.action_length === 'medium';
    const restrictedBottomMetals = ['ag_m5_sa', 'ag_m5_la', 'ag_m5_la_cip', 'ag_bdl_sa', 'ag_bdl_la'];
    const hasRestrictedBottomMetal = features.bottom_metal && 
                                   restrictedBottomMetals.includes(features.bottom_metal);

    if (isMediumAction && hasRestrictedBottomMetal) {
      setFeatures(prev => ({
        ...prev,
        bottom_metal: undefined // Clear the restricted bottom metal selection
      }));
      toast({
        title: "Bottom Metal Updated",
        description: "The selected bottom metal is not available for Medium Action Length.",
        variant: "default",
      });
    }
  }, [features.action_length, features.bottom_metal, toast]);

  // Load existing order data for editing
  const loadExistingOrder = async (orderIdToEdit: string) => {
    try {
      console.log('Loading existing order:', orderIdToEdit);
      
      // First try to load as draft order
      let order = null;
      try {
        order = await apiRequest(`/api/orders/draft/${orderIdToEdit}`);
        console.log('Found draft order:', order);
      } catch (draftError) {
        console.log('Order not found in drafts, trying finalized orders...');
        
        // If not found as draft, try to load as finalized order
        try {
          const allOrders = await apiRequest('/api/orders/all');
          order = allOrders.find((o: any) => o.orderId === orderIdToEdit);
          if (order) {
            console.log('Found finalized order:', order);
            toast({
              title: "Notice",
              description: `Loading finalized order ${orderIdToEdit} for reference. Changes will create a new draft.`,
              variant: "default",
            });
          }
        } catch (finalizedError) {
          console.log('Order not found in finalized orders either');
          throw new Error(`Order ${orderIdToEdit} not found in drafts or finalized orders`);
        }
      }
      
      console.log('Received order data:', order);
      if (order) {
        // Populate form with existing order data
        setOrderId(order.orderId);
        setOrderDate(new Date(order.orderDate));
        const loadedDueDate = new Date(order.dueDate);
        setDueDate(loadedDueDate);
        
        // Calculate what the base due date should be for this model (without rush fees)
        if (order.modelId) {
          const selectedModel = modelOptions.find(m => m.id === order.modelId);
          const modelName = selectedModel?.displayName || selectedModel?.name || '';
          const isAdjModel = modelName.toLowerCase().includes('adj');
          const orderDate = new Date(order.orderDate);
          const daysFromOrder = isAdjModel ? 112 : 98;
          const calculatedBaseDueDate = new Date(orderDate.getTime() + daysFromOrder * 24 * 60 * 60 * 1000);
          setBaseDueDate(calculatedBaseDueDate);
        } else {
          setBaseDueDate(loadedDueDate);
        }

        if (order.customerId) {
          // Load customer data
          const customers = await apiRequest('/api/customers');
          const customer = customers.find((c: any) => c.id.toString() === order.customerId.toString());
          if (customer) {
            setCustomer(customer);
          }
        }

        console.log('Setting modelId:', order.modelId || '');
        console.log('Current modelOptions available:', modelOptions.length);
        console.log('Available model IDs:', modelOptions.map(m => m.id));
        console.log('Looking for model ID:', order.modelId);
        const modelExists = modelOptions.find(m => m.id === order.modelId);
        console.log('Model exists in options:', !!modelExists, modelExists?.displayName);
        setModelId(order.modelId || '');
        // CRITICAL: Only use the features object - don't set separate state variables
        console.log('✅ Setting features object:', order.features || {});
        const featuresObj = order.features || {};
        console.log('✅ Loading order features:', featuresObj);
        console.log('✅ Available featuresObj keys:', Object.keys(featuresObj));
        console.log('✅ Specific feature values:');
        console.log('  - handedness:', featuresObj.handedness);
        console.log('  - action_length:', featuresObj.action_length);
        console.log('  - action_inlet:', featuresObj.action_inlet);
        console.log('  - barrel_inlet:', featuresObj.barrel_inlet);
        console.log('  - bottom_metal:', featuresObj.bottom_metal);
        console.log('  - qd_accessory:', featuresObj.qd_accessory);
        console.log('  - paint_options:', featuresObj.paint_options);
        console.log('  - rail_accessory:', featuresObj.rail_accessory);
        console.log('  - other_options:', featuresObj.other_options);

        // Set ONLY the features object - all form controls now read from this
        setFeatures(featuresObj);

        // Force component re-render by incrementing render key
        setRenderKey(prev => prev + 1);

        setCustomerPO(order.customerPO || '');
        setHasCustomerPO(!!order.customerPO);
        setFbOrderNumber(order.fbOrderNumber || '');
        setAgrOrderDetails(order.agrOrderDetails || '');
        setHasAGROrder(!!order.agrOrderDetails);
        setIsFlattop(order.isFlattop || false);
        setShipping(order.shipping || 36.95);
        setIsCustomOrder(order.isCustomOrder === 'yes');
        // Load notes from either the dedicated notes column or features.specialInstructions for backward compatibility
        const notesFromField = order.notes || '';
        const notesFromFeatures = featuresObj.specialInstructions || '';
        const finalNotes = notesFromField || notesFromFeatures;
        setNotes(finalNotes);
        console.log('✅ Loading notes:', { notesFromField, notesFromFeatures, finalNotes });
        
        // Load other options quantities from featureQuantities field
        if (order.featureQuantities) {
          setOtherOptionsQuantities(order.featureQuantities);
          console.log('✅ Loading feature quantities:', order.featureQuantities);
        } else {
          setOtherOptionsQuantities({});
        }
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

        // Payment data will be loaded by PaymentManager component

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
      console.log('🔍 Loading stock models from API...');
      const models = await apiRequest('/api/stock-models');
      console.log('🔍 Raw models from API:', models);
      console.log('🔍 Total models received:', models?.length || 0);

      if (models && Array.isArray(models) && models.length > 0) {
        console.log('🔍 First model sample:', models[0]);
        console.log('🔍 Model properties:', Object.keys(models[0]));

        // Ensure models have the required fields
        const validModels = models.filter((m: any) => 
          m && typeof m === 'object' && 
          m.id && 
          (m.displayName || m.name) && 
          typeof m.price === 'number'
        );

        const activeModels = validModels.filter((m: StockModel) => m.isActive !== false);
        console.log('🔍 Active models filtered:', activeModels.length);
        console.log('🔍 Active models IDs:', activeModels.map((m: StockModel) => m.id));
        console.log('🔍 Active models display names:', activeModels.map((m: StockModel) => m.displayName || m.name));

        setModelOptions(activeModels);
        console.log('✅ Stock models loaded successfully:', activeModels.length);
      } else {
        console.log('⚠️ No valid models received from API');
        setModelOptions([]);
      }
    } catch (error) {
      console.error('❌ Failed to load stock models:', error);
      setModelOptions([]);
    }
  };

  const loadFeatures = async () => {
    try {
      const features = await apiRequest('/api/features');
      console.log('🔍 Raw features data from API:', features);
      console.log('🔍 Features array length:', features?.length || 0);
      if (features && features.length > 0) {
        console.log('🔍 First feature sample:', features[0]);
        console.log('🔍 Available feature IDs:', features.map((f: any) => f.id).join(', '));
      }
      setFeatureDefs(features || []);
      console.log('🔍 setFeatureDefs called with:', features?.length || 0, 'features');
    } catch (error) {
      console.error('❌ Failed to load features:', error);
      setFeatureDefs([]); // Set empty array on error
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

      // Add Custom discount option
      discounts.push({
        value: 'custom',
        label: 'Custom Discount'
      });

      console.log('💳 Discount options processed:', discounts.length, 'total discounts');
      console.log('💳 Discount options:', discounts);
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

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>, saveAsDraft: boolean = false) => {
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

      // All features are now stored directly in the features object by form controls
      // No need to merge separate state variables since handedness, action_inlet, etc. 
      // are directly updated in features by their respective form controls
      const completeFeatures = {
        ...features
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
        isFlattop,
        shipping,
        status: saveAsDraft ? 'DRAFT' : 'FINALIZED',
        isCustomOrder: isCustomOrder ? 'yes' : 'no',
        notes,
        discountCode,
        customDiscountType,
        customDiscountValue,
        showCustomDiscount,
        priceOverride,
        miscItems: miscItems,
        featureQuantities: otherOptionsQuantities,
        // Payment fields removed - now handled by PaymentManager
      };

      // Determine if we're creating or updating
      let response;
      if (isEditMode && editingOrderId) {
        // Update existing order
        response = await apiRequest(`/api/orders/draft/${editingOrderId}`, {
          method: 'PUT',
          body: JSON.stringify(orderData)
        });

        toast({
          title: "Success",
          description: saveAsDraft ? "Order saved as draft" : "Order updated successfully",
        });
      } else {
        // Create new order - use finalized endpoint for completed orders
        const endpoint = saveAsDraft ? '/api/orders/draft' : '/api/orders/finalized';
        response = await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(orderData)
        });

        toast({
          title: "Success", 
          description: saveAsDraft ? "Order saved as draft" : "Order created and added to P1 Production Queue",
        });
      }

      // Invalidate relevant caches based on whether it was saved as draft or finalized
      if (saveAsDraft) {
        queryClient.invalidateQueries({ queryKey: ['/api/orders/drafts', 'excludeFinalized'] });
      } else {
        // Finalized orders appear in the main All Orders list and Production Queue
        queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
        queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });

      // Reset form only if not editing
      if (!isEditMode) {
        resetForm();
      }

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
    setModelOpen(false);
    setFeatures({});
    setOrderDate(new Date());
    const defaultDueDate = new Date(Date.now() + 98 * 24 * 60 * 60 * 1000); // Default to 98 days
    setDueDate(defaultDueDate);
    setBaseDueDate(defaultDueDate);
    setHasCustomerPO(false);
    setCustomerPO('');
    setFbOrderNumber('');
    setHasAGROrder(false);
    setAgrOrderDetails('');
    setIsFlattop(false);
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
    setDiscountDetails(null);
    setIsEditMode(false);
    setEditingOrderId(null);
    // Reset payment state - payments now handled by PaymentManager
    setOrderPayments([]);
    setMiscItems([]);
    setOtherOptionsQuantities({});
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
                    value={orderDate && !isNaN(orderDate.getTime()) ? orderDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      if (dateValue) {
                        const newDate = new Date(dateValue);
                        if (!isNaN(newDate.getTime())) {
                          setOrderDate(newDate);
                        }
                      } else {
                        setOrderDate(new Date());
                      }
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">Estimated Completion Date</Label>
                  <Input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={dueDate && !isNaN(dueDate.getTime()) ? dueDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const dateValue = e.target.value;
                      if (dateValue) {
                        const newDate = new Date(dateValue);
                        if (!isNaN(newDate.getTime())) {
                          setDueDate(newDate);
                        }
                      } else {
                        // If cleared, set to default 98 days from now
                        setDueDate(new Date(Date.now() + 98 * 24 * 60 * 60 * 1000));
                      }
                    }}
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

              {/* Flattop Option */}
              <div className="flex items-center space-x-2 p-3 border rounded-lg bg-yellow-50">
                <Checkbox 
                  id="flattop-checkbox"
                  checked={isFlattop}
                  onCheckedChange={(checked) => {
                    setIsFlattop(!!checked);
                    if (checked) {
                      // Clear features that are not available for flattop
                      setFeatures(prev => ({
                        ...prev,
                        action_length: undefined,
                        action_inlet: undefined,
                        bottom_metal: undefined,
                        barrel_inlet: undefined
                      }));
                    }
                  }}
                />
                <Label 
                  htmlFor="flattop-checkbox" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Flattop
                </Label>
                <span className="text-xs text-muted-foreground">
                  (Stock not machined for Action Length, Action Inlet, Bottom Metal, or Barrel Inlet)
                </span>
              </div>

              {/* Order Attachments */}
              {orderId && (
                <div className="mt-6">
                  <OrderAttachments orderId={orderId} />
                </div>
              )}

              {/* Stock Model Selection and Price Override Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Stock Model Selection */}
                <div>
                  <Label>Stock Model</Label>
                  <Select 
                    key={`stock-model-${renderKey}-${modelId || 'empty'}`}
                    value={modelId || undefined} 
                    onValueChange={setModelId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select or search model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        console.log('🔧 Stock Model Dropdown Debug:');
                        console.log('  - Current modelId:', modelId);
                        console.log('  - ModelOptions length:', modelOptions.length);
                        console.log('  - RenderKey:', renderKey);
                        if (modelOptions.length > 0) {
                          console.log('  - Available models:', modelOptions.map(m => `${m.id}:${m.displayName || m.name}`).slice(0, 5));
                          const selectedModel = modelOptions.find(m => m.id === modelId);
                          console.log('  - Selected model found:', !!selectedModel, selectedModel?.displayName || selectedModel?.name);
                        } else {
                          console.log('  - No models available in dropdown');
                        }

                        if (modelOptions.length === 0) {
                          return (
                            <SelectItem value="no-models" disabled>
                              No stock models available
                            </SelectItem>
                          );
                        }

                        return modelOptions.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName || model.name} - ${model.price?.toFixed(2) || '0.00'}
                          </SelectItem>
                        ));
                      })()}
                    </SelectContent>
                  </Select>
                  {errors.modelId && <p className="text-sm text-red-500">{errors.modelId}</p>}
                  {modelOptions.length === 0 && (
                    <p className="text-sm text-yellow-600">Loading stock models...</p>
                  )}
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
                    {(() => {
                      // Business rule: Impact Action Inlet + Long Action Length cannot have Left handedness
                      const hasImpactInlet = features.action_inlet && features.action_inlet.toLowerCase().includes('impact');
                      const isLongAction = features.action_length === 'long';
                      const shouldRestrictLeft = hasImpactInlet && isLongAction;
                      
                      return (
                        <Select 
                          key={`handedness-${renderKey}-${features.handedness || 'empty'}`}
                          value={features.handedness || undefined} 
                          onValueChange={(value) => setFeatures(prev => ({ ...prev, handedness: value }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select handedness..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="right">Right</SelectItem>
                            {!shouldRestrictLeft && <SelectItem value="left">Left</SelectItem>}
                            {shouldRestrictLeft && (
                              <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                                Left not available for Impact Inlet + Long Action
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>

                  {/* Action Inlet */}
                  <div>
                    <Label>Action Inlet</Label>
                    <Select 
                      key={`action-inlet-${renderKey}-${features.action_inlet || 'empty'}`}
                      value={features.action_inlet || undefined} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, action_inlet: value }))}
                      disabled={isFlattop}
                    >
                      <SelectTrigger className={isFlattop ? "opacity-50 cursor-not-allowed" : ""}>
                        <SelectValue placeholder={isFlattop ? "Not Available (Flattop)" : "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs
                          .find(f => f.name === 'action_inlet' || f.id === 'action_inlet')
                          ?.options?.filter(option => {
                            // Filter out empty options
                            if (!option.value || option.value.trim() === '') return false;
                            
                            // Business rule: Filter out Impact options when Action Length is "Long" and Handedness is "Left"
                            const isLongAction = features.action_length === 'long';
                            const isLeftHanded = features.handedness === 'left';
                            const isImpactOption = option.value.toLowerCase().includes('impact') || 
                                                 option.label.toLowerCase().includes('impact');
                            
                            if (isLongAction && isLeftHanded && isImpactOption) {
                              return false;
                            }
                            
                            return true;
                          })
                          ?.map((option) => (
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
                      value={features.barrel_inlet || undefined} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, barrel_inlet: value }))}
                      disabled={isFlattop}
                    >
                      <SelectTrigger className={isFlattop ? "opacity-50 cursor-not-allowed" : ""}>
                        <SelectValue placeholder={isFlattop ? "Not Available (Flattop)" : "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs
                          .find(f => f.name === 'barrel_inlet' || f.id === 'barrel_inlet')
                          ?.options?.filter(option => option.value && option.value.trim() !== '')
                          ?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          )) || []}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* LOP Length Of Pull - Show message for CAT and Visigoth models */}
                  <div>
                    <Label>LOP Length Of Pull</Label>
                    {(() => {
                      // Check if selected model contains "CAT" or "Visigoth"
                      const selectedModel = modelOptions.find(m => m.id === modelId);
                      const modelName = selectedModel?.displayName || selectedModel?.name || '';
                      const isRestrictedModel = modelName.toLowerCase().includes('cat') || 
                                              modelName.toLowerCase().includes('visigoth');
                      
                      return (
                        <Select 
                          value={features.length_of_pull || undefined} 
                          onValueChange={(value) => setFeatures(prev => ({ ...prev, length_of_pull: value }))}
                          disabled={isRestrictedModel}
                        >
                          <SelectTrigger className={isRestrictedModel ? "opacity-50 cursor-not-allowed" : ""}>
                            <SelectValue placeholder={isRestrictedModel ? "Not Available" : "Select..."} />
                          </SelectTrigger>
                          <SelectContent>
                        {(() => {
                          // Check if selected model contains "CAT" or "Visigoth"
                          const selectedModel = modelOptions.find(m => m.id === modelId);
                          const modelName = selectedModel?.displayName || selectedModel?.name || '';
                          const isRestrictedModel = modelName.toLowerCase().includes('cat') || 
                                                  modelName.toLowerCase().includes('visigoth');
                          
                          // Show "not available" message for restricted models
                          if (isRestrictedModel) {
                            return (
                              <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                                This Option not Available
                              </div>
                            );
                          }
                          
                          // Show normal options for other models
                          const lopFeature = featureDefs.find(f => 
                            f.id === 'length_of_pull' || 
                            f.name === 'length_of_pull' || 
                            f.id?.toLowerCase().includes('lop') ||
                            f.name?.toLowerCase().includes('lop') ||
                            f.displayName?.toLowerCase().includes('length of pull') ||
                            f.displayName?.toLowerCase().includes('lop')
                          );

                          if (!lopFeature || !lopFeature.options) {
                            return (
                              <div className="px-2 py-1.5 text-sm text-gray-500 italic">
                                No LOP options available
                              </div>
                            );
                          }

                          return lopFeature.options
                            .filter(option => option.value && option.value.trim() !== '')
                            .map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ));
                        })()}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>

                  {/* Texture */}
                  <div>
                    <Label>Texture</Label>
                    <Select 
                      value={features.texture_options || undefined} 
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

                          return textureFeature.options
                            .filter(option => option.value && option.value.trim() !== '')
                            .map((option) => (
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
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between">
                          {(() => {
                            const selectedCount = (features.other_options || []).length;
                            if (selectedCount === 0) return "Select options...";
                            if (selectedCount === 1) return "1 option selected";
                            return `${selectedCount} options selected`;
                          })()}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search options..." />
                          <CommandEmpty>No options found.</CommandEmpty>
                          <CommandGroup>
                            <CommandList className="max-h-48 overflow-y-auto">
                              {(() => {
                                const otherOptionsFeature = featureDefs.find(f => f.id === 'other_options');

                                if (!otherOptionsFeature || !otherOptionsFeature.options) {
                                  return (
                                    <div className="text-gray-500 text-sm p-3">
                                      No Other Options available
                                    </div>
                                  );
                                }

                                return otherOptionsFeature.options
                                  .filter(option => option.value && option.value.trim() !== '')
                                  .map((option) => {
                                    const isChecked = (features.other_options || []).includes(option.value);
                                    const showQuantity = isChecked && !option.label?.toLowerCase().includes('no');
                                    const quantity = otherOptionsQuantities[option.value] || 1;
                                    
                                    return (
                                      <CommandItem
                                        key={option.value}
                                        onSelect={() => {
                                          const currentOther = features.other_options || [];
                                          if (isChecked) {
                                            setFeatures(prev => ({ ...prev, other_options: currentOther.filter((item: string) => item !== option.value) }));
                                            // Remove quantity when unchecked
                                            setOtherOptionsQuantities(prev => {
                                              const newQuantities = { ...prev };
                                              delete newQuantities[option.value];
                                              return newQuantities;
                                            });
                                          } else {
                                            setFeatures(prev => ({ ...prev, other_options: [...currentOther, option.value] }));
                                            // Set default quantity to 1 for new selections
                                            setOtherOptionsQuantities(prev => ({ ...prev, [option.value]: 1 }));
                                          }
                                        }}
                                        className="cursor-pointer"
                                      >
                                        <div className="flex items-center space-x-2 w-full">
                                          <Checkbox
                                            checked={isChecked}
                                            onChange={() => {}} // Handled by onSelect
                                            className="pointer-events-none"
                                          />
                                          <div className="flex-1 space-y-1">
                                            <div className="text-sm font-medium">
                                              {option.label}
                                              {option.price && option.price > 0 && (
                                                <span className="ml-2 text-blue-600 font-bold">
                                                  +${option.price.toFixed(2)}{showQuantity && ` x ${quantity}`}
                                                </span>
                                              )}
                                            </div>
                                            {showQuantity && (
                                              <div className="flex items-center space-x-2">
                                                <Label className="text-xs text-gray-600">Qty:</Label>
                                                <Input
                                                  type="number"
                                                  min="1"
                                                  value={quantity}
                                                  onChange={(e) => {
                                                    const newQuantity = Math.max(1, parseInt(e.target.value) || 1);
                                                    setOtherOptionsQuantities(prev => ({ ...prev, [option.value]: newQuantity }));
                                                  }}
                                                  className="w-16 h-6 text-xs"
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </CommandItem>
                                    );
                                  });
                              })()}
                            </CommandList>
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {/* Display selected options as badges */}
                    {features.other_options && features.other_options.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {features.other_options.map((optionValue: string) => {
                          const otherOptionsFeature = featureDefs.find(f => f.id === 'other_options');
                          const option = otherOptionsFeature?.options?.find(o => o.value === optionValue);
                          const quantity = otherOptionsQuantities[optionValue] || 1;
                          const showQuantity = !option?.label?.toLowerCase().includes('no');
                          
                          return (
                            <Badge 
                              key={optionValue}
                              variant="secondary" 
                              className="text-xs px-2 py-1"
                            >
                              {option?.label}{showQuantity && ` (${quantity})`}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  {/* Action Length */}
                  <div>
                    <Label>Action Length</Label>
                    <Select 
                      key={`action-length-${renderKey}-${features.action_length || 'empty'}`}
                      value={features.action_length || undefined} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, action_length: value }))}
                      disabled={isFlattop}
                    >
                      <SelectTrigger className={isFlattop ? "opacity-50 cursor-not-allowed" : ""}>
                        <SelectValue placeholder={isFlattop ? "Not Available (Flattop)" : "Short"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short</SelectItem>
                        {(() => {
                          // Check if selected model contains "Ferrata" or "Armor"
                          // If so, exclude Medium option
                          const selectedModel = modelOptions.find(m => m.id === modelId);
                          const modelName = selectedModel?.displayName || selectedModel?.name || '';
                          const excludeMedium = modelName.toLowerCase().includes('ferrata') || 
                                              modelName.toLowerCase().includes('armor');
                          
                          // Only show Medium if model doesn't contain Ferrata/Armor
                          if (!excludeMedium) {
                            return <SelectItem value="medium">Medium</SelectItem>;
                          }
                          return null;
                        })()}
                        <SelectItem value="long">Long</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Bottom Metal */}
                  <div>
                    <Label>Bottom Metal</Label>
                    <Select 
                      key={`bottom-metal-${renderKey}-${features.bottom_metal || 'empty'}`}
                      value={features.bottom_metal || undefined} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, bottom_metal: value }))}
                      disabled={isFlattop}
                    >
                      <SelectTrigger className={isFlattop ? "opacity-50 cursor-not-allowed" : ""}>
                        <SelectValue placeholder={isFlattop ? "Not Available (Flattop)" : "Select..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs
                          .find(f => f.name === 'bottom_metal' || f.id === 'bottom_metal')
                          ?.options?.filter(option => {
                            // Filter out empty options
                            if (!option.value || option.value.trim() === '') return false;
                            
                            // Business rule: Filter out specific bottom metals when Action Length is "Medium"
                            const isMediumAction = features.action_length === 'medium';
                            const restrictedBottomMetals = ['ag_m5_sa', 'ag_m5_la', 'ag_m5_la_cip', 'ag_bdl_sa', 'ag_bdl_la'];
                            
                            if (isMediumAction && restrictedBottomMetals.includes(option.value)) {
                              return false;
                            }
                            
                            return true;
                          })
                          ?.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          )) || []}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* QD Quick Detach Cups */}
                  <div>
                    <Label className="flex items-center gap-2">
                      QD Quick Detach Cups
                      {(() => {
                        const selectedModel = modelOptions.find(m => m.id === modelId);
                        const isChalkModel = selectedModel?.displayName?.toLowerCase().includes('chalk') || 
                                           selectedModel?.name?.toLowerCase().includes('chalk');
                        return isChalkModel && (
                          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                            Chalk Model - Limited Options
                          </span>
                        );
                      })()}
                    </Label>
                    <Select 
                      key={`qd-accessory-${renderKey}-${features.qd_accessory || 'empty'}`}
                      value={features.qd_accessory || undefined} 
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

                          // Check if selected model contains "Chalk" in the name
                          const selectedModel = modelOptions.find(m => m.id === modelId);
                          const isChalkModel = selectedModel?.displayName?.toLowerCase().includes('chalk') || 
                                             selectedModel?.name?.toLowerCase().includes('chalk');
                          
                          // Define limited QD options for Chalk models (based on actual database values)
                          const chalkQDOptions = ['no_qds', 'qd_1_right_butt', 'qd_1_left_butt'];
                          
                          // Filter options based on model type
                          let availableOptions = qdFeature.options.filter(option => option.value && option.value.trim() !== '');
                          
                          if (isChalkModel) {
                            console.log('🎯 Chalk model detected for QDs:', selectedModel?.displayName);
                            console.log('🎯 Original QD options:', availableOptions.map(o => o.label));
                            
                            availableOptions = availableOptions.filter(option => 
                              chalkQDOptions.includes(option.value)
                            );
                            
                            console.log('🎯 Filtered QD options for Chalk:', availableOptions.map(o => o.label));
                          }

                          return availableOptions.map((option) => (
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
                    <Label className="flex items-center gap-2">
                      Rails
                      {(() => {
                        const selectedModel = modelOptions.find(m => m.id === modelId);
                        const isChalkModel = selectedModel?.displayName?.toLowerCase().includes('chalk') || 
                                           selectedModel?.name?.toLowerCase().includes('chalk');
                        return isChalkModel && (
                          <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                            Chalk Model - Limited Options
                          </span>
                        );
                      })()}
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between">
                          {(() => {
                            const selectedCount = (features.rail_accessory || []).length;
                            if (selectedCount === 0) return "Select rails...";
                            if (selectedCount === 1) return "1 rail selected";
                            return `${selectedCount} rails selected`;
                          })()}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search rails..." />
                          <CommandEmpty>No rails found.</CommandEmpty>
                          <CommandGroup>
                            <CommandList className="max-h-48 overflow-y-auto">
                              {(() => {
                                const railsFeature = featureDefs.find(f => f.id === 'rail_accessory');

                                if (!railsFeature || !railsFeature.options) {
                                  return (
                                    <div className="text-gray-500 text-sm p-3">
                                      No Rails options available
                                    </div>
                                  );
                                }

                                // Check if selected model contains "Chalk" in the name
                                const selectedModel = modelOptions.find(m => m.id === modelId);
                                const isChalkModel = selectedModel?.displayName?.toLowerCase().includes('chalk') || 
                                                   selectedModel?.name?.toLowerCase().includes('chalk');
                                
                                // Define limited Rails options for Chalk models (based on actual database values)
                                const chalkRailsOptions = ['arca_4', 'pic_rail', 'pic_intgrated_stud'];
                                
                                // Filter options based on model type
                                let availableOptions = railsFeature.options.filter(option => option.value && option.value.trim() !== '');
                                
                                if (isChalkModel) {
                                  console.log('🎯 Chalk model detected:', selectedModel?.displayName);
                                  console.log('🎯 Original Rails options:', availableOptions.map(o => o.label));
                                  
                                  availableOptions = availableOptions.filter(option => 
                                    chalkRailsOptions.includes(option.value) ||
                                    option.label?.toLowerCase().includes('4" arca rail') ||
                                    option.label?.toLowerCase().includes('ag pic') ||
                                    option.label?.toLowerCase().includes('ag pic w/int stud')
                                  );
                                  
                                  console.log('🎯 Filtered Rails options for Chalk:', availableOptions.map(o => o.label));
                                }
                                
                                return availableOptions.map((option) => {
                                  const isChecked = (features.rail_accessory || []).includes(option.value);
                                  
                                  return (
                                    <CommandItem
                                      key={option.value}
                                      onSelect={() => {
                                        const currentRails = features.rail_accessory || [];
                                        if (isChecked) {
                                          setFeatures(prev => ({ ...prev, rail_accessory: currentRails.filter((item: string) => item !== option.value) }));
                                        } else {
                                          setFeatures(prev => ({ ...prev, rail_accessory: [...currentRails, option.value] }));
                                        }
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <div className="flex items-center space-x-2 w-full">
                                        <Checkbox
                                          checked={isChecked}
                                          onChange={() => {}} // Handled by onSelect
                                          className="pointer-events-none"
                                        />
                                        <div className="flex-1">
                                          <div className="text-sm font-medium">
                                            {option.label}
                                            {option.price && option.price > 0 && (
                                              <span className="ml-2 text-blue-600 font-bold">+${option.price.toFixed(2)}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </CommandItem>
                                  );
                                });
                              })()}
                            </CommandList>
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {/* Display selected rails as badges */}
                    {features.rail_accessory && features.rail_accessory.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {features.rail_accessory.map((optionValue: string) => {
                          const railsFeature = featureDefs.find(f => f.id === 'rail_accessory');
                          const option = railsFeature?.options?.find(o => o.value === optionValue);
                          
                          return (
                            <Badge 
                              key={optionValue}
                              variant="secondary" 
                              className="text-xs px-2 py-1"
                            >
                              {option?.label}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Swivel Studs */}
                  <div>
                    <Label>Swivel Studs</Label>
                    <Select 
                      value={features.swivel_studs || undefined} 
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

                          return swivelFeature.options
                            .filter(option => option.value && option.value.trim() !== '')
                            .map((option) => (
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
                      value={features.paint_options || undefined} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, paint_options: value }))}
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
                                // Only add options with valid, non-empty values
                                if (option.value && option.value.trim() !== '') {
                                  allOptions.push({
                                    value: option.value,
                                    label: `${feature.displayName || feature.name} - ${option.label}`,
                                    category: feature.displayName || feature.name
                                  });
                                }
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

              {/* Miscellaneous Items */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Miscellaneous Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addMiscItem}
                    className="h-8 px-3"
                  >
                    + Add Item
                  </Button>
                </div>
                
                {miscItems.length > 0 && (
                  <div className="space-y-3">
                    {miscItems.map((item) => (
                      <div key={item.id} className="border rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="md:col-span-2">
                            <Label htmlFor={`misc-desc-${item.id}`} className="text-sm">Description</Label>
                            <Input
                              id={`misc-desc-${item.id}`}
                              value={item.description}
                              onChange={(e) => updateMiscItem(item.id, 'description', e.target.value)}
                              placeholder="Item description..."
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`misc-qty-${item.id}`} className="text-sm">Quantity</Label>
                            <Input
                              id={`misc-qty-${item.id}`}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateMiscItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`misc-price-${item.id}`} className="text-sm">Unit Price</Label>
                            <Input
                              id={`misc-price-${item.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => updateMiscItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-600">
                            Total: <span className="font-medium text-blue-600">${item.total.toFixed(2)}</span>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeMiscItem(item.id)}
                            className="h-8 px-3 text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {miscItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-sm">No miscellaneous items added</p>
                    <p className="text-xs mt-1">Click "Add Item" to include custom items with pricing</p>
                  </div>
                )}
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
                    <span className="font-medium">{features.handedness ? (features.handedness === 'right' ? 'Right' : 'Left') : 'Not selected'}</span>
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
                    <span className="font-medium">{features.action_length ? (() => {
                      const feature = featureDefs.find(f => f.id === 'action_length');
                      const option = feature?.options?.find(opt => opt.value === features.action_length);
                      return option?.label || features.action_length.charAt(0).toUpperCase() + features.action_length.slice(1);
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.action_length ? (() => {
                      const feature = featureDefs.find(f => f.id === 'action_length');
                      const option = feature?.options?.find(opt => opt.value === features.action_length);
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
                    <span className="font-medium">{features.bottom_metal ? (() => {
                      const feature = featureDefs.find(f => f.id === 'bottom_metal');
                      const option = feature?.options?.find(opt => opt.value === features.bottom_metal);
                      return option?.label || features.bottom_metal;
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.bottom_metal ? (() => {
                      const feature = featureDefs.find(f => f.id === 'bottom_metal');
                      const option = feature?.options?.find(opt => opt.value === features.bottom_metal);
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
                    console.log('🔧 Rails feature found:', !!feature, feature?.displayName);
                    return feature?.displayName || 'Rails';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{(() => {
                      const currentRails = features.rail_accessory || [];

                      console.log('🔧 Rails state debug:', {
                        'features.rail_accessory': features.rail_accessory,
                        currentRails,
                        featureDefsCount: featureDefs.length
                      });

                      if (currentRails && currentRails.length > 0) {
                        const feature = featureDefs.find(f => f.id === 'rail_accessory');
                        if (!feature?.options) {
                          console.log('🔧 Rails feature found but no options:', feature);
                          return currentRails.join(', ');
                        }
                        const labels = Array.isArray(currentRails) ? currentRails.map((optionValue: string) => {
                          const option = feature.options!.find(opt => opt.value === optionValue);
                          console.log('🔧 Rails option lookup:', optionValue, '→', option?.label);
                          return option?.label || optionValue;
                        }) : [];
                        return labels.join(', ');
                      }
                      return 'Not selected';
                    })()}</span>
                    <span className="text-blue-600 font-bold">${(() => {
                      const currentRails = features.rail_accessory || [];

                      if (currentRails && currentRails.length > 0) {
                        const feature = featureDefs.find(f => f.id === 'rail_accessory');
                        if (!feature?.options) return '0.00';
                        const totalPrice = Array.isArray(currentRails) ? currentRails.reduce((sum: number, optionValue: string) => {
                          const option = feature.options!.find(opt => opt.value === optionValue);
                          return sum + (option?.price || 0);
                        }, 0) : 0;
                        return totalPrice.toFixed(2);
                      }
                      return '0.00';
                    })()}</span>
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
                    <span className="font-medium">{features.other_options && features.other_options.length > 0 ? (() => {
                      const feature = featureDefs.find(f => f.id === 'other_options');
                      if (!feature?.options) return features.other_options.join(', ');
                      const labels = features.other_options.map((optionValue: string) => {
                        const option = feature.options!.find(opt => opt.value === optionValue);
                        const quantity = otherOptionsQuantities[optionValue] || 1;
                        const baseLabel = option?.label || optionValue;
                        const showQuantity = !option?.label?.toLowerCase().includes('no');
                        return showQuantity && quantity > 1 ? `${baseLabel} (${quantity})` : baseLabel;
                      });
                      return labels.join(', ');
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.other_options && features.other_options.length > 0 ? (() => {
                      const feature = featureDefs.find(f => f.id === 'other_options');
                      if (!feature?.options) return '0.00';
                      const totalPrice = features.other_options.reduce((sum: number, optionValue: string) => {
                        const option = feature.options!.find(opt => opt.value === optionValue);
                        const quantity = otherOptionsQuantities[optionValue] || 1;
                        return sum + ((option?.price || 0) * quantity);
                      }, 0);
                      return totalPrice.toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>

                {/* Paint Options */}
                <div className="flex justify-between items-center">
                  <span>Paint Options:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{(() => {
                      const currentPaint = features.metallic_finishes || features.paint_options || features.paint_options_combined;

                      console.log('🎨 Paint state debug:', {
                        'features.metallic_finishes': features.metallic_finishes,
                        'features.paint_options': features.paint_options,
                        'features.paint_options_combined': features.paint_options_combined,
                        currentPaint,
                        featureDefsCount: featureDefs.length
                      });

                      if (currentPaint && currentPaint !== 'none') {
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

                        console.log('🎨 Paint features found:', paintFeatures.length, paintFeatures.map(f => ({ id: f.id, displayName: f.displayName, optionsCount: f.options?.length })));

                        for (const feature of paintFeatures) {
                          if (feature.options) {
                            const option = feature.options.find(opt => opt.value === currentPaint);
                            if (option) {
                              console.log('🎨 Paint option found:', currentPaint, '→', option.label, '$' + option.price);
                              return option.label;
                            }
                          }
                        }
                        console.log('🎨 Paint option not found for value:', currentPaint);
                        return 'Selected';
                      }
                      return 'Not selected';
                    })()}</span>
                    <span className="text-blue-600 font-bold">${(() => {
                      const currentPaint = features.metallic_finishes || features.paint_options || features.paint_options_combined;

                      if (currentPaint && currentPaint !== 'none') {
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
                            const option = feature.options.find(opt => opt.value === currentPaint);
                            if (option) {
                              return (option.price || 0).toFixed(2);
                            }
                          }
                        }
                        return '0.00';
                      }
                      return '0.00';
                    })()}</span>
                  </div>
                </div>



                {/* Miscellaneous Items */}
                {miscItems.length > 0 && (
                  <div className="border-t pt-3 mt-3">
                    <div className="font-medium text-base mb-2">Miscellaneous Items</div>
                    <div className="space-y-2">
                      {miscItems.map((item) => (
                        <div key={item.id} className="flex justify-between items-center text-sm">
                          <div className="flex-1">
                            <div className="font-medium">{item.description || 'Untitled Item'}</div>
                            <div className="text-gray-500">Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}</div>
                          </div>
                          <span className="text-blue-600 font-bold">${item.total.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center font-medium pt-2 border-t">
                        <span>Misc Items Total:</span>
                        <span className="text-blue-600 font-bold">
                          ${miscItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Discount Code */}
              <div className="border-t pt-4">
                <div className="font-medium text-base mb-2">Discount Code</div>
                <Select value={discountCode} onValueChange={(value) => {
                  setDiscountCode(value);
                  // Handle custom discount selection
                  if (value === 'custom') {
                    setShowCustomDiscount(true);
                    setDiscountDetails(null);
                  } else {
                    setShowCustomDiscount(false);
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
                
                {/* Custom Discount Fields */}
                {showCustomDiscount && (
                  <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-3">
                    <div className="text-sm font-medium">Custom Discount Amount</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="custom-discount-type">Type</Label>
                        <Select value={customDiscountType} onValueChange={(value: 'percent' | 'amount') => setCustomDiscountType(value)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">Percentage (%)</SelectItem>
                            <SelectItem value="amount">Fixed Amount ($)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="custom-discount-value">
                          {customDiscountType === 'percent' ? 'Percentage' : 'Amount ($)'}
                        </Label>
                        <Input
                          id="custom-discount-value"
                          type="number"
                          step={customDiscountType === 'percent' ? '1' : '0.01'}
                          min="0"
                          max={customDiscountType === 'percent' ? '100' : undefined}
                          placeholder={customDiscountType === 'percent' ? 'e.g., 10' : 'e.g., 123.45'}
                          value={customDiscountValue || ''}
                          onChange={(e) => setCustomDiscountValue(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {customDiscountType === 'percent' 
                        ? `${customDiscountValue}% off the subtotal`
                        : `$${customDiscountValue.toFixed(2)} off the subtotal`
                      }
                    </div>
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





              </div>

              {/* Payment Management Section */}
              {orderId && orderId !== 'Loading...' && (
                <div className="border-t pt-4">
                  <PaymentManager
                    orderId={orderId}
                    totalAmount={totalPrice + shipping}
                    onPaymentsChange={setOrderPayments}
                    isInline={true}
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-4">
                <Button
                  type="button"
                  className="w-full"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit(undefined, true)}
                >
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  variant="default"
                  disabled={isSubmitting}
                  onClick={() => handleSubmit(undefined, false)}
                >
                  {isSubmitting ? "Processing..." : (isEditMode ? "Update Order" : "Create Order")}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>


      </div>
    </div>
  );
}
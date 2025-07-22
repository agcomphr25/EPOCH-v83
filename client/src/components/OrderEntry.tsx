
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
  displayName: string;
  type: 'dropdown' | 'search' | 'text' | 'multiselect' | 'checkbox';
  options?: { value: string; label: string; price?: number }[];
  category?: string;
  subcategory?: string;
}

export default function OrderEntry() {
  const { toast } = useToast();

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

  // Discount and pricing
  const [discountCode, setDiscountCode] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<'percent' | 'amount'>('percent');
  
  // Payment state
  const [isPaid, setIsPaid] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentType, setPaymentType] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentTimestamp, setPaymentTimestamp] = useState<Date | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Calculate total price based on selected features
  const calculateTotalPrice = useCallback(() => {
    let total = 0;

    // Add stock model price
    const selectedModel = modelOptions.find(model => model.id === modelId);
    if (selectedModel) {
      total += selectedModel.price || 0;
    }

    // Add feature prices
    Object.entries(features).forEach(([featureId, value]) => {
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

    // Add rail accessory prices
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

    // Add other options prices
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
  }, [modelOptions, modelId, featureDefs, features, railAccessory, otherOptions]);

  const totalPrice = calculateTotalPrice();

  // Helper function to format currency with commas
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [showCustomDiscount, setShowCustomDiscount] = useState(false);
  const [shipping, setShipping] = useState(36.95);

  // Additional fields
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [notes, setNotes] = useState('');

  // Load initial data
  useEffect(() => {
    loadStockModels();
    loadFeatures();
    loadDiscountCodes();
    generateOrderId();
  }, []);

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
      
      const discounts = [];
      
      // Add active short-term sales
      const now = new Date();
      shortTermSales
        .filter((sale: any) => {
          const startDate = new Date(sale.startDate);
          const endDate = new Date(sale.endDate);
          return startDate <= now && now <= endDate && sale.isActive;
        })
        .forEach((sale: any) => {
          discounts.push({
            value: `short_term_${sale.id}`,
            label: `${sale.name} (${sale.percent}% off)`
          });
        });
      
      // Add active persistent discounts
      persistentDiscounts
        .filter((discount: any) => discount.isActive)
        .forEach((discount: any) => {
          const displayValue = discount.percent 
            ? `${discount.percent}% off`
            : `$${(discount.fixedAmount / 100).toFixed(2)} off`;
          discounts.push({
            value: `persistent_${discount.id}`,
            label: `${discount.name} (${displayValue})`
          });
        });
      
      setDiscountOptions(discounts);
    } catch (error) {
      console.error('Failed to load discount codes:', error);
    }
  };

  const generateOrderId = async () => {
    try {
      const response = await apiRequest('/api/orders/generate-id', {
        method: 'POST'
      });
      setOrderId(response.orderId);
    } catch (error) {
      console.error('Failed to generate order ID:', error);
    }
  };

  // Calculate order total
  const calculateTotal = useCallback(() => {
    const selectedModel = modelOptions.find(m => m.id === modelId);
    const basePrice = selectedModel?.price || 0;
    
    let featureCost = 0;
    
    // Calculate cost from features state
    Object.entries(features).forEach(([featureId, value]) => {
      const feature = featureDefs.find(f => f.id === featureId);
      if (feature?.options) {
        const option = feature.options.find(opt => opt.value === value);
        featureCost += option?.price || 0;
      }
    });
    
    // Add cost from bottom metal selection
    if (bottomMetal) {
      const bottomMetalFeature = featureDefs.find(f => f.id === 'bottom_metal');
      if (bottomMetalFeature?.options) {
        const option = bottomMetalFeature.options.find(opt => opt.value === bottomMetal);
        featureCost += option?.price || 0;
      }
    }
    
    // Add cost from paint options
    if (paintOptions && paintOptions !== 'none') {
      const paintFeatures = featureDefs.filter(f => 
        f.displayName === 'Cerakote Options' ||
        f.displayName === 'Terrain Options' ||
        f.displayName === 'Rogue Options' ||
        f.displayName === 'Standard Options' ||
        f.displayName === 'Carbon Camo Ready' ||
        f.displayName === 'Camo Options' ||
        f.id === 'metallic_finishes' ||
        f.name === 'metallic_finishes'
      );
      
      for (const feature of paintFeatures) {
        if (feature.options) {
          const option = feature.options.find(opt => opt.value === paintOptions);
          if (option) {
            featureCost += option.price || 0;
            break;
          }
        }
      }
    }
    
    // Add cost from other options (multiselect)
    if (otherOptions && otherOptions.length > 0) {
      const feature = featureDefs.find(f => f.id === 'other_options');
      if (feature?.options) {
        otherOptions.forEach(optionValue => {
          const option = feature.options!.find(opt => opt.value === optionValue);
          if (option) {
            featureCost += option.price || 0;
          }
        });
      }
    }
    
    // Add cost from rail accessory (multiselect)
    if (railAccessory && railAccessory.length > 0) {
      const feature = featureDefs.find(f => f.id === 'rail_accessory');
      if (feature?.options) {
        railAccessory.forEach(optionValue => {
          const option = feature.options!.find(opt => opt.value === optionValue);
          if (option) {
            featureCost += option.price || 0;
          }
        });
      }
    }

    const subtotal = basePrice + featureCost;
    const total = subtotal + shipping;

    return {
      basePrice,
      featureCost,
      subtotal,
      shipping,
      total
    };
  }, [modelId, modelOptions, features, featureDefs, shipping, bottomMetal, paintOptions, otherOptions, railAccessory]);

  const pricing = calculateTotal();

  const handleSubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }
    
    setErrors({});
    setIsSubmitting(true);

    try {
      if (!customer) {
        setErrors(prev => ({ ...prev, customer: 'Customer is required' }));
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

      const orderData = {
        customerId: customer.id.toString(),
        modelId,
        features,
        orderDate: orderDate.toISOString(),
        dueDate: dueDate.toISOString(),
        orderId,
        customerPO: hasCustomerPO ? customerPO : '',
        fbOrderNumber,
        handedness,
        shipping,
        status: 'DRAFT',
        isCustomOrder,
        notes,
        discountCode,
        customDiscountType,
        customDiscountValue,
        showCustomDiscount
      };

      const response = await apiRequest('/api/orders/draft', {
        method: 'POST',
        body: orderData
      });

      toast({
        title: "Success",
        description: "Order saved as draft",
      });

      // Reset form
      resetForm();

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
    setShipping(36.95);
    setIsCustomOrder(false);
    setNotes('');
    setErrors({});
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
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="AG200"
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
                  <Label htmlFor="customer">Customer</Label>
                  <CustomerSearchInput
                    value={customer}
                    onValueChange={setCustomer}
                    placeholder="Search customer..."
                    error={errors.customer}
                  />
                </div>
                
                <div>
                  <Label htmlFor="customer-po">Customer PO</Label>
                  <div className="flex items-center gap-4">
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="heavy">Heavy</SelectItem>
                        <SelectItem value="bull">Bull</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* LOP Length Of Pull */}
                  <div>
                    <Label>LOP Length Of Pull</Label>
                    <Select 
                      value={features.lop || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, lop: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          // Try multiple possible IDs for the LOP feature
                          const lopFeature = featureDefs.find(f => 
                            f.id === 'lop' || 
                            f.name === 'lop' || 
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
                      value={features.texture || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, texture: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const textureFeature = featureDefs.find(f => 
                            f.id === 'texture' || 
                            f.name === 'texture' || 
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select or search..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None selected</SelectItem>
                      </SelectContent>
                    </Select>
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
                      value={features.qd_quick_detach || ''} 
                      onValueChange={(value) => setFeatures(prev => ({ ...prev, qd_quick_detach: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(() => {
                          const qdFeature = featureDefs.find(f => 
                            f.id === 'qd_quick_detach' || 
                            f.name === 'qd_quick_detach' || 
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select options..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="picatinny">Picatinny Rail</SelectItem>
                      </SelectContent>
                    </Select>
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
                      value={features.paint_options || ''} 
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
                  <span className="text-3xl font-bold text-blue-600">${pricing.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Items</span>
                  <span>Current Stock</span>
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
                    <span className="text-blue-600 font-bold">${selectedModel?.price?.toFixed(2) || '0.00'}</span>
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
                  <span>Action Length:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{actionLength ? actionLength.charAt(0).toUpperCase() + actionLength.slice(1) : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">$0.00</span>
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
                      const feature = featureDefs.find(f => f.id === 'action_inlet');
                      const option = feature?.options?.find(opt => opt.value === features.action_inlet);
                      return option?.label || features.action_inlet;
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
                    const feature = featureDefs.find(f => f.id === 'barrel_inlet');
                    return feature?.displayName || 'Barrel Inlet';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Not selected</span>
                    <span className="text-blue-600 font-bold">$0.00</span>
                  </div>
                </div>
                
                {/* QDs (Quick Detach Cups) */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'qd_quick_detach');
                    return feature?.displayName || 'QDs (Quick Detach Cups)';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.qd_quick_detach ? (() => {
                      const feature = featureDefs.find(f => f.id === 'qd_quick_detach');
                      const option = feature?.options?.find(opt => opt.value === features.qd_quick_detach);
                      return option?.label || features.qd_quick_detach;
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.qd_quick_detach ? (() => {
                      const feature = featureDefs.find(f => f.id === 'qd_quick_detach');
                      const option = feature?.options?.find(opt => opt.value === features.qd_quick_detach);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* LOP (Length of Pull) */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'lop');
                    return feature?.displayName || 'LOP (Length of Pull)';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.lop ? (() => {
                      const feature = featureDefs.find(f => f.id === 'lop');
                      const option = feature?.options?.find(opt => opt.value === features.lop);
                      return option?.label || features.lop;
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.lop ? (() => {
                      const feature = featureDefs.find(f => f.id === 'lop');
                      const option = feature?.options?.find(opt => opt.value === features.lop);
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
                    <span className="font-medium">{railAccessory && railAccessory.length > 0 ? railAccessory.join(', ') : 'Not selected'}</span>
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
                    const feature = featureDefs.find(f => f.id === 'texture');
                    return feature?.displayName || 'Texture';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{features.texture ? (() => {
                      const feature = featureDefs.find(f => f.id === 'texture');
                      const option = feature?.options?.find(opt => opt.value === features.texture);
                      return option?.label || features.texture;
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${features.texture ? (() => {
                      const feature = featureDefs.find(f => f.id === 'texture');
                      const option = feature?.options?.find(opt => opt.value === features.texture);
                      return (option?.price || 0).toFixed(2);
                    })() : '0.00'}</span>
                  </div>
                </div>
                
                {/* Swivel Studs */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'swivel_studs');
                    return feature?.displayName || 'Swivel Studs';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Not selected</span>
                    <span className="text-blue-600 font-bold">$0.00</span>
                  </div>
                </div>
                
                {/* Other Options */}
                <div className="flex justify-between items-center">
                  <span>{(() => {
                    const feature = featureDefs.find(f => f.id === 'other_options');
                    return feature?.displayName || 'Other Options';
                  })()}:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{otherOptions && otherOptions.length > 0 ? otherOptions.join(', ') : 'Not selected'}</span>
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
                      const paintFeatures = featureDefs.filter(f => 
                        f.displayName === 'Cerakote Options' ||
                        f.displayName === 'Terrain Options' ||
                        f.displayName === 'Rogue Options' ||
                        f.displayName === 'Standard Options' ||
                        f.displayName === 'Carbon Camo Ready' ||
                        f.displayName === 'Camo Options' ||
                        f.id === 'metallic_finishes' ||
                        f.name === 'metallic_finishes'
                      );
                      
                      for (const feature of paintFeatures) {
                        if (feature.options) {
                          const option = feature.options.find(opt => opt.value === paintOptions);
                          if (option) {
                            return option.label;
                          }
                        }
                      }
                      return paintOptions;
                    })() : 'Not selected'}</span>
                    <span className="text-blue-600 font-bold">${paintOptions && paintOptions !== 'none' ? (() => {
                      const paintFeatures = featureDefs.filter(f => 
                        f.displayName === 'Cerakote Options' ||
                        f.displayName === 'Terrain Options' ||
                        f.displayName === 'Rogue Options' ||
                        f.displayName === 'Standard Options' ||
                        f.displayName === 'Carbon Camo Ready' ||
                        f.displayName === 'Camo Options' ||
                        f.id === 'metallic_finishes' ||
                        f.name === 'metallic_finishes'
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
                <Select value={discountCode} onValueChange={setDiscountCode}>
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
              </div>

              {/* Shipping & Handling */}
              <div className="border-t pt-4">
                <div className="font-medium text-base mb-2">Shipping & Handling</div>
                <input 
                  type="number" 
                  placeholder="36.95"
                  defaultValue="36.95"
                  className="w-full p-3 border rounded-lg"
                  step="0.01"
                />
              </div>

              {/* Order Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Subtotal:</span>
                  <span className="font-bold">{formatCurrency(totalPrice)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium">Shipping & Handling:</span>
                  <span className="font-bold">{formatCurrency(36.95)}</span>
                </div>
                <div className="flex justify-between items-center text-lg border-t pt-2">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold text-blue-600">{formatCurrency(totalPrice + 36.95)}</span>
                </div>
                
                {/* Payment Amount - Only show if payment exists */}
                {isPaid && paymentAmount && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Payment Amount:</span>
                    <span className="font-bold text-green-600">-{formatCurrency(parseFloat(paymentAmount))}</span>
                  </div>
                )}
                
                {/* Balance Due/Credit - Only show if payment exists */}
                {isPaid && paymentAmount && (() => {
                  const remainingBalance = (totalPrice + 36.95) - parseFloat(paymentAmount || '0');
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

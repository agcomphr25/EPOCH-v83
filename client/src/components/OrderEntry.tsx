
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

    const subtotal = basePrice + featureCost;
    const total = subtotal + shipping;

    return {
      basePrice,
      featureCost,
      subtotal,
      shipping,
      total
    };
  }, [modelId, modelOptions, features, featureDefs, shipping]);

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

              {/* Customer Selection */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <CustomerSearchInput
                    value={customer}
                    onValueChange={setCustomer}
                    placeholder="Search customer..."
                    error={errors.customer}
                  />
                </div>
              </div>

              {/* FB Order */}
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>FB Order #</Label>
                  <Input
                    name="fbOrderNumber"
                    value={fbOrderNumber}
                    onChange={(e) => setFbOrderNumber(e.target.value)}
                    placeholder="Enter FB Order #"
                  />
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
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>1</span>
                  <span className="text-blue-600 font-semibold">${pricing.basePrice.toFixed(2)}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {selectedModel?.displayName || 'No model selected'}
                </div>
              </div>

              {/* Feature Selections */}
              <div className="space-y-1 text-sm">
                <div className="font-medium">Feature Selections</div>
                <div className="space-y-1 text-muted-foreground">
                  {/* Stock Model */}
                  <div className="flex justify-between">
                    <span>Stock Model:</span>
                    <div className="text-right">
                      <span>{selectedModel?.displayName || 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">${selectedModel?.price?.toFixed(2) || '0.00'}</span>
                    </div>
                  </div>
                  
                  {/* Handedness */}
                  <div className="flex justify-between">
                    <span>Handedness:</span>
                    <div className="text-right">
                      <span>{handedness ? (handedness === 'right' ? 'Right' : 'Left') : 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* Action Length */}
                  <div className="flex justify-between">
                    <span>Action Length:</span>
                    <div className="text-right">
                      <span>{actionLength ? actionLength.charAt(0).toUpperCase() + actionLength.slice(1) : 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* Action Inlet */}
                  <div className="flex justify-between">
                    <span>Action Inlet:</span>
                    <div className="text-right">
                      <span>{features.action_inlet ? (() => {
                        const feature = featureDefs.find(f => f.id === 'action_inlet');
                        const option = feature?.options?.find(opt => opt.value === features.action_inlet);
                        return option?.label || features.action_inlet;
                      })() : 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">${features.action_inlet ? (() => {
                        const feature = featureDefs.find(f => f.id === 'action_inlet');
                        const option = feature?.options?.find(opt => opt.value === features.action_inlet);
                        return (option?.price || 0).toFixed(2);
                      })() : '0.00'}</span>
                    </div>
                  </div>
                  
                  {/* Bottom Metal */}
                  <div className="flex justify-between">
                    <span>Bottom Metal:</span>
                    <div className="text-right">
                      <span>{bottomMetal ? (() => {
                        const feature = featureDefs.find(f => f.id === 'bottom_metal');
                        const option = feature?.options?.find(opt => opt.value === bottomMetal);
                        return option?.label || bottomMetal;
                      })() : 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">${bottomMetal ? (() => {
                        const feature = featureDefs.find(f => f.id === 'bottom_metal');
                        const option = feature?.options?.find(opt => opt.value === bottomMetal);
                        return (option?.price || 0).toFixed(2);
                      })() : '0.00'}</span>
                    </div>
                  </div>
                  
                  {/* Barrel Inlet */}
                  <div className="flex justify-between">
                    <span>Barrel Inlet:</span>
                    <div className="text-right">
                      <span>Not selected</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* QDs (Quick Detach Cups) */}
                  <div className="flex justify-between">
                    <span>QDs (Quick Detach Cups):</span>
                    <div className="text-right">
                      <span>Not selected</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* LOP (Length of Pull) */}
                  <div className="flex justify-between">
                    <span>LOP (Length of Pull):</span>
                    <div className="text-right">
                      <span>{features.lop ? (() => {
                        const feature = featureDefs.find(f => f.id === 'lop');
                        const option = feature?.options?.find(opt => opt.value === features.lop);
                        return option?.label || features.lop;
                      })() : 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">${features.lop ? (() => {
                        const feature = featureDefs.find(f => f.id === 'lop');
                        const option = feature?.options?.find(opt => opt.value === features.lop);
                        return (option?.price || 0).toFixed(2);
                      })() : '0.00'}</span>
                    </div>
                  </div>
                  
                  {/* Rails */}
                  <div className="flex justify-between">
                    <span>Rails:</span>
                    <div className="text-right">
                      <span>Not selected</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* Texture */}
                  <div className="flex justify-between">
                    <span>Texture:</span>
                    <div className="text-right">
                      <span>{features.texture ? (() => {
                        const feature = featureDefs.find(f => f.id === 'texture');
                        const option = feature?.options?.find(opt => opt.value === features.texture);
                        return option?.label || features.texture;
                      })() : 'Not selected'}</span>
                      <span className="ml-2 text-blue-600">${features.texture ? (() => {
                        const feature = featureDefs.find(f => f.id === 'texture');
                        const option = feature?.options?.find(opt => opt.value === features.texture);
                        return (option?.price || 0).toFixed(2);
                      })() : '0.00'}</span>
                    </div>
                  </div>
                  
                  {/* Swivel Studs */}
                  <div className="flex justify-between">
                    <span>Swivel Studs:</span>
                    <div className="text-right">
                      <span>Not selected</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* Other Options */}
                  <div className="flex justify-between">
                    <span>Other Options:</span>
                    <div className="text-right">
                      <span>Not selected</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                  
                  {/* Paint Options */}
                  <div className="flex justify-between">
                    <span>Paint Options:</span>
                    <div className="text-right">
                      <span>Not selected</span>
                      <span className="ml-2 text-blue-600">$0.00</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Discount Code */}
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-2">Discount Code</div>
                <Select value={discountCode} onValueChange={setDiscountCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select discount code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No discount</SelectItem>
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
                <div className="text-sm font-medium mb-2">Shipping & Handling</div>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={shipping}
                  onChange={(e) => setShipping(parseFloat(e.target.value) || 0)}
                />
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>${pricing.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping & Handling</span>
                  <span>${pricing.shipping.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span className="text-blue-600">${pricing.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4">
                <Button
                  type="submit"
                  className="w-full"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  type="submit"
                  className="w-full"
                  variant="default"
                  disabled={isSubmitting}
                  onClick={handleSubmit}
                >
                  {isSubmitting ? "Processing..." : "Create Order"}
                </Button>
              </div>

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

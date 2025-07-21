
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
    Object.entries(features).forEach(([featureId, value]) => {
      const feature = featureDefs.find(f => f.id === featureId);
      if (feature?.options) {
        const option = feature.options.find(opt => opt.value === value);
        featureCost += option?.price || 0;
      }
    });

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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Texture */}
                  <div>
                    <Label>Texture</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="heavy">Heavy</SelectItem>
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
                    <Input
                      name="bottomMetal"
                      value={bottomMetal}
                      onChange={(e) => setBottomMetal(e.target.value)}
                      placeholder=""
                    />
                  </div>

                  {/* QD Quick Detach Cups */}
                  <div>
                    <Label>QD Quick Detach Cups</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="front">Front</SelectItem>
                        <SelectItem value="rear">Rear</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="qd">QD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Paint Options */}
                  <div>
                    <Label>Paint Options</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select or search..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="primer">Primer Only</SelectItem>
                        <SelectItem value="custom">Custom Paint</SelectItem>
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

              {/* Action Buttons */}
              <div className="space-y-2 pt-4">
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>
                <Button
                  type="submit"
                  className="w-full"
                  variant="default"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Processing..." : "Create Order"}
                </Button>
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
                  <div className="flex justify-between">
                    <span>Handedness</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Action Length</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Action Inlet</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Barrel Inlet</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bottom Metal</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>QD Quick Detach Cups</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LOP Length of Pull</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rails</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Texture</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Swivel Studs</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Other Options</span>
                    <span>$0.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paint Options</span>
                    <span>$0.00</span>
                  </div>
                </div>
              </div>

              {/* Discount Code */}
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-2">Discount Code</div>
                <Input
                  placeholder="Select discount code"
                  value={discountCode}
                  onChange={(e) => setDiscountCode(e.target.value)}
                />
              </div>

              {/* Shipping & Handling */}
              <div className="border-t pt-4">
                <div className="text-sm font-medium mb-2">Shipping & Handling</div>
                <div className="flex justify-between">
                  <span>${shipping.toFixed(2)}</span>
                </div>
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
                <div className="text-sm text-muted-foreground">
                  Save as Draft
                </div>
              </div>


            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

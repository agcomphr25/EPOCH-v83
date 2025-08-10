import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  fetchPOItems, 
  createPOItem, 
  updatePOItem, 
  deletePOItem, 
  fetchStockModels,
  fetchFeatures,
  type PurchaseOrderItem, 
  type CreatePurchaseOrderItemData,
  type StockModel,
  type Feature
} from '@/lib/poUtils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, Trash2, Package, Settings, ChevronsUpDown, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useToast } from '@/hooks/use-toast';
import { FEATURE_IDS, findFeature, getFeatureOptionDisplay, getPaintFeatures } from '@/utils/featureMapping';

interface FeatureDefinition {
  id: string;
  name: string;
  displayName: string;
  type: 'dropdown' | 'search' | 'text' | 'multiselect' | 'checkbox';
  options?: { value: string; label: string; price?: number }[];
  category?: string;
  subcategory?: string;
}

interface POItemsManagerProps {
  poId: number;
  poNumber: string;
  customerId: string;
}

export default function POItemsManager({ poId, poNumber, customerId }: POItemsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseOrderItem | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Enhanced form state matching OrderEntry
  const [modelId, setModelId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [showPriceOverride, setShowPriceOverride] = useState(false);
  const [notes, setNotes] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountOptions, setDiscountOptions] = useState<{value: string; label: string}[]>([]);
  const [discountCode, setDiscountCode] = useState('');
  const [discountDetails, setDiscountDetails] = useState<any>(null);

  // Form data state for simple form fields
  const [formData, setFormData] = useState({
    itemType: 'stock_model' as 'stock_model' | 'feature_item' | 'custom_model',
    itemId: '',
    itemName: '',
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    notes: ''
  });

  // Data queries
  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['/api/pos', poId, 'items'],
    queryFn: () => fetchPOItems(poId)
  });

  const { data: stockModels = [], isLoading: stockModelsLoading } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: fetchStockModels
  });

  const { data: featuresData = [], isLoading: featuresLoading } = useQuery({
    queryKey: ['/api/features'],
    queryFn: fetchFeatures
  });

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load features
        const featuresResponse = await fetchFeatures();
        console.log('🔧 PO: Loaded features:', featuresResponse.length);
        setFeatureDefs(featuresResponse as FeatureDefinition[]);
        
        // Load discount options
        await loadDiscountCodes();
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Load discount codes function
  const loadDiscountCodes = async () => {
    try {
      const [persistentDiscounts, shortTermSales] = await Promise.all([
        apiRequest('/api/persistent-discounts'),
        apiRequest('/api/short-term-sales')
      ]);

      const discountOptionsMap: Record<string, any> = {};
      const discounts = [
        { value: 'none', label: 'No Discount' },
        ...persistentDiscounts.map((discount: any) => {
          const key = `persistent_${discount.id}`;
          discountOptionsMap[key] = discount;
          return {
            value: key,
            label: `${discount.code} - ${discount.description} (${discount.discountType === 'percent' ? `${discount.discountValue}%` : `$${discount.discountValue}`})`
          };
        }),
        ...shortTermSales.map((sale: any) => {
          const key = `short_term_${sale.id}`;
          discountOptionsMap[key] = sale;
          return {
            value: key,
            label: `${sale.saleCode} - ${sale.description} (${sale.discountType === 'percent' ? `${sale.discountValue}%` : `$${sale.discountValue}`})`
          };
        })
      ];

      setDiscountOptions(discounts);
      
      // Store discount details for appliesTo logic
      if (discountCode && discountOptionsMap[discountCode]) {
        setDiscountDetails(discountOptionsMap[discountCode]);
      }
    } catch (error) {
      console.error('Failed to load discount codes:', error);
    }
  };

  // Pricing calculations - matching OrderEntry logic
  const selectedModel = stockModels.find(m => m.id === modelId);

  const basePrice = useMemo(() => {
    if (!selectedModel) return 0;
    return priceOverride !== null ? priceOverride : selectedModel.price;
  }, [selectedModel, priceOverride]);

  const featuresPrice = useMemo(() => {
    let total = 0;
    
    Object.entries(features).forEach(([featureId, value]) => {
      if (!value) return;
      
      const featureDef = featureDefs.find(f => f.id === featureId);
      if (!featureDef) return;

      if (Array.isArray(value)) {
        // Multi-select feature
        value.forEach(optionValue => {
          const option = featureDef.options?.find(opt => opt.value === optionValue);
          if (option?.price) total += option.price;
        });
      } else if (typeof value === 'string') {
        const option = featureDef.options?.find(opt => opt.value === value);
        if (option?.price) total += option.price;
      }
    });
    
    return total;
  }, [features, featureDefs]);

  const subtotalPrice = useMemo(() => {
    return (basePrice + featuresPrice) * quantity;
  }, [basePrice, featuresPrice, quantity]);

  const computedDiscountAmount = useMemo(() => {
    if (!discountDetails) return discountAmount;
    
    const discountValue = discountDetails.discountValue || 0;
    const discountType = discountDetails.discountType || 'percent';
    const appliesTo = discountDetails.appliesTo || 'total_order';
    
    if (appliesTo === 'stock_model') {
      // Apply discount only to base model price
      const discountBase = basePrice * quantity;
      return discountType === 'percent' ? 
        (discountBase * discountValue / 100) : 
        Math.min(discountValue, discountBase);
    } else {
      // Apply to entire subtotal
      return discountType === 'percent' ? 
        (subtotalPrice * discountValue / 100) : 
        Math.min(discountValue, subtotalPrice);
    }
  }, [discountDetails, basePrice, subtotalPrice, quantity, discountAmount]);



  const totalPrice = useMemo(() => {
    return Math.max(0, subtotalPrice - computedDiscountAmount);
  }, [subtotalPrice, computedDiscountAmount]);

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Handle item selection for formData
  const handleItemSelection = (itemType: string, itemId: string) => {
    if (itemType === 'stock_model') {
      const selectedModel = stockModels.find(model => model.id === itemId);
      if (selectedModel) {
        setFormData(prev => ({
          ...prev,
          itemId,
          itemName: selectedModel.displayName || selectedModel.name,
          unitPrice: selectedModel.price
        }));
        setModelId(itemId);
      }
    } else if (itemType === 'feature_item') {
      const selectedFeature = featureDefs.find(feature => feature.id === itemId);
      if (selectedFeature) {
        // Get the price from the feature (FeatureDefinitions don't have price, but we can fetch it)
        const featurePrice = (selectedFeature as any).price || 0;
        setFormData(prev => ({
          ...prev,
          itemId,
          itemName: selectedFeature.displayName,
          unitPrice: featurePrice,
          totalPrice: featurePrice * prev.quantity
        }));
      }
    } else if (itemType === 'custom_model') {
      setFormData(prev => ({
        ...prev,
        itemId,
        itemName: itemId,
        unitPrice: 0
      }));
    }
  };

  // Handle quantity change
  const handleQuantityChange = (newQuantity: number) => {
    setFormData(prev => ({
      ...prev,
      quantity: newQuantity,
      totalPrice: prev.unitPrice * newQuantity
    }));
  };

  // Handle unit price change
  const handleUnitPriceChange = (newPrice: number) => {
    setFormData(prev => ({
      ...prev,
      unitPrice: newPrice,
      totalPrice: newPrice * prev.quantity
    }));
  };

  // Reset form function
  const resetForm = () => {
    setFormData({
      itemType: 'stock_model',
      itemId: '',
      itemName: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      notes: ''
    });
    setModelId('');
    setFeatures({});
    setQuantity(1);
    setPriceOverride(null);
    setShowPriceOverride(false);
    setNotes('');
    setDiscountCode('');
    setDiscountAmount(0);
    setEditingItem(null);
  };

  // Handle form submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation based on item type
    if ((formData.itemType === 'stock_model' || formData.itemType === 'feature_item') && !formData.itemId) {
      toast({
        title: "Error",
        description: `Please select a ${formData.itemType === 'stock_model' ? 'stock model' : 'feature item'}`,
        variant: "destructive",
      });
      return;
    }

    if (!formData.itemName || formData.quantity <= 0) {
      toast({
        title: "Error", 
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const itemData: CreatePurchaseOrderItemData = {
      itemType: formData.itemType,
      itemId: formData.itemId,
      itemName: formData.itemName,
      quantity: formData.quantity,
      unitPrice: formData.unitPrice,
      totalPrice: formData.totalPrice,
      specifications: formData.itemType === 'stock_model' ? {
        features: features,
        priceOverride: priceOverride,
        discountCode: discountCode,
        discountAmount: discountAmount
      } : {},
      notes: formData.notes
    };

    if (editingItem) {
      updateItemMutation.mutate({ itemId: editingItem.id, data: itemData });
    } else {
      createItemMutation.mutate(itemData);
    }
  };

  // Mutations
  const createItemMutation = useMutation({
    mutationFn: (data: CreatePurchaseOrderItemData) => createPOItem(poId, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive"
      });
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<CreatePurchaseOrderItemData> }) => 
      updatePOItem(poId, itemId, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive"
      });
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => deletePOItem(poId, itemId),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive"
      });
    }
  });

  // Business rules and feature validation - matching OrderEntry
  useEffect(() => {
    if (modelId) {
      const selectedModel = stockModels.find(m => m.id === modelId);
      const modelName = selectedModel?.displayName || selectedModel?.name || '';
      
      // Handle Medium action length exclusion for Ferrata/Armor models
      if (features.action_length === 'medium') {
        const shouldExcludeMedium = modelName.toLowerCase().includes('ferrata') || 
                                    modelName.toLowerCase().includes('armor');
        
        if (shouldExcludeMedium) {
          setFeatures(prev => ({ 
            ...prev, 
            action_length: undefined
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
            length_of_pull: undefined
          }));
          toast({
            title: "LOP Option Removed",
            description: "Length of Pull options are not available for this model.",
            variant: "default",
          });
        }
      }
    }
  }, [modelId, stockModels, features.action_length, features.length_of_pull, toast]);

  // Conditional feature filtering for Chalk models
  const getFilteredFeatureOptions = (featureDef: FeatureDefinition) => {
    if (!selectedModel || !featureDef.options) return featureDef.options;
    
    const modelName = selectedModel.displayName || selectedModel.name || '';
    const isChalkModel = modelName.toLowerCase().includes('chalk');
    
    if (!isChalkModel) return featureDef.options;
    
    // Filter options for Chalk models
    if (featureDef.id === 'rail_accessory') {
      return featureDef.options.filter(option => 
        ['4" ARCA Rail', 'AG Pic', 'AG Pic w/Int Stud'].includes(option.value)
      );
    }
    
    if (featureDef.id === 'qd_accessory') {
      return featureDef.options.filter(option => 
        ['No QDs', 'QDs - 1 Right (Butt)', 'QDs - 1 Left (Butt)'].includes(option.value)
      );
    }
    
    return featureDef.options;
  };

  const handleSubmitModel = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!modelId) {
      toast({
        title: "Error",
        description: "Please select a stock model",
        variant: "destructive",
      });
      return;
    }

    if (quantity <= 0) {
      toast({
        title: "Error", 
        description: "Quantity must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    const selectedModel = stockModels.find(m => m.id === modelId);
    if (!selectedModel) {
      toast({
        title: "Error",
        description: "Selected model not found",
        variant: "destructive",
      });
      return;
    }

    const itemData: CreatePurchaseOrderItemData = {
      itemType: 'stock_model',
      itemId: modelId,
      itemName: selectedModel.displayName || selectedModel.name,
      quantity: quantity,
      unitPrice: basePrice + featuresPrice,
      totalPrice: totalPrice,
      specifications: {
        features: features,
        basePrice: basePrice,
        featuresPrice: featuresPrice,
        priceOverride: priceOverride,
        discountCode: discountCode,
        discountAmount: discountAmount
      },
      notes: notes
    };

    if (editingItem) {
      updateItemMutation.mutate({ itemId: editingItem.id, data: itemData });
    } else {
      createItemMutation.mutate(itemData);
    }
  };

  const handleEdit = (item: PurchaseOrderItem) => {
    setEditingItem(item);
    // Load existing item data
    if (item.specifications) {
      const specs = item.specifications as any;
      setFeatures(specs.features || {});
      setPriceOverride(specs.priceOverride);
      setShowPriceOverride(!!specs.priceOverride);
      setDiscountCode(specs.discountCode || '');
      setDiscountAmount(specs.discountAmount || 0);
    }
    setModelId(item.itemId);
    setQuantity(item.quantity);
    setNotes(item.notes || '');
    setIsDialogOpen(true);
  };

  const handleDelete = (itemId: number) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      deleteItemMutation.mutate(itemId);
    }
  };

  const totalPOValue = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">PO Items - {poNumber}</h3>
          <p className="text-sm text-gray-600">Customer: {customerId}</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="itemType">Item Type</Label>
                  <Select 
                    value={formData.itemType} 
                    onValueChange={(value) => setFormData(prev => ({...prev, itemType: value as any, itemId: '', itemName: ''}))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock_model">Pre-Defined Stock Model</SelectItem>
                      <SelectItem value="feature_item">Feature Item</SelectItem>
                      <SelectItem value="custom_model">Stock Model</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.itemType === 'stock_model' && (
                  <div>
                    <Label htmlFor="stockModel">Stock Model</Label>
                    <Select 
                      value={formData.itemId} 
                      onValueChange={(value) => handleItemSelection('stock_model', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a stock model" />
                      </SelectTrigger>
                      <SelectContent>
                        {stockModels.map(model => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName} - ${model.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.itemType === 'feature_item' && (
                  <div>
                    <Label htmlFor="feature">Feature Item</Label>
                    <Select 
                      value={formData.itemId} 
                      onValueChange={(value) => handleItemSelection('feature_item', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a feature item" />
                      </SelectTrigger>
                      <SelectContent>
                        {featureDefs.map((feature) => (
                          <SelectItem key={feature.id} value={feature.id}>
                            {feature.displayName} - ${(feature as any).price || 0}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.itemType === 'custom_model' && (
                  <div className="space-y-2">
                    <Label htmlFor="customName">Stock Model Name</Label>
                    <Input
                      id="customName"
                      value={formData.itemName}
                      onChange={(e) => setFormData(prev => ({...prev, itemName: e.target.value, itemId: e.target.value}))}
                      placeholder="Enter stock model name"
                      required
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={formData.quantity}
                      onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="unitPrice">Unit Price</Label>
                    <Input
                      id="unitPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.unitPrice}
                      onChange={(e) => handleUnitPriceChange(parseFloat(e.target.value) || 0)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="totalPrice">Total Price</Label>
                    <Input
                      id="totalPrice"
                      type="number"
                      step="0.01"
                      value={formData.totalPrice}
                      readOnly
                      className="bg-gray-50"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({...prev, notes: e.target.value}))}
                    rows={3}
                    placeholder="Optional notes about this item"
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createItemMutation.isPending || updateItemMutation.isPending}>
                    {editingItem ? 'Update' : 'Add'} Item
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {itemsLoading ? (
          <div className="text-center py-8">Loading items...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No items added yet. Click "Add Item" to get started.
          </div>
        ) : (
          <>
            {items.map((item) => (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{item.itemName}</CardTitle>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="secondary">
                          {item.itemType === 'stock_model' && <Package className="w-3 h-3 mr-1" />}
                          {item.itemType === 'feature_item' && <Settings className="w-3 h-3 mr-1" />}
                          {item.itemType === 'custom_model' && <Edit className="w-3 h-3 mr-1" />}
                          {item.itemType.replace('_', ' ').toUpperCase()}
                        </Badge>
                        {item.orderCount && item.orderCount > 0 && (
                          <Badge variant="outline">
                            {item.orderCount} orders generated
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(item)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Quantity:</span> {item.quantity}
                    </div>
                    <div>
                      <span className="font-medium">Unit Price:</span> ${item.unitPrice.toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Total:</span> ${item.totalPrice.toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Item ID:</span> {item.itemId}
                    </div>
                  </div>
                  {item.notes && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="font-medium text-sm">Notes:</span> {item.notes}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            
            <Separator />
            
            <div className="flex justify-between items-center py-4">
              <div className="text-lg font-semibold">
                Total Items: {items.reduce((sum, item) => sum + item.quantity, 0)}
              </div>
              <div className="text-lg font-semibold">
                Total Value: ${totalPOValue.toFixed(2)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
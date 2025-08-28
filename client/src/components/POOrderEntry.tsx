import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  fetchStockModels,
  fetchFeatures,
  createPOItem,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronsUpDown, Check } from 'lucide-react';
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

interface POOrderEntryProps {
  poId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function POOrderEntry({ poId, isOpen, onClose, onSuccess }: POOrderEntryProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form state matching OrderEntry
  const [modelId, setModelId] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [featureDefs, setFeatureDefs] = useState<FeatureDefinition[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [priceOverride, setPriceOverride] = useState<number | null>(null);
  const [showPriceOverride, setShowPriceOverride] = useState(false);
  const [notes, setNotes] = useState('');
  const [discountOptions, setDiscountOptions] = useState<{value: string; label: string}[]>([]);
  const [discountCode, setDiscountCode] = useState('');
  const [discountDetails, setDiscountDetails] = useState<any>(null);
  const [isFlattop, setIsFlattop] = useState(false);

  // Data queries
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
        console.log('🔧 PO Order Entry: Loaded features:', featuresResponse.length);
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

  const calculateDiscountAmount = useMemo(() => {
    if (!discountDetails) return 0;
    
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
  }, [discountDetails, basePrice, subtotalPrice, quantity]);

  const discountAmount = useMemo(() => {
    return calculateDiscountAmount;
  }, [calculateDiscountAmount]);

  const totalPrice = useMemo(() => {
    return Math.max(0, subtotalPrice - discountAmount);
  }, [subtotalPrice, discountAmount]);

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

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

  // Reset form
  const resetForm = () => {
    setModelId('');
    setModelOpen(false);
    setFeatures({});
    setQuantity(1);
    setPriceOverride(null);
    setShowPriceOverride(false);
    setNotes('');
    setDiscountCode('');
    setDiscountDetails(null);
  };

  // Create item mutation
  const createItemMutation = useMutation({
    mutationFn: (data: CreatePurchaseOrderItemData) => createPOItem(poId, data),
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
      onSuccess();
      resetForm();
      onClose();
    },
    onError: (error) => {
      console.error('Failed to create PO item:', error);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
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
        discountAmount: discountAmount,
        isFlattop: isFlattop
      },
      notes: notes
    };

    createItemMutation.mutate(itemData);
  };

  // Render feature form component
  const renderFeatureForm = (featureDef: FeatureDefinition) => {
    const filteredOptions = getFilteredFeatureOptions(featureDef);
    const currentValue = features[featureDef.id];
    
    switch (featureDef.type) {
      case 'dropdown':
        const isRestrictedForFlattop = isFlattop && ['action_length', 'action_inlet', 'bottom_metal', 'barrel_inlet'].includes(featureDef.id);
        return (
          <div key={featureDef.id} className="space-y-2">
            <Label>{featureDef.displayName}</Label>
            <Select 
              value={currentValue || ''} 
              onValueChange={(value) => setFeatures(prev => ({ 
                ...prev, 
                [featureDef.id]: value 
              }))}
              disabled={isRestrictedForFlattop}
            >
              <SelectTrigger className={isRestrictedForFlattop ? "opacity-50 cursor-not-allowed" : ""}>
                <SelectValue placeholder={isRestrictedForFlattop ? "Not Available (Flattop)" : `Select ${featureDef.displayName}`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No selection</SelectItem>
                {filteredOptions?.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      
      case 'multiselect':
        return (
          <div key={featureDef.id} className="space-y-2">
            <Label>{featureDef.displayName}</Label>
            <div className="space-y-2">
              {filteredOptions?.map(option => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${featureDef.id}-${option.value}`}
                    checked={Array.isArray(currentValue) && currentValue.includes(option.value)}
                    onCheckedChange={(checked) => {
                      setFeatures(prev => {
                        const current = Array.isArray(prev[featureDef.id]) ? prev[featureDef.id] : [];
                        if (checked) {
                          return {
                            ...prev,
                            [featureDef.id]: [...current, option.value]
                          };
                        } else {
                          return {
                            ...prev,
                            [featureDef.id]: current.filter((v: string) => v !== option.value)
                          };
                        }
                      });
                    }}
                  />
                  <Label 
                    htmlFor={`${featureDef.id}-${option.value}`}
                    className="text-sm font-normal"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'text':
        return (
          <div key={featureDef.id} className="space-y-2">
            <Label htmlFor={featureDef.id}>{featureDef.displayName}</Label>
            <Input
              id={featureDef.id}
              value={currentValue || ''}
              onChange={(e) => setFeatures(prev => ({
                ...prev,
                [featureDef.id]: e.target.value
              }))}
              placeholder={`Enter ${featureDef.displayName}`}
            />
          </div>
        );
      
      default:
        return null;
    }
  };

  if (stockModelsLoading || featuresLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            Loading...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Item to Purchase Order</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Stock Model Selection */}
          <div>
            <Label>Stock Model</Label>
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={modelOpen}
                  className="w-full justify-between"
                >
                  {modelId ? stockModels.find(m => m.id === modelId)?.displayName : "Select stock model..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search stock models..." />
                  <CommandList>
                    <CommandEmpty>No stock model found.</CommandEmpty>
                    <CommandGroup>
                      {stockModels.map((model) => (
                        <CommandItem
                          key={model.id}
                          value={model.id}
                          onSelect={(currentValue) => {
                            setModelId(currentValue === modelId ? '' : currentValue);
                            setModelOpen(false);
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              modelId === model.id ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          {model.displayName} - {formatCurrency(model.price)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
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

          {/* Chalk Model Indicator */}
          {selectedModel && (selectedModel.displayName || selectedModel.name || '').toLowerCase().includes('chalk') && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                  Chalk Model - Limited Options
                </Badge>
              </div>
            </div>
          )}

          {/* Features Configuration */}
          {modelId && featureDefs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Product Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {featureDefs.map(renderFeatureForm)}
              </div>
            </div>
          )}

          {/* Quantity and Pricing */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div>
              <Label htmlFor="priceOverride">Price Override</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showPriceOverride"
                  checked={showPriceOverride}
                  onCheckedChange={(checked) => setShowPriceOverride(checked === true)}
                />
                <Label htmlFor="showPriceOverride" className="text-sm">
                  Override price
                </Label>
              </div>
              {showPriceOverride && (
                <Input
                  id="priceOverride"
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceOverride || ''}
                  onChange={(e) => setPriceOverride(e.target.value ? parseFloat(e.target.value) : null)}
                  placeholder="Enter override price"
                  className="mt-2"
                />
              )}
            </div>

            <div>
              <Label htmlFor="discount">Discount</Label>
              <Select value={discountCode} onValueChange={setDiscountCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select discount" />
                </SelectTrigger>
                <SelectContent>
                  {discountOptions.map(discount => (
                    <SelectItem key={discount.value} value={discount.value}>
                      {discount.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional notes about this item"
            />
          </div>

          {/* Pricing Summary */}
          {modelId && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Pricing Summary</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Base Price:</span>
                  <span>{formatCurrency(basePrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Features Price:</span>
                  <span>{formatCurrency(featuresPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal (×{quantity}):</span>
                  <span>{formatCurrency(subtotalPrice)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount:</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total Price:</span>
                  <span>{formatCurrency(totalPrice)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createItemMutation.isPending}>
              Add Item
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, ArrowRight, Edit2, ChevronDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';

interface AdditionalStock {
  id: number;
  orderDraftId: number;
  stockNumber: number;
  modelId: string | null;
  handedness: string | null;
  shankLength: string | null;
  features: Record<string, any> | null;
  featureQuantities: Record<string, Record<string, number>> | null;
  tikkaOption: string | null;
  isCustomOrder: string | null;
  priceOverride: number | null;
  currentDepartment: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
}

interface FeatureDefinition {
  id: string;
  name: string;
  type: 'dropdown' | 'combobox' | 'multiselect' | 'checkbox' | 'text' | 'number' | 'textarea';
  options?: { value: string; label: string; price?: number }[];
  placeholder?: string;
}

const additionalStockSchema = z.object({
  modelId: z.string().min(1, "Stock model is required"),
  handedness: z.string().optional(),
  shankLength: z.string().optional(),
  tikkaOption: z.string().optional(),
  features: z.record(z.any()).optional(),
  featureQuantities: z.record(z.record(z.number())).optional(),
  isCustomOrder: z.string().optional(),
  priceOverride: z.number().optional().nullable(),
});

type AdditionalStockFormData = z.infer<typeof additionalStockSchema>;

const departments = ['Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping'];

export default function AdditionalStocksManager({ orderId }: { orderId: string }) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<AdditionalStock | null>(null);
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [featureQuantities, setFeatureQuantities] = useState<Record<string, Record<string, number>>>({});
  const [isCustomOrder, setIsCustomOrder] = useState('');
  const queryClient = useQueryClient();

  const { data: additionalStocks = [], isLoading } = useQuery<AdditionalStock[]>({
    queryKey: ['/api/orders', orderId, 'additional-stocks'],
    enabled: !!orderId,
  });

  const { data: stockModels = [] } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
  });

  const { data: featureDefs = [] } = useQuery<FeatureDefinition[]>({
    queryKey: ['/api/features'],
  });

  const addStockMutation = useMutation({
    mutationFn: (data: AdditionalStockFormData) =>
      apiRequest(`/api/orders/${orderId}/additional-stocks`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'additional-stocks'] });
      setIsAddDialogOpen(false);
    },
  });

  const updateStockMutation = useMutation({
    mutationFn: ({ stockId, data }: { stockId: number; data: Partial<AdditionalStockFormData> }) =>
      apiRequest(`/api/additional-stocks/${stockId}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'additional-stocks'] });
      setEditingStock(null);
    },
  });

  const deleteStockMutation = useMutation({
    mutationFn: (stockId: number) =>
      apiRequest(`/api/additional-stocks/${stockId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'additional-stocks'] });
    },
  });

  const progressStockMutation = useMutation({
    mutationFn: ({ stockId, nextDepartment }: { stockId: number; nextDepartment?: string }) =>
      apiRequest(`/api/additional-stocks/${stockId}/progress`, {
        method: 'POST',
        body: { nextDepartment },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders', orderId, 'additional-stocks'] });
    },
  });

  const form = useForm<AdditionalStockFormData>({
    resolver: zodResolver(additionalStockSchema),
    defaultValues: {
      modelId: '',
      handedness: '',
      shankLength: '',
      tikkaOption: '',
      features: {},
      featureQuantities: {},
      isCustomOrder: '',
      priceOverride: null,
    },
  });

  const editForm = useForm<AdditionalStockFormData>({
    resolver: zodResolver(additionalStockSchema.partial()),
  });

  const onSubmit = (data: AdditionalStockFormData) => {
    const submitData = {
      ...data,
      features,
      featureQuantities,
      isCustomOrder,
    };
    addStockMutation.mutate(submitData);
  };

  const onEdit = (data: AdditionalStockFormData) => {
    if (editingStock) {
      const submitData = {
        ...data,
        features,
        featureQuantities,
        isCustomOrder,
      };
      updateStockMutation.mutate({ stockId: editingStock.id, data: submitData });
    }
  };

  const handleEdit = (stock: AdditionalStock) => {
    setEditingStock(stock);
    setFeatures(stock.features || {});
    setFeatureQuantities(stock.featureQuantities || {});
    setIsCustomOrder(stock.isCustomOrder || '');
    editForm.reset({
      modelId: stock.modelId || '',
      handedness: stock.handedness || '',
      shankLength: stock.shankLength || '',
      tikkaOption: stock.tikkaOption || '',
      priceOverride: stock.priceOverride || null,
    });
  };

  const handleProgress = (stock: AdditionalStock) => {
    const currentIndex = departments.indexOf(stock.currentDepartment);
    const nextDepartment = departments[currentIndex + 1];
    
    if (nextDepartment) {
      progressStockMutation.mutate({ stockId: stock.id, nextDepartment });
    }
  };

  const getStatusBadge = (department: string) => {
    const colors: Record<string, string> = {
      'Layup': 'bg-blue-500',
      'Plugging': 'bg-purple-500',
      'CNC': 'bg-yellow-500',
      'Finish': 'bg-orange-500',
      'Gunsmith': 'bg-red-500',
      'Paint': 'bg-green-500',
      'QC': 'bg-indigo-500',
      'Shipping': 'bg-gray-500'
    };
    return (
      <Badge className={`${colors[department] || 'bg-gray-500'} text-white`}>
        {department}
      </Badge>
    );
  };

  // Reset form state when dialog closes
  useEffect(() => {
    if (!isAddDialogOpen) {
      setFeatures({});
      setFeatureQuantities({});
      setIsCustomOrder('');
      form.reset();
    }
  }, [isAddDialogOpen, form]);

  useEffect(() => {
    if (!editingStock) {
      setFeatures({});
      setFeatureQuantities({});
      setIsCustomOrder('');
      editForm.reset();
    }
  }, [editingStock, editForm]);

  if (isLoading) {
    return <div>Loading additional stocks...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Additional Stocks ({additionalStocks.length})
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Stock
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Additional Stock</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Stock Model */}
                    <FormField
                      control={form.control}
                      name="modelId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Stock Model</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select stock model" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {stockModels.map((model) => (
                                <SelectItem key={model.id} value={model.id}>
                                  {model.displayName} (${model.price})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Handedness */}
                    <FormField
                      control={form.control}
                      name="handedness"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Handedness</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select handedness" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="right">Right</SelectItem>
                              <SelectItem value="left">Left</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Tikka Lug Options */}
                    <div className="space-y-2">
                      <Label>Tikka Lug Options</Label>
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="tikka-set"
                            name="tikka-option"
                            value="set"
                            checked={form.watch('tikkaOption') === 'set'}
                            onChange={(e) => form.setValue('tikkaOption', e.target.value)}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor="tikka-set">Set</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="tikka-loose"
                            name="tikka-option"
                            value="loose"
                            checked={form.watch('tikkaOption') === 'loose'}
                            onChange={(e) => form.setValue('tikkaOption', e.target.value)}
                            className="rounded border-gray-300"
                          />
                          <Label htmlFor="tikka-loose">Loose</Label>
                        </div>
                      </div>
                    </div>

                    {/* Custom Order Checkbox */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="custom-order"
                          checked={isCustomOrder === 'yes'}
                          onChange={(e) => setIsCustomOrder(e.target.checked ? 'yes' : '')}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor="custom-order">Custom Order</Label>
                      </div>
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
                                        <span className="text-blue-600 font-medium ml-2">
                                          (+${option.price})
                                        </span>
                                      )}
                                    </label>
                                  </div>
                                  {isChecked && (
                                    <div className="flex items-center space-x-2 ml-6">
                                      <Label htmlFor={`${featureDef.id}-${option.value}-qty`} className="text-xs text-gray-600">
                                        Qty:
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
                                        className="w-16 text-sm"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Conditional Shank Length Field */}
                    {features.action === 'bartlein_#3b' && (
                      <FormField
                        control={form.control}
                        name="shankLength"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shank Length</FormLabel>
                            <FormControl>
                              <Input
                                type="text"
                                placeholder="Enter shank length..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Price Override */}
                    <FormField
                      control={form.control}
                      name="priceOverride"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price Override (optional)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Enter custom price"
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addStockMutation.isPending}>
                      {addStockMutation.isPending ? 'Adding...' : 'Add Stock'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {additionalStocks.length === 0 ? (
          <p className="text-gray-500 text-center py-4">
            No additional stocks added. Click "Add Stock" to add more stocks to this order.
          </p>
        ) : (
          <div className="space-y-4">
            {additionalStocks.map((stock: AdditionalStock, index: number) => (
              <div key={stock.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">Stock #{stock.stockNumber}</Badge>
                    {getStatusBadge(stock.currentDepartment)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(stock)}
                      className="gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </Button>
                    {stock.currentDepartment !== 'Shipping' && (
                      <Button
                        size="sm"
                        onClick={() => handleProgress(stock)}
                        disabled={progressStockMutation.isPending}
                        className="gap-1"
                      >
                        <ArrowRight className="w-3 h-3" />
                        Progress
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteStockMutation.mutate(stock.id)}
                      disabled={deleteStockMutation.isPending}
                      className="gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Model:</span> {stock.modelId || 'Not specified'}
                  </div>
                  <div>
                    <span className="font-medium">Handedness:</span> {stock.handedness || 'Not specified'}
                  </div>
                  {stock.priceOverride && (
                    <div>
                      <span className="font-medium">Custom Price:</span> ${stock.priceOverride.toFixed(2)}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Status:</span> {stock.status}
                  </div>
                </div>

                {index < additionalStocks.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingStock} onOpenChange={() => setEditingStock(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Stock #{editingStock?.stockNumber}</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Stock Model */}
                  <FormField
                    control={editForm.control}
                    name="modelId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock Model</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select stock model" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stockModels.map((model) => (
                              <SelectItem key={model.id} value={model.id}>
                                {model.displayName} (${model.price})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Handedness */}
                  <FormField
                    control={editForm.control}
                    name="handedness"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Handedness</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select handedness" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="right">Right</SelectItem>
                            <SelectItem value="left">Left</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Tikka Lug Options */}
                  <div className="space-y-2">
                    <Label>Tikka Lug Options</Label>
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="edit-tikka-set"
                          name="edit-tikka-option"
                          value="set"
                          checked={editForm.watch('tikkaOption') === 'set'}
                          onChange={(e) => editForm.setValue('tikkaOption', e.target.value)}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor="edit-tikka-set">Set</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="edit-tikka-loose"
                          name="edit-tikka-option"
                          value="loose"
                          checked={editForm.watch('tikkaOption') === 'loose'}
                          onChange={(e) => editForm.setValue('tikkaOption', e.target.value)}
                          className="rounded border-gray-300"
                        />
                        <Label htmlFor="edit-tikka-loose">Loose</Label>
                      </div>
                    </div>
                  </div>

                  {/* Custom Order Checkbox */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="edit-custom-order"
                        checked={isCustomOrder === 'yes'}
                        onChange={(e) => setIsCustomOrder(e.target.checked ? 'yes' : '')}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="edit-custom-order">Custom Order</Label>
                    </div>
                  </div>

                  {/* Dynamic Feature Inputs - Same as Add dialog */}
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
                      {/* Other feature types would be duplicated here like in the add dialog */}
                    </div>
                  ))}

                  {/* Price Override */}
                  <FormField
                    control={editForm.control}
                    name="priceOverride"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price Override (optional)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Enter custom price"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" onClick={() => setEditingStock(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateStockMutation.isPending}>
                    {updateStockMutation.isPending ? 'Updating...' : 'Update Stock'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
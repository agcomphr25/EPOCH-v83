import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, ArrowRight, Edit2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import ProductConfigurationForm from '@/components/ProductConfigurationForm';

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

const additionalStockSchema = z.object({
  priceOverride: z.number().optional().nullable(),
});

type AdditionalStockFormData = z.infer<typeof additionalStockSchema>;

const departments = ['Layup', 'Plugging', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'QC', 'Shipping'];

export default function AdditionalStocksManager({ orderId }: { orderId: string }) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<AdditionalStock | null>(null);
  
  // Form state for new stocks
  const [modelId, setModelId] = useState('');
  const [handedness, setHandedness] = useState('');
  const [tikkaOption, setTikkaOption] = useState('');
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [featureQuantities, setFeatureQuantities] = useState<Record<string, Record<string, number>>>({});
  const [shankLength, setShankLength] = useState('');
  const [isCustomOrder, setIsCustomOrder] = useState('');
  
  // Form state for editing stocks
  const [editModelId, setEditModelId] = useState('');
  const [editHandedness, setEditHandedness] = useState('');
  const [editTikkaOption, setEditTikkaOption] = useState('');
  const [editFeatures, setEditFeatures] = useState<Record<string, any>>({});
  const [editFeatureQuantities, setEditFeatureQuantities] = useState<Record<string, Record<string, number>>>({});
  const [editShankLength, setEditShankLength] = useState('');
  const [editIsCustomOrder, setEditIsCustomOrder] = useState('');
  
  const queryClient = useQueryClient();

  const { data: additionalStocks = [], isLoading } = useQuery<AdditionalStock[]>({
    queryKey: ['/api/orders', orderId, 'additional-stocks'],
    enabled: !!orderId,
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
      priceOverride: null,
    },
  });

  const editForm = useForm<AdditionalStockFormData>({
    resolver: zodResolver(additionalStockSchema.partial()),
  });

  const onSubmit = (data: AdditionalStockFormData) => {
    const submitData = {
      modelId,
      handedness,
      tikkaOption,
      features,
      featureQuantities,
      shankLength,
      isCustomOrder,
      priceOverride: data.priceOverride,
    };
    addStockMutation.mutate(submitData);
  };

  const onEdit = (data: AdditionalStockFormData) => {
    if (editingStock) {
      const submitData = {
        modelId: editModelId,
        handedness: editHandedness,
        tikkaOption: editTikkaOption,
        features: editFeatures,
        featureQuantities: editFeatureQuantities,
        shankLength: editShankLength,
        isCustomOrder: editIsCustomOrder,
        priceOverride: data.priceOverride,
      };
      updateStockMutation.mutate({ stockId: editingStock.id, data: submitData });
    }
  };

  const handleEdit = (stock: AdditionalStock) => {
    setEditingStock(stock);
    setEditModelId(stock.modelId || '');
    setEditHandedness(stock.handedness || '');
    setEditTikkaOption(stock.tikkaOption || '');
    setEditFeatures(stock.features || {});
    setEditFeatureQuantities(stock.featureQuantities || {});
    setEditShankLength(stock.shankLength || '');
    setEditIsCustomOrder(stock.isCustomOrder || '');
    editForm.reset({
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
      setModelId('');
      setHandedness('');
      setTikkaOption('');
      setFeatures({});
      setFeatureQuantities({});
      setShankLength('');
      setIsCustomOrder('');
      form.reset();
    }
  }, [isAddDialogOpen, form]);

  useEffect(() => {
    if (!editingStock) {
      setEditModelId('');
      setEditHandedness('');
      setEditTikkaOption('');
      setEditFeatures({});
      setEditFeatureQuantities({});
      setEditShankLength('');
      setEditIsCustomOrder('');
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
                  <ProductConfigurationForm
                    modelId={modelId}
                    setModelId={setModelId}
                    handedness={handedness}
                    setHandedness={setHandedness}
                    tikkaOption={tikkaOption}
                    setTikkaOption={setTikkaOption}
                    features={features}
                    setFeatures={setFeatures}
                    featureQuantities={featureQuantities}
                    setFeatureQuantities={setFeatureQuantities}
                    shankLength={shankLength}
                    setShankLength={setShankLength}
                    isCustomOrder={isCustomOrder}
                    setIsCustomOrder={setIsCustomOrder}
                  />

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
                <ProductConfigurationForm
                  modelId={editModelId}
                  setModelId={setEditModelId}
                  handedness={editHandedness}
                  setHandedness={setEditHandedness}
                  tikkaOption={editTikkaOption}
                  setTikkaOption={setEditTikkaOption}
                  features={editFeatures}
                  setFeatures={setEditFeatures}
                  featureQuantities={editFeatureQuantities}
                  setFeatureQuantities={setEditFeatureQuantities}
                  shankLength={editShankLength}
                  setShankLength={setEditShankLength}
                  isCustomOrder={editIsCustomOrder}
                  setIsCustomOrder={setEditIsCustomOrder}
                />

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
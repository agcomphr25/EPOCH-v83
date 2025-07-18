import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  fetchPOItems, 
  createPOItem, 
  updatePOItem, 
  deletePOItem, 
  generateOrdersFromPO,
  fetchStockModels,
  fetchFeatures,
  type PurchaseOrderItem, 
  type CreatePurchaseOrderItemData,
  type StockModel,
  type Feature
} from '@/lib/poUtils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Edit, Trash2, Package, Settings, ShoppingCart } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface POItemsManagerProps {
  poId: number;
  poNumber: string;
  customerId: string;
}

export default function POItemsManager({ poId, poNumber, customerId }: POItemsManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseOrderItem | null>(null);
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    itemType: 'stock_model' as 'stock_model' | 'custom_model' | 'feature_item',
    itemId: '',
    itemName: '',
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    specifications: {},
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

  const { data: features = [], isLoading: featuresLoading } = useQuery({
    queryKey: ['/api/features'],
    queryFn: fetchFeatures
  });

  // Mutations
  const createItemMutation = useMutation({
    mutationFn: (data: CreatePurchaseOrderItemData) => createPOItem(poId, data),
    onSuccess: () => {
      toast.success('Item added successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error('Failed to add item');
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<CreatePurchaseOrderItemData> }) => 
      updatePOItem(poId, itemId, data),
    onSuccess: () => {
      toast.success('Item updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error('Failed to update item');
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => deletePOItem(poId, itemId),
    onSuccess: () => {
      toast.success('Item deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
    },
    onError: () => {
      toast.error('Failed to delete item');
    }
  });

  const generateOrdersMutation = useMutation({
    mutationFn: () => generateOrdersFromPO(poId),
    onSuccess: (data) => {
      toast.success(`Generated ${data.orders?.length || 0} orders successfully`);
      queryClient.invalidateQueries({ queryKey: ['/api/pos', poId, 'items'] });
    },
    onError: () => {
      toast.error('Failed to generate orders');
    }
  });

  const resetForm = () => {
    setFormData({
      itemType: 'stock_model',
      itemId: '',
      itemName: '',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      specifications: {},
      notes: ''
    });
    setEditingItem(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.itemId || !formData.itemName || formData.quantity <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    const data: CreatePurchaseOrderItemData = {
      itemType: formData.itemType,
      itemId: formData.itemId,
      itemName: formData.itemName,
      quantity: formData.quantity,
      unitPrice: formData.unitPrice,
      totalPrice: formData.quantity * formData.unitPrice,
      specifications: formData.itemType === 'custom_model' ? formData.specifications : undefined,
      notes: formData.notes || undefined
    };

    if (editingItem) {
      updateItemMutation.mutate({ itemId: editingItem.id, data });
    } else {
      createItemMutation.mutate(data);
    }
  };

  const handleEdit = (item: PurchaseOrderItem) => {
    setEditingItem(item);
    setFormData({
      itemType: item.itemType,
      itemId: item.itemId,
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      specifications: item.specifications || {},
      notes: item.notes || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (itemId: number) => {
    if (window.confirm('Are you sure you want to delete this item?')) {
      deleteItemMutation.mutate(itemId);
    }
  };

  const handleItemSelection = (itemType: string, itemId: string) => {
    let selectedItem = null;
    let price = 0;

    if (itemType === 'stock_model') {
      selectedItem = stockModels.find(model => model.id === itemId);
      price = selectedItem?.price || 0;
    } else if (itemType === 'feature_item') {
      selectedItem = features.find(feature => feature.id === itemId);
      price = selectedItem?.price || 0;
    }

    if (selectedItem) {
      setFormData(prev => ({
        ...prev,
        itemType: itemType as 'stock_model' | 'custom_model' | 'feature_item',
        itemId: itemId,
        itemName: selectedItem.displayName || selectedItem.name,
        unitPrice: price,
        totalPrice: prev.quantity * price
      }));
    }
  };

  const handleQuantityChange = (quantity: number) => {
    setFormData(prev => ({
      ...prev,
      quantity,
      totalPrice: quantity * prev.unitPrice
    }));
  };

  const handleUnitPriceChange = (unitPrice: number) => {
    setFormData(prev => ({
      ...prev,
      unitPrice,
      totalPrice: prev.quantity * unitPrice
    }));
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
          <Button
            variant="outline"
            onClick={() => generateOrdersMutation.mutate()}
            disabled={generateOrdersMutation.isPending || items.length === 0}
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            Generate Orders
          </Button>
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
              <form onSubmit={handleSubmit} className="space-y-4">
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
                      <SelectItem value="stock_model">Stock Model</SelectItem>
                      <SelectItem value="feature_item">Feature Item</SelectItem>
                      <SelectItem value="custom_model">Custom Model</SelectItem>
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
                        {features.map(feature => (
                          <SelectItem key={feature.id} value={feature.id}>
                            {feature.displayName} - ${feature.price}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.itemType === 'custom_model' && (
                  <div className="space-y-2">
                    <Label htmlFor="customName">Custom Model Name</Label>
                    <Input
                      id="customName"
                      value={formData.itemName}
                      onChange={(e) => setFormData(prev => ({...prev, itemName: e.target.value, itemId: e.target.value}))}
                      placeholder="Enter custom model name"
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
                        {item.orderCount > 0 && (
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
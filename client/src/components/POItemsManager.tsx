import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, Trash2, Edit2, Eye, Barcode, Save, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { AveryLabelPrint } from '@/components/AveryLabelPrint';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  isActive: boolean;
}

interface POItem {
  id: number;
  poId: number;
  itemType: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specifications?: any;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface POProduct {
  id: number;
  customerName: string;
  productName: string;
  productType: string;
  material: string;
  handedness: string;
  stockModel: string;
  actionLength: string;
  actionInlet: string;
  bottomMetal: string;
  barrelInlet: string;
  qds: string;
  swivelStuds: string;
  paintOptions: string;
  texture: string;
  flatTop: boolean;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface POItemsManagerProps {
  poId: number;
  poNumber?: string;
  customerName: string;
  onAddItem: () => void;
}

// Helper to format specification labels
const specificationLabels: Record<string, string> = {
  stockModel: 'Stock Model',
  material: 'Material',
  handedness: 'Handedness',
  actionLength: 'Action Length',
  actionInlet: 'Action Inlet',
  bottomMetal: 'Bottom Metal',
  barrelInlet: 'Barrel Inlet',
  qds: 'QDS',
  swivelStuds: 'Swivel Studs',
  paintOptions: 'Paint Options',
  texture: 'Texture',
  flatTop: 'Flat Top',
};

// Helper to format specification values for display
const formatSpecValue = (key: string, value: any): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return String(value);
};

export default function POItemsManager({
  poId,
  poNumber,
  customerName,
  onAddItem,
}: POItemsManagerProps) {
  const [selectedItem, setSelectedItem] = useState<POItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<POItem | null>(null);
  const [editForm, setEditForm] = useState({ itemName: '', quantity: 1, unitPrice: 0, notes: '', stockModelId: '' });
  const [barcodeItemId, setBarcodeItemId] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch PO items
  const {
    data: poItems = [],
    isLoading,
    error,
  } = useQuery<POItem[]>({
    queryKey: [`/api/pos/${poId}/items`],
    queryFn: async () => {
      const result = await apiRequest(`/api/pos/${poId}/items`);
      return result;
    },
  });

  // Fetch PO Products for product type lookup
  const { data: poProducts = [] } = useQuery<POProduct[]>({
    queryKey: ['/api/po-products'],
    queryFn: async () => {
      const result = await apiRequest('/api/po-products');
      return result;
    },
    enabled: poItems.some((item) => item.itemType === 'custom_model'),
  });

  // Fetch stock models for the stock model dropdown in edit dialog
  const { data: stockModels = [] } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    queryFn: async () => {
      const result = await apiRequest('/api/stock-models');
      return result;
    },
    enabled: isEditDialogOpen,
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (itemId: number) => {
      await apiRequest(`/api/pos/${poId}/items/${itemId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/pos/${poId}/items`] });
      toast({
        title: 'Item Deleted',
        description: 'Purchase order item has been removed successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete item',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ itemId, data, stockModelId }: { itemId: number; data: POItemUpdatePayload; stockModelId?: string }) => {
      const result = await apiRequest(`/api/pos/${poId}/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      if (stockModelId) {
        await apiRequest(`/api/pos/${poId}/items/${itemId}/stock-model`, {
          method: 'PATCH',
          body: JSON.stringify({ stockModelId }),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/pos/${poId}/items`] });
      setIsEditDialogOpen(false);
      setEditItem(null);
      toast({
        title: 'Item Updated',
        description: 'Purchase order item has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update item',
        variant: 'destructive',
      });
    },
  });

  const handleViewItem = (item: POItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleEditItem = (item: POItem) => {
    setEditItem(item);
    const currentStockModelId = item.specifications?.stockModel || item.specifications?.stockModelId || '';
    setEditForm({
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes || '',
      stockModelId: currentStockModelId,
    });
    setIsEditDialogOpen(true);
  };

  interface POItemUpdatePayload {
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    notes: string | null;
  }

  const handleSaveEdit = () => {
    if (!editItem) return;
    const totalPrice = editForm.quantity * editForm.unitPrice;

    const updateData: POItemUpdatePayload = {
      itemName: editForm.itemName,
      quantity: editForm.quantity,
      unitPrice: editForm.unitPrice,
      totalPrice,
      notes: editForm.notes || null,
    };

    const stockModelId =
      editForm.stockModelId && editForm.stockModelId !== (editItem.specifications as Record<string, unknown>)?.stockModel
        ? editForm.stockModelId
        : undefined;

    updateMutation.mutate({
      itemId: editItem.id,
      data: updateData,
      stockModelId,
    });
  };

  const handleDeleteItem = async (itemId: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(itemId);
    }
  };

  const handlePrintBarcode = (item: POItem) => {
    // Generate a unique barcode ID for this PO item
    const barcodeId = `PO-${poNumber || poId}-ITEM-${item.id}`;
    setBarcodeItemId(barcodeId);
    
    toast({
      title: 'Generating Barcode',
      description: 'Preparing barcode label for printing...',
    });
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedItem(null);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getTotalValue = () => {
    return poItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
  };

  const getProductTypeForItem = (item: POItem) => {
    if (item.itemType === 'custom_model') {
      const poProduct = poProducts.find(
        (product) => product.id.toString() === item.itemId
      );
      return poProduct?.productType || item.itemType;
    }
    return item.itemType;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <Package className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">Loading purchase order items...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <Package className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Error Loading Items
            </h3>
            <p className="text-red-600 mb-4">
              Failed to load purchase order items.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Purchase Order Items</h2>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline">
            {poItems.length} Item{poItems.length !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary">
            Total: {formatPrice(getTotalValue())}
          </Badge>
          <Button onClick={onAddItem} className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {poItems.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No Items Added
              </h3>
              <p className="text-gray-500">
                This purchase order doesn't have any items yet. Use the "Add
                Item" button above to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {poItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:shadow-sm transition-shadow"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium text-gray-900">
                        {item.itemName}
                      </h3>
                      <Badge variant="outline" className="text-xs">
                        {getProductTypeForItem(item)}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <span>Qty: {item.quantity}</span>
                      <span className="mx-2">•</span>
                      <span>Unit Price: {formatPrice(item.unitPrice)}</span>
                      <span className="mx-2">•</span>
                      <span className="font-medium">
                        Total: {formatPrice(item.totalPrice)}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="mt-1 text-xs text-gray-500">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePrintBarcode(item)}
                      className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
                      data-testid={`button-print-barcode-${item.id}`}
                    >
                      <Barcode className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewItem(item)}
                      className="h-8 w-8 p-0"
                      data-testid={`button-view-item-${item.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditItem(item)}
                      className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                      data-testid={`button-edit-item-${item.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-item-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Item Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
          </DialogHeader>

          {selectedItem && (
            <ScrollArea className="flex-1 max-h-[65vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Item Name
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedItem.itemName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Product Type
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {getProductTypeForItem(selectedItem)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Quantity
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedItem.quantity}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Unit Price
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {formatPrice(selectedItem.unitPrice)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Total Price
                    </label>
                    <p className="mt-1 text-sm text-gray-900 font-medium">
                      {formatPrice(selectedItem.totalPrice)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Item ID
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedItem.itemId}
                    </p>
                  </div>
                </div>

                {selectedItem.specifications && Object.keys(selectedItem.specifications).length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Specifications
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {Object.entries(selectedItem.specifications)
                        .filter(([_, value]) => value !== null && value !== undefined && value !== '')
                        .map(([key, value]) => (
                          <div key={key} className="bg-gray-50 rounded-lg p-3 border">
                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                              {specificationLabels[key] || key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <div className="text-sm font-medium text-gray-900 mt-1">
                              {formatSpecValue(key, value)}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {selectedItem.notes && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Notes
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {selectedItem.notes}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleCloseDialog();
                      handleEditItem(selectedItem);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button onClick={handleCloseDialog}>Close</Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => { if (!open) { setIsEditDialogOpen(false); setEditItem(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-amber-600" />
              Edit Item
            </DialogTitle>
          </DialogHeader>

          {editItem && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-item-name">Item Name</Label>
                <Input
                  id="edit-item-name"
                  value={editForm.itemName}
                  onChange={(e) => setEditForm({ ...editForm, itemName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-stock-model">Stock Model</Label>
                <Select
                  value={editForm.stockModelId}
                  onValueChange={(value) => setEditForm({ ...editForm, stockModelId: value })}
                >
                  <SelectTrigger className="mt-1" id="edit-stock-model">
                    <SelectValue placeholder="Select stock model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stockModels.filter((sm) => sm.isActive).map((sm) => (
                      <SelectItem key={sm.id} value={sm.id}>
                        {sm.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Updates the stock model ID, name, and specifications snapshot together.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-quantity">Quantity</Label>
                  <Input
                    id="edit-quantity"
                    type="number"
                    min={1}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-unit-price">Unit Price ($)</Label>
                  <Input
                    id="edit-unit-price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={editForm.unitPrice}
                    onChange={(e) => setEditForm({ ...editForm, unitPrice: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border">
                <div className="text-sm text-gray-500">Calculated Total</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrice(editForm.quantity * editForm.unitPrice)}
                </div>
              </div>
              <div>
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setIsEditDialogOpen(false); setEditItem(null); }}
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={updateMutation.isPending || !editForm.itemName.trim()}
                  className="flex items-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Hidden Barcode Label Printer */}
      {barcodeItemId && (() => {
        const itemToPrint = poItems.find(item => `PO-${poNumber || poId}-ITEM-${item.id}` === barcodeItemId);
        if (!itemToPrint) return null;

        const specs = itemToPrint.specifications || {};
        const stockModel = poProducts.find(p => p.id.toString() === itemToPrint.itemId)?.stockModel || specs.stockModel || 'Stock Item';

        return (
          <div style={{ position: 'absolute', left: '-9999px' }}>
            <AveryLabelPrint
              barcode={barcodeItemId}
              orderId={`PO ${poNumber || poId}`}
              customerName={customerName}
              stockModel={stockModel}
              actionLength={specs.actionLength || specs.action_length}
              features={specs}
              labelType="detailed"
              copies={6}
            />
          </div>
        );
      })()}
    </div>
  );
}

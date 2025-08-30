import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, Plus, Trash2, Edit2, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

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

interface POItemsManagerProps {
  poId: number;
  customerName: string;
  onAddItem: () => void;
}

export default function POItemsManager({ poId, customerName, onAddItem }: POItemsManagerProps) {
  const [selectedItem, setSelectedItem] = useState<POItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch PO items
  const { data: poItems = [], isLoading, error } = useQuery<POItem[]>({
    queryKey: [`/api/pos/${poId}/items`],
    queryFn: async () => {
      const result = await apiRequest(`/api/pos/${poId}/items`);
      return result;
    },
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
        title: "Item Deleted",
        description: "Purchase order item has been removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete item",
        variant: "destructive",
      });
    }
  });

  const handleViewItem = (item: POItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  const handleDeleteItem = async (itemId: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(itemId);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setSelectedItem(null);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  const getTotalValue = () => {
    return poItems.reduce((sum, item) => sum + item.totalPrice, 0);
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Items</h3>
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Items Added</h3>
              <p className="text-gray-500">
                This purchase order doesn't have any items yet. Use the "Add Item" button above to get started.
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
                      <h3 className="font-medium text-gray-900">{item.itemName}</h3>
                      <Badge variant="outline" className="text-xs">
                        {item.itemType}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      <span>Qty: {item.quantity}</span>
                      <span className="mx-2">•</span>
                      <span>Unit Price: {formatPrice(item.unitPrice)}</span>
                      <span className="mx-2">•</span>
                      <span className="font-medium">Total: {formatPrice(item.totalPrice)}</span>
                    </div>
                    {item.notes && (
                      <p className="mt-1 text-xs text-gray-500">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleViewItem(item)}
                      className="h-8 w-8 p-0"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteItem(item.id)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      disabled={deleteMutation.isPending}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Item Details</DialogTitle>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Item Name</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedItem.itemName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Item Type</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedItem.itemType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Quantity</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedItem.quantity}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Unit Price</label>
                  <p className="mt-1 text-sm text-gray-900">{formatPrice(selectedItem.unitPrice)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Total Price</label>
                  <p className="mt-1 text-sm text-gray-900 font-medium">{formatPrice(selectedItem.totalPrice)}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Item ID</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedItem.itemId}</p>
                </div>
              </div>

              {selectedItem.specifications && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Specifications</label>
                  <div className="mt-1 p-3 bg-gray-50 rounded border">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(selectedItem.specifications, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {selectedItem.notes && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Notes</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedItem.notes}</p>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleCloseDialog}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
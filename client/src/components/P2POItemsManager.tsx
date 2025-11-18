import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Plus, Pencil, Trash2, Package } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface P2POItemsManagerProps {
  poId: number;
  poNumber: string;
  onBack: () => void;
}

interface P2POItem {
  id: number;
  poId: number;
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specifications?: string;
  notes?: string;
}

export function P2POItemsManager({
  poId,
  poNumber,
  onBack,
}: P2POItemsManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<P2POItem | null>(null);
  const [formData, setFormData] = useState({
    partNumber: '',
    partName: '',
    quantity: 1,
    unitPrice: 0,
    specifications: '',
    notes: '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch P2 PO items for this specific PO
  const { data: items = [], isLoading } = useQuery<P2POItem[]>({
    queryKey: ['/api/p2/purchase-orders', poId, 'items'],
    queryFn: () => apiRequest(`/api/p2/purchase-orders/${poId}/items`),
  });

  // Fetch inventory items for autocomplete
  const { data: inventoryItems = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ['/api/inventory/items'],
    select: (data: any[]) =>
      data
        .map((item) => ({
          id: item.id,
          agPartNumber: item.agPartNumber,
          name: item.name,
          sku: item.sku,
        }))
        .filter((item) => item.agPartNumber), // Only items with part numbers
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items`, {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/purchase-orders', poId, 'items'],
      });
      toast({
        title: 'Success',
        description: 'Item added successfully',
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add item',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      itemId,
      data,
    }: {
      itemId: number;
      data: typeof formData;
    }) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/purchase-orders', poId, 'items'],
      });
      toast({
        title: 'Success',
        description: 'Item updated successfully',
      });
      setDialogOpen(false);
      setEditingItem(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update item',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) =>
      apiRequest(`/api/p2/purchase-orders/${poId}/items/${itemId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2/purchase-orders', poId, 'items'],
      });
      toast({
        title: 'Success',
        description: 'Item deleted successfully',
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

  const resetForm = () => {
    setFormData({
      partNumber: '',
      partName: '',
      quantity: 1,
      unitPrice: 0,
      specifications: '',
      notes: '',
    });
    setEditingItem(null);
  };

  const handleOpenCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (item: P2POItem) => {
    setEditingItem(item);
    setFormData({
      partNumber: item.partNumber,
      partName: item.partName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      specifications: item.specifications || '',
      notes: item.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ itemId: editingItem.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const totalValue = items.reduce((sum, item) => sum + item.totalPrice, 0);

  if (isLoading) {
    return <div className="p-6">Loading P2 purchase order items...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to P2 Purchase Orders
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              P2 PO Items - {poNumber}
            </h2>
            <p className="text-muted-foreground">
              Manage parts and quantities for this P2 purchase order
            </p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenCreateDialog} data-testid="button-add-item">
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingItem ? 'Edit P2 PO Item' : 'Add P2 PO Item'}
              </DialogTitle>
              <DialogDescription>
                {editingItem
                  ? 'Update item information'
                  : 'Add a new part to this P2 purchase order'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partNumber">Part Number * (from inventory or custom)</Label>
                  <Input
                    id="partNumber"
                    list="inventory-items-list"
                    value={formData.partNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, partNumber: e.target.value })
                    }
                    required
                    placeholder="Select from inventory or type custom..."
                    disabled={isLoadingInventory}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partName">Part Name *</Label>
                  <Input
                    id="partName"
                    value={formData.partName}
                    onChange={(e) =>
                      setFormData({ ...formData, partName: e.target.value })
                    }
                    required
                    placeholder="Enter part name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: parseInt(e.target.value) || 1,
                      })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">Unit Price ($)</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.unitPrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        unitPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specifications">Specifications</Label>
                <Textarea
                  id="specifications"
                  value={formData.specifications}
                  onChange={(e) =>
                    setFormData({ ...formData, specifications: e.target.value })
                  }
                  placeholder="Enter specifications (optional)"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Enter notes (optional)"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingItem
                      ? 'Update Item'
                      : 'Add Item'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Line Items</CardTitle>
          <CardDescription>
            {items.length === 0
              ? 'No items added yet'
              : `${items.length} item${items.length === 1 ? '' : 's'} | Total: $${totalValue.toFixed(2)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No items added to this P2 purchase order yet.</p>
              <p className="text-sm mt-2">
                Click "Add Item" to add your first item.
              </p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Part Name</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        {item.partNumber}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.partName}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${item.unitPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        ${item.totalPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditDialog(item)}
                            data-testid={`button-edit-${item.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-red-600 hover:text-red-800"
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Centralized inventory items datalist for Part Number autocomplete */}
      <datalist id="inventory-items-list">
        {inventoryItems.map((item: any) => (
          <option key={item.id} value={item.agPartNumber}>
            {item.agPartNumber} - {item.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'react-hot-toast';

type VendorPOItemSelectorProps = {
  vendorPoId: number;
  vendorId: number;
  poNumber: string;
  onTotalChange?: (total: number) => void;
};

type VendorPOItem = {
  id: number;
  vendorPoId: number;
  lineNumber: number;
  agPartNumber?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
};

type VendorPart = {
  id: number;
  agPartNumber: string;
  vendorId: number;
  vendorPartNumber?: string;
  unitPrice?: number;
  leadTimeDays?: number;
  minimumOrderQty?: number;
  isPreferred?: boolean;
  notes?: string;
  itemDescription?: string;
  itemCategory?: string;
  itemUom?: string;
};

export default function VendorPOItemSelector({ vendorPoId, vendorId, poNumber, onTotalChange }: VendorPOItemSelectorProps) {
  const queryClient = useQueryClient();
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [newItem, setNewItem] = useState({
    agPartNumber: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editedItem, setEditedItem] = useState<Partial<VendorPOItem>>({});

  const { data: items = [], isLoading } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`),
  });

  // Fetch vendor parts for the selected vendor
  const { data: vendorParts = [], isLoading: isLoadingParts } = useQuery<VendorPart[]>({
    queryKey: ['/api/inventory/vendor-parts/vendor', vendorId],
    queryFn: () => apiRequest(`/api/inventory/vendor-parts/vendor/${vendorId}`),
    enabled: !!vendorId,
  });

  // Handle part selection
  const handlePartSelect = (partId: string) => {
    setSelectedPartId(partId);
    const selectedPart = vendorParts.find(p => p.id.toString() === partId);
    if (selectedPart) {
      setNewItem({
        agPartNumber: selectedPart.agPartNumber,
        description: selectedPart.itemDescription || selectedPart.agPartNumber,
        quantity: selectedPart.minimumOrderQty || 1,
        unitPrice: selectedPart.unitPrice || 0,
      });
    }
  };

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const lineNumber = items.length + 1;
      const lineTotal = data.quantity * data.unitPrice;
      return apiRequest(`/api/vendor-pos/${vendorPoId}/items`, {
        method: 'POST',
        body: { ...data, lineNumber, lineTotal },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item added successfully');
      setNewItem({ agPartNumber: '', description: '', quantity: 1, unitPrice: 0 });
      if (onTotalChange) {
        onTotalChange(calculateTotal());
      }
    },
    onError: () => {
      toast.error('Failed to add item');
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => {
      return apiRequest(`/api/vendor-pos/items/${itemId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item deleted successfully');
      if (onTotalChange) {
        onTotalChange(calculateTotal());
      }
    },
    onError: () => {
      toast.error('Failed to delete item');
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<VendorPOItem> }) => {
      const lineTotal = (data.quantity || 0) * (data.unitPrice || 0);
      return apiRequest(`/api/vendor-pos/items/${itemId}`, {
        method: 'PUT',
        body: { ...data, lineTotal },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item updated successfully');
      setEditingItemId(null);
      setEditedItem({});
      if (onTotalChange) {
        onTotalChange(calculateTotal());
      }
    },
    onError: () => {
      toast.error('Failed to update item');
    },
  });

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0);
  };

  const handleAddItem = () => {
    if (!newItem.description && !newItem.agPartNumber) {
      toast.error('Please provide either AG Part# or description');
      return;
    }
    createItemMutation.mutate(newItem);
    setSelectedPartId('');
  };

  const handleEditItem = (item: VendorPOItem) => {
    setEditingItemId(item.id);
    setEditedItem({
      agPartNumber: item.agPartNumber,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      notes: item.notes,
    });
  };

  const handleSaveEdit = (itemId: number) => {
    // Find the original item to preserve unchanged values
    const originalItem = items.find(item => item.id === itemId);
    if (!originalItem) return;
    
    // Merge edited fields with original values
    const updatedData = {
      agPartNumber: editedItem.agPartNumber ?? originalItem.agPartNumber,
      description: editedItem.description ?? originalItem.description,
      quantity: editedItem.quantity ?? originalItem.quantity,
      unitPrice: editedItem.unitPrice ?? originalItem.unitPrice,
      notes: editedItem.notes ?? originalItem.notes,
    };
    
    updateItemMutation.mutate({ itemId, data: updatedData });
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditedItem({});
  };

  if (isLoading) {
    return <div>Loading items...</div>;
  }

  const total = calculateTotal();

  return (
    <Card data-testid="vendor-po-item-selector">
      <CardHeader>
        <CardTitle>Line Items for PO #{poNumber}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Item Form */}
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded">
          {/* Part Selection Dropdown */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="partSelector">Select from Vendor Parts</Label>
              <Select value={selectedPartId} onValueChange={handlePartSelect}>
                <SelectTrigger data-testid="select-vendor-part">
                  <SelectValue placeholder="Choose a part from this vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingParts ? (
                    <SelectItem value="loading" disabled>
                      Loading parts...
                    </SelectItem>
                  ) : vendorParts.length === 0 ? (
                    <SelectItem value="empty" disabled>
                      No parts configured for this vendor
                    </SelectItem>
                  ) : (
                    vendorParts.map((part) => (
                      <SelectItem key={part.id} value={part.id.toString()}>
                        {part.agPartNumber} - {part.itemDescription || 'No description'} 
                        {part.unitPrice ? ` ($${part.unitPrice.toFixed(2)})` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Note: Vendor selection for parts is now integrated directly into the Inventory Items form
              </p>
            </div>
          </div>

          {/* Manual Entry Fields */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <Label htmlFor="agPartNumber">AG Part#</Label>
              <Input
                id="agPartNumber"
                value={newItem.agPartNumber}
                onChange={(e) => setNewItem({ ...newItem, agPartNumber: e.target.value })}
                data-testid="input-ag-part-number"
                placeholder="Auto-filled or manual"
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                data-testid="input-description"
                placeholder="Auto-filled or manual"
              />
            </div>
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
                data-testid="input-quantity"
              />
            </div>
            <div>
              <Label htmlFor="unitPrice">Unit Price</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                value={newItem.unitPrice}
                onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                data-testid="input-unit-price"
              />
            </div>
          </div>
          
          <div className="flex items-end">
            <Button onClick={handleAddItem} disabled={createItemMutation.isPending} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        {/* Items Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead>AG Part#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Line Total</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const isEditing = editingItemId === item.id;
              return (
                <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                  <TableCell>{item.lineNumber}</TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editedItem.agPartNumber || ''}
                        onChange={(e) => setEditedItem({ ...editedItem, agPartNumber: e.target.value })}
                        className="w-32"
                        data-testid={`input-edit-ag-part-${item.id}`}
                      />
                    ) : (
                      item.agPartNumber || '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        value={editedItem.description || ''}
                        onChange={(e) => setEditedItem({ ...editedItem, description: e.target.value })}
                        className="w-48"
                        data-testid={`input-edit-description-${item.id}`}
                      />
                    ) : (
                      item.description || '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        value={editedItem.quantity || 0}
                        onChange={(e) => setEditedItem({ ...editedItem, quantity: parseInt(e.target.value) || 0 })}
                        className="w-20"
                        data-testid={`input-edit-quantity-${item.id}`}
                      />
                    ) : (
                      item.quantity
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={editedItem.unitPrice || 0}
                        onChange={(e) => setEditedItem({ ...editedItem, unitPrice: parseFloat(e.target.value) || 0 })}
                        className="w-24"
                        data-testid={`input-edit-unit-price-${item.id}`}
                      />
                    ) : (
                      `$${item.unitPrice.toFixed(2)}`
                    )}
                  </TableCell>
                  <TableCell>
                    ${isEditing 
                      ? ((editedItem.quantity || 0) * (editedItem.unitPrice || 0)).toFixed(2)
                      : item.lineTotal.toFixed(2)
                    }
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={updateItemMutation.isPending}
                            data-testid={`button-save-edit-${item.id}`}
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancelEdit}
                            data-testid={`button-cancel-edit-${item.id}`}
                          >
                            <X className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditItem(item)}
                            data-testid={`button-edit-item-${item.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteItemMutation.mutate(item.id)}
                            data-testid={`button-delete-item-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Total */}
        <div className="flex justify-end">
          <div className="text-right">
            <div className="text-2xl font-bold" data-testid="text-total">
              Total: ${total.toFixed(2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

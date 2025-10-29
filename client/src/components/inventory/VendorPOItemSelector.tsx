import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

type VendorPOItemSelectorProps = {
  vendorPoId: number;
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

export default function VendorPOItemSelector({ vendorPoId, poNumber, onTotalChange }: VendorPOItemSelectorProps) {
  const queryClient = useQueryClient();
  const [newItem, setNewItem] = useState({
    agPartNumber: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
  });

  const { data: items = [], isLoading } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`),
  });

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

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + item.lineTotal, 0);
  };

  const handleAddItem = () => {
    if (!newItem.description && !newItem.agPartNumber) {
      toast.error('Please provide either AG Part# or description');
      return;
    }
    createItemMutation.mutate(newItem);
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
        <div className="grid grid-cols-5 gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded">
          <div>
            <Label htmlFor="agPartNumber">AG Part#</Label>
            <Input
              id="agPartNumber"
              value={newItem.agPartNumber}
              onChange={(e) => setNewItem({ ...newItem, agPartNumber: e.target.value })}
              data-testid="input-ag-part-number"
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              data-testid="input-description"
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
            {items.map((item) => (
              <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                <TableCell>{item.lineNumber}</TableCell>
                <TableCell>{item.agPartNumber || '-'}</TableCell>
                <TableCell>{item.description || '-'}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>${item.unitPrice.toFixed(2)}</TableCell>
                <TableCell>${item.lineTotal.toFixed(2)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    data-testid={`button-delete-item-${item.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
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

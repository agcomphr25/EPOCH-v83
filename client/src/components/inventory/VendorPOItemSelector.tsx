import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from "@/lib/utils";
import { Pencil, Trash2, Plus, Search, Package, ChevronsUpDown, Check, Hash, Building2, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Types
type VendorPOItem = {
  id: number;
  vendorPoId: number;
  lineNumber: number;
  agPartNumber?: string;
  vendorPartNumber?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  uom?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

type CreateVendorPOItemData = {
  agPartNumber?: string;
  vendorPartNumber?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  uom?: string;
  notes?: string;
};

type InventoryItem = {
  id: number;
  agPartNumber: string;
  name: string; // This is 'description' from Enhanced Inventory
  source?: string;
  supplierPartNumber?: string;
  costPer?: number;
  orderDate?: string;
  department?: string;
  secondarySource?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

// Item form component
function VendorPOItemForm({ 
  vendorPoId,
  item, 
  isOpen, 
  onClose, 
  onSubmit 
}: {
  vendorPoId: number;
  item?: VendorPOItem;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateVendorPOItemData) => void;
}) {
  const [formData, setFormData] = useState<CreateVendorPOItemData>({
    agPartNumber: item?.agPartNumber || '',
    vendorPartNumber: item?.vendorPartNumber || '',
    description: item?.description || '',
    quantity: item?.quantity || 1,
    unitPrice: item?.unitPrice || 0,
    uom: item?.uom || 'EA',
    notes: item?.notes || '',
  });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch inventory items for AG# search
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
    queryFn: () => apiRequest('/api/enhanced/inventory/items'),
    enabled: searchQuery.length > 0 || searchOpen
  });

  // Filter inventory items based on search
  const filteredItems = inventoryItems.filter((invItem) =>
    (invItem.agPartNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (invItem.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (invItem.source || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (invItem.supplierPartNumber || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleInventoryItemSelect = (invItem: InventoryItem) => {
    setFormData({
      ...formData,
      agPartNumber: invItem.agPartNumber,
      vendorPartNumber: invItem.supplierPartNumber || '',
      description: invItem.name,
      unitPrice: invItem.costPer || 0,
      notes: invItem.notes || '',
    });
    setSearchQuery(invItem.agPartNumber);
    setSearchOpen(false);
  };

  const calculateTotalPrice = (quantity: number, unitPrice: number) => {
    return quantity * unitPrice;
  };

  const handleQuantityChange = (value: string) => {
    const quantity = parseFloat(value) || 0;
    setFormData({ ...formData, quantity });
  };

  const handleUnitPriceChange = (value: string) => {
    const unitPrice = parseFloat(value) || 0;
    setFormData({ ...formData, unitPrice });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description) {
      toast.error('Please provide a description');
      return;
    }

    if (formData.quantity <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    if (formData.unitPrice < 0) {
      toast.error('Unit price cannot be negative');
      return;
    }

    onSubmit(formData);
  };

  const totalPrice = calculateTotalPrice(formData.quantity, formData.unitPrice);

  const uomOptions = ['EA', 'LB', 'FT', 'SQ FT', 'GAL', 'OZ', 'PACK', 'SET', 'ROLL', 'SHEET'];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle data-testid="item-dialog-title">
            {item ? 'Edit Item' : 'Add Item'}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* AG Part Number Search */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="agPartNumber">AG Part Number</Label>
              <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={searchOpen}
                    className="w-full justify-between"
                    data-testid="button-search-ag-part"
                  >
                    {formData.agPartNumber || "Search AG part..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[500px] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Search AG parts..."
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                      data-testid="input-search-ag-parts"
                    />
                    <CommandEmpty>No parts found.</CommandEmpty>
                    <CommandList>
                      <CommandGroup>
                        {filteredItems.map((invItem) => (
                          <CommandItem
                            key={invItem.id}
                            onSelect={() => handleInventoryItemSelect(invItem)}
                            data-testid={`item-ag-part-${invItem.id}`}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.agPartNumber === invItem.agPartNumber ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col w-full">
                              <div className="flex justify-between items-center">
                                <span className="font-medium">{invItem.agPartNumber}</span>
                                {invItem.costPer && (
                                  <span className="text-sm text-green-600 font-medium">
                                    ${invItem.costPer.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <span className="text-sm text-gray-700 truncate">
                                {invItem.name}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                {invItem.source && (
                                  <div className="flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    <span>{invItem.source}</span>
                                  </div>
                                )}
                                {invItem.supplierPartNumber && (
                                  <div className="flex items-center gap-1">
                                    <Package className="w-3 h-3" />
                                    <span>{invItem.supplierPartNumber}</span>
                                  </div>
                                )}
                                {invItem.department && (
                                  <div className="flex items-center gap-1">
                                    <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                                      {invItem.department}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="vendorPartNumber">Vendor Part Number</Label>
              <Input
                id="vendorPartNumber"
                value={formData.vendorPartNumber}
                onChange={(e) => setFormData({ ...formData, vendorPartNumber: e.target.value })}
                placeholder="Vendor's part number..."
                data-testid="input-vendor-part-number"
              />
              {formData.agPartNumber && (
                <div className="mt-2 p-2 bg-blue-50 rounded-md">
                  <div className="text-xs text-blue-600 font-medium">Selected Inventory Item:</div>
                  <div className="text-sm text-blue-800">{formData.agPartNumber}</div>
                  {formData.unitPrice > 0 && (
                    <div className="text-xs text-blue-600">Cost: ${formData.unitPrice.toFixed(2)}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Item description..."
              rows={2}
              required
              data-testid="input-description"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="quantity">Quantity *</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                min="0.01"
                value={formData.quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                required
                data-testid="input-quantity"
              />
            </div>

            <div>
              <Label htmlFor="unitPrice">Unit Price *</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.unitPrice}
                onChange={(e) => handleUnitPriceChange(e.target.value)}
                required
                data-testid="input-unit-price"
              />
            </div>

            <div>
              <Label htmlFor="uom">Unit of Measure</Label>
              <Select
                value={formData.uom}
                onValueChange={(value) => setFormData({ ...formData, uom: value })}
                data-testid="select-uom"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {uomOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Price:</span>
              <span className="text-lg font-bold" data-testid="text-total-price">
                ${totalPrice.toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" className="flex-1" data-testid="button-submit">
              {item ? 'Update' : 'Add'} Item
            </Button>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Main component
export default function VendorPOItemSelector({ 
  vendorPoId, 
  poNumber, 
  onTotalChange 
}: { 
  vendorPoId: number;
  poNumber: string;
  onTotalChange?: (total: number) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<VendorPOItem | null>(null);
  const [showForm, setShowForm] = useState(false);

  const queryClient = useQueryClient();

  // Fetch vendor PO items
  const { data: items = [], isLoading, error } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`)
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateVendorPOItemData) => 
      apiRequest(`/api/vendor-pos/${vendorPoId}/items`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      // Refresh specific PO items list
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      // Refresh all vendor POs to update totals
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item added successfully');
      setShowForm(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to add item');
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: Partial<CreateVendorPOItemData> }) => 
      apiRequest(`/api/vendor-pos/${vendorPoId}/items/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      // Refresh specific PO items list
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      // Refresh all vendor POs to update totals
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item updated successfully');
      setShowForm(false);
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update item');
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => 
      apiRequest(`/api/vendor-pos/${vendorPoId}/items/${itemId}`, {
        method: 'DELETE'
      }),
    onSuccess: () => {
      // Refresh specific PO items list
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      // Refresh all vendor POs to update totals
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete item');
    }
  });

  // Calculate total and notify parent
  useEffect(() => {
    const total = items.reduce((sum, item) => sum + item.totalPrice, 0);
    onTotalChange?.(total);
  }, [items, onTotalChange]);

  // Event handlers
  const handleAdd = () => {
    setSelectedItem(null);
    setShowForm(true);
  };

  const handleEdit = (item: VendorPOItem) => {
    setSelectedItem(item);
    setShowForm(true);
  };

  const handleDelete = (itemId: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      deleteMutation.mutate(itemId);
    }
  };

  const handleFormSubmit = (data: CreateVendorPOItemData) => {
    if (selectedItem) {
      updateMutation.mutate({ itemId: selectedItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const total = items.reduce((sum, item) => sum + item.totalPrice, 0);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8" data-testid="loading-state">
        <div className="text-gray-500">Loading items...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" data-testid="error-state">
        <div className="text-red-600">Failed to load items</div>
        <Button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] })}
          className="mt-2"
          data-testid="button-retry"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold" data-testid="title">
            Items for {poNumber}
          </h3>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} • Total: ${total.toFixed(2)}
          </p>
        </div>
        <Button onClick={handleAdd} data-testid="button-add-item">
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Items Table */}
      {items.length === 0 ? (
        <div className="text-center py-8" data-testid="empty-state">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No items added</h3>
          <p className="text-gray-500">Add items to this purchase order to get started.</p>
          <Button onClick={handleAdd} className="mt-4" data-testid="button-add-first-item">
            <Plus className="w-4 h-4 mr-2" />
            Add First Item
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line #</TableHead>
                  <TableHead>AG Part #</TableHead>
                  <TableHead>Vendor Part #</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3 text-gray-400" />
                        {item.lineNumber}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm" data-testid={`text-ag-part-${item.id}`}>
                      {item.agPartNumber || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm" data-testid={`text-vendor-part-${item.id}`}>
                      {item.vendorPartNumber || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-xs" data-testid={`text-description-${item.id}`}>
                        <p className="truncate">{item.description}</p>
                        {item.notes && (
                          <p className="text-xs text-gray-500 truncate">{item.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-quantity-${item.id}`}>
                      {item.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell data-testid={`text-uom-${item.id}`}>
                      {item.uom}
                    </TableCell>
                    <TableCell className="text-right" data-testid={`text-unit-price-${item.id}`}>
                      ${item.unitPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`text-total-price-${item.id}`}>
                      ${item.totalPrice.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          data-testid={`button-edit-item-${item.id}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          className="text-red-600 hover:text-red-800"
                          data-testid={`button-delete-item-${item.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            {/* Total Footer */}
            <div className="border-t p-4 bg-gray-50">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total:</span>
                <span data-testid="text-grand-total">${total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Form */}
      <VendorPOItemForm
        vendorPoId={vendorPoId}
        item={selectedItem || undefined}
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedItem(null);
        }}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
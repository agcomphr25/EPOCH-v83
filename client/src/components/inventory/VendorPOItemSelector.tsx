import { useState, useEffect, useMemo } from 'react';
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
import { Plus, Trash2, Pencil, Check, X, Info, ArrowRight, Calculator } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

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
  supplierPartNumber?: string;
  description?: string;
  purchaseQty?: number;
  purchaseUnitPrice?: number;
  purchaseUnit?: string;
  quantity: number;
  unitPrice: number;
  vendorUnit?: string;
  conversionFactor?: number;
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

type InventoryItem = {
  id: number;
  agPartNumber: string;
  name: string;
  vendorUnit?: string;
  purchaseUnit?: string;
  purchaseQuantity?: number;
  costPer?: number;
  supplierPartNumber?: string;
};

type NewItemState = {
  agPartNumber: string;
  description: string;
  purchaseQty: number;
  purchaseUnitPrice: number;
  purchaseUnit: string;
  vendorUnit: string;
  conversionFactor: number;
  quantity: number;
  unitPrice: number;
};

function QuantityDisplay({ item }: { item: VendorPOItem }) {
  if (!item.vendorUnit && !item.purchaseUnit) {
    return <span>{item.quantity.toFixed(2)}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-help">
            <div>
              <div className="font-medium">
                {item.quantity.toFixed(2)} {item.vendorUnit || 'units'}
              </div>
              {item.purchaseQty && item.purchaseUnit && (
                <div className="text-xs text-muted-foreground">
                  = {item.purchaseQty.toFixed(2)} {item.purchaseUnit}
                </div>
              )}
            </div>
            <Info className="w-3 h-3 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p><strong>Unit Conversion:</strong></p>
            {item.purchaseQty && item.purchaseUnit && (
              <p>Purchase: {item.purchaseQty.toFixed(2)} {item.purchaseUnit} @ ${item.purchaseUnitPrice?.toFixed(2)}/{item.purchaseUnit}</p>
            )}
            {item.conversionFactor && (
              <p>Conversion: {item.conversionFactor.toFixed(2)} {item.purchaseUnit} per {item.vendorUnit}</p>
            )}
            <p>Vendor: {item.quantity.toFixed(2)} {item.vendorUnit || 'units'} @ ${item.unitPrice.toFixed(2)}/{item.vendorUnit || 'unit'}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function UnitPriceDisplay({ item }: { item: VendorPOItem }) {
  if (!item.vendorUnit && !item.purchaseUnit) {
    return <span>${item.unitPrice.toFixed(2)}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-help">
            <div>
              <div className="font-medium">
                ${item.unitPrice.toFixed(2)}/{item.vendorUnit || 'unit'}
              </div>
              {item.purchaseUnitPrice && item.purchaseUnit && (
                <div className="text-xs text-muted-foreground">
                  ${item.purchaseUnitPrice.toFixed(2)}/{item.purchaseUnit}
                </div>
              )}
            </div>
            <Info className="w-3 h-3 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p><strong>Price Breakdown:</strong></p>
            {item.purchaseUnitPrice && item.purchaseUnit && (
              <p>Purchase price: ${item.purchaseUnitPrice.toFixed(2)} per {item.purchaseUnit}</p>
            )}
            <p>Vendor price: ${item.unitPrice.toFixed(2)} per {item.vendorUnit || 'unit'}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function VendorPOItemSelector({ vendorPoId, vendorId, poNumber, onTotalChange }: VendorPOItemSelectorProps) {
  const queryClient = useQueryClient();
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventoryItem | null>(null);
  const [newItem, setNewItem] = useState<NewItemState>({
    agPartNumber: '',
    description: '',
    purchaseQty: 0,
    purchaseUnitPrice: 0,
    purchaseUnit: '',
    vendorUnit: '',
    conversionFactor: 0,
    quantity: 0,
    unitPrice: 0,
  });
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editedItem, setEditedItem] = useState<Partial<VendorPOItem>>({});

  const { data: items = [], isLoading } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`),
  });

  const { data: vendorParts = [], isLoading: isLoadingParts } = useQuery<VendorPart[]>({
    queryKey: ['/api/inventory/vendor-parts/vendor', vendorId],
    queryFn: () => apiRequest(`/api/inventory/vendor-parts/vendor/${vendorId}`),
    enabled: !!vendorId,
  });

  const hasUnitConversion = useMemo(() => {
    return selectedInventoryItem?.vendorUnit && 
           selectedInventoryItem?.purchaseUnit && 
           selectedInventoryItem?.purchaseQuantity && 
           selectedInventoryItem.purchaseQuantity > 0;
  }, [selectedInventoryItem]);

  const calculatedVendorValues = useMemo(() => {
    if (!hasUnitConversion || !newItem.purchaseQty || newItem.purchaseQty <= 0) {
      return { vendorQty: newItem.purchaseQty || 0, vendorUnitPrice: newItem.purchaseUnitPrice || 0 };
    }
    
    const conversionFactor = selectedInventoryItem!.purchaseQuantity!;
    const vendorQty = newItem.purchaseQty / conversionFactor;
    const vendorUnitPrice = newItem.purchaseUnitPrice * conversionFactor;
    
    return { vendorQty, vendorUnitPrice };
  }, [hasUnitConversion, newItem.purchaseQty, newItem.purchaseUnitPrice, selectedInventoryItem]);

  const lineTotal = useMemo(() => {
    if (hasUnitConversion) {
      return calculatedVendorValues.vendorQty * calculatedVendorValues.vendorUnitPrice;
    }
    return newItem.quantity * newItem.unitPrice;
  }, [hasUnitConversion, calculatedVendorValues, newItem.quantity, newItem.unitPrice]);

  const handlePartSelect = async (partId: string) => {
    setSelectedPartId(partId);
    const selectedPart = vendorParts.find(p => p.id.toString() === partId);
    
    if (selectedPart) {
      try {
        const inventoryItem = await apiRequest(`/api/inventory/items/by-part-number/${selectedPart.agPartNumber}`);
        setSelectedInventoryItem(inventoryItem);
        
        const hasConversion = inventoryItem?.vendorUnit && 
                             inventoryItem?.purchaseUnit && 
                             inventoryItem?.purchaseQuantity && 
                             inventoryItem.purchaseQuantity > 0;
        
        if (hasConversion) {
          // Purchase unit mode - user enters in purchase units (e.g., sqm)
          setNewItem({
            agPartNumber: selectedPart.agPartNumber,
            description: selectedPart.itemDescription || `${selectedPart.agPartNumber} - ${inventoryItem.name || ''}`,
            purchaseQty: 0,
            purchaseUnitPrice: selectedPart.unitPrice || inventoryItem.costPer || 0,
            purchaseUnit: inventoryItem.purchaseUnit,
            vendorUnit: inventoryItem.vendorUnit,
            conversionFactor: inventoryItem.purchaseQuantity,
            quantity: 0,
            unitPrice: 0,
          });
          console.log('Purchase unit mode activated:', { vendorUnit: inventoryItem.vendorUnit, purchaseUnit: inventoryItem.purchaseUnit, conversionFactor: inventoryItem.purchaseQuantity });
        } else {
          // Simple vendor unit mode - user enters vendor units directly
          setNewItem({
            agPartNumber: selectedPart.agPartNumber,
            description: selectedPart.itemDescription || selectedPart.agPartNumber,
            purchaseQty: 0,
            purchaseUnitPrice: 0,
            purchaseUnit: '',
            vendorUnit: inventoryItem?.vendorUnit || '',
            conversionFactor: 0,
            quantity: selectedPart.minimumOrderQty || 1,
            unitPrice: selectedPart.unitPrice || 0,
          });
          console.log('Simple vendor unit mode - no conversion data available');
        }
      } catch (error) {
        console.error('Failed to fetch inventory item:', error);
        setSelectedInventoryItem(null);
        setNewItem({
          agPartNumber: selectedPart.agPartNumber,
          description: selectedPart.itemDescription || selectedPart.agPartNumber,
          purchaseQty: 0,
          purchaseUnitPrice: 0,
          purchaseUnit: '',
          vendorUnit: '',
          conversionFactor: 0,
          quantity: selectedPart.minimumOrderQty || 1,
          unitPrice: selectedPart.unitPrice || 0,
        });
        console.log('Failed to fetch inventory item, using simple mode');
      }
    }
  };

  const createItemMutation = useMutation({
    mutationFn: async (data: any) => {
      const lineNumber = items.length + 1;
      return apiRequest(`/api/vendor-pos/${vendorPoId}/items`, {
        method: 'POST',
        body: { ...data, lineNumber },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Item added successfully');
      resetForm();
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

  const resetForm = () => {
    setNewItem({
      agPartNumber: '',
      description: '',
      purchaseQty: 0,
      purchaseUnitPrice: 0,
      purchaseUnit: '',
      vendorUnit: '',
      conversionFactor: 0,
      quantity: 0,
      unitPrice: 0,
    });
    setSelectedPartId('');
    setSelectedInventoryItem(null);
  };

  const handleAddItem = () => {
    if (!newItem.description && !newItem.agPartNumber) {
      toast.error('Please provide either AG Part# or description');
      return;
    }
    
    let itemData: any;
    
    if (hasUnitConversion && newItem.purchaseQty > 0) {
      if (newItem.purchaseUnitPrice <= 0) {
        toast.error('Please enter a valid purchase unit price');
        return;
      }
      
      itemData = {
        agPartNumber: newItem.agPartNumber,
        description: newItem.description,
        purchaseQty: newItem.purchaseQty,
        purchaseUnitPrice: newItem.purchaseUnitPrice,
        purchaseUnit: newItem.purchaseUnit,
        vendorUnit: newItem.vendorUnit,
        conversionFactor: newItem.conversionFactor,
        quantity: calculatedVendorValues.vendorQty,
        unitPrice: calculatedVendorValues.vendorUnitPrice,
        lineTotal: lineTotal,
      };
    } else {
      if (newItem.quantity <= 0 || newItem.unitPrice <= 0) {
        toast.error('Please enter valid quantity and unit price');
        return;
      }
      
      itemData = {
        agPartNumber: newItem.agPartNumber,
        description: newItem.description,
        quantity: newItem.quantity,
        unitPrice: newItem.unitPrice,
        vendorUnit: newItem.vendorUnit || null,
        lineTotal: newItem.quantity * newItem.unitPrice,
      };
    }
    
    createItemMutation.mutate(itemData);
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
    const originalItem = items.find(item => item.id === itemId);
    if (!originalItem) return;
    
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
        <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded">
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
            </div>
          </div>

          {newItem.purchaseUnit && newItem.vendorUnit && newItem.conversionFactor > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-800 dark:text-blue-200">Unit Conversion Active</span>
                <Badge variant="outline" className="text-xs">
                  {newItem.conversionFactor} {newItem.purchaseUnit} per {newItem.vendorUnit}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300">📊 You Enter (Purchase Units)</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Enter what you need in actual measurements</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="purchaseQty">Quantity ({newItem.purchaseUnit})</Label>
                      <Input
                        id="purchaseQty"
                        type="number"
                        step="0.01"
                        value={newItem.purchaseQty || ''}
                        onChange={(e) => setNewItem({ ...newItem, purchaseQty: parseFloat(e.target.value) || 0 })}
                        data-testid="input-purchase-qty"
                        placeholder={`e.g., 366 ${newItem.purchaseUnit}`}
                        className="text-base font-semibold"
                      />
                      <p className="text-xs text-gray-500 mt-1">e.g., 366 sq meters</p>
                    </div>
                    <div>
                      <Label htmlFor="purchaseUnitPrice">Price per {newItem.purchaseUnit}</Label>
                      <Input
                        id="purchaseUnitPrice"
                        type="number"
                        step="0.01"
                        value={newItem.purchaseUnitPrice || ''}
                        onChange={(e) => setNewItem({ ...newItem, purchaseUnitPrice: parseFloat(e.target.value) || 0 })}
                        data-testid="input-purchase-unit-price"
                        placeholder="e.g., 17.18"
                        className="text-base font-semibold"
                      />
                      <p className="text-xs text-gray-500 mt-1">e.g., $17.18/sqm</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    📋 Vendor PO Shows (Vendor Units)
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">Automatically converted for the vendor</p>
                  <div className="bg-white dark:bg-gray-800 rounded p-3 border border-green-200 dark:border-green-800">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Qty (Vendor):</span>
                        <div className="font-bold text-lg text-green-600">
                          {calculatedVendorValues.vendorQty.toFixed(2)} {newItem.vendorUnit}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Price per {newItem.vendorUnit}:</span>
                        <div className="font-bold text-lg text-green-600">
                          ${calculatedVendorValues.vendorUnitPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                      <span className="text-muted-foreground text-xs">Line Total:</span>
                      <div className="font-bold text-xl text-green-700 dark:text-green-400">
                        ${lineTotal.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!(newItem.purchaseUnit && newItem.vendorUnit && newItem.conversionFactor > 0) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-3">⚠️ No unit conversion configured</p>
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
                  <Label htmlFor="quantity">Quantity {newItem.vendorUnit && `(${newItem.vendorUnit})`}</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    value={newItem.quantity || ''}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                    data-testid="input-quantity"
                  />
                </div>
                <div>
                  <Label htmlFor="unitPrice">Unit Price {newItem.vendorUnit && `(per ${newItem.vendorUnit})`}</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.01"
                    value={newItem.unitPrice || ''}
                    onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                    data-testid="input-unit-price"
                  />
                </div>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">💡 Tip: Set up vendorUnit, purchaseUnit, and conversion factor in inventory items for automatic unit conversion</p>
            </div>
          )}
          
          <div className="flex items-center gap-4">
            <Button onClick={handleAddItem} disabled={createItemMutation.isPending} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
            {selectedPartId && (
              <Button variant="outline" onClick={resetForm}>
                Clear Selection
              </Button>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line</TableHead>
              <TableHead>AG Part#</TableHead>
              <TableHead>Supplier Part#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Qty (Vendor)</TableHead>
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
                    {item.supplierPartNumber || '-'}
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
                        step="0.01"
                        value={editedItem.quantity || 0}
                        onChange={(e) => setEditedItem({ ...editedItem, quantity: parseFloat(e.target.value) || 0 })}
                        className="w-20"
                        data-testid={`input-edit-quantity-${item.id}`}
                      />
                    ) : (
                      <QuantityDisplay item={item} />
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
                      <UnitPriceDisplay item={item} />
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

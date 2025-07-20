import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, ShoppingCart, Package, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface OrderFormData {
  supplierName: string;
  selectedItemIds: number[];
  notes: string;
}

export default function OrderPlacementCard() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<OrderFormData>({
    supplierName: '',
    selectedItemIds: [],
    notes: ''
  });

  // Get inventory items to extract suppliers
  const { data: inventoryItems = [], isLoading } = useQuery({
    queryKey: ['/api/inventory'],
    enabled: true
  });

  // Extract unique suppliers from inventory items (excluding department codes)
  // Function to normalize supplier names for consistency
  const normalizeSupplierName = (name: string): string => {
    if (!name) return name;
    const trimmed = name.trim();
    
    // Handle common variations
    if (trimmed.toLowerCase() === 'lowes') return "Lowe's";
    if (trimmed.toLowerCase() === 'homedepot' || trimmed.toLowerCase() === 'home depot') return "Home Depot";
    if (trimmed.toLowerCase() === 'walmart') return "Walmart";
    if (trimmed.toLowerCase() === 'machining resource') return "Machining Resources";
    
    return trimmed;
  };

  const availableSuppliers = useMemo(() => {
    if (!inventoryItems || inventoryItems.length === 0) {
      return [];
    }
    
    const suppliers = new Set<string>();
    const departmentCodes = ['PL1', 'PL2', 'PL3', 'SHOP', 'OFFICE']; // Add known department codes to exclude
    
    inventoryItems.forEach((item: any) => {
      if (item?.source && typeof item.source === 'string' && item.source.trim()) {
        const source = normalizeSupplierName(item.source);
        // Only add if it's not a department code
        if (!departmentCodes.includes(source.toUpperCase())) {
          suppliers.add(source);
        }
      }
      if (item?.secondarySource && typeof item.secondarySource === 'string' && item.secondarySource.trim()) {
        const secondarySource = normalizeSupplierName(item.secondarySource);
        // Only add if it's not a department code
        if (!departmentCodes.includes(secondarySource.toUpperCase())) {
          suppliers.add(secondarySource);
        }
      }
    });
    
    return Array.from(suppliers).sort();
  }, [inventoryItems]);

  // Get inventory items filtered by selected supplier
  const availableItems = useMemo(() => {
    if (!inventoryItems || inventoryItems.length === 0) {
      return [];
    }
    
    // If no supplier selected, return empty array to force supplier selection first
    if (!formData.supplierName) {
      return [];
    }
    
    // Filter items by selected supplier (matching source or secondarySource)
    const filteredItems = inventoryItems.filter((item: any) => {
      const itemSource = normalizeSupplierName(item?.source || '');
      const itemSecondarySource = normalizeSupplierName(item?.secondarySource || '');
      const selectedSupplier = normalizeSupplierName(formData.supplierName);
      
      return (itemSource === selectedSupplier) || (itemSecondarySource === selectedSupplier);
    });
    
    // Sort by part number
    return filteredItems.sort((a: any, b: any) => {
      const aPartNumber = a.agPartNumber || '';
      const bPartNumber = b.agPartNumber || '';
      return aPartNumber.localeCompare(bPartNumber);
    });
  }, [inventoryItems, formData.supplierName]);

  // Get selected items details
  const selectedItems = useMemo(() => {
    return formData.selectedItemIds.map(id => 
      availableItems.find(item => item.id === id)
    ).filter(Boolean);
  }, [availableItems, formData.selectedItemIds]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/purchase-orders', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Purchase order created and sent to receiving queue');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/outstanding'] });
    },
    onError: () => toast.error('Failed to create purchase order'),
  });

  const resetForm = () => {
    setFormData({
      supplierName: '',
      selectedItemIds: [],
      notes: ''
    });
  };

  const handleItemSelection = (itemId: number) => {
    setFormData(prev => ({
      ...prev,
      selectedItemIds: prev.selectedItemIds.includes(itemId)
        ? prev.selectedItemIds.filter(id => id !== itemId)
        : [...prev.selectedItemIds, itemId]
    }));
  };

  const handleSelectAll = () => {
    const allItemIds = availableItems.map(item => item.id);
    setFormData(prev => ({
      ...prev,
      selectedItemIds: prev.selectedItemIds.length === availableItems.length ? [] : allItemIds
    }));
  };

  const handlePlaceOrder = () => {
    if (!formData.supplierName.trim()) {
      toast.error('Please select a supplier');
      return;
    }
    
    if (formData.selectedItemIds.length === 0) {
      toast.error('Please select at least one item');
      return;
    }

    const orderData = {
      supplier: formData.supplierName,
      orderType: 'PARTS',
      priority: 'NORMAL',
      status: 'PENDING_RECEIVING', // Goes directly to receiving queue
      notes: formData.notes,
      items: selectedItems.map(item => ({
        partNumber: item.agPartNumber || '',
        description: item.name || '',
        quantity: 1, // Default quantity
        unitCost: item.costPer || 0
      })),
      totalAmount: selectedItems.reduce((sum, item) => sum + (item.costPer || 0), 0),
      orderDate: new Date().toISOString(),
      createdBy: 'system' // You can replace with actual user info
    };

    createOrderMutation.mutate(orderData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <ShoppingCart className="h-8 w-8 text-purple-600 mx-auto mb-2" />
          <p>Loading inventory data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold">Place Purchase Order</h3>
        <div className="ml-auto text-sm text-gray-500">
          {availableSuppliers.length} suppliers available
        </div>
      </div>

      <div className="space-y-6">
        {/* Step 1: Select Supplier for Order */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select Supplier for this Order</CardTitle>
            <CardDescription>Choose which supplier you want to place this order with</CardDescription>
          </CardHeader>
          <CardContent>
            <Select 
              value={formData.supplierName} 
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                supplierName: value,
                selectedItemIds: [] // Clear selected items when supplier changes
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a supplier..." />
              </SelectTrigger>
              <SelectContent>
                {availableSuppliers.map(supplier => (
                  <SelectItem key={supplier} value={supplier}>
                    {supplier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Step 2: Multi-select Items from ALL inventory */}
        {formData.supplierName && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Select Items to Order from {formData.supplierName}</CardTitle>
              <CardDescription>
                {availableItems.length} items available from {formData.supplierName} • {formData.selectedItemIds.length} selected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {formData.selectedItemIds.length === availableItems.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>

                <div className="max-h-80 overflow-y-auto border rounded-lg">
                  {availableItems.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <Checkbox
                        checked={formData.selectedItemIds.includes(item.id)}
                        onCheckedChange={() => handleItemSelection(item.id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{item.agPartNumber}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{item.name}</div>
                        <div className="flex gap-4 text-xs text-gray-500">
                          {item.costPer && <span className="text-green-600 font-medium">${item.costPer}</span>}
                          {item.source && <span>Supplier: {item.source}</span>}
                          {item.department && <span>Dept: {item.department}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Order Summary & Place Order */}
        {selectedItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Order Summary</CardTitle>
              <CardDescription>
                {selectedItems.length} items selected • Estimated total: ${selectedItems.reduce((sum, item) => sum + (item.costPer || 0), 0).toFixed(2)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Selected Items Preview */}
              <div className="max-h-40 overflow-y-auto border rounded-lg">
                {selectedItems.map((item: any) => (
                  <div key={item.id} className="flex justify-between items-center p-3 border-b">
                    <div>
                      <div className="font-medium">{item.agPartNumber}</div>
                      <div className="text-sm text-gray-600">{item.name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">Qty: 1</div>
                      {item.costPer && <div className="font-medium text-green-600">${item.costPer}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Notes */}
              <div>
                <Label htmlFor="notes">Order Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Special instructions or notes for this order..."
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Place Order Button */}
              <div className="flex justify-between items-center pt-4 border-t">
                <div className="text-sm text-gray-600">
                  Order will be sent to receiving queue for processing
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={resetForm}
                    disabled={createOrderMutation.isPending}
                  >
                    Reset
                  </Button>
                  <Button 
                    onClick={handlePlaceOrder}
                    disabled={createOrderMutation.isPending}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {createOrderMutation.isPending ? 'Placing Order...' : 'Place Order'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No supplier selected state */}
        {!formData.supplierName && availableSuppliers.length > 0 && (
          <div className="text-center py-8 text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Select a supplier to start ordering items</p>
            <p className="text-sm">All {availableItems.length} inventory items will be available to order</p>
          </div>
        )}
      </div>
    </div>
  );
}
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
import { Plus, ShoppingCart, Package, Calendar, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface OrderFormData {
  supplierName: string;
  orderType: string;
  priority: string;
  deliveryDate: string;
  notes: string;
  items: OrderItem[];
}

interface OrderItem {
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export default function OrderPlacementCard() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<OrderFormData>({
    supplierName: '',
    orderType: 'PARTS',
    priority: 'NORMAL',
    deliveryDate: '',
    notes: '',
    items: [{ partNumber: '', description: '', quantity: 1, unitCost: 0 }]
  });
  
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  // Get inventory items to extract suppliers
  const { data: inventoryItems = [] } = useQuery({
    queryKey: ['/api/inventory'],
    enabled: true
  });

  // Extract unique suppliers from inventory items
  const availableSuppliers = useMemo(() => {
    if (!inventoryItems || inventoryItems.length === 0) {
      console.log('No inventory items available');
      return [];
    }
    
    console.log('Processing inventory items:', inventoryItems.length, 'items');
    const suppliers = new Set<string>();
    let sourceCount = 0;
    let secondaryCount = 0;
    
    try {
      inventoryItems.forEach((item: any) => {
        if (item?.source && typeof item.source === 'string' && item.source.trim()) {
          suppliers.add(item.source.trim());
          sourceCount++;
        }
        if (item?.secondarySource && typeof item.secondarySource === 'string' && item.secondarySource.trim()) {
          suppliers.add(item.secondarySource.trim());
          secondaryCount++;
        }
      });
      
      const suppliersArray = Array.from(suppliers).sort();
      console.log('Found suppliers:', suppliersArray);
      console.log('Items with source:', sourceCount, 'Items with secondarySource:', secondaryCount);
      return suppliersArray;
    } catch (error) {
      console.error('Error processing suppliers:', error);
      return [];
    }
  }, [inventoryItems]);

  // Get items for selected supplier
  const supplierItems = useMemo(() => {
    if (!formData.supplierName || !inventoryItems || inventoryItems.length === 0) {
      console.log('No supplier selected or no inventory items');
      return [];
    }
    
    console.log('Filtering items for supplier:', formData.supplierName);
    try {
      const filtered = inventoryItems.filter((item: any) => 
        item?.source === formData.supplierName || item?.secondarySource === formData.supplierName
      );
      console.log('Found items for supplier:', filtered.length);
      return filtered;
    } catch (error) {
      console.error('Error filtering supplier items:', error);
      return [];
    }
  }, [inventoryItems, formData.supplierName]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/purchase-orders', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Purchase order created successfully');
      resetForm();
      // Refresh related queries
      queryClient.invalidateQueries({ queryKey: ['/api/purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/outstanding'] });
    },
    onError: () => toast.error('Failed to create purchase order'),
  });

  const resetForm = () => {
    setFormData({
      supplierName: '',
      orderType: 'PARTS',
      priority: 'NORMAL',
      deliveryDate: '',
      notes: '',
      items: [{ partNumber: '', description: '', quantity: 1, unitCost: 0 }]
    });
    setSelectedItems(new Set());
  };

  const handleSelectAllItems = () => {
    if (selectedItems.size === supplierItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(supplierItems.map((_, index) => index)));
    }
  };

  const handleItemSelect = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const addSelectedItemsToOrder = () => {
    const newItems = Array.from(selectedItems).map(index => {
      const item = supplierItems[index];
      return {
        partNumber: item.agPartNumber || '',
        description: item.name || '',
        quantity: 1,
        unitCost: item.costPer || 0
      };
    });

    setFormData(prev => ({
      ...prev,
      items: [...prev.items, ...newItems]
    }));
    
    setSelectedItems(new Set());
    toast.success(`Added ${newItems.length} items to order`);
  };

  const removeItem = (indexToRemove: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, index) => index !== indexToRemove)
    }));
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const addNewItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { partNumber: '', description: '', quantity: 1, unitCost: 0 }]
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.supplierName.trim()) {
      toast.error('Please select a supplier');
      return;
    }
    
    if (formData.items.length === 0 || formData.items.some(item => !item.partNumber.trim())) {
      toast.error('Please add at least one valid item');
      return;
    }

    const orderData = {
      supplier: formData.supplierName,
      orderType: formData.orderType,
      priority: formData.priority,
      deliveryDate: formData.deliveryDate || null,
      notes: formData.notes,
      items: formData.items,
      status: 'PENDING',
      totalAmount: formData.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0)
    };

    createOrderMutation.mutate(orderData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <ShoppingCart className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold">Create New Purchase Order</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Order Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="supplier">Supplier *</Label>
            <Select 
              value={formData.supplierName} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, supplierName: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select supplier..." />
              </SelectTrigger>
              <SelectContent>
                {availableSuppliers.map(supplier => (
                  <SelectItem key={supplier} value={supplier}>
                    {supplier}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="orderType">Order Type</Label>
            <Select 
              value={formData.orderType} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, orderType: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PARTS">Parts</SelectItem>
                <SelectItem value="MATERIALS">Materials</SelectItem>
                <SelectItem value="SUPPLIES">Supplies</SelectItem>
                <SelectItem value="EQUIPMENT">Equipment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select 
              value={formData.priority} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="NORMAL">Normal</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="deliveryDate">Requested Delivery Date</Label>
            <Input
              id="deliveryDate"
              type="date"
              value={formData.deliveryDate}
              onChange={(e) => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Additional notes or special instructions..."
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={3}
          />
        </div>

        {/* Item Selection from Supplier */}
        {formData.supplierName && supplierItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Available Items from {formData.supplierName} ({supplierItems.length} items)
              </CardTitle>
              <CardDescription>
                Select items to add to your order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllItems}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {selectedItems.size === supplierItems.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  {selectedItems.size > 0 && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={addSelectedItemsToOrder}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Selected ({selectedItems.size})
                    </Button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  {supplierItems.map((item: any, index: number) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <Checkbox
                        checked={selectedItems.has(index)}
                        onCheckedChange={() => handleItemSelect(index)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{item.agPartNumber}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{item.name}</div>
                        {item.costPer && (
                          <div className="text-sm text-green-600">${item.costPer}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Items */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Order Items ({formData.items.length})</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addNewItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {formData.items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg">
                  <div className="md:col-span-2">
                    <Label>Part Number *</Label>
                    <Input
                      value={item.partNumber}
                      onChange={(e) => updateItem(index, 'partNumber', e.target.value)}
                      placeholder="Enter part number"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label>Unit Cost</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitCost}
                        onChange={(e) => updateItem(index, 'unitCost', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    {formData.items.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Order Summary */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-semibold">
                  <span>Total Estimated Cost:</span>
                  <span>${formData.items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <Button 
            type="submit" 
            disabled={createOrderMutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {createOrderMutation.isPending ? 'Creating Order...' : 'Create Purchase Order'}
          </Button>
          <Button type="button" variant="outline" onClick={resetForm}>
            Reset Form
          </Button>
        </div>
      </form>
    </div>
  );
}
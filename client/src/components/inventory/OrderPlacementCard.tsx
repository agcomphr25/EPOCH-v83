import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, ShoppingCart, Package, Calendar } from 'lucide-react';
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
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index: number, field: keyof OrderItem, value: string | number) => {
    const updatedItems = [...formData.items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    setFormData(prev => ({ ...prev, items: updatedItems }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { partNumber: '', description: '', quantity: 1, unitCost: 0 }]
    }));
  };

  const removeItem = (index: number) => {
    if (formData.items.length > 1) {
      const updatedItems = formData.items.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, items: updatedItems }));
    }
  };

  const calculateTotal = () => {
    return formData.items.reduce((total, item) => total + (item.quantity * item.unitCost), 0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.supplierName) {
      toast.error('Please enter supplier name');
      return;
    }

    if (formData.items.some(item => !item.partNumber || !item.description)) {
      toast.error('Please fill in all item details');
      return;
    }

    const submitData = {
      supplierName: formData.supplierName,
      orderType: formData.orderType,
      priority: formData.priority,
      deliveryDate: formData.deliveryDate || null,
      notes: formData.notes || null,
      items: formData.items,
      total: calculateTotal(),
      status: 'PENDING'
    };

    createOrderMutation.mutate(submitData);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Order Placement</h3>
        <div className="text-sm text-gray-500">
          Create new purchase orders
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-blue-600" />
              Parts Order
            </CardTitle>
            <CardDescription className="text-xs">
              Order individual parts and components
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShoppingCart className="h-4 w-4 text-green-600" />
              Bulk Order
            </CardTitle>
            <CardDescription className="text-xs">
              Order multiple items from one supplier
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-purple-600" />
              Scheduled Order
            </CardTitle>
            <CardDescription className="text-xs">
              Set up recurring or scheduled orders
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Order Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create Purchase Order</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="supplierName">Supplier Name *</Label>
                <Input
                  id="supplierName"
                  name="supplierName"
                  value={formData.supplierName}
                  onChange={handleChange}
                  placeholder="Enter supplier name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="orderType">Order Type</Label>
                <Select value={formData.orderType} onValueChange={(value) => handleSelectChange('orderType', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select order type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PARTS">Parts</SelectItem>
                    <SelectItem value="MATERIALS">Materials</SelectItem>
                    <SelectItem value="TOOLS">Tools</SelectItem>
                    <SelectItem value="EQUIPMENT">Equipment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => handleSelectChange('priority', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="deliveryDate">Requested Delivery Date</Label>
                <Input
                  id="deliveryDate"
                  name="deliveryDate"
                  type="date"
                  value={formData.deliveryDate}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Order Items */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-base font-medium">Order Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>

              {formData.items.map((item, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Item {index + 1}</h4>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`partNumber-${index}`}>Part Number *</Label>
                      <Input
                        id={`partNumber-${index}`}
                        value={item.partNumber}
                        onChange={(e) => handleItemChange(index, 'partNumber', e.target.value)}
                        placeholder="Enter part number"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`description-${index}`}>Description *</Label>
                      <Input
                        id={`description-${index}`}
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        placeholder="Enter item description"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor={`quantity-${index}`}>Quantity</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`unitCost-${index}`}>Unit Cost</Label>
                      <Input
                        id={`unitCost-${index}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitCost}
                        onChange={(e) => handleItemChange(index, 'unitCost', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <Label>Total</Label>
                      <div className="h-10 flex items-center px-3 bg-gray-50 rounded-md">
                        ${(item.quantity * item.unitCost).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Additional notes or special instructions"
                rows={3}
              />
            </div>

            {/* Order Summary */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="font-medium">Order Total:</span>
                <span className="text-xl font-bold">${calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={resetForm}>
                Clear Form
              </Button>
              <Button 
                type="submit" 
                disabled={createOrderMutation.isPending}
                className="min-w-[120px]"
              >
                {createOrderMutation.isPending ? 'Creating...' : 'Create Order'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
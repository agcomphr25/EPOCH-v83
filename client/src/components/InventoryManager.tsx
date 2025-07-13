import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, AlertTriangle, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import type { InventoryItem } from '@shared/schema';

const categories = [
  'Barrels',
  'Stocks',
  'Triggers',
  'Scopes',
  'Accessories',
  'Hardware',
  'Other'
];

interface InventoryFormData {
  code: string;
  name: string;
  description: string;
  category: string;
  onHand: string;
  committed: string;
  reorderPoint: string;
}

export default function InventoryManager() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  const [formData, setFormData] = useState<InventoryFormData>({
    code: '',
    name: '',
    description: '',
    category: '',
    onHand: '0',
    committed: '0',
    reorderPoint: '0',
  });

  // Load inventory items
  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    queryFn: () => apiRequest('/api/inventory'),
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/inventory', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Inventory item created successfully');
      setIsCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
    onError: () => toast.error('Failed to create inventory item'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/inventory/${id}`, {
      method: 'PUT',
      body: data
    }),
    onSuccess: () => {
      toast.success('Inventory item updated successfully');
      setIsEditOpen(false);
      setEditingItem(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
    onError: () => toast.error('Failed to update inventory item'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/inventory/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      toast.success('Inventory item deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
    },
    onError: () => toast.error('Failed to delete inventory item'),
  });

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      category: '',
      onHand: '0',
      committed: '0',
      reorderPoint: '0',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.code || !formData.name || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    const submitData = {
      code: formData.code,
      name: formData.name,
      description: formData.description,
      category: formData.category,
      onHand: parseInt(formData.onHand) || 0,
      committed: parseInt(formData.committed) || 0,
      reorderPoint: parseInt(formData.reorderPoint) || 0,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      code: item.code,
      name: item.name,
      description: item.description || '',
      category: item.category,
      onHand: item.onHand.toString(),
      committed: item.committed.toString(),
      reorderPoint: item.reorderPoint.toString(),
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this inventory item?')) {
      deleteMutation.mutate(id);
    }
  };

  const getStockStatus = (item: InventoryItem) => {
    const available = item.onHand - item.committed;
    if (available <= 0) return { status: 'Out of Stock', color: 'destructive' };
    if (available <= item.reorderPoint) return { status: 'Low Stock', color: 'warning' };
    return { status: 'In Stock', color: 'success' };
  };

  const FormContent = React.memo(() => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="code">Item Code *</Label>
          <Input
            id="code"
            name="code"
            value={formData.code}
            onChange={handleChange}
            placeholder="Enter item code"
            required
          />
        </div>
        <div>
          <Label htmlFor="name">Item Name *</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Enter item name"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Enter item description"
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="category">Category *</Label>
        <Select 
          value={formData.category} 
          onValueChange={(value) => handleSelectChange('category', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="onHand">On Hand</Label>
          <Input
            id="onHand"
            name="onHand"
            type="number"
            min="0"
            value={formData.onHand}
            onChange={handleChange}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="committed">Committed</Label>
          <Input
            id="committed"
            name="committed"
            type="number"
            min="0"
            value={formData.committed}
            onChange={handleChange}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="reorderPoint">Reorder Point</Label>
          <Input
            id="reorderPoint"
            name="reorderPoint"
            type="number"
            min="0"
            value={formData.reorderPoint}
            onChange={handleChange}
            placeholder="0"
          />
        </div>
      </div>

      <div className="flex justify-end space-x-2">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => {
            if (editingItem) {
              setIsEditOpen(false);
              setEditingItem(null);
            } else {
              setIsCreateOpen(false);
            }
            resetForm();
          }}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {editingItem ? 'Update' : 'Create'} Item
        </Button>
      </div>
    </form>
  ));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Inventory Management</h2>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (open) {
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Inventory Item</DialogTitle>
            </DialogHeader>
            <FormContent />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading inventory items...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left">Code</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Name</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Category</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">On Hand</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Committed</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Available</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Status</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const available = item.onHand - item.committed;
                    const stockStatus = getStockStatus(item);
                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-2 font-medium">{item.code}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.name}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.category}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.onHand}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.committed}</td>
                        <td className="border border-gray-200 px-4 py-2">{available}</td>
                        <td className="border border-gray-200 px-4 py-2">
                          <Badge 
                            variant={stockStatus.color as 'default' | 'destructive' | 'secondary'}
                            className={
                              stockStatus.color === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                              stockStatus.color === 'success' ? 'bg-green-100 text-green-800' : ''
                            }
                          >
                            {stockStatus.status === 'Low Stock' && <AlertTriangle className="h-3 w-3 mr-1" />}
                            {stockStatus.status}
                          </Badge>
                        </td>
                        <td className="border border-gray-200 px-4 py-2">
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(item.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => {
        setIsEditOpen(open);
        if (!open) {
          setEditingItem(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
          </DialogHeader>
          <FormContent />
        </DialogContent>
      </Dialog>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Edit, Trash2, Package, DollarSign, ArrowUpDown } from 'lucide-react';

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface StockModelFormData {
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
}

export default function StockModelManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<StockModel | null>(null);
  const [modelForm, setModelForm] = useState<StockModelFormData>({
    name: '',
    displayName: '',
    price: 0,
    description: '',
    isActive: true,
    sortOrder: 0
  });

  // Fetch stock models
  const { data: stockModels = [], isLoading } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  // Create stock model mutation
  const createMutation = useMutation({
    mutationFn: (data: StockModelFormData) => apiRequest('/api/stock-models', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stock-models'] });
      toast({
        title: "Success",
        description: "Stock model created successfully",
      });
      setIsCreateModalOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to create stock model",
        variant: "destructive",
      });
    }
  });

  // Update stock model mutation
  const updateMutation = useMutation({
    mutationFn: (data: StockModelFormData) => apiRequest(`/api/stock-models/${editingModel?.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stock-models'] });
      toast({
        title: "Success",
        description: "Stock model updated successfully",
      });
      setEditingModel(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to update stock model",
        variant: "destructive",
      });
    }
  });

  // Delete stock model mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/stock-models/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stock-models'] });
      toast({
        title: "Success",
        description: "Stock model deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to delete stock model",
        variant: "destructive",
      });
    }
  });

  const resetForm = () => {
    setModelForm({
      name: '',
      displayName: '',
      price: 0,
      description: '',
      isActive: true,
      sortOrder: 0
    });
  };

  const onCreateSubmit = (data: StockModelFormData) => {
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: StockModelFormData) => {
    updateMutation.mutate(data);
  };

  const handleEdit = (stockModel: StockModel) => {
    setEditingModel(stockModel);
    setModelForm({
      name: stockModel.name,
      displayName: stockModel.displayName,
      price: stockModel.price,
      description: stockModel.description || '',
      isActive: stockModel.isActive,
      sortOrder: stockModel.sortOrder
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this stock model?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingModel) {
      onEditSubmit(modelForm);
    } else {
      onCreateSubmit(modelForm);
    }
  };

  const handleCancel = () => {
    setEditingModel(null);
    setIsCreateModalOpen(false);
    resetForm();
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading stock models...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Stock Model Manager</h2>
          <p className="text-gray-600">Manage your stock models, prices, and descriptions</p>
        </div>
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Stock Model
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Stock Model</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Internal Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={modelForm.name}
                    onChange={(e) => setModelForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., cf_stock_model_1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    type="text"
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="e.g., Carbon Fiber Stock Model"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Price ($)</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={modelForm.price}
                    onChange={(e) => setModelForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sortOrder">Sort Order</Label>
                  <Input
                    id="sortOrder"
                    type="number"
                    min="0"
                    value={modelForm.sortOrder}
                    onChange={(e) => setModelForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={modelForm.description}
                  onChange={(e) => setModelForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description..."
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={modelForm.isActive}
                  onCheckedChange={(checked) => setModelForm(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="isActive">Active</Label>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Stock Model'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {stockModels.map((stockModel) => (
          <Card key={stockModel.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-blue-600" />
                  <div>
                    <CardTitle className="text-lg">{stockModel.displayName}</CardTitle>
                    <p className="text-sm text-gray-600">{stockModel.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={stockModel.isActive ? "default" : "secondary"}>
                    {stockModel.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <div className="flex items-center gap-1 text-green-600 font-semibold">
                    <DollarSign className="h-4 w-4" />
                    {stockModel.price.toFixed(2)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stockModel.description && (
                  <p className="text-sm text-gray-700">{stockModel.description}</p>
                )}
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <ArrowUpDown className="h-4 w-4" />
                    Sort: {stockModel.sortOrder}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(stockModel)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(stockModel.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {stockModels.length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No stock models found</p>
              <p className="text-sm text-gray-400">Click "Add Stock Model" to create your first model</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Modal */}
      {editingModel && (
        <Dialog open={!!editingModel} onOpenChange={() => setEditingModel(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Stock Model</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Internal Name</Label>
                  <Input
                    id="edit-name"
                    type="text"
                    value={modelForm.name}
                    onChange={(e) => setModelForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., cf_stock_model_1"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-displayName">Display Name</Label>
                  <Input
                    id="edit-displayName"
                    type="text"
                    value={modelForm.displayName}
                    onChange={(e) => setModelForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="e.g., Carbon Fiber Stock Model"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-price">Price ($)</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={modelForm.price}
                    onChange={(e) => setModelForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sortOrder">Sort Order</Label>
                  <Input
                    id="edit-sortOrder"
                    type="number"
                    min="0"
                    value={modelForm.sortOrder}
                    onChange={(e) => setModelForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={modelForm.description}
                  onChange={(e) => setModelForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description..."
                />
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  checked={modelForm.isActive}
                  onCheckedChange={(checked) => setModelForm(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="edit-isActive">Active</Label>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Updating...' : 'Update Stock Model'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
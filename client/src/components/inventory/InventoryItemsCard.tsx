import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Download, Upload, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import type { InventoryItem } from '@shared/schema';

interface InventoryFormData {
  agPartNumber: string;
  name: string;
  type: string;
  source: string;
  supplierPartNumber: string;
  costPer: string;
  orderDate: string;
  department: string;
  secondarySource: string;
  notes: string;
}

// Move FormContent outside to prevent recreation on each render
const InventoryForm = ({ 
  formData, 
  onSubmit, 
  onChange, 
  editingItem, 
  isCreatePending, 
  isUpdatePending,
  onCancel 
}: {
  formData: InventoryFormData;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSelectChange: (name: string, value: string) => void;
  editingItem: InventoryItem | null;
  isCreatePending: boolean;
  isUpdatePending: boolean;
  onCancel: () => void;
}) => (
  <form onSubmit={onSubmit} className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="agPartNumber">AG Part# *</Label>
        <Input
          id="agPartNumber"
          name="agPartNumber"
          value={formData.agPartNumber}
          onChange={onChange}
          placeholder="Enter AG Part#"
          required
        />
      </div>
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          name="name"
          value={formData.name}
          onChange={onChange}
          placeholder="Enter item name"
          required
        />
      </div>
      <div>
        <Label htmlFor="type">Type *</Label>
        <Select value={formData.type} onValueChange={(value) => onSelectChange('type', value)}>
          <SelectTrigger data-testid="select-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Purchased">Purchased</SelectItem>
            <SelectItem value="Manufactured">Manufactured</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="source">Source</Label>
        <Input
          id="source"
          name="source"
          value={formData.source}
          onChange={onChange}
          placeholder="Enter source"
        />
      </div>
      <div>
        <Label htmlFor="supplierPartNumber">Supplier Part #</Label>
        <Input
          id="supplierPartNumber"
          name="supplierPartNumber"
          value={formData.supplierPartNumber}
          onChange={onChange}
          placeholder="Enter supplier part #"
        />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="costPer">Cost per</Label>
        <Input
          id="costPer"
          name="costPer"
          type="number"
          step="0.01"
          value={formData.costPer}
          onChange={onChange}
          placeholder="0.00"
        />
      </div>
      <div>
        <Label htmlFor="orderDate">Order Date</Label>
        <Input
          id="orderDate"
          name="orderDate"
          type="date"
          value={formData.orderDate}
          onChange={onChange}
        />
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <Label htmlFor="department">Dept.</Label>
        <Input
          id="department"
          name="department"
          value={formData.department}
          onChange={onChange}
          placeholder="Enter department"
        />
      </div>
      <div>
        <Label htmlFor="secondarySource">Secondary Source</Label>
        <Input
          id="secondarySource"
          name="secondarySource"
          value={formData.secondarySource}
          onChange={onChange}
          placeholder="Enter secondary source"
        />
      </div>
    </div>

    <div>
      <Label htmlFor="notes">Notes</Label>
      <Textarea
        id="notes"
        name="notes"
        value={formData.notes}
        onChange={onChange}
        placeholder="Enter notes"
        rows={3}
      />
    </div>

    <div className="flex justify-end space-x-2">
      <Button 
        type="button" 
        variant="outline" 
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button 
        type="submit" 
        disabled={isCreatePending || isUpdatePending}
      >
        {editingItem ? 'Update' : 'Create'} Item
      </Button>
    </div>
  </form>
);

export default function InventoryItemsCard() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<InventoryFormData>({
    agPartNumber: '',
    name: '',
    source: '',
    supplierPartNumber: '',
    costPer: '',
    orderDate: '',
    department: '',
    secondarySource: '',
    notes: ''
  });

  // Load inventory items
  const { data: allItems = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
    queryFn: () => apiRequest('/api/enhanced/inventory/items'),
  });

  // Filter items based on search term
  const items = allItems.filter(item => {
    if (!searchTerm.trim()) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      item.agPartNumber.toLowerCase().includes(searchLower) ||
      item.name.toLowerCase().includes(searchLower) ||
      (item.source && item.source.toLowerCase().includes(searchLower)) ||
      (item.supplierPartNumber && item.supplierPartNumber.toLowerCase().includes(searchLower)) ||
      (item.department && item.department.toLowerCase().includes(searchLower)) ||
      (item.secondarySource && item.secondarySource.toLowerCase().includes(searchLower)) ||
      (item.notes && item.notes.toLowerCase().includes(searchLower))
    );
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/enhanced/inventory/items', {
      method: 'POST',
      body: data
    }),
    onSuccess: () => {
      toast.success('Inventory item created successfully');
      setIsCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced/inventory/items'] });
    },
    onError: () => toast.error('Failed to create inventory item'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/enhanced/inventory/items/${id}`, {
      method: 'PUT',
      body: data
    }),
    onSuccess: () => {
      toast.success('Inventory item updated successfully');
      setIsEditOpen(false);
      setEditingItem(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced/inventory/items'] });
    },
    onError: () => toast.error('Failed to update inventory item'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/enhanced/inventory/items/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      toast.success('Inventory item deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced/inventory/items'] });
    },
    onError: () => toast.error('Failed to delete inventory item'),
  });

  // Export CSV functionality
  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/enhanced/inventory/export/csv');
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `inventory_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Inventory exported successfully');
    } catch (error) {
      console.error('CSV export error:', error);
      toast.error('Failed to export inventory');
    }
  };

  // Import CSV functionality
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const handleImportCSV = async () => {
    if (!importFile) {
      toast.error('Please select a CSV file');
      return;
    }

    try {
      const csvData = await importFile.text();
      
      const response = await apiRequest('/api/enhanced/inventory/import/csv', {
        method: 'POST',
        body: { csvData }
      });

      if (response.success) {
        const message = `Successfully imported ${response.importedCount} items`;
        toast.success(message);
        
        if (response.errors && response.errors.length > 0) {
          console.warn('Import errors:', response.errors);
          const errorMessage = response.errors.slice(0, 3).join(', ') + (response.errors.length > 3 ? '...' : '');
          toast.error(`${response.errors.length} rows had errors: ${errorMessage}`);
        }
        
        setIsImportDialogOpen(false);
        setImportFile(null);
        const fileInput = document.getElementById('csvFile') as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        queryClient.invalidateQueries({ queryKey: ['/api/enhanced/inventory/items'] });
      } else {
        toast.error('Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setFormData({
      agPartNumber: '',
      name: '',
      type: 'Purchased',
      source: '',
      supplierPartNumber: '',
      costPer: '',
      orderDate: '',
      department: '',
      secondarySource: '',
      notes: ''
    });
  };

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSelectChange = useCallback((name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.agPartNumber || !formData.name) {
      toast.error('Please fill in AG Part# and Name (required fields)');
      return;
    }

    const submitData = {
      agPartNumber: formData.agPartNumber,
      name: formData.name,
      type: formData.type || 'Purchased',
      source: formData.source || null,
      supplierPartNumber: formData.supplierPartNumber || null,
      costPer: formData.costPer ? parseFloat(formData.costPer) : null,
      orderDate: formData.orderDate || null,
      department: formData.department || null,
      secondarySource: formData.secondarySource || null,
      notes: formData.notes || null,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  }, [formData, editingItem, updateMutation, createMutation]);

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      agPartNumber: item.agPartNumber,
      name: item.name,
      type: item.type || 'Purchased',
      source: item.source || '',
      supplierPartNumber: item.supplierPartNumber || '',
      costPer: item.costPer ? item.costPer.toString() : '',
      orderDate: item.orderDate ? new Date(item.orderDate).toISOString().split('T')[0] : '',
      department: item.department || '',
      secondarySource: item.secondarySource || '',
      notes: item.notes || '',
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this inventory item?')) {
      deleteMutation.mutate(id);
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Inventory Items</h3>
        <div className="flex items-center gap-2">
          {/* Export Button */}
          <Button variant="outline" onClick={handleExportCSV} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          
          {/* Import Button */}
          <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          
          {/* Add Item Button */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
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
              <InventoryForm
                formData={formData}
                onSubmit={handleSubmit}
                onChange={handleChange}
                onSelectChange={handleSelectChange}
                editingItem={editingItem}
                isCreatePending={createMutation.isPending}
                isUpdatePending={updateMutation.isPending}
                onCancel={() => {
                  setIsCreateOpen(false);
                  resetForm();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Import CSV Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import CSV File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="csvFile">Select CSV File</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="mt-2"
              />
            </div>
            {importFile && (
              <p className="text-sm text-gray-600">
                Selected file: {importFile.name}
              </p>
            )}
            <div className="text-sm text-gray-500">
              Expected columns: AG Part#, Name, Source, Supplier Part #, Cost per, Order Date, Dept., Secondary Source, Notes
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => {
                setIsImportDialogOpen(false);
                setImportFile(null);
                const fileInput = document.getElementById('csvFile') as HTMLInputElement;
                if (fileInput) {
                  fileInput.value = '';
                }
              }}>
                Cancel
              </Button>
              <Button onClick={handleImportCSV} disabled={!importFile}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search Field */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Input
            placeholder="Search by AG Part #, Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Inventory Items Table */}
      {isLoading ? (
        <div className="text-center py-8">Loading inventory items...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">AG Part#</th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">Name</th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">Source</th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">Supplier Part #</th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">Cost per</th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">Notes</th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 font-medium">{item.agPartNumber}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">{item.name}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">{item.source || '-'}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">{item.supplierPartNumber || '-'}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">{item.costPer ? `$${item.costPer.toFixed(2)}` : '-'}</td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    <div className="max-w-xs truncate" title={item.notes || 'No notes'}>
                      {item.notes || '-'}
                    </div>
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(item)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        disabled={deleteMutation.isPending}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
          <InventoryForm
            formData={formData}
            onSubmit={handleSubmit}
            onChange={handleChange}
            onSelectChange={handleSelectChange}
            editingItem={editingItem}
            isCreatePending={createMutation.isPending}
            isUpdatePending={updateMutation.isPending}
            onCancel={() => {
              setIsEditOpen(false);
              setEditingItem(null);
              resetForm();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
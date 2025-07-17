import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Package, Download, Upload, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import type { InventoryItem } from '@shared/schema';

const categories = [
  'Raw Materials',
  'Components',
  'Barrels',
  'Stocks',
  'Triggers',
  'Scopes',
  'Accessories',
  'Hardware',
  'Springs',
  'Screws',
  'Bolts',
  'Nuts',
  'Washers',
  'Pins',
  'Tools',
  'Lubricants',
  'Cleaning Supplies',
  'Safety Equipment',
  'Finished Goods',
  'Other'
];

interface InventoryFormData {
  agPartNumber: string;
  name: string;
  category: string;
  source: string;
  supplierPartNumber: string;
  costPer: string;
  orderDate: string;
  department: string;
  secondarySource: string;
  notes: string;
}

export default function InventoryManager() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [viewingNotes, setViewingNotes] = useState<string>('');
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);


  // Export CSV functionality
  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/inventory/export/csv');
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
      const response = await apiRequest('/api/inventory/import/csv', {
        method: 'POST',
        body: { csvData }
      });

      if (response.success) {
        toast.success(`Successfully imported ${response.importedCount} items`);
        if (response.errors.length > 0) {
          console.warn('Import errors:', response.errors);
          toast.error(`${response.errors.length} rows had errors - check console for details`);
        }
        setIsImportDialogOpen(false);
        setImportFile(null);
        queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      } else {
        toast.error('Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import CSV file');
    }
  };

  // View notes functionality
  const handleViewNotes = (notes: string) => {
    setViewingNotes(notes || 'No notes available');
    setIsNotesDialogOpen(true);
  };


  
  const [formData, setFormData] = useState<InventoryFormData>({
    agPartNumber: '',
    name: '',
    category: '',
    source: '',
    supplierPartNumber: '',
    costPer: '',
    orderDate: '',
    department: '',
    secondarySource: '',
    notes: ''
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
      agPartNumber: '',
      name: '',
      category: '',
      source: '',
      supplierPartNumber: '',
      costPer: '',
      orderDate: '',
      department: '',
      secondarySource: '',
      notes: ''
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    // For number inputs, allow empty string and any valid number input
    if (e.target.type === 'number') {
      setFormData(prev => ({ ...prev, [name]: value }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.agPartNumber || !formData.name) {
      toast.error('Please fill in AG Part# and Name (required fields)');
      return;
    }

    const submitData = {
      agPartNumber: formData.agPartNumber,
      name: formData.name,
      category: formData.category || null,
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
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      agPartNumber: item.agPartNumber,
      name: item.name,
      category: item.category || '',
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



  const FormContent = React.memo(() => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="agPartNumber">AG Part# *</Label>
          <Input
            id="agPartNumber"
            name="agPartNumber"
            value={formData.agPartNumber}
            onChange={handleChange}
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
            onChange={handleChange}
            placeholder="Enter item name"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="source">Source</Label>
          <Input
            id="source"
            name="source"
            value={formData.source}
            onChange={handleChange}
            placeholder="Enter source"
          />
        </div>
        <div>
          <Label htmlFor="supplierPartNumber">Supplier Part #</Label>
          <Input
            id="supplierPartNumber"
            name="supplierPartNumber"
            value={formData.supplierPartNumber}
            onChange={handleChange}
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
            onChange={handleChange}
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
            onChange={handleChange}
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
            onChange={handleChange}
            placeholder="Enter department"
          />
        </div>
        <div>
          <Label htmlFor="secondarySource">Secondary Source</Label>
          <Input
            id="secondarySource"
            name="secondarySource"
            value={formData.secondarySource}
            onChange={handleChange}
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
          onChange={handleChange}
          placeholder="Enter notes"
          rows={3}
        />
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
              Expected columns: AG Part#, Name, Category, Source, Supplier Part #, Cost per, Order Date, Dept., Secondary Source, Notes
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleImportCSV} disabled={!importFile}>
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes Viewing Dialog */}
      <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Item Notes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-64 overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap">{viewingNotes}</p>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setIsNotesDialogOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                    <th className="border border-gray-200 px-4 py-2 text-left">AG Part#</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Name</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Category</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Source</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Supplier Part #</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Cost per</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Dept.</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Secondary Source</th>
                    <th className="border border-gray-200 px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {                    
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-2 font-medium">{item.agPartNumber}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.name}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.category || '-'}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.source || '-'}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.supplierPartNumber || '-'}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.costPer ? `$${item.costPer.toFixed(2)}` : '-'}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.department || '-'}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.secondarySource || '-'}</td>
                        <td className="border border-gray-200 px-4 py-2">
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewNotes(item.notes || '')}
                              title="View Notes"
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
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
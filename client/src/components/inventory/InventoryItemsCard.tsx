import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Download, Upload, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import type { InventoryItem } from '@shared/schema';

interface InventoryFormData {
  agPartNumber: string;
  sku: string;
  name: string;
  type: string;
  source: string;
  supplierPartNumber: string;
  secondarySupplierPartNumber: string;
  costPer: string;
  purchaseUnit: string;
  usageQuantityPerUnit: string;
  usageUnit: string;
  cogsPerUnit: string;
  orderDate: string;
  department: string;
  secondarySource: string;
  notes: string;
  isStockItem: boolean;
  utilizedInPL1: boolean;
  utilizedInPL2: boolean;
  utilizedInFacilities: boolean;
  utilizedInAdmin: boolean;
  utilizedInServices: boolean;
}

const InventoryForm = ({
  formData,
  onSubmit,
  onChange,
  onSelectChange,
  onCheckboxChange,
  editingItem,
  isCreatePending,
  isUpdatePending,
  onCancel,
}: {
  formData: InventoryFormData;
  onSubmit: (e: React.FormEvent) => void;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => void;
  onSelectChange: (name: string, value: string) => void;
  onCheckboxChange: (name: string, checked: boolean) => void;
  editingItem: InventoryItem | null;
  isCreatePending: boolean;
  isUpdatePending: boolean;
  onCancel: () => void;
}) => (
  <form onSubmit={onSubmit} className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
    {/* Basic Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Basic Information</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="agPartNumber">AG Part# *</Label>
          <Input
            id="agPartNumber"
            name="agPartNumber"
            value={formData.agPartNumber}
            onChange={onChange}
            placeholder="Enter AG Part#"
            data-testid="input-agPartNumber"
            required
          />
        </div>
        <div>
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            name="sku"
            value={formData.sku}
            onChange={onChange}
            placeholder="Enter SKU (informational)"
            data-testid="input-sku"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={onChange}
            placeholder="Enter item name"
            data-testid="input-name"
            required
          />
        </div>
        <div>
          <Label htmlFor="type">Type</Label>
          <Select
            value={formData.type}
            onValueChange={(value) => onSelectChange('type', value)}
          >
            <SelectTrigger data-testid="select-type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Purchased">Purchased</SelectItem>
              <SelectItem value="Manufactured">Manufactured</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2 pt-6">
          <Checkbox
            id="isStockItem"
            checked={formData.isStockItem}
            onCheckedChange={(checked) => onCheckboxChange('isStockItem', checked as boolean)}
            data-testid="checkbox-isStockItem"
          />
          <Label htmlFor="isStockItem" className="cursor-pointer">
            Stock Item
          </Label>
        </div>
      </div>
    </div>

    {/* Supplier Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Supplier Information</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="source">Source</Label>
          <Input
            id="source"
            name="source"
            value={formData.source}
            onChange={onChange}
            placeholder="Enter source"
            data-testid="input-source"
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
            data-testid="input-secondarySource"
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
            data-testid="input-supplierPartNumber"
          />
        </div>
        <div>
          <Label htmlFor="secondarySupplierPartNumber">Secondary Supplier Part #</Label>
          <Input
            id="secondarySupplierPartNumber"
            name="secondarySupplierPartNumber"
            value={formData.secondarySupplierPartNumber}
            onChange={onChange}
            placeholder="Enter secondary supplier part #"
            data-testid="input-secondarySupplierPartNumber"
          />
        </div>
      </div>
    </div>

    {/* Cost & Quantity Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Cost & Quantity (MRP/COGS)</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="costPer">Purchase Cost ($)</Label>
          <Input
            id="costPer"
            name="costPer"
            type="number"
            step="0.01"
            value={formData.costPer}
            onChange={onChange}
            placeholder="491.20"
            data-testid="input-costPer"
          />
          <p className="text-xs text-gray-500 mt-1">Cost from vendor (e.g., $491.20 for 80lb box)</p>
        </div>
        <div>
          <Label htmlFor="purchaseUnit">Purchase Unit</Label>
          <Input
            id="purchaseUnit"
            name="purchaseUnit"
            value={formData.purchaseUnit}
            onChange={onChange}
            placeholder="80 lb box"
            data-testid="input-purchaseUnit"
          />
          <p className="text-xs text-gray-500 mt-1">What you're buying (e.g., "80 lb box", "20/carton")</p>
        </div>
        <div>
          <Label htmlFor="usageQuantityPerUnit">Usage Qty per Unit</Label>
          <Input
            id="usageQuantityPerUnit"
            name="usageQuantityPerUnit"
            type="number"
            step="0.01"
            value={formData.usageQuantityPerUnit}
            onChange={onChange}
            placeholder="50"
            data-testid="input-usageQuantityPerUnit"
          />
          <p className="text-xs text-gray-500 mt-1">Amount used per manufactured unit (e.g., 50)</p>
        </div>
        <div>
          <Label htmlFor="usageUnit">Usage Unit</Label>
          <Input
            id="usageUnit"
            name="usageUnit"
            value={formData.usageUnit}
            onChange={onChange}
            placeholder="grams"
            data-testid="input-usageUnit"
          />
          <p className="text-xs text-gray-500 mt-1">Unit of measurement (e.g., "grams", "each")</p>
        </div>
        <div>
          <Label htmlFor="cogsPerUnit">COGS per Unit ($)</Label>
          <Input
            id="cogsPerUnit"
            name="cogsPerUnit"
            type="number"
            step="0.01"
            value={formData.cogsPerUnit}
            onChange={onChange}
            placeholder="0.68"
            data-testid="input-cogsPerUnit"
          />
          <p className="text-xs text-gray-500 mt-1">Calculated or manual COGS per manufactured unit</p>
        </div>
        <div>
          <Label htmlFor="orderDate">Order Date</Label>
          <Input
            id="orderDate"
            name="orderDate"
            type="date"
            value={formData.orderDate}
            onChange={onChange}
            data-testid="input-orderDate"
          />
        </div>
      </div>
    </div>

    {/* Production Line Utilization Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Production Line Utilization</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInPL1"
            checked={formData.utilizedInPL1}
            onCheckedChange={(checked) => onCheckboxChange('utilizedInPL1', checked as boolean)}
            data-testid="checkbox-utilizedInPL1"
          />
          <Label htmlFor="utilizedInPL1" className="cursor-pointer">
            PL1
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInPL2"
            checked={formData.utilizedInPL2}
            onCheckedChange={(checked) => onCheckboxChange('utilizedInPL2', checked as boolean)}
            data-testid="checkbox-utilizedInPL2"
          />
          <Label htmlFor="utilizedInPL2" className="cursor-pointer">
            PL2
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInFacilities"
            checked={formData.utilizedInFacilities}
            onCheckedChange={(checked) => onCheckboxChange('utilizedInFacilities', checked as boolean)}
            data-testid="checkbox-utilizedInFacilities"
          />
          <Label htmlFor="utilizedInFacilities" className="cursor-pointer">
            Facilities
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInAdmin"
            checked={formData.utilizedInAdmin}
            onCheckedChange={(checked) => onCheckboxChange('utilizedInAdmin', checked as boolean)}
            data-testid="checkbox-utilizedInAdmin"
          />
          <Label htmlFor="utilizedInAdmin" className="cursor-pointer">
            Admin
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id="utilizedInServices"
            checked={formData.utilizedInServices}
            onCheckedChange={(checked) => onCheckboxChange('utilizedInServices', checked as boolean)}
            data-testid="checkbox-utilizedInServices"
          />
          <Label htmlFor="utilizedInServices" className="cursor-pointer">
            Services
          </Label>
        </div>
      </div>
    </div>

    {/* Additional Information Section */}
    <div className="space-y-4">
      <h4 className="text-md font-semibold border-b pb-2">Additional Information</h4>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <Label htmlFor="department">Department</Label>
          <Input
            id="department"
            name="department"
            value={formData.department}
            onChange={onChange}
            placeholder="Enter department"
            data-testid="input-department"
          />
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
            data-testid="textarea-notes"
          />
        </div>
      </div>
    </div>

    <div className="flex justify-end space-x-2 pt-4 border-t">
      <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
        Cancel
      </Button>
      <Button type="submit" disabled={isCreatePending || isUpdatePending} data-testid="button-submit">
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
    sku: '',
    name: '',
    type: 'Purchased',
    source: '',
    supplierPartNumber: '',
    secondarySupplierPartNumber: '',
    costPer: '',
    purchaseUnit: '',
    usageQuantityPerUnit: '',
    usageUnit: '',
    cogsPerUnit: '',
    orderDate: '',
    department: '',
    secondarySource: '',
    notes: '',
    isStockItem: false,
    utilizedInPL1: false,
    utilizedInPL2: false,
    utilizedInFacilities: false,
    utilizedInAdmin: false,
    utilizedInServices: false,
  });

  const { data: allItems = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items'],
    queryFn: () => apiRequest('/api/enhanced/inventory/items'),
  });

  const items = Array.isArray(allItems)
    ? allItems.filter((item) => {
        if (!searchTerm.trim()) return true;
        const searchLower = searchTerm.toLowerCase();
        return (
          item.agPartNumber.toLowerCase().includes(searchLower) ||
          item.name.toLowerCase().includes(searchLower) ||
          (item.sku && item.sku.toLowerCase().includes(searchLower)) ||
          (item.source && item.source.toLowerCase().includes(searchLower)) ||
          (item.supplierPartNumber &&
            item.supplierPartNumber.toLowerCase().includes(searchLower)) ||
          (item.department &&
            item.department.toLowerCase().includes(searchLower)) ||
          (item.notes && item.notes.toLowerCase().includes(searchLower))
        );
      })
    : [];

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/enhanced/inventory/items', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      toast.success('Inventory item created successfully');
      setIsCreateOpen(false);
      resetForm();
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => toast.error('Failed to create inventory item'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest(`/api/enhanced/inventory/items/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      toast.success('Inventory item updated successfully');
      setIsEditOpen(false);
      setEditingItem(null);
      resetForm();
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => toast.error('Failed to update inventory item'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/enhanced/inventory/items/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast.success('Inventory item deleted successfully');
      queryClient.invalidateQueries({
        queryKey: ['/api/enhanced/inventory/items'],
      });
    },
    onError: () => toast.error('Failed to delete inventory item'),
  });

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
        body: { csvData },
      });

      if (response.success) {
        const message = `Successfully imported ${response.importedCount} items`;
        toast.success(message);

        if (response.errors && response.errors.length > 0) {
          console.warn('Import errors:', response.errors);
          const errorMessage =
            response.errors.slice(0, 3).join(', ') +
            (response.errors.length > 3 ? '...' : '');
          toast.error(
            `${response.errors.length} rows had errors: ${errorMessage}`
          );
        }

        setIsImportDialogOpen(false);
        setImportFile(null);
        const fileInput = document.getElementById(
          'csvFile'
        ) as HTMLInputElement;
        if (fileInput) {
          fileInput.value = '';
        }
        queryClient.invalidateQueries({
          queryKey: ['/api/enhanced/inventory/items'],
        });
      } else {
        toast.error('Import failed');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error(
        `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const resetForm = () => {
    setFormData({
      agPartNumber: '',
      sku: '',
      name: '',
      type: 'Purchased',
      source: '',
      supplierPartNumber: '',
      secondarySupplierPartNumber: '',
      costPer: '',
      purchaseUnit: '',
      usageQuantityPerUnit: '',
      usageUnit: '',
      cogsPerUnit: '',
      orderDate: '',
      department: '',
      secondarySource: '',
      notes: '',
      isStockItem: false,
      utilizedInPL1: false,
      utilizedInPL2: false,
      utilizedInFacilities: false,
      utilizedInAdmin: false,
      utilizedInServices: false,
    });
  };

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleSelectChange = useCallback((name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleCheckboxChange = useCallback((name: string, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.agPartNumber || !formData.name) {
        toast.error('Please fill in AG Part# and Name (required fields)');
        return;
      }

      const submitData = {
        agPartNumber: formData.agPartNumber,
        sku: formData.sku || null,
        name: formData.name,
        type: formData.type || 'Purchased',
        source: formData.source || null,
        supplierPartNumber: formData.supplierPartNumber || null,
        secondarySupplierPartNumber: formData.secondarySupplierPartNumber || null,
        costPer: formData.costPer ? parseFloat(formData.costPer) : null,
        purchaseUnit: formData.purchaseUnit || null,
        usageQuantityPerUnit: formData.usageQuantityPerUnit ? parseFloat(formData.usageQuantityPerUnit) : null,
        usageUnit: formData.usageUnit || null,
        cogsPerUnit: formData.cogsPerUnit ? parseFloat(formData.cogsPerUnit) : null,
        orderDate: formData.orderDate || null,
        department: formData.department || null,
        secondarySource: formData.secondarySource || null,
        notes: formData.notes || null,
        isStockItem: formData.isStockItem,
        utilizedInPL1: formData.utilizedInPL1,
        utilizedInPL2: formData.utilizedInPL2,
        utilizedInFacilities: formData.utilizedInFacilities,
        utilizedInAdmin: formData.utilizedInAdmin,
        utilizedInServices: formData.utilizedInServices,
      };

      if (editingItem) {
        updateMutation.mutate({ id: editingItem.id, data: submitData });
      } else {
        createMutation.mutate(submitData);
      }
    },
    [formData, editingItem, updateMutation, createMutation]
  );

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      agPartNumber: item.agPartNumber,
      sku: item.sku || '',
      name: item.name,
      type: item.type || 'Purchased',
      source: item.source || '',
      supplierPartNumber: item.supplierPartNumber || '',
      secondarySupplierPartNumber: item.secondarySupplierPartNumber || '',
      costPer: item.costPer ? item.costPer.toString() : '',
      purchaseUnit: item.purchaseUnit || '',
      usageQuantityPerUnit: item.usageQuantityPerUnit ? item.usageQuantityPerUnit.toString() : '',
      usageUnit: item.usageUnit || '',
      cogsPerUnit: item.cogsPerUnit ? item.cogsPerUnit.toString() : '',
      orderDate: item.orderDate
        ? new Date(item.orderDate).toISOString().split('T')[0]
        : '',
      department: item.department || '',
      secondarySource: item.secondarySource || '',
      notes: item.notes || '',
      isStockItem: item.isStockItem || false,
      utilizedInPL1: item.utilizedInPL1 || false,
      utilizedInPL2: item.utilizedInPL2 || false,
      utilizedInFacilities: item.utilizedInFacilities || false,
      utilizedInAdmin: item.utilizedInAdmin || false,
      utilizedInServices: item.utilizedInServices || false,
    });
    setIsEditOpen(true);
  };

  const handleDelete = (id: number) => {
    if (
      window.confirm('Are you sure you want to delete this inventory item?')
    ) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Inventory Items</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="flex items-center gap-2"
            data-testid="button-export"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsImportDialogOpen(true)}
            className="flex items-center gap-2"
            data-testid="button-import"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-item">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Create New Inventory Item</DialogTitle>
              </DialogHeader>
              <InventoryForm
                formData={formData}
                onSubmit={handleSubmit}
                onChange={handleChange}
                onSelectChange={handleSelectChange}
                onCheckboxChange={handleCheckboxChange}
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

      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Parts List CSV</DialogTitle>
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
                data-testid="input-csv-file"
              />
            </div>
            {importFile && (
              <p className="text-sm text-gray-600">
                Selected file: {importFile.name}
              </p>
            )}
            <div className="text-sm text-gray-500 space-y-1">
              <p className="font-semibold">Expected columns:</p>
              <p>AG Part#, SKU, Name, Source, Supplier Part #, Cost per, Order Date, Notes, Utilized, Secondary Source, Supplier Part #</p>
              <p className="text-xs italic mt-2">
                The "Utilized" column will be parsed for PL1, PL2, Facilities, Admin, Services
              </p>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsImportDialogOpen(false);
                  setImportFile(null);
                  const fileInput = document.getElementById(
                    'csvFile'
                  ) as HTMLInputElement;
                  if (fileInput) {
                    fileInput.value = '';
                  }
                }}
                data-testid="button-cancel-import"
              >
                Cancel
              </Button>
              <Button onClick={handleImportCSV} disabled={!importFile} data-testid="button-confirm-import">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Input
            placeholder="Search by AG Part #, SKU, Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading inventory items...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No inventory items found. {searchTerm && 'Try a different search term or '}Import your parts list to get started.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-200 dark:border-gray-700">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  AG Part#
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  SKU
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Name
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Source
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Cost per
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Utilized In
                </th>
                <th className="border border-gray-200 dark:border-gray-700 px-4 py-2 text-left">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                  data-testid={`row-item-${item.id}`}
                >
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2 font-medium">
                    {item.agPartNumber}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    {item.sku || '-'}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    {item.name}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    {item.source || '-'}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    {item.costPer ? `$${item.costPer.toFixed(2)}` : '-'}
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {item.utilizedInPL1 && (
                        <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 rounded">
                          PL1
                        </span>
                      )}
                      {item.utilizedInPL2 && (
                        <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 rounded">
                          PL2
                        </span>
                      )}
                      {item.utilizedInFacilities && (
                        <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100 rounded">
                          Facilities
                        </span>
                      )}
                      {item.utilizedInAdmin && (
                        <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded">
                          Admin
                        </span>
                      )}
                      {item.utilizedInServices && (
                        <span className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 rounded">
                          Services
                        </span>
                      )}
                      {!item.utilizedInPL1 && !item.utilizedInPL2 && !item.utilizedInFacilities && !item.utilizedInAdmin && !item.utilizedInServices && '-'}
                    </div>
                  </td>
                  <td className="border border-gray-200 dark:border-gray-700 px-4 py-2">
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(item)}
                        title="Edit"
                        data-testid={`button-edit-${item.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        disabled={deleteMutation.isPending}
                        title="Delete"
                        data-testid={`button-delete-${item.id}`}
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

      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditingItem(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Inventory Item</DialogTitle>
          </DialogHeader>
          <InventoryForm
            formData={formData}
            onSubmit={handleSubmit}
            onChange={handleChange}
            onSelectChange={handleSelectChange}
            onCheckboxChange={handleCheckboxChange}
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

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Pencil, Trash2, Plus, Eye, Package, Search, TrendingUp, ShoppingCart, Calendar as CalendarIcon, Building2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import VendorPOItemSelector from './VendorPOItemSelector';

// Types based on our schema
type VendorPO = {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName?: string; // From join
  status: 'Draft' | 'Sent' | 'Partially Received' | 'Fully Received' | 'Cancelled';
  expectedDeliveryDate?: string;
  shipVia?: string;
  notes?: string;
  totalCost: number;
  barcode: string;
  createdAt: string;
  updatedAt: string;
};

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

type CreateVendorPOData = {
  vendorId: number;
  expectedDeliveryDate?: string;
  shipVia?: string;
  notes?: string;
};

// Vendor PO line items display component
function VendorPOItemsDisplay({ vendorPoId }: { vendorPoId: number }) {
  const { data: items = [], isLoading } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`)
  });

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading) {
    return <span className="text-gray-500">Loading...</span>;
  }

  if (items.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">
        No items added yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 mb-2">
        <Package className="w-4 h-4 text-blue-600" />
        <span className="font-medium text-blue-600">{totalQuantity.toFixed(2)} total qty</span>
      </div>
      <div className="space-y-1">
        {items.slice(0, 3).map((item) => (
          <div key={item.id} className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {item.agPartNumber && (
                    <span className="text-blue-600">#{item.agPartNumber}</span>
                  )} {item.description}
                </div>
                {item.vendorPartNumber && (
                  <div className="text-gray-500 text-xs truncate">
                    Vendor: {item.vendorPartNumber}
                  </div>
                )}
              </div>
              <div className="text-right ml-2 flex-shrink-0">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {item.quantity.toFixed(2)} {item.uom}
                </div>
                <div className="text-gray-500 text-xs">
                  ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ea
                </div>
              </div>
            </div>
          </div>
        ))}
        {items.length > 3 && (
          <div className="text-xs text-gray-500 italic">
            ...and {items.length - 3} more items
          </div>
        )}
      </div>
    </div>
  );
}

// Status color helper
function getStatusColor(status: VendorPO['status']) {
  switch (status) {
    case 'Draft': return 'bg-gray-100 text-gray-800';
    case 'Sent': return 'bg-blue-100 text-blue-800';
    case 'Partially Received': return 'bg-yellow-100 text-yellow-800';
    case 'Fully Received': return 'bg-green-100 text-green-800';
    case 'Cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

// Vendor PO card component
function VendorPOCard({ vendorPo, onEdit, onDelete, onViewItems }: {
  vendorPo: VendorPO;
  onEdit: (vendorPo: VendorPO) => void;
  onDelete: (id: number) => void;
  onViewItems: (vendorPo: VendorPO) => void;
}) {
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-vendor-po-${vendorPo.id}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg" data-testid={`text-po-number-${vendorPo.id}`}>
              {vendorPo.poNumber}
            </CardTitle>
            <CardDescription className="mt-1" data-testid={`text-vendor-name-${vendorPo.id}`}>
              <div className="flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                {vendorPo.vendorName || `Vendor ID: ${vendorPo.vendorId}`}
              </div>
            </CardDescription>
            <div className="mt-3">
              <VendorPOItemsDisplay vendorPoId={vendorPo.id} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(vendorPo.status)} data-testid={`status-${vendorPo.id}`}>
              {vendorPo.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="text-gray-500">Total Cost:</span>
            <p className="font-medium" data-testid={`text-total-cost-${vendorPo.id}`}>
              ${vendorPo.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          {vendorPo.expectedDeliveryDate && (
            <div>
              <span className="text-gray-500">Expected Delivery:</span>
              <p className="font-medium" data-testid={`text-delivery-date-${vendorPo.id}`}>
                {format(new Date(vendorPo.expectedDeliveryDate), 'MMM dd, yyyy')}
              </p>
            </div>
          )}
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewItems(vendorPo)}
            data-testid={`button-view-items-${vendorPo.id}`}
          >
            <Eye className="w-4 h-4 mr-1" />
            View Items
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(vendorPo)}
            data-testid={`button-edit-${vendorPo.id}`}
          >
            <Pencil className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(vendorPo.id)}
            className="text-red-600 hover:text-red-800"
            data-testid={`button-delete-${vendorPo.id}`}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
        
        {vendorPo.notes && (
          <div className="mt-3 pt-3 border-t">
            <span className="text-gray-500 text-xs">Notes:</span>
            <p className="text-sm text-gray-700 mt-1" data-testid={`text-notes-${vendorPo.id}`}>
              {vendorPo.notes}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Create/Edit form component
function VendorPOForm({ vendorPo, isOpen, onClose, onSubmit, inline = false }: {
  vendorPo?: VendorPO;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateVendorPOData) => void;
  inline?: boolean;
}) {
  const [formData, setFormData] = useState<CreateVendorPOData>({
    vendorId: vendorPo?.vendorId || 0,
    expectedDeliveryDate: vendorPo?.expectedDeliveryDate || '',
    shipVia: vendorPo?.shipVia || '',
    notes: vendorPo?.notes || '',
  });

  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(
    vendorPo?.expectedDeliveryDate ? new Date(vendorPo.expectedDeliveryDate) : undefined
  );

  // Fetch vendors for the dropdown
  const { data: vendorsResponse } = useQuery({
    queryKey: ['/api/vendors'],
    queryFn: () => apiRequest('/api/vendors')
  });
  const vendors = vendorsResponse?.data || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.vendorId === 0) {
      toast.error('Please select a vendor');
      return;
    }

    onSubmit({
      ...formData,
      expectedDeliveryDate: deliveryDate ? deliveryDate.toISOString().split('T')[0] : undefined,
    });
  };

  const shipViaOptions = [
    'FedEx Ground',
    'FedEx Express',
    'UPS Ground',
    'UPS Next Day',
    'USPS',
    'Freight',
    'Will Call',
    'Other'
  ];

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="vendorId">Vendor *</Label>
        <Select
          value={formData.vendorId.toString()}
          onValueChange={(value) => setFormData({ ...formData, vendorId: parseInt(value) })}
          data-testid="select-vendor"
        >
          <SelectTrigger>
            <SelectValue placeholder="Select vendor..." />
          </SelectTrigger>
          <SelectContent>
            {(vendors || []).map((vendor: any) => (
              <SelectItem key={vendor.id} value={vendor.id.toString()}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="expectedDeliveryDate">Expected Delivery Date</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !deliveryDate && "text-muted-foreground"
              )}
              data-testid="button-delivery-date"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {deliveryDate ? format(deliveryDate, "PPP") : "Select date"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={deliveryDate}
              onSelect={setDeliveryDate}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <Label htmlFor="shipVia">Ship Via</Label>
        <Select
          value={formData.shipVia}
          onValueChange={(value) => setFormData({ ...formData, shipVia: value })}
          data-testid="select-ship-via"
        >
          <SelectTrigger>
            <SelectValue placeholder="Select shipping method..." />
          </SelectTrigger>
          <SelectContent>
            {shipViaOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes..."
          rows={3}
          data-testid="input-notes"
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" data-testid="button-submit">
          {vendorPo ? 'Update' : 'Create'} Purchase Order
        </Button>
        {!inline && (
          <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  if (inline) {
    return formContent;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title">
            {vendorPo ? 'Edit Vendor Purchase Order' : 'Create New Vendor Purchase Order'}
          </DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

// Main component
export default function VendorPOManager() {
  const [selectedVendorPO, setSelectedVendorPO] = useState<VendorPO | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const queryClient = useQueryClient();

  // Fetch vendor POs
  const { data: vendorPOs = [], isLoading, error } = useQuery<VendorPO[]>({
    queryKey: ['/api/vendor-pos'],
    queryFn: () => apiRequest('/api/vendor-pos')
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateVendorPOData) => apiRequest('/api/vendor-pos', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Vendor purchase order created successfully');
      setShowForm(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create vendor purchase order');
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateVendorPOData> }) => 
      apiRequest(`/api/vendor-pos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Vendor purchase order updated successfully');
      setShowForm(false);
      setSelectedVendorPO(null);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update vendor purchase order');
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/vendor-pos/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Vendor purchase order deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete vendor purchase order');
    }
  });

  // Filter vendor POs
  const filteredVendorPOs = vendorPOs.filter(vendorPo => {
    const matchesSearch = vendorPo.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendorPo.vendorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      false;
    const matchesStatus = statusFilter === 'all' || vendorPo.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Event handlers
  const handleCreate = () => {
    setSelectedVendorPO(null);
    setShowForm(true);
  };

  const handleEdit = (vendorPo: VendorPO) => {
    setSelectedVendorPO(vendorPo);
    setShowDetailView(true);
    setActiveTab('details');
  };

  const handleBackToList = () => {
    setShowDetailView(false);
    setSelectedVendorPO(null);
    setActiveTab('details');
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this vendor purchase order?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleViewItems = (vendorPo: VendorPO) => {
    setSelectedVendorPO(vendorPo);
    setShowDetailView(true);
    setActiveTab('items');
  };

  const handleFormSubmit = (data: CreateVendorPOData) => {
    if (selectedVendorPO) {
      updateMutation.mutate({ id: selectedVendorPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-8" data-testid="loading-state">
        <div className="text-gray-500">Loading vendor purchase orders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" data-testid="error-state">
        <div className="text-red-600">Failed to load vendor purchase orders</div>
        <Button 
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] })}
          className="mt-2"
          data-testid="button-retry"
        >
          Retry
        </Button>
      </div>
    );
  }

  const statusOptions = ['all', 'Draft', 'Sent', 'Partially Received', 'Fully Received', 'Cancelled'];

  // Show detail view if a PO is selected
  if (showDetailView && selectedVendorPO) {
    return (
      <div className="space-y-6">
        {/* Detail Header */}
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={handleBackToList}
                data-testid="button-back-to-list"
              >
                ← Back to List
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight" data-testid="detail-po-number">
                  {selectedVendorPO.poNumber}
                </h2>
                <p className="text-muted-foreground">
                  {selectedVendorPO.vendorName || `Vendor ID: ${selectedVendorPO.vendorId}`}
                </p>
              </div>
            </div>
          </div>
          <Badge className={getStatusColor(selectedVendorPO.status)} data-testid="detail-status">
            {selectedVendorPO.status}
          </Badge>
        </div>

        {/* Tabbed Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="details" data-testid="tab-details">PO Details</TabsTrigger>
            <TabsTrigger value="items" data-testid="tab-items">Line Items</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Purchase Order Details</CardTitle>
                <CardDescription>Edit the details for this purchase order</CardDescription>
              </CardHeader>
              <CardContent>
                <VendorPOForm
                  vendorPo={selectedVendorPO}
                  isOpen={true}
                  onClose={() => {}}
                  onSubmit={handleFormSubmit}
                  inline={true}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <VendorPOItemSelector 
              vendorPoId={selectedVendorPO.id}
              poNumber={selectedVendorPO.poNumber}
              onTotalChange={(total) => {
                queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" data-testid="page-title">
            Vendor Purchase Orders
          </h2>
          <p className="text-muted-foreground">
            Manage purchase orders to vendors for procurement
          </p>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-vendor-po">
          <Plus className="w-4 h-4 mr-2" />
          Create Vendor PO
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO number or vendor name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status === 'all' ? 'All Statuses' : status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Vendor PO List */}
      {filteredVendorPOs.length === 0 ? (
        <div className="text-center py-8" data-testid="empty-state">
          <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {vendorPOs.length === 0 ? 'No vendor purchase orders' : 'No matching purchase orders'}
          </h3>
          <p className="text-gray-500">
            {vendorPOs.length === 0 
              ? 'Create your first vendor purchase order to get started.'
              : 'Try adjusting your search or filters.'
            }
          </p>
          {vendorPOs.length === 0 && (
            <Button onClick={handleCreate} className="mt-4" data-testid="button-create-first-vendor-po">
              <Plus className="w-4 h-4 mr-2" />
              Create First Vendor PO
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredVendorPOs.map((vendorPo) => (
            <VendorPOCard
              key={vendorPo.id}
              vendorPo={vendorPo}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewItems={handleViewItems}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Form */}
      <VendorPOForm
        vendorPo={selectedVendorPO || undefined}
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedVendorPO(null);
        }}
        onSubmit={handleFormSubmit}
      />

    </div>
  );
}
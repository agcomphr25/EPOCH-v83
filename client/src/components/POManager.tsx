import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPOs, createPO, updatePO, deletePO, type PurchaseOrder, type CreatePurchaseOrderData } from '@/lib/poUtils';
import { generateProductionOrdersFromPO } from '@/lib/productionUtils';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, Trash2, Plus, Eye, Package, Search, TrendingUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import POItemsManager from './POItemsManager';

export default function POManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'CANCELED'>('ALL');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    poNumber: '',
    customerId: '',
    customerName: '',
    poDate: '',
    expectedDelivery: '',
    status: 'OPEN' as 'OPEN' | 'CLOSED' | 'CANCELED',
    notes: ''
  });

  const { data: pos = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/pos'],
    queryFn: fetchPOs
  });

  const createMutation = useMutation({
    mutationFn: createPO,
    onSuccess: () => {
      toast.success('Purchase order created successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to create purchase order');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePurchaseOrderData> }) => updatePO(id, data),
    onSuccess: () => {
      toast.success('Purchase order updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to update purchase order');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deletePO,
    onSuccess: () => {
      toast.success('Purchase order deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
    },
    onError: () => {
      toast.error('Failed to delete purchase order');
    }
  });

  const generateProductionOrdersMutation = useMutation({
    mutationFn: generateProductionOrdersFromPO,
    onSuccess: (data) => {
      toast.success(`Generated ${data.orders.length} production orders`);
      queryClient.invalidateQueries({ queryKey: ['/api/production-orders'] });
    },
    onError: () => {
      toast.error('Failed to generate production orders');
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    console.log('Form submitted with formData:', formData);
    
    // Validate required fields
    if (!formData.poNumber || !formData.customerId || !formData.customerName || !formData.poDate || !formData.expectedDelivery) {
      console.log('Validation failed - missing fields:', {
        poNumber: !formData.poNumber,
        customerId: !formData.customerId,
        customerName: !formData.customerName,
        poDate: !formData.poDate,
        expectedDelivery: !formData.expectedDelivery
      });
      toast.error('Please fill in all required fields');
      return;
    }

    const data: CreatePurchaseOrderData = {
      poNumber: formData.poNumber,
      customerId: formData.customerId,
      customerName: formData.customerName,
      poDate: formData.poDate,
      expectedDelivery: formData.expectedDelivery,
      status: formData.status,
      notes: formData.notes || undefined
    };

    console.log('Submitting PO data:', data);

    if (editingPO) {
      updateMutation.mutate({ id: editingPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Initialize form data on component mount
  useEffect(() => {
    if (!editingPO) {
      setFormData({
        poNumber: '',
        customerId: '',
        customerName: '',
        poDate: new Date().toISOString().split('T')[0],
        expectedDelivery: '',
        status: 'OPEN',
        notes: ''
      });
    }
  }, [editingPO]);

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPO(po);
    setFormData({
      poNumber: po.poNumber,
      customerId: po.customerId,
      customerName: po.customerName,
      poDate: po.poDate ? new Date(po.poDate).toISOString().split('T')[0] : '',
      expectedDelivery: po.expectedDelivery ? new Date(po.expectedDelivery).toISOString().split('T')[0] : '',
      status: po.status,
      notes: po.notes || ''
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingPO(null);
    setFormData({
      poNumber: '',
      customerId: '',
      customerName: '',
      poDate: new Date().toISOString().split('T')[0],
      expectedDelivery: '',
      status: 'OPEN',
      notes: ''
    });
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this purchase order?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleGenerateProductionOrders = (po: PurchaseOrder) => {
    if (window.confirm(`Generate production orders for PO ${po.poNumber}? This will create individual production orders for each item.`)) {
      generateProductionOrdersMutation.mutate(po.id);
    }
  };

  const handleViewItems = (po: PurchaseOrder) => {
    setSelectedPO(po);
  };

  const filteredPOs = pos.filter(po => {
    const matchesSearch = po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         po.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800';
      case 'CLOSED': return 'bg-gray-100 text-gray-800';
      case 'CANCELED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {selectedPO ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={() => setSelectedPO(null)}
              className="mb-4"
            >
              ← Back to POs
            </Button>
          </div>
          <POItemsManager 
            poId={selectedPO.id}
            poNumber={selectedPO.poNumber}
            customerId={selectedPO.customerId}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Purchase Order Management</h2>
            <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingPO(null);
                  setFormData({
                    poNumber: '',
                    customerId: '',
                    customerName: '',
                    poDate: new Date().toISOString().split('T')[0],
                    expectedDelivery: '',
                    status: 'OPEN',
                    notes: ''
                  });
                  setIsDialogOpen(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Purchase Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingPO ? 'Edit Purchase Order' : 'Add New Purchase Order'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="poNumber">PO Number</Label>
                      <Input 
                        id="poNumber" 
                        name="poNumber" 
                        value={formData.poNumber}
                        onChange={(e) => setFormData({...formData, poNumber: e.target.value})}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="customerId">Customer ID</Label>
                      <Input 
                        id="customerId" 
                        name="customerId" 
                        value={formData.customerId}
                        onChange={(e) => setFormData({...formData, customerId: e.target.value})}
                        required 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="customerName">Customer Name</Label>
                    <Input 
                      id="customerName" 
                      name="customerName" 
                      value={formData.customerName}
                      onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                      required 
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="poDate">PO Date</Label>
                      <Input 
                        id="poDate" 
                        name="poDate" 
                        type="date"
                        value={formData.poDate}
                        onChange={(e) => setFormData({...formData, poDate: e.target.value})}
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="expectedDelivery">Expected Delivery</Label>
                      <Input 
                        id="expectedDelivery" 
                        name="expectedDelivery" 
                        type="date"
                        value={formData.expectedDelivery}
                        onChange={(e) => setFormData({...formData, expectedDelivery: e.target.value})}
                        required 
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value as 'OPEN' | 'CLOSED' | 'CANCELED'})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                        <SelectItem value="CANCELED">Canceled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea 
                      id="notes" 
                      name="notes" 
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      rows={3}
                    />
                  </div>
                  
                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={handleDialogClose}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingPO ? 'Update' : 'Create'} PO
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search POs by number, customer ID, or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as any)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="CANCELED">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Purchase Orders List */}
          <div className="grid gap-4">
            {isLoading ? (
              <div className="text-center py-8">Loading purchase orders...</div>
            ) : filteredPOs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchTerm || statusFilter !== 'ALL' ? 'No purchase orders match your search.' : 'No purchase orders yet. Click "Add Purchase Order" to create your first one.'}
              </div>
            ) : (
              filteredPOs.map((po) => (
                <Card key={po.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{po.poNumber}</CardTitle>
                        <CardDescription className="mt-1">
                          {po.customerName} ({po.customerId})
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={getStatusColor(po.status)}>
                          {po.status}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewItems(po)}
                            title="View Items"
                          >
                            <Package className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleGenerateProductionOrders(po)}
                            title="Generate Production Orders"
                            disabled={generateProductionOrdersMutation.isPending}
                          >
                            <TrendingUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(po)}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(po.id)}
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">PO Date:</span> {new Date(po.poDate).toLocaleDateString()}
                      </div>
                      <div>
                        <span className="font-medium">Expected Delivery:</span> {new Date(po.expectedDelivery).toLocaleDateString()}
                      </div>
                    </div>
                    {po.notes && (
                      <div className="mt-3 pt-3 border-t">
                        <span className="font-medium text-sm">Notes:</span> {po.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
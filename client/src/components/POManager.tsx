import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPOs, createPO, updatePO, deletePO, fetchPOItems, type PurchaseOrder, type CreatePurchaseOrderData, type PurchaseOrderItem } from '@/lib/poUtils';
import { generateProductionOrdersFromPO } from '@/lib/productionUtils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Pencil, Trash2, Plus, Eye, Package, Search, TrendingUp, ShoppingCart, ChevronsUpDown, Check, UserPlus } from 'lucide-react';
// @ts-ignore
import debounce from 'lodash.debounce';
import { toast } from 'react-hot-toast';
import POOrderEntry from './POOrderEntry';
import POItemsManager from './POItemsManager';

// Component to display PO quantity
function POQuantityDisplay({ poId }: { poId: number }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: [`/api/pos/${poId}/items`],
    queryFn: () => fetchPOItems(poId)
  });

  const totalQuantity = items.reduce((sum, item: PurchaseOrderItem) => sum + item.quantity, 0);

  if (isLoading) {
    return <span className="text-gray-500">Loading...</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <Package className="w-4 h-4 text-blue-600" />
      <span className="font-medium text-blue-600">{totalQuantity} items</span>
    </div>
  );
}

// Component to display production status badge
function ProductionStatusBadge({ poId }: { poId: number }) {
  const { data: productionOrders = [], isLoading } = useQuery({
    queryKey: [`/api/production-orders/by-po/${poId}`],
    queryFn: () => apiRequest(`/api/production-orders/by-po/${poId}`)
  });

  if (isLoading) {
    return null;
  }

  if (productionOrders.length === 0) {
    return null; // No production orders yet
  }

  const totalOrders = productionOrders.length;
  const pendingOrders = productionOrders.filter((order: any) => order.productionStatus === 'PENDING').length;
  const laidUpOrders = productionOrders.filter((order: any) => order.productionStatus === 'LAID_UP').length;
  const shippedOrders = productionOrders.filter((order: any) => order.productionStatus === 'SHIPPED').length;

  let badgeColor = "bg-blue-100 text-blue-800";
  let statusText = "In Production";
  
  if (shippedOrders === totalOrders) {
    badgeColor = "bg-green-100 text-green-800";
    statusText = "Shipped";
  } else if (laidUpOrders > 0) {
    badgeColor = "bg-yellow-100 text-yellow-800"; 
    statusText = "In Progress";
  } else {
    badgeColor = "bg-blue-100 text-blue-800";
    statusText = "Scheduled";
  }

  return (
    <Badge className={badgeColor}>
      {statusText} ({totalOrders})
    </Badge>
  );
}

// Component for individual PO card to safely use hooks
function POCard({ po, onEdit, onDelete, onViewItems, onCalculateSchedule, onGenerateProductionOrders, isGeneratingOrders }: {
  po: PurchaseOrder;
  onEdit: (po: PurchaseOrder) => void;
  onDelete: (id: number) => void;
  onViewItems: (po: PurchaseOrder) => void;
  onCalculateSchedule: (id: number) => void;
  onGenerateProductionOrders: (id: number) => void;
  isGeneratingOrders: boolean;
}) {
  const { data: productionOrders = [], isLoading } = useQuery({
    queryKey: [`/api/production-orders/by-po/${po.id}`],
    queryFn: () => apiRequest(`/api/production-orders/by-po/${po.id}`)
  });

  const hasOrders = productionOrders.length > 0;
  const orderCount = productionOrders.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-green-100 text-green-800';
      case 'CLOSED': return 'bg-gray-100 text-gray-800';
      case 'CANCELED': return 'bg-red-100 text-red-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{po.poNumber}</CardTitle>
            <CardDescription className="mt-1">
              {po.customerName} ({po.customerId})
            </CardDescription>
            <div className="mt-2">
              <POQuantityDisplay poId={po.id} />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge className={getStatusColor(po.status)}>
              {po.status}
            </Badge>
            <ProductionStatusBadge poId={po.id} />
            <div className="flex gap-1 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewItems(po)}
                className="flex items-center gap-1"
              >
                <Package className="w-4 h-4" />
                Manage Items
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(po)}
                title="Edit PO Details"
              >
                <Pencil className="w-4 h-4" />
              </Button>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCalculateSchedule(po.id)}
                >
                  Calculate Schedule
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateProductionOrders(po.id)}
                  disabled={isGeneratingOrders || hasOrders}
                  title={hasOrders ? `Production orders already exist (${orderCount} orders)` : 'Generate production orders from this PO'}
                >
                  {isGeneratingOrders ? 'Generating...' : hasOrders ? `Orders Generated (${orderCount})` : 'Generate Production Orders'}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(po.id)}
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
  );
}

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  customerType: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
}

export default function POManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED' | 'CANCELED'>('ALL');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchValue, setCustomerSearchValue] = useState('');
  const queryClient = useQueryClient();
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    customerType: 'Individual' as string,
    address: '',
    city: '',
    state: '',
    zipCode: ''
  });


  // Form state
  const [formData, setFormData] = useState({
    poNumber: '',
    customerId: '',
    customerName: '',
    poDate: new Date().toISOString().split('T')[0],
    expectedDelivery: '',
    status: 'OPEN' as 'OPEN' | 'CLOSED' | 'CANCELED',
    notes: ''
  });

  const { data: pos = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/pos'],
    queryFn: fetchPOs
  });

  // Fetch customers who have had past purchase orders
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers/with-pos'],
    queryFn: () => apiRequest('/api/customers/with-pos')
  });

  // Fetch stock models for order entry
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models')
  });

  const createMutation = useMutation({
    mutationFn: createPO,
    onSuccess: (newPO) => {
      toast.success('Purchase order created successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
      // Show order entry for new POs
      if (!editingPO && selectedCustomer) {
        setShowOrderEntry(true);
      }
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

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      return apiRequest('/api/customers/create-bypass', {
        method: 'POST',
        body: JSON.stringify(customerData)
      });
    },
    onSuccess: (newCustomer) => {
      toast.success('Customer created successfully');
      // Update form data with new customer
      setFormData({
        ...formData,
        customerName: newCustomer.name,
        customerId: newCustomer.id.toString()
      });
      setSelectedCustomer(newCustomer);
      // Refresh customers list
      queryClient.invalidateQueries({ queryKey: ['/api/customers/with-pos'] });
      setShowCreateCustomer(false);
      // Reset new customer form
      setNewCustomerData({
        name: '',
        email: '',
        phone: '',
        company: '',
        customerType: 'Individual',
        address: '',
        city: '',
        state: '',
        zipCode: ''
      });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create customer');
    }
  });

  const handleCalculateSchedule = async (poId: number) => {
    try {
      const result = await apiRequest(`/api/pos/${poId}/calculate-production-schedule`, {
        method: 'POST'
      });

      console.log('Production schedule calculated:', result);
      setScheduleData(result);
      setShowScheduleModal(true);

    } catch (error) {
      console.error('Calculate schedule error:', error);
      toast.error("Failed to calculate production schedule");
    }
  };

  const handleGenerateProductionOrders = async (poId: number) => {
    setIsGeneratingOrders(true);
    try {
      const result = await apiRequest(`/api/pos/${poId}/generate-production-orders`, {
        method: 'POST'
      });

      console.log('Generated production orders:', result);
      toast.success(`Generated ${result.createdOrders} production orders`);

      // Refresh PO list
      refetch();
    } catch (error) {
      console.error('Generate production orders error:', error);
      toast.error("Failed to generate production orders");
    } finally {
      setIsGeneratingOrders(false);
    }
  };

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
      itemType: 'multiple', // Default to multiple since we're using the advanced order entry
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

  const handleCreateCustomer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validate required fields
    if (!newCustomerData.name) {
      toast.error('Customer name is required');
      return;
    }
    
    createCustomerMutation.mutate(newCustomerData);
  };

  const handleCreateCustomerDialogClose = () => {
    setShowCreateCustomer(false);
    setNewCustomerData({
      name: '',
      email: '',
      phone: '',
      company: '',
      customerType: 'Individual',
      address: '',
      city: '',
      state: '',
      zipCode: ''
    });
  };

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this purchase order?')) {
      deleteMutation.mutate(id);
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
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Purchase Order Items</h3>
              <Button onClick={() => setShowOrderEntry(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Order Item
              </Button>
            </div>
            <POItemsManager
              poId={selectedPO.id}
              poNumber={selectedPO.poNumber}
              customerId={selectedPO.customerId}
            />
          </div>

          {/* Comprehensive Order Entry Dialog */}
          <POOrderEntry
            poId={selectedPO.id}
            isOpen={showOrderEntry}
            onClose={() => setShowOrderEntry(false)}
            onSuccess={() => {
              setShowOrderEntry(false);
              queryClient.invalidateQueries({ queryKey: [`/api/pos/${selectedPO.id}/items`] });
              queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
            }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Purchase Order Management</h2>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (open) {
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
              }
              setIsDialogOpen(open);
            }}>
              <DialogTrigger asChild>
                <Button>
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
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="customerName">Customer Name</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCreateCustomer(true)}
                        className="flex items-center gap-1"
                      >
                        <UserPlus className="w-4 h-4" />
                        Create New Customer
                      </Button>
                    </div>
                    <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerSearchOpen}
                          className="w-full justify-between"
                        >
                          {formData.customerName || "Search and select customer..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Type to search customers..."
                            value={customerSearchValue}
                            onValueChange={setCustomerSearchValue}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="text-center py-4">
                                <p className="text-sm text-gray-500 mb-2">No customers found.</p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCustomerSearchOpen(false);
                                    setShowCreateCustomer(true);
                                  }}
                                  className="flex items-center gap-1"
                                >
                                  <UserPlus className="w-4 h-4" />
                                  Create New Customer
                                </Button>
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {customers
                                .filter((customer: Customer) =>
                                  customer.name.toLowerCase().includes(customerSearchValue.toLowerCase()) ||
                                  (customer.company && customer.company.toLowerCase().includes(customerSearchValue.toLowerCase()))
                                )
                                .map((customer: Customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.name}
                                  onSelect={() => {
                                    setFormData({
                                      ...formData,
                                      customerName: customer.name,
                                      customerId: customer.id.toString()
                                    });
                                    setSelectedCustomer(customer);
                                    setCustomerSearchOpen(false);
                                    setCustomerSearchValue('');
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      formData.customerName === customer.name ? "opacity-100" : "opacity-0"
                                    }`}
                                  />
                                  {customer.name} {customer.company && `(${customer.company})`}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                <POCard 
                  key={po.id}
                  po={po}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewItems={handleViewItems}
                  onCalculateSchedule={handleCalculateSchedule}
                  onGenerateProductionOrders={handleGenerateProductionOrders}
                  isGeneratingOrders={isGeneratingOrders}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Production Schedule Modal */}
      <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>P1 Production Schedule Analysis</DialogTitle>
          </DialogHeader>

          {scheduleData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <label className="text-sm font-medium">PO Number:</label>
                  <p className="text-lg">{scheduleData.poNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Final Due Date:</label>
                  <p className="text-lg">{new Date(scheduleData.finalDueDate).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Available Weeks:</label>
                  <p className="text-lg">{scheduleData.availableWeeks}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Total Items:</label>
                  <p className="text-lg">{scheduleData.totalItemsNeeded}</p>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${
                scheduleData.overallFeasible
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
                <h3 className={`font-semibold ${
                  scheduleData.overallFeasible
                    ? 'text-green-800 dark:text-green-200'
                    : 'text-red-800 dark:text-red-200'
                }`}>
                  {scheduleData.recommendations.feasible ? '✅ Schedule Feasible' : '⚠️ Schedule Requires Attention'}
                </h3>
                <p className="text-sm mt-1">{scheduleData.recommendations.message}</p>
                <ul className="text-sm mt-2 space-y-1">
                  {scheduleData.recommendations.suggestedActions.map((action: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <span className="mr-2">•</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Item Production Schedules</h3>
                {scheduleData.itemSchedules.map((item: any, index: number) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold">{item.itemName}</h4>
                        <p className="text-sm text-gray-600">Total Quantity: {item.totalQuantity}</p>
                      </div>
                      <div className="text-right">
                        <div className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          item.feasible
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                        }`}>
                          {item.feasible ? 'Feasible' : 'Requires Attention'}
                        </div>
                        <p className="text-sm mt-1">{item.itemsPerWeek} items/week for {item.weeksNeeded} weeks</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {item.weeklySchedule.map((week: any, weekIndex: number) => (
                        <div key={weekIndex} className="bg-gray-50 dark:bg-gray-800 p-3 rounded border">
                          <div className="font-medium">Week {week.week}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Due: {new Date(week.dueDate).toLocaleDateString()}
                          </div>
                          <div className="text-sm">
                            Complete: {week.itemsToComplete} items
                          </div>
                          <div className="text-xs text-gray-500">
                            Cumulative: {week.cumulativeItems}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Creation Dialog */}
      <Dialog open={showCreateCustomer} onOpenChange={(open) => {
        if (!open) {
          handleCreateCustomerDialogClose();
        }
        setShowCreateCustomer(open);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Customer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCustomer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerNameNew">Customer Name *</Label>
                <Input
                  id="customerNameNew"
                  value={newCustomerData.name}
                  onChange={(e) => setNewCustomerData({...newCustomerData, name: e.target.value})}
                  required
                  placeholder="Enter customer name"
                />
              </div>
              <div>
                <Label htmlFor="customerCompany">Company</Label>
                <Input
                  id="customerCompany"
                  value={newCustomerData.company}
                  onChange={(e) => setNewCustomerData({...newCustomerData, company: e.target.value})}
                  placeholder="Company name (optional)"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  value={newCustomerData.email}
                  onChange={(e) => setNewCustomerData({...newCustomerData, email: e.target.value})}
                  placeholder="customer@email.com"
                />
              </div>
              <div>
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  value={newCustomerData.phone}
                  onChange={(e) => setNewCustomerData({...newCustomerData, phone: e.target.value})}
                  placeholder="Phone number"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="customerType">Customer Type</Label>
              <Select value={newCustomerData.customerType} onValueChange={(value) => setNewCustomerData({...newCustomerData, customerType: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Military">Military</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="customerAddress">Address</Label>
              <Input
                id="customerAddress"
                value={newCustomerData.address}
                onChange={(e) => setNewCustomerData({...newCustomerData, address: e.target.value})}
                placeholder="Street address"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="customerCity">City</Label>
                <Input
                  id="customerCity"
                  value={newCustomerData.city}
                  onChange={(e) => setNewCustomerData({...newCustomerData, city: e.target.value})}
                  placeholder="City"
                />
              </div>
              <div>
                <Label htmlFor="customerState">State</Label>
                <Input
                  id="customerState"
                  value={newCustomerData.state}
                  onChange={(e) => setNewCustomerData({...newCustomerData, state: e.target.value})}
                  placeholder="State"
                />
              </div>
              <div>
                <Label htmlFor="customerZip">ZIP Code</Label>
                <Input
                  id="customerZip"
                  value={newCustomerData.zipCode}
                  onChange={(e) => setNewCustomerData({...newCustomerData, zipCode: e.target.value})}
                  placeholder="ZIP code"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={handleCreateCustomerDialogClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createCustomerMutation.isPending}>
                {createCustomerMutation.isPending ? 'Creating...' : 'Create Customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
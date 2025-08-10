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
import { Pencil, Trash2, Plus, Eye, Package, Search, TrendingUp, ShoppingCart, ChevronsUpDown, Check } from 'lucide-react';
// @ts-ignore
import debounce from 'lodash.debounce';
import { toast } from 'react-hot-toast';
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

  // Form state
  const [formData, setFormData] = useState({
    poNumber: '',
    customerId: '',
    customerName: '',
    itemType: 'single' as 'single' | 'multiple',
    poDate: '',
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
        itemType: !formData.itemType,
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
        itemType: 'single',
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
      itemType: (po as any).itemType || 'single', // Default to single if not set
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
      itemType: 'single',
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
      ) : showOrderEntry ? (
        <POOrderEntry 
          selectedPO={pos.find(po => po.customerName === formData.customerName) || null}
          customer={selectedCustomer}
          stockModels={stockModels}
          onBack={() => setShowOrderEntry(false)}
          onOrderCreated={() => {
            setShowOrderEntry(false);
            queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
          }}
        />
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
                  itemType: 'single',
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
                            <CommandEmpty>No customers found.</CommandEmpty>
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

                  <div>
                    <Label htmlFor="itemType">Item Type</Label>
                    <Select value={formData.itemType} onValueChange={(value) => setFormData({...formData, itemType: value as 'single' | 'multiple'})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single Item</SelectItem>
                        <SelectItem value="multiple">Multiple Items</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <div className="mt-2">
                          <POQuantityDisplay poId={po.id} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge className={getStatusColor(po.status)}>
                          {po.status}
                        </Badge>
                        <div className="flex gap-1 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewItems(po)}
                            className="flex items-center gap-1"
                          >
                            <Package className="w-4 h-4" />
                            Manage Items
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(po)}
                            title="Edit PO Details"
                          >
                            <Pencil className="w-4 h-4" />
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

// Order Entry Component for Purchase Orders
interface POOrderEntryProps {
  selectedPO: PurchaseOrder | null;
  customer: Customer | null;
  stockModels: StockModel[];
  onBack: () => void;
  onOrderCreated: () => void;
}

function POOrderEntry({ selectedPO, customer, stockModels, onBack, onOrderCreated }: POOrderEntryProps) {
  const [selectedModel, setSelectedModel] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [notes, setNotes] = useState('');
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const queryClient = useQueryClient();

  const addOrderItem = () => {
    if (!selectedModel || quantity <= 0) {
      toast.error('Please select a model and enter a valid quantity');
      return;
    }

    const model = stockModels.find(m => m.id === selectedModel);
    if (!model) return;

    const newItem = {
      itemType: 'stock_model',
      itemId: model.id,
      itemName: model.displayName,
      quantity,
      unitPrice: unitPrice || model.price,
      totalPrice: quantity * (unitPrice || model.price),
      notes
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedModel('');
    setQuantity(1);
    setUnitPrice(0);
    setNotes('');
    toast.success('Item added to order');
  };

  const removeOrderItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const createOrderMutation = useMutation({
    mutationFn: async (items: any[]) => {
      if (!selectedPO) throw new Error('No PO selected');
      
      // Create PO items for each order item
      for (const item of items) {
        await apiRequest(`/api/pos/${selectedPO.id}/items`, {
          method: 'POST',
          body: item
        });
      }
    },
    onSuccess: () => {
      toast.success('Order items created successfully');
      setOrderItems([]);
      onOrderCreated();
    },
    onError: () => {
      toast.error('Failed to create order items');
    }
  });

  const handleCreateOrder = () => {
    if (orderItems.length === 0) {
      toast.error('Please add at least one item to the order');
      return;
    }
    createOrderMutation.mutate(orderItems);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <Button variant="outline" onClick={onBack} className="mb-4">
            ← Back to Purchase Orders
          </Button>
          <h2 className="text-2xl font-bold">Create Order for PO {selectedPO?.poNumber}</h2>
          <p className="text-gray-600">Customer: {customer?.name} {customer?.company && `(${customer.company})`}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Items Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" />
              Add Items to Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="stockModel">Stock Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a stock model" />
                </SelectTrigger>
                <SelectContent>
                  {stockModels.filter(m => m.isActive).map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.displayName} - ${model.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input 
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label htmlFor="unitPrice">Unit Price (Optional)</Label>
                <Input 
                  id="unitPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                  placeholder="Use model price"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea 
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Special instructions or notes..."
                rows={2}
              />
            </div>

            <Button onClick={addOrderItem} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order Summary ({orderItems.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orderItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No items added yet</p>
            ) : (
              <div className="space-y-3">
                {orderItems.map((item, index) => (
                  <div key={index} className="flex justify-between items-center p-3 border rounded">
                    <div className="flex-1">
                      <p className="font-medium">{item.itemName}</p>
                      <p className="text-sm text-gray-600">
                        Qty: {item.quantity} × ${item.unitPrice} = ${item.totalPrice.toFixed(2)}
                      </p>
                      {item.notes && (
                        <p className="text-sm text-gray-500 italic">{item.notes}</p>
                      )}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeOrderItem(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                
                <div className="border-t pt-3 mt-3">
                  <div className="flex justify-between items-center font-bold">
                    <span>Total:</span>
                    <span>${orderItems.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}</span>
                  </div>
                </div>

                <Button 
                  onClick={handleCreateOrder} 
                  className="w-full mt-4"
                  disabled={createOrderMutation.isPending}
                >
                  {createOrderMutation.isPending ? 'Creating...' : 'Create Order Items'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
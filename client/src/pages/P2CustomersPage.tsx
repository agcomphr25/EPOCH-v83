import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Phone, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
interface P2Customer {
  id: number;
  customerId: string;
  customerName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  shippingCompanyName: string | null;
  shippingContactName: string | null;
  shippingAddress: string | null;
  shippingAddress2: string | null;
  shippingCity: string | null;
  shippingState: string | null;
  shippingZip: string | null;
  shipToAddress: string | null;
  paymentTerms: string;
  status: string;
  notes: string | null;
  rfqPrefix: string | null;
  rfqSequences: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
}
interface P2CustomerContact {
  id: number;
  customerId: number;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  receivesInvoices: boolean;
  invoiceDeliveryRole: 'TO' | 'CC';
  active: boolean;
}

export default function P2CustomersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<P2Customer | null>(null);
  const [editTab, setEditTab] = useState<'details' | 'contacts'>('details');
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<P2CustomerContact | null>(null);
  const [contactFormData, setContactFormData] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    isPrimary: false,
    receivesInvoices: false,
    invoiceDeliveryRole: 'TO' as 'TO' | 'CC',
    active: true,
  });
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    contactEmail: '',
    contactPhone: '',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingZip: '',
    shippingCompanyName: '',
    shippingContactName: '',
    shippingAddress: '',
    shippingAddress2: '',
    shippingCity: '',
    shippingState: '',
    shippingZip: '',
    shipToAddress: '',
    paymentTerms: 'NET_30',
    status: 'ACTIVE',
    notes: '',
    rfqPrefix: '',
  });

  const { data: customers = [], isLoading } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest('/api/p2/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      setShowAddDialog(false);
      resetForm();
      toast({ title: 'Customer created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create customer', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      return apiRequest(`/api/p2/customers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      setShowEditDialog(false);
      setSelectedCustomer(null);
      resetForm();
      toast({ title: 'Customer updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update customer', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/p2/customers/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      toast({ title: 'Customer deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete customer', description: error.message, variant: 'destructive' });
    },
  });

  const { data: contacts = [], refetch: refetchContacts } = useQuery<P2CustomerContact[]>({
    queryKey: ['/api/p2/customers', selectedCustomer?.id, 'contacts'],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await fetch(`/api/p2/customers/${selectedCustomer.id}/contacts`);
      if (!response.ok) throw new Error('Failed to fetch contacts');
      return response.json();
    },
    enabled: !!selectedCustomer?.id && showEditDialog && editTab === 'contacts',
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: typeof contactFormData & { customerId: number }) => {
      return apiRequest(`/api/p2/customers/${data.customerId}/contacts`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      refetchContacts();
      setShowAddContactDialog(false);
      resetContactForm();
      toast({ title: 'Contact added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add contact', description: error.message, variant: 'destructive' });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof contactFormData }) => {
      return apiRequest(`/api/p2/customers/${selectedCustomer?.id}/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      refetchContacts();
      setEditingContact(null);
      resetContactForm();
      toast({ title: 'Contact updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update contact', description: error.message, variant: 'destructive' });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/p2/customers/${selectedCustomer?.id}/contacts/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refetchContacts();
      toast({ title: 'Contact deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete contact', description: error.message, variant: 'destructive' });
    },
  });

  const resetContactForm = () => {
    setContactFormData({
      name: '',
      title: '',
      email: '',
      phone: '',
      isPrimary: false,
      receivesInvoices: false,
      invoiceDeliveryRole: 'TO',
      active: true,
    });
  };

  const resetForm = () => {
    setFormData({
      customerId: '',
      customerName: '',
      contactEmail: '',
      contactPhone: '',
      billingAddress: '',
      billingCity: '',
      billingState: '',
      billingZip: '',
      shippingCompanyName: '',
      shippingContactName: '',
      shippingAddress: '',
      shippingAddress2: '',
      shippingCity: '',
      shippingState: '',
      shippingZip: '',
      shipToAddress: '',
      paymentTerms: 'NET_30',
      status: 'ACTIVE',
      notes: '',
      rfqPrefix: '',
    });
  };

  const openEditDialog = (customer: P2Customer) => {
    setSelectedCustomer(customer);
    setEditTab('details');
    setFormData({
      customerId: customer.customerId,
      customerName: customer.customerName,
      contactEmail: customer.contactEmail || '',
      contactPhone: customer.contactPhone || '',
      billingAddress: customer.billingAddress || '',
      billingCity: customer.billingCity || '',
      billingState: customer.billingState || '',
      billingZip: customer.billingZip || '',
      shippingCompanyName: customer.shippingCompanyName || '',
      shippingContactName: customer.shippingContactName || '',
      shippingAddress: customer.shippingAddress || '',
      shippingAddress2: customer.shippingAddress2 || '',
      shippingCity: customer.shippingCity || '',
      shippingState: customer.shippingState || '',
      shippingZip: customer.shippingZip || '',
      shipToAddress: customer.shipToAddress || '',
      paymentTerms: customer.paymentTerms || 'NET_30',
      status: customer.status,
      notes: customer.notes || '',
      rfqPrefix: customer.rfqPrefix || '',
    });
    setShowEditDialog(true);
  };

  const handleSubmit = () => {
    if (!formData.customerId || !formData.customerName) {
      toast({ title: 'Customer ID and Name are required', variant: 'destructive' });
      return;
    }
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!selectedCustomer) return;
    updateMutation.mutate({ id: selectedCustomer.id, data: formData });
  };

  const handleDelete = (customer: P2Customer) => {
    if (confirm(`Are you sure you want to delete ${customer.customerName}?`)) {
      deleteMutation.mutate(customer.id);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>P2 Customers</CardTitle>
            <CardDescription>
              Manage customers for P2 purchase orders and RFQ tracking
            </CardDescription>
          </div>
          <Button onClick={() => { resetForm(); setShowAddDialog(true); }} data-testid="button-add-p2-customer">
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/50">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No P2 customers yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add your first P2 customer to get started</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-mono text-sm">{customer.customerId}</TableCell>
                  <TableCell className="font-medium">{customer.customerName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-sm">
                      {customer.contactEmail && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {customer.contactEmail}
                        </div>
                      )}
                      {customer.contactPhone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {customer.contactPhone}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={customer.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {customer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(customer)}
                        data-testid={`button-edit-customer-${customer.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(customer)}
                        className="text-red-600 hover:text-red-700"
                        data-testid={`button-delete-customer-${customer.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add P2 Customer</DialogTitle>
            <DialogDescription>
              Create a new customer for P2 purchase orders
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer ID *</Label>
              <Input
                id="customerId"
                placeholder="e.g., STRATA-G"
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value.toUpperCase() })}
                data-testid="input-customer-id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer Name *</Label>
              <Input
                id="customerName"
                placeholder="e.g., Strata-G Solutions"
                value={formData.customerName}
                onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                data-testid="input-customer-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="contact@example.com"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input
                id="contactPhone"
                placeholder="(555) 123-4567"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                data-testid="input-contact-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rfqPrefix">RFQ Prefix (3 letters)</Label>
              <Input
                id="rfqPrefix"
                placeholder="e.g., STR"
                maxLength={3}
                value={formData.rfqPrefix}
                onChange={(e) => setFormData({ ...formData, rfqPrefix: e.target.value.toUpperCase() })}
                data-testid="input-rfq-prefix"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Select value={formData.paymentTerms} onValueChange={(v) => setFormData({ ...formData, paymentTerms: v })}>
                <SelectTrigger data-testid="select-payment-terms">
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NET_15">Net 15</SelectItem>
                  <SelectItem value="NET_30">Net 30</SelectItem>
                  <SelectItem value="NET_45">Net 45</SelectItem>
                  <SelectItem value="NET_60">Net 60</SelectItem>
                  <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 border-t pt-4 mt-2">
              <Label className="text-base font-medium">Billing Address</Label>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="billingAddress">Street Address</Label>
              <Input
                id="billingAddress"
                placeholder="123 Main St"
                value={formData.billingAddress}
                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                data-testid="input-billing-address"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingCity">City</Label>
              <Input
                id="billingCity"
                placeholder="City"
                value={formData.billingCity}
                onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                data-testid="input-billing-city"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="billingState">State</Label>
                <Input
                  id="billingState"
                  placeholder="State"
                  value={formData.billingState}
                  onChange={(e) => setFormData({ ...formData, billingState: e.target.value })}
                  data-testid="input-billing-state"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingZip">ZIP</Label>
                <Input
                  id="billingZip"
                  placeholder="ZIP"
                  value={formData.billingZip}
                  onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                  data-testid="input-billing-zip"
                />
              </div>
            </div>
            <div className="col-span-2 border-t pt-4 mt-2">
              <Label className="text-base font-medium">Shipping Address</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingCompanyName">Company Name</Label>
              <Input
                id="shippingCompanyName"
                placeholder="Subsidiary or receiving company"
                value={formData.shippingCompanyName}
                onChange={(e) => setFormData({ ...formData, shippingCompanyName: e.target.value })}
                data-testid="input-shipping-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingContactName">Contact Name</Label>
              <Input
                id="shippingContactName"
                placeholder="Receiving contact person"
                value={formData.shippingContactName}
                onChange={(e) => setFormData({ ...formData, shippingContactName: e.target.value })}
                data-testid="input-shipping-contact-name"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="shippingAddress">Street Address</Label>
              <Input
                id="shippingAddress"
                placeholder="456 Warehouse Rd"
                value={formData.shippingAddress}
                onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                data-testid="input-shipping-address"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="shippingAddress2">Address Line 2</Label>
              <Input
                id="shippingAddress2"
                placeholder="Suite, building, floor, etc."
                value={formData.shippingAddress2}
                onChange={(e) => setFormData({ ...formData, shippingAddress2: e.target.value })}
                data-testid="input-shipping-address-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shippingCity">City</Label>
              <Input
                id="shippingCity"
                placeholder="City"
                value={formData.shippingCity}
                onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                data-testid="input-shipping-city"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="shippingState">State</Label>
                <Input
                  id="shippingState"
                  placeholder="State"
                  value={formData.shippingState}
                  onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })}
                  data-testid="input-shipping-state"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shippingZip">ZIP</Label>
                <Input
                  id="shippingZip"
                  placeholder="ZIP"
                  value={formData.shippingZip}
                  onChange={(e) => setFormData({ ...formData, shippingZip: e.target.value })}
                  data-testid="input-shipping-zip"
                />
              </div>
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                placeholder="Any additional notes..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              data-testid="button-save-customer"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit P2 Customer: {selectedCustomer?.customerName}</DialogTitle>
            <DialogDescription>
              Update customer details or manage additional contacts
            </DialogDescription>
          </DialogHeader>

          <Tabs value={editTab} onValueChange={(v) => setEditTab(v as 'details' | 'contacts')} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Customer Details</TabsTrigger>
              <TabsTrigger value="contacts">Additional Contacts</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-customerId">Customer ID</Label>
                  <Input
                    id="edit-customerId"
                    value={formData.customerId}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-customerName">Customer Name *</Label>
                  <Input
                    id="edit-customerName"
                    value={formData.customerName}
                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                    data-testid="input-edit-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-contactEmail">Contact Email</Label>
                  <Input
                    id="edit-contactEmail"
                    type="email"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    data-testid="input-edit-contact-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-contactPhone">Contact Phone</Label>
                  <Input
                    id="edit-contactPhone"
                    value={formData.contactPhone}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    data-testid="input-edit-contact-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-rfqPrefix">RFQ Prefix (3 letters)</Label>
                  <Input
                    id="edit-rfqPrefix"
                    maxLength={3}
                    value={formData.rfqPrefix}
                    onChange={(e) => setFormData({ ...formData, rfqPrefix: e.target.value.toUpperCase() })}
                    data-testid="input-edit-rfq-prefix"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentTerms">Payment Terms</Label>
                  <Select value={formData.paymentTerms} onValueChange={(v) => setFormData({ ...formData, paymentTerms: v })}>
                    <SelectTrigger data-testid="select-edit-payment-terms">
                      <SelectValue placeholder="Select terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NET_15">Net 15</SelectItem>
                      <SelectItem value="NET_30">Net 30</SelectItem>
                      <SelectItem value="NET_45">Net 45</SelectItem>
                      <SelectItem value="NET_60">Net 60</SelectItem>
                      <SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger data-testid="select-edit-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Active</SelectItem>
                      <SelectItem value="INACTIVE">Inactive</SelectItem>
                      <SelectItem value="SUSPENDED">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 border-t pt-4 mt-2">
                  <Label className="text-base font-medium">Billing Address</Label>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-billingAddress">Street Address</Label>
                  <Input
                    id="edit-billingAddress"
                    value={formData.billingAddress}
                    onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                    data-testid="input-edit-billing-address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-billingCity">City</Label>
                  <Input
                    id="edit-billingCity"
                    value={formData.billingCity}
                    onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                    data-testid="input-edit-billing-city"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-billingState">State</Label>
                    <Input
                      id="edit-billingState"
                      value={formData.billingState}
                      onChange={(e) => setFormData({ ...formData, billingState: e.target.value })}
                      data-testid="input-edit-billing-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-billingZip">ZIP</Label>
                    <Input
                      id="edit-billingZip"
                      value={formData.billingZip}
                      onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                      data-testid="input-edit-billing-zip"
                    />
                  </div>
                </div>
                <div className="col-span-2 border-t pt-4 mt-2">
                  <Label className="text-base font-medium">Shipping Address</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-shippingCompanyName">Company Name</Label>
                  <Input
                    id="edit-shippingCompanyName"
                    placeholder="Subsidiary or receiving company"
                    value={formData.shippingCompanyName}
                    onChange={(e) => setFormData({ ...formData, shippingCompanyName: e.target.value })}
                    data-testid="input-edit-shipping-company-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-shippingContactName">Contact Name</Label>
                  <Input
                    id="edit-shippingContactName"
                    placeholder="Receiving contact person"
                    value={formData.shippingContactName}
                    onChange={(e) => setFormData({ ...formData, shippingContactName: e.target.value })}
                    data-testid="input-edit-shipping-contact-name"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-shippingAddress">Street Address</Label>
                  <Input
                    id="edit-shippingAddress"
                    value={formData.shippingAddress}
                    onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                    data-testid="input-edit-shipping-address"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-shippingAddress2">Address Line 2</Label>
                  <Input
                    id="edit-shippingAddress2"
                    placeholder="Suite, building, floor, etc."
                    value={formData.shippingAddress2}
                    onChange={(e) => setFormData({ ...formData, shippingAddress2: e.target.value })}
                    data-testid="input-edit-shipping-address-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-shippingCity">City</Label>
                  <Input
                    id="edit-shippingCity"
                    value={formData.shippingCity}
                    onChange={(e) => setFormData({ ...formData, shippingCity: e.target.value })}
                    data-testid="input-edit-shipping-city"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-shippingState">State</Label>
                    <Input
                      id="edit-shippingState"
                      value={formData.shippingState}
                      onChange={(e) => setFormData({ ...formData, shippingState: e.target.value })}
                      data-testid="input-edit-shipping-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-shippingZip">ZIP</Label>
                    <Input
                      id="edit-shippingZip"
                      value={formData.shippingZip}
                      onChange={(e) => setFormData({ ...formData, shippingZip: e.target.value })}
                      data-testid="input-edit-shipping-zip"
                    />
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-notes">Notes</Label>
                  <Input
                    id="edit-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    data-testid="input-edit-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button
                  onClick={handleUpdate}
                  disabled={updateMutation.isPending}
                  data-testid="button-update-customer"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="contacts" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Manage additional contacts for this customer
                  </p>
                  <Button
                    size="sm"
                    onClick={() => { resetContactForm(); setShowAddContactDialog(true); }}
                    data-testid="button-add-contact"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Contact
                  </Button>
                </div>

                {contacts.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/50">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">No additional contacts</p>
                    <p className="text-sm text-muted-foreground">Add contacts to track multiple points of communication</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">
                            {contact.name}
                            {contact.isPrimary && (
                              <Badge variant="secondary" className="ml-2 text-xs">Primary</Badge>
                            )}
                            {contact.receivesInvoices && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Invoice {contact.invoiceDeliveryRole || 'TO'}
                              </Badge>
                            )}
                            {!contact.active && (
                              <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>{contact.title || '-'}</TableCell>
                          <TableCell>
                            {contact.email ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3" />
                                {contact.email}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            {contact.phone ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {contact.phone}
                              </div>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingContact(contact);
                                  setContactFormData({
                                    name: contact.name,
                                    title: contact.title || '',
                                    email: contact.email || '',
                                    phone: contact.phone || '',
                                    isPrimary: contact.isPrimary,
                                    receivesInvoices: contact.receivesInvoices,
                                    invoiceDeliveryRole:
                                      contact.invoiceDeliveryRole || 'TO',
                                    active: contact.active,
                                  });
                                }}
                                data-testid={`button-edit-contact-${contact.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                onClick={() => {
                                  if (confirm(`Delete contact ${contact.name}?`)) {
                                    deleteContactMutation.mutate(contact.id);
                                  }
                                }}
                                data-testid={`button-delete-contact-${contact.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Close</Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddContactDialog} onOpenChange={setShowAddContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Add a new contact for {selectedCustomer?.customerName}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Name *</Label>
              <Input
                id="contact-name"
                value={contactFormData.name}
                onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                data-testid="input-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-title">Title</Label>
              <Input
                id="contact-title"
                placeholder="e.g., Purchasing Manager"
                value={contactFormData.title}
                onChange={(e) => setContactFormData({ ...contactFormData, title: e.target.value })}
                data-testid="input-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                data-testid="input-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input
                id="contact-phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                data-testid="input-contact-phone"
              />
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="contact-receives-invoices"
                  checked={contactFormData.receivesInvoices}
                  onCheckedChange={(checked) =>
                    setContactFormData({
                      ...contactFormData,
                      receivesInvoices: Boolean(checked),
                    })
                  }
                />
                <Label htmlFor="contact-receives-invoices">Invoice recipient</Label>
              </div>
              {contactFormData.receivesInvoices && (
                <div className="space-y-2">
                  <Label>Invoice delivery</Label>
                  <Select
                    value={contactFormData.invoiceDeliveryRole}
                    onValueChange={(value: 'TO' | 'CC') =>
                      setContactFormData({
                        ...contactFormData,
                        invoiceDeliveryRole: value,
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TO">To</SelectItem>
                      <SelectItem value="CC">CC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddContactDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!contactFormData.name || !selectedCustomer) return;
                createContactMutation.mutate({ ...contactFormData, customerId: selectedCustomer.id });
              }}
              disabled={createContactMutation.isPending || !contactFormData.name}
              data-testid="button-save-contact"
            >
              {createContactMutation.isPending ? 'Adding...' : 'Add Contact'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingContact} onOpenChange={(open) => !open && setEditingContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
            <DialogDescription>Update contact information</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-contact-name">Name *</Label>
              <Input
                id="edit-contact-name"
                value={contactFormData.name}
                onChange={(e) => setContactFormData({ ...contactFormData, name: e.target.value })}
                data-testid="input-edit-contact-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-title">Title</Label>
              <Input
                id="edit-contact-title"
                value={contactFormData.title}
                onChange={(e) => setContactFormData({ ...contactFormData, title: e.target.value })}
                data-testid="input-edit-contact-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-email">Email</Label>
              <Input
                id="edit-contact-email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                data-testid="input-edit-contact-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-contact-phone">Phone</Label>
              <Input
                id="edit-contact-phone"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
                data-testid="input-edit-contact-phone"
              />
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-contact-receives-invoices"
                  checked={contactFormData.receivesInvoices}
                  onCheckedChange={(checked) =>
                    setContactFormData({
                      ...contactFormData,
                      receivesInvoices: Boolean(checked),
                    })
                  }
                />
                <Label htmlFor="edit-contact-receives-invoices">Invoice recipient</Label>
              </div>
              {contactFormData.receivesInvoices && (
                <div className="space-y-2">
                  <Label>Invoice delivery</Label>
                  <Select
                    value={contactFormData.invoiceDeliveryRole}
                    onValueChange={(value: 'TO' | 'CC') =>
                      setContactFormData({
                        ...contactFormData,
                        invoiceDeliveryRole: value,
                      })
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TO">To</SelectItem>
                      <SelectItem value="CC">CC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-contact-active"
                  checked={contactFormData.active}
                  onCheckedChange={(checked) =>
                    setContactFormData({
                      ...contactFormData,
                      active: Boolean(checked),
                    })
                  }
                />
                <Label htmlFor="edit-contact-active">Active contact</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!editingContact || !contactFormData.name) return;
                updateContactMutation.mutate({ id: editingContact.id, data: contactFormData });
              }}
              disabled={updateContactMutation.isPending || !contactFormData.name}
              data-testid="button-update-contact"
            >
              {updateContactMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

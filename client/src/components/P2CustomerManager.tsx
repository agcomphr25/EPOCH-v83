import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, Building2, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { apiRequest } from '@/lib/queryClient';

const p2CustomerSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  customerName: z.string().min(1, 'Customer Name is required'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  paymentTerms: z.string().default('NET_30'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  notes: z.string().optional(),
  rfqPrefix: z.string().length(3, 'RFQ Prefix must be exactly 3 characters').optional().or(z.literal('')),
  currentYearSequence: z.string().optional().or(z.literal('')),
});

type P2CustomerForm = z.infer<typeof p2CustomerSchema>;

interface P2Customer extends P2CustomerForm {
  id: number;
  createdAt: string;
  updatedAt: string;
  rfqSequences?: Record<string, number>;
}

export function P2CustomerManager() {
  const [selectedCustomer, setSelectedCustomer] = useState<P2Customer | null>(
    null
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass', { includeInactive: showInactive }],
    queryFn: () => fetch(`/api/p2-customers-bypass?includeInactive=${showInactive}`).then(r => r.json()),
  });

  const form = useForm<P2CustomerForm>({
    resolver: zodResolver(p2CustomerSchema),
    defaultValues: {
      customerId: '',
      customerName: '',
      contactEmail: '',
      contactPhone: '',
      billingAddress: '',
      shippingAddress: '',
      paymentTerms: 'NET_30',
      status: 'ACTIVE',
      notes: '',
      rfqPrefix: '',
      currentYearSequence: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: P2CustomerForm) =>
      apiRequest('/api/p2/customers', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      toast({
        title: 'Success',
        description: 'P2 Customer created successfully',
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create P2 customer',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<P2CustomerForm> }) =>
      apiRequest(`/api/p2/customers/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      toast({
        title: 'Success',
        description: 'P2 Customer updated successfully',
      });
      setDialogOpen(false);
      setSelectedCustomer(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update P2 customer',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/p2/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      toast({
        title: 'Success',
        description: 'P2 Customer deactivated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate P2 customer',
        variant: 'destructive',
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/p2/customers/${id}`, {
        method: 'PUT',
        body: { status: 'ACTIVE' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2-customers-bypass'] });
      toast({
        title: 'Success',
        description: 'P2 Customer reactivated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reactivate P2 customer',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (data: P2CustomerForm) => {
    console.log('💾 Form submitted with data:', data);
    
    const currentYear = new Date().getFullYear().toString();
    const rfqPrefix = data.rfqPrefix || data.customerName.substring(0, 3).toUpperCase();
    
    // Parse the sequence value, allowing 0 and empty string
    const sequenceValue = data.currentYearSequence !== undefined && data.currentYearSequence !== '' 
      ? parseInt(data.currentYearSequence) 
      : 0;
    
    console.log('🔢 Parsed sequence value:', sequenceValue, 'from input:', data.currentYearSequence);
    
    // Always update rfqSequences with the current year's value
    const rfqSequences = { ...(selectedCustomer?.rfqSequences || {}) };
    rfqSequences[currentYear] = sequenceValue;
    
    console.log('📊 Final rfqSequences to save:', rfqSequences);
    
    const submitData: any = {
      ...data,
      rfqPrefix,
      rfqSequences,
    };
    
    delete submitData.currentYearSequence;
    
    console.log('🚀 Sending to server:', submitData);
    
    if (selectedCustomer) {
      updateMutation.mutate({ id: selectedCustomer.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const openEditDialog = (customer: P2Customer) => {
    setSelectedCustomer(customer);
    const currentYear = new Date().getFullYear().toString();
    const currentSequence = customer.rfqSequences?.[currentYear] || 0;
    
    console.log('📝 Opening edit dialog for customer:', customer.customerName);
    console.log('📊 RFQ Sequences:', customer.rfqSequences);
    console.log('📅 Current Year:', currentYear);
    console.log('🔢 Current Sequence for this year:', currentSequence);
    
    form.reset({
      customerId: customer.customerId,
      customerName: customer.customerName,
      contactEmail: customer.contactEmail || '',
      contactPhone: customer.contactPhone || '',
      billingAddress: customer.billingAddress || '',
      shippingAddress: customer.shippingAddress || '',
      paymentTerms: customer.paymentTerms,
      status: customer.status,
      notes: customer.notes || '',
      rfqPrefix: customer.rfqPrefix || '',
      currentYearSequence: currentSequence.toString(),
    });
    
    console.log('✅ Form reset with currentYearSequence:', currentSequence.toString());
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedCustomer(null);
    form.reset();
    setDialogOpen(true);
  };

  if (isLoading) {
    return <div className="p-6">Loading P2 customers...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            P2 Customer Management
          </h2>
          <p className="text-muted-foreground">
            Manage customers for P2 operations
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <Label htmlFor="show-inactive" className="text-sm cursor-pointer flex items-center gap-1">
              {showInactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Show Inactive
            </Label>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add P2 Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {selectedCustomer ? 'Edit P2 Customer' : 'Add P2 Customer'}
              </DialogTitle>
              <DialogDescription>
                {selectedCustomer
                  ? 'Update customer information'
                  : 'Add a new P2 customer to the system'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer ID</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., P2-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Company Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="contact@company.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="(555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="billingAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Address</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Billing address..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="shippingAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shipping Address</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Shipping address..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="paymentTerms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Terms</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment terms" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="NET_30">NET 30</SelectItem>
                            <SelectItem value="NET_15">NET 15</SelectItem>
                            <SelectItem value="NET_60">NET 60</SelectItem>
                            <SelectItem value="COD">COD</SelectItem>
                            <SelectItem value="PREPAID">Prepaid</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="INACTIVE">Inactive</SelectItem>
                            <SelectItem value="SUSPENDED">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-semibold mb-3">RFQ Configuration</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="rfqPrefix"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>RFQ Prefix (3 letters)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., STR" 
                              maxLength={3}
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Defaults to first 3 letters of customer name if empty
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="currentYearSequence"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Year Starting #</FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="0" 
                              min="0"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              data-testid="input-current-year-sequence"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Leave empty or 0 for new customers
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      createMutation.isPending || updateMutation.isPending
                    }
                  >
                    {selectedCustomer ? 'Update' : 'Create'} Customer
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No P2 Customers</h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by adding your first P2 customer
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add P2 Customer
              </Button>
            </CardContent>
          </Card>
        ) : (
          customers.map((customer) => (
            <Card key={customer.id} className={customer.status === 'INACTIVE' ? 'opacity-60 border-dashed' : ''}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {customer.customerName}
                      {customer.status === 'INACTIVE' && (
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                          INACTIVE
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      ID: {customer.customerId} • Status: {customer.status}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {customer.status === 'INACTIVE' ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => reactivateMutation.mutate(customer.id)}
                        disabled={reactivateMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Reactivate
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(customer)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMutation.mutate(customer.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p>
                      <strong>Email:</strong> {customer.contactEmail || 'N/A'}
                    </p>
                    <p>
                      <strong>Phone:</strong> {customer.contactPhone || 'N/A'}
                    </p>
                    <p>
                      <strong>Payment Terms:</strong> {customer.paymentTerms}
                    </p>
                  </div>
                  <div>
                    <p>
                      <strong>Billing:</strong>{' '}
                      {customer.billingAddress || 'N/A'}
                    </p>
                    <p>
                      <strong>Shipping:</strong>{' '}
                      {customer.shippingAddress || 'N/A'}
                    </p>
                    {customer.notes && (
                      <p>
                        <strong>Notes:</strong> {customer.notes}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

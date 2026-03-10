import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import {
  DollarSign,
  Search,
  Trash2,
  Loader2,
  CreditCard,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const PAYMENT_METHODS = [
  { value: 'ACH', label: 'ACH' },
  { value: 'Wire', label: 'Wire' },
  { value: 'Check', label: 'Check' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Cash', label: 'Cash' },
];

function formatCurrency(val: string | number | null | undefined) {
  const num = parseFloat(String(val ?? '0'));
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatDate(val: string | null | undefined) {
  if (!val) return '—';
  try {
    return format(new Date(val), 'MM/dd/yyyy');
  } catch {
    return val;
  }
}

interface PaymentFormData {
  customerId: string;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string;
  amount: string;
  notes: string;
}

const defaultPaymentForm = (): PaymentFormData => ({
  customerId: '',
  paymentDate: new Date().toISOString().split('T')[0],
  paymentMethod: '',
  referenceNumber: '',
  amount: '',
  notes: '',
});

interface AllocationRow {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  balance: string;
  applyAmount: string;
}

export default function ARPaymentsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(defaultPaymentForm());
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/ar-payments'],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const [allocateExistingPayment, setAllocateExistingPayment] = useState<any>(null);

  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const result = await apiRequest('/api/ar-payments', {
        method: 'POST',
        body: {
          customerId: data.customerId,
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          amount: data.amount,
          referenceNumber: data.referenceNumber || null,
          notes: data.notes || null,
        },
      });
      const invoicesRes = await fetch(
        `/api/ar-invoices?customerId=${encodeURIComponent(data.customerId)}`,
        { credentials: 'include' }
      );
      const freshInvoices = invoicesRes.ok ? await invoicesRes.json() : [];
      return { payment: result, invoices: freshInvoices };
    },
    onSuccess: ({ payment, invoices }: any) => {
      toast({ title: 'Payment recorded' });
      setCreatedPaymentId(payment.id);
      setCreateDialogOpen(false);

      const openInvoices = (invoices || []).filter(
        (inv: any) => inv.status !== 'PAID' && inv.status !== 'VOID' && parseFloat(inv.balance || inv.totalAmount) > 0
      );

      setAllocations(
        openInvoices.map((inv: any) => ({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          totalAmount: inv.totalAmount,
          balance: String(parseFloat(inv.balance ?? inv.totalAmount)),
          applyAmount: '',
        }))
      );
      setAllocationDialogOpen(true);

      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-payments',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const allocateMutation = useMutation({
    mutationFn: (data: { paymentId: string; allocations: { invoiceId: string; amount: number }[] }) =>
      apiRequest(`/api/ar-payments/${data.paymentId}/allocate`, {
        method: 'POST',
        body: data.allocations,
      }),
    onSuccess: () => {
      toast({ title: 'Payment allocated successfully' });
      setAllocationDialogOpen(false);
      setCreatedPaymentId(null);
      setAllocations([]);
      setPaymentForm(defaultPaymentForm());
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && (
            query.queryKey[0] === '/api/ar-invoices' || query.queryKey[0] === '/api/ar-payments'
          ),
      });
    },
    onError: (error: any) => {
      toast({ title: 'Allocation failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (paymentId: string) =>
      apiRequest(`/api/ar-payments/${paymentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Payment deleted' });
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && (
            query.queryKey[0] === '/api/ar-invoices' || query.queryKey[0] === '/api/ar-payments'
          ),
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmitPayment = () => {
    if (!paymentForm.customerId) {
      toast({ title: 'Validation', description: 'Customer is required.', variant: 'destructive' });
      return;
    }
    if (!paymentForm.paymentMethod) {
      toast({ title: 'Validation', description: 'Payment method is required.', variant: 'destructive' });
      return;
    }
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
      toast({ title: 'Validation', description: 'Amount must be greater than zero.', variant: 'destructive' });
      return;
    }
    createPaymentMutation.mutate(paymentForm);
  };

  const handleSubmitAllocation = () => {
    if (!createdPaymentId) return;
    const items = allocations
      .filter((a) => a.applyAmount && parseFloat(a.applyAmount) > 0)
      .map((a) => ({
        invoiceId: a.invoiceId,
        amount: parseFloat(a.applyAmount),
      }));

    if (items.length === 0) {
      toast({ title: 'No allocations', description: 'Enter at least one amount to apply.', variant: 'destructive' });
      return;
    }

    const totalAllocated = items.reduce((sum, i) => sum + i.amount, 0);
    const paymentAmount = parseFloat(paymentForm.amount);
    if (totalAllocated > paymentAmount + 0.01) {
      toast({
        title: 'Over-allocated',
        description: `Total allocated (${formatCurrency(totalAllocated)}) exceeds payment amount (${formatCurrency(paymentAmount)}).`,
        variant: 'destructive',
      });
      return;
    }

    allocateMutation.mutate({ paymentId: createdPaymentId, allocations: items });
  };

  const updateAllocation = (index: number, value: string) => {
    setAllocations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], applyAmount: value };
      return next;
    });
  };

  const totalAllocated = allocations.reduce(
    (sum, a) => sum + (parseFloat(a.applyAmount) || 0),
    0
  );

  const filteredPayments = payments.filter((p: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.customerName || '').toLowerCase().includes(q) ||
      (p.referenceNumber || '').toLowerCase().includes(q) ||
      (p.paymentMethod || '').toLowerCase().includes(q)
    );
  });

  const handleAllocateExisting = async (payment: any) => {
    try {
      const res = await fetch(
        `/api/ar-invoices?customerId=${encodeURIComponent(payment.customerId)}`,
        { credentials: 'include' }
      );
      const invoices = res.ok ? await res.json() : [];
      const openInvoices = invoices.filter(
        (inv: any) => inv.status !== 'PAID' && inv.status !== 'VOID' && parseFloat(inv.balance || inv.totalAmount) > 0
      );

      const allocated = parseFloat(payment.allocatedAmount || '0');
      const remaining = parseFloat(payment.amount) - allocated;

      setCreatedPaymentId(payment.id);
      setPaymentForm((prev) => ({ ...prev, amount: String(remaining), customerId: payment.customerId }));
      setAllocations(
        openInvoices.map((inv: any) => ({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          totalAmount: inv.totalAmount,
          balance: String(parseFloat(inv.balance ?? inv.totalAmount)),
          applyAmount: '',
        }))
      );
      setAllocationDialogOpen(true);
    } catch {
      toast({ title: 'Error', description: 'Failed to load invoices for allocation.', variant: 'destructive' });
    }
  };

  const handleDeletePayment = (paymentId: string) => {
    if (confirm('Delete this payment? This will also remove all allocations and revert affected invoice statuses.')) {
      deleteMutation.mutate(paymentId);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6" />
          <h1 className="text-2xl font-bold">AR Payments</h1>
        </div>
        <Button onClick={() => { setPaymentForm(defaultPaymentForm()); setCreateDialogOpen(true); }}>
          <DollarSign className="mr-2 h-4 w-4" />
          Record Payment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer, reference, or method..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="mx-auto h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg">No AR payments found</p>
              <p className="text-sm">Record a payment to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment: any) => {
                  const allocated = parseFloat(payment.allocatedAmount || '0');
                  const amount = parseFloat(payment.amount || '0');
                  const fullyAllocated = Math.abs(allocated - amount) < 0.01;
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                      <TableCell className="font-medium">{payment.customerName || payment.customerId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{payment.paymentMethod}</Badge>
                      </TableCell>
                      <TableCell>{payment.referenceNumber || '—'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(payment.amount)}</TableCell>
                      <TableCell className="text-right">
                        <span className={fullyAllocated ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                          {formatCurrency(allocated)}
                        </span>
                        {!fullyAllocated && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({formatCurrency(amount - allocated)} unallocated)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!fullyAllocated && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleAllocateExisting(payment)}
                              title="Allocate payment to invoices"
                            >
                              <DollarSign className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeletePayment(payment.id)}
                            disabled={deleteMutation.isPending}
                            title="Delete payment"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a new AR payment for a customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={paymentForm.customerId}
                onValueChange={(v) => setPaymentForm((p) => ({ ...p, customerId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: any) => (
                    <SelectItem key={c.customerId} value={c.customerId}>
                      {c.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={paymentForm.paymentDate}
                onChange={(e) => setPaymentForm((p) => ({ ...p, paymentDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={paymentForm.paymentMethod}
                onValueChange={(v) => setPaymentForm((p) => ({ ...p, paymentMethod: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference Number</Label>
              <Input
                value={paymentForm.referenceNumber}
                onChange={(e) => setPaymentForm((p) => ({ ...p, referenceNumber: e.target.value }))}
                placeholder="Check #, wire ref, etc."
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitPayment} disabled={createPaymentMutation.isPending}>
              {createPaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={allocationDialogOpen} onOpenChange={setAllocationDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Payment</DialogTitle>
            <DialogDescription>
              Allocate {formatCurrency(paymentForm.amount)} across open invoices.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right w-36">Apply Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No open invoices found for this customer
                    </TableCell>
                  </TableRow>
                ) : (
                  allocations.map((row, idx) => {
                    const bal = parseFloat(row.balance);
                    const applied = parseFloat(row.applyAmount) || 0;
                    const overApplied = applied > bal + 0.01;
                    return (
                      <TableRow key={row.invoiceId}>
                        <TableCell className="font-medium">{row.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(row.invoiceDate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.totalAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.balance)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            max={row.balance}
                            value={row.applyAmount}
                            onChange={(e) => updateAllocation(idx, e.target.value)}
                            className={`w-32 text-right ${overApplied ? 'border-destructive' : ''}`}
                            placeholder="0.00"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            <Separator />

            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Payment: <span className="font-medium text-foreground">{formatCurrency(paymentForm.amount)}</span>
              </div>
              <div className="text-sm">
                Allocated:{' '}
                <span className={`font-bold ${totalAllocated > parseFloat(paymentForm.amount) + 0.01 ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>
                  {formatCurrency(totalAllocated)}
                </span>
                {parseFloat(paymentForm.amount) - totalAllocated > 0.01 && (
                  <span className="text-muted-foreground ml-2">
                    ({formatCurrency(parseFloat(paymentForm.amount) - totalAllocated)} unallocated)
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocationDialogOpen(false)}>Skip</Button>
            <Button
              onClick={handleSubmitAllocation}
              disabled={allocateMutation.isPending || totalAllocated === 0}
            >
              {allocateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Allocate Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

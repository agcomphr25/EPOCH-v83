import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  DollarSign,
  Search,
  Trash2,
  Loader2,
  CreditCard,
  Eye,
  Paperclip,
  FileText,
  Pencil,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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

interface OpenInvoiceCheckItem {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: string | null;
  balance: string;
  checked: boolean;
}

function statusBadgeVariant(status: string | null | undefined) {
  if (!status) return 'outline';
  switch (status.toUpperCase()) {
    case 'PAID': return 'default';
    case 'OPEN': return 'secondary';
    case 'PARTIAL': return 'outline';
    case 'OVERDUE': return 'destructive';
    case 'VOID': return 'outline';
    default: return 'outline';
  }
}

interface CustomerPaymentGroup {
  customerId: string;
  customerName: string;
  payments: any[];
  totalPaid: number;
}

function groupPaymentsByCustomer(payments: any[]): CustomerPaymentGroup[] {
  const map = new Map<string, CustomerPaymentGroup>();
  for (const p of payments) {
    const key = p.customerId;
    if (!map.has(key)) {
      map.set(key, {
        customerId: p.customerId,
        customerName: p.customerName || p.customerId,
        payments: [],
        totalPaid: 0,
      });
    }
    const group = map.get(key)!;
    group.payments.push(p);
    if (p.status !== 'voided') {
      group.totalPaid += parseFloat(p.amount || '0');
    }
  }
  return Array.from(map.values());
}

function PaymentReceiptIndicator({ paymentId }: { paymentId: string }) {
  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ['/api/ar-payment-attachments', paymentId],
    staleTime: 30_000,
  });
  if (attachments.length === 0) return null;
  return (
    <a
      href={`/api/ar-payment-attachments/download/${attachments[0].id}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Receipt: ${attachments[0].fileName}`}
      className="inline-flex items-center text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      onClick={(e) => e.stopPropagation()}
    >
      <FileText className="h-4 w-4" />
    </a>
  );
}

export default function ARPaymentsPage() {
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(defaultPaymentForm());
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const [openInvoiceItems, setOpenInvoiceItems] = useState<OpenInvoiceCheckItem[]>([]);
  const [openInvoicesLoading, setOpenInvoicesLoading] = useState(false);
  const [amountManuallyEdited, setAmountManuallyEdited] = useState(false);

  const [detailPaymentId, setDetailPaymentId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPayment, setEditPayment] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<Omit<PaymentFormData, 'customerId'>>({
    paymentDate: '',
    paymentMethod: '',
    referenceNumber: '',
    amount: '',
    notes: '',
  });
  const [editError, setEditError] = useState<string | null>(null);

  const { data: payments = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/ar-payments'],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: paymentDetail, isLoading: detailLoading } = useQuery<any>({
    queryKey: ['/api/ar-payments', detailPaymentId],
    enabled: !!detailPaymentId && detailDialogOpen,
  });

  const { data: detailAttachments = [] } = useQuery<any[]>({
    queryKey: ['/api/ar-payment-attachments', detailPaymentId],
    enabled: !!detailPaymentId && detailDialogOpen,
  });

  const fetchOpenInvoicesForCustomer = async (customerId: string) => {
    if (!customerId) {
      setOpenInvoiceItems([]);
      return;
    }
    setOpenInvoicesLoading(true);
    try {
      const res = await fetch(
        `/api/ar-invoices?customerId=${encodeURIComponent(customerId)}`,
        { credentials: 'include' }
      );
      const invoices = res.ok ? await res.json() : [];
      const open = (invoices || []).filter(
        (inv: any) => inv.status !== 'PAID' && inv.status !== 'VOID' && parseFloat(inv.balance ?? inv.totalAmount) > 0
      );
      setOpenInvoiceItems(open.map((inv: any) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        dueDate: inv.dueDate || null,
        balance: String(parseFloat(inv.balance ?? inv.totalAmount)),
        checked: false,
      })));
    } catch {
      setOpenInvoiceItems([]);
    } finally {
      setOpenInvoicesLoading(false);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    setPaymentForm((p) => ({ ...p, customerId, amount: '' }));
    setAmountManuallyEdited(false);
    setOpenInvoiceItems([]);
    fetchOpenInvoicesForCustomer(customerId);
  };

  const handleInvoiceCheckChange = (invoiceId: string, checked: boolean) => {
    const updated = openInvoiceItems.map((item) =>
      item.invoiceId === invoiceId ? { ...item, checked } : item
    );
    setOpenInvoiceItems(updated);

    if (!amountManuallyEdited) {
      const total = updated
        .filter((item) => item.checked)
        .reduce((sum, item) => sum + parseFloat(item.balance), 0);
      setPaymentForm((p) => ({ ...p, amount: total > 0 ? total.toFixed(2) : '' }));
    }
  };

  const handleAmountChange = (val: string) => {
    setAmountManuallyEdited(true);
    setPaymentForm((p) => ({ ...p, amount: val }));
  };

  const checkedInvoices = openInvoiceItems.filter((i) => i.checked);

  const uploadReceiptPdf = async (file: File, paymentId: string) => {
    const urlRes = await apiRequest('/api/ar-payment-attachments/request-upload-url', {
      method: 'POST',
      body: { name: file.name, size: file.size, paymentId },
    });
    const putRes = await fetch(urlRes.uploadURL, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' },
    });
    if (!putRes.ok) {
      throw new Error(`Receipt upload to storage failed (${putRes.status})`);
    }
    await apiRequest('/api/ar-payment-attachments/complete-upload', {
      method: 'POST',
      body: {
        objectPath: urlRes.objectPath,
        paymentId,
        originalFileName: file.name,
        fileSize: file.size,
      },
    });
    queryClient.invalidateQueries({ queryKey: ['/api/ar-payment-attachments', paymentId] });
  };

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

      if (receiptFile) {
        setReceiptUploading(true);
        try {
          await uploadReceiptPdf(receiptFile, result.id);
        } catch (uploadErr: any) {
          console.warn('Receipt upload failed:', uploadErr);
          // Surface the error to the user but don't block payment success
          toast({
            title: 'Receipt not attached',
            description: uploadErr?.message || 'The PDF could not be uploaded. The payment was still recorded.',
            variant: 'destructive',
          });
        } finally {
          setReceiptUploading(false);
        }
      }

      if (checkedInvoices.length > 0) {
        const paymentAmount = parseFloat(data.amount);
        let remaining = paymentAmount;
        const allocItems: { invoiceId: string; amount: number }[] = [];

        for (const inv of checkedInvoices) {
          if (remaining <= 0.005) break;
          const bal = parseFloat(inv.balance);
          const apply = Math.min(bal, remaining);
          allocItems.push({ invoiceId: inv.invoiceId, amount: parseFloat(apply.toFixed(2)) });
          remaining -= apply;
        }

        if (allocItems.length > 0) {
          await apiRequest(`/api/ar-payments/${result.id}/allocate`, {
            method: 'POST',
            body: allocItems,
          });
        }

        return { payment: result, autoAllocated: true };
      }

      const invoicesRes = await fetch(
        `/api/ar-invoices?customerId=${encodeURIComponent(data.customerId)}`,
        { credentials: 'include' }
      );
      const freshInvoices = invoicesRes.ok ? await invoicesRes.json() : [];
      return { payment: result, invoices: freshInvoices, autoAllocated: false };
    },
    onSuccess: ({ payment, invoices, autoAllocated }: any) => {
      if (autoAllocated) {
        toast({ title: 'Payment recorded and allocated' });
        setCreateDialogOpen(false);
        setPaymentForm(defaultPaymentForm());
        setOpenInvoiceItems([]);
        setAmountManuallyEdited(false);
        setReceiptFile(null);
      } else {
        toast({ title: 'Payment recorded' });
        setCreatedPaymentId(payment.id);
        setCreateDialogOpen(false);
        setReceiptFile(null);

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
      }

      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && (
            query.queryKey[0] === '/api/ar-payments' || query.queryKey[0] === '/api/ar-invoices'
          ),
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
      setOpenInvoiceItems([]);
      setAmountManuallyEdited(false);
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
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiRequest(`/api/ar-payments/${paymentId}`, { method: 'DELETE', body: { reason } }),
    onSuccess: () => {
      toast({ title: 'Payment voided' });
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

  const editMutation = useMutation({
    mutationFn: (data: { id: string } & Omit<PaymentFormData, 'customerId'>) =>
      apiRequest(`/api/ar-payments/${data.id}`, {
        method: 'PUT',
        body: {
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          referenceNumber: data.referenceNumber || null,
          amount: data.amount,
          notes: data.notes || null,
        },
      }),
    onSuccess: () => {
      toast({ title: 'Payment updated' });
      setEditDialogOpen(false);
      setEditPayment(null);
      setEditError(null);
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) && (
            query.queryKey[0] === '/api/ar-payments' || query.queryKey[0] === '/api/ar-invoices'
          ),
      });
    },
    onError: (error: any) => {
      setEditError(error.message || 'Failed to update payment');
    },
  });

  const handleOpenEditDialog = (payment: any) => {
    setEditPayment(payment);
    setEditForm({
      paymentDate: payment.paymentDate ? payment.paymentDate.split('T')[0] : '',
      paymentMethod: payment.paymentMethod || '',
      referenceNumber: payment.referenceNumber || '',
      amount: payment.amount || '',
      notes: payment.notes || '',
    });
    setEditError(null);
    setEditDialogOpen(true);
  };

  const handleSubmitEdit = () => {
    if (!editPayment) return;
    if (!editForm.paymentMethod) {
      setEditError('Payment method is required.');
      return;
    }
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) {
      setEditError('Amount must be greater than zero.');
      return;
    }
    setEditError(null);
    editMutation.mutate({ id: editPayment.id, ...editForm });
  };

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

  const customerGroups = groupPaymentsByCustomer(filteredPayments);

  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const customerGroupKey = customerGroups.map((g) => g.customerId).join('|');

  useEffect(() => {
    if (customerGroups.length === 1) {
      setOpenAccordions([customerGroups[0].customerId]);
    } else {
      setOpenAccordions((prev) => prev.filter((id) => customerGroups.some((g) => g.customerId === id)));
    }
  }, [customerGroupKey]);

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
    const reason = window.prompt('Enter a reason for voiding this payment. The original payment and allocations will remain visible for audit.');
    if (reason?.trim()) {
      deleteMutation.mutate({ paymentId, reason: reason.trim() });
    }
  };

  const handleViewDetails = (payment: any) => {
    setDetailPaymentId(payment.id);
    setDetailDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6" />
          <h1 className="text-2xl font-bold">AR Payments</h1>
        </div>
        <Button onClick={() => { setPaymentForm(defaultPaymentForm()); setOpenInvoiceItems([]); setAmountManuallyEdited(false); setReceiptFile(null); setCreateDialogOpen(true); }}>
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
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : customerGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="mx-auto h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg">No AR payments found</p>
              <p className="text-sm">Record a payment to get started.</p>
            </div>
          ) : (
            <Accordion
              type="multiple"
              value={openAccordions}
              onValueChange={setOpenAccordions}
              className="divide-y"
            >
              {customerGroups.map((group) => (
                <AccordionItem
                  key={group.customerId}
                  value={group.customerId}
                  className="border-0"
                >
                  <AccordionTrigger className="px-4 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="flex items-center gap-4 text-left">
                      <span className="font-semibold text-base">{group.customerName}</span>
                      <span className="text-sm text-muted-foreground">
                        {group.payments.length} payment{group.payments.length !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" />
                        {formatCurrency(group.totalPaid)} total paid
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="w-8"></TableHead>
                          <TableHead className="w-28"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.payments.map((payment: any) => {
                          const allocated = parseFloat(payment.allocatedAmount || '0');
                          const amount = parseFloat(payment.amount || '0');
                          const fullyAllocated = Math.abs(allocated - amount) < 0.01;
                          return (
                            <TableRow key={payment.id}>
                              <TableCell>{formatDate(payment.paymentDate)}</TableCell>
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
                                <PaymentReceiptIndicator paymentId={payment.id} />
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleOpenEditDialog(payment)}
                                    title="Edit payment"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleViewDetails(payment)}
                                    title="View payment details"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
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
                                    disabled={deleteMutation.isPending || payment.status === 'voided'}
                                    title={payment.status === 'voided' ? 'Payment already voided' : 'Void payment'}
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
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                onValueChange={handleCustomerChange}
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

            {paymentForm.customerId && (
              <div className="space-y-2">
                <Label>Open Invoices</Label>
                {openInvoicesLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading open invoices...
                  </div>
                ) : openInvoiceItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No open invoices for this customer.</p>
                ) : (
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {openInvoiceItems.map((item) => (
                      <div key={item.invoiceId} className="flex items-center gap-3 px-3 py-2">
                        <Checkbox
                          id={`inv-${item.invoiceId}`}
                          checked={item.checked}
                          onCheckedChange={(checked) => handleInvoiceCheckChange(item.invoiceId, !!checked)}
                        />
                        <label
                          htmlFor={`inv-${item.invoiceId}`}
                          className="flex flex-1 items-center justify-between text-sm cursor-pointer"
                        >
                          <span className="font-medium">{item.invoiceNumber}</span>
                          <span className="text-muted-foreground">
                            {item.dueDate ? `Due ${formatDate(item.dueDate)}` : 'No due date'}
                          </span>
                          <span className="font-medium">{formatCurrency(item.balance)}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {checkedInvoices.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {checkedInvoices.length} invoice{checkedInvoices.length > 1 ? 's' : ''} selected — amount auto-filled. You can override it below.
                  </p>
                )}
              </div>
            )}

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
                onChange={(e) => handleAmountChange(e.target.value)}
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
            <div className="space-y-2">
              <Label>Receipt / Remittance (PDF)</Label>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="receipt-pdf-input"
                  className="flex items-center gap-2 px-3 py-2 text-sm border rounded-md cursor-pointer hover:bg-muted transition-colors"
                >
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  {receiptFile ? (
                    <span className="text-foreground font-medium truncate max-w-[200px]">{receiptFile.name}</span>
                  ) : (
                    <span className="text-muted-foreground">Choose PDF file (optional)</span>
                  )}
                </label>
                <input
                  id="receipt-pdf-input"
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                />
                {receiptFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setReceiptFile(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitPayment} disabled={createPaymentMutation.isPending || receiptUploading}>
              {(createPaymentMutation.isPending || receiptUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

      <Dialog open={detailDialogOpen} onOpenChange={(open) => { setDetailDialogOpen(open); if (!open) setDetailPaymentId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
            {paymentDetail && (
              <DialogDescription>
                {paymentDetail.customerName || paymentDetail.customerId} — {formatDate(paymentDetail.paymentDate)} — {paymentDetail.paymentMethod}
                {paymentDetail.referenceNumber ? ` — Ref: ${paymentDetail.referenceNumber}` : ''}
              </DialogDescription>
            )}
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : paymentDetail ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Payment Amount</span>
                <span className="font-semibold">{formatCurrency(paymentDetail.amount)}</span>
              </div>

              <Separator />

              {(!paymentDetail.allocations || paymentDetail.allocations.length === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No invoices have been allocated to this payment yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Invoice Total</TableHead>
                      <TableHead className="text-right">Amount Applied</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentDetail.allocations.map((alloc: any) => (
                      <TableRow key={alloc.id}>
                        <TableCell className="font-medium">{alloc.invoiceNumber || '—'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(alloc.invoiceTotalAmount)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(alloc.amountApplied)}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(alloc.invoiceStatus)}>
                            {alloc.invoiceStatus || '—'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {paymentDetail.allocations && paymentDetail.allocations.length > 0 && (
                <>
                  <Separator />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Allocated</span>
                    <span className="font-semibold">
                      {formatCurrency(
                        paymentDetail.allocations.reduce(
                          (sum: number, a: any) => sum + parseFloat(a.amountApplied || '0'),
                          0
                        )
                      )}
                    </span>
                  </div>
                </>
              )}

              {paymentDetail.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes: </span>
                  <span>{paymentDetail.notes}</span>
                </div>
              )}

              {detailAttachments.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Attachments</p>
                    {detailAttachments.map((att: any) => (
                      <a
                        key={att.id}
                        href={`/api/ar-payment-attachments/download/${att.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="underline truncate">{att.fileName}</span>
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(open) => { setEditDialogOpen(open); if (!open) { setEditPayment(null); setEditError(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            {editPayment && (
              <DialogDescription>
                {editPayment.customerName || editPayment.customerId} — editing payment details
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-4">
            {editPayment && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Customer</Label>
                <p className="text-sm font-medium">{editPayment.customerName || editPayment.customerId}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input
                type="date"
                value={editForm.paymentDate}
                onChange={(e) => setEditForm((f) => ({ ...f, paymentDate: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={editForm.paymentMethod}
                onValueChange={(v) => setEditForm((f) => ({ ...f, paymentMethod: v }))}
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
                value={editForm.referenceNumber}
                onChange={(e) => setEditForm((f) => ({ ...f, referenceNumber: e.target.value }))}
                placeholder="Check #, wire ref, etc."
              />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />
              {editPayment && parseFloat(editPayment.allocatedAmount || '0') > 0 && (
                <p className="text-xs text-muted-foreground">
                  Already allocated: {formatCurrency(editPayment.allocatedAmount)} — amount cannot go below this.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
            {editError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitEdit} disabled={editMutation.isPending}>
              {editMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

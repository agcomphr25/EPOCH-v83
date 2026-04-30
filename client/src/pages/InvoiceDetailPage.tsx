import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation, Link } from 'wouter';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  FileText,
  Paperclip,
  DollarSign,
  CreditCard,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import MediaAttachmentPicker from '@/components/MediaAttachmentPicker';

const PAYMENT_METHODS = [
  { value: 'ACH', label: 'ACH' },
  { value: 'Wire', label: 'Wire' },
  { value: 'Check', label: 'Check' },
  { value: 'Credit Card', label: 'Credit Card' },
  { value: 'Cash', label: 'Cash' },
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    PAID: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    VOID: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };
  return (
    <Badge className={map[status] || ''} variant="outline">
      {status}
    </Badge>
  );
}

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
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string;
  amount: string;
  notes: string;
}

const defaultPaymentForm = (): PaymentFormData => ({
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

export default function InvoiceDetailPage() {
  const [, setLocation] = useLocation();
  const [matched, params] = useRoute('/finance/invoices/:id');
  const id = params?.id;
  const { toast } = useToast();

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(defaultPaymentForm());
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: ['/api/ar-invoices', id],
    enabled: !!id,
  });

  const { data: linkedCreditMemos = [] } = useQuery<any[]>({
    queryKey: ['/api/credit-memos/invoice', id],
    queryFn: () => fetch(`/api/credit-memos/invoice/${id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    enabled: !!id,
  });

  const { data: packingSlipInfo } = useQuery<any>({
    queryKey: ['/api/p2/packing-slips', invoice?.packingSlipId],
    queryFn: () => fetch(`/api/p2/packing-slips/${invoice.packingSlipId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    enabled: !!invoice?.packingSlipId,
  });

  const { data: lotInfo } = useQuery<any>({
    queryKey: ['/api/p2/lots', invoice?.lotId],
    queryFn: () => fetch(`/api/p2/lots/${invoice.lotId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    enabled: !!invoice?.lotId,
  });

  const markPaidMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/ar-invoices/${id}`, {
        method: 'PUT',
        body: { status: 'PAID' },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      toast({ title: 'Invoice marked as paid' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      const result = await apiRequest('/api/ar-payments', {
        method: 'POST',
        body: {
          customerId: invoice.customerId,
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          amount: data.amount,
          referenceNumber: data.referenceNumber || null,
          notes: data.notes || null,
        },
      });
      const invoicesRes = await fetch(
        `/api/ar-invoices?customerId=${encodeURIComponent(invoice.customerId)}`,
        { credentials: 'include' }
      );
      const freshInvoices = invoicesRes.ok ? await invoicesRes.json() : [];
      return { payment: result, invoices: freshInvoices };
    },
    onSuccess: ({ payment, invoices }: any) => {
      toast({ title: 'Payment recorded' });
      setCreatedPaymentId(payment.id);
      setPaymentDialogOpen(false);

      const openInvoices = (invoices || []).filter(
        (inv: any) => inv.status !== 'PAID' && inv.status !== 'VOID' && parseFloat(inv.balance || inv.totalAmount) > 0
      );

      const currentBalance = parseFloat(invoice.balance ?? invoice.totalAmount);
      const paymentAmount = parseFloat(paymentForm.amount);

      setAllocations(
        openInvoices.map((inv: any) => {
          const bal = parseFloat(inv.balance ?? inv.totalAmount);
          let prefill = '';
          if (inv.id === id) {
            prefill = String(Math.min(paymentAmount, currentBalance));
          }
          return {
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            totalAmount: inv.totalAmount,
            balance: String(bal),
            applyAmount: prefill,
          };
        })
      );
      setAllocationDialogOpen(true);
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
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && (
          (Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices') ||
          (Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-payments')
        )
      });
    },
    onError: (error: any) => {
      toast({ title: 'Allocation failed', description: error.message, variant: 'destructive' });
    },
  });

  const handleOpenPaymentDialog = () => {
    setPaymentForm({
      ...defaultPaymentForm(),
      amount: String(parseFloat(invoice.balance ?? invoice.totalAmount ?? '0')),
    });
    setPaymentDialogOpen(true);
  };

  const handleSubmitPayment = () => {
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

  if (!matched) return null;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-muted-foreground">Invoice not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => setLocation('/finance/invoices')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
        </Button>
      </div>
    );
  }

  const lines = invoice.lines || [];
  const payments = invoice.payments || [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Invoice {invoice.invoiceNumber}</h1>
          {statusBadge(invoice.status)}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setLocation('/finance/invoices')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/finance/invoices/${id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </Button>
          {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
            <>
              <Button variant="outline" onClick={handleOpenPaymentDialog}>
                <DollarSign className="mr-2 h-4 w-4" />
                Apply Payment
              </Button>
              <Button
                onClick={() => markPaidMutation.mutate()}
                disabled={markPaidMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {markPaidMutation.isPending ? 'Updating...' : 'Mark Paid'}
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="line-items">Line Items</TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />
            Payments
            {payments.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {payments.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="credit-memos" className="flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" />
            Credit Memos
            {linkedCreditMemos.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {linkedCreditMemos.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="attachments" className="flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5" />
            Attachments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent>
              {(invoice.pricingMismatch || invoice.pricingAmbiguous) && (
                <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Pricing requires review</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {invoice.pricingMismatch && (
                        <Badge className="bg-yellow-100 text-yellow-800 text-xs hover:bg-yellow-100">Pricing Mismatch</Badge>
                      )}
                      {invoice.pricingAmbiguous && (
                        <Badge className="bg-orange-100 text-orange-800 text-xs hover:bg-orange-100">Pricing Ambiguous</Badge>
                      )}
                    </div>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                      This invoice was auto-created but pricing could not be fully resolved from the PO. Please review and correct line items before posting.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{invoice.customerName || invoice.customerId}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Invoice #</p>
                  <p className="font-medium">{invoice.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="mt-1">{statusBadge(invoice.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{formatDate(invoice.invoiceDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{formatDate(invoice.dueDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Terms</p>
                  <p className="font-medium">{invoice.terms || '—'}</p>
                </div>
                {(invoice.poId || invoice.poOverride) && (
                  <div>
                    <p className="text-sm text-muted-foreground">PO</p>
                    <p className="font-medium">{invoice.poOverride || invoice.poNumber || invoice.poId || '—'}</p>
                  </div>
                )}
              </div>

              {(invoice.packingSlipId || invoice.lotId || invoice.poOverride || invoice.poId) && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-sm font-medium mb-2">Source Documents</p>
                    <div className="flex flex-wrap gap-2">
                      {invoice.packingSlipId && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/p2/packing-slip/${invoice.packingSlipId}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Packing Slip{packingSlipInfo?.packingSlipNumber ? ` ${packingSlipInfo.packingSlipNumber}` : ''}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                      {invoice.lotId && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/p2/shipments/${invoice.lotId}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Lot{lotInfo?.lotNumber ? ` ${lotInfo.lotNumber}` : ' Record'}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                      {(invoice.poOverride || invoice.poId) && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/p2-control-center?tab=pos&search=${encodeURIComponent(invoice.poOverride || invoice.poNumber || '')}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            PO: {invoice.poOverride || invoice.poNumber || invoice.poId}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator className="my-4" />

              <div className="flex flex-col items-end gap-1">
                <div className="flex justify-between w-56">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between w-56">
                  <span className="text-muted-foreground">Tax:</span>
                  <span className="font-medium">{formatCurrency(invoice.taxAmount)}</span>
                </div>
                <Separator className="w-56 my-1" />
                <div className="flex justify-between w-56">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold">{formatCurrency(invoice.totalAmount)}</span>
                </div>
                {invoice.amountPaid !== undefined && (
                  <>
                    <div className="flex justify-between w-56">
                      <span className="text-muted-foreground">Paid:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(invoice.amountPaid)}
                      </span>
                    </div>
                    <Separator className="w-56 my-1" />
                    <div className="flex justify-between w-56">
                      <span className="font-bold">Balance Due:</span>
                      <span className="font-bold">{formatCurrency(invoice.balance)}</span>
                    </div>
                  </>
                )}
              </div>

              {invoice.notes && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="mt-1">{invoice.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="line-items" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No line items
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line: any, idx: number) => (
                      <TableRow key={line.id || idx}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell className="text-right">{line.qty}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <Separator className="my-4" />

              <div className="flex flex-col items-end gap-1">
                <div className="flex justify-between w-48">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between w-48">
                  <span className="text-muted-foreground">Tax:</span>
                  <span className="font-medium">{formatCurrency(invoice.taxAmount)}</span>
                </div>
                <Separator className="w-48 my-1" />
                <div className="flex justify-between w-48">
                  <span className="font-bold">Total:</span>
                  <span className="font-bold">{formatCurrency(invoice.totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment History
                </span>
                {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
                  <Button variant="outline" size="sm" onClick={handleOpenPaymentDialog}>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Apply Payment
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="mx-auto h-10 w-10 mb-2 opacity-40" />
                  <p>No payments recorded for this invoice.</p>
                  {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
                    <Button variant="link" className="mt-2" onClick={handleOpenPaymentDialog}>
                      Record a payment
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Payment ID</TableHead>
                        <TableHead className="text-right">Amount Applied</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell>{formatDate(p.createdAt)}</TableCell>
                          <TableCell className="font-mono text-xs">{p.paymentId?.slice(0, 8)}...</TableCell>
                          <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                            {formatCurrency(p.amountApplied)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Separator className="my-4" />
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex justify-between w-56">
                      <span className="text-muted-foreground">Total Paid:</span>
                      <span className="font-medium text-green-600 dark:text-green-400">
                        {formatCurrency(invoice.amountPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between w-56">
                      <span className="font-bold">Balance Due:</span>
                      <span className="font-bold">{formatCurrency(invoice.balance)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credit-memos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Credit Memos
                {linkedCreditMemos.length > 0 && (
                  <Badge variant="secondary">{linkedCreditMemos.length}</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-3">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/credit-memo${invoice?.customerId ? `?customerId=${invoice.customerId}` : ''}`}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Manage Credit Memos
                    <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                  </Link>
                </Button>
              </div>
              {linkedCreditMemos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <RotateCcw className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground">No credit memos are linked to this invoice.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {linkedCreditMemos.map((cm: any) => (
                    <Link key={cm.id} href={`/credit-memo${invoice?.customerId ? `?customerId=${invoice.customerId}` : ''}`} className="block">
                      <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer">
                        <div>
                          <p className="text-sm font-medium font-mono">{cm.memoNumber}</p>
                          <p className="text-xs text-muted-foreground">{cm.reason}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(cm.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                            {formatCurrency(cm.amount)}
                          </span>
                          <Badge className={
                            cm.status === 'APPLIED' ? 'bg-green-100 text-green-800' :
                            cm.status === 'DRAFT' ? 'bg-gray-100 text-gray-700' :
                            cm.status === 'VOID' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }>{cm.status}</Badge>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-60" />
                        </div>
                      </div>
                    </Link>
                  ))}
                  <div className="flex justify-end pt-2 border-t">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Total Credit Applied:</span>
                      <span className="font-semibold text-green-700 dark:text-green-400">
                        {formatCurrency(linkedCreditMemos.reduce((sum: number, cm: any) => sum + Number(cm.amount || 0), 0))}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MediaAttachmentPicker
                entityType="invoice"
                entityId={invoice.id}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {invoice.customerName || invoice.customerId}.
              Invoice balance: {formatCurrency(invoice.balance ?? invoice.totalAmount)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
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
              Allocate {formatCurrency(paymentForm.amount)} across open invoices for this customer.
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
                      No open invoices found
                    </TableCell>
                  </TableRow>
                ) : (
                  allocations.map((row, idx) => {
                    const bal = parseFloat(row.balance);
                    const applied = parseFloat(row.applyAmount) || 0;
                    const overApplied = applied > bal + 0.01;
                    return (
                      <TableRow key={row.invoiceId} className={row.invoiceId === id ? 'bg-muted/50' : ''}>
                        <TableCell className="font-medium">
                          {row.invoiceNumber}
                          {row.invoiceId === id && (
                            <Badge variant="secondary" className="ml-2 text-xs">Current</Badge>
                          )}
                        </TableCell>
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
                Payment Amount: <span className="font-medium text-foreground">{formatCurrency(paymentForm.amount)}</span>
              </div>
              <div className="text-sm">
                Total Allocated:{' '}
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
            <Button variant="outline" onClick={() => setAllocationDialogOpen(false)}>
              Skip Allocation
            </Button>
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

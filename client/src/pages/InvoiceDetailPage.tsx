import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation, Link } from 'wouter';
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
  Send,
  Printer,
  History,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import AuditDrawer from '@/components/AuditDrawer';
import { formatDateOnly } from '@shared/utils/dateNormalization';

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
    DRAFT: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200',
    REVIEW: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
    POSTED: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
    SENT: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200',
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
    return formatDateOnly(val);
  } catch {
    return val;
  }
}

function formatFileSize(bytes: number | null | undefined) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
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

type EmailRecipient = {
  name: string;
  email: string;
  type: 'primary' | 'additional' | 'contact';
};

type InvoiceAttachment = {
  attachment: {
    id: string;
    mediaId: string;
    entityType: string;
    entityId: string;
  };
  media: {
    id: string;
    filename: string;
    title?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
  };
};

type SendInvoicePayload = {
  recipients: string[];
  attachmentMediaIds: string[];
};

function RecipientPickerList({
  recipients,
  selected,
  onChange,
  isLoading,
}: {
  recipients: EmailRecipient[];
  selected: string[];
  onChange: (emails: string[]) => void;
  isLoading: boolean;
}) {
  const toggle = (email: string) => {
    if (selected.includes(email)) {
      onChange(selected.filter((item) => item !== email));
    } else {
      onChange([...selected, email]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recipients...
      </div>
    );
  }

  if (recipients.length === 0) {
    return <div className="py-2 text-sm text-muted-foreground italic">No customer email recipients found.</div>;
  }

  return (
    <div className="space-y-2 py-1">
      {recipients.map((recipient) => (
        <div
          key={recipient.email}
          className="flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/40"
          onClick={() => toggle(recipient.email)}
        >
          <Checkbox
            id={`invoice-recipient-${recipient.email}`}
            checked={selected.includes(recipient.email)}
            onCheckedChange={() => toggle(recipient.email)}
            onClick={(event) => event.stopPropagation()}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{recipient.name}</div>
            <div className="truncate text-xs text-muted-foreground">{recipient.email}</div>
          </div>
          {recipient.type === 'primary' && (
            <span className="mt-0.5 shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
              Primary
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function InvoiceDetailPage() {
  const [, setLocation] = useLocation();
  const [matched, params] = useRoute('/finance/invoices/:id');
  const id = params?.id;
  const { toast } = useToast();

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [isPreviewingPdf, setIsPreviewingPdf] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>(defaultPaymentForm());
  const [createdPaymentId, setCreatedPaymentId] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [dialogRecipients, setDialogRecipients] = useState<EmailRecipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedAttachmentMediaIds, setSelectedAttachmentMediaIds] = useState<string[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: ['/api/ar-invoices', id],
    enabled: !!id,
  });

  const { data: linkedCreditMemos = [] } = useQuery<any[]>({
    queryKey: ['/api/credit-memos/invoice', id],
    queryFn: () => fetch(`/api/credit-memos/invoice/${id}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    enabled: !!id,
  });

  const { data: invoiceAttachments = [], isLoading: isLoadingInvoiceAttachments } = useQuery<InvoiceAttachment[]>({
    queryKey: ['/api/media/attachments', 'invoice', id],
    queryFn: async () => {
      const res = await fetch(`/api/media/attachments/invoice/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load invoice attachments');
      return res.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!sendDialogOpen) return;
    setSelectedAttachmentMediaIds(invoiceAttachments.map((item) => item.media.id));
  }, [sendDialogOpen, invoiceAttachments]);

  const { data: packingSlipInfo } = useQuery<any>({
    queryKey: ['/api/p2/packing-slips', invoice?.packingSlipId],
    queryFn: () => fetch(`/api/p2/packing-slips/${invoice.packingSlipId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    enabled: !!invoice?.packingSlipId && invoice?.invoiceSource !== 'P1',
  });

  const { data: lotInfo } = useQuery<any>({
    queryKey: ['/api/p2/lots', invoice?.lotId],
    queryFn: () => fetch(`/api/p2/lots/${invoice.lotId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
    enabled: !!invoice?.lotId && invoice?.invoiceSource !== 'P1',
  });

  const postInvoiceMutation = useMutation({
    mutationFn: () => apiRequest(`/api/ar-invoices/${id}/post`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      toast({ title: 'Invoice posted', description: 'Invoice is ready to send.' });
    },
    onError: (error: any) => {
      toast({ title: 'Post failed', description: error.message, variant: 'destructive' });
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: ({ recipients, attachmentMediaIds }: SendInvoicePayload) =>
      apiRequest(`/api/ar-invoices/${id}/send`, {
        method: 'POST',
        body: { recipients, attachmentMediaIds },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      setSendDialogOpen(false);
      toast({ title: 'Invoice sent', description: 'SendGrid delivery was accepted and tracked.' });
    },
    onError: (error: any) => {
      toast({ title: 'Send failed', description: error.message, variant: 'destructive' });
    },
  });

  const voidInvoiceMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/ar-invoices/${id}/void`, {
        method: 'POST',
        body: { voidReason: voidReason.trim() },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      setVoidDialogOpen(false);
      setVoidReason('');
      toast({ title: 'Invoice voided' });
    },
    onError: (error: any) => {
      toast({ title: 'Void failed', description: error.message, variant: 'destructive' });
    },
  });

  const loadInvoiceRecipients = async () => {
    if (!id) return;
    setIsLoadingRecipients(true);
    setDialogRecipients([]);
    setSelectedRecipients([]);
    try {
      const raw: EmailRecipient[] = await apiRequest(`/api/ar-invoices/${id}/email-recipients`);
      const seen = new Set<string>();
      const recipients = raw.filter((recipient) => {
        const key = recipient.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDialogRecipients(recipients);
      const primary = recipients.find((recipient) => recipient.type === 'primary');
      setSelectedRecipients(primary ? [primary.email] : recipients.slice(0, 1).map((recipient) => recipient.email));
    } catch (error: any) {
      toast({ title: 'Recipients unavailable', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoadingRecipients(false);
    }
  };

  const handleOpenSendDialog = () => {
    setSendDialogOpen(true);
    queryClient.invalidateQueries({ queryKey: ['/api/media/attachments', 'invoice', id] });
    loadInvoiceRecipients();
  };

  const handleManageAttachments = () => {
    setSendDialogOpen(false);
    setActiveTab('attachments');
  };

  const handleOpenVoidDialog = () => {
    setVoidReason('');
    setVoidDialogOpen(true);
  };

  const openAttachment = (mediaId: string) => {
    window.open(`/api/media/${mediaId}/download`, '_blank', 'noopener,noreferrer');
  };

  const toggleAttachmentSelection = (mediaId: string) => {
    setSelectedAttachmentMediaIds((current) =>
      current.includes(mediaId)
        ? current.filter((item) => item !== mediaId)
        : [...current, mediaId]
    );
  };

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

  const handlePreviewPdf = async () => {
    if (!id) return;

    setIsPreviewingPdf(true);
    const previewWindow = window.open('about:blank', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
    }

    try {
      const response = await fetch(`/api/ar-invoices/${id}/pdf`, {
        credentials: 'include',
      });

      if (!response.ok) {
        let message = 'Failed to generate invoice PDF.';
        try {
          const errorBody = await response.clone().json();
          message = errorBody?.error || errorBody?.message || message;
        } catch {
          const text = await response.text().catch(() => '');
          message = text || message;
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const pdfUrl = URL.createObjectURL(blob);

      if (!previewWindow) {
        window.location.assign(pdfUrl);
        return;
      }

      previewWindow.location.href = pdfUrl;
      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
    } catch (error: any) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      toast({
        title: 'PDF preview failed',
        description: error?.message || 'The invoice PDF could not be opened.',
        variant: 'destructive',
      });
    } finally {
      setIsPreviewingPdf(false);
    }
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
  const isP1Invoice = invoice.invoiceSource === 'P1';
  const sourcePoLabel = invoice.poOverride || invoice.poNumber || packingSlipInfo?.poNumber || invoice.poId;
  const canVoidInvoice = ['DRAFT', 'REVIEW', 'POSTED', 'SENT'].includes(invoice.status);

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
          <Button variant="outline" onClick={handlePreviewPdf} disabled={isPreviewingPdf}>
            {isPreviewingPdf ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            {isPreviewingPdf ? 'Opening...' : 'Preview PDF'}
          </Button>
          <AuditDrawer
            entityType="ar_invoice"
            entityId={invoice.id}
            trigger={
              <Button variant="outline">
                <History className="mr-2 h-4 w-4" />
                Audit
              </Button>
            }
          />
          <Button variant="outline" onClick={() => setActiveTab('attachments')}>
            <Paperclip className="mr-2 h-4 w-4" />
            Attachments
            {invoiceAttachments.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {invoiceAttachments.length}
              </Badge>
            )}
          </Button>
          {(['DRAFT', 'REVIEW'].includes(invoice.status) || (invoice.status === 'SENT' && !invoice.journalEntryId)) && (
            <Button
              variant="outline"
              onClick={() => postInvoiceMutation.mutate()}
              disabled={postInvoiceMutation.isPending || invoice.pricingMismatch || invoice.pricingAmbiguous}
              title={invoice.pricingMismatch || invoice.pricingAmbiguous ? 'Resolve pricing before posting' : 'Post invoice'}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {postInvoiceMutation.isPending ? 'Posting...' : 'Post'}
            </Button>
          )}
          {['REVIEW', 'POSTED', 'SENT'].includes(invoice.status) && (
            <Button
              onClick={handleOpenSendDialog}
              disabled={sendInvoiceMutation.isPending || invoice.pricingMismatch || invoice.pricingAmbiguous}
              title={invoice.pricingMismatch || invoice.pricingAmbiguous ? 'Resolve pricing before sending' : invoice.status === 'SENT' ? 'Resend invoice' : 'Send invoice'}
            >
              <Send className="mr-2 h-4 w-4" />
              {sendInvoiceMutation.isPending ? 'Sending...' : invoice.status === 'SENT' ? 'Resend' : 'Send'}
            </Button>
          )}
          {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
            <Button variant="outline" onClick={handleOpenPaymentDialog}>
              <DollarSign className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          )}
          {canVoidInvoice && (
            <Button
              variant="outline"
              onClick={handleOpenVoidDialog}
              className="border-red-200 text-red-700 hover:bg-red-50"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Void
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                  <p className="text-sm text-muted-foreground">Source</p>
                  <p className="font-medium">{invoice.invoiceType === 'MATERIAL_DEPOSIT' ? 'P2 Material Deposit' : isP1Invoice ? 'P1 PO Invoice' : 'P2 PO Invoice'}</p>
                  {invoice.invoiceType === 'MATERIAL_DEPOSIT' && <Badge variant="secondary" className="mt-1">Liability · 20600 Customer Deposits</Badge>}
                </div>
                {invoice.invoiceType === 'MATERIAL_DEPOSIT' && invoice.projectId && (
                  <div>
                    <p className="text-sm text-muted-foreground">Project</p>
                    <Button variant="link" className="h-auto p-0" onClick={() => setLocation(`/projects/${invoice.projectId}`)}>Open project</Button>
                  </div>
                )}
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
                {sourcePoLabel && (
                  <div>
                    <p className="text-sm text-muted-foreground">PO</p>
                    <p className="font-medium">{sourcePoLabel}</p>
                  </div>
                )}
              </div>

              {(invoice.packingSlipId || invoice.lotId || sourcePoLabel) && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <p className="text-sm font-medium mb-2">Source Documents</p>
                    <div className="flex flex-wrap gap-2">
                      {isP1Invoice && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/oem-shipments?search=${encodeURIComponent(sourcePoLabel || '')}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            P1 OEM Packing Slip{sourcePoLabel ? `: ${sourcePoLabel}` : ''}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                      {!isP1Invoice && invoice.packingSlipId && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/p2/packing-slip/${invoice.packingSlipId}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Packing Slip{packingSlipInfo?.packingSlipNumber ? ` ${packingSlipInfo.packingSlipNumber}` : ''}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                      {!isP1Invoice && invoice.lotId && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/p2/shipments/${invoice.lotId}`}>
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            Lot{lotInfo?.lotNumber ? ` ${lotInfo.lotNumber}` : ' Record'}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                      {sourcePoLabel && (invoice.poOverride || invoice.poNumber || invoice.poId) && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={isP1Invoice
                            ? `/oem-shipments?search=${encodeURIComponent(sourcePoLabel || '')}`
                            : `/p2-control-center?tab=pos&search=${encodeURIComponent(sourcePoLabel || '')}`}
                          >
                            <FileText className="h-3.5 w-3.5 mr-1.5" />
                            {isP1Invoice ? 'P1 PO' : 'P2 PO'}: {sourcePoLabel}
                            <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <Separator className="my-4" />

              <div>
                <p className="text-sm font-medium mb-2">Accounting Posting</p>
                {invoice.journalEntryId ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                      JE #{invoice.journalEntryId}
                    </Badge>
                    <Badge variant="outline">
                      {invoice.journalEntryStatus || 'POSTED'}
                    </Badge>
                    <span className="text-muted-foreground">
                      {invoice.journalLineCount || 0} journal line{Number(invoice.journalLineCount || 0) === 1 ? '' : 's'} created from this invoice.
                    </span>
                  </div>
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    No journal entry has been created yet. Posting this invoice will create the AR invoice JE.
                  </div>
                )}
              </div>

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
                    Record Payment
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

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Invoice</DialogTitle>
            <DialogDescription>
              Select the recipients for invoice {invoice.invoiceNumber}. The primary recipient is sent directly when selected; other selected recipients are copied.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email Recipients</Label>
              <RecipientPickerList
                recipients={dialogRecipients}
                selected={selectedRecipients}
                onChange={setSelectedRecipients}
                isLoading={isLoadingRecipients}
              />
            </div>

            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">Documents to Attach</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The invoice PDF is always included. Select any uploaded invoice documents that should go with this email.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleManageAttachments}>
                  <Paperclip className="mr-2 h-4 w-4" />
                  Manage
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3 rounded-md border bg-background p-2.5">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">Invoice-{invoice.invoiceNumber}.pdf</div>
                    <div className="text-xs text-muted-foreground">Generated invoice PDF</div>
                  </div>
                  <Badge variant="secondary">Required</Badge>
                </div>

                {isLoadingInvoiceAttachments ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading uploaded documents...
                  </div>
                ) : invoiceAttachments.length === 0 ? (
                  <div className="rounded-md border border-dashed bg-background p-3 text-sm text-muted-foreground">
                    No uploaded invoice documents yet. Use Manage to upload PDFs or supporting files before sending.
                  </div>
                ) : (
                  invoiceAttachments.map((item) => {
                    const checked = selectedAttachmentMediaIds.includes(item.media.id);
                    return (
                      <div
                        key={item.attachment.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md border bg-background p-2.5 transition-colors hover:bg-muted/40"
                        onClick={() => toggleAttachmentSelection(item.media.id)}
                      >
                        <Checkbox
                          id={`invoice-attachment-${item.media.id}`}
                          checked={checked}
                          onCheckedChange={() => toggleAttachmentSelection(item.media.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="mt-0.5"
                        />
                        <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {item.media.title || item.media.filename}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.media.filename}
                            {item.media.fileSize ? ` - ${formatFileSize(item.media.fileSize)}` : ''}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(event) => {
                            event.stopPropagation();
                            openAttachment(item.media.id);
                          }}
                          title="Open attachment"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>

              {(invoice.packingSlipId || invoice.lotId) && (
                <p className="text-xs text-muted-foreground">
                  Linked packing slip and lot backup documents are also included automatically when available.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => sendInvoiceMutation.mutate({
                recipients: selectedRecipients,
                attachmentMediaIds: selectedAttachmentMediaIds,
              })}
              disabled={sendInvoiceMutation.isPending || isLoadingRecipients || selectedRecipients.length === 0}
            >
              {sendInvoiceMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Invoice {invoice.invoiceNumber}</DialogTitle>
            <DialogDescription>
              This marks the invoice void. If accounting has already been posted, a reversal journal entry will be created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="void-reason">Void Reason</Label>
            <Textarea
              id="void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Example: Sent prematurely; lot is ready but has not shipped."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVoidDialogOpen(false)}
              disabled={voidInvoiceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => voidInvoiceMutation.mutate()}
              disabled={!voidReason.trim() || voidInvoiceMutation.isPending}
            >
              {voidInvoiceMutation.isPending ? 'Voiding...' : 'Void Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus,
  Search,
  FileText,
  DollarSign,
  AlertTriangle,
  Send,
  Ban,
  Eye,
  CheckCircle,
  Clock,
  MessageSquareWarning,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type Invoice = {
  id: string;
  customerId: string;
  customerName: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: string;
  balance?: string;
  status: string;
  sentAt?: string | null;
  isDisputed?: boolean;
  pricingMismatch?: boolean;
  pricingAmbiguous?: boolean;
  autoCreated?: boolean;
  poId?: number | null;
  poOverride?: string | null;
  poNumber?: string | null;
};

type Customer = {
  customerId: string;
  customerName: string;
};

type SummaryCounts = {
  needsReview: number;
  unsent: number;
  disputed: number;
};

type CustomerGroup = {
  customerId: string;
  customerName: string;
  invoices: Invoice[];
  total: number;
};

type StatusGroup = {
  status: string;
  invoices: Invoice[];
  total: number;
};

const STATUS_ORDER = ['OVERDUE', 'OPEN', 'DRAFT', 'REVIEW', 'POSTED', 'SENT', 'DISPUTED', 'PAID', 'VOID'];

function getStatusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    PAID: 'bg-green-100 text-green-800 hover:bg-green-100',
    OVERDUE: 'bg-red-100 text-red-800 hover:bg-red-100',
    VOID: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
    DRAFT: 'bg-blue-50 text-blue-700 hover:bg-blue-50',
    REVIEW: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
    POSTED: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100',
    SENT: 'bg-teal-100 text-teal-700 hover:bg-teal-100',
    DISPUTED: 'bg-red-100 text-red-700 hover:bg-red-100',
  };
  return (
    <Badge className={map[status] || ''}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function getFlagBadges(invoice: Invoice) {
  const badges = [];
  if (invoice.pricingMismatch) {
    badges.push(
      <Badge key="mismatch" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 text-xs">
        Pricing Mismatch
      </Badge>
    );
  }
  if (invoice.pricingAmbiguous) {
    badges.push(
      <Badge key="ambiguous" className="bg-orange-100 text-orange-800 hover:bg-orange-100 text-xs">
        Pricing Ambiguous
      </Badge>
    );
  }
  if (invoice.autoCreated) {
    badges.push(
      <Badge key="auto" className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">
        Auto-Created
      </Badge>
    );
  }
  return badges;
}

function getPoDisplay(invoice: Invoice): string | null {
  if (invoice.poNumber) return invoice.poNumber;
  if (invoice.poOverride) return invoice.poOverride;
  return null;
}

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
}

function groupByStatus(invoices: Invoice[]): StatusGroup[] {
  const map = new Map<string, StatusGroup>();
  for (const inv of invoices) {
    const key = inv.status;
    if (!map.has(key)) {
      map.set(key, { status: key, invoices: [], total: 0 });
    }
    const group = map.get(key)!;
    group.invoices.push(inv);
    group.total += parseFloat(inv.totalAmount) || 0;
  }
  return Array.from(map.values()).sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a.status);
    const ib = STATUS_ORDER.indexOf(b.status);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
}

function groupByCustomer(invoices: Invoice[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const inv of invoices) {
    const key = inv.customerId;
    if (!map.has(key)) {
      map.set(key, {
        customerId: inv.customerId,
        customerName: inv.customerName || inv.customerId,
        invoices: [],
        total: 0,
      });
    }
    const group = map.get(key)!;
    group.invoices.push(inv);
    group.total += parseFloat(inv.totalAmount) || 0;
  }
  return Array.from(map.values());
}

interface VoidDialogState {
  open: boolean;
  invoiceId: string;
  invoiceNumber: string;
  reason: string;
}

interface QuickActionButtonsProps {
  invoice: Invoice;
  onPost: (id: string) => void;
  onSend: (id: string) => void;
  onVoidRequest: (id: string, invoiceNumber: string) => void;
  onView: (id: string) => void;
  postPending: boolean;
  sendPending: boolean;
  voidPending: boolean;
  pendingId: string | null;
}

function QuickActionButtons({
  invoice,
  onPost,
  onSend,
  onVoidRequest,
  onView,
  postPending,
  sendPending,
  voidPending,
  pendingId,
}: QuickActionButtonsProps) {
  const canPost = ['DRAFT', 'REVIEW'].includes(invoice.status);
  const canSend = invoice.status === 'POSTED';
  const canVoid = ['DRAFT', 'REVIEW', 'POSTED', 'SENT'].includes(invoice.status);
  const isBusy = pendingId === invoice.id && (postPending || sendPending || voidPending);

  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => onView(invoice.id)}
        title="View"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      {canPost && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
          onClick={() => onPost(invoice.id)}
          disabled={isBusy}
          title="Post"
        >
          <CheckCircle className="h-3.5 w-3.5" />
        </Button>
      )}
      {canSend && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50"
          onClick={() => onSend(invoice.id)}
          disabled={isBusy}
          title="Send"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      )}
      {canVoid && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={() => onVoidRequest(invoice.id, invoice.invoiceNumber)}
          disabled={isBusy}
          title="Void"
        >
          <Ban className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

interface FlatInvoiceTableProps {
  invoices: Invoice[];
  onPost: (id: string) => void;
  onSend: (id: string) => void;
  onVoidRequest: (id: string, invoiceNumber: string) => void;
  onView: (id: string) => void;
  postPending: boolean;
  sendPending: boolean;
  voidPending: boolean;
  pendingId: string | null;
}

function FlatInvoiceTable({
  invoices,
  onPost,
  onSend,
  onVoidRequest,
  onView,
  postPending,
  sendPending,
  voidPending,
  pendingId,
}: FlatInvoiceTableProps) {
  const [, setLocation] = useLocation();

  if (invoices.length === 0) {
    return <div className="text-center py-8 text-gray-500">No invoices found</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice #</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>PO #</TableHead>
          <TableHead>Invoice Date</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status / Flags</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => (
          <TableRow
            key={invoice.id}
            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={() => setLocation(`/finance/invoices/${invoice.id}`)}
          >
            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {invoice.customerName || invoice.customerId}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {getPoDisplay(invoice) ?? '—'}
            </TableCell>
            <TableCell className="text-sm">
              {invoice.invoiceDate
                ? format(new Date(invoice.invoiceDate), 'MM/dd/yyyy')
                : '—'}
            </TableCell>
            <TableCell className="text-sm">
              {invoice.dueDate
                ? format(new Date(invoice.dueDate), 'MM/dd/yyyy')
                : '—'}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(invoice.totalAmount)}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-1 items-center">
                  {getStatusBadge(invoice.status)}
                  {getFlagBadges(invoice)}
                </div>
                {(invoice.pricingMismatch || invoice.pricingAmbiguous) && (
                  <span className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-0.5">
                    ⚠ Pricing requires review
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <QuickActionButtons
                invoice={invoice}
                onPost={onPost}
                onSend={onSend}
                onVoidRequest={onVoidRequest}
                onView={onView}
                postPending={postPending}
                sendPending={sendPending}
                voidPending={voidPending}
                pendingId={pendingId}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function InvoicesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const urlParams = new URLSearchParams(window.location.search);

  const [activeTab, setActiveTab] = useState(urlParams.get('tab') || 'all');
  const [statusFilter, setStatusFilter] = useState(urlParams.get('status') || 'all');
  const [customerFilter, setCustomerFilter] = useState(urlParams.get('customerId') || 'all');
  const [searchTerm, setSearchTerm] = useState(urlParams.get('search') || '');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [voidDialog, setVoidDialog] = useState<VoidDialogState>({
    open: false,
    invoiceId: '',
    invoiceNumber: '',
    reason: '',
  });

  const queryParams = new URLSearchParams();
  if (statusFilter && statusFilter !== 'all') queryParams.set('status', statusFilter);
  if (customerFilter && customerFilter !== 'all') queryParams.set('customerId', customerFilter);
  if (searchTerm) queryParams.set('search', searchTerm);
  const queryString = queryParams.toString();
  const fetchUrl = '/api/ar-invoices' + (queryString ? `?${queryString}` : '');

  const { data: allInvoices, isLoading: allLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/ar-invoices', { status: statusFilter, customerId: customerFilter, search: searchTerm }],
    queryFn: () => fetch(fetchUrl, { credentials: 'include' }).then((r) => r.json()),
    enabled: activeTab === 'all',
  });

  const { data: needsReviewInvoices, isLoading: needsReviewLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/ar-invoices/needs-review'],
    queryFn: () => fetch('/api/ar-invoices/needs-review', { credentials: 'include' }).then((r) => r.json()),
    enabled: activeTab === 'needs-review',
  });

  const { data: unsentInvoices, isLoading: unsentLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/ar-invoices/unsent'],
    queryFn: () => fetch('/api/ar-invoices/unsent', { credentials: 'include' }).then((r) => r.json()),
    enabled: activeTab === 'unsent',
  });

  const { data: disputedInvoices, isLoading: disputedLoading } = useQuery<Invoice[]>({
    queryKey: ['/api/ar-invoices/disputed'],
    queryFn: () => fetch('/api/ar-invoices/disputed', { credentials: 'include' }).then((r) => r.json()),
    enabled: activeTab === 'disputed',
  });

  const { data: summaryCounts, isLoading: countsLoading } = useQuery<SummaryCounts>({
    queryKey: ['/api/ar-invoices/summary-counts'],
    queryFn: () => fetch('/api/ar-invoices/summary-counts', { credentials: 'include' }).then((r) => r.json()),
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/ar-invoices' });
    queryClient.invalidateQueries({ queryKey: ['/api/ar-invoices/needs-review'] });
    queryClient.invalidateQueries({ queryKey: ['/api/ar-invoices/unsent'] });
    queryClient.invalidateQueries({ queryKey: ['/api/ar-invoices/disputed'] });
    queryClient.invalidateQueries({ queryKey: ['/api/ar-invoices/summary-counts'] });
  };

  const postMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ar-invoices/${id}/post`, { method: 'POST', body: {} }),
    onMutate: (id) => setPendingId(id),
    onSuccess: () => {
      toast({ title: 'Invoice posted' });
      invalidateAll();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    onSettled: () => setPendingId(null),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ar-invoices/${id}/send`, { method: 'POST', body: {} }),
    onMutate: (id) => setPendingId(id),
    onSuccess: () => {
      toast({ title: 'Invoice marked as sent' });
      invalidateAll();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    onSettled: () => setPendingId(null),
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest(`/api/ar-invoices/${id}/void`, { method: 'POST', body: { voidReason: reason } }),
    onMutate: ({ id }) => setPendingId(id),
    onSuccess: () => {
      toast({ title: 'Invoice voided' });
      setVoidDialog({ open: false, invoiceId: '', invoiceNumber: '', reason: '' });
      invalidateAll();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    onSettled: () => setPendingId(null),
  });

  const handlePost = (id: string) => postMutation.mutate(id);
  const handleSend = (id: string) => sendMutation.mutate(id);
  const handleVoidRequest = (id: string, invoiceNumber: string) =>
    setVoidDialog({ open: true, invoiceId: id, invoiceNumber, reason: '' });
  const handleView = (id: string) => setLocation(`/finance/invoices/${id}`);

  const customerGroups = Array.isArray(allInvoices) ? groupByCustomer(allInvoices) : [];
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);
  const customerGroupKey = customerGroups.map((g) => g.customerId).join('|');

  useEffect(() => {
    if (customerGroups.length === 1) {
      setOpenAccordions([customerGroups[0].customerId]);
    } else {
      setOpenAccordions((prev) => prev.filter((id) => customerGroups.some((g) => g.customerId === id)));
    }
  }, [customerGroupKey]);

  const actionProps = {
    onPost: handlePost,
    onSend: handleSend,
    onVoidRequest: handleVoidRequest,
    onView: handleView,
    postPending: postMutation.isPending,
    sendPending: sendMutation.isPending,
    voidPending: voidMutation.isPending,
    pendingId,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Invoices</h1>
        </div>
        <Button onClick={() => setLocation('/finance/invoices/new')}>
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {countsLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : (
          <>
            <Card
              className="cursor-pointer hover:bg-yellow-50 dark:hover:bg-yellow-950 border-yellow-200 transition-colors"
              onClick={() => setActiveTab('needs-review')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryCounts?.needsReview ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Needs Review</p>
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950 border-indigo-200 transition-colors"
              onClick={() => setActiveTab('unsent')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Clock className="h-5 w-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryCounts?.unsent ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Unsent</p>
                </div>
              </CardContent>
            </Card>
            <Card
              className="cursor-pointer hover:bg-red-50 dark:hover:bg-red-950 border-red-200 transition-colors"
              onClick={() => setActiveTab('disputed')}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <MessageSquareWarning className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summaryCounts?.disputed ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Disputed</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="needs-review" className="flex items-center gap-1.5">
            Needs Review
            <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
              {countsLoading ? '…' : (summaryCounts?.needsReview ?? 0)}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="unsent" className="flex items-center gap-1.5">
            Unsent
            <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
              {countsLoading ? '…' : (summaryCounts?.unsent ?? 0)}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="disputed" className="flex items-center gap-1.5">
            Disputed
            <Badge variant="secondary" className="h-5 px-1.5 text-xs ml-1">
              {countsLoading ? '…' : (summaryCounts?.disputed ?? 0)}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by invoice number..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="REVIEW">Review</SelectItem>
                    <SelectItem value="POSTED">Posted</SelectItem>
                    <SelectItem value="SENT">Sent</SelectItem>
                    <SelectItem value="DISPUTED">Disputed</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="VOID">Void</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={customerFilter} onValueChange={setCustomerFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    {customers?.map((c) => (
                      <SelectItem key={c.customerId} value={c.customerId}>
                        {c.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {allLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : customerGroups.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No invoices found</div>
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
                            {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                            <DollarSign className="h-3.5 w-3.5" />
                            {formatCurrency(group.total)}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-0">
                        <Accordion type="multiple" defaultValue={[]} className="divide-y border-t">
                          {groupByStatus(group.invoices).map((statusGroup) => (
                            <AccordionItem
                              key={statusGroup.status}
                              value={statusGroup.status}
                              className="border-0"
                            >
                              <AccordionTrigger className="px-6 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="flex items-center gap-4 text-left">
                                  {getStatusBadge(statusGroup.status)}
                                  <span className="text-sm text-muted-foreground">
                                    {statusGroup.invoices.length} invoice{statusGroup.invoices.length !== 1 ? 's' : ''}
                                  </span>
                                  <span className="text-sm font-medium text-muted-foreground">
                                    {formatCurrency(statusGroup.total)}
                                  </span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Invoice #</TableHead>
                                      <TableHead>PO #</TableHead>
                                      <TableHead>Invoice Date</TableHead>
                                      <TableHead>Due Date</TableHead>
                                      <TableHead className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <DollarSign className="h-4 w-4" />
                                          Amount
                                        </div>
                                      </TableHead>
                                      <TableHead>Flags</TableHead>
                                      <TableHead>Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {statusGroup.invoices.map((invoice) => (
                                      <TableRow
                                        key={invoice.id}
                                        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                                        onClick={() => setLocation(`/finance/invoices/${invoice.id}`)}
                                      >
                                        <TableCell>{invoice.invoiceNumber}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                          {getPoDisplay(invoice) ?? '—'}
                                        </TableCell>
                                        <TableCell>
                                          {invoice.invoiceDate
                                            ? format(new Date(invoice.invoiceDate), 'MM/dd/yyyy')
                                            : '—'}
                                        </TableCell>
                                        <TableCell>
                                          {invoice.dueDate
                                            ? format(new Date(invoice.dueDate), 'MM/dd/yyyy')
                                            : '—'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">
                                          {formatCurrency(invoice.totalAmount)}
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-1">
                                            {getFlagBadges(invoice)}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <QuickActionButtons
                                            invoice={invoice}
                                            {...actionProps}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="needs-review">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                Needs Review — Draft, under review, or flagged invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {needsReviewLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <FlatInvoiceTable invoices={needsReviewInvoices || []} {...actionProps} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unsent">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-600" />
                Unsent — Posted invoices awaiting delivery
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {unsentLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <FlatInvoiceTable invoices={unsentInvoices || []} {...actionProps} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="disputed">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4 text-red-600" />
                Disputed — Invoices with open disputes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {disputedLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <FlatInvoiceTable invoices={disputedInvoices || []} {...actionProps} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={voidDialog.open}
        onOpenChange={(open) => {
          if (!open) setVoidDialog({ open: false, invoiceId: '', invoiceNumber: '', reason: '' });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void Invoice {voidDialog.invoiceNumber}</DialogTitle>
            <DialogDescription>
              This action cannot be undone. A reversal journal entry will be created if the invoice has been posted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="void-reason">Void Reason</Label>
            <Textarea
              id="void-reason"
              placeholder="Provide a reason for voiding this invoice..."
              value={voidDialog.reason}
              onChange={(e) =>
                setVoidDialog((prev) => ({ ...prev, reason: e.target.value }))
              }
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setVoidDialog({ open: false, invoiceId: '', invoiceNumber: '', reason: '' })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!voidDialog.reason.trim() || voidMutation.isPending}
              onClick={() =>
                voidMutation.mutate({ id: voidDialog.invoiceId, reason: voidDialog.reason })
              }
            >
              {voidMutation.isPending ? 'Voiding...' : 'Void Invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

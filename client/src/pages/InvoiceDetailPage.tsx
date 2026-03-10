import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { format } from 'date-fns';
import { ArrowLeft, Edit, CheckCircle, FileText, Paperclip } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

export default function InvoiceDetailPage() {
  const [, setLocation] = useLocation();
  const [matched, params] = useRoute('/finance/invoices/:id');
  const id = params?.id;
  const { toast } = useToast();

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: ['/api/ar-invoices', id],
    enabled: !!id,
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

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Invoice {invoice.invoiceNumber}</h1>
          {statusBadge(invoice.status)}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLocation('/finance/invoices')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/finance/invoices/${id}/edit`)}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </Button>
          {invoice.status !== 'PAID' && invoice.status !== 'VOID' && (
            <Button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {markPaidMutation.isPending ? 'Updating...' : 'Mark Paid'}
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="line-items">Line Items</TabsTrigger>
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
                    <p className="font-medium">{invoice.poOverride || invoice.poId || '—'}</p>
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
                      <span className="font-medium text-green-600 dark:text-green-400">{formatCurrency(invoice.amountPaid)}</span>
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
    </div>
  );
}

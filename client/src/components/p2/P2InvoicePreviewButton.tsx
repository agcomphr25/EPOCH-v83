import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface PreviewLine {
  poItemId: number | null;
  partNumber: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  pricingStatus: 'matched' | 'missing' | 'ambiguous' | 'manual' | 'no_charge';
  matchCount: number;
}

interface InvoicePreview {
  packingSlipId: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  poOverride: string | null;
  pricingMismatch: boolean;
  pricingAmbiguous: boolean;
  subtotal: number;
  discountAmount: number;
  freightAmount: number;
  taxAmount: number;
  totalAmount: number;
  customerVisibleNotes: string | null;
  lines: PreviewLine[];
}

interface EditableLine {
  poItemId: number | null;
  partNumber: string | null;
  description: string;
  qty: string;
  unitPrice: string;
  pricingStatus: PreviewLine['pricingStatus'];
  matchCount: number;
}

interface Props {
  packingSlipId: string | null | undefined;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  className?: string;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
  onCreated?: (invoice: any) => void;
}

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmt(value: unknown) {
  return money(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getTermsDays(terms: string): number {
  const normalized = terms.trim().toUpperCase();
  const netMatch = normalized.match(/^NET[_\s-]?(\d+)$/);
  if (netMatch) return Number(netMatch[1]);
  if (normalized === 'DUE_ON_RECEIPT' || normalized === 'DUE RECEIPT') return 0;
  return 30;
}

function addDays(dateValue: string, days: number): string {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function statusBadge(status: PreviewLine['pricingStatus']) {
  if (status === 'matched') return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Matched</Badge>;
  if (status === 'manual') return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Edited</Badge>;
  if (status === 'no_charge') return <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">No Charge</Badge>;
  if (status === 'ambiguous') return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Ambiguous</Badge>;
  return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Missing</Badge>;
}

export default function P2InvoicePreviewButton({
  packingSlipId,
  size = 'sm',
  variant = 'outline',
  className,
  disabled,
  label = 'Edit Invoice Details',
  loadingLabel = 'Loading...',
  onCreated,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [header, setHeader] = useState({
    invoiceDate: '',
    dueDate: '',
    terms: '',
    poOverride: '',
    freightAmount: '0',
    taxAmount: '0',
    discountAmount: '0',
    customerVisibleNotes: '',
  });
  const [lines, setLines] = useState<EditableLine[]>([]);

  const { data: preview, isFetching, error } = useQuery<InvoicePreview>({
    queryKey: ['/api/ar-invoices/from-packing-slip', packingSlipId, 'preview'],
    queryFn: () => apiRequest(`/api/ar-invoices/from-packing-slip/${packingSlipId}/preview`),
    enabled: open && !!packingSlipId,
  });

  useEffect(() => {
    if (!preview) return;
    setHeader({
      invoiceDate: preview.invoiceDate || '',
      dueDate: preview.dueDate || '',
      terms: preview.terms || 'NET_30',
      poOverride: preview.poOverride || '',
      freightAmount: String(preview.freightAmount ?? 0),
      taxAmount: String(preview.taxAmount ?? 0),
      discountAmount: String(preview.discountAmount ?? 0),
      customerVisibleNotes: preview.customerVisibleNotes || '',
    });
    setLines(preview.lines.map((line) => ({
      poItemId: line.poItemId,
      partNumber: line.partNumber,
      description: line.description,
      qty: String(line.qty),
      unitPrice: String(line.unitPrice),
      pricingStatus: line.pricingStatus,
      matchCount: line.matchCount,
    })));
  }, [preview]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, line) => sum + money(line.qty) * money(line.unitPrice), 0);
    const discount = money(header.discountAmount);
    const freight = money(header.freightAmount);
    const tax = money(header.taxAmount);
    return {
      subtotal,
      discount,
      freight,
      tax,
      total: subtotal - discount + freight + tax,
    };
  }, [lines, header.discountAmount, header.freightAmount, header.taxAmount]);

  const unresolvedCount = lines.filter((line) =>
    (line.pricingStatus === 'missing' || line.pricingStatus === 'ambiguous') && money(line.unitPrice) === 0
  ).length;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!packingSlipId) throw new Error('No packing slip is linked to this shipment.');
      const emptyLine = lines.find((line) => !line.description.trim() || money(line.qty) <= 0);
      if (emptyLine) throw new Error('Each invoice line needs a description and quantity.');
      return apiRequest(`/api/ar-invoices/from-packing-slip/${packingSlipId}`, {
        method: 'POST',
        body: {
          ...header,
          discountAmount: totals.discount,
          freightAmount: totals.freight,
          taxAmount: totals.tax,
          customerVisibleNotes: header.customerVisibleNotes || null,
          poOverride: header.poOverride || null,
          lines: lines.map((line) => ({
            poItemId: line.poItemId,
            partNumber: line.partNumber,
            description: line.description,
            qty: money(line.qty),
            unitPrice: money(line.unitPrice),
          })),
        },
      });
    },
    onSuccess: (invoice: any) => {
      toast({
        title: 'Invoice ready for review',
        description: invoice?.invoiceNumber ? `Invoice ${invoice.invoiceNumber} was created.` : 'Invoice was created.',
      });
      setOpen(false);
      onCreated?.(invoice);
    },
    onError: (err: any) => {
      toast({
        title: 'Invoice creation failed',
        description: err?.message || 'Unable to create invoice from this preview.',
        variant: 'destructive',
      });
    },
  });

  const updateLine = (index: number, patch: Partial<EditableLine>) => {
    setLines((prev) => prev.map((line, i) => i === index ? { ...line, ...patch, pricingStatus: 'manual' } : line));
  };

  const updateInvoiceDate = (invoiceDate: string) => {
    setHeader((h) => ({
      ...h,
      invoiceDate,
      dueDate: addDays(invoiceDate, getTermsDays(h.terms)),
    }));
  };

  const updateTerms = (terms: string) => {
    setHeader((h) => ({
      ...h,
      terms,
      dueDate: addDays(h.invoiceDate, getTermsDays(terms)),
    }));
  };

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        disabled={disabled || !packingSlipId}
        onClick={() => setOpen(true)}
      >
        <Receipt className="h-3.5 w-3.5 mr-1" />
        {isFetching && open ? loadingLabel : label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Invoice Details</DialogTitle>
            <DialogDescription>
              Review and edit the invoice details before creating the AR review invoice. After it is created, preview the invoice PDF before sending.
            </DialogDescription>
          </DialogHeader>

          {isFetching ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading invoice details...
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {(error as Error).message || 'Unable to load invoice preview.'}
            </div>
          ) : preview ? (
            <div className="space-y-5">
              {(preview.pricingMismatch || preview.pricingAmbiguous || unresolvedCount > 0) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    Some lines need pricing attention. Enter a unit price or intentionally leave the line at $0 before creating.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label>Customer</Label>
                  <Input value={preview.customerName} readOnly />
                </div>
                <div>
                  <Label>Invoice #</Label>
                  <Input value={preview.invoiceNumber} readOnly />
                </div>
                <div>
                  <Label>Invoice Date</Label>
                  <Input type="date" value={header.invoiceDate} onChange={(e) => updateInvoiceDate(e.target.value)} />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" value={header.dueDate} onChange={(e) => setHeader((h) => ({ ...h, dueDate: e.target.value }))} />
                </div>
                <div>
                  <Label>Terms</Label>
                  <Input value={header.terms} onChange={(e) => updateTerms(e.target.value)} />
                </div>
                <div>
                  <Label>PO</Label>
                  <Input value={header.poOverride} onChange={(e) => setHeader((h) => ({ ...h, poOverride: e.target.value }))} />
                </div>
                <div>
                  <Label>Freight</Label>
                  <Input type="number" step="0.01" value={header.freightAmount} onChange={(e) => setHeader((h) => ({ ...h, freightAmount: e.target.value }))} />
                </div>
                <div>
                  <Label>Tax</Label>
                  <Input type="number" step="0.01" value={header.taxAmount} onChange={(e) => setHeader((h) => ({ ...h, taxAmount: e.target.value }))} />
                </div>
              </div>

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">Part #</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[90px] text-right">Qty</TableHead>
                      <TableHead className="w-[120px] text-right">Unit Price</TableHead>
                      <TableHead className="w-[120px] text-right">Line Total</TableHead>
                      <TableHead className="w-[110px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono text-xs">{line.partNumber || '-'}</TableCell>
                        <TableCell>
                          <Input value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="text-right" type="number" step="1" value={line.qty} onChange={(e) => updateLine(index, { qty: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input className="text-right" type="number" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} />
                        </TableCell>
                        <TableCell className="text-right font-medium">{fmt(money(line.qty) * money(line.unitPrice))}</TableCell>
                        <TableCell>{statusBadge(line.pricingStatus)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
                <div>
                  <Label>Customer Notes</Label>
                  <Textarea
                    rows={4}
                    value={header.customerVisibleNotes}
                    onChange={(e) => setHeader((h) => ({ ...h, customerVisibleNotes: e.target.value }))}
                  />
                </div>
                <div className="rounded-md border p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-sm font-normal">Discount</Label>
                    <Input className="h-8 w-28 text-right" type="number" step="0.01" value={header.discountAmount} onChange={(e) => setHeader((h) => ({ ...h, discountAmount: e.target.value }))} />
                  </div>
                  <div className="flex justify-between"><span>Freight</span><span>{fmt(totals.freight)}</span></div>
                  <div className="flex justify-between"><span>Tax</span><span>{fmt(totals.tax)}</span></div>
                  <div className="border-t pt-2 flex justify-between text-base font-semibold">
                    <span>Total</span><span>{fmt(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!preview || isFetching || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
              Create Review Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

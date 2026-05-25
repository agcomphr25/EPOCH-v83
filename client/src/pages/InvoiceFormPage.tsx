import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  TableFooter,
} from '@/components/ui/table';
import { Plus, Trash2, Save, ArrowLeft, Loader2, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import MediaAttachmentPicker from '@/components/MediaAttachmentPicker';

const PAYMENT_TERMS_OPTIONS = [
  { value: 'NET_15', label: 'Net 15' },
  { value: 'NET_30', label: 'Net 30' },
  { value: 'NET_60', label: 'Net 60' },
  { value: 'COD', label: 'COD' },
  { value: 'PREPAID', label: 'Prepaid' },
];

const TERMS_DAYS: Record<string, number> = {
  NET_15: 15,
  NET_30: 30,
  NET_60: 60,
  COD: 0,
  PREPAID: 0,
};

function calculateDueDate(invoiceDate: string, terms: string): string {
  if (!invoiceDate || !terms || !(terms in TERMS_DAYS)) return '';
  const [year, month, day] = invoiceDate.split('-').map(Number);
  const date = new Date(year, month - 1, day + TERMS_DAYS[terms]);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface InvoiceLine {
  description: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
}

interface InvoiceFormData {
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  terms: string;
  poId: string;
  poOverride: string;
  notes: string;
  customerVisibleNotes: string;
  internalNotes: string;
  discountAmount: string;
  freightAmount: string;
  taxAmount: string;
  retainagePercent: string;
  retainageAmount: string;
  lines: InvoiceLine[];
}

const emptyLine = (): InvoiceLine => ({
  description: '',
  qty: '1',
  unitPrice: '0',
  lineTotal: '0.00',
});

const defaultForm = (): InvoiceFormData => ({
  customerId: '',
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  dueDate: '',
  terms: '',
  poId: '',
  poOverride: '',
  notes: '',
  customerVisibleNotes: '',
  internalNotes: '',
  discountAmount: '0',
  freightAmount: '0',
  taxAmount: '0',
  retainagePercent: '0',
  retainageAmount: '0',
  lines: [emptyLine()],
});

export default function InvoiceFormPage() {
  const [, navigate] = useLocation();
  const [, editParams] = useRoute('/finance/invoices/:id/edit');
  const editId = editParams?.id;
  const isEditing = !!editId;

  const [form, setForm] = useState<InvoiceFormData>(defaultForm());
  const [dueDateManuallySet, setDueDateManuallySet] = useState(false);
  const { toast } = useToast();

  const { data: existingInvoice, isLoading: loadingInvoice } = useQuery<any>({
    queryKey: ['/api/ar-invoices', editId],
    enabled: isEditing,
  });

  const invoiceSource = existingInvoice?.invoiceSource === 'P1' ? 'P1' : 'P2';

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: [invoiceSource === 'P1' ? '/api/customers' : '/api/p2-customers-bypass', invoiceSource],
    queryFn: async () => {
      const endpoint = invoiceSource === 'P1' ? '/api/customers' : '/api/p2-customers-bypass';
      const rows = await apiRequest(endpoint);
      if (invoiceSource === 'P1') {
        return (rows || []).map((customer: any) => ({
          customerId: String(customer.id),
          customerName: customer.name || customer.company || `Customer ${customer.id}`,
          paymentTerms: 'NET_30',
        }));
      }
      return rows || [];
    },
    enabled: !isEditing || !!existingInvoice,
  });

  const { data: customerPos = [], isLoading: loadingPos } = useQuery<{ id: number; poNumber: string; status: string }[]>({
    queryKey: ['/api/ar-invoices/customer-pos', form.customerId, invoiceSource],
    queryFn: async () => {
      const r = await fetch(`/api/ar-invoices/customer-pos?customerId=${encodeURIComponent(form.customerId)}&source=${invoiceSource}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Failed to load POs');
      return r.json();
    },
    enabled: !!form.customerId,
  });

  useEffect(() => {
    if (existingInvoice && isEditing) {
      setForm({
        customerId: existingInvoice.customerId || '',
        invoiceNumber: existingInvoice.invoiceNumber || '',
        invoiceDate: existingInvoice.invoiceDate || '',
        dueDate: existingInvoice.dueDate || '',
        terms: existingInvoice.terms || '',
        poId: existingInvoice.poId || '',
        poOverride: existingInvoice.poOverride || '',
        notes: existingInvoice.notes || '',
        customerVisibleNotes: existingInvoice.customerVisibleNotes || '',
        internalNotes: existingInvoice.internalNotes || '',
        discountAmount: existingInvoice.discountAmount || '0',
        freightAmount: existingInvoice.freightAmount || '0',
        taxAmount: existingInvoice.taxAmount || '0',
        retainagePercent: existingInvoice.retainagePercent || '0',
        retainageAmount: existingInvoice.retainageAmount || '0',
        lines:
          existingInvoice.lines && existingInvoice.lines.length > 0
            ? existingInvoice.lines.map((l: any) => ({
                description: l.description || '',
                qty: l.qty || '1',
                unitPrice: l.unitPrice || '0',
                lineTotal: l.lineTotal || '0.00',
              }))
            : [emptyLine()],
      });
      setDueDateManuallySet(true);
    }
  }, [existingInvoice, isEditing]);

  const calculateLineTotal = useCallback((qty: string, unitPrice: string) => {
    const q = parseFloat(qty) || 0;
    const p = parseFloat(unitPrice) || 0;
    return (q * p).toFixed(2);
  }, []);

  const subtotal = form.lines.reduce(
    (sum, line) => sum + parseFloat(line.lineTotal || '0'),
    0
  );
  const discountAmount = parseFloat(form.discountAmount) || 0;
  const freightAmount = parseFloat(form.freightAmount) || 0;
  const taxAmount = parseFloat(form.taxAmount) || 0;
  const retainageAmount = parseFloat(form.retainageAmount) || 0;
  const totalAmount = subtotal - discountAmount + freightAmount + taxAmount - retainageAmount;

  const updateField = (field: keyof InvoiceFormData, value: string) => {
    setForm((prev) => {
      if (field === 'customerId' && value !== prev.customerId) {
        const customer = customers.find((c: any) => c.customerId === value);
        const prefillTerms = customer?.paymentTerms || '';
        const newDueDate = !dueDateManuallySet && prefillTerms
          ? calculateDueDate(prev.invoiceDate, prefillTerms)
          : prev.dueDate;
        return { ...prev, customerId: value, poId: '', poOverride: '', terms: prefillTerms, dueDate: newDueDate };
      }
      if (field === 'terms') {
        const newDueDate = !dueDateManuallySet ? calculateDueDate(prev.invoiceDate, value) : prev.dueDate;
        return { ...prev, terms: value, dueDate: newDueDate };
      }
      if (field === 'invoiceDate') {
        const newDueDate = !dueDateManuallySet && prev.terms ? calculateDueDate(value, prev.terms) : prev.dueDate;
        return { ...prev, invoiceDate: value, dueDate: newDueDate };
      }
      if (field === 'dueDate') {
        setDueDateManuallySet(true);
        return { ...prev, dueDate: value };
      }
      return { ...prev, [field]: value };
    });
  };

  const updateLine = (index: number, field: keyof InvoiceLine, value: string) => {
    setForm((prev) => {
      const newLines = [...prev.lines];
      newLines[index] = { ...newLines[index], [field]: value };
      if (field === 'qty' || field === 'unitPrice') {
        newLines[index].lineTotal = calculateLineTotal(
          field === 'qty' ? value : newLines[index].qty,
          field === 'unitPrice' ? value : newLines[index].unitPrice
        );
      }
      return { ...prev, lines: newLines };
    });
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));
  };

  const removeLine = (index: number) => {
    setForm((prev) => {
      if (prev.lines.length <= 1) return prev;
      return { ...prev, lines: prev.lines.filter((_, i) => i !== index) };
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: InvoiceFormData) => {
      const payload = {
        customerId: data.customerId,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate || null,
        terms: data.terms || null,
        poId: data.poId || null,
        poOverride: data.poOverride || null,
        notes: data.notes || null,
        customerVisibleNotes: data.customerVisibleNotes || null,
        internalNotes: data.internalNotes || null,
        discountAmount: data.discountAmount,
        freightAmount: data.freightAmount,
        taxAmount: data.taxAmount,
        retainagePercent: data.retainagePercent,
        retainageAmount: data.retainageAmount,
        lines: data.lines.map((l) => ({
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
      };

      if (isEditing) {
        return apiRequest(`/api/ar-invoices/${editId}`, {
          method: 'PUT',
          body: payload,
        });
      }
      return apiRequest('/api/ar-invoices', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => 
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      toast({
        title: isEditing ? 'Invoice Updated' : 'Invoice Created',
        description: isEditing
          ? 'Invoice has been updated successfully.'
          : 'Invoice has been created successfully.',
      });
      navigate('/finance/invoices');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save invoice',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.invoiceNumber || !form.invoiceDate) {
      toast({
        title: 'Validation Error',
        description: 'Customer, Invoice Number, and Invoice Date are required.',
        variant: 'destructive',
      });
      return;
    }
    if (form.lines.every((l) => !l.description.trim())) {
      toast({
        title: 'Validation Error',
        description: 'At least one line item with a description is required.',
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate(form);
  };

  if (isEditing && loadingInvoice) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/finance/invoices')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isEditing ? 'Edit Invoice' : 'Create Invoice'}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer *</Label>
              <Select value={form.customerId} onValueChange={(v) => updateField('customerId', v)}>
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
              <Label htmlFor="invoiceNumber">Invoice Number *</Label>
              <Input
                id="invoiceNumber"
                value={form.invoiceNumber}
                onChange={(e) => updateField('invoiceNumber', e.target.value)}
                placeholder="INV-001"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={form.invoiceDate}
                onChange={(e) => updateField('invoiceDate', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                value={form.dueDate}
                onChange={(e) => updateField('dueDate', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="terms">Terms</Label>
              <Select
                value={form.terms}
                onValueChange={(v) => updateField('terms', v === '__none__' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select terms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {PAYMENT_TERMS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="poId">Purchase Order</Label>
              <Select
                value={form.poId}
                onValueChange={(v) => updateField('poId', v === '__none__' ? '' : v)}
                disabled={!form.customerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={
                    !form.customerId
                      ? 'Select a customer first'
                      : loadingPos
                        ? 'Loading POs...'
                        : 'None'
                  } />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {customerPos.map((po) => (
                    <SelectItem key={po.id} value={String(po.id)}>
                      {po.poNumber} ({po.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="poOverride">PO Override</Label>
              <Input
                id="poOverride"
                value={form.poOverride}
                onChange={(e) => updateField('poOverride', e.target.value)}
                placeholder="Manual PO number"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="customerVisibleNotes">Customer Notes</Label>
              <Textarea
                id="customerVisibleNotes"
                value={form.customerVisibleNotes}
                onChange={(e) => updateField('customerVisibleNotes', e.target.value)}
                placeholder="Visible on the invoice PDF and customer email..."
                rows={3}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="internalNotes">Internal Notes</Label>
              <Textarea
                id="internalNotes"
                value={form.internalNotes}
                onChange={(e) => updateField('internalNotes', e.target.value)}
                placeholder="Internal review notes. Not visible to the customer."
                rows={3}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Legacy Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discountAmount">Discount</Label>
              <Input
                id="discountAmount"
                type="number"
                min="0"
                step="0.01"
                value={form.discountAmount}
                onChange={(e) => updateField('discountAmount', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="freightAmount">Freight</Label>
              <Input
                id="freightAmount"
                type="number"
                min="0"
                step="0.01"
                value={form.freightAmount}
                onChange={(e) => updateField('freightAmount', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retainagePercent">Retainage %</Label>
              <Input
                id="retainagePercent"
                type="number"
                min="0"
                step="0.01"
                value={form.retainagePercent}
                onChange={(e) => updateField('retainagePercent', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retainageAmount">Retainage Amount</Label>
              <Input
                id="retainageAmount"
                type="number"
                min="0"
                step="0.01"
                value={form.retainageAmount}
                onChange={(e) => updateField('retainageAmount', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" />
              Add Line
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Description</TableHead>
                  <TableHead className="w-[15%]">Qty</TableHead>
                  <TableHead className="w-[20%]">Unit Price</TableHead>
                  <TableHead className="w-[15%] text-right">Line Total</TableHead>
                  <TableHead className="w-[10%]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {form.lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={line.description}
                        onChange={(e) => updateLine(index, 'description', e.target.value)}
                        placeholder="Item description"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={line.qty}
                        onChange={(e) => updateLine(index, 'qty', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, 'unitPrice', e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${parseFloat(line.lineTotal || '0').toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(index)}
                        disabled={form.lines.length <= 1}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-medium">
                    Subtotal
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${subtotal.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={2} className="text-right font-medium">
                    Tax Amount
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.taxAmount}
                      onChange={(e) => updateField('taxAmount', e.target.value)}
                      className="w-full"
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${taxAmount.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold text-lg">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold text-lg">
                    ${totalAmount.toFixed(2)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>

        {isEditing && editId && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MediaAttachmentPicker
                entityType="invoice"
                entityId={editId}
              />
            </CardContent>
          </Card>
        )}

        {!isEditing && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Paperclip className="h-5 w-5" />
                Attachments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Save the invoice first, then you can attach documents from the invoice detail page or by editing the invoice.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/finance/invoices')}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isEditing ? 'Update Invoice' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </div>
  );
}

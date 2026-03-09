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
import { Plus, Trash2, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
  taxAmount: string;
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
  taxAmount: '0',
  lines: [emptyLine()],
});

export default function InvoiceFormPage() {
  const [, navigate] = useLocation();
  const [, editParams] = useRoute('/finance/invoices/:id/edit');
  const editId = editParams?.id;
  const isEditing = !!editId;

  const [form, setForm] = useState<InvoiceFormData>(defaultForm());
  const { toast } = useToast();

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: existingInvoice, isLoading: loadingInvoice } = useQuery<any>({
    queryKey: ['/api/ar-invoices', editId],
    enabled: isEditing,
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
        taxAmount: existingInvoice.taxAmount || '0',
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
  const taxAmount = parseFloat(form.taxAmount) || 0;
  const totalAmount = subtotal + taxAmount;

  const updateField = (field: keyof InvoiceFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
        taxAmount: data.taxAmount,
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
              <Input
                id="terms"
                value={form.terms}
                onChange={(e) => updateField('terms', e.target.value)}
                placeholder="Net 30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="poId">PO ID</Label>
              <Input
                id="poId"
                value={form.poId}
                onChange={(e) => updateField('poId', e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="poOverride">PO Override</Label>
              <Input
                id="poOverride"
                value={form.poOverride}
                onChange={(e) => updateField('poOverride', e.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="Additional notes..."
                rows={3}
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

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Paperclip, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAPTransactions } from '../hooks/useTransactions';
import {
  approveAndPostAPBill,
  createAPBill,
  fetchP2APContext,
  uploadAPBillAttachments,
} from '../utils/financeUtils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const initialForm = {
  vendorName: 'R+L Truckload Services, LLC',
  vendorInvoiceNumber: '',
  invoiceDate: '',
  dueDate: '',
  shipDate: '',
  bolNumber: '',
  customerName: '',
  customerPoNumber: '',
  projectId: '',
  freightAmount: '',
  insuranceAmount: '',
  recoveryArInvoiceId: '',
  recoveryAmount: '',
  notes: '',
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount || 0));
}

function statusVariant(status) {
  switch (status) {
    case 'POSTED':
      return 'default';
    case 'APPROVED':
      return 'secondary';
    case 'DRAFT':
      return 'outline';
    case 'VOID':
      return 'destructive';
    default:
      return 'outline';
  }
}

function splitByQuantity(rows, totalAmount) {
  const totalQty = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const total = Number(totalAmount || 0);
  if (!rows.length || !Number.isFinite(total) || total <= 0) return [];
  if (totalQty <= 0) {
    const each = Math.round((total / rows.length) * 100) / 100;
    return rows.map((row, index) => ({
      ...row,
      allocatedAmount: index === rows.length - 1
        ? (total - each * (rows.length - 1)).toFixed(2)
        : each.toFixed(2),
    }));
  }
  let running = 0;
  return rows.map((row, index) => {
    const amount = index === rows.length - 1
      ? total - running
      : Math.round((total * Number(row.quantity || 0) / totalQty) * 100) / 100;
    running += amount;
    return { ...row, allocatedAmount: amount.toFixed(2) };
  });
}

export default function APJournal({ dateFrom, dateTo }) {
  const [dateRange, setDateRange] = useState({ dateFrom, dateTo });
  const [form, setForm] = useState(initialForm);
  const [contextRows, setContextRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const { data, loading, error, refresh } = useAPTransactions(dateRange);

  const totalAmount = useMemo(
    () => Number(form.freightAmount || 0) + Number(form.insuranceAmount || 0),
    [form.freightAmount, form.insuranceAmount],
  );
  const allocationRows = useMemo(() => splitByQuantity(contextRows, totalAmount), [contextRows, totalAmount]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const loadContext = async () => {
    if (!form.customerPoNumber.trim()) {
      toast.error('Enter the customer PO first.');
      return;
    }
    setLoadingContext(true);
    try {
      const rows = await fetchP2APContext(form.customerPoNumber.trim());
      setContextRows(rows);
      const first = rows[0];
      const recovery = rows.find((row) => Number(row.freightAmount || 0) > 0);
      setForm((prev) => ({
        ...prev,
        customerName: prev.customerName || first?.customerName || '',
        recoveryArInvoiceId: prev.recoveryArInvoiceId || recovery?.arInvoiceId || '',
        recoveryAmount: prev.recoveryAmount || (recovery?.freightAmount ? String(recovery.freightAmount) : ''),
      }));
      toast.success(`Loaded ${rows.length} shipment records for ${form.customerPoNumber}.`);
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to load P2 context.');
    } finally {
      setLoadingContext(false);
    }
  };

  const submitBill = async () => {
    if (!form.vendorName || !form.vendorInvoiceNumber || !form.invoiceDate || totalAmount <= 0) {
      toast.error('Vendor, invoice number, invoice date, and positive amount are required.');
      return;
    }
    setSaving(true);
    try {
      const lines = [
        Number(form.freightAmount || 0) > 0 && {
          lineType: 'FREIGHT',
          description: 'Outbound customer freight',
          amount: form.freightAmount,
          glAccountNumber: '54500',
        },
        Number(form.insuranceAmount || 0) > 0 && {
          lineType: 'INSURANCE',
          description: 'Cargo insurance',
          amount: form.insuranceAmount,
          glAccountNumber: '54500',
        },
      ].filter(Boolean);

      const bill = await createAPBill({
        vendorName: form.vendorName,
        vendorInvoiceNumber: form.vendorInvoiceNumber,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || null,
        shipDate: form.shipDate || null,
        bolNumber: form.bolNumber || null,
        customerName: form.customerName || null,
        customerPoNumber: form.customerPoNumber || null,
        projectId: form.projectId || null,
        recoveryArInvoiceId: form.recoveryArInvoiceId || null,
        recoveryAmount: form.recoveryAmount || 0,
        allocationMethod: allocationRows.length ? 'QUANTITY' : 'MANUAL',
        notes: form.notes || null,
        lines,
        allocations: allocationRows.map((row) => ({
          lotId: row.lotId,
          lotNumber: row.lotNumber,
          arInvoiceId: row.arInvoiceId || null,
          arInvoiceNumber: row.arInvoiceNumber || null,
          allocatedAmount: row.allocatedAmount,
          allocationBasis: 'QUANTITY',
          notes: row.freightAmount ? `Customer freight recovery: ${formatCurrency(row.freightAmount)}` : null,
        })),
      });

      await uploadAPBillAttachments(bill.id, files);
      toast.success(`AP bill ${bill.bill_number || bill.billNumber || form.vendorInvoiceNumber} created.`);
      setForm(initialForm);
      setContextRows([]);
      setFiles([]);
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to create AP bill.');
    } finally {
      setSaving(false);
    }
  };

  const approvePost = async (id) => {
    try {
      await approveAndPostAPBill(id);
      toast.success('AP bill approved and posted.');
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to post AP bill.');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>New Vendor Bill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Vendor</Label>
              <Input value={form.vendorName} onChange={(e) => setField('vendorName', e.target.value)} />
            </div>
            <div>
              <Label>Vendor Invoice #</Label>
              <Input value={form.vendorInvoiceNumber} onChange={(e) => setField('vendorInvoiceNumber', e.target.value)} />
            </div>
            <div>
              <Label>Invoice Date</Label>
              <Input type="date" value={form.invoiceDate} onChange={(e) => setField('invoiceDate', e.target.value)} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} />
            </div>
            <div>
              <Label>Ship Date</Label>
              <Input type="date" value={form.shipDate} onChange={(e) => setField('shipDate', e.target.value)} />
            </div>
            <div>
              <Label>BOL</Label>
              <Input value={form.bolNumber} onChange={(e) => setField('bolNumber', e.target.value)} />
            </div>
            <div>
              <Label>Customer</Label>
              <Input value={form.customerName} onChange={(e) => setField('customerName', e.target.value)} />
            </div>
            <div>
              <Label>Customer PO</Label>
              <div className="flex gap-2">
                <Input value={form.customerPoNumber} onChange={(e) => setField('customerPoNumber', e.target.value)} />
                <Button type="button" variant="outline" onClick={loadContext} disabled={loadingContext}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Freight</Label>
              <Input type="number" step="0.01" value={form.freightAmount} onChange={(e) => setField('freightAmount', e.target.value)} />
            </div>
            <div>
              <Label>Cargo Insurance</Label>
              <Input type="number" step="0.01" value={form.insuranceAmount} onChange={(e) => setField('insuranceAmount', e.target.value)} />
            </div>
            <div>
              <Label>Recovery AR Invoice ID</Label>
              <Input value={form.recoveryArInvoiceId} onChange={(e) => setField('recoveryArInvoiceId', e.target.value)} />
            </div>
            <div>
              <Label>Recovery Amount</Label>
              <Input type="number" step="0.01" value={form.recoveryAmount} onChange={(e) => setField('recoveryAmount', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>PDF / Evidence</Label>
              <Input type="file" multiple accept="application/pdf,image/*" onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
            </div>
          </div>
          {allocationRows.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <div className="px-3 py-2 text-sm font-medium bg-muted/40">
                Quantity allocation preview: {formatCurrency(totalAmount)} across {allocationRows.length} shipment records
              </div>
              <div className="divide-y">
                {allocationRows.map((row, index) => (
                  <div key={row.lotId || row.arInvoiceId || index} className="grid grid-cols-4 gap-2 px-3 py-2 text-sm">
                    <span className="font-mono">{row.lotNumber}</span>
                    <span>{row.arInvoiceNumber || 'No AR invoice'}</span>
                    <span>Qty {row.quantity || 0}</span>
                    <span className="text-right font-medium">{formatCurrency(row.allocatedAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Total AP bill: <span className="font-semibold text-foreground">{formatCurrency(totalAmount)}</span>
            </div>
            <Button onClick={submitBill} disabled={saving}>
              <Paperclip className="h-4 w-4 mr-2" />
              Create AP Bill
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Filter Bills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateRange.dateFrom}
                onChange={(e) => setDateRange((prev) => ({ ...prev, dateFrom: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateRange.dateTo}
                onChange={(e) => setDateRange((prev) => ({ ...prev, dateTo: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={refresh} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AP Bills</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">Error loading bills: {error}</div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No AP bills found for the selected date range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-auto border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 font-medium">Bill</th>
                    <th className="text-left p-4 font-medium">Vendor</th>
                    <th className="text-left p-4 font-medium">Customer PO</th>
                    <th className="text-right p-4 font-medium">Amount</th>
                    <th className="text-left p-4 font-medium">Date</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">Evidence</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((bill) => (
                    <tr key={bill.id} className="border-b hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="font-mono text-sm">{bill.vendorInvoiceNumber || bill.billNumber}</div>
                        <div className="text-xs text-muted-foreground">{bill.billNumber}</div>
                      </td>
                      <td className="p-4">{bill.vendorName}</td>
                      <td className="p-4 font-mono text-sm">{bill.poNumber || '-'}</td>
                      <td className="p-4 text-right font-medium">{formatCurrency(bill.amount)}</td>
                      <td className="p-4 text-sm text-gray-600">{new Date(bill.date).toLocaleDateString()}</td>
                      <td className="p-4">
                        <Badge variant={statusVariant(bill.status)}>{bill.status}</Badge>
                      </td>
                      <td className="p-4 text-sm">
                        {bill.attachmentCount || 0} file{bill.attachmentCount === 1 ? '' : 's'} / {bill.allocationCount || 0} allocation{bill.allocationCount === 1 ? '' : 's'}
                      </td>
                      <td className="p-4">
                        {bill.status !== 'POSTED' ? (
                          <Button size="sm" onClick={() => approvePost(bill.id)}>
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve/Post
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">JE {bill.postedJournalEntryId}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit, Paperclip, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAPTransactions } from '../hooks/useTransactions';
import {
  approveAndPostAPBill,
  createAPBill,
  deleteAPBill,
  fetchAPBill,
  fetchAPCustomerOptions,
  fetchAPVendorPOOptions,
  fetchP2APContext,
  fetchVendorOptions,
  updateAPBill,
  uploadAPBillAttachments,
} from '../utils/financeUtils';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const lineTypes = [
  { value: 'MATERIAL', label: 'Material', gl: '54000' },
  { value: 'FREIGHT', label: 'Freight', gl: '54500' },
  { value: 'INSURANCE', label: 'Insurance', gl: '54500' },
  { value: 'OUTSIDE_SERVICE', label: 'Outside Service', gl: '70000' },
  { value: 'TOOLING', label: 'Tooling', gl: '70000' },
  { value: 'SUPPLIES', label: 'Supplies', gl: '62000' },
  { value: 'TAX', label: 'Tax', gl: '70000' },
  { value: 'OTHER', label: 'Other', gl: '80000' },
];

const initialLine = {
  lineType: 'FREIGHT',
  description: 'Outbound customer freight',
  amount: '',
  glAccountNumber: '54500',
};

const initialForm = {
  vendorName: '',
  vendorInvoiceNumber: '',
  billCategory: 'FREIGHT',
  invoiceDate: '',
  dueDate: '',
  shipDate: '',
  bolNumber: '',
  customerSource: 'P2',
  customerId: '',
  customerName: '',
  customerPoNumber: '',
  vendorPoId: '',
  vendorPoNumber: '',
  projectId: '',
  recoveryArInvoiceId: '',
  recoveryAmount: '',
  notes: '',
};

function blankLine(type = 'OTHER') {
  const definition = lineTypes.find((lineType) => lineType.value === type) || lineTypes[lineTypes.length - 1];
  return {
    lineType: definition.value,
    description: definition.label,
    amount: '',
    glAccountNumber: definition.gl,
  };
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(amount || 0));
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
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
  const [lines, setLines] = useState([initialLine]);
  const [contextRows, setContextRows] = useState([]);
  const [savedAllocations, setSavedAllocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [vendorPOs, setVendorPOs] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [loadingBillId, setLoadingBillId] = useState(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const { data, loading, error, refresh } = useAPTransactions(dateRange);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.name === form.vendorName),
    [vendors, form.vendorName],
  );
  const totalAmount = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    [lines],
  );
  const allocationRows = useMemo(
    () => (contextRows.length ? splitByQuantity(contextRows, totalAmount) : savedAllocations),
    [contextRows, savedAllocations, totalAmount],
  );

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  useEffect(() => {
    let cancelled = false;
    fetchVendorOptions()
      .then((rows) => {
        if (!cancelled) setVendors(rows);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load vendors.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAPCustomerOptions({ source: form.customerSource, search: customerSearch })
      .then((rows) => {
        if (!cancelled) setCustomers(rows);
      })
      .catch(() => {
        if (!cancelled) setCustomers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.customerSource, customerSearch]);

  useEffect(() => {
    if (!form.vendorName) {
      setVendorPOs([]);
      return undefined;
    }
    let cancelled = false;
    fetchAPVendorPOOptions({ vendorId: selectedVendor?.id, vendorName: form.vendorName })
      .then((rows) => {
        if (!cancelled) setVendorPOs(rows);
      })
      .catch(() => {
        if (!cancelled) setVendorPOs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.vendorName, selectedVendor?.id]);

  const resetForm = () => {
    setForm(initialForm);
    setLines([initialLine]);
    setContextRows([]);
    setSavedAllocations([]);
    setFiles([]);
    setEditingBillId(null);
  };

  const updateLine = (index, field, value) => {
    setLines((prev) => prev.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (field === 'lineType') {
        const definition = lineTypes.find((lineType) => lineType.value === value);
        return {
          ...line,
          lineType: value,
          description: line.description || definition?.label || '',
          glAccountNumber: definition?.gl || line.glAccountNumber || '80000',
        };
      }
      return { ...line, [field]: value };
    }));
  };

  const addLine = () => {
    setLines((prev) => [...prev, blankLine(form.billCategory)]);
  };

  const removeLine = (index) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, lineIndex) => lineIndex !== index)));
  };

  const chooseCustomer = (value) => {
    const customer = customers.find((row) => `${row.source}:${row.id}` === value);
    setForm((prev) => ({
      ...prev,
      customerSource: customer?.source || prev.customerSource,
      customerId: customer?.id || '',
      customerName: customer?.name || '',
    }));
  };

  const chooseVendorPO = (value) => {
    const po = vendorPOs.find((row) => String(row.id) === value);
    setForm((prev) => ({
      ...prev,
      vendorPoId: po?.id ? String(po.id) : '',
      vendorPoNumber: po?.poNumber || '',
    }));
  };

  const loadContext = async () => {
    if (!form.customerPoNumber.trim()) {
      toast.error('Enter the customer PO first.');
      return;
    }
    setLoadingContext(true);
    try {
      const rows = await fetchP2APContext(form.customerPoNumber.trim());
      setContextRows(rows);
      setSavedAllocations([]);
      const first = rows[0];
      const recovery = rows.find((row) => Number(row.freightAmount || 0) > 0);
      setForm((prev) => ({
        ...prev,
        customerSource: 'P2',
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
    const cleanLines = lines
      .map((line) => ({
        ...line,
        amount: Number(line.amount || 0),
        description: line.description?.trim(),
      }))
      .filter((line) => line.amount > 0 && line.description);

    if (!form.vendorName || !form.vendorInvoiceNumber || !form.invoiceDate || cleanLines.length === 0) {
      toast.error('Vendor, invoice number, invoice date, and at least one positive line are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vendorName: form.vendorName,
        vendorInvoiceNumber: form.vendorInvoiceNumber,
        billCategory: form.billCategory,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || null,
        shipDate: form.shipDate || null,
        bolNumber: form.bolNumber || null,
        customerSource: form.customerSource || 'GENERAL',
        customerId: form.customerId || null,
        customerName: form.customerName || null,
        customerPoNumber: form.customerPoNumber || null,
        vendorPoId: form.vendorPoId || null,
        vendorPoNumber: form.vendorPoNumber || null,
        projectId: form.projectId || null,
        recoveryArInvoiceId: form.recoveryArInvoiceId || null,
        recoveryAmount: form.recoveryAmount || 0,
        allocationMethod: allocationRows.length ? 'QUANTITY' : 'MANUAL',
        notes: form.notes || null,
        lines: cleanLines,
        allocations: allocationRows.map((row) => ({
          sourceType: form.customerSource || 'GENERAL',
          customerSource: form.customerSource || 'GENERAL',
          customerId: form.customerId || null,
          vendorPoId: form.vendorPoId || null,
          vendorPoNumber: form.vendorPoNumber || null,
          lotId: row.lotId,
          lotNumber: row.lotNumber,
          arInvoiceId: row.arInvoiceId || null,
          arInvoiceNumber: row.arInvoiceNumber || null,
          allocatedAmount: row.allocatedAmount,
          allocationBasis: row.allocationBasis || 'QUANTITY',
          notes: row.notes || (row.freightAmount ? `Customer freight recovery: ${formatCurrency(row.freightAmount)}` : null),
        })),
      };

      const bill = editingBillId
        ? await updateAPBill(editingBillId, payload)
        : await createAPBill(payload);

      await uploadAPBillAttachments(bill.id, files);
      toast.success(`AP bill ${bill.bill_number || bill.billNumber || form.vendorInvoiceNumber} ${editingBillId ? 'updated' : 'created'}.`);
      resetForm();
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to save AP bill.');
    } finally {
      setSaving(false);
    }
  };

  const editBill = async (id) => {
    setLoadingBillId(id);
    try {
      const bill = await fetchAPBill(id);
      setForm({
        vendorName: bill.vendor_name || '',
        vendorInvoiceNumber: bill.vendor_invoice_number || '',
        billCategory: bill.bill_category || 'OTHER',
        invoiceDate: String(bill.invoice_date || '').slice(0, 10),
        dueDate: bill.due_date ? String(bill.due_date).slice(0, 10) : '',
        shipDate: bill.ship_date ? String(bill.ship_date).slice(0, 10) : '',
        bolNumber: bill.bol_number || '',
        customerSource: bill.customer_source || 'GENERAL',
        customerId: bill.customer_id || '',
        customerName: bill.customer_name || '',
        customerPoNumber: bill.customer_po_number || '',
        vendorPoId: bill.vendor_po_id ? String(bill.vendor_po_id) : '',
        vendorPoNumber: bill.vendor_po_number || '',
        projectId: bill.project_id || '',
        recoveryArInvoiceId: bill.recovery_ar_invoice_id || '',
        recoveryAmount: bill.recovery_amount ? String(bill.recovery_amount) : '',
        notes: bill.notes || '',
      });
      setLines((bill.lines || []).length
        ? bill.lines.map((line) => ({
          lineType: line.line_type || 'OTHER',
          description: line.description || '',
          amount: line.amount ? String(line.amount) : '',
          glAccountNumber: line.gl_account_number || '80000',
        }))
        : [blankLine(bill.bill_category || 'OTHER')]);
      setSavedAllocations((bill.allocations || []).map((allocation) => ({
        lotId: allocation.lot_id,
        lotNumber: allocation.lot_number,
        arInvoiceId: allocation.ar_invoice_id,
        arInvoiceNumber: allocation.ar_invoice_number,
        allocatedAmount: allocation.allocated_amount,
        allocationBasis: allocation.allocation_basis || 'MANUAL',
        notes: allocation.notes || null,
      })));
      setContextRows([]);
      setFiles([]);
      setEditingBillId(id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to load AP bill.');
    } finally {
      setLoadingBillId(null);
    }
  };

  const removeBill = async (bill) => {
    if (!confirm(`Delete AP bill ${bill.vendorInvoiceNumber || bill.billNumber}? This will void the draft bill and preserve the audit trail.`)) {
      return;
    }
    try {
      await deleteAPBill(bill.id);
      toast.success('AP bill deleted.');
      if (editingBillId === bill.id) resetForm();
      refresh();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Failed to delete AP bill.');
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
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{editingBillId ? 'Edit Vendor Bill' : 'New Vendor Bill'}</CardTitle>
            {editingBillId && (
              <Button type="button" variant="outline" size="sm" onClick={resetForm}>
                <X className="h-4 w-4 mr-1" />
                Cancel Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Vendor</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.vendorName}
                onChange={(e) => {
                  setField('vendorName', e.target.value);
                  setField('vendorPoId', '');
                  setField('vendorPoNumber', '');
                }}
              >
                <option value="">Select vendor...</option>
                {form.vendorName && !vendors.some((vendor) => vendor.name === form.vendorName) && (
                  <option value={form.vendorName}>{form.vendorName}</option>
                )}
                {vendors.map((vendor) => (
                  <option key={vendor.id || vendor.name} value={vendor.name}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Vendor Invoice #</Label>
              <Input value={form.vendorInvoiceNumber} onChange={(e) => setField('vendorInvoiceNumber', e.target.value)} />
            </div>
            <div>
              <Label>Bill Type</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.billCategory}
                onChange={(e) => {
                  setField('billCategory', e.target.value);
                  if (lines.length === 1 && !lines[0].amount) setLines([blankLine(e.target.value)]);
                }}
              >
                {lineTypes.map((lineType) => (
                  <option key={lineType.value} value={lineType.value}>{lineType.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Vendor PO Match</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.vendorPoId}
                onChange={(e) => chooseVendorPO(e.target.value)}
                disabled={!form.vendorName}
              >
                <option value="">No vendor PO match</option>
                {form.vendorPoId && !vendorPOs.some((po) => String(po.id) === form.vendorPoId) && (
                  <option value={form.vendorPoId}>{form.vendorPoNumber || `Vendor PO ${form.vendorPoId}`}</option>
                )}
                {vendorPOs.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber || po.externalPoNumber || `PO ${po.id}`} - {po.status}
                  </option>
                ))}
              </select>
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
              <Label>Ship / Service Date</Label>
              <Input type="date" value={form.shipDate} onChange={(e) => setField('shipDate', e.target.value)} />
            </div>
            <div>
              <Label>BOL / Reference</Label>
              <Input value={form.bolNumber} onChange={(e) => setField('bolNumber', e.target.value)} />
            </div>
            <div>
              <Label>Customer Source</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.customerSource}
                onChange={(e) => {
                  setField('customerSource', e.target.value);
                  setField('customerId', '');
                  setField('customerName', '');
                }}
              >
                <option value="P2">P2</option>
                <option value="P1">P1</option>
                <option value="GENERAL">General</option>
              </select>
            </div>
            <div>
              <Label>Customer Search</Label>
              <Input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
            </div>
            <div>
              <Label>Customer Match</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.customerId ? `${form.customerSource}:${form.customerId}` : ''}
                onChange={(e) => chooseCustomer(e.target.value)}
              >
                <option value="">No customer match</option>
                {form.customerId && !customers.some((customer) => `${customer.source}:${customer.id}` === `${form.customerSource}:${form.customerId}`) && (
                  <option value={`${form.customerSource}:${form.customerId}`}>{form.customerName}</option>
                )}
                {customers.map((customer) => (
                  <option key={`${customer.source}:${customer.id}`} value={`${customer.source}:${customer.id}`}>
                    {customer.name} ({customer.source})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Customer Name</Label>
              <Input value={form.customerName} onChange={(e) => setField('customerName', e.target.value)} />
            </div>
            <div>
              <Label>Customer PO / Cost Objective</Label>
              <div className="flex gap-2">
                <Input value={form.customerPoNumber} onChange={(e) => setField('customerPoNumber', e.target.value)} />
                <Button type="button" variant="outline" onClick={loadContext} disabled={loadingContext} title="Load P2 shipment context">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Project / Work Order</Label>
              <Input value={form.projectId} onChange={(e) => setField('projectId', e.target.value)} />
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

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm font-medium bg-muted/40">
              <span className="col-span-2">Type</span>
              <span className="col-span-5">Description</span>
              <span className="col-span-2">GL</span>
              <span className="col-span-2 text-right">Amount</span>
              <span className="col-span-1" />
            </div>
            <div className="divide-y">
              {lines.map((line, index) => (
                <div key={`${index}-${line.lineType}`} className="grid grid-cols-12 gap-2 p-3">
                  <select
                    className="col-span-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={line.lineType}
                    onChange={(e) => updateLine(index, 'lineType', e.target.value)}
                  >
                    {lineTypes.map((lineType) => (
                      <option key={lineType.value} value={lineType.value}>{lineType.label}</option>
                    ))}
                  </select>
                  <Input className="col-span-5" value={line.description} onChange={(e) => updateLine(index, 'description', e.target.value)} />
                  <Input className="col-span-2" value={line.glAccountNumber} onChange={(e) => updateLine(index, 'glAccountNumber', e.target.value)} />
                  <Input className="col-span-2 text-right" type="number" step="0.01" value={line.amount} onChange={(e) => updateLine(index, 'amount', e.target.value)} />
                  <Button type="button" variant="outline" size="icon" onClick={() => removeLine(index)} disabled={lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center px-3 py-2 bg-muted/20">
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" />
                Add Line
              </Button>
              <span className="text-sm font-medium">Lines total: {formatCurrency(totalAmount)}</span>
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
                Allocation preview: {formatCurrency(totalAmount)} across {allocationRows.length} shipment records
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
              {editingBillId ? 'Update AP Bill' : 'Create AP Bill'}
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
                    <th className="text-left p-4 font-medium">Context</th>
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
                        <div className="text-xs text-muted-foreground">{bill.billNumber} - {bill.billCategory || 'OTHER'}</div>
                      </td>
                      <td className="p-4">{bill.vendorName}</td>
                      <td className="p-4 text-sm">
                        <div>{bill.customerName || '-'}</div>
                        <div className="text-xs text-muted-foreground">
                          {bill.customerSource || 'GENERAL'} {bill.poNumber ? `PO ${bill.poNumber}` : ''}
                          {bill.vendorPoNumber ? ` / Vendor PO ${bill.vendorPoNumber}` : ''}
                        </div>
                      </td>
                      <td className="p-4 text-right font-medium">{formatCurrency(bill.amount)}</td>
                      <td className="p-4 text-sm text-gray-600">{formatDate(bill.date)}</td>
                      <td className="p-4">
                        <Badge variant={statusVariant(bill.status)}>{bill.status}</Badge>
                      </td>
                      <td className="p-4 text-sm">
                        {bill.attachmentCount || 0} file{bill.attachmentCount === 1 ? '' : 's'} / {bill.allocationCount || 0} allocation{bill.allocationCount === 1 ? '' : 's'}
                      </td>
                      <td className="p-4">
                        {bill.status !== 'POSTED' ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => editBill(bill.id)} disabled={loadingBillId === bill.id}>
                              <Edit className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                            <Button size="sm" onClick={() => approvePost(bill.id)}>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve/Post
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => removeBill(bill)}>
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
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

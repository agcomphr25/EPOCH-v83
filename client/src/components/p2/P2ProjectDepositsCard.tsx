import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Landmark, Plus } from 'lucide-react';

const money = (value: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (dateValue: string, days: number) => {
  const value = new Date(`${dateValue}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const dueDateForTerms = (invoiceDate: string, terms: string) => addDays(invoiceDate, terms === 'DUE_ON_RECEIPT' ? 0 : Number(terms.replace('NET_', '')) || 30);
type ClinAllocation = { clinId: string; calculationMethod: 'FIXED_AMOUNT' | 'PERCENTAGE'; fixedAmount: string; percentage: string; contractLineValue: string; description: string };
const emptyAllocation = (): ClinAllocation => ({ clinId: '', calculationMethod: 'FIXED_AMOUNT', fixedAmount: '', percentage: '', contractLineValue: '', description: '' });

export default function P2ProjectDepositsCard({ projectId }: { projectId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [applyDepositId, setApplyDepositId] = useState('');
  const [form, setForm] = useState({ invoiceDate: today(), dueDate: addDays(today(), 30), terms: 'NET_30', customTerms: '', description: 'Material deposit', depositPurpose: '', poNumber: '', customerNotes: '', reason: '', pointOfContactName: 'Glenn Jones', pointOfContactPhone: '(256) 797-5405', pointOfContactEmail: 'glenn.jones@agadvanced.com' });
  const [allocations, setAllocations] = useState<ClinAllocation[]>([emptyAllocation()]);
  const [application, setApplication] = useState({ finalInvoiceId: '', amount: '', reason: '' });

  const workspace = useQuery<any>({
    queryKey: ['/api/ar-invoices/project-deposits', projectId],
    queryFn: () => apiRequest(`/api/ar-invoices/project-deposits?projectId=${encodeURIComponent(projectId)}`),
  });
  const deposits = workspace.data?.deposits || [];
  const finalInvoices = workspace.data?.finalInvoices || [];
  const clins = workspace.data?.clins || [];
  const allocationAmount = (allocation: ClinAllocation) => allocation.calculationMethod === 'PERCENTAGE'
    ? Number(allocation.contractLineValue || 0) * Number(allocation.percentage || 0) / 100
    : Number(allocation.fixedAmount || 0);
  const depositTotal = allocations.reduce((sum, allocation) => sum + allocationAmount(allocation), 0);
  const selectedDeposit = useMemo(() => deposits.find((row: any) => row.id === applyDepositId), [deposits, applyDepositId]);

  const create = useMutation({
    mutationFn: () => apiRequest('/api/ar-invoices/project-deposits', { method: 'POST', body: {
      projectId,
      amount: depositTotal,
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      terms: form.terms === 'CUSTOM' ? form.customTerms : form.terms,
      description: form.description,
      depositPurpose: form.depositPurpose,
      poReference: form.poNumber || null,
      customerVisibleNotes: form.customerNotes || null,
      pointOfContactName: form.pointOfContactName,
      pointOfContactPhone: form.pointOfContactPhone,
      pointOfContactEmail: form.pointOfContactEmail,
      clinAllocations: allocations.map((allocation) => ({
        clinId: Number(allocation.clinId),
        amount: Number(allocationAmount(allocation).toFixed(2)),
        calculationMethod: allocation.calculationMethod,
        percentage: allocation.calculationMethod === 'PERCENTAGE' ? Number(allocation.percentage) : null,
        contractLineValue: allocation.calculationMethod === 'PERCENTAGE' ? Number(allocation.contractLineValue) : null,
        description: allocation.description || null,
      })),
      internalReason: form.reason,
    } }),
    onSuccess: (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ar-invoices/project-deposits', projectId] });
      setCreateOpen(false);
      toast({ title: 'Material deposit invoice created', description: invoice.invoiceNumber });
      navigate(`/finance/invoices/${invoice.id}`);
    },
    onError: (error: any) => toast({ title: 'Unable to create deposit invoice', description: error.message, variant: 'destructive' }),
  });
  const apply = useMutation({
    mutationFn: () => apiRequest(`/api/ar-invoices/project-deposits/${applyDepositId}/apply`, { method: 'POST', body: { ...application, amount: Number(application.amount) } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ar-invoices/project-deposits', projectId] });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/ar-invoices' });
      setApplyDepositId('');
      toast({ title: 'Deposit applied to final invoice' });
    },
    onError: (error: any) => toast({ title: 'Unable to apply deposit', description: error.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Material Deposits</CardTitle>
          <CardDescription>Create a project deposit invoice without a packing slip, then apply paid deposits to a final invoice.</CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> Deposit Invoice</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {deposits.length === 0 ? <p className="text-sm text-muted-foreground">No material deposits for this project.</p> : deposits.map((deposit: any) => (
          <div key={deposit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <button className="text-left" onClick={() => navigate(`/finance/invoices/${deposit.id}`)}>
              <p className="font-medium text-primary hover:underline">{deposit.invoiceNumber}</p>
              <p className="text-sm text-muted-foreground">{money(deposit.totalAmount)} invoiced · {money(deposit.paidAmount)} paid · {money(deposit.appliedAmount)} applied</p>
            </button>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{money(deposit.availableAmount)} available</Badge>
              <Button variant="outline" size="sm" disabled={Number(deposit.availableAmount) <= 0 || finalInvoices.length === 0} onClick={() => { setApplyDepositId(deposit.id); setApplication({ finalInvoiceId: '', amount: String(deposit.availableAmount), reason: '' }); }}>Apply</Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Create Material Deposit Invoice</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Purpose *</Label><Input value={form.depositPurpose} onChange={(e) => setForm({ ...form, depositPurpose: e.target.value })} placeholder="Material purchase for project" /></div>
            <div><Label>Terms *</Label><Select value={form.terms} onValueChange={(value) => setForm({ ...form, terms: value, dueDate: value === 'CUSTOM' ? form.dueDate : dueDateForTerms(form.invoiceDate, value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DUE_ON_RECEIPT">Due on Receipt</SelectItem><SelectItem value="NET_15">Net 15</SelectItem><SelectItem value="NET_30">Net 30</SelectItem><SelectItem value="NET_45">Net 45</SelectItem><SelectItem value="NET_60">Net 60</SelectItem><SelectItem value="CUSTOM">Custom</SelectItem></SelectContent></Select></div>
            {form.terms === 'CUSTOM' && <div className="md:col-span-2"><Label>Custom terms *</Label><Input value={form.customTerms} onChange={(e) => setForm({ ...form, customTerms: e.target.value })} placeholder="Describe the agreed payment terms" /></div>}
            <div><Label>Invoice date *</Label><Input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value, dueDate: form.terms === 'CUSTOM' ? form.dueDate : dueDateForTerms(e.target.value, form.terms) })} /></div>
            <div><Label>Due date *</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>PO / customer reference</Label><Input value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Invoice description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Customer notes</Label><Textarea value={form.customerNotes} onChange={(e) => setForm({ ...form, customerNotes: e.target.value })} /></div>
            <div className="md:col-span-2 rounded-md border p-3"><p className="mb-3 font-medium">Point of Contact</p><div className="grid gap-3 md:grid-cols-3"><div><Label>Name *</Label><Input value={form.pointOfContactName} onChange={(e) => setForm({ ...form, pointOfContactName: e.target.value })} /></div><div><Label>Phone *</Label><Input value={form.pointOfContactPhone} onChange={(e) => setForm({ ...form, pointOfContactPhone: e.target.value })} /></div><div><Label>Email *</Label><Input type="email" value={form.pointOfContactEmail} onChange={(e) => setForm({ ...form, pointOfContactEmail: e.target.value })} /></div></div></div>
            <div className="md:col-span-2 space-y-3 rounded-md border p-3">
              <div className="flex items-center justify-between"><div><p className="font-medium">CLIN Allocations</p><p className="text-xs text-muted-foreground">Allocate this deposit by fixed amount or as a percentage of the CLIN contract value.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setAllocations([...allocations, emptyAllocation()])}>Add CLIN</Button></div>
              {clins.length === 0 && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">No active CLINs are configured for this project. Add the PO line numbers to the project CLIN list before creating a deposit invoice.</p>}
              {allocations.map((allocation, index) => <div key={index} className="grid gap-2 rounded border p-3 md:grid-cols-6">
                <div className="md:col-span-2"><Label>CLIN *</Label><Select value={allocation.clinId} onValueChange={(value) => setAllocations(allocations.map((row, rowIndex) => rowIndex === index ? { ...row, clinId: value } : row))}><SelectTrigger><SelectValue placeholder="Select line" /></SelectTrigger><SelectContent>{clins.map((clin: any) => <SelectItem key={clin.id} value={String(clin.id)}>{clin.clinNumber}{clin.description ? ` - ${clin.description}` : ''}</SelectItem>)}</SelectContent></Select></div>
                <div className="md:col-span-2"><Label>Method *</Label><Select value={allocation.calculationMethod} onValueChange={(value: 'FIXED_AMOUNT' | 'PERCENTAGE') => setAllocations(allocations.map((row, rowIndex) => rowIndex === index ? { ...row, calculationMethod: value } : row))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="FIXED_AMOUNT">Fixed amount</SelectItem><SelectItem value="PERCENTAGE">Percentage</SelectItem></SelectContent></Select></div>
                {allocation.calculationMethod === 'FIXED_AMOUNT' ? <div><Label>Deposit *</Label><Input type="number" min="0.01" step="0.01" value={allocation.fixedAmount} onChange={(e) => setAllocations(allocations.map((row, rowIndex) => rowIndex === index ? { ...row, fixedAmount: e.target.value } : row))} /></div> : <><div><Label>CLIN value *</Label><Input type="number" min="0.01" step="0.01" value={allocation.contractLineValue} onChange={(e) => setAllocations(allocations.map((row, rowIndex) => rowIndex === index ? { ...row, contractLineValue: e.target.value } : row))} /></div><div><Label>Percent *</Label><Input type="number" min="0.01" max="100" step="0.01" value={allocation.percentage} onChange={(e) => setAllocations(allocations.map((row, rowIndex) => rowIndex === index ? { ...row, percentage: e.target.value } : row))} /></div></>}
                <div className="flex items-end justify-between gap-2 md:col-span-6"><span className="text-sm font-medium">Allocation: {money(allocationAmount(allocation))}</span>{allocations.length > 1 && <Button type="button" size="sm" variant="ghost" onClick={() => setAllocations(allocations.filter((_, rowIndex) => rowIndex !== index))}>Remove</Button>}</div>
              </div>)}
              <div className="text-right text-lg font-semibold">Deposit total: {money(depositTotal)}</div>
            </div>
            <div className="md:col-span-2"><Label>Audit reason *</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why this deposit is being invoiced" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={depositTotal <= 0 || allocations.some((allocation) => !allocation.clinId || allocationAmount(allocation) <= 0) || clins.length === 0 || !form.depositPurpose || !form.pointOfContactName || !form.pointOfContactPhone || !form.pointOfContactEmail || (form.terms === 'CUSTOM' && !form.customTerms.trim()) || form.reason.length < 3 || create.isPending} onClick={() => create.mutate()}>Create Deposit Invoice</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!applyDepositId} onOpenChange={(open) => !open && setApplyDepositId('')}>
        <DialogContent><DialogHeader><DialogTitle>Apply {selectedDeposit?.invoiceNumber} to Final Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Final invoice *</Label><Select value={application.finalInvoiceId} onValueChange={(value) => setApplication({ ...application, finalInvoiceId: value })}><SelectTrigger><SelectValue placeholder="Select final invoice" /></SelectTrigger><SelectContent>{finalInvoices.map((invoice: any) => <SelectItem key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {money(invoice.balance)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Amount *</Label><Input type="number" min="0.01" step="0.01" value={application.amount} onChange={(e) => setApplication({ ...application, amount: e.target.value })} /></div>
            <div><Label>Audit reason *</Label><Textarea value={application.reason} onChange={(e) => setApplication({ ...application, reason: e.target.value })} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setApplyDepositId('')}>Cancel</Button><Button disabled={!application.finalInvoiceId || !application.amount || application.reason.length < 3 || apply.isPending} onClick={() => apply.mutate()}>Apply Deposit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

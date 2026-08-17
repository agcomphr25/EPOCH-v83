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

export default function P2ProjectDepositsCard({ projectId }: { projectId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [applyDepositId, setApplyDepositId] = useState('');
  const [form, setForm] = useState({ amount: '', invoiceDate: today(), dueDate: today(), description: 'Material deposit', depositPurpose: '', poNumber: '', customerNotes: '', reason: '' });
  const [application, setApplication] = useState({ finalInvoiceId: '', amount: '', reason: '' });

  const workspace = useQuery<any>({
    queryKey: ['/api/ar-invoices/project-deposits', projectId],
    queryFn: () => apiRequest(`/api/ar-invoices/project-deposits?projectId=${encodeURIComponent(projectId)}`),
  });
  const deposits = workspace.data?.deposits || [];
  const finalInvoices = workspace.data?.finalInvoices || [];
  const selectedDeposit = useMemo(() => deposits.find((row: any) => row.id === applyDepositId), [deposits, applyDepositId]);

  const create = useMutation({
    mutationFn: () => apiRequest('/api/ar-invoices/project-deposits', { method: 'POST', body: {
      projectId,
      amount: Number(form.amount),
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      description: form.description,
      depositPurpose: form.depositPurpose,
      poReference: form.poNumber || null,
      customerVisibleNotes: form.customerNotes || null,
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
        <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Create Material Deposit Invoice</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>Amount *</Label><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Purpose *</Label><Input value={form.depositPurpose} onChange={(e) => setForm({ ...form, depositPurpose: e.target.value })} placeholder="Material purchase for project" /></div>
            <div><Label>Invoice date *</Label><Input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })} /></div>
            <div><Label>Due date *</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>PO / customer reference</Label><Input value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Invoice description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Customer notes</Label><Textarea value={form.customerNotes} onChange={(e) => setForm({ ...form, customerNotes: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Audit reason *</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Why this deposit is being invoiced" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={!form.amount || !form.depositPurpose || form.reason.length < 3 || create.isPending} onClick={() => create.mutate()}>Create Deposit Invoice</Button></DialogFooter>
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

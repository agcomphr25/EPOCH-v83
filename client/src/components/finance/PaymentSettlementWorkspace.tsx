import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Landmark } from 'lucide-react';

const money = (value: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const today = () => new Date().toISOString().slice(0, 10);

export default function PaymentSettlementWorkspace() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ settlementDate: today(), processor: '', bankReference: '', feeAmount: '0', reason: '' });
  const query = useQuery<any>({ queryKey: ['/api/payment-settlements'], queryFn: () => apiRequest('/api/payment-settlements') });
  const payments = query.data?.payments || [];
  const settlements = query.data?.settlements || [];
  const chosen = useMemo(() => payments.filter((row: any) => selected[`${row.paymentSource}:${row.paymentId}`]), [payments, selected]);
  const gross = chosen.reduce((sum: number, row: any) => sum + Number(row.availableAmount || 0), 0);
  const fees = Number(form.feeAmount || 0);
  const net = Math.max(0, gross - fees);
  const outstanding = payments.reduce((sum: number, row: any) => sum + Number(row.availableAmount || 0), 0);
  const submit = useMutation({
    mutationFn: () => apiRequest('/api/payment-settlements', { method: 'POST', body: {
      ...form, grossAmount: gross, feeAmount: fees, netAmount: net,
      items: chosen.map((row: any) => ({ paymentSource: row.paymentSource, paymentId: row.paymentId, amount: Number(row.availableAmount) })),
    } }),
    onSuccess: () => {
      setSelected({});
      setForm({ settlementDate: today(), processor: '', bankReference: '', feeAmount: '0', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/payment-settlements'] });
      toast({ title: 'Bank settlement posted', description: 'Customer Payment Clearing was credited and the net deposit was posted to Bank Checking.' });
    },
    onError: (error: any) => toast({ title: 'Settlement failed', description: error.message, variant: 'destructive' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" /> Customer Payment Clearing (10300)</CardTitle>
        <CardDescription>Match payments to the processor or bank deposit. Posting moves the gross amount out of 10300, records fees, and debits Bank Checking for the net deposit.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Unsettled payments</p><p className="text-xl font-semibold">{payments.length}</p></div>
          <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">10300 awaiting settlement</p><p className="text-xl font-semibold">{money(outstanding)}</p></div>
          <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Selected gross</p><p className="text-xl font-semibold">{money(gross)}</p></div>
          <div className="rounded-md border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Expected bank deposit</p><p className="text-xl font-semibold">{money(net)}</p></div>
        </div>
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-left">Settle</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">Method / reference</th><th className="p-2 text-right">Available</th></tr></thead>
            <tbody>{payments.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No posted customer payments are waiting in 10300.</td></tr> : payments.map((row: any) => {
              const key = `${row.paymentSource}:${row.paymentId}`;
              return <tr key={key} className="border-t"><td className="p-2"><Checkbox checked={!!selected[key]} onCheckedChange={(checked) => setSelected({ ...selected, [key]: checked === true })} /></td><td className="p-2">{row.paymentDate}</td><td className="p-2">{row.customerId || '—'}</td><td className="p-2">{row.paymentMethod || '—'}{row.referenceNumber ? ` · ${row.referenceNumber}` : ''}<div><Badge variant="outline">{row.paymentSource === 'P1_PAYMENT' ? 'P1' : 'AR'}</Badge></div></td><td className="p-2 text-right font-medium">{money(row.availableAmount)}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <div><Label>Deposit date *</Label><Input type="date" value={form.settlementDate} onChange={(e) => setForm({ ...form, settlementDate: e.target.value })} /></div>
          <div><Label>Processor / source *</Label><Input value={form.processor} onChange={(e) => setForm({ ...form, processor: e.target.value })} placeholder="Accept.Blue, AGR, bank" /></div>
          <div><Label>Bank / batch reference *</Label><Input value={form.bankReference} onChange={(e) => setForm({ ...form, bankReference: e.target.value })} /></div>
          <div><Label>Processor fees</Label><Input type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => setForm({ ...form, feeAmount: e.target.value })} /></div>
          <div className="flex items-end"><Button className="w-full" disabled={!chosen.length || !form.processor || !form.bankReference || form.reason.length < 3 || fees > gross || submit.isPending} onClick={() => submit.mutate()}>Post {money(net)} Settlement</Button></div>
          <div className="md:col-span-2 lg:col-span-5"><Label>Audit reason *</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Identify the bank deposit or processor batch being reconciled" /></div>
        </div>
        {settlements.length > 0 && <div><p className="mb-2 text-sm font-medium">Recent settlements</p><div className="space-y-1">{settlements.slice(0, 5).map((row: any) => <div key={row.id} className="flex flex-wrap justify-between gap-2 rounded border p-2 text-sm"><span>{row.settlementDate} · {row.processor} · {row.bankReference}</span><span>{money(row.grossAmount)} gross − {money(row.feeAmount)} fees = {money(row.netAmount)} bank <Badge variant="secondary">{row.status}</Badge></span></div>)}</div></div>}
      </CardContent>
    </Card>
  );
}

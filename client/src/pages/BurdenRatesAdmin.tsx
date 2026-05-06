import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, CheckCircle2, Calculator, Layers, History, FlaskConical } from 'lucide-react';

type Pool = {
  id: number;
  code: string;
  name: string;
  poolType: string;
  description: string | null;
  isActive: boolean;
  applyOrder: number;
  allocationBaseId: number;
};

type Base = {
  id: number;
  code: string;
  name: string;
  resolverKind: string;
  description: string | null;
};

type Rate = {
  id: number;
  poolId: number;
  rate: string;
  rateType: 'PROVISIONAL' | 'BILLING' | 'FINAL';
  effectiveFrom: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
};

type Run = {
  id: number;
  periodYear: number;
  periodMonth: number;
  runType: 'INITIAL' | 'TRUE_UP';
  rateType: 'PROVISIONAL' | 'BILLING' | 'FINAL';
  status: string;
  totalBurden: string;
  recordCount: number;
  appliedBy: string;
  appliedAt: string;
  supersedesRunId: number | null;
  notes: string | null;
};

const fmtMoney = (v: number | string) =>
  Number(v).toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export default function BurdenRatesAdmin() {
  const { toast } = useToast();
  const now = new Date();
  const [period, setPeriod] = useState({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 });

  const pools = useQuery<Pool[]>({ queryKey: ['/api/burden-rates/pools'] });
  const bases = useQuery<Base[]>({ queryKey: ['/api/burden-rates/bases'] });
  const runs = useQuery<Run[]>({ queryKey: ['/api/burden-rates/runs'] });

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-burden-rates-admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-7 w-7" /> Burden Rates Engine
          </h1>
          <p className="text-muted-foreground">
            Indirect cost pools, rates, and applied burden runs (FRINGE / OVERHEAD / G&amp;A).
          </p>
        </div>
      </div>

      <Tabs defaultValue="apply" className="space-y-4">
        <TabsList>
          <TabsTrigger value="apply" data-testid="tab-apply">Apply &amp; Verify</TabsTrigger>
          <TabsTrigger value="pools" data-testid="tab-pools">Pools</TabsTrigger>
          <TabsTrigger value="rates" data-testid="tab-rates">Rates</TabsTrigger>
          <TabsTrigger value="bases" data-testid="tab-bases">Bases</TabsTrigger>
          <TabsTrigger value="runs" data-testid="tab-runs">Runs</TabsTrigger>
          <TabsTrigger value="preview" data-testid="tab-preview">Rate Change Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="apply">
          <ApplyTab period={period} setPeriod={setPeriod} />
        </TabsContent>
        <TabsContent value="pools">
          <PoolsTab pools={pools.data ?? []} bases={bases.data ?? []} />
        </TabsContent>
        <TabsContent value="rates">
          <RatesTab pools={pools.data ?? []} />
        </TabsContent>
        <TabsContent value="bases">
          <BasesTab bases={bases.data ?? []} />
        </TabsContent>
        <TabsContent value="runs">
          <RunsTab runs={runs.data ?? []} />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewTab pools={pools.data ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );

  // ── Apply tab ─────────────────────────────────────────────────────────────
  function ApplyTab({
    period,
    setPeriod,
  }: {
    period: { year: number; month: number };
    setPeriod: (p: { year: number; month: number }) => void;
  }) {
    const [runType, setRunType] = useState<'INITIAL' | 'TRUE_UP'>('INITIAL');
    const [rateType, setRateType] = useState<'PROVISIONAL' | 'BILLING' | 'FINAL'>('PROVISIONAL');

    const verify = useQuery<{ ok: boolean; missing: { recordId: number; missingPoolCodes: string[] }[] }>({
      queryKey: ['/api/burden-rates/verify', period.year, period.month],
      queryFn: async () => {
        const r = await fetch(`/api/burden-rates/verify?year=${period.year}&month=${period.month}`, { credentials: 'include' });
        if (!r.ok) throw new Error(`Verify failed: ${r.status}`);
        return r.json();
      },
    });

    const apply = useMutation({
      mutationFn: async () => {
        return await apiRequest('POST', '/api/burden-rates/apply', { ...period, runType, rateType });
      },
      onSuccess: (data: any) => {
        toast({
          title: 'Burden applied',
          description: `Run #${data.runId}: ${data.recordCount} records, total ${fmtMoney(data.totalBurden)}.`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/burden-rates/runs'] });
        queryClient.invalidateQueries({ queryKey: ['/api/burden-rates/verify', period.year, period.month] });
      },
      onError: async (err: any) => {
        const msg = err?.body?.error || err?.message || 'Apply failed';
        toast({ title: 'Apply failed', description: msg, variant: 'destructive' });
      },
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>Apply Burden for Period</CardTitle>
          <CardDescription>
            Computes burden per cost record using effective-dated rates. INITIAL runs are idempotent
            (re-running replaces a prior INITIAL run). TRUE_UP runs write delta rows referencing the
            superseded INITIAL run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="year">Year</Label>
              <Input
                id="year"
                type="number"
                value={period.year}
                onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}
                data-testid="input-year"
              />
            </div>
            <div>
              <Label htmlFor="month">Month</Label>
              <Input
                id="month"
                type="number"
                min={1}
                max={12}
                value={period.month}
                onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}
                data-testid="input-month"
              />
            </div>
            <div>
              <Label>Run Type</Label>
              <Select value={runType} onValueChange={(v) => setRunType(v as any)}>
                <SelectTrigger data-testid="select-run-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INITIAL">INITIAL</SelectItem>
                  <SelectItem value="TRUE_UP">TRUE_UP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rate Type</Label>
              <Select value={rateType} onValueChange={(v) => setRateType(v as any)}>
                <SelectTrigger data-testid="select-rate-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVISIONAL">PROVISIONAL</SelectItem>
                  <SelectItem value="BILLING">BILLING</SelectItem>
                  <SelectItem value="FINAL">FINAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => apply.mutate()}
              disabled={apply.isPending}
              data-testid="button-apply-burden"
            >
              {apply.isPending ? 'Applying...' : 'Apply Burden'}
            </Button>
            <Button
              variant="outline"
              onClick={() => verify.refetch()}
              data-testid="button-verify"
            >
              Verify Period
            </Button>
          </div>

          {verify.data && (
            <div
              className={`rounded-md border p-3 flex items-start gap-2 ${
                verify.data.ok ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'
              }`}
              data-testid="verify-result"
            >
              {verify.data.ok ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-green-900">Period burden complete — GL posting allowed.</div>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <div className="font-medium text-amber-900">
                      {verify.data.missing.length} record(s) missing burden — GL posting will be blocked.
                    </div>
                    <div className="text-sm text-amber-800 mt-1">
                      First few: {verify.data.missing.slice(0, 5).map((m) => `#${m.recordId}`).join(', ')}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Pools tab ─────────────────────────────────────────────────────────────
  function PoolsTab({ pools, bases }: { pools: Pool[]; bases: Base[] }) {
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({
      code: '', name: '', poolType: 'OVERHEAD', allocationBaseId: bases[0]?.id ?? 0, applyOrder: 100, isActive: true,
    });
    const create = useMutation({
      mutationFn: async () => apiRequest('POST', '/api/burden-rates/pools', form),
      onSuccess: () => {
        toast({ title: 'Pool created' });
        queryClient.invalidateQueries({ queryKey: ['/api/burden-rates/pools'] });
        setCreating(false);
      },
      onError: (e: any) => toast({ title: 'Create failed', description: e?.body?.error || e.message, variant: 'destructive' }),
    });
    const toggleActive = useMutation({
      mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) =>
        apiRequest('PATCH', `/api/burden-rates/pools/${id}`, { isActive }),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/burden-rates/pools'] }),
    });

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Indirect Cost Pools</CardTitle>
            <CardDescription>Pools are applied in <code>applyOrder</code>. Lower applies first.</CardDescription>
          </div>
          <Button onClick={() => setCreating(!creating)} data-testid="button-toggle-create-pool">
            {creating ? 'Cancel' : 'New Pool'}
          </Button>
        </CardHeader>
        <CardContent>
          {creating && (
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 p-3 mb-4 rounded-md border bg-muted/30">
              <Input placeholder="CODE" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="input-pool-code" />
              <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-pool-name" />
              <Select value={form.poolType} onValueChange={(v) => setForm({ ...form, poolType: v })}>
                <SelectTrigger data-testid="select-pool-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FRINGE">FRINGE</SelectItem>
                  <SelectItem value="OVERHEAD">OVERHEAD</SelectItem>
                  <SelectItem value="G_AND_A">G_AND_A</SelectItem>
                  <SelectItem value="OTHER">OTHER</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(form.allocationBaseId)}
                onValueChange={(v) => setForm({ ...form, allocationBaseId: Number(v) })}
              >
                <SelectTrigger data-testid="select-pool-base"><SelectValue placeholder="Base" /></SelectTrigger>
                <SelectContent>
                  {bases.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.code}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Apply order"
                value={form.applyOrder}
                onChange={(e) => setForm({ ...form, applyOrder: Number(e.target.value) })}
                data-testid="input-pool-apply-order"
              />
              <Button onClick={() => create.mutate()} disabled={create.isPending} data-testid="button-create-pool">
                Create
              </Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.map((p) => {
                const base = bases.find((b) => b.id === p.allocationBaseId);
                return (
                  <TableRow key={p.id} data-testid={`row-pool-${p.id}`}>
                    <TableCell>{p.applyOrder}</TableCell>
                    <TableCell className="font-mono">{p.code}</TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell><Badge variant="secondary">{p.poolType}</Badge></TableCell>
                    <TableCell>{base?.code ?? '?'}</TableCell>
                    <TableCell>
                      <Switch
                        checked={p.isActive}
                        onCheckedChange={(checked) => toggleActive.mutate({ id: p.id, isActive: checked })}
                        data-testid={`switch-pool-active-${p.id}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // ── Rates tab ─────────────────────────────────────────────────────────────
  function RatesTab({ pools }: { pools: Pool[] }) {
    const [poolId, setPoolId] = useState<number | null>(pools[0]?.id ?? null);
    const [newRate, setNewRate] = useState({
      rate: '0.0000',
      rateType: 'PROVISIONAL' as 'PROVISIONAL' | 'BILLING' | 'FINAL',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      notes: '',
    });

    const rates = useQuery<Rate[]>({
      queryKey: ['/api/burden-rates/pools', poolId, 'rates'],
      enabled: poolId != null,
      queryFn: async () => {
        const r = await fetch(`/api/burden-rates/pools/${poolId}/rates`, { credentials: 'include' });
        if (!r.ok) throw new Error('Failed to load rates');
        return r.json();
      },
    });

    const create = useMutation({
      mutationFn: async () => apiRequest('POST', `/api/burden-rates/pools/${poolId}/rates`, newRate),
      onSuccess: () => {
        toast({ title: 'Rate added' });
        queryClient.invalidateQueries({ queryKey: ['/api/burden-rates/pools', poolId, 'rates'] });
      },
      onError: (e: any) => toast({ title: 'Add failed', description: e?.body?.error || e.message, variant: 'destructive' }),
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle>Pool Rates</CardTitle>
          <CardDescription>
            Insert-only history. Each rate is effective from its date until superseded by a later
            rate of the same type. Rates are never edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Label>Pool</Label>
            <Select value={poolId ? String(poolId) : ''} onValueChange={(v) => setPoolId(Number(v))}>
              <SelectTrigger data-testid="select-rates-pool"><SelectValue placeholder="Select pool" /></SelectTrigger>
              <SelectContent>
                {pools.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {poolId != null && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded-md border bg-muted/30">
                <Input
                  type="number" step="0.0001" placeholder="Rate (e.g. 0.275)"
                  value={newRate.rate}
                  onChange={(e) => setNewRate({ ...newRate, rate: e.target.value })}
                  data-testid="input-new-rate"
                />
                <Select value={newRate.rateType} onValueChange={(v) => setNewRate({ ...newRate, rateType: v as any })}>
                  <SelectTrigger data-testid="select-new-rate-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROVISIONAL">PROVISIONAL</SelectItem>
                    <SelectItem value="BILLING">BILLING</SelectItem>
                    <SelectItem value="FINAL">FINAL</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date" value={newRate.effectiveFrom}
                  onChange={(e) => setNewRate({ ...newRate, effectiveFrom: e.target.value })}
                  data-testid="input-new-rate-effective"
                />
                <Input
                  placeholder="Notes (optional)" value={newRate.notes}
                  onChange={(e) => setNewRate({ ...newRate, notes: e.target.value })}
                  data-testid="input-new-rate-notes"
                />
                <Button onClick={() => create.mutate()} disabled={create.isPending} data-testid="button-add-rate">
                  Add Rate
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Effective From</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rates.data ?? []).map((r) => (
                    <TableRow key={r.id} data-testid={`row-rate-${r.id}`}>
                      <TableCell>{r.effectiveFrom}</TableCell>
                      <TableCell><Badge variant="outline">{r.rateType}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{(Number(r.rate) * 100).toFixed(4)}%</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.notes ?? ''}</TableCell>
                      <TableCell>{r.createdBy}</TableCell>
                      <TableCell className="text-sm">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Bases tab ─────────────────────────────────────────────────────────────
  function BasesTab({ bases }: { bases: Base[] }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Allocation Bases</CardTitle>
          <CardDescription>
            Bases determine what each pool's rate is multiplied against. Built-in bases:
            DIRECT_LABOR_DOLLARS, DIRECT_LABOR_HOURS, TOTAL_COST_INPUT (TCI = direct labor + prior burden in same run).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Resolver</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bases.map((b) => (
                <TableRow key={b.id} data-testid={`row-base-${b.id}`}>
                  <TableCell className="font-mono">{b.code}</TableCell>
                  <TableCell>{b.name}</TableCell>
                  <TableCell><Badge variant="secondary">{b.resolverKind}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // ── Runs tab ──────────────────────────────────────────────────────────────
  function RunsTab({ runs }: { runs: Run[] }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Burden Application Runs</CardTitle>
          <CardDescription>
            Every run is preserved. TRUE_UP runs reference the INITIAL run they correct (Supersedes column).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Run Type</TableHead>
                <TableHead>Rate Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Total Burden</TableHead>
                <TableHead>Supersedes</TableHead>
                <TableHead>Applied By</TableHead>
                <TableHead>Applied At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id} data-testid={`row-run-${r.id}`}>
                  <TableCell className="font-mono">{r.id}</TableCell>
                  <TableCell>{r.periodYear}-{String(r.periodMonth).padStart(2, '0')}</TableCell>
                  <TableCell><Badge variant={r.runType === 'TRUE_UP' ? 'default' : 'secondary'}>{r.runType}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{r.rateType}</Badge></TableCell>
                  <TableCell>{r.status}</TableCell>
                  <TableCell className="text-right">{r.recordCount}</TableCell>
                  <TableCell className="text-right font-mono">{fmtMoney(r.totalBurden)}</TableCell>
                  <TableCell>{r.supersedesRunId ?? '—'}</TableCell>
                  <TableCell>{r.appliedBy}</TableCell>
                  <TableCell className="text-sm">{new Date(r.appliedAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  }

  // ── Preview tab ───────────────────────────────────────────────────────────
  function PreviewTab({ pools }: { pools: Pool[] }) {
    const now = new Date();
    const [form, setForm] = useState({
      poolId: pools[0]?.id ?? 0,
      newRate: 0,
      newRateType: 'PROVISIONAL' as 'PROVISIONAL' | 'BILLING' | 'FINAL',
      effectiveFrom: now.toISOString().slice(0, 10),
      samplePeriodYear: now.getUTCFullYear(),
      samplePeriodMonth: now.getUTCMonth() + 1,
    });
    const [result, setResult] = useState<any>(null);

    const preview = useMutation({
      mutationFn: async () => apiRequest('POST', '/api/burden-rates/preview', form),
      onSuccess: (data: any) => setResult(data),
      onError: (e: any) => toast({ title: 'Preview failed', description: e?.body?.error || e.message, variant: 'destructive' }),
    });

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> Rate Change Preview</CardTitle>
          <CardDescription>
            Simulates a hypothetical rate change against an actual period's cost records. Read-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Pool</Label>
              <Select value={String(form.poolId)} onValueChange={(v) => setForm({ ...form, poolId: Number(v) })}>
                <SelectTrigger data-testid="select-preview-pool"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pools.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>New Rate</Label>
              <Input
                type="number" step="0.0001"
                value={form.newRate}
                onChange={(e) => setForm({ ...form, newRate: Number(e.target.value) })}
                data-testid="input-preview-rate"
              />
            </div>
            <div>
              <Label>New Rate Type</Label>
              <Select value={form.newRateType} onValueChange={(v) => setForm({ ...form, newRateType: v as any })}>
                <SelectTrigger data-testid="select-preview-rate-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVISIONAL">PROVISIONAL</SelectItem>
                  <SelectItem value="BILLING">BILLING</SelectItem>
                  <SelectItem value="FINAL">FINAL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Effective From</Label>
              <Input type="date" value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                data-testid="input-preview-effective" />
            </div>
            <div>
              <Label>Sample Year</Label>
              <Input type="number" value={form.samplePeriodYear}
                onChange={(e) => setForm({ ...form, samplePeriodYear: Number(e.target.value) })}
                data-testid="input-preview-year" />
            </div>
            <div>
              <Label>Sample Month</Label>
              <Input type="number" min={1} max={12} value={form.samplePeriodMonth}
                onChange={(e) => setForm({ ...form, samplePeriodMonth: Number(e.target.value) })}
                data-testid="input-preview-month" />
            </div>
          </div>
          <Button onClick={() => preview.mutate()} disabled={preview.isPending} data-testid="button-run-preview">
            {preview.isPending ? 'Computing…' : 'Run Preview'}
          </Button>

          {result && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="preview-result">
              <Card>
                <CardHeader className="pb-2"><CardDescription>Before</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{fmtMoney(result.before.totalBurden)}</div>
                  <div className="text-sm text-muted-foreground">{result.before.recordCount} records</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>After</CardDescription></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{fmtMoney(result.after.totalBurden)}</div>
                  <div className="text-sm text-muted-foreground">{result.after.recordCount} records</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>Delta</CardDescription></CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold font-mono ${result.delta >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {result.delta >= 0 ? '+' : ''}{fmtMoney(result.delta)}
                  </div>
                  <div className="text-sm text-muted-foreground">vs. current rate</div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
}

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';
import { TrendingDown, TrendingUp, Minus, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadOpenOrders, runSimulation, type SimInput, type WeekResult } from '@/lib/whatIfSimulation';

interface Order {
  id: number;
  orderId: string;
  dueDate: string;
  status: string;
  currentDepartment?: string | null;
}

const DEFAULT_BASE: SimInput = {
  referenceDate: new Date(),
  ordersPerWeek: 50,
  shipmentsPerWeek: 40,
  simulationWeeks: 12,
  assumedLeadTimeDays: 30,
};

function TrendBadge({ base, alt }: { base: number; alt: number }) {
  const diff = alt - base;
  if (diff < 0) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 gap-1"><TrendingDown className="w-3 h-3" />{Math.abs(diff)}</Badge>;
  if (diff > 0) return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 gap-1"><TrendingUp className="w-3 h-3" />+{diff}</Badge>;
  return <Badge variant="secondary" className="gap-1"><Minus className="w-3 h-3" />No change</Badge>;
}

interface ParamPanelProps {
  label: string;
  color: string;
  params: SimInput;
  onChange: (p: SimInput) => void;
  readonlyDate?: boolean;
}

function ParamPanel({ label, color, params, onChange, readonlyDate }: ParamPanelProps) {
  const set = (key: keyof SimInput, val: number) =>
    onChange({ ...params, [key]: val });

  return (
    <Card className={`border-l-4`} style={{ borderLeftColor: color }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold" style={{ color }}>{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!readonlyDate && (
          <div>
            <Label className="text-xs">Reference Date</Label>
            <Input
              type="date"
              className="mt-1 h-8 text-sm"
              value={format(params.referenceDate, 'yyyy-MM-dd')}
              onChange={(e) => onChange({ ...params, referenceDate: new Date(e.target.value + 'T00:00:00') })}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Orders / Week</Label>
            <Input
              type="number"
              min={0}
              className="mt-1 h-8 text-sm"
              value={params.ordersPerWeek}
              onChange={(e) => set('ordersPerWeek', Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Shipments / Week</Label>
            <Input
              type="number"
              min={0}
              className="mt-1 h-8 text-sm"
              value={params.shipmentsPerWeek}
              onChange={(e) => set('shipmentsPerWeek', Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Simulation Weeks</Label>
            <Input
              type="number"
              min={1}
              max={52}
              className="mt-1 h-8 text-sm"
              value={params.simulationWeeks}
              onChange={(e) => set('simulationWeeks', Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Lead Time (days)</Label>
            <Input
              type="number"
              min={1}
              className="mt-1 h-8 text-sm"
              value={params.assumedLeadTimeDays}
              onChange={(e) => set('assumedLeadTimeDays', Number(e.target.value))}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const COLORS = {
  baseBacklog: '#6366f1',
  basePastDue: '#f59e0b',
  altBacklog: '#22c55e',
  altPastDue: '#ef4444',
};

export default function WhatIfForecast() {
  const [baseParams, setBaseParams] = useState<SimInput>(DEFAULT_BASE);
  const [altParams, setAltParams] = useState<SimInput>({
    ...DEFAULT_BASE,
    shipmentsPerWeek: 50,
  });
  const [hasRun, setHasRun] = useState(false);

  const { data: allOrders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  const seedOrders = useMemo(() => loadOpenOrders(allOrders), [allOrders]);

  const [baseResults, setBaseResults] = useState<WeekResult[]>([]);
  const [altResults, setAltResults] = useState<WeekResult[]>([]);

  function runScenarios() {
    setBaseResults(runSimulation(seedOrders, baseParams));
    setAltResults(runSimulation(seedOrders, altParams));
    setHasRun(true);
  }

  function resetAll() {
    setBaseParams(DEFAULT_BASE);
    setAltParams({ ...DEFAULT_BASE, shipmentsPerWeek: 50 });
    setBaseResults([]);
    setAltResults([]);
    setHasRun(false);
  }

  const chartData = useMemo(() => {
    const len = Math.max(baseResults.length, altResults.length);
    return Array.from({ length: len }, (_, i) => ({
      label: baseResults[i]?.label ?? altResults[i]?.label ?? `Wk ${i + 1}`,
      baseBacklog: baseResults[i]?.backlog ?? null,
      basePastDue: baseResults[i]?.pastDue ?? null,
      altBacklog: altResults[i]?.backlog ?? null,
      altPastDue: altResults[i]?.pastDue ?? null,
    }));
  }, [baseResults, altResults]);

  const finalBase = baseResults[baseResults.length - 1];
  const finalAlt = altResults[altResults.length - 1];

  const breakEvenWeek = useMemo(() => {
    for (let i = 0; i < altResults.length; i++) {
      if (altResults[i].pastDue < (baseResults[i]?.pastDue ?? Infinity)) {
        return altResults[i].weekIndex;
      }
    }
    return null;
  }, [baseResults, altResults]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">What-If Forecast</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Simulate how changes to intake and output rates affect your past-due backlog over time.
            Loaded from <strong>{isLoading ? '…' : seedOrders.length}</strong> open orders.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetAll}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reset
          </Button>
          <Button size="sm" onClick={runScenarios} disabled={isLoading}>
            <Play className="w-4 h-4 mr-1" /> Run Simulation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ParamPanel
          label="Baseline Scenario"
          color={COLORS.baseBacklog}
          params={baseParams}
          onChange={setBaseParams}
        />
        <ParamPanel
          label="What-If Scenario"
          color={COLORS.altPastDue}
          params={altParams}
          onChange={setAltParams}
          readonlyDate
        />
      </div>

      {!hasRun && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
            <Play className="w-8 h-8 opacity-30" />
            <p className="font-medium">Configure your scenarios above and click Run Simulation</p>
            <p className="text-sm">Both scenarios start from the same {seedOrders.length} real open orders</p>
          </CardContent>
        </Card>
      )}

      {hasRun && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">Final Backlog — Baseline</CardDescription>
                <CardTitle className="text-2xl" style={{ color: COLORS.baseBacklog }}>{finalBase?.backlog ?? '—'}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">Final Backlog — What-If</CardDescription>
                <div className="flex items-center gap-2 mt-1">
                  <CardTitle className="text-2xl" style={{ color: COLORS.altPastDue }}>{finalAlt?.backlog ?? '—'}</CardTitle>
                  {finalBase && finalAlt && <TrendBadge base={finalBase.backlog} alt={finalAlt.backlog} />}
                </div>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">Past-Due at Week {baseParams.simulationWeeks} — Baseline</CardDescription>
                <CardTitle className="text-2xl text-amber-600">{finalBase?.pastDue ?? '—'}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-1">
                <CardDescription className="text-xs">Past-Due at Week {altParams.simulationWeeks} — What-If</CardDescription>
                <div className="flex items-center gap-2 mt-1">
                  <CardTitle className="text-2xl text-red-600">{finalAlt?.pastDue ?? '—'}</CardTitle>
                  {finalBase && finalAlt && <TrendBadge base={finalBase.pastDue} alt={finalAlt.pastDue} />}
                </div>
              </CardHeader>
            </Card>
          </div>

          {breakEvenWeek && (
            <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
              <CardContent className="py-3 flex items-center gap-3">
                <TrendingDown className="w-5 h-5 text-green-600 flex-shrink-0" />
                <p className="text-sm text-green-800 dark:text-green-300">
                  <strong>The What-If scenario starts reducing past-due orders from Week {breakEvenWeek}.</strong>{' '}
                  At +{altParams.shipmentsPerWeek - baseParams.shipmentsPerWeek} shipments/week, the improvement becomes visible within {breakEvenWeek} week{breakEvenWeek !== 1 ? 's' : ''}.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backlog Over Time</CardTitle>
              <CardDescription className="text-xs">Total open orders remaining each week</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="baseBacklog" name="Baseline Backlog" stroke={COLORS.baseBacklog} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="altBacklog" name="What-If Backlog" stroke={COLORS.altPastDue} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Past-Due Orders (&gt;14 days) Over Time</CardTitle>
              <CardDescription className="text-xs">Orders whose due date has passed by more than 14 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  {breakEvenWeek && (
                    <ReferenceLine x={`Wk ${breakEvenWeek}`} stroke="#22c55e" strokeDasharray="4 2" label={{ value: 'Improvement', fontSize: 10, fill: '#22c55e' }} />
                  )}
                  <Line type="monotone" dataKey="basePastDue" name="Baseline Past-Due" stroke={COLORS.basePastDue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="altPastDue" name="What-If Past-Due" stroke={COLORS.altPastDue} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Week-by-Week Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-xs">
                      <th className="text-left py-2 pr-4">Week</th>
                      <th className="text-right py-2 pr-4" style={{ color: COLORS.baseBacklog }}>Base Backlog</th>
                      <th className="text-right py-2 pr-4" style={{ color: COLORS.basePastDue }}>Base Past-Due</th>
                      <th className="text-right py-2 pr-4" style={{ color: COLORS.altPastDue }}>Alt Backlog</th>
                      <th className="text-right py-2 pr-4" style={{ color: COLORS.altPastDue }}>Alt Past-Due</th>
                      <th className="text-right py-2">Past-Due Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, i) => {
                      const delta = (row.altPastDue ?? 0) - (row.basePastDue ?? 0);
                      return (
                        <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                          <td className="py-1.5 pr-4 font-medium">{row.label}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{row.baseBacklog ?? '—'}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{row.basePastDue ?? '—'}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{row.altBacklog ?? '—'}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{row.altPastDue ?? '—'}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            <span className={delta < 0 ? 'text-green-600 font-medium' : delta > 0 ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                              {delta > 0 ? '+' : ''}{delta}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';

const BAND_CONFIG: Record<string, { label: string; color: string }> = {
  AUDIT_DEFENSIBLE: { label: 'Audit Defensible', color: 'text-green-600' },
  CONDITIONALLY_PASSABLE: { label: 'Conditionally Passable', color: 'text-yellow-600' },
  HIGH_RISK: { label: 'High Risk', color: 'text-orange-600' },
  MATERIAL_DEFICIENCY: { label: 'Material Deficiency', color: 'text-red-600' },
  AUDIT_FAILURE: { label: 'Audit Failure', color: 'text-red-800' },
};

const DOMAIN_COLORS: Record<string, string> = {
  TIMEKEEPING: '#6366f1', CHARGE_CODE: '#f59e0b', ACCOUNTING: '#10b981',
  PROCUREMENT: '#3b82f6', INVENTORY: '#8b5cf6', POLICY: '#ec4899',
};

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping',
  CHARGE_CODE: 'Charge Code',
  ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement',
  INVENTORY: 'Inventory',
  POLICY: 'Policy',
  GOVT_PROPERTY: 'Govt. Property',
};

function scoreDelta(current?: number | string | null, previous?: number | string | null): number {
  return Number(current ?? 0) - Number(previous ?? 0);
}

export default function EdriHistory() {
  const [showChangeDetails, setShowChangeDetails] = useState(false);

  const { data: snapshots = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/edri/snapshot/history'],
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>;

  const chartData = [...snapshots].reverse().map((snap: any, idx: number) => ({
    date: format(new Date(snap.computedAt), 'MMM d HH:mm'),
    composite: Number(snap.compositeScore),
    subcontractor: Number(snap.subcontractorScore),
    prime: Number(snap.primeScore),
    ...Object.fromEntries(
      Object.entries((snap.domainScores as Record<string, number>) ?? {}).map(([k, v]) => [k, Number(v)])
    ),
    isOverride: snap.isOverride,
    _snapshotId: snap.id,
    _idx: idx,
  }));

  const overrideIndices = chartData
    .filter(d => d.isOverride)
    .map(d => d._idx);

  const latest = snapshots[0];
  const previous = snapshots[1];

  const trend = latest && previous
    ? Number(latest.compositeScore) - Number(previous.compositeScore)
    : 0;

  const domainChanges = latest && previous
    ? Array.from(new Set([
        ...Object.keys((latest.domainScores as Record<string, number>) ?? {}),
        ...Object.keys((previous.domainScores as Record<string, number>) ?? {}),
      ]))
        .map((domain) => {
          const previousScore = Number((previous.domainScores as Record<string, number> | undefined)?.[domain] ?? 0);
          const latestScore = Number((latest.domainScores as Record<string, number> | undefined)?.[domain] ?? 0);
          return {
            domain,
            label: DOMAIN_LABELS[domain] ?? domain,
            previousScore,
            latestScore,
            delta: latestScore - previousScore,
          };
        })
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    : [];

  const topDomainChanges = domainChanges.filter((item) => item.delta !== 0).slice(0, 6);
  const summaryChanges = latest && previous
    ? [
        { label: 'Composite', previousScore: Number(previous.compositeScore), latestScore: Number(latest.compositeScore), delta: trend },
        { label: 'Subcontractor', previousScore: Number(previous.subcontractorScore), latestScore: Number(latest.subcontractorScore), delta: scoreDelta(latest.subcontractorScore, previous.subcontractorScore) },
        { label: 'Prime Contractor', previousScore: Number(previous.primeScore), latestScore: Number(latest.primeScore), delta: scoreDelta(latest.primeScore, previous.primeScore) },
      ]
    : [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <EdriSubNav />

      <div>
        <h1 className="text-3xl font-bold">Score History</h1>
        <p className="text-muted-foreground">Historical trend of EDRI composite and domain scores</p>
      </div>

      {trend !== 0 && (
        <Card className={trend > 0 ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}>
          <CardContent className="pt-4">
            <button
              type="button"
              className="flex w-full items-center gap-3 text-left"
              onClick={() => setShowChangeDetails((open) => !open)}
              aria-expanded={showChangeDetails}
            >
            {trend > 0
              ? <TrendingUp className="h-6 w-6 text-green-500" />
              : trend < 0 ? <TrendingDown className="h-6 w-6 text-red-500" /> : <Minus className="h-6 w-6 text-gray-500" />
            }
            <span className={`font-semibold ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {trend > 0 ? '+' : ''}{trend.toFixed(1)} points since last run
            </span>
            <span className="text-sm text-muted-foreground">
              ({Number(previous?.compositeScore ?? 0).toFixed(1)} → {Number(latest?.compositeScore ?? 0).toFixed(1)})
            </span>
              <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
                What changed
                {showChangeDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </span>
            </button>

            {showChangeDetails && (
              <div className="mt-4 space-y-4 border-t pt-4">
                <div className="grid gap-3 md:grid-cols-3">
                  {summaryChanges.map((item) => (
                    <div key={item.label} className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold">
                        {item.previousScore.toFixed(1)} to {item.latestScore.toFixed(1)}
                      </p>
                      <p className={item.delta >= 0 ? 'text-sm font-medium text-green-600' : 'text-sm font-medium text-red-600'}>
                        {item.delta >= 0 ? '+' : ''}{item.delta.toFixed(1)}
                      </p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Largest domain score changes</p>
                  {topDomainChanges.length > 0 ? (
                    <div className="space-y-2">
                      {topDomainChanges.map((item) => (
                        <div key={item.domain} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                          <span className="min-w-36 font-medium">{item.label}</span>
                          <span className="text-muted-foreground">
                            {item.previousScore.toFixed(1)} to {item.latestScore.toFixed(1)}
                          </span>
                          <span className={`ml-auto font-semibold ${item.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.delta >= 0 ? '+' : ''}{item.delta.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No domain-level score changes were recorded between these two runs.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/edri/snapshot/${previous?.id}`}>View Previous Snapshot</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/edri/snapshot/${latest?.id}`}>View Latest Snapshot</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Composite score chart */}
      <Card>
        <CardHeader>
          <CardTitle>Composite Score Trend</CardTitle>
          <CardDescription>EDRI composite score over time with scoring band thresholds</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length < 2 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Need at least 2 snapshots to show trend chart. Current: {chartData.length} snapshot(s).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: any) => typeof val === 'number' ? val.toFixed(1) : val} />
                <Legend />
                <ReferenceLine y={95} stroke="#22c55e" strokeDasharray="4 4" label={{ value: "95", position: "right", fontSize: 10 }} />
                <ReferenceLine y={85} stroke="#eab308" strokeDasharray="4 4" label={{ value: "85", position: "right", fontSize: 10 }} />
                <ReferenceLine y={70} stroke="#f97316" strokeDasharray="4 4" label={{ value: "70", position: "right", fontSize: 10 }} />
                <ReferenceLine y={55} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "55", position: "right", fontSize: 10 }} />
                {overrideIndices.map(idx => (
                  <ReferenceLine
                    key={`override-${idx}`}
                    x={chartData[idx]?.date}
                    stroke="#f97316"
                    strokeWidth={2}
                    label={{ value: '⚙ Override', position: 'insideTopRight', fontSize: 9, fill: '#f97316' }}
                  />
                ))}
                <Line type="monotone" dataKey="composite" stroke="#2563eb" strokeWidth={2} dot={(props: any) => {
                  if (props.payload?.isOverride) {
                    return <circle key={props.key} cx={props.cx} cy={props.cy} r={6} fill="#f97316" stroke="#fff" strokeWidth={2} />;
                  }
                  return <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="#2563eb" />;
                }} name="Composite" />
                <Line type="monotone" dataKey="subcontractor" stroke="#7c3aed" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Subcontractor" />
                <Line type="monotone" dataKey="prime" stroke="#059669" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Prime" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Domain trends */}
      {chartData.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Domain Score Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(val: any) => typeof val === 'number' ? val.toFixed(1) : val} />
                <Legend />
                {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
                  <Line key={domain} type="monotone" dataKey={domain} stroke={color} strokeWidth={1.5} dot={false} name={domain} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Snapshot table */}
      <Card>
        <CardHeader>
          <CardTitle>Snapshot History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {snapshots.map((snap: any) => {
              const band = BAND_CONFIG[snap.scoringBand];
              return (
                <Link key={snap.id} href={`/admin/edri/snapshot/${snap.id}`}>
                  <div className="flex items-center gap-4 p-3 rounded-md border hover:bg-muted cursor-pointer transition-colors">
                    <div className="text-sm text-muted-foreground w-40">
                      {format(new Date(snap.computedAt), 'MMM d, yyyy HH:mm')}
                    </div>
                    <div className="font-bold text-2xl w-16">{Number(snap.compositeScore).toFixed(1)}</div>
                    <span className={`text-sm font-medium ${band?.color ?? ''}`}>{band?.label ?? snap.scoringBand}</span>
                    {snap.isOverride && <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">Override</Badge>}
                    <div className="flex-1 text-right text-xs text-muted-foreground">
                      by {snap.computedByDisplayName ?? 'System'}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

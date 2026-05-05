import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
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

export default function EdriHistory() {
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

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <EdriSubNav />

      <div>
        <h1 className="text-3xl font-bold">My Score History</h1>
        <p className="text-muted-foreground">Historical trend of EDRI composite and domain scores</p>
      </div>

      {trend !== 0 && (
        <Card className={trend > 0 ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}>
          <CardContent className="pt-4 flex items-center gap-3">
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

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Info } from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type RedFlag, SEVERITY_ORDER, DOMAIN_LABELS, DOMAIN_WEIGHTS } from '@/lib/edriScorecard';

function getCellColor(val: number | undefined | null): string {
  if (val == null) return 'bg-gray-200 dark:bg-gray-700';
  if (val >= 95) return 'bg-green-500 text-white';
  if (val >= 85) return 'bg-yellow-400 text-gray-900';
  if (val >= 70) return 'bg-orange-500 text-white';
  if (val >= 55) return 'bg-red-500 text-white';
  return 'bg-red-900 text-white';
}

function getCheckLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function EdriHeatmap() {
  const [viewMode, setViewMode] = useState<'current' | 'future'>('current');

  const { data, isLoading } = useQuery<any>({
    queryKey: ['/api/edri/snapshot/latest'],
  });

  const { data: openItems = [] } = useQuery<any[]>({
    queryKey: ['/api/edri/remediation', 'all', 'all', 'OPEN', data?.snapshot?.id],
    queryFn: async () => {
      const snapshotId = data?.snapshot?.id;
      if (!snapshotId) return [];
      const res = await fetch(`/api/edri/remediation?status=OPEN&snapshotId=${snapshotId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: viewMode === 'future' && !!data?.snapshot?.id,
  });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-96" /></div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">No EDRI data available.</div>;

  const { snapshot, domainScores, redFlags } = data;

  // Build matrix: domain → {checkKey: score}
  const matrix: Record<string, Record<string, number>> = {};
  const allCheckKeys = new Set<string>();

  for (const ds of (domainScores ?? [])) {
    if (ds.domainKey === 'GOVT_PROPERTY') continue;
    const subScores = ds.subScores ?? {};
    matrix[ds.domainKey] = {};
    for (const [key, val] of Object.entries(subScores)) {
      const numVal = Number(val) * 100;
      matrix[ds.domainKey][key] = numVal;
      allCheckKeys.add(key);
    }
  }

  // Build red flag index: domain → active flags (typed)
  const domainFlagIndex: Record<string, RedFlag[]> = {};
  for (const flag of (redFlags ?? []) as RedFlag[]) {
    if (!flag.isActive) continue;
    const key = flag.domainKey as string;
    if (!domainFlagIndex[key]) domainFlagIndex[key] = [];
    domainFlagIndex[key].push(flag);
  }

  const checkKeys = Array.from(allCheckKeys).sort();
  const domains = Object.keys(DOMAIN_LABELS);

  // Current domain score map (from snapshot)
  const currentDomainScoreMap: Record<string, number> = {};
  if (snapshot.domainScores) {
    for (const [k, v] of Object.entries(snapshot.domainScores as Record<string, number>)) {
      currentDomainScoreMap[k] = Number(v);
    }
  }

  // Future domain score map: add potential recovery from open remediation items per domain
  const futureDomainScoreMap: Record<string, number> = { ...currentDomainScoreMap };
  if (viewMode === 'future' && openItems.length > 0) {
    for (const item of openItems) {
      const domain = item.domainKey as string;
      if (domain && futureDomainScoreMap[domain] != null) {
        futureDomainScoreMap[domain] = Math.min(100, futureDomainScoreMap[domain] + Number(item.potentialScoreRecovery ?? 0));
      }
    }
  }

  // Composite future score
  const futureComposite = Object.entries(DOMAIN_WEIGHTS).reduce((acc, [k, w]) => {
    return acc + (futureDomainScoreMap[k] ?? currentDomainScoreMap[k] ?? 0) * w;
  }, 0);

  const domainScoreMap = viewMode === 'current' ? currentDomainScoreMap : futureDomainScoreMap;
  const displayComposite = viewMode === 'current' ? Number(snapshot.compositeScore) : futureComposite;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-full mx-auto">
        <EdriSubNav />

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Auditor Heatmap</h1>
            <p className="text-muted-foreground">Visual compliance matrix — color-coded by scoring band</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'current' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('current')}>Current State</Button>
            <Button variant={viewMode === 'future' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('future')}>Future State</Button>
          </div>
        </div>

        {/* Mode banner */}
        {viewMode === 'future' && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>
              Future state shows projected scores if all <strong>{openItems.length}</strong> open remediation items are resolved.
              Composite: <strong>{Number(snapshot.compositeScore).toFixed(1)}</strong> → <strong>{futureComposite.toFixed(1)}</strong>
              {futureComposite > Number(snapshot.compositeScore) && <Badge className="ml-2 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">+{(futureComposite - Number(snapshot.compositeScore)).toFixed(1)} projected</Badge>}
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          {[
            { color: 'bg-green-500', label: '≥95 Audit Defensible' },
            { color: 'bg-yellow-400', label: '85–94 Conditional' },
            { color: 'bg-orange-500', label: '70–84 High Risk' },
            { color: 'bg-red-500', label: '55–69 Material Deficiency' },
            { color: 'bg-red-900', label: '<55 Audit Failure' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>

        {/* Domain overview row */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Domain Overview</CardTitle>
            <CardDescription>
              {viewMode === 'current' ? 'Current' : 'Projected future'} composite domain scores · Composite: <strong>{displayComposite.toFixed(1)}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {domains.filter(d => d !== 'GOVT_PROPERTY').map(domain => {
                const score = domainScoreMap[domain] ?? 0;
                const current = currentDomainScoreMap[domain] ?? 0;
                const delta = score - current;
                return (
                  <Link key={domain} href={`/admin/edri/domain/${domain}`}>
                    <div className={`p-3 rounded-lg cursor-pointer hover:opacity-90 transition-opacity text-center ${getCellColor(score)}`}>
                      <p className="text-xs font-medium">{DOMAIN_LABELS[domain]}</p>
                      <p className="text-2xl font-bold mt-1">{score.toFixed(0)}</p>
                      {viewMode === 'future' && delta > 0 && (
                        <p className="text-xs opacity-80">+{delta.toFixed(1)}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Full check matrix */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Check-Level Matrix</CardTitle>
            <CardDescription>Each cell shows the check score (0–100) for the domain</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {checkKeys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No check data available.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 border bg-muted font-medium min-w-[180px]">Check</th>
                    {domains.filter(d => d !== 'GOVT_PROPERTY').map(domain => (
                      <th key={domain} className="p-2 border bg-muted font-medium text-center min-w-[100px]">
                        {DOMAIN_LABELS[domain]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checkKeys.map(checkKey => (
                    <tr key={checkKey}>
                      <td className="p-2 border font-mono text-xs">{getCheckLabel(checkKey)}</td>
                      {domains.filter(d => d !== 'GOVT_PROPERTY').map(domain => {
                        const val = matrix[domain]?.[checkKey];
                        return (
                          <td key={domain} className="border p-0">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={`p-2 text-center cursor-default ${val != null ? getCellColor(val) : 'bg-muted text-muted-foreground'}`}>
                                  {val != null ? `${val.toFixed(0)}` : '—'}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium">{DOMAIN_LABELS[domain]} · {getCheckLabel(checkKey)}</p>
                                <p>{val != null ? `Score: ${val.toFixed(0)}/100` : 'Not applicable for this domain'}</p>
                                {val != null && domainFlagIndex[domain] && domainFlagIndex[domain].length > 0 && (() => {
                                  const sorted = [...domainFlagIndex[domain]].sort(
                                    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
                                  );
                                  return (
                                    <div className="mt-1.5 pt-1.5 border-t border-muted-foreground/20">
                                      <p className="text-xs font-medium text-orange-400 mb-0.5">Active flags in this domain:</p>
                                      {sorted.map((f, i) => (
                                        <p key={i} className="text-xs text-muted-foreground">[{f.severity}] {f.title as string}</p>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

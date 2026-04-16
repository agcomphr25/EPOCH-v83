import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  AlertTriangle,
  CheckCircle2,
  Building2,
  RefreshCw,
} from 'lucide-react';

interface QuoteFeedbackSummary {
  totalProjects: number;
  overrunCount: number;
  overrunPct: number | null;
  avgLaborVariancePct: number | null;
  topRisks: { risk: string; count: number }[];
  topDepartments: { department: string; count: number }[];
}

function buildSummaryUrl(startDate: string, endDate: string): string {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const qs = params.toString();
  return `/api/quote-feedback/summary${qs ? `?${qs}` : ''}`;
}

function StatCard({
  title,
  value,
  description,
  icon,
  variant,
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  variant?: 'default' | 'warning' | 'success';
}) {
  const borderColor =
    variant === 'warning'
      ? 'border-l-4 border-l-red-400'
      : variant === 'success'
      ? 'border-l-4 border-l-green-500'
      : 'border-l-4 border-l-blue-400';

  return (
    <Card className={borderColor}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="space-y-0 pb-2">
        <Skeleton className="h-4 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-1" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  );
}

export default function QuoteAccuracyDashboard() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');

  const queryUrl = buildSummaryUrl(appliedStart, appliedEnd);

  const { data, isLoading, isError, refetch } = useQuery<QuoteFeedbackSummary>({
    queryKey: ['/api/quote-feedback/summary', appliedStart, appliedEnd],
    queryFn: async () => {
      const res = await fetch(queryUrl);
      if (!res.ok) throw new Error('Failed to load summary');
      return res.json();
    },
  });

  function applyFilters() {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  }

  function clearFilters() {
    setStartDate('');
    setEndDate('');
    setAppliedStart('');
    setAppliedEnd('');
  }

  const laborVariance = data?.avgLaborVariancePct;
  const isOverrunHeavy = data?.overrunPct != null && data.overrunPct > 50;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-blue-500" />
          Quote Accuracy Trends
        </h1>
        <p className="text-muted-foreground text-sm">
          Aggregate view of quote vs actual performance across all projects to help estimators improve over time.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter by Date Range</CardTitle>
          <CardDescription>Filter feedback records by when they were generated.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="startDate" className="text-xs">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate" className="text-xs">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={applyFilters} size="sm">Apply</Button>
              {(appliedStart || appliedEnd) && (
                <Button onClick={clearFilters} size="sm" variant="outline">
                  Clear
                </Button>
              )}
              <Button onClick={() => refetch()} size="sm" variant="ghost" title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {(appliedStart || appliedEnd) && (
            <p className="text-xs text-muted-foreground mt-2">
              Showing records
              {appliedStart ? ` from ${appliedStart}` : ''}
              {appliedEnd ? ` through ${appliedEnd}` : ''}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {isError && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-6">
            <p className="text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Failed to load summary data. Please try again.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : data ? (
          <>
            <StatCard
              title="Total Projects Tracked"
              value={data.totalProjects}
              description="Projects with quote execution feedback"
              icon={<BarChart2 className="w-4 h-4" />}
              variant="default"
            />
            <StatCard
              title="Overrun Rate"
              value={data.overrunPct != null ? `${data.overrunPct}%` : '—'}
              description={
                data.overrunCount > 0
                  ? `${data.overrunCount} of ${data.totalProjects} projects exceeded quote`
                  : 'No overruns recorded'
              }
              icon={
                isOverrunHeavy ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                )
              }
              variant={isOverrunHeavy ? 'warning' : 'success'}
            />
            <StatCard
              title="Avg Labor Variance"
              value={
                laborVariance != null
                  ? `${laborVariance > 0 ? '+' : ''}${laborVariance.toFixed(1)}%`
                  : '—'
              }
              description="Average labor hours over/under quote"
              icon={
                laborVariance != null && laborVariance > 0 ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-green-500" />
                )
              }
              variant={
                laborVariance == null ? 'default' : laborVariance > 10 ? 'warning' : 'success'
              }
            />
            <StatCard
              title="Under-Quote Projects"
              value={
                data.totalProjects > 0
                  ? `${data.totalProjects - data.overrunCount}`
                  : '—'
              }
              description="Projects that came in at or under quote"
              icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
              variant="success"
            />
          </>
        ) : null}
      </div>

      {/* Bottom row: risks + departments */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most Frequent Risks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Most Common Risk Factors
            </CardTitle>
            <CardDescription>
              Key risks surfaced most often across project closings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : data && data.topRisks.length > 0 ? (
              <div className="space-y-2">
                {data.topRisks.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="flex-1 mr-2 leading-snug">{item.risk}</span>
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {item.count}×
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No risk data recorded yet. Risks are captured when project closings include "what went wrong" notes.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Most Frequent Departments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              Departments Most Often Involved
            </CardTitle>
            <CardDescription>
              Departments that appear most frequently in actual project execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : data && data.topDepartments.length > 0 ? (
              <div className="space-y-2">
                {data.topDepartments.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                  >
                    <span className="flex-1 mr-2 font-medium">{item.department}</span>
                    <Badge variant="outline" className="shrink-0 tabular-nums">
                      {item.count} project{item.count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No department data recorded yet. Department data is captured from time clock entries linked to WADs.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer note */}
      {data && data.totalProjects === 0 && !isLoading && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <BarChart2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No quote feedback records found
              {appliedStart || appliedEnd ? ' for this date range' : ''}.
              Generate feedback from individual project pages to start tracking trends.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

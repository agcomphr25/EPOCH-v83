import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  BarChart2,
  Calendar,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Layout,
  Printer,
  RefreshCw,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';

interface SummaryData {
  fetchedAt: string;
  reviewPeriod?: { monthKey: string; startDate?: string; endDate?: string };
  revenue: {
    currentMonthAr: number;
    total6Mo: number;
    recent3Mo: number;
    prior3Mo: number;
    growthPct: number | null;
    lastUpdated: string;
  };
  otdPercent: number | null;
  otd?: {
    monthKey: string;
    startDate: string;
    endDate: string;
    totalCount: number;
    onTimeCount: number;
    lateCount: number;
    otdPercent: number | null;
    source: string;
  };
  otdLastUpdated: string;
  ncrCount: number;
  ncrLastUpdated: string;
  customerSatisfaction: {
    avgScore: number | null;
    responseCount: number;
    avg30Day: number | null;
    responseCount30Day: number;
    lastUpdated: string;
  };
  arAging: {
    current: number;
    days30: number;
    days60: number;
    days90plus: number;
    totalOutstanding: number;
    lastUpdated: string;
  };
  pipeline: {
    openCount: number;
    totalValue: number;
    byStage: Record<string, number>;
    p2ByStatus: Record<string, number>;
    lastUpdated: string;
  };
  returnRate: {
    returnCount: number;
    totalOrders: number;
    rate: number | null;
    lastUpdated: string;
  };
  dataErrors?: string[];
}

interface Session {
  id: number;
  month_key: string;
  review_date: string | null;
  action_items: any[];
  bd_pipeline: any[];
  risk_opportunity_text: string | null;
  calendar_events: any[];
  updated_at: string;
}

function money(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toFixed(0)}`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not fetched yet';
  try {
    return format(new Date(value), 'MMM d, h:mm a');
  } catch {
    return 'Not fetched yet';
  }
}

function previousFullMonthKey(): string {
  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return format(new Date(Number(year), Number(month) - 1, 1), 'MMMM yyyy');
}

function reviewWindowLabel(summary?: SummaryData): string {
  if (!summary?.reviewPeriod?.startDate || !summary.reviewPeriod.endDate) {
    return 'Previous full month';
  }
  return `${format(new Date(`${summary.reviewPeriod.startDate}T00:00:00`), 'MMM d')} to ${format(new Date(`${summary.reviewPeriod.endDate}T00:00:00`), 'MMM d, yyyy')}`;
}

function secondThursdayAfterReviewMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const firstOfFollowingMonth = new Date(year, month, 1);
  const firstDay = firstOfFollowingMonth.getDay();
  const daysUntilThursday = (4 - firstDay + 7) % 7;
  return format(new Date(year, month, 1 + daysUntilThursday + 7), 'MMM d, yyyy');
}

function StatusCard({
  title,
  value,
  detail,
  icon: Icon,
  good,
}: {
  title: string;
  value: string;
  detail: string;
  icon: any;
  good?: boolean;
}) {
  const color = good == null ? 'text-gray-500' : good ? 'text-green-600' : 'text-red-600';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</div>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="mt-3 text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</div>
    </div>
  );
}

export default function FinancialReviewPage() {
  const [, navigate] = useLocation();
  const monthKey = previousFullMonthKey();
  const currentLabel = monthLabel(monthKey);
  const plannedReviewDate = secondThursdayAfterReviewMonth(monthKey);

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ['/api/financial-review/summary', monthKey],
    queryFn: async () => {
      const res = await fetch(`/api/financial-review/summary?monthKey=${encodeURIComponent(monthKey)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load business review summary');
      return res.json();
    },
  });

  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ['/api/financial-review', monthKey],
    queryFn: async () => {
      const res = await fetch(`/api/financial-review/${monthKey}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load session');
      return res.json();
    },
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ['/api/financial-review'],
  });

  const otd = summary?.otdPercent;
  const satisfaction = summary?.customerSatisfaction?.avg30Day;
  const reviewDate = session?.review_date
    ? format(new Date(`${session.review_date}T00:00:00`), 'MMM d, yyyy')
    : plannedReviewDate;
  const actionItemCount = session?.action_items?.length ?? 0;
  const pipelineCount = session?.bd_pipeline?.length ?? 0;
  const calendarCount = session?.calendar_events?.length ?? 0;
  const hasNarrative = Boolean(session?.risk_opportunity_text?.trim());
  const pipelinePWeighted = (session?.bd_pipeline ?? []).reduce((sum, item) => {
    const value = Number(item?.value) || 0;
    const probability = Number(item?.pwin) || 0;
    return sum + value * (probability / 100);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Monthly Business Review</h1>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              Review launcher and data readiness for {currentLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/business-review/sessions')}>
              All Reviews <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => navigate(`/business-review/sessions/${monthKey}`)}>
              <Layout className="mr-1 h-4 w-4" /> Open Presentation
            </Button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {summary?.dataErrors && summary.dataErrors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            <div className="font-medium">Some live data sources could not be loaded.</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {summary.dataErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-medium uppercase tracking-wide text-blue-600 dark:text-blue-300">
                  Current review period
                </div>
                <h2 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{currentLabel}</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Data window: {reviewWindowLabel(summary)}
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Planned review date: {reviewDate}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                <Button size="lg" onClick={() => navigate(`/business-review/sessions/${monthKey}`)}>
                  <Layout className="mr-2 h-4 w-4" /> Start / Open Deck
                </Button>
                <Button variant="outline" onClick={() => navigate('/business-review/sessions')}>
                  <Calendar className="mr-2 h-4 w-4" /> Start Another Month
                </Button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
                <div className="text-xs text-gray-500">Action items</div>
                <div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{sessionLoading ? '-' : actionItemCount}</div>
              </div>
              <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
                <div className="text-xs text-gray-500">Pipeline entries</div>
                <div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{sessionLoading ? '-' : pipelineCount}</div>
              </div>
              <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
                <div className="text-xs text-gray-500">Calendar events</div>
                <div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{sessionLoading ? '-' : calendarCount}</div>
              </div>
              <div className="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
                <div className="text-xs text-gray-500">Risk notes</div>
                <div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">{sessionLoading ? '-' : hasNarrative ? 'Ready' : 'Open'}</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-gray-900 dark:text-white">Data Freshness</div>
              <RefreshCw className="h-4 w-4 text-gray-400" />
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Summary</span>
                <span className="text-right text-gray-900 dark:text-white">{formatTimestamp(summary?.fetchedAt)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">OTD</span>
                <span className="text-right text-gray-900 dark:text-white">{formatTimestamp(summary?.otdLastUpdated)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">Review edits</span>
                <span className="text-right text-gray-900 dark:text-white">{formatTimestamp(session?.updated_at)}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="mt-5 w-full" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" /> Print control page
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {summaryLoading ? (
            [1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-32 rounded-lg" />)
          ) : (
            <>
              <StatusCard
                title="On-Time Delivery"
                value={otd != null ? `${otd}%` : '-'}
                detail={summary?.otd ? `${summary.otd.onTimeCount} on time / ${summary.otd.totalCount} shipped` : 'No completed orders for period'}
                icon={CheckCircle}
                good={otd != null ? otd >= 95 : undefined}
              />
              <StatusCard
                title="NCR Count"
                value={summary?.ncrCount != null ? String(summary.ncrCount) : '-'}
                detail="Target below 5"
                icon={AlertTriangle}
                good={summary?.ncrCount != null ? summary.ncrCount < 5 : undefined}
              />
              <StatusCard
                title="Customer Satisfaction"
                value={satisfaction != null ? `${satisfaction} / 5` : '-'}
                detail={`${summary?.customerSatisfaction?.responseCount30Day ?? 0} responses in last 30 days`}
                icon={Star}
                good={satisfaction != null ? satisfaction >= 4 : undefined}
              />
              <StatusCard
                title="Current Month AR"
                value={money(summary?.revenue?.currentMonthAr)}
                detail={`6-month CC total: ${money(summary?.revenue?.total6Mo)}`}
                icon={(summary?.revenue?.growthPct ?? 0) >= 0 ? TrendingUp : TrendingDown}
                good={summary?.revenue?.currentMonthAr != null ? summary.revenue.currentMonthAr > 0 : undefined}
              />
            </>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                <ClipboardList className="h-5 w-5 text-gray-400" /> Review Prep Checklist
              </h2>
              <Button variant="outline" size="sm" onClick={() => navigate(`/business-review/sessions/${monthKey}`)}>
                Edit Slides <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {[
                { label: 'Confirm live KPIs', done: !summaryLoading && !summary?.dataErrors?.length },
                { label: 'Review action items', done: actionItemCount > 0 },
                { label: 'Update BD pipeline', done: pipelineCount > 0 },
                { label: 'Add risk and opportunity notes', done: hasNarrative },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-md border border-gray-100 p-3 dark:border-gray-700">
                  {item.done ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-200">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
              <Users className="h-5 w-5 text-gray-400" /> Recent Reviews
            </h2>
            <div className="mt-4 space-y-2">
              {sessions.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  className="w-full rounded-md border border-gray-100 p-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
                  onClick={() => navigate(`/business-review/sessions/${item.month_key}`)}
                >
                  <div className="font-medium text-gray-900 dark:text-white">{monthLabel(item.month_key)}</div>
                  <div className="text-xs text-gray-500">Updated {formatTimestamp(item.updated_at)}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <details className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">
            Supporting data
          </summary>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md bg-gray-50 p-4 dark:bg-gray-900/60">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <DollarSign className="h-4 w-4 text-gray-400" /> AR Aging
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-500">
                <div>Current: {money(summary?.arAging?.current)}</div>
                <div>31-60: {money(summary?.arAging?.days30)}</div>
                <div>61-90: {money(summary?.arAging?.days60)}</div>
                <div>90+: {money(summary?.arAging?.days90plus)}</div>
              </div>
            </div>
            <div className="rounded-md bg-gray-50 p-4 dark:bg-gray-900/60">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <BarChart2 className="h-4 w-4 text-gray-400" /> Pipeline
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-500">
                <div>Open P2 orders: {summary?.pipeline?.openCount ?? 0}</div>
                <div>Pipeline value: {money(summary?.pipeline?.totalValue)}</div>
                <div>P-weighted manual pipeline: {money(pipelinePWeighted)}</div>
              </div>
            </div>
            <div className="rounded-md bg-gray-50 p-4 dark:bg-gray-900/60">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <RefreshCw className="h-4 w-4 text-gray-400" /> Data Sources
              </div>
              <div className="mt-3 space-y-1 text-sm text-gray-500">
                <div>OTD: /otd-report calculation</div>
                <div>Revenue: payments and AR invoices</div>
                <div>Session: financial_review_sessions</div>
              </div>
            </div>
          </div>
        </details>
      </main>
    </div>
  );
}

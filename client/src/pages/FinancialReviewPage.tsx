import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Star,
  Clock, ClipboardList, BarChart2, Factory, ShieldCheck, Search,
  Calendar, AlertCircle, Printer, Layout, ChevronRight,
  RefreshCw, Activity, DollarSign, Users,
} from 'lucide-react';
import { format } from 'date-fns';
import reviewConfig from '@/config/financialReviewConfig.json';

interface SummaryData {
  fetchedAt: string;
  revenue: {
    currentMonthAr: number; total6Mo: number; recent3Mo: number; prior3Mo: number;
    growthPct: number | null; lastUpdated: string;
  };
  otdPercent: number | null;
  otdLastUpdated: string;
  ncrCount: number;
  ncrLastUpdated: string;
  customerSatisfaction: {
    avgScore: number | null; responseCount: number;
    avg30Day: number | null; responseCount30Day: number; lastUpdated: string;
  };
  arAging: { current: number; days30: number; days60: number; days90plus: number; totalOutstanding: number; lastUpdated: string };
  pipeline: { openCount: number; totalValue: number; byStage: Record<string, number>; p2ByStatus: Record<string, number>; lastUpdated: string };
  returnRate: { returnCount: number; totalOrders: number; rate: number | null; lastUpdated: string };
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

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '';
  try { return format(new Date(ts), 'MMM d, h:mm a'); }
  catch { return ''; }
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthLabel(): string {
  return format(new Date(), 'MMMM yyyy');
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  complete: 'bg-green-100 text-green-800',
  deferred: 'bg-gray-100 text-gray-600',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', complete: 'Complete', deferred: 'Deferred',
};

const PIPELINE_STATUS_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-700',
  proposal: 'bg-blue-100 text-blue-700',
  negotiation: 'bg-yellow-100 text-yellow-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-red-100 text-red-700',
};

const TERM_LABELS: Record<string, string> = {
  short: 'Short-Term (0–30d)',
  mid: 'Mid-Term (1–3 mo)',
  long: 'Long-Term (3+ mo)',
};

function SectionLabel({ title, icon: Icon, fetchedAt }: { title: string; icon: any; fetchedAt?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <Icon className="h-5 w-5 text-gray-400" />
        {title}
      </h2>
      {fetchedAt && (
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          Last fetched {fmtTs(fetchedAt)}
        </span>
      )}
    </div>
  );
}

function KpiCard({ title, value, sub, good, icon: Icon, fetchedAt }: {
  title: string; value: string; sub?: string; good?: boolean; icon: any; fetchedAt?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</div>
        <Icon className={`h-5 w-5 ${good === true ? 'text-green-500' : good === false ? 'text-red-500' : 'text-gray-400'}`} />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{value}</div>
      {sub && <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
      {fetchedAt && (
        <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          {fmtTs(fetchedAt)}
        </div>
      )}
    </div>
  );
}

export default function FinancialReviewPage() {
  const [, navigate] = useLocation();
  const monthKey = currentMonthKey();
  const monthLabel = currentMonthLabel();

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ['/api/financial-review/summary'],
  });

  const { data: session } = useQuery<Session>({
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

  const recentRevGrowth = summary?.revenue?.growthPct;
  const otd = summary?.otdPercent;
  const ncr = summary?.ncrCount;
  const cs = summary?.customerSatisfaction;

  const actionItems: any[] = session?.action_items?.length
    ? session.action_items
    : (reviewConfig.sections.find(s => s.id === 'action-items') as any)?.narrative ?? [];

  const pipeline: any[] = session?.bd_pipeline?.length
    ? session.bd_pipeline
    : (reviewConfig.sections.find(s => s.id === 'bd-pipeline') as any)?.narrative ?? [];

  const calendarEvents: any[] = session?.calendar_events?.length
    ? session.calendar_events
    : (reviewConfig.sections.find(s => s.id === 'calendar-events') as any)?.narrative ?? [];

  const pipelinePWeighted = pipeline.reduce((s, item) => {
    return s + (Number(item.value) || 0) * ((Number(item.pwin) || 0) / 100);
  }, 0);

  return (
    <>
      <style>{`
        @media print {
          /* Hide all chrome: nav, header, sidebar, controls */
          nav, header, aside,
          .no-print,
          [class*="NavigationBar"],
          [class*="sidebar"],
          [class*="Sidebar"],
          [data-role="navigation"] { display: none !important; }
          /* Ensure full-width print */
          body, html { margin: 0; padding: 0; width: 100%; }
          .print-section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 16px; }
          .print-content { max-width: 100% !important; padding: 0 24px !important; }
          /* Show print-only header */
          .print-header { display: block !important; margin-bottom: 16px; }
          /* Force white backgrounds */
          .bg-gray-50, .dark\\:bg-gray-900 { background: white !important; }
          .bg-white, .dark\\:bg-gray-800 { background: white !important; border: 1px solid #e5e7eb !important; }
          .text-gray-900, .dark\\:text-white { color: black !important; }
          .text-gray-500, .dark\\:text-gray-400 { color: #6b7280 !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="no-print bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 shadow-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Monthly Financial Review</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {monthLabel} · Live data as of {format(new Date(), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/financial-review/sessions`)}
              >
                Past Reviews <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              <Button
                size="sm"
                onClick={() => navigate(`/financial-review/sessions/${monthKey}`)}
              >
                <Layout className="h-4 w-4 mr-1" /> Presentation Mode
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" /> Print / PDF
              </Button>
            </div>
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print-header px-6 pt-4">
          <h1 className="text-2xl font-bold">Monthly Financial Review — {monthLabel}</h1>
          <p className="text-sm text-gray-500">AG Composites / EPOCH · Confidential</p>
          <hr className="mt-2 border-gray-300" />
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-8 print-content">

          {/* ── Revenue & KPI Row ── */}
          <section className="print-section">
            <SectionLabel
              title="Revenue & Key Performance Indicators"
              icon={TrendingUp}
              fetchedAt={summary?.revenue?.lastUpdated}
            />
            {summaryLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  title="Current Month Revenue"
                  value={fmt(summary?.revenue?.currentMonthAr)}
                  sub={`6-mo CC total: ${fmt(summary?.revenue?.total6Mo ?? 0)}`}
                  good={summary?.revenue?.currentMonthAr != null ? summary.revenue.currentMonthAr > 0 : undefined}
                  icon={recentRevGrowth != null && recentRevGrowth > 0 ? TrendingUp : TrendingDown}
                  fetchedAt={summary?.revenue?.lastUpdated}
                />
                <KpiCard
                  title="On-Time Delivery"
                  value={otd != null ? `${otd}%` : '—'}
                  sub="Target ≥ 95%"
                  good={otd != null ? otd >= 95 : undefined}
                  icon={CheckCircle}
                  fetchedAt={summary?.otdLastUpdated}
                />
                <KpiCard
                  title="NCR Count (3 mo)"
                  value={ncr != null ? String(ncr) : '—'}
                  sub="Target < 5"
                  good={ncr != null ? ncr < 5 : undefined}
                  icon={AlertTriangle}
                  fetchedAt={summary?.ncrLastUpdated}
                />
                <KpiCard
                  title="Customer Satisfaction (30d)"
                  value={cs?.avg30Day != null ? `${cs.avg30Day} / 5` : '—'}
                  sub={cs?.responseCount30Day ? `${cs.responseCount30Day} responses · 12mo avg: ${cs.avgScore ?? '—'}` : '12mo avg: ' + (cs?.avgScore ?? '—')}
                  good={cs?.avg30Day != null ? cs.avg30Day >= 4 : undefined}
                  icon={Star}
                  fetchedAt={cs?.lastUpdated}
                />
              </div>
            )}
          </section>

          {/* ── Operations & Revenue Forecast ── */}
          <section className="print-section">
            <SectionLabel
              title="Operations & Revenue Forecast"
              icon={Activity}
              fetchedAt={summary?.revenue?.lastUpdated}
            />
            {summaryLoading ? (
              <Skeleton className="h-28 rounded-xl" />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Recent 3-Month Revenue</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary?.revenue?.recent3Mo)}</div>
                  <div className="text-xs text-gray-400 mt-1">Last fetched {fmtTs(summary?.revenue?.lastUpdated)}</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Prior 3-Month Revenue</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary?.revenue?.prior3Mo)}</div>
                  <div className="text-xs text-gray-400 mt-1">Comparison period</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Customer Satisfaction (30d)</div>
                  <div className={`text-2xl font-bold ${cs?.avg30Day != null ? (cs.avg30Day >= 4 ? 'text-green-600' : 'text-red-600') : 'text-gray-400'}`}>
                    {cs?.avg30Day != null ? `${cs.avg30Day} / 5` : 'No data'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {cs?.responseCount30Day ?? 0} responses (last 30 days)
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* ── QMS KPIs & Nonconformities ── */}
          <section className="print-section">
            <SectionLabel
              title="QMS KPIs & Nonconformities"
              icon={ShieldCheck}
              fetchedAt={summary?.ncrLastUpdated}
            />
            {summaryLoading ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                    <div className="text-sm font-medium text-gray-500">NCR Open (3 mo)</div>
                  </div>
                  <div className={`text-3xl font-bold ${(ncr ?? 0) < 5 ? 'text-green-600' : 'text-red-600'}`}>
                    {ncr ?? '—'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Target: &lt; 5</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <div className="text-sm font-medium text-gray-500">OTD Rate (3 mo)</div>
                  </div>
                  <div className={`text-3xl font-bold ${otd != null && otd >= 95 ? 'text-green-600' : 'text-red-600'}`}>
                    {otd != null ? `${otd}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Target: ≥ 95%</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-400" />
                    <div className="text-sm font-medium text-gray-500">Customer Return Rate</div>
                  </div>
                  <div className={`text-3xl font-bold ${(summary?.returnRate?.rate ?? 0) <= 2 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary?.returnRate?.rate != null ? `${summary.returnRate.rate}%` : '—'}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {summary?.returnRate?.returnCount ?? 0} returns / {summary?.returnRate?.totalOrders ?? 0} orders (12 mo)
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-yellow-500" />
                    <div className="text-sm font-medium text-gray-500">AR Outstanding</div>
                  </div>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white">
                    {fmt(summary?.arAging?.totalOutstanding)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Balance due on open invoices</div>
                </div>
              </div>
            )}
          </section>

          {/* ── AR Aging ── */}
          <section className="print-section">
            <SectionLabel
              title="AR Aging Summary"
              icon={DollarSign}
              fetchedAt={summary?.arAging?.lastUpdated}
            />
            {summaryLoading ? (
              <Skeleton className="h-24 rounded-xl" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Current (≤ 30d)', value: summary?.arAging?.current ?? 0, color: 'text-green-600' },
                  { label: '31–60 Days', value: summary?.arAging?.days30 ?? 0, color: 'text-yellow-600' },
                  { label: '61–90 Days', value: summary?.arAging?.days60 ?? 0, color: 'text-orange-600' },
                  { label: '90+ Days', value: summary?.arAging?.days90plus ?? 0, color: 'text-red-600' },
                ].map((bucket) => (
                  <div key={bucket.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{bucket.label}</div>
                    </div>
                    <div className={`text-2xl font-bold ${bucket.color}`}>{fmt(bucket.value)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Action Items ── */}
          <section className="print-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-gray-400" /> Action Items
              </h2>
              <Button
                size="sm" variant="outline"
                onClick={() => navigate(`/financial-review/sessions/${monthKey}`)}
                className="no-print"
              >
                Edit in Slides <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {actionItems.length === 0 ? (
                <div className="p-8 text-center text-gray-400 italic">No action items for this period</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Item</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Owner</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionItems.map((ai: any, i: number) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="py-3 px-4 text-gray-900 dark:text-white">{ai.item}</td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{ai.owner}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ai.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_LABELS[ai.status] ?? ai.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 text-sm">{ai.dueDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── BD Pipeline ── */}
          <section className="print-section">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-gray-400" /> Business Development Pipeline
              </h2>
              <div className="flex items-center gap-3">
                {summary?.pipeline && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    {fmtTs(summary.pipeline.lastUpdated)}
                  </span>
                )}
                {pipelinePWeighted > 0 && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    P-Weighted: <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(pipelinePWeighted)}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Live P2 pipeline from p2_purchase_orders + p2_purchase_order_items */}
            {summary?.pipeline && (
              <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-3">
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Open P2 Orders</div>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{summary.pipeline.openCount}</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 p-3">
                  <div className="text-xs text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">P2 Pipeline Value</div>
                  <div className="text-xl font-bold text-green-700 dark:text-green-300 mt-1">{fmt(summary.pipeline.totalValue)}</div>
                </div>
                {Object.entries(summary.pipeline.p2ByStatus ?? {}).map(([status, count]) => (
                  <div key={status} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{status}</div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-1">{count as number}</div>
                  </div>
                ))}
                {Object.entries(summary.pipeline.byStage ?? {}).slice(0, 2).map(([stage, count]) => (
                  <div key={stage} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 p-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{stage.replace(/_/g, ' ')}</div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-200 mt-1">{count as number}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              {pipeline.length === 0 ? (
                <div className="p-8 text-center text-gray-400 italic">No pipeline opportunities for this period</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Opportunity</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Value</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">P-Win</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipeline.map((item: any, i: number) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{item.name}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.value ? fmt(Number(item.value)) : '—'}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{item.pwin ? `${item.pwin}%` : '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PIPELINE_STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* ── Narrative sections: Production Changes / CARs / First Articles ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { id: 'production-changes', icon: Factory, label: 'Production Changes' },
              { id: 'corrective-actions', icon: ShieldCheck, label: 'Corrective Actions (CARs)' },
              { id: 'first-articles', icon: Search, label: 'First Article Inspections' },
            ].map(({ id, icon: Icon, label }) => {
              const cfg = reviewConfig.sections.find(s => s.id === id);
              return (
                <section key={id} className="print-section bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className="h-5 w-5 text-gray-400" />
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{label}</h3>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    {(cfg as any)?.narrative ?? 'No notes for this period.'}
                  </p>
                </section>
              );
            })}
          </div>

          {/* ── Calendar Events ── */}
          <section className="print-section">
            <SectionLabel title="Calendar & Upcoming Events" icon={Calendar} />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(['short', 'mid', 'long'] as const).map((term) => {
                const events = calendarEvents.filter((e: any) => e.term === term);
                return (
                  <div key={term} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                      {TERM_LABELS[term]}
                    </div>
                    {events.length === 0 ? (
                      <div className="text-sm text-gray-400 italic">No events</div>
                    ) : (
                      <ul className="space-y-2">
                        {events.map((e: any, i: number) => (
                          <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                            {e.event}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Risk & Opportunity ── */}
          {(session?.risk_opportunity_text) && (
            <section className="print-section">
              <SectionLabel title="Risk & Opportunity" icon={AlertCircle} />
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 dark:text-gray-200">
                  {session.risk_opportunity_text}
                </pre>
              </div>
            </section>
          )}

          {/* ── Past Sessions ── */}
          <section className="print-section no-print">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-400" /> Past Monthly Reviews
              </h2>
              <Button variant="outline" size="sm" onClick={() => navigate('/financial-review/sessions')}>
                All Sessions <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {sessions.slice(0, 6).map((s) => {
                const [year, month] = s.month_key.split('-');
                const label = format(new Date(Number(year), Number(month) - 1, 1), 'MMMM yyyy');
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/financial-review/sessions/${s.month_key}`)}
                    className="text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Last updated {format(new Date(s.updated_at), 'MMM d, yyyy')}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

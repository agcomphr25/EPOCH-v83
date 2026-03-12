import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Star,
  Clock, ClipboardList, BarChart2, Factory, ShieldCheck, Search,
  Calendar, AlertCircle, Printer, Layout, ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import reviewConfig from '@/config/financial-review-config.json';

interface SummaryData {
  revenue: { total6Mo: number; recent3Mo: number; prior3Mo: number; growthPct: number | null };
  otdPercent: number | null;
  ncrCount: number;
  customerSatisfaction: { avgScore: number | null; responseCount: number };
  arAging: { current: number; days30: number; days60: number; days90plus: number };
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
          Live
        </div>
      )}
    </div>
  );
}

export default function FinancialReviewPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const monthKey = currentMonthKey();
  const monthLabel = currentMonthLabel();
  const fetchedAt = new Date().toISOString();

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
          .no-print { display: none !important; }
          .print-section { page-break-inside: avoid; break-inside: avoid; }
          body { font-size: 12px; }
          .print-header { display: block !important; }
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
                <Printer className="h-4 w-4 mr-1" /> Print
              </Button>
            </div>
          </div>
        </div>

        {/* Hidden print header */}
        <div className="hidden print-header mx-6 my-4">
          <h1 className="text-2xl font-bold">Monthly Financial Review — {monthLabel}</h1>
          <p className="text-sm text-gray-500">AG Composites · Confidential</p>
          <hr className="mt-2" />
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">

          {/* ── KPI Row ── */}
          <section className="print-section">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Revenue &amp; Key Performance Indicators
            </h2>
            {summaryLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  title="6-Month CC Revenue"
                  value={fmt(summary?.revenue?.total6Mo)}
                  sub={recentRevGrowth != null ? `${recentRevGrowth > 0 ? '+' : ''}${recentRevGrowth}% QoQ` : undefined}
                  good={recentRevGrowth != null ? recentRevGrowth > 0 : undefined}
                  icon={recentRevGrowth != null && recentRevGrowth > 0 ? TrendingUp : TrendingDown}
                  fetchedAt={fetchedAt}
                />
                <KpiCard
                  title="On-Time Delivery"
                  value={otd != null ? `${otd}%` : '—'}
                  sub="Target ≥ 95%"
                  good={otd != null ? otd >= 95 : undefined}
                  icon={CheckCircle}
                  fetchedAt={fetchedAt}
                />
                <KpiCard
                  title="NCR Count (3 mo)"
                  value={ncr != null ? String(ncr) : '—'}
                  sub="Target < 5"
                  good={ncr != null ? ncr < 5 : undefined}
                  icon={AlertTriangle}
                  fetchedAt={fetchedAt}
                />
                <KpiCard
                  title="Customer Satisfaction"
                  value={cs?.avgScore != null ? `${cs.avgScore} / 5` : '—'}
                  sub={cs?.responseCount ? `${cs.responseCount} responses (12 mo)` : undefined}
                  good={cs?.avgScore != null ? cs.avgScore >= 4 : undefined}
                  icon={Star}
                  fetchedAt={fetchedAt}
                />
              </div>
            )}
          </section>

          {/* ── AR Aging ── */}
          <section className="print-section">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              AR Aging Summary
            </h2>
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
              {pipelinePWeighted > 0 && (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  P-Weighted: <span className="font-semibold text-gray-800 dark:text-gray-200">{fmt(pipelinePWeighted)}</span>
                </div>
              )}
            </div>
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

          {/* ── Narrative sections ── */}
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
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" /> Calendar &amp; Upcoming Events
            </h2>
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
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-gray-400" /> Risk &amp; Opportunity
              </h2>
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
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Past Monthly Reviews</h2>
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

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useMetricBulk } from '@/hooks/useMetric';
import { DashboardFilterProvider, useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Package,
  DollarSign,
  FileText,
  ClipboardList,
  Zap,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
} from 'lucide-react';
import WidgetRenderer from '@/components/widgets/WidgetRenderer';
import { WidgetConfig } from '@/lib/widgetRegistry';
import { PCC_DASHBOARD_LAYOUT } from '@/config/pccDashboardLayout';
import DashboardControlBar from '@/components/widgets/DashboardControlBar';

const LIME = '#CFFF00';
const NEAR_BLACK = '#0d0d0d';
const CARD_BG = '#1a1a1a';
const CARD_BORDER = '#2a2a2a';
const FONT_STACK = "'Barlow Condensed', 'Arial Narrow', 'Impact', ui-sans-serif, system-ui, sans-serif";

interface Order {
  orderId: string;
  dueDate?: string;
  status: string;
  shippedDate?: string;
  shippingCompletedAt?: string;
  updatedAt: string;
}

function getCompletionDate(order: Order): string | null {
  if (order.shippedDate) {
    return typeof order.shippedDate === 'string'
      ? order.shippedDate.split('T')[0]
      : new Date(order.shippedDate).toISOString().split('T')[0];
  }
  if (order.shippingCompletedAt) {
    return typeof order.shippingCompletedAt === 'string'
      ? order.shippingCompletedAt.split('T')[0]
      : new Date(order.shippingCompletedAt).toISOString().split('T')[0];
  }
  if (order.updatedAt) {
    return typeof order.updatedAt === 'string'
      ? order.updatedAt.split('T')[0]
      : new Date(order.updatedAt).toISOString().split('T')[0];
  }
  return null;
}

interface RibbonSignal {
  id: string;
  label: string;
  value: number;
  severity: 'info' | 'warning' | 'critical';
  domain: 'company' | 'p1' | 'p2';
  route: string;
  icon?: string;
}

const ICON_MAP: Record<string, typeof AlertTriangle> = {
  AlertTriangle,
  Package,
  DollarSign,
  FileText,
  ClipboardList,
};

const SEVERITY_BG: Record<string, string> = {
  critical: '#3d0000',
  warning: '#2d2000',
  info: '#001a2d',
};

const SEVERITY_TEXT: Record<string, string> = {
  critical: '#ff4d4d',
  warning: '#ffd700',
  info: '#60c0ff',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: '#ff2222',
  warning: '#e6b800',
  info: '#1e90ff',
};

function LiveCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn('relative overflow-hidden', className)}
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 0,
        borderLeft: `3px solid ${LIME}`,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span
        className="text-xs font-black uppercase tracking-[0.25em] whitespace-nowrap"
        style={{ color: LIME, fontFamily: FONT_STACK }}
      >
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${LIME}44, transparent)` }} />
    </div>
  );
}

interface KpiDef {
  label: string;
  sublabel: string;
  isLoading: boolean;
  value: number | null;
  unit: string;
  trend: 'up' | 'down' | 'neutral';
  trendLabel: string | null;
}

function KpiScoreboard() {
  const slugs = ['orders_completed_today', 'orders_in_production'];
  const { data: bulk, isLoading: bulkLoading } = useMetricBulk(slugs);

  const shipped = bulk?.snapshot['orders_completed_today']?.value ?? 0;
  const inProd = bulk?.snapshot['orders_in_production']?.value ?? 0;

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery<{ withinThreeDaysPct: number }>({
    queryKey: ['/api/admin/forecast-accuracy'],
    refetchInterval: 300_000,
  });

  const otd = useMemo(() => {
    if (ordersLoading) return null;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const completed = orders.filter((o) => {
      if (o.status !== 'SHIPPED' && o.status !== 'FULFILLED') return false;
      if (!o.dueDate) return false;
      const comp = getCompletionDate(o);
      if (!comp) return false;
      return comp >= monthStart && comp <= today;
    });
    let onTime = 0;
    for (const o of completed) {
      const comp = getCompletionDate(o);
      const due = o.dueDate!.split('T')[0];
      if (comp && comp <= due) onTime++;
    }
    return completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 0;
  }, [orders, ordersLoading]);

  const forecastPct = forecastData?.withinThreeDaysPct ?? null;

  const kpis: KpiDef[] = [
    {
      label: 'STOCKS SHIPPED',
      sublabel: 'Operational week (Wed–Tue)',
      isLoading: bulkLoading,
      value: bulkLoading ? null : shipped,
      unit: '',
      trend: 'up',
      trendLabel: 'Tracking ahead',
    },
    {
      label: 'IN PRODUCTION',
      sublabel: 'Active orders across all depts',
      isLoading: bulkLoading,
      value: bulkLoading ? null : inProd,
      unit: '',
      trend: 'neutral',
      trendLabel: null,
    },
    {
      label: 'ON-TIME DELIVERY',
      sublabel: 'Current month shipped orders',
      isLoading: ordersLoading,
      value: otd,
      unit: '%',
      trend: otd !== null && otd >= 80 ? 'up' : 'down',
      trendLabel: otd !== null ? (otd >= 80 ? 'On target' : 'Below target') : null,
    },
    {
      label: 'FORECAST ACCURACY',
      sublabel: 'Within 3-day window',
      isLoading: forecastLoading,
      value: forecastLoading ? null : (forecastPct ?? 0),
      unit: '%',
      trend: forecastPct !== null && forecastPct >= 85 ? 'up' : 'down',
      trendLabel: !forecastLoading && forecastPct !== null ? (forecastPct >= 85 ? 'On target' : 'Below 85%') : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
      {kpis.map((kpi) => {
        const TrendIcon =
          kpi.trend === 'up' ? TrendingUp : kpi.trend === 'down' ? TrendingDown : Minus;
        return (
          <LiveCard key={kpi.label} className="px-5 py-4 flex flex-col gap-1">
            <span
              className="text-[10px] font-black uppercase tracking-[0.2em] block"
              style={{ color: LIME, fontFamily: FONT_STACK }}
            >
              {kpi.label}
            </span>
            <span
              className="text-[10px] font-medium uppercase tracking-wider block mb-1"
              style={{ color: '#555', fontFamily: FONT_STACK }}
            >
              {kpi.sublabel}
            </span>
            <div className="flex items-end gap-2 mt-1">
              {kpi.isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: LIME }} />
              ) : (
                <span
                  className="leading-none tabular-nums font-black"
                  style={{
                    fontSize: '3.5rem',
                    color: LIME,
                    fontFamily: FONT_STACK,
                    textShadow: `0 0 20px ${LIME}55`,
                  }}
                >
                  {kpi.value !== null ? kpi.value.toLocaleString() : '—'}
                  {kpi.value !== null ? kpi.unit : ''}
                </span>
              )}
            </div>
            {kpi.trendLabel && !kpi.isLoading && (
              <div
                className="flex items-center gap-1 mt-1"
                style={{
                  color:
                    kpi.trend === 'up' ? '#22c55e' : kpi.trend === 'down' ? '#ef4444' : '#888',
                }}
              >
                <TrendIcon className="h-3 w-3" />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ fontFamily: FONT_STACK }}
                >
                  {kpi.trendLabel}
                </span>
              </div>
            )}
          </LiveCard>
        );
      })}
    </div>
  );
}

function LiveSignalRibbon() {
  const { businessContext } = useDashboardFilters();
  const [, setLocation] = useLocation();

  const { data } = useQuery<{ signals: RibbonSignal[] }>({
    queryKey: ['/api/control-tower/signals'],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const signals = (data?.signals ?? []).filter(
    (s) =>
      s.domain === 'company' || s.domain === businessContext || businessContext === 'company',
  );

  if (signals.length === 0) return null;

  return (
    <div
      className="mb-6 overflow-x-auto"
      style={{
        background: '#111',
        border: `1px solid ${CARD_BORDER}`,
        borderLeft: `3px solid ${LIME}`,
        padding: '10px 14px',
      }}
    >
      <div className="flex gap-2 py-0.5">
        {signals.map((signal) => {
          const IconComponent = ICON_MAP[signal.icon ?? ''] ?? AlertTriangle;
          return (
            <button
              key={signal.id}
              onClick={() => setLocation(signal.route)}
              className="flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all hover:brightness-125"
              style={{
                background: SEVERITY_BG[signal.severity],
                color: SEVERITY_TEXT[signal.severity],
                border: `1px solid ${SEVERITY_TEXT[signal.severity]}44`,
                borderRadius: 0,
                padding: '4px 12px',
                fontFamily: FONT_STACK,
                fontSize: '0.75rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              <IconComponent style={{ width: 12, height: 12, flexShrink: 0 }} />
              <span>{signal.label}</span>
              <span
                style={{
                  background: SEVERITY_BADGE[signal.severity],
                  color: '#fff',
                  borderRadius: 0,
                  minWidth: 20,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  fontSize: '0.65rem',
                  fontWeight: 900,
                }}
              >
                {signal.value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LiveWidgetSection() {
  return (
    <>
      {PCC_DASHBOARD_LAYOUT.sections.map((section) => {
        if (section.id === 'hero') return null;

        const colsClass =
          section.columns === 1
            ? 'grid-cols-1'
            : section.columns === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : section.columns === 3
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';

        return (
          <div key={section.id} className="mb-8">
            <SectionLabel>{section.title}</SectionLabel>
            <div className={cn('grid gap-3', colsClass)}>
              {section.widgets.map((widget) => (
                <LiveCard
                  key={widget.id}
                  className={widget.colSpan ?? 'col-span-1'}
                >
                  <WidgetRenderer config={widget as WidgetConfig} />
                </LiveCard>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function LoadingSplash({ onDone, dataReady }: { onDone: () => void; dataReady: boolean }) {
  const minElapsedRef = useRef(false);
  const doneCalledRef = useRef(false);

  const tryDone = useRef(() => {
    if (!doneCalledRef.current && minElapsedRef.current && dataReady) {
      doneCalledRef.current = true;
      onDone();
    }
  });

  useEffect(() => {
    const minTimer = setTimeout(() => {
      minElapsedRef.current = true;
      tryDone.current();
    }, 1000);
    const maxTimer = setTimeout(() => {
      if (!doneCalledRef.current) {
        doneCalledRef.current = true;
        onDone();
      }
    }, 4000);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [onDone]);

  useEffect(() => {
    if (dataReady) {
      tryDone.current = () => {
        if (!doneCalledRef.current && minElapsedRef.current) {
          doneCalledRef.current = true;
          onDone();
        }
      };
      tryDone.current();
    }
  }, [dataReady, onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: NEAR_BLACK }}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <Zap
            style={{ width: 36, height: 36, color: LIME, filter: `drop-shadow(0 0 12px ${LIME})` }}
          />
          <span
            className="font-black uppercase"
            style={{
              fontSize: '2.2rem',
              color: LIME,
              fontFamily: FONT_STACK,
              textShadow: `0 0 30px ${LIME}`,
              letterSpacing: '0.35em',
            }}
          >
            LOAD NORRIS
          </span>
        </div>
        <div
          className="text-xs font-bold uppercase"
          style={{ color: '#555', fontFamily: FONT_STACK, letterSpacing: '0.3em' }}
        >
          Production Control Center — Live
        </div>
        <div
          style={{
            width: 240,
            height: 3,
            background: '#222',
            borderRadius: 0,
            overflow: 'hidden',
            marginTop: 8,
          }}
        >
          <div
            style={{
              height: '100%',
              background: LIME,
              boxShadow: `0 0 12px ${LIME}`,
              animation: 'live-load 1.4s ease-in-out forwards',
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes live-load {
          from { width: 0% }
          to { width: 100% }
        }
      `}</style>
    </div>
  );
}

function ProductionControlCenterLiveInner() {
  const [loaded, setLoaded] = useState(false);
  const { data: bulkData } = useMetricBulk(['orders_completed_today', 'orders_in_production']);
  const dataReady = bulkData !== undefined;

  return (
    <div
      className="min-h-screen"
      style={{ background: NEAR_BLACK, fontFamily: FONT_STACK }}
    >
      {!loaded && <LoadingSplash onDone={() => setLoaded(true)} dataReady={dataReady} />}

      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.4s ease' }}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Zap
                style={{
                  width: 22,
                  height: 22,
                  color: LIME,
                  filter: `drop-shadow(0 0 8px ${LIME})`,
                }}
              />
              <h1
                className="font-black uppercase"
                style={{
                  fontSize: '1.85rem',
                  color: LIME,
                  fontFamily: FONT_STACK,
                  textShadow: `0 0 20px ${LIME}55`,
                  letterSpacing: '0.18em',
                }}
              >
                PRODUCTION CONTROL CENTER
              </h1>
              <span
                className="font-black uppercase px-2 py-0.5"
                style={{
                  fontSize: '0.7rem',
                  background: LIME,
                  color: NEAR_BLACK,
                  fontFamily: FONT_STACK,
                  letterSpacing: '0.15em',
                  borderRadius: 0,
                  verticalAlign: 'middle',
                }}
              >
                LIVE
              </span>
            </div>
            <p
              className="font-bold uppercase"
              style={{
                fontSize: '0.7rem',
                color: '#555',
                fontFamily: FONT_STACK,
                letterSpacing: '0.15em',
              }}
            >
              Real-time production monitoring — high-performance view
            </p>
          </div>
          <div className="flex items-center gap-2" style={{ color: '#444' }}>
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: LIME, boxShadow: `0 0 8px ${LIME}` }}
            />
            <span
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ fontFamily: FONT_STACK, color: '#555' }}
            >
              Live
            </span>
          </div>
        </div>

        <div className="mb-6">
          <DashboardControlBar />
        </div>

        <KpiScoreboard />

        <LiveSignalRibbon />

        <LiveWidgetSection />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&display=swap');
      `}</style>
    </div>
  );
}

export default function ProductionControlCenterLive() {
  return (
    <DashboardFilterProvider>
      <ProductionControlCenterLiveInner />
    </DashboardFilterProvider>
  );
}

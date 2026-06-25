import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface KpiData {
  otdPercent: number | null;
  otd?: {
    monthKey: string;
    totalCount: number;
    onTimeCount: number;
    lateCount: number;
  };
  ncrCount: number;
  revenueGrowthPct: number | null;
  recentRevenue: number;
  priorRevenue: number;
}

interface ShipmentRow { month: string; shipments: string; }

function GrowthIcon({ pct }: { pct: number | null }) {
  if (pct == null) return <Minus className="h-5 w-5 text-gray-400" />;
  if (pct > 0) return <TrendingUp className="h-5 w-5 text-green-500" />;
  if (pct < 0) return <TrendingDown className="h-5 w-5 text-red-500" />;
  return <Minus className="h-5 w-5 text-gray-400" />;
}

export default function KPIsSlide({ monthKey }: { monthKey?: string }) {
  const { data: kpis, isLoading } = useQuery<KpiData>({
    queryKey: ['/api/financial-review/live/kpis', monthKey],
    queryFn: async () => {
      const suffix = monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : '';
      const res = await fetch(`/api/financial-review/live/kpis${suffix}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load KPI data');
      return res.json();
    },
  });

  const { data: shipments = [] } = useQuery<ShipmentRow[]>({
    queryKey: ['/api/financial-review/live/shipments'],
  });

  const lastTwo = shipments.slice(-2);
  let shipmentGrowth: number | null = null;
  if (lastTwo.length === 2) {
    const prev = Number(lastTwo[0].shipments);
    const curr = Number(lastTwo[1].shipments);
    shipmentGrowth = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
  }

  const kpiRows = [
    {
      label: 'On-Time Delivery',
      value: kpis?.otdPercent != null ? `${kpis.otdPercent}%` : '—',
      target: '≥ 95%',
      good: kpis?.otdPercent != null && kpis.otdPercent >= 95,
    },
    {
      label: 'NCR Count (3 months)',
      value: kpis?.ncrCount != null ? String(kpis.ncrCount) : '—',
      target: '< 5',
      good: kpis?.ncrCount != null && kpis.ncrCount < 5,
    },
    {
      label: 'Revenue Growth (QoQ)',
      value: kpis?.revenueGrowthPct != null ? `${kpis.revenueGrowthPct > 0 ? '+' : ''}${kpis.revenueGrowthPct}%` : '—',
      target: '> 0%',
      good: kpis?.revenueGrowthPct != null && kpis.revenueGrowthPct > 0,
    },
    {
      label: 'Shipments Growth (MoM)',
      value: shipmentGrowth != null ? `${shipmentGrowth > 0 ? '+' : ''}${shipmentGrowth}%` : '—',
      target: '> 0%',
      good: shipmentGrowth != null && shipmentGrowth > 0,
    },
  ];

  return (
    <div className="h-full flex flex-col px-10 py-8">
      <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Quality Objectives — KPIs</h2>
      <div className="h-1 w-16 bg-blue-500 rounded mb-6" />

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Metric</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Actual</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Target</th>
                <th className="text-center py-3 px-4 text-sm font-semibold text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {kpiRows.map((row) => (
                <tr key={row.label} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-4 px-4 font-medium text-gray-900 dark:text-white text-lg">{row.label}</td>
                  <td className="py-4 px-4 text-center text-xl font-bold text-gray-900 dark:text-white">{row.value}</td>
                  <td className="py-4 px-4 text-center text-gray-500 dark:text-gray-400">{row.target}</td>
                  <td className="py-4 px-4 text-center">
                    {row.value === '—' ? (
                      <Minus className="h-5 w-5 text-gray-300 mx-auto" />
                    ) : row.good ? (
                      <CheckCircle className="h-6 w-6 text-green-500 mx-auto" />
                    ) : (
                      <AlertCircle className="h-6 w-6 text-red-500 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-xs text-gray-400 mt-2 text-right">Live from EPOCH</div>
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import {
  Activity,
  AlertTriangle,
  ShieldCheck,
  Clock,
  RefreshCw,
  Loader2,
  XCircle,
  Factory,
  ArrowRight,
  GitBranch,
  TrendingUp,
  PackageCheck,
  Calendar,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DeptHeatmap {
  department: string;
  orderCount: number;
  avgDaysInStage: number;
}

interface HeatmapData {
  totalActive: number;
  pipelineErrors: number;
  queueErrors: number;
  stalledOrders: number;
  departments: DeptHeatmap[];
  generatedAt: string;
}

interface StuckOrder {
  orderId: string;
  orderNumber: string;
  customerName: string;
  department: string;
  daysInDepartment: number;
  dueDate: string | null;
}

interface StuckOrdersData {
  stuckOrders: StuckOrder[];
  totalCount: number;
  generatedAt: string;
}

interface CycleTime {
  department: string;
  avgDays: number;
}

interface ThroughputData {
  departmentCycleTimes: CycleTime[];
  ordersCompletedToday: number;
  ordersCompletedThisWeek: number;
  ordersCompletedThisMonth: number;
  generatedAt: string;
}

interface OrderForecast {
  orderId: string;
  orderNumber: string;
  customerName: string;
  currentDepartment: string;
  dueDate: string | null;
  projectedCompletion: string;
  remainingDays: number;
  riskStatus: 'ON_TRACK' | 'AT_RISK' | 'LATE';
  remainingStages: string[];
}

interface ForecastData {
  totalForecasted: number;
  onTrack: number;
  atRisk: number;
  late: number;
  orders: OrderForecast[];
  generatedAt: string;
}

const STANDARD_DAYS: Record<string, number> = {
  'P1 Production Queue': 5,
  'Layup/Plugging': 3,
  'Barcode': 1,
  'CNC': 2,
  'Gunsmith': 3,
  'Finish': 3,
  'Finish QC': 1,
  'Paint': 3,
  'Shipping QC': 1,
  'Shipping': 2,
};

const STUCK_THRESHOLDS: Record<string, number> = {
  'P1 Production Queue': 7,
  'Layup/Plugging': 7,
  'Barcode': 3,
  'CNC': 5,
  'Gunsmith': 5,
  'Finish': 7,
  'Finish QC': 3,
  'Paint': 5,
  'Shipping QC': 3,
  'Shipping': 2,
};

const CYCLE_THRESHOLDS: Record<string, number> = {
  'Layup/Plugging': 7,
  'CNC': 5,
  'Gunsmith': 5,
  'Finish': 7,
  'Finish QC': 3,
  'Paint': 5,
};

function getRowStatus(dept: DeptHeatmap): { label: string; color: string; rowClass: string } {
  const standard = STANDARD_DAYS[dept.department];
  if (!standard) {
    if (dept.avgDaysInStage > 7) {
      return {
        label: 'Slow',
        color: 'text-orange-600 dark:text-orange-400',
        rowClass: 'bg-orange-50 dark:bg-orange-950/20',
      };
    }
    return { label: 'OK', color: 'text-green-600 dark:text-green-400', rowClass: '' };
  }

  if (dept.avgDaysInStage > standard * 2) {
    return {
      label: 'Bottleneck',
      color: 'text-red-600 dark:text-red-400',
      rowClass: 'bg-red-50 dark:bg-red-950/20',
    };
  }
  if (dept.avgDaysInStage > standard) {
    return {
      label: 'Slow',
      color: 'text-orange-600 dark:text-orange-400',
      rowClass: 'bg-orange-50 dark:bg-orange-950/20',
    };
  }
  return { label: 'On Track', color: 'text-green-600 dark:text-green-400', rowClass: '' };
}

export default function ProductionControlTower() {
  const [runKey, setRunKey] = useState(0);

  const { data: heatmap, isLoading: heatmapLoading, isFetching } = useQuery<HeatmapData>({
    queryKey: ['/api/admin/production-heatmap', runKey],
    queryFn: () => apiRequest('/api/admin/production-heatmap'),
    retry: false,
    staleTime: 30000,
  });

  const { data: stuckData, isLoading: stuckLoading } = useQuery<StuckOrdersData>({
    queryKey: ['/api/admin/stuck-orders', runKey],
    queryFn: () => apiRequest('/api/admin/stuck-orders'),
    retry: false,
    staleTime: 30000,
  });

  const { data: throughput, isLoading: throughputLoading } = useQuery<ThroughputData>({
    queryKey: ['/api/admin/throughput-analytics', runKey],
    queryFn: () => apiRequest('/api/admin/throughput-analytics'),
    retry: false,
    staleTime: 60000,
  });

  const { data: forecast, isLoading: forecastLoading } = useQuery<ForecastData>({
    queryKey: ['/api/admin/order-forecast', runKey],
    queryFn: () => apiRequest('/api/admin/order-forecast'),
    retry: false,
    staleTime: 60000,
  });

  const isLoading = heatmapLoading || stuckLoading || throughputLoading || forecastLoading;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Factory className="h-6 w-6 text-indigo-600" />
              Production Control Tower
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Real-time operational overview of the production pipeline.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/admin/queue-integrity">
              <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                System Integrity
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRunKey((k) => k + 1)}
              disabled={isFetching}
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading production data…
          </div>
        )}

        {heatmap && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {heatmap.totalActive}
                      </p>
                      <p className="text-xs text-gray-500">Active Orders</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${heatmap.pipelineErrors > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <GitBranch className={`h-5 w-5 ${heatmap.pipelineErrors > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {heatmap.pipelineErrors}
                      </p>
                      <p className="text-xs text-gray-500">Pipeline Errors</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${heatmap.queueErrors > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <ShieldCheck className={`h-5 w-5 ${heatmap.queueErrors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {heatmap.queueErrors}
                      </p>
                      <p className="text-xs text-gray-500">Queue Errors</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${heatmap.stalledOrders > 0 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <Clock className={`h-5 w-5 ${heatmap.stalledOrders > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {heatmap.stalledOrders}
                      </p>
                      <p className="text-xs text-gray-500">Stalled Orders</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Department Heatmap
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Department load and throughput · Red = bottleneck (exceeds 2x standard) · Orange = slow (exceeds standard)
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(heatmap.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/50 z-10">
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Department
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Orders
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Avg Days
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Standard
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {heatmap.departments.map((dept) => {
                      const status = getRowStatus(dept);
                      const standard = STANDARD_DAYS[dept.department];
                      return (
                        <tr
                          key={dept.department}
                          className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${status.rowClass}`}
                        >
                          <td className="px-5 py-3">
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {dept.department}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center tabular-nums">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                              {dept.orderCount}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center tabular-nums">
                            <span className={`font-semibold ${status.color}`}>
                              {dept.avgDaysInStage.toFixed(1)}d
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center tabular-nums text-gray-400">
                            {standard ? `${standard}d` : '—'}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded ${
                              status.label === 'Bottleneck'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                : status.label === 'Slow'
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                            }`}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {heatmap.departments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                          No active orders found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {stuckData && stuckData.stuckOrders.length > 0 && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Stuck Orders Inspector
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Orders exceeding department time thresholds · Top 50 by days stuck · Red = exceeds 2x threshold
                </p>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                {stuckData.totalCount} stuck
              </span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/50 z-10">
                  <tr className="border-b border-gray-100 dark:border-gray-800">
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Order
                    </th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Customer
                    </th>
                    <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Department
                    </th>
                    <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Days in Dept
                    </th>
                    <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Due Date
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stuckData.stuckOrders.map((order) => {
                    const threshold = STUCK_THRESHOLDS[order.department] || 7;
                    const isCritical = order.daysInDepartment > threshold * 2;
                    return (
                      <tr
                        key={order.orderId}
                        className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
                          isCritical ? 'bg-red-50 dark:bg-red-950/20' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <span className="font-medium text-gray-800 dark:text-gray-200 font-mono text-xs">
                            {order.orderNumber}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                          {order.customerName}
                        </td>
                        <td className="px-5 py-3 text-gray-700 dark:text-gray-300">
                          {order.department}
                        </td>
                        <td className="px-5 py-3 text-center tabular-nums">
                          <span className={`font-semibold ${
                            isCritical
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-orange-600 dark:text-orange-400'
                          }`}>
                            {order.daysInDepartment.toFixed(1)}d
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center text-gray-500 text-xs">
                          {order.dueDate
                            ? new Date(order.dueDate).toLocaleDateString()
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {throughput && (
          <>
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  Production Throughput
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Orders completed by time period (based on shipping completion date)
                </p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
                <div className="px-5 py-5 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {throughput.ordersCompletedToday}
                    </p>
                    <p className="text-xs text-gray-500">Completed Today</p>
                  </div>
                </div>
                <div className="px-5 py-5 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {throughput.ordersCompletedThisWeek}
                    </p>
                    <p className="text-xs text-gray-500">This Week</p>
                  </div>
                </div>
                <div className="px-5 py-5 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <CalendarRange className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {throughput.ordersCompletedThisMonth}
                    </p>
                    <p className="text-xs text-gray-500">This Month</p>
                  </div>
                </div>
              </div>
            </div>

            {throughput.departmentCycleTimes.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <PackageCheck className="h-4 w-4 text-teal-500" />
                    Department Cycle Times
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Average time orders spend between stage completion timestamps
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Department
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Avg Days
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Threshold
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {throughput.departmentCycleTimes.map((ct) => {
                      const threshold = CYCLE_THRESHOLDS[ct.department];
                      const exceeds = threshold && ct.avgDays > threshold;
                      return (
                        <tr
                          key={ct.department}
                          className={`border-b border-gray-100 dark:border-gray-800 ${
                            exceeds ? 'bg-orange-50 dark:bg-orange-950/20' : ''
                          }`}
                        >
                          <td className="px-5 py-3 font-medium text-gray-800 dark:text-gray-200">
                            {ct.department}
                          </td>
                          <td className="px-5 py-3 text-center tabular-nums">
                            <span className={`font-semibold ${
                              exceeds
                                ? 'text-orange-600 dark:text-orange-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}>
                              {ct.avgDays.toFixed(1)}d
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center tabular-nums text-gray-400">
                            {threshold ? `${threshold}d` : '—'}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded ${
                              exceeds
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
                            }`}>
                              {exceeds ? 'Slow' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {forecast && (
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Schedule Risk
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Predicted completion vs committed due date · {forecast.totalForecasted} orders forecasted
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
                  <span className="font-semibold text-red-600 dark:text-red-400">{forecast.late}</span> Late
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                  <span className="font-semibold text-amber-600 dark:text-amber-400">{forecast.atRisk}</span> At Risk
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span className="font-semibold text-green-600 dark:text-green-400">{forecast.onTrack}</span> On Track
                </span>
              </div>
            </div>
            {(forecast.late > 0 || forecast.atRisk > 0) && (
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/50 z-10">
                    <tr className="border-b border-gray-100 dark:border-gray-800">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Order
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Customer
                      </th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Department
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Due Date
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Projected
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Remaining
                      </th>
                      <th className="px-5 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        Risk
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.orders
                      .filter((o) => o.riskStatus !== 'ON_TRACK')
                      .sort((a, b) => {
                        const priority = { LATE: 0, AT_RISK: 1, ON_TRACK: 2 };
                        return (priority[a.riskStatus] - priority[b.riskStatus]) || b.remainingDays - a.remainingDays;
                      })
                      .slice(0, 50)
                      .map((order) => (
                        <tr
                          key={order.orderId}
                          className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${
                            order.riskStatus === 'LATE'
                              ? 'bg-red-50 dark:bg-red-950/20'
                              : 'bg-amber-50 dark:bg-amber-950/10'
                          }`}
                        >
                          <td className="px-5 py-3">
                            <span className="font-medium text-gray-800 dark:text-gray-200 font-mono text-xs">
                              {order.orderNumber}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-600 dark:text-gray-400 truncate max-w-[160px]">
                            {order.customerName}
                          </td>
                          <td className="px-5 py-3 text-gray-700 dark:text-gray-300 text-xs">
                            {order.currentDepartment}
                          </td>
                          <td className="px-5 py-3 text-center text-xs text-gray-500">
                            {order.dueDate
                              ? new Date(order.dueDate).toLocaleDateString()
                              : '—'}
                          </td>
                          <td className="px-5 py-3 text-center text-xs">
                            <span className={order.riskStatus === 'LATE' ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                              {new Date(order.projectedCompletion).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center tabular-nums text-xs">
                            <span className="font-semibold text-gray-600 dark:text-gray-400">
                              {order.remainingDays}d
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded ${
                              order.riskStatus === 'LATE'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                            }`}>
                              {order.riskStatus === 'LATE' ? 'Late' : 'At Risk'}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {forecast.late === 0 && forecast.atRisk === 0 && (
              <div className="px-5 py-8 text-center text-sm text-green-600 dark:text-green-400">
                All forecasted orders are currently on track.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

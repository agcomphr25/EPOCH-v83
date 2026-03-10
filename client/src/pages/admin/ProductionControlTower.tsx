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

  const { data, isLoading, error, isFetching } = useQuery<HeatmapData>({
    queryKey: ['/api/admin/production-heatmap', runKey],
    queryFn: () => apiRequest('/api/admin/production-heatmap'),
    retry: false,
    staleTime: 30000,
  });

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
                Queue Integrity
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

        {error && (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <XCircle className="h-4 w-4" />
              Failed to load data
            </div>
            {String(error)}
          </div>
        )}

        {data && (
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
                        {data.totalActive}
                      </p>
                      <p className="text-xs text-gray-500">Active Orders</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${data.pipelineErrors > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <GitBranch className={`h-5 w-5 ${data.pipelineErrors > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.pipelineErrors}
                      </p>
                      <p className="text-xs text-gray-500">Pipeline Errors</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${data.queueErrors > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <ShieldCheck className={`h-5 w-5 ${data.queueErrors > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.queueErrors}
                      </p>
                      <p className="text-xs text-gray-500">Queue Errors</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5 pb-4 px-5">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${data.stalledOrders > 0 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <Clock className={`h-5 w-5 ${data.stalledOrders > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                        {data.stalledOrders}
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
                    Production Heatmap
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Department load and throughput · Red = bottleneck (exceeds 2x standard time) · Orange = slow (exceeds standard)
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(data.generatedAt).toLocaleString()}
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
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
                  {data.departments.map((dept) => {
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
                  {data.departments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-gray-400 text-sm">
                        No active orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-dashed border-gray-300 dark:border-gray-700">
                <CardContent className="py-8 flex flex-col items-center gap-2 text-gray-400">
                  <Activity className="h-6 w-6" />
                  <p className="text-sm font-medium">Department Throughput</p>
                  <p className="text-xs">Coming soon</p>
                </CardContent>
              </Card>
              <Card className="border-dashed border-gray-300 dark:border-gray-700">
                <CardContent className="py-8 flex flex-col items-center gap-2 text-gray-400">
                  <ArrowRight className="h-6 w-6" />
                  <p className="text-sm font-medium">Daily Completions</p>
                  <p className="text-xs">Coming soon</p>
                </CardContent>
              </Card>
              <Card className="border-dashed border-gray-300 dark:border-gray-700">
                <CardContent className="py-8 flex flex-col items-center gap-2 text-gray-400">
                  <AlertTriangle className="h-6 w-6" />
                  <p className="text-sm font-medium">WIP Trend</p>
                  <p className="text-xs">Coming soon</p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

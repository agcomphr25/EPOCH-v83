import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DeptResult {
  department: string;
  expectedCount: number;
  actualCount: number;
  missingOrders: string[];
  unexpectedOrders: string[];
  ok: boolean;
}

interface IntegrityData {
  generatedAt: string;
  summary: {
    departmentsChecked: number;
    departmentsWithMismatches: number;
    invalidDepartmentCount: number;
    orphanedOrderCount: number;
  };
  departments: DeptResult[];
  invalidDepartments: { orderId: string; invalidDepartment: string }[];
  orphanedOrders: { orderId: string; status: string; createdAt: string }[];
}

function DeptRow({ dept }: { dept: DeptResult }) {
  const [open, setOpen] = useState(false);
  const hasMismatch = !dept.ok;
  const delta = dept.actualCount - dept.expectedCount;
  const deltaStr = delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`;

  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer select-none transition-colors ${
          hasMismatch
            ? 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30'
            : 'hover:bg-gray-50 dark:hover:bg-gray-900'
        }`}
        onClick={() => hasMismatch && setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasMismatch ? (
              open ? (
                <ChevronDown className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
              )
            ) : (
              <span className="w-3.5" />
            )}
            <span className="font-medium text-sm text-gray-800 dark:text-gray-200">
              {dept.department}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-center tabular-nums text-sm text-gray-700 dark:text-gray-300">
          {dept.expectedCount}
        </td>
        <td className="px-4 py-3 text-center tabular-nums text-sm text-gray-700 dark:text-gray-300">
          {dept.actualCount}
        </td>
        <td className="px-4 py-3 text-center tabular-nums text-sm">
          {hasMismatch ? (
            <span className="font-semibold text-red-600 dark:text-red-400">{deltaStr}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          {hasMismatch ? (
            <div className="flex items-center justify-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">MISMATCH</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-xs font-semibold text-green-600 dark:text-green-400">OK</span>
            </div>
          )}
        </td>
      </tr>

      {open && hasMismatch && (
        <tr className="bg-red-50/50 dark:bg-red-950/10 border-b border-red-100 dark:border-red-900/40">
          <td colSpan={5} className="px-8 py-3">
            <div className="grid grid-cols-2 gap-4">
              {dept.missingOrders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5 uppercase tracking-wide">
                    Missing from actual queue ({dept.missingOrders.length})
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Expected by domain rules but not returned by the queue.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dept.missingOrders.map((id) => (
                      <span
                        key={id}
                        className="font-mono text-xs bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 rounded px-2 py-0.5"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {dept.unexpectedOrders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1.5 uppercase tracking-wide">
                    Unexpected in actual queue ({dept.unexpectedOrders.length})
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Returned by the queue but not expected by domain rules (e.g. FULFILLED status).
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dept.unexpectedOrders.map((id) => (
                      <span
                        key={id}
                        className="font-mono text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300 rounded px-2 py-0.5"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function QueueIntegrityMonitor() {
  const [runKey, setRunKey] = useState(0);

  const { data, isLoading, error, isFetching } = useQuery<IntegrityData>({
    queryKey: ['/api/admin/queue-integrity', runKey],
    queryFn: () => apiRequest('/api/admin/queue-integrity'),
    retry: false,
    staleTime: 0,
  });

  const summary = data?.summary;
  const allOk =
    summary &&
    summary.departmentsWithMismatches === 0 &&
    summary.invalidDepartmentCount === 0 &&
    summary.orphanedOrderCount === 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
              Queue Integrity Monitor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Detects mismatches between expected queue membership and actual queue results.
              Read-only — does not modify production data.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRunKey((k) => k + 1)}
            disabled={isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Re-run Check
          </Button>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running integrity checks across all departments…
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <XCircle className="h-4 w-4" />
              Check failed
            </div>
            {String(error)}
          </div>
        )}

        {data && (
          <>
            {/* Summary banner */}
            <div
              className={`rounded-lg border px-5 py-4 flex items-center gap-4 ${
                allOk
                  ? 'border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                  : 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800'
              }`}
            >
              {allOk ? (
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p
                  className={`font-semibold text-sm ${
                    allOk
                      ? 'text-green-800 dark:text-green-300'
                      : 'text-red-800 dark:text-red-300'
                  }`}
                >
                  {allOk
                    ? 'All queues are consistent — no mismatches detected.'
                    : `${summary!.departmentsWithMismatches} department${
                        summary!.departmentsWithMismatches !== 1 ? 's' : ''
                      } with mismatches`}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Generated {new Date(data.generatedAt).toLocaleString()} ·{' '}
                  {summary!.departmentsChecked} departments checked ·{' '}
                  {summary!.invalidDepartmentCount} invalid dept
                  {summary!.invalidDepartmentCount !== 1 ? 's' : ''} ·{' '}
                  {summary!.orphanedOrderCount} orphaned order
                  {summary!.orphanedOrderCount !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Department table */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Department Queue Comparison
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Expected = domain rules · Actual = what the queue API returns (all_orders + production_orders)
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Department
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Expected
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Actual
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Delta
                    </th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.departments.map((dept) => (
                    <DeptRow key={dept.department} dept={dept} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Invalid departments */}
            {data.invalidDepartments.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-orange-200 dark:border-orange-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-orange-100 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <h2 className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                    Invalid Departments ({data.invalidDepartments.length})
                  </h2>
                </div>
                <p className="px-4 pt-3 pb-1 text-xs text-gray-500">
                  Active orders whose <code className="font-mono">current_department</code> is not
                  in the known department list.
                </p>
                <div className="px-4 pb-4 pt-2">
                  <div className="space-y-1">
                    {data.invalidDepartments.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0"
                      >
                        <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 rounded px-2 py-0.5 text-gray-700 dark:text-gray-300">
                          {r.orderId}
                        </span>
                        <span className="text-gray-400">→</span>
                        <Badge variant="outline" className="text-orange-700 border-orange-300 text-xs">
                          {r.invalidDepartment}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Orphaned orders */}
            {data.orphanedOrders.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-yellow-200 dark:border-yellow-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-yellow-100 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <h2 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                    Orphaned Orders ({data.orphanedOrders.length})
                  </h2>
                </div>
                <p className="px-4 pt-3 pb-1 text-xs text-gray-500">
                  Active orders with no <code className="font-mono">current_department</code> set —
                  they are invisible to all department queues.
                </p>
                <div className="px-4 pb-4 pt-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left py-1.5 text-gray-400 font-semibold uppercase tracking-wide">
                          Order ID
                        </th>
                        <th className="text-left py-1.5 text-gray-400 font-semibold uppercase tracking-wide">
                          Status
                        </th>
                        <th className="text-left py-1.5 text-gray-400 font-semibold uppercase tracking-wide">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orphanedOrders.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-50 dark:border-gray-800 last:border-0"
                        >
                          <td className="py-1.5 font-mono text-gray-700 dark:text-gray-300">
                            {r.orderId}
                          </td>
                          <td className="py-1.5">
                            <Badge variant="outline" className="text-xs">
                              {r.status}
                            </Badge>
                          </td>
                          <td className="py-1.5 text-gray-400">
                            {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* All clear for invalid/orphan sections */}
            {data.invalidDepartments.length === 0 && data.orphanedOrders.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 px-1">
                <CheckCircle className="h-4 w-4" />
                No invalid departments or orphaned orders detected.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

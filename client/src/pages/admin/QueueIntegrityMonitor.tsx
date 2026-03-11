import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
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
  Info,
  GitBranch,
  Factory,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface DeptResult {
  department: string;
  expectedCount: number;
  actualCount: number;
  delta: number;
  severity: 'CRITICAL' | 'WARNING' | 'OK';
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

interface PipelineError {
  orderId: string;
  orderNumber: string;
  derivedStage: string;
  currentDepartment: string;
  errorType: 'PIPELINE_DRIFT' | 'STAGE_REGRESSION' | 'SKIPPED_STAGE' | 'STALLED_ORDER';
}

interface PipelineValidationData {
  totalOrdersChecked: number;
  generatedAt: string;
  errors: PipelineError[];
  summary: {
    pipelineDrift: number;
    stageRegression: number;
    skippedStages: number;
    stalledOrders: number;
  };
}

const SEVERITY_CONFIG = {
  CRITICAL: {
    row: 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    icon: XCircle,
    iconClass: 'text-red-500',
    chevron: 'text-red-500',
  },
  WARNING: {
    row: 'bg-orange-50 dark:bg-orange-950/20 hover:bg-orange-100 dark:hover:bg-orange-950/30',
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    icon: AlertTriangle,
    iconClass: 'text-orange-500',
    chevron: 'text-orange-500',
  },
  OK: {
    row: 'hover:bg-gray-50 dark:hover:bg-gray-900',
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    icon: CheckCircle,
    iconClass: 'text-green-500',
    chevron: 'text-transparent',
  },
} as const;

function OrderIdLink({ id, dept }: { id: string; dept?: string }) {
  const href = dept
    ? `/admin/domain-truth?orderId=${encodeURIComponent(id)}&queue=${encodeURIComponent(dept)}`
    : `/admin/domain-truth?orderId=${encodeURIComponent(id)}`;
  return (
    <Link href={href}>
      <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 rounded px-2 py-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 cursor-pointer transition-colors underline underline-offset-2">
        {id}
      </span>
    </Link>
  );
}

function DeptRow({ dept }: { dept: DeptResult }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[dept.severity];
  const Icon = cfg.icon;
  const hasMismatch = !dept.ok;
  const deltaStr = dept.delta === 0 ? '±0' : dept.delta > 0 ? `+${dept.delta}` : `${dept.delta}`;

  return (
    <>
      <tr
        className={`border-b border-gray-100 dark:border-gray-800 transition-colors ${cfg.row} ${hasMismatch ? 'cursor-pointer select-none' : ''}`}
        onClick={() => hasMismatch && setOpen((o) => !o)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasMismatch ? (
              open ? (
                <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 ${cfg.chevron}`} />
              ) : (
                <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${cfg.chevron}`} />
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
            <span
              className={`font-semibold ${
                dept.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'
              }`}
            >
              {deltaStr}
            </span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${cfg.badge}`}>
            <Icon className={`h-3 w-3 ${cfg.iconClass}`} />
            {dept.severity}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          {dept.ok ? (
            <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 mx-auto" />
          )}
        </td>
      </tr>

      {open && hasMismatch && (
        <tr
          className={`border-b border-gray-100 dark:border-gray-800 ${
            dept.severity === 'CRITICAL'
              ? 'bg-red-50/50 dark:bg-red-950/10'
              : 'bg-orange-50/50 dark:bg-orange-950/10'
          }`}
        >
          <td colSpan={6} className="px-8 py-3">
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
                      <OrderIdLink key={id} id={id} dept={dept.department} />
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
                    Returned by the queue but not expected (e.g. FULFILLED or cancelled orders).
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dept.unexpectedOrders.map((id) => (
                      <OrderIdLink key={id} id={id} dept={dept.department} />
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

const ERROR_TYPE_CONFIG: Record<string, { label: string; color: string; badgeClass: string }> = {
  PIPELINE_DRIFT: {
    label: 'Pipeline Drift',
    color: 'text-orange-600 dark:text-orange-400',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  },
  STAGE_REGRESSION: {
    label: 'Stage Regression',
    color: 'text-red-600 dark:text-red-400',
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  },
  SKIPPED_STAGE: {
    label: 'Skipped Stage',
    color: 'text-yellow-600 dark:text-yellow-400',
    badgeClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
  },
  STALLED_ORDER: {
    label: 'Stalled Order',
    color: 'text-purple-600 dark:text-purple-400',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300',
  },
};

function PipelineValidationTab() {
  const [runKey, setRunKey] = useState(0);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(['SKIPPED_STAGE']));

  const toggleErrorType = (type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const { data, isLoading, error, isFetching } = useQuery<PipelineValidationData>({
    queryKey: ['/api/admin/pipeline-validation', runKey],
    queryFn: () => apiRequest('/api/admin/pipeline-validation'),
    retry: false,
    staleTime: 0,
  });

  const filteredErrors = data?.errors.filter((err) => !hiddenTypes.has(err.errorType)) ?? [];
  const totalErrors = data?.errors.length ?? 0;
  const visibleErrors = filteredErrors.length;
  const allOk = data && totalErrors === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">
            Compares derived pipeline stage (from timestamps) against current_department assignments.
            Detects drift, regression, and skipped stages.
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

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running pipeline validation…
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <div className="flex items-center gap-2 font-semibold mb-1">
            <XCircle className="h-4 w-4" />
            Validation failed
          </div>
          {String(error)}
        </div>
      )}

      {data && (
        <>
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
              <AlertTriangle className="h-6 w-6 text-orange-500 flex-shrink-0" />
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
                  ? 'All pipeline stages are consistent — no issues detected.'
                  : `${totalErrors} pipeline issue${totalErrors !== 1 ? 's' : ''} detected`}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Generated {new Date(data.generatedAt).toLocaleString()} ·{' '}
                {data.totalOrdersChecked} orders checked ·{' '}
                {data.summary.pipelineDrift} drift ·{' '}
                {data.summary.stageRegression} regression ·{' '}
                {data.summary.skippedStages} skipped
              </p>
            </div>
          </div>

          {totalErrors > 0 && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide mr-1">Filter:</span>
                {Object.entries(ERROR_TYPE_CONFIG).map(([type, cfg]) => {
                  const count = data.errors.filter((e) => e.errorType === type).length;
                  if (count === 0) return null;
                  const isVisible = !hiddenTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleErrorType(type)}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                        isVisible
                          ? `${cfg.badgeClass} border-transparent`
                          : 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700 line-through'
                      }`}
                    >
                      {cfg.label} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Pipeline Errors ({visibleErrors}{visibleErrors !== totalErrors ? ` of ${totalErrors}` : ''})
                  </h2>
                </div>
                {visibleErrors === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    All errors are filtered out. Adjust the filters above to see results.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Order
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Derived Stage
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Current Department
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Error Type
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredErrors.map((err, i) => {
                        const cfg = ERROR_TYPE_CONFIG[err.errorType] || ERROR_TYPE_CONFIG.PIPELINE_DRIFT;
                        return (
                          <tr
                            key={i}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                          >
                            <td className="px-4 py-2.5">
                              <OrderIdLink id={err.orderId} />
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                              {err.derivedStage}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                              {err.currentDepartment}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded ${cfg.badgeClass}`}>
                                {cfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {allOk && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 px-1">
              <CheckCircle className="h-4 w-4" />
              No pipeline issues detected. All orders are in the correct stage.
            </div>
          )}
        </>
      )}
    </div>
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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-indigo-600" />
              System Integrity Monitor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Queue integrity and pipeline validation diagnostics.
            </p>
          </div>
          <Link href="/admin/control-tower">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <Factory className="h-3.5 w-3.5" />
              Control Tower
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="integrity">
          <TabsList className="mb-4">
            <TabsTrigger value="integrity" className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Queue Integrity
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Pipeline Validation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="integrity">
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <p className="text-sm text-gray-500">
                  Detects mismatches between expected queue membership and actual queue results.
                  Read-only — does not modify production data.
                </p>
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

              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-8 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running integrity checks across all departments…
                </div>
              )}

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

                  <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Department Queue Comparison
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Expected = domain rules · Actual = what the queue API returns · Click a mismatch row to expand order IDs
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
                            Severity
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

                  {data.invalidDepartments.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-orange-200 dark:border-orange-800 overflow-hidden">
                      <div className="px-4 py-3 border-b border-orange-100 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        <h2 className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                          Invalid Departments — INFO ({data.invalidDepartments.length})
                        </h2>
                      </div>
                      <p className="px-4 pt-3 pb-1 text-xs text-gray-500">
                        Active orders whose <code className="font-mono">current_department</code> is not in the known department list.
                      </p>
                      <div className="px-4 pb-4 pt-2">
                        <div className="space-y-1">
                          {data.invalidDepartments.map((r, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0"
                            >
                              <OrderIdLink id={r.orderId} />
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

                  {data.orphanedOrders.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-red-200 dark:border-red-800 overflow-hidden">
                      <div className="px-4 py-3 border-b border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-950/20 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <h2 className="text-sm font-semibold text-red-800 dark:text-red-300">
                          Orphaned Orders — CRITICAL ({data.orphanedOrders.length})
                        </h2>
                      </div>
                      <p className="px-4 pt-3 pb-1 text-xs text-gray-500">
                        Active orders with no <code className="font-mono">current_department</code> — invisible to all department queues.
                      </p>
                      <div className="px-4 pb-4 pt-2">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                              <th className="text-left py-1.5 text-gray-400 font-semibold uppercase tracking-wide">Order ID</th>
                              <th className="text-left py-1.5 text-gray-400 font-semibold uppercase tracking-wide">Status</th>
                              <th className="text-left py-1.5 text-gray-400 font-semibold uppercase tracking-wide">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.orphanedOrders.map((r, i) => (
                              <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                                <td className="py-1.5">
                                  <OrderIdLink id={r.orderId} />
                                </td>
                                <td className="py-1.5">
                                  <Badge variant="outline" className="text-xs">{r.status}</Badge>
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

                  {data.invalidDepartments.length === 0 && data.orphanedOrders.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 px-1">
                      <CheckCircle className="h-4 w-4" />
                      No invalid departments or orphaned orders detected.
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pipeline">
            <PipelineValidationTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

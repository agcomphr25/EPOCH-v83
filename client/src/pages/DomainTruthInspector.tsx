import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Database,
  GitBranch,
  Shield,
  Clock,
  FileText,
  CreditCard,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'wouter';

const DEPARTMENT_FLOW = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
];

function SectionCard({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="border border-gray-200 dark:border-gray-700">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none flex flex-row items-center gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon className="h-4 w-4 text-gray-500" />
        <CardTitle className="text-sm font-semibold flex-1">{title}</CardTitle>
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
      </CardHeader>
      {open && <CardContent className="px-4 pb-4">{children}</CardContent>}
    </Card>
  );
}

function FieldRow({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) {
  const display =
    value === null || value === undefined
      ? <span className="text-gray-400 italic">null</span>
      : typeof value === 'boolean'
      ? <Badge variant={value ? 'default' : 'outline'}>{String(value)}</Badge>
      : typeof value === 'object'
      ? <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-auto max-h-40 whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
      : <span className={mono ? 'font-mono text-xs' : 'text-sm'}>{String(value)}</span>;

  return (
    <div className="flex gap-2 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="w-44 flex-shrink-0 text-xs text-gray-500 font-medium pt-0.5">{label}</span>
      <div className="flex-1 min-w-0 break-words">{display}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    FINALIZED: 'bg-blue-100 text-blue-800',
    FULFILLED: 'bg-green-100 text-green-800',
    SCRAPPED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-600',
    PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function WarningSeverityBadge({ severity }: { severity: string }) {
  if (severity === 'warning') return <Badge className="bg-yellow-100 text-yellow-800 text-xs">warning</Badge>;
  if (severity === 'error') return <Badge className="bg-red-100 text-red-800 text-xs">error</Badge>;
  return <Badge variant="outline" className="text-xs">info</Badge>;
}

export default function DomainTruthInspector() {
  const [inputId, setInputId] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/domain-truth/order', activeId],
    queryFn: () => apiRequest(`/api/admin/domain-truth/order/${activeId}`),
    enabled: !!activeId,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputId.trim();
    if (trimmed) setActiveId(trimmed);
  };

  const order = data?.order;
  const warnings = data?.systemWarnings ?? [];
  const routingFlags = data?.routingFlags ?? [];
  const queueEval = data?.queueEvaluation;
  const departmentTransitions: any[] = data?.departmentTransitions ?? [];
  const auditEvents: any[] = data?.auditEvents ?? [];
  const adminAuditLog: any[] = data?.adminAuditLog ?? [];
  const kickbacks: any[] = data?.kickbacks ?? [];
  const payments: any[] = data?.payments ?? [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Database className="h-6 w-6 text-indigo-600" />
              Domain Truth Inspector
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Read-only diagnostic tool. Inspect the true system state of any order.
            </p>
          </div>
          <Link href="/admin/orders">
            <Button variant="outline" size="sm">← Admin Panel</Button>
          </Link>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
            placeholder="Enter Order ID (e.g. FA001234)"
            className="max-w-sm font-mono"
          />
          <Button type="submit" disabled={!inputId.trim()}>
            <Search className="h-4 w-4 mr-2" />
            Inspect
          </Button>
        </form>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading system state for <span className="font-mono font-semibold">{activeId}</span>…
          </div>
        )}

        {/* Not found / error */}
        {error && !isLoading && (
          <Card className="border-red-200">
            <CardContent className="py-4 flex items-center gap-2 text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">Failed to load inspector data. The order may not exist or the server returned an error.</span>
            </CardContent>
          </Card>
        )}

        {data && !isLoading && (
          <div className="space-y-4">

            {/* ─── System Warnings ─── */}
            {warnings.length > 0 && (
              <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
                <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <CardTitle className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
                    System Warnings ({warnings.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {warnings.map((w: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono text-xs text-yellow-700 dark:text-yellow-400 font-semibold mr-2">
                          {w.code}
                        </span>
                        <span className="text-yellow-900 dark:text-yellow-200">{w.message}</span>
                        {w.fields && (
                          <div className="flex gap-1 mt-0.5">
                            {w.fields.map((f: string) => (
                              <span key={f} className="text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded px-1">
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ─── 1. Core State ─── */}
            {order && (
              <SectionCard title="1 — Core State" icon={Database}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <div>
                    <FieldRow label="order_id" value={order.order_id} mono />
                    <FieldRow label="status" value={<StatusBadge status={order.status} />} />
                    <FieldRow label="current_department" value={order.current_department} />
                    <FieldRow label="current_department_id" value={order.current_department_id} />
                    <FieldRow label="scrap_date" value={order.scrap_date} mono />
                    <FieldRow label="is_cancelled" value={order.is_cancelled} />
                    <FieldRow label="is_flattop" value={order.is_flattop} />
                    <FieldRow label="is_paid" value={order.is_paid} />
                    <FieldRow label="is_replacement" value={order.is_replacement} />
                    <FieldRow label="order_source" value={order.order_source} />
                  </div>
                  <div>
                    <FieldRow label="customer_id" value={order.customer_id} mono />
                    <FieldRow label="customer_name" value={order.customer_name} />
                    <FieldRow label="model_id" value={order.model_id} />
                    <FieldRow label="urgency" value={order.urgency} />
                    <FieldRow label="priority_score" value={order.priority_score} />
                    <FieldRow label="due_date" value={order.due_date} mono />
                    <FieldRow label="shipped_date" value={order.shipped_date} mono />
                    <FieldRow label="created_at" value={order.created_at} mono />
                    <FieldRow label="updated_at" value={order.updated_at} mono />
                  </div>
                </div>
                {order.features && (
                  <div className="mt-3">
                    <FieldRow label="features" value={order.features} />
                  </div>
                )}
                {/* Legacy / production order presence */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant={data.legacyOrder ? 'default' : 'outline'} className="text-xs">
                    {data.legacyOrder ? '✓ in orders (legacy)' : '✗ not in orders (legacy)'}
                  </Badge>
                  <Badge variant={data.productionOrder ? 'default' : 'outline'} className="text-xs">
                    {data.productionOrder ? '✓ in production_orders' : '✗ not in production_orders'}
                  </Badge>
                  {data.legacyOrder && (
                    <span className="text-xs text-gray-500">
                      legacy dept: <span className="font-mono">{data.legacyOrder.current_department ?? 'null'}</span>
                    </span>
                  )}
                </div>
              </SectionCard>
            )}

            {!order && data && (
              <Card className="border-gray-200">
                <CardContent className="py-6 text-center text-gray-400">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No order found in <span className="font-mono">all_orders</span> with ID <span className="font-mono font-semibold">{activeId}</span></p>
                  {data.productionOrder && (
                    <p className="text-xs text-yellow-600 mt-2">
                      ⚠ A record was found in <span className="font-mono">production_orders</span> — this is a P1 PO item only.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ─── 2. Queue Eligibility ─── */}
            {queueEval && (
              <SectionCard title="2 — Queue Eligibility" icon={Shield}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm text-gray-500">Assigned queue:</span>
                  <span className="font-semibold font-mono text-sm">{queueEval.department}</span>
                  {queueEval.visible ? (
                    <Badge className="bg-green-100 text-green-800">Visible in queue</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-800">Not visible in any queue</Badge>
                  )}
                </div>

                {/* Department pipeline visualization */}
                <div className="mb-4 overflow-x-auto">
                  <div className="flex items-center gap-0 min-w-max">
                    {DEPARTMENT_FLOW.map((dept, i) => {
                      const isCurrent = dept === queueEval.department;
                      return (
                        <div key={dept} className="flex items-center">
                          <div
                            className={`px-2 py-1 rounded text-xs whitespace-nowrap font-medium ${
                              isCurrent
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {dept}
                          </div>
                          {i < DEPARTMENT_FLOW.length - 1 && (
                            <span className="text-gray-300 dark:text-gray-600 text-xs mx-0.5">›</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  {queueEval.checks.map((check: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm py-0.5">
                      {check.result ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      <span className={`w-44 flex-shrink-0 font-medium ${check.result ? 'text-green-700' : 'text-red-700'}`}>
                        {check.rule}
                      </span>
                      <span className="text-gray-500 text-xs">{check.detail}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ─── 3. Routing Flags ─── */}
            <SectionCard title="3 — Routing Flags" icon={GitBranch} defaultOpen={routingFlags.length > 0}>
              {routingFlags.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No routing flags detected.</p>
              ) : (
                <div className="space-y-2">
                  {routingFlags.map((flag: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded bg-gray-50 dark:bg-gray-900">
                      <WarningSeverityBadge severity={flag.severity} />
                      <div>
                        <span className="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 mr-2">
                          {flag.flag}
                        </span>
                        {flag.value && (
                          <span className="text-xs text-gray-500 mr-2">(value: {flag.value})</span>
                        )}
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{flag.effect}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ─── 4. Department History ─── */}
            <SectionCard title="4 — Department History (embedded JSONB)" icon={Clock}>
              {(() => {
                const history = order?.department_history;
                const arr = Array.isArray(history)
                  ? history
                  : typeof history === 'string'
                  ? (() => { try { return JSON.parse(history); } catch { return []; } })()
                  : [];
                if (arr.length === 0) return <p className="text-sm text-gray-400 italic">No department history recorded.</p>;
                return (
                  <div className="space-y-1">
                    {[...arr].reverse().map((h: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="text-gray-400 w-6 text-right flex-shrink-0">{arr.length - i}</span>
                        <span className="font-mono text-gray-600 dark:text-gray-400 w-36 flex-shrink-0">
                          {h.fromDepartment ?? '—'}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 w-36 flex-shrink-0">
                          {h.toDepartment ?? '—'}
                        </span>
                        <span className="text-gray-400 flex-1">
                          {h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}
                        </span>
                        {h.movedBy && <span className="text-gray-500">{h.movedBy}</span>}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {departmentTransitions.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 mb-2">From order_department_transitions table</p>
                  <div className="space-y-1">
                    {departmentTransitions.map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="font-mono text-indigo-600 dark:text-indigo-400 w-36 flex-shrink-0">{t.department}</span>
                        <span className="text-gray-400">entered: {new Date(t.entered_at).toLocaleString()}</span>
                        {t.exited_at && <span className="text-gray-400">→ exited: {new Date(t.exited_at).toLocaleString()}</span>}
                        {t.duration_minutes != null && <span className="text-gray-500">{t.duration_minutes}m</span>}
                        {t.exit_reason && <Badge variant="outline" className="text-xs">{t.exit_reason}</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ─── 5. Event History ─── */}
            <SectionCard title="5 — Event History" icon={FileText} defaultOpen={auditEvents.length > 0 || adminAuditLog.length > 0}>
              {auditEvents.length === 0 && adminAuditLog.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No audit events recorded for this order.</p>
              ) : (
                <div className="space-y-4">
                  {auditEvents.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">audit_events ({auditEvents.length})</p>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {auditEvents.map((e: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                            <span className="text-gray-400 w-36 flex-shrink-0">
                              {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                            </span>
                            <Badge variant="outline" className="text-xs flex-shrink-0">{e.action}</Badge>
                            <span className="text-gray-500 flex-shrink-0">{e.actor_name}</span>
                            {e.reason && <span className="text-gray-400">{e.reason}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {adminAuditLog.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-2">admin_audit_log ({adminAuditLog.length})</p>
                      <div className="space-y-1 max-h-64 overflow-y-auto">
                        {adminAuditLog.map((e: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                            <span className="text-gray-400 w-36 flex-shrink-0 flex-shrink-0">
                              {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                            </span>
                            <span className="font-mono text-gray-700 dark:text-gray-300 w-32 flex-shrink-0">{e.field_name}</span>
                            <span className="text-red-500 line-through flex-shrink-0">{JSON.stringify(e.old_value)}</span>
                            <span className="text-gray-400 flex-shrink-0">→</span>
                            <span className="text-green-600 flex-shrink-0">{JSON.stringify(e.new_value)}</span>
                            <span className="text-gray-400 ml-auto flex-shrink-0">{e.changed_by} ({e.change_type})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* ─── 6. Dependencies ─── */}
            <SectionCard title="6 — Dependencies" icon={Info} defaultOpen={kickbacks.length > 0 || payments.length > 0}>
              <div className="space-y-4">
                {/* Payments */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Payments ({payments.length})
                  </p>
                  {payments.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No payments.</p>
                  ) : (
                    payments.map((p: any, i: number) => (
                      <div key={i} className="flex gap-4 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <span className="text-gray-500">{p.payment_type}</span>
                        <span className="font-semibold">${Number(p.payment_amount || 0).toFixed(2)}</span>
                        <span className="text-gray-400">{p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '—'}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Kickbacks */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Kickbacks ({kickbacks.length})
                  </p>
                  {kickbacks.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No kickbacks.</p>
                  ) : (
                    kickbacks.map((k: any, i: number) => (
                      <div key={i} className="flex gap-3 text-xs py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0 flex-wrap">
                        <Badge
                          className={`text-xs flex-shrink-0 ${
                            k.status === 'OPEN' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {k.status}
                        </Badge>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{k.kickback_dept}</span>
                        <span className="text-gray-500">{k.reason_code}</span>
                        {k.reason_text && <span className="text-gray-400">{k.reason_text}</span>}
                        <span className="text-gray-400 ml-auto">{new Date(k.kickback_date).toLocaleDateString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </SectionCard>

            {/* ─── 7. System Warnings (detail) ─── */}
            <SectionCard title="7 — System Warnings Detail" icon={AlertTriangle} defaultOpen={warnings.length > 0}>
              {warnings.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  No system inconsistencies detected.
                </div>
              ) : (
                <div className="space-y-3">
                  {warnings.map((w: any, i: number) => (
                    <div key={i} className="p-3 rounded border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-yellow-700 dark:text-yellow-400">{w.code}</span>
                        {w.fields && w.fields.map((f: string) => (
                          <span key={f} className="text-xs bg-yellow-200 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-200 rounded px-1 font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-yellow-900 dark:text-yellow-200">{w.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

          </div>
        )}

        {/* Empty state */}
        {!activeId && (
          <div className="text-center py-16 text-gray-400">
            <Database className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Enter an Order ID above to inspect its system state.</p>
          </div>
        )}
      </div>
    </div>
  );
}

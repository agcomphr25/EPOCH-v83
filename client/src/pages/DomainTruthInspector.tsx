import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  Activity,
  Star,
  ArrowRight,
  PenLine,
  Scan,
  LogIn,
  LogOut,
  HelpCircle,
  Eye,
  ShieldAlert,
  BookOpen,
} from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

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

const DEPARTMENTS = [
  'Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Paint',
  'Shipping QC',
  'Shipping',
] as const;

const QUICK_BUTTONS = ['Finish', 'Paint', 'Shipping'] as const;

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

// ── StatusFieldRow — collapses raw value behind a toggle ─────────────────────

function StatusFieldRow({ rawValue }: { rawValue: any }) {
  const [rawOpen, setRawOpen] = useState(false);
  const rawStatus = extractStatus(rawValue);
  return (
    <div className="flex gap-2 py-1 border-b border-gray-100 dark:border-gray-800">
      <span className="w-44 flex-shrink-0 text-xs text-gray-500 font-medium pt-0.5">status</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={rawStatus} />
          <span className="text-sm text-gray-700 dark:text-gray-300">{formatStatus(rawStatus)}</span>
          <button
            onClick={() => setRawOpen((v) => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
          >
            {rawOpen ? 'hide raw' : 'Raw Status Value'}
          </button>
        </div>
        {rawOpen && (
          <pre className="mt-1 text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-auto max-h-24 whitespace-pre-wrap">
            {typeof rawValue === 'object' ? JSON.stringify(rawValue, null, 2) : String(rawValue ?? 'null')}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Status helpers ────────────────────────────────────────────────────────────

function extractStatus(raw: any): string {
  if (!raw) return 'UNKNOWN';
  if (typeof raw === 'string') return raw;
  if (raw?.props?.status) return raw.props.status;
  if (raw?.status) return raw.status;
  return 'UNKNOWN';
}

function formatStatus(status: string): string {
  if (!status) return 'Unknown';
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

// ── Order type ────────────────────────────────────────────────────────────────

function getOrderType(order: any): string {
  if (!order) return 'Unknown';
  if (order.model_id === 'no_stock') return 'Accessory';
  if (order.is_replacement === true) return 'Replacement';
  return 'Stock';
}

// ── Flight recorder label ─────────────────────────────────────────────────────

function getFlightEventLabel(evt: any): string {
  if (evt.type === 'STATUS_CHANGE') {
    const match = (evt.description ?? '').match(/→\s*(.+)$/);
    const target = match ? match[1].trim() : '';
    return target ? `Status changed → ${formatStatus(target)}` : 'Status Changed';
  }
  if (evt.type === 'DEPARTMENT_CHANGE') {
    const match = (evt.description ?? '').match(/→\s*(.+)$/);
    const target = match ? match[1].trim() : '';
    return target ? `Department moved → ${target}` : 'Dept Change';
  }
  return (FLIGHT_EVENT_CONFIG as any)[evt.type]?.label ?? FLIGHT_EVENT_CONFIG.DEFAULT.label;
}

const FLIGHT_EVENT_CONFIG = {
  ORDER_CREATED: {
    label: 'Created',
    icon: Star,
    dotBg: 'bg-green-100',
    dotIcon: 'text-green-600',
    badge: 'bg-green-100 text-green-800',
  },
  STATUS_CHANGE: {
    label: 'Status Changed',
    icon: Activity,
    dotBg: 'bg-sky-100',
    dotIcon: 'text-sky-600',
    badge: 'bg-sky-100 text-sky-800',
  },
  DEPARTMENT_CHANGE: {
    label: 'Dept Change',
    icon: ArrowRight,
    dotBg: 'bg-indigo-100',
    dotIcon: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-800',
  },
  FIELD_CHANGE: {
    label: 'Field Edit',
    icon: PenLine,
    dotBg: 'bg-blue-100',
    dotIcon: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-800',
  },
  AUDIT_EVENT: {
    label: 'Audit',
    icon: Shield,
    dotBg: 'bg-purple-100',
    dotIcon: 'text-purple-600',
    badge: 'bg-purple-100 text-purple-800',
  },
  BADGE_SCAN: {
    label: 'Badge Scan',
    icon: Scan,
    dotBg: 'bg-orange-100',
    dotIcon: 'text-orange-600',
    badge: 'bg-orange-100 text-orange-800',
  },
  DEPT_ENTERED: {
    label: 'Entered',
    icon: LogIn,
    dotBg: 'bg-teal-100',
    dotIcon: 'text-teal-600',
    badge: 'bg-teal-100 text-teal-800',
  },
  DEPT_EXITED: {
    label: 'Exited',
    icon: LogOut,
    dotBg: 'bg-gray-100',
    dotIcon: 'text-gray-500',
    badge: 'bg-gray-100 text-gray-600',
  },
  DEFAULT: {
    label: 'Event',
    icon: HelpCircle,
    dotBg: 'bg-gray-100',
    dotIcon: 'text-gray-400',
    badge: 'bg-gray-100 text-gray-600',
  },
};

// ── Timeline helpers ──────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  DEPARTMENT_CHANGE:  'bg-blue-500',
  STATUS_CHANGE:      'bg-cyan-500',
  DEPT_ENTERED:       'bg-green-500',
  ENTERED_DEPARTMENT: 'bg-green-500',
  DEPT_EXITED:        'bg-purple-500',
  EXITED_DEPARTMENT:  'bg-purple-500',
  BADGE_SCAN:         'bg-orange-500',
  AUDIT_EVENT:        'bg-gray-400',
  ORDER_CREATED:      'bg-green-600',
  FIELD_CHANGE:       'bg-blue-400',
};

const EVENT_ICONS: Record<string, any> = {
  DEPARTMENT_CHANGE:  GitBranch,
  STATUS_CHANGE:      Activity,
  DEPT_ENTERED:       LogIn,
  ENTERED_DEPARTMENT: LogIn,
  DEPT_EXITED:        LogOut,
  EXITED_DEPARTMENT:  LogOut,
  BADGE_SCAN:         Scan,
  AUDIT_EVENT:        Shield,
  ORDER_CREATED:      Star,
  FIELD_CHANGE:       PenLine,
};

function formatFlightTs(ts: Date): string {
  return ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return Math.round(diff);
}

function sameMinuteAndType(a: any, b: any): boolean {
  if (!a || !b || a.type !== b.type) return false;
  if (!a.timestamp || !b.timestamp) return false;
  const ma = new Date(a.timestamp);
  const mb = new Date(b.timestamp);
  return ma.getFullYear() === mb.getFullYear() &&
    ma.getMonth() === mb.getMonth() &&
    ma.getDate() === mb.getDate() &&
    ma.getHours() === mb.getHours() &&
    ma.getMinutes() === mb.getMinutes();
}

// ─── Schema Governance Panel ─────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === 'CRITICAL')
    return <Badge className="bg-red-100 text-red-800 text-xs font-bold">CRITICAL</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 text-xs">WARNING</Badge>;
}

interface DriftRecord {
  table: string;
  column: string;
  status: 'MISSING_IN_SCHEMA' | 'MISSING_IN_DB' | 'TYPE_MISMATCH';
  severity: 'CRITICAL' | 'WARNING';
  rowCount: number | null;
  dbType?: string;
  schemaType?: string;
  suggestion?: string;
}

interface SqlViolation {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

interface AuditEntry {
  id: number;
  timestamp: string;
  actor: string;
  action_type: string;
  table_name: string;
  column_name?: string;
  before_state?: unknown;
  after_state?: unknown;
  approved_by?: string;
  override_reason?: string;
}

interface GuardViolation {
  type: 'DROP_COLUMN' | 'DROP_TABLE' | 'TYPE_CHANGE';
  table: string;
  column?: string;
  rowCount: number;
  sql: string;
  blocked: boolean;
  reason: string;
  isShrink?: boolean;
}

interface OverrideFormState {
  tableName: string;
  columnName: string;
  actionType: string;
  overrideReason: string;
  sql: string;
}

function SchemaGovernancePanel({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [overrideForm, setOverrideForm] = useState<OverrideFormState | null>(null);

  const { data: driftData, isLoading: driftLoading } = useQuery<{
    drift: DriftRecord[];
    summary: { total: number; critical: number; warning: number };
  }>({
    queryKey: ['/api/governance/drift'],
    queryFn: () => apiRequest('/api/governance/drift'),
    retry: false,
  });

  const { data: violationsData, isLoading: violationsLoading } = useQuery<{
    violations: SqlViolation[];
    total: number;
  }>({
    queryKey: ['/api/governance/sql-violations'],
    queryFn: () => apiRequest('/api/governance/sql-violations'),
    retry: false,
  });

  const [auditOffset, setAuditOffset] = useState(0);
  const AUDIT_PAGE_SIZE = 50;

  const { data: auditData, isLoading: auditLoading } = useQuery<{
    entries: AuditEntry[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }>({
    queryKey: ['/api/governance/audit-log', auditOffset],
    queryFn: () => apiRequest(`/api/governance/audit-log?limit=${AUDIT_PAGE_SIZE}&offset=${auditOffset}`),
    retry: false,
  });

  const { data: guardData, isLoading: guardLoading } = useQuery<{
    violations: GuardViolation[];
    allowed: boolean;
    summary: string;
    blockedCount: number;
    total: number;
  }>({
    queryKey: ['/api/governance/migration-guard'],
    queryFn: () => apiRequest('/api/governance/migration-guard'),
    retry: false,
  });

  const overrideMutation = useMutation({
    mutationFn: (body: OverrideFormState) => apiRequest('/api/governance/override', { method: 'POST', body }),
    onSuccess: () => {
      toast({ title: 'Override logged', description: 'The schema override has been recorded in the audit log.' });
      setOverrideForm(null);
      setAuditOffset(0);
      queryClient.invalidateQueries({ queryKey: ['/api/governance/audit-log'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Override failed', description: err.message, variant: 'destructive' });
    },
  });

  const drift: DriftRecord[] = driftData?.drift ?? [];
  const critical = drift.filter(d => d.severity === 'CRITICAL');
  const warnings = drift.filter(d => d.severity === 'WARNING');
  const violations: SqlViolation[] = violationsData?.violations ?? [];
  const auditEntries: AuditEntry[] = auditData?.entries ?? [];
  const guardViolations: GuardViolation[] = guardData?.violations ?? [];
  const blockedGuard = guardViolations.filter(v => v.blocked);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Critical Drift', count: critical.length, color: critical.length > 0 ? 'text-red-700' : 'text-gray-500', bg: critical.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50' },
          { label: 'Warning Drift', count: warnings.length, color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
          { label: 'Blocked Migrations', count: blockedGuard.length, color: blockedGuard.length > 0 ? 'text-red-700' : 'text-gray-500', bg: blockedGuard.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50' },
          { label: 'Raw SQL Violations', count: violations.length, color: violations.length > 0 ? 'text-orange-700' : 'text-gray-500', bg: violations.length > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50' },
          { label: 'Audit Entries', count: auditEntries.length, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
        ].map(({ label, count, color, bg }) => (
          <div key={label} className={`rounded-lg border p-3 ${bg}`}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{count}</p>
          </div>
        ))}
      </div>

      {/* Drift Summary */}
      <SectionCard title="Schema Drift" icon={ShieldAlert} defaultOpen>
        {driftLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading drift report…</div>
        ) : drift.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle className="h-4 w-4" /> No drift detected between schema and live database.</div>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Table</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Column</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Severity</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Rows</th>
                    <th className="text-left py-1 text-gray-500 font-medium">Safe Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {drift.map((d, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-gray-800 dark:text-gray-200">{d.table}</td>
                      <td className="py-1.5 pr-3 font-mono text-gray-600 dark:text-gray-400">{d.column}</td>
                      <td className="py-1.5 pr-3">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-700 dark:text-gray-300">{d.status}</span>
                      </td>
                      <td className="py-1.5 pr-3"><SeverityBadge severity={d.severity} /></td>
                      <td className="py-1.5 pr-3 text-gray-500">{d.rowCount ?? '—'}</td>
                      <td className="py-1.5 text-gray-500 max-w-xs truncate" title={d.suggestion}>{d.suggestion ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Destructive Migration Warnings */}
      <SectionCard title="Destructive Migration Guard" icon={ShieldAlert} defaultOpen={blockedGuard.length > 0}>
        {guardLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Running migration guard…</div>
        ) : guardViolations.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle className="h-4 w-4" /> {guardData?.summary ?? 'No destructive operations detected in migration SQL.'}</div>
        ) : (
          <div className="space-y-2">
            <p className={`text-sm font-medium ${blockedGuard.length > 0 ? 'text-red-700' : 'text-yellow-700'}`}>
              {guardData?.summary}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Action</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Table</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Column</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Rows</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Status</th>
                    <th className="text-left py-1 text-gray-500 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {guardViolations.map((v, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{v.type}</td>
                      <td className="py-1.5 pr-3 font-mono text-gray-800 dark:text-gray-200">{v.table}</td>
                      <td className="py-1.5 pr-3 font-mono text-gray-500">{v.column ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{v.rowCount}</td>
                      <td className="py-1.5 pr-3">
                        {v.blocked
                          ? <Badge className="bg-red-100 text-red-800 text-xs font-bold">BLOCKED</Badge>
                          : <Badge className="bg-green-100 text-green-800 text-xs">ALLOWED</Badge>
                        }
                      </td>
                      <td className="py-1.5 text-gray-500 max-w-xs truncate" title={v.reason}>{v.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Raw SQL Violations */}
      <SectionCard title="Raw SQL Violations in Codebase" icon={AlertTriangle} defaultOpen={violations.length > 0}>
        {violationsLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Scanning files…</div>
        ) : violations.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-600"><CheckCircle className="h-4 w-4" /> No raw DDL SQL detected in server source files.</div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {violations.map((v, i) => (
              <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <AlertCircle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
                <span className="font-mono text-orange-700 dark:text-orange-400 flex-shrink-0 w-14">{v.pattern}</span>
                <span className="text-gray-500 flex-shrink-0">Line {v.line}</span>
                <span className="font-mono text-gray-400 truncate flex-1" title={v.file}>{v.file.replace(/.*\/server\//, 'server/')}</span>
                <span className="text-gray-600 dark:text-gray-300 font-mono text-xs truncate max-w-xs" title={v.snippet}>{v.snippet}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Audit Log */}
      <SectionCard title={`Schema Change Audit Log${auditData?.total ? ` (${auditData.total} total)` : ''}`} icon={BookOpen} defaultOpen>
        {auditLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…</div>
        ) : auditEntries.length === 0 ? (
          <p className="text-sm text-gray-400 italic">{(auditData as any)?.note ?? 'No schema change log entries yet.'}</p>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Time</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Actor</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Action</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Table</th>
                    <th className="text-left py-1 pr-3 text-gray-500 font-medium">Column</th>
                    <th className="text-left py-1 text-gray-500 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <td className="py-1.5 pr-3 text-gray-400 font-mono whitespace-nowrap">
                        {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{e.actor}</td>
                      <td className="py-1.5 pr-3">
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono">{e.action_type}</span>
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-gray-600 dark:text-gray-400">{e.table_name}</td>
                      <td className="py-1.5 pr-3 font-mono text-gray-500">{e.column_name ?? '—'}</td>
                      <td className="py-1.5 text-gray-500 max-w-xs truncate" title={e.override_reason}>{e.override_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination controls */}
            {(auditData?.total ?? 0) > AUDIT_PAGE_SIZE && (
              <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
                <span>
                  Showing {auditOffset + 1}–{Math.min(auditOffset + AUDIT_PAGE_SIZE, auditData?.total ?? 0)} of {auditData?.total} entries
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    disabled={auditOffset === 0}
                    onClick={() => setAuditOffset(Math.max(0, auditOffset - AUDIT_PAGE_SIZE))}
                  >
                    ← Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    disabled={!auditData?.hasMore}
                    onClick={() => setAuditOffset(auditOffset + AUDIT_PAGE_SIZE)}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* Admin Override */}
      {isAdmin && (
        <SectionCard title="Admin Override" icon={Shield} defaultOpen={false}>
          <p className="text-sm text-gray-500 mb-3">
            Use this form to log an approved schema override action. All overrides are permanently recorded.
          </p>
          {overrideForm === null ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOverrideForm({ tableName: '', columnName: '', actionType: 'OVERRIDE', overrideReason: '', sql: '' })}
            >
              + Log Override
            </Button>
          ) : (
            <div className="space-y-3 max-w-lg">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Table Name *</label>
                  <Input
                    value={overrideForm.tableName}
                    onChange={(e) => setOverrideForm({ ...overrideForm, tableName: e.target.value })}
                    placeholder="e.g. all_orders"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Column Name</label>
                  <Input
                    value={overrideForm.columnName}
                    onChange={(e) => setOverrideForm({ ...overrideForm, columnName: e.target.value })}
                    placeholder="optional"
                    className="text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Action Type *</label>
                <select
                  value={overrideForm.actionType}
                  onChange={(e) => setOverrideForm({ ...overrideForm, actionType: e.target.value })}
                  className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2"
                >
                  {['ADD_COLUMN', 'DROP_COLUMN', 'ALTER_COLUMN', 'DROP_TABLE', 'RAW_SQL', 'OVERRIDE'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  DDL SQL <span className="text-gray-400 font-normal">(optional — if provided, will be validated and executed)</span>
                </label>
                <Textarea
                  value={overrideForm.sql}
                  onChange={(e) => setOverrideForm({ ...overrideForm, sql: e.target.value })}
                  placeholder="ALTER TABLE ... or DROP TABLE ... (leave blank to log as audit note only)"
                  className="text-sm font-mono"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Override Reason * (required)</label>
                <Textarea
                  value={overrideForm.overrideReason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, overrideReason: e.target.value })}
                  placeholder="Explain why this override is approved…"
                  className="text-sm"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={!overrideForm.tableName || !overrideForm.overrideReason || overrideMutation.isPending}
                  onClick={() => overrideMutation.mutate(overrideForm)}
                >
                  {overrideMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Submit Override
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOverrideForm(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DomainTruthInspector() {
  const [inputId, setInputId] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState('');
  const [explainActiveDept, setExplainActiveDept] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'inspector' | 'shipment-risk' | 'governance'>('inspector');
  const [location] = useLocation();

  // Auto-populate from ?orderId= and optional ?queue= query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('orderId');
    const queueUrl = params.get('queue');
    if (fromUrl) {
      const id = fromUrl.trim().toUpperCase();
      setInputId(id);
      setActiveId(id);
    }
    if (queueUrl) {
      setSelectedDept(queueUrl);
      setExplainActiveDept(queueUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['/api/admin/domain-truth/order', activeId],
    queryFn: () => apiRequest(`/api/admin/domain-truth/order/${activeId}`),
    enabled: !!activeId,
    retry: false,
  });

  const { data: flightData, isLoading: flightLoading } = useQuery<any>({
    queryKey: ['/api/admin/order-flight-recorder', activeId],
    queryFn: () => apiRequest(`/api/admin/order-flight-recorder/${activeId}`),
    enabled: !!activeId,
    retry: false,
  });

  const { data: authData } = useQuery<{ role: string; username: string } | null>({
    queryKey: ['/api/auth/session'],
    queryFn: () => apiRequest('/api/auth/session').catch(() => null),
    retry: false,
    staleTime: 60_000,
  });

  const {
    data: shipmentRiskData,
    isLoading: shipmentRiskLoading,
    error: shipmentRiskError,
    refetch: refetchShipmentRisk,
  } = useQuery<any>({
    queryKey: ['/api/admin/domain-truth/shipped-in-production'],
    queryFn: () => apiRequest('/api/admin/domain-truth/shipped-in-production'),
    enabled: activeTab === 'shipment-risk',
    retry: false,
  });

  const explainOrderId = (data as any)?.resolvedId ?? activeId;

  const { data: explainData, isLoading: explainLoading } = useQuery<any>({
    queryKey: ['/api/admin/explain-queue', explainOrderId, explainActiveDept],
    queryFn: () =>
      apiRequest(
        `/api/admin/explain-queue/${explainOrderId}/${encodeURIComponent(explainActiveDept!)}`
      ),
    enabled: !!explainOrderId && !!explainActiveDept,
    retry: false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputId.trim().toUpperCase();
    if (trimmed) {
      setInputId(trimmed);
      setActiveId(trimmed);
    }
  };

  const order = data?.order;
  const warnings = (data?.systemWarnings ?? []).filter((w: any) => w.code !== 'LEGACY_TABLE_MISSING');
  const routingFlags = data?.routingFlags ?? [];
  const queueEval = data?.queueEvaluation;
  const departmentTransitions: any[] = data?.departmentTransitions ?? [];
  const auditEvents: any[] = data?.auditEvents ?? [];
  const adminAuditLog: any[] = data?.adminAuditLog ?? [];
  const kickbacks: any[] = data?.kickbacks ?? [];
  const payments: any[] = data?.payments ?? [];
  const flightEvents: any[] = flightData?.events ?? [];

  const isAdmin = authData?.role === 'ADMIN';

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

        {/* Tab navigation */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'inspector', label: 'Order Inspector', icon: Database },
            { id: 'shipment-risk', label: 'Shipped Orders Back in Production', icon: AlertTriangle },
            { id: 'governance', label: 'Schema Governance', icon: ShieldAlert },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as 'inspector' | 'shipment-risk' | 'governance')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Governance Tab */}
        {activeTab === 'governance' && (
          <SchemaGovernancePanel isAdmin={isAdmin} />
        )}

        {activeTab === 'shipment-risk' && (
          <div className="space-y-4">
            <Card className="border-red-200 bg-red-50/60 dark:bg-red-950/20">
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-red-900 dark:text-red-200">
                    Shipped Orders Back in Production
                  </h2>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Read-only safety report. These orders have shipment evidence but are assigned to an active production department.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchShipmentRisk()} disabled={shipmentRiskLoading}>
                  {shipmentRiskLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Refresh
                </Button>
              </CardContent>
            </Card>

            {shipmentRiskLoading && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8">
                <Loader2 className="h-4 w-4 animate-spin" /> Running production safety checks…
              </div>
            )}

            {shipmentRiskError && !shipmentRiskLoading && (
              <Card className="border-red-200">
                <CardContent className="py-4 text-sm text-red-700">
                  The report could not be loaded. Refresh after confirming the latest deployment is active.
                </CardContent>
              </Card>
            )}

            {shipmentRiskData && !shipmentRiskLoading && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card><CardContent className="py-4"><div className="text-xs text-gray-500">Affected orders</div><div className="text-2xl font-bold text-red-700">{shipmentRiskData.total ?? 0}</div></CardContent></Card>
                  <Card><CardContent className="py-4"><div className="text-xs text-gray-500">Likely migration ID collisions</div><div className="text-2xl font-bold">{shipmentRiskData.bySignature?.LIKELY_0167_ID_COLLISION ?? 0}</div></CardContent></Card>
                  <Card><CardContent className="py-4"><div className="text-xs text-gray-500">Open Shipping transition drift</div><div className="text-2xl font-bold">{shipmentRiskData.bySignature?.OPEN_SHIPPING_TRANSITION_DRIFT ?? 0}</div></CardContent></Card>
                </div>

                {(shipmentRiskData.candidates ?? []).length === 0 ? (
                  <Card><CardContent className="py-8 text-center text-green-700"><CheckCircle className="h-6 w-6 mx-auto mb-2" />No shipped orders are currently assigned to active production.</CardContent></Card>
                ) : (
                  <Card>
                    <CardContent className="p-0 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-900 text-left">
                          <tr>
                            <th className="px-3 py-2">Order</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Current state</th><th className="px-3 py-2">Shipment evidence</th><th className="px-3 py-2">Risk signature</th><th className="px-3 py-2">Last changed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(shipmentRiskData.candidates ?? []).map((row: any) => (
                            <tr key={row.order_id} className="border-t border-gray-200 dark:border-gray-800 align-top">
                              <td className="px-3 py-3"><button className="font-mono font-semibold text-indigo-700 hover:underline" onClick={() => { setInputId(row.order_id); setActiveId(row.order_id); setActiveTab('inspector'); }}>{row.order_id}</button></td>
                              <td className="px-3 py-3">{row.customer_name || row.customer_id || '—'}</td>
                              <td className="px-3 py-3"><div>{row.status}</div><div className="text-xs text-gray-500">{row.current_department}</div></td>
                              <td className="px-3 py-3"><div>{row.shipped_date ? new Date(row.shipped_date).toLocaleString() : 'Date unavailable'}</div><div className="text-xs font-mono text-gray-500">{row.tracking_number || 'No tracking number'}</div></td>
                              <td className="px-3 py-3"><Badge variant="outline" className="whitespace-nowrap">{String(row.risk_signature || '').replaceAll('_', ' ')}</Badge>{row.colliding_order_ids?.length ? <div className="text-xs text-red-600 mt-1">ID collision: {row.colliding_order_ids.join(', ')}</div> : null}</td>
                              <td className="px-3 py-3 whitespace-nowrap">{row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* Inspector Tab content below */}
        {activeTab === 'inspector' && <>

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

            {/* ─── Alias Resolution Notice ─── */}
            {data.resolvedId && data.resolvedId !== data.orderId && (
              <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="py-3 px-4 flex items-center gap-2 text-blue-800 dark:text-blue-300 text-sm">
                  <Info className="h-4 w-4 flex-shrink-0 text-blue-600" />
                  <span>
                    Searched for <span className="font-mono font-semibold">{data.orderId}</span> — resolved to real order ID{' '}
                    <span className="font-mono font-semibold">{data.resolvedId}</span> via <span className="font-mono">fb_order_number</span>. All sections below reflect the actual order.
                  </span>
                </CardContent>
              </Card>
            )}

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
                    {order.fb_order_number && (
                      <FieldRow label="fb_order_number" value={order.fb_order_number} mono />
                    )}
                    <StatusFieldRow rawValue={order.status} />
                    <FieldRow label="Order Type" value={getOrderType(order)} />
                    <FieldRow label="Pipeline Stage" value={order.current_department ?? '—'} />
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
                {/* Source type + legacy / production order presence */}
                <div className="mt-4 flex flex-wrap gap-2 items-center">
                  {/* Source badge */}
                  {data.sourceType === 'PRODUCTION_ORDER' && (
                    <Badge className="text-xs bg-purple-600 text-white">Production Order</Badge>
                  )}
                  {data.sourceType === 'SO' && (
                    <Badge className="text-xs bg-blue-600 text-white">Sales Order</Badge>
                  )}
                  {data.sourceType === 'DRAFT' && (
                    <Badge className="text-xs bg-gray-500 text-white">Draft</Badge>
                  )}
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
                  {(() => {
                    const isAccessory = order?.model_id === 'no_stock';
                    const naRules = ['Layup', 'Barcode', 'CNC', 'Gunsmith'];
                    return queueEval.checks.map((check: any, i: number) => {
                      const isNa = isAccessory && naRules.some((r) => check.rule?.toLowerCase().includes(r.toLowerCase()));
                      if (isNa) {
                        return (
                          <div key={i} className="flex items-start gap-2 text-sm py-0.5">
                            <span className="h-4 w-4 flex-shrink-0 mt-0.5 text-center text-gray-400 font-bold text-xs leading-4">—</span>
                            <span className="w-44 flex-shrink-0 font-medium text-gray-400">{check.rule}</span>
                            <span className="text-gray-400 text-xs italic">N/A (Accessory order — no stock required)</span>
                          </div>
                        );
                      }
                      return (
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
                      );
                    });
                  })()}
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
                        {flag.flag === 'no_stock_model' && (
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                            Accessory order detected. Production steps skipped until Paint.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* ─── 4. Department Timeline ─── */}
            <SectionCard title="4 — Department Timeline (from transitions)" icon={Clock} defaultOpen={departmentTransitions.length > 0}>
              {departmentTransitions.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No department history recorded yet.</p>
              ) : (
                <div className="space-y-1">
                  {departmentTransitions.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <span className="text-gray-400 w-5 text-right flex-shrink-0">{i + 1}</span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 w-40 flex-shrink-0">{t.department}</span>
                      <span className="text-gray-400 flex-1">
                        {t.entered_at ? new Date(t.entered_at).toLocaleString() : '—'}
                        {t.exited_at && <> → {new Date(t.exited_at).toLocaleString()}</>}
                      </span>
                      {t.duration_minutes != null && (
                        <span className="text-gray-500 font-mono w-14 text-right flex-shrink-0">{t.duration_minutes}m</span>
                      )}
                      {t.exit_reason && <Badge variant="outline" className="text-xs flex-shrink-0">{t.exit_reason}</Badge>}
                      {t.cycle_number != null && t.cycle_number > 1 && (
                        <Badge variant="outline" className="text-xs text-orange-600 flex-shrink-0">cycle {t.cycle_number}</Badge>
                      )}
                    </div>
                  ))}
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

            {/* ─── 9. Queue Visibility Explanation ─── */}
            <SectionCard title="9 — Queue Visibility Explanation" icon={Eye} defaultOpen={!!explainActiveDept}>
              <div className="space-y-4">
                {/* Controls */}
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-48">
                    <label className="text-xs font-semibold text-gray-500 block mb-1">Select Department</label>
                    <select
                      value={selectedDept}
                      onChange={(e) => setSelectedDept(e.target.value)}
                      className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">— choose a department —</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    size="sm"
                    disabled={!selectedDept || !activeId}
                    onClick={() => setExplainActiveDept(selectedDept)}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Explain
                  </Button>
                </div>

                {/* Quick buttons */}
                <div className="flex flex-wrap gap-2">
                  {QUICK_BUTTONS.map((dept) => (
                    <button
                      key={dept}
                      disabled={!activeId}
                      onClick={() => {
                        setSelectedDept(dept);
                        setExplainActiveDept(dept);
                      }}
                      className="text-xs px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Explain {dept} Queue
                    </button>
                  ))}
                </div>

                {/* Result */}
                {explainLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Evaluating {explainActiveDept} queue…
                  </div>
                )}

                {explainData && !explainLoading && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Verdict banner */}
                    <div
                      className={`px-4 py-3 flex items-center gap-3 ${
                        explainData.visible
                          ? 'bg-green-50 dark:bg-green-950/20 border-b border-green-100 dark:border-green-900'
                          : 'bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900'
                      }`}
                    >
                      {explainData.visible ? (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm font-semibold ${explainData.visible ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                          {explainData.department} Queue — {explainData.visible ? 'Visible' : 'Not Visible'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{explainData.explanation}</p>
                      </div>
                    </div>

                    {/* Checks */}
                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                      {explainData.checks.map((check: any, i: number) => (
                        <div
                          key={i}
                          className={`px-4 py-2.5 flex items-start gap-3 ${
                            !check.result ? 'bg-red-50/50 dark:bg-red-950/10' : ''
                          }`}
                        >
                          {check.result ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium ${check.result ? 'text-gray-700 dark:text-gray-300' : 'text-red-700 dark:text-red-400'}`}>
                              {check.description}
                            </span>
                            <div className="flex flex-wrap gap-3 mt-0.5">
                              {check.expected !== undefined && (
                                <span className="text-xs text-gray-400">
                                  Expected: <span className="font-mono text-gray-600 dark:text-gray-300">{check.expected ?? 'null'}</span>
                                </span>
                              )}
                              <span className="text-xs text-gray-400">
                                Actual: <span className={`font-mono ${check.result ? 'text-gray-600 dark:text-gray-300' : 'text-red-600 dark:text-red-400 font-semibold'}`}>
                                  {String(check.actual ?? 'null')}
                                </span>
                              </span>
                            </div>
                          </div>
                          <span className={`text-xs font-semibold flex-shrink-0 ${check.result ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {check.result ? '✔ Pass' : '✖ Fail'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!explainActiveDept && !explainData && (
                  <p className="text-xs text-gray-400 italic">Select a department above to explain why this order is or is not visible in that queue.</p>
                )}
              </div>
            </SectionCard>

            {/* ─── 8. Order Flight Recorder ─── */}
            <SectionCard title="8 — Order Flight Recorder" icon={Activity} defaultOpen={true}>
              {flightLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading flight recorder…
                </div>
              ) : flightEvents.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No recorded events found for this order.</p>
              ) : (() => {
                const sources = [...new Set(flightEvents.map((e: any) => e.source).filter(Boolean))];

                return (
                  <div>
                    {/* ── Summary header ─────────────────────────────────────── */}
                    <div className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-3 flex-wrap mb-2">
                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          {flightEvents.length} event{flightEvents.length !== 1 ? 's' : ''} recorded
                        </span>
                        {flightData?.orderId && flightData?.resolvedId && flightData.orderId !== flightData.resolvedId && (
                          <span className="text-xs text-gray-500 font-mono">
                            FB: <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{flightData.orderId}</span>
                            {' → '}<span className="font-semibold text-gray-700 dark:text-gray-300">{flightData.resolvedId}</span>
                          </span>
                        )}
                      </div>
                      {sources.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">Sources:</span>
                          {sources.map((s: any) => (
                            <span key={s} className="text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded px-1.5 py-0.5">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ── Vertical timeline ──────────────────────────────────── */}
                    <div className="relative pl-10">
                      {/* Spine line */}
                      <div className="absolute left-4 top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

                      {flightEvents.map((evt: any, i: number) => {
                        const prevEvt = flightEvents[i - 1] as any | undefined;
                        const EvtIcon = EVENT_ICONS[evt.type] ?? HelpCircle;
                        const dotColor = EVENT_COLORS[evt.type] ?? 'bg-gray-400';
                        const ts = evt.timestamp ? new Date(evt.timestamp) : null;
                        const isGrouped = i > 0 && sameMinuteAndType(prevEvt, evt);
                        const delta = i > 0 && !isGrouped
                          ? minutesBetween(prevEvt?.timestamp, evt.timestamp)
                          : null;
                        const label = getFlightEventLabel(evt);
                        const cfg = (FLIGHT_EVENT_CONFIG as any)[evt.type] ?? FLIGHT_EVENT_CONFIG.DEFAULT;

                        return (
                          <div key={i}>
                            {/* Time delta between events */}
                            {delta !== null && (
                              <div className="flex items-center gap-2 my-1.5 ml-1">
                                <span className="text-gray-300 dark:text-gray-600 text-xs">↓</span>
                                <span className="text-xs text-gray-400">
                                  {delta === 0 ? '< 1m' : delta === 1 ? '1m' : `${delta}m`}
                                </span>
                              </div>
                            )}

                            {/* Event node */}
                            <div className={`relative flex gap-3 ${isGrouped ? 'mt-1.5' : i === 0 ? 'mt-0' : 'mt-3'} group`}>
                              {/* Colored dot on spine */}
                              <div className={`absolute -left-6 top-2 w-4 h-4 rounded-full ${dotColor} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                                <EvtIcon className="h-2.5 w-2.5 text-white" />
                              </div>

                              {/* Event card */}
                              <div className="flex-1 min-w-0 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-md px-3 py-2.5 group-hover:border-gray-300 dark:group-hover:border-gray-600 transition-colors">
                                {/* Title row */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <EvtIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">
                                    {label}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${cfg.badge} ml-auto flex-shrink-0`}>
                                    {evt.type ?? 'EVENT'}
                                  </span>
                                </div>

                                {/* Description (if different from label) */}
                                {evt.description && evt.description !== label && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                                    {evt.description}
                                  </p>
                                )}

                                {/* Meta row: timestamp · actor · source */}
                                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                  {ts ? (
                                    <span className="text-xs text-gray-400 font-mono whitespace-nowrap">
                                      {formatFlightTs(ts)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-300 italic">no timestamp</span>
                                  )}
                                  {evt.actor && (
                                    <span className="text-xs text-gray-500">
                                      Actor: <span className="font-mono">{evt.actor}</span>
                                    </span>
                                  )}
                                  {evt.source && (
                                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1 font-mono">
                                      {evt.source}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
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

        </>}
      </div>
    </div>
  );
}

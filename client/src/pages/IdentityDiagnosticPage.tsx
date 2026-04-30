import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type DiagnosticStatus =
  | 'HEALTHY'
  | 'ORPHANED_USER'
  | 'DEAD_LINK'
  | 'DUPLICATE_LINK'
  | 'ROLE_MISMATCH'
  | 'EMAIL_MISMATCH';

interface DiagnosticRow {
  userId: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  userRole: string;
  userEmail: string | null;
  employeeId: number | null;
  isActive: boolean;
  employeeName: string | null;
  employeeCode: string | null;
  employeeUserRole: string | null;
  employeeIsActive: boolean | null;
  employeeDepartment: string | null;
  employeeEmail: string | null;
  status: DiagnosticStatus;
}

interface DiagnosticSummary {
  total: number;
  healthy: number;
  warnings: number;
  critical: number;
}

interface DiagnosticResponse {
  summary: DiagnosticSummary;
  rows: DiagnosticRow[];
}

interface EmployeeOption {
  id: number;
  name: string;
  employeeCode: string | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_META: Record<
  DiagnosticStatus,
  { label: string; severity: 'healthy' | 'warning' | 'critical'; description: string }
> = {
  HEALTHY: {
    label: 'Healthy',
    severity: 'healthy',
    description: 'This user account is correctly linked to an active employee record.',
  },
  ORPHANED_USER: {
    label: 'Orphaned User',
    severity: 'critical',
    description: 'This user account has no linked employee record.',
  },
  DEAD_LINK: {
    label: 'Dead Link',
    severity: 'critical',
    description: 'This user is linked to an employee that is inactive or no longer exists.',
  },
  DUPLICATE_LINK: {
    label: 'Duplicate Link',
    severity: 'critical',
    description: 'Multiple user accounts are pointing to the same employee record.',
  },
  ROLE_MISMATCH: {
    label: 'Role Mismatch',
    severity: 'warning',
    description: "The user's system role does not match the employee's role.",
  },
  EMAIL_MISMATCH: {
    label: 'Email Mismatch',
    severity: 'warning',
    description: 'The user email and employee email are both set but do not match.',
  },
};

function statusRowClass(status: DiagnosticStatus): string {
  const { severity } = STATUS_META[status] ?? { severity: 'healthy' };
  if (severity === 'critical') return 'bg-red-50 hover:bg-red-100';
  if (severity === 'warning') return 'bg-yellow-50 hover:bg-yellow-100';
  return 'bg-white hover:bg-gray-50';
}

function StatusBadge({ status }: { status: DiagnosticStatus }) {
  const meta = STATUS_META[status];
  if (!meta) return <Badge variant="outline">{status}</Badge>;
  const colorMap = {
    healthy: 'bg-green-100 text-green-800 hover:bg-green-100',
    warning: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    critical: 'bg-red-100 text-red-800 hover:bg-red-100',
  };
  return (
    <Badge className={`${colorMap[meta.severity]} text-xs font-semibold whitespace-nowrap`}>
      {meta.label}
    </Badge>
  );
}

type FilterValue = 'all' | 'warnings' | 'critical';

// ─── Reassign control ─────────────────────────────────────────────────────────

function ReassignControl({
  row,
  baseAvailableEmployees,
  onSaved,
}: {
  row: DiagnosticRow;
  baseAvailableEmployees: EmployeeOption[];
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [pendingEmployeeId, setPendingEmployeeId] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Available = base list (not linked to any active user) + currently linked employee (if any)
  const availableEmployees: EmployeeOption[] = useMemo(() => {
    const alreadyInList = row.employeeId
      ? baseAvailableEmployees.some((e) => e.id === row.employeeId)
      : true;
    if (row.employeeId && !alreadyInList && row.employeeName) {
      return [
        { id: row.employeeId, name: row.employeeName, employeeCode: row.employeeCode },
        ...baseAvailableEmployees,
      ];
    }
    return baseAvailableEmployees;
  }, [baseAvailableEmployees, row.employeeId, row.employeeName, row.employeeCode]);

  const mutation = useMutation({
    mutationFn: (employeeId: number | null) =>
      apiRequest(`/api/admin/users/${row.userId}/employee-link`, { method: 'PATCH', body: { employeeId } }),
    onSuccess: () => {
      toast({ title: 'Link updated', description: `User "${row.username}" has been reassigned.` });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/identity-diagnostic'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/identity-diagnostic/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/identity-matrix/roster'] });
      setPendingEmployeeId('');
      onSaved();
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to update link',
        description: err?.message ?? 'An unexpected error occurred.',
        variant: 'destructive',
      });
    },
  });

  const handleConfirm = () => {
    const eid = pendingEmployeeId === 'unlink' ? null : parseInt(pendingEmployeeId, 10);
    mutation.mutate(eid);
    setConfirmOpen(false);
  };

  const selectedEmployee =
    pendingEmployeeId && pendingEmployeeId !== 'unlink'
      ? availableEmployees.find((e) => e.id === parseInt(pendingEmployeeId, 10))
      : null;

  const confirmDescription =
    pendingEmployeeId === 'unlink'
      ? `This will remove the employee link from user "${row.username}". The user will become orphaned.`
      : `This will link user "${row.username}" to employee "${selectedEmployee?.name ?? ''}" (ID ${pendingEmployeeId}).`;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={pendingEmployeeId}
        onValueChange={setPendingEmployeeId}
        disabled={mutation.isPending}
      >
        <SelectTrigger className="h-8 w-56 text-xs">
          <SelectValue placeholder="Reassign to…" />
        </SelectTrigger>
        <SelectContent>
          {row.employeeId != null && (
            <SelectItem value="unlink" className="text-red-600 text-xs">
              — Unlink employee —
            </SelectItem>
          )}
          {availableEmployees.map((emp) => (
            <SelectItem key={emp.id} value={String(emp.id)} className="text-xs">
              {emp.name}
              {emp.employeeCode ? ` (${emp.employeeCode})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pendingEmployeeId && (
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={mutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {mutation.isPending ? (
            <RefreshCw className="w-3 h-3 animate-spin" />
          ) : (
            'Save'
          )}
        </Button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm employee link change</AlertDialogTitle>
            <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IdentityDiagnosticPage() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterValue>('all');

  const { data, isLoading, isError, refetch } = useQuery<DiagnosticResponse>({
    queryKey: ['/api/admin/identity-diagnostic'],
  });

  const { data: availableEmployees } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/admin/identity-diagnostic/employees'],
  });

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (filter === 'warnings') {
      return data.rows.filter((r) =>
        ['ROLE_MISMATCH', 'EMAIL_MISMATCH'].includes(r.status)
      );
    }
    if (filter === 'critical') {
      return data.rows.filter((r) =>
        ['ORPHANED_USER', 'DEAD_LINK', 'DUPLICATE_LINK'].includes(r.status)
      );
    }
    return data.rows;
  }, [data, filter]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/identity-matrix')}
            className="flex items-center gap-1 text-gray-500"
          >
            <ArrowLeft className="w-4 h-4" />
            Identity Matrix
          </Button>
          <div className="w-px h-6 bg-gray-200" />
          <div className="p-2 bg-red-100 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Identity Diagnostic</h1>
            <p className="text-sm text-gray-500">
              Review and fix broken user–employee identity links.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {data?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard
            icon={<Users className="w-4 h-4" />}
            label="Total Users"
            value={data.summary.total}
            color="blue"
          />
          <SummaryCard
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="Healthy"
            value={data.summary.healthy}
            color="green"
          />
          <SummaryCard
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Warnings"
            value={data.summary.warnings}
            color="amber"
          />
          <SummaryCard
            icon={<AlertCircle className="w-4 h-4" />}
            label="Critical"
            value={data.summary.critical}
            color="red"
          />
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>Failed to load diagnostic data. Make sure you have admin access.</span>
        </div>
      )}

      {/* Filter bar */}
      {data && (
        <div className="flex gap-2 flex-wrap">
          {(['all', 'warnings', 'critical'] as FilterValue[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={filter === v ? 'default' : 'outline'}
              onClick={() => setFilter(v)}
              className="text-xs capitalize"
            >
              {v === 'all' ? `All (${data.rows.length})` : null}
              {v === 'warnings' ? `Warnings (${data.summary.warnings})` : null}
              {v === 'critical' ? `Critical (${data.summary.critical})` : null}
            </Button>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Username</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Full Name</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">User Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Linked Employee</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Emp Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Issue</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Reassign</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400">
                    No users match the selected filter.
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => (
                <tr
                  key={row.userId}
                  className={`border-b border-gray-100 transition-colors ${statusRowClass(row.status)}`}
                >
                  <td className="px-4 py-3 font-mono text-gray-800 whitespace-nowrap">{row.username}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {[row.firstName, row.lastName].filter(Boolean).join(' ') || (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{row.userRole}</Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.employeeName ? (
                      <span className="font-medium text-gray-800">
                        {row.employeeName}
                        {row.employeeCode && (
                          <span className="ml-1 text-xs text-gray-400 font-mono">({row.employeeCode})</span>
                        )}
                      </span>
                    ) : row.employeeId ? (
                      <span className="text-red-500 text-xs font-mono">ID {row.employeeId} (not found)</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.employeeUserRole ? (
                      <Badge variant="outline" className="text-xs">{row.employeeUserRole}</Badge>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                    {row.status !== 'HEALTHY'
                      ? STATUS_META[row.status]?.description
                      : <span className="text-green-600">No issues detected.</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ReassignControl
                      row={row}
                      baseAvailableEmployees={availableEmployees ?? []}
                      onSaved={() => {}}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'amber' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-1 ${colors[color]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

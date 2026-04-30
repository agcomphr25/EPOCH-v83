import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Fingerprint, ChevronUp, ChevronDown, Users, UserCheck, Key, Scan, AlertCircle, ShieldCheck } from 'lucide-react';

// ─── Feature Matrix Data ───────────────────────────────────────────────────────

interface FeatureEntry {
  feature: string;
  usesUserId: string | null;
  usesEmployeeId: string | null;
  usesEmployeeCode: string | null;
}

const FEATURE_MATRIX: FeatureEntry[] = [
  {
    feature: 'Login / Auth',
    usesUserId: 'Primary key for session lookup and JWT payload',
    usesEmployeeId: 'Linked to resolve display name and employee profile',
    usesEmployeeCode: null,
  },
  {
    feature: 'Session Management',
    usesUserId: 'Session token bound to user.id; used in /api/auth/session',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'User Permissions',
    usesUserId: 'Role/permission checks performed via user.id lookup',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'Time Clock / Kiosk',
    usesUserId: null,
    usesEmployeeId: 'Employee ID used to record punch events in ledger',
    usesEmployeeCode: 'Employee code displayed on kiosk confirmation screen',
  },
  {
    feature: 'Punch Ledger',
    usesUserId: null,
    usesEmployeeId: 'Foreign key on every punch ledger row',
    usesEmployeeCode: null,
  },
  {
    feature: 'Timesheets',
    usesUserId: null,
    usesEmployeeId: 'Timesheet rows keyed by employeeId; used in aggregate reports',
    usesEmployeeCode: null,
  },
  {
    feature: 'Labor Costing',
    usesUserId: null,
    usesEmployeeId: 'Joins employee hourly rate via employee.id',
    usesEmployeeCode: null,
  },
  {
    feature: 'Training & Certifications',
    usesUserId: null,
    usesEmployeeId: 'Certification records reference employee.id',
    usesEmployeeCode: 'Used as human-readable identifier in training imports',
  },
  {
    feature: 'P2 Traveler Execution',
    usesUserId: 'User ID stored in traveler signatures and hand-off events',
    usesEmployeeId: 'Employee ID logged in traveler scan events',
    usesEmployeeCode: null,
  },
  {
    feature: 'Employee Evaluations',
    usesUserId: null,
    usesEmployeeId: 'Evaluation records keyed by employee.id',
    usesEmployeeCode: null,
  },
  {
    feature: 'Onboarding Sessions',
    usesUserId: null,
    usesEmployeeId: 'Session wizard linked to employee.id for progress tracking',
    usesEmployeeCode: null,
  },
  {
    feature: 'Employee Portal',
    usesUserId: null,
    usesEmployeeId: 'Portal token resolves to employee.id for access',
    usesEmployeeCode: null,
  },
  {
    feature: 'Badge Scan Auth',
    usesUserId: null,
    usesEmployeeId: 'Badge scan resolves badgeScanCode → employee.id',
    usesEmployeeCode: null,
  },
  {
    feature: 'Checklists',
    usesUserId: 'User ID captured on checklist completion events',
    usesEmployeeId: 'Employee ID used when checklist is triggered from floor',
    usesEmployeeCode: null,
  },
  {
    feature: 'Signatures',
    usesUserId: 'User ID stamped on every electronic signature record',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'Notifications',
    usesUserId: 'Notification routing targets user.id (WebSocket channel keyed by user)',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'Tickets',
    usesUserId: 'Ticket creator and assignee stored as user.id references',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'Audit Log',
    usesUserId: 'Acting user.id recorded on every audit log entry',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'Order Management',
    usesUserId: 'Order creator, approver, and modifier stored as user.id',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'EDRI Scoring',
    usesUserId: 'EDRI snapshot evidence references user.id of verifier',
    usesEmployeeId: 'Employee-level EDRI scores tracked by employee.id',
    usesEmployeeCode: null,
  },
  {
    feature: 'WebSocket Connections',
    usesUserId: 'WS channel subscriptions keyed to authenticated user.id',
    usesEmployeeId: null,
    usesEmployeeCode: null,
  },
  {
    feature: 'Calendar / Leave',
    usesUserId: null,
    usesEmployeeId: 'Leave requests and calendar events tied to employee.id',
    usesEmployeeCode: null,
  },
  {
    feature: 'Skills Matrix',
    usesUserId: null,
    usesEmployeeId: 'Skill competency records keyed by employee.id',
    usesEmployeeCode: null,
  },
  {
    feature: 'Labor Budget',
    usesUserId: null,
    usesEmployeeId: 'Budget line items reference employee.id for rate lookup',
    usesEmployeeCode: null,
  },
  {
    feature: 'Sign Badge / Handoff',
    usesUserId: 'User.id recorded in sign-off and handoff trail',
    usesEmployeeId: 'Employee.id resolved from badge scan at handoff point',
    usesEmployeeCode: 'Employee code optionally displayed on badge printout',
  },
];

// ─── Roster API Types ──────────────────────────────────────────────────────────

interface RosterRow {
  employeeId: number;
  employeeCode: string | null;
  name: string;
  department: string | null;
  userRole: string;
  hasBadge: boolean;
  hasPin: boolean;
  hasPortalToken: boolean;
  canonicalId: string | null;
  userId: number | null;
  username: string | null;
  userRoleFromUser: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';
type SortField = keyof RosterRow;

function SortIcon({ field, sortField, sortDir }: { field: string; sortField: string; sortDir: SortDir }) {
  if (field !== sortField) return <span className="ml-1 text-gray-300">↕</span>;
  return sortDir === 'asc' ? <ChevronUp className="inline ml-1 w-3 h-3" /> : <ChevronDown className="inline ml-1 w-3 h-3" />;
}

// ─── Tab 1: Feature Matrix ─────────────────────────────────────────────────────

function FeatureMatrixTab() {
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<'userId' | 'employeeId' | 'employeeCode'>>(new Set());

  const toggleFilter = (key: 'userId' | 'employeeId' | 'employeeCode') => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    return FEATURE_MATRIX.filter(row => {
      const matchesSearch = search === '' || row.feature.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        activeFilters.size === 0 ||
        (activeFilters.has('userId') && row.usesUserId != null) ||
        (activeFilters.has('employeeId') && row.usesEmployeeId != null) ||
        (activeFilters.has('employeeCode') && row.usesEmployeeCode != null);
      return matchesSearch && matchesFilter;
    });
  }, [search, activeFilters]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Input
          placeholder="Search feature..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeFilters.has('userId') ? 'default' : 'outline'}
            onClick={() => toggleFilter('userId')}
            className="text-xs"
          >
            user.id
          </Button>
          <Button
            size="sm"
            variant={activeFilters.has('employeeId') ? 'default' : 'outline'}
            onClick={() => toggleFilter('employeeId')}
            className="text-xs"
          >
            employee.id
          </Button>
          <Button
            size="sm"
            variant={activeFilters.has('employeeCode') ? 'default' : 'outline'}
            onClick={() => toggleFilter('employeeCode')}
            className="text-xs"
          >
            employeeCode
          </Button>
          {activeFilters.size > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setActiveFilters(new Set())} className="text-xs text-gray-500">
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Showing {filtered.length} of {FEATURE_MATRIX.length} features
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700 w-56">Feature</th>
              <th className="text-left px-4 py-3 font-semibold text-blue-700">user.id</th>
              <th className="text-left px-4 py-3 font-semibold text-green-700">employee.id</th>
              <th className="text-left px-4 py-3 font-semibold text-purple-700">employeeCode</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-10 text-gray-400">No features match your filter.</td>
              </tr>
            )}
            {filtered.map((row, i) => (
              <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{row.feature}</td>
                <td className="px-4 py-3">
                  {row.usesUserId ? (
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 text-xs font-normal whitespace-normal max-w-xs">
                      ✓ {row.usesUserId}
                    </Badge>
                  ) : (
                    <span className="text-gray-200">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.usesEmployeeId ? (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs font-normal whitespace-normal max-w-xs">
                      ✓ {row.usesEmployeeId}
                    </Badge>
                  ) : (
                    <span className="text-gray-200">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.usesEmployeeCode ? (
                    <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 text-xs font-normal whitespace-normal max-w-xs">
                      ✓ {row.usesEmployeeCode}
                    </Badge>
                  ) : (
                    <span className="text-gray-200">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 2: Roster Pivot ───────────────────────────────────────────────────────

type PresetFilter = 'linked' | 'unlinked' | 'hasCode' | 'floorOp';

function RosterPivotTab() {
  const [search, setSearch] = useState('');
  const [preset, setPreset] = useState<PresetFilter | null>(null);
  const [sortField, setSortField] = useState<SortField>('employeeId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data, isLoading, isError } = useQuery<RosterRow[]>({
    queryKey: ['/api/admin/identity-matrix/roster'],
  });

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    let result = [...data];

    if (preset === 'linked') result = result.filter(r => r.userId != null);
    else if (preset === 'unlinked') result = result.filter(r => r.userId == null);
    else if (preset === 'hasCode') result = result.filter(r => r.employeeCode != null);
    else if (preset === 'floorOp') result = result.filter(r => r.userRole === 'EMPLOYEE' && r.userId == null);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.username ?? '').toLowerCase().includes(q) ||
        String(r.employeeId).includes(q) ||
        (r.employeeCode ?? '').toLowerCase().includes(q) ||
        (r.canonicalId ?? '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [data, search, preset, sortField, sortDir]);

  const summary = useMemo(() => {
    if (!data) return null;
    return {
      total: data.length,
      withUser: data.filter(r => r.userId != null).length,
      withCode: data.filter(r => r.employeeCode != null).length,
      withBadge: data.filter(r => r.hasBadge).length,
      withoutAnyCode: data.filter(r => r.employeeCode == null && !r.hasBadge && !r.hasPin).length,
    };
  }, [data]);

  const Th = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="text-left px-3 py-3 font-semibold text-gray-700 cursor-pointer select-none whitespace-nowrap hover:bg-gray-100 transition-colors"
      onClick={() => handleSort(field)}
    >
      {children}
      <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
    </th>
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg p-4">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>Failed to load roster data. Make sure you have admin access.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard icon={<Users className="w-4 h-4" />} label="Total Employees" value={summary.total} color="blue" />
          <SummaryCard icon={<UserCheck className="w-4 h-4" />} label="With User Account" value={summary.withUser} color="green" />
          <SummaryCard icon={<Key className="w-4 h-4" />} label="With Employee Code" value={summary.withCode} color="purple" />
          <SummaryCard icon={<Scan className="w-4 h-4" />} label="With Badge" value={summary.withBadge} color="amber" />
          <SummaryCard icon={<AlertCircle className="w-4 h-4" />} label="Without Any Code" value={summary.withoutAnyCode} color="red" />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <Input
          placeholder="Search name, username, code, ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-72"
        />
        <div className="flex gap-2 flex-wrap">
          {([
            ['linked', 'Has User Account'],
            ['unlinked', 'No User Account'],
            ['hasCode', 'Has Employee Code'],
            ['floorOp', 'Floor Operators'],
          ] as [PresetFilter, string][]).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={preset === key ? 'default' : 'outline'}
              onClick={() => setPreset(prev => prev === key ? null : key)}
              className="text-xs"
            >
              {label}
            </Button>
          ))}
          {(preset || search) && (
            <Button size="sm" variant="ghost" onClick={() => { setPreset(null); setSearch(''); }} className="text-xs text-gray-500">
              Clear
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Showing {rows.length} of {data?.length ?? 0} employees
      </p>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <Th field="employeeId">Emp ID</Th>
              <Th field="employeeCode">Emp Code</Th>
              <Th field="name">Name</Th>
              <Th field="department">Department</Th>
              <Th field="userRole">Role</Th>
              <Th field="hasBadge">Badge</Th>
              <Th field="hasPin">PIN</Th>
              <Th field="hasPortalToken">Portal Token</Th>
              <Th field="canonicalId">Canonical ID</Th>
              <Th field="userId">User ID</Th>
              <Th field="username">Username</Th>
              <Th field="userRoleFromUser">User Role</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="text-center py-10 text-gray-400">No employees match your filter.</td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={row.employeeId} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                <td className="px-3 py-2 font-mono text-gray-600">{row.employeeId}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.employeeCode ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{row.name}</td>
                <td className="px-3 py-2 text-gray-600">{row.department ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className="text-xs">{row.userRole}</Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  {row.hasBadge ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.hasPin ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.hasPortalToken ? <span className="text-green-600 font-bold">✓</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {row.canonicalId ? `${row.canonicalId.slice(0, 8)}…` : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-gray-600">
                  {row.userId ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2 text-gray-700">{row.username ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-2">
                  {row.userRoleFromUser ? (
                    <Badge variant="outline" className="text-xs">{row.userRoleFromUser}</Badge>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'purple' | 'amber' | 'red';
}) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function IdentityMatrixPage() {
  const [, navigate] = useLocation();

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Fingerprint className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Identity Matrix</h1>
            <p className="text-sm text-gray-500">
              Audit which system features depend on each identity field and view the full employee/user roster.
            </p>
          </div>
        </div>
        <Button
          variant="default"
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
          onClick={() => navigate('/admin/identity-diagnostic')}
        >
          <ShieldCheck className="w-4 h-4" />
          Run Diagnostic
        </Button>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Feature × Identity Matrix</TabsTrigger>
          <TabsTrigger value="roster">Employee / User Roster</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <FeatureMatrixTab />
        </TabsContent>

        <TabsContent value="roster" className="mt-4">
          <RosterPivotTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

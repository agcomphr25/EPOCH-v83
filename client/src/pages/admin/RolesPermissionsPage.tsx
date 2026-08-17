import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Printer, Search, ShieldCheck } from 'lucide-react';
import CertificationAuthorizationMatrix from '@/pages/CertificationAuthorizationMatrix';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Employee = {
  id: number;
  employeeNumber?: string;
  name: string;
  jobTitle?: string;
  department?: string;
  supervisor?: string;
  employmentStatus: string;
  isActive: boolean;
  userId?: number;
  username?: string;
  role?: string;
  userIsActive?: boolean;
  accessStatus?: string;
  permissionCount?: number;
  scopedGrantCount?: number;
  projectAssignmentCount?: number;
  activeCertificationCount?: number;
  activeAuthorizationCount?: number;
  nextExpiration?: string;
};
type UserAccount = {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
  role: string;
  employeeId?: number | null;
  employeeDisplayName?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
};
type Authorization = {
  id: string;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  authorization_type: string;
  status: string;
  program: string;
  part_number?: string;
  product_family?: string;
  department?: string;
  operation_scope?: string;
  effective_date?: string;
  expiration_date?: string;
  qualification_method?: string;
  evidence_reference?: string;
  approver_username?: string;
  limitations?: string;
  revision: number;
};
type Workspace = {
  dataAvailability: Record<string, boolean>;
  employees: Employee[] | null;
  authorizations: Authorization[] | null;
  assignments: any[] | null;
  training: any[] | null;
  legacyCertifications: any[] | null;
  auditHistory: any[] | null;
  enforcement: {
    environmentEnabled: boolean;
    databaseEnabled: boolean | null;
    effectiveEnabled: boolean;
    controllingSource: string;
    disagreement: boolean;
  };
};
type Role = {
  id: number;
  name: string;
  description: string;
  isSystem: boolean;
  capabilities: string[];
};
type Capability = {
  id: number;
  key: string;
  description: string;
  category: string;
};
type Override = {
  id: number;
  user_id: number;
  username: string;
  capability_key: string;
  capability_description: string;
  effect: 'allow' | 'deny';
};
type Scope = {
  id: number;
  userId: number;
  username: string;
  capabilityKey: string;
  scopeType: string;
  department?: string;
  projectId?: string;
};

const TEMPLATE_NAMES = [
  'President / Owner',
  'Vice President of Operations',
  'Executive Vice President / Design Governance',
  'QMS Management Representative',
  'Engineering Manager / Design Authority',
  'Design Engineer',
  'P2 Project Manager',
  'Production Manager',
  'Manufacturing / Process Engineer',
  'Quality Manager / Quality Lead',
  'Quality Inspector',
  'Authorized Product Releaser',
  'Certificate of Conformance Approver',
  'Routing Releaser',
  'Trainer',
  'HR / Training Administrator',
  'Business Manager / Supply Chain',
  'Buyer / Purchasing',
  'Receiving Inspector',
  'Inventory / Material Control',
  'Production Technician',
  'Shipping',
  'Calibration Technician',
  'Internal Auditor',
  'EPOCH Administrator',
  'Read-Only Auditor',
];
const authorityLabels: Record<string, string> = {
  WORK: 'Work',
  QC_INSPECTION: 'QC Inspection',
  ROUTING_RELEASE: 'Routing Release',
  FINAL_QC: 'Final QC',
  FINAL_PRODUCT_RELEASE: 'Final Product Release',
  COC_APPROVAL: 'Certificate of Conformance Approval',
};
const available = (ok: boolean, value: number | string) =>
  ok ? value : 'Not available';
const pretty = (key: string) =>
  key
    .split('.')
    .map((p) => p.replaceAll('_', ' '))
    .join(' › ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

export default function RolesPermissionsPage() {
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const workspace = useQuery<Workspace>({
    queryKey: ['/api/permissions/authority-workspace'],
  });
  const roles = useQuery<Role[]>({ queryKey: ['/api/permissions/roles'] });
  const users = useQuery<UserAccount[]>({ queryKey: ['/api/users'] });
  const capabilities = useQuery<Capability[]>({
    queryKey: ['/api/permissions/capabilities'],
  });
  const overrides = useQuery<Override[]>({
    queryKey: ['/api/permissions/all-user-overrides'],
  });
  const scopes = useQuery<Scope[]>({
    queryKey: ['/api/permissions/all-scoped-grants'],
  });
  const data = workspace.data;
  const employees = data?.employees ?? [];
  const auths = data?.authorizations ?? [];
  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const filtered = employees.filter((e) =>
    `${e.name} ${e.employeeNumber ?? ''} ${e.department ?? ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const filteredUsers = (users.data ?? []).filter((user) =>
    `${user.username} ${user.firstName ?? ''} ${user.lastName ?? ''} ${
      user.employeeDisplayName ?? ''
    } ${user.role}`
      .toLowerCase()
      .includes(userSearch.toLowerCase())
  );
  const employeeAuths = selected
    ? auths.filter((a) => a.employee_id === selected.id)
    : [];
  const employeeAssignments = selected
    ? (data?.assignments ?? []).filter(
        (a) => a.employee_id === selected.id || a.user_id === selected.userId
      )
    : [];
  const employeeTraining = selected
    ? (data?.training ?? []).filter((a) => a.trainee_id === selected.id)
    : [];
  const employeeLegacy = selected
    ? (data?.legacyCertifications ?? []).filter(
        (a) => a.employee_id === selected.id
      )
    : [];
  const employeeOverrides = selected
    ? (overrides.data ?? []).filter((o) => o.user_id === selected.userId)
    : [];
  const employeeScopes = selected
    ? (scopes.data ?? []).filter((s) => s.userId === selected.userId)
    : [];
  const role = selected
    ? (roles.data ?? []).find((r) => r.name === selected.role)
    : undefined;
  const summary = useMemo(
    () => ({
      active: employees.filter(
        (e) => e.isActive && e.employmentStatus === 'ACTIVE'
      ).length,
      linked: employees.filter((e) => e.userId).length,
      unlinked: employees.filter((e) => e.isActive && !e.userId).length,
      activeAuth: auths.filter((a) => a.status === 'ACTIVE').length,
      draft: auths.filter((a) => a.status === 'DRAFT').length,
      suspended: auths.filter((a) => a.status === 'SUSPENDED').length,
      expired: auths.filter((a) => a.status === 'EXPIRED').length,
      expiring: auths.filter(
        (a) =>
          a.status === 'ACTIVE' &&
          a.expiration_date &&
          new Date(a.expiration_date).getTime() < Date.now() + 60 * 86400000
      ).length,
    }),
    [employees, auths]
  );
  const findings = useMemo(
    () =>
      employees.flatMap((e) => {
        const f: { employee: Employee; code: string; detail: string }[] = [];
        if (e.isActive && !e.userId)
          f.push({
            employee: e,
            code: 'UNLINKED_EMPLOYEE_OR_USER',
            detail: 'Active employee has no linked EPOCH account.',
          });
        if (!e.isActive && e.userIsActive)
          f.push({
            employee: e,
            code: 'UNLINKED_EMPLOYEE_OR_USER',
            detail: 'Inactive employee appears to have an active account.',
          });
        if (
          (e.role === 'ADMIN' || e.role === 'OWNER') &&
          (e.activeAuthorizationCount ?? 0) > 0
        )
          f.push({
            employee: e,
            code: 'ADMINISTRATIVE_BYPASS_RISK',
            detail:
              'System administration and controlled authority coexist; review separation of duties.',
          });
        return f;
      }),
    [employees]
  );
  const availability = data?.dataAvailability ?? {};
  return (
    <div
      className="p-6 max-w-[1600px] mx-auto space-y-5"
      data-testid="roles-permissions-authorizations-workspace"
    >
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck />
          Roles, Permissions &amp; Authorizations
        </h1>
        <p className="text-muted-foreground">
          Read-only administration and audit workspace. Role templates are
          recommendations only.
        </p>
      </div>
      <Card className="border-blue-300 bg-blue-50">
        <CardContent className="pt-6">
          EPOCH permissions control system access. Certifications demonstrate
          competence. Formal authorizations control designated Quality,
          Engineering, routing, product-release and Certificate of Conformance
          actions. Training completion alone does not grant controlled
          authority.
        </CardContent>
      </Card>
      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="profile">Employee Authority Profile</TabsTrigger>
          <TabsTrigger value="templates">Role Templates</TabsTrigger>
          <TabsTrigger value="matrix">
            Certification &amp; Authorization Matrix
          </TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts &amp; Review</TabsTrigger>
          <TabsTrigger value="history">Audit History</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          <div className="grid md:grid-cols-3 xl:grid-cols-5 gap-3">
            <SummaryCard
              label="Active employees"
              value={available(!!availability.employees, summary.active)}
            />
            <SummaryCard
              label="Employee accounts linked"
              value={available(!!availability.employees, summary.linked)}
            />
            <SummaryCard
              label="Accounts requiring linkage"
              value={available(!!availability.employees, summary.unlinked)}
            />
            <SummaryCard
              label="Active authorizations"
              value={available(
                !!availability.authorizations,
                summary.activeAuth
              )}
            />
            <SummaryCard
              label="Draft authorizations"
              value={available(!!availability.authorizations, summary.draft)}
            />
            <SummaryCard
              label="Expiring within 60 days"
              value={available(!!availability.authorizations, summary.expiring)}
            />
            <SummaryCard
              label="Suspended authorizations"
              value={available(
                !!availability.authorizations,
                summary.suspended
              )}
            />
            <SummaryCard
              label="Expired authorizations"
              value={available(!!availability.authorizations, summary.expired)}
            />
            <SummaryCard
              label="Potential gaps"
              value={available(
                !!availability.employees && !!availability.authorizations,
                findings.length
              )}
            />
            <SummaryCard
              label="Potential conflicts"
              value={available(
                !!availability.employees,
                findings.filter(
                  (f) =>
                    f.code.includes('CONFLICT') || f.code.includes('BYPASS')
                ).length
              )}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Prospective enforcement controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p>
                Environment enforcement:{' '}
                <Badge>
                  {data?.enforcement.environmentEnabled
                    ? 'Enabled'
                    : 'Disabled'}
                </Badge>
              </p>
              <p>
                Database enforcement:{' '}
                <Badge variant="outline">
                  {data?.enforcement.databaseEnabled == null
                    ? 'Not available'
                    : data.enforcement.databaseEnabled
                      ? 'Enabled'
                      : 'Disabled'}
                </Badge>
              </p>
              <p>
                Effective runtime state:{' '}
                <b>
                  {data?.enforcement.effectiveEnabled ? 'Enabled' : 'Disabled'}
                </b>{' '}
                (currently controlled by{' '}
                {data?.enforcement.controllingSource ?? 'Not available'}).
              </p>
              {data?.enforcement.disagreement && (
                <p className="text-amber-700 flex gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  The two controls disagree. No setting was changed.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User accounts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Complete EPOCH account list. User accounts are shown even when
                they are not linked to an employee record. This view is
                read-only.
              </p>
              <div className="relative max-w-xl">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search username, employee, name or role"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                />
              </div>
              {users.isError ? (
                <p>Not available</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Linked employee</TableHead>
                      <TableHead>System role</TableHead>
                      <TableHead>Account status</TableHead>
                      <TableHead>Last login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.username}
                        </TableCell>
                        <TableCell>
                          {[user.firstName, user.lastName]
                            .filter(Boolean)
                            .join(' ') || 'Not available'}
                        </TableCell>
                        <TableCell>
                          {user.employeeDisplayName || (
                            <Badge variant="outline">Not linked</Badge>
                          )}
                        </TableCell>
                        <TableCell>{user.role}</TableCell>
                        <TableCell>
                          <Badge
                            variant={user.isActive ? 'default' : 'outline'}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.lastLoginAt
                            ? new Date(user.lastLoginAt).toLocaleString()
                            : 'Never recorded'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {!users.isLoading && !users.isError && !filteredUsers.length && (
                <p>No matching user accounts.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="employees">
          <Card>
            <CardHeader>
              <CardTitle>Employees</CardTitle>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-3 h-4 w-4" />
                <Input
                  className="pl-9"
                  placeholder="Search employee, number or department"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      'Employee',
                      'Title / department',
                      'Linked account',
                      'Role',
                      'Permissions',
                      'Scopes',
                      'Projects',
                      'Certifications',
                      'Authorizations',
                      'Review',
                    ].map((x) => (
                      <TableHead key={x}>{x}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedId(e.id)}
                    >
                      <TableCell>
                        {e.name}
                        <br />
                        <span className="text-muted-foreground">
                          {e.employeeNumber || 'No number'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {e.jobTitle || 'Not available'}
                        <br />
                        {e.department || 'Not available'}
                      </TableCell>
                      <TableCell>
                        {e.username || 'Requires linkage'}
                        <br />
                        {e.accessStatus || 'Not available'}
                      </TableCell>
                      <TableCell>{e.role || 'Not available'}</TableCell>
                      <TableCell>
                        {e.permissionCount ?? 'Not available'}
                      </TableCell>
                      <TableCell>
                        {e.scopedGrantCount ?? 'Not available'}
                      </TableCell>
                      <TableCell>
                        {e.projectAssignmentCount ?? 'Not available'}
                      </TableCell>
                      <TableCell>
                        {e.activeCertificationCount ?? 'Not available'}
                      </TableCell>
                      <TableCell>
                        {e.activeAuthorizationCount ?? 'Not available'}
                        {e.nextExpiration && (
                          <>
                            <br />
                            <span className="text-amber-700">
                              Review{' '}
                              {new Date(e.nextExpiration).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm">
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!availability.employees && <p>Not available</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="profile">
          {!selected ? (
            <Card>
              <CardContent className="pt-6">
                Select an employee on the Employees tab.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4 print:text-black">
              <div className="flex justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{selected.name}</h2>
                  <p>
                    {selected.employeeNumber || 'No employee number'} ·{' '}
                    {selected.jobTitle || 'Job title not available'} ·{' '}
                    {selected.department || 'Department not available'}
                  </p>
                  <p>
                    Supervisor: {selected.supervisor || 'Not available'} ·
                    EPOCH: {selected.username || 'Unlinked'} · Role:{' '}
                    {selected.role || 'Not available'}
                  </p>
                </div>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Employee Authority Card
                </Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Resolved permissions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-2">
                    {(role?.capabilities ?? []).map((k) => (
                      <div key={k}>
                        <b>{pretty(k)}</b>
                        <span className="text-xs text-muted-foreground block">
                          Role · {k}
                        </span>
                      </div>
                    ))}
                  </div>
                  {employeeOverrides.map((o) => (
                    <p key={o.id}>
                      {o.effect === 'allow'
                        ? 'Individual allow'
                        : 'Individual deny'}
                      : {o.capability_description || pretty(o.capability_key)}{' '}
                      <span className="text-xs">({o.capability_key})</span>
                    </p>
                  ))}
                  {employeeScopes.map((s) => (
                    <p key={s.id}>
                      {s.scopeType} scope: {pretty(s.capabilityKey)} —{' '}
                      {s.department || s.projectId || 'Global'}
                    </p>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    Assignments, training and legacy evidence
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p>
                    Design-project assignments:{' '}
                    {employeeAssignments.length || 'None recorded'}
                  </p>
                  <p>
                    Training certifications:{' '}
                    {employeeTraining.length || 'None recorded'}
                  </p>
                  <p>
                    Legacy P2 part/department certifications:{' '}
                    {employeeLegacy.length || 'None recorded'}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Formal authorizations</CardTitle>
                </CardHeader>
                <CardContent>
                  {employeeAuths.length
                    ? employeeAuths.map((a) => (
                        <div key={a.id} className="border-b py-3">
                          <b>
                            {authorityLabels[a.authorization_type] ||
                              a.authorization_type}
                          </b>{' '}
                          · {a.status} · {a.program}
                          <p>
                            Scope:{' '}
                            {[
                              a.part_number,
                              a.product_family,
                              a.department,
                              a.operation_scope,
                            ]
                              .filter(Boolean)
                              .join(' / ') || 'General'}
                          </p>
                          <p>
                            Evidence:{' '}
                            {a.qualification_method || 'Not available'} ·{' '}
                            {a.evidence_reference || 'Not available'} ·
                            Approver: {a.approver_username || 'Pending'}
                          </p>
                          <p>
                            Effective:{' '}
                            {a.effective_date
                              ? new Date(a.effective_date).toLocaleDateString()
                              : 'Not available'}{' '}
                            · Review:{' '}
                            {a.expiration_date
                              ? new Date(a.expiration_date).toLocaleDateString()
                              : 'No expiration'}{' '}
                            · Limitations: {a.limitations || 'None recorded'}
                          </p>
                        </div>
                      ))
                    : 'None recorded'}
                </CardContent>
              </Card>
              <p className="font-semibold">
                This report describes current EPOCH records. It does not
                independently grant authority.
              </p>
              <p>Current as of {new Date().toLocaleString()}</p>
            </div>
          )}
        </TabsContent>
        <TabsContent value="templates">
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {TEMPLATE_NAMES.map((name) => (
              <Card key={name}>
                <CardHeader>
                  <CardTitle className="text-base">{name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p>
                    <b>Normal responsibilities:</b> duties associated with this
                    business function.
                  </p>
                  <p>
                    <b>Recommended capabilities:</b> preview only; compare to
                    the capability catalog.
                  </p>
                  <p>
                    <b>Required evidence:</b> current competence and objective
                    evidence appropriate to scope.
                  </p>
                  <p>
                    <b>Formal authority:</b> separately designated where
                    Quality, Engineering, routing, release or CoC actions apply.
                  </p>
                  <p>
                    <b>Scope:</b> program, part/family, department, operation
                    and project as applicable.
                  </p>
                  <p className="text-amber-700">
                    Separation-of-duties review and management designation
                    required where controlled approvals apply.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Preview recommended settings
                    </Button>
                    <Button variant="outline" size="sm">
                      Compare with current employee
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommendation only. No Apply action is available.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="matrix">
          <CertificationAuthorizationMatrix />
        </TabsContent>
        <TabsContent value="permissions">
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Read-only view. Capability keys are shown only as technical
              details.
            </p>
            {(roles.data ?? []).map((r) => (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle>{r.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{r.description}</p>
                  <div className="grid md:grid-cols-2 gap-2 mt-3">
                    {r.capabilities.map((k) => {
                      const cap = capabilities.data?.find((c) => c.key === k);
                      return (
                        <div key={k}>
                          <b>{cap?.description || pretty(k)}</b>
                          <span className="block text-xs text-muted-foreground">
                            {k} · Server capability control · ADMIN/OWNER bypass
                            applies in central middleware; formal authorization
                            may also be required.
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="conflicts">
          <Card>
            <CardHeader>
              <CardTitle>Advisory findings</CardTitle>
            </CardHeader>
            <CardContent>
              {findings.length ? (
                findings.map((f, i) => (
                  <div key={`${f.employee.id}-${i}`} className="border-b py-3">
                    <Badge variant="outline">{f.code}</Badge>
                    <b className="ml-2">{f.employee.name}</b>
                    <p>{f.detail}</p>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm">
                        Review
                      </Button>
                      <Button variant="outline" size="sm">
                        Export
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Records review acknowledgement only; does not correct or change access"
                      >
                        Mark reviewed
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p>
                  {availability.employees
                    ? 'No locally derived findings. This does not prove production access is fully documented.'
                    : 'Not available'}
                </p>
              )}
              <p className="mt-4 text-muted-foreground">
                All findings are advisory. Review actions do not alter access or
                claim correction.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Authorization and assignment history</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.auditHistory?.length ? (
                data.auditHistory.map((e: any, i: number) => (
                  <div key={i} className="border-b py-2">
                    {e.event_type} · authorization {e.authorization_id} ·
                    revision {e.revision} ·{' '}
                    {new Date(e.occurred_at).toLocaleString()}
                  </div>
                ))
              ) : (
                <p>
                  {availability.auditHistory
                    ? 'No authorization history recorded. Role, override, scope and project-assignment history may not exist in a unified immutable ledger; current state is not presented as history.'
                    : 'Not available'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

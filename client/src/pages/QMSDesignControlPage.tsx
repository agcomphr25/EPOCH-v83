import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { DesignControlWorkspace } from '@/features/design-control/DesignControlWorkspace';
import { usePermissions } from '@/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type OversightProject = {
  projectId: string;
  projectName: string;
  engineer: string;
  projectStatus: string;
  recordId: string | null;
  recordNumber: string | null;
  recordTitle: string | null;
  designControlStatus: string | null;
  authorityStatus: string | null;
  revision: number | null;
  releasedAt: string | null;
  completedSteps: number;
  blockedSteps: number;
  requiresInitialization: boolean;
};

type OversightResponse = {
  page: number;
  pageSize: number;
  total: number;
  projects: OversightProject[];
  bounded: boolean;
};

function statusText(value?: string | null) {
  return (value || 'not initialized').replaceAll('_', ' ');
}

export default function QMSDesignControlPage() {
  const initial = useMemo(
    () => new URLSearchParams(window.location.search),
    []
  );
  const [search, setSearch] = useState(initial.get('search') || '');
  const [status, setStatus] = useState(initial.get('status') || 'all');
  const [authority, setAuthority] = useState(initial.get('authority') || 'all');
  const [page, setPage] = useState(
    Math.max(1, Number(initial.get('page')) || 1)
  );
  const [selectedProject, setSelectedProject] = useState(
    initial.get('project') || ''
  );
  const [selectedRecord, setSelectedRecord] = useState(
    initial.get('record') || ''
  );
  const { can } = usePermissions();
  const canAudit = can('qms.audit_readiness.view');
  const [auditorMode, setAuditorMode] = useState(
    canAudit && initial.get('mode') === 'auditor'
  );

  const oversight = useQuery<OversightResponse>({
    queryKey: [
      '/api/qms/design-control/oversight/projects',
      page,
      search,
      status,
      authority,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
      });
      if (search) params.set('search', search);
      if (status !== 'all') params.set('status', status);
      if (authority !== 'all') params.set('authority', authority);
      const response = await fetch(
        `/api/qms/design-control/oversight/projects?${params}`,
        { credentials: 'include' }
      );
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'You are not authorized to view Design Control oversight.'
            : 'Unable to load oversight data.'
        );
      return response.json();
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    if (search) url.searchParams.set('search', search);
    else url.searchParams.delete('search');
    if (status !== 'all') url.searchParams.set('status', status);
    else url.searchParams.delete('status');
    if (authority !== 'all') url.searchParams.set('authority', authority);
    else url.searchParams.delete('authority');
    url.searchParams.set('page', String(page));
    if (selectedProject) url.searchParams.set('project', selectedProject);
    if (selectedRecord) url.searchParams.set('record', selectedRecord);
    if (auditorMode) url.searchParams.set('mode', 'auditor');
    else url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);
  }, [
    authority,
    auditorMode,
    page,
    search,
    selectedProject,
    selectedRecord,
    status,
  ]);

  const rows = oversight.data?.projects || [];
  const initialized = rows.filter((row) => !row.requiresInitialization).length;
  const blocked = rows.filter((row) => row.blockedSteps > 0).length;
  const released = rows.filter((row) => Boolean(row.releasedAt)).length;
  const totalPages = Math.max(
    1,
    Math.ceil((oversight.data?.total || 0) / (oversight.data?.pageSize || 20))
  );

  return (
    <main className="container mx-auto space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">QMS Design Control Oversight</h1>
        <p className="mt-1 text-muted-foreground">
          Company-wide search, exceptions, and audit readiness for authoritative
          R&amp;D Design Projects.
        </p>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Oversight summary"
      >
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projects in result set</CardDescription>
            <CardTitle>{oversight.data?.total || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Initialized on this page</CardDescription>
            <CardTitle>{initialized}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Blocked on this page</CardDescription>
            <CardTitle>{blocked}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Released on this page</CardDescription>
            <CardTitle>{released}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Find Design Projects</CardTitle>
          <CardDescription>
            Filtering and pagination are performed by the server; no
            company-wide history is loaded into the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Label>
            Project, record, or engineer
            <div className="relative mt-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
          </Label>
          <Label>
            Lifecycle status
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="released">Released</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </Label>
          <Label>
            Authority state
            <Select
              value={authority}
              onValueChange={(value) => {
                setAuthority(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All authority states</SelectItem>
                <SelectItem value="authoritative">Authoritative</SelectItem>
                <SelectItem value="legacy">Legacy / reconciliation</SelectItem>
                <SelectItem value="superseded">Superseded</SelectItem>
              </SelectContent>
            </Select>
          </Label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {oversight.isLoading ? (
            <p role="status">Loading bounded oversight results…</p>
          ) : oversight.isError ? (
            <div role="alert">
              <p className="font-medium">Oversight could not be loaded.</p>
              <p className="text-sm text-muted-foreground">
                {(oversight.error as Error).message}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => oversight.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Design Projects match these filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Design Project</TableHead>
                    <TableHead>Engineer</TableHead>
                    <TableHead>Record / revision</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>
                      <span className="sr-only">Open</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.projectId}>
                      <TableCell>
                        <div className="font-medium">{row.projectName}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.projectId}
                        </div>
                      </TableCell>
                      <TableCell>{row.engineer || 'Unassigned'}</TableCell>
                      <TableCell>
                        {row.recordNumber || 'Not initialized'}
                        {row.revision ? ` · Rev ${row.revision}` : ''}
                      </TableCell>
                      <TableCell>
                        {row.completedSteps}/12 complete
                        {row.blockedSteps
                          ? ` · ${row.blockedSteps} blocked`
                          : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {statusText(row.designControlStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!row.recordId}
                          onClick={() => {
                            setSelectedProject(row.projectId);
                            setSelectedRecord(row.recordId || '');
                          }}
                        >
                          {row.recordId
                            ? 'Open workspace'
                            : 'Needs initialization'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedProject && selectedRecord ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
            <div>
              <h2 className="font-semibold">
                Selected authoritative workspace
              </h2>
              <p className="text-sm text-muted-foreground">
                Project {selectedProject} · record {selectedRecord}
              </p>
            </div>
            {canAudit ? (
              <Label className="flex items-center gap-2">
                <Switch
                  checked={auditorMode}
                  onCheckedChange={setAuditorMode}
                />
                Auditor read-only mode
              </Label>
            ) : (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                Auditor mode requires audit-readiness view capability.
              </span>
            )}
          </div>
          <DesignControlWorkspace
            projectId={selectedProject}
            recordId={selectedRecord}
            mode={auditorMode ? 'auditor' : 'oversight'}
          />
        </section>
      ) : (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">
          <ShieldCheck className="mb-2 h-5 w-5" />
          Select an initialized authoritative project to inspect its shared
          workspace.
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-4 w-4" />
        Statuses are reported as recorded: verified, incomplete,
        legacy-unverified, and not-applicable are not collapsed into a generic
        compliance claim.
      </p>
    </main>
  );
}

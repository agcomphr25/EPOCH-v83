import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  History,
  Lock,
  Plus,
  ShieldCheck,
} from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';

type Package = {
  id: string;
  package_number: string;
  title: string;
  system_name: string;
  validation_type: string;
  status: string;
  production_version: string;
  commit_or_release_identifier?: string;
  validation_environment: string;
  production_deployment_date?: string;
  production_environment_reference: string;
  environment_differences?: string;
  notes?: string;
  row_version: number;
  software_owner_employee_id?: number;
  quality_owner_employee_id?: number;
  validation_lead_employee_id?: number;
  audit_readiness_assessment_id?: string;
  deployment_date_confirmed?: boolean;
  environment_separation_confirmed?: boolean;
  planned_start_date: string;
  planned_completion_date: string;
  locked_at?: string;
  requirement_count?: number;
  execution_count?: number;
  open_defect_count?: number;
};

const requestJson = <T,>(
  url: string,
  options?: Parameters<typeof apiRequest>[1]
) => apiRequest(url, options) as Promise<T>;
type Detail = {
  package: Package;
  intendedUse: any[];
  requirements: any[];
  risks: any[];
  plans: any[];
  protocols: any[];
  executions: any[];
  defects: any[];
  approvals: any[];
  periodicReviews: any[];
  events: any[];
  readiness: Record<string, any> & { ready: boolean; blockers: string[] };
  packageReadiness: {
    items: Array<{
      key: string;
      label: string;
      state: string;
      field: string;
      message?: string;
    }>;
    executionReady: boolean;
    blockers: any[];
  };
};
type Employee = { id: number; name: string };
type Assessment = { id: string; assessment_number: string; title: string };
const sections = [
  ['01', 'Intended Use', 'Controlled scope and dual authenticated approval'],
  [
    '02',
    'Software Requirements',
    'Normalized, revision-controlled requirements baseline',
  ],
  [
    '03',
    'Software Risk Assessment',
    'Requirement-linked risk and mitigation register',
  ],
  ['04', 'Validation Plan', 'Approved plan required before formal execution'],
  [
    '05',
    'Test Protocols',
    'Revision-controlled protocols, steps, requirements and risks',
  ],
  [
    '06',
    'Test Execution and Evidence',
    'Server-derived results and independent review',
  ],
  [
    '07',
    'Defects and Corrections',
    'Controlled defects, containment, correction and retest',
  ],
  ['08', 'Validation Summary', 'Server-calculated authoritative readiness'],
  [
    '09',
    'Production Approval',
    'Authenticated approval and immutable final snapshot',
  ],
  ['10', 'Periodic Review', 'Change review and revalidation decision'],
] as const;
const pretty = (v: string) =>
  v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const tone = (v: string) =>
  v.includes('APPROVED') || v === 'PASSED' || v === 'CLOSED'
    ? 'bg-emerald-100 text-emerald-800'
    : v.includes('BLOCK') || v.includes('REJECT') || v === 'FAILED'
      ? 'bg-red-100 text-red-800'
      : 'bg-amber-100 text-amber-900';

export default function EpochSoftwareValidationPage() {
  const [selected, setSelected] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [auditor, setAuditor] = useState(false);
  const [activeSection, setActiveSection] = useState('01');
  const [createRecovery, setCreateRecovery] = useState<Package>();
  const createSubmission = useRef<string | null>(null);
  const qc = useQueryClient(),
    { toast } = useToast();
  const list = useQuery<Package[]>({
    queryKey: ['/api/qms/epoch-software-validation'],
    queryFn: () => requestJson<Package[]>('/api/qms/epoch-software-validation'),
  });
  const detail = useQuery<Detail>({
    queryKey: ['/api/qms/epoch-software-validation', selected],
    enabled: Boolean(selected),
    queryFn: () =>
      requestJson<Detail>(`/api/qms/epoch-software-validation/${selected}`),
  });
  const employees = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: () => requestJson<Employee[]>('/api/employees'),
  });
  const assessments = useQuery<Assessment[]>({
    queryKey: ['/api/qms/as9100-audit-readiness'],
    queryFn: () => requestJson<Assessment[]>('/api/qms/as9100-audit-readiness'),
  });
  const refreshCreatedPackage = async (created: Package) => {
    try {
      await qc.invalidateQueries(
        { queryKey: ['/api/qms/epoch-software-validation'] },
        { throwOnError: true }
      );
      setSelected(created.id);
      setCreateRecovery(undefined);
      createSubmission.current = null;
      toast({
        title: 'Package list refreshed',
        description: `${created.package_number} is open.`,
      });
    } catch (error) {
      toast({
        title: 'Package list refresh failed',
        description:
          error instanceof Error
            ? error.message
            : 'Refresh the package list before trying again.',
        variant: 'destructive',
      });
    }
  };
  const create = useMutation({
    retry: false,
    mutationFn: async (input: {
      body: Record<string, string>;
      idempotencyKey: string;
    }) => {
      return requestJson<Package>('/api/qms/epoch-software-validation', {
        method: 'POST',
        body: input.body,
        headers: { 'Idempotency-Key': input.idempotencyKey },
      });
    },
    onSuccess: async (p: Package) => {
      setCreateOpen(false);
      setSelected(p.id);
      toast({
        title: 'Controlled draft created successfully.',
        description: p.package_number,
      });
      try {
        await qc.invalidateQueries(
          { queryKey: ['/api/qms/epoch-software-validation'] },
          { throwOnError: true }
        );
        createSubmission.current = null;
      } catch {
        setCreateRecovery(p);
        toast({
          title: 'Draft created; refresh needed',
          description:
            'The draft was created, but EPOCH could not refresh the screen. Refresh the package list before trying again.',
          variant: 'destructive',
          action: (
            <ToastAction
              altText="Refresh package list"
              onClick={() => void refreshCreatedPackage(p)}
            >
              Refresh package list
            </ToastAction>
          ),
        });
      }
    },
    onError: (e: Error) => {
      createSubmission.current = null;
      toast({
        title: 'Package was not created',
        description: e.message,
        variant: 'destructive',
      });
    },
  });
  const submitCreate = (form: HTMLFormElement) => {
    if (createSubmission.current) return;
    const idempotencyKey = crypto.randomUUID();
    const body = Object.fromEntries(new FormData(form).entries()) as Record<
      string,
      string
    >;
    for (const field of [
      'commitOrReleaseIdentifier',
      'productionDeploymentDate',
      'previousApprovedPackageId',
      'auditReadinessAssessmentId',
      'notes',
    ]) {
      if (!body[field]?.trim()) delete body[field];
    }
    createSubmission.current = idempotencyKey;
    create.mutate({
      body,
      idempotencyKey,
    });
  };
  const refresh = () =>
    qc.invalidateQueries({
      queryKey: ['/api/qms/epoch-software-validation', selected],
    });
  const edit = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const f = new FormData(form),
        num = (name: string) => {
          const value = f.get(name);
          return value && value !== 'NONE' ? Number(value) : null;
        };
      const assessment = f.get('auditReadinessAssessmentId');
      return requestJson<Package>(
        `/api/qms/epoch-software-validation/${selected}`,
        {
          method: 'PATCH',
          body: {
            rowVersion: detail.data!.package.row_version,
            commitOrReleaseIdentifier:
              f.get('commitOrReleaseIdentifier') || null,
            productionDeploymentDate: f.get('productionDeploymentDate') || null,
            validationEnvironment: f.get('validationEnvironment'),
            productionEnvironmentReference: f.get(
              'productionEnvironmentReference'
            ),
            environmentDifferences: f.get('environmentDifferences') || null,
            softwareOwnerEmployeeId: num('softwareOwnerEmployeeId'),
            qualityOwnerEmployeeId: num('qualityOwnerEmployeeId'),
            validationLeadEmployeeId: num('validationLeadEmployeeId'),
            auditReadinessAssessmentId:
              assessment === 'NONE' || assessment === null
                ? null
                : String(assessment),
            notes: f.get('notes') || null,
          },
        }
      );
    },
    onSuccess: () => {
      refresh();
      setEditOpen(false);
      toast({ title: 'Controlled package fields updated' });
    },
    onError: (e: Error) =>
      toast({
        title: 'Package update blocked',
        description: e.message,
        variant: 'destructive',
      }),
  });
  const confirm = useMutation({
    mutationFn: async (kind: 'deployment-date' | 'environment-separation') =>
      requestJson<Package>(
        `/api/qms/epoch-software-validation/${selected}/confirm-${kind}`,
        { method: 'POST', body: {} }
      ),
    onSuccess: () => {
      refresh();
      toast({ title: 'Authenticated confirmation recorded' });
    },
    onError: (e: Error) =>
      toast({
        title: 'Confirmation blocked',
        description: e.message,
        variant: 'destructive',
      }),
  });
  const progress = useMemo(() => {
    const d = detail.data;
    if (!d) return 0;
    let complete = 0;
    if (d.readiness.intendedUseApproved) complete++;
    if (d.readiness.requirementsBaselineApproved) complete++;
    if (d.readiness.riskAssessmentApproved) complete++;
    if (d.readiness.validationPlanApproved) complete++;
    if (d.protocols.length && d.protocols.every((x) => x.status === 'APPROVED'))
      complete++;
    if (
      d.executions.length &&
      d.executions.every((x) =>
        ['PASSED', 'PASSED_WITH_APPROVED_DEVIATION'].includes(x.overall_result)
      )
    )
      complete++;
    if (!d.readiness.openCriticalDefects && !d.readiness.openHighDefects)
      complete++;
    if (d.readiness.ready) complete += 2;
    if (d.periodicReviews.length) complete++;
    return complete * 10;
  }, [detail.data]);

  if (selected && detail.data) {
    const d = detail.data,
      p = d.package,
      locked = Boolean(p.locked_at) || p.status.startsWith('APPROVED');
    return (
      <div className="container mx-auto space-y-5 p-4 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Button
              variant="ghost"
              className="px-0"
              onClick={() => setSelected(undefined)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Validation packages
            </Button>
            <h1 className="text-2xl font-bold">
              {p.package_number} · {p.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              EPOCH {p.production_version} · {pretty(p.validation_type)} ·{' '}
              {p.validation_environment}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit package readiness
            </Button>
            <Button
              variant={auditor ? 'default' : 'outline'}
              onClick={() => setAuditor((v) => !v)}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Auditor View
            </Button>
            <ExportMenu id={p.id} />
          </div>
        </div>
        <div
          className={`rounded-md border p-3 text-sm font-semibold ${locked ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-amber-400 bg-amber-50 text-amber-900'}`}
        >
          {locked ? (
            <>
              <Lock className="mr-2 inline h-4 w-4" />
              CONTROLLED EPOCH SOFTWARE VALIDATION RECORD
            </>
          ) : (
            'DRAFT — NOT APPROVED FOR INTENDED USE'
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric
            label="Workflow progress"
            value={`${progress}%`}
            ok={progress === 100}
          />
          <Metric
            label="Requirements"
            value={String(d.requirements.length)}
            ok={d.readiness.requirementsBaselineApproved}
          />
          <Metric
            label="Tests passed"
            value={String(
              d.executions.filter((x) => x.overall_result === 'PASSED').length
            )}
            ok={d.readiness.criticalTestsPassed === d.readiness.criticalTests}
          />
          <Metric
            label="Critical defects"
            value={String(d.readiness.openCriticalDefects || 0)}
            danger={Boolean(d.readiness.openCriticalDefects)}
          />
          <Metric
            label="Overall readiness"
            value={d.readiness.ready ? 'Ready' : 'Blocked'}
            ok={d.readiness.ready}
            danger={!d.readiness.ready}
          />
        </div>
        <Progress value={progress} />
        <Card
          id="package-readiness"
          className={
            d.packageReadiness.executionReady
              ? 'border-emerald-300'
              : 'border-amber-300'
          }
        >
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>Package readiness</span>
              <Badge
                className={
                  d.packageReadiness.executionReady
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }
              >
                {d.packageReadiness.executionReady
                  ? 'Execution ready'
                  : 'Action required'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {d.packageReadiness.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setEditOpen(true)}
                className="flex items-start justify-between gap-3 rounded-md border p-3 text-left hover:bg-muted"
              >
                <span>
                  <span className="block text-sm font-medium">
                    {item.label}
                  </span>
                  {item.message && (
                    <span className="text-xs text-muted-foreground">
                      {item.message}
                    </span>
                  )}
                </span>
                <Badge variant="outline">{pretty(item.state)}</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
        {!d.readiness.ready && (
          <Card className="border-red-300">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-800">
                <AlertTriangle className="h-4 w-4" />
                Readiness blockers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {d.readiness.blockers.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <div className="grid gap-4 lg:grid-cols-[310px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                10 validation sections
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sections.map(([key, title, description]) => (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  className={`w-full rounded-md border p-3 text-left ${activeSection === key ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                >
                  <div className="font-medium">
                    {key}. {title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {description}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          <SectionWorkspace
            section={activeSection}
            detail={d}
            auditor={auditor}
          />
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit package readiness</DialogTitle>
              <DialogDescription>
                Complete controlled metadata for the exact production
                deployment. Saving does not record either authenticated
                confirmation.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                edit.mutate(e.currentTarget);
              }}
            >
              <div>
                <Field
                  name="commitOrReleaseIdentifier"
                  label="Production commit SHA, release tag, or deployment identifier"
                  defaultValue={p.commit_or_release_identifier || ''}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the exact deployed commit SHA, release tag, or
                  deployment ID. A PR number alone is not sufficient.
                </p>
              </div>
              <Field
                name="productionDeploymentDate"
                label="Production deployment date"
                type="date"
                defaultValue={p.production_deployment_date?.slice(0, 10) || ''}
              />
              <EmployeePick
                name="softwareOwnerEmployeeId"
                label="Software owner"
                value={p.software_owner_employee_id}
                employees={employees.data || []}
              />
              <EmployeePick
                name="qualityOwnerEmployeeId"
                label="Quality owner"
                value={p.quality_owner_employee_id}
                employees={employees.data || []}
              />
              <EmployeePick
                name="validationLeadEmployeeId"
                label="Validation lead"
                value={p.validation_lead_employee_id}
                employees={employees.data || []}
              />
              <div>
                <Label>Audit readiness assessment</Label>
                <Select
                  name="auditReadinessAssessmentId"
                  defaultValue={p.audit_readiness_assessment_id || 'NONE'}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Not linked</SelectItem>
                    {assessments.data?.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.assessment_number} · {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field
                name="validationEnvironment"
                label="Validation environment reference"
                defaultValue={p.validation_environment || ''}
              />
              <Field
                name="productionEnvironmentReference"
                label="Production environment reference"
                defaultValue={p.production_environment_reference || ''}
              />
              <div className="md:col-span-2">
                <Label>Validation-to-production environment differences</Label>
                <Textarea
                  name="environmentDifferences"
                  defaultValue={p.environment_differences || ''}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Package notes</Label>
                <Textarea
                  name="notes"
                  defaultValue={p.notes || ''}
                  placeholder="Describe package-specific validation context; replace generic placeholder text."
                />
              </div>
              <DialogFooter className="md:col-span-2">
                <Button type="submit" disabled={edit.isPending}>
                  Save controlled fields
                </Button>
              </DialogFooter>
            </form>
            <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={confirm.isPending || !p.production_deployment_date}
                  onClick={() => confirm.mutate('deployment-date')}
                >
                  Confirm deployment date
                </Button>
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={confirm.isPending || !p.environment_differences}
                  onClick={() => confirm.mutate('environment-separation')}
                >
                  Confirm environment separation
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {auditor && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Immutable audit history
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        {new Date(e.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{pretty(e.action)}</TableCell>
                      <TableCell>
                        {e.actor_display_name} · {e.actor_role}
                      </TableCell>
                      <TableCell>{e.reason || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-5 p-4 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">EPOCH Software Validation</h1>
          <p className="text-muted-foreground">
            Objective evidence that EPOCH is suitable for its approved,
            documented QMS intended use.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={Boolean(createRecovery)}>
              <Plus className="mr-2 h-4 w-4" />
              New validation package
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Create EPOCH Software Validation Package
              </DialogTitle>
              <DialogDescription>
                Create a controlled draft. Production evidence and authenticated
                confirmations are completed after creation.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitCreate(e.currentTarget);
              }}
            >
              <Field name="title" label="Package title" required />
              <Field
                name="systemName"
                label="System name"
                defaultValue="EPOCH"
                required
              />
              <Pick
                name="validationType"
                label="Validation type"
                values={[
                  'INITIAL_INTENDED_USE',
                  'MAJOR_RELEASE',
                  'CRITICAL_CHANGE',
                  'DATABASE_MIGRATION',
                  'SECURITY_ACCESS_CONTROL',
                  'BACKUP_RECOVERY',
                  'PERIODIC_REVIEW',
                  'PRE_AUDIT_REVALIDATION',
                  'CORRECTIVE_REVALIDATION',
                ]}
              />
              <Field
                name="productionVersion"
                label="Production version being validated"
                required
              />
              <div>
                <Field
                  name="commitOrReleaseIdentifier"
                  label="Production commit SHA, release tag, or deployment identifier"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the exact deployed commit SHA, release tag, or
                  deployment ID. A PR number alone is not sufficient.
                </p>
              </div>
              <Field
                name="productionDeploymentDate"
                label="Production deployment date"
                type="date"
              />
              <Field
                name="validationEnvironment"
                label="Validation environment"
                required
              />
              <Field
                name="productionEnvironmentReference"
                label="Production environment reference"
                required
              />
              <Field
                name="databaseProvider"
                label="Database type/provider"
                required
              />
              <Field name="hostingProvider" label="Hosting provider" required />
              <Field
                name="plannedStartDate"
                label="Planned start"
                type="date"
                required
              />
              <Field
                name="plannedCompletionDate"
                label="Planned completion"
                type="date"
                required
              />
              <div className="md:col-span-2">
                <Label>Reason for validation</Label>
                <Textarea name="reasonForValidation" required />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Textarea name="notes" />
              </div>
              <DialogFooter className="md:col-span-2">
                <Button
                  type="submit"
                  disabled={
                    create.isPending || Boolean(createSubmission.current)
                  }
                >
                  {create.isPending || createSubmission.current
                    ? 'Creating package\u2026'
                    : 'Create controlled draft'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {createRecovery && (
        <Card className="border-amber-300">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <div>
              <p className="font-medium">
                {createRecovery.package_number} was created.
              </p>
              <p className="text-sm text-muted-foreground">
                Refresh the package list before creating another package.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshCreatedPackage(createRecovery)}
            >
              Refresh package list
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          This workflow does not assert that AS9100 requires a commercial ERP or
          a named validation format. It preserves objective evidence for EPOCH's
          defined QMS intended use.
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.data?.map((p) => (
          <Card
            key={p.id}
            className="cursor-pointer hover:border-primary"
            onClick={() => setSelected(p.id)}
          >
            <CardHeader>
              <div className="flex justify-between gap-2">
                <CardTitle className="text-lg">{p.package_number}</CardTitle>
                <Badge className={tone(p.status)}>{pretty(p.status)}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="font-semibold">{p.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                EPOCH {p.production_version} · {pretty(p.validation_type)}
              </p>
              <div className="mt-4 grid grid-cols-3 text-center text-xs">
                <div>
                  {p.requirement_count || 0}
                  <br />
                  requirements
                </div>
                <div>
                  {p.execution_count || 0}
                  <br />
                  executions
                </div>
                <div>
                  {p.open_defect_count || 0}
                  <br />
                  open defects
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!list.isLoading && !list.data?.length && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No validation package exists. Create the first controlled draft
            package.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SectionWorkspace({
  section,
  detail: d,
  auditor: _auditor,
}: {
  section: string;
  detail: Detail;
  auditor: boolean;
}) {
  const title = sections.find((x) => x[0] === section)?.[1] || 'Validation';
  const header = (
    <CardHeader>
      <CardTitle>
        {section}. {title}
      </CardTitle>
    </CardHeader>
  );
  if (section === '01')
    return (
      <Card>
        {header}
        <CardContent>
          {d.intendedUse.length ? (
            <RecordView record={d.intendedUse[0]} />
          ) : (
            <Empty text="No Intended Use revision has been authored." />
          )}
        </CardContent>
      </Card>
    );
  if (section === '02')
    return (
      <Register
        title={title}
        records={d.requirements}
        columns={[
          'requirement_id',
          'module',
          'category',
          'statement',
          'criticality',
          'status',
        ]}
      />
    );
  if (section === '03')
    return (
      <Register
        title={title}
        records={d.risks}
        columns={[
          'risk_id',
          'module',
          'failure_mode',
          'initial_risk_rating',
          'residual_risk',
          'status',
        ]}
      />
    );
  if (section === '04')
    return (
      <Card>
        {header}
        <CardContent>
          {d.plans.length ? (
            <RecordView record={d.plans[0]} />
          ) : (
            <Empty text="No Validation Plan revision exists." />
          )}
        </CardContent>
      </Card>
    );
  if (section === '05')
    return (
      <Register
        title={title}
        records={d.protocols}
        columns={[
          'test_id',
          'title',
          'module',
          'criticality',
          'revision',
          'status',
        ]}
      />
    );
  if (section === '06')
    return (
      <Register
        title={title}
        records={d.executions}
        columns={[
          'execution_id',
          'protocol_revision',
          'tester_display_name',
          'overall_result',
          'review_decision',
          'started_at',
        ]}
      />
    );
  if (section === '07')
    return (
      <Register
        title={title}
        records={d.defects}
        columns={[
          'defect_number',
          'module',
          'severity',
          'description',
          'retest_required',
          'status',
        ]}
      />
    );
  if (section === '08')
    return (
      <Card>
        {header}
        <CardContent>
          <RecordView record={d.readiness} />
        </CardContent>
      </Card>
    );
  if (section === '09')
    return (
      <Register
        title={title}
        records={d.approvals.filter((x) => x.record_type === 'FINAL')}
        columns={[
          'approval_role',
          'decision',
          'actor_display_name',
          'actor_role',
          'meaning',
          'decided_at',
          'status',
        ]}
      />
    );
  return (
    <Register
      title={title}
      records={d.periodicReviews}
      columns={[
        'review_date',
        'current_production_version',
        'revalidation_required',
        'revalidation_scope',
        'next_review_date',
        'status',
      ]}
    />
  );
}
function Register({
  title,
  records,
  columns,
}: {
  title: string;
  records: any[];
  columns: string[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {records.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{pretty(c)}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r, i) => (
                <TableRow key={r.id || i}>
                  {columns.map((c) => (
                    <TableCell key={c} className="max-w-sm">
                      {String(r[c] ?? '—')}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty text={`No ${title.toLowerCase()} records exist.`} />
        )}
      </CardContent>
    </Card>
  );
}
function RecordView({ record }: { record: Record<string, any> }) {
  return (
    <dl className="grid gap-3 md:grid-cols-2">
      {Object.entries(record)
        .filter(
          ([k]) =>
            ![
              'id',
              'package_id',
              'created_by_user_id',
              'updated_by_user_id',
            ].includes(k)
        )
        .map(([k, v]) => (
          <div key={k} className="rounded border p-2">
            <dt className="text-xs text-muted-foreground">{pretty(k)}</dt>
            <dd className="whitespace-pre-wrap text-sm">
              {Array.isArray(v)
                ? v.join(', ')
                : typeof v === 'object'
                  ? JSON.stringify(v)
                  : String(v ?? '—')}
            </dd>
          </div>
        ))}
    </dl>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      <FileCheck2 className="mx-auto mb-3 h-8 w-8" />
      {text}
    </div>
  );
}
function Metric({
  label,
  value,
  ok,
  danger,
}: {
  label: string;
  value: string;
  ok?: boolean;
  danger?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        {ok ? (
          <CheckCircle2 className="text-emerald-600" />
        ) : danger ? (
          <AlertTriangle className="text-red-600" />
        ) : (
          <FileCheck2 className="text-primary" />
        )}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function ExportMenu({ id }: { id: string }) {
  return (
    <Select
      onValueChange={(v) =>
        window.open(
          `/api/qms/epoch-software-validation/${id}/export?view=${v}`,
          '_blank'
        )
      }
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Export controlled report" />
      </SelectTrigger>
      <SelectContent>
        {[
          'validation-plan',
          'requirements-matrix',
          'risk-register',
          'test-protocols',
          'test-executions',
          'defects',
          'summary',
          'complete-package',
        ].map((v) => (
          <SelectItem key={v} value={v}>
            {pretty(v)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Field({
  name,
  label,
  type = 'text',
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
      />
    </div>
  );
}
function Pick({
  name,
  label,
  values,
}: {
  name: string;
  label: string;
  values: string[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select name={name} defaultValue={values[0]}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {pretty(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function EmployeePick({
  name,
  label,
  value,
  employees,
}: {
  name: string;
  label: string;
  value?: number;
  employees: Employee[];
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select name={name} defaultValue={value ? String(value) : 'NONE'}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="NONE">Not assigned</SelectItem>
          {employees.map((e) => (
            <SelectItem key={e.id} value={String(e.id)}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

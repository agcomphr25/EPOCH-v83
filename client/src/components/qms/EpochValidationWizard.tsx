import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Lock,
  Search,
  Users,
} from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type Employee = {
  id: number;
  name: string;
  department?: string;
  position?: string;
  is_active?: boolean;
};

type PackageRecord = Record<string, any> & {
  id: string;
  package_number: string;
  title: string;
  status: string;
  system_name: string;
  production_version: string;
  validation_type: string;
  planned_start_date: string;
  planned_completion_date: string;
  reason_for_validation: string;
  row_version: number;
};

type FunctionSelection = {
  function_key: string;
  usage_status: 'USED_FOR_QMS' | 'NOT_USED_FOR_QMS';
  use_description?: string | null;
  failure_effect?: string | null;
  critical_to_qms: boolean;
  not_used_explanation?: string | null;
};

type Responsibility = {
  id: string;
  responsibility_role: ResponsibilityRole;
  employee_id: number;
  employee_name: string;
  assignment_status: string;
  accepted_at?: string | null;
};

type ResponsibilityRole =
  | 'SOFTWARE_OWNER'
  | 'QUALITY_REVIEWER'
  | 'VALIDATION_COORDINATOR'
  | 'ADDITIONAL_TESTER'
  | 'FINAL_APPROVING_AUTHORITY';

type Detail = Record<string, any> & {
  package: PackageRecord;
  intendedUse: Array<Record<string, any>>;
  intendedUseFunctions: FunctionSelection[];
  responsibilities: Responsibility[];
  packageReadiness: {
    executionReady: boolean;
    blockers: string[];
    items: Array<{
      key: string;
      label: string;
      state: string;
      message?: string;
    }>;
  };
  readiness: Record<string, any>;
  risks: Array<Record<string, any>>;
  protocols: Array<Record<string, any>>;
  executions: Array<Record<string, any>>;
  defects: Array<Record<string, any>>;
};

type Props = {
  detail: Detail;
  employees: Employee[];
  onBack: () => void;
};

type SaveIntent = 'continue' | 'exit';
const stepFormId = (step: number) => `epoch-validation-step-${step}`;
const submittedIntent = (event: FormEvent<HTMLFormElement>) =>
  ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
    ?.value === 'exit'
    ? 'exit'
    : 'continue';

const requestJson = <T,>(
  url: string,
  options?: Parameters<typeof apiRequest>[1]
) => apiRequest(url, options) as Promise<T>;

const steps = [
  ['1', 'Setup', 'Define why this validation is being performed.'],
  ['2', 'Intended Use', 'Document the approved QMS uses in plain language.'],
  [
    '3',
    'Responsibilities',
    'Assign accountable employees and obtain acceptance.',
  ],
  ['4', 'Risk Review', 'Review risks generated from intended uses.'],
  ['5', 'Test Plan', 'Prepare and approve objective validation tests.'],
  ['6', 'Perform Tests', 'Execute approved tests and retain evidence.'],
  ['7', 'Resolve Issues', 'Control failures, deviations, and retesting.'],
  [
    '8',
    'Review & Approve',
    'Confirm readiness and record authorized decisions.',
  ],
  ['9', 'Auditor Package', 'Preview and print the retained evidence package.'],
] as const;

const epochFunctions = [
  'User login and account access',
  'Employee permissions and authorization',
  'Electronic approvals',
  'Audit history',
  'Controlled documents',
  'Receiving',
  'Inventory',
  'Material lot traceability and genealogy',
  'Work orders',
  'Routing',
  'Travelers',
  'Inspection and testing',
  'Final product release',
  'Nonconformance and corrective action',
  'Training and employee qualifications',
  'Design Control',
  'Engineering release and change control',
  'Record searching, retrieval, and export',
  'Backup, restoration, and outage continuity',
] as const;

const responsibilityDefinitions: Array<{
  role: ResponsibilityRole;
  label: string;
  help: string;
  multiple?: boolean;
}> = [
  {
    role: 'SOFTWARE_OWNER',
    label: 'Software owner',
    help: 'Accountable for the EPOCH system and technical coordination.',
  },
  {
    role: 'QUALITY_REVIEWER',
    label: 'Quality reviewer',
    help: 'Reviews QMS scope, risks, evidence, and validation conclusions.',
  },
  {
    role: 'VALIDATION_COORDINATOR',
    label: 'Validation coordinator',
    help: 'Coordinates the package, schedule, tests, and missing evidence.',
  },
  {
    role: 'ADDITIONAL_TESTER',
    label: 'Additional testers',
    help: 'Employees assigned to perform approved validation tests.',
    multiple: true,
  },
  {
    role: 'FINAL_APPROVING_AUTHORITY',
    label: 'Final approving authority',
    help: 'Authorized person responsible for the final validation decision.',
  },
];

const pretty = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function EpochValidationWizard({ detail, employees, onBack }: Props) {
  const p = detail.package;
  const qc = useQueryClient();
  const { toast } = useToast();
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.is_active !== false),
    [employees]
  );
  const setupComplete = Boolean(
    p.title &&
    p.reason_for_validation &&
    p.planned_start_date &&
    p.planned_completion_date
  );
  const intendedComplete = Boolean(
    detail.intendedUse.length && detail.intendedUseFunctions.length
  );
  const requiredRoles: ResponsibilityRole[] = [
    'SOFTWARE_OWNER',
    'QUALITY_REVIEWER',
    'VALIDATION_COORDINATOR',
    'FINAL_APPROVING_AUTHORITY',
  ];
  const responsibilitiesComplete = requiredRoles.every((role) =>
    detail.responsibilities.some(
      (item) =>
        item.responsibility_role === role &&
        item.assignment_status === 'ACCEPTED'
    )
  );
  const firstIncomplete = !setupComplete ? 1 : !intendedComplete ? 2 : 3;
  const [currentStep, setCurrentStep] = useState(firstIncomplete);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const implementedComplete = [
    setupComplete,
    intendedComplete,
    responsibilitiesComplete,
  ];
  const completion = Math.round(
    (implementedComplete.filter(Boolean).length / steps.length) * 100
  );
  const missingCount =
    Number(!setupComplete) +
    Number(!intendedComplete) +
    requiredRoles.filter(
      (role) =>
        !detail.responsibilities.some(
          (item) =>
            item.responsibility_role === role &&
            item.assignment_status === 'ACCEPTED'
        )
    ).length;

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({
        queryKey: ['/api/qms/epoch-software-validation', p.id],
      }),
      qc.invalidateQueries({
        queryKey: ['/api/qms/epoch-software-validation'],
      }),
    ]);
  };
  const navigate = (step: number) => {
    if (
      dirty &&
      !window.confirm(
        'You have unsaved changes. Leave this step without saving?'
      )
    )
      return;
    setDirty(false);
    setCurrentStep(step);
  };
  const finishSave = async (intent: SaveIntent, nextStep?: number) => {
    setDirty(false);
    let refreshed = true;
    try {
      await refresh();
    } catch {
      refreshed = false;
      toast({
        title: 'Draft saved, but the screen could not be refreshed.',
        description: 'Reopen the package to continue with current data.',
        variant: 'destructive',
      });
    }
    if (intent === 'exit') {
      toast({ title: 'Draft saved successfully.' });
      onBack();
    } else if (refreshed && nextStep) setCurrentStep(nextStep);
  };
  const submitCurrentStep = (intent: SaveIntent) => {
    if (saving) return;
    if (!dirty) {
      if (intent === 'exit') onBack();
      else if (currentStep < 3) setCurrentStep(currentStep + 1);
      return;
    }
    const form = document.getElementById(stepFormId(currentStep));
    const submitter = form?.querySelector<HTMLButtonElement>(
      `button[type="submit"][value="${intent}"]`
    );
    if (form instanceof HTMLFormElement && submitter)
      form.requestSubmit(submitter);
  };

  const nextAction = !setupComplete
    ? 'Complete Setup'
    : !intendedComplete
      ? 'Complete Intended Use'
      : !responsibilitiesComplete
        ? 'Assign and accept required responsibilities'
        : 'Phase 1 complete — Risk Review will be added in Phase 2';

  return (
    <div className="container mx-auto space-y-5 p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" className="px-0" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Validation packages
          </Button>
          <h1 className="text-2xl font-bold">
            {p.package_number} · {p.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            Objective evidence that EPOCH is suitable for the
            organization&apos;s approved QMS and manufacturing intended uses.
          </p>
        </div>
        <Badge variant={p.status === 'DRAFT' ? 'outline' : 'default'}>
          {pretty(p.status)}
        </Badge>
      </header>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Summary
            label="Current step"
            value={`${currentStep}. ${steps[currentStep - 1][1]}`}
          />
          <Summary label="Overall completion" value={`${completion}%`} />
          <Summary label="Incomplete items" value={String(missingCount)} />
          <Summary
            label="Planned completion"
            value={p.planned_completion_date || 'Not entered'}
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <div className="mb-2 flex justify-between text-sm">
              <span>Phase 1 workflow progress</span>
              <span>{completion}%</span>
            </div>
            <Progress value={completion} />
          </div>
          <div className="rounded-md bg-muted p-3 sm:col-span-2 lg:col-span-4">
            <span className="font-medium">Next required action: </span>
            {nextAction}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <nav aria-label="Validation wizard steps">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation workflow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {steps.map(([number, title, help], index) => {
                const available = index < 3;
                const done = implementedComplete[index] || false;
                return (
                  <button
                    key={number}
                    type="button"
                    disabled={!available}
                    aria-current={
                      currentStep === index + 1 ? 'step' : undefined
                    }
                    onClick={() => navigate(index + 1)}
                    className={`w-full rounded-md border p-3 text-left ${
                      currentStep === index + 1
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {number}. {title}
                      </span>
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : available ? (
                        <CircleDashed className="h-4 w-4 text-amber-600" />
                      ) : (
                        <Badge variant="outline">Not available yet</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{help}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </nav>

        <main>
          {currentStep === 1 && (
            <SetupStep
              detail={detail}
              onDirty={() => setDirty(true)}
              onSavingChange={setSaving}
              onSaved={(intent) => finishSave(intent, 2)}
            />
          )}
          {currentStep === 2 && (
            <IntendedUseStep
              detail={detail}
              onDirty={() => setDirty(true)}
              onSavingChange={setSaving}
              onSaved={(intent) => finishSave(intent, 3)}
            />
          )}
          {currentStep === 3 && (
            <ResponsibilitiesStep
              detail={detail}
              employees={activeEmployees}
              onDirty={() => setDirty(true)}
              onSavingChange={setSaving}
              onSaved={(intent) => finishSave(intent)}
            />
          )}
          {currentStep > 3 && <UnavailableStep step={currentStep} />}
        </main>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 py-3 backdrop-blur">
        <Button
          variant="outline"
          disabled={currentStep === 1 || saving}
          onClick={() => navigate(currentStep - 1)}
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Previous
        </Button>
        <div className="text-sm text-muted-foreground">
          {dirty ? 'Unsaved changes' : 'All changes saved'}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => submitCurrentStep('exit')}
          >
            {saving ? 'Saving…' : 'Save and exit'}
          </Button>
          <Button
            disabled={currentStep >= 3 || saving}
            onClick={() => submitCurrentStep('continue')}
          >
            Continue <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SetupStep({
  detail,
  onDirty,
  onSavingChange,
  onSaved,
}: {
  detail: Detail;
  onDirty: () => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: (intent: SaveIntent) => Promise<void>;
}) {
  const p = detail.package;
  const { toast } = useToast();
  const submissionGuard = useRef(false);
  const saveIntent = useRef<SaveIntent>('continue');
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      requestJson(`/api/qms/epoch-software-validation/${p.id}/wizard/setup`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: async () => {
      if (saveIntent.current === 'continue')
        toast({ title: 'Controlled draft saved' });
      await onSaved(saveIntent.current);
    },
    onError: (error: Error) =>
      toast({
        title: 'Setup could not be saved',
        description: error.message,
        variant: 'destructive',
      }),
    onSettled: () => {
      submissionGuard.current = false;
      onSavingChange(false);
    },
  });
  const technicalMissing =
    !p.commit_or_release_identifier || !p.production_deployment_date;
  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Setup</CardTitle>
        <p className="text-sm text-muted-foreground">
          Start with the purpose and schedule. An incomplete package remains a
          controlled DRAFT.
        </p>
      </CardHeader>
      <CardContent>
        {technicalMissing && (
          <div className="mb-4 flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Technical deployment information still needs confirmation before
            testing.
          </div>
        )}
        <form
          id={stepFormId(1)}
          className="grid gap-4 md:grid-cols-2"
          onChange={onDirty}
          onSubmit={(event) => {
            event.preventDefault();
            if (submissionGuard.current) return;
            submissionGuard.current = true;
            saveIntent.current = submittedIntent(event);
            onSavingChange(true);
            const form = new FormData(event.currentTarget);
            save.mutate({
              rowVersion: p.row_version,
              title: form.get('title'),
              reasonForValidation: form.get('reasonForValidation'),
              validationType: form.get('validationType'),
              plannedStartDate: form.get('plannedStartDate'),
              plannedCompletionDate: form.get('plannedCompletionDate'),
              commitOrReleaseIdentifier:
                form.get('commitOrReleaseIdentifier') || null,
              productionDeploymentDate:
                form.get('productionDeploymentDate') || null,
              validationEnvironment: form.get('validationEnvironment'),
              productionEnvironmentReference: form.get(
                'productionEnvironmentReference'
              ),
              environmentDifferences:
                form.get('environmentDifferences') || null,
            });
          }}
        >
          <Field
            name="title"
            label="Validation title"
            defaultValue={p.title}
            required
          />
          <SelectField
            name="validationType"
            label="Validation type"
            defaultValue={p.validation_type}
            options={[
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
          <div className="md:col-span-2">
            <Label htmlFor="reasonForValidation">
              Why are we validating EPOCH?
            </Label>
            <Textarea
              id="reasonForValidation"
              name="reasonForValidation"
              defaultValue={p.reason_for_validation}
              placeholder="Example: Validate the production release used for controlled receiving, traceability, approvals, and record retrieval."
              required
            />
          </div>
          <Field
            name="plannedStartDate"
            label="Planned start date"
            type="date"
            defaultValue={p.planned_start_date?.slice(0, 10)}
            required
          />
          <Field
            name="plannedCompletionDate"
            label="Planned completion date"
            type="date"
            defaultValue={p.planned_completion_date?.slice(0, 10)}
            required
          />
          <div className="rounded-md bg-muted p-3 text-sm md:col-span-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <span>
                <strong>System:</strong> {p.system_name}
              </span>
              <span>
                <strong>Package:</strong> {p.package_number}
              </span>
              <span>
                <strong>Creator:</strong> {p.created_by_display_name}
              </span>
              <span>
                <strong>Created:</strong> {p.created_at?.slice(0, 10)}
              </span>
              <span>
                <strong>Hosting:</strong> {p.hosting_provider}
              </span>
              <span>
                <strong>Database:</strong> {p.database_provider}
              </span>
            </div>
          </div>
          <details className="rounded-md border p-4 md:col-span-2">
            <summary className="cursor-pointer font-medium">
              Advanced technical details
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                name="commitOrReleaseIdentifier"
                label="Exact production commit SHA, release tag, or deployment ID"
                defaultValue={p.commit_or_release_identifier || ''}
              />
              <Field
                name="productionDeploymentDate"
                label="Production deployment date"
                type="date"
                defaultValue={p.production_deployment_date?.slice(0, 10) || ''}
              />
              <Field
                name="validationEnvironment"
                label="Validation environment"
                defaultValue={p.validation_environment}
                required
              />
              <Field
                name="productionEnvironmentReference"
                label="Production environment"
                defaultValue={p.production_environment_reference}
                required
              />
              <div className="md:col-span-2">
                <Label htmlFor="environmentDifferences">
                  Environment differences
                </Label>
                <Textarea
                  id="environmentDifferences"
                  name="environmentDifferences"
                  defaultValue={p.environment_differences || ''}
                />
              </div>
            </div>
          </details>
          <div className="md:col-span-2 flex justify-end">
            <Button
              type="submit"
              name="saveIntent"
              value="continue"
              disabled={save.isPending}
            >
              {save.isPending
                ? 'Saving…'
                : 'Save controlled draft and continue'}
            </Button>
            <button type="submit" name="saveIntent" value="exit" hidden />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function IntendedUseStep({
  detail,
  onDirty,
  onSavingChange,
  onSaved,
}: {
  detail: Detail;
  onDirty: () => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: (intent: SaveIntent) => Promise<void>;
}) {
  const p = detail.package;
  const prior = detail.intendedUse[0] || {};
  const { toast } = useToast();
  const submissionGuard = useRef(false);
  const saveIntent = useRef<SaveIntent>('continue');
  const [functions, setFunctions] = useState<Record<string, FunctionSelection>>(
    Object.fromEntries(
      detail.intendedUseFunctions.map((item) => [item.function_key, item])
    )
  );
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      requestJson(`/api/qms/epoch-software-validation/${p.id}/intended-use`, {
        method: 'POST',
        body,
      }),
    onSuccess: async () => {
      if (saveIntent.current === 'continue')
        toast({ title: 'Intended Use revision saved as DRAFT' });
      await onSaved(saveIntent.current);
    },
    onError: (error: Error) =>
      toast({
        title: 'Intended Use could not be saved',
        description: error.message,
        variant: 'destructive',
      }),
    onSettled: () => {
      submissionGuard.current = false;
      onSavingChange(false);
    },
  });
  const updateFunction = (key: string, patch: Partial<FunctionSelection>) => {
    onDirty();
    setFunctions((current) => {
      const existing = current[key];
      return {
        ...current,
        [key]: {
          ...existing,
          ...patch,
          function_key: existing?.function_key ?? key,
          usage_status:
            patch.usage_status ?? existing?.usage_status ?? 'USED_FOR_QMS',
          critical_to_qms:
            patch.critical_to_qms ?? existing?.critical_to_qms ?? false,
        },
      };
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>2. Intended Use</CardTitle>
        <p className="text-sm text-muted-foreground">
          Select only uses reviewed by the organization. Suggestions are not
          evidence until a user saves them.
        </p>
      </CardHeader>
      <CardContent>
        <form
          id={stepFormId(2)}
          className="space-y-5"
          onChange={onDirty}
          onSubmit={(event) => {
            event.preventDefault();
            if (submissionGuard.current) return;
            submissionGuard.current = true;
            saveIntent.current = submittedIntent(event);
            onSavingChange(true);
            const form = new FormData(event.currentTarget);
            save.mutate({
              systemName: p.system_name,
              epochVersion: p.production_version,
              productionEnvironment: p.production_environment_reference,
              softwareOwnerEmployeeId:
                p.software_owner_employee_id || undefined,
              qualityOwnerEmployeeId: p.quality_owner_employee_id || undefined,
              hostingProvider: p.hosting_provider,
              databaseProvider: p.database_provider,
              intendedUseStatement: form.get('intendedUseStatement'),
              qmsProcessesSupported: Object.keys(functions).join(', '),
              officialRecordsControlled: form.get('officialRecordsControlled'),
              userGroupsDepartments: form.get('userGroupsDepartments'),
              dataRetentionResponsibilities: form.get(
                'dataRetentionResponsibilities'
              ),
              backupResponsibilities: form.get('backupResponsibilities'),
              outsideProcessesRecords:
                form.get('outsideProcessesRecords') || undefined,
              interfacesDependencies:
                form.get('interfacesDependencies') || undefined,
              customerContractualRequirements:
                form.get('customerContractualRequirements') || undefined,
              complianceConsiderations:
                form.get('complianceConsiderations') || undefined,
              knownLimitations: form.get('knownLimitations') || undefined,
              excludedFunctionality:
                form.get('excludedFunctionality') || undefined,
              functions: Object.values(functions).map((item) => ({
                functionKey: item.function_key,
                usageStatus: item.usage_status,
                useDescription: item.use_description || undefined,
                failureEffect: item.failure_effect || undefined,
                criticalToQms: item.critical_to_qms,
                notUsedExplanation: item.not_used_explanation || undefined,
              })),
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              name="intendedUseStatement"
              label="How does the organization use EPOCH overall?"
              defaultValue={prior.intended_use_statement}
              placeholder="Describe the approved QMS and manufacturing purpose in plain language."
              required
            />
            <TextField
              name="officialRecordsControlled"
              label="Which official records are controlled in EPOCH?"
              defaultValue={prior.official_records_controlled}
              required
            />
            <TextField
              name="userGroupsDepartments"
              label="Which employee groups use these functions?"
              defaultValue={prior.user_groups_departments}
              required
            />
            <TextField
              name="dataRetentionResponsibilities"
              label="Who is responsible for record retention and retrieval?"
              defaultValue={prior.data_retention_responsibilities}
              required
            />
            <TextField
              name="backupResponsibilities"
              label="Who is responsible for backup and restoration?"
              defaultValue={prior.backup_responsibilities}
              required
            />
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold">EPOCH functions in scope</h3>
            {epochFunctions.map((label) => {
              const selected = functions[label];
              return (
                <div key={label} className="rounded-md border p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`function-${label}`}
                      checked={Boolean(selected)}
                      onCheckedChange={(checked) => {
                        onDirty();
                        if (!checked) {
                          setFunctions((current) => {
                            const next = { ...current };
                            delete next[label];
                            return next;
                          });
                          return;
                        }
                        updateFunction(label, {});
                      }}
                    />
                    <Label
                      htmlFor={`function-${label}`}
                      className="font-medium"
                    >
                      {label}
                    </Label>
                  </div>
                  {selected && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Select
                        value={selected.usage_status}
                        onValueChange={(value) =>
                          updateFunction(label, {
                            usage_status:
                              value as FunctionSelection['usage_status'],
                          })
                        }
                      >
                        <SelectTrigger aria-label={`${label} usage status`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USED_FOR_QMS">
                            Used for an approved QMS purpose
                          </SelectItem>
                          <SelectItem value="NOT_USED_FOR_QMS">
                            Not used for an approved QMS purpose
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {selected.usage_status === 'USED_FOR_QMS' ? (
                        <>
                          <Textarea
                            aria-label={`${label}: how the company uses this function`}
                            placeholder="How does the company use this function?"
                            value={selected.use_description || ''}
                            onChange={(event) =>
                              updateFunction(label, {
                                use_description: event.target.value,
                              })
                            }
                            required
                          />
                          <Textarea
                            aria-label={`${label}: failure effect`}
                            placeholder="What could happen if it did not work correctly?"
                            value={selected.failure_effect || ''}
                            onChange={(event) =>
                              updateFunction(label, {
                                failure_effect: event.target.value,
                              })
                            }
                            required
                          />
                          <label className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={selected.critical_to_qms}
                              onCheckedChange={(checked) =>
                                updateFunction(label, {
                                  critical_to_qms: Boolean(checked),
                                })
                              }
                            />
                            Critical to product quality, traceability, approval,
                            or record retention
                          </label>
                        </>
                      ) : (
                        <Textarea
                          className="md:col-span-2"
                          aria-label={`${label}: not used explanation`}
                          placeholder="Explain why this function is not used for an approved QMS purpose."
                          value={selected.not_used_explanation || ''}
                          onChange={(event) =>
                            updateFunction(label, {
                              not_used_explanation: event.target.value,
                            })
                          }
                          required
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <details className="rounded-md border p-4">
            <summary className="cursor-pointer font-medium">
              Additional scope details
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {[
                [
                  'outsideProcessesRecords',
                  'Processes or records outside EPOCH',
                ],
                ['interfacesDependencies', 'Interfaces and dependencies'],
                [
                  'customerContractualRequirements',
                  'Customer or contractual requirements',
                ],
                ['complianceConsiderations', 'Compliance considerations'],
                ['knownLimitations', 'Known limitations'],
                ['excludedFunctionality', 'Excluded functionality'],
              ].map(([name, label]) => (
                <TextField
                  key={name}
                  name={name}
                  label={label}
                  defaultValue={prior[snake(name)]}
                />
              ))}
            </div>
          </details>
          <div className="flex justify-end">
            <Button
              type="submit"
              name="saveIntent"
              value="continue"
              disabled={save.isPending || !Object.keys(functions).length}
            >
              {save.isPending ? 'Saving…' : 'Save Intended Use and continue'}
            </Button>
            <button type="submit" name="saveIntent" value="exit" hidden />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ResponsibilitiesStep({
  detail,
  employees,
  onDirty,
  onSavingChange,
  onSaved,
}: {
  detail: Detail;
  employees: Employee[];
  onDirty: () => void;
  onSavingChange: (saving: boolean) => void;
  onSaved: (intent: SaveIntent) => Promise<void>;
}) {
  const p = detail.package;
  const { toast } = useToast();
  const submissionGuard = useRef(false);
  const saveIntent = useRef<SaveIntent>('continue');
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>(
    {}
  );
  const currentUser = useQuery<{ employeeId?: number | null }>({
    queryKey: ['/api/auth/session'],
    queryFn: () => requestJson('/api/auth/session'),
  });
  const [assignments, setAssignments] = useState<
    Array<{ role: ResponsibilityRole; employeeId: number }>
  >(
    detail.responsibilities.map((item) => ({
      role: item.responsibility_role,
      employeeId: Number(item.employee_id),
    }))
  );
  const save = useMutation({
    mutationFn: () =>
      requestJson(
        `/api/qms/epoch-software-validation/${p.id}/responsibilities`,
        {
          method: 'PUT',
          body: { rowVersion: p.row_version, assignments },
        }
      ),
    onSuccess: async () => {
      if (saveIntent.current === 'continue')
        toast({
          title: 'Responsibilities saved',
          description: 'New assignments are awaiting acceptance.',
        });
      await onSaved(saveIntent.current);
    },
    onError: (error: Error) =>
      toast({
        title: 'Responsibilities could not be saved',
        description: error.message,
        variant: 'destructive',
      }),
    onSettled: () => {
      submissionGuard.current = false;
      onSavingChange(false);
    },
  });
  const decide = useMutation({
    mutationFn: (input: {
      assignmentId: string;
      decision: 'ACCEPTED' | 'DECLINED';
      reason?: string;
    }) =>
      requestJson(
        `/api/qms/epoch-software-validation/${p.id}/responsibilities/${input.assignmentId}/decision`,
        { method: 'POST', body: input }
      ),
    onSuccess: async (_result, input) => {
      toast({
        title:
          input.decision === 'ACCEPTED'
            ? 'Responsibility accepted'
            : 'Responsibility declined',
      });
      await onSaved('continue');
    },
    onError: (error: Error) =>
      toast({
        title: 'Responsibility decision blocked',
        description: error.message,
        variant: 'destructive',
      }),
  });
  const setSingle = (role: ResponsibilityRole, employeeId?: number) => {
    onDirty();
    setAssignments((current) => [
      ...current.filter((item) => item.role !== role),
      ...(employeeId ? [{ role, employeeId }] : []),
    ]);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          3. Responsibilities
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Assign active employees. Assignment does not imply acceptance; each
          assignee must accept with their own identity.
        </p>
      </CardHeader>
      <CardContent>
        <form
          id={stepFormId(3)}
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (submissionGuard.current) return;
            submissionGuard.current = true;
            saveIntent.current = submittedIntent(event);
            onSavingChange(true);
            save.mutate();
          }}
        >
          {responsibilityDefinitions.map((definition) => {
            const assigned = assignments.filter(
              (item) => item.role === definition.role
            );
            const records = detail.responsibilities.filter(
              (item) => item.responsibility_role === definition.role
            );
            return (
              <div key={definition.role} className="rounded-md border p-4">
                <div className="mb-3">
                  <h3 className="font-medium">{definition.label}</h3>
                  <p className="text-sm text-muted-foreground">
                    {definition.help}
                  </p>
                </div>
                <EmployeeSearch
                  employees={employees.filter(
                    (employee) =>
                      definition.multiple ||
                      !assignments.some(
                        (item) =>
                          item.role === definition.role &&
                          item.employeeId === employee.id
                      )
                  )}
                  value={
                    definition.multiple ? undefined : assigned[0]?.employeeId
                  }
                  onSelect={(employeeId) => {
                    if (definition.multiple) {
                      if (!employeeId) return;
                      onDirty();
                      setAssignments((current) => [
                        ...current,
                        { role: definition.role, employeeId },
                      ]);
                    } else setSingle(definition.role, employeeId);
                  }}
                />
                <div className="mt-3 space-y-2">
                  {assigned.map((assignment) => {
                    const employee = employees.find(
                      (item) => item.id === assignment.employeeId
                    );
                    const record = records.find(
                      (item) =>
                        Number(item.employee_id) === assignment.employeeId
                    );
                    return (
                      <div
                        key={`${definition.role}-${assignment.employeeId}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted p-2 text-sm"
                      >
                        <span>
                          {employee?.name ||
                            `Employee ${assignment.employeeId}`}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {record
                              ? pretty(record.assignment_status)
                              : 'Unsaved'}
                          </Badge>
                          {record?.assignment_status ===
                            'AWAITING_ACCEPTANCE' &&
                            Number(currentUser.data?.employeeId) ===
                              assignment.employeeId && (
                              <Button
                                size="sm"
                                type="button"
                                disabled={decide.isPending}
                                onClick={() =>
                                  decide.mutate({
                                    assignmentId: record.id,
                                    decision: 'ACCEPTED',
                                  })
                                }
                              >
                                Accept responsibility
                              </Button>
                            )}
                          {record?.assignment_status ===
                            'AWAITING_ACCEPTANCE' &&
                            Number(currentUser.data?.employeeId) ===
                              assignment.employeeId && (
                              <div className="flex items-center gap-2">
                                <Input
                                  aria-label={`Reason for declining ${definition.label}`}
                                  placeholder="Reason required to decline"
                                  value={declineReasons[record.id] || ''}
                                  onChange={(event) =>
                                    setDeclineReasons((current) => ({
                                      ...current,
                                      [record.id]: event.target.value,
                                    }))
                                  }
                                />
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  disabled={
                                    decide.isPending ||
                                    (declineReasons[record.id] || '').trim()
                                      .length < 10
                                  }
                                  onClick={() =>
                                    decide.mutate({
                                      assignmentId: record.id,
                                      decision: 'DECLINED',
                                      reason: declineReasons[record.id],
                                    })
                                  }
                                >
                                  Decline
                                </Button>
                              </div>
                            )}
                          <Button
                            size="sm"
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              onDirty();
                              setAssignments((current) =>
                                current.filter(
                                  (item) =>
                                    !(
                                      item.role === definition.role &&
                                      item.employeeId === assignment.employeeId
                                    )
                                )
                              );
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                  {!assigned.length && (
                    <p className="text-sm text-amber-700">Missing</p>
                  )}
                </div>
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button
              type="submit"
              name="saveIntent"
              value="continue"
              disabled={save.isPending}
            >
              {save.isPending ? 'Saving…' : 'Save responsibilities'}
            </Button>
            <button type="submit" name="saveIntent" value="exit" hidden />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function EmployeeSearch({
  employees,
  value,
  onSelect,
}: {
  employees: Employee[];
  value?: number;
  onSelect: (employeeId?: number) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = employees
    .filter((employee) =>
      `${employee.name} ${employee.department || ''} ${employee.position || ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
    .slice(0, 50);
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search active employees"
          className="pl-8"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search active employees"
        />
      </div>
      <select
        aria-label="Select active employee"
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={value || ''}
        onChange={(event) =>
          onSelect(event.target.value ? Number(event.target.value) : undefined)
        }
      >
        <option value="">Not assigned</option>
        {filtered.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
            {employee.department ? ` · ${employee.department}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function UnavailableStep({ step }: { step: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {step}. {steps[step - 1][1]}
        </CardTitle>
      </CardHeader>
      <CardContent className="py-12 text-center">
        <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Not available yet</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          This controlled step will be delivered in a later reviewable phase.
          Existing server-side readiness, execution, approval, and release gates
          remain active and fail closed.
        </p>
      </CardContent>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Field({
  name,
  label,
  type = 'text',
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
      />
    </div>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {pretty(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function snake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

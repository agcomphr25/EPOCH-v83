import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileArchive,
  FileCheck2,
  FileCog,
  FileText,
  Flag,
  GitBranch,
  History,
  ListChecks,
  Microscope,
  PackageCheck,
  Plus,
  Rocket,
  Route,
  ShieldCheck,
} from 'lucide-react';
import { DESIGN_CONTROL_WORKFLOW } from '@shared/designControlWorkflow';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { usePermissions } from '@/hooks/usePermissions';
import { ProjectFormInstancesPanel } from '@/components/design-control/ProjectFormInstancesPanel';
import { EngineeringChangeRequestRegister } from '@/components/design-control/EngineeringChangeRequestRegister';
import { EngineeringChangeNoticeWorkspace } from '@/components/design-control/EngineeringChangeNoticeWorkspace';

type StatusTone = 'draft' | 'active' | 'review' | 'approved' | 'blocked' | 'released';

type DesignProject = {
  id: string;
  name: string;
  owner: string;
  phase: string;
  status: StatusTone;
  readiness: number;
  nextGate: string;
};

type RegisterRow = {
  id: string;
  title: string;
  project: string;
  owner: string;
  status: StatusTone;
  evidence: string;
  due: string;
};

type RiskRow = RegisterRow & {
  severity: string;
  mitigation: string;
};

type ReleaseRow = RegisterRow & {
  wad: string;
  p2: string;
};

type WorkflowStatus = 'incomplete' | 'blocked' | 'needs_approval' | 'approved';

type DesignWorkflowStep = {
  id: string;
  title: string;
  purpose: string;
  fields: string[];
  checklist?: string[];
  approvals?: string[];
  examples?: string[];
};

type WorkflowStepData = {
  fields: Record<string, string>;
  checklist: Record<string, boolean>;
  approvals: Record<string, boolean>;
};

type DesignControlRecord = {
  id: string;
  recordNumber?: string | null;
  title: string;
  status: string;
  rdProjectId?: string | null;
  projectId?: string | null;
  productionWorkOrderId?: string | null;
  p2PurchaseOrderId?: number | null;
  metadata?: Record<string, unknown> | null;
};

type DesignControlStepRecord = {
  stepKey: string;
  title: string;
  status: string;
  formData?: Record<string, unknown> | null;
  checklist?: Record<string, unknown> | null;
  approvals?: Record<string, unknown> | null;
  attachments?: unknown[] | null;
  metadata?: Record<string, unknown> | null;
};

type ApprovalDecision = {
  id: string;
  approvalKey: string;
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
  actorDisplayNameSnapshot: string;
  actorRoleSnapshot: string;
  comment?: string | null;
  createdAt: string;
  status: string;
};

type StepApprovalState = {
  step: DesignControlStepRecord & {
    currentContentVersionId?: string | null;
    contentVersion?: number;
    status: string;
  };
  currentContentVersion: { id: string; contentVersion: number; contentChecksum: string; status: string } | null;
  versions: Array<{ id: string; contentVersion: number; contentChecksum: string; status: string; createdAt: string }>;
  approvals: ApprovalDecision[];
  approvalSlots: Array<{
    key: string;
    label: string;
    requiredCapability: string;
    signatureMeaning: string;
    status: 'APPROVED' | 'PENDING';
    decision: ApprovalDecision | null;
  }>;
  legacyEvidence: { provenance: string; values: Record<string, unknown>; satisfiesAuthenticatedGate: false };
};

type ManufacturingEvidenceStatus =
  | 'NOT_CONFIGURED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'NEEDS_REVIEW'
  | 'APPROVED'
  | 'RELEASED'
  | 'BLOCKED'
  | 'NOT_APPLICABLE';

type ManufacturingEvidenceSource = {
  key: string;
  label: string;
  sourceModule: string;
  managedBy: 'SOURCE_MODULE' | 'DESIGN_CONTROL';
  sourceAvailable: boolean;
  status: ManufacturingEvidenceStatus;
  ready: boolean;
  recordId?: string | null;
  revision?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  releasedBy?: string | null;
  releasedAt?: string | null;
  updatedAt?: string | null;
  openUrl?: string | null;
  explanation: string;
  missingItems: string[];
  applicability?: {
    applicable: boolean;
    justification?: string | null;
    approvedBy?: string | null;
    approvedRole?: string | null;
    approvedAt?: string | null;
    approved: boolean;
  };
};

type DesignManufacturingEvidence = {
  rdProjectId: string | null;
  designControlRecordId: string;
  overallStatus: ManufacturingEvidenceStatus;
  ready: boolean;
  missingItems: string[];
  sources: ManufacturingEvidenceSource[];
};

type DesignControlReadiness = {
  ready: boolean;
  missingItems: string[];
  sourceOfTruthPrinciple?: string;
  manufacturingEvidence?: DesignManufacturingEvidence | null;
  manufacturingSourceStatuses?: Array<{
    requirement: string;
    source: string;
    ready: boolean;
    status?: ManufacturingEvidenceStatus;
  }>;
  steps: Array<{ key: string; title: string; status: string }>;
};

type EngineeringReleasePreview = {
  ready: boolean;
  proposedReleaseNumber: string;
  proposedReleaseRevision: string;
  missingEvidence: string[];
  existingRelease?: {
    releaseNumber: string;
    releaseRevision: string;
    releaseStatus: string;
    releasedBy: string | null;
    releasedAt: string | null;
  } | null;
};

export const DESIGN_CONTROL_DEFAULT_TAB = 'projects';

export const lifecycleTabs = [
  { value: 'projects', label: 'Design Projects' },
  { value: 'overview', label: 'Overview' },
  { value: 'inputs', label: 'Inputs' },
  { value: 'outputs', label: 'Outputs' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'risks', label: 'Risks' },
  { value: 'verification', label: 'Verification' },
  { value: 'validation', label: 'Validation' },
  { value: 'changes', label: 'Engineering Changes' },
  { value: 'release', label: 'Release to Manufacturing' },
  { value: 'dhf', label: 'Design History File' },
];

const designProjects: DesignProject[] = [
  {
    id: 'DC-2026-018',
    name: 'Composite antenna fairing redesign',
    owner: 'Engineering',
    phase: 'Verification',
    status: 'review',
    readiness: 72,
    nextGate: 'Verification report approval',
  },
  {
    id: 'DC-2026-021',
    name: 'P2 mounting bracket light-weighting',
    owner: 'R&D',
    phase: 'Design Outputs',
    status: 'active',
    readiness: 48,
    nextGate: 'Drawing package review',
  },
  {
    id: 'DC-2026-024',
    name: 'Bond fixture process update',
    owner: 'Manufacturing Engineering',
    phase: 'Release',
    status: 'released',
    readiness: 94,
    nextGate: 'Manufacturing release packet',
  },
];

const inputs: RegisterRow[] = [
  {
    id: 'DI-1042',
    title: 'Customer envelope and interface requirements',
    project: 'Composite antenna fairing redesign',
    owner: 'Program Manager',
    status: 'approved',
    evidence: 'Customer spec, PO notes, RFQ risk review',
    due: '2026-07-17',
  },
  {
    id: 'DI-1048',
    title: 'Material compatibility and cure profile limits',
    project: 'Bond fixture process update',
    owner: 'Process Engineering',
    status: 'review',
    evidence: 'Material certs, process specification',
    due: '2026-07-22',
  },
  {
    id: 'DI-1051',
    title: 'Weight reduction target and load case assumptions',
    project: 'P2 mounting bracket light-weighting',
    owner: 'R&D',
    status: 'active',
    evidence: 'Design brief, preliminary stress notes',
    due: '2026-07-29',
  },
];

const outputs: RegisterRow[] = [
  {
    id: 'DO-2207',
    title: 'Released drawing package',
    project: 'Composite antenna fairing redesign',
    owner: 'Engineering',
    status: 'review',
    evidence: 'Drawing, BOM, tolerance notes',
    due: '2026-07-24',
  },
  {
    id: 'DO-2215',
    title: 'Manufacturing work instruction draft',
    project: 'Bond fixture process update',
    owner: 'Manufacturing Engineering',
    status: 'approved',
    evidence: 'WI draft, operator checklist',
    due: '2026-07-18',
  },
  {
    id: 'DO-2220',
    title: 'Inspection criteria and acceptance plan',
    project: 'P2 mounting bracket light-weighting',
    owner: 'Quality',
    status: 'draft',
    evidence: 'Inspection feature map',
    due: '2026-08-02',
  },
];

const reviews: RegisterRow[] = [
  {
    id: 'DR-3301',
    title: 'Preliminary design review',
    project: 'P2 mounting bracket light-weighting',
    owner: 'Engineering Manager',
    status: 'approved',
    evidence: 'Review minutes, action log',
    due: '2026-07-15',
  },
  {
    id: 'DR-3312',
    title: 'Critical design review',
    project: 'Composite antenna fairing redesign',
    owner: 'Quality Engineering',
    status: 'review',
    evidence: 'CDR packet, open action register',
    due: '2026-07-26',
  },
];

const risks: RiskRow[] = [
  {
    id: 'RK-4104',
    title: 'Layup thickness variation at trimmed edge',
    project: 'Composite antenna fairing redesign',
    owner: 'Quality Engineering',
    status: 'active',
    severity: 'Medium',
    mitigation: 'Add edge-thickness verification to first article plan',
    evidence: 'PFMEA link, inspection plan',
    due: '2026-07-25',
  },
  {
    id: 'RK-4111',
    title: 'Fixture handling could shift bonded insert',
    project: 'Bond fixture process update',
    owner: 'Manufacturing Engineering',
    status: 'review',
    severity: 'High',
    mitigation: 'Add locator pin poka-yoke and operator signoff',
    evidence: 'Risk review, prototype run notes',
    due: '2026-07-19',
  },
];

const verification: RegisterRow[] = [
  {
    id: 'VER-5208',
    title: 'Dimensional inspection against released drawing',
    project: 'Composite antenna fairing redesign',
    owner: 'Quality',
    status: 'review',
    evidence: 'FAI report, inspection record',
    due: '2026-07-31',
  },
  {
    id: 'VER-5220',
    title: 'Work instruction dry run',
    project: 'Bond fixture process update',
    owner: 'Production Lead',
    status: 'approved',
    evidence: 'Dry-run checklist, operator feedback',
    due: '2026-07-18',
  },
];

const validation: RegisterRow[] = [
  {
    id: 'VAL-6102',
    title: 'Customer fit-check article',
    project: 'Composite antenna fairing redesign',
    owner: 'Program Manager',
    status: 'active',
    evidence: 'Customer validation plan',
    due: '2026-08-08',
  },
  {
    id: 'VAL-6118',
    title: 'Production-equivalent build validation',
    project: 'P2 mounting bracket light-weighting',
    owner: 'Manufacturing Engineering',
    status: 'draft',
    evidence: 'Build validation protocol',
    due: '2026-08-14',
  },
];

const changes: RegisterRow[] = [];

const releases: ReleaseRow[] = [
  {
    id: 'REL-8101',
    title: 'Manufacturing release packet',
    project: 'Bond fixture process update',
    owner: 'Manufacturing Engineering',
    status: 'released',
    evidence: 'Released WI, traveler template, QC plan',
    due: '2026-07-18',
    wad: 'Released',
    p2: 'Ready for production',
  },
  {
    id: 'REL-8117',
    title: 'Engineering release package',
    project: 'Composite antenna fairing redesign',
    owner: 'Program Manager',
    status: 'review',
    evidence: 'PO review, WAD, preproduction checklist',
    due: '2026-08-01',
    wad: 'Pending authorization',
    p2: 'Pre-release',
  },
];

const dhf: RegisterRow[] = [
  {
    id: 'DHF-9007',
    title: 'Design input baseline',
    project: 'Composite antenna fairing redesign',
    owner: 'Document Control',
    status: 'approved',
    evidence: 'Controlled input bundle',
    due: '2026-07-17',
  },
  {
    id: 'DHF-9015',
    title: 'Verification and validation evidence set',
    project: 'Composite antenna fairing redesign',
    owner: 'Quality',
    status: 'review',
    evidence: 'Inspection, validation, review records',
    due: '2026-08-09',
  },
  {
    id: 'DHF-9021',
    title: 'Release and change history package',
    project: 'Bond fixture process update',
    owner: 'Document Control',
    status: 'released',
    evidence: 'Release packet, ECR history',
    due: '2026-07-18',
  },
];

const statusLabels: Record<StatusTone, string> = {
  draft: 'Draft',
  active: 'Active',
  review: 'In Review',
  approved: 'Approved',
  blocked: 'Blocked',
  released: 'Released',
};

const statusClasses: Record<StatusTone, string> = {
  draft: 'border-slate-300 bg-slate-50 text-slate-700',
  active: 'border-blue-300 bg-blue-50 text-blue-700',
  review: 'border-amber-300 bg-amber-50 text-amber-800',
  approved: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  blocked: 'border-red-300 bg-red-50 text-red-700',
  released: 'border-violet-300 bg-violet-50 text-violet-700',
};

const workflowStatusLabels: Record<WorkflowStatus, string> = {
  incomplete: 'Incomplete',
  blocked: 'Blocked',
  needs_approval: 'Needs Approval',
  approved: 'Approved',
};

const workflowStatusClasses: Record<WorkflowStatus, string> = {
  incomplete: 'border-slate-300 bg-slate-50 text-slate-700',
  blocked: 'border-red-300 bg-red-50 text-red-700',
  needs_approval: 'border-amber-300 bg-amber-50 text-amber-800',
  approved: 'border-emerald-300 bg-emerald-50 text-emerald-700',
};

const manufacturingEvidenceLabels: Record<ManufacturingEvidenceStatus, string> = {
  NOT_CONFIGURED: 'Source not configured',
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  NEEDS_REVIEW: 'Needs review',
  APPROVED: 'Approved',
  RELEASED: 'Released',
  BLOCKED: 'Blocked',
  NOT_APPLICABLE: 'Not applicable',
};

const manufacturingEvidenceClasses: Record<ManufacturingEvidenceStatus, string> = {
  NOT_CONFIGURED: 'border-slate-300 bg-slate-50 text-slate-700',
  NOT_STARTED: 'border-slate-300 bg-slate-50 text-slate-700',
  IN_PROGRESS: 'border-blue-300 bg-blue-50 text-blue-700',
  NEEDS_REVIEW: 'border-amber-300 bg-amber-50 text-amber-800',
  APPROVED: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  RELEASED: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  BLOCKED: 'border-red-300 bg-red-50 text-red-700',
  NOT_APPLICABLE: 'border-zinc-300 bg-zinc-50 text-zinc-700',
};

const lifecycleMetrics = [
  { label: 'Open design projects', value: designProjects.length, icon: Route },
  { label: 'Open risks', value: risks.length, icon: AlertTriangle },
  { label: 'Pending reviews', value: reviews.filter((row) => row.status === 'review').length, icon: ClipboardCheck },
  { label: 'Release packets', value: releases.length, icon: PackageCheck },
];

const lifecycleStages = [
  { stage: 'Inputs', owner: 'Engineering', state: 'Customer and regulatory requirements baselined' },
  { stage: 'Outputs', owner: 'Engineering', state: 'Drawings, BOMs, specifications, and acceptance criteria controlled' },
  { stage: 'Reviews', owner: 'Quality', state: 'Cross-functional review gates and action closure tracked' },
  { stage: 'Verification', owner: 'Quality', state: 'Evidence confirms outputs meet design inputs' },
  { stage: 'Validation', owner: 'Program', state: 'Evidence confirms the product meets intended use' },
  { stage: 'Release', owner: 'Manufacturing', state: 'Engineering baseline ready for manufactured-item creation' },
];

// Visible labels are projected from stable shared machine keys.
const designWorkflowSteps: DesignWorkflowStep[] = DESIGN_CONTROL_WORKFLOW.map((step) => ({
  id: step.key,
  title: step.title,
  purpose: step.purpose,
  fields: step.fields.map((field) => field.label),
  checklist: step.checklist.map((entry) => entry.label),
  approvals: step.approvals.map((approval) => approval.label),
  examples: step.examples ? [...step.examples] : undefined,
}));

function createInitialWorkflowData() {
  return designWorkflowSteps.reduce<Record<string, WorkflowStepData>>((acc, step) => {
    acc[step.id] = {
      fields: Object.fromEntries(step.fields.map((field) => [field, ''])),
      checklist: Object.fromEntries((step.checklist ?? []).map((item) => [item, false])),
      approvals: Object.fromEntries((step.approvals ?? []).map((approval) => [approval, false])),
    };
    return acc;
  }, {});
}

function mergePersistedWorkflowData(steps: DesignControlStepRecord[]) {
  const base = createInitialWorkflowData();

  for (const persistedStep of steps) {
    const step = designWorkflowSteps.find((item) => item.id === persistedStep.stepKey);
    if (!step) continue;

    base[step.id] = {
      fields: {
        ...base[step.id].fields,
        ...Object.fromEntries(Object.entries(persistedStep.formData ?? {}).map(([key, value]) => [key, String(value ?? '')])),
      },
      checklist: {
        ...base[step.id].checklist,
        ...Object.fromEntries(Object.entries(persistedStep.checklist ?? {}).map(([key, value]) => [key, value === true])),
      },
      approvals: {
        ...base[step.id].approvals,
        ...Object.fromEntries(Object.entries(persistedStep.approvals ?? {}).map(([key, value]) => [key, value === true])),
      },
    };
  }

  return base;
}

function isWorkflowStepFilled(step: DesignWorkflowStep, data: WorkflowStepData) {
  const fieldsComplete = step.fields.every((field) => data.fields[field]?.trim());
  const checklistComplete = (step.checklist ?? []).every((item) => data.checklist[item]);
  return fieldsComplete && checklistComplete;
}

function isWorkflowStepApproved(step: DesignWorkflowStep, data: WorkflowStepData) {
  return isWorkflowStepFilled(step, data) && (step.approvals ?? []).every((approval) => data.approvals[approval]);
}

function getWorkflowStepStatus(
  step: DesignWorkflowStep,
  workflowData: Record<string, WorkflowStepData>
): WorkflowStatus {
  const data = workflowData[step.id];
  if (step.id === '12') {
    const prerequisitesApproved = designWorkflowSteps
      .filter((item) => item.id !== '12')
      .every((item) => isWorkflowStepApproved(item, workflowData[item.id]));
    if (!prerequisitesApproved) return 'blocked';
  }
  if (isWorkflowStepApproved(step, data)) return 'approved';
  if (isWorkflowStepFilled(step, data)) return 'needs_approval';
  return 'incomplete';
}

function getMissingWorkflowItems(
  step: DesignWorkflowStep,
  workflowData: Record<string, WorkflowStepData>
) {
  const data = workflowData[step.id];
  const missingFields = step.fields.filter((field) => !data.fields[field]?.trim()).map((field) => `Field: ${field}`);
  const missingChecklist = (step.checklist ?? [])
    .filter((item) => !data.checklist[item])
    .map((item) => `Checklist: ${item}`);
  const missingApprovals = (step.approvals ?? [])
    .filter((approval) => !data.approvals[approval])
    .map((approval) => `Approval: ${approval}`);
  return [...missingFields, ...missingChecklist, ...missingApprovals];
}

function StatusBadge({ status }: { status: StatusTone }) {
  return (
    <Badge variant="outline" className={statusClasses[status]}>
      {statusLabels[status]}
    </Badge>
  );
}

function RegisterTable({
  rows,
  showRisk,
  showRelease,
  onOpen,
}: {
  rows: Array<RegisterRow | RiskRow | ReleaseRow>;
  showRisk?: boolean;
  showRelease?: boolean;
  onOpen: (row: RegisterRow | RiskRow | ReleaseRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Record</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Owner</TableHead>
            {showRisk && <TableHead>Severity</TableHead>}
            {showRelease && <TableHead>WAD / P2</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.id}</div>
                <div className="max-w-[260px] text-sm text-muted-foreground">{row.title}</div>
              </TableCell>
              <TableCell>{row.project}</TableCell>
              <TableCell>{row.owner}</TableCell>
              {showRisk && <TableCell>{'severity' in row ? row.severity : '-'}</TableCell>}
              {showRelease && (
                <TableCell>
                  {'wad' in row ? (
                    <div className="space-y-1 text-sm">
                      <div>{row.wad}</div>
                      <div className="text-muted-foreground">{row.p2}</div>
                    </div>
                  ) : (
                    '-'
                  )}
                </TableCell>
              )}
              <TableCell>
                <StatusBadge status={row.status} />
              </TableCell>
              <TableCell className="max-w-[280px] text-sm text-muted-foreground">{row.evidence}</TableCell>
              <TableCell>{row.due}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onOpen(row)}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
  actionHref,
}: {
  icon: typeof Route;
  title: string;
  description: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold tracking-normal">{title}</h2>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action && (
        actionHref ? (
          <Button asChild className="gap-2 self-start">
            <Link href={actionHref}>
              <Plus className="h-4 w-4" />
              {action}
            </Link>
          </Button>
        ) : (
          <Button className="gap-2 self-start">
            <Plus className="h-4 w-4" />
            {action}
          </Button>
        )
      )}
    </div>
  );
}

export default function QMSDesignControlPage() {
  const { can } = usePermissions();
  const routeParams = new URLSearchParams(window.location.search);
  const rdProjectIdParam = routeParams.get('rdProjectId');
  const rdProjectNameParam = routeParams.get('rdProjectName');
  const recordIdParam = routeParams.get('recordId');
  const [selectedRecord, setSelectedRecord] = useState<RegisterRow | RiskRow | ReleaseRow | null>(null);
  const [recordType, setRecordType] = useState('design-input');
  const [draftRecordTitle, setDraftRecordTitle] = useState('');
  const [draftRecordOwner, setDraftRecordOwner] = useState('');
  const [selectedWorkflowStepId, setSelectedWorkflowStepId] = useState('1');
  const [workflowData, setWorkflowData] = useState<Record<string, WorkflowStepData>>(() => createInitialWorkflowData());
  const [designControlRecords, setDesignControlRecords] = useState<DesignControlRecord[]>([]);
  const [activeDesignControlRecordId, setActiveDesignControlRecordId] = useState<string | null>(null);
  const [activeDesignControlRecord, setActiveDesignControlRecord] = useState<DesignControlRecord | null>(null);
  const [serverReadiness, setServerReadiness] = useState<DesignControlReadiness | null>(null);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isCreatingRecord, setIsCreatingRecord] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedStep, setLastSavedStep] = useState<string | null>(null);
  const [engineeringReleasePreview, setEngineeringReleasePreview] = useState<EngineeringReleasePreview | null>(null);
  const [approvalState, setApprovalState] = useState<StepApprovalState | null>(null);
  const [showApprovalHistory, setShowApprovalHistory] = useState(false);
  const [isApprovalActionPending, setIsApprovalActionPending] = useState(false);

  const gateProgress = useMemo(() => {
    const allRows = [...inputs, ...outputs, ...reviews, ...verification, ...validation, ...changes, ...releases, ...dhf];
    const complete = allRows.filter((row) => ['approved', 'released'].includes(row.status)).length;
    return Math.round((complete / allRows.length) * 100);
  }, []);

  const workflowStatuses = useMemo(() => {
    const serverStatusByStep = new Map((serverReadiness?.steps ?? []).map((step) => [step.key, step.status]));
    return Object.fromEntries(designWorkflowSteps.map((step) => {
      const serverStatus = serverStatusByStep.get(step.id);
      if (serverStatus === 'approved') return [step.id, 'approved'];
      if (serverStatus === 'needs_approval') return [step.id, 'needs_approval'];
      if (serverStatus === 'blocked') return [step.id, 'blocked'];
      return [step.id, getWorkflowStepStatus(step, workflowData)];
    })) as Record<string, WorkflowStatus>;
  }, [serverReadiness?.steps, workflowData]);
  const selectedWorkflowStep = designWorkflowSteps.find((step) => step.id === selectedWorkflowStepId) ?? designWorkflowSteps[0];
  const selectedWorkflowData = workflowData[selectedWorkflowStep.id];
  const approvedWorkflowCount = designWorkflowSteps.filter((step) => workflowStatuses[step.id] === 'approved').length;
  const workflowProgress = Math.round((approvedWorkflowCount / designWorkflowSteps.length) * 100);
  const localReleaseReadinessItems = designWorkflowSteps.flatMap((step) => {
    if (workflowStatuses[step.id] === 'approved') return [];
    if (step.id !== '12') {
      return [`Step ${step.id} ${step.title}: approval required before Engineering Release Gate`];
    }
    return getMissingWorkflowItems(step, workflowData).map((item) => `Release Gate ${item}`);
  });
  const releaseReadinessItems = serverReadiness?.missingItems ?? localReleaseReadinessItems;
  const manufacturingEvidence = serverReadiness?.manufacturingEvidence ?? null;

  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      setIsLoadingRecords(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams();
        if (rdProjectIdParam) params.set('rdProjectId', rdProjectIdParam);
        const response = await apiRequest(`/api/qms/design-control${params.toString() ? `?${params.toString()}` : ''}`) as {
          records: DesignControlRecord[];
          authorityState?: string | null;
          authoritativeRecordId?: string | null;
        };
        if (cancelled) return;
        setDesignControlRecords(response.records ?? []);
        setActiveDesignControlRecordId((current) =>
          current ?? recordIdParam ?? response.authoritativeRecordId ?? (rdProjectIdParam ? null : response.records?.[0]?.id) ?? null
        );
      } catch (error: any) {
        if (!cancelled) setLoadError(error.message || 'Failed to load design control records.');
      } finally {
        if (!cancelled) setIsLoadingRecords(false);
      }
    }

    loadRecords();
    return () => {
      cancelled = true;
    };
  }, [rdProjectIdParam, recordIdParam]);

  useEffect(() => {
    if (!activeDesignControlRecordId) {
      setActiveDesignControlRecord(null);
      setServerReadiness(null);
      setEngineeringReleasePreview(null);
      return;
    }

    let cancelled = false;

    async function loadRecord() {
      setIsLoadingRecord(true);
      setLoadError(null);
      try {
        const detail = await apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}`) as {
          record: DesignControlRecord;
          steps: DesignControlStepRecord[];
        };
        const readiness = await apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}/readiness`) as DesignControlReadiness;
        const releasePreview = await apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}/engineering-release-preview`) as { preview: EngineeringReleasePreview };
        if (cancelled) return;
        setActiveDesignControlRecord(detail.record);
        setWorkflowData(mergePersistedWorkflowData(detail.steps ?? []));
        setServerReadiness(readiness);
        setEngineeringReleasePreview(releasePreview.preview ?? null);
      } catch (error: any) {
        if (!cancelled) setLoadError(error.message || 'Failed to load the selected design control record.');
      } finally {
        if (!cancelled) setIsLoadingRecord(false);
      }
    }

    loadRecord();
    return () => {
      cancelled = true;
    };
  }, [activeDesignControlRecordId]);

  useEffect(() => {
    if (!activeDesignControlRecordId) {
      setApprovalState(null);
      return;
    }
    let cancelled = false;
    apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}/steps/${selectedWorkflowStepId}/approvals`)
      .then((state) => {
        if (!cancelled) setApprovalState(state as StepApprovalState);
      })
      .catch((error: any) => {
        if (!cancelled) setSaveError(error.message || 'Failed to load approval evidence.');
      });
    return () => {
      cancelled = true;
    };
  }, [activeDesignControlRecordId, selectedWorkflowStepId]);

  const createDesignControlRecord = async (title?: string) => {
    setIsCreatingRecord(true);
    setSaveError(null);
    try {
      const response = await apiRequest('/api/qms/design-control', {
        method: 'POST',
        body: {
          title: title?.trim() || draftRecordTitle.trim() || 'New Design Control Record',
          rdProjectId: rdProjectIdParam,
          metadata: {
            recordType,
            owner: draftRecordOwner.trim() || null,
            rdProjectName: rdProjectNameParam,
            source: '/qms/design-control',
          },
        },
      }) as { record: DesignControlRecord };
      setDesignControlRecords((current) => [response.record, ...current.filter((record) => record.id !== response.record.id)]);
      setActiveDesignControlRecordId(response.record.id);
      setDraftRecordTitle('');
      setDraftRecordOwner('');
    } catch (error: any) {
      setSaveError(error.message || 'Failed to create design control record.');
    } finally {
      setIsCreatingRecord(false);
    }
  };

  const saveWorkflowStep = async () => {
    if (!activeDesignControlRecordId) {
      setSaveError('Create or select a design control record before saving workflow steps.');
      return;
    }

    const step = selectedWorkflowStep;
    const data = workflowData[step.id];
    setIsSavingStep(true);
    setSaveError(null);
    setLastSavedStep(null);
    try {
      const response = await apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}/steps/${step.id}`, {
        method: 'PATCH',
        body: {
          formData: data.fields,
          checklist: step.id === '12' ? {} : data.checklist,
          changeReason: 'Design Control draft updated',
          metadata: {
            title: step.title,
            purpose: step.purpose,
            source: '/qms/design-control',
            sourceOfTruthPrinciple: step.id === '12'
              ? 'R&D Project owns engineering process; Design Control orchestrates; manufacturing modules own their own data and Design Control evaluates their status.'
              : undefined,
          },
        },
      });
      const [readiness, state] = await Promise.all([
        apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}/readiness`) as Promise<DesignControlReadiness>,
        apiRequest(`/api/qms/design-control/${activeDesignControlRecordId}/steps/${step.id}/approvals`) as Promise<StepApprovalState>,
      ]);
      setServerReadiness(readiness);
      setApprovalState(state);
      setLastSavedStep(`Step ${step.id} draft saved`);
    } catch (error: any) {
      setSaveError(error.message || 'Failed to save design control step.');
      if (error.responseData?.missingItems) {
        setServerReadiness({
          ready: false,
          missingItems: error.responseData.missingItems,
          manufacturingEvidence: error.responseData.manufacturingEvidence ?? serverReadiness?.manufacturingEvidence ?? null,
          steps: serverReadiness?.steps ?? [],
        });
      }
    } finally {
      setIsSavingStep(false);
    }
  };

  const updateWorkflowField = (stepId: string, field: string, value: string) => {
    setWorkflowData((current) => ({
      ...current,
      [stepId]: {
        ...current[stepId],
        fields: {
          ...current[stepId].fields,
          [field]: value,
        },
      },
    }));
  };

  const updateWorkflowChecklist = (stepId: string, item: string, checked: boolean) => {
    setWorkflowData((current) => ({
      ...current,
      [stepId]: {
        ...current[stepId],
        checklist: {
          ...current[stepId].checklist,
          [item]: checked,
        },
      },
    }));
  };

  const submitWorkflowStep = async () => {
    if (!activeDesignControlRecordId || !approvalState?.currentContentVersion?.id) return;
    setIsApprovalActionPending(true);
    setSaveError(null);
    try {
      const state = await apiRequest(
        `/api/qms/design-control/${activeDesignControlRecordId}/steps/${selectedWorkflowStep.id}/submit`,
        { method: 'POST', body: { contentVersionId: approvalState.currentContentVersion.id } }
      ) as StepApprovalState;
      setApprovalState(state);
      setLastSavedStep(`Step ${selectedWorkflowStep.id} submitted as version ${state.currentContentVersion?.contentVersion}`);
    } catch (error: any) {
      setSaveError(error.message || 'Failed to submit this step.');
    } finally {
      setIsApprovalActionPending(false);
    }
  };

  const decideWorkflowApproval = async (
    approvalKey: string,
    decision: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION'
  ) => {
    if (!activeDesignControlRecordId || !approvalState?.currentContentVersion?.id) return;
    const comment = window.prompt(
      decision === 'APPROVED' ? 'Optional approval comment' : 'Decision comment (required)'
    );
    if (comment === null || (decision !== 'APPROVED' && !comment.trim())) return;
    setIsApprovalActionPending(true);
    setSaveError(null);
    try {
      const state = await apiRequest(
        `/api/qms/design-control/${activeDesignControlRecordId}/steps/${selectedWorkflowStep.id}/decision`,
        {
          method: 'POST',
          body: {
            contentVersionId: approvalState.currentContentVersion.id,
            approvalKey,
            decision,
            comment: comment.trim() || undefined,
          },
        }
      ) as StepApprovalState;
      setApprovalState(state);
    } catch (error: any) {
      setSaveError(error.message || 'Approval decision failed. Refresh to verify the current version.');
    } finally {
      setIsApprovalActionPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Badge variant="outline" className="mb-2 border-blue-300 bg-blue-50 text-blue-700">
              AS9100 Design Control
            </Badge>
            <h1 className="text-3xl font-bold tracking-normal text-gray-900">Design Control</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Lifecycle control for design inputs, outputs, reviews, risk, verification, validation,
              engineering change, release, and the design history file.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2">
              <FileArchive className="h-4 w-4" />
              DHF Export
            </Button>
            <Button className="gap-2" onClick={() => createDesignControlRecord()} disabled={isCreatingRecord}>
              <Plus className="h-4 w-4" />
              {isCreatingRecord ? 'Creating...' : 'New Design Record'}
            </Button>
          </div>
        </div>

        {(loadError || saveError || lastSavedStep || isLoadingRecords || isLoadingRecord) && (
          <Card>
            <CardContent className="flex flex-col gap-2 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <div className="text-muted-foreground">
                {isLoadingRecords || isLoadingRecord
                  ? 'Loading persistent design control data...'
                  : activeDesignControlRecord
                    ? `Active record: ${activeDesignControlRecord.title}`
                    : 'No active design control record selected.'}
              </div>
              <div className="flex flex-wrap gap-2">
                {lastSavedStep && (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                    {lastSavedStep}
                  </Badge>
                )}
                {(loadError || saveError) && (
                  <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
                    {loadError || saveError}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Persistent Design Record</CardTitle>
            <CardDescription>Select the database-backed record that owns this AS9100 workflow.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="active-design-control-record">Active record</Label>
              <Select
                value={activeDesignControlRecordId ?? undefined}
                onValueChange={setActiveDesignControlRecordId}
                disabled={isLoadingRecords || designControlRecords.length === 0}
              >
                <SelectTrigger id="active-design-control-record">
                  <SelectValue placeholder={isLoadingRecords ? 'Loading records...' : 'Select a design control record'} />
                </SelectTrigger>
                <SelectContent>
                  {designControlRecords.map((record) => (
                    <SelectItem key={record.id} value={record.id}>
                      {record.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => createDesignControlRecord()} disabled={isCreatingRecord}>
              <Plus className="h-4 w-4" />
              Create Record
            </Button>
          </CardContent>
        </Card>

        {activeDesignControlRecordId && (
          <>
            <EngineeringChangeRequestRegister
              projectId={activeDesignControlRecord?.rdProjectId}
              recordId={activeDesignControlRecordId}
              oversightMode
            />
            <ProjectFormInstancesPanel
              recordId={activeDesignControlRecordId}
              oversightMode
            />
          </>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          {lifecycleMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Card key={metric.label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardDescription>{metric.label}</CardDescription>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{metric.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Lifecycle Readiness
                </CardTitle>
                <CardDescription>Approved or released records across the controlled design lifecycle.</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit border-emerald-300 bg-emerald-50 text-emerald-700">
                {gateProgress}% evidence complete
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={gateProgress} />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border bg-white px-3 py-2 text-sm">
                <div className="font-medium">Traceability</div>
                <div className="text-muted-foreground">Inputs link forward to outputs, reviews, and V&V evidence.</div>
              </div>
              <div className="rounded-md border bg-white px-3 py-2 text-sm">
                <div className="font-medium">Engineering Release</div>
                <div className="text-muted-foreground">The frozen baseline prepares the design for manufactured-item creation.</div>
              </div>
              <div className="rounded-md border bg-white px-3 py-2 text-sm">
                <div className="font-medium">DHF Control</div>
                <div className="text-muted-foreground">Design history file evidence is grouped by project and record.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ListChecks className="h-5 w-5 text-primary" />
                AS9100 Design Workflow
              </CardTitle>
              <CardDescription>
                Step-by-step gated workflow. Step 12 cannot be approved until steps 1-11 are approved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Workflow approval progress</span>
                  <span className="text-muted-foreground">{approvedWorkflowCount} / {designWorkflowSteps.length}</span>
                </div>
                <Progress value={workflowProgress} />
              </div>
              <div className="space-y-2">
                {designWorkflowSteps.map((step) => {
                  const status = workflowStatuses[step.id];
                  return (
                    <button
                      key={step.id}
                      type="button"
                      className={`w-full rounded-md border bg-white px-3 py-3 text-left transition hover:bg-gray-50 ${
                        selectedWorkflowStep.id === step.id ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedWorkflowStepId(step.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">Step {step.id}</div>
                          <div className="text-sm text-muted-foreground">{step.title}</div>
                        </div>
                        <Badge variant="outline" className={workflowStatusClasses[status]}>
                          {workflowStatusLabels[status]}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      Step {selectedWorkflowStep.id}: {selectedWorkflowStep.title}
                    </CardTitle>
                    <CardDescription className="mt-1">{selectedWorkflowStep.purpose}</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={workflowStatusClasses[workflowStatuses[selectedWorkflowStep.id]]}>
                      {workflowStatusLabels[workflowStatuses[selectedWorkflowStep.id]]}
                    </Badge>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={saveWorkflowStep}
                      disabled={
                        isSavingStep ||
                        isLoadingRecord ||
                        !activeDesignControlRecordId ||
                        approvalState?.step.status === 'submitted_for_approval' ||
                        !can('design.control.edit')
                      }
                    >
                      <FileCheck2 className="h-4 w-4" />
                      {isSavingStep ? 'Saving...' : 'Save Draft'}
                    </Button>
                    {can('design.control.submit') && approvalState?.step.status !== 'submitted_for_approval' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={submitWorkflowStep}
                        disabled={isApprovalActionPending || !approvalState?.currentContentVersion}
                      >
                        Submit for Approval
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {selectedWorkflowStep.id === '12' && workflowStatuses[selectedWorkflowStep.id] === 'blocked' && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    Steps 1-11 must be approved before this Engineering Release Gate can be approved.
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {selectedWorkflowStep.fields.map((field) => {
                    const fieldId = `design-step-${selectedWorkflowStep.id}-${field.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
                    const useTextarea = /summary|requirements|scope|milestones|notes|statement|criteria|concerns|attachments|disposition|baseline/i.test(field);
                    return (
                      <div key={field} className="grid gap-2">
                        <Label htmlFor={fieldId}>{field}</Label>
                        {useTextarea ? (
                          <Textarea
                            id={fieldId}
                            value={selectedWorkflowData.fields[field] ?? ''}
                            onChange={(event) => updateWorkflowField(selectedWorkflowStep.id, field, event.target.value)}
                            placeholder={`Enter ${field.toLowerCase()}`}
                            disabled={approvalState?.step.status === 'submitted_for_approval'}
                          />
                        ) : (
                          <Input
                            id={fieldId}
                            value={selectedWorkflowData.fields[field] ?? ''}
                            onChange={(event) => updateWorkflowField(selectedWorkflowStep.id, field, event.target.value)}
                            placeholder={`Enter ${field.toLowerCase()}`}
                            disabled={approvalState?.step.status === 'submitted_for_approval'}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedWorkflowStep.examples && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="text-sm font-medium">Example risks</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedWorkflowStep.examples.map((example) => (
                        <Badge key={example} variant="secondary">
                          {example}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {selectedWorkflowStep.id === '12' && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">Manufacturing source status</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Design Control evaluates these source-of-truth modules. It does not duplicate BOM, routing, traveler, work-instruction, inspection, training, or P2 manufacturing data.
                      </p>
                    </div>
                    {manufacturingEvidence?.sources?.length ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {manufacturingEvidence.sources.map((source) => (
                          <div key={source.key} className="rounded-md border bg-white p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium">{source.label}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{source.sourceModule}</div>
                              </div>
                              <Badge variant="outline" className={manufacturingEvidenceClasses[source.status]}>
                                {manufacturingEvidenceLabels[source.status]}
                              </Badge>
                            </div>
                            <p className="mt-3 text-xs text-muted-foreground">{source.explanation}</p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              {source.revision && <Badge variant="secondary">Rev {source.revision}</Badge>}
                              {source.approvedBy && <Badge variant="secondary">Approved by {source.approvedBy}</Badge>}
                              {source.releasedBy && <Badge variant="secondary">Released by {source.releasedBy}</Badge>}
                              {source.applicability?.applicable === false && (
                                <Badge variant="secondary">
                                  N/A {source.applicability.approved ? 'approved' : 'pending approval'}
                                </Badge>
                              )}
                            </div>
                            {source.missingItems.length > 0 && (
                              <div className="mt-3 space-y-1">
                                {source.missingItems.map((item) => (
                                  <div key={item} className="flex items-start gap-2 text-xs text-amber-700">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>{item}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {source.openUrl && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-3 h-8"
                                onClick={() => window.location.assign(source.openUrl!)}
                              >
                                Open source
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        Source evidence will load after a persistent design control record is selected.
                      </div>
                    )}
                  </div>
                )}

                {selectedWorkflowStep.id !== '12' && selectedWorkflowStep.checklist && selectedWorkflowStep.checklist.length > 0 && (
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">Checklist</div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {selectedWorkflowStep.checklist.map((item) => (
                        <label key={item} className="flex cursor-pointer items-start gap-3 rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50">
                          <Checkbox
                            checked={selectedWorkflowData.checklist[item] === true}
                            onCheckedChange={(checked) => updateWorkflowChecklist(selectedWorkflowStep.id, item, checked === true)}
                            disabled={approvalState?.step.status === 'submitted_for_approval'}
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {selectedWorkflowStep.approvals && selectedWorkflowStep.approvals.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">Authenticated approvals</div>
                        <div className="text-xs text-muted-foreground">
                          {approvalState?.currentContentVersion
                            ? `Content version ${approvalState.currentContentVersion.contentVersion} · ${approvalState.currentContentVersion.contentChecksum.slice(0, 12)}`
                            : 'Save a draft to create the first content version.'}
                        </div>
                      </div>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setShowApprovalHistory((current) => !current)}>
                        <History className="mr-2 h-4 w-4" />
                        {showApprovalHistory ? 'Hide History' : 'Version History'}
                      </Button>
                    </div>
                    {Object.values(approvalState?.legacyEvidence.values ?? {}).some(Boolean) && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        Legacy checkbox evidence is retained for history but does not satisfy an authenticated approval gate.
                      </div>
                    )}
                    <div className="grid gap-3">
                      {(approvalState?.approvalSlots ?? []).map((slot) => (
                        <div key={slot.key} className="rounded-md border bg-white p-3 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-medium">{slot.label}</div>
                              <div className="mt-1 text-xs text-muted-foreground">{slot.signatureMeaning}</div>
                              {slot.decision && (
                                <div className="mt-2 text-xs">
                                  {slot.decision.decision} by {slot.decision.actorDisplayNameSnapshot} ({slot.decision.actorRoleSnapshot}) ·{' '}
                                  {new Date(slot.decision.createdAt).toLocaleString()}
                                  {slot.decision.comment ? ` · ${slot.decision.comment}` : ''}
                                </div>
                              )}
                            </div>
                            <Badge variant="outline">{slot.status}</Badge>
                          </div>
                          {approvalState?.step.status === 'submitted_for_approval' &&
                            slot.status === 'PENDING' &&
                            can('design.control.approve') &&
                            can(slot.requiredCapability) && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => decideWorkflowApproval(slot.key, 'APPROVED')} disabled={isApprovalActionPending}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => decideWorkflowApproval(slot.key, 'REJECTED')} disabled={isApprovalActionPending}>
                                  Reject
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => decideWorkflowApproval(slot.key, 'RETURNED_FOR_REVISION')} disabled={isApprovalActionPending}>
                                  Return for Revision
                                </Button>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                    {showApprovalHistory && (
                      <div className="rounded-md border bg-muted/20 p-3 text-xs">
                        <div className="font-medium">Immutable content versions</div>
                        <div className="mt-2 space-y-1">
                          {(approvalState?.versions ?? []).map((version) => (
                            <div key={version.id}>
                              Version {version.contentVersion} · {version.status} · {version.contentChecksum.slice(0, 12)} ·{' '}
                              {new Date(version.createdAt).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <PackageCheck className="h-5 w-5 text-primary" />
                      Release Readiness
                    </CardTitle>
                    <CardDescription>
                      Missing items that must be cleared before Engineering Release Gate approval.
                    </CardDescription>
                  </div>
                  <Button
                    variant={releaseReadinessItems.length === 0 ? 'default' : 'outline'}
                    className="gap-2 self-start"
                    onClick={() => {
                      if (activeDesignControlRecord?.rdProjectId) {
                        window.location.assign(`/design/rd-projects?projectId=${encodeURIComponent(activeDesignControlRecord.rdProjectId)}&tab=engineering-release`);
                      }
                    }}
                    disabled={!activeDesignControlRecord?.rdProjectId}
                  >
                    <Rocket className="h-4 w-4" />
                    Open Engineering Release in R&D Project
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {manufacturingEvidence?.sources && manufacturingEvidence.sources.length > 0 && (
                  <div className="mb-4 space-y-3">
                    {engineeringReleasePreview && (
                      <div className="rounded-md border bg-white px-3 py-2 text-sm">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="font-medium">Engineering Release Status</div>
                            <div className="text-xs text-muted-foreground">
                              {engineeringReleasePreview.existingRelease
                                ? `${engineeringReleasePreview.existingRelease.releaseNumber} revision ${engineeringReleasePreview.existingRelease.releaseRevision} is ${engineeringReleasePreview.existingRelease.releaseStatus}.`
                                : `${engineeringReleasePreview.proposedReleaseNumber} revision ${engineeringReleasePreview.proposedReleaseRevision} is ${engineeringReleasePreview.ready ? 'ready for R&D release execution' : 'blocked by missing evidence'}.`}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={engineeringReleasePreview.existingRelease
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : engineeringReleasePreview.ready
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-amber-300 bg-amber-50 text-amber-800'}
                          >
                            {engineeringReleasePreview.existingRelease ? 'Released' : engineeringReleasePreview.ready ? 'Ready' : 'Blocked'}
                          </Badge>
                        </div>
                      </div>
                    )}
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      {serverReadiness.sourceOfTruthPrinciple
                        ?? 'R&D Project owns engineering process; Design Control orchestrates; manufacturing modules own their own data and Design Control evaluates their status.'}
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {manufacturingEvidence.sources.map((source) => (
                        <div key={source.key} className="flex items-start justify-between gap-3 rounded-md border bg-white px-3 py-2 text-sm">
                          <div>
                            <div className="font-medium">{source.label}</div>
                            <div className="text-xs text-muted-foreground">{source.sourceModule}</div>
                          </div>
                          <Badge variant="outline" className={manufacturingEvidenceClasses[source.status]}>
                            {manufacturingEvidenceLabels[source.status]}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {releaseReadinessItems.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    Engineering Release Gate is approved and ready for engineering baseline release.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {releaseReadinessItems.slice(0, 12).map((item) => (
                      <div key={item} className="flex items-start gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <span>{item}</span>
                      </div>
                    ))}
                    {releaseReadinessItems.length > 12 && (
                      <div className="text-sm text-muted-foreground">
                        {releaseReadinessItems.length - 12} additional release readiness item(s) remain.
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Tabs defaultValue={DESIGN_CONTROL_DEFAULT_TAB} className="space-y-4">
          <div className="overflow-x-auto rounded-md border bg-white p-1">
            <TabsList className="h-auto min-w-max justify-start bg-transparent">
              {lifecycleTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-4">
            <SectionHeader
              icon={Route}
              title="AS9100 Design Lifecycle"
              description="A controlled path from requirement capture through release to manufacturing and retained DHF evidence."
            />
            <div className="overflow-x-auto rounded-md border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Control State</TableHead>
                    <TableHead>Flow</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lifecycleStages.map((stage, index) => (
                    <TableRow key={stage.stage}>
                      <TableCell className="font-medium">{stage.stage}</TableCell>
                      <TableCell>{stage.owner}</TableCell>
                      <TableCell className="text-muted-foreground">{stage.state}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          Step {index + 1}
                          {index < lifecycleStages.length - 1 && <ArrowRight className="h-4 w-4" />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="projects" className="space-y-4">
            <SectionHeader
              icon={GitBranch}
              title="Design Projects"
              description="Controlled design projects that can align with the existing Design and R&D project folders."
              action="Open Design Project"
              actionHref="/design/rd-projects"
            />
            <div className="grid gap-4 lg:grid-cols-3">
              {designProjects.map((project) => (
                <Card key={project.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        <CardDescription>{project.id} | {project.owner}</CardDescription>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Phase</span>
                      <span className="font-medium">{project.phase}</span>
                    </div>
                    <Progress value={project.readiness} />
                    <div className="text-sm">
                      <div className="font-medium">Next gate</div>
                      <div className="text-muted-foreground">{project.nextGate}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="inputs" className="space-y-4">
            <SectionHeader icon={ListChecks} title="Design Inputs" description="Customer, regulatory, functional, interface, and manufacturing requirements under revision control." action="New Input" />
            <RegisterTable rows={inputs} onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="outputs" className="space-y-4">
            <SectionHeader icon={FileCog} title="Design Outputs" description="Drawings, BOMs, specifications, inspection criteria, and work instructions that satisfy approved inputs." action="New Output" />
            <RegisterTable rows={outputs} onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4">
            <SectionHeader icon={ClipboardCheck} title="Design Reviews" description="Formal review gates, attendees, action items, approvals, and closure evidence." action="Schedule Review" />
            <RegisterTable rows={reviews} onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="risks" className="space-y-4">
            <SectionHeader icon={AlertTriangle} title="Risks" description="Design risk, producibility risk, mitigation ownership, and residual acceptance evidence." action="New Risk" />
            <RegisterTable rows={risks} showRisk onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="verification" className="space-y-4">
            <SectionHeader icon={Microscope} title="Verification" description="Objective evidence that design outputs meet the approved design inputs." action="New Verification" />
            <RegisterTable rows={verification} onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="validation" className="space-y-4">
            <SectionHeader icon={CheckCircle2} title="Validation" description="Evidence that the design meets intended use in the customer or production-equivalent environment." action="New Validation" />
            <RegisterTable rows={validation} onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="changes" className="space-y-4">
            <SectionHeader icon={History} title="Engineering Changes" description="Authoritative ECR review plus controlled ECN implementation, V&V, and release-readiness oversight." />
            <EngineeringChangeRequestRegister
              projectId={activeDesignControlRecord?.rdProjectId}
              recordId={activeDesignControlRecordId}
              oversightMode
            />
            <EngineeringChangeNoticeWorkspace
              projectId={activeDesignControlRecord?.rdProjectId}
              oversightMode
            />
          </TabsContent>

          <TabsContent value="release" className="space-y-4">
            <SectionHeader icon={Rocket} title="Engineering Release Gate" description="The formal gate that freezes the R&D engineering baseline before manufactured inventory item creation." action="New Release" />
            <RegisterTable rows={releases} showRelease onOpen={setSelectedRecord} />
          </TabsContent>

          <TabsContent value="dhf" className="space-y-4">
            <SectionHeader icon={FileCheck2} title="Design History File" description="The retained evidence set proving the design was developed and released under controlled conditions." action="Add DHF Record" />
            <RegisterTable rows={dhf} onOpen={setSelectedRecord} />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Flag className="h-5 w-5 text-primary" />
              Quick Record Intake
            </CardTitle>
            <CardDescription>Capture a controlled record shell without leaving Design Control.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[220px_1fr_1fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="record-type">Record type</Label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger id="record-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="design-input">Design Input</SelectItem>
                  <SelectItem value="design-output">Design Output</SelectItem>
                  <SelectItem value="design-review">Design Review</SelectItem>
                  <SelectItem value="risk">Risk</SelectItem>
                  <SelectItem value="verification">Verification</SelectItem>
                  <SelectItem value="validation">Validation</SelectItem>
                  <SelectItem value="engineering-change">Engineering Change</SelectItem>
                  <SelectItem value="release">Release Record</SelectItem>
                  <SelectItem value="dhf">DHF Record</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="record-title">Title</Label>
              <Input
                id="record-title"
                value={draftRecordTitle}
                onChange={(event) => setDraftRecordTitle(event.target.value)}
                placeholder="Controlled record title"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="record-owner">Owner</Label>
              <Input
                id="record-owner"
                value={draftRecordOwner}
                onChange={(event) => setDraftRecordOwner(event.target.value)}
                placeholder="Responsible owner"
              />
            </div>
            <Button className="gap-2" onClick={() => createDesignControlRecord()} disabled={isCreatingRecord}>
              <FileText className="h-4 w-4" />
              {isCreatingRecord ? 'Creating...' : 'Create Draft'}
            </Button>
          </CardContent>
        </Card>

        <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedRecord?.id} - {selectedRecord?.title}</DialogTitle>
              <DialogDescription>{selectedRecord?.project}</DialogDescription>
            </DialogHeader>
            {selectedRecord && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Owner</div>
                    <div className="mt-1">{selectedRecord.owner}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Status</div>
                    <div className="mt-1">
                      <StatusBadge status={selectedRecord.status} />
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-sm font-medium">Evidence</div>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedRecord.evidence}</p>
                </div>
                {'mitigation' in selectedRecord && (
                  <div>
                    <div className="text-sm font-medium">Mitigation</div>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedRecord.mitigation}</p>
                  </div>
                )}
                {'wad' in selectedRecord && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border p-3">
                      <div className="text-xs font-medium uppercase text-muted-foreground">WAD</div>
                      <div className="mt-1">{selectedRecord.wad}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-xs font-medium uppercase text-muted-foreground">P2 Status</div>
                      <div className="mt-1">{selectedRecord.p2}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
              <Button>Open Record</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

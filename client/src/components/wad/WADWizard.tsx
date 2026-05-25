import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Check, ChevronRight, ChevronLeft, AlertTriangle, FileText, Users, ClipboardList,
  DollarSign, Package, Route, ShieldCheck, Calendar, AlertCircle, FolderOpen,
  Star, Loader2, CheckCircle, XCircle, Plus, Trash2
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// ─── Department Enum ─────────────────────────────────────────────────────────
export const WAD_DEPARTMENTS = [
  { key: 'CUTTING_KITTING', label: 'Cutting / Kitting', isSpecialProcess: false, requiresCertification: false },
  { key: 'LAYUP', label: 'Layup', isSpecialProcess: true, requiresCertification: true },
  { key: 'CURE', label: 'Cure', isSpecialProcess: true, requiresCertification: true },
  { key: 'CNC', label: 'CNC', isSpecialProcess: false, requiresCertification: false },
  { key: 'SUB_ASSEMBLY', label: 'Sub Assembly', isSpecialProcess: false, requiresCertification: false },
  { key: 'ASSEMBLY', label: 'Assembly', isSpecialProcess: false, requiresCertification: false },
  { key: 'FINISH', label: 'Finish', isSpecialProcess: false, requiresCertification: false },
  { key: 'PAINT', label: 'Paint', isSpecialProcess: true, requiresCertification: true },
  { key: 'QC', label: 'Quality Control', isSpecialProcess: false, requiresCertification: false },
  { key: 'SHIPPING', label: 'Shipping', isSpecialProcess: false, requiresCertification: false },
];

const DOCUMENT_CHECKLIST_ITEMS = [
  { key: 'customer_po', name: 'Customer PO' },
  { key: 'drawing', name: 'Drawing' },
  { key: 'rev_spec', name: 'Rev / Spec' },
  { key: 'work_instructions', name: 'Work Instructions' },
  { key: 'bom', name: 'Bill of Materials (BOM)' },
  { key: 'routing', name: 'Routing' },
  { key: 'quote', name: 'Quote' },
  { key: 'risk_assessment', name: 'Risk Assessment' },
  { key: 'purchase_review_checklist', name: 'Purchase Review Checklist' },
  { key: 'material_cert_requirements', name: 'Material Cert Requirements' },
  { key: 'inspection_plan', name: 'Inspection Plan' },
  { key: 'flow_downs', name: 'Flow-downs' },
];

const REQUIRED_APPROVAL_ROLES = [
  { key: 'project_manager', label: 'Project Manager' },
  { key: 'engineering', label: 'Engineering' },
  { key: 'quality', label: 'Quality' },
  { key: 'operations', label: 'Operations' },
  { key: 'executive', label: 'Executive' },
];

const RISK_TYPES = ['Technical', 'Schedule', 'Material', 'Quality', 'Tooling', 'Supplier'];
const EMPTY_SELECT_VALUE = '__none__';

// ─── Types ───────────────────────────────────────────────────────────────────
interface WorkBreakdownRow {
  department: string;
  operation: string;
  responsibleLead: string;
  estimatedHours: number;
  requiredCerts: string;
  isTravelerStep: boolean;
  requiresQCSignoff: boolean;
  seeded?: boolean;
  seededFrom?: string;
}

interface ChargeCodeRow {
  department: string;
  operation: string;
  chargeCode: string;
  laborCategory: string;
  classification: 'DIRECT' | 'INDIRECT' | 'UNALLOWABLE';
  budgetedHours: number;
  overtimeAllowed: boolean;
  operatorOverrideAllowed: boolean;
  overrunRule: 'WARN' | 'REQUIRE_APPROVAL' | 'HARD_STOP';
  seeded?: boolean;
  seededFrom?: string;
}

interface RiskEntry {
  type: string;
  description: string;
  owner: string;
  mitigation: string;
  dueDate: string;
  approvalStatus: string;
}

interface DocItem {
  key: string;
  name: string;
  status: 'PENDING' | 'ATTACHED' | 'WAIVED';
  notes: string;
}

interface ApprovalRecord {
  role: string;
  userId: string | null;
  displayName: string;
  decision: 'APPROVED' | 'REJECTED';
  comments: string | null;
  signature?: string | null;
  signatureMeaning?: string | null;
  signedAt?: string | null;
  timestamp: string;
}

interface ApprovalAssignment {
  employeeId: number;
  employeeName: string | null;
  assignedAt?: string;
}

type ApprovalAssignmentsMap = Record<string, ApprovalAssignment>;

type WadExceptionType = 'overrun' | 'charge_code_override' | 'late_release_exception';

interface ApprovalRequestRecord {
  id: string;
  type: WadExceptionType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason: string;
  requestedByName: string;
  requestedAt: string;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
}

interface RevisionHistoryRecord {
  revision: number;
  action: string;
  role?: string;
  actorName?: string;
  comments?: string | null;
  timestamp: string;
}

interface WadControlStatus {
  labor: {
    usedHours: number;
    budgetHours: number | null;
    plannedHours: number;
    projectedHours: number;
    percentUsed: number | null;
    projectedPercentUsed: number | null;
    projectedOverrun: boolean;
    status: string;
  };
  material: {
    usedSpend: number;
    spendCap: number | null;
    percentUsed: number | null;
    projectedOverrun: boolean;
  };
  outsideProcessing: {
    usedSpend: number;
    spendCap: number | null;
    percentUsed: number | null;
    projectedOverrun: boolean;
  };
  exceptions: {
    chargeCodeOverride: boolean;
    lateRelease: boolean;
    requiredRequests: WadExceptionType[];
    missingRequests: WadExceptionType[];
  };
}

// Source labels for Step 1 auto-filled fields
type Step1AutoSource = 'auto:project' | 'auto:po' | 'auto:po-review' | 'auto:rfq' | 'auto:wad' | 'user';

interface WizardData {
  currentStep?: number;
  step1?: {
    projectNumber: string;
    customer: string;
    poNumber: string;
    // Legacy single partNumber — kept for backward compat; new WADs use the two fields below
    partNumber?: string;
    // Dual part numbers: customer-facing (invoices, packing slips) vs internal (routing, travelers, W/I, spec sheets)
    customerPartNumber: string;
    internalPartNumber: string;
    revision: string;
    quantity: number;
    shipDate: string;
    contractReviewStatus: string;
    riskAssessmentStatus: string;
    poReviewApproved: boolean;
    // Per-field provenance: tracks whether the value came from an upstream doc or was user-edited
    __sources?: Partial<Record<
      'projectNumber' | 'customer' | 'poNumber' | 'customerPartNumber' | 'internalPartNumber' |
      'revision' | 'quantity' | 'shipDate' | 'contractReviewStatus' | 'riskAssessmentStatus' | 'poReviewApproved',
      Step1AutoSource
    >>;
  };
  step2?: {
    scopeDescription: string;
    buildType: string;
    departments: string[];
    deliverables: string;
  };
  step3?: { rows: WorkBreakdownRow[] };
  step4?: { chargeCodes: ChargeCodeRow[] };
  step5?: {
    bomLinked: boolean;
    materialLotsRequired: boolean;
    serializedMaterial: boolean;
    icnScanRequired: boolean;
    expirationBlocking: boolean;
    outTimeTracking: boolean;
    customerSuppliedMaterial: boolean;
    certsRequired: boolean;
    materialSpendCap: number;
    outsideProcessingCap: number;
    materialOverrunRule: 'REQUIRE_APPROVAL' | 'HARD_STOP';
    outsideProcessingRule: 'REQUIRE_APPROVAL' | 'HARD_STOP';
    notes: string;
  };
  step6?: {
    routingRequired: boolean;
    travelerRequired: boolean;
    workInstructionRequired: boolean;
    specSheetRequired: boolean;
    inProcessInspectionRequired: boolean;
    finalQCOnly: boolean;
    spotCheckPlan: string;
  };
  step7?: {
    inspectionLevel: string;
    faiRequired: boolean;
    inProcessQC: boolean;
    finalQC: boolean;
    spotCheckSampleSize: string;
    spotCheckFrequency: string;
    spotCheckAcceptanceCriteria: string;
    spotCheckEscalationRule: string;
    customerSourceInspection: boolean;
    certPackageRequired: boolean;
    dimensionalReportRequired: boolean;
    ncrProcess: string;
  };
  step8?: {
    authorizedStartDate: string;
    requiredCompletionDate: string;
    deptDueDates: Record<string, string>;
    priority: string;
    dailyTargetQty: number;
    capacityRisk: string;
    bottleneckDepartment: string;
  };
  step9?: {
    risks: RiskEntry[];
    itarFlag: boolean;
    customerFlowDowns: string;
    specialProcessControls: string;
  };
  step10?: { documents: DocItem[] };
  approvals?: ApprovalRecord[];
  approvalAssignments?: ApprovalAssignmentsMap;
  approvalRequests?: ApprovalRequestRecord[];
  currentRevision?: number;
  revisionStatus?: 'DRAFT' | 'IN_REVIEW' | 'IN_REVISION' | 'NEEDS_REVISION' | 'APPROVED';
  revisionHistory?: RevisionHistoryRecord[];
  __seedMeta?: {
    seededAt: string;
    sources: {
      project: { id: string; code: string } | null;
      po: { id: number; number: string } | null;
      pwo: { id: string; totalBudgetHours: number; departmentBudgets: Record<string, number> };
    };
  };
}

interface WADWizardProps {
  wadId: string;
  onClose: () => void;
  initialStep?: number | null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getScopeBreakdownOperation(scopeDescription?: string, fallbackDescription?: string | null): string {
  return normalizeText(scopeDescription) || normalizeText(fallbackDescription);
}

function shouldRefreshGeneratedOperation(
  currentOperation: string | undefined,
  previousScope: string,
  fallbackDescription?: string | null,
  seeded?: boolean
): boolean {
  const current = normalizeText(currentOperation);
  if (!current || seeded) return true;
  return current === previousScope || current === normalizeText(fallbackDescription);
}

const STEPS = [
  { id: 1, title: 'Contract Context', icon: FileText, short: 'Context' },
  { id: 2, title: 'Scope of Work', icon: ClipboardList, short: 'Scope' },
  { id: 3, title: 'Work Breakdown', icon: Users, short: 'Breakdown' },
  { id: 4, title: 'Charge Codes', icon: DollarSign, short: 'Charges' },
  { id: 5, title: 'Material Auth', icon: Package, short: 'Material' },
  { id: 6, title: 'Routing & Traveler', icon: Route, short: 'Routing' },
  { id: 7, title: 'Quality', icon: ShieldCheck, short: 'Quality' },
  { id: 8, title: 'Schedule', icon: Calendar, short: 'Schedule' },
  { id: 9, title: 'Risks', icon: AlertTriangle, short: 'Risks' },
  { id: 10, title: 'Documents', icon: FolderOpen, short: 'Docs' },
  { id: 11, title: 'Approvals', icon: Star, short: 'Approvals' },
  { id: 12, title: 'Final Review', icon: CheckCircle, short: 'Review' },
];

function clampWizardStep(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(Math.trunc(numeric), 1), STEPS.length);
}

function inferResumeStep(wizardData: WizardData): number {
  const explicitStep = clampWizardStep(wizardData.currentStep);
  if (explicitStep > 1) return explicitStep;

  for (let i = 10; i >= 1; i -= 1) {
    if (wizardData[`step${i}` as keyof WizardData]) {
      return clampWizardStep(i + 1);
    }
  }

  return 1;
}

function BoolField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox checked={value} onCheckedChange={(c) => onChange(!!c)} id={label} />
      <Label htmlFor={label} className="text-sm font-normal cursor-pointer">{label}</Label>
    </div>
  );
}

export default function WADWizard({ wadId, onClose, initialStep = null }: WADWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({});
  const [saving, setSaving] = useState(false);
  const [initialStepApplied, setInitialStepApplied] = useState(false);

  const { data: wizardCtx, isLoading } = useQuery<{ wad: any; project: any; po: any; controlStatus?: WadControlStatus; contractContextDefaults?: any }>({
    queryKey: ['/api/work-orders/production', wadId, 'wizard'],
    queryFn: () => apiRequest(`/api/work-orders/production/${wadId}/wizard`),
  });

  useEffect(() => {
    if (wizardCtx?.wad?.wizardData) {
      const savedData = wizardCtx.wad.wizardData as WizardData;
      setData(savedData);
      // Deep-link via ?step=<n> (e.g. from My Tasks WAD-approval assignment) wins over saved currentStep.
      if (initialStep != null && !initialStepApplied) {
        setStep(clampWizardStep(initialStep));
        setInitialStepApplied(true);
      } else {
        setStep(inferResumeStep(savedData));
      }
    }
  }, [wizardCtx, initialStep, initialStepApplied]);

  const saveMutation = useMutation({
    mutationFn: async (payload: { wizardData: WizardData; wadStatus?: string }) => {
      return apiRequest(`/api/work-orders/production/${wadId}/wizard`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      const updatedWizardData = result?.wad?.wizardData as WizardData | undefined;
      if (updatedWizardData) {
        setData(updatedWizardData);
        queryClient.setQueryData(['/api/work-orders/production', wadId, 'wizard'], (current: typeof wizardCtx | undefined) => ({
          ...(current ?? {}),
          wad: {
            ...(current?.wad ?? {}),
            ...(result.wad ?? {}),
            wizardData: updatedWizardData,
          },
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', wadId, 'wizard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', wadId] });
    },
    onError: (err: Error) => {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (payload: { role: string; displayName: string; decision: 'APPROVED' | 'REJECTED'; comments?: string; signature: string }) => {
      return apiRequest(`/api/work-orders/production/${wadId}/wizard/approve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      const updatedWizardData = result?.wad?.wizardData as WizardData | undefined;
      if (updatedWizardData) {
        setData(updatedWizardData);
        queryClient.setQueryData(['/api/work-orders/production', wadId, 'wizard'], (current: typeof wizardCtx | undefined) => ({
          ...(current ?? {}),
          wad: {
            ...(current?.wad ?? {}),
            ...(result.wad ?? {}),
            wizardData: updatedWizardData,
          },
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', wadId, 'wizard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', wadId] });
      if (result.allApproved) {
        toast({ title: 'WAD Approved!', description: 'All required approvals collected. WAD status set to APPROVED.' });
      } else {
        toast({ title: 'Approval recorded' });
      }
    },
    onError: (err: Error) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  const exceptionRequestMutation = useMutation({
    mutationFn: async (payload: { type: WadExceptionType; action: 'REQUEST' | 'APPROVE' | 'REJECT'; reason: string }) => {
      return apiRequest(`/api/work-orders/production/${wadId}/approval-requests`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/production', wadId, 'wizard'] });
      toast({ title: 'Approval request recorded' });
    },
    onError: (err: Error) => {
      toast({ title: 'Request failed', description: err.message, variant: 'destructive' });
    },
  });

  const patch = useCallback((key: keyof WizardData, value: unknown) => {
    setData(prev => ({ ...prev, [key]: value }));
  }, []);

  const saveAndGoTo = useCallback(async (targetStep: number) => {
    const nextStep = clampWizardStep(targetStep);
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ wizardData: { ...data, currentStep: nextStep } });
      setStep(nextStep);
    } finally {
      setSaving(false);
    }
  }, [data, saveMutation]);

  const handleNext = () => saveAndGoTo(step + 1);
  const handleBack = () => setStep(s => s - 1);

  const getStepRequirements = useCallback((s: number, d: WizardData): string[] => {
    const req: string[] = [];
    switch (s) {
      case 1: {
        const v = d.step1;
        // Accept either the new dual-field or legacy single partNumber for backward compat
        const hasPartNum = !!(v?.internalPartNumber?.trim() || v?.customerPartNumber?.trim() || v?.partNumber?.trim());
        if (!hasPartNum) req.push('Part number (internal or customer)');
        if (!v?.quantity || v.quantity <= 0) req.push('Quantity > 0');
        if (!v?.shipDate) req.push('Ship date');
        if (!v?.poReviewApproved) req.push('PO Review approved');
        break;
      }
      case 2: {
        const v = d.step2;
        if (!v?.scopeDescription?.trim()) req.push('Scope description');
        if (!v?.buildType?.trim()) req.push('Build type');
        if (!v?.departments || v.departments.length === 0) req.push('At least one department');
        break;
      }
      case 3: {
        const rows = d.step3?.rows ?? [];
        if (rows.length === 0) req.push('At least one work-breakdown row');
        if (rows.some((r) => !r.operation?.trim())) req.push('Operation for every row');
        if (rows.some((r) => !r.estimatedHours || r.estimatedHours <= 0)) req.push('Estimated hours > 0 for every row');
        break;
      }
      case 4: {
        const cc = d.step4?.chargeCodes ?? [];
        if (cc.length === 0) req.push('Charge-code rows must match work breakdown');
        if (cc.some((r) => !r.chargeCode?.trim())) req.push('Charge code for every operation');
        if (cc.some((r) => !r.budgetedHours || r.budgetedHours <= 0)) req.push('Budgeted hours > 0 for every operation');
        break;
      }
      case 5: {
        const v = d.step5;
        if (v == null) req.push('Confirm material authorization choices');
        break;
      }
      case 6: {
        const v = d.step6;
        if (v == null) req.push('Confirm routing/traveler requirements');
        else if (!v.travelerRequired && !v.finalQCOnly) req.push('Either traveler is required or Final-QC-only is acknowledged');
        break;
      }
      case 7: {
        const v = d.step7;
        if (!v?.inspectionLevel?.trim()) req.push('Inspection level');
        break;
      }
      case 8: {
        const v = d.step8;
        if (!v?.requiredCompletionDate) req.push('Required completion date');
        if (!v?.priority?.trim()) req.push('Priority');
        break;
      }
      case 9: {
        const risks = d.step9?.risks ?? [];
        if (risks.length === 0) req.push('At least one risk entry (or N/A row)');
        break;
      }
      case 10: {
        const docs = d.step10?.documents ?? [];
        const pending = docs.filter((doc) => doc.status === 'PENDING');
        if (docs.length === 0) req.push('Document checklist must be reviewed');
        if (pending.length > 0) req.push(`Resolve ${pending.length} pending document(s) (Attached or Waived)`);
        break;
      }
      case 11: {
        const required = REQUIRED_APPROVAL_ROLES.map((role) => role.key);
        const approved = new Set(
          (d.approvals ?? []).filter((a) => a.decision === 'APPROVED').map((a) => a.role)
        );
        const missing = required.filter((r) => !approved.has(r));
        if (missing.length > 0) req.push(`Awaiting approvals: ${missing.join(', ')}`);
        break;
      }
    }
    return req;
  }, []);

  const currentStepRequirements = getStepRequirements(step, data);
  const canAdvance = step >= 12 || currentStepRequirements.length === 0;

  // Resolve the loaded context BEFORE any conditional return so all hooks below run on
  // every render in a stable order (React hook ordering rule).
  const wad = wizardCtx?.wad;
  const project = wizardCtx?.project;
  const po = wizardCtx?.po;
  const controlStatus = wizardCtx?.controlStatus;
  const contractContextDefaults = wizardCtx?.contractContextDefaults ?? null;
  const wadStatus = wad?.wadStatus ?? 'DRAFT';
  const approvals: ApprovalRecord[] = (data.approvals ?? []) as ApprovalRecord[];
  const isBackfill = project?.currentStage === 'production';

  // Step 2 onChange: when departments change, prune Step 3 / Step 4 rows for
  // departments that are no longer selected, and re-seed rows for newly added
  // departments (from PWO budget when available, otherwise blank).
  const handleStep2Change = useCallback((v: WizardData['step2']) => {
    setData(prev => {
      const newDepts = v?.departments ?? [];
      const newDeptSet = new Set(newDepts);
      const prevDepts = prev.step2?.departments ?? [];
      const previousScope = normalizeText(prev.step2?.scopeDescription);
      const lineItemDescription: string | null = wad?.description ?? null;
      const scopeOperation = getScopeBreakdownOperation(v?.scopeDescription, lineItemDescription);
      const sameDepts =
        prevDepts.length === newDepts.length &&
        prevDepts.every(d => newDeptSet.has(d));

      if (sameDepts) {
        const next: WizardData = { ...prev, step2: v };
        if (scopeOperation && prev.step3?.rows?.length) {
          next.step3 = {
            rows: prev.step3.rows.map(row => (
              shouldRefreshGeneratedOperation(row.operation, previousScope, lineItemDescription, row.seeded)
                ? { ...row, operation: scopeOperation }
                : row
            )),
          };
        }
        if (scopeOperation && prev.step4?.chargeCodes?.length) {
          next.step4 = {
            chargeCodes: prev.step4.chargeCodes.map(row => (
              shouldRefreshGeneratedOperation(row.operation, previousScope, lineItemDescription, row.seeded)
                ? { ...row, operation: scopeOperation }
                : row
            )),
          };
        }
        return next;
      }

      const budgets = (wad?.departmentBudgets && typeof wad.departmentBudgets === 'object'
        ? (wad.departmentBudgets as Record<string, number>)
        : {}) as Record<string, number>;
      const defaultChargeCode = wad?.defaultChargeCodeId ? String(wad.defaultChargeCodeId) : '';

      const prevStep3Rows = prev.step3?.rows ?? [];
      const keptStep3 = prevStep3Rows
        .filter(r => newDeptSet.has(r.department))
        .map(row => (
          scopeOperation && shouldRefreshGeneratedOperation(row.operation, previousScope, lineItemDescription, row.seeded)
            ? { ...row, operation: scopeOperation }
            : row
        ));
      const existingStep3Depts = new Set(keptStep3.map(r => r.department));
      const addedStep3: WorkBreakdownRow[] = [];
      for (const dept of newDepts) {
        if (existingStep3Depts.has(dept)) continue;
        const hrs = budgets[dept];
        if (hrs !== undefined) {
          addedStep3.push({
            department: dept,
            operation: scopeOperation,
            responsibleLead: '',
            estimatedHours: typeof hrs === 'number' ? hrs : Number(hrs) || 0,
            requiredCerts: '',
            isTravelerStep: false,
            requiresQCSignoff: false,
            seeded: true,
            seededFrom: 'PWO budget + PO line item',
          });
        } else {
          addedStep3.push({
            department: dept,
            operation: scopeOperation,
            responsibleLead: '',
            estimatedHours: 0,
            requiredCerts: '',
            isTravelerStep: false,
            requiresQCSignoff: false,
          });
        }
      }
      const nextStep3Rows = [...keptStep3, ...addedStep3];

      const prevStep4 = prev.step4?.chargeCodes ?? [];
      const keptStep4 = prevStep4
        .filter(c => newDeptSet.has(c.department))
        .map(row => (
          scopeOperation && shouldRefreshGeneratedOperation(row.operation, previousScope, lineItemDescription, row.seeded)
            ? { ...row, operation: scopeOperation }
            : row
        ));
      const existingStep4Depts = new Set(keptStep4.map(c => c.department));
      const addedStep4: ChargeCodeRow[] = [];
      for (const row of addedStep3) {
        if (existingStep4Depts.has(row.department)) continue;
        // Only mark as seeded when the row was actually auto-populated from
        // the PWO budget and/or the project's default charge code. A blank
        // baseline row (no budget AND no default code) is a manual entry.
        const hasBudget = !!row.seeded;
        const hasDefaultCode = !!defaultChargeCode;
        const isAutoPopulated = hasBudget || hasDefaultCode;
        let seededFrom: string | undefined;
        if (hasBudget && hasDefaultCode) {
          seededFrom = 'Project default charge code + PWO budget';
        } else if (hasDefaultCode) {
          seededFrom = 'Project default charge code';
        } else if (hasBudget) {
          seededFrom = 'PWO budget';
        }
        addedStep4.push({
          department: row.department,
          operation: row.operation,
          chargeCode: defaultChargeCode,
          laborCategory: '',
          classification: 'DIRECT',
          budgetedHours: row.estimatedHours,
          overtimeAllowed: false,
          operatorOverrideAllowed: false,
          overrunRule: 'WARN',
          seeded: isAutoPopulated || undefined,
          seededFrom,
        });
      }
      const nextStep4Codes = [...keptStep4, ...addedStep4];

      const next: WizardData = { ...prev, step2: v };
      if (prev.step3 || nextStep3Rows.length > 0) {
        next.step3 = { rows: nextStep3Rows };
      }
      if (prev.step4 || nextStep4Codes.length > 0) {
        next.step4 = { chargeCodes: nextStep4Codes };
      }
      return next;
    });
  }, [wad]);

  // Auto-fill Step 1 from upstream docs on FIRST OPEN ONLY.
  // If step1 already exists in saved wizard data we do nothing — the user's
  // saved state (including any manual edits) is always authoritative after
  // first open. This is a strict first-open guard with no partial re-sync.
  useEffect(() => {
    if (!contractContextDefaults) return;
    setData((prev) => {
      // step1 already saved → skip entirely (strict first-open-only)
      if (prev.step1) return prev;

      const dv = contractContextDefaults.values as Record<string, unknown>;
      const ds = contractContextDefaults.sources as Record<string, string | null>;
      // Build provenance map for every field that has a source
      const sources: Record<string, string> = {};
      for (const k of Object.keys(dv)) { if (ds[k]) sources[k] = ds[k] as string; }

      return {
        ...prev,
        step1: {
          projectNumber:        String(dv.projectNumber ?? ''),
          customer:             String(dv.customer ?? ''),
          poNumber:             String(dv.poNumber ?? ''),
          customerPartNumber:   String(dv.customerPartNumber ?? ''),
          internalPartNumber:   String(dv.internalPartNumber ?? ''),
          // Keep legacy partNumber in sync with internalPartNumber for backward compat
          partNumber:           String(dv.internalPartNumber ?? ''),
          revision:             String(dv.revision ?? ''),
          quantity:             Number(dv.quantity ?? 1),
          shipDate:             String(dv.shipDate ?? ''),
          contractReviewStatus: String(dv.contractReviewStatus ?? ''),
          riskAssessmentStatus: String(dv.riskAssessmentStatus ?? ''),
          poReviewApproved:     Boolean(dv.poReviewApproved),
          __sources:            sources,
        } as WizardData['step1'],
      };
    });
  }, [contractContextDefaults]);

  // Prefill from canonical project/PO/PWO data when blank. Declared above the
  // early `isLoading` return to keep hook order stable across renders.
  useEffect(() => {
    if (!wad) return;
    const budgets = (wad.departmentBudgets && typeof wad.departmentBudgets === 'object'
      ? (wad.departmentBudgets as Record<string, number>)
      : {}) as Record<string, number>;
    const budgetEntries = Object.entries(budgets);
    const lineItemDescription: string | null = wad.description ?? null;
    const totalBudget: number = wad.totalBudgetHours
      ? Number(wad.totalBudgetHours) || 0
      : budgetEntries.reduce((sum, [, h]) => sum + (Number(h) || 0), 0);
    const defaultChargeCode = wad.defaultChargeCodeId ? String(wad.defaultChargeCodeId) : '';
    setData((prev) => {
      const next: WizardData = { ...prev };
      if (!next.step2 || ((next.step2.scopeDescription ?? '') === '' && (next.step2.departments ?? []).length === 0)) {
        next.step2 = {
          scopeDescription: lineItemDescription ?? next.step2?.scopeDescription ?? '',
          buildType: next.step2?.buildType ?? '',
          deliverables: next.step2?.deliverables ?? '',
          departments: budgetEntries.length > 0
            ? budgetEntries.map(([k]) => k)
            : (next.step2?.departments ?? []),
        };
      }
      const scopeOperation = getScopeBreakdownOperation(next.step2?.scopeDescription, lineItemDescription);
      const selectedDepts = new Set(next.step2?.departments ?? []);
      const filteredBudgetEntries = budgetEntries.filter(([k]) => selectedDepts.has(k));
      if ((!next.step3 || (next.step3.rows ?? []).length === 0) && filteredBudgetEntries.length > 0) {
        next.step3 = {
          rows: filteredBudgetEntries.map(([dept, hrs]) => ({
            department: dept,
            operation: scopeOperation,
            responsibleLead: '',
            estimatedHours: typeof hrs === 'number' ? hrs : Number(hrs) || 0,
            requiredCerts: '',
            isTravelerStep: false,
            requiresQCSignoff: false,
            seeded: true,
            seededFrom: 'PWO budget + PO line item',
          })),
        };
      }
      const wbRows = (next.step3?.rows ?? []).filter((r) => selectedDepts.has(r.department));
      if ((!next.step4 || (next.step4.chargeCodes ?? []).length === 0) && wbRows.length > 0) {
        next.step4 = {
          chargeCodes: wbRows.map((r) => ({
            department: r.department,
            operation: r.operation,
            chargeCode: defaultChargeCode,
            laborCategory: '',
            classification: 'DIRECT' as const,
            budgetedHours: r.estimatedHours,
            overtimeAllowed: false,
            operatorOverrideAllowed: false,
            overrunRule: 'WARN' as const,
            seeded: true,
            seededFrom: defaultChargeCode
              ? 'Project default charge code + PWO budget'
              : 'PWO budget',
          })),
        };
      }
      // Load-time normalization: regardless of whether step3/step4 already
      // existed in the persisted data, prune any rows whose department is no
      // longer in step2.departments. This cleans up stale rows from prior
      // wizard sessions (e.g. before this fix) and prevents them from being
      // persisted on save from later steps without ever rendering Step 3.
      if (next.step3?.rows?.length) {
        const pruned = next.step3.rows.filter(r => selectedDepts.has(r.department));
        if (pruned.length !== next.step3.rows.length) {
          next.step3 = { rows: pruned };
        }
      }
      if (scopeOperation && next.step3?.rows?.length) {
        const currentRows = next.step3.rows;
        const synced = currentRows.map(row => (
          shouldRefreshGeneratedOperation(row.operation, '', lineItemDescription, row.seeded)
            ? { ...row, operation: scopeOperation }
            : row
        ));
        if (synced.some((row, index) => row !== currentRows[index])) {
          next.step3 = { rows: synced };
        }
      }
      if (next.step4?.chargeCodes?.length) {
        const pruned = next.step4.chargeCodes.filter(c => selectedDepts.has(c.department));
        if (pruned.length !== next.step4.chargeCodes.length) {
          next.step4 = { chargeCodes: pruned };
        }
      }
      if (scopeOperation && next.step4?.chargeCodes?.length) {
        const currentRows = next.step4.chargeCodes;
        const synced = currentRows.map(row => (
          shouldRefreshGeneratedOperation(row.operation, '', lineItemDescription, row.seeded)
            ? { ...row, operation: scopeOperation }
            : row
        ));
        if (synced.some((row, index) => row !== currentRows[index])) {
          next.step4 = { chargeCodes: synced };
        }
      }
      if ((!next.step8 || !next.step8.requiredCompletionDate) && (wad.dueDate || project?.targetShipDate)) {
        next.step8 = {
          authorizedStartDate: next.step8?.authorizedStartDate ?? '',
          requiredCompletionDate: next.step8?.requiredCompletionDate
            ?? (wad.dueDate ?? project?.targetShipDate ?? ''),
          deptDueDates: next.step8?.deptDueDates ?? {},
          priority: next.step8?.priority ?? '',
          dailyTargetQty: next.step8?.dailyTargetQty ?? Math.max(1, Math.ceil((wad.quantity ?? 1) / 30)),
          capacityRisk: next.step8?.capacityRisk ?? '',
          bottleneckDepartment: next.step8?.bottleneckDepartment ?? '',
        };
      }
      const meta = next.__seedMeta;
      if (!meta && (budgetEntries.length > 0 || lineItemDescription)) {
        next.__seedMeta = {
          seededAt: new Date().toISOString(),
          sources: {
            project: project ? { id: project.id as string, code: project.projectCode as string } : null,
            po: po ? { id: po.id as number, number: po.poNumber as string } : null,
            pwo: { id: wad.id as string, totalBudgetHours: totalBudget, departmentBudgets: budgets },
          },
        };
      }
      return next;
    });
  }, [wad?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Progress: 10 step cards + approvals card + final review card = 12 cards.
  const STEP_KEYS = ['step1','step2','step3','step4','step5','step6','step7','step8','step9','step10'] as const;
  type StepKey = typeof STEP_KEYS[number];
  const stepBag = data as Partial<Record<StepKey, Record<string, unknown> | null | undefined>>;
  const stepCardsFilled = STEP_KEYS.filter((k) => {
    const v = stepBag[k];
    return v != null && typeof v === 'object' && Object.keys(v).length > 0;
  }).length;
  const approvalsCard = approvals.length > 0 ? 1 : 0;
  const finalCard = wadStatus === 'APPROVED' ? 1 : 0;
  const percentComplete = wadStatus === 'APPROVED'
    ? 100
    : Math.round(((stepCardsFilled + approvalsCard + finalCard) / 12) * 100);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">WAD Wizard — {wad?.workOrderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {project?.projectName ?? ''}
            {project?.projectCode && <span className="ml-1">· {project.projectCode}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isBackfill && wadStatus !== 'APPROVED' && (
            <Badge className="bg-amber-100 text-amber-800 border border-amber-300" data-testid="badge-backfill-mode">
              BACKFILL — already in production
            </Badge>
          )}
          <Badge variant="outline" data-testid="badge-step-of-twelve">Step {step} of 12</Badge>
          <Badge variant="outline" data-testid="badge-percent-complete">{percentComplete}%</Badge>
          <Badge className={
            wadStatus === 'APPROVED' ? 'bg-green-100 text-green-800' :
            wadStatus === 'PENDING_APPROVAL' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-700'
          }>
            {wadStatus}
          </Badge>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
      {isBackfill && wadStatus !== 'APPROVED' && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-900 text-sm">
            This project is already in <strong>production</strong>. Authoring this WAD is a permitted
            backfill — approving it will record a <code>wad_backfill</code> entry in the audit ledger and
            flip the WAD gate without changing the project stage.
          </AlertDescription>
        </Alert>
      )}

      {/* Step progress indicator */}
      <div className="overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max pb-2">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isComplete = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => step > s.id && setStep(s.id)}
                  className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition-colors ${
                    isComplete ? 'cursor-pointer hover:bg-green-50' : 'cursor-default'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold ${
                    isComplete ? 'bg-green-600 border-green-600 text-white' :
                    isCurrent ? 'border-blue-600 text-blue-600 bg-blue-50' :
                    'border-muted text-muted-foreground'
                  }`}>
                    {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={`text-xs whitespace-nowrap ${isCurrent ? 'font-semibold text-blue-700' : 'text-muted-foreground'}`}>
                    {s.short}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`w-4 h-0.5 mx-0.5 ${isComplete ? 'bg-green-600' : 'bg-muted'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {(() => { const Icon = STEPS[step - 1].icon; return <Icon className="h-4 w-4" />; })()}
            Step {step}: {STEPS[step - 1].title}
          </CardTitle>
          {currentStepRequirements.length > 0 && step < 12 && (
            <Alert className="mt-2 border-amber-300 bg-amber-50" data-testid={`alert-step-requirements-${step}`}>
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs">
                <span className="font-semibold text-amber-800">Required to advance:</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-amber-900">
                  {currentStepRequirements.map((r, i) => (
                    <li key={i} data-testid={`text-step-req-${step}-${i}`}>{r}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {currentStepRequirements.length === 0 && step < 12 && (
            <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1" data-testid={`text-step-ready-${step}`}>
              <Check className="h-3 w-3" /> All requirements met — you may continue.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {/* ── Step 1: Contract Context ─────────────────────────────── */}
          {step === 1 && (
            <Step1ContractContext
              data={data.step1}
              project={project}
              po={po}
              wad={wad}
              contractContextDefaults={contractContextDefaults}
              onChange={(v) => patch('step1', v)}
            />
          )}
          {/* ── Step 2: Scope of Work ────────────────────────────────── */}
          {step === 2 && (
            <Step2ScopeOfWork
              data={data.step2}
              onChange={handleStep2Change}
            />
          )}
          {/* ── Step 3: Work Breakdown ───────────────────────────────── */}
          {step === 3 && (
            <Step3WorkBreakdown
              departments={data.step2?.departments ?? []}
              scopeDescription={data.step2?.scopeDescription ?? ''}
              data={data.step3}
              onChange={(v) => patch('step3', v)}
              onRemoveDepartment={(dept) => {
                const currentStep2 = data.step2 ?? { scopeDescription: '', departments: [] as string[] };
                const nextDepts = (currentStep2.departments ?? []).filter(d => d !== dept);
                handleStep2Change({ ...currentStep2, departments: nextDepts });
              }}
            />
          )}
          {/* ── Step 4: Charge Codes ─────────────────────────────────── */}
          {step === 4 && (
            <Step4ChargeCodes
              rows={data.step3?.rows ?? []}
              data={data.step4}
              onChange={(v) => patch('step4', v)}
            />
          )}
          {/* ── Step 5: Material Auth ────────────────────────────────── */}
          {step === 5 && (
            <Step5MaterialAuth
              data={data.step5}
              onChange={(v) => patch('step5', v)}
            />
          )}
          {/* ── Step 6: Routing & Traveler ───────────────────────────── */}
          {step === 6 && (
            <Step6RoutingTraveler
              data={data.step6}
              onChange={(v) => patch('step6', v)}
            />
          )}
          {/* ── Step 7: Quality Requirements ────────────────────────── */}
          {step === 7 && (
            <Step7Quality
              data={data.step7}
              onChange={(v) => patch('step7', v)}
            />
          )}
          {/* ── Step 8: Schedule & Capacity ─────────────────────────── */}
          {step === 8 && (
            <Step8Schedule
              departments={data.step2?.departments ?? []}
              data={data.step8}
              onChange={(v) => patch('step8', v)}
            />
          )}
          {/* ── Step 9: Risks ────────────────────────────────────────── */}
          {step === 9 && (
            <Step9Risks
              data={data.step9}
              onChange={(v) => patch('step9', v)}
            />
          )}
          {/* ── Step 10: Document Checklist ──────────────────────────── */}
          {step === 10 && (
            <Step10Documents
              data={data.step10}
              onChange={(v) => patch('step10', v)}
            />
          )}
          {/* ── Step 11: Approvals ───────────────────────────────────── */}
          {step === 11 && (
            <Step11Approvals
              approvals={approvals}
              assignments={(data.approvalAssignments ?? {}) as ApprovalAssignmentsMap}
              onAssignmentsChange={(next) => {
                setData((prev) => ({ ...prev, approvalAssignments: next }));
                saveMutation.mutate({ wizardData: { ...data, approvalAssignments: next } });
              }}
              wadId={wadId}
              approveMutation={approveMutation}
            />
          )}
          {/* ── Step 12: Final Review ────────────────────────────────── */}
          {step === 12 && (
            <Step12FinalReview
              data={data}
              wad={wad}
              approvals={approvals}
              controlStatus={controlStatus}
              approvalRequests={data.approvalRequests ?? []}
              revisionHistory={data.revisionHistory ?? []}
              exceptionRequestMutation={exceptionRequestMutation}
              onApprove={async () => {
                // Persist the latest wizardData. The actual APPROVED transition happens
                // server-side in POST /wizard/approve once all required slots are
                // signed (Step 11). PATCH is intentionally not allowed to set APPROVED.
                await saveMutation.mutateAsync({ wizardData: data });
                const allRequired = REQUIRED_APPROVAL_ROLES
                  .every((role) => approvals.some((a) => a.role === role.key && a.decision === 'APPROVED'));
                toast({
                  title: allRequired ? 'WAD approvals complete' : 'Final review saved',
                  description: allRequired
                    ? 'All required approvals are recorded — WAD has been promoted to APPROVED on the server.'
                    : 'Collect PM, engineering, quality, operations, and executive approvals on Step 11.',
                });
                queryClient.invalidateQueries({ queryKey: ['/api/work-orders', wadId] });
              }}
              isSaving={saveMutation.isPending}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1 || saving}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => saveMutation.mutate({ wizardData: { ...data, currentStep: step } })}
            disabled={saveMutation.isPending || saving}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save Draft
          </Button>
          {step < 12 && (
            <Button
              onClick={handleNext}
              disabled={saving || saveMutation.isPending || !canAdvance}
              title={!canAdvance ? `Complete: ${currentStepRequirements.join(', ')}` : undefined}
              data-testid="button-next-step"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Contract Context ─────────────────────────────────────────────────

// Friendly labels for source tags shown under each field
const SOURCE_LABELS: Record<string, string> = {
  'auto:project': 'from Project',
  'auto:po':      'from Customer PO',
  'auto:po-review': 'from PO Review',
  'auto:rfq':     'from RFQ',
  'auto:wad':     'from WAD record',
  'user':         'edited',
};

// Which upstream doc is expected to supply each field (used for "missing source" hint)
const EXPECTED_SOURCE: Record<string, string> = {
  projectNumber:         'Project',
  customer:              'PO Review / RFQ / Project',
  poNumber:              'Customer PO / PO Review',
  customerPartNumber:    'PO Review / Customer PO',
  internalPartNumber:    'WAD record',
  revision:              'PO Review',
  quantity:              'PO Review / Customer PO',
  shipDate:              'PO Review / Customer PO',
  contractReviewStatus:  'RFQ',
  riskAssessmentStatus:  'RFQ',
  poReviewApproved:      'PO Review',
};

function SourceHint({ fieldKey, sources, hasValue }: {
  fieldKey: string;
  sources: Record<string, string>;
  hasValue: boolean;
}) {
  const src = sources[fieldKey];
  if (!src && !hasValue) {
    return (
      <p className="text-xs text-muted-foreground mt-0.5 italic">
        missing source — would come from {EXPECTED_SOURCE[fieldKey] ?? 'upstream docs'}
      </p>
    );
  }
  if (!src) return null;
  const label = SOURCE_LABELS[src] ?? src;
  const isUser = src === 'user';
  return (
    <p className={`text-xs mt-0.5 ${isUser ? 'text-amber-600' : 'text-emerald-700'}`}>
      {isUser ? '✎ edited' : `↳ ${label}`}
    </p>
  );
}

function Step1ContractContext({ data, project, po, wad, contractContextDefaults, onChange }: {
  data?: WizardData['step1'];
  project: any;
  po: any;
  wad: any;
  contractContextDefaults: any;
  onChange: (v: WizardData['step1']) => void;
}) {
  // Build base: prefer saved data, fall back to simple local defaults
  const base: NonNullable<WizardData['step1']> = {
    projectNumber: project?.projectCode ?? '',
    customer: project?.customerNameSnapshot ?? project?.customerId ?? '',
    poNumber: po?.poNumber ?? '',
    customerPartNumber: '',
    internalPartNumber: wad?.partNumber ?? '',
    // Legacy compat: if existing saved data had partNumber only, mirror it
    partNumber: undefined,
    revision: '',
    quantity: wad?.quantity ?? 1,
    shipDate: wad?.dueDate ?? po?.expectedDelivery ?? '',
    contractReviewStatus: '',
    riskAssessmentStatus: '',
    poReviewApproved: false,
    __sources: {},
    ...(data ?? {}),
  };

  // Backward compat: if only legacy partNumber exists, show it in internalPartNumber
  if (!base.internalPartNumber && !base.customerPartNumber && base.partNumber) {
    base.internalPartNumber = base.partNumber;
  }

  const sources: Record<string, string> = (base.__sources ?? {}) as Record<string, string>;

  const set = (k: keyof NonNullable<WizardData['step1']>, v: unknown) => {
    // When the user edits a field, mark it as 'user' so auto-fill won't overwrite on reload
    const newSources = { ...sources, [k]: 'user' };
    onChange({ ...base, [k]: v, __sources: newSources } as WizardData['step1']);
  };

  const hasDefaults = !!contractContextDefaults;

  return (
    <div className="space-y-4">
      {!base.poReviewApproved && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            PO Review must be <strong>Approved</strong> before this WAD can be finalized. Confirm the PO review status below.
          </AlertDescription>
        </Alert>
      )}

      {hasDefaults && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
          <CheckCircle className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          Fields marked <span className="text-emerald-700 font-medium">↳ from …</span> were auto-filled from upstream documents.
          You can edit any field — changes are labelled <span className="text-amber-600 font-medium">✎ edited</span> and preserved across saves.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Project Number</Label>
          <Input
            value={base.projectNumber}
            onChange={e => set('projectNumber', e.target.value)}
            data-testid="input-step1-project-number"
          />
          <SourceHint fieldKey="projectNumber" sources={sources} hasValue={!!base.projectNumber} />
        </div>
        <div className="space-y-1">
          <Label>Customer</Label>
          <Input
            value={base.customer}
            onChange={e => set('customer', e.target.value)}
            data-testid="input-step1-customer"
          />
          <SourceHint fieldKey="customer" sources={sources} hasValue={!!base.customer} />
        </div>
        <div className="space-y-1">
          <Label>Customer PO Number</Label>
          <Input
            value={base.poNumber}
            onChange={e => set('poNumber', e.target.value)}
            data-testid="input-step1-po-number"
          />
          <SourceHint fieldKey="poNumber" sources={sources} hasValue={!!base.poNumber} />
        </div>
        <div className="space-y-1">
          <Label>Revision</Label>
          <Input
            value={base.revision}
            onChange={e => set('revision', e.target.value)}
            placeholder="e.g. A"
            data-testid="input-step1-revision"
          />
          <SourceHint fieldKey="revision" sources={sources} hasValue={!!base.revision} />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            Customer Part Number
            <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal text-blue-700 border-blue-300">invoices · packing slips</Badge>
          </Label>
          <Input
            value={base.customerPartNumber}
            onChange={e => set('customerPartNumber', e.target.value)}
            placeholder="Customer-facing P/N"
            data-testid="input-step1-customer-part-number"
          />
          <SourceHint fieldKey="customerPartNumber" sources={sources} hasValue={!!base.customerPartNumber} />
        </div>
        <div className="space-y-1">
          <Label className="flex items-center gap-1.5">
            Internal Part Number
            <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal text-purple-700 border-purple-300">routing · travelers · W/I · spec sheets</Badge>
          </Label>
          <Input
            value={base.internalPartNumber}
            onChange={e => set('internalPartNumber', e.target.value)}
            placeholder="Internal P/N"
            data-testid="input-step1-internal-part-number"
          />
          <SourceHint fieldKey="internalPartNumber" sources={sources} hasValue={!!base.internalPartNumber} />
        </div>
        <div className="space-y-1">
          <Label>Quantity</Label>
          <Input
            type="number"
            min={1}
            value={base.quantity}
            onChange={e => set('quantity', parseInt(e.target.value) || 1)}
            data-testid="input-step1-quantity"
          />
          <SourceHint fieldKey="quantity" sources={sources} hasValue={base.quantity > 1} />
        </div>
        <div className="space-y-1">
          <Label>Required Ship Date</Label>
          <Input
            type="date"
            value={base.shipDate}
            onChange={e => set('shipDate', e.target.value)}
            data-testid="input-step1-ship-date"
          />
          <SourceHint fieldKey="shipDate" sources={sources} hasValue={!!base.shipDate} />
        </div>
        <div className="space-y-1">
          <Label>Contract Review Status</Label>
          <Select value={base.contractReviewStatus} onValueChange={v => set('contractReviewStatus', v)}>
            <SelectTrigger data-testid="select-step1-contract-review-status">
              <SelectValue placeholder="Select status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_REVIEW">In Review</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <SourceHint fieldKey="contractReviewStatus" sources={sources} hasValue={!!base.contractReviewStatus} />
        </div>
        <div className="space-y-1">
          <Label>Risk Assessment Status</Label>
          <Select value={base.riskAssessmentStatus} onValueChange={v => set('riskAssessmentStatus', v)}>
            <SelectTrigger data-testid="select-step1-risk-assessment-status">
              <SelectValue placeholder="Select status…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOT_STARTED">Not Started</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETE">Complete</SelectItem>
            </SelectContent>
          </Select>
          <SourceHint fieldKey="riskAssessmentStatus" sources={sources} hasValue={!!base.riskAssessmentStatus} />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            checked={base.poReviewApproved}
            onCheckedChange={c => set('poReviewApproved', !!c)}
            id="po-review"
            data-testid="checkbox-step1-po-review-approved"
          />
          <Label htmlFor="po-review" className="font-medium cursor-pointer text-sm">
            I confirm the PO Review has been <strong>Approved</strong> (required gate to start WAD)
          </Label>
        </div>
        <div className="pl-6">
          <SourceHint fieldKey="poReviewApproved" sources={sources} hasValue={base.poReviewApproved} />
        </div>
      </div>
    </div>
  );
}

// ─── Step 2: Scope of Work ────────────────────────────────────────────────────
function Step2ScopeOfWork({ data, onChange }: {
  data?: WizardData['step2'];
  onChange: (v: WizardData['step2']) => void;
}) {
  const base: NonNullable<WizardData['step2']> = {
    scopeDescription: '',
    buildType: '',
    departments: [],
    deliverables: '',
    ...(data ?? {}),
  };

  const set = (k: keyof NonNullable<WizardData['step2']>, v: unknown) =>
    onChange({ ...base, [k]: v } as WizardData['step2']);

  const toggleDept = (key: string) => {
    const existing = base.departments ?? [];
    set('departments', existing.includes(key) ? existing.filter(d => d !== key) : [...existing, key]);
  };

  const removeDept = (key: string) => {
    set('departments', (base.departments ?? []).filter(d => d !== key));
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Label>Scope of Work Description <span className="text-red-500">*</span></Label>
        <Textarea
          rows={3}
          value={base.scopeDescription}
          onChange={e => set('scopeDescription', e.target.value)}
          placeholder="Describe what is authorized to build…"
        />
      </div>
      <div className="space-y-1">
        <Label>Build Type <span className="text-red-500">*</span></Label>
        <Select value={base.buildType} onValueChange={v => set('buildType', v)}>
          <SelectTrigger><SelectValue placeholder="Select build type…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PROTOTYPE">Prototype</SelectItem>
            <SelectItem value="PRODUCTION">Production</SelectItem>
            <SelectItem value="REPAIR">Repair</SelectItem>
            <SelectItem value="ENGINEERING_SAMPLE">Engineering Sample</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Departments Involved <span className="text-red-500">*</span></Label>
        {(base.departments ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(base.departments ?? []).map(key => {
              const dept = WAD_DEPARTMENTS.find(d => d.key === key);
              const label = dept?.label ?? key;
              return (
                <Badge key={key} variant="secondary" className="gap-1 pl-2 pr-1">
                  {label}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    className="rounded-sm p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => removeDept(key)}
                    data-testid={`button-remove-department-${key}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {WAD_DEPARTMENTS.map(dept => (
            <div
              key={dept.key}
              className={`flex items-center gap-2 rounded border p-2 cursor-pointer transition-colors ${
                base.departments?.includes(dept.key) ? 'border-blue-500 bg-blue-50' : 'border-border hover:bg-muted/40'
              }`}
              onClick={() => toggleDept(dept.key)}
            >
              <Checkbox
                checked={base.departments?.includes(dept.key) ?? false}
                onCheckedChange={() => toggleDept(dept.key)}
                className="pointer-events-none"
              />
              <div>
                <p className="text-sm font-medium">{dept.label}</p>
                {(dept.isSpecialProcess || dept.requiresCertification) && (
                  <p className="text-xs text-amber-600">
                    {dept.isSpecialProcess ? 'Special Process' : ''}
                    {dept.isSpecialProcess && dept.requiresCertification ? ' · ' : ''}
                    {dept.requiresCertification ? 'Cert Required' : ''}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Deliverables</Label>
        <Textarea
          rows={2}
          value={base.deliverables}
          onChange={e => set('deliverables', e.target.value)}
          placeholder="List deliverables (assemblies, reports, certs…)"
        />
      </div>
    </div>
  );
}

// ─── Step 3: Work Breakdown ───────────────────────────────────────────────────
function Step3WorkBreakdown({ departments, scopeDescription, data, onChange, onRemoveDepartment }: {
  departments: string[];
  scopeDescription?: string;
  data?: WizardData['step3'];
  onChange: (v: WizardData['step3']) => void;
  onRemoveDepartment?: (dept: string) => void;
}) {
  const deptLabels = Object.fromEntries(WAD_DEPARTMENTS.map(d => [d.key, d.label]));
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const isRowDirty = (row: WorkBreakdownRow): boolean => {
    if (row.seeded) return false;
    const scopeOperation = getScopeBreakdownOperation(scopeDescription);
    const opIsDefault = (row.operation ?? '') === (scopeOperation ?? '');
    return (
      !opIsDefault ||
      !!(row.responsibleLead && row.responsibleLead.trim()) ||
      !!(row.requiredCerts && row.requiredCerts.trim()) ||
      (typeof row.estimatedHours === 'number' && row.estimatedHours !== 0) ||
      !!row.isTravelerStep ||
      !!row.requiresQCSignoff
    );
  };

  const requestRemove = (row: WorkBreakdownRow) => {
    if (!onRemoveDepartment) return;
    if (isRowDirty(row)) {
      setPendingRemove(row.department);
    } else {
      onRemoveDepartment(row.department);
    }
  };

  const confirmRemove = () => {
    if (pendingRemove && onRemoveDepartment) {
      onRemoveDepartment(pendingRemove);
    }
    setPendingRemove(null);
  };

  const existingRows: WorkBreakdownRow[] = data?.rows ?? [];

  const ensureRows = (): WorkBreakdownRow[] => {
    const existingByDept = new Map(existingRows.map(r => [r.department, r]));
    const scopeOperation = getScopeBreakdownOperation(scopeDescription);
    return departments.map(dept => {
      const existing = existingByDept.get(dept);
      if (existing) {
        return scopeOperation && shouldRefreshGeneratedOperation(existing.operation, '', undefined, existing.seeded)
          ? { ...existing, operation: scopeOperation }
          : existing;
      }
      return {
        department: dept,
        operation: scopeOperation,
        responsibleLead: '',
        estimatedHours: 0,
        requiredCerts: '',
        isTravelerStep: false,
        requiresQCSignoff: false,
      };
    });
  };

  const [rows, setRows] = useState<WorkBreakdownRow[]>(ensureRows);

  useEffect(() => {
    const next = ensureRows();
    setRows(next);
    // Keep parent's persisted step3.rows in sync with the currently-selected
    // departments, so de-selected departments don't linger in saved state and
    // newly-selected departments appear immediately. Only push when the row
    // set actually differs to avoid an update loop.
    const existingSignature = existingRows.map(r => `${r.department}:${r.operation}`).join('|');
    const nextSignature = next.map(r => `${r.department}:${r.operation}`).join('|');
    if (existingSignature !== nextSignature) {
      onChange({ rows: next });
    }
  }, [departments, scopeDescription]);

  const setRow = (idx: number, patch: Partial<WorkBreakdownRow>) => {
    const next = rows.map((r, i) => i === idx ? { ...r, ...patch, seeded: false, seededFrom: undefined } : r);
    setRows(next);
    onChange({ rows: next });
  };

  if (departments.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No departments selected. Go back to Step 2 to select departments.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Fill in the work breakdown for each selected department. This drives traveler steps and QC gates.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Department</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead className="w-20">Est. Hours</TableHead>
              <TableHead>Req. Certs</TableHead>
              <TableHead className="w-20 text-center">Traveler</TableHead>
              <TableHead className="w-20 text-center">QC Signoff</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={row.department}>
                <TableCell className="font-medium text-sm">
                  <div className="flex items-center gap-1.5">
                    {deptLabels[row.department] ?? row.department}
                    {row.seeded && (
                      <Badge
                        variant="outline"
                        className="text-[9px] border-blue-400 text-blue-700 px-1 py-0"
                        title={row.seededFrom ?? 'Seeded from project data'}
                        data-testid={`badge-seeded-wb-${row.department}`}
                      >
                        Seeded
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Input
                    value={row.operation}
                    onChange={e => setRow(idx, { operation: e.target.value })}
                    placeholder="e.g. Layup panel"
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.responsibleLead}
                    onChange={e => setRow(idx, { responsibleLead: e.target.value })}
                    placeholder="Lead name"
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.estimatedHours}
                    onChange={e => setRow(idx, { estimatedHours: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm w-16"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={row.requiredCerts}
                    onChange={e => setRow(idx, { requiredCerts: e.target.value })}
                    placeholder="e.g. AS9100"
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={row.isTravelerStep}
                    onCheckedChange={c => setRow(idx, { isTravelerStep: !!c })}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Checkbox
                    checked={row.requiresQCSignoff}
                    onCheckedChange={c => setRow(idx, { requiresQCSignoff: !!c })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {onRemoveDepartment && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => requestRemove(row)}
                      aria-label={`Remove ${deptLabels[row.department] ?? row.department}`}
                      data-testid={`button-remove-wb-row-${row.department}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => { if (!open) setPendingRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingRemove ? (deptLabels[pendingRemove] ?? pendingRemove) : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This row has changes you've entered (operation, lead, hours, certs, or checkboxes).
              Removing it will discard those entries and also unselect the department on Step 2 and
              prune its Step 4 charge code row. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-wb-row">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} data-testid="button-confirm-remove-wb-row">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Step 4: Charge Codes ─────────────────────────────────────────────────────
function Step4ChargeCodes({ rows: wbRows, data, onChange }: {
  rows: WorkBreakdownRow[];
  data?: WizardData['step4'];
  onChange: (v: WizardData['step4']) => void;
}) {
  const deptLabels = Object.fromEntries(WAD_DEPARTMENTS.map(d => [d.key, d.label]));

  const buildDefault = (): ChargeCodeRow[] =>
    wbRows.map(r => ({
      department: r.department,
      operation: r.operation,
      chargeCode: '',
      laborCategory: '',
      classification: 'DIRECT',
      budgetedHours: r.estimatedHours,
      overtimeAllowed: false,
      operatorOverrideAllowed: false,
      overrunRule: 'WARN',
    } as ChargeCodeRow));

  const [rows, setRows] = useState<ChargeCodeRow[]>(() => {
    const existing = data?.chargeCodes ?? [];
    if (existing.length > 0) return existing;
    return buildDefault();
  });

  useEffect(() => {
    if (!data?.chargeCodes?.length) setRows(buildDefault());
  }, [wbRows]);

  const setRow = (idx: number, patch: Partial<ChargeCodeRow>) => {
    const next = rows.map((r, i) => i === idx ? { ...r, ...patch, seeded: false, seededFrom: undefined } : r);
    setRows(next);
    onChange({ chargeCodes: next });
  };

  if (wbRows.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No department operations defined. Complete Step 3 first.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Assign DCAA-compliant charge codes to each department operation. All labor clocked against this WAD will be validated against these codes.
      </p>
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <Card key={idx} className="p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{deptLabels[row.department] ?? row.department}</span>
                {row.operation && <span className="text-xs text-muted-foreground">— {row.operation}</span>}
                {row.seeded && (
                  <Badge
                    variant="outline"
                    className="text-[9px] border-blue-400 text-blue-700 px-1 py-0"
                    title={row.seededFrom ?? 'Seeded from project data'}
                    data-testid={`badge-seeded-cc-${row.department}`}
                  >
                    Seeded
                  </Badge>
                )}
              </div>
              <Badge variant="outline" className="text-xs">{row.classification}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Charge Code</Label>
                <Input
                  value={row.chargeCode}
                  onChange={e => setRow(idx, { chargeCode: e.target.value })}
                  placeholder="e.g. MFG-DL-001"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Labor Category</Label>
                <Input
                  value={row.laborCategory}
                  onChange={e => setRow(idx, { laborCategory: e.target.value })}
                  placeholder="e.g. Technician I"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Classification</Label>
                <Select value={row.classification} onValueChange={v => setRow(idx, { classification: v as ChargeCodeRow['classification'] })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">Direct</SelectItem>
                    <SelectItem value="INDIRECT">Indirect</SelectItem>
                    <SelectItem value="UNALLOWABLE">Unallowable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Budgeted Hours</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={row.budgetedHours}
                  onChange={e => setRow(idx, { budgetedHours: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Overrun Rule</Label>
                <Select value={row.overrunRule} onValueChange={v => setRow(idx, { overrunRule: v as ChargeCodeRow['overrunRule'] })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WARN">Warn</SelectItem>
                    <SelectItem value="REQUIRE_APPROVAL">Require Approval</SelectItem>
                    <SelectItem value="HARD_STOP">Hard Stop</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-4 pb-1">
                <BoolField label="Overtime Allowed" value={row.overtimeAllowed} onChange={v => setRow(idx, { overtimeAllowed: v })} />
                <BoolField label="Operator Override" value={row.operatorOverrideAllowed} onChange={v => setRow(idx, { operatorOverrideAllowed: v })} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Step 5: Material Auth ────────────────────────────────────────────────────
function Step5MaterialAuth({ data, onChange }: {
  data?: WizardData['step5'];
  onChange: (v: WizardData['step5']) => void;
}) {
  const base: NonNullable<WizardData['step5']> = {
    bomLinked: false,
    materialLotsRequired: false,
    serializedMaterial: false,
    icnScanRequired: false,
    expirationBlocking: false,
    outTimeTracking: false,
    customerSuppliedMaterial: false,
    certsRequired: false,
    materialSpendCap: 0,
    outsideProcessingCap: 0,
    materialOverrunRule: 'REQUIRE_APPROVAL',
    outsideProcessingRule: 'REQUIRE_APPROVAL',
    notes: '',
    ...(data ?? {}),
  };
  const set = (k: keyof NonNullable<WizardData['step5']>, v: unknown) =>
    onChange({ ...base, [k]: v } as WizardData['step5']);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Define material authorization rules for this WAD.</p>
      <div className="grid grid-cols-2 gap-3">
        <BoolField label="BOM Linked" value={base.bomLinked} onChange={v => set('bomLinked', v)} />
        <BoolField label="Material Lots Required" value={base.materialLotsRequired} onChange={v => set('materialLotsRequired', v)} />
        <BoolField label="Serialized Material" value={base.serializedMaterial} onChange={v => set('serializedMaterial', v)} />
        <BoolField label="ICN Scan Required" value={base.icnScanRequired} onChange={v => set('icnScanRequired', v)} />
        <BoolField label="Expiration Blocking" value={base.expirationBlocking} onChange={v => set('expirationBlocking', v)} />
        <BoolField label="Out-Time Tracking" value={base.outTimeTracking} onChange={v => set('outTimeTracking', v)} />
        <BoolField label="Customer-Supplied Material" value={base.customerSuppliedMaterial} onChange={v => set('customerSuppliedMaterial', v)} />
        <BoolField label="Certs Required" value={base.certsRequired} onChange={v => set('certsRequired', v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Material Spend Cap</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={base.materialSpendCap}
            onChange={e => set('materialSpendCap', parseFloat(e.target.value) || 0)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Material Cap Rule</Label>
          <Select value={base.materialOverrunRule} onValueChange={v => set('materialOverrunRule', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="REQUIRE_APPROVAL">Require Approval</SelectItem>
              <SelectItem value="HARD_STOP">Hard Stop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Outside Processing Cap</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={base.outsideProcessingCap}
            onChange={e => set('outsideProcessingCap', parseFloat(e.target.value) || 0)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Outside Processing Rule</Label>
          <Select value={base.outsideProcessingRule} onValueChange={v => set('outsideProcessingRule', v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="REQUIRE_APPROVAL">Require Approval</SelectItem>
              <SelectItem value="HARD_STOP">Hard Stop</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} value={base.notes} onChange={e => set('notes', e.target.value)} placeholder="Additional material authorization notes…" />
      </div>
    </div>
  );
}

// ─── Step 6: Routing & Traveler ───────────────────────────────────────────────
function Step6RoutingTraveler({ data, onChange }: {
  data?: WizardData['step6'];
  onChange: (v: WizardData['step6']) => void;
}) {
  const base: NonNullable<WizardData['step6']> = {
    routingRequired: true,
    travelerRequired: true,
    workInstructionRequired: false,
    specSheetRequired: false,
    inProcessInspectionRequired: false,
    finalQCOnly: false,
    spotCheckPlan: '',
    ...(data ?? {}),
  };
  const set = (k: keyof NonNullable<WizardData['step6']>, v: unknown) =>
    onChange({ ...base, [k]: v } as WizardData['step6']);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Define routing and traveler requirements for shop floor execution.</p>
      <div className="grid grid-cols-2 gap-3">
        <BoolField label="Routing Required" value={base.routingRequired} onChange={v => set('routingRequired', v)} />
        <BoolField label="Traveler Required" value={base.travelerRequired} onChange={v => set('travelerRequired', v)} />
        <BoolField label="Work Instruction Required" value={base.workInstructionRequired} onChange={v => set('workInstructionRequired', v)} />
        <BoolField label="Spec Sheet Required" value={base.specSheetRequired} onChange={v => set('specSheetRequired', v)} />
        <BoolField label="In-Process Inspection Required" value={base.inProcessInspectionRequired} onChange={v => set('inProcessInspectionRequired', v)} />
        <BoolField label="Final QC Only (no in-process)" value={base.finalQCOnly} onChange={v => set('finalQCOnly', v)} />
      </div>
      <div className="space-y-1">
        <Label>Spot Check Plan</Label>
        <Textarea rows={2} value={base.spotCheckPlan} onChange={e => set('spotCheckPlan', e.target.value)} placeholder="Describe spot check approach if applicable…" />
      </div>
    </div>
  );
}

// ─── Step 7: Quality Requirements ────────────────────────────────────────────
function Step7Quality({ data, onChange }: {
  data?: WizardData['step7'];
  onChange: (v: WizardData['step7']) => void;
}) {
  const base: NonNullable<WizardData['step7']> = {
    inspectionLevel: '',
    faiRequired: false,
    inProcessQC: false,
    finalQC: true,
    spotCheckSampleSize: '',
    spotCheckFrequency: '',
    spotCheckAcceptanceCriteria: '',
    spotCheckEscalationRule: '',
    customerSourceInspection: false,
    certPackageRequired: false,
    dimensionalReportRequired: false,
    ncrProcess: '',
    ...(data ?? {}),
  };
  const set = (k: keyof NonNullable<WizardData['step7']>, v: unknown) =>
    onChange({ ...base, [k]: v } as WizardData['step7']);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Inspection Level</Label>
          <Select value={base.inspectionLevel} onValueChange={v => set('inspectionLevel', v)}>
            <SelectTrigger><SelectValue placeholder="Select level…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LEVEL_1">Level I — Sample</SelectItem>
              <SelectItem value="LEVEL_2">Level II — Reduced</SelectItem>
              <SelectItem value="LEVEL_3">Level III — Normal</SelectItem>
              <SelectItem value="LEVEL_4">Level IV — Tightened</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>NCR Process</Label>
          <Input value={base.ncrProcess} onChange={e => set('ncrProcess', e.target.value)} placeholder="NCR disposition process…" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <BoolField label="FAI Required" value={base.faiRequired} onChange={v => set('faiRequired', v)} />
        <BoolField label="In-Process QC" value={base.inProcessQC} onChange={v => set('inProcessQC', v)} />
        <BoolField label="Final QC" value={base.finalQC} onChange={v => set('finalQC', v)} />
        <BoolField label="Customer Source Inspection" value={base.customerSourceInspection} onChange={v => set('customerSourceInspection', v)} />
        <BoolField label="Cert Package Required" value={base.certPackageRequired} onChange={v => set('certPackageRequired', v)} />
        <BoolField label="Dimensional Report Required" value={base.dimensionalReportRequired} onChange={v => set('dimensionalReportRequired', v)} />
      </div>
      <Separator />
      <p className="text-sm font-medium">Spot Check Details</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Sample Size</Label>
          <Input value={base.spotCheckSampleSize} onChange={e => set('spotCheckSampleSize', e.target.value)} placeholder="e.g. 10%" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Frequency</Label>
          <Input value={base.spotCheckFrequency} onChange={e => set('spotCheckFrequency', e.target.value)} placeholder="e.g. Every 3rd lot" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Acceptance Criteria</Label>
          <Input value={base.spotCheckAcceptanceCriteria} onChange={e => set('spotCheckAcceptanceCriteria', e.target.value)} placeholder="Pass/fail criteria" className="h-8 text-sm" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Escalation Rule</Label>
          <Input value={base.spotCheckEscalationRule} onChange={e => set('spotCheckEscalationRule', e.target.value)} placeholder="e.g. Escalate to QE if >3 defects" className="h-8 text-sm" />
        </div>
      </div>
    </div>
  );
}

// ─── Step 8: Schedule & Capacity ─────────────────────────────────────────────
function Step8Schedule({ departments, data, onChange }: {
  departments: string[];
  data?: WizardData['step8'];
  onChange: (v: WizardData['step8']) => void;
}) {
  const deptLabels = Object.fromEntries(WAD_DEPARTMENTS.map(d => [d.key, d.label]));
  const base: NonNullable<WizardData['step8']> = {
    authorizedStartDate: '',
    requiredCompletionDate: '',
    deptDueDates: {},
    priority: 'MEDIUM',
    dailyTargetQty: 0,
    capacityRisk: '',
    bottleneckDepartment: '',
    ...(data ?? {}),
  };
  const set = (k: keyof NonNullable<WizardData['step8']>, v: unknown) =>
    onChange({ ...base, [k]: v } as WizardData['step8']);

  const setDeptDue = (dept: string, val: string) =>
    set('deptDueDates', { ...base.deptDueDates, [dept]: val });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Authorized Start Date</Label>
          <Input type="date" value={base.authorizedStartDate} onChange={e => set('authorizedStartDate', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Required Completion Date</Label>
          <Input type="date" value={base.requiredCompletionDate} onChange={e => set('requiredCompletionDate', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <Select value={base.priority} onValueChange={v => set('priority', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Daily Target Qty</Label>
          <Input type="number" min={0} value={base.dailyTargetQty} onChange={e => set('dailyTargetQty', parseInt(e.target.value) || 0)} />
        </div>
        <div className="space-y-1">
          <Label>Capacity Risk</Label>
          <Input value={base.capacityRisk} onChange={e => set('capacityRisk', e.target.value)} placeholder="Describe capacity risks…" />
        </div>
        <div className="space-y-1">
          <Label>Bottleneck Department</Label>
          <Select
            value={base.bottleneckDepartment || EMPTY_SELECT_VALUE}
            onValueChange={v => set('bottleneckDepartment', v === EMPTY_SELECT_VALUE ? '' : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY_SELECT_VALUE}>None</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>{deptLabels[d] ?? d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {departments.length > 0 && (
        <>
          <Separator />
          <p className="text-sm font-medium">Per-Department Due Dates</p>
          <div className="grid grid-cols-2 gap-3">
            {departments.map(dept => (
              <div key={dept} className="space-y-1">
                <Label className="text-xs">{deptLabels[dept] ?? dept}</Label>
                <Input
                  type="date"
                  value={base.deptDueDates?.[dept] ?? ''}
                  onChange={e => setDeptDue(dept, e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step 9: Risks ────────────────────────────────────────────────────────────
function Step9Risks({ data, onChange }: {
  data?: WizardData['step9'];
  onChange: (v: WizardData['step9']) => void;
}) {
  const base: NonNullable<WizardData['step9']> = {
    risks: [],
    itarFlag: false,
    customerFlowDowns: '',
    specialProcessControls: '',
    ...(data ?? {}),
  };
  const set = (k: keyof NonNullable<WizardData['step9']>, v: unknown) =>
    onChange({ ...base, [k]: v } as WizardData['step9']);

  const addRisk = () => {
    const newRisk: RiskEntry = { type: RISK_TYPES[0], description: '', owner: '', mitigation: '', dueDate: '', approvalStatus: 'OPEN' };
    set('risks', [...(base.risks ?? []), newRisk]);
  };

  const updateRisk = (idx: number, patch: Partial<RiskEntry>) => {
    const next = (base.risks ?? []).map((r, i) => i === idx ? { ...r, ...patch } : r);
    set('risks', next);
  };

  const removeRisk = (idx: number) => set('risks', (base.risks ?? []).filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <BoolField label="ITAR Flag — This WAD involves ITAR-controlled content" value={base.itarFlag} onChange={v => set('itarFlag', v)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Customer Flow-Downs</Label>
          <Textarea rows={2} value={base.customerFlowDowns} onChange={e => set('customerFlowDowns', e.target.value)} placeholder="List applicable customer flow-down requirements…" />
        </div>
        <div className="space-y-1">
          <Label>Special Process Controls</Label>
          <Textarea rows={2} value={base.specialProcessControls} onChange={e => set('specialProcessControls', e.target.value)} placeholder="Special process controls required…" />
        </div>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Risk Entries</p>
        <Button size="sm" variant="outline" onClick={addRisk}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Risk
        </Button>
      </div>
      {(base.risks ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">No risks added yet. Click "Add Risk" to document risks carried from the risk assessment.</p>
      )}
      {(base.risks ?? []).map((risk, idx) => (
        <Card key={idx} className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Select value={risk.type} onValueChange={v => updateRisk(idx, { type: v })}>
              <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RISK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={() => removeRisk(idx)} className="text-red-500 hover:text-red-600 h-7">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Input value={risk.description} onChange={e => updateRisk(idx, { description: e.target.value })} placeholder="Risk description…" className="h-8 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <Input value={risk.owner} onChange={e => updateRisk(idx, { owner: e.target.value })} placeholder="Owner" className="h-8 text-sm" />
            <Input type="date" value={risk.dueDate} onChange={e => updateRisk(idx, { dueDate: e.target.value })} className="h-8 text-sm" />
            <Select value={risk.approvalStatus} onValueChange={v => updateRisk(idx, { approvalStatus: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea value={risk.mitigation} onChange={e => updateRisk(idx, { mitigation: e.target.value })} rows={1} placeholder="Mitigation plan…" className="text-sm" />
        </Card>
      ))}
    </div>
  );
}

// ─── Step 10: Document Checklist ──────────────────────────────────────────────
function Step10Documents({ data, onChange }: {
  data?: WizardData['step10'];
  onChange: (v: WizardData['step10']) => void;
}) {
  const initDocs = (): DocItem[] =>
    DOCUMENT_CHECKLIST_ITEMS.map(item => {
      const existing = (data?.documents ?? []).find(d => d.key === item.key);
      return existing ?? { key: item.key, name: item.name, status: 'PENDING', notes: '' };
    });

  const [docs, setDocs] = useState<DocItem[]>(initDocs);

  useEffect(() => { setDocs(initDocs()); }, []);

  const setDoc = (idx: number, patch: Partial<DocItem>) => {
    const next = docs.map((d, i) => i === idx ? { ...d, ...patch } : d);
    setDocs(next);
    onChange({ documents: next });
  };

  const allRequired = docs.filter(d => d.status !== 'ATTACHED' && d.status !== 'WAIVED');

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Mark each required document as Attached or Waived. All documents must be resolved before WAD approval.
      </p>
      {allRequired.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{allRequired.length} document(s) still pending resolution.</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="w-36">Status</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc, idx) => (
            <TableRow key={doc.key}>
              <TableCell className="text-sm font-medium">{doc.name}</TableCell>
              <TableCell>
                <Select value={doc.status} onValueChange={v => setDoc(idx, { status: v as DocItem['status'] })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="ATTACHED">Attached</SelectItem>
                    <SelectItem value="WAIVED">Waived</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  value={doc.notes}
                  onChange={e => setDoc(idx, { notes: e.target.value })}
                  placeholder="Notes…"
                  className="h-8 text-sm"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Step 11: Approvals ───────────────────────────────────────────────────────
function Step11Approvals({ approvals, assignments, onAssignmentsChange, wadId, approveMutation }: {
  approvals: ApprovalRecord[];
  assignments: ApprovalAssignmentsMap;
  onAssignmentsChange: (next: ApprovalAssignmentsMap) => void;
  wadId: string;
  approveMutation: any;
}) {
  const [forms, setForms] = useState<Record<string, { displayName: string; decision: 'APPROVED' | 'REJECTED'; comments: string; signature: string }>>({});

  const { data: employees = [] } = useQuery<Array<{ id: number; name: string; role?: string | null; isActive?: boolean | null }>>({
    queryKey: ['/api/employees'],
  });
  const activeEmployees = employees.filter(e => e.isActive !== false);

  const getApproval = (role: string) => approvals.find(a => a.role === role);

  const setForm = (role: string, patch: Partial<typeof forms[string]>) =>
    setForms(prev => ({ ...prev, [role]: { displayName: '', decision: 'APPROVED', comments: '', ...(prev[role] ?? {}), ...patch } }));

  const submit = (role: string) => {
    const f = forms[role];
    if (!f?.displayName || !f?.signature) return;
    approveMutation.mutate({ role, displayName: f.displayName, decision: f.decision, comments: f.comments, signature: f.signature });
    setForms(prev => ({ ...prev, [role]: { displayName: '', decision: 'APPROVED', comments: '', signature: '' } }));
  };

  const handleAssign = (roleKey: string, value: string) => {
    const next: ApprovalAssignmentsMap = { ...assignments };
    if (value === EMPTY_SELECT_VALUE) {
      delete next[roleKey];
    } else {
      const empId = Number.parseInt(value, 10);
      const emp = activeEmployees.find(e => e.id === empId);
      if (!emp) return;
      next[roleKey] = {
        employeeId: emp.id,
        employeeName: emp.name,
        assignedAt: new Date().toISOString(),
      };
      // Auto-fill the approver display name field if the form is empty.
      setForm(roleKey, { displayName: forms[roleKey]?.displayName || emp.name });
    }
    onAssignmentsChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Collect the WAD approval matrix: PM, engineering, quality, operations, and executive. Assign each
        signature to a named approver so the pending task appears on their Pre-production Checklist /
        My Tasks dashboard. Rejections keep the WAD in revision until the next saved change resets the
        signature cycle.
      </p>
      <div className="space-y-3">
        {REQUIRED_APPROVAL_ROLES.map(role => {
          const existing = getApproval(role.key);
          const f = forms[role.key] ?? { displayName: '', decision: 'APPROVED' as const, comments: '', signature: '' };
          const assignment = assignments[role.key];
          return (
            <Card key={role.key} className="p-3" data-testid={`card-approval-${role.key}`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{role.label}</span>
                  {(role as { optional?: boolean }).optional && <Badge variant="outline" className="text-xs">Optional</Badge>}
                  {assignment && !existing && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200" data-testid={`badge-assigned-${role.key}`}>
                      Awaiting {assignment.employeeName ?? `employee #${assignment.employeeId}`}
                    </Badge>
                  )}
                </div>
                {existing && (
                  <div className="flex items-center gap-1 text-xs">
                    {existing.decision === 'APPROVED'
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-red-500" />
                    }
                    <span className={existing.decision === 'APPROVED' ? 'text-green-700' : 'text-red-600'}>
                      {existing.decision} — {existing.displayName}
                    </span>
                  </div>
                )}
              </div>
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">Assign to</Label>
                <Select
                  value={assignment ? String(assignment.employeeId) : EMPTY_SELECT_VALUE}
                  onValueChange={(v) => handleAssign(role.key, v)}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid={`select-assignee-${role.key}`}>
                    <SelectValue placeholder="Select an approver…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>— Unassigned —</SelectItem>
                    {activeEmployees.map(emp => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.name}{emp.role ? ` (${emp.role})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assignment && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pending signature appears on {assignment.employeeName ?? 'assignee'}'s My Tasks dashboard.
                  </p>
                )}
              </div>
              {existing ? (
                <div className="text-xs text-muted-foreground">
                  Recorded {new Date(existing.signedAt ?? existing.timestamp).toLocaleDateString()}
                  {existing.signature && <span> - Signed: {existing.signature}</span>}
                  {existing.comments && <span> · "{existing.comments}"</span>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={f.displayName}
                      onChange={e => setForm(role.key, { displayName: e.target.value })}
                      placeholder="Approver name *"
                      className="h-8 text-sm"
                    />
                    <Select value={f.decision} onValueChange={v => setForm(role.key, { decision: v as 'APPROVED' | 'REJECTED' })}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="APPROVED">Approved</SelectItem>
                        <SelectItem value="REJECTED">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={f.comments}
                    onChange={e => setForm(role.key, { comments: e.target.value })}
                    placeholder={f.decision === 'REJECTED' ? 'Denial notes required' : 'Comments (optional)'}
                    className="h-8 text-sm"
                  />
                  <Input
                    value={f.signature}
                    onChange={e => setForm(role.key, { signature: e.target.value })}
                    placeholder="Typed signature *"
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => submit(role.key)}
                    disabled={!f.displayName || !f.signature || (f.decision === 'REJECTED' && !f.comments.trim()) || approveMutation.isPending}
                    className={f.decision === 'REJECTED' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                    data-testid={`button-record-${role.key}`}
                  >
                    {approveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Record {f.decision === 'APPROVED' ? 'Approval' : 'Rejection'}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Step 12: Final Review ────────────────────────────────────────────────────
function Step12FinalReview({ data, wad, approvals, controlStatus, approvalRequests, revisionHistory, exceptionRequestMutation, onApprove, isSaving }: {
  data: WizardData;
  wad: any;
  approvals: ApprovalRecord[];
  controlStatus?: WadControlStatus;
  approvalRequests: ApprovalRequestRecord[];
  revisionHistory: RevisionHistoryRecord[];
  exceptionRequestMutation: any;
  onApprove: () => Promise<void>;
  isSaving: boolean;
}) {
  const { toast } = useToast();
  const [approving, setApproving] = useState(false);

  const requiredRoles = REQUIRED_APPROVAL_ROLES.map((role) => role.key);
  const allRequiredApproved = requiredRoles.every(r =>
    approvals.some(a => a.role === r && a.decision === 'APPROVED')
  );
  const missingExceptionRequests = controlStatus?.exceptions.missingRequests ?? [];

  const docsComplete = (data.step10?.documents ?? []).every(d => d.status !== 'PENDING');
  const poReviewGate = data.step1?.poReviewApproved ?? false;
  const scopeDefined = !!(data.step2?.buildType && (data.step2?.departments ?? []).length > 0);
  const chargeCodesDefined = (data.step4?.chargeCodes ?? []).every(c => !!c.chargeCode);

  const gates = [
    { label: 'PO Review Approved', ok: poReviewGate },
    { label: 'Scope of Work Defined', ok: scopeDefined },
    { label: 'Charge Codes Assigned', ok: chargeCodesDefined },
    { label: 'Documents Resolved', ok: docsComplete },
    { label: 'All Required Approvals Collected', ok: allRequiredApproved },
    { label: 'Exception Requests Resolved', ok: missingExceptionRequests.length === 0 },
  ];

  const allGatesPassed = gates.every(g => g.ok);
  const exceptionLabels: Record<WadExceptionType, string> = {
    overrun: 'Overrun',
    charge_code_override: 'Charge-code override',
    late_release_exception: 'Late release',
  };
  const formatPct = (value: number | null | undefined) => value == null ? 'N/A' : `${value}%`;
  const formatMoney = (value: number | null | undefined) =>
    value == null ? 'N/A' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

  const handleApprove = async () => {
    if (!allGatesPassed) {
      toast({ title: 'Cannot approve', description: 'Resolve all gate items before approving.', variant: 'destructive' });
      return;
    }
    setApproving(true);
    try { await onApprove(); } finally { setApproving(false); }
  };

  const isAlreadyApproved = wad?.wadStatus === 'APPROVED';

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-medium text-sm">Gate Checklist</p>
        {gates.map(g => (
          <div key={g.label} className="flex items-center gap-2">
            {g.ok
              ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              : <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            }
            <span className={`text-sm ${g.ok ? '' : 'text-red-600'}`}>{g.label}</span>
          </div>
        ))}
      </div>
      <Separator />
      {controlStatus && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Labor Hours</p>
            <p className="text-sm font-medium">{controlStatus.labor.usedHours} / {controlStatus.labor.budgetHours ?? 'N/A'} used</p>
            <p className={controlStatus.labor.projectedOverrun ? 'text-xs text-red-600' : 'text-xs text-muted-foreground'}>
              {formatPct(controlStatus.labor.percentUsed)} used, {formatPct(controlStatus.labor.projectedPercentUsed)} projected
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Material Spend</p>
            <p className="text-sm font-medium">{formatMoney(controlStatus.material.usedSpend)} / {formatMoney(controlStatus.material.spendCap)}</p>
            <p className={controlStatus.material.projectedOverrun ? 'text-xs text-red-600' : 'text-xs text-muted-foreground'}>
              {formatPct(controlStatus.material.percentUsed)} used
            </p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Outside Processing</p>
            <p className="text-sm font-medium">{formatMoney(controlStatus.outsideProcessing.usedSpend)} / {formatMoney(controlStatus.outsideProcessing.spendCap)}</p>
            <p className={controlStatus.outsideProcessing.projectedOverrun ? 'text-xs text-red-600' : 'text-xs text-muted-foreground'}>
              {formatPct(controlStatus.outsideProcessing.percentUsed)} used
            </p>
          </Card>
        </div>
      )}
      {missingExceptionRequests.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            {missingExceptionRequests.map(type => exceptionLabels[type]).join(', ')} approval request required before release.
            <div className="flex flex-wrap gap-2 mt-2">
              {missingExceptionRequests.map(type => (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  onClick={() => exceptionRequestMutation.mutate({ type, action: 'REQUEST', reason: `${exceptionLabels[type]} exception requested from WAD final review` })}
                  disabled={exceptionRequestMutation.isPending}
                >
                  Request {exceptionLabels[type]}
                </Button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
      {approvalRequests.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium text-sm">Approval Requests</p>
          {approvalRequests.slice(-5).map(req => (
            <div key={req.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
              <span>{exceptionLabels[req.type]} - {req.reason}</span>
              <div className="flex items-center gap-2">
                <Badge variant={req.status === 'APPROVED' ? 'default' : 'outline'}>{req.status}</Badge>
                {req.status === 'PENDING' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exceptionRequestMutation.mutate({ type: req.type, action: 'APPROVE', reason: `Approved: ${req.reason}` })}
                      disabled={exceptionRequestMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => exceptionRequestMutation.mutate({ type: req.type, action: 'REJECT', reason: `Rejected: ${req.reason}` })}
                      disabled={exceptionRequestMutation.isPending}
                    >
                      Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {revisionHistory.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium text-sm">Revision History</p>
          {revisionHistory.slice(-4).map((event, idx) => (
            <div key={`${event.timestamp}-${idx}`} className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
              Rev {event.revision}: {event.action.replaceAll('_', ' ')}{event.role ? ` (${event.role})` : ''} by {event.actorName ?? 'system'}
              {event.comments ? ` - ${event.comments}` : ''}
            </div>
          ))}
        </div>
      )}
      <Separator />
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="font-medium mb-1">Summary</p>
          <p className="text-muted-foreground">WAD: {wad?.workOrderNumber}</p>
          <p className="text-muted-foreground">Build Type: {data.step2?.buildType ?? '—'}</p>
          <p className="text-muted-foreground">Departments: {(data.step2?.departments ?? []).length}</p>
          <p className="text-muted-foreground">Work Breakdown Rows: {(data.step3?.rows ?? []).length}</p>
          <p className="text-muted-foreground">Charge Codes: {(data.step4?.chargeCodes ?? []).length}</p>
          <p className="text-muted-foreground">Risk Entries: {(data.step9?.risks ?? []).length}</p>
        </div>
        <div>
          <p className="font-medium mb-1">Approval Status</p>
          {REQUIRED_APPROVAL_ROLES.map(role => {
            const approval = approvals.find(a => a.role === role.key);
            return (
              <div key={role.key} className="flex items-center gap-1 text-xs">
                {approval?.decision === 'APPROVED'
                  ? <CheckCircle className="h-3 w-3 text-green-600" />
                  : <XCircle className="h-3 w-3 text-muted-foreground" />
                }
                <span className={approval?.decision === 'APPROVED' ? 'text-green-700' : 'text-muted-foreground'}>
                  {role.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {isAlreadyApproved ? (
        <Alert className="border-green-300 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            This WAD has been <strong>APPROVED</strong>. It satisfies the WAD gate for P2 release.
          </AlertDescription>
        </Alert>
      ) : (
        <Button
          onClick={handleApprove}
          disabled={!allGatesPassed || approving || isSaving}
          className="w-full bg-green-600 hover:bg-green-700 text-white"
        >
          {approving || isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          {allGatesPassed ? 'Approve WAD' : 'Resolve Gate Items to Approve'}
        </Button>
      )}
    </div>
  );
}

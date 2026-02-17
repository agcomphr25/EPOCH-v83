import { useState, useEffect, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useParams, Link } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Loader2,
  PenTool,
  User,
  CreditCard,
  ClipboardCheck,
  Lock,
  Unlock,
  ScanBarcode,
  Wrench,
  Flag,
  Shield,
  BookOpen,
  Lightbulb,
  ImageIcon,
  Eye,
  ExternalLink,
  AlertCircle,
  SkipForward,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import MaterialScanner from '@/components/MaterialScanner';
import StartProductionTimerModal from '@/components/StartProductionTimerModal';
import { Timer } from 'lucide-react';

interface TravelerTaskField {
  id: string;
  travelerTaskId: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  validation: any;
  value: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
}

interface TravelerTask {
  id: string;
  travelerStepId: string;
  taskType: string;
  taskPhase: 'START' | 'WORK' | 'FINISH';
  title: string;
  instructions: string | null;
  required: boolean;
  sortOrder: number;
  timePolicy: 'AUTO_ON_START' | 'AUTO_ON_COMPLETE' | 'MANUAL_ENTRY' | null;
  requiresSignature: boolean;
  signatureRole: string | null;
  requiresCertification: boolean;
  instructionPack: {
    workInstructionRefs?: { documentId: string; title?: string; pageRange?: string; anchor?: string }[];
    aiSnippets?: { title: string; bullets: string[]; sourceDocumentId?: string; confidence?: number }[];
    specialNotes?: string;
    media?: { type: 'image' | 'pdf'; documentId: string; caption?: string }[];
  } | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  fields: TravelerTaskField[];
}

interface TravelerSignature {
  id: string;
  travelerStepId: string;
  travelerTaskId: string | null;
  signedBy: string;
  signedByName: string | null;
  signatureRole: string | null;
  badgeScan: string | null;
  signedAt: string;
  meaning: string;
  notes: string | null;
  signatureData: string | null;
}

interface TravelerStep {
  id: string;
  travelerId: string;
  departmentName: string;
  stepNumber: number;
  status: string;
  assignedTechnicianId: string | null;
  startedAt: string | null;
  startedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  notes: string | null;
  tasks: TravelerTask[];
  signatures: TravelerSignature[];
}

interface TravelerEvent {
  id: string;
  travelerId: string;
  actor: string;
  actorName: string | null;
  action: string;
  details: any;
  createdAt: string;
}

interface Traveler {
  id: string;
  travelerNumber: string;
  travelerRevision: number;
  partNumber: string | null;
  partName: string | null;
  workOrderId: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  internalControlNumber: string | null;
  quantity: number;
  status: string;
  partRoutingId: string | null;
  createdBy: string;
  createdAt: string;
}

interface TravelerWithDetails {
  traveler: Traveler;
  steps: TravelerStep[];
  events: TravelerEvent[];
}

const STEP_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-800 border-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-800 border-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 border-green-300',
  BLOCKED: 'bg-red-100 text-red-800 border-red-300',
};

const TASK_TYPE_ICONS: Record<string, any> = {
  CHECK: Shield,
  PROCESS: Wrench,
  QC: ClipboardCheck,
  TRACEABILITY: CreditCard,
  DOCUMENT: FileText,
  SIGNATURE: PenTool,
  START_GATE: Play,
  END_GATE: CheckCircle,
  GATE_CHECK: Shield,
  TRACE: CreditCard,
  CUSTOM_FIELD: FileText,
  SPECIAL_PROCESS: AlertTriangle,
  NOTES: FileText,
};

const PHASE_CONFIG: Record<string, { label: string; icon: any; color: string; bgColor: string; borderColor: string; description: string }> = {
  START: {
    label: 'Start Phase',
    icon: ScanBarcode,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    description: 'Material scans, tooling verification, technician assignment'
  },
  WORK: {
    label: 'Work Phase',
    icon: Wrench,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    description: 'Process data entry, special process parameters'
  },
  FINISH: {
    label: 'Finish Phase',
    icon: Flag,
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    description: 'QC checks, acceptance criteria, final sign-off'
  },
};

type TaskPhase = 'START' | 'WORK' | 'FINISH';
const PHASE_ORDER: TaskPhase[] = ['START', 'WORK', 'FINISH'];

export default function TravelerExecution() {
  const params = useParams();
  const travelerId = params.id;
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signingTaskId, setSigningTaskId] = useState<string | null>(null);
  const [signingRole, setSigningRole] = useState<string | null>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signatureData, setSignatureData] = useState({
    signedBy: '',
    signedByName: '',
    badgeScan: '',
    meaning: 'COMPLETED',
    notes: '',
    signatureData: '' as string,
  });
  const sigPadRef = useRef<SignatureCanvas>(null);
  const [activeBadge, setActiveBadge] = useState('');
  const [activeTechName, setActiveTechName] = useState('');
  const [badgeLookupStatus, setBadgeLookupStatus] = useState<'idle' | 'loading' | 'found' | 'not_found'>('idle');
  const [resolvedEmployee, setResolvedEmployee] = useState<{ name: string; employeeCode: string; department: string | null } | null>(null);
  const badgeLookupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [instructionSheetOpen, setInstructionSheetOpen] = useState(false);
  const [instructionSheetTaskId, setInstructionSheetTaskId] = useState<string | null>(null);
  const [wiModalOpen, setWiModalOpen] = useState(false);
  const [wiModalRef, setWiModalRef] = useState<{ documentId: string; title?: string; pageRange?: string; anchor?: string } | null>(null);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerStartedForStep, setTimerStartedForStep] = useState<Record<string, boolean>>({});

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleBadgeScanInput = (value: string) => {
    setSignatureData((prev) => ({ ...prev, badgeScan: value }));
    setResolvedEmployee(null);
    setBadgeLookupStatus('idle');

    if (badgeLookupTimerRef.current) {
      clearTimeout(badgeLookupTimerRef.current);
    }

    if (value.trim().length >= 8) {
      setBadgeLookupStatus('loading');
      badgeLookupTimerRef.current = setTimeout(async () => {
        try {
          const resp = await fetch(`/api/employee-badges/resolve-badge/${encodeURIComponent(value.trim())}`);
          if (resp.ok) {
            const emp = await resp.json();
            setResolvedEmployee({ name: emp.name, employeeCode: emp.employeeCode, department: emp.department });
            setSignatureData((prev) => ({ ...prev, signedByName: emp.name }));
            setBadgeLookupStatus('found');
          } else {
            setBadgeLookupStatus('not_found');
          }
        } catch {
          setBadgeLookupStatus('not_found');
        }
      }, 300);
    }
  };

  const normalizeInstructionPack = (rawPack: any) => {
    if (!rawPack) return null;
    const normalizedRefs = (rawPack.workInstructionRefs || []).map((r: any) => ({
      documentId: r.documentId || '',
      title: r.title || r.documentTitle || undefined,
      pageRange: r.pageRange || undefined,
      anchor: r.anchor || undefined,
    }));
    const normalizedSnippets = (rawPack.aiSnippets || []).map((s: any) =>
      typeof s === 'string'
        ? { title: 'Tip', bullets: [s] }
        : { title: s.title || 'Tip', bullets: s.bullets || [], sourceDocumentId: s.sourceDocumentId, confidence: s.confidence }
    );
    const pack = {
      workInstructionRefs: normalizedRefs as { documentId: string; title?: string; pageRange?: string; anchor?: string }[],
      aiSnippets: normalizedSnippets as { title: string; bullets: string[]; sourceDocumentId?: string; confidence?: number }[],
      specialNotes: rawPack.specialNotes as string | undefined,
      media: (rawPack.media || []) as { type: 'image' | 'pdf'; documentId: string; caption?: string }[],
    };
    const hasContent = pack.workInstructionRefs.length > 0 || pack.aiSnippets.length > 0 || pack.specialNotes || pack.media.length > 0;
    return hasContent ? pack : null;
  };

  const { data: travelerData, isLoading, refetch } = useQuery<TravelerWithDetails>({
    queryKey: ['/api/travelers', travelerId, 'details'],
    queryFn: () =>
      fetch(`/api/travelers/${travelerId}?details=true`).then((res) => {
        if (!res.ok) throw new Error('Failed to fetch traveler');
        return res.json();
      }),
    enabled: !!travelerId,
  });

  const { traveler, steps = [], events = [] } = travelerData || {};

  interface PartRoutingData {
    id: string;
    partNumber: string;
    departmentConfig?: Record<string, {
      timerConfig?: {
        enabled: boolean;
        defaultProgramId?: string;
        defaultProgramName?: string;
      };
      customDataFields?: { fieldName: string; fieldType: string; isRequired: boolean }[];
      startCustomDataFields?: { fieldName: string; fieldType: string; isRequired: boolean }[];
      finishCustomDataFields?: { fieldName: string; fieldType: string; isRequired: boolean }[];
      qcStandards?: { standard: string; tolerance: string; requirement: string }[];
      startQcStandards?: { standard: string; tolerance: string; requirement: string }[];
      finishQcStandards?: { standard: string; tolerance: string; requirement: string }[];
      materials?: { partId: string; partNumber: string; partName: string; requiredFields?: string[]; entryMethod?: string }[];
      startChecks?: { title: string; taskType?: string; required?: boolean }[];
      finishChecks?: { title: string; taskType?: string; required?: boolean }[];
      ovenCuringSteps?: { temperature: string; time: string }[];
      instructionPack?: {
        workInstructionRefs?: any[];
        aiSnippets?: any[];
        specialNotes?: string;
        media?: any[];
      };
      signatureConfig?: {
        startRequiresSignature: boolean;
        finishRequiresSignature: boolean;
        requiredSignatures: string[];
      };
    }>;
  }

  const { data: partRoutings = [] } = useQuery<PartRoutingData[]>({
    queryKey: ['/api/part-routings'],
    enabled: !!traveler?.partNumber || !!traveler?.partRoutingId,
  });

  const currentPartRouting = partRoutings.find(
    (r) => (traveler?.partRoutingId && r.id === traveler.partRoutingId) || r.partNumber === traveler?.partNumber
  );

  const getDeptConfig = (departmentName: string) => {
    if (!currentPartRouting?.departmentConfig) return null;
    return currentPartRouting.departmentConfig[departmentName] || null;
  };

  const getTimerConfigForDepartment = (departmentName: string) => {
    const deptConfig = getDeptConfig(departmentName);
    if (deptConfig?.timerConfig?.enabled) return deptConfig.timerConfig;
    const step = steps.find(s => s.departmentName === departmentName);
    if (step) {
      const timerTask = step.tasks.find(t => t.title === 'Production Timer' && (t.instructionPack as any)?.timerConfig);
      const timerPack = timerTask?.instructionPack as any;
      if (timerPack?.timerConfig) return timerPack.timerConfig;
    }
    return null;
  };

  const isBadgeGateTask = (t: TravelerTask) =>
    (t.taskType === 'CHECK' || t.taskType === 'GATE_CHECK') &&
    /badge/i.test(t.title);

  const isStepMinimal = (step: TravelerStep) => {
    const nonGateTasks = step.tasks.filter(
      (t) => t.taskType !== 'SIGNATURE' && t.taskType !== 'END_GATE'
    );
    const meaningfulTasks = nonGateTasks.filter(
      (t) => !isBadgeGateTask(t)
    );
    return meaningfulTasks.length === 0;
  };

  useEffect(() => {
    if (steps.length > 0 && !currentStepId) {
      const inProgressStep = steps.find((s) => s.status === 'IN_PROGRESS');
      const nextStep = steps.find((s) => s.status === 'NOT_STARTED');
      setCurrentStepId(inProgressStep?.id || nextStep?.id || steps[0].id);
      if (inProgressStep?.startedBy && !activeBadge) {
        setActiveBadge(inProgressStep.startedBy);
      }
    }
  }, [steps, currentStepId]);

  const startStepMutation = useMutation({
    mutationFn: ({ stepId, badge, techName }: { stepId: string; badge: string; techName: string }) =>
      apiRequest(`/api/travelers/${travelerId}/steps/${stepId}/start`, {
        method: 'POST',
        body: JSON.stringify({ startedBy: badge || 'operator', badgeScan: badge }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: (_data, variables) => {
      setActiveBadge(variables.badge);
      setActiveTechName(variables.techName);
      toast({ title: 'Step Started', description: 'Badge verified — gate checks passed. Work on this step has begun.' });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId, fieldVals }: { taskId: string; fieldVals?: Record<string, string> }) =>
      apiRequest(`/api/travelers/${travelerId}/tasks/${taskId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completedBy: 'operator', fieldValues: fieldVals }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Task Completed', description: 'Task has been marked complete' });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const signStepMutation = useMutation({
    mutationFn: ({ stepId, taskId, role }: { stepId: string; taskId?: string | null; role?: string | null }) => {
      const drawnSignature = sigPadRef.current && !sigPadRef.current.isEmpty()
        ? sigPadRef.current.toDataURL('image/png')
        : null;
      return apiRequest(`/api/travelers/${travelerId}/steps/${stepId}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          ...signatureData,
          signatureData: drawnSignature,
          taskId: taskId || undefined,
          signatureRole: role || undefined,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({ title: 'Signed', description: 'Signature recorded successfully' });
      setShowSignDialog(false);
      setSigningTaskId(null);
      setSigningRole(null);
      setSignatureEmpty(true);
      if (sigPadRef.current) sigPadRef.current.clear();
      setSignatureData({
        signedBy: '',
        signedByName: '',
        badgeScan: '',
        meaning: 'COMPLETED',
        notes: '',
        signatureData: '',
      });
      if (sigPadRef.current) sigPadRef.current.clear();
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const blockMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/travelers/${travelerId}/block`, {
        method: 'POST',
        body: JSON.stringify({ blockedBy: 'operator', reason: blockReason }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Traveler Blocked', description: 'Traveler has been blocked' });
      setShowBlockDialog(false);
      setBlockReason('');
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/travelers/${travelerId}/unblock`, {
        method: 'POST',
        body: JSON.stringify({ unblockedBy: 'operator' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Traveler Unblocked', description: 'Traveler is back in progress' });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const completeTravelerMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/travelers/${travelerId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completedBy: 'operator' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Traveler Completed', description: 'All work has been completed' });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleFieldChange = (taskId: string, fieldKey: string, value: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [taskId]: {
        ...prev[taskId],
        [fieldKey]: value,
      },
    }));
  };

  const handleCompleteTask = (task: TravelerTask) => {
    const taskFieldVals = fieldValues[task.id] || {};
    const traceLabelMap: Record<string, string> = {
      internalControlNumber: 'Internal Control Number',
      supplier: 'Supplier',
      inventoryPartNumber: 'Inventory Part Number',
      batchLotNumber: 'Batch/Lot #',
      manufacturer: 'Manufacturer',
      rollNumber: 'Roll Number',
      expirationDate: 'Expiration Date',
      receivedDate: 'Received Date',
    };
    const missingRequired = task.fields
      .filter((f) => f.required && !taskFieldVals[f.fieldKey] && !f.value)
      .map((f) => traceLabelMap[f.fieldKey] || f.fieldLabel);

    if (missingRequired.length > 0) {
      toast({
        title: 'Missing Required Fields',
        description: `Please fill in: ${missingRequired.join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    completeTaskMutation.mutate({ taskId: task.id, fieldVals: taskFieldVals });
  };

  const currentStep = steps.find((s) => s.id === currentStepId);

  const allStepsCompleted = steps.every((s) => s.status === 'COMPLETED');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!traveler) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Traveler not found
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/travelers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Traveler Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Number:</span>
                <p className="font-mono font-bold" data-testid="text-traveler-number">
                  {traveler.travelerNumber}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Part:</span>
                <p className="font-medium">{traveler.partNumber}</p>
                <p className="text-xs text-muted-foreground">{traveler.partName}</p>
              </div>
              {traveler.workOrderId && (
                <div>
                  <span className="text-muted-foreground">Work Order:</span>
                  <p className="font-medium">{traveler.workOrderId}</p>
                </div>
              )}
              {traveler.serialNumber && (
                <div>
                  <span className="text-muted-foreground">Serial Number:</span>
                  <p className="font-medium font-mono">{traveler.serialNumber}</p>
                </div>
              )}
              {traveler.lotNumber && (
                <div>
                  <span className="text-muted-foreground">Lot Number:</span>
                  <p className="font-medium font-mono">{traveler.lotNumber}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Quantity:</span>
                <p className="font-medium">{traveler.quantity}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge
                  className={`ml-2 ${
                    traveler.status === 'COMPLETED'
                      ? 'bg-green-100 text-green-800'
                      : traveler.status === 'IN_PROGRESS'
                      ? 'bg-blue-100 text-blue-800'
                      : traveler.status === 'BLOCKED'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {traveler.status}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Steps</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => setCurrentStepId(step.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    currentStepId === step.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  data-testid={`button-step-${step.id}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Step {step.stepNumber / 10}
                    </span>
                    {step.status === 'COMPLETED' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                    {step.status === 'IN_PROGRESS' && (
                      <Clock className="h-4 w-4 text-blue-500" />
                    )}
                    {step.status === 'BLOCKED' && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <p className="font-medium text-sm">{step.departmentName}</p>
                  {isStepMinimal(step) && step.status !== 'COMPLETED' && (
                    <div className="flex items-center gap-1 mt-1">
                      <SkipForward className="h-3 w-3 text-amber-500" />
                      <span className="text-[10px] text-amber-600">No inputs configured</span>
                    </div>
                  )}
                </button>
              ))}
            </CardContent>
          </Card>

          {traveler.status === 'IN_PROGRESS' && (
            <div className="space-y-2">
              {allStepsCompleted && (
                <Button
                  className="w-full"
                  onClick={() => completeTravelerMutation.mutate()}
                  disabled={completeTravelerMutation.isPending}
                  data-testid="button-complete-traveler"
                >
                  {completeTravelerMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Complete Traveler
                </Button>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setShowBlockDialog(true)}
                data-testid="button-block-traveler"
              >
                <Lock className="h-4 w-4 mr-2" />
                Block Traveler
              </Button>
            </div>
          )}

          {traveler.status === 'BLOCKED' && (
            <Button
              className="w-full"
              onClick={() => unblockMutation.mutate()}
              disabled={unblockMutation.isPending}
              data-testid="button-unblock-traveler"
            >
              {unblockMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4 mr-2" />
              )}
              Unblock Traveler
            </Button>
          )}
        </div>

        <div className="lg:col-span-3">
          {currentStep && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      Step {currentStep.stepNumber / 10}: {currentStep.departmentName}
                    </CardTitle>
                    <CardDescription>
                      {currentStep.status === 'NOT_STARTED' && 'Not yet started'}
                      {currentStep.status === 'IN_PROGRESS' &&
                        `Started by ${currentStep.startedBy}`}
                      {currentStep.status === 'COMPLETED' &&
                        `Completed by ${currentStep.completedBy}`}
                    </CardDescription>
                  </div>
                  <Badge className={STEP_STATUS_COLORS[currentStep.status]}>
                    {currentStep.status.replace('_', ' ')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentStep.status === 'NOT_STARTED' && (
                  <div className="text-center py-8">
                    {isStepMinimal(currentStep) && (
                      <div className="mb-4 mx-auto max-w-sm p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <SkipForward className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-700">Passthrough Step</span>
                        </div>
                        <p className="text-xs text-amber-600">
                          This step has no configured data entry, QC checks, or material tracking.
                          Badge scan and sign to pass through.
                        </p>
                      </div>
                    )}
                    <ScanBarcode className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      Scan your badge to start this step
                    </p>
                    <div className="max-w-xs mx-auto space-y-3">
                      <div className="space-y-1">
                        <Label className="text-sm">Scan Badge</Label>
                        <Input
                          placeholder="Scan badge..."
                          value={signatureData.badgeScan}
                          onChange={(e) => handleBadgeScanInput(e.target.value)}
                          autoFocus
                          data-testid="input-badge-scan"
                        />
                        {badgeLookupStatus === 'loading' && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Looking up badge...
                          </div>
                        )}
                        {badgeLookupStatus === 'not_found' && (
                          <div className="mt-1 space-y-2">
                            <p className="text-xs text-red-500">
                              Badge not recognized. Enter your name manually to continue.
                            </p>
                            <div className="space-y-1">
                              <Label className="text-sm">Your Name</Label>
                              <Input
                                placeholder="Enter your full name..."
                                value={signatureData.signedByName}
                                onChange={(e) =>
                                  setSignatureData({ ...signatureData, signedByName: e.target.value })
                                }
                                data-testid="input-tech-name-fallback"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {badgeLookupStatus === 'found' && resolvedEmployee && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            <User className="h-5 w-5 text-green-600" />
                            <div>
                              <p className="font-medium text-green-800">{resolvedEmployee.name}</p>
                              {resolvedEmployee.department && (
                                <p className="text-xs text-green-600">{resolvedEmployee.department}</p>
                              )}
                            </div>
                            <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={() => startStepMutation.mutate({
                          stepId: currentStep.id,
                          badge: signatureData.badgeScan,
                          techName: resolvedEmployee?.name || signatureData.signedByName,
                        })}
                        disabled={startStepMutation.isPending || !signatureData.badgeScan || (badgeLookupStatus === 'not_found' && !signatureData.signedByName)}
                        data-testid="button-start-step"
                      >
                        {startStepMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Start Step
                      </Button>
                    </div>
                  </div>
                )}

                {currentStep.status === 'IN_PROGRESS' && (() => {
                  const isGateTask = (t: TravelerTask) => t.taskType === 'END_GATE' || t.taskType === 'SIGNATURE';
                  const allRequiredNonGateComplete = currentStep.tasks
                    .filter((t) => t.required && !isGateTask(t) && !isBadgeGateTask(t))
                    .every((t) => t.status === 'COMPLETED');
                  const unsignedSigTasks = currentStep.tasks.filter(
                    (t) => t.requiresSignature && t.status !== 'COMPLETED' && !isGateTask(t)
                  );
                  const canSignStep = allRequiredNonGateComplete && unsignedSigTasks.length === 0;

                  return (
                  <div className="space-y-6">

                    {/* Step-level Work Instructions from routing (always visible) */}
                    {(() => {
                      const deptConfig = getDeptConfig(currentStep.departmentName);
                      const stepPack = normalizeInstructionPack(deptConfig?.instructionPack);
                      const anyTaskHasPack = currentStep.tasks.some(t => t.instructionPack);
                      if (!stepPack || anyTaskHasPack) return null;
                      return (
                        <div className="space-y-3 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 mb-4">
                          <div className="flex items-center gap-2 pb-1 border-b border-blue-200 dark:border-blue-800">
                            <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">Work Instructions</p>
                          </div>
                          {stepPack.specialNotes && (
                            <div className="rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1">Special Notes</p>
                                  <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">{stepPack.specialNotes}</p>
                                </div>
                              </div>
                            </div>
                          )}
                          {stepPack.workInstructionRefs.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                <FileText className="h-3 w-3" /> Reference Documents
                              </p>
                              {stepPack.workInstructionRefs.map((ref, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 rounded border bg-white dark:bg-slate-900">
                                  <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{ref.title || ref.documentId}</p>
                                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                                      {ref.pageRange && <span>Pages {ref.pageRange}</span>}
                                      {ref.anchor && <span>Section: {ref.anchor}</span>}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {stepPack.aiSnippets.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                                <Lightbulb className="h-3 w-3" /> Tips & Guidance
                              </p>
                              {stepPack.aiSnippets.map((snippet, i) => (
                                <div key={i} className="p-2 rounded border bg-white dark:bg-slate-900">
                                  <p className="text-sm font-medium mb-1">{snippet.title}</p>
                                  <ul className="space-y-0.5 ml-3">
                                    {snippet.bullets.map((b: string, j: number) => (
                                      <li key={j} className="text-xs text-muted-foreground list-disc">{b}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                          {stepPack.media && stepPack.media.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                <ImageIcon className="h-3 w-3" /> Media References
                              </p>
                              {stepPack.media.map((m: any, i: number) => (
                                <div key={i} className="p-2 rounded border bg-white dark:bg-slate-900 text-xs">
                                  {m.caption || m.documentId}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {PHASE_ORDER.map((phase, phaseIndex) => {
                      const allPhaseTasks = currentStep.tasks
                        .filter((t) => t.taskPhase === phase)
                        .sort((a, b) => a.sortOrder - b.sortOrder);
                      const phaseTasks = allPhaseTasks.filter((t) => !isBadgeGateTask(t));
                      
                      if (phaseTasks.length === 0) return null;
                      
                      const phaseConfig = PHASE_CONFIG[phase];
                      const PhaseIcon = phaseConfig.icon;
                      const allPhaseTasksComplete = phaseTasks.every((t) => t.status === 'COMPLETED');
                      
                      const previousPhasesComplete = PHASE_ORDER.slice(0, phaseIndex).every((prevPhase) => {
                        const prevTasks = currentStep.tasks.filter((t) => t.taskPhase === prevPhase);
                        return prevTasks
                          .filter((t) => t.required && t.taskType !== 'END_GATE' && t.taskType !== 'SIGNATURE' && !isBadgeGateTask(t))
                          .every((t) => t.status === 'COMPLETED');
                      });
                      
                      const phaseUnlocked = previousPhasesComplete;
                      const completedCount = phaseTasks.filter((t) => t.status === 'COMPLETED').length;

                      return (
                        <div 
                          key={phase} 
                          className={`border rounded-lg overflow-hidden ${phaseConfig.borderColor} ${
                            !phaseUnlocked ? 'opacity-60' : ''
                          }`}
                        >
                          <div className={`px-4 py-3 ${phaseConfig.bgColor} border-b ${phaseConfig.borderColor}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-full ${allPhaseTasksComplete ? 'bg-green-100' : 'bg-white'}`}>
                                  {allPhaseTasksComplete ? (
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                  ) : phaseUnlocked ? (
                                    <PhaseIcon className={`h-5 w-5 ${phaseConfig.color}`} />
                                  ) : (
                                    <Lock className="h-5 w-5 text-gray-400" />
                                  )}
                                </div>
                                <div>
                                  <h3 className={`font-semibold ${phaseConfig.color}`}>
                                    {phaseConfig.label}
                                  </h3>
                                  <p className="text-xs text-muted-foreground">
                                    {phaseConfig.description}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={phaseConfig.borderColor}>
                                  {completedCount}/{phaseTasks.length} complete
                                </Badge>
                                {allPhaseTasksComplete && (
                                  <Badge className="bg-green-100 text-green-700 border-green-300">
                                    Phase Complete
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {!phaseUnlocked ? (
                            <div className="p-6 text-center text-muted-foreground bg-gray-50">
                              <Lock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                              <p className="text-sm">
                                Complete all required tasks in previous phase{phaseIndex > 1 ? 's' : ''} to unlock
                              </p>
                            </div>
                          ) : (
                            <>
                            <Accordion 
                              type="multiple" 
                              defaultValue={phaseTasks.map((t) => t.id)}
                              className="bg-white"
                            >
                              {phaseTasks.map((task) => {
                                const TaskIcon = TASK_TYPE_ICONS[task.taskType] || FileText;
                                const isComplete = task.status === 'COMPLETED';

                                return (
                                  <AccordionItem key={task.id} value={task.id} className="border-b last:border-b-0">
                                    <AccordionTrigger className="hover:no-underline px-4">
                                      <div className="flex items-center gap-3">
                                        <div
                                          className={`p-2 rounded ${
                                            isComplete ? 'bg-green-100' : 'bg-gray-100'
                                          }`}
                                        >
                                          <TaskIcon
                                            className={`h-4 w-4 ${
                                              isComplete ? 'text-green-600' : 'text-gray-600'
                                            }`}
                                          />
                                        </div>
                                        <div className="text-left">
                                          <p className="font-medium">{task.title}</p>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs text-muted-foreground">
                                              {task.taskType}
                                              {task.required && ' • Required'}
                                            </span>
                                            {task.requiresSignature && (
                                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">
                                                {task.signatureRole || 'SIG'}
                                              </span>
                                            )}
                                            {task.requiresCertification && (
                                              <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded">CERT</span>
                                            )}
                                            {task.timePolicy === 'MANUAL_ENTRY' && (
                                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">MANUAL TIME</span>
                                            )}
                                            {task.instructionPack && (
                                              <span className="text-[10px] bg-blue-50 text-blue-600 px-1 rounded flex items-center gap-0.5">
                                                <BookOpen className="h-2.5 w-2.5" /> INSTRUCTIONS
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {isComplete && (
                                          <CheckCircle className="h-5 w-5 text-green-500 ml-auto" />
                                        )}
                                      </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="px-4">
                                      <div className="pl-12 space-y-4 pb-4">
                                        {task.instructions && (
                                          <p className="text-sm text-muted-foreground">
                                            {task.instructions}
                                          </p>
                                        )}

                                        {/* Instruction Pack — Always Visible During Work */}
                                        {(() => {
                                          const pack = normalizeInstructionPack(task.instructionPack);
                                          if (!pack) return null;
                                          return (
                                            <div className="space-y-3 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                                              <div className="flex items-center gap-2 pb-1 border-b border-blue-200 dark:border-blue-800">
                                                <BookOpen className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                <p className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wider">Work Instructions</p>
                                              </div>

                                              {pack.specialNotes && (
                                                <div className="rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3">
                                                  <div className="flex items-start gap-2">
                                                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                                    <div>
                                                      <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-1">Special Notes</p>
                                                      <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">{pack.specialNotes}</p>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}

                                              {pack.workInstructionRefs.length > 0 && (
                                                <div className="space-y-1.5">
                                                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                                    <FileText className="h-3 w-3" /> Reference Documents
                                                  </p>
                                                  {pack.workInstructionRefs.map((ref, i) => (
                                                    <div key={i} className="flex items-center gap-2 p-2 rounded border bg-white dark:bg-slate-900">
                                                      <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                                      <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium">{ref.title || ref.documentId}</p>
                                                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                                                          {ref.pageRange && <span>Pages {ref.pageRange}</span>}
                                                          {ref.anchor && <span>Section: {ref.anchor}</span>}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              {pack.aiSnippets.length > 0 && (
                                                <div className="space-y-1.5">
                                                  <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 flex items-center gap-1">
                                                    <Lightbulb className="h-3 w-3" /> Tips & Guidance
                                                  </p>
                                                  {pack.aiSnippets.map((snippet, i) => (
                                                    <div key={i} className="p-2 rounded border bg-white dark:bg-slate-900">
                                                      <p className="text-sm font-medium mb-1">{snippet.title}</p>
                                                      <ul className="space-y-0.5 ml-3">
                                                        {snippet.bullets.map((b, bi) => (
                                                          <li key={bi} className="text-xs text-muted-foreground flex items-start gap-1">
                                                            <span className="shrink-0 mt-0.5">•</span>
                                                            <span>{b}</span>
                                                          </li>
                                                        ))}
                                                      </ul>
                                                    </div>
                                                  ))}
                                                </div>
                                              )}

                                              {pack.media.length > 0 && (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="w-full text-xs"
                                                  onClick={() => { setInstructionSheetTaskId(task.id); setInstructionSheetOpen(true); }}
                                                >
                                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                                  View {pack.media.length} Attached Media
                                                </Button>
                                              )}
                                            </div>
                                          );
                                        })()}

                                        {(task.taskType === 'TRACE' || task.taskType === 'TRACEABILITY') && !isComplete ? (
                                          <MaterialScanner
                                            travelerId={traveler.id}
                                            travelerStepId={currentStep.id}
                                            allowFreeTextEntry={true}
                                            onMaterialConsumed={(result) => {
                                              // Handle manual entry (free text control number)
                                              if (result?.entryMethod === 'manual') {
                                                const today = new Date().toISOString().split('T')[0];
                                                const traceFieldVals: Record<string, string> = {
                                                  internalControlNumber: result.internalControlNumber || '',
                                                  material_icn: result.internalControlNumber || '',
                                                  material_lot: '',
                                                  qty_used: '',
                                                  unit_of_measure: '',
                                                  material_part_number: '',
                                                  supplier: 'Manual Entry',
                                                  inventoryPartNumber: 'Manual Entry',
                                                  supplierBatchLot: 'N/A',
                                                  manufacturer: 'Manual Entry',
                                                  rollNumber: 'N/A',
                                                  expirationDate: today,
                                                  receivedDate: today,
                                                };
                                                completeTaskMutation.mutate({ 
                                                  taskId: task.id, 
                                                  fieldVals: traceFieldVals 
                                                });
                                                return;
                                              }
                                              // Handle validated scan entry
                                              const consumption = result?.consumption;
                                              const lot = result?.updatedLot;
                                              const traceFieldVals: Record<string, string> = {
                                                material_icn: consumption?.internalControlNumber || lot?.internalControlNumber || '',
                                                material_lot: lot?.supplierLotNumber || '',
                                                qty_used: consumption?.qtyUsed?.toString() || '',
                                                unit_of_measure: consumption?.unitOfMeasure || lot?.unitOfMeasure || '',
                                                material_part_number: lot?.materialPartNumber || '',
                                              };
                                              completeTaskMutation.mutate({ 
                                                taskId: task.id, 
                                                fieldVals: traceFieldVals 
                                              });
                                            }}
                                          />
                                        ) : (
                                          <>
                                            {task.fields.length > 0 && (
                                              <div className="space-y-3">
                                                {task.fields.map((field) => (
                                                  <div key={field.id} className="space-y-1">
                                                    <Label className="text-sm">
                                                      {(() => {
                                                        const labelMap: Record<string, string> = {
                                                          internalControlNumber: 'Internal Control Number',
                                                          supplier: 'Supplier',
                                                          inventoryPartNumber: 'Inventory Part Number',
                                                          batchLotNumber: 'Batch/Lot #',
                                                          manufacturer: 'Manufacturer',
                                                          rollNumber: 'Roll Number',
                                                          expirationDate: 'Expiration Date',
                                                          receivedDate: 'Received Date',
                                                        };
                                                        return labelMap[field.fieldKey] || field.fieldLabel;
                                                      })()}
                                                      {field.required && (
                                                        <span className="text-red-500 ml-1">*</span>
                                                      )}
                                                    </Label>
                                                    {field.fieldType === 'yes_no' ? (
                                                      <div className="space-y-2">
                                                        {field.validation && (field.validation.tolerance || field.validation.requirement) && (
                                                          <div className="flex flex-wrap gap-2 text-xs mb-1">
                                                            {field.validation.tolerance && (
                                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                                                <Wrench className="h-3 w-3" />
                                                                Tolerance: {field.validation.tolerance}
                                                              </span>
                                                            )}
                                                            {field.validation.requirement && (
                                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
                                                                <Shield className="h-3 w-3" />
                                                                Requirement: {field.validation.requirement}
                                                              </span>
                                                            )}
                                                            {field.validation.temperature && (
                                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                                Temp: {field.validation.temperature}
                                                              </span>
                                                            )}
                                                            {field.validation.time && (
                                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                                                <Clock className="h-3 w-3" />
                                                                Time: {field.validation.time}
                                                              </span>
                                                            )}
                                                          </div>
                                                        )}
                                                        {task.taskType === 'QC' && (
                                                          <div className="space-y-1">
                                                            <Label className="text-xs font-medium text-muted-foreground">
                                                              Measured Result {field.required && <span className="text-red-500">*</span>}
                                                            </Label>
                                                            <Input
                                                              placeholder={field.validation?.tolerance ? `Enter result (Tolerance: ${field.validation.tolerance})` : 'Enter measured result...'}
                                                              value={fieldValues[task.id]?.[`${field.fieldKey}_result`] || (field.value?.includes('|') ? field.value.split('|')[1] : '') || ''}
                                                              onChange={(e) => handleFieldChange(task.id, `${field.fieldKey}_result`, e.target.value)}
                                                              disabled={isComplete}
                                                              className="text-sm h-9"
                                                            />
                                                          </div>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                          <Checkbox
                                                            id={field.id}
                                                            checked={
                                                              fieldValues[task.id]?.[field.fieldKey] !== undefined
                                                                ? fieldValues[task.id][field.fieldKey] === 'yes'
                                                                : field.value === 'yes'
                                                            }
                                                            onCheckedChange={(checked) =>
                                                              handleFieldChange(
                                                                task.id,
                                                                field.fieldKey,
                                                                checked ? 'yes' : 'no'
                                                              )
                                                            }
                                                            disabled={isComplete}
                                                          />
                                                          <Label htmlFor={field.id} className="text-sm cursor-pointer">
                                                            Verified / Pass
                                                          </Label>
                                                        </div>
                                                      </div>
                                                    ) : field.fieldType === 'textarea' ? (
                                                      <Textarea
                                                        value={
                                                          fieldValues[task.id]?.[field.fieldKey] ||
                                                          field.value ||
                                                          ''
                                                        }
                                                        onChange={(e) =>
                                                          handleFieldChange(
                                                            task.id,
                                                            field.fieldKey,
                                                            e.target.value
                                                          )
                                                        }
                                                        disabled={isComplete}
                                                        className="text-sm"
                                                      />
                                                    ) : (
                                                      <Input
                                                        type={field.fieldType === 'number' ? 'number' : 'text'}
                                                        value={
                                                          fieldValues[task.id]?.[field.fieldKey] ||
                                                          field.value ||
                                                          ''
                                                        }
                                                        onChange={(e) =>
                                                          handleFieldChange(
                                                            task.id,
                                                            field.fieldKey,
                                                            e.target.value
                                                          )
                                                        }
                                                        disabled={isComplete}
                                                        className="text-sm"
                                                      />
                                                    )}
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            {!isComplete && task.taskType !== 'END_GATE' && task.taskType !== 'TRACE' && task.taskType !== 'TRACEABILITY' && (
                                              task.taskType === 'SIGNATURE' ? (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                                  onClick={() => {
                                                    setSigningTaskId(task.id);
                                                    setSigningRole(task.signatureRole);
                                                    setSignatureData((prev) => ({
                                                      ...prev,
                                                      signedBy: activeBadge || prev.signedBy,
                                                      signedByName: activeTechName || prev.signedByName,
                                                      badgeScan: activeBadge || prev.badgeScan,
                                                    }));
                                                    setShowSignDialog(true);
                                                  }}
                                                  disabled={!phaseUnlocked}
                                                  data-testid={`button-sign-task-${task.id}`}
                                                >
                                                  <PenTool className="h-4 w-4 mr-2" />
                                                  Sign ({task.signatureRole || 'Required'})
                                                </Button>
                                              ) : (
                                                <Button
                                                  size="sm"
                                                  onClick={() => handleCompleteTask(task)}
                                                  disabled={completeTaskMutation.isPending}
                                                  data-testid={`button-complete-task-${task.id}`}
                                                >
                                                  {completeTaskMutation.isPending ? (
                                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                  ) : (
                                                    <CheckCircle className="h-4 w-4 mr-2" />
                                                  )}
                                                  Complete Task
                                                </Button>
                                              )
                                            )}
                                          </>
                                        )}

                                        {isComplete && (
                                          <p className="text-xs text-muted-foreground">
                                            Completed by {task.completedBy} at{' '}
                                            {task.completedAt
                                              ? new Date(task.completedAt).toLocaleString()
                                              : 'N/A'}
                                          </p>
                                        )}
                                      </div>
                                    </AccordionContent>
                                  </AccordionItem>
                                );
                              })}
                            </Accordion>

                            {phase === 'WORK' && (() => {
                              const timerConfig = getTimerConfigForDepartment(currentStep.departmentName);
                              if (!timerConfig) return null;
                              const stepTimerStarted = timerStartedForStep[currentStep.id];
                              return (
                                <div className="mx-4 my-3 p-3 border border-amber-200 bg-amber-50 rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Timer className="h-5 w-5 text-amber-600" />
                                      <div>
                                        <p className="font-medium text-amber-800 text-sm">Production Timer</p>
                                        <p className="text-xs text-amber-600">
                                          {timerConfig.defaultProgramName
                                            ? `Program: ${timerConfig.defaultProgramName}`
                                            : 'Start a timer on the timer station'}
                                        </p>
                                      </div>
                                    </div>
                                    {stepTimerStarted ? (
                                      <Badge className="bg-green-100 text-green-700 border-green-300">
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Timer Running
                                      </Badge>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-amber-300 text-amber-700 hover:bg-amber-100"
                                        onClick={() => setShowTimerModal(true)}
                                      >
                                        <Timer className="h-4 w-4 mr-1" />
                                        Start Timer
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            </>
                          )}
                        </div>
                      );
                    })}

                    <div className="pt-4 border-t space-y-3">
                      {!canSignStep && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="text-sm text-amber-800">
                              {!allRequiredNonGateComplete && (
                                <p>Complete all required tasks before signing off.</p>
                              )}
                              {allRequiredNonGateComplete && unsignedSigTasks.length > 0 && (
                                <div>
                                  <p className="font-medium mb-1">Signatures still needed:</p>
                                  <ul className="list-disc list-inside text-xs space-y-0.5">
                                    {unsignedSigTasks.map((t) => (
                                      <li key={t.id}>
                                        {t.title}
                                        {t.signatureRole && (
                                          <span className="text-amber-600 ml-1">({t.signatureRole})</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button
                          onClick={() => {
                            setSigningTaskId(null);
                            setSigningRole(null);
                            setSignatureData((prev) => ({
                              ...prev,
                              signedBy: activeBadge || prev.signedBy,
                              signedByName: activeTechName || prev.signedByName,
                              badgeScan: activeBadge || prev.badgeScan,
                            }));
                            setShowSignDialog(true);
                          }}
                          disabled={!canSignStep}
                          data-testid="button-sign-step"
                        >
                          <PenTool className="h-4 w-4 mr-2" />
                          Sign & Complete Step
                        </Button>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {currentStep.status === 'COMPLETED' && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p className="font-medium text-green-700">Step Completed</p>
                    {currentStep.signatures.length > 0 && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg max-w-md mx-auto">
                        <p className="text-sm text-muted-foreground mb-2">Signed by:</p>
                        {currentStep.signatures.map((sig: TravelerSignature) => (
                          <div key={sig.id} className="text-sm border-b last:border-b-0 py-2">
                            <div className="flex items-start gap-3">
                              {sig.signatureData && (
                                <img
                                  src={sig.signatureData}
                                  alt={`Signature by ${sig.signedByName || sig.signedBy}`}
                                  className="h-10 w-24 object-contain border rounded bg-white"
                                />
                              )}
                              <div className="flex-1">

                                <p className="font-medium">
                                  {sig.signedByName || sig.signedBy}
                                  {sig.signatureRole && (
                                    <Badge variant="outline" className="ml-2 text-[10px]">{sig.signatureRole}</Badge>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(sig.signedAt).toLocaleString()} - {sig.meaning}
                                </p>
                              </div>
                            </div>
                            {sig.signatureData && (
                              <div className="border rounded bg-white p-1">
                                <img
                                  src={sig.signatureData}
                                  alt={`Signature by ${sig.signedByName || sig.signedBy}`}
                                  className="h-12 object-contain mx-auto"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={showSignDialog} onOpenChange={(open) => {
        setShowSignDialog(open);
        if (!open && sigPadRef.current) sigPadRef.current.clear();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {signingRole ? `${signingRole} Signoff` : 'Sign Step Completion'}
            </DialogTitle>
            <DialogDescription>
              {signingRole
                ? `${signingRole} signature required for this department`
                : 'Your signature confirms all tasks in this step are complete'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Employee ID / Badge *</Label>
                <Input
                  value={signatureData.signedBy}
                  onChange={(e) =>
                    setSignatureData({ ...signatureData, signedBy: e.target.value })
                  }
                  placeholder="Scan badge or enter ID"
                  data-testid="input-sign-badge"
                />
              </div>
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={signatureData.signedByName}
                  onChange={(e) =>
                    setSignatureData({ ...signatureData, signedByName: e.target.value })
                  }
                  placeholder="Your full name"
                  data-testid="input-sign-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Signature *</Label>
              <div className={`border-2 rounded-lg overflow-hidden ${signatureData.signatureData ? 'border-green-500' : 'border-dashed border-muted-foreground/30'}`}>
                <SignatureCanvas
                  ref={sigPadRef}
                  canvasProps={{
                    className: 'w-full h-[150px] bg-white cursor-crosshair',
                    style: { width: '100%', height: '150px' },
                  }}
                  penColor="black"
                  onEnd={() => {
                    if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
                      setSignatureData(prev => ({
                        ...prev,
                        signatureData: sigPadRef.current!.toDataURL('image/png'),
                      }));
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {signatureData.signatureData ? 'Signature captured' : 'Draw your signature above'}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sigPadRef.current) sigPadRef.current.clear();
                    setSignatureData(prev => ({ ...prev, signatureData: '' }));
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={signatureData.notes}
                onChange={(e) =>
                  setSignatureData({ ...signatureData, notes: e.target.value })
                }
                placeholder="Any additional notes..."
                rows={2}
                data-testid="input-sign-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => currentStep && signStepMutation.mutate({ stepId: currentStep.id, taskId: signingTaskId, role: signingRole })}
              disabled={signStepMutation.isPending || !signatureData.signedBy || !signatureData.signatureData}
              data-testid="button-confirm-sign"
            >
              {signStepMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <PenTool className="h-4 w-4 mr-2" />
              Sign & Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block Traveler</DialogTitle>
            <DialogDescription>
              Blocking will pause all work on this traveler
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for Blocking *</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="Describe why this traveler is being blocked..."
                data-testid="input-block-reason"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => blockMutation.mutate()}
              disabled={blockMutation.isPending || !blockReason}
              data-testid="button-confirm-block"
            >
              {blockMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Block Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instruction Pack Sheet Drawer */}
      <Sheet open={instructionSheetOpen} onOpenChange={setInstructionSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              Instruction Pack
            </SheetTitle>
            <SheetDescription>
              Work instructions, tips, and reference materials for this task
            </SheetDescription>
          </SheetHeader>

          {(() => {
            const sheetTask = currentStep?.tasks?.find((t: TravelerTask) => t.id === instructionSheetTaskId);
            const pack = sheetTask ? normalizeInstructionPack(sheetTask.instructionPack) : null;
            if (!pack) return <p className="text-sm text-muted-foreground mt-4">No instructions available.</p>;

            return (
              <div className="space-y-6 mt-6">
                {pack.specialNotes && (
                  <div className="rounded-lg border-2 border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider mb-2">Special Notes</p>
                        <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">{pack.specialNotes}</p>
                      </div>
                    </div>
                  </div>
                )}

                {pack.workInstructionRefs.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <p className="text-sm font-semibold">Work Instructions</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      {pack.workInstructionRefs.map((ref, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                          <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{ref.title || ref.documentId}</p>
                            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                              {ref.pageRange && <span>Pages {ref.pageRange}</span>}
                              {ref.anchor && <span>§ {ref.anchor}</span>}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              setWiModalRef(ref);
                              setWiModalOpen(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View WI
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pack.aiSnippets.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      <p className="text-sm font-semibold">AI Tips</p>
                    </div>
                    <Separator />
                    <Accordion type="multiple" defaultValue={pack.aiSnippets.map((_, i) => `snippet-${i}`)} className="space-y-2">
                      {pack.aiSnippets.map((snippet, i) => (
                        <AccordionItem key={i} value={`snippet-${i}`} className="border rounded-lg px-3">
                          <AccordionTrigger className="py-2 hover:no-underline">
                            <div className="flex items-center gap-2 text-sm">
                              <Lightbulb className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                              <span className="font-medium">{snippet.title}</span>
                              {snippet.confidence != null && (
                                <Badge variant="outline" className="text-[10px] ml-auto mr-2">
                                  {Math.round(snippet.confidence * 100)}% confidence
                                </Badge>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-1.5 pb-2">
                              {snippet.bullets.map((b, bi) => (
                                <li key={bi} className="text-sm text-muted-foreground flex items-start gap-2">
                                  <span className="text-yellow-500 shrink-0 mt-0.5">•</span>
                                  <span>{b}</span>
                                </li>
                              ))}
                            </ul>
                            {snippet.sourceDocumentId && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" />
                                Source: {snippet.sourceDocumentId}
                              </p>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}

                {pack.media.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-green-600" />
                      <p className="text-sm font-semibold">Reference Media</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      {pack.media.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                          {m.type === 'image' ? (
                            <ImageIcon className="h-5 w-5 text-green-500 shrink-0" />
                          ) : (
                            <FileText className="h-5 w-5 text-red-500 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{m.caption || m.documentId}</p>
                            <p className="text-xs text-muted-foreground uppercase">{m.type}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              setWiModalRef({ documentId: m.documentId, title: m.caption });
                              setWiModalOpen(true);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            Open
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Work Instruction Detail Modal */}
      <Dialog open={wiModalOpen} onOpenChange={setWiModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              {wiModalRef?.title || 'Work Instruction'}
            </DialogTitle>
            <DialogDescription>
              Document reference viewer
            </DialogDescription>
          </DialogHeader>

          {wiModalRef && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Document ID</p>
                  <p className="font-mono text-xs bg-muted p-2 rounded">{wiModalRef.documentId}</p>
                </div>
                {wiModalRef.pageRange && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Page Range</p>
                    <p className="text-sm font-medium">Pages {wiModalRef.pageRange}</p>
                  </div>
                )}
                {wiModalRef.anchor && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Section</p>
                    <p className="text-sm font-medium">§ {wiModalRef.anchor}</p>
                  </div>
                )}
              </div>

              <Separator />

              <WiDocumentViewer documentId={wiModalRef.documentId} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setWiModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {traveler && currentStep && (
        <StartProductionTimerModal
          open={showTimerModal}
          onOpenChange={setShowTimerModal}
          defaultSerialNumber={traveler.serialNumber || traveler.lotNumber || ''}
          defaultProgramId={getTimerConfigForDepartment(currentStep.departmentName)?.defaultProgramId}
          navigateToStation={false}
          badgeId={activeBadge || undefined}
          onTimerStarted={() => {
            setTimerStartedForStep((prev) => ({
              ...prev,
              [currentStep.id]: true,
            }));
            toast({
              title: 'Timer Started',
              description: 'Timer is now running on the timer station. You may continue with traveler tasks.',
            });
          }}
        />
      )}
    </div>
  );
}

function WiDocumentViewer({ documentId }: { documentId: string }) {
  const { data: doc, isLoading, error } = useQuery<{
    id: string;
    title: string;
    description?: string;
    version: number;
    documentType: string;
    fileUrl?: string;
    fileName?: string;
    fileType?: string;
    aiExtractedContent?: any;
  }>({
    queryKey: ['/api/routing-documents', documentId],
    queryFn: () =>
      fetch(`/api/routing-documents/${documentId}`).then((res) => {
        if (!res.ok) throw new Error('Document not found');
        return res.json();
      }),
    enabled: !!documentId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading document...</span>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">Document Not Linked</p>
        <p className="text-xs text-muted-foreground mt-1">
          This reference (ID: {documentId.slice(0, 8)}...) is not yet linked to a routing document.
          The document ID will resolve when the routing document system is populated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-4 bg-card">
        <div className="flex items-start gap-3">
          <FileText className="h-6 w-6 text-blue-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-base font-semibold">{doc.title}</p>
            <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
              <span>Version {doc.version}</span>
              <span className="capitalize">{doc.documentType?.replace(/_/g, ' ')}</span>
              {doc.fileName && <span>{doc.fileName}</span>}
            </div>
            {doc.description && (
              <p className="text-sm text-muted-foreground mt-2">{doc.description}</p>
            )}
          </div>
        </div>
      </div>

      {doc.fileUrl && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Open Document
            </a>
          </Button>
        </div>
      )}

      {doc.aiExtractedContent && (
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">AI-Extracted Content</p>
          <p className="text-sm whitespace-pre-wrap">
            {typeof doc.aiExtractedContent === 'string'
              ? doc.aiExtractedContent
              : JSON.stringify(doc.aiExtractedContent, null, 2).slice(0, 2000)}
          </p>
        </div>
      )}
    </div>
  );
}

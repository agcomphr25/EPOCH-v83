import { useState, useEffect } from 'react';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
} from 'lucide-react';
import MaterialScanner from '@/components/MaterialScanner';

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
  taskPhase: 'START' | 'WORK' | 'FINISH'; // Execution order enforcement
  title: string;
  instructions: string | null;
  required: boolean;
  sortOrder: number;
  status: string;
  completedAt: string | null;
  completedBy: string | null;
  fields: TravelerTaskField[];
}

interface TravelerSignature {
  id: string;
  travelerStepId: string;
  signedBy: string;
  signedByName: string | null;
  badgeScan: string | null;
  signedAt: string;
  meaning: string;
  notes: string | null;
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
  START_GATE: Play,
  END_GATE: CheckCircle,
  TRACE: CreditCard,
  QC: ClipboardCheck,
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
  const [signatureData, setSignatureData] = useState({
    signedBy: '',
    signedByName: '',
    badgeScan: '',
    meaning: 'COMPLETED',
    notes: '',
  });
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  useEffect(() => {
    if (steps.length > 0 && !currentStepId) {
      const inProgressStep = steps.find((s) => s.status === 'IN_PROGRESS');
      const nextStep = steps.find((s) => s.status === 'NOT_STARTED');
      setCurrentStepId(inProgressStep?.id || nextStep?.id || steps[0].id);
    }
  }, [steps, currentStepId]);

  const startStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      apiRequest(`/api/travelers/${travelerId}/steps/${stepId}/start`, {
        method: 'POST',
        body: JSON.stringify({ startedBy: 'operator', badgeScan: signatureData.badgeScan }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Step Started', description: 'Work on this step has begun' });
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
    mutationFn: (stepId: string) =>
      apiRequest(`/api/travelers/${travelerId}/steps/${stepId}/sign`, {
        method: 'POST',
        body: JSON.stringify(signatureData),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({ title: 'Step Signed', description: 'Step has been completed and signed' });
      setShowSignDialog(false);
      setSignatureData({
        signedBy: '',
        signedByName: '',
        badgeScan: '',
        meaning: 'COMPLETED',
        notes: '',
      });
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
    const missingRequired = task.fields
      .filter((f) => f.required && !taskFieldVals[f.fieldKey] && !f.value)
      .map((f) => f.fieldLabel);

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
              {(traveler.lotNumber || traveler.serialNumber) && (
                <div>
                  <span className="text-muted-foreground">Lot/Serial:</span>
                  <p className="font-medium">
                    {traveler.lotNumber || traveler.serialNumber}
                  </p>
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
                    <Play className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      Badge scan required to start this step
                    </p>
                    <div className="max-w-xs mx-auto space-y-3">
                      <Input
                        placeholder="Scan badge or enter ID..."
                        value={signatureData.badgeScan}
                        onChange={(e) =>
                          setSignatureData({ ...signatureData, badgeScan: e.target.value })
                        }
                        data-testid="input-badge-scan"
                      />
                      <Button
                        onClick={() => startStepMutation.mutate(currentStep.id)}
                        disabled={startStepMutation.isPending}
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

                {currentStep.status === 'IN_PROGRESS' && (
                  <div className="space-y-6">
                    {PHASE_ORDER.map((phase, phaseIndex) => {
                      const phaseTasks = currentStep.tasks
                        .filter((t) => t.taskPhase === phase)
                        .sort((a, b) => a.sortOrder - b.sortOrder);
                      
                      if (phaseTasks.length === 0) return null;
                      
                      const phaseConfig = PHASE_CONFIG[phase];
                      const PhaseIcon = phaseConfig.icon;
                      const allPhaseTasksComplete = phaseTasks.every((t) => t.status === 'COMPLETED');
                      
                      const previousPhasesComplete = PHASE_ORDER.slice(0, phaseIndex).every((prevPhase) => {
                        const prevTasks = currentStep.tasks.filter((t) => t.taskPhase === prevPhase);
                        return prevTasks
                          .filter((t) => t.required && t.taskType !== 'END_GATE')
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
                                          <p className="text-xs text-muted-foreground">
                                            {task.taskType}
                                            {task.required && ' • Required'}
                                          </p>
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

                                        {task.taskType === 'TRACE' && !isComplete ? (
                                          <MaterialScanner
                                            travelerId={traveler.id}
                                            travelerStepId={currentStep.id}
                                            allowFreeTextEntry={true}
                                            onMaterialConsumed={(result) => {
                                              // Handle manual entry (free text control number)
                                              if (result?.entryMethod === 'manual') {
                                                const traceFieldVals: Record<string, string> = {
                                                  material_icn: result.internalControlNumber || '',
                                                  material_lot: '',
                                                  qty_used: '',
                                                  unit_of_measure: '',
                                                  material_part_number: '',
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
                                                      {field.fieldLabel}
                                                      {field.required && (
                                                        <span className="text-red-500 ml-1">*</span>
                                                      )}
                                                    </Label>
                                                    {field.fieldType === 'yes_no' ? (
                                                      <div className="flex items-center gap-2">
                                                        <Checkbox
                                                          id={field.id}
                                                          checked={
                                                            fieldValues[task.id]?.[field.fieldKey] ===
                                                              'yes' || field.value === 'yes'
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
                                                        <Label htmlFor={field.id} className="text-sm">
                                                          Verified
                                                        </Label>
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

                                            {!isComplete && task.taskType !== 'END_GATE' && task.taskType !== 'TRACE' && (
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
                          )}
                        </div>
                      );
                    })}

                    <div className="flex justify-end pt-4 border-t">
                      <Button
                        onClick={() => setShowSignDialog(true)}
                        disabled={currentStep.tasks.some(
                          (t) => t.required && t.status !== 'COMPLETED' && t.taskType !== 'END_GATE'
                        )}
                        data-testid="button-sign-step"
                      >
                        <PenTool className="h-4 w-4 mr-2" />
                        Sign & Complete Step
                      </Button>
                    </div>
                  </div>
                )}

                {currentStep.status === 'COMPLETED' && (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p className="font-medium text-green-700">Step Completed</p>
                    {currentStep.signatures.length > 0 && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg max-w-md mx-auto">
                        <p className="text-sm text-muted-foreground mb-2">Signed by:</p>
                        {currentStep.signatures.map((sig) => (
                          <div key={sig.id} className="text-sm">
                            <p className="font-medium">
                              {sig.signedByName || sig.signedBy}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(sig.signedAt).toLocaleString()} - {sig.meaning}
                            </p>
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

      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign Step Completion</DialogTitle>
            <DialogDescription>
              Your signature confirms all tasks in this step are complete
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={signatureData.notes}
                onChange={(e) =>
                  setSignatureData({ ...signatureData, notes: e.target.value })
                }
                placeholder="Any additional notes..."
                data-testid="input-sign-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => currentStep && signStepMutation.mutate(currentStep.id)}
              disabled={signStepMutation.isPending || !signatureData.signedBy}
              data-testid="button-confirm-sign"
            >
              {signStepMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  Shield,
  Wrench,
  ClipboardCheck,
  CreditCard,
  FileText,
  PenTool,
  Play,
  AlertTriangle,
  Timer,
  XCircle,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { displaySignerName } from '@/lib/signerName';

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
  requiresSignature: boolean;
  signatureRole: string | null;
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

interface TravelerDetails {
  traveler: {
    id: string;
    travelerNumber: string;
    travelerRevision: number;
    partNumber: string | null;
    partName: string | null;
    workOrderId: string | null;
    lotNumber: string | null;
    serialNumber: string | null;
    quantity: number;
    status: string;
    createdBy: string;
    createdAt: string;
  };
  steps: TravelerStep[];
  events: any[];
}

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
  TIMER: Timer,
  CUSTOM_FIELD: FileText,
  SPECIAL_PROCESS: AlertTriangle,
  NOTES: FileText,
};

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  START: { label: 'Setup & Verification', color: 'bg-amber-50 border-amber-200 text-amber-800' },
  WORK: { label: 'Production Work', color: 'bg-blue-50 border-blue-200 text-blue-800' },
  FINISH: { label: 'QC & Sign-off', color: 'bg-green-50 border-green-200 text-green-800' },
};

const STEP_STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-700 border-gray-300',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-300',
  COMPLETED: 'bg-green-100 text-green-700 border-green-300',
  BLOCKED: 'bg-red-100 text-red-700 border-red-300',
};

function formatFieldValue(field: TravelerTaskField): { display: string; status?: 'pass' | 'fail' | null; measured?: string } {
  const val = field.value;
  if (!val) return { display: '—' };

  if (field.fieldType === 'yes_no') {
    if (val.includes('|')) {
      const [status, measured] = val.split('|');
      return {
        display: status === 'yes' ? 'Pass' : 'Fail',
        status: status === 'yes' ? 'pass' : 'fail',
        measured,
      };
    }
    return {
      display: val === 'yes' ? 'Pass' : 'Fail',
      status: val === 'yes' ? 'pass' : 'fail',
    };
  }

  if (field.fieldType === 'date') {
    try {
      return { display: format(new Date(val), 'MMM d, yyyy') };
    } catch {
      return { display: val };
    }
  }

  return { display: val };
}

function TaskFieldRow({ field }: { field: TravelerTaskField }) {
  const { display, status, measured } = formatFieldValue(field);

  return (
    <div className="flex items-start justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{field.fieldLabel}</span>
          {field.required && <span className="text-xs text-red-500">*</span>}
        </div>
        {field.recordedBy && field.recordedAt && (
          <div className="text-xs text-muted-foreground mt-0.5">
            by {field.recordedBy} · {format(new Date(field.recordedAt), 'MMM d, h:mm a')}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 ml-4 flex-shrink-0">
        {status === 'pass' ? (
          <Badge className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />Pass
          </Badge>
        ) : status === 'fail' ? (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />Fail
          </Badge>
        ) : (
          <span className="text-sm font-mono text-foreground">{display}</span>
        )}
        {measured && (
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Measured: {measured}
          </span>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: TravelerTask }) {
  const Icon = TASK_TYPE_ICONS[task.taskType] || FileText;
  const hasData = task.fields.some(f => f.value);
  const completedFields = task.fields.filter(f => f.value).length;
  const totalFields = task.fields.length;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <span className="text-sm font-medium">{task.title}</span>
            {task.instructions && (
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">{task.instructions}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalFields > 0 && (
            <span className="text-xs text-muted-foreground">
              {completedFields}/{totalFields} fields
            </span>
          )}
          {task.status === 'COMPLETED' ? (
            <Badge className="bg-green-100 text-green-700 text-xs">
              <CheckCircle className="h-3 w-3 mr-1" />Done
            </Badge>
          ) : task.status === 'IN_PROGRESS' ? (
            <Badge className="bg-blue-100 text-blue-700 text-xs">
              <Clock className="h-3 w-3 mr-1" />Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Pending</Badge>
          )}
        </div>
      </div>

      {hasData && (
        <div className="divide-y">
          {task.fields
            .filter(f => f.value)
            .map(field => (
              <TaskFieldRow key={field.id} field={field} />
            ))}
        </div>
      )}

      {task.completedBy && task.completedAt && (
        <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground flex items-center gap-2">
          <PenTool className="h-3 w-3" />
          Completed by {task.completedBy} on {format(new Date(task.completedAt), 'MMM d, yyyy h:mm a')}
        </div>
      )}
    </div>
  );
}

function StepSection({ step, defaultExpanded = false }: { step: TravelerStep; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const statusStyle = STEP_STATUS_STYLES[step.status] || STEP_STATUS_STYLES.NOT_STARTED;

  const tasksWithData = step.tasks.filter(t => t.fields.some(f => f.value) || t.status === 'COMPLETED');
  const allTasks = step.tasks;

  const phases = ['START', 'WORK', 'FINISH'] as const;
  const tasksByPhase = phases.map(phase => ({
    phase,
    ...PHASE_LABELS[phase],
    tasks: allTasks.filter(t => t.taskPhase === phase),
  })).filter(p => p.tasks.length > 0);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              Step {step.stepNumber}: {step.departmentName}
            </span>
            <Badge className={`text-xs ${statusStyle}`}>
              {step.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {tasksWithData.length > 0 && (
            <span>{tasksWithData.length} completed task{tasksWithData.length !== 1 ? 's' : ''}</span>
          )}
          {step.signatures.length > 0 && (
            <span>{step.signatures.length} signature{step.signatures.length !== 1 ? 's' : ''}</span>
          )}
          {step.completedAt && (
            <span>Completed {format(new Date(step.completedAt), 'MMM d, yyyy')}</span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t px-4 py-4 space-y-4">
          {step.startedAt && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {step.startedBy && <span>Started by: <strong>{step.startedBy}</strong></span>}
              <span>Started: {format(new Date(step.startedAt), 'MMM d, yyyy h:mm a')}</span>
              {step.completedAt && (
                <span>Completed: {format(new Date(step.completedAt), 'MMM d, yyyy h:mm a')}</span>
              )}
            </div>
          )}

          {step.blockedReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <strong>Blocked:</strong> {step.blockedReason}
            </div>
          )}

          {step.notes && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <strong>Notes:</strong> {step.notes}
            </div>
          )}

          {tasksByPhase.map(({ phase, label, color, tasks }) => (
            <div key={phase}>
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border mb-3 ${color}`}>
                {phase === 'START' && <Play className="h-3 w-3" />}
                {phase === 'WORK' && <Wrench className="h-3 w-3" />}
                {phase === 'FINISH' && <ClipboardCheck className="h-3 w-3" />}
                {label}
              </div>
              <div className="space-y-2 ml-2">
                {tasks.map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </div>
          ))}

          {step.signatures.length > 0 && (
            <div>
              <Separator className="my-3" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                <PenTool className="h-3 w-3" />
                Signatures
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {step.signatures.map((sig) => (
                  <div key={sig.id} className="border rounded-lg p-3 bg-muted/20 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {displaySignerName(sig.signedByName, sig.signedBy)}
                        {sig.signatureRole && (
                          <Badge variant="outline" className="ml-2 text-xs">{sig.signatureRole}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {sig.meaning} · {format(new Date(sig.signedAt), 'MMM d, yyyy h:mm a')}
                      </div>
                      {sig.notes && <div className="text-xs text-muted-foreground">{sig.notes}</div>}
                    </div>
                    {sig.signatureData && (
                      <div className="bg-white dark:bg-gray-800 border rounded p-1">
                        <img src={sig.signatureData} alt="Signature" className="max-h-12 object-contain" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {allTasks.length === 0 && step.signatures.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No tasks or data captured for this step yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TravelerCapturedDataProps {
  travelerId: string;
  compact?: boolean;
}

export function TravelerCapturedDataById({ travelerId, compact = false }: TravelerCapturedDataProps) {
  const { data, isLoading, error } = useQuery<TravelerDetails>({
    queryKey: ['/api/travelers', travelerId, 'details'],
    queryFn: async () => {
      const res = await fetch(`/api/travelers/${travelerId}?details=true`);
      if (!res.ok) throw new Error('Failed to load traveler details');
      return res.json();
    },
    enabled: !!travelerId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
        <p className="text-sm">Could not load traveler data</p>
      </div>
    );
  }

  return <TravelerCapturedDataView details={data} compact={compact} />;
}

interface TravelerCapturedDataViewProps {
  details: TravelerDetails;
  compact?: boolean;
}

export function TravelerCapturedDataView({ details, compact = false }: TravelerCapturedDataViewProps) {
  const { traveler, steps } = details;

  const completedSteps = steps.filter(s => s.status === 'COMPLETED').length;
  const totalDataPoints = steps.reduce((sum, s) =>
    sum + s.tasks.reduce((tSum, t) => tSum + t.fields.filter(f => f.value).length, 0), 0
  );
  const totalSignatures = steps.reduce((sum, s) => sum + s.signatures.length, 0);

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Captured Production Data
            </h3>
            <p className="text-sm text-muted-foreground">
              Step-by-step data recorded during production for {traveler.travelerNumber}
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-lg">{completedSteps}/{steps.length}</div>
              <div className="text-xs text-muted-foreground">Steps</div>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="text-center">
              <div className="font-bold text-lg">{totalDataPoints}</div>
              <div className="text-xs text-muted-foreground">Data Points</div>
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="text-center">
              <div className="font-bold text-lg">{totalSignatures}</div>
              <div className="text-xs text-muted-foreground">Signatures</div>
            </div>
          </div>
        </div>
      )}

      {compact && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground px-1">
          <span>{completedSteps}/{steps.length} steps complete</span>
          <span>·</span>
          <span>{totalDataPoints} data points</span>
          <span>·</span>
          <span>{totalSignatures} signatures</span>
        </div>
      )}

      <div className="space-y-2">
        {steps.map((step, index) => (
          <StepSection
            key={step.id}
            step={step}
            defaultExpanded={step.status === 'IN_PROGRESS' || (compact && step.status === 'COMPLETED' && index === steps.length - 1)}
          />
        ))}
      </div>

      {steps.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/30">
          <FileText className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">No production steps recorded yet</p>
        </div>
      )}
    </div>
  );
}

interface TravelerCapturedDataBySerialProps {
  serialNumber: string;
}

export function TravelerCapturedDataBySerial({ serialNumber }: TravelerCapturedDataBySerialProps) {
  const { data, isLoading, error } = useQuery<TravelerDetails[]>({
    queryKey: ['/api/travelers/by-serial', serialNumber],
    queryFn: async () => {
      const res = await fetch(`/api/travelers/by-serial/${encodeURIComponent(serialNumber)}`);
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error('Failed to load traveler details');
      }
      return res.json();
    },
    enabled: !!serialNumber,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
        <p className="text-sm">Could not load traveler data</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/30">
        <FileText className="h-8 w-8 mx-auto mb-2" />
        <p className="text-sm">No production travelers linked to this serial number</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {data.map((details) => (
        <Card key={details.traveler.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono">{details.traveler.travelerNumber}</span>
                {details.traveler.partNumber && (
                  <Badge variant="outline">{details.traveler.partNumber}</Badge>
                )}
              </div>
              <Badge className={
                details.traveler.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                details.traveler.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                details.traveler.status === 'BLOCKED' ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-700'
              }>
                {details.traveler.status.replace('_', ' ')}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TravelerCapturedDataView details={details} compact />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

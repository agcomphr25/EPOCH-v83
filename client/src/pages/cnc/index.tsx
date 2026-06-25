import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, Play, Square, CheckCircle, Camera, ClipboardList,
  Settings, User, Flag, Trash2, Edit2, Save, X,
  Lightbulb, ArrowRight, ChevronRight, Link as LinkIcon, PauseCircle, BookOpen,
  ChevronDown, AlertTriangle, Calendar, Package, Printer, Ban, Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  CncMachine, TravelerInfo,
  CncJob, CncJobOperation, CncProgram, CncToolList, CncSetupPhoto,
  CncQcCheckpoint, CncQcResult, CncTimeLog, WorkOrderSearchResult,
  CreateJobPayload, UpdateJobPayload, CreateOperationPayload, UpdateOperationPayload,
  CreateToolPayload, CreateProgramPayload, CreatePhotoPayload,
  CreateCheckpointPayload, CreateQcResultPayload, CreateTimeLogPayload,
  CncScheduleSettings, MachineLoadSummary, CncOperationBatch, EmployeeOption,
  BulkCreateOperationBatchPayload, AssignOperationBatchPayload,
} from './types';
import { extractErrorMessage as getErrMsg, CNC_MACHINE_TYPES } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const JOB_STATUSES = [
  'queued', 'engineering_review', 'programming', 'ready_for_setup',
  'running', 'in_process_qc', 'complete',
] as const;

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued', engineering_review: 'Eng Review', programming: 'Programming',
  ready_for_setup: 'Ready Setup', running: 'Running', in_process_qc: 'In-Process QC', complete: 'Complete',
};

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-700', engineering_review: 'bg-blue-100 text-blue-700',
  programming: 'bg-purple-100 text-purple-700', ready_for_setup: 'bg-yellow-100 text-yellow-700',
  running: 'bg-green-100 text-green-700', in_process_qc: 'bg-orange-100 text-orange-700',
  complete: 'bg-emerald-100 text-emerald-700',
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600',
};

const OP_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600', setup: 'bg-yellow-100 text-yellow-700',
  running: 'bg-green-100 text-green-700', qc: 'bg-orange-100 text-orange-700',
  complete: 'bg-emerald-100 text-emerald-700', hold: 'bg-red-100 text-red-700',
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  paused: 'Paused',
  hold: 'Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const BATCH_STATUS_COLORS: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  hold: 'bg-red-100 text-red-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const FORWARD_DESTINATIONS = ['Deburr', 'Inspection', 'Assembly', 'Stock', 'Shipping', 'Outside Process'];
const PHOTO_CATEGORIES = ['Workholding', 'Tool Holder', 'Part Orientation', 'Finished Example', 'QC Reference', 'Setup Shot'];

// ── Small UI Helpers ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function PriorityDot({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-gray-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${colors[priority] ?? 'bg-gray-400'}`} title={priority} />;
}

function BatchStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${BATCH_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {BATCH_STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ── Inline Editable Field ─────────────────────────────────────────────────────

interface InlineEditableFieldProps {
  opId: number;
  field: string;
  value: string | null;
  label: string;
  placeholder?: string;
  numeric?: boolean;
  editingOpField: { opId: number; field: string; value: string } | null;
  onStartEdit: (opId: number, field: string, value: string) => void;
  onChangeValue: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function InlineEditableField({
  opId, field, value, label, placeholder, numeric,
  editingOpField, onStartEdit, onChangeValue, onSave, onCancel,
}: InlineEditableFieldProps) {
  const isEditing = editingOpField?.opId === opId && editingOpField?.field === field;
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      {isEditing ? (
        <div className="flex gap-1 items-center">
          <Input
            autoFocus
            type={numeric ? 'number' : 'text'}
            value={editingOpField?.value ?? ''}
            onChange={e => onChangeValue(e.target.value)}
            className="h-6 text-xs flex-1"
            onKeyDown={e => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <Button size="sm" className="h-6 w-6 p-0" onClick={onSave}><Save className="w-3 h-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onCancel}><X className="w-3 h-3" /></Button>
        </div>
      ) : (
        <div
          className="text-sm text-gray-800 cursor-pointer hover:bg-gray-50 rounded px-1 min-h-[20px] group flex items-center gap-1"
          onClick={() => onStartEdit(opId, field, value ?? '')}
        >
          <span className={value ? '' : 'text-gray-400 italic text-xs'}>{value ?? placeholder ?? 'Click to edit'}</span>
          <Edit2 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 flex-shrink-0" />
        </div>
      )}
    </div>
  );
}

// ── Elapsed Time Helper ───────────────────────────────────────────────────────

function formatElapsed(start: string | null, end: string | null): string {
  if (!start) return '';
  const ms = new Date(end ?? Date.now()).getTime() - new Date(start).getTime();
  if (ms < 0) return '0m';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CNCDashboardPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filterMachine, setFilterMachine] = useState('');
  const [filterProgrammer, setFilterProgrammer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDueDate, setFilterDueDate] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // ── New job dialog ─────────────────────────────────────────────────────────
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJobForm, setNewJobForm] = useState({
    workOrder: '', partNumber: '', partName: '', revision: '',
    qty: '1', machine: '', programmerDisplayName: '', dueDate: '',
    estimatedHours: '', priority: 'medium', linkedTravelerId: '', customerPo: '', notes: '',
  });
  const [woSearchMode, setWoSearchMode] = useState(false);
  const [woSearchQuery, setWoSearchQuery] = useState('');

  // ── New operation dialog ───────────────────────────────────────────────────
  const [newOpOpen, setNewOpOpen] = useState(false);
  const [newOpForm, setNewOpForm] = useState({
    sequence: '', opName: '', opDescription: '', standardLaborMinutes: '', machine: '',
    estimatedSetupMinutes: '', estimatedCycleMinutes: '',
    ncProgramRef: '', fixture: '', workRefPoint: '', rawStockOrientation: '', datumNotes: '', warmupNotes: '',
  });

  // ── New tool dialog ────────────────────────────────────────────────────────
  const [newToolOpen, setNewToolOpen] = useState(false);
  const [newToolForm, setNewToolForm] = useState({
    toolNumber: '', holderPosition: '', toolName: '', diameter: '',
    offsetNotes: '', replacementNotes: '',
  });
  const [toolImageFile, setToolImageFile] = useState<File | null>(null);
  const [toolImageUploading, setToolImageUploading] = useState(false);

  // ── New program dialog ─────────────────────────────────────────────────────
  const [newProgramOpen, setNewProgramOpen] = useState(false);
  const [newProgramForm, setNewProgramForm] = useState({
    programName: '', programNumber: '', version: '', machine: '',
    estimatedCycleMinutes: '', proveOutRequired: false, notes: '',
  });

  // ── New QC checkpoint dialog ───────────────────────────────────────────────
  const [newCheckpointOpen, setNewCheckpointOpen] = useState(false);
  const [newCheckpointForm, setNewCheckpointForm] = useState({
    name: '', characteristic: '', nominal: '', tolerance: '',
    method: '', frequency: '', required: true,
    photoRequired: false, signatureRequired: false,
  });

  // ── Pause run dialog ───────────────────────────────────────────────────────
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseLogReason, setPauseLogReason] = useState('');

  // ── QC Hold dialog (for operation-level hold) ──────────────────────────────
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');

  // ── Complete job dialog ────────────────────────────────────────────────────
  const [completeJobOpen, setCompleteJobOpen] = useState(false);
  const [forwardDestination, setForwardDestination] = useState('');
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchOperationId, setBatchOperationId] = useState<number | null>(null);
  const [batchForm, setBatchForm] = useState({
    batchQty: '1',
    numberOfBatches: '1',
    machineId: '__none__',
    employeeId: '__none__',
    priority: 'medium',
    dueDate: '',
    notes: '',
    autoPrint: true,
  });
  const [assignBatch, setAssignBatch] = useState<CncOperationBatch | null>(null);
  const [assignForm, setAssignForm] = useState({ machineId: '__none__', employeeId: '__none__', notes: '' });
  const [barcodeBatch, setBarcodeBatch] = useState<CncOperationBatch | null>(null);

  // ── Tribal knowledge editing ───────────────────────────────────────────────
  const [editingTribal, setEditingTribal] = useState(false);
  const [tribalText, setTribalText] = useState('');

  // ── Operator notes ─────────────────────────────────────────────────────────
  const [operatorNotes, setOperatorNotes] = useState('');

  // ── QC result entry state per checkpoint ──────────────────────────────────
  const [qcResultEntry, setQcResultEntry] = useState<
    Record<number, { result: string; measuredValue: string; notes: string; photoFile: File | null }>
  >({});

  // ── Photo upload state ─────────────────────────────────────────────────────
  const [photoCategory, setPhotoCategory] = useState('Workholding');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // ── Left panel tab ─────────────────────────────────────────────────────────
  const [leftTab, setLeftTab] = useState<'queue' | 'machines'>('queue');

  // ── Schedule settings panel state ──────────────────────────────────────────
  const [schedPanelOpen, setSchedPanelOpen] = useState(false);
  const [schedForm, setSchedForm] = useState<{ scheduleType: string; daysPerWeek: string; hoursPerDay: string }>({ scheduleType: 'FOUR_TEN', daysPerWeek: '4', hoursPerDay: '10' });

  // ── Machine override expand state ───────────────────────────────────────────
  const [overrideMachineId, setOverrideMachineId] = useState<number | null>(null);
  const [overrideForm, setOverrideForm] = useState<{ daysPerWeek: string; hoursPerDay: string }>({ daysPerWeek: '4', hoursPerDay: '8' });

  // ── Machine CRUD dialog state ──────────────────────────────────────────────
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [machineDialogMachine, setMachineDialogMachine] = useState<CncMachine | null>(null);
  const [machineDeleteConfirm, setMachineDeleteConfirm] = useState<CncMachine | null>(null);
  const [machineForm, setMachineForm] = useState({ machineName: '', machineNumber: '', machineType: '', capability: '', active: true });
  const [machineTypeCustom, setMachineTypeCustom] = useState('');

  useEffect(() => {
    if (machineDialogOpen) {
      const cap = machineDialogMachine?.capabilities;
      const existingType = machineDialogMachine?.machineType ?? '';
      const isBuiltIn = existingType === '' || existingType === 'Mill' || existingType === 'Lathe' || existingType === 'Other';
      setMachineForm({
        machineName: machineDialogMachine?.machineName ?? '',
        machineNumber: machineDialogMachine?.machineNumber ?? '',
        machineType: isBuiltIn ? existingType : 'Other',
        capability: typeof cap === 'string' ? cap : '',
        active: machineDialogMachine?.active ?? true,
      });
      setMachineTypeCustom(isBuiltIn ? '' : existingType);
    }
  }, [machineDialogOpen, machineDialogMachine]);

  // ── Inline op field editing ────────────────────────────────────────────────
  const [editingOpField, setEditingOpField] = useState<{ opId: number; field: string; value: string } | null>(null);

  // ── Job status inline edit ─────────────────────────────────────────────────
  const [editingJobStatus, setEditingJobStatus] = useState(false);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: jobs = [], isLoading: jobsLoading } = useQuery<CncJob[]>({
    queryKey: ['/api/cnc/jobs'],
  });

  const { data: operations = [] } = useQuery<CncJobOperation[]>({
    queryKey: ['/api/cnc/jobs', selectedJobId, 'operations'],
    enabled: !!selectedJobId,
  });

  const { data: programs = [] } = useQuery<CncProgram[]>({
    queryKey: ['/api/cnc/operations', selectedOpId, 'programs'],
    enabled: !!selectedOpId,
  });

  const { data: tools = [] } = useQuery<CncToolList[]>({
    queryKey: ['/api/cnc/operations', selectedOpId, 'tools'],
    enabled: !!selectedOpId,
  });

  const { data: photos = [] } = useQuery<CncSetupPhoto[]>({
    queryKey: ['/api/cnc/operations', selectedOpId, 'photos'],
    enabled: !!selectedOpId,
  });

  const { data: checkpoints = [] } = useQuery<CncQcCheckpoint[]>({
    queryKey: ['/api/cnc/operations', selectedOpId, 'qc-checkpoints'],
    enabled: !!selectedOpId,
  });

  const { data: qcResults = [] } = useQuery<CncQcResult[]>({
    queryKey: ['/api/cnc/operations', selectedOpId, 'qc-results'],
    enabled: !!selectedOpId,
  });

  const { data: timeLogs = [] } = useQuery<CncTimeLog[]>({
    queryKey: ['/api/cnc/operations', selectedOpId, 'time-logs'],
    enabled: !!selectedOpId,
  });

  const { data: machines = [] } = useQuery<CncMachine[]>({
    queryKey: ['/api/cnc/machines'],
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
  });

  const { data: operationBatches = [] } = useQuery<CncOperationBatch[]>({
    queryKey: ['/api/cnc/operation-batches'],
  });

  const activeMachines = useMemo(() => machines.filter(m => m.active), [machines]);
  const activeEmployees = useMemo(
    () => employees.filter(e => e.isActive !== false && e.employmentStatus !== 'TERMINATED'),
    [employees],
  );

  const { data: scheduleSettings } = useQuery<CncScheduleSettings>({
    queryKey: ['/api/cnc/schedule-settings'],
    enabled: leftTab === 'machines',
  });

  const { data: machineLoad = [], isLoading: machineLoadLoading } = useQuery<MachineLoadSummary[]>({
    queryKey: ['/api/cnc/machine-load'],
    enabled: leftTab === 'machines',
  });

  // ── Sync schedForm when scheduleSettings loads ─────────────────────────────
  useEffect(() => {
    if (scheduleSettings) {
      setSchedForm({
        scheduleType: scheduleSettings.scheduleType,
        daysPerWeek: String(scheduleSettings.daysPerWeek),
        hoursPerDay: String(scheduleSettings.hoursPerDay),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleSettings?.scheduleType, scheduleSettings?.daysPerWeek, scheduleSettings?.hoursPerDay]);

  // ── selectedJob must be derived BEFORE travelerInfo query to avoid TDZ ────
  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedJobId) ?? null, [jobs, selectedJobId]);

  const { data: travelerInfo } = useQuery<TravelerInfo | null>({
    queryKey: ['/api/cnc/jobs', selectedJobId, 'traveler-info'],
    enabled: !!selectedJobId && !!selectedJob?.linkedTravelerId,
  });

  const { data: woSearchResults = [] } = useQuery<WorkOrderSearchResult[]>({
    queryKey: ['/api/cnc/search-work-orders', woSearchQuery],
    enabled: woSearchQuery.length >= 1,
    queryFn: async () => {
      const res = await fetch(`/api/cnc/search-work-orders?q=${encodeURIComponent(woSearchQuery)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json() as Promise<WorkOrderSearchResult[]>;
    },
  });

  // ── Derived values ─────────────────────────────────────────────────────────

  const selectedOp = useMemo(() => operations.find(o => o.id === selectedOpId) ?? null, [operations, selectedOpId]);
  const executionOp = selectedOp ?? operations.find(o => o.status !== 'complete') ?? null;
  const stepQty = travelerInfo?.quantity ?? selectedJob?.qty ?? 0;
  const woQty = selectedJob?.qty ?? travelerInfo?.quantity ?? 0;
  const selectedJobBatches = useMemo(() => {
    if (!selectedJob) return [];
    return operationBatches.filter(b =>
      (!!selectedJob.linkedTravelerId && b.travelerId === selectedJob.linkedTravelerId)
      || b.workOrderNumber === selectedJob.workOrder
    );
  }, [operationBatches, selectedJob]);
  const selectedStepBatches = useMemo(() => {
    if (!selectedJob?.linkedTravelerStepId) return selectedJobBatches;
    return selectedJobBatches.filter(b => b.travelerStepId === selectedJob.linkedTravelerStepId);
  }, [selectedJob?.linkedTravelerStepId, selectedJobBatches]);
  const activeStepBatches = useMemo(
    () => selectedStepBatches.filter(b => b.status !== 'cancelled'),
    [selectedStepBatches],
  );
  const selectedOpBatches = useMemo(() => {
    if (!selectedOpId) return [];
    return selectedStepBatches.filter(b => b.operationId === selectedOpId);
  }, [selectedOpId, selectedStepBatches]);
  const alreadyBatchedQty = activeStepBatches.reduce((sum, b) => sum + b.batchQty, 0);
  const availableToBatchQty = Math.max(stepQty - alreadyBatchedQty, 0);
  const selectedStepRollups = useMemo(() => {
    const serverRollup = activeStepBatches.find(b => b.totalStepQty !== undefined);
    const completedQty = serverRollup?.completedQty ?? activeStepBatches.reduce((sum, b) => sum + b.qtyCompleted, 0);
    const scrappedQty = serverRollup?.scrappedQty ?? activeStepBatches.reduce((sum, b) => sum + b.qtyScrapped, 0);
    const totalStepQty = serverRollup?.totalStepQty ?? stepQty;
    const batchedQty = serverRollup?.batchedQty ?? alreadyBatchedQty;
    return {
      totalStepQty,
      batchedQty,
      availableToBatchQty: serverRollup?.availableToBatchQty ?? Math.max(totalStepQty - batchedQty, 0),
      inProgressQty: serverRollup?.inProgressQty ?? activeStepBatches
        .filter(b => b.status === 'in_progress' || b.status === 'paused')
        .reduce((sum, b) => sum + Math.max(b.batchQty - b.qtyCompleted - b.qtyScrapped, 0), 0),
      completedQty,
      scrappedQty,
      remainingQty: serverRollup?.remainingQty ?? Math.max(totalStepQty - completedQty - scrappedQty, 0),
    };
  }, [activeStepBatches, alreadyBatchedQty, stepQty]);
  const batchStatusRollups = useMemo(() => selectedJobBatches.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {}), [selectedJobBatches]);

  const filteredJobs = useMemo(() => jobs.filter(j => {
    if (filterMachine && !j.machine?.toLowerCase().includes(filterMachine.toLowerCase())) return false;
    if (filterProgrammer && !j.programmerDisplayName?.toLowerCase().includes(filterProgrammer.toLowerCase())) return false;
    if (filterStatus && j.status !== filterStatus) return false;
    if (filterDueDate && j.dueDate && j.dueDate > filterDueDate) return false;
    if (filterSearch) {
      const s = filterSearch.toLowerCase();
      if (!j.workOrder.toLowerCase().includes(s) && !j.partNumber.toLowerCase().includes(s) && !j.partName.toLowerCase().includes(s)) return false;
    }
    return true;
  }), [jobs, filterMachine, filterProgrammer, filterStatus, filterDueDate, filterSearch]);


  // ── Typed mutation helpers ─────────────────────────────────────────────────

  function showErr(err: unknown) {
    toast({ title: 'Error', description: getErrMsg(err), variant: 'destructive' });
  }

  function invalidateJobs() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/jobs'] }); }
  function invalidateOps() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/jobs', selectedJobId, 'operations'] }); }
  function invalidateTools() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operations', selectedOpId, 'tools'] }); }
  function invalidatePrograms() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operations', selectedOpId, 'programs'] }); }
  function invalidatePhotos() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operations', selectedOpId, 'photos'] }); }
  function invalidateCheckpoints() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operations', selectedOpId, 'qc-checkpoints'] }); }
  function invalidateQcResults() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operations', selectedOpId, 'qc-results'] }); }
  function invalidateBatches() { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operation-batches'] }); }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveScheduleSettings = useMutation<CncScheduleSettings, unknown, Record<string, unknown>>({
    mutationFn: (data) => apiRequest('/api/cnc/schedule-settings', { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/schedule-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machine-load'] });
      toast({ title: 'Schedule settings saved' });
    },
    onError: showErr,
  });

  const saveMachineOverride = useMutation<CncMachine, unknown, { id: number; data: Record<string, unknown> }>({
    mutationFn: ({ id, data }) => apiRequest(`/api/cnc/machines/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machines'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machine-load'] });
      setOverrideMachineId(null);
      toast({ title: 'Machine schedule updated' });
    },
    onError: showErr,
  });

  const saveMachine = useMutation<CncMachine, unknown, { id?: number; data: Record<string, unknown> }>({
    mutationFn: ({ id, data }) => id
      ? apiRequest(`/api/cnc/machines/${id}`, { method: 'PATCH', body: data })
      : apiRequest('/api/cnc/machines', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machines'] });
      setMachineDialogOpen(false);
      toast({ title: machineDialogMachine ? 'Machine updated' : 'Machine added' });
    },
    onError: showErr,
  });

  const deleteMachine = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/machines/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cnc/machines'] });
      setMachineDeleteConfirm(null);
      toast({ title: 'Machine deleted' });
    },
    onError: showErr,
  });

  const createJob = useMutation<CncJob, unknown, CreateJobPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/jobs', { method: 'POST', body: payload }),
    onSuccess: () => {
      invalidateJobs();
      setNewJobOpen(false);
      setNewJobForm({ workOrder: '', partNumber: '', partName: '', revision: '', qty: '1', machine: '', programmerDisplayName: '', dueDate: '', estimatedHours: '', priority: 'medium', linkedTravelerId: '', notes: '' });
      toast({ title: 'Job created' });
    },
    onError: showErr,
  });

  const updateJob = useMutation<CncJob, unknown, { id: number; data: UpdateJobPayload }>({
    mutationFn: ({ id, data }) => apiRequest(`/api/cnc/jobs/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => { invalidateJobs(); setEditingJobStatus(false); },
    onError: showErr,
  });

  const deleteJob = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidateJobs(); setSelectedJobId(null); setSelectedOpId(null); toast({ title: 'Job deleted' }); },
    onError: showErr,
  });

  const createOperation = useMutation<CncJobOperation, unknown, CreateOperationPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/operations', { method: 'POST', body: payload }),
    onSuccess: () => {
      invalidateOps();
      setNewOpOpen(false);
      setNewOpForm({ sequence: '', opName: '', opDescription: '', standardLaborMinutes: '', machine: '', estimatedSetupMinutes: '', estimatedCycleMinutes: '', ncProgramRef: '', fixture: '', workRefPoint: '', rawStockOrientation: '', datumNotes: '', warmupNotes: '' });
      toast({ title: 'Operation added' });
    },
    onError: showErr,
  });

  const updateOperation = useMutation<CncJobOperation, unknown, { id: number; data: UpdateOperationPayload }>({
    mutationFn: ({ id, data }) => apiRequest(`/api/cnc/operations/${id}`, { method: 'PATCH', body: data }),
    onSuccess: () => { invalidateOps(); invalidateJobs(); setEditingOpField(null); },
    onError: (err: unknown) => {
      const msg = (err as { body?: { error?: string } })?.body?.error ?? getErrMsg(err);
      toast({ title: 'Cannot update operation', description: msg, variant: 'destructive' });
    },
  });

  const deleteOperation = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/operations/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidateOps(); if (selectedOpId) setSelectedOpId(null); toast({ title: 'Operation deleted' }); },
    onError: showErr,
  });

  const claimOperation = useMutation<CncJobOperation, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/operations/${id}/claim`, { method: 'POST' }),
    onSuccess: () => { invalidateOps(); toast({ title: 'Operation claimed' }); },
    onError: (err: unknown) => {
      const msg = (err as { body?: { error?: string } })?.body?.error ?? getErrMsg(err);
      toast({ title: 'Cannot claim', description: msg, variant: 'destructive' });
    },
  });

  const unclaimOperation = useMutation<CncJobOperation, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/operations/${id}/unclaim`, { method: 'POST' }),
    onSuccess: () => { invalidateOps(); toast({ title: 'Operation unclaimed' }); },
    onError: showErr,
  });

  const createTool = useMutation<CncToolList, unknown, CreateToolPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/tools', { method: 'POST', body: payload }),
    onSuccess: () => {
      invalidateTools();
      setNewToolOpen(false);
      setNewToolForm({ toolNumber: '', holderPosition: '', toolName: '', diameter: '', offsetNotes: '', replacementNotes: '' });
      setToolImageFile(null);
      toast({ title: 'Tool added' });
    },
    onError: showErr,
  });

  const deleteTool = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/tools/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateTools(),
    onError: showErr,
  });

  const createProgram = useMutation<CncProgram, unknown, CreateProgramPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/programs', { method: 'POST', body: payload }),
    onSuccess: () => {
      invalidatePrograms();
      setNewProgramOpen(false);
      setNewProgramForm({ programName: '', programNumber: '', version: '', machine: '', estimatedCycleMinutes: '', proveOutRequired: false, notes: '' });
      toast({ title: 'Program added' });
    },
    onError: showErr,
  });

  const deleteProgram = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/programs/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidatePrograms(),
    onError: showErr,
  });

  const createCheckpoint = useMutation<CncQcCheckpoint, unknown, CreateCheckpointPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/qc-checkpoints', { method: 'POST', body: payload }),
    onSuccess: () => {
      invalidateCheckpoints();
      setNewCheckpointOpen(false);
      setNewCheckpointForm({ name: '', characteristic: '', nominal: '', tolerance: '', method: '', frequency: '', required: true, photoRequired: false, signatureRequired: false });
      toast({ title: 'Checkpoint added' });
    },
    onError: showErr,
  });

  const deleteCheckpoint = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/qc-checkpoints/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateCheckpoints(),
    onError: showErr,
  });

  const submitQcResult = useMutation<CncQcResult, unknown, CreateQcResultPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/qc-results', { method: 'POST', body: payload }),
    onSuccess: (_, vars) => {
      invalidateQcResults();
      setQcResultEntry(prev => { const n = { ...prev }; delete n[vars.checkpointId]; return n; });
      toast({ title: 'QC result recorded' });
    },
    onError: showErr,
  });

  const deletePhoto = useMutation<void, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/photos/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidatePhotos(),
    onError: showErr,
  });

  const approveProgram = useMutation<CncProgram, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/programs/${id}/approve`, { method: 'POST' }),
    onSuccess: () => { invalidatePrograms(); toast({ title: 'Program approved' }); },
    onError: showErr,
  });

  const createTimeLog = useMutation<CncTimeLog, unknown, CreateTimeLogPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/time-log', { method: 'POST', body: payload }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/cnc/operations', selectedOpId, 'time-logs'] }); },
    onError: showErr,
  });

  // ── Action Handlers ────────────────────────────────────────────────────────

  const createBatches = useMutation<{ count: number; batches: CncOperationBatch[] }, unknown, BulkCreateOperationBatchPayload>({
    mutationFn: (payload) => apiRequest('/api/cnc/operation-batches/bulk', { method: 'POST', body: payload }),
    onSuccess: (result) => {
      invalidateBatches();
      setBatchDialogOpen(false);
      toast({ title: `${result.count} batch${result.count === 1 ? '' : 'es'} created` });
      if (batchForm.autoPrint && result.batches[0]) setBarcodeBatch(result.batches[0]);
    },
    onError: showErr,
  });

  const assignOperationBatch = useMutation<CncOperationBatch, unknown, { id: number; data: AssignOperationBatchPayload }>({
    mutationFn: ({ id, data }) => apiRequest(`/api/cnc/operation-batches/${id}/assign`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      invalidateBatches();
      setAssignBatch(null);
      toast({ title: 'Batch assignment updated' });
    },
    onError: showErr,
  });

  const holdOperationBatch = useMutation<CncOperationBatch, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/operation-batches/${id}/hold`, { method: 'PATCH', body: {} }),
    onSuccess: () => { invalidateBatches(); toast({ title: 'Batch placed on hold' }); },
    onError: showErr,
  });

  const cancelOperationBatch = useMutation<CncOperationBatch, unknown, number>({
    mutationFn: (id) => apiRequest(`/api/cnc/operation-batches/${id}/cancel`, { method: 'PATCH', body: {} }),
    onSuccess: () => { invalidateBatches(); toast({ title: 'Batch cancelled' }); },
    onError: showErr,
  });

  function handleSelectJob(jobId: number) {
    setSelectedJobId(jobId);
    setSelectedOpId(null);
    setEditingTribal(false);
    setEditingJobStatus(false);
  }

  function handleSelectOp(op: CncJobOperation) {
    setSelectedOpId(op.id);
    setTribalText(op.tribalKnowledge ?? '');
    setOperatorNotes(op.operatorNotes ?? '');
    setEditingTribal(false);
  }

  function handleCreateJob() {
    const payload: CreateJobPayload = {
      workOrder: newJobForm.workOrder,
      partNumber: newJobForm.partNumber,
      partName: newJobForm.partName,
      revision: newJobForm.revision || null,
      qty: parseInt(newJobForm.qty) || 1,
      machine: newJobForm.machine || null,
      programmerDisplayName: newJobForm.programmerDisplayName || null,
      dueDate: newJobForm.dueDate || null,
      estimatedHours: newJobForm.estimatedHours ? parseFloat(newJobForm.estimatedHours) : null,
      priority: newJobForm.priority,
      linkedTravelerId: newJobForm.linkedTravelerId || null,
      customerPo: newJobForm.customerPo || null,
      notes: newJobForm.notes || null,
    };
    createJob.mutate(payload);
  }

  function handleCreateOperation() {
    if (!selectedJobId) return;
    const payload: CreateOperationPayload = {
      jobId: selectedJobId,
      sequence: parseInt(newOpForm.sequence) || 10,
      opName: newOpForm.opName,
      opDescription: newOpForm.opDescription || null,
      standardLaborMinutes: newOpForm.standardLaborMinutes ? parseInt(newOpForm.standardLaborMinutes) : null,
      machine: newOpForm.machine || null,
      estimatedSetupMinutes: newOpForm.estimatedSetupMinutes ? parseFloat(newOpForm.estimatedSetupMinutes) : null,
      estimatedCycleMinutes: newOpForm.estimatedCycleMinutes ? parseFloat(newOpForm.estimatedCycleMinutes) : null,
      ncProgramRef: newOpForm.ncProgramRef || null,
      fixture: newOpForm.fixture || null,
      workRefPoint: newOpForm.workRefPoint || null,
      rawStockOrientation: newOpForm.rawStockOrientation || null,
      datumNotes: newOpForm.datumNotes || null,
      warmupNotes: newOpForm.warmupNotes || null,
    };
    createOperation.mutate(payload);
  }

  function openBatchDialog(op?: CncJobOperation | null) {
    if (!selectedJob || !travelerInfo?.productionWorkOrderId || !selectedJob.linkedTravelerStepId) {
      toast({
        title: 'Traveler step required',
        description: 'Link the CNC job to a traveler step before creating operation batches.',
        variant: 'destructive',
      });
      return;
    }
    const targetOp = op ?? selectedOp ?? executionOp;
    const defaultMachineName = targetOp?.machine ?? selectedJob.machine ?? '';
    const defaultMachine = activeMachines.find(m => m.machineName === defaultMachineName);
    setBatchOperationId(targetOp?.id ?? null);
    setBatchForm({
      batchQty: availableToBatchQty > 0 ? String(availableToBatchQty) : '1',
      numberOfBatches: '1',
      machineId: defaultMachine ? String(defaultMachine.id) : '__none__',
      employeeId: '__none__',
      priority: selectedJob.priority,
      dueDate: selectedJob.dueDate ?? '',
      notes: '',
      autoPrint: true,
    });
    setBatchDialogOpen(true);
  }

  function handleCreateBatches() {
    if (!selectedJob || !travelerInfo?.productionWorkOrderId || !selectedJob.linkedTravelerStepId) return;
    const batchQty = parseInt(batchForm.batchQty, 10);
    const count = parseInt(batchForm.numberOfBatches, 10);
    if (!Number.isFinite(batchQty) || batchQty <= 0 || !Number.isFinite(count) || count <= 0) {
      toast({ title: 'Invalid batch quantity', description: 'Batch quantity and number of batches must be positive.', variant: 'destructive' });
      return;
    }
    if (batchQty * count > availableToBatchQty) {
      toast({ title: 'Quantity exceeds available step quantity', description: `${availableToBatchQty} part(s) remain available to batch.`, variant: 'destructive' });
      return;
    }
    const machine = batchForm.machineId === '__none__' ? null : activeMachines.find(m => String(m.id) === batchForm.machineId) ?? null;
    const employee = batchForm.employeeId === '__none__' ? null : activeEmployees.find(e => String(e.id) === batchForm.employeeId) ?? null;
    createBatches.mutate({
      workOrderId: travelerInfo.productionWorkOrderId,
      travelerStepId: selectedJob.linkedTravelerStepId,
      operationId: batchOperationId,
      batchQtys: Array.from({ length: count }, () => batchQty),
      assignedMachineId: machine?.id ?? null,
      assignedMachineName: machine?.machineName ?? null,
      assignedEmployeeId: employee?.id ?? null,
      assignedEmployeeDisplayName: employee?.name ?? null,
      priority: batchForm.priority,
      dueDate: batchForm.dueDate || null,
      notes: batchForm.notes || null,
    });
  }

  function openAssignBatchDialog(batch: CncOperationBatch) {
    setAssignBatch(batch);
    setAssignForm({
      machineId: batch.assignedMachineId ? String(batch.assignedMachineId) : '__none__',
      employeeId: batch.assignedEmployeeId ? String(batch.assignedEmployeeId) : '__none__',
      notes: batch.notes ?? '',
    });
  }

  function handleAssignBatch() {
    if (!assignBatch) return;
    const machine = assignForm.machineId === '__none__' ? null : activeMachines.find(m => String(m.id) === assignForm.machineId) ?? null;
    const employee = assignForm.employeeId === '__none__' ? null : activeEmployees.find(e => String(e.id) === assignForm.employeeId) ?? null;
    assignOperationBatch.mutate({
      id: assignBatch.id,
      data: {
        assignedMachineId: machine?.id ?? null,
        assignedMachineName: machine?.machineName ?? null,
        assignedEmployeeId: employee?.id ?? null,
        assignedEmployeeDisplayName: employee?.name ?? null,
        notes: assignForm.notes || null,
      },
    });
  }

  function saveInlineOpField(opId: number, field: keyof UpdateOperationPayload, rawValue: string) {
    const numericFields: ReadonlyArray<string> = ['estimatedSetupMinutes', 'estimatedCycleMinutes', 'standardLaborMinutes'];
    const value = numericFields.includes(field)
      ? (rawValue ? parseFloat(rawValue) : null)
      : (rawValue || null);
    updateOperation.mutate({ id: opId, data: { [field]: value } as UpdateOperationPayload });
  }

  function handleCompleteOperation(opId: number) {
    const op = operations.find(o => o.id === opId);
    if (programs.some(p => p.proveOutRequired) && !op?.proveoutCompleted) {
      toast({ title: 'Prove-Out Required', description: 'Prove-out must be completed before finishing this operation.', variant: 'destructive' });
      return;
    }
    const requiredCps = checkpoints.filter(cp => cp.required && cp.operationId === opId);
    const completedIds = new Set(qcResults.filter(r => r.operationId === opId).map(r => r.checkpointId));
    const missing = requiredCps.filter(cp => !completedIds.has(cp.id));
    if (missing.length > 0) {
      toast({ title: 'QC Incomplete', description: `${missing.length} required checkpoint(s) must be recorded.`, variant: 'destructive' });
      return;
    }
    updateOperation.mutate({ id: opId, data: { status: 'complete', completedAt: new Date().toISOString() } });
    // Advance to next pending operation after state settles
    setTimeout(() => {
      const sorted = [...operations].sort((a, b) => a.sequence - b.sequence);
      const idx = sorted.findIndex(o => o.id === opId);
      const next = sorted.slice(idx + 1).find(o => o.status !== 'complete');
      if (next) {
        setSelectedOpId(next.id);
        setTribalText(next.tribalKnowledge ?? '');
        setOperatorNotes(next.operatorNotes ?? '');
        toast({ title: `Advanced to Op ${next.sequence}: ${next.opName}` });
      }
    }, 600);
  }

  function handleSaveTribal(opId: number) {
    updateOperation.mutate({ id: opId, data: { tribalKnowledge: tribalText } });
    setEditingTribal(false);
  }

  function handleSaveOperatorNotes(opId: number) {
    updateOperation.mutate({ id: opId, data: { operatorNotes } });
    toast({ title: 'Notes saved' });
  }

  function handleCompleteJob() {
    if (!selectedJobId) return;
    updateJob.mutate({ id: selectedJobId, data: { status: 'complete', forwardDestination, completedAt: new Date().toISOString() } });
    setCompleteJobOpen(false);
    toast({ title: 'Job marked complete', description: `→ ${forwardDestination}` });
  }

  async function handlePhotoUpload() {
    if (!selectedOpId || !photoFile) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', photoFile);
      const uploadRes = await apiRequest('/api/object-storage/upload', { method: 'POST', body: formData }) as { url: string; key: string };
      const photoPayload: CreatePhotoPayload = {
        operationId: selectedOpId,
        category: photoCategory,
        url: uploadRes.url,
        storageKey: uploadRes.key,
        caption: photoCaption || null,
      };
      await apiRequest('/api/cnc/photos', { method: 'POST', body: photoPayload });
      invalidatePhotos();
      setPhotoFile(null);
      setPhotoCaption('');
      toast({ title: 'Photo uploaded' });
    } catch (err: unknown) {
      toast({ title: 'Upload failed', description: getErrMsg(err), variant: 'destructive' });
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleAddTool() {
    if (!selectedOpId || !newToolForm.toolNumber || !newToolForm.toolName) return;
    setToolImageUploading(true);
    try {
      let imageUrl: string | null = null;
      if (toolImageFile) {
        const formData = new FormData();
        formData.append('file', toolImageFile);
        const uploadRes = await apiRequest('/api/object-storage/upload', { method: 'POST', body: formData }) as { url: string; key: string };
        imageUrl = uploadRes.url;
      }
      const payload: CreateToolPayload = {
        operationId: selectedOpId,
        toolNumber: newToolForm.toolNumber,
        holderPosition: newToolForm.holderPosition || null,
        toolName: newToolForm.toolName,
        diameter: newToolForm.diameter ? parseFloat(newToolForm.diameter) : null,
        offsetNotes: newToolForm.offsetNotes || null,
        replacementNotes: newToolForm.replacementNotes || null,
        imageUrl,
      };
      createTool.mutate(payload);
    } catch (err: unknown) {
      toast({ title: 'Tool image upload failed', description: getErrMsg(err), variant: 'destructive' });
    } finally {
      setToolImageUploading(false);
    }
  }

  async function handleQcResultWithPhoto(cp: CncQcCheckpoint, opId: number, result: 'pass' | 'fail' | 'na') {
    const checkpointId = cp.id;
    const entry = qcResultEntry[checkpointId] ?? { result: '', measuredValue: '', notes: '', photoFile: null };
    if (cp.photoRequired && !entry.photoFile) {
      toast({ title: 'Photo required', description: 'This checkpoint requires a photo before recording.', variant: 'destructive' });
      return;
    }
    if (cp.signatureRequired && !executionOp?.claimedByDisplayName) {
      toast({ title: 'Signature required', description: 'Claim the operation (sign in) before recording this checkpoint.', variant: 'destructive' });
      return;
    }
    let photoUrl: string | null = null;
    if (entry.photoFile) {
      const formData = new FormData();
      formData.append('file', entry.photoFile);
      try {
        const uploadRes = await apiRequest('/api/object-storage/upload', { method: 'POST', body: formData }) as { url: string };
        photoUrl = uploadRes.url;
      } catch (err: unknown) {
        toast({ title: 'Photo upload failed', description: getErrMsg(err), variant: 'destructive' });
        return;
      }
    }
    const payload: CreateQcResultPayload = {
      checkpointId, operationId: opId, result,
      measuredValue: entry.measuredValue || null,
      notes: entry.notes || null,
      photoUrl,
    };
    submitQcResult.mutate(payload);
  }

  function getQcResultForCheckpoint(checkpointId: number): CncQcResult | undefined {
    return qcResults.find(r => r.checkpointId === checkpointId);
  }

  // Inline op field editing helpers
  const startEditOpField = (opId: number, field: string, value: string) =>
    setEditingOpField({ opId, field, value });
  const changeEditOpFieldValue = (value: string) =>
    setEditingOpField(prev => prev ? { ...prev, value } : null);
  const saveEditOpField = () => {
    if (!editingOpField) return;
    saveInlineOpField(editingOpField.opId, editingOpField.field as keyof UpdateOperationPayload, editingOpField.value);
  };
  const cancelEditOpField = () => setEditingOpField(null);

  // Shared InlineEditableField props builder
  function fieldProps(opId: number, field: string, value: string | null, label: string, opts?: { placeholder?: string; numeric?: boolean }) {
    return {
      opId, field, value, label,
      placeholder: opts?.placeholder,
      numeric: opts?.numeric,
      editingOpField,
      onStartEdit: startEditOpField,
      onChangeValue: changeEditOpFieldValue,
      onSave: saveEditOpField,
      onCancel: cancelEditOpField,
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 overflow-hidden">

      {/* ── LEFT PANEL: Job Queue / Machines ──────────────────────────────── */}
      <div className="w-[520px] flex-shrink-0 flex flex-col border-r bg-white">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${leftTab === 'queue' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                onClick={() => setLeftTab('queue')}
              >
                <Settings className="w-3 h-3 inline mr-1" />Queue ({filteredJobs.length})
              </button>
              <button
                className={`text-xs px-2.5 py-1 rounded font-semibold transition-colors ${leftTab === 'machines' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                onClick={() => setLeftTab('machines')}
              >
                Machines ({machines.length})
              </button>
              <Link href="/cnc-part-routings">
                <button className="text-xs px-2.5 py-1 rounded font-semibold transition-colors text-gray-500 hover:bg-gray-100 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />Part Routings
                </button>
              </Link>
            </div>
            {leftTab === 'queue' && (
              <Button size="sm" className="h-7 text-xs" onClick={() => setNewJobOpen(true)}>
                <Plus className="w-3 h-3 mr-1" /> New Job
              </Button>
            )}
          </div>
          {leftTab === 'queue' && (
            <div className="grid grid-cols-2 gap-1.5">
              <Input placeholder="Search WO/Part..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className="h-7 text-xs col-span-2" />
              <Select value={filterMachine || '__all__'} onValueChange={v => setFilterMachine(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All machines" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All machines</SelectItem>
                  {machines.map(m => <SelectItem key={m.id} value={m.machineName}>{m.machineName}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="Programmer..." value={filterProgrammer} onChange={e => setFilterProgrammer(e.target.value)} className="h-7 text-xs" />
              <Select value={filterStatus || '__all__'} onValueChange={v => setFilterStatus(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All statuses</SelectItem>
                  {JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={filterDueDate} onChange={e => setFilterDueDate(e.target.value)} className="h-7 text-xs" title="Due before" />
            </div>
          )}
        </div>

        {/* ── Machines Tab ──────────────────────────────────────────────────── */}
        {leftTab === 'machines' && (
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">

              {/* ── CNC Capacity Schedule panel ─────────────────────────────── */}
              <div className="border rounded bg-white">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setSchedPanelOpen(o => !o)}
                >
                  <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-blue-500" />CNC Capacity Schedule</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${schedPanelOpen ? 'rotate-180' : ''}`} />
                </button>
                {schedPanelOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t pt-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['FOUR_TEN', 'FIVE_EIGHT', 'CUSTOM'] as const).map(type => {
                        const label = type === 'FOUR_TEN' ? '4×10 hrs' : type === 'FIVE_EIGHT' ? '5×8 hrs' : 'Custom';
                        return (
                          <button
                            key={type}
                            className={`text-[10px] py-1.5 rounded border font-medium transition-colors ${schedForm.scheduleType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
                            onClick={() => {
                              const defaults: Record<string, { d: string; h: string }> = { FOUR_TEN: { d: '4', h: '10' }, FIVE_EIGHT: { d: '5', h: '8' }, CUSTOM: { d: schedForm.daysPerWeek, h: schedForm.hoursPerDay } };
                              const def = defaults[type];
                              setSchedForm({ scheduleType: type, daysPerWeek: def.d, hoursPerDay: def.h });
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {schedForm.scheduleType === 'CUSTOM' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <Label className="text-[10px] text-gray-500 mb-0.5 block">Days/Week</Label>
                          <Input type="number" min="1" max="7" step="0.5" value={schedForm.daysPerWeek} onChange={e => setSchedForm(f => ({ ...f, daysPerWeek: e.target.value }))} className="h-7 text-xs" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-gray-500 mb-0.5 block">Hrs/Day</Label>
                          <Input type="number" min="1" max="24" step="0.5" value={schedForm.hoursPerDay} onChange={e => setSchedForm(f => ({ ...f, hoursPerDay: e.target.value }))} className="h-7 text-xs" />
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-gray-500">
                        Weekly capacity: <span className="font-semibold text-gray-800">{(parseFloat(schedForm.daysPerWeek) * parseFloat(schedForm.hoursPerDay)).toFixed(0)} hrs</span>
                      </p>
                      <Button size="sm" className="h-6 text-[10px] px-3" disabled={saveScheduleSettings.isPending} onClick={() => {
                        const days = parseFloat(schedForm.daysPerWeek);
                        const hours = parseFloat(schedForm.hoursPerDay);
                        if (isNaN(days) || days <= 0 || isNaN(hours) || hours <= 0) {
                          toast({ title: 'Invalid input', description: 'Days and hours must be positive numbers.', variant: 'destructive' });
                          return;
                        }
                        const nameMap: Record<string, string> = { FOUR_TEN: '4 Days x 10 Hours', FIVE_EIGHT: '5 Days x 8 Hours', CUSTOM: `${days}×${hours} (Custom)` };
                        saveScheduleSettings.mutate({
                          scheduleType: schedForm.scheduleType,
                          daysPerWeek: days,
                          hoursPerDay: hours,
                          weeklyCapacityHours: days * hours,
                          name: nameMap[schedForm.scheduleType] ?? 'Custom',
                          isDefault: true,
                        });
                      }}>
                        <Save className="w-3 h-3 mr-1" />Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Machine Load Board ──────────────────────────────────────── */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-600">Machine Load Board</p>
                <div className="grid text-[10px] font-semibold text-gray-400 px-2 py-1" style={{ gridTemplateColumns: '1fr 50px 52px 52px 52px 64px 56px' }}>
                  <span>Machine</span>
                  <span className="text-center">Axis</span>
                  <span className="text-center">Capacity</span>
                  <span className="text-center">Sched.</span>
                  <span className="text-center">Remain.</span>
                  <span className="text-center">Utilization</span>
                  <span className="text-center">Status</span>
                </div>
                {machineLoadLoading ? (
                  <div className="text-center text-xs text-gray-400 py-4">Loading...</div>
                ) : machineLoad.length === 0 ? (
                  <div className="text-center text-xs text-gray-400 py-4">No active machines</div>
                ) : machineLoad.map(m => {
                  const utilPct = Math.min(m.utilizationPct, 100);
                  const barColor = m.overloaded ? 'bg-red-500' : m.utilizationPct > 75 ? 'bg-amber-400' : 'bg-green-400';
                  const isExpanded = overrideMachineId === m.machineId;
                  const axisLabel = m.axisCapabilities && m.axisCapabilities.length > 0 ? m.axisCapabilities.join(', ') : '—';
                  return (
                    <div key={m.machineId} className={`bg-white border rounded text-xs ${m.overloaded ? 'border-red-200' : ''}`}>
                      <div className="grid items-center px-2 py-1.5" style={{ gridTemplateColumns: '1fr 50px 52px 52px 52px 64px 56px' }}>
                        <div className="min-w-0 pr-1">
                          <p className="font-medium text-gray-800 truncate">{m.machineName}</p>
                          {m.machineType && <p className="text-[10px] text-gray-400">{m.machineType}</p>}
                        </div>
                        <span className="text-center text-[10px] text-gray-500 truncate">{axisLabel}</span>
                        <span className="text-center text-gray-600">{m.weeklyCapacityHours.toFixed(0)}h</span>
                        <span className="text-center text-gray-600">{m.scheduledHours.toFixed(1)}h</span>
                        <span className={`text-center font-medium ${m.remainingHours < 0 ? 'text-red-600' : 'text-gray-700'}`}>{m.remainingHours.toFixed(1)}h</span>
                        <div className="px-1">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${utilPct}%` }} />
                          </div>
                          <p className={`text-[10px] text-center mt-0.5 font-medium ${m.overloaded ? 'text-red-600' : 'text-gray-500'}`}>{m.utilizationPct}%</p>
                        </div>
                        <div className="text-center">
                          {m.overloaded ? (
                            <span className="inline-flex items-center gap-0.5 bg-red-100 text-red-700 text-[9px] font-bold px-1 py-0.5 rounded"><AlertTriangle className="w-2.5 h-2.5" />OVER</span>
                          ) : (
                            <span className="inline-block bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded">OK</span>
                          )}
                        </div>
                      </div>
                      {/* Override schedule toggle */}
                      <div className="border-t px-2 py-1 flex items-center justify-between bg-gray-50 rounded-b">
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          {m.useDefaultSchedule ? 'Using dept. default' : `Custom: ${m.customDaysPerWeek}d × ${m.customHoursPerDay}h`}
                        </span>
                        <button
                          className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5"
                          onClick={() => {
                            if (isExpanded) {
                              setOverrideMachineId(null);
                            } else {
                              setOverrideMachineId(m.machineId);
                              setOverrideForm({
                                daysPerWeek: String(m.customDaysPerWeek ?? scheduleSettings?.daysPerWeek ?? 4),
                                hoursPerDay: String(m.customHoursPerDay ?? scheduleSettings?.hoursPerDay ?? 10),
                              });
                            }
                          }}
                        >
                          Override Schedule <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="px-2 pb-2 pt-1 space-y-1.5 border-t bg-blue-50 rounded-b">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div>
                              <Label className="text-[10px] text-gray-500 mb-0.5 block">Days/Week</Label>
                              <Input type="number" min="1" max="7" step="0.5" value={overrideForm.daysPerWeek} onChange={e => setOverrideForm(f => ({ ...f, daysPerWeek: e.target.value }))} className="h-6 text-xs" />
                            </div>
                            <div>
                              <Label className="text-[10px] text-gray-500 mb-0.5 block">Hrs/Day</Label>
                              <Input type="number" min="1" max="24" step="0.5" value={overrideForm.hoursPerDay} onChange={e => setOverrideForm(f => ({ ...f, hoursPerDay: e.target.value }))} className="h-6 text-xs" />
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-500">Weekly: <b>{(parseFloat(overrideForm.daysPerWeek) * parseFloat(overrideForm.hoursPerDay)).toFixed(0)} hrs</b></p>
                          <div className="flex gap-1">
                            <Button size="sm" className="h-6 text-[10px] flex-1" disabled={saveMachineOverride.isPending} onClick={() => {
                              const d = parseFloat(overrideForm.daysPerWeek);
                              const h = parseFloat(overrideForm.hoursPerDay);
                              if (isNaN(d) || d <= 0 || isNaN(h) || h <= 0) {
                                toast({ title: 'Invalid input', description: 'Days and hours must be positive numbers.', variant: 'destructive' });
                                return;
                              }
                              saveMachineOverride.mutate({ id: m.machineId, data: { useDefaultSchedule: false, customDaysPerWeek: d, customHoursPerDay: h, customWeeklyCapacityHours: d * h } });
                            }}>
                              <Save className="w-3 h-3 mr-1" />Save Override
                            </Button>
                            {!m.useDefaultSchedule && (
                              <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={saveMachineOverride.isPending} onClick={() => saveMachineOverride.mutate({ id: m.machineId, data: { useDefaultSchedule: true, customDaysPerWeek: null, customHoursPerDay: null, customWeeklyCapacityHours: null } })}>
                                Reset
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Separator />
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-600">Machine Registry</p>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1" onClick={() => { setMachineDialogMachine(null); setMachineDialogOpen(true); }}>
                    <Plus className="w-3 h-3" />Add Machine
                  </Button>
                </div>
                {machines.map(m => (
                  <div key={m.id} className="bg-white border rounded px-2 py-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-gray-800">{m.machineName}</span>
                        {m.machineNumber && <span className="text-gray-400 ml-1">#{m.machineNumber}</span>}
                        {m.machineType && <span className="text-purple-600 ml-1 text-[10px] bg-purple-50 px-1 rounded">{m.machineType}</span>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{m.active ? 'Active' : 'Inactive'}</span>
                        <button className="p-0.5 text-gray-400 hover:text-blue-600" onClick={() => { setMachineDialogMachine(m); setMachineDialogOpen(true); }}><Edit2 className="w-3 h-3" /></button>
                        <button className="p-0.5 text-gray-400 hover:text-red-600" onClick={() => setMachineDeleteConfirm(m)}><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    {m.capabilities && typeof m.capabilities === 'string' && (
                      <p className="mt-0.5 text-[10px] text-gray-500 truncate">{m.capabilities}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}

        {/* ── Queue Tab ─────────────────────────────────────────────────────── */}
        {leftTab === 'queue' && <>
        {/* Queue table header — 10 columns */}
        <div className="grid text-xs font-semibold text-gray-500 bg-gray-50 border-b px-2 py-1.5" style={{ gridTemplateColumns: '8px 95px 60px 32px 50px 40px 44px 64px 42px 68px' }}>
          <span />
          <span>Work Order / Part</span>
          <span>Part Name</span>
          <span>Qty</span>
          <span>Machine</span>
          <span>Est.Hrs</span>
          <span>Due</span>
          <span>Programmer</span>
          <span>Ops</span>
          <span>Status</span>
        </div>

        <ScrollArea className="flex-1">
          {jobsLoading ? (
            <div className="p-4 text-center text-sm text-gray-400">Loading jobs...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">No jobs match filters</div>
          ) : (
            <div className="divide-y">
              {filteredJobs.map(job => (
                <div
                  key={job.id}
                  className={`grid items-center px-2 py-2 cursor-pointer hover:bg-blue-50 transition-colors text-xs ${selectedJobId === job.id ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                  style={{ gridTemplateColumns: '8px 95px 60px 32px 50px 40px 44px 64px 42px 68px' }}
                  onClick={() => handleSelectJob(job.id)}
                >
                  <PriorityDot priority={job.priority} />
                  <div className="min-w-0 pr-1">
                    <p className="font-semibold text-gray-900 truncate">{job.workOrder}</p>
                    <p className="text-gray-400 truncate">{job.partNumber}{job.revision ? ` r${job.revision}` : ''}</p>
                    {job.customerPo && <p className="text-[10px] text-blue-500 truncate">PO: {job.customerPo}</p>}
                    <div className="flex gap-0.5 mt-0.5">
                      <span className={`px-1 rounded text-[10px] font-medium ${job.materialReady ? 'bg-green-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                        {job.materialReady ? '✓Matl' : '⚠Matl'}
                      </span>
                      {job.qcHold && <span className="bg-red-100 text-red-700 px-1 rounded text-[10px]">Hold</span>}
                    </div>
                  </div>
                  <p className="text-gray-700 truncate pr-1">{job.partName}</p>
                  <p className="text-gray-700">{job.qty}</p>
                  <p className="text-gray-600 truncate">{job.machine ?? '—'}</p>
                  <p className="text-gray-600">{job.estimatedHours != null ? `${job.estimatedHours}h` : '—'}</p>
                  <p className="text-gray-600">{job.dueDate ? format(new Date(job.dueDate), 'MM/dd') : '—'}</p>
                  <p className="text-gray-500 truncate text-[10px]">{job.programmerDisplayName ?? '—'}</p>
                  <p className="text-gray-500 text-[10px]">{`${job.completedOps ?? 0}/${job.totalOps ?? 0}`}</p>
                  <StatusBadge status={job.status} />
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        </>}
      </div>

      {/* ── CENTER PANEL: Job Detail ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r">
        {!selectedJob ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a job to view details</p>
            </div>
          </div>
        ) : (
          <>
            {/* Job header */}
            <div className="p-3 border-b bg-white">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="font-bold text-gray-900">{selectedJob.workOrder}</h2>
                    {editingJobStatus ? (
                      <Select value={selectedJob.status} onValueChange={v => updateJob.mutate({ id: selectedJob.id, data: { status: v } })}>
                        <SelectTrigger className="h-6 text-xs w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {JOB_STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <button onClick={() => setEditingJobStatus(true)} className="hover:opacity-70">
                        <StatusBadge status={selectedJob.status} />
                      </button>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_COLORS[selectedJob.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                      <Flag className="w-3 h-3 inline mr-0.5" />{selectedJob.priority}
                    </span>
                  </div>
                  <p className="font-medium text-gray-800">{selectedJob.partName}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                    <span>P/N: <b className="text-gray-700">{selectedJob.partNumber}</b></span>
                    {selectedJob.revision && <span>Rev: <b className="text-gray-700">{selectedJob.revision}</b></span>}
                    <span>Qty: <b className="text-gray-700">{selectedJob.qty}</b></span>
                    {selectedJob.dueDate && <span>Due: <b className="text-gray-700">{format(new Date(selectedJob.dueDate), 'MM/dd/yyyy')}</b></span>}
                    {selectedJob.machine && <span>Machine: <b className="text-gray-700">{selectedJob.machine}</b></span>}
                    {selectedJob.programmerDisplayName && <span>Programmer: <b className="text-gray-700">{selectedJob.programmerDisplayName}</b></span>}
                    {selectedJob.estimatedHours != null && <span>Est: <b className="text-gray-700">{selectedJob.estimatedHours}h</b></span>}
                    {selectedJob.linkedTravelerId && (
                      <span className="flex items-center gap-0.5">
                        <LinkIcon className="w-3 h-3" />
                        {travelerInfo
                          ? <><b className="text-blue-700">{travelerInfo.travelerNumber}</b><span className="ml-1 text-[10px] bg-blue-50 text-blue-500 px-1 rounded">{travelerInfo.status}</span></>
                          : <span className="text-gray-500">Traveler linked</span>
                        }
                        <Link href={`/travelers/${selectedJob.linkedTravelerId}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-[10px] text-blue-600 underline hover:text-blue-800">Open ↗</Link>
                      </span>
                    )}
                    {selectedJob.customerPo && (
                      <span>Cust PO: <b className="text-gray-700">{selectedJob.customerPo}</b></span>
                    )}
                  </div>
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {selectedJob.materialReady && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Material Ready</span>}
                    {selectedJob.qcHold && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">QC Hold</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => updateJob.mutate({ id: selectedJob.id, data: { materialReady: !selectedJob.materialReady } })}>
                    {selectedJob.materialReady ? '✓ Matl Ready' : 'Mark Matl Ready'}
                  </Button>
                  <Button size="sm" variant={selectedJob.qcHold ? 'destructive' : 'outline'} className="text-xs h-7" onClick={() => updateJob.mutate({ id: selectedJob.id, data: { qcHold: !selectedJob.qcHold } })}>
                    {selectedJob.qcHold ? 'Clear QC Hold' : 'QC Hold'}
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" disabled={!travelerInfo?.productionWorkOrderId || !selectedJob.linkedTravelerStepId || availableToBatchQty <= 0} onClick={() => openBatchDialog(executionOp)}>
                    <Package className="w-3 h-3 mr-1" /> Batch This Step
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 text-red-500 px-2" onClick={() => { if (confirm('Delete this job?')) deleteJob.mutate(selectedJob.id); }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">
                  <Layers className="w-3 h-3" />Batches {selectedJobBatches.length}
                </span>
                <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">WO Qty {woQty}</span>
                <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">Step Qty {stepQty}</span>
                <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5">Batched {alreadyBatchedQty}</span>
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">Available {availableToBatchQty}</span>
                {Object.entries(batchStatusRollups).map(([status, count]) => (
                  <span key={status} className="rounded-full bg-gray-50 border px-2 py-0.5 text-gray-600">
                    {BATCH_STATUS_LABELS[status] ?? status}: {count}
                  </span>
                ))}
              </div>
              {selectedJob.notes && <p className="mt-2 text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">{selectedJob.notes}</p>}
            </div>

            {/* Operations list */}
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-gray-700">Operations</h3>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setNewOpOpen(true)}>
                    <Plus className="w-3 h-3 mr-1" /> Add Operation
                  </Button>
                </div>

                {operations.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">No operations yet. Add an operation to get started.</p>
                ) : operations.map(op => (
                  <div key={op.id} className={`rounded-lg border bg-white shadow-sm ${selectedOpId === op.id ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-50" onClick={() => handleSelectOp(op)}>
                      <span className="w-10 text-xs font-bold text-blue-600 flex-shrink-0">Op {op.sequence}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{op.opName}</span>
                      {op.machine && <span className="text-xs text-gray-400 hidden sm:inline">{op.machine}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${OP_STATUS_COLORS[op.status] ?? 'bg-gray-100 text-gray-600'}`}>{op.status}</span>
                      {op.status === 'complete' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                      {op.claimedByDisplayName && <span className="text-xs text-gray-400 hidden md:inline"><User className="w-3 h-3 inline" /> {op.claimedByDisplayName}</span>}
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 flex-shrink-0" disabled={!travelerInfo?.productionWorkOrderId || !selectedJob.linkedTravelerStepId || availableToBatchQty <= 0} onClick={e => { e.stopPropagation(); handleSelectOp(op); openBatchDialog(op); }}>
                        <Package className="w-3 h-3 mr-1" />Batch
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600 flex-shrink-0" onClick={e => { e.stopPropagation(); deleteOperation.mutate(op.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${selectedOpId === op.id ? 'rotate-90' : ''}`} />
                    </div>

                    {selectedOpId === op.id && (
                      <div className="border-t">
                        <Tabs defaultValue="setup" className="w-full">
                          <TabsList className="w-full justify-start rounded-none border-b bg-gray-50 h-8 overflow-x-auto">
                            <TabsTrigger value="setup" className="text-xs h-7">Setup</TabsTrigger>
                            <TabsTrigger value="tooling" className="text-xs h-7">Tooling</TabsTrigger>
                            <TabsTrigger value="program" className="text-xs h-7">Program</TabsTrigger>
                            <TabsTrigger value="photos" className="text-xs h-7">Photos</TabsTrigger>
                            <TabsTrigger value="qc" className="text-xs h-7">QC</TabsTrigger>
                            <TabsTrigger value="batches" className="text-xs h-7"><Package className="w-3 h-3 mr-1" />Batches</TabsTrigger>
                            <TabsTrigger value="tribal" className="text-xs h-7"><Lightbulb className="w-3 h-3 mr-1" />Tips</TabsTrigger>
                          </TabsList>

                          {/* Setup Instructions Tab */}
                          <TabsContent value="setup" className="p-3 m-0 space-y-3">
                            <InlineEditableField {...fieldProps(op.id, 'opDescription', op.opDescription, 'Operation Description')} />
                            <div className="grid grid-cols-2 gap-3">
                              <InlineEditableField {...fieldProps(op.id, 'machine', op.machine, 'Machine')} />
                              <InlineEditableField {...fieldProps(op.id, 'fixture', op.fixture, 'Fixture')} />
                              <InlineEditableField {...fieldProps(op.id, 'workRefPoint', op.workRefPoint, 'Work Reference Point')} />
                              <InlineEditableField {...fieldProps(op.id, 'rawStockOrientation', op.rawStockOrientation, 'Raw Stock Orientation')} />
                              <InlineEditableField {...fieldProps(op.id, 'ncProgramRef', op.ncProgramRef, 'NC Program Reference')} />
                              <InlineEditableField {...fieldProps(op.id, 'qcPlan', op.qcPlan, 'QC Plan Reference')} />
                              <InlineEditableField {...fieldProps(op.id, 'estimatedSetupMinutes', op.estimatedSetupMinutes?.toString() ?? null, 'Setup Time (min)', { numeric: true })} />
                              <InlineEditableField {...fieldProps(op.id, 'estimatedCycleMinutes', op.estimatedCycleMinutes?.toString() ?? null, 'Cycle Time (min)', { numeric: true })} />
                              <InlineEditableField {...fieldProps(op.id, 'standardLaborMinutes', op.standardLaborMinutes?.toString() ?? null, 'Std Labor (min)', { numeric: true })} />
                            </div>
                            <InlineEditableField {...fieldProps(op.id, 'datumNotes', op.datumNotes, 'Datum Notes')} />
                            <InlineEditableField {...fieldProps(op.id, 'warmupNotes', op.warmupNotes, 'Warmup / Run-in Notes')} />
                            <div className="flex gap-2 flex-wrap mt-1">
                              {op.actualSetupStartAt && <span className="text-xs bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded">Setup started: {format(new Date(op.actualSetupStartAt), 'HH:mm')}</span>}
                              {op.actualSetupEndAt && <span className="text-xs bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded">Setup done: {format(new Date(op.actualSetupEndAt), 'HH:mm')}</span>}
                              {op.actualRunStartAt && <span className="text-xs bg-green-50 border border-green-200 px-2 py-0.5 rounded">Run started: {format(new Date(op.actualRunStartAt), 'HH:mm')}</span>}
                              {op.actualRunEndAt && <span className="text-xs bg-green-50 border border-green-200 px-2 py-0.5 rounded">Run done: {format(new Date(op.actualRunEndAt), 'HH:mm')}</span>}
                            </div>
                          </TabsContent>

                          {/* Tooling Tab */}
                          <TabsContent value="tooling" className="p-3 m-0">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-semibold text-gray-600">Tool List</p>
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setNewToolOpen(true)}>
                                <Plus className="w-3 h-3 mr-1" /> Add Tool
                              </Button>
                            </div>
                            {tools.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">No tools listed</p> : (
                              <div className="space-y-2">
                                {tools.map(tool => (
                                  <div key={tool.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-xs">
                                    {tool.imageUrl ? (
                                      <img src={tool.imageUrl} alt={tool.toolName} className="w-12 h-12 object-cover rounded border flex-shrink-0" />
                                    ) : (
                                      <div className="w-12 h-12 text-center bg-white border rounded flex items-center justify-center font-mono font-bold text-blue-700 flex-shrink-0 text-sm">{tool.toolNumber}</div>
                                    )}
                                    <div className="flex-1">
                                      <div className="flex items-center gap-1">
                                        {tool.imageUrl && <span className="font-mono text-blue-700 font-bold">{tool.toolNumber}</span>}
                                        <p className="font-medium text-gray-800">{tool.toolName}</p>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 text-gray-500 mt-0.5">
                                        {tool.holderPosition && <span>Pos: {tool.holderPosition}</span>}
                                        {tool.diameter && <span>Ø{tool.diameter}"</span>}
                                      </div>
                                      {tool.offsetNotes && <p className="text-gray-500 italic">{tool.offsetNotes}</p>}
                                      {tool.replacementNotes && <p className="text-orange-600">{tool.replacementNotes}</p>}
                                    </div>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => deleteTool.mutate(tool.id)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>

                          {/* Program Tab */}
                          <TabsContent value="program" className="p-3 m-0">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-semibold text-gray-600">NC Program Info</p>
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setNewProgramOpen(true)}>
                                <Plus className="w-3 h-3 mr-1" /> Add Program
                              </Button>
                            </div>
                            {programs.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">No program info</p> : (
                              programs.map(prog => (
                                <div key={prog.id} className="p-3 bg-gray-50 rounded text-sm space-y-1">
                                  <div className="flex justify-between items-start">
                                    <p className="font-semibold text-gray-800">{prog.programName}</p>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => deleteProgram.mutate(prog.id)}>
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                  {prog.programNumber && <p className="text-xs text-gray-500">Program #: {prog.programNumber}</p>}
                                  {prog.version && <p className="text-xs text-gray-500">Version: {prog.version}</p>}
                                  {prog.machine && <p className="text-xs text-gray-500">Machine: {prog.machine}</p>}
                                  {prog.estimatedCycleMinutes && <p className="text-xs text-gray-500">Est. Cycle: {prog.estimatedCycleMinutes} min</p>}
                                  {prog.proveOutRequired && <p className="text-xs font-medium text-orange-600">⚠ Prove-Out Required</p>}
                                  {prog.approvedByDisplayName ? (
                                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                                      ✓ Approved by {prog.approvedByDisplayName}{prog.approvedAt ? ` on ${format(new Date(prog.approvedAt), 'MM/dd/yyyy')}` : ''}
                                    </p>
                                  ) : (
                                    <Button size="sm" variant="outline" className="h-6 text-xs border-green-200 text-green-700 hover:bg-green-50" onClick={() => approveProgram.mutate(prog.id)} disabled={approveProgram.isPending}>
                                      <CheckCircle className="w-3 h-3 mr-1" /> Approve Program
                                    </Button>
                                  )}
                                  {prog.notes && <p className="text-xs text-gray-600 italic">{prog.notes}</p>}
                                </div>
                              ))
                            )}
                          </TabsContent>

                          {/* Photos Tab */}
                          <TabsContent value="photos" className="p-3 m-0">
                            <div className="mb-3 p-2 bg-gray-50 rounded border text-xs space-y-2">
                              <p className="font-semibold text-gray-600">Upload Setup Photo</p>
                              <div className="flex gap-2">
                                <Select value={photoCategory} onValueChange={setPhotoCategory}>
                                  <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>{PHOTO_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                                </Select>
                                <Input placeholder="Caption..." value={photoCaption} onChange={e => setPhotoCaption(e.target.value)} className="h-7 text-xs flex-1" />
                              </div>
                              <div className="flex gap-2 items-center">
                                <Input type="file" accept="image/*" className="h-7 text-xs flex-1" onChange={e => setPhotoFile(e.target.files?.[0] ?? null)} />
                                <Button size="sm" className="h-7 text-xs" disabled={!photoFile || photoUploading} onClick={handlePhotoUpload}>
                                  {photoUploading ? 'Uploading...' : <><Camera className="w-3 h-3 mr-1" />Upload</>}
                                </Button>
                              </div>
                            </div>
                            {photos.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">No photos uploaded</p> : (
                              <div className="grid grid-cols-2 gap-2">
                                {photos.map(photo => (
                                  <div key={photo.id} className="relative group rounded border overflow-hidden bg-gray-100">
                                    <img src={photo.url} alt={photo.caption ?? photo.category} className="w-full h-24 object-cover" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1">
                                      <p className="font-medium">{photo.category}</p>
                                      {photo.caption && <p className="text-gray-300 truncate">{photo.caption}</p>}
                                    </div>
                                    <button className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deletePhoto.mutate(photo.id)}>
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>

                          {/* QC Checkpoints Tab */}
                          <TabsContent value="qc" className="p-3 m-0">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-semibold text-gray-600">QC Checkpoints</p>
                              <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setNewCheckpointOpen(true)}>
                                <Plus className="w-3 h-3 mr-1" /> Add Checkpoint
                              </Button>
                            </div>
                            {checkpoints.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">No checkpoints defined</p> : (
                              <div className="space-y-2">
                                {checkpoints.map(cp => {
                                  const existingResult = getQcResultForCheckpoint(cp.id);
                                  const entry = qcResultEntry[cp.id] ?? { result: '', measuredValue: '', notes: '', photoFile: null };
                                  return (
                                    <div key={cp.id} className="p-2 border rounded text-xs">
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-1 flex-wrap">
                                            <p className="font-semibold text-gray-800">{cp.name} {cp.required && <span className="text-red-500">*</span>}</p>
                                            {cp.photoRequired && <span title="Photo required" className="text-blue-500 text-[10px] bg-blue-50 border border-blue-200 px-1 rounded flex items-center gap-0.5"><Camera className="w-2.5 h-2.5" />Photo</span>}
                                            {cp.signatureRequired && <span title="Signature required" className="text-purple-500 text-[10px] bg-purple-50 border border-purple-200 px-1 rounded flex items-center gap-0.5"><User className="w-2.5 h-2.5" />Sig</span>}
                                          </div>
                                          {cp.characteristic && <p className="text-gray-500">{cp.characteristic}</p>}
                                          <div className="flex flex-wrap gap-3 mt-0.5 text-gray-400">
                                            {cp.nominal && <span>Nom: {cp.nominal}</span>}
                                            {cp.tolerance && <span>Tol: {cp.tolerance}</span>}
                                            {cp.method && <span>Method: {cp.method}</span>}
                                            {cp.frequency && <span>Freq: {cp.frequency}</span>}
                                          </div>
                                        </div>
                                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400" onClick={() => deleteCheckpoint.mutate(cp.id)}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      {existingResult ? (
                                        <div className={`mt-1.5 p-1.5 rounded ${existingResult.result === 'pass' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                          <p className="font-semibold">{existingResult.result === 'pass' ? '✓ PASS' : '✗ FAIL'}{existingResult.measuredValue && ` — ${existingResult.measuredValue}`}</p>
                                          {existingResult.notes && <p className="text-gray-500">{existingResult.notes}</p>}
                                          <p className="text-gray-400 text-[10px]">{existingResult.recordedByDisplayName} @ {existingResult.recordedAt ? format(new Date(existingResult.recordedAt), 'MM/dd HH:mm') : ''}</p>
                                        </div>
                                      ) : (
                                        <div className="mt-2 space-y-1">
                                          <div className="flex gap-1">
                                            <Input placeholder="Measured value" value={entry.measuredValue} onChange={e => setQcResultEntry(prev => ({ ...prev, [cp.id]: { ...entry, measuredValue: e.target.value } }))} className="h-6 text-xs flex-1" />
                                            <Input placeholder="Notes" value={entry.notes} onChange={e => setQcResultEntry(prev => ({ ...prev, [cp.id]: { ...entry, notes: e.target.value } }))} className="h-6 text-xs flex-1" />
                                          </div>
                                          <div className="flex gap-1 items-center">
                                            <label className="text-gray-400 text-[10px] cursor-pointer flex items-center gap-1">
                                              <Camera className="w-3 h-3" />
                                              <input type="file" accept="image/*" className="hidden" onChange={e => setQcResultEntry(prev => ({ ...prev, [cp.id]: { ...entry, photoFile: e.target.files?.[0] ?? null } }))} />
                                              {entry.photoFile ? <span className="text-blue-600 font-medium">{entry.photoFile.name}</span> : 'Attach photo'}
                                            </label>
                                            <div className="flex gap-1 ml-auto">
                                              <Button size="sm" className="h-6 text-xs flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleQcResultWithPhoto(cp, op.id, 'pass')}>Pass</Button>
                                              <Button size="sm" variant="destructive" className="h-6 text-xs flex-1" onClick={() => handleQcResultWithPhoto(cp, op.id, 'fail')}>Fail</Button>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </TabsContent>

                          {/* Operation Batches Tab */}
                          <TabsContent value="batches" className="p-3 m-0">
                            <div className="flex justify-between items-center mb-2">
                              <p className="text-xs font-semibold text-gray-600">Operation Batches</p>
                              <Button size="sm" variant="outline" className="h-6 text-xs" disabled={availableToBatchQty <= 0} onClick={() => openBatchDialog(op)}>
                                <Plus className="w-3 h-3 mr-1" /> Create Batch
                              </Button>
                            </div>
                            {selectedOpBatches.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-4">No batches for this operation</p>
                            ) : (
                              <div className="space-y-1">
                                {selectedOpBatches.map(batch => (
                                  <div key={batch.id} className="flex items-center gap-2 rounded border bg-gray-50 px-2 py-1.5 text-xs">
                                    <div className="min-w-0 flex-1">
                                      <p className="font-semibold text-gray-800 truncate">{batch.batchCode}</p>
                                      <p className="text-gray-500 truncate">Qty {batch.batchQty} | Done {batch.qtyCompleted} | Scrap {batch.qtyScrapped}</p>
                                    </div>
                                    <BatchStatusBadge status={batch.status} />
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openAssignBatchDialog(batch)}><User className="w-3 h-3" /></Button>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setBarcodeBatch(batch)}><Printer className="w-3 h-3" /></Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </TabsContent>

                          {/* Tribal Knowledge Tab */}
                          <TabsContent value="tribal" className="p-3 m-0">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3 text-yellow-500" /> Tips & Tribal Knowledge
                              </p>
                              {!editingTribal ? (
                                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setEditingTribal(true); setTribalText(op.tribalKnowledge ?? ''); }}>
                                  <Edit2 className="w-3 h-3 mr-1" /> Edit
                                </Button>
                              ) : (
                                <div className="flex gap-1">
                                  <Button size="sm" className="h-6 text-xs" onClick={() => handleSaveTribal(op.id)}><Save className="w-3 h-3 mr-1" />Save</Button>
                                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingTribal(false)}>Cancel</Button>
                                </div>
                              )}
                            </div>
                            {editingTribal ? (
                              <Textarea value={tribalText} onChange={e => setTribalText(e.target.value)} placeholder="Enter tips, tricks, known issues, and tribal knowledge..." className="text-xs min-h-[120px]" />
                            ) : (
                              <div className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded p-3 min-h-[80px] whitespace-pre-wrap">
                                {op.tribalKnowledge ?? <span className="text-gray-400 italic text-xs">No tribal knowledge recorded yet. Click Edit to add notes.</span>}
                              </div>
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    )}
                  </div>
                ))}

                <div className="rounded-lg border bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Layers className="w-4 h-4 text-blue-600" />Operation Batches</h3>
                      <p className="text-xs text-gray-500">Total {selectedStepRollups.totalStepQty}; batched {selectedStepRollups.batchedQty}; available {selectedStepRollups.availableToBatchQty}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!travelerInfo?.productionWorkOrderId || !selectedJob.linkedTravelerStepId || availableToBatchQty <= 0} onClick={() => openBatchDialog(executionOp)}>
                      <Plus className="w-3 h-3 mr-1" />Create Partial Job
                    </Button>
                  </div>
                  {selectedJobBatches.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No operation batches created for this job</p>
                  ) : (
                    <div>
                      <div className="grid grid-cols-3 gap-2 border-b bg-gray-50 px-3 py-2 text-xs md:grid-cols-7">
                        <div><p className="text-[10px] uppercase text-gray-400">Total step</p><p className="font-semibold">{selectedStepRollups.totalStepQty}</p></div>
                        <div><p className="text-[10px] uppercase text-gray-400">Batched</p><p className="font-semibold">{selectedStepRollups.batchedQty}</p></div>
                        <div><p className="text-[10px] uppercase text-gray-400">Available</p><p className="font-semibold">{selectedStepRollups.availableToBatchQty}</p></div>
                        <div><p className="text-[10px] uppercase text-gray-400">In progress</p><p className="font-semibold">{selectedStepRollups.inProgressQty}</p></div>
                        <div><p className="text-[10px] uppercase text-gray-400">Completed</p><p className="font-semibold">{selectedStepRollups.completedQty}</p></div>
                        <div><p className="text-[10px] uppercase text-gray-400">Scrap</p><p className="font-semibold text-red-600">{selectedStepRollups.scrappedQty}</p></div>
                        <div><p className="text-[10px] uppercase text-gray-400">Remaining</p><p className="font-semibold">{selectedStepRollups.remainingQty}</p></div>
                      </div>
                      <div className="overflow-x-auto">
                        <div className="min-w-[1120px]">
                          <div className="grid items-center border-b bg-gray-50 px-2 py-1.5 text-[11px] font-semibold text-gray-500" style={{ gridTemplateColumns: '118px 74px 112px 96px 64px 76px 64px 100px 126px 86px 72px 74px 118px' }}>
                            <span>Batch code</span><span>WO</span><span>Part</span><span>Step</span><span>Batch qty</span><span>Completed</span><span>Scrap</span><span>Machine</span><span>Technician</span><span>Status</span><span>Priority</span><span>Due</span><span>Actions</span>
                          </div>
                          {selectedJobBatches.map(batch => (
                            <div key={batch.id} className="grid items-center border-b last:border-b-0 px-2 py-2 text-xs" style={{ gridTemplateColumns: '118px 74px 112px 96px 64px 76px 64px 100px 126px 86px 72px 74px 118px' }}>
                              <span className="font-semibold text-blue-700 truncate">{batch.batchCode}</span>
                              <span className="truncate">{batch.workOrderNumber}</span>
                              <span className="truncate" title={batch.partName ?? batch.partNumber ?? ''}>{batch.partNumber ?? batch.partName ?? '-'}</span>
                              <span className="truncate">{batch.operationSequence ? `Op ${batch.operationSequence}` : `Step ${batch.travelerStepNumber}`}</span>
                              <span>{batch.batchQty}</span>
                              <span>{batch.qtyCompleted}</span>
                              <span className={batch.qtyScrapped > 0 ? 'text-red-600 font-semibold' : ''}>{batch.qtyScrapped}</span>
                              <span className="truncate">{batch.assignedMachineName ?? '-'}</span>
                              <span className="truncate">{batch.assignedEmployeeDisplayName ?? '-'}</span>
                              <BatchStatusBadge status={batch.status} />
                              <span className="capitalize">{batch.priority}</span>
                              <span>{batch.dueDate ? format(new Date(batch.dueDate), 'MM/dd') : '-'}</span>
                              <span className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Assign" onClick={() => openAssignBatchDialog(batch)}><User className="w-3 h-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Hold" disabled={batch.status === 'cancelled' || batch.status === 'completed' || holdOperationBatch.isPending} onClick={() => holdOperationBatch.mutate(batch.id)}><PauseCircle className="w-3 h-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" title="Cancel" disabled={batch.status === 'cancelled' || batch.status === 'completed' || cancelOperationBatch.isPending} onClick={() => { if (confirm(`Cancel ${batch.batchCode}?`)) cancelOperationBatch.mutate(batch.id); }}><Ban className="w-3 h-3" /></Button>
                                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Print barcode" onClick={() => setBarcodeBatch(batch)}><Printer className="w-3 h-3" /></Button>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ── RIGHT PANEL: Execution ─────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 flex flex-col bg-white">
        {!selectedJob ? (
          <div className="flex-1 flex items-center justify-center text-gray-300">
            <div className="text-center"><Play className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-xs">Select a job</p></div>
          </div>
        ) : (
          <>
            <div className="p-3 border-b bg-gray-50">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Play className="w-4 h-4 text-green-600" />Execution</h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{selectedJob.workOrder} — {selectedJob.partName}</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-3">
                {/* Operation selector */}
                <div>
                  <Label className="text-xs font-semibold text-gray-600 mb-1 block">Active Operation</Label>
                  <Select value={selectedOpId?.toString() ?? ''} onValueChange={v => {
                    const op = operations.find(o => o.id === parseInt(v));
                    if (op) handleSelectOp(op);
                  }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select operation..." /></SelectTrigger>
                    <SelectContent>
                      {operations.map(op => (
                        <SelectItem key={op.id} value={op.id.toString()}>
                          {op.status === 'complete' ? '✓ ' : ''}Op {op.sequence}: {op.opName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {executionOp && (
                  <>
                    {/* Claim / Unclaim */}
                    {!executionOp.claimedByDisplayName ? (
                      <Button className="w-full h-8 text-xs" variant="outline" onClick={() => claimOperation.mutate(executionOp.id)} disabled={claimOperation.isPending}>
                        <User className="w-3 h-3 mr-1" /> Claim Operation
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs text-gray-600 flex items-center gap-1.5 bg-blue-50 px-2 py-1.5 rounded flex-1 min-w-0">
                          <User className="w-3 h-3 text-blue-500 flex-shrink-0" />
                          <span className="truncate">Claimed by <b>{executionOp.claimedByDisplayName}</b></span>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0" onClick={() => unclaimOperation.mutate(executionOp.id)} disabled={unclaimOperation.isPending}>
                          <X className="w-3 h-3 mr-1" />Unclaim
                        </Button>
                      </div>
                    )}

                    {/* QC Hold */}
                    {executionOp.status === 'hold' ? (
                      <div className="space-y-1">
                        <div className="bg-red-50 border border-red-200 rounded px-2 py-1.5 text-xs text-red-700 flex items-center gap-1.5">
                          <span className="font-semibold">ON HOLD</span>
                          {executionOp.pauseReason && <span className="text-red-500 truncate">— {executionOp.pauseReason}</span>}
                        </div>
                        <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => updateOperation.mutate({ id: executionOp.id, data: { status: executionOp.actualRunStartAt ? 'running' : 'setup', pauseReason: null } })}>
                          Release from Hold
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => { setHoldReason(executionOp.pauseReason ?? ''); setHoldDialogOpen(true); }}>
                        Place on QC Hold
                      </Button>
                    )}

                    {/* Setup timing */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Setup</p>
                        {executionOp.actualSetupStartAt && (
                          <span className="text-xs text-yellow-700 font-medium">
                            {formatElapsed(executionOp.actualSetupStartAt, executionOp.actualSetupEndAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="flex-1 h-7 text-xs bg-yellow-500 hover:bg-yellow-600" disabled={!!executionOp.actualSetupStartAt} onClick={() => updateOperation.mutate({ id: executionOp.id, data: { status: 'setup', actualSetupStartAt: new Date().toISOString() } })}>
                          <Play className="w-3 h-3 mr-1" />{executionOp.actualSetupStartAt ? format(new Date(executionOp.actualSetupStartAt), 'HH:mm') : 'Start'}
                        </Button>
                        <Button size="sm" className="flex-1 h-7 text-xs bg-yellow-700 hover:bg-yellow-800" disabled={!executionOp.actualSetupStartAt || !!executionOp.actualSetupEndAt} onClick={() => updateOperation.mutate({ id: executionOp.id, data: { actualSetupEndAt: new Date().toISOString() } })}>
                          <Square className="w-3 h-3 mr-1" />{executionOp.actualSetupEndAt ? format(new Date(executionOp.actualSetupEndAt), 'HH:mm') : 'End'}
                        </Button>
                      </div>
                    </div>

                    {/* Run timing */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Run</p>
                        {executionOp.actualRunStartAt && (
                          <span className="text-xs text-green-700 font-medium">
                            {formatElapsed(executionOp.actualRunStartAt, executionOp.actualRunEndAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700" disabled={!!executionOp.actualRunStartAt} onClick={() => updateOperation.mutate({ id: executionOp.id, data: { status: 'running', actualRunStartAt: new Date().toISOString() } })}>
                          <Play className="w-3 h-3 mr-1" />{executionOp.actualRunStartAt ? format(new Date(executionOp.actualRunStartAt), 'HH:mm') : 'Start'}
                        </Button>
                        <Button size="sm" className="flex-1 h-7 text-xs bg-green-800 hover:bg-green-900" disabled={!executionOp.actualRunStartAt || !!executionOp.actualRunEndAt} onClick={() => updateOperation.mutate({ id: executionOp.id, data: { actualRunEndAt: new Date().toISOString() } })}>
                          <Square className="w-3 h-3 mr-1" />{executionOp.actualRunEndAt ? format(new Date(executionOp.actualRunEndAt), 'HH:mm') : 'End'}
                        </Button>
                      </div>
                    </div>

                    {/* Part count & scrap */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Part Count</p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-gray-500 mb-0.5 block">Completed</Label>
                          <Input type="number" min="0" value={executionOp.partCount} onChange={e => updateOperation.mutate({ id: executionOp.id, data: { partCount: parseInt(e.target.value) || 0 } })} className="h-7 text-xs text-center" />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-red-500 mb-0.5 block">Scrap</Label>
                          <Input type="number" min="0" value={executionOp.scrapQty} onChange={e => updateOperation.mutate({ id: executionOp.id, data: { scrapQty: parseInt(e.target.value) || 0 } })} className="h-7 text-xs text-center border-red-200" />
                        </div>
                      </div>
                    </div>

                    {/* Pause / Resume run */}
                    {executionOp.actualRunStartAt && !executionOp.actualRunEndAt && executionOp.status !== 'hold' && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                          <PauseCircle className="w-3 h-3" /> Run Control
                        </p>
                        {executionOp.pauseReason ? (
                          <div className="space-y-1">
                            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 flex items-start gap-1.5">
                              <PauseCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              <span className="break-words">Paused — {executionOp.pauseReason}</span>
                            </div>
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs border-green-200 text-green-700 hover:bg-green-50" onClick={() => {
                              createTimeLog.mutate({ operationId: executionOp.id, type: 'resume', reason: null });
                              updateOperation.mutate({ id: executionOp.id, data: { pauseReason: null } });
                            }}>
                              <Play className="w-3 h-3 mr-1" /> Resume
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full h-7 text-xs border-orange-200 text-orange-600 hover:bg-orange-50" onClick={() => { setPauseLogReason(''); setPauseDialogOpen(true); }}>
                            <PauseCircle className="w-3 h-3 mr-1" /> Pause Run
                          </Button>
                        )}
                        {timeLogs.length > 0 && (
                          <div className="space-y-0.5 pt-0.5">
                            {timeLogs.filter(l => l.type === 'pause' || l.type === 'resume').slice(-5).map(log => (
                              <div key={log.id} className="flex items-center justify-between text-[10px] text-gray-400">
                                <span className={`font-medium capitalize ${log.type === 'pause' ? 'text-orange-500' : 'text-green-600'}`}>{log.type}</span>
                                <span>{format(new Date(log.timestamp), 'HH:mm')}</span>
                                {log.reason && <span className="truncate ml-1 italic max-w-[80px]">{log.reason}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Prove-Out tracking */}
                    {programs.some(p => p.proveOutRequired) && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                          <Settings className="w-3 h-3" /> Prove-Out
                        </p>
                        {executionOp.proveoutCompleted ? (
                          <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                            <CheckCircle className="w-3 h-3" /> Prove-Out Complete
                          </div>
                        ) : (
                          <Button size="sm" className="w-full h-7 text-xs bg-orange-500 hover:bg-orange-600" onClick={() => updateOperation.mutate({ id: executionOp.id, data: { proveoutCompleted: true } })}>
                            Mark Prove-Out Complete
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Operator notes */}
                    <div>
                      <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Operator Notes</Label>
                      <Textarea placeholder="Notes..." value={operatorNotes} onChange={e => setOperatorNotes(e.target.value)} className="text-xs min-h-[56px]" />
                      <Button size="sm" variant="outline" className="mt-1 h-6 text-xs w-full" onClick={() => handleSaveOperatorNotes(executionOp.id)}>
                        <Save className="w-3 h-3 mr-1" />Save Notes
                      </Button>
                    </div>

                    <Separator />

                    {/* Complete operation */}
                    <Button className="w-full h-8 text-xs" disabled={executionOp.status === 'complete' || updateOperation.isPending} onClick={() => handleCompleteOperation(executionOp.id)}>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {executionOp.status === 'complete' ? 'Op Complete ✓' : 'Mark Op Complete'}
                    </Button>
                    {executionOp.signedOffByDisplayName && (
                      <p className="text-xs text-gray-400 text-center">Signed off: {executionOp.signedOffByDisplayName}</p>
                    )}

                    {/* QC checkpoint entry in execution panel */}
                    {checkpoints.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />QC Checkpoints
                        </p>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                          {checkpoints.map(cp => {
                            const existingResult = getQcResultForCheckpoint(cp.id);
                            const entry = qcResultEntry[cp.id] ?? { result: '', measuredValue: '', notes: '', photoFile: null };
                            return (
                              <div key={cp.id} className="border rounded text-xs">
                                <div className={`px-2 py-1 flex items-center gap-1.5 rounded-t ${existingResult ? (existingResult.result === 'pass' ? 'bg-emerald-50' : 'bg-red-50') : (cp.required ? 'bg-amber-50' : 'bg-gray-50')}`}>
                                  {existingResult ? (existingResult.result === 'pass' ? '✓' : '✗') : (cp.required ? '⚠' : '○')}
                                  <span className="font-medium text-gray-800 flex-1 truncate">{cp.name}</span>
                                  {cp.required && !existingResult && <span className="text-red-600 text-[10px] font-bold flex-shrink-0">REQ</span>}
                                </div>
                                {existingResult ? (
                                  <div className="px-2 py-1 text-gray-500 space-y-0.5">
                                    <p className={`font-semibold ${existingResult.result === 'pass' ? 'text-emerald-700' : 'text-red-700'}`}>
                                      {existingResult.result === 'pass' ? '✓ PASS' : '✗ FAIL'}
                                      {existingResult.measuredValue && ` — ${existingResult.measuredValue}`}
                                    </p>
                                    {existingResult.notes && <p className="italic">{existingResult.notes}</p>}
                                  </div>
                                ) : (
                                  <div className="px-2 py-1.5 space-y-1.5">
                                    <Input
                                      placeholder={`Measured${cp.nominal ? ` (nom: ${cp.nominal})` : ''}`}
                                      value={entry.measuredValue}
                                      onChange={e => setQcResultEntry(prev => ({ ...prev, [cp.id]: { ...entry, measuredValue: e.target.value } }))}
                                      className="h-6 text-xs"
                                    />
                                    <Input
                                      placeholder="Notes..."
                                      value={entry.notes}
                                      onChange={e => setQcResultEntry(prev => ({ ...prev, [cp.id]: { ...entry, notes: e.target.value } }))}
                                      className="h-6 text-xs"
                                    />
                                    <div className="flex gap-1 items-center">
                                      <label className="text-[10px] text-gray-400 cursor-pointer flex items-center gap-0.5 flex-1 min-w-0">
                                        <Camera className="w-3 h-3 flex-shrink-0" />
                                        <input type="file" accept="image/*" className="hidden" onChange={e => setQcResultEntry(prev => ({ ...prev, [cp.id]: { ...entry, photoFile: e.target.files?.[0] ?? null } }))} />
                                        <span className="truncate">{entry.photoFile ? entry.photoFile.name : 'Photo'}</span>
                                      </label>
                                      <Button size="sm" className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 flex-shrink-0" onClick={() => handleQcResultWithPhoto(cp, executionOp.id, 'pass')}>Pass</Button>
                                      <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2 flex-shrink-0" onClick={() => handleQcResultWithPhoto(cp, executionOp.id, 'fail')}>Fail</Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Next operation link */}
                    {executionOp.status === 'complete' && (() => {
                      const sorted = [...operations].sort((a, b) => a.sequence - b.sequence);
                      const idx = sorted.findIndex(o => o.id === executionOp.id);
                      const next = sorted.slice(idx + 1).find(o => o.status !== 'complete');
                      return next ? (
                        <button className="w-full text-xs text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1" onClick={() => handleSelectOp(next)}>
                          <ArrowRight className="w-3 h-3" /> Next: Op {next.sequence} — {next.opName}
                        </button>
                      ) : null;
                    })()}
                  </>
                )}

                <Separator />

                {/* Complete Job */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" />Job Completion
                  </p>
                  {selectedJob.status === 'complete' ? (
                    <div className="text-center p-3 bg-emerald-50 rounded border border-emerald-200">
                      <CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                      <p className="text-xs font-semibold text-emerald-700">Job Complete</p>
                      {selectedJob.forwardDestination && <p className="text-xs text-emerald-600">→ {selectedJob.forwardDestination}</p>}
                    </div>
                  ) : (
                    <Button className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => setCompleteJobOpen(true)}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Complete Job
                    </Button>
                  )}
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}

      {/* Create Operation Batch */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create Partial Job / Batch This Step</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="rounded border bg-gray-50 px-2 py-1.5"><p className="text-gray-500">Work order</p><p className="font-semibold text-gray-800 truncate">{selectedJob?.workOrder ?? '-'}</p></div>
              <div className="rounded border bg-gray-50 px-2 py-1.5"><p className="text-gray-500">Routing step</p><p className="font-semibold text-gray-800 truncate">{travelerInfo?.currentStepNumber ? `Step ${travelerInfo.currentStepNumber}` : selectedJob?.linkedTravelerStepId ?? '-'}</p></div>
              <div className="rounded border bg-gray-50 px-2 py-1.5"><p className="text-gray-500">WO quantity</p><p className="font-semibold text-gray-800">{woQty}</p></div>
              <div className="rounded border bg-gray-50 px-2 py-1.5"><p className="text-gray-500">Step quantity</p><p className="font-semibold text-gray-800">{stepQty}</p></div>
              <div className="rounded border bg-gray-50 px-2 py-1.5"><p className="text-gray-500">Already batched</p><p className="font-semibold text-gray-800">{alreadyBatchedQty}</p></div>
              <div className="rounded border bg-emerald-50 border-emerald-100 px-2 py-1.5"><p className="text-emerald-700">Available</p><p className="font-semibold text-emerald-800">{availableToBatchQty}</p></div>
              <div className="rounded border bg-gray-50 px-2 py-1.5 col-span-2"><p className="text-gray-500">Selected operation</p><p className="font-semibold text-gray-800 truncate">{operations.find(o => o.id === batchOperationId)?.opName ?? 'No dashboard operation selected'}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Batch quantity</Label><Input type="number" min="1" value={batchForm.batchQty} onChange={e => setBatchForm(p => ({ ...p, batchQty: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div><Label className="text-xs">Number of batches</Label><Input type="number" min="1" value={batchForm.numberOfBatches} onChange={e => setBatchForm(p => ({ ...p, numberOfBatches: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div><Label className="text-xs">Machine</Label>
                <Select value={batchForm.machineId} onValueChange={v => setBatchForm(p => ({ ...p, machineId: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {activeMachines.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.machineName}{m.machineNumber ? ` - ${m.machineNumber}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Technician</Label>
                <Select value={batchForm.employeeId} onValueChange={v => setBatchForm(p => ({ ...p, employeeId: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select technician..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {activeEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Priority</Label>
                <Select value={batchForm.priority} onValueChange={v => setBatchForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Due date</Label><Input type="date" value={batchForm.dueDate} onChange={e => setBatchForm(p => ({ ...p, dueDate: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea value={batchForm.notes} onChange={e => setBatchForm(p => ({ ...p, notes: e.target.value }))} className="text-sm mt-1 min-h-[56px]" /></div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={batchForm.autoPrint} onChange={e => setBatchForm(p => ({ ...p, autoPrint: e.target.checked }))} />
              Auto-print barcode after create
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancel</Button>
            <Button disabled={createBatches.isPending || availableToBatchQty <= 0} onClick={handleCreateBatches}>
              {createBatches.isPending ? 'Creating...' : 'Create Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Operation Batch */}
      <Dialog open={!!assignBatch} onOpenChange={open => { if (!open) setAssignBatch(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Batch</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-semibold text-gray-800">{assignBatch?.batchCode}</p>
            <div><Label className="text-xs">Machine</Label>
              <Select value={assignForm.machineId} onValueChange={v => setAssignForm(p => ({ ...p, machineId: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {activeMachines.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.machineName}{m.machineNumber ? ` - ${m.machineNumber}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Technician</Label>
              <Select value={assignForm.employeeId} onValueChange={v => setAssignForm(p => ({ ...p, employeeId: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {activeEmployees.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea value={assignForm.notes} onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))} className="text-sm mt-1 min-h-[56px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignBatch(null)}>Cancel</Button>
            <Button disabled={assignOperationBatch.isPending} onClick={handleAssignBatch}>{assignOperationBatch.isPending ? 'Saving...' : 'Save Assignment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Barcode */}
      <Dialog open={!!barcodeBatch} onOpenChange={open => { if (!open) setBarcodeBatch(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Batch Barcode</DialogTitle></DialogHeader>
          {barcodeBatch && (
            <BarcodeDisplay
              orderId={barcodeBatch.batchCode}
              barcode={barcodeBatch.barcodeValue}
              showTitle
              size="medium"
              customerName={barcodeBatch.workOrderNumber}
              dueDate={barcodeBatch.dueDate ?? undefined}
              status={BATCH_STATUS_LABELS[barcodeBatch.status] ?? barcodeBatch.status}
              isHighPriority={barcodeBatch.priority === 'critical' || barcodeBatch.priority === 'high'}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* New Job */}
      <Dialog open={newJobOpen} onOpenChange={setNewJobOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create New CNC Job</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label className="text-xs">Work Order *</Label><Input value={newJobForm.workOrder} onChange={e => setNewJobForm(p => ({ ...p, workOrder: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Part Number *</Label><Input value={newJobForm.partNumber} onChange={e => setNewJobForm(p => ({ ...p, partNumber: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Part Name *</Label><Input value={newJobForm.partName} onChange={e => setNewJobForm(p => ({ ...p, partName: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Revision</Label><Input value={newJobForm.revision} onChange={e => setNewJobForm(p => ({ ...p, revision: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Quantity</Label><Input type="number" min="1" value={newJobForm.qty} onChange={e => setNewJobForm(p => ({ ...p, qty: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Machine</Label>
              <Select value={newJobForm.machine || '__none__'} onValueChange={v => setNewJobForm(p => ({ ...p, machine: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                <SelectContent>{activeMachines.map(m => <SelectItem key={m.id} value={m.machineName}>{m.machineName}{m.machineNumber ? ` — ${m.machineNumber}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Programmer</Label><Input value={newJobForm.programmerDisplayName} onChange={e => setNewJobForm(p => ({ ...p, programmerDisplayName: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Due Date</Label><Input type="date" value={newJobForm.dueDate} onChange={e => setNewJobForm(p => ({ ...p, dueDate: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Estimated Hours</Label><Input type="number" step="0.5" value={newJobForm.estimatedHours} onChange={e => setNewJobForm(p => ({ ...p, estimatedHours: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={newJobForm.priority} onValueChange={v => setNewJobForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs flex items-center gap-1"><LinkIcon className="w-3 h-3" />Linked Work Order / Traveler ID</Label>
              <div className="relative mt-1">
                <Input
                  value={newJobForm.linkedTravelerId}
                  onChange={e => {
                    const v = e.target.value;
                    setNewJobForm(p => ({ ...p, linkedTravelerId: v }));
                    setWoSearchQuery(v);
                    setWoSearchMode(true);
                  }}
                  onBlur={() => setTimeout(() => setWoSearchMode(false), 200)}
                  className="h-8 text-sm"
                  placeholder="Type order ID or customer PO to search..."
                />
                {woSearchMode && woSearchResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded shadow-md max-h-48 overflow-y-auto">
                    {woSearchResults.map(wo => (
                      <button
                        key={wo.workOrderId}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b last:border-0"
                        onClick={() => {
                          setNewJobForm(p => ({ ...p, linkedTravelerId: wo.workOrderId }));
                          setWoSearchMode(false);
                          setWoSearchQuery('');
                        }}
                      >
                        <span className="font-medium text-gray-800">{wo.workOrderId}</span>
                        {wo.customerPo && <span className="text-gray-500 ml-2 text-xs">PO: {wo.customerPo}</span>}
                        {wo.model && <span className="text-gray-400 ml-2 text-xs">{wo.model}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div><Label className="text-xs">Customer PO</Label><Input value={newJobForm.customerPo} onChange={e => setNewJobForm(p => ({ ...p, customerPo: e.target.value }))} className="h-8 text-sm mt-1" placeholder="Optional" /></div>
            <div className="col-span-2"><Label className="text-xs">Notes</Label><Textarea value={newJobForm.notes} onChange={e => setNewJobForm(p => ({ ...p, notes: e.target.value }))} className="text-sm mt-1 min-h-[56px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewJobOpen(false)}>Cancel</Button>
            <Button disabled={!newJobForm.workOrder || !newJobForm.partNumber || !newJobForm.partName || createJob.isPending} onClick={handleCreateJob}>
              {createJob.isPending ? 'Creating...' : 'Create Job'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Operation */}
      <Dialog open={newOpOpen} onOpenChange={setNewOpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Operation</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label className="text-xs">Sequence *</Label><Input type="number" placeholder="10, 20, 30..." value={newOpForm.sequence} onChange={e => setNewOpForm(p => ({ ...p, sequence: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Op Name *</Label><Input placeholder="e.g. Turn OD, Mill Face" value={newOpForm.opName} onChange={e => setNewOpForm(p => ({ ...p, opName: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="col-span-2"><Label className="text-xs">Description</Label><Textarea value={newOpForm.opDescription} onChange={e => setNewOpForm(p => ({ ...p, opDescription: e.target.value }))} className="text-sm mt-1 min-h-[48px]" placeholder="Brief description of this operation..." /></div>
            <div><Label className="text-xs">Machine</Label>
              <Select value={newOpForm.machine || '__none__'} onValueChange={v => setNewOpForm(p => ({ ...p, machine: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                <SelectContent>{activeMachines.map(m => <SelectItem key={m.id} value={m.machineName}>{m.machineName}{m.machineNumber ? ` — ${m.machineNumber}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Fixture</Label><Input value={newOpForm.fixture} onChange={e => setNewOpForm(p => ({ ...p, fixture: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Setup Time (min)</Label><Input type="number" value={newOpForm.estimatedSetupMinutes} onChange={e => setNewOpForm(p => ({ ...p, estimatedSetupMinutes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Cycle Time (min)</Label><Input type="number" value={newOpForm.estimatedCycleMinutes} onChange={e => setNewOpForm(p => ({ ...p, estimatedCycleMinutes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Std Labor (min)</Label><Input type="number" value={newOpForm.standardLaborMinutes} onChange={e => setNewOpForm(p => ({ ...p, standardLaborMinutes: e.target.value }))} className="h-8 text-sm mt-1" placeholder="Standard labor minutes" /></div>
            <div><Label className="text-xs">NC Program Reference</Label><Input value={newOpForm.ncProgramRef} onChange={e => setNewOpForm(p => ({ ...p, ncProgramRef: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Work Reference Point</Label><Input value={newOpForm.workRefPoint} onChange={e => setNewOpForm(p => ({ ...p, workRefPoint: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="col-span-2"><Label className="text-xs">Raw Stock Orientation</Label><Input value={newOpForm.rawStockOrientation} onChange={e => setNewOpForm(p => ({ ...p, rawStockOrientation: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="col-span-2"><Label className="text-xs">Datum Notes</Label><Input value={newOpForm.datumNotes} onChange={e => setNewOpForm(p => ({ ...p, datumNotes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="col-span-2"><Label className="text-xs">Warmup / Run-in Notes</Label><Input value={newOpForm.warmupNotes} onChange={e => setNewOpForm(p => ({ ...p, warmupNotes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpOpen(false)}>Cancel</Button>
            <Button disabled={!newOpForm.opName || createOperation.isPending} onClick={handleCreateOperation}>
              {createOperation.isPending ? 'Adding...' : 'Add Operation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Tool */}
      <Dialog open={newToolOpen} onOpenChange={setNewToolOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Tool</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-3">
              <div className="w-24"><Label className="text-xs">Tool # *</Label><Input value={newToolForm.toolNumber} onChange={e => setNewToolForm(p => ({ ...p, toolNumber: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div className="flex-1"><Label className="text-xs">Holder Position</Label><Input value={newToolForm.holderPosition} onChange={e => setNewToolForm(p => ({ ...p, holderPosition: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div><Label className="text-xs">Tool Name *</Label><Input value={newToolForm.toolName} onChange={e => setNewToolForm(p => ({ ...p, toolName: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Diameter (in)</Label><Input type="number" step="0.0001" value={newToolForm.diameter} onChange={e => setNewToolForm(p => ({ ...p, diameter: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Offset Notes</Label><Input value={newToolForm.offsetNotes} onChange={e => setNewToolForm(p => ({ ...p, offsetNotes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Replacement Notes</Label><Input value={newToolForm.replacementNotes} onChange={e => setNewToolForm(p => ({ ...p, replacementNotes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Camera className="w-3 h-3" />Tool Image</Label>
              <label className="mt-1 flex items-center gap-2 cursor-pointer border rounded h-8 px-2 text-sm text-gray-600 hover:bg-gray-50">
                <Camera className="w-3 h-3 flex-shrink-0 text-gray-400" />
                <span className="truncate flex-1 text-xs">{toolImageFile ? toolImageFile.name : 'Choose image file...'}</span>
                <input type="file" accept="image/*" className="hidden" onChange={e => setToolImageFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewToolOpen(false)}>Cancel</Button>
            <Button disabled={!newToolForm.toolNumber || !newToolForm.toolName || createTool.isPending || toolImageUploading} onClick={handleAddTool}>
              {toolImageUploading ? 'Uploading...' : createTool.isPending ? 'Adding...' : 'Add Tool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Program */}
      <Dialog open={newProgramOpen} onOpenChange={setNewProgramOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add NC Program</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Program Name *</Label><Input value={newProgramForm.programName} onChange={e => setNewProgramForm(p => ({ ...p, programName: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="flex gap-3">
              <div className="flex-1"><Label className="text-xs">Program Number</Label><Input value={newProgramForm.programNumber} onChange={e => setNewProgramForm(p => ({ ...p, programNumber: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div className="flex-1"><Label className="text-xs">Version</Label><Input value={newProgramForm.version} onChange={e => setNewProgramForm(p => ({ ...p, version: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div><Label className="text-xs">Machine</Label>
              <Select value={newProgramForm.machine || '__none__'} onValueChange={v => setNewProgramForm(p => ({ ...p, machine: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                <SelectContent>{activeMachines.map(m => <SelectItem key={m.id} value={m.machineName}>{m.machineName}{m.machineNumber ? ` — ${m.machineNumber}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Est. Cycle Time (min)</Label><Input type="number" value={newProgramForm.estimatedCycleMinutes} onChange={e => setNewProgramForm(p => ({ ...p, estimatedCycleMinutes: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="proveout" checked={newProgramForm.proveOutRequired} onChange={e => setNewProgramForm(p => ({ ...p, proveOutRequired: e.target.checked }))} />
              <Label htmlFor="proveout" className="text-xs cursor-pointer">Prove-Out Required</Label>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea value={newProgramForm.notes} onChange={e => setNewProgramForm(p => ({ ...p, notes: e.target.value }))} className="text-sm mt-1 min-h-[56px]" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewProgramOpen(false)}>Cancel</Button>
            <Button disabled={!newProgramForm.programName || createProgram.isPending} onClick={() => {
              if (!selectedOpId) return;
              const payload: CreateProgramPayload = {
                operationId: selectedOpId,
                programName: newProgramForm.programName,
                programNumber: newProgramForm.programNumber || null,
                version: newProgramForm.version || null,
                machine: newProgramForm.machine || null,
                estimatedCycleMinutes: newProgramForm.estimatedCycleMinutes ? parseFloat(newProgramForm.estimatedCycleMinutes) : null,
                proveOutRequired: newProgramForm.proveOutRequired,
                notes: newProgramForm.notes || null,
              };
              createProgram.mutate(payload);
            }}>
              {createProgram.isPending ? 'Adding...' : 'Add Program'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New QC Checkpoint */}
      <Dialog open={newCheckpointOpen} onOpenChange={setNewCheckpointOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add QC Checkpoint</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label className="text-xs">Checkpoint Name *</Label><Input value={newCheckpointForm.name} onChange={e => setNewCheckpointForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">Characteristic</Label><Input value={newCheckpointForm.characteristic} onChange={e => setNewCheckpointForm(p => ({ ...p, characteristic: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            <div className="flex gap-3">
              <div className="flex-1"><Label className="text-xs">Nominal</Label><Input value={newCheckpointForm.nominal} onChange={e => setNewCheckpointForm(p => ({ ...p, nominal: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div className="flex-1"><Label className="text-xs">Tolerance</Label><Input placeholder="±0.001" value={newCheckpointForm.tolerance} onChange={e => setNewCheckpointForm(p => ({ ...p, tolerance: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1"><Label className="text-xs">Method</Label><Input placeholder="Caliper, CMM..." value={newCheckpointForm.method} onChange={e => setNewCheckpointForm(p => ({ ...p, method: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div className="flex-1"><Label className="text-xs">Frequency</Label><Input placeholder="Every part, 1st off..." value={newCheckpointForm.frequency} onChange={e => setNewCheckpointForm(p => ({ ...p, frequency: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="req-check" checked={newCheckpointForm.required} onChange={e => setNewCheckpointForm(p => ({ ...p, required: e.target.checked }))} />
              <Label htmlFor="req-check" className="text-xs cursor-pointer">Required (blocks operation completion)</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="photo-req" checked={newCheckpointForm.photoRequired} onChange={e => setNewCheckpointForm(p => ({ ...p, photoRequired: e.target.checked }))} />
              <Label htmlFor="photo-req" className="text-xs cursor-pointer flex items-center gap-1"><Camera className="w-3 h-3 text-blue-500" />Require photo before recording result</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="sig-req" checked={newCheckpointForm.signatureRequired} onChange={e => setNewCheckpointForm(p => ({ ...p, signatureRequired: e.target.checked }))} />
              <Label htmlFor="sig-req" className="text-xs cursor-pointer flex items-center gap-1"><User className="w-3 h-3 text-purple-500" />Require operator claim (signature) to record</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCheckpointOpen(false)}>Cancel</Button>
            <Button disabled={!newCheckpointForm.name || createCheckpoint.isPending} onClick={() => {
              if (!selectedOpId) return;
              const payload: CreateCheckpointPayload = {
                operationId: selectedOpId,
                name: newCheckpointForm.name,
                characteristic: newCheckpointForm.characteristic || null,
                nominal: newCheckpointForm.nominal || null,
                tolerance: newCheckpointForm.tolerance || null,
                method: newCheckpointForm.method || null,
                frequency: newCheckpointForm.frequency || null,
                required: newCheckpointForm.required,
                photoRequired: newCheckpointForm.photoRequired,
                signatureRequired: newCheckpointForm.signatureRequired,
              };
              createCheckpoint.mutate(payload);
            }}>
              {createCheckpoint.isPending ? 'Adding...' : 'Add Checkpoint'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pause Run Dialog */}
      <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pause Run</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-gray-600">Enter a reason for pausing production. The run will be logged.</p>
            <Textarea
              placeholder="Reason for pausing (required)..."
              value={pauseLogReason}
              onChange={e => setPauseLogReason(e.target.value)}
              className="text-sm min-h-[72px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseDialogOpen(false)}>Cancel</Button>
            <Button disabled={!pauseLogReason} className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => {
              if (!executionOp) return;
              createTimeLog.mutate({ operationId: executionOp.id, type: 'pause', reason: pauseLogReason });
              updateOperation.mutate({ id: executionOp.id, data: { pauseReason: pauseLogReason } });
              setPauseDialogOpen(false);
            }}>
              <PauseCircle className="w-3 h-3 mr-1" /> Pause Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QC Hold Dialog */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Place Operation on QC Hold</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-gray-600">Optionally describe the hold reason. The operation will be paused until released.</p>
            <Textarea
              placeholder="Hold reason (optional)..."
              value={holdReason}
              onChange={e => setHoldReason(e.target.value)}
              className="text-sm min-h-[72px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              if (!executionOp) return;
              updateOperation.mutate({ id: executionOp.id, data: { status: 'hold', pauseReason: holdReason || null } });
              setHoldDialogOpen(false);
            }}>
              Place on Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Job */}
      <Dialog open={completeJobOpen} onOpenChange={setCompleteJobOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Complete Job</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-gray-600">Where is this job going after completion?</p>
            <Select value={forwardDestination} onValueChange={setForwardDestination}>
              <SelectTrigger><SelectValue placeholder="Select forward destination..." /></SelectTrigger>
              <SelectContent>{FORWARD_DESTINATIONS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteJobOpen(false)}>Cancel</Button>
            <Button disabled={!forwardDestination} className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCompleteJob}>
              <CheckCircle className="w-4 h-4 mr-1" />Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Machine Add/Edit Dialog ─────────────────────────────────────── */}
      <Dialog open={machineDialogOpen} onOpenChange={open => { setMachineDialogOpen(open); if (!open) setMachineDialogMachine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{machineDialogMachine ? 'Edit Machine' : 'Add Machine'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <Label className="text-xs">Machine Name *</Label>
              <Input
                className="h-8 text-sm mt-1"
                value={machineForm.machineName}
                onChange={e => setMachineForm(p => ({ ...p, machineName: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Machine Number *</Label>
              <Input
                className="h-8 text-sm mt-1"
                placeholder="e.g. CNC-01, VF2-01"
                value={machineForm.machineNumber}
                onChange={e => setMachineForm(p => ({ ...p, machineNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Machine Type</Label>
              <Select value={machineForm.machineType} onValueChange={v => { setMachineForm(p => ({ ...p, machineType: v })); if (v !== 'Other') setMachineTypeCustom(''); }}>
                <SelectTrigger className="h-8 text-sm mt-1">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {CNC_MACHINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {machineForm.machineType === 'Other' && (
                <Input
                  className="h-8 text-sm mt-2"
                  placeholder="Enter custom machine type…"
                  value={machineTypeCustom}
                  onChange={e => setMachineTypeCustom(e.target.value)}
                />
              )}
            </div>
            <div>
              <Label className="text-xs">Capability</Label>
              <textarea
                className="w-full mt-1 text-sm border border-input rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                placeholder="Describe what this machine can do…"
                value={machineForm.capability}
                onChange={e => setMachineForm(p => ({ ...p, capability: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="machine-active"
                checked={machineForm.active}
                onChange={e => setMachineForm(p => ({ ...p, active: e.target.checked }))}
                className="w-4 h-4"
              />
              <Label htmlFor="machine-active" className="text-xs cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMachineDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={!machineForm.machineName.trim() || !machineForm.machineNumber.trim() || (machineForm.machineType === 'Other' && !machineTypeCustom.trim()) || saveMachine.isPending}
              onClick={() => saveMachine.mutate({
                id: machineDialogMachine?.id,
                data: {
                  machineName: machineForm.machineName.trim(),
                  machineNumber: machineForm.machineNumber.trim() || null,
                  machineType: machineForm.machineType === 'Other'
                    ? machineTypeCustom.trim()
                    : (machineForm.machineType || null),
                  capabilities: machineForm.capability.trim() || null,
                  active: machineForm.active,
                },
              })}
            >
              {saveMachine.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Machine Delete Confirmation ─────────────────────────────────── */}
      <Dialog open={!!machineDeleteConfirm} onOpenChange={open => { if (!open) setMachineDeleteConfirm(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>Delete Machine</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Delete <span className="font-semibold">{machineDeleteConfirm?.machineName}</span>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMachineDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMachine.isPending}
              onClick={() => machineDeleteConfirm && deleteMachine.mutate(machineDeleteConfirm.id)}
            >
              {deleteMachine.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

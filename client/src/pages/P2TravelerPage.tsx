import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Scan,
  User,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  ArrowRight,
  AlertCircle,
  Clipboard,
  ClipboardCheck,
  QrCode,
  FileText,
  Loader2,
  Camera,
  BookOpen,
  Lightbulb,
  ExternalLink,
  Flame,
  Thermometer,
  Timer,
  X,
  Plus,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CameraScanner } from '@/components/CameraScanner';
import StartProductionTimerModal from '@/components/StartProductionTimerModal';

const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

type ScanState = 'READY' | 'BADGE_SCANNED' | 'PART_SCANNED' | 'GENERATING_TRAVELER' | 'TASK_ACTIVE';

interface Employee {
  id: number;
  employeeCode: string;
  name: string;
}

interface SerializedItem {
  id: string;
  barcode: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  customerName: string;
  currentDepartment: string;
  currentStageIndex: number;
  status: string;
}

interface TraceabilityRequirement {
  type: string;
  label: string;
}

interface MaterialRequirement {
  partId: string;
  partNumber: string;
  partName: string;
  requiredFields: string[];
}

interface QCStandard {
  standard: string;
  tolerance: string;
  requirement: string;
  referenceLink?: string;
}

interface OvenCuringStep {
  temperature: string;
  time: string;
}

interface InstructionPack {
  workInstructionRefs?: Array<{ documentId: string; title?: string; pageRange?: string; anchor?: string }>;
  aiSnippets?: Array<{ title: string; bullets: string[]; sourceDocumentId?: string; confidence?: number }>;
  specialNotes?: string;
  media?: Array<{ type: 'image' | 'pdf'; documentId: string; caption?: string }>;
}

interface PhaseCheck {
  title: string;
  instructions?: string;
  required: boolean;
  taskType: 'CHECK' | 'PROCESS' | 'QC' | 'TRACEABILITY' | 'DOCUMENT' | 'SIGNATURE';
  timePolicy: 'AUTO_ON_START' | 'AUTO_ON_COMPLETE' | 'MANUAL_ENTRY';
  requiresSignature: boolean;
  signatureRole?: 'OPERATOR' | 'LEAD' | 'QC' | 'ENGINEERING' | 'CUSTOM';
  requiresCertification: boolean;
  hardQcStop?: boolean;
  instructionPack?: InstructionPack;
}

interface CustomDataField {
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'textarea';
  isRequired: boolean;
}

interface SignatureConfig {
  startRequiresSignature: boolean;
  finishRequiresSignature: boolean;
  requiredSignatures: string[];
}

interface StandardProcessConfig {
  processName: string;
  notes: string;
  requiredTechnicianId: number | null;
  materials: MaterialRequirement[];
  qcStandards: QCStandard[];
  customDataFields: CustomDataField[];
}

interface StandardProcess {
  name: string;
  description: string;
  config?: StandardProcessConfig;
}

interface SpecialProcessConfig {
  processName: string;
  notes: string;
  requiredTechnicianId: number | null;
  materials: MaterialRequirement[];
  qcStandards: QCStandard[];
  customDataFields: CustomDataField[];
}

interface TimerConfig {
  enabled: boolean;
  defaultProgramId?: string;
  defaultProgramName?: string;
}

interface DepartmentConfig {
  materials?: MaterialRequirement[];
  customDataFields?: CustomDataField[];
  startCustomDataFields?: CustomDataField[];
  finishCustomDataFields?: CustomDataField[];
  qcStandards?: QCStandard[];
  startQcStandards?: QCStandard[];
  finishQcStandards?: QCStandard[];
  startChecks?: PhaseCheck[];
  workChecks?: PhaseCheck[];
  finishChecks?: PhaseCheck[];
  allowMultipleTasks?: boolean;
  instructionPack?: InstructionPack;
  ovenCuringSteps?: OvenCuringStep[];
  standardProcesses?: StandardProcess[];
  specialProcess?: string;
  specialProcessConfig?: SpecialProcessConfig;
  signatureConfig?: SignatureConfig;
  timerConfig?: TimerConfig;
}

interface VerificationData {
  employee: Employee;
  serializedItem: SerializedItem;
  nextDepartment: string;
  isCertified: boolean;
  departmentConfig: DepartmentConfig;
  traceabilityRequirements: TraceabilityRequirement[];
  routing: {
    id: string;
    departmentSequence: string[];
    currentStageIndex: number;
  };
}

interface ActiveTask {
  id: string;
  barcode: string;
  partNumber: string;
  partName: string;
  department: string;
  startedAt: string;
}

function isWithinTolerance(measuredValue: string, tolerance: string, requirement: string): boolean | null {
  if (!measuredValue.trim() || !tolerance) return null;
  const val = measuredValue.trim().toLowerCase();
  const tol = tolerance.trim().toLowerCase();

  if (tol === 'n/a' || tol === 'for record only') return true;

  if (tol === 'y/n' || tol === 'yes/no') {
    return val === 'y' || val === 'yes';
  }
  if (tol === 'pass/fail' || tol === 'pass/ fail') {
    return val === 'pass' || val === 'p';
  }
  if (tol === 'go/no go' || tol === 'go / no go' || tol === 'go/nogo') {
    return val === 'go' || val === 'yes' || val === 'pass';
  }

  const numVal = parseFloat(val.replace(/[^0-9.\-]/g, ''));
  if (isNaN(numVal)) return null;

  const rangeMatch = tol.match(/^(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)$/);
  if (rangeMatch) {
    const lo = parseFloat(rangeMatch[1]);
    const hi = parseFloat(rangeMatch[2]);
    return numVal >= lo && numVal <= hi;
  }

  const reqRange = (requirement || '').trim().match(/^(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)$/);
  if (reqRange) {
    const lo = parseFloat(reqRange[1]);
    const hi = parseFloat(reqRange[2]);
    return numVal >= lo && numVal <= hi;
  }

  const pmMatch = tol.match(/[+±]\/?-?\s*\.?(\d+\.?\d*)/);
  if (pmMatch) {
    const dev = parseFloat(pmMatch[1]);
    const reqVal = parseFloat((requirement || '').replace(/[^0-9.\-]/g, ''));
    if (!isNaN(reqVal)) {
      return numVal >= (reqVal - dev) && numVal <= (reqVal + dev);
    }
  }

  const minMatch = tol.match(/min(?:imum)?\s*(\d+\.?\d*)/i);
  if (minMatch) {
    return numVal >= parseFloat(minMatch[1]);
  }

  if (tol.match(/level\s/i)) {
    const levelMatch = val.match(/level\s*(\w+)/i) || val.match(/^(\w+)$/i);
    const tolLevel = tol.match(/level\s*(\w+)/i);
    if (levelMatch && tolLevel) {
      const levelOrder: Record<string, number> = { 'i': 1, 'ii': 2, 'iii': 3, '1': 1, '2': 2, '3': 3 };
      const measuredLevel = levelOrder[levelMatch[1].toLowerCase()] ?? 99;
      const maxLevel = levelOrder[tolLevel[1].toLowerCase()] ?? 99;
      return measuredLevel <= maxLevel;
    }
  }

  return null;
}

export default function P2TravelerPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [scanState, setScanState] = useState<ScanState>('READY');
  const [badgeInput, setBadgeInput] = useState('');
  const [partInput, setPartInput] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null);
  
  // Traceability and custom data states
  const [traceabilityData, setTraceabilityData] = useState<Array<{
    inventoryPartId?: string;
    inventoryPartNumber?: string;
    materialIndex?: number;
    materialLabel?: string;
    builtPacketId?: number;
    packetBarcode?: string;
    fabricSourceCount?: number;
    type: string;
    label: string;
    value: string;
  }>>([]);
  const [customData, setCustomData] = useState<Record<string, string>>({});
  const [qcResults, setQcResults] = useState<Array<{
    standard: string;
    tolerance: string;
    requirement: string;
    measuredValue: string;
    passed: boolean | null;
    referenceLink?: string;
  }>>([]);
  const [startQcResults, setStartQcResults] = useState<Array<{
    standard: string;
    tolerance: string;
    requirement: string;
    measuredValue: string;
    passed: boolean | null;
    referenceLink?: string;
  }>>([]);
  const [finishQcResults, setFinishQcResults] = useState<Array<{
    standard: string;
    tolerance: string;
    requirement: string;
    measuredValue: string;
    passed: boolean | null;
    referenceLink?: string;
  }>>([]);
  const [notes, setNotes] = useState('');
  const [traceabilityMode, setTraceabilityMode] = useState<'scan' | 'manual'>('scan');
  const [pendingFocusMaterialIndex, setPendingFocusMaterialIndex] = useState<number | null>(null);
  const [, setValidatedMaterialIndices] = useState<Set<number>>(new Set());
  const validateAbortControllersRef = useRef<Map<number, AbortController>>(new Map());
  const latestValidationIcnRef = useRef<Map<number, string>>(new Map());
  const [cameraTarget, setCameraTarget] = useState<'badge' | 'part' | null>(null);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showOvenModal, setShowOvenModal] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showNotesPanel, setShowNotesPanel] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editTraceData, setEditTraceData] = useState<Array<{ type: string; label: string; value: string; inventoryPartId?: string; inventoryPartNumber?: string }>>([]);
  const [editCustomData, setEditCustomData] = useState<Record<string, string>>({});
  const [editQcResults, setEditQcResults] = useState<Array<{ standard: string; tolerance: string; requirement: string; measuredValue: string; passed: boolean | null }>>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [ovenData, setOvenData] = useState({
    ovenId: '',
    cycleNumber: '',
    targetTemperature: '',
    actualTemperature: '',
    targetDuration: '',
    actualDuration: '',
    rampUpTime: '',
    result: 'PENDING' as 'PENDING' | 'PASS' | 'FAIL',
    notes: '',
  });

  // Get active tasks for current employee
  const { data: activeTasks } = useQuery<ActiveTask[]>({
    queryKey: ['/api/p2-traveler/active-tasks', employee?.id],
    enabled: !!employee?.id,
  });

  const { data: itemNotes, refetch: refetchNotes } = useQuery<any[]>({
    queryKey: ['/api/p2-traveler/notes', verificationData?.serializedItem?.id],
    enabled: !!verificationData?.serializedItem?.id,
  });

  const addNoteMutation = useMutation({
    mutationFn: async () => {
      if (!verificationData?.serializedItem?.id || !newNote.trim()) return;
      return apiRequest(`/api/p2-traveler/add-note/${verificationData.serializedItem.id}`, {
        method: 'POST',
        body: JSON.stringify({
          note: newNote.trim(),
          department: activeTask?.department || verificationData.nextDepartment,
          addedBy: employee?.employeeCode || badgeInput,
          addedByName: employee?.name || badgeInput,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Note Added', description: 'Your note has been saved' });
      setNewNote('');
      refetchNotes();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const loadEditData = async () => {
    if (!verificationData?.serializedItem?.id || !activeTask?.department) return;
    setEditLoading(true);
    try {
      const resp = await fetch(`/api/p2-traveler/department-data/${verificationData.serializedItem.id}/${encodeURIComponent(activeTask.department)}`);
      if (resp.ok) {
        const data = await resp.json();
        setEditTraceData(data.traceabilityData || []);
        setEditCustomData(data.customData || {});
        setEditQcResults(data.qcResults || []);
      }
    } catch (e) {
      console.error('Failed to load edit data:', e);
    }
    setEditLoading(false);
    setShowEditDialog(true);
  };

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!verificationData?.serializedItem?.id || !activeTask?.department) return;
      return apiRequest(`/api/p2-traveler/edit-department-data/${verificationData.serializedItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          department: activeTask.department,
          traceabilityData: editTraceData.length > 0 ? editTraceData : undefined,
          customData: Object.keys(editCustomData).length > 0 ? editCustomData : undefined,
          qcResults: editQcResults.length > 0 ? editQcResults : undefined,
          editedBy: employee?.employeeCode || badgeInput,
          editedByName: employee?.name || badgeInput,
          isAdmin: false,
        }),
      });
    },
    onSuccess: (data: any) => {
      toast({ title: 'Data Updated', description: data?.message || 'Changes saved successfully' });
      setShowEditDialog(false);
    },
    onError: (error: any) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Reset handler
  const resetScanner = () => {
    setScanState('READY');
    setBadgeInput('');
    setPartInput('');
    setEmployee(null);
    setVerificationData(null);
    setActiveTask(null);
    setTraceabilityData([]);
    setCustomData({});
    setQcResults([]);
    setStartQcResults([]);
    setFinishQcResults([]);
    setOperationScanValue('');
    setCompletionOperationScanValue('');
    setNotes('');
    setTraceabilityMode('scan');
    setValidatedMaterialIndices(new Set());
    setPendingFocusMaterialIndex(null);
    setShowOvenModal(false);
    setOvenData({
      ovenId: '', cycleNumber: '', targetTemperature: '', actualTemperature: '',
      targetDuration: '', actualDuration: '', rampUpTime: '', result: 'PENDING', notes: '',
    });
  };

  // Oven cure log mutation
  const ovenCureMutation = useMutation({
    mutationFn: async () => {
      if (!verificationData) throw new Error('No verification data');
      const item = verificationData.serializedItem;
      return await apiRequest('/api/p2-traveler-viewer/oven-cure-log', {
        method: 'POST',
        body: JSON.stringify({
          serializedItemId: item.id,
          barcode: item.barcode,
          partNumber: item.partNumber,
          department: verificationData.nextDepartment,
          ovenId: ovenData.ovenId || null,
          cycleNumber: ovenData.cycleNumber || null,
          targetTemperature: ovenData.targetTemperature ? parseFloat(ovenData.targetTemperature) : null,
          actualTemperature: ovenData.actualTemperature ? parseFloat(ovenData.actualTemperature) : null,
          targetDuration: ovenData.targetDuration ? parseInt(ovenData.targetDuration) : null,
          actualDuration: ovenData.actualDuration ? parseInt(ovenData.actualDuration) : null,
          rampUpTime: ovenData.rampUpTime ? parseInt(ovenData.rampUpTime) : null,
          startTime: new Date().toISOString(),
          result: ovenData.result,
          operatorId: employee?.id || null,
          operatorName: employee?.name || null,
          notes: ovenData.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Oven Cure Logged', description: 'Oven cure record saved successfully.' });
      setShowOvenModal(false);
      setOvenData({
        ovenId: '', cycleNumber: '', targetTemperature: '', actualTemperature: '',
        targetDuration: '', actualDuration: '', rampUpTime: '', result: 'PENDING', notes: '',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to Log Oven Cure', description: error.message, variant: 'destructive' });
    },
  });

  // Handle badge scan
  const handleBadgeScan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!badgeInput.trim()) {
      toast({
        title: 'Error',
        description: 'Please scan or enter employee badge code',
        variant: 'destructive',
      });
      return;
    }

    try {
      const encodedBadge = encodeURIComponent(badgeInput.trim());
      const data = await apiRequest(`/api/p2-traveler/badge-lookup/${encodedBadge}`) as Employee;
      setEmployee(data);
      setScanState('BADGE_SCANNED');
      toast({
        title: 'Badge Scanned',
        description: `Welcome, ${data.name}. Now scan the part barcode.`,
      });
    } catch (error: any) {
      toast({
        title: 'Badge Not Found',
        description: error.message || 'No employee found with that badge code',
        variant: 'destructive',
      });
    }
  };

  // Handle part scan
  const handlePartScan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partInput.trim()) {
      toast({
        title: 'Error',
        description: 'Please scan or enter part barcode',
        variant: 'destructive',
      });
      return;
    }

    try {
      const encodedBadge = encodeURIComponent(badgeInput.trim());
      const encodedPartBarcode = encodeURIComponent(partInput.trim());
      const data = await apiRequest(
        `/api/p2-traveler/verify-certification/${encodedBadge}/${encodedPartBarcode}`
      ) as VerificationData;

      setEmployee(data.employee);
      setVerificationData(data);

      if (!data.isCertified) {
        toast({
          title: 'Not Certified',
          description: `${data.employee.name} is not certified for ${data.nextDepartment}`,
          variant: 'destructive',
        });
        return;
      }

      // Initialize traceability fields based on requirements
      const initialTraceability: any[] = [];
      const materialFieldTypes = new Set<string>();
      
      // Add material requirements - tag each with material index for grouping
      if (data.departmentConfig.materials) {
        data.departmentConfig.materials.forEach((material: MaterialRequirement, matIdx: number) => {
          material.requiredFields.forEach((fieldType: string) => {
            materialFieldTypes.add(fieldType);
            initialTraceability.push({
              inventoryPartId: material.partId,
              inventoryPartNumber: material.partNumber,
              materialIndex: matIdx,
              materialLabel: material.partName || material.partNumber || `Material ${matIdx + 1}`,
              type: fieldType,
              label: `${material.partName} - ${fieldType.replace(/_/g, ' ').toUpperCase()}`,
              value: '',
            });
          });
        });
      }

      // Add general traceability requirements (skip any already covered by materials
      // and skip auto-generated metadata fields like 'operator' and 'timestamp')
      const nonMaterialTraceFields = new Set(['operator', 'timestamp']);
      if (data.traceabilityRequirements) {
        data.traceabilityRequirements.forEach((req: any) => {
          if (typeof req === 'string' && !materialFieldTypes.has(req) && !nonMaterialTraceFields.has(req)) {
            initialTraceability.push({
              type: req,
              label: req.replace(/_/g, ' ').toUpperCase(),
              value: '',
            });
          }
        });
      }

      setTraceabilityData(initialTraceability);

      // Initialize custom data fields from all phases (each shown in its own section)
      // Deduplicate: if the same fieldName appears in multiple phase arrays, keep it only in the first phase
      const startFields = data.departmentConfig.startCustomDataFields || [];
      const hasPhaseSpecificFields = (data.departmentConfig.startCustomDataFields && data.departmentConfig.startCustomDataFields.length > 0) || (data.departmentConfig.finishCustomDataFields && data.departmentConfig.finishCustomDataFields.length > 0);
      const workFields = hasPhaseSpecificFields ? [] : (data.departmentConfig.customDataFields || []);
      const finishFields = data.departmentConfig.finishCustomDataFields || [];
      const seenFieldNames = new Set<string>();
      startFields.forEach((f: CustomDataField) => seenFieldNames.add(f.fieldName));
      const dedupedWorkFields = workFields.filter((f: CustomDataField) => !seenFieldNames.has(f.fieldName));
      dedupedWorkFields.forEach((f: CustomDataField) => seenFieldNames.add(f.fieldName));
      const dedupedFinishFields = finishFields.filter((f: CustomDataField) => !seenFieldNames.has(f.fieldName));
      data.departmentConfig._dedupedWorkFields = dedupedWorkFields;
      data.departmentConfig._dedupedFinishFields = dedupedFinishFields;

      const allCustomDataFields: CustomDataField[] = [
        ...startFields,
        ...dedupedWorkFields,
        ...dedupedFinishFields,
      ];
      if (allCustomDataFields.length > 0) {
        const initialCustomData: Record<string, string> = {};
        allCustomDataFields.forEach((field: CustomDataField) => {
          if (!(field.fieldName in initialCustomData)) {
            initialCustomData[field.fieldName] = '';
          }
        });
        setCustomData(initialCustomData);
      }

      const initQcArray = (standards: QCStandard[]) => {
        const seen = new Set<string>();
        return standards.filter(qc => {
          const key = `${qc.standard}|${qc.tolerance}|${qc.requirement}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).map((qc: any) => ({
          standard: qc.standard,
          tolerance: qc.tolerance || '',
          requirement: qc.requirement || '',
          measuredValue: '',
          passed: null,
          ...(qc.referenceLink ? { referenceLink: qc.referenceLink } : {}),
        }));
      };

      const startQcStandards: QCStandard[] = data.departmentConfig.startQcStandards || [];
      const finishQcStandards: QCStandard[] = data.departmentConfig.finishQcStandards || [];
      const workQcStandards: QCStandard[] = data.departmentConfig.qcStandards || [];

      // Deduplicate QC standards across phases (same standard+tolerance+requirement = duplicate)
      const seenQcKeys = new Set<string>();
      startQcStandards.forEach(qc => seenQcKeys.add(`${qc.standard}|${qc.tolerance}|${qc.requirement}`));
      const dedupedWorkQc = workQcStandards.filter(qc => !seenQcKeys.has(`${qc.standard}|${qc.tolerance}|${qc.requirement}`));
      dedupedWorkQc.forEach(qc => seenQcKeys.add(`${qc.standard}|${qc.tolerance}|${qc.requirement}`));
      const dedupedFinishQc = finishQcStandards.filter(qc => !seenQcKeys.has(`${qc.standard}|${qc.tolerance}|${qc.requirement}`));

      if (dedupedWorkQc.length > 0) {
        setQcResults(initQcArray(dedupedWorkQc));
      }

      if (startQcStandards.length > 0) {
        setStartQcResults(initQcArray(startQcStandards));
      }

      if (dedupedFinishQc.length > 0) {
        setFinishQcResults(initQcArray(dedupedFinishQc));
      }

      setScanState('PART_SCANNED');

      if (data.isCertified && data.routing?.id) {
        setScanState('GENERATING_TRAVELER');
        toast({
          title: 'Part Verified',
          description: 'Generating full traveler from routing...',
        });

        try {
          const travelerResult = await apiRequest('/api/p2-traveler/generate-traveler', {
            method: 'POST',
            body: JSON.stringify({
              serializedItemId: data.serializedItem.id,
              employeeCode: badgeInput,
            }),
          }) as { travelerId: string; travelerNumber: string; created: boolean };

          toast({
            title: travelerResult.created ? 'Traveler Generated' : 'Traveler Found',
            description: `Opening traveler ${travelerResult.travelerNumber}`,
          });

          navigate(`/travelers/${travelerResult.travelerId}/execute?badge=${encodeURIComponent(badgeInput.trim())}`);
          return;
        } catch (genError: any) {
          console.warn('Could not generate traveler from routing, falling back to simple mode:', genError);
          setScanState('PART_SCANNED');
          toast({
            title: 'Traveler Generation Failed',
            description: 'Falling back to simple task mode. ' + (genError?.message || ''),
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Part Verified',
          description: `Ready to start task in ${data.nextDepartment}`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Failed to verify part',
        variant: 'destructive',
      });
    }
  };

  // Start task mutation
  const startTaskMutation = useMutation({
    mutationFn: async () => {
      if (!verificationData) throw new Error('No verification data');

      // Traceability data is optional - only send filled-in fields
      // Do NOT block task start when traceability fields are empty

      // Validate required custom data across all phase-specific fields
      const allPhaseFields: CustomDataField[] = [
        ...(verificationData.departmentConfig.startCustomDataFields || []),
        ...(verificationData.departmentConfig.finishCustomDataFields || []),
      ];
      const hasPhaseSpecific = allPhaseFields.length > 0;
      if (!hasPhaseSpecific && verificationData.departmentConfig.customDataFields) {
        allPhaseFields.push(...verificationData.departmentConfig.customDataFields);
      }
      if (allPhaseFields.length > 0) {
        const missingCustom = allPhaseFields.filter(
          field => field.isRequired && !customData[field.fieldName]?.trim()
        );
        if (missingCustom.length > 0) {
          throw new Error(`Please fill in required fields: ${missingCustom.map(f => f.fieldName).join(', ')}`);
        }
      }

      // Validate QC results - all must have a measured value and pass/fail
      const allQcResults = [...qcResults, ...startQcResults, ...finishQcResults];
      if (allQcResults.length > 0) {
        const incompleteQc = allQcResults.filter(r => !r.measuredValue.trim() || r.passed === null);
        if (incompleteQc.length > 0) {
          throw new Error(`Please enter measured values and mark pass/fail for all QC standards`);
        }
      }

      const item = verificationData.serializedItem;
      if (!item) throw new Error('No part data available. Please scan the part again.');

      const response = await apiRequest('/api/p2-traveler/start-task', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: verificationData.employee.id,
          employeeCode: verificationData.employee.employeeCode,
          employeeName: verificationData.employee.name,
          barcode: item.barcode,
          serializedItemId: item.id,
          department: verificationData.nextDepartment,
          partNumber: item.partNumber,
          partName: item.partName || item.partNumber || 'Unknown',
          traceabilityData: traceabilityData.filter(item => item.value.trim()),
          customData: Object.keys(customData).length > 0 ? customData : null,
          qcResults: allQcResults.length > 0 ? allQcResults : null,
          notes,
        }),
      }) as any;

      return response;
    },
    onSuccess: (response: any) => {
      const workTask = response.workTask || response;
      const punch = response.punch as
        | { action?: 'clockedIn' | 'switched' | 'unchanged'; chargeCode?: string | null; warning?: string }
        | undefined;
      setActiveTask(workTask);
      setScanState('TASK_ACTIVE');
      queryClient.invalidateQueries({ queryKey: ['/api/p2-traveler/active-tasks', employee?.id] });

      // Task #188: surface auto-punch result to operator.
      let punchLine = '';
      if (punch?.action === 'clockedIn' && punch.chargeCode) {
        punchLine = ` Clocked in on ${punch.chargeCode}.`;
      } else if (punch?.action === 'switched' && punch.chargeCode) {
        punchLine = ` Switched charge code to ${punch.chargeCode}.`;
      } else if (punch?.action === 'unchanged' && punch.chargeCode) {
        punchLine = ` Punch already on ${punch.chargeCode}.`;
      }

      toast({
        title: 'Task Started',
        description: `Working on ${workTask.partName} in ${workTask.department}.${punchLine}`,
      });
      if (punch?.warning) {
        toast({
          title: 'Labor budget warning',
          description: punch.warning,
          variant: 'destructive',
        });
      }
      setShowTimerModal(true);
    },
    onError: (error: any) => {
      // Task #188: extract structured error from server (gates can fail with
      // PTO_DAY_BLOCK, CHARGE_CODE_UNRESOLVED, NOT_CERTIFIED, etc.). apiRequest
      // attaches the parsed JSON body as `error.responseData`.
      let title = 'Failed to Start Task';
      let description = error?.message || 'Unknown error';
      try {
        const data = error?.responseData ?? null;
        const code = data?.error || data?.code || error?.code;
        const msg = data?.message || data?.error || error?.message;
        if (code === 'PTO_DAY_BLOCK') {
          title = 'PTO Block';
          description = msg || 'This employee has approved PTO for today. Clock-in is not permitted.';
        } else if (code === 'CHARGE_CODE_UNRESOLVED') {
          title = 'Charge Code Unresolved';
          description = msg || 'This traveler has no resolvable charge code. Set a default charge code on the work order or traveler.';
        } else if (code === 'NOT_CERTIFIED') {
          title = 'Not Certified';
          description = msg || 'You are not certified to start this part in this department.';
        } else if (code === 'EMPLOYEE_NOT_FOUND') {
          title = 'Employee Not Found';
          description = msg || 'Your badge could not be matched to an employee record.';
        } else if (code === 'INVALID_LABOR_APPROVAL') {
          title = 'Invalid Labor Approval';
          description = msg || 'The labor approval is not valid for this employee and work order.';
        } else if (code === 'NO_TRAVELER_LINK' || code === 'NO_WAD_LINK') {
          title = 'No Traveler Linked';
          description = msg || 'No traveler is linked to this serialized item. Generate a traveler before starting work.';
        } else if (msg) {
          description = msg;
        }
      } catch {
        // Fall back to error.message
      }
      toast({ title, description, variant: 'destructive' });
    },
  });

  // Complete task mutation
  const completeTaskMutation = useMutation({
    mutationFn: async () => {
      if (!activeTask) throw new Error('No active task');

      // Re-verify badge and part
      if (!badgeInput.trim() || !partInput.trim()) {
        throw new Error('Please scan badge and part to complete task');
      }

      const response = await apiRequest('/api/p2-traveler/complete-task', {
        method: 'POST',
        body: JSON.stringify({
          taskId: activeTask.id,
          employeeCode: badgeInput,
          barcode: partInput,
          notes,
          traceabilityData: traceabilityData.filter(item => item.value.trim()),
          customData: Object.keys(customData).length > 0 ? customData : null,
          qcResults: [...qcResults, ...startQcResults, ...finishQcResults],
        }),
      });

      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Task Completed',
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-traveler/active-tasks', employee?.id] });
      resetScanner();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Complete Task',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle traceability data update
  const updateTraceabilityField = (index: number, value: string) => {
    const updated = [...traceabilityData];
    updated[index].value = value;
    setTraceabilityData(updated);

    const item = updated[index];
    // Reset the validation flag for this material group whenever the lot field is edited
    if (item.type === 'material_lot' && item.materialIndex !== undefined) {
      setValidatedMaterialIndices(prev => {
        if (!prev.has(item.materialIndex!)) return prev;
        const next = new Set(prev);
        next.delete(item.materialIndex!);
        return next;
      });
    }
    if (item.type === 'material_lot' && value.trim()) {
      const icn = value.trim();
      const matIdxForValidation = item.materialIndex;
      const abortKey = matIdxForValidation ?? -1;
      const previousController = validateAbortControllersRef.current.get(abortKey);
      if (previousController) {
        previousController.abort();
      }
      const controller = new AbortController();
      validateAbortControllersRef.current.set(abortKey, controller);
      latestValidationIcnRef.current.set(abortKey, icn);
      fetch(`/api/material-lots/validate/${encodeURIComponent(icn)}`, { signal: controller.signal })
        .then(res => res.ok ? res.json() : null)
        .then(result => {
          if (!result) return;
          // Drop stale responses: only act if the field value still matches what we asked for.
          if (latestValidationIcnRef.current.get(abortKey) !== icn) return;
          const isValidated =
            result.valid !== false &&
            ((result.status === 'PACKET' && result.packet) || !!result.lot);
          if (isValidated && matIdxForValidation !== undefined) {
            setValidatedMaterialIndices(prev => {
              if (prev.has(matIdxForValidation)) return prev;
              const next = new Set(prev);
              next.add(matIdxForValidation);
              return next;
            });
          }

          if (result.status === 'PACKET' && result.packet) {
            const earliestExpirationMs = (result.fabricRolls || [])
              .map((roll: any) => roll.expirationDate ? new Date(roll.expirationDate).getTime() : null)
              .filter((ms: number | null): ms is number => ms !== null && !Number.isNaN(ms))
              .reduce((min: number | null, ms: number) => (min === null || ms < min ? ms : min), null as number | null);
            const earliestExpirationDisplay = earliestExpirationMs !== null
              ? new Date(earliestExpirationMs).toLocaleDateString()
              : null;
            setTraceabilityData(prev => {
              const sourceEntries = (result.fabricRolls || []).flatMap((roll: any, rollIdx: number) => {
                const prefix = `Packet ${result.packet.packetNumber || result.packet.barcode} Source ${rollIdx + 1}`;
                const sourcePartNumber = roll.supplierPartNumber || roll.fabricPartNumber || '';
                return [
                  { type: 'fabric_lot_number', label: `${prefix} - Lot Number`, value: roll.lotNumber || '' },
                  { type: 'fabric_batch_number', label: `${prefix} - Batch Number`, value: roll.batchNumber || '' },
                  { type: 'fabric_roll_number', label: `${prefix} - Roll Number`, value: roll.rollNumber || '' },
                  { type: 'fabric_internal_control_number', label: `${prefix} - Internal Control Number`, value: roll.internalControlNumber || '' },
                  { type: 'fabric_supplier_part_number', label: `${prefix} - Supplier Part Number`, value: sourcePartNumber },
                  { type: 'fabric_expiration_date', label: `${prefix} - Expiration Date`, value: roll.expirationDate ? new Date(roll.expirationDate).toLocaleDateString() : '' },
                ].filter(entry => entry.value);
              });

              const withoutExistingPacketDetails = prev
                .map((field, originalIndex) => ({ field, originalIndex }))
                .filter(({ field }) => field.materialIndex !== item.materialIndex || ![
                  'packet_barcode',
                  'fabric_lot_number',
                  'fabric_batch_number',
                  'fabric_roll_number',
                  'fabric_internal_control_number',
                  'fabric_supplier_part_number',
                  'fabric_expiration_date',
                ].includes(field.type));

              const next = withoutExistingPacketDetails.map(({ field, originalIndex }) => {
                if (
                  earliestExpirationDisplay &&
                  field.materialIndex === item.materialIndex &&
                  field.type === 'material_expiration_date'
                ) {
                  return { ...field, value: earliestExpirationDisplay };
                }
                if (originalIndex !== index) return field;
                return {
                  ...field,
                  type: 'packet_barcode',
                  label: `${field.materialLabel || 'Material'} - Packet Barcode`,
                  value: result.packet.barcode,
                  builtPacketId: result.packet.id,
                  packetBarcode: result.packet.barcode,
                  fabricSourceCount: result.fabricRolls?.length || 0,
                };
              });

              const materialEntries = sourceEntries.map((entry: any) => ({
                ...entry,
                materialIndex: item.materialIndex,
                materialLabel: item.materialLabel || `Material ${(item.materialIndex ?? 0) + 1}`,
                builtPacketId: result.packet.id,
                packetBarcode: result.packet.barcode,
              }));

              return [...next, ...materialEntries];
            });
            toast({
              title: 'Packet Captured',
              description: `Linked ${result.packet.barcode} with ${result.fabricRolls?.length || 0} fabric source(s).`,
            });
            return;
          }

          if (result.lot) {
            const lot = result.lot;
            setTraceabilityData(prev => {
              const next = [...prev];
              const lotField = next.find(
                f => f.materialIndex === item.materialIndex && f.type === 'material_lot'
              );
              if (lotField) {
                lotField.value = lot.internalControlNumber || lot.lotNumber || lotField.value;
              }
              const expirationField = next.find(
                f => f.materialIndex === item.materialIndex && f.type === 'material_expiration_date'
              );
              if (expirationField && lot.expirationDate) {
                expirationField.value = new Date(lot.expirationDate).toLocaleDateString();
              }
              return next;
            });
            if (result.valid === false) {
              toast({
                title: 'Material lot issue',
                description: result.message || 'Material lot cannot be used',
                variant: 'destructive',
              });
            } else {
              toast({
                title: 'Material lot validated',
                description: result.message || `Lot ${lot.internalControlNumber || lot.lotNumber || icn} is valid for use`,
              });
            }
            return;
          }

          if (result.valid === false || result.status === 'NOT_FOUND') {
            toast({
              title: 'Barcode not found',
              description: result.message || `No material lot or packet found for ${icn}`,
              variant: 'destructive',
            });
          }
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          console.error('Material lot validation failed:', err);
        });
    } else if (item.type === 'material_lot') {
      // Field cleared — cancel any in-flight validation and forget the latest ICN
      // so a late response cannot pop a "Barcode not found" toast.
      const abortKey = item.materialIndex ?? -1;
      const previousController = validateAbortControllersRef.current.get(abortKey);
      if (previousController) {
        previousController.abort();
        validateAbortControllersRef.current.delete(abortKey);
      }
      latestValidationIcnRef.current.delete(abortKey);
    }
  };

  const materialControlFieldTypes = new Set([
    'material_lot',
    'internal_control_number',
    'material_internal_control_number',
    'material_icn',
    'fabric_internal_control_number',
  ]);

  const isMaterialControlField = (item: any) => {
    const type = String(item?.type || '').toLowerCase();
    const label = String(item?.label || '').toLowerCase();
    return materialControlFieldTypes.has(type) || label.includes('control number') || label.includes('icn');
  };

  const getNextMaterialIndex = () => {
    const existingMaterialIndices = traceabilityData
      .filter(item => item.materialIndex !== undefined)
      .map(item => item.materialIndex!);
    return existingMaterialIndices.length > 0 ? Math.max(...existingMaterialIndices) + 1 : 0;
  };

  // Add another material traceability entry
  const addMaterialTraceEntry = () => {
    const nextIndex = getNextMaterialIndex();
    
    const defaultFields = ['material_lot', 'material_expiration_date'];
    const newEntries = defaultFields.map(fieldType => ({
      materialIndex: nextIndex,
      materialLabel: `Material ${nextIndex + 1}`,
      type: fieldType,
      label: `Material ${nextIndex + 1} - ${fieldType.replace(/_/g, ' ').toUpperCase()}`,
      value: '',
    }));
    setTraceabilityData(prev => [...prev, ...newEntries]);
  };

  // Auto-focus the material_lot input of a newly-added material group
  useEffect(() => {
    if (pendingFocusMaterialIndex === null) return;
    const targetIdx = traceabilityData.findIndex(
      (item) => item.materialIndex === pendingFocusMaterialIndex && item.type === 'material_lot'
    );
    if (targetIdx === -1) return;
    const el = document.getElementById(`trace-${targetIdx}`) as HTMLInputElement | null;
    if (el) {
      el.focus();
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }
    setPendingFocusMaterialIndex(null);
  }, [pendingFocusMaterialIndex, traceabilityData]);

  // Remove a material group by index
  const removeMaterialGroup = (materialIndex: number) => {
    setTraceabilityData(prev => prev.filter(item => item.materialIndex !== materialIndex));
  };

  // Handle custom data update
  const updateCustomField = (fieldName: string, value: string) => {
    setCustomData(prev => ({ ...prev, [fieldName]: value }));
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clipboard className="h-6 w-6" />
            P2 Production Traveler
          </CardTitle>
          <CardDescription>
            Scan badge and part to track production tasks with full AS9100 traceability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* State Indicator */}
          <div className="flex gap-2 items-center justify-center">
            <Badge variant={scanState === 'READY' ? 'default' : 'secondary'} data-testid="badge-state-ready">
              <User className="h-3 w-3 mr-1" />
              Badge
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant={scanState === 'BADGE_SCANNED' ? 'default' : scanState === 'PART_SCANNED' || scanState === 'TASK_ACTIVE' ? 'secondary' : 'outline'} data-testid="badge-state-part">
              <Package className="h-3 w-3 mr-1" />
              Part
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant={scanState === 'PART_SCANNED' ? 'default' : scanState === 'TASK_ACTIVE' ? 'secondary' : 'outline'} data-testid="badge-state-task">
              <Clipboard className="h-3 w-3 mr-1" />
              Task
            </Badge>
            <ArrowRight className="h-4 w-4" />
            <Badge variant={scanState === 'TASK_ACTIVE' ? 'default' : 'outline'} data-testid="badge-state-active">
              <Clock className="h-3 w-3 mr-1" />
              Active
            </Badge>
          </div>

          <Separator />

          {/* Step 1: Badge Scan */}
          {scanState === 'READY' && (
            <form onSubmit={handleBadgeScan} className="space-y-4" data-testid="form-badge-scan">
              <div className="space-y-2">
                <Label htmlFor="badge-input" className="flex items-center gap-2">
                  <Scan className="h-4 w-4" />
                  Scan Employee Badge
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="badge-input"
                    type="text"
                    value={badgeInput}
                    onChange={(e) => setBadgeInput(e.target.value)}
                    placeholder="Scan or enter badge code..."
                    autoFocus={!isTouchDevice()}
                    autoComplete="off"
                    className="flex-1"
                    data-testid="input-badge-code"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCameraTarget('badge')}
                    title="Use camera to scan"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-badge">
                <Scan className="h-4 w-4 mr-2" />
                Continue
              </Button>
            </form>
          )}

          {/* Step 2: Part Scan */}
          {scanState === 'BADGE_SCANNED' && (
            <div className="space-y-4">
              <Alert>
                <User className="h-4 w-4" />
                <AlertDescription>
                  Employee: <strong>{employee?.name || badgeInput}</strong>
                  {employee?.name && <span className="text-muted-foreground ml-2">({badgeInput})</span>}
                </AlertDescription>
              </Alert>

              <form onSubmit={handlePartScan} className="space-y-4" data-testid="form-part-scan">
                <div className="space-y-2">
                  <Label htmlFor="part-input" className="flex items-center gap-2">
                    <Scan className="h-4 w-4" />
                    Scan Part Barcode
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="part-input"
                      type="text"
                      value={partInput}
                      onChange={(e) => setPartInput(e.target.value)}
                      placeholder="Scan or enter part barcode..."
                      autoFocus={!isTouchDevice()}
                      autoComplete="off"
                      className="flex-1"
                      data-testid="input-part-barcode"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setCameraTarget('part')}
                      title="Use camera to scan"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={resetScanner} className="flex-1" data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" data-testid="button-submit-part">
                    <Scan className="h-4 w-4 mr-2" />
                    Verify Part
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* Generating Traveler State */}
          {scanState === 'GENERATING_TRAVELER' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold">Generating Traveler from Routing...</p>
                <p className="text-sm text-muted-foreground">
                  Creating full production traveler with all routing steps, checks, and requirements
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Traceability Entry & Task Start */}
          {scanState === 'PART_SCANNED' && verificationData && (
            <div className="space-y-4">
              {/* Part Info */}
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div><strong>Part:</strong> {verificationData.serializedItem.partName} ({verificationData.serializedItem.partNumber})</div>
                    <div><strong>Serial:</strong> {verificationData.serializedItem.serialNumber}</div>
                    <div><strong>Customer:</strong> {verificationData.serializedItem.customerName}</div>
                    <div><strong>Department:</strong> {verificationData.nextDepartment}</div>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Certification Status */}
              <Alert variant={verificationData.isCertified ? 'default' : 'destructive'}>
                {verificationData.isCertified ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  {verificationData.isCertified ? (
                    `${verificationData.employee.name} is certified for ${verificationData.nextDepartment}`
                  ) : (
                    `${verificationData.employee.name} is NOT certified for ${verificationData.nextDepartment}`
                  )}
                </AlertDescription>
              </Alert>

              {verificationData.isCertified && (
                <>
                  {/* Work Instructions - Prominently displayed */}
                  {verificationData.departmentConfig.instructionPack && (
                    (() => {
                      const pack = verificationData.departmentConfig.instructionPack;
                      const hasContent = pack.specialNotes || 
                        (pack.workInstructionRefs && pack.workInstructionRefs.length > 0) || 
                        (pack.aiSnippets && pack.aiSnippets.length > 0) ||
                        (pack.media && pack.media.length > 0);
                      if (!hasContent) return null;
                      return (
                        <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/50 p-4">
                          <div className="flex items-center gap-2 pb-1 border-b border-blue-200">
                            <BookOpen className="h-4 w-4 text-blue-600" />
                            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Work Instructions</p>
                          </div>

                          {pack.specialNotes && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                              <div className="flex items-start gap-2">
                                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-amber-900 whitespace-pre-wrap">{pack.specialNotes}</p>
                              </div>
                            </div>
                          )}

                          {pack.workInstructionRefs && pack.workInstructionRefs.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-blue-700 uppercase">Reference Documents</p>
                              {pack.workInstructionRefs.map((ref, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-white rounded-md border border-blue-100 p-2">
                                  <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{ref.title || ref.documentId}</p>
                                    {ref.pageRange && <p className="text-xs text-muted-foreground">Pages: {ref.pageRange}</p>}
                                  </div>
                                  <a 
                                    href={`/api/routing-documents/${ref.documentId}/file`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          )}

                          {pack.aiSnippets && pack.aiSnippets.length > 0 && (
                            <div className="space-y-2">
                              {pack.aiSnippets.map((snippet, idx) => (
                                <div key={idx} className="bg-white rounded-md border border-blue-100 p-3">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                                    <p className="text-xs font-semibold text-blue-700">{snippet.title}</p>
                                  </div>
                                  <ul className="space-y-1 ml-5">
                                    {snippet.bullets.map((bullet, bIdx) => (
                                      <li key={bIdx} className="text-sm list-disc text-gray-700">{bullet}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}

                  {/* Oven Curing Steps */}
                  {verificationData.departmentConfig.ovenCuringSteps && verificationData.departmentConfig.ovenCuringSteps.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Flame className="h-4 w-4 text-orange-500" />
                        Oven Curing Requirements
                      </Label>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-orange-50">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Step</th>
                              <th className="text-left px-3 py-2 font-medium">Temperature</th>
                              <th className="text-left px-3 py-2 font-medium">Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {verificationData.departmentConfig.ovenCuringSteps.map((step, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                                <td className="px-3 py-2 font-medium">{index + 1}</td>
                                <td className="px-3 py-2 font-mono">{step.temperature}</td>
                                <td className="px-3 py-2 font-mono">{step.time}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                        onClick={() => setShowOvenModal(true)}
                      >
                        <Thermometer className="h-4 w-4 mr-2" />
                        Log Oven Cure
                      </Button>
                    </div>
                  )}

                  {/* Material Traceability Section — always shown so workers can add materials */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Material Traceability <span className="text-sm font-normal text-muted-foreground">(Optional)</span></Label>
                      {traceabilityData.length > 0 && (
                        <Tabs value={traceabilityMode} onValueChange={(v) => setTraceabilityMode(v as 'scan' | 'manual')}>
                          <TabsList className="h-8">
                            <TabsTrigger value="scan" className="text-xs px-3 gap-1" data-testid="tab-scan-mode">
                              <QrCode className="h-3 w-3" />
                              Scan Barcode
                            </TabsTrigger>
                            <TabsTrigger value="manual" className="text-xs px-3 gap-1" data-testid="tab-manual-mode">
                              <FileText className="h-3 w-3" />
                              Control Number
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                      )}
                    </div>

                    {(() => {
                      const materialGroups = new Map<number, typeof traceabilityData>();
                      const ungrouped: typeof traceabilityData = [];
                      traceabilityData.forEach((item, idx) => {
                        if (item.materialIndex !== undefined) {
                          if (!materialGroups.has(item.materialIndex)) materialGroups.set(item.materialIndex, []);
                          materialGroups.get(item.materialIndex)!.push({ ...item, _originalIndex: idx } as any);
                        } else {
                          ungrouped.push({ ...item, _originalIndex: idx } as any);
                        }
                      });

                      const materialGroupEntries = Array.from(materialGroups.entries()).sort((a, b) => a[0] - b[0]);
                      const totalMaterials = materialGroupEntries.length;

                      return (
                        <div className="space-y-3">
                          {traceabilityData.length > 0 && (
                            traceabilityMode === 'scan' ? (
                              <Alert>
                                <QrCode className="h-4 w-4" />
                                <AlertDescription>
                                  Scan material packet barcode to capture lot/batch traceability data
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <Alert>
                                <FileText className="h-4 w-4" />
                                <AlertDescription>
                                  Enter internal control number to link traceability records
                                </AlertDescription>
                              </Alert>
                            )
                          )}

                          {materialGroupEntries.map(([matIdx, items], groupArrayIdx) => {
                            const isLastGroup = groupArrayIdx === materialGroupEntries.length - 1;
                            const controlItem = (items as any[]).find(isMaterialControlField);
                            const showAddAnotherPrompt =
                              isLastGroup &&
                              traceabilityMode === 'manual' &&
                              !!controlItem?.value?.trim();
                            return (
                            <div key={matIdx} className="border rounded-lg p-3 bg-blue-50/30 dark:bg-blue-950/20 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Package className="h-4 w-4 text-blue-600" />
                                  <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                                    {items[0]?.materialLabel || `Material ${matIdx + 1}`}
                                  </span>
                                  {totalMaterials > 1 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {matIdx + 1} of {totalMaterials}
                                    </Badge>
                                  )}
                                </div>
                                {!(items as any)[0]?.inventoryPartId && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                                    onClick={() => removeMaterialGroup(matIdx)}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                              {items.map((item: any) => (
                                <div key={item._originalIndex} className="space-y-1">
                                  <Label htmlFor={`trace-${item._originalIndex}`} className="text-xs">
                                    {item.type.replace(/_/g, ' ').toUpperCase()}
                                  </Label>
                                  <Input
                                    id={`trace-${item._originalIndex}`}
                                    type="text"
                                    value={item.value}
                                    onChange={(e) => updateTraceabilityField(item._originalIndex, e.target.value)}
                                    placeholder={traceabilityMode === 'scan' ? `Scan barcode...` : 'Enter control number...'}
                                    data-testid={`input-trace-${item._originalIndex}`}
                                    className="h-9"
                                  />
                                </div>
                              ))}
                              {showAddAnotherPrompt && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                                  onClick={() => {
                                    const nextIdx = getNextMaterialIndex();
                                    addMaterialTraceEntry();
                                    setPendingFocusMaterialIndex(nextIdx);
                                  }}
                                  data-testid={`button-add-another-control-number-${matIdx}`}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Another Control Number
                                </Button>
                              )}
                            </div>
                            );
                          })}

                          {ungrouped.map((item: any) => (
                            <div key={item._originalIndex} className="space-y-2">
                              <Label htmlFor={`trace-${item._originalIndex}`}>{item.label}</Label>
                              <Input
                                id={`trace-${item._originalIndex}`}
                                type="text"
                                value={item.value}
                                onChange={(e) => updateTraceabilityField(item._originalIndex, e.target.value)}
                                placeholder={traceabilityMode === 'scan' ? `Scan barcode for ${item.label}...` : 'Enter control number...'}
                                data-testid={`input-trace-${item._originalIndex}`}
                              />
                            </div>
                          ))}

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={addMaterialTraceEntry}
                          >
                            <Package className="h-4 w-4 mr-2" />
                            {traceabilityData.length > 0 ? 'Add Another Material' : 'Add Material'}
                          </Button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Start Phase Checks */}
                  {verificationData.departmentConfig.startChecks && verificationData.departmentConfig.startChecks.length > 0 && (
                    <div className="space-y-3 rounded-lg border-2 border-green-200 bg-green-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-green-200">
                        <Play className="h-4 w-4 text-green-600" />
                        <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Start Phase Checks</p>
                      </div>
                      {verificationData.departmentConfig.startChecks.map((check, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-white rounded-md border border-green-100 p-2">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{check.title}</p>
                            {check.instructions && <p className="text-xs text-muted-foreground">{check.instructions}</p>}
                            {check.requiresSignature && (
                              <Badge variant="outline" className="mt-1 text-[10px] border-green-300">Signature Required ({check.signatureRole || 'OPERATOR'})</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Start Phase QC Standards - with result entry */}
                  {startQcResults.length > 0 && (
                    <div className="space-y-3 rounded-lg border-2 border-green-200 bg-green-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-green-200">
                        <ClipboardCheck className="h-4 w-4 text-green-600" />
                        <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Start Phase QC Standards — Enter Results</p>
                      </div>
                      {startQcResults.map((qc, index) => (
                        <div key={index} className={`border rounded-lg p-3 space-y-2 ${qc.passed === true ? 'border-green-300 bg-green-50' : qc.passed === false ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{qc.standard}</div>
                              <div className="text-xs text-muted-foreground">
                                {qc.tolerance && <>Tolerance: <span className="font-mono">{qc.tolerance}</span> · </>}{qc.requirement}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button type="button" size="sm" variant={qc.passed === true ? 'default' : 'outline'} className={`h-8 px-3 ${qc.passed === true ? 'bg-green-600 hover:bg-green-700' : ''}`} onClick={() => { const u = [...startQcResults]; u[index].passed = true; setStartQcResults(u); }}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Pass
                              </Button>
                              <Button type="button" size="sm" variant={qc.passed === false ? 'default' : 'outline'} className={`h-8 px-3 ${qc.passed === false ? 'bg-red-600 hover:bg-red-700' : ''}`} onClick={() => { const u = [...startQcResults]; u[index].passed = false; setStartQcResults(u); }}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Fail
                              </Button>
                            </div>
                          </div>
                          <Input type="text" value={qc.measuredValue} onChange={(e) => { const u = [...startQcResults]; u[index].measuredValue = e.target.value; const r = isWithinTolerance(e.target.value, qc.tolerance, qc.requirement); if (r === true) u[index].passed = true; else if (r === false) u[index].passed = false; setStartQcResults(u); }} placeholder="Enter measured value..." className="h-9" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* START Phase Custom Data Fields */}
                  {(() => {
                    const startFields: CustomDataField[] = verificationData.departmentConfig.startCustomDataFields || [];
                    if (startFields.length === 0) return null;
                    return (
                      <div className="space-y-3 rounded-lg border-2 border-green-200 bg-green-50/50 p-4">
                        <div className="flex items-center gap-2 pb-1 border-b border-green-200">
                          <Play className="h-4 w-4 text-green-600" />
                          <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Start Phase Data</p>
                        </div>
                        {startFields.map((field, index) => (
                          <div key={index} className="space-y-2">
                            <Label htmlFor={`custom-start-${field.fieldName}`}>
                              {field.fieldName}
                              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {field.fieldType === 'textarea' ? (
                              <Textarea
                                id={`custom-start-${field.fieldName}`}
                                value={customData[field.fieldName] || ''}
                                onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                                placeholder={`Enter ${field.fieldName}...`}
                                data-testid={`input-custom-${field.fieldName}`}
                              />
                            ) : (
                              <Input
                                id={`custom-start-${field.fieldName}`}
                                type={field.fieldType}
                                value={customData[field.fieldName] || ''}
                                onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                                placeholder={`Enter ${field.fieldName}...`}
                                data-testid={`input-custom-${field.fieldName}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* WORK Phase Custom Data Fields (deduped against START) */}
                  {(() => {
                    const workFields: CustomDataField[] = verificationData.departmentConfig._dedupedWorkFields || verificationData.departmentConfig.customDataFields || [];
                    if (workFields.length === 0) return null;
                    return (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Process Data</Label>
                        {workFields.map((field, index) => (
                          <div key={index} className="space-y-2">
                            <Label htmlFor={`custom-${field.fieldName}`}>
                              {field.fieldName}
                              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {field.fieldType === 'textarea' ? (
                              <Textarea
                                id={`custom-${field.fieldName}`}
                                value={customData[field.fieldName] || ''}
                                onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                                placeholder={`Enter ${field.fieldName}...`}
                                data-testid={`input-custom-${field.fieldName}`}
                              />
                            ) : (
                              <Input
                                id={`custom-${field.fieldName}`}
                                type={field.fieldType}
                                value={customData[field.fieldName] || ''}
                                onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                                placeholder={`Enter ${field.fieldName}...`}
                                data-testid={`input-custom-${field.fieldName}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Work Phase Checks */}
                  {verificationData.departmentConfig.workChecks && verificationData.departmentConfig.workChecks.length > 0 && (
                    <div className="space-y-3 rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-amber-200">
                        <CheckCircle className="h-4 w-4 text-amber-600" />
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Work Phase Checks</p>
                      </div>
                      {verificationData.departmentConfig.workChecks.map((check, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-white rounded-md border border-amber-100 p-2">
                          <CheckCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{check.title}</p>
                            {check.instructions && <p className="text-xs text-muted-foreground">{check.instructions}</p>}
                            {check.requiresSignature && (
                              <Badge variant="outline" className="mt-1 text-[10px] border-amber-300">Signature Required ({check.signatureRole || 'OPERATOR'})</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* QC Standards / Tolerance Requirements - with result entry */}
                  {qcResults.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" />
                        QC Standards & Tolerances — Enter Results
                      </Label>
                      <div className="space-y-3">
                        {qcResults.map((qc, index) => (
                          <div key={index} className={`border rounded-lg p-3 space-y-2 ${qc.passed === true ? 'border-green-300 bg-green-50' : qc.passed === false ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{qc.standard}</div>
                                <div className="text-xs text-muted-foreground">
                                  Tolerance: <span className="font-mono">{qc.tolerance}</span> · {qc.requirement}
                                </div>
                                {qc.referenceLink && (
                                  <a href={qc.referenceLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
                                    <ExternalLink className="h-3 w-3" /> Reference Table/Chart
                                  </a>
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={qc.passed === true ? 'default' : 'outline'}
                                  className={`h-8 px-3 ${qc.passed === true ? 'bg-green-600 hover:bg-green-700' : ''}`}
                                  onClick={() => {
                                    const updated = [...qcResults];
                                    updated[index].passed = true;
                                    setQcResults(updated);
                                  }}
                                >
                                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                  Pass
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={qc.passed === false ? 'default' : 'outline'}
                                  className={`h-8 px-3 ${qc.passed === false ? 'bg-red-600 hover:bg-red-700' : ''}`}
                                  onClick={() => {
                                    const updated = [...qcResults];
                                    updated[index].passed = false;
                                    setQcResults(updated);
                                  }}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Fail
                                </Button>
                              </div>
                            </div>
                            <Input
                              id={`qc-result-${index}`}
                              name={`qc-result-${index}`}
                              type="text"
                              value={qc.measuredValue}
                              onChange={(e) => {
                                const updated = [...qcResults];
                                updated[index].measuredValue = e.target.value;
                                const result = isWithinTolerance(e.target.value, qc.tolerance, qc.requirement);
                                if (result === true) updated[index].passed = true;
                                else if (result === false) updated[index].passed = false;
                                setQcResults(updated);
                              }}
                              placeholder="Enter measured value..."
                              className="h-9"
                              data-testid={`input-qc-result-${index}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Standard Processes */}
                  {verificationData.departmentConfig.standardProcesses && verificationData.departmentConfig.standardProcesses.length > 0 && (
                    <div className="space-y-3 rounded-lg border-2 border-amber-200 bg-amber-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-amber-200">
                        <Clipboard className="h-4 w-4 text-amber-600" />
                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Standard Processes</p>
                      </div>
                      {verificationData.departmentConfig.standardProcesses.map((proc, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-white rounded-md border border-amber-100 p-2">
                          <ClipboardCheck className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{proc.name}</p>
                            {proc.description && <p className="text-xs text-muted-foreground">{proc.description}</p>}
                            {proc.config?.notes && <p className="text-xs text-muted-foreground">Notes: {proc.config.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Special Process */}
                  {verificationData.departmentConfig.specialProcessConfig?.processName && (
                    <div className="rounded-lg border-2 border-purple-200 bg-purple-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-purple-200 mb-2">
                        <AlertCircle className="h-4 w-4 text-purple-600" />
                        <p className="text-xs font-bold text-purple-800 uppercase tracking-wider">Special Process</p>
                      </div>
                      <p className="text-sm font-medium">{verificationData.departmentConfig.specialProcessConfig.processName}</p>
                      {verificationData.departmentConfig.specialProcessConfig.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{verificationData.departmentConfig.specialProcessConfig.notes}</p>
                      )}
                    </div>
                  )}

                  {/* FINISH Phase Custom Data Fields (deduped against START+WORK) */}
                  {(() => {
                    const finishFields: CustomDataField[] = verificationData.departmentConfig._dedupedFinishFields || verificationData.departmentConfig.finishCustomDataFields || [];
                    if (finishFields.length === 0) return null;
                    return (
                      <div className="space-y-3 rounded-lg border-2 border-orange-200 bg-orange-50/50 p-4">
                        <div className="flex items-center gap-2 pb-1 border-b border-orange-200">
                          <ArrowRight className="h-4 w-4 text-orange-600" />
                          <p className="text-xs font-bold text-orange-800 uppercase tracking-wider">Finish Phase Data</p>
                        </div>
                        {finishFields.map((field, index) => (
                          <div key={index} className="space-y-2">
                            <Label htmlFor={`custom-finish-${field.fieldName}`}>
                              {field.fieldName}
                              {field.isRequired && <span className="text-red-500 ml-1">*</span>}
                            </Label>
                            {field.fieldType === 'textarea' ? (
                              <Textarea
                                id={`custom-finish-${field.fieldName}`}
                                value={customData[field.fieldName] || ''}
                                onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                                placeholder={`Enter ${field.fieldName}...`}
                                data-testid={`input-custom-${field.fieldName}`}
                              />
                            ) : (
                              <Input
                                id={`custom-finish-${field.fieldName}`}
                                type={field.fieldType}
                                value={customData[field.fieldName] || ''}
                                onChange={(e) => updateCustomField(field.fieldName, e.target.value)}
                                placeholder={`Enter ${field.fieldName}...`}
                                data-testid={`input-custom-${field.fieldName}`}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Finish Phase Checks */}
                  {verificationData.departmentConfig.finishChecks && verificationData.departmentConfig.finishChecks.length > 0 && (
                    <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-blue-200">
                        <ArrowRight className="h-4 w-4 text-blue-600" />
                        <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Finish Phase Checks</p>
                      </div>
                      {verificationData.departmentConfig.finishChecks.map((check, idx) => (
                        <div key={idx} className="flex items-start gap-2 bg-white rounded-md border border-blue-100 p-2">
                          <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{check.title}</p>
                            {check.instructions && <p className="text-xs text-muted-foreground">{check.instructions}</p>}
                            {check.requiresSignature && (
                              <Badge variant="outline" className="mt-1 text-[10px] border-blue-300">Signature Required ({check.signatureRole || 'OPERATOR'})</Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Finish Phase QC Standards - with result entry */}
                  {finishQcResults.length > 0 && (
                    <div className="space-y-3 rounded-lg border-2 border-blue-200 bg-blue-50/50 p-4">
                      <div className="flex items-center gap-2 pb-1 border-b border-blue-200">
                        <ClipboardCheck className="h-4 w-4 text-blue-600" />
                        <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">Finish Phase QC Standards — Enter Results</p>
                      </div>
                      {finishQcResults.map((qc, index) => (
                        <div key={index} className={`border rounded-lg p-3 space-y-2 ${qc.passed === true ? 'border-green-300 bg-green-50' : qc.passed === false ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="font-medium text-sm">{qc.standard}</div>
                              <div className="text-xs text-muted-foreground">
                                {qc.tolerance && <>Tolerance: <span className="font-mono">{qc.tolerance}</span> · </>}{qc.requirement}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button type="button" size="sm" variant={qc.passed === true ? 'default' : 'outline'} className={`h-8 px-3 ${qc.passed === true ? 'bg-green-600 hover:bg-green-700' : ''}`} onClick={() => { const u = [...finishQcResults]; u[index].passed = true; setFinishQcResults(u); }}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Pass
                              </Button>
                              <Button type="button" size="sm" variant={qc.passed === false ? 'default' : 'outline'} className={`h-8 px-3 ${qc.passed === false ? 'bg-red-600 hover:bg-red-700' : ''}`} onClick={() => { const u = [...finishQcResults]; u[index].passed = false; setFinishQcResults(u); }}>
                                <XCircle className="h-3.5 w-3.5 mr-1" /> Fail
                              </Button>
                            </div>
                          </div>
                          <Input type="text" value={qc.measuredValue} onChange={(e) => { const u = [...finishQcResults]; u[index].measuredValue = e.target.value; const r = isWithinTolerance(e.target.value, qc.tolerance, qc.requirement); if (r === true) u[index].passed = true; else if (r === false) u[index].passed = false; setFinishQcResults(u); }} placeholder="Enter measured value..." className="h-9" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes (Optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Enter any notes about this task..."
                      data-testid="input-notes"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={resetScanner} className="flex-1" data-testid="button-cancel-task">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => startTaskMutation.mutate()}
                      disabled={startTaskMutation.isPending}
                      className="flex-1"
                      data-testid="button-start-task"
                    >
                      <Play className="h-4 w-4 mr-2" />
                      {startTaskMutation.isPending ? 'Starting...' : 'Start Task'}
                    </Button>
                  </div>
                </>
              )}

              {!verificationData.isCertified && (
                <Button variant="outline" onClick={resetScanner} className="w-full" data-testid="button-reset">
                  Start Over
                </Button>
              )}

              <Button
                variant="outline"
                className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                onClick={() => { setShowNotesPanel(!showNotesPanel); if (!showNotesPanel) refetchNotes(); }}
              >
                <Clipboard className="h-4 w-4 mr-2" />
                Notes {itemNotes && itemNotes.length > 0 ? `(${itemNotes.length})` : ''}
              </Button>

              {showNotesPanel && (
                <div className="space-y-3 rounded-lg border-2 border-purple-200 bg-purple-50/50 p-4">
                  <div className="flex items-center gap-2 pb-1 border-b border-purple-200">
                    <Clipboard className="h-4 w-4 text-purple-600" />
                    <p className="text-xs font-bold text-purple-800 uppercase tracking-wider">Notes</p>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note about this part..."
                      className="flex-1 min-h-[60px]"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                      onClick={() => addNoteMutation.mutate()}
                      className="self-end"
                    >
                      {addNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                    </Button>
                  </div>
                  {itemNotes && itemNotes.length > 0 && (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {itemNotes.map((n: any) => (
                        <div key={n.id} className="text-xs bg-white rounded border border-purple-100 p-2">
                          <div className="flex justify-between text-muted-foreground mb-1">
                            <span className="font-medium">{n.performedBy}</span>
                            <span>{new Date(n.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-foreground">{n.notes}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Active Task - Complete */}
          {scanState === 'TASK_ACTIVE' && activeTask && (
            <div className="space-y-4">
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <div><strong>Active Task:</strong> {activeTask.partName}</div>
                    <div><strong>Department:</strong> {activeTask.department}</div>
                    <div><strong>Started:</strong> {new Date(activeTask.startedAt).toLocaleString()}</div>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={() => setShowTimerModal(true)}
                >
                  <Timer className="h-4 w-4 mr-2" />
                  Production Timer
                </Button>
                {verificationData?.departmentConfig?.ovenCuringSteps && verificationData.departmentConfig.ovenCuringSteps.length > 0 && (
                  <Button
                    variant="outline"
                    className="flex-1 border-orange-300 text-orange-700 hover:bg-orange-100"
                    onClick={() => setShowOvenModal(true)}
                  >
                    <Thermometer className="h-4 w-4 mr-2" />
                    Log Oven Cure
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={loadEditData}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Edit Data
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                  onClick={() => { setShowNotesPanel(!showNotesPanel); if (!showNotesPanel) refetchNotes(); }}
                >
                  <Clipboard className="h-4 w-4 mr-2" />
                  Notes {itemNotes && itemNotes.length > 0 ? `(${itemNotes.length})` : ''}
                </Button>
              </div>

              {showNotesPanel && (
                <div className="space-y-3 rounded-lg border-2 border-purple-200 bg-purple-50/50 p-4">
                  <div className="flex items-center gap-2 pb-1 border-b border-purple-200">
                    <Clipboard className="h-4 w-4 text-purple-600" />
                    <p className="text-xs font-bold text-purple-800 uppercase tracking-wider">Department Notes</p>
                  </div>

                  <div className="flex gap-2">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note about this part..."
                      className="flex-1 min-h-[60px]"
                    />
                    <Button
                      variant="default"
                      size="sm"
                      disabled={!newNote.trim() || addNoteMutation.isPending}
                      onClick={() => addNoteMutation.mutate()}
                      className="self-end"
                    >
                      {addNoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                    </Button>
                  </div>

                  {itemNotes && itemNotes.length > 0 && (
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {itemNotes.map((n: any) => (
                        <div key={n.id} className="text-xs bg-white rounded border border-purple-100 p-2">
                          <div className="flex justify-between text-muted-foreground mb-1">
                            <span className="font-medium">{n.performedBy}</span>
                            <span>{new Date(n.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-foreground">{n.notes}</p>
                          {n.fromDepartment && (
                            <Badge variant="outline" className="mt-1 text-[10px]">{n.fromDepartment}</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Alert variant="default">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  To complete this task, rescan your badge and the part barcode
                </AlertDescription>
              </Alert>

              <form onSubmit={(e) => {
                e.preventDefault();
                completeTaskMutation.mutate();
              }} className="space-y-4" data-testid="form-complete-task">
                <div className="space-y-2">
                  <Label htmlFor="complete-badge">Scan Employee Badge</Label>
                  <Input
                    id="complete-badge"
                    type="text"
                    value={badgeInput}
                    onChange={(e) => setBadgeInput(e.target.value)}
                    placeholder="Scan badge to verify..."
                    autoFocus={!isTouchDevice()}
                    autoComplete="off"
                    data-testid="input-complete-badge"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complete-part">Scan Part Barcode</Label>
                  <Input
                    id="complete-part"
                    type="text"
                    value={partInput}
                    onChange={(e) => setPartInput(e.target.value)}
                    placeholder="Scan part to verify..."
                    autoComplete="off"
                    data-testid="input-complete-part"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="complete-notes">Completion Notes (Optional)</Label>
                  <Textarea
                    id="complete-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter any completion notes..."
                    data-testid="input-complete-notes"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={completeTaskMutation.isPending || !badgeInput.trim() || !partInput.trim()}
                  className="w-full"
                  data-testid="button-complete-task"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {completeTaskMutation.isPending ? 'Completing...' : 'Complete Task'}
                </Button>
              </form>
            </div>
          )}

          {/* Active Tasks Overview */}
          {activeTasks && activeTasks.length > 0 && scanState === 'READY' && (
            <div className="mt-6">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <strong>You have {activeTasks.length} active task(s)</strong>
                    {activeTasks.map((task) => (
                      <div key={task.id} className="text-sm">
                        • {task.partName} in {task.department}
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <CameraScanner
        isOpen={cameraTarget !== null}
        onClose={() => setCameraTarget(null)}
        onBarcodeDetected={(barcode) => {
          if (cameraTarget === 'badge') {
            setBadgeInput(barcode);
          } else if (cameraTarget === 'part') {
            setPartInput(barcode);
          }
          setCameraTarget(null);
        }}
      />

      <StartProductionTimerModal
        open={showTimerModal}
        onOpenChange={setShowTimerModal}
        defaultSerialNumber={verificationData?.serializedItem?.serialNumber || activeTask?.barcode || ''}
        navigateToStation={false}
        badgeId={badgeInput || undefined}
        onTimerStarted={() => {
          toast({
            title: 'Timer Started',
            description: 'Production timer is now running.',
          });
        }}
      />

      {/* Oven Cure Log Modal */}
      <Dialog open={showOvenModal} onOpenChange={setShowOvenModal}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Log Oven Cure
            </DialogTitle>
            <DialogDescription>
              Record oven cure parameters for {verificationData?.serializedItem?.partName || 'this part'}
            </DialogDescription>
          </DialogHeader>

          {verificationData?.departmentConfig?.ovenCuringSteps && verificationData.departmentConfig.ovenCuringSteps.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-md p-3 space-y-1">
              <p className="text-xs font-semibold text-orange-700 uppercase">Required Cure Parameters</p>
              {verificationData.departmentConfig.ovenCuringSteps.map((step, idx) => (
                <div key={idx} className="text-sm flex gap-4">
                  <span className="font-medium">Step {idx + 1}:</span>
                  <span>{step.temperature}</span>
                  <span>{step.time}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="oven-id" className="text-sm">Oven ID</Label>
                <Input
                  id="oven-id"
                  value={ovenData.ovenId}
                  onChange={(e) => setOvenData(d => ({ ...d, ovenId: e.target.value }))}
                  placeholder="e.g. Oven 1"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cycle-number" className="text-sm">Cycle Number</Label>
                <Input
                  id="cycle-number"
                  value={ovenData.cycleNumber}
                  onChange={(e) => setOvenData(d => ({ ...d, cycleNumber: e.target.value }))}
                  placeholder="e.g. 001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="target-temp" className="text-sm">Target Temp (°F)</Label>
                <Input
                  id="target-temp"
                  type="number"
                  value={ovenData.targetTemperature}
                  onChange={(e) => setOvenData(d => ({ ...d, targetTemperature: e.target.value }))}
                  placeholder="e.g. 350"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="actual-temp" className="text-sm">Actual Temp (°F)</Label>
                <Input
                  id="actual-temp"
                  type="number"
                  value={ovenData.actualTemperature}
                  onChange={(e) => setOvenData(d => ({ ...d, actualTemperature: e.target.value }))}
                  placeholder="e.g. 348"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="target-dur" className="text-sm">Target (min)</Label>
                <Input
                  id="target-dur"
                  type="number"
                  value={ovenData.targetDuration}
                  onChange={(e) => setOvenData(d => ({ ...d, targetDuration: e.target.value }))}
                  placeholder="120"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="actual-dur" className="text-sm">Actual (min)</Label>
                <Input
                  id="actual-dur"
                  type="number"
                  value={ovenData.actualDuration}
                  onChange={(e) => setOvenData(d => ({ ...d, actualDuration: e.target.value }))}
                  placeholder="122"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ramp-up" className="text-sm">Ramp Up (min)</Label>
                <Input
                  id="ramp-up"
                  type="number"
                  value={ovenData.rampUpTime}
                  onChange={(e) => setOvenData(d => ({ ...d, rampUpTime: e.target.value }))}
                  placeholder="15"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">Result</Label>
              <Select value={ovenData.result} onValueChange={(v) => setOvenData(d => ({ ...d, result: v as any }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PASS">Pass</SelectItem>
                  <SelectItem value="FAIL">Fail</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="oven-notes" className="text-sm">Notes</Label>
              <Textarea
                id="oven-notes"
                value={ovenData.notes}
                onChange={(e) => setOvenData(d => ({ ...d, notes: e.target.value }))}
                placeholder="Any observations or notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOvenModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => ovenCureMutation.mutate()}
              disabled={ovenCureMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {ovenCureMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Flame className="h-4 w-4 mr-2" />
                  Save Oven Cure Log
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Edit Department Data
            </DialogTitle>
            <DialogDescription>
              Editing data for <strong>{activeTask?.department}</strong> — {activeTask?.partName}
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              <span className="ml-2 text-sm text-muted-foreground">Loading existing data...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {editTraceData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Traceability Data</p>
                  {editTraceData.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded p-2">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">{item.label || item.type}</Label>
                        <Input
                          value={item.value}
                          onChange={(e) => {
                            const updated = [...editTraceData];
                            updated[idx] = { ...updated[idx], value: e.target.value };
                            setEditTraceData(updated);
                          }}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 self-end"
                        onClick={() => setEditTraceData(editTraceData.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(editCustomData).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">Custom Data</p>
                  {Object.entries(editCustomData).filter(([k]) => k !== 'qcResults').map(([key, value]) => (
                    <div key={key} className="bg-gray-50 rounded p-2">
                      <Label className="text-xs text-muted-foreground">{key}</Label>
                      <Input
                        value={value}
                        onChange={(e) => setEditCustomData({ ...editCustomData, [key]: e.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              )}

              {editQcResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">QC Results</p>
                  {editQcResults.map((qc, idx) => (
                    <div key={idx} className="bg-gray-50 rounded p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{qc.standard}</span>
                        <Badge variant={qc.passed ? 'default' : qc.passed === false ? 'destructive' : 'secondary'} className="text-[10px]">
                          {qc.passed ? 'PASS' : qc.passed === false ? 'FAIL' : 'PENDING'}
                        </Badge>
                      </div>
                      {qc.requirement && <p className="text-[10px] text-muted-foreground">Req: {qc.requirement} (±{qc.tolerance})</p>}
                      <div className="flex gap-2 items-center">
                        <Input
                          value={qc.measuredValue}
                          onChange={(e) => {
                            const updated = [...editQcResults];
                            updated[idx] = { ...updated[idx], measuredValue: e.target.value };
                            setEditQcResults(updated);
                          }}
                          placeholder="Measured value"
                          className="h-8 text-sm flex-1"
                        />
                        <Select
                          value={qc.passed === true ? 'pass' : qc.passed === false ? 'fail' : 'pending'}
                          onValueChange={(v) => {
                            const updated = [...editQcResults];
                            updated[idx] = { ...updated[idx], passed: v === 'pass' ? true : v === 'fail' ? false : null };
                            setEditQcResults(updated);
                          }}
                        >
                          <SelectTrigger className="h-8 w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="pass">Pass</SelectItem>
                            <SelectItem value="fail">Fail</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editTraceData.length === 0 && Object.keys(editCustomData).length === 0 && editQcResults.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No editable data recorded for this department yet</p>
                  <p className="text-xs mt-1">Complete the department tasks first, then you can edit the recorded data here</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button
              onClick={() => saveEditMutation.mutate()}
              disabled={saveEditMutation.isPending || editLoading || (editTraceData.length === 0 && Object.keys(editCustomData).length === 0 && editQcResults.length === 0)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveEditMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

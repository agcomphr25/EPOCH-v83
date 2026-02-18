import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Route,
  Package,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  GripVertical,
  Flame,
  FileText,
  UserCheck,
  PlayCircle,
  Wrench,
  CheckCircle2,
  PenLine,
  Plus,
  Shield,
  RotateCcw,
  BookOpen,
  Lightbulb,
  StickyNote,
  Trash2,
  ImageIcon,
  Sparkles,
  Loader2,
  GraduationCap,
  Brain,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  AlertCircle,
  Timer,
  FolderOpen,
  Search,
  Eye,
  CheckSquare,
  Settings,
  Flag,
} from 'lucide-react';
import type { Employee, EmployeeCapability, Capability } from '../../../server/schema';

const DEFAULT_P2_DEPARTMENTS = [
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
];

interface RoutingDepartment {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

const TRACEABILITY_FIELDS = [
  { id: 'internalControlNumber', label: 'Internal Control Number', description: 'Internal tracking control number' },
  { id: 'supplier', label: 'Supplier', description: 'Material supplier name' },
  { id: 'inventoryPartNumber', label: 'Inventory Part Number', description: 'Inventory part/item number' },
  { id: 'batchLotNumber', label: 'Batch/Lot #', description: 'Batch or lot number' },
  { id: 'manufacturer', label: 'Manufacturer', description: 'Material manufacturer' },
  { id: 'rollNumber', label: 'Roll Number', description: 'Material roll number' },
  { id: 'expirationDate', label: 'Expiration Date', description: 'Material expiration date' },
  { id: 'receivedDate', label: 'Received Date', description: 'Date material was received' },
] as const;

interface InventoryItem {
  id: string;
  agPartNumber: string;
  name: string;
  description?: string;
}

interface MaterialRequirement {
  partId: string;
  partNumber: string;
  partName: string;
  requiredFields: string[]; // Which traceability fields are required for this material
  entryMethod: 'manual' | 'barcode'; // How the material will be entered/tracked
  traceabilityPhase?: 'START' | 'WORK' | 'FINISH'; // Which phase to capture traceability (default: START)
}

interface QCStandard {
  standard: string; // The QC check description
  tolerance: string; // Acceptable tolerance/variance
  requirement: string; // Specific requirement or specification
  hardQcStop?: boolean;
}

interface OvenCuringStep {
  temperature: string; // Oven temperature (e.g., "350°F")
  time: string; // Curing time (e.g., "2 hours")
}

interface CustomDataField {
  fieldName: string; // Display name (e.g., "Temperature", "Mold Number")
  fieldType: 'text' | 'number' | 'date' | 'textarea'; // Type of input field
  isRequired: boolean; // Whether the field is required
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

interface InstructionRef {
  documentId: string;
  title?: string;
  pageRange?: string;
  anchor?: string;
}

interface AiSnippet {
  title: string;
  bullets: string[];
  sourceDocumentId?: string;
  confidence?: number;
}

interface InstructionPack {
  workInstructionRefs: InstructionRef[];
  aiSnippets: AiSnippet[];
  specialNotes: string;
  media: { type: 'image' | 'pdf'; documentId: string; caption?: string }[];
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

interface SignatureConfig {
  startRequiresSignature: boolean;
  finishRequiresSignature: boolean;
  requiredSignatures: string[];
}

interface TimerConfig {
  enabled: boolean;
  defaultProgramId?: string;
  defaultProgramName?: string;
}

interface DepartmentConfiguration {
  materials: MaterialRequirement[];
  assignedTechnicianId: number | null;
  qcStandards: QCStandard[];
  ovenCuringSteps?: OvenCuringStep[];
  specialProcess?: string;
  specialProcessConfig?: SpecialProcessConfig;
  standardProcesses?: StandardProcess[];
  customDataFields?: CustomDataField[];
  startCustomDataFields?: CustomDataField[];
  finishCustomDataFields?: CustomDataField[];
  startQcStandards?: QCStandard[];
  finishQcStandards?: QCStandard[];
  startChecks?: PhaseCheck[];
  finishChecks?: PhaseCheck[];
  signatureConfig?: SignatureConfig;
  instructionPack?: InstructionPack;
  timerConfig?: TimerConfig;
}

interface PartRouting {
  id: string;
  inventoryItemId: string;
  partNumber: string;  // This comes from backend, keep as is for routing data
  partName: string;    // This comes from backend, keep as is for routing data
  departmentSequence: string[];
  traceabilityConfig: Record<string, string[]>; // Item-level traceability for manufactured item
  departmentMaterials?: Record<string, MaterialRequirement[]>; // Materials used in each department
  departmentConfig?: Record<string, DepartmentConfiguration>; // Complete department configuration
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_START_CHECKS: PhaseCheck[] = [
  {
    title: 'Badge Verified',
    instructions: 'Scan or enter employee badge to confirm authorized operator for this department',
    required: true,
    taskType: 'CHECK',
    timePolicy: 'AUTO_ON_START',
    requiresSignature: false,
    requiresCertification: false,
  },
  {
    title: 'Work Instruction Acknowledged',
    instructions: 'Review and acknowledge the current revision of the work instruction for this operation',
    required: true,
    taskType: 'CHECK',
    timePolicy: 'AUTO_ON_COMPLETE',
    requiresSignature: false,
    requiresCertification: false,
  },
  {
    title: 'Required Materials Scanned',
    instructions: 'Scan all required materials to verify lot numbers, expiration dates, and traceability records',
    required: true,
    taskType: 'TRACEABILITY',
    timePolicy: 'AUTO_ON_COMPLETE',
    requiresSignature: false,
    requiresCertification: false,
  },
];

const DEFAULT_FINISH_CHECKS: PhaseCheck[] = [
  {
    title: 'Visual Inspection',
    instructions: 'Perform visual inspection for defects, damage, and workmanship per AS9100 standards',
    required: true,
    taskType: 'QC',
    timePolicy: 'AUTO_ON_COMPLETE',
    requiresSignature: false,
    requiresCertification: false,
  },
  {
    title: 'Dimensional / Criteria Check',
    instructions: 'Verify critical dimensions and acceptance criteria are within tolerance per engineering drawing',
    required: true,
    taskType: 'QC',
    timePolicy: 'AUTO_ON_COMPLETE',
    requiresSignature: false,
    requiresCertification: false,
  },
  {
    title: 'Department Signoff',
    instructions: 'Lead or QC signature confirming all work in this department is complete and meets requirements',
    required: true,
    taskType: 'SIGNATURE',
    timePolicy: 'AUTO_ON_COMPLETE',
    requiresSignature: true,
    signatureRole: 'LEAD',
    requiresCertification: false,
  },
];

interface PartRoutingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editRouting?: PartRouting | null;
  poId?: number; // When provided, show only PO line items instead of inventory
}

export default function PartRoutingWizard({ open, onOpenChange, editRouting, poId }: PartRoutingWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedItemId, setSelectedItemId] = useState<string>(editRouting?.inventoryItemId || '');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(editRouting?.departmentSequence || []);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Department configuration state (replaces old separate states)
  const [departmentConfig, setDepartmentConfig] = useState<Record<string, DepartmentConfiguration>>(
    editRouting?.departmentConfig || {}
  );
  
  // UI state for materials search
  const [materialSearchTerm, setMaterialSearchTerm] = useState('');
  const [selectedDeptForConfig, setSelectedDeptForConfig] = useState<string>('');
  
  // UI state for QC standards input (per-department to prevent cross-department clearing)
  const [qcStandardInput, setQcStandardInput] = useState<string>('');
  const [qcToleranceInput, setQcToleranceInput] = useState<string>('');
  const [qcRequirementInput, setQcRequirementInput] = useState<string>('');
  const [qcInputDept, setQcInputDept] = useState<Record<string, { standard: string; tolerance: string; requirement: string }>>({});
  
  const [aiSnippetGenerating, setAiSnippetGenerating] = useState<string | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [docPickerDept, setDocPickerDept] = useState<string>('');
  const [docPickerSearch, setDocPickerSearch] = useState('');
  const [docPickerSelectedDoc, setDocPickerSelectedDoc] = useState<any>(null);
  const [docPickerSections, setDocPickerSections] = useState<any[]>([]);
  const [docPickerLoadingSections, setDocPickerLoadingSections] = useState(false);
  const [docPickerSelectedSections, setDocPickerSelectedSections] = useState<Set<string>>(new Set());
  const [docPickerUseWhole, setDocPickerUseWhole] = useState(true);
  
  // UI state for oven curing input
  const [ovenTemperatureInput, setOvenTemperatureInput] = useState<string>('');
  const [ovenTimeInput, setOvenTimeInput] = useState<string>('');
  
  const [showStdProcessDialog, setShowStdProcessDialog] = useState(false);
  const [stdProcessDept, setStdProcessDept] = useState<string>('');
  const [stdProcessEditIdx, setStdProcessEditIdx] = useState<number | null>(null);
  const [stdProcessName, setStdProcessName] = useState<string>('');
  const [stdProcessDescription, setStdProcessDescription] = useState<string>('');
  const [stdTechnicianId, setStdTechnicianId] = useState<string>('');
  const [stdMaterialSearch, setStdMaterialSearch] = useState<string>('');
  const [stdQcStandard, setStdQcStandard] = useState<string>('');
  const [stdQcTolerance, setStdQcTolerance] = useState<string>('');
  const [stdQcRequirement, setStdQcRequirement] = useState<string>('');
  const [stdFieldName, setStdFieldName] = useState<string>('');
  const [stdFieldType, setStdFieldType] = useState<'text' | 'number' | 'date' | 'textarea'>('text');
  const [stdFieldRequired, setStdFieldRequired] = useState<boolean>(false);

  // UI state for special process dialog
  const [showSpecialProcessDialog, setShowSpecialProcessDialog] = useState(false);
  const [specialProcessDept, setSpecialProcessDept] = useState<string>('');
  
  // UI state for special process config inputs
  const [spProcessName, setSpProcessName] = useState<string>('');
  const [spTechnicianId, setSpTechnicianId] = useState<string>('');
  const [spMaterialSearch, setSpMaterialSearch] = useState<string>('');
  const [spQcStandard, setSpQcStandard] = useState<string>('');
  const [spQcTolerance, setSpQcTolerance] = useState<string>('');
  const [spQcRequirement, setSpQcRequirement] = useState<string>('');
  const [spFieldName, setSpFieldName] = useState<string>('');
  const [spFieldType, setSpFieldType] = useState<'text' | 'number' | 'date' | 'textarea'>('text');
  const [spFieldRequired, setSpFieldRequired] = useState<boolean>(false);
  
  // UI state for custom data fields input
  const [customFieldName, setCustomFieldName] = useState<string>('');
  const [customFieldType, setCustomFieldType] = useState<'text' | 'number' | 'date' | 'textarea'>('text');
  const [customFieldRequired, setCustomFieldRequired] = useState<boolean>(false);
  
  // UI state for phase checks input
  const [startCheckTitle, setStartCheckTitle] = useState<string>('');
  const [startCheckInstructions, setStartCheckInstructions] = useState<string>('');
  const [finishCheckTitle, setFinishCheckTitle] = useState<string>('');
  const [finishCheckInstructions, setFinishCheckInstructions] = useState<string>('');
  
  // UI state for active phase tab per department
  const [activePhaseTab, setActivePhaseTab] = useState<Record<string, 'START' | 'WORK' | 'FINISH'>>({});
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sync state when wizard opens with editRouting data
  useEffect(() => {
    if (open && editRouting) {
      setSelectedItemId(editRouting.inventoryItemId || '');
      setSelectedDepartments(editRouting.departmentSequence || []);
      setDepartmentConfig(editRouting.departmentConfig || {});
      setStep(1);
    } else if (open && !editRouting) {
      // Reset for new routing
      setSelectedItemId('');
      setSelectedDepartments([]);
      setDepartmentConfig({});
      setStep(1);
    }
  }, [open, editRouting]);

  // Initialize department configs for all selected departments
  useEffect(() => {
    if (!open) return;
    
    const newConfig = { ...departmentConfig };
    let hasChanges = false;
    
    // Ensure every selected department has a config entry
    selectedDepartments.forEach(dept => {
      if (!newConfig[dept]) {
        newConfig[dept] = {
          materials: [],
          assignedTechnicianId: null,
          qcStandards: [],
        };
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      setDepartmentConfig(newConfig);
    }
  }, [selectedDepartments, open]);

  // Fetch all P2 PO items for step 1 (part selection)
  const { data: p2PoItems = [] } = useQuery<any[]>({
    queryKey: ['/api/p2-purchase-order-items'],
    enabled: open && step === 1,
  });

  // Fetch inventory items for step 3 (materials selection)
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    enabled: open && step === 3,
  });

  // Transform P2 PO items to match InventoryItem interface for the UI
  const displayItems: InventoryItem[] = p2PoItems.map((item: any) => ({
    id: String(item.id),
    agPartNumber: item.partNumber,
    name: item.partName,
    description: item.specifications || '',
  }));

  // Fetch employees for technician assignment
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    enabled: open && step === 3,
  });

  // Fetch all capabilities
  const { data: capabilities = [] } = useQuery<Capability[]>({
    queryKey: ['/api/employees/capabilities'],
    enabled: open && step === 3,
  });

  // Fetch employee capabilities (junction table)
  const { data: employeeCapabilities = [] } = useQuery<EmployeeCapability[]>({
    queryKey: ['/api/employees/employee-capabilities/all'],
    enabled: open && step === 3,
  });

  const { data: routingDepartments = [], isLoading: deptLoading } = useQuery<RoutingDepartment[]>({
    queryKey: ['/api/part-routings/departments/list'],
    enabled: open,
  });

  interface TimerProgram {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  }

  const { data: timerPrograms = [] } = useQuery<TimerProgram[]>({
    queryKey: ['/api/production/timers/programs'],
    enabled: open && step === 3,
  });

  const departmentNames = routingDepartments.length > 0
    ? routingDepartments.map(d => d.name)
    : DEFAULT_P2_DEPARTMENTS;

  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState('');
  const [deptSaving, setDeptSaving] = useState(false);

  const [trainingGenerating, setTrainingGenerating] = useState<string | null>(null);
  const [expandedTraining, setExpandedTraining] = useState<Record<string, boolean>>({});
  const [showQuizPreview, setShowQuizPreview] = useState<Record<string, boolean>>({});

  const { data: trainingPackages = [], refetch: refetchTraining } = useQuery<any[]>({
    queryKey: ['/api/part-routings', editRouting?.id, 'training'],
    queryFn: async () => {
      if (!editRouting?.id) return [];
      const res = await fetch(`/api/part-routings/${editRouting.id}/training`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!editRouting?.id && open && step === 3,
  });

  const getTrainingForDept = (dept: string) => {
    return trainingPackages.find((p: any) => p.departmentName === dept);
  };

  const handleGenerateTraining = async (dept: string) => {
    if (!editRouting?.id) {
      toast({ title: 'Save routing first', description: 'Please save the routing before generating training content.', variant: 'destructive' });
      return;
    }
    setTrainingGenerating(dept);
    try {
      const result = await apiRequest(`/api/part-routings/${editRouting.id}/generate-training`, {
        method: 'POST',
        body: JSON.stringify({ departmentName: dept }),
        timeout: 120000,
      });
      setExpandedTraining(prev => ({ ...prev, [dept]: true }));
      refetchTraining();
      toast({ title: 'Training & Quiz Generated', description: `Generated ${result.totalQuestions} quiz questions for ${dept}` });
    } catch (err: any) {
      toast({ title: 'Generation Failed', description: err.message || 'Could not generate training content', variant: 'destructive' });
    } finally {
      setTrainingGenerating(null);
    }
  };

  // Filter inventory items by search
  const filteredItems = displayItems.filter(item =>
    (item.agPartNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  // Selected inventory item
  const selectedItem = displayItems.find(item => item.id === selectedItemId);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editRouting) {
        return apiRequest(`/api/part-routings/${editRouting.id}`, {
          method: 'PATCH',
          body: data,
        });
      } else {
        return apiRequest('/api/part-routings', {
          method: 'POST',
          body: data,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
      toast({
        title: 'Success',
        description: editRouting ? 'Part routing updated' : 'Part routing created',
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save part routing',
        variant: 'destructive',
      });
    },
  });

  const resetState = () => {
    setStep(1);
    setSelectedItemId('');
    setSelectedDepartments([]);
    setDepartmentConfig({});
    setSearchTerm('');
    setMaterialSearchTerm('');
    setSelectedDeptForConfig('');
    setQcStandardInput('');
    setQcToleranceInput('');
    setQcRequirementInput('');
    setOvenTemperatureInput('');
    setOvenTimeInput('');
    setCustomFieldName('');
    setCustomFieldType('text');
    setCustomFieldRequired(false);
    setStartCheckTitle('');
    setStartCheckInstructions('');
    setFinishCheckTitle('');
    setFinishCheckInstructions('');
    setActivePhaseTab({});
    clearSpInputState();
    setSpecialProcessDept('');
    setShowSpecialProcessDialog(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleNext = () => {
    if (step === 1 && !selectedItemId) {
      toast({
        title: 'Selection Required',
        description: 'Please select a P2 product',
        variant: 'destructive',
      });
      return;
    }
    if (step === 2 && selectedDepartments.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select at least one department',
        variant: 'destructive',
      });
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleSave = () => {
    if (!selectedItem) return;

    // Build traceabilityConfig from departmentConfig materials' requiredFields
    // Preserve existing config when editing, only update departments that have materials configured
    const existingTraceabilityConfig = editRouting?.traceabilityConfig || {};
    const traceabilityConfig: Record<string, string[]> = { ...existingTraceabilityConfig };
    
    selectedDepartments.forEach(dept => {
      const config = departmentConfig[dept];
      if (config?.materials && config.materials.length > 0) {
        // Collect all unique required fields from all materials in this department
        const allFields = new Set<string>();
        config.materials.forEach(material => {
          material.requiredFields?.forEach(field => allFields.add(field));
        });
        traceabilityConfig[dept] = Array.from(allFields);
      } else if (!existingTraceabilityConfig[dept]) {
        // Only set empty array for new departments that don't have existing config
        traceabilityConfig[dept] = [];
      }
      // If department exists in existing config and no new materials, preserve existing
    });
    
    // Remove departments no longer in sequence
    Object.keys(traceabilityConfig).forEach(dept => {
      if (!selectedDepartments.includes(dept)) {
        delete traceabilityConfig[dept];
      }
    });

    // Ensure all material partIds are strings in departmentConfig
    const sanitizedDepartmentConfig: Record<string, DepartmentConfiguration> = {};
    Object.entries(departmentConfig).forEach(([dept, config]) => {
      sanitizedDepartmentConfig[dept] = {
        ...config,
        materials: config.materials.map(m => ({
          ...m,
          partId: String(m.partId), // Ensure partId is string
        })),
      };
    });

    const data = {
      inventoryItemId: String(selectedItem.id), // Ensure inventoryItemId is string
      partNumber: selectedItem.agPartNumber,
      partName: selectedItem.name,
      departmentSequence: selectedDepartments,
      traceabilityConfig,
      departmentConfig: sanitizedDepartmentConfig,
      createdBy: editRouting?.createdBy || 'system', // Preserve original creator when editing
    };

    saveMutation.mutate(data);
  };

  // Department configuration handlers
  const createDefaultDeptConfig = (): DepartmentConfiguration => ({
    materials: [],
    assignedTechnicianId: null,
    qcStandards: [],
    startChecks: DEFAULT_START_CHECKS.map(c => ({ ...c })),
    finishChecks: DEFAULT_FINISH_CHECKS.map(c => ({ ...c })),
    signatureConfig: {
      startRequiresSignature: false,
      finishRequiresSignature: true,
      requiredSignatures: ['LEAD'],
    },
  });

  const getOrCreateDeptConfig = (dept: string): DepartmentConfiguration => {
    return departmentConfig[dept] || createDefaultDeptConfig();
  };

  const addMaterialToDepartment = (dept: string, item: InventoryItem) => {
    const config = getOrCreateDeptConfig(dept);
    
    if (config.materials.some(m => m.partId === item.id)) {
      toast({
        title: 'Already Added',
        description: `${item.agPartNumber} is already in this department`,
        variant: 'destructive',
      });
      return;
    }

    const newMaterial: MaterialRequirement = {
      partId: item.id,
      partNumber: item.agPartNumber,
      partName: item.name,
      requiredFields: [],
      entryMethod: 'manual', // Default to manual entry
    };

    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        materials: [...config.materials, newMaterial],
      },
    });

    toast({
      title: 'Material Added',
      description: `${item.agPartNumber} added to ${dept}`,
    });
  };

  const removeMaterialFromDepartment = (dept: string, partId: string) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        materials: config.materials.filter(m => m.partId !== partId),
      },
    });
  };

  const toggleMaterialTraceability = (dept: string, partId: string, fieldId: string) => {
    const config = getOrCreateDeptConfig(dept);
    const updated = config.materials.map(material => {
      if (material.partId === partId) {
        const fields = material.requiredFields || [];
        return {
          ...material,
          requiredFields: fields.includes(fieldId)
            ? fields.filter(f => f !== fieldId)
            : [...fields, fieldId],
        };
      }
      return material;
    });

    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        materials: updated,
      },
    });
  };

  const toggleMaterialEntryMethod = (dept: string, partId: string) => {
    const config = getOrCreateDeptConfig(dept);
    const updated = config.materials.map(material => {
      if (material.partId === partId) {
        const newMethod: 'manual' | 'barcode' = material.entryMethod === 'manual' ? 'barcode' : 'manual';
        
        // When switching to barcode scan, automatically enable all traceability fields
        const requiredFields = newMethod === 'barcode'
          ? TRACEABILITY_FIELDS.map(field => field.id)
          : material.requiredFields;
        
        return {
          ...material,
          entryMethod: newMethod,
          requiredFields,
        };
      }
      return material;
    });

    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        materials: updated,
      },
    });
  };

  const setAssignedTechnician = (dept: string, technicianId: string) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        assignedTechnicianId: technicianId === '' || technicianId === 'NONE' ? null : parseInt(technicianId),
      },
    });
  };

  // Get certified employees for a specific department
  const getCertifiedEmployees = (department: string): Employee[] => {
    if (!selectedItem?.agPartNumber) return [];
    
    // Create the capability name that would match this part and department
    const partNumberNormalized = selectedItem.agPartNumber.replace(/[^a-zA-Z0-9]/g, '_');
    const departmentNormalized = department.replace(/[^a-zA-Z0-9]/g, '_');
    const capabilityName = `P2_CERT_${partNumberNormalized}_${departmentNormalized}`;
    
    // Find the capability ID for this certification
    const capability = capabilities.find(cap => cap.name === capabilityName);
    
    if (!capability) return [];
    
    // Find employees who have this capability
    const certifiedEmployeeIds = employeeCapabilities
      .filter(ec => ec.capabilityId === capability.id)
      .map(ec => ec.employeeId);
    
    // Return employees who have the capability
    return employees.filter(emp => certifiedEmployeeIds.includes(emp.id));
  };

  const addQcStandard = (dept: string) => {
    if (!qcStandardInput.trim() || !qcToleranceInput.trim() || !qcRequirementInput.trim()) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in all QC standard fields',
        variant: 'destructive',
      });
      return;
    }
    
    const config = getOrCreateDeptConfig(dept);
    const newStandard: QCStandard = {
      standard: qcStandardInput.trim(),
      tolerance: qcToleranceInput.trim(),
      requirement: qcRequirementInput.trim(),
    };

    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        qcStandards: [...config.qcStandards, newStandard],
      },
    });
    
    // Clear inputs
    setQcStandardInput('');
    setQcToleranceInput('');
    setQcRequirementInput('');
    
    toast({
      title: 'QC Standard Added',
      description: `"${newStandard.standard}" added to ${dept}`,
    });
  };

  const removeQcStandard = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        qcStandards: config.qcStandards.filter((_, i) => i !== index),
      },
    });
  };

  const addOvenCuringStep = (dept: string) => {
    if (!ovenTemperatureInput.trim() || !ovenTimeInput.trim()) {
      toast({
        title: 'Missing Fields',
        description: 'Please fill in both temperature and time',
        variant: 'destructive',
      });
      return;
    }
    
    const config = getOrCreateDeptConfig(dept);
    const newStep: OvenCuringStep = {
      temperature: ovenTemperatureInput.trim(),
      time: ovenTimeInput.trim(),
    };

    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        ovenCuringSteps: [...(config.ovenCuringSteps || []), newStep],
      },
    });
    
    // Clear inputs
    setOvenTemperatureInput('');
    setOvenTimeInput('');
    
    toast({
      title: 'Curing Step Added',
      description: `${newStep.temperature} for ${newStep.time}`,
    });
  };

  const removeOvenCuringStep = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        ovenCuringSteps: config.ovenCuringSteps?.filter((_, i) => i !== index),
      },
    });
  };

  const updateSpecialProcess = (dept: string, value: string) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        specialProcess: value,
      },
    });
  };

  const getStdProcessConfig = (dept: string, idx: number): StandardProcessConfig => {
    const config = getOrCreateDeptConfig(dept);
    const proc = config.standardProcesses?.[idx];
    return proc?.config || {
      processName: proc?.name || '',
      notes: proc?.description || '',
      requiredTechnicianId: null,
      materials: [],
      qcStandards: [],
      customDataFields: [],
    };
  };

  const updateStdProcessConfig = (updates: Partial<StandardProcessConfig>) => {
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const config = getOrCreateDeptConfig(stdProcessDept);
    const procs = [...(config.standardProcesses || [])];
    const proc = procs[stdProcessEditIdx];
    if (!proc) return;
    const currentConfig = proc.config || {
      processName: proc.name,
      notes: proc.description,
      requiredTechnicianId: null,
      materials: [],
      qcStandards: [],
      customDataFields: [],
    };
    procs[stdProcessEditIdx] = {
      ...proc,
      config: { ...currentConfig, ...updates },
    };
    if (updates.processName !== undefined) procs[stdProcessEditIdx].name = updates.processName;
    if (updates.notes !== undefined) procs[stdProcessEditIdx].description = updates.notes;
    setDepartmentConfig({
      ...departmentConfig,
      [stdProcessDept]: { ...config, standardProcesses: procs },
    });
  };

  const addStdMaterial = (item: InventoryItem) => {
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    if (cfg.materials.some(m => m.partId === item.id)) {
      toast({ title: 'Material already added', variant: 'destructive' });
      return;
    }
    updateStdProcessConfig({
      materials: [...cfg.materials, {
        partId: item.id,
        partNumber: item.agPartNumber,
        partName: item.name,
        requiredFields: [],
        entryMethod: 'manual',
      }],
    });
    setStdMaterialSearch('');
  };

  const removeStdMaterial = (partId: string) => {
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    updateStdProcessConfig({ materials: cfg.materials.filter(m => m.partId !== partId) });
  };

  const toggleStdMaterialField = (partId: string, fieldId: string) => {
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    updateStdProcessConfig({
      materials: cfg.materials.map(m => {
        if (m.partId === partId) {
          const fields = m.requiredFields.includes(fieldId)
            ? m.requiredFields.filter(f => f !== fieldId)
            : [...m.requiredFields, fieldId];
          return { ...m, requiredFields: fields };
        }
        return m;
      }),
    });
  };

  const addStdQcStandard = () => {
    if (!stdQcStandard.trim() || !stdQcTolerance.trim() || !stdQcRequirement.trim()) return;
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    updateStdProcessConfig({
      qcStandards: [...cfg.qcStandards, {
        standard: stdQcStandard.trim(),
        tolerance: stdQcTolerance.trim(),
        requirement: stdQcRequirement.trim(),
      }],
    });
    setStdQcStandard('');
    setStdQcTolerance('');
    setStdQcRequirement('');
  };

  const removeStdQcStandard = (index: number) => {
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    updateStdProcessConfig({ qcStandards: cfg.qcStandards.filter((_, i) => i !== index) });
  };

  const addStdCustomField = () => {
    if (!stdFieldName.trim()) return;
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    updateStdProcessConfig({
      customDataFields: [...cfg.customDataFields, {
        fieldName: stdFieldName.trim(),
        fieldType: stdFieldType,
        isRequired: stdFieldRequired,
      }],
    });
    setStdFieldName('');
    setStdFieldType('text');
    setStdFieldRequired(false);
  };

  const removeStdCustomField = (index: number) => {
    if (!stdProcessDept || stdProcessEditIdx === null) return;
    const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
    updateStdProcessConfig({ customDataFields: cfg.customDataFields.filter((_, i) => i !== index) });
  };

  const openStdProcessDialog = (dept: string, idx: number) => {
    const cfg = getStdProcessConfig(dept, idx);
    setStdProcessDept(dept);
    setStdProcessEditIdx(idx);
    setStdProcessName(cfg.processName);
    setStdProcessDescription(cfg.notes);
    setStdTechnicianId(cfg.requiredTechnicianId?.toString() || '');
    setShowStdProcessDialog(true);
  };

  const openNewStdProcessDialog = (dept: string) => {
    const config = getOrCreateDeptConfig(dept);
    const procs = config.standardProcesses || [];
    const newIdx = procs.length;
    const newProc: StandardProcess = {
      name: '',
      description: '',
      config: {
        processName: '',
        notes: '',
        requiredTechnicianId: null,
        materials: [],
        qcStandards: [],
        customDataFields: [],
      },
    };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, standardProcesses: [...procs, newProc] },
    });
    setStdProcessDept(dept);
    setStdProcessEditIdx(newIdx);
    setStdProcessName('');
    setStdProcessDescription('');
    setStdTechnicianId('');
    setShowStdProcessDialog(true);
  };

  const clearStdInputState = () => {
    setStdProcessName('');
    setStdProcessDescription('');
    setStdTechnicianId('');
    setStdMaterialSearch('');
    setStdQcStandard('');
    setStdQcTolerance('');
    setStdQcRequirement('');
    setStdFieldName('');
    setStdFieldType('text');
    setStdFieldRequired(false);
  };

  const removeStandardProcess = (dept: string, idx: number) => {
    const config = getOrCreateDeptConfig(dept);
    const updated = [...(config.standardProcesses || [])];
    updated.splice(idx, 1);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, standardProcesses: updated },
    });
  };

  // Get or create special process config for a department
  const getOrCreateSpConfig = (dept: string): SpecialProcessConfig => {
    const config = getOrCreateDeptConfig(dept);
    return config.specialProcessConfig || {
      processName: '',
      notes: '',
      requiredTechnicianId: null,
      materials: [],
      qcStandards: [],
      customDataFields: [],
    };
  };

  // Update special process config
  const updateSpConfig = (dept: string, updates: Partial<SpecialProcessConfig>) => {
    const config = getOrCreateDeptConfig(dept);
    const spConfig = getOrCreateSpConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        specialProcessConfig: {
          ...spConfig,
          ...updates,
        },
      },
    });
  };

  // Add material to special process
  const addSpMaterial = (dept: string, item: InventoryItem) => {
    const spConfig = getOrCreateSpConfig(dept);
    if (spConfig.materials.some(m => m.partId === item.id)) {
      toast({ title: 'Material already added', variant: 'destructive' });
      return;
    }
    const newMaterial: MaterialRequirement = {
      partId: item.id,
      partNumber: item.agPartNumber,
      partName: item.name,
      requiredFields: [],
      entryMethod: 'manual',
    };
    updateSpConfig(dept, {
      materials: [...spConfig.materials, newMaterial],
    });
    setSpMaterialSearch('');
  };

  // Remove material from special process
  const removeSpMaterial = (dept: string, partId: string) => {
    const spConfig = getOrCreateSpConfig(dept);
    updateSpConfig(dept, {
      materials: spConfig.materials.filter(m => m.partId !== partId),
    });
  };

  // Toggle traceability field for special process material
  const toggleSpMaterialField = (dept: string, partId: string, fieldId: string) => {
    const spConfig = getOrCreateSpConfig(dept);
    updateSpConfig(dept, {
      materials: spConfig.materials.map(m => {
        if (m.partId === partId) {
          const fields = m.requiredFields.includes(fieldId)
            ? m.requiredFields.filter(f => f !== fieldId)
            : [...m.requiredFields, fieldId];
          return { ...m, requiredFields: fields };
        }
        return m;
      }),
    });
  };

  // Add QC standard to special process
  const addSpQcStandard = (dept: string) => {
    if (!spQcStandard.trim() || !spQcTolerance.trim() || !spQcRequirement.trim()) {
      toast({ title: 'Fill all QC fields', variant: 'destructive' });
      return;
    }
    const spConfig = getOrCreateSpConfig(dept);
    updateSpConfig(dept, {
      qcStandards: [...spConfig.qcStandards, {
        standard: spQcStandard.trim(),
        tolerance: spQcTolerance.trim(),
        requirement: spQcRequirement.trim(),
      }],
    });
    setSpQcStandard('');
    setSpQcTolerance('');
    setSpQcRequirement('');
  };

  // Remove QC standard from special process
  const removeSpQcStandard = (dept: string, index: number) => {
    const spConfig = getOrCreateSpConfig(dept);
    updateSpConfig(dept, {
      qcStandards: spConfig.qcStandards.filter((_, i) => i !== index),
    });
  };

  // Add custom field to special process
  const addSpCustomField = (dept: string) => {
    if (!spFieldName.trim()) {
      toast({ title: 'Enter field name', variant: 'destructive' });
      return;
    }
    const spConfig = getOrCreateSpConfig(dept);
    updateSpConfig(dept, {
      customDataFields: [...spConfig.customDataFields, {
        fieldName: spFieldName.trim(),
        fieldType: spFieldType,
        isRequired: spFieldRequired,
      }],
    });
    setSpFieldName('');
    setSpFieldType('text');
    setSpFieldRequired(false);
  };

  // Remove custom field from special process
  const removeSpCustomField = (dept: string, index: number) => {
    const spConfig = getOrCreateSpConfig(dept);
    updateSpConfig(dept, {
      customDataFields: spConfig.customDataFields.filter((_, i) => i !== index),
    });
  };

  // Load special process config into state when dialog opens
  const openSpecialProcessDialog = (dept: string) => {
    const spConfig = getOrCreateSpConfig(dept);
    setSpProcessName(spConfig.processName);
    setSpTechnicianId(spConfig.requiredTechnicianId?.toString() || '');
    setSpecialProcessDept(dept);
    setShowSpecialProcessDialog(true);
  };

  // Clear special process input state
  const clearSpInputState = () => {
    setSpProcessName('');
    setSpTechnicianId('');
    setSpMaterialSearch('');
    setSpQcStandard('');
    setSpQcTolerance('');
    setSpQcRequirement('');
    setSpFieldName('');
    setSpFieldType('text');
    setSpFieldRequired(false);
  };

  const addCustomDataField = (dept: string) => {
    if (!customFieldName.trim()) {
      toast({
        title: 'Missing Field Name',
        description: 'Please enter a field name',
        variant: 'destructive',
      });
      return;
    }
    
    const config = getOrCreateDeptConfig(dept);
    const newField: CustomDataField = {
      fieldName: customFieldName.trim(),
      fieldType: customFieldType,
      isRequired: customFieldRequired,
    };

    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        customDataFields: [...(config.customDataFields || []), newField],
      },
    });
    
    // Clear inputs
    setCustomFieldName('');
    setCustomFieldType('text');
    setCustomFieldRequired(false);
    
    toast({
      title: 'Custom Field Added',
      description: `"${newField.fieldName}" added to ${dept}`,
    });
  };

  const removeCustomDataField = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        customDataFields: config.customDataFields?.filter((_, i) => i !== index),
      },
    });
  };

  const addPhaseCustomField = (dept: string, phase: 'start' | 'finish') => {
    if (!customFieldName.trim()) {
      toast({ title: 'Missing Field Name', description: 'Please enter a field name', variant: 'destructive' });
      return;
    }
    const config = getOrCreateDeptConfig(dept);
    const newField: CustomDataField = { fieldName: customFieldName.trim(), fieldType: customFieldType, isRequired: customFieldRequired };
    const key = phase === 'start' ? 'startCustomDataFields' : 'finishCustomDataFields';
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, [key]: [...(config[key] || []), newField] },
    });
    setCustomFieldName('');
    setCustomFieldType('text');
    setCustomFieldRequired(false);
    toast({ title: 'Field Added', description: `"${newField.fieldName}" added to ${phase.toUpperCase()} phase of ${dept}` });
  };

  const removePhaseCustomField = (dept: string, phase: 'start' | 'finish', index: number) => {
    const config = getOrCreateDeptConfig(dept);
    const key = phase === 'start' ? 'startCustomDataFields' : 'finishCustomDataFields';
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, [key]: (config[key] || []).filter((_, i) => i !== index) },
    });
  };

  const addStartQcStandard = (dept: string, standard?: string, tolerance?: string, requirement?: string) => {
    const s = standard || qcStandardInput;
    const t = tolerance || qcToleranceInput;
    const r = requirement || qcRequirementInput;
    if (!s.trim() || !t.trim() || !r.trim()) return;
    const config = getOrCreateDeptConfig(dept);
    const newStandard: QCStandard = { standard: s.trim(), tolerance: t.trim(), requirement: r.trim() };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, startQcStandards: [...(config.startQcStandards || []), newStandard] },
    });
    toast({ title: 'QC Standard Added', description: `Added to START phase of ${dept}` });
  };

  const removeStartQcStandard = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, startQcStandards: (config.startQcStandards || []).filter((_, i) => i !== index) },
    });
  };

  const addFinishQcStandard = (dept: string, standard?: string, tolerance?: string, requirement?: string) => {
    const s = standard || qcStandardInput;
    const t = tolerance || qcToleranceInput;
    const r = requirement || qcRequirementInput;
    if (!s.trim() || !t.trim() || !r.trim()) return;
    const config = getOrCreateDeptConfig(dept);
    const newStandard: QCStandard = { standard: s.trim(), tolerance: t.trim(), requirement: r.trim() };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, finishQcStandards: [...(config.finishQcStandards || []), newStandard] },
    });
    toast({ title: 'QC Standard Added', description: `Added to FINISH phase of ${dept}` });
  };

  const removeFinishQcStandard = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, finishQcStandards: (config.finishQcStandards || []).filter((_, i) => i !== index) },
    });
  };

  const updateQcStandardProperty = (dept: string, phase: 'start' | 'finish', index: number, updates: Partial<QCStandard>) => {
    const config = getOrCreateDeptConfig(dept);
    const key = phase === 'start' ? 'startQcStandards' : 'finishQcStandards';
    const standards = [...(config[key] || [])];
    standards[index] = { ...standards[index], ...updates };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, [key]: standards },
    });
  };

  const addStartCheck = (dept: string) => {
    if (!startCheckTitle.trim()) return;
    const config = getOrCreateDeptConfig(dept);
    const newCheck: PhaseCheck = {
      title: startCheckTitle.trim(),
      instructions: startCheckInstructions.trim() || undefined,
      required: true,
      taskType: 'CHECK',
      timePolicy: 'AUTO_ON_COMPLETE',
      requiresSignature: false,
      requiresCertification: false,
    };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, startChecks: [...(config.startChecks || []), newCheck] },
    });
    setStartCheckTitle('');
    setStartCheckInstructions('');
  };

  const removeStartCheck = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, startChecks: config.startChecks?.filter((_, i) => i !== index) },
    });
  };

  const addFinishCheck = (dept: string) => {
    if (!finishCheckTitle.trim()) return;
    const config = getOrCreateDeptConfig(dept);
    const newCheck: PhaseCheck = {
      title: finishCheckTitle.trim(),
      instructions: finishCheckInstructions.trim() || undefined,
      required: true,
      taskType: 'CHECK',
      timePolicy: 'AUTO_ON_COMPLETE',
      requiresSignature: false,
      requiresCertification: false,
    };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, finishChecks: [...(config.finishChecks || []), newCheck] },
    });
    setFinishCheckTitle('');
    setFinishCheckInstructions('');
  };

  const removeFinishCheck = (dept: string, index: number) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, finishChecks: config.finishChecks?.filter((_, i) => i !== index) },
    });
  };

  const toggleCheckSignatureRequired = (dept: string, phase: 'start' | 'finish', index: number) => {
    const config = getOrCreateDeptConfig(dept);
    const key = phase === 'start' ? 'startChecks' : 'finishChecks';
    const checks = [...(config[key] || [])];
    if (checks[index]) {
      checks[index] = { ...checks[index], requiresSignature: !checks[index].requiresSignature };
    }
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, [key]: checks },
    });
  };

  const updateCheckProperty = (dept: string, phase: 'start' | 'finish', index: number, updates: Partial<PhaseCheck>) => {
    const config = getOrCreateDeptConfig(dept);
    const key = phase === 'start' ? 'startChecks' : 'finishChecks';
    const checks = [...(config[key] || [])];
    if (checks[index]) {
      checks[index] = { ...checks[index], ...updates };
    }
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, [key]: checks },
    });
  };

  const updateSignatureConfig = (dept: string, updates: Partial<SignatureConfig>) => {
    const config = getOrCreateDeptConfig(dept);
    const current = config.signatureConfig || {
      startRequiresSignature: false,
      finishRequiresSignature: true,
      requiredSignatures: ['operator'],
    };
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: { ...config, signatureConfig: { ...current, ...updates } },
    });
  };

  const toggleRequiredSignature = (dept: string, role: string) => {
    const config = getOrCreateDeptConfig(dept);
    const current = config.signatureConfig || {
      startRequiresSignature: false,
      finishRequiresSignature: true,
      requiredSignatures: ['operator'],
    };
    const roles = current.requiredSignatures.includes(role)
      ? current.requiredSignatures.filter(r => r !== role)
      : [...current.requiredSignatures, role];
    updateSignatureConfig(dept, { requiredSignatures: roles });
  };

  const toggleDepartment = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
      const newConfig = { ...departmentConfig };
      delete newConfig[dept];
      setDepartmentConfig(newConfig);
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
      if (!departmentConfig[dept]) {
        setDepartmentConfig({
          ...departmentConfig,
          [dept]: createDefaultDeptConfig(),
        });
      }
    }
  };

  const moveDepartmentUp = (index: number) => {
    if (index === 0) return;
    const newDepts = [...selectedDepartments];
    [newDepts[index - 1], newDepts[index]] = [newDepts[index], newDepts[index - 1]];
    setSelectedDepartments(newDepts);
  };

  const moveDepartmentDown = (index: number) => {
    if (index === selectedDepartments.length - 1) return;
    const newDepts = [...selectedDepartments];
    [newDepts[index], newDepts[index + 1]] = [newDepts[index + 1], newDepts[index]];
    setSelectedDepartments(newDepts);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-part-routing-wizard">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            {editRouting ? 'Edit Part Routing' : 'Create Part Routing'}
          </DialogTitle>
          <DialogDescription>
            Configure department workflow and traceability requirements for inventory items
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                  s === step
                    ? 'border-primary bg-primary text-primary-foreground'
                    : s < step
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground bg-background'
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        <ScrollArea className="h-[50vh] max-h-[500px] pr-4">
          {/* Step 1: Select P2 Product Item */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Step 1: Select P2 Product</h3>
                <p className="text-sm text-muted-foreground">
                  Choose the P2 product that needs a custom routing workflow
                </p>
              </div>

              <div>
                <Label htmlFor="product-select">P2 Product</Label>
                <Select
                  value={selectedItemId}
                  onValueChange={(value) => setSelectedItemId(value)}
                >
                  <SelectTrigger id="product-select" data-testid="select-p2-product">
                    <SelectValue placeholder="Select a P2 product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {displayItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.agPartNumber} - {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedItem && (
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono font-semibold">{selectedItem.agPartNumber}</span>
                      <span className="text-sm">- {selectedItem.name}</span>
                    </div>
                    {selectedItem.description && (
                      <p className="text-xs text-muted-foreground mt-2">{selectedItem.description}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 2: Configure Department Sequence */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Step 2: Configure Department Sequence</h3>
                <p className="text-sm text-muted-foreground">
                  Select departments and arrange them in processing order
                </p>
              </div>

              {selectedItem && (
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono font-semibold">{selectedItem.agPartNumber}</span>
                      <span className="text-sm">- {selectedItem.name}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Available Departments</Label>
                  </div>
                  <div className="mt-2 space-y-2">
                    {departmentNames.filter(d => !selectedDepartments.includes(d)).map((dept) => {
                      const deptRecord = routingDepartments.find(rd => rd.name === dept);
                      return (
                        <div key={dept} className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            className="flex-1 justify-start"
                            onClick={() => toggleDepartment(dept)}
                            data-testid={`button-add-dept-${dept.toLowerCase().replace(/[\/\s]/g, '-')}`}
                          >
                            <ChevronRight className="mr-2 h-4 w-4" />
                            {dept}
                          </Button>
                          {deptRecord && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => { setEditingDeptId(deptRecord.id); setEditingDeptName(deptRecord.name); }}
                            >
                              <PenLine className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {editingDeptId && (
                      <div className="flex gap-2 p-2 border rounded bg-blue-50 dark:bg-blue-950">
                        <Input
                          className="text-sm flex-1"
                          value={editingDeptName}
                          onChange={(e) => setEditingDeptName(e.target.value)}
                          placeholder="Department name"
                        />
                        <Button
                          size="sm"
                          disabled={deptSaving || !editingDeptName.trim()}
                          onClick={async () => {
                            setDeptSaving(true);
                            try {
                              const oldDept = routingDepartments.find(d => d.id === editingDeptId);
                              await apiRequest(`/api/part-routings/departments/${editingDeptId}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ name: editingDeptName.trim() }),
                              });
                              if (oldDept) {
                                setSelectedDepartments(prev => prev.map(d => d === oldDept.name ? editingDeptName.trim() : d));
                                setDepartmentConfig(prev => {
                                  const updated = { ...prev };
                                  if (updated[oldDept.name]) {
                                    updated[editingDeptName.trim()] = updated[oldDept.name];
                                    delete updated[oldDept.name];
                                  }
                                  return updated;
                                });
                              }
                              queryClient.invalidateQueries({ queryKey: ['/api/part-routings/departments/list'] });
                              setEditingDeptId(null);
                              setEditingDeptName('');
                              toast({ title: 'Department updated' });
                            } catch (err) {
                              toast({ title: 'Failed to update department', variant: 'destructive' });
                            } finally {
                              setDeptSaving(false);
                            }
                          }}
                        >
                          {deptSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingDeptId(null); setEditingDeptName(''); }}>
                          <X className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={deptSaving}
                          onClick={async () => {
                            setDeptSaving(true);
                            try {
                              await apiRequest(`/api/part-routings/departments/${editingDeptId}`, { method: 'DELETE' });
                              const oldDept = routingDepartments.find(d => d.id === editingDeptId);
                              if (oldDept) {
                                setSelectedDepartments(prev => prev.filter(d => d !== oldDept.name));
                              }
                              queryClient.invalidateQueries({ queryKey: ['/api/part-routings/departments/list'] });
                              setEditingDeptId(null);
                              setEditingDeptName('');
                              toast({ title: 'Department removed' });
                            } catch (err) {
                              toast({ title: 'Failed to remove department', variant: 'destructive' });
                            } finally {
                              setDeptSaving(false);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex gap-2">
                      <Input
                        className="text-sm flex-1"
                        placeholder="New department name..."
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newDeptName.trim()) {
                            (e.target as HTMLInputElement).blur();
                            document.getElementById('btn-add-dept')?.click();
                          }
                        }}
                      />
                      <Button
                        id="btn-add-dept"
                        size="sm"
                        variant="outline"
                        disabled={deptSaving || !newDeptName.trim() || departmentNames.includes(newDeptName.trim())}
                        onClick={async () => {
                          setDeptSaving(true);
                          try {
                            await apiRequest('/api/part-routings/departments', {
                              method: 'POST',
                              body: { name: newDeptName.trim() },
                            });
                            queryClient.invalidateQueries({ queryKey: ['/api/part-routings/departments/list'] });
                            setNewDeptName('');
                            toast({ title: `Department "${newDeptName.trim()}" added` });
                          } catch (err: any) {
                            console.error('Failed to add department:', err);
                            toast({ title: 'Failed to add department', description: err?.message || 'Unknown error', variant: 'destructive' });
                          } finally {
                            setDeptSaving(false);
                          }
                        }}
                      >
                        {deptSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Selected Sequence ({selectedDepartments.length})</Label>
                  <div className="mt-2 space-y-2">
                    {selectedDepartments.map((dept, index) => (
                      <div
                        key={dept}
                        className="flex items-center gap-2 p-2 border rounded bg-primary/5"
                        data-testid={`item-selected-dept-${dept.toLowerCase().replace(/[\/\s]/g, '-')}`}
                      >
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-4 w-6 p-0"
                            onClick={() => moveDepartmentUp(index)}
                            disabled={index === 0}
                          >
                            <ChevronLeft className="h-3 w-3 rotate-90" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-4 w-6 p-0"
                            onClick={() => moveDepartmentDown(index)}
                            disabled={index === selectedDepartments.length - 1}
                          >
                            <ChevronLeft className="h-3 w-3 -rotate-90" />
                          </Button>
                        </div>
                        <Badge variant="outline" className="flex-1">
                          {index + 1}. {dept}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleDepartment(dept)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Department Configuration - Three Phase Layout */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Step 3: Department Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Configure each department's three execution phases: START checks, WORK processes, and FINISH checks with signature requirements
                </p>
              </div>

              {selectedDepartments.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No departments selected. Go back to Step 2 to add departments.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {selectedDepartments.map((dept, deptIdx) => {
                    const config = getOrCreateDeptConfig(dept);
                    const sigConfig = config.signatureConfig || { startRequiresSignature: false, finishRequiresSignature: true, requiredSignatures: ['operator'] };
                    const currentPhase = activePhaseTab[dept] || 'START';
                    const filteredMaterialItems = inventoryItems.filter(item =>
                      (item.agPartNumber?.toLowerCase() || '').includes(materialSearchTerm.toLowerCase()) ||
                      (item.name?.toLowerCase() || '').includes(materialSearchTerm.toLowerCase())
                    );

                    const deptColors = [
                      { border: 'border-l-blue-500', bg: 'bg-blue-50/30 dark:bg-blue-950/20', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', dot: 'bg-blue-500' },
                      { border: 'border-l-emerald-500', bg: 'bg-emerald-50/30 dark:bg-emerald-950/20', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200', dot: 'bg-emerald-500' },
                      { border: 'border-l-violet-500', bg: 'bg-violet-50/30 dark:bg-violet-950/20', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200', dot: 'bg-violet-500' },
                      { border: 'border-l-orange-500', bg: 'bg-orange-50/30 dark:bg-orange-950/20', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', dot: 'bg-orange-500' },
                      { border: 'border-l-rose-500', bg: 'bg-rose-50/30 dark:bg-rose-950/20', badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200', dot: 'bg-rose-500' },
                      { border: 'border-l-cyan-500', bg: 'bg-cyan-50/30 dark:bg-cyan-950/20', badge: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200', dot: 'bg-cyan-500' },
                      { border: 'border-l-amber-500', bg: 'bg-amber-50/30 dark:bg-amber-950/20', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200', dot: 'bg-amber-500' },
                      { border: 'border-l-indigo-500', bg: 'bg-indigo-50/30 dark:bg-indigo-950/20', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200', dot: 'bg-indigo-500' },
                      { border: 'border-l-teal-500', bg: 'bg-teal-50/30 dark:bg-teal-950/20', badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200', dot: 'bg-teal-500' },
                      { border: 'border-l-pink-500', bg: 'bg-pink-50/30 dark:bg-pink-950/20', badge: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200', dot: 'bg-pink-500' },
                    ];
                    const dc = deptColors[deptIdx % deptColors.length];

                    return (
                      <Card key={dept} className={`border-l-4 ${dc.border} ${dc.bg}`}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`h-3 w-3 rounded-full ${dc.dot}`} />
                              <CardTitle className="text-base">{dept}</CardTitle>
                              <Badge className={`text-[10px] px-1.5 py-0 ${dc.badge}`}>Step {deptIdx + 1}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4 text-muted-foreground" />
                              {(() => {
                                const certifiedEmployees = getCertifiedEmployees(dept);
                                if (certifiedEmployees.length === 0) {
                                  return <span className="text-xs text-muted-foreground">No certified techs</span>;
                                }
                                return (
                                  <Select
                                    value={config.assignedTechnicianId?.toString() || 'NONE'}
                                    onValueChange={(val) => setAssignedTechnician(dept, val)}
                                  >
                                    <SelectTrigger className="w-[180px] h-8 text-xs">
                                      <SelectValue placeholder="Assign technician" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="NONE">No technician</SelectItem>
                                      {certifiedEmployees.map((emp) => (
                                        <SelectItem key={emp.id} value={emp.id.toString()}>{emp.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Phase Tabs */}
                          <div className="flex gap-1 mt-3">
                            {([
                              { key: 'START' as const, label: 'START', icon: PlayCircle, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800', count: (config.startChecks?.length || 0) + (config.startCustomDataFields?.length || 0) + (config.startQcStandards?.length || 0) },
                              { key: 'WORK' as const, label: 'WORK', icon: Wrench, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800', count: (config.ovenCuringSteps?.length || 0) + (config.standardProcesses?.length || 0) + (config.specialProcessConfig?.processName ? 1 : 0) + (config.instructionPack?.workInstructionRefs?.length || 0) + (config.instructionPack?.aiSnippets?.length || 0) + (config.instructionPack?.specialNotes ? 1 : 0) + (config.instructionPack?.media?.length || 0) + (config.timerConfig?.enabled ? 1 : 0) },
                              { key: 'FINISH' as const, label: 'FINISH', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800', count: (config.finishChecks?.length || 0) + (config.finishCustomDataFields?.length || 0) + (config.finishQcStandards?.length || 0) + (sigConfig.requiredSignatures.length) },
                            ]).map(phase => (
                              <button
                                key={phase.key}
                                type="button"
                                onClick={() => setActivePhaseTab({ ...activePhaseTab, [dept]: phase.key })}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all flex-1 ${
                                  currentPhase === phase.key
                                    ? `${phase.bg} ${phase.color} border-current`
                                    : 'bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50'
                                }`}
                              >
                                <phase.icon className="h-3.5 w-3.5" />
                                {phase.label}
                                {phase.count > 0 && (
                                  <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">{phase.count}</Badge>
                                )}
                              </button>
                            ))}
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-0">
                          {/* ==================== START PHASE ==================== */}
                          {currentPhase === 'START' && (
                            <div className="space-y-4">
                              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900">
                                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                                  Pre-flight checks and gate requirements before work begins. Badge scan is always required to start.
                                </p>
                              </div>

                              {/* Start Checks */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-blue-600" />
                                    Gate Checks ({config.startChecks?.length || 0})
                                  </h4>
                                  {(!config.startChecks || config.startChecks.length === 0) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setDepartmentConfig(prev => ({
                                          ...prev,
                                          [dept]: { ...config, startChecks: DEFAULT_START_CHECKS.map(c => ({ ...c })) },
                                        }));
                                      }}
                                    >
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                      Load Defaults
                                    </Button>
                                  )}
                                </div>
                                {config.startChecks && config.startChecks.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.startChecks.map((check, idx) => (
                                      <div key={idx} className="p-2 rounded border bg-background space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <Check className="h-4 w-4 text-blue-600 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{check.title}</p>
                                            {check.instructions && <p className="text-xs text-muted-foreground truncate">{check.instructions}</p>}
                                          </div>
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeStartCheck(dept, idx)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 pl-6">
                                          <Badge variant="outline" className="text-[10px]">{check.taskType || 'CHECK'}</Badge>
                                          <Badge variant="outline" className="text-[10px]">{(check.timePolicy || 'AUTO_ON_COMPLETE').replace(/_/g, ' ')}</Badge>
                                          <Badge
                                            variant={check.requiresSignature ? 'default' : 'outline'}
                                            className="text-[10px] cursor-pointer"
                                            onClick={() => toggleCheckSignatureRequired(dept, 'start', idx)}
                                          >
                                            <PenLine className="h-2.5 w-2.5 mr-0.5" />
                                            {check.requiresSignature ? (check.signatureRole || 'OPERATOR') : 'No Sig'}
                                          </Badge>
                                          {check.requiresSignature && (
                                            <Select
                                              value={check.signatureRole || 'OPERATOR'}
                                              onValueChange={(val) => updateCheckProperty(dept, 'start', idx, { signatureRole: val as any })}
                                            >
                                              <SelectTrigger className="h-5 w-24 text-[10px] border-0 p-0 px-1"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="OPERATOR">Operator</SelectItem>
                                                <SelectItem value="LEAD">Lead</SelectItem>
                                                <SelectItem value="QC">QC</SelectItem>
                                                <SelectItem value="ENGINEERING">Engineering</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          )}
                                          <Badge
                                            variant={check.requiresCertification ? 'default' : 'outline'}
                                            className="text-[10px] cursor-pointer"
                                            onClick={() => updateCheckProperty(dept, 'start', idx, { requiresCertification: !check.requiresCertification })}
                                          >
                                            Cert {check.requiresCertification ? 'Yes' : 'No'}
                                          </Badge>
                                          <Badge
                                            variant={check.hardQcStop ? 'destructive' : 'outline'}
                                            className={`text-[10px] cursor-pointer ${check.hardQcStop ? '' : 'text-muted-foreground'}`}
                                            onClick={() => updateCheckProperty(dept, 'start', idx, { hardQcStop: !check.hardQcStop })}
                                          >
                                            <Flag className={`h-2.5 w-2.5 mr-0.5 ${check.hardQcStop ? 'text-white' : ''}`} />
                                            {check.hardQcStop ? 'Hard QC Stop' : 'No Stop'}
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Check title (e.g., Verify Work Order)"
                                    value={selectedDeptForConfig === dept ? startCheckTitle : ''}
                                    onChange={(e) => { setSelectedDeptForConfig(dept); setStartCheckTitle(e.target.value); }}
                                    onFocus={() => setSelectedDeptForConfig(dept)}
                                    className="text-sm"
                                  />
                                  <Button size="sm" onClick={() => addStartCheck(dept)} disabled={!startCheckTitle.trim() || selectedDeptForConfig !== dept}>
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                {selectedDeptForConfig === dept && startCheckTitle && (
                                  <Input
                                    placeholder="Instructions (optional)"
                                    value={startCheckInstructions}
                                    onChange={(e) => setStartCheckInstructions(e.target.value)}
                                    className="text-sm mt-1"
                                  />
                                )}
                              </div>

                              <Separator />

                              {/* START Phase Custom Data Fields */}
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <PenLine className="h-4 w-4 text-blue-600" />
                                  Start Phase Data Fields ({config.startCustomDataFields?.length || 0})
                                </h4>
                                <p className="text-xs text-muted-foreground mb-2">Fields operators fill in during the START phase (e.g., incoming inspection data).</p>
                                {config.startCustomDataFields && config.startCustomDataFields.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.startCustomDataFields.map((field, idx) => (
                                      <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{field.fieldName}</p>
                                          <div className="flex gap-1 mt-0.5">
                                            <Badge variant="outline" className="text-[10px]">{field.fieldType}</Badge>
                                            {field.isRequired && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                                          </div>
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePhaseCustomField(dept, 'start', idx)}>
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <div className="flex gap-2">
                                    <Input placeholder="Field Name" value={selectedDeptForConfig === dept ? customFieldName : ''} onChange={(e) => { setSelectedDeptForConfig(dept); setCustomFieldName(e.target.value); }} onFocus={() => setSelectedDeptForConfig(dept)} className="text-sm" />
                                    <Select value={selectedDeptForConfig === dept ? customFieldType : 'text'} onValueChange={(val: 'text' | 'number' | 'date' | 'textarea') => { setSelectedDeptForConfig(dept); setCustomFieldType(val); }}>
                                      <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="textarea">Text Area</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox id={`start-field-req-${dept}`} checked={selectedDeptForConfig === dept ? customFieldRequired : false} onCheckedChange={(checked) => { setSelectedDeptForConfig(dept); setCustomFieldRequired(checked as boolean); }} />
                                      <Label htmlFor={`start-field-req-${dept}`} className="text-xs cursor-pointer">Required</Label>
                                    </div>
                                    <Button size="sm" onClick={() => addPhaseCustomField(dept, 'start')} disabled={!customFieldName.trim() || selectedDeptForConfig !== dept}>
                                      <Plus className="h-4 w-4 mr-1" /> Add Field
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <Separator />

                              {/* START Phase QC Standards (Incoming Inspection) */}
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <CheckSquare className="h-4 w-4 text-blue-600" />
                                  Start Phase QC ({config.startQcStandards?.length || 0})
                                </h4>
                                <p className="text-xs text-muted-foreground mb-2">Incoming inspection or pre-work quality checks.</p>
                                {config.startQcStandards && config.startQcStandards.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.startQcStandards.map((qc, idx) => (
                                      <div key={idx} className="p-2 rounded border bg-background space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{qc.standard}</p>
                                            <p className="text-[10px] text-muted-foreground">Tol: {qc.tolerance} | Req: {qc.requirement}</p>
                                          </div>
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeStartQcStandard(dept, idx)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 pl-1">
                                          <Badge
                                            variant={qc.hardQcStop ? 'destructive' : 'outline'}
                                            className={`text-[10px] cursor-pointer ${qc.hardQcStop ? '' : 'text-muted-foreground'}`}
                                            onClick={() => updateQcStandardProperty(dept, 'start', idx, { hardQcStop: !qc.hardQcStop })}
                                          >
                                            <Flag className={`h-2.5 w-2.5 mr-0.5 ${qc.hardQcStop ? 'text-white' : ''}`} />
                                            {qc.hardQcStop ? 'Hard QC Stop' : 'No Stop'}
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Input placeholder="QC Standard" value={qcInputDept[`start_${dept}`]?.standard || ''} onChange={(e) => setQcInputDept(prev => ({ ...prev, [`start_${dept}`]: { ...(prev[`start_${dept}`] || { standard: '', tolerance: '', requirement: '' }), standard: e.target.value } }))} className="text-sm" />
                                  <div className="flex gap-2">
                                    <Input placeholder="Tolerance" value={qcInputDept[`start_${dept}`]?.tolerance || ''} onChange={(e) => setQcInputDept(prev => ({ ...prev, [`start_${dept}`]: { ...(prev[`start_${dept}`] || { standard: '', tolerance: '', requirement: '' }), tolerance: e.target.value } }))} className="text-sm" />
                                    <Input placeholder="Requirement" value={qcInputDept[`start_${dept}`]?.requirement || ''} onChange={(e) => setQcInputDept(prev => ({ ...prev, [`start_${dept}`]: { ...(prev[`start_${dept}`] || { standard: '', tolerance: '', requirement: '' }), requirement: e.target.value } }))} className="text-sm" />
                                  </div>
                                  <Button size="sm" onClick={() => {
                                    const vals = qcInputDept[`start_${dept}`];
                                    if (!vals?.standard?.trim() || !vals?.tolerance?.trim() || !vals?.requirement?.trim()) return;
                                    addStartQcStandard(dept, vals.standard, vals.tolerance, vals.requirement);
                                    setQcInputDept(prev => ({ ...prev, [`start_${dept}`]: { standard: '', tolerance: '', requirement: '' } }));
                                  }} disabled={!qcInputDept[`start_${dept}`]?.standard?.trim() || !qcInputDept[`start_${dept}`]?.tolerance?.trim() || !qcInputDept[`start_${dept}`]?.requirement?.trim()}>
                                    <Plus className="h-4 w-4 mr-1" /> Add QC Standard
                                  </Button>
                                </div>
                              </div>

                            </div>
                          )}

                          {/* ==================== WORK PHASE ==================== */}
                          {currentPhase === 'WORK' && (
                            <div className="space-y-4">
                              <div className="p-3 bg-amber-50/50 dark:bg-amber-950/30 rounded-lg border border-amber-100 dark:border-amber-900">
                                <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                                  Operations and processes performed during this department step.
                                </p>
                              </div>

                              {/* Instruction Pack */}
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <BookOpen className="h-4 w-4 text-amber-600" />
                                  Instruction Pack
                                </h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Attach work instructions, AI tips, and notes that operators will see during execution.
                                </p>

                                {(() => {
                                  const pack = config.instructionPack || { workInstructionRefs: [], aiSnippets: [], specialNotes: '', media: [] };
                                  const updatePack = (updates: Partial<InstructionPack>) => {
                                    setDepartmentConfig(prev => ({
                                      ...prev,
                                      [dept]: {
                                        ...config,
                                        instructionPack: { ...pack, ...updates },
                                      },
                                    }));
                                  };

                                  return (
                                    <div className="space-y-3">
                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center gap-1">
                                          <FileText className="h-3 w-3" /> Work Instruction References
                                        </Label>
                                        {pack.workInstructionRefs.length > 0 && (
                                          <div className="space-y-1">
                                            {pack.workInstructionRefs.map((ref, idx) => (
                                              <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background">
                                                <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-xs font-medium truncate">{ref.title || ref.documentId}</p>
                                                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                                                    {ref.pageRange && <span>Pages {ref.pageRange}</span>}
                                                    {ref.anchor && <span>§ {ref.anchor}</span>}
                                                  </div>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => updatePack({ workInstructionRefs: pack.workInstructionRefs.filter((_, i) => i !== idx) })}>
                                                  <X className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex gap-2">
                                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => {
                                            setDocPickerDept(dept);
                                            setShowDocPicker(true);
                                          }}>
                                            <FolderOpen className="h-3 w-3 mr-1" />
                                            Browse from Storage
                                          </Button>
                                          <Input placeholder="Or enter title manually" className="text-xs flex-1" id={`wi-title-${dept}`} />
                                          <Input placeholder="Pages" className="text-xs w-16" id={`wi-pages-${dept}`} />
                                          <Button size="sm" variant="outline" onClick={() => {
                                            const titleEl = document.getElementById(`wi-title-${dept}`) as HTMLInputElement;
                                            const pagesEl = document.getElementById(`wi-pages-${dept}`) as HTMLInputElement;
                                            if (titleEl?.value.trim()) {
                                              updatePack({
                                                workInstructionRefs: [...pack.workInstructionRefs, {
                                                  documentId: crypto.randomUUID(),
                                                  title: titleEl.value.trim(),
                                                  pageRange: pagesEl?.value.trim() || undefined,
                                                }],
                                              });
                                              titleEl.value = '';
                                              if (pagesEl) pagesEl.value = '';
                                            }
                                          }}>
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>

                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center gap-1">
                                          <Lightbulb className="h-3 w-3" /> AI Snippets
                                        </Label>
                                        {pack.aiSnippets.length > 0 && (
                                          <div className="space-y-2">
                                            {pack.aiSnippets.map((snippet, idx) => (
                                              <div key={idx} className="p-2 rounded border bg-background space-y-1">
                                                <div className="flex items-center gap-2">
                                                  <Lightbulb className="h-3 w-3 text-yellow-500 shrink-0" />
                                                  <p className="text-xs font-medium flex-1">{snippet.title}</p>
                                                  {snippet.confidence != null && (
                                                    <span className="text-[10px] text-muted-foreground">{Math.round(snippet.confidence * 100)}%</span>
                                                  )}
                                                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => updatePack({ aiSnippets: pack.aiSnippets.filter((_, i) => i !== idx) })}>
                                                    <X className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                                <ul className="ml-5 space-y-0.5">
                                                  {snippet.bullets.map((b, bi) => (
                                                    <li key={bi} className="text-xs text-muted-foreground flex items-start gap-1">
                                                      <span className="shrink-0 mt-1">•</span>
                                                      <span>{b}</span>
                                                      <Button variant="ghost" size="sm" className="h-4 w-4 p-0 ml-auto shrink-0" onClick={() => {
                                                        const updated = [...pack.aiSnippets];
                                                        updated[idx] = { ...updated[idx], bullets: updated[idx].bullets.filter((_, i) => i !== bi) };
                                                        updatePack({ aiSnippets: updated });
                                                      }}>
                                                        <X className="h-2.5 w-2.5" />
                                                      </Button>
                                                    </li>
                                                  ))}
                                                </ul>
                                                <div className="flex gap-1 ml-5">
                                                  <Input placeholder="Add bullet..." className="text-xs h-6" id={`ai-bullet-${dept}-${idx}`} onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      const el = e.target as HTMLInputElement;
                                                      if (el.value.trim()) {
                                                        const updated = [...pack.aiSnippets];
                                                        updated[idx] = { ...updated[idx], bullets: [...updated[idx].bullets, el.value.trim()] };
                                                        updatePack({ aiSnippets: updated });
                                                        el.value = '';
                                                      }
                                                    }
                                                  }} />
                                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => {
                                                    const el = document.getElementById(`ai-bullet-${dept}-${idx}`) as HTMLInputElement;
                                                    if (el?.value.trim()) {
                                                      const updated = [...pack.aiSnippets];
                                                      updated[idx] = { ...updated[idx], bullets: [...updated[idx].bullets, el.value.trim()] };
                                                      updatePack({ aiSnippets: updated });
                                                      el.value = '';
                                                    }
                                                  }}>
                                                    <Plus className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                                <div className="flex gap-2 ml-5 mt-1">
                                                  <Input
                                                    placeholder="Source doc ID (optional)"
                                                    className="text-xs h-6 flex-1"
                                                    value={snippet.sourceDocumentId || ''}
                                                    onChange={(e) => {
                                                      const updated = [...pack.aiSnippets];
                                                      updated[idx] = { ...updated[idx], sourceDocumentId: e.target.value || undefined };
                                                      updatePack({ aiSnippets: updated });
                                                    }}
                                                  />
                                                  <Input
                                                    placeholder="Conf %"
                                                    className="text-xs h-6 w-16"
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={snippet.confidence != null ? Math.round(snippet.confidence * 100) : ''}
                                                    onChange={(e) => {
                                                      const updated = [...pack.aiSnippets];
                                                      const val = e.target.value ? parseInt(e.target.value) / 100 : undefined;
                                                      updated[idx] = { ...updated[idx], confidence: val };
                                                      updatePack({ aiSnippets: updated });
                                                    }}
                                                  />
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex gap-2">
                                          <Input placeholder="Snippet title (e.g. Critical hold points)" className="text-xs flex-1" id={`ai-title-${dept}`} />
                                          <Button size="sm" variant="outline" onClick={() => {
                                            const el = document.getElementById(`ai-title-${dept}`) as HTMLInputElement;
                                            if (el?.value.trim()) {
                                              updatePack({ aiSnippets: [...pack.aiSnippets, { title: el.value.trim(), bullets: [] }] });
                                              el.value = '';
                                            }
                                          }}>
                                            <Plus className="h-3 w-3" /> Add Snippet
                                          </Button>
                                        </div>
                                        {pack.workInstructionRefs.length > 0 && (
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            className="w-full text-xs"
                                            disabled={aiSnippetGenerating === dept}
                                            onClick={async () => {
                                              setAiSnippetGenerating(dept);
                                              try {
                                                let allSnippets: AiSnippet[] = [];
                                                let successCount = 0;
                                                let failCount = 0;
                                                for (const wiRef of pack.workInstructionRefs) {
                                                  try {
                                                    const res = await apiRequest(`/api/routing-documents/${wiRef.documentId}/generate-snippets`, { method: 'POST', body: JSON.stringify({ departmentName: dept }) });
                                                    const data = await res.json();
                                                    if (Array.isArray(data.snippets) && data.snippets.length > 0) {
                                                      allSnippets = [...allSnippets, ...data.snippets];
                                                      successCount++;
                                                    }
                                                  } catch (err) {
                                                    failCount++;
                                                    console.warn(`Snippet generation failed for ${wiRef.title || wiRef.documentId}:`, err);
                                                  }
                                                }
                                                if (allSnippets.length > 0) {
                                                  updatePack({ aiSnippets: [...pack.aiSnippets, ...allSnippets] });
                                                  const msg = failCount > 0
                                                    ? `Generated ${allSnippets.length} snippets from ${successCount} doc(s). ${failCount} doc(s) had no content.`
                                                    : `Generated ${allSnippets.length} AI snippets from ${successCount} document(s)`;
                                                  toast({ title: msg });
                                                } else {
                                                  toast({ title: 'No snippets generated', description: 'Documents may not have enough content. Try uploading and analyzing them first.', variant: 'destructive' });
                                                }
                                              } catch (err) {
                                                toast({ title: 'AI generation failed', description: String(err), variant: 'destructive' });
                                              } finally {
                                                setAiSnippetGenerating(null);
                                              }
                                            }}
                                          >
                                            {aiSnippetGenerating === dept ? (
                                              <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Generating...</>
                                            ) : (
                                              <><Sparkles className="h-3 w-3 mr-1" /> Generate AI Snippets from WIs</>
                                            )}
                                          </Button>
                                        )}
                                      </div>

                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center gap-1">
                                          <StickyNote className="h-3 w-3" /> Special Notes
                                        </Label>
                                        <Textarea
                                          placeholder="Any special instructions, warnings, or notes for the operator..."
                                          value={pack.specialNotes || ''}
                                          onChange={(e) => updatePack({ specialNotes: e.target.value })}
                                          className="text-xs min-h-[60px]"
                                          rows={3}
                                        />
                                      </div>

                                      <div className="space-y-2">
                                        <Label className="text-xs font-medium flex items-center gap-1">
                                          <ImageIcon className="h-3 w-3" /> Media Attachments
                                        </Label>
                                        {(pack.media || []).length > 0 && (
                                          <div className="space-y-1">
                                            {(pack.media || []).map((m, idx) => (
                                              <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background">
                                                {m.type === 'image' ? <ImageIcon className="h-3 w-3 text-green-500 shrink-0" /> : <FileText className="h-3 w-3 text-red-500 shrink-0" />}
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-xs font-medium truncate">{m.caption || m.documentId}</p>
                                                  <p className="text-[10px] text-muted-foreground uppercase">{m.type}</p>
                                                </div>
                                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => updatePack({ media: (pack.media || []).filter((_, i) => i !== idx) })}>
                                                  <X className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex gap-2">
                                          <select className="text-xs border rounded px-2 h-8 bg-background" id={`media-type-${dept}`}>
                                            <option value="image">Image</option>
                                            <option value="pdf">PDF</option>
                                          </select>
                                          <Input placeholder="Document ID" className="text-xs w-32" id={`media-docid-${dept}`} />
                                          <Input placeholder="Caption" className="text-xs flex-1" id={`media-caption-${dept}`} />
                                          <Button size="sm" variant="outline" onClick={() => {
                                            const typeEl = document.getElementById(`media-type-${dept}`) as HTMLSelectElement;
                                            const docIdEl = document.getElementById(`media-docid-${dept}`) as HTMLInputElement;
                                            const captionEl = document.getElementById(`media-caption-${dept}`) as HTMLInputElement;
                                            updatePack({
                                              media: [...(pack.media || []), {
                                                type: (typeEl?.value as 'image' | 'pdf') || 'image',
                                                documentId: docIdEl?.value.trim() || crypto.randomUUID(),
                                                caption: captionEl?.value.trim() || undefined,
                                              }],
                                            });
                                            if (docIdEl) docIdEl.value = '';
                                            if (captionEl) captionEl.value = '';
                                          }}>
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>

                                      {(pack.workInstructionRefs.length > 0 || pack.aiSnippets.length > 0 || pack.specialNotes || (pack.media || []).length > 0) && (
                                        <div className="flex justify-end">
                                          <Button size="sm" variant="ghost" className="text-xs text-destructive" onClick={() => updatePack({ workInstructionRefs: [], aiSnippets: [], specialNotes: '', media: [] })}>
                                            <Trash2 className="h-3 w-3 mr-1" /> Clear Pack
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Oven Curing */}
                              {dept === 'Assemble/Disassembly' && (
                                <>
                                  <Separator />
                                  <div>
                                    <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                      <Flame className="h-4 w-4 text-amber-600" />
                                      Oven Curing ({config.ovenCuringSteps?.length || 0})
                                    </h4>
                                    {config.ovenCuringSteps && config.ovenCuringSteps.length > 0 && (
                                      <div className="space-y-2 mb-3">
                                        {config.ovenCuringSteps.map((cureStep, idx) => (
                                          <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background">
                                            <Flame className="h-4 w-4 text-amber-500 shrink-0" />
                                            <div className="flex-1">
                                              <p className="text-sm">Step {idx + 1}: {cureStep.temperature} for {cureStep.time}</p>
                                            </div>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeOvenCuringStep(dept, idx)}>
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex gap-2">
                                      <Input placeholder="Temperature" value={selectedDeptForConfig === dept ? ovenTemperatureInput : ''} onChange={(e) => { setSelectedDeptForConfig(dept); setOvenTemperatureInput(e.target.value); }} onFocus={() => setSelectedDeptForConfig(dept)} className="text-sm" />
                                      <Input placeholder="Time" value={selectedDeptForConfig === dept ? ovenTimeInput : ''} onChange={(e) => { setSelectedDeptForConfig(dept); setOvenTimeInput(e.target.value); }} onFocus={() => setSelectedDeptForConfig(dept)} className="text-sm" />
                                      <Button size="sm" onClick={() => addOvenCuringStep(dept)} disabled={!ovenTemperatureInput.trim() || !ovenTimeInput.trim() || selectedDeptForConfig !== dept}>
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </>
                              )}

                              {/* Start Timer */}
                              <Separator />
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <Timer className="h-4 w-4 text-blue-600" />
                                  Start Timer
                                </h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Enable a production timer that operators can start from the traveler. The serial number will auto-fill from the traveler.
                                </p>
                                <div className="space-y-3">
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      id={`timer-enabled-${dept}`}
                                      checked={config.timerConfig?.enabled || false}
                                      onCheckedChange={(checked) => {
                                        setDepartmentConfig(prev => ({
                                          ...prev,
                                          [dept]: {
                                            ...config,
                                            timerConfig: {
                                              ...config.timerConfig,
                                              enabled: !!checked,
                                              defaultProgramId: config.timerConfig?.defaultProgramId,
                                              defaultProgramName: config.timerConfig?.defaultProgramName,
                                            },
                                          },
                                        }));
                                      }}
                                    />
                                    <Label htmlFor={`timer-enabled-${dept}`} className="text-sm cursor-pointer">
                                      Enable timer for this department
                                    </Label>
                                  </div>
                                  {config.timerConfig?.enabled && (
                                    <div className="pl-7 space-y-2">
                                      <Label className="text-xs">Default Timer Program (optional)</Label>
                                      <Select
                                        value={config.timerConfig?.defaultProgramId || 'none'}
                                        onValueChange={(val) => {
                                          const isNone = val === 'none';
                                          const program = isNone ? undefined : timerPrograms.find(p => p.id === val);
                                          setDepartmentConfig(prev => ({
                                            ...prev,
                                            [dept]: {
                                              ...config,
                                              timerConfig: {
                                                ...config.timerConfig!,
                                                enabled: true,
                                                defaultProgramId: isNone ? undefined : val,
                                                defaultProgramName: program?.name || undefined,
                                              },
                                            },
                                          }));
                                        }}
                                      >
                                        <SelectTrigger className="text-sm">
                                          <SelectValue placeholder="Select a timer program..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">No default (operator chooses)</SelectItem>
                                          {timerPrograms.filter(p => p.isActive).map(program => (
                                            <SelectItem key={program.id} value={program.id}>
                                              {program.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {config.timerConfig?.defaultProgramName && (
                                        <p className="text-xs text-muted-foreground">
                                          Currently set: {config.timerConfig.defaultProgramName}
                                        </p>
                                      )}
                                      <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-100 dark:border-blue-900">
                                        <p className="text-xs text-blue-700 dark:text-blue-300">
                                          When an operator reaches this department in the traveler, they can start a timer. The serial number from the traveler fills in automatically. Once started, the timer runs on the Timer Station and the operator continues with the traveler.
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Standard Processes */}
                              <Separator />
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <Wrench className="h-4 w-4 text-blue-600" />
                                  Standard Processes ({config.standardProcesses?.length || 0})
                                </h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Routine operations performed at this department (e.g. lathe wrapping, sanding, trimming).
                                </p>
                                {config.standardProcesses && config.standardProcesses.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.standardProcesses.map((proc, idx) => (
                                      <Card key={idx} className="p-3 bg-muted/30 border-l-4 border-l-blue-500">
                                        <div className="flex items-center justify-between">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm">{proc.name || '(Unnamed Process)'}</p>
                                            {proc.description && <p className="text-[10px] text-muted-foreground mt-0.5">{proc.description}</p>}
                                            <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                                              <span>Materials: {proc.config?.materials?.length || 0}</span>
                                              <span>QC: {proc.config?.qcStandards?.length || 0}</span>
                                              <span>Fields: {proc.config?.customDataFields?.length || 0}</span>
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {proc.config?.requiredTechnicianId && (
                                              <Badge variant="default" className="text-[10px]">Tech Assigned</Badge>
                                            )}
                                            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openStdProcessDialog(dept, idx)}>
                                              <Settings className="h-3 w-3 mr-1" /> Edit
                                            </Button>
                                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeStandardProcess(dept, idx)}>
                                              <X className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      </Card>
                                    ))}
                                  </div>
                                )}
                                <Button size="sm" variant="outline" onClick={() => openNewStdProcessDialog(dept)}>
                                  <Plus className="h-4 w-4 mr-1" /> Add Standard Process
                                </Button>
                              </div>

                              {/* Special Process */}
                              <Separator />
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-amber-600" />
                                  Special Process
                                </h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Complex processes requiring dedicated materials, QC standards, and technician assignment.
                                </p>
                                {config.specialProcessConfig?.processName && (
                                  <Card className="p-3 bg-muted/30 border-l-4 border-l-amber-500 mb-2">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <p className="font-medium text-sm">{config.specialProcessConfig.processName}</p>
                                        <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                                          <span>Materials: {config.specialProcessConfig.materials?.length || 0}</span>
                                          <span>QC: {config.specialProcessConfig.qcStandards?.length || 0}</span>
                                          <span>Fields: {config.specialProcessConfig.customDataFields?.length || 0}</span>
                                        </div>
                                      </div>
                                      {config.specialProcessConfig.requiredTechnicianId && (
                                        <Badge variant="default" className="text-[10px]">Tech Assigned</Badge>
                                      )}
                                    </div>
                                  </Card>
                                )}
                                <Button size="sm" variant="outline" onClick={() => openSpecialProcessDialog(dept)}>
                                  <FileText className="mr-1 h-3 w-3" />
                                  {config.specialProcessConfig?.processName ? 'Edit' : 'Configure'} Special Process
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* ==================== FINISH PHASE ==================== */}
                          {currentPhase === 'FINISH' && (
                            <div className="space-y-4">
                              <div className="p-3 bg-green-50/50 dark:bg-green-950/30 rounded-lg border border-green-100 dark:border-green-900">
                                <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                                  Post-operation checks, QC verification, and signoff gates. Badge scan + signature required to complete.
                                </p>
                              </div>

                              {/* Finish Checks */}
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="font-semibold text-sm flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-green-600" />
                                    End Checks ({config.finishChecks?.length || 0})
                                  </h4>
                                  {(!config.finishChecks || config.finishChecks.length === 0) && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setDepartmentConfig(prev => ({
                                          ...prev,
                                          [dept]: { ...config, finishChecks: DEFAULT_FINISH_CHECKS.map(c => ({ ...c })) },
                                        }));
                                      }}
                                    >
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                      Load Defaults
                                    </Button>
                                  )}
                                </div>
                                {config.finishChecks && config.finishChecks.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.finishChecks.map((check, idx) => (
                                      <div key={idx} className="p-2 rounded border bg-background space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{check.title}</p>
                                            {check.instructions && <p className="text-xs text-muted-foreground truncate">{check.instructions}</p>}
                                          </div>
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeFinishCheck(dept, idx)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 pl-6">
                                          <Badge variant="outline" className="text-[10px]">{check.taskType || 'CHECK'}</Badge>
                                          <Badge variant="outline" className="text-[10px]">{(check.timePolicy || 'AUTO_ON_COMPLETE').replace(/_/g, ' ')}</Badge>
                                          <Badge
                                            variant={check.requiresSignature ? 'default' : 'outline'}
                                            className="text-[10px] cursor-pointer"
                                            onClick={() => toggleCheckSignatureRequired(dept, 'finish', idx)}
                                          >
                                            <PenLine className="h-2.5 w-2.5 mr-0.5" />
                                            {check.requiresSignature ? (check.signatureRole || 'QC') : 'No Sig'}
                                          </Badge>
                                          {check.requiresSignature && (
                                            <Select
                                              value={check.signatureRole || 'QC'}
                                              onValueChange={(val) => updateCheckProperty(dept, 'finish', idx, { signatureRole: val as any })}
                                            >
                                              <SelectTrigger className="h-5 w-24 text-[10px] border-0 p-0 px-1"><SelectValue /></SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="OPERATOR">Operator</SelectItem>
                                                <SelectItem value="LEAD">Lead</SelectItem>
                                                <SelectItem value="QC">QC</SelectItem>
                                                <SelectItem value="ENGINEERING">Engineering</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          )}
                                          <Badge
                                            variant={check.requiresCertification ? 'default' : 'outline'}
                                            className="text-[10px] cursor-pointer"
                                            onClick={() => updateCheckProperty(dept, 'finish', idx, { requiresCertification: !check.requiresCertification })}
                                          >
                                            Cert {check.requiresCertification ? 'Yes' : 'No'}
                                          </Badge>
                                          <Badge
                                            variant={check.hardQcStop ? 'destructive' : 'outline'}
                                            className={`text-[10px] cursor-pointer ${check.hardQcStop ? '' : 'text-muted-foreground'}`}
                                            onClick={() => updateCheckProperty(dept, 'finish', idx, { hardQcStop: !check.hardQcStop })}
                                          >
                                            <Flag className={`h-2.5 w-2.5 mr-0.5 ${check.hardQcStop ? 'text-white' : ''}`} />
                                            {check.hardQcStop ? 'Hard QC Stop' : 'No Stop'}
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Check title (e.g., Visual Inspection)"
                                    value={selectedDeptForConfig === dept ? finishCheckTitle : ''}
                                    onChange={(e) => { setSelectedDeptForConfig(dept); setFinishCheckTitle(e.target.value); }}
                                    onFocus={() => setSelectedDeptForConfig(dept)}
                                    className="text-sm"
                                  />
                                  <Button size="sm" onClick={() => addFinishCheck(dept)} disabled={!finishCheckTitle.trim() || selectedDeptForConfig !== dept}>
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                {selectedDeptForConfig === dept && finishCheckTitle && (
                                  <Input
                                    placeholder="Instructions (optional)"
                                    value={finishCheckInstructions}
                                    onChange={(e) => setFinishCheckInstructions(e.target.value)}
                                    className="text-sm mt-1"
                                  />
                                )}
                              </div>

                              <Separator />

                              {/* FINISH Phase Custom Data Fields */}
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <PenLine className="h-4 w-4 text-green-600" />
                                  Finish Phase Data Fields ({config.finishCustomDataFields?.length || 0})
                                </h4>
                                <p className="text-xs text-muted-foreground mb-2">Fields operators fill in during the FINISH phase (e.g., final measurements, results).</p>
                                {config.finishCustomDataFields && config.finishCustomDataFields.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.finishCustomDataFields.map((field, idx) => (
                                      <div key={idx} className="flex items-center gap-2 p-2 rounded border bg-background">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{field.fieldName}</p>
                                          <div className="flex gap-1 mt-0.5">
                                            <Badge variant="outline" className="text-[10px]">{field.fieldType}</Badge>
                                            {field.isRequired && <Badge variant="secondary" className="text-[10px]">Required</Badge>}
                                          </div>
                                        </div>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removePhaseCustomField(dept, 'finish', idx)}>
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="space-y-2">
                                  <div className="flex gap-2">
                                    <Input placeholder="Field Name" value={selectedDeptForConfig === dept ? customFieldName : ''} onChange={(e) => { setSelectedDeptForConfig(dept); setCustomFieldName(e.target.value); }} onFocus={() => setSelectedDeptForConfig(dept)} className="text-sm" />
                                    <Select value={selectedDeptForConfig === dept ? customFieldType : 'text'} onValueChange={(val: 'text' | 'number' | 'date' | 'textarea') => { setSelectedDeptForConfig(dept); setCustomFieldType(val); }}>
                                      <SelectTrigger className="w-28 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="text">Text</SelectItem>
                                        <SelectItem value="number">Number</SelectItem>
                                        <SelectItem value="date">Date</SelectItem>
                                        <SelectItem value="textarea">Text Area</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <Checkbox id={`finish-field-req-${dept}`} checked={selectedDeptForConfig === dept ? customFieldRequired : false} onCheckedChange={(checked) => { setSelectedDeptForConfig(dept); setCustomFieldRequired(checked as boolean); }} />
                                      <Label htmlFor={`finish-field-req-${dept}`} className="text-xs cursor-pointer">Required</Label>
                                    </div>
                                    <Button size="sm" onClick={() => addPhaseCustomField(dept, 'finish')} disabled={!customFieldName.trim() || selectedDeptForConfig !== dept}>
                                      <Plus className="h-4 w-4 mr-1" /> Add Field
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              <Separator />

                              {/* FINISH Phase QC Standards */}
                              <div>
                                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                  <CheckSquare className="h-4 w-4 text-green-600" />
                                  Finish Phase QC ({config.finishQcStandards?.length || 0})
                                </h4>
                                <p className="text-xs text-muted-foreground mb-2">Final quality checks and ratings completed after work is done (e.g., layup rating, surface finish).</p>
                                {config.finishQcStandards && config.finishQcStandards.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.finishQcStandards.map((qc, idx) => (
                                      <div key={idx} className="p-2 rounded border bg-background space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{qc.standard}</p>
                                            <p className="text-[10px] text-muted-foreground">Tol: {qc.tolerance} | Req: {qc.requirement}</p>
                                          </div>
                                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFinishQcStandard(dept, idx)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-1 pl-1">
                                          <Badge
                                            variant={qc.hardQcStop ? 'destructive' : 'outline'}
                                            className={`text-[10px] cursor-pointer ${qc.hardQcStop ? '' : 'text-muted-foreground'}`}
                                            onClick={() => updateQcStandardProperty(dept, 'finish', idx, { hardQcStop: !qc.hardQcStop })}
                                          >
                                            <Flag className={`h-2.5 w-2.5 mr-0.5 ${qc.hardQcStop ? 'text-white' : ''}`} />
                                            {qc.hardQcStop ? 'Hard QC Stop' : 'No Stop'}
                                          </Badge>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="space-y-1">
                                  <Input placeholder="QC Standard (e.g., Layup Rating)" value={qcInputDept[`finish_${dept}`]?.standard || ''} onChange={(e) => setQcInputDept(prev => ({ ...prev, [`finish_${dept}`]: { ...(prev[`finish_${dept}`] || { standard: '', tolerance: '', requirement: '' }), standard: e.target.value } }))} className="text-sm" />
                                  <div className="flex gap-2">
                                    <Input placeholder="Tolerance" value={qcInputDept[`finish_${dept}`]?.tolerance || ''} onChange={(e) => setQcInputDept(prev => ({ ...prev, [`finish_${dept}`]: { ...(prev[`finish_${dept}`] || { standard: '', tolerance: '', requirement: '' }), tolerance: e.target.value } }))} className="text-sm" />
                                    <Input placeholder="Requirement" value={qcInputDept[`finish_${dept}`]?.requirement || ''} onChange={(e) => setQcInputDept(prev => ({ ...prev, [`finish_${dept}`]: { ...(prev[`finish_${dept}`] || { standard: '', tolerance: '', requirement: '' }), requirement: e.target.value } }))} className="text-sm" />
                                  </div>
                                  <Button size="sm" onClick={() => {
                                    const vals = qcInputDept[`finish_${dept}`];
                                    if (!vals?.standard?.trim() || !vals?.tolerance?.trim() || !vals?.requirement?.trim()) return;
                                    addFinishQcStandard(dept, vals.standard, vals.tolerance, vals.requirement);
                                    setQcInputDept(prev => ({ ...prev, [`finish_${dept}`]: { standard: '', tolerance: '', requirement: '' } }));
                                  }} disabled={!qcInputDept[`finish_${dept}`]?.standard?.trim() || !qcInputDept[`finish_${dept}`]?.tolerance?.trim() || !qcInputDept[`finish_${dept}`]?.requirement?.trim()}>
                                    <Plus className="h-4 w-4 mr-1" /> Add QC Standard
                                  </Button>
                                </div>
                              </div>

                              <Separator />

                              {/* Step-Level (Department) Signature Configuration */}
                              <div>
                                <h4 className="font-semibold mb-1 text-sm flex items-center gap-2">
                                  <PenLine className="h-4 w-4 text-green-600" />
                                  Department Signoff
                                </h4>
                                <p className="text-xs text-muted-foreground mb-3">
                                  Step-level signatures for department completion. Each selected role generates a separate signoff task.
                                </p>
                                <div className="space-y-3">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`sig-finish-${dept}`}
                                      checked={sigConfig.finishRequiresSignature}
                                      onCheckedChange={(checked) => updateSignatureConfig(dept, { finishRequiresSignature: checked as boolean })}
                                    />
                                    <Label htmlFor={`sig-finish-${dept}`} className="text-sm cursor-pointer">Require signature to complete department</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`sig-start-${dept}`}
                                      checked={sigConfig.startRequiresSignature}
                                      onCheckedChange={(checked) => updateSignatureConfig(dept, { startRequiresSignature: checked as boolean })}
                                    />
                                    <Label htmlFor={`sig-start-${dept}`} className="text-sm cursor-pointer">Require signature to start department</Label>
                                  </div>
                                  {sigConfig.finishRequiresSignature && (
                                    <div className="pl-6 space-y-2">
                                      <p className="text-xs text-muted-foreground">Select who must sign off (one task per role):</p>
                                      <div className="flex flex-wrap gap-2">
                                        {([
                                          { key: 'operator', label: 'Operator', enumRole: 'OPERATOR' },
                                          { key: 'qc_inspector', label: 'QC Inspector', enumRole: 'QC' },
                                          { key: 'supervisor', label: 'Lead / Supervisor', enumRole: 'LEAD' },
                                          { key: 'engineering', label: 'Engineering', enumRole: 'ENGINEERING' },
                                        ]).map(role => (
                                          <Badge
                                            key={role.key}
                                            variant={sigConfig.requiredSignatures.includes(role.key) ? 'default' : 'outline'}
                                            className="cursor-pointer text-xs"
                                            onClick={() => toggleRequiredSignature(dept, role.key)}
                                          >
                                            {role.label}
                                          </Badge>
                                        ))}
                                      </div>
                                      {sigConfig.requiredSignatures.length > 1 && (
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                                          {sigConfig.requiredSignatures.length} signoff tasks will be created — all must be completed
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Task-Level Signature Hint */}
                              {(config.startChecks?.some(c => c.requiresSignature) || config.finishChecks?.some(c => c.requiresSignature)) && (
                                <div className="p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800">
                                  <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                    Some individual tasks above also require signatures (task-level). These are separate from the department signoff.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* ==================== ALWAYS-VISIBLE: Material Traceability ==================== */}
                          <Separator className="my-3" />
                          <div className="space-y-4">
                            {/* Material Traceability */}
                            <div>
                              <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                                <Package className="h-4 w-4 text-blue-600" />
                                Material Traceability ({config.materials.length})
                              </h4>
                              {config.materials.length > 0 && (
                                <div className="space-y-2 mb-3">
                                  {config.materials.map((material) => (
                                    <Card key={material.partId} className="p-3">
                                      <div className="flex items-start justify-between mb-2">
                                        <div>
                                          <p className="font-mono font-semibold text-sm">{material.partNumber}</p>
                                          <p className="text-xs text-muted-foreground">{material.partName}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Select
                                            value={material.traceabilityPhase || 'START'}
                                            onValueChange={(val: string) => {
                                              const updatedMaterials = config.materials.map(m =>
                                                m.partId === material.partId ? { ...m, traceabilityPhase: val as 'START' | 'WORK' | 'FINISH' } : m
                                              );
                                              setDepartmentConfig(prev => ({
                                                ...prev,
                                                [dept]: { ...config, materials: updatedMaterials },
                                              }));
                                            }}
                                          >
                                            <SelectTrigger className="h-6 w-[80px] text-[10px]">
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="START">Start</SelectItem>
                                              <SelectItem value="WORK">Work</SelectItem>
                                              <SelectItem value="FINISH">Finish</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <Button size="sm" variant={material.entryMethod === 'manual' ? 'default' : 'outline'} className="h-6 text-[10px]" onClick={() => toggleMaterialEntryMethod(dept, material.partId)}>
                                            {material.entryMethod === 'manual' ? 'Manual' : 'Barcode'}
                                          </Button>
                                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeMaterialFromDepartment(dept, material.partId)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </div>
                                      {material.entryMethod === 'barcode' && (
                                        <div className="mb-2 p-1.5 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-300">
                                          All traceability auto-captured via barcode
                                        </div>
                                      )}
                                      <div className="grid grid-cols-2 gap-1">
                                        {TRACEABILITY_FIELDS.map((field) => (
                                          <div key={field.id} className="flex items-center space-x-1">
                                            <Checkbox
                                              id={`${dept}-${material.partId}-${field.id}`}
                                              checked={(material.requiredFields || []).includes(field.id)}
                                              disabled={material.entryMethod === 'barcode'}
                                              onCheckedChange={() => toggleMaterialTraceability(dept, material.partId, field.id)}
                                            />
                                            <Label htmlFor={`${dept}-${material.partId}-${field.id}`} className={`text-[11px] ${material.entryMethod === 'barcode' ? 'opacity-60' : 'cursor-pointer'}`}>
                                              {field.label}
                                            </Label>
                                          </div>
                                        ))}
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              )}
                              <div>
                                <Input
                                  placeholder="Search inventory to add material..."
                                  value={selectedDeptForConfig === dept ? materialSearchTerm : ''}
                                  onChange={(e) => { setSelectedDeptForConfig(dept); setMaterialSearchTerm(e.target.value); }}
                                  onFocus={() => setSelectedDeptForConfig(dept)}
                                  className="mb-1 text-sm"
                                />
                                {selectedDeptForConfig === dept && materialSearchTerm && (
                                  <ScrollArea className="h-28 border rounded">
                                    {filteredMaterialItems.map((item) => (
                                      <div key={item.id} className="p-2 hover:bg-muted cursor-pointer" onClick={() => { addMaterialToDepartment(dept, item); setMaterialSearchTerm(''); setSelectedDeptForConfig(''); }}>
                                        <p className="font-mono text-xs">{item.agPartNumber}</p>
                                        <p className="text-[10px] text-muted-foreground">{item.name}</p>
                                      </div>
                                    ))}
                                  </ScrollArea>
                                )}
                              </div>
                            </div>

                          </div>

                          {/* Training & Quiz Generation Section */}
                          <Separator className="my-3" />
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300 hover:underline"
                                onClick={() => setExpandedTraining(prev => ({ ...prev, [dept]: !prev[dept] }))}
                              >
                                <GraduationCap className="h-4 w-4" />
                                Training & Certification Quiz
                                {expandedTraining[dept] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                              {(() => {
                                const existing = getTrainingForDept(dept);
                                if (existing) {
                                  return (
                                    <Badge variant="outline" className="text-[10px] bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300">
                                      <CircleCheck className="h-3 w-3 mr-1" />
                                      {existing.totalQuestions} Questions
                                    </Badge>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {expandedTraining[dept] && (
                              <div className="space-y-3 pl-1">
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-xs border-purple-300 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950"
                                    disabled={trainingGenerating === dept || !editRouting?.id}
                                    onClick={() => handleGenerateTraining(dept)}
                                  >
                                    {trainingGenerating === dept ? (
                                      <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating...</>
                                    ) : (
                                      <><Brain className="h-3 w-3 mr-1" /> {getTrainingForDept(dept) ? 'Regenerate' : 'Generate'} Training & Quiz</>
                                    )}
                                  </Button>
                                  {!editRouting?.id && (
                                    <span className="text-[10px] text-muted-foreground">Save routing first</span>
                                  )}
                                </div>

                                {(() => {
                                  const pkg = getTrainingForDept(dept);
                                  if (!pkg) return (
                                    <p className="text-xs text-muted-foreground italic">
                                      No training generated yet. Click the button above to generate training content and quiz questions from the work instructions assigned to this department.
                                    </p>
                                  );

                                  const tc = pkg.trainingContent;
                                  const questions = pkg.quizQuestions || [];

                                  return (
                                    <div className="space-y-3">
                                      {tc && (
                                        <div className="border rounded-lg p-3 bg-purple-50/50 dark:bg-purple-950/20 space-y-2">
                                          <h5 className="text-sm font-semibold text-purple-800 dark:text-purple-200">{tc.title}</h5>

                                          {tc.objectives?.length > 0 && (
                                            <div>
                                              <p className="text-[11px] font-medium text-purple-700 dark:text-purple-300 mb-1">Learning Objectives:</p>
                                              <ul className="list-disc list-inside space-y-0.5">
                                                {tc.objectives.map((obj: string, i: number) => (
                                                  <li key={i} className="text-[11px] text-muted-foreground">{obj}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}

                                          {tc.keyPoints?.length > 0 && (
                                            <div>
                                              <p className="text-[11px] font-medium text-purple-700 dark:text-purple-300 mb-1">Key Points:</p>
                                              {tc.keyPoints.map((kp: any, i: number) => (
                                                <div key={i} className="mb-1">
                                                  <p className="text-[11px] font-medium">{kp.topic}</p>
                                                  <ul className="list-disc list-inside ml-2">
                                                    {kp.details?.map((d: string, j: number) => (
                                                      <li key={j} className="text-[10px] text-muted-foreground">{d}</li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              ))}
                                            </div>
                                          )}

                                          {tc.safetyNotes?.length > 0 && (
                                            <div>
                                              <p className="text-[11px] font-medium text-red-600 dark:text-red-400 mb-1">
                                                <AlertCircle className="h-3 w-3 inline mr-1" />Safety Notes:
                                              </p>
                                              <ul className="list-disc list-inside space-y-0.5">
                                                {tc.safetyNotes.map((note: string, i: number) => (
                                                  <li key={i} className="text-[10px] text-red-600 dark:text-red-400">{note}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}

                                          {tc.commonMistakes?.length > 0 && (
                                            <div>
                                              <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mb-1">Common Mistakes to Avoid:</p>
                                              <ul className="list-disc list-inside space-y-0.5">
                                                {tc.commonMistakes.map((m: string, i: number) => (
                                                  <li key={i} className="text-[10px] text-amber-600 dark:text-amber-400">{m}</li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-950/20 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <button
                                            type="button"
                                            className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300"
                                            onClick={() => setShowQuizPreview(prev => ({ ...prev, [dept]: !prev[dept] }))}
                                          >
                                            <BookOpen className="h-3 w-3" />
                                            Quiz Preview ({questions.length} questions)
                                            {showQuizPreview[dept] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                          </button>
                                          <div className="flex gap-1">
                                            {['easy', 'medium', 'hard'].map(d => {
                                              const count = questions.filter((q: any) => q.difficulty === d).length;
                                              if (count === 0) return null;
                                              return (
                                                <Badge key={d} variant="outline" className={`text-[9px] ${d === 'easy' ? 'text-green-600 border-green-300' : d === 'medium' ? 'text-amber-600 border-amber-300' : 'text-red-600 border-red-300'}`}>
                                                  {count} {d}
                                                </Badge>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        {showQuizPreview[dept] && (
                                          <div className="space-y-2 mt-2">
                                            {questions.map((q: any, i: number) => (
                                              <div key={i} className="border rounded p-2 bg-white dark:bg-gray-900 space-y-1">
                                                <div className="flex items-start gap-2">
                                                  <span className="text-[10px] font-mono text-muted-foreground mt-0.5">Q{i + 1}</span>
                                                  <div className="flex-1">
                                                    <p className="text-[11px] font-medium">{q.question}</p>
                                                    {q.questionType === 'multiple_choice' && q.options?.length > 0 && (
                                                      <div className="mt-1 space-y-0.5">
                                                        {q.options.map((opt: string, j: number) => (
                                                          <div key={j} className={`text-[10px] pl-2 ${opt === q.correctAnswer ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                                                            {String.fromCharCode(65 + j)}) {opt} {opt === q.correctAnswer && '✓'}
                                                          </div>
                                                        ))}
                                                      </div>
                                                    )}
                                                    {q.questionType === 'true_false' && (
                                                      <div className="mt-1 flex gap-3">
                                                        <span className={`text-[10px] ${q.correctAnswer === 'True' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>True {q.correctAnswer === 'True' && '✓'}</span>
                                                        <span className={`text-[10px] ${q.correctAnswer === 'False' ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>False {q.correctAnswer === 'False' && '✓'}</span>
                                                      </div>
                                                    )}
                                                    {q.explanation && (
                                                      <p className="text-[9px] text-muted-foreground mt-1 italic">💡 {q.explanation}</p>
                                                    )}
                                                  </div>
                                                  <Badge variant="outline" className={`text-[8px] shrink-0 ${q.difficulty === 'easy' ? 'text-green-600 border-green-300' : q.difficulty === 'medium' ? 'text-amber-600 border-amber-300' : 'text-red-600 border-red-300'}`}>
                                                    {q.difficulty}
                                                  </Badge>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <FileText className="h-3 w-3" />
                                        Source WIs: {(pkg.sourceDocumentTitles || []).join(', ') || 'N/A'}
                                        <span className="ml-auto">Generated: {pkg.generatedAt ? new Date(pkg.generatedAt).toLocaleDateString() : 'N/A'}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <Separator />

        <DialogFooter className="flex justify-between items-center sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} data-testid="button-back">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
              Cancel
            </Button>
            {step < 3 ? (
              <Button onClick={handleNext} data-testid="button-next">
                Next
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                <Check className="mr-2 h-4 w-4" />
                {editRouting ? 'Update Routing' : 'Create Routing'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Special Process Configuration Dialog */}
      <Dialog open={showSpecialProcessDialog} onOpenChange={(open) => {
        if (!open) {
          clearSpInputState();
          setSpecialProcessDept('');
        }
        setShowSpecialProcessDialog(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-special-process">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Configure Special Process
            </DialogTitle>
            <DialogDescription>
              Configure special process with materials, QC standards, and required technician assignment
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6 py-4">
              {/* Process Name & Technician (Required) */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sp-process-name">Process Name *</Label>
                  <Input
                    id="sp-process-name"
                    data-testid="input-sp-process-name"
                    placeholder="e.g., Heat Treatment, Anodizing, Plating..."
                    value={spProcessName}
                    onChange={(e) => {
                      setSpProcessName(e.target.value);
                      if (specialProcessDept) {
                        updateSpConfig(specialProcessDept, { processName: e.target.value });
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Assigned Technician *
                    <Badge variant="destructive" className="text-xs">Required</Badge>
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Special processes require a designated technician to be assigned
                  </p>
                  <Select
                    value={spTechnicianId || 'NONE'}
                    onValueChange={(val) => {
                      setSpTechnicianId(val);
                      if (specialProcessDept) {
                        updateSpConfig(specialProcessDept, {
                          requiredTechnicianId: val === 'NONE' ? null : parseInt(val),
                        });
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-sp-technician">
                      <SelectValue placeholder="Select technician (required)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">-- Select Technician --</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!spTechnicianId && (
                    <p className="text-sm text-red-500">A technician must be assigned for special processes</p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Process Notes */}
              <div className="space-y-2">
                <Label htmlFor="sp-notes">Process Instructions</Label>
                <Textarea
                  id="sp-notes"
                  data-testid="input-sp-notes"
                  placeholder="Enter special process details, requirements, and instructions..."
                  value={specialProcessDept ? (getOrCreateSpConfig(specialProcessDept).notes || '') : ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    if (specialProcessDept) {
                      updateSpConfig(specialProcessDept, { notes: e.target.value });
                    }
                  }}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <Separator />

              {/* Materials Requiring Traceability */}
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Materials Requiring Traceability ({specialProcessDept ? getOrCreateSpConfig(specialProcessDept).materials.length : 0})
                </h4>
                
                {specialProcessDept && getOrCreateSpConfig(specialProcessDept).materials.length > 0 && (
                  <div className="space-y-2">
                    {getOrCreateSpConfig(specialProcessDept).materials.map((material) => (
                      <Card key={material.partId} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-mono text-sm">{material.partNumber}</p>
                            <p className="text-xs text-muted-foreground">{material.partName}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeSpMaterial(specialProcessDept, material.partId)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {TRACEABILITY_FIELDS.map((field) => (
                            <Badge
                              key={field.id}
                              variant={material.requiredFields.includes(field.id) ? "default" : "outline"}
                              className="cursor-pointer text-xs"
                              onClick={() => toggleSpMaterialField(specialProcessDept, material.partId, field.id)}
                            >
                              {field.label}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div>
                  <Label className="text-sm mb-2 block">Add Material:</Label>
                  <Input
                    placeholder="Search inventory..."
                    value={spMaterialSearch}
                    onChange={(e) => setSpMaterialSearch(e.target.value)}
                    className="mb-2"
                  />
                  {spMaterialSearch && (
                    <ScrollArea className="h-32 border rounded">
                      {inventoryItems
                        .filter(item =>
                          (item.agPartNumber?.toLowerCase() || '').includes(spMaterialSearch.toLowerCase()) ||
                          (item.name?.toLowerCase() || '').includes(spMaterialSearch.toLowerCase())
                        )
                        .map((item) => (
                          <div
                            key={item.id}
                            className="p-2 hover:bg-muted cursor-pointer"
                            onClick={() => specialProcessDept && addSpMaterial(specialProcessDept, item)}
                          >
                            <p className="font-mono text-sm">{item.agPartNumber}</p>
                            <p className="text-xs text-muted-foreground">{item.name}</p>
                          </div>
                        ))}
                    </ScrollArea>
                  )}
                </div>
              </div>

              <Separator />

              {/* QC Standards */}
              <div className="space-y-3">
                <h4 className="font-semibold">QC Standards ({specialProcessDept ? getOrCreateSpConfig(specialProcessDept).qcStandards.length : 0})</h4>
                
                {specialProcessDept && getOrCreateSpConfig(specialProcessDept).qcStandards.length > 0 && (
                  <div className="space-y-2">
                    {getOrCreateSpConfig(specialProcessDept).qcStandards.map((qc, idx) => (
                      <Card key={idx} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium text-sm">{qc.standard}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeSpQcStandard(specialProcessDept, idx)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Tolerance:</span>
                            <p className="font-mono">{qc.tolerance}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Requirement:</span>
                            <p className="font-mono">{qc.requirement}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    placeholder="QC Standard (e.g., Surface Finish)"
                    value={spQcStandard}
                    onChange={(e) => setSpQcStandard(e.target.value)}
                  />
                  <Input
                    placeholder="Tolerance (e.g., ±0.001 in)"
                    value={spQcTolerance}
                    onChange={(e) => setSpQcTolerance(e.target.value)}
                  />
                  <Input
                    placeholder="Requirement (e.g., 32 Ra max)"
                    value={spQcRequirement}
                    onChange={(e) => setSpQcRequirement(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() => specialProcessDept && addSpQcStandard(specialProcessDept)}
                    disabled={!spQcStandard.trim() || !spQcTolerance.trim() || !spQcRequirement.trim()}
                  >
                    Add QC Standard
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Custom Data Fields */}
              <div className="space-y-3">
                <h4 className="font-semibold">Custom Data Fields ({specialProcessDept ? getOrCreateSpConfig(specialProcessDept).customDataFields.length : 0})</h4>
                <p className="text-sm text-muted-foreground">
                  Define custom data entry fields technicians must complete during the special process
                </p>

                {specialProcessDept && getOrCreateSpConfig(specialProcessDept).customDataFields.length > 0 && (
                  <div className="space-y-2">
                    {getOrCreateSpConfig(specialProcessDept).customDataFields.map((field, idx) => (
                      <Card key={idx} className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{field.fieldName}</p>
                            <p className="text-xs text-muted-foreground">
                              Type: {field.fieldType} {field.isRequired && <Badge variant="secondary" className="ml-1">Required</Badge>}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => removeSpCustomField(specialProcessDept, idx)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    placeholder="Field Name (e.g., Temperature Reading)"
                    value={spFieldName}
                    onChange={(e) => setSpFieldName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Select value={spFieldType} onValueChange={(v: 'text' | 'number' | 'date' | 'textarea') => setSpFieldType(v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="textarea">Text Area</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="sp-field-required"
                        checked={spFieldRequired}
                        onCheckedChange={(checked) => setSpFieldRequired(checked === true)}
                      />
                      <Label htmlFor="sp-field-required" className="text-sm">Required</Label>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => specialProcessDept && addSpCustomField(specialProcessDept)}
                    disabled={!spFieldName.trim()}
                  >
                    Add Custom Field
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                clearSpInputState();
                setShowSpecialProcessDialog(false);
                setSpecialProcessDept('');
              }}
              data-testid="button-cancel-special-process"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const spConfig = specialProcessDept ? getOrCreateSpConfig(specialProcessDept) : null;
                if (!spConfig?.processName?.trim()) {
                  toast({
                    title: 'Process Name Required',
                    description: 'Please enter a process name',
                    variant: 'destructive',
                  });
                  return;
                }
                if (!spConfig?.requiredTechnicianId) {
                  toast({
                    title: 'Technician Required',
                    description: 'Special processes require a designated technician',
                    variant: 'destructive',
                  });
                  return;
                }
                clearSpInputState();
                setShowSpecialProcessDialog(false);
                setSpecialProcessDept('');
                toast({
                  title: 'Special Process Saved',
                  description: `"${spConfig.processName}" configured with assigned technician`,
                });
              }}
              data-testid="button-save-special-process"
            >
              <Check className="mr-2 h-4 w-4" />
              Save Special Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showStdProcessDialog} onOpenChange={(open) => {
        if (!open) {
          if (stdProcessDept && stdProcessEditIdx !== null) {
            const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
            if (!cfg.processName?.trim()) {
              removeStandardProcess(stdProcessDept, stdProcessEditIdx);
            }
          }
          clearStdInputState();
          setStdProcessDept('');
          setStdProcessEditIdx(null);
        }
        setShowStdProcessDialog(open);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Configure Standard Process
            </DialogTitle>
            <DialogDescription>
              Configure process with materials, QC standards, custom data fields, and optional technician assignment
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="std-process-name">Process Name *</Label>
                  <Input
                    id="std-process-name"
                    placeholder="e.g., Lathe Wrapping, Sanding, Trimming..."
                    value={stdProcessName}
                    onChange={(e) => {
                      setStdProcessName(e.target.value);
                      updateStdProcessConfig({ processName: e.target.value });
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Assigned Technician
                    <Badge variant="outline" className="text-xs">Optional</Badge>
                  </Label>
                  <Select
                    value={stdTechnicianId || 'NONE'}
                    onValueChange={(val) => {
                      setStdTechnicianId(val);
                      updateStdProcessConfig({
                        requiredTechnicianId: val === 'NONE' ? null : parseInt(val),
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select technician (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">-- No Technician --</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="std-notes">Process Instructions</Label>
                <Textarea
                  id="std-notes"
                  placeholder="Enter process details, requirements, and instructions..."
                  value={stdProcessDept && stdProcessEditIdx !== null ? (getStdProcessConfig(stdProcessDept, stdProcessEditIdx).notes || '') : ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                    updateStdProcessConfig({ notes: e.target.value });
                  }}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Materials Requiring Traceability ({stdProcessDept && stdProcessEditIdx !== null ? getStdProcessConfig(stdProcessDept, stdProcessEditIdx).materials.length : 0})
                </h4>

                {stdProcessDept && stdProcessEditIdx !== null && getStdProcessConfig(stdProcessDept, stdProcessEditIdx).materials.length > 0 && (
                  <div className="space-y-2">
                    {getStdProcessConfig(stdProcessDept, stdProcessEditIdx).materials.map((material) => (
                      <Card key={material.partId} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-mono text-sm">{material.partNumber}</p>
                            <p className="text-xs text-muted-foreground">{material.partName}</p>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeStdMaterial(material.partId)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {TRACEABILITY_FIELDS.map((field) => (
                            <Badge
                              key={field.id}
                              variant={material.requiredFields.includes(field.id) ? "default" : "outline"}
                              className="cursor-pointer text-xs"
                              onClick={() => toggleStdMaterialField(material.partId, field.id)}
                            >
                              {field.label}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div>
                  <Label className="text-sm mb-2 block">Add Material:</Label>
                  <Input
                    placeholder="Search inventory..."
                    value={stdMaterialSearch}
                    onChange={(e) => setStdMaterialSearch(e.target.value)}
                    className="mb-2"
                  />
                  {stdMaterialSearch && (
                    <ScrollArea className="h-32 border rounded">
                      {inventoryItems
                        .filter(item =>
                          (item.agPartNumber?.toLowerCase() || '').includes(stdMaterialSearch.toLowerCase()) ||
                          (item.name?.toLowerCase() || '').includes(stdMaterialSearch.toLowerCase())
                        )
                        .map((item) => (
                          <div
                            key={item.id}
                            className="p-2 hover:bg-muted cursor-pointer"
                            onClick={() => addStdMaterial(item)}
                          >
                            <p className="font-mono text-sm">{item.agPartNumber}</p>
                            <p className="text-xs text-muted-foreground">{item.name}</p>
                          </div>
                        ))}
                    </ScrollArea>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold">QC Standards ({stdProcessDept && stdProcessEditIdx !== null ? getStdProcessConfig(stdProcessDept, stdProcessEditIdx).qcStandards.length : 0})</h4>

                {stdProcessDept && stdProcessEditIdx !== null && getStdProcessConfig(stdProcessDept, stdProcessEditIdx).qcStandards.length > 0 && (
                  <div className="space-y-2">
                    {getStdProcessConfig(stdProcessDept, stdProcessEditIdx).qcStandards.map((qc, idx) => (
                      <Card key={idx} className="p-3">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-medium text-sm">{qc.standard}</p>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeStdQcStandard(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Tolerance:</span>
                            <p className="font-mono">{qc.tolerance}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Requirement:</span>
                            <p className="font-mono">{qc.requirement}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    placeholder="QC Standard (e.g., Surface Finish)"
                    value={stdQcStandard}
                    onChange={(e) => setStdQcStandard(e.target.value)}
                  />
                  <Input
                    placeholder="Tolerance (e.g., ±0.001 in)"
                    value={stdQcTolerance}
                    onChange={(e) => setStdQcTolerance(e.target.value)}
                  />
                  <Input
                    placeholder="Requirement (e.g., 32 Ra max)"
                    value={stdQcRequirement}
                    onChange={(e) => setStdQcRequirement(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={addStdQcStandard}
                    disabled={!stdQcStandard.trim() || !stdQcTolerance.trim() || !stdQcRequirement.trim()}
                  >
                    Add QC Standard
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <h4 className="font-semibold">Custom Data Fields ({stdProcessDept && stdProcessEditIdx !== null ? getStdProcessConfig(stdProcessDept, stdProcessEditIdx).customDataFields.length : 0})</h4>
                <p className="text-sm text-muted-foreground">
                  Define custom data entry fields technicians must complete during this process
                </p>

                {stdProcessDept && stdProcessEditIdx !== null && getStdProcessConfig(stdProcessDept, stdProcessEditIdx).customDataFields.length > 0 && (
                  <div className="space-y-2">
                    {getStdProcessConfig(stdProcessDept, stdProcessEditIdx).customDataFields.map((field, idx) => (
                      <Card key={idx} className="p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{field.fieldName}</p>
                            <p className="text-xs text-muted-foreground">
                              Type: {field.fieldType} {field.isRequired && <Badge variant="secondary" className="ml-1">Required</Badge>}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeStdCustomField(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    placeholder="Field Name (e.g., Temperature Reading)"
                    value={stdFieldName}
                    onChange={(e) => setStdFieldName(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Select value={stdFieldType} onValueChange={(v: 'text' | 'number' | 'date' | 'textarea') => setStdFieldType(v)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="textarea">Text Area</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="std-field-required"
                        checked={stdFieldRequired}
                        onCheckedChange={(checked) => setStdFieldRequired(checked === true)}
                      />
                      <Label htmlFor="std-field-required" className="text-sm">Required</Label>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={addStdCustomField}
                    disabled={!stdFieldName.trim()}
                  >
                    Add Custom Field
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (stdProcessDept && stdProcessEditIdx !== null) {
                  const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
                  if (!cfg.processName?.trim()) {
                    removeStandardProcess(stdProcessDept, stdProcessEditIdx);
                  }
                }
                clearStdInputState();
                setShowStdProcessDialog(false);
                setStdProcessDept('');
                setStdProcessEditIdx(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (stdProcessDept && stdProcessEditIdx !== null) {
                  const cfg = getStdProcessConfig(stdProcessDept, stdProcessEditIdx);
                  if (!cfg.processName?.trim()) {
                    toast({
                      title: 'Process Name Required',
                      description: 'Please enter a process name',
                      variant: 'destructive',
                    });
                    return;
                  }
                }
                clearStdInputState();
                setShowStdProcessDialog(false);
                setStdProcessDept('');
                setStdProcessEditIdx(null);
                toast({
                  title: 'Standard Process Saved',
                  description: `Process configured successfully`,
                });
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              Save Standard Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showDocPicker} onOpenChange={(open) => {
        if (!open) {
          setShowDocPicker(false);
          setDocPickerSelectedDoc(null);
          setDocPickerSections([]);
          setDocPickerSearch('');
          setDocPickerSelectedSections(new Set());
          setDocPickerUseWhole(true);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Browse Work Instructions from Storage
            </DialogTitle>
            <DialogDescription>
              Select a document and choose to use the whole document or specific sections.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 h-[60vh]">
            <div className={`${docPickerSelectedDoc ? 'w-1/3' : 'w-full'} flex flex-col`}>
              <div className="relative mb-3">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  className="pl-8"
                  value={docPickerSearch}
                  onChange={(e) => setDocPickerSearch(e.target.value)}
                />
              </div>
              <ScrollArea className="flex-1 border rounded-md">
                <DocPickerList
                  search={docPickerSearch}
                  selectedDocId={docPickerSelectedDoc?.id}
                  onSelectDoc={async (doc: any) => {
                    setDocPickerSelectedDoc(doc);
                    setDocPickerSections([]);
                    setDocPickerSelectedSections(new Set());
                    setDocPickerUseWhole(true);
                    setDocPickerLoadingSections(true);
                    try {
                      const data = await apiRequest(`/api/routing-documents/${doc.id}/sections`);
                      setDocPickerSections(data?.sections || []);
                    } catch (err) {
                      console.warn('Could not load sections:', err);
                      setDocPickerSections([]);
                    } finally {
                      setDocPickerLoadingSections(false);
                    }
                  }}
                />
              </ScrollArea>
            </div>

            {docPickerSelectedDoc && (
              <div className="w-2/3 flex flex-col border rounded-md">
                <div className="p-3 border-b bg-muted/50">
                  <h4 className="font-medium text-sm">{docPickerSelectedDoc.title || docPickerSelectedDoc.file_name}</h4>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{docPickerSelectedDoc.document_type || docPickerSelectedDoc.documentType || 'document'}</Badge>
                    {docPickerSelectedDoc.department_name && <Badge variant="secondary" className="text-[10px]">{docPickerSelectedDoc.department_name}</Badge>}
                  </div>
                </div>

                <div className="p-3 border-b flex items-center gap-3">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="docSelection"
                      checked={docPickerUseWhole}
                      onChange={() => {
                        setDocPickerUseWhole(true);
                        setDocPickerSelectedSections(new Set());
                      }}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium">Use Whole Document</span>
                  </Label>
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="docSelection"
                      checked={!docPickerUseWhole}
                      onChange={() => setDocPickerUseWhole(false)}
                      className="accent-primary"
                    />
                    <span className="text-sm font-medium">Select Sections</span>
                  </Label>
                </div>

                <ScrollArea className="flex-1">
                  {docPickerLoadingSections ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : docPickerSections.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No extracted content available.</p>
                      <p className="text-xs mt-1">Upload and analyze this document first to see its sections.</p>
                    </div>
                  ) : (
                    <div className="p-3 space-y-2">
                      {docPickerSections.map((section: any) => {
                        const isSelected = docPickerSelectedSections.has(section.id);
                        return (
                          <div
                            key={section.id}
                            className={`rounded-md border p-3 transition-colors ${
                              docPickerUseWhole
                                ? 'bg-primary/5 border-primary/30'
                                : isSelected
                                  ? 'bg-primary/10 border-primary'
                                  : 'hover:bg-muted/50 cursor-pointer'
                            }`}
                            onClick={() => {
                              if (docPickerUseWhole) return;
                              setDocPickerSelectedSections(prev => {
                                const next = new Set(prev);
                                if (next.has(section.id)) {
                                  next.delete(section.id);
                                } else {
                                  next.add(section.id);
                                }
                                return next;
                              });
                            }}
                          >
                            <div className="flex items-start gap-2">
                              {!docPickerUseWhole && (
                                <Checkbox
                                  checked={isSelected}
                                  className="mt-0.5"
                                  onCheckedChange={(checked) => {
                                    setDocPickerSelectedSections(prev => {
                                      const next = new Set(prev);
                                      if (checked) next.add(section.id);
                                      else next.delete(section.id);
                                      return next;
                                    });
                                  }}
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{section.title}</p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap">
                                  {section.content.substring(0, 200)}{section.content.length > 200 ? '...' : ''}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDocPicker(false)}>Cancel</Button>
            <Button
              disabled={!docPickerSelectedDoc || (!docPickerUseWhole && docPickerSelectedSections.size === 0)}
              onClick={() => {
                if (!docPickerSelectedDoc) return;
                const docId = docPickerSelectedDoc.id;
                const docTitle = docPickerSelectedDoc.title || docPickerSelectedDoc.file_name || 'Untitled';

                const config = departmentConfig[docPickerDept] || {};
                const pack = config.instructionPack || { workInstructionRefs: [], aiSnippets: [], specialNotes: '', media: [] };

                if (docPickerUseWhole) {
                  const newRef: InstructionRef = {
                    documentId: docId,
                    title: docTitle,
                  };
                  setDepartmentConfig(prev => ({
                    ...prev,
                    [docPickerDept]: {
                      ...config,
                      instructionPack: {
                        ...pack,
                        workInstructionRefs: [...pack.workInstructionRefs, newRef],
                      },
                    },
                  }));
                  toast({ title: 'Document added', description: `"${docTitle}" attached as work instruction reference` });
                } else {
                  const selectedSecs = docPickerSections.filter((s: any) => docPickerSelectedSections.has(s.id));
                  const newRefs: InstructionRef[] = selectedSecs.map((s: any) => ({
                    documentId: docId,
                    title: `${docTitle} — ${s.title}`,
                    anchor: s.title,
                  }));
                  setDepartmentConfig(prev => ({
                    ...prev,
                    [docPickerDept]: {
                      ...config,
                      instructionPack: {
                        ...pack,
                        workInstructionRefs: [...pack.workInstructionRefs, ...newRefs],
                      },
                    },
                  }));
                  toast({ title: `${selectedSecs.length} section(s) added`, description: `From "${docTitle}"` });
                }

                setShowDocPicker(false);
                setDocPickerSelectedDoc(null);
                setDocPickerSections([]);
                setDocPickerSearch('');
                setDocPickerSelectedSections(new Set());
              }}
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {docPickerUseWhole ? 'Add Whole Document' : `Add ${docPickerSelectedSections.size} Section(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DocPickerList({ search, selectedDocId, onSelectDoc }: { search: string; selectedDocId?: string; onSelectDoc: (doc: any) => void }) {
  const { data: docs, isLoading } = useQuery<any[]>({
    queryKey: ['/api/routing-documents'],
  });

  const filtered = (docs || []).filter((d: any) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (d.title || '').toLowerCase().includes(s) ||
      (d.file_name || '').toLowerCase().includes(s) ||
      (d.department_name || '').toLowerCase().includes(s) ||
      (d.part_number || '').toLowerCase().includes(s);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{search ? 'No documents match your search' : 'No documents in storage'}</p>
        <p className="text-xs mt-1">Upload documents in the Routing Document Management page first.</p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1">
      {filtered.map((doc: any) => (
        <div
          key={doc.id}
          className={`p-2 rounded-md cursor-pointer transition-colors ${
            selectedDocId === doc.id
              ? 'bg-primary/10 border border-primary'
              : 'hover:bg-muted border border-transparent'
          }`}
          onClick={() => onSelectDoc(doc)}
        >
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{doc.title || doc.file_name}</p>
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {doc.document_type && <Badge variant="outline" className="text-[9px] px-1 h-4">{doc.document_type}</Badge>}
                {doc.department_name && <Badge variant="secondary" className="text-[9px] px-1 h-4">{doc.department_name}</Badge>}
                {doc.ai_extracted_content && <Badge className="text-[9px] px-1 h-4 bg-green-100 text-green-700">AI Analyzed</Badge>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

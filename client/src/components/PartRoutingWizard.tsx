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
} from 'lucide-react';
import type { Employee, EmployeeCapability, Capability } from '../../../server/schema';

const P2_DEPARTMENTS = [
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
] as const;

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
}

interface QCStandard {
  standard: string; // The QC check description
  tolerance: string; // Acceptable tolerance/variance
  requirement: string; // Specific requirement or specification
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

interface SpecialProcessConfig {
  processName: string; // Name of the special process
  notes: string; // Process instructions/notes
  requiredTechnicianId: number | null; // REQUIRED technician for special process
  materials: MaterialRequirement[]; // Materials requiring traceability
  qcStandards: QCStandard[]; // QC standards for special process
  customDataFields: CustomDataField[]; // Custom data entry fields
}

interface DepartmentConfiguration {
  materials: MaterialRequirement[]; // Materials used in this department
  assignedTechnicianId: number | null; // Assigned technician (employee) for this department
  qcStandards: QCStandard[]; // QC standards with tolerance and requirements
  ovenCuringSteps?: OvenCuringStep[]; // Oven curing steps (for Assembly/Disassembly)
  specialProcess?: string; // Special process notes (for Assembly/Disassembly)
  specialProcessConfig?: SpecialProcessConfig; // Full special process configuration
  customDataFields?: CustomDataField[]; // Custom data entry fields for technicians to fill in
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
  
  // UI state for QC standards input
  const [qcStandardInput, setQcStandardInput] = useState<string>('');
  const [qcToleranceInput, setQcToleranceInput] = useState<string>('');
  const [qcRequirementInput, setQcRequirementInput] = useState<string>('');
  
  // UI state for oven curing input
  const [ovenTemperatureInput, setOvenTemperatureInput] = useState<string>('');
  const [ovenTimeInput, setOvenTimeInput] = useState<string>('');
  
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
    queryKey: ['/api/inventory-items-simple'],
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
  const getOrCreateDeptConfig = (dept: string): DepartmentConfiguration => {
    return departmentConfig[dept] || {
      materials: [],
      assignedTechnicianId: null,
      qcStandards: [],
    };
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

  const toggleDepartment = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
      // Remove department configuration
      const newConfig = { ...departmentConfig };
      delete newConfig[dept];
      setDepartmentConfig(newConfig);
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
      // Initialize department configuration with defaults
      if (!departmentConfig[dept]) {
        setDepartmentConfig({
          ...departmentConfig,
          [dept]: {
            materials: [],
            assignedTechnicianId: null,
            qcStandards: [],
          },
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
                  <Label>Available Departments</Label>
                  <div className="mt-2 space-y-2">
                    {P2_DEPARTMENTS.filter(d => !selectedDepartments.includes(d)).map((dept) => (
                      <Button
                        key={dept}
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => toggleDepartment(dept)}
                        data-testid={`button-add-dept-${dept.toLowerCase().replace(/[\/\s]/g, '-')}`}
                      >
                        <ChevronRight className="mr-2 h-4 w-4" />
                        {dept}
                      </Button>
                    ))}
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

          {/* Step 3: Department Configuration */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Step 3: Department Configuration</h3>
                <p className="text-sm text-muted-foreground">
                  Configure materials, technician requirements, and QC standards for each department
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
                  {selectedDepartments.map((dept) => {
                    const config = getOrCreateDeptConfig(dept);
                    const filteredMaterialItems = inventoryItems.filter(item =>
                      (item.agPartNumber?.toLowerCase() || '').includes(materialSearchTerm.toLowerCase()) ||
                      (item.name?.toLowerCase() || '').includes(materialSearchTerm.toLowerCase())
                    );

                    return (
                      <Card key={dept}>
                        <CardHeader>
                          <CardTitle className="text-base">{dept}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {/* Materials Section */}
                          <div>
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              Materials Requiring Traceability ({config.materials.length})
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
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => removeMaterialFromDepartment(dept, material.partId)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    
                                    {/* Entry Method */}
                                    <div className="mb-3 flex items-center gap-2">
                                      <Label className="text-xs font-semibold">Entry Method:</Label>
                                      <Button
                                        size="sm"
                                        variant={material.entryMethod === 'manual' ? 'default' : 'outline'}
                                        className="h-7 text-xs"
                                        onClick={() => toggleMaterialEntryMethod(dept, material.partId)}
                                      >
                                        {material.entryMethod === 'manual' ? 'Manual Entry' : 'Barcode Scan'}
                                      </Button>
                                    </div>
                                    
                                    {/* Traceability Fields */}
                                    {material.entryMethod === 'barcode' && (
                                      <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                                        <p className="text-xs text-blue-800 dark:text-blue-300">
                                          ✓ All traceability information is automatically captured when using barcode scanning
                                        </p>
                                      </div>
                                    )}
                                    <div className="grid grid-cols-2 gap-2">
                                      {TRACEABILITY_FIELDS.map((field) => (
                                        <div key={field.id} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`${dept}-${material.partId}-${field.id}`}
                                            checked={(material.requiredFields || []).includes(field.id)}
                                            disabled={material.entryMethod === 'barcode'}
                                            onCheckedChange={() => toggleMaterialTraceability(dept, material.partId, field.id)}
                                          />
                                          <Label
                                            htmlFor={`${dept}-${material.partId}-${field.id}`}
                                            className={`text-xs ${material.entryMethod === 'barcode' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                          >
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
                              <Label className="text-sm mb-2 block">Add Material:</Label>
                              <Input
                                placeholder="Search inventory..."
                                value={selectedDeptForConfig === dept ? materialSearchTerm : ''}
                                onChange={(e) => {
                                  setSelectedDeptForConfig(dept);
                                  setMaterialSearchTerm(e.target.value);
                                }}
                                onFocus={() => setSelectedDeptForConfig(dept)}
                                className="mb-2"
                              />
                              {selectedDeptForConfig === dept && materialSearchTerm && (
                                <ScrollArea className="h-32 border rounded">
                                  {filteredMaterialItems.map((item) => (
                                    <div
                                      key={item.id}
                                      className="p-2 hover:bg-muted cursor-pointer"
                                      onClick={() => {
                                        addMaterialToDepartment(dept, item);
                                        setMaterialSearchTerm('');
                                        setSelectedDeptForConfig('');
                                      }}
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

                          {/* Technician Assignment Section */}
                          <div>
                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                              <UserCheck className="h-4 w-4" />
                              Preferred Technician (Optional)
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              For scheduling reference only. <span className="text-primary font-medium">Any certified technician</span> can complete tasks in this department - certification is verified at task start.
                            </p>
                            {(() => {
                              const certifiedEmployees = getCertifiedEmployees(dept);
                              
                              if (certifiedEmployees.length === 0) {
                                return (
                                  <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                                    <p className="text-sm text-amber-800 dark:text-amber-300">
                                      ⚠️ No employees are certified for {selectedItem?.agPartNumber || 'this part'} in the {dept} department.
                                      Please add certifications in the P2 Certifications Manager first.
                                    </p>
                                  </div>
                                );
                              }
                              
                              return (
                                <Select
                                  value={config.assignedTechnicianId?.toString() || 'NONE'}
                                  onValueChange={(val) => setAssignedTechnician(dept, val)}
                                >
                                  <SelectTrigger data-testid={`select-technician-${dept}`}>
                                    <SelectValue placeholder="Select certified technician" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="NONE">No technician assigned</SelectItem>
                                    {certifiedEmployees.map((emp) => (
                                      <SelectItem key={emp.id} value={emp.id.toString()}>
                                        {emp.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            })()}
                          </div>

                          <Separator />

                          {/* QC Standards Section */}
                          <div>
                            <h4 className="font-semibold mb-3">QC Standards ({config.qcStandards.length})</h4>
                            {config.qcStandards.length > 0 && (
                              <div className="space-y-2 mb-3">
                                {config.qcStandards.map((qcStandard, idx) => (
                                  <Card key={idx} className="p-3">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <p className="font-medium text-sm">{qcStandard.standard}</p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => removeQcStandard(dept, idx)}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      <div>
                                        <span className="text-muted-foreground">Tolerance:</span>
                                        <p className="font-mono">{qcStandard.tolerance}</p>
                                      </div>
                                      <div>
                                        <span className="text-muted-foreground">Requirement:</span>
                                        <p className="font-mono">{qcStandard.requirement}</p>
                                      </div>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                            <div className="space-y-2">
                              <Input
                                placeholder="QC Standard (e.g., Surface Finish)"
                                value={selectedDeptForConfig === dept ? qcStandardInput : ''}
                                onChange={(e) => {
                                  setSelectedDeptForConfig(dept);
                                  setQcStandardInput(e.target.value);
                                }}
                                onFocus={() => setSelectedDeptForConfig(dept)}
                              />
                              <Input
                                placeholder="Tolerance (e.g., ±0.001 in)"
                                value={selectedDeptForConfig === dept ? qcToleranceInput : ''}
                                onChange={(e) => {
                                  setSelectedDeptForConfig(dept);
                                  setQcToleranceInput(e.target.value);
                                }}
                                onFocus={() => setSelectedDeptForConfig(dept)}
                              />
                              <Input
                                placeholder="Requirement (e.g., 32 Ra max)"
                                value={selectedDeptForConfig === dept ? qcRequirementInput : ''}
                                onChange={(e) => {
                                  setSelectedDeptForConfig(dept);
                                  setQcRequirementInput(e.target.value);
                                }}
                                onFocus={() => setSelectedDeptForConfig(dept)}
                              />
                              <Button
                                size="sm"
                                onClick={() => addQcStandard(dept)}
                                disabled={
                                  !qcStandardInput.trim() || 
                                  !qcToleranceInput.trim() || 
                                  !qcRequirementInput.trim() || 
                                  selectedDeptForConfig !== dept
                                }
                              >
                                Add QC Standard
                              </Button>
                            </div>
                          </div>

                          {/* Oven Curing Section - Only for Assemble/Disassembly */}
                          {dept === 'Assemble/Disassembly' && (
                            <>
                              <Separator />
                              <div>
                                <h4 className="font-semibold mb-3 flex items-center gap-2">
                                  <Flame className="h-4 w-4" />
                                  Oven Curing Steps ({config.ovenCuringSteps?.length || 0})
                                </h4>
                                <p className="text-sm text-muted-foreground mb-3">
                                  Add temperature ramp ups and downs for the curing process
                                </p>
                                
                                {/* Display existing curing steps */}
                                {config.ovenCuringSteps && config.ovenCuringSteps.length > 0 && (
                                  <div className="space-y-2 mb-3">
                                    {config.ovenCuringSteps.map((step, idx) => (
                                      <Card key={idx} className="p-3">
                                        <div className="flex items-start justify-between mb-2">
                                          <div className="flex-1">
                                            <p className="font-medium text-sm">Step {idx + 1}</p>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0"
                                            onClick={() => removeOvenCuringStep(dept, idx)}
                                            data-testid={`button-remove-curing-step-${idx}`}
                                          >
                                            <X className="h-4 w-4" />
                                          </Button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                          <div>
                                            <span className="text-muted-foreground">Temperature:</span>
                                            <p className="font-mono">{step.temperature}</p>
                                          </div>
                                          <div>
                                            <span className="text-muted-foreground">Time:</span>
                                            <p className="font-mono">{step.time}</p>
                                          </div>
                                        </div>
                                      </Card>
                                    ))}
                                  </div>
                                )}
                                
                                {/* Add new curing step */}
                                <div className="space-y-2">
                                  <div>
                                    <Label htmlFor={`oven-temp-${dept}`}>Temperature</Label>
                                    <Input
                                      id={`oven-temp-${dept}`}
                                      data-testid="input-oven-temperature"
                                      placeholder="e.g., 350°F"
                                      value={selectedDeptForConfig === dept ? ovenTemperatureInput : ''}
                                      onChange={(e) => {
                                        setSelectedDeptForConfig(dept);
                                        setOvenTemperatureInput(e.target.value);
                                      }}
                                      onFocus={() => setSelectedDeptForConfig(dept)}
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`oven-time-${dept}`}>Time</Label>
                                    <Input
                                      id={`oven-time-${dept}`}
                                      data-testid="input-oven-time"
                                      placeholder="e.g., 2 hours"
                                      value={selectedDeptForConfig === dept ? ovenTimeInput : ''}
                                      onChange={(e) => {
                                        setSelectedDeptForConfig(dept);
                                        setOvenTimeInput(e.target.value);
                                      }}
                                      onFocus={() => setSelectedDeptForConfig(dept)}
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => addOvenCuringStep(dept)}
                                    disabled={
                                      !ovenTemperatureInput.trim() || 
                                      !ovenTimeInput.trim() || 
                                      selectedDeptForConfig !== dept
                                    }
                                    data-testid="button-add-curing-step"
                                  >
                                    Add Curing Step
                                  </Button>
                                </div>
                              </div>

                            </>
                          )}

                          <Separator />

                          {/* Custom Data Fields Section - Available for All Departments */}
                          <div>
                            <h4 className="font-semibold mb-3">Custom Data Entry Fields ({config.customDataFields?.length || 0})</h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              Define custom fields that technicians will fill in when processing parts through this department
                            </p>
                            
                            {/* Display existing custom fields */}
                            {config.customDataFields && config.customDataFields.length > 0 && (
                              <div className="space-y-2 mb-3">
                                {config.customDataFields.map((field, idx) => (
                                  <Card key={idx} className="p-3">
                                    <div className="flex items-start justify-between mb-2">
                                      <div className="flex-1">
                                        <p className="font-medium text-sm">{field.fieldName}</p>
                                        <div className="flex gap-2 items-center mt-1">
                                          <Badge variant="outline" className="text-xs">
                                            {field.fieldType}
                                          </Badge>
                                          {field.isRequired && (
                                            <Badge variant="secondary" className="text-xs">
                                              Required
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => removeCustomDataField(dept, idx)}
                                        data-testid={`button-remove-custom-field-${idx}`}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                            
                            {/* Add new custom field */}
                            <div className="space-y-2">
                              <div>
                                <Label htmlFor={`custom-field-name-${dept}`}>Field Name</Label>
                                <Input
                                  id={`custom-field-name-${dept}`}
                                  data-testid="input-custom-field-name"
                                  placeholder="e.g., Temperature, Mold Number, Humidity"
                                  value={selectedDeptForConfig === dept ? customFieldName : ''}
                                  onChange={(e) => {
                                    setSelectedDeptForConfig(dept);
                                    setCustomFieldName(e.target.value);
                                  }}
                                  onFocus={() => setSelectedDeptForConfig(dept)}
                                />
                              </div>
                              <div>
                                <Label htmlFor={`custom-field-type-${dept}`}>Field Type</Label>
                                <Select
                                  value={selectedDeptForConfig === dept ? customFieldType : 'text'}
                                  onValueChange={(val: 'text' | 'number' | 'date' | 'textarea') => {
                                    setSelectedDeptForConfig(dept);
                                    setCustomFieldType(val);
                                  }}
                                >
                                  <SelectTrigger id={`custom-field-type-${dept}`} data-testid="select-custom-field-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="number">Number</SelectItem>
                                    <SelectItem value="date">Date</SelectItem>
                                    <SelectItem value="textarea">Text Area</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`custom-field-required-${dept}`}
                                  checked={selectedDeptForConfig === dept ? customFieldRequired : false}
                                  onCheckedChange={(checked) => {
                                    setSelectedDeptForConfig(dept);
                                    setCustomFieldRequired(checked as boolean);
                                  }}
                                  data-testid="checkbox-custom-field-required"
                                />
                                <Label htmlFor={`custom-field-required-${dept}`} className="cursor-pointer">
                                  Required field
                                </Label>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => addCustomDataField(dept)}
                                disabled={
                                  !customFieldName.trim() || 
                                  selectedDeptForConfig !== dept
                                }
                                data-testid="button-add-custom-field"
                              >
                                Add Custom Field
                              </Button>
                            </div>
                          </div>

                          <Separator />

                          {/* Special Process Section - Available for All Departments */}
                          <div>
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Special Process
                            </h4>
                            <p className="text-sm text-muted-foreground mb-3">
                              Configure special process requirements for this department (technician required)
                            </p>
                            <div className="space-y-2">
                              {config.specialProcessConfig?.processName && (
                                <Card className="p-3 bg-muted/30 border-l-4 border-l-primary">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <p className="font-medium">{config.specialProcessConfig.processName}</p>
                                      {config.specialProcessConfig.requiredTechnicianId && (
                                        <Badge variant="default" className="text-xs">
                                          <UserCheck className="h-3 w-3 mr-1" />
                                          Tech Assigned
                                        </Badge>
                                      )}
                                    </div>
                                    {config.specialProcessConfig.notes && (
                                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{config.specialProcessConfig.notes}</p>
                                    )}
                                    <div className="flex gap-4 text-xs text-muted-foreground">
                                      <span>Materials: {config.specialProcessConfig.materials?.length || 0}</span>
                                      <span>QC Standards: {config.specialProcessConfig.qcStandards?.length || 0}</span>
                                      <span>Custom Fields: {config.specialProcessConfig.customDataFields?.length || 0}</span>
                                    </div>
                                  </div>
                                </Card>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openSpecialProcessDialog(dept)}
                                data-testid={`button-configure-special-process-${dept.toLowerCase().replace(/[\/\s]/g, '-')}`}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                {config.specialProcessConfig?.processName ? 'Edit Special Process' : 'Configure Special Process'}
                              </Button>
                            </div>
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
    </>
  );
}

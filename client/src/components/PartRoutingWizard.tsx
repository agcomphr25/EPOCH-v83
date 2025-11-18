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
import {
  Route,
  Package,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  GripVertical,
} from 'lucide-react';

const P2_DEPARTMENTS = [
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
] as const;

const TRACEABILITY_FIELDS = [
  { id: 'lotNumber', label: 'Lot Number', description: 'Track material lot/batch identifier' },
  { id: 'batchNumber', label: 'Batch Number', description: 'Track production batch number' },
  { id: 'expirationDate', label: 'Expiration Date', description: 'Track material expiration' },
  { id: 'serialNumber', label: 'Serial Number', description: 'Track component serial number' },
  { id: 'revision', label: 'Revision', description: 'Track part revision level' },
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

interface DepartmentConfiguration {
  materials: MaterialRequirement[]; // Materials used in this department
  technicianRequired: boolean; // Whether technician is required for this department
  qcStandards: QCStandard[]; // QC standards with tolerance and requirements
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
}

export default function PartRoutingWizard({ open, onOpenChange, editRouting }: PartRoutingWizardProps) {
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
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
          technicianRequired: false,
          qcStandards: [],
        };
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      setDepartmentConfig(newConfig);
    }
  }, [selectedDepartments, open]);

  // Fetch inventory items for step 1 and step 3 (materials)
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    enabled: open && (step === 1 || step === 3),
  });

  // Filter inventory items by search
  const filteredItems = inventoryItems.filter(item =>
    (item.agPartNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
    (item.name?.toLowerCase() || '').includes(searchTerm.toLowerCase())
  );

  // Selected inventory item
  const selectedItem = inventoryItems.find(item => item.id === selectedItemId);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editRouting) {
        return apiRequest(`/api/part-routings/${editRouting.id}`, {
          method: 'PUT',
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
        description: 'Please select an inventory item',
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

    const data = {
      inventoryItemId: selectedItem.id,
      partNumber: selectedItem.agPartNumber,
      partName: selectedItem.name,
      departmentSequence: selectedDepartments,
      departmentConfig,
      createdBy: 'system', // TODO: Get from auth context
    };

    saveMutation.mutate(data);
  };

  // Department configuration handlers
  const getOrCreateDeptConfig = (dept: string): DepartmentConfiguration => {
    return departmentConfig[dept] || {
      materials: [],
      technicianRequired: false,
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
        return {
          ...material,
          entryMethod: newMethod,
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

  const toggleTechnicianRequired = (dept: string) => {
    const config = getOrCreateDeptConfig(dept);
    setDepartmentConfig({
      ...departmentConfig,
      [dept]: {
        ...config,
        technicianRequired: !config.technicianRequired,
      },
    });
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
            technicianRequired: false,
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="dialog-part-routing-wizard">
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

        <ScrollArea className="h-[400px] pr-4">
          {/* Step 1: Select Inventory Item */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Step 1: Select Inventory Item</h3>
                <p className="text-sm text-muted-foreground">
                  Choose the part that needs a custom routing workflow
                </p>
              </div>

              <div>
                <Label htmlFor="item-search">Search Parts</Label>
                <Input
                  id="item-search"
                  data-testid="input-item-search"
                  placeholder="Search by part number or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-colors ${
                      selectedItemId === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedItemId(item.id)}
                    data-testid={`card-inventory-item-${item.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-semibold">{item.agPartNumber}</p>
                          <p className="text-sm">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                          )}
                        </div>
                        {selectedItemId === item.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                                    <div className="grid grid-cols-2 gap-2">
                                      {TRACEABILITY_FIELDS.map((field) => (
                                        <div key={field.id} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`${dept}-${material.partId}-${field.id}`}
                                            checked={(material.requiredFields || []).includes(field.id)}
                                            onCheckedChange={() => toggleMaterialTraceability(dept, material.partId, field.id)}
                                          />
                                          <Label
                                            htmlFor={`${dept}-${material.partId}-${field.id}`}
                                            className="text-xs cursor-pointer"
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

                          {/* Technician Section */}
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-semibold">Technician Required</h4>
                              <p className="text-sm text-muted-foreground">Require technician assignment for this department</p>
                            </div>
                            <Checkbox
                              checked={config.technicianRequired}
                              onCheckedChange={() => toggleTechnicianRequired(dept)}
                            />
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
  );
}

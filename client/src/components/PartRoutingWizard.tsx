import { useState } from 'react';
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
  partNumber: string;
  partName: string;
  description?: string;
}

interface PartRouting {
  id: string;
  inventoryItemId: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  traceabilityConfig: Record<string, string[]>;
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
  const [traceabilityConfig, setTraceabilityConfig] = useState<Record<string, string[]>>(
    editRouting?.traceabilityConfig || {}
  );
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch inventory items
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/inventory'],
    enabled: open && step === 1,
  });

  // Filter inventory items by search
  const filteredItems = inventoryItems.filter(item =>
    item.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.partName.toLowerCase().includes(searchTerm.toLowerCase())
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
    setTraceabilityConfig({});
    setSearchTerm('');
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
      partNumber: selectedItem.partNumber,
      partName: selectedItem.partName,
      departmentSequence: selectedDepartments,
      traceabilityConfig,
      createdBy: 'system', // TODO: Get from auth context
    };

    saveMutation.mutate(data);
  };

  const toggleDepartment = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
      // Remove from traceability config
      const newConfig = { ...traceabilityConfig };
      delete newConfig[dept];
      setTraceabilityConfig(newConfig);
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
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

  const toggleTraceabilityField = (dept: string, fieldId: string) => {
    const currentFields = traceabilityConfig[dept] || [];
    if (currentFields.includes(fieldId)) {
      setTraceabilityConfig({
        ...traceabilityConfig,
        [dept]: currentFields.filter(f => f !== fieldId),
      });
    } else {
      setTraceabilityConfig({
        ...traceabilityConfig,
        [dept]: [...currentFields, fieldId],
      });
    }
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
                          <p className="font-mono font-semibold">{item.partNumber}</p>
                          <p className="text-sm">{item.partName}</p>
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
                      <span className="font-mono font-semibold">{selectedItem.partNumber}</span>
                      <span className="text-sm">- {selectedItem.partName}</span>
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

          {/* Step 3: Configure Traceability Requirements */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Step 3: Traceability Requirements</h3>
                <p className="text-sm text-muted-foreground">
                  Select which traceability data operators must scan/enter at each department
                </p>
              </div>

              {selectedItem && (
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono font-semibold">{selectedItem.partNumber}</span>
                      <span className="text-sm">- {selectedItem.partName}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {selectedDepartments.map((dept, index) => (
                        <Badge key={dept} variant="outline">
                          {index + 1}. {dept}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-4">
                {selectedDepartments.map((dept) => (
                  <Card key={dept}>
                    <CardHeader>
                      <CardTitle className="text-base">{dept}</CardTitle>
                      <CardDescription>
                        Select required traceability fields for this department
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {TRACEABILITY_FIELDS.map((field) => (
                        <div key={field.id} className="flex items-start space-x-3">
                          <Checkbox
                            id={`${dept}-${field.id}`}
                            data-testid={`checkbox-${dept.toLowerCase().replace(/[\/\s]/g, '-')}-${field.id}`}
                            checked={(traceabilityConfig[dept] || []).includes(field.id)}
                            onCheckedChange={() => toggleTraceabilityField(dept, field.id)}
                          />
                          <div className="flex-1">
                            <Label
                              htmlFor={`${dept}-${field.id}`}
                              className="text-sm font-medium cursor-pointer"
                            >
                              {field.label}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {field.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
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

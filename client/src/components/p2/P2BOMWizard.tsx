import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Layers,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
  Package
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface P2BOMWizardProps {
  poId?: number;
  onComplete: () => void;
  onCancel: () => void;
}

interface BOMItem {
  id: string;
  inventoryItemId: string | null;
  partNumber: string;
  description: string;
  quantity: number;
  isManufactured: boolean;
  firstDepartment: string;
}

interface PartNeedingBOM {
  id: string;
  partNumber: string;
  description: string;
  quantity: number;
  hasBOM: boolean;
  bomItems: BOMItem[];
}

const DEPARTMENT_OPTIONS = [
  { value: 'cutting_table', label: 'Cutting Table' },
  { value: 'core_department', label: 'Core Department' },
  { value: 'layup', label: 'Layup' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'disassembly', label: 'Disassembly' },
  { value: 'cnc', label: 'CNC' },
  { value: 'finish', label: 'Finish' },
  { value: 'paint', label: 'Paint' },
  { value: 'final_qc', label: 'Final QC' },
];

export default function P2BOMWizard({ poId, onComplete, onCancel }: P2BOMWizardProps) {
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [partsNeedingBOM, setPartsNeedingBOM] = useState<PartNeedingBOM[]>([]);
  const [currentBOMItems, setCurrentBOMItems] = useState<BOMItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<BOMItem>>({});
  const { toast } = useToast();

  const { data: poData } = useQuery<any>({
    queryKey: ['/api/p2-purchase-orders', poId],
    enabled: !!poId,
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory/items'],
  });

  const saveBOMMutation = useMutation({
    mutationFn: async (data: { partId: string; bomItems: BOMItem[] }) => {
      const response = await apiRequest(`/api/p2/bom/${data.partId}`, {
        method: 'POST',
        body: { bomItems: data.bomItems },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center'] });
      toast({
        title: 'BOM Saved',
        description: 'Bill of materials has been saved successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save BOM',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (poData?.lineItems) {
      const parts: PartNeedingBOM[] = poData.lineItems.map((item: any) => ({
        id: item.id.toString(),
        partNumber: item.partNumber,
        description: item.description || '',
        quantity: item.quantity,
        hasBOM: item.hasBOM || false,
        bomItems: item.bomItems || [],
      }));
      setPartsNeedingBOM(parts);
      if (parts.length > 0 && parts[0].bomItems) {
        setCurrentBOMItems(parts[0].bomItems);
      }
    }
  }, [poData]);

  const currentPart = partsNeedingBOM[currentPartIndex];
  const progress = partsNeedingBOM.length > 0 
    ? ((currentPartIndex + 1) / partsNeedingBOM.length) * 100 
    : 0;

  const addBOMItem = () => {
    if (!newItem.partNumber || !newItem.quantity) {
      toast({
        title: 'Missing Information',
        description: 'Please enter part number and quantity',
        variant: 'destructive',
      });
      return;
    }

    const item: BOMItem = {
      id: Date.now().toString(),
      inventoryItemId: newItem.inventoryItemId || null,
      partNumber: newItem.partNumber || '',
      description: newItem.description || '',
      quantity: newItem.quantity || 1,
      isManufactured: newItem.isManufactured || false,
      firstDepartment: newItem.firstDepartment || 'layup',
    };

    setCurrentBOMItems([...currentBOMItems, item]);
    setNewItem({});

    if (item.isManufactured) {
      const newPart: PartNeedingBOM = {
        id: `mfg-${Date.now()}`,
        partNumber: item.partNumber,
        description: item.description,
        quantity: item.quantity,
        hasBOM: false,
        bomItems: [],
      };
      
      const insertIndex = currentPartIndex + 1;
      const updatedParts = [...partsNeedingBOM];
      updatedParts.splice(insertIndex, 0, newPart);
      setPartsNeedingBOM(updatedParts);

      toast({
        title: 'Manufactured Part Added',
        description: `${item.partNumber} has been added to the BOM queue for configuration.`,
      });
    }
  };

  const removeBOMItem = (id: string) => {
    setCurrentBOMItems(currentBOMItems.filter((item) => item.id !== id));
  };

  const handleSaveAndNext = async () => {
    if (currentBOMItems.length === 0) {
      toast({
        title: 'No Items',
        description: 'Please add at least one BOM item',
        variant: 'destructive',
      });
      return;
    }

    await saveBOMMutation.mutateAsync({
      partId: currentPart.id,
      bomItems: currentBOMItems,
    });

    const updatedParts = [...partsNeedingBOM];
    updatedParts[currentPartIndex] = {
      ...updatedParts[currentPartIndex],
      hasBOM: true,
      bomItems: currentBOMItems,
    };
    setPartsNeedingBOM(updatedParts);

    if (currentPartIndex < partsNeedingBOM.length - 1) {
      setCurrentPartIndex(currentPartIndex + 1);
      setCurrentBOMItems(partsNeedingBOM[currentPartIndex + 1]?.bomItems || []);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    if (currentPartIndex < partsNeedingBOM.length - 1) {
      setCurrentPartIndex(currentPartIndex + 1);
      setCurrentBOMItems(partsNeedingBOM[currentPartIndex + 1]?.bomItems || []);
    } else {
      onComplete();
    }
  };

  const handleInventorySelect = (value: string) => {
    const item = inventoryItems.find((inv: any) => inv.id.toString() === value);
    if (item) {
      setNewItem({
        ...newItem,
        inventoryItemId: value,
        partNumber: item.partNumber || item.sku || '',
        description: item.description || item.name || '',
      });
    }
  };

  if (!currentPart) {
    return (
      <Card className="max-w-4xl mx-auto">
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
          <h3 className="text-xl font-semibold mb-2">All BOMs Configured</h3>
          <p className="text-muted-foreground mb-6">
            All parts have their bill of materials set up.
          </p>
          <Button onClick={onComplete}>Continue to Scheduling</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              BOM Configuration
            </CardTitle>
            <CardDescription>
              Part {currentPartIndex + 1} of {partsNeedingBOM.length}
            </CardDescription>
          </div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>

        <Progress value={progress} className="mt-4" />

        {/* Parts Overview */}
        <div className="flex flex-wrap gap-2 mt-4">
          {partsNeedingBOM.map((part, idx) => (
            <Badge
              key={part.id}
              variant={idx === currentPartIndex ? 'default' : part.hasBOM ? 'outline' : 'secondary'}
              className={`cursor-pointer ${idx === currentPartIndex ? '' : 'opacity-70'}`}
              onClick={() => {
                setCurrentPartIndex(idx);
                setCurrentBOMItems(part.bomItems || []);
              }}
            >
              {part.hasBOM && <Check className="h-3 w-3 mr-1" />}
              {part.partNumber}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Current Part Info */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{currentPart.partNumber}</h3>
                <p className="text-muted-foreground">{currentPart.description}</p>
              </div>
              <Badge variant="outline">Qty: {currentPart.quantity}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Add BOM Item Form */}
        <div className="space-y-4">
          <h4 className="font-medium">Add Component</h4>
          
          <div className="grid grid-cols-6 gap-2 items-end">
            <div className="col-span-2">
              <Label>From Inventory (Optional)</Label>
              <Select onValueChange={handleInventorySelect}>
                <SelectTrigger data-testid="select-inventory">
                  <SelectValue placeholder="Select item..." />
                </SelectTrigger>
                <SelectContent>
                  {inventoryItems.map((item: any) => (
                    <SelectItem key={item.id} value={item.id.toString()}>
                      {item.partNumber || item.sku} - {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Part Number</Label>
              <Input
                value={newItem.partNumber || ''}
                onChange={(e) => setNewItem({ ...newItem, partNumber: e.target.value })}
                placeholder="Part #"
                data-testid="input-bom-part-number"
              />
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={newItem.quantity || ''}
                onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 0 })}
                placeholder="Qty"
                data-testid="input-bom-quantity"
              />
            </div>

            <div>
              <Label>First Department</Label>
              <Select 
                value={newItem.firstDepartment || ''} 
                onValueChange={(v) => setNewItem({ ...newItem, firstDepartment: v })}
              >
                <SelectTrigger data-testid="select-first-department">
                  <SelectValue placeholder="Dept..." />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map((dept) => (
                    <SelectItem key={dept.value} value={dept.value}>
                      {dept.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={addBOMItem} data-testid="button-add-bom-item">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newItem.isManufactured || false}
                onChange={(e) => setNewItem({ ...newItem, isManufactured: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">This is a manufactured part (will prompt for its BOM next)</span>
            </label>
          </div>
        </div>

        <Separator />

        {/* Current BOM Items */}
        {currentBOMItems.length === 0 ? (
          <div className="text-center py-12 border rounded-lg border-dashed">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No BOM items added yet</p>
            <p className="text-sm text-muted-foreground">Add components above</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part Number</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead>First Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentBOMItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.partNumber}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {DEPARTMENT_OPTIONS.find(d => d.value === item.firstDepartment)?.label || item.firstDepartment}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.isManufactured ? (
                      <Badge variant="secondary">Manufactured</Badge>
                    ) : (
                      <Badge variant="outline">Purchased</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeBOMItem(item.id)}
                      data-testid={`button-remove-bom-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex justify-between pt-4">
          <div className="flex gap-2">
            {currentPartIndex > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCurrentPartIndex(currentPartIndex - 1);
                  setCurrentBOMItems(partsNeedingBOM[currentPartIndex - 1]?.bomItems || []);
                }}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Previous
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={handleSkip}>
              Skip This Part
            </Button>
          </div>

          <Button 
            onClick={handleSaveAndNext}
            disabled={saveBOMMutation.isPending}
            data-testid="button-save-bom"
          >
            {saveBOMMutation.isPending 
              ? 'Saving...' 
              : currentPartIndex < partsNeedingBOM.length - 1 
                ? 'Save & Next' 
                : 'Save & Finish'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

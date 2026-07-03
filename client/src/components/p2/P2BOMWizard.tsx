import { useState, useEffect, useMemo } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Layers,
  Plus,
  Trash2,
  Pencil,
  AlertCircle,
  CheckCircle,
  Package,
  ChevronsUpDown,
  Search
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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

interface InventoryDepartment {
  id: number;
  name: string;
}

interface DepartmentOption {
  value: string;
  label: string;
}

interface PartNeedingBOM {
  id: string;
  inventoryItemId?: string | null;
  partNumber: string;
  displayPartNumber?: string;
  description: string;
  quantity: number;
  hasBOM: boolean;
  bomItems: BOMItem[];
}

const DEFAULT_DEPARTMENT = 'Layup';
const FALLBACK_DEPARTMENT_OPTIONS: DepartmentOption[] = [
  { value: 'Production Queue', label: 'Production Queue' },
  { value: 'Layup', label: 'Layup' },
  { value: 'Barcode', label: 'Barcode' },
  { value: 'CNC', label: 'CNC' },
  { value: 'Gunsmith', label: 'Gunsmith' },
  { value: 'Paint', label: 'Paint' },
  { value: 'Finish', label: 'Finish' },
  { value: 'Finish QC', label: 'Finish QC' },
  { value: 'Shipping QC', label: 'Shipping QC' },
  { value: 'Shipping', label: 'Shipping' },
  { value: 'Cutting Table', label: 'Cutting Table' },
  { value: 'Office', label: 'Office' },
  { value: 'Assembly', label: 'Assembly' },
];
const LEGACY_DEPARTMENT_LABELS: Record<string, string> = {
  cutting_table: 'Cutting Table',
  core_department: 'Core Department',
  layup: 'Layup',
  assembly: 'Assembly',
  disassembly: 'Disassembly',
  cnc: 'CNC',
  finish: 'Finish',
  paint: 'Paint',
  final_qc: 'Final QC',
};

function getDepartmentLabel(value: string | undefined, options: DepartmentOption[]) {
  if (!value) return '';
  return options.find((department) => department.value === value)?.label ?? LEGACY_DEPARTMENT_LABELS[value] ?? value;
}

function departmentOptionsWithCurrent(options: DepartmentOption[], value: string | undefined) {
  if (!value || options.some((department) => department.value === value)) return options;
  return [...options, { value, label: getDepartmentLabel(value, options) }];
}

function parsePositiveQuantity(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function P2BOMWizard({ poId, onComplete, onCancel }: P2BOMWizardProps) {
  const [currentPartIndex, setCurrentPartIndex] = useState(0);
  const [partsNeedingBOM, setPartsNeedingBOM] = useState<PartNeedingBOM[]>([]);
  const [currentBOMItems, setCurrentBOMItems] = useState<BOMItem[]>([]);
  const [newItem, setNewItem] = useState<Partial<BOMItem>>({});
  const [editingItem, setEditingItem] = useState<BOMItem | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any>(null);
  const { toast } = useToast();

  const { data: poData } = useQuery<any>({
    queryKey: ['/api/p2-purchase-orders', poId],
    enabled: !!poId,
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: ['/api/inventory/items'],
  });

  const { data: inventoryDepartments = [] } = useQuery<InventoryDepartment[]>({
    queryKey: ['/api/inventory/departments'],
  });

  const departmentOptions = useMemo<DepartmentOption[]>(() => {
    if (inventoryDepartments.length === 0) return FALLBACK_DEPARTMENT_OPTIONS;
    return inventoryDepartments.map((department) => ({
      value: department.name,
      label: department.name,
    }));
  }, [inventoryDepartments]);

  const saveBOMMutation = useMutation({
    mutationFn: async (data: { partId: string; bomItems: BOMItem[]; poItemId?: string; partNumber?: string }) => {
      return await apiRequest(`/api/p2/bom/${data.partId}`, {
        method: 'POST',
        body: { 
          bomItems: data.bomItems,
          poItemId: data.poItemId,
          partNumber: data.partNumber
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-cutting-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-production-orders'] });
      toast({
        title: 'BOM Saved',
        description: 'Bill of materials has been saved successfully.',
      });
    },
    onError: (error: any) => {
      console.error('BOM save error:', error);
      const errorMessage = error?.message || error?.details || 'Failed to save BOM';
      toast({
        title: 'Error Saving BOM',
        description: errorMessage,
        variant: 'destructive',
      });
    },
  });

  // Fetch existing BOM items for a manufactured part
  const fetchExistingBOMItems = async (partNumber: string): Promise<BOMItem[]> => {
    try {
      const response = await fetch(`/api/p2/bom/items/${encodeURIComponent(partNumber)}`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return (data.bomItems || []).map((item: any) => ({
        id: item.id?.toString() || Date.now().toString(),
        inventoryItemId: item.inventoryItemId || null,
        partNumber: item.partName || item.partNumber || '',
        description: item.notes || item.description || '',
        quantity: item.quantity || 1,
        isManufactured: item.isManufactured === true || item.itemType === 'manufactured',
        firstDepartment: item.firstDept || item.firstDepartment || DEFAULT_DEPARTMENT,
      }));
    } catch (error) {
      console.error('Error fetching existing BOM items:', error);
      return [];
    }
  };

  useEffect(() => {
    if (poData?.lineItems) {
      const parts: PartNeedingBOM[] = poData.lineItems.map((item: any) => ({
        id: item.id.toString(),
        inventoryItemId: item.inventoryItemId != null ? String(item.inventoryItemId) : null,
        partNumber: item.internalPartNumber || item.agPartNumber || item.partNumber,
        displayPartNumber: item.partNumber,
        description: item.partName || item.description || '',
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

  // Filter inventory items based on search
  const filteredInventoryItems = useMemo(() => {
    if (!inventorySearch.trim()) return inventoryItems.slice(0, 50); // Show first 50 if no search
    const search = inventorySearch.toLowerCase();
    return inventoryItems.filter((item: any) => {
      const partNumber = (item.agPartNumber || item.partNumber || item.sku || '').toLowerCase();
      const name = (item.name || item.description || '').toLowerCase();
      return partNumber.includes(search) || name.includes(search);
    }).slice(0, 50);
  }, [inventoryItems, inventorySearch]);

  const handleInventoryItemSelect = (item: any) => {
    setSelectedInventoryItem(item);
    setNewItem({
      ...newItem,
      inventoryItemId: item.id.toString(),
      partNumber: item.agPartNumber || item.partNumber || item.sku || '',
      description: item.name || item.description || '',
    });
    setInventoryOpen(false);
    setInventorySearch('');
  };

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
      firstDepartment: newItem.firstDepartment || DEFAULT_DEPARTMENT,
    };

    setCurrentBOMItems([...currentBOMItems, item]);
    setNewItem({});
    setSelectedInventoryItem(null);

    if (item.isManufactured) {
      // Check if this manufactured part already exists in the queue
      const existsInQueue = partsNeedingBOM.some(p => p.partNumber === item.partNumber);
      
      if (!existsInQueue) {
        // Fetch existing BOM items for this manufactured part if it has a BOM
        fetchExistingBOMItems(item.partNumber).then((existingItems) => {
          const newPart: PartNeedingBOM = {
            id: `mfg-${Date.now()}`,
            partNumber: item.partNumber,
            description: item.description,
            quantity: item.quantity,
            hasBOM: existingItems.length > 0,
            bomItems: existingItems,
          };
          
          const insertIndex = currentPartIndex + 1;
          setPartsNeedingBOM(prev => {
            const updatedParts = [...prev];
            updatedParts.splice(insertIndex, 0, newPart);
            return updatedParts;
          });

          toast({
            title: 'Manufactured Part Added',
            description: existingItems.length > 0 
              ? `${item.partNumber} added to queue with existing BOM for review.`
              : `${item.partNumber} has been added to the BOM queue for configuration.`,
          });
        });
      } else {
        toast({
          title: 'Part Already in Queue',
          description: `${item.partNumber} is already in the BOM configuration queue.`,
        });
      }
    }
  };

  const removeBOMItem = (id: string) => {
    setCurrentBOMItems(currentBOMItems.filter((item) => item.id !== id));
  };

  const updateBOMItem = (updatedItem: BOMItem) => {
    setCurrentBOMItems(currentBOMItems.map((item) => 
      item.id === updatedItem.id ? updatedItem : item
    ));
    setEditingItem(null);
    toast({
      title: 'Item Updated',
      description: `${updatedItem.partNumber} has been updated.`,
    });
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
      poItemId: currentPart.id,
      partNumber: currentPart.partNumber
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
              Part {currentPartIndex + 1} of {partsNeedingBOM.length}: <span className="font-semibold text-foreground">{currentPart.partNumber}</span>
              {currentPart.description && <span className="ml-1">- {currentPart.description}</span>}
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
              <span className="font-semibold">{part.partNumber}</span>
              {part.description && (
                <span className="ml-1 font-normal opacity-80">- {part.description}</span>
              )}
            </Badge>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Nested Manufactured Parts Alert */}
        {partsNeedingBOM.some((p, idx) => idx > currentPartIndex && p.id.startsWith('mfg-')) && (
          <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-800 dark:text-amber-200">Nested Manufactured Parts Detected</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    You've added manufactured sub-assemblies that need their own BOMs. After completing this part, you'll be prompted to configure BOMs for: {partsNeedingBOM.filter((p, idx) => idx > currentPartIndex && p.id.startsWith('mfg-')).map(p => p.partNumber).join(', ')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
          
          {/* Inventory Search - Full Width */}
          <div className="space-y-2">
            <Label>Search Inventory (Optional)</Label>
            <Popover open={inventoryOpen} onOpenChange={setInventoryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={inventoryOpen}
                  className="w-full justify-between font-normal"
                  data-testid="select-inventory"
                >
                  {selectedInventoryItem ? (
                    <span className="truncate">
                      <span className="font-medium text-blue-600">
                        {selectedInventoryItem.agPartNumber || selectedInventoryItem.partNumber || selectedInventoryItem.sku}
                      </span>
                      <span className="text-muted-foreground"> - {selectedInventoryItem.name}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Type to search by part number or name...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[600px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search by part number or name..." 
                    value={inventorySearch}
                    onValueChange={setInventorySearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {inventorySearch.length < 2 
                        ? "Type at least 2 characters to search..."
                        : "No inventory items found."
                      }
                    </CommandEmpty>
                    <CommandGroup heading={`${filteredInventoryItems.length} items found`}>
                      <ScrollArea className="h-[300px]">
                        {filteredInventoryItems.map((item: any) => (
                          <CommandItem
                            key={item.id}
                            value={item.id.toString()}
                            onSelect={() => handleInventoryItemSelect(item)}
                            className="cursor-pointer"
                          >
                            <div className="flex flex-col gap-0.5 w-full">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-blue-600 min-w-[100px]">
                                  {item.agPartNumber || item.partNumber || item.sku || 'N/A'}
                                </span>
                                <span className="truncate">{item.name}</span>
                              </div>
                              {item.description && (
                                <span className="text-xs text-muted-foreground truncate">
                                  {item.description}
                                </span>
                              )}
                            </div>
                            {selectedInventoryItem?.id === item.id && (
                              <Check className="ml-auto h-4 w-4 text-green-600" />
                            )}
                          </CommandItem>
                        ))}
                      </ScrollArea>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="grid grid-cols-5 gap-2 items-end">
            <div>
              <Label>Part Number</Label>
              <Input
                value={newItem.partNumber || ''}
                onChange={(e) => setNewItem({ ...newItem, partNumber: e.target.value })}
                placeholder="Part #"
                data-testid="input-bom-part-number"
              />
            </div>

            <div className="col-span-2">
              <Label>Description</Label>
              <Input
                value={newItem.description || ''}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Description"
                data-testid="input-bom-description"
              />
            </div>

            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={newItem.quantity || ''}
                onChange={(e) => setNewItem({ ...newItem, quantity: parsePositiveQuantity(e.target.value) })}
                min="0.0001"
                step="any"
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
                  {departmentOptionsWithCurrent(departmentOptions, newItem.firstDepartment).map((dept) => (
                    <SelectItem key={dept.value} value={dept.value}>
                      {dept.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newItem.isManufactured || false}
                onChange={(e) => setNewItem({ ...newItem, isManufactured: e.target.checked })}
                className="rounded border-gray-300"
              />
              <span className="text-sm">This is a manufactured part (will prompt for its BOM next)</span>
            </label>
            
            <Button onClick={addBOMItem} data-testid="button-add-bom-item">
              <Plus className="h-4 w-4 mr-1" /> Add Component
            </Button>
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
                      {getDepartmentLabel(item.firstDepartment, departmentOptions)}
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
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingItem(item)}
                        data-testid={`button-edit-bom-${item.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBOMItem(item.id)}
                        data-testid={`button-remove-bom-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Edit Item Dialog */}
        <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit BOM Item</DialogTitle>
              <DialogDescription>Update the component details</DialogDescription>
            </DialogHeader>
            {editingItem && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Part Number</Label>
                    <Input
                      value={editingItem.partNumber}
                      onChange={(e) => setEditingItem({ ...editingItem, partNumber: e.target.value })}
                      data-testid="input-edit-part-number"
                    />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input
                      type="number"
                      value={editingItem.quantity}
                      onChange={(e) => setEditingItem({ ...editingItem, quantity: parsePositiveQuantity(e.target.value, 1) })}
                      min="0.0001"
                      step="any"
                      data-testid="input-edit-quantity"
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={editingItem.description}
                    onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                    data-testid="input-edit-description"
                  />
                </div>
                <div>
                  <Label>First Department</Label>
                  <Select 
                    value={editingItem.firstDepartment} 
                    onValueChange={(v) => setEditingItem({ ...editingItem, firstDepartment: v })}
                  >
                    <SelectTrigger data-testid="select-edit-department">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentOptionsWithCurrent(departmentOptions, editingItem.firstDepartment).map((dept) => (
                        <SelectItem key={dept.value} value={dept.value}>
                          {dept.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingItem.isManufactured}
                    onChange={(e) => setEditingItem({ ...editingItem, isManufactured: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">This is a manufactured part</span>
                </label>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingItem(null)}>
                    Cancel
                  </Button>
                  <Button onClick={() => {
                    if (editingItem) {
                      updateBOMItem({ ...editingItem });
                    }
                  }}>
                    Save Changes
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

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

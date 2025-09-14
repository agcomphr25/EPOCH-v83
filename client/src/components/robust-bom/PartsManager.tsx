import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Form, 
  FormControl, 
  FormDescription, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from '@/components/ui/form';
import { 
  Save, 
  X, 
  AlertTriangle, 
  DollarSign, 
  Package, 
  Settings, 
  Clock,
  Copy,
  Trash2
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// Enhanced part schema with all validation rules
const partSchema = z.object({
  sku: z.string()
    .min(1, "SKU is required")
    .max(50, "SKU must be 50 characters or less")
    .regex(/^[A-Z0-9_-]+$/, "SKU must contain only uppercase letters, numbers, underscores, and hyphens"),
  name: z.string()
    .min(1, "Part name is required")
    .max(200, "Part name must be 200 characters or less"),
  type: z.enum(['PURCHASED', 'MANUFACTURED', 'PHANTOM'], {
    errorMap: () => ({ message: "Part type is required" })
  }),
  uom: z.string()
    .min(1, "Unit of measure is required")
    .max(10, "UoM must be 10 characters or less"),
  purchaseUom: z.string()
    .min(1, "Purchase UoM is required")
    .max(10, "Purchase UoM must be 10 characters or less"),
  conversionFactor: z.number()
    .positive("Conversion factor must be positive")
    .max(999999, "Conversion factor too large"),
  stdCost: z.number()
    .min(0, "Standard cost must be non-negative")
    .max(999999, "Standard cost too large"),
  revision: z.string()
    .max(20, "Revision must be 20 characters or less")
    .optional(),
  description: z.string()
    .max(1000, "Description must be 1000 characters or less")
    .optional(),
  notes: z.string()
    .max(2000, "Notes must be 2000 characters or less")
    .optional(),
  lifecycleStatus: z.enum(['ACTIVE', 'OBSOLETE', 'DISCONTINUED', 'PHASE_OUT']),
  minQuantity: z.number()
    .positive("Minimum quantity must be positive")
    .max(999999, "Minimum quantity too large")
    .optional(),
  maxQuantity: z.number()
    .positive("Maximum quantity must be positive")
    .max(999999, "Maximum quantity too large")
    .optional(),
  decimalPrecision: z.number()
    .int("Decimal precision must be an integer")
    .min(0, "Decimal precision must be non-negative")
    .max(6, "Maximum decimal precision is 6"),
}).refine((data) => {
  if (data.minQuantity && data.maxQuantity) {
    return data.minQuantity <= data.maxQuantity;
  }
  return true;
}, {
  message: "Minimum quantity must be less than or equal to maximum quantity",
  path: ["maxQuantity"]
});

type PartFormData = z.infer<typeof partSchema>;

interface Part {
  id: string;
  sku: string;
  name: string;
  type: 'PURCHASED' | 'MANUFACTURED' | 'PHANTOM';
  uom: string;
  purchaseUom: string;
  conversionFactor: number;
  stdCost: number;
  revision?: string;
  description?: string;
  notes?: string;
  lifecycleStatus: 'ACTIVE' | 'OBSOLETE' | 'DISCONTINUED' | 'PHASE_OUT';
  minQuantity?: number;
  maxQuantity?: number;
  decimalPrecision: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

interface PartsManagerProps {
  part: Part | null;
  onClose: () => void;
  onSave: () => void;
}

// Common UoM options
const commonUoMs = [
  'ea', 'pc', 'pcs', 'each', 'piece',
  'ft', 'in', 'mm', 'cm', 'm',
  'lbs', 'kg', 'g', 'oz',
  'gal', 'qt', 'pt', 'fl oz', 'ml', 'l',
  'sqft', 'sqm', 'sqin',
  'box', 'case', 'pallet', 'roll',
  'set', 'kit', 'assy', 'lot'
];

export function PartsManager({ part, onClose, onSave }: PartsManagerProps) {
  const [activeTab, setActiveTab] = useState('basic');
  const [changeReason, setChangeReason] = useState('');
  const queryClient = useQueryClient();
  const isEditMode = part !== null && part.id;

  const form = useForm<PartFormData>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      sku: '',
      name: '',
      type: 'PURCHASED',
      uom: 'ea',
      purchaseUom: 'ea',
      conversionFactor: 1,
      stdCost: 0,
      revision: '',
      description: '',
      notes: '',
      lifecycleStatus: 'ACTIVE',
      minQuantity: undefined,
      maxQuantity: undefined,
      decimalPrecision: 3,
    }
  });

  // Load part data for editing
  useEffect(() => {
    if (part && part.id) {
      form.reset({
        sku: part.sku,
        name: part.name,
        type: part.type,
        uom: part.uom,
        purchaseUom: part.purchaseUom,
        conversionFactor: part.conversionFactor,
        stdCost: part.stdCost,
        revision: part.revision || '',
        description: part.description || '',
        notes: part.notes || '',
        lifecycleStatus: part.lifecycleStatus,
        minQuantity: part.minQuantity,
        maxQuantity: part.maxQuantity,
        decimalPrecision: part.decimalPrecision,
      });
    }
  }, [part, form]);

  // Get part cost history for edit mode
  const { data: costHistory } = useQuery({
    queryKey: ['robust-bom', 'parts', part?.id, 'cost-history'],
    queryFn: async () => {
      if (!part?.id) return [];
      const response = await fetch(`/api/robust-bom/parts/${part.id}/cost-history`);
      if (!response.ok) throw new Error('Failed to fetch cost history');
      return response.json();
    },
    enabled: !!part?.id
  });

  // Create part mutation
  const createPartMutation = useMutation({
    mutationFn: async (data: PartFormData) => {
      return await apiRequest('/api/robust-bom/parts', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      toast.success('Part created successfully');
      queryClient.invalidateQueries({ queryKey: ['robust-bom', 'parts'] });
      onSave();
    },
    onError: (error: any) => {
      toast.error(`Failed to create part: ${error.message}`);
    }
  });

  // Update part mutation
  const updatePartMutation = useMutation({
    mutationFn: async (data: PartFormData) => {
      if (!part?.id) throw new Error('No part ID provided');
      return await apiRequest(`/api/robust-bom/parts/${part.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...data, changeReason })
      });
    },
    onSuccess: () => {
      toast.success('Part updated successfully');
      queryClient.invalidateQueries({ queryKey: ['robust-bom', 'parts'] });
      onSave();
    },
    onError: (error: any) => {
      toast.error(`Failed to update part: ${error.message}`);
    }
  });

  // Update lifecycle mutation
  const updateLifecycleMutation = useMutation({
    mutationFn: async ({ lifecycleStatus, reason }: { lifecycleStatus: string; reason: string }) => {
      if (!part?.id) throw new Error('No part ID provided');
      return await apiRequest(`/api/robust-bom/parts/${part.id}/lifecycle`, {
        method: 'PUT',
        body: JSON.stringify({ lifecycleStatus, reason })
      });
    },
    onSuccess: () => {
      toast.success('Lifecycle status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['robust-bom', 'parts'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update lifecycle: ${error.message}`);
    }
  });

  const onSubmit = (data: PartFormData) => {
    if (isEditMode) {
      updatePartMutation.mutate(data);
    } else {
      createPartMutation.mutate(data);
    }
  };

  const handleLifecycleChange = (newStatus: string) => {
    if (!part?.id) return;
    
    const reason = prompt(`Please enter reason for changing lifecycle status to ${newStatus}:`);
    if (reason) {
      updateLifecycleMutation.mutate({ lifecycleStatus: newStatus, reason });
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden" data-testid="dialog-parts-manager">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" data-testid="text-dialog-title">
            <Package className="h-5 w-5" />
            {isEditMode ? `Edit Part: ${part?.sku}` : 'Create New Part'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? 'Modify part details with full audit trail tracking' 
              : 'Create a new part with proper validation and constraints'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4 mb-4" data-testid="tabs-parts-manager">
              <TabsTrigger value="basic" data-testid="tab-basic-info">Basic Info</TabsTrigger>
              <TabsTrigger value="specs" data-testid="tab-specifications">Specifications</TabsTrigger>
              <TabsTrigger value="lifecycle" data-testid="tab-lifecycle">Lifecycle</TabsTrigger>
              <TabsTrigger value="history" disabled={!isEditMode} data-testid="tab-history">History</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Basic Information Tab */}
                  <TabsContent value="basic" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="sku"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SKU (Stock Keeping Unit) *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter part SKU" 
                                {...field} 
                                className="uppercase"
                                data-testid="input-sku"
                              />
                            </FormControl>
                            <FormDescription>
                              Uppercase letters, numbers, underscores, and hyphens only
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Part Name *</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter part name" 
                                {...field} 
                                data-testid="input-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Part Type *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-type">
                                  <SelectValue placeholder="Select part type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="PURCHASED">Purchased</SelectItem>
                                <SelectItem value="MANUFACTURED">Manufactured</SelectItem>
                                <SelectItem value="PHANTOM">Phantom</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Purchased: Bought from vendors | Manufactured: Made in-house | Phantom: Logical grouping
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="revision"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Revision</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter revision (e.g., A, B, 1.0)" 
                                {...field} 
                                data-testid="input-revision"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Enter detailed part description" 
                              rows={3}
                              {...field} 
                              data-testid="textarea-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Enter additional notes or comments" 
                              rows={2}
                              {...field} 
                              data-testid="textarea-notes"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  {/* Specifications Tab */}
                  <TabsContent value="specs" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="uom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Usage Unit of Measure *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-uom">
                                  <SelectValue placeholder="Select UoM" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {commonUoMs.map(uom => (
                                  <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Primary unit for BOM quantities and usage
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="purchaseUom"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Purchase Unit of Measure *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-purchase-uom">
                                  <SelectValue placeholder="Select Purchase UoM" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {commonUoMs.map(uom => (
                                  <SelectItem key={uom} value={uom}>{uom}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Unit used when purchasing this part
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="conversionFactor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Conversion Factor *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.0001"
                                placeholder="1.0" 
                                {...field}
                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                data-testid="input-conversion-factor"
                              />
                            </FormControl>
                            <FormDescription>
                              Usage UoM = Purchase UoM × Conversion Factor
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="stdCost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Standard Cost *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.01"
                                placeholder="0.00" 
                                {...field}
                                onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                data-testid="input-std-cost"
                              />
                            </FormControl>
                            <FormDescription>
                              Cost per usage UoM
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="minQuantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Minimum Quantity</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.001"
                                placeholder="Optional" 
                                {...field}
                                onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                data-testid="input-min-quantity"
                              />
                            </FormControl>
                            <FormDescription>
                              Minimum allowed quantity in BOMs
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="maxQuantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Maximum Quantity</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.001"
                                placeholder="Optional" 
                                {...field}
                                onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                                data-testid="input-max-quantity"
                              />
                            </FormControl>
                            <FormDescription>
                              Maximum allowed quantity in BOMs
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="decimalPrecision"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Decimal Precision *</FormLabel>
                            <Select onValueChange={value => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
                              <FormControl>
                                <SelectTrigger data-testid="select-decimal-precision">
                                  <SelectValue placeholder="Select precision" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="0">0 (whole numbers)</SelectItem>
                                <SelectItem value="1">1 decimal place</SelectItem>
                                <SelectItem value="2">2 decimal places</SelectItem>
                                <SelectItem value="3">3 decimal places</SelectItem>
                                <SelectItem value="4">4 decimal places</SelectItem>
                                <SelectItem value="5">5 decimal places</SelectItem>
                                <SelectItem value="6">6 decimal places</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription>
                              Number of decimal places for quantities
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </TabsContent>

                  {/* Lifecycle Tab */}
                  <TabsContent value="lifecycle" className="space-y-6">
                    <FormField
                      control={form.control}
                      name="lifecycleStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lifecycle Status *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-lifecycle-status">
                                <SelectValue placeholder="Select lifecycle status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ACTIVE">Active</SelectItem>
                              <SelectItem value="PHASE_OUT">Phase Out</SelectItem>
                              <SelectItem value="OBSOLETE">Obsolete</SelectItem>
                              <SelectItem value="DISCONTINUED">Discontinued</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Active: Normal use | Phase Out: Planning to obsolete | Obsolete: Cannot use in new BOMs | Discontinued: No longer available
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isEditMode && part && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Quick Lifecycle Actions</CardTitle>
                          <CardDescription>
                            Change lifecycle status with reason tracking
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex gap-2 flex-wrap">
                            {['ACTIVE', 'PHASE_OUT', 'OBSOLETE', 'DISCONTINUED'].map(status => (
                              <Button
                                key={status}
                                variant={part.lifecycleStatus === status ? "default" : "outline"}
                                size="sm"
                                onClick={() => handleLifecycleChange(status)}
                                disabled={updateLifecycleMutation.isPending}
                                data-testid={`button-lifecycle-${status.toLowerCase()}`}
                              >
                                {status.replace('_', ' ')}
                              </Button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* History Tab */}
                  <TabsContent value="history" className="space-y-6">
                    {costHistory && costHistory.length > 0 ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">Cost History</CardTitle>
                          <CardDescription>
                            Recent cost changes with audit trail
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {costHistory.slice(0, 10).map((entry: any, index: number) => (
                              <div key={entry.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                <div>
                                  <span className="font-medium">${entry.newCost.toFixed(2)}</span>
                                  {entry.oldCost && (
                                    <span className="text-gray-500 ml-2">
                                      (from ${entry.oldCost.toFixed(2)})
                                    </span>
                                  )}
                                  <div className="text-xs text-gray-500">{entry.changeReason}</div>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(entry.effectiveDate).toLocaleDateString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No cost history available
                      </div>
                    )}
                  </TabsContent>
                </form>
              </Form>
            </ScrollArea>
          </Tabs>
        </div>

        <Separator className="my-4" />

        <DialogFooter className="flex justify-between">
          <div>
            {isEditMode && (
              <div className="space-y-2">
                <Label htmlFor="change-reason" className="text-sm">Change Reason</Label>
                <Input
                  id="change-reason"
                  placeholder="Enter reason for changes..."
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  className="w-64"
                  data-testid="input-change-reason"
                />
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={onClose}
              data-testid="button-cancel"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={form.handleSubmit(onSubmit)}
              disabled={createPartMutation.isPending || updatePartMutation.isPending}
              data-testid="button-save"
            >
              <Save className="h-4 w-4 mr-2" />
              {createPartMutation.isPending || updatePartMutation.isPending ? 'Saving...' : 'Save Part'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
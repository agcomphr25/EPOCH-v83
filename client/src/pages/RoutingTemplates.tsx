import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  BookTemplate,
  Plus,
  Pencil,
  Trash2,
  List,
  CheckCircle,
  XCircle,
  Copy,
} from 'lucide-react';

const ROUTING_TYPES = ['COMPOSITE', 'CNC', 'CORE', 'KIT', 'SUB_ASSEMBLY', 'ASSEMBLY', 'OUTSIDE_PROCESS', 'INSPECTION'] as const;
type RoutingType = typeof ROUTING_TYPES[number];

const OPERATION_TYPES = ['SETUP', 'RUN', 'INSPECT', 'OSP', 'MATERIAL', 'QC'] as const;

interface RoutingTemplate {
  id: string;
  templateName: string;
  routingType: RoutingType;
  description: string | null;
  isActive: boolean;
  departmentSequence: string[];
  departmentConfig: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
}

interface RoutingTemplateOperation {
  id: number;
  routingTemplateId: string;
  stepNumber: number;
  departmentName: string;
  operationName: string;
  operationType: string;
  workCenter: string | null;
  estimatedMinutes: number | null;
  requiresSignature: boolean | null;
  requiresCertification: boolean | null;
  isOutsideProcess: boolean | null;
  vendorId: number | null;
  createdAt: string | null;
}

const routingTypeColors: Record<RoutingType, string> = {
  COMPOSITE: 'bg-blue-100 text-blue-800',
  CNC: 'bg-orange-100 text-orange-800',
  CORE: 'bg-purple-100 text-purple-800',
  KIT: 'bg-green-100 text-green-800',
  SUB_ASSEMBLY: 'bg-yellow-100 text-yellow-800',
  ASSEMBLY: 'bg-teal-100 text-teal-800',
  OUTSIDE_PROCESS: 'bg-red-100 text-red-800',
  INSPECTION: 'bg-gray-100 text-gray-800',
};

const templateFormSchema = z.object({
  templateName: z.string().min(1, 'Template name is required'),
  routingType: z.enum(ROUTING_TYPES),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});
type TemplateFormValues = z.infer<typeof templateFormSchema>;

const operationFormSchema = z.object({
  stepNumber: z.coerce.number().int().positive('Step must be positive'),
  departmentName: z.string().min(1, 'Department is required'),
  operationName: z.string().min(1, 'Operation name is required'),
  operationType: z.enum(OPERATION_TYPES),
  workCenter: z.string().optional(),
  estimatedMinutes: z.coerce.number().int().positive().optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  requiresSignature: z.boolean().default(false),
  requiresCertification: z.boolean().default(false),
  isOutsideProcess: z.boolean().default(false),
});
type OperationFormValues = z.infer<typeof operationFormSchema>;

const createRoutingSchema = z.object({
  inventoryItemId: z.string().min(1, 'Item ID is required'),
  partNumber: z.string().min(1, 'Part number is required'),
  partName: z.string().min(1, 'Part name is required'),
  routingName: z.string().optional(),
  createdBy: z.string().min(1, 'Created by is required'),
});
type CreateRoutingValues = z.infer<typeof createRoutingSchema>;

export default function RoutingTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState<string>('');
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; template: RoutingTemplate | null }>({ open: false, template: null });
  const [operationsDialog, setOperationsDialog] = useState<{ open: boolean; template: RoutingTemplate | null }>({ open: false, template: null });
  const [createRoutingDialog, setCreateRoutingDialog] = useState<{ open: boolean; template: RoutingTemplate | null }>({ open: false, template: null });
  const [deleteConfirm, setDeleteConfirm] = useState<RoutingTemplate | null>(null);
  const [pendingOps, setPendingOps] = useState<Omit<RoutingTemplateOperation, 'id' | 'routingTemplateId' | 'createdAt'>[]>([]);
  const [addOpOpen, setAddOpOpen] = useState(false);

  const { data: templates = [], isLoading } = useQuery<RoutingTemplate[]>({
    queryKey: ['/api/routing-templates', typeFilter || null],
    queryFn: async () => {
      const url = typeFilter ? `/api/routing-templates?routingType=${typeFilter}` : '/api/routing-templates';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load templates');
      return res.json();
    },
  });

  const { data: templateOps = [] } = useQuery<RoutingTemplateOperation[]>({
    queryKey: ['/api/routing-templates', operationsDialog.template?.id, 'operations'],
    queryFn: async () => {
      if (!operationsDialog.template) return [];
      const res = await fetch(`/api/routing-templates/${operationsDialog.template.id}/operations`);
      if (!res.ok) throw new Error('Failed to load operations');
      return res.json();
    },
    enabled: !!operationsDialog.template?.id && operationsDialog.open,
  });

  const templateForm = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: { templateName: '', routingType: 'COMPOSITE', description: '', isActive: true },
  });

  const operationForm = useForm<OperationFormValues>({
    resolver: zodResolver(operationFormSchema),
    defaultValues: {
      stepNumber: 1,
      departmentName: '',
      operationName: '',
      operationType: 'SETUP',
      workCenter: '',
      requiresSignature: false,
      requiresCertification: false,
      isOutsideProcess: false,
    },
  });

  const createRoutingForm = useForm<CreateRoutingValues>({
    resolver: zodResolver(createRoutingSchema),
    defaultValues: { inventoryItemId: '', partNumber: '', partName: '', routingName: '', createdBy: 'admin' },
  });

  const createMutation = useMutation({
    mutationFn: (data: TemplateFormValues) => apiRequest('/api/routing-templates', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/routing-templates'] });
      setTemplateDialog({ open: false, template: null });
      toast({ title: 'Template created' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TemplateFormValues }) =>
      apiRequest(`/api/routing-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/routing-templates'] });
      setTemplateDialog({ open: false, template: null });
      toast({ title: 'Template updated' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/routing-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/routing-templates'] });
      setDeleteConfirm(null);
      toast({ title: 'Template deleted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const replaceOpsMutation = useMutation({
    mutationFn: ({ id, ops }: { id: string; ops: typeof pendingOps }) =>
      apiRequest(`/api/routing-templates/${id}/operations/replace`, { method: 'PUT', body: JSON.stringify(ops) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/routing-templates', operationsDialog.template?.id, 'operations'] });
      toast({ title: 'Operations saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const createRoutingMutation = useMutation({
    mutationFn: ({ templateId, data }: { templateId: string; data: CreateRoutingValues }) =>
      apiRequest(`/api/routing-templates/${templateId}/create-routing`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/part-routings'] });
      setCreateRoutingDialog({ open: false, template: null });
      toast({ title: 'Routing created', description: `Routing ${result?.routing?.partNumber} created from template` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  function openCreate() {
    templateForm.reset({ templateName: '', routingType: 'COMPOSITE', description: '', isActive: true });
    setTemplateDialog({ open: true, template: null });
  }

  function openEdit(t: RoutingTemplate) {
    templateForm.reset({
      templateName: t.templateName,
      routingType: t.routingType,
      description: t.description ?? '',
      isActive: t.isActive,
    });
    setTemplateDialog({ open: true, template: t });
  }

  function openOperations(t: RoutingTemplate) {
    setPendingOps([]);
    setOperationsDialog({ open: true, template: t });
  }

  function onTemplateSubmit(data: TemplateFormValues) {
    if (templateDialog.template) {
      updateMutation.mutate({ id: templateDialog.template.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  function onAddOperation(data: OperationFormValues) {
    const op = {
      stepNumber: data.stepNumber,
      departmentName: data.departmentName,
      operationName: data.operationName,
      operationType: data.operationType,
      workCenter: data.workCenter || null,
      estimatedMinutes: typeof data.estimatedMinutes === 'number' ? data.estimatedMinutes : null,
      requiresSignature: data.requiresSignature,
      requiresCertification: data.requiresCertification,
      isOutsideProcess: data.isOutsideProcess,
      vendorId: null,
    };
    setPendingOps(prev => [...prev, op].sort((a, b) => a.stepNumber - b.stepNumber));
    operationForm.reset({ stepNumber: (data.stepNumber + 1), departmentName: data.departmentName, operationName: '', operationType: 'RUN', workCenter: data.workCenter, requiresSignature: false, requiresCertification: false, isOutsideProcess: false });
    setAddOpOpen(false);
  }

  function saveOperations() {
    if (!operationsDialog.template) return;
    const opsToSave = pendingOps.length > 0 ? pendingOps : templateOps.map(op => ({
      stepNumber: op.stepNumber,
      departmentName: op.departmentName,
      operationName: op.operationName,
      operationType: op.operationType,
      workCenter: op.workCenter,
      estimatedMinutes: op.estimatedMinutes,
      requiresSignature: op.requiresSignature ?? false,
      requiresCertification: op.requiresCertification ?? false,
      isOutsideProcess: op.isOutsideProcess ?? false,
      vendorId: op.vendorId,
    }));
    replaceOpsMutation.mutate({ id: operationsDialog.template.id, ops: opsToSave });
    setPendingOps([]);
  }

  const displayOps = pendingOps.length > 0 ? pendingOps : templateOps;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookTemplate className="h-6 w-6" />
            Routing Templates
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reusable routing configurations for standardized manufacturing processes
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Template
        </Button>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <Label className="whitespace-nowrap text-sm">Filter by Type:</Label>
            <Select value={typeFilter || 'all'} onValueChange={v => setTypeFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ROUTING_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle>Templates ({templates.length})</CardTitle>
          <CardDescription>Click Manage Operations to define the standard steps for a template.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading templates…</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookTemplate className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No templates found. Create one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.templateName}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${routingTypeColors[t.routingType] || 'bg-gray-100 text-gray-800'}`}>
                        {t.routingType.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.description || '—'}</TableCell>
                    <TableCell>
                      {t.isActive
                        ? <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle className="h-3.5 w-3.5" />Active</span>
                        : <span className="flex items-center gap-1 text-gray-400 text-sm"><XCircle className="h-3.5 w-3.5" />Inactive</span>
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openOperations(t)}>
                          <List className="h-3.5 w-3.5 mr-1" />
                          Operations
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => {
                          createRoutingForm.reset({ inventoryItemId: '', partNumber: '', partName: '', routingName: t.templateName, createdBy: 'admin' });
                          setCreateRoutingDialog({ open: true, template: t });
                        }}>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Use
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(t)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Template Dialog */}
      <Dialog open={templateDialog.open} onOpenChange={open => { if (!open) setTemplateDialog({ open: false, template: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{templateDialog.template ? 'Edit Template' : 'New Routing Template'}</DialogTitle>
            <DialogDescription>
              {templateDialog.template ? 'Update the template configuration.' : 'Create a reusable routing template for a manufacturing process type.'}
            </DialogDescription>
          </DialogHeader>
          <Form {...templateForm}>
            <form onSubmit={templateForm.handleSubmit(onTemplateSubmit)} className="space-y-4">
              <FormField
                control={templateForm.control}
                name="templateName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl><Input placeholder="e.g. CNC Basic Part" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={templateForm.control}
                name="routingType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROUTING_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={templateForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="Optional description…" rows={2} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={templateForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="font-normal">Active</FormLabel>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setTemplateDialog({ open: false, template: null })}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {templateDialog.template ? 'Save Changes' : 'Create Template'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Operations Dialog */}
      <Dialog open={operationsDialog.open} onOpenChange={open => { if (!open) { setOperationsDialog({ open: false, template: null }); setPendingOps([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Template Operations — {operationsDialog.template?.templateName}</DialogTitle>
            <DialogDescription>Define the standard steps for this routing template. Steps will be copied when creating a routing from this template.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Operations List */}
            {displayOps.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No operations yet. Add steps below.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Operation</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Work Center</TableHead>
                    <TableHead className="w-16">Min</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayOps.map((op, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="text-muted-foreground">{op.stepNumber}</TableCell>
                      <TableCell>{op.departmentName}</TableCell>
                      <TableCell>{op.operationName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{op.operationType}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{op.workCenter || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{op.estimatedMinutes ?? '—'}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-6 w-6 p-0"
                          onClick={() => {
                            if (pendingOps.length > 0) {
                              setPendingOps(prev => prev.filter((_, i) => i !== idx));
                            } else {
                              const updated = [...templateOps];
                              updated.splice(idx, 1);
                              setPendingOps(updated.map(o => ({
                                stepNumber: o.stepNumber,
                                departmentName: o.departmentName,
                                operationName: o.operationName,
                                operationType: o.operationType,
                                workCenter: o.workCenter,
                                estimatedMinutes: o.estimatedMinutes,
                                requiresSignature: o.requiresSignature ?? false,
                                requiresCertification: o.requiresCertification ?? false,
                                isOutsideProcess: o.isOutsideProcess ?? false,
                                vendorId: o.vendorId,
                              })));
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Add Operation inline */}
            {addOpOpen ? (
              <Form {...operationForm}>
                <form onSubmit={operationForm.handleSubmit(onAddOperation)} className="border rounded-md p-4 space-y-3 bg-muted/30">
                  <p className="text-sm font-medium">Add Operation</p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={operationForm.control} name="stepNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Step #</FormLabel>
                        <FormControl><Input type="number" min={1} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="operationType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {OPERATION_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="departmentName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl><Input placeholder="e.g. CNC" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="operationName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Operation Name</FormLabel>
                        <FormControl><Input placeholder="e.g. Machine Profile" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="workCenter" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Work Center</FormLabel>
                        <FormControl><Input placeholder="Optional" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="estimatedMinutes" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Est. Minutes</FormLabel>
                        <FormControl><Input type="number" min={1} placeholder="Optional" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex gap-4">
                    <FormField control={operationForm.control} name="requiresSignature" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal text-sm">Requires Signature</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="requiresCertification" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal text-sm">Requires Certification</FormLabel>
                      </FormItem>
                    )} />
                    <FormField control={operationForm.control} name="isOutsideProcess" render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal text-sm">Outside Process</FormLabel>
                      </FormItem>
                    )} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">Add Step</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setAddOpOpen(false)}>Cancel</Button>
                  </div>
                </form>
              </Form>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAddOpOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Step
              </Button>
            )}

            {(pendingOps.length > 0 || displayOps.length > 0) && (
              <div className="flex justify-end gap-2 pt-2 border-t">
                {pendingOps.length > 0 && (
                  <p className="text-xs text-amber-600 self-center">Unsaved changes — click Save to apply</p>
                )}
                <Button onClick={saveOperations} disabled={replaceOpsMutation.isPending} size="sm">
                  Save Operations
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Routing from Template Dialog */}
      <Dialog open={createRoutingDialog.open} onOpenChange={open => { if (!open) setCreateRoutingDialog({ open: false, template: null }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Routing from Template</DialogTitle>
            <DialogDescription>
              Creating a routing based on <strong>{createRoutingDialog.template?.templateName}</strong>. Enter part-specific details below.
            </DialogDescription>
          </DialogHeader>
          <Form {...createRoutingForm}>
            <form onSubmit={createRoutingForm.handleSubmit(data => {
              if (!createRoutingDialog.template) return;
              createRoutingMutation.mutate({ templateId: createRoutingDialog.template.id, data });
            })} className="space-y-4">
              <FormField control={createRoutingForm.control} name="partNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Part Number</FormLabel>
                  <FormControl><Input placeholder="e.g. PN-001" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createRoutingForm.control} name="partName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Part Name</FormLabel>
                  <FormControl><Input placeholder="e.g. Wing Spar" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createRoutingForm.control} name="inventoryItemId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Inventory Item ID</FormLabel>
                  <FormControl><Input placeholder="Item ID from inventory" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createRoutingForm.control} name="routingName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Routing Name (optional)</FormLabel>
                  <FormControl><Input placeholder="Defaults to template name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createRoutingForm.control} name="createdBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Created By</FormLabel>
                  <FormControl><Input placeholder="Username" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateRoutingDialog({ open: false, template: null })}>Cancel</Button>
                <Button type="submit" disabled={createRoutingMutation.isPending}>Create Routing</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Delete <strong>{deleteConfirm?.templateName}</strong>? This will also remove all template operations. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Tag,
  Plus,
  Pencil,
  Copy,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Users,
  CheckCircle,
} from 'lucide-react';
import { insertChargeCodeSchema, type ChargeCode } from '@shared/schema';

import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const chargeCodeFormSchema = insertChargeCodeSchema.extend({
  code: z.string().min(1, 'Code is required'),
  type: z.enum(['DIRECT', 'OVERHEAD', 'G_AND_A', 'IR_AND_D', 'B_AND_P']),
  costHandling: z.enum([
    'DIRECT_CONTRACT',
    'IRAD',
    'BID_PROPOSAL',
    'FRINGE',
    'OVERHEAD',
    'G_AND_A',
    'UNALLOWABLE',
    'OTHER',
  ]),
  productionLine: z.string().min(1, 'Production line is required'),
  activityCategory: z.string().optional().nullable(),
  costObjectivePolicy: z.string().optional().nullable(),
  inventoryWipPolicy: z.string().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  chargePhase: z.enum(['10', '20', '30', '40', '50', '60', '70', '80', '90']).optional().nullable(),
  allowProject: z.boolean().optional(),
  requireProject: z.boolean().optional(),
  allowClin: z.boolean().optional(),
  requireClin: z.boolean().optional(),
  maxHoursPerDay: z.string().optional(),
  active: z.boolean().optional(),
});

type ChargeCodeFormValues = z.infer<typeof chargeCodeFormSchema>;
type ChargeCodeType = ChargeCodeFormValues['type'];

type IndirectCostPool = {
  id: number;
  code: string;
  name: string;
  poolType: string;
  allocationBaseId: number;
  isActive: boolean;
};

type AllocationBase = {
  id: number;
  code: string;
  name: string;
};

type EmployeeOption = {
  id: number;
  employeeCode?: string | null;
  name: string;
  department?: string | null;
  jobTitle?: string | null;
  isActive?: boolean | null;
};

type ChargeCodeAssignments = {
  chargeCodeId: number;
  scope: 'ALL_EMPLOYEES' | 'SELECTED_EMPLOYEES';
  employeeIds: number[];
  defaultEmployeeIds: number[];
  assignedEmployees: EmployeeOption[];
};

type ChargeCodeRequest = {
  id: string;
  wadId: string | null;
  projectId?: string | null;
  workOrderNumber?: string | null;
  department: string;
  operation: string;
  laborCategory?: string | null;
  classification: string;
  budgetedHours?: string | null;
  requestedByDisplayName: string;
  requestedAt: string;
  status: 'PENDING' | 'ASSIGNED' | string;
  assignedChargeCodeId?: number | null;
  assignedChargeCode?: string | null;
};

const PRODUCTION_LINE_OPTIONS = [
  { value: 'P1', label: 'P1 - Production Line 1' },
  { value: 'P2', label: 'P2 - Production Line 2' },
  { value: 'P3', label: 'P3 - Production Line 3' },
  { value: 'P4', label: 'P4 - Production Line 4' },
  { value: 'GENERAL', label: 'General' },
  { value: 'R_AND_D', label: 'R&D' },
];

const CHARGE_PHASE_OPTIONS = [
  { value: '10', label: '10 Proposal' },
  { value: '20', label: '20 Engineering' },
  { value: '30', label: '30 Prototype' },
  { value: '40', label: '40 Tooling' },
  { value: '50', label: '50 Qualification' },
  { value: '60', label: '60 Preproduction' },
  { value: '70', label: '70 Production' },
  { value: '80', label: '80 Warranty' },
  { value: '90', label: '90 Closeout' },
];

const NO_PROJECT_VALUE = '__none__';
const NO_CHARGE_PHASE_VALUE = '__none__';

type ProjectOption = {
  id: string;
  projectCode?: string | null;
  projectName?: string | null;
  description?: string | null;
  customer?: { name?: string | null } | null;
};

function chargeCodeRequestSlug(value?: string | null): string {
  const slug = (value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'WAD';
}

function defaultValues(
  code?: ChargeCode,
  mode: 'create' | 'edit' | 'copy' = 'create',
  request?: ChargeCodeRequest | null
): ChargeCodeFormValues {
  const isCopy = mode === 'copy';
  const requestType =
    request?.classification === 'INDIRECT'
      ? 'OVERHEAD'
      : request?.classification === 'UNALLOWABLE'
        ? 'G_AND_A'
        : 'DIRECT';
  const requestHandling =
    request?.classification === 'INDIRECT'
      ? 'OVERHEAD'
      : request?.classification === 'UNALLOWABLE'
        ? 'UNALLOWABLE'
        : 'DIRECT_CONTRACT';
  const suggestedRequestCode = request
    ? [
        'P2',
        chargeCodeRequestSlug(request.department),
        chargeCodeRequestSlug(request.operation),
      ].join('-').slice(0, 64)
    : '';
  return {
    code: code?.code ?? suggestedRequestCode,
    description: isCopy
      ? `${code?.description?.trim() || code?.code || 'Charge code'} - Copy`
      : (code?.description
        ?? (request
          ? `${request.workOrderNumber ?? 'WAD'} ${request.department} ${request.operation} labor charge code`
          : '')),
    type: (code?.type as ChargeCodeType) ?? requestType,
    costHandling:
      (code?.costHandling as ChargeCodeFormValues['costHandling']) ??
      requestHandling,
    department: code?.department ?? request?.department ?? '',
    productionLine: (code as any)?.productionLine ?? (request ? 'P2' : 'P1'),
    activityCategory: (code as any)?.activityCategory ?? request?.laborCategory ?? request?.operation ?? '',
    costObjectivePolicy: (code as any)?.costObjectivePolicy ?? (request ? 'PROJECT_REQUIRED' : 'NONE'),
    inventoryWipPolicy: (code as any)?.inventoryWipPolicy ?? '',
    projectId: (code as any)?.projectId ?? request?.projectId ?? null,
    chargePhase: (code as any)?.chargePhase ?? null,
    allowProject: (code as any)?.allowProject ?? !!request,
    requireProject: (code as any)?.requireProject ?? !!request,
    allowClin: (code as any)?.allowClin ?? false,
    requireClin: (code as any)?.requireClin ?? false,
    contractReference: code?.contractReference ?? '',
    billable: code?.billable ?? true,
    requiresApproval: code?.requiresApproval ?? false,
    maxHoursPerDay:
      code?.maxHoursPerDay != null ? String(code.maxHoursPerDay) : '',
    active: code?.active ?? true,
  };
}

function ChargeCodeForm({
  editTarget,
  copySource,
  requestToAssign,
  existingChargeCodes,
  onClose,
}: {
  editTarget: ChargeCode | null;
  copySource: ChargeCode | null;
  requestToAssign?: ChargeCodeRequest | null;
  existingChargeCodes: ChargeCode[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = editTarget !== null;
  const isCopy = copySource !== null;
  const [assignmentScope, setAssignmentScope] = useState<
    'ALL_EMPLOYEES' | 'SELECTED_EMPLOYEES'
  >('ALL_EMPLOYEES');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [defaultEmployeeIds, setDefaultEmployeeIds] = useState<number[]>([]);

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
    enabled: true,
  });

  const { data: projects = [], isLoading: projectsLoading } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
    queryFn: () => apiRequest('/api/projects'),
  });

  const { data: assignments, isLoading: assignmentsLoading } =
    useQuery<ChargeCodeAssignments>({
      queryKey: [
        '/api/charge-codes',
        editTarget?.id ?? copySource?.id,
        'assignments',
      ],
      queryFn: () =>
        apiRequest(
          `/api/charge-codes/${(editTarget ?? copySource)!.id}/assignments`
        ),
      enabled: isEdit || isCopy,
    });

  useEffect(() => {
    if (!assignments) return;
    setAssignmentScope(assignments.scope);
    setSelectedEmployeeIds(assignments.employeeIds);
    setDefaultEmployeeIds(assignments.defaultEmployeeIds ?? []);
  }, [assignments]);

  const form = useForm<ChargeCodeFormValues>({
    resolver: zodResolver(chargeCodeFormSchema),
    defaultValues: defaultValues(
      editTarget ?? copySource ?? undefined,
      isEdit ? 'edit' : isCopy ? 'copy' : 'create',
      requestToAssign
    ),
  });

  async function saveAssignments(chargeCodeId: number) {
    return apiRequest(`/api/charge-codes/${chargeCodeId}/assignments`, {
      method: 'PUT',
      body: {
        scope: assignmentScope,
        employeeIds:
          assignmentScope === 'ALL_EMPLOYEES' ? [] : selectedEmployeeIds,
        defaultEmployeeIds:
          assignmentScope === 'ALL_EMPLOYEES' ? [] : defaultEmployeeIds,
      },
    });
  }

  const createMutation = useMutation({
    mutationFn: async (data: object) => {
      let created: ChargeCode | undefined;
      let usedExistingChargeCode = false;
      try {
        created = await apiRequest('/api/charge-codes', {
          method: 'POST',
          body: data,
        });
      } catch (err: any) {
        const existingChargeCode = err?.responseData?.existingChargeCode as ChargeCode | undefined;
        if (requestToAssign?.id && existingChargeCode?.id) {
          created = existingChargeCode;
          usedExistingChargeCode = true;
        } else {
          throw err;
        }
      }
      if (!created) {
        throw new Error('Charge code was not created.');
      }
      if (!usedExistingChargeCode && assignmentScope === 'SELECTED_EMPLOYEES') {
        await saveAssignments(created.id);
      }
      if (requestToAssign?.id) {
        await apiRequest(`/api/charge-codes/requests/${requestToAssign.id}/assign`, {
          method: 'PATCH',
          body: { chargeCodeId: created.id },
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/task-items'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/timekeeping/charge-codes'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/timekeeping/kiosk/charge-codes'],
      });
      toast({
        title: requestToAssign?.id
          ? 'Charge code created and assigned to WAD'
          : 'Charge code created successfully',
      });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to create charge code',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: object) => {
      const updated = await apiRequest(`/api/charge-codes/${editTarget!.id}`, {
        method: 'PATCH',
        body: data,
      });
      await saveAssignments(editTarget!.id);
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/charge-codes', editTarget?.id, 'assignments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/timekeeping/charge-codes'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/timekeeping/kiosk/charge-codes'],
      });
      toast({ title: 'Charge code updated successfully' });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to update charge code',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: () => saveAssignments(editTarget!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/charge-codes', editTarget?.id, 'assignments'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/timekeeping/charge-codes'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/timekeeping/kiosk/charge-codes'],
      });
      toast({ title: 'Charge code assignments updated' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to update assignments',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const activeEmployees = employees
    .filter((employee) => employee.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name));

  function toggleEmployee(employeeId: number) {
    setSelectedEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId].sort((a, b) => a - b)
    );
    setDefaultEmployeeIds((current) => current.filter((id) => id !== employeeId));
  }

  function toggleDefaultEmployee(employeeId: number) {
    if (!selectedEmployeeIds.includes(employeeId)) return;
    setDefaultEmployeeIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId].sort((a, b) => a - b)
    );
  }

  function onSubmit(values: ChargeCodeFormValues) {
    const normalizedCode = values.code.trim().toLowerCase();
    const duplicate = existingChargeCodes.find((chargeCode) => {
      if (isEdit && chargeCode.id === editTarget.id) return false;
      return chargeCode.code.trim().toLowerCase() === normalizedCode;
    });

    if (duplicate) {
      form.setError('code', {
        type: 'manual',
        message: `Charge code "${values.code}" already exists.`,
      });
      toast({
        title: 'Duplicate charge code',
        description: 'Change the code before saving this copy.',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      code: values.code.trim(),
      description: values.description || null,
      type: values.type,
      costHandling: values.costHandling,
      productionLine: values.productionLine.trim().toUpperCase(),
      activityCategory: values.activityCategory || null,
      costObjectivePolicy: values.costObjectivePolicy || null,
      inventoryWipPolicy: values.inventoryWipPolicy || null,
      projectId: values.projectId || null,
      chargePhase: values.chargePhase || null,
      allowProject: values.allowProject,
      requireProject: values.requireProject,
      allowClin: values.allowClin,
      requireClin: values.requireClin,
      department: values.department || null,
      contractReference: values.contractReference || null,
      billable: values.billable,
      requiresApproval: values.requiresApproval,
      maxHoursPerDay: values.maxHoursPerDay
        ? parseFloat(values.maxHoursPerDay)
        : null,
      active: values.active,
    };

    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex max-h-[calc(90vh-5rem)] flex-col"
      >
        <div className="space-y-4 overflow-y-auto px-1 pb-4">
          {requestToAssign && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              Creating for {requestToAssign.workOrderNumber ?? 'WAD'} - {requestToAssign.operation}. Saving will assign the new code to this WAD request.
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. DIR-001" {...field} />
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
                  <FormLabel>Type *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DIRECT">Direct</SelectItem>
                      <SelectItem value="OVERHEAD">Overhead</SelectItem>
                      <SelectItem value="G_AND_A">G&A</SelectItem>
                      <SelectItem value="IR_AND_D">IR&amp;D</SelectItem>
                      <SelectItem value="B_AND_P">B&amp;P</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="costHandling"
            render={({ field }) => (
              <FormItem>
                <FormLabel>DCAA Handling *</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="DIRECT_CONTRACT">
                      Direct Contract
                    </SelectItem>
                    <SelectItem value="IRAD">IR&amp;D</SelectItem>
                    <SelectItem value="BID_PROPOSAL">B&amp;P</SelectItem>
                    <SelectItem value="FRINGE">Fringe</SelectItem>
                    <SelectItem value="OVERHEAD">Overhead</SelectItem>
                    <SelectItem value="G_AND_A">G&amp;A</SelectItem>
                    <SelectItem value="UNALLOWABLE">Unallowable</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="productionLine"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Production Line *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select line" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PRODUCTION_LINE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="activityCategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Activity Category</FormLabel>
                  <FormControl>
                    <Input placeholder="Layup, QC, Cleanup, CSR" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select
                    value={field.value ?? NO_PROJECT_VALUE}
                    onValueChange={(value) =>
                      field.onChange(value === NO_PROJECT_VALUE ? null : value)
                    }
                    disabled={projectsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={projectsLoading ? 'Loading projects' : 'Optional project'}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PROJECT_VALUE}>No project</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.projectCode ?? project.id} - {project.projectName ?? project.description ?? project.customer?.name ?? 'Unnamed project'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="chargePhase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Charge Phase</FormLabel>
                  <Select
                    value={field.value ?? NO_CHARGE_PHASE_VALUE}
                    onValueChange={(value) =>
                      field.onChange(value === NO_CHARGE_PHASE_VALUE ? null : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Optional phase" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_CHARGE_PHASE_VALUE}>No phase</SelectItem>
                      {CHARGE_PHASE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
            <FormField
              control={form.control}
              name="allowProject"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Allow Project</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requireProject"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Require Project</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="allowClin"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Allow CLIN</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="requireClin"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Require CLIN</FormLabel>
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
                    placeholder="Brief description of this charge code"
                    rows={2}
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="department"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Department</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Engineering"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contractReference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contract Reference</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. FA8650-22-C-1234"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="maxHoursPerDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Hours / Day</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    placeholder="Leave blank for no limit"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-wrap gap-6">
            <FormField
              control={form.control}
              name="billable"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="cursor-pointer">
                    Direct Billable
                  </FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="requiresApproval"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="cursor-pointer">
                    Requires Approval
                  </FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Active</FormLabel>
                </FormItem>
              )}
            />
          </div>

          <div className="rounded-md border p-3 space-y-3">
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                {isCopy
                  ? 'Copied access settings will be applied when the new charge code is created.'
                  : 'Access settings will be applied when the charge code is created.'}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium">Employee Access</Label>
                  <p className="text-xs text-muted-foreground">
                    Controls which employees see this code in kiosk and portal
                    time cards.
                  </p>
                </div>
              </div>
              <Badge variant="outline">
                {assignmentScope === 'ALL_EMPLOYEES'
                  ? 'All employees'
                  : `${selectedEmployeeIds.length} selected`}
              </Badge>
            </div>

            <Select
              value={assignmentScope}
              onValueChange={(value) =>
                setAssignmentScope(
                  value as 'ALL_EMPLOYEES' | 'SELECTED_EMPLOYEES'
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL_EMPLOYEES">
                  All employees can use this code
                </SelectItem>
                <SelectItem value="SELECTED_EMPLOYEES">
                  Only selected employees
                </SelectItem>
              </SelectContent>
            </Select>

            {assignmentScope === 'SELECTED_EMPLOYEES' && (
              <div className="max-h-48 overflow-y-auto rounded border">
                {activeEmployees.map((employee) => (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedEmployeeIds.includes(employee.id)}
                      onCheckedChange={() => toggleEmployee(employee.id)}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{employee.name}</span>
                      <span className="text-muted-foreground">
                        {employee.employeeCode
                          ? ` - ${employee.employeeCode}`
                          : ''}
                        {employee.department ? ` - ${employee.department}` : ''}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Checkbox
                          checked={defaultEmployeeIds.includes(employee.id)}
                          disabled={!selectedEmployeeIds.includes(employee.id)}
                          onCheckedChange={(event) => {
                            event?.valueOf();
                            toggleDefaultEmployee(employee.id);
                          }}
                          onClick={(event) => event.stopPropagation()}
                        />
                        Default
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            {isEdit && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => assignmentMutation.mutate()}
                  disabled={
                    assignmentMutation.isPending ||
                    assignmentsLoading ||
                    (assignmentScope === 'SELECTED_EMPLOYEES' &&
                      selectedEmployeeIds.length === 0)
                  }
                >
                  {assignmentMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Access
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t bg-background px-1 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              isPending ||
              assignmentsLoading ||
              (assignmentScope === 'SELECTED_EMPLOYEES' &&
                selectedEmployeeIds.length === 0)
            }
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Charge Code'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

type SortColumn =
  | 'code'
  | 'description'
  | 'productionLine'
  | 'activityCategory'
  | 'type'
  | 'costHandling'
  | 'pool'
  | 'poolType'
  | 'allocationBase'
  | 'department'
  | 'billable'
  | 'active';
type SortDirection = 'asc' | 'desc';

function SortIcon({
  column,
  sortColumn,
  sortDirection,
}: {
  column: SortColumn;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
}) {
  if (sortColumn !== column)
    return (
      <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/60 inline-block" />
    );
  return sortDirection === 'asc' ? (
    <ChevronUp className="ml-1 h-3.5 w-3.5 inline-block" />
  ) : (
    <ChevronDown className="ml-1 h-3.5 w-3.5 inline-block" />
  );
}

function normalizePoolKey(value?: string | null) {
  return (value ?? '')
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function poolCandidates(code: ChargeCode) {
  const candidates = new Set<string>();

  for (const value of [code.type, code.costHandling]) {
    const normalized = normalizePoolKey(value);
    if (
      normalized === 'B_AND_P' ||
      normalized === 'BID_PROPOSAL' ||
      normalized === 'BNP'
    ) {
      candidates.add('B_AND_P');
      candidates.add('BID_PROPOSAL');
      candidates.add('BNP');
    } else if (
      normalized === 'IR_AND_D' ||
      normalized === 'IRAD' ||
      normalized === 'IRD'
    ) {
      candidates.add('IR_AND_D');
      candidates.add('IRAD');
      candidates.add('IRD');
    } else if (normalized === 'G_AND_A' || normalized === 'GA') {
      candidates.add('G_AND_A');
      candidates.add('GA');
    } else if (normalized) {
      candidates.add(normalized);
    }
  }

  return candidates;
}

function fallbackPoolContext(candidates: Set<string>) {
  if (
    candidates.has('B_AND_P') ||
    candidates.has('BID_PROPOSAL') ||
    candidates.has('BNP')
  ) {
    return { pool: 'B&P Pool', poolType: 'B&P', allocationBase: '-' };
  }
  if (
    candidates.has('IR_AND_D') ||
    candidates.has('IRAD') ||
    candidates.has('IRD')
  ) {
    return { pool: 'IR&D Pool', poolType: 'IR&D', allocationBase: '-' };
  }
  if (candidates.has('FRINGE')) {
    return { pool: 'Fringe Pool', poolType: 'Fringe', allocationBase: '-' };
  }
  if (candidates.has('OVERHEAD')) {
    return { pool: 'Overhead Pool', poolType: 'Overhead', allocationBase: '-' };
  }
  if (candidates.has('G_AND_A') || candidates.has('GA')) {
    return { pool: 'G&A Pool', poolType: 'G&A', allocationBase: '-' };
  }
  return { pool: '-', poolType: '-', allocationBase: '-' };
}

function resolvePoolContext(
  code: ChargeCode,
  pools: IndirectCostPool[],
  bases: AllocationBase[]
) {
  const candidates = poolCandidates(code);
  const pool = pools.find((p) => {
    const values = [p.code, p.name, p.poolType].map(normalizePoolKey);
    return values.some((value) => candidates.has(value));
  });

  if (!pool) {
    return fallbackPoolContext(candidates);
  }

  const base = bases.find((b) => b.id === pool.allocationBaseId);
  return {
    pool: `${pool.code} - ${pool.name}`,
    poolType: pool.poolType,
    allocationBase: base?.code ?? '-',
  };
}

export default function ChargeCodeManagerPage() {
  const { toast } = useToast();
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChargeCode | null>(null);
  const [copySource, setCopySource] = useState<ChargeCode | null>(null);
  const [requestToAssign, setRequestToAssign] = useState<ChargeCodeRequest | null>(null);
  const [handledRequestId, setHandledRequestId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [requestAssignments, setRequestAssignments] = useState<Record<string, string>>({});

  const { data: chargeCodes, isLoading } = useQuery<ChargeCode[]>({
    queryKey: ['/api/charge-codes'],
  });
  const { data: chargeCodeRequests = [] } = useQuery<ChargeCodeRequest[]>({
    queryKey: ['/api/charge-codes/requests'],
    queryFn: () => apiRequest('/api/charge-codes/requests?status=PENDING'),
  });
  const { data: pools = [] } = useQuery<IndirectCostPool[]>({
    queryKey: ['/api/burden-rates/pools'],
  });
  const { data: bases = [] } = useQuery<AllocationBase[]>({
    queryKey: ['/api/burden-rates/bases'],
  });

  const chargeCodeRequestIdFromLink = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('wadChargeCodeRequestId');
  }, []);

  const shouldAutofillFromLink = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autofill') === '1';
  }, []);

  useEffect(() => {
    if (!chargeCodeRequestIdFromLink || handledRequestId === chargeCodeRequestIdFromLink) return;
    const linkedRequest = chargeCodeRequests.find((request) => request.id === chargeCodeRequestIdFromLink);
    if (!linkedRequest) return;

    setHandledRequestId(chargeCodeRequestIdFromLink);
    window.setTimeout(() => {
      document
        .getElementById(`charge-code-request-${chargeCodeRequestIdFromLink}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    if (shouldAutofillFromLink) {
      setEditTarget(null);
      setCopySource(null);
      setRequestToAssign(linkedRequest);
      setDialogOpen(true);
    }
  }, [chargeCodeRequests, chargeCodeRequestIdFromLink, handledRequestId, shouldAutofillFromLink]);

  function handleSort(column: SortColumn) {
    if (sortColumn === column) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  const displayed = useMemo(() => {
    let list = (chargeCodes ?? []).filter((c) => showInactive || c.active);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          (c.description ?? '').toLowerCase().includes(q) ||
          ((c as any).productionLine ?? '').toLowerCase().includes(q) ||
          ((c as any).activityCategory ?? '').toLowerCase().includes(q) ||
          (c.costHandling ?? '').toLowerCase().includes(q) ||
          resolvePoolContext(c, pools, bases).pool.toLowerCase().includes(q) ||
          (c.department ?? '').toLowerCase().includes(q)
      );
    }

    if (sortColumn) {
      list = [...list].sort((a, b) => {
        let aVal: string | boolean = '';
        let bVal: string | boolean = '';
        if (sortColumn === 'billable' || sortColumn === 'active') {
          aVal = a[sortColumn];
          bVal = b[sortColumn];
          const cmp = aVal === bVal ? 0 : aVal ? -1 : 1;
          return sortDirection === 'asc' ? cmp : -cmp;
        } else if (
          sortColumn === 'pool' ||
          sortColumn === 'poolType' ||
          sortColumn === 'allocationBase'
        ) {
          const aPool = resolvePoolContext(a, pools, bases);
          const bPool = resolvePoolContext(b, pools, bases);
          aVal = aPool[sortColumn];
          bVal = bPool[sortColumn];
          const cmp =
            aVal.toLowerCase() < bVal.toLowerCase()
              ? -1
              : aVal.toLowerCase() > bVal.toLowerCase()
                ? 1
                : 0;
          return sortDirection === 'asc' ? cmp : -cmp;
        } else {
          aVal = (a[sortColumn] ?? '').toString().toLowerCase();
          bVal = (b[sortColumn] ?? '').toString().toLowerCase();
          const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sortDirection === 'asc' ? cmp : -cmp;
        }
      });
    }

    return list;
  }, [
    chargeCodes,
    showInactive,
    searchQuery,
    sortColumn,
    sortDirection,
    pools,
    bases,
  ]);

  function openCreate() {
    setEditTarget(null);
    setCopySource(null);
    setRequestToAssign(null);
    setDialogOpen(true);
  }

  function openEdit(code: ChargeCode) {
    setEditTarget(code);
    setCopySource(null);
    setRequestToAssign(null);
    setDialogOpen(true);
  }

  function openCopy(code: ChargeCode) {
    setEditTarget(null);
    setCopySource(code);
    setRequestToAssign(null);
    setDialogOpen(true);
  }

  function openCreateForRequest(request: ChargeCodeRequest) {
    setEditTarget(null);
    setCopySource(null);
    setRequestToAssign(request);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
    setCopySource(null);
    setRequestToAssign(null);
  }

  const assignRequestMutation = useMutation({
    mutationFn: ({ requestId, chargeCodeId }: { requestId: string; chargeCodeId: number }) =>
      apiRequest(`/api/charge-codes/requests/${requestId}/assign`, {
        method: 'PATCH',
        body: { chargeCodeId },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes/requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/task-items'] });
      toast({ title: 'Charge code request assigned' });
    },
    onError: (err: Error) => {
      toast({
        title: 'Failed to assign request',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const activeChargeCodes = (chargeCodes ?? []).filter((code) => code.active);

  function assignRequest(request: ChargeCodeRequest) {
    const selected = Number(requestAssignments[request.id]);
    if (!Number.isInteger(selected) || selected <= 0) {
      toast({
        title: 'Select a charge code',
        description: 'Choose the charge code that should satisfy this WAD request.',
        variant: 'destructive',
      });
      return;
    }
    assignRequestMutation.mutate({ requestId: request.id, chargeCodeId: selected });
  }

  const typeLabel: Record<string, string> = {
    DIRECT: 'Direct',
    OVERHEAD: 'Overhead',
    G_AND_A: 'G&A',
    IR_AND_D: 'IR&D',
    B_AND_P: 'B&P',
  };
  const handlingLabel: Record<string, string> = {
    DIRECT_CONTRACT: 'Direct Contract',
    IRAD: 'IR&D',
    BID_PROPOSAL: 'B&P',
    FRINGE: 'Fringe',
    OVERHEAD: 'Overhead',
    G_AND_A: 'G&A',
    UNALLOWABLE: 'Unallowable',
    OTHER: 'Other',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Charge Codes</h1>
            <p className="text-sm text-muted-foreground">
              Manage the charge code registry used for labor cost allocation and
              DCAA compliance.
            </p>
          </div>
        </div>

        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Charge Code
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by code, description, or department…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="show-inactive"
            checked={showInactive}
            onCheckedChange={setShowInactive}
          />
          <Label htmlFor="show-inactive" className="cursor-pointer text-sm">
            Show inactive codes
          </Label>
        </div>
      </div>

      {chargeCodeRequests.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Charge Code Requests</h2>
            <Badge variant="secondary">{chargeCodeRequests.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {chargeCodeRequests.map((request) => (
              <div
                key={request.id}
                id={`charge-code-request-${request.id}`}
                className={`rounded-md border p-4 space-y-3 ${
                  request.id === chargeCodeRequestIdFromLink
                    ? 'border-blue-500 bg-blue-50'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {request.workOrderNumber ?? 'WAD'} - {request.operation}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.department} - {request.classification}
                      {request.budgetedHours ? ` - ${request.budgetedHours} hrs` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">Pending</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Requested by {request.requestedByDisplayName}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={requestAssignments[request.id] ?? ''}
                    onValueChange={(value) =>
                      setRequestAssignments((prev) => ({ ...prev, [request.id]: value }))
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Assign charge code" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeChargeCodes.map((code) => (
                        <SelectItem key={code.id} value={String(code.id)}>
                          {code.code} - {code.description ?? code.department ?? 'No description'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => assignRequest(request)}
                    disabled={assignRequestMutation.isPending}
                    className="sm:w-auto"
                  >
                    {assignRequestMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Assign
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openCreateForRequest(request)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create & Assign
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {(
                [
                  { key: 'code', label: 'Code' },
                  { key: 'description', label: 'Description' },
                  { key: 'productionLine', label: 'Line' },
                  { key: 'activityCategory', label: 'Activity' },
                  { key: 'type', label: 'Type' },
                  { key: 'costHandling', label: 'DCAA Handling' },
                  { key: 'pool', label: 'Pool' },
                  { key: 'poolType', label: 'Pool Type' },
                  { key: 'allocationBase', label: 'Pool Base' },
                  { key: 'department', label: 'Department' },
                  { key: 'billable', label: 'Direct Billable' },
                  { key: 'active', label: 'Active' },
                ] as { key: SortColumn; label: string }[]
              ).map(({ key, label }) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon
                    column={key}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                  />
                </TableHead>
              ))}
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 13 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : displayed.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={13}
                  className="text-center text-muted-foreground py-10"
                >
                  {chargeCodes?.length === 0
                    ? 'No charge codes found. Create one to get started.'
                    : searchQuery.trim()
                      ? 'No charge codes match your search.'
                      : 'No active charge codes. Enable "Show inactive" to see all.'}
                </TableCell>
              </TableRow>
            ) : (
              displayed.map((rawCode) => {
                const code = {
                  ...rawCode,
                  activityCategory:
                    (rawCode as any).activityCategory || '-',
                } as ChargeCode;
                const poolContext = resolvePoolContext(code, pools, bases);
                return (
                  <TableRow
                    key={code.id}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                      !code.active ? 'opacity-50' : ''
                    }`}
                    onClick={() => openEdit(code)}
                  >
                    <TableCell className="font-mono font-medium">
                      {code.code}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {code.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {(code as any).productionLine ?? '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(code as any).activityCategory ?? 'â€”'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {typeLabel[code.type] ?? code.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {handlingLabel[code.costHandling] ??
                          code.costHandling ??
                          'Direct Contract'}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-sm max-w-[220px] truncate"
                      title={poolContext.pool}
                    >
                      {poolContext.pool}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{poolContext.poolType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {poolContext.allocationBase}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {code.department ?? '—'}
                    </TableCell>
                    <TableCell>
                      {code.billable ? (
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {code.active ? (
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Copy charge code ${code.code}`}
                          title="Copy charge code"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCopy(code);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Edit charge code ${code.code}`}
                          title="Edit charge code"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(code);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-2">
            <DialogTitle>
              {editTarget
                ? `Edit: ${editTarget.code}`
                : copySource
                  ? `Copy: ${copySource.code}`
                  : requestToAssign
                    ? 'Create WAD Charge Code'
                    : 'Add Charge Code'}
            </DialogTitle>
          </DialogHeader>
          {dialogOpen && (
            <ChargeCodeForm
              editTarget={editTarget}
              copySource={copySource}
              requestToAssign={requestToAssign}
              existingChargeCodes={chargeCodes ?? []}
              onClose={closeDialog}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

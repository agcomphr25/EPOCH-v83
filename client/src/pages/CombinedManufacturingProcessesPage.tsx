import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Factory,
  Plus,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

type ProcessOutput = {
  id: string;
  inventoryItemId: number;
  partNumber: string;
  partName: string;
  quantityPerRun: number | string;
  isPrimary: boolean;
};

type CombinedProcess = {
  id: string;
  processCode: string;
  name: string;
  description: string | null;
  revision: number;
  status: 'DRAFT' | 'APPROVED' | 'RETIRED';
  leadDepartmentName: string;
  leadDepartmentCode: string | null;
  minimumRuns: number;
  maximumRuns: number | null;
  setupMinutes: number;
  cycleMinutesPerRun: number;
  allowExcessOutput: boolean;
  outputs: ProcessOutput[];
};

type InventoryItem = {
  id: number | string;
  agPartNumber: string;
  name: string;
  type?: string;
  itemType?: string;
  isActive?: boolean;
};

type Department = {
  id: number;
  name: string;
  departmentCode?: string | null;
  isActive?: boolean;
  productionEnabled?: boolean;
  schedulingEnabled?: boolean;
  sortOrder?: number;
};

type OutputDraft = {
  key: number;
  inventoryItemId: string;
  quantityPerRun: string;
  isPrimary: boolean;
};

const readsEnabled =
  import.meta.env.VITE_COMBINED_MANUFACTURING_PROCESS_READS_ENABLED === 'true';
const writesEnabled =
  import.meta.env.VITE_COMBINED_MANUFACTURING_PROCESS_WRITES_ENABLED === 'true';

let outputKey = 2;
const initialOutputs = (): OutputDraft[] => [
  { key: 0, inventoryItemId: '', quantityPerRun: '1', isPrimary: true },
  { key: 1, inventoryItemId: '', quantityPerRun: '1', isPrimary: false },
];

export default function CombinedManufacturingProcessesPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canView = can('manufacturing.combined_processes.view');
  const canManage = can('manufacturing.combined_processes.manage');
  const canApprove = can('manufacturing.combined_processes.approve');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processCode, setProcessCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadDepartmentId, setLeadDepartmentId] = useState('');
  const [minimumRuns, setMinimumRuns] = useState('1');
  const [maximumRuns, setMaximumRuns] = useState('');
  const [setupMinutes, setSetupMinutes] = useState('0');
  const [cycleMinutesPerRun, setCycleMinutesPerRun] = useState('0');
  const [allowExcessOutput, setAllowExcessOutput] = useState(false);
  const [outputs, setOutputs] = useState<OutputDraft[]>(initialOutputs);
  const [openOutputPickerKey, setOpenOutputPickerKey] = useState<number | null>(
    null
  );

  const { data: processResponse, isLoading: processesLoading } = useQuery<{
    processes: CombinedProcess[];
  }>({
    queryKey: ['/api/manufacturing/combined-processes'],
    queryFn: () => apiRequest('/api/manufacturing/combined-processes'),
    enabled: readsEnabled && canView,
  });
  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ['/api/enhanced/inventory/items', 'combined-process-outputs'],
    queryFn: () => apiRequest('/api/enhanced/inventory/items'),
    enabled: dialogOpen,
  });
  const { data: departments = [], isLoading: departmentsLoading } = useQuery<
    Department[]
  >({
    queryKey: ['/api/inventory/departments', 'combined-processes'],
    queryFn: () => apiRequest('/api/inventory/departments'),
    enabled: dialogOpen,
  });

  const manufacturedItems = useMemo(
    () =>
      inventoryItems
        .filter(
          (item) =>
            item.isActive !== false &&
            (item.itemType === 'MANUFACTURED' || item.type === 'MANUFACTURED')
        )
        .sort((left, right) =>
          left.agPartNumber.localeCompare(right.agPartNumber)
        ),
    [inventoryItems]
  );
  const schedulableDepartments = useMemo(
    () =>
      departments
        .filter(
          (department) =>
            department.isActive !== false &&
            department.productionEnabled !== false &&
            department.schedulingEnabled !== false
        )
        .sort(
          (left, right) =>
            (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
            left.name.localeCompare(right.name)
        ),
    [departments]
  );

  const resetForm = () => {
    setProcessCode('');
    setName('');
    setDescription('');
    setLeadDepartmentId('');
    setMinimumRuns('1');
    setMaximumRuns('');
    setSetupMinutes('0');
    setCycleMinutesPerRun('0');
    setAllowExcessOutput(false);
    setOutputs(initialOutputs());
    setOpenOutputPickerKey(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/manufacturing/combined-processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          processCode,
          name,
          description: description || null,
          leadDepartmentId: Number(leadDepartmentId),
          minimumRuns: Number(minimumRuns),
          maximumRuns: maximumRuns ? Number(maximumRuns) : null,
          setupMinutes: Number(setupMinutes),
          cycleMinutesPerRun: Number(cycleMinutesPerRun),
          allowExcessOutput,
          outputs: outputs.map((output) => ({
            inventoryItemId: Number(output.inventoryItemId),
            quantityPerRun: Number(output.quantityPerRun),
            isPrimary: output.isPrimary,
          })),
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/manufacturing/combined-processes'],
      });
      setDialogOpen(false);
      resetForm();
      toast({
        title: 'Combined process created',
        description: 'The new revision is in Draft status.',
      });
    },
    onError: (error: Error) =>
      toast({
        variant: 'destructive',
        title: 'Unable to create process',
        description: error.message,
      }),
  });

  const approveMutation = useMutation({
    mutationFn: (processId: string) =>
      apiRequest(`/api/manufacturing/combined-processes/${processId}/approve`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/manufacturing/combined-processes'],
      });
      toast({
        title: 'Process approved',
        description: 'The definition is now available to planning.',
      });
    },
    onError: (error: Error) =>
      toast({
        variant: 'destructive',
        title: 'Unable to approve process',
        description: error.message,
      }),
  });

  const formValid =
    processCode.trim().length > 0 &&
    name.trim().length > 0 &&
    Number(leadDepartmentId) > 0 &&
    Number(minimumRuns) > 0 &&
    outputs.length >= 2 &&
    outputs.every(
      (output) =>
        Number(output.inventoryItemId) > 0 && Number(output.quantityPerRun) > 0
    ) &&
    new Set(outputs.map((output) => output.inventoryItemId)).size ===
      outputs.length &&
    outputs.filter((output) => output.isPrimary).length === 1 &&
    (!maximumRuns || Number(maximumRuns) >= Number(minimumRuns));

  if (!readsEnabled) {
    return (
      <div className="p-6">
        <Alert>
          <Factory className="h-4 w-4" />
          <AlertTitle>Combined process administration is disabled</AlertTitle>
          <AlertDescription>
            Enable the combined manufacturing process read flag to use this
            page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!permissionsLoading && !canView) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Access required</AlertTitle>
          <AlertDescription>
            You do not have permission to view combined manufacturing processes.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Factory className="h-6 w-6" /> Combined Manufacturing Processes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define controlled production runs that create two or more
            manufactured parts together.
          </p>
        </div>
        {canManage && (
          <Button disabled={!writesEnabled} onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New combined process
          </Button>
        )}
      </div>

      {!writesEnabled && (
        <Alert>
          <AlertTitle>Read-only pilot</AlertTitle>
          <AlertDescription>
            Definitions can be reviewed, but create and approval actions are
            disabled.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Process definitions</CardTitle>
          <CardDescription>
            Approved definitions may be evaluated with a frozen BOM demand
            baseline during planning.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {processesLoading || permissionsLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading combined processes…
            </p>
          ) : (processResponse?.processes ?? []).length === 0 ? (
            <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No combined manufacturing processes have been defined.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Process</TableHead>
                  <TableHead>Lead department</TableHead>
                  <TableHead>Outputs per run</TableHead>
                  <TableHead>Run limits</TableHead>
                  <TableHead>Timing</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(processResponse?.processes ?? []).map((process) => (
                  <TableRow key={process.id}>
                    <TableCell>
                      <div className="font-medium">
                        {process.processCode} · Rev {process.revision}
                      </div>
                      <div className="text-sm">{process.name}</div>
                      <Badge
                        className="mt-1"
                        variant={
                          process.status === 'APPROVED'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {process.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {process.leadDepartmentCode
                        ? `${process.leadDepartmentCode} — `
                        : ''}
                      {process.leadDepartmentName}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {process.outputs.map((output) => (
                          <div key={output.id} className="text-sm">
                            {output.partNumber} × {output.quantityPerRun}
                            {output.isPrimary && (
                              <Badge className="ml-2" variant="outline">
                                Primary
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {process.minimumRuns}–{process.maximumRuns ?? 'No max'}
                      {process.allowExcessOutput && (
                        <div className="text-xs text-muted-foreground">
                          Excess allowed
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {process.setupMinutes} setup +{' '}
                      {process.cycleMinutesPerRun}/run min
                    </TableCell>
                    <TableCell className="text-right">
                      {process.status === 'DRAFT' && canApprove && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!writesEnabled || approveMutation.isPending}
                          onClick={() => approveMutation.mutate(process.id)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New combined manufacturing process</DialogTitle>
            <DialogDescription>
              Create a draft definition. Approval is a separate controlled
              action.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Process code</Label>
              <Input
                value={processCode}
                onChange={(event) => setProcessCode(event.target.value)}
                placeholder="CO-MOLD-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Paired molded parts"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Lead department</Label>
              <Select
                value={leadDepartmentId}
                onValueChange={setLeadDepartmentId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      departmentsLoading
                        ? 'Loading departments…'
                        : 'Select a schedulable production department'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {schedulableDepartments.map((department) => (
                    <SelectItem
                      key={department.id}
                      value={String(department.id)}
                    >
                      {department.departmentCode
                        ? `${department.departmentCode} — `
                        : ''}
                      {department.name}
                    </SelectItem>
                  ))}
                  {!departmentsLoading &&
                    schedulableDepartments.length === 0 && (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        No active production departments found.
                      </div>
                    )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Minimum runs</Label>
              <Input
                type="number"
                min="1"
                value={minimumRuns}
                onChange={(event) => setMinimumRuns(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Maximum runs (optional)</Label>
              <Input
                type="number"
                min="1"
                value={maximumRuns}
                onChange={(event) => setMaximumRuns(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Setup minutes</Label>
              <Input
                type="number"
                min="0"
                value={setupMinutes}
                onChange={(event) => setSetupMinutes(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cycle minutes per run</Label>
              <Input
                type="number"
                min="0"
                value={cycleMinutesPerRun}
                onChange={(event) => setCycleMinutesPerRun(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Manufactured outputs</Label>
                <p className="text-xs text-muted-foreground">
                  Select at least two distinct parts and one primary output.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setOutputs((current) => [
                    ...current,
                    {
                      key: outputKey++,
                      inventoryItemId: '',
                      quantityPerRun: '1',
                      isPrimary: false,
                    },
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" /> Add output
              </Button>
            </div>
            {outputs.map((output, index) => (
              <div
                key={output.key}
                className="grid items-end gap-3 rounded-md border p-3 md:grid-cols-[1fr_10rem_7rem_3rem]"
              >
                <div className="space-y-2">
                  <Label>Part</Label>
                  <Popover
                    open={openOutputPickerKey === output.key}
                    onOpenChange={(open) =>
                      setOpenOutputPickerKey(open ? output.key : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={openOutputPickerKey === output.key}
                        className={cn(
                          'w-full justify-between font-normal',
                          !output.inventoryItemId && 'text-muted-foreground'
                        )}
                      >
                        {output.inventoryItemId
                          ? (() => {
                              const selectedItem = manufacturedItems.find(
                                (item) =>
                                  String(item.id) === output.inventoryItemId
                              );
                              return selectedItem
                                ? `${selectedItem.agPartNumber} — ${selectedItem.name}`
                                : 'Select manufactured part';
                            })()
                          : 'Select manufactured part'}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                      <Command>
                        <CommandInput placeholder="Search part number or name…" />
                        <CommandList>
                          <CommandEmpty>
                            No manufactured parts found.
                          </CommandEmpty>
                          <CommandGroup>
                            {manufacturedItems.map((item) => {
                              const itemId = String(item.id);
                              return (
                                <CommandItem
                                  key={item.id}
                                  value={`${item.agPartNumber} ${item.name}`}
                                  onSelect={() => {
                                    setOutputs((current) =>
                                      current.map((candidate) =>
                                        candidate.key === output.key
                                          ? {
                                              ...candidate,
                                              inventoryItemId: itemId,
                                            }
                                          : candidate
                                      )
                                    );
                                    setOpenOutputPickerKey(null);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      output.inventoryItemId === itemId
                                        ? 'opacity-100'
                                        : 'opacity-0'
                                    )}
                                  />
                                  <span className="font-mono text-sm text-muted-foreground">
                                    {item.agPartNumber}
                                  </span>
                                  <span className="ml-2 truncate">
                                    {item.name}
                                  </span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Qty per run</Label>
                  <Input
                    type="number"
                    min="0.000001"
                    step="any"
                    value={output.quantityPerRun}
                    onChange={(event) =>
                      setOutputs((current) =>
                        current.map((candidate) =>
                          candidate.key === output.key
                            ? {
                                ...candidate,
                                quantityPerRun: event.target.value,
                              }
                            : candidate
                        )
                      )
                    }
                  />
                </div>
                <div className="flex h-10 items-center gap-2">
                  <Checkbox
                    id={`primary-${output.key}`}
                    checked={output.isPrimary}
                    onCheckedChange={() =>
                      setOutputs((current) =>
                        current.map((candidate) => ({
                          ...candidate,
                          isPrimary: candidate.key === output.key,
                        }))
                      )
                    }
                  />
                  <Label htmlFor={`primary-${output.key}`}>Primary</Label>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={outputs.length <= 2}
                  aria-label={`Remove output ${index + 1}`}
                  onClick={() =>
                    setOutputs((current) =>
                      current.filter(
                        (candidate) => candidate.key !== output.key
                      )
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-excess"
              checked={allowExcessOutput}
              onCheckedChange={(checked) =>
                setAllowExcessOutput(checked === true)
              }
            />
            <Label htmlFor="allow-excess">
              Allow the recommended run count to produce excess secondary output
            </Label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!formValid || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? 'Creating…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

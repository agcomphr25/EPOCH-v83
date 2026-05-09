import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tag, Plus, Pencil, Loader2, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { insertChargeCodeSchema, type ChargeCode } from '@shared/schema';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const chargeCodeFormSchema = insertChargeCodeSchema.extend({
  code: z.string().min(1, 'Code is required'),
  type: z.enum(['DIRECT', 'OVERHEAD', 'G_AND_A']),
  costHandling: z.enum(['DIRECT_CONTRACT', 'IRAD', 'BID_PROPOSAL', 'FRINGE', 'OVERHEAD', 'G_AND_A', 'UNALLOWABLE', 'OTHER']),
  maxHoursPerDay: z.string().optional(),
  active: z.boolean().optional(),
});

type ChargeCodeFormValues = z.infer<typeof chargeCodeFormSchema>;

function defaultValues(code?: ChargeCode): ChargeCodeFormValues {
  return {
    code: code?.code ?? '',
    description: code?.description ?? '',
    type: (code?.type as 'DIRECT' | 'OVERHEAD' | 'G_AND_A') ?? 'DIRECT',
    costHandling: (code?.costHandling as ChargeCodeFormValues['costHandling']) ?? 'DIRECT_CONTRACT',
    department: code?.department ?? '',
    contractReference: code?.contractReference ?? '',
    billable: code?.billable ?? true,
    requiresApproval: code?.requiresApproval ?? false,
    maxHoursPerDay: code?.maxHoursPerDay != null ? String(code.maxHoursPerDay) : '',
    active: code?.active ?? true,
  };
}

function ChargeCodeForm({
  editTarget,
  onClose,
}: {
  editTarget: ChargeCode | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = editTarget !== null;

  const form = useForm<ChargeCodeFormValues>({
    resolver: zodResolver(chargeCodeFormSchema),
    defaultValues: defaultValues(editTarget ?? undefined),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest('/api/charge-codes', { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes'] });
      toast({ title: 'Charge code created successfully' });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to create charge code', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest(`/api/charge-codes/${editTarget!.id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charge-codes'] });
      toast({ title: 'Charge code updated successfully' });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update charge code', description: err.message, variant: 'destructive' });
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: ChargeCodeFormValues) {
    const payload = {
      code: values.code,
      description: values.description || null,
      type: values.type,
      costHandling: values.costHandling,
      department: values.department || null,
      contractReference: values.contractReference || null,
      billable: values.billable,
      requiresApproval: values.requiresApproval,
      maxHoursPerDay: values.maxHoursPerDay ? parseFloat(values.maxHoursPerDay) : null,
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                  <SelectItem value="DIRECT_CONTRACT">Direct Contract</SelectItem>
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
                  <Input placeholder="e.g. Engineering" {...field} value={field.value ?? ''} />
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
                  <Input placeholder="e.g. FA8650-22-C-1234" {...field} value={field.value ?? ''} />
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
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="cursor-pointer">Billable</FormLabel>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="requiresApproval"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 space-y-0">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="cursor-pointer">Requires Approval</FormLabel>
              </FormItem>
            )}
          />

          {isEdit && (
            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2 space-y-0">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="cursor-pointer">Active</FormLabel>
                </FormItem>
              )}
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Create Charge Code'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

type SortColumn = 'code' | 'description' | 'type' | 'costHandling' | 'department' | 'billable' | 'active';
type SortDirection = 'asc' | 'desc';

function SortIcon({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn | null; sortDirection: SortDirection }) {
  if (sortColumn !== column) return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/60 inline-block" />;
  return sortDirection === 'asc'
    ? <ChevronUp className="ml-1 h-3.5 w-3.5 inline-block" />
    : <ChevronDown className="ml-1 h-3.5 w-3.5 inline-block" />;
}

export default function ChargeCodeManagerPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChargeCode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: chargeCodes, isLoading } = useQuery<ChargeCode[]>({
    queryKey: ['/api/charge-codes'],
  });

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
          (c.costHandling ?? '').toLowerCase().includes(q) ||
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
          const cmp = (aVal === bVal ? 0 : aVal ? -1 : 1);
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
  }, [chargeCodes, showInactive, searchQuery, sortColumn, sortDirection]);

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(code: ChargeCode) {
    setEditTarget(code);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditTarget(null);
  }

  const typeLabel: Record<string, string> = {
    DIRECT: 'Direct',
    OVERHEAD: 'Overhead',
    G_AND_A: 'G&A',
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
              Manage the charge code registry used for labor cost allocation and DCAA compliance.
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {(
                [
                  { key: 'code', label: 'Code' },
                  { key: 'description', label: 'Description' },
                  { key: 'type', label: 'Type' },
                  { key: 'costHandling', label: 'DCAA Handling' },
                  { key: 'department', label: 'Department' },
                  { key: 'billable', label: 'Billable' },
                  { key: 'active', label: 'Active' },
                ] as { key: SortColumn; label: string }[]
              ).map(({ key, label }) => (
                <TableHead
                  key={key}
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort(key)}
                >
                  {label}
                  <SortIcon column={key} sortColumn={sortColumn} sortDirection={sortDirection} />
                </TableHead>
              ))}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : displayed.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  {chargeCodes?.length === 0
                    ? 'No charge codes found. Create one to get started.'
                    : searchQuery.trim()
                    ? 'No charge codes match your search.'
                    : 'No active charge codes. Enable "Show inactive" to see all.'}
                </TableCell>
              </TableRow>
            ) : (
              displayed.map((code) => (
                <TableRow
                  key={code.id}
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                    !code.active ? 'opacity-50' : ''
                  }`}
                  onClick={() => openEdit(code)}
                >
                  <TableCell className="font-mono font-medium">{code.code}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {code.description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{typeLabel[code.type] ?? code.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {handlingLabel[code.costHandling] ?? code.costHandling ?? 'Direct Contract'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{code.department ?? '—'}</TableCell>
                  <TableCell>
                    {code.billable ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Yes</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {code.active ? (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(code);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? `Edit: ${editTarget.code}` : 'Add Charge Code'}
            </DialogTitle>
          </DialogHeader>
          {dialogOpen && (
            <ChargeCodeForm editTarget={editTarget} onClose={closeDialog} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

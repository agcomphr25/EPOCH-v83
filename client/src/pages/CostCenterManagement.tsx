import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertCostCenterSchema } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Pencil, Trash2, DollarSign } from 'lucide-react';

interface CostCenter {
  id: string;
  code: string;
  name: string;
  type: 'DEPARTMENT' | 'PROJECT' | 'OVERHEAD' | 'ADMINISTRATIVE';
  status: 'ACTIVE' | 'INACTIVE';
  annualBudget: number | null;
  monthlyBudget: number | null;
  managerId: number | null;
  managerName: string | null;
  managerLastName: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
}

const costCenterFormSchema = insertCostCenterSchema.extend({
  annualBudget: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : parseFloat(val as string)),
    z.number().positive().optional().nullable()
  ),
  monthlyBudget: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : parseFloat(val as string)),
    z.number().positive().optional().nullable()
  ),
  managerId: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : parseInt(val as string)),
    z.number().int().optional().nullable()
  ),
  description: z.preprocess(
    (val) => (val === '' || val === undefined || val === null ? null : val),
    z.string().optional().nullable()
  ),
});

type CostCenterFormValues = z.infer<typeof costCenterFormSchema>;

const COST_CENTER_TYPES = [
  { value: 'DEPARTMENT', label: 'Department', color: 'blue' },
  { value: 'PROJECT', label: 'Project', color: 'purple' },
  { value: 'OVERHEAD', label: 'Overhead', color: 'orange' },
  { value: 'ADMINISTRATIVE', label: 'Administrative', color: 'gray' },
] as const;

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', color: 'green' },
  { value: 'INACTIVE', label: 'Inactive', color: 'gray' },
] as const;

export default function CostCenterManagement() {
  const { toast } = useToast();
  const qClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [deletingCostCenter, setDeletingCostCenter] = useState<CostCenter | null>(null);

  const form = useForm<CostCenterFormValues>({
    resolver: zodResolver(costCenterFormSchema),
    defaultValues: {
      code: '',
      name: '',
      type: 'DEPARTMENT',
      status: 'ACTIVE',
      annualBudget: null,
      monthlyBudget: null,
      managerId: null,
      description: null,
    },
  });

  const { data: costCenters = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ['/api/cost-centers'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/cost-centers', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          code: data.code.toUpperCase().trim(),
          name: data.name.trim(),
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
      toast({
        title: 'Cost Center Created',
        description: 'The cost center has been created successfully.',
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Creation Failed',
        description: error.message || 'Failed to create cost center.',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/cost-centers/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...data,
          code: data.code.toUpperCase().trim(),
          name: data.name.trim(),
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
      toast({
        title: 'Cost Center Updated',
        description: 'The cost center has been updated successfully.',
      });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update cost center.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cost-centers/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      qClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
      toast({
        title: 'Cost Center Deleted',
        description: 'The cost center has been deleted successfully.',
      });
      setIsDeleteDialogOpen(false);
      setDeletingCostCenter(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Deletion Failed',
        description: error.message || 'Failed to delete cost center.',
        variant: 'destructive',
      });
    },
  });

  const handleOpenDialog = (costCenter?: CostCenter) => {
    if (costCenter) {
      setEditingCostCenter(costCenter);
      form.reset({
        code: costCenter.code,
        name: costCenter.name,
        type: costCenter.type,
        status: costCenter.status,
        annualBudget: costCenter.annualBudget,
        monthlyBudget: costCenter.monthlyBudget,
        managerId: costCenter.managerId,
        description: costCenter.description,
      });
    } else {
      setEditingCostCenter(null);
      form.reset({
        code: '',
        name: '',
        type: 'DEPARTMENT',
        status: 'ACTIVE',
        annualBudget: null,
        monthlyBudget: null,
        managerId: null,
        description: null,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCostCenter(null);
    form.reset();
  };

  const onSubmit = (data: CostCenterFormValues) => {
    if (editingCostCenter) {
      updateMutation.mutate({ id: editingCostCenter.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (costCenter: CostCenter) => {
    setDeletingCostCenter(costCenter);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingCostCenter) {
      deleteMutation.mutate(deletingCostCenter.id);
    }
  };

  const getTypeBadgeColor = (type: string) => {
    const typeObj = COST_CENTER_TYPES.find(t => t.value === type);
    return typeObj?.color || 'gray';
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-6 w-6" />
                Cost Center Management
              </CardTitle>
              <CardDescription className="mt-2">
                Manage business units, departments, and projects for expense tracking and allocation
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} data-testid="button-add-cost-center">
              <Plus className="h-4 w-4 mr-2" />
              Add Cost Center
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading cost centers...</div>
          ) : costCenters.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No cost centers found. Create your first cost center to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead className="text-right">Annual Budget</TableHead>
                  <TableHead className="text-right">Monthly Budget</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costCenters.map((costCenter) => (
                  <TableRow key={costCenter.id} data-testid={`row-cost-center-${costCenter.code}`}>
                    <TableCell className="font-mono font-semibold">{costCenter.code}</TableCell>
                    <TableCell>{costCenter.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`bg-${getTypeBadgeColor(costCenter.type)}-50 text-${getTypeBadgeColor(costCenter.type)}-700 border-${getTypeBadgeColor(costCenter.type)}-200`}>
                        {COST_CENTER_TYPES.find(t => t.value === costCenter.type)?.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={costCenter.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {costCenter.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {costCenter.managerName && costCenter.managerLastName
                        ? `${costCenter.managerName} ${costCenter.managerLastName}`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(costCenter.annualBudget)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(costCenter.monthlyBudget)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(costCenter)}
                          data-testid={`button-edit-${costCenter.code}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(costCenter)}
                          data-testid={`button-delete-${costCenter.code}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingCostCenter ? 'Edit Cost Center' : 'Create Cost Center'}
            </DialogTitle>
            <DialogDescription>
              {editingCostCenter
                ? 'Update the cost center information below.'
                : 'Add a new cost center to organize expenses.'}
            </DialogDescription>
          </DialogHeader>

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
                        <Input
                          {...field}
                          value={field.value.toUpperCase()}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          placeholder="e.g., LAYUP"
                          maxLength={20}
                          data-testid="input-code"
                        />
                      </FormControl>
                      <FormDescription>Short identifier (max 20 chars)</FormDescription>
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
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {COST_CENTER_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., Layup Department"
                        data-testid="input-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
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
                  name="managerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manager</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-manager">
                            <SelectValue placeholder="Select manager" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {employees.map((emp) => (
                            <SelectItem key={emp.id} value={emp.id.toString()}>
                              {emp.firstName} {emp.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="annualBudget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Annual Budget
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          data-testid="input-annual-budget"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="monthlyBudget"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Monthly Budget
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          data-testid="input-monthly-budget"
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
                        {...field}
                        placeholder="Notes about this cost center..."
                        rows={3}
                        data-testid="textarea-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDialog}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {editingCostCenter ? 'Update' : 'Create'} Cost Center
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cost Center?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete cost center{' '}
              <span className="font-semibold">{deletingCostCenter?.code}</span> -{' '}
              {deletingCostCenter?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

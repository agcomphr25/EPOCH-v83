import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [deletingCostCenter, setDeletingCostCenter] = useState<CostCenter | null>(null);
  
  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('DEPARTMENT');
  const [status, setStatus] = useState<string>('ACTIVE');
  const [annualBudget, setAnnualBudget] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [managerId, setManagerId] = useState<string>('');
  const [description, setDescription] = useState('');

  // Fetch cost centers
  const { data: costCenters = [], isLoading } = useQuery<CostCenter[]>({
    queryKey: ['/api/cost-centers'],
  });

  // Fetch employees for manager dropdown
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/cost-centers', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/cost-centers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
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

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cost-centers/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cost-centers'] });
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
      setCode(costCenter.code);
      setName(costCenter.name);
      setType(costCenter.type);
      setStatus(costCenter.status);
      setAnnualBudget(costCenter.annualBudget?.toString() || '');
      setMonthlyBudget(costCenter.monthlyBudget?.toString() || '');
      setManagerId(costCenter.managerId?.toString() || '');
      setDescription(costCenter.description || '');
    } else {
      setEditingCostCenter(null);
      setCode('');
      setName('');
      setType('DEPARTMENT');
      setStatus('ACTIVE');
      setAnnualBudget('');
      setMonthlyBudget('');
      setManagerId('');
      setDescription('');
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCostCenter(null);
  };

  const handleSubmit = () => {
    const data = {
      code: code.toUpperCase().trim(),
      name: name.trim(),
      type,
      status,
      annualBudget: annualBudget ? parseFloat(annualBudget) : null,
      monthlyBudget: monthlyBudget ? parseFloat(monthlyBudget) : null,
      managerId: managerId ? parseInt(managerId) : null,
      description: description.trim() || null,
    };

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

  const getStatusBadgeColor = (status: string) => {
    return status === 'ACTIVE' ? 'green' : 'gray';
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

      {/* Create/Edit Dialog */}
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

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g., LAYUP"
                  maxLength={20}
                  data-testid="input-code"
                />
                <p className="text-xs text-gray-500 mt-1">Short identifier (max 20 chars)</p>
              </div>
              <div>
                <Label htmlFor="type">Type *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CENTER_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Layup Department"
                data-testid="input-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="manager">Manager</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger data-testid="select-manager">
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="annualBudget" className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Annual Budget
                </Label>
                <Input
                  id="annualBudget"
                  type="number"
                  step="0.01"
                  value={annualBudget}
                  onChange={(e) => setAnnualBudget(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-annual-budget"
                />
              </div>
              <div>
                <Label htmlFor="monthlyBudget" className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Monthly Budget
                </Label>
                <Input
                  id="monthlyBudget"
                  type="number"
                  step="0.01"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-monthly-budget"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes about this cost center..."
                rows={3}
                data-testid="textarea-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!code || !name || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save"
            >
              {editingCostCenter ? 'Update' : 'Create'} Cost Center
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
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

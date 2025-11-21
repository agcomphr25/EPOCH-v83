import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  PlusCircle,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface WatchRule {
  id: number;
  userId: string;
  customerId: string;
  customerName: string;
  departmentId: number | null;
  departmentName: string;
  label: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: number;
  name: string;
}

interface Department {
  id: number;
  name: string;
  displayName: string;
}

export default function WatchRulesPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WatchRule | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });

  const { data: watchRules = [], isLoading: rulesLoading } = useQuery<WatchRule[]>({
    queryKey: [`/api/watch-rules?userId=${currentUser?.username}`],
    enabled: !!currentUser?.username,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/watch-rules/customers/search'],
    enabled: isCreateDialogOpen || !!editingRule,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/watch-rules/departments/list'],
    enabled: isCreateDialogOpen || !!editingRule,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/watch-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watch-rules'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: 'Watch rule created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create watch rule',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/watch-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, userId: currentUser?.username }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watch-rules'] });
      setEditingRule(null);
      resetForm();
      toast({
        title: 'Success',
        description: 'Watch rule updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update watch rule',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/watch-rules/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watch-rules'] });
      toast({
        title: 'Success',
        description: 'Watch rule deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete watch rule',
        variant: 'destructive',
      });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest(`/api/watch-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive, userId: currentUser?.username }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watch-rules'] });
      toast({
        title: 'Success',
        description: 'Watch rule status updated',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update watch rule',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setCustomerId('');
    setCustomerName('');
    setDepartmentName('');
    setDepartmentId(null);
    setLabel('');
    setCustomerSearch('');
  };

  const handleCreate = () => {
    if (!customerId || !departmentName) {
      toast({
        title: 'Error',
        description: 'Please select a customer and department',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      userId: currentUser?.username,
      customerId,
      customerName,
      departmentId,
      departmentName,
      label: label || null,
      isActive: true,
    });
  };

  const handleEdit = (rule: WatchRule) => {
    setEditingRule(rule);
    setCustomerId(rule.customerId);
    setCustomerName(rule.customerName);
    setDepartmentName(rule.departmentName);
    setDepartmentId(rule.departmentId);
    setLabel(rule.label || '');
  };

  const handleUpdate = () => {
    if (!editingRule) return;

    updateMutation.mutate({
      id: editingRule.id,
      data: {
        customerId,
        customerName,
        departmentId,
        departmentName,
        label: label || null,
      },
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this watch rule?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleActive = (id: number, currentStatus: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleCustomerSelect = (value: string) => {
    const customer = customers.find(c => c.id.toString() === value);
    if (customer) {
      setCustomerId(customer.id.toString());
      setCustomerName(customer.name);
    }
  };

  const handleDepartmentSelect = (value: string) => {
    const dept = departments.find(d => d.name === value);
    if (dept) {
      setDepartmentName(dept.name);
      setDepartmentId(dept.id);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  if (!currentUser) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertCircle className="w-5 h-5" />
              <p>Please log in to manage watch rules</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Customer Watch Rules
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Monitor specific customers in specific departments
          </p>
        </div>
        <Button
          onClick={() => setIsCreateDialogOpen(true)}
          className="flex items-center gap-2"
          data-testid="button-create-watch-rule"
        >
          <PlusCircle className="w-4 h-4" />
          New Watch Rule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Watch Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rulesLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : watchRules.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No watch rules configured. Create one to get started!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.customerName}</TableCell>
                    <TableCell>{rule.departmentName}</TableCell>
                    <TableCell>{rule.label || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={() => handleToggleActive(rule.id, rule.isActive)}
                          data-testid={`switch-active-${rule.id}`}
                        />
                        <span className="text-sm">
                          {rule.isActive ? (
                            <span className="text-green-600 flex items-center gap-1">
                              <Eye className="w-4 h-4" />
                              Active
                            </span>
                          ) : (
                            <span className="text-gray-500 flex items-center gap-1">
                              <EyeOff className="w-4 h-4" />
                              Inactive
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(rule.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(rule)}
                          data-testid={`button-edit-${rule.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(rule.id)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-${rule.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
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

      <Dialog
        open={isCreateDialogOpen || !!editingRule}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingRule(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Watch Rule' : 'Create Watch Rule'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <div className="space-y-2">
                <Input
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  data-testid="input-customer-search"
                />
                <Select value={customerId} onValueChange={handleCustomerSelect}>
                  <SelectTrigger data-testid="select-customer">
                    <SelectValue placeholder="Select a customer">
                      {customerName || 'Select a customer'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCustomers.slice(0, 50).map((customer) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.name}
                      </SelectItem>
                    ))}
                    {filteredCustomers.length === 0 && (
                      <SelectItem value="none" disabled>
                        No customers found
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department *</Label>
              <Select value={departmentName} onValueChange={handleDepartmentSelect}>
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="Select a department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.name}>
                      {dept.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Custom Label (Optional)</Label>
              <Input
                id="label"
                placeholder="e.g., VIP Orders, Rush Orders"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                data-testid="input-label"
              />
              <p className="text-xs text-gray-500">
                Give this rule a custom name for easy identification
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingRule(null);
                resetForm();
              }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={editingRule ? handleUpdate : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save"
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingRule
                ? 'Update Rule'
                : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

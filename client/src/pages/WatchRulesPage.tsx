import { useState, useEffect } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  PlusCircle,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  AlertCircle,
  Users,
  User,
  Lock,
  X,
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
  trackedOrderIds: string[] | null;
  visibilityScope: string;
  visibilityEmployeeId: number | null;
  visibilityEmployeeIds: number[] | null;
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

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  employeeCode: string;
}

interface CustomerOrder {
  orderId: string;
  customerId: string;
  currentDepartment: string;
  status: string;
  orderDate: string;
  dueDate: string;
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
  const [trackedOrderIds, setTrackedOrderIds] = useState<string[]>([]);
  const [visibilityScope, setVisibilityScope] = useState<string>('USER_ONLY');
  const [visibilityEmployeeId, setVisibilityEmployeeId] = useState<number | null>(null);
  const [visibilityEmployeeIds, setVisibilityEmployeeIds] = useState<number[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');

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

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/watch-rules/employees/list'],
    enabled: (isCreateDialogOpen || !!editingRule) && (visibilityScope === 'SPECIFIC_EMPLOYEE' || visibilityScope === 'SPECIFIC_EMPLOYEES'),
  });

  const { data: customerOrders = [] } = useQuery<CustomerOrder[]>({
    queryKey: ['/api/watch-rules/customer-orders', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const response = await fetch(`/api/watch-rules/customer-orders/${customerId}`);
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
    enabled: !!customerId && (isCreateDialogOpen || !!editingRule),
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
    setTrackedOrderIds([]);
    setVisibilityScope('USER_ONLY');
    setVisibilityEmployeeId(null);
    setVisibilityEmployeeIds([]);
    setOrderSearch('');
    setEmployeeSearch('');
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
      trackedOrderIds: trackedOrderIds.length > 0 ? trackedOrderIds : [],
      visibilityScope,
      visibilityEmployeeId: null,
      visibilityEmployeeIds: visibilityScope === 'SPECIFIC_EMPLOYEES' ? visibilityEmployeeIds : [],
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
    setTrackedOrderIds(rule.trackedOrderIds || []);
    setVisibilityScope(rule.visibilityScope || 'USER_ONLY');
    setVisibilityEmployeeId(rule.visibilityEmployeeId);
    setVisibilityEmployeeIds(rule.visibilityEmployeeIds || []);
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
        trackedOrderIds: trackedOrderIds.length > 0 ? trackedOrderIds : [],
        visibilityScope,
        visibilityEmployeeId: null,
        visibilityEmployeeIds: visibilityScope === 'SPECIFIC_EMPLOYEES' ? visibilityEmployeeIds : [],
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
      setTrackedOrderIds([]);
    }
  };

  const handleDepartmentSelect = (value: string) => {
    const dept = departments.find(d => d.name === value);
    if (dept) {
      setDepartmentName(dept.name);
      setDepartmentId(dept.id);
    }
  };

  const handleOrderToggle = (orderId: string) => {
    setTrackedOrderIds(prev => 
      prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const removeTrackedOrder = (orderId: string) => {
    setTrackedOrderIds(prev => prev.filter(id => id !== orderId));
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredOrders = customerOrders.filter(o =>
    o.orderId.toLowerCase().includes(orderSearch.toLowerCase()) ||
    o.currentDepartment.toLowerCase().includes(orderSearch.toLowerCase())
  );

  const getVisibilityLabel = (scope: string, employeeIds: number[] | null) => {
    switch (scope) {
      case 'EVERYONE':
        return { icon: Users, label: 'Everyone', color: 'bg-green-100 text-green-800' };
      case 'SPECIFIC_EMPLOYEES':
      case 'SPECIFIC_EMPLOYEE':
        const count = employeeIds?.length || 0;
        return { 
          icon: User, 
          label: count > 0 ? `${count} ${count === 1 ? 'Person' : 'People'}` : 'Specific People', 
          color: 'bg-blue-100 text-blue-800' 
        };
      case 'USER_ONLY':
      default:
        return { icon: Lock, label: 'Only Me', color: 'bg-gray-100 text-gray-800' };
    }
  };

  const handleEmployeeToggle = (empId: number) => {
    setVisibilityEmployeeIds(prev => 
      prev.includes(empId)
        ? prev.filter(id => id !== empId)
        : [...prev, empId]
    );
  };

  const removeEmployee = (empId: number) => {
    setVisibilityEmployeeIds(prev => prev.filter(id => id !== empId));
  };

  const filteredEmployees = employees.filter(e => {
    const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
    return fullName.includes(employeeSearch.toLowerCase());
  });

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
                  <TableHead>Tracked Orders</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {watchRules.map((rule) => {
                  const visibility = getVisibilityLabel(rule.visibilityScope, rule.visibilityEmployeeIds);
                  const VisibilityIcon = visibility.icon;
                  return (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.customerName}</TableCell>
                      <TableCell>{rule.departmentName}</TableCell>
                      <TableCell>{rule.label || '-'}</TableCell>
                      <TableCell>
                        {rule.trackedOrderIds && rule.trackedOrderIds.length > 0 ? (
                          <Badge variant="secondary" className="text-xs">
                            {rule.trackedOrderIds.length} order{rule.trackedOrderIds.length !== 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <span className="text-gray-500 text-sm">All orders</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${visibility.color} flex items-center gap-1 w-fit`}>
                          <VisibilityIcon className="w-3 h-3" />
                          {visibility.label}
                        </Badge>
                      </TableCell>
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
                  );
                })}
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
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? 'Edit Watch Rule' : 'Create Watch Rule'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer">Customer *</Label>
              <Select value={customerId} onValueChange={handleCustomerSelect}>
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder="Select a customer">
                    {customerName || 'Select a customer'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2 sticky top-0 bg-white dark:bg-gray-950 border-b">
                    <Input
                      placeholder="Search customers..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="h-8"
                      data-testid="input-customer-search"
                    />
                  </div>
                  {filteredCustomers.length === 0 ? (
                    <div className="px-2 py-6 text-center text-sm text-gray-500">
                      No customers found
                    </div>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id.toString()}>
                        {customer.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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

            {customerId && (
              <div className="space-y-2">
                <Label>Track Specific Orders (Optional)</Label>
                <p className="text-xs text-gray-500 mb-2">
                  Leave empty to track all orders, or select specific orders to watch
                </p>
                
                {trackedOrderIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {trackedOrderIds.map(orderId => (
                      <Badge 
                        key={orderId} 
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {orderId}
                        <button
                          type="button"
                          onClick={() => removeTrackedOrder(orderId)}
                          className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="border rounded-md">
                  <div className="p-2 border-b">
                    <Input
                      placeholder="Search orders..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="h-8"
                      data-testid="input-order-search"
                    />
                  </div>
                  <ScrollArea className="h-40">
                    <div className="p-2 space-y-1">
                      {filteredOrders.length === 0 ? (
                        <div className="text-center py-4 text-sm text-gray-500">
                          No orders found for this customer
                        </div>
                      ) : (
                        filteredOrders.map((order) => (
                          <label
                            key={order.orderId}
                            className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <Checkbox
                              checked={trackedOrderIds.includes(order.orderId)}
                              onCheckedChange={() => handleOrderToggle(order.orderId)}
                              data-testid={`checkbox-order-${order.orderId}`}
                            />
                            <div className="flex-1 text-sm">
                              <span className="font-medium">{order.orderId}</span>
                              <span className="text-gray-500 ml-2">
                                {order.currentDepartment} • {order.status}
                              </span>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Visibility</Label>
              <p className="text-xs text-gray-500">
                Control who can see this watch rule on their dashboard
              </p>
              <RadioGroup
                value={visibilityScope}
                onValueChange={setVisibilityScope}
                className="space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="USER_ONLY" id="visibility-user" data-testid="radio-visibility-user" />
                  <Label htmlFor="visibility-user" className="flex items-center gap-2 cursor-pointer">
                    <Lock className="w-4 h-4 text-gray-600" />
                    Only Me
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="EVERYONE" id="visibility-everyone" data-testid="radio-visibility-everyone" />
                  <Label htmlFor="visibility-everyone" className="flex items-center gap-2 cursor-pointer">
                    <Users className="w-4 h-4 text-green-600" />
                    Everyone
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="SPECIFIC_EMPLOYEES" id="visibility-specific" data-testid="radio-visibility-specific" />
                  <Label htmlFor="visibility-specific" className="flex items-center gap-2 cursor-pointer">
                    <User className="w-4 h-4 text-blue-600" />
                    Specific People
                  </Label>
                </div>
              </RadioGroup>

              {visibilityScope === 'SPECIFIC_EMPLOYEES' && (
                <div className="mt-2 ml-6 space-y-2">
                  {visibilityEmployeeIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {visibilityEmployeeIds.map(empId => {
                        const emp = employees.find(e => e.id === empId);
                        return (
                          <Badge 
                            key={empId} 
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {emp ? `${emp.firstName} ${emp.lastName}` : `Employee ${empId}`}
                            <button
                              type="button"
                              onClick={() => removeEmployee(empId)}
                              className="ml-1 hover:bg-gray-200 rounded-full p-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  <div className="border rounded-md">
                    <div className="p-2 border-b">
                      <Input
                        placeholder="Search employees..."
                        value={employeeSearch}
                        onChange={(e) => setEmployeeSearch(e.target.value)}
                        className="h-8"
                        data-testid="input-employee-search"
                      />
                    </div>
                    <ScrollArea className="h-40">
                      <div className="p-2 space-y-1">
                        {filteredEmployees.length === 0 ? (
                          <div className="text-center py-4 text-sm text-gray-500">
                            No employees found
                          </div>
                        ) : (
                          filteredEmployees.map((emp) => (
                            <label
                              key={emp.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                            >
                              <Checkbox
                                checked={visibilityEmployeeIds.includes(emp.id)}
                                onCheckedChange={() => handleEmployeeToggle(emp.id)}
                                data-testid={`checkbox-employee-${emp.id}`}
                              />
                              <div className="flex-1 text-sm">
                                <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                                {emp.employeeCode && (
                                  <span className="text-gray-500 ml-2">({emp.employeeCode})</span>
                                )}
                              </div>
                            </label>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              )}
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

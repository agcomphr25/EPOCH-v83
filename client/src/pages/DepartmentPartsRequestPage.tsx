import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from '@/components/ui/textarea';
import { Package, Clock, CheckCircle, XCircle, ShoppingCart, AlertTriangle, Ban, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';

type InventoryItem = {
  id: number;
  agPartNumber: string;
  name: string;
  sku?: string;
  department?: string;

  assignedDepartmentIds?: number[];
  currentBalance?: number;
  minStock?: number;
  maxStock?: number;
  usageUnit?: string;
};

type PartsRequest = {
  id: number;
  agPartNumber: string;
  partNumber: string;
  partName: string;
  requestedBy: string;
  requestedForEmployeeId?: number | null;
  requestedForDisplayName?: string | null;
  department: string;
  departmentId: number;
  quantity: number;
  quantityOrdered?: number;
  quantityReceived?: number;
  urgency: string;
  reason: string;
  status: string;
  requestDate: string;
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;
  rejectionReason?: string;
  cancelReason?: string;
  catalogFixNeeded?: boolean;
  outOfDeptReason?: string;
};

type User = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role?: string;
  department?: string;
  departmentId?: number;
  employeeId?: number | null;
  employeeName?: string | null;
};

type Department = {
  id: number;
  name: string;
};

type EmployeeOption = {
  id: number;
  name: string;
  department?: string | null;
  isActive?: boolean | null;
};

export default function DepartmentPartsRequestPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [showAllParts, setShowAllParts] = useState(false);
  const [requestForm, setRequestForm] = useState({
    quantity: '',
    urgency: 'MEDIUM',
    reason: '',
    outOfDeptReason: '',
    requestedBy: '',
    requestedForEmployeeId: '',
  });
  const requestedByEditedRef = useRef(false);

  const { data: user } = useQuery<User>({
    queryKey: ['/api/auth/session'],
  });

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';

  const defaultRequestor = (() => {
    if (!user) return '';
    const employeeName =
      typeof user.employeeName === 'string' ? user.employeeName.trim() : '';
    if (employeeName) return employeeName;
    const fullName = [user.firstName, user.lastName]
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .join(' ')
      .trim();
    return user.username || fullName || '';
  })();

  // Seed requestedBy from session once it resolves, unless the user has
  // typed in the field. Re-applies on dialog open via handleRequestClick.
  useEffect(() => {
    if (!isRequestDialogOpen) return;
    if (requestedByEditedRef.current) return;
    if (!defaultRequestor) return;
    setRequestForm((prev) =>
      prev.requestedBy ? prev : { ...prev, requestedBy: defaultRequestor }
    );
  }, [isRequestDialogOpen, defaultRequestor]);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/inventory/departments'],
    enabled: isAdmin,
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
  });

  const activeEmployees = employees
    .filter((employee) => employee.isActive !== false)
    .sort((a, b) => a.name.localeCompare(b.name));

  const effectiveDepartment = isAdmin ? selectedDepartment : (user?.department || '');
  const effectiveDepartmentId = isAdmin ? selectedDepartmentId : (user?.departmentId || null);

  const { data: departmentItems = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: [showAllParts && isAdmin && selectedDepartment
      ? '/api/inventory/items/all-for-request'
      : `/api/inventory/items/department/${effectiveDepartment || 'all'}`],
    enabled: isAdmin ? !!selectedDepartment || !showAllParts : !!user?.department,
  });

  const { data: userRequests = [], isLoading: requestsLoading } = useQuery<PartsRequest[]>({
    queryKey: ['/api/inventory/parts-requests/my'],
  });

  const isOutOfDepartment = (item: InventoryItem): boolean => {
    if (!showAllParts || !isAdmin || !selectedDepartmentId) return false;
    const assignedById = item.assignedDepartmentIds?.includes(selectedDepartmentId) ?? false;
    return !assignedById;
  };

  const submitRequestMutation = useMutation({
    mutationFn: async (data: {
      agPartNumber: string;
      partNumber: string;
      partName: string;
      quantity: number;
      urgency: string;
      reason: string | null;
      requestedBy: string;
      department: string;
      departmentId: number | null;
      catalogFixNeeded: boolean;
      outOfDeptReason: string | null;
      requestedForEmployeeId: number | null;
    }) => {
      return apiRequest('/api/inventory/parts-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/inventory/parts-requests/my']
      });
      queryClient.invalidateQueries({
        queryKey: [showAllParts && isAdmin && selectedDepartment
          ? '/api/inventory/items/all-for-request'
          : `/api/inventory/items/department/${effectiveDepartment || 'all'}`]
      });
      toast({
        title: 'Request Submitted',
        description: `Your parts request has been submitted for approval${isAdmin ? ` for ${effectiveDepartment}` : ''}.`,
      });
      setIsRequestDialogOpen(false);
      setSelectedItem(null);
      requestedByEditedRef.current = false;
      setRequestForm({ quantity: '', urgency: 'MEDIUM', reason: '', outOfDeptReason: '', requestedBy: defaultRequestor, requestedForEmployeeId: '' });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to submit parts request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const cancelRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      return apiRequest(`/api/inventory/parts-requests/${requestId}/cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/inventory/parts-requests/my']
      });
      toast({
        title: 'Request Cancelled',
        description: 'Your parts request has been cancelled.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to cancel request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleRequestClick = (item: InventoryItem) => {
    setSelectedItem(item);
    requestedByEditedRef.current = false;
    setRequestForm({
      quantity: '',
      urgency: 'MEDIUM',
      reason: '',
      outOfDeptReason: '',
      requestedBy: defaultRequestor,
      requestedForEmployeeId: '',
    });
    setIsRequestDialogOpen(true);
  };

  const handleSubmitRequest = () => {
    if (!selectedItem || !user || !requestForm.quantity) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    if (!requestForm.requestedBy.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Requested By is required.',
        variant: 'destructive',
      });
      return;
    }

    if (isAdmin && (!effectiveDepartment || !effectiveDepartmentId)) {
      toast({
        title: 'Missing Department',
        description: 'Please select a department to request parts for.',
        variant: 'destructive',
      });
      return;
    }

    const outOfDept = isOutOfDepartment(selectedItem);

    if (outOfDept && !requestForm.reason.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Reason is required when requesting a part outside your department.',
        variant: 'destructive',
      });
      return;
    }

    if (outOfDept && !requestForm.outOfDeptReason.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a reason / where used for out-of-department parts.',
        variant: 'destructive',
      });
      return;
    }

    const quantity = parseInt(requestForm.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      toast({
        title: 'Invalid Quantity',
        description: 'Please enter a valid quantity.',
        variant: 'destructive',
      });
      return;
    }

    submitRequestMutation.mutate({
      agPartNumber: selectedItem.agPartNumber,
      partNumber: selectedItem.agPartNumber,
      partName: selectedItem.name,
      quantity,
      urgency: requestForm.urgency,
      reason: requestForm.reason.trim() || null,
      requestedBy: requestForm.requestedBy.trim(),
      department: effectiveDepartment,
      departmentId: effectiveDepartmentId,
      catalogFixNeeded: outOfDept,
      outOfDeptReason: outOfDept ? requestForm.outOfDeptReason : null,
      requestedForEmployeeId: requestForm.requestedForEmployeeId
        ? Number(requestForm.requestedForEmployeeId)
        : null,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: JSX.Element }> = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: <Clock className="w-3 h-3" /> },
      APPROVED: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: <CheckCircle className="w-3 h-3" /> },
      ORDERED: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: <ShoppingCart className="w-3 h-3" /> },
      ORDERED_PARTIAL: { color: 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300', icon: <ShoppingCart className="w-3 h-3" /> },
      RECEIVED: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: <Package className="w-3 h-3" /> },
      RECEIVED_PARTIAL: { color: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300', icon: <Package className="w-3 h-3" /> },
      DELIVERED_TO_DEPT: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300', icon: <CheckCircle className="w-3 h-3" /> },
      REJECTED: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: <XCircle className="w-3 h-3" /> },
      CANCEL_REQUESTED: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: <AlertTriangle className="w-3 h-3" /> },
      CANCELED: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: <Ban className="w-3 h-3" /> },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {status.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const getUrgencyBadge = (urgency: string) => {
    const urgencyConfig: Record<string, string> = {
      LOW: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      MEDIUM: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
      CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };

    return (
      <Badge className={urgencyConfig[urgency] || urgencyConfig.MEDIUM}>
        {urgency}
      </Badge>
    );
  };

  const getProgressIndicator = (request: PartsRequest) => {
    const requested = request.quantity || 0;
    const ordered = request.quantityOrdered || 0;
    const received = request.quantityReceived || 0;
    if (requested === 0) return null;

    const orderedPct = Math.min((ordered / requested) * 100, 100);
    const receivedPct = Math.min((received / requested) * 100, 100);

    return (
      <div className="w-full">
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full relative" style={{ width: `${orderedPct}%` }}>
            <div className="absolute inset-0 bg-purple-300 dark:bg-purple-700 rounded-full" />
            <div
              className="absolute inset-y-0 left-0 bg-green-500 dark:bg-green-600 rounded-full"
              style={{ width: `${orderedPct > 0 ? (receivedPct / orderedPct) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
          <span>Ord: {ordered}/{requested}</span>
          <span>Rcv: {received}/{requested}</span>
        </div>
      </div>
    );
  };

  const canCancel = (status: string) => ['PENDING', 'APPROVED'].includes(status);
  const canRequestCancel = (status: string) => status === 'ORDERED';

  const filteredItems = departmentItems.filter((item) => {
    if (!searchTerm.trim()) return true;
    const search = searchTerm.toLowerCase();
    return (
      item.agPartNumber.toLowerCase().includes(search) ||
      item.name.toLowerCase().includes(search) ||
      (item.sku && item.sku.toLowerCase().includes(search))
    );
  });

  if (!user) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Please log in to access this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin && !user.department) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No department assigned to your account. Please contact an administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedItemOutOfDept = selectedItem ? isOutOfDepartment(selectedItem) : false;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Parts Request</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin
            ? 'Admin view: Select a department to browse and request parts'
            : `Browse parts assigned to ${user.department} and submit requests`}
        </p>

        {/* Department Selector for Admin Users */}
        {isAdmin && (
          <div className="mt-4 flex items-end gap-4">
            <div className="max-w-md flex-1">
              <Select
                value={selectedDepartment}
                onValueChange={(value) => {
                  setSelectedDepartment(value);
                  const dept = departments.find(d => d.name === value);
                  setSelectedDepartmentId(dept?.id || null);
                  setShowAllParts(false);
                }}
              >
                <SelectTrigger data-testid="select-department">
                  <SelectValue placeholder="Select a department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.name}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDepartment && (
              <div className="flex items-center gap-2">
                <Switch
                  id="show-all-parts"
                  checked={showAllParts}
                  onCheckedChange={setShowAllParts}
                  data-testid="switch-show-all-parts"
                />
                <Label htmlFor="show-all-parts" className="text-sm cursor-pointer">
                  Show all parts
                </Label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available Parts Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isAdmin
              ? (selectedDepartment
                ? (showAllParts ? `All Parts (requesting for ${selectedDepartment})` : `Available Parts for ${selectedDepartment}`)
                : 'Available Parts (Select a Department)')
              : `Available Parts for ${user.department}`}
          </CardTitle>
          <CardDescription>
            {isAdmin
              ? (selectedDepartment
                ? (showAllParts
                  ? `Showing all inventory parts. Parts not assigned to ${selectedDepartment} will be flagged.`
                  : `Parts for ${selectedDepartment}. Click "Request" to submit a parts request.`)
                : 'Select a department above to view available parts.')
              : 'Parts assigned to your department. Click "Request" to submit a parts request.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <Input
              placeholder="Search parts by number or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-parts"
            />
          </div>

          {/* Parts Table */}
          {isAdmin && !selectedDepartment ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Please select a department above to view available parts.</p>
            </div>
          ) : itemsLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading parts...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No parts found{isAdmin ? ' for this department' : ' for your department'}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Part Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Current Balance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Min Stock
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredItems.map((item) => {
                    const isLowStock = item.currentBalance !== undefined && item.minStock !== undefined && item.currentBalance < item.minStock;
                    const outOfDept = isOutOfDepartment(item);
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100" data-testid={`text-part-number-${item.id}`}>
                          <div className="flex items-center gap-2">
                            {item.agPartNumber}
                            {outOfDept && (
                              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 text-[10px]">
                                Out of Department
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" data-testid={`text-part-name-${item.id}`}>
                          {item.name}
                        </td>
                        <td className="px-4 py-3 text-sm" data-testid={`text-balance-${item.id}`}>
                          <span className={isLowStock ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}>
                            {item.currentBalance ?? 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" data-testid={`text-min-stock-${item.id}`}>
                          {item.minStock ?? 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" data-testid={`text-unit-${item.id}`}>
                          {item.usageUnit || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <Button
                            size="sm"
                            onClick={() => handleRequestClick(item)}
                            data-testid={`button-request-${item.id}`}
                          >
                            Request
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* My Requests Card */}
      <Card>
        <CardHeader>
          <CardTitle>My Requests</CardTitle>
          <CardDescription>
            Track the status of your parts requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestsLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading requests...</p>
            </div>
          ) : userRequests.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No requests found. Submit your first request above!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Request Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Part
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Requested By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Requested For
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Qty Requested
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Qty Ordered
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Qty Received
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Progress
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Urgency
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {userRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" data-testid={`text-request-date-${request.id}`}>
                        {new Date(request.requestDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100" data-testid={`text-request-part-${request.id}`}>
                        <div>{request.partName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{request.partNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {request.department}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {request.requestedBy}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {request.requestedForDisplayName || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100" data-testid={`text-request-qty-requested-${request.id}`}>
                        {request.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100" data-testid={`text-request-qty-ordered-${request.id}`}>
                        {request.quantityOrdered ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-center text-gray-900 dark:text-gray-100" data-testid={`text-request-qty-received-${request.id}`}>
                        {request.quantityReceived ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm min-w-[120px]">
                        {getProgressIndicator(request)}
                      </td>
                      <td className="px-4 py-3 text-sm" data-testid={`badge-urgency-${request.id}`}>
                        {getUrgencyBadge(request.urgency)}
                      </td>
                      <td className="px-4 py-3 text-sm" data-testid={`badge-status-${request.id}`}>
                        <div className="space-y-1">
                          {getStatusBadge(request.status)}
                          {request.status === 'REJECTED' && request.rejectionReason && (
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              Reason: {request.rejectionReason}
                            </p>
                          )}
                          {request.status === 'CANCELED' && request.cancelReason && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Reason: {request.cancelReason}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {canCancel(request.status) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => cancelRequestMutation.mutate(request.id)}
                            disabled={cancelRequestMutation.isPending}
                            data-testid={`button-cancel-${request.id}`}
                          >
                            {cancelRequestMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Cancel'
                            )}
                          </Button>
                        )}
                        {canRequestCancel(request.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950"
                            onClick={() => cancelRequestMutation.mutate(request.id)}
                            disabled={cancelRequestMutation.isPending}
                            data-testid={`button-cancel-request-${request.id}`}
                          >
                            {cancelRequestMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Cancel Request'
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Dialog */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Parts</DialogTitle>
            <DialogDescription>
              Submit a request for {selectedItem?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Part Info */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Part Number:</span>
                  <p className="font-medium">{selectedItem?.agPartNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Current Balance:</span>
                  <p className="font-medium">{selectedItem?.currentBalance ?? 'N/A'}</p>
                </div>
              </div>
              {selectedItemOutOfDept && (
                <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
                  <span className="text-xs text-yellow-800 dark:text-yellow-300">
                    This part is not assigned to {selectedDepartment}. A reason is required.
                  </span>
                </div>
              )}
            </div>

            {/* Requested By */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Requested By <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="Requestor name"
                value={requestForm.requestedBy}
                onChange={(e) => {
                  requestedByEditedRef.current = true;
                  setRequestForm({ ...requestForm, requestedBy: e.target.value });
                }}
                required
                data-testid="input-request-requested-by"
              />
            </div>

            {/* Requested For */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Requested For <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <Select
                value={requestForm.requestedForEmployeeId || '__none__'}
                onValueChange={(value) =>
                  setRequestForm({
                    ...requestForm,
                    requestedForEmployeeId: value === '__none__' ? '' : value,
                  })
                }
              >
                <SelectTrigger data-testid="select-requested-for">
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No employee selected</SelectItem>
                  {activeEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.name}{employee.department ? ` - ${employee.department}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Quantity <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="1"
                placeholder="Enter quantity"
                value={requestForm.quantity}
                onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })}
                data-testid="input-request-quantity"
              />
            </div>

            {/* Urgency */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Urgency <span className="text-red-500">*</span>
              </label>
              <Select
                value={requestForm.urgency}
                onValueChange={(value) => setRequestForm({ ...requestForm, urgency: value })}
              >
                <SelectTrigger data-testid="select-urgency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Reason {selectedItemOutOfDept ? <span className="text-red-500">*</span> : <span className="text-muted-foreground text-xs">(optional)</span>}
              </label>
              <Textarea
                placeholder="Why do you need this part?"
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                rows={3}
                data-testid="textarea-reason"
              />
            </div>

            {/* Out-of-Department Reason (only shown for out-of-dept parts) */}
            {selectedItemOutOfDept && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Reason / Where Used <span className="text-red-500">*</span>
                </label>
                <Textarea
                  placeholder="Explain why this out-of-department part is needed and where it will be used..."
                  value={requestForm.outOfDeptReason}
                  onChange={(e) => setRequestForm({ ...requestForm, outOfDeptReason: e.target.value })}
                  rows={3}
                  data-testid="textarea-out-of-dept-reason"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsRequestDialogOpen(false);
                  setSelectedItem(null);
                  requestedByEditedRef.current = false;
                  setRequestForm({ quantity: '', urgency: 'MEDIUM', reason: '', outOfDeptReason: '', requestedBy: '', requestedForEmployeeId: '' });
                }}
                data-testid="button-cancel-request"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRequest}
                disabled={submitRequestMutation.isPending}
                data-testid="button-submit-request"
              >
                {submitRequestMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

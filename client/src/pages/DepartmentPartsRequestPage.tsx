import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Package, Clock, CheckCircle, XCircle, ShoppingCart } from 'lucide-react';

type InventoryItem = {
  id: number;
  agPartNumber: string;
  name: string;
  sku?: string;
  department?: string;
  assignedDepartments?: string[];
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
  department: string;
  departmentId: number;
  quantity: number;
  urgency: string;
  reason: string;
  status: string;
  requestDate: string;
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;
};

type User = {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  department?: string;
  departmentId?: number;
};

type Department = {
  id: number;
  name: string;
};

export default function DepartmentPartsRequestPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [requestForm, setRequestForm] = useState({
    quantity: '',
    urgency: 'MEDIUM',
    reason: '',
  });

  // Get current user
  const { data: user } = useQuery<User>({
    queryKey: ['/api/auth/session'],
  });

  // Check if user is admin
  const isAdmin = user?.username ? ['glennj', 'tasham', 'staciw', 'lauriet'].includes(user.username.toLowerCase()) : false;

  // Get all departments (for admin users) - using inventory departments from orderDepartmentTypes
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['/api/inventory/departments'],
    enabled: isAdmin,
  });

  // Use selected department for admin, or user's department for regular users
  const effectiveDepartment = isAdmin ? selectedDepartment : (user?.department || '');
  const effectiveDepartmentId = isAdmin ? selectedDepartmentId : (user?.departmentId || null);

  // Get inventory items assigned to department (or all items for admin)
  const { data: departmentItems = [], isLoading: itemsLoading } = useQuery<InventoryItem[]>({
    queryKey: [`/api/inventory/items/department/${effectiveDepartment || 'all'}`],
    enabled: isAdmin ? true : !!user?.department,
  });

  // Get user's parts requests
  const { data: userRequests = [], isLoading: requestsLoading } = useQuery<PartsRequest[]>({
    queryKey: ['/api/inventory/parts-requests/department', effectiveDepartmentId],
    enabled: !!effectiveDepartmentId,
  });

  // Submit parts request mutation
  const submitRequestMutation = useMutation({
    mutationFn: async (data: {
      agPartNumber: string;
      partNumber: string;
      partName: string;
      quantity: number;
      urgency: string;
      reason: string;
      department: string;
      departmentId: number;
    }) => {
      return apiRequest('/api/inventory/parts-requests', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      // Invalidate the appropriate department's request list (handles both admin and regular users)
      queryClient.invalidateQueries({ 
        queryKey: ['/api/inventory/parts-requests/department', effectiveDepartmentId] 
      });
      // Also invalidate the inventory list to refresh stock levels
      queryClient.invalidateQueries({ 
        queryKey: [`/api/inventory/items/department/${effectiveDepartment || 'all'}`] 
      });
      toast({
        title: 'Request Submitted',
        description: `Your parts request has been submitted for approval${isAdmin ? ` for ${effectiveDepartment}` : ''}.`,
      });
      setIsRequestDialogOpen(false);
      setSelectedItem(null);
      setRequestForm({ quantity: '', urgency: 'MEDIUM', reason: '' });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to submit parts request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleRequestClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsRequestDialogOpen(true);
  };

  const handleSubmitRequest = () => {
    if (!selectedItem || !user || !requestForm.quantity || !requestForm.reason) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }

    // Admin users must select a department
    if (isAdmin && (!effectiveDepartment || !effectiveDepartmentId)) {
      toast({
        title: 'Missing Department',
        description: 'Please select a department to request parts for.',
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
      reason: requestForm.reason,
      department: effectiveDepartment,
      departmentId: effectiveDepartmentId || 0,
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: JSX.Element }> = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: <Clock className="w-3 h-3" /> },
      APPROVED: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: <CheckCircle className="w-3 h-3" /> },
      ORDERED: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: <ShoppingCart className="w-3 h-3" /> },
      RECEIVED: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: <Package className="w-3 h-3" /> },
      DELIVERED_TO_DEPT: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300', icon: <CheckCircle className="w-3 h-3" /> },
      REJECTED: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: <XCircle className="w-3 h-3" /> },
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

  // Regular users need a department assigned
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
          <div className="mt-4 max-w-md">
            <Select
              value={selectedDepartment}
              onValueChange={(value) => {
                setSelectedDepartment(value);
                const dept = departments.find(d => d.name === value);
                setSelectedDepartmentId(dept?.id || null);
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
        )}
      </div>

      {/* Available Parts Card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isAdmin 
              ? (selectedDepartment ? `Available Parts for ${selectedDepartment}` : 'Available Parts (Select a Department)')
              : `Available Parts for ${user.department}`}
          </CardTitle>
          <CardDescription>
            {isAdmin 
              ? (selectedDepartment ? `Parts for ${selectedDepartment}. Click "Request" to submit a parts request.` : 'Select a department above to view available parts.')
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
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100" data-testid={`text-part-number-${item.id}`}>
                          {item.agPartNumber}
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
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Urgency
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
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
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" data-testid={`text-request-quantity-${request.id}`}>
                        {request.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm" data-testid={`badge-urgency-${request.id}`}>
                        {getUrgencyBadge(request.urgency)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" data-testid={`text-request-reason-${request.id}`}>
                        {request.reason}
                      </td>
                      <td className="px-4 py-3 text-sm" data-testid={`badge-status-${request.id}`}>
                        {getStatusBadge(request.status)}
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
                Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="Why do you need this part?"
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                rows={3}
                data-testid="textarea-reason"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsRequestDialogOpen(false);
                  setSelectedItem(null);
                  setRequestForm({ quantity: '', urgency: 'MEDIUM', reason: '' });
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

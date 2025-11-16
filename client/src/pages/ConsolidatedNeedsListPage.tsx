import { useState, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { 
  Package, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ShoppingCart, 
  Truck, 
  AlertTriangle,
  ChevronDown,
  ChevronUp 
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type InventoryItem = {
  id: number;
  agPartNumber: string;
  name: string;
  currentBalance?: number;
  minStock?: number;
  maxStock?: number;
  usageUnit?: string;
};

type Department = {
  id: number;
  name: string;
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
  supplier?: string;
  estimatedCost?: number;
  reason: string;
  status: string;
  requestDate: string;
  approvedBy?: string;
  approvedDate?: string;
  orderDate?: string;
  expectedDelivery?: string;
  actualDelivery?: string;
  deliveredToDepartment?: string;
  receivedByDepartment?: string;
  notes?: string;
  inventoryItem?: InventoryItem;
  department_details?: Department;
};

type ConsolidatedPart = {
  partNumber: string;
  partName: string;
  totalQuantity: number;
  highestUrgency: string;
  departmentBreakdown: { department: string; quantity: number; urgency: string }[];
  requests: PartsRequest[];
  inventoryItem?: InventoryItem;
  currentBalance?: number;
};

export default function ConsolidatedNeedsListPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<PartsRequest | null>(null);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'order' | 'receive' | 'deliver'>('approve');
  const [actionNotes, setActionNotes] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());

  // Get current user for approval tracking
  const { data: user } = useQuery<{ username: string; firstName: string; lastName: string }>({
    queryKey: ['/api/auth/session'],
  });

  // Get all parts requests (not just consolidated)
  const { data: allRequests = [], isLoading } = useQuery<PartsRequest[]>({
    queryKey: ['/api/parts-requests'],
  });

  // Update parts request mutation
  const updateRequestMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<PartsRequest> }) => {
      return apiRequest(`/api/parts-requests/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(data.updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/parts-requests'] });
      toast({
        title: 'Success',
        description: 'Request updated successfully.',
      });
      setIsActionDialogOpen(false);
      setSelectedRequest(null);
      setActionNotes('');
      setExpectedDeliveryDate('');
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update request. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Consolidate requests by part number
  const consolidateByPart = (requests: PartsRequest[]): ConsolidatedPart[] => {
    const grouped = new Map<string, ConsolidatedPart>();

    requests.forEach((request) => {
      const key = request.partNumber;
      if (!grouped.has(key)) {
        grouped.set(key, {
          partNumber: request.partNumber,
          partName: request.partName,
          totalQuantity: 0,
          highestUrgency: 'LOW',
          departmentBreakdown: [],
          requests: [],
          inventoryItem: request.inventoryItem,
          currentBalance: request.inventoryItem?.currentBalance,
        });
      }

      const consolidated = grouped.get(key)!;
      consolidated.totalQuantity += request.quantity;
      consolidated.requests.push(request);

      // Track department breakdown
      const existingDept = consolidated.departmentBreakdown.find(
        (d) => d.department === request.department
      );
      if (existingDept) {
        existingDept.quantity += request.quantity;
      } else {
        consolidated.departmentBreakdown.push({
          department: request.department,
          quantity: request.quantity,
          urgency: request.urgency,
        });
      }

      // Update highest urgency
      const urgencyOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      const currentUrgency = urgencyOrder[consolidated.highestUrgency as keyof typeof urgencyOrder] || 1;
      const newUrgency = urgencyOrder[request.urgency as keyof typeof urgencyOrder] || 1;
      if (newUrgency > currentUrgency) {
        consolidated.highestUrgency = request.urgency;
      }
    });

    return Array.from(grouped.values());
  };

  // Filter and categorize requests
  const filteredRequests = useMemo(() => {
    return allRequests.filter((request) => {
      if (!searchTerm.trim()) return true;
      const search = searchTerm.toLowerCase();
      return (
        request.partNumber.toLowerCase().includes(search) ||
        request.partName.toLowerCase().includes(search) ||
        request.department.toLowerCase().includes(search) ||
        (request.requestedBy && request.requestedBy.toLowerCase().includes(search))
      );
    });
  }, [allRequests, searchTerm]);

  const pendingRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'PENDING')), [filteredRequests]);
  const approvedRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'APPROVED')), [filteredRequests]);
  const orderedRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'ORDERED')), [filteredRequests]);
  const receivedRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'RECEIVED')), [filteredRequests]);
  const deliveredRequests = useMemo(() => consolidateByPart(filteredRequests.filter(r => r.status === 'DELIVERED_TO_DEPT')), [filteredRequests]);

  const toggleExpanded = (partNumber: string) => {
    setExpandedParts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(partNumber)) {
        newSet.delete(partNumber);
      } else {
        newSet.add(partNumber);
      }
      return newSet;
    });
  };

  const handleAction = (request: PartsRequest, action: typeof actionType) => {
    setSelectedRequest(request);
    setActionType(action);
    setIsActionDialogOpen(true);
  };

  const handleSubmitAction = () => {
    if (!selectedRequest || !user) return;

    const updates: Partial<PartsRequest> = {
      notes: actionNotes || selectedRequest.notes,
    };

    switch (actionType) {
      case 'approve':
        updates.status = 'APPROVED';
        updates.approvedBy = `${user.firstName} ${user.lastName}`;
        updates.approvedDate = new Date().toISOString();
        break;
      case 'reject':
        updates.status = 'REJECTED';
        updates.approvedBy = `${user.firstName} ${user.lastName}`;
        updates.approvedDate = new Date().toISOString();
        break;
      case 'order':
        updates.status = 'ORDERED';
        updates.orderDate = new Date().toISOString();
        if (expectedDeliveryDate) {
          updates.expectedDelivery = expectedDeliveryDate;
        }
        break;
      case 'receive':
        updates.status = 'RECEIVED';
        updates.actualDelivery = new Date().toISOString().split('T')[0];
        break;
      case 'deliver':
        updates.status = 'DELIVERED_TO_DEPT';
        updates.deliveredToDepartment = new Date().toISOString();
        updates.receivedByDepartment = actionNotes || 'Department Representative';
        break;
    }

    updateRequestMutation.mutate({ id: selectedRequest.id, updates });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: JSX.Element }> = {
      PENDING: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300', icon: <Clock className="w-3 h-3" /> },
      APPROVED: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: <CheckCircle className="w-3 h-3" /> },
      ORDERED: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300', icon: <ShoppingCart className="w-3 h-3" /> },
      RECEIVED: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: <Package className="w-3 h-3" /> },
      DELIVERED_TO_DEPT: { color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300', icon: <Truck className="w-3 h-3" /> },
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
    const urgencyConfig: Record<string, { color: string; icon?: JSX.Element }> = {
      LOW: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
      MEDIUM: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
      HIGH: { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', icon: <AlertTriangle className="w-3 h-3" /> },
      CRITICAL: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: <AlertTriangle className="w-3 h-3" /> },
    };

    const config = urgencyConfig[urgency] || urgencyConfig.MEDIUM;
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        {config.icon}
        {urgency}
      </Badge>
    );
  };

  const renderConsolidatedTable = (consolidatedParts: ConsolidatedPart[], showActions: boolean = true) => {
    if (consolidatedParts.length === 0) {
      return (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No requests found.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {consolidatedParts.map((consolidated) => {
          const isExpanded = expandedParts.has(consolidated.partNumber);
          const isLowStock = consolidated.currentBalance !== undefined && 
                           consolidated.inventoryItem?.minStock !== undefined && 
                           consolidated.currentBalance < consolidated.inventoryItem.minStock;

          return (
            <div key={consolidated.partNumber} className="border rounded-lg dark:border-gray-700">
              {/* Consolidated Row */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-6 gap-4">
                    <div className="col-span-2">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{consolidated.partName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{consolidated.partNumber}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Total Quantity</div>
                      <div className="font-bold text-lg text-gray-900 dark:text-gray-100">
                        {consolidated.totalQuantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Departments</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {consolidated.departmentBreakdown.map((dept) => (
                          <Badge key={dept.department} variant="outline" className="text-xs">
                            {dept.department}: {dept.quantity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Urgency</div>
                      <div className="mt-1">{getUrgencyBadge(consolidated.highestUrgency)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Current Stock</div>
                      <div className={`font-medium mt-1 ${isLowStock ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {consolidated.currentBalance ?? 'N/A'}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleExpanded(consolidated.partNumber)}
                    data-testid={`button-expand-${consolidated.partNumber}`}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded Individual Requests */}
              {isExpanded && (
                <div className="border-t dark:border-gray-700">
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Department</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Requested By</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Qty</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Urgency</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Reason</th>
                        {showActions && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                      {consolidated.requests.map((request) => (
                        <tr key={request.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.department}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.requestedBy}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{request.quantity}</td>
                          <td className="px-4 py-2 text-sm">{getUrgencyBadge(request.urgency)}</td>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate">{request.reason}</td>
                          {showActions && (
                            <td className="px-4 py-2 text-sm text-right space-x-2">
                              {request.status === 'PENDING' && (
                                <>
                                  <Button size="sm" variant="default" onClick={() => handleAction(request, 'approve')} data-testid={`button-approve-${request.id}`}>
                                    Approve
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => handleAction(request, 'reject')} data-testid={`button-reject-${request.id}`}>
                                    Reject
                                  </Button>
                                </>
                              )}
                              {request.status === 'APPROVED' && (
                                <Button size="sm" variant="default" onClick={() => handleAction(request, 'order')} data-testid={`button-order-${request.id}`}>
                                  Mark Ordered
                                </Button>
                              )}
                              {request.status === 'ORDERED' && (
                                <Button size="sm" variant="default" onClick={() => handleAction(request, 'receive')} data-testid={`button-receive-${request.id}`}>
                                  Mark Received
                                </Button>
                              )}
                              {request.status === 'RECEIVED' && (
                                <Button size="sm" variant="default" onClick={() => handleAction(request, 'deliver')} data-testid={`button-deliver-${request.id}`}>
                                  Deliver to Dept
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Consolidated Parts Needs</h1>
        <p className="text-muted-foreground mt-1">
          Manage all parts requests across departments - grouped by part number
        </p>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <Input
            placeholder="Search by part number, name, department, or requester..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-requests"
          />
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pendingRequests.length}</div>
            <p className="text-sm text-muted-foreground">Pending Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{approvedRequests.length}</div>
            <p className="text-sm text-muted-foreground">Approved Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{orderedRequests.length}</div>
            <p className="text-sm text-muted-foreground">Ordered Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{receivedRequests.length}</div>
            <p className="text-sm text-muted-foreground">Received Parts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{deliveredRequests.length}</div>
            <p className="text-sm text-muted-foreground">Delivered Parts</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different request statuses */}
      <Card>
        <CardHeader>
          <CardTitle>Requests by Status (Consolidated by Part)</CardTitle>
          <CardDescription>
            Parts grouped by part number showing total quantities across departments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading requests...</p>
            </div>
          ) : (
            <Tabs defaultValue="pending">
              <TabsList>
                <TabsTrigger value="pending" data-testid="tab-pending">
                  Pending ({pendingRequests.length})
                </TabsTrigger>
                <TabsTrigger value="approved" data-testid="tab-approved">
                  Approved ({approvedRequests.length})
                </TabsTrigger>
                <TabsTrigger value="ordered" data-testid="tab-ordered">
                  Ordered ({orderedRequests.length})
                </TabsTrigger>
                <TabsTrigger value="received" data-testid="tab-received">
                  Received ({receivedRequests.length})
                </TabsTrigger>
                <TabsTrigger value="delivered" data-testid="tab-delivered">
                  Delivered ({deliveredRequests.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending">
                {renderConsolidatedTable(pendingRequests)}
              </TabsContent>

              <TabsContent value="approved">
                {renderConsolidatedTable(approvedRequests)}
              </TabsContent>

              <TabsContent value="ordered">
                {renderConsolidatedTable(orderedRequests)}
              </TabsContent>

              <TabsContent value="received">
                {renderConsolidatedTable(receivedRequests)}
              </TabsContent>

              <TabsContent value="delivered">
                {renderConsolidatedTable(deliveredRequests, false)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Approve Request'}
              {actionType === 'reject' && 'Reject Request'}
              {actionType === 'order' && 'Mark as Ordered'}
              {actionType === 'receive' && 'Mark as Received'}
              {actionType === 'deliver' && 'Deliver to Department'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest?.partName} - {selectedRequest?.quantity} units for {selectedRequest?.department}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Request Details */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Requested By:</span>
                  <p className="font-medium">{selectedRequest?.requestedBy}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Urgency:</span>
                  <div className="mt-1">{selectedRequest && getUrgencyBadge(selectedRequest.urgency)}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Reason:</span>
                  <p className="font-medium">{selectedRequest?.reason}</p>
                </div>
              </div>
            </div>

            {/* Expected Delivery (for Order action) */}
            {actionType === 'order' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Expected Delivery Date
                </label>
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  data-testid="input-expected-delivery"
                />
              </div>
            )}

            {/* Recipient (for Deliver action) */}
            {actionType === 'deliver' && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Received By (Department Representative)
                </label>
                <Input
                  placeholder="Enter name"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  data-testid="input-received-by"
                />
              </div>
            )}

            {/* Notes */}
            {(actionType === 'approve' || actionType === 'reject') && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Notes {actionType === 'reject' && <span className="text-red-500">*</span>}
                </label>
                <Textarea
                  placeholder={actionType === 'reject' ? 'Please provide a reason for rejection' : 'Optional notes'}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={3}
                  data-testid="textarea-notes"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsActionDialogOpen(false);
                  setSelectedRequest(null);
                  setActionNotes('');
                  setExpectedDeliveryDate('');
                }}
                data-testid="button-cancel-action"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAction}
                disabled={updateRequestMutation.isPending || (actionType === 'reject' && !actionNotes)}
                variant={actionType === 'reject' ? 'destructive' : 'default'}
                data-testid="button-submit-action"
              >
                {updateRequestMutation.isPending ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

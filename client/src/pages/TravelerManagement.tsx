import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  AlertTriangle,
  Clock,
  Clipboard,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  Ban,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'wouter';

interface Traveler {
  id: string;
  travelerNumber: string;
  travelerRevision: number;
  inventoryItemId: string | null;
  partNumber: string | null;
  partName: string | null;
  salesOrderId: string | null;
  workOrderId: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  internalControlNumber: string | null;
  quantity: number;
  status: string;
  partRoutingId: string | null;
  partRoutingRevision: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PartRouting {
  id: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  isActive?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  BLOCKED: 'bg-red-100 text-red-800',
  CANCELED: 'bg-yellow-100 text-yellow-800',
};

const STATUS_ICONS: Record<string, any> = {
  DRAFT: FileText,
  IN_PROGRESS: Play,
  COMPLETED: CheckCircle,
  BLOCKED: AlertTriangle,
  CANCELED: XCircle,
};

export default function TravelerManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler | null>(null);
  const [selectedRouting, setSelectedRouting] = useState<string>('');
  const [cancelReason, setCancelReason] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [createFormData, setCreateFormData] = useState({
    workOrderId: '',
    salesOrderId: '',
    lotNumber: '',
    serialNumber: '',
    internalControlNumber: '',
    quantity: 1,
  });
  const [editFormData, setEditFormData] = useState({
    workOrderId: '',
    salesOrderId: '',
    lotNumber: '',
    serialNumber: '',
    internalControlNumber: '',
    quantity: 1,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: travelers = [], isLoading } = useQuery<Traveler[]>({
    queryKey: ['/api/travelers'],
  });

  const { data: routings = [] } = useQuery<PartRouting[]>({
    queryKey: ['/api/part-routings'],
  });

  const createMutation = useMutation({
    mutationFn: (data: { partRoutingId: string; formData: typeof createFormData }) =>
      apiRequest(`/api/travelers/from-routing/${data.partRoutingId}`, {
        method: 'POST',
        body: JSON.stringify({
          ...data.formData,
          createdBy: 'system',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Created',
        description: 'New traveler has been generated from the routing template',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowCreateDialog(false);
      setSelectedRouting('');
      setCreateFormData({
        workOrderId: '',
        salesOrderId: '',
        lotNumber: '',
        serialNumber: '',
        internalControlNumber: '',
        quantity: 1,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create traveler',
        variant: 'destructive',
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; formData: typeof editFormData }) =>
      apiRequest(`/api/travelers/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...data.formData,
          updatedBy: 'system',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Updated',
        description: 'Traveler details have been saved',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowEditDialog(false);
      setSelectedTraveler(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update traveler',
        variant: 'destructive',
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ startedBy: 'system' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Started',
        description: 'Traveler is now in progress',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start traveler',
        variant: 'destructive',
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completedBy: 'system' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Completed',
        description: 'Traveler has been marked as completed',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete traveler. Ensure all steps are completed and signed.',
        variant: 'destructive',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (data: { id: string; reason: string }) =>
      apiRequest(`/api/travelers/${data.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ canceledBy: 'system', reason: data.reason }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Canceled',
        description: 'Traveler has been canceled',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowCancelDialog(false);
      setSelectedTraveler(null);
      setCancelReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel traveler',
        variant: 'destructive',
      });
    },
  });

  const blockMutation = useMutation({
    mutationFn: (data: { id: string; reason: string }) =>
      apiRequest(`/api/travelers/${data.id}/block`, {
        method: 'POST',
        body: JSON.stringify({ blockedBy: 'system', reason: data.reason }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Blocked',
        description: 'Traveler has been blocked',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowBlockDialog(false);
      setSelectedTraveler(null);
      setBlockReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to block traveler',
        variant: 'destructive',
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}/unblock`, {
        method: 'POST',
        body: JSON.stringify({ unblockedBy: 'system' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Unblocked',
        description: 'Traveler is back in progress',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unblock traveler',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({
        title: 'Traveler Deleted',
        description: 'Draft traveler has been deleted',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete traveler',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!selectedRouting) {
      toast({
        title: 'Select Routing',
        description: 'Please select a part routing first',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate({
      partRoutingId: selectedRouting,
      formData: createFormData,
    });
  };

  const handleEdit = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setEditFormData({
      workOrderId: traveler.workOrderId || '',
      salesOrderId: traveler.salesOrderId || '',
      lotNumber: traveler.lotNumber || '',
      serialNumber: traveler.serialNumber || '',
      internalControlNumber: traveler.internalControlNumber || '',
      quantity: traveler.quantity,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!selectedTraveler) return;
    editMutation.mutate({
      id: selectedTraveler.id,
      formData: editFormData,
    });
  };

  const handleStart = (id: string) => {
    startMutation.mutate(id);
  };

  const handleComplete = (id: string) => {
    if (confirm('Complete this traveler? All steps must be completed and signed.')) {
      completeMutation.mutate(id);
    }
  };

  const handleCancelClick = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setCancelReason('');
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = () => {
    if (!selectedTraveler) return;
    cancelMutation.mutate({
      id: selectedTraveler.id,
      reason: cancelReason,
    });
  };

  const handleBlockClick = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setBlockReason('');
    setShowBlockDialog(true);
  };

  const handleConfirmBlock = () => {
    if (!selectedTraveler) return;
    blockMutation.mutate({
      id: selectedTraveler.id,
      reason: blockReason,
    });
  };

  const handleUnblock = (id: string) => {
    unblockMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this draft traveler?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredTravelers = travelers.filter((t) => {
    const matchesSearch =
      (t.travelerNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.partNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.workOrderId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.lotNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.serialNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeRoutings = routings.filter((r) => r.isActive !== false);

  const stats = {
    total: travelers.length,
    draft: travelers.filter((t) => t.status === 'DRAFT').length,
    inProgress: travelers.filter((t) => t.status === 'IN_PROGRESS').length,
    completed: travelers.filter((t) => t.status === 'COMPLETED').length,
    blocked: travelers.filter((t) => t.status === 'BLOCKED').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Traveler Management</h1>
          <p className="text-muted-foreground">
            AS9100-compliant production travelers for manufacturing execution
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-traveler">
          <Plus className="h-4 w-4 mr-2" />
          Create Traveler
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold" data-testid="stat-total">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-gray-500">Draft</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-gray-600" data-testid="stat-draft">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-blue-500">In Progress</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-blue-600" data-testid="stat-in-progress">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-green-500">Completed</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-green-600" data-testid="stat-completed">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-red-500">Blocked</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-red-600" data-testid="stat-blocked">{stats.blocked}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Travelers</CardTitle>
              <CardDescription>
                Production travelers for tracking work through departments
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search travelers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                  <SelectItem value="CANCELED">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Traveler #</TableHead>
                <TableHead>Part Number</TableHead>
                <TableHead>Part Name</TableHead>
                <TableHead>Work Order</TableHead>
                <TableHead>Lot/Serial</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTravelers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {searchTerm || statusFilter !== 'all'
                      ? 'No travelers match your search criteria'
                      : 'No travelers yet. Create one from a part routing.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTravelers.map((traveler) => {
                  const StatusIcon = STATUS_ICONS[traveler.status] || FileText;
                  const isTerminal = traveler.status === 'COMPLETED' || traveler.status === 'CANCELED';
                  return (
                    <TableRow key={traveler.id} data-testid={`row-traveler-${traveler.id}`}>
                      <TableCell className="font-mono font-medium">
                        {traveler.travelerNumber}
                        {traveler.travelerRevision > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            Rev {traveler.travelerRevision}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{traveler.partNumber || '-'}</TableCell>
                      <TableCell>{traveler.partName || '-'}</TableCell>
                      <TableCell>{traveler.workOrderId || '-'}</TableCell>
                      <TableCell>
                        {traveler.lotNumber || traveler.serialNumber || '-'}
                      </TableCell>
                      <TableCell>{traveler.quantity}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[traveler.status] || 'bg-gray-100'}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {traveler.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(traveler.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/travelers/${traveler.id}`}>
                            <Badge
                              className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors px-3 py-1 inline-flex items-center gap-1"
                              data-testid={`badge-view-${traveler.id}`}
                            >
                              <Eye className="h-3 w-3" />
                              View Traveler
                            </Badge>
                          </Link>
                          {!isTerminal && (
                            <Badge
                              className="cursor-pointer bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors px-3 py-1 inline-flex items-center gap-1"
                              data-testid={`badge-edit-${traveler.id}`}
                              onClick={() => handleEdit(traveler)}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Badge>
                          )}
                          {(traveler.serialNumber || traveler.lotNumber) && (
                            <Link href={`/p2-traveler-viewer?barcode=${encodeURIComponent(traveler.serialNumber || traveler.lotNumber || '')}`}>
                              <Badge
                                className="cursor-pointer bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors px-3 py-1 inline-flex items-center gap-1"
                                data-testid={`badge-p2-view-${traveler.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                P2 View
                              </Badge>
                            </Link>
                          )}
                          {traveler.status === 'IN_PROGRESS' && (
                            <Link href={`/travelers/${traveler.id}/execute`}>
                              <Button variant="outline" size="sm" data-testid={`button-execute-${traveler.id}`}>
                                <Clipboard className="h-4 w-4 mr-1" />
                                Execute
                              </Button>
                            </Link>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`button-actions-${traveler.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!isTerminal && (
                                <DropdownMenuItem onClick={() => handleEdit(traveler)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit Details
                                </DropdownMenuItem>
                              )}
                              {traveler.status === 'DRAFT' && (
                                <DropdownMenuItem onClick={() => handleStart(traveler.id)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Start Traveler
                                </DropdownMenuItem>
                              )}
                              {traveler.status === 'IN_PROGRESS' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleComplete(traveler.id)}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Complete Traveler
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleBlockClick(traveler)}>
                                    <ShieldAlert className="h-4 w-4 mr-2" />
                                    Block Traveler
                                  </DropdownMenuItem>
                                </>
                              )}
                              {traveler.status === 'BLOCKED' && (
                                <DropdownMenuItem onClick={() => handleUnblock(traveler.id)}>
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Unblock Traveler
                                </DropdownMenuItem>
                              )}
                              {!isTerminal && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleCancelClick(traveler)}
                                    className="text-orange-600"
                                  >
                                    <Ban className="h-4 w-4 mr-2" />
                                    Cancel Traveler
                                  </DropdownMenuItem>
                                </>
                              )}
                              {traveler.status === 'DRAFT' && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(traveler.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Traveler
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Traveler</DialogTitle>
            <DialogDescription>
              Generate a traveler from an existing part routing template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="routing">Part Routing *</Label>
              <Select value={selectedRouting} onValueChange={setSelectedRouting}>
                <SelectTrigger data-testid="select-routing">
                  <SelectValue placeholder="Select a part routing..." />
                </SelectTrigger>
                <SelectContent>
                  {activeRoutings.map((routing) => (
                    <SelectItem key={routing.id} value={routing.id}>
                      {routing.partNumber} - {routing.partName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeRoutings.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active part routings available. Create one first.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workOrderId">Work Order ID</Label>
                <Input
                  id="workOrderId"
                  value={createFormData.workOrderId}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, workOrderId: e.target.value })
                  }
                  placeholder="WO-12345"
                  data-testid="input-work-order"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salesOrderId">Sales Order ID</Label>
                <Input
                  id="salesOrderId"
                  value={createFormData.salesOrderId}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, salesOrderId: e.target.value })
                  }
                  placeholder="SO-12345"
                  data-testid="input-sales-order"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lotNumber">Lot Number</Label>
                <Input
                  id="lotNumber"
                  value={createFormData.lotNumber}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, lotNumber: e.target.value })
                  }
                  placeholder="LOT-2024-001"
                  data-testid="input-lot"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  value={createFormData.serialNumber}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, serialNumber: e.target.value })
                  }
                  placeholder="SN-001"
                  data-testid="input-serial"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icn">Internal Control Number</Label>
                <Input
                  id="icn"
                  value={createFormData.internalControlNumber}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      internalControlNumber: e.target.value,
                    })
                  }
                  placeholder="ICN-001"
                  data-testid="input-icn"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={createFormData.quantity}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      quantity: parseInt(e.target.value) || 1,
                    })
                  }
                  data-testid="input-quantity"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !selectedRouting}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Traveler</DialogTitle>
            <DialogDescription>
              Update details for traveler {selectedTraveler?.travelerNumber}
              {selectedTraveler?.partNumber && ` - ${selectedTraveler.partNumber}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-workOrderId">Work Order ID</Label>
                <Input
                  id="edit-workOrderId"
                  value={editFormData.workOrderId}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, workOrderId: e.target.value })
                  }
                  placeholder="WO-12345"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-salesOrderId">Sales Order ID</Label>
                <Input
                  id="edit-salesOrderId"
                  value={editFormData.salesOrderId}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, salesOrderId: e.target.value })
                  }
                  placeholder="SO-12345"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-lotNumber">Lot Number</Label>
                <Input
                  id="edit-lotNumber"
                  value={editFormData.lotNumber}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, lotNumber: e.target.value })
                  }
                  placeholder="LOT-2024-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-serialNumber">Serial Number</Label>
                <Input
                  id="edit-serialNumber"
                  value={editFormData.serialNumber}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, serialNumber: e.target.value })
                  }
                  placeholder="SN-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-icn">Internal Control Number</Label>
                <Input
                  id="edit-icn"
                  value={editFormData.internalControlNumber}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      internalControlNumber: e.target.value,
                    })
                  }
                  placeholder="ICN-001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-quantity">Quantity</Label>
                <Input
                  id="edit-quantity"
                  type="number"
                  min="1"
                  value={editFormData.quantity}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      quantity: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Traveler</DialogTitle>
            <DialogDescription>
              Cancel traveler {selectedTraveler?.travelerNumber}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason for Cancellation *</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason for canceling this traveler..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending || !cancelReason.trim()}
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Block Traveler</DialogTitle>
            <DialogDescription>
              Block traveler {selectedTraveler?.travelerNumber}? This will pause all work on this traveler.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason for Blocking *</Label>
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Enter reason for blocking this traveler..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmBlock}
              disabled={blockMutation.isPending || !blockReason.trim()}
            >
              {blockMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Block Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Factory,
  Calendar,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Route,
} from 'lucide-react';
import { format } from 'date-fns';

interface ProductionOrder {
  id: number;
  orderId: string;
  sku: string;
  partName: string;
  quantity: number;
  quantityManufactured: number;
  department: string;
  status: string;
  priority: number;
  dueDate: string | null;
  scheduledLayupDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  bomItem: {
    partName: string;
    quantity: number;
    firstDept: string;
    itemType: string;
  };
}

interface Parent {
  poItem: {
    id: number;
    partNumber: string;
    partName: string;
    quantity: number;
  };
  bom: {
    id: string;
    sku: string;
    modelName: string;
    revision: string;
  } | null;
  routing: {
    departmentSequence: string[];
    traceabilityConfig: Record<string, string[]>;
  } | null;
  productionOrders: ProductionOrder[];
}

interface POGroup {
  purchaseOrder: {
    id: number;
    poNumber: string;
    customerName: string;
    expectedDelivery: string;
  };
  parents: Parent[];
}

export default function P2ProductionQueuePage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [expandedPOs, setExpandedPOs] = useState<Set<number>>(new Set());
  const [expandedParents, setExpandedParents] = useState<Set<string>>(
    new Set()
  );
  const [scheduleDialog, setScheduleDialog] = useState<{
    open: boolean;
    productionOrder: ProductionOrder | null;
  }>({ open: false, productionOrder: null });
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: queueData = [], isLoading } = useQuery<POGroup[]>({
    queryKey: ['/api/p2-production-queue', selectedStatus],
    queryFn: async ({ queryKey }) => {
      const [baseUrl, status] = queryKey;
      const params = new URLSearchParams();
      if (status && status !== 'all') {
        params.append('status', status as string);
      }
      const url = `${baseUrl}${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch production queue');
      }
      return response.json();
    },
  });

  const scheduleLayupMutation = useMutation({
    mutationFn: async ({
      id,
      scheduledLayupDate,
    }: {
      id: number;
      scheduledLayupDate: string;
    }) => {
      return apiRequest(`/api/p2-production-queue/${id}/schedule-layup`, {
        method: 'PATCH',
        body: JSON.stringify({ scheduledLayupDate }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Layup date scheduled successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-production-queue'],
        exact: false,
      });
      setScheduleDialog({ open: false, productionOrder: null });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule layup',
        variant: 'destructive',
      });
    },
  });

  const updateQuantityMutation = useMutation({
    mutationFn: async ({
      id,
      quantityManufactured,
    }: {
      id: number;
      quantityManufactured: number;
    }) => {
      return apiRequest(`/api/p2-production-queue/${id}/update-quantity`, {
        method: 'PATCH',
        body: JSON.stringify({ quantityManufactured }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Quantity updated successfully',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-production-queue'],
        exact: false,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update quantity',
        variant: 'destructive',
      });
    },
  });

  const togglePO = (poId: number) => {
    const newExpanded = new Set(expandedPOs);
    if (newExpanded.has(poId)) {
      newExpanded.delete(poId);
    } else {
      newExpanded.add(poId);
    }
    setExpandedPOs(newExpanded);
  };

  const toggleParent = (key: string) => {
    const newExpanded = new Set(expandedParents);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedParents(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { variant: 'secondary' as const, icon: Clock },
      IN_PROGRESS: { variant: 'default' as const, icon: Factory },
      COMPLETED: { variant: 'default' as const, icon: CheckCircle },
      CANCELLED: { variant: 'destructive' as const, icon: AlertCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      variant: 'secondary' as const,
      icon: Clock,
    };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const handleScheduleLayup = (productionOrder: ProductionOrder) => {
    setScheduleDialog({ open: true, productionOrder });
    setScheduledDate(
      productionOrder.scheduledLayupDate
        ? format(new Date(productionOrder.scheduledLayupDate), 'yyyy-MM-dd')
        : ''
    );
  };

  const handleSaveSchedule = () => {
    if (scheduleDialog.productionOrder && scheduledDate) {
      scheduleLayupMutation.mutate({
        id: scheduleDialog.productionOrder.id,
        scheduledLayupDate: new Date(scheduledDate).toISOString(),
      });
    }
  };

  const handleQuantityChange = (id: number, value: string) => {
    const quantity = parseInt(value, 10);
    if (!isNaN(quantity) && quantity >= 0) {
      updateQuantityMutation.mutate({ id, quantityManufactured: quantity });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading production queue...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Factory className="h-8 w-8" />
            P2 Production Queue
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage production orders generated from BOMs. Schedule layup dates and
            track manufacturing progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter">Filter by Status:</Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-40" id="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {queueData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">
              No production orders found
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Generate production orders from a P2 Purchase Order to see them here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {queueData.map((poGroup) => {
            const isExpanded = expandedPOs.has(poGroup.purchaseOrder.id);
            return (
              <Card key={poGroup.purchaseOrder.id}>
                <CardHeader
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => togglePO(poGroup.purchaseOrder.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <div>
                        <CardTitle>
                          PO: {poGroup.purchaseOrder.poNumber}
                        </CardTitle>
                        <CardDescription>
                          Customer: {poGroup.purchaseOrder.customerName} •
                          Expected Delivery:{' '}
                          {poGroup.purchaseOrder.expectedDelivery
                            ? format(
                                new Date(poGroup.purchaseOrder.expectedDelivery),
                                'MMM dd, yyyy'
                              )
                            : 'Not set'}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline">
                      {poGroup.parents.length} Parent Part
                      {poGroup.parents.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4">
                    {poGroup.parents.map((parent) => {
                      const parentKey = `${poGroup.purchaseOrder.id}-${parent.poItem.id}`;
                      const isParentExpanded = expandedParents.has(parentKey);
                      const totalNeeded =
                        parent.poItem.quantity *
                        parent.productionOrders.reduce(
                          (sum, po) => sum + po.bomItem.quantity,
                          0
                        );
                      const totalManufactured = parent.productionOrders.reduce(
                        (sum, po) => sum + po.quantityManufactured,
                        0
                      );

                      return (
                        <div
                          key={parentKey}
                          className="border rounded-lg p-4 space-y-3"
                        >
                          <div
                            className="flex items-center justify-between cursor-pointer hover:bg-muted/30 -m-2 p-2 rounded"
                            onClick={() => toggleParent(parentKey)}
                          >
                            <div className="flex items-center gap-2">
                              {isParentExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <Package className="h-5 w-5 text-primary" />
                              <div>
                                <div className="font-semibold">
                                  {parent.poItem.partName} ({parent.poItem.partNumber})
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Quantity: {parent.poItem.quantity} •{' '}
                                  {parent.bom
                                    ? `BOM: ${parent.bom.modelName} (Rev ${parent.bom.revision})`
                                    : 'No BOM'}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              {parent.routing && (
                                <div className="flex items-center gap-2">
                                  <Route className="h-4 w-4 text-muted-foreground" />
                                  <div className="text-sm">
                                    {parent.routing.departmentSequence.join(' → ')}
                                  </div>
                                </div>
                              )}
                              <Badge variant="outline">
                                {totalManufactured} / {totalNeeded} Manufactured
                              </Badge>
                            </div>
                          </div>

                          {isParentExpanded && (
                            <div className="ml-6">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Part Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Dept</TableHead>
                                    <TableHead>Qty Needed</TableHead>
                                    <TableHead>Qty Made</TableHead>
                                    <TableHead>Remaining</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Layup Date</TableHead>
                                    <TableHead>Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {parent.productionOrders.map((po) => (
                                    <TableRow key={po.id}>
                                      <TableCell className="font-medium">
                                        {po.bomItem.partName}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline">
                                          {po.bomItem.itemType}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>{po.department}</TableCell>
                                      <TableCell>{po.quantity}</TableCell>
                                      <TableCell>
                                        <Input
                                          type="number"
                                          min="0"
                                          max={po.quantity}
                                          value={po.quantityManufactured}
                                          onChange={(e) =>
                                            handleQuantityChange(po.id, e.target.value)
                                          }
                                          className="w-20"
                                          data-testid={`input-quantity-${po.id}`}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <span
                                          className={
                                            po.quantity - po.quantityManufactured > 0
                                              ? 'text-orange-600 font-semibold'
                                              : 'text-green-600'
                                          }
                                        >
                                          {po.quantity - po.quantityManufactured}
                                        </span>
                                      </TableCell>
                                      <TableCell>{getStatusBadge(po.status)}</TableCell>
                                      <TableCell>
                                        {po.scheduledLayupDate ? (
                                          <div className="text-sm">
                                            {format(
                                              new Date(po.scheduledLayupDate),
                                              'MMM dd, yyyy'
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground text-sm">
                                            Not scheduled
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleScheduleLayup(po)}
                                          data-testid={`button-schedule-layup-${po.id}`}
                                        >
                                          <Calendar className="h-4 w-4 mr-1" />
                                          Schedule
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={scheduleDialog.open}
        onOpenChange={(open) =>
          setScheduleDialog({ open, productionOrder: null })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Layup Date</DialogTitle>
            <DialogDescription>
              Set the scheduled layup date for{' '}
              {scheduleDialog.productionOrder?.bomItem.partName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="layup-date">Scheduled Layup Date</Label>
              <Input
                id="layup-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                data-testid="input-schedule-date"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setScheduleDialog({ open: false, productionOrder: null })}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSchedule}
              disabled={!scheduledDate || scheduleLayupMutation.isPending}
              data-testid="button-save-schedule"
            >
              {scheduleLayupMutation.isPending ? 'Saving...' : 'Save Schedule'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

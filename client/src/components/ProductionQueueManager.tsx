import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  User,
  Package,
  ArrowRight,
  Zap,
} from 'lucide-react';

interface ProductionQueueOrder {
  orderId: string;
  fbOrderNumber?: string;
  modelId: string;
  stockModelId: string;
  dueDate: string;
  orderDate: string;
  currentDepartment: string;
  status: string;
  customerId: string;
  customerName?: string;
  features?: any;
  priorityScore: number;
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  isManualUrgency?: boolean;
  queuePosition: number;
  daysToDue: number;
  isOverdue: boolean;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
}

// POItem interface removed - P1 POs now managed via OEM Priority Settings only

interface Kickback {
  id: number;
  orderId: string;
  department: string;
  issueDescription: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

// Removed: WeekSchedule and ProductionSchedule interfaces
// P1 PO week selection functionality now managed via OEM Priority Settings


export default function ProductionQueueManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Helper function to check if order has rush fees
  const hasRushFee = (order: ProductionQueueOrder, feeType: 'rush_fee1' | 'rush_fee2') => {
    if (!order.features?.other_options) return false;
    const otherOptions = Array.isArray(order.features.other_options) 
      ? order.features.other_options 
      : [];
    return otherOptions.includes(feeType);
  };

  // Removed: P1 PO week selection dialog state - now managed via OEM Priority Settings

  // State for P1 Production Queue order selection
  const [selectedQueueOrders, setSelectedQueueOrders] = useState<Set<string>>(
    new Set()
  );

  // Fetch prioritized production queue
  const {
    data: productionQueue = [],
    isLoading,
    refetch,
  } = useQuery<ProductionQueueOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // P1 Purchase Order items query removed - now managed via OEM Priority Settings

  // Fetch orders that need attention (missing critical information for layup scheduling)
  const {
    data: attentionOrders = [],
    isLoading: isLoadingAttention,
    refetch: refetchAttention,
  } = useQuery<any[]>({
    queryKey: ['/api/production-queue/attention'],
    queryFn: () => apiRequest('/api/production-queue/attention'),
  });

  // Auto-populate production queue mutation
  const autoPopulateMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/production-queue/auto-populate', { method: 'POST' }),
    onSuccess: (result: any) => {
      toast({
        title: 'Production Queue Updated',
        description: `Successfully auto-populated queue with ${result.ordersProcessed} orders`,
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Auto-Populate Failed',
        description:
          error.message || 'Failed to auto-populate production queue',
        variant: 'destructive',
      });
    },
  });

  // Update priorities mutation
  const updatePrioritiesMutation = useMutation({
    mutationFn: (orders: ProductionQueueOrder[]) =>
      apiRequest('/api/production-queue/update-priorities', {
        method: 'POST',
        body: JSON.stringify({ orders }),
      }),
    onSuccess: () => {
      toast({
        title: 'Priorities Updated',
        description: 'Successfully updated order priorities',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Priority Update Failed',
        description: error.message || 'Failed to update priorities',
        variant: 'destructive',
      });
    },
  });

  // Removed: Fetch production schedule for PO mutation
  // Removed: Move selected weeks to layup scheduler mutation
  // Removed: Move selected PO items to layup scheduler mutation
  // All P1 PO functionality now managed via OEM Priority Settings

  // Progress orders to Layup/Plugging mutation
  const progressToLayupPluggingMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const progressPromises = orderIds.map((orderId) =>
        apiRequest(`/api/orders/${orderId}/progress`, {
          method: 'POST',
          body: { toDepartment: 'Layup/Plugging' },
        })
      );
      return Promise.all(progressPromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      toast({
        title: 'Success',
        description: `Successfully progressed ${selectedQueueOrders.size} order(s) to Layup/Plugging`,
      });
      setSelectedQueueOrders(new Set());
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to progress orders',
        variant: 'destructive',
      });
    },
  });

  // Handlers for P1 Production Queue selection
  const handleToggleOrderSelection = (orderId: string) => {
    setSelectedQueueOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAllQueueOrders = () => {
    if (selectedQueueOrders.size === productionQueue.length) {
      setSelectedQueueOrders(new Set());
    } else {
      setSelectedQueueOrders(new Set(productionQueue.map((o) => o.orderId)));
    }
  };

  const handleProgressSelectedToLayupPlugging = () => {
    if (selectedQueueOrders.size === 0) return;
    progressToLayupPluggingMutation.mutate(Array.from(selectedQueueOrders));
  };

  const getUrgencyBadgeColor = (urgencyLevel: string) => {
    switch (urgencyLevel) {
      case 'critical':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'medium':
        return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      default:
        return 'bg-green-500 hover:bg-green-600 text-white';
    }
  };

  // Removed: handleOpenWeekSelection, handleWeekToggle, handleMoveSelectedWeeks
  // All P1 PO week selection functionality now managed via OEM Priority Settings

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const newQueue = [...productionQueue];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newQueue.length) return;

    // Swap orders
    [newQueue[index], newQueue[targetIndex]] = [
      newQueue[targetIndex],
      newQueue[index],
    ];

    // Update priority scores and queue positions
    const updatedOrders = newQueue.map((order, idx) => ({
      ...order,
      queuePosition: idx + 1,
      priorityScore: 1000 - idx, // Higher position = higher score
    }));

    updatePrioritiesMutation.mutate(updatedOrders);
  };

  if (isLoading || isLoadingAttention) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">Loading production queues...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Production Queue Manager
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-populate queue, set priorities, and manage production flow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => refetch()}
            variant="outline"
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            onClick={() => autoPopulateMutation.mutate()}
            disabled={autoPopulateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            Auto-Populate Queue
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">Total Orders</p>
                <p className="text-xl font-bold">{productionQueue.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-600 animate-pulse" />
              <div>
                <p className="text-sm text-orange-600 font-semibold">Urgent Orders</p>
                <p className="text-xl font-bold text-orange-700">
                  {productionQueue.filter((o) => o.isManualUrgency).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-xl font-bold">
                  {
                    productionQueue.filter((o) => o.urgencyLevel === 'critical')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-sm text-gray-500">High Priority</p>
                <p className="text-xl font-bold">
                  {
                    productionQueue.filter((o) => o.urgencyLevel === 'high')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Normal</p>
                <p className="text-xl font-bold">
                  {
                    productionQueue.filter((o) => o.urgencyLevel === 'normal')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Accordion type="multiple" defaultValue={[]} className="space-y-4">
        {/* Orders That Need Attention */}
        <AccordionItem value="attention-orders">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Orders That Need Attention
                  {attentionOrders.length > 0 && (
                    <Badge className="bg-red-500 hover:bg-red-600 text-white ml-2">
                      {attentionOrders.length}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Orders missing critical information required for layup
                  scheduling
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                {attentionOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-300" />
                    <p>No orders requiring attention</p>
                    <p className="text-sm">
                      All production issues are resolved
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Stock Model</TableHead>
                        <TableHead>Missing Items</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(attentionOrders) &&
                        attentionOrders.map((order) => (
                          <TableRow key={order.orderId} className="bg-amber-50">
                            <TableCell className="font-medium">
                              {order.orderId}
                            </TableCell>
                            <TableCell>
                              {order.customerName || order.customerId}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.modelId || 'Missing'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="flex flex-wrap gap-1">
                                {order.missingItems?.map((item: string) => (
                                  <Badge
                                    key={item}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs"
                                  >
                                    {item}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                {order.dueDate
                                  ? new Date(order.dueDate).toLocaleDateString()
                                  : 'Not set'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700"
                                onClick={() =>
                                  setLocation(
                                    `/order-entry?edit=${order.orderId}`
                                  )
                                }
                                data-testid={`button-edit-${order.orderId}`}
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Regular Production Queue */}
        <AccordionItem value="regular-queue">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Regular Production Queue ({productionQueue.length})
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Inventory items ready to progress to Barcode
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                {productionQueue.length > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllQueueOrders}
                      className="flex items-center gap-2"
                    >
                      {selectedQueueOrders.size === productionQueue.length
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                    {selectedQueueOrders.size > 0 && (
                      <Button
                        onClick={handleProgressSelectedToLayupPlugging}
                        disabled={progressToLayupPluggingMutation.isPending}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                        size="sm"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Progress to Layup/Plugging ({selectedQueueOrders.size})
                      </Button>
                    )}
                  </div>
                )}
                {productionQueue.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No orders in production queue</p>
                    <p className="text-sm">
                      Use Auto-Populate to add eligible orders
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              selectedQueueOrders.size ===
                                productionQueue.length &&
                              productionQueue.length > 0
                            }
                            onCheckedChange={handleSelectAllQueueOrders}
                          />
                        </TableHead>
                        <TableHead className="w-20">Priority</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Stock Model</TableHead>
                        <TableHead>Action Length</TableHead>
                        <TableHead>Bottom Metal</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Days to Due</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {productionQueue.map((order, index) => {
                        // Get action length
                        let actionLength = order.features?.action_length;
                        if (!actionLength || actionLength === 'none') {
                          // Try to derive from action_inlet
                          const actionInlet = order.features?.action_inlet;
                          if (actionInlet) {
                            if (actionInlet.toLowerCase().includes('short'))
                              actionLength = 'Short';
                            else if (actionInlet.toLowerCase().includes('long'))
                              actionLength = 'Long';
                          }
                        }

                        // Check if bottom metal contains "adl"
                        const bottomMetal = order.features?.bottom_metal;
                        const showBottomMetal =
                          bottomMetal &&
                          typeof bottomMetal === 'string' &&
                          bottomMetal.toLowerCase().includes('adl');
                        const bottomMetalDisplay = showBottomMetal
                          ? bottomMetal.replace(/_/g, ' ').toUpperCase()
                          : '';

                        return (
                          <TableRow
                            key={order.orderId}
                            className={order.isOverdue ? 'bg-red-50' : ''}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedQueueOrders.has(order.orderId)}
                                onCheckedChange={() =>
                                  handleToggleOrderSelection(order.orderId)
                                }
                              />
                            </TableCell>
                            <TableCell className="font-bold text-center">
                              #{order.queuePosition}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div>
                                  {order.fbOrderNumber || order.orderId}
                                  {order.fbOrderNumber && (
                                    <div className="text-xs text-gray-500">
                                      {order.orderId}
                                    </div>
                                  )}
                                </div>
                                {order.isManualUrgency && (
                                  <Badge className="bg-orange-500 text-white animate-pulse flex items-center gap-1 px-2 py-1 font-bold">
                                    <Zap className="w-3 h-3" />
                                    URGENT!!!
                                  </Badge>
                                )}
                                {hasRushFee(order, 'rush_fee2') && (
                                  <Badge className="bg-purple-600 text-white flex items-center gap-1 px-2 py-1 font-semibold">
                                    EXPEDITE
                                  </Badge>
                                )}
                                {hasRushFee(order, 'rush_fee1') && (
                                  <Badge className="bg-blue-600 text-white flex items-center gap-1 px-2 py-1 font-semibold">
                                    RUSH
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3 text-gray-400" />
                                {order.customerName || order.customerId}
                              </div>
                            </TableCell>
                            <TableCell>{order.modelId}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.stockModelId}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {actionLength && actionLength !== 'none' && (
                                <Badge
                                  variant="secondary"
                                  className="font-medium"
                                >
                                  {actionLength}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {showBottomMetal && (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold">
                                  {bottomMetalDisplay}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                {new Date(order.dueDate).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell
                              className={
                                order.isOverdue
                                  ? 'text-red-600 font-semibold'
                                  : ''
                              }
                            >
                              {order.daysToDue} days
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={getUrgencyBadgeColor(
                                  order.urgencyLevel
                                )}
                              >
                                {order.urgencyLevel.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {order.priorityScore}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => movePriority(index, 'up')}
                                  disabled={
                                    index === 0 ||
                                    updatePrioritiesMutation.isPending
                                  }
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => movePriority(index, 'down')}
                                  disabled={
                                    index === productionQueue.length - 1 ||
                                    updatePrioritiesMutation.isPending
                                  }
                                >
                                  <ArrowDown className="w-3 h-3" />
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
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>

      {/* Week Selection Dialog removed - P1 PO functionality now managed via OEM Priority Settings */}
    </div>
  );
}

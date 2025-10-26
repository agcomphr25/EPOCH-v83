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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  ShoppingCart,
  ChevronDown,
  CalendarCheck,
} from 'lucide-react';
import type { P1POQueueCustomer } from '@shared/schema';
import { LayupSchedulePreview } from './LayupSchedulePreview';

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

  // State for P1 Purchase Orders filter
  const [selectedPOFilter, setSelectedPOFilter] = useState<string>('all');

  // State for P1 Purchase Order item selection (Map of PO number to Set of item IDs)
  const [selectedPOItems, setSelectedPOItems] = useState<Map<string, Set<number>>>(
    new Map()
  );

  // State for layup schedule preview modal
  const [schedulePreviewOpen, setSchedulePreviewOpen] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<{
    scheduledItems: any[];
    overflowItems: any[];
    weekStart: string;
    totalItems: number;
  } | null>(null);

  // Fetch prioritized production queue
  const {
    data: productionQueue = [],
    isLoading,
    refetch,
  } = useQuery<ProductionQueueOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // Fetch open P1 Purchase Orders
  const {
    data: p1PurchaseOrders = [],
    isLoading: isLoadingPOs,
    refetch: refetchPOs,
  } = useQuery<P1POQueueCustomer[]>({
    queryKey: ['/api/p1-po-queue/purchase-orders/open'],
    queryFn: () => apiRequest('/api/p1-po-queue/purchase-orders/open'),
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

  // Progress orders to Barcode mutation
  const progressToBarcodeMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const progressPromises = orderIds.map((orderId) =>
        apiRequest(`/api/orders/${orderId}/progress`, {
          method: 'POST',
          body: { toDepartment: 'Barcode' },
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
        description: `Successfully progressed ${selectedQueueOrders.size} order(s) to Barcode`,
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

  // Generate layup schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: async () => {
      // Prepare selected P1 PO items
      const selectedPOItemsArray: any[] = [];
      p1PurchaseOrders.forEach((customer) => {
        customer.purchaseOrders.forEach((po) => {
          const selectedItems = selectedPOItems.get(po.poNumber);
          if (selectedItems) {
            po.items.forEach((item) => {
              if (selectedItems.has(item.id)) {
                selectedPOItemsArray.push({
                  poNumber: po.poNumber,
                  itemId: item.id,
                  stockModel: item.specifications?.model || '',
                  quantity: item.remainingQuantity,
                });
              }
            });
          }
        });
      });

      return apiRequest('/api/layup-schedule/generate', {
        method: 'POST',
        body: {
          selectedOrderIds: Array.from(selectedQueueOrders),
          selectedPOItems: selectedPOItemsArray,
        },
      });
    },
    onSuccess: (result: any) => {
      setGeneratedSchedule({
        scheduledItems: result.scheduledItems || [],
        overflowItems: result.overflowItems || [],
        weekStart: result.weekStart || '',
        totalItems: result.totalItems || 0,
      });
      setSchedulePreviewOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Schedule Generation Failed',
        description: error.message || 'Failed to generate layup schedule',
        variant: 'destructive',
      });
    },
  });

  // Approve schedule mutation
  const approveScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!generatedSchedule) return;

      const entries = generatedSchedule.scheduledItems.map((item) => ({
        orderId: item.orderId,
        scheduledDate: item.scheduledDate,
        moldId: item.moldId,
        employeeAssignments: [],
      }));

      return apiRequest('/api/layup-schedule/save', {
        method: 'POST',
        body: {
          entries,
          workDays: [1, 2, 3, 4, 5],
          weekStart: generatedSchedule.weekStart,
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Schedule Approved',
        description: `Successfully scheduled ${generatedSchedule?.scheduledItems.length} items`,
      });
      
      // Clear selections
      setSelectedQueueOrders(new Set());
      setSelectedPOItems(new Map());
      setSchedulePreviewOpen(false);
      setGeneratedSchedule(null);
      
      // Refresh queues
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p1-po-queue/purchase-orders/open'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Schedule Approval Failed',
        description: error.message || 'Failed to save layup schedule',
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

  const handleProgressSelectedToBarcode = () => {
    if (selectedQueueOrders.size === 0) return;
    progressToBarcodeMutation.mutate(Array.from(selectedQueueOrders));
  };

  // Handlers for P1 PO item selection
  const handleTogglePOItem = (poNumber: string, itemId: number) => {
    setSelectedPOItems((prev) => {
      const newMap = new Map(prev);
      const itemSet = newMap.get(poNumber) || new Set();
      const newItemSet = new Set(itemSet);
      
      if (newItemSet.has(itemId)) {
        newItemSet.delete(itemId);
      } else {
        newItemSet.add(itemId);
      }
      
      if (newItemSet.size === 0) {
        newMap.delete(poNumber);
      } else {
        newMap.set(poNumber, newItemSet);
      }
      
      return newMap;
    });
  };

  const handleSelectAllPOItems = (poNumber: string, items: any[]) => {
    setSelectedPOItems((prev) => {
      const newMap = new Map(prev);
      const itemSet = newMap.get(poNumber) || new Set();
      const allSelected = items.every((item) => itemSet.has(item.id));
      
      if (allSelected) {
        newMap.delete(poNumber);
      } else {
        newMap.set(poNumber, new Set(items.map((item) => item.id)));
      }
      
      return newMap;
    });
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

  // Calculate total items needing layup
  const totalPOItemsNeedingLayup = p1PurchaseOrders.reduce(
    (total, customer) =>
      total +
      customer.purchaseOrders.reduce(
        (customerTotal, po) =>
          customerTotal + po.totalItems,
        0
      ),
    0
  );

  // Filter and sort purchase orders by selected PO and due date
  const filteredPurchaseOrders = (selectedPOFilter === 'all'
    ? p1PurchaseOrders
    : p1PurchaseOrders.map((customer) => ({
        ...customer,
        purchaseOrders: customer.purchaseOrders.filter(
          (po) => po.poNumber === selectedPOFilter
        ),
      })).filter((customer) => customer.purchaseOrders.length > 0)
  ).map((customer) => ({
    ...customer,
    purchaseOrders: [...customer.purchaseOrders].sort((a, b) => {
      // Sort by due date (expectedDelivery)
      const dateA = a.expectedDelivery ? new Date(a.expectedDelivery).getTime() : Infinity;
      const dateB = b.expectedDelivery ? new Date(b.expectedDelivery).getTime() : Infinity;
      return dateA - dateB;
    }),
  }));

  // Get all unique PO numbers for dropdown
  const allPONumbers = Array.from(
    new Set(
      p1PurchaseOrders.flatMap((customer) =>
        customer.purchaseOrders.map((po) => po.poNumber)
      )
    )
  ).sort();

  if (isLoading || isLoadingAttention || isLoadingPOs) {
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
            onClick={() => {
              refetch();
              refetchPOs();
            }}
            variant="outline"
            disabled={isLoading || isLoadingPOs}
            className="flex items-center gap-2"
            data-testid="button-refresh"
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

      {/* Schedule Selected Items Button */}
      {(selectedQueueOrders.size > 0 || Array.from(selectedPOItems.values()).some(set => set.size > 0)) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">
                {(() => {
                  const regularCount = selectedQueueOrders.size;
                  const poCount = Array.from(selectedPOItems.values()).reduce((sum, set) => sum + set.size, 0);
                  const total = regularCount + poCount;
                  return `${total} Item${total !== 1 ? 's' : ''} Selected`;
                })()}
              </h3>
              <p className="text-sm text-blue-700">
                {selectedQueueOrders.size} from Regular Queue, {' '}
                {Array.from(selectedPOItems.values()).reduce((sum, set) => sum + set.size, 0)} from Purchase Orders
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedQueueOrders(new Set());
                  setSelectedPOItems(new Map());
                }}
                data-testid="button-clear-all-selections"
              >
                Clear All
              </Button>
              <Button
                onClick={() => generateScheduleMutation.mutate()}
                disabled={generateScheduleMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                data-testid="button-generate-schedule"
              >
                <CalendarCheck className="w-4 h-4" />
                {generateScheduleMutation.isPending ? 'Generating...' : 'Generate Layup Schedule'}
              </Button>
            </div>
          </div>
        </div>
      )}

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

        {/* P1 Purchase Orders Queue */}
        <AccordionItem value="purchase-orders">
          <Card>
            <AccordionTrigger 
              className="px-6 py-4 hover:no-underline"
              data-testid="accordion-purchase-orders"
            >
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                  P1 Purchase Orders ({totalPOItemsNeedingLayup} items need layup)
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Open purchase orders with stock items that need to be laid up
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                {/* Action bar for selected items */}
                {(() => {
                  const totalSelected = Array.from(selectedPOItems.values()).reduce(
                    (sum, set) => sum + set.size,
                    0
                  );
                  return totalSelected > 0 ? (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-blue-900">
                          {totalSelected} {totalSelected === 1 ? 'item' : 'items'} selected
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPOItems(new Map())}
                          data-testid="button-clear-selection"
                        >
                          Clear Selection
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                          onClick={() => {
                            toast({
                              title: 'Action Pending',
                              description: `Ready to process ${totalSelected} selected items`,
                            });
                          }}
                          data-testid="button-process-selected"
                        >
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Process Selected Items
                        </Button>
                      </div>
                    </div>
                  ) : null;
                })()}

                {p1PurchaseOrders.length > 0 && (
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 mb-2 block">
                      Filter by PO Number:
                    </label>
                    <Select
                      value={selectedPOFilter}
                      onValueChange={setSelectedPOFilter}
                    >
                      <SelectTrigger className="w-64" data-testid="select-po-filter">
                        <SelectValue placeholder="All Purchase Orders" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Purchase Orders</SelectItem>
                        {allPONumbers.map((poNumber) => (
                          <SelectItem key={poNumber} value={poNumber}>
                            {poNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {filteredPurchaseOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No open purchase orders requiring layup</p>
                    <p className="text-sm">All PO items have been fulfilled</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredPurchaseOrders.map((customer) => (
                      <div
                        key={customer.customerId}
                        className="border rounded-lg p-4 bg-gray-50"
                        data-testid={`customer-section-${customer.customerId}`}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <User className="w-5 h-5 text-gray-600" />
                          <h3 
                            className="text-lg font-semibold text-gray-900"
                            data-testid={`text-customer-name-${customer.customerId}`}
                          >
                            {customer.customerName}
                          </h3>
                          <Badge 
                            variant="outline" 
                            className="ml-2"
                            data-testid={`badge-customer-id-${customer.customerId}`}
                          >
                            {customer.customerId}
                          </Badge>
                        </div>

                        {customer.purchaseOrders.map((po) => (
                          <Collapsible
                            key={po.poNumber}
                            className="mb-4 last:mb-0 bg-white rounded-md shadow-sm"
                            data-testid={`po-section-${po.poNumber}`}
                          >
                            <CollapsibleTrigger className="w-full p-4 hover:bg-gray-50 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                                <Badge 
                                  className="bg-blue-600 text-white font-medium"
                                  data-testid={`badge-po-number-${po.poNumber}`}
                                >
                                  PO: {po.poNumber}
                                </Badge>
                                {po.expectedDelivery && (
                                  <span 
                                    className="text-sm text-gray-500"
                                    data-testid={`text-due-date-${po.poNumber}`}
                                  >
                                    Due: {new Date(po.expectedDelivery).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <Badge 
                                variant="outline"
                                data-testid={`badge-items-total-${po.poNumber}`}
                              >
                                {po.totalItems} {po.totalItems === 1 ? 'item' : 'items'}
                              </Badge>
                            </CollapsibleTrigger>
                            
                            <CollapsibleContent className="p-4 pt-0">
                              {/* Select All Checkbox */}
                              <div className="mb-3 flex items-center gap-2">
                                <Checkbox
                                  id={`select-all-${po.poNumber}`}
                                  checked={
                                    po.items.length > 0 &&
                                    po.items.every((item) => 
                                      (selectedPOItems.get(po.poNumber) || new Set()).has(item.id)
                                    )
                                  }
                                  onCheckedChange={() => handleSelectAllPOItems(po.poNumber, po.items)}
                                  data-testid={`checkbox-select-all-${po.poNumber}`}
                                />
                                <label
                                  htmlFor={`select-all-${po.poNumber}`}
                                  className="text-sm font-medium text-gray-700 cursor-pointer"
                                >
                                  Select All Items
                                  {(selectedPOItems.get(po.poNumber)?.size || 0) > 0 && (
                                    <span className="ml-2 text-blue-600">
                                      ({selectedPOItems.get(po.poNumber)?.size || 0} selected)
                                    </span>
                                  )}
                                </label>
                              </div>

                              <Table data-testid={`table-po-items-${po.poNumber}`}>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-12">Select</TableHead>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead>Stock Model</TableHead>
                                    <TableHead>Action Length</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Handedness</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Notes</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {po.items.map((item) => (
                                    <TableRow
                                      key={item.id}
                                      data-testid={`row-po-item-${item.id}`}
                                    >
                                      <TableCell>
                                        <Checkbox
                                          checked={(selectedPOItems.get(po.poNumber) || new Set()).has(item.id)}
                                          onCheckedChange={() => handleTogglePOItem(po.poNumber, item.id)}
                                          data-testid={`checkbox-po-item-${item.id}`}
                                        />
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {item.productName}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline">
                                          {item.stockModel || '-'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {item.actionLength || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {item.material || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {item.handedness || '-'}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className="bg-orange-500 text-white">
                                          {item.quantity}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge 
                                          variant={
                                            item.status === 'completed' ? 'default' :
                                            item.status === 'pending' ? 'secondary' :
                                            'outline'
                                          }
                                        >
                                          {item.status || 'pending'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                                        {item.notes || '-'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    ))}
                  </div>
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
                        onClick={handleProgressSelectedToBarcode}
                        disabled={progressToBarcodeMutation.isPending}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                        size="sm"
                        data-testid="button-progress-barcode"
                      >
                        <ArrowRight className="h-4 w-4" />
                        Progress to Barcode ({selectedQueueOrders.size})
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
                        <TableHead>LOP / Fill</TableHead>
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

                        // Check for LOP adjustments
                        const lop = order.features?.length_of_pull;
                        const hasLopAdjustment = lop && lop !== 'no_lop_change' && lop.includes('lop_adj_');
                        const lopDisplay = hasLopAdjustment 
                          ? lop.replace('lop_adj_', 'LOP ').replace('_', '.')
                          : '';

                        // Check for heavy fill option
                        const otherOptions = order.features?.other_options || [];
                        const hasHeavyFill = Array.isArray(otherOptions) && otherOptions.includes('heavy_fill');

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
                                  <Badge 
                                    className="bg-purple-600 text-white flex items-center gap-1 px-2 py-1 font-semibold"
                                    title="Expedite - 4 weeks faster ($250)"
                                  >
                                    EXPEDITE
                                  </Badge>
                                )}
                                {hasRushFee(order, 'rush_fee1') && (
                                  <Badge 
                                    className="bg-blue-600 text-white flex items-center gap-1 px-2 py-1 font-semibold"
                                    title="Rush - 2 weeks faster ($200)"
                                  >
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
                              <div className="flex flex-col gap-1">
                                {hasLopAdjustment && (
                                  <Badge className="bg-green-100 text-green-800 border-green-200 font-semibold text-xs">
                                    {lopDisplay}
                                  </Badge>
                                )}
                                {hasHeavyFill && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold text-xs">
                                    HEAVY FILL
                                  </Badge>
                                )}
                              </div>
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

      {/* Layup Schedule Preview Modal */}
      {generatedSchedule && (
        <LayupSchedulePreview
          open={schedulePreviewOpen}
          onClose={() => setSchedulePreviewOpen(false)}
          scheduledItems={generatedSchedule.scheduledItems}
          overflowItems={generatedSchedule.overflowItems}
          weekStart={generatedSchedule.weekStart}
          totalItems={generatedSchedule.totalItems}
          onApprove={() => approveScheduleMutation.mutate()}
          isApproving={approveScheduleMutation.isPending}
        />
      )}
    </div>
  );
}

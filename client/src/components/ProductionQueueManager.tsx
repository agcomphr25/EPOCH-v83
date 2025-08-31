import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
  Package
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
  priorityScore: number;
  queuePosition: number;
  daysToDue: number;
  isOverdue: boolean;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
}

interface POItem {
  id: number;
  poid: number;
  ponumber: string;
  itemname: string;
  stockmodelid: string;
  stockmodelname: string;
  quantity: number;
  unitprice: string;
  totalprice: string;
  customername: string;
  duedate: string;
  priorityScore: number;
  daysToDue: number;
  isOverdue: boolean;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
}

interface WeekSchedule {
  week: number;
  dueDate: string;
  itemsToComplete: number;
  cumulativeItems: number;
}

interface ProductionSchedule {
  success: boolean;
  poNumber: string;
  finalDueDate: string;
  availableWeeks: number;
  totalItemsNeeded: number;
  totalItemsPerWeekRequired: number;
  overallFeasible: boolean;
  itemSchedules: {
    itemId: number;
    itemName: string;
    totalQuantity: number;
    itemsPerWeek: number;
    weeksNeeded: number;
    weeklySchedule: WeekSchedule[];
  }[];
}

export default function ProductionQueueManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State for week selection dialog
  const [selectedPOItem, setSelectedPOItem] = useState<POItem | null>(null);
  const [productionSchedule, setProductionSchedule] = useState<ProductionSchedule | null>(null);
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Fetch prioritized production queue
  const { data: productionQueue = [], isLoading, refetch } = useQuery<ProductionQueueOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // Fetch P1 Purchase Order items ready for production
  const { data: poItems = [], isLoading: isLoadingPOItems, refetch: refetchPOItems } = useQuery<POItem[]>({
    queryKey: ['/api/production-queue/po-items'],
    queryFn: () => apiRequest('/api/production-queue/po-items'),
  });

  // Auto-populate production queue mutation
  const autoPopulateMutation = useMutation({
    mutationFn: () => apiRequest('/api/production-queue/auto-populate', { method: 'POST' }),
    onSuccess: (result: any) => {
      toast({
        title: "Production Queue Updated",
        description: `Successfully auto-populated queue with ${result.ordersProcessed} orders`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Auto-Populate Failed",
        description: error.message || "Failed to auto-populate production queue",
        variant: "destructive",
      });
    }
  });

  // Update priorities mutation
  const updatePrioritiesMutation = useMutation({
    mutationFn: (orders: ProductionQueueOrder[]) => 
      apiRequest('/api/production-queue/update-priorities', {
        method: 'POST',
        body: JSON.stringify({ orders })
      }),
    onSuccess: () => {
      toast({
        title: "Priorities Updated",
        description: "Successfully updated order priorities",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Priority Update Failed",
        description: error.message || "Failed to update priorities",
        variant: "destructive",
      });
    }
  });

  // Fetch production schedule for PO
  const fetchProductionScheduleMutation = useMutation({
    mutationFn: (poId: number) => 
      apiRequest(`/api/pos/${poId}/calculate-production-schedule`, {
        method: 'POST'
      }),
    onSuccess: (result: ProductionSchedule) => {
      setProductionSchedule(result);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Calculate Schedule",
        description: error.message || "Failed to calculate production schedule",
        variant: "destructive",
      });
    }
  });

  // Move selected weeks to layup scheduler mutation
  const moveWeeksToLayupMutation = useMutation({
    mutationFn: ({ poItem, weeks }: { poItem: POItem; weeks: number[] }) => 
      apiRequest('/api/production-queue/po-weeks-to-layup', {
        method: 'POST',
        body: JSON.stringify({ poItem, selectedWeeks: weeks })
      }),
    onSuccess: (result: any) => {
      toast({
        title: "Selected Weeks Moved to Layup",
        description: `Successfully moved ${selectedWeeks.length} weeks to layup scheduler`,
      });
      setIsDialogOpen(false);
      setSelectedPOItem(null);
      setSelectedWeeks([]);
      setProductionSchedule(null);
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/po-items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Move Weeks",
        description: error.message || "Failed to move selected weeks to layup scheduler",
        variant: "destructive",
      });
    }
  });

  const getUrgencyBadgeColor = (urgencyLevel: string) => {
    switch (urgencyLevel) {
      case 'critical': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high': return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'medium': return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      default: return 'bg-green-500 hover:bg-green-600 text-white';
    }
  };

  const handleOpenWeekSelection = async (poItem: POItem) => {
    setSelectedPOItem(poItem);
    setIsDialogOpen(true);
    setSelectedWeeks([]);
    // Fetch production schedule for this PO
    await fetchProductionScheduleMutation.mutateAsync(poItem.poid);
  };

  const handleWeekToggle = (weekNumber: number) => {
    setSelectedWeeks(prev => 
      prev.includes(weekNumber) 
        ? prev.filter(w => w !== weekNumber)
        : [...prev, weekNumber].sort((a, b) => a - b)
    );
  };

  const handleMoveSelectedWeeks = () => {
    if (selectedPOItem && selectedWeeks.length > 0) {
      moveWeeksToLayupMutation.mutate({
        poItem: selectedPOItem,
        weeks: selectedWeeks
      });
    }
  };

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const newQueue = [...productionQueue];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newQueue.length) return;
    
    // Swap orders
    [newQueue[index], newQueue[targetIndex]] = [newQueue[targetIndex], newQueue[index]];
    
    // Update priority scores and queue positions
    const updatedOrders = newQueue.map((order, idx) => ({
      ...order,
      queuePosition: idx + 1,
      priorityScore: 1000 - idx // Higher position = higher score
    }));

    updatePrioritiesMutation.mutate(updatedOrders);
  };

  if (isLoading || isLoadingPOItems) {
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
          <h1 className="text-2xl font-bold text-gray-900">Production Queue Manager</h1>
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

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-xl font-bold">
                  {productionQueue.filter(o => o.urgencyLevel === 'critical').length}
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
                  {productionQueue.filter(o => o.urgencyLevel === 'high').length}
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
                  {productionQueue.filter(o => o.urgencyLevel === 'normal').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P1 Purchase Order Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-600" />
            P1 Purchase Order Queue
          </CardTitle>
          <p className="text-sm text-gray-500">
            Priority queue for purchase order items - these will be scheduled first
          </p>
        </CardHeader>
        <CardContent>
          {poItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No PO items ready for production</p>
              <p className="text-sm">PO items with quantities will appear here for scheduling</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO #</TableHead>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Stock Model</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days to Due</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {poItems.map((item) => (
                  <TableRow key={item.id} className={item.isOverdue ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">
                      {item.ponumber}
                    </TableCell>
                    <TableCell>{item.itemname}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-gray-400" />
                        {item.customername}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.stockmodelname}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-blue-600">
                      {item.quantity} units
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {new Date(item.dueDate).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className={item.isOverdue ? 'text-red-600 font-semibold' : ''}>
                      {item.daysToDue} days
                    </TableCell>
                    <TableCell>
                      <Badge className={getUrgencyBadgeColor(item.urgencyLevel)}>
                        {item.urgencyLevel.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleOpenWeekSelection(item)}
                        disabled={fetchProductionScheduleMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <Calendar className="w-4 h-4 mr-1" />
                        Select Weeks
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Regular Production Queue
          </CardTitle>
          <p className="text-sm text-gray-500">
            Ready for layup orders - these will fill remaining schedule slots
          </p>
        </CardHeader>
        <CardContent>
          {productionQueue.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No orders in production queue</p>
              <p className="text-sm">Use Auto-Populate to add eligible orders</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Priority</TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Stock Model</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days to Due</TableHead>
                  <TableHead>Urgency</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productionQueue.map((order, index) => (
                  <TableRow key={order.orderId} className={order.isOverdue ? 'bg-red-50' : ''}>
                    <TableCell className="font-bold text-center">
                      #{order.queuePosition}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>
                        {order.fbOrderNumber || order.orderId}
                        {order.fbOrderNumber && (
                          <div className="text-xs text-gray-500">{order.orderId}</div>
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
                      <Badge variant="outline">{order.stockModelId}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        {new Date(order.dueDate).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className={order.isOverdue ? 'text-red-600 font-semibold' : ''}>
                      {order.daysToDue} days
                    </TableCell>
                    <TableCell>
                      <Badge className={getUrgencyBadgeColor(order.urgencyLevel)}>
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
                          disabled={index === 0 || updatePrioritiesMutation.isPending}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => movePriority(index, 'down')}
                          disabled={index === productionQueue.length - 1 || updatePrioritiesMutation.isPending}
                        >
                          <ArrowDown className="w-3 h-3" />
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

      {/* Week Selection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Weeks for Production Schedule</DialogTitle>
          </DialogHeader>
          
          {selectedPOItem && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg">{selectedPOItem.itemname}</h4>
                <p className="text-sm text-gray-600">PO #{selectedPOItem.ponumber} - {selectedPOItem.quantity} units</p>
                <p className="text-sm text-gray-600">Customer: {selectedPOItem.customername}</p>
              </div>

              {fetchProductionScheduleMutation.isPending && (
                <div className="text-center py-4">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p>Calculating production schedule...</p>
                </div>
              )}

              {productionSchedule && productionSchedule.itemSchedules.length > 0 && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    <p>Total weeks needed: {productionSchedule.itemSchedules[0].weeksNeeded}</p>
                    <p>Items per week: {productionSchedule.itemSchedules[0].itemsPerWeek}</p>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-medium">Select weeks to move to layup scheduler:</h5>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                      {productionSchedule.itemSchedules[0].weeklySchedule.map((week) => (
                        <div
                          key={week.week}
                          className="flex items-center space-x-2 p-2 border rounded-lg hover:bg-gray-50"
                        >
                          <Checkbox
                            id={`week-${week.week}`}
                            checked={selectedWeeks.includes(week.week)}
                            onCheckedChange={() => handleWeekToggle(week.week)}
                          />
                          <label
                            htmlFor={`week-${week.week}`}
                            className="text-sm cursor-pointer flex-1"
                          >
                            <div className="font-medium">Week {week.week}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(week.dueDate).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-blue-600">
                              {week.itemsToComplete} units
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedWeeks.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-blue-800">
                        Selected: {selectedWeeks.length} weeks
                      </p>
                      <p className="text-xs text-blue-600">
                        Total units: {selectedWeeks.reduce((total, weekNum) => {
                          const week = productionSchedule.itemSchedules[0].weeklySchedule.find(w => w.week === weekNum);
                          return total + (week?.itemsToComplete || 0);
                        }, 0)}
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button
                      onClick={handleMoveSelectedWeeks}
                      disabled={selectedWeeks.length === 0 || moveWeeksToLayupMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {moveWeeksToLayupMutation.isPending ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                          Moving...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4 mr-2" />
                          Move Selected to Layup
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      disabled={moveWeeksToLayupMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  Trash2,
  Printer,
  Search,
  Check,
} from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import PrintableWeeklySchedule from '@/components/PrintableWeeklySchedule';

interface Order {
  orderId: string;
  fbOrderNumber: string;
  customerName: string;
  stockModelId: string;
  modelId: string;
  dueDate: string;
  features?: {
    action_length?: string;
    lop?: number;
    adl?: string;
    heavy_fill?: boolean;
    [key: string]: any;
  };
}

interface POProduct {
  id: number;
  customerName: string;
  productName: string;
  stockModel: string;
  material: string;
  actionLength: string;
  quantity: number;
  poNumber?: string;
  dueDate?: string;
}

interface POGroup {
  customer: string;
  poNumber: string;
  items: POProduct[];
  totalQuantity: number;
  earliestDueDate?: string;
}

interface DaySchedule {
  dayOfWeek: string;
  date: string;
  moldsUsed: number;
  moldsAvailable: number;
  assignments: any[];
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function WeeklyLayupScheduler() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [weekStartDate, setWeekStartDate] = useState<string>(() => {
    const today = new Date();
    const monday = startOfWeek(today, { weekStartsOn: 1 });
    return format(monday, 'yyyy-MM-dd');
  });

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [selectedPOProducts, setSelectedPOProducts] = useState<Set<number>>(new Set());
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [moldCountInput, setMoldCountInput] = useState<string>('1');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Fetch regular production orders
  const { data: regularOrders = [], isLoading: isLoadingOrders, error: ordersError } = useQuery<Order[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
    retry: 1,
    staleTime: 30000,
  });

  // Fetch P1 PO products (grouped by customer/PO)
  const { data: poProductGroups = [], isLoading: isLoadingPO } = useQuery<POGroup[]>({
    queryKey: ['/api/p1-po-queue'],
  });

  // Helper function to format material type display
  const formatMaterialType = (modelId: string, stockModelId: string, actionLength?: string) => {
    const parts: string[] = [];
    
    // Material prefix
    if (modelId.startsWith('cf_') || stockModelId.includes('cf_')) {
      parts.push('CF');
    } else if (modelId.startsWith('ag_') || stockModelId.includes('ag_')) {
      parts.push('AG');
    }
    
    // Action length
    if (actionLength === 'short') {
      parts.push('SA');
    } else if (actionLength === 'long') {
      parts.push('LA');
    }
    
    // Check for adjustable in model name
    if (modelId.includes('adj') || stockModelId.includes('adj')) {
      parts.push('Adj.');
    }
    
    // Extract model name
    const modelName = stockModelId
      .replace(/^(cf_|ag_)/, '')
      .replace(/_adj/, '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    parts.push(modelName);
    
    return parts.join(' ');
  };

  // Fetch weekly schedule
  const { data: weeklySchedule = [], isLoading: isLoadingSchedule } = useQuery<any[]>({
    queryKey: [`/api/weekly-schedule/${weekStartDate}`],
  });

  // Fetch mold availability
  const { data: moldAvailability } = useQuery<{ totalCapacity: number; used: number }>({
    queryKey: ['/api/p1-po-queue/mold-availability'],
  });

  // Fetch all molds for display
  const { data: allMolds = [] } = useQuery<any[]>({
    queryKey: ['/api/molds'],
  });

  // Build day schedules
  const daySchedules: DaySchedule[] = useMemo(() => {
    return DAYS_OF_WEEK.map((day, index) => {
      const date = format(addDays(new Date(weekStartDate), index), 'yyyy-MM-dd');
      const dayAssignments = weeklySchedule.filter((a: any) => a.dayOfWeek === day);
      const moldsUsed = dayAssignments.reduce((sum: number, a: any) => sum + (a.moldCount || 0), 0);
      
      return {
        dayOfWeek: day,
        date,
        moldsUsed,
        moldsAvailable: (moldAvailability?.totalCapacity || 0) - moldsUsed,
        assignments: dayAssignments,
      };
    });
  }, [weekStartDate, weeklySchedule, moldAvailability]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return regularOrders;
    const query = searchQuery.toLowerCase();
    return regularOrders.filter(
      (order: Order) =>
        order.orderId.toLowerCase().includes(query) ||
        order.fbOrderNumber?.toLowerCase().includes(query) ||
        order.customerName?.toLowerCase().includes(query) ||
        order.stockModelId?.toLowerCase().includes(query)
    );
  }, [regularOrders, searchQuery]);

  const filteredPOGroups = useMemo(() => {
    if (!searchQuery.trim()) return poProductGroups;
    const query = searchQuery.toLowerCase();
    return poProductGroups.filter(
      (group: POGroup) =>
        group.customer.toLowerCase().includes(query) ||
        group.poNumber?.toLowerCase().includes(query) ||
        group.items.some(item => item.productName.toLowerCase().includes(query))
    );
  }, [poProductGroups, searchQuery]);

  // Get available molds for a stock model
  const getAvailableMolds = (stockModel: string) => {
    return allMolds.filter((mold: any) => 
      mold.stockModels?.includes(stockModel) && mold.enabled
    );
  };

  // Get available molds count for a specific day
  const getAvailableMoldsForDay = (dayOfWeek: string) => {
    const dayAssignments = weeklySchedule.filter((a: any) => a.dayOfWeek === dayOfWeek);
    const totalMoldsUsed = dayAssignments.reduce((sum: number, a: any) => sum + (a.moldCount || 0), 0);
    const totalCapacity = moldAvailability?.totalCapacity || 74;
    const availableCount = totalCapacity - totalMoldsUsed;
    
    // Return the first N available molds where N = available count
    return allMolds.filter((mold: any) => mold.enabled).slice(0, Math.max(0, availableCount));
  };

  // Toggle selection handlers
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const togglePOProductSelection = (id: number) => {
    setSelectedPOProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Assign to day mutation
  const assignMutation = useMutation({
    mutationFn: async (assignments: any[]) => {
      return await apiRequest('/api/weekly-schedule/batch', {
        method: 'POST',
        body: JSON.stringify({ assignments }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Items assigned to schedule',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/weekly-schedule/${weekStartDate}`] });
      setSelectedOrders(new Set());
      setSelectedPOProducts(new Set());
      setIsAssignDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign items',
        variant: 'destructive',
      });
    },
  });

  // Handle assign to day
  const handleAssignToDay = (day: string) => {
    setSelectedDay(day);
    setMoldCountInput('1');
    setIsAssignDialogOpen(true);
  };

  const confirmAssignment = () => {
    const moldCount = parseInt(moldCountInput) || 1;
    
    const assignments = [
      ...Array.from(selectedOrders).map(orderId => ({
        weekStartDate,
        dayOfWeek: selectedDay,
        itemType: 'order',
        orderId,
        moldCount,
      })),
      ...Array.from(selectedPOProducts).map(poProductId => ({
        weekStartDate,
        dayOfWeek: selectedDay,
        itemType: 'po_product',
        poProductId,
        moldCount,
      })),
    ];

    assignMutation.mutate(assignments);
  };

  // Delete assignment mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/weekly-schedule/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Removed',
        description: 'Assignment removed from schedule',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/weekly-schedule/${weekStartDate}`] });
    },
  });

  // Progress to barcode mutation
  const progressToBarcod = useMutation({
    mutationFn: async (orderIds: string[]) => {
      // Progress selected orders to barcode department
      return await apiRequest('/api/orders/progress-batch', {
        method: 'POST',
        body: JSON.stringify({ orderIds, department: 'barcode' }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Orders progressed to Barcode',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      queryClient.invalidateQueries({ queryKey: [`/api/weekly-schedule/${weekStartDate}`] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to progress orders',
        variant: 'destructive',
      });
    },
  });

  const handleProgressScheduledOrders = () => {
    // Get all order IDs from this week's schedule
    const orderIds = weeklySchedule
      .filter((a: any) => a.itemType === 'order' && a.orderId)
      .map((a: any) => a.orderId);
    
    if (orderIds.length === 0) {
      toast({
        title: 'No Orders',
        description: 'No orders scheduled for this week',
        variant: 'destructive',
      });
      return;
    }

    progressToBarcod.mutate(orderIds);
  };

  const isLoading = isLoadingOrders || isLoadingPO || isLoadingSchedule;

  // Show error if orders failed to load
  if (ordersError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600">Error loading orders</p>
          <p className="text-sm text-gray-500">{(ordersError as any).message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading scheduler...</p>
          <p className="mt-2 text-xs text-gray-500">
            Orders: {isLoadingOrders ? 'loading...' : 'ready'} | 
            PO: {isLoadingPO ? 'loading...' : 'ready'} | 
            Schedule: {isLoadingSchedule ? 'loading...' : 'ready'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Weekly Layup Scheduler</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Plan and schedule layup production for the week
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <div>
            <label className="text-sm font-medium">Week Starting:</label>
            <Input
              type="date"
              value={weekStartDate}
              onChange={(e) => setWeekStartDate(e.target.value)}
              className="mt-1"
              data-testid="input-week-start"
            />
          </div>
          <Button 
            variant="outline" 
            onClick={() => setShowPrintPreview(true)}
            data-testid="button-print-schedule"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Schedule
          </Button>
          <Button 
            onClick={handleProgressScheduledOrders}
            disabled={progressToBarcod.isPending || weeklySchedule.length === 0}
            data-testid="button-progress-to-barcode"
          >
            <Check className="h-4 w-4 mr-2" />
            Progress to Barcode
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Available Orders Sidebar */}
        <div className="col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Orders</CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-orders"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-400px)] overflow-y-auto">
                <Accordion type="multiple" defaultValue={['regular', 'po']} className="w-full">
                  {/* Regular Orders Accordion */}
                  <AccordionItem value="regular">
                    <AccordionTrigger className="px-4 py-2 hover:no-underline">
                      <div className="flex justify-between w-full pr-4">
                        <span className="font-medium">Regular Orders</span>
                        <Badge variant="secondary">{filteredOrders.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      {filteredOrders.slice(0, 100).map((order: Order) => {
                        const materialType = formatMaterialType(order.modelId, order.stockModelId, order.features?.action_length);
                        return (
                          <div
                            key={order.orderId}
                            onClick={() => toggleOrderSelection(order.orderId)}
                            className={`p-3 mb-2 rounded border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                              selectedOrders.has(order.orderId)
                                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                                : 'border-gray-200 dark:border-gray-700'
                            }`}
                            data-testid={`order-${order.orderId}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-bold text-lg">{order.orderId}</div>
                              {order.dueDate && (
                                <div className="text-xs text-gray-500">Due: {format(new Date(order.dueDate), 'MMM dd')}</div>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <div className="font-semibold text-base text-gray-900 dark:text-gray-100">
                                {materialType}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {order.features?.adl && order.features.adl !== 'N/A' && (
                                  <Badge variant="default" className="text-xs">ADL: {order.features.adl}</Badge>
                                )}
                                {order.features?.lop && order.features.lop > 0 && (
                                  <Badge variant="secondary" className="text-xs">LOP: {order.features.lop}"</Badge>
                                )}
                                {order.features?.heavy_fill && (
                                  <Badge variant="destructive" className="text-xs">Heavy Fill</Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">{order.customerName}</div>
                            </div>
                          </div>
                        );
                      })}
                    </AccordionContent>
                  </AccordionItem>

                  {/* P1 PO Products Accordion */}
                  <AccordionItem value="po">
                    <AccordionTrigger className="px-4 py-2 hover:no-underline">
                      <div className="flex justify-between w-full pr-4">
                        <span className="font-medium">P1 PO Orders</span>
                        <Badge variant="secondary">{filteredPOGroups.length}</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4 space-y-2">
                      {filteredPOGroups.slice(0, 100).map((group: POGroup) => (
                        <div key={`${group.customer}-${group.poNumber}`} className="border rounded">
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`${group.customer}-${group.poNumber}`} className="border-0">
                              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                                <div className="flex justify-between w-full pr-4 text-left">
                                  <div>
                                    <div className="font-semibold text-base">{group.customer}</div>
                                    <div className="text-xs text-gray-500">
                                      {group.poNumber !== 'NO_PO' ? `PO: ${group.poNumber}` : 'No PO'} • {group.totalQuantity} item{group.totalQuantity !== 1 ? 's' : ''}
                                    </div>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-3 pb-2 space-y-2">
                                {/* Select All PO Button */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const allSelected = group.items.every(item => selectedPOProducts.has(item.id));
                                    setSelectedPOProducts(prev => {
                                      const newSet = new Set(prev);
                                      if (allSelected) {
                                        group.items.forEach(item => newSet.delete(item.id));
                                      } else {
                                        group.items.forEach(item => newSet.add(item.id));
                                      }
                                      return newSet;
                                    });
                                  }}
                                  data-testid={`button-select-all-${group.customer}-${group.poNumber}`}
                                >
                                  {group.items.every(item => selectedPOProducts.has(item.id)) ? 'Deselect' : 'Select'} All PO
                                </Button>
                                
                                {/* Individual Items */}
                                {group.items.map((item: POProduct) => {
                                  const materialDisplay = `${item.material === 'carbon_fiber' ? 'CF' : 'AG'} ${item.actionLength === 'long' ? 'LA' : 'SA'} ${item.stockModel.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`;
                                  return (
                                    <div
                                      key={item.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        togglePOProductSelection(item.id);
                                      }}
                                      className={`p-2 rounded border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                                        selectedPOProducts.has(item.id)
                                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                                          : 'border-gray-200 dark:border-gray-700'
                                      }`}
                                      data-testid={`po-item-${item.id}`}
                                    >
                                      <div className="flex justify-between items-center">
                                        <div className="flex-1">
                                          <div className="font-medium text-sm">{materialDisplay}</div>
                                          <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>

              {(selectedOrders.size > 0 || selectedPOProducts.size > 0) && (
                <div className="p-4 border-t bg-blue-50 dark:bg-blue-900/20">
                  <div className="text-sm font-medium mb-2">
                    Selected: {selectedOrders.size + selectedPOProducts.size} items
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {DAYS_OF_WEEK.map((day) => (
                      <Button
                        key={day}
                        size="sm"
                        variant="outline"
                        onClick={() => handleAssignToDay(day)}
                        data-testid={`button-assign-${day.toLowerCase()}`}
                      >
                        {day.substring(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Schedule Grid */}
        <div className="col-span-8">
          <div className="grid grid-cols-5 gap-4">
            {daySchedules.map((daySchedule) => (
              <Card key={daySchedule.dayOfWeek}>
                <CardHeader className="pb-3">
                  <div>
                    <div className="font-bold">{daySchedule.dayOfWeek}</div>
                    <div className="text-xs text-gray-500">
                      {format(new Date(daySchedule.date), 'MMM dd')}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-2">
                  <Accordion type="single" collapsible className="mb-2">
                    <AccordionItem value="available-molds" className="border-0">
                      <AccordionTrigger className="py-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:no-underline">
                        Available Molds ({getAvailableMoldsForDay(daySchedule.dayOfWeek).length})
                      </AccordionTrigger>
                      <AccordionContent className="pb-2">
                        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                          {getAvailableMoldsForDay(daySchedule.dayOfWeek).map((mold: any) => (
                            <Badge key={mold.id} variant="outline" className="text-xs">
                              {mold.moldId}
                            </Badge>
                          ))}
                          {getAvailableMoldsForDay(daySchedule.dayOfWeek).length === 0 && (
                            <span className="text-xs text-gray-400">All molds in use</span>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <div className="space-y-2 max-h-[calc(100vh-450px)] overflow-y-auto">
                    {daySchedule.assignments.map((assignment: any) => {
                      const details = assignment.orderDetails || assignment.poProductDetails;
                      const availableMolds = details?.stockModel ? getAvailableMolds(details.stockModel) : [];
                      
                      return (
                        <div
                          key={assignment.id}
                          className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs"
                        >
                          <div className="flex justify-between items-start mb-1">
                            <div className="font-semibold text-sm">
                              {assignment.itemType === 'order'
                                ? assignment.orderId
                                : `PO: ${details?.poNumber}`}
                            </div>
                            <button
                              onClick={() => deleteMutation.mutate(assignment.id)}
                              className="text-red-600 hover:text-red-800"
                              data-testid={`button-delete-${assignment.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="font-medium text-sm">{details?.stockModel}</div>
                            <div className="text-gray-700 dark:text-gray-300">{details?.material}</div>
                            <div className="text-gray-500">Count: {assignment.moldCount}</div>
                            {details?.lop > 0 && <div className="text-gray-600">LOP: {details.lop}"</div>}
                            {details?.adl && details.adl !== 'N/A' && <div className="text-gray-600">ADL: {details.adl}</div>}
                            {details?.heavyFill && (
                              <Badge variant="destructive" className="text-xs mt-1">Heavy Fill</Badge>
                            )}
                            {availableMolds.length > 0 && (
                              <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                                <div className="text-xs font-medium mb-1">Available Molds:</div>
                                <div className="flex flex-wrap gap-1">
                                  {availableMolds.map((mold: any) => (
                                    <span key={mold.id} className="text-xs bg-white dark:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600">
                                      {mold.moldId}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {daySchedule.assignments.length === 0 && (
                      <div className="text-center text-gray-400 py-8 text-xs">
                        No assignments
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Print Preview Dialog */}
      <Dialog open={showPrintPreview} onOpenChange={setShowPrintPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Print Weekly Schedule</DialogTitle>
          </DialogHeader>
          <PrintableWeeklySchedule 
            weekStartDate={weekStartDate}
            daySchedules={daySchedules}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPrintPreview(false)}>
              Close
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to {selectedDay}</DialogTitle>
            <DialogDescription>
              Assigning {selectedOrders.size + selectedPOProducts.size} items to {selectedDay}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium">Mold Count per Item:</label>
            <Input
              type="number"
              min="1"
              value={moldCountInput}
              onChange={(e) => setMoldCountInput(e.target.value)}
              className="mt-1"
              data-testid="input-mold-count"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAssignment} disabled={assignMutation.isPending}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

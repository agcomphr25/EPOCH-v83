import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar,
  Plus,
  Trash2,
  Printer,
  Search,
  Package,
} from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import PrintableWeeklySchedule from '@/components/PrintableWeeklySchedule';

interface Order {
  id: number;
  orderId: string;
  fbOrderNumber: string;
  customerName: string;
  stockModel: string;
  material: string;
  actionLength: string;
  shankLength: string;
  lop: number;
  adl: string;
  heavyFill: boolean;
  dueDate: string;
}

interface POProduct {
  id: number;
  customerName: string;
  productName: string;
  poNumber: string;
  stockModel: string;
  material: string;
  actionLength: string;
  dueDate: string;
  quantity: number;
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
  const { data: regularOrders = [], isLoading: isLoadingOrders } = useQuery<Order[]>({
    queryKey: ['/api/production-queue/prioritized'],
  });

  // Fetch P1 PO products (grouped by customer/PO)
  const { data: poProductGroups = [], isLoading: isLoadingPO } = useQuery<any[]>({
    queryKey: ['/api/p1-po-queue'],
  });

  // Flatten the grouped PO products into a single array
  const poProducts: POProduct[] = poProductGroups.flatMap(group => group.items || []);

  // Fetch weekly schedule
  const { data: weeklySchedule = [], isLoading: isLoadingSchedule } = useQuery<any[]>({
    queryKey: [`/api/weekly-schedule/${weekStartDate}`],
  });

  // Fetch mold availability
  const { data: moldAvailability } = useQuery({
    queryKey: ['/api/p1-po-queue/mold-availability'],
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

  // Filter orders and PO products
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return regularOrders;
    const query = searchQuery.toLowerCase();
    return regularOrders.filter(
      (order: Order) =>
        order.orderId.toLowerCase().includes(query) ||
        order.fbOrderNumber?.toLowerCase().includes(query) ||
        order.customerName?.toLowerCase().includes(query)
    );
  }, [regularOrders, searchQuery]);

  const filteredPOProducts = useMemo(() => {
    if (!searchQuery.trim()) return poProducts;
    const query = searchQuery.toLowerCase();
    return poProducts.filter(
      (po: POProduct) =>
        po.customerName.toLowerCase().includes(query) ||
        po.poNumber?.toLowerCase().includes(query) ||
        po.productName.toLowerCase().includes(query)
    );
  }, [poProducts, searchQuery]);

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

  const isLoading = isLoadingOrders || isLoadingPO || isLoadingSchedule;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading scheduler...</p>
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
                {/* Regular Orders */}
                <div className="p-4 border-b">
                  <h3 className="font-medium text-sm text-gray-600 mb-2">Regular Orders ({filteredOrders.length})</h3>
                  {filteredOrders.slice(0, 50).map((order: Order) => (
                    <div
                      key={order.orderId}
                      onClick={() => toggleOrderSelection(order.orderId)}
                      className={`p-3 mb-2 rounded border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        selectedOrders.has(order.orderId)
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                          : ''
                      }`}
                      data-testid={`order-${order.orderId}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{order.orderId}</div>
                          <div className="text-sm text-gray-600">{order.stockModel}</div>
                          <div className="text-xs text-gray-500">{order.customerName}</div>
                        </div>
                        <Badge variant="secondary">{order.material}</Badge>
                      </div>
                    </div>
                  ))}
                </div>

                {/* P1 PO Products */}
                <div className="p-4">
                  <h3 className="font-medium text-sm text-gray-600 mb-2">P1 PO Items ({filteredPOProducts.length})</h3>
                  {filteredPOProducts.slice(0, 50).map((po: POProduct) => (
                    <div
                      key={po.id}
                      onClick={() => togglePOProductSelection(po.id)}
                      className={`p-3 mb-2 rounded border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        selectedPOProducts.has(po.id)
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
                          : ''
                      }`}
                      data-testid={`po-${po.id}`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{po.productName}</div>
                          <div className="text-sm text-gray-600">PO: {po.poNumber}</div>
                          <div className="text-xs text-gray-500">{po.customerName}</div>
                        </div>
                        <Badge variant="outline">Qty: {po.quantity}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
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
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span>Molds:</span>
                    <Badge variant={daySchedule.moldsAvailable < 0 ? 'destructive' : 'secondary'}>
                      {daySchedule.moldsUsed} / {moldAvailability?.totalCapacity || 0}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-2">
                  <div className="space-y-2 max-h-[calc(100vh-350px)] overflow-y-auto">
                    {daySchedule.assignments.map((assignment: any) => (
                      <div
                        key={assignment.id}
                        className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-medium">
                            {assignment.itemType === 'order'
                              ? assignment.orderId
                              : assignment.poProductDetails?.productName}
                          </div>
                          <button
                            onClick={() => deleteMutation.mutate(assignment.id)}
                            className="text-red-600 hover:text-red-800"
                            data-testid={`button-delete-${assignment.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          Molds: {assignment.moldCount}
                        </div>
                      </div>
                    ))}
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

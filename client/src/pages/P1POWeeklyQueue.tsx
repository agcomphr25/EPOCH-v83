import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Package, Clock, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { format, addWeeks, startOfWeek, isAfter, isBefore, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface P1POWeeklySchedule {
  id: string;
  poId: number;
  poNumber: string;
  customerName: string;
  weekStartDate: string;
  weekEndDate: string;
  items: {
    orderId: string;
    itemType: string;
    stockModelId?: string;
    quantity: number;
    specifications: any;
    estimatedHours: number;
  }[];
  totalHours: number;
  totalItems: number;
  isActive: boolean;
  isScheduled: boolean;
  scheduledDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface PurchaseOrder {
  id: number;
  poNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  expectedDelivery: string;
  createdAt: string;
}

export default function P1POWeeklyQueue() {
  const [selectedPO, setSelectedPO] = useState<number | null>(null);
  const [viewWeeks, setViewWeeks] = useState(12); // Show 12 weeks by default
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch all purchase orders
  const { data: purchaseOrders = [], isLoading: poisLoading } = useQuery({
    queryKey: ['/api/pos'],
    queryFn: () => apiRequest('/api/pos')
  });

  // Fetch weekly schedules for selected PO
  const { data: weeklySchedules = [], isLoading: schedulesLoading } = useQuery({
    queryKey: [`/api/p1po-weekly-schedules/${selectedPO}`],
    queryFn: () => selectedPO ? apiRequest(`/api/p1po-weekly-schedules/${selectedPO}`) : [],
    enabled: !!selectedPO
  });

  // Calculate schedule mutation
  const calculateScheduleMutation = useMutation({
    mutationFn: (poId: number) => apiRequest(`/api/pos/${poId}/calculate-weekly-schedule`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/p1po-weekly-schedules/${selectedPO}`] });
      toast({
        title: "Schedule Calculated",
        description: "Weekly schedule has been calculated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to calculate weekly schedule.",
        variant: "destructive",
      });
    }
  });

  // Toggle week active status mutation
  const toggleWeekMutation = useMutation({
    mutationFn: ({ scheduleId, isActive }: { scheduleId: string; isActive: boolean }) =>
      apiRequest(`/api/p1po-weekly-schedules/${scheduleId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/p1po-weekly-schedules/${selectedPO}`] });
      toast({
        title: "Week Updated",
        description: "Week schedule status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to update week status.",
        variant: "destructive",
      });
    }
  });

  // Generate weekly schedule view
  const weeklyScheduleView = useMemo(() => {
    const startDate = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday start
    const weeks = [];
    
    for (let i = 0; i < viewWeeks; i++) {
      const weekStart = addWeeks(startDate, i);
      const weekEnd = addWeeks(weekStart, 1);
      
      // Find schedule for this week
      const schedule = weeklySchedules.find((s: P1POWeeklySchedule) => 
        format(parseISO(s.weekStartDate), 'yyyy-MM-dd') === format(weekStart, 'yyyy-MM-dd')
      );
      
      weeks.push({
        weekStart,
        weekEnd,
        schedule,
        weekNumber: i + 1
      });
    }
    
    return weeks;
  }, [weeklySchedules, viewWeeks]);

  const handleCalculateSchedule = () => {
    if (selectedPO) {
      calculateScheduleMutation.mutate(selectedPO);
    }
  };

  const handleToggleWeek = (scheduleId: string, currentStatus: boolean) => {
    toggleWeekMutation.mutate({
      scheduleId,
      isActive: !currentStatus
    });
  };

  const activePO = purchaseOrders.find((po: PurchaseOrder) => po.id === selectedPO);
  const totalActiveWeeks = weeklySchedules.filter((s: P1POWeeklySchedule) => s.isActive).length;
  const totalScheduledHours = weeklySchedules
    .filter((s: P1POWeeklySchedule) => s.isActive)
    .reduce((sum: number, s: P1POWeeklySchedule) => sum + s.totalHours, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">P1 Purchase Order Weekly Queue</h1>
        <div className="flex items-center gap-4">
          <Select value={viewWeeks.toString()} onValueChange={(value) => setViewWeeks(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="8">8 weeks</SelectItem>
              <SelectItem value="12">12 weeks</SelectItem>
              <SelectItem value="16">16 weeks</SelectItem>
              <SelectItem value="24">24 weeks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Purchase Order Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Select Purchase Order
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {poisLoading ? (
              <div className="col-span-full text-center py-8">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading purchase orders...
              </div>
            ) : (
              purchaseOrders.map((po: PurchaseOrder) => (
                <Card 
                  key={po.id} 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedPO === po.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedPO(po.id)}
                >
                  <CardContent className="p-4">
                    <div className="font-semibold">{po.poNumber}</div>
                    <div className="text-sm text-gray-600">{po.customerName}</div>
                    <div className="flex justify-between items-center mt-2">
                      <Badge variant={po.status === 'OPEN' ? 'default' : 'secondary'}>
                        {po.status}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        Due: {format(parseISO(po.expectedDelivery), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selected PO Summary & Controls */}
      {selectedPO && activePO && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {activePO.poNumber} - Weekly Schedule Management
              </CardTitle>
              <div className="flex gap-2">
                <Button 
                  onClick={handleCalculateSchedule}
                  disabled={calculateScheduleMutation.isPending}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${calculateScheduleMutation.isPending ? 'animate-spin' : ''}`} />
                  {calculateScheduleMutation.isPending ? 'Calculating...' : 'Calculate Schedule'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{totalActiveWeeks}</div>
                <div className="text-sm text-gray-600">Active Weeks</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{totalScheduledHours.toFixed(1)}</div>
                <div className="text-sm text-gray-600">Total Hours</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {weeklySchedules.reduce((sum: number, s: P1POWeeklySchedule) => sum + s.totalItems, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Items</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Schedule Grid */}
      {selectedPO && (
        <Card>
          <CardHeader>
            <CardTitle>Weekly Schedule View</CardTitle>
          </CardHeader>
          <CardContent>
            {schedulesLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                Loading schedules...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {weeklyScheduleView.map(({ weekStart, schedule, weekNumber }) => (
                  <Card 
                    key={format(weekStart, 'yyyy-MM-dd')}
                    className={`${schedule?.isActive ? 'bg-green-50 border-green-200' : 'bg-gray-50'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">Week {weekNumber}</div>
                        {schedule && (
                          <Checkbox
                            checked={schedule.isActive}
                            onCheckedChange={() => handleToggleWeek(schedule.id, schedule.isActive)}
                            disabled={toggleWeekMutation.isPending}
                          />
                        )}
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        {format(weekStart, 'MMM dd')} - {format(addWeeks(weekStart, 1), 'MMM dd, yyyy')}
                      </div>

                      {schedule ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-500" />
                            <span className="text-sm font-medium">{schedule.totalHours.toFixed(1)}h</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-green-500" />
                            <span className="text-sm">{schedule.totalItems} items</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {schedule.isActive ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="text-xs text-gray-500">
                              {schedule.isActive ? 'Active in Queue' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400 text-sm py-4">
                          No schedule calculated
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
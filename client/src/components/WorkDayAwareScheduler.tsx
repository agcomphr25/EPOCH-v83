import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Settings, Save, RefreshCw, Clock, AlertTriangle } from 'lucide-react';

interface WorkDayAwareSchedulerProps {
  onScheduleGenerated?: (schedule: any) => void;
}

export default function WorkDayAwareScheduler({ onScheduleGenerated }: WorkDayAwareSchedulerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedWorkDays, setSelectedWorkDays] = useState<number[]>([1, 2, 3, 4]); // Monday-Thursday default
  const [scheduleGenerated, setScheduleGenerated] = useState(false);
  const [lastScheduleResult, setLastScheduleResult] = useState<any>(null);

  // Get production queue data
  const { data: productionQueue = [], isLoading: queueLoading } = useQuery<any[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: () => apiRequest('/api/production-queue/prioritized'),
  });

  // Get employee settings for capacity calculation
  const { data: employeeSettings = [] } = useQuery({
    queryKey: ['/api/molds/employee-settings'],
    queryFn: () => apiRequest('/api/molds/employee-settings'),
  });

  // Auto-populate production queue mutation
  const autoPopulateMutation = useMutation({
    mutationFn: () => apiRequest('/api/production-queue/auto-populate', { method: 'POST' }),
    onSuccess: (result: any) => {
      if (result.success) {
        toast({
          title: "Production Queue Updated",
          description: `Auto-populated queue with ${result.ordersProcessed || 0} orders`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      } else {
        toast({
          title: "Auto-Populate Failed",
          description: result.message || "No orders were processed",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Auto-Populate Failed",
        description: error.message || "Failed to auto-populate production queue",
        variant: "destructive",
      });
    }
  });

  // Generate work-day aware schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: () => {
      console.log('🎯 Generating schedule with work days:', selectedWorkDays);
      return apiRequest('/api/scheduler/generate-algorithmic-schedule', {
        method: 'POST',
        body: JSON.stringify({
          maxOrdersPerDay: 50,
          scheduleDays: 5, // Only generate for 5 days
          workDays: selectedWorkDays // Critical: Pass selected work days
        })
      });
    },
    onSuccess: (result: any) => {
      console.log('📊 Schedule generation result:', result);
      
      if (result.success && result.allocations) {
        const totalScheduled = result.allocations.length;
        toast({
          title: "Schedule Generated Successfully",
          description: `Scheduled ${totalScheduled} orders on selected work days only`,
        });
        
        setScheduleGenerated(true);
        setLastScheduleResult(result);
        
        // Notify parent component if callback provided
        if (onScheduleGenerated) {
          onScheduleGenerated(result);
        }
      } else {
        toast({
          title: "Schedule Generation Warning",
          description: result.message || "No orders were scheduled",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('❌ Schedule generation error:', error);
      toast({
        title: "Schedule Generation Failed",
        description: error.message || "Failed to generate work-day aware schedule",
        variant: "destructive",
      });
    }
  });

  const workDayOptions = [
    { day: 1, label: 'Monday', short: 'Mon' },
    { day: 2, label: 'Tuesday', short: 'Tue' },
    { day: 3, label: 'Wednesday', short: 'Wed' },
    { day: 4, label: 'Thursday', short: 'Thu' },
    { day: 5, label: 'Friday', short: 'Fri' },
  ];

  const toggleWorkDay = (dayNumber: number) => {
    setSelectedWorkDays(prev => {
      if (prev.includes(dayNumber)) {
        return prev.filter(d => d !== dayNumber);
      } else {
        return [...prev, dayNumber].sort();
      }
    });
    setScheduleGenerated(false); // Reset when work days change
  };

  const totalCapacity = employeeSettings.reduce((total: number, emp: any) => 
    total + (emp.rate * emp.hours), 0
  );

  const selectedDayNames = selectedWorkDays.map(d => 
    workDayOptions.find(opt => opt.day === d)?.short || d.toString()
  ).join(', ');

  return (
    <div className="space-y-6">
      {/* Work Day Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Work Day Configuration
          </CardTitle>
          <p className="text-sm text-gray-500">
            Select which days to schedule orders. Orders will ONLY be scheduled on selected days.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            {workDayOptions.map((option) => (
              <label
                key={option.day}
                className={`flex flex-col items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedWorkDays.includes(option.day)
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <Checkbox
                  checked={selectedWorkDays.includes(option.day)}
                  onCheckedChange={() => toggleWorkDay(option.day)}
                  className="mb-2"
                />
                <span className="font-medium">{option.short}</span>
                <span className="text-xs text-gray-500">{option.label}</span>
              </label>
            ))}
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-800">
                Selected Work Days: {selectedDayNames || 'None'}
              </span>
            </div>
            {selectedWorkDays.length === 0 && (
              <p className="text-sm text-red-600 mt-1">
                ⚠️ No work days selected - scheduling will fail
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Capacity Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">Daily Capacity</p>
                <p className="text-xl font-bold">{Math.floor(totalCapacity)} parts/day</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Queue Size</p>
                <p className="text-xl font-bold">{productionQueue.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-sm text-gray-500">Work Days</p>
                <p className="text-xl font-bold">{selectedWorkDays.length}/5</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Production Queue Management</h3>
              <p className="text-sm text-gray-500">
                Auto-populate queue → Generate work-day aware schedule
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => autoPopulateMutation.mutate()}
                disabled={autoPopulateMutation.isPending}
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Auto-Populate Queue
              </Button>
              
              <Button
                onClick={() => generateScheduleMutation.mutate()}
                disabled={generateScheduleMutation.isPending || selectedWorkDays.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Generate Schedule
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Results */}
      {scheduleGenerated && lastScheduleResult && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800">Schedule Generated Successfully</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {lastScheduleResult.allocations?.length || 0}
                </div>
                <div className="text-sm text-green-700">Orders Scheduled</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {selectedWorkDays.length}
                </div>
                <div className="text-sm text-blue-700">Work Days Used</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {lastScheduleResult.analytics?.efficiency?.toFixed(1) || 0}%
                </div>
                <div className="text-sm text-purple-700">Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {Math.floor(totalCapacity * selectedWorkDays.length)}
                </div>
                <div className="text-sm text-orange-700">Weekly Capacity</div>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-white border border-green-200 rounded">
              <p className="text-sm text-green-800">
                <strong>✅ Schedule respects work day selection:</strong> Orders scheduled only on {selectedDayNames}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
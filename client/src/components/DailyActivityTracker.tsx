import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Save, TrendingUp } from 'lucide-react';

interface DailyActivityCount {
  id: number;
  date: string;
  activityType: string;
  count: number;
  enteredBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const ACTIVITY_TYPES = ['Buttpads', 'Duratec', 'Texture', 'Sandblaster'] as const;

// Helper function to get week dates starting from 8/27/2024
function getWeekDates(startDate: Date = new Date('2024-08-27')): string[] {
  const dates: string[] = [];
  const currentDate = new Date(startDate);
  
  // Get the current week's Monday-Sunday dates
  const today = new Date();
  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Adjust for Sunday (0) and Monday start
  startOfWeek.setDate(today.getDate() + diff);
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  return dates;
}

export default function DailyActivityTracker() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activityData, setActivityData] = useState<Record<string, { count: number; notes: string }>>({});
  const [weekDates] = useState(() => getWeekDates());

  // Fetch activity counts for the selected date
  const { data: dailyActivities, isLoading } = useQuery({
    queryKey: ['/api/daily-activities/date', selectedDate],
    enabled: !!selectedDate,
  });

  // Mutation for saving activity counts
  const saveMutation = useMutation({
    mutationFn: async (data: { date: string; activityType: string; count: number; notes?: string }) => {
      const response = await fetch('/api/daily-activities/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          enteredBy: 'Current User', // You might want to get this from auth context
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save activity count');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Activity count saved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/daily-activities/date', selectedDate] });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Initialize activity data when dailyActivities loads
  useEffect(() => {
    if (dailyActivities) {
      const newActivityData: Record<string, { count: number; notes: string }> = {};
      
      ACTIVITY_TYPES.forEach(activityType => {
        const existingActivity = Array.isArray(dailyActivities) 
          ? dailyActivities.find((activity: DailyActivityCount) => 
              activity.activityType === activityType
            )
          : undefined;
        newActivityData[activityType] = {
          count: existingActivity?.count || 0,
          notes: existingActivity?.notes || '',
        };
      });
      
      setActivityData(newActivityData);
    } else {
      // Initialize with zeros if no data
      const newActivityData: Record<string, { count: number; notes: string }> = {};
      ACTIVITY_TYPES.forEach(activityType => {
        newActivityData[activityType] = { count: 0, notes: '' };
      });
      setActivityData(newActivityData);
    }
  }, [dailyActivities]);

  const handleCountChange = (activityType: string, count: number) => {
    setActivityData(prev => ({
      ...prev,
      [activityType]: {
        ...prev[activityType],
        count: Math.max(0, count), // Ensure non-negative
      },
    }));
  };

  const handleNotesChange = (activityType: string, notes: string) => {
    setActivityData(prev => ({
      ...prev,
      [activityType]: {
        ...prev[activityType],
        notes,
      },
    }));
  };

  const handleSaveActivity = async (activityType: string) => {
    const data = activityData[activityType];
    if (data) {
      await saveMutation.mutateAsync({
        date: selectedDate,
        activityType,
        count: data.count,
        notes: data.notes || undefined,
      });
    }
  };

  const handleSaveAll = async () => {
    try {
      const promises = ACTIVITY_TYPES.map(activityType => {
        const data = activityData[activityType];
        if (data) {
          return saveMutation.mutateAsync({
            date: selectedDate,
            activityType,
            count: data.count,
            notes: data.notes || undefined,
          });
        }
        return Promise.resolve();
      });
      
      await Promise.all(promises);
      toast({
        title: 'Success',
        description: 'All activity counts saved successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save some activity counts',
        variant: 'destructive',
      });
    }
  };

  const formatDateDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Activity Tracker</h1>
          <p className="text-muted-foreground">
            Track daily counts for Buttpads, Duratec, Texture, and Sandblaster activities
          </p>
        </div>
      </div>

      {/* Date Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Select Date
          </CardTitle>
          <CardDescription>
            Choose a date to view or enter activity counts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {weekDates.map((date) => (
              <Button
                key={date}
                variant={selectedDate === date ? 'default' : 'outline'}
                onClick={() => setSelectedDate(date)}
                className="flex-1 min-w-[120px]"
              >
                {formatDateDisplay(date)}
              </Button>
            ))}
          </div>
          <div className="mt-4">
            <Label htmlFor="custom-date">Or select a custom date:</Label>
            <Input
              id="custom-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="mt-2 max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Activity Input Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {ACTIVITY_TYPES.map((activityType) => (
          <Card key={activityType}>
            <CardHeader>
              <CardTitle className="text-lg">{activityType}</CardTitle>
              <CardDescription>
                Enter count for {formatDateDisplay(selectedDate)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor={`count-${activityType}`}>Count</Label>
                <Input
                  id={`count-${activityType}`}
                  type="number"
                  min="0"
                  value={activityData[activityType]?.count || 0}
                  onChange={(e) => handleCountChange(activityType, parseInt(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor={`notes-${activityType}`}>Notes (optional)</Label>
                <Textarea
                  id={`notes-${activityType}`}
                  value={activityData[activityType]?.notes || ''}
                  onChange={(e) => handleNotesChange(activityType, e.target.value)}
                  placeholder="Add any notes about this count..."
                  className="mt-1 min-h-[80px]"
                />
              </div>
              
              <Button
                onClick={() => handleSaveActivity(activityType)}
                disabled={saveMutation.isPending}
                className="w-full"
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Save All Button */}
      <div className="flex justify-center">
        <Button
          onClick={handleSaveAll}
          disabled={saveMutation.isPending}
          size="lg"
          className="px-8"
        >
          <Save className="h-5 w-5 mr-2" />
          Save All Activities
        </Button>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Daily Summary for {formatDateDisplay(selectedDate)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {ACTIVITY_TYPES.map((activityType) => {
                const count = activityData[activityType]?.count || 0;
                return (
                  <div key={activityType} className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-muted-foreground">{activityType}</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
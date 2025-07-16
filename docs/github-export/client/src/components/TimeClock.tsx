import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useTimeClock from '@/hooks/useTimeClock';

interface TimeClockProps {
  employeeId: string;
  disableClockOut?: boolean;
}

export default function TimeClock({ employeeId, disableClockOut = false }: TimeClockProps) {
  const {
    clockedIn,
    clockInTime,
    clockOutTime,
    clockIn,
    clockOut,
    loading,
  } = useTimeClock(employeeId);
  
  const { toast } = useToast();

  const handleClockIn = async () => {
    try {
      await clockIn();
      toast({ title: 'Clocked in successfully!' });
    } catch (error) {
      toast({ title: 'Failed to clock in', variant: 'destructive' });
    }
  };

  const checkChecklistCompletion = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/checklist?employeeId=${employeeId}&date=${today}`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      const checklist = await response.json();
      
      // Check if all required items are completed
      const allRequiredComplete = checklist.every((item: any) => 
        item.required ? Boolean(item.value) : true
      );
      
      return allRequiredComplete;
    } catch (error) {
      console.error('Error checking checklist:', error);
      return false;
    }
  };

  const handleClockOut = async () => {
    try {
      // Check if checklist is complete before allowing clock out
      const checklistComplete = await checkChecklistCompletion();
      
      if (!checklistComplete) {
        toast({ 
          title: 'Cannot clock out until the Daily Checklist has been completed',
          variant: 'destructive' 
        });
        return;
      }
      
      await clockOut();
      toast({ title: 'Clocked out successfully!' });
    } catch (error) {
      toast({ title: 'Failed to clock out', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Time Clock
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Clock
        </CardTitle>
        <CardDescription>
          Employee ID: {employeeId}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!clockedIn ? (
          <Button
            onClick={handleClockIn}
            className="w-full bg-green-500 hover:bg-green-600"
            size="lg"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Clock In
          </Button>
        ) : (
          <Button
            onClick={handleClockOut}
            className="w-full bg-red-500 hover:bg-red-600"
            size="lg"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Clock Out
          </Button>
        )}
        
        {clockedIn && clockInTime && (
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-800">Clocked in since</p>
            <p className="text-lg font-bold text-green-900">
              {new Date(clockInTime).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </p>
          </div>
        )}
        
        {!clockedIn && clockOutTime && (
          <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-red-800">Clocked out at</p>
            <p className="text-lg font-bold text-red-900">
              {new Date(clockOutTime).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
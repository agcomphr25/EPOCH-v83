import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, LogIn, LogOut, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useTimeClock from '@/hooks/useTimeClock';

interface TimeClockModalProps {
  employeeId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TimeClockModal({ employeeId, isOpen, onClose }: TimeClockModalProps) {
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

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Time Clock</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>Time Clock</span>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Current Time Display */}
          <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Current Time</p>
            <p className="text-2xl font-bold text-blue-600">{getCurrentTime()}</p>
            <p className="text-sm text-gray-500">{new Date().toLocaleDateString()}</p>
          </div>

          {/* Clock In/Out Status */}
          {clockedIn ? (
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-sm font-medium text-green-800">Currently Clocked In</p>
              </div>
              <p className="text-lg font-bold text-green-900">
                Since {formatTime(clockInTime!)}
              </p>
            </div>
          ) : (
            <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-sm font-medium text-gray-600">Not Clocked In</p>
              {clockOutTime && (
                <p className="text-sm text-gray-500">
                  Last clocked out at {formatTime(clockOutTime)}
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            {!clockedIn ? (
              <Button
                onClick={handleClockIn}
                className="w-full bg-green-500 hover:bg-green-600 text-white"
                size="lg"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Clock In
              </Button>
            ) : (
              <Button
                onClick={handleClockOut}
                className="w-full bg-red-500 hover:bg-red-600 text-white"
                size="lg"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Clock Out
              </Button>
            )}
            
            <p className="text-xs text-center text-gray-500">
              {clockedIn 
                ? "Complete your daily checklist before clocking out" 
                : "Click to start your work day"
              }
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
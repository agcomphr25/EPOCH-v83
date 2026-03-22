import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Clock, LogIn, LogOut, Coffee, PlayCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useTimeClock from '@/hooks/useTimeClock';

interface TimeClockProps {
  employeeId: string;
  disableClockOut?: boolean;
}

export default function TimeClock({
  employeeId,
  disableClockOut = false,
}: TimeClockProps) {
  const {
    clockedIn,
    onBreak,
    status,
    clockInTime,
    clockOutTime,
    lastPunchTime,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    loading,
  } = useTimeClock(employeeId);

  const { toast } = useToast();

  const handleClockIn = async () => {
    try {
      await clockIn();
      toast({ title: 'Clocked in successfully!' });
    } catch (err: any) {
      const msg = err?.message ?? '';
      toast({
        title: msg.includes('Already clocked in') ? 'Already clocked in' : 'Failed to clock in',
        variant: 'destructive',
      });
    }
  };

  const checkChecklistCompletion = async () => {
    try {
      const enforcementRes = await fetch(`/api/checklist-management/enforcement-status?employeeId=${employeeId}`);
      if (enforcementRes.ok) {
        const enforcement = await enforcementRes.json();
        if (!enforcement.canClockOut) {
          return { complete: false, checklists: enforcement.incompleteChecklists };
        }
        return { complete: true, checklists: [] };
      }
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/checklist?employeeId=${employeeId}&date=${today}`);
      if (!response.ok) throw new Error('Failed to fetch checklist');
      const checklist = await response.json();
      const allRequiredComplete = checklist.every((item: any) =>
        item.required ? Boolean(item.value) : true
      );
      return { complete: allRequiredComplete, checklists: [] };
    } catch {
      return { complete: true, checklists: [] };
    }
  };

  const handleClockOut = async () => {
    try {
      const result = await checkChecklistCompletion();
      if (!result.complete) {
        const names = result.checklists?.map((c: any) => c.name).join(', ');
        toast({
          title: names
            ? `Cannot clock out. Incomplete checklists: ${names}`
            : 'Cannot clock out until the Daily Checklist has been completed',
          variant: 'destructive',
        });
        return;
      }
      await clockOut();
      toast({ title: 'Clocked out successfully!' });
    } catch (err: any) {
      const msg = err?.message ?? '';
      toast({
        title: msg.includes('Must clock in') ? 'Must clock in first' : 'Failed to clock out',
        variant: 'destructive',
      });
    }
  };

  const handleStartBreak = async () => {
    try {
      await startBreak();
      toast({ title: 'Break started' });
    } catch {
      toast({ title: 'Failed to start break', variant: 'destructive' });
    }
  };

  const handleEndBreak = async () => {
    try {
      await endBreak();
      toast({ title: 'Break ended — back to work!' });
    } catch {
      toast({ title: 'Failed to end break', variant: 'destructive' });
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Time Clock
          {onBreak && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs ml-1">
              On Break
            </Badge>
          )}
          {clockedIn && !onBreak && (
            <Badge variant="outline" className="border-green-500 text-green-700 text-xs ml-1">
              Clocked In
            </Badge>
          )}
          {!clockedIn && status !== null && (
            <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs ml-1">
              Clocked Out
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Employee ID: {employeeId}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {!clockedIn ? (
          <Button
            onClick={handleClockIn}
            className="w-full bg-green-500 hover:bg-green-600"
            size="lg"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Clock In
          </Button>
        ) : onBreak ? (
          <Button
            onClick={handleEndBreak}
            className="w-full bg-amber-500 hover:bg-amber-600"
            size="lg"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            End Break
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={handleClockOut}
              disabled={disableClockOut}
              className="w-full bg-red-500 hover:bg-red-600"
              size="lg"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Clock Out
            </Button>
            <Button
              onClick={handleStartBreak}
              variant="outline"
              className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
              size="sm"
            >
              <Coffee className="h-4 w-4 mr-2" />
              Start Break
            </Button>
          </div>
        )}

        {clockedIn && !onBreak && clockInTime && (
          <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm font-medium text-green-800">Clocked in since</p>
            <p className="text-lg font-bold text-green-900">{formatTime(clockInTime)}</p>
          </div>
        )}

        {onBreak && (
          <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm font-medium text-amber-800">On break since</p>
            <p className="text-lg font-bold text-amber-900">{formatTime(lastPunchTime)}</p>
          </div>
        )}

        {!clockedIn && clockOutTime && (
          <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-sm font-medium text-slate-600">Clocked out at</p>
            <p className="text-lg font-bold text-slate-800">{formatTime(clockOutTime)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

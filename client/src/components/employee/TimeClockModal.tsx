import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, LogIn, LogOut, X, Briefcase } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useTimeClock from '@/hooks/useTimeClock';

interface Job {
  id: number;
  orderNumber: string;
  department: string | null;
}

interface TimeClockModalProps {
  employeeId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TimeClockModal({
  employeeId,
  isOpen,
  onClose,
}: TimeClockModalProps) {
  const { clockedIn, clockInTime, clockOutTime, clockIn, clockOut, loading } =
    useTimeClock(employeeId);

  const { toast } = useToast();
  const [selectedJobId, setSelectedJobId] = useState('');

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ['/api/timekeeping/jobs'],
  });

  const handleClockIn = async () => {
    if (!selectedJobId) {
      toast({ title: 'Select a job first', variant: 'destructive' });
      return;
    }
    try {
      await clockIn(selectedJobId);
      setSelectedJobId('');
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
        if (!enforcement.canClockOut) return { complete: false, checklists: enforcement.incompleteChecklists };
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
    } catch {
      toast({ title: 'Failed to clock out', variant: 'destructive' });
    }
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getCurrentTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
          <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Current Time</p>
            <p className="text-2xl font-bold text-blue-600">{getCurrentTime()}</p>
            <p className="text-sm text-gray-500">{new Date().toLocaleDateString()}</p>
          </div>

          {clockedIn ? (
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <p className="text-sm font-medium text-green-800">Currently Clocked In</p>
              </div>
              <p className="text-lg font-bold text-green-900">Since {formatTime(clockInTime)}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm font-medium text-gray-600">Not Clocked In</p>
                {clockOutTime && (
                  <p className="text-sm text-gray-500">Last out at {formatTime(clockOutTime)}</p>
                )}
              </div>
              {jobs.length > 0 && (
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select job to clock into…" />
                  </SelectTrigger>
                  <SelectContent>
                    {jobs.map(j => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        <span className="flex items-center gap-2">
                          <Briefcase className="h-3 w-3 opacity-60" />
                          {j.orderNumber}
                          {j.department && <span className="text-muted-foreground text-xs">— {j.department}</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-3">
            {!clockedIn ? (
              <Button
                onClick={handleClockIn}
                disabled={!selectedJobId}
                className="w-full bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
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
                ? 'Complete your daily checklist before clocking out'
                : 'Select a job, then clock in'}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

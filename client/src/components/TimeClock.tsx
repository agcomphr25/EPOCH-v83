import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, LogIn, LogOut, Coffee, PlayCircle, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useTimeClock from '@/hooks/useTimeClock';

interface WorkBucket {
  id: string;
  name: string;
  type: string;
}

interface WorkInterval {
  clockIn: string;
  clockOut: string;
  durationHours: number;
}

interface HoursData {
  intervals: WorkInterval[];
  totalHours: number;
}

interface TimeClockProps {
  employeeId: string;
  disableClockOut?: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  DIRECT: 'Direct Labor',
  INDIRECT: 'Indirect',
  NON_WORK: 'Non-Work',
};

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
  const [selectedBucketId, setSelectedBucketId] = useState('');

  const { data: buckets = [] } = useQuery<WorkBucket[]>({
    queryKey: ['/api/timekeeping/buckets'],
  });

  const { data: hoursData, refetch: refetchHours } = useQuery<HoursData>({
    queryKey: ['/api/timekeeping/hours'],
    refetchInterval: 60_000,
  });

  const bucketGroups = buckets.reduce<Record<string, WorkBucket[]>>((acc, b) => {
    if (!acc[b.type]) acc[b.type] = [];
    acc[b.type].push(b);
    return acc;
  }, {});

  const handleClockIn = async () => {
    if (!selectedBucketId) {
      toast({ title: 'Select a work bucket first', variant: 'destructive' });
      return;
    }
    try {
      await clockIn(selectedBucketId);
      setSelectedBucketId('');
      refetchHours();
      toast({ title: 'Clocked in!' });
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
      refetchHours();
      toast({ title: 'Clocked out!' });
    } catch {
      toast({ title: 'Failed to clock out', variant: 'destructive' });
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
      refetchHours();
      toast({ title: 'Break ended — back to work!' });
    } catch {
      toast({ title: 'Failed to end break', variant: 'destructive' });
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
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
    <div className="w-full max-w-sm space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Clock className="h-5 w-5" />
            Time Clock
            {onBreak && (
              <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">On Break</Badge>
            )}
            {clockedIn && !onBreak && (
              <Badge variant="outline" className="border-green-500 text-green-700 text-xs">Clocked In</Badge>
            )}
            {!clockedIn && status !== null && (
              <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">Clocked Out</Badge>
            )}
          </CardTitle>
          <CardDescription>Employee ID: {employeeId}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Bucket selector — only shown before clock-in */}
          {!clockedIn && buckets.length > 0 && (
            <Select value={selectedBucketId} onValueChange={setSelectedBucketId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select work bucket…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(bucketGroups).map(([type, items]) => (
                  <SelectGroup key={type}>
                    <SelectLabel>{GROUP_LABELS[type] ?? type}</SelectLabel>
                    {items.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}

          {!clockedIn ? (
            <Button
              onClick={handleClockIn}
              disabled={!selectedBucketId}
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50"
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

      {hoursData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Timer className="h-4 w-4" />
              This Pay Period
              <span className="ml-auto font-bold text-base">
                {formatDuration(hoursData.totalHours)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {hoursData.intervals.length > 0 ? (
              <ul className="space-y-1">
                {hoursData.intervals.map((interval, i) => (
                  <li key={i} className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {formatTime(interval.clockIn)} → {formatTime(interval.clockOut)}
                    </span>
                    <span className="font-medium text-foreground">
                      {formatDuration(interval.durationHours)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">
                No completed intervals yet this period
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

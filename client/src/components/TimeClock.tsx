import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Clock,
  LogIn,
  LogOut,
  Coffee,
  PlayCircle,
  Timer,
  Briefcase,
  Zap,
  ScanBarcode,
  CheckCircle,
  AlertCircle,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useTimeClock from '@/hooks/useTimeClock';
import { apiRequest } from '@/lib/queryClient';

interface Job {
  id: number;
  orderNumber: string;
  department: string | null;
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

interface ChargeContext {
  travelerId: string;
  travelerNumber: string;
  wadId: string;
  wadNumber: string;
  projectId: string;
  chargeCode: string;
  department: string | null;
  operation: string | null;
}

interface TimeClockProps {
  employeeId: string;
  disableClockOut?: boolean;
}

const QUICK_START_LIMIT = 6;

const SCAN_ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: 'No traveler found for this barcode. Check the barcode and try again.',
  NO_WAD_LINK: 'This traveler is not linked to a Work Authorization Document. Contact your supervisor.',
  MALFORMED: 'The barcode could not be read. It may contain invalid characters.',
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
    activeJobId,
    activeJobLabel,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    refreshStatus,
    loading,
  } = useTimeClock(employeeId);

  const { toast } = useToast();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [showAllJobs, setShowAllJobs] = useState(false);

  // Traveler barcode scan state (clock-in flow)
  const [scanValue, setScanValue] = useState('');
  // The barcode value that was actually submitted and resolved — locked when context is shown
  const [resolvedScanValue, setResolvedScanValue] = useState('');
  const [chargeContext, setChargeContext] = useState<ChargeContext | null>(null);
  const [scanError, setScanError] = useState<{ code: string; message: string } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Switch-job scan state (while clocked in)
  const [switchScanValue, setSwitchScanValue] = useState('');
  const [switchResolvedScanValue, setSwitchResolvedScanValue] = useState('');
  const [switchChargeContext, setSwitchChargeContext] = useState<ChargeContext | null>(null);
  const [switchScanError, setSwitchScanError] = useState<{ code: string; message: string } | null>(null);
  const switchScanInputRef = useRef<HTMLInputElement>(null);

  const { data: jobs = [] } = useQuery<Job[]>({
    queryKey: ['/api/timekeeping/jobs'],
  });

  const { data: hoursData, refetch: refetchHours } = useQuery<HoursData>({
    queryKey: ['/api/timekeeping/hours'],
    refetchInterval: 60_000,
  });

  // Phase 4 — auto-select the active job when clocked in and then clocking back in
  useEffect(() => {
    if (!loading && activeJobId && !clockedIn && !selectedJobId) {
      setSelectedJobId(String(activeJobId));
    }
  }, [loading, activeJobId, clockedIn, selectedJobId]);

  const resetScan = () => {
    setScanValue('');
    setResolvedScanValue('');
    setChargeContext(null);
    setScanError(null);
    setTimeout(() => scanInputRef.current?.focus(), 0);
  };

  const scanMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest('/api/time-clock/scan/traveler', {
        method: 'POST',
        body: { scanValue: value, employeeId },
      });
      return res as { chargeContext: ChargeContext };
    },
    onSuccess: (data, submittedValue) => {
      setResolvedScanValue(submittedValue);
      setChargeContext(data.chargeContext);
      setScanError(null);
    },
    onError: (err: any) => {
      // apiRequest builds the error object with:
      //   err.message       = data?.message || data?.error || statusText
      //   err.responseData  = full parsed JSON response body
      const code: string = err?.responseData?.error ?? 'UNKNOWN';
      const fallback: string = err?.message ?? 'Failed to read the barcode. Please try again.';
      setScanError({ code, message: SCAN_ERROR_MESSAGES[code] ?? fallback });
      setChargeContext(null);
      setResolvedScanValue('');
    },
  });

  const clockInTravelerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/time-clock/clock-in/traveler', {
        method: 'POST',
        // Use the locked resolved barcode — not the (possibly-edited) input value
        body: { scanValue: resolvedScanValue, employeeId },
      });
      return res;
    },
    onSuccess: async () => {
      resetScan();
      // Refresh both time-clock status and hours so the UI transitions correctly
      await refreshStatus();
      refetchHours();
      toast({ title: 'Clocked in via traveler!' });
    },
    onError: (err: any) => {
      const message: string = err?.message ?? 'Failed to clock in via traveler barcode. Please try again.';
      toast({ title: message, variant: 'destructive' });
    },
  });

  const resetSwitchScan = () => {
    setSwitchScanValue('');
    setSwitchResolvedScanValue('');
    setSwitchChargeContext(null);
    setSwitchScanError(null);
    setTimeout(() => switchScanInputRef.current?.focus(), 0);
  };

  const switchJobScanMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest('/api/time-clock/scan/traveler', {
        method: 'POST',
        body: { scanValue: value, employeeId },
      });
      return res as { chargeContext: ChargeContext };
    },
    onSuccess: (data, submittedValue) => {
      setSwitchResolvedScanValue(submittedValue);
      setSwitchChargeContext(data.chargeContext);
      setSwitchScanError(null);
    },
    onError: (err: any) => {
      const code: string = err?.responseData?.error ?? 'UNKNOWN';
      const fallback: string = err?.message ?? 'Failed to read the barcode. Please try again.';
      setSwitchScanError({ code, message: SCAN_ERROR_MESSAGES[code] ?? fallback });
      setSwitchChargeContext(null);
      setSwitchResolvedScanValue('');
    },
  });

  const switchJobMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/time-clock/switch-job/traveler', {
        method: 'POST',
        body: { scanValue: switchResolvedScanValue, employeeId },
      });
      return res;
    },
    onSuccess: async () => {
      resetSwitchScan();
      await refreshStatus();
      refetchHours();
      toast({ title: 'Job switched successfully!' });
    },
    onError: (err: any) => {
      const message: string = err?.message ?? 'Failed to switch job. Please try again.';
      toast({ title: message, variant: 'destructive' });
    },
  });

  const handleSwitchScan = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSwitchChargeContext(null);
    setSwitchScanError(null);
    setSwitchResolvedScanValue('');
    switchJobScanMutation.mutate(trimmed);
  };

  const handleScan = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setChargeContext(null);
    setScanError(null);
    setResolvedScanValue('');
    scanMutation.mutate(trimmed);
  };

  const handleClockIn = async (jobId?: string) => {
    const id = jobId ?? selectedJobId;
    if (!id) {
      toast({ title: 'Select a job first', variant: 'destructive' });
      return;
    }
    try {
      await clockIn(id);
      setSelectedJobId('');
      refetchHours();
      toast({ title: 'Clocked in!' });
    } catch (err: any) {
      const msg = err?.message ?? '';
      toast({
        title: msg.includes('Must clock out') ? 'Must clock out before starting a new job' : 'Failed to clock in',
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
        const checklists = result.checklists || [];
        let description = '';
        if (checklists.length > 0) {
          description = checklists.map((c: any) => {
            const items = c.incompleteItems && c.incompleteItems.length > 0
              ? ` (${c.incompleteItems.join(', ')})`
              : '';
            return `${c.name}${items}`;
          }).join(' | ');
        }
        toast({
          title: checklists.length > 0
            ? `Cannot clock out — incomplete checklists: ${checklists.map((c: any) => c.name).join(', ')}`
            : 'Cannot clock out until the Daily Checklist has been completed',
          description: description || undefined,
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

  const quickJobs = jobs.slice(0, QUICK_START_LIMIT);
  const extraJobs = jobs.slice(QUICK_START_LIMIT);

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
          {/* Phase 9 — active job banner */}
          {clockedIn && !onBreak && activeJobLabel && (
            <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <Briefcase className="h-4 w-4 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs text-blue-600 font-medium leading-none mb-0.5">Currently working on</p>
                <p className="font-semibold text-blue-900 leading-tight">{activeJobLabel}</p>
              </div>
            </div>
          )}

          {/* Switch Job (Scan Traveler) — shown when clocked in and not on break */}
          {clockedIn && !onBreak && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <ScanBarcode className="h-3 w-3" />
                Switch Job (Scan Traveler)
              </p>
              <div className="flex gap-1.5">
                <Input
                  ref={switchScanInputRef}
                  value={switchScanValue}
                  onChange={(e) => setSwitchScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSwitchScan(switchScanValue);
                  }}
                  placeholder="Scan or type barcode…"
                  className="text-sm h-8"
                  disabled={!!switchChargeContext || switchJobScanMutation.isPending || switchJobMutation.isPending}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSwitchScan(switchScanValue)}
                  disabled={!!switchChargeContext || !switchScanValue.trim() || switchJobScanMutation.isPending || switchJobMutation.isPending}
                  className="h-8 px-2.5 shrink-0"
                >
                  {switchJobScanMutation.isPending ? (
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                  ) : (
                    <ScanBarcode className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {/* Switch scan error */}
              {switchScanError && (
                <Alert variant="destructive" className="py-2 px-3">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs ml-1">
                    <span className="font-semibold">{switchScanError.code}:</span> {switchScanError.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Resolved charge context — switch-job confirmation */}
              {switchChargeContext && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Traveler resolved — confirm job switch
                    </p>
                    <button
                      onClick={resetSwitchScan}
                      className="text-indigo-400 hover:text-indigo-600"
                      aria-label="Clear scan"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <dt className="text-indigo-500 font-medium">WAD #</dt>
                      <dd className="font-mono font-semibold text-indigo-900">{switchChargeContext.wadNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-indigo-500 font-medium">Charge Code</dt>
                      <dd className="font-mono font-semibold text-indigo-900">{switchChargeContext.chargeCode}</dd>
                    </div>
                    <div>
                      <dt className="text-indigo-500 font-medium">Department</dt>
                      <dd className="text-indigo-900">{switchChargeContext.department ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-indigo-500 font-medium">Operation</dt>
                      <dd className="text-indigo-900 truncate" title={switchChargeContext.operation ?? undefined}>
                        {switchChargeContext.operation ?? '—'}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-indigo-500 font-medium">Traveler</dt>
                      <dd className="font-mono text-indigo-900">{switchChargeContext.travelerNumber}</dd>
                    </div>
                  </dl>

                  <Button
                    onClick={() => switchJobMutation.mutate()}
                    disabled={switchJobMutation.isPending}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 h-8 text-sm"
                  >
                    {switchJobMutation.isPending ? (
                      <>
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
                        Switching job…
                      </>
                    ) : (
                      <>
                        <Briefcase className="h-3.5 w-3.5 mr-1.5" />
                        Confirm Job Switch
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Traveler barcode scan section — only shown before clock-in */}
          {!clockedIn && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <ScanBarcode className="h-3 w-3" />
                Scan Traveler Barcode
              </p>
              <div className="flex gap-1.5">
                <Input
                  ref={scanInputRef}
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleScan(scanValue);
                  }}
                  placeholder="Scan or type barcode…"
                  className="text-sm h-8"
                  disabled={!!chargeContext || scanMutation.isPending || clockInTravelerMutation.isPending}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleScan(scanValue)}
                  disabled={!!chargeContext || !scanValue.trim() || scanMutation.isPending || clockInTravelerMutation.isPending}
                  className="h-8 px-2.5 shrink-0"
                >
                  {scanMutation.isPending ? (
                    <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                  ) : (
                    <ScanBarcode className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>

              {/* Scan error */}
              {scanError && (
                <Alert variant="destructive" className="py-2 px-3">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription className="text-xs ml-1">
                    <span className="font-semibold">{scanError.code}:</span> {scanError.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Resolved charge context confirmation */}
              {chargeContext && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Traveler resolved — confirm details
                    </p>
                    <button
                      onClick={resetScan}
                      className="text-indigo-400 hover:text-indigo-600"
                      aria-label="Clear scan"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <dt className="text-indigo-500 font-medium">WAD #</dt>
                      <dd className="font-mono font-semibold text-indigo-900">{chargeContext.wadNumber}</dd>
                    </div>
                    <div>
                      <dt className="text-indigo-500 font-medium">Charge Code</dt>
                      <dd className="font-mono font-semibold text-indigo-900">{chargeContext.chargeCode}</dd>
                    </div>
                    <div>
                      <dt className="text-indigo-500 font-medium">Department</dt>
                      <dd className="text-indigo-900">{chargeContext.department ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-indigo-500 font-medium">Operation</dt>
                      <dd className="text-indigo-900 truncate" title={chargeContext.operation ?? undefined}>
                        {chargeContext.operation ?? '—'}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-indigo-500 font-medium">Traveler</dt>
                      <dd className="font-mono text-indigo-900">{chargeContext.travelerNumber}</dd>
                    </div>
                  </dl>

                  <Button
                    onClick={() => clockInTravelerMutation.mutate()}
                    disabled={clockInTravelerMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 h-8 text-sm"
                  >
                    {clockInTravelerMutation.isPending ? (
                      <>
                        <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2" />
                        Clocking in…
                      </>
                    ) : (
                      <>
                        <LogIn className="h-3.5 w-3.5 mr-1.5" />
                        Confirm Clock-In
                      </>
                    )}
                  </Button>
                </div>
              )}

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-border" />
                <span className="mx-2 text-[10px] text-muted-foreground">or select a job</span>
                <div className="flex-grow border-t border-border" />
              </div>
            </div>
          )}

          {/* Job selection — only shown before clock-in */}
          {!clockedIn && jobs.length > 0 && (
            <div className="space-y-2">
              {/* Phase 6 — Quick start buttons */}
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Quick start
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {quickJobs.map(j => (
                  <button
                    key={j.id}
                    onClick={() => handleClockIn(String(j.id))}
                    className={`text-left px-2 py-1.5 rounded border text-xs transition-colors ${
                      selectedJobId === String(j.id)
                        ? 'bg-green-100 border-green-400 text-green-900 font-medium'
                        : 'bg-muted/50 border-border hover:bg-green-50 hover:border-green-300'
                    }`}
                  >
                    <span className="font-mono font-medium block truncate">{j.orderNumber}</span>
                    {j.department && (
                      <span className="text-muted-foreground text-[10px] truncate block">{j.department}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Overflow: dropdown for extra jobs */}
              {extraJobs.length > 0 && (
                <div>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                    onClick={() => setShowAllJobs(v => !v)}
                  >
                    {showAllJobs ? 'Hide' : `+ ${extraJobs.length} more jobs`}
                  </button>
                  {showAllJobs && (
                    <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                      <SelectTrigger className="w-full mt-1">
                        <SelectValue placeholder="Select job…" />
                      </SelectTrigger>
                      <SelectContent>
                        {extraJobs.map(j => (
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

              {/* Clock In button for dropdown-selected job */}
              {selectedJobId && !quickJobs.find(j => String(j.id) === selectedJobId) && (
                <Button
                  onClick={() => handleClockIn()}
                  className="w-full bg-green-500 hover:bg-green-600"
                  size="lg"
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Clock In
                </Button>
              )}
            </div>
          )}

          {/* No jobs available — plain clock-in button disabled */}
          {!clockedIn && jobs.length === 0 && (
            <Button
              onClick={() => handleClockIn()}
              disabled
              className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50"
              size="lg"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Clock In
            </Button>
          )}

          {clockedIn && onBreak ? (
            <Button
              onClick={handleEndBreak}
              className="w-full bg-amber-500 hover:bg-amber-600"
              size="lg"
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              End Break
            </Button>
          ) : clockedIn ? (
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
          ) : null}

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

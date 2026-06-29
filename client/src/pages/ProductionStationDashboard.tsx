import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Pause, Play, SkipForward, Square, Timer, AlertCircle, Home, History, Settings, Volume2, VolumeX, Smartphone, Volume1, CalendarDays, Fingerprint, ScanBarcode } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import StartProductionTimerModal from '@/components/StartProductionTimerModal';
import InlineCredentialModal from '@/components/auth/InlineCredentialModal';
import { useActionAuth } from '@/hooks/useActionAuth';
import { emitTimerEvent, subscribeToTimerEvents, type TimerEvent } from '@/lib/timerEvents';
import { startLoopingAlert, stopLoopingAlert, isLoopingAlertActive, playAlertSound, triggerVibration, primeVibration } from '@/lib/timerNotificationEffects';
import { 
  getTimerNotificationPreferences, 
  setTimerNotificationPreferences,
  shouldPlayAudibleAlert,
  shouldStopLoopingAlert,
  shouldShowBrowserNotification,
  shouldShowToast,
  getToastMessage,
  type TimerNotificationPreferences 
} from '@/lib/timerNotificationPolicy';
import { initAuditSink } from '@/lib/timerAuditSink';

interface ProductionProgramRun {
  id: string;
  programId: string;
  itemIdentifier?: string | null;
  travelerId?: string | null;
  travelerNumber?: string | null;
  startedByUserId: number;
  instanceName: string | null;
  sku: string | null;
  serialNumber: string | null;
  inventoryItemId: number | null;
  mandrelNumber: number | null;
  ovenNumber: number | null;
  ovenSlot: string | null;
  status: 'running' | 'paused' | 'awaiting_next' | 'completed' | 'stopped';
  currentStepIndex: number;
  startedAt: string;
  completedAt: string | null;
  totalElapsedSeconds: number;
  createdAt: string;
  updatedAt: string;
  program?: {
    id: string;
    name: string;
    description: string | null;
  };
  steps?: {
    id: string;
    stepIndex: number;
    stepName: string;
    durationSeconds: number;
  }[];
  inventoryItem?: {
    id: number;
    sku: string;
    name: string;
  };
}

interface RunWithDetails extends ProductionProgramRun {
  program: {
    id: string;
    name: string;
    description: string | null;
  };
  steps: {
    id: string;
    stepIndex: number;
    stepName: string;
    durationSeconds: number;
  }[];
  cumulativePauseSeconds?: number;
  lastPausedAt?: string | null;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatStartDay(ts: string): string {
  const started = new Date(ts);
  const today = new Date();
  const isToday = started.toDateString() === today.toDateString();
  return `${started.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}${isToday ? ' (today)' : ''}`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'paused':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'awaiting_next':
      return 'bg-sky-100 text-sky-700 border-sky-200';
    case 'completed':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'stopped':
      return 'bg-rose-100 text-rose-700 border-rose-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'awaiting_next':
      return 'Awaiting Next';
    case 'completed':
      return 'Completed';
    case 'stopped':
      return 'Stopped';
    default:
      return status;
  }
}

function TimerCard({ run, onTimerEvent, toast, requireFreshAuth, getAuthHeaders }: { run: RunWithDetails; onTimerEvent: (event: Omit<TimerEvent, 'timestamp'>) => void; toast: ReturnType<typeof useToast>['toast']; requireFreshAuth: (action: () => void, description?: string) => void; getAuthHeaders: () => Record<string, string> }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);
  const [hasTriggeredTimeout, setHasTriggeredTimeout] = useState(false);

  const currentStep = run.steps?.find(s => s.stepIndex === run.currentStepIndex);
  const totalSteps = run.steps?.length || 0;
  const totalProgramDuration = run.steps?.reduce((sum, s) => sum + s.durationSeconds, 0) || 0;
  
  // Calculate cumulative duration of all steps before current step
  const priorStepsDuration = run.steps
    ?.filter(s => s.stepIndex < run.currentStepIndex)
    .reduce((sum, s) => sum + s.durationSeconds, 0) || 0;

  useEffect(() => {
    const startTime = new Date(run.startedAt).getTime();
    const pauseSeconds = run.cumulativePauseSeconds || 0;
    
    if (run.status === 'completed' || run.status === 'stopped') {
      setElapsedTime(run.totalElapsedSeconds);
      setCurrentPauseSeconds(pauseSeconds);
      return;
    }

    // When paused or awaiting_next, elapsed time is frozen at the moment of pause
    if (run.status === 'paused' || run.status === 'awaiting_next') {
      // Use lastPausedAt to calculate frozen elapsed time
      const pausedAtTime = run.lastPausedAt ? new Date(run.lastPausedAt).getTime() : Date.now();
      const frozenElapsed = Math.floor((pausedAtTime - startTime) / 1000) - pauseSeconds;
      setElapsedTime(frozenElapsed);
      
      // Update current delay seconds every second (for estimated completion to shift forward)
      const updateDelay = () => {
        const currentNow = Date.now();
        const totalDelay = Math.floor((currentNow - startTime) / 1000) - frozenElapsed;
        setCurrentPauseSeconds(totalDelay);
      };
      updateDelay();
      const interval = setInterval(updateDelay, 1000);
      return () => clearInterval(interval);
    }

    // When running, update elapsed time every second (excluding pause time)
    setCurrentPauseSeconds(pauseSeconds);
    const updateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000) - pauseSeconds;
      setElapsedTime(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [run.startedAt, run.status, run.totalElapsedSeconds, run.cumulativePauseSeconds, run.lastPausedAt]);

  const pauseMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/production/timers/runs/${run.id}/pause`, { method: 'POST', headers: getAuthHeaders() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      onTimerEvent({ eventType: 'paused', runId: run.id, programName: run.program?.name || 'Unknown', stepName: currentStep?.stepName, stepIndex: run.currentStepIndex, serialNumber: run.serialNumber || undefined, inventoryItemId: run.inventoryItemId || undefined });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to pause', description: error.message, variant: 'destructive' });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/production/timers/runs/${run.id}/resume`, { method: 'POST', headers: getAuthHeaders() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      onTimerEvent({ eventType: 'resumed', runId: run.id, programName: run.program?.name || 'Unknown', stepName: currentStep?.stepName, stepIndex: run.currentStepIndex, serialNumber: run.serialNumber || undefined, inventoryItemId: run.inventoryItemId || undefined });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to resume', description: error.message, variant: 'destructive' });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/production/timers/runs/${run.id}/advance`, { method: 'POST', headers: getAuthHeaders() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      onTimerEvent({ eventType: 'advanced', runId: run.id, programName: run.program?.name || 'Unknown', stepName: currentStep?.stepName, stepIndex: run.currentStepIndex, serialNumber: run.serialNumber || undefined, inventoryItemId: run.inventoryItemId || undefined });
      setHasTriggeredTimeout(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to advance', description: error.message, variant: 'destructive' });
    },
  });

  const stepTimeoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/production/timers/runs/${run.id}/step-timeout`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      onTimerEvent({ eventType: 'step_timeout', runId: run.id, programName: run.program?.name || 'Unknown', stepName: currentStep?.stepName || `Step ${run.currentStepIndex + 1}`, stepIndex: run.currentStepIndex, serialNumber: run.serialNumber || undefined, inventoryItemId: run.inventoryItemId || undefined });
    },
    onError: (error: any) => {
      console.error('Step timeout error:', error);
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/production/timers/runs/${run.id}/stop`, { method: 'POST', headers: getAuthHeaders() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      onTimerEvent({ eventType: 'stopped', runId: run.id, programName: run.program?.name || 'Unknown', stepName: currentStep?.stepName, stepIndex: run.currentStepIndex, serialNumber: run.serialNumber || undefined, inventoryItemId: run.inventoryItemId || undefined });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to stop', description: error.message, variant: 'destructive' });
    },
  });

  // Calculate step time remaining: step duration minus time elapsed within this step
  // elapsedTime already freezes when paused, so this will freeze too
  const elapsedInCurrentStep = Math.max(0, elapsedTime - priorStepsDuration);
  const stepTimeRemaining = currentStep 
    ? Math.max(0, currentStep.durationSeconds - elapsedInCurrentStep)
    : 0;

  // Auto-trigger step timeout when time runs out
  useEffect(() => {
    if (run.status === 'running' && currentStep && stepTimeRemaining === 0 && !hasTriggeredTimeout) {
      setHasTriggeredTimeout(true);
      stepTimeoutMutation.mutate();
    }
  }, [run.status, stepTimeRemaining, hasTriggeredTimeout, currentStep]);

  // Reset timeout flag when step changes or run status changes
  useEffect(() => {
    if (run.status !== 'awaiting_next') {
      setHasTriggeredTimeout(false);
    }
  }, [run.currentStepIndex, run.status]);

  // Estimated completion shifts forward by cumulative pause time (updates while paused)
  const estimatedCompletion = totalProgramDuration > 0
    ? new Date(new Date(run.startedAt).getTime() + (totalProgramDuration + currentPauseSeconds) * 1000)
    : null;
  const itemIdentifier = run.itemIdentifier || run.travelerNumber || run.serialNumber || null;

  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Program</p>
            <CardTitle className="text-xl font-semibold truncate">{run.program?.name || 'Unknown Program'}</CardTitle>
            {run.instanceName && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{run.instanceName}</p>
            )}
          </div>
          <Badge className={`text-xs font-medium px-2.5 py-1 border ${getStatusColor(run.status)}`}>
            {getStatusLabel(run.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {itemIdentifier && (
            <div className="flex items-center gap-1.5 col-span-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-900">
              <Fingerprint className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-muted-foreground">Item:</span>
              <span className="font-mono text-sm font-semibold">{itemIdentifier}</span>
            </div>
          )}
          {run.serialNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Serial:</span>
              <span className="font-mono text-sm">{run.serialNumber}</span>
            </div>
          )}
          {run.travelerNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Traveler:</span>
              <span className="font-mono text-sm">{run.travelerNumber}</span>
            </div>
          )}
          {run.mandrelNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Mandrel:</span>
              <span className="text-sm font-medium">{run.mandrelNumber}</span>
            </div>
          )}
          {run.inventoryItemId && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Item ID:</span>
              <span className="text-sm font-medium">{run.inventoryItemId}</span>
            </div>
          )}
          {run.ovenNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Oven:</span>
              <span className="text-sm font-medium">{run.ovenNumber}</span>
              {run.ovenSlot && (
                <>
                  <span className="text-xs text-muted-foreground ml-1">Slot:</span>
                  <span className="text-sm font-medium">{run.ovenSlot === 'A' ? 'R' : run.ovenSlot === 'B' ? 'L' : run.ovenSlot}</span>
                </>
              )}
            </div>
          )}
          {run.sku && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">SKU:</span>
              <span className="font-mono text-sm">{run.sku}</span>
            </div>
          )}
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 rounded-md p-3 space-y-2 border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Current Step</span>
            <span className="text-base font-semibold">
              {currentStep?.stepName || `Step ${run.currentStepIndex + 1}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Progress</span>
            <span className="text-sm font-medium text-muted-foreground">
              Step {run.currentStepIndex + 1} of {totalSteps}
            </span>
          </div>
          {(run.status === 'running' || run.status === 'paused') && currentStep && (
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Time Remaining</span>
              <span className={`text-xl font-mono font-semibold ${run.status === 'paused' ? 'text-amber-600' : 'text-sky-600'}`}>
                {formatTime(stepTimeRemaining)}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Started</p>
            <p className="text-sm font-medium">
              {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Elapsed</p>
            <p className="text-base font-mono font-semibold">
              {formatTime(Math.min(elapsedTime, totalProgramDuration))}
            </p>
          </div>
          {estimatedCompletion && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Est. Done</p>
              <p className="text-sm font-medium">
                {estimatedCompletion.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950">
          <span className="flex items-center gap-1.5 text-muted-foreground uppercase tracking-wide">
            <CalendarDays className="h-3.5 w-3.5" />
            Put in
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {formatStartDay(run.startedAt)}
          </span>
        </div>

        <div className="flex gap-2 pt-1">
          {run.status === 'running' && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-sm font-medium"
              onClick={() => requireFreshAuth(() => pauseMutation.mutate(), 'pause this timer')}
              disabled={pauseMutation.isPending}
            >
              {pauseMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1.5" />}
              Pause
            </Button>
          )}

          {(run.status === 'paused' || run.status === 'awaiting_next') && (
            <Button
              size="sm"
              className="flex-1 h-9 text-sm font-medium bg-emerald-600 hover:bg-emerald-700"
              onClick={() => requireFreshAuth(() => resumeMutation.mutate(), 'resume this timer')}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
              Resume
            </Button>
          )}

          {run.status === 'awaiting_next' && (
            <Button
              size="sm"
              className="flex-1 h-9 text-sm font-medium bg-sky-600 hover:bg-sky-700"
              onClick={() => requireFreshAuth(() => advanceMutation.mutate(), 'advance to next step')}
              disabled={advanceMutation.isPending}
            >
              {advanceMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SkipForward className="w-3.5 h-3.5 mr-1.5" />}
              Next Step
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700"
            onClick={() => requireFreshAuth(() => stopMutation.mutate(), 'stop this timer')}
            disabled={stopMutation.isPending}
          >
            {stopMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Square className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductionStationDashboard() {
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [showAlarmSettings, setShowAlarmSettings] = useState(false);
  const [notificationPrefs, setNotificationPrefs] = useState<TimerNotificationPreferences>(() => getTimerNotificationPreferences());
  
  const { data: runs, isLoading, error } = useQuery<ProductionProgramRun[]>({
    queryKey: ['/api/production/timers/runs'],
    queryFn: async () => {
      const response = await fetch('/api/production/timers/runs');
      if (!response.ok) {
        throw new Error('Failed to load timer data');
      }
      return response.json();
    },
    refetchInterval: 2000,
  });

  const [detailedRuns, setDetailedRuns] = useState<RunWithDetails[]>([]);

  const activeRuns = runs?.filter(r => 
    r.status === 'running' || r.status === 'paused' || r.status === 'awaiting_next'
  ) || [];

  useEffect(() => {
    const unsubscribe = initAuditSink();
    return unsubscribe;
  }, []);

  const { toast } = useToast();
  
  const {
    showAuthModal,
    actionDescription,
    requireAuth,
    requireFreshAuth,
    handleAuthSuccess,
    handleAuthModalClose,
    getAuthHeaders,
  } = useActionAuth();
  
  useEffect(() => {
    const unsubscribe = subscribeToTimerEvents((event) => {
      const prefs = getTimerNotificationPreferences();
      
      if (shouldStopLoopingAlert(event.eventType)) {
        stopLoopingAlert();
      }
      
      if (shouldPlayAudibleAlert(event, prefs)) {
        const showBrowserNotif = shouldShowBrowserNotification(event, prefs);
        startLoopingAlert(event.stepName || 'Step', showBrowserNotif, prefs.alertVolume, prefs.vibrationEnabled);
      }
      
      if (shouldShowToast(event, prefs)) {
        const toastMsg = getToastMessage(event);
        if (toastMsg) {
          toast(toastMsg);
        }
      }
    });
    
    return unsubscribe;
  }, [toast]);

  const handleTimerEvent = useCallback((eventData: Omit<TimerEvent, 'timestamp'>) => {
    primeVibration();
    const event: TimerEvent = {
      ...eventData,
      timestamp: new Date().toISOString(),
    };
    emitTimerEvent(event);
  }, []);

  const toggleAudibleAlerts = useCallback(() => {
    const newPrefs = setTimerNotificationPreferences({ 
      audibleAlertsEnabled: !notificationPrefs.audibleAlertsEnabled 
    });
    setNotificationPrefs(newPrefs);
    
    if (!newPrefs.audibleAlertsEnabled && isLoopingAlertActive()) {
      stopLoopingAlert();
    }
  }, [notificationPrefs.audibleAlertsEnabled]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!activeRuns.length) {
        setDetailedRuns([]);
        return;
      }

      const detailed = await Promise.all(
        activeRuns.map(async (run) => {
          try {
            const response = await fetch(`/api/production/timers/runs/${run.id}`);
            if (response.ok) {
              return await response.json();
            }
            return { ...run, program: null, steps: [] };
          } catch {
            return { ...run, program: null, steps: [] };
          }
        })
      );
      setDetailedRuns(detailed);
    };

    fetchDetails();
  }, [runs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-xl text-muted-foreground">Loading stations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Card className="border-red-500 max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertCircle className="w-6 h-6" />
              Error Loading Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 pb-24 md:pb-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
              <Timer className="w-6 h-6" />
              Timer Station
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Production process timers
            </p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/app/dashboard">
              <Button variant="outline" size="sm" className="h-9 px-2.5 md:px-3" title="Dashboard">
                <Home className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline">Dashboard</span>
              </Button>
            </Link>
            <Link href="/app/production/timer-programs">
              <Button variant="outline" size="sm" className="h-9 px-2.5 md:px-3" title="Programs">
                <Settings className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline">Programs</span>
              </Button>
            </Link>
            <Link href="/app/production/timer-history">
              <Button variant="outline" size="sm" className="h-9 px-2.5 md:px-3" title="History">
                <History className="w-4 h-4 md:mr-1.5" />
                <span className="hidden md:inline">History</span>
              </Button>
            </Link>
            <Button
              size="sm"
              className="hidden md:inline-flex h-9 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setStartModalOpen(true)}
            >
              <ScanBarcode className="w-4 h-4 mr-1.5" />
              Scan Traveler
            </Button>
            <div className="relative">
              <Button
                size="sm"
                variant={notificationPrefs.audibleAlertsEnabled ? "outline" : "secondary"}
                className={`h-9 px-2.5 md:px-3 ${notificationPrefs.audibleAlertsEnabled ? '' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                onClick={() => setShowAlarmSettings(!showAlarmSettings)}
                title="Alarm Settings"
              >
                {notificationPrefs.audibleAlertsEnabled ? (
                  <Volume2 className="w-4 h-4 md:mr-1.5" />
                ) : (
                  <VolumeX className="w-4 h-4 md:mr-1.5" />
                )}
                <span className="hidden md:inline">Alarm</span>
              </Button>
              {showAlarmSettings && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowAlarmSettings(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border bg-white dark:bg-slate-800 shadow-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Alarm Settings</h4>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowAlarmSettings(false)}>
                        ×
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="sound-toggle" className="text-sm flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-slate-500" />
                        Sound
                      </Label>
                      <Switch
                        id="sound-toggle"
                        checked={notificationPrefs.audibleAlertsEnabled}
                        onCheckedChange={() => toggleAudibleAlerts()}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="volume-slider" className={`text-sm flex items-center gap-2 ${!notificationPrefs.audibleAlertsEnabled ? 'opacity-50' : ''}`}>
                        <Volume1 className="h-4 w-4 text-slate-500" />
                        Volume
                      </Label>
                      <div className="flex items-center gap-3">
                        <input
                          id="volume-slider"
                          type="range"
                          min="0"
                          max="100"
                          disabled={!notificationPrefs.audibleAlertsEnabled}
                          value={Math.round(notificationPrefs.alertVolume * 100)}
                          onChange={(e) => {
                            const vol = parseInt(e.target.value) / 100;
                            const newPrefs = setTimerNotificationPreferences({ alertVolume: vol });
                            setNotificationPrefs(newPrefs);
                          }}
                          className="flex-1 h-2 rounded-lg appearance-none cursor-pointer accent-blue-600 bg-slate-200 dark:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                        <span className={`text-xs font-mono w-8 text-right text-slate-600 dark:text-slate-300 ${!notificationPrefs.audibleAlertsEnabled ? 'opacity-50' : ''}`}>
                          {Math.round(notificationPrefs.alertVolume * 100)}%
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-7"
                        disabled={!notificationPrefs.audibleAlertsEnabled}
                        onClick={() => playAlertSound(notificationPrefs.alertVolume)}
                      >
                        Test Sound
                      </Button>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="vibration-toggle" className="text-sm flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-slate-500" />
                        Vibration
                      </Label>
                      <Switch
                        id="vibration-toggle"
                        checked={notificationPrefs.vibrationEnabled}
                        onCheckedChange={(checked) => {
                          const newPrefs = setTimerNotificationPreferences({ vibrationEnabled: checked });
                          setNotificationPrefs(newPrefs);
                          if (checked) {
                            primeVibration();
                            triggerVibration();
                          }
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                      Vibration on Android devices; audio pulse feedback on iOS
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="hidden sm:block text-right border-l pl-3 ml-1">
              <p className="text-lg font-mono font-semibold text-slate-700 dark:text-slate-200">
                {new Date().toLocaleTimeString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeRuns.length} active
              </p>
            </div>
          </div>
        </div>

        <StartProductionTimerModal
          open={startModalOpen}
          onOpenChange={setStartModalOpen}
          enableTravelerScan
          requireAuth={requireAuth}
          getAuthHeaders={getAuthHeaders}
        />

        <section className="mb-6 rounded-lg border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900 dark:bg-slate-900 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <ScanBarcode className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Scan Traveler to Start Timer
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  After the traveler scan, enter mandrel #, oven, and side.
                </p>
              </div>
            </div>
            <Button
              size="lg"
              className="h-14 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700 md:w-auto md:px-8"
              onClick={() => setStartModalOpen(true)}
            >
              <ScanBarcode className="mr-2 h-5 w-5" />
              Scan Traveler
            </Button>
          </div>
        </section>

        {detailedRuns.length === 0 ? (
          <Card className="border-dashed border-2 bg-white dark:bg-slate-900">
            <CardContent className="py-12 text-center">
              <Timer className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-lg font-medium text-muted-foreground">
                No Active Timers
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Start a timer to track production
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {detailedRuns.map((run) => (
              <TimerCard key={run.id} run={run} onTimerEvent={handleTimerEvent} toast={toast} requireFreshAuth={requireFreshAuth} getAuthHeaders={getAuthHeaders} />
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:hidden z-50 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 dark:from-slate-950 dark:via-slate-950 dark:to-slate-950/0 pt-8">
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 shadow-lg rounded-xl"
          onClick={() => setStartModalOpen(true)}
        >
          <ScanBarcode className="w-5 h-5 mr-2" />
          Scan Traveler
        </Button>
      </div>
      
      <InlineCredentialModal
        isOpen={showAuthModal}
        onClose={handleAuthModalClose}
        onSuccess={handleAuthSuccess}
        actionDescription={actionDescription}
      />
    </div>
  );
}

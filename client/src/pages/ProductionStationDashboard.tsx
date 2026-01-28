import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Pause, Play, SkipForward, Square, Clock, Timer, AlertCircle, Plus, History, Settings, Volume2, VolumeX } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import StartProductionTimerModal from '@/components/StartProductionTimerModal';
import { emitTimerEvent, subscribeToTimerEvents, type TimerEvent } from '@/lib/timerEvents';
import { startLoopingAlert, stopLoopingAlert, isLoopingAlertActive } from '@/lib/timerNotificationEffects';
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

function TimerCard({ run, onTimerEvent, toast }: { run: RunWithDetails; onTimerEvent: (event: Omit<TimerEvent, 'timestamp'>) => void; toast: ReturnType<typeof useToast>['toast'] }) {
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
      return apiRequest(`/api/production/timers/runs/${run.id}/pause`, { method: 'POST' });
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
      return apiRequest(`/api/production/timers/runs/${run.id}/resume`, { method: 'POST' });
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
      return apiRequest(`/api/production/timers/runs/${run.id}/advance`, { method: 'POST' });
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
      return apiRequest(`/api/production/timers/runs/${run.id}/stop`, { method: 'POST' });
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
          {run.serialNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Serial:</span>
              <span className="font-mono text-sm">{run.serialNumber}</span>
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
                  <span className="text-sm font-medium">{run.ovenSlot}</span>
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

        <div className="flex gap-2 pt-1">
          {run.status === 'running' && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-sm font-medium"
              onClick={() => pauseMutation.mutate()}
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
              onClick={() => resumeMutation.mutate()}
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
              onClick={() => advanceMutation.mutate()}
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
            onClick={() => stopMutation.mutate()}
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
  
  useEffect(() => {
    const unsubscribe = subscribeToTimerEvents((event) => {
      const prefs = getTimerNotificationPreferences();
      
      if (shouldStopLoopingAlert(event.eventType)) {
        stopLoopingAlert();
      }
      
      if (shouldPlayAudibleAlert(event, prefs)) {
        const showBrowserNotif = shouldShowBrowserNotification(event, prefs);
        startLoopingAlert(event.stepName || 'Step', showBrowserNotif);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6">
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
          <div className="flex items-center gap-3">
            <Link href="/app/production/timer-programs">
              <Button variant="outline" size="sm" className="h-9">
                <Settings className="w-4 h-4 mr-1.5" />
                Programs
              </Button>
            </Link>
            <Link href="/app/production/timer-history">
              <Button variant="outline" size="sm" className="h-9">
                <History className="w-4 h-4 mr-1.5" />
                History
              </Button>
            </Link>
            <Button
              size="sm"
              className="h-9 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setStartModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Start Timer
            </Button>
            <Button
              size="sm"
              variant={notificationPrefs.audibleAlertsEnabled ? "outline" : "secondary"}
              className={`h-9 ${notificationPrefs.audibleAlertsEnabled ? '' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
              onClick={toggleAudibleAlerts}
            >
              {notificationPrefs.audibleAlertsEnabled ? (
                <Volume2 className="w-4 h-4 mr-1.5" />
              ) : (
                <VolumeX className="w-4 h-4 mr-1.5" />
              )}
              {notificationPrefs.audibleAlertsEnabled ? 'Sound On' : 'Sound Off'}
            </Button>
            <div className="text-right border-l pl-3 ml-1">
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
        />

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
              <TimerCard key={run.id} run={run} onTimerEvent={handleTimerEvent} toast={toast} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

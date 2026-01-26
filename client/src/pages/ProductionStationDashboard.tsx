import { useQuery, useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pause, Play, SkipForward, Square, Clock, Timer, AlertCircle, Plus, History, Settings } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import StartProductionTimerModal from '@/components/StartProductionTimerModal';

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
      return 'bg-green-500 text-white';
    case 'paused':
      return 'bg-yellow-500 text-black';
    case 'awaiting_next':
      return 'bg-blue-500 text-white';
    case 'completed':
      return 'bg-emerald-600 text-white';
    case 'stopped':
      return 'bg-red-500 text-white';
    default:
      return 'bg-gray-500 text-white';
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

function playAlertSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.5;
    
    oscillator.start();
    
    setTimeout(() => {
      oscillator.frequency.value = 1100;
    }, 200);
    setTimeout(() => {
      oscillator.frequency.value = 880;
    }, 400);
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 600);
  } catch (e) {
    console.error('Failed to play alert sound:', e);
  }
}

function TimerCard({ run }: { run: RunWithDetails }) {
  const { toast } = useToast();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);
  const [hasTriggeredTimeout, setHasTriggeredTimeout] = useState(false);

  const currentStep = run.steps?.find(s => s.stepIndex === run.currentStepIndex);
  const totalSteps = run.steps?.length || 0;
  const totalProgramDuration = run.steps?.reduce((sum, s) => sum + s.durationSeconds, 0) || 0;

  useEffect(() => {
    const startTime = new Date(run.startedAt).getTime();
    const pauseSeconds = run.cumulativePauseSeconds || 0;
    
    if (run.status === 'completed' || run.status === 'stopped') {
      setElapsedTime(run.totalElapsedSeconds);
      setCurrentPauseSeconds(pauseSeconds);
      return;
    }

    // When paused, elapsed time is frozen but we track growing pause time for est. completion
    if (run.status === 'paused') {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000) - pauseSeconds;
      setElapsedTime(elapsed);
      
      // Update current pause seconds every second (for estimated completion to progress)
      const updatePause = () => {
        const currentNow = Date.now();
        const totalPause = Math.floor((currentNow - startTime) / 1000) - elapsed;
        setCurrentPauseSeconds(totalPause);
      };
      updatePause();
      const interval = setInterval(updatePause, 1000);
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
  }, [run.startedAt, run.status, run.totalElapsedSeconds, run.cumulativePauseSeconds]);

  const pauseMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/production/timers/runs/${run.id}/pause`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs'] });
      toast({ title: 'Timer paused' });
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
      toast({ title: 'Timer resumed' });
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
      toast({ title: 'Advanced to next step' });
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
      playAlertSound();
      toast({ title: 'Step time completed!', description: 'Press Next Step to continue' });
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
      toast({ title: 'Timer stopped' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to stop', description: error.message, variant: 'destructive' });
    },
  });

  const stepTimeRemaining = currentStep 
    ? Math.max(0, currentStep.durationSeconds - (elapsedTime % (currentStep.durationSeconds || 1)))
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
    <Card className="border-2 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Program</p>
            <CardTitle className="text-2xl font-bold">{run.program?.name || 'Unknown Program'}</CardTitle>
            {run.instanceName && (
              <p className="text-lg text-muted-foreground mt-1">{run.instanceName}</p>
            )}
          </div>
          <Badge className={`text-lg px-3 py-1 ${getStatusColor(run.status)}`}>
            {getStatusLabel(run.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {run.serialNumber && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Serial #:</span>
              <span className="font-mono font-semibold">{run.serialNumber}</span>
            </div>
          )}
          {run.mandrelNumber && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Mandrel:</span>
              <span className="font-semibold">{run.mandrelNumber}</span>
            </div>
          )}
          {run.ovenNumber && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Oven:</span>
              <span className="font-semibold">{run.ovenNumber}</span>
              {run.ovenSlot && (
                <>
                  <span className="text-muted-foreground ml-2">Slot:</span>
                  <span className="font-semibold">{run.ovenSlot}</span>
                </>
              )}
            </div>
          )}
          {run.inventoryItemId && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Item ID:</span>
              <span className="font-semibold">{run.inventoryItemId}</span>
            </div>
          )}
          {run.sku && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">SKU:</span>
              <span className="font-mono font-semibold">{run.sku}</span>
            </div>
          )}
        </div>

        <div className="bg-muted rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current Step:</span>
            <span className="text-xl font-semibold">
              {currentStep?.stepName || `Step ${run.currentStepIndex + 1}`}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Progress:</span>
            <span className="text-lg">
              Step {run.currentStepIndex + 1} of {totalSteps}
            </span>
          </div>
          {(run.status === 'running' || run.status === 'paused') && currentStep && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Step Time Remaining:</span>
              <span className={`text-2xl font-mono font-bold ${run.status === 'paused' ? 'text-yellow-600' : 'text-blue-600'}`}>
                {formatTime(stepTimeRemaining)}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Started</p>
              <p className="text-lg font-semibold">
                {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Overall Time</p>
              <p className="text-xl font-mono font-semibold">
                {formatTime(elapsedTime)}
              </p>
            </div>
          </div>
          {estimatedCompletion && (
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Est. Completion</p>
                <p className="text-lg font-semibold">
                  {estimatedCompletion.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          {run.status === 'running' && (
            <Button
              size="lg"
              variant="outline"
              className="flex-1 text-lg h-14"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
            >
              {pauseMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Pause className="w-5 h-5 mr-2" />}
              Pause
            </Button>
          )}

          {(run.status === 'paused' || run.status === 'awaiting_next') && (
            <Button
              size="lg"
              className="flex-1 text-lg h-14 bg-green-600 hover:bg-green-700"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}
              Resume
            </Button>
          )}

          {run.status === 'awaiting_next' && (
            <Button
              size="lg"
              className="flex-1 text-lg h-14 bg-blue-600 hover:bg-blue-700"
              onClick={() => advanceMutation.mutate()}
              disabled={advanceMutation.isPending}
            >
              {advanceMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <SkipForward className="w-5 h-5 mr-2" />}
              Next Step
            </Button>
          )}

          <Button
            size="lg"
            variant="destructive"
            className="text-lg h-14 px-6"
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
          >
            {stopMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProductionStationDashboard() {
  const [startModalOpen, setStartModalOpen] = useState(false);
  
  const { data: runs, isLoading, error } = useQuery<ProductionProgramRun[]>({
    queryKey: ['/api/production/timers/runs'],
    refetchInterval: 2000,
  });

  const [detailedRuns, setDetailedRuns] = useState<RunWithDetails[]>([]);

  const activeRuns = runs?.filter(r => 
    r.status === 'running' || r.status === 'paused' || r.status === 'awaiting_next'
  ) || [];

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
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Timer className="w-10 h-10" />
              Timer Station
            </h1>
            <p className="text-xl text-muted-foreground mt-2">
              Live timer dashboard for production processes
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/app/production/timer-programs">
              <Button variant="outline" size="lg" className="text-lg h-14 px-6">
                <Settings className="w-5 h-5 mr-2" />
                Programs
              </Button>
            </Link>
            <Link href="/app/production/timer-history">
              <Button variant="outline" size="lg" className="text-lg h-14 px-6">
                <History className="w-5 h-5 mr-2" />
                History
              </Button>
            </Link>
            <Button
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-lg h-14 px-6"
              onClick={() => setStartModalOpen(true)}
            >
              <Plus className="w-5 h-5 mr-2" />
              Start Timer
            </Button>
            <div className="text-right">
              <p className="text-3xl font-mono font-bold">
                {new Date().toLocaleTimeString()}
              </p>
              <p className="text-muted-foreground">
                {activeRuns.length} active timer{activeRuns.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </div>

        <StartProductionTimerModal
          open={startModalOpen}
          onOpenChange={setStartModalOpen}
        />

        {detailedRuns.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="py-16 text-center">
              <Timer className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-2xl font-semibold text-muted-foreground">
                No Active Timers
              </h2>
              <p className="text-lg text-muted-foreground mt-2">
                Start a production timer to see it here
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {detailedRuns.map((run) => (
              <TimerCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

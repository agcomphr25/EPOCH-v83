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

function TimerCard({ run }: { run: RunWithDetails }) {
  const { toast } = useToast();
  const [elapsedTime, setElapsedTime] = useState(0);

  const currentStep = run.steps?.find(s => s.stepIndex === run.currentStepIndex);
  const totalSteps = run.steps?.length || 0;
  const totalProgramDuration = run.steps?.reduce((sum, s) => sum + s.durationSeconds, 0) || 0;

  useEffect(() => {
    if (run.status !== 'running') return;

    const startTime = new Date(run.startedAt).getTime();
    const updateElapsed = () => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [run.startedAt, run.status]);

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
    },
    onError: (error: any) => {
      toast({ title: 'Failed to advance', description: error.message, variant: 'destructive' });
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

  const estimatedCompletion = totalProgramDuration > 0
    ? new Date(new Date(run.startedAt).getTime() + totalProgramDuration * 1000)
    : null;

  return (
    <Card className="border-2 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
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
        {run.sku && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">SKU:</span>
            <span className="font-mono text-lg font-semibold">{run.sku}</span>
          </div>
        )}

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
          {run.status === 'running' && currentStep && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Step Time Remaining:</span>
              <span className="text-2xl font-mono font-bold text-blue-600">
                {formatTime(stepTimeRemaining)}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Total Elapsed</p>
              <p className="text-xl font-mono font-semibold">
                {formatTime(run.status === 'running' ? elapsedTime : run.totalElapsedSeconds)}
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

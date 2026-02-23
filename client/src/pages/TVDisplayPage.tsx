import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2, Timer, Tv, ExternalLink } from 'lucide-react';

interface ProductionProgramRun {
  id: string;
  programId: string;
  instanceName: string | null;
  sku: string | null;
  serialNumber: string | null;
  mandrelNumber: number | null;
  ovenNumber: number | null;
  ovenSlot: string | null;
  status: 'running' | 'paused' | 'awaiting_next' | 'completed' | 'stopped';
  currentStepIndex: number;
  startedAt: string;
  completedAt: string | null;
  totalElapsedSeconds: number;
  cumulativePauseSeconds?: number;
  lastPausedAt?: string | null;
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

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'running':
      return { bg: 'bg-emerald-500', text: 'text-white', label: 'RUNNING', pulse: true };
    case 'paused':
      return { bg: 'bg-amber-500', text: 'text-white', label: 'PAUSED', pulse: false };
    case 'awaiting_next':
      return { bg: 'bg-sky-500', text: 'text-white', label: 'AWAITING', pulse: true };
    default:
      return { bg: 'bg-gray-500', text: 'text-white', label: status.toUpperCase(), pulse: false };
  }
}

function TVTimerCard({ run }: { run: ProductionProgramRun }) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentPauseSeconds, setCurrentPauseSeconds] = useState(0);

  const currentStep = run.steps?.find(s => s.stepIndex === run.currentStepIndex);
  const totalSteps = run.steps?.length || 0;
  const totalProgramDuration = run.steps?.reduce((sum, s) => sum + s.durationSeconds, 0) || 0;

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

    if (run.status === 'paused' || run.status === 'awaiting_next') {
      const pausedAtTime = run.lastPausedAt ? new Date(run.lastPausedAt).getTime() : Date.now();
      const frozenElapsed = Math.floor((pausedAtTime - startTime) / 1000) - pauseSeconds;
      setElapsedTime(frozenElapsed);

      const updateDelay = () => {
        const currentNow = Date.now();
        const totalDelay = Math.floor((currentNow - startTime) / 1000) - frozenElapsed;
        setCurrentPauseSeconds(totalDelay);
      };
      updateDelay();
      const interval = setInterval(updateDelay, 1000);
      return () => clearInterval(interval);
    }

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

  const elapsedInCurrentStep = Math.max(0, elapsedTime - priorStepsDuration);
  const stepTimeRemaining = currentStep
    ? Math.max(0, currentStep.durationSeconds - elapsedInCurrentStep)
    : 0;

  const stepProgress = currentStep && currentStep.durationSeconds > 0
    ? Math.min(100, (elapsedInCurrentStep / currentStep.durationSeconds) * 100)
    : 0;

  const estimatedCompletion = totalProgramDuration > 0
    ? new Date(new Date(run.startedAt).getTime() + (totalProgramDuration + currentPauseSeconds) * 1000)
    : null;

  const status = getStatusStyle(run.status);
  const isOvertime = currentStep && elapsedInCurrentStep > currentStep.durationSeconds;

  return (
    <div className={`rounded-xl border-2 p-4 xl:p-5 transition-all ${
      isOvertime ? 'border-red-500 bg-red-950/30' :
      run.status === 'paused' ? 'border-amber-500/50 bg-amber-950/20' :
      run.status === 'awaiting_next' ? 'border-sky-500/50 bg-sky-950/20 animate-pulse' :
      'border-slate-700 bg-slate-900/50'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg xl:text-xl font-bold text-white truncate">
            {run.program?.name || 'Unknown'}
          </h3>
          {run.instanceName && (
            <p className="text-sm text-slate-400 truncate">{run.instanceName}</p>
          )}
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${status.bg} ${status.text} ${status.pulse ? 'animate-pulse' : ''}`}>
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm text-slate-400 mb-3">
        {run.serialNumber && (
          <div><span className="text-slate-500">SN:</span> <span className="font-mono text-slate-300">{run.serialNumber}</span></div>
        )}
        {run.mandrelNumber && (
          <div><span className="text-slate-500">Mandrel:</span> <span className="text-slate-300">{run.mandrelNumber}</span></div>
        )}
        {run.ovenNumber && (
          <div>
            <span className="text-slate-500">Oven:</span> <span className="text-slate-300">{run.ovenNumber}</span>
            {run.ovenSlot && <span className="text-slate-400 ml-1">({run.ovenSlot === 'A' ? 'R' : run.ovenSlot === 'B' ? 'L' : run.ovenSlot})</span>}
          </div>
        )}
        {run.sku && (
          <div><span className="text-slate-500">SKU:</span> <span className="font-mono text-slate-300">{run.sku}</span></div>
        )}
      </div>

      <div className="bg-slate-800/60 rounded-lg p-3 mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500 uppercase tracking-wider">
            Step {run.currentStepIndex + 1}/{totalSteps}
          </span>
          <span className="text-sm font-semibold text-slate-200">
            {currentStep?.stepName || `Step ${run.currentStepIndex + 1}`}
          </span>
        </div>

        <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
          <div
            className={`h-2 rounded-full transition-all duration-1000 ${
              isOvertime ? 'bg-red-500' :
              stepProgress > 80 ? 'bg-amber-500' :
              'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(stepProgress, 100)}%` }}
          />
        </div>

        <div className="text-center">
          <span className={`text-3xl xl:text-4xl font-mono font-bold ${
            isOvertime ? 'text-red-400' :
            run.status === 'paused' ? 'text-amber-400' :
            stepTimeRemaining < 60 ? 'text-amber-400' :
            'text-emerald-400'
          }`}>
            {isOvertime ? '-' : ''}{formatTime(isOvertime ? elapsedInCurrentStep - currentStep!.durationSeconds : stepTimeRemaining)}
          </span>
          <p className="text-xs text-slate-500 mt-0.5">
            {isOvertime ? 'OVERTIME' : 'remaining'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <div>
          <span>Started </span>
          <span className="text-slate-400">
            {new Date(run.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
          </span>
        </div>
        <div>
          <span>Elapsed </span>
          <span className="font-mono text-slate-400">{formatTime(Math.min(elapsedTime, totalProgramDuration))}</span>
        </div>
        {estimatedCompletion && (
          <div>
            <span>Done </span>
            <span className="text-slate-400">
              ~{estimatedCompletion.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TVDisplayPage() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [slidesUrl, setSlidesUrl] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [inputUrl, setInputUrl] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('tv-display-slides-url');
    if (saved) setSlidesUrl(saved);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { data: runs, isLoading } = useQuery<ProductionProgramRun[]>({
    queryKey: ['/api/production/timers/runs'],
    queryFn: async () => {
      const response = await fetch('/api/production/timers/runs');
      if (!response.ok) throw new Error('Failed to load timer data');
      return response.json();
    },
    refetchInterval: 2000,
  });

  const [detailedRuns, setDetailedRuns] = useState<ProductionProgramRun[]>([]);

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
            if (response.ok) return await response.json();
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

  const convertSlidesUrl = (url: string): string => {
    if (!url) return '';
    if (url.includes('/embed')) return url;
    const match = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return `https://docs.google.com/presentation/d/${match[1]}/embed?start=true&loop=true&delayms=10000`;
    }
    return url;
  };

  const handleSaveSlides = () => {
    const embedUrl = convertSlidesUrl(inputUrl);
    setSlidesUrl(embedUrl);
    localStorage.setItem('tv-display-slides-url', embedUrl);
    setIsConfiguring(false);
  };

  const handleClearSlides = () => {
    setSlidesUrl('');
    localStorage.removeItem('tv-display-slides-url');
    setIsConfiguring(false);
  };

  const hasSlides = slidesUrl.length > 0;

  return (
    <div className="fixed inset-0 bg-slate-950 text-white overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 xl:px-6 py-2 bg-slate-900/80 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <Tv className="w-5 h-5 text-emerald-400" />
          <h1 className="text-lg font-bold text-white">Production Floor</h1>
          <Badge variant="outline" className="text-emerald-400 border-emerald-500/50 text-xs">
            {activeRuns.length} active
          </Badge>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setInputUrl(slidesUrl); setIsConfiguring(!isConfiguring); }}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            {hasSlides ? 'Edit Slides' : 'Add Slides'}
          </button>
          <div className="text-right">
            <p className="text-2xl font-mono font-bold text-white tracking-wider">
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </p>
            <p className="text-xs text-slate-500">
              {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {isConfiguring && (
        <div className="px-4 xl:px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 max-w-2xl">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste Google Slides URL or embed link..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleSaveSlides}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-sm font-medium transition-colors"
            >
              Save
            </button>
            {hasSlides && (
              <button
                onClick={handleClearSlides}
                className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 rounded-lg text-sm font-medium transition-colors"
              >
                Remove
              </button>
            )}
            <button
              onClick={() => setIsConfiguring(false)}
              className="px-3 py-2 text-slate-400 hover:text-white text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Paste any Google Slides URL - it will be auto-converted to an embedded view with auto-advance.
          </p>
        </div>
      )}

      <div className={`flex-1 flex min-h-0 ${hasSlides ? '' : ''}`}>
        <div className={`${hasSlides ? 'w-1/2 border-r border-slate-800' : 'w-full'} overflow-y-auto p-4 xl:p-6`}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
            </div>
          ) : detailedRuns.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Timer className="w-16 h-16 mx-auto text-slate-700 mb-4" />
                <p className="text-2xl font-semibold text-slate-600">No Active Timers</p>
                <p className="text-slate-500 mt-1">Timers will appear here when started</p>
              </div>
            </div>
          ) : (
            <div className={`grid gap-4 ${
              !hasSlides
                ? detailedRuns.length <= 4
                  ? 'grid-cols-1 md:grid-cols-2 max-w-5xl mx-auto'
                  : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                : detailedRuns.length <= 2
                  ? 'grid-cols-1'
                  : 'grid-cols-1 xl:grid-cols-2'
            }`}>
              {detailedRuns.map((run) => (
                <TVTimerCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>

        {hasSlides && (
          <div className="w-1/2 bg-black">
            <iframe
              src={slidesUrl}
              className="w-full h-full border-0"
              allowFullScreen
              title="Google Slides Presentation"
            />
          </div>
        )}
      </div>
    </div>
  );
}

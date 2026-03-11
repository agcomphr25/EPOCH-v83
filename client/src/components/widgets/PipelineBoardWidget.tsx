import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Loader2, AlertCircle, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface PipelineProject {
  projectId: string;
  projectCode: string;
  projectName: string;
  customerName: string;
  currentStage: string;
  status: string;
  targetShipDate: string | null;
  stageUpdatedAt: string | null;
}

const PIPELINE_STAGES = [
  { key: 'rfq_received', label: 'RFQ Received' },
  { key: 'quote_preparing', label: 'Quote Prep' },
  { key: 'quote_submitted', label: 'Quote Sent' },
  { key: 'purchase_review', label: 'Purchase Review' },
  { key: 'po_received', label: 'PO Received' },
  { key: 'production', label: 'Production' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'completed', label: 'Completed' },
];

const STAGE_BG: Record<string, string> = {
  rfq_received: 'bg-slate-100 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600',
  quote_preparing: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700',
  quote_submitted: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-700',
  purchase_review: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700',
  po_received: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700',
  production: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700',
  shipping: 'bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700',
  completed: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700',
};

const HEADER_BG: Record<string, string> = {
  rfq_received: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100',
  quote_preparing: 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-100',
  quote_submitted: 'bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100',
  purchase_review: 'bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-100',
  po_received: 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-100',
  production: 'bg-indigo-200 dark:bg-indigo-800 text-indigo-800 dark:text-indigo-100',
  shipping: 'bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-100',
  completed: 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-100',
};

function getDaysInStage(stageUpdatedAt: string | null): number {
  if (!stageUpdatedAt) return 0;
  const diff = Date.now() - new Date(stageUpdatedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function ProjectCard({ project, onNavigate }: { project: PipelineProject; onNavigate: (path: string) => void }) {
  const daysInStage = getDaysInStage(project.stageUpdatedAt);

  return (
    <div
      className="bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-2 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={() => onNavigate(`/projects/${project.projectId}`)}
    >
      <p className="font-semibold text-xs truncate text-gray-900 dark:text-gray-100">{project.projectCode}</p>
      <p className="text-[11px] text-muted-foreground truncate">{project.projectName}</p>
      <div className="flex items-center justify-between mt-1 text-[11px]">
        {project.targetShipDate ? (
          <span className="flex items-center gap-0.5 text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" />
            {new Date(project.targetShipDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        ) : (
          <span />
        )}
        <span className={`flex items-center gap-0.5 ${daysInStage > 14 ? 'text-red-500 font-medium' : daysInStage > 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
          <Clock className="h-2.5 w-2.5" />
          {daysInStage}d
        </span>
      </div>
    </div>
  );
}

interface PipelineBoardWidgetProps {
  className?: string;
}

export default function PipelineBoardWidget({ className }: PipelineBoardWidgetProps) {
  const [, setLocation] = useLocation();
  const { data: projects = [], isLoading, isError } = useQuery<PipelineProject[]>({
    queryKey: ['/api/projects/pipeline'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm py-8 justify-center">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load pipeline data</span>
      </div>
    );
  }

  const grouped = PIPELINE_STAGES.map((stage) => ({
    stage,
    projects: projects.filter((p) => p.currentStage === stage.key),
  }));

  const activeCount = projects.filter((p) => p.currentStage !== 'completed').length;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {activeCount} active project{activeCount !== 1 ? 's' : ''} across {PIPELINE_STAGES.length} stages
        </p>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setLocation('/projects/pipeline')}>
          <ExternalLink className="h-3 w-3" />
          Full Board
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {grouped.map(({ stage, projects: stageProjects }) => (
          <div
            key={stage.key}
            className={`flex flex-col min-w-[160px] w-[160px] flex-shrink-0 rounded-lg border ${STAGE_BG[stage.key] || 'bg-gray-50 border-gray-200'}`}
          >
            <div className={`px-2.5 py-1.5 rounded-t-lg text-xs font-medium flex items-center justify-between ${HEADER_BG[stage.key] || 'bg-gray-200 text-gray-800'}`}>
              <span className="truncate">{stage.label}</span>
              <Badge variant="secondary" className="ml-1 h-4 min-w-[16px] text-[10px] font-bold px-1">
                {stageProjects.length}
              </Badge>
            </div>
            <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[260px]">
              {stageProjects.map((project) => (
                <ProjectCard key={project.projectId} project={project} onNavigate={setLocation} />
              ))}
              {stageProjects.length === 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-6 italic">
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Calendar, Clock, ExternalLink, FileText, LayoutDashboard, MoreVertical, Package } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface PipelineProject {
  projectId: string;
  projectCode: string;
  projectName: string;
  customerName: string;
  currentStage: string;
  status: string;
  targetShipDate: string | null;
  stageUpdatedAt: string | null;
  poId: number | null;
}

const PIPELINE_STAGES = [
  { key: 'rfq_received', label: 'RFQ Received' },
  { key: 'quote_preparing', label: 'Quote Preparing' },
  { key: 'quote_submitted', label: 'Quote Submitted' },
  { key: 'purchase_review', label: 'Purchase Review' },
  { key: 'po_received', label: 'PO Received' },
  { key: 'production', label: 'Production' },
  { key: 'completed', label: 'Completed' },
];

const STAGE_COLORS: Record<string, string> = {
  rfq_received: 'bg-slate-100 border-slate-300',
  quote_preparing: 'bg-amber-50 border-amber-200',
  quote_submitted: 'bg-yellow-50 border-yellow-200',
  purchase_review: 'bg-orange-50 border-orange-200',
  po_received: 'bg-blue-50 border-blue-200',
  production: 'bg-indigo-50 border-indigo-200',
  completed: 'bg-green-50 border-green-200',
};

const HEADER_COLORS: Record<string, string> = {
  rfq_received: 'bg-slate-200 text-slate-800',
  quote_preparing: 'bg-amber-200 text-amber-800',
  quote_submitted: 'bg-yellow-200 text-yellow-800',
  purchase_review: 'bg-orange-200 text-orange-800',
  po_received: 'bg-blue-200 text-blue-800',
  production: 'bg-indigo-200 text-indigo-800',
  completed: 'bg-green-200 text-green-800',
};

function getDaysInStage(stageUpdatedAt: string | null): number {
  if (!stageUpdatedAt) return 0;
  const diff = Date.now() - new Date(stageUpdatedAt).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function DraggableCard({ project, onNavigate }: { project: PipelineProject; onNavigate: (path: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.projectId,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
    transition: isDragging ? 'none' : undefined,
  };

  const daysInStage = getDaysInStage(project.stageUpdatedAt);

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        onClick={() => onNavigate(`/projects/${project.projectId}`)}
        className={[
          'cursor-pointer select-none',
          'shadow-sm border border-gray-200 dark:border-gray-700',
          'hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/[0.02]',
          'active:scale-[0.98] active:shadow-md active:translate-y-0',
          'transition-all duration-150 ease-out',
          isDragging ? 'ring-2 ring-primary shadow-xl' : '',
        ].join(' ')}
      >
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">{project.projectCode}</p>
              <p className="text-xs text-muted-foreground truncate">{project.projectName}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mr-1 -mt-1 flex-shrink-0 opacity-0 group-hover:opacity-100"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavigate(`/projects/${project.projectId}`); }}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Project
                </DropdownMenuItem>
                <DropdownMenuItem
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavigate('/p2-quote-form'); }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Open Quote
                </DropdownMenuItem>
                {project.poId && (
                  <DropdownMenuItem
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onNavigate('/p2-control-center'); }}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    Open PO
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate">{project.customerName}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            {project.targetShipDate && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>{new Date(project.targetShipDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            )}
            <div className={`flex items-center gap-1 ${daysInStage > 14 ? 'text-red-500 font-medium' : daysInStage > 7 ? 'text-amber-500' : 'text-muted-foreground'}`}>
              <Clock className="h-3 w-3" />
              <span>{daysInStage}d</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableColumn({ stage, projects, onNavigate }: { stage: typeof PIPELINE_STAGES[number]; projects: PipelineProject[]; onNavigate: (path: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.key,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[220px] w-[220px] rounded-lg border ${STAGE_COLORS[stage.key] || 'bg-gray-50 border-gray-200'} ${isOver ? 'ring-2 ring-primary ring-offset-1' : ''} transition-all`}
    >
      <div className={`px-3 py-2 rounded-t-lg font-medium text-sm flex items-center justify-between ${HEADER_COLORS[stage.key] || 'bg-gray-200 text-gray-800'}`}>
        <span className="truncate">{stage.label}</span>
        <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs font-bold px-1.5">
          {projects.length}
        </Badge>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-220px)]">
        {projects.map((project) => (
          <DraggableCard key={project.projectId} project={project} onNavigate={onNavigate} />
        ))}
        {projects.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8 italic">
            No projects
          </div>
        )}
      </div>
    </div>
  );
}

function OverlayCard({ project }: { project: PipelineProject }) {
  const daysInStage = getDaysInStage(project.stageUpdatedAt);
  return (
    <Card className="shadow-lg ring-2 ring-primary w-[204px] cursor-grabbing">
      <CardContent className="p-3 space-y-2">
        <div>
          <p className="font-semibold text-sm">{project.projectCode}</p>
          <p className="text-xs text-muted-foreground truncate">{project.projectName}</p>
        </div>
        <div className="text-xs text-muted-foreground truncate">{project.customerName}</div>
        <div className="flex items-center justify-between text-xs">
          {project.targetShipDate && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{new Date(project.targetShipDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{daysInStage}d</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function P2PipelineBoardPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeProject, setActiveProject] = useState<PipelineProject | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const { data: projects = [], isLoading } = useQuery<PipelineProject[]>({
    queryKey: ['/api/projects/pipeline'],
  });

  const updateStageMutation = useMutation({
    mutationFn: async ({ projectId, currentStage }: { projectId: string; currentStage: string }) => {
      return apiRequest(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentStage }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects/pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    },
    onError: () => {
      toast({ title: 'Failed to update stage', variant: 'destructive' });
    },
  });

  const groupedProjects = PIPELINE_STAGES.map((stage) => ({
    stage,
    projects: projects.filter((p) => p.currentStage === stage.key),
  }));

  const handleDragStart = (event: DragStartEvent) => {
    const project = projects.find((p) => p.projectId === event.active.id);
    setActiveProject(project || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveProject(null);
    const { active, over } = event;
    if (!over) return;

    const projectId = active.id as string;
    const newStage = over.id as string;
    const project = projects.find((p) => p.projectId === projectId);
    if (!project || project.currentStage === newStage) return;

    updateStageMutation.mutate({ projectId, currentStage: newStage });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {PIPELINE_STAGES.map((s) => (
            <Skeleton key={s.key} className="min-w-[220px] h-[400px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/projects')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">P2 Pipeline Board</h1>
          <p className="text-sm text-muted-foreground">
            {projects.length} active project{projects.length !== 1 ? 's' : ''} across {PIPELINE_STAGES.length} stages
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setLocation('/projects')}>
          <LayoutDashboard className="h-4 w-4 mr-2" />
          Project Dashboard
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {groupedProjects.map(({ stage, projects: stageProjects }) => (
            <DroppableColumn
              key={stage.key}
              stage={stage}
              projects={stageProjects}
              onNavigate={setLocation}
            />
          ))}
        </div>
        <DragOverlay>
          {activeProject ? <OverlayCard project={activeProject} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

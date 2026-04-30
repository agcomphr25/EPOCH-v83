import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { LucideIcon } from 'lucide-react';
import {
  History,
  User,
  CheckCircle,
  Play,
  ClipboardCheck,
  AlertCircle,
  ArrowRight,
  FileCheck,
  TrendingUp,
  RefreshCw,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';

interface AuditEventMeta {
  department?: string;
  departmentName?: string;
  stepName?: string;
  stepNumber?: number;
  hoursAtApproval?: string | number;
  travelerId?: string;
  travelerNumber?: string;
  previousTravelerId?: string;
  previousTravelerNumber?: string;
  workOrderId?: string;
  [key: string]: unknown;
}

interface AuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  meta: AuditEventMeta | null;
  timestamp: string;
  createdAt: string;
  travelerId?: string | null;
}

interface AuditTimelineProps {
  entityType: string;
  entityId: string;
  queryUrl?: string;
  filterActions?: string[];
  emptyMessage?: string;
  /** Maps travelerId → human-readable cycle label (e.g. "Prior Cycle 1", "Current Cycle") */
  cycleMap?: Record<string, string>;
}

interface ActionConfig {
  icon: LucideIcon;
  colorClass: string;
  label: string;
}

const actionConfig: Record<string, ActionConfig> = {
  TRAVELER_STARTED: {
    icon: Play,
    colorClass: 'bg-blue-100 text-blue-700 border-blue-300',
    label: 'Traveler Started',
  },
  TRAVELER_COMPLETED: {
    icon: CheckCircle,
    colorClass: 'bg-green-100 text-green-700 border-green-300',
    label: 'Traveler Completed',
  },
  TRAVELER_STEP_STARTED: {
    icon: ArrowRight,
    colorClass: 'bg-indigo-100 text-indigo-700 border-indigo-300',
    label: 'Step Started',
  },
  TRAVELER_STEP_FINISHED: {
    icon: ClipboardCheck,
    colorClass: 'bg-teal-100 text-teal-700 border-teal-300',
    label: 'Step Finished',
  },
  QC_SIGNOFF: {
    icon: FileCheck,
    colorClass: 'bg-purple-100 text-purple-700 border-purple-300',
    label: 'QC Sign-off',
  },
  WORK_ORDER_RELEASED: {
    icon: ArrowRight,
    colorClass: 'bg-blue-100 text-blue-700 border-blue-300',
    label: 'Work Order Released',
  },
  LABOR_OVERRUN_APPROVED: {
    icon: TrendingUp,
    colorClass: 'bg-amber-100 text-amber-700 border-amber-300',
    label: 'Labor Overrun Approved',
  },
  CYCLE_SCRAPPED: {
    icon: Trash2,
    colorClass: 'bg-red-100 text-red-700 border-red-300',
    label: 'Cycle Scrapped',
  },
  CYCLE_RESTARTED: {
    icon: RotateCcw,
    colorClass: 'bg-orange-100 text-orange-700 border-orange-300',
    label: 'Cycle Restarted',
  },
};

const defaultConfig: ActionConfig = {
  icon: History,
  colorClass: 'bg-gray-100 text-gray-700 border-gray-300',
  label: '',
};

function getConfig(action: string): ActionConfig {
  return actionConfig[action] ?? { ...defaultConfig, label: action.replace(/_/g, ' ') };
}

export default function AuditTimeline({
  entityType,
  entityId,
  queryUrl,
  filterActions,
  emptyMessage = 'No audit events recorded yet',
  cycleMap,
}: AuditTimelineProps) {
  const url = queryUrl || `/api/audit/events/${entityType}/${entityId}`;

  const { data: events = [], isLoading, isError, refetch } = useQuery<AuditEvent[]>({
    queryKey: [url, entityId],
    queryFn: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch audit events');
      return res.json();
    },
    enabled: !!entityId,
  });

  const filtered = filterActions
    ? events.filter((e) => filterActions.includes(e.action))
    : events;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive opacity-70" />
        <p className="text-sm font-medium text-destructive">Failed to load audit history</p>
        <p className="text-xs mt-1 mb-3">There was a problem retrieving events from the server.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!entityId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No entity linked — audit history unavailable.</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="relative pr-2">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
        <div className="space-y-4 pl-10">
          {filtered.map((event) => {
            const { icon: Icon, colorClass, label } = getConfig(event.action);
            const ts = event.timestamp || event.createdAt;
            const dept = event.meta?.departmentName ?? event.meta?.department;
            const eventTravelerId =
              event.travelerId ??
              (event.meta?.travelerId ? String(event.meta.travelerId) : null);
            const cycleLabel = cycleMap && eventTravelerId ? cycleMap[eventTravelerId] : null;
            const isPriorCycle = cycleLabel ? cycleLabel.toLowerCase().startsWith('prior') : false;

            return (
              <div key={event.id} className="relative" data-testid={`audit-event-${event.id}`}>
                <div
                  className={`absolute -left-10 w-8 h-8 rounded-full border-2 flex items-center justify-center ${isPriorCycle ? 'opacity-60' : ''} ${colorClass}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <Card className={isPriorCycle ? 'opacity-80 border-dashed' : ''}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge variant="outline" className={`${colorClass} text-xs`}>
                            {label}
                          </Badge>
                          {cycleLabel && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${isPriorCycle ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-green-300 bg-green-50 text-green-700'}`}
                            >
                              {cycleLabel}
                            </Badge>
                          )}
                        </div>
                        {dept && (
                          <p className="text-xs text-muted-foreground">
                            Department: {dept}
                          </p>
                        )}
                        {event.meta?.stepName != null && (
                          <p className="text-xs text-muted-foreground">
                            Step: {String(event.meta.stepName)}
                          </p>
                        )}
                        {event.reason && (
                          <p className="text-sm text-muted-foreground">{event.reason}</p>
                        )}
                        {event.meta?.hoursAtApproval != null && (
                          <p className="text-xs text-muted-foreground">
                            Hours at approval:{' '}
                            {Number(event.meta.hoursAtApproval).toFixed(1)} hrs
                          </p>
                        )}
                        {(event.action === 'CYCLE_SCRAPPED' || event.action === 'CYCLE_RESTARTED') && (
                          <p className="text-xs font-medium text-muted-foreground">
                            {event.action === 'CYCLE_SCRAPPED'
                              ? `Traveler: ${event.meta?.travelerNumber ?? eventTravelerId ?? 'N/A'}`
                              : `Prior Traveler: ${event.meta?.previousTravelerNumber ?? event.meta?.travelerNumber ?? eventTravelerId ?? 'N/A'}`}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div>{format(new Date(ts), 'MMM d, yyyy')}</div>
                        <div>{format(new Date(ts), 'h:mm a')}</div>
                      </div>
                    </div>
                    {event.actorName && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        {event.actorName}
                        {event.actorRole && (
                          <Badge variant="outline" className="text-xs ml-1">
                            {event.actorRole}
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Clock,
  User,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';

interface AuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId: number | null;
  actorName: string;
  actorRole: string | null;
  reason: string | null;
  fieldsChanged: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  } | null;
  meta: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  createdAt: string;
}

interface AuditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string;
}

type FilterType = 'all' | 'changes' | 'progress' | 'sign';

export function AuditDrawer({
  open,
  onOpenChange,
  entityType,
  entityId,
}: AuditDrawerProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [page, setPage] = useState(0);
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const pageSize = 10;

  // Fetch audit events
  const { data, isLoading, error, refetch } = useQuery<{
    events: AuditEvent[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({
    queryKey: ['/api/audit/events', entityType, entityId, filter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        entityType,
        entityId,
        filter,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      const response = await fetch(`/api/audit/events?${params}`);
      if (!response.ok) throw new Error('Failed to fetch audit events');
      return response.json();
    },
    enabled: open,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Reset page when filter changes
  useEffect(() => {
    setPage(0);
  }, [filter]);

  // Track latest timestamp for real-time updates
  useEffect(() => {
    if (data?.events && data.events.length > 0) {
      const latest = data.events[0].timestamp;
      setLastTimestamp(latest);
    }
  }, [data]);

  const handleExport = useCallback(() => {
    if (!data?.events) return;

    const blob = new Blob([JSON.stringify(data.events, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityType}-${entityId}-audit.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, entityType, entityId]);

  const progressEvents =
    data?.events.filter((e) => e.action === 'progress') || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle data-testid="text-audit-title">Audit Trail</SheetTitle>
          <SheetDescription data-testid="text-audit-meta">
            {entityType} • {entityId}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col h-full mt-4">
          {/* Progress Lane */}
          {progressEvents.length > 0 && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm font-medium mb-2">Progress Timeline</div>
              <div className="flex flex-wrap gap-2">
                {progressEvents
                  .sort(
                    (a, b) =>
                      new Date(a.timestamp).getTime() -
                      new Date(b.timestamp).getTime()
                  )
                  .map((event) => (
                    <Badge
                      key={event.id}
                      variant="secondary"
                      className="text-xs"
                      data-testid={`badge-progress-${event.id}`}
                    >
                      {event.meta?.toDepartment || event.action}
                      <span className="ml-1 text-muted-foreground">
                        • {format(new Date(event.timestamp), 'MMM d')}
                      </span>
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {(['all', 'changes', 'progress', 'sign'] as FilterType[]).map(
              (f) => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(f)}
                  data-testid={`button-filter-${f}`}
                >
                  {f === 'all' && 'All'}
                  {f === 'changes' && 'Changes'}
                  {f === 'progress' && 'Progress'}
                  {f === 'sign' && 'Signatures'}
                </Button>
              )
            )}
          </div>

          {/* Events List */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : error ? (
              <div
                className="text-center text-destructive py-8"
                data-testid="text-error"
              >
                Failed to load audit events. Please try again.
              </div>
            ) : data?.events && data.events.length > 0 ? (
              <div className="space-y-3">
                {data.events.map((event) => (
                  <AuditEventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div
                className="text-center text-muted-foreground py-8"
                data-testid="text-no-events"
              >
                No audit events found
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {data?.total || 0} events
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {page + 1} / {data?.totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= (data?.totalPages || 1) - 1}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                data-testid="button-export"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AuditEventCard({ event }: { event: AuditEvent }) {
  return (
    <div
      className="border rounded-lg p-3 bg-card"
      data-testid={`card-audit-event-${event.id}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm" data-testid={`text-actor-${event.id}`}>
            {event.actorName}
          </span>
          <span className="text-xs text-muted-foreground">
            • {format(new Date(event.timestamp), 'MMM d, yyyy h:mm a')}
          </span>
        </div>
        <Badge variant="outline" data-testid={`badge-action-${event.id}`}>
          {event.action}
        </Badge>
      </div>

      {event.reason && (
        <div className="text-sm mb-2" data-testid={`text-reason-${event.id}`}>
          <strong>Reason:</strong> {event.reason}
        </div>
      )}

      {event.fieldsChanged && (
        <div
          className="bg-muted/50 rounded p-2 text-xs space-y-1"
          data-testid={`div-changes-${event.id}`}
        >
          {Object.keys(event.fieldsChanged.after || {}).map((key) => (
            <div key={key} className="grid grid-cols-3 gap-2">
              <div className="font-medium">{key}</div>
              <div className="line-through text-muted-foreground">
                {String(event.fieldsChanged?.before?.[key] ?? '')}
              </div>
              <div className="font-medium">
                {String(event.fieldsChanged?.after?.[key] ?? '')}
              </div>
            </div>
          ))}
        </div>
      )}

      {event.meta && Object.keys(event.meta).length > 0 && (
        <div
          className="mt-2 text-xs text-muted-foreground"
          data-testid={`text-meta-${event.id}`}
        >
          {event.meta.fromDepartment && event.meta.toDepartment && (
            <div>
              {event.meta.fromDepartment} → {event.meta.toDepartment}
            </div>
          )}
          {event.meta.assignedTechnician && (
            <div>Technician: {event.meta.assignedTechnician}</div>
          )}
          {event.meta.completedAt && (
            <div>
              Completed: {format(new Date(event.meta.completedAt), 'PPp')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

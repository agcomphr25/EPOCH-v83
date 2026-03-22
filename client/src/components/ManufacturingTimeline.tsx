import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { CheckCircle2, Clock, Loader2, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DepartmentTransition {
  id: number;
  entityType: string;
  entityId: string;
  department: string;
  cycleNumber: number;
  enteredAt: string;
  exitedAt: string | null;
  durationMinutes: number | null;
  exitReason: string | null;
  enteredByUserId: number | null;
  metadata: any;
}

const CENTRAL_TIMEZONE = 'America/Chicago';

function fmt(ts: string): string {
  const d = new Date(ts);
  const zoned = toZonedTime(d, CENTRAL_TIMEZONE);
  return format(zoned, 'MMM d, yyyy h:mm a');
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface Props {
  orderId: string;
}

export default function ManufacturingTimeline({ orderId }: Props) {
  const { data: transitions = [], isLoading, isError } = useQuery<DepartmentTransition[]>({
    queryKey: ['/api/audit/transitions', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/audit/transitions/${encodeURIComponent(orderId)}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load transitions');
      const data = await res.json();
      console.log(`[TIMELINE] Loaded ${data.length} transitions for ${orderId}`);
      return data;
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-8 text-center">
        <p className="text-red-500 text-sm">Failed to load manufacturing timeline.</p>
      </Card>
    );
  }

  if (transitions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground text-sm">No manufacturing history recorded yet.</p>
      </Card>
    );
  }

  const totalMinutes = transitions.reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
        <span>{transitions.length} department{transitions.length !== 1 ? 's' : ''}</span>
        <span>·</span>
        {totalMinutes > 0 && (
          <>
            <span>Total tracked: {formatDuration(totalMinutes)}</span>
            <span>·</span>
          </>
        )}
        <span>Source: order_department_transitions</span>
      </div>

      {/* Vertical process flow */}
      <div className="relative">
        <div className="absolute left-5 top-6 bottom-6 w-px bg-border" />

        <div className="space-y-3">
          {transitions.map((t, i) => {
            const isActive = t.exitedAt === null;
            const isLast = i === transitions.length - 1;

            return (
              <div key={t.id} className="relative flex gap-4">
                {/* Icon */}
                <div className="relative z-10 flex-shrink-0 w-10 flex justify-center pt-3">
                  {isActive ? (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center ring-2 ring-blue-200 dark:ring-blue-900">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                {/* Card */}
                <Card className={`flex-1 mb-1 ${isActive ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20' : ''}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      {/* Department name + badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{t.department}</span>
                        {isActive && (
                          <Badge className="text-xs bg-blue-500 text-white">In Progress</Badge>
                        )}
                        {t.cycleNumber > 1 && (
                          <Badge variant="outline" className="text-xs text-orange-600">
                            Cycle {t.cycleNumber}
                          </Badge>
                        )}
                        {t.exitReason && (
                          <Badge variant="outline" className="text-xs text-gray-500">
                            {t.exitReason}
                          </Badge>
                        )}
                      </div>

                      {/* Duration */}
                      {t.durationMinutes != null ? (
                        <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                          {formatDuration(t.durationMinutes)}
                        </span>
                      ) : isActive ? (
                        <span className="text-xs text-blue-500 flex-shrink-0">In Progress</span>
                      ) : null}
                    </div>

                    {/* Timestamps */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Entered: {fmt(t.enteredAt)}
                      </span>
                      {t.exitedAt ? (
                        <span className="flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" />
                          Exited: {fmt(t.exitedAt)}
                        </span>
                      ) : (
                        <span className="text-blue-500">Exited: —</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

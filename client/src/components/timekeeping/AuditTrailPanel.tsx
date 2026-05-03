import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  FilePen,
  FileText,
  Lock,
  Loader2,
  Plus,
  Send,
  Shield,
  XCircle,
} from 'lucide-react';

interface AuditEvent {
  id: string;
  eventType: string;
  eventTypeLabel: string;
  actorEmail: string | null;
  actorRole: string | null;
  occurredAt: string;
  details: Record<string, unknown>;
  punchSnapshot?: Record<string, unknown> | null;
}

function eventIcon(eventType: string) {
  switch (eventType) {
    case 'INSERT': return <Plus className="h-4 w-4 text-blue-600" />;
    case 'TIME_CERTIFIED':
    case 'TIME_CERTIFIED_ADMIN': return <Shield className="h-4 w-4 text-green-600" />;
    case 'TIME_CORRECTION_REQUESTED': return <FilePen className="h-4 w-4 text-orange-600" />;
    case 'TIME_CORRECTION_APPROVED': return <CheckCircle className="h-4 w-4 text-teal-600" />;
    case 'TIME_CORRECTION_REJECTED': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'UPDATE': {
      return <Clock className="h-4 w-4 text-slate-500" />;
    }
    default: return <FileText className="h-4 w-4 text-slate-400" />;
  }
}

function eventIconForLabel(label: string, eventType: string) {
  if (label === 'Submitted') return <Send className="h-4 w-4 text-blue-600" />;
  if (label === 'Certified' || label === 'Certified (Employee)') return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (label === 'Certified (Admin Override)') return <Shield className="h-4 w-4 text-orange-600" />;
  if (label === 'Locked') return <Lock className="h-4 w-4 text-slate-600" />;
  if (label === 'Returned to Draft') return <FilePen className="h-4 w-4 text-yellow-600" />;
  if (label === 'Correction Requested') return <FilePen className="h-4 w-4 text-orange-600" />;
  if (label === 'Correction Approved') return <CheckCircle className="h-4 w-4 text-teal-600" />;
  if (label === 'Correction Rejected') return <XCircle className="h-4 w-4 text-red-600" />;
  return eventIcon(eventType);
}

function eventDotColor(label: string): string {
  if (label === 'Created') return 'bg-blue-500';
  if (label.includes('Certified') || label === 'Submitted') return 'bg-green-500';
  if (label === 'Locked') return 'bg-slate-500';
  if (label === 'Correction Requested') return 'bg-orange-500';
  if (label === 'Correction Approved') return 'bg-teal-500';
  if (label === 'Correction Rejected') return 'bg-red-500';
  if (label === 'Returned to Draft') return 'bg-yellow-500';
  return 'bg-slate-400';
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function PunchSnapshotExpander({ snapshot }: { snapshot: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  const legacy = Array.isArray(snapshot.legacyPunches) ? snapshot.legacyPunches as Record<string, unknown>[] : [];
  const ledger = Array.isArray(snapshot.ledgerSessions) ? snapshot.ledgerSessions as Record<string, unknown>[] : [];

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
        Punch Snapshot ({legacy.length} punches, {ledger.length} sessions)
      </Button>
      {open && (
        <div className="mt-1 rounded border bg-muted/40 p-3 text-xs space-y-3">
          <div className="text-muted-foreground">
            Captured at: {snapshot.capturedAt ? formatDateTime(String(snapshot.capturedAt)) : '—'}
            {' · '}Period: {String(snapshot.periodStart ?? '—')} – {String(snapshot.periodEnd ?? '—')}
            {' · '}Total hours: {snapshot.totalHours != null ? String(snapshot.totalHours) : '—'}
          </div>
          {legacy.length > 0 && (
            <div>
              <div className="font-medium mb-1 text-foreground">Legacy Punches</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-0.5 pr-3">Type</th>
                    <th className="text-left py-0.5 pr-3">Punched At</th>
                    <th className="text-left py-0.5">Cost Code</th>
                  </tr>
                </thead>
                <tbody>
                  {legacy.map((p, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-0.5 pr-3">{String(p.type ?? '—')}</td>
                      <td className="py-0.5 pr-3">{p.punchedAt ? formatDateTime(String(p.punchedAt)) : '—'}</td>
                      <td className="py-0.5">{String(p.costCode ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ledger.length > 0 && (
            <div>
              <div className="font-medium mb-1 text-foreground">Ledger Sessions</div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-0.5 pr-3">Clock In</th>
                    <th className="text-left py-0.5 pr-3">Clock Out</th>
                    <th className="text-left py-0.5 pr-3">Class</th>
                    <th className="text-left py-0.5">Charge Code</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-0.5 pr-3">{s.clockIn ? formatDateTime(String(s.clockIn)) : '—'}</td>
                      <td className="py-0.5 pr-3">{s.clockOut ? formatDateTime(String(s.clockOut)) : 'Open'}</td>
                      <td className="py-0.5 pr-3">{String(s.laborClass ?? '—')}</td>
                      <td className="py-0.5">{String(s.chargeCode ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {legacy.length === 0 && ledger.length === 0 && (
            <div className="text-muted-foreground italic">No punch data in snapshot.</div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: AuditEvent }) {
  const icon = eventIconForLabel(event.eventTypeLabel, event.eventType);
  const dotColor = eventDotColor(event.eventTypeLabel);
  // Show snapshot expander for any Certified event that has a punchSnapshot object,
  // even when the snapshot arrays are empty (to satisfy auditability requirements).
  const hasPunchSnapshot = !!(
    event.punchSnapshot &&
    (event.eventType === "TIME_CERTIFIED" || event.eventType === "TIME_CERTIFIED_ADMIN")
  );

  const detailEntries = Object.entries(event.details).filter(([, v]) => v != null && v !== '');

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="pb-5 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {icon}
          <span className="font-medium text-sm">{event.eventTypeLabel}</span>
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatDateTime(event.occurredAt)}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
          {event.actorEmail && (
            <div>
              Actor: <span className="text-foreground">{event.actorEmail}</span>
              {event.actorRole && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0">
                  {event.actorRole}
                </Badge>
              )}
            </div>
          )}
          {!event.actorEmail && <div className="italic">System / unknown actor</div>}
        </div>
        {detailEntries.length > 0 && (
          <div className="mt-1.5 rounded bg-muted/50 px-2.5 py-1.5 text-xs space-y-0.5">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground capitalize min-w-[110px] shrink-0">
                  {k.replace(/([A-Z])/g, ' $1').toLowerCase()}:
                </span>
                <span className="break-all">{String(v)}</span>
              </div>
            ))}
          </div>
        )}
        {hasPunchSnapshot && (
          <PunchSnapshotExpander snapshot={event.punchSnapshot!} />
        )}
      </div>
    </div>
  );
}

interface LifecycleIssue {
  label: string;
  kind: 'missing' | 'out-of-order';
}

function detectLifecycleIssues(events: AuditEvent[]): LifecycleIssue[] {
  const issues: LifecycleIssue[] = [];

  const createdAt = events.find(e => e.eventType === 'INSERT')?.occurredAt ?? null;
  const submittedAt = events.find(e => e.eventTypeLabel === 'Submitted')?.occurredAt ?? null;
  const certifiedAt = events.find(
    e => e.eventType === 'TIME_CERTIFIED' || e.eventType === 'TIME_CERTIFIED_ADMIN' || e.eventTypeLabel === 'Certified'
  )?.occurredAt ?? null;

  if (!createdAt) issues.push({ label: 'Created', kind: 'missing' });
  if (!submittedAt) issues.push({ label: 'Submitted', kind: 'missing' });
  if (!certifiedAt) issues.push({ label: 'Certified', kind: 'missing' });

  // Ordering checks — only when both endpoints are present
  if (createdAt && submittedAt && submittedAt < createdAt) {
    issues.push({ label: 'Submitted appears before Created', kind: 'out-of-order' });
  }
  if (submittedAt && certifiedAt && certifiedAt < submittedAt) {
    issues.push({ label: 'Certified appears before Submitted', kind: 'out-of-order' });
  }
  if (createdAt && certifiedAt && certifiedAt < createdAt) {
    issues.push({ label: 'Certified appears before Created', kind: 'out-of-order' });
  }

  return issues;
}

function IncompletenessWarning({ events }: { events: AuditEvent[] }) {
  const issues = detectLifecycleIssues(events);
  if (issues.length === 0) return null;

  const missing = issues.filter(i => i.kind === 'missing').map(i => i.label);
  const outOfOrder = issues.filter(i => i.kind === 'out-of-order').map(i => i.label);

  return (
    <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/40 px-3 py-2.5 text-sm text-yellow-800 dark:text-yellow-300 mb-4">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-yellow-600 dark:text-yellow-400" />
      <div className="space-y-0.5">
        <span className="font-medium">Incomplete or out-of-order trail detected.</span>
        {missing.length > 0 && (
          <div>
            Missing events:{' '}
            <span className="font-semibold">{missing.join(', ')}</span>.
          </div>
        )}
        {outOfOrder.length > 0 && (
          <div>
            Sequence anomalies:{' '}
            <span className="font-semibold">{outOfOrder.join('; ')}</span>.
          </div>
        )}
        <div className="text-xs opacity-80 mt-0.5">
          This may indicate the timesheet was created or modified outside the normal workflow.
        </div>
      </div>
    </div>
  );
}

interface AuditTrailPanelProps {
  timesheetId: number | null;
  timesheetLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuditTrailPanel({ timesheetId, timesheetLabel, open, onOpenChange }: AuditTrailPanelProps) {
  const { data: events, isLoading, error } = useQuery<AuditEvent[]>({
    queryKey: ['/api/timekeeping/timesheets', timesheetId, 'audit-trail'],
    queryFn: async () => {
      const res = await fetch(`/api/timekeeping/timesheets/${timesheetId}/audit-trail`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load audit trail');
      }
      return res.json();
    },
    enabled: open && timesheetId != null,
    staleTime: 30_000,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Audit Trail
            {timesheetLabel && (
              <span className="text-sm font-normal text-muted-foreground ml-1">— {timesheetLabel}</span>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Read-only chronological timeline of all recorded events for this timesheet.
          </p>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading audit trail…</span>
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error instanceof Error ? error.message : 'Failed to load audit trail.'}
          </div>
        ) : !events?.length ? (
          <div className="text-sm text-muted-foreground text-center py-12 italic">
            No audit events found for this timesheet.
          </div>
        ) : (
          <>
            <IncompletenessWarning events={events} />
            <div className="space-y-0">
              {events.map((event, idx) => (
                <div key={event.id} className={idx === events.length - 1 ? '[&_.flex-1.bg-border]:hidden' : ''}>
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

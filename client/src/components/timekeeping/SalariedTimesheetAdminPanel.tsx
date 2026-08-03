import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, CheckCircle, Eye, Loader2, Plus, RotateCcw, XCircle } from 'lucide-react';

type ReviewRow = {
  timesheet: { id: number; employeeId: number; periodStart: string; periodEnd: string; status: string; totalActualHours: number };
  employeeName: string | null;
  pendingDraftCount: number;
  needsReviewDraftCount: number;
};

type Detail = {
  timesheet: ReviewRow['timesheet'] & Record<string, unknown>;
  employee: { id: number; name: string; department: string | null };
  lines: Array<{ id: number; date: string; lineType: string; hours: number; travelerId?: string | null; note?: string | null; source: string }>;
  drafts: Array<{ id: number; entryDate: string; status: string; totalHours: number; source: string; validationErrors?: unknown }>;
  audit: Array<{ id: number; action: string; actorName?: string | null; reason?: string | null; timestamp: string }>;
};

type Holiday = { id: number; holidayDate: string; name: string; hours: number; isActive: boolean };

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `Request failed (${response.status})`);
  return payload as T;
}

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    OPEN: 'bg-amber-100 text-amber-800',
    REOPENED: 'bg-orange-100 text-orange-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    SUPERVISOR_APPROVED: 'bg-indigo-100 text-indigo-800',
    PAYROLL_APPROVED: 'bg-green-100 text-green-800',
  };
  return <Badge className={classes[status] ?? 'bg-slate-100 text-slate-700'}>{status.replaceAll('_', ' ')}</Badge>;
}

export function SalariedTimesheetAdminPanel() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [action, setAction] = useState<'approve' | 'return' | 'payroll' | 'reopen' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [holidayHours, setHolidayHours] = useState('8');

  const queue = useQuery<ReviewRow[]>({
    queryKey: ['/api/timekeeping/salaried-timesheet/admin/review'],
    queryFn: () => jsonRequest('/api/timekeeping/salaried-timesheet/admin/review'),
    refetchInterval: 60_000,
  });
  const detail = useQuery<Detail>({
    queryKey: ['/api/timekeeping/salaried-timesheet/review-detail', selectedId],
    queryFn: () => jsonRequest(`/api/timekeeping/salaried-timesheet/${selectedId}/review-detail`),
    enabled: selectedId != null,
  });
  const holidays = useQuery<Holiday[]>({
    queryKey: ['/api/timekeeping/salaried-holidays'],
    queryFn: () => jsonRequest('/api/timekeeping/salaried-holidays'),
    retry: false,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/salaried-timesheet/admin/review'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/salaried-timesheet/review-detail', selectedId] }),
    ]);
  };

  const actionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId || !action) return;
      const map = {
        approve: { path: 'supervisor-approve', body: { note: actionNote || undefined } },
        return: { path: 'supervisor-reject', body: { note: actionNote } },
        payroll: { path: 'payroll-approve', body: {} },
        reopen: { path: 'reopen', body: { reason: actionNote } },
      } as const;
      const selected = map[action];
      return jsonRequest(`/api/timekeeping/salaried-timesheet/${selectedId}/${selected.path}`, { method: 'POST', body: JSON.stringify(selected.body) });
    },
    onSuccess: async () => {
      toast({ title: 'Timesheet updated', description: 'The controlled workflow status has been updated.' });
      setAction(null); setActionNote(''); await refresh();
    },
    onError: (error: Error) => toast({ title: 'Unable to update timesheet', description: error.message, variant: 'destructive' }),
  });

  const holidayMutation = useMutation({
    mutationFn: () => jsonRequest('/api/timekeeping/salaried-holidays', {
      method: 'POST', body: JSON.stringify({ holidayDate, name: holidayName, hours: Number(holidayHours), isActive: true }),
    }),
    onSuccess: async () => {
      setHolidayDate(''); setHolidayName(''); setHolidayHours('8');
      await queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/salaried-holidays'] });
      toast({ title: 'Holiday added', description: 'Open salaried timesheets will use the maintained calendar.' });
    },
    onError: (error: Error) => toast({ title: 'Unable to add holiday', description: error.message, variant: 'destructive' }),
  });

  const toggleHoliday = useMutation({
    mutationFn: (holiday: Holiday) => jsonRequest(`/api/timekeeping/salaried-holidays/${holiday.id}`, {
      method: 'PATCH', body: JSON.stringify({ isActive: !holiday.isActive }),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/timekeeping/salaried-holidays'] }),
  });

  const selected = detail.data;
  const needsReason = action === 'return' || action === 'reopen';

  return <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Salaried Timesheet Review</CardTitle>
        <CardDescription>Weekly entry → employee certification → supervisor review → payroll final approval. Draft entry is an optional way to populate the same weekly record.</CardDescription>
      </CardHeader>
      <CardContent>
        {queue.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : queue.error ? <p className="text-sm text-red-600">{(queue.error as Error).message}</p> :
          <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Hours</TableHead><TableHead>Drafts</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{(queue.data ?? []).map(row => <TableRow key={row.timesheet.id}>
            <TableCell className="font-medium">{row.employeeName ?? `Employee #${row.timesheet.employeeId}`}</TableCell>
            <TableCell>{row.timesheet.periodStart} – {row.timesheet.periodEnd}</TableCell>
            <TableCell>{statusBadge(row.timesheet.status)}</TableCell>
            <TableCell className="text-right font-mono">{Number(row.timesheet.totalActualHours).toFixed(2)}</TableCell>
            <TableCell>{row.needsReviewDraftCount ? <Badge variant="destructive">{row.needsReviewDraftCount} need review</Badge> : row.pendingDraftCount ? <Badge variant="outline">{row.pendingDraftCount} pending</Badge> : '—'}</TableCell>
            <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setSelectedId(row.timesheet.id)}><Eye className="mr-1 h-4 w-4" />Review</Button></TableCell>
          </TableRow>)}</TableBody></Table>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Salaried Holiday Calendar</CardTitle><CardDescription>Administratively maintained paid holidays. Changes synchronize to open or reopened weekly timesheets.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[160px_1fr_100px_auto]">
          <Input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)} />
          <Input placeholder="Holiday name" value={holidayName} onChange={e => setHolidayName(e.target.value)} />
          <Input type="number" min="0.25" max="24" step="0.25" value={holidayHours} onChange={e => setHolidayHours(e.target.value)} />
          <Button onClick={() => holidayMutation.mutate()} disabled={!holidayDate || holidayName.trim().length < 2 || holidayMutation.isPending}><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>
        {holidays.error ? <p className="text-sm text-muted-foreground">Holiday administration requires an Administrator or Owner account.</p> :
          <div className="max-h-64 overflow-auto rounded border"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead>Hours</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{(holidays.data ?? []).map(h => <TableRow key={h.id}><TableCell>{h.holidayDate}</TableCell><TableCell>{h.name}</TableCell><TableCell>{h.hours}</TableCell><TableCell>{h.isActive ? 'Active' : 'Inactive'}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => toggleHoliday.mutate(h)}>{h.isActive ? 'Deactivate' : 'Restore'}</Button></TableCell></TableRow>)}</TableBody></Table></div>}
      </CardContent>
    </Card>

    <Dialog open={selectedId != null} onOpenChange={open => { if (!open) setSelectedId(null); }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>{selected?.employee.name ?? 'Salaried Timesheet'} {selected ? `• ${selected.timesheet.periodStart} – ${selected.timesheet.periodEnd}` : ''}</DialogTitle></DialogHeader>
        {detail.isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : detail.error ? <p className="text-red-600">{(detail.error as Error).message}</p> : selected && <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">{statusBadge(selected.timesheet.status)}<span className="font-mono">{Number(selected.timesheet.totalActualHours).toFixed(2)} hours</span>{selected.employee.department && <span className="text-muted-foreground">{selected.employee.department}</span>}</div>
          <div><h3 className="mb-2 font-semibold">Weekly entries</h3><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Traveler / source</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Hours</TableHead></TableRow></TableHeader><TableBody>{selected.lines.map(line => <TableRow key={line.id}><TableCell>{line.date}</TableCell><TableCell>{line.lineType}</TableCell><TableCell>{line.travelerId || line.source}</TableCell><TableCell>{line.note || '—'}</TableCell><TableCell className="text-right font-mono">{Number(line.hours).toFixed(2)}</TableCell></TableRow>)}</TableBody></Table></div>
          <div><h3 className="mb-2 font-semibold">Daily entry drafts</h3>{selected.drafts.length ? <div className="flex flex-wrap gap-2">{selected.drafts.map(d => <Badge key={d.id} variant={d.status === 'NEEDS_REVIEW' ? 'destructive' : 'outline'}>{d.entryDate}: {d.status} ({Number(d.totalHours).toFixed(2)}h)</Badge>)}</div> : <p className="text-sm text-muted-foreground">No separate drafts. Weekly entries are the controlling record.</p>}</div>
          <div><h3 className="mb-2 font-semibold">Audit history</h3><div className="max-h-48 space-y-2 overflow-auto">{selected.audit.map(item => <div key={item.id} className="rounded border p-2 text-sm"><span className="font-medium">{item.action.replaceAll('_', ' ')}</span> · {item.actorName || 'System'} · {new Date(item.timestamp).toLocaleString()}{item.reason && <div className="text-muted-foreground">{item.reason}</div>}</div>)}</div></div>
          <DialogFooter className="flex-wrap">
            {selected.timesheet.status === 'SUBMITTED' && <><Button variant="outline" onClick={() => setAction('return')}><XCircle className="mr-1 h-4 w-4" />Return for Correction</Button><Button onClick={() => setAction('approve')}><CheckCircle className="mr-1 h-4 w-4" />Supervisor Approve</Button></>}
            {selected.timesheet.status === 'SUPERVISOR_APPROVED' && <><Button variant="outline" onClick={() => setAction('reopen')}><RotateCcw className="mr-1 h-4 w-4" />Reopen</Button><Button onClick={() => setAction('payroll')}><CheckCircle className="mr-1 h-4 w-4" />Payroll Final Approve</Button></>}
            {selected.timesheet.status === 'PAYROLL_APPROVED' && <Button variant="outline" onClick={() => setAction('reopen')}><RotateCcw className="mr-1 h-4 w-4" />Controlled Reopen</Button>}
          </DialogFooter>
        </div>}
      </DialogContent>
    </Dialog>

    <Dialog open={action != null} onOpenChange={open => { if (!open) { setAction(null); setActionNote(''); } }}>
      <DialogContent><DialogHeader><DialogTitle>{action === 'approve' ? 'Supervisor approval' : action === 'return' ? 'Return for correction' : action === 'payroll' ? 'Payroll final approval' : 'Controlled reopen'}</DialogTitle></DialogHeader>
        <div className="space-y-2"><Label>{needsReason ? 'Reason (required)' : 'Review note (optional)'}</Label><Textarea value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder={needsReason ? 'Explain why the employee must correct this record.' : 'Optional approval note'} /></div>
        <DialogFooter><Button variant="outline" onClick={() => setAction(null)}>Cancel</Button><Button onClick={() => actionMutation.mutate()} disabled={actionMutation.isPending || (needsReason && actionNote.trim().length < 3)}>{actionMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Confirm</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

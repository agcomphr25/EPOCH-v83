import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  Plus,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Send,
  X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type SessionStatus =
  | 'SCHEDULED' | 'IN_PROGRESS' | 'PENDING_REVIEW' | 'APPROVED' | 'POSTED' | 'CANCELLED'
  | 'DRAFT' | 'COMPLETED'; // legacy

interface CycleCountLine {
  id: number;
  sessionId: number;
  agPartNumber: string;
  materialName: string | null;
  expectedQty: string;
  countedQty: string | null;
  varianceQty: string | null;
  varianceWithinTolerance: boolean | null;
  approvalStatus: string | null;
  countedByDisplayName: string | null;
  countedAt: string | null;
  ledgerEntryId: string | null;
  notes: string | null;
}

interface CycleCountSession {
  id: number;
  sessionNumber: string | null;
  status: SessionStatus;
  countType: string;
  location: string;
  partFilter: string | null;
  scheduledFor: string | null;
  blindCount: boolean;
  variancePolicyId: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string | null;
  performedByDisplayName: string | null;
  performedAt: string | null;
  approvedByDisplayName: string | null;
  approvedAt: string | null;
  postedByDisplayName: string | null;
  postedAt: string | null;
  lines?: CycleCountLine[];
}

interface VariancePolicy {
  id: string;
  name: string;
  description: string | null;
  qtyTolerance: string;
  percentTolerance: string;
  isDefault: boolean;
}

interface VarianceHistoryRow extends CycleCountLine {
  sessionNumber: string | null;
  postedAt: string | null;
}

const API_BASE = '/api/inventory/cycle-counts';

// ── Utilities ──────────────────────────────────────────────────────────────

function formatQty(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    SCHEDULED: { label: 'Scheduled', className: 'border-gray-300 text-gray-700 bg-gray-50' },
    DRAFT: { label: 'Draft', className: 'border-gray-300 text-gray-700' },
    IN_PROGRESS: { label: 'In Progress', className: 'border-blue-400 text-blue-700 bg-blue-50' },
    PENDING_REVIEW: { label: 'Pending Review', className: 'border-amber-400 text-amber-700 bg-amber-50' },
    COMPLETED: { label: 'Pending Review', className: 'border-amber-400 text-amber-700 bg-amber-50' },
    APPROVED: { label: 'Approved', className: 'border-green-400 text-green-700 bg-green-50' },
    POSTED: { label: 'Posted', className: 'border-purple-400 text-purple-700 bg-purple-50' },
    CANCELLED: { label: 'Cancelled', className: 'border-red-300 text-red-700 bg-red-50' },
  };
  const cfg = map[status] ?? { label: status, className: 'border-gray-300 text-gray-700' };
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`} data-testid={`status-${status}`}>
      {status === 'POSTED' && <Lock className="h-3 w-3 mr-1" />}
      {cfg.label}
    </Badge>
  );
}

function VarianceBadge({ variance }: { variance: number }) {
  if (variance === 0) {
    return (
      <Badge variant="outline" className="border-green-400 text-green-700 bg-green-50 text-xs">
        <CheckCircle2 className="h-3 w-3 mr-1" />0
      </Badge>
    );
  }
  const cls = variance > 0
    ? 'border-emerald-400 text-emerald-700 bg-emerald-50'
    : 'border-red-400 text-red-700 bg-red-50';
  const sign = variance > 0 ? '+' : '';
  return (
    <Badge variant="outline" className={`${cls} text-xs`}>
      <AlertTriangle className="h-3 w-3 mr-1" />
      {sign}{variance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
    </Badge>
  );
}

// ── Create Session Dialog ──────────────────────────────────────────────────

function CreateSessionDialog({ onCreated }: { onCreated: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState('ALL');
  const [partFilter, setPartFilter] = useState('');
  const [countType, setCountType] = useState<'CYCLE' | 'FULL' | 'SPOT' | 'ABC'>('CYCLE');
  const [scheduledFor, setScheduledFor] = useState('');
  const [blindCount, setBlindCount] = useState(true);
  const [variancePolicyId, setVariancePolicyId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const { data: policies = [] } = useQuery<VariancePolicy[]>({
    queryKey: [API_BASE, 'variance-policies'],
    queryFn: async () => apiRequest(`${API_BASE}/variance-policies`),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        location,
        partFilter: partFilter.trim() || null,
        countType,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        blindCount,
        variancePolicyId: variancePolicyId || null,
        notes: notes.trim() || null,
      };
      return apiRequest(API_BASE, { method: 'POST', body }) as Promise<CycleCountSession>;
    },
    onSuccess: (sess) => {
      toast.success(`Session ${sess.sessionNumber ?? `#${sess.id}`} created`);
      queryClient.invalidateQueries({ queryKey: [API_BASE] });
      setOpen(false);
      setPartFilter(''); setNotes(''); setScheduledFor('');
      onCreated(sess.id);
    },
    onError: (e: any) => toast.error(e?.responseData?.error ?? e?.message ?? 'Create failed'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-cycle-count">
          <Plus className="h-4 w-4 mr-2" /> New Cycle Count
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Cycle Count Session</DialogTitle>
          <DialogDescription>
            Pre-populate the count list from active material lots at the chosen location.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Count Type</Label>
              <Select value={countType} onValueChange={(v: any) => setCountType(v)}>
                <SelectTrigger data-testid="select-count-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CYCLE">Cycle (recurring)</SelectItem>
                  <SelectItem value="FULL">Full Inventory</SelectItem>
                  <SelectItem value="SPOT">Spot Check</SelectItem>
                  <SelectItem value="ABC">ABC Class</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="ALL or specific location"
                data-testid="input-location"
              />
            </div>
          </div>
          <div>
            <Label>Part Filter (optional)</Label>
            <Input
              value={partFilter}
              onChange={(e) => setPartFilter(e.target.value)}
              placeholder="Specific AG Part#"
              data-testid="input-part-filter"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Scheduled For (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                data-testid="input-scheduled-for"
              />
            </div>
            <div>
              <Label>Variance Policy</Label>
              <Select value={variancePolicyId} onValueChange={setVariancePolicyId}>
                <SelectTrigger data-testid="select-variance-policy">
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.isDefault ? ' (default)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Switch
              id="blind-count"
              checked={blindCount}
              onCheckedChange={setBlindCount}
              data-testid="switch-blind-count"
            />
            <Label htmlFor="blind-count" className="cursor-pointer flex items-center gap-2">
              {blindCount ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Blind count (counter cannot see expected quantity)
            </Label>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} data-testid="input-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-confirm-create">
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Session List ───────────────────────────────────────────────────────────

function SessionTable({ sessions, onSelect }: { sessions: CycleCountSession[]; onSelect: (id: number) => void }) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-no-sessions">
        No sessions in this view.
      </div>
    );
  }
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session #</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Counted by</TableHead>
            <TableHead>Approved by</TableHead>
            <TableHead>Posted by</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
              <TableCell className="font-mono text-xs">{s.sessionNumber ?? `#${s.id}`}</TableCell>
              <TableCell className="text-xs">{s.countType ?? 'CYCLE'}</TableCell>
              <TableCell className="text-xs">{s.location}</TableCell>
              <TableCell><StatusBadge status={s.status} /></TableCell>
              <TableCell className="text-xs">{s.createdAt ? format(new Date(s.createdAt), 'MMM d, h:mm a') : '—'}</TableCell>
              <TableCell className="text-xs">{s.performedByDisplayName ?? '—'}</TableCell>
              <TableCell className="text-xs">{s.approvedByDisplayName ?? '—'}</TableCell>
              <TableCell className="text-xs">{s.postedByDisplayName ?? '—'}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" onClick={() => onSelect(s.id)} data-testid={`button-open-session-${s.id}`}>
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Session Detail ─────────────────────────────────────────────────────────

function SessionDetail({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [reveal, setReveal] = useState(false);
  const [localCounts, setLocalCounts] = useState<Record<number, string>>({});
  const [localNotes, setLocalNotes] = useState<Record<number, string>>({});

  const { data: session, isLoading } = useQuery<CycleCountSession>({
    queryKey: [API_BASE, sessionId, reveal],
    queryFn: async () => apiRequest(`${API_BASE}/${sessionId}${reveal ? '?reveal=true' : ''}`),
  });

  const recordMutation = useMutation({
    mutationFn: async () => {
      const counts = Object.entries(localCounts)
        .filter(([_, v]) => v !== '' && !Number.isNaN(parseFloat(v)))
        .map(([lineId, v]) => ({
          lineId: parseInt(lineId, 10),
          countedQty: parseFloat(v),
          notes: localNotes[parseInt(lineId, 10)],
        }));
      if (counts.length === 0) throw new Error('No counts to save');
      return apiRequest(`${API_BASE}/${sessionId}/counts`, { method: 'POST', body: { counts } });
    },
    onSuccess: () => {
      toast.success('Counts saved');
      setLocalCounts({}); setLocalNotes({});
      qc.invalidateQueries({ queryKey: [API_BASE] });
    },
    onError: (e: any) => toast.error(e?.responseData?.error ?? e?.message ?? 'Save failed'),
  });

  const transitionMutation = useMutation({
    mutationFn: async (action: 'submit' | 'approve' | 'post' | 'cancel') => {
      return apiRequest(`${API_BASE}/${sessionId}/${action}`, { method: 'POST' });
    },
    onSuccess: (_data, action) => {
      toast.success(`Session ${action}ed`);
      qc.invalidateQueries({ queryKey: [API_BASE] });
    },
    onError: (e: any) => toast.error(e?.responseData?.error ?? e?.message ?? 'Action failed'),
  });

  if (isLoading || !session) {
    return (
      <div className="p-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading session…
      </div>
    );
  }

  const lines = session.lines ?? [];
  const isInProgress = session.status === 'IN_PROGRESS';
  const isLocked = session.status === 'POSTED' || session.status === 'CANCELLED';
  const canSubmit = isInProgress;
  const canApprove = session.status === 'PENDING_REVIEW' || session.status === 'COMPLETED';
  const canPost = session.status === 'APPROVED';

  const totalVariance = lines.reduce((s, l) => s + (l.varianceQty ? parseFloat(l.varianceQty) : 0), 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-list">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          {session.blindCount && isInProgress && (
            <Button size="sm" variant="outline" onClick={() => setReveal((r) => !r)} data-testid="button-toggle-reveal">
              {reveal ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
              {reveal ? 'Hide Expected' : 'Reveal Expected (Admin)'}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <span className="font-mono">{session.sessionNumber ?? `#${session.id}`}</span>
                <StatusBadge status={session.status} />
                {session.blindCount && (
                  <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                    <EyeOff className="h-3 w-3 mr-1" /> Blind
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {session.countType} · {session.location} · created by {session.createdBy}
                {session.scheduledFor && ` · scheduled ${format(new Date(session.scheduledFor), 'MMM d, h:mm a')}`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canSubmit && (
                <Button size="sm" onClick={() => transitionMutation.mutate('submit')} disabled={transitionMutation.isPending} data-testid="button-submit">
                  <Send className="h-4 w-4 mr-2" /> Submit for Review
                </Button>
              )}
              {canApprove && (
                <Button size="sm" variant="secondary" onClick={() => transitionMutation.mutate('approve')} disabled={transitionMutation.isPending} data-testid="button-approve">
                  <ShieldCheck className="h-4 w-4 mr-2" /> Approve
                </Button>
              )}
              {canPost && (
                <Button size="sm" onClick={() => transitionMutation.mutate('post')} disabled={transitionMutation.isPending} data-testid="button-post">
                  <Lock className="h-4 w-4 mr-2" /> Post Adjustments
                </Button>
              )}
              {!isLocked && session.status !== 'POSTED' && (
                <Button size="sm" variant="ghost" onClick={() => transitionMutation.mutate('cancel')} disabled={transitionMutation.isPending} data-testid="button-cancel">
                  <X className="h-4 w-4 mr-2" /> Cancel
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-b pb-3 mb-3">
            <div><div className="text-muted-foreground text-xs">Counted by</div><div>{session.performedByDisplayName ?? '—'}</div></div>
            <div><div className="text-muted-foreground text-xs">Approved by</div><div>{session.approvedByDisplayName ?? '—'}</div></div>
            <div><div className="text-muted-foreground text-xs">Posted by</div><div>{session.postedByDisplayName ?? '—'}</div></div>
            <div><div className="text-muted-foreground text-xs">Total variance</div><div className={totalVariance < 0 ? 'text-red-600' : totalVariance > 0 ? 'text-emerald-600' : ''}>{totalVariance > 0 ? '+' : ''}{formatQty(totalVariance)}</div></div>
          </div>

          {lines.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No lines in this session.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>AG Part#</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Approval</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const expected = parseFloat(line.expectedQty || '0');
                  const counted = localCounts[line.id] ?? line.countedQty ?? '';
                  const variance = line.varianceQty != null ? parseFloat(line.varianceQty) : null;
                  const blind = session.blindCount && isInProgress && !reveal;
                  return (
                    <TableRow key={line.id} data-testid={`row-line-${line.id}`}>
                      <TableCell className="font-mono text-xs">{line.agPartNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{line.materialName ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {blind ? <span className="text-muted-foreground italic text-xs">hidden</span> : formatQty(expected)}
                      </TableCell>
                      <TableCell className="text-right">
                        {isInProgress ? (
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            className="w-28 h-7 text-right text-sm ml-auto"
                            value={counted as string}
                            onChange={(e) => setLocalCounts(prev => ({ ...prev, [line.id]: e.target.value }))}
                            data-testid={`input-count-${line.id}`}
                          />
                        ) : (
                          <span className="tabular-nums text-sm">{formatQty(line.countedQty)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {blind ? <span className="text-muted-foreground italic text-xs">—</span> : (variance != null ? <VarianceBadge variance={variance} /> : <span className="text-xs text-muted-foreground">—</span>)}
                      </TableCell>
                      <TableCell>
                        {line.approvalStatus && (
                          <Badge variant="outline" className="text-xs">
                            {line.approvalStatus}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isInProgress ? (
                          <Input
                            className="h-7 text-sm min-w-[120px]"
                            placeholder="Notes…"
                            value={localNotes[line.id] ?? line.notes ?? ''}
                            onChange={(e) => setLocalNotes(prev => ({ ...prev, [line.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">{line.notes ?? '—'}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {isInProgress && Object.keys(localCounts).length > 0 && (
            <div className="flex justify-end mt-3">
              <Button onClick={() => recordMutation.mutate()} disabled={recordMutation.isPending} data-testid="button-save-counts">
                {recordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Counts ({Object.keys(localCounts).length})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Variance History ───────────────────────────────────────────────────────

function VarianceHistoryTab() {
  const { data: history = [], isLoading } = useQuery<VarianceHistoryRow[]>({
    queryKey: [API_BASE, 'variance-history'],
    queryFn: async () => apiRequest(`${API_BASE}/variance-history?limit=200`),
  });
  if (isLoading) return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>;
  if (history.length === 0) return <div className="text-center py-12 text-muted-foreground text-sm">No posted variances yet.</div>;
  const significant = history.filter(r => r.varianceQty != null && parseFloat(r.varianceQty) !== 0);
  return (
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Posted At</TableHead>
            <TableHead>Session</TableHead>
            <TableHead>AG Part#</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Counted</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead>Counter</TableHead>
            <TableHead>Ledger Entry</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {significant.map((row) => (
            <TableRow key={row.id} data-testid={`row-history-${row.id}`}>
              <TableCell className="text-xs">{row.postedAt ? format(new Date(row.postedAt), 'MMM d, h:mm a') : '—'}</TableCell>
              <TableCell className="font-mono text-xs">{row.sessionNumber ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs">{row.agPartNumber}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{formatQty(row.expectedQty)}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{formatQty(row.countedQty)}</TableCell>
              <TableCell className="text-right">
                <VarianceBadge variance={row.varianceQty ? parseFloat(row.varianceQty) : 0} />
              </TableCell>
              <TableCell className="text-xs">{row.countedByDisplayName ?? '—'}</TableCell>
              <TableCell className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]">{row.ledgerEntryId ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function CycleCountPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>('in_progress');

  const { data: sessions = [], isLoading } = useQuery<CycleCountSession[]>({
    queryKey: [API_BASE],
    queryFn: async () => apiRequest(API_BASE),
  });

  const buckets = useMemo(() => {
    const scheduled = sessions.filter(s => s.status === 'SCHEDULED');
    const inProgress = sessions.filter(s => s.status === 'IN_PROGRESS' || s.status === 'DRAFT');
    const pending = sessions.filter(s => s.status === 'PENDING_REVIEW' || s.status === 'COMPLETED' || s.status === 'APPROVED');
    const posted = sessions.filter(s => s.status === 'POSTED');
    return { scheduled, inProgress, pending, posted };
  }, [sessions]);

  if (selectedSessionId != null) {
    return <SessionDetail sessionId={selectedSessionId} onBack={() => setSelectedSessionId(null)} />;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Cycle Counts
          </h1>
          <p className="text-sm text-muted-foreground">
            Blind physical inventory counts with segregation-of-duties workflow. Posted variances flow to the immutable inventory ledger.
          </p>
        </div>
        <CreateSessionDialog onCreated={(id) => setSelectedSessionId(id)} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="scheduled" data-testid="tab-scheduled">
            Scheduled <Badge variant="secondary" className="ml-2">{buckets.scheduled.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="in_progress" data-testid="tab-in-progress">
            In Progress <Badge variant="secondary" className="ml-2">{buckets.inProgress.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending_review" data-testid="tab-pending-review">
            Pending Review <Badge variant="secondary" className="ml-2">{buckets.pending.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="posted" data-testid="tab-posted">
            Posted <Badge variant="secondary" className="ml-2">{buckets.posted.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-variance-history">Variance History</TabsTrigger>
        </TabsList>

        <TabsContent value="scheduled">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SessionTable sessions={buckets.scheduled} onSelect={setSelectedSessionId} />}
        </TabsContent>
        <TabsContent value="in_progress">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SessionTable sessions={buckets.inProgress} onSelect={setSelectedSessionId} />}
        </TabsContent>
        <TabsContent value="pending_review">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SessionTable sessions={buckets.pending} onSelect={setSelectedSessionId} />}
        </TabsContent>
        <TabsContent value="posted">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SessionTable sessions={buckets.posted} onSelect={setSelectedSessionId} />}
        </TabsContent>
        <TabsContent value="history">
          <VarianceHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

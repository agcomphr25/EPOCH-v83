import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  ClipboardList,
  Plus,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Lock,
  PackageSearch,
  RefreshCw,
} from 'lucide-react';

interface CycleCountSession {
  id: number;
  location: string;
  partFilter: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  postedAt: string | null;
  notes: string | null;
  lines?: CycleCountLine[];
}

interface CycleCountLine {
  id: number;
  sessionId: number;
  agPartNumber: string;
  materialName: string | null;
  expectedQty: string;
  countedQty: string | null;
  varianceQty: string | null;
  notes: string | null;
}

interface ApiError {
  responseData?: { error?: string };
  message?: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Draft', className: 'border-gray-300 text-gray-600' },
    IN_PROGRESS: { label: 'In Progress', className: 'border-blue-400 text-blue-700 bg-blue-50' },
    COMPLETED: { label: 'Completed', className: 'border-green-400 text-green-700 bg-green-50' },
    POSTED: { label: 'Posted', className: 'border-purple-400 text-purple-700 bg-purple-50' },
  };
  const cfg = map[status] ?? { label: status, className: 'border-gray-300 text-gray-600' };
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
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
  if (variance > 0) {
    return (
      <Badge variant="outline" className="border-emerald-400 text-emerald-700 bg-emerald-50 text-xs">
        +{variance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-red-400 text-red-700 bg-red-50 text-xs">
      <AlertTriangle className="h-3 w-3 mr-1" />
      {variance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
    </Badge>
  );
}

function formatQty(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  if (isNaN(num)) return '—';
  return Number.isInteger(num)
    ? num.toLocaleString()
    : num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

// ── Session List View ──────────────────────────────────────────────────────────

function SessionList({ onSelect }: { onSelect: (id: number) => void }) {
  const { data: sessions = [], isLoading, isFetching, refetch } = useQuery<CycleCountSession[]>({
    queryKey: ['/api/inventory/cycle-count'],
    staleTime: 30_000,
  });

  const [newOpen, setNewOpen] = useState(false);
  const [location, setLocation] = useState('');
  const [partFilter, setPartFilter] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (body: { location: string; partFilter?: string }) =>
      apiRequest('/api/inventory/cycle-count', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (session: CycleCountSession) => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/cycle-count'] });
      toast.success('Cycle count session created');
      setNewOpen(false);
      setLocation('');
      setPartFilter('');
      onSelect(session.id);
    },
    onError: (err: ApiError) => {
      toast.error(err?.responseData?.error || err?.message || 'Failed to create session');
    },
  });

  const handleCreate = () => {
    if (!location.trim()) { toast.error('Location is required'); return; }
    createMutation.mutate({
      location: location.trim(),
      partFilter: partFilter.trim() || undefined,
    });
  };

  const activeSessions = sessions.filter(s => s.status !== 'POSTED');
  const postedSessions = sessions.filter(s => s.status === 'POSTED');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Cycle Counts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Physical inventory verification sessions for AS9100 audit readiness.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Session
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading sessions…</span>
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <PackageSearch className="h-10 w-10 opacity-40" />
            <p className="text-sm">No cycle count sessions yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Active Sessions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Part Filter</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSessions.map(s => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => onSelect(s.id)}
                      >
                        <TableCell className="font-mono text-sm">#{s.id}</TableCell>
                        <TableCell className="font-medium">{s.location}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.partFilter ?? '—'}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                        <TableCell className="text-sm">{s.createdBy}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(s.createdAt), 'MMM d, yyyy h:mm a')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {postedSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-muted-foreground">Posted Sessions (Audit Records)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Part Filter</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Posted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {postedSessions.map(s => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer hover:bg-muted/50 opacity-75"
                        onClick={() => onSelect(s.id)}
                      >
                        <TableCell className="font-mono text-sm">#{s.id}</TableCell>
                        <TableCell className="font-medium">{s.location}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.partFilter ?? '—'}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                        <TableCell className="text-sm">{s.createdBy}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {s.postedAt ? format(new Date(s.postedAt), 'MMM d, yyyy h:mm a') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Cycle Count Session</DialogTitle>
            <DialogDescription>
              Select a storage location to count. The system will pre-populate expected quantities from active material lots.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="cc-location">Location <span className="text-red-500">*</span></Label>
              <Input
                id="cc-location"
                placeholder="e.g. Freezer #1, Rack A, ALL"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Enter "ALL" to include all locations.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc-part">Part Number Filter (optional)</Label>
              <Input
                id="cc-part"
                placeholder="e.g. 10042"
                value={partFilter}
                onChange={e => setPartFilter(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Leave blank to include all parts at the selected location.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Session Detail View ────────────────────────────────────────────────────────

function SessionDetail({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useQuery<CycleCountSession & { lines: CycleCountLine[] }>({
    queryKey: ['/api/inventory/cycle-count', sessionId],
    staleTime: 10_000,
  });

  // Local state for editing counted quantities
  const [localCounts, setLocalCounts] = useState<Record<number, string>>({});
  const [localNotes, setLocalNotes] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const isPosted = session?.status === 'POSTED';
  const isCompleted = session?.status === 'COMPLETED';
  const isLocked = isPosted || isCompleted;

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/cycle-count/${sessionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/cycle-count', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/cycle-count'] });
      toast.success('Session submitted for review');
      setSubmitConfirmOpen(false);
    },
    onError: (err: ApiError) => {
      toast.error(err?.responseData?.error || err?.message || 'Failed to submit session');
      setSubmitConfirmOpen(false);
    },
  });

  const postMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/inventory/cycle-count/${sessionId}/post`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/cycle-count', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/cycle-count'] });
      toast.success('Cycle count posted and inventory adjusted');
      setPostConfirmOpen(false);
    },
    onError: (err: ApiError) => {
      toast.error(err?.responseData?.error || err?.message || 'Failed to post session');
      setPostConfirmOpen(false);
    },
  });

  const handleSaveCounts = async (): Promise<boolean> => {
    if (!session) return false;
    setIsSaving(true);
    try {
      const updates = session.lines
        .filter(l => localCounts[l.id] !== undefined || localNotes[l.id] !== undefined)
        .map(l => ({
          id: l.id,
          countedQty: localCounts[l.id] !== undefined ? (localCounts[l.id] === '' ? null : localCounts[l.id]) : l.countedQty,
          notes: localNotes[l.id] !== undefined ? localNotes[l.id] : (l.notes ?? undefined),
        }));

      if (updates.length === 0) { toast('No changes to save'); setIsSaving(false); return true; }

      await apiRequest(`/api/inventory/cycle-count/${sessionId}/lines`, {
        method: 'PATCH',
        body: JSON.stringify({ lines: updates }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/cycle-count', sessionId] });
      setLocalCounts({});
      setLocalNotes({});
      toast.success('Counts saved');
      return true;
    } catch (err) {
      const apiErr = err as ApiError;
      toast.error(apiErr?.responseData?.error || apiErr?.message || 'Failed to save counts');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    // Auto-save any pending local changes before submitting
    if (hasPendingLocalChanges) {
      const saved = await handleSaveCounts();
      if (!saved) {
        toast.error('Could not save counts before submitting. Please save manually first.');
        return;
      }
    }
    submitMutation.mutate();
  };

  const handlePost = () => {
    postMutation.mutate();
  };

  const getEffectiveCounted = (line: CycleCountLine): number | null => {
    if (localCounts[line.id] !== undefined) {
      const v = localCounts[line.id];
      if (v === '') return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    }
    if (line.countedQty != null) return parseFloat(line.countedQty);
    return null;
  };

  const getEffectiveVariance = (line: CycleCountLine): number | null => {
    const counted = getEffectiveCounted(line);
    if (counted == null) return null;
    return counted - parseFloat(line.expectedQty);
  };

  // Totals
  const lines = session?.lines ?? [];
  const totalExpected = lines.reduce((sum, l) => sum + parseFloat(l.expectedQty), 0);
  const totalCounted = lines.reduce((sum, l) => {
    const c = getEffectiveCounted(l);
    return c != null ? sum + c : sum;
  }, 0);
  const totalVariance = lines.reduce((sum, l) => {
    const v = getEffectiveVariance(l);
    return v != null ? sum + v : sum;
  }, 0);

  const hasAnyCounts = lines.some(l => getEffectiveCounted(l) != null);
  const hasPendingLocalChanges = Object.keys(localCounts).length > 0 || Object.keys(localNotes).length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading session…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <PackageSearch className="h-10 w-10 opacity-40" />
        <p>Session not found.</p>
        <Button variant="outline" onClick={onBack}>Back to Sessions</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-1">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">Cycle Count #{session.id}</h1>
              <StatusBadge status={session.status} />
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              Location: <span className="font-medium text-foreground">{session.location}</span>
              {session.partFilter && (
                <> · Part filter: <span className="font-medium text-foreground">{session.partFilter}</span></>
              )}
              {' · '}Created by <span className="font-medium text-foreground">{session.createdBy}</span>
              {' '}on {format(new Date(session.createdAt), 'MMM d, yyyy h:mm a')}
              {session.postedAt && (
                <> · Posted {format(new Date(session.postedAt), 'MMM d, yyyy h:mm a')}</>
              )}
            </p>
          </div>
        </div>
        {session.status === 'IN_PROGRESS' && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveCounts}
              disabled={isSaving || !hasPendingLocalChanges}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Counts
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSubmitConfirmOpen(true)}
              disabled={!hasAnyCounts || submitMutation.isPending || isSaving}
            >
              {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit for Review
            </Button>
          </div>
        )}
        {session.status === 'COMPLETED' && (
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => setPostConfirmOpen(true)}
              disabled={postMutation.isPending}
            >
              {postMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Post Session
            </Button>
          </div>
        )}
      </div>

      {/* Totals Row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Expected</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{formatQty(totalExpected)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Counted</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{hasAnyCounts ? formatQty(totalCounted) : '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card className={Math.abs(totalVariance) > 0 ? 'border-orange-300' : ''}>
          <CardHeader className="pb-2">
            <CardDescription>Total Variance</CardDescription>
            <CardTitle className={`text-2xl tabular-nums ${totalVariance < 0 ? 'text-red-600' : totalVariance > 0 ? 'text-emerald-600' : 'text-green-600'}`}>
              {hasAnyCounts ? (totalVariance > 0 ? '+' : '') + formatQty(totalVariance) : '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Count Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Count Lines
            {lines.length > 0 && (
              <span className="ml-2 text-muted-foreground font-normal text-sm">({lines.length} parts)</span>
            )}
          </CardTitle>
          {session.status === 'IN_PROGRESS' && (
            <CardDescription>
              Enter counted quantities below. Variance is calculated automatically.
            </CardDescription>
          )}
          {isCompleted && (
            <CardDescription className="text-amber-600">
              Session submitted for review. Counts are locked. Click Post Session to apply inventory adjustments.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <PackageSearch className="h-8 w-8 opacity-40" />
              <p className="text-sm">No material lots found for the selected location and filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Material Name</TableHead>
                    <TableHead className="text-right">Expected Qty</TableHead>
                    <TableHead className="text-right w-36">Counted Qty</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    {!isLocked && <TableHead>Notes</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map(line => {
                    const effectiveCounted = getEffectiveCounted(line);
                    const effectiveVariance = getEffectiveVariance(line);
                    const hasVariance = effectiveVariance != null && effectiveVariance !== 0;
                    return (
                      <TableRow
                        key={line.id}
                        className={hasVariance
                          ? effectiveVariance! < 0
                            ? 'bg-red-50 dark:bg-red-950/20'
                            : 'bg-emerald-50 dark:bg-emerald-950/20'
                          : ''}
                      >
                        <TableCell className="font-mono font-medium text-sm">{line.agPartNumber}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {line.materialName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatQty(line.expectedQty)}
                        </TableCell>
                        <TableCell className="text-right">
                          {isLocked ? (
                            <span className="tabular-nums text-sm">{formatQty(line.countedQty)}</span>
                          ) : (
                            <Input
                              type="number"
                              step="any"
                              min="0"
                              className="w-28 h-7 text-right text-sm ml-auto"
                              placeholder="Enter qty"
                              value={localCounts[line.id] ?? line.countedQty ?? ''}
                              onChange={e => setLocalCounts(prev => ({ ...prev, [line.id]: e.target.value }))}
                            />
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {effectiveVariance != null ? (
                            <VarianceBadge variance={effectiveVariance} />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        {!isLocked && (
                          <TableCell>
                            <Input
                              className="h-7 text-sm min-w-[120px]"
                              placeholder="Notes…"
                              value={localNotes[line.id] ?? line.notes ?? ''}
                              onChange={e => setLocalNotes(prev => ({ ...prev, [line.id]: e.target.value }))}
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {isLocked && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {isPosted
            ? 'This session is posted and read-only. All inventory adjustments have been applied.'
            : 'This session is submitted and counts are locked. Post the session to apply inventory adjustments.'}
        </p>
      )}

      {/* Submit Confirmation Dialog */}
      <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Review</DialogTitle>
            <DialogDescription>
              This will lock the counted quantities and move the session to review. You can then Post the session to apply inventory adjustments.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lines with counts entered:</span>
              <span className="font-medium">{lines.filter(l => getEffectiveCounted(l) != null).length} / {lines.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Non-zero variance lines:</span>
              <span className="font-medium">{lines.filter(l => getEffectiveVariance(l) !== null && getEffectiveVariance(l) !== 0).length}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="secondary"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Confirmation Dialog */}
      <Dialog open={postConfirmOpen} onOpenChange={setPostConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post Cycle Count Session</DialogTitle>
            <DialogDescription>
              This will apply inventory adjustments for all non-zero variance lines and permanently lock this session.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lines with counts entered:</span>
              <span className="font-medium">{lines.filter(l => getEffectiveCounted(l) != null).length} / {lines.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Non-zero variance lines:</span>
              <span className="font-medium">{lines.filter(l => getEffectiveVariance(l) !== null && getEffectiveVariance(l) !== 0).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total variance to apply:</span>
              <span className={`font-medium ${totalVariance < 0 ? 'text-red-600' : totalVariance > 0 ? 'text-emerald-600' : 'text-green-600'}`}>
                {totalVariance > 0 ? '+' : ''}{formatQty(totalVariance)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPostConfirmOpen(false)}>Cancel</Button>
            <Button
              onClick={handlePost}
              disabled={postMutation.isPending}
            >
              {postMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Post Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CycleCountPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  if (selectedSessionId != null) {
    return (
      <SessionDetail
        sessionId={selectedSessionId}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  return <SessionList onSelect={(id) => setSelectedSessionId(id)} />;
}

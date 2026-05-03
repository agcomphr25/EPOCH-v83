import { useState, useMemo, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronDown, ChevronRight, AlertTriangle, ExternalLink, RefreshCw,
  ShieldAlert, ClipboardList, CheckCircle2, XCircle, Flag, FlagOff,
  Calendar, Shield, BookOpen, Pencil, History, AlertOctagon
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

type BackfillPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface BackfillRow {
  dpasRequired: boolean;
  cocRequired: boolean;
  mtrRequired: boolean;
  sourceInspectionRequired: boolean;
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName: string;
  status: string;
  issueDate: string | null;
  complianceStatus: string;
  reviewStatus: string | null;
  farRequired: boolean;
  governmentContract: boolean;
  hasFarStatement: boolean;
  missingReview: boolean;
  missingFarStatement: boolean;
  missingSecondPartyApproval: boolean;
  missingVendorApproval: boolean;
  missingJustificationNotes: boolean;
  requiresAttention: boolean;
  isStale: boolean;
  reviewedAt: string | null;
  reviewedByDisplayName: string | null;
  historicalBackfill: boolean;
  secondPartyComplete: boolean;
  vendorApproved: boolean;
  reviewNotes: string;
  priority: BackfillPriority;
  failingReasons: string[];
  recommendedActions: string[];
  isLegacy: boolean;
  legacyExceptionFlagged: boolean;
  legacyExceptionReason: string | null;
  effectiveDate: string;
}

interface EffectiveDateData {
  current: {
    id: number;
    effectiveDate: string;
    configuredByDisplayName: string;
    configuredAt: string | null;
    reason: string;
  };
  history: Array<{
    id: number;
    effectiveDate: string;
    configuredByDisplayName: string;
    configuredAt: string | null;
    reason: string;
  }>;
}

const BACKFILL_NOTE_PREFIX = 'Historical compliance review completed during ERDI remediation. Original PO issued prior to compliance gate implementation.';
const MIN_NOTE_CHARS = BACKFILL_NOTE_PREFIX.length;

function PriorityBadge({ priority }: { priority: BackfillPriority }) {
  const map: Record<BackfillPriority, string> = {
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200',
    HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-200',
    LOW: 'bg-muted text-muted-foreground border-muted',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${map[priority]}`}>
      {priority}
    </span>
  );
}

function ComplianceStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Pending Review': 'bg-gray-100 text-gray-700 border-gray-200',
    'Reviewed': 'bg-green-100 text-green-700 border-green-200',
    'Blocked': 'bg-red-100 text-red-700 border-red-200',
    'Requires Attention': 'bg-amber-100 text-amber-700 border-amber-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function FlagCell({ value, label }: { value: boolean; label: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 rounded px-1.5 py-0.5 border border-red-100">
      <XCircle className="h-3 w-3 flex-shrink-0" />
      {label}
    </span>
  );
}

interface BackfillReviewDialogProps {
  po: BackfillRow;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function BackfillReviewDialog({ po, isOpen, onClose, onSuccess }: BackfillReviewDialogProps) {
  const { toast } = useToast();
  const [governmentContract, setGovernmentContract] = useState(po.governmentContract);
  const [farRequired, setFarRequired] = useState(po.farRequired);
  const [dpasRequired, setDpasRequired] = useState(po.dpasRequired);
  const [cocRequired, setCocRequired] = useState(po.cocRequired);
  const [mtrRequired, setMtrRequired] = useState(po.mtrRequired);
  const [sourceInspectionRequired, setSourceInspectionRequired] = useState(po.sourceInspectionRequired);
  const [secondPartyComplete, setSecondPartyComplete] = useState(po.secondPartyComplete);
  const [vendorApproved, setVendorApproved] = useState(po.vendorApproved);
  const [reviewNotes, setReviewNotes] = useState(
    po.reviewNotes && po.reviewNotes.startsWith(BACKFILL_NOTE_PREFIX)
      ? po.reviewNotes
      : po.reviewNotes
        ? `${BACKFILL_NOTE_PREFIX}\n\n${po.reviewNotes}`
        : BACKFILL_NOTE_PREFIX
  );
  const [noteError, setNoteError] = useState('');

  const handleNotesChange = (val: string) => {
    if (!val.startsWith(BACKFILL_NOTE_PREFIX)) {
      setNoteError('The required backfill disclaimer cannot be removed from the notes.');
      return;
    }
    setNoteError('');
    setReviewNotes(val);
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/vendor-pos/${po.id}/compliance-review`, {
        method: 'PUT',
        body: JSON.stringify({
          governmentContract,
          farRequired,
          dpasRequired,
          cocRequired,
          mtrRequired,
          sourceInspectionRequired,
          secondPartyComplete,
          vendorApproved,
          reviewNotes,
          reviewStatus: 'reviewed',
          historicalBackfill: true,
        }),
      }),
    onSuccess: () => {
      toast({ title: 'Compliance review saved', description: `PO ${po.poNumber} has been marked as reviewed via backfill queue.` });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save review', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  const canSubmit = reviewNotes.length >= MIN_NOTE_CHARS && !noteError;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
            Reopen Compliance Review — {po.poNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
            <strong>Historical Backfill Review.</strong> This review is being completed post-issuance. The notes field is pre-filled with the required disclaimer. You may append additional context but cannot remove the disclaimer.
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Government Contract', value: governmentContract, setter: setGovernmentContract },
              { label: 'FAR/DFARS Required', value: farRequired, setter: setFarRequired },
              { label: 'DPAS Required', value: dpasRequired, setter: setDpasRequired },
              { label: 'CoC Required', value: cocRequired, setter: setCocRequired },
              { label: 'MTR Required', value: mtrRequired, setter: setMtrRequired },
              { label: 'Source Inspection Required', value: sourceInspectionRequired, setter: setSourceInspectionRequired },
              { label: 'Second-Party Complete', value: secondPartyComplete, setter: setSecondPartyComplete },
              { label: 'Vendor Approved', value: vendorApproved, setter: setVendorApproved },
            ].map(({ label, value, setter }) => (
              <div key={label} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                <Checkbox
                  id={`bf-${label}`}
                  checked={value}
                  onCheckedChange={(v) => setter(!!v)}
                />
                <Label htmlFor={`bf-${label}`} className="text-sm font-medium cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="backfill-notes" className="text-sm font-medium">
              Justification Notes <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="backfill-notes"
              value={reviewNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={5}
              className={noteError ? 'border-red-400' : ''}
            />
            {noteError && <p className="text-xs text-red-500">{noteError}</p>}
            {!noteError && (
              <p className="text-xs text-muted-foreground">
                Disclaimer cannot be removed. Append additional notes after the disclaimer text.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !canSubmit}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save Compliance Review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LegacyExceptionDialogProps {
  po: BackfillRow;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function LegacyExceptionDialog({ po, isOpen, onClose, onSuccess }: LegacyExceptionDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState(po.legacyExceptionReason ?? '');
  const isFlagging = !po.legacyExceptionFlagged;

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/vendor-pos/${po.id}/legacy-exception-flag`, {
        method: 'PUT',
        body: JSON.stringify({
          legacyExceptionFlagged: isFlagging,
          legacyExceptionReason: isFlagging ? reason : undefined,
        }),
      }),
    onSuccess: () => {
      toast({
        title: isFlagging ? 'Exception flag set' : 'Exception flag cleared',
        description: isFlagging
          ? `PO ${po.poNumber} has been moved to the Active Enforcement Queue.`
          : `PO ${po.poNumber} has been returned to the Legacy Review Queue.`,
      });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update flag', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFlagging
              ? <><Flag className="h-5 w-5 text-amber-500" /> Flag for Exception Review</>
              : <><FlagOff className="h-5 w-5 text-gray-500" /> Clear Exception Flag</>
            }
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isFlagging ? (
            <>
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
                <strong>PO {po.poNumber}</strong> was issued before the compliance enforcement date ({po.effectiveDate}) and is classified as a legacy pre-policy transaction. Flagging it for Exception Review promotes it to the <strong>Active Enforcement Queue</strong> and includes it in ERDI scoring.
              </div>
              <p className="text-sm text-muted-foreground">
                Use this for POs subject to government contracts, active audits, or legal scrutiny that require full compliance treatment regardless of issuance date.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="exception-reason" className="text-sm font-medium">
                  Reason for Exception Review <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="exception-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Subject to government audit, active legal dispute, contract modification requiring retroactive compliance…"
                  rows={3}
                />
              </div>
            </>
          ) : (
            <div className="rounded-md border border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-300">
              Clearing the exception flag will return <strong>PO {po.poNumber}</strong> to the Legacy Review Queue. It will no longer affect ERDI enforcement scoring.
              {po.legacyExceptionReason && (
                <p className="mt-2 text-xs italic">Previous reason: {po.legacyExceptionReason}</p>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (isFlagging && !reason.trim())}
            variant={isFlagging ? 'default' : 'secondary'}
          >
            {mutation.isPending
              ? 'Saving…'
              : isFlagging ? 'Flag for Exception Review' : 'Clear Exception Flag'
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EffectiveDateDialogProps {
  current: EffectiveDateData['current'];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function EffectiveDateDialog({ current, isOpen, onClose, onSuccess }: EffectiveDateDialogProps) {
  const { toast } = useToast();
  const [newDate, setNewDate] = useState(current.effectiveDate ?? '2026-06-01');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/vendor-pos/compliance-effective-date', {
        method: 'PUT',
        body: JSON.stringify({ effectiveDate: newDate, reason }),
      }),
    onSuccess: () => {
      toast({ title: 'Effective date updated', description: `New compliance enforcement date: ${newDate}` });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update date', description: err?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Change Compliance Effective Date
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
            Changing this date re-segments all issued POs into enforced (post-date) and legacy (pre-date) populations. This affects ERDI scoring. A reason is required and the change is permanently audited.
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-effective-date" className="text-sm font-medium">New Effective Date</Label>
            <Input
              id="new-effective-date"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date-change-reason" className="text-sm font-medium">
              Reason for Change <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="date-change-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this date is being changed…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !newDate || !reason.trim()}
          >
            {mutation.isPending ? 'Saving…' : 'Update Effective Date'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpandedRow({ row }: { row: BackfillRow }) {
  return (
    <div className="p-4 bg-muted/30 border-t space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> Why This Is In The Queue
          </h4>
          {row.failingReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No specific failures identified.</p>
          ) : (
            <ol className="space-y-1 list-decimal list-inside">
              {row.failingReasons.map((r, i) => (
                <li key={i} className="text-sm text-muted-foreground">{r}</li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1">
            <ClipboardList className="h-4 w-4" /> Recommended Fix Steps
          </h4>
          {row.recommendedActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No actions needed.</p>
          ) : (
            <ul className="space-y-1">
              {row.recommendedActions.map((a, i) => (
                <li key={i} className="text-sm text-muted-foreground">{a}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {row.reviewedAt && (
        <p className="text-xs text-muted-foreground">
          Last reviewed: {format(new Date(row.reviewedAt), 'MMM d, yyyy')}
          {row.reviewedByDisplayName ? ` by ${row.reviewedByDisplayName}` : ''}
          {row.historicalBackfill ? ' (historical backfill)' : ''}
        </p>
      )}

      {row.legacyExceptionFlagged && row.legacyExceptionReason && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <strong>Exception reason:</strong> {row.legacyExceptionReason}
        </p>
      )}
    </div>
  );
}

const PRIORITY_ORDER: Record<BackfillPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function POTable({
  rows,
  onReview,
  onExceptionFlag,
  onNavigate,
  showLegacyActions,
}: {
  rows: BackfillRow[];
  onReview: (row: BackfillRow) => void;
  onExceptionFlag: (row: BackfillRow) => void;
  onNavigate: (id: number) => void;
  showLegacyActions: boolean;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<'priority' | 'poNumber' | 'vendor' | 'status' | 'issueDate'>('priority');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'priority') cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      else if (sortField === 'poNumber') cmp = a.poNumber.localeCompare(b.poNumber);
      else if (sortField === 'vendor') cmp = a.vendorName.localeCompare(b.vendorName);
      else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
      else if (sortField === 'issueDate') cmp = (a.issueDate ?? '').localeCompare(b.issueDate ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [rows, sortField, sortDir]);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-muted-foreground/40 inline ml-1" />;
    return sortDir === 'asc'
      ? <ChevronDown className="h-3 w-3 inline ml-1" />
      : <ChevronRight className="h-3 w-3 inline ml-1 rotate-90" />;
  };

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">No POs in this queue.</div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-8" />
            <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('poNumber')}>
              PO Number <SortIcon field="poNumber" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('vendor')}>
              Vendor <SortIcon field="vendor" />
            </TableHead>
            <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('issueDate')}>
              Issue Date <SortIcon field="issueDate" />
            </TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('status')}>
              Status <SortIcon field="status" />
            </TableHead>
            <TableHead>Compliance</TableHead>
            <TableHead>Flags</TableHead>
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('priority')}>
              Priority <SortIcon field="priority" />
            </TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            const isExpanded = expandedIds.has(row.id);
            return (
              <Fragment key={row.id}>
                <TableRow
                  className={`cursor-pointer hover:bg-muted/30 ${
                    row.priority === 'CRITICAL' ? 'bg-red-50/50 dark:bg-red-950/20' :
                    row.legacyExceptionFlagged ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                  }`}
                  onClick={() => toggleExpanded(row.id)}
                >
                  <TableCell className="w-8 pl-3">
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                  </TableCell>
                  <TableCell className="font-mono text-sm font-medium">
                    {row.poNumber}
                    {row.legacyExceptionFlagged && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-amber-600 bg-amber-100 dark:bg-amber-950 rounded px-1 py-0.5 border border-amber-200">
                        <Flag className="h-3 w-3" /> Exception
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{row.vendorName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {row.issueDate ? format(new Date(row.issueDate), 'MMM d, yyyy') : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{row.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <ComplianceStatusBadge status={row.complianceStatus} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      <FlagCell value={row.missingReview} label="No Review" />
                      <FlagCell value={row.missingFarStatement} label="Missing FAR" />
                      <FlagCell value={row.missingSecondPartyApproval} label="No 2nd-Party" />
                      <FlagCell value={row.missingVendorApproval} label="No Vendor OK" />
                      <FlagCell value={row.missingJustificationNotes} label="No Notes" />
                      <FlagCell value={row.requiresAttention} label="Requires Attention" />
                      {row.isStale && (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 rounded px-1.5 py-0.5 border border-orange-100">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                          Stale
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={row.priority} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => onNavigate(row.id)} title="Open PO">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                        Open PO
                      </Button>
                      {showLegacyActions && (
                        <Button
                          variant={row.legacyExceptionFlagged ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => onExceptionFlag(row)}
                          title={row.legacyExceptionFlagged ? 'Clear exception flag' : 'Flag for exception review'}
                          className="text-amber-700 dark:text-amber-400 border-amber-300"
                        >
                          {row.legacyExceptionFlagged
                            ? <><FlagOff className="h-3.5 w-3.5 mr-1" />Clear Flag</>
                            : <><Flag className="h-3.5 w-3.5 mr-1" />Flag</>
                          }
                        </Button>
                      )}
                      {!row.isLegacy && (
                        <Button variant="default" size="sm" onClick={() => onReview(row)}>
                          <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                          Reopen Review
                        </Button>
                      )}
                      {row.isLegacy && (
                        <Button variant="outline" size="sm" onClick={() => onReview(row)}>
                          <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                          Review
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="p-0">
                      <ExpandedRow row={row} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

type PopulationFilter = 'all' | 'enforced' | 'legacy' | 'audit-sensitive-legacy';

const POPULATION_FILTER_LABELS: Record<PopulationFilter, string> = {
  'all': 'All Populations (two sections)',
  'enforced': 'Enforced Only (post-effective-date)',
  'legacy': 'Legacy Only (pre-effective-date)',
  'audit-sensitive-legacy': 'Audit-Sensitive Legacy (exception-flagged)',
};

export default function VendorPOComplianceBackfillPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Population filter mode — controls which server-side population is fetched.
  // 'all' fetches every failing PO and segments them into two sections client-side.
  // Other modes make a targeted server-side call for the specific population.
  const [populationFilter, setPopulationFilter] = useState<PopulationFilter>('all');

  const backfillQueryUrl = populationFilter === 'all'
    ? '/api/vendor-pos/compliance-backfill'
    : `/api/vendor-pos/compliance-backfill?filter=${populationFilter}`;

  const { data: rows = [], isLoading, error } = useQuery<BackfillRow[]>({
    queryKey: ['/api/vendor-pos/compliance-backfill', populationFilter],
    queryFn: () => apiRequest(backfillQueryUrl),
  });

  const { data: effectiveDateData } = useQuery<EffectiveDateData>({
    queryKey: ['/api/vendor-pos/compliance-effective-date'],
  });

  const [reviewDialogPo, setReviewDialogPo] = useState<BackfillRow | null>(null);
  const [exceptionFlagPo, setExceptionFlagPo] = useState<BackfillRow | null>(null);
  const [showDateDialog, setShowDateDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterCompliance, setFilterCompliance] = useState<string>('all');

  const effectiveDate = effectiveDateData?.current?.effectiveDate ?? '2026-06-01';

  // When showing all populations, segment client-side for the two-section layout.
  // When a specific population filter is active, all rows belong to that population.
  // Note: exception-flagged legacy POs (audit-sensitive-legacy) are promoted to the
  // Active Enforcement Queue — they appear in the enforced section, not the legacy section.
  const enforcedRows = useMemo(() =>
    populationFilter === 'all'
      ? rows.filter((r) => !r.isLegacy || r.legacyExceptionFlagged)
      : (populationFilter === 'enforced' || populationFilter === 'audit-sensitive-legacy' ? rows : []),
    [rows, populationFilter]
  );

  const legacyRows = useMemo(() =>
    populationFilter === 'all'
      ? rows.filter((r) => r.isLegacy && !r.legacyExceptionFlagged)
      : (populationFilter === 'legacy' ? rows : []),
    [rows, populationFilter]
  );

  const vendorOptions = useMemo(() => {
    const names = [...new Set(rows.map((r) => r.vendorName))].sort();
    return names;
  }, [rows]);

  const applyFilters = (list: BackfillRow[]) => {
    let out = list;
    if (filterCompliance !== 'all') out = out.filter((r) => r.complianceStatus === filterCompliance);
    if (filterVendor !== 'all') out = out.filter((r) => r.vendorName === filterVendor);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((r) => r.poNumber.toLowerCase().includes(q) || r.vendorName.toLowerCase().includes(q));
    }
    return out;
  };

  const filteredEnforced = applyFilters(enforcedRows);
  const filteredLegacy = applyFilters(legacyRows);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/compliance-backfill'] });
    queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
  };

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        Failed to load compliance backfill queue. Please try again.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-orange-500" />
            Procurement Compliance Backfill Queue
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Issued POs with compliance gaps affecting the ERDI Procurement score. Enforced POs must be remediated; legacy POs are tracked separately.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/compliance-backfill'] })}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Policy Statement */}
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-blue-800 dark:text-blue-300">
            <BookOpen className="h-4 w-4" />
            Procurement Compliance Policy — Two-Population Framework
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-900 dark:text-blue-200 space-y-2">
          <p>
            <strong>Enforced Population</strong> — POs issued on or after <strong>{effectiveDate}</strong> are subject to mandatory FAR_FLOWDOWN, SECOND_PARTY_APPROVAL, VENDOR_APPROVAL_BLOCKING, and REQUISITION_WORKFLOW compliance checks. Failures in this population directly affect the ERDI Procurement score.
          </p>
          <p>
            <strong>Legacy Population</strong> — POs issued before <strong>{effectiveDate}</strong> pre-date formal compliance enforcement. These are classified as <em>legacy pre-policy transactions</em> rather than non-compliant, and are tracked in the Legacy Review Queue. They do not count against the ERDI score unless individually flagged for Exception Review.
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Exception Review: A legacy PO subject to a government contract, active audit, or legal concern may be individually flagged to promote it to the Enforced population. No auto-flagging occurs.
          </p>
        </CardContent>
      </Card>

      {/* Effective Date Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-500" />
            Compliance Enforcement Effective Date
          </CardTitle>
          <CardDescription>
            Controls the boundary between enforced and legacy PO populations. Changes require a reason and are permanently audited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1">
              <p className="text-lg font-bold text-foreground">{effectiveDate}</p>
              {effectiveDateData?.current?.configuredByDisplayName && (
                <p className="text-xs text-muted-foreground">
                  Set by {effectiveDateData.current.configuredByDisplayName}
                  {effectiveDateData.current.configuredAt
                    ? ` on ${format(new Date(effectiveDateData.current.configuredAt), 'MMM d, yyyy')}`
                    : ''}
                  {' — '}{effectiveDateData.current.reason}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
                <History className="h-3.5 w-3.5 mr-1" />
                {showHistory ? 'Hide' : 'Show'} History
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowDateDialog(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Change Date
              </Button>
            </div>
          </div>

          {showHistory && effectiveDateData?.history && effectiveDateData.history.length > 0 && (
            <div className="mt-4 border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Changed By</TableHead>
                    <TableHead>Changed At</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {effectiveDateData.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="font-mono text-sm font-medium">{h.effectiveDate}</TableCell>
                      <TableCell className="text-sm">{h.configuredByDisplayName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {h.configuredAt ? format(new Date(h.configuredAt), 'MMM d, yyyy HH:mm') : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{h.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Enforced Failing', count: enforcedRows.length, color: 'text-red-600 dark:text-red-400', desc: 'Counting toward ERDI' },
          { label: 'Legacy Pre-Policy', count: legacyRows.length, color: 'text-amber-600 dark:text-amber-400', desc: 'Not counted against score' },
          { label: 'Exception-Flagged', count: rows.filter((r) => r.legacyExceptionFlagged).length, color: 'text-orange-600 dark:text-orange-400', desc: 'Legacy promoted to enforcement' },
          { label: 'Missing Review', count: rows.filter((r) => r.missingReview).length, color: 'text-red-600 dark:text-red-400', desc: 'No compliance review exists' },
        ].map(({ label, count, color, desc }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className={`text-3xl font-bold ${color}`}>{count}</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Population filter mode — server-side targeted fetch */}
        <Select value={populationFilter} onValueChange={(v) => setPopulationFilter(v as PopulationFilter)}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Population View" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(POPULATION_FILTER_LABELS) as [PopulationFilter, string][]).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Search PO number or vendor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select value={filterCompliance} onValueChange={setFilterCompliance}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Compliance Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Compliance Statuses</SelectItem>
            <SelectItem value="Pending Review">Pending Review</SelectItem>
            <SelectItem value="Requires Attention">Requires Attention</SelectItem>
            <SelectItem value="Blocked">Blocked</SelectItem>
            <SelectItem value="Reviewed">Reviewed (with gaps)</SelectItem>
          </SelectContent>
        </Select>
        {vendorOptions.length > 0 && (
          <Select value={filterVendor} onValueChange={setFilterVendor}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendorOptions.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(filterCompliance !== 'all' || filterVendor !== 'all' || search || populationFilter !== 'all') && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterCompliance('all'); setFilterVendor('all'); setSearch(''); setPopulationFilter('all'); }}>
            Clear filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-lg font-semibold">No compliance gaps found</p>
              <p className="text-sm text-muted-foreground">All issued POs have complete compliance reviews.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Active Enforcement Queue */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertOctagon className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold">Active Enforcement Queue</h2>
              <Badge variant="outline" className="text-xs border-red-200 text-red-700">{filteredEnforced.length} POs</Badge>
              <span className="text-xs text-muted-foreground">Issued ≥ {effectiveDate} · Failures count toward ERDI score</span>
            </div>
            {filteredEnforced.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No enforced POs in the queue. FAR_FLOWDOWN score is clean for the enforced population.</p>
                </CardContent>
              </Card>
            ) : (
              <POTable
                rows={filteredEnforced}
                onReview={setReviewDialogPo}
                onExceptionFlag={setExceptionFlagPo}
                onNavigate={(id) => setLocation(`/vendor-pos?poId=${id}`)}
                showLegacyActions={false}
              />
            )}
          </div>

          {/* Legacy Review Queue */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold">Legacy Review Queue</h2>
              <Badge variant="outline" className="text-xs border-amber-200 text-amber-700">{filteredLegacy.length} POs</Badge>
              <span className="text-xs text-muted-foreground">Issued before {effectiveDate} · Lower priority · Exception-driven</span>
            </div>
            <div className="mb-3 p-3 rounded-md border border-amber-100 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
              These POs pre-date the compliance enforcement effective date and are classified as <strong>legacy pre-policy transactions</strong>. They do not affect the ERDI score unless individually flagged for Exception Review. Flag a PO if it is subject to a government contract, active audit, or legal concern.
            </div>
            {filteredLegacy.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">No legacy POs in the queue (or all are hidden by active filters).</p>
                </CardContent>
              </Card>
            ) : (
              <POTable
                rows={filteredLegacy}
                onReview={setReviewDialogPo}
                onExceptionFlag={setExceptionFlagPo}
                onNavigate={(id) => setLocation(`/vendor-pos?poId=${id}`)}
                showLegacyActions={true}
              />
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {reviewDialogPo && (
        <BackfillReviewDialog
          po={reviewDialogPo}
          isOpen={!!reviewDialogPo}
          onClose={() => setReviewDialogPo(null)}
          onSuccess={invalidate}
        />
      )}

      {exceptionFlagPo && (
        <LegacyExceptionDialog
          po={exceptionFlagPo}
          isOpen={!!exceptionFlagPo}
          onClose={() => setExceptionFlagPo(null)}
          onSuccess={invalidate}
        />
      )}

      {showDateDialog && effectiveDateData && (
        <EffectiveDateDialog
          current={effectiveDateData.current}
          isOpen={showDateDialog}
          onClose={() => setShowDateDialog(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/compliance-effective-date'] });
            invalidate();
          }}
        />
      )}
    </div>
  );
}

import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';

type Assessment = {
  documentId: string;
  documentNumber: string;
  title: string;
  revisionId: string | null;
  classification: string;
  automatic: boolean;
  blockers: string[];
  proposedChanges: Record<string, unknown>;
};
type Preview = {
  previewId: string;
  previewHash: string;
  expiresAt: string;
  assessments: Assessment[];
};

export function ControlledDocumentReconciliationWorkspace() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Assessment[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qualityId, setQualityId] = useState('');
  const [evidenceType, setEvidenceType] = useState('LEGACY_APPROVAL_EVIDENCE');
  const [evidence, setEvidence] = useState('');
  const [file, setFile] = useState<File | null>(null);
  if (!can('documents.reconciliation_view')) return null;
  const request = async (path: string, init?: Parameters<typeof fetch>[1]) => {
    const response = await fetch(
      `/api/controlled-document-reconciliation/${path}`,
      {
        credentials: 'include',
        ...init,
        headers: {
          ...(init?.body instanceof FormData
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(init?.headers || {}),
        },
      }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error);
    return body;
  };
  const load = async () => {
    setBusy(true);
    try {
      const body = await request('inventory');
      setRows(body.assessments || []);
      setSelected([]);
      setPreview(null);
      setOpen(true);
    } catch (error: any) {
      toast({
        title: 'Reconciliation inventory unavailable',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };
  const makePreview = async () => {
    setBusy(true);
    try {
      setPreview(
        await request('preview', {
          method: 'POST',
          body: JSON.stringify({ documentIds: selected }),
        })
      );
    } catch (error: any) {
      toast({
        title: 'Preview failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const body = await request('execute', {
        method: 'POST',
        body: JSON.stringify({
          previewId: preview.previewId,
          previewHash: preview.previewHash,
          selectedDocumentIds: selected,
          reason,
          acknowledgeHistoricalEvidence: ack,
        }),
      });
      toast({
        title: 'Reconciliation completed',
        description: `${body.completed.length} deterministic records processed.`,
      });
      setOpen(false);
    } catch (error: any) {
      toast({
        title: 'Reconciliation stopped safely',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };
  const appendEvidence = async () => {
    const row = rows.find((r) => r.documentId === qualityId);
    if (!row) return;
    setBusy(true);
    try {
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('reason', reason);
        if (row.revisionId) form.append('revisionId', row.revisionId);
        await request(`${row.documentId}/authoritative-file`, {
          method: 'POST',
          body: form,
        });
      } else {
        await request(`${row.documentId}/evidence`, {
          method: 'POST',
          body: JSON.stringify({
            revisionId: row.revisionId,
            evidenceType,
            evidence: JSON.parse(evidence || '{}'),
            reason,
          }),
        });
      }
      toast({ title: 'Append-only evidence retained' });
      setEvidence('');
      setFile(null);
    } catch (error: any) {
      toast({
        title: 'Evidence capture failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={load} disabled={busy}>
        Quality Reconciliation
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historical Document Reconciliation</DialogTitle>
            <DialogDescription>
              Preview every proposed addition. Ambiguous records remain
              unchanged for Quality review.
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Select</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Blockers or additions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.documentId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      disabled={!row.automatic || !!preview}
                      checked={selected.includes(row.documentId)}
                      onChange={(e) =>
                        setSelected((s) =>
                          e.target.checked
                            ? [...s, row.documentId]
                            : s.filter((id) => id !== row.documentId)
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {row.documentNumber}
                    <div className="text-xs text-gray-500">{row.title}</div>
                  </TableCell>
                  <TableCell>
                    <Badge>{row.classification}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.automatic ? (
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(row.proposedChanges, null, 2)}
                      </pre>
                    ) : (
                      row.blockers.join('; ')
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!preview ? (
            <Button
              disabled={
                !selected.length ||
                !can('documents.reconciliation_preview') ||
                busy
              }
              onClick={makePreview}
            >
              Preview selected additions
            </Button>
          ) : (
            <div className="space-y-3 border p-3">
              <p className="text-sm">
                Preview expires {new Date(preview.expiresAt).toLocaleString()}.
              </p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required authorized reason"
              />
              <Label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                This migration evidence is not a new electronic approval.
              </Label>
              <Button
                disabled={
                  !can('documents.reconciliation_execute') ||
                  reason.trim().length < 10 ||
                  !ack ||
                  busy
                }
                onClick={execute}
              >
                Execute deterministic additions
              </Button>
            </div>
          )}
          {can('documents.reconciliation_resolve') && (
            <div className="space-y-3 border p-3">
              <h3 className="font-medium">Quality evidence and disposition</h3>
              <Select value={qualityId} onValueChange={setQualityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ambiguous record" />
                </SelectTrigger>
                <SelectContent>
                  {rows
                    .filter((r) => !r.automatic)
                    .map((r) => (
                      <SelectItem key={r.documentId} value={r.documentId}>
                        {r.documentNumber} — {r.classification}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={evidenceType} onValueChange={setEvidenceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    'LEGACY_APPROVAL_EVIDENCE',
                    'EFFECTIVE_STATUS_CONFIRMATION',
                    'REFERENCE_ONLY',
                    'OBSOLETE',
                    'VOID',
                  ].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Legacy evidence as JSON"
              />
              <Input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required reason and source"
              />
              <Button
                disabled={!qualityId || reason.trim().length < 10 || busy}
                onClick={appendEvidence}
              >
                Append evidence without rewriting history
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

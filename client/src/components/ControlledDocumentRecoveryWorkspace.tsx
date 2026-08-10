import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

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

type RecoveryCategory =
  | 'ALL'
  | 'READY_TO_IMPORT'
  | 'MISSING_SOURCE'
  | 'DUPLICATE_CODE'
  | 'LEGACY_FILE_INACCESSIBLE'
  | 'CHECKSUM_MISMATCH'
  | 'AWAITING_APPROVAL'
  | 'RELEASED_VIEWABLE'
  | 'MANUAL_REVIEW_REQUIRED';

type RecoveryRow = {
  documentId: string | null;
  documentCode: string;
  normalizedDocumentCode: string;
  title: string;
  sourceTitle: string | null;
  currentRevisionId: string | null;
  lifecycleStatus: string | null;
  compatibilityStatus: string | null;
  currentReleasedRevisionId: string | null;
  existingFileClassification: string;
  sourceProvenanceUrl: string | null;
  proposedManagedFile: string | null;
  observedChecksum: string | null;
  storedChecksum: string | null;
  checksumResult: string;
  blockers: string[];
  recommendedAction: string;
  category: RecoveryCategory;
};

type Preview = {
  previewId: string;
  previewHash: string;
  expiresAt: string;
  blockers: string[];
  recommendedAction: string;
  exactProposedAdditions: string[];
};

type StagedImport = {
  importId: string;
  status: string;
  checksum: string;
  storedChecksum: string | null;
  checksumResult: string;
};

type SourceInventoryRow = {
  documentCode: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  driveFileId: string | null;
};

const categories: Array<{ value: RecoveryCategory; label: string }> = [
  { value: 'ALL', label: 'All records' },
  { value: 'READY_TO_IMPORT', label: 'Ready to import' },
  { value: 'MISSING_SOURCE', label: 'Missing source' },
  { value: 'DUPLICATE_CODE', label: 'Duplicate code' },
  { value: 'LEGACY_FILE_INACCESSIBLE', label: 'Legacy file inaccessible' },
  { value: 'CHECKSUM_MISMATCH', label: 'Checksum mismatch' },
  { value: 'AWAITING_APPROVAL', label: 'Awaiting approval' },
  { value: 'RELEASED_VIEWABLE', label: 'Released and viewable' },
  { value: 'MANUAL_REVIEW_REQUIRED', label: 'Manual review required' },
];

const recoveryErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'The recovery request failed.';

export function ControlledDocumentRecoveryWorkspace() {
  const { can } = usePermissions();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{
    schemaReady: boolean;
    executionEnabled: boolean;
    message?: string;
  } | null>(null);
  const [rows, setRows] = useState<RecoveryRow[]>([]);
  const [filter, setFilter] = useState<RecoveryCategory>('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceType, setSourceType] = useState('DIRECT_UPLOAD');
  const [sourceUrl, setSourceUrl] = useState('');
  const [driveFileId, setDriveFileId] = useState('');
  const [sourceInventory, setSourceInventory] = useState<SourceInventoryRow[]>(
    []
  );
  const [file, setFile] = useState<File | null>(null);
  const [expectedChecksum, setExpectedChecksum] = useState('');
  const [reason, setReason] = useState('');
  const [revisionValue, setRevisionValue] = useState('');
  const [legacyEvidenceId, setLegacyEvidenceId] = useState('');
  const [executionAction, setExecutionAction] = useState(
    'CURRENT_APPROVAL_WORKFLOW'
  );
  const [disposition, setDisposition] = useState(
    'AUTHORITATIVE_RECORD_SELECTED'
  );
  const [relatedDocumentIds, setRelatedDocumentIds] = useState('');
  const [supportingEvidence, setSupportingEvidence] = useState('{}');
  const [dispositionReason, setDispositionReason] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [staged, setStaged] = useState<StagedImport | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async (path: string, init?: Parameters<typeof fetch>[1]) => {
    const response = await fetch(`/api/controlled-documents/recovery/${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        ...(init?.body instanceof FormData
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(init?.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(body.message || body.error || 'Request failed');
    return body;
  };

  useEffect(() => {
    if (!can('documents.recovery_view')) return;
    request('status')
      .then(setStatus)
      .catch(() =>
        setStatus({
          schemaReady: false,
          executionEnabled: false,
          message: 'Document File Recovery is not schema-ready.',
        })
      );
  }, [can]);

  const source = () => ({
    documentCode: sourceCode,
    title: sourceTitle,
    sourceType,
    sourceUrl: sourceUrl || null,
    driveFileId: driveFileId || null,
  });

  const importSourceInventory = async (inventoryFile: File) => {
    setBusy(true);
    try {
      const workbook = XLSX.read(await inventoryFile.arrayBuffer(), {
        type: 'array',
      });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('The source workbook has no readable sheet.');
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });
      const rows = rawRows
        .map((rawRow) => {
          const values = new Map(
            Object.entries(rawRow).map(([key, value]) => [
              key.toLowerCase().replace(/[^a-z0-9]+/g, ''),
              String(value ?? '').trim(),
            ])
          );
          const pick = (...keys: string[]) =>
            keys.map((key) => values.get(key)).find(Boolean) || '';
          const documentCode = pick(
            'documentcode',
            'documentnumber',
            'docnumber',
            'number'
          );
          const title = pick('documenttitle', 'documentname', 'title', 'name');
          const sourceUrl = pick(
            'googledrivesourcelink',
            'googledrivelink',
            'sourceprovenanceurl',
            'sourceurl',
            'fileurl',
            'link'
          );
          const suppliedType = pick('sourcetype').toUpperCase();
          const driveMatch = sourceUrl.match(/\/d\/([a-zA-Z0-9_-]{10,200})/);
          const allowedSourceTypes = new Set([
            'DIRECT_UPLOAD',
            'GOOGLE_DRIVE_PROVENANCE',
            'LEGACY_EPOCH_REFERENCE',
            'OTHER_VERIFIED_SOURCE',
          ]);
          const rowSourceType = allowedSourceTypes.has(suppliedType)
            ? suppliedType
            : sourceUrl.includes('drive.google.com')
              ? 'GOOGLE_DRIVE_PROVENANCE'
              : sourceUrl
                ? 'OTHER_VERIFIED_SOURCE'
                : 'LEGACY_EPOCH_REFERENCE';
          return {
            documentCode,
            title,
            sourceType: rowSourceType,
            sourceUrl: sourceUrl || null,
            driveFileId:
              pick('drivefileid', 'googlefileid') || driveMatch?.[1] || null,
          };
        })
        .filter((row) => row.documentCode || row.title);
      if (!rows.length)
        throw new Error(
          'No source document rows were found in the first sheet.'
        );
      setSourceInventory(rows);
      toast({
        title: 'Source inventory loaded locally',
        description: `${rows.length} rows are ready for a read-only identity comparison.`,
      });
    } catch (error: unknown) {
      toast({
        title: 'Source inventory was not loaded',
        description: recoveryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const loadInventory = async (includeSource = false) => {
    setBusy(true);
    try {
      const body = await request('inventory', {
        method: 'POST',
        body: JSON.stringify({
          sourceRows: includeSource
            ? sourceInventory.length
              ? sourceInventory
              : [source()]
            : [],
        }),
      });
      setRows(body.rows || []);
      setPreview(null);
      setStaged(null);
      setOpen(true);
    } catch (error: unknown) {
      toast({
        title: 'Recovery inventory unavailable',
        description: recoveryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const selected = rows.find((row) => row.documentId === selectedId) || null;
  const visibleRows = useMemo(
    () => rows.filter((row) => filter === 'ALL' || row.category === filter),
    [rows, filter]
  );

  const selectRow = (row: RecoveryRow) => {
    if (!row.documentId) return;
    const normalized = (value: string) =>
      value.trim().replace(/\s+/g, ' ').toUpperCase();
    const sourceMatches = sourceInventory.filter(
      (candidate) =>
        normalized(candidate.documentCode) === row.normalizedDocumentCode
    );
    setSelectedId(row.documentId);
    setSourceCode(sourceMatches[0]?.documentCode || row.documentCode);
    setSourceTitle(sourceMatches[0]?.title || row.title);
    if (sourceMatches.length === 1) {
      setSourceType(sourceMatches[0].sourceType);
      setSourceUrl(sourceMatches[0].sourceUrl || '');
      setDriveFileId(sourceMatches[0].driveFileId || '');
    }
    setPreview(null);
    setStaged(null);
  };

  const createPreview = async () => {
    if (!selected?.documentId) return;
    setBusy(true);
    try {
      const body = await request('preview', {
        method: 'POST',
        body: JSON.stringify({
          documentId: selected.documentId,
          revisionId: selected.currentRevisionId,
          source: source(),
          sourceRows: sourceInventory.length ? sourceInventory : [source()],
        }),
      });
      setPreview(body);
      setStaged(null);
    } catch (error: unknown) {
      toast({
        title: 'Recovery preview rejected',
        description: recoveryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const stageFile = async () => {
    if (!preview || !file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('previewHash', preview.previewHash);
      form.append('idempotencyKey', crypto.randomUUID());
      form.append('reason', reason);
      if (expectedChecksum) form.append('expectedChecksum', expectedChecksum);
      const body = await request(`previews/${preview.previewId}/stage`, {
        method: 'POST',
        body: form,
      });
      setStaged(body);
      toast({
        title: 'Exact bytes staged safely',
        description: 'No controlled revision or release pointer has changed.',
      });
    } catch (error: unknown) {
      toast({
        title: 'File staging stopped safely',
        description: recoveryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!staged) return;
    setBusy(true);
    try {
      const body = await request(`imports/${staged.importId}/execute`, {
        method: 'POST',
        body: JSON.stringify({
          executionAction,
          revisionValue,
          legacyApprovalEvidenceId: legacyEvidenceId || undefined,
          idempotencyKey: crypto.randomUUID(),
          reason,
        }),
      });
      toast({
        title: body.released
          ? 'Legacy verified revision retained'
          : 'Working revision created',
        description: body.released
          ? 'No new electronic approval was created.'
          : 'Independent Approve and Release is still required.',
      });
      setOpen(false);
    } catch (error: unknown) {
      toast({
        title: 'Recovery execution rolled back',
        description: recoveryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const recordDisposition = async () => {
    if (!selected?.documentId) return;
    setBusy(true);
    try {
      const related = Array.from(
        new Set(
          relatedDocumentIds
            .split(/[\s,]+/)
            .map((value) => value.trim())
            .filter(Boolean)
        )
      );
      const evidence = JSON.parse(supportingEvidence || '{}');
      const body = await request('dispositions', {
        method: 'POST',
        body: JSON.stringify({
          documentCode: selected.documentCode,
          authoritativeDocumentId: selected.documentId,
          relatedDocumentIds: related,
          disposition,
          supportingEvidence: evidence,
          reason: dispositionReason,
        }),
      });
      toast({
        title: 'Quality disposition recorded',
        description: `Append-only evidence ${body.dispositionId} was created; historical records were not changed.`,
      });
      await loadInventory(true);
    } catch (error: unknown) {
      toast({
        title: 'Quality disposition was not recorded',
        description:
          error instanceof SyntaxError
            ? 'Supporting evidence must be valid JSON.'
            : recoveryErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!can('documents.recovery_view')) return null;

  return (
    <>
      <Button
        variant="outline"
        onClick={() => loadInventory(false)}
        disabled={busy || status?.schemaReady === false}
      >
        Document File Recovery
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document File Recovery</DialogTitle>
            <DialogDescription>
              Preview-first intake for exact authoritative bytes. Source links
              are provenance only and are never served as controlled files.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded border p-3 text-sm">
            <div>
              Schema: {status?.schemaReady ? 'ready' : 'not ready'} · Execution:{' '}
              {status?.executionEnabled
                ? 'authorized flag enabled'
                : 'disabled'}
            </div>
            {!status?.executionEnabled && (
              <div className="text-amber-700">
                Inventory and preview remain read-only. Import, execution, and
                disposition require explicit activation.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 rounded border p-3 md:grid-cols-3">
            <div className="md:col-span-3">
              <Label>Source inventory (XLSX, XLS, or CSV)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(event) => {
                  const inventoryFile = event.target.files?.[0];
                  if (inventoryFile) void importSourceInventory(inventoryFile);
                }}
              />
              <div className="text-xs text-muted-foreground">
                {sourceInventory.length
                  ? `${sourceInventory.length} source rows loaded; duplicate and missing codes will remain blocked.`
                  : 'No workbook loaded. You may compare the single source identity below.'}
              </div>
            </div>
            <div>
              <Label>Source document code</Label>
              <Input
                value={sourceCode}
                onChange={(e) => setSourceCode(e.target.value)}
              />
            </div>
            <div>
              <Label>Source title</Label>
              <Input
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
              />
            </div>
            <div>
              <Label>Source type</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DIRECT_UPLOAD">
                    Direct authoritative upload
                  </SelectItem>
                  <SelectItem value="GOOGLE_DRIVE_PROVENANCE">
                    Google Drive provenance
                  </SelectItem>
                  <SelectItem value="LEGACY_EPOCH_REFERENCE">
                    Legacy EPOCH reference
                  </SelectItem>
                  <SelectItem value="OTHER_VERIFIED_SOURCE">
                    Other verified source
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source URL (provenance only)</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </div>
            <div>
              <Label>Drive file ID (provenance only)</Label>
              <Input
                value={driveFileId}
                onChange={(e) => setDriveFileId(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={() => loadInventory(true)}
                disabled={busy}
              >
                Compare source identity
              </Button>
            </div>
          </div>

          <Select
            value={filter}
            onValueChange={(value) => setFilter(value as RecoveryCategory)}
          >
            <SelectTrigger className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="max-h-80 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Revision / lifecycle</TableHead>
                  <TableHead>Source / existing file</TableHead>
                  <TableHead>Checksum</TableHead>
                  <TableHead>Blockers / next action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row, index) => (
                  <TableRow
                    key={`${row.documentId || 'unmatched'}-${index}`}
                    className={
                      row.documentId === selectedId ? 'bg-blue-50' : ''
                    }
                    onClick={() => selectRow(row)}
                  >
                    <TableCell className="align-top text-xs">
                      <div className="font-medium">
                        {row.documentCode} — {row.title}
                      </div>
                      <div>
                        Document UUID:{' '}
                        {row.documentId || 'unmatched source row'}
                      </div>
                      <Badge>{row.category}</Badge>
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      <div>
                        Current revision: {row.currentRevisionId || 'none'}
                      </div>
                      <div>Lifecycle: {row.lifecycleStatus || 'none'}</div>
                      <div>
                        Compatibility: {row.compatibilityStatus || 'none'}
                      </div>
                      <div>
                        Released pointer:{' '}
                        {row.currentReleasedRevisionId || 'none'}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      <div>{row.existingFileClassification}</div>
                      <div className="break-all">
                        {row.sourceProvenanceUrl ||
                          'No supplied provenance URL'}
                      </div>
                      <div>
                        {row.proposedManagedFile || 'No managed object staged'}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      <div>
                        Observed: {row.observedChecksum || 'not checked'}
                      </div>
                      <div>Stored: {row.storedChecksum || 'none'}</div>
                      <div>Result: {row.checksumResult}</div>
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      <div>
                        {row.blockers.join('; ') || 'No match blockers'}
                      </div>
                      <div className="font-medium">{row.recommendedAction}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {selected && (
            <div className="space-y-3 rounded border p-3">
              <h3 className="font-medium">Exact preview and intake</h3>
              {!preview ? (
                <Button
                  onClick={createPreview}
                  disabled={!can('documents.recovery_preview') || busy}
                >
                  Create read-only preview
                </Button>
              ) : (
                <>
                  <div className="text-xs break-all">
                    Preview hash: {preview.previewHash}
                  </div>
                  <div className="text-sm">
                    Expires: {new Date(preview.expiresAt).toLocaleString()}
                  </div>
                  <div className="text-sm">
                    Blockers: {preview.blockers.join('; ') || 'none'}
                  </div>
                  <div className="text-sm">
                    Exact proposed additions:{' '}
                    {preview.exactProposedAdditions.join('; ') || 'none'}
                  </div>
                  <Input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Input
                    value={expectedChecksum}
                    onChange={(e) =>
                      setExpectedChecksum(e.target.value.toLowerCase())
                    }
                    placeholder="Optional expected SHA-256 checksum"
                  />
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Required authenticated recovery reason"
                  />
                  <Button
                    onClick={stageFile}
                    disabled={
                      !status?.executionEnabled ||
                      !can('documents.recovery_import') ||
                      preview.blockers.length > 0 ||
                      !file ||
                      reason.trim().length < 10 ||
                      busy
                    }
                  >
                    Stage exact bytes in managed storage
                  </Button>
                </>
              )}
            </div>
          )}

          {selected &&
            (selected.category === 'DUPLICATE_CODE' ||
              selected.category === 'MANUAL_REVIEW_REQUIRED') && (
              <div className="space-y-3 rounded border p-3">
                <h3 className="font-medium">Quality disposition</h3>
                <p className="text-sm text-muted-foreground">
                  Select the authoritative record and preserve every related
                  historical record. This operation creates append-only
                  evidence; it does not merge, delete, renumber, or release a
                  document.
                </p>
                <div className="text-xs break-all">
                  Authoritative document: {selected.documentId}
                </div>
                <Input
                  value={relatedDocumentIds}
                  onChange={(event) =>
                    setRelatedDocumentIds(event.target.value)
                  }
                  placeholder="All related document UUIDs, separated by commas (minimum two)"
                />
                <Select value={disposition} onValueChange={setDisposition}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTHORITATIVE_RECORD_SELECTED">
                      Authoritative record selected
                    </SelectItem>
                    <SelectItem value="REFERENCE_ONLY">
                      Reference only
                    </SelectItem>
                    <SelectItem value="OBSOLETE">Obsolete</SelectItem>
                    <SelectItem value="VOID">Void</SelectItem>
                    <SelectItem value="MANUAL_REVIEW_REQUIRED">
                      Manual review required
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  value={supportingEvidence}
                  onChange={(event) =>
                    setSupportingEvidence(event.target.value)
                  }
                  placeholder='Supporting evidence JSON, for example {"ticket":"QMS-123"}'
                />
                <Textarea
                  value={dispositionReason}
                  onChange={(event) => setDispositionReason(event.target.value)}
                  placeholder="Required Quality disposition reason"
                />
                <Button
                  variant="secondary"
                  onClick={recordDisposition}
                  disabled={
                    !status?.executionEnabled ||
                    !can('documents.recovery_disposition') ||
                    !relatedDocumentIds.includes(selected.documentId || '') ||
                    dispositionReason.trim().length < 10 ||
                    busy
                  }
                >
                  Record append-only disposition
                </Button>
              </div>
            )}

          {staged && (
            <div className="space-y-3 rounded border p-3">
              <h3 className="font-medium">Execution preview</h3>
              <div className="text-xs break-all">
                Observed checksum: {staged.checksum}
              </div>
              <div className="text-xs break-all">
                Stored checksum: {staged.storedChecksum || 'none'}
              </div>
              <div>Comparison: {staged.checksumResult}</div>
              <Select
                value={executionAction}
                onValueChange={setExecutionAction}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CURRENT_APPROVAL_WORKFLOW">
                    Create working revision — independent approval required
                  </SelectItem>
                  <SelectItem value="LEGACY_RECONCILIATION">
                    Phase 1B legacy verified revision — confirmed evidence
                    required
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={revisionValue}
                onChange={(e) => setRevisionValue(e.target.value)}
                placeholder="New immutable revision/version"
              />
              {executionAction === 'LEGACY_RECONCILIATION' && (
                <Input
                  value={legacyEvidenceId}
                  onChange={(e) => setLegacyEvidenceId(e.target.value)}
                  placeholder="Confirmed Phase 1B legacy approval evidence UUID"
                />
              )}
              <Button
                onClick={execute}
                disabled={
                  !status?.executionEnabled ||
                  !can('documents.recovery_execute') ||
                  !revisionValue.trim() ||
                  (executionAction === 'LEGACY_RECONCILIATION' &&
                    !legacyEvidenceId) ||
                  reason.trim().length < 10 ||
                  busy
                }
              >
                Execute exact preview
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

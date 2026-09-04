import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type PreviewRow = {
  rowNumber: number;
  supplierProductNumber: string;
  customerProductNumber: string | null;
  description: string;
  originalOrderQuantity: number;
  customerReceivedQuantity: number | null;
  customerRemainingQuantity: number | null;
  targetCanceledQuantity: number | null;
  currentCanceledQuantity: number | null;
  cancellationDelta: number;
  unitPrice: number | null;
  extendedPrice: number | null;
  status: string;
  message: string;
};

type PreviewGroup = {
  poNumber: string;
  purchaseOrderId: number | null;
  status: 'READY' | 'NO_CHANGES' | 'BLOCKED';
  rows: PreviewRow[];
};

type ImportPreview = {
  documentType: 'NEW_PO_PDF' | 'CANCELLATION_CSV';
  customerCode: 'MIDWAY' | 'RED_HAWK';
  customerName: string;
  fileName: string;
  duplicateImport: { id: string; status: string; createdAt: string } | null;
  groups: PreviewGroup[];
  summary: {
    poCount: number;
    lineCount: number;
    readyPoCount: number;
    blockedPoCount: number;
    noChangePoCount: number;
    originalQuantity: number;
    targetCanceledQuantity: number;
    cancellationDelta: number;
    documentTotal: number | null;
    requiresDueDate: boolean;
  };
};

type RecentImport = {
  id: string;
  documentType: string;
  originalFileName: string;
  status: string;
  createdByDisplayName: string;
  createdAt: string;
};

async function postFile(
  path: string,
  file: File,
  fields?: Record<string, string>
) {
  const body = new FormData();
  body.append('file', file);
  Object.entries(fields ?? {}).forEach(([key, value]) =>
    body.append(key, value)
  );
  const response = await fetch(path, {
    method: 'POST',
    body,
    credentials: 'include',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      payload.error || `Import request failed (${response.status})`
    );
  return payload;
}

function statusClass(status: string) {
  if (['READY', 'APPLIED'].includes(status))
    return 'bg-green-100 text-green-800';
  if (status === 'ALREADY_APPLIED' || status === 'NO_CHANGES')
    return 'bg-blue-100 text-blue-800';
  return 'bg-red-100 text-red-800';
}

export default function P1POImportDialog({
  onApplied,
}: {
  onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedPos, setSelectedPos] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('Customer PO document import');
  const [dueDate, setDueDate] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const history = useQuery<RecentImport[]>({
    queryKey: ['/api/p1-customer-po-imports'],
    queryFn: async () => {
      const response = await fetch('/api/p1-customer-po-imports?limit=8', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Unable to load import history');
      return response.json();
    },
    enabled: open,
  });

  useEffect(() => {
    if (!preview) return;
    setSelectedPos(
      new Set(
        preview.groups
          .filter((group) => group.status === 'READY')
          .map((group) => group.poNumber)
      )
    );
  }, [preview]);

  const selectedReadyCount = useMemo(
    () =>
      preview?.groups.filter(
        (group) => group.status === 'READY' && selectedPos.has(group.poNumber)
      ).length ?? 0,
    [preview, selectedPos]
  );

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSelectedPos(new Set());
    setReason('Customer PO document import');
    setDueDate('');
  };

  const handlePreview = async () => {
    if (!file)
      return toast.error('Choose a customer PO PDF or Midway CSV first');
    setPreviewing(true);
    try {
      setPreview(await postFile('/api/p1-customer-po-imports/preview', file));
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to preview the document'
      );
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!file || !preview) return;
    if (!reason.trim()) return toast.error('Enter an audit reason');
    if (preview.summary.requiresDueDate && !dueDate) {
      return toast.error('Enter a due date for this PO');
    }
    if (
      preview.documentType === 'CANCELLATION_CSV' &&
      selectedReadyCount === 0
    ) {
      return toast.error('Select at least one ready PO');
    }
    setApplying(true);
    try {
      const result = await postFile('/api/p1-customer-po-imports/apply', file, {
        reason: reason.trim(),
        dueDate: preview.summary.requiresDueDate ? dueDate : '',
        selectedPoNumbers: JSON.stringify(Array.from(selectedPos)),
      });
      if (result.duplicate) {
        toast.success(
          'This exact document was already imported; no duplicate changes were made'
        );
      } else {
        toast.success(
          preview.documentType === 'NEW_PO_PDF'
            ? 'Purchase order created'
            : 'Selected cancellations applied'
        );
      }
      history.refetch();
      onApplied();
      setOpen(false);
      reset();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to apply the document'
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-p1-po-document">
          <Upload className="mr-2 h-4 w-4" />
          Import Customer PO
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import P1 Customer PO Document</DialogTitle>
          <DialogDescription>
            Upload a supported customer PO PDF or a Midway cumulative
            cancellation CSV. Nothing changes until you verify and apply it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="p1-customer-import-file">
                Customer PO PDF or Midway CSV
              </Label>
              <Input
                id="p1-customer-import-file"
                type="file"
                accept=".pdf,.csv,application/pdf,text/csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setDueDate('');
                }}
              />
            </div>
            <Button onClick={handlePreview} disabled={!file || previewing}>
              {previewing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Preview Document
            </Button>
          </div>

          {preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Detected type
                  </div>
                  <div className="font-semibold">
                    {preview.documentType === 'NEW_PO_PDF'
                      ? 'New PO PDF'
                      : 'Cancellation CSV'}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    POs / lines
                  </div>
                  <div className="font-semibold">
                    {preview.summary.poCount} / {preview.summary.lineCount}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    Ready / blocked
                  </div>
                  <div className="font-semibold text-green-700">
                    {preview.summary.readyPoCount}{' '}
                    <span className="text-muted-foreground">/</span>{' '}
                    <span className="text-red-700">
                      {preview.summary.blockedPoCount}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">
                    {preview.documentType === 'NEW_PO_PDF'
                      ? 'PO total'
                      : 'New cancellations'}
                  </div>
                  <div className="font-semibold">
                    {preview.documentType === 'NEW_PO_PDF'
                      ? `$${(preview.summary.documentTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : preview.summary.cancellationDelta}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">
                  Detected customer
                </div>
                <div className="font-semibold">{preview.customerName}</div>
              </div>

              {preview.summary.requiresDueDate && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <Label htmlFor="p1-import-due-date">EPOCH due date *</Label>
                  <Input
                    id="p1-import-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                  <p className="text-xs text-amber-900">
                    This customer document does not include a requested delivery
                    date. Enter the date EPOCH should use before creating the
                    PO.
                  </p>
                </div>
              )}

              {preview.duplicateImport && (
                <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  This exact file was imported on{' '}
                  {new Date(
                    preview.duplicateImport.createdAt
                  ).toLocaleString()}{' '}
                  with status {preview.duplicateImport.status}. Applying it
                  again will make no changes.
                </div>
              )}

              <div className="space-y-4">
                {preview.groups.map((group) => (
                  <section
                    key={group.poNumber}
                    className="overflow-hidden rounded-lg border"
                  >
                    <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        {preview.documentType === 'CANCELLATION_CSV' && (
                          <Checkbox
                            checked={selectedPos.has(group.poNumber)}
                            disabled={group.status !== 'READY'}
                            onCheckedChange={(checked) =>
                              setSelectedPos((current) => {
                                const next = new Set(current);
                                checked
                                  ? next.add(group.poNumber)
                                  : next.delete(group.poNumber);
                                return next;
                              })
                            }
                          />
                        )}
                        <div>
                          <div className="font-semibold">
                            PO #{group.poNumber}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {group.rows.length} line
                            {group.rows.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <Badge className={statusClass(group.status)}>
                        {group.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-y bg-muted/30 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="p-3">AG product</th>
                            <th className="p-3">
                              {preview.customerCode === 'MIDWAY'
                                ? 'Midway #'
                                : 'Customer item #'}
                            </th>
                            <th className="p-3">Original</th>
                            {preview.documentType === 'CANCELLATION_CSV' && (
                              <>
                                <th className="p-3">Received</th>
                                <th className="p-3">Target canceled</th>
                                <th className="p-3">Already canceled</th>
                                <th className="p-3">Apply</th>
                              </>
                            )}
                            <th className="p-3">Validation</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr
                              key={`${row.rowNumber}-${row.supplierProductNumber}`}
                              className="border-b last:border-0"
                            >
                              <td className="p-3">
                                <div className="font-medium">
                                  {row.supplierProductNumber}
                                </div>
                                <div
                                  className="max-w-sm truncate text-xs text-muted-foreground"
                                  title={row.description}
                                >
                                  {row.description}
                                </div>
                              </td>
                              <td className="p-3">
                                {row.customerProductNumber || '—'}
                              </td>
                              <td className="p-3">
                                {row.originalOrderQuantity}
                              </td>
                              {preview.documentType === 'CANCELLATION_CSV' && (
                                <>
                                  <td className="p-3">
                                    {row.customerReceivedQuantity}
                                  </td>
                                  <td className="p-3">
                                    {row.targetCanceledQuantity}
                                  </td>
                                  <td className="p-3">
                                    {row.currentCanceledQuantity ?? '—'}
                                  </td>
                                  <td className="p-3 font-semibold">
                                    {row.cancellationDelta || '—'}
                                  </td>
                                </>
                              )}
                              <td className="min-w-72 p-3">
                                <Badge className={statusClass(row.status)}>
                                  {row.status.replaceAll('_', ' ')}
                                </Badge>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {row.message}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="p1-import-reason">Audit reason</Label>
                <Textarea
                  id="p1-import-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </>
          )}

          {!preview && history.data && history.data.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Recent imports</h3>
              {history.data.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{entry.originalFileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {entry.createdByDisplayName} ·{' '}
                      {new Date(entry.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {entry.documentType === 'NEW_PO_PDF'
                        ? 'PO PDF'
                        : 'Cancellation CSV'}
                    </Badge>
                    <Badge className={statusClass(entry.status)}>
                      {entry.status.replaceAll('_', ' ')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        window.open(
                          `/api/p1-customer-po-imports/${entry.id}/document`,
                          '_blank'
                        )
                      }
                    >
                      View source
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {preview && (
            <Button
              onClick={handleApply}
              disabled={
                applying ||
                !!preview.duplicateImport ||
                preview.summary.readyPoCount === 0 ||
                (preview.summary.requiresDueDate && !dueDate) ||
                (preview.documentType === 'CANCELLATION_CSV' &&
                  selectedReadyCount === 0)
              }
            >
              {applying ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : preview.summary.blockedPoCount > 0 ? (
                <AlertCircle className="mr-2 h-4 w-4" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {preview.documentType === 'NEW_PO_PDF'
                ? 'Create Verified PO'
                : `Apply ${selectedReadyCount} Ready PO${selectedReadyCount === 1 ? '' : 's'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';

type BaselineItem = {
  immutableSnapshotId: string;
  baselineCategory: string;
  sourceModule: string | null;
  sourceRecordId: string | null;
  sourceRevision: string | null;
  sourceStatus: string | null;
  sourceChecksum: string;
};

type Preview = {
  ready: boolean;
  proposedReleaseNumber: string;
  proposedReleaseRevision: string;
  effectiveDate: string;
  missingEvidence: string[];
  baselineItems: BaselineItem[];
  changedSinceReleaseWarnings: string[];
  existingRelease?: {
    releaseNumber: string;
    releaseRevision: string;
    releaseStatus: string;
  } | null;
};

async function request(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const missing = Array.isArray(payload.missingEvidence)
      ? ` ${payload.missingEvidence.join('; ')}`
      : '';
    throw new Error(
      `${payload.message || payload.error || 'Engineering Release failed.'}${missing}`
    );
  }
  return payload;
}

export function EngineeringReleaseGatePanel({
  recordId,
  readOnly,
}: {
  recordId: string;
  readOnly: boolean;
}) {
  const { can } = usePermissions();
  const query = useQuery<{ preview: Preview }>({
    queryKey: [
      '/api/qms/design-control',
      recordId,
      'engineering-release-preview',
    ],
    queryFn: () =>
      request(
        `/api/qms/design-control/${recordId}/engineering-release-preview`
      ),
  });
  const [effectiveDate, setEffectiveDate] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = query.data?.preview;

  const release = async () => {
    setBusy(true);
    setMessage('');
    try {
      await request(
        `/api/qms/design-control/${recordId}/engineering-release`,
        'POST',
        { effectiveDate: effectiveDate || preview?.effectiveDate }
      );
      await query.refetch();
      setMessage('The authoritative Engineering Release was created.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engineering Release baseline</CardTitle>
        <CardDescription>
          This is the existing authoritative Engineering Release mechanism.
          Readiness and blockers are calculated by the server; this workspace
          does not invent completion state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading && <p className="text-sm">Calculating readiness…</p>}
        {query.isError && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            {(query.error as Error).message}
          </p>
        )}
        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={preview.ready ? 'default' : 'destructive'}>
                {preview.ready ? 'READY' : 'BLOCKED'}
              </Badge>
              <strong>{preview.proposedReleaseNumber}</strong>
              <span className="text-sm text-muted-foreground">
                Revision {preview.proposedReleaseRevision}
              </span>
            </div>
            {preview.missingEvidence.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-medium">Release blockers</p>
                <ul className="mt-2 list-disc pl-5">
                  {preview.missingEvidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.changedSinceReleaseWarnings.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">Changed since prior release</p>
                <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                  {preview.changedSinceReleaseWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="p-2">Baseline category</th>
                    <th className="p-2">Source</th>
                    <th className="p-2">Revision</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Snapshot</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.baselineItems.map((item) => (
                    <tr className="border-t" key={item.immutableSnapshotId}>
                      <td className="p-2 font-medium">
                        {item.baselineCategory.replaceAll('_', ' ')}
                      </td>
                      <td className="p-2">
                        {item.sourceModule || 'Design Control'}
                        {item.sourceRecordId ? ` / ${item.sourceRecordId}` : ''}
                      </td>
                      <td className="p-2">{item.sourceRevision || '—'}</td>
                      <td className="p-2">{item.sourceStatus || '—'}</td>
                      <td className="p-2 font-mono text-xs">
                        {item.sourceChecksum.slice(0, 12)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.existingRelease ? (
              <p className="rounded-md border p-3 text-sm">
                Existing release {preview.existingRelease.releaseNumber},
                revision {preview.existingRelease.releaseRevision} is{' '}
                {preview.existingRelease.releaseStatus}.
              </p>
            ) : (
              !readOnly &&
              can('design.release') && (
                <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end">
                  <label className="flex-1 text-sm font-medium">
                    Effective date
                    <Input
                      className="mt-1"
                      type="date"
                      value={effectiveDate || preview.effectiveDate}
                      onChange={(event) => setEffectiveDate(event.target.value)}
                    />
                  </label>
                  <Button
                    disabled={!preview.ready || busy}
                    onClick={release}
                    type="button"
                  >
                    Create authoritative Engineering Release
                  </Button>
                </div>
              )
            )}
          </>
        )}
        {message && (
          <p className="rounded-md border p-3 text-sm" role="status">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

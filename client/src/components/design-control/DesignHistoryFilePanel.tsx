import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Download,
  RefreshCw,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';

type Props = {
  projectId?: string | null;
  releaseId?: string | null;
  oversightMode?: boolean;
};
export function DesignHistoryFilePanel({
  projectId,
  releaseId,
  oversightMode = false,
}: Props) {
  const [error, setError] = useState('');
  const preview = useQuery<any>({
    queryKey: ['/api/engineering-releases', releaseId, 'dhf-preview'],
    enabled: Boolean(releaseId),
    retry: false,
    queryFn: async () => {
      const response = await fetch(
        `/api/engineering-releases/${releaseId}/dhf-preview`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });
  const current = useQuery<any>({
    queryKey: ['/api/design-projects', projectId, 'dhf'],
    enabled: Boolean(projectId),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/design-projects/${projectId}/dhf`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });
  const generate = async () => {
    if (!releaseId) return;
    const reason = window.prompt('Documented DHF generation reason');
    if (!reason) return;
    setError('');
    try {
      await apiRequest(`/api/engineering-releases/${releaseId}/dhf`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await Promise.all([preview.refetch(), current.refetch()]);
      await queryClient.invalidateQueries({
        queryKey: ['/api/design-projects', projectId, 'dhf'],
      });
    } catch (cause: any) {
      setError(cause.message ?? 'DHF generation failed');
    }
  };
  const dhf = current.data;
  const readiness = preview.data;
  const percentage = readiness?.expectedCount
    ? Math.round((readiness.includedCount / readiness.expectedCount) * 100)
    : dhf?.generation_status === 'LOCKED'
      ? 100
      : 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Design History File
            {oversightMode && <Badge variant="outline">QMS oversight</Badge>}
          </CardTitle>
          <CardDescription>
            Immutable checksummed evidence manifest for the released R&amp;D
            design. Source modules remain authoritative.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => Promise.all([preview.refetch(), current.refetch()])}
        >
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">DHF</div>
            <div className="font-semibold">
              {dhf?.dhf_number ?? 'Not generated'}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">
              Version / release
            </div>
            <div className="font-semibold">
              {dhf
                ? `v${dhf.version_number} / Rev ${dhf.release_revision}`
                : '—'}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="font-semibold">
              {dhf?.generation_status ??
                (readiness?.ready ? 'READY' : 'INCOMPLETE')}
            </div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-muted-foreground">Completeness</div>
            <div className="font-semibold">{percentage}%</div>
          </div>
        </div>
        {readiness && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {readiness.includedCount}/{readiness.expectedCount} evidence items
            </Badge>
            <Badge variant={readiness.ready ? 'outline' : 'destructive'}>
              {readiness.ready ? (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              ) : (
                <AlertTriangle className="mr-1 h-3 w-3" />
              )}
              {readiness.ready
                ? 'Ready'
                : `${readiness.blockingItems?.length ?? 0} blocking`}
            </Badge>
            <Badge variant="outline">
              Package:{' '}
              {readiness.engineeringPackageStatus?.lifecycleStatus ?? 'missing'}
            </Badge>
          </div>
        )}
        {readiness?.blockingItems?.slice(0, 8).map((item: any) => (
          <div
            key={`${item.category}-${item.sourceRecordId}`}
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
          >
            {item.displayTitle}: {item.inclusionStatus}
          </div>
        ))}
        {dhf && (
          <div className="space-y-1 text-xs text-muted-foreground">
            <div>
              Manifest SHA-256:{' '}
              <span className="font-mono">{dhf.manifest_checksum}</span>
            </div>
            <div>
              Export SHA-256:{' '}
              <span className="font-mono">
                {dhf.export_checksum ?? 'pending'}
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!oversightMode && (
            <Button
              onClick={generate}
              disabled={!releaseId || !readiness?.ready || Boolean(dhf)}
            >
              Generate and lock DHF
            </Button>
          )}
          {dhf?.version_id && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(
                    `/api/dhfs/${dhf.id}/versions/${dhf.version_id}/verify`
                  )
                }
              >
                Verify checksums
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(
                    `/api/dhfs/${dhf.id}/versions/${dhf.version_id}/download`
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" /> Download protected ZIP
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          DHF generation records objective evidence; it does not by itself claim
          AS9100 compliance.
        </p>
      </CardContent>
    </Card>
  );
}

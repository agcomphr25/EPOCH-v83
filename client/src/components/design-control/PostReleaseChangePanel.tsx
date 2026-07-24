import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  GitCompare,
  LockKeyhole,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiRequest, queryClient } from '@/lib/queryClient';

type Props = {
  projectId?: string | null;
  recordId?: string | null;
  oversightMode?: boolean;
};

export function PostReleaseChangePanel({
  projectId,
  recordId,
  oversightMode = false,
}: Props) {
  const [ecnId, setEcnId] = useState('');
  const [revision, setRevision] = useState('');
  const [receipt, setReceipt] = useState<any>(null);
  const enabled = Boolean(projectId && recordId && ecnId);
  const readiness = useQuery<any>({
    queryKey: [
      '/api/engineering-releases/readiness',
      projectId,
      recordId,
      ecnId,
      revision,
    ],
    enabled,
    queryFn: async () => {
      const query = new URLSearchParams({
        projectId: projectId!,
        recordId: recordId!,
        ecnId,
        ...(revision ? { proposedRevision: revision } : {}),
      });
      const response = await fetch(
        `/api/engineering-releases/readiness?${query}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });
  const createRelease = async () => {
    const reason = window.prompt('Controlled release reason');
    if (!reason) return;
    const response = await apiRequest(
      `/api/engineering-releases/ecns/${ecnId}/create-engineering-release`,
      {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          recordId,
          proposedRevision: revision || undefined,
          reason,
        }),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }
    );
    const result = await response.json();
    setReceipt(result);
    await queryClient.invalidateQueries({
      queryKey: ['/api/engineering-releases/readiness'],
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="h-4 w-4" />
          Post-release change and Engineering Release
          {oversightMode && <Badge variant="outline">QMS oversight</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          <Input
            value={ecnId}
            onChange={(event) => setEcnId(event.target.value)}
            placeholder="Authorizing ECN ID"
          />
          <Input
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            placeholder="Optional human revision (sequence is server allocated)"
          />
        </div>
        {!enabled && (
          <p className="text-sm text-muted-foreground">
            Select an authoritative R&amp;D Design Control record and an ECN.
          </p>
        )}
        {readiness.data && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge>{readiness.data.releaseType}</Badge>
              <Badge variant="outline">
                Proposed {readiness.data.proposedRevision} · sequence{' '}
                {readiness.data.proposedSequence}
              </Badge>
              <Badge variant={readiness.data.ready ? 'default' : 'destructive'}>
                {readiness.data.ready ? 'Ready' : 'Blocked'}
              </Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                ['Affected steps', readiness.data.reopenedStepReadiness],
                ['Forms and approvals', readiness.data.formReadiness],
                [
                  'Implementation actions',
                  readiness.data.implementationActionReadiness,
                ],
                ['Verification / validation', readiness.data.vvReadiness],
                [
                  'Affected-item reconciliation',
                  readiness.data.affectedItemReconciliation,
                ],
                [
                  'Manufacturing references',
                  readiness.data.manufacturingEvidenceReadiness,
                ],
              ].map(([label, status]: any) => (
                <div key={label} className="rounded border p-2 text-sm">
                  {status?.ready ? (
                    <CheckCircle2 className="mr-1 inline h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="mr-1 inline h-4 w-4 text-amber-600" />
                  )}
                  {label}
                </div>
              ))}
            </div>
            {readiness.data.blockingIssues?.map((issue: string) => (
              <button
                key={issue}
                className="block text-left text-sm text-destructive underline"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('design-control-navigate-blocker', {
                      detail: issue,
                    })
                  )
                }
              >
                {issue}
              </button>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => readiness.refetch()}>
                Preview readiness
              </Button>
              <Button variant="outline">
                <GitCompare className="mr-2 h-4 w-4" />
                Compare predecessor
              </Button>
              {!oversightMode && (
                <Button
                  disabled={!readiness.data.ready}
                  onClick={createRelease}
                >
                  Create Engineering Release
                </Button>
              )}
            </div>
          </>
        )}
        {receipt?.release && (
          <div className="rounded border border-green-600 p-3 text-sm">
            Release {receipt.release.release_revision} created and ECN closed.
            <div className="font-mono text-xs">
              {receipt.release.release_checksum}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

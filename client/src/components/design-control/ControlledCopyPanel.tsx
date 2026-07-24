import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileCheck2, Printer, RefreshCw } from 'lucide-react';

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

export function ControlledCopyPanel({
  projectId,
  recordId,
  oversightMode = false,
}: Props) {
  const [status, setStatus] = useState('');
  const [department, setDepartment] = useState('');
  const query = useQuery<any[]>({
    queryKey: [
      '/api/controlled-copies',
      projectId,
      recordId,
      status,
      department,
    ],
    enabled: Boolean(recordId || oversightMode),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (recordId) params.set('recordId', recordId);
      if (status) params.set('status', status);
      if (department) params.set('department', department);
      const response = await fetch(`/api/controlled-copies?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  });
  const mutate = async (copyId: string, action: string, details?: unknown) => {
    const reason = window.prompt(`Reason for ${action}`);
    if (!reason) return;
    await apiRequest(`/api/controlled-copies/${copyId}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
    });
    await queryClient.invalidateQueries({
      queryKey: ['/api/controlled-copies'],
    });
  };
  const issue = async () => {
    const sourceType = window.prompt(
      'Source type: DESIGN_CONTROL_TEMPLATE, PROJECT_FORM_INSTANCE, ECR, ECN, or ENGINEERING_RELEASE'
    );
    const sourceId = window.prompt('Exact retained source ID');
    const displayName = window.prompt('Recipient display name');
    if (!sourceType || !sourceId || !displayName) return;
    await apiRequest('/api/controlled-copies', {
      method: 'POST',
      body: JSON.stringify({
        sourceType,
        sourceId,
        recipient: { type: 'EXTERNAL', displayName },
        purpose: 'Controlled Design Control evidence distribution',
        department,
        acknowledgementRequired: true,
      }),
    });
    await query.refetch();
  };
  const reportLost = async (copyId: string) => {
    const reportedBy = window.prompt('Person reporting the loss');
    const lastKnownHolderLocation = window.prompt(
      'Last known holder and location'
    );
    const searchActions = window.prompt('Search and recovery actions');
    const securityAssessment = window.prompt('Information/security assessment');
    const qualityImpactAssessment = window.prompt('Quality impact assessment');
    const revisionRisk = window.prompt('Obsolescence/revision risk');
    const dispositionApproval = window.prompt('Disposition approver/reference');
    if (
      !reportedBy ||
      !lastKnownHolderLocation ||
      !searchActions ||
      !securityAssessment ||
      !qualityImpactAssessment ||
      !revisionRisk ||
      !dispositionApproval
    )
      return;
    await mutate(copyId, 'report-lost', {
      discoveryDate: new Date().toISOString(),
      reportedBy,
      lastKnownHolderLocation,
      searchActions,
      securityAssessment,
      qualityImpactAssessment,
      revisionRisk,
      dispositionApproval,
      correctiveActionReference: null,
    });
  };
  const copies = query.data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="h-4 w-4" />
          Controlled printed-copy reconciliation
          {oversightMode && <Badge variant="outline">Document Control</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            className="max-w-52"
            value={status}
            onChange={(event) => setStatus(event.target.value.toUpperCase())}
            placeholder="Status: ISSUED, LOST…"
          />
          <Input
            className="max-w-52"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="Department"
          />
          <Button variant="outline" onClick={() => query.refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {!oversightMode && (
            <Button onClick={issue}>
              <Printer className="mr-2 h-4 w-4" />
              Issue controlled copy
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Ordinary preview printing remains explicitly UNCONTROLLED WHEN PRINTED
          and does not create an accountable copy record.
        </p>
        {copies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No controlled copies match these live filters.
          </p>
        ) : (
          <div className="space-y-2">
            {copies.map((copy) => (
              <div key={copy.id} className="rounded border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold">
                    {copy.copy_number}
                  </span>
                  <Badge
                    variant={
                      copy.lifecycle_status === 'ISSUED'
                        ? 'destructive'
                        : 'outline'
                    }
                  >
                    {copy.lifecycle_status}
                  </Badge>
                  {copy.obsolete_source_conflict && (
                    <Badge variant="destructive">
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      Obsolete-source conflict
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-sm">
                  {copy.source_document_number} Rev {copy.source_revision} ·{' '}
                  {copy.recipient_snapshot?.displayName} ·{' '}
                  {copy.location || '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Issued {new Date(copy.issued_at).toLocaleDateString()}
                  {copy.due_at
                    ? ` · due ${new Date(copy.due_at).toLocaleDateString()}`
                    : ''}
                  {copy.overdue_age_days > 0
                    ? ` · ${copy.overdue_age_days} days overdue`
                    : ''}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.open(`/api/controlled-copies/${copy.id}/pdf`)
                    }
                  >
                    Retained PDF
                  </Button>
                  {copy.lifecycle_status === 'ISSUED' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mutate(copy.id, 'return')}
                      >
                        Record return
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reportLost(copy.id)}
                      >
                        Report lost
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      window.open(`/api/controlled-copies/${copy.id}/history`)
                    }
                  >
                    History
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

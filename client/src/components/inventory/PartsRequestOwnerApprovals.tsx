import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PartsRequest } from '@shared/schema';

import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type PartsRequestApproval = PartsRequest & {
  project?: {
    projectCode?: string | null;
    projectName?: string | null;
  };
  approvalHistory?: Array<Record<string, unknown>> | null;
};

interface PartsRequestOwnerApprovalsProps {
  userName?: string;
  compact?: boolean;
}

export default function PartsRequestOwnerApprovals({
  userName,
  compact = false,
}: PartsRequestOwnerApprovalsProps) {
  const queryClient = useQueryClient();
  const [signatureById, setSignatureById] = useState<Record<number, string>>({});
  const [notesById, setNotesById] = useState<Record<number, string>>({});

  const { data: requests = [], isLoading } = useQuery<PartsRequestApproval[]>({
    queryKey: ['/api/inventory/parts-requests/owner-approvals'],
    queryFn: () => apiRequest('/api/inventory/parts-requests/owner-approvals'),
  });

  const totalPendingValue = useMemo(
    () =>
      requests.reduce(
        (sum, request) => sum + Number(request.estimatedCost || 0),
        0
      ),
    [requests]
  );

  const approvalMutation = useMutation({
    mutationFn: ({
      id,
      decision,
      digitalSignature,
      notes,
    }: {
      id: number;
      decision: 'APPROVED' | 'REJECTED';
      digitalSignature: string;
      notes?: string;
    }) =>
      apiRequest(`/api/inventory/parts-requests/${id}/approve`, {
        method: 'POST',
        body: {
          decision,
          approvedBy: userName,
          digitalSignature,
          notes,
        },
      }),
    onSuccess: () => {
      toast.success('Parts request approval recorded');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests/owner-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to record approval'),
  });

  const submitDecision = (request: PartsRequestApproval, decision: 'APPROVED' | 'REJECTED') => {
    const signature = signatureById[request.id]?.trim();
    if (!signature) {
      toast.error('Digital signature is required');
      return;
    }

    approvalMutation.mutate({
      id: request.id,
      decision,
      digitalSignature: signature,
      notes: notesById[request.id]?.trim() || undefined,
    });
  };

  return (
    <Card className={compact ? 'border-amber-200 bg-amber-50/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-5 w-5 text-amber-600" />
            Parts Request Approvals
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{requests.length} pending</Badge>
            {requests.length > 0 && (
              <Badge className="bg-amber-100 text-amber-900">
                ${totalPendingValue.toFixed(2)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading owner approvals...</div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-muted-foreground">No parts requests need owner approval.</div>
        ) : (
          requests.map((request) => {
            const totalCost = Number(request.estimatedCost || 0);
            const lastApprovalEvent =
              request.approvalHistory && request.approvalHistory.length > 0
                ? request.approvalHistory[request.approvalHistory.length - 1]
                : undefined;
            return (
              <div key={request.id} className="rounded-md border bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{request.partName}</div>
                    <div className="text-sm text-muted-foreground">
                      {request.partNumber} | Qty {request.quantity} | Requested by {request.requestedBy}
                    </div>
                    {request.project && (
                      <div className="text-sm text-muted-foreground">
                        {request.project.projectCode} - {request.project.projectName}
                      </div>
                    )}
                  </div>
                  <Badge className="bg-amber-100 text-amber-900">
                    ${totalCost.toFixed(2)}
                  </Badge>
                </div>

                {lastApprovalEvent?.notes && (
                  <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {String(lastApprovalEvent.notes)}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor={`signature-${request.id}`}>Digital Signature</Label>
                    <Input
                      id={`signature-${request.id}`}
                      value={signatureById[request.id] || ''}
                      onChange={(event) =>
                        setSignatureById((prev) => ({
                          ...prev,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder={userName || 'Type your name'}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`approval-notes-${request.id}`}>Approval Notes</Label>
                    <Textarea
                      id={`approval-notes-${request.id}`}
                      value={notesById[request.id] || ''}
                      onChange={(event) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [request.id]: event.target.value,
                        }))
                      }
                      rows={1}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submitDecision(request, 'REJECTED')}
                    disabled={approvalMutation.isPending}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    onClick={() => submitDecision(request, 'APPROVED')}
                    disabled={approvalMutation.isPending}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

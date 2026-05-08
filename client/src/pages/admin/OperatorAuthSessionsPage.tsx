/**
 * Admin viewer for active operator-auth sessions (Task #143 Phase 2).
 *
 * Read-only list of currently-active shop-floor sessions plus an
 * inline revoke action. Useful when an employee leaves a badge unattended
 * at a workstation or when an HR/security event requires force-logging
 * everyone out of a station.
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface AdminSession {
  id: string;
  employeeId: number;
  employeeDisplayName: string;
  authMethod: 'BADGE' | 'PIN' | 'SSO';
  workstationId: string | null;
  ipAddress: string | null;
  issuedAt: string;
  lastActivityAt: string;
  lastReauthAt: string;
  expiresAt: string;
  idleTimeoutSeconds: number;
  hasFreshReauth: boolean;
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export default function OperatorAuthSessionsPage() {
  const { toast } = useToast();
  const [revokeTarget, setRevokeTarget] = useState<AdminSession | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading } = useQuery<{ sessions: AdminSession[] }>({
    queryKey: ['/api/operator-auth/sessions'],
    refetchInterval: 30_000,
  });

  const revoke = useMutation({
    mutationFn: async (vars: { sessionId: string; reason: string }) =>
      apiRequest('/api/operator-auth/revoke', {
        method: 'POST',
        body: vars,
      }),
    onSuccess: () => {
      toast({ title: 'Session revoked.' });
      queryClient.invalidateQueries({ queryKey: ['/api/operator-auth/sessions'] });
      setRevokeTarget(null);
      setReason('');
    },
    onError: (err: any) => {
      toast({
        title: 'Revoke failed',
        description: err?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const sessions = data?.sessions ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-operator-auth-sessions">
      <Card>
        <CardHeader>
          <CardTitle>Active operator sessions</CardTitle>
          <CardDescription>
            Live view of every shop-floor operator currently authenticated for material
            issue / scrap / override actions. Auto-refreshes every 30 seconds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p data-testid="text-loading">Loading sessions…</p>
          ) : sessions.length === 0 ? (
            <p
              data-testid="text-no-sessions"
              className="text-sm text-muted-foreground"
            >
              No active operator sessions.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Workstation</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Last activity</TableHead>
                  <TableHead>Last re-auth</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
                    <TableCell data-testid={`text-operator-${s.id}`}>
                      {s.employeeDisplayName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.authMethod}</Badge>
                    </TableCell>
                    <TableCell>{s.workstationId ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{s.ipAddress ?? '—'}</TableCell>
                    <TableCell title={s.lastActivityAt}>
                      {formatRelative(s.lastActivityAt)}
                    </TableCell>
                    <TableCell title={s.lastReauthAt}>
                      {formatRelative(s.lastReauthAt)}{' '}
                      {s.hasFreshReauth && (
                        <Badge variant="secondary" className="ml-1">fresh</Badge>
                      )}
                    </TableCell>
                    <TableCell title={s.expiresAt}>
                      {new Date(s.expiresAt).toLocaleTimeString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid={`button-revoke-${s.id}`}
                        onClick={() => setRevokeTarget(s)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <DialogContent data-testid="dialog-revoke-session">
          <DialogHeader>
            <DialogTitle>Revoke operator session</DialogTitle>
            <DialogDescription>
              Force-logout {revokeTarget?.employeeDisplayName} from{' '}
              {revokeTarget?.workstationId ?? 'their workstation'}. They will need to
              re-scan their badge before issuing material again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="revoke-reason">Reason (optional)</Label>
            <Input
              id="revoke-reason"
              data-testid="input-revoke-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. badge left at workstation"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRevokeTarget(null)}
              data-testid="button-cancel-revoke"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              data-testid="button-confirm-revoke"
              disabled={revoke.isPending}
              onClick={() =>
                revokeTarget &&
                revoke.mutate({ sessionId: revokeTarget.id, reason })
              }
            >
              {revoke.isPending ? 'Revoking…' : 'Revoke session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

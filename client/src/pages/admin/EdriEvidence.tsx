import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Download, RefreshCw, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping', CHARGE_CODE: 'Charge Code', ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement', INVENTORY: 'Inventory', POLICY: 'Policy',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'READY') return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === 'FAILED') return <XCircle className="h-5 w-5 text-red-500" />;
  if (status === 'GENERATING') return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
  return <Clock className="h-5 w-5 text-yellow-500" />;
}

export default function EdriEvidence() {
  const { snapshotId, domainKey } = useParams<{ snapshotId: string; domainKey?: string }>();
  const { toast } = useToast();
  const [packetId, setPacketId] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);

  const { data: snapshot } = useQuery<any>({
    queryKey: ['/api/edri/snapshot', snapshotId],
    queryFn: async () => {
      const res = await fetch(`/api/edri/snapshot/${snapshotId}`);
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
  });

  const { data: packet, refetch: refetchPacket } = useQuery<any>({
    queryKey: ['/api/edri/evidence', packetId],
    queryFn: async () => {
      if (!packetId) return null;
      const res = await fetch(`/api/edri/evidence/${packetId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: packetId != null,
    refetchInterval: polling ? 2000 : false,
  });

  useEffect(() => {
    if (packet?.status === 'READY' || packet?.status === 'FAILED') {
      setPolling(false);
    }
  }, [packet]);

  const generateMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/edri/evidence/generate', {
      snapshotId: parseInt(snapshotId),
      domainKey: domainKey ?? null,
    }),
    onSuccess: (data: any) => {
      setPacketId(data.packetId);
      setPolling(true);
      toast({ title: 'Evidence packet generation started' });
    },
    onError: () => toast({ title: 'Failed to start generation', variant: 'destructive' }),
  });

  if (!snapshot) return <div className="p-6"><Skeleton className="h-96" /></div>;

  const { snapshot: snap, domainScores, redFlags, remediationItems } = snapshot;
  const filteredFlags = domainKey ? (redFlags ?? []).filter((f: any) => f.domainKey === domainKey) : (redFlags ?? []);
  const filteredRem = domainKey ? (remediationItems ?? []).filter((r: any) => r.domainKey === domainKey) : (remediationItems ?? []);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/edri"><ArrowLeft className="h-4 w-4 mr-1" />EDRI Dashboard</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Evidence Packet</h1>
        <p className="text-muted-foreground">
          Snapshot #{snapshotId}{domainKey ? ` · ${DOMAIN_LABELS[domainKey] ?? domainKey}` : ' · All Domains'}
        </p>
      </div>

      {/* Snapshot summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Snapshot Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-muted-foreground">Composite Score</p><p className="font-bold text-2xl">{Number(snap?.compositeScore ?? 0).toFixed(1)}</p></div>
          <div><p className="text-muted-foreground">Scoring Band</p><p className="font-bold">{snap?.scoringBand}</p></div>
          <div><p className="text-muted-foreground">Computed</p><p className="font-bold">{snap?.computedAt ? new Date(snap.computedAt).toLocaleDateString() : '—'}</p></div>
        </CardContent>
      </Card>

      {/* Generation control */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evidence Packet Generation</CardTitle>
          <CardDescription>Compile all supporting artifacts for DCAA review</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {packet && (
            <div className="flex items-center gap-3 p-3 rounded-md border">
              <StatusIcon status={packet.status} />
              <div>
                <p className="font-medium text-sm">Status: {packet.status}</p>
                {packet.status === 'READY' && packet.storagePath && (
                  <p className="text-xs text-muted-foreground">Path: {packet.storagePath}</p>
                )}
                {packet.status === 'FAILED' && (
                  <p className="text-xs text-red-500">{packet.errorMessage}</p>
                )}
                {(packet.status === 'PENDING' || packet.status === 'GENERATING') && (
                  <p className="text-xs text-muted-foreground">Generation in progress...</p>
                )}
              </div>
              {packet.status === 'READY' && (
                <Button size="sm" variant="outline" className="ml-auto" asChild>
                  <a
                    href={`/api/edri/evidence/${packet.id}/download`}
                    download={`edri-evidence-packet-${packet.id}.zip`}
                    onClick={() => toast({ title: 'Downloading evidence packet ZIP…' })}
                  >
                    <Download className="h-3 w-3 mr-1" />Download ZIP
                  </a>
                </Button>
              )}
            </div>
          )}

          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || polling}>
            {generateMutation.isPending || polling
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating...</>
              : <><Download className="h-4 w-4 mr-2" />Generate Evidence Packet</>
            }
          </Button>
        </CardContent>
      </Card>

      {/* Evidence items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Evidence Items ({filteredFlags.length} gaps, {filteredRem.length} remediation items)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-semibold mb-2">Active Red Flags</p>
            {filteredFlags.filter((f: any) => f.isActive).length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <div className="space-y-1">
                {filteredFlags.filter((f: any) => f.isActive).map((flag: any) => (
                  <div key={flag.id} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                    <Badge variant="outline" className="text-xs">{flag.severity}</Badge>
                    <span>{flag.title}</span>
                    {flag.farCitation && <span className="text-xs text-blue-600 dark:text-blue-400 ml-auto">{flag.farCitation}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Remediation Items</p>
            {filteredRem.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <div className="space-y-1">
                {filteredRem.map((item: any) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm p-2 bg-muted rounded">
                    <Badge variant="outline" className="text-xs">{item.priority}</Badge>
                    <span>{item.title}</span>
                    <Badge variant="outline" className={`text-xs ml-auto ${item.status === 'RESOLVED' ? 'text-green-600' : ''}`}>{item.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

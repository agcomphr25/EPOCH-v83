import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { FileText, ShieldCheck, AlertCircle, Download } from 'lucide-react';

interface Policy {
  id: string;
  key: string;
  title: string;
  description: string | null;
  source: 'in-repo' | 'external-upload';
  owner: string | null;
  effectiveDate: string | null;
  requiresAcknowledgment: boolean;
  currentVersionId: string | null;
}
interface PolicyVersion {
  id: string;
  policyId: string;
  versionNumber: number;
  body: string | null;
  uploadedFileUrl: string | null;
  uploadedFileName: string | null;
  uploadedFileMime: string | null;
  contentHash: string;
  changeSummary: string | null;
  publishedAt: string;
  publishedByDisplayName: string | null;
}
interface PolicyWithCurrent {
  policy: Policy;
  currentVersion: PolicyVersion | null;
}
interface OutstandingRow {
  policy: Policy;
  currentVersion: PolicyVersion;
}

export default function PolicyLibraryPage() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<{ policy: Policy; version: PolicyVersion } | null>(null);

  const { data: policies = [], isLoading } = useQuery<PolicyWithCurrent[]>({
    queryKey: ['/api/policies'],
  });
  const { data: outstanding = [] } = useQuery<OutstandingRow[]>({
    queryKey: ['/api/policies/outstanding'],
  });
  const { data: myAcks = [] } = useQuery<any[]>({
    queryKey: ['/api/policies/me/acknowledgments'],
  });

  const ackMutation = useMutation({
    mutationFn: (key: string) => apiRequest(`/api/policies/${key}/acknowledge`, { method: 'POST' }),
    onSuccess: () => {
      toast({ title: 'Acknowledgment recorded' });
      queryClient.invalidateQueries({ queryKey: ['/api/policies/outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies/me/acknowledgments'] });
    },
    onError: (err: any) => toast({ title: 'Failed to acknowledge', description: err.message, variant: 'destructive' }),
  });

  const ackedVersionIds = new Set(myAcks.map((a) => a.policyVersionId));

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-policy-library">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileText className="h-7 w-7" /> Written Policies Library
        </h1>
        <p className="text-muted-foreground mt-1">
          Canonical, versioned written policies. Acknowledge each new version to stay compliant.
        </p>
      </div>

      {outstanding.length > 0 && (
        <Card className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" data-testid="card-outstanding-policies">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-5 w-5" />
              {outstanding.length} {outstanding.length === 1 ? 'policy needs' : 'policies need'} your acknowledgment
            </CardTitle>
            <CardDescription>Review and acknowledge each policy below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {outstanding.map(({ policy, currentVersion }) => (
              <div key={policy.id} className="flex items-center justify-between gap-4 p-3 border rounded-md bg-background">
                <div>
                  <div className="font-semibold" data-testid={`text-outstanding-${policy.key}`}>{policy.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Version {currentVersion.versionNumber} · published{' '}
                    {new Date(currentVersion.publishedAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelected({ policy, version: currentVersion })} data-testid={`button-review-${policy.key}`}>
                    Review
                  </Button>
                  <Button size="sm" onClick={() => ackMutation.mutate(policy.key)} disabled={ackMutation.isPending} data-testid={`button-acknowledge-${policy.key}`}>
                    Acknowledge
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All policies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {policies.map(({ policy, currentVersion }) => {
                const acked = currentVersion ? ackedVersionIds.has(currentVersion.id) : false;
                return (
                  <Card key={policy.id} className="hover-elevate" data-testid={`card-policy-${policy.key}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg">{policy.title}</CardTitle>
                        <div className="flex flex-col gap-1 items-end">
                          <Badge variant={policy.source === 'in-repo' ? 'secondary' : 'outline'}>
                            {policy.source}
                          </Badge>
                          {currentVersion && (
                            <Badge variant="outline">v{currentVersion.versionNumber}</Badge>
                          )}
                        </div>
                      </div>
                      {policy.description && (
                        <CardDescription>{policy.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {policy.owner && <div>Owner: {policy.owner}</div>}
                        {policy.effectiveDate && <div>Effective: {policy.effectiveDate}</div>}
                        {!currentVersion && <div className="text-amber-600">No version published yet</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        {currentVersion ? (
                          <Button size="sm" variant="outline" onClick={() => setSelected({ policy, version: currentVersion })} data-testid={`button-open-${policy.key}`}>
                            View
                          </Button>
                        ) : null}
                        {acked && (
                          <Badge className="gap-1" variant="default">
                            <ShieldCheck className="h-3 w-3" /> Acknowledged
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>
              {selected?.policy.title} — v{selected?.version.versionNumber}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            {selected?.version.body ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.version.body}</ReactMarkdown>
              </div>
            ) : selected?.version.uploadedFileUrl ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  This policy is stored as an uploaded file ({selected.version.uploadedFileName}).
                </p>
                <a href={selected.version.uploadedFileUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </a>
              </div>
            ) : (
              <div className="text-muted-foreground">No content available.</div>
            )}
          </ScrollArea>
          <DialogFooter>
            {selected && !ackedVersionIds.has(selected.version.id) && (
              <Button onClick={() => { ackMutation.mutate(selected.policy.key); setSelected(null); }}>
                Acknowledge this version
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>My acknowledgment history</CardTitle>
        </CardHeader>
        <CardContent>
          {myAcks.length === 0 ? (
            <div className="text-muted-foreground text-sm">No acknowledgments yet.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {myAcks.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between border-b pb-1" data-testid={`row-ack-${a.id}`}>
                  <span>{a.policyId}</span>
                  <span className="text-muted-foreground">{new Date(a.acknowledgedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

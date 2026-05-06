import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, AlertTriangle, CheckCircle2, FileWarning, Upload, RefreshCw } from 'lucide-react';

interface Policy {
  id: string;
  key: string;
  title: string;
  source: 'in-repo' | 'external-upload';
  owner: string | null;
  currentVersionId: string | null;
}
interface PolicyVersion {
  id: string;
  versionNumber: number;
  publishedAt: string;
  publishedByDisplayName: string | null;
  changeSummary: string | null;
  contentHash: string;
  uploadedFileName: string | null;
  uploadedFileUrl: string | null;
}
interface CoverageRow {
  policyId: string;
  policyKey: string;
  policyTitle: string;
  currentVersionNumber: number | null;
  publishedAt: string | null;
  eligibleUserCount: number;
  acknowledgedUserCount: number;
  overdueUserCount: number;
  overdueUsers: Array<{ userId: number; username: string; role: string }>;
}
interface DriftRow {
  policyId: string;
  policyKey: string;
  state: 'in-sync' | 'drift' | 'no-published-version' | 'doc-missing' | 'not-applicable';
  liveHash: string | null;
  publishedHash: string | null;
}

export default function PoliciesAdminPage() {
  const { toast } = useToast();
  const [publishOpen, setPublishOpen] = useState<{ key: string; title: string; source: string } | null>(null);
  const [changeSummary, setChangeSummary] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [versionsOpenFor, setVersionsOpenFor] = useState<Policy | null>(null);

  const { data: policies = [] } = useQuery<{ policy: Policy; currentVersion: PolicyVersion | null }[]>({
    queryKey: ['/api/policies'],
  });
  const { data: coverage = [], refetch: refetchCoverage } = useQuery<CoverageRow[]>({
    queryKey: ['/api/policies/admin/coverage'],
  });
  const { data: drift = [], refetch: refetchDrift } = useQuery<DriftRow[]>({
    queryKey: ['/api/policies/admin/drift'],
  });
  const { data: versions = [] } = useQuery<PolicyVersion[]>({
    queryKey: ['/api/policies', versionsOpenFor?.key, 'versions'],
    enabled: !!versionsOpenFor,
    queryFn: async () => apiRequest(`/api/policies/${versionsOpenFor!.key}/versions`),
  });

  const publishDocMutation = useMutation({
    mutationFn: (vars: { key: string; changeSummary: string }) =>
      apiRequest(`/api/policies/${vars.key}/publish-from-doc`, {
        method: 'POST',
        body: { changeSummary: vars.changeSummary },
      }),
    onSuccess: () => {
      toast({ title: 'New version published from doc' });
      setPublishOpen(null);
      setChangeSummary('');
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies/admin/coverage'] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies/admin/drift'] });
    },
    onError: (e: any) => toast({ title: 'Publish failed', description: e.message, variant: 'destructive' }),
  });

  const uploadMutation = useMutation({
    mutationFn: async (vars: { key: string; file: File; changeSummary: string }) => {
      const fd = new FormData();
      fd.append('file', vars.file);
      fd.append('changeSummary', vars.changeSummary);
      const res = await fetch(`/api/policies/${vars.key}/upload-version`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'New version uploaded' });
      setPublishOpen(null);
      setChangeSummary('');
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/policies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/policies/admin/coverage'] });
    },
    onError: (e: any) => toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }),
  });

  const driftCount = drift.filter((d) => d.state === 'drift' || d.state === 'doc-missing').length;

  return (
    <div className="container mx-auto py-6 space-y-6" data-testid="page-policies-admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7" /> Policies Administration
          </h1>
          <p className="text-muted-foreground">
            Publish in-repo policy snapshots, upload externally-authored policies, and monitor acknowledgment coverage.
          </p>
        </div>
      </div>

      {driftCount > 0 && (
        <Card className="border-red-500/50 bg-red-50 dark:bg-red-950/20" data-testid="card-drift-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" /> Drift detected in {driftCount} policy doc(s)
            </CardTitle>
            <CardDescription>
              The live markdown files differ from the latest published version. Publish a new version or revert the file.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies" data-testid="tab-policies">Policies</TabsTrigger>
          <TabsTrigger value="coverage" data-testid="tab-coverage">Acknowledgment coverage</TabsTrigger>
          <TabsTrigger value="drift" data-testid="tab-drift">Drift report</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-3">
          {policies.map(({ policy, currentVersion }) => (
            <Card key={policy.id} data-testid={`card-admin-policy-${policy.key}`}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{policy.title}</CardTitle>
                    <CardDescription className="font-mono text-xs">{policy.key}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={policy.source === 'in-repo' ? 'secondary' : 'outline'}>{policy.source}</Badge>
                    {currentVersion && <Badge variant="outline">v{currentVersion.versionNumber}</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setVersionsOpenFor(policy)} data-testid={`button-versions-${policy.key}`}>
                  Version history
                </Button>
                {policy.source === 'in-repo' ? (
                  <Button size="sm" onClick={() => setPublishOpen({ key: policy.key, title: policy.title, source: policy.source })} data-testid={`button-publish-${policy.key}`}>
                    Publish from doc
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => setPublishOpen({ key: policy.key, title: policy.title, source: policy.source })} data-testid={`button-upload-${policy.key}`}>
                    <Upload className="h-3 w-3 mr-1" /> Upload new version
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="coverage" className="space-y-3">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => refetchCoverage()} data-testid="button-refresh-coverage">
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <a href="/api/policies/admin/coverage.csv" download>
              <Button size="sm" variant="outline" data-testid="button-export-coverage">Export CSV</Button>
            </a>
          </div>
          {coverage.map((row) => (
            <Card key={row.policyId} data-testid={`row-coverage-${row.policyKey}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{row.policyTitle}</span>
                  <Badge variant={row.overdueUserCount === 0 ? 'default' : 'destructive'}>
                    {row.acknowledgedUserCount}/{row.eligibleUserCount} acknowledged
                  </Badge>
                </CardTitle>
                {row.currentVersionNumber == null ? (
                  <CardDescription className="text-amber-600">No version published</CardDescription>
                ) : (
                  <CardDescription>
                    v{row.currentVersionNumber} · published{' '}
                    {row.publishedAt ? new Date(row.publishedAt).toLocaleDateString() : '—'}
                  </CardDescription>
                )}
              </CardHeader>
              {row.overdueUsers.length > 0 && (
                <CardContent>
                  <div className="text-xs font-medium mb-1">Overdue users</div>
                  <div className="flex flex-wrap gap-1">
                    {row.overdueUsers.map((u) => (
                      <Badge key={u.userId} variant="outline" className="text-xs">
                        {u.username} ({u.role})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="drift" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => refetchDrift()} data-testid="button-refresh-drift">
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
          {drift.map((row) => (
            <Card key={row.policyId} data-testid={`row-drift-${row.policyKey}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {row.state === 'in-sync' && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {row.state === 'drift' && <AlertTriangle className="h-4 w-4 text-red-600" />}
                  {row.state === 'doc-missing' && <FileWarning className="h-4 w-4 text-red-600" />}
                  {row.policyKey}
                  <Badge variant={row.state === 'in-sync' ? 'default' : row.state === 'not-applicable' ? 'secondary' : 'destructive'}>
                    {row.state}
                  </Badge>
                </CardTitle>
                <CardDescription className="font-mono text-xs">
                  live: {row.liveHash?.slice(0, 12) ?? '—'} · published: {row.publishedHash?.slice(0, 12) ?? '—'}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Publish / Upload dialog */}
      <Dialog open={!!publishOpen} onOpenChange={(o) => !o && setPublishOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {publishOpen?.source === 'in-repo' ? 'Publish from doc' : 'Upload new version'}: {publishOpen?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {publishOpen?.source === 'external-upload' && (
              <div>
                <Label>File</Label>
                <Input
                  type="file"
                  accept=".pdf,.docx,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  data-testid="input-policy-file"
                />
              </div>
            )}
            <div>
              <Label>Change summary</Label>
              <Textarea
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="What changed in this version?"
                data-testid="input-change-summary"
              />
            </div>
            {publishOpen?.source === 'in-repo' && (
              <p className="text-xs text-muted-foreground">
                A snapshot of <code>docs/policies/{publishOpen?.key}.md</code> will be hashed and stored as a new immutable version.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(null)}>Cancel</Button>
            {publishOpen?.source === 'in-repo' ? (
              <Button
                onClick={() => publishDocMutation.mutate({ key: publishOpen!.key, changeSummary })}
                disabled={publishDocMutation.isPending}
                data-testid="button-confirm-publish"
              >
                Publish
              </Button>
            ) : (
              <Button
                onClick={() => uploadFile && uploadMutation.mutate({ key: publishOpen!.key, file: uploadFile, changeSummary })}
                disabled={!uploadFile || uploadMutation.isPending}
                data-testid="button-confirm-upload"
              >
                Upload
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versions dialog */}
      <Dialog open={!!versionsOpenFor} onOpenChange={(o) => !o && setVersionsOpenFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Version history: {versionsOpenFor?.title}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {versions.map((v) => (
                <Card key={v.id} data-testid={`row-version-${v.versionNumber}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Version {v.versionNumber}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {new Date(v.publishedAt).toLocaleString()}
                      </span>
                    </CardTitle>
                    {v.publishedByDisplayName && (
                      <CardDescription>by {v.publishedByDisplayName}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="text-xs space-y-1">
                    {v.changeSummary && <div>{v.changeSummary}</div>}
                    <div className="font-mono text-muted-foreground">hash: {v.contentHash.slice(0, 24)}…</div>
                    {v.uploadedFileUrl && (
                      <a className="text-primary underline" href={v.uploadedFileUrl} target="_blank" rel="noreferrer">
                        Download {v.uploadedFileName}
                      </a>
                    )}
                  </CardContent>
                </Card>
              ))}
              {versions.length === 0 && (
                <div className="text-sm text-muted-foreground">No versions published yet.</div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

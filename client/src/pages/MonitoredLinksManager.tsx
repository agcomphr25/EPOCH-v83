import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Link2,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  Loader2,
  ArrowLeft,
  Globe,
  Server,
} from 'lucide-react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';

interface MonitoredLink {
  id: number;
  name: string;
  url: string;
  linkType: 'external' | 'internal';
  description: string | null;
  isEnabled: boolean;
  expectedStatus: number;
  lastCheckedAt: string | null;
  lastStatus: number | null;
  lastCheckResult: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
}

const statusIcons: Record<string, JSX.Element> = {
  healthy: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  '404_not_found': <XCircle className="h-5 w-5 text-red-500" />,
  server_error: <XCircle className="h-5 w-5 text-red-500" />,
  client_error: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  timeout: <Clock className="h-5 w-5 text-orange-500" />,
  connection_error: <XCircle className="h-5 w-5 text-red-500" />,
  unexpected_status: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  unknown: <Clock className="h-5 w-5 text-gray-400" />,
};

const statusLabels: Record<string, string> = {
  healthy: 'Healthy',
  '404_not_found': '404 Not Found',
  server_error: 'Server Error',
  client_error: 'Client Error',
  timeout: 'Timeout',
  connection_error: 'Connection Error',
  unexpected_status: 'Unexpected Status',
  unknown: 'Not Checked',
};

export default function MonitoredLinksManager() {
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newLink, setNewLink] = useState({
    name: '',
    url: '',
    linkType: 'external' as 'external' | 'internal',
    description: '',
    expectedStatus: 200,
  });

  const { data: links = [], isLoading } = useQuery<MonitoredLink[]>({
    queryKey: ['/api/monitored-links'],
  });

  const createMutation = useMutation({
    mutationFn: async (link: typeof newLink) => {
      return apiRequest('/api/monitored-links', {
        method: 'POST',
        body: JSON.stringify(link),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/monitored-links'] });
      setIsAddDialogOpen(false);
      setNewLink({ name: '', url: '', linkType: 'external', description: '', expectedStatus: 200 });
      toast({ title: 'Link added', description: 'Monitored link has been created.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create monitored link.', variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return apiRequest(`/api/monitored-links/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/monitored-links'] });
      toast({ title: 'Link updated', description: 'Link status has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update link.', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/monitored-links/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/monitored-links'] });
      toast({ title: 'Link deleted', description: 'Monitored link has been removed.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete link.', variant: 'destructive' });
    },
  });

  const checkSingleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/monitored-links/${id}/check`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/monitored-links'] });
      toast({
        title: data.checkResult === 'healthy' ? 'Link is healthy' : 'Link check failed',
        description: `Status: ${data.lastStatus || 'N/A'} - ${statusLabels[data.checkResult] || data.checkResult}`,
        variant: data.checkResult === 'healthy' ? 'default' : 'destructive',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to check link.', variant: 'destructive' });
    },
  });

  const checkAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/monitored-links/check-all', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/monitored-links'] });
      toast({
        title: 'Link check complete',
        description: `Checked ${data.checked} links: ${data.healthy} healthy, ${data.unhealthy} issues found.`,
        variant: data.unhealthy > 0 ? 'destructive' : 'default',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to check all links.', variant: 'destructive' });
    },
  });

  const externalLinks = links.filter(l => l.linkType === 'external');
  const internalLinks = links.filter(l => l.linkType === 'internal');
  const healthyCount = links.filter(l => l.lastCheckResult === 'healthy').length;
  const unhealthyCount = links.filter(l => l.lastCheckResult && l.lastCheckResult !== 'healthy').length;
  const uncheckedCount = links.filter(l => !l.lastCheckResult).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/system-health-checks">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Health Checks
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Link2 className="h-8 w-8" />
            Monitored Links
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure URLs to monitor for 404 errors and availability
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => checkAllMutation.mutate()}
            disabled={checkAllMutation.isPending || links.length === 0}
            data-testid="button-check-all"
          >
            {checkAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check All Links
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-link">
                <Plus className="h-4 w-4 mr-2" />
                Add Link
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Monitored Link</DialogTitle>
                <DialogDescription>
                  Add a URL to monitor for availability and errors
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Link Name</Label>
                  <Input
                    id="name"
                    value={newLink.name}
                    onChange={(e) => setNewLink({ ...newLink, name: e.target.value })}
                    placeholder="e.g., Timer Station, Customer Portal"
                    data-testid="input-link-name"
                  />
                </div>
                <div>
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    value={newLink.url}
                    onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                    placeholder="https://example.com/page or /api/health"
                    data-testid="input-link-url"
                  />
                </div>
                <div>
                  <Label htmlFor="linkType">Link Type</Label>
                  <Select
                    value={newLink.linkType}
                    onValueChange={(value: 'external' | 'internal') => 
                      setNewLink({ ...newLink, linkType: value })
                    }
                  >
                    <SelectTrigger data-testid="select-link-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="external">External (URLs outside EPOCH)</SelectItem>
                      <SelectItem value="internal">Internal (EPOCH routes/APIs)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="expectedStatus">Expected Status Code</Label>
                  <Input
                    id="expectedStatus"
                    type="number"
                    value={newLink.expectedStatus}
                    onChange={(e) => setNewLink({ ...newLink, expectedStatus: parseInt(e.target.value) || 200 })}
                    placeholder="200"
                    data-testid="input-expected-status"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    value={newLink.description}
                    onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                    placeholder="What is this link used for?"
                    rows={2}
                    data-testid="input-link-description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate(newLink)}
                  disabled={!newLink.name || !newLink.url || createMutation.isPending}
                  data-testid="button-create-link"
                >
                  {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Link
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{links.length}</div>
            <p className="text-sm text-muted-foreground">Total Links</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{healthyCount}</div>
            <p className="text-sm text-muted-foreground">Healthy</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{unhealthyCount}</div>
            <p className="text-sm text-muted-foreground">Issues</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-500">{uncheckedCount}</div>
            <p className="text-sm text-muted-foreground">Not Checked</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            External Links ({externalLinks.length})
          </CardTitle>
          <CardDescription>
            URLs outside of EPOCH (third-party services, external apps)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {externalLinks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No external links configured</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Enabled</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {externalLinks.map((link) => (
                  <TableRow key={link.id} data-testid={`row-link-${link.id}`}>
                    <TableCell>
                      <Switch
                        checked={link.isEnabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: link.id, isEnabled: checked })
                        }
                        data-testid={`switch-link-${link.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {link.name}
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {link.url}
                        </div>
                        {link.description && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {link.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusIcons[link.lastCheckResult || 'unknown']}
                        <span>{statusLabels[link.lastCheckResult || 'unknown']}</span>
                        {link.lastStatus && (
                          <Badge variant="outline" className="ml-1">
                            {link.lastStatus}
                          </Badge>
                        )}
                      </div>
                      {link.consecutiveFailures > 0 && (
                        <div className="text-sm text-red-500 mt-1">
                          {link.consecutiveFailures} consecutive failure(s)
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.lastCheckedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(link.lastCheckedAt), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkSingleMutation.mutate(link.id)}
                          disabled={checkSingleMutation.isPending}
                          data-testid={`button-check-${link.id}`}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(link.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${link.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Internal Links ({internalLinks.length})
          </CardTitle>
          <CardDescription>
            EPOCH routes and API endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {internalLinks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No internal links configured</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Enabled</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {internalLinks.map((link) => (
                  <TableRow key={link.id} data-testid={`row-link-${link.id}`}>
                    <TableCell>
                      <Switch
                        checked={link.isEnabled}
                        onCheckedChange={(checked) =>
                          toggleMutation.mutate({ id: link.id, isEnabled: checked })
                        }
                        data-testid={`switch-link-${link.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{link.name}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {link.url}
                        </div>
                        {link.description && (
                          <div className="text-sm text-muted-foreground mt-1">
                            {link.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {statusIcons[link.lastCheckResult || 'unknown']}
                        <span>{statusLabels[link.lastCheckResult || 'unknown']}</span>
                        {link.lastStatus && (
                          <Badge variant="outline" className="ml-1">
                            {link.lastStatus}
                          </Badge>
                        )}
                      </div>
                      {link.consecutiveFailures > 0 && (
                        <div className="text-sm text-red-500 mt-1">
                          {link.consecutiveFailures} consecutive failure(s)
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {link.lastCheckedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(link.lastCheckedAt), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => checkSingleMutation.mutate(link.id)}
                          disabled={checkSingleMutation.isPending}
                          data-testid={`button-check-${link.id}`}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(link.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${link.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Clock, Play, CheckCircle, Eye, Timer, Activity, Link2, Unlink, ExternalLink, Plus, Download, FileText, Lightbulb, X } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ProcessRun {
  programRunId: string;
  programName: string;
  source: string;
  eventCount: number;
  startedAt: string;
  completedAt: string | null;
  lastStepIndex: number | null;
  totalElapsedMinutes: number | null;
  lastEventAt: string;
}

interface ProcessRunLink {
  id: string;
  programRunId: string;
  entityType: 'order' | 'job' | 'work_center';
  entityId: string;
  entityLabel: string | null;
  linkedBy: string | null;
  linkedAt: string;
}

interface ProcessRunDetail {
  programRunId: string;
  programName: string;
  source: string;
  startedAt: string;
  completedAt: string | null;
  totalElapsedMinutes: number | null;
  stepCount: number;
  lastStepIndex: number;
  events: Array<{
    id: string;
    eventType: string;
    stepIndex: number | null;
    totalElapsedMinutes: number | null;
    eventTimestamp: string;
    metadata: Record<string, any> | null;
  }>;
  links: ProcessRunLink[];
}

interface DonnaObservation {
  id: string;
  observationType: string;
  programName: string;
  observationKey: string;
  message: string;
  baselineMinutes: number | null;
  recentAvgMinutes: number | null;
  createdAt: string;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '-';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function RunStatusBadge({ run }: { run: ProcessRun }) {
  if (run.completedAt) {
    return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
  }
  return <Badge variant="secondary" className="bg-blue-600 text-white"><Play className="w-3 h-3 mr-1" /> In Progress</Badge>;
}

function getEntityTypeLabel(type: string): string {
  switch (type) {
    case 'order': return 'Order';
    case 'job': return 'Job';
    case 'work_center': return 'Work Center';
    default: return type;
  }
}

function getEntityLink(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'order': return `/orders/${entityId}`;
    default: return null;
  }
}

function LinkToEntityDialog({ programRunId, onSuccess }: { programRunId: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<'order' | 'job' | 'work_center'>('order');
  const [entityId, setEntityId] = useState('');
  const [entityLabel, setEntityLabel] = useState('');

  const createLink = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/integrations/process-runner/links', {
        method: 'POST',
        body: JSON.stringify({
          programRunId,
          entityType,
          entityId,
          entityLabel: entityLabel || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Link created', description: `Linked to ${getEntityTypeLabel(entityType)} ${entityId}` });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/process-runner/runs', programRunId] });
      setEntityId('');
      setEntityLabel('');
      onSuccess();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create link', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4 p-4 border rounded-md bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Plus className="w-4 h-4" />
        Link to EPOCH Entity
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={entityType} onValueChange={(v) => setEntityType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="job">Job</SelectItem>
              <SelectItem value="work_center">Work Center</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">ID</Label>
          <Input 
            placeholder="e.g., EL069" 
            value={entityId} 
            onChange={(e) => setEntityId(e.target.value)}
            data-testid="input-link-entity-id"
          />
        </div>
        <div>
          <Label className="text-xs">Label (optional)</Label>
          <Input 
            placeholder="Display name" 
            value={entityLabel} 
            onChange={(e) => setEntityLabel(e.target.value)}
            data-testid="input-link-entity-label"
          />
        </div>
      </div>
      <Button 
        size="sm" 
        onClick={() => createLink.mutate()}
        disabled={!entityId || createLink.isPending}
        data-testid="button-create-link"
      >
        <Link2 className="w-4 h-4 mr-1" />
        {createLink.isPending ? 'Linking...' : 'Create Link'}
      </Button>
    </div>
  );
}

function RunDetailDialog({ programRunId }: { programRunId: string }) {
  const { toast } = useToast();
  const [showLinkForm, setShowLinkForm] = useState(false);

  const { data: runDetail, isLoading } = useQuery<ProcessRunDetail>({
    queryKey: ['/api/integrations/process-runner/runs', programRunId],
  });

  const deleteLink = useMutation({
    mutationFn: async (linkId: string) => {
      return apiRequest(`/api/integrations/process-runner/links/${linkId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: 'Link removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/process-runner/runs', programRunId] });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to remove link', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          {runDetail?.programName || 'Process Run Details'}
        </DialogTitle>
      </DialogHeader>
      
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Loading...</div>
      ) : runDetail ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Run ID:</span>
              <p className="font-mono">{runDetail.programRunId}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Source:</span>
              <p>{runDetail.source}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Started:</span>
              <p>{format(new Date(runDetail.startedAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Completed:</span>
              <p>{runDetail.completedAt ? format(new Date(runDetail.completedAt), 'MMM d, yyyy h:mm a') : '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Duration:</span>
              <p>{formatDuration(runDetail.totalElapsedMinutes)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Steps Completed:</span>
              <p>{runDetail.stepCount}</p>
            </div>
          </div>

          {/* Linked Entities Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Linked Entities
              </h4>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowLinkForm(!showLinkForm)}
                data-testid="button-toggle-link-form"
              >
                <Plus className="w-4 h-4 mr-1" />
                Link
              </Button>
            </div>

            {showLinkForm && (
              <LinkToEntityDialog 
                programRunId={programRunId} 
                onSuccess={() => setShowLinkForm(false)} 
              />
            )}

            {runDetail.links && runDetail.links.length > 0 ? (
              <div className="space-y-2 mt-2">
                {runDetail.links.map((link) => {
                  const entityLink = getEntityLink(link.entityType, link.entityId);
                  return (
                    <div 
                      key={link.id} 
                      className="flex items-center justify-between p-2 border rounded-md bg-background"
                      data-testid={`link-${link.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {getEntityTypeLabel(link.entityType)}
                        </Badge>
                        <span className="font-mono text-sm">{link.entityLabel || link.entityId}</span>
                        {entityLink && (
                          <Link href={entityLink} className="text-primary hover:underline">
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteLink.mutate(link.id)}
                        disabled={deleteLink.isPending}
                        data-testid={`button-unlink-${link.id}`}
                      >
                        <Unlink className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : !showLinkForm ? (
              <p className="text-sm text-muted-foreground py-2">
                No linked entities. Click "Link" to associate this run with an order or job.
              </p>
            ) : null}
          </div>

          <div>
            <h4 className="font-medium mb-2">Event Timeline</h4>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Elapsed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runDetail.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs">
                        {format(new Date(event.eventTimestamp), 'h:mm:ss a')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {event.eventType.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>{event.stepIndex ?? '-'}</TableCell>
                      <TableCell>{formatDuration(event.totalElapsedMinutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-muted-foreground">Run not found</div>
      )}
    </DialogContent>
  );
}

function DonnaObservationsPanel() {
  const { toast } = useToast();
  
  const { data: observationsData } = useQuery<{ count: number; observations: DonnaObservation[] }>({
    queryKey: ['/api/donna/process-observations/summary'],
    refetchInterval: 60000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/donna/process-observations/${id}/dismiss`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/donna/process-observations/summary'] });
      toast({ title: 'Observation dismissed', description: 'This observation will be hidden for 48 hours' });
    },
  });

  if (!observationsData?.observations?.length) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Lightbulb className="w-4 h-4" />
          Donna noticed something
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {observationsData.observations.map((obs) => (
          <div 
            key={obs.id} 
            className="flex items-start justify-between gap-2 text-sm p-2 rounded bg-white dark:bg-gray-900 border"
            data-testid={`donna-observation-${obs.id}`}
          >
            <div className="flex-1">
              <span className="font-medium text-amber-800 dark:text-amber-300">{obs.programName}:</span>{' '}
              <span className="text-muted-foreground">{obs.message}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => dismissMutation.mutate(obs.id)}
              disabled={dismissMutation.isPending}
              data-testid={`button-dismiss-observation-${obs.id}`}
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ProcessRuns() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery<ProcessRun[]>({
    queryKey: ['/api/integrations/process-runner/runs'],
    refetchInterval: 30000,
  });

  const handleExportCSV = () => {
    window.open('/api/integrations/process-runner/export/csv', '_blank');
  };

  const handleExportPDF = () => {
    window.open('/api/integrations/process-runner/export/pdf', '_blank');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Timer className="w-6 h-6" />
            Process Runs
          </h1>
          <p className="text-muted-foreground text-sm">
            View timed process runs from external timer applications (read-only)
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            disabled={runs.length === 0}
            data-testid="button-export-csv"
          >
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportPDF}
            disabled={runs.length === 0}
            data-testid="button-export-pdf"
          >
            <FileText className="w-4 h-4 mr-1" />
            Export PDF
          </Button>
        </div>
      </div>

      <DonnaObservationsPanel />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Process Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading process runs...</div>
          ) : runs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No process runs recorded yet. Timer events will appear here when received.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.programRunId} data-testid={`row-process-run-${run.programRunId}`}>
                    <TableCell className="font-medium">{run.programName}</TableCell>
                    <TableCell className="font-mono text-xs">{run.programRunId}</TableCell>
                    <TableCell><RunStatusBadge run={run} /></TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(run.startedAt), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>{formatDuration(run.totalElapsedMinutes)}</TableCell>
                    <TableCell>{run.lastStepIndex ?? '-'}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedRunId(run.programRunId)}
                            data-testid={`button-view-run-${run.programRunId}`}
                          >
                            <Eye className="w-4 h-4 mr-1" /> View
                          </Button>
                        </DialogTrigger>
                        <RunDetailDialog programRunId={run.programRunId} />
                      </Dialog>
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

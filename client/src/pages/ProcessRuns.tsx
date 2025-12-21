import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, Play, CheckCircle, Eye, Timer, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';

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

function RunDetailDialog({ programRunId }: { programRunId: string }) {
  const { data: runDetail, isLoading } = useQuery<ProcessRunDetail>({
    queryKey: ['/api/integrations/process-runner/runs', programRunId],
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

export default function ProcessRuns() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery<ProcessRun[]>({
    queryKey: ['/api/integrations/process-runner/runs'],
    refetchInterval: 30000,
  });

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
      </div>

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

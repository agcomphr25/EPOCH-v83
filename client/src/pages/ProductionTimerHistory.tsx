import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, History, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';

interface HistoryRun {
  id: string;
  programId: string;
  programName: string | null;
  instanceName: string | null;
  sku: string | null;
  status: 'completed' | 'stopped';
  startedAt: string;
  completedAt: string | null;
  totalElapsedSeconds: number;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default function ProductionTimerHistory() {
  const { data: runs, isLoading, error } = useQuery<HistoryRun[]>({
    queryKey: ['/api/production/timers/runs/history'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-destructive">
        Failed to load timer history
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/app/production/stations">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Timer Station
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <History className="w-8 h-8" />
              Timer Run History
            </h1>
            <p className="text-muted-foreground mt-1">
              Completed and stopped production timer runs
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {runs?.length || 0} runs
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Completed Timer Runs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!runs || runs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No completed timer runs yet</p>
              <p className="text-sm mt-2">
                Completed runs will appear here for auditing and review
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program</TableHead>
                  <TableHead>Instance Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Total Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      {run.programName || 'Unknown Program'}
                    </TableCell>
                    <TableCell>{run.instanceName || '-'}</TableCell>
                    <TableCell>
                      {run.sku ? (
                        <code className="bg-muted px-2 py-1 rounded text-sm">
                          {run.sku}
                        </code>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(run.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.completedAt ? formatDateTime(run.completedAt) : '-'}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono font-semibold">
                        {formatDuration(run.totalElapsedSeconds)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {run.status === 'completed' ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="w-3 h-3 mr-1" />
                          Stopped
                        </Badge>
                      )}
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

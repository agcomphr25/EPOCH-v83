import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Loader2, Clock, History, ArrowLeft, CheckCircle2, XCircle, Pencil, Trash2 } from 'lucide-react';

interface HistoryRun {
  id: string;
  programId: string;
  programName: string | null;
  instanceName: string | null;
  sku: string | null;
  serialNumber: string | null;
  mandrelNumber: number | null;
  ovenNumber: number | null;
  ovenSlot: string | null;
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
  const { toast } = useToast();
  const [editingRun, setEditingRun] = useState<HistoryRun | null>(null);
  const [deletingRun, setDeletingRun] = useState<HistoryRun | null>(null);
  const [editForm, setEditForm] = useState({
    instanceName: '',
    sku: '',
    serialNumber: '',
    mandrelNumber: '',
    ovenNumber: '',
    ovenSlot: '',
  });

  const { data: runs, isLoading, error } = useQuery<HistoryRun[]>({
    queryKey: ['/api/production/timers/runs/history'],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: typeof editForm }) => {
      return apiRequest(`/api/production/timers/runs/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          instanceName: data.updates.instanceName || null,
          sku: data.updates.sku || null,
          serialNumber: data.updates.serialNumber || null,
          mandrelNumber: data.updates.mandrelNumber ? parseInt(data.updates.mandrelNumber) : null,
          ovenNumber: data.updates.ovenNumber ? parseInt(data.updates.ovenNumber) : null,
          ovenSlot: data.updates.ovenSlot || null,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs/history'] });
      toast({ title: 'Run updated successfully' });
      setEditingRun(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update run', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/production/timers/runs/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/runs/history'] });
      toast({ title: 'Run deleted successfully' });
      setDeletingRun(null);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete run', description: error.message, variant: 'destructive' });
    },
  });

  const handleEditClick = (run: HistoryRun) => {
    setEditForm({
      instanceName: run.instanceName || '',
      sku: run.sku || '',
      serialNumber: run.serialNumber || '',
      mandrelNumber: run.mandrelNumber?.toString() || '',
      ovenNumber: run.ovenNumber?.toString() || '',
      ovenSlot: run.ovenSlot || '',
    });
    setEditingRun(run);
  };

  const handleSaveEdit = () => {
    if (editingRun) {
      updateMutation.mutate({ id: editingRun.id, updates: editForm });
    }
  };

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
                  <TableHead>Serial #</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Total Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell>{run.serialNumber || '-'}</TableCell>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditClick(run)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeletingRun(run)}
                        >
                          <Trash2 className="w-4 h-4" />
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

      <Dialog open={!!editingRun} onOpenChange={(open) => !open && setEditingRun(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Timer Run</DialogTitle>
            <DialogDescription>
              Update the details of this completed timer run.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="instanceName">Instance Name</Label>
              <Input
                id="instanceName"
                value={editForm.instanceName}
                onChange={(e) => setEditForm({ ...editForm, instanceName: e.target.value })}
                placeholder="e.g., Batch #1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={editForm.sku}
                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                placeholder="e.g., PROD-001"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="serialNumber">Serial Number</Label>
              <Input
                id="serialNumber"
                value={editForm.serialNumber}
                onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })}
                placeholder="e.g., SN-12345"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mandrelNumber">Mandrel #</Label>
                <Input
                  id="mandrelNumber"
                  type="number"
                  value={editForm.mandrelNumber}
                  onChange={(e) => setEditForm({ ...editForm, mandrelNumber: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ovenNumber">Oven #</Label>
                <Input
                  id="ovenNumber"
                  type="number"
                  value={editForm.ovenNumber}
                  onChange={(e) => setEditForm({ ...editForm, ovenNumber: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ovenSlot">Oven Slot</Label>
                <Input
                  id="ovenSlot"
                  value={editForm.ovenSlot}
                  onChange={(e) => setEditForm({ ...editForm, ovenSlot: e.target.value })}
                  placeholder="e.g., A1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRun(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingRun} onOpenChange={(open) => !open && setDeletingRun(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Timer Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the timer run record for "{deletingRun?.programName}" 
              {deletingRun?.instanceName && ` (${deletingRun.instanceName})`}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingRun && deleteMutation.mutate(deletingRun.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

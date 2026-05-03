import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
  Clipboard,
  ExternalLink,
} from 'lucide-react';

type ExecutionStatus = 'pending' | 'success' | 'failure' | 'noted';

type ProteusExecution = {
  id: string;
  promptId: string;
  promptTitle: string;
  status: ExecutionStatus;
  executedByDisplayName: string;
  executedAt: string;
  notes: string | null;
};

type StatusConfig = {
  icon: React.ElementType;
  color: string;
  label: string;
  badge: string;
};

const STATUS_CONFIG: Record<ExecutionStatus, StatusConfig> = {
  pending: { icon: Clock, color: 'text-yellow-600', label: 'Pending', badge: 'bg-yellow-100 text-yellow-800' },
  success: { icon: CheckCircle2, color: 'text-green-600', label: 'Success', badge: 'bg-green-100 text-green-800' },
  failure: { icon: XCircle, color: 'text-red-600', label: 'Failure', badge: 'bg-red-100 text-red-800' },
  noted: { icon: Clipboard, color: 'text-blue-600', label: 'Noted', badge: 'bg-blue-100 text-blue-800' },
};

export default function ProteusExecutionHistory() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data: executions = [], isLoading } = useQuery<ProteusExecution[]>({
    queryKey: ['/api/proteus-labs/executions', { status: statusFilter, offset: page * PAGE_SIZE }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/proteus-labs/executions?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load executions');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ExecutionStatus }) => {
      const res = await fetch(`/api/proteus-labs/executions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/executions'] });
      toast({ title: 'Status updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/proteus-labs')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-900">Execution History</h1>
          </div>
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => { setStatusFilter(v); setPage(0); }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failure">Failure</SelectItem>
            <SelectItem value="noted">Noted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Executions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : executions.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No executions found.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {executions.map((ex) => {
                const conf = STATUS_CONFIG[ex.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = conf.icon;
                return (
                  <div key={ex.id} className="py-3 flex items-start gap-4">
                    <StatusIcon className={`h-4 w-4 mt-1 flex-shrink-0 ${conf.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="text-sm font-semibold text-indigo-700 hover:underline truncate"
                          onClick={() => setLocation(`/proteus-labs/${ex.promptId}`)}
                        >
                          {ex.promptTitle}
                        </button>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${conf.badge}`}>
                          {conf.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                        <span>{ex.executedByDisplayName}</span>
                        <span>{new Date(ex.executedAt).toLocaleString()}</span>
                        {ex.notes && <span className="italic">"{ex.notes}"</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {ex.status === 'pending' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-600"
                            onClick={() => updateMutation.mutate({ id: ex.id, status: 'success' })}
                            disabled={updateMutation.isPending}
                          >
                            Success
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600"
                            onClick={() => updateMutation.mutate({ id: ex.id, status: 'failure' })}
                            disabled={updateMutation.isPending}
                          >
                            Failure
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => setLocation(`/proteus-labs/${ex.promptId}`)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </Button>
        <span className="text-sm text-gray-500">Page {page + 1}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={executions.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

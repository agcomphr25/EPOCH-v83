import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Copy,
  Edit,
  Trash2,
  Play,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
  Variable,
  Clipboard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

type PromptVariable = {
  id: string;
  name: string;
  label: string;
  defaultValue: string | null;
  required: boolean | null;
};

type ProteusPromptFull = {
  id: string;
  title: string;
  category: string;
  body: string;
  description: string | null;
  usageCount: number | null;
  createdByDisplayName: string;
  tags: string[];
  variables: PromptVariable[];
};

type ExecutionStatus = 'pending' | 'success' | 'failure' | 'noted';

type ProteusExecution = {
  id: string;
  promptId: string;
  status: ExecutionStatus;
  executedByDisplayName: string;
  executedAt: string;
  notes: string | null;
  result: { id: string; output: string } | null;
};

type StatusConfig = {
  icon: React.ElementType;
  color: string;
  label: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  small: 'bg-green-100 text-green-800',
  feature: 'bg-blue-100 text-blue-800',
  large_architecture: 'bg-purple-100 text-purple-800',
  audit: 'bg-yellow-100 text-yellow-800',
  emergency: 'bg-red-100 text-red-800',
  deployment: 'bg-orange-100 text-orange-800',
  skill_builder: 'bg-indigo-100 text-indigo-800',
};

const STATUS_CONFIG: Record<ExecutionStatus, StatusConfig> = {
  pending: { icon: Clock, color: 'text-yellow-600', label: 'Pending' },
  success: { icon: CheckCircle2, color: 'text-green-600', label: 'Success' },
  failure: { icon: XCircle, color: 'text-red-600', label: 'Failure' },
  noted: { icon: Clipboard, color: 'text-blue-600', label: 'Noted' },
};

function substituteVariables(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] || `{{${name}}}`);
}

function formatCategory(cat: string) {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProteusPromptDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/proteus-labs/:id');
  const { toast } = useToast();
  const promptId = params?.id;

  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [resolvedOutput, setResolvedOutput] = useState('');
  const [activeExecution, setActiveExecution] = useState<string | null>(null);
  const [pasteResultOpen, setPasteResultOpen] = useState(false);
  const [pastedOutput, setPastedOutput] = useState('');
  const [implementationNotes, setImplementationNotes] = useState('');
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: prompt, isLoading } = useQuery<ProteusPromptFull>({
    queryKey: ['/api/proteus-labs/prompts', promptId],
    queryFn: async () => {
      const res = await fetch(`/api/proteus-labs/prompts/${promptId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load prompt');
      return res.json();
    },
    enabled: !!promptId,
  });

  const { data: executions = [] } = useQuery<ProteusExecution[]>({
    queryKey: ['/api/proteus-labs/prompts', promptId, 'executions'],
    queryFn: async () => {
      const res = await fetch(`/api/proteus-labs/prompts/${promptId}/executions?limit=10`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load executions');
      return res.json();
    },
    enabled: !!promptId,
  });

  const recordExecutionMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await fetch('/api/proteus-labs/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to record execution');
      return res.json() as Promise<ProteusExecution>;
    },
    onSuccess: (data) => {
      setActiveExecution(data.id);
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts', promptId, 'executions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/executions'] });
    },
  });

  const updateExecutionMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status?: string; notes?: string }) => {
      const res = await fetch(`/api/proteus-labs/executions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error('Failed to update execution');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts', promptId, 'executions'] });
    },
  });

  const saveResultMutation = useMutation({
    mutationFn: async (data: { executionId: string; output: string; implementationNotes: string | null }) => {
      const res = await fetch('/api/proteus-labs/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save result');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Result saved', description: 'Output has been stored.' });
      setPasteResultOpen(false);
      setPastedOutput('');
      setImplementationNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts', promptId, 'executions'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proteus-labs/prompts/${promptId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete prompt');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/proteus-labs/prompts'] });
      toast({ title: 'Prompt deleted' });
      setLocation('/proteus-labs');
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleGenerate = () => {
    if (!prompt) return;

    const missingRequired = (prompt.variables || []).filter(
      (v) => v.required && !(variableValues[v.name] ?? v.defaultValue ?? '').trim()
    );
    if (missingRequired.length > 0) {
      toast({
        title: 'Required fields missing',
        description: `Please fill in: ${missingRequired.map((v) => v.label || v.name).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    const values: Record<string, string> = {};
    for (const v of (prompt.variables || [])) {
      values[v.name] = variableValues[v.name] ?? v.defaultValue ?? '';
    }

    const resolved = substituteVariables(prompt.body, values);
    setResolvedOutput(resolved);
    setOutputModalOpen(true);
  };

  const handleCopy = async () => {
    if (!prompt) return;

    const missingRequired = (prompt.variables || []).filter(
      (v) => v.required && !(variableValues[v.name] ?? v.defaultValue ?? '').trim()
    );
    if (missingRequired.length > 0) {
      toast({
        title: 'Required fields missing',
        description: `Please fill in: ${missingRequired.map((v) => v.label || v.name).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    await navigator.clipboard.writeText(resolvedOutput);
    toast({ title: 'Copied to clipboard!' });

    const values: Record<string, string> = {};
    for (const v of (prompt.variables || [])) {
      values[v.name] = variableValues[v.name] ?? v.defaultValue ?? '';
    }

    recordExecutionMutation.mutate({
      promptId: prompt.id,
      promptTitle: prompt.title,
      resolvedBody: resolvedOutput,
      variableValues: values,
      status: 'pending',
    });
  };

  const handlePasteResult = () => {
    if (!activeExecution) {
      toast({
        title: 'Copy the prompt first',
        description: 'Generate and copy the prompt to record an execution.',
        variant: 'destructive',
      });
      return;
    }
    setPasteResultOpen(true);
  };

  const handleSaveResult = () => {
    if (!pastedOutput.trim()) {
      toast({ title: 'Output required', variant: 'destructive' });
      return;
    }
    if (!activeExecution) return;
    saveResultMutation.mutate({
      executionId: activeExecution,
      output: pastedOutput,
      implementationNotes: implementationNotes || null,
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4 text-center">
        <p className="text-gray-500">Prompt not found.</p>
        <Button className="mt-4" onClick={() => setLocation('/proteus-labs')}>
          Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/proteus-labs')} className="mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{prompt.title}</h1>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[prompt.category] || 'bg-gray-100 text-gray-700'}`}
              >
                {formatCategory(prompt.category)}
              </span>
            </div>
            {prompt.description && (
              <p className="text-sm text-gray-500 mt-1">{prompt.description}</p>
            )}
            {prompt.tags.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {prompt.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              {prompt.usageCount ?? 0} uses · Created by {prompt.createdByDisplayName}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/proteus-labs/${promptId}/edit`)}
            className="gap-1"
          >
            <Edit className="h-3 w-3" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-600"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-600">Prompt Body</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-md border">
                {prompt.body}
              </pre>
            </CardContent>
          </Card>

          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleGenerate} className="gap-2">
              <Play className="h-4 w-4" />
              Generate Output
            </Button>
            <Button
              variant="outline"
              onClick={handlePasteResult}
              className="gap-2"
              disabled={!activeExecution}
            >
              <Clipboard className="h-4 w-4" />
              Paste Result
              {!activeExecution && <span className="text-xs text-gray-400">(generate first)</span>}
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-600">
                  Execution History ({executions.length})
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHistoryExpanded(!historyExpanded)}
                  className="h-6 px-2"
                >
                  {historyExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
              </div>
            </CardHeader>
            {(historyExpanded || executions.length <= 3) && (
              <CardContent>
                {executions.length === 0 ? (
                  <p className="text-sm text-gray-400">No executions recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    {executions.map((ex) => {
                      const conf = STATUS_CONFIG[ex.status] ?? STATUS_CONFIG.pending;
                      const StatusIcon = conf.icon;
                      return (
                        <div key={ex.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-md">
                          <StatusIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${conf.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-medium text-gray-700">{conf.label}</span>
                              <span className="text-xs text-gray-400">{ex.executedByDisplayName}</span>
                              <span className="text-xs text-gray-400">
                                {new Date(ex.executedAt).toLocaleString()}
                              </span>
                            </div>
                            {ex.notes && <p className="text-xs text-gray-500 mt-1">{ex.notes}</p>}
                            {ex.result && (
                              <p className="text-xs text-green-600 mt-1">Result stored</p>
                            )}
                            {ex.id === activeExecution && (
                              <div className="flex gap-2 mt-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs text-green-600"
                                  onClick={() =>
                                    updateExecutionMutation.mutate({ id: ex.id, status: 'success' })
                                  }
                                >
                                  Mark Success
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-xs text-red-600"
                                  onClick={() =>
                                    updateExecutionMutation.mutate({ id: ex.id, status: 'failure' })
                                  }
                                >
                                  Mark Failure
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {prompt.variables.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Variable className="h-4 w-4 text-indigo-600" />
                  Fill Variables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {prompt.variables.map((v) => (
                  <div key={v.name} className="space-y-1">
                    <Label className="text-xs font-medium">
                      {v.label}
                      {v.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder={v.defaultValue || `Enter ${v.label}...`}
                      value={variableValues[v.name] ?? v.defaultValue ?? ''}
                      onChange={(e) =>
                        setVariableValues((prev) => ({ ...prev, [v.name]: e.target.value }))
                      }
                    />
                    <p className="text-xs text-gray-400 font-mono">{`{{${v.name}}}`}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Button className="w-full gap-2" onClick={handleGenerate}>
            <Play className="h-4 w-4" />
            Generate & Copy
          </Button>
        </div>
      </div>

      {/* Output modal */}
      <Dialog open={outputModalOpen} onOpenChange={setOutputModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-indigo-600" />
              Generated Prompt — Ready to Copy
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-gray-50 p-4 rounded-md border">
              {resolvedOutput}
            </pre>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOutputModalOpen(false)}>Close</Button>
            <Button
              onClick={handleCopy}
              className="gap-2"
              disabled={recordExecutionMutation.isPending}
            >
              <Copy className="h-4 w-4" />
              {recordExecutionMutation.isPending ? 'Recording...' : 'Copy to Clipboard'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste result modal */}
      <Dialog open={pasteResultOpen} onOpenChange={setPasteResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Paste Replit / LLM Output</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Output *</Label>
              <Textarea
                className="min-h-[180px] font-mono text-sm"
                placeholder="Paste the AI/Replit response here..."
                value={pastedOutput}
                onChange={(e) => setPastedOutput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Implementation Notes</Label>
              <Textarea
                className="min-h-[80px] text-sm"
                placeholder="What was actually done, any deviations, etc."
                value={implementationNotes}
                onChange={(e) => setImplementationNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPasteResultOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveResult} disabled={saveResultMutation.isPending}>
              {saveResultMutation.isPending ? 'Saving...' : 'Save Result'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Prompt</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{prompt.title}</strong>? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

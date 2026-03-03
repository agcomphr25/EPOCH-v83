import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, Clock, Timer, ArrowLeft, X } from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ProgramStep {
  id?: string;
  stepName: string;
  durationSeconds: number;
  stepIndex: number;
}

type ProgramLogType = 'none' | 'oven_cure' | 'vacuum_leak_test' | 'final_inspection';

const LOG_TYPE_LABELS: Record<ProgramLogType, string> = {
  none: 'None (no auto-log)',
  oven_cure: 'Oven Cure',
  vacuum_leak_test: 'Vacuum Leak Test',
  final_inspection: 'Final Inspection',
};

interface TimerProgram {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  logType: ProgramLogType;
  steps: ProgramStep[];
  createdAt: string;
  updatedAt: string;
}

interface StepInput {
  stepName: string;
  durationMinutes: number;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export default function TimerProgramsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<TimerProgram | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [programType, setProgramType] = useState<'single' | 'multi'>('single');
  const [logType, setLogType] = useState<ProgramLogType>('none');
  const [steps, setSteps] = useState<StepInput[]>([{ stepName: 'Step 1', durationMinutes: 5 }]);

  const { data: programs, isLoading } = useQuery<TimerProgram[]>({
    queryKey: ['/api/production/timers/programs'],
    queryFn: async () => {
      const res = await fetch('/api/production/timers/programs?includeInactive=true');
      if (!res.ok) throw new Error('Failed to fetch programs');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/production/timers/programs', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/programs'] });
      toast({ title: 'Program created successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create program', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/production/timers/programs/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/programs'] });
      toast({ title: 'Program updated successfully' });
      closeDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update program', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/production/timers/programs/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/production/timers/programs'] });
      toast({ title: 'Program deactivated' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to deactivate program', description: error.message, variant: 'destructive' });
    },
  });

  const openCreateDialog = () => {
    setEditingProgram(null);
    setName('');
    setDescription('');
    setProgramType('single');
    setLogType('none');
    setSteps([{ stepName: 'Step 1', durationMinutes: 5 }]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (program: TimerProgram) => {
    setEditingProgram(program);
    setName(program.name);
    setDescription(program.description || '');
    setProgramType(program.steps.length > 1 ? 'multi' : 'single');
    setLogType(program.logType || 'none');
    setSteps(
      program.steps.map((s) => ({
        stepName: s.stepName,
        durationMinutes: Math.round(s.durationSeconds / 60 * 10) / 10,
      }))
    );
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingProgram(null);
  };

  const handleProgramTypeChange = (type: 'single' | 'multi') => {
    setProgramType(type);
    if (type === 'single') {
      setSteps([{ stepName: 'Step 1', durationMinutes: steps[0]?.durationMinutes || 5 }]);
    } else if (steps.length < 2) {
      setSteps([
        { stepName: 'Step 1', durationMinutes: steps[0]?.durationMinutes || 5 },
        { stepName: 'Step 2', durationMinutes: 5 },
      ]);
    }
  };

  const addStep = () => {
    setSteps([...steps, { stepName: `Step ${steps.length + 1}`, durationMinutes: 5 }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 2) return;
    const newSteps = steps.filter((_, i) => i !== index);
    setSteps(newSteps.map((s, i) => ({ ...s, stepName: s.stepName.startsWith('Step ') ? `Step ${i + 1}` : s.stepName })));
  };

  const updateStep = (index: number, field: 'stepName' | 'durationMinutes', value: string | number) => {
    const newSteps = [...steps];
    if (field === 'durationMinutes') {
      newSteps[index] = { ...newSteps[index], [field]: Number(value) || 0 };
    } else {
      newSteps[index] = { ...newSteps[index], [field]: value as string };
    }
    setSteps(newSteps);
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: 'Program name is required', variant: 'destructive' });
      return;
    }

    const invalidSteps = steps.filter((s) => s.durationMinutes <= 0);
    if (invalidSteps.length > 0) {
      toast({ title: 'All step durations must be greater than 0', variant: 'destructive' });
      return;
    }

    if (programType === 'multi' && steps.length < 2) {
      toast({ title: 'Multi-step programs require at least 2 steps', variant: 'destructive' });
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      programType,
      logType,
      steps,
    };

    if (editingProgram) {
      updateMutation.mutate({ id: editingProgram.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activePrograms = programs?.filter((p) => p.isActive) || [];

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
              <Timer className="w-8 h-8" />
              Timer Programs
            </h1>
            <p className="text-muted-foreground mt-1">
              Create and manage timed production programs
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog} className="bg-green-600 hover:bg-green-700">
          <Plus className="w-4 h-4 mr-2" />
          Create Program
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Programs</CardTitle>
          <CardDescription>
            {activePrograms.length} program{activePrograms.length !== 1 ? 's' : ''} available for timer runs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activePrograms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Timer className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No timer programs yet</p>
              <p className="text-sm mt-2">Create your first program to start using Timer Station</p>
              <Button onClick={openCreateDialog} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create First Program
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Program Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Auto-Log</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Total Duration</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activePrograms.map((program) => {
                  const totalSeconds = program.steps.reduce((sum, s) => sum + s.durationSeconds, 0);
                  return (
                    <TableRow key={program.id}>
                      <TableCell className="font-medium">{program.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {program.description || '-'}
                      </TableCell>
                      <TableCell>
                        {program.logType && program.logType !== 'none' ? (
                          <Badge variant="secondary" className="text-xs">
                            {LOG_TYPE_LABELS[program.logType]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {program.steps.map((step, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {step.stepName}: {formatDuration(step.durationSeconds)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono font-semibold">
                          {formatDuration(totalSeconds)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(program)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm(`Deactivate "${program.name}"?`)) {
                                deleteMutation.mutate(program.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="w-5 h-5" />
              {editingProgram ? 'Edit Program' : 'Create Timer Program'}
            </DialogTitle>
            <DialogDescription>
              {editingProgram
                ? 'Update the program configuration'
                : 'Define a new timed production program'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Program Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Oven Cure Cycle"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Program Type *</Label>
              <Select value={programType} onValueChange={(v) => handleProgramTypeChange(v as 'single' | 'multi')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single-Step Program</SelectItem>
                  <SelectItem value="multi">Multi-Step Program</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>AS9100 Auto-Log Type</Label>
              <Select value={logType} onValueChange={(v) => setLogType(v as ProgramLogType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (no auto-log)</SelectItem>
                  <SelectItem value="oven_cure">Oven Cure</SelectItem>
                  <SelectItem value="vacuum_leak_test">Vacuum Leak Test</SelectItem>
                  <SelectItem value="final_inspection">Final Inspection</SelectItem>
                </SelectContent>
              </Select>
              {logType !== 'none' && (
                <p className="text-xs text-muted-foreground">
                  Starting a run will automatically create a {LOG_TYPE_LABELS[logType]} log entry. It will be stamped PASS when the run completes.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                {programType === 'multi' && (
                  <Button type="button" variant="outline" size="sm" onClick={addStep}>
                    <Plus className="w-3 h-3 mr-1" />
                    Add Step
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {steps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                    <div className="flex-1">
                      <Input
                        value={step.stepName}
                        onChange={(e) => updateStep(index, 'stepName', e.target.value)}
                        placeholder="Step name"
                        className="mb-2"
                      />
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0.1"
                          step="0.5"
                          value={step.durationMinutes}
                          onChange={(e) => updateStep(index, 'durationMinutes', e.target.value)}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">minutes</span>
                      </div>
                    </div>
                    {programType === 'multi' && steps.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeStep(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingProgram ? (
                'Update Program'
              ) : (
                'Create Program'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

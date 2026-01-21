import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  GripVertical,
  FileText,
  HelpCircle,
  CheckCircle,
  Clock,
  BookOpen
} from 'lucide-react';
import ContentLibrary from '../components/ContentLibrary';
import { trainingBuilderApi, QUERY_KEYS, ProgramTask } from '../lib/api';

interface TrainingModule {
  id: number;
  title: string;
  description?: string;
  category?: string;
  estimatedDuration?: number;
}

interface TrainingQuestion {
  id: number;
  moduleId: number;
  questionText: string;
  questionType: string;
}

interface ProgramFormData {
  title: string;
  department: string;
  role: string;
  description: string;
}

interface TaskItem {
  id?: number;
  tempId?: string;
  title: string;
  description: string;
  sortOrder: number;
  estimatedMinutes: number;
  type: 'task' | 'module' | 'quiz';
  sourceModuleId?: number;
  sourceQuestionId?: number;
}

export default function ProgramBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isNew = id === 'new';
  const programId = isNew ? null : parseInt(id || '0');

  const [formData, setFormData] = useState<ProgramFormData>({
    title: '',
    department: '',
    role: '',
    description: '',
  });

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [deletedTaskIds, setDeletedTaskIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: program, isLoading } = useQuery({
    queryKey: programId ? QUERY_KEYS.program(programId) : ['new-program'],
    queryFn: () => programId ? trainingBuilderApi.getProgram(programId) : null,
    enabled: !!programId,
  });

  const { data: existingTasks = [] } = useQuery<ProgramTask[]>({
    queryKey: ['/api/training/programs', programId, 'tasks'],
    queryFn: async () => {
      if (!programId) return [];
      const res = await fetch(`/api/training/programs/${programId}/tasks`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!programId,
  });

  useEffect(() => {
    if (program) {
      setFormData({
        title: program.title || '',
        department: program.department || '',
        role: program.role || '',
        description: program.description || '',
      });
    }
  }, [program]);

  useEffect(() => {
    if (existingTasks.length > 0) {
      setTasks(existingTasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        sortOrder: (t as any).sortOrder ?? t.order ?? 0,
        estimatedMinutes: t.estimatedMinutes || 15,
        type: 'task' as const,
      })));
    }
  }, [existingTasks]);

  const createProgramMutation = useMutation({
    mutationFn: trainingBuilderApi.createProgram,
    onSuccess: (newProgram) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.programs });
      toast({ title: 'Program created successfully' });
      navigate(`/training/programs/${newProgram.id}`);
    },
    onError: (error) => {
      toast({ title: 'Failed to create program', description: String(error), variant: 'destructive' });
    },
  });

  const updateProgramMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ProgramFormData> }) =>
      trainingBuilderApi.updateProgram(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.programs });
      if (programId) queryClient.invalidateQueries({ queryKey: QUERY_KEYS.program(programId) });
      toast({ title: 'Program updated successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update program', description: String(error), variant: 'destructive' });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: ({ programId, task }: { programId: number; task: any }) =>
      trainingBuilderApi.addTask(programId, task),
    onSuccess: () => {
      if (programId) {
        queryClient.invalidateQueries({ queryKey: ['/api/training/programs', programId, 'tasks'] });
      }
    },
  });

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: 'Program title is required', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      let targetProgramId = programId;

      if (isNew) {
        const newProgram = await createProgramMutation.mutateAsync({
          title: formData.title,
          department: formData.department,
          role: formData.role,
          description: formData.description,
        });
        targetProgramId = newProgram.id;
      } else if (programId) {
        await updateProgramMutation.mutateAsync({
          id: programId,
          data: formData,
        });
      }

      if (targetProgramId) {
        // Delete removed tasks
        for (const taskId of deletedTaskIds) {
          await fetch(`/api/training/programs/${targetProgramId}/tasks/${taskId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }
        setDeletedTaskIds([]);

        // Update existing tasks and create new ones
        for (const task of tasks) {
          if (task.id) {
            // Update existing task
            await fetch(`/api/training/programs/${targetProgramId}/tasks/${task.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                title: task.title,
                description: task.description,
                sortOrder: task.sortOrder,
                estimatedMinutes: task.estimatedMinutes,
              }),
            });
          } else {
            // Create new task
            await addTaskMutation.mutateAsync({
              programId: targetProgramId,
              task: {
                title: task.title,
                description: task.description,
                sortOrder: task.sortOrder,
                estimatedMinutes: task.estimatedMinutes,
              },
            });
          }
        }

        // Invalidate to refresh the task list
        queryClient.invalidateQueries({ queryKey: ['/api/training/programs', targetProgramId, 'tasks'] });
      }

      toast({ title: 'Program saved successfully' });
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddModule = (module: TrainingModule) => {
    const newTask: TaskItem = {
      tempId: `temp-${Date.now()}`,
      title: `Complete: ${module.title}`,
      description: module.description || '',
      sortOrder: tasks.length + 1,
      estimatedMinutes: module.estimatedDuration || 30,
      type: 'module',
      sourceModuleId: module.id,
    };
    setTasks([...tasks, newTask]);
    toast({ title: `Added module: ${module.title}` });
  };

  const handleAddQuestion = (question: TrainingQuestion) => {
    const newTask: TaskItem = {
      tempId: `temp-${Date.now()}`,
      title: `Quiz: ${question.questionText?.substring(0, 50) || 'Question'}...`,
      description: question.questionText || '',
      sortOrder: tasks.length + 1,
      estimatedMinutes: 5,
      type: 'quiz',
      sourceQuestionId: question.id,
    };
    setTasks([...tasks, newTask]);
    toast({ title: 'Added quiz question' });
  };

  const handleAddTopic = (topic: { id: string; title: string; description?: string }) => {
    const newTask: TaskItem = {
      tempId: `temp-${Date.now()}`,
      title: `Topic: ${topic.title}`,
      description: topic.description || '',
      sortOrder: tasks.length + 1,
      estimatedMinutes: 30,
      type: 'module',
    };
    setTasks([...tasks, newTask]);
    toast({ title: `Added topic: ${topic.title}` });
  };

  const handleAddManualTask = () => {
    const newTask: TaskItem = {
      tempId: `temp-${Date.now()}`,
      title: '',
      description: '',
      sortOrder: tasks.length + 1,
      estimatedMinutes: 15,
      type: 'task',
    };
    setTasks([...tasks, newTask]);
  };

  const handleRemoveTask = (index: number) => {
    const taskToRemove = tasks[index];
    if (taskToRemove.id) {
      setDeletedTaskIds(prev => [...prev, taskToRemove.id!]);
    }
    const newTasks = tasks.filter((_, i) => i !== index);
    setTasks(newTasks.map((t, i) => ({ ...t, sortOrder: i + 1 })));
  };

  const handleTaskChange = (index: number, field: keyof TaskItem, value: any) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    setTasks(newTasks);
  };

  const moveTask = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= tasks.length) return;
    const newTasks = [...tasks];
    const [removed] = newTasks.splice(fromIndex, 1);
    newTasks.splice(toIndex, 0, removed);
    setTasks(newTasks.map((t, i) => ({ ...t, sortOrder: i + 1 })));
  };

  const getTaskIcon = (type: TaskItem['type']) => {
    switch (type) {
      case 'module': return <BookOpen className="h-4 w-4 text-blue-500" />;
      case 'quiz': return <HelpCircle className="h-4 w-4 text-purple-500" />;
      default: return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const getTaskBadge = (type: TaskItem['type']) => {
    switch (type) {
      case 'module': return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Module</Badge>;
      case 'quiz': return <Badge variant="secondary" className="bg-purple-100 text-purple-700">Quiz</Badge>;
      default: return <Badge variant="secondary">Task</Badge>;
    }
  };

  if (isLoading && !isNew) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">Loading program...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/training/programs">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isNew ? 'Create Training Program' : 'Edit Training Program'}
            </h1>
            <p className="text-muted-foreground">
              {isNew ? 'Build a new training program from content library' : `Editing: ${formData.title || 'Untitled'}`}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? 'Saving...' : 'Save Program'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Program Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="title">Program Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., New Employee Onboarding"
                  />
                </div>
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) => setFormData({ ...formData, department: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Production">Production</SelectItem>
                      <SelectItem value="QC">Quality Control</SelectItem>
                      <SelectItem value="Engineering">Engineering</SelectItem>
                      <SelectItem value="Admin">Administration</SelectItem>
                      <SelectItem value="All">All Departments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="role">Target Role</Label>
                  <Input
                    id="role"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    placeholder="e.g., Technician, Inspector"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe the program objectives and content..."
                    rows={3}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Program Tasks ({tasks.length})
                </span>
                <Button size="sm" onClick={handleAddManualTask}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-2">No tasks added yet</p>
                  <p className="text-sm text-muted-foreground">
                    Add modules from the Content Library or create manual tasks
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task, index) => (
                    <div
                      key={task.id || task.tempId}
                      className="flex items-start gap-3 p-4 border rounded-lg bg-muted/30"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 cursor-grab"
                          onClick={() => moveTask(index, index - 1)}
                          disabled={index === 0}
                        >
                          <GripVertical className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-muted-foreground font-mono">
                          {task.sortOrder}
                        </span>
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          {getTaskIcon(task.type)}
                          {getTaskBadge(task.type)}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {task.estimatedMinutes} min
                          </div>
                        </div>

                        <Input
                          value={task.title}
                          onChange={(e) => handleTaskChange(index, 'title', e.target.value)}
                          placeholder="Task title"
                          className="font-medium"
                        />

                        <Textarea
                          value={task.description}
                          onChange={(e) => handleTaskChange(index, 'description', e.target.value)}
                          placeholder="Task description or instructions..."
                          rows={2}
                          className="text-sm"
                        />

                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Duration (min):</Label>
                          <Input
                            type="number"
                            value={task.estimatedMinutes}
                            onChange={(e) => handleTaskChange(index, 'estimatedMinutes', parseInt(e.target.value) || 0)}
                            className="w-20 h-8"
                          />
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveTask(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {tasks.length > 0 && (
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <span>Total tasks: {tasks.length}</span>
                  <span>
                    Estimated duration: {tasks.reduce((acc, t) => acc + t.estimatedMinutes, 0)} minutes
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ContentLibrary
            onAddModule={handleAddModule}
            onAddQuestion={handleAddQuestion}
            onAddTopic={handleAddTopic}
          />

          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-800 dark:text-blue-200">
                <FileText className="h-5 w-5" />
                4-Step Training Model
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-black/20 rounded">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">1</span>
                <span className="font-medium">Trainer Does / Trainer Explains</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-black/20 rounded">
                <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold">2</span>
                <span className="font-medium">Trainer Does / Trainee Explains</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-black/20 rounded">
                <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">3</span>
                <span className="font-medium">Trainee Does / Trainer Coaches</span>
              </div>
              <div className="flex items-center gap-2 p-2 bg-white/50 dark:bg-black/20 rounded">
                <span className="w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">4</span>
                <span className="font-medium">Trainee Does / Trainer Observes</span>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-200">
                <Link href="/training/work-instructions">
                  <Button variant="outline" size="sm" className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    Manage Work Instructions
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>• Click <Plus className="h-3 w-3 inline" /> on modules to add them as tasks</p>
              <p>• Drag tasks to reorder the training sequence</p>
              <p>• Add quiz questions for knowledge verification</p>
              <p>• Set estimated durations for each task</p>
              <p>• Create Work Instructions with critical points and safety notes</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

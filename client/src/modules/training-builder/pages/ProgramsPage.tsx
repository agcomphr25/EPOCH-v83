import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, 
  FileText, 
  Trash2, 
  Edit, 
  Users, 
  Clock,
  ArrowLeft,
  Building2,
  UserPlus,
  GraduationCap,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { trainingBuilderApi, QUERY_KEYS, TrainingProgram } from '../lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Employee {
  id: number;
  name: string | null;
  department: string | null;
  jobTitle: string | null;
}

interface Assignment {
  id: number;
  programId: number;
  employeeId: number;
  trainerId: number | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  trainee: Employee | null;
  trainer: Employee | null;
}

export default function ProgramsPage() {
  const { toast } = useToast();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<TrainingProgram | null>(null);
  const [selectedTrainee, setSelectedTrainee] = useState<string>('');
  const [selectedTrainer, setSelectedTrainer] = useState<string>('');

  const { data: programs = [], isLoading } = useQuery<TrainingProgram[]>({
    queryKey: QUERY_KEYS.programs,
    queryFn: trainingBuilderApi.getPrograms,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: assignments = [], refetch: refetchAssignments, isLoading: assignmentsLoading } = useQuery<Assignment[]>({
    queryKey: ['/api/training/programs', selectedProgram?.id, 'assignments'],
    queryFn: async () => {
      if (!selectedProgram?.id) return [];
      const res = await fetch(`/api/training/programs/${selectedProgram.id}/assignments`);
      if (!res.ok) throw new Error('Failed to fetch assignments');
      return res.json();
    },
    enabled: !!selectedProgram?.id && assignDialogOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: trainingBuilderApi.deleteProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.programs });
      toast({ title: 'Program deleted successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete program', description: String(error), variant: 'destructive' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (data: { programId: number; employeeId: number; trainerId?: number }) => {
      return apiRequest(`/api/training/programs/${data.programId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ employeeId: data.employeeId, trainerId: data.trainerId }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      refetchAssignments();
      setSelectedTrainee('');
      setSelectedTrainer('');
      toast({ title: 'Assignment created successfully' });
    },
    onError: (error) => {
      toast({ title: 'Failed to create assignment', description: String(error), variant: 'destructive' });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/assignments/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      refetchAssignments();
      toast({ title: 'Assignment removed' });
    },
    onError: (error) => {
      toast({ title: 'Failed to remove assignment', description: String(error), variant: 'destructive' });
    },
  });

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleOpenAssignDialog = (program: TrainingProgram) => {
    setSelectedProgram(program);
    setAssignDialogOpen(true);
  };

  const handleAssign = () => {
    if (!selectedProgram || !selectedTrainee) {
      toast({ title: 'Please select a trainee', variant: 'destructive' });
      return;
    }
    assignMutation.mutate({
      programId: selectedProgram.id,
      employeeId: parseInt(selectedTrainee),
      trainerId: selectedTrainer ? parseInt(selectedTrainer) : undefined,
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/training-control-center">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Training Programs</h1>
            <p className="text-muted-foreground">
              Create and manage structured training programs
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/training/work-instructions">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Work Instructions
            </Button>
          </Link>
          <Link href="/training/programs/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Program
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">Loading programs...</div>
      ) : programs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No training programs yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first training program to get started with structured employee training.
            </p>
            <Link href="/training/programs/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create First Program
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <Card key={program.id} className="group hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle className="text-lg line-clamp-1">{program.title}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {program.description || 'No description provided'}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/training/programs/${program.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Link>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Program</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{program.title}"? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(program.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2 mb-3">
                  {program.department && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      {program.department}
                    </Badge>
                  )}
                  {program.role && (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {program.role}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {program.tasks?.length || 0} tasks
                  </span>
                  {program.createdAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {new Date(program.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t flex gap-2">
                  <Link href={`/training/programs/${program.id}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </Link>
                  <Button 
                    variant="default" 
                    className="flex-1"
                    onClick={() => handleOpenAssignDialog(program)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Assignment Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Assign Trainees & Trainers
            </DialogTitle>
            <DialogDescription>
              {selectedProgram?.title} - Assign employees to this training program
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Add new assignment */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Trainee (Required)</Label>
                <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trainee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.name || 'Unknown Employee'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Trainer (Optional)</Label>
                <Select value={selectedTrainer || "none"} onValueChange={(val) => setSelectedTrainer(val === "none" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select trainer..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No trainer assigned</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id.toString()}>
                        {emp.name || 'Unknown Employee'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleAssign} disabled={!selectedTrainee || assignMutation.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              {assignMutation.isPending ? 'Assigning...' : 'Add Assignment'}
            </Button>

            <Separator />

            {/* Current assignments */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">Current Assignments</Label>
              <ScrollArea className="h-[200px] border rounded-lg">
                {assignmentsLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Loading assignments...
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No trainees assigned yet
                  </div>
                ) : (
                  <div className="divide-y">
                    {assignments.map((assignment) => (
                      <div key={assignment.id} className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              <Users className="h-4 w-4 text-blue-500" />
                              {assignment.trainee?.name || 'Unknown Employee'}
                              <Badge variant={assignment.status === 'completed' ? 'default' : 'secondary'}>
                                {assignment.status}
                              </Badge>
                            </div>
                            {assignment.trainer && (
                              <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <GraduationCap className="h-3 w-3" />
                                Trainer: {assignment.trainer.name || 'Unknown Employee'}
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => deleteAssignmentMutation.mutate(assignment.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

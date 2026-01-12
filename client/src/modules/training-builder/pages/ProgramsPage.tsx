import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  FileText, 
  Trash2, 
  Edit, 
  Users, 
  Clock,
  ArrowLeft,
  Building2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
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

export default function ProgramsPage() {
  const { toast } = useToast();

  const { data: programs = [], isLoading } = useQuery<TrainingProgram[]>({
    queryKey: QUERY_KEYS.programs,
    queryFn: trainingBuilderApi.getPrograms,
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

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
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
                <div className="mt-3 pt-3 border-t">
                  <Link href={`/training/programs/${program.id}`}>
                    <Button variant="outline" className="w-full">
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Program
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

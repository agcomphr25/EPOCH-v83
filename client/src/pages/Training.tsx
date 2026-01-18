import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { GraduationCap, Clock, FileText, Award, Plus } from 'lucide-react';

export default function Training() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newModule, setNewModule] = useState({
    title: '',
    description: '',
    estimatedMinutes: 30,
    passingScore: 80,
  });

  const { data: modules, isLoading } = useQuery({
    queryKey: ['/api/training/modules'],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/training/modules', {
        method: 'POST',
        body: JSON.stringify(newModule),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      setCreateOpen(false);
      setNewModule({ title: '', description: '', estimatedMinutes: 30, passingScore: 80 });
      toast({ title: 'Module Created', description: 'Training module has been created successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Training Modules</h2>
            <p className="text-muted-foreground">Employee training and certification programs</p>
          </div>
        </div>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading training modules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Training Modules
          </h2>
          <p className="text-muted-foreground">Employee training and certification programs</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Module
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.isArray(modules) &&
          modules.map((module: any) => (
            <Card
              key={module.id}
              className="hover:shadow-lg transition-shadow"
              data-testid={`card-training-module-${module.id}`}
            >
              <CardHeader>
                <CardTitle className="flex items-start gap-2">
                  <FileText className="h-5 w-5 text-primary mt-1" />
                  <span>{module.title}</span>
                </CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      Estimated Time: {module.estimatedMinutes || 30} minutes
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Award className="h-4 w-4" />
                    <span>Passing Score: {module.passingScore || 80}%</span>
                  </div>

                  <Link href={`/training/${module.id}`}>
                    <Button
                      className="w-full"
                      data-testid={`button-start-training-${module.id}`}
                    >
                      Start Training
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>

      {(!modules || (Array.isArray(modules) && modules.length === 0)) && (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="h-16 w-16 text-muted-foreground opacity-50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Training Modules Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create training modules for employee certification programs
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Module
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Training Module</DialogTitle>
            <DialogDescription>
              Create a new training module with quizzes for employee certification
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Module Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g., Workplace Safety Fundamentals"
                value={newModule.title}
                onChange={(e) => setNewModule({ ...newModule, title: e.target.value })}
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                placeholder="Brief description of what this training covers..."
                value={newModule.description}
                onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estimated Duration (minutes)</Label>
                <Input
                  type="number"
                  value={newModule.estimatedMinutes}
                  onChange={(e) => setNewModule({ ...newModule, estimatedMinutes: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div>
                <Label>Passing Score (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={newModule.passingScore}
                  onChange={(e) => setNewModule({ ...newModule, passingScore: parseInt(e.target.value) || 80 })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newModule.title || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

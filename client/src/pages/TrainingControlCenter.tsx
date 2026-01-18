import { useState } from 'react';
import { Link } from 'wouter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  GraduationCap, 
  LayoutGrid, 
  Settings, 
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  Wrench,
  UserCheck,
  BookOpen,
  Plus,
  FileText,
  Trash2,
  Edit,
  Target
} from 'lucide-react';

import Training from './Training';
import TrainingMatrixView from './TrainingMatrixView';
import TrainingManagement from './TrainingManagement';
import TrainingMatrixManage from './TrainingMatrixManage';
import TrainTheTrainer from './TrainTheTrainer';
import TrainingContentLibrary from './TrainingContentLibrary';

interface FacilityTopic {
  id: number;
  code: string;
  title: string;
  overview: string | null;
  contentHtml: string | null;
  estimatedMinutes: number;
  isActive: boolean;
}

interface TrainingStats {
  totalModules: number;
  activeEmployees: number;
  completedThisMonth: number;
  pendingAssignments: number;
  overdueCount: number;
}

export default function TrainingControlCenter() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('modules');
  const [createModuleOpen, setCreateModuleOpen] = useState(false);
  const [newModule, setNewModule] = useState({
    code: '',
    title: '',
    overview: '',
    contentHtml: '',
    estimatedMinutes: 30,
  });
  const [criticalPoints, setCriticalPoints] = useState<{ label: string; detail: string; severity: string }[]>([]);

  const { data: stats } = useQuery<TrainingStats>({
    queryKey: ['/api/training/stats'],
    refetchInterval: 60000,
  });

  const { data: facilityTopics = [] } = useQuery<FacilityTopic[]>({
    queryKey: ['/api/training/facility-topics'],
  });

  const createModuleMutation = useMutation({
    mutationFn: async () => {
      const moduleRes = await apiRequest('/api/training/facility-topics', {
        method: 'POST',
        body: JSON.stringify({
          code: newModule.code.toUpperCase(),
          title: newModule.title,
          overview: newModule.overview,
          contentHtml: newModule.contentHtml,
          estimatedMinutes: newModule.estimatedMinutes,
          isActive: true,
        }),
      });
      return moduleRes;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/facility-topics'] });
      setCreateModuleOpen(false);
      setNewModule({ code: '', title: '', overview: '', contentHtml: '', estimatedMinutes: 30 });
      setCriticalPoints([]);
      toast({ title: 'Training Module Created', description: 'The module is now available for training sessions.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const addCriticalPoint = () => {
    setCriticalPoints([...criticalPoints, { label: '', detail: '', severity: 'major' }]);
  };

  const removeCriticalPoint = (index: number) => {
    setCriticalPoints(criticalPoints.filter((_, i) => i !== index));
  };

  const updateCriticalPoint = (index: number, field: string, value: string) => {
    const updated = [...criticalPoints];
    updated[index] = { ...updated[index], [field]: value };
    setCriticalPoints(updated);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <GraduationCap className="h-8 w-8 text-primary" />
            Training Control Center
          </h1>
          <p className="text-muted-foreground">
            Unified training management: modules, matrix, and assignments
          </p>
        </div>
        <Link href="/training/programs">
          <Button>
            <Wrench className="h-4 w-4 mr-2" />
            Program Builder
          </Button>
        </Link>
      </div>

      <Card className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30 border-none">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.totalModules || 0) > 0 ? 'bg-blue-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <GraduationCap className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Modules</div>
                  <div className="text-xs text-muted-foreground">{stats?.totalModules || 0} available</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.activeEmployees || 0) > 0 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <Users className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Employees</div>
                  <div className="text-xs text-muted-foreground">{stats?.activeEmployees || 0} active</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.completedThisMonth || 0) > 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Completed</div>
                  <div className="text-xs text-muted-foreground">{stats?.completedThisMonth || 0} this month</div>
                </div>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${(stats?.overdueCount || 0) > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">Overdue</div>
                  <div className="text-xs text-muted-foreground">{stats?.overdueCount || 0} items</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="modules" className="flex items-center gap-2" data-testid="tab-modules">
            <GraduationCap className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="facility-topics" className="flex items-center gap-2" data-testid="tab-facility-topics">
            <Target className="h-4 w-4" />
            Training Modules
          </TabsTrigger>
          <TabsTrigger value="library" className="flex items-center gap-2" data-testid="tab-library">
            <BookOpen className="h-4 w-4" />
            Content Library
          </TabsTrigger>
          <TabsTrigger value="matrix" className="flex items-center gap-2" data-testid="tab-matrix">
            <LayoutGrid className="h-4 w-4" />
            Matrix
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-2" data-testid="tab-assignments">
            <Users className="h-4 w-4" />
            Assignments
          </TabsTrigger>
          <TabsTrigger value="trainer" className="flex items-center gap-2" data-testid="tab-trainer">
            <UserCheck className="h-4 w-4" />
            Train-the-Trainer
          </TabsTrigger>
          <TabsTrigger value="management" className="flex items-center gap-2" data-testid="tab-management">
            <Settings className="h-4 w-4" />
            Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="space-y-4">
          <Training />
        </TabsContent>

        <TabsContent value="facility-topics" className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold">Training Modules</h2>
              <p className="text-muted-foreground">Create and manage training modules for the Trainer Dashboard</p>
            </div>
            <Button onClick={() => setCreateModuleOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Module
            </Button>
          </div>

          {facilityTopics.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No Training Modules Yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create training modules to use in the Trainer Dashboard for conducting training sessions.
                </p>
                <Button onClick={() => setCreateModuleOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Module
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {facilityTopics.map((topic) => (
                <Card key={topic.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Badge variant="outline" className="mb-2">{topic.code}</Badge>
                        <CardTitle className="text-lg">{topic.title}</CardTitle>
                      </div>
                      <Badge variant={topic.isActive ? 'default' : 'secondary'}>
                        {topic.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {topic.overview || 'No overview provided'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {topic.estimatedMinutes} minutes
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="library" className="space-y-4">
          <TrainingContentLibrary />
        </TabsContent>

        <TabsContent value="matrix" className="space-y-4">
          <TrainingMatrixView />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <TrainingMatrixManage />
        </TabsContent>


        <TabsContent value="trainer" className="space-y-4">
          <TrainTheTrainer />
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <TrainingManagement />
        </TabsContent>
      </Tabs>

      {/* Create Training Module Dialog */}
      <Dialog open={createModuleOpen} onOpenChange={setCreateModuleOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Training Module</DialogTitle>
            <DialogDescription>
              Create a new training module with work instructions and critical points for the Trainer Dashboard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Module Code <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g., SAFETY-101"
                  value={newModule.code}
                  onChange={(e) => setNewModule({ ...newModule, code: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Unique identifier for this module</p>
              </div>
              <div>
                <Label>Estimated Duration (minutes)</Label>
                <Input
                  type="number"
                  value={newModule.estimatedMinutes}
                  onChange={(e) => setNewModule({ ...newModule, estimatedMinutes: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>

            <div>
              <Label>Module Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g., Workplace Safety Fundamentals"
                value={newModule.title}
                onChange={(e) => setNewModule({ ...newModule, title: e.target.value })}
              />
            </div>

            <div>
              <Label>Overview</Label>
              <Textarea
                placeholder="Brief description of what this training module covers..."
                value={newModule.overview}
                onChange={(e) => setNewModule({ ...newModule, overview: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label>Work Instructions / Training Content</Label>
              <Textarea
                placeholder="Detailed step-by-step instructions, procedures, and key learning points..."
                value={newModule.contentHtml}
                onChange={(e) => setNewModule({ ...newModule, contentHtml: e.target.value })}
                rows={6}
              />
              <p className="text-xs text-muted-foreground mt-1">This content will be displayed during training sessions</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Critical Points</Label>
                <Button type="button" variant="outline" size="sm" onClick={addCriticalPoint}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Point
                </Button>
              </div>
              {criticalPoints.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded">
                  No critical points added. Click "Add Point" to add safety or quality critical points.
                </p>
              ) : (
                <div className="space-y-3">
                  {criticalPoints.map((cp, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Critical point label"
                          value={cp.label}
                          onChange={(e) => updateCriticalPoint(index, 'label', e.target.value)}
                          className="flex-1"
                        />
                        <Select 
                          value={cp.severity} 
                          onValueChange={(value) => updateCriticalPoint(index, 'severity', value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="minor">Minor</SelectItem>
                            <SelectItem value="major">Major</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCriticalPoint(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                      <Textarea
                        placeholder="Details about this critical point..."
                        value={cp.detail}
                        onChange={(e) => updateCriticalPoint(index, 'detail', e.target.value)}
                        rows={2}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModuleOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createModuleMutation.mutate()}
              disabled={!newModule.code || !newModule.title || createModuleMutation.isPending}
            >
              {createModuleMutation.isPending ? 'Creating...' : 'Create Module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

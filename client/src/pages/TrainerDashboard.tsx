import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Users,
  Play,
  Pause,
  CheckCircle,
  Clock,
  Star,
  Lightbulb,
  Target,
  Heart,
  MessageCircle,
  Eye,
  HandMetal,
  GraduationCap,
  Award,
  ChevronRight,
  Calendar,
  ClipboardCheck,
  Plus,
  ListTodo,
  AlertCircle,
  Edit,
  Trash2,
  MoreVertical,
  Search,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface Employee {
  id: number;
  name: string;
  department: string;
  jobTitle: string;
}

interface DailySession {
  id: number;
  traineeId: number;
  trainerId: number;
  facilityTopicId: number;
  planDayId: number;
  sessionDate: string;
  status: string;
  notes: string;
  trainerSignature: string | null;
  traineeSignature: string | null;
  competencyAttested: boolean;
}

interface FacilityTopic {
  id: number;
  code: string;
  title: string;
  description: string;
}

interface TrainingAssignment {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  trainingName: string;
  lastCompleted: string | null;
  nextDue: string | null;
  status: string;
  notes: string | null;
}

interface AiTrainingPlan {
  id: number;
  traineeId: number;
  traineeName: string | null;
  title: string;
  description: string | null;
  totalTopics: number | null;
  status: string;
  createdAt: string;
  planStructure?: string;
  assignments?: {
    id: number;
    topicId: number;
    dayNumber: number;
    status: string;
    topicTitle: string;
    topicDuration: number | null;
  }[];
}

const stepDescriptions = [
  { step: 1, title: "Trainer Does / Explains", icon: Eye, bgClass: "bg-blue-500", ringClass: "ring-blue-200", description: "Demonstrate while explaining what and why" },
  { step: 2, title: "Trainer Does / Trainee Explains", icon: MessageCircle, bgClass: "bg-teal-500", ringClass: "ring-teal-200", description: "Trainee verbalizes understanding" },
  { step: 3, title: "Trainee Does / Trainer Coaches", icon: HandMetal, bgClass: "bg-orange-500", ringClass: "ring-orange-200", description: "Hands-on with active coaching" },
  { step: 4, title: "Trainee Does / Trainer Observes", icon: CheckCircle, bgClass: "bg-green-500", ringClass: "ring-green-200", description: "Independent execution observed" },
];

interface SessionUser {
  id: number;
  employeeId?: number;
  username: string;
  name?: string;
}

export default function TrainerDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('assignments');
  const [startSessionOpen, setStartSessionOpen] = useState(false);
  const [editSessionOpen, setEditSessionOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<DailySession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<DailySession | null>(null);
  const [assignmentToEdit, setAssignmentToEdit] = useState<TrainingAssignment | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] = useState<TrainingAssignment | null>(null);
  const [editAssignmentOpen, setEditAssignmentOpen] = useState(false);
  const [deleteAssignmentOpen, setDeleteAssignmentOpen] = useState(false);
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [selectedTraineeId, setSelectedTraineeId] = useState<string>('');
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [selectedDayId, setSelectedDayId] = useState<string>('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [soaFeedback, setSoaFeedback] = useState({ strength: '', opportunity: '', action: '' });
  const [searchTerm, setSearchTerm] = useState('');

  const { data: currentUser } = useQuery<SessionUser>({
    queryKey: ['/api/auth/session'],
  });

  const trainerId = currentUser?.employeeId || currentUser?.id || 0;

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: facilityTopics = [] } = useQuery<FacilityTopic[]>({
    queryKey: ['/api/training/facility-topics'],
  });

  const { data: planDays = [] } = useQuery<any[]>({
    queryKey: ['/api/training/plan-days'],
  });

  const { data: mySessions = [], isLoading } = useQuery<DailySession[]>({
    queryKey: ['/api/training/daily-sessions'],
  });

  const { data: trainerCertifications = [] } = useQuery<any[]>({
    queryKey: ['/api/training/trainer-certifications'],
  });

  const { data: trainingAssignments = [] } = useQuery<TrainingAssignment[]>({
    queryKey: ['/api/training/matrix'],
  });

  const { data: aiTrainingPlans = [] } = useQuery<AiTrainingPlan[]>({
    queryKey: ['/api/training/content-library/training-plans'],
  });

  // Filter AI plans that are active (assigned and ready for training)
  const activePlans = aiTrainingPlans.filter(p => p.status === 'active');

  const searchLower = searchTerm.toLowerCase();
  
  const pendingAssignments = trainingAssignments.filter(
    (a) => (a.status === 'PENDING' || a.status === 'IN_PROGRESS' || a.status === 'OVERDUE') &&
    (searchTerm === '' || 
      a.employeeName?.toLowerCase().includes(searchLower) ||
      a.trainingName?.toLowerCase().includes(searchLower) ||
      a.department?.toLowerCase().includes(searchLower) ||
      a.jobTitle?.toLowerCase().includes(searchLower))
  );

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/daily-sessions', {
        method: 'POST',
        body: JSON.stringify({
          traineeId: parseInt(selectedTraineeId),
          trainerId: trainerId,
          facilityTopicId: selectedTopicId ? parseInt(selectedTopicId) : null,
          planDayId: selectedDayId ? parseInt(selectedDayId) : null,
          notes: sessionNotes,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      setStartSessionOpen(false);
      setActiveSessionId(data.id);
      setCurrentStep(1);
      toast({ title: 'Session Started', description: 'Begin with Step 1: Trainer Does / Explains' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest(`/api/training/daily-sessions/${sessionId}/complete`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      setActiveSessionId(null);
      setCurrentStep(1);
      setSoaFeedback({ strength: '', opportunity: '', action: '' });
      toast({ title: 'Session Completed', description: 'Training session has been marked complete' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const signSessionMutation = useMutation({
    mutationFn: async ({ sessionId, role, signature }: { sessionId: number; role: string; signature: string }) => {
      return apiRequest(`/api/training/daily-sessions/${sessionId}/sign`, {
        method: 'PUT',
        body: JSON.stringify({ role, signature, competencyAttested: currentStep === 4 }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      toast({ title: 'Signed', description: 'Session signed successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const startFromAssignmentMutation = useMutation({
    mutationFn: async (assignment: TrainingAssignment) => {
      return apiRequest('/api/training/daily-sessions', {
        method: 'POST',
        body: JSON.stringify({
          traineeId: assignment.employeeId,
          trainerId: trainerId,
          notes: `Training: ${assignment.trainingName}`,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      setActiveSessionId(data.id);
      setCurrentStep(1);
      toast({ title: 'Session Started', description: 'Begin with Step 1: Trainer Does / Explains' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateSessionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/training/daily-sessions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      setEditSessionOpen(false);
      setSessionToEdit(null);
      resetEditForm();
      toast({ title: 'Session Updated', description: 'Training session has been updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/daily-sessions/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
      toast({ title: 'Session Deleted', description: 'Training session has been deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/training/matrix/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/matrix'] });
      setEditAssignmentOpen(false);
      setAssignmentToEdit(null);
      setAssignmentNotes('');
      toast({ title: 'Assignment Updated', description: 'Training assignment has been updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/matrix/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/matrix'] });
      setDeleteAssignmentOpen(false);
      setAssignmentToDelete(null);
      toast({ title: 'Assignment Deleted', description: 'Training assignment has been removed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const openEditAssignment = (assignment: TrainingAssignment) => {
    setAssignmentToEdit(assignment);
    setAssignmentNotes(assignment.notes || '');
    setEditAssignmentOpen(true);
  };

  const resetEditForm = () => {
    setSelectedTraineeId('');
    setSelectedTopicId('');
    setSelectedDayId('');
    setSessionNotes('');
  };

  const openEditDialog = (session: DailySession) => {
    setSessionToEdit(session);
    setSelectedTraineeId(session.traineeId?.toString() || '');
    setSelectedTopicId(session.facilityTopicId?.toString() || '');
    setSelectedDayId(session.planDayId?.toString() || '');
    setSessionNotes(session.notes || '');
    setEditSessionOpen(true);
  };

  const handleUpdateSession = () => {
    if (!sessionToEdit) return;
    updateSessionMutation.mutate({
      id: sessionToEdit.id,
      data: {
        traineeId: selectedTraineeId ? parseInt(selectedTraineeId) : sessionToEdit.traineeId,
        facilityTopicId: selectedTopicId ? parseInt(selectedTopicId) : null,
        planDayId: selectedDayId ? parseInt(selectedDayId) : null,
        notes: sessionNotes,
      },
    });
  };

  const getEmployeeName = (id: number) => employees.find(e => e.id === id)?.name || 'Unknown';
  const getTopicTitle = (id: number) => facilityTopics.find(t => t.id === id)?.title || 'General Training';

  const filterSession = (session: DailySession) => {
    if (searchTerm === '') return true;
    const employeeName = getEmployeeName(session.traineeId).toLowerCase();
    const topicTitle = getTopicTitle(session.facilityTopicId).toLowerCase();
    const notes = (session.notes || '').toLowerCase();
    return employeeName.includes(searchLower) || 
           topicTitle.includes(searchLower) || 
           notes.includes(searchLower);
  };

  const activeSessions = mySessions.filter(s => s.status === 'active' && filterSession(s));
  const completedSessions = mySessions.filter(s => s.status === 'completed' && filterSession(s));

  const renderStepTracker = () => (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          4-Step Training Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          {stepDescriptions.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.step;
            const isCurrent = currentStep === step.step;
            return (
              <div key={step.step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isCurrent
                        ? `${step.bgClass} text-white ring-4 ${step.ringClass}`
                        : 'bg-gray-200 text-gray-500'
                    }`}
                    onClick={() => setCurrentStep(step.step)}
                  >
                    {isCompleted ? <CheckCircle className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                  </div>
                  <span className={`text-xs mt-2 text-center ${isCurrent ? 'font-semibold' : 'text-muted-foreground'}`}>
                    Step {step.step}
                  </span>
                  <span className="text-xs text-muted-foreground text-center max-w-20">{step.title.split('/')[0]}</span>
                </div>
                {index < stepDescriptions.length - 1 && (
                  <div className={`h-1 flex-1 mx-2 rounded ${currentStep > step.step ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="font-semibold">{stepDescriptions[currentStep - 1]?.title}</p>
          <p className="text-sm text-muted-foreground">{stepDescriptions[currentStep - 1]?.description}</p>
        </div>
        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            disabled={currentStep === 1}
            onClick={() => setCurrentStep(prev => prev - 1)}
          >
            Previous Step
          </Button>
          {currentStep < 4 ? (
            <Button onClick={() => setCurrentStep(prev => prev + 1)}>
              Next Step
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              variant="default"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => activeSessionId && completeSessionMutation.mutate(activeSessionId)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete & Certify
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const renderSOAFeedback = () => (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Heart className="h-5 w-5 text-green-500" />
          S-O-A Coaching Feedback
        </CardTitle>
        <CardDescription>
          Use positive, specific feedback following the Strength-Opportunity-Action model
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Star className="h-4 w-4 text-green-500" />
              Strength
            </Label>
            <Textarea
              value={soaFeedback.strength}
              onChange={(e) => setSoaFeedback(prev => ({ ...prev, strength: e.target.value }))}
              placeholder="What did they do well? e.g., 'Your material prep was spot-on'"
              className="h-24"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              Opportunity
            </Label>
            <Textarea
              value={soaFeedback.opportunity}
              onChange={(e) => setSoaFeedback(prev => ({ ...prev, opportunity: e.target.value }))}
              placeholder="What could improve? e.g., 'Check orientation earlier to avoid rework'"
              className="h-24"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-500" />
              Action
            </Label>
            <Textarea
              value={soaFeedback.action}
              onChange={(e) => setSoaFeedback(prev => ({ ...prev, action: e.target.value }))}
              placeholder="What's the next step? e.g., 'Add an orientation check to your prep routine'"
              className="h-24"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderActiveSession = () => {
    const session = activeSessions.find(s => s.id === activeSessionId);
    if (!session) return null;

    return (
      <div className="space-y-6">
        <Card className="bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-950/30 dark:to-green-950/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <Badge className="mb-2">Active Session</Badge>
                <h3 className="text-lg font-semibold">Training: {getEmployeeName(session.traineeId)}</h3>
                <p className="text-muted-foreground">Topic: {getTopicTitle(session.facilityTopicId)}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline" className="mb-2">
                  <Clock className="h-3 w-3 mr-1" />
                  {new Date(session.sessionDate).toLocaleDateString()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {renderStepTracker()}
        {renderSOAFeedback()}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-1/3 mx-auto"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            Trainer Dashboard
          </h1>
          <p className="text-muted-foreground">
            Conduct training sessions using the 4-Step Method with S-O-A coaching
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Button onClick={() => setStartSessionOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Start Session
          </Button>
        </div>
      </div>

      {activeSessionId ? (
        renderActiveSession()
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="assignments" className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Pending ({pendingAssignments.length})
            </TabsTrigger>
            <TabsTrigger value="ai-plans" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Training Plans ({activePlans.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Active ({activeSessions.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed ({completedSessions.length})
            </TabsTrigger>
            <TabsTrigger value="certifications" className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Certifications
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assignments" className="space-y-4">
            {pendingAssignments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <ListTodo className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Assignments</h3>
                  <p className="text-muted-foreground">Training assignments from Control Center will appear here</p>
                </CardContent>
              </Card>
            ) : (
              pendingAssignments.map((assignment) => (
                <Card key={assignment.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-base">{assignment.employeeName || 'Unknown Employee'}</CardTitle>
                          <Badge variant={assignment.status === 'OVERDUE' ? 'destructive' : 'secondary'}>
                            {assignment.status === 'OVERDUE' && <AlertCircle className="h-3 w-3 mr-1" />}
                            {assignment.status}
                          </Badge>
                        </div>
                        <CardDescription className="font-medium text-foreground">{assignment.trainingName}</CardDescription>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          {assignment.department && <span>{assignment.department}</span>}
                          {assignment.jobTitle && <span>• {assignment.jobTitle}</span>}
                          {assignment.nextDue && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due: {new Date(assignment.nextDue).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          onClick={() => startFromAssignmentMutation.mutate(assignment)}
                          disabled={!assignment.employeeId || startFromAssignmentMutation.isPending}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Start Training
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditAssignment(assignment)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Assignment
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => { setAssignmentToDelete(assignment); setDeleteAssignmentOpen(true); }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Assignment
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="ai-plans" className="space-y-4">
            {activePlans.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center">
                    <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No Active Training Plans</h3>
                    <p className="text-muted-foreground">
                      AI-generated training plans from the Content Library will appear here when assigned
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              activePlans
                .filter(plan => 
                  searchTerm === '' || 
                  plan.title.toLowerCase().includes(searchLower) ||
                  (plan.traineeName && plan.traineeName.toLowerCase().includes(searchLower))
                )
                .map((plan) => {
                  let planData: any = null;
                  try {
                    planData = plan.planStructure ? JSON.parse(plan.planStructure) : null;
                  } catch (e) {}
                  
                  const trainee = employees.find(e => e.id === plan.traineeId);
                  
                  return (
                    <Card key={plan.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-lg">{plan.title}</CardTitle>
                              <Badge variant="default">Active</Badge>
                            </div>
                            <CardDescription className="flex items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {plan.traineeName || trainee?.name || 'Unknown trainee'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(plan.createdAt).toLocaleDateString()}
                              </span>
                              {plan.totalTopics && (
                                <span className="flex items-center gap-1">
                                  <Target className="h-4 w-4" />
                                  {plan.totalTopics} topics
                                </span>
                              )}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                        {planData?.days && (
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm">4-Day Training Schedule:</h4>
                            <div className="grid grid-cols-4 gap-2">
                              {planData.days.map((day: any) => (
                                <div key={day.dayNumber} className="p-3 bg-muted rounded-lg">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="font-medium text-sm">Day {day.dayNumber}</p>
                                    <Badge variant="outline" className="text-xs">{day.estimatedHours}h</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{day.theme}</p>
                                  {day.topics && (
                                    <p className="text-xs mt-1">{day.topics.length} topic(s)</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 mt-4">
                          <Button 
                            size="sm" 
                            onClick={() => {
                              setSelectedTraineeId(plan.traineeId.toString());
                              setStartSessionOpen(true);
                            }}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start Training Session
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
            )}
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            {activeSessions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Play className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Active Sessions</h3>
                  <p className="text-muted-foreground mb-4">Start a new training session to begin</p>
                  <Button onClick={() => setStartSessionOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Start Session
                  </Button>
                </CardContent>
              </Card>
            ) : (
              activeSessions.map((session) => (
                <Card key={session.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{getEmployeeName(session.traineeId)}</CardTitle>
                        <CardDescription>{getTopicTitle(session.facilityTopicId)}</CardDescription>
                        {session.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{session.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button onClick={() => setActiveSessionId(session.id)}>
                          <Play className="h-4 w-4 mr-2" />
                          Resume
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(session)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Session
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => { setSessionToDelete(session); setDeleteDialogOpen(true); }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Session
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedSessions.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Completed Sessions</h3>
                  <p className="text-muted-foreground">Completed training sessions will appear here</p>
                </CardContent>
              </Card>
            ) : (
              completedSessions.map((session) => (
                <Card key={session.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>{getEmployeeName(session.traineeId)}</CardTitle>
                        <CardDescription>{getTopicTitle(session.facilityTopicId)}</CardDescription>
                        {session.notes && (
                          <p className="text-sm text-muted-foreground mt-1">{session.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Completed: {new Date(session.sessionDate).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-50">
                          <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                          Completed
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(session)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Session
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => { setSessionToDelete(session); setDeleteDialogOpen(true); }}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Session
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="certifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Certified Trainers</CardTitle>
                <CardDescription>Employees certified to conduct training sessions</CardDescription>
              </CardHeader>
              <CardContent>
                {trainerCertifications.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No certified trainers yet</p>
                ) : (
                  <div className="space-y-2">
                    {trainerCertifications.map((cert: any) => (
                      <div key={cert.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Award className="h-5 w-5 text-primary" />
                          <div>
                            <p className="font-medium">{cert.employeeName}</p>
                            <p className="text-sm text-muted-foreground">{cert.department}</p>
                          </div>
                        </div>
                        <Badge>{cert.quizScore}%</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={startSessionOpen} onOpenChange={setStartSessionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Training Session</DialogTitle>
            <DialogDescription>
              Select a trainee and training module to begin a new training session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Trainee <span className="text-destructive">*</span></Label>
              <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trainee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name} - {emp.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Training Module <span className="text-destructive">*</span></Label>
              <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select training module" />
                </SelectTrigger>
                <SelectContent>
                  {facilityTopics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id.toString()}>
                      {topic.code} - {topic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Training Day (Optional)</Label>
              <Select value={selectedDayId} onValueChange={setSelectedDayId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {planDays.map((day: any) => (
                    <SelectItem key={day.id} value={day.id.toString()}>
                      Day {day.dayNumber}: {day.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Any notes for this session..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartSessionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => startSessionMutation.mutate()}
              disabled={!selectedTraineeId || !selectedTopicId || startSessionMutation.isPending}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog open={editSessionOpen} onOpenChange={(open) => { setEditSessionOpen(open); if (!open) resetEditForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Training Session</DialogTitle>
            <DialogDescription>
              Update the training session details
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Trainee</Label>
              <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trainee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name} - {emp.department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Training Module <span className="text-destructive">*</span></Label>
              <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select training module" />
                </SelectTrigger>
                <SelectContent>
                  {facilityTopics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id.toString()}>
                      {topic.code} - {topic.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Training Day (Optional)</Label>
              <Select value={selectedDayId} onValueChange={setSelectedDayId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {planDays.map((day: any) => (
                    <SelectItem key={day.id} value={day.id.toString()}>
                      Day {day.dayNumber}: {day.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="Any notes for this session..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditSessionOpen(false); resetEditForm(); }}>Cancel</Button>
            <Button
              onClick={handleUpdateSession}
              disabled={updateSessionMutation.isPending}
            >
              <Edit className="h-4 w-4 mr-2" />
              {updateSessionMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this training session for {sessionToDelete ? getEmployeeName(sessionToDelete.traineeId) : ''}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSessionToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => sessionToDelete && deleteSessionMutation.mutate(sessionToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteSessionMutation.isPending ? 'Deleting...' : 'Delete Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Assignment Dialog */}
      <Dialog open={editAssignmentOpen} onOpenChange={(open) => { setEditAssignmentOpen(open); if (!open) { setAssignmentToEdit(null); setAssignmentNotes(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Training Assignment</DialogTitle>
            <DialogDescription>
              Update the assignment for {assignmentToEdit?.employeeName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Input value={assignmentToEdit?.employeeName || ''} disabled />
            </div>
            <div>
              <Label>Training</Label>
              <Input value={assignmentToEdit?.trainingName || ''} disabled />
            </div>
            <div>
              <Label>Status</Label>
              <Select 
                value={assignmentToEdit?.status || 'PENDING'} 
                onValueChange={(value) => setAssignmentToEdit(prev => prev ? {...prev, status: value} : null)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={assignmentNotes}
                onChange={(e) => setAssignmentNotes(e.target.value)}
                placeholder="Any notes for this assignment..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditAssignmentOpen(false); setAssignmentToEdit(null); setAssignmentNotes(''); }}>Cancel</Button>
            <Button
              onClick={() => assignmentToEdit && updateAssignmentMutation.mutate({
                id: assignmentToEdit.id,
                data: { status: assignmentToEdit.status, notes: assignmentNotes }
              })}
              disabled={updateAssignmentMutation.isPending}
            >
              <Edit className="h-4 w-4 mr-2" />
              {updateAssignmentMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Assignment Confirmation Dialog */}
      <AlertDialog open={deleteAssignmentOpen} onOpenChange={setDeleteAssignmentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the "{assignmentToDelete?.trainingName}" assignment for {assignmentToDelete?.employeeName}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAssignmentToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => assignmentToDelete && deleteAssignmentMutation.mutate(assignmentToDelete.id)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteAssignmentMutation.isPending ? 'Deleting...' : 'Delete Assignment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState, useEffect } from 'react';
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
  AlertTriangle,
  Edit,
  Trash2,
  MoreVertical,
  Search,
  FileText,
  Shield,
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
  soaStrength?: string | null;
  soaOpportunity?: string | null;
  soaAction?: string | null;
  soaReviewedAt?: string | null;
}

interface TrainingModule {
  id: number;
  title: string;
  description: string;
  estimatedMinutes: number;
  passingScore: number;
  content?: string;
  contentHtml?: string;
}

interface ContentLibraryTopic {
  id: number;
  title: string;
  description: string | null;
  objectives: string | null;
  estimatedDuration: number | null;
  isAiGenerated: boolean;
}

interface WorkInstruction {
  id: number;
  title: string;
  department: string;
  documentNumber: string;
  objective: string;
  steps: { stepNumber: number; instruction: string; notes?: string }[];
  ppeRequired: string[];
  tools: string[];
}

interface CriticalPoint {
  id: number;
  workInstructionId: number;
  label: string;
  detail: string;
  severity: string;
}

interface TopicContent {
  id: number;
  code: string;
  title: string;
  overview: string;
  contentHtml: string;
  workInstructions: WorkInstruction[];
  criticalPoints: CriticalPoint[];
  questions: any[];
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

interface ProgramTraineeAssignment {
  id: number;
  programId: number;
  employeeId: number;
  trainerId: number | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  trainee: {
    id: number;
    name: string | null;
    department: string | null;
  } | null;
  program: {
    id: number;
    title: string;
    description: string | null;
    department: string;
    role: string;
  } | null;
  tasks: {
    id: number;
    title: string;
    description: string | null;
    sortOrder: number;
    estimatedMinutes: number | null;
    dayNumber: number;
    step1Content: string | null;
    step2Content: string | null;
    step3Content: string | null;
    step4Content: string | null;
  }[];
}

interface SoaNote {
  id: number;
  assignmentId: number;
  trainerId: number;
  traineeId: number;
  dayNumber: number;
  noteDate: string;
  strengths: string | null;
  opportunities: string | null;
  actions: string | null;
  generalNotes: string | null;
  trainerSignoff: boolean;
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
  const [activeTopicContent, setActiveTopicContent] = useState<TopicContent | null>(null);
  const [loadingTopicContent, setLoadingTopicContent] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedStep, setSelectedStep] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [fourStepDialogOpen, setFourStepDialogOpen] = useState(false);
  const [soaNotesDialogOpen, setSoaNotesDialogOpen] = useState(false);
  const [selectedAssignmentForSoa, setSelectedAssignmentForSoa] = useState<ProgramTraineeAssignment | null>(null);
  const [soaDay, setSoaDay] = useState(1);
  const [soaNotes, setSoaNotes] = useState({ strengths: '', opportunities: '', actions: '', generalNotes: '' });
  const [generatingContent, setGeneratingContent] = useState<number | null>(null);

  const { data: currentUser } = useQuery<SessionUser>({
    queryKey: ['/api/auth/session'],
  });

  const trainerId = currentUser?.employeeId || currentUser?.id || 0;

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: trainingModules = [] } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/modules'],
  });

  const { data: contentLibraryTopics = [] } = useQuery<ContentLibraryTopic[]>({
    queryKey: ['/api/training/content-library/topics'],
  });

  const { data: planDays = [] } = useQuery<any[]>({
    queryKey: ['/api/training/plan-days'],
  });

  const { data: mySessions = [], isLoading } = useQuery<DailySession[]>({
    queryKey: ['/api/training/daily-sessions', trainerId],
    queryFn: async () => {
      if (!trainerId) return [];
      const res = await fetch(`/api/training/daily-sessions?trainerId=${trainerId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!trainerId,
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

  // Program-based trainer assignments
  const { data: myTrainees = [], isLoading: myTraineesLoading } = useQuery<ProgramTraineeAssignment[]>({
    queryKey: ['/api/training/trainer-assignments', trainerId],
    queryFn: async () => {
      if (!trainerId) return [];
      const res = await fetch(`/api/training/trainer-assignments/${trainerId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!trainerId,
  });

  // Recent SOA notes from this trainer
  const { data: recentSoaNotes = [] } = useQuery<any[]>({
    queryKey: ['/api/training/trainer', trainerId, 'soa-notes/recent'],
    queryFn: async () => {
      if (!trainerId) return [];
      const res = await fetch(`/api/training/trainer/${trainerId}/soa-notes/recent`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!trainerId,
  });

  // Yesterday's sessions with SOA feedback for morning review
  const { data: yesterdayFeedback = [] } = useQuery<DailySession[]>({
    queryKey: ['/api/training/daily-sessions/yesterday-feedback'],
  });

  // Filter AI plans that are active (assigned and ready for training)
  const activePlans = aiTrainingPlans.filter(p => p.status === 'active');

  const searchLower = searchTerm.toLowerCase();
  
  // Filter assignments to only show those assigned to the current trainer
  const myAssignments = trainingAssignments.filter(
    (a) => a.trainerId === trainerId || a.assignedBy === trainerId
  );
  
  const pendingAssignments = myAssignments.filter(
    (a) => (a.status === 'PENDING' || a.status === 'IN_PROGRESS' || a.status === 'OVERDUE') &&
    (searchTerm === '' || 
      a.employeeName?.toLowerCase().includes(searchLower) ||
      a.trainingName?.toLowerCase().includes(searchLower) ||
      a.department?.toLowerCase().includes(searchLower) ||
      a.jobTitle?.toLowerCase().includes(searchLower))
  );

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const stepNum = selectedStep ? parseInt(selectedStep) : 1;
      return apiRequest('/api/training/daily-sessions', {
        method: 'POST',
        body: JSON.stringify({
          traineeId: parseInt(selectedTraineeId),
          trainerId: trainerId,
          planId: selectedPlan?.id || null,
          stepNumber: stepNum,
          facilityTopicId: selectedTopicId ? parseInt(selectedTopicId.replace('topic-', '').replace('module-', '')) : null,
          topicType: selectedTopicId?.startsWith('topic-') ? 'content-library' : 'module',
          planDayId: selectedDayId ? parseInt(selectedDayId) : null,
          notes: sessionNotes,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      setStartSessionOpen(false);
      setActiveSessionId(data.id);
      const stepNum = selectedStep ? parseInt(selectedStep) : 1;
      setCurrentStep(stepNum);
      const stepNames = ['', 'Trainer Does / Explains', 'Trainer Does / Trainee Explains', 'Trainee Does / Trainer Coaches', 'Trainee Does / Trainer Observes'];
      toast({ title: 'Session Started', description: `Begin with Step ${stepNum}: ${stepNames[stepNum]}` });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      return apiRequest(`/api/training/daily-sessions/${sessionId}/complete`, {
        method: 'PUT',
        body: JSON.stringify({
          soaStrength: soaFeedback.strength || null,
          soaOpportunity: soaFeedback.opportunity || null,
          soaAction: soaFeedback.action || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions/yesterday-feedback'] });
      setActiveSessionId(null);
      setCurrentStep(1);
      setSoaFeedback({ strength: '', opportunity: '', action: '' });
      toast({ title: 'Session Completed', description: 'Training session has been marked complete with SOA feedback' });
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

  const markReviewedMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/daily-sessions/${id}/mark-reviewed`, {
        method: 'PUT',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/daily-sessions/yesterday-feedback'] });
      toast({ title: 'Marked as Reviewed', description: 'SOA feedback has been discussed' });
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

  // Generate 4-step content for a task
  const generateFourStepMutation = useMutation({
    mutationFn: async ({ programId, taskId, trainingMaterial }: { programId: number; taskId: number; trainingMaterial?: string }) => {
      return apiRequest(`/api/training/programs/${programId}/tasks/${taskId}/generate-4step`, {
        method: 'POST',
        body: JSON.stringify({ trainingMaterial }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/trainer-assignments'] });
      toast({ title: '4-Step Content Generated', description: 'AI has generated training content for all 4 steps' });
      setGeneratingContent(null);
    },
    onError: (error: any) => {
      toast({ title: 'Generation Failed', description: error.message, variant: 'destructive' });
      setGeneratingContent(null);
    },
  });

  // Save SOA notes
  const saveSoaNotesMutation = useMutation({
    mutationFn: async (data: { assignmentId: number; trainerId: number; traineeId: number; dayNumber: number; strengths: string; opportunities: string; actions: string; generalNotes: string }) => {
      return apiRequest(`/api/training/assignments/${data.assignmentId}/soa-notes`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/trainer', trainerId, 'soa-notes/recent'] });
      toast({ title: 'Notes Saved', description: 'SOA coaching notes have been saved' });
      setSoaNotesDialogOpen(false);
      setSoaNotes({ strengths: '', opportunities: '', actions: '', generalNotes: '' });
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
  const getTopicTitle = (id: number) => {
    const module = trainingModules.find(t => t.id === id);
    if (module) return module.title;
    const topic = contentLibraryTopics.find(t => t.id === id);
    if (topic) return topic.title;
    return 'General Training';
  };

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

  // Fetch topic content when an active session is selected
  useEffect(() => {
    const fetchTopicContent = async () => {
      if (!activeSessionId) {
        setActiveTopicContent(null);
        return;
      }
      
      const session = mySessions.find(s => s.id === activeSessionId && s.status === 'active');
      if (!session?.facilityTopicId) return;
      
      setLoadingTopicContent(true);
      try {
        const module = trainingModules.find(m => m.id === session.facilityTopicId);
        if (module) {
          setActiveTopicContent({
            id: module.id,
            code: '',
            title: module.title,
            overview: module.description,
            contentHtml: module.contentHtml || module.content || '',
            workInstructions: [],
            criticalPoints: [],
            questions: [],
          });
        } else {
          const contentTopic = contentLibraryTopics.find(t => t.id === session.facilityTopicId);
          if (contentTopic) {
            const response = await fetch(`/api/training/content-library/topics/${contentTopic.id}`);
            if (response.ok) {
              const data = await response.json();
              let objectives: string[] = [];
              try {
                objectives = data.objectives ? JSON.parse(data.objectives) : [];
              } catch (e) { objectives = []; }
              
              const workInstructions = (data.materials || []).map((m: any) => ({
                id: m.id,
                title: m.stepTitle || `Step ${m.stepNumber}`,
                objective: m.trainerInstructions || '',
                steps: m.keyPoints ? JSON.parse(m.keyPoints).map((point: string, idx: number) => ({
                  stepNumber: idx + 1,
                  instruction: point,
                })) : [],
                ppeRequired: [],
                tools: [],
              }));
              
              setActiveTopicContent({
                id: contentTopic.id,
                code: '',
                title: data.title,
                overview: data.description || '',
                contentHtml: objectives.length > 0 
                  ? `<ul>${objectives.map((o: string) => `<li>${o}</li>`).join('')}</ul>`
                  : data.description || '',
                workInstructions,
                criticalPoints: (data.materials || [])
                  .filter((m: any) => m.safetyNotes)
                  .map((m: any) => ({
                    id: m.id,
                    workInstructionId: 0,
                    label: 'Safety Note',
                    detail: m.safetyNotes,
                    severity: 'major',
                  })),
                questions: [],
              });
            } else {
              setActiveTopicContent({
                id: contentTopic.id,
                code: '',
                title: contentTopic.title,
                overview: contentTopic.description || '',
                contentHtml: contentTopic.objectives || contentTopic.description || '',
                workInstructions: [],
                criticalPoints: [],
                questions: [],
              });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching topic content:', error);
      } finally {
        setLoadingTopicContent(false);
      }
    };
    
    fetchTopicContent();
  }, [activeSessionId, mySessions, trainingModules, contentLibraryTopics]);

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

  // Yesterday's SOA feedback for morning review
  const renderYesterdayFeedback = () => {
    const unreviewedFeedback = yesterdayFeedback.filter(s => !s.soaReviewedAt);
    
    if (unreviewedFeedback.length === 0) return null;
    
    return (
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Yesterday's Training Feedback - Review Before Starting
          </CardTitle>
          <CardDescription>
            Discuss these S-O-A notes with trainees at the beginning of today's session
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unreviewedFeedback.map((session) => (
            <Card key={session.id} className="bg-white dark:bg-gray-900">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline">{getEmployeeName(session.traineeId)}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {getTopicTitle(session.facilityTopicId)}
                      </span>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4 mt-3">
                      {session.soaStrength && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm font-medium text-green-700 dark:text-green-400">
                            <Star className="h-3 w-3" /> Strength
                          </div>
                          <p className="text-sm text-muted-foreground">{session.soaStrength}</p>
                        </div>
                      )}
                      {session.soaOpportunity && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm font-medium text-yellow-700 dark:text-yellow-400">
                            <Lightbulb className="h-3 w-3" /> Opportunity
                          </div>
                          <p className="text-sm text-muted-foreground">{session.soaOpportunity}</p>
                        </div>
                      )}
                      {session.soaAction && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-400">
                            <Target className="h-3 w-3" /> Action
                          </div>
                          <p className="text-sm text-muted-foreground">{session.soaAction}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => markReviewedMutation.mutate(session.id)}
                    disabled={markReviewedMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Discussed
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    );
  };

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
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setActiveSessionId(null)}>
                  <ChevronRight className="h-4 w-4 mr-1 rotate-180" />
                  Back to List
                </Button>
                <Badge variant="outline">
                  <Clock className="h-3 w-3 mr-1" />
                  {new Date(session.sessionDate).toLocaleDateString()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Training Content Section */}
        {loadingTopicContent ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="animate-pulse">Loading training content...</div>
            </CardContent>
          </Card>
        ) : activeTopicContent ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Overview & Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-blue-500" />
                  Training Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeTopicContent.overview && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Overview</h4>
                    <p className="text-sm">{activeTopicContent.overview}</p>
                  </div>
                )}
                {activeTopicContent.contentHtml && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-1">Instructions</h4>
                    <div 
                      className="text-sm prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: activeTopicContent.contentHtml }}
                    />
                  </div>
                )}
                {!activeTopicContent.overview && !activeTopicContent.contentHtml && (
                  <p className="text-sm text-muted-foreground">No training content available for this topic.</p>
                )}
              </CardContent>
            </Card>

            {/* Critical Points */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-orange-500" />
                  Critical Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeTopicContent.criticalPoints && activeTopicContent.criticalPoints.length > 0 ? (
                  <div className="space-y-3">
                    {activeTopicContent.criticalPoints.map((cp) => (
                      <div 
                        key={cp.id} 
                        className={`p-3 rounded-lg border-l-4 ${
                          cp.severity === 'critical' ? 'border-l-red-500 bg-red-50 dark:bg-red-950/30' :
                          cp.severity === 'major' ? 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/30' :
                          'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/30'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{cp.label}</span>
                          <Badge variant="outline" className="text-xs capitalize">{cp.severity}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{cp.detail}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No critical points defined for this topic.</p>
                )}
              </CardContent>
            </Card>

            {/* Work Instructions */}
            {activeTopicContent.workInstructions && activeTopicContent.workInstructions.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-green-500" />
                    Work Instructions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {activeTopicContent.workInstructions.map((wi) => (
                    <div key={wi.id} className="mb-6 last:mb-0">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold">{wi.title}</h4>
                        {wi.documentNumber && (
                          <Badge variant="outline">{wi.documentNumber}</Badge>
                        )}
                      </div>
                      {wi.objective && (
                        <p className="text-sm text-muted-foreground mb-3">{wi.objective}</p>
                      )}
                      {wi.ppeRequired && wi.ppeRequired.length > 0 && (
                        <div className="mb-3">
                          <span className="text-sm font-medium">PPE Required: </span>
                          <span className="text-sm">{wi.ppeRequired.join(', ')}</span>
                        </div>
                      )}
                      {wi.steps && wi.steps.length > 0 && (
                        <div className="space-y-2">
                          {wi.steps.map((step) => (
                            <div key={step.stepNumber} className="flex gap-3 p-2 bg-muted rounded">
                              <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                                {step.stepNumber}
                              </span>
                              <div>
                                <p className="text-sm">{step.instruction}</p>
                                {step.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">{step.notes}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No detailed training content available for this topic.</p>
              <p className="text-sm mt-2">Add work instructions and critical points in the training module settings.</p>
            </CardContent>
          </Card>
        )}

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

      {/* Yesterday's SOA feedback for morning discussion */}
      {renderYesterdayFeedback()}

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
            <TabsTrigger value="my-trainees" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              My Trainees ({myTrainees.length})
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
                .filter(plan => {
                  const traineeName = plan.traineeName || plan.trainee_name || '';
                  return searchTerm === '' || 
                    plan.title.toLowerCase().includes(searchLower) ||
                    traineeName.toLowerCase().includes(searchLower);
                })
                .map((plan) => {
                  let planData: any = null;
                  try {
                    const planStructure = plan.planStructure || plan.plan_structure;
                    planData = planStructure ? JSON.parse(planStructure) : null;
                  } catch (e) {}
                  
                  const traineeId = plan.traineeId || plan.trainee_id;
                  const trainee = employees.find(e => e.id === traineeId);
                  const hasSteps = planData?.steps && Array.isArray(planData.steps);
                  
                  return (
                    <Card key={plan.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <CardTitle className="text-lg">{plan.title}</CardTitle>
                              <Badge variant="default" className="bg-green-600">4-Step Program</Badge>
                            </div>
                            <CardDescription className="flex flex-wrap items-center gap-4">
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {plan.traineeName || plan.trainee_name || trainee?.name || 'Unknown trainee'}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(plan.createdAt || plan.created_at).toLocaleDateString()}
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
                        
                        {hasSteps ? (
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm">4-Step Training Method:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                              {planData.steps.map((step: any, idx: number) => {
                                const stepInfo = stepDescriptions[idx];
                                const StepIcon = stepInfo?.icon || CheckCircle;
                                return (
                                  <div key={step.stepNumber} className={`p-3 rounded-lg border-2 ${stepInfo?.bgClass.replace('bg-', 'border-').replace('500', '200')} bg-${stepInfo?.bgClass.replace('bg-', '').replace('500', '50')}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className={`w-6 h-6 rounded-full ${stepInfo?.bgClass} text-white flex items-center justify-center text-xs font-bold`}>
                                        {step.stepNumber}
                                      </div>
                                      <p className="font-medium text-sm">{step.stepTitle || stepInfo?.title}</p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-2">{step.theme}</p>
                                    {step.quizQuestions && (
                                      <Badge variant="outline" className="text-xs">
                                        <ClipboardCheck className="h-3 w-3 mr-1" />
                                        {step.quizQuestions.length} Quiz Questions
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : planData?.days && (
                          <div className="space-y-3">
                            <h4 className="font-medium text-sm">Training Schedule:</h4>
                            <div className="grid grid-cols-4 gap-2">
                              {planData.days.map((day: any) => (
                                <div key={day.dayNumber} className="p-3 bg-muted rounded-lg">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="font-medium text-sm">Day {day.dayNumber}</p>
                                    <Badge variant="outline" className="text-xs">{day.estimatedHours}h</Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground">{day.theme}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <Separator className="my-4" />
                        
                        <div className="flex flex-wrap gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => {
                              const traineeId = plan.traineeId || plan.trainee_id;
                              if (traineeId) {
                                setSelectedTraineeId(traineeId.toString());
                                setSelectedPlan(plan);
                                setSelectedStep('1');
                                setStartSessionOpen(true);
                              }
                            }}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Start Training Session
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              toast({ title: 'View Step Details', description: 'Open trainee portal to view full step progress and quizzes' });
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Step Details
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

          {/* My Trainees - Program-based assignments */}
          <TabsContent value="my-trainees" className="space-y-4">
            {myTraineesLoading ? (
              <div className="text-center py-8">Loading your trainees...</div>
            ) : myTrainees.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Trainees Assigned</h3>
                  <p className="text-muted-foreground">Training programs where you are the assigned trainer will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {myTrainees.map((assignment) => (
                  <Card key={assignment.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <GraduationCap className="h-5 w-5 text-primary" />
                            {assignment.trainee?.name || 'Unknown Employee'}
                            <Badge variant={assignment.status === 'completed' ? 'default' : 'secondary'}>
                              {assignment.status}
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            {assignment.program?.title || 'Training Program'}
                          </CardDescription>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          {assignment.trainee?.department && (
                            <Badge variant="outline">{assignment.trainee.department}</Badge>
                          )}
                          {assignment.startDate && (
                            <p className="mt-1">Started: {new Date(assignment.startDate).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Program description */}
                        {assignment.program?.description && (
                          <p className="text-sm text-muted-foreground">
                            {assignment.program.description}
                          </p>
                        )}
                        
                        {/* Tasks/Materials for trainer with 4-Step Content */}
                        <div>
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Training Materials ({assignment.tasks.length} tasks)
                          </h4>
                          <div className="grid gap-2">
                            {assignment.tasks.map((task) => (
                              <div key={task.id} className="p-3 bg-muted/50 rounded border">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{task.title}</span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">Day {task.dayNumber || 1}</Badge>
                                    {task.estimatedMinutes && (
                                      <span className="text-xs text-muted-foreground">~{task.estimatedMinutes}m</span>
                                    )}
                                  </div>
                                </div>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                                )}
                                <div className="flex items-center gap-2 mt-2">
                                  {task.step1Content ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs"
                                      onClick={() => {
                                        setSelectedTask(task);
                                        setFourStepDialogOpen(true);
                                      }}
                                    >
                                      <Eye className="h-3 w-3 mr-1" />
                                      View 4-Step Content
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      className="text-xs"
                                      disabled={generatingContent === task.id}
                                      onClick={() => {
                                        setGeneratingContent(task.id);
                                        generateFourStepMutation.mutate({ 
                                          programId: assignment.programId, 
                                          taskId: task.id 
                                        });
                                      }}
                                    >
                                      {generatingContent === task.id ? (
                                        <>Generating...</>
                                      ) : (
                                        <>
                                          <Lightbulb className="h-3 w-3 mr-1" />
                                          Generate 4-Step Content
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* SOA Notes Section */}
                        <Separator className="my-4" />
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <MessageCircle className="h-4 w-4 text-primary" />
                              <span className="font-medium">Daily SOA Notes</span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedAssignmentForSoa(assignment);
                                setSoaNotesDialogOpen(true);
                              }}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add Notes
                            </Button>
                          </div>
                          
                          {/* Show recent notes for this assignment */}
                          {recentSoaNotes.filter((n: any) => n.assignmentId === assignment.id).length > 0 && (
                            <div className="space-y-2">
                              {recentSoaNotes
                                .filter((n: any) => n.assignmentId === assignment.id)
                                .slice(0, 2)
                                .map((note: any) => (
                                  <div key={note.id} className="p-2 bg-muted/30 rounded text-sm border-l-2 border-primary">
                                    <div className="flex items-center justify-between mb-1">
                                      <Badge variant="outline" className="text-xs">Day {note.dayNumber}</Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(note.noteDate).toLocaleDateString()}
                                      </span>
                                    </div>
                                    {note.strengths && (
                                      <p className="text-xs"><Star className="h-3 w-3 inline text-green-500 mr-1" />{note.strengths}</p>
                                    )}
                                    {note.opportunities && (
                                      <p className="text-xs"><Target className="h-3 w-3 inline text-yellow-500 mr-1" />{note.opportunities}</p>
                                    )}
                                    {note.actions && (
                                      <p className="text-xs"><Lightbulb className="h-3 w-3 inline text-blue-500 mr-1" />{note.actions}</p>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* 4-Step Content Viewer Dialog */}
      <Dialog open={fourStepDialogOpen} onOpenChange={setFourStepDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              4-Step Training: {selectedTask?.title}
            </DialogTitle>
            <DialogDescription>
              Train-the-Trainer methodology for this task
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-6">
              {/* Step 1 */}
              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge className="bg-blue-500">Step 1</Badge>
                    Trainer Does / Explains
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {selectedTask.step1Content || 'No content generated yet'}
                  </div>
                </CardContent>
              </Card>

              {/* Step 2 */}
              <Card className="border-l-4 border-l-green-500">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge className="bg-green-500">Step 2</Badge>
                    Trainer Does / Trainee Explains
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {selectedTask.step2Content || 'No content generated yet'}
                  </div>
                </CardContent>
              </Card>

              {/* Step 3 */}
              <Card className="border-l-4 border-l-yellow-500">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge className="bg-yellow-500">Step 3</Badge>
                    Trainee Does / Trainer Coaches
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {selectedTask.step3Content || 'No content generated yet'}
                  </div>
                </CardContent>
              </Card>

              {/* Step 4 */}
              <Card className="border-l-4 border-l-purple-500">
                <CardHeader className="py-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge className="bg-purple-500">Step 4</Badge>
                    Trainee Does / Trainer Observes
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                    {selectedTask.step4Content || 'No content generated yet'}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SOA Notes Dialog */}
      <Dialog open={soaNotesDialogOpen} onOpenChange={setSoaNotesDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Daily SOA Coaching Notes
            </DialogTitle>
            <DialogDescription>
              {selectedAssignmentForSoa?.trainee?.name} - {selectedAssignmentForSoa?.program?.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Training Day</Label>
              <Select value={soaDay.toString()} onValueChange={(v) => setSoaDay(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <SelectItem key={day} value={day.toString()}>Day {day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Star className="h-4 w-4 text-green-500" />
                Strengths (What did they do well?)
              </Label>
              <Textarea
                placeholder="Describe what the trainee did well today..."
                value={soaNotes.strengths}
                onChange={(e) => setSoaNotes({ ...soaNotes, strengths: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Target className="h-4 w-4 text-yellow-500" />
                Opportunities (What could be improved?)
              </Label>
              <Textarea
                placeholder="Areas for improvement..."
                value={soaNotes.opportunities}
                onChange={(e) => setSoaNotes({ ...soaNotes, opportunities: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-blue-500" />
                Actions (What will we do differently next time?)
              </Label>
              <Textarea
                placeholder="Action items for next session..."
                value={soaNotes.actions}
                onChange={(e) => setSoaNotes({ ...soaNotes, actions: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label>General Notes</Label>
              <Textarea
                placeholder="Any additional observations or notes..."
                value={soaNotes.generalNotes}
                onChange={(e) => setSoaNotes({ ...soaNotes, generalNotes: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSoaNotesDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedAssignmentForSoa) {
                  saveSoaNotesMutation.mutate({
                    assignmentId: selectedAssignmentForSoa.id,
                    trainerId: trainerId,
                    traineeId: selectedAssignmentForSoa.employeeId,
                    dayNumber: soaDay,
                    ...soaNotes,
                  });
                }
              }}
              disabled={saveSoaNotesMutation.isPending}
            >
              {saveSoaNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startSessionOpen} onOpenChange={(open) => {
        setStartSessionOpen(open);
        if (!open) {
          setSelectedPlan(null);
          setSelectedStep('');
        }
      }}>
        <DialogContent className={selectedPlan ? "max-w-2xl" : ""}>
          <DialogHeader>
            <DialogTitle>Start Training Session</DialogTitle>
            <DialogDescription>
              {selectedPlan 
                ? `Training: ${selectedPlan.title}`
                : 'Select a trainee and training module to begin a new training session'
              }
            </DialogDescription>
          </DialogHeader>
          
          {selectedPlan ? (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">Trainee:</span>
                  <span>{selectedPlan.traineeName || selectedPlan.trainee_name || 'Unknown'}</span>
                </div>
                <p className="text-sm text-muted-foreground">{selectedPlan.description}</p>
              </div>
              
              <div>
                <Label>Select Training Step <span className="text-destructive">*</span></Label>
                <Select value={selectedStep} onValueChange={setSelectedStep}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select step to train" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Step 1: Trainer Does / Trainer Explains</SelectItem>
                    <SelectItem value="2">Step 2: Trainer Does / Trainee Explains</SelectItem>
                    <SelectItem value="3">Step 3: Trainee Does / Trainer Coaches</SelectItem>
                    <SelectItem value="4">Step 4: Trainee Does / Trainer Observes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {selectedStep && (() => {
                const planData = selectedPlan.planStructure || selectedPlan.plan_structure;
                let stepContent = null;
                let parsedPlan = null;
                try {
                  parsedPlan = planData ? JSON.parse(planData) : null;
                  stepContent = parsedPlan?.steps?.find((s: any) => s.stepNumber === parseInt(selectedStep));
                } catch (e) {}
                
                return stepContent ? (
                  <div className="border rounded-lg p-4 space-y-4 max-h-[400px] overflow-y-auto">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-600">Step {selectedStep}</Badge>
                      <span className="font-medium">{stepContent.stepTitle}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{stepContent.theme}</p>
                    
                    {stepContent.objectives && stepContent.objectives.length > 0 && (
                      <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-600" />
                          Learning Objectives
                        </p>
                        <ul className="text-sm list-disc list-inside text-muted-foreground space-y-1">
                          {stepContent.objectives.map((obj: string, i: number) => (
                            <li key={i}>{obj}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {(stepContent.workInstructions || parsedPlan?.workInstructions) && (
                      <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-amber-600" />
                          Work Instructions
                        </p>
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {stepContent.workInstructions || parsedPlan?.workInstructions}
                        </p>
                      </div>
                    )}
                    
                    {(stepContent.criticalPoints || parsedPlan?.criticalPoints) && (
                      <div className="bg-red-50 dark:bg-red-950 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          Critical Points
                        </p>
                        {Array.isArray(stepContent.criticalPoints || parsedPlan?.criticalPoints) ? (
                          <ul className="text-sm list-disc list-inside text-muted-foreground space-y-1">
                            {(stepContent.criticalPoints || parsedPlan?.criticalPoints).map((point: string, i: number) => (
                              <li key={i}>{point}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">{stepContent.criticalPoints || parsedPlan?.criticalPoints}</p>
                        )}
                      </div>
                    )}
                    
                    {(stepContent.safetyPrecautions || parsedPlan?.safetyPrecautions) && (
                      <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-orange-600" />
                          Safety Precautions
                        </p>
                        {Array.isArray(stepContent.safetyPrecautions || parsedPlan?.safetyPrecautions) ? (
                          <ul className="text-sm list-disc list-inside text-muted-foreground space-y-1">
                            {(stepContent.safetyPrecautions || parsedPlan?.safetyPrecautions).map((safety: string, i: number) => (
                              <li key={i}>{safety}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">{stepContent.safetyPrecautions || parsedPlan?.safetyPrecautions}</p>
                        )}
                      </div>
                    )}
                    
                    {stepContent.demonstrations && stepContent.demonstrations.length > 0 && (
                      <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Eye className="h-4 w-4 text-green-600" />
                          Demonstrations
                        </p>
                        <ul className="text-sm list-disc list-inside text-muted-foreground space-y-1">
                          {stepContent.demonstrations.map((demo: string, i: number) => (
                            <li key={i}>{demo}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {stepContent.quizQuestions && stepContent.quizQuestions.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        <ClipboardCheck className="h-3 w-3 mr-1" />
                        {stepContent.quizQuestions.length} Quiz Questions for this step
                      </Badge>
                    )}
                  </div>
                ) : null;
              })()}
              
              <div>
                <Label>Session Notes (Optional)</Label>
                <Textarea
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Any notes for this session..."
                />
              </div>
            </div>
          ) : (
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
                <Label>Training Material <span className="text-destructive">*</span></Label>
                <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select training material" />
                  </SelectTrigger>
                  <SelectContent>
                    {contentLibraryTopics.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                          Content Library Topics
                        </div>
                        {contentLibraryTopics.map((topic) => (
                          <SelectItem key={`topic-${topic.id}`} value={`topic-${topic.id}`}>
                            {topic.title} {topic.isAiGenerated && '(AI)'}
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {trainingModules.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted mt-1">
                          Training Modules
                        </div>
                        {trainingModules.map((mod) => (
                          <SelectItem key={`module-${mod.id}`} value={`module-${mod.id}`}>
                            {mod.title}
                          </SelectItem>
                        ))}
                      </>
                    )}
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
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartSessionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => startSessionMutation.mutate()}
              disabled={selectedPlan ? !selectedStep : (!selectedTraineeId || !selectedTopicId) || startSessionMutation.isPending}
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
              <Label>Training Material <span className="text-destructive">*</span></Label>
              <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select training material" />
                </SelectTrigger>
                <SelectContent>
                  {contentLibraryTopics.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                        Content Library Topics
                      </div>
                      {contentLibraryTopics.map((topic) => (
                        <SelectItem key={`topic-${topic.id}`} value={`topic-${topic.id}`}>
                          {topic.title} {topic.isAiGenerated && '(AI)'}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {trainingModules.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted mt-1">
                        Training Modules
                      </div>
                      {trainingModules.map((mod) => (
                        <SelectItem key={`module-${mod.id}`} value={`module-${mod.id}`}>
                          {mod.title}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Select from Content Library topics (from documents) or Training Modules
              </p>
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

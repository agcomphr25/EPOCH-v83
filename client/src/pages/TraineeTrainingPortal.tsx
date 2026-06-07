import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  GraduationCap,
  Lock,
  CheckCircle,
  Clock,
  Play,
  Eye,
  MessageCircle,
  HandMetal,
  ClipboardCheck,
  Award,
  Target,
  ChevronRight,
  AlertCircle,
  BookOpen,
  FileText,
  Users,
} from 'lucide-react';

interface TrainingPlan {
  id: number;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  planStructure: string | null;
  trainers?: { id: number; trainerId: number; trainerName: string; isPrimary: boolean }[];
  productionInfo?: { partNumber: string | null; department: string | null; productionLine: string | null };
  stepProgress?: { stepNumber: number; status: string; quizScore: number | null; quizPassed: boolean }[];
}

interface StepQuiz {
  id: number;
  planId: number;
  stepNumber: number;
  title: string;
  description: string | null;
  passingScore: number;
  questions: {
    id: number;
    question: string;
    questionType: string;
    options: string[];
  }[];
}

interface QuizResults {
  score: number;
  passed: boolean;
  passingScore: number;
  correctCount: number;
  totalQuestions: number;
  details: {
    questionId: number;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    explanation: string | null;
    isCorrect: boolean;
  }[];
}

interface ForkliftQuestion {
  id: string;
  question: string;
  options: string[];
}

interface ForkliftWrittenTest {
  programTitle: string;
  passingScore: number;
  questions: ForkliftQuestion[];
}

interface ForkliftWrittenResult {
  score: number;
  passed: boolean;
  passingScore: number;
  correctCount: number;
  totalQuestions: number;
  evaluation?: { id: number; status: string } | null;
}

interface ProgramAssignment {
  id: number;
  programId: number;
  employeeId: number;
  trainerId: number | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  program: {
    id: number;
    title: string;
    description: string | null;
    department: string;
    role: string;
  } | null;
  trainer: {
    id: number;
    name: string | null;
  } | null;
  tasks: {
    id: number;
    title: string;
    description: string | null;
    sortOrder: number;
    estimatedMinutes: number | null;
    dayNumber: number;
  }[];
}

const forkliftPracticalPath = [
  { title: '1. Training review', detail: 'Read the operator material in full.' },
  { title: '2. Written test', detail: 'Score at least 80% on the knowledge check.' },
  { title: '3. Practical evaluation', detail: 'Complete the mini-course observed by agrace.' },
  { title: '4. Certification record', detail: 'Receive the forklift operator badge record.' },
];

function AgcForkliftOperatorStandard() {
  const operatingRules = [
    ['Pre-use inspection', 'Complete a visual and functional inspection before operating. Do not use a truck with a safety defect. Tag it out and report it to supervision.'],
    ['Pedestrian control', 'Slow at intersections, blind corners, doorways, and aisle crossings. Sound the horn where visibility is limited and maintain separation from pedestrians.'],
    ['Speed and control', 'Operate at a speed that allows a controlled stop. Avoid abrupt starts, stops, turns, and direction changes.'],
    ['Load handling', 'Verify the load is stable, within rated capacity, and carried low with the mast tilted back as appropriate. Do not travel with an elevated load.'],
    ['Visibility', 'Look in the direction of travel. If the load blocks forward view, travel in reverse or use a spotter when conditions require it.'],
    ['Parking and shutdown', 'Park in an approved location, lower forks, neutralize controls, set the parking brake, and secure the truck before leaving it unattended.'],
  ];

  const unsafeConditions = [
    'Brake, steering, horn, lights, backup alarm, seat belt, mast, fork, tire, chain, leak, or control defects.',
    'Unstable loads, damaged pallets, obstructed aisles, wet floors, blind intersections, or pedestrian congestion.',
    'Any collision, near miss, unsafe operation, change in truck type, or changed workplace condition requiring refresher review.',
  ];

  return (
    <div className="space-y-8 text-slate-900">
      <section className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Internal AGC Operator Standard</div>
        <h3 className="text-xl font-semibold tracking-tight">Sit-Down Counterbalance Forklift Operation</h3>
        <p className="max-w-4xl text-[15px] leading-7 text-slate-700">
          AGC forklift operators are expected to operate powered industrial trucks in a controlled, deliberate, and safety-focused manner. Certification requires review of this standard, a passing written test, and a practical evaluation observed by the designated evaluator.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-md border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passing score</div>
          <div className="mt-1 text-lg font-semibold">80%</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">Minimum written-test score before practical evaluation.</p>
        </div>
        <div className="rounded-md border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">AGC refresher</div>
          <div className="mt-1 text-lg font-semibold">6 months</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">Internal refresher cadence after certification.</p>
        </div>
        <div className="rounded-md border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">OSHA evaluation</div>
          <div className="mt-1 text-lg font-semibold">3 years</div>
          <p className="mt-1 text-sm leading-6 text-slate-600">Formal operator evaluation interval under OSHA rules.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-base font-semibold">Operating Requirements</h4>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="w-56 px-4 py-3 font-semibold">Area</th>
                <th className="px-4 py-3 font-semibold">AGC expectation</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {operatingRules.map(([area, expectation]) => (
                <tr key={area} className="align-top">
                  <td className="bg-slate-50 px-4 py-3 font-medium text-slate-900">{area}</td>
                  <td className="px-4 py-3 leading-6 text-slate-700">{expectation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-base font-semibold">Conditions Requiring Stop, Report, or Refresher Review</h4>
        <ul className="space-y-2 text-sm leading-6 text-slate-700">
          {unsafeConditions.map((condition) => (
            <li key={condition} className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-4 py-3">
              {condition}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border bg-slate-50 p-4">
        <h4 className="text-base font-semibold">Practical Evaluation</h4>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          After a passing written test, agrace will observe the operator completing the practical mini-course. Required items include pre-operation inspection, seat belt and control checks, controlled travel, safe fork and load position, intersection awareness, parking and shutdown, and correct response to unsafe conditions.
        </p>
      </section>
    </div>
  );
}

const stepDescriptions = [
  { step: 1, title: "Trainer Does / Trainer Explains", icon: Eye, bgClass: "bg-blue-500", description: "Watch the trainer demonstrate while explaining the process" },
  { step: 2, title: "Trainer Does / Trainee Explains", icon: MessageCircle, bgClass: "bg-teal-500", description: "Explain back what the trainer is doing to verify understanding" },
  { step: 3, title: "Trainee Does / Trainer Coaches", icon: HandMetal, bgClass: "bg-orange-500", description: "Perform the task with trainer guidance and coaching" },
  { step: 4, title: "Trainee Does / Trainer Observes", icon: CheckCircle, bgClass: "bg-green-500", description: "Demonstrate competency with trainer observation" },
];

interface TraineeTrainingPortalProps {
  embedded?: boolean;
}

export default function TraineeTrainingPortal({ embedded = false }: TraineeTrainingPortalProps = {}) {
  const [location] = useLocation();
  const { toast } = useToast();
  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<StepQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState<QuizResults | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [forkliftDialogOpen, setForkliftDialogOpen] = useState(false);
  const [forkliftTest, setForkliftTest] = useState<ForkliftWrittenTest | null>(null);
  const [forkliftAnswers, setForkliftAnswers] = useState<Record<string, string>>({});
  const [forkliftResult, setForkliftResult] = useState<ForkliftWrittenResult | null>(null);
  const [forkliftTestType, setForkliftTestType] = useState('initial');
  const [forkliftTrainingReviewed, setForkliftTrainingReviewed] = useState(false);

  const { data: currentUser } = useQuery<{ id: number; employeeId?: number; name?: string }>({
    queryKey: ['/api/auth/session'],
  });

  const traineeId = currentUser?.employeeId || currentUser?.id || 0;

  const { data: trainingPlans = [], isLoading } = useQuery<TrainingPlan[]>({
    queryKey: ['/api/training/epoch/trainee-plans', traineeId],
    enabled: !!traineeId,
  });

  // Get program-based assignments
  const { data: programAssignments = [], isLoading: programsLoading } = useQuery<ProgramAssignment[]>({
    queryKey: ['/api/training/my-training', traineeId],
    queryFn: async () => {
      const res = await fetch(`/api/training/my-training/${traineeId}`);
      if (!res.ok) throw new Error('Failed to fetch program assignments');
      return res.json();
    },
    enabled: !!traineeId,
  });

  const canStartForkliftTest = !!traineeId && forkliftTrainingReviewed;
  const forkliftTestDisabledReason = !traineeId
    ? 'Sign in with an employee-linked account before starting the test.'
    : !forkliftTrainingReviewed
      ? 'Mark the training material reviewed to unlock the written test.'
      : null;

  const startQuizMutation = useMutation({
    mutationFn: async ({ planId, stepNumber }: { planId: number; stepNumber: number }) => {
      const response = await fetch(`/api/training/epoch/plans/${planId}/steps/${stepNumber}/quiz`);
      if (!response.ok) throw new Error('Failed to load quiz');
      return response.json();
    },
    onSuccess: (data) => {
      setSelectedQuiz(data);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizResults(null);
      setQuizDialogOpen(true);
    },
    onError: (error: any) => {
      toast({ title: 'Error loading quiz', description: error.message, variant: 'destructive' });
    },
  });

  const submitQuizMutation = useMutation({
    mutationFn: async ({ planId, stepNumber, answers }: { planId: number; stepNumber: number; answers: Record<number, string> }) => {
      return apiRequest(`/api/training/epoch/plans/${planId}/steps/${stepNumber}/quiz/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
    },
    onSuccess: (data: any) => {
      setQuizSubmitted(true);
      setQuizResults(data);
      queryClient.invalidateQueries({ queryKey: ['/api/training/epoch/trainee-plans', traineeId] });
      if (data.passed) {
        toast({ title: 'Quiz Passed!', description: `You scored ${data.score}%. Step completed.` });
      } else {
        toast({ title: 'Quiz Not Passed', description: `You scored ${data.score}%. You need ${selectedQuiz?.passingScore || 80}% to pass.`, variant: 'destructive' });
      }
    },
    onError: (error: any) => {
      toast({ title: 'Error submitting quiz', description: error.message, variant: 'destructive' });
    },
  });

  const startForkliftWrittenTestMutation = useMutation({
    mutationFn: async () => apiRequest('/api/training/forklift/written-test'),
    onSuccess: (data: ForkliftWrittenTest) => {
      setForkliftTest(data);
      setForkliftAnswers({});
      setForkliftResult(null);
      setForkliftDialogOpen(true);
    },
    onError: (error: any) => {
      toast({ title: 'Error loading forklift test', description: error.message, variant: 'destructive' });
    },
  });

  const submitForkliftWrittenTestMutation = useMutation({
    mutationFn: async () => {
      if (!forkliftTest) throw new Error('No forklift test loaded');
      return apiRequest('/api/training/forklift/written-test/submit', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: traineeId,
          testType: forkliftTestType,
          questionIds: forkliftTest.questions.map((q) => q.id),
          answers: forkliftAnswers,
        }),
      });
    },
    onSuccess: (data: ForkliftWrittenResult) => {
      setForkliftResult(data);
      toast({
        title: data.passed ? 'Forklift written test passed' : 'Forklift written test not passed',
        description: data.passed
          ? `You scored ${data.score}%. agrace now has a practical evaluation task.`
          : `You scored ${data.score}%. You need ${data.passingScore}% to continue.`,
        variant: data.passed ? 'default' : 'destructive',
      });
    },
    onError: (error: any) => {
      toast({ title: 'Error submitting forklift test', description: error.message, variant: 'destructive' });
    },
  });

  const handleStartQuiz = (planId: number, stepNumber: number) => {
    setSelectedPlanId(planId);
    startQuizMutation.mutate({ planId, stepNumber });
  };

  const handleSubmitQuiz = () => {
    if (!selectedQuiz || !selectedPlanId) return;
    submitQuizMutation.mutate({
      planId: selectedPlanId,
      stepNumber: selectedQuiz.stepNumber,
      answers: quizAnswers,
    });
  };

  const getStepStatus = (plan: TrainingPlan, stepNumber: number) => {
    const progress = plan.stepProgress?.find(p => p.stepNumber === stepNumber);
    return progress?.status || (stepNumber === 1 ? 'available' : 'locked');
  };

  const getStepQuizInfo = (plan: TrainingPlan, stepNumber: number) => {
    const progress = plan.stepProgress?.find(p => p.stepNumber === stepNumber);
    return {
      quizScore: progress?.quizScore,
      quizPassed: progress?.quizPassed || false,
    };
  };

  const calculateOverallProgress = (plan: TrainingPlan) => {
    const completedSteps = plan.stepProgress?.filter(p => p.status === 'completed').length || 0;
    return (completedSteps / 4) * 100;
  };

  if (isLoading || programsLoading) {
    return (
      <div className={embedded ? 'space-y-6' : 'container mx-auto px-4 py-8'}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Group program tasks by day
  const getTasksByDay = (assignment: ProgramAssignment) => {
    const byDay: Record<number, typeof assignment.tasks> = {};
    assignment.tasks.forEach(task => {
      const day = task.dayNumber || 1;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(task);
    });
    return byDay;
  };

  // Get today's tasks (day 1 for new assignments, calculated for ongoing)
  const getTodayDay = (assignment: ProgramAssignment) => {
    if (!assignment.startDate) return 1;
    const start = new Date(assignment.startDate);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays + 1);
  };

  return (
    <div className={embedded ? 'space-y-6' : 'container mx-auto px-4 py-8'}>
      {!embedded && (
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          Forklift Operator Training
        </h1>
        <p className="text-muted-foreground mt-2">
          Sit-down counterbalance forklift certification and practical evaluation
        </p>
      </div>
      )}

      <Tabs key={`${location}-forklift`} defaultValue="forklift" className="space-y-6">
        <TabsContent value="forklift" className="space-y-4">
          <Card className="overflow-hidden">
            <div className="border-b bg-slate-950 px-6 py-5 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-200">
                    <ClipboardCheck className="h-4 w-4" />
                    Powered Industrial Truck Training
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">Sit-Down Counterbalance Forklift Operator</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                    Review the operating standard, pass the written knowledge check, then complete a practical mini-course observed by agrace.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded-md border border-white/15 bg-white/10 px-3 py-2">
                    <div className="text-slate-300">Written</div>
                    <div className="font-semibold">80% pass</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/10 px-3 py-2">
                    <div className="text-slate-300">AGC refresh</div>
                    <div className="font-semibold">6 months</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/10 px-3 py-2">
                    <div className="text-slate-300">OSHA eval</div>
                    <div className="font-semibold">3 years</div>
                  </div>
                </div>
              </div>
            </div>
            <CardContent className="space-y-6">
              <div className="grid gap-3 border-b pb-6 pt-6 md:grid-cols-4">
                {forkliftPracticalPath.map((step) => (
                  <div key={step.title} className="border-l pl-4">
                    <div className="text-sm font-semibold text-slate-900">{step.title}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-md border bg-slate-50 p-4">
                <div className="grid gap-4 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Regulatory basis</div>
                    <div className="mt-1 font-medium text-slate-900">OSHA 29 CFR 1910.178</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment scope</div>
                    <div className="mt-1 font-medium text-slate-900">Sit-down counterbalance forklift</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Evaluator</div>
                    <div className="mt-1 font-medium text-slate-900">agrace</div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border">
                <div className="border-b bg-slate-50 px-5 py-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Training material</div>
                    <p className="text-sm text-muted-foreground">
                      Use this as the reference material for the written test and the practical mini-course.
                    </p>
                  </div>
                </div>

                <div className="max-h-[620px] overflow-y-auto bg-white px-8 py-7 selection:bg-slate-200 selection:text-slate-950">
                  <AgcForkliftOperatorStandard />
                </div>

                <div className="flex flex-col gap-3 border-t bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Review acknowledgement</div>
                    <p className="text-sm text-muted-foreground">Acknowledge this only after reviewing the material above.</p>
                  </div>
                  <Button
                    variant={forkliftTrainingReviewed ? 'default' : 'outline'}
                    onClick={() => setForkliftTrainingReviewed(true)}
                    data-testid="button-mark-forklift-training-reviewed"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {forkliftTrainingReviewed ? 'Material Reviewed' : 'I Reviewed the Material'}
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold">Step 2: Written test</div>
                    <p className="text-sm text-muted-foreground">
                      Passing score: 80%. The passing attempt creates a practical evaluation task for agrace.
                    </p>
                  </div>
                  <div className="w-full sm:w-[240px]">
                    <Label className="text-xs text-muted-foreground">Evaluation type</Label>
                    <select
                      value={forkliftTestType}
                      onChange={(event) => setForkliftTestType(event.target.value)}
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="initial">Initial certification</option>
                      <option value="agc_6_month_refresher">AGC 6-month refresher</option>
                      <option value="osha_3_year_evaluation">OSHA 3-year evaluation</option>
                      <option value="incident_refresher">Incident / near-miss refresher</option>
                    </select>
                  </div>
                  <Button
                    onClick={() => startForkliftWrittenTestMutation.mutate()}
                    disabled={startForkliftWrittenTestMutation.isPending || !canStartForkliftTest}
                    data-testid="button-start-forklift-written-test"
                  >
                    {startForkliftWrittenTestMutation.isPending ? (
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 animate-spin" />
                        Loading
                      </span>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Written Test
                      </>
                    )}
                  </Button>
                </div>
                {forkliftTestDisabledReason && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{forkliftTestDisabledReason}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Program-Based Training */}
        <TabsContent value="programs" className="space-y-4">
          {programsLoading ? (
            <div className="text-center py-8">Loading programs...</div>
          ) : programAssignments.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No Training Programs Assigned</h3>
                  <p className="text-muted-foreground">
                    Your training programs will appear here when assigned by a trainer
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {programAssignments.map((assignment) => {
                const tasksByDay = getTasksByDay(assignment);
                const todayDay = getTodayDay(assignment);
                const days = Object.keys(tasksByDay).map(Number).sort((a, b) => a - b);

                return (
                  <Card key={assignment.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {assignment.program?.title || 'Training Program'}
                            <Badge variant={assignment.status === 'completed' ? 'default' : 'secondary'}>
                              {assignment.status}
                            </Badge>
                          </CardTitle>
                          <CardDescription>{assignment.program?.description}</CardDescription>
                        </div>
                        {assignment.trainer && (
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            Trainer: {assignment.trainer.name}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Daily Tasks & Quizzes
                      </h4>
                      <div className="space-y-4">
                        {days.map((day) => (
                          <div 
                            key={day} 
                            className={`p-4 rounded-lg border ${day === todayDay ? 'border-primary bg-primary/5' : 'border-muted'}`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h5 className="font-medium flex items-center gap-2">
                                Day {day}
                                {day === todayDay && (
                                  <Badge variant="default" className="bg-primary">Today</Badge>
                                )}
                              </h5>
                              <span className="text-sm text-muted-foreground">
                                {tasksByDay[day].length} tasks
                              </span>
                            </div>
                            <div className="space-y-2">
                              {tasksByDay[day].map((task) => (
                                <div key={task.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                  <div className="flex items-center gap-2">
                                    {task.title.toLowerCase().includes('quiz') ? (
                                      <ClipboardCheck className="h-4 w-4 text-orange-500" />
                                    ) : (
                                      <FileText className="h-4 w-4 text-blue-500" />
                                    )}
                                    <span className="text-sm">{task.title}</span>
                                  </div>
                                  {task.estimatedMinutes && (
                                    <span className="text-xs text-muted-foreground">
                                      ~{task.estimatedMinutes} min
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 4-Step Training */}
        <TabsContent value="4step" className="space-y-6">
          {isLoading ? (
            <div className="text-center py-8">Loading training plans...</div>
          ) : trainingPlans.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">No 4-Step Training Assigned</h3>
                  <p className="text-muted-foreground">
                    4-step certification training will appear here when assigned
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
          {trainingPlans.map((plan) => {
            const overallProgress = calculateOverallProgress(plan);
            
            return (
              <Card key={plan.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl flex items-center gap-2">
                        {plan.title}
                        <Badge variant={overallProgress === 100 ? 'default' : 'secondary'} className={overallProgress === 100 ? 'bg-green-600' : ''}>
                          {overallProgress === 100 ? 'Completed' : 'In Progress'}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-2">{plan.description}</CardDescription>
                    </div>
                    {plan.productionInfo && (
                      <div className="text-right text-sm">
                        {plan.productionInfo.partNumber && (
                          <Badge variant="outline" className="mb-1">Part #{plan.productionInfo.partNumber}</Badge>
                        )}
                        {plan.productionInfo.productionLine && (
                          <Badge variant="outline" className="ml-1">{plan.productionInfo.productionLine}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Overall Progress</span>
                      <span className="font-medium">{Math.round(overallProgress)}%</span>
                    </div>
                    <Progress value={overallProgress} className="h-2" />
                  </div>

                  {plan.trainers && plan.trainers.length > 0 && (
                    <div className="mt-4 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Trainer(s):</span>
                      {plan.trainers.map((t, i) => (
                        <Badge key={t.id} variant={t.isPrimary ? 'default' : 'outline'}>
                          {t.trainerName} {t.isPrimary && '(Primary)'}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardHeader>
                
                <Separator />
                
                <CardContent className="pt-6">
                  <h4 className="font-semibold mb-4">4-Step Training Progress</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stepDescriptions.map((stepInfo) => {
                      const status = getStepStatus(plan, stepInfo.step);
                      const quizInfo = getStepQuizInfo(plan, stepInfo.step);
                      const StepIcon = stepInfo.icon;
                      
                      const isLocked = status === 'locked';
                      const isCompleted = status === 'completed';
                      const isAvailable = status === 'available' || status === 'in_progress';
                      
                      return (
                        <div
                          key={stepInfo.step}
                          className={`p-4 rounded-lg border-2 transition-all ${
                            isCompleted 
                              ? 'border-green-300 bg-green-50 dark:bg-green-950/30' 
                              : isAvailable 
                                ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' 
                                : 'border-gray-200 bg-gray-50 dark:bg-gray-900 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${
                              isCompleted ? 'bg-green-500' : isAvailable ? stepInfo.bgClass : 'bg-gray-400'
                            }`}>
                              {isLocked ? <Lock className="h-5 w-5" /> : isCompleted ? <CheckCircle className="h-5 w-5" /> : <StepIcon className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Step {stepInfo.step}</p>
                              <p className="text-xs text-muted-foreground">{stepInfo.title}</p>
                            </div>
                          </div>
                          
                          <p className="text-xs text-muted-foreground mb-3">{stepInfo.description}</p>
                          
                          {isCompleted && quizInfo.quizScore !== null && (
                            <div className="flex items-center gap-2 mb-3">
                              <Badge variant="default" className="bg-green-600">
                                <Award className="h-3 w-3 mr-1" />
                                Score: {quizInfo.quizScore}%
                              </Badge>
                            </div>
                          )}
                          
                          {isAvailable && !isCompleted && (
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => handleStartQuiz(plan.id, stepInfo.step)}
                              disabled={startQuizMutation.isPending}
                            >
                              <ClipboardCheck className="h-4 w-4 mr-1" />
                              Take Step {stepInfo.step} Quiz
                            </Button>
                          )}
                          
                          {isLocked && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" />
                              Complete Step {stepInfo.step - 1} first
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {overallProgress === 100 && plan.productionInfo?.partNumber && (
                    <div className="mt-6 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200">
                      <div className="flex items-center gap-3">
                        <Award className="h-8 w-8 text-green-600" />
                        <div>
                          <h4 className="font-semibold text-green-800 dark:text-green-200">Training Complete - Traveler Authorization Granted</h4>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            You are now authorized to work on Part #{plan.productionInfo.partNumber}
                            {plan.productionInfo.productionLine && ` on ${plan.productionInfo.productionLine}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={quizDialogOpen} onOpenChange={setQuizDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedQuiz && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  {selectedQuiz.title}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Answer all questions. You need {selectedQuiz.passingScore}% to pass.
                </p>
              </DialogHeader>
              
              <div className="space-y-6 py-4">
                {selectedQuiz.questions.map((question, idx) => {
                  const userAnswer = quizAnswers[question.id];
                  const resultDetail = quizSubmitted && quizResults ? quizResults.details.find(d => d.questionId === question.id) : null;
                  const isCorrect = resultDetail?.isCorrect || false;
                  const isIncorrect = quizSubmitted && resultDetail && !resultDetail.isCorrect;
                  
                  return (
                    <div key={question.id} className={`p-4 rounded-lg border ${
                      isCorrect ? 'border-green-300 bg-green-50' : isIncorrect ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}>
                      <p className="font-medium mb-3">
                        {idx + 1}. {question.question}
                      </p>
                      
                      <RadioGroup
                        value={userAnswer || ''}
                        onValueChange={(value) => setQuizAnswers(prev => ({ ...prev, [question.id]: value }))}
                        disabled={quizSubmitted}
                      >
                        {question.options.map((option, optIdx) => {
                          const isThisCorrect = quizSubmitted && resultDetail && option === resultDetail.correctAnswer;
                          const isThisSelected = userAnswer === option;
                          const isThisWrong = quizSubmitted && isThisSelected && resultDetail && option !== resultDetail.correctAnswer;
                          
                          return (
                            <div key={optIdx} className={`flex items-center space-x-2 p-2 rounded ${
                              isThisCorrect ? 'bg-green-100' : isThisWrong ? 'bg-red-100' : ''
                            }`}>
                              <RadioGroupItem value={option} id={`q${question.id}-${optIdx}`} />
                              <Label htmlFor={`q${question.id}-${optIdx}`} className="cursor-pointer flex-1">
                                {option}
                                {isThisCorrect && <CheckCircle className="h-4 w-4 inline ml-2 text-green-600" />}
                                {isThisWrong && <AlertCircle className="h-4 w-4 inline ml-2 text-red-600" />}
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                      
                      {quizSubmitted && resultDetail?.explanation && (
                        <p className="mt-2 text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {resultDetail.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              
              {quizSubmitted && quizResults && (
                <div className={`p-4 rounded-lg ${quizResults.passed ? 'bg-green-100 border-green-300' : 'bg-red-100 border-red-300'} border`}>
                  <div className="flex items-center gap-3">
                    {quizResults.passed ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : (
                      <AlertCircle className="h-8 w-8 text-red-600" />
                    )}
                    <div>
                      <h4 className={`font-semibold ${quizResults.passed ? 'text-green-800' : 'text-red-800'}`}>
                        {quizResults.passed ? 'Congratulations! You Passed!' : 'Not Passed - Try Again'}
                      </h4>
                      <p className={`text-sm ${quizResults.passed ? 'text-green-700' : 'text-red-700'}`}>
                        Your score: {quizResults.score}% (Passing: {selectedQuiz.passingScore}%)
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              <DialogFooter>
                {!quizSubmitted ? (
                  <>
                    <Button variant="outline" onClick={() => setQuizDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSubmitQuiz}
                      disabled={Object.keys(quizAnswers).length < selectedQuiz.questions.length || submitQuizMutation.isPending}
                    >
                      {submitQuizMutation.isPending ? 'Submitting...' : 'Submit Quiz'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setQuizDialogOpen(false)}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={forkliftDialogOpen} onOpenChange={setForkliftDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {forkliftTest && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-primary" />
                  {forkliftTest.programTitle} Written Test
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Questions and answer choices are randomized. You need {forkliftTest.passingScore}% to continue to the practical evaluation.
                </p>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {forkliftTest.questions.map((question, idx) => (
                  <div key={question.id} className="p-4 rounded-lg border border-gray-200">
                    <p className="font-medium mb-3">
                      {idx + 1}. {question.question}
                    </p>
                    <RadioGroup
                      value={forkliftAnswers[question.id] || ''}
                      onValueChange={(value) => setForkliftAnswers((prev) => ({ ...prev, [question.id]: value }))}
                      disabled={!!forkliftResult}
                    >
                      {question.options.map((option, optIdx) => (
                        <div key={option} className="flex items-center space-x-2 p-2 rounded">
                          <RadioGroupItem value={option} id={`forklift-${question.id}-${optIdx}`} />
                          <Label htmlFor={`forklift-${question.id}-${optIdx}`} className="cursor-pointer flex-1">
                            {option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                ))}
              </div>

              {forkliftResult && (
                <div className={`p-4 rounded-lg ${forkliftResult.passed ? 'bg-green-100 border-green-300' : 'bg-red-100 border-red-300'} border`}>
                  <div className="flex items-center gap-3">
                    {forkliftResult.passed ? (
                      <CheckCircle className="h-8 w-8 text-green-600" />
                    ) : (
                      <AlertCircle className="h-8 w-8 text-red-600" />
                    )}
                    <div>
                      <h4 className={`font-semibold ${forkliftResult.passed ? 'text-green-800' : 'text-red-800'}`}>
                        {forkliftResult.passed ? 'Written Test Passed' : 'Written Test Not Passed'}
                      </h4>
                      <p className={`text-sm ${forkliftResult.passed ? 'text-green-700' : 'text-red-700'}`}>
                        Score: {forkliftResult.score}% ({forkliftResult.correctCount}/{forkliftResult.totalQuestions} correct)
                      </p>
                      {forkliftResult.passed && (
                        <p className="text-sm text-green-700">
                          agrace now has a My Tasks item to complete your practical mini-course checklist.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <DialogFooter>
                {!forkliftResult ? (
                  <>
                    <Button variant="outline" onClick={() => setForkliftDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => submitForkliftWrittenTestMutation.mutate()}
                      disabled={
                        Object.keys(forkliftAnswers).length < forkliftTest.questions.length ||
                        submitForkliftWrittenTestMutation.isPending
                      }
                    >
                      {submitForkliftWrittenTestMutation.isPending ? 'Submitting...' : 'Submit Test'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setForkliftDialogOpen(false)}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

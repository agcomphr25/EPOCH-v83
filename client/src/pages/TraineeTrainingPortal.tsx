import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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

const stepDescriptions = [
  { step: 1, title: "Trainer Does / Trainer Explains", icon: Eye, bgClass: "bg-blue-500", description: "Watch the trainer demonstrate while explaining the process" },
  { step: 2, title: "Trainer Does / Trainee Explains", icon: MessageCircle, bgClass: "bg-teal-500", description: "Explain back what the trainer is doing to verify understanding" },
  { step: 3, title: "Trainee Does / Trainer Coaches", icon: HandMetal, bgClass: "bg-orange-500", description: "Perform the task with trainer guidance and coaching" },
  { step: 4, title: "Trainee Does / Trainer Observes", icon: CheckCircle, bgClass: "bg-green-500", description: "Demonstrate competency with trainer observation" },
];

export default function TraineeTrainingPortal() {
  const { toast } = useToast();
  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<StepQuiz | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState<QuizResults | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const { data: currentUser } = useQuery<{ id: number; employeeId?: number; name?: string }>({
    queryKey: ['/api/auth/session'],
  });

  const traineeId = currentUser?.employeeId || currentUser?.id || 0;

  const { data: trainingPlans = [], isLoading } = useQuery<TrainingPlan[]>({
    queryKey: ['/api/training/epoch/trainee-plans', traineeId],
    enabled: !!traineeId,
  });

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

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <GraduationCap className="h-8 w-8 text-primary" />
          My Training Programs
        </h1>
        <p className="text-muted-foreground mt-2">
          Complete your 4-step training programs and pass the quizzes to earn certifications
        </p>
      </div>

      {trainingPlans.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Training Programs Assigned</h3>
              <p className="text-muted-foreground">
                Your training programs will appear here when assigned by a trainer
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
    </div>
  );
}

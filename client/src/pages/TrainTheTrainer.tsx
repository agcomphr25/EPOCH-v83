import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  GraduationCap,
  Users,
  Target,
  Heart,
  Shield,
  AlertTriangle,
  Check,
  X,
  Lightbulb,
  MessageCircle,
  Eye,
  HandMetal,
  Award,
  Star,
  ClipboardCheck,
  RefreshCw,
  Play,
  Database,
  Download,
} from 'lucide-react';

const trainerQuizQuestions = [
  {
    id: 1,
    question: "In Step 1 of the 4-Step Training Model, who performs the task?",
    options: ["A. Trainee performs, trainer watches", "B. Trainer performs and explains", "C. Both perform together", "D. Neither - it's theory only"],
    answer: "B",
    category: "4-Step Model"
  },
  {
    id: 2,
    question: "What does the 'S' stand for in the S-O-A coaching model?",
    options: ["A. Safety", "B. Standard", "C. Strength", "D. Supervision"],
    answer: "C",
    category: "S-O-A Coaching"
  },
  {
    id: 3,
    question: "Which step verifies trainee comprehension BEFORE hands-on execution?",
    options: ["A. Step 1", "B. Step 2", "C. Step 3", "D. Step 4"],
    answer: "B",
    category: "4-Step Model"
  },
  {
    id: 4,
    question: "What should a trainer do if a trainee cannot explain a critical point in Step 2?",
    options: ["A. Move forward anyway", "B. Skip to Step 4", "C. Return to Step 1", "D. End the training session"],
    answer: "C",
    category: "4-Step Model"
  },
  {
    id: 5,
    question: "Which of the following is a PROHIBITED behavior during training?",
    options: ["A. Immediate feedback", "B. Public embarrassment", "C. Hip-to-hip shadowing", "D. Asking questions"],
    answer: "B",
    category: "Prohibited Behaviors"
  },
  {
    id: 6,
    question: "In the S-O-A model, how should mistakes be framed?",
    options: ["A. As failures requiring discipline", "B. As learning opportunities", "C. As reasons for termination", "D. As weaknesses to eliminate"],
    answer: "B",
    category: "S-O-A Coaching"
  },
  {
    id: 7,
    question: "In Step 3, the trainer's role is to:",
    options: ["A. Only observe without intervention", "B. Do the task while trainee watches", "C. Coach and intervene to prevent errors", "D. Leave the trainee alone"],
    answer: "C",
    category: "4-Step Model"
  },
  {
    id: 8,
    question: "When is Task Competency considered achieved?",
    options: ["A. After Step 1 is complete", "B. After Step 2 is complete", "C. After Step 3 is complete", "D. After successful Step 4 completion"],
    answer: "D",
    category: "4-Step Model"
  },
  {
    id: 9,
    question: "What is the key difference between Teaching and Coaching?",
    options: ["A. Teaching develops judgment, coaching gives answers", "B. Teaching gives answers, coaching develops judgment", "C. They are the same thing", "D. Teaching is for adults, coaching is for children"],
    answer: "B",
    category: "Coaching Fundamentals"
  },
  {
    id: 10,
    question: "Which phrase represents proper S-O-A feedback?",
    options: ["A. 'You're doing this wrong'", "B. 'Figure it out yourself'", "C. 'Your prep was spot-on. One opportunity is checking orientation earlier.'", "D. 'That's a mistake you should know better'"],
    answer: "C",
    category: "S-O-A Coaching"
  },
  {
    id: 11,
    question: "What is the goal of this training approach?",
    options: ["A. Compliance through pressure", "B. Competence with confidence", "C. Speed over accuracy", "D. Individual work without supervision"],
    answer: "B",
    category: "Philosophy"
  },
  {
    id: 12,
    question: "If a trainee repeats errors during training, what should the trainer do?",
    options: ["A. Raise their voice to emphasize importance", "B. Pause, return to earlier step, document, escalate without judgment", "C. End the training immediately", "D. Publicly correct them in front of peers"],
    answer: "B",
    category: "Escalation"
  },
];

const stepData = [
  {
    step: 1,
    title: "Trainer Does / Trainer Explains",
    objective: "Introduce the task and establish correct mental models.",
    color: "blue",
    trainerDuties: [
      "Perform the task at normal production pace",
      "Verbally explain what is being done and why it matters",
      "Explain how it impacts quality, safety, or downstream departments",
      "Explicitly identify Critical Points",
      "Identify who to contact if something is abnormal",
      "Explain where documentation, tools, or materials come from",
    ],
    traineeDuties: [
      "Observe without interruption",
      "Ask clarifying questions after the task completes",
      "Listen for critical points and failure modes",
    ],
    note: "No hands-on work by trainee in this step",
  },
  {
    step: 2,
    title: "Trainer Does / Trainee Explains",
    objective: "Verify comprehension before hands-on execution.",
    color: "teal",
    trainerDuties: [
      "Perform the task again",
      "Pause at critical steps",
      'Ask targeted questions: "What could go wrong here?"',
      '"What spec or WI applies?"',
      '"What would you do if X is out of tolerance?"',
    ],
    traineeDuties: [
      "Verbally explain each step while the trainer performs it",
      "Answer critical-point questions",
      "Identify risks, controls, and escalation paths",
    ],
    note: "If trainee cannot explain a critical point → return to Step 1",
  },
  {
    step: 3,
    title: "Trainee Does / Trainer Coaches",
    objective: "Build confidence while preventing bad habits.",
    color: "orange",
    trainerDuties: [
      "Stay hip-to-hip with trainee",
      "Allow trainee to perform the task",
      "Intervene only to prevent errors",
      "Reinforce critical points",
      "Correct technique immediately",
    ],
    traineeDuties: [
      "Perform the task fully",
      "Talk through the steps if needed",
      "Ask questions in real time",
      "Accept coaching and correction",
    ],
    note: "Trainer remains part of the process",
  },
  {
    step: 4,
    title: "Trainee Does / Trainer Observes",
    objective: "Validate independent competence.",
    color: "green",
    trainerDuties: [
      "Observe without intervention",
      "Confirm proper sequence",
      "Verify correct use of tools",
      "Check adherence to work instructions",
      "Validate recognition of critical points",
    ],
    traineeDuties: [
      "Perform the task independently",
      "Demonstrate confidence and consistency",
      "Show correct judgment at decision points",
    ],
    note: "Successful completion = Task Competency Achieved",
  },
];

const approvedPhrases = [
  "Good catch.",
  "That's exactly what we want.",
  "Pause here — what's the next critical point?",
  "You're on the right track — what happens if that spec is missed?",
  "Your material prep was spot-on.",
  "One opportunity is checking orientation earlier to avoid rework.",
  "You're doing this part exactly right — let's build on that.",
  "This is an opportunity to tighten the process.",
];

const prohibitedBehaviors = [
  "Yelling or raised voice",
  "Public embarrassment",
  "Sarcasm or ridicule",
  '"Figure it out" responses',
  "Leaving trainee unsupervised before Step 4",
  "Skipping steps to save time",
  "Comparing to other employees",
  "Expressing frustration physically or verbally",
];

export default function TrainTheTrainer() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [quizStarted, setQuizStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [quizComplete, setQuizComplete] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  const { data: heliumStatus } = useQuery({
    queryKey: ['/api/training/helium/status'],
    refetchInterval: false,
  });

  const importMutation = useMutation({
    mutationFn: () => apiRequest('/api/training/helium/import/all', { method: 'POST' }),
    onSuccess: (data: any) => {
      toast({
        title: 'Import Complete',
        description: `Imported ${data.modules?.imported || 0} modules and ${data.matrix?.imported || 0} matrix entries`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/matrix'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleStartQuiz = () => {
    setQuizStarted(true);
    setCurrentQuestion(0);
    setAnswers({});
    setQuizComplete(false);
    setQuizScore(0);
  };

  const handleAnswer = (answer: string) => {
    setAnswers({ ...answers, [currentQuestion]: answer });
  };

  const handleNext = () => {
    if (currentQuestion < trainerQuizQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      let correct = 0;
      trainerQuizQuestions.forEach((q, i) => {
        if (answers[i] === q.answer) correct++;
      });
      setQuizScore(correct);
      setQuizComplete(true);
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const passPercentage = Math.round((quizScore / trainerQuizQuestions.length) * 100);
  const passed = passPercentage >= 80;

  const renderOverview = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Train-the-Trainer Program
          </CardTitle>
          <CardDescription>
            Build competence with confidence using the 4-Step Competency Method and S-O-A coaching framework
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Target className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="font-semibold">4-Step Method</p>
                    <p className="text-sm text-muted-foreground">Structured competency training</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-green-50 dark:bg-green-950/30 border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Heart className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-semibold">S-O-A Coaching</p>
                    <p className="text-sm text-muted-foreground">Strength-first feedback</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 dark:bg-purple-950/30 border-purple-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Award className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="font-semibold">Competency</p>
                    <p className="text-sm text-muted-foreground">Verified skill validation</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Lightbulb className="h-4 w-4" />
            <AlertTitle>Training Philosophy</AlertTitle>
            <AlertDescription>
              Our goal is <strong>Competence with Confidence</strong>. We believe every employee can excel 
              when given proper instruction, patient coaching, and a safe environment to learn.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {heliumStatus?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Helium Database Import
            </CardTitle>
            <CardDescription>
              Import training data from your external system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm">
                  <Badge variant="outline" className="mr-2">Connected</Badge>
                  {heliumStatus.moduleCount} modules, {heliumStatus.matrixCount} matrix entries available
                </p>
              </div>
              <Button 
                onClick={() => importMutation.mutate()}
                disabled={importMutation.isPending}
              >
                <Download className="h-4 w-4 mr-2" />
                {importMutation.isPending ? 'Importing...' : 'Import All'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderFourStepMethod = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>The 4-Step Competency Training Method</CardTitle>
          <CardDescription>
            A proven approach to developing skilled, confident employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {stepData.map((step) => (
              <Card key={step.step} className={`border-l-4 border-l-${step.color}-500`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-${step.color}-100 dark:bg-${step.color}-900 flex items-center justify-center font-bold text-${step.color}-700 dark:text-${step.color}-300`}>
                      {step.step}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{step.title}</CardTitle>
                      <CardDescription>{step.objective}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <Users className="h-4 w-4" /> Trainer Duties
                      </p>
                      <ul className="text-sm space-y-1">
                        {step.trainerDuties.map((duty, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            {duty}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" /> Trainee Duties
                      </p>
                      <ul className="text-sm space-y-1">
                        {step.traineeDuties.map((duty, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Check className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            {duty}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  {step.note && (
                    <Alert className="mt-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="font-medium">{step.note}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderSOACoaching = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-green-500" />
            S-O-A Coaching Framework
          </CardTitle>
          <CardDescription>
            Strength-first, positive coaching that develops competence and confidence
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="bg-green-50 dark:bg-green-950/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-green-600" />
                  S - Strength
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Start by acknowledging what the trainee did well. This builds trust and receptivity.
                </p>
                <div className="bg-white dark:bg-gray-900 p-3 rounded text-sm italic">
                  "Your material prep was spot-on."
                </div>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50 dark:bg-yellow-950/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-600" />
                  O - Opportunity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Frame areas for improvement as opportunities, not failures. Focus on process, not person.
                </p>
                <div className="bg-white dark:bg-gray-900 p-3 rounded text-sm italic">
                  "One opportunity is checking orientation earlier to avoid rework."
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-50 dark:bg-blue-950/30">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  A - Action
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Collaborate on a specific, actionable next step. Make it concrete and achievable.
                </p>
                <div className="bg-white dark:bg-gray-900 p-3 rounded text-sm italic">
                  "Let's add an orientation check to your prep routine."
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Approved Coaching Phrases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-2">
                {approvedPhrases.map((phrase, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-green-50 dark:bg-green-950/30 rounded">
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                    {phrase}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-red-600">
                <Shield className="h-5 w-5" />
                Prohibited Behaviors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-2">
                {prohibitedBehaviors.map((behavior, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm p-2 bg-red-50 dark:bg-red-950/30 rounded">
                    <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                    {behavior}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );

  const renderQuiz = () => {
    if (!quizStarted) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Trainer Certification Quiz
            </CardTitle>
            <CardDescription>
              Complete this quiz to demonstrate understanding of the train-the-trainer methodology.
              You need 80% to pass.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <GraduationCap className="h-16 w-16 mx-auto text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Ready to Test Your Knowledge?</h3>
              <p className="text-muted-foreground mb-6">
                {trainerQuizQuestions.length} questions covering the 4-Step Method, S-O-A Coaching, and best practices.
              </p>
              <Button size="lg" onClick={handleStartQuiz}>
                <Play className="h-4 w-4 mr-2" />
                Start Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (quizComplete) {
      return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {passed ? (
                <Award className="h-5 w-5 text-green-500" />
              ) : (
                <RefreshCw className="h-5 w-5 text-orange-500" />
              )}
              Quiz Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center text-4xl font-bold mb-4 ${
                passed ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
              }`}>
                {passPercentage}%
              </div>
              <h3 className="text-xl font-semibold mb-2">
                {passed ? 'Congratulations! You Passed!' : 'Almost There!'}
              </h3>
              <p className="text-muted-foreground mb-2">
                You got {quizScore} out of {trainerQuizQuestions.length} questions correct.
              </p>
              {passed ? (
                <p className="text-green-600 mb-6">
                  You have demonstrated understanding of the train-the-trainer methodology.
                </p>
              ) : (
                <p className="text-orange-600 mb-6">
                  Review the material and try again. You need 80% to pass.
                </p>
              )}
              <Button onClick={handleStartQuiz}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retake Quiz
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }

    const question = trainerQuizQuestions[currentQuestion];
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="outline" className="mb-2">{question.category}</Badge>
              <CardTitle className="text-lg">Question {currentQuestion + 1} of {trainerQuizQuestions.length}</CardTitle>
            </div>
            <div className="text-right">
              <Progress value={((currentQuestion + 1) / trainerQuizQuestions.length) * 100} className="w-32" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-lg">{question.question}</p>
          
          <RadioGroup 
            value={answers[currentQuestion] || ''} 
            onValueChange={handleAnswer}
            className="space-y-3"
          >
            {question.options.map((option, i) => (
              <div key={i} className="flex items-center space-x-3 p-3 rounded border hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value={option.charAt(0)} id={`q${currentQuestion}-${i}`} />
                <Label htmlFor={`q${currentQuestion}-${i}`} className="cursor-pointer flex-1">
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <div className="flex justify-between">
            <Button variant="outline" onClick={handlePrev} disabled={currentQuestion === 0}>
              Previous
            </Button>
            <Button onClick={handleNext} disabled={!answers[currentQuestion]}>
              {currentQuestion === trainerQuizQuestions.length - 1 ? 'Submit' : 'Next'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="4-step">4-Step Method</TabsTrigger>
          <TabsTrigger value="soa">S-O-A Coaching</TabsTrigger>
          <TabsTrigger value="quiz">Certification</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{renderOverview()}</TabsContent>
        <TabsContent value="4-step">{renderFourStepMethod()}</TabsContent>
        <TabsContent value="soa">{renderSOACoaching()}</TabsContent>
        <TabsContent value="quiz">{renderQuiz()}</TabsContent>
      </Tabs>
    </div>
  );
}

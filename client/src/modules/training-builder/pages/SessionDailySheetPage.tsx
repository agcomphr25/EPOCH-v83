import { useParams } from 'wouter';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowLeft, Calendar, CheckCircle, Clock, User, AlertTriangle, ShieldAlert, BookOpen, Target, Lightbulb } from 'lucide-react';

interface WorkInstruction {
  id: number;
  title: string;
  department: string;
  documentNumber?: string;
  objective?: string;
  ppeRequired?: string[];
  tools?: string[];
  steps?: {
    stepNumber: number;
    instruction: string;
    criticalPoint?: string;
    safetyNote?: string;
  }[];
  criticalPoints?: string[];
  safetyConsiderations?: string[];
  qualityCheckpoints?: string[];
  trainingStep?: number;
  stepDescription?: string;
}

interface Task {
  id: number;
  name: string;
  description?: string;
  dayNumber?: number;
  workInstructions: WorkInstruction[];
}

interface SessionWorkInstructionsResponse {
  session: any;
  assignment: any;
  tasks: Task[];
  dailyReflection: {
    criticalPoints: { task: string; points: string[] }[];
    safetyConsiderations: { task: string; considerations: string[] }[];
  };
}

const STEP_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Trainer Does / Trainer Explains', color: 'bg-blue-100 text-blue-800' },
  2: { label: 'Trainer Does / Trainee Explains', color: 'bg-purple-100 text-purple-800' },
  3: { label: 'Trainee Does / Trainer Coaches', color: 'bg-amber-100 text-amber-800' },
  4: { label: 'Trainee Does / Trainer Observes', color: 'bg-green-100 text-green-800' },
};

export default function SessionDailySheetPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: sessionData, isLoading } = useQuery<SessionWorkInstructionsResponse>({
    queryKey: ['/api/training/sessions', sessionId, 'work-instructions'],
    queryFn: async () => {
      const res = await fetch(`/api/training/sessions/${sessionId}/work-instructions`);
      if (!res.ok) throw new Error('Failed to fetch session data');
      return res.json();
    },
    enabled: !!sessionId,
  });

  const groupedByDay = sessionData?.tasks.reduce((acc, task) => {
    const day = task.dayNumber || 1;
    if (!acc[day]) acc[day] = [];
    acc[day].push(task);
    return acc;
  }, {} as Record<number, Task[]>) || {};

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
            <h1 className="text-3xl font-bold tracking-tight">Training Session Daily Sheet</h1>
            <p className="text-muted-foreground">
              Session ID: {sessionId}
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{new Date().toLocaleDateString()}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Tasks Today
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{sessionData?.tasks.length || 0}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Work Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {sessionData?.tasks.reduce((acc, t) => acc + t.workInstructions.length, 0) || 0}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Critical Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {sessionData?.dailyReflection.criticalPoints.reduce((acc, c) => acc + c.points.length, 0) || 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Daily Reflection Summary - Critical Points & Safety */}
          {sessionData && (sessionData.dailyReflection.criticalPoints.length > 0 || sessionData.dailyReflection.safetyConsiderations.length > 0) && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-800">
                  <Lightbulb className="h-5 w-5" />
                  Daily Reflection - Critical Points to Remember
                </CardTitle>
                <CardDescription className="text-amber-700">
                  Review these key points throughout the training day
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {sessionData.dailyReflection.criticalPoints.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Critical Quality Points
                    </h4>
                    <div className="space-y-2">
                      {sessionData.dailyReflection.criticalPoints.map((cp, idx) => (
                        <div key={idx} className="bg-white rounded-lg p-3 border border-amber-200">
                          <p className="font-medium text-amber-800">{cp.task}</p>
                          <ul className="list-disc list-inside mt-1 text-sm text-amber-700 space-y-1">
                            {cp.points.map((point, pIdx) => (
                              <li key={pIdx}>{point}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {sessionData.dailyReflection.safetyConsiderations.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4" />
                      Safety Considerations
                    </h4>
                    <div className="space-y-2">
                      {sessionData.dailyReflection.safetyConsiderations.map((sc, idx) => (
                        <div key={idx} className="bg-red-50 rounded-lg p-3 border border-red-200">
                          <p className="font-medium text-red-800">{sc.task}</p>
                          <ul className="list-disc list-inside mt-1 text-sm text-red-700 space-y-1">
                            {sc.considerations.map((consideration, cIdx) => (
                              <li key={cIdx}>{consideration}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Tasks with Work Instructions by Day */}
          {Object.keys(groupedByDay).length > 0 ? (
            Object.entries(groupedByDay).sort(([a], [b]) => Number(a) - Number(b)).map(([day, tasks]) => (
              <Card key={day}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Day {day} Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {tasks.map((task) => (
                      <AccordionItem key={task.id} value={`task-${task.id}`}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3">
                            <CheckCircle className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{task.name}</span>
                            {task.workInstructions.length > 0 && (
                              <Badge variant="secondary" className="ml-2">
                                {task.workInstructions.length} WI
                              </Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pl-7">
                            {task.description && (
                              <p className="text-sm text-muted-foreground">{task.description}</p>
                            )}
                            
                            {task.workInstructions.length > 0 ? (
                              <div className="space-y-4">
                                {task.workInstructions.map((wi) => (
                                  <Card key={wi.id} className="border-l-4 border-l-primary">
                                    <CardHeader className="pb-2">
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <CardTitle className="text-base">{wi.title}</CardTitle>
                                          {wi.documentNumber && (
                                            <p className="text-xs text-muted-foreground">{wi.documentNumber}</p>
                                          )}
                                        </div>
                                        {wi.trainingStep && STEP_LABELS[wi.trainingStep] && (
                                          <Badge className={STEP_LABELS[wi.trainingStep].color}>
                                            Step {wi.trainingStep}: {STEP_LABELS[wi.trainingStep].label}
                                          </Badge>
                                        )}
                                      </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      {wi.objective && (
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground uppercase">Objective</p>
                                          <p className="text-sm">{wi.objective}</p>
                                        </div>
                                      )}
                                      
                                      {wi.ppeRequired && wi.ppeRequired.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                                            <ShieldAlert className="h-3 w-3" /> PPE Required
                                          </p>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {wi.ppeRequired.map((ppe, idx) => (
                                              <Badge key={idx} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                                {ppe}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {wi.steps && wi.steps.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Steps</p>
                                          <ol className="space-y-2">
                                            {wi.steps.map((step) => (
                                              <li key={step.stepNumber} className="text-sm border-l-2 border-muted pl-3 py-1">
                                                <p className="font-medium">
                                                  {step.stepNumber}. {step.instruction}
                                                </p>
                                                {step.criticalPoint && (
                                                  <p className="text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1 text-xs flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    <strong>Critical:</strong> {step.criticalPoint}
                                                  </p>
                                                )}
                                                {step.safetyNote && (
                                                  <p className="text-red-700 bg-red-50 rounded px-2 py-1 mt-1 text-xs flex items-center gap-1">
                                                    <ShieldAlert className="h-3 w-3" />
                                                    <strong>Safety:</strong> {step.safetyNote}
                                                  </p>
                                                )}
                                              </li>
                                            ))}
                                          </ol>
                                        </div>
                                      )}
                                      
                                      {wi.qualityCheckpoints && wi.qualityCheckpoints.length > 0 && (
                                        <div>
                                          <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                                            <CheckCircle className="h-3 w-3" /> Quality Checkpoints
                                          </p>
                                          <ul className="list-disc list-inside text-sm mt-1 text-green-700">
                                            {wi.qualityCheckpoints.map((qc, idx) => (
                                              <li key={idx}>{qc}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                No work instructions linked to this task
                              </p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No tasks found for this session. Please ensure the training program has tasks assigned.
              </CardContent>
            </Card>
          )}

          {/* Session Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Session Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea 
                className="w-full p-3 border rounded-md min-h-[150px]"
                placeholder="Enter session notes..."
              />
              <div className="flex justify-end mt-4">
                <Button>Save Notes</Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

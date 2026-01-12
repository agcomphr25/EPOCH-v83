import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, HelpCircle, CheckCircle, XCircle, GraduationCap } from 'lucide-react';

interface QuizQuestion {
  id: number;
  quizId: number;
  questionText: string;
  questionType: string;
  options: string[] | null;
  correctAnswer: string;
  explanation: string | null;
  points: number;
  sortOrder: number;
}

interface Quiz {
  id: number;
  title: string;
  description: string | null;
  programId: number | null;
  taskId: number | null;
  passingScore: number;
  maxAttempts: number;
  timeLimitMinutes: number | null;
  isActive: boolean;
  questions?: QuizQuestion[];
}

export default function QuizManagementPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null);
  const [isQuestionOpen, setIsQuestionOpen] = useState(false);
  const [newQuiz, setNewQuiz] = useState({ title: '', description: '', passingScore: 80, maxAttempts: 3 });
  const [newQuestion, setNewQuestion] = useState({
    questionText: '',
    questionType: 'multiple_choice',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
    points: 1
  });

  const { data: quizzes = [], isLoading } = useQuery<Quiz[]>({
    queryKey: ['/api/training/quizzes'],
  });

  const { data: quizWithQuestions } = useQuery<Quiz>({
    queryKey: ['/api/training/quizzes', selectedQuiz?.id],
    enabled: !!selectedQuiz?.id,
  });

  const createQuizMutation = useMutation({
    mutationFn: (data: typeof newQuiz) => apiRequest('/api/training/quizzes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/quizzes'] });
      setIsCreateOpen(false);
      setNewQuiz({ title: '', description: '', passingScore: 80, maxAttempts: 3 });
      toast({ title: 'Quiz created successfully' });
    },
    onError: () => toast({ title: 'Failed to create quiz', variant: 'destructive' }),
  });

  const deleteQuizMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/training/quizzes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/quizzes'] });
      setSelectedQuiz(null);
      toast({ title: 'Quiz deleted' });
    },
  });

  const addQuestionMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/training/quizzes/${selectedQuiz?.id}/questions`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/quizzes', selectedQuiz?.id] });
      setIsQuestionOpen(false);
      setNewQuestion({ questionText: '', questionType: 'multiple_choice', options: ['', '', '', ''], correctAnswer: '', explanation: '', points: 1 });
      toast({ title: 'Question added' });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: number) => apiRequest(`/api/training/quizzes/${selectedQuiz?.id}/questions/${questionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/quizzes', selectedQuiz?.id] });
      toast({ title: 'Question deleted' });
    },
  });

  const handleCreateQuiz = () => {
    if (!newQuiz.title.trim()) {
      toast({ title: 'Please enter a quiz title', variant: 'destructive' });
      return;
    }
    createQuizMutation.mutate(newQuiz);
  };

  const handleAddQuestion = () => {
    if (!newQuestion.questionText.trim() || !newQuestion.correctAnswer.trim()) {
      toast({ title: 'Please fill in required fields', variant: 'destructive' });
      return;
    }
    const questionData = {
      ...newQuestion,
      options: newQuestion.questionType === 'multiple_choice' ? newQuestion.options.filter(o => o.trim()) : null,
    };
    addQuestionMutation.mutate(questionData);
  };

  if (isLoading) {
    return <div className="p-6 text-center">Loading quizzes...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6" />
            Quiz Management
          </h1>
          <p className="text-muted-foreground">Create and manage competency quizzes for training programs</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Create Quiz</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Quiz</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Quiz Title</Label>
                <Input value={newQuiz.title} onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })} placeholder="e.g., Safety Fundamentals" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={newQuiz.description} onChange={(e) => setNewQuiz({ ...newQuiz, description: e.target.value })} placeholder="Quiz description..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Passing Score (%)</Label>
                  <Input type="number" min={0} max={100} value={newQuiz.passingScore} onChange={(e) => setNewQuiz({ ...newQuiz, passingScore: parseInt(e.target.value) || 80 })} />
                </div>
                <div>
                  <Label>Max Attempts</Label>
                  <Input type="number" min={1} value={newQuiz.maxAttempts} onChange={(e) => setNewQuiz({ ...newQuiz, maxAttempts: parseInt(e.target.value) || 3 })} />
                </div>
              </div>
              <Button onClick={handleCreateQuiz} disabled={createQuizMutation.isPending} className="w-full">
                {createQuizMutation.isPending ? 'Creating...' : 'Create Quiz'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Available Quizzes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {quizzes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No quizzes created yet</p>
              ) : (
                quizzes.map((quiz) => (
                  <div
                    key={quiz.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedQuiz?.id === quiz.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                    onClick={() => setSelectedQuiz(quiz)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium">{quiz.title}</p>
                        <p className="text-sm text-muted-foreground">Pass: {quiz.passingScore}%</p>
                      </div>
                      <Badge variant={quiz.isActive ? 'default' : 'secondary'}>
                        {quiz.isActive ? 'Active' : 'Draft'}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {selectedQuiz ? (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{selectedQuiz.title}</CardTitle>
                    <CardDescription>{selectedQuiz.description || 'No description'}</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={isQuestionOpen} onOpenChange={setIsQuestionOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm"><Plus className="h-4 w-4 mr-1" />Add Question</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Add Question</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                          <div>
                            <Label>Question Type</Label>
                            <Select value={newQuestion.questionType} onValueChange={(v) => setNewQuestion({ ...newQuestion, questionType: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                                <SelectItem value="true_false">True/False</SelectItem>
                                <SelectItem value="short_answer">Short Answer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Question Text</Label>
                            <Textarea value={newQuestion.questionText} onChange={(e) => setNewQuestion({ ...newQuestion, questionText: e.target.value })} placeholder="Enter your question..." />
                          </div>
                          {newQuestion.questionType === 'multiple_choice' && (
                            <div className="space-y-2">
                              <Label>Options</Label>
                              {newQuestion.options.map((opt, idx) => (
                                <Input key={idx} value={opt} onChange={(e) => {
                                  const opts = [...newQuestion.options];
                                  opts[idx] = e.target.value;
                                  setNewQuestion({ ...newQuestion, options: opts });
                                }} placeholder={`Option ${idx + 1}`} />
                              ))}
                            </div>
                          )}
                          {newQuestion.questionType === 'true_false' && (
                            <div>
                              <Label>Correct Answer</Label>
                              <Select value={newQuestion.correctAnswer} onValueChange={(v) => setNewQuestion({ ...newQuestion, correctAnswer: v })}>
                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="True">True</SelectItem>
                                  <SelectItem value="False">False</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {newQuestion.questionType !== 'true_false' && (
                            <div>
                              <Label>Correct Answer</Label>
                              <Input value={newQuestion.correctAnswer} onChange={(e) => setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })} placeholder="Enter the correct answer" />
                            </div>
                          )}
                          <div>
                            <Label>Explanation (optional)</Label>
                            <Textarea value={newQuestion.explanation} onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })} placeholder="Explain why this is the correct answer..." />
                          </div>
                          <div>
                            <Label>Points</Label>
                            <Input type="number" min={1} value={newQuestion.points} onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) || 1 })} />
                          </div>
                          <Button onClick={handleAddQuestion} disabled={addQuestionMutation.isPending} className="w-full">
                            {addQuestionMutation.isPending ? 'Adding...' : 'Add Question'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => deleteQuizMutation.mutate(selectedQuiz.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                  <span>Passing: {selectedQuiz.passingScore}%</span>
                  <span>Max Attempts: {selectedQuiz.maxAttempts}</span>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Questions ({quizWithQuestions?.questions?.length || 0})
                </h3>
                <div className="space-y-3">
                  {quizWithQuestions?.questions?.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No questions added yet</p>
                  ) : (
                    quizWithQuestions?.questions?.map((q, idx) => (
                      <div key={q.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">Q{idx + 1}.</span>
                              <Badge variant="outline" className="text-xs">{q.questionType.replace('_', ' ')}</Badge>
                              <Badge variant="secondary" className="text-xs">{q.points} pt{q.points !== 1 ? 's' : ''}</Badge>
                            </div>
                            <p>{q.questionText}</p>
                            {q.options && (
                              <div className="mt-2 space-y-1">
                                {q.options.map((opt, i) => (
                                  <div key={i} className={`text-sm flex items-center gap-2 ${opt === q.correctAnswer ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                                    {opt === q.correctAnswer ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3 opacity-30" />}
                                    {opt}
                                  </div>
                                ))}
                              </div>
                            )}
                            {q.explanation && <p className="text-sm text-muted-foreground mt-2 italic">Explanation: {q.explanation}</p>}
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => deleteQuestionMutation.mutate(q.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a quiz to view and manage its questions</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

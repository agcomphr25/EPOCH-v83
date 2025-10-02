import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Save, X, ChevronDown, ChevronRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";

const moduleFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  pdfUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  passingScore: z.coerce.number().min(0).max(100).default(80),
  isActive: z.boolean().default(true),
});

const questionFormSchema = z.object({
  moduleId: z.number(),
  question: z.string().min(1, "Question is required"),
  questionType: z.enum(["multiple_choice", "true_false"]).default("multiple_choice"),
  correctAnswer: z.string().min(1, "Correct answer is required"),
  explanation: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
  isActive: z.boolean().default(true),
});

const answerFormSchema = z.object({
  questionId: z.number(),
  answerText: z.string().min(1, "Answer text is required"),
  isCorrect: z.boolean().default(false),
  sortOrder: z.coerce.number().default(0),
});

export default function TrainingAdmin() {
  const { toast } = useToast();
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [selectedModuleForQuestion, setSelectedModuleForQuestion] = useState<number | null>(null);
  const [selectedQuestionForAnswer, setSelectedQuestionForAnswer] = useState<number | null>(null);
  const [editingModule, setEditingModule] = useState<any>(null);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);
  const [editingAnswer, setEditingAnswer] = useState<any>(null);

  const { data: modules = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/training/modules", "admin"],
    queryFn: async () => {
      const response = await fetch("/api/training/modules?admin=true", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch modules");
      return response.json();
    },
  });

  const createModuleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof moduleFormSchema>) => {
      return apiRequest("/api/training/modules", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Module created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create module", variant: "destructive" });
    },
  });

  const createQuestionMutation = useMutation({
    mutationFn: async (data: z.infer<typeof questionFormSchema>) => {
      return apiRequest("/api/training/questions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Question created successfully" });
      setSelectedModuleForQuestion(null);
    },
    onError: () => {
      toast({ title: "Failed to create question", variant: "destructive" });
    },
  });

  const createAnswerMutation = useMutation({
    mutationFn: async (data: z.infer<typeof answerFormSchema>) => {
      return apiRequest("/api/training/answers", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Answer created successfully" });
      setSelectedQuestionForAnswer(null);
    },
    onError: () => {
      toast({ title: "Failed to create answer", variant: "destructive" });
    },
  });

  const updateModuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof moduleFormSchema> }) => {
      return apiRequest(`/api/training/modules/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Module updated successfully" });
      setEditingModule(null);
    },
    onError: () => {
      toast({ title: "Failed to update module", variant: "destructive" });
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof questionFormSchema> }) => {
      return apiRequest(`/api/training/questions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Question updated successfully" });
      setEditingQuestion(null);
    },
    onError: () => {
      toast({ title: "Failed to update question", variant: "destructive" });
    },
  });

  const updateAnswerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: z.infer<typeof answerFormSchema> }) => {
      return apiRequest(`/api/training/answers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Answer updated successfully" });
      setEditingAnswer(null);
    },
    onError: () => {
      toast({ title: "Failed to update answer", variant: "destructive" });
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/modules/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Module deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete module", variant: "destructive" });
    },
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/questions/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Question deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete question", variant: "destructive" });
    },
  });

  const deleteAnswerMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/answers/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/modules"] });
      toast({ title: "Answer deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete answer", variant: "destructive" });
    },
  });

  const toggleModule = (moduleId: number) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const toggleQuestion = (questionId: number) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-admin-title">Training Module Admin</h1>
          <p className="text-gray-600">Create and manage training modules, quizzes, and certifications</p>
        </div>
        <ModuleDialog
          onSubmit={(data) => createModuleMutation.mutate(data)}
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8">Loading modules...</div>
      ) : modules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No training modules yet. Create your first module to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((module: any) => (
            <Card key={module.id} className={!module.isActive ? 'opacity-60 bg-gray-50' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleModule(module.id)}
                      data-testid={`button-toggle-module-${module.id}`}
                    >
                      {expandedModules.has(module.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <div>
                      <CardTitle data-testid={`text-module-title-${module.id}`}>
                        {module.title}
                        {!module.isActive && <span className="ml-2 text-sm text-gray-500">(Inactive)</span>}
                      </CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      Passing: {module.passingScore}%
                    </span>
                    <span className={`text-sm px-2 py-1 rounded ${module.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {module.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingModule(module)}
                      data-testid={`button-edit-module-${module.id}`}
                    >
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedModuleForQuestion(module.id)}
                      data-testid={`button-add-question-${module.id}`}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add Question
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this module and all its questions/answers?")) {
                          deleteModuleMutation.mutate(module.id);
                        }
                      }}
                      data-testid={`button-delete-module-${module.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {expandedModules.has(module.id) && (
                <CardContent>
                  <ModuleQuestions
                    moduleId={module.id}
                    onAddAnswer={setSelectedQuestionForAnswer}
                    onEditQuestion={setEditingQuestion}
                    onDeleteQuestion={(id) => {
                      if (confirm("Are you sure you want to delete this question and all its answers?")) {
                        deleteQuestionMutation.mutate(id);
                      }
                    }}
                    onEditAnswer={setEditingAnswer}
                    onDeleteAnswer={(id) => {
                      if (confirm("Are you sure you want to delete this answer?")) {
                        deleteAnswerMutation.mutate(id);
                      }
                    }}
                    expandedQuestions={expandedQuestions}
                    toggleQuestion={toggleQuestion}
                  />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {selectedModuleForQuestion && (
        <QuestionDialog
          moduleId={selectedModuleForQuestion}
          onSubmit={(data) => createQuestionMutation.mutate(data)}
          onClose={() => setSelectedModuleForQuestion(null)}
        />
      )}

      {editingModule && (
        <ModuleDialog
          module={editingModule}
          onSubmit={(data) => updateModuleMutation.mutate({ id: editingModule.id, data })}
          onClose={() => setEditingModule(null)}
        />
      )}

      {editingQuestion && (
        <QuestionDialog
          moduleId={editingQuestion.moduleId}
          question={editingQuestion}
          onSubmit={(data) => updateQuestionMutation.mutate({ id: editingQuestion.id, data })}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      {selectedQuestionForAnswer && (
        <AnswerDialog
          questionId={selectedQuestionForAnswer}
          onSubmit={(data) => createAnswerMutation.mutate(data)}
          onClose={() => setSelectedQuestionForAnswer(null)}
        />
      )}

      {editingAnswer && (
        <AnswerDialog
          questionId={editingAnswer.questionId}
          answer={editingAnswer}
          onSubmit={(data) => updateAnswerMutation.mutate({ id: editingAnswer.id, data })}
          onClose={() => setEditingAnswer(null)}
        />
      )}
    </div>
  );
}

function ModuleDialog({ module, onSubmit, onClose }: { module?: any; onSubmit: (data: any) => void; onClose?: () => void }) {
  const [open, setOpen] = useState(module ? true : false);

  const form = useForm<z.infer<typeof moduleFormSchema>>({
    resolver: zodResolver(moduleFormSchema),
    defaultValues: module || {
      title: "",
      description: "",
      pdfUrl: "",
      passingScore: 80,
      isActive: true,
    },
  });

  const handleSubmit = (data: z.infer<typeof moduleFormSchema>) => {
    onSubmit(data);
    if (!module) {
      setOpen(false);
      form.reset();
    }
  };

  const handleClose = () => {
    if (module && onClose) {
      onClose();
    } else {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={module ? handleClose : setOpen}>
      {!module && (
        <DialogTrigger asChild>
          <Button data-testid="button-create-module">
            <Plus className="h-4 w-4 mr-2" /> Create Module
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{module ? "Edit Module" : "Create Training Module"}</DialogTitle>
          <DialogDescription>
            Create a new training module with quizzes and certification
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Preservation & FOD Training" {...field} data-testid="input-module-title" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the training module..."
                      {...field}
                      data-testid="input-module-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="pdfUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PDF URL (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="/attached_assets/training.pdf"
                      {...field}
                      data-testid="input-module-pdf"
                    />
                  </FormControl>
                  <FormDescription>
                    Link to training presentation or material
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="passingScore"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passing Score (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      {...field}
                      data-testid="input-module-passing-score"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-module">
                <Save className="h-4 w-4 mr-2" />
                {module ? "Update" : "Create"} Module
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function QuestionDialog({
  moduleId,
  question,
  onSubmit,
  onClose,
}: {
  moduleId: number;
  question?: any;
  onSubmit: (data: any) => void;
  onClose: () => void;
}) {
  const form = useForm<z.infer<typeof questionFormSchema>>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: question || {
      moduleId,
      question: "",
      questionType: "multiple_choice",
      correctAnswer: "",
      explanation: "",
      sortOrder: 0,
      isActive: true,
    },
  });

  const handleSubmit = (data: z.infer<typeof questionFormSchema>) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{question ? "Edit Question" : "Add Quiz Question"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="question"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the quiz question..."
                      {...field}
                      data-testid="input-question-text"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="questionType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Question Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-question-type">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                      <SelectItem value="true_false">True/False</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="correctAnswer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correct Answer</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter the correct answer text"
                      {...field}
                      data-testid="input-correct-answer"
                    />
                  </FormControl>
                  <FormDescription>
                    This should match exactly with one of the answer options
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="explanation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Explanation (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Explain why this is the correct answer..."
                      {...field}
                      data-testid="input-explanation"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      data-testid="input-sort-order"
                    />
                  </FormControl>
                  <FormDescription>
                    Questions will be displayed in this order (0, 1, 2, ...)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-question">
                <Save className="h-4 w-4 mr-2" />
                {question ? "Update" : "Add"} Question
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function AnswerDialog({
  questionId,
  answer,
  onSubmit,
  onClose,
}: {
  questionId: number;
  answer?: any;
  onSubmit: (data: any) => void;
  onClose: () => void;
}) {
  const form = useForm<z.infer<typeof answerFormSchema>>({
    resolver: zodResolver(answerFormSchema),
    defaultValues: answer || {
      questionId,
      answerText: "",
      isCorrect: false,
      sortOrder: 0,
    },
  });

  const handleSubmit = (data: z.infer<typeof answerFormSchema>) => {
    onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{answer ? "Edit Answer" : "Add Answer Option"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="answerText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Answer Text</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter answer option..."
                      {...field}
                      data-testid="input-answer-text"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sort Order</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      data-testid="input-answer-sort-order"
                    />
                  </FormControl>
                  <FormDescription>
                    Display order for this answer option
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" data-testid="button-submit-answer">
                <Save className="h-4 w-4 mr-2" />
                {answer ? "Update" : "Add"} Answer
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ModuleQuestions({
  moduleId,
  onAddAnswer,
  onEditQuestion,
  onDeleteQuestion,
  onEditAnswer,
  onDeleteAnswer,
  expandedQuestions,
  toggleQuestion,
}: {
  moduleId: number;
  onAddAnswer: (questionId: number) => void;
  onEditQuestion: (question: any) => void;
  onDeleteQuestion: (questionId: number) => void;
  onEditAnswer: (answer: any) => void;
  onDeleteAnswer: (answerId: number) => void;
  expandedQuestions: Set<number>;
  toggleQuestion: (questionId: number) => void;
}) {
  const { data: moduleData } = useQuery<any>({
    queryKey: ["/api/training/modules", "detail", moduleId],
  });

  if (!moduleData?.questions || moduleData.questions.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        No questions yet. Add your first question to this module.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Quiz Questions ({moduleData.questions.length})</h3>
      {moduleData.questions.map((question: any, index: number) => (
        <Card key={question.id} className="border-l-4 border-l-blue-500">
          <CardHeader className="py-3">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2 flex-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleQuestion(question.id)}
                  data-testid={`button-toggle-question-${question.id}`}
                >
                  {expandedQuestions.has(question.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <div className="flex-1">
                  <div className="font-medium" data-testid={`text-question-${question.id}`}>
                    Q{index + 1}. {question.question}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Type: {question.questionType} | Correct: {question.correctAnswer}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEditQuestion(question)}
                  data-testid={`button-edit-question-${question.id}`}
                >
                  <Edit className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAddAnswer(question.id)}
                  data-testid={`button-add-answer-${question.id}`}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Answer
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDeleteQuestion(question.id)}
                  data-testid={`button-delete-question-${question.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          {expandedQuestions.has(question.id) && question.answers && (
            <CardContent className="pt-0">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Answer Options:</h4>
                {question.answers.map((answer: any, ansIndex: number) => (
                  <div
                    key={answer.id}
                    className={`p-2 rounded border ${answer.answerText === question.correctAnswer ? 'bg-green-50 border-green-300' : 'bg-gray-50'}`}
                    data-testid={`answer-${answer.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>
                        {String.fromCharCode(65 + ansIndex)}. {answer.answerText}
                      </span>
                      <div className="flex items-center gap-2">
                        {answer.answerText === question.correctAnswer && (
                          <span className="text-xs text-green-700 font-semibold">✓ CORRECT</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditAnswer(answer)}
                          data-testid={`button-edit-answer-${answer.id}`}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteAnswer(answer.id)}
                          data-testid={`button-delete-answer-${answer.id}`}
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {(!question.answers || question.answers.length === 0) && (
                  <div className="text-sm text-gray-500 text-center py-2">
                    No answer options yet
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

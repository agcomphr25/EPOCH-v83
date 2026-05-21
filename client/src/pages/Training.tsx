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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
import { GraduationCap, Clock, FileText, Award, Plus, Trash2, HelpCircle, BookOpen, Sparkles, Loader2, ClipboardList, ArrowRight } from 'lucide-react';

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
}

// Convert plain text content to formatted HTML with professional styling matching built-in modules
function convertContentToHtml(content: string): string {
  if (!content) return '';
  
  let html = content;
  
  // Escape HTML entities first
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Convert headers with professional styling
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-xl font-bold text-gray-900 mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2 mt-8 mb-4">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<div class="text-center border-b-2 border-blue-200 pb-6 mb-8"><h1 class="text-3xl font-bold text-blue-900 mb-2">$1</h1></div>');
  
  // Convert bold text (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong class="font-semibold text-gray-900">$1</strong>');
  
  // Convert italic text (*text* or _text_)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  
  // Convert bullet points (-, *, •) at start of lines
  html = html.replace(/^[-*•]\s+(.+)$/gm, '<li class="text-lg">$1</li>');
  
  // Convert numbered lists (1. 2. 3. etc)
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="text-lg list-decimal-marker">$1</li>');
  
  // Wrap consecutive <li> elements in styled lists
  html = html.replace(/(<li[^>]*>.*?<\/li>\n?)+/g, (match) => {
    if (match.includes('list-decimal-marker')) {
      return '<ol class="list-decimal list-inside space-y-2 ml-4 text-lg my-4">' + match + '</ol>';
    }
    return '<ul class="list-disc list-inside space-y-2 ml-4 text-lg my-4">' + match + '</ul>';
  });
  
  // Convert numbered section headers (1️⃣, 2️⃣, etc.)
  html = html.replace(/^([0-9]️⃣|1️⃣0️⃣)\s*(.+)$/gm, 
    '<h2 class="text-2xl font-bold text-blue-900 border-b-2 border-blue-200 pb-2 mt-8 mb-4">$1 $2</h2>');
  
  // Convert red important points section
  html = html.replace(/^🔴\s*IMPORTANT POINTS$/gm, 
    '<div class="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-lg my-4"><h3 class="text-lg font-bold text-red-900 mb-2">🔴 IMPORTANT POINTS</h3>');
  
  // Convert important callouts with professional colored boxes
  html = html.replace(/^📌\s*(.+)$/gm, 
    '<div class="bg-blue-50 border-l-4 border-blue-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-blue-900">📌 $1</p></div>');
  html = html.replace(/^⚠️\s*(.+)$/gm, 
    '<div class="bg-yellow-50 border-l-4 border-yellow-400 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-yellow-900">⚠️ $1</p></div>');
  html = html.replace(/^✅\s*(.+)$/gm, 
    '<div class="bg-green-50 border-l-4 border-green-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-green-900">✅ $1</p></div>');
  html = html.replace(/^❌\s*(.+)$/gm, 
    '<div class="bg-red-50 border-l-4 border-red-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-red-900">❌ $1</p></div>');
  html = html.replace(/^💡\s*(.+)$/gm, 
    '<div class="bg-purple-50 border-l-4 border-purple-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-purple-900">💡 $1</p></div>');
  html = html.replace(/^🔑\s*(.+)$/gm, 
    '<div class="bg-orange-50 border-l-4 border-orange-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-orange-900">🔑 $1</p></div>');
  html = html.replace(/^🔒\s*(.+)$/gm, 
    '<div class="bg-gray-100 border-l-4 border-gray-600 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-gray-900">🔒 $1</p></div>');
  html = html.replace(/^(⭐|📋|🎯)\s*(.+)$/gm, 
    '<div class="bg-indigo-50 border-l-4 border-indigo-500 p-5 rounded-r-lg my-4"><p class="text-lg font-semibold text-indigo-900">$1 $2</p></div>');
  
  // Convert remaining newlines to paragraphs with proper styling
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    // Don't wrap if already wrapped in HTML tags
    if (p.trim().startsWith('<')) return p;
    // Convert single newlines to <br> within paragraphs
    const withBreaks = p.replace(/\n/g, '<br/>');
    return `<p class="text-lg leading-relaxed mb-4">${withBreaks}</p>`;
  }).join('\n');
  
  return `<div class="bg-white rounded-lg p-8 shadow-sm space-y-6 text-gray-800">${html}</div>`;
}

const CATEGORIES = [
  { value: 'SAFETY', label: 'Safety' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'AS9100', label: 'AS9100' },
  { value: 'GENERAL', label: 'General' },
];

const trainingTranslations = {
  en: {
    pageTitle: 'Training Program Builder',
    pageSubtitle: 'Build and manage training programs',
    loadingText: 'Loading training data...',
    trainingPrograms: 'Training Programs',
    createModule: 'Create Module',
    estimatedTime: 'Estimated Time',
    minutes: 'minutes',
    passingScore: 'Passing Score',
    transforming: 'Transforming...',
    aiTransform: 'AI Transform',
    startTraining: 'Start Training',
    noModulesTitle: 'No Training Modules Yet',
    noModulesDesc: 'Create training modules for employee certification programs',
    createFirstModule: 'Create Your First Module',
    dialogTitle: 'Create Training Module',
    dialogDesc: 'Create a complete training module with content and quiz questions',
    tabBasic: 'Basic Info',
    tabContent: 'Content',
    tabQuiz: 'Quiz',
    labelTitle: 'Module Title',
    labelDescription: 'Description',
    labelCategory: 'Category',
    labelDuration: 'Estimated Duration (minutes)',
    labelPassingScore: 'Passing Score (%)',
    labelContent: 'Training Content',
    contentHint: 'Enter the training material that employees will read and study',
    addQuizQuestion: 'Add Quiz Question',
    labelQuestion: 'Question',
    labelAnswerOptions: 'Answer Options (mark correct answer)',
    addQuestion: 'Add Question',
    addedQuestions: 'Added Questions',
    noQuestionsTitle: 'No quiz questions added yet',
    noQuestionsHint: 'Add questions above to create a quiz for this module',
    cancel: 'Cancel',
    creating: 'Creating...',
  },
  es: {
    pageTitle: 'Constructor de Programas de Capacitación',
    pageSubtitle: 'Construya y administre programas de capacitación',
    loadingText: 'Cargando datos de capacitación...',
    trainingPrograms: 'Programas de Capacitación',
    createModule: 'Crear Módulo',
    estimatedTime: 'Tiempo Estimado',
    minutes: 'minutos',
    passingScore: 'Puntuación Aprobatoria',
    transforming: 'Transformando...',
    aiTransform: 'Transformar con IA',
    startTraining: 'Iniciar Capacitación',
    noModulesTitle: 'Aún No Hay Módulos de Capacitación',
    noModulesDesc: 'Cree módulos de capacitación para programas de certificación de empleados',
    createFirstModule: 'Crear su Primer Módulo',
    dialogTitle: 'Crear Módulo de Capacitación',
    dialogDesc: 'Cree un módulo de capacitación completo con contenido y preguntas de examen',
    tabBasic: 'Información Básica',
    tabContent: 'Contenido',
    tabQuiz: 'Examen',
    labelTitle: 'Título del Módulo',
    labelDescription: 'Descripción',
    labelCategory: 'Categoría',
    labelDuration: 'Duración Estimada (minutos)',
    labelPassingScore: 'Puntuación Aprobatoria (%)',
    labelContent: 'Contenido de Capacitación',
    contentHint: 'Ingrese el material de capacitación que los empleados leerán y estudiarán',
    addQuizQuestion: 'Agregar Pregunta de Examen',
    labelQuestion: 'Pregunta',
    labelAnswerOptions: 'Opciones de Respuesta (marque la respuesta correcta)',
    addQuestion: 'Agregar Pregunta',
    addedQuestions: 'Preguntas Agregadas',
    noQuestionsTitle: 'Aún no se han agregado preguntas de examen',
    noQuestionsHint: 'Agregue preguntas arriba para crear un examen para este módulo',
    cancel: 'Cancelar',
    creating: 'Creando...',
  },
};

interface TrainingProps {
  lang?: 'en' | 'es';
  onStartForkliftCertification?: () => void;
}

function isForkliftCertificationModule(module: any): boolean {
  const searchable = `${module?.title || ''} ${module?.description || ''} ${module?.category || ''}`.toLowerCase();
  return searchable.includes('forklift') || searchable.includes('powered industrial truck');
}

export default function Training({ lang = 'en', onStartForkliftCertification }: TrainingProps) {
  const { toast } = useToast();
  const t = trainingTranslations[lang];
  const [createOpen, setCreateOpen] = useState(false);
  const [createTab, setCreateTab] = useState('basic');
  const [newModule, setNewModule] = useState({
    title: '',
    description: '',
    content: '',
    contentHtml: '',
    category: 'GENERAL',
    estimatedMinutes: 30,
    passingScore: 80,
  });
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState({
    question: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
  });

  const { data: modules, isLoading } = useQuery({
    queryKey: ['/api/training/modules'],
  });

  const { data: employees } = useQuery({
    queryKey: ['/api/employees'],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const moduleData = {
        ...newModule,
        contentHtml: convertContentToHtml(newModule.content),
      };
      const response = await apiRequest('/api/training/modules', {
        method: 'POST',
        body: JSON.stringify(moduleData),
      });
      
      if (quizQuestions.length > 0 && response?.id) {
        for (const q of quizQuestions) {
          await apiRequest(`/api/training/modules/${response.id}/questions`, {
            method: 'POST',
            body: JSON.stringify({
              question: q.question,
              questionType: 'multiple_choice',
              options: q.options.filter(o => o.trim()),
              correctAnswer: q.correctAnswer,
              points: 1,
            }),
          });
        }
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      setCreateOpen(false);
      setNewModule({ title: '', description: '', content: '', contentHtml: '', category: 'GENERAL', estimatedMinutes: 30, passingScore: 80 });
      setQuizQuestions([]);
      setCreateTab('basic');
      toast({ title: 'Module Created', description: 'Training module has been created with content and quiz.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
  
  const [transformingModuleId, setTransformingModuleId] = useState<number | null>(null);
  
  const aiTransformMutation = useMutation({
    mutationFn: async (moduleId: number) => {
      setTransformingModuleId(moduleId);
      const response = await apiRequest(`/api/training/modules/${moduleId}/ai-transform`, {
        method: 'POST',
        timeout: 120000, // 2 minutes for AI operations
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      setTransformingModuleId(null);
      toast({ 
        title: 'AI Transform Complete', 
        description: `Content formatted and ${data.questionsGenerated || 0} quiz questions generated.` 
      });
    },
    onError: (error: any) => {
      setTransformingModuleId(null);
      toast({ title: 'Transform Error', description: error.message, variant: 'destructive' });
    },
  });
  
  const addQuestion = () => {
    if (!newQuestion.question.trim()) {
      toast({ title: 'Error', description: 'Please enter a question', variant: 'destructive' });
      return;
    }
    const validOptions = newQuestion.options.filter(o => o.trim());
    if (validOptions.length < 2) {
      toast({ title: 'Error', description: 'Please add at least 2 answer options', variant: 'destructive' });
      return;
    }
    setQuizQuestions([...quizQuestions, { ...newQuestion, options: validOptions }]);
    setNewQuestion({ question: '', options: ['', '', '', ''], correctAnswer: 0 });
  };
  
  const removeQuestion = (index: number) => {
    setQuizQuestions(quizQuestions.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">{t.pageTitle}</h2>
            <p className="text-muted-foreground">{t.pageSubtitle}</p>
          </div>
        </div>
        <div className="text-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">{t.loadingText}</p>
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
            {t.pageTitle}
          </h2>
          <p className="text-muted-foreground">{t.pageSubtitle}</p>
        </div>
      </div>

      <div className="flex justify-between items-center gap-4">
        <Link href="/training/programs">
          <Button variant="outline">
            <ClipboardList className="h-4 w-4 mr-2" />
            {t.trainingPrograms}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </Link>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.createModule}
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
                <div className="flex items-start justify-between">
                  <CardTitle className="flex items-start gap-2">
                    <FileText className="h-5 w-5 text-primary mt-1" />
                    <span>{module.title}</span>
                  </CardTitle>
                  {module.category && (
                    <Badge variant="secondary" className="text-xs">{module.category}</Badge>
                  )}
                </div>
                <CardDescription className="line-clamp-2">{module.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      {t.estimatedTime}: {module.estimatedMinutes || 30} {t.minutes}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Award className="h-4 w-4" />
                    <span>{t.passingScore}: {module.passingScore || 80}%</span>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => aiTransformMutation.mutate(module.id)}
                      disabled={transformingModuleId === module.id}
                    >
                      {transformingModuleId === module.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          {t.transforming}
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          {t.aiTransform}
                        </>
                      )}
                    </Button>
                    {isForkliftCertificationModule(module) ? (
                      <Button
                        className="flex-1"
                        data-testid={`button-start-training-${module.id}`}
                        onClick={() => {
                          if (onStartForkliftCertification) {
                            onStartForkliftCertification();
                            return;
                          }
                          window.location.href = '/training-control-center?tab=forklift';
                        }}
                      >
                        {t.startTraining}
                      </Button>
                    ) : (
                      <Link href={`/training/${module.id}`} className="flex-1">
                        <Button
                          className="w-full"
                          data-testid={`button-start-training-${module.id}`}
                        >
                          {t.startTraining}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>

          {(!modules || (Array.isArray(modules) && modules.length === 0)) && (
            <Card>
              <CardContent className="py-12 text-center">
                <GraduationCap className="h-16 w-16 text-muted-foreground opacity-50 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t.noModulesTitle}</h3>
                <p className="text-muted-foreground mb-4">
                  {t.noModulesDesc}
                </p>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.createFirstModule}
                </Button>
              </CardContent>
            </Card>
          )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.dialogTitle}</DialogTitle>
            <DialogDescription>
              {t.dialogDesc}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={createTab} onValueChange={setCreateTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                {t.tabBasic}
              </TabsTrigger>
              <TabsTrigger value="content" className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {t.tabContent}
              </TabsTrigger>
              <TabsTrigger value="quiz" className="flex items-center gap-1">
                <HelpCircle className="h-4 w-4" />
                {t.tabQuiz} ({quizQuestions.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div>
                <Label>{t.labelTitle} <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g., Workplace Safety Fundamentals"
                  value={newModule.title}
                  onChange={(e) => setNewModule({ ...newModule, title: e.target.value })}
                />
              </div>

              <div>
                <Label>{t.labelDescription}</Label>
                <Textarea
                  placeholder="Brief description of what this training covers..."
                  value={newModule.description}
                  onChange={(e) => setNewModule({ ...newModule, description: e.target.value })}
                  rows={3}
                />
              </div>
              
              <div>
                <Label>{t.labelCategory}</Label>
                <Select
                  value={newModule.category}
                  onValueChange={(v) => setNewModule({ ...newModule, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t.labelDuration}</Label>
                  <Input
                    type="number"
                    value={newModule.estimatedMinutes}
                    onChange={(e) => setNewModule({ ...newModule, estimatedMinutes: parseInt(e.target.value) || 30 })}
                  />
                </div>
                <div>
                  <Label>{t.labelPassingScore}</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={newModule.passingScore}
                    onChange={(e) => setNewModule({ ...newModule, passingScore: parseInt(e.target.value) || 80 })}
                  />
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="content" className="space-y-4 mt-4">
              <div>
                <Label>{t.labelContent}</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  {t.contentHint}
                </p>
                <Textarea
                  placeholder="Enter the full training content here. Use clear headings and bullet points for better readability.

Example:
SECTION 1: INTRODUCTION
• Overview of the topic
• Why this training matters

SECTION 2: KEY CONCEPTS
• Important point 1
• Important point 2

SECTION 3: PROCEDURES
1. Step one
2. Step two
3. Step three"
                  value={newModule.content}
                  onChange={(e) => setNewModule({ ...newModule, content: e.target.value })}
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
            </TabsContent>
            
            <TabsContent value="quiz" className="space-y-4 mt-4">
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-medium">{t.addQuizQuestion}</h4>
                <div>
                  <Label>{t.labelQuestion}</Label>
                  <Textarea
                    placeholder="Enter the quiz question..."
                    value={newQuestion.question}
                    onChange={(e) => setNewQuestion({ ...newQuestion, question: e.target.value })}
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.labelAnswerOptions}</Label>
                  {newQuestion.options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correctAnswer"
                        checked={newQuestion.correctAnswer === idx}
                        onChange={() => setNewQuestion({ ...newQuestion, correctAnswer: idx })}
                        className="h-4 w-4"
                      />
                      <Input
                        placeholder={`Option ${idx + 1}`}
                        value={opt}
                        onChange={(e) => {
                          const opts = [...newQuestion.options];
                          opts[idx] = e.target.value;
                          setNewQuestion({ ...newQuestion, options: opts });
                        }}
                      />
                    </div>
                  ))}
                </div>
                <Button type="button" onClick={addQuestion} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  {t.addQuestion}
                </Button>
              </div>
              
              {quizQuestions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium">{t.addedQuestions} ({quizQuestions.length})</h4>
                  <ScrollArea className="h-[200px]">
                    <div className="space-y-3 pr-4">
                      {quizQuestions.map((q, idx) => (
                        <div key={idx} className="border rounded-lg p-3 bg-muted/30">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm">Q{idx + 1}: {q.question}</p>
                              <div className="mt-2 space-y-1">
                                {q.options.map((opt, optIdx) => (
                                  <div key={optIdx} className="flex items-center gap-2 text-sm">
                                    <Badge variant={optIdx === q.correctAnswer ? 'default' : 'outline'} className="text-xs">
                                      {String.fromCharCode(65 + optIdx)}
                                    </Badge>
                                    <span className={optIdx === q.correctAnswer ? 'font-medium text-green-600' : ''}>
                                      {opt}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => removeQuestion(idx)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              
              {quizQuestions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t.noQuestionsTitle}</p>
                  <p className="text-sm">{t.noQuestionsHint}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t.cancel}</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newModule.title || createMutation.isPending}
            >
              {createMutation.isPending ? t.creating : t.createModule}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

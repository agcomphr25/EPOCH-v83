import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  FolderOpen, FileText, Upload, Plus, Tag, BookOpen, Users, 
  Sparkles, Clock, Target, CheckCircle, ChevronRight, Trash2,
  Eye, Brain, GraduationCap, ClipboardList, Calendar, Edit, MoreVertical
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

interface Category {
  id: number;
  name: string;
  type: string;
  description: string | null;
  color: string;
}

interface Document {
  id: number;
  title: string;
  originalFilename: string;
  fileType: string | null;
  summary: string | null;
  status: string;
  createdAt: string;
  categories: { categoryId: number; categoryName: string; categoryColor: string }[];
}

interface Topic {
  id: number;
  title: string;
  description: string | null;
  objectives: string | null;
  estimatedDuration: number | null;
  difficultyLevel: string;
  categoryName: string | null;
  categoryColor: string | null;
  isAiGenerated: boolean;
  createdAt: string;
}

interface Employee {
  id: number;
  name: string;
  department: string | null;
}

interface TrainingPlan {
  id: number;
  traineeId: number;
  traineeName: string | null;
  title: string;
  description: string | null;
  totalTopics: number | null;
  status: string;
  createdAt: string;
  planStructure?: string;
  quizQuestions?: string;
  fourStepContent?: string;
  partNumber?: string;
  department?: string;
  productionLine?: string;
}

interface FacilityTopic {
  id: number;
  code: string;
  title: string;
  overview: string | null;
  estimatedMinutes: number | null;
  isActive: boolean;
}

interface TrainingStep {
  stepNumber: number;
  stepTitle: string;
  theme: string;
  trainerActivities: string;
  traineeActivities: string;
  facilityModules: string;
  facilityTopicIds?: number[];
  scheduledDate?: string;
  scheduledTime?: string;
  duration?: number;
  completed?: boolean;
}

interface QuizSchedule {
  id: string;
  stepNumber: number;
  quizTitle: string;
  scheduledDate?: string;
  scheduledTime?: string;
  duration?: number;
  passingScore?: number;
  completed?: boolean;
}

interface GeneratedTrainingStep {
  id: string;
  stepNumber: number;
  stepTitle: string;
  trainerInstructions: string;
  keyPoints: string[];
  demonstrations: string;
  safetyNotes: string;
  estimatedTime: number;
  accepted: boolean;
}

interface GeneratedQuizQuestion {
  id: string;
  question: string;
  questionType: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  stepNumber?: number;
  accepted: boolean;
}

interface GeneratedTopicData {
  title: string;
  description: string;
  objectives: string[];
  prerequisites: string;
  estimatedDuration: number;
  difficultyLevel: string;
  materials: GeneratedTrainingStep[];
  quizQuestions: GeneratedQuizQuestion[];
  documentIds: number[];
}

export default function TrainingContentLibrary() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('documents');
  const [selectedDocuments, setSelectedDocuments] = useState<number[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<number[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [generateTopicOpen, setGenerateTopicOpen] = useState(false);
  const [assignTrainingOpen, setAssignTrainingOpen] = useState(false);
  const [viewTopicOpen, setViewTopicOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<any>(null);
  
  // AI Review workflow state
  const [reviewTopicOpen, setReviewTopicOpen] = useState(false);
  const [generatedTopicData, setGeneratedTopicData] = useState<GeneratedTopicData | null>(null);
  const [reviewTab, setReviewTab] = useState<'steps' | 'quiz'>('steps');
  const [editingStep, setEditingStep] = useState<GeneratedTrainingStep | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<GeneratedQuizQuestion | null>(null);
  const [addingCustomStep, setAddingCustomStep] = useState(false);
  const [addingCustomQuestion, setAddingCustomQuestion] = useState(false);
  const [customStep, setCustomStep] = useState<Partial<GeneratedTrainingStep>>({
    stepTitle: '',
    trainerInstructions: '',
    keyPoints: [],
    demonstrations: '',
    safetyNotes: '',
    estimatedTime: 15,
  });
  const [customQuestion, setCustomQuestion] = useState<Partial<GeneratedQuizQuestion>>({
    question: '',
    questionType: 'multiple_choice',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
  });
  
  const [newCategory, setNewCategory] = useState({ name: '', type: 'custom', description: '', color: '#3B82F6' });
  const [newDoc, setNewDoc] = useState({ title: '', extractedText: '', categoryIds: [] as number[], fileName: '' });
  const [selectedTrainee, setSelectedTrainee] = useState<string>('');
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([]);
  const [partNumber, setPartNumber] = useState('');
  const [departmentForPlan, setDepartmentForPlan] = useState('');
  const [productionLine, setProductionLine] = useState('');
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  
  // Edit/Delete state for documents
  const [editDocOpen, setEditDocOpen] = useState(false);
  const [deleteDocOpen, setDeleteDocOpen] = useState(false);
  const [docToEdit, setDocToEdit] = useState<Document | null>(null);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [editDocForm, setEditDocForm] = useState({ title: '', summary: '' });
  
  // Edit/Delete state for training plans
  const [editPlanOpen, setEditPlanOpen] = useState(false);
  const [deletePlanOpen, setDeletePlanOpen] = useState(false);
  const [planToEdit, setPlanToEdit] = useState<TrainingPlan | null>(null);
  const [planToDelete, setPlanToDelete] = useState<TrainingPlan | null>(null);
  const [editPlanForm, setEditPlanForm] = useState({ title: '', description: '', status: '' });
  const [editPlanTab, setEditPlanTab] = useState('details');
  const [trainingSteps, setTrainingSteps] = useState<TrainingStep[]>([]);
  const [quizSchedules, setQuizSchedules] = useState<QuizSchedule[]>([]);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStep, setNewStep] = useState<Partial<TrainingStep>>({
    stepNumber: 1,
    stepTitle: '',
    theme: '',
    trainerActivities: '',
    traineeActivities: '',
    facilityModules: '',
    facilityTopicIds: [],
    scheduledDate: '',
    scheduledTime: '',
    duration: 30,
  });
  const [editStepIndex, setEditStepIndex] = useState<number | null>(null);

  // CRUD state for training topics
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [editTopicOpen, setEditTopicOpen] = useState(false);
  const [deleteTopicOpen, setDeleteTopicOpen] = useState(false);
  const [topicToEdit, setTopicToEdit] = useState<Topic | null>(null);
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const [newTopicForm, setNewTopicForm] = useState({
    title: '',
    description: '',
    objectives: '',
    estimatedDuration: '',
    difficultyLevel: 'beginner',
    categoryId: '',
  });
  const [editTopicForm, setEditTopicForm] = useState({
    title: '',
    description: '',
    objectives: '',
    estimatedDuration: '',
    difficultyLevel: '',
    categoryId: '',
  });

  // Import from Reference Documents state
  const [importRefDocsOpen, setImportRefDocsOpen] = useState(false);
  const [selectedRefDocs, setSelectedRefDocs] = useState<string[]>([]);
  const [selectedRefDocCategories, setSelectedRefDocCategories] = useState<number[]>([]);

  const handleFileSelect = async (file: File) => {
    setIsExtractingFile(true);
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (['doc', 'docx', 'pdf'].includes(fileExtension || '')) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/training/content-library/extract-text', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error('Failed to extract text from document');
        }
        
        const data = await response.json();
        setNewDoc(prev => ({
          ...prev,
          extractedText: data.text || '',
          fileName: file.name,
          title: prev.title || file.name.replace(/\.[^/.]+$/, '')
        }));
        toast({ title: 'File processed', description: `Extracted text from ${file.name}` });
      } else {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            resolve(content || '');
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(file);
        });
        
        setNewDoc(prev => ({
          ...prev,
          extractedText: text,
          fileName: file.name,
          title: prev.title || file.name.replace(/\.[^/.]+$/, '')
        }));
        toast({ title: 'File loaded', description: `Loaded ${file.name}` });
      }
    } catch (error) {
      toast({ 
        title: 'Error reading file', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
    } finally {
      setIsExtractingFile(false);
    }
  };

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['/api/training/content-library/categories'],
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ['/api/training/content-library/documents'],
  });

  const { data: topics = [] } = useQuery<Topic[]>({
    queryKey: ['/api/training/content-library/topics'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: facilityTopics = [] } = useQuery<FacilityTopic[]>({
    queryKey: ['/api/training/facility-topics'],
  });

  const { data: trainingPlans = [] } = useQuery<TrainingPlan[]>({
    queryKey: ['/api/training/content-library/training-plans'],
  });

  // Query for Reference Documents (from media library)
  interface RefDocument {
    id: string;
    filename: string;
    originalFilename: string;
    fileType: string;
    fileSize: number;
    url: string;
    category: string;
    createdAt: string;
    folderId: string | null;
  }

  const { data: referenceDocuments = [] } = useQuery<RefDocument[]>({
    queryKey: ['/api/media', { category: 'document' }],
    queryFn: async () => {
      const response = await fetch('/api/media?category=document', { credentials: 'include' });
      const data = await response.json();
      // API may return rows array directly or wrapped in { rows: [...] }
      const rows = Array.isArray(data) ? data : (data.rows || []);
      // Transform API response to RefDocument format (handle both snake_case and camelCase)
      return rows.map((item: any) => ({
        id: item.id,
        filename: item.filename,
        originalFilename: item.title || item.filename || 'Untitled Document',
        fileType: item.mimeType || item.mime_type || 'document',
        fileSize: item.fileSize || item.file_size || 0,
        url: item.storagePath || item.storage_path || `/api/media/file/${item.filename}`,
        category: item.category || 'document',
        createdAt: item.createdAt || item.created_at || item.captureDate || item.capture_date,
        folderId: item.folderId || item.folder_id,
      }));
    },
    enabled: importRefDocsOpen,
  });

  // Mutation to import reference documents into training library
  const importRefDocsMutation = useMutation({
    mutationFn: async (docs: { title: string; originalFilename: string; fileUrl: string; fileType: string; categoryIds: number[] }[]) => {
      const results = await Promise.all(
        docs.map(doc => 
          apiRequest('/api/training/content-library/documents', {
            method: 'POST',
            body: JSON.stringify({
              title: doc.title,
              originalFilename: doc.originalFilename,
              fileUrl: doc.fileUrl,
              fileType: doc.fileType,
              extractedText: `Imported from Reference Documents. View original: ${doc.fileUrl}`,
              categoryIds: doc.categoryIds,
            }),
          })
        )
      );
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/documents'] });
      setImportRefDocsOpen(false);
      setSelectedRefDocs([]);
      setSelectedRefDocCategories([]);
      toast({ title: 'Documents imported successfully', description: 'Reference documents have been added to your training library.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error importing documents', description: error.message, variant: 'destructive' });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/categories', {
        method: 'POST',
        body: JSON.stringify(newCategory),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/categories'] });
      setNewCategoryOpen(false);
      setNewCategory({ name: '', type: 'custom', description: '', color: '#3B82F6' });
      toast({ title: 'Category created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error creating category', description: error.message, variant: 'destructive' });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/documents', {
        method: 'POST',
        body: JSON.stringify({
          title: newDoc.title,
          originalFilename: newDoc.title + '.txt',
          fileType: 'text',
          extractedText: newDoc.extractedText,
          categoryIds: newDoc.categoryIds,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/documents'] });
      setNewDocOpen(false);
      setNewDoc({ title: '', extractedText: '', categoryIds: [], fileName: '' });
      toast({ title: 'Document uploaded and processed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error uploading document', description: error.message, variant: 'destructive' });
    },
  });

  const generateTopicMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/generate-topic-preview', {
        method: 'POST',
        timeout: 120000, // 2 minutes for AI generation
        body: JSON.stringify({
          documentIds: selectedDocuments,
          categoryId: categoryFilter !== 'all' ? parseInt(categoryFilter) : null,
        }),
      });
    },
    onSuccess: (data: any) => {
      // Transform data for review - add IDs and accepted status
      const materials = (data.materials || []).map((m: any, i: number) => ({
        ...m,
        id: `step-${i}`,
        keyPoints: m.keyPoints || [],
        accepted: true,
      }));
      const quizQuestions = (data.quizQuestions || []).map((q: any, i: number) => ({
        ...q,
        id: `quiz-${i}`,
        options: q.options || [],
        accepted: true,
      }));
      
      setGeneratedTopicData({
        ...data,
        objectives: data.objectives || [],
        materials,
        quizQuestions,
        documentIds: selectedDocuments, // Preserve document IDs for linking
      });
      setGenerateTopicOpen(false);
      setReviewTopicOpen(true);
      setReviewTab('steps');
      toast({ title: 'AI content generated - review and customize before saving' });
    },
    onError: (error: any) => {
      toast({ title: 'Error generating topic', description: error.message, variant: 'destructive' });
    },
  });
  
  // Save reviewed topic mutation
  const saveReviewedTopicMutation = useMutation({
    mutationFn: async () => {
      if (!generatedTopicData) return;
      
      const acceptedMaterials = generatedTopicData.materials.filter(m => m.accepted);
      const acceptedQuestions = generatedTopicData.quizQuestions.filter(q => q.accepted);
      
      if (acceptedMaterials.length === 0) {
        throw new Error('At least one training step must be accepted');
      }
      
      return apiRequest('/api/training/content-library/save-reviewed-topic', {
        method: 'POST',
        body: JSON.stringify({
          title: generatedTopicData.title,
          description: generatedTopicData.description,
          objectives: generatedTopicData.objectives,
          prerequisites: generatedTopicData.prerequisites,
          estimatedDuration: generatedTopicData.estimatedDuration,
          difficultyLevel: generatedTopicData.difficultyLevel,
          categoryId: categoryFilter !== 'all' ? parseInt(categoryFilter) : null,
          materials: acceptedMaterials,
          quizQuestions: acceptedQuestions,
          documentIds: generatedTopicData.documentIds, // Include document IDs for linking
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/topics'] });
      setReviewTopicOpen(false);
      setGeneratedTopicData(null);
      setSelectedDocuments([]);
      toast({ title: 'Training topic saved with your customizations!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error saving topic', description: error.message, variant: 'destructive' });
    },
  });

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/generate-training-plan', {
        method: 'POST',
        body: JSON.stringify({
          traineeId: parseInt(selectedTrainee),
          topicIds: selectedTopics,
          trainerIds: selectedTrainers.map(id => parseInt(id)),
          partNumber: partNumber || null,
          department: departmentForPlan || null,
          productionLine: productionLine || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/training-plans'] });
      queryClient.invalidateQueries({ queryKey: ['/api/training/epoch/training-plans'] });
      setAssignTrainingOpen(false);
      setSelectedTopics([]);
      setSelectedTrainee('');
      setSelectedTrainers([]);
      setPartNumber('');
      setDepartmentForPlan('');
      setProductionLine('');
      toast({ title: 'Training plan created with trainer assignment and production authorization!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error creating training plan', description: error.message, variant: 'destructive' });
    },
  });

  // Document CRUD mutations
  const updateDocMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { title?: string; summary?: string } }) => {
      return apiRequest(`/api/training/content-library/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/documents'] });
      setEditDocOpen(false);
      setDocToEdit(null);
      toast({ title: 'Document updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating document', description: error.message, variant: 'destructive' });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/content-library/documents/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/documents'] });
      setDeleteDocOpen(false);
      setDocToDelete(null);
      toast({ title: 'Document deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error deleting document', description: error.message, variant: 'destructive' });
    },
  });

  // Training Plan CRUD mutations
  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { title?: string; description?: string; status?: string; planStructure?: string; quizQuestions?: string; fourStepContent?: string; objectives?: string } }) => {
      return apiRequest(`/api/training/content-library/training-plans/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/training-plans'] });
      setEditPlanOpen(false);
      setPlanToEdit(null);
      toast({ title: 'Training plan updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating training plan', description: error.message, variant: 'destructive' });
    },
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/content-library/training-plans/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/training-plans'] });
      setDeletePlanOpen(false);
      setPlanToDelete(null);
      toast({ title: 'Training plan deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error deleting training plan', description: error.message, variant: 'destructive' });
    },
  });

  // Training Topic CRUD mutations
  const createTopicMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/topics', {
        method: 'POST',
        body: JSON.stringify({
          title: newTopicForm.title,
          description: newTopicForm.description || null,
          objectives: newTopicForm.objectives || null,
          estimatedDuration: newTopicForm.estimatedDuration ? parseInt(newTopicForm.estimatedDuration) : null,
          difficultyLevel: newTopicForm.difficultyLevel,
          categoryId: newTopicForm.categoryId ? parseInt(newTopicForm.categoryId) : null,
          isAiGenerated: false,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/topics'] });
      setNewTopicOpen(false);
      setNewTopicForm({ title: '', description: '', objectives: '', estimatedDuration: '', difficultyLevel: 'beginner', categoryId: '' });
      toast({ title: 'Training topic created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error creating topic', description: error.message, variant: 'destructive' });
    },
  });

  const updateTopicMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      return apiRequest(`/api/training/content-library/topics/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/topics'] });
      setEditTopicOpen(false);
      setTopicToEdit(null);
      toast({ title: 'Training topic updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error updating topic', description: error.message, variant: 'destructive' });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/content-library/topics/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/topics'] });
      setDeleteTopicOpen(false);
      setTopicToDelete(null);
      toast({ title: 'Training topic deleted successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error deleting topic', description: error.message, variant: 'destructive' });
    },
  });

  const openEditTopic = (topic: Topic) => {
    setTopicToEdit(topic);
    setEditTopicForm({
      title: topic.title,
      description: topic.description || '',
      objectives: topic.objectives || '',
      estimatedDuration: topic.estimatedDuration?.toString() || '',
      difficultyLevel: topic.difficultyLevel,
      categoryId: categories.find(c => c.name === topic.categoryName)?.id?.toString() || '',
    });
    setEditTopicOpen(true);
  };

  const openEditDoc = (doc: Document) => {
    setDocToEdit(doc);
    setEditDocForm({ title: doc.title, summary: doc.summary || '' });
    setEditDocOpen(true);
  };

  const openEditPlan = (plan: TrainingPlan) => {
    setPlanToEdit(plan);
    setEditPlanForm({ title: plan.title, description: plan.description || '', status: plan.status });
    setEditPlanTab('details');
    
    // Parse plan structure to get training steps
    if (plan.planStructure) {
      try {
        const structure = JSON.parse(plan.planStructure);
        if (structure.steps && Array.isArray(structure.steps)) {
          setTrainingSteps(structure.steps.map((step: any, idx: number) => ({
            stepNumber: step.stepNumber || idx + 1,
            stepTitle: step.stepTitle || '',
            theme: step.theme || '',
            trainerActivities: step.trainerActivities || '',
            traineeActivities: step.traineeActivities || '',
            facilityModules: step.facilityModules || '',
            facilityTopicIds: step.facilityTopicIds || [],
            scheduledDate: step.scheduledDate || '',
            scheduledTime: step.scheduledTime || '',
            duration: step.duration || 30,
            completed: step.completed || false,
          })));
        } else {
          setTrainingSteps([]);
        }
      } catch (e) {
        toast({ title: 'Warning', description: 'Could not parse existing training steps. Starting fresh.', variant: 'destructive' });
        setTrainingSteps([]);
      }
    } else {
      setTrainingSteps([]);
    }
    
    // Parse quiz questions
    if (plan.quizQuestions) {
      try {
        const quizzes = JSON.parse(plan.quizQuestions);
        if (Array.isArray(quizzes)) {
          setQuizSchedules(quizzes.map((q: any, idx: number) => ({
            id: q.id || `quiz-${idx}`,
            stepNumber: q.stepNumber || 1,
            quizTitle: q.quizTitle || q.question || `Quiz ${idx + 1}`,
            scheduledDate: q.scheduledDate || '',
            scheduledTime: q.scheduledTime || '',
            duration: q.duration || 15,
            passingScore: q.passingScore || 70,
            completed: q.completed || false,
          })));
        } else {
          setQuizSchedules([]);
        }
      } catch (e) {
        toast({ title: 'Warning', description: 'Could not parse existing quiz schedules. Starting fresh.', variant: 'destructive' });
        setQuizSchedules([]);
      }
    } else {
      setQuizSchedules([]);
    }
    
    setEditPlanOpen(true);
  };

  const filteredDocuments = categoryFilter === 'all' 
    ? documents 
    : documents.filter(d => d.categories.some(c => c.categoryId === parseInt(categoryFilter)));

  const filteredTopics = categoryFilter === 'all'
    ? topics
    : topics.filter(t => t.categoryName === categories.find(c => c.id === parseInt(categoryFilter))?.name);

  const handleViewTopic = async (topicId: number) => {
    try {
      const response = await fetch(`/api/training/content-library/topics/${topicId}`);
      const data = await response.json();
      setSelectedTopic(data);
      setViewTopicOpen(true);
    } catch (error) {
      toast({ title: 'Error loading topic', variant: 'destructive' });
    }
  };

  const toggleDocumentSelection = (docId: number) => {
    setSelectedDocuments(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const toggleTopicSelection = (topicId: number) => {
    setSelectedTopics(prev => 
      prev.includes(topicId) ? prev.filter(id => id !== topicId) : [...prev, topicId]
    );
  };

  const categoryTypeColors: Record<string, string> = {
    department: 'bg-blue-100 text-blue-800',
    facility: 'bg-green-100 text-green-800',
    custom: 'bg-purple-100 text-purple-800',
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            Training Content Library
          </h1>
          <p className="text-muted-foreground">Manage training documents, generate AI-powered training topics, and assign to trainees</p>
        </div>
        <div className="flex gap-2">
          {selectedDocuments.length > 0 && (
            <Button onClick={() => setGenerateTopicOpen(true)} className="bg-gradient-to-r from-purple-500 to-pink-500">
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Training ({selectedDocuments.length})
            </Button>
          )}
          {selectedTopics.length > 0 && (
            <Button onClick={() => setAssignTrainingOpen(true)} className="bg-gradient-to-r from-green-500 to-teal-500">
              <Users className="h-4 w-4 mr-2" />
              Assign Training ({selectedTopics.length})
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-center">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id.toString()}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  {cat.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Tag className="h-4 w-4 mr-2" />
              New Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input 
                  value={newCategory.name} 
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="e.g., Safety Training"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={newCategory.type} onValueChange={(v) => setNewCategory({ ...newCategory, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="facility">Facility</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea 
                  value={newCategory.description}
                  onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Color</Label>
                <Input 
                  type="color" 
                  value={newCategory.color}
                  onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                  className="h-10 w-20"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => createCategoryMutation.mutate()} disabled={!newCategory.name || createCategoryMutation.isPending}>
                {createCategoryMutation.isPending ? 'Creating...' : 'Create Category'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={newDocOpen} onOpenChange={setNewDocOpen}>
          <DialogTrigger asChild>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Import Document
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import Training Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Document Title</Label>
                <Input 
                  value={newDoc.title}
                  onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                  placeholder="e.g., FOD Prevention Procedures"
                />
              </div>
              <div>
                <Label>Categories</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {categories.map(cat => (
                    <Badge 
                      key={cat.id}
                      variant={newDoc.categoryIds.includes(cat.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        setNewDoc(prev => ({
                          ...prev,
                          categoryIds: prev.categoryIds.includes(cat.id)
                            ? prev.categoryIds.filter(id => id !== cat.id)
                            : [...prev.categoryIds, cat.id]
                        }));
                      }}
                    >
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Upload File from Computer</Label>
                <div className="mt-2 p-4 border-2 border-dashed rounded-lg text-center">
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.doc,.docx,.pdf"
                    className="hidden"
                    id="training-doc-file-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                  <label htmlFor="training-doc-file-input" className="cursor-pointer">
                    {isExtractingFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                        <span className="text-muted-foreground">Reading file...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {newDoc.fileName ? `Selected: ${newDoc.fileName}` : 'Click to select a file (.txt, .md, .csv, .doc, .docx, .pdf)'}
                        </span>
                        <span className="text-xs text-muted-foreground">or drag and drop</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>
              <div>
                <Label>Document Content {newDoc.fileName && <span className="text-xs text-muted-foreground ml-2">(loaded from {newDoc.fileName})</span>}</Label>
                <Textarea 
                  value={newDoc.extractedText}
                  onChange={(e) => setNewDoc({ ...newDoc, extractedText: e.target.value })}
                  placeholder="Content will appear here after file upload, or paste text directly..."
                  className="min-h-[200px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => uploadDocumentMutation.mutate()} disabled={!newDoc.title || !newDoc.extractedText || uploadDocumentMutation.isPending || isExtractingFile}>
                {uploadDocumentMutation.isPending ? 'Processing with AI...' : 'Import & Process'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import from Reference Documents Button and Dialog */}
        <Dialog open={importRefDocsOpen} onOpenChange={setImportRefDocsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <FolderOpen className="h-4 w-4 mr-2" />
              Import from Reference Docs
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Import from Reference Documents</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select documents from your Reference Documents library to import into your Training Content Library.
              </p>
              
              {/* Category Selection */}
              <div>
                <Label>Assign to Categories</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {categories.map(cat => (
                    <Badge 
                      key={cat.id}
                      variant={selectedRefDocCategories.includes(cat.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedRefDocCategories(prev => 
                          prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                        );
                      }}
                    >
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Reference Documents List */}
              <div>
                <Label>Available Reference Documents ({referenceDocuments.length})</Label>
                <div className="mt-2 border rounded-lg max-h-[300px] overflow-y-auto">
                  {referenceDocuments.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No reference documents found</p>
                      <p className="text-sm">Upload documents to Reference Docs first</p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {referenceDocuments.map(doc => (
                        <div 
                          key={doc.id}
                          className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/50 ${
                            selectedRefDocs.includes(doc.id) ? 'bg-primary/10' : ''
                          }`}
                          onClick={() => {
                            setSelectedRefDocs(prev => 
                              prev.includes(doc.id) ? prev.filter(id => id !== doc.id) : [...prev, doc.id]
                            );
                          }}
                        >
                          <Checkbox 
                            checked={selectedRefDocs.includes(doc.id)}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={() => {
                              setSelectedRefDocs(prev => 
                                prev.includes(doc.id) ? prev.filter(id => id !== doc.id) : [...prev, doc.id]
                              );
                            }}
                          />
                          <FileText className="h-5 w-5 text-blue-600" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{doc.originalFilename}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.fileType} • {new Date(doc.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setImportRefDocsOpen(false);
                  setSelectedRefDocs([]);
                  setSelectedRefDocCategories([]);
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  const docsToImport = referenceDocuments
                    .filter(doc => selectedRefDocs.includes(doc.id))
                    .map(doc => ({
                      title: doc.originalFilename.replace(/\.[^/.]+$/, ''),
                      originalFilename: doc.originalFilename,
                      fileUrl: doc.url,
                      fileType: doc.fileType || 'document',
                      categoryIds: selectedRefDocCategories,
                    }));
                  importRefDocsMutation.mutate(docsToImport);
                }}
                disabled={selectedRefDocs.length === 0 || importRefDocsMutation.isPending}
              >
                {importRefDocsMutation.isPending ? 'Importing...' : `Import ${selectedRefDocs.length} Document${selectedRefDocs.length !== 1 ? 's' : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-blue-100">
                <FolderOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categories.length}</p>
                <p className="text-sm text-muted-foreground">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-green-100">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{documents.length}</p>
                <p className="text-sm text-muted-foreground">Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-purple-100">
                <GraduationCap className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{topics.length}</p>
                <p className="text-sm text-muted-foreground">Training Topics</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-orange-100">
                <Sparkles className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{topics.filter(t => t.isAiGenerated).length}</p>
                <p className="text-sm text-muted-foreground">AI Generated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="topics" className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" />
            Training Topics
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Training Plans ({trainingPlans.length})
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Categories
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          {selectedDocuments.length > 0 && (
            <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-purple-600" />
                    <span className="font-medium">{selectedDocuments.length} documents selected</span>
                  </div>
                  <Button 
                    onClick={() => setGenerateTopicOpen(true)}
                    className="bg-gradient-to-r from-purple-500 to-pink-500"
                  >
                    <Brain className="h-4 w-4 mr-2" />
                    Generate 4-Step Training Topic
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {filteredDocuments.map(doc => (
              <Card 
                key={doc.id} 
                className={`cursor-pointer transition-all ${selectedDocuments.includes(doc.id) ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                onClick={() => toggleDocumentSelection(doc.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <Checkbox checked={selectedDocuments.includes(doc.id)} />
                      <div>
                        <h3 className="font-semibold">{doc.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{doc.summary || 'Processing...'}</p>
                        <div className="flex gap-2 mt-2">
                          {doc.categories.map(cat => (
                            <Badge key={cat.categoryId} style={{ backgroundColor: cat.categoryColor + '20', color: cat.categoryColor }}>
                              {cat.categoryName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={doc.status === 'ready' ? 'default' : 'secondary'}>
                        {doc.status}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenuItem onClick={() => openEditDoc(doc)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => { setDocToDelete(doc); setDeleteDocOpen(true); }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredDocuments.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No documents yet. Import a document to get started.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="topics" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Training Topics</h3>
            <Button onClick={() => setNewTopicOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Topic
            </Button>
          </div>

          {selectedTopics.length > 0 && (
            <Card className="bg-gradient-to-r from-green-50 to-teal-50 border-green-200">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium">{selectedTopics.length} topics selected</span>
                  </div>
                  <Button 
                    onClick={() => setAssignTrainingOpen(true)}
                    className="bg-gradient-to-r from-green-500 to-teal-500"
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Assign to Trainee
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {filteredTopics.map(topic => (
              <Card 
                key={topic.id} 
                className={`cursor-pointer transition-all ${selectedTopics.includes(topic.id) ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <Checkbox 
                        checked={selectedTopics.includes(topic.id)} 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTopicSelection(topic.id);
                        }}
                      />
                      <div onClick={() => toggleTopicSelection(topic.id)}>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{topic.title}</h3>
                          {topic.isAiGenerated && (
                            <Badge variant="secondary" className="text-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              AI Generated
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{topic.description}</p>
                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                          {topic.estimatedDuration && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {topic.estimatedDuration} min
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Target className="h-4 w-4" />
                            {topic.difficultyLevel}
                          </span>
                          {topic.categoryName && (
                            <Badge style={{ backgroundColor: (topic.categoryColor || '#888') + '20', color: topic.categoryColor || '#888' }}>
                              {topic.categoryName}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleViewTopic(topic.id); }}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditTopic(topic); }}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); setTopicToDelete(topic); setDeleteTopicOpen(true); }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredTopics.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No training topics yet. Select documents and generate topics with AI.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="grid gap-4">
            {trainingPlans.map(plan => {
              let planData: any = null;
              try {
                planData = plan.planStructure ? JSON.parse(plan.planStructure) : null;
              } catch (e) {}
              
              return (
                <Card key={plan.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-lg">{plan.title}</CardTitle>
                          <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                            {plan.status}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-4">
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {plan.traineeName || 'Unknown trainee'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(plan.createdAt).toLocaleDateString()}
                          </span>
                          {plan.totalTopics && (
                            <span className="flex items-center gap-1">
                              <GraduationCap className="h-4 w-4" />
                              {plan.totalTopics} topics
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditPlan(plan)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => { setPlanToDelete(plan); setDeletePlanOpen(true); }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{plan.description}</p>
                    {planData?.days && (
                      <div className="grid grid-cols-4 gap-2">
                        {planData.days.map((day: any) => (
                          <div key={day.dayNumber} className="p-3 bg-muted rounded-lg">
                            <p className="font-medium text-sm">Day {day.dayNumber}</p>
                            <p className="text-xs text-muted-foreground">{day.theme}</p>
                            <p className="text-xs mt-1">{day.estimatedHours}h</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {trainingPlans.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No training plans yet. Select topics and assign to a trainee to create a plan.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {categories.map(cat => (
              <Card key={cat.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }} />
                      <CardTitle className="text-lg">{cat.name}</CardTitle>
                    </div>
                    <Badge className={categoryTypeColors[cat.type] || 'bg-gray-100'}>{cat.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{cat.description || 'No description'}</p>
                  <div className="mt-3 text-sm">
                    <span className="text-muted-foreground">
                      {documents.filter(d => d.categories.some(c => c.categoryId === cat.id)).length} documents
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
            {categories.length === 0 && (
              <Card className="col-span-3">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No categories yet. Create categories to organize your training content.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={generateTopicOpen} onOpenChange={setGenerateTopicOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              Generate Training Topic
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              AI will analyze {selectedDocuments.length} selected document(s) and create:
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Complete 4-Step Training Materials
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Trainer instructions for each step
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Key teaching points & demonstrations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Quiz questions for competency verification
              </li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateTopicOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => generateTopicMutation.mutate()} 
              disabled={generateTopicMutation.isPending}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {generateTopicMutation.isPending ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Training
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Content Review Dialog */}
      <Dialog open={reviewTopicOpen} onOpenChange={setReviewTopicOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              Review AI-Generated Training Content
            </DialogTitle>
          </DialogHeader>
          
          {generatedTopicData && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Topic Header Info */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs text-muted-foreground">Topic Title</Label>
                    <Input
                      value={generatedTopicData.title}
                      onChange={(e) => setGeneratedTopicData(prev => prev ? {...prev, title: e.target.value} : null)}
                      className="text-lg font-semibold mt-1"
                    />
                  </div>
                  <Badge variant="outline">{generatedTopicData.difficultyLevel}</Badge>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Textarea
                    value={generatedTopicData.description}
                    onChange={(e) => setGeneratedTopicData(prev => prev ? {...prev, description: e.target.value} : null)}
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
              
              {/* Tab Navigation */}
              <div className="flex gap-2 border-b">
                <Button
                  variant={reviewTab === 'steps' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setReviewTab('steps')}
                  className="gap-2"
                >
                  <ClipboardList className="h-4 w-4" />
                  Training Steps ({generatedTopicData.materials.filter(m => m.accepted).length}/{generatedTopicData.materials.length})
                </Button>
                <Button
                  variant={reviewTab === 'quiz' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setReviewTab('quiz')}
                  className="gap-2"
                >
                  <Target className="h-4 w-4" />
                  Quiz Questions ({generatedTopicData.quizQuestions.filter(q => q.accepted).length}/{generatedTopicData.quizQuestions.length})
                </Button>
              </div>
              
              {/* Content Area */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {reviewTab === 'steps' && (
                  <>
                    {generatedTopicData.materials.map((step, index) => (
                      <Card key={step.id} className={`${!step.accepted ? 'opacity-50 bg-muted' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary">Step {step.stepNumber}</Badge>
                                <span className="font-semibold">{step.stepTitle}</span>
                                <Badge variant="outline" className="ml-auto">{step.estimatedTime} min</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{step.trainerInstructions}</p>
                              {step.keyPoints.length > 0 && (
                                <div className="text-xs">
                                  <span className="font-medium">Key Points: </span>
                                  {step.keyPoints.join(', ')}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingStep(step)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={step.accepted ? 'default' : 'outline'}
                                className={step.accepted ? 'bg-green-600 hover:bg-green-700' : ''}
                                onClick={() => {
                                  setGeneratedTopicData(prev => prev ? {
                                    ...prev,
                                    materials: prev.materials.map(m => 
                                      m.id === step.id ? {...m, accepted: !m.accepted} : m
                                    )
                                  } : null);
                                }}
                              >
                                {step.accepted ? <CheckCircle className="h-4 w-4" /> : 'Accept'}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    
                    {/* Add Custom Step Button */}
                    <Button
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => {
                        setAddingCustomStep(true);
                        setCustomStep({
                          stepTitle: '',
                          trainerInstructions: '',
                          keyPoints: [],
                          demonstrations: '',
                          safetyNotes: '',
                          estimatedTime: 15,
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Training Step
                    </Button>
                  </>
                )}
                
                {reviewTab === 'quiz' && (
                  <>
                    {generatedTopicData.quizQuestions.map((question, index) => (
                      <Card key={question.id} className={`${!question.accepted ? 'opacity-50 bg-muted' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary">Q{index + 1}</Badge>
                                <Badge variant="outline">{question.questionType}</Badge>
                              </div>
                              <p className="font-medium mb-2">{question.question}</p>
                              {question.options.length > 0 && (
                                <div className="space-y-1 mb-2">
                                  {question.options.map((opt, i) => (
                                    <div key={i} className={`text-sm ${opt.startsWith(question.correctAnswer) ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                                      {opt}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {question.explanation && (
                                <p className="text-xs text-muted-foreground italic">
                                  Explanation: {question.explanation}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingQuestion(question)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={question.accepted ? 'default' : 'outline'}
                                className={question.accepted ? 'bg-green-600 hover:bg-green-700' : ''}
                                onClick={() => {
                                  setGeneratedTopicData(prev => prev ? {
                                    ...prev,
                                    quizQuestions: prev.quizQuestions.map(q => 
                                      q.id === question.id ? {...q, accepted: !q.accepted} : q
                                    )
                                  } : null);
                                }}
                              >
                                {question.accepted ? <CheckCircle className="h-4 w-4" /> : 'Accept'}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    
                    {/* Add Custom Question Button */}
                    <Button
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => {
                        setAddingCustomQuestion(true);
                        setCustomQuestion({
                          question: '',
                          questionType: 'multiple_choice',
                          options: ['', '', '', ''],
                          correctAnswer: '',
                          explanation: '',
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Quiz Question
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          
          <DialogFooter className="border-t pt-4">
            <div className="flex justify-between w-full">
              <Button variant="outline" onClick={() => {
                setReviewTopicOpen(false);
                setGeneratedTopicData(null);
              }}>
                Cancel
              </Button>
              <Button
                onClick={() => saveReviewedTopicMutation.mutate()}
                disabled={saveReviewedTopicMutation.isPending || !generatedTopicData?.materials.some(m => m.accepted)}
                className="bg-gradient-to-r from-purple-500 to-pink-500"
              >
                {saveReviewedTopicMutation.isPending ? 'Saving...' : 'Save Training Topic'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Step Dialog */}
      <Dialog open={!!editingStep} onOpenChange={(open) => !open && setEditingStep(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Training Step</DialogTitle>
          </DialogHeader>
          {editingStep && (
            <div className="space-y-4">
              <div>
                <Label>Step Title</Label>
                <Input
                  value={editingStep.stepTitle}
                  onChange={(e) => setEditingStep({...editingStep, stepTitle: e.target.value})}
                />
              </div>
              <div>
                <Label>Trainer Instructions</Label>
                <Textarea
                  value={editingStep.trainerInstructions}
                  onChange={(e) => setEditingStep({...editingStep, trainerInstructions: e.target.value})}
                  rows={4}
                />
              </div>
              <div>
                <Label>Key Points (comma separated)</Label>
                <Input
                  value={editingStep.keyPoints.join(', ')}
                  onChange={(e) => setEditingStep({...editingStep, keyPoints: e.target.value.split(',').map(s => s.trim())})}
                />
              </div>
              <div>
                <Label>Estimated Time (minutes)</Label>
                <Input
                  type="number"
                  value={editingStep.estimatedTime}
                  onChange={(e) => setEditingStep({...editingStep, estimatedTime: parseInt(e.target.value) || 15})}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingStep(null)}>Cancel</Button>
            <Button onClick={() => {
              if (editingStep && generatedTopicData) {
                setGeneratedTopicData({
                  ...generatedTopicData,
                  materials: generatedTopicData.materials.map(m => 
                    m.id === editingStep.id ? editingStep : m
                  )
                });
                setEditingStep(null);
              }
            }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Question Dialog */}
      <Dialog open={!!editingQuestion} onOpenChange={(open) => !open && setEditingQuestion(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Quiz Question</DialogTitle>
          </DialogHeader>
          {editingQuestion && (
            <div className="space-y-4">
              <div>
                <Label>Question</Label>
                <Textarea
                  value={editingQuestion.question}
                  onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                  rows={2}
                />
              </div>
              <div>
                <Label>Options</Label>
                {editingQuestion.options.map((opt, i) => (
                  <Input
                    key={i}
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...editingQuestion.options];
                      newOpts[i] = e.target.value;
                      setEditingQuestion({...editingQuestion, options: newOpts});
                    }}
                    className="mb-2"
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  />
                ))}
              </div>
              <div>
                <Label>Correct Answer (e.g., A, B, C, D)</Label>
                <Input
                  value={editingQuestion.correctAnswer}
                  onChange={(e) => setEditingQuestion({...editingQuestion, correctAnswer: e.target.value})}
                />
              </div>
              <div>
                <Label>Explanation</Label>
                <Textarea
                  value={editingQuestion.explanation}
                  onChange={(e) => setEditingQuestion({...editingQuestion, explanation: e.target.value})}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQuestion(null)}>Cancel</Button>
            <Button onClick={() => {
              if (editingQuestion && generatedTopicData) {
                setGeneratedTopicData({
                  ...generatedTopicData,
                  quizQuestions: generatedTopicData.quizQuestions.map(q => 
                    q.id === editingQuestion.id ? editingQuestion : q
                  )
                });
                setEditingQuestion(null);
              }
            }}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Step Dialog */}
      <Dialog open={addingCustomStep} onOpenChange={setAddingCustomStep}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Training Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Step Title</Label>
              <Input
                value={customStep.stepTitle || ''}
                onChange={(e) => setCustomStep({...customStep, stepTitle: e.target.value})}
                placeholder="e.g., Safety Overview"
              />
            </div>
            <div>
              <Label>Trainer Instructions</Label>
              <Textarea
                value={customStep.trainerInstructions || ''}
                onChange={(e) => setCustomStep({...customStep, trainerInstructions: e.target.value})}
                rows={4}
                placeholder="Describe what the trainer should do..."
              />
            </div>
            <div>
              <Label>Key Points (comma separated)</Label>
              <Input
                value={customStep.keyPoints?.join(', ') || ''}
                onChange={(e) => setCustomStep({...customStep, keyPoints: e.target.value.split(',').map(s => s.trim())})}
                placeholder="Point 1, Point 2, Point 3"
              />
            </div>
            <div>
              <Label>Estimated Time (minutes)</Label>
              <Input
                type="number"
                value={customStep.estimatedTime || 15}
                onChange={(e) => setCustomStep({...customStep, estimatedTime: parseInt(e.target.value) || 15})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingCustomStep(false)}>Cancel</Button>
            <Button onClick={() => {
              if (generatedTopicData && customStep.stepTitle) {
                const newStep: GeneratedTrainingStep = {
                  id: `custom-step-${Date.now()}`,
                  stepNumber: generatedTopicData.materials.length + 1,
                  stepTitle: customStep.stepTitle || '',
                  trainerInstructions: customStep.trainerInstructions || '',
                  keyPoints: customStep.keyPoints || [],
                  demonstrations: customStep.demonstrations || '',
                  safetyNotes: customStep.safetyNotes || '',
                  estimatedTime: customStep.estimatedTime || 15,
                  accepted: true,
                };
                setGeneratedTopicData({
                  ...generatedTopicData,
                  materials: [...generatedTopicData.materials, newStep]
                });
                setAddingCustomStep(false);
              }
            }}>Add Step</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Question Dialog */}
      <Dialog open={addingCustomQuestion} onOpenChange={setAddingCustomQuestion}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Quiz Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Question</Label>
              <Textarea
                value={customQuestion.question || ''}
                onChange={(e) => setCustomQuestion({...customQuestion, question: e.target.value})}
                rows={2}
                placeholder="Enter your question..."
              />
            </div>
            <div>
              <Label>Options</Label>
              {(customQuestion.options || ['', '', '', '']).map((opt, i) => (
                <Input
                  key={i}
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(customQuestion.options || ['', '', '', ''])];
                    newOpts[i] = e.target.value;
                    setCustomQuestion({...customQuestion, options: newOpts});
                  }}
                  className="mb-2"
                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                />
              ))}
            </div>
            <div>
              <Label>Correct Answer (e.g., A, B, C, D)</Label>
              <Input
                value={customQuestion.correctAnswer || ''}
                onChange={(e) => setCustomQuestion({...customQuestion, correctAnswer: e.target.value})}
              />
            </div>
            <div>
              <Label>Explanation</Label>
              <Textarea
                value={customQuestion.explanation || ''}
                onChange={(e) => setCustomQuestion({...customQuestion, explanation: e.target.value})}
                rows={2}
                placeholder="Why is this the correct answer?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddingCustomQuestion(false)}>Cancel</Button>
            <Button onClick={() => {
              if (generatedTopicData && customQuestion.question) {
                const newQuestion: GeneratedQuizQuestion = {
                  id: `custom-quiz-${Date.now()}`,
                  question: customQuestion.question || '',
                  questionType: customQuestion.questionType || 'multiple_choice',
                  options: customQuestion.options || [],
                  correctAnswer: customQuestion.correctAnswer || '',
                  explanation: customQuestion.explanation || '',
                  accepted: true,
                };
                setGeneratedTopicData({
                  ...generatedTopicData,
                  quizQuestions: [...generatedTopicData.quizQuestions, newQuestion]
                });
                setAddingCustomQuestion(false);
              }
            }}>Add Question</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignTrainingOpen} onOpenChange={setAssignTrainingOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              Assign Training Program
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              AI will create a 4-step training program from {selectedTopics.length} topic(s) with quizzes for each step.
            </p>
            
            <div>
              <Label>Trainee *</Label>
              <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select trainee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name} {emp.department ? `(${emp.department})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Trainer(s) *</Label>
              <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                {employees.map(emp => (
                  <div key={emp.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`trainer-${emp.id}`}
                      checked={selectedTrainers.includes(emp.id.toString())}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTrainers(prev => [...prev, emp.id.toString()]);
                        } else {
                          setSelectedTrainers(prev => prev.filter(id => id !== emp.id.toString()));
                        }
                      }}
                    />
                    <Label htmlFor={`trainer-${emp.id}`} className="text-sm font-normal cursor-pointer">
                      {emp.name} {emp.department ? `(${emp.department})` : ''}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Part Number</Label>
                <Input
                  placeholder="e.g., ABC-123"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                />
              </div>
              <div>
                <Label>Department</Label>
                <Input
                  placeholder="e.g., Assembly"
                  value={departmentForPlan}
                  onChange={(e) => setDepartmentForPlan(e.target.value)}
                />
              </div>
            </div>
            
            <div>
              <Label>Production Line</Label>
              <Select value={productionLine} onValueChange={setProductionLine}>
                <SelectTrigger>
                  <SelectValue placeholder="Select production line" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="P1">P1 - Production Line 1</SelectItem>
                  <SelectItem value="P2">P2 - Production Line 2</SelectItem>
                  <SelectItem value="P3">P3 - Production Line 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {partNumber && (
              <p className="text-xs text-muted-foreground bg-green-50 dark:bg-green-950/50 p-2 rounded">
                Upon completion, trainee will be authorized to work on Part #{partNumber} 
                {productionLine ? ` on ${productionLine}` : ''} via the Traveler system.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTrainingOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => generatePlanMutation.mutate()} 
              disabled={!selectedTrainee || selectedTrainers.length === 0 || generatePlanMutation.isPending}
              className="bg-gradient-to-r from-green-500 to-teal-500"
            >
              {generatePlanMutation.isPending ? 'Creating Program...' : 'Create Training Program'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewTopicOpen} onOpenChange={setViewTopicOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          {selectedTopic && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  {selectedTopic.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-muted-foreground">{selectedTopic.description}</p>
                </div>

                {selectedTopic.objectives && (
                  <div>
                    <h4 className="font-semibold mb-2">Learning Objectives</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {JSON.parse(selectedTopic.objectives || '[]').map((obj: string, i: number) => (
                        <li key={i}>{obj}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h4 className="font-semibold mb-4">4-Step Training Materials</h4>
                  <div className="space-y-4">
                    {selectedTopic.materials?.map((mat: any) => (
                      <Card key={mat.stepNumber}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Badge variant="outline">Step {mat.stepNumber}</Badge>
                            {mat.stepTitle}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">Trainer Instructions</Label>
                            <p className="text-sm">{mat.trainerInstructions}</p>
                          </div>
                          {mat.keyPoints && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Key Points</Label>
                              <ul className="list-disc pl-5 text-sm">
                                {JSON.parse(mat.keyPoints || '[]').map((point: string, i: number) => (
                                  <li key={i}>{point}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {mat.safetyNotes && (
                            <div className="bg-yellow-50 p-2 rounded text-sm">
                              <strong>Safety:</strong> {mat.safetyNotes}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Estimated time: {mat.estimatedTime} minutes
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {selectedTopic.quizQuestions?.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-4">Quiz Questions ({selectedTopic.quizQuestions.length})</h4>
                    <div className="space-y-3">
                      {selectedTopic.quizQuestions.map((q: any, i: number) => (
                        <Card key={i}>
                          <CardContent className="py-3">
                            <p className="font-medium">Q{i + 1}: {q.question}</p>
                            {q.options && (
                              <div className="mt-2 space-y-1">
                                {JSON.parse(q.options || '[]').map((opt: string, j: number) => (
                                  <p key={j} className={`text-sm ${opt.startsWith(q.correctAnswer) ? 'text-green-600 font-medium' : ''}`}>
                                    {opt}
                                  </p>
                                ))}
                              </div>
                            )}
                            {q.explanation && (
                              <p className="text-sm text-muted-foreground mt-2">
                                <strong>Explanation:</strong> {q.explanation}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={editDocOpen} onOpenChange={setEditDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editDocForm.title}
                onChange={(e) => setEditDocForm({ ...editDocForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Summary</Label>
              <Textarea
                value={editDocForm.summary}
                onChange={(e) => setEditDocForm({ ...editDocForm, summary: e.target.value })}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDocOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => docToEdit && updateDocMutation.mutate({ 
                id: docToEdit.id, 
                data: { title: editDocForm.title, summary: editDocForm.summary } 
              })}
              disabled={updateDocMutation.isPending}
            >
              {updateDocMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Document Confirmation */}
      <AlertDialog open={deleteDocOpen} onOpenChange={setDeleteDocOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{docToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => docToDelete && deleteDocMutation.mutate(docToDelete.id)}
            >
              {deleteDocMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Training Plan Dialog - Full Featured */}
      <Dialog open={editPlanOpen} onOpenChange={setEditPlanOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Training Plan</DialogTitle>
          </DialogHeader>
          
          <Tabs value={editPlanTab} onValueChange={setEditPlanTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Plan Details</TabsTrigger>
              <TabsTrigger value="steps">Training Steps ({trainingSteps.length})</TabsTrigger>
              <TabsTrigger value="quizzes">Quizzes ({quizSchedules.length})</TabsTrigger>
            </TabsList>
            
            {/* Plan Details Tab */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={editPlanForm.title}
                  onChange={(e) => setEditPlanForm({ ...editPlanForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  value={editPlanForm.description}
                  onChange={(e) => setEditPlanForm({ ...editPlanForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select 
                  value={editPlanForm.status} 
                  onValueChange={(value) => setEditPlanForm({ ...editPlanForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
            
            {/* Training Steps Tab */}
            <TabsContent value="steps" className="space-y-4 mt-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Manage facility training steps and schedule discussions</p>
                <Button size="sm" onClick={() => {
                  setNewStep({
                    stepNumber: trainingSteps.length + 1,
                    stepTitle: '',
                    theme: '',
                    trainerActivities: '',
                    traineeActivities: '',
                    facilityModules: '',
                    facilityTopicIds: [],
                    scheduledDate: '',
                    scheduledTime: '',
                    duration: 30,
                  });
                  setEditStepIndex(null);
                  setAddStepOpen(true);
                }}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>
              
              {trainingSteps.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No training steps defined yet.</p>
                    <p className="text-sm">Add steps to structure the training program.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {trainingSteps.map((step, index) => (
                    <Card key={index} className={step.completed ? 'bg-green-50 border-green-200' : ''}>
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">Step {step.stepNumber}</Badge>
                              <span className="font-medium">{step.stepTitle}</span>
                              {step.completed && <CheckCircle className="h-4 w-4 text-green-600" />}
                            </div>
                            {step.theme && <p className="text-sm text-muted-foreground mt-1">{step.theme}</p>}
                            <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                              {step.scheduledDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {step.scheduledDate} {step.scheduledTime && `at ${step.scheduledTime}`}
                                </span>
                              )}
                              {step.duration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {step.duration} min
                                </span>
                              )}
                              {((step.facilityTopicIds && step.facilityTopicIds.length > 0) || step.facilityModules) && (
                                <span className="flex items-center gap-1">
                                  <BookOpen className="h-3 w-3" />
                                  {step.facilityTopicIds && step.facilityTopicIds.length > 0 
                                    ? `${step.facilityTopicIds.length} Module(s)` 
                                    : 'Facility Training'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                              setNewStep(step);
                              setEditStepIndex(index);
                              setAddStepOpen(true);
                            }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                              setTrainingSteps(prev => prev.filter((_, i) => i !== index));
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
            
            {/* Quizzes Tab */}
            <TabsContent value="quizzes" className="space-y-4 mt-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">Schedule when quizzes should be taken</p>
                <Button size="sm" onClick={() => {
                  const newQuiz: QuizSchedule = {
                    id: `quiz-${Date.now()}`,
                    stepNumber: 1,
                    quizTitle: '',
                    scheduledDate: '',
                    scheduledTime: '',
                    duration: 15,
                    passingScore: 70,
                    completed: false,
                  };
                  setQuizSchedules(prev => [...prev, newQuiz]);
                }}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Quiz
                </Button>
              </div>
              
              {quizSchedules.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <Brain className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p>No quizzes scheduled yet.</p>
                    <p className="text-sm">Add quizzes to assess trainee knowledge.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {quizSchedules.map((quiz, index) => (
                    <Card key={quiz.id} className={quiz.completed ? 'bg-green-50 border-green-200' : ''}>
                      <CardContent className="py-3">
                        <div className="grid grid-cols-12 gap-3 items-center">
                          <div className="col-span-3">
                            <Label className="text-xs">Quiz Title</Label>
                            <Input
                              value={quiz.quizTitle}
                              onChange={(e) => {
                                const updated = [...quizSchedules];
                                updated[index] = { ...quiz, quizTitle: e.target.value };
                                setQuizSchedules(updated);
                              }}
                              placeholder="Quiz title"
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">After Step</Label>
                            <Select
                              value={quiz.stepNumber.toString()}
                              onValueChange={(v) => {
                                const updated = [...quizSchedules];
                                updated[index] = { ...quiz, stepNumber: parseInt(v) };
                                setQuizSchedules(updated);
                              }}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {trainingSteps.length > 0 ? (
                                  trainingSteps.map((step, idx) => (
                                    <SelectItem key={idx} value={step.stepNumber.toString()}>
                                      Step {step.stepNumber}: {step.stepTitle || 'Untitled'}
                                    </SelectItem>
                                  ))
                                ) : (
                                  [1,2,3,4].map(n => (
                                    <SelectItem key={n} value={n.toString()}>Step {n}</SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={quiz.scheduledDate || ''}
                              onChange={(e) => {
                                const updated = [...quizSchedules];
                                updated[index] = { ...quiz, scheduledDate: e.target.value };
                                setQuizSchedules(updated);
                              }}
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">Time</Label>
                            <Input
                              type="time"
                              value={quiz.scheduledTime || ''}
                              onChange={(e) => {
                                const updated = [...quizSchedules];
                                updated[index] = { ...quiz, scheduledTime: e.target.value };
                                setQuizSchedules(updated);
                              }}
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs">Passing %</Label>
                            <Input
                              type="number"
                              value={quiz.passingScore || 70}
                              onChange={(e) => {
                                const updated = [...quizSchedules];
                                updated[index] = { ...quiz, passingScore: parseInt(e.target.value) };
                                setQuizSchedules(updated);
                              }}
                              className="h-8"
                            />
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                              setQuizSchedules(prev => prev.filter((_, i) => i !== index));
                            }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditPlanOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (!planToEdit) return;
                
                // Build updated plan structure
                const currentStructure = planToEdit.planStructure ? JSON.parse(planToEdit.planStructure) : {};
                const updatedStructure = {
                  ...currentStructure,
                  steps: trainingSteps,
                };
                
                updatePlanMutation.mutate({ 
                  id: planToEdit.id, 
                  data: { 
                    title: editPlanForm.title, 
                    description: editPlanForm.description,
                    status: editPlanForm.status,
                    planStructure: JSON.stringify(updatedStructure),
                    quizQuestions: JSON.stringify(quizSchedules),
                  } 
                });
              }}
              disabled={updatePlanMutation.isPending}
            >
              {updatePlanMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add/Edit Training Step Dialog */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editStepIndex !== null ? 'Edit Training Step' : 'Add Training Step'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Step Number</Label>
                <Select
                  value={newStep.stepNumber?.toString() || '1'}
                  onValueChange={(v) => setNewStep({ ...newStep, stepNumber: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Step 1: Trainer Does / Explains</SelectItem>
                    <SelectItem value="2">Step 2: Trainer Does / Trainee Explains</SelectItem>
                    <SelectItem value="3">Step 3: Trainee Does / Trainer Explains</SelectItem>
                    <SelectItem value="4">Step 4: Trainee Does / Trainee Explains</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={newStep.duration || 30}
                  onChange={(e) => setNewStep({ ...newStep, duration: parseInt(e.target.value) })}
                />
              </div>
            </div>
            <div>
              <Label>Step Title</Label>
              <Input
                value={newStep.stepTitle || ''}
                onChange={(e) => setNewStep({ ...newStep, stepTitle: e.target.value })}
                placeholder="e.g., Introduction to Equipment"
              />
            </div>
            <div>
              <Label>Theme / Topic</Label>
              <Textarea
                value={newStep.theme || ''}
                onChange={(e) => setNewStep({ ...newStep, theme: e.target.value })}
                placeholder="What will be covered in this step"
                rows={2}
              />
            </div>
            <div>
              <Label>Trainer Activities</Label>
              <Textarea
                value={newStep.trainerActivities || ''}
                onChange={(e) => setNewStep({ ...newStep, trainerActivities: e.target.value })}
                placeholder="What the trainer will do/demonstrate"
                rows={2}
              />
            </div>
            <div>
              <Label>Trainee Activities</Label>
              <Textarea
                value={newStep.traineeActivities || ''}
                onChange={(e) => setNewStep({ ...newStep, traineeActivities: e.target.value })}
                placeholder="What the trainee will do/practice"
                rows={2}
              />
            </div>
            <div>
              <Label>Facility Training Modules</Label>
              <div className="border rounded-md p-3 max-h-40 overflow-y-auto space-y-2">
                {facilityTopics.filter(ft => ft.isActive).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No facility modules available</p>
                ) : (
                  facilityTopics.filter(ft => ft.isActive).map((topic) => (
                    <div key={topic.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`facility-${topic.id}`}
                        checked={(newStep.facilityTopicIds || []).includes(topic.id)}
                        onCheckedChange={(checked) => {
                          const currentIds = newStep.facilityTopicIds || [];
                          if (checked) {
                            setNewStep({ ...newStep, facilityTopicIds: [...currentIds, topic.id] });
                          } else {
                            setNewStep({ ...newStep, facilityTopicIds: currentIds.filter(id => id !== topic.id) });
                          }
                        }}
                      />
                      <label htmlFor={`facility-${topic.id}`} className="text-sm cursor-pointer flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{topic.code}</Badge>
                        {topic.title}
                        {topic.estimatedMinutes && (
                          <span className="text-xs text-muted-foreground">({topic.estimatedMinutes} min)</span>
                        )}
                      </label>
                    </div>
                  ))
                )}
              </div>
              {(newStep.facilityTopicIds || []).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {(newStep.facilityTopicIds || []).length} module(s) selected
                </p>
              )}
            </div>
            <div>
              <Label>Additional Equipment Notes</Label>
              <Textarea
                value={newStep.facilityModules || ''}
                onChange={(e) => setNewStep({ ...newStep, facilityModules: e.target.value })}
                placeholder="Any additional equipment or notes"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={newStep.scheduledDate || ''}
                  onChange={(e) => setNewStep({ ...newStep, scheduledDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Scheduled Time</Label>
                <Input
                  type="time"
                  value={newStep.scheduledTime || ''}
                  onChange={(e) => setNewStep({ ...newStep, scheduledTime: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStepOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              const step: TrainingStep = {
                stepNumber: newStep.stepNumber || 1,
                stepTitle: newStep.stepTitle || '',
                theme: newStep.theme || '',
                trainerActivities: newStep.trainerActivities || '',
                traineeActivities: newStep.traineeActivities || '',
                facilityModules: newStep.facilityModules || '',
                facilityTopicIds: newStep.facilityTopicIds || [],
                scheduledDate: newStep.scheduledDate,
                scheduledTime: newStep.scheduledTime,
                duration: newStep.duration,
                completed: false,
              };
              
              if (editStepIndex !== null) {
                setTrainingSteps(prev => prev.map((s, i) => i === editStepIndex ? step : s));
              } else {
                setTrainingSteps(prev => [...prev, step]);
              }
              setAddStepOpen(false);
            }}>
              {editStepIndex !== null ? 'Update Step' : 'Add Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Training Plan Confirmation */}
      <AlertDialog open={deletePlanOpen} onOpenChange={setDeletePlanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{planToDelete?.title}"? This will also remove all topic assignments for this plan. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => planToDelete && deletePlanMutation.mutate(planToDelete.id)}
            >
              {deletePlanMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Topic Dialog */}
      <Dialog open={newTopicOpen} onOpenChange={setNewTopicOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Training Topic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={newTopicForm.title}
                onChange={(e) => setNewTopicForm({ ...newTopicForm, title: e.target.value })}
                placeholder="Enter topic title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newTopicForm.description}
                onChange={(e) => setNewTopicForm({ ...newTopicForm, description: e.target.value })}
                placeholder="Brief description of the topic"
                rows={3}
              />
            </div>
            <div>
              <Label>Objectives</Label>
              <Textarea
                value={newTopicForm.objectives}
                onChange={(e) => setNewTopicForm({ ...newTopicForm, objectives: e.target.value })}
                placeholder="Learning objectives (one per line)"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={newTopicForm.estimatedDuration}
                  onChange={(e) => setNewTopicForm({ ...newTopicForm, estimatedDuration: e.target.value })}
                  placeholder="30"
                />
              </div>
              <div>
                <Label>Difficulty Level</Label>
                <Select 
                  value={newTopicForm.difficultyLevel} 
                  onValueChange={(value) => setNewTopicForm({ ...newTopicForm, difficultyLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select 
                value={newTopicForm.categoryId} 
                onValueChange={(value) => setNewTopicForm({ ...newTopicForm, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTopicOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => createTopicMutation.mutate()}
              disabled={!newTopicForm.title || createTopicMutation.isPending}
            >
              {createTopicMutation.isPending ? 'Creating...' : 'Create Topic'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Topic Dialog */}
      <Dialog open={editTopicOpen} onOpenChange={setEditTopicOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Training Topic</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={editTopicForm.title}
                onChange={(e) => setEditTopicForm({ ...editTopicForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editTopicForm.description}
                onChange={(e) => setEditTopicForm({ ...editTopicForm, description: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label>Objectives</Label>
              <Textarea
                value={editTopicForm.objectives}
                onChange={(e) => setEditTopicForm({ ...editTopicForm, objectives: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={editTopicForm.estimatedDuration}
                  onChange={(e) => setEditTopicForm({ ...editTopicForm, estimatedDuration: e.target.value })}
                />
              </div>
              <div>
                <Label>Difficulty Level</Label>
                <Select 
                  value={editTopicForm.difficultyLevel} 
                  onValueChange={(value) => setEditTopicForm({ ...editTopicForm, difficultyLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Select 
                value={editTopicForm.categoryId} 
                onValueChange={(value) => setEditTopicForm({ ...editTopicForm, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTopicOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => topicToEdit && updateTopicMutation.mutate({ 
                id: topicToEdit.id, 
                data: { 
                  title: editTopicForm.title, 
                  description: editTopicForm.description || null,
                  objectives: editTopicForm.objectives || null,
                  estimatedDuration: editTopicForm.estimatedDuration ? parseInt(editTopicForm.estimatedDuration) : null,
                  difficultyLevel: editTopicForm.difficultyLevel,
                  categoryId: editTopicForm.categoryId ? parseInt(editTopicForm.categoryId) : null,
                } 
              })}
              disabled={!editTopicForm.title || updateTopicMutation.isPending}
            >
              {updateTopicMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Topic Confirmation */}
      <AlertDialog open={deleteTopicOpen} onOpenChange={setDeleteTopicOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Training Topic</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{topicToDelete?.title}"? This will also remove all associated materials and assignments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => topicToDelete && deleteTopicMutation.mutate(topicToDelete.id)}
            >
              {deleteTopicMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

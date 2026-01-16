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
  Eye, Brain, GraduationCap
} from 'lucide-react';

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
  
  const [newCategory, setNewCategory] = useState({ name: '', type: 'custom', description: '', color: '#3B82F6' });
  const [newDoc, setNewDoc] = useState({ title: '', extractedText: '', categoryIds: [] as number[] });
  const [selectedTrainee, setSelectedTrainee] = useState<string>('');

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
      setNewDoc({ title: '', extractedText: '', categoryIds: [] });
      toast({ title: 'Document uploaded and processed' });
    },
    onError: (error: any) => {
      toast({ title: 'Error uploading document', description: error.message, variant: 'destructive' });
    },
  });

  const generateTopicMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/generate-topic', {
        method: 'POST',
        body: JSON.stringify({
          documentIds: selectedDocuments,
          categoryId: categoryFilter !== 'all' ? parseInt(categoryFilter) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/topics'] });
      setGenerateTopicOpen(false);
      setSelectedDocuments([]);
      toast({ title: 'Training topic generated with 4-Step materials and quiz!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error generating topic', description: error.message, variant: 'destructive' });
    },
  });

  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/training/content-library/generate-training-plan', {
        method: 'POST',
        body: JSON.stringify({
          traineeId: parseInt(selectedTrainee),
          topicIds: selectedTopics,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/content-library/training-plans'] });
      setAssignTrainingOpen(false);
      setSelectedTopics([]);
      setSelectedTrainee('');
      toast({ title: 'Training plan created and topics assigned!' });
    },
    onError: (error: any) => {
      toast({ title: 'Error creating training plan', description: error.message, variant: 'destructive' });
    },
  });

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
                <Label>Document Content (paste text or upload will extract)</Label>
                <Textarea 
                  value={newDoc.extractedText}
                  onChange={(e) => setNewDoc({ ...newDoc, extractedText: e.target.value })}
                  placeholder="Paste the document content here..."
                  className="min-h-[200px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => uploadDocumentMutation.mutate()} disabled={!newDoc.title || !newDoc.extractedText || uploadDocumentMutation.isPending}>
                {uploadDocumentMutation.isPending ? 'Processing with AI...' : 'Import & Process'}
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
                    <Badge variant={doc.status === 'ready' ? 'default' : 'secondary'}>
                      {doc.status}
                    </Badge>
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
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleViewTopic(topic.id); }}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
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

      <Dialog open={assignTrainingOpen} onOpenChange={setAssignTrainingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-500" />
              Assign Training to Trainee
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              AI will organize {selectedTopics.length} topic(s) into an optimal 4-day training plan.
            </p>
            <div>
              <Label>Select Trainee</Label>
              <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an employee" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTrainingOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => generatePlanMutation.mutate()} 
              disabled={!selectedTrainee || generatePlanMutation.isPending}
              className="bg-gradient-to-r from-green-500 to-teal-500"
            >
              {generatePlanMutation.isPending ? 'Creating Plan...' : 'Create 4-Day Training Plan'}
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
    </div>
  );
}

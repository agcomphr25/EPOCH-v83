import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  FileText, 
  Upload, 
  Brain, 
  Sparkles, 
  FolderOpen, 
  Eye, 
  FileSpreadsheet,
  ClipboardList,
  BookOpen,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface RoutingDocument {
  id: string;
  title: string;
  partNumber: string | null;
  departmentName: string | null;
  documentType: string;
  sourceType: string;
  fileName: string | null;
  fileUrl: string | null;
  aiExtractedContent: any;
  aiExtractedFields: any[];
  aiProcessedAt: string | null;
  isTemplate: boolean;
  createdAt: string;
}

interface DocumentTemplate {
  id: string;
  templateName: string;
  templateType: string;
  description: string | null;
  learnedFromCount: number;
  structure: any;
  sections: any[];
  defaultFields: any[];
  createdAt: string;
}

interface SpecSheet {
  id: string;
  title: string;
  partNumber: string | null;
  specifications: any;
  isTemplate: boolean;
  createdAt: string;
}

export default function RoutingDocumentManagement() {
  const [activeTab, setActiveTab] = useState('documents');
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showParseDialog, setShowParseDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showLearnDialog, setShowLearnDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<RoutingDocument | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  
  const [uploadForm, setUploadForm] = useState({
    title: '',
    partNumber: '',
    departmentName: '',
    documentType: 'work_instruction',
    isTemplate: false,
    file: null as File | null,
  });
  
  const [parseContent, setParseContent] = useState('');
  const [generateForm, setGenerateForm] = useState({
    partNumber: '',
    partName: '',
    templateId: '',
  });
  const [learnForm, setLearnForm] = useState({
    templateName: '',
    templateType: 'work_instruction',
    description: '',
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading: loadingDocs } = useQuery<RoutingDocument[]>({
    queryKey: ['/api/routing-documents'],
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<DocumentTemplate[]>({
    queryKey: ['/api/routing-documents/templates/list'],
  });

  const { data: specSheets = [], isLoading: loadingSpecs } = useQuery<SpecSheet[]>({
    queryKey: ['/api/routing-documents/spec-sheets'],
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: { file: File; title: string; partNumber: string; departmentName: string; documentType: string; isTemplate: boolean }) => {
      // Step 1: Request upload URL
      const urlResponse = await apiRequest('/api/routing-documents/request-upload-url', {
        method: 'POST',
        body: { name: data.file.name, size: data.file.size, contentType: data.file.type },
      });
      
      // Step 2: Upload file to presigned URL
      const uploadRes = await fetch(urlResponse.uploadURL, {
        method: 'PUT',
        body: data.file,
        headers: { 'Content-Type': data.file.type || 'application/octet-stream' },
      });
      
      if (!uploadRes.ok) throw new Error('File upload failed');
      
      // Step 3: Complete upload with metadata
      return apiRequest('/api/routing-documents/complete-upload', {
        method: 'POST',
        body: {
          objectPath: urlResponse.objectPath,
          title: data.title || data.file.name,
          originalFileName: data.file.name,
          fileSize: data.file.size,
          mimeType: data.file.type,
          partNumber: data.partNumber,
          departmentName: data.departmentName,
          documentType: data.documentType,
          isTemplate: data.isTemplate,
        },
      });
    },
    onSuccess: () => {
      toast({ title: 'Success', description: 'Document uploaded successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowUploadDialog(false);
      setUploadForm({ title: '', partNumber: '', departmentName: '', documentType: 'work_instruction', isTemplate: false, file: null });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to upload document', variant: 'destructive' });
    },
  });

  const parseMutation = useMutation({
    mutationFn: async ({ id, textContent }: { id: string; textContent: string }) => {
      return apiRequest(`/api/routing-documents/${id}/ai-parse`, {
        method: 'POST',
        body: { textContent },
      });
    },
    onSuccess: () => {
      toast({ title: 'AI Analysis Complete', description: 'Document has been analyzed and fields extracted' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowParseDialog(false);
      setParseContent('');
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to parse document', variant: 'destructive' });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: { partNumber: string; partName: string; templateId?: string; referenceDocumentIds?: string[] }) => {
      return apiRequest('/api/routing-documents/ai-generate', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      toast({ title: 'Document Generated', description: 'New document has been created from AI analysis' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents'] });
      setShowGenerateDialog(false);
      setGenerateForm({ partNumber: '', partName: '', templateId: '' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to generate document', variant: 'destructive' });
    },
  });

  const learnMutation = useMutation({
    mutationFn: async (data: { templateName: string; templateType: string; description: string; referenceDocumentIds: string[] }) => {
      return apiRequest('/api/routing-documents/templates/learn', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      toast({ title: 'Template Created', description: 'AI has learned from the selected documents and created a template' });
      queryClient.invalidateQueries({ queryKey: ['/api/routing-documents/templates/list'] });
      setShowLearnDialog(false);
      setLearnForm({ templateName: '', templateType: 'work_instruction', description: '' });
      setSelectedDocuments([]);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to create template', variant: 'destructive' });
    },
  });

  const handleUpload = () => {
    if (!uploadForm.file) {
      toast({ title: 'Error', description: 'Please select a file', variant: 'destructive' });
      return;
    }
    
    uploadMutation.mutate({
      file: uploadForm.file,
      title: uploadForm.title,
      partNumber: uploadForm.partNumber,
      departmentName: uploadForm.departmentName,
      documentType: uploadForm.documentType,
      isTemplate: uploadForm.isTemplate,
    });
  };

  const handleParse = () => {
    if (!selectedDocument || !parseContent.trim()) {
      toast({ title: 'Error', description: 'Please enter document content to analyze', variant: 'destructive' });
      return;
    }
    parseMutation.mutate({ id: selectedDocument.id, textContent: parseContent });
  };

  const handleGenerate = () => {
    if (!generateForm.partNumber) {
      toast({ title: 'Error', description: 'Please enter a part number', variant: 'destructive' });
      return;
    }
    generateMutation.mutate({
      partNumber: generateForm.partNumber,
      partName: generateForm.partName,
      templateId: generateForm.templateId || undefined,
      referenceDocumentIds: selectedDocuments.length > 0 ? selectedDocuments : undefined,
    });
  };

  const handleLearn = () => {
    if (!learnForm.templateName || selectedDocuments.length === 0) {
      toast({ title: 'Error', description: 'Please enter a template name and select at least one document', variant: 'destructive' });
      return;
    }
    learnMutation.mutate({
      ...learnForm,
      referenceDocumentIds: selectedDocuments,
    });
  };

  const toggleDocumentSelection = (id: string) => {
    setSelectedDocuments(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const getDocTypeIcon = (type: string) => {
    switch (type) {
      case 'work_instruction': return <ClipboardList className="h-4 w-4" />;
      case 'spec_sheet': return <FileSpreadsheet className="h-4 w-4" />;
      case 'traveler_template': return <BookOpen className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Routing Document Management</h1>
          <p className="text-muted-foreground">
            Work instructions, spec sheets, and AI-powered document generation for part routing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowLearnDialog(true)} disabled={selectedDocuments.length === 0}>
            <Brain className="h-4 w-4 mr-2" />
            Learn Template ({selectedDocuments.length})
          </Button>
          <Button variant="outline" onClick={() => setShowGenerateDialog(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            AI Generate
          </Button>
          <Button onClick={() => setShowUploadDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{documents.length}</div>
                <div className="text-sm text-muted-foreground">Documents</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-8 w-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{templates.length}</div>
                <div className="text-sm text-muted-foreground">Templates</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-8 w-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{specSheets.length}</div>
                <div className="text-sm text-muted-foreground">Spec Sheets</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Brain className="h-8 w-8 text-amber-500" />
              <div>
                <div className="text-2xl font-bold">{documents.filter(d => d.aiProcessedAt).length}</div>
                <div className="text-sm text-muted-foreground">AI Analyzed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="specsheets">Spec Sheets</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Routing Documents</CardTitle>
              <CardDescription>Work instructions, procedures, and traveler templates</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDocs ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>AI Analyzed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDocuments.includes(doc.id)}
                            onCheckedChange={() => toggleDocumentSelection(doc.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getDocTypeIcon(doc.documentType)}
                            <span className="font-medium">{doc.title}</span>
                            {doc.isTemplate && <Badge variant="secondary">Template</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{doc.documentType.replace('_', ' ')}</Badge>
                        </TableCell>
                        <TableCell>{doc.partNumber || '-'}</TableCell>
                        <TableCell>{doc.departmentName || '-'}</TableCell>
                        <TableCell>
                          {doc.aiProcessedAt ? (
                            <Badge className="bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Analyzed
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedDocument(doc);
                                setShowParseDialog(true);
                              }}
                            >
                              <Brain className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {documents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No documents uploaded yet. Upload your first document to get started.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Templates</CardTitle>
              <CardDescription>AI-learned templates from your existing documents</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTemplates ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <Card key={template.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">{template.templateName}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{template.templateType.replace('_', ' ')}</Badge>
                            <Badge variant="secondary">Learned from {template.learnedFromCount} docs</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {template.defaultFields?.length || 0} fields defined
                          </div>
                          <Button variant="outline" className="w-full mt-2" size="sm">
                            <Sparkles className="h-4 w-4 mr-2" />
                            Use Template
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {templates.length === 0 && (
                    <div className="col-span-3 text-center py-8 text-muted-foreground">
                      No templates yet. Select documents and click "Learn Template" to create one.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="specsheets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Spec Sheets</CardTitle>
              <CardDescription>Generalized specification documents</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSpecs ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {specSheets.map((sheet) => (
                      <TableRow key={sheet.id}>
                        <TableCell className="font-medium">{sheet.title}</TableCell>
                        <TableCell>{sheet.partNumber || '-'}</TableCell>
                        <TableCell>
                          {sheet.isTemplate ? <Badge>Template</Badge> : '-'}
                        </TableCell>
                        <TableCell>{new Date(sheet.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {specSheets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No spec sheets uploaded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a work instruction, spec sheet, or traveler template</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File</Label>
              <Input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
              />
            </div>
            <div>
              <Label>Title</Label>
              <Input
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                placeholder="Document title"
              />
            </div>
            <div>
              <Label>Document Type</Label>
              <Select
                value={uploadForm.documentType}
                onValueChange={(value) => setUploadForm({ ...uploadForm, documentType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_instruction">Work Instruction</SelectItem>
                  <SelectItem value="procedure">Procedure</SelectItem>
                  <SelectItem value="specification">Specification</SelectItem>
                  <SelectItem value="traveler_template">Traveler Template</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Part Number (Optional)</Label>
                <Input
                  value={uploadForm.partNumber}
                  onChange={(e) => setUploadForm({ ...uploadForm, partNumber: e.target.value })}
                  placeholder="e.g., AG-001"
                />
              </div>
              <div>
                <Label>Department (Optional)</Label>
                <Input
                  value={uploadForm.departmentName}
                  onChange={(e) => setUploadForm({ ...uploadForm, departmentName: e.target.value })}
                  placeholder="e.g., Layup"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="isTemplate"
                checked={uploadForm.isTemplate}
                onCheckedChange={(checked) => setUploadForm({ ...uploadForm, isTemplate: !!checked })}
              />
              <Label htmlFor="isTemplate">Save as template for future use</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
              {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showParseDialog} onOpenChange={setShowParseDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI Document Analysis</DialogTitle>
            <DialogDescription>
              Paste the document content below for AI to extract routing steps, data fields, and requirements
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDocument && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">{selectedDocument.title}</div>
                <div className="text-sm text-muted-foreground">{selectedDocument.documentType.replace('_', ' ')}</div>
              </div>
            )}
            <div>
              <Label>Document Content</Label>
              <Textarea
                value={parseContent}
                onChange={(e) => setParseContent(e.target.value)}
                placeholder="Paste the text content from your document here..."
                className="min-h-[300px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowParseDialog(false)}>Cancel</Button>
            <Button onClick={handleParse} disabled={parseMutation.isPending}>
              {parseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Analyze with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI Generate Document</DialogTitle>
            <DialogDescription>
              Generate a new document using AI based on templates and reference documents
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Part Number *</Label>
              <Input
                value={generateForm.partNumber}
                onChange={(e) => setGenerateForm({ ...generateForm, partNumber: e.target.value })}
                placeholder="e.g., AG-001"
              />
            </div>
            <div>
              <Label>Part Name</Label>
              <Input
                value={generateForm.partName}
                onChange={(e) => setGenerateForm({ ...generateForm, partName: e.target.value })}
                placeholder="e.g., Carbon Fiber Stock"
              />
            </div>
            <div>
              <Label>Use Template (Optional)</Label>
              <Select
                value={generateForm.templateId}
                onValueChange={(value) => setGenerateForm({ ...generateForm, templateId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.templateName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDocuments.length > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm font-medium">Reference Documents Selected: {selectedDocuments.length}</div>
                <div className="text-xs text-muted-foreground">AI will learn from these documents to generate the new one</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLearnDialog} onOpenChange={setShowLearnDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Learn Template from Documents</DialogTitle>
            <DialogDescription>
              AI will analyze the selected documents and create a reusable template
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="text-sm font-medium">Selected Documents: {selectedDocuments.length}</div>
              <ScrollArea className="h-24 mt-2">
                {documents.filter(d => selectedDocuments.includes(d.id)).map(doc => (
                  <div key={doc.id} className="text-xs text-muted-foreground">{doc.title}</div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <Label>Template Name *</Label>
              <Input
                value={learnForm.templateName}
                onChange={(e) => setLearnForm({ ...learnForm, templateName: e.target.value })}
                placeholder="e.g., Standard Work Instruction"
              />
            </div>
            <div>
              <Label>Template Type</Label>
              <Select
                value={learnForm.templateType}
                onValueChange={(value) => setLearnForm({ ...learnForm, templateType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_instruction">Work Instruction</SelectItem>
                  <SelectItem value="spec_sheet">Spec Sheet</SelectItem>
                  <SelectItem value="traveler">Traveler</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={learnForm.description}
                onChange={(e) => setLearnForm({ ...learnForm, description: e.target.value })}
                placeholder="What is this template for?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLearnDialog(false)}>Cancel</Button>
            <Button onClick={handleLearn} disabled={learnMutation.isPending}>
              {learnMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
              Learn & Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

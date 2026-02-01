import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Upload, FileText, Send, Eye, Trash2, Edit, PenLine, Wand2, AlertTriangle, CheckCircle, FolderOpen } from 'lucide-react';

interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'email' | 'phone' | 'textarea' | 'checkbox' | 'select';
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
  pdfFieldName?: string;
  x?: number;
  y?: number;
  page?: number;
  fontSize?: number;
  maxLength?: number;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  version: number;
  templatePdfPath: string;
  fieldDefsJson: FieldDef[];
  requiresSignature: boolean;
  signaturePlacement: { x: number; y: number; page: number; width: number; height: number } | null;
  isActive: boolean;
  createdAt: string;
}

interface Instance {
  id: string;
  publicSignatureId: string;
  recipientEmail: string | null;
  recipientName: string | null;
  status: string;
  createdAt: string;
  signedAt: string | null;
}

interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  createdAt: string;
}

interface ScaffoldResult {
  success: boolean;
  templateName: string;
  pageCount: number;
  fieldDefsJson: FieldDef[];
  signaturePlacement: {
    x: number;
    y: number;
    page: number;
    width: number;
    height: number;
  };
  warnings: string[];
  isImageOnly: boolean;
  textDensity: number;
  detectedBlanks: number;
  mediaItem: {
    id: string;
    filename: string;
    storagePath: string;
  };
}

const defaultFieldDefs: FieldDef[] = [
  { name: 'full_name', label: 'Full Name', type: 'text', required: true, x: 150, y: 700, page: 0 },
  { name: 'email', label: 'Email Address', type: 'email', required: true, x: 150, y: 680, page: 0 },
  { name: 'date', label: 'Date', type: 'date', required: true, x: 150, y: 660, page: 0 },
];

export default function FillablePdfTemplatesAdmin() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isInstanceOpen, setIsInstanceOpen] = useState(false);
  
  // Scaffold state
  const [isScaffoldOpen, setIsScaffoldOpen] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string>('');
  const [scaffoldResult, setScaffoldResult] = useState<ScaffoldResult | null>(null);
  const [scaffoldTemplateName, setScaffoldTemplateName] = useState('');
  
  // Form state for creating template
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [fieldDefsJson, setFieldDefsJson] = useState(JSON.stringify(defaultFieldDefs, null, 2));
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  // Form state for creating instance
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');

  // Fetch templates
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['/api/pdf-templates'],
  });

  // Fetch PDF media items for scaffold dialog
  const { data: mediaItems = [] } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', 'pdfs'],
    queryFn: async () => {
      const response = await fetch('/api/media?mimeType=application/pdf&limit=100');
      if (!response.ok) throw new Error('Failed to fetch media items');
      const data = await response.json();
      return data.items || data;
    },
    enabled: isScaffoldOpen,
  });

  // Fetch instances for selected template
  const { data: instances = [] } = useQuery<Instance[]>({
    queryKey: ['/api/pdf-templates', selectedTemplate?.id, 'instances'],
    enabled: !!selectedTemplate,
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/pdf-templates', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create template');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      setIsCreateOpen(false);
      resetForm();
      toast({ title: 'Template created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Create instance mutation
  const createInstanceMutation = useMutation({
    mutationFn: async (data: { templateId: string; recipientEmail?: string; recipientName?: string }) => {
      return apiRequest('/api/pdf-templates/instances', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: { instance: Instance; publicUrl: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates', selectedTemplate?.id, 'instances'] });
      setIsInstanceOpen(false);
      setRecipientEmail('');
      setRecipientName('');
      toast({
        title: 'Instance created',
        description: `Public URL: ${data.publicUrl}`,
      });
      // Copy to clipboard
      navigator.clipboard.writeText(data.publicUrl);
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/pdf-templates/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      toast({ title: 'Template deactivated' });
    },
  });

  // Scaffold PDF mutation - analyze PDF
  const scaffoldMutation = useMutation({
    mutationFn: async (mediaItemId: string) => {
      return apiRequest('/api/pdf-templates/scaffold', {
        method: 'POST',
        body: JSON.stringify({ mediaItemId }),
      });
    },
    onSuccess: (data: ScaffoldResult) => {
      setScaffoldResult(data);
      setScaffoldTemplateName(data.templateName);
      toast({ title: 'PDF analyzed successfully', description: `Found ${data.detectedBlanks} blanks, created ${data.fieldDefsJson.length} fields` });
    },
    onError: (error: Error) => {
      toast({ title: 'Analysis failed', description: error.message, variant: 'destructive' });
    },
  });

  // Create template from scaffold result
  const createFromScaffoldMutation = useMutation({
    mutationFn: async (data: { 
      mediaItemId: string; 
      templateName: string; 
      fieldDefsJson: FieldDef[]; 
      signaturePlacement: ScaffoldResult['signaturePlacement'];
    }) => {
      return apiRequest('/api/pdf-templates/scaffold/create', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/pdf-templates'] });
      setIsScaffoldOpen(false);
      resetScaffoldState();
      toast({ title: 'Template created from PDF', description: 'You can now edit the field positions' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const resetScaffoldState = () => {
    setSelectedMediaId('');
    setScaffoldResult(null);
    setScaffoldTemplateName('');
  };

  const resetForm = () => {
    setTemplateName('');
    setTemplateDescription('');
    setFieldDefsJson(JSON.stringify(defaultFieldDefs, null, 2));
    setRequiresSignature(true);
    setPdfFile(null);
  };

  const handleCreateTemplate = async () => {
    if (!pdfFile) {
      toast({ title: 'Please upload a PDF file', variant: 'destructive' });
      return;
    }

    let parsedFieldDefs: FieldDef[];
    try {
      parsedFieldDefs = JSON.parse(fieldDefsJson);
    } catch {
      toast({ title: 'Invalid JSON in field definitions', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('templatePdf', pdfFile);
    formData.append('data', JSON.stringify({
      name: templateName,
      description: templateDescription,
      fieldDefsJson: parsedFieldDefs,
      requiresSignature,
    }));

    createTemplateMutation.mutate(formData);
  };

  const handleCreateInstance = () => {
    if (!selectedTemplate) return;
    createInstanceMutation.mutate({
      templateId: selectedTemplate.id,
      recipientEmail: recipientEmail || undefined,
      recipientName: recipientName || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      draft: 'outline',
      sent: 'secondary',
      viewed: 'default',
      signed: 'default',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  if (isLoading) {
    return <div className="p-8">Loading templates...</div>;
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Fillable PDF Templates</h1>
          <p className="text-muted-foreground">
            Manage PDF templates for customer fill-and-sign workflow
            <span className="mx-2">|</span>
            <Link href="/media-library" className="text-primary hover:underline inline-flex items-center gap-1">
              <FolderOpen className="h-4 w-4" />
              Open Media Library
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isScaffoldOpen} onOpenChange={(open) => { setIsScaffoldOpen(open); if (!open) resetScaffoldState(); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Wand2 className="w-4 h-4 mr-2" />
                Scaffold from Media
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Scaffold Template from PDF</DialogTitle>
                <DialogDescription>
                  Select a PDF from Media Library to automatically detect and create fillable fields
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {!scaffoldResult ? (
                  <>
                    <div className="space-y-2">
                      <Label>Select PDF from Media Library</Label>
                      <Select value={selectedMediaId} onValueChange={setSelectedMediaId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a PDF file..." />
                        </SelectTrigger>
                        <SelectContent>
                          {mediaItems.filter(m => m.mimeType === 'application/pdf').map((item) => (
                            <SelectItem key={item.id} value={item.id}>
                              {item.filename}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {mediaItems.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          No PDFs found in Media Library. Upload a PDF first.
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => scaffoldMutation.mutate(selectedMediaId)}
                      disabled={!selectedMediaId || scaffoldMutation.isPending}
                      className="w-full"
                    >
                      {scaffoldMutation.isPending ? 'Analyzing PDF...' : 'Analyze PDF'}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium">PDF Analysis Complete</span>
                    </div>
                    
                    {scaffoldResult.warnings.length > 0 && (
                      <Alert variant="default" className="mb-4">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <ul className="list-disc list-inside">
                            {scaffoldResult.warnings.map((w, i) => (
                              <li key={i} className="text-sm">{w}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground">Pages</div>
                        <div className="font-medium">{scaffoldResult.pageCount}</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground">Blanks Detected</div>
                        <div className="font-medium">{scaffoldResult.detectedBlanks}</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground">Fields Created</div>
                        <div className="font-medium">{scaffoldResult.fieldDefsJson.length}</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-muted-foreground">Text Density</div>
                        <div className="font-medium">{scaffoldResult.textDensity} chars/page</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Template Name</Label>
                      <Input
                        value={scaffoldTemplateName}
                        onChange={(e) => setScaffoldTemplateName(e.target.value)}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Detected Fields</Label>
                      <div className="border rounded-lg max-h-48 overflow-y-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Type</TableHead>
                              <TableHead>Label</TableHead>
                              <TableHead>Page</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {scaffoldResult.fieldDefsJson.map((field, idx) => (
                              <TableRow key={idx}>
                                <TableCell className="font-mono text-xs">{field.name}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{field.type}</Badge>
                                </TableCell>
                                <TableCell>{field.label}</TableCell>
                                <TableCell>{(field.page || 0) + 1}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Field positions can be fine-tuned in the visual editor after creation
                      </p>
                    </div>
                    
                    <div className="flex gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={resetScaffoldState}
                        className="flex-1"
                      >
                        Start Over
                      </Button>
                      <Button
                        onClick={() => createFromScaffoldMutation.mutate({
                          mediaItemId: scaffoldResult.mediaItem.id,
                          templateName: scaffoldTemplateName,
                          fieldDefsJson: scaffoldResult.fieldDefsJson,
                          signaturePlacement: scaffoldResult.signaturePlacement,
                        })}
                        disabled={!scaffoldTemplateName || createFromScaffoldMutation.isPending}
                        className="flex-1"
                      >
                        {createFromScaffoldMutation.isPending ? 'Creating...' : 'Create Template'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Template
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
              <DialogDescription>Upload a PDF and define fillable fields</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Customer Agreement Form"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Brief description of the template"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pdf">PDF File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pdf"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                  {pdfFile && <FileText className="w-5 h-5 text-green-600" />}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fieldDefs">Field Definitions (JSON)</Label>
                <Textarea
                  id="fieldDefs"
                  value={fieldDefsJson}
                  onChange={(e) => setFieldDefsJson(e.target.value)}
                  className="font-mono text-sm h-64"
                />
                <p className="text-xs text-muted-foreground">
                  Define fields with name, label, type (text/number/date/email/phone/textarea/checkbox/select), 
                  and optional PDF coordinates (x, y, page)
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="requiresSignature"
                  checked={requiresSignature}
                  onCheckedChange={setRequiresSignature}
                />
                <Label htmlFor="requiresSignature">Requires Signature</Label>
              </div>
              <Button
                onClick={handleCreateTemplate}
                disabled={createTemplateMutation.isPending || !templateName || !pdfFile}
                className="w-full"
              >
                {createTemplateMutation.isPending ? 'Creating...' : 'Create Template'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.filter(t => t.isActive).map((template) => (
          <Card key={template.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription>{template.description || 'No description'}</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTemplateMutation.mutate(template.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fields:</span>
                  <span>{template.fieldDefsJson?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Signature:</span>
                  <span>{template.requiresSignature ? 'Required' : 'Optional'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Version:</span>
                  <span>{template.version}</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                <Link href={`/fillable-pdf-templates/${template.id}/editor`}>
                  <Button variant="outline" size="sm">
                    <PenLine className="w-4 h-4 mr-1" />
                    Edit Fields
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedTemplate(template);
                  }}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View Instances
                </Button>
                <Dialog open={isInstanceOpen && selectedTemplate?.id === template.id} onOpenChange={(open) => {
                  setIsInstanceOpen(open);
                  if (open) setSelectedTemplate(template);
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Send className="w-4 h-4 mr-1" />
                      Send for Fill
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Fill-and-Sign Instance</DialogTitle>
                      <DialogDescription>Generate a link for customer to fill and sign</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="recipientName">Recipient Name (Optional)</Label>
                        <Input
                          id="recipientName"
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="Customer name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="recipientEmail">Recipient Email (Optional)</Label>
                        <Input
                          id="recipientEmail"
                          type="email"
                          value={recipientEmail}
                          onChange={(e) => setRecipientEmail(e.target.value)}
                          placeholder="customer@example.com"
                        />
                      </div>
                      <Button
                        onClick={handleCreateInstance}
                        disabled={createInstanceMutation.isPending}
                        className="w-full"
                      >
                        {createInstanceMutation.isPending ? 'Creating...' : 'Create & Copy Link'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedTemplate && !isInstanceOpen && (
        <Card className="mt-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Instances for: {selectedTemplate.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No instances yet
                    </TableCell>
                  </TableRow>
                ) : (
                  instances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-mono text-xs">{instance.publicSignatureId}</TableCell>
                      <TableCell>
                        {instance.recipientName || instance.recipientEmail || 'N/A'}
                      </TableCell>
                      <TableCell>{getStatusBadge(instance.status)}</TableCell>
                      <TableCell>{new Date(instance.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {instance.signedAt ? new Date(instance.signedAt).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const url = `/fill-and-sign/${instance.publicSignatureId}`;
                            navigator.clipboard.writeText(window.location.origin + url);
                            toast({ title: 'Link copied to clipboard' });
                          }}
                        >
                          Copy Link
                        </Button>
                        {instance.status === 'signed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              window.open(`/api/pdf-templates/instances/${instance.publicSignatureId}/signed-pdf`, '_blank');
                            }}
                          >
                            Download
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {templates.filter(t => t.isActive).length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Upload a PDF template to get started with customer fill-and-sign workflow
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Template
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileUp, Plus, Edit, Trash2, BookOpen, FileText, Users, Upload, CheckCircle, Clock, XCircle } from "lucide-react";

interface TrainingModule {
  id: number;
  title: string;
  description: string | null;
  content: string | null;
  contentHtml: string | null;
  category: string | null;
  estimatedMinutes: number | null;
  passingScore: number | null;
  requiresCertification: boolean | null;
  certificationId: number | null;
  pdfSource: string | null;
  version: number | null;
  isActive: boolean | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TrainingMatrixEntry {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  trainingName: string;
  requiredBy: string | null;
  frequency: string | null;
  lastCompleted: string | null;
  nextDue: string | null;
  status: string | null;
  documentationUrl: string | null;
  notes: string | null;
  isLegacy: boolean | null;
}

export default function TrainingManagement() {
  const { toast } = useToast();
  const [selectedModule, setSelectedModule] = useState<TrainingModule | null>(null);
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false);
  const [isPdfImportDialogOpen, setIsPdfImportDialogOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Fetch training modules
  const { data: modules = [], isLoading: modulesLoading } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/modules'],
  });

  // Import PDF mutation
  const importPdfMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/training/modules/import-pdf', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import PDF');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      toast({
        title: "PDF Imported Successfully",
        description: `Created module: ${data.module.title} with ${data.questionsImported} questions`,
      });
      setIsPdfImportDialogOpen(false);
      setPdfFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  // Delete module mutation
  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: number) => {
      return apiRequest(`/api/training/modules/${moduleId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      toast({
        title: "Module Deleted",
        description: "Training module has been deleted successfully",
      });
    },
  });

  const handlePdfImport = () => {
    if (!pdfFile) {
      toast({
        title: "No File Selected",
        description: "Please select a PDF file to import",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('createdBy', 'admin'); // TODO: Get from auth context
    
    importPdfMutation.mutate(formData);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Training Management System</h1>
        <p className="text-muted-foreground">Manage training modules, import content from PDFs, and track employee training</p>
      </div>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="modules" data-testid="tab-modules">
            <BookOpen className="w-4 h-4 mr-2" />
            Training Modules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Training Modules</h2>
            <div className="flex gap-2">
              <Dialog open={isPdfImportDialogOpen} onOpenChange={setIsPdfImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-pdf">
                    <FileUp className="w-4 h-4 mr-2" />
                    Import from PDF
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-pdf-import">
                  <DialogHeader>
                    <DialogTitle>Import Training Module from PDF</DialogTitle>
                    <DialogDescription>
                      Upload a PDF document to automatically extract training content and create a new module
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="pdf-file">PDF File</Label>
                      <Input
                        id="pdf-file"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                        data-testid="input-pdf-file"
                      />
                      {pdfFile && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Selected: {pdfFile.name}
                        </p>
                      )}
                    </div>
                    <Button 
                      onClick={handlePdfImport} 
                      disabled={importPdfMutation.isPending}
                      data-testid="button-upload-pdf"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {importPdfMutation.isPending ? 'Importing...' : 'Import PDF'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button data-testid="button-create-module">
                <Plus className="w-4 h-4 mr-2" />
                Create Module
              </Button>
            </div>
          </div>

          {modulesLoading ? (
            <div className="text-center py-8">Loading modules...</div>
          ) : modules.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No training modules yet. Import from PDF or create one manually.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {modules.map((module) => (
                <Card key={module.id} data-testid={`card-module-${module.id}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{module.title}</CardTitle>
                        <CardDescription>{module.description || 'No description'}</CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" data-testid={`button-edit-${module.id}`}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteModuleMutation.mutate(module.id)}
                          data-testid={`button-delete-${module.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {module.category && (
                        <Badge variant="secondary">{module.category}</Badge>
                      )}
                      {module.estimatedMinutes && (
                        <Badge variant="outline">
                          <Clock className="w-3 h-3 mr-1" />
                          {module.estimatedMinutes} min
                        </Badge>
                      )}
                      {module.pdfSource && (
                        <Badge variant="outline">
                          <FileUp className="w-3 h-3 mr-1" />
                          Imported from PDF
                        </Badge>
                      )}
                      {module.requiresCertification && (
                        <Badge className="bg-blue-500">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Certification Required
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

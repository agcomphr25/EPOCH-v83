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
  const [isMatrixImportDialogOpen, setIsMatrixImportDialogOpen] = useState(false);
  const [isMatrixPdfImportDialogOpen, setIsMatrixPdfImportDialogOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [matrixPdfFile, setMatrixPdfFile] = useState<File | null>(null);

  // Fetch training modules
  const { data: modules = [], isLoading: modulesLoading } = useQuery<TrainingModule[]>({
    queryKey: ['/api/training/modules'],
  });

  // Fetch training matrix
  const { data: matrix = [], isLoading: matrixLoading } = useQuery<TrainingMatrixEntry[]>({
    queryKey: ['/api/training/matrix'],
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

  // Import CSV matrix mutation
  const importCsvMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/training/matrix/import-csv', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to import CSV');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/matrix'] });
      toast({
        title: "CSV Imported Successfully",
        description: `Imported ${data.imported} training matrix entries`,
      });
      setIsMatrixImportDialogOpen(false);
      setCsvFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Import PDF matrix mutation
  const importMatrixPdfMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/training/matrix/import-pdf', {
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
      queryClient.invalidateQueries({ queryKey: ['/api/training/matrix'] });
      toast({
        title: "PDF Imported Successfully",
        description: `Imported ${data.imported} training matrix entries from PDF`,
      });
      setIsMatrixPdfImportDialogOpen(false);
      setMatrixPdfFile(null);
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

  const handleCsvImport = () => {
    if (!csvFile) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to import",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', csvFile);
    
    importCsvMutation.mutate(formData);
  };

  const handleMatrixPdfImport = () => {
    if (!matrixPdfFile) {
      toast({
        title: "No File Selected",
        description: "Please select a PDF file to import",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', matrixPdfFile);
    
    importMatrixPdfMutation.mutate(formData);
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" /> Completed</Badge>;
      case 'PENDING':
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case 'OVERDUE':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Overdue</Badge>;
      default:
        return <Badge variant="secondary">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Training Management System</h1>
        <p className="text-muted-foreground">Manage training modules, import content from PDFs, and track employee training</p>
      </div>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="modules" data-testid="tab-modules">
            <BookOpen className="w-4 h-4 mr-2" />
            Training Modules
          </TabsTrigger>
          <TabsTrigger value="matrix" data-testid="tab-matrix">
            <FileText className="w-4 h-4 mr-2" />
            Training Matrix
          </TabsTrigger>
          <TabsTrigger value="records" data-testid="tab-records">
            <Users className="w-4 h-4 mr-2" />
            Employee Records
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

        <TabsContent value="matrix" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Training Matrix</h2>
            <div className="flex gap-2">
              <Dialog open={isMatrixPdfImportDialogOpen} onOpenChange={setIsMatrixPdfImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-matrix-pdf">
                    <FileUp className="w-4 h-4 mr-2" />
                    Import from PDF
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-matrix-pdf-import">
                  <DialogHeader>
                    <DialogTitle>Import Training Matrix from PDF</DialogTitle>
                    <DialogDescription>
                      Upload a PDF document with training requirements tables to automatically extract and import training matrix data
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="matrix-pdf-file">PDF File</Label>
                      <Input
                        id="matrix-pdf-file"
                        type="file"
                        accept=".pdf"
                        onChange={(e) => setMatrixPdfFile(e.target.files?.[0] || null)}
                        data-testid="input-matrix-pdf-file"
                      />
                      {matrixPdfFile && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Selected: {matrixPdfFile.name}
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p className="font-semibold mb-1">Best results with PDFs containing tables with:</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Employee names, job titles, departments</li>
                        <li>Training names and requirements</li>
                        <li>Frequency and due dates</li>
                        <li>Status information</li>
                      </ul>
                    </div>
                    <Button 
                      onClick={handleMatrixPdfImport} 
                      disabled={importMatrixPdfMutation.isPending}
                      data-testid="button-upload-matrix-pdf"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {importMatrixPdfMutation.isPending ? 'Importing...' : 'Import PDF'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isMatrixImportDialogOpen} onOpenChange={setIsMatrixImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-import-csv">
                    <FileText className="w-4 h-4 mr-2" />
                    Import CSV
                  </Button>
                </DialogTrigger>
              <DialogContent data-testid="dialog-csv-import">
                <DialogHeader>
                  <DialogTitle>Import Training Matrix from CSV</DialogTitle>
                  <DialogDescription>
                    Upload a CSV file with training matrix data to import legacy training records
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="csv-file">CSV File</Label>
                    <Input
                      id="csv-file"
                      type="file"
                      accept=".csv"
                      onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                      data-testid="input-csv-file"
                    />
                    {csvFile && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Selected: {csvFile.name}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="font-semibold mb-1">Expected CSV Columns:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>employee_name, job_title, department</li>
                      <li>training_name, required_by, frequency</li>
                      <li>last_completed, next_due, status</li>
                      <li>documentation_url, notes</li>
                    </ul>
                  </div>
                  <Button 
                    onClick={handleCsvImport} 
                    disabled={importCsvMutation.isPending}
                    data-testid="button-upload-csv"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {importCsvMutation.isPending ? 'Importing...' : 'Import CSV'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {matrixLoading ? (
            <div className="text-center py-8">Loading training matrix...</div>
          ) : matrix.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No training matrix entries. Import from CSV to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {matrix.map((entry) => (
                <Card key={entry.id} data-testid={`card-matrix-${entry.id}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{entry.trainingName}</CardTitle>
                        <CardDescription>
                          {entry.employeeName && `${entry.employeeName} - `}
                          {entry.jobTitle && `${entry.jobTitle} - `}
                          {entry.department}
                        </CardDescription>
                      </div>
                      {getStatusBadge(entry.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {entry.requiredBy && (
                        <div>
                          <p className="text-muted-foreground">Required By</p>
                          <p className="font-medium">{entry.requiredBy}</p>
                        </div>
                      )}
                      {entry.frequency && (
                        <div>
                          <p className="text-muted-foreground">Frequency</p>
                          <p className="font-medium">{entry.frequency}</p>
                        </div>
                      )}
                      {entry.lastCompleted && (
                        <div>
                          <p className="text-muted-foreground">Last Completed</p>
                          <p className="font-medium">{new Date(entry.lastCompleted).toLocaleDateString()}</p>
                        </div>
                      )}
                      {entry.nextDue && (
                        <div>
                          <p className="text-muted-foreground">Next Due</p>
                          <p className="font-medium">{new Date(entry.nextDue).toLocaleDateString()}</p>
                        </div>
                      )}
                    </div>
                    {entry.isLegacy && (
                      <Badge variant="outline" className="mt-4">Legacy Import</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="records" className="mt-6">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Employee Training Records</h2>
            <p className="text-muted-foreground">View and manage individual employee training progress</p>
          </div>
          <Card>
            <CardContent className="py-8 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Employee training records will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

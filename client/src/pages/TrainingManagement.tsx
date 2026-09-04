import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  FileUp,
  Plus,
  Edit,
  Trash2,
  BookOpen,
  FileText,
  Users,
  Upload,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  ExternalLink,
} from 'lucide-react';

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

interface Employee {
  id: number;
  name: string;
  jobTitle: string | null;
  department: string | null;
}

interface Certification {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  requirements: string | null;
  issuingOrganization: string | null;
  validityPeriodMonths: number | null;
  isRequired: boolean | null;
  isActive: boolean | null;
}

export default function TrainingManagement() {
  const { toast } = useToast();
  const [_selectedModule, _setSelectedModule] = useState<TrainingModule | null>(
    null
  );
  const [_isModuleDialogOpen, _setIsModuleDialogOpen] = useState(false);
  const [isPdfImportDialogOpen, setIsPdfImportDialogOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  // Certification tab state
  const [certPdfFile, setCertPdfFile] = useState<File | null>(null);
  const [selectedCertification, setSelectedCertification] = useState<Certification | null>(null);
  const [isCertDetailDialogOpen, setIsCertDetailDialogOpen] = useState(false);

  // Evaluation tab state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [evaluationType, setEvaluationType] = useState<string>('BIANNUAL');
  const [selectedCertifications, setSelectedCertifications] = useState<
    number[]
  >([]);
  const [strengths, setStrengths] = useState<string>('');
  const [opportunities, setOpportunities] = useState<string>('');
  const [expectations, setExpectations] = useState<string>('');

  // Fetch training modules
  const { data: modules = [], isLoading: modulesLoading } = useQuery<
    TrainingModule[]
  >({
    queryKey: ['/api/training/modules'],
  });

  // Fetch employees for evaluations
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  // Fetch certifications
  const { data: certifications = [] } = useQuery<Certification[]>({
    queryKey: ['/api/certifications'],
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
        title: 'PDF Imported Successfully',
        description: `Created module: ${data.module.title} with ${data.questionsImported} questions`,
      });
      setIsPdfImportDialogOpen(false);
      setPdfFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Import Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete module mutation
  const deleteModuleMutation = useMutation({
    mutationFn: async (moduleId: number) => {
      return apiRequest(`/api/training/modules/${moduleId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/training/modules'] });
      toast({
        title: 'Module Deleted',
        description: 'Training module has been deleted successfully',
      });
    },
  });

  // Create certification from PDF mutation
  const createCertificationMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/certifications/create-from-pdf', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create certification');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/certifications'] });
      toast({
        title: 'Certification Created',
        description: `Created certification: ${data.certification.name}`,
      });
      setCertPdfFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete certification mutation
  const deleteCertificationMutation = useMutation({
    mutationFn: async (certificationId: number) => {
      const response = await fetch(`/api/certifications/${certificationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete certification');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/certifications'] });
      toast({
        title: 'Certification Deleted',
        description: 'Certification template has been deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Create evaluation mutation
  const createEvaluationMutation = useMutation({
    mutationFn: async (evaluationData: any) => {
      return apiRequest('/api/employees/evaluations', {
        method: 'POST',
        body: JSON.stringify(evaluationData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/employees/evaluations'],
      });
      toast({
        title: 'Evaluation Created',
        description: 'Employee evaluation has been created successfully',
      });
      // Reset form
      setSelectedEmployeeId('');
      setSelectedCertifications([]);
      setStrengths('');
      setOpportunities('');
      setExpectations('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Creation Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePdfImport = () => {
    if (!pdfFile) {
      toast({
        title: 'No File Selected',
        description: 'Please select a PDF file to import',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('createdBy', 'admin'); // TODO: Get from auth context

    importPdfMutation.mutate(formData);
  };

  const handleCertificationPdfUpload = () => {
    if (!certPdfFile) {
      toast({
        title: 'No File Selected',
        description: 'Please select a PDF file to create certification',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', certPdfFile);
    formData.append('createdBy', 'admin'); // TODO: Get from auth context

    createCertificationMutation.mutate(formData);
  };

  const handleEvaluationSubmit = () => {
    if (!selectedEmployeeId) {
      toast({
        title: 'Employee Required',
        description: 'Please select an employee to evaluate',
        variant: 'destructive',
      });
      return;
    }

    const evaluationData = {
      employeeId: parseInt(selectedEmployeeId),
      evaluationType,
      certificationIds: selectedCertifications,
      strengths,
      areasForImprovement: opportunities,
      goals: expectations,
      evaluatedBy: 'admin', // TODO: Get from auth context
      status: 'COMPLETED',
    };

    createEvaluationMutation.mutate(evaluationData);
  };

  const handleDeleteCertification = (certificationId: number) => {
    if (confirm('Are you sure you want to delete this certification template? This will not affect existing employee certifications.')) {
      deleteCertificationMutation.mutate(certificationId);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Training Management System</h1>
        <p className="text-muted-foreground">
          Manage training modules, import content from PDFs, and track employee
          training
        </p>
      </div>

      <Tabs defaultValue="modules" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="modules" data-testid="tab-modules">
            <BookOpen className="w-4 h-4 mr-2" />
            Training Modules
          </TabsTrigger>
          <TabsTrigger value="certifications" data-testid="tab-certifications">
            <FileText className="w-4 h-4 mr-2" />
            Certifications
          </TabsTrigger>
          <TabsTrigger value="evaluations" data-testid="tab-evaluations">
            <Users className="w-4 h-4 mr-2" />
            Evaluations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="modules" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Training Modules</h2>
            <div className="flex gap-2">
              <Dialog
                open={isPdfImportDialogOpen}
                onOpenChange={setIsPdfImportDialogOpen}
              >
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
                      Upload a PDF document to automatically extract training
                      content and create a new module
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="pdf-file">PDF File</Label>
                      <Input
                        id="pdf-file"
                        type="file"
                        accept=".pdf"
                        onChange={(e) =>
                          setPdfFile(e.target.files?.[0] || null)
                        }
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
                      {importPdfMutation.isPending
                        ? 'Importing...'
                        : 'Import PDF'}
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
                <p className="text-muted-foreground">
                  No training modules yet. Import from PDF or create one
                  manually.
                </p>
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
                        <CardDescription>
                          {module.description || 'No description'}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-edit-${module.id}`}
                        >
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

        <TabsContent value="certifications" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">
              Create Certification from PDF
            </h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Upload Job Position / Work Instructions PDF</CardTitle>
              <CardDescription>
                Upload a PDF containing job position details or work
                instructions to create a new certification using AI document
                analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="cert-pdf-file">PDF File</Label>
                <Input
                  id="cert-pdf-file"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setCertPdfFile(e.target.files?.[0] || null)}
                  data-testid="input-cert-pdf-file"
                />
                {certPdfFile && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Selected: {certPdfFile.name}
                  </p>
                )}
              </div>
              <Button
                onClick={handleCertificationPdfUpload}
                disabled={createCertificationMutation.isPending}
                data-testid="button-create-certification"
              >
                <Upload className="w-4 h-4 mr-2" />
                {createCertificationMutation.isPending
                  ? 'Creating Certification...'
                  : 'Create Certification from PDF'}
              </Button>
            </CardContent>
          </Card>

          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">
              Existing Certifications
            </h3>
            {certifications.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    No certifications yet. Upload a PDF to create one.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {certifications.map((cert) => (
                  <Card key={cert.id} data-testid={`card-cert-${cert.id}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle>{cert.name}</CardTitle>
                          <CardDescription>
                            {cert.description || 'No description'}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedCertification(cert);
                              setIsCertDetailDialogOpen(true);
                            }}
                            data-testid={`button-view-cert-${cert.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </Button>
                          <Link href="/employee-dashboard">
                            <Button
                              variant="default"
                              size="sm"
                              data-testid={`button-assign-cert-${cert.id}`}
                            >
                              <Users className="w-4 h-4 mr-2" />
                              Assign to Employee
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCertification(cert.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-template-${cert.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2 flex-wrap">
                        {cert.category && (
                          <Badge variant="secondary">{cert.category}</Badge>
                        )}
                        {cert.isRequired && (
                          <Badge variant="destructive">Required</Badge>
                        )}
                        {cert.validityPeriodMonths && (
                          <Badge variant="outline">
                            Valid for {cert.validityPeriodMonths} months
                          </Badge>
                        )}
                      </div>
                      {cert.requirements && (
                        <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                          <strong>Requirements:</strong> {cert.requirements}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Certification Details Dialog */}
          <Dialog open={isCertDetailDialogOpen} onOpenChange={setIsCertDetailDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{selectedCertification?.name}</DialogTitle>
                <DialogDescription>
                  Certification Details
                </DialogDescription>
              </DialogHeader>
              {selectedCertification && (
                <div className="space-y-4">
                  <div>
                    <Label className="font-semibold">Description</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedCertification.description || 'No description provided'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold">Category</Label>
                      <p className="text-sm mt-1">
                        {selectedCertification.category || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <Label className="font-semibold">Validity Period</Label>
                      <p className="text-sm mt-1">
                        {selectedCertification.validityPeriodMonths
                          ? `${selectedCertification.validityPeriodMonths} months`
                          : 'No expiration'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold">Issuing Organization</Label>
                      <p className="text-sm mt-1">
                        {selectedCertification.issuingOrganization || 'Not specified'}
                      </p>
                    </div>
                    <div>
                      <Label className="font-semibold">Status</Label>
                      <div className="flex gap-2 mt-1">
                        {selectedCertification.isRequired && (
                          <Badge variant="destructive">Required</Badge>
                        )}
                        {selectedCertification.isActive ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {selectedCertification.requirements && (
                    <div>
                      <Label className="font-semibold">Requirements & PPE</Label>
                      <div className="mt-2 p-4 bg-muted rounded-md">
                        <p className="text-sm whitespace-pre-wrap">
                          {selectedCertification.requirements}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsCertDetailDialogOpen(false)}
                    >
                      Close
                    </Button>
                    <Link href="/employee-dashboard">
                      <Button>
                        <Users className="w-4 h-4 mr-2" />
                        Assign to Employee
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="evaluations" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">
              Create Employee Evaluation
            </h2>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>New Evaluation</CardTitle>
              <CardDescription>
                Create a performance evaluation based on employee certifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="employee-select">Employee</Label>
                  <Select
                    value={selectedEmployeeId}
                    onValueChange={setSelectedEmployeeId}
                  >
                    <SelectTrigger
                      id="employee-select"
                      data-testid="select-employee"
                    >
                      <SelectValue placeholder="Select employee..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id.toString()}>
                          {emp.name} {emp.jobTitle && `- ${emp.jobTitle}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="evaluation-type">Evaluation Type</Label>
                  <Select
                    value={evaluationType}
                    onValueChange={setEvaluationType}
                  >
                    <SelectTrigger
                      id="evaluation-type"
                      data-testid="select-eval-type"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BIANNUAL">Biannual</SelectItem>
                      <SelectItem value="ANNUAL">Annual</SelectItem>
                      <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                      <SelectItem value="PROBATION">Probation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Certifications (Multi-select)</Label>
                  <div className="border rounded-md p-4 space-y-2 max-h-48 overflow-y-auto">
                    {certifications.map((cert) => (
                      <div
                        key={cert.id}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="checkbox"
                          id={`cert-${cert.id}`}
                          checked={selectedCertifications.includes(cert.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCertifications([
                                ...selectedCertifications,
                                cert.id,
                              ]);
                            } else {
                              setSelectedCertifications(
                                selectedCertifications.filter(
                                  (id) => id !== cert.id
                                )
                              );
                            }
                          }}
                          data-testid={`checkbox-cert-${cert.id}`}
                          className="rounded"
                        />
                        <Label
                          htmlFor={`cert-${cert.id}`}
                          className="cursor-pointer"
                        >
                          {cert.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">
                  Evaluation Sections
                </h3>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="strengths">Strengths</Label>
                    <Textarea
                      id="strengths"
                      placeholder="Describe employee's key strengths and positive qualities..."
                      value={strengths}
                      onChange={(e) => setStrengths(e.target.value)}
                      rows={4}
                      data-testid="textarea-strengths"
                    />
                  </div>

                  <div>
                    <Label htmlFor="opportunities">
                      Opportunities for Improvement
                    </Label>
                    <Textarea
                      id="opportunities"
                      placeholder="Areas where employee can improve and develop..."
                      value={opportunities}
                      onChange={(e) => setOpportunities(e.target.value)}
                      rows={4}
                      data-testid="textarea-opportunities"
                    />
                  </div>

                  <div>
                    <Label htmlFor="expectations">Expectations & Plans</Label>
                    <Textarea
                      id="expectations"
                      placeholder="Goals, action items, and expectations for the next period..."
                      value={expectations}
                      onChange={(e) => setExpectations(e.target.value)}
                      rows={4}
                      data-testid="textarea-expectations"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={handleEvaluationSubmit}
                disabled={createEvaluationMutation.isPending}
                className="w-full"
                data-testid="button-create-evaluation"
              >
                {createEvaluationMutation.isPending
                  ? 'Creating Evaluation...'
                  : 'Create Evaluation'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

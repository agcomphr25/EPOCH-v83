import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import SignatureCanvas from 'react-signature-canvas';
import {
  ClipboardList,
  Plus,
  Search,
  FileText,
  CheckCircle2,
  Clock,
  Users,
  Trash2,
  Edit,
  Eye,
  Save,
  X,
  Calendar,
  ArrowLeft,
  PenLine,
  GripVertical,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCheck,
  RefreshCw,
  Link2,
  ExternalLink,
  StickyNote,
} from 'lucide-react';
import { format } from 'date-fns';

interface Template {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  sections?: TemplateSection[];
}

interface TemplateSection {
  id: string;
  templateId: string;
  name: string;
  sortOrder: number;
  tasks: TemplateTask[];
}

interface TemplateTask {
  id: string;
  sectionId: string;
  description: string;
  sortOrder: number;
}

interface Checklist {
  id: string;
  projectId: string;
  projectName: string;
  poNumber: string | null;
  dueDate: string | null;
  status: string;
  templateId: string | null;
  signedBy: string | null;
  signedAt: string | null;
  signatureData: string | null;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  totalTasks?: number;
  completedTasks?: number;
  sections?: ChecklistSection[];
  preProductionDueDate: string | null;
  materialArrivalDate: string | null;
  firstArticleDueDate: string | null;
  as9102CompletionDate: string | null;
  firstArticleApprovedDate: string | null;
  fullProductionStartDate: string | null;
  poDueDate: string | null;
  poDueQuantity: number | null;
  showPreProductionDueDate?: boolean;
  showMaterialArrivalDate?: boolean;
  showFirstArticleDueDate?: boolean;
  showAs9102CompletionDate?: boolean;
  showFirstArticleApprovedDate?: boolean;
  showFullProductionStartDate?: boolean;
  showPoDueDate?: boolean;
}

interface ChecklistSection {
  id: string;
  checklistId: string;
  name: string;
  sortOrder: number;
  progress?: number;
  tasks: ChecklistTask[];
}

interface ChecklistTask {
  id: string;
  sectionId: string;
  description: string;
  sortOrder: number;
  assignedTo: string | null;
  assignedToEmployeeId: number | null;
  isCompleted: boolean;
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
  link: string | null;
}

interface Employee {
  id: number;
  name: string;
  email: string;
}

interface ProjectOption {
  id: string;
  projectCode?: string | null;
  projectName: string;
  poNumber?: string | null;
  poId?: number | null;
  currentStage?: string | null;
  status?: string | null;
}

interface WizardDepartment {
  id: string;
  name: string;
  tasks: { id: string; description: string }[];
}

export default function PreproductionChecklistPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('checklists');
  const [selectedChecklist, setSelectedChecklist] = useState<Checklist | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isCreateChecklistOpen, setIsCreateChecklistOpen] = useState(false);
  const [isCreateTemplateOpen, setIsCreateTemplateOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Parse context query params passed from the project workflow card
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const contextChecklistId = searchParams.get('id') || '';
  const contextProjectId = searchParams.get('projectId') || '';
  const contextProjectName = searchParams.get('projectName') || '';
  const contextPoNumber = searchParams.get('poNumber') || '';

  // Auto-open create dialog when navigated from a project workflow card
  useEffect(() => {
    if (contextProjectId && !contextChecklistId && !selectedChecklist) {
      setIsCreateChecklistOpen(true);
    }
  }, [contextProjectId, contextChecklistId, selectedChecklist]);

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="preproduction-checklist-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Pre-Production Checklists
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage project checklists and templates for production preparation
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="checklists" data-testid="tab-checklists">
            <ClipboardList className="h-4 w-4 mr-2" />
            Project Checklists
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklists" className="space-y-4">
          {selectedChecklist ? (
            <ChecklistDetailView 
              checklist={selectedChecklist} 
              onBack={() => setSelectedChecklist(null)} 
            />
          ) : (
            <ChecklistsTab 
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onSelectChecklist={setSelectedChecklist}
              isCreateOpen={isCreateChecklistOpen}
              setIsCreateOpen={setIsCreateChecklistOpen}
              selectedChecklistId={contextChecklistId}
              initialProjectId={contextProjectId}
              initialProjectName={contextProjectName}
              initialPoNumber={contextPoNumber}
            />
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          {selectedTemplate ? (
            <TemplateDetailView 
              template={selectedTemplate} 
              onBack={() => setSelectedTemplate(null)} 
            />
          ) : (
            <TemplatesTab 
              onSelectTemplate={setSelectedTemplate}
              isCreateOpen={isCreateTemplateOpen}
              setIsCreateOpen={setIsCreateTemplateOpen}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===============================
// CHECKLISTS TAB
// ===============================

function PreproductionChecklistWizard({
  open,
  onOpenChange,
  projects,
  departmentOptions,
  initialProjectId,
  initialProjectName,
  initialPoNumber,
  isSubmitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  departmentOptions: string[];
  initialProjectId: string;
  initialProjectName: string;
  initialPoNumber: string;
  isSubmitting: boolean;
  onSubmit: (data: {
    templateName: string;
    templateDescription: string;
    projectId: string;
    projectName: string;
    poNumber: string;
    departments: WizardDepartment[];
  }) => void;
}) {
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId || '');
  const [projectName, setProjectName] = useState(initialProjectName || '');
  const [poNumber, setPoNumber] = useState(initialPoNumber || '');
  const [departmentName, setDepartmentName] = useState('');
  const [customDepartmentName, setCustomDepartmentName] = useState('');
  const [departments, setDepartments] = useState<WizardDepartment[]>([]);

  useEffect(() => {
    if (!open) return;
    setProjectId(initialProjectId || '');
    setProjectName(initialProjectName || '');
    setPoNumber(initialPoNumber || '');
  }, [open, initialProjectId, initialProjectName, initialPoNumber]);

  const selectedProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    if (!selectedProject) return;
    setProjectName(selectedProject.projectName || '');
    setPoNumber(selectedProject.poNumber || '');
  }, [selectedProject?.id]);

  const addDepartment = () => {
    const name = (departmentName === '__new__' ? customDepartmentName : departmentName).trim();
    if (!name || departments.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      return;
    }

    setDepartments((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        tasks: [{ id: `${Date.now()}-task`, description: '' }],
      },
    ]);
    setDepartmentName('');
    setCustomDepartmentName('');
  };

  const updateTask = (departmentId: string, taskId: string, description: string) => {
    setDepartments((current) =>
      current.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              tasks: department.tasks.map((task) =>
                task.id === taskId ? { ...task, description } : task
              ),
            }
          : department
      )
    );
  };

  const addTask = (departmentId: string) => {
    setDepartments((current) =>
      current.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              tasks: [
                ...department.tasks,
                { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, description: '' },
              ],
            }
          : department
      )
    );
  };

  const removeTask = (departmentId: string, taskId: string) => {
    setDepartments((current) =>
      current.map((department) =>
        department.id === departmentId
          ? { ...department, tasks: department.tasks.filter((task) => task.id !== taskId) }
          : department
      )
    );
  };

  const removeDepartment = (departmentId: string) => {
    setDepartments((current) => current.filter((department) => department.id !== departmentId));
  };

  const cleanedDepartments = departments
    .map((department) => ({
      ...department,
      name: department.name.trim(),
      tasks: department.tasks
        .map((task) => ({ ...task, description: task.description.trim() }))
        .filter((task) => task.description),
    }))
    .filter((department) => department.name && department.tasks.length > 0);

  const canSubmit =
    templateName.trim() &&
    projectName.trim() &&
    cleanedDepartments.length > 0 &&
    cleanedDepartments.every((department) => department.tasks.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pre-production Checklist Wizard</DialogTitle>
          <DialogDescription>
            Build a reusable department checklist template and assign it to a project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Privateer pre-production readiness"
                data-testid="input-wizard-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Assign to Project *</Label>
              <Select
                value={projectId || 'manual'}
                onValueChange={(value) => {
                  setProjectId(value === 'manual' ? '' : value);
                  if (value === 'manual') {
                    setProjectName('');
                    setPoNumber('');
                  }
                }}
              >
                <SelectTrigger data-testid="select-wizard-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual project name</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {[project.projectCode, project.projectName].filter(Boolean).join(' - ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Project Name *</Label>
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="Project name"
                data-testid="input-wizard-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label>PO Number</Label>
              <Input
                value={poNumber}
                onChange={(event) => setPoNumber(event.target.value)}
                placeholder="PO number"
                data-testid="input-wizard-po-number"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={templateDescription}
              onChange={(event) => setTemplateDescription(event.target.value)}
              placeholder="Optional template notes"
              data-testid="input-wizard-template-description"
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <h3 className="text-base font-semibold">Departments and Tasks</h3>
              <p className="text-sm text-muted-foreground">
                New departments are saved with this template and will be available in future wizard runs.
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <Select value={departmentName} onValueChange={setDepartmentName}>
                <SelectTrigger data-testid="select-wizard-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">Add new department</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={customDepartmentName}
                onChange={(event) => setCustomDepartmentName(event.target.value)}
                placeholder="New department name"
                disabled={departmentName !== '__new__'}
                data-testid="input-wizard-new-department"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addDepartment}
                disabled={!departmentName || (departmentName === '__new__' && !customDepartmentName.trim())}
                data-testid="button-wizard-add-department"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {departments.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Add a department to start building the template.
                </CardContent>
              </Card>
            ) : (
              departments.map((department) => (
                <Card key={department.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{department.name}</CardTitle>
                        <CardDescription>{department.tasks.length} task{department.tasks.length === 1 ? '' : 's'}</CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDepartment(department.id)}
                        data-testid={`button-wizard-remove-department-${department.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {department.tasks.map((task, index) => (
                      <div key={task.id} className="flex gap-2">
                        <Input
                          value={task.description}
                          onChange={(event) => updateTask(department.id, task.id, event.target.value)}
                          placeholder={`Task ${index + 1}`}
                          data-testid={`input-wizard-task-${department.id}-${index}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTask(department.id, task.id)}
                          disabled={department.tasks.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addTask(department.id)}
                      data-testid={`button-wizard-add-task-${department.id}`}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Task
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                templateName: templateName.trim(),
                templateDescription: templateDescription.trim(),
                projectId,
                projectName: projectName.trim(),
                poNumber: poNumber.trim(),
                departments: cleanedDepartments,
              })
            }
            disabled={!canSubmit || isSubmitting}
            data-testid="button-submit-checklist-wizard"
          >
            {isSubmitting ? 'Creating...' : 'Create Template and Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistsTab({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  onSelectChecklist,
  isCreateOpen,
  setIsCreateOpen,
  selectedChecklistId = '',
  initialProjectId = '',
  initialProjectName = '',
  initialPoNumber = '',
}: {
  searchTerm: string;
  setSearchTerm: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  onSelectChecklist: (c: Checklist) => void;
  isCreateOpen: boolean;
  setIsCreateOpen: (b: boolean) => void;
  selectedChecklistId?: string;
  initialProjectId?: string;
  initialProjectName?: string;
  initialPoNumber?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const { data: checklists = [], isLoading } = useQuery<Checklist[]>({
    queryKey: ['/api/preproduction-checklists', statusFilter],
    queryFn: () => apiRequest(`/api/preproduction-checklists?status=${statusFilter}`),
  });

  useEffect(() => {
    if (!selectedChecklistId || checklists.length === 0) return;

    const linkedChecklist = checklists.find((checklist) => checklist.id === selectedChecklistId);
    if (linkedChecklist) {
      onSelectChecklist(linkedChecklist);
    }
  }, [selectedChecklistId, checklists, onSelectChecklist]);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['/api/preproduction-checklists/templates'],
  });

  const { data: projects = [] } = useQuery<ProjectOption[]>({
    queryKey: ['/api/projects'],
  });

  const { data: departmentOptions = [] } = useQuery<string[]>({
    queryKey: ['/api/preproduction-checklists/templates/departments'],
  });

  const [newChecklist, setNewChecklist] = useState({
    projectName: initialProjectName,
    poNumber: initialPoNumber,
    dueDate: '',
    templateId: '',
    preProductionDueDate: '',
    materialArrivalDate: '',
    firstArticleDueDate: '',
    as9102CompletionDate: '',
    firstArticleApprovedDate: '',
    fullProductionStartDate: '',
    poDueDate: '',
    poDueQuantity: '',
  });

  // Sync initial values whenever they change (e.g., on first navigation from project card)
  useEffect(() => {
    if (initialProjectName || initialPoNumber) {
      setNewChecklist(prev => ({
        ...prev,
        projectName: initialProjectName || prev.projectName,
        poNumber: initialPoNumber || prev.poNumber,
      }));
    }
  }, [initialProjectName, initialPoNumber]);

  const createMutation = useMutation({
    mutationFn: (data: any) => 
      apiRequest('/api/preproduction-checklists', { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists'] });
      toast({ title: 'Success', description: 'Checklist created successfully' });
      setIsCreateOpen(false);
      setNewChecklist({ 
        projectName: '', poNumber: '', dueDate: '', templateId: '',
        preProductionDueDate: '', materialArrivalDate: '', firstArticleDueDate: '',
        as9102CompletionDate: '', firstArticleApprovedDate: '', fullProductionStartDate: '',
        poDueDate: '', poDueQuantity: '',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create checklist', variant: 'destructive' });
    },
  });

  const wizardMutation = useMutation({
    mutationFn: async (data: {
      templateName: string;
      templateDescription: string;
      projectId: string;
      projectName: string;
      poNumber: string;
      departments: WizardDepartment[];
    }) => {
      const template = await apiRequest('/api/preproduction-checklists/templates/wizard', {
        method: 'POST',
        body: {
          name: data.templateName,
          description: data.templateDescription || null,
          sections: data.departments.map((department, index) => ({
            name: department.name,
            sortOrder: index + 1,
            tasks: department.tasks.map((task, taskIndex) => ({
              description: task.description,
              sortOrder: taskIndex + 1,
            })),
          })),
        },
      });

      return apiRequest('/api/preproduction-checklists', {
        method: 'POST',
        body: {
          projectName: data.projectName,
          poNumber: data.poNumber || undefined,
          templateId: template.id,
          assignedProjectId: data.projectId || undefined,
        },
      });
    },
    onSuccess: (checklist: Checklist) => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists'] });
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists/templates'] });
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists/templates/departments'] });
      qc.invalidateQueries({ queryKey: ['/api/projects'] });
      if (checklist?.projectId) {
        qc.invalidateQueries({ queryKey: ['/api/projects', checklist.projectId] });
      }
      toast({ title: 'Success', description: 'Template created and checklist assigned' });
      setIsWizardOpen(false);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create checklist from wizard', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => 
      apiRequest(`/api/preproduction-checklists/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists'] });
      toast({ title: 'Success', description: 'Checklist deleted' });
    },
  });

  const filteredChecklists = checklists.filter(c => 
    c.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.poNumber && c.poNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusBadge = (status: string, progress: number) => {
    if (status === 'completed') {
      return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
    }
    if (progress === 0) {
      return <Badge variant="outline">Not Started</Badge>;
    }
    return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search checklists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-search-checklists"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsWizardOpen(true)} data-testid="button-open-checklist-wizard">
            <ClipboardList className="h-4 w-4 mr-2" />
            Checklist Wizard
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-checklist">
            <Plus className="h-4 w-4 mr-2" />
            New Checklist
          </Button>
        </div>
      </div>

      <PreproductionChecklistWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        projects={projects}
        departmentOptions={departmentOptions}
        initialProjectId={initialProjectId}
        initialProjectName={initialProjectName}
        initialPoNumber={initialPoNumber}
        isSubmitting={wizardMutation.isPending}
        onSubmit={(data) => wizardMutation.mutate(data)}
      />

      {/* Checklists Grid */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredChecklists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No checklists found</h3>
            <p className="text-muted-foreground mt-1">
              Create a new checklist to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredChecklists.map((checklist) => (
            <Card 
              key={checklist.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              data-testid={`card-checklist-${checklist.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1" onClick={() => onSelectChecklist(checklist)}>
                    <CardTitle className="text-lg">{checklist.projectName}</CardTitle>
                    {checklist.poNumber && (
                      <CardDescription>PO: {checklist.poNumber}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSelectChecklist(checklist)}
                      data-testid={`button-view-${checklist.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(checklist.id)}
                      data-testid={`button-delete-${checklist.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent onClick={() => onSelectChecklist(checklist)}>
                <div className="space-y-3">
                  {getStatusBadge(checklist.status, checklist.progress || 0)}
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{checklist.progress || 0}%</span>
                    </div>
                    <Progress value={checklist.progress || 0} className="h-2" />
                    <div className="text-xs text-muted-foreground">
                      {checklist.completedTasks || 0} of {checklist.totalTasks || 0} tasks completed
                    </div>
                  </div>

                  {checklist.dueDate && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Due: {format(new Date(checklist.dueDate), 'MMM d, yyyy')}
                    </div>
                  )}

                  {checklist.signedAt && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Signed by {checklist.signedBy}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Checklist Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Checklist</DialogTitle>
            <DialogDescription>
              Create a new pre-production checklist for a project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project Name *</Label>
                <Input
                  value={newChecklist.projectName}
                  onChange={(e) => setNewChecklist({ ...newChecklist, projectName: e.target.value })}
                  placeholder="Enter project name"
                  data-testid="input-project-name"
                />
              </div>
              <div className="space-y-2">
                <Label>PO Number</Label>
                <Input
                  value={newChecklist.poNumber}
                  onChange={(e) => setNewChecklist({ ...newChecklist, poNumber: e.target.value })}
                  placeholder="Enter PO number"
                  data-testid="input-po-number"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select 
                value={newChecklist.templateId} 
                onValueChange={(v) => setNewChecklist({ ...newChecklist, templateId: v })}
              >
                <SelectTrigger data-testid="select-template">
                  <SelectValue placeholder="Select a template (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Separator />
            <h4 className="font-medium text-sm text-muted-foreground">Timeline Milestones</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Material Arrival Date</Label>
                <Input
                  type="date"
                  value={newChecklist.materialArrivalDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, materialArrivalDate: e.target.value })}
                  data-testid="input-material-arrival-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Pre-Production Due Date</Label>
                <Input
                  type="date"
                  value={newChecklist.preProductionDueDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, preProductionDueDate: e.target.value })}
                  data-testid="input-preproduction-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>First Article Due Date</Label>
                <Input
                  type="date"
                  value={newChecklist.firstArticleDueDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, firstArticleDueDate: e.target.value })}
                  data-testid="input-first-article-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>AS9102 Completion Date</Label>
                <Input
                  type="date"
                  value={newChecklist.as9102CompletionDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, as9102CompletionDate: e.target.value })}
                  data-testid="input-as9102-completion-date"
                />
              </div>
              <div className="space-y-2">
                <Label>First Article Approved Date</Label>
                <Input
                  type="date"
                  value={newChecklist.firstArticleApprovedDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, firstArticleApprovedDate: e.target.value })}
                  data-testid="input-first-article-approved-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Full Production Start Date</Label>
                <Input
                  type="date"
                  value={newChecklist.fullProductionStartDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, fullProductionStartDate: e.target.value })}
                  data-testid="input-full-production-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>PO Due Date</Label>
                <Input
                  type="date"
                  value={newChecklist.poDueDate}
                  onChange={(e) => setNewChecklist({ ...newChecklist, poDueDate: e.target.value })}
                  data-testid="input-po-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>PO Due Quantity</Label>
                <Input
                  type="number"
                  value={newChecklist.poDueQuantity}
                  onChange={(e) => setNewChecklist({ ...newChecklist, poDueQuantity: e.target.value })}
                  placeholder="Enter quantity"
                  data-testid="input-po-due-quantity"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createMutation.mutate({
                ...newChecklist,
                templateId: newChecklist.templateId && newChecklist.templateId !== 'none' ? newChecklist.templateId : undefined,
                dueDate: newChecklist.dueDate || undefined,
                preProductionDueDate: newChecklist.preProductionDueDate || undefined,
                materialArrivalDate: newChecklist.materialArrivalDate || undefined,
                firstArticleDueDate: newChecklist.firstArticleDueDate || undefined,
                as9102CompletionDate: newChecklist.as9102CompletionDate || undefined,
                firstArticleApprovedDate: newChecklist.firstArticleApprovedDate || undefined,
                fullProductionStartDate: newChecklist.fullProductionStartDate || undefined,
                poDueDate: newChecklist.poDueDate || undefined,
                poDueQuantity: newChecklist.poDueQuantity ? parseInt(newChecklist.poDueQuantity) : undefined,
              })}
              disabled={!newChecklist.projectName || createMutation.isPending}
              data-testid="button-submit-checklist"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Checklist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===============================
// CHECKLIST DETAIL VIEW
// ===============================

function ChecklistDetailView({ 
  checklist, 
  onBack 
}: { 
  checklist: Checklist; 
  onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const sigRef = useRef<SignatureCanvas>(null);
  const [isSignDialogOpen, setIsSignDialogOpen] = useState(false);
  const [signedByName, setSignedByName] = useState('');
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [addTaskSectionId, setAddTaskSectionId] = useState<string | null>(null);
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isEditingMilestones, setIsEditingMilestones] = useState(false);
  const [milestoneData, setMilestoneData] = useState({
    preProductionDueDate: '',
    materialArrivalDate: '',
    firstArticleDueDate: '',
    as9102CompletionDate: '',
    firstArticleApprovedDate: '',
    fullProductionStartDate: '',
    poDueDate: '',
    poDueQuantity: '',
    showPreProductionDueDate: true,
    showMaterialArrivalDate: true,
    showFirstArticleDueDate: true,
    showAs9102CompletionDate: true,
    showFirstArticleApprovedDate: true,
    showFullProductionStartDate: true,
    showPoDueDate: true,
  });

  const { data: fullChecklist, isLoading, refetch } = useQuery<Checklist>({
    queryKey: ['/api/preproduction-checklists', checklist.id],
    queryFn: () => apiRequest(`/api/preproduction-checklists/${checklist.id}`),
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/preproduction-checklists/employees/list'],
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: any }) =>
      apiRequest(`/api/preproduction-checklists/tasks/${taskId}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      refetch();
    },
  });

  const signOffMutation = useMutation({
    mutationFn: (data: { signatureData: string; signedBy: string }) =>
      apiRequest(`/api/preproduction-checklists/${checklist.id}/sign-off`, { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists'] });
      toast({ title: 'Success', description: 'Checklist signed off successfully' });
      setIsSignDialogOpen(false);
      refetch();
    },
  });

  const addSectionMutation = useMutation({
    mutationFn: (data: { name: string; sortOrder: number }) =>
      apiRequest(`/api/preproduction-checklists/${checklist.id}/sections`, { method: 'POST', body: data }),
    onSuccess: () => {
      refetch();
      setIsAddSectionOpen(false);
      setNewSectionName('');
      toast({ title: 'Success', description: 'Section added' });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: any }) =>
      apiRequest(`/api/preproduction-checklists/sections/${sectionId}/tasks`, { method: 'POST', body: data }),
    onSuccess: () => {
      refetch();
      setIsAddTaskOpen(false);
      setNewTaskDescription('');
      setAddTaskSectionId(null);
      toast({ title: 'Success', description: 'Task added' });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiRequest(`/api/preproduction-checklists/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetch();
      toast({ title: 'Task deleted' });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) =>
      apiRequest(`/api/preproduction-checklists/sections/${sectionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetch();
      toast({ title: 'Section deleted' });
    },
  });

  const updateChecklistMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest(`/api/preproduction-checklists/${checklist.id}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      refetch();
      setIsEditingMilestones(false);
      toast({ title: 'Success', description: 'Milestones updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update milestones', variant: 'destructive' });
    },
  });

  const formatDateForInput = (dateStr: string | null): string => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };

  const startEditingMilestones = () => {
    setMilestoneData({
      preProductionDueDate: formatDateForInput(fullChecklist?.preProductionDueDate ?? null),
      materialArrivalDate: formatDateForInput(fullChecklist?.materialArrivalDate ?? null),
      firstArticleDueDate: formatDateForInput(fullChecklist?.firstArticleDueDate ?? null),
      as9102CompletionDate: formatDateForInput(fullChecklist?.as9102CompletionDate ?? null),
      firstArticleApprovedDate: formatDateForInput(fullChecklist?.firstArticleApprovedDate ?? null),
      fullProductionStartDate: formatDateForInput(fullChecklist?.fullProductionStartDate ?? null),
      poDueDate: formatDateForInput(fullChecklist?.poDueDate ?? null),
      poDueQuantity: fullChecklist?.poDueQuantity?.toString() || '',
      showPreProductionDueDate: fullChecklist?.showPreProductionDueDate !== false,
      showMaterialArrivalDate: fullChecklist?.showMaterialArrivalDate !== false,
      showFirstArticleDueDate: fullChecklist?.showFirstArticleDueDate !== false,
      showAs9102CompletionDate: fullChecklist?.showAs9102CompletionDate !== false,
      showFirstArticleApprovedDate: fullChecklist?.showFirstArticleApprovedDate !== false,
      showFullProductionStartDate: fullChecklist?.showFullProductionStartDate !== false,
      showPoDueDate: fullChecklist?.showPoDueDate !== false,
    });
    setIsEditingMilestones(true);
  };

  const saveMilestones = () => {
    updateChecklistMutation.mutate({
      preProductionDueDate: milestoneData.preProductionDueDate || null,
      materialArrivalDate: milestoneData.materialArrivalDate || null,
      firstArticleDueDate: milestoneData.firstArticleDueDate || null,
      as9102CompletionDate: milestoneData.as9102CompletionDate || null,
      firstArticleApprovedDate: milestoneData.firstArticleApprovedDate || null,
      fullProductionStartDate: milestoneData.fullProductionStartDate || null,
      poDueDate: milestoneData.poDueDate || null,
      poDueQuantity: milestoneData.poDueQuantity ? parseInt(milestoneData.poDueQuantity) : null,
      showPreProductionDueDate: milestoneData.showPreProductionDueDate,
      showMaterialArrivalDate: milestoneData.showMaterialArrivalDate,
      showFirstArticleDueDate: milestoneData.showFirstArticleDueDate,
      showAs9102CompletionDate: milestoneData.showAs9102CompletionDate,
      showFirstArticleApprovedDate: milestoneData.showFirstArticleApprovedDate,
      showFullProductionStartDate: milestoneData.showFullProductionStartDate,
      showPoDueDate: milestoneData.showPoDueDate,
    });
  };

  const handleSignOff = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast({ title: 'Error', description: 'Please provide a signature', variant: 'destructive' });
      return;
    }
    if (!signedByName.trim()) {
      toast({ title: 'Error', description: 'Please enter your name', variant: 'destructive' });
      return;
    }
    const signatureData = sigRef.current.toDataURL();
    signOffMutation.mutate({ signatureData, signedBy: signedByName });
  };

  if (isLoading || !fullChecklist) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isSigned = fullChecklist.status === 'completed' && fullChecklist.signedAt;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{fullChecklist.projectName}</h2>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {fullChecklist.poNumber && <span>PO: {fullChecklist.poNumber}</span>}
            {fullChecklist.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Due: {format(new Date(fullChecklist.dueDate), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </div>
        {!isSigned && (
          <Button onClick={() => setIsSignDialogOpen(true)} data-testid="button-sign-off">
            <PenLine className="h-4 w-4 mr-2" />
            Sign Off
          </Button>
        )}
      </div>

      {/* Progress Summary */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Overall Progress</span>
            <span className="text-2xl font-bold">{fullChecklist.progress || 0}%</span>
          </div>
          <Progress value={fullChecklist.progress || 0} className="h-3" />
          <div className="flex justify-between text-sm text-muted-foreground mt-2">
            <span>{fullChecklist.completedTasks || 0} of {fullChecklist.totalTasks || 0} tasks completed</span>
            {isSigned && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Signed by {fullChecklist.signedBy} on {format(new Date(fullChecklist.signedAt!), 'MMM d, yyyy')}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Timeline Milestones */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Timeline Milestones
            </CardTitle>
            {!isSigned && !isEditingMilestones && (
              <Button variant="outline" size="sm" onClick={startEditingMilestones} data-testid="button-edit-milestones">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isEditingMilestones ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-material-arrival"
                      checked={milestoneData.showMaterialArrivalDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showMaterialArrivalDate: !!c })}
                      data-testid="checkbox-show-material-arrival"
                    />
                    <Label htmlFor="show-material-arrival" className="text-sm">Material Arrival Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.materialArrivalDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, materialArrivalDate: e.target.value })}
                    disabled={!milestoneData.showMaterialArrivalDate}
                    data-testid="input-edit-material-arrival"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-preproduction-due"
                      checked={milestoneData.showPreProductionDueDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showPreProductionDueDate: !!c })}
                      data-testid="checkbox-show-preproduction-due"
                    />
                    <Label htmlFor="show-preproduction-due" className="text-sm">Pre-Production Due Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.preProductionDueDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, preProductionDueDate: e.target.value })}
                    disabled={!milestoneData.showPreProductionDueDate}
                    data-testid="input-edit-preproduction-due"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-first-article-due"
                      checked={milestoneData.showFirstArticleDueDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showFirstArticleDueDate: !!c })}
                      data-testid="checkbox-show-first-article-due"
                    />
                    <Label htmlFor="show-first-article-due" className="text-sm">First Article Due Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.firstArticleDueDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, firstArticleDueDate: e.target.value })}
                    disabled={!milestoneData.showFirstArticleDueDate}
                    data-testid="input-edit-first-article-due"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-as9102"
                      checked={milestoneData.showAs9102CompletionDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showAs9102CompletionDate: !!c })}
                      data-testid="checkbox-show-as9102"
                    />
                    <Label htmlFor="show-as9102" className="text-sm">AS9102 Completion Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.as9102CompletionDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, as9102CompletionDate: e.target.value })}
                    disabled={!milestoneData.showAs9102CompletionDate}
                    data-testid="input-edit-as9102"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-first-article-approved"
                      checked={milestoneData.showFirstArticleApprovedDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showFirstArticleApprovedDate: !!c })}
                      data-testid="checkbox-show-first-article-approved"
                    />
                    <Label htmlFor="show-first-article-approved" className="text-sm">First Article Approved Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.firstArticleApprovedDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, firstArticleApprovedDate: e.target.value })}
                    disabled={!milestoneData.showFirstArticleApprovedDate}
                    data-testid="input-edit-first-article-approved"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-full-production"
                      checked={milestoneData.showFullProductionStartDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showFullProductionStartDate: !!c })}
                      data-testid="checkbox-show-full-production"
                    />
                    <Label htmlFor="show-full-production" className="text-sm">Full Production Start Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.fullProductionStartDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, fullProductionStartDate: e.target.value })}
                    disabled={!milestoneData.showFullProductionStartDate}
                    data-testid="input-edit-full-production"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="show-po-due"
                      checked={milestoneData.showPoDueDate}
                      onCheckedChange={(c) => setMilestoneData({ ...milestoneData, showPoDueDate: !!c })}
                      data-testid="checkbox-show-po-due"
                    />
                    <Label htmlFor="show-po-due" className="text-sm">PO Due Date</Label>
                  </div>
                  <Input
                    type="date"
                    value={milestoneData.poDueDate}
                    onChange={(e) => setMilestoneData({ ...milestoneData, poDueDate: e.target.value })}
                    disabled={!milestoneData.showPoDueDate}
                    data-testid="input-edit-po-due"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">PO Due Quantity</Label>
                  <Input
                    type="number"
                    value={milestoneData.poDueQuantity}
                    onChange={(e) => setMilestoneData({ ...milestoneData, poDueQuantity: e.target.value })}
                    placeholder="Enter quantity"
                    data-testid="input-edit-po-quantity"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={saveMilestones} disabled={updateChecklistMutation.isPending} data-testid="button-save-milestones">
                  <Save className="h-4 w-4 mr-2" />
                  {updateChecklistMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setIsEditingMilestones(false)} data-testid="button-cancel-milestones">
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {fullChecklist.showMaterialArrivalDate !== false && fullChecklist.materialArrivalDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Material Arrival</p>
                  <p className="font-medium">{format(new Date(fullChecklist.materialArrivalDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.showPreProductionDueDate !== false && fullChecklist.preProductionDueDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pre-Production Due</p>
                  <p className="font-medium">{format(new Date(fullChecklist.preProductionDueDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.showFirstArticleDueDate !== false && fullChecklist.firstArticleDueDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">First Article Due</p>
                  <p className="font-medium">{format(new Date(fullChecklist.firstArticleDueDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.showAs9102CompletionDate !== false && fullChecklist.as9102CompletionDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">AS9102 Completion</p>
                  <p className="font-medium">{format(new Date(fullChecklist.as9102CompletionDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.showFirstArticleApprovedDate !== false && fullChecklist.firstArticleApprovedDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">First Article Approved</p>
                  <p className="font-medium">{format(new Date(fullChecklist.firstArticleApprovedDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.showFullProductionStartDate !== false && fullChecklist.fullProductionStartDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Full Production Start</p>
                  <p className="font-medium">{format(new Date(fullChecklist.fullProductionStartDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.showPoDueDate !== false && fullChecklist.poDueDate && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">PO Due Date</p>
                  <p className="font-medium">{format(new Date(fullChecklist.poDueDate), 'MMM d, yyyy')}</p>
                </div>
              )}
              {fullChecklist.poDueQuantity && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">PO Due Quantity</p>
                  <p className="font-medium">{fullChecklist.poDueQuantity}</p>
                </div>
              )}
              {!fullChecklist.materialArrivalDate && !fullChecklist.preProductionDueDate && 
               !fullChecklist.firstArticleDueDate && !fullChecklist.as9102CompletionDate &&
               !fullChecklist.firstArticleApprovedDate && !fullChecklist.fullProductionStartDate &&
               !fullChecklist.poDueDate && !fullChecklist.poDueQuantity && (
                <p className="text-sm text-muted-foreground col-span-full">No milestones set. Click Edit to add timeline milestones.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature Display */}
      {isSigned && fullChecklist.signatureData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sign-off Signature</CardTitle>
          </CardHeader>
          <CardContent>
            <img 
              src={fullChecklist.signatureData} 
              alt="Signature" 
              className="max-h-24 border rounded"
            />
          </CardContent>
        </Card>
      )}

      {/* Sections and Tasks */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Sections & Tasks</h3>
          <Button variant="outline" onClick={() => setIsAddSectionOpen(true)} data-testid="button-add-section">
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        </div>

        {fullChecklist.sections?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No sections yet. Add a section to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" defaultValue={fullChecklist.sections?.map(s => s.id)} className="space-y-2">
            {fullChecklist.sections?.map((section) => (
              <AccordionItem key={section.id} value={section.id} className="border rounded-lg">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center justify-between flex-1 pr-4">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{section.name}</span>
                      <Badge variant="outline">
                        {section.tasks.filter(t => t.isCompleted).length}/{section.tasks.length}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={section.progress || 0} className="w-24 h-2" />
                      <span className="text-sm text-muted-foreground w-12">{section.progress || 0}%</span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {section.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isSigned={!!isSigned}
                        employees={employees}
                        onUpdateTask={(taskId, data) => updateTaskMutation.mutate({ taskId, data })}
                        onDeleteTask={(taskId) => deleteTaskMutation.mutate(taskId)}
                      />
                    ))}
                    
                    {!isSigned && (
                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setAddTaskSectionId(section.id);
                            setIsAddTaskOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Task
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteSectionMutation.mutate(section.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Section
                        </Button>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      {/* Add Section Dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Section Name</Label>
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="Enter section name"
                data-testid="input-section-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSectionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addSectionMutation.mutate({ 
                name: newSectionName, 
                sortOrder: (fullChecklist.sections?.length || 0) + 1 
              })}
              disabled={!newSectionName.trim() || addSectionMutation.isPending}
              data-testid="button-submit-section"
            >
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Description</Label>
              <Textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Enter task description"
                data-testid="input-task-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddTaskOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (addTaskSectionId) {
                  const section = fullChecklist.sections?.find(s => s.id === addTaskSectionId);
                  addTaskMutation.mutate({
                    sectionId: addTaskSectionId,
                    data: {
                      description: newTaskDescription,
                      sortOrder: (section?.tasks.length || 0) + 1,
                    }
                  });
                }
              }}
              disabled={!newTaskDescription.trim() || addTaskMutation.isPending}
              data-testid="button-submit-task"
            >
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign-off Dialog */}
      <Dialog open={isSignDialogOpen} onOpenChange={setIsSignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sign Off Checklist</DialogTitle>
            <DialogDescription>
              Sign to confirm all tasks have been reviewed and completed
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Your Name *</Label>
              <Input
                value={signedByName}
                onChange={(e) => setSignedByName(e.target.value)}
                placeholder="Enter your name"
                data-testid="input-signed-by"
              />
            </div>
            <div className="space-y-2">
              <Label>Signature *</Label>
              <div className="border rounded-lg bg-white">
                <SignatureCanvas
                  ref={sigRef}
                  clearOnResize={false}
                  canvasProps={{
                    className: 'w-full h-32',
                    style: { width: '100%', height: '128px', touchAction: 'none' },
                  }}
                />
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => sigRef.current?.clear()}
              >
                Clear Signature
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSignOff}
              disabled={signOffMutation.isPending}
              data-testid="button-confirm-sign"
            >
              {signOffMutation.isPending ? 'Signing...' : 'Sign Off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===============================
// TASK ROW COMPONENT
// ===============================

function TaskRow({
  task,
  isSigned,
  employees,
  onUpdateTask,
  onDeleteTask,
}: {
  task: ChecklistTask;
  isSigned: boolean;
  employees: Employee[];
  onUpdateTask: (taskId: string, data: any) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(task.isCompleted || !!task.assignedTo);
  const [notes, setNotes] = useState(task.notes || '');
  const [link, setLink] = useState(task.link || '');
  const [hasChanges, setHasChanges] = useState(false);

  const showNotesLinkFields = task.assignedTo || task.isCompleted;

  const handleSaveNotesLink = () => {
    onUpdateTask(task.id, { notes: notes || null, link: link || null });
    setHasChanges(false);
  };

  const handleTaskComplete = (checked: boolean | "indeterminate") => {
    onUpdateTask(task.id, { isCompleted: checked });
    if (checked === true) {
      setIsExpanded(true);
    }
  };

  return (
    <div 
      className={`rounded-lg border ${task.isCompleted ? 'bg-green-50 border-green-200' : 'bg-white'}`}
      data-testid={`task-${task.id}`}
    >
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={task.isCompleted}
          onCheckedChange={handleTaskComplete}
          disabled={isSigned}
          data-testid={`checkbox-task-${task.id}`}
        />
        <div className="flex-1 min-w-0">
          <p className={task.isCompleted ? 'line-through text-muted-foreground' : ''}>
            {task.description}
          </p>
          {task.assignedTo && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Users className="h-3 w-3" />
              Assigned to: {task.assignedTo}
            </p>
          )}
          {task.completedAt && (
            <p className="text-xs text-green-600 mt-1">
              Completed {format(new Date(task.completedAt), 'MMM d, yyyy h:mm a')}
              {task.completedBy && ` by ${task.completedBy}`}
            </p>
          )}
          {(task.notes || task.link) && !isExpanded && (
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {task.notes && (
                <span className="flex items-center gap-1">
                  <StickyNote className="h-3 w-3" />
                  Has notes
                </span>
              )}
              {task.link && (
                <a 
                  href={task.link} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link2 className="h-3 w-3" />
                  View link
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showNotesLinkFields && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(!isExpanded)}
              data-testid={`button-expand-task-${task.id}`}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
          <Select
            value={task.assignedToEmployeeId?.toString() || 'unassigned'}
            onValueChange={(v) => {
              const emp = employees.find(e => e.id.toString() === v);
              onUpdateTask(task.id, { 
                assignedToEmployeeId: v && v !== 'unassigned' ? parseInt(v) : null,
                assignedTo: emp?.name || null,
              });
            }}
            disabled={isSigned}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Assign to..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id.toString()}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isSigned && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onDeleteTask(task.id)}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          )}
        </div>
      </div>
      
      {showNotesLinkFields && isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t mx-3 mt-1">
          <div className="space-y-3 pt-3">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <StickyNote className="h-4 w-4" />
                Notes
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setHasChanges(true);
                }}
                placeholder="Add notes about this task..."
                className="min-h-[80px] text-sm"
                disabled={isSigned}
                data-testid={`input-notes-${task.id}`}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link
              </Label>
              <div className="flex gap-2">
                <Input
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setHasChanges(true);
                  }}
                  placeholder="https://example.com/document"
                  className="text-sm"
                  disabled={isSigned}
                  data-testid={`input-link-${task.id}`}
                />
                {link && (
                  <Button
                    variant="outline"
                    size="icon"
                    asChild
                    className="shrink-0"
                  >
                    <a href={link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
            {hasChanges && !isSigned && (
              <Button 
                size="sm" 
                onClick={handleSaveNotesLink}
                data-testid={`button-save-notes-${task.id}`}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Notes & Link
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===============================
// TEMPLATES TAB
// ===============================

function TemplatesTab({
  onSelectTemplate,
  isCreateOpen,
  setIsCreateOpen,
}: {
  onSelectTemplate: (t: Template) => void;
  isCreateOpen: boolean;
  setIsCreateOpen: (b: boolean) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['/api/preproduction-checklists/templates'],
  });

  const [newTemplate, setNewTemplate] = useState({ name: '', description: '' });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('/api/preproduction-checklists/templates', { method: 'POST', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists/templates'] });
      toast({ title: 'Success', description: 'Template created' });
      setIsCreateOpen(false);
      setNewTemplate({ name: '', description: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/preproduction-checklists/templates/${id}`, { method: 'PATCH', body: { isActive: false } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists/templates'] });
      toast({ title: 'Template archived' });
    },
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/preproduction-checklists/templates/seed-default', { method: 'POST' }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['/api/preproduction-checklists/templates'] });
      toast({ title: 'Success', description: data.message || 'Default template imported' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to import default template', variant: 'destructive' });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground">
          Create reusable templates with predefined sections and tasks
        </p>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            data-testid="button-import-default"
          >
            <FileText className="h-4 w-4 mr-2" />
            {seedMutation.isPending ? 'Importing...' : 'Import Default Template'}
          </Button>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-template">
            <Plus className="h-4 w-4 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No templates yet</h3>
            <p className="text-muted-foreground mt-1">
              Create a template to reuse across projects
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card 
              key={template.id} 
              className="hover:shadow-md transition-shadow cursor-pointer"
              data-testid={`card-template-${template.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1" onClick={() => onSelectTemplate(template)}>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    {template.description && (
                      <CardDescription className="line-clamp-2">{template.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onSelectTemplate(template)}
                      data-testid={`button-edit-template-${template.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(template.id)}
                      data-testid={`button-delete-template-${template.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent onClick={() => onSelectTemplate(template)}>
                <div className="text-sm text-muted-foreground">
                  Created {format(new Date(template.createdAt), 'MMM d, yyyy')}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a reusable template for pre-production checklists
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                placeholder="Enter template name"
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                placeholder="Enter description (optional)"
                data-testid="input-template-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newTemplate)}
              disabled={!newTemplate.name.trim() || createMutation.isPending}
              data-testid="button-submit-template"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===============================
// TEMPLATE DETAIL VIEW
// ===============================

function TemplateDetailView({
  template,
  onBack,
}: {
  template: Template;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [addTaskSectionId, setAddTaskSectionId] = useState<string | null>(null);
  const [newTaskDescription, setNewTaskDescription] = useState('');

  const { data: fullTemplate, isLoading, refetch } = useQuery<Template>({
    queryKey: ['/api/preproduction-checklists/templates', template.id],
    queryFn: () => apiRequest(`/api/preproduction-checklists/templates/${template.id}`),
  });

  const addSectionMutation = useMutation({
    mutationFn: (data: { name: string; sortOrder: number }) =>
      apiRequest(`/api/preproduction-checklists/templates/${template.id}/sections`, { method: 'POST', body: data }),
    onSuccess: () => {
      refetch();
      setIsAddSectionOpen(false);
      setNewSectionName('');
      toast({ title: 'Section added' });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: any }) =>
      apiRequest(`/api/preproduction-checklists/templates/sections/${sectionId}/tasks`, { method: 'POST', body: data }),
    onSuccess: () => {
      refetch();
      setIsAddTaskOpen(false);
      setNewTaskDescription('');
      setAddTaskSectionId(null);
      toast({ title: 'Task added' });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiRequest(`/api/preproduction-checklists/templates/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetch();
      toast({ title: 'Task deleted' });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: string) =>
      apiRequest(`/api/preproduction-checklists/templates/sections/${sectionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetch();
      toast({ title: 'Section deleted' });
    },
  });

  if (isLoading || !fullTemplate) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-template">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{fullTemplate.name}</h2>
          {fullTemplate.description && (
            <p className="text-muted-foreground mt-1">{fullTemplate.description}</p>
          )}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Template Sections</h3>
          <Button variant="outline" onClick={() => setIsAddSectionOpen(true)} data-testid="button-add-template-section">
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        </div>

        {fullTemplate.sections?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No sections yet. Add sections to define your template.</p>
            </CardContent>
          </Card>
        ) : (
          <Accordion type="multiple" defaultValue={fullTemplate.sections?.map(s => s.id)} className="space-y-2">
            {fullTemplate.sections?.map((section) => (
              <AccordionItem key={section.id} value={section.id} className="border rounded-lg">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{section.name}</span>
                    <Badge variant="outline">{section.tasks.length} tasks</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-2">
                    {section.tasks.map((task) => (
                      <div 
                        key={task.id} 
                        className="flex items-center justify-between p-3 rounded-lg border bg-white"
                      >
                        <p>{task.description}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteTaskMutation.mutate(task.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setAddTaskSectionId(section.id);
                          setIsAddTaskOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Task
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => deleteSectionMutation.mutate(section.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete Section
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>

      {/* Add Section Dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section to Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Section Name</Label>
              <Input
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                placeholder="Enter section name"
                data-testid="input-template-section-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSectionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addSectionMutation.mutate({ 
                name: newSectionName, 
                sortOrder: (fullTemplate.sections?.length || 0) + 1 
              })}
              disabled={!newSectionName.trim() || addSectionMutation.isPending}
              data-testid="button-submit-template-section"
            >
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task to Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Task Description</Label>
              <Textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Enter task description"
                data-testid="input-template-task-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddTaskOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (addTaskSectionId) {
                  const section = fullTemplate.sections?.find(s => s.id === addTaskSectionId);
                  addTaskMutation.mutate({
                    sectionId: addTaskSectionId,
                    data: {
                      description: newTaskDescription,
                      sortOrder: (section?.tasks.length || 0) + 1,
                    }
                  });
                }
              }}
              disabled={!newTaskDescription.trim() || addTaskMutation.isPending}
              data-testid="button-submit-template-task"
            >
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

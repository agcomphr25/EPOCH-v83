import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Filter, Calendar, User, Building2, ChevronRight, FolderOpen, Paperclip } from 'lucide-react';
import { format } from 'date-fns';

interface ProjectStep {
  id: string;
  stepType: string;
  stepOrder: number;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped' | 'not_applicable';
  startedAt: string | null;
  completedAt: string | null;
}

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  customerId: string;
  description: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled';
  currentStepType: string;
  targetShipDate: string | null;
  projectManagerId: number | null;
  reminderDays: number;
  createdAt: string;
  steps: ProjectStep[];
  customer?: { id: number; customerId: string; name: string };
  projectManager?: { id: number; name: string };
  attachmentCount?: number;
  currentStage?: string;
  stageUpdatedAt?: string;
  poId?: number;
}

interface P2Customer {
  id: number;
  customerId: string;
  customerName: string;
  company?: string;
}

interface Employee {
  id: number;
  name: string;
  userRole: string;
}

const STEP_LABELS: Record<string, string> = {
  rfq_risk_assessment: 'RFQ Risk Assessment',
  quote: 'Quote',
  purchase_review_checklist: 'Purchase Review',
  preproduction_checklist: 'Pre-production',
  p2_order: 'P2 Order',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
  inactive: 'bg-gray-100 text-gray-800',
  won: 'bg-emerald-100 text-emerald-800',
  lost: 'bg-orange-100 text-orange-800',
};

const STAGE_LABELS: Record<string, string> = {
  rfq_received: 'RFQ Received',
  quote_preparing: 'Quote Preparing',
  quote_submitted: 'Quote Submitted',
  purchase_review: 'Purchase Review',
  po_received: 'PO Received',
  production: 'Production',
  shipping: 'Shipping',
  completed: 'Completed',
  inactive: 'Inactive',
};

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-200',
  in_progress: 'bg-blue-500',
  completed: 'bg-green-500',
  blocked: 'bg-red-500',
  skipped: 'bg-gray-300',
  not_applicable: 'bg-gray-300',
};

export default function ProjectsPage() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    projectName: '',
    customerId: '',
    description: '',
    targetShipDate: '',
    projectManagerId: '',
    reminderDays: 3,
  });

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const { data: p2Customers = [] } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: typeof newProject) => {
      return apiRequest('/api/projects', {
        method: 'POST',
        body: {
          ...data,
          projectManagerId: data.projectManagerId ? parseInt(data.projectManagerId) : null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setIsCreateDialogOpen(false);
      setNewProject({
        projectName: '',
        customerId: '',
        description: '',
        targetShipDate: '',
        projectManagerId: '',
        reminderDays: 3,
      });
    },
  });

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = 
      project.projectCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.customer?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCustomer = customerFilter === 'all' || project.customerId === customerFilter;
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter || project.currentStage === statusFilter;
    
    return matchesSearch && matchesCustomer && matchesStatus;
  });

  const getProgress = (steps: ProjectStep[]) => {
    if (!steps.length) return 0;
    const completed = steps.filter(s => s.status === 'completed').length;
    return Math.round((completed / steps.length) * 100);
  };

  const getCurrentStepLabel = (steps: ProjectStep[]) => {
    const current = steps.find(s => s.status === 'in_progress');
    if (current) return STEP_LABELS[current.stepType] || current.stepType;
    const pending = steps.find(s => s.status === 'pending');
    if (pending) return STEP_LABELS[pending.stepType] || pending.stepType;
    return 'Completed';
  };

  const allEmployees = employees;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">P2 Projects</h1>
          <p className="text-muted-foreground">Track and manage P2 project workflows</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-new-project">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-customer-filter">
            <Building2 className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {p2Customers.map((customer) => (
              <SelectItem key={customer.customerId} value={customer.customerId}>
                {customer.customerName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-6 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                <div className="h-2 bg-gray-200 rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No projects found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || customerFilter !== 'all' || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first project to get started'}
          </p>
          {!searchQuery && customerFilter === 'all' && statusFilter === 'all' && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Card 
              key={project.id} 
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setLocation(`/projects/${project.id}`)}
              data-testid={`card-project-${project.projectCode}`}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{project.projectCode}</CardTitle>
                    <CardDescription className="font-medium text-foreground">
                      {project.projectName}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={STATUS_COLORS[project.status]}>
                      {project.status.replace('_', ' ')}
                    </Badge>
                    {project.currentStage && (
                      <Badge variant="outline" className="text-xs">
                        {STAGE_LABELS[project.currentStage] || project.currentStage}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{project.customer?.name || 'Unknown Customer'}</span>
                </div>
                
                {project.projectManager && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{project.projectManager.name}</span>
                  </div>
                )}
                
                {project.targetShipDate && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Target: {format(new Date(project.targetShipDate), 'MMM d, yyyy')}</span>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{getProgress(project.steps)}%</span>
                  </div>
                  <Progress value={getProgress(project.steps)} className="h-2" />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Current: {getCurrentStepLabel(project.steps)}
                    </span>
                    <div className="flex gap-1">
                      {project.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`h-2 w-2 rounded-full ${STEP_STATUS_COLORS[step.status]}`}
                          title={STEP_LABELS[step.stepType]}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between items-center">
                  {(project.attachmentCount ?? 0) > 0 ? (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>{project.attachmentCount} doc{project.attachmentCount !== 1 ? 's' : ''}</span>
                    </div>
                  ) : (
                    <div />
                  )}
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Start a new P2 project workflow. All steps will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                value={newProject.projectName}
                onChange={(e) => setNewProject({ ...newProject, projectName: e.target.value })}
                placeholder="Enter project name"
                data-testid="input-project-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerId">Customer *</Label>
              <Select 
                value={newProject.customerId} 
                onValueChange={(value) => setNewProject({ ...newProject, customerId: value })}
              >
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {p2Customers.map((customer) => (
                    <SelectItem key={customer.customerId} value={customer.customerId}>
                      {customer.customerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="projectManager">Project Manager</Label>
              <Select 
                value={newProject.projectManagerId} 
                onValueChange={(value) => setNewProject({ ...newProject, projectManagerId: value })}
              >
                <SelectTrigger data-testid="select-project-manager">
                  <SelectValue placeholder="Select project manager" />
                </SelectTrigger>
                <SelectContent>
                  {allEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id.toString()}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetShipDate">Target Ship Date</Label>
              <Input
                id="targetShipDate"
                type="date"
                value={newProject.targetShipDate}
                onChange={(e) => setNewProject({ ...newProject, targetShipDate: e.target.value })}
                data-testid="input-target-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminderDays">Reminder Days</Label>
              <Input
                id="reminderDays"
                type="number"
                min={1}
                value={newProject.reminderDays}
                onChange={(e) => setNewProject({ ...newProject, reminderDays: parseInt(e.target.value) || 3 })}
                data-testid="input-reminder-days"
              />
              <p className="text-xs text-muted-foreground">Days without progress before sending reminder</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                placeholder="Project description (optional)"
                data-testid="input-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createProjectMutation.mutate(newProject)}
              disabled={!newProject.projectName || !newProject.customerId || createProjectMutation.isPending}
              data-testid="button-create-project"
            >
              {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

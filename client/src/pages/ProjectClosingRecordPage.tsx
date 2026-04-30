import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  Save,
  Edit,
  ShieldAlert,
  ListChecks,
  User,
  Building2,
  Calendar,
  Lock,
  ThumbsUp,
  CheckCheck,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled' | 'inactive' | 'won' | 'lost';
  closingStatus: 'MISSING' | 'INCOMPLETE' | 'COMPLETE';
  customer?: { id: number; customerId: string; name: string };
}

interface ProjectClosing {
  id: number;
  projectId: string;
  summary: string | null;
  whatWentWrong: string | null;
  strengths: string | null;
  opportunities: string | null;
  similaritiesToPriorProjects: string | null;
  nextProjectRecommendations: string | null;
  closedBy: number | null;
  closedByDisplayName: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectClosingRisk {
  id: number;
  projectId: string;
  closingId: number;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  department: string | null;
  owner: string | null;
  createdAt: string;
}

interface ProjectClosingAction {
  id: number;
  projectId: string;
  closingId: number;
  actionText: string;
  owner: string | null;
  department: string | null;
  dueDate: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
}

interface Employee {
  id: number;
  name: string;
  userRole: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const ACTION_STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
};

const REQUIRED_FIELDS: (keyof ProjectClosing)[] = [
  'summary',
  'whatWentWrong',
  'strengths',
  'opportunities',
  'nextProjectRecommendations',
];

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  summary: 'Summary',
  whatWentWrong: 'What Went Wrong',
  strengths: 'Strengths',
  opportunities: 'Opportunities',
  nextProjectRecommendations: 'Recommendations',
};

function getMissingFields(closing: ProjectClosing | null | undefined): string[] {
  if (!closing) return REQUIRED_FIELDS.map(f => REQUIRED_FIELD_LABELS[f]);
  return REQUIRED_FIELDS
    .filter(f => !closing[f])
    .map(f => REQUIRED_FIELD_LABELS[f]);
}

export default function ProjectClosingRecordPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    summary: '',
    whatWentWrong: '',
    strengths: '',
    opportunities: '',
    similaritiesToPriorProjects: '',
    nextProjectRecommendations: '',
    closedByDisplayName: '',
  });

  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectClosingRisk | null>(null);
  const [riskForm, setRiskForm] = useState({
    category: '',
    severity: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    description: '',
    department: '',
    owner: '',
  });
  const [deletingRiskId, setDeletingRiskId] = useState<number | null>(null);

  const [showActionDialog, setShowActionDialog] = useState(false);
  const [editingAction, setEditingAction] = useState<ProjectClosingAction | null>(null);
  const [actionForm, setActionForm] = useState({
    actionText: '',
    owner: '',
    department: '',
    dueDate: '',
    status: 'open' as 'open' | 'in_progress' | 'completed' | 'cancelled',
  });
  const [deletingActionId, setDeletingActionId] = useState<number | null>(null);

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [approveEmployeeId, setApproveEmployeeId] = useState('');

  const { data: project, isLoading: isLoadingProject } = useQuery<Project>({
    queryKey: ['/api/projects', id],
    enabled: !!id,
  });

  const { data: closing, isLoading: isLoadingClosing } = useQuery<ProjectClosing | null>({
    queryKey: ['/api/projects', id, 'closing'],
    queryFn: () =>
      fetch(`/api/projects/${id}/closing`, { credentials: 'include' }).then(async r => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('Failed to fetch closing');
        return r.json();
      }),
    enabled: !!id,
  });

  const { data: risks = [] } = useQuery<ProjectClosingRisk[]>({
    queryKey: ['/api/projects', id, 'closing', 'risks'],
    queryFn: () =>
      fetch(`/api/projects/${id}/closing/risks`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });

  const { data: actions = [] } = useQuery<ProjectClosingAction[]>({
    queryKey: ['/api/projects', id, 'closing', 'actions'],
    queryFn: () =>
      fetch(`/api/projects/${id}/closing/actions`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const isReadOnly = project?.status === 'completed';

  const createClosingMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      apiRequest(`/api/projects/${id}/closing`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setIsEditing(false);
      toast({ title: 'Closing record created', description: 'Lessons learned have been saved.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Save failed', description: err?.message || 'Could not save closing record.', variant: 'destructive' }),
  });

  const updateClosingMutation = useMutation({
    mutationFn: ({ closingId, data }: { closingId: number; data: typeof formData }) =>
      apiRequest(`/api/projects/${id}/closing/${closingId}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setIsEditing(false);
      toast({ title: 'Closing record updated', description: 'Lessons learned have been saved.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Update failed', description: err?.message || 'Could not update closing record.', variant: 'destructive' }),
  });

  const addRiskMutation = useMutation({
    mutationFn: (data: typeof riskForm) =>
      apiRequest(`/api/projects/${id}/closing/risks`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'risks'] });
      setShowRiskDialog(false);
      setRiskForm({ category: '', severity: 'medium', description: '', department: '', owner: '' });
      toast({ title: 'Risk added' });
    },
    onError: (err: Error) =>
      toast({ title: 'Failed to add risk', description: err?.message, variant: 'destructive' }),
  });

  const updateRiskMutation = useMutation({
    mutationFn: ({ riskId, data }: { riskId: number; data: typeof riskForm }) =>
      apiRequest(`/api/projects/${id}/closing/risks/${riskId}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'risks'] });
      setEditingRisk(null);
      toast({ title: 'Risk updated' });
    },
    onError: (err: Error) =>
      toast({ title: 'Failed to update risk', description: err?.message, variant: 'destructive' }),
  });

  const deleteRiskMutation = useMutation({
    mutationFn: (riskId: number) =>
      apiRequest(`/api/projects/${id}/closing/risks/${riskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'risks'] });
      setDeletingRiskId(null);
      toast({ title: 'Risk removed' });
    },
    onError: (err: Error) =>
      toast({ title: 'Failed to remove risk', description: err?.message, variant: 'destructive' }),
  });

  const addActionMutation = useMutation({
    mutationFn: (data: typeof actionForm) =>
      apiRequest(`/api/projects/${id}/closing/actions`, {
        method: 'POST',
        body: { ...data, dueDate: data.dueDate || null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'actions'] });
      setShowActionDialog(false);
      setActionForm({ actionText: '', owner: '', department: '', dueDate: '', status: 'open' });
      toast({ title: 'Action added' });
    },
    onError: (err: Error) =>
      toast({ title: 'Failed to add action', description: err?.message, variant: 'destructive' }),
  });

  const updateActionMutation = useMutation({
    mutationFn: ({ actionId, data }: { actionId: number; data: typeof actionForm }) =>
      apiRequest(`/api/projects/${id}/closing/actions/${actionId}`, {
        method: 'PATCH',
        body: { ...data, dueDate: data.dueDate || null },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'actions'] });
      setEditingAction(null);
      toast({ title: 'Action updated' });
    },
    onError: (err: Error) =>
      toast({ title: 'Failed to update action', description: err?.message, variant: 'destructive' }),
  });

  const deleteActionMutation = useMutation({
    mutationFn: (actionId: number) =>
      apiRequest(`/api/projects/${id}/closing/actions/${actionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'actions'] });
      setDeletingActionId(null);
      toast({ title: 'Action removed' });
    },
    onError: (err: Error) =>
      toast({ title: 'Failed to remove action', description: err?.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: (approvedBy: number) =>
      apiRequest(`/api/projects/${id}/closing/approve`, { method: 'POST', body: { approvedBy } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setShowApproveDialog(false);
      setApproveEmployeeId('');
      toast({ title: 'Closing approved', description: 'The closing record has been approved.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Approval failed', description: err?.message || 'Could not approve closing record.', variant: 'destructive' }),
  });

  const handleEditRisk = (risk: ProjectClosingRisk) => {
    setRiskForm({
      category: risk.category,
      severity: risk.severity,
      description: risk.description,
      department: risk.department || '',
      owner: risk.owner || '',
    });
    setEditingRisk(risk);
  };

  const handleEditAction = (action: ProjectClosingAction) => {
    setActionForm({
      actionText: action.actionText,
      owner: action.owner || '',
      department: action.department || '',
      dueDate: action.dueDate || '',
      status: action.status,
    });
    setEditingAction(action);
  };

  const handleStartEdit = () => {
    if (closing) {
      setFormData({
        summary: closing.summary || '',
        whatWentWrong: closing.whatWentWrong || '',
        strengths: closing.strengths || '',
        opportunities: closing.opportunities || '',
        similaritiesToPriorProjects: closing.similaritiesToPriorProjects || '',
        nextProjectRecommendations: closing.nextProjectRecommendations || '',
        closedByDisplayName: closing.closedByDisplayName || '',
      });
    } else {
      setFormData({ summary: '', whatWentWrong: '', strengths: '', opportunities: '', similaritiesToPriorProjects: '', nextProjectRecommendations: '', closedByDisplayName: '' });
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    if (closing) {
      updateClosingMutation.mutate({ closingId: closing.id, data: formData });
    } else {
      createClosingMutation.mutate(formData);
    }
  };

  if (isLoadingProject || isLoadingClosing) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-40 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto p-6 text-center">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Button onClick={() => setLocation('/projects')} className="mt-4">
          Back to Projects
        </Button>
      </div>
    );
  }

  const missingFields = getMissingFields(closing);
  const isApproved = !!closing?.approvedBy;
  const approvedEmployee = employees.find(e => e.id === closing?.approvedBy);

  const renderStatusBanner = () => {
    if (!closing) {
      return (
        <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950 dark:border-red-800 px-4 py-3 text-red-800 dark:text-red-200">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Closing Record Missing</p>
            <p className="text-sm mt-0.5">No closing record has been created yet. Click "Start Project Closing" below to begin.</p>
          </div>
        </div>
      );
    }
    if (project.closingStatus === 'COMPLETE' && isApproved) {
      return (
        <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-800 px-4 py-3 text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Closing Record Complete &amp; Approved</p>
            <p className="text-sm mt-0.5">All required fields are filled and the record has been approved. This project is ready to close.</p>
          </div>
        </div>
      );
    }
    if (project.closingStatus === 'COMPLETE' && !isApproved) {
      return (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-3 text-amber-800 dark:text-amber-200">
          <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">All Fields Complete — Awaiting Approval</p>
            <p className="text-sm mt-0.5">All required fields are filled. A manager must approve this record before the project can be fully closed.</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-3 text-amber-800 dark:text-amber-200">
        <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Incomplete</p>
          {missingFields.length > 0 && (
            <p className="text-sm mt-0.5">Still missing: {missingFields.join(', ')}.</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation(`/projects/${id}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{project.projectCode}</h1>
            <Badge variant="outline" className="text-sm">{project.projectName}</Badge>
            {isReadOnly && (
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                <Lock className="h-3 w-3 mr-1" />
                Read-only — Project Completed
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-0.5">Closing Record &amp; Lessons Learned</p>
        </div>
      </div>

      {/* Status Banner */}
      {renderStatusBanner()}

      {/* Lessons Learned Card */}
      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {closing ? 'Edit' : 'New'} Project Closing
            </CardTitle>
            <CardDescription>Fill in the lessons learned from this project.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="closing-closed-by">Closed By</Label>
              <Input
                id="closing-closed-by"
                placeholder="Name of person closing the project"
                value={formData.closedByDisplayName}
                onChange={e => setFormData(f => ({ ...f, closedByDisplayName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing-summary">Summary <span className="text-red-500">*</span></Label>
              <Textarea
                id="closing-summary"
                placeholder="Overall summary of the project…"
                rows={4}
                value={formData.summary}
                onChange={e => setFormData(f => ({ ...f, summary: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="closing-strengths">Strengths <span className="text-red-500">*</span></Label>
                <Textarea
                  id="closing-strengths"
                  placeholder="What went well?"
                  rows={4}
                  value={formData.strengths}
                  onChange={e => setFormData(f => ({ ...f, strengths: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closing-what-went-wrong">What Went Wrong <span className="text-red-500">*</span></Label>
                <Textarea
                  id="closing-what-went-wrong"
                  placeholder="What could have been better?"
                  rows={4}
                  value={formData.whatWentWrong}
                  onChange={e => setFormData(f => ({ ...f, whatWentWrong: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing-opportunities">Opportunities for Improvement <span className="text-red-500">*</span></Label>
              <Textarea
                id="closing-opportunities"
                placeholder="What opportunities for improvement were identified?"
                rows={3}
                value={formData.opportunities}
                onChange={e => setFormData(f => ({ ...f, opportunities: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing-similarities">Similarities to Prior Projects</Label>
              <Textarea
                id="closing-similarities"
                placeholder="How does this project compare to previous ones?"
                rows={3}
                value={formData.similaritiesToPriorProjects}
                onChange={e => setFormData(f => ({ ...f, similaritiesToPriorProjects: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing-recommendations">Recommendations for Next Projects <span className="text-red-500">*</span></Label>
              <Textarea
                id="closing-recommendations"
                placeholder="What would you recommend for future similar projects?"
                rows={3}
                value={formData.nextProjectRecommendations}
                onChange={e => setFormData(f => ({ ...f, nextProjectRecommendations: e.target.value }))}
              />
            </div>
          </CardContent>
          <div className="flex justify-end gap-3 px-6 pb-6">
            <Button
              variant="outline"
              onClick={() => setIsEditing(false)}
              disabled={createClosingMutation.isPending || updateClosingMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createClosingMutation.isPending || updateClosingMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {createClosingMutation.isPending || updateClosingMutation.isPending ? 'Saving…' : 'Save Closing Record'}
            </Button>
          </div>
        </Card>
      ) : closing ? (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Project Closing
                </CardTitle>
                {closing.closedByDisplayName && (
                  <CardDescription className="mt-1">
                    Closed by {closing.closedByDisplayName} · {format(new Date(closing.createdAt), 'MMM d, yyyy')}
                  </CardDescription>
                )}
              </div>
              {!isReadOnly && (
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Edit className="h-4 w-4 mr-1.5" />
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {closing.summary && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                <p className="text-sm whitespace-pre-wrap">{closing.summary}</p>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {closing.strengths && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Strengths</p>
                  <p className="text-sm whitespace-pre-wrap">{closing.strengths}</p>
                </div>
              )}
              {closing.whatWentWrong && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">What Went Wrong</p>
                  <p className="text-sm whitespace-pre-wrap">{closing.whatWentWrong}</p>
                </div>
              )}
            </div>
            {closing.opportunities && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Opportunities for Improvement</p>
                <p className="text-sm whitespace-pre-wrap">{closing.opportunities}</p>
              </div>
            )}
            {closing.similaritiesToPriorProjects && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Similarities to Prior Projects</p>
                <p className="text-sm whitespace-pre-wrap">{closing.similaritiesToPriorProjects}</p>
              </div>
            )}
            {closing.nextProjectRecommendations && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recommendations for Next Projects</p>
                <p className="text-sm whitespace-pre-wrap">{closing.nextProjectRecommendations}</p>
              </div>
            )}
            {!closing.summary && !closing.strengths && !closing.whatWentWrong && !closing.opportunities && !closing.nextProjectRecommendations && (
              <p className="text-sm text-muted-foreground text-center py-4">No fields filled in yet. Click Edit to begin.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40" />
            <p className="text-muted-foreground">No closing record has been created for this project yet.</p>
            {!isReadOnly && (
              <Button onClick={handleStartEdit}>
                <Plus className="h-4 w-4 mr-2" />
                Start Project Closing
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Risks Section */}
      {closing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-4 w-4" />
                Risks Identified
              </CardTitle>
              {!isReadOnly && (
                <Button size="sm" variant="outline" onClick={() => setShowRiskDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Risk
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {risks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No risks recorded yet.{!isReadOnly && ' Click "Add Risk" to record one.'}
              </p>
            ) : (
              <div className="space-y-3">
                {risks.map(risk => (
                  <div key={risk.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={SEVERITY_COLORS[risk.severity]}>{risk.severity}</Badge>
                        <span className="text-sm font-medium">{risk.category}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {(risk.owner || risk.department) && (
                          <span className="text-xs text-muted-foreground mr-1">
                            {[risk.owner, risk.department].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {!isReadOnly && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditRisk(risk)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeletingRiskId(risk.id)}
                              disabled={deleteRiskMutation.isPending && deletingRiskId === risk.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{risk.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions Section */}
      {closing && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4" />
                Follow-up Actions
              </CardTitle>
              {!isReadOnly && (
                <Button size="sm" variant="outline" onClick={() => setShowActionDialog(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Action
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No actions recorded yet.{!isReadOnly && ' Click "Add Action" to record one.'}
              </p>
            ) : (
              <div className="space-y-3">
                {actions.map(action => (
                  <div key={action.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium flex-1">{action.actionText}</p>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Badge className={ACTION_STATUS_COLORS[action.status]}>
                          {action.status.replace('_', ' ')}
                        </Badge>
                        {!isReadOnly && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => handleEditAction(action)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeletingActionId(action.id)}
                              disabled={deleteActionMutation.isPending && deletingActionId === action.id}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      {action.owner && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />{action.owner}
                        </span>
                      )}
                      {action.department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />{action.department}
                        </span>
                      )}
                      {action.dueDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Due {format(new Date(action.dueDate), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Approval Section */}
      {closing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCheck className="h-4 w-4" />
              Manager Approval
            </CardTitle>
            <CardDescription>
              A manager must approve this closing record before the project can be marked complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isApproved ? (
              <div className="flex items-center gap-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-800 px-4 py-3">
                <ThumbsUp className="h-5 w-5 text-green-700 dark:text-green-300 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-200">Approved</p>
                  <p className="text-xs text-green-700 dark:text-green-400">
                    {approvedEmployee?.name
                      ? `Approved by ${approvedEmployee.name}`
                      : `Approved by employee #${closing.approvedBy}`}
                    {closing.approvedAt && ` on ${format(new Date(closing.approvedAt), 'MMM d, yyyy')}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 px-4 py-3">
                  <Clock className="h-5 w-5 text-amber-700 dark:text-amber-300 flex-shrink-0" />
                  <p className="text-sm text-amber-800 dark:text-amber-200">Pending manager approval</p>
                </div>
                {!isReadOnly && missingFields.length === 0 && (
                  <Button onClick={() => setShowApproveDialog(true)}>
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Approve Closing Record
                  </Button>
                )}
                {!isReadOnly && missingFields.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Complete all required fields before approving.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Risk Dialog */}
      <Dialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Risk</DialogTitle>
            <DialogDescription>Record a risk identified during this project for future reference.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Input
                placeholder="e.g. Schedule, Cost, Technical, Quality"
                value={riskForm.category}
                onChange={e => setRiskForm(f => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Severity *</Label>
              <Select
                value={riskForm.severity}
                onValueChange={(v: 'low' | 'medium' | 'high' | 'critical') =>
                  setRiskForm(f => ({ ...f, severity: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="Describe the risk in detail…"
                rows={3}
                value={riskForm.description}
                onChange={e => setRiskForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  placeholder="Person responsible"
                  value={riskForm.owner}
                  onChange={e => setRiskForm(f => ({ ...f, owner: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="Department"
                  value={riskForm.department}
                  onChange={e => setRiskForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRiskDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addRiskMutation.mutate(riskForm)}
              disabled={!riskForm.category.trim() || !riskForm.description.trim() || addRiskMutation.isPending}
            >
              {addRiskMutation.isPending ? 'Adding…' : 'Add Risk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Risk Dialog */}
      <Dialog open={editingRisk !== null} onOpenChange={open => { if (!open) setEditingRisk(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Risk</DialogTitle>
            <DialogDescription>Update the details of this identified risk.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Input
                placeholder="e.g. Schedule, Cost, Technical, Quality"
                value={riskForm.category}
                onChange={e => setRiskForm(f => ({ ...f, category: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Severity *</Label>
              <Select
                value={riskForm.severity}
                onValueChange={(v: 'low' | 'medium' | 'high' | 'critical') =>
                  setRiskForm(f => ({ ...f, severity: v }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="Describe the risk in detail…"
                rows={3}
                value={riskForm.description}
                onChange={e => setRiskForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  placeholder="Person responsible"
                  value={riskForm.owner}
                  onChange={e => setRiskForm(f => ({ ...f, owner: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="Department"
                  value={riskForm.department}
                  onChange={e => setRiskForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRisk(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingRisk) updateRiskMutation.mutate({ riskId: editingRisk.id, data: riskForm });
              }}
              disabled={!riskForm.category.trim() || !riskForm.description.trim() || updateRiskMutation.isPending}
            >
              {updateRiskMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Risk Confirmation Dialog */}
      <Dialog open={deletingRiskId !== null} onOpenChange={open => { if (!open) setDeletingRiskId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Risk</DialogTitle>
            <DialogDescription>Are you sure you want to remove this risk? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingRiskId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deletingRiskId !== null) deleteRiskMutation.mutate(deletingRiskId); }}
              disabled={deleteRiskMutation.isPending}
            >
              {deleteRiskMutation.isPending ? 'Removing…' : 'Remove Risk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up Action</DialogTitle>
            <DialogDescription>Record an action item to follow up on after this project closes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Action *</Label>
              <Textarea
                placeholder="Describe the action to take…"
                rows={3}
                value={actionForm.actionText}
                onChange={e => setActionForm(f => ({ ...f, actionText: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  placeholder="Person responsible"
                  value={actionForm.owner}
                  onChange={e => setActionForm(f => ({ ...f, owner: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="Department"
                  value={actionForm.department}
                  onChange={e => setActionForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={actionForm.dueDate}
                  onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={actionForm.status}
                  onValueChange={(v: 'open' | 'in_progress' | 'completed' | 'cancelled') =>
                    setActionForm(f => ({ ...f, status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)}>Cancel</Button>
            <Button
              onClick={() => addActionMutation.mutate(actionForm)}
              disabled={!actionForm.actionText.trim() || addActionMutation.isPending}
            >
              {addActionMutation.isPending ? 'Adding…' : 'Add Action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Action Dialog */}
      <Dialog open={editingAction !== null} onOpenChange={open => { if (!open) setEditingAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Follow-up Action</DialogTitle>
            <DialogDescription>Update the details of this follow-up action.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Action *</Label>
              <Textarea
                placeholder="Describe the action to take…"
                rows={3}
                value={actionForm.actionText}
                onChange={e => setActionForm(f => ({ ...f, actionText: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  placeholder="Person responsible"
                  value={actionForm.owner}
                  onChange={e => setActionForm(f => ({ ...f, owner: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input
                  placeholder="Department"
                  value={actionForm.department}
                  onChange={e => setActionForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={actionForm.dueDate}
                  onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={actionForm.status}
                  onValueChange={(v: 'open' | 'in_progress' | 'completed' | 'cancelled') =>
                    setActionForm(f => ({ ...f, status: v }))
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAction(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingAction) updateActionMutation.mutate({ actionId: editingAction.id, data: actionForm });
              }}
              disabled={!actionForm.actionText.trim() || updateActionMutation.isPending}
            >
              {updateActionMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Action Confirmation Dialog */}
      <Dialog open={deletingActionId !== null} onOpenChange={open => { if (!open) setDeletingActionId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Action</DialogTitle>
            <DialogDescription>Are you sure you want to remove this action? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingActionId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (deletingActionId !== null) deleteActionMutation.mutate(deletingActionId); }}
              disabled={deleteActionMutation.isPending}
            >
              {deleteActionMutation.isPending ? 'Removing…' : 'Remove Action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Closing Record</DialogTitle>
            <DialogDescription>
              Select the manager who is approving this closing record. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Approving Manager *</Label>
            <Select value={approveEmployeeId} onValueChange={setApproveEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a manager…" />
              </SelectTrigger>
              <SelectContent>
                {employees
                  .filter(e => ['MANAGER', 'ADMIN', 'OWNER', 'SUPERVISOR'].includes(e.userRole))
                  .map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                {employees.filter(e => !['MANAGER', 'ADMIN', 'OWNER', 'SUPERVISOR'].includes(e.userRole)).length > 0 && (
                  <>
                    <Separator className="my-1" />
                    {employees
                      .filter(e => !['MANAGER', 'ADMIN', 'OWNER', 'SUPERVISOR'].includes(e.userRole))
                      .map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                      ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (approveEmployeeId) {
                  approveMutation.mutate(parseInt(approveEmployeeId, 10));
                }
              }}
              disabled={!approveEmployeeId || approveMutation.isPending}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              {approveMutation.isPending ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

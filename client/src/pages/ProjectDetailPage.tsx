import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle,
  ExternalLink,
  User,
  Building2,
  Calendar,
  FileText,
  Bell,
  Link as LinkIcon,
  Edit,
  Settings,
  Upload,
  Paperclip,
  Download,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Package,
  Hash,
  Truck,
  Award,
  Receipt,
  Layers,
  CheckSquare,
  Tag
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface ProjectStep {
  id: string;
  stepType: string;
  stepOrder: number;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'skipped' | 'not_applicable';
  startedAt: string | null;
  completedAt: string | null;
  completedBy: number | null;
  completedByDisplayName: string | null;
  linkedRfqId: number | null;
  linkedQuoteId: string | null;
  linkedPurchaseReviewId: number | null;
  linkedPreproductionChecklistId: string | null;
  linkedP2OrderId: number | null;
  notes: string | null;
}

interface ActivityLog {
  id: number;
  activityType: string;
  stepType: string | null;
  description: string;
  performedBy: number | null;
  performedByDisplayName: string | null;
  createdAt: string;
}

interface P2Customer {
  customerId: string;
  customerName: string;
}

interface Project {
  id: string;
  projectCode: string;
  projectName: string;
  customerId: string;
  description: string | null;
  status: 'active' | 'on_hold' | 'completed' | 'cancelled' | 'inactive' | 'won' | 'lost';
  currentStepType: string;
  targetShipDate: string | null;
  actualShipDate: string | null;
  currentStage: string | null;
  stageUpdatedAt: string | null;
  poId: number | null;
  projectManagerId: number | null;
  reminderDays: number;
  notes: string | null;
  createdAt: string;
  steps: ProjectStep[];
  customer?: { id: number; customerId: string; name: string };
  projectManager?: { id: number; name: string };
  activityLog: ActivityLog[];
}

interface Employee {
  id: number;
  name: string;
  userRole: string;
}

interface P2PurchaseOrder {
  id: number;
  poNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  createdAt?: string;
}

interface StepAttachment {
  id: number;
  projectId: string;
  stepId: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  uploadedBy: number | null;
  notes: string | null;
  createdAt: string;
}

interface TraceabilitySerial {
  id: string;
  serial_number: string;
  barcode: string;
  part_number: string;
  part_name: string;
  status: string;
  completed_at: string | null;
  finalized_at: string | null;
  current_department: string;
  sku: string | null;
  sequence_number: number;
}

interface TraceabilityData {
  hasShipment: boolean;
  lot: {
    id: string; lot_number: string; status: string;
    shipped_at: string | null; created_at: string; quantity: number; po_number: string;
  } | null;
  packingSlip: {
    id: string; packing_slip_number: string; status: string;
    ship_date: string | null; carrier: string | null; tracking_number: string | null;
    total_quantity: number; created_at: string;
  } | null;
  certificate: {
    id: string; certificate_number: string; status: string;
    approved_at: string | null; issued_at: string | null; created_at: string;
  } | null;
  invoice: {
    id: string; invoice_number: string; status: string;
    total_amount: string; invoice_date: string; created_at: string;
  } | null;
  serials: TraceabilitySerial[];
}

const STEP_CONFIG: Record<string, { label: string; route: string; icon: typeof FileText }> = {
  rfq_risk_assessment: { label: 'RFQ Risk Assessment', route: '/rfq-risk-assessment', icon: FileText },
  quote: { label: 'Quote', route: '/p2-quote-form', icon: FileText },
  purchase_review_checklist: { label: 'Purchase Review Checklist', route: '/purchase-review-checklist', icon: FileText },
  preproduction_checklist: { label: 'Pre-production Checklist', route: '/preproduction-checklists', icon: FileText },
  p2_order: { label: 'P2 Order', route: '/p2-control-center', icon: FileText },
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

const STEP_STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  blocked: AlertCircle,
  skipped: Circle,
  not_applicable: Circle,
};

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  blocked: 'text-red-500',
  skipped: 'text-gray-300',
  not_applicable: 'text-gray-300',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  // Read ?tab= from URL to support deep-links (e.g. from serial search)
  const initialTab = new URLSearchParams(window.location.search).get('tab') ?? 'workflow';
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedStep, setSelectedStep] = useState<ProjectStep | null>(null);
  const [linkId, setLinkId] = useState('');
  const [editData, setEditData] = useState<Partial<Project>>({});
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [uploadNotes, setUploadNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [isSkipDialogOpen, setIsSkipDialogOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; name: string } | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: currentUser } = useQuery<{ username: string; role: string }>({
    queryKey: ['/api/auth/me'],
  });

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ['/api/projects', id],
    enabled: !!id,
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: p2Customers = [] } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: p2PurchaseOrders = [] } = useQuery<P2PurchaseOrder[]>({
    queryKey: ['/api/p2-purchase-orders-bypass'],
    enabled: !project?.poId,
  });

  const [linkPoId, setLinkPoId] = useState<string>('');
  const [linkPoSearch, setLinkPoSearch] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);

  const suggestedPo = useMemo(() => {
    if (!project || p2PurchaseOrders.length === 0) return null;
    const sameCustomer = p2PurchaseOrders.filter(po => po.customerId === project.customerId);
    const pool = sameCustomer.length > 0 ? sameCustomer : p2PurchaseOrders;
    return pool.slice().sort((a, b) => {
      if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return b.id - a.id;
    })[0] ?? null;
  }, [project, p2PurchaseOrders]);

  const linkPoMutation = useMutation({
    mutationFn: (poId: number) =>
      apiRequest('POST', `/api/projects/${id}/link-po`, { poId }),
    onSuccess: () => {
      toast({ title: 'PO linked', description: 'Purchase order successfully linked to this project.' });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'traceability'] });
      setLinkPoId('');
      setLinkPoSearch('');
      setShowManualLink(false);
    },
    onError: (err: any) => {
      toast({ title: 'Link failed', description: err?.message || 'Failed to link PO.', variant: 'destructive' });
    },
  });

  const { data: allStepAttachments = [] } = useQuery<StepAttachment[]>({
    queryKey: ['/api/project-step-attachments/by-project', id],
    enabled: !!id,
  });

  const { data: traceability, isLoading: isLoadingTraceability } = useQuery<TraceabilityData>({
    queryKey: ['/api/projects', id, 'traceability'],
    queryFn: () => fetch(`/api/projects/${id}/traceability`).then(r => r.json()),
    enabled: !!id,
  });

  const getAttachmentsForStep = (stepId: string) => {
    return allStepAttachments.filter(a => a.stepId === stepId);
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  const updateProjectMutation = useMutation({
    mutationFn: async (data: Partial<Project>) => {
      return apiRequest(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setIsEditDialogOpen(false);
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ stepId, data }: { stepId: string; data: any }) => {
      return apiRequest(`/api/projects/${id}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setIsLinkDialogOpen(false);
      setSelectedStep(null);
      setLinkId('');
    },
  });

  const markStepCompleteMutation = useMutation({
    mutationFn: async (stepId: string) => {
      return apiRequest(`/api/projects/${id}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
    },
  });

  const startStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      return apiRequest(`/api/projects/${id}/steps/${stepId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
    },
  });

  const skipStepMutation = useMutation({
    mutationFn: async ({ stepId, reason }: { stepId: string; reason: string }) => {
      return apiRequest(`/api/projects/${id}/steps/${stepId}/skip`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      setIsSkipDialogOpen(false);
      setSkipReason('');
      setSelectedStep(null);
      toast({ title: 'Step skipped' });
    },
  });

  const reopenStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      return apiRequest(`/api/projects/${id}/steps/${stepId}/reopen`, {
        method: 'PATCH',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      toast({ title: 'Step reopened' });
    },
  });

  const { data: stepAttachments = [] } = useQuery<StepAttachment[]>({
    queryKey: ['/api/project-step-attachments', selectedStep?.id],
    enabled: !!selectedStep?.id && isUploadDialogOpen,
  });

  interface UnlinkedSubmission {
    id: string | number;
    label: string;
    customerId?: string;
    createdAt?: string;
  }

  const { data: availableSubmissions = [], isLoading: isLoadingSubmissions } = useQuery<UnlinkedSubmission[]>({
    queryKey: ['/api/projects/unlinked-submissions', selectedStep?.stepType, project?.customerId],
    queryFn: async () => {
      const url = `/api/projects/unlinked-submissions/${selectedStep?.stepType}${project?.customerId ? `?customerId=${project.customerId}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch submissions');
      return response.json();
    },
    enabled: !!selectedStep?.stepType && isLinkDialogOpen,
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      const response = await fetch(`/api/project-step-attachments/${attachmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete attachment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-step-attachments', selectedStep?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-step-attachments/by-project', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      toast({ title: 'Document deleted', description: 'The attachment has been removed.' });
    },
  });

  const handleFileUpload = async (file: File) => {
    if (!selectedStep || !project) return;
    
    setIsUploading(true);
    try {
      const urlResponse = await fetch('/api/project-step-attachments/request-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
          projectId: project.id,
          stepId: selectedStep.id,
        }),
      });

      if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadURL, objectPath } = await urlResponse.json();

      const uploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      const completeResponse = await fetch('/api/project-step-attachments/complete-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          objectPath,
          projectId: project.id,
          stepId: selectedStep.id,
          originalFileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          notes: uploadNotes || null,
        }),
      });

      if (!completeResponse.ok) {
        throw new Error('Failed to complete upload');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/project-step-attachments', selectedStep.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-step-attachments/by-project', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setUploadNotes('');
      toast({ title: 'Document uploaded', description: `${file.name} has been attached to this step.` });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: 'Upload failed', description: 'There was an error uploading the document.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
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

  const getProgress = () => {
    if (!project.steps.length) return 0;
    const completed = project.steps.filter(s => s.status === 'completed').length;
    return Math.round((completed / project.steps.length) * 100);
  };

  const getLinkedId = (step: ProjectStep) => {
    switch (step.stepType) {
      case 'rfq_risk_assessment': return step.linkedRfqId;
      case 'quote': return step.linkedQuoteId;
      case 'purchase_review_checklist': return step.linkedPurchaseReviewId;
      case 'preproduction_checklist': return step.linkedPreproductionChecklistId;
      case 'p2_order': return step.linkedP2OrderId;
      default: return null;
    }
  };

  const getLinkFieldName = (stepType: string) => {
    switch (stepType) {
      case 'rfq_risk_assessment': return 'linkedRfqId';
      case 'quote': return 'linkedQuoteId';
      case 'purchase_review_checklist': return 'linkedPurchaseReviewId';
      case 'preproduction_checklist': return 'linkedPreproductionChecklistId';
      case 'p2_order': return 'linkedP2OrderId';
      default: return '';
    }
  };

  const handleLinkStep = () => {
    if (!selectedStep || !linkId) return;
    const fieldName = getLinkFieldName(selectedStep.stepType);
    const parsedId = selectedStep.stepType === 'quote' || selectedStep.stepType === 'preproduction_checklist'
      ? linkId
      : parseInt(linkId);
    updateStepMutation.mutate({
      stepId: selectedStep.id,
      data: { [fieldName]: parsedId },
    });
  };

  const allEmployees = employees;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/projects')} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" data-testid="project-code">{project.projectCode}</h1>
            <Badge className={STATUS_COLORS[project.status]}>
              {project.status.replace('_', ' ')}
            </Badge>
            {project.currentStage && (
              <Badge variant="outline" className="text-xs">
                {STAGE_LABELS[project.currentStage] || project.currentStage}
              </Badge>
            )}
          </div>
          <p className="text-lg text-muted-foreground">{project.projectName}</p>
        </div>
        <Button variant="outline" onClick={() => {
          setEditData({
            projectName: project.projectName,
            customerId: project.customerId,
            description: project.description || '',
            targetShipDate: project.targetShipDate || '',
            projectManagerId: project.projectManagerId,
            reminderDays: project.reminderDays,
            status: project.status,
          });
          setIsEditDialogOpen(true);
        }} data-testid="button-edit-project">
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <p className="font-medium">{project.customer?.name || 'Unknown'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Project Manager</p>
                <p className="font-medium">{project.projectManager?.name || 'Not assigned'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Target Ship Date</p>
                <p className="font-medium">
                  {project.targetShipDate 
                    ? format(new Date(project.targetShipDate), 'MMM d, yyyy')
                    : 'Not set'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span className="font-medium">{getProgress()}%</span>
        </div>
        <Progress value={getProgress()} className="h-3" />
      </div>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflow" data-testid="tab-workflow">Workflow</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity Log</TabsTrigger>
          <TabsTrigger value="traceability" data-testid="tab-traceability">Traceability</TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Workflow</CardTitle>
              <CardDescription>Track progress through each step of the P2 workflow</CardDescription>
            </CardHeader>
            <CardContent>
              {project.steps.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="font-medium text-muted-foreground">Workflow steps are being initialized…</p>
                  <p className="text-sm text-muted-foreground">
                    This usually resolves on the next page load. If it persists, please contact your administrator.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    Refresh
                  </Button>
                </div>
              ) : (
              <div className="relative">
                {project.steps.map((step, index) => {
                  const config = STEP_CONFIG[step.stepType];
                  const StatusIcon = STEP_STATUS_ICONS[step.status];
                  const linkedId = getLinkedId(step);
                  const isLast = index === project.steps.length - 1;
                  const stepAttachments = getAttachmentsForStep(step.id);
                  const isExpanded = expandedSteps.has(step.id);
                  const hasContent = stepAttachments.length > 0 || linkedId;

                  return (
                    <div key={step.id} className="relative flex gap-4 pb-8" data-testid={`step-${step.stepType}`}>
                      {!isLast && (
                        <div className="absolute left-[15px] top-[30px] bottom-0 w-[2px] bg-gray-200" />
                      )}
                      <div className={`relative z-10 flex-shrink-0 mt-1 ${STEP_STATUS_COLORS[step.status]}`}>
                        <StatusIcon className="h-8 w-8" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div>
                              <h3 className="font-semibold">{config?.label || step.stepType}</h3>
                              <p className="text-sm text-muted-foreground">
                                {step.status === 'completed' && step.completedAt
                                  ? `Completed${step.completedByDisplayName ? ` by ${step.completedByDisplayName}` : ''} ${formatDistanceToNow(new Date(step.completedAt), { addSuffix: true })}`
                                  : step.status === 'in_progress' && step.startedAt
                                  ? `Started ${formatDistanceToNow(new Date(step.startedAt), { addSuffix: true })}`
                                  : 'Pending'}
                              </p>
                            </div>
                            {stepAttachments.length > 0 && (
                              <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                                <Paperclip className="h-3 w-3" />
                                {stepAttachments.length} doc{stepAttachments.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            {step.status === 'in_progress' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(config?.route, '_blank')}
                                  data-testid={`button-open-${step.stepType}`}
                                >
                                  <ExternalLink className="mr-1 h-4 w-4" />
                                  Start
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedStep(step);
                                    setIsUploadDialogOpen(true);
                                  }}
                                  data-testid={`button-upload-${step.stepType}`}
                                >
                                  <Upload className="mr-1 h-4 w-4" />
                                  Attach PDF
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedStep(step);
                                    setLinkId(linkedId?.toString() || '');
                                    setIsLinkDialogOpen(true);
                                  }}
                                  data-testid={`button-link-${step.stepType}`}
                                >
                                  <LinkIcon className="mr-1 h-4 w-4" />
                                  {linkedId ? 'Update Link' : 'Link Record'}
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => markStepCompleteMutation.mutate(step.id)}
                                  disabled={markStepCompleteMutation.isPending}
                                  data-testid={`button-complete-${step.stepType}`}
                                >
                                  <CheckCircle2 className="mr-1 h-4 w-4" />
                                  Mark Complete
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500"
                                  onClick={() => {
                                    setSelectedStep(step);
                                    setSkipReason('');
                                    setIsSkipDialogOpen(true);
                                  }}
                                >
                                  Skip
                                </Button>
                              </>
                            )}
                            {step.status === 'completed' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(config?.route, '_blank')}
                                  data-testid={`button-view-${step.stepType}`}
                                >
                                  <Eye className="mr-1 h-4 w-4" />
                                  View Form
                                </Button>
                                {hasContent && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => toggleStepExpanded(step.id)}
                                    data-testid={`button-toggle-${step.stepType}`}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="mr-1 h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="mr-1 h-4 w-4" />
                                    )}
                                    {stepAttachments.length > 0 ? `${stepAttachments.length} Docs` : 'Details'}
                                  </Button>
                                )}
                                {isAdmin && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedStep(step);
                                        setIsUploadDialogOpen(true);
                                      }}
                                      data-testid={`button-upload-completed-${step.stepType}`}
                                    >
                                      <Upload className="mr-1 h-4 w-4" />
                                      Attach
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedStep(step);
                                        setLinkId(linkedId?.toString() || '');
                                        setIsLinkDialogOpen(true);
                                      }}
                                      data-testid={`button-link-completed-${step.stepType}`}
                                    >
                                      <LinkIcon className="mr-1 h-4 w-4" />
                                      {linkedId ? 'Edit Link' : 'Link'}
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-600"
                                  onClick={() => reopenStepMutation.mutate(step.id)}
                                  disabled={reopenStepMutation.isPending}
                                  data-testid={`button-reopen-${step.stepType}`}
                                >
                                  Reopen
                                </Button>
                              </>
                            )}
                            {step.status === 'skipped' && (
                              <>
                                <Badge variant="secondary" className="text-gray-500 text-xs">Skipped</Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-600"
                                  onClick={() => reopenStepMutation.mutate(step.id)}
                                  disabled={reopenStepMutation.isPending}
                                  data-testid={`button-reopen-skipped-${step.stepType}`}
                                >
                                  Reopen
                                </Button>
                              </>
                            )}
                            {(step.status === 'pending' || step.status === 'blocked') && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => startStepMutation.mutate(step.id)}
                                  disabled={startStepMutation.isPending}
                                >
                                  <Clock className="mr-1 h-4 w-4" />
                                  Start
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedStep(step);
                                    setIsUploadDialogOpen(true);
                                  }}
                                  data-testid={`button-upload-${step.status}-${step.stepType}`}
                                >
                                  <Upload className="mr-1 h-4 w-4" />
                                  Attach PDF
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500"
                                  onClick={() => {
                                    setSelectedStep(step);
                                    setSkipReason('');
                                    setIsSkipDialogOpen(true);
                                  }}
                                >
                                  Skip
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        {step.notes && (
                          <p className="text-sm bg-muted p-2 rounded">{step.notes}</p>
                        )}
                        {stepAttachments.length > 0 && (step.status !== 'completed' || isExpanded) && (
                          <div className="mt-3 space-y-3 pl-2 border-l-2 border-blue-200">
                            {step.status === 'completed' && isExpanded && linkedId && (
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <LinkIcon className="h-3 w-3" />
                                  Linked Record: {linkedId}
                                </Badge>
                              </div>
                            )}
                            <div className="space-y-2">
                              <p className="text-sm font-medium text-muted-foreground">Attached Documents:</p>
                              <div className="space-y-1">
                                {stepAttachments.map((attachment) => (
                                  <div 
                                    key={attachment.id} 
                                    className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                                  >
                                    <div className="flex items-center gap-2">
                                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                                      <span>{attachment.originalFileName}</span>
                                      <span className="text-xs text-muted-foreground">
                                        ({(attachment.fileSize / 1024).toFixed(1)} KB)
                                      </span>
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPreviewAttachment({
                                          url: `/api/project-step-attachments/download/${attachment.id}`,
                                          name: attachment.originalFileName,
                                        })}
                                        title="View document"
                                        data-testid={`button-view-attachment-${attachment.id}`}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(`/api/project-step-attachments/download/${attachment.id}?download=true`, '_blank')}
                                        title="Download document"
                                        data-testid={`button-download-attachment-${attachment.id}`}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-600 hover:text-red-700"
                                        onClick={() => {
                                          setSelectedStep(step);
                                          deleteAttachmentMutation.mutate(attachment.id);
                                        }}
                                        title="Delete document"
                                        data-testid={`button-delete-attachment-${attachment.id}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                        {step.status === 'completed' && isExpanded && stepAttachments.length === 0 && linkedId && (
                          <div className="mt-3 space-y-3 pl-2 border-l-2 border-green-200">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="flex items-center gap-1">
                                <LinkIcon className="h-3 w-3" />
                                Linked Record: {linkedId}
                              </Badge>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>Recent activity on this project</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                {project.activityLog?.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No activity yet</p>
                ) : (
                  <div className="space-y-4">
                    {project.activityLog?.map((activity) => (
                      <div key={activity.id} className="flex gap-3 pb-4 border-b last:border-0">
                        <div className="flex-shrink-0 mt-1">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm">{activity.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {activity.performedByDisplayName && `by ${activity.performedByDisplayName} · `}
                            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TRACEABILITY TAB ── */}
        <TabsContent value="traceability" className="space-y-4">
          {isLoadingTraceability ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Loading traceability data…
              </CardContent>
            </Card>
          ) : !traceability ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Unable to load traceability data.
              </CardContent>
            </Card>
          ) : !project?.poId ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="h-4 w-4" /> Link Purchase Order
                </CardTitle>
                <p className="text-sm text-muted-foreground">Connect a PO to enable shipment traceability for this project.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {suggestedPo && !showManualLink ? (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 p-4 space-y-1">
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Suggested PO</p>
                      <p className="font-semibold text-blue-900 dark:text-blue-100 font-mono">{suggestedPo.poNumber}</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">{suggestedPo.customerName}</p>
                      {suggestedPo.customerId === project?.customerId && (
                        <p className="text-xs text-blue-500 dark:text-blue-400">Matched on customer</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => linkPoMutation.mutate(suggestedPo.id)}
                        disabled={linkPoMutation.isPending}
                      >
                        {linkPoMutation.isPending ? 'Linking…' : 'Accept'}
                      </Button>
                      <Button variant="outline" onClick={() => setShowManualLink(true)}>
                        Choose Different
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {showManualLink && suggestedPo && (
                      <Button variant="ghost" size="sm" className="text-muted-foreground -mb-2" onClick={() => setShowManualLink(false)}>
                        ← Back to suggestion
                      </Button>
                    )}
                    <div className="space-y-2">
                      <Label>Search POs</Label>
                      <Input
                        placeholder="Filter by PO number or customer…"
                        value={linkPoSearch}
                        onChange={(e) => setLinkPoSearch(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Purchase Order</Label>
                      <Select value={linkPoId} onValueChange={setLinkPoId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a purchase order" />
                        </SelectTrigger>
                        <SelectContent>
                          {p2PurchaseOrders
                            .filter(po => {
                              const q = linkPoSearch.toLowerCase();
                              return !q || po.poNumber?.toLowerCase().includes(q) || po.customerName?.toLowerCase().includes(q);
                            })
                            .map(po => (
                              <SelectItem key={po.id} value={po.id.toString()}>
                                {po.poNumber} — {po.customerName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      disabled={!linkPoId || linkPoMutation.isPending}
                      onClick={() => linkPoMutation.mutate(parseInt(linkPoId))}
                    >
                      {linkPoMutation.isPending ? 'Linking…' : 'Link PO'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── SECTION 1: Shipment Summary ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Truck className="h-4 w-4" /> Shipment Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!traceability.hasShipment || !traceability.lot ? (
                    <div className="text-center py-6 space-y-2">
                      <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
                      <p className="text-muted-foreground font-medium">Not yet shipped</p>
                      <p className="text-sm text-muted-foreground">No lot has been created for this PO.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Lot #</p>
                          <p className="font-mono font-medium text-sm">{traceability.lot.lot_number}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Packing Slip</p>
                          <p className="font-mono font-medium text-sm">
                            {traceability.packingSlip?.packing_slip_number ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                          <Badge variant={traceability.lot.status === 'SHIPPED' ? 'default' : 'secondary'}>
                            {traceability.lot.status}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Ship Date</p>
                          <p className="text-sm">
                            {traceability.packingSlip?.ship_date
                              ? format(new Date(traceability.packingSlip.ship_date), 'MMM d, yyyy')
                              : traceability.lot.shipped_at
                                ? format(new Date(traceability.lot.shipped_at), 'MMM d, yyyy')
                                : '—'}
                          </p>
                        </div>
                      </div>

                      {(traceability.packingSlip?.carrier || traceability.packingSlip?.tracking_number) && (
                        <div className="grid grid-cols-2 gap-4">
                          {traceability.packingSlip.carrier && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Carrier</p>
                              <p className="text-sm">{traceability.packingSlip.carrier}</p>
                            </div>
                          )}
                          {traceability.packingSlip.tracking_number && (
                            <div>
                              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tracking #</p>
                              <p className="font-mono text-sm">{traceability.packingSlip.tracking_number}</p>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        {traceability.packingSlip && (
                          <>
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={`/api/p2/packing-slips/${traceability.packingSlip.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download Packing Slip PDF
                              </a>
                            </Button>
                          </>
                        )}
                        {traceability.certificate && (
                          <Badge variant="outline" className="px-3 py-1.5 text-xs">
                            <Award className="h-3 w-3 mr-1.5" />
                            CoC {traceability.certificate.certificate_number} · {traceability.certificate.status}
                          </Badge>
                        )}
                        {traceability.invoice && (
                          <Badge variant="outline" className="px-3 py-1.5 text-xs">
                            <Receipt className="h-3 w-3 mr-1.5" />
                            Invoice {traceability.invoice.invoice_number} · ${Number(traceability.invoice.total_amount).toLocaleString()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── SECTION 2: Serialized Items ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Hash className="h-4 w-4" /> Serialized Items
                  </CardTitle>
                  <CardDescription>
                    {traceability.serials.length} serial{traceability.serials.length !== 1 ? 's' : ''} across this PO
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {traceability.serials.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No serialized items found.</p>
                  ) : (
                    <div className="space-y-5">
                      {Object.entries(
                        traceability.serials.reduce<Record<string, TraceabilitySerial[]>>((acc, s) => {
                          const key = `${s.part_number}||${s.part_name}`;
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(s);
                          return acc;
                        }, {})
                      ).map(([key, items]) => {
                        const [partNumber, partName] = key.split('||');
                        return (
                          <div key={key} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-sm">{partName}</p>
                                <p className="text-xs text-muted-foreground font-mono">{partNumber}</p>
                              </div>
                              <Badge variant="secondary">{items.length} unit{items.length !== 1 ? 's' : ''}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map(s => (
                                <span
                                  key={s.id}
                                  title={`${s.status} · ${s.current_department}`}
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border
                                    ${s.finalized_at
                                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950/30 dark:border-green-800 dark:text-green-300'
                                      : s.completed_at
                                        ? 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
                                        : 'bg-muted border-border text-muted-foreground'
                                    }`}
                                >
                                  {s.serial_number}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300 mr-1 align-middle" />finalized &nbsp;
                              <span className="inline-block w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 mr-1 align-middle" />completed &nbsp;
                              <span className="inline-block w-3 h-3 rounded-sm bg-muted border mr-1 align-middle" />in progress
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── SECTION 3: Production Status ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Layers className="h-4 w-4" /> Production Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const total = traceability.serials.length;
                    const completed = traceability.serials.filter(s => s.completed_at).length;
                    const finalized = traceability.serials.filter(s => s.finalized_at).length;
                    const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
                    const finalizedPct = total > 0 ? Math.round((finalized / total) * 100) : 0;
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div className="rounded-lg border p-3">
                            <p className="text-2xl font-bold">{total}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Total Serials</p>
                          </div>
                          <div className="rounded-lg border p-3 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{completed}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
                          </div>
                          <div className="rounded-lg border p-3 border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
                            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{finalized}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Finalized</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Completed</span><span>{completedPct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${completedPct}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Finalized</span><span>{finalizedPct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${finalizedPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* ── SECTION 4: Documents ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-4 w-4" /> Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {traceability.packingSlip ? (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Packing Slip</p>
                            <p className="text-xs text-muted-foreground font-mono">{traceability.packingSlip.packing_slip_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={traceability.packingSlip.status === 'SHIPPED' ? 'default' : 'secondary'} className="text-xs">
                            {traceability.packingSlip.status}
                          </Badge>
                          <Button size="sm" variant="ghost" asChild>
                            <a href={`/api/p2/packing-slips/${traceability.packingSlip.id}/pdf`} target="_blank" rel="noreferrer">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-2 px-3 rounded-lg border text-muted-foreground">
                        <Tag className="h-4 w-4" />
                        <p className="text-sm">Packing Slip — not yet generated</p>
                      </div>
                    )}

                    {traceability.certificate ? (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Award className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Certificate of Conformance</p>
                            <p className="text-xs text-muted-foreground font-mono">{traceability.certificate.certificate_number}</p>
                          </div>
                        </div>
                        <Badge variant={traceability.certificate.status === 'ISSUED' ? 'default' : 'secondary'} className="text-xs">
                          {traceability.certificate.status}
                        </Badge>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-2 px-3 rounded-lg border text-muted-foreground">
                        <Award className="h-4 w-4" />
                        <p className="text-sm">Certificate of Conformance — not yet generated</p>
                      </div>
                    )}

                    {traceability.invoice ? (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">Invoice</p>
                            <p className="text-xs text-muted-foreground font-mono">{traceability.invoice.invoice_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={traceability.invoice.status === 'PAID' ? 'default' : 'secondary'} className="text-xs">
                            {traceability.invoice.status}
                          </Badge>
                          <span className="text-sm font-medium">${Number(traceability.invoice.total_amount).toLocaleString()}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-2 px-3 rounded-lg border text-muted-foreground">
                        <Receipt className="h-4 w-4" />
                        <p className="text-sm">Invoice — not yet raised</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
            <DialogDescription>Update project details and configuration</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[65vh] space-y-4 py-4 pr-1">
            <div className="space-y-2">
              <Label>Project #</Label>
              <Input
                value={editData.projectCode || project?.projectCode || ''}
                readOnly
                className="bg-muted text-muted-foreground cursor-default"
              />
            </div>
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={editData.projectName || ''}
                onChange={(e) => setEditData({ ...editData, projectName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select
                value={editData.customerId || ''}
                onValueChange={(value) => setEditData({ ...editData, customerId: value })}
              >
                <SelectTrigger>
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
              <Label>Status</Label>
              <Select 
                value={editData.status} 
                onValueChange={(value) => setEditData({ ...editData, status: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
            <div className="space-y-2">
              <Label>Project Manager</Label>
              <Select 
                value={editData.projectManagerId?.toString() || ''} 
                onValueChange={(value) => setEditData({ ...editData, projectManagerId: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
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
              <Label>Target Ship Date</Label>
              <Input
                type="date"
                value={editData.targetShipDate || ''}
                onChange={(e) => setEditData({ ...editData, targetShipDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Reminder Days</Label>
              <Input
                type="number"
                min={1}
                value={editData.reminderDays || 3}
                onChange={(e) => setEditData({ ...editData, reminderDays: parseInt(e.target.value) || 3 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editData.description || ''}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => updateProjectMutation.mutate(editData)}
              disabled={updateProjectMutation.isPending}
            >
              {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkDialogOpen} onOpenChange={(open) => {
        setIsLinkDialogOpen(open);
        if (!open) {
          setShowManualEntry(false);
          setLinkId('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Record</DialogTitle>
            <DialogDescription>
              Link an existing {STEP_CONFIG[selectedStep?.stepType || '']?.label || 'record'} to this step
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Record</Label>
              {isLoadingSubmissions ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Clock className="h-4 w-4 animate-spin" />
                  Loading available records...
                </div>
              ) : availableSubmissions.length > 0 && !showManualEntry ? (
                <>
                  <Select value={linkId} onValueChange={setLinkId}>
                    <SelectTrigger data-testid="select-link-record">
                      <SelectValue placeholder="Choose a record to link..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubmissions.map((submission) => (
                        <SelectItem 
                          key={String(submission.id)} 
                          value={String(submission.id)}
                          data-testid={`select-item-${submission.id}`}
                        >
                          {submission.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Showing {availableSubmissions.length} available record{availableSubmissions.length !== 1 ? 's' : ''} for this customer that haven't been linked to a project yet.
                  </p>
                  <Button 
                    variant="link" 
                    className="h-auto p-0 text-xs"
                    onClick={() => setShowManualEntry(true)}
                  >
                    Can't find your record? Enter ID manually
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                    placeholder="Enter the record ID to link"
                    data-testid="input-link-record-id"
                  />
                  {availableSubmissions.length === 0 && !isLoadingSubmissions && (
                    <p className="text-xs text-muted-foreground">
                      No unlinked records found for this customer. Enter a record ID manually or create a new submission first.
                    </p>
                  )}
                  {showManualEntry && availableSubmissions.length > 0 && (
                    <Button 
                      variant="link" 
                      className="h-auto p-0 text-xs"
                      onClick={() => {
                        setShowManualEntry(false);
                        setLinkId('');
                      }}
                    >
                      Back to dropdown selection
                    </Button>
                  )}
                  <div className="bg-muted p-3 rounded-md text-xs text-muted-foreground space-y-2 mt-2">
                    <p className="font-medium text-foreground">How to find the Record ID:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>RFQ Risk Assessment:</strong> Go to the RFQ Risk Assessment page, find your submission in the list, and look for the ID number in the table.</li>
                      <li><strong>Quote:</strong> Open the quote form and copy the quote ID from the URL or header.</li>
                      <li><strong>Purchase Review:</strong> Find your submission in the Purchase Review Submissions page and note the ID.</li>
                      <li><strong>Pre-production Checklist:</strong> Locate your checklist and copy its ID from the list.</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleLinkStep}
              disabled={!linkId || updateStepMutation.isPending}
              data-testid="button-link-record"
            >
              {updateStepMutation.isPending ? 'Linking...' : 'Link Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isUploadDialogOpen} onOpenChange={(open) => {
        setIsUploadDialogOpen(open);
        if (!open) {
          setUploadNotes('');
          setSelectedStep(null);
        }
      }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Attach Document</DialogTitle>
            <DialogDescription>
              Upload a PDF or document for {STEP_CONFIG[selectedStep?.stepType || '']?.label || 'this step'}. 
              Use this when work was completed outside the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Upload File</Label>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                  disabled={isUploading}
                  data-testid="input-file-upload"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Accepted formats: PDF, Word, Excel, PNG, JPG
              </p>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="Add any notes about this document..."
                data-testid="input-upload-notes"
              />
            </div>

            {isUploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                Uploading document...
              </div>
            )}

            {stepAttachments.length > 0 && (
              <div className="space-y-2">
                <Label>Attached Documents</Label>
                <div className="border rounded-md divide-y">
                  {stepAttachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between p-3" data-testid={`attachment-${attachment.id}`}>
                      <div className="flex items-center gap-3">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{attachment.originalFileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(attachment.fileSize)} - {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewAttachment({
                            url: `/api/project-step-attachments/download/${attachment.id}`,
                            name: attachment.originalFileName,
                          })}
                          title="View document"
                          data-testid={`button-view-${attachment.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/api/project-step-attachments/download/${attachment.id}?download=true`, '_blank')}
                          title="Download document"
                          data-testid={`button-download-${attachment.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAttachmentMutation.mutate(attachment.id)}
                          disabled={deleteAttachmentMutation.isPending}
                          data-testid={`button-delete-${attachment.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSkipDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsSkipDialogOpen(false);
          setSkipReason('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Provide a reason for skipping this step. The step can be reopened later if needed.
            </p>
            <Textarea
              placeholder="Reason for skipping..."
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSkipDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedStep && skipReason.trim()) {
                  skipStepMutation.mutate({ stepId: selectedStep.id, reason: skipReason.trim() });
                }
              }}
              disabled={!skipReason.trim() || skipStepMutation.isPending}
            >
              {skipStepMutation.isPending ? 'Skipping...' : 'Skip Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewAttachment} onOpenChange={(open) => { if (!open) setPreviewAttachment(null); }}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {previewAttachment?.name}
            </DialogTitle>
            <DialogDescription>
              Document preview
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {previewAttachment && (
              <iframe
                src={previewAttachment.url}
                className="w-full h-full rounded border"
                title={previewAttachment.name}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => previewAttachment && window.open(`${previewAttachment.url}?download=true`, '_blank')}
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            <Button variant="outline" onClick={() => setPreviewAttachment(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

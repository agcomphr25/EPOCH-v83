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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
  Search,
  HardDrive,
  ChevronDown,
  ChevronUp,
  Package,
  Hash,
  Truck,
  Award,
  Receipt,
  Layers,
  CheckSquare,
  Tag,
  X,
  BookOpen,
  ShieldAlert,
  ListChecks,
  Plus,
  Save,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  ClipboardList,
  Lock,
  BarChart2,
  XCircle,
  Rocket,
  ShieldCheck,
  History
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
  currentRevisionNumber: number;
  currentRevisionLabel: string;
  poId: number | null;
  projectManagerId: number | null;
  reminderDays: number;
  notes: string | null;
  createdAt: string;
  steps: ProjectStep[];
  customer?: { id: number; customerId: string; name: string };
  projectManager?: { id: number; name: string };
  activityLog: ActivityLog[];
  closingStatus: 'MISSING' | 'INCOMPLETE' | 'COMPLETE' | 'APPROVED';
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

interface ProjectRevision {
  id: number;
  project_id: string;
  revision_number: number;
  revision_label: string;
  revision_type: string;
  summary: string;
  reason: string;
  previous_po_id: number | null;
  previous_po_number: string | null;
  new_po_id: number | null;
  new_po_number: string | null;
  created_by_display_name: string | null;
  created_at: string;
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
  po: {
    id: number; po_number: string; customer_name: string; customer_id: string; status: string; created_at: string;
  } | null;
  lot: {
    id: string; lot_number: string; status: string;
    shipped_at: string | null; created_at: string; quantity: number; po_number: string;
  } | null;
  packingSlip: {
    id: string; packing_slip_number: string; status: string;
    ship_date: string | null; carrier: string | null; tracking_number: string | null;
    total_quantity: number; created_at: string;
  } | null;
  packingSlips: {
    id: string; packing_slip_number: string; status: string;
    ship_date: string | null; carrier: string | null; tracking_number: string | null;
    total_quantity: number; created_at: string; external_pdf_url: string | null;
  }[];
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
  createdAt: string;
  updatedAt: string;
}

interface ProjectClosingRisk {
  id: number;
  closingId: number;
  projectId: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  department: string | null;
  owner: string | null;
  createdAt: string;
}

interface ProjectClosingAction {
  id: number;
  closingId: number;
  projectId: string;
  actionText: string;
  owner: string | null;
  department: string | null;
  dueDate: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
}

interface QuoteExecutionFeedback {
  id: string;
  quoteId: string | null;
  projectId: string;
  projectClosingId: number | null;
  generatedAt: string;
  quotedLaborHours: number | null;
  actualLaborHours: number | null;
  laborHoursVariance: number | null;
  laborHoursVariancePct: number | null;
  quotedDepartments: string[] | null;
  actualDepartments: string[] | null;
  quotedLeadTimeDays: number | null;
  actualLeadTimeDays: number | null;
  scheduleVarianceDays: number | null;
  isOverrun: boolean | null;
  summary: string | null;
  keyRisks: string[] | null;
  keyStrengths: string | null;
  keyOpportunities: string | null;
  recommendedQuotingNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectWorkOrder {
  id: string;
  workOrderNumber: string;
  status: string;
  partNumber: string;
  description: string | null;
}

interface ProjectFarFlowdown {
  id: number;
  clauseNumber: string;
  title: string;
  description: string | null;
  applicable: boolean;
  reasoning: string;
  status: string;
  purchaseReviewChecklistId: number | null;
  updatedAt: string;
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
  p2_release: 'P2 Release',
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
  const [closingForm, setClosingForm] = useState({
    summary: '',
    whatWentWrong: '',
    strengths: '',
    opportunities: '',
    similaritiesToPriorProjects: '',
    nextProjectRecommendations: '',
    closedByDisplayName: '',
  });
  const [isEditingClosing, setIsEditingClosing] = useState(false);
  const [showRiskDialog, setShowRiskDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [riskForm, setRiskForm] = useState({ category: '', severity: 'medium' as 'low' | 'medium' | 'high' | 'critical', description: '', department: '', owner: '' });
  const [actionForm, setActionForm] = useState({ actionText: '', owner: '', department: '', dueDate: '', status: 'open' as 'open' | 'in_progress' | 'completed' | 'cancelled' });
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
    enabled: !!project,
  });
  const p2PurchaseOrderOptions = Array.isArray(p2PurchaseOrders) ? p2PurchaseOrders : [];

  const [linkPoId, setLinkPoId] = useState<string>('');
  const [linkPoSearch, setLinkPoSearch] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);
  const [linkPoReason, setLinkPoReason] = useState('');
  const [revisionForm, setRevisionForm] = useState({ summary: '', reason: '' });

  const suggestedPo = useMemo(() => {
    if (!project || p2PurchaseOrderOptions.length === 0) return null;
    const sameCustomer = p2PurchaseOrderOptions.filter(po => po.customerId === project.customerId);
    const pool = sameCustomer.length > 0 ? sameCustomer : p2PurchaseOrderOptions;
    return pool.slice().sort((a, b) => {
      if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return b.id - a.id;
    })[0] ?? null;
  }, [project, p2PurchaseOrderOptions]);

  const linkPoMutation = useMutation({
    mutationFn: ({ poId, reason }: { poId: number; reason?: string }) =>
      apiRequest(`/api/projects/${id}/link-po`, {
        method: 'POST',
        body: {
          poId,
          reason,
          createdByDisplayName: currentUser?.username,
        },
      }),
    onSuccess: () => {
      toast({ title: 'PO linked', description: 'Purchase order link was saved as a project revision.' });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'traceability'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'revisions'] });
      setLinkPoId('');
      setLinkPoSearch('');
      setLinkPoReason('');
      setShowManualLink(false);
    },
    onError: (err: any) => {
      toast({ title: 'Link failed', description: err?.message || 'Failed to link PO.', variant: 'destructive' });
    },
  });

  const { data: projectRevisions = [] } = useQuery<ProjectRevision[]>({
    queryKey: ['/api/projects', id, 'revisions'],
    queryFn: () => fetch(`/api/projects/${id}/revisions`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });

  const createRevisionMutation = useMutation({
    mutationFn: (data: typeof revisionForm) =>
      apiRequest(`/api/projects/${id}/revisions`, {
        method: 'POST',
        body: {
          ...data,
          createdByDisplayName: currentUser?.username,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'revisions'] });
      setRevisionForm({ summary: '', reason: '' });
      toast({ title: 'Revision created', description: 'Project revision history was updated.' });
    },
    onError: (err: any) => toast({ title: 'Revision failed', description: err?.message || 'Could not create revision.', variant: 'destructive' }),
  });

  const { data: projectWorkOrders = [] } = useQuery<ProjectWorkOrder[]>({
    queryKey: ['/api/work-orders/project', id],
    queryFn: () => fetch(`/api/work-orders/project/${id}`).then(r => r.json()),
    enabled: !!id,
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

  interface GateStatus {
    gates?: { key: string; label: string; passed: boolean; status?: string; message?: string }[];
    allPassed: boolean;
    currentStage: string;
    alreadyReleased: boolean;
    poId: number | null;
  }

  const { data: gateStatus, refetch: refetchGateStatus } = useQuery<GateStatus>({
    queryKey: ['/api/projects', id, 'p2-gate-status'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${id}/p2-gate-status`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch P2 gate status');
      return response.json();
    },
    enabled: !!id && !!project && ['po_received', 'p2_release', 'purchase_review'].includes(project.currentStage || ''),
  });
  const projectSteps = Array.isArray(project?.steps) ? project.steps : [];
  const allProjectStepAttachments = Array.isArray(allStepAttachments) ? allStepAttachments : [];
  const gateStatusGates = Array.isArray(gateStatus?.gates) ? gateStatus.gates : [];
  const traceabilitySerials = Array.isArray(traceability?.serials) ? traceability.serials : [];

  const { data: projectFarFlowdowns = [] } = useQuery<ProjectFarFlowdown[]>({
    queryKey: ['/api/far-flowdown-clauses/project', id],
    queryFn: () => fetch(`/api/far-flowdown-clauses/project/${id}`).then(r => r.json()),
    enabled: !!id,
  });

  const releaseToP2Mutation = useMutation({
    mutationFn: () => apiRequest(`/api/projects/${id}/release-to-p2`, { method: 'POST' }),
    onSuccess: (data: any) => {
      const isFullRelease = data?.stage === 'production';
      toast({
        title: isFullRelease ? 'Released to Production' : 'Staged for P2 Release',
        description: isFullRelease
          ? 'Project has been released to production. The PO is now active in the P2 Control Center.'
          : 'All gates passed. Project is staged for P2 release. Click "Release to Production" to finalize.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'p2-gate-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
      refetchGateStatus();
    },
    onError: (err: any) => {
      const failedGates = err?.responseData?.failedGates || [];
      toast({
        title: 'Release Gate Not Cleared',
        description: failedGates.length > 0
          ? `Conditions not yet met: ${failedGates.join(', ')}`
          : err?.message || 'Failed to release to P2.',
        variant: 'destructive',
      });
    },
  });

  // ── Project manual document attachments ──
  interface ProjectDoc {
    id: number; project_id: string; label: string | null; original_file_name: string;
    file_name: string | null; mime_type: string; file_size: number | null;
    media_library_id: number | null; uploaded_by: string | null; created_at: string;
  }
  interface MediaItem {
    id: number; filename: string; title: string | null; mimeType: string;
    fileSize: number | null; category: string | null; capturedByName: string | null;
  }

  const [showAttachDoc, setShowAttachDoc] = useState(false);
  const [attachTab, setAttachTab] = useState<'upload' | 'storage'>('upload');
  const [attachLabel, setAttachLabel] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [mediaSearch, setMediaSearch] = useState('');
  const [selectedMediaId, setSelectedMediaId] = useState<number | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState<string>('');
  const [uploadingExternalPdfSlipId, setUploadingExternalPdfSlipId] = useState<string | null>(null);

  const { data: projectDocs = [] } = useQuery<ProjectDoc[]>({
    queryKey: ['/api/projects', id, 'documents'],
    queryFn: () => fetch(`/api/projects/${id}/documents`).then(r => r.json()),
    enabled: !!id,
  });

  const { data: mediaSearchResults = [] } = useQuery<MediaItem[]>({
    queryKey: ['/api/media', mediaSearch],
    queryFn: () => fetch(`/api/media?search=${encodeURIComponent(mediaSearch)}`).then(r => r.json()),
    enabled: mediaSearch.length >= 2,
  });

  const uploadDocMutation = useMutation({
    mutationFn: async ({ file, label }: { file: File; label: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (label) form.append('label', label);
      if (currentUser?.username) form.append('uploadedBy', currentUser.username);
      const res = await fetch(`/api/projects/${id}/documents/upload`, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'documents'] });
      setShowAttachDoc(false);
      setAttachFile(null);
      setAttachLabel('');
      toast({ title: 'Document uploaded' });
    },
    onError: (err: any) => toast({ title: 'Upload failed', description: err.message, variant: 'destructive' }),
  });

  const linkDocMutation = useMutation({
    mutationFn: async ({ mediaLibraryId, label }: { mediaLibraryId: number; label: string }) => {
      const res = await fetch(`/api/projects/${id}/documents/link`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaLibraryId, label }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'documents'] });
      setShowAttachDoc(false);
      setSelectedMediaId(null);
      setAttachLabel('');
      setMediaSearch('');
      toast({ title: 'Document linked from Central Storage' });
    },
    onError: (err: any) => toast({ title: 'Link failed', description: err.message, variant: 'destructive' }),
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (docId: number) => {
      const res = await fetch(`/api/projects/${id}/documents/${docId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'documents'] });
      toast({ title: 'Document removed' });
    },
    onError: (err: any) => toast({ title: 'Remove failed', description: err.message, variant: 'destructive' }),
  });

  const attachExternalPdfMutation = useMutation({
    mutationFn: async ({ slipId, file }: { slipId: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/p2/packing-slips/${slipId}/attach-pdf`, { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'traceability'] });
      setUploadingExternalPdfSlipId(null);
      toast({ title: 'External PDF attached' });
    },
    onError: (err: any) => {
      setUploadingExternalPdfSlipId(null);
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    },
  });

  const removeExternalPdfMutation = useMutation({
    mutationFn: async (slipId: string) => {
      const res = await fetch(`/api/p2/packing-slips/${slipId}/attach-pdf`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'traceability'] });
      toast({ title: 'External PDF removed' });
    },
    onError: (err: any) => toast({ title: 'Remove failed', description: err.message, variant: 'destructive' }),
  });

  // ── Project Closing queries & mutations ──
  const { data: projectClosing, isLoading: isLoadingClosing } = useQuery<ProjectClosing | null>({
    queryKey: ['/api/projects', id, 'closing'],
    queryFn: () => fetch(`/api/projects/${id}/closing`, { credentials: 'include' }).then(async r => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('Failed to fetch closing');
      return r.json();
    }),
    enabled: !!id,
  });

  const { data: closingRisks = [] } = useQuery<ProjectClosingRisk[]>({
    queryKey: ['/api/projects', id, 'closing', 'risks'],
    queryFn: () => fetch(`/api/projects/${id}/closing/risks`, { credentials: 'include' }).then(async r => {
      if (!r.ok) throw new Error('Failed to fetch closing risks');
      return r.json();
    }),
    enabled: !!id,
  });

  const { data: closingActions = [] } = useQuery<ProjectClosingAction[]>({
    queryKey: ['/api/projects', id, 'closing', 'actions'],
    queryFn: () => fetch(`/api/projects/${id}/closing/actions`, { credentials: 'include' }).then(async r => {
      if (!r.ok) throw new Error('Failed to fetch closing actions');
      return r.json();
    }),
    enabled: !!id,
  });

  const createClosingMutation = useMutation({
    mutationFn: (data: typeof closingForm) =>
      apiRequest(`/api/projects/${id}/closing`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing'] });
      setIsEditingClosing(false);
      toast({ title: 'Closing record created', description: 'Lessons learned have been saved.' });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: err?.message || 'Could not save closing record.', variant: 'destructive' }),
  });

  const updateClosingMutation = useMutation({
    mutationFn: ({ closingId, data }: { closingId: number; data: typeof closingForm }) =>
      apiRequest(`/api/projects/${id}/closing/${closingId}`, { method: 'PATCH', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing'] });
      setIsEditingClosing(false);
      toast({ title: 'Closing record updated', description: 'Lessons learned have been saved.' });
    },
    onError: (err: any) => toast({ title: 'Update failed', description: err?.message || 'Could not update closing record.', variant: 'destructive' }),
  });

  const { data: quoteFeedback, isLoading: isLoadingFeedback } = useQuery<QuoteExecutionFeedback | null>({
    queryKey: ['/api/projects', id, 'quote-feedback'],
    queryFn: () =>
      fetch(`/api/projects/${id}/quote-feedback`, { credentials: 'include' }).then(async r => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error('Failed to fetch quote feedback');
        return r.json();
      }),
    enabled: !!id,
  });

  const regenerateFeedbackMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${id}/quote-feedback/generate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'quote-feedback'] });
      toast({ title: 'Quote comparison refreshed', description: 'The snapshot has been updated with the latest data.' });
    },
    onError: (err: any) => toast({ title: 'Regenerate failed', description: err?.message || 'Could not regenerate quote feedback.', variant: 'destructive' }),
  });

  interface SimilarClosing {
    id: number;
    projectId: string;
    projectCode: string;
    projectName: string;
    summary: string | null;
    whatWentWrong: string | null;
    strengths: string | null;
    opportunities: string | null;
    nextProjectRecommendations: string | null;
    approvedAt: string | null;
    updatedAt: string;
  }

  const { data: similarClosings = [], isLoading: isLoadingSimilar } = useQuery<SimilarClosing[]>({
    queryKey: ['/api/projects/closings/similar', project?.customerId, project?.description],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '5' });
      if (project!.customerId) params.set('customerId', project!.customerId);
      if (project!.description) params.set('partFamily', project!.description);
      return fetch(`/api/projects/closings/similar?${params.toString()}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : []);
    },
    enabled: !!project?.customerId,
  });

  const [showSimilarProjects, setShowSimilarProjects] = useState(false);

  const addRiskMutation = useMutation({
    mutationFn: (data: typeof riskForm) =>
      apiRequest(`/api/projects/${id}/closing/risks`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'risks'] });
      setShowRiskDialog(false);
      setRiskForm({ category: '', severity: 'medium', description: '', department: '', owner: '' });
      toast({ title: 'Risk added' });
    },
    onError: (err: any) => toast({ title: 'Failed to add risk', description: err?.message, variant: 'destructive' }),
  });

  const addActionMutation = useMutation({
    mutationFn: (data: typeof actionForm) =>
      apiRequest(`/api/projects/${id}/closing/actions`, { method: 'POST', body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'closing', 'actions'] });
      setShowActionDialog(false);
      setActionForm({ actionText: '', owner: '', department: '', dueDate: '', status: 'open' });
      toast({ title: 'Action added' });
    },
    onError: (err: any) => toast({ title: 'Failed to add action', description: err?.message, variant: 'destructive' }),
  });

  const handleSaveClosing = () => {
    if (projectClosing) {
      updateClosingMutation.mutate({ closingId: projectClosing.id, data: closingForm });
    } else {
      createClosingMutation.mutate(closingForm);
    }
  };

  const handleStartEditClosing = () => {
    if (projectClosing) {
      setClosingForm({
        summary: projectClosing.summary || '',
        whatWentWrong: projectClosing.whatWentWrong || '',
        strengths: projectClosing.strengths || '',
        opportunities: projectClosing.opportunities || '',
        similaritiesToPriorProjects: projectClosing.similaritiesToPriorProjects || '',
        nextProjectRecommendations: projectClosing.nextProjectRecommendations || '',
        closedByDisplayName: projectClosing.closedByDisplayName || '',
      });
    }
    setIsEditingClosing(true);
  };

  const SEVERITY_COLORS: Record<string, string> = {
    low: 'bg-blue-100 text-blue-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
  };

  const ACTION_STATUS_COLORS: Record<string, string> = {
    open: 'bg-gray-100 text-gray-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };

  const handleExternalPdfFileChange = (slipId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast({ title: 'Invalid file type', description: 'Please select a PDF file.', variant: 'destructive' });
      return;
    }
    setUploadingExternalPdfSlipId(slipId);
    attachExternalPdfMutation.mutate({ slipId, file });
    e.target.value = '';
  };

  const getAttachmentsForStep = (stepId: string) => {
    return allProjectStepAttachments.filter(a => a.stepId === stepId);
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

  const CLOSING_FIELD_LABELS: Record<string, string> = {
    summary: 'Summary',
    whatWentWrong: 'What Went Wrong',
    strengths: 'Strengths',
    opportunities: 'Opportunities',
    similaritiesToPriorProjects: 'Similarities to Prior Projects',
    nextProjectRecommendations: 'Next Project Recommendations',
    closedByDisplayName: 'Closed By',
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
    onError: (err: any) => {
      const responseData = err?.responseData;
      const status = err?.status;

      if (status === 403 && responseData?.message?.toLowerCase().includes('approved')) {
        toast({
          title: 'Manager approval required',
          description: 'The closing record must be approved by a manager before this project can be marked complete.',
          variant: 'destructive',
        });
      } else if (status === 400 && responseData?.missingFields?.length) {
        const fieldLabels = (responseData.missingFields as string[])
          .map((f: string) => CLOSING_FIELD_LABELS[f] || f)
          .join(', ');
        toast({
          title: 'Closing record is incomplete',
          description: `The following fields are still empty: ${fieldLabels}. Please complete the closing record before marking the project complete.`,
          variant: 'destructive',
        });
      } else if (status === 400 && responseData?.message?.includes('closing record')) {
        toast({
          title: 'Closing record required',
          description: 'A lessons-learned closing record must be created before this project can be marked complete. Go to the "Close Project" tab to get started.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Failed to update project',
          description: responseData?.message || err?.message || 'An unexpected error occurred.',
          variant: 'destructive',
        });
      }
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
    onError: (err: any) => {
      toast({ title: 'Failed to update step', description: err?.message || 'An unexpected error occurred.', variant: 'destructive' });
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
    onError: (err: any) => {
      toast({ title: 'Failed to mark step complete', description: err?.message || 'An unexpected error occurred.', variant: 'destructive' });
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
    onError: (err: any) => {
      toast({ title: 'Failed to start step', description: err?.message || 'An unexpected error occurred.', variant: 'destructive' });
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
    onError: (err: any) => {
      toast({ title: 'Failed to skip step', description: err?.message || 'An unexpected error occurred.', variant: 'destructive' });
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
    onError: (err: any) => {
      toast({ title: 'Failed to reopen step', description: err?.message || 'An unexpected error occurred.', variant: 'destructive' });
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
    onError: (err: any) => {
      toast({ title: 'Failed to delete attachment', description: err?.message || 'An unexpected error occurred.', variant: 'destructive' });
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
    if (!projectSteps.length) return 0;
    const completed = projectSteps.filter(s => s.status === 'completed').length;
    return Math.round((completed / projectSteps.length) * 100);
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
            <Badge
              className={
                project.closingStatus === 'APPROVED'
                  ? 'bg-blue-100 text-blue-800 text-xs'
                  : project.closingStatus === 'COMPLETE'
                  ? 'bg-green-100 text-green-800 text-xs'
                  : project.closingStatus === 'INCOMPLETE'
                  ? 'bg-yellow-100 text-yellow-800 text-xs'
                  : 'bg-red-100 text-red-800 text-xs'
              }
              title="Closing record status"
            >
              Closing: {project.closingStatus}
            </Badge>
          </div>
          <p className="text-lg text-muted-foreground">{project.projectName}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setLocation(`/pm-control-center?project=${project.id}`)}
        >
          <BarChart2 className="mr-2 h-4 w-4" />
          PM Dashboard
        </Button>
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

      {projectWorkOrders.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {projectWorkOrders.map(wo => (
            <button
              key={wo.id}
              onClick={() => setLocation(`/maintenance-events/${wo.id}`)}
              className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Work Order: {wo.workOrderNumber}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Overall Progress</span>
          <span className="font-medium">{getProgress()}%</span>
        </div>
        <Progress value={getProgress()} className="h-3" />
      </div>

      {/* Lifecycle Progress Bar */}
      {(() => {
        const LIFECYCLE_STAGES = [
          { label: 'RFQ', key: 'rfq' },
          { label: 'Quote', key: 'quote' },
          { label: 'Project Start', key: 'project_start' },
          { label: 'PO Received', key: 'po_received' },
          { label: 'P2 Release', key: 'p2_release' },
          { label: 'Production', key: 'production' },
          { label: 'Closed', key: 'closed' },
        ];

        const rfqStep = projectSteps.find(s => s.stepType === 'rfq_risk_assessment');
        const quoteStep = projectSteps.find(s => s.stepType === 'quote');
        const preprodStep = projectSteps.find(s => s.stepType === 'preproduction_checklist');

        const STAGE_ORDER = ['rfq_received', 'quote', 'project_start', 'po_received', 'p2_release', 'production', 'closed'];
        const curStageIdx = STAGE_ORDER.indexOf(project.currentStage || 'rfq_received');

        const stageComplete = [
          rfqStep?.status === 'completed',
          quoteStep?.status === 'completed',
          curStageIdx >= 2,
          !!project.poId,
          curStageIdx >= 4,
          curStageIdx >= 5,
          project.status === 'completed',
        ];

        const currentIdx = stageComplete.lastIndexOf(true);
        const inProgressIdx = stageComplete.findIndex((v, i) => !v && (i === 0 || stageComplete[i - 1]));

        return (
          <div className="border rounded-lg p-4 bg-white">
            <h3 className="text-sm font-semibold mb-3 text-gray-700">Project Lifecycle</h3>
            <div className="flex items-center gap-0 overflow-x-auto pb-1">
              {LIFECYCLE_STAGES.map((stage, i) => {
                const isDone = stageComplete[i];
                const isCurrent = i === inProgressIdx || (inProgressIdx === -1 && i === currentIdx);
                const isLast = i === LIFECYCLE_STAGES.length - 1;
                return (
                  <div key={stage.key} className="flex items-center min-w-0 flex-shrink-0">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                        isDone
                          ? 'bg-green-500 border-green-500 text-white'
                          : isCurrent
                            ? 'bg-blue-100 border-blue-500 text-blue-700'
                            : 'bg-gray-100 border-gray-300 text-gray-400'
                      }`}>
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isCurrent ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </div>
                      <span className={`text-xs mt-1 text-center whitespace-nowrap px-1 ${
                        isDone ? 'text-green-700 font-medium' : isCurrent ? 'text-blue-700 font-medium' : 'text-gray-400'
                      }`} style={{ maxWidth: '72px', fontSize: '0.65rem', lineHeight: '1.2' }}>
                        {stage.label}
                      </span>
                    </div>
                    {!isLast && (
                      <div className={`h-0.5 w-8 mx-0.5 flex-shrink-0 ${stageComplete[i] && stageComplete[i + 1] ? 'bg-green-400' : stageComplete[i] ? 'bg-blue-200' : 'bg-gray-200'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* P2 Release Gate Card — shown when project is approaching or at the release gate */}
      {project && ['purchase_review', 'po_received', 'p2_release'].includes(project.currentStage || '') && (
        <Card className={`border-2 ${project.currentStage === 'p2_release' ? 'border-green-400 bg-green-50 dark:bg-green-950/20' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`h-5 w-5 ${project.currentStage === 'p2_release' ? 'text-green-600' : 'text-amber-600'}`} />
              <CardTitle className="text-base">
                P2 Release Gate
                {project.currentStage === 'p2_release' && (
                  <Badge className="ml-2 bg-green-500 text-white text-xs">Staged — Ready to Release</Badge>
                )}
              </CardTitle>
            </div>
            <CardDescription>
              Required conditions must be met before this project can enter the P2 Control Center.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Gate condition checklist */}
            <div className="space-y-2">
              {gateStatus?.gates ? (
                gateStatusGates.map((gate) => (
                  <div key={gate.key} className="flex items-center gap-3 py-1">
                    {gate.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    )}
                    <span className={`text-sm font-medium ${gate.passed ? 'text-green-800 dark:text-green-300' : 'text-red-700 dark:text-red-400'}`}>
                      {gate.label}
                    </span>
                    <Badge variant={gate.passed ? 'default' : 'secondary'} className={`ml-auto text-xs ${gate.passed ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
                      {gate.status === 'not_required' ? 'N/A' : gate.passed ? 'APPROVED' : 'PENDING'}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="space-y-2">
                  {['PO Review', 'WAD (Work Authorization Document)', 'Preproduction'].map(label => (
                    <div key={label} className="flex items-center gap-3 py-1">
                      <Clock className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-muted-foreground">{label}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">CHECKING...</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Blocked conditions list */}
            {gateStatus && gateStatusGates.length > 0 && !gateStatus.allPassed && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2">
                <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Blocking conditions:</p>
                <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 list-disc list-inside">
                  {gateStatusGates.filter(g => !g.passed).map(g => (
                    <li key={g.key}>{g.message || `${g.label} must be completed`}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* PO required warning */}
            {!project.poId && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  A P2 Purchase Order must be linked to this project before it can be released.
                </p>
              </div>
            )}

            {/* Release button */}
            <div className="flex items-center gap-3 pt-1">
              <Button
                onClick={() => releaseToP2Mutation.mutate()}
                disabled={!project.poId || !gateStatus?.allPassed || releaseToP2Mutation.isPending}
                className={`${project.currentStage === 'p2_release' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                title={!project.poId ? 'Link a P2 Purchase Order before releasing' : !gateStatus?.allPassed ? 'Complete all required gate conditions to enable release' : undefined}
              >
                <Rocket className="h-4 w-4 mr-2" />
                {releaseToP2Mutation.isPending
                  ? 'Processing...'
                  : project.currentStage === 'p2_release'
                  ? 'Release to Production'
                  : 'Release to P2 Control Center'}
              </Button>
              {project.poId && !gateStatus?.allPassed && (
                <p className="text-xs text-muted-foreground">
                  {gateStatusGates.length > 0 ? `${gateStatusGates.filter(g => !g.passed).length} of ${gateStatusGates.length} conditions pending` : 'Loading gate status...'}
                </p>
              )}
              {project.poId && gateStatus?.allPassed && project.currentStage !== 'p2_release' && (
                <p className="text-xs text-green-600 font-medium">
                  All conditions met — ready to release
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Similar Past Projects widget */}
      {(isLoadingSimilar || similarClosings.length > 0) && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
            onClick={() => setShowSimilarProjects(prev => !prev)}
          >
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Similar Past Projects</span>
              {!isLoadingSimilar && similarClosings.length > 0 && (
                <Badge variant="secondary" className="text-xs h-5">{similarClosings.length}</Badge>
              )}
            </div>
            {showSimilarProjects ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showSimilarProjects && (
            <div className="px-4 py-3 space-y-2 bg-background">
              {isLoadingSimilar ? (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-200 rounded" />)}
                </div>
              ) : (
                <div className="divide-y">
                  {similarClosings.map((closing) => (
                    <div key={closing.id} className="flex items-center justify-between py-2 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className="text-xs font-mono shrink-0">{closing.projectCode}</Badge>
                        <span className="text-sm truncate">{closing.projectName}</span>
                        {closing.approvedAt && (
                          <span className="text-xs text-muted-foreground shrink-0">{format(new Date(closing.approvedAt), 'MMM yyyy')}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs shrink-0 h-7 px-2"
                        onClick={() => setLocation(`/projects/${closing.projectId}/closing`)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Closing
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="workflow" data-testid="tab-workflow">Workflow</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">Activity Log</TabsTrigger>
          <TabsTrigger value="revisions" data-testid="tab-revisions">
            <History className="h-4 w-4 mr-1.5" />
            Revisions
          </TabsTrigger>
          <TabsTrigger value="traceability" data-testid="tab-traceability">Traceability</TabsTrigger>
          <TabsTrigger value="closing" data-testid="tab-closing">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Close Project
            <span
              className={`ml-1.5 inline-block w-2 h-2 rounded-full ${
                project.closingStatus === 'APPROVED'
                  ? 'bg-blue-500'
                  : project.closingStatus === 'COMPLETE'
                  ? 'bg-green-500'
                  : project.closingStatus === 'INCOMPLETE'
                  ? 'bg-yellow-500'
                  : 'bg-red-400'
              }`}
              title={`Closing: ${project.closingStatus}`}
            />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="space-y-4">
          {/* Inline Workflow Action Cards */}
          {(() => {
            const purchaseStep = projectSteps.find(s => s.stepType === 'purchase_review_checklist');
            const wadStep = projectSteps.find(s => s.stepType === 'p2_order');
            const preprodStep = projectSteps.find(s => s.stepType === 'preproduction_checklist');
            const projectWorkOrder = projectWorkOrders[0];
            const wadRoute = projectWorkOrder
              ? `/work-orders/${projectWorkOrder.id}/wizard`
              : `/wad-wizard?search=${encodeURIComponent(project.projectCode || project.projectName || project.id)}`;

            const actionCards = [
              {
                key: 'purchase_review',
                title: 'Purchase Review Checklist',
                description: 'Verify PO terms, pricing, and contract requirements before authorizing work.',
                step: purchaseStep,
                route: `/purchase-review-checklist?projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`,
                icon: <ListChecks className="h-5 w-5 text-blue-600" />,
                gateLabel: 'Complete before WAD',
              },
              {
                key: 'wad',
                title: 'Work Authorization Document (WAD)',
                description: 'Authorize charge codes, labor budgets, and departments before production begins.',
                step: wadStep,
                route: wadRoute,
                icon: <FileText className="h-5 w-5 text-purple-600" />,
                gateLabel: 'Complete before Pre-Production',
              },
              {
                key: 'preprod',
                title: 'Pre-Production Checklist',
                description: 'Confirm drawings, materials, tooling, and task assignments are ready before production release.',
                step: preprodStep,
                route: `/preproduction-checklists?projectId=${encodeURIComponent(project.id)}${project.projectName ? `&projectName=${encodeURIComponent(project.projectName)}` : ''}${project.poNumber ? `&poNumber=${encodeURIComponent(project.poNumber)}` : ''}`,
                icon: <ClipboardList className="h-5 w-5 text-green-600" />,
                gateLabel: 'Gate to P2 Production',
              },
            ];

            const getStepBadge = (step: ProjectStep | undefined) => {
              if (!step) return null;
              const colors: Record<string, string> = {
                completed: 'bg-green-100 text-green-800',
                in_progress: 'bg-blue-100 text-blue-800',
                pending: 'bg-gray-100 text-gray-600',
                blocked: 'bg-red-100 text-red-800',
              };
              const labels: Record<string, string> = {
                completed: 'Complete',
                in_progress: 'In Progress',
                pending: 'Pending',
                blocked: 'Blocked',
              };
              return (
                <Badge className={`${colors[step.status] || 'bg-gray-100 text-gray-600'} text-xs`}>
                  {labels[step.status] || step.status}
                </Badge>
              );
            };

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {actionCards.map((card) => (
                  <Card key={card.key} className={`border-l-4 ${card.step?.status === 'completed' ? 'border-l-green-500' : card.step?.status === 'in_progress' ? 'border-l-blue-500' : 'border-l-gray-300'}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {card.icon}
                          <span className="text-sm font-semibold">{card.title}</span>
                        </div>
                        {getStepBadge(card.step)}
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">{card.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">{card.gateLabel}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setLocation(card.route)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Open
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })()}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                    FAR Flowdown
                  </CardTitle>
                  <CardDescription>
                    Contract clauses captured from the purchase review checklist and carried on this project.
                  </CardDescription>
                </div>
                <Badge variant="outline">{projectFarFlowdowns.length} clause{projectFarFlowdowns.length === 1 ? '' : 's'}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {projectFarFlowdowns.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No FAR flowdowns have been captured yet. Open the Purchase Review Checklist for this project to record clause numbers and flowdown notes.
                </div>
              ) : (
                <div className="space-y-3">
                  {projectFarFlowdowns.map((flowdown) => (
                    <div key={flowdown.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {flowdown.clauseNumber} - {flowdown.title}
                        </div>
                        <Badge className={flowdown.status === 'open' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}>
                          {flowdown.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{flowdown.reasoning}</p>
                      {flowdown.purchaseReviewChecklistId && (
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-2 h-auto p-0"
                          onClick={() => setLocation(`/purchase-review-checklist?id=${flowdown.purchaseReviewChecklistId}&projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`)}
                        >
                          <ExternalLink className="mr-1 h-3 w-3" />
                          Open source checklist
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Project Workflow</CardTitle>
              <CardDescription>Track progress through each step of the P2 workflow</CardDescription>
            </CardHeader>
            <CardContent>
              {projectSteps.length === 0 ? (
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
                {(() => {
                  const sortedSteps = [...projectSteps].sort((a, b) => a.stepOrder - b.stepOrder);
                  return sortedSteps;
                })().map((step, index) => {
                  const config = STEP_CONFIG[step.stepType];
                  const StatusIcon = STEP_STATUS_ICONS[step.status];
                  const linkedId = getLinkedId(step);
                  const sortedStepsForGate = [...projectSteps].sort((a, b) => a.stepOrder - b.stepOrder);
                  const isLast = index === sortedStepsForGate.length - 1;
                  const stepAttachments = getAttachmentsForStep(step.id);
                  const isExpanded = expandedSteps.has(step.id);
                  const hasContent = stepAttachments.length > 0 || linkedId;

                  const prevStep = index > 0 ? sortedStepsForGate[index - 1] : null;
                  const isLocked = (step.status === 'pending' || step.status === 'blocked')
                    && prevStep !== null
                    && !['completed', 'skipped', 'not_applicable'].includes(prevStep.status);

                  const CLOSING_REQUIRED_FIELDS = ['summary', 'whatWentWrong', 'strengths', 'opportunities', 'nextProjectRecommendations'] as const;
                  const closingMissingFields = step.stepType === 'p2_order' && step.status === 'in_progress'
                    ? CLOSING_REQUIRED_FIELDS.filter(f => {
                        const val = projectClosing?.[f as keyof typeof projectClosing];
                        return !val || (typeof val === 'string' && val.trim() === '');
                      })
                    : [];
                  const closingApproved = step.stepType === 'p2_order' && step.status === 'in_progress'
                    ? (project.closingStatus === 'APPROVED' || !!projectClosing?.approvedBy)
                    : true;
                  const isClosingReady = step.stepType === 'p2_order' && step.status === 'in_progress'
                    ? (project.closingStatus === 'APPROVED' || (project.closingStatus === 'COMPLETE' && closingApproved))
                    : true;

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
                                  onClick={() => {
                                    if (!config?.route) return;
                                    const CUSTOMER_ID_STEPS = ['rfq_risk_assessment', 'quote', 'purchase_review_checklist'];
                                    const route = step.stepType === 'purchase_review_checklist'
                                      ? `${config.route}?projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`
                                      : CUSTOMER_ID_STEPS.includes(step.stepType) && project?.customerId
                                        ? `${config.route}?customerId=${encodeURIComponent(project.customerId)}`
                                        : config.route;
                                    setLocation(route);
                                  }}
                                  data-testid={`button-open-${step.stepType}`}
                                >
                                  <ExternalLink className="mr-1 h-4 w-4" />
                                  Open Form
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
                                  disabled={markStepCompleteMutation.isPending || (step.stepType === 'p2_order' && !isClosingReady)}
                                  title={step.stepType === 'p2_order' && !isClosingReady ? 'Complete and approve the closing record before finishing this step' : undefined}
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
                                  onClick={() => {
                                    if (!config?.route) return;
                                    const CUSTOMER_ID_STEPS = ['rfq_risk_assessment', 'quote', 'purchase_review_checklist'];
                                    const route = step.stepType === 'purchase_review_checklist'
                                      ? `${config.route}?projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`
                                      : CUSTOMER_ID_STEPS.includes(step.stepType) && project?.customerId
                                        ? `${config.route}?customerId=${encodeURIComponent(project.customerId)}`
                                        : config.route;
                                    setLocation(route);
                                  }}
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
                              isLocked ? (
                                <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-1.5">
                                  <Lock className="h-4 w-4 flex-shrink-0" />
                                  <span>
                                    Complete <strong>{STEP_CONFIG[prevStep!.stepType]?.label || prevStep!.stepType}</strong> to unlock this step
                                  </span>
                                </div>
                              ) : (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    startStepMutation.mutate(step.id);
                                    if (config?.route) {
                                      const CUSTOMER_ID_STEPS = ['rfq_risk_assessment', 'quote', 'purchase_review_checklist'];
                                      const route = step.stepType === 'purchase_review_checklist'
                                        ? `${config.route}?projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`
                                        : CUSTOMER_ID_STEPS.includes(step.stepType) && project?.customerId
                                          ? `${config.route}?customerId=${encodeURIComponent(project.customerId)}`
                                          : config.route;
                                      setLocation(route);
                                    }
                                  }}
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
                              )
                            )}
                          </div>
                        </div>
                        {step.notes && (
                          <p className="text-sm bg-muted p-2 rounded">{step.notes}</p>
                        )}
                        {step.stepType === 'p2_order' && step.status === 'in_progress' && (
                          <div className={`flex items-start gap-2 text-sm rounded-md px-3 py-2 border ${
                            isClosingReady
                              ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
                              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                          }`}>
                            {isClosingReady ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>Closing record is complete and approved. Ready to mark complete.</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-medium">
                                    Closing record required before this step can be completed
                                  </p>
                                  {project.closingStatus === 'MISSING' && (
                                    <p className="text-xs mt-0.5">No closing/lessons-learned record exists yet. Go to the <strong>Close Project</strong> tab to create one.</p>
                                  )}
                                  {project.closingStatus === 'INCOMPLETE' && closingMissingFields.length > 0 && (
                                    <p className="text-xs mt-0.5">
                                      Missing fields: {closingMissingFields.map(f => CLOSING_FIELD_LABELS[f] || f).join(', ')}.
                                    </p>
                                  )}
                                  {project.closingStatus !== 'MISSING' && !closingApproved && (
                                    <p className="text-xs mt-0.5">Closing record has not been approved by a manager yet.</p>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
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

                {/* ── Project Closing pseudo-step ── */}
                {projectSteps.length > 0 && (() => {
                  const sortedSteps = [...projectSteps].sort((a, b) => a.stepOrder - b.stepOrder);
                  const lastStep = sortedSteps[sortedSteps.length - 1];
                  const isLastStepDone = lastStep && ['completed', 'skipped', 'not_applicable'].includes(lastStep.status);
                  const isClosingLocked = !isLastStepDone;
                  const ClosingStatusIcon = project.closingStatus === 'APPROVED'
                    ? CheckCircle2
                    : project.closingStatus === 'COMPLETE'
                    ? CheckCircle2
                    : project.closingStatus === 'INCOMPLETE'
                    ? Clock
                    : AlertCircle;
                  const closingIconColor = project.closingStatus === 'APPROVED'
                    ? 'text-blue-500'
                    : project.closingStatus === 'COMPLETE'
                    ? 'text-green-500'
                    : project.closingStatus === 'INCOMPLETE'
                    ? 'text-amber-500'
                    : 'text-red-400';
                  return (
                    <div className="relative flex gap-4 pb-2 pt-2">
                      <div className={`relative z-10 flex-shrink-0 mt-1 ${isClosingLocked ? 'text-gray-300' : closingIconColor}`}>
                        <ClosingStatusIcon className="h-8 w-8" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">Project Closing</h3>
                            <p className="text-sm text-muted-foreground">
                              {isClosingLocked
                                ? 'Locked — complete the P2 Order step first'
                                : project.closingStatus === 'APPROVED'
                                ? 'Approved — closing record is complete and approved'
                                : project.closingStatus === 'COMPLETE'
                                ? 'Complete — awaiting manager approval'
                                : project.closingStatus === 'INCOMPLETE'
                                ? 'Incomplete — some required fields are missing'
                                : 'No closing record yet'}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-wrap justify-end">
                            <Badge
                              className={
                                isClosingLocked
                                  ? 'bg-gray-100 text-gray-500 text-xs'
                                  : project.closingStatus === 'APPROVED'
                                  ? 'bg-blue-100 text-blue-800 text-xs'
                                  : project.closingStatus === 'COMPLETE'
                                  ? 'bg-green-100 text-green-800 text-xs'
                                  : project.closingStatus === 'INCOMPLETE'
                                  ? 'bg-yellow-100 text-yellow-800 text-xs'
                                  : 'bg-red-100 text-red-800 text-xs'
                              }
                            >
                              {isClosingLocked ? 'Locked' : project.closingStatus}
                            </Badge>
                            {!isClosingLocked && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocation(`/projects/${id}/closing`)}
                                data-testid="button-open-closing"
                              >
                                <ExternalLink className="mr-1 h-4 w-4" />
                                Open Closing
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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
        <TabsContent value="revisions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Project Revisions
              </CardTitle>
              <CardDescription>
                Current project basis: {project.currentRevisionLabel || 'Rev 0'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_auto]">
                <div className="space-y-2">
                  <Label>Summary</Label>
                  <Input
                    value={revisionForm.summary}
                    onChange={(e) => setRevisionForm((prev) => ({ ...prev, summary: e.target.value }))}
                    placeholder="Scope, PO, routing, or schedule change"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Input
                    value={revisionForm.reason}
                    onChange={(e) => setRevisionForm((prev) => ({ ...prev, reason: e.target.value }))}
                    placeholder="Why this revision is needed"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    className="w-full md:w-auto"
                    disabled={revisionForm.summary.trim().length < 3 || revisionForm.reason.trim().length < 3 || createRevisionMutation.isPending}
                    onClick={() => createRevisionMutation.mutate(revisionForm)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {createRevisionMutation.isPending ? 'Saving...' : 'Create Revision'}
                  </Button>
                </div>
              </div>

              <Separator />

              {projectRevisions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No revisions recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {projectRevisions.map((revision) => (
                    <div key={revision.id} className="rounded-md border p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">{revision.revision_label}</Badge>
                        <Badge variant={revision.revision_type === 'PO_LINK_CHANGE' ? 'default' : 'secondary'}>
                          {revision.revision_type === 'PO_LINK_CHANGE' ? 'PO Link' : 'Project Change'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(revision.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{revision.summary}</p>
                      <p className="text-sm text-muted-foreground">{revision.reason}</p>
                      {(revision.previous_po_number || revision.new_po_number) && (
                        <p className="text-xs text-muted-foreground font-mono">
                          PO: {revision.previous_po_number || 'none'} -&gt; {revision.new_po_number || 'none'}
                        </p>
                      )}
                      {revision.created_by_display_name && (
                        <p className="text-xs text-muted-foreground">Recorded by {revision.created_by_display_name}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
                        onClick={() => linkPoMutation.mutate({ poId: suggestedPo.id })}
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
                          {p2PurchaseOrderOptions
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
                    <div className="space-y-2">
                      <Label>Revision Reason</Label>
                      <Textarea
                        placeholder="Initial PO link, customer PO changed, production PO superseded, etc."
                        value={linkPoReason}
                        onChange={(e) => setLinkPoReason(e.target.value)}
                      />
                    </div>
                    <Button
                      disabled={!linkPoId || linkPoMutation.isPending}
                      onClick={() => linkPoMutation.mutate({ poId: parseInt(linkPoId), reason: linkPoReason })}
                    >
                      {linkPoMutation.isPending ? 'Linking…' : 'Link PO'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ── SECTION 0: Linked PO ── */}
              {(traceability.po || project?.poId) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Receipt className="h-4 w-4" /> Linked Purchase Order
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PO Number</p>
                        <button
                          onClick={() => setLocation(`/p2-control-center?tab=pos`)}
                          className="font-mono font-semibold text-sm text-primary hover:underline cursor-pointer"
                        >
                          {traceability.po?.po_number || `PO ID ${project.poId}`}
                        </button>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Customer</p>
                        <p className="text-sm">{traceability.po?.customer_name || 'PO record not found'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Status</p>
                        <Badge variant={traceability.po?.status === 'COMPLETE' ? 'default' : 'secondary'} className="text-xs">
                          {traceability.po?.status || 'Missing'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">PO Date</p>
                        <p className="text-sm">
                          {traceability.po?.created_at ? format(new Date(traceability.po.created_at), 'MMM d, yyyy') : 'Needs relink'}
                        </p>
                      </div>
                    </div>
                    <Separator className="my-4" />
                    {!showManualLink ? (
                      <Button variant="outline" size="sm" onClick={() => setShowManualLink(true)}>
                        <LinkIcon className="h-4 w-4 mr-1.5" />
                        Change Linked PO
                      </Button>
                    ) : (
                      <div className="space-y-4 rounded-md border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">Create PO Link Revision</p>
                            <p className="text-xs text-muted-foreground">
                              Changing the linked PO creates a new project revision and preserves the prior link in history.
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setShowManualLink(false);
                              setLinkPoId('');
                              setLinkPoReason('');
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>New P2 PO</Label>
                            <Select value={linkPoId} onValueChange={setLinkPoId}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select replacement PO" />
                              </SelectTrigger>
                              <SelectContent>
                                {p2PurchaseOrderOptions
                                  .filter(po => po.id !== project.poId)
                                  .map(po => (
                                    <SelectItem key={po.id} value={po.id.toString()}>
                                      {po.poNumber} - {po.customerName}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Required Reason</Label>
                            <Textarea
                              placeholder="Why is this project moving to a different production PO?"
                              value={linkPoReason}
                              onChange={(e) => setLinkPoReason(e.target.value)}
                            />
                          </div>
                        </div>
                        <Button
                          disabled={!linkPoId || linkPoReason.trim().length < 3 || linkPoMutation.isPending}
                          onClick={() => linkPoMutation.mutate({ poId: parseInt(linkPoId), reason: linkPoReason })}
                        >
                          {linkPoMutation.isPending ? 'Saving Revision...' : 'Save PO Revision'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

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
                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                Preview Packing Slip
                              </a>
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={`/api/p2/packing-slips/${traceability.packingSlip.id}/pdf`}
                                download
                              >
                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                Download PDF
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
              <Accordion type="single" collapsible className="border rounded-lg bg-card text-card-foreground shadow-sm">
                <AccordionItem value="serials" className="border-0">
                  <div className="px-6">
                    <AccordionTrigger className="hover:no-underline gap-3 py-4">
                      <div className="flex items-center gap-2 text-base font-semibold">
                        <Hash className="h-4 w-4" /> Serialized Items
                        <span className="text-sm font-normal text-muted-foreground">
                          ({traceabilitySerials.length} serial{traceabilitySerials.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent className="px-6 pb-4 pt-0">
                    {traceabilitySerials.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">No serialized items found.</p>
                    ) : (
                      <div className="space-y-5">
                        {Object.entries(
                          traceabilitySerials.reduce<Record<string, TraceabilitySerial[]>>((acc, s) => {
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* ── SECTION 3: Production Status ── */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Layers className="h-4 w-4" /> Production Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const total = traceabilitySerials.length;
                    const completed = traceabilitySerials.filter(s => s.completed_at).length;
                    const finalized = traceabilitySerials.filter(s => s.finalized_at).length;
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
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4" /> Documents
                    </CardTitle>
                    <Button size="sm" variant="outline" onClick={() => { setShowAttachDoc(true); setAttachTab('upload'); setAttachLabel(''); setAttachFile(null); setMediaSearch(''); setSelectedMediaId(null); }}>
                      <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Attach
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {traceability.packingSlips && traceability.packingSlips.length > 0 ? (
                      traceability.packingSlips.map((slip) => (
                        <div key={slip.id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                          <div className="flex items-center gap-3">
                            <Tag className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">Packing Slip</p>
                              <p className="text-xs text-muted-foreground font-mono">{slip.packing_slip_number}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={slip.status === 'SHIPPED' ? 'default' : 'secondary'} className="text-xs">
                              {slip.status}
                            </Badge>
                            <Button size="sm" variant="ghost" title="Preview generated PDF" asChild>
                              <a href={`/api/p2/packing-slips/${slip.id}/pdf`} target="_blank" rel="noreferrer">
                                <Eye className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Button size="sm" variant="ghost" title="Download generated PDF" asChild>
                              <a href={`/api/p2/packing-slips/${slip.id}/pdf`} download>
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            {slip.external_pdf_url && (
                              <>
                                <Badge variant="outline" className="text-xs text-blue-600 border-blue-300 dark:text-blue-400 dark:border-blue-700 px-1.5 py-0">
                                  Ext. PDF
                                </Badge>
                                <Button size="sm" variant="ghost" title="Preview external PDF" className="text-blue-600 dark:text-blue-400" asChild>
                                  <a href={slip.external_pdf_url} target="_blank" rel="noreferrer">
                                    <Eye className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                                <Button size="sm" variant="ghost" title="Download external PDF" className="text-blue-600 dark:text-blue-400" asChild>
                                  <a href={slip.external_pdf_url} download>
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Remove external PDF"
                                  className="text-muted-foreground hover:text-destructive"
                                  disabled={removeExternalPdfMutation.isPending}
                                  onClick={() => removeExternalPdfMutation.mutate(slip.id)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              id={`ext-pdf-input-${slip.id}`}
                              onChange={(e) => handleExternalPdfFileChange(slip.id, e)}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              title={slip.external_pdf_url ? 'Replace external PDF' : 'Attach external PDF'}
                              disabled={uploadingExternalPdfSlipId === slip.id}
                              onClick={() => document.getElementById(`ext-pdf-input-${slip.id}`)?.click()}
                            >
                              {uploadingExternalPdfSlipId === slip.id ? (
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" />
                              ) : (
                                <Paperclip className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
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
                        <div className="flex items-center gap-2">
                          <Badge variant={traceability.certificate.status === 'ISSUED' ? 'default' : 'secondary'} className="text-xs">
                            {traceability.certificate.status}
                          </Badge>
                          <Button size="sm" variant="ghost" title="Preview PDF" asChild>
                            <a href={`/api/p2/certificates/${traceability.certificate.id}/pdf`} target="_blank" rel="noreferrer">
                              <Eye className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button size="sm" variant="ghost" title="Download PDF" asChild>
                            <a href={`/api/p2/certificates/${traceability.certificate.id}/pdf`} download>
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-2 px-3 rounded-lg border text-muted-foreground">
                        <Award className="h-4 w-4" />
                        <p className="text-sm">Certificate of Conformance — not yet generated</p>
                      </div>
                    )}

                    {traceability.invoice ? (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg border">
                        <button
                          onClick={() => setLocation(`/finance/invoices/${traceability.invoice!.id}`)}
                          className="flex items-center gap-3 text-left hover:opacity-70 transition-opacity"
                        >
                          <Receipt className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium text-primary hover:underline">Invoice</p>
                            <p className="text-xs text-muted-foreground font-mono">{traceability.invoice.invoice_number}</p>
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          <Badge variant={traceability.invoice.status === 'PAID' ? 'default' : 'secondary'} className="text-xs">
                            {traceability.invoice.status}
                          </Badge>
                          <span className="text-sm font-medium">${Number(traceability.invoice.total_amount).toLocaleString()}</span>
                          <Button size="sm" variant="ghost" title="Open invoice"
                            onClick={() => setLocation(`/finance/invoices/${traceability.invoice!.id}`)}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-2 px-3 rounded-lg border text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <Receipt className="h-4 w-4" />
                          <p className="text-sm">Invoice — not yet raised</p>
                        </div>
                        {traceability.po?.customer_id && (
                          <Button size="sm" variant="ghost" className="text-xs gap-1.5"
                            onClick={() => setLocation(`/finance/invoices?customerId=${traceability.po!.customer_id}`)}>
                            <ExternalLink className="h-3 w-3" /> View customer invoices
                          </Button>
                        )}
                      </div>
                    )}

                    {/* ── Manual attachments ── */}
                    {projectDocs.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 pt-2">
                          <div className="flex-1 border-t" />
                          <span className="text-xs text-muted-foreground px-2">Manual Attachments</span>
                          <div className="flex-1 border-t" />
                        </div>
                        {projectDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{doc.label || doc.original_file_name}</p>
                                {doc.label && (
                                  <p className="text-xs text-muted-foreground font-mono truncate">{doc.original_file_name}</p>
                                )}
                                {doc.uploaded_by && (
                                  <p className="text-xs text-muted-foreground">by {doc.uploaded_by}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button size="sm" variant="ghost" title="Preview"
                                onClick={() => { setPdfPreviewUrl(`/api/projects/${id}/documents/${doc.id}/file`); setPdfPreviewTitle(doc.label || doc.original_file_name); }}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="ghost" title="Download" asChild>
                                <a href={`/api/projects/${id}/documents/${doc.id}/file`} download={doc.original_file_name}>
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" title="Remove"
                                onClick={() => deleteDocMutation.mutate(doc.id)}
                                disabled={deleteDocMutation.isPending}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── CLOSING TAB — navigates to the dedicated closing record page ── */}
        <TabsContent value="closing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Project Closing &amp; Lessons Learned
              </CardTitle>
              <CardDescription>
                The closing record captures lessons learned, risks, and follow-up actions from this project.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                project.closingStatus === 'APPROVED'
                  ? 'border-blue-300 bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-200'
                  : project.closingStatus === 'COMPLETE'
                  ? 'border-green-300 bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200'
                  : project.closingStatus === 'INCOMPLETE'
                  ? 'border-amber-300 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200'
                  : 'border-red-300 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200'
              }`}>
                {project.closingStatus === 'APPROVED' ? (
                  <Award className="h-5 w-5 flex-shrink-0" />
                ) : project.closingStatus === 'COMPLETE' ? (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                ) : project.closingStatus === 'INCOMPLETE' ? (
                  <Clock className="h-5 w-5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                )}
                <div>
                  <p className="font-semibold">Closing: {project.closingStatus}</p>
                  <p className="text-sm mt-0.5">
                    {project.closingStatus === 'APPROVED'
                      ? 'Closing record is complete and has been approved by a manager.'
                      : project.closingStatus === 'COMPLETE'
                      ? 'All required fields are complete — awaiting manager approval.'
                      : project.closingStatus === 'INCOMPLETE'
                      ? 'Closing record exists but some fields are still missing.'
                      : 'No closing record has been created yet.'}
                  </p>
                </div>
              </div>
              <Button onClick={() => setLocation(`/projects/${id}/closing`)} data-testid="button-view-closing">
                <BookOpen className="h-4 w-4 mr-2" />
                View Closing Record
              </Button>
            </CardContent>
          </Card>

          {/* Quote vs Actual Comparison */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart2 className="h-5 w-5" />
                    Quote vs Actual Comparison
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Performance metrics comparing quoted estimates to actual execution.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenerateFeedbackMutation.mutate()}
                  disabled={regenerateFeedbackMutation.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${regenerateFeedbackMutation.isPending ? 'animate-spin' : ''}`} />
                  {regenerateFeedbackMutation.isPending ? 'Generating…' : 'Regenerate'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingFeedback ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-6 bg-gray-200 rounded w-1/2" />
                  <div className="h-20 bg-gray-200 rounded" />
                </div>
              ) : !quoteFeedback ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-sm text-muted-foreground">No quote comparison snapshot available yet.</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regenerateFeedbackMutation.mutate()}
                    disabled={regenerateFeedbackMutation.isPending}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Generate Comparison
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Labor Hours */}
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Labor Hours</p>
                      <div className="flex items-end gap-3">
                        <div>
                          <p className="text-2xl font-bold">{quoteFeedback.actualLaborHours ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">Actual</p>
                        </div>
                        <div className="text-muted-foreground text-sm mb-1">vs</div>
                        <div>
                          <p className="text-lg text-muted-foreground">{quoteFeedback.quotedLaborHours ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">Quoted</p>
                        </div>
                        {quoteFeedback.laborHoursVariancePct !== null && (
                          <span className={`ml-auto text-sm font-medium px-2 py-0.5 rounded ${
                            (quoteFeedback.laborHoursVariancePct ?? 0) > 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          }`}>
                            {(quoteFeedback.laborHoursVariancePct ?? 0) > 0 ? '+' : ''}{quoteFeedback.laborHoursVariancePct?.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Lead Time */}
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lead Time (Days)</p>
                      <div className="flex items-end gap-3">
                        <div>
                          <p className="text-2xl font-bold">{quoteFeedback.actualLeadTimeDays ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">Actual</p>
                        </div>
                        <div className="text-muted-foreground text-sm mb-1">vs</div>
                        <div>
                          <p className="text-lg text-muted-foreground">{quoteFeedback.quotedLeadTimeDays ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">Quoted</p>
                        </div>
                        {quoteFeedback.scheduleVarianceDays !== null && (
                          <span className={`ml-auto text-sm font-medium px-2 py-0.5 rounded ${
                            (quoteFeedback.scheduleVarianceDays ?? 0) > 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                              : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                          }`}>
                            {(quoteFeedback.scheduleVarianceDays ?? 0) > 0 ? '+' : ''}{quoteFeedback.scheduleVarianceDays}d
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {quoteFeedback.summary && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                      <p className="text-sm">{quoteFeedback.summary}</p>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    {quoteFeedback.keyStrengths && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Strengths</p>
                        <p className="text-sm">{quoteFeedback.keyStrengths}</p>
                      </div>
                    )}
                    {quoteFeedback.keyOpportunities && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Opportunities</p>
                        <p className="text-sm">{quoteFeedback.keyOpportunities}</p>
                      </div>
                    )}
                  </div>

                  {quoteFeedback.keyRisks && quoteFeedback.keyRisks.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">Key Risks</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {quoteFeedback.keyRisks.map((risk, i) => (
                          <li key={i} className="text-sm text-muted-foreground">{risk}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {quoteFeedback.recommendedQuotingNotes && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recommended Quoting Notes</p>
                      <p className="text-sm text-muted-foreground">{quoteFeedback.recommendedQuotingNotes}</p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Generated {format(new Date(quoteFeedback.generatedAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Project Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Past Project Insights
              </CardTitle>
              <CardDescription>
                Lessons from similar approved closed projects for the same customer — use these to inform estimates and planning.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingSimilar ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-5 bg-gray-200 rounded w-1/3" />
                  <div className="h-16 bg-gray-200 rounded" />
                </div>
              ) : similarClosings.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No approved closing records found for this customer yet. As projects are closed and approved, their lessons learned will appear here.
                </p>
              ) : (
                <Accordion type="multiple" className="space-y-1">
                  {similarClosings.map((closing) => (
                    <AccordionItem key={closing.id} value={String(closing.id)} className="border rounded-md px-3">
                      <AccordionTrigger className="py-2 hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          <Badge variant="outline" className="text-xs font-mono shrink-0">{closing.projectCode}</Badge>
                          <span className="text-sm font-medium truncate">{closing.projectName}</span>
                          {closing.approvedAt && (
                            <span className="text-xs text-muted-foreground ml-auto shrink-0">
                              {format(new Date(closing.approvedAt), 'MMM yyyy')}
                            </span>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 space-y-3">
                        {closing.summary && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Summary</p>
                            <p className="text-sm">{closing.summary}</p>
                          </div>
                        )}
                        <div className="grid gap-3 md:grid-cols-2">
                          {closing.strengths && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">What Went Well</p>
                              <p className="text-sm">{closing.strengths}</p>
                            </div>
                          )}
                          {closing.whatWentWrong && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">What Went Wrong</p>
                              <p className="text-sm">{closing.whatWentWrong}</p>
                            </div>
                          )}
                        </div>
                        {closing.nextProjectRecommendations && (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Recommendations for Next Project</p>
                            <p className="text-sm">{closing.nextProjectRecommendations}</p>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs mt-1"
                          onClick={() => setLocation(`/projects/${closing.projectId}/closing`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View full closing record
                        </Button>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* ── PDF Preview Dialog ── */}
        <Dialog open={!!pdfPreviewUrl} onOpenChange={(open) => { if (!open) setPdfPreviewUrl(null); }}>
          <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0">
            <DialogHeader className="px-4 pt-4 pb-2 flex-shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2 text-base truncate">
                  <FileText className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{pdfPreviewTitle}</span>
                </DialogTitle>
                <Button size="sm" variant="outline" asChild className="flex-shrink-0 ml-4">
                  <a href={pdfPreviewUrl ?? ''} download>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                  </a>
                </Button>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-hidden px-4 pb-4">
              {pdfPreviewUrl && (
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-full rounded-lg border"
                  title={pdfPreviewTitle}
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Attach Document Dialog ── */}
        <Dialog open={showAttachDoc} onOpenChange={setShowAttachDoc}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Attach Document</DialogTitle>
            </DialogHeader>
            <Tabs value={attachTab} onValueChange={(v) => setAttachTab(v as 'upload' | 'storage')}>
              <TabsList className="w-full">
                <TabsTrigger value="upload" className="flex-1">
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload File
                </TabsTrigger>
                <TabsTrigger value="storage" className="flex-1">
                  <HardDrive className="h-3.5 w-3.5 mr-1.5" /> Central Storage
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input placeholder="e.g. Manual CoC, Signed Drawing…" value={attachLabel} onChange={e => setAttachLabel(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>File <span className="text-muted-foreground text-xs">(PDF, JPG, PNG, TIFF — max 30 MB)</span></Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => document.getElementById('proj-doc-file-input')?.click()}>
                    {attachFile ? (
                      <div className="space-y-1">
                        <FileText className="mx-auto h-8 w-8 text-primary" />
                        <p className="text-sm font-medium">{attachFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(attachFile.size / 1024).toFixed(0)} KB</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">Click to select a file</p>
                      </div>
                    )}
                    <input id="proj-doc-file-input" type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.tiff"
                      onChange={e => setAttachFile(e.target.files?.[0] ?? null)} />
                  </div>
                </div>
                <Button className="w-full" disabled={!attachFile || uploadDocMutation.isPending}
                  onClick={() => attachFile && uploadDocMutation.mutate({ file: attachFile, label: attachLabel })}>
                  {uploadDocMutation.isPending ? 'Uploading…' : 'Upload Document'}
                </Button>
              </TabsContent>

              <TabsContent value="storage" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input placeholder="e.g. Reference Drawing, Approved CoC…" value={attachLabel} onChange={e => setAttachLabel(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Search Central Storage</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search by filename or title…" value={mediaSearch}
                      onChange={e => { setMediaSearch(e.target.value); setSelectedMediaId(null); }} />
                  </div>
                </div>
                {mediaSearch.length >= 2 && (
                  <ScrollArea className="h-48 border rounded-lg">
                    {mediaSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">No files found</p>
                    ) : (
                      <div className="p-2 space-y-1">
                        {mediaSearchResults.map(m => (
                          <div key={m.id}
                            onClick={() => setSelectedMediaId(m.id)}
                            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors
                              ${selectedMediaId === m.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted'}`}>
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{m.title || m.filename}</p>
                              {m.title && <p className="text-xs text-muted-foreground truncate font-mono">{m.filename}</p>}
                              {m.category && <Badge variant="secondary" className="text-xs mt-0.5">{m.category}</Badge>}
                            </div>
                            {selectedMediaId === m.id && <Eye className="h-4 w-4 text-primary flex-shrink-0" />}
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                )}
                {mediaSearch.length > 0 && mediaSearch.length < 2 && (
                  <p className="text-xs text-muted-foreground">Type at least 2 characters to search</p>
                )}
                <Button className="w-full" disabled={!selectedMediaId || linkDocMutation.isPending}
                  onClick={() => selectedMediaId && linkDocMutation.mutate({ mediaLibraryId: selectedMediaId, label: attachLabel })}>
                  {linkDocMutation.isPending ? 'Linking…' : 'Attach from Central Storage'}
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
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
          {editData.status === 'completed' && project.status !== 'completed' && project.closingStatus !== 'APPROVED' && (
            <div className="flex items-start gap-2 text-sm rounded-md px-3 py-2 border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 mb-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Closing record required</p>
                <p className="text-xs mt-0.5">
                  {project.closingStatus === 'MISSING'
                    ? 'No closing record exists. Go to the "Close Project" tab to create one before marking complete.'
                    : project.closingStatus === 'INCOMPLETE'
                    ? 'The closing record is incomplete. All required fields must be filled before marking complete.'
                    : 'The closing record must be approved by a manager before marking this project complete.'}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => updateProjectMutation.mutate(editData)}
              disabled={updateProjectMutation.isPending || (editData.status === 'completed' && project.status !== 'completed' && project.closingStatus !== 'APPROVED')}
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
      {/* ── Add Risk Dialog ── */}
      <Dialog open={showRiskDialog} onOpenChange={setShowRiskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Risk</DialogTitle>
            <DialogDescription>Record a risk identified during the project closing review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. Supply Chain, Technical, Process…"
                value={riskForm.category}
                onChange={e => setRiskForm(f => ({ ...f, category: e.target.value }))}
                data-testid="input-risk-category"
              />
            </div>
            <div className="space-y-2">
              <Label>Severity <span className="text-red-500">*</span></Label>
              <Select value={riskForm.severity} onValueChange={(v) => setRiskForm(f => ({ ...f, severity: v as typeof riskForm.severity }))}>
                <SelectTrigger data-testid="select-risk-severity">
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
              <Label>Description <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Describe the risk in detail…"
                rows={3}
                value={riskForm.description}
                onChange={e => setRiskForm(f => ({ ...f, description: e.target.value }))}
                data-testid="textarea-risk-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  placeholder="Responsible person"
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
              data-testid="button-save-risk"
            >
              {addRiskMutation.isPending ? 'Adding…' : 'Add Risk'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Action Dialog ── */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Follow-up Action</DialogTitle>
            <DialogDescription>Record a follow-up action item from the closing review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Action <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Describe what needs to be done…"
                rows={3}
                value={actionForm.actionText}
                onChange={e => setActionForm(f => ({ ...f, actionText: e.target.value }))}
                data-testid="textarea-action-text"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  placeholder="Responsible person"
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input
                  type="date"
                  value={actionForm.dueDate}
                  onChange={e => setActionForm(f => ({ ...f, dueDate: e.target.value }))}
                  data-testid="input-action-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={actionForm.status} onValueChange={(v) => setActionForm(f => ({ ...f, status: v as typeof actionForm.status }))}>
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
              data-testid="button-save-action"
            >
              {addActionMutation.isPending ? 'Adding…' : 'Add Action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

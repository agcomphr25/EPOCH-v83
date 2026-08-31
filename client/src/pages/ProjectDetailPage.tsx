import { useState, useRef, useMemo, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import P2POCreationWizard from '@/components/p2/P2POCreationWizard';
import P2ProjectDepositsCard from '@/components/p2/P2ProjectDepositsCard';
import P2V2ProjectWorkflow from '@/components/projects/P2V2ProjectWorkflow';
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

const DRAFT_TAB_HANDOFF_KEY = 'epoch:draft-builder-tab-handoff';

function BomAssemblyTreeNode({ node, isRoot = false }: { node: any; isRoot?: boolean }) {
  return (
    <div className={isRoot ? '' : 'ml-4 border-l pl-4'}>
      <div className="rounded-md border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold">{node.partNumber}</p>
            <p className="truncate text-xs text-muted-foreground">{node.partName || 'No part description'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!isRoot && <Badge variant="outline">Qty {Number(node.quantityPerParent ?? 1).toLocaleString()}</Badge>}
            <Badge variant={node.isManufactured ? 'default' : 'secondary'}>
              {node.isManufactured ? 'Manufactured' : 'Component'}
            </Badge>
            {node.hasBom && (
              <Badge variant="outline">BOM{node.revisionCode ? ` Rev ${node.revisionCode}` : ''}</Badge>
            )}
          </div>
        </div>
      </div>
      {Array.isArray(node.children) && node.children.length > 0 && (
        <div className="mt-2 space-y-2">
          {node.children.map((child: any) => (
            <BomAssemblyTreeNode key={child.key} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionHierarchyNode({ node, isRoot = false }: { node: any; isRoot?: boolean }) {
  const workOrders = Array.isArray(node.workOrders) ? node.workOrders : [];
  const demand = node.productionDemand ?? {};
  const departments = Array.isArray(demand.departments) ? demand.departments : [];
  const isPurchased = node.sourceType === 'PURCHASED_MATERIAL';
  const isStockSatisfied = node.sourceType === 'STOCK_SATISFIED';
  if (isPurchased) return null;
  const typeLabel = node.sourceType === 'ASSEMBLY_WORK_ORDER'
    ? 'Assembly work order'
    : isStockSatisfied
      ? 'Fulfilled from inventory'
    : isPurchased
      ? 'Purchased material'
      : `${departments.join(' / ') || 'Manufactured'} work order`;

  return (
    <div className={isRoot ? '' : 'ml-4 border-l pl-4'}>
      <div className="rounded-md border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold">{node.partNumber}</p>
            <p className="truncate text-xs text-muted-foreground">{node.partName || 'No part description'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={isStockSatisfied ? 'secondary' : isPurchased ? 'secondary' : 'default'}>{typeLabel}</Badge>
            <Badge variant="outline">Gross demand {Number(node.grossRequiredQuantity ?? node.requiredQuantity ?? 0).toLocaleString()}</Badge>
            {Number(node.inventoryFulfilledQuantity ?? 0) > 0 && (
              <Badge variant="secondary">From stock {Number(node.inventoryFulfilledQuantity).toLocaleString()}</Badge>
            )}
            {!isStockSatisfied && (
              <Badge variant="outline">Production required {Number(node.requiredQuantity ?? 0).toLocaleString()}</Badge>
            )}
          </div>
        </div>
        {isPurchased ? (
          <p className="mt-2 text-xs text-muted-foreground">Purchase demand only - no production work order.</p>
        ) : isStockSatisfied ? (
          <p className="mt-2 text-xs text-muted-foreground">No child work order or downstream raw-material demand is required.</p>
        ) : workOrders.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {workOrders.map((wo: any) => (
              <Badge key={wo.id ?? wo.workOrderNumber ?? wo.work_order_number} variant="outline">
                {wo.workOrderNumber ?? wo.work_order_number} - Qty {Number(wo.quantity ?? 0).toLocaleString()}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs font-medium text-amber-700">Required work order has not been provisioned.</p>
        )}
        {!isPurchased && Number(demand.recordCount ?? 0) > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Production demand: {Number(demand.totalQuantity ?? 0).toLocaleString()}
            {demand.legacyUnitRows ? ` (${Number(demand.recordCount).toLocaleString()} historical unit rows collapsed for display)` : ''}
          </p>
        )}
      </div>
      {Array.isArray(node.children) && node.children.some((child: any) => child.sourceType !== 'PURCHASED_MATERIAL') && (
        <div className="mt-2 space-y-2">
          {node.children
            .filter((child: any) => child.sourceType !== 'PURCHASED_MATERIAL')
            .map((child: any) => <ProductionHierarchyNode key={child.key} node={child} />)}
        </div>
      )}
    </div>
  );
}

function hasMissingManufacturingWorkOrder(node: any): boolean {
  if (!node) return false;
  const required = !['PURCHASED_MATERIAL', 'STOCK_SATISFIED'].includes(node.sourceType);
  if (required && (!Array.isArray(node.workOrders) || node.workOrders.length === 0)) return true;
  return Array.isArray(node.children) && node.children.some(hasMissingManufacturingWorkOrder);
}

const ROM_CATEGORY_CONFIG = [
  { key: 'labor', label: 'Labor', field: 'quotedHours', kind: 'hours', detail: 'Direct labor estimate from ROM/quote feedback' },
  { key: 'material', label: 'Material', field: 'budgetAmount', kind: 'currency', detail: 'Material budget that will seed the WAD' },
  { key: 'outsideProcessing', label: 'Outside Processing', field: 'budgetAmount', kind: 'currency', detail: 'Vendor services and outside operations' },
  { key: 'nrc', label: 'NRC', field: 'budgetAmount', kind: 'currency', detail: 'Non-recurring cost' },
  { key: 'tooling', label: 'Tooling', field: 'budgetAmount', kind: 'currency', detail: 'Tooling budget' },
  { key: 'design', label: 'Design', field: 'budgetAmount', kind: 'currency', detail: 'Design labor and engineering budget' },
  { key: 'capital', label: 'Capital', field: 'budgetAmount', kind: 'currency', detail: 'Assets, startup services, and startup labor' },
  { key: 'generalAndAdmin', label: 'G&A', field: 'budgetAmount', kind: 'currency', detail: 'General and administrative burden' },
  { key: 'overhead', label: 'Overhead', field: 'budgetAmount', kind: 'currency', detail: 'Indirect cost burden' },
  { key: 'qualityAndCompliance', label: 'Quality and Compliance', field: 'budgetAmount', kind: 'currency', detail: 'Inspection, compliance, and quality planning' },
  { key: 'shippingAndPackaging', label: 'Shipping and Packaging', field: 'budgetAmount', kind: 'currency', detail: 'Pack, ship, freight, and documentation' },
  { key: 'contingency', label: 'Contingency', field: 'budgetAmount', kind: 'currency', detail: 'Risk reserve' },
  { key: 'escalationAndInflation', label: 'Escalation and Inflation', field: 'budgetAmount', kind: 'currency', detail: 'Schedule and pricing escalation' },
  { key: 'profitFee', label: 'Profit / Fee', field: 'budgetAmount', kind: 'currency', detail: 'Quote profit or fee target' },
] as const;

type RomCategoryKey = typeof ROM_CATEGORY_CONFIG[number]['key'];
type RomCategoryField = typeof ROM_CATEGORY_CONFIG[number]['field'];

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
  p2PoItemId: number | null;
  p2BillingAllocationId: string | null;
  projectManagerId: number | null;
  reminderDays: number;
  notes: string | null;
  createdAt: string;
  steps: ProjectStep[];
  customer?: { id: number; customerId: string; name: string };
  projectManager?: { id: number; name: string };
  activityLog: ActivityLog[];
  closingStatus: 'MISSING' | 'INCOMPLETE' | 'COMPLETE' | 'APPROVED';
  workflowVersion?: string | null;
  effectiveWorkflowVersion?: string;
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
  projectId?: string | null;
  projectName?: string | null;
  poDate?: string | null;
  expectedDelivery?: string | null;
  createdAt?: string;
}

interface P2PoItemOption {
  id: number;
  poId: number;
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice: number | null;
}

interface P2BillingBucketOption {
  id: string;
  poId: number;
  poItemId: number | null;
  bucketLabel: string;
  description: string | null;
  customerPoLine: string | null;
  quantityAuthorized: number;
  unitPrice: string | number;
}

interface P2PoLinkOptions {
  poItems: P2PoItemOption[];
  billingBuckets: P2BillingBucketOption[];
}

interface P2PurchaseOrderItem {
  id?: number | string;
  partNumber: string;
  partName: string;
  description?: string | null;
  quantity: number;
  dueDate?: string | null;
  unitPrice?: number | null;
  specifications?: string | null;
  notes?: string | null;
  inventoryItemId?: number | null;
}

const EMPTY_P2_PO_ITEMS: P2PurchaseOrderItem[] = [];

const normalizeArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'purchaseOrders']) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }

  return [];
};

interface ProjectRevision {
  id: number;
  project_id: string;
  revision_number: number;
  revision_label: string;
  revision_type: string;
  revision_date: string;
  has_po_change: boolean;
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

const WAD_WORKFLOW_STATUS_OVERRIDES: Record<string, string> = {
  RELEASED: 'released',
  COMPLETE: 'completed',
  CLOSED: 'completed',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();

  // Read ?tab= from URL to support deep-links (e.g. from serial search)
  const requestedTab = new URLSearchParams(window.location.search).get('tab') ?? 'workflow';
  const tabAliases: Record<string, string> = {
    'parts-request': 'material',
    nre: 'rom',
    'assembly-tree': 'production',
    activity: 'workflow',
    revisions: 'po',
    closing: 'workflow',
  };
  const initialTab = tabAliases[requestedTab] ?? requestedTab;
  const [activeTab, setActiveTab] = useState(initialTab);
  const [draftBuilderHandoff, setDraftBuilderHandoff] = useState<any>(null);
  useEffect(() => {
    const nextTab = tabAliases[new URLSearchParams(window.location.search).get('tab') ?? 'workflow']
      ?? new URLSearchParams(window.location.search).get('tab')
      ?? 'workflow';
    setActiveTab(nextTab);
  }, [location]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_TAB_HANDOFF_KEY);
      if (!raw) {
        setDraftBuilderHandoff(null);
        return;
      }
      const parsed = JSON.parse(raw);
      setDraftBuilderHandoff(parsed?.projectId === id ? parsed : null);
    } catch {
      setDraftBuilderHandoff(null);
    }
  }, [id, location]);
  const changeProjectTab = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    setLocation(`/projects/${id}?${params.toString()}`);
  };
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
  const effectiveWorkflowVersion = project?.effectiveWorkflowVersion;
  const isP2V2Workflow = effectiveWorkflowVersion === 'p2_v2';
  const isLegacyWorkflow = effectiveWorkflowVersion === 'legacy_v1';
  const hasUnknownWorkflowVersion = Boolean(project && !isP2V2Workflow && !isLegacyWorkflow);

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
  const p2PurchaseOrderOptions = normalizeArray<P2PurchaseOrder>(p2PurchaseOrders);

  const [linkPoId, setLinkPoId] = useState<string>('');
  const [linkPoItemId, setLinkPoItemId] = useState<string>('');
  const [linkBillingBucketId, setLinkBillingBucketId] = useState<string>('');
  const [linkPoSearch, setLinkPoSearch] = useState('');
  const [showManualLink, setShowManualLink] = useState(false);
  const [linkPoReason, setLinkPoReason] = useState('');
  const [revisionForm, setRevisionForm] = useState({
    revisionType: 'po' as 'po' | 'drawing' | 'contract',
    revisionDate: new Date().toISOString().split('T')[0],
    reason: '',
    hasPoChange: false,
    revisedPoNumber: '',
    revisedDueDate: '',
    revisedLineItems: [] as P2PurchaseOrderItem[],
  });
  const [showProjectPOWizard, setShowProjectPOWizard] = useState(false);
  const [romForm, setRomForm] = useState({
    summary: '',
    assumptions: '',
    riskNotes: '',
    categories: {} as Record<string, Record<string, string>>,
  });
  const [romFormHydratedKey, setRomFormHydratedKey] = useState('');
  const [sourcePartInternalNumbers, setSourcePartInternalNumbers] = useState<Record<string, string>>({});

  const linkedProjectPO = useMemo(() => {
    if (!project?.poId) return null;
    return p2PurchaseOrderOptions.find((po) => po.id === project.poId) ?? null;
  }, [project?.poId, p2PurchaseOrderOptions]);

  const { data: linkedPoItems = EMPTY_P2_PO_ITEMS } = useQuery<P2PurchaseOrderItem[]>({
    queryKey: ['/api/p2-purchase-order-items', project?.poId],
    enabled: !!project?.poId && revisionForm.hasPoChange,
  });

  const suggestedRevisionPoNumber = useMemo(() => {
    const base = linkedProjectPO?.poNumber?.trim();
    if (!base) return '';
    return base;
  }, [linkedProjectPO?.poNumber]);

  useEffect(() => {
    if (!revisionForm.hasPoChange) return;
    setRevisionForm((prev) => ({
      ...prev,
      revisedPoNumber: prev.revisedPoNumber || suggestedRevisionPoNumber,
      revisedDueDate: prev.revisedDueDate || linkedProjectPO?.expectedDelivery?.slice(0, 10) || '',
      revisedLineItems:
        prev.revisedLineItems.length > 0
          ? prev.revisedLineItems
          : linkedPoItems.map((item) => ({
              id: item.id,
              partNumber: item.partNumber || '',
              partName: item.partName || item.description || item.partNumber || '',
              quantity: Number(item.quantity) || 1,
              unitPrice: Number(item.unitPrice) || 0,
              dueDate: item.dueDate?.slice(0, 10) || linkedProjectPO?.expectedDelivery?.slice(0, 10) || '',
              specifications: item.specifications || '',
              notes: item.notes || '',
              inventoryItemId: item.inventoryItemId ?? null,
            })),
    }));
  }, [
    revisionForm.hasPoChange,
    linkedPoItems,
    linkedProjectPO?.expectedDelivery,
    suggestedRevisionPoNumber,
  ]);

  const updateRevisionLineItem = (
    index: number,
    updates: Partial<P2PurchaseOrderItem>
  ) => {
    setRevisionForm((prev) => ({
      ...prev,
      revisedLineItems: prev.revisedLineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      ),
    }));
  };

  const addRevisionLineItem = () => {
    setRevisionForm((prev) => ({
      ...prev,
      revisedLineItems: [
        ...prev.revisedLineItems,
        {
          id: `new-${Date.now()}`,
          partNumber: '',
          partName: '',
          quantity: 1,
          dueDate: prev.revisedDueDate || '',
          unitPrice: 0,
          specifications: '',
          notes: '',
        },
      ],
    }));
  };

  const removeRevisionLineItem = (index: number) => {
    setRevisionForm((prev) => ({
      ...prev,
      revisedLineItems: prev.revisedLineItems.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const hasInvalidRevisedLineItems = revisionForm.hasPoChange && revisionForm.revisedLineItems.some((item) =>
    !item.partNumber.trim() || !item.partName.trim() || Number(item.quantity) <= 0
  );

  const suggestedPo = useMemo(() => {
    if (!project || p2PurchaseOrderOptions.length === 0) return null;
    const available = p2PurchaseOrderOptions.filter(po =>
      !po.projectId || po.projectId === project.id || po.id === project.poId
    );
    const sameCustomer = available.filter(po => po.customerId === project.customerId);
    const pool = sameCustomer.length > 0 ? sameCustomer : available;
    return pool.slice().sort((a, b) => {
      if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return b.id - a.id;
    })[0] ?? null;
  }, [project, p2PurchaseOrderOptions]);

  const projectP2POs = useMemo(() => {
    if (!project) return [];
    return p2PurchaseOrderOptions
      .filter(po => po.projectId === project.id || po.id === project.poId)
      .sort((a, b) => {
        if (a.createdAt && b.createdAt) return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return b.id - a.id;
      });
  }, [project, p2PurchaseOrderOptions]);

  const activeLinkPoId = showManualLink ? linkPoId : (suggestedPo?.id.toString() ?? linkPoId);

  const { data: poLinkOptions } = useQuery<P2PoLinkOptions>({
    queryKey: ['/api/projects', id, 'po-link-options', activeLinkPoId],
    queryFn: () => apiRequest(`/api/projects/${id}/po-link-options?poId=${encodeURIComponent(activeLinkPoId)}`),
    enabled: !!id && !!activeLinkPoId,
  });

  const poItemOptions = normalizeArray<P2PurchaseOrderItem>(poLinkOptions?.poItems);
  const billingBucketOptions = normalizeArray<P2BillingBucketOption>(poLinkOptions?.billingBuckets).filter((bucket) => {
    if (!linkPoItemId) return true;
    return !bucket.poItemId || bucket.poItemId === Number(linkPoItemId);
  });

  const linkPoMutation = useMutation({
    mutationFn: ({
      poId,
      poItemId,
      billingAllocationId,
      reason,
    }: {
      poId: number;
      poItemId?: number | null;
      billingAllocationId?: string | null;
      reason?: string;
    }) =>
      apiRequest(`/api/projects/${id}/link-po`, {
        method: 'POST',
        body: {
          poId,
          poItemId,
          billingAllocationId,
          reason,
          createdByDisplayName: currentUser?.username,
        },
      }),
    onSuccess: () => {
      toast({ title: 'PO linked', description: 'Purchase order link was saved as a project revision.' });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'traceability'] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'revisions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
      setLinkPoId('');
      setLinkPoItemId('');
      setLinkBillingBucketId('');
      setLinkPoSearch('');
      setLinkPoReason('');
      setShowManualLink(false);
    },
    onError: (err: any) => {
      toast({ title: 'Link failed', description: err?.message || 'Failed to link PO.', variant: 'destructive' });
    },
  });

  const linkSelectedPo = (poIdValue: string, reason?: string) => {
    if (!poIdValue) return;
    linkPoMutation.mutate({
      poId: parseInt(poIdValue, 10),
      poItemId: linkPoItemId ? parseInt(linkPoItemId, 10) : null,
      billingAllocationId: linkBillingBucketId || null,
      reason,
    });
  };

  const { data: projectRevisionsRaw } = useQuery<ProjectRevision[]>({
    queryKey: ['/api/projects', id, 'revisions'],
    queryFn: () => fetch(`/api/projects/${id}/revisions`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });
  const projectRevisions = normalizeArray<ProjectRevision>(projectRevisionsRaw);

  const createRevisionMutation = useMutation({
    mutationFn: (data: typeof revisionForm) =>
      apiRequest(`/api/projects/${id}/revisions`, {
        method: 'POST',
        body: {
          ...data,
          createdByDisplayName: currentUser?.username,
        },
      }),
    onSuccess: (createdRevision: ProjectRevision) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'revisions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
      setRevisionForm({
        revisionType: 'po',
        revisionDate: new Date().toISOString().split('T')[0],
        reason: '',
        hasPoChange: false,
        revisedPoNumber: '',
        revisedDueDate: '',
        revisedLineItems: [],
      });
      toast({ title: 'Revision created', description: 'Project revision history was updated.' });
      const revisionMetadata = (createdRevision as any)?.metadata;
      if (revisionMetadata?.source === 'project-bom-routing' && revisionMetadata?.pcfRecommended) {
        setLocation(buildBomRoutingPcfUrl(createdRevision));
        return;
      }
      if (createdRevision?.has_po_change && createdRevision.new_po_id) {
        setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(id || '')}&editPoId=${encodeURIComponent(String(createdRevision.new_po_id))}`);
      }
    },
    onError: (err: any) => toast({ title: 'Revision failed', description: err?.message || 'Could not create revision.', variant: 'destructive' }),
  });

  const handleProjectPOWizardComplete = (poId: number) => {
    setShowProjectPOWizard(false);
    if (!project?.poId) {
      linkPoMutation.mutate({ poId, reason: 'Initial production PO link' });
      return;
    }
    toast({ title: 'PO created', description: 'P2 purchase order was added to this project.' });
    queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
    queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'traceability'] });
    queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
    queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
  };

  const { data: projectWorkOrdersRaw } = useQuery<ProjectWorkOrder[]>({
    queryKey: ['/api/work-orders/project', id],
    queryFn: () => fetch(`/api/work-orders/project/${id}`).then(r => r.json()),
    enabled: !!id,
  });
  const projectWorkOrders = normalizeArray<ProjectWorkOrder>(projectWorkOrdersRaw);

  const { data: allStepAttachmentsRaw } = useQuery<StepAttachment[]>({
    queryKey: ['/api/project-step-attachments/by-project', id],
    enabled: !!id,
  });
  const allStepAttachments = normalizeArray<StepAttachment>(allStepAttachmentsRaw);

  const { data: traceability, isLoading: isLoadingTraceability } = useQuery<TraceabilityData>({
    queryKey: ['/api/projects', id, 'traceability'],
    queryFn: () => fetch(`/api/projects/${id}/traceability`).then(r => r.json()),
    enabled: !!id,
  });

  const { data: p2Hub } = useQuery<any>({
    queryKey: ['/api/projects', id, 'p2-hub'],
    queryFn: () => fetch(`/api/projects/${id}/p2-hub`).then(r => r.json()),
    enabled: !!id,
  });

  const createManufacturingWorkOrders = useMutation({
    mutationFn: async () => {
      const action = p2Hub?.tabs?.production?.manufacturingWorkOrderAction;
      if (!action?.launchId || !action?.expectedLaunchDigest)
        throw new Error('Complete Production Launch before creating manufacturing work orders.');
      if (!action.enabled)
        throw new Error('Manufacturing work-order creation is not enabled for this deployment yet.');
      return apiRequest(
        `/api/projects/${id}/workflow-v2/production-planning/launch/${action.launchId}/create-manufacturing-work-orders`,
        {
          method: 'POST',
          body: {
            idempotencyKey: `manufacturing-work-orders:${action.launchId}`,
            expectedLaunchDigest: action.expectedLaunchDigest,
            signatureMeaning: 'Create manufacturing work orders from the released BOM and routing.',
          },
        }
      );
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'p2-hub'] });
      toast({ title: result?.message || 'Manufacturing work orders created' });
    },
    onError: (error: any) =>
      toast({
        title: 'Work orders could not be created',
        description: error?.message || 'Check the released BOM, routing, and WAD information.',
        variant: 'destructive',
      }),
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
    enabled: !!id && !!project && isLegacyWorkflow && ['po_received', 'p2_release', 'purchase_review'].includes(project.currentStage || ''),
  });
  const projectSteps = Array.isArray(project?.steps) ? project.steps : [];
  const allProjectStepAttachments = Array.isArray(allStepAttachments) ? allStepAttachments : [];
  const gateStatusGates = Array.isArray(gateStatus?.gates) ? gateStatus.gates : [];
  const traceabilitySerials = Array.isArray(traceability?.serials) ? traceability.serials : [];
  const hubTabs = p2Hub?.tabs ?? {};
  const hubWad = hubTabs.wad ?? {};
  const wadSummary = hubWad.summary ?? {};
  const wadWorkOrders = Array.isArray(hubWad.workOrders) && hubWad.workOrders.length > 0
    ? hubWad.workOrders
    : projectWorkOrders;
  const wadRevisions = Array.isArray(hubWad.revisions)
    ? hubWad.revisions
    : projectRevisions.filter((revision: any) => {
        const type = String(revision.revision_type ?? revision.revisionType ?? '').toLowerCase();
        return type === 'wad';
      });
  const latestWad = hubWad.latestWad ?? wadSummary.latestWad ?? wadWorkOrders[0] ?? null;
  const hubRom = hubTabs.rom ?? {};
  const hubProduction = hubTabs.production ?? {};
  const productionSummary = hubProduction.summary ?? {};
  const projectSerializedItems = Array.isArray(hubProduction.serializedItems) ? hubProduction.serializedItems : traceabilitySerials;
  const productionLinePlacements = Array.isArray(hubProduction.poLinePlacements) ? hubProduction.poLinePlacements : [];
  const manufacturedProductionItems = Array.isArray(hubProduction.manufacturedItems) ? hubProduction.manufacturedItems : [];
  const manufacturedItemsByDepartment = manufacturedProductionItems.reduce((groups: Record<string, any[]>, item: any) => {
    const department = item.department || 'Unassigned';
    (groups[department] ??= []).push(item);
    return groups;
  }, {});
  const productionAssemblyTree = hubProduction.assemblyTree ?? {};
  const assemblyPoItems = Array.isArray(productionAssemblyTree.poItems) ? productionAssemblyTree.poItems : [];
  const productionPlacementCounts = productionLinePlacements.reduce((counts: Record<string, number>, line: any) => {
    Object.entries(line.placementCounts ?? {}).forEach(([placement, count]) => {
      const numericCount = Number(count);
      counts[placement] = (counts[placement] ?? 0) + (Number.isFinite(numericCount) ? numericCount : 0);
    });
    return counts;
  }, {});
  const hubMaterial = hubTabs.material ?? {};
  const hubLabor = hubTabs.labor ?? {};
  const draftHandoffDraft = draftBuilderHandoff?.draft ?? {};
  const draftPartsRequestLines = draftBuilderHandoff?.tabId === 'parts-request' && Array.isArray(draftHandoffDraft.partsRequestLines)
    ? draftHandoffDraft.partsRequestLines
    : [];
  const draftLaborEstimateLines = draftBuilderHandoff?.tabId === 'direct-labor' && Array.isArray(draftHandoffDraft.laborEstimateLines)
    ? draftHandoffDraft.laborEstimateLines
    : [];
  const draftLaborEstimateHours = draftLaborEstimateLines.reduce((sum: number, line: any) => {
    const qty = Number(line.quantityPerPo ?? line.quantity ?? line.poQuantity ?? line.qty ?? 1);
    const hours = Number(line.hoursPerPart ?? line.hours ?? 0);
    return sum + (Number.isFinite(qty) && Number.isFinite(hours) ? qty * hours : 0);
  }, 0);
  const draftLaborEstimateCost = draftLaborEstimateLines.reduce((sum: number, line: any) => {
    const qty = Number(line.quantityPerPo ?? line.quantity ?? line.poQuantity ?? line.qty ?? 1);
    const hours = Number(line.hoursPerPart ?? line.hours ?? 0);
    const rate = Number(line.hourlyRate ?? line.rate ?? 0);
    return sum + (Number.isFinite(qty) && Number.isFinite(hours) && Number.isFinite(rate) ? qty * hours * rate : 0);
  }, 0);
  const hubShippingInvoicing = hubTabs.shippingInvoicing ?? {};
  const hubDocumentCoverage = hubTabs.documentCoverage ?? {};
  const documentCoverageSummary = hubDocumentCoverage.summary ?? {};
  const documentCoverageItems = Array.isArray(hubDocumentCoverage.items) ? hubDocumentCoverage.items : [];
  const hubBomRouting = hubTabs.bomRouting ?? {};
  const bomRoutingSummary = hubBomRouting.summary ?? {};
  const bomRoutingRecords = Array.isArray(hubBomRouting.bomRecords) ? hubBomRouting.bomRecords : [];
  const bomAssemblyTree = Array.isArray(hubBomRouting.assemblyTree) ? hubBomRouting.assemblyTree : [];
  const assemblyBomRecords = Array.isArray(productionAssemblyTree.bomRecords) ? productionAssemblyTree.bomRecords : bomRoutingRecords;
  const bomRoutingRoutings = Array.isArray(hubBomRouting.routings) ? hubBomRouting.routings : [];
  const bomRoutingSourceParts = Array.isArray(hubBomRouting.sourceParts) ? hubBomRouting.sourceParts : [];
  const bomRoutingPartNumbers = Array.isArray(hubBomRouting.sourcePartNumbers) ? hubBomRouting.sourcePartNumbers : [];
  const bomRoutingChangeLinks = Array.isArray(hubBomRouting.changeLinks)
    ? hubBomRouting.changeLinks
    : projectRevisions.filter((revision: any) => {
        const type = String(revision.revision_type ?? revision.revisionType ?? '').toLowerCase();
        return type === 'drawing' || type === 'contract';
      });
  const primaryBomRoutingPartNumber = bomRoutingPartNumbers[0] ?? bomRoutingRecords[0]?.parent_part_ag_number ?? bomRoutingRoutings[0]?.part_number ?? '';
  const latestBomRevisionCode = bomRoutingRecords.find((bom: any) => bom.latest_rev_code)?.latest_rev_code;
  const latestRoutingRevisionCode = bomRoutingRoutings.find((routing: any) => routing.routing_revision)?.routing_revision;
  const currentBomRoutingRevision = [latestBomRevisionCode ? `BOM ${latestBomRevisionCode}` : '', latestRoutingRevisionCode ? `Routing ${latestRoutingRevisionCode}` : '']
    .filter(Boolean)
    .join(' / ');
  const buildBomRoutingPcfUrl = (revision?: any) => {
    const revisionLabel = revision?.revision_label ?? revision?.revisionLabel ?? '';
    const revisionSummary = revision?.summary ?? '';
    const params = new URLSearchParams({
      tab: 'changes',
      newPCF: '1',
      changeType: 'BOM',
      scope: project?.poId ? 'PO' : 'PART',
      documents: 'BOM,ROUTING',
      actions: 'UPDATE_BOM,UPDATE_ROUTING',
      projectId: project?.id ?? '',
      projectLabel: project?.projectCode || project?.projectName || project?.id || '',
      proposedChange: revisionLabel
        ? `${revisionLabel}: ${revisionSummary || 'Revise BOM/routing package'}`
        : `Revise BOM/routing package for ${project?.projectCode || project?.projectName || 'this project'}.`,
      reason: revision?.reason || 'Project BOM/routing revision requires controlled production change review.',
      notes: [
        project?.id ? `Project ID: ${project.id}` : '',
        revision?.id ? `Project revision ID: ${revision.id}` : '',
        revisionLabel ? `Project revision: ${revisionLabel}` : '',
      ].filter(Boolean).join(' | '),
    });
    if (project?.poId) params.set('poId', String(project.poId));
    if (primaryBomRoutingPartNumber) params.set('partNumber', primaryBomRoutingPartNumber);
    if (currentBomRoutingRevision) params.set('currentRevision', currentBomRoutingRevision);
    return `/p2-control-center?${params.toString()}`;
  };
  const recordBomRoutingRevision = (revisionType: 'drawing' | 'contract') => {
    createRevisionMutation.mutate({
      revisionType,
      revisionDate: new Date().toISOString().split('T')[0],
      hasPoChange: false,
      revisedPoNumber: '',
      revisedDueDate: '',
      revisedLineItems: [],
      summary: `${revisionType === 'drawing' ? 'Drawing' : 'Contract'} revision for BOM/routing`,
      reason: `BOM/routing revision started from the P2 Project BOM/Routing summary for ${project?.projectCode || project?.projectName || 'this project'}.`,
      metadata: {
        source: 'project-bom-routing',
        pcfRecommended: true,
        currentBomRoutingRevision,
      },
    } as any);
  };

  const convertSourcePartMutation = useMutation({
    mutationFn: (sourcePart: any) =>
      apiRequest(`/api/projects/${id}/p2-hub/source-parts/inventory-item`, {
        method: 'POST',
        body: {
          poItemId: sourcePart.poItemId ?? null,
          partNumber: sourcePart.partNumber,
          partName: sourcePart.partName || sourcePart.inventoryName || sourcePart.partNumber,
          internalPartNumber: sourcePart.internalPartNumber || null,
          manufacturedCategory: sourcePart.manufacturedCategory || 'COMPONENT',
        },
      }),
    onSuccess: (data: any) => {
      const agPartNumber = data?.inventoryItem?.agPartNumber ?? data?.inventoryItem?.ag_part_number;
      const isNonInventory =
        data?.inventoryItem?.utilizedInNonInventory === true ||
        data?.inventoryItem?.utilized_in_non_inventory === true;
      toast({
        title: data?.created ? 'AG inventory item created' : 'AG inventory item updated',
        description: isNonInventory && agPartNumber
          ? `${agPartNumber} is linked as a non-inventory item.`
          : agPartNumber
          ? `${agPartNumber} is now linked as a manufactured source part.`
          : 'The source part is now linked as a manufactured inventory item.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'p2-hub'] });
      queryClient.invalidateQueries({ queryKey: ['/api/enhanced/inventory/items'] });
    },
    onError: (err: any) => {
      toast({
        title: 'Source part update failed',
        description: err?.message || 'Could not convert this source part to manufactured AG inventory.',
        variant: 'destructive',
      });
    },
  });
  const updateSourcePartInternalNumber = (rowKey: string, value: string) => {
    setSourcePartInternalNumbers((prev) => ({ ...prev, [rowKey]: value }));
  };

  const linkSourcePartToInternalNumber = (sourcePart: any, rowKey: string) => {
    const internalPartNumber = (sourcePartInternalNumbers[rowKey] ?? sourcePart.agPartNumber ?? '').trim();
    convertSourcePartMutation.mutate({
      ...sourcePart,
      internalPartNumber,
    });
  };
  const hubPo = hubTabs.po ?? {};
  const currentProjectPo = hubPo.currentPo ?? linkedProjectPO ?? projectP2POs[0] ?? null;
  const currentPoLineItems = Array.isArray(hubPo.lineItems) ? hubPo.lineItems : [];
  const poRevisionFamily = Array.isArray(hubPo.revisionFamily) ? hubPo.revisionFamily : projectP2POs;
  const poAuditRevisions = (Array.isArray(hubPo.projectRevisions) && hubPo.projectRevisions.length > 0
    ? hubPo.projectRevisions
    : projectRevisions.filter((revision: any) => {
        const type = String(revision.revision_type ?? revision.revisionType ?? '').toLowerCase();
        return type === 'po' || type === 'po_link_change';
      }));
  const currentPoNumber = currentProjectPo?.po_number ?? currentProjectPo?.poNumber ?? null;
  const currentPoStatus = currentProjectPo?.status ?? 'Unknown';
  const currentPoCustomer = currentProjectPo?.customer_name ?? currentProjectPo?.customerName ?? project?.customer?.name ?? project?.customerId ?? 'Not set';
  const currentPoDueDate = currentProjectPo?.expected_delivery ?? currentProjectPo?.expectedDelivery ?? null;
  const currentPoRevisionNumber = Number(currentProjectPo?.revision_number ?? 0);
  const formatDateLabel = (value: unknown, fallback = 'Not set') => {
    if (!value) return fallback;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? fallback : format(date, 'MMM d, yyyy');
  };
  const formatCurrencyLabel = (value: unknown, fallback = 'Pending') => {
    if (value === null || value === undefined || value === '') return fallback;
    const amount = Number(value);
    return Number.isFinite(amount)
      ? amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
      : fallback;
  };
  const formatHoursLabel = (value: unknown, fallback = 'Pending') => {
    if (value === null || value === undefined || value === '') return fallback;
    const hours = Number(value);
    return Number.isFinite(hours) ? `${hours.toLocaleString()} hrs` : fallback;
  };
  const coverageStatusLabels: Record<string, string> = {
    attached: 'Attached',
    covered_by_project_data: 'Covered by project data',
    needs_upload: 'Needs upload',
    needs_setup: 'Needs setup',
    needs_clarification: 'Needs clarification',
    not_applicable: 'Not applicable',
  };
  const coverageStatusClass = (status: string) => {
    switch (status) {
      case 'attached':
      case 'covered_by_project_data':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'needs_upload':
      case 'needs_setup':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'needs_clarification':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'not_applicable':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };
  const coverageStatusIcon = (status: string) => {
    if (status === 'attached') return <Paperclip className="h-4 w-4" />;
    if (status === 'covered_by_project_data' || status === 'not_applicable') return <CheckCircle2 className="h-4 w-4" />;
    return <AlertCircle className="h-4 w-4" />;
  };
  const formatQuantityLabel = (value: unknown) => {
    const quantity = Number(value ?? 0);
    return Number.isFinite(quantity) ? quantity.toLocaleString() : '0';
  };
  const romSummary = hubRom.summary ?? {};
  const romDraft = hubRom.draft ?? null;
  const romLockState = hubRom.lockState ?? { locked: Boolean(romSummary.locked), reason: romSummary.lockedReason ?? null };
  const isRomLocked = Boolean(romLockState.locked || romSummary.locked);
  const getRomCategoryValue = (categoryKey: RomCategoryKey, field: RomCategoryField) => {
    const value = hubRom.categories?.[categoryKey]?.[field];
    return value === null || value === undefined ? '' : String(value);
  };
  const buildRomFormFromHub = () => {
    const categories = ROM_CATEGORY_CONFIG.reduce((acc, category) => {
      acc[category.key] = { [category.field]: getRomCategoryValue(category.key, category.field) };
      return acc;
    }, {} as Record<string, Record<string, string>>);
    return {
      summary: romSummary.draftSummary ?? romDraft?.summary ?? '',
      assumptions: romSummary.assumptions ?? romDraft?.assumptions ?? '',
      riskNotes: romSummary.riskNotes ?? romDraft?.risk_notes ?? romDraft?.riskNotes ?? '',
      categories,
    };
  };
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
  const { data: pmLaborSummary } = useQuery<any>({
    queryKey: ['/api/pm-dashboard', id, 'labor'],
    queryFn: () => fetch(`/api/pm-dashboard/${id}/labor`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!id,
  });
  const linkedProjectQuoteId =
    projectSteps.find((step) => step.stepType === 'quote')?.linkedQuoteId ??
    quoteFeedback?.quoteId ??
    hubLabor.quoteFeedback?.quoteId ??
    hubLabor.quoteFeedback?.quote_id ??
    null;

  useEffect(() => {
    const hydrateKey = `${id ?? ''}:${romDraft?.id ?? 'default'}:${romSummary.updatedAt ?? ''}:${JSON.stringify(hubRom.categories ?? {})}`;
    if (!id || hydrateKey === romFormHydratedKey) return;
    setRomForm(buildRomFormFromHub());
    setRomFormHydratedKey(hydrateKey);
  }, [id, romDraft?.id, romSummary.updatedAt, hubRom.categories, romFormHydratedKey]);

  const saveRomMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/projects/${id}/rom-draft`, {
        method: 'PATCH',
        body: {
          summary: romForm.summary,
          assumptions: romForm.assumptions,
          riskNotes: romForm.riskNotes,
          categories: romForm.categories,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'p2-hub'] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders/project', id] });
      toast({ title: 'ROM draft saved', description: 'WAD creation will use the updated ROM values.' });
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id, 'p2-hub'] });
      toast({ title: 'ROM save failed', description: err?.message || 'The ROM may be locked after award.', variant: 'destructive' });
    },
  });

  const romCategories = [
    {
      label: 'Labor',
      value: formatHoursLabel(hubRom.categories?.labor?.quotedHours ?? quoteFeedback?.quotedLaborHours),
      detail: 'Direct labor estimate from ROM/quote feedback',
    },
    {
      label: 'Material',
      value: formatCurrencyLabel(hubRom.categories?.material?.budgetAmount, 'Not set'),
      detail: 'Material budget from WAD/project work orders',
    },
    { label: 'Outside Processing', value: formatCurrencyLabel(hubRom.categories?.outsideProcessing?.budgetAmount), detail: 'Vendor services and outside operations' },
    { label: 'NRC / Tooling / Design', value: formatCurrencyLabel(hubRom.categories?.nrc?.budgetAmount), detail: 'Non-recurring cost, tooling, and design labor' },
    { label: 'Capital', value: formatCurrencyLabel(hubRom.categories?.capital?.budgetAmount), detail: 'Assets, startup services, and startup labor' },
    { label: 'G&A', value: formatCurrencyLabel(hubRom.categories?.generalAndAdmin?.budgetAmount), detail: 'General and administrative burden' },
    { label: 'Overhead', value: formatCurrencyLabel(hubRom.categories?.overhead?.budgetAmount), detail: 'Indirect cost burden' },
    { label: 'Quality and Compliance', value: formatCurrencyLabel(hubRom.categories?.qualityAndCompliance?.budgetAmount), detail: 'Inspection, compliance, and quality planning' },
    { label: 'Shipping and Packaging', value: formatCurrencyLabel(hubRom.categories?.shippingAndPackaging?.budgetAmount), detail: 'Pack, ship, freight, and documentation' },
    { label: 'Contingency', value: formatCurrencyLabel(hubRom.categories?.contingency?.budgetAmount), detail: 'Risk reserve' },
    { label: 'Escalation and Inflation', value: formatCurrencyLabel(hubRom.categories?.escalationAndInflation?.budgetAmount), detail: 'Schedule and pricing escalation' },
    { label: 'Profit / Fee', value: formatCurrencyLabel(hubRom.categories?.profitFee?.budgetAmount), detail: 'Quote profit or fee target' },
  ];

  const { data: projectFarFlowdownsRaw } = useQuery<ProjectFarFlowdown[]>({
    queryKey: ['/api/far-flowdown-clauses/project', id],
    queryFn: () => fetch(`/api/far-flowdown-clauses/project/${id}`).then(r => r.json()),
    enabled: !!id,
  });
  const projectFarFlowdowns = normalizeArray<ProjectFarFlowdown>(projectFarFlowdownsRaw);

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
    id: number | string; project_id: string; label: string | null; original_file_name: string;
    file_name: string | null; mime_type: string; file_size: number | null;
    media_library_id: number | null; uploaded_by: string | null; created_at: string;
    source?: 'manual' | 'work_instruction' | 'spec_sheet';
    document_type?: string | null;
    part_number?: string | null;
    department_name?: string | null;
    has_file?: boolean;
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

  const { data: projectDocsRaw } = useQuery<ProjectDoc[]>({
    queryKey: ['/api/projects', id, 'documents'],
    queryFn: () => fetch(`/api/projects/${id}/documents`).then(r => r.json()),
    enabled: !!id,
  });
  const projectDocs = normalizeArray<ProjectDoc>(projectDocsRaw);
  const manufacturingProjectDocs = projectDocs.filter((doc) => doc.source === 'work_instruction' || doc.source === 'spec_sheet');
  const manualProjectDocs = projectDocs.filter((doc) => !doc.source || doc.source === 'manual');

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
      return apiRequest(`/api/project-step-attachments/${attachmentId}`, {
        method: 'DELETE',
      });
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
    const invalidateAttachmentQueries = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-step-attachments', selectedStep.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-step-attachments/by-project', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
    };
    const uploadProjectStepAttachment = async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', project.id);
      formData.append('stepId', selectedStep.id);
      if (uploadNotes) formData.append('notes', uploadNotes);

      return apiRequest('/api/project-step-attachments/local-upload', {
        method: 'POST',
        body: formData,
      });
    };

    try {
      await uploadProjectStepAttachment();
      invalidateAttachmentQueries();
      setUploadNotes('');
      toast({ title: 'Document uploaded', description: `${file.name} has been attached to this step.` });
    } catch (error: any) {
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

  const getStepFormRoute = (step: ProjectStep, preferLinkedRecord = false) => {
    const config = STEP_CONFIG[step.stepType];
    if (!config?.route) return null;

    const linkedId = getLinkedId(step);
    const params = new URLSearchParams();

    if (preferLinkedRecord && linkedId) {
      switch (step.stepType) {
        case 'rfq_risk_assessment':
        case 'quote':
        case 'purchase_review_checklist':
        case 'preproduction_checklist':
          params.set('id', String(linkedId));
          break;
        case 'p2_order':
          params.set('tab', 'status');
          params.set('poId', String(linkedId));
          break;
      }
    }

    switch (step.stepType) {
      case 'purchase_review_checklist':
        params.set('projectId', project.id);
        if (project.customerId) params.set('customerId', project.customerId);
        break;
      case 'preproduction_checklist':
        params.set('projectId', project.id);
        if (project.projectName) params.set('projectName', project.projectName);
        if ((project as any).poNumber) params.set('poNumber', (project as any).poNumber);
        break;
      case 'rfq_risk_assessment':
        params.set('projectId', project.id);
        params.set('projectStepId', step.id);
        if (step.status === 'completed') params.set('intent', 'view');
        if (project.customerId) params.set('customerId', project.customerId);
        break;
      case 'quote':
        if (!params.has('id') && project.customerId) params.set('customerId', project.customerId);
        break;
    }

    const query = params.toString();
    return query ? `${config.route}?${query}` : config.route;
  };

  const completedFormSummaries = (Array.isArray(hubTabs.workflow?.completedForms)
    ? hubTabs.workflow.completedForms
    : projectSteps.filter(step => step.status === 'completed')
  )
    .filter((step: ProjectStep) => step.status === 'completed')
    .sort((a: ProjectStep, b: ProjectStep) => a.stepOrder - b.stepOrder)
    .map((step: ProjectStep) => {
      const attachments = getAttachmentsForStep(step.id);
      const linkedId = getLinkedId(step);
      const route = getStepFormRoute(step, true);
      return {
        step,
        label: STEP_CONFIG[step.stepType]?.label || step.stepType,
        completedBy: step.completedByDisplayName || 'Unknown',
        completedAt: step.completedAt,
        attachments,
        linkedId,
        route,
      };
    });

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

      {isLegacyWorkflow && <>
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
      </>}
      {isLegacyWorkflow && project && ['purchase_review', 'po_received', 'p2_release'].includes(project.currentStage || '') && (
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
                  {['PO Review', 'WAD (Working Authorization Document)', 'Preproduction'].map(label => (
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

      {isP2V2Workflow && (
        <Card className="border-blue-200 bg-blue-50/60" data-testid="v2-release-gate-future">
          <CardContent className="p-4 text-sm text-blue-800">
            P2 V2 production release is read-only in this phase. The V2 release gate will be enabled in a later controlled phase.
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

      <Tabs value={activeTab} onValueChange={changeProjectTab} className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="workflow" data-testid="tab-workflow">Workflow</TabsTrigger>
          <TabsTrigger value="document-coverage" data-testid="tab-document-coverage">Document Coverage</TabsTrigger>
          <TabsTrigger value="po" data-testid="tab-po">
            <Receipt className="h-4 w-4 mr-1.5" />
            PO
          </TabsTrigger>
          <TabsTrigger value="bom-routing" data-testid="tab-bom-routing">BOM/Routing</TabsTrigger>
          <TabsTrigger value="wad" data-testid="tab-wad">WAD</TabsTrigger>
          <TabsTrigger value="rom" data-testid="tab-rom">ROM</TabsTrigger>
          <TabsTrigger value="production" data-testid="tab-production">Production</TabsTrigger>
          <TabsTrigger value="material" data-testid="tab-material">Material</TabsTrigger>
          <TabsTrigger value="labor" data-testid="tab-labor">Labor</TabsTrigger>
          <TabsTrigger value="traceability" data-testid="tab-traceability">Traceability</TabsTrigger>
          <TabsTrigger value="shipping-invoicing" data-testid="tab-shipping-invoicing">Shipping/Invoicing</TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="space-y-4">
          {isP2V2Workflow ? (
            <P2V2ProjectWorkflow projectId={project.id} />
          ) : hasUnknownWorkflowVersion ? (
            <Card className="border-red-300" data-testid="workflow-version-configuration-error">
              <CardHeader><CardTitle>Workflow configuration error</CardTitle></CardHeader>
              <CardContent className="text-sm text-red-700">
                This project has an unsupported workflow version. Legacy workflow controls are disabled.
              </CardContent>
            </Card>
          ) : (
          <>
          {/* Inline Workflow Action Cards */}
          {(() => {
            const purchaseStep = projectSteps.find(s => s.stepType === 'purchase_review_checklist');
            const wadStep = projectSteps.find(s => s.stepType === 'p2_order');
            const preprodStep = projectSteps.find(s => s.stepType === 'preproduction_checklist');
            const projectWorkOrder = projectWorkOrders[0];
            const wadStatusOverride = WAD_WORKFLOW_STATUS_OVERRIDES[
              String(projectWorkOrder?.status ?? '').toUpperCase()
            ];
            const wadRoute = projectWorkOrder
              ? `/work-orders/${projectWorkOrder.id}/wizard`
              : `/wad-wizard?search=${encodeURIComponent(project.projectCode || project.projectName || project.id)}`;

            const actionCards = [
              {
                key: 'purchase_review',
                title: 'Purchase Review Checklist',
                description: 'Verify PO terms, pricing, and contract requirements before authorizing work.',
                step: purchaseStep,
                route: purchaseStep
                  ? getStepFormRoute(purchaseStep, true) || `/purchase-review-checklist?projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`
                  : `/purchase-review-checklist?projectId=${encodeURIComponent(project.id)}${project.customerId ? `&customerId=${encodeURIComponent(project.customerId)}` : ''}`,
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
                statusOverride: wadStatusOverride,
              },
              {
                key: 'preprod',
                title: 'Pre-Production Checklist',
                description: 'Confirm drawings, materials, tooling, and task assignments are ready before production release.',
                step: preprodStep,
                route: preprodStep
                  ? getStepFormRoute(preprodStep, true) || `/preproduction-checklists?projectId=${encodeURIComponent(project.id)}${project.projectName ? `&projectName=${encodeURIComponent(project.projectName)}` : ''}${(project as any).poNumber ? `&poNumber=${encodeURIComponent((project as any).poNumber)}` : ''}`
                  : `/preproduction-checklists?projectId=${encodeURIComponent(project.id)}${project.projectName ? `&projectName=${encodeURIComponent(project.projectName)}` : ''}${(project as any).poNumber ? `&poNumber=${encodeURIComponent((project as any).poNumber)}` : ''}`,
                icon: <ClipboardList className="h-5 w-5 text-green-600" />,
                gateLabel: 'Gate to P2 Production',
              },
            ];

            const getStepBadge = (step: ProjectStep | undefined, statusOverride?: string) => {
              const status = statusOverride ?? step?.status;
              if (!status) return null;
              const colors: Record<string, string> = {
                released: 'bg-green-100 text-green-800',
                completed: 'bg-green-100 text-green-800',
                in_progress: 'bg-blue-100 text-blue-800',
                pending: 'bg-gray-100 text-gray-600',
                blocked: 'bg-red-100 text-red-800',
              };
              const labels: Record<string, string> = {
                released: 'Released',
                completed: 'Complete',
                in_progress: 'In Progress',
                pending: 'Pending',
                blocked: 'Blocked',
              };
              return (
                <Badge className={`${colors[status] || 'bg-gray-100 text-gray-600'} text-xs`}>
                  {labels[status] || status}
                </Badge>
              );
            };

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {actionCards.map((card) => {
                  const status = card.statusOverride ?? card.step?.status;

                  return (
                    <Card key={card.key} className={`border-l-4 ${status === 'completed' || status === 'released' ? 'border-l-green-500' : status === 'in_progress' ? 'border-l-blue-500' : 'border-l-gray-300'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {card.icon}
                            <span className="text-sm font-semibold">{card.title}</span>
                          </div>
                          {getStepBadge(card.step, card.statusOverride)}
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
                  );
                })}
              </div>
            );
          })()}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckSquare className="h-5 w-5 text-green-600" />
                    Completed Form Summaries
                  </CardTitle>
                  <CardDescription>
                    Read-only summary of completed workflow forms and their audit links.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {completedFormSummaries.length} complete
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {completedFormSummaries.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No workflow forms have been completed yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {completedFormSummaries.map((summary) => (
                    <div key={summary.step.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{summary.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {summary.completedAt
                              ? `Completed ${format(new Date(summary.completedAt), 'MMM d, yyyy')}`
                              : 'Completed date unavailable'}
                            {summary.completedBy ? ` by ${summary.completedBy}` : ''}
                          </p>
                        </div>
                        <Badge className="bg-green-100 text-green-800">Complete</Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div className="rounded bg-muted/40 px-2 py-1">
                          <span className="text-muted-foreground">Linked record: </span>
                          <span className="font-medium">{summary.linkedId || 'None'}</span>
                        </div>
                        <div className="rounded bg-muted/40 px-2 py-1">
                          <span className="text-muted-foreground">Attachments: </span>
                          <span className="font-medium">{summary.attachments.length}</span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {summary.route && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(summary.route!)}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View Form
                          </Button>
                        )}
                        {summary.attachments.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleStepExpanded(summary.step.id)}
                          >
                            <Paperclip className="mr-1 h-4 w-4" />
                            Show in Timeline
                          </Button>
                        )}
                      </div>
                      {summary.attachments.length > 0 && (
                        <div className="mt-3 space-y-2 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            Attached documents
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {summary.attachments.map((attachment) => (
                              <Button
                                key={attachment.id}
                                variant="outline"
                                size="sm"
                                className="h-auto max-w-full justify-start py-1.5"
                                onClick={() => setPreviewAttachment({
                                  url: `/api/project-step-attachments/download/${attachment.id}`,
                                  name: attachment.originalFileName,
                                })}
                                title={`Preview ${attachment.originalFileName}`}
                                data-testid={`button-preview-summary-attachment-${attachment.id}`}
                              >
                                <Eye className="mr-1.5 h-4 w-4 shrink-0" />
                                <span className="truncate">Preview {attachment.originalFileName}</span>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

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
                                    const route = getStepFormRoute(step, true);
                                    if (route) setLocation(route);
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
                                    const route = getStepFormRoute(step, true);
                                    if (route) setLocation(route);
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
                                    const route = getStepFormRoute(step);
                                    if (route) setLocation(route);
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
          </>
          )}
        </TabsContent>

        <TabsContent value="document-coverage" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Covered</p>
              <p className="font-medium">
                {documentCoverageSummary.coveredItems ?? documentCoverageItems.filter((item: any) => ['attached', 'covered_by_project_data', 'not_applicable'].includes(item.status)).length}
                {' / '}
                {documentCoverageSummary.totalItems ?? documentCoverageItems.length}
              </p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Needs Attention</p>
              <p className="font-medium">{documentCoverageSummary.needsAttention ?? documentCoverageItems.filter((item: any) => !['attached', 'covered_by_project_data', 'not_applicable'].includes(item.status)).length}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Attached Files</p>
              <p className="font-medium">{documentCoverageSummary.attachedItems ?? documentCoverageItems.filter((item: any) => item.status === 'attached').length}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Project Data Coverage</p>
              <p className="font-medium">{documentCoverageSummary.coveredByProjectData ?? documentCoverageItems.filter((item: any) => item.status === 'covered_by_project_data').length}</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                    Required Document Coverage
                  </CardTitle>
                  <CardDescription>
                    Shows whether each WAD/customer requirement is attached, covered by Epoch project data, or still needs setup.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setLocation(latestWad?.id ? `/work-orders/${latestWad.id}/wad-summary` : `/wad-wizard?search=${encodeURIComponent(project.projectCode || project.projectName || project.id)}`)}
                  data-testid="button-open-wad-from-coverage"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open WAD
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {documentCoverageItems.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  Coverage data is still loading or unavailable for this project.
                </div>
              ) : (
                <div className="space-y-3">
                  {documentCoverageItems.map((item: any) => {
                    const missingParts = Array.isArray(item.missingParts) ? item.missingParts : [];
                    const missingPartDescriptions = item.missingPartDescriptions ?? {};
                    return (
                      <div key={item.key} className="rounded-md border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{item.label}</p>
                              <Badge variant="outline" className={coverageStatusClass(item.status)}>
                                <span className="mr-1">{coverageStatusIcon(item.status)}</span>
                                {coverageStatusLabels[item.status] ?? item.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{item.detail}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {typeof item.relatedCount === 'number' && (
                              <Badge variant="secondary">{item.relatedCount} source{item.relatedCount === 1 ? '' : 's'}</Badge>
                            )}
                            {item.route && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocation(item.route)}
                                data-testid={`button-open-coverage-${item.key}`}
                              >
                                <ExternalLink className="h-4 w-4 mr-1.5" />
                                Open
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-2 py-1">Source: {item.source || 'Project record'}</span>
                          {missingParts.slice(0, 8).map((part: string) => {
                            const description = missingPartDescriptions[part];
                            return (
                              <span
                                key={part}
                                className="rounded bg-amber-50 px-2 py-1 text-amber-800"
                                title={description || undefined}
                                aria-label={description ? `Missing: ${part}. ${description}` : undefined}
                              >
                                Missing: {part}
                              </span>
                            );
                          })}
                          {missingParts.length > 8 && (
                            <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">
                              +{missingParts.length - 8} more
                            </span>
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

        <TabsContent value="bom-routing" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">BOMs</p>
              <p className="font-medium">{bomRoutingSummary.bomCount ?? bomRoutingRecords.length}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Routings</p>
              <p className="font-medium">{bomRoutingSummary.routingCount ?? bomRoutingRoutings.length}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Manufactured Lines</p>
              <p className="font-medium">{bomRoutingSummary.manufacturedLineCount ?? currentPoLineItems.length}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Change Links</p>
              <p className="font-medium">{bomRoutingChangeLinks.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(project.id)}${project.projectName ? `&projectName=${encodeURIComponent(project.projectName)}` : ''}${project.poId ? `&poId=${encodeURIComponent(String(project.poId))}` : ''}`)}
              data-testid="button-open-project-bom-routing-setup"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open P2 BOM Setup
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/estimating/bom-drafts')}
              data-testid="button-open-project-draft-bom-builder"
            >
              <Layers className="h-4 w-4 mr-2" />
              Draft Builder
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/robust-bom')}
              data-testid="button-open-project-robust-bom"
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Robust BOM
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation('/p2-control-center?tab=routing')}
              data-testid="button-open-project-routing"
            >
              <ListChecks className="h-4 w-4 mr-2" />
              Routing
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation(buildBomRoutingPcfUrl())}
              data-testid="button-start-project-bom-routing-pcf"
            >
              <FileText className="h-4 w-4 mr-2" />
              Start PCF
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4" />
                Controlled BOM/Routing Revision
              </CardTitle>
              <CardDescription>
                Record the drawing or contract revision that drives the BOM/routing update, then start the linked production change form.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Current Package</p>
                  <p className="font-medium">{currentBomRoutingRevision || 'No revision recorded'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Primary Part</p>
                  <p className="font-mono font-medium">{primaryBomRoutingPartNumber || 'Not found'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Revision Links</p>
                  <p className="font-medium">{bomRoutingChangeLinks.length}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button
                  variant="outline"
                  onClick={() => recordBomRoutingRevision('drawing')}
                  disabled={createRevisionMutation.isPending}
                  data-testid="button-record-project-bom-drawing-revision"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Drawing Revision
                </Button>
                <Button
                  variant="outline"
                  onClick={() => recordBomRoutingRevision('contract')}
                  disabled={createRevisionMutation.isPending}
                  data-testid="button-record-project-bom-contract-revision"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Contract Revision
                </Button>
                <Button
                  onClick={() => setLocation(buildBomRoutingPcfUrl())}
                  data-testid="button-start-project-bom-routing-linked-pcf"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Start Production Change Form
                </Button>
              </div>
            </CardContent>
          </Card>

          {(bomRoutingSourceParts.length > 0 || bomRoutingPartNumbers.length > 0) && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="h-4 w-4" />
                  Source Parts
                </CardTitle>
                <CardDescription>PO source parts used to find BOM/routing records and link manufactured AG inventory items.</CardDescription>
              </CardHeader>
              <CardContent>
                {bomRoutingSourceParts.length > 0 ? (
                  <div className="space-y-3">
                    {bomRoutingSourceParts.map((sourcePart: any) => {
                      const rowKey = sourcePart.poItemId ?? sourcePart.partNumber;
                      const isLinkedManufactured = Boolean(sourcePart.agPartNumber && sourcePart.isManufactured);
                      const isLinkedNonInventory = Boolean(sourcePart.agPartNumber && sourcePart.isNonInventory);
                      const internalPartInput = sourcePartInternalNumbers[String(rowKey)] ?? sourcePart.agPartNumber ?? '';
                      return (
                        <div key={rowKey} className="rounded-md border p-3">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,300px)_auto] lg:items-start">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-semibold">{sourcePart.partNumber || 'Unknown source'}</span>
                                {sourcePart.quantity !== undefined && (
                                  <Badge variant="outline">Qty {formatQuantityLabel(sourcePart.quantity)}</Badge>
                                )}
                                {isLinkedNonInventory ? (
                                  <Badge className="bg-orange-100 text-orange-800">Non-inventory AG item</Badge>
                                ) : isLinkedManufactured ? (
                                  <Badge className="bg-green-100 text-green-800">Manufactured AG item</Badge>
                                ) : sourcePart.agPartNumber ? (
                                  <Badge variant="secondary">AG item linked</Badge>
                                ) : (
                                  <Badge variant="outline">PO source</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {sourcePart.partName || sourcePart.inventoryName || 'No part name'}
                              </p>
                              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="rounded bg-muted px-2 py-1">
                                  AG inventory: <span className="font-mono">{sourcePart.agPartNumber || 'Not linked'}</span>
                                </span>
                                {!isLinkedNonInventory && (
                                  <span className="rounded bg-muted px-2 py-1">
                                    Category: {sourcePart.manufacturedCategory || (sourcePart.isManufactured ? 'Component default' : 'Not manufactured')}
                                  </span>
                                )}
                                {sourcePart.bomAuthority?.released ? (
                                  <span className="rounded bg-green-50 px-2 py-1 text-green-800" data-testid={`source-part-bom-linked-${rowKey}`}>
                                    Robust BOM: Rev {sourcePart.bomAuthority.revisionCode || 'released'} linked
                                  </span>
                                ) : (
                                  <span className="rounded bg-amber-50 px-2 py-1 text-amber-800" data-testid={`source-part-bom-missing-${rowKey}`}>
                                    Robust BOM: {sourcePart.bomAuthority?.lifecycleStatus === 'DRAFT' ? 'release required' : 'not linked'}
                                  </span>
                                )}
                              </div>
                              {sourcePart.agPartNumber && sourcePart.bomAuthority?.message && (
                                <p className="text-xs text-muted-foreground">
                                  {sourcePart.bomAuthority.message}
                                </p>
                              )}
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor={`source-part-internal-${rowKey}`} className="text-xs">
                                Internal AG part #
                              </Label>
                              <Input
                                id={`source-part-internal-${rowKey}`}
                                value={internalPartInput}
                                onChange={(event) => updateSourcePartInternalNumber(String(rowKey), event.target.value)}
                                placeholder="Enter AG part #"
                                className="h-9 font-mono"
                                data-testid={`input-source-part-internal-${sourcePart.poItemId ?? sourcePart.partNumber}`}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 lg:justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => linkSourcePartToInternalNumber(sourcePart, String(rowKey))}
                                disabled={convertSourcePartMutation.isPending || !sourcePart.partNumber || !internalPartInput.trim()}
                                data-testid={`button-link-source-part-internal-${sourcePart.poItemId ?? sourcePart.partNumber}`}
                              >
                                {convertSourcePartMutation.isPending ? (
                                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                                ) : (
                                  <LinkIcon className="h-4 w-4 mr-1.5" />
                                )}
                                Link AG Part
                              </Button>
                              <Button
                                variant={isLinkedManufactured || isLinkedNonInventory ? 'outline' : 'default'}
                                size="sm"
                                onClick={() => convertSourcePartMutation.mutate(sourcePart)}
                                disabled={convertSourcePartMutation.isPending || !sourcePart.partNumber || isLinkedNonInventory}
                                data-testid={`button-convert-source-part-${sourcePart.poItemId ?? sourcePart.partNumber}`}
                              >
                                {convertSourcePartMutation.isPending ? (
                                  <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
                                ) : (
                                  <Edit className="h-4 w-4 mr-1.5" />
                                )}
                                {isLinkedNonInventory ? 'Non-Inventory' : isLinkedManufactured ? 'Refresh Link' : 'Create AG Item'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {bomRoutingPartNumbers.map((partNumber: string) => (
                      <Badge key={partNumber} variant="outline" className="font-mono">
                        {partNumber}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <Accordion type="single" collapsible className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <AccordionItem value="assembly-tree" className="border-0">
                  <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <Layers className="h-5 w-5" />
                        Assembly Tree
                      </div>
                      <p className="text-sm font-normal text-muted-foreground">
                        Build flow from each PO assembly through manufactured children and component parts.
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
                    {bomAssemblyTree.length === 0 ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        {bomRoutingSourceParts.some((part: any) => part.agPartNumber)
                          ? 'No released Robust BOM hierarchy is available for the linked AG parts. Open Robust BOM, confirm the inventory item identity, and release the applicable revision.'
                          : 'Link each PO source part to its AG inventory item to resolve the Robust BOM and build the assembly tree.'}
                      </div>
                    ) : (
                      <div className="space-y-4 rounded-md bg-muted/30 p-3">
                        {bomAssemblyTree.map((root: any) => (
                          <BomAssemblyTreeNode key={root.key} node={root} isRoot />
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Accordion type="single" collapsible className="rounded-lg border bg-card text-card-foreground shadow-sm">
                <AccordionItem value="bom-records" className="border-0">
                  <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold">
                        <Layers className="h-5 w-5" />
                        BOM Records
                      </div>
                      <p className="text-sm font-normal text-muted-foreground">
                        BOMs for the manufactured PO part and every manufactured child assembly.
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-6">
                    {bomRoutingRecords.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No BOM records are linked to the manufactured PO parts yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {bomRoutingRecords.map((bom: any) => (
                          <div key={bom.id} className="rounded-md border p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-mono font-semibold">{bom.parent_part_ag_number ?? bom.code ?? 'Unknown part'}</p>
                                <p className="truncate text-sm text-muted-foreground">{bom.description || 'No BOM description'}</p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={bom.is_active ? 'default' : 'secondary'}>{bom.is_active ? 'Active' : 'Inactive'}</Badge>
                                {bom.latest_rev_code && <Badge variant="outline">Rev {bom.latest_rev_code}</Badge>}
                              </div>
                            </div>
                            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                              <span>Lines: {Number(bom.line_count ?? 0).toLocaleString()}</span>
                              <span>Revision ID: {bom.latest_revision_id ?? 'None'}</span>
                              <span>Created: {formatDateLabel(bom.latest_rev_created_at, 'No revision date')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5" />
                  Routing Records
                </CardTitle>
                <CardDescription>
                  Active and historical part routings associated with the project or PO part numbers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {bomRoutingRoutings.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No part routings are linked to the project or PO parts yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bomRoutingRoutings.map((routing: any) => (
                      <div key={routing.id} className="rounded-md border p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono font-semibold">{routing.part_number ?? 'Unspecified part'}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {routing.routing_name || routing.part_name || 'Unnamed routing'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={routing.is_active ? 'default' : 'secondary'}>{routing.is_active ? 'Active' : 'Inactive'}</Badge>
                            {routing.routing_revision && <Badge variant="outline">Rev {routing.routing_revision}</Badge>}
                          </div>
                        </div>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                          <span>Type: {routing.routing_type || 'Not set'}</span>
                          <span>Updated: {formatDateLabel(routing.updated_at ?? routing.created_at)}</span>
                          <span>Project: {routing.project_id || 'Part master'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" />
                BOM/Routing Change Links
              </CardTitle>
              <CardDescription>
                Drawing and contract revisions that may drive BOM or routing updates.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bomRoutingChangeLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No drawing or contract change links are recorded yet.</p>
              ) : (
                bomRoutingChangeLinks.map((revision: any) => {
                  const revisionType = String(revision.revision_type ?? revision.revisionType ?? 'Change');
                  return (
                    <div key={revision.id} className="rounded-md border p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">{revision.revision_label ?? revision.revisionLabel}</Badge>
                        <Badge variant="secondary">{revisionType}</Badge>
                        <span className="text-xs text-muted-foreground">{formatDateLabel(revision.created_at ?? revision.createdAt)}</span>
                      </div>
                      <p className="text-sm font-medium">{revision.summary || 'Project change recorded'}</p>
                      {revision.reason && <p className="text-sm text-muted-foreground">{revision.reason}</p>}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(buildBomRoutingPcfUrl(revision))}
                        data-testid={`button-start-pcf-for-bom-routing-revision-${revision.id}`}
                      >
                        <FileText className="h-4 w-4 mr-1.5" />
                        Start linked PCF
                      </Button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wad" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Latest WAD</p>
              <p className="font-medium">{latestWad?.workOrderNumber || 'Not created'}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Total WADs</p>
              <p className="font-medium">{wadSummary.totalWads ?? wadWorkOrders.length}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Released or Beyond</p>
              <p className="font-medium">{wadSummary.releasedOrBeyond ?? 0}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Revision Events</p>
              <p className="font-medium">{wadRevisions.length}</p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5" />
                Current WAD Summary
              </CardTitle>
              <CardDescription>Current WAD summary, project work orders, and WAD revision history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Latest WAD</p>
                  <p className="font-medium">{latestWad?.workOrderNumber || 'Not created'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Total WADs</p>
                  <p className="font-medium">{wadSummary.totalWads ?? wadWorkOrders.length}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Released or Beyond</p>
                  <p className="font-medium">{wadSummary.releasedOrBeyond ?? 0}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setLocation(latestWad?.id ? `/work-orders/${latestWad.id}/wad-summary` : `/wad-wizard?search=${encodeURIComponent(project.projectCode || project.projectName || project.id)}`)}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open WAD
                </Button>
                <Button variant="outline" onClick={() => setLocation(`/pm-control-center?project=${project.id}`)}>
                  <BarChart2 className="h-4 w-4 mr-2" />
                  PM Control Center
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation(latestWad?.id ? `/work-orders/${latestWad.id}/wad-summary?tab=revisions&createRevision=1` : `/wad-wizard?search=${encodeURIComponent(project.projectCode || project.projectName || project.id)}`)}
                  disabled={!latestWad?.id}
                  data-testid="button-add-project-wad-revision"
                >
                  <History className="h-4 w-4 mr-2" />
                  Add WAD Revision
                </Button>
              </div>
              {wadWorkOrders.length > 0 ? (
                <div className="space-y-2">
                  {wadWorkOrders.map((wo: any) => (
                    <div key={wo.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{wo.workOrderNumber}</p>
                        <p className="text-sm text-muted-foreground">{wo.partNumber} · {wo.description || 'WAD'}</p>
                      </div>
                      <Badge variant="secondary">{wo.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No WAD records are linked yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                WAD Revision Events
              </CardTitle>
              <CardDescription>Project revision entries associated with WAD changes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {wadRevisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No WAD revision events have been recorded yet.</p>
              ) : (
                wadRevisions.map((revision: any) => (
                  <div key={revision.id} className="rounded-md border p-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">{revision.revision_label ?? revision.revisionLabel}</Badge>
                      <Badge variant="secondary">WAD</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateLabel(revision.created_at ?? revision.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium">{revision.summary || 'WAD revision recorded'}</p>
                    {revision.reason && <p className="text-sm text-muted-foreground">{revision.reason}</p>}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rom" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Rough Order of Magnitude
              </CardTitle>
              <CardDescription>Quote estimate summary grouped by ROM cost categories.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Quote Feedback</p>
                  <p className="font-medium">{quoteFeedback ? 'Available' : 'Not generated'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Quoted Labor</p>
                  <p className="font-medium">{formatHoursLabel(hubRom.categories?.labor?.quotedHours ?? quoteFeedback?.quotedLaborHours, 'Not set')}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Material Budget</p>
                  <p className="font-medium">{formatCurrencyLabel(hubRom.categories?.material?.budgetAmount, 'Not set')}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Labor Variance</p>
                  <p className="font-medium">{formatHoursLabel(hubLabor.summary?.varianceHours ?? quoteFeedback?.laborHoursVariance)}</p>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {romCategories.map((category) => (
                  <div key={category.label} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{category.label}</p>
                        <p className="text-xs text-muted-foreground">{category.detail}</p>
                      </div>
                      <Badge variant={category.value === 'Pending' || category.value === 'Not set' ? 'outline' : 'secondary'}>
                        {category.value}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {quoteFeedback?.summary && (
                <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-medium">Quote Feedback Summary</p>
                  <p className="text-sm text-muted-foreground">{quoteFeedback.summary}</p>
                </div>
              )}

              <div className="rounded-md border p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">ROM Draft</p>
                    <p className="text-sm text-muted-foreground">
                      Editable until PO/contract award. Saved ROM values auto-fill the WAD when it is created.
                    </p>
                  </div>
                  <Badge variant={isRomLocked ? 'secondary' : 'outline'} className="gap-1">
                    {isRomLocked ? <Lock className="h-3 w-3" /> : <Edit className="h-3 w-3" />}
                    {isRomLocked ? 'Locked after award' : 'Draft editable'}
                  </Badge>
                </div>
                {isRomLocked && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {romLockState.reason || romSummary.lockedReason || 'PO/contract award has locked this ROM.'}
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-3">
                    <Label>ROM summary</Label>
                    <Textarea
                      value={romForm.summary}
                      onChange={(event) => setRomForm((current) => ({ ...current, summary: event.target.value }))}
                      disabled={isRomLocked}
                      placeholder="Scope, pricing basis, and award assumptions"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label>Assumptions</Label>
                    <Textarea
                      value={romForm.assumptions}
                      onChange={(event) => setRomForm((current) => ({ ...current, assumptions: event.target.value }))}
                      disabled={isRomLocked}
                      placeholder="Customer, schedule, material, and routing assumptions"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label>Risk notes</Label>
                    <Textarea
                      value={romForm.riskNotes}
                      onChange={(event) => setRomForm((current) => ({ ...current, riskNotes: event.target.value }))}
                      disabled={isRomLocked}
                      placeholder="Risks that WAD planning should inherit"
                    />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {ROM_CATEGORY_CONFIG.map((category) => (
                    <div key={category.key} className="space-y-2">
                      <Label>{category.label}</Label>
                      <Input
                        type="number"
                        min="0"
                        step={category.kind === 'hours' ? '0.1' : '0.01'}
                        value={romForm.categories[category.key]?.[category.field] ?? ''}
                        onChange={(event) => setRomForm((current) => ({
                          ...current,
                          categories: {
                            ...current.categories,
                            [category.key]: {
                              ...(current.categories[category.key] ?? {}),
                              [category.field]: event.target.value,
                            },
                          },
                        }))}
                        disabled={isRomLocked}
                        placeholder={category.kind === 'hours' ? 'Hours' : 'USD'}
                      />
                      <p className="text-xs text-muted-foreground">{category.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveRomMutation.mutate()}
                    disabled={isRomLocked || saveRomMutation.isPending}
                  >
                    {saveRomMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save ROM Draft
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Actual Labor</p>
                  <p className="font-medium">{formatHoursLabel(hubLabor.summary?.actualHours ?? quoteFeedback?.actualLaborHours)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Quoted Lead Time</p>
                  <p className="font-medium">{quoteFeedback?.quotedLeadTimeDays != null ? `${quoteFeedback.quotedLeadTimeDays} days` : 'Pending'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Actual Lead Time</p>
                  <p className="font-medium">{quoteFeedback?.actualLeadTimeDays != null ? `${quoteFeedback.actualLeadTimeDays} days` : 'Pending'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setLocation(
                    linkedProjectQuoteId
                      ? `/p2-quote-form?id=${encodeURIComponent(linkedProjectQuoteId)}`
                      : `/p2-quote-form?projectId=${encodeURIComponent(project.id)}`
                  )}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Quote
                </Button>
                <Button variant="outline" onClick={() => regenerateFeedbackMutation.mutate()} disabled={regenerateFeedbackMutation.isPending}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${regenerateFeedbackMutation.isPending ? 'animate-spin' : ''}`} />
                  Refresh Quote Feedback
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Production
              </CardTitle>
              <CardDescription>P2 Control Center status, assembly tree, and manufactured work order progress.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">PO Quantity</p>
                  <p className="font-medium">{formatQuantityLabel(productionSummary.orderedQuantity)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">In Production</p>
                  <p className="font-medium">{formatQuantityLabel(Number(productionSummary.serializedQuantity ?? projectSerializedItems.length) - Number(productionSummary.completedQuantity ?? productionSummary.completedSerializedCount ?? 0))}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="font-medium">{formatQuantityLabel(productionSummary.completedQuantity ?? productionSummary.completedSerializedCount)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Remaining on PO</p>
                  <p className="font-medium">{formatQuantityLabel(productionSummary.remainingQuantity)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setLocation('/p2-control-center')}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open P2 Control Center
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/p2-control-center?tab=production&projectId=${encodeURIComponent(project.id)}`)}
                  data-testid="button-open-project-production-orders"
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Production Orders
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/projects/${project.id}?tab=bom-routing`)}
                  data-testid="button-open-project-production-assembly"
                >
                  <ListChecks className="h-4 w-4 mr-2" />
                  BOM/Routing
                </Button>
              </div>
              {Object.keys(productionPlacementCounts).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(productionPlacementCounts).map(([placement, count]) => (
                    <Badge key={placement} variant="outline">
                      {placement}: {formatQuantityLabel(count)}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="space-y-3" data-testid="manufactured-production-items">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">Manufactured BOM Items by Department</h3>
                    <p className="text-sm text-muted-foreground">Only manufactured inventory items are shown here, grouped by the department responsible for their work orders.</p>
                  </div>
                  <Badge variant="secondary">{formatQuantityLabel(manufacturedProductionItems.length)} manufactured items</Badge>
                </div>
                {manufacturedProductionItems.length === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">No manufactured BOM inventory items are available for this project.</p>
                ) : (
                  <Accordion type="multiple" className="space-y-2">
                    {Object.entries(manufacturedItemsByDepartment).map(([department, items]) => (
                      <AccordionItem key={department} value={department} className="rounded-md border px-3">
                        <AccordionTrigger className="hover:no-underline">
                          <span className="flex flex-wrap items-center gap-2 text-left">
                            <span>{department}</span>
                            <Badge variant="outline">{(items as any[]).length} items</Badge>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pb-3">
                          {(items as any[]).map((item: any) => (
                            <div key={item.id} className="rounded-md border bg-background p-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-mono font-semibold">{item.part_number}</p>
                                  <p className="text-sm text-muted-foreground">{item.part_name || 'No description'}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline">Gross demand {formatQuantityLabel(item.gross_required_quantity ?? item.quantity)}</Badge>
                                  {Number(item.inventory_fulfilled_quantity ?? 0) > 0 && (
                                    <Badge variant="secondary">From stock {formatQuantityLabel(item.inventory_fulfilled_quantity)}</Badge>
                                  )}
                                  <Badge variant="outline">Production required {formatQuantityLabel(item.production_required_quantity ?? item.quantity)}</Badge>
                                  <Badge variant={['Completed', 'Stock Fulfilled'].includes(item.progress) ? 'default' : 'secondary'}>{item.progress}</Badge>
                                  <Badge variant="outline">On hand {formatQuantityLabel(item.quantity_on_hand)}</Badge>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {(item.work_orders ?? []).map((workOrder: any) => (
                                  <Badge key={workOrder.id ?? workOrder.workOrderNumber} variant="outline">
                                    {workOrder.workOrderNumber ?? workOrder.work_order_number} · {workOrder.status ?? 'Unknown'}
                                  </Badge>
                                ))}
                                {(item.work_orders ?? []).length === 0 && item.progress !== 'Stock Fulfilled' && <span className="text-xs text-amber-700">Work order has not been provisioned.</span>}
                                {item.progress === 'Stock Fulfilled' && <span className="text-xs text-muted-foreground">Inventory fully covers this manufactured demand; downstream raw material is excluded.</span>}
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold">PO Line Production Placement</h3>
                    <p className="text-sm text-muted-foreground">Current production placement, remaining PO quantity, and work orders by part.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{formatQuantityLabel(productionLinePlacements.length)} PO lines</Badge>
                    <Badge variant="outline">{formatQuantityLabel(productionSummary.workOrderCount ?? wadWorkOrders.length)} work orders</Badge>
                  </div>
                </div>
                {productionLinePlacements.length === 0 ? (
                  <p className="rounded-md border p-3 text-sm text-muted-foreground">No current PO line production placement is available yet.</p>
                ) : (
                  productionLinePlacements.map((line: any) => {
                    const lineWorkOrders = Array.isArray(line.workOrders) ? line.workOrders : [];
                    const lineSerializedItems = Array.isArray(line.serializedItems) ? line.serializedItems : [];
                    const inProductionQuantity = Math.max(0, Number(line.serializedQuantity ?? 0) - Number(line.completedQuantity ?? 0));

                    return (
                      <div key={line.poItemId ?? line.partNumber} className="rounded-md border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold">{line.partNumber ?? 'Unassigned part'}</p>
                            <p className="text-sm text-muted-foreground">{line.partName ?? 'No description'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
                            <div>
                              <p className="text-xs text-muted-foreground">PO Qty</p>
                              <p className="font-medium">{formatQuantityLabel(line.orderedQuantity)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">In Prod</p>
                              <p className="font-medium">{formatQuantityLabel(inProductionQuantity)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Complete</p>
                              <p className="font-medium">{formatQuantityLabel(line.completedQuantity)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Remain</p>
                              <p className="font-medium">{formatQuantityLabel(line.remainingQuantity)}</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {Object.entries(line.placementCounts ?? {}).map(([placement, count]) => (
                            <Badge key={placement} variant={placement === 'Completed' ? 'default' : 'outline'}>
                              {placement}: {formatQuantityLabel(count)}
                            </Badge>
                          ))}
                          {Object.keys(line.placementCounts ?? {}).length === 0 && (
                            <Badge variant="outline">No production placement</Badge>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3 xl:grid-cols-2">
                          <div className="rounded-md border bg-muted/20 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">Serialized / Traveler Status</p>
                              <Badge variant="secondary">{formatQuantityLabel(lineSerializedItems.length)}</Badge>
                            </div>
                            {lineSerializedItems.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No serialized items have been released for this line.</p>
                            ) : (
                              <div className="space-y-2">
                                {lineSerializedItems.slice(0, 5).map((item: any) => (
                                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border bg-background p-2">
                                    <div className="min-w-0">
                                      <p className="truncate font-mono text-sm">{item.serial_number ?? item.serialNumber ?? item.barcode}</p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        Traveler {item.activeTravelerNumber ?? item.traveler_barcode ?? item.travelerBarcode ?? 'not linked'}
                                      </p>
                                    </div>
                                    <Badge variant="outline">{item.productionPlacement ?? item.current_department ?? item.status ?? 'Unknown'}</Badge>
                                  </div>
                                ))}
                                {lineSerializedItems.length > 5 && (
                                  <p className="text-xs text-muted-foreground">+{formatQuantityLabel(lineSerializedItems.length - 5)} more serialized items</p>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="rounded-md border bg-muted/20 p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-sm font-medium">Associated Work Orders</p>
                              <Badge variant="secondary">{formatQuantityLabel(lineWorkOrders.length)}</Badge>
                            </div>
                            {lineWorkOrders.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No WAD/work orders are linked to this part yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {lineWorkOrders.slice(0, 5).map((wo: any) => (
                                  <div key={wo.id ?? wo.workOrderNumber} className="rounded-md border bg-background p-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="truncate font-medium">{wo.workOrderNumber ?? wo.work_order_number}</p>
                                      <Badge variant="outline">{wo.status ?? 'Unknown'}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Qty {formatQuantityLabel(wo.quantity)} - Due {formatDateLabel(wo.dueDate ?? wo.due_date)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                        </div>

                        <div className="mt-3 rounded-md border bg-muted/20 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">Manufacturing Structure</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">BOM driven</Badge>
                              {!hubProduction.manufacturingWorkOrderAction?.completed &&
                                (hasMissingManufacturingWorkOrder(line.manufacturingHierarchy) ||
                                  Boolean(line.manufacturingHierarchy)) && (
                                <Button
                                  size="sm"
                                  disabled={
                                    createManufacturingWorkOrders.isPending ||
                                    !hubProduction.manufacturingWorkOrderAction?.launchId ||
                                    !hubProduction.manufacturingWorkOrderAction?.expectedLaunchDigest ||
                                    !hubProduction.manufacturingWorkOrderAction?.enabled
                                  }
                                  onClick={() => createManufacturingWorkOrders.mutate()}
                                  title={
                                    !hubProduction.manufacturingWorkOrderAction?.launchId ||
                                    !hubProduction.manufacturingWorkOrderAction?.expectedLaunchDigest
                                      ? 'Complete Production Launch before creating manufacturing work orders.'
                                      : !hubProduction.manufacturingWorkOrderAction?.enabled
                                        ? 'Manufacturing work-order creation is not enabled for this deployment yet.'
                                        : undefined
                                  }
                                  data-testid="create-manufacturing-work-orders"
                                >
                                  {createManufacturingWorkOrders.isPending ? 'Creating...' : 'Create Manufacturing Work Orders'}
                                </Button>
                              )}
                            </div>
                          </div>
                          {line.manufacturingHierarchy ? (
                            <>
                              {!hubProduction.manufacturingWorkOrderAction?.completed &&
                                (!hubProduction.manufacturingWorkOrderAction?.launchId ||
                                  !hubProduction.manufacturingWorkOrderAction?.expectedLaunchDigest) && (
                                <p className="mb-2 text-xs text-muted-foreground" data-testid="manufacturing-work-orders-launch-required">
                                  Complete Production Launch before creating manufacturing work orders.
                                </p>
                              )}
                              <ProductionHierarchyNode node={line.manufacturingHierarchy} isRoot />
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No released BOM hierarchy is linked to this PO line.</p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                {assemblyBomRecords.length > 0 && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">BOM Records Available</p>
                    <p className="font-medium">{formatQuantityLabel(assemblyBomRecords.length)}</p>
                  </div>
                )}
              </div>
              {productionLinePlacements.length < 0 && (Array.isArray(hubProduction.productionOrders) && hubProduction.productionOrders.length > 0 ? (
                <div className="space-y-2">
                  {hubProduction.productionOrders.slice(0, 8).map((order: any) => (
                    <div key={order.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{order.order_id}</p>
                        <p className="text-sm text-muted-foreground">{order.sku} · {order.part_name}</p>
                      </div>
                      <Badge variant="secondary">{order.status}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No P2 production orders are linked yet.</p>
              ))}
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <Package className="h-4 w-4" />
                      Assembly Source
                    </h3>
                    <p className="text-sm text-muted-foreground">PO line items and BOM records feeding production.</p>
                  </div>
                  <div className="space-y-3">
                    {assemblyPoItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No PO assembly lines are linked yet.</p>
                    ) : (
                      assemblyPoItems.slice(0, 8).map((item: any) => (
                        <div key={item.id} className="rounded-md border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-mono font-medium">{item.part_number ?? item.partNumber}</p>
                              <p className="text-sm text-muted-foreground">{item.part_name ?? item.partName ?? 'No description'}</p>
                            </div>
                            <Badge variant="outline">Qty {Number(item.quantity ?? 0).toLocaleString()}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                    {assemblyBomRecords.length > 0 && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">BOM Records Available</p>
                        <p className="font-medium">{assemblyBomRecords.length}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="flex items-center gap-2 text-base font-semibold">
                      <Hash className="h-4 w-4" />
                      Serialized Production Status
                    </h3>
                    <p className="text-sm text-muted-foreground">Serialized part progress from P2 traceability records.</p>
                  </div>
                  <div className="space-y-3">
                    {projectSerializedItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No serialized production records are linked yet.</p>
                    ) : (
                      <div className="grid gap-2">
                        {projectSerializedItems.slice(0, 8).map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                            <div className="min-w-0">
                              <p className="font-mono font-medium truncate">{item.serial_number ?? item.serialNumber ?? item.barcode}</p>
                              <p className="text-sm text-muted-foreground truncate">{item.part_number ?? item.partNumber} - {item.part_name ?? item.partName}</p>
                            </div>
                            <Badge variant="secondary">{item.status || item.current_department || 'Unknown'}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="material" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Material
              </CardTitle>
              <CardDescription>Project part list, parts requests, purchasing status, material budget, and receiving evidence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">BOM Purchased Parts</p>
                  <p className="font-medium">{hubMaterial.summary?.purchasedBomPartCount ?? (Array.isArray(hubMaterial.parts) ? hubMaterial.parts.length : 0)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Parts Requests</p>
                  <p className="font-medium">{hubMaterial.summary?.partsRequestCount ?? 0}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Received Materials</p>
                  <p className="font-medium">{hubMaterial.summary?.receivedMaterialCount ?? 0}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Received Cost</p>
                  <p className="font-medium">${Number(hubMaterial.summary?.receivedMaterialCost ?? 0).toLocaleString()}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setLocation(`/inventory/parts-request?projectId=${encodeURIComponent(project.id)}`)}>
                  <Package className="h-4 w-4 mr-2" />
                  Create Parts Request
                </Button>
                <Button variant="outline" onClick={() => setLocation(`/pm-control-center?project=${project.id}`)}>
                  <BarChart2 className="h-4 w-4 mr-2" />
                  Material Budget
                </Button>
              </div>
              {draftPartsRequestLines.length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-semibold">Draft Builder Material Demand</h3>
                    <p className="text-sm text-muted-foreground">Parts/Request lines pushed from the linked Draft Builder draft.</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {draftPartsRequestLines.map((line: any) => (
                      <div key={line.id ?? `${line.agPartNumber}-${line.description}`} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{line.description || line.partName || 'Requested material'}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{line.agPartNumber || line.supplierItemId || line.partNumber || 'No part number'}</p>
                          </div>
                          <Badge variant="outline">Qty {formatQuantityLabel(line.qtyNeeded ?? line.quantity ?? 0)}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {line.supplier ? <span>Supplier: {line.supplier}</span> : null}
                          {line.status ? <span>Status: {line.status}</span> : null}
                          {line.action ? <span>Action: {line.action}</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(hubMaterial.partsRequests) && hubMaterial.partsRequests.length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-semibold">Project Parts Requests</h3>
                    <p className="text-sm text-muted-foreground">Requests already created for this project file.</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {hubMaterial.partsRequests.map((request: any) => (
                      <div key={request.id} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{request.part_name ?? request.partName ?? 'Requested part'}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{request.part_number ?? request.partNumber ?? 'No part number'}</p>
                          </div>
                          <Badge variant="secondary">{request.status ?? 'Requested'}</Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Needed</p>
                            <p className="font-medium">{formatQuantityLabel(request.quantity)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Ordered</p>
                            <p className="font-medium">{formatQuantityLabel(request.qty_ordered ?? request.qtyOrdered)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Received</p>
                            <p className="font-medium">{formatQuantityLabel(request.qty_received ?? request.qtyReceived)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(hubMaterial.parts) && hubMaterial.parts.length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-semibold">BOM Purchased Parts</h3>
                    <p className="text-sm text-muted-foreground">All purchased components required by the active assembly BOM, extended by the ordered assembly quantity.</p>
                  </div>
                  <div className="space-y-2">
                  <Accordion type="multiple" className="space-y-2">
                    {hubMaterial.parts.map((part: any) => {
                      const procurement = part.procurement ?? { status: 'Not Requested', quantity_ordered: 0, quantity_received: 0, quantity_available: 0, quantity_pending_acceptance: 0, po_numbers: [] };
                      const procurementVariant = procurement.status === 'Received'
                        ? 'default'
                        : ['On PO', 'Pending Acceptance', 'Partially Received'].includes(procurement.status)
                          ? 'secondary'
                          : 'outline';
                      return (
                      <AccordionItem key={part.id} value={String(part.id)} className="rounded-md border px-3">
                        <AccordionTrigger className="hover:no-underline">
                          <span className="flex w-full flex-wrap items-center justify-between gap-3 pr-3 text-left">
                            <span>
                              <span className="block font-mono font-medium">{part.part_number}</span>
                              <span className="block text-sm font-normal text-muted-foreground">{part.part_name}</span>
                            </span>
                            <span className="flex flex-wrap gap-2">
                              <Badge variant="outline">Required {formatQuantityLabel(part.quantity)}</Badge>
                              <Badge variant={Number(procurement.quantity_available ?? 0) > 0 ? 'default' : 'secondary'}>
                                Project Available {formatQuantityLabel(procurement.quantity_available)}
                              </Badge>
                              <Badge variant={procurementVariant} data-testid={`procurement-status-${part.part_number}`}>
                                {procurement.status}
                              </Badge>
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 pb-3">
                          <div className="rounded-md border bg-muted/20 p-3 text-sm">
                            <p className="font-medium">Company inventory — information only</p>
                            <p className="text-muted-foreground">
                              On hand {formatQuantityLabel(part.company_quantity_on_hand)} · Available {formatQuantityLabel(part.company_quantity_available)} · Not available to this project without an admin transfer
                            </p>
                          </div>
                          {procurement.status !== 'Not Requested' && (
                            <div className="flex flex-wrap gap-3 rounded-md border bg-muted/20 p-3 text-sm">
                              <span>Ordered <strong>{formatQuantityLabel(procurement.quantity_ordered)}</strong></span>
                              <span>Accepted for project <strong>{formatQuantityLabel(procurement.quantity_received)}</strong></span>
                              <span>Project available <strong>{formatQuantityLabel(procurement.quantity_available)}</strong></span>
                              {Number(procurement.quantity_pending_acceptance ?? 0) > 0 && (
                                <span>Pending PM acceptance <strong>{formatQuantityLabel(procurement.quantity_pending_acceptance)}</strong></span>
                              )}
                              {procurement.po_numbers?.length > 0 && (
                                <span>PO <strong>{procurement.po_numbers.join(', ')}</strong></span>
                              )}
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => setLocation(`/inventory/parts-request?projectId=${encodeURIComponent(project.id)}&create=1&partNumber=${encodeURIComponent(part.part_number)}`)}
                            data-testid={`create-parts-request-${part.part_number}`}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create Part Request
                          </Button>
                        </AccordionContent>
                      </AccordionItem>
                      );
                    })}
                  </Accordion>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parts-request" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Parts / Request
              </CardTitle>
              <CardDescription>
                Review project material demand and create parts requests through the inventory request flow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="font-medium">{project.projectCode}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{project.customer?.name || project.customerId}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Linked PO</p>
                  <p className="font-medium">{project.poId ? `#${project.poId}` : 'Not linked'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setLocation(`/pm-control-center?project=${project.id}`)}
                  data-testid="button-open-project-material-budget"
                >
                  <BarChart2 className="h-4 w-4 mr-2" />
                  Material Budget
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation(`/inventory/parts-request?projectId=${encodeURIComponent(project.id)}`)}
                  data-testid="button-open-project-parts-request"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Parts Request
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Labor
              </CardTitle>
              <CardDescription>
                Project labor budget and direct labor actuals are tracked from the PM Control Center.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Draft Estimate</p>
                  <p className="font-medium">{formatHoursLabel(draftLaborEstimateHours, 'Not pushed')}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Draft Labor Cost</p>
                  <p className="font-medium">{formatCurrencyLabel(draftLaborEstimateCost, 'Not pushed')}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">PM Budget</p>
                  <p className="font-medium">{formatHoursLabel(pmLaborSummary?.summary?.budgetedHours ?? hubLabor.summary?.budgetHours, 'Not set')}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Actual Hours</p>
                  <p className="font-medium">{formatHoursLabel(pmLaborSummary?.summary?.actualHours ?? hubLabor.summary?.actualHours ?? quoteFeedback?.actualLaborHours, 'No actuals')}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="font-medium">{formatHoursLabel(pmLaborSummary?.summary?.remainingHours ?? hubLabor.summary?.varianceHours ?? quoteFeedback?.laborHoursVariance, 'Pending')}</p>
                </div>
              </div>
              {draftLaborEstimateLines.length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-semibold">Draft Direct Labor Estimate</h3>
                    <p className="text-sm text-muted-foreground">Estimated hours expected for the part from the linked Draft Builder draft.</p>
                  </div>
                  <div className="space-y-2">
                    {draftLaborEstimateLines.map((line: any) => {
                      const quantity = Number(line.quantityPerPo ?? 1);
                      const hoursPerPart = Number(line.hoursPerPart ?? 0);
                      const hourlyRate = Number(line.hourlyRate ?? 0);
                      const totalHours = Number.isFinite(quantity) && Number.isFinite(hoursPerPart) ? quantity * hoursPerPart : 0;
                      const totalCost = Number.isFinite(totalHours) && Number.isFinite(hourlyRate) ? totalHours * hourlyRate : 0;
                      return (
                        <div key={line.id ?? `${line.employeeRole}-${line.hoursPerPart}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-5">
                          <div className="md:col-span-2">
                            <p className="font-medium">{line.employeeRole || 'Unassigned role'}</p>
                            <p className="text-xs text-muted-foreground">Draft Builder estimate line</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Hours / Part</p>
                            <p className="font-medium">{formatHoursLabel(line.hoursPerPart, '0 hrs')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Total Hours</p>
                            <p className="font-medium">{formatHoursLabel(totalHours, '0 hrs')}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Ext Labor</p>
                            <p className="font-medium">{formatCurrencyLabel(totalCost, '$0.00')}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Work Orders</p>
                  <p className="font-medium">{projectWorkOrders.length}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Open Labor Sessions</p>
                  <p className="font-medium">{formatQuantityLabel(pmLaborSummary?.summary?.openSessionCount)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Consumed</p>
                  <p className="font-medium">{formatQuantityLabel(pmLaborSummary?.summary?.percentConsumed)}%</p>
                </div>
              </div>
              {Array.isArray(pmLaborSummary?.chargeCodeRows) && pmLaborSummary.chargeCodeRows.length > 0 && (
                <div className="rounded-md border p-4">
                  <div className="mb-3">
                    <h3 className="text-base font-semibold">PM Labor Summary</h3>
                    <p className="text-sm text-muted-foreground">Charge-code budget, actual hours, and remaining time from Project Manager Control Center.</p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {pmLaborSummary.chargeCodeRows.slice(0, 6).map((row: any) => (
                      <div key={row.chargeCodeId ?? row.chargeCode} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.chargeCode ?? 'Unassigned charge code'}</p>
                            <p className="truncate text-xs text-muted-foreground">{row.department || row.taskName || 'Project labor'}</p>
                          </div>
                          <Badge variant={row.isOverrun ? 'destructive' : row.isNearLimit ? 'secondary' : 'outline'}>
                            {formatQuantityLabel(row.percentConsumed)}%
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">Budget</p>
                            <p className="font-medium">{formatHoursLabel(row.budgetedHours, '0 hrs')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Actual</p>
                            <p className="font-medium">{formatHoursLabel(row.actualHours, '0 hrs')}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Remain</p>
                            <p className="font-medium">{formatHoursLabel(row.remainingHours, '0 hrs')}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Project Manager</p>
                  <p className="font-medium">{project.projectManager?.name || 'Not assigned'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Stage</p>
                  <p className="font-medium">{project.currentStage ? STAGE_LABELS[project.currentStage] || project.currentStage : 'Not set'}</p>
                </div>
              </div>
              <Button
                onClick={() => setLocation(`/pm-control-center?project=${project.id}`)}
                data-testid="button-open-project-labor"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Labor Dashboard
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nre" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                NRE (Non-recurring Expenses)
              </CardTitle>
              <CardDescription>
                Non-recurring project costs such as tooling, setup, fixture, and engineering effort.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="font-medium">{project.projectCode}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Quote Comparison</p>
                  <p className="font-medium">{quoteFeedback ? 'Available' : 'Not generated'}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setLocation(`/pm-control-center?project=${project.id}`)}
                  data-testid="button-open-project-nre-costs"
                >
                  <BarChart2 className="h-4 w-4 mr-2" />
                  Project Cost Dashboard
                </Button>
                <Button
                  variant="outline"
                  onClick={() => regenerateFeedbackMutation.mutate()}
                  disabled={regenerateFeedbackMutation.isPending}
                  data-testid="button-refresh-project-nre-feedback"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${regenerateFeedbackMutation.isPending ? 'animate-spin' : ''}`} />
                  {regenerateFeedbackMutation.isPending ? 'Refreshing...' : 'Refresh Quote Comparison'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assembly-tree" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Assembly Tree
              </CardTitle>
              <CardDescription>
                Build structure is driven by the project BOM and production work orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectWorkOrders.length > 0 ? (
                <div className="space-y-2">
                  {projectWorkOrders.map(wo => (
                    <button
                      key={wo.id}
                      onClick={() => setLocation(`/maintenance-events/${wo.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
                      data-testid={`button-assembly-work-order-${wo.id}`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{wo.workOrderNumber}</p>
                        <p className="text-sm text-muted-foreground truncate">{wo.description || 'Production work order'}</p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No production work orders are attached to this project yet.
                </div>
              )}
              <Button
                variant="outline"
                onClick={() => setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(project.id)}${project.poId ? `&poId=${encodeURIComponent(String(project.poId))}` : ''}`)}
                data-testid="button-open-project-assembly-bom"
              >
                <Layers className="h-4 w-4 mr-2" />
                Open BOM Setup
              </Button>
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

        {/* P2 purchase orders assigned to this project */}
        <TabsContent value="po" className="space-y-4">
          <Tabs defaultValue="current-po" className="space-y-4">
            <TabsList className="flex h-auto flex-wrap justify-start">
              <TabsTrigger value="current-po" data-testid="tab-project-current-po">Current PO</TabsTrigger>
              <TabsTrigger value="po-revisions" data-testid="tab-project-po-revisions">Revisions</TabsTrigger>
            </TabsList>

            <TabsContent value="current-po" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Receipt className="h-4 w-4" /> Current PO Summary
                      </CardTitle>
                      <CardDescription>Most recent/current P2 PO revision linked to this project.</CardDescription>
                    </div>
                    {currentProjectPo && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(project.id)}&editPoId=${encodeURIComponent(String(currentProjectPo.id))}`)}
                        data-testid="button-open-current-project-po"
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        View PO
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!currentProjectPo ? (
                    <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
                      <Receipt className="mx-auto h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm font-medium">No current PO linked yet</p>
                      <p className="text-xs">Create or link a P2 PO to start the project PO audit trail.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-5">
                        <div className="rounded-md border bg-muted/30 p-3 md:col-span-2">
                          <p className="text-xs text-muted-foreground">PO Number</p>
                          <p className="font-mono font-semibold text-primary">{currentPoNumber}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Revision</p>
                          <p className="font-medium">Rev {Number.isFinite(currentPoRevisionNumber) ? currentPoRevisionNumber : 0}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Status</p>
                          <p className="font-medium">{currentPoStatus}</p>
                        </div>
                        <div className="rounded-md border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Due Date</p>
                          <p className="font-medium">{formatDateLabel(currentPoDueDate)}</p>
                        </div>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Customer</p>
                        <p className="font-medium">{currentPoCustomer}</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium">Current PO Lines</p>
                          <Badge variant="outline">{currentPoLineItems.length} line{currentPoLineItems.length === 1 ? '' : 's'}</Badge>
                        </div>
                        {currentPoLineItems.length === 0 ? (
                          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                            No line items are available for the current PO revision.
                          </div>
                        ) : (
                          <div className="overflow-x-auto rounded-md border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/50 text-xs text-muted-foreground">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium">Part</th>
                                  <th className="px-3 py-2 text-left font-medium">Description</th>
                                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {currentPoLineItems.map((item: any) => (
                                  <tr key={item.id} className="border-t">
                                    <td className="px-3 py-2 font-mono">{item.part_number ?? item.partNumber ?? 'Unspecified'}</td>
                                    <td className="px-3 py-2">{item.part_name ?? item.partName ?? 'No description'}</td>
                                    <td className="px-3 py-2 text-right">{Number(item.quantity ?? 0).toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right">
                                      {Number(item.unit_price ?? item.unitPrice ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Receipt className="h-4 w-4" /> Project P2 Purchase Orders
                </CardTitle>
                <CardDescription>P2 POs assigned to {project.projectCode}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {projectP2POs.length === 0 ? (
                  <div className="rounded-md border border-dashed p-6 text-center text-muted-foreground">
                    <Receipt className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">No P2 POs assigned yet</p>
                    <p className="text-xs">Enter a PO here or link an existing P2 PO to this project.</p>
                  </div>
                ) : (
                  projectP2POs.map((po) => (
                    <div key={po.id} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1 min-w-0">
                        <p className="font-mono font-semibold text-primary">{po.poNumber}</p>
                        <p className="text-sm text-muted-foreground truncate">{po.customerName}</p>
                        {po.projectName && <p className="text-xs text-muted-foreground truncate">{po.projectName}</p>}
                      </div>
                      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={po.status === 'OPEN' ? 'secondary' : 'default'}>{po.status}</Badge>
                          {project.poId === po.id && <Badge variant="outline">Primary</Badge>}
                          {po.expectedDelivery && (
                            <span className="text-xs text-muted-foreground">
                              Due {format(new Date(po.expectedDelivery), 'MMM d, yyyy')}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(project.id)}&editPoId=${encodeURIComponent(String(po.id))}`)}
                          data-testid={`button-view-project-po-${po.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1.5" />
                          View PO
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4" /> Create P2 PO
                  </CardTitle>
                  <CardDescription>Use the P2 PO wizard with this project pre-selected.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={() => setShowProjectPOWizard(true)}
                    data-testid="button-open-project-po-wizard"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Open P2 PO Wizard
                  </Button>
                </CardContent>
              </Card>

              {!project.poId && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <LinkIcon className="h-4 w-4" /> Link Existing P2 PO
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {suggestedPo && !showManualLink ? (
                      <div className="space-y-3">
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-1">
                          <p className="text-xs font-medium text-blue-700 uppercase">Suggested PO</p>
                          <p className="font-mono font-semibold text-blue-950">{suggestedPo.poNumber}</p>
                          <p className="text-sm text-blue-800">{suggestedPo.customerName}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>PO Item</Label>
                            <Select
                              value={linkPoItemId}
                              onValueChange={(value) => {
                                setLinkPoItemId(value);
                                setLinkBillingBucketId('');
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an item from this PO" />
                              </SelectTrigger>
                              <SelectContent>
                                {poItemOptions.map(item => (
                                  <SelectItem key={item.id} value={item.id.toString()}>
                                    {item.partNumber} - {item.partName} ({item.quantity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>CLIN / Bucket</Label>
                            <Select
                              value={linkBillingBucketId}
                              onValueChange={setLinkBillingBucketId}
                              disabled={!linkPoItemId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={linkPoItemId ? 'Select a bucket from this PO' : 'Choose a PO item first'} />
                              </SelectTrigger>
                              <SelectContent>
                                {billingBucketOptions.map(bucket => (
                                  <SelectItem key={bucket.id} value={bucket.id}>
                                    {bucket.bucketLabel}{bucket.customerPoLine ? ` - ${bucket.customerPoLine}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {linkPoItemId && billingBucketOptions.length === 0 && (
                              <p className="text-xs text-amber-700">No active CLIN/bucket allocations are set up for this PO item.</p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => linkSelectedPo(suggestedPo.id.toString())}
                            disabled={linkPoMutation.isPending || !linkPoItemId || !linkBillingBucketId}
                          >
                            {linkPoMutation.isPending ? 'Linking...' : 'Accept'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowManualLink(true);
                              setLinkPoItemId('');
                              setLinkBillingBucketId('');
                            }}
                          >
                            Choose Different
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {showManualLink && suggestedPo && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground -mb-1"
                            onClick={() => {
                              setShowManualLink(false);
                              setLinkPoId('');
                              setLinkPoItemId('');
                              setLinkBillingBucketId('');
                            }}
                          >
                            Back to suggestion
                          </Button>
                        )}
                        <div className="space-y-2">
                          <Label>Search POs</Label>
                          <Input
                            placeholder="Filter by PO number or customer..."
                            value={linkPoSearch}
                            onChange={(event) => setLinkPoSearch(event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Purchase Order</Label>
                          <Select
                            value={linkPoId}
                            onValueChange={(value) => {
                              setLinkPoId(value);
                              setLinkPoItemId('');
                              setLinkBillingBucketId('');
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a purchase order" />
                            </SelectTrigger>
                            <SelectContent>
                              {p2PurchaseOrderOptions
                                .filter(po => !po.projectId || po.projectId === project.id)
                                .filter(po => {
                                  const q = linkPoSearch.toLowerCase();
                                  return !q || po.poNumber?.toLowerCase().includes(q) || po.customerName?.toLowerCase().includes(q);
                                })
                                .map(po => (
                                  <SelectItem key={po.id} value={po.id.toString()}>
                                    {po.poNumber} - {po.customerName}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>PO Item</Label>
                            <Select
                              value={linkPoItemId}
                              onValueChange={(value) => {
                                setLinkPoItemId(value);
                                setLinkBillingBucketId('');
                              }}
                              disabled={!linkPoId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={linkPoId ? 'Select an item from this PO' : 'Choose a PO first'} />
                              </SelectTrigger>
                              <SelectContent>
                                {poItemOptions.map(item => (
                                  <SelectItem key={item.id} value={item.id.toString()}>
                                    {item.partNumber} - {item.partName} ({item.quantity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>CLIN / Bucket</Label>
                            <Select
                              value={linkBillingBucketId}
                              onValueChange={setLinkBillingBucketId}
                              disabled={!linkPoItemId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={linkPoItemId ? 'Select a bucket from this PO' : 'Choose a PO item first'} />
                              </SelectTrigger>
                              <SelectContent>
                                {billingBucketOptions.map(bucket => (
                                  <SelectItem key={bucket.id} value={bucket.id}>
                                    {bucket.bucketLabel}{bucket.customerPoLine ? ` - ${bucket.customerPoLine}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {linkPoItemId && billingBucketOptions.length === 0 && (
                              <p className="text-xs text-amber-700">No active CLIN/bucket allocations are set up for this PO item.</p>
                            )}
                          </div>
                        </div>
                        <Button
                          disabled={!linkPoId || !linkPoItemId || !linkBillingBucketId || linkPoMutation.isPending}
                          onClick={() => linkSelectedPo(linkPoId)}
                        >
                          {linkPoMutation.isPending ? 'Linking...' : 'Link PO'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
            </TabsContent>

            <TabsContent value="po-revisions" className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="h-4 w-4" />
                      PO Revision Audit Trail
                    </CardTitle>
                    <CardDescription>
                      Current and previous PO revisions stay linked to the project without altering older PO records.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Current PO</p>
                        <p className="font-mono font-medium">{currentPoNumber || 'Not linked'}</p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">PO Revisions</p>
                        <p className="font-medium">{Math.max(poRevisionFamily.length - 1, 0)}</p>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">Project Revision Events</p>
                        <p className="font-medium">{poAuditRevisions.length}</p>
                      </div>
                    </div>

                    {poRevisionFamily.length === 0 ? (
                      <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No PO revision family is linked to this project yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {poRevisionFamily.map((po: any) => {
                          const poId = po.id;
                          const poNumber = po.po_number ?? po.poNumber;
                          const revisionNumber = po.revision_number ?? 0;
                          const isCurrent = po.is_current_revision ?? project.poId === poId;
                          const changeReason = po.change_reason ?? po.changeReason;
                          return (
                            <div key={poId} className="rounded-md border p-4 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={isCurrent ? 'default' : 'outline'}>{isCurrent ? 'Current' : 'Historical'}</Badge>
                                  <span className="font-mono font-semibold">{poNumber}</span>
                                  <span className="text-xs text-muted-foreground">Rev {revisionNumber}</span>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(project.id)}&editPoId=${encodeURIComponent(String(poId))}`)}
                                >
                                  <Eye className="h-4 w-4 mr-1.5" />
                                  View
                                </Button>
                              </div>
                              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                                <span>Status: {po.status ?? 'Unknown'}</span>
                                <span>Due: {formatDateLabel(po.expected_delivery ?? po.expectedDelivery)}</span>
                                <span>Changed: {formatDateLabel(po.revised_at ?? po.updated_at ?? po.updatedAt ?? po.created_at ?? po.createdAt)}</span>
                              </div>
                              {changeReason && <p className="text-sm text-muted-foreground">{changeReason}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <Separator />

                    {poAuditRevisions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No PO revision events have been recorded yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {poAuditRevisions.map((revision: any) => (
                          <div key={revision.id} className="rounded-md border p-4 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="font-mono">{revision.revision_label ?? revision.revisionLabel}</Badge>
                              <Badge>{revision.has_po_change || revision.hasPoChange ? 'PO Change' : 'PO Audit'}</Badge>
                              <span className="text-xs text-muted-foreground">{formatDateLabel(revision.created_at ?? revision.createdAt)}</span>
                            </div>
                            <p className="text-sm font-medium">{revision.summary}</p>
                            <p className="text-sm text-muted-foreground">{revision.reason}</p>
                            {(revision.previous_po_number || revision.new_po_number || revision.previousPoNumber || revision.newPoNumber) && (
                              <p className="text-xs text-muted-foreground font-mono">
                                PO: {revision.previous_po_number ?? revision.previousPoNumber ?? 'none'} -&gt; {revision.new_po_number ?? revision.newPoNumber ?? 'none'}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Plus className="h-4 w-4" />
                      Create Revision
                    </CardTitle>
                    <CardDescription>Create a project revision and optionally spin a copied P2 PO revision.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3">
                      <div className="space-y-2">
                        <Label>Revision Type</Label>
                        <Select
                          value={revisionForm.revisionType}
                          onValueChange={(value: 'po' | 'drawing' | 'contract') =>
                            setRevisionForm((prev) => ({
                              ...prev,
                              revisionType: value,
                              hasPoChange: value === 'po' ? prev.hasPoChange : false,
                              revisedPoNumber: value === 'po' ? prev.revisedPoNumber : '',
                              revisedDueDate: value === 'po' ? prev.revisedDueDate : '',
                              revisedLineItems: value === 'po' ? prev.revisedLineItems : [],
                            }))
                          }
                        >
                          <SelectTrigger data-testid="select-project-po-tab-revision-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="po">PO</SelectItem>
                            <SelectItem value="drawing">Drawing</SelectItem>
                            <SelectItem value="contract">Contract</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Revision Date</Label>
                        <Input
                          type="date"
                          value={revisionForm.revisionDate}
                          onChange={(e) => setRevisionForm((prev) => ({ ...prev, revisionDate: e.target.value }))}
                          data-testid="input-project-po-tab-revision-date"
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
                    </div>

                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <Checkbox
                        id="project-po-tab-change"
                        checked={revisionForm.hasPoChange}
                        disabled={revisionForm.revisionType !== 'po' || !project.poId}
                        onCheckedChange={(checked) =>
                          setRevisionForm((prev) => ({
                            ...prev,
                            hasPoChange: checked === true,
                            revisedPoNumber: checked === true ? prev.revisedPoNumber : '',
                            revisedDueDate: checked === true ? prev.revisedDueDate : '',
                            revisedLineItems: checked === true ? prev.revisedLineItems : [],
                          }))
                        }
                        data-testid="checkbox-project-po-tab-change"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="project-po-tab-change" className="font-medium">PO change required</Label>
                        <p className="text-sm text-muted-foreground">
                          Creates a copied editable P2 PO revision tied back to this audit event.
                        </p>
                        {!project.poId && (
                          <p className="text-xs text-amber-700">Link a PO before creating a PO-change revision.</p>
                        )}
                      </div>
                    </div>

                    {revisionForm.hasPoChange && (
                      <div className="space-y-3 rounded-md border p-3">
                        <div className="grid gap-3">
                          <div className="space-y-2">
                            <Label>Revised PO Number</Label>
                            <Input
                              value={revisionForm.revisedPoNumber}
                              onChange={(e) => setRevisionForm((prev) => ({ ...prev, revisedPoNumber: e.target.value }))}
                              placeholder="#####-RA"
                              data-testid="input-project-po-tab-revised-po-number"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Revised Due Date</Label>
                            <Input
                              type="date"
                              value={revisionForm.revisedDueDate}
                              onChange={(e) => setRevisionForm((prev) => ({ ...prev, revisedDueDate: e.target.value }))}
                              data-testid="input-project-po-tab-revised-due-date"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Label>Revised Line Items</Label>
                          <Button type="button" variant="outline" size="sm" onClick={addRevisionLineItem}>
                            <Plus className="h-4 w-4 mr-1.5" />
                            Add Line
                          </Button>
                        </div>
                        {revisionForm.revisedLineItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Add at least one line item for the revised PO.</p>
                        ) : (
                          <div className="space-y-2">
                            {revisionForm.revisedLineItems.map((item, index) => (
                              <div key={item.id ?? index} className="grid gap-2 rounded-md border p-3">
                                <div className="grid gap-2 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Part Number</Label>
                                    <Input
                                      value={item.partNumber}
                                      onChange={(e) => updateRevisionLineItem(index, { partNumber: e.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Qty</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => updateRevisionLineItem(index, { quantity: parseInt(e.target.value, 10) || 0 })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Description</Label>
                                  <Input
                                    value={item.partName}
                                    onChange={(e) => updateRevisionLineItem(index, { partName: e.target.value })}
                                  />
                                </div>
                                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Line Date</Label>
                                    <Input
                                      type="date"
                                      value={item.dueDate?.slice(0, 10) || ''}
                                      onChange={(e) => updateRevisionLineItem(index, { dueDate: e.target.value } as Partial<P2PurchaseOrderItem>)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Unit Price</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={item.unitPrice ?? 0}
                                      onChange={(e) => updateRevisionLineItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeRevisionLineItem(index)}
                                      aria-label="Remove revised PO line"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      className="w-full"
                      disabled={
                        !revisionForm.revisionDate ||
                        revisionForm.reason.trim().length < 3 ||
                        createRevisionMutation.isPending ||
                        (revisionForm.hasPoChange && (
                          !project.poId ||
                          !revisionForm.revisedPoNumber.trim() ||
                          !revisionForm.revisedDueDate ||
                          revisionForm.revisedLineItems.length === 0 ||
                          hasInvalidRevisedLineItems
                        ))
                      }
                      onClick={() => createRevisionMutation.mutate(revisionForm)}
                      data-testid="button-create-project-po-tab-revision"
                    >
                      <Plus className="h-4 w-4 mr-1.5" />
                      {createRevisionMutation.isPending ? 'Saving...' : 'Create Revision'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
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
              <div className="grid gap-3 md:grid-cols-[0.8fr_0.8fr_1.2fr_auto]">
                <div className="space-y-2">
                  <Label>Revision Type</Label>
                  <Select
                    value={revisionForm.revisionType}
                    onValueChange={(value: 'po' | 'drawing' | 'contract') =>
                      setRevisionForm((prev) => ({
                        ...prev,
                        revisionType: value,
                        hasPoChange: value === 'po' ? prev.hasPoChange : false,
                        revisedPoNumber: value === 'po' ? prev.revisedPoNumber : '',
                        revisedDueDate: value === 'po' ? prev.revisedDueDate : '',
                        revisedLineItems: value === 'po' ? prev.revisedLineItems : [],
                      }))
                    }
                  >
                    <SelectTrigger data-testid="select-project-revision-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="po">PO</SelectItem>
                      <SelectItem value="drawing">Drawing</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Revision Date</Label>
                  <Input
                    type="date"
                    value={revisionForm.revisionDate}
                    onChange={(e) => setRevisionForm((prev) => ({ ...prev, revisionDate: e.target.value }))}
                    data-testid="input-project-revision-date"
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
                    disabled={
                      !revisionForm.revisionDate ||
                      revisionForm.reason.trim().length < 3 ||
                      createRevisionMutation.isPending ||
                      (revisionForm.hasPoChange && (
                        !project.poId ||
                        !revisionForm.revisedPoNumber.trim() ||
                        !revisionForm.revisedDueDate ||
                        revisionForm.revisedLineItems.length === 0 ||
                        hasInvalidRevisedLineItems
                      ))
                    }
                    onClick={() => createRevisionMutation.mutate(revisionForm)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    {createRevisionMutation.isPending ? 'Saving...' : 'Create Revision'}
                  </Button>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  id="project-po-change"
                  checked={revisionForm.hasPoChange}
                  disabled={revisionForm.revisionType !== 'po' || !project.poId}
                  onCheckedChange={(checked) =>
                    setRevisionForm((prev) => ({
                      ...prev,
                      hasPoChange: checked === true,
                      revisedPoNumber: checked === true ? prev.revisedPoNumber : '',
                      revisedDueDate: checked === true ? prev.revisedDueDate : '',
                      revisedLineItems: checked === true ? prev.revisedLineItems : [],
                    }))
                  }
                  data-testid="checkbox-project-po-change"
                />
                <div className="space-y-1">
                  <Label htmlFor="project-po-change" className="font-medium">PO change required</Label>
                  <p className="text-sm text-muted-foreground">
                    Creates a copied editable P2 PO revision and links it back to this project revision.
                  </p>
                  {!project.poId && (
                    <p className="text-xs text-amber-700">Link a PO before creating a PO-change revision.</p>
                  )}
                </div>
              </div>

              {revisionForm.hasPoChange && (
                <div className="rounded-md border p-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Revised PO Number</Label>
                      <Input
                        value={revisionForm.revisedPoNumber}
                        onChange={(e) => setRevisionForm((prev) => ({ ...prev, revisedPoNumber: e.target.value }))}
                        placeholder="#####-RA"
                        data-testid="input-revised-po-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Revised Due Date</Label>
                      <Input
                        type="date"
                        value={revisionForm.revisedDueDate}
                        onChange={(e) => setRevisionForm((prev) => ({ ...prev, revisedDueDate: e.target.value }))}
                        data-testid="input-revised-po-due-date"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Revised Line Items</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addRevisionLineItem}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add Line
                      </Button>
                    </div>
                    {revisionForm.revisedLineItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Add at least one line item for the revised PO.</p>
                    ) : (
                      <div className="space-y-2">
                        {revisionForm.revisedLineItems.map((item, index) => (
                          <div key={item.id ?? index} className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_1.4fr_0.5fr_0.7fr_0.6fr_auto]">
                            <div className="space-y-1">
                              <Label className="text-xs">Part Number</Label>
                              <Input
                                value={item.partNumber}
                                onChange={(e) => updateRevisionLineItem(index, { partNumber: e.target.value })}
                                data-testid={`input-revision-line-part-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Description</Label>
                              <Input
                                value={item.partName}
                                onChange={(e) => updateRevisionLineItem(index, { partName: e.target.value })}
                                data-testid={`input-revision-line-name-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Qty</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateRevisionLineItem(index, { quantity: parseInt(e.target.value, 10) || 0 })}
                                data-testid={`input-revision-line-quantity-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Line Date</Label>
                              <Input
                                type="date"
                                value={item.dueDate?.slice(0, 10) || ''}
                                onChange={(e) => updateRevisionLineItem(index, { dueDate: e.target.value } as Partial<P2PurchaseOrderItem>)}
                                data-testid={`input-revision-line-due-date-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Unit Price</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice ?? 0}
                                onChange={(e) => updateRevisionLineItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                                data-testid={`input-revision-line-unit-price-${index}`}
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeRevisionLineItem(index)}
                                aria-label="Remove revised PO line"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              {projectRevisions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No revisions recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {projectRevisions.map((revision) => (
                    <div key={revision.id} className="rounded-md border p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">{revision.revision_label}</Badge>
                        <Badge variant={revision.has_po_change || revision.revision_type === 'PO_LINK_CHANGE' ? 'default' : 'secondary'}>
                          {revision.revision_type === 'po' ? 'PO' : revision.revision_type === 'drawing' ? 'Drawing' : revision.revision_type === 'contract' ? 'Contract' : revision.revision_type === 'PO_LINK_CHANGE' ? 'PO Link' : 'Project Change'}
                        </Badge>
                        {revision.has_po_change && <Badge className="bg-blue-100 text-blue-800">PO Change</Badge>}
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(revision.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{revision.summary}</p>
                      {revision.revision_date && (
                        <p className="text-xs text-muted-foreground">
                          Revision date: {format(new Date(revision.revision_date), 'MMM d, yyyy')}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">{revision.reason}</p>
                      {(revision.previous_po_number || revision.new_po_number) && (
                        <p className="text-xs text-muted-foreground font-mono">
                          PO: {revision.previous_po_number || 'none'} -&gt; {revision.new_po_number || 'none'}
                        </p>
                      )}
                      {revision.created_by_display_name && (
                        <p className="text-xs text-muted-foreground">Recorded by {revision.created_by_display_name}</p>
                      )}
                      {revision.new_po_id && revision.has_po_change && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/p2-control-center?tab=setup&projectId=${encodeURIComponent(project.id)}&editPoId=${encodeURIComponent(String(revision.new_po_id))}`)}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Revised PO
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shipping-invoicing" className="space-y-4">
          <P2ProjectDepositsCard projectId={project.id} />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Shipping / Invoicing
              </CardTitle>
              <CardDescription>Packing lists, shipped CoCs, and invoice status for this project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Packing Lists</p>
                  <p className="font-medium">{hubShippingInvoicing.summary?.packingSlipCount ?? traceability?.packingSlips?.length ?? 0}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Invoices</p>
                  <p className="font-medium">{hubShippingInvoicing.summary?.invoiceCount ?? (traceability?.invoice ? 1 : 0)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Needed</p>
                  <p className="font-medium">{hubShippingInvoicing.summary?.needsInvoice ? 'Yes' : 'No'}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Received</p>
                  <p className="font-medium">{hubShippingInvoicing.summary?.receivedInvoices ?? 0}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setLocation('/p2-control-center?tab=shipping')}>
                  <Truck className="h-4 w-4 mr-2" />
                  Open P2 Shipping
                </Button>
                <Button variant="outline" onClick={() => setLocation('/finance/invoices')}>
                  <Receipt className="h-4 w-4 mr-2" />
                  Open Invoices
                </Button>
              </div>
              {Array.isArray(hubShippingInvoicing.packingSlips) && hubShippingInvoicing.packingSlips.length > 0 ? (
                <div className="space-y-2">
                  {hubShippingInvoicing.packingSlips.map((slip: any) => (
                    <div key={slip.id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="font-medium">{slip.packing_slip_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {slip.ship_date ? format(new Date(slip.ship_date), 'MMM d, yyyy') : 'Ship date pending'}
                          {slip.tracking_number ? ` · ${slip.tracking_number}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{slip.status}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => setLocation(`/p2/packing-slip/${slip.id}`)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No packing lists are linked yet.</p>
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
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>PO Item</Label>
                        <Select
                          value={linkPoItemId}
                          onValueChange={(value) => {
                            setLinkPoItemId(value);
                            setLinkBillingBucketId('');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an item from this PO" />
                          </SelectTrigger>
                          <SelectContent>
                            {poItemOptions.map(item => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.partNumber} - {item.partName} ({item.quantity})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>CLIN / Bucket</Label>
                        <Select
                          value={linkBillingBucketId}
                          onValueChange={setLinkBillingBucketId}
                          disabled={!linkPoItemId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={linkPoItemId ? 'Select a bucket from this PO' : 'Choose a PO item first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {billingBucketOptions.map(bucket => (
                              <SelectItem key={bucket.id} value={bucket.id}>
                                {bucket.bucketLabel}{bucket.customerPoLine ? ` - ${bucket.customerPoLine}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {linkPoItemId && billingBucketOptions.length === 0 && (
                          <p className="text-xs text-amber-700">No active CLIN/bucket allocations are set up for this PO item.</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => linkSelectedPo(suggestedPo.id.toString())}
                        disabled={linkPoMutation.isPending || !linkPoItemId || !linkBillingBucketId}
                      >
                        {linkPoMutation.isPending ? 'Linking…' : 'Accept'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowManualLink(true);
                          setLinkPoItemId('');
                          setLinkBillingBucketId('');
                        }}
                      >
                        Choose Different
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {showManualLink && suggestedPo && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground -mb-2"
                        onClick={() => {
                          setShowManualLink(false);
                          setLinkPoId('');
                          setLinkPoItemId('');
                          setLinkBillingBucketId('');
                        }}
                      >
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
                      <Select
                        value={linkPoId}
                        onValueChange={(value) => {
                          setLinkPoId(value);
                          setLinkPoItemId('');
                          setLinkBillingBucketId('');
                        }}
                      >
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
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>PO Item</Label>
                        <Select
                          value={linkPoItemId}
                          onValueChange={(value) => {
                            setLinkPoItemId(value);
                            setLinkBillingBucketId('');
                          }}
                          disabled={!linkPoId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={linkPoId ? 'Select an item from this PO' : 'Choose a PO first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {poItemOptions.map(item => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.partNumber} - {item.partName} ({item.quantity})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>CLIN / Bucket</Label>
                        <Select
                          value={linkBillingBucketId}
                          onValueChange={setLinkBillingBucketId}
                          disabled={!linkPoItemId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={linkPoItemId ? 'Select a bucket from this PO' : 'Choose a PO item first'} />
                          </SelectTrigger>
                          <SelectContent>
                            {billingBucketOptions.map(bucket => (
                              <SelectItem key={bucket.id} value={bucket.id}>
                                {bucket.bucketLabel}{bucket.customerPoLine ? ` - ${bucket.customerPoLine}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {linkPoItemId && billingBucketOptions.length === 0 && (
                          <p className="text-xs text-amber-700">No active CLIN/bucket allocations are set up for this PO item.</p>
                        )}
                      </div>
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
                      disabled={!linkPoId || !linkPoItemId || !linkBillingBucketId || linkPoMutation.isPending}
                      onClick={() => linkSelectedPo(linkPoId, linkPoReason)}
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
                          onClick={() => setLocation(`/projects/${project.id}?tab=po`)}
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
                              setLinkPoItemId('');
                              setLinkBillingBucketId('');
                              setLinkPoReason('');
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>New P2 PO</Label>
                            <Select
                              value={linkPoId}
                              onValueChange={(value) => {
                                setLinkPoId(value);
                                setLinkPoItemId('');
                                setLinkBillingBucketId('');
                              }}
                            >
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
                            <Label>PO Item</Label>
                            <Select
                              value={linkPoItemId}
                              onValueChange={(value) => {
                                setLinkPoItemId(value);
                                setLinkBillingBucketId('');
                              }}
                              disabled={!linkPoId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={linkPoId ? 'Select an item from this PO' : 'Choose a PO first'} />
                              </SelectTrigger>
                              <SelectContent>
                                {poItemOptions.map(item => (
                                  <SelectItem key={item.id} value={item.id.toString()}>
                                    {item.partNumber} - {item.partName} ({item.quantity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>CLIN / Bucket</Label>
                            <Select
                              value={linkBillingBucketId}
                              onValueChange={setLinkBillingBucketId}
                              disabled={!linkPoItemId}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={linkPoItemId ? 'Select a bucket from this PO' : 'Choose a PO item first'} />
                              </SelectTrigger>
                              <SelectContent>
                                {billingBucketOptions.map(bucket => (
                                  <SelectItem key={bucket.id} value={bucket.id}>
                                    {bucket.bucketLabel}{bucket.customerPoLine ? ` - ${bucket.customerPoLine}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {linkPoItemId && billingBucketOptions.length === 0 && (
                              <p className="text-xs text-amber-700">No active CLIN/bucket allocations are set up for this PO item.</p>
                            )}
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
                          disabled={!linkPoId || !linkPoItemId || !linkBillingBucketId || linkPoReason.trim().length < 3 || linkPoMutation.isPending}
                          onClick={() => linkSelectedPo(linkPoId, linkPoReason)}
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
                    {manufacturingProjectDocs.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 pt-2">
                          <div className="flex-1 border-t" />
                          <span className="text-xs text-muted-foreground px-2">Work Instructions & Spec Sheets</span>
                          <div className="flex-1 border-t" />
                        </div>
                        {manufacturingProjectDocs.map(doc => (
                          <div key={String(doc.id)} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                            <div className="flex items-center gap-3 min-w-0">
                              {doc.source === 'spec_sheet' ? (
                                <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                              ) : (
                                <ClipboardList className="h-4 w-4 text-green-600 flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{doc.label || doc.original_file_name}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  <Badge variant="secondary" className="text-xs">
                                    {doc.source === 'spec_sheet' ? 'Spec Sheet' : 'Work Instruction'}
                                  </Badge>
                                  {doc.part_number && (
                                    <Badge variant="outline" className="text-xs font-mono">{doc.part_number}</Badge>
                                  )}
                                  {doc.department_name && (
                                    <Badge variant="outline" className="text-xs">{doc.department_name}</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {doc.has_file && (
                                <>
                                  <Button size="sm" variant="ghost" title="Preview"
                                    onClick={() => { setPdfPreviewUrl(`/api/projects/${id}/documents/${encodeURIComponent(String(doc.id))}/file`); setPdfPreviewTitle(doc.label || doc.original_file_name); }}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" title="Download" asChild>
                                    <a href={`/api/projects/${id}/documents/${encodeURIComponent(String(doc.id))}/file`} download={doc.original_file_name}>
                                      <Download className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" title="Revise in builder"
                                onClick={() => setLocation(`/forms/document-builder?partNumber=${encodeURIComponent(doc.part_number || '')}`)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {manualProjectDocs.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 pt-2">
                          <div className="flex-1 border-t" />
                          <span className="text-xs text-muted-foreground px-2">Manual Attachments</span>
                          <div className="flex-1 border-t" />
                        </div>
                        {manualProjectDocs.map(doc => (
                          <div key={String(doc.id)} className="flex items-center justify-between py-2 px-3 rounded-lg border">
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
                                onClick={() => deleteDocMutation.mutate(Number(doc.id))}
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


        <Dialog open={showProjectPOWizard} onOpenChange={setShowProjectPOWizard}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>Create P2 PO</DialogTitle>
              <DialogDescription>Create a P2 purchase order linked to this project.</DialogDescription>
            </DialogHeader>
            <P2POCreationWizard
              initialProjectId={project.id}
              initialCustomerId={project.customer?.customerId || project.customerId}
              onComplete={handleProjectPOWizardComplete}
              onCancel={() => setShowProjectPOWizard(false)}
            />
          </DialogContent>
        </Dialog>

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

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Link } from 'wouter';
import { jsPDF } from 'jspdf';
import {
  Package,
  Plus,
  Check,
  Clock,
  AlertCircle,
  Search,
  FileText,
  Loader2,
  Printer,
  Upload,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Tag,
  History,
  Barcode,
  Truck,
  ClipboardList,
  ShieldCheck,
  X,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  ExternalLink,
  Download,
  Trash2,
  Settings,
  ChevronUp,
  Pencil,
  Save,
} from 'lucide-react';

import { apiRequest } from '@/lib/queryClient';
import { compareReceiptLines } from '@/lib/receiptLineSort';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { getTraceabilityFields } from '@/lib/traceabilityFields';
import { getRccCompleteInvalidationKeys } from '@/lib/rccInvalidation';

// Canonical list of per-field traceability config fields (matches received_units columns)
const TRACE_CONFIG_FIELDS = [
  { key: 'lotNumber', label: 'Lot Number', type: 'text' },
  { key: 'batchNumber', label: 'Batch Number', type: 'text' },
  { key: 'serialNumber', label: 'Serial Number', type: 'text' },
  { key: 'expirationDate', label: 'Exp Date', type: 'date' },
  { key: 'manufactureDate', label: 'Mfg Date', type: 'date' },
  { key: 'heatLot', label: 'Heat Lot', type: 'text' },
  { key: 'rollNumber', label: 'Roll Number', type: 'text' },
  { key: 'certReference', label: 'Cert Reference', type: 'text' },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

interface InventoryDepartment {
  id: number;
  name: string;
  isActive?: boolean;
  sortOrder?: number;
  defaultReceivingLocation?: string | null;
  defaultReceivingFreezer?: number | null;
}

interface EmployeeOption {
  id: number;
  name?: string;
  preferredName?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  isActive?: boolean;
}

interface VendorPO {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName: string;
  status: string;
  requestedDeliveryDate?: string;
  expectedDeliveryDate?: string;
  pendingReceiptCount?: number;
}

interface VendorPOItem {
  id: number;
  vendorPoId: number;
  lineNumber: number;
  agPartNumber?: string;
  description?: string;
  quantity: number;
  vendorUnit?: string;
  uom?: string;
  receivedQuantity?: number;
}

interface Receipt {
  id: number;
  receiptNumber: string;
  receiptDate: string;
  receivedAt?: string;
  vendorId?: number;
  vendorName?: string;
  vendorPoId?: number;
  vendorPoNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  packingSlipNumber?: string;
  conditionOnArrival?: string;
  status: string;
  notes?: string;
  departmentId?: number | null;
  lines?: ReceiptLine[];
  units?: ReceivedUnit[];
  documents?: ReceiptDocument[];
  auditLog?: AuditEntry[];
}

interface ReceiptLine {
  id: number;
  receiptId: number;
  vendorPoItemId?: number;
  agPartNumber?: string;
  description?: string;
  orderedQty?: string;
  receivedQty: string;
  uom?: string;
  isPartial?: boolean;
  isOver?: boolean;
  notes?: string;
}

interface ReceivedUnit {
  id: number;
  receiptLineId: number;
  receiptId: number;
  unitSequence: number;
  barcode: string;
  unitType?: string;
  quantity: string;
  uom?: string;
  lotNumber?: string;
  batchNumber?: string;
  serialNumber?: string;
  internalControlNumber?: string;
  rollNumber?: string;
  heatLot?: string;
  manufactureDate?: string;
  expirationDate?: string;
  shelfLifeDays?: number;
  certReference?: string;
  disposition: string;
  dispositionNotes?: string;
  location?: string;
  freezerNumber?: number;
  allocatedToType?: string;
  allocatedToId?: number;
  materialLotId?: string;
  targetProjectId?: string | null;
  targetRdProjectId?: string | null;
}

interface ReceivingProjectTarget {
  id: string;
  projectCode: string;
  projectName: string;
  status: string;
  customerName?: string | null;
  targetType: 'project' | 'rd_project';
}

interface ReceiptDocument {
  id: number;
  receiptId: number;
  receivedUnitId?: number;
  mediaId?: string;
  docType?: string;
  filename?: string;
  storagePath?: string;
  notes?: string;
  uploadedByDisplayName?: string;
  createdAt?: string;
}

interface AuditEntry {
  id: number;
  receiptId: number;
  action: string;
  actorDisplayName?: string;
  metadata?: any;
  createdAt: string;
}

interface DepartmentReceivingAction {
  receipt_id: number;
  receipt_number: string;
  vendor_name?: string;
  vendor_po_number?: string;
  department_id: number;
  department_name?: string;
  receipt_line_id: number;
  ag_part_number?: string;
  description?: string;
  unit_id: number;
  barcode: string;
  quantity: string;
  uom?: string;
  disposition: string;
  location?: string;
  freezer_number?: number;
  action_required: 'disposition_required' | 'putaway_required';
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DISPOSITION_COLORS: Record<string, string> = {
  pending_inspection: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  document_hold: 'bg-amber-100 text-amber-800 border-amber-200',
  accepted: 'bg-green-100 text-green-800 border-green-200',
  quarantine: 'bg-orange-100 text-orange-800 border-orange-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  rejected_returned: 'bg-red-100 text-red-800 border-red-200',
  rejected_scrapped: 'bg-red-100 text-red-800 border-red-200',
  rejected_reallocated: 'bg-purple-100 text-purple-800 border-purple-200',
};

const DISPOSITION_LABELS: Record<string, string> = {
  pending_inspection: 'Pending Inspection',
  document_hold: 'Document Hold',
  accepted: 'Accepted',
  quarantine: 'Quarantine',
  rejected: 'Rejected',
  rejected_returned: 'Rejected - Return',
  rejected_scrapped: 'Rejected - Scrap',
  rejected_reallocated: 'Rejected - Reallocate',
};

const DOC_TYPES = [
  'SDS',
  'TDS',
  'CoC',
  'cert',
  'packing_slip',
  'test_report',
  'calibration_cert',
  'supplier_label_photo',
  'damage_photo',
  'other',
];

const UNIT_TYPES = ['roll', 'box', 'bar', 'tube', 'serialized_piece', 'other'];

const CONDITIONS = ['good', 'damaged', 'partial', 'refused'];

const REJECTION_OUTCOMES = [
  { value: 'rejected_returned', label: 'Returned to vendor' },
  { value: 'rejected_scrapped', label: 'Scrapped' },
  { value: 'rejected_reallocated', label: 'Reallocated' },
] as const;

const STORAGE_TYPES = ['conex', 'freezer', 'department', 'other'] as const;

function buildStorageLocation(
  type: string,
  identifier: string,
  note: string
): string {
  const trimmedId = identifier.trim();
  const trimmedNote = note.trim();
  if (type === 'conex') return trimmedId ? `Conex ${trimmedId}` : '';
  if (type === 'freezer') return trimmedId ? `Freezer ${trimmedId}` : '';
  if (type === 'department') return trimmedNote || trimmedId || '';
  if (type === 'other') return trimmedNote ? `Other: ${trimmedNote}` : '';
  return trimmedNote || trimmedId;
}

function getExpirationStatus(
  expirationDate?: string | null
): 'ok' | 'near_expiry' | 'expired' {
  if (!expirationDate) return 'ok';
  const exp = new Date(expirationDate);
  const now = new Date();
  if (exp < now) return 'expired';
  const daysUntil = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntil <= 30) return 'near_expiry';
  return 'ok';
}

const STEP_LABELS = [
  '1. Shipment Info',
  '2. Line Items',
  '3. Unit Splitting',
  '4. Disposition',
  '5. Putaway',
];

// ── Helper Components ──────────────────────────────────────────────────────────

function DispositionBadge({ disposition }: { disposition: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${DISPOSITION_COLORS[disposition] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}
    >
      {DISPOSITION_LABELS[disposition] ?? disposition}
    </span>
  );
}

function StepIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div key={i} className="flex items-center gap-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              i < currentStep
                ? 'bg-green-600 text-white'
                : i === currentStep
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i < currentStep ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          {i < totalSteps - 1 && (
            <div
              className={`h-0.5 w-6 ${i < currentStep ? 'bg-green-600' : 'bg-gray-200'}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Department Defaults Manager ────────────────────────────────────────────────

function DepartmentDefaultsManager() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLocation, setEditLocation] = useState('');
  const [editFreezer, setEditFreezer] = useState('');

  const { data: departments = [], isLoading } = useQuery<InventoryDepartment[]>(
    {
      queryKey: ['/api/inventory/departments'],
    }
  );

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: number;
      updates: Record<string, any>;
    }) =>
      apiRequest(`/api/inventory/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/inventory/departments'],
      });
      setEditingId(null);
      toast.success('Department defaults saved');
    },
    onError: () => toast.error('Failed to save department defaults'),
  });

  const startEdit = (dept: InventoryDepartment) => {
    setEditingId(dept.id);
    setEditLocation(dept.defaultReceivingLocation ?? '');
    setEditFreezer(
      dept.defaultReceivingFreezer != null
        ? String(dept.defaultReceivingFreezer)
        : ''
    );
  };

  const saveEdit = (dept: InventoryDepartment) => {
    updateMutation.mutate({
      id: dept.id,
      updates: {
        name: dept.name,
        defaultReceivingLocation: editLocation.trim() || null,
        defaultReceivingFreezer: editFreezer ? parseInt(editFreezer, 10) : null,
      },
    });
  };

  return (
    <div className="border-t">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />
          Dept. Receiving Defaults
        </span>
        {expanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50 dark:bg-gray-900">
          <div className="text-xs text-gray-400 pt-1">
            Set default location and freezer number per department. These
            auto-fill during putaway.
          </div>
          {isLoading && (
            <div className="text-xs text-gray-400 py-1">Loading…</div>
          )}
          {departments.map((dept) => (
            <div
              key={dept.id}
              className="border rounded p-2 bg-white dark:bg-gray-800 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {dept.name}
                </span>
                {editingId !== dept.id && (
                  <button
                    className="text-gray-400 hover:text-gray-600 p-0.5"
                    onClick={() => startEdit(dept)}
                    title="Edit defaults"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
              {editingId === dept.id ? (
                <div className="space-y-1.5">
                  <div>
                    <Label className="text-xs">Default Location</Label>
                    <Input
                      className="h-6 text-xs mt-0.5"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      placeholder="Shelf, bin, rack..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Default Freezer #</Label>
                    <Input
                      className="h-6 text-xs mt-0.5"
                      type="number"
                      min={1}
                      value={editFreezer}
                      onChange={(e) => setEditFreezer(e.target.value)}
                      placeholder="e.g. 2"
                    />
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      className="h-6 text-xs flex-1"
                      onClick={() => saveEdit(dept)}
                      disabled={updateMutation.isPending}
                    >
                      {updateMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3 mr-1" />
                      )}
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>
                    Location:{' '}
                    <span className="text-gray-700 dark:text-gray-300">
                      {dept.defaultReceivingLocation || (
                        <em className="text-gray-400">not set</em>
                      )}
                    </span>
                  </div>
                  <div>
                    Freezer:{' '}
                    <span className="text-gray-700 dark:text-gray-300">
                      {dept.defaultReceivingFreezer != null ? (
                        dept.defaultReceivingFreezer
                      ) : (
                        <em className="text-gray-400">not set</em>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
          {departments.length === 0 && !isLoading && (
            <div className="text-xs text-gray-400">
              No departments configured.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Left Panel: Expected Receipts ─────────────────────────────────────────────

function LeftPanel({
  onStartReceipt,
  onSelectReceipt,
  activeReceiptId,
}: {
  onStartReceipt: (po: VendorPO | null) => void;
  onSelectReceipt: (receipt: Receipt) => void;
  activeReceiptId: number | null;
}) {
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<{
    id: number;
    username: string;
    role: string;
  }>({
    queryKey: ['currentUser'],
  });
  const isAdminOrOwner = ['admin', 'owner'].includes(
    (currentUser?.role ?? '').toLowerCase()
  );

  const { data: sentPOsResponse, isLoading: isLoadingSent } = useQuery<{
    data: VendorPO[];
  }>({
    queryKey: ['/api/vendor-pos', 'Sent'],
    queryFn: () => apiRequest('/api/vendor-pos?status=Sent&pageSize=200'),
  });
  const { data: partialPOsResponse, isLoading: isLoadingPartial } = useQuery<{
    data: VendorPO[];
  }>({
    queryKey: ['/api/vendor-pos', 'Partially Received'],
    queryFn: () =>
      apiRequest('/api/vendor-pos?status=Partially%20Received&pageSize=200'),
  });
  const isLoadingPOs = isLoadingSent || isLoadingPartial;

  const { data: pendingByPo } = useQuery<
    Record<number, { count: number; latestStatus: string }>
  >({
    queryKey: ['/api/receipts/pending-by-po'],
    queryFn: () => apiRequest('/api/receipts/pending-by-po'),
    refetchInterval: 30000,
  });

  const { data: completedReceipts = [] } = useQuery<Receipt[]>({
    queryKey: ['/api/receipts', 'complete'],
    queryFn: () => apiRequest('/api/receipts?status=complete'),
    refetchInterval: 60000,
  });

  const reopenReceiptMutation = useMutation({
    mutationFn: async (receipt: Receipt) => {
      await apiRequest(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'in_progress',
          reopenReason: 'Correction to receiving entry',
        }),
      });
      return apiRequest(`/api/receipts/${receipt.id}`);
    },
    onSuccess: (receipt: Receipt) => {
      onSelectReceipt(receipt);
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/receipts', 'complete'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/receipts/pending-by-po'],
      });
      toast.success(`Reopened ${receipt.receiptNumber} for adjustment`);
    },
    onError: (err: any) =>
      toast.error(err?.message ?? 'Failed to reopen receipt'),
  });

  // Merge Sent + Partially Received POs, deduplicate by id
  const allPOs = [
    ...(sentPOsResponse?.data ?? []),
    ...(partialPOsResponse?.data ?? []),
  ];
  const seenIds = new Set<number>();
  const sentPOs = allPOs.filter((po) => {
    if (seenIds.has(po.id)) return false;
    seenIds.add(po.id);
    return true;
  });

  // Set of PO IDs that have at least one partially-received line (status = "Partially Received")
  const partialPoIds = new Set<number>(
    (partialPOsResponse?.data ?? []).map((p) => p.id)
  );

  const filteredPOs = sentPOs.filter(
    (po) =>
      po.poNumber?.toLowerCase().includes(search.toLowerCase()) ||
      po.vendorName?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by vendor
  const grouped = filteredPOs.reduce<
    Record<string, { vendor: string; pos: VendorPO[] }>
  >((acc, po) => {
    const key = po.vendorName || 'Unknown Vendor';
    if (!acc[key]) acc[key] = { vendor: key, pos: [] };
    acc[key].pos.push(po);
    return acc;
  }, {});

  const pendingCount = filteredPOs.length;
  const sortedCompletedReceipts = [...completedReceipts].sort((a, b) => {
    const aTime = new Date(a.receivedAt ?? a.receiptDate ?? 0).getTime();
    const bTime = new Date(b.receivedAt ?? b.receiptDate ?? 0).getTime();
    return bTime - aTime;
  });
  const recentCount = sortedCompletedReceipts.length;

  const TAB_STORAGE_KEY = 'rcc:leftPanelTab';
  const [leftTab, setLeftTab] = useState<'pending' | 'recent'>(() => {
    if (typeof window === 'undefined') return 'pending';
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    return stored === 'recent' ? 'recent' : 'pending';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TAB_STORAGE_KEY, leftTab);
    }
  }, [leftTab]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b bg-gray-50 dark:bg-gray-900">
        <h2 className="font-semibold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Expected Receipts
        </h2>
        <div className="mt-2 relative">
          <Search className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" />
          <Input
            placeholder="Search POs..."
            className="pl-7 h-7 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs
        value={leftTab}
        onValueChange={(v) => setLeftTab(v as 'pending' | 'recent')}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <TabsList className="mx-2 mt-2 grid grid-cols-2 h-8">
          <TabsTrigger
            value="pending"
            className="text-xs h-7"
            data-testid="tab-receiving-pending"
          >
            Pending
            <Badge
              variant="secondary"
              className="ml-1.5 h-4 px-1.5 text-[10px]"
              data-testid="badge-pending-count"
            >
              {pendingCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="recent"
            className="text-xs h-7"
            data-testid="tab-receiving-recent"
          >
            Recently Received
            <Badge
              variant="secondary"
              className="ml-1.5 h-4 px-1.5 text-[10px]"
              data-testid="badge-recent-count"
            >
              {recentCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="pending"
          className="flex-1 overflow-y-auto p-2 space-y-2 mt-2"
        >
          {/* Manual Receipt Option */}
          <button
            onClick={() => onStartReceipt(null)}
            className="w-full text-left p-2 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            data-testid="button-manual-receipt"
          >
            <div className="flex items-center gap-2 text-blue-600 text-xs font-medium">
              <Plus className="w-3.5 h-3.5" />
              Manual Receipt (no PO)
            </div>
          </button>

          {isLoadingPOs && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            </div>
          )}

          {Object.values(grouped).map((group) => (
            <div
              key={group.vendor}
              className="border rounded-lg overflow-hidden"
            >
              <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {group.vendor}
              </div>
              {group.pos.map((po) => {
                const pending = pendingByPo?.[po.id];
                const isResuming = !!(
                  pending ||
                  (po.pendingReceiptCount && po.pendingReceiptCount > 0)
                );
                const isPartial = partialPoIds.has(po.id);
                return (
                  <div
                    key={po.id}
                    className="p-2 border-t text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1 flex-wrap">
                          {po.poNumber}
                          {isPartial && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-xs bg-amber-400/20 text-amber-700 border border-amber-400 dark:bg-amber-400/10 dark:text-amber-400 dark:border-amber-500 ml-1">
                              Partial
                            </span>
                          )}
                          {isResuming && (
                            <span className="inline-flex items-center px-1 py-0.5 rounded text-xs bg-amber-100 text-amber-700 border border-amber-200 ml-1">
                              In Progress
                            </span>
                          )}
                        </div>
                        <div className="text-gray-500 mt-0.5">
                          {po.expectedDeliveryDate
                            ? `Expected: ${new Date(po.expectedDeliveryDate).toLocaleDateString()}`
                            : po.requestedDeliveryDate
                              ? `Requested: ${new Date(po.requestedDeliveryDate).toLocaleDateString()}`
                              : 'No delivery date'}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className={`h-6 text-xs px-2 shrink-0 ${isResuming ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                        onClick={() => onStartReceipt(po)}
                        data-testid={`button-start-po-${po.id}`}
                      >
                        {isResuming ? 'Resume' : 'Start'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {filteredPOs.length === 0 && !isLoadingPOs && (
            <div className="text-center text-xs text-gray-500 py-4">
              No open POs found
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent" className="flex-1 overflow-y-auto p-2 mt-2">
          {sortedCompletedReceipts.length === 0 ? (
            <div className="text-center text-xs text-gray-500 py-4">
              No recently received receipts
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <History className="w-3 h-3" />
                Recent Completed Receipts
              </div>
              {sortedCompletedReceipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className={`p-2 border-t text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50 ${activeReceiptId === receipt.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  data-testid={`row-recent-receipt-${receipt.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left min-w-0 flex-1"
                      onClick={() => onSelectReceipt(receipt)}
                      data-testid={`button-open-receipt-${receipt.id}`}
                    >
                      <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {receipt.receiptNumber}
                      </div>
                      <div className="text-gray-500 mt-0.5 truncate">
                        {receipt.vendorName ?? 'Manual receipt'}{' '}
                        {receipt.vendorPoNumber
                          ? `· PO ${receipt.vendorPoNumber}`
                          : ''}
                      </div>
                      <div className="text-blue-600 mt-1">Open documents</div>
                    </button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs px-2 shrink-0"
                      onClick={() => reopenReceiptMutation.mutate(receipt)}
                      disabled={reopenReceiptMutation.isPending}
                      title="Reopen receipt for correction"
                      data-testid={`button-reopen-receipt-${receipt.id}`}
                    >
                      {reopenReceiptMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Reopen'
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      {isAdminOrOwner && <DepartmentDefaultsManager />}
    </div>
  );
}

// ── Line Status Badge ──────────────────────────────────────────────────────────

export type LineStatus = 'pending' | 'partial' | 'complete' | 'over' | 'manual';

export interface LineStatusInfo {
  status: LineStatus;
  isOver: boolean;
  isPartial: boolean;
  isComplete: boolean;
  isPending: boolean;
  isManual: boolean;
  rowClassName: string;
  badgeLabel: string;
  badgeClassName: string;
}

export function getLineStatus(
  orderedQty: string | number | null | undefined,
  receivedQty: string | number | null | undefined
): LineStatusInfo {
  const ord = Number(orderedQty ?? 0);
  const rcv = Number(receivedQty ?? 0);
  const isOver = rcv > ord && ord > 0;
  const isPartial = rcv < ord && rcv > 0;
  const isComplete = ord > 0 && rcv >= ord && !isOver;
  const isPending = ord > 0 && rcv === 0;
  const isManual = ord === 0;

  let status: LineStatus;
  let badgeLabel: string;
  let badgeClassName: string;
  let rowClassName: string;

  if (isOver) {
    status = 'over';
    badgeLabel = 'Over';
    badgeClassName = 'bg-orange-100 text-orange-700 text-xs border-orange-200';
    rowClassName = '';
  } else if (isPartial) {
    status = 'partial';
    badgeLabel = 'Partial';
    badgeClassName = 'bg-yellow-100 text-yellow-700 text-xs border-yellow-200';
    rowClassName = '';
  } else if (isComplete) {
    status = 'complete';
    badgeLabel = 'Fully Received';
    badgeClassName = 'bg-green-100 text-green-700 text-xs border-green-200';
    rowClassName = 'bg-green-50/60 dark:bg-green-900/10';
  } else if (isPending) {
    status = 'pending';
    badgeLabel = 'Pending';
    badgeClassName = 'bg-gray-100 text-gray-500 text-xs border-gray-200';
    rowClassName = '';
  } else {
    status = 'manual';
    badgeLabel = 'Manual';
    badgeClassName = '';
    rowClassName = '';
  }

  return {
    status,
    isOver,
    isPartial,
    isComplete,
    isPending,
    isManual,
    rowClassName,
    badgeLabel,
    badgeClassName,
  };
}

export function LineStatusBadge({
  orderedQty,
  receivedQty,
}: {
  orderedQty: string | number | null | undefined;
  receivedQty: string | number | null | undefined;
}) {
  const info = getLineStatus(orderedQty, receivedQty);
  if (info.isManual) {
    return (
      <Badge
        variant="outline"
        className="text-xs"
        data-testid="line-status-badge"
      >
        {info.badgeLabel}
      </Badge>
    );
  }
  return (
    <Badge className={info.badgeClassName} data-testid="line-status-badge">
      {info.badgeLabel}
    </Badge>
  );
}

// ── Receiving Progress Bar ─────────────────────────────────────────────────────

export function ReceivingProgressBar({ lines }: { lines: ReceiptLine[] }) {
  const totalLines = lines.length;
  if (totalLines === 0) return null;

  const fullLines = lines.filter((l) => {
    const ord = Number(l.orderedQty ?? 0);
    const rcv = Number(l.receivedQty ?? 0);
    return ord > 0 && rcv >= ord;
  }).length;

  const partialLines = lines.filter((l) => {
    const ord = Number(l.orderedQty ?? 0);
    const rcv = Number(l.receivedQty ?? 0);
    return ord > 0 && rcv > 0 && rcv < ord;
  }).length;

  const openLines = totalLines - fullLines - partialLines;
  const hasPartials = partialLines > 0;

  // When partials exist, cap fullPct at 99 so the amber segment always has room.
  const fullPct = hasPartials
    ? Math.min(99, Math.round((fullLines / totalLines) * 100))
    : Math.min(100, Math.round((fullLines / totalLines) * 100));
  // Guarantee at least 1% width for the amber segment when partials are present.
  const partialPct = hasPartials
    ? Math.max(
        1,
        Math.min(100 - fullPct, Math.round((partialLines / totalLines) * 100))
      )
    : 0;

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      data-testid="rcc-receiving-progress"
    >
      <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden flex">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${fullPct}%` }}
          data-testid="rcc-progress-full"
        />
        <div
          className="h-full bg-amber-400"
          style={{ width: `${partialPct}%` }}
          data-testid="rcc-progress-partial"
        />
      </div>
      {hasPartials ? (
        <span>
          <span data-testid="rcc-full-count">{fullLines} full</span>
          {' · '}
          <span data-testid="rcc-partial-count">{partialLines} partial</span>
          {' · '}
          <span data-testid="rcc-open-count">{openLines} open</span>
        </span>
      ) : (
        <span>
          {fullLines} / {totalLines} lines received
        </span>
      )}
    </div>
  );
}

// ── Center Panel: Stepped Workflow ─────────────────────────────────────────────

function CenterPanel({
  receipt,
  onReceiptUpdate,
}: {
  receipt: Receipt | null;
  onReceiptUpdate: (r: Receipt) => void;
}) {
  const [step, setStep] = useState(0);
  const [reversalDialogOpen, setReversalDialogOpen] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalPreview, setReversalPreview] = useState<{
    canReverse: boolean;
    unitCount: number;
    totalQuantity: number;
    blockers: string[];
  } | null>(null);
  const queryClient = useQueryClient();
  const reopenActiveReceiptMutation = useMutation({
    mutationFn: async () => {
      if (!receipt) throw new Error('No receipt selected');
      await apiRequest(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'in_progress',
          reopenReason: 'Correction to receiving entry',
        }),
      });
      return apiRequest(`/api/receipts/${receipt.id}`);
    },
    onSuccess: (updated: Receipt) => {
      onReceiptUpdate(updated);
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
      queryClient.invalidateQueries({
        queryKey: ['/api/receipts', 'complete'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/receipts/pending-by-po'],
      });
      toast.success(`Reopened ${updated.receiptNumber} for adjustment`);
    },
    onError: (err: any) =>
      toast.error(err?.message ?? 'Failed to reopen receipt'),
  });
  const loadReversalPreview = async () => {
    if (!receipt) return;
    try {
      setReversalPreview(
        await apiRequest(`/api/receipts/${receipt.id}/reversal-preview`)
      );
      setReversalDialogOpen(true);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to check receipt reversal');
    }
  };
  const reverseReceiptMutation = useMutation({
    mutationFn: async () => {
      if (!receipt) throw new Error('No receipt selected');
      return apiRequest(`/api/receipts/${receipt.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reversalReason }),
      });
    },
    onSuccess: async (result: any) => {
      const updated = await apiRequest(`/api/receipts/${receipt!.id}`);
      onReceiptUpdate(updated);
      setReversalDialogOpen(false);
      setReversalReason('');
      setReversalPreview(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/receipts'] }),
        queryClient.invalidateQueries({
          queryKey: ['/api/receipts', 'complete'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['/api/receipts/pending-by-po'],
        }),
        queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] }),
        queryClient.invalidateQueries({
          queryKey: ['/api/cutting-table/fabric-inventory'],
        }),
      ]);
      toast.success(
        `Reversed ${result.reversedUnits} units (${result.reversedQuantity} total) without deleting traceability`
      );
    },
    onError: (err: any) =>
      toast.error(err?.message ?? 'Failed to reverse receipt'),
  });

  if (!receipt) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-3">
        <Package className="w-12 h-12 opacity-30" />
        <p className="text-sm">
          Select a PO or start a manual receipt to begin
        </p>
      </div>
    );
  }

  const lines = receipt.lines ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-white dark:bg-gray-950">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-sm">
              Receipt:{' '}
              <span className="text-blue-600">{receipt.receiptNumber}</span>
            </h2>
            <p className="text-xs text-gray-500">
              {receipt.vendorName ?? 'Manual Receipt'}{' '}
              {receipt.vendorPoNumber ? `· PO ${receipt.vendorPoNumber}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ReceivingProgressBar lines={lines} />
            <Badge
              variant={receipt.status === 'complete' ? 'default' : 'outline'}
              className="text-xs"
            >
              {receipt.status === 'complete'
                ? 'Complete'
                : receipt.status === 'in_progress'
                  ? 'In Progress'
                  : receipt.status}
            </Badge>
            {receipt.status !== 'cancelled' && (
              <Button
                size="sm"
                variant="destructive"
                onClick={loadReversalPreview}
              >
                <Trash2 className="w-3 h-3 mr-1" /> Reverse Receipt
              </Button>
            )}
          </div>
        </div>
        <StepIndicator currentStep={step} totalSteps={5} />
        <div className="text-xs text-gray-500 font-medium">
          {STEP_LABELS[step]}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {receipt.status === 'cancelled' ? (
          <div className="h-full flex items-center justify-center">
            <div className="border border-red-200 rounded-lg p-4 max-w-md text-center space-y-2 bg-red-50 dark:bg-red-950/20">
              <XCircle className="w-8 h-8 text-red-600 mx-auto" />
              <div className="text-sm font-semibold">
                Receipt Cancelled / Reversed
              </div>
              <div className="text-xs text-gray-500">
                The original receipt and unit records remain available in
                History for audit traceability.
              </div>
            </div>
          </div>
        ) : receipt.status === 'complete' ? (
          <div className="h-full flex items-center justify-center">
            <div className="border rounded-lg p-4 max-w-md text-center space-y-3 bg-gray-50 dark:bg-gray-900">
              <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
              <div>
                <div className="text-sm font-semibold">Receipt Complete</div>
                <div className="text-xs text-gray-500 mt-1">
                  Use the Docs tab to attach a CoC or other receiving record.
                  Reopen only when receiving data itself needs correction.
                </div>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  onClick={() => reopenActiveReceiptMutation.mutate()}
                  disabled={reopenActiveReceiptMutation.isPending}
                >
                  {reopenActiveReceiptMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Reopen for Adjustment
                </Button>
              </div>
            </div>
          </div>
        ) : (
          step === 0 && (
            <ShipmentInfoStep
              receipt={receipt}
              onNext={() => setStep(1)}
              onUpdate={onReceiptUpdate}
            />
          )
        )}
        {step === 1 && (
          <LineItemsStep
            receipt={receipt}
            onNext={() => setStep(2)}
            onUpdate={onReceiptUpdate}
          />
        )}
        {step === 2 && (
          <UnitSplittingStep
            receipt={receipt}
            onNext={() => setStep(3)}
            onUpdate={onReceiptUpdate}
          />
        )}
        {step === 3 && (
          <DispositionStep
            receipt={receipt}
            onNext={() => setStep(4)}
            onUpdate={onReceiptUpdate}
          />
        )}
        {step === 4 && (
          <PutawayStep
            receipt={receipt}
            onComplete={() => {
              toast.success('Receipt complete!');
            }}
            onUpdate={onReceiptUpdate}
          />
        )}
      </div>

      {receipt.status !== 'complete' && receipt.status !== 'cancelled' && (
        <div className="p-3 border-t flex items-center justify-between bg-white dark:bg-gray-950">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Back
          </Button>
          {step < 4 && (
            <Button
              size="sm"
              onClick={() => setStep((s) => Math.min(4, s + 1))}
            >
              Save & Continue
            </Button>
          )}
        </div>
      )}

      <Dialog open={reversalDialogOpen} onOpenChange={setReversalDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reverse receipt {receipt.receiptNumber}?</DialogTitle>
            <DialogDescription>
              This creates offsetting inventory and ledger entries without
              deleting receipt or traceability records.
            </DialogDescription>
          </DialogHeader>
          {reversalPreview && (
            <div className="space-y-3 text-sm">
              <div className="rounded border p-3 bg-gray-50 dark:bg-gray-900">
                {reversalPreview.unitCount} units ·{' '}
                {reversalPreview.totalQuantity} total quantity
              </div>
              {reversalPreview.blockers.length > 0 && (
                <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800">
                  <div className="font-medium mb-1">Reversal is blocked:</div>
                  <ul className="list-disc pl-5 space-y-1">
                    {reversalPreview.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="receipt-reversal-reason">
                  Required audit reason
                </Label>
                <Textarea
                  id="receipt-reversal-reason"
                  value={reversalReason}
                  onChange={(event) => setReversalReason(event.target.value)}
                  placeholder="Duplicate receipt created from price-only PO revision"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReversalDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={
                !reversalPreview?.canReverse ||
                reversalReason.trim().length < 10 ||
                reverseReceiptMutation.isPending
              }
              onClick={() => reverseReceiptMutation.mutate()}
            >
              {reverseReceiptMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Reverse Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Step 1: Shipment Info
function ShipmentInfoStep({
  receipt,
  onNext,
  onUpdate,
}: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const [form, setForm] = useState({
    carrier: receipt.carrier ?? '',
    trackingNumber: receipt.trackingNumber ?? '',
    packingSlipNumber: receipt.packingSlipNumber ?? '',
    conditionOnArrival: receipt.conditionOnArrival ?? 'good',
    notes: receipt.notes ?? '',
    receivedAt: receipt.receivedAt
      ? receipt.receivedAt.slice(0, 16)
      : new Date().toISOString().slice(0, 16),
  });

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveForm = async (formData: typeof form, notify = false) => {
    setSaving(true);
    try {
      const data = await apiRequest(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify(formData),
      });
      onUpdate({ ...receipt, ...data });
      setDirty(false);
      if (notify) toast.success('Shipment info saved');
    } catch {
      if (notify) toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (partial: Partial<typeof form>) => {
    const next = { ...form, ...partial };
    setForm(next);
    setDirty(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => saveForm(next), 1500);
  };

  const [showDetails, setShowDetails] = useState(
    !!(
      receipt.carrier ||
      receipt.trackingNumber ||
      receipt.packingSlipNumber ||
      receipt.notes ||
      (receipt.conditionOnArrival && receipt.conditionOnArrival !== 'good')
    )
  );

  const mutation = useMutation({
    mutationFn: () => saveForm(form, true),
    onSuccess: () => {
      onNext();
    },
    onError: () => {},
  });

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Date / Time Received</Label>
        <Input
          type="datetime-local"
          className="h-8 text-xs mt-1"
          value={form.receivedAt}
          onChange={(e) => handleChange({ receivedAt: e.target.value })}
          data-testid="input-received-at"
        />
        <p className="text-xs text-gray-400 mt-0.5">
          Defaults to now — adjust if the shipment arrived earlier
        </p>
      </div>

      <div className="rounded-lg border bg-gray-50 dark:bg-gray-900 p-3 text-xs space-y-1">
        <div className="font-semibold text-gray-700 dark:text-gray-200">
          Receiving proof snapshot
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-500">
          <span>
            Receipt:{' '}
            <span className="font-mono text-gray-700 dark:text-gray-300">
              {receipt.receiptNumber}
            </span>
          </span>
          <span>Receiver: {receipt.receiverDisplayName ?? 'Current user'}</span>
          <span>Vendor: {receipt.vendorName ?? 'Manual receipt'}</span>
          <span>PO: {receipt.vendorPoNumber ?? 'Not linked'}</span>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-start text-xs h-7 px-1 text-gray-600 hover:text-gray-900"
        onClick={() => setShowDetails((s) => !s)}
        data-testid="button-toggle-shipment-details"
      >
        <ChevronDown
          className={`w-3 h-3 mr-1 transition-transform ${showDetails ? '' : '-rotate-90'}`}
        />
        {showDetails ? 'Hide' : 'Add'} shipment details (optional)
      </Button>

      {showDetails && (
        <div className="space-y-3 pl-1 border-l-2 border-gray-100 dark:border-gray-800 ml-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Carrier</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={form.carrier}
                onChange={(e) => handleChange({ carrier: e.target.value })}
                placeholder="UPS, FedEx..."
              />
            </div>
            <div>
              <Label className="text-xs">Tracking Number</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={form.trackingNumber}
                onChange={(e) =>
                  handleChange({ trackingNumber: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Packing Slip #</Label>
              <Input
                className="h-8 text-xs mt-1"
                value={form.packingSlipNumber}
                onChange={(e) =>
                  handleChange({ packingSlipNumber: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs">Condition on Arrival</Label>
              <Select
                value={form.conditionOnArrival}
                onValueChange={(v) => handleChange({ conditionOnArrival: v })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea
              className="text-xs mt-1 resize-none"
              rows={3}
              value={form.notes}
              onChange={(e) => handleChange({ notes: e.target.value })}
              placeholder="Any additional notes..."
            />
          </div>
        </div>
      )}

      {dirty && (
        <div className="text-xs text-amber-500 flex items-center gap-1">
          {saving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Autosaving…
            </>
          ) : (
            '● Unsaved changes'
          )}
        </div>
      )}
      <Button
        size="sm"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || saving}
        className="w-full"
        data-testid="button-save-shipment-info"
      >
        {mutation.isPending || saving ? (
          <Loader2 className="w-3 h-3 animate-spin mr-1" />
        ) : (
          <Check className="w-3 h-3 mr-1" />
        )}
        Continue
      </Button>
    </div>
  );
}

// ── Line Items Banner ─────────────────────────────────────────────────────────

export function LineItemsBanner({ lines }: { lines: ReceiptLine[] }) {
  const allReceived =
    lines.length > 0 &&
    lines.every((line) => {
      const ord = Number(line.orderedQty ?? 0);
      const rcv = Number(line.receivedQty ?? 0);
      return ord > 0 && rcv >= ord;
    });

  const overReceivedCount = lines.filter((line) => {
    const ord = Number(line.orderedQty ?? 0);
    const rcv = Number(line.receivedQty ?? 0);
    return ord > 0 && rcv > ord;
  }).length;

  const fullyReceivedCount = lines.filter((line) => {
    const ord = Number(line.orderedQty ?? 0);
    const rcv = Number(line.receivedQty ?? 0);
    return ord > 0 && rcv === ord;
  }).length;

  const bannerText = (() => {
    if (!allReceived) return null;
    if (overReceivedCount === 0) {
      return `All ${lines.length} line${lines.length !== 1 ? 's' : ''} fully received — ready to finalize`;
    }
    const parts: string[] = [];
    if (fullyReceivedCount > 0)
      parts.push(
        `${fullyReceivedCount} line${fullyReceivedCount !== 1 ? 's' : ''} fully received`
      );
    parts.push(
      `${overReceivedCount} line${overReceivedCount !== 1 ? 's' : ''} over-received`
    );
    return `${parts.join(', ')} — ready to finalize`;
  })();

  return (
    <>
      {allReceived && (
        <div
          data-testid="line-items-completion-banner"
          className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-700 px-3 py-2 text-green-800 dark:text-green-300 text-xs font-medium"
        >
          <Check className="w-3.5 h-3.5 shrink-0" />
          {bannerText}
        </div>
      )}
      {overReceivedCount > 0 && (
        <div
          data-testid="line-items-over-received-warning"
          className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-amber-800 dark:text-amber-300 text-xs font-medium"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {overReceivedCount} line{overReceivedCount !== 1 ? 's' : ''} received
          more than ordered — verify quantities before finalizing
        </div>
      )}
    </>
  );
}

// Step 2: Line Items
interface PurchasedItem {
  agPartNumber: string;
  name: string;
  purchaseUnit: string | null;
}

export function LineItemsStep({
  receipt,
  onNext,
  onUpdate,
}: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const lines = receipt.lines ?? [];
  const [addingLine, setAddingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState('');
  const [newLine, setNewLine] = useState({
    agPartNumber: '',
    description: '',
    orderedQty: '',
    receivedQty: '',
    uom: 'EA',
  });
  const [partComboOpen, setPartComboOpen] = useState(false);
  const [partSearch, setPartSearch] = useState('');
  type SortCol =
    'partNumber' | 'description' | 'ordered' | 'received' | 'status';
  const SORT_COL_KEY = 'receivingLines_sortCol';
  const SORT_DIR_KEY = 'receivingLines_sortDir';
  const [sortCol, setSortColState] = useState<SortCol | null>(() => {
    const stored = localStorage.getItem(SORT_COL_KEY);
    return (stored as SortCol | null) ?? null;
  });
  const [sortDir, setSortDirState] = useState<'asc' | 'desc'>(() => {
    const stored = localStorage.getItem(SORT_DIR_KEY);
    return stored === 'desc' ? 'desc' : 'asc';
  });

  function setSortCol(col: SortCol | null) {
    setSortColState(col);
    if (col === null) {
      localStorage.removeItem(SORT_COL_KEY);
    } else {
      localStorage.setItem(SORT_COL_KEY, col);
    }
  }

  function setSortDir(
    dir: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')
  ) {
    setSortDirState((prev) => {
      const next = typeof dir === 'function' ? dir(prev) : dir;
      localStorage.setItem(SORT_DIR_KEY, next);
      return next;
    });
  }

  function handleHeaderClick(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const { data: purchasedItems = [] } = useQuery<PurchasedItem[]>({
    queryKey: ['/api/inventory/items/purchased'],
  });

  const addLineMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/receipts/${receipt.id}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          ...newLine,
          isPartial: Number(newLine.receivedQty) < Number(newLine.orderedQty),
          isOver: Number(newLine.receivedQty) > Number(newLine.orderedQty),
        }),
      }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setAddingLine(false);
      setNewLine({
        agPartNumber: '',
        description: '',
        orderedQty: '',
        receivedQty: '',
        uom: 'EA',
      });
      setPartSearch('');
      setPartComboOpen(false);
    },
    onError: () => toast.error('Failed to add line'),
  });

  const updateReceivedQtyMutation = useMutation({
    mutationFn: ({
      lineId,
      receivedQty,
      orderedQty,
    }: {
      lineId: number;
      receivedQty: string;
      orderedQty?: string;
    }) =>
      apiRequest(`/api/receipts/${receipt.id}/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          receivedQty,
          isPartial: orderedQty
            ? Number(receivedQty) < Number(orderedQty)
            : false,
          isOver: orderedQty ? Number(receivedQty) > Number(orderedQty) : false,
        }),
      }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setEditingLineId(null);
    },
    onError: () => toast.error('Failed to update received qty'),
  });

  return (
    <div className="space-y-3">
      <LineItemsBanner lines={lines} />
      {lines.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
            <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Enter the quantity received for each line.</strong> Click
              the quantity in the <strong>Qty Received</strong> column, type the
              amount that arrived, then select the checkmark to save.
            </span>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left p-2 font-medium">
                    <button
                      className="flex items-center hover:text-blue-600 transition-colors"
                      onClick={() => handleHeaderClick('partNumber')}
                    >
                      Part #<SortIcon col="partNumber" />
                    </button>
                  </th>
                  <th className="text-left p-2 font-medium">
                    <button
                      className="flex items-center hover:text-blue-600 transition-colors"
                      onClick={() => handleHeaderClick('description')}
                    >
                      Description
                      <SortIcon col="description" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-medium">
                    <button
                      className="flex items-center justify-end w-full hover:text-blue-600 transition-colors"
                      onClick={() => handleHeaderClick('ordered')}
                    >
                      Ordered
                      <SortIcon col="ordered" />
                    </button>
                  </th>
                  <th className="text-right p-2 font-medium">
                    <button
                      className="flex items-center justify-end w-full hover:text-blue-600 transition-colors"
                      onClick={() => handleHeaderClick('received')}
                    >
                      Qty Received
                      <SortIcon col="received" />
                    </button>
                  </th>
                  <th className="text-center p-2 font-medium">
                    <button
                      className="flex items-center justify-center w-full hover:text-blue-600 transition-colors"
                      onClick={() => handleHeaderClick('status')}
                    >
                      Status
                      <SortIcon col="status" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...lines]
                  .sort((a, b) =>
                    compareReceiptLines(a, b, { sortCol, sortDir })
                  )
                  .map((line) => {
                    const statusInfo = getLineStatus(
                      line.orderedQty,
                      line.receivedQty
                    );
                    const { isComplete, rowClassName } = statusInfo;
                    const ord = Number(line.orderedQty ?? 0);
                    const rcv = Number(line.receivedQty ?? 0);
                    const isEditing = editingLineId === line.id;
                    return (
                      <tr
                        key={line.id}
                        className={`border-t hover:bg-gray-50 dark:hover:bg-gray-800/50 ${rowClassName}`}
                      >
                        <td
                          className={`p-2 font-mono text-blue-600 ${isComplete ? 'opacity-60' : ''}`}
                        >
                          {line.agPartNumber}
                        </td>
                        <td
                          className={`p-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate ${isComplete ? 'opacity-60' : ''}`}
                        >
                          {line.description}
                        </td>
                        <td
                          className={`p-2 text-right ${isComplete ? 'opacity-60' : ''}`}
                        >
                          {ord > 0 ? `${ord} ${line.uom}` : '—'}
                        </td>
                        <td className="p-2 text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                data-testid={`line-edit-input-${line.id}`}
                                className="h-5 w-16 text-xs text-right p-1"
                                type="number"
                                step="0.001"
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                autoFocus
                              />
                              <Button
                                data-testid={`line-edit-save-${line.id}`}
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() =>
                                  updateReceivedQtyMutation.mutate({
                                    lineId: line.id,
                                    receivedQty: editQty,
                                    orderedQty: line.orderedQty ?? undefined,
                                  })
                                }
                              >
                                <Check className="w-2.5 h-2.5" />
                              </Button>
                              <Button
                                data-testid={`line-edit-cancel-${line.id}`}
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={() => setEditingLineId(null)}
                              >
                                <X className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              data-testid={`line-qty-display-${line.id}`}
                              className={`ml-auto inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-900/60 ${isComplete ? 'opacity-60' : ''}`}
                              onClick={() => {
                                setEditingLineId(line.id);
                                setEditQty(String(rcv));
                              }}
                              title="Enter quantity received"
                              aria-label={`Enter quantity received for ${line.agPartNumber}. Current quantity: ${rcv} ${line.uom}`}
                            >
                              {rcv} {line.uom}
                              <Pencil className="h-3 w-3" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          <LineStatusBadge
                            orderedQty={line.orderedQty}
                            receivedQty={line.receivedQty}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addingLine ? (
        <div className="border rounded-lg p-3 space-y-2 bg-blue-50 dark:bg-blue-900/10">
          <div className="text-xs font-medium text-blue-700">
            Add Receipt Line
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Part #</Label>
              <Popover open={partComboOpen} onOpenChange={setPartComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={partComboOpen}
                    className="h-7 w-full text-xs mt-0.5 justify-between font-normal px-2"
                  >
                    <span className="truncate">
                      {newLine.agPartNumber || 'Search part...'}
                    </span>
                    <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search part # or name..."
                      value={partSearch}
                      onValueChange={setPartSearch}
                      className="h-8 text-xs"
                    />
                    <CommandList>
                      <CommandEmpty>
                        <div className="py-2 px-3 text-xs text-muted-foreground">
                          No match. You can still type a part # manually.
                        </div>
                      </CommandEmpty>
                      <CommandGroup>
                        {purchasedItems
                          .filter((item) => {
                            const q = partSearch.toLowerCase();
                            return (
                              !q ||
                              item.agPartNumber.toLowerCase().includes(q) ||
                              item.name.toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 50)
                          .map((item) => (
                            <CommandItem
                              key={item.agPartNumber}
                              value={`${item.agPartNumber} ${item.name}`}
                              onSelect={() => {
                                setNewLine((f) => ({
                                  ...f,
                                  agPartNumber: item.agPartNumber,
                                  description: item.name,
                                  uom: item.purchaseUnit || f.uom,
                                }));
                                setPartSearch('');
                                setPartComboOpen(false);
                              }}
                              className="text-xs"
                            >
                              <Check
                                className={`mr-1.5 h-3 w-3 ${newLine.agPartNumber === item.agPartNumber ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <span className="font-mono mr-1.5">
                                {item.agPartNumber}
                              </span>
                              <span className="text-muted-foreground truncate">
                                {item.name}
                              </span>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                      {partSearch &&
                        !purchasedItems.some(
                          (i) =>
                            i.agPartNumber.toLowerCase() ===
                            partSearch.toLowerCase()
                        ) && (
                          <CommandGroup>
                            <CommandItem
                              value={`__adhoc__${partSearch}`}
                              onSelect={() => {
                                setNewLine((f) => ({
                                  ...f,
                                  agPartNumber: partSearch,
                                }));
                                setPartSearch('');
                                setPartComboOpen(false);
                              }}
                              className="text-xs text-muted-foreground italic"
                            >
                              Use &ldquo;{partSearch}&rdquo; as part # (ad-hoc)
                            </CommandItem>
                          </CommandGroup>
                        )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">UOM</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                value={newLine.uom}
                onChange={(e) =>
                  setNewLine((f) => ({ ...f, uom: e.target.value }))
                }
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Description</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                value={newLine.description}
                onChange={(e) =>
                  setNewLine((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Ordered Qty</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                type="number"
                value={newLine.orderedQty}
                onChange={(e) =>
                  setNewLine((f) => ({ ...f, orderedQty: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Received Qty</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                type="number"
                value={newLine.receivedQty}
                onChange={(e) =>
                  setNewLine((f) => ({ ...f, receivedQty: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => addLineMutation.mutate()}
              disabled={addLineMutation.isPending}
            >
              {addLineMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Add'
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setAddingLine(false);
                setPartSearch('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setAddingLine(true)}
        >
          <Plus className="w-3 h-3 mr-1" /> Add Line Item
        </Button>
      )}

      {lines.length > 0 && (
        <Button size="sm" className="w-full" onClick={onNext}>
          Continue to Unit Splitting <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// Step 3: Unit Splitting
function UnitSplittingStep({
  receipt,
  onNext,
  onUpdate,
}: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const lines = receipt.lines ?? [];
  const units = receipt.units ?? [];
  const [selectedLineId, setSelectedLineId] = useState<number | null>(
    lines[0]?.id ?? null
  );
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState<Record<string, string>>({
    quantity: '1',
    uom: 'EA',
    unitType: 'other',
  });
  const [inventoryItem, setInventoryItem] = useState<any>(null);

  const selectedLine = lines.find((l) => l.id === selectedLineId);
  const lineUnits = units.filter((u) => u.receiptLineId === selectedLineId);

  // Fetch inventory item for traceability fields
  useEffect(() => {
    if (selectedLine?.agPartNumber) {
      apiRequest(
        `/api/inventory/items/by-part-number/${selectedLine.agPartNumber}`
      )
        .then((item) => setInventoryItem(item))
        .catch(() => setInventoryItem(null));
    } else {
      setInventoryItem(null);
    }
  }, [selectedLine?.agPartNumber]);

  const traceFields = getTraceabilityFields(
    inventoryItem?.itemType,
    inventoryItem?.traceabilityFields,
    inventoryItem?.traceabilityRequired
  );

  // New per-field config takes priority over legacy traceabilityFields when present
  const rawFieldConfig: Record<
    string,
    'required' | 'optional' | 'hidden'
  > | null =
    inventoryItem?.traceabilityFieldConfig &&
    Object.keys(inventoryItem.traceabilityFieldConfig).length > 0
      ? inventoryItem.traceabilityFieldConfig
      : null;

  // Roll-split traceability relaxation: Manufacture Date, Expiration Date, Batch Number,
  // and Lot Number are always optional from this UI even when the part config marks them
  // required. Roll Number + Quantity remain the only enforced fields.
  const ALWAYS_OPTIONAL_TRACE_KEYS = new Set([
    'manufactureDate',
    'expirationDate',
    'batchNumber',
    'lotNumber',
  ]);
  const configuredFields = rawFieldConfig
    ? TRACE_CONFIG_FIELDS.filter(
        (f) => (rawFieldConfig[f.key] ?? 'optional') !== 'hidden'
      ).map((f) => ({
        ...f,
        required:
          !ALWAYS_OPTIONAL_TRACE_KEYS.has(f.key) &&
          (rawFieldConfig[f.key] ?? 'optional') === 'required',
      }))
    : null; // null = fall back to legacy traceFields behavior

  const [splitCount, setSplitCount] = useState('2');
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitMode, setSplitMode] = useState<'equal' | 'by_rolls'>('equal');
  const [rollSqms, setRollSqms] = useState<string[]>(['', '']);
  const [rollNumbers, setRollNumbers] = useState<string[]>(['', '']);
  const [splitTemplate, setSplitTemplate] = useState({
    lotNumber: '',
    batchNumber: '',
    heatLot: '',
    manufactureDate: '',
    expirationDate: '',
    certReference: '',
  });
  const [confirmDeleteUnitId, setConfirmDeleteUnitId] = useState<number | null>(
    null
  );
  const [adjustingUnit, setAdjustingUnit] = useState<ReceivedUnit | null>(null);
  const [adjustUnitForm, setAdjustUnitForm] = useState<Record<string, string>>(
    {}
  );

  const deleteUnitMutation = useMutation({
    mutationFn: (unitId: number) =>
      apiRequest(`/api/receipts/${receipt.id}/units/${unitId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setConfirmDeleteUnitId(null);
      toast.success('Unit removed');
    },
    onError: (err: any) => {
      setConfirmDeleteUnitId(null);
      toast.error(err?.message ?? 'Failed to remove unit');
    },
  });

  const addUnitMutation = useMutation({
    mutationFn: () => {
      // Strip hidden fields from payload before sending to avoid persisting data the part config excludes
      const payload: Record<string, string> = { ...unitForm };
      if (rawFieldConfig && Object.keys(rawFieldConfig).length > 0) {
        for (const f of TRACE_CONFIG_FIELDS) {
          if ((rawFieldConfig[f.key] ?? 'optional') === 'hidden') {
            delete payload[f.key];
          }
        }
      }
      return apiRequest(
        `/api/receipts/${receipt.id}/lines/${selectedLineId}/units`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setShowAddUnit(false);
      setUnitForm({
        quantity: '1',
        uom: selectedLine?.uom ?? 'EA',
        unitType: 'other',
      });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to add unit'),
  });

  const splitLineMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        count: parseInt(splitCount, 10),
      };
      const templateFields = Object.fromEntries(
        Object.entries(splitTemplate).filter(([, value]) => value.trim() !== '')
      );
      if (Object.keys(templateFields).length > 0) {
        payload.templateFields = templateFields;
      }
      if (splitMode === 'by_rolls') {
        payload.sqmPerRollArray = rollSqms.map((v) => parseFloat(v));
        payload.rollNumbers = rollNumbers.map((v) => v.trim());
      }
      return apiRequest(
        `/api/receipts/${receipt.id}/lines/${selectedLineId}/split`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setShowSplitDialog(false);
      if (splitMode === 'by_rolls') {
        const totalSqm = rollSqms.reduce(
          (sum, v) => sum + (parseFloat(v) || 0),
          0
        );
        toast.success(
          `Created ${splitCount} roll units — ${totalSqm.toFixed(3)} ${selectedLine?.uom ?? ''} total`
        );
      } else {
        toast.success(`Line split into ${splitCount} equal units`);
      }
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to split line'),
  });

  const cloneUnitMutation = useMutation({
    mutationFn: (unitId: number) =>
      apiRequest(`/api/receipts/${receipt.id}/units/${unitId}/clone`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      toast.success('Unit cloned');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to clone unit'),
  });

  const beginAdjustUnit = (unit: ReceivedUnit) => {
    setAdjustingUnit(unit);
    setAdjustUnitForm({
      quantity: unit.quantity ?? '',
      uom: unit.uom ?? '',
      unitType: unit.unitType ?? 'other',
      lotNumber: unit.lotNumber ?? '',
      batchNumber: unit.batchNumber ?? '',
      serialNumber: unit.serialNumber ?? '',
      rollNumber: unit.rollNumber ?? '',
      heatLot: unit.heatLot ?? '',
      manufactureDate: unit.manufactureDate
        ? unit.manufactureDate.slice(0, 10)
        : '',
      expirationDate: unit.expirationDate
        ? unit.expirationDate.slice(0, 10)
        : '',
      certReference: unit.certReference ?? '',
      location: unit.location ?? '',
      freezerNumber:
        unit.freezerNumber != null ? String(unit.freezerNumber) : '',
    });
  };

  const adjustUnitMutation = useMutation({
    mutationFn: () => {
      if (!adjustingUnit) throw new Error('No unit selected');
      const payload: Record<string, string | number | null> = {
        quantity: adjustUnitForm.quantity,
        uom: adjustUnitForm.uom,
        unitType: adjustUnitForm.unitType,
        lotNumber: adjustUnitForm.lotNumber || null,
        batchNumber: adjustUnitForm.batchNumber || null,
        serialNumber: adjustUnitForm.serialNumber || null,
        rollNumber: adjustUnitForm.rollNumber || null,
        heatLot: adjustUnitForm.heatLot || null,
        manufactureDate: adjustUnitForm.manufactureDate || null,
        expirationDate: adjustUnitForm.expirationDate || null,
        certReference: adjustUnitForm.certReference || null,
        location: adjustUnitForm.location || null,
        freezerNumber: adjustUnitForm.freezerNumber
          ? parseInt(adjustUnitForm.freezerNumber, 10)
          : null,
      };
      return apiRequest(
        `/api/receipts/${receipt.id}/units/${adjustingUnit.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
    },
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setAdjustingUnit(null);
      toast.success('Unit corrected');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to adjust unit'),
  });

  // Fetch traceability config for every line so we can preview which lines will
  // auto-promote into a single Disposition unit vs. those that strictly require splitting.
  // The Continue button is gated on this resolving so the user can never advance while
  // strictness is unknown — and the final gate is the server's `skipped` response.
  const [lineStrictMap, setLineStrictMap] = useState<
    Record<number, { strict: boolean; fields: string[] }>
  >({});
  const [strictConfigLoading, setStrictConfigLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setStrictConfigLoading(true);
    (async () => {
      const partNumbers = Array.from(
        new Set(
          lines.map((l) => l.agPartNumber).filter((p): p is string => !!p)
        )
      );
      const cfgByPart: Record<string, Record<string, string> | null> = {};
      await Promise.all(
        partNumbers.map(async (pn) => {
          try {
            const item = await apiRequest(
              `/api/inventory/items/by-part-number/${pn}`
            );
            cfgByPart[pn] = item?.traceabilityFieldConfig ?? null;
          } catch {
            cfgByPart[pn] = null;
          }
        })
      );
      if (cancelled) return;
      const STRICT_KEYS = ['serialNumber', 'rollNumber'] as const;
      const next: Record<number, { strict: boolean; fields: string[] }> = {};
      for (const line of lines) {
        const cfg = line.agPartNumber ? cfgByPart[line.agPartNumber] : null;
        const fields = cfg
          ? STRICT_KEYS.filter((f) => (cfg[f] ?? 'optional') === 'required')
          : [];
        next[line.id] = { strict: fields.length > 0, fields: [...fields] };
      }
      setLineStrictMap(next);
      setStrictConfigLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [lines.map((l) => `${l.id}:${l.agPartNumber ?? ''}`).join('|')]);

  // Lines with received qty but no units yet — these are the auto-promote candidates.
  const STRICT_FIELD_LABELS: Record<string, string> = {
    serialNumber: 'Serial #',
    rollNumber: 'Roll #',
  };
  const pendingLines = lines.filter((l) => {
    const qty = parseFloat(String(l.receivedQty ?? '0'));
    if (!Number.isFinite(qty) || qty <= 0) return false;
    return !units.some((u) => u.receiptLineId === l.id);
  });
  const autoPromoteLines = pendingLines.filter(
    (l) => !lineStrictMap[l.id]?.strict
  );
  const strictPendingLines = pendingLines.filter(
    (l) => lineStrictMap[l.id]?.strict
  );

  // Promote any non-split lines into single Disposition units before advancing.
  const ensureUnitsMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/receipts/${receipt.id}/ensure-units`, {
        method: 'POST',
      }),
    onError: (err: any) =>
      toast.error(err?.message ?? 'Failed to prepare units for Disposition'),
  });

  const handleAdvanceToDisposition = async () => {
    try {
      const result = await ensureUnitsMutation.mutateAsync();
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);

      // Server is the source of truth for strict-traceability gating: if any lines
      // were skipped, do NOT advance — surface a toast and keep the user on Step 3.
      const skippedList: Array<{
        agPartNumber: string | null;
        requiredFields: string[];
      }> = Array.isArray(result?.skipped) ? result.skipped : [];
      if (skippedList.length > 0) {
        const summary = skippedList
          .map(
            (s) =>
              `${s.agPartNumber ?? 'Line'} (${(s.requiredFields ?? []).map((f) => STRICT_FIELD_LABELS[f] ?? f).join(', ')})`
          )
          .join('; ');
        toast.error(`Split required before continuing: ${summary}`);
        return;
      }

      const createdCount: number = result?.createdCount ?? 0;
      if (createdCount > 0) {
        toast.success(
          `Promoted ${createdCount} non-split line${createdCount === 1 ? '' : 's'} to Disposition`
        );
      }
      onNext();
    } catch {
      // toast already shown by mutation onError
    }
  };

  return (
    <div className="space-y-3">
      {/* Line selector */}
      {lines.length > 1 && (
        <div>
          <Label className="text-xs">Select Line</Label>
          <Select
            value={String(selectedLineId)}
            onValueChange={(v) => {
              setSelectedLineId(Number(v));
              setShowAddUnit(false);
            }}
          >
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lines.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.agPartNumber ?? 'Line'} — {l.description?.slice(0, 40)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedLine && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">
          <span className="font-medium">{selectedLine.agPartNumber}</span>
          {selectedLine.description && (
            <span className="text-gray-500 ml-2">
              {selectedLine.description}
            </span>
          )}
          <span className="ml-2 text-gray-400">
            Received: {selectedLine.receivedQty} {selectedLine.uom}
          </span>
        </div>
      )}

      {/* Units for this line */}
      <div className="space-y-1">
        {lineUnits.map((unit) => {
          const expStatus = getExpirationStatus(unit.expirationDate);
          const isPending = unit.disposition === 'pending_inspection';
          const isConfirmingDelete = confirmDeleteUnitId === unit.id;
          return (
            <div
              key={unit.id}
              className={`flex items-center justify-between border rounded p-2 text-xs ${expStatus === 'expired' ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : expStatus === 'near_expiry' ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-blue-600">{unit.barcode}</div>
                <div className="text-gray-500">
                  {unit.quantity} {unit.uom} · {unit.unitType}
                </div>
                {unit.lotNumber && (
                  <div className="text-gray-400">Lot: {unit.lotNumber}</div>
                )}
                {unit.batchNumber && (
                  <div className="text-gray-400">Batch: {unit.batchNumber}</div>
                )}
                {unit.rollNumber && (
                  <div className="text-gray-400">Roll: {unit.rollNumber}</div>
                )}
                {unit.heatLot && (
                  <div className="text-gray-400">Heat: {unit.heatLot}</div>
                )}
                {unit.certReference && (
                  <div className="text-gray-400">
                    Cert: {unit.certReference}
                  </div>
                )}
                {unit.expirationDate && (
                  <div
                    className={`flex items-center gap-1 mt-0.5 ${expStatus === 'expired' ? 'text-red-600' : expStatus === 'near_expiry' ? 'text-amber-600' : 'text-gray-400'}`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    {expStatus === 'expired'
                      ? 'EXPIRED'
                      : expStatus === 'near_expiry'
                        ? 'Near Expiry'
                        : 'Exp'}
                    : {unit.expirationDate}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2">
                <DispositionBadge disposition={unit.disposition} />
                {isConfirmingDelete ? (
                  <div className="flex items-center gap-1">
                    <span className="text-red-600 text-xs">Remove?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-5 px-1.5 text-xs"
                      onClick={() => deleteUnitMutation.mutate(unit.id)}
                      disabled={deleteUnitMutation.isPending}
                    >
                      {deleteUnitMutation.isPending ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      ) : (
                        'Yes'
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-xs"
                      onClick={() => setConfirmDeleteUnitId(null)}
                    >
                      No
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-xs"
                      title="Adjust unit"
                      onClick={() => beginAdjustUnit(unit)}
                      disabled={adjustUnitMutation.isPending}
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-xs"
                      title="Clone unit"
                      onClick={() => cloneUnitMutation.mutate(unit.id)}
                      disabled={cloneUnitMutation.isPending}
                    >
                      <Plus className="w-2.5 h-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title={
                        isPending
                          ? 'Remove unit'
                          : 'Cannot remove — unit has been dispositioned'
                      }
                      onClick={() =>
                        isPending && setConfirmDeleteUnitId(unit.id)
                      }
                      disabled={!isPending || cloneUnitMutation.isPending}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Split line helper */}
      {selectedLineId && !showAddUnit && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setShowSplitDialog(true)}
        >
          <ChevronDown className="w-3 h-3 mr-1" /> Split Line into Units
        </Button>
      )}

      <Dialog
        open={!!adjustingUnit}
        onOpenChange={(open) => !open && setAdjustingUnit(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Adjust Received Unit</DialogTitle>
            <DialogDescription className="text-xs">
              Correct quantity, traceability, and storage details. Accepted
              units keep their material-lot link and record an adjustment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {adjustingUnit?.materialLotId && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                This unit already created inventory. Quantity changes will
                adjust the linked material lot when unissued quantity is
                available.
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Qty</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  type="number"
                  step="0.001"
                  value={adjustUnitForm.quantity ?? ''}
                  onChange={(e) =>
                    setAdjustUnitForm((f) => ({
                      ...f,
                      quantity: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">UOM</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  value={adjustUnitForm.uom ?? ''}
                  onChange={(e) =>
                    setAdjustUnitForm((f) => ({ ...f, uom: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Unit Type</Label>
                <Select
                  value={adjustUnitForm.unitType ?? 'other'}
                  onValueChange={(v) =>
                    setAdjustUnitForm((f) => ({ ...f, unitType: v }))
                  }
                >
                  <SelectTrigger className="h-7 text-xs mt-0.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['lotNumber', 'Lot Number'],
                ['batchNumber', 'Batch Number'],
                ['serialNumber', 'Serial Number'],
                ['rollNumber', 'Roll Number'],
                ['heatLot', 'Heat Lot'],
                ['certReference', 'Cert Reference'],
              ].map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    className="h-7 text-xs mt-0.5"
                    value={adjustUnitForm[key] ?? ''}
                    onChange={(e) =>
                      setAdjustUnitForm((f) => ({
                        ...f,
                        [key]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">Mfg Date</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  type="date"
                  value={adjustUnitForm.manufactureDate ?? ''}
                  onChange={(e) =>
                    setAdjustUnitForm((f) => ({
                      ...f,
                      manufactureDate: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Exp Date</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  type="date"
                  value={adjustUnitForm.expirationDate ?? ''}
                  onChange={(e) =>
                    setAdjustUnitForm((f) => ({
                      ...f,
                      expirationDate: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Location</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  value={adjustUnitForm.location ?? ''}
                  onChange={(e) =>
                    setAdjustUnitForm((f) => ({
                      ...f,
                      location: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Freezer #</Label>
                <Input
                  className="h-7 text-xs mt-0.5"
                  type="number"
                  min={1}
                  value={adjustUnitForm.freezerNumber ?? ''}
                  onChange={(e) =>
                    setAdjustUnitForm((f) => ({
                      ...f,
                      freezerNumber: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdjustingUnit(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => adjustUnitMutation.mutate()}
              disabled={
                adjustUnitMutation.isPending ||
                !adjustUnitForm.quantity ||
                Number(adjustUnitForm.quantity) <= 0
              }
            >
              {adjustUnitMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Save Correction'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split dialog */}
      <Dialog
        open={showSplitDialog}
        onOpenChange={(open) => {
          setShowSplitDialog(open);
          if (!open) {
            setSplitMode('equal');
            setSplitCount('2');
            setRollSqms(['', '']);
            setRollNumbers(['', '']);
            setSplitTemplate({
              lotNumber: '',
              batchNumber: '',
              heatLot: '',
              manufactureDate: '',
              expirationDate: '',
              certReference: '',
            });
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Split Line into Units</DialogTitle>
            <DialogDescription className="text-xs">
              Choose how to split this line into individual traceable units.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Mode selector */}
            <div>
              <Label className="text-xs">Split mode</Label>
              <Select
                value={splitMode}
                onValueChange={(v) => {
                  const next = v as 'equal' | 'by_rolls';
                  setSplitMode(next);
                  if (next === 'by_rolls') {
                    const n = Math.max(
                      2,
                      Math.min(200, parseInt(splitCount, 10) || 2)
                    );
                    setRollSqms((prev) => {
                      const arr = Array(n).fill('');
                      for (let i = 0; i < Math.min(prev.length, n); i++)
                        arr[i] = prev[i];
                      return arr;
                    });
                    setRollNumbers((prev) => {
                      const arr = Array(n).fill('');
                      for (let i = 0; i < Math.min(prev.length, n); i++)
                        arr[i] = prev[i];
                      return arr;
                    });
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">
                    Equal split — divide total quantity evenly
                  </SelectItem>
                  <SelectItem value="by_rolls">
                    By rolls — enter exact roll # and SQM
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded p-2 space-y-2 bg-gray-50 dark:bg-gray-900">
              <div className="text-xs font-medium text-gray-600">
                Traceability copied to created units
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Lot #</Label>
                  <Input
                    className="h-7 text-xs mt-0.5"
                    value={splitTemplate.lotNumber}
                    onChange={(e) =>
                      setSplitTemplate((f) => ({
                        ...f,
                        lotNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Batch #</Label>
                  <Input
                    className="h-7 text-xs mt-0.5"
                    value={splitTemplate.batchNumber}
                    onChange={(e) =>
                      setSplitTemplate((f) => ({
                        ...f,
                        batchNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Heat #</Label>
                  <Input
                    className="h-7 text-xs mt-0.5"
                    value={splitTemplate.heatLot}
                    onChange={(e) =>
                      setSplitTemplate((f) => ({
                        ...f,
                        heatLot: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Cert Ref</Label>
                  <Input
                    className="h-7 text-xs mt-0.5"
                    value={splitTemplate.certReference}
                    onChange={(e) =>
                      setSplitTemplate((f) => ({
                        ...f,
                        certReference: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Mfg Date</Label>
                  <Input
                    type="date"
                    className="h-7 text-xs mt-0.5"
                    value={splitTemplate.manufactureDate}
                    onChange={(e) =>
                      setSplitTemplate((f) => ({
                        ...f,
                        manufactureDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">Exp Date</Label>
                  <Input
                    type="date"
                    className="h-7 text-xs mt-0.5"
                    value={splitTemplate.expirationDate}
                    onChange={(e) =>
                      setSplitTemplate((f) => ({
                        ...f,
                        expirationDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            {splitMode === 'equal' ? (
              <div>
                <Label className="text-xs">Number of units</Label>
                <Input
                  type="number"
                  min="2"
                  max="200"
                  className="h-8 text-xs mt-1"
                  value={splitCount}
                  onChange={(e) => setSplitCount(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Each unit will receive{' '}
                  {selectedLine
                    ? (
                        parseFloat(selectedLine.receivedQty || '0') /
                        (parseInt(splitCount, 10) || 1)
                      ).toFixed(3)
                    : '—'}{' '}
                  {selectedLine?.uom ?? ''}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Number of rolls</Label>
                  <Input
                    type="number"
                    min="2"
                    max="200"
                    className="h-8 text-xs mt-1"
                    value={splitCount}
                    onChange={(e) => {
                      const n = Math.max(
                        2,
                        Math.min(200, parseInt(e.target.value, 10) || 2)
                      );
                      setSplitCount(String(n));
                      setRollSqms((prev) => {
                        const next = Array(n).fill('');
                        for (let i = 0; i < Math.min(prev.length, n); i++)
                          next[i] = prev[i];
                        return next;
                      });
                      setRollNumbers((prev) => {
                        const next = Array(n).fill('');
                        for (let i = 0; i < Math.min(prev.length, n); i++)
                          next[i] = prev[i];
                        return next;
                      });
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Enter the exact supplier/manufacturer roll number for each
                  roll before creating the units.
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {rollSqms.map((val, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[56px_1fr_1fr_34px] items-center gap-2"
                    >
                      <Label className="text-xs w-14 shrink-0">
                        Roll {idx + 1}
                      </Label>
                      <Input
                        className="h-7 text-xs"
                        placeholder="Exact roll #"
                        value={rollNumbers[idx] ?? ''}
                        onChange={(e) =>
                          setRollNumbers((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.value;
                            return next;
                          })
                        }
                      />
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        className="h-7 text-xs"
                        placeholder="e.g. 50"
                        value={val}
                        onChange={(e) =>
                          setRollSqms((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.value;
                            return next;
                          })
                        }
                      />
                      <span className="text-xs text-gray-400 shrink-0">
                        {selectedLine?.uom ?? ''}
                      </span>
                    </div>
                  ))}
                </div>
                {(() => {
                  const total = rollSqms.reduce((sum, v) => {
                    const n = parseFloat(v);
                    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
                  }, 0);
                  return (
                    <p className="text-xs text-gray-500">
                      Total: {total.toFixed(3)} {selectedLine?.uom ?? ''} across{' '}
                      {rollSqms.length} rolls
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSplitDialog(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => splitLineMutation.mutate()}
              disabled={
                splitLineMutation.isPending ||
                parseInt(splitCount, 10) < 2 ||
                (splitMode === 'by_rolls' &&
                  (rollNumbers.some((v) => !v.trim()) ||
                    rollSqms.some((v) => {
                      const n = parseFloat(v);
                      return !Number.isFinite(n) || n <= 0;
                    })))
              }
            >
              {splitLineMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : splitMode === 'by_rolls' ? (
                `Create ${splitCount} Roll Units`
              ) : (
                `Create ${splitCount} Equal Units`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAddUnit ? (
        <div className="border rounded-lg p-3 space-y-2 bg-blue-50 dark:bg-blue-900/10">
          <div className="text-xs font-medium text-blue-700">
            Add Traceable Unit
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Qty</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                type="number"
                step="0.001"
                value={unitForm.quantity}
                onChange={(e) =>
                  setUnitForm((f) => ({ ...f, quantity: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">UOM</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                value={unitForm.uom ?? ''}
                onChange={(e) =>
                  setUnitForm((f) => ({ ...f, uom: e.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Unit Type</Label>
              <Select
                value={unitForm.unitType ?? 'other'}
                onValueChange={(v) =>
                  setUnitForm((f) => ({ ...f, unitType: v }))
                }
              >
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Traceability fields — per-field config takes priority over legacy */}
          {configuredFields !== null ? (
            configuredFields.length > 0 ? (
              <div className="border-t pt-2 mt-2">
                <div className="text-xs font-medium text-gray-600 mb-2">
                  Traceability Fields
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {configuredFields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-xs">
                        {field.label}
                        {field.required && (
                          <span className="text-red-500 ml-0.5">*</span>
                        )}
                      </Label>
                      <Input
                        className="h-7 text-xs mt-0.5"
                        type={field.type}
                        value={unitForm[field.key] ?? ''}
                        onChange={(e) =>
                          setUnitForm((f) => ({
                            ...f,
                            [field.key]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-t pt-2 mt-2 text-xs text-muted-foreground">
                All traceability fields are set to Not Captured for this part.
              </div>
            )
          ) : traceFields.length > 0 ? (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs font-medium text-gray-600 mb-2">
                Traceability Fields
              </div>
              <div className="grid grid-cols-2 gap-2">
                {traceFields.map((field) => (
                  <div key={field.key}>
                    <Label className="text-xs">
                      {field.label}
                      {field.required && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                    </Label>
                    <Input
                      className="h-7 text-xs mt-0.5"
                      type={field.type}
                      value={unitForm[field.key] ?? ''}
                      onChange={(e) =>
                        setUnitForm((f) => ({
                          ...f,
                          [field.key]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'lotNumber', label: 'Lot #', type: 'text' },
                { key: 'batchNumber', label: 'Batch #', type: 'text' },
                { key: 'serialNumber', label: 'Serial #', type: 'text' },
                { key: 'certReference', label: 'Cert Ref', type: 'text' },
                { key: 'manufactureDate', label: 'Mfg Date', type: 'date' },
                { key: 'expirationDate', label: 'Exp Date', type: 'date' },
              ].map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input
                    className="h-7 text-xs mt-0.5"
                    type={f.type}
                    value={unitForm[f.key] ?? ''}
                    onChange={(e) =>
                      setUnitForm((fm) => ({ ...fm, [f.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (configuredFields !== null) {
                  const missing = configuredFields
                    .filter((f) => f.required && !unitForm[f.key]?.trim())
                    .map((f) => f.label);
                  if (missing.length > 0) {
                    toast.error(
                      `Required fields missing: ${missing.join(', ')}`
                    );
                    return;
                  }
                }
                addUnitMutation.mutate();
              }}
              disabled={addUnitMutation.isPending}
            >
              {addUnitMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Add Unit'
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowAddUnit(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => setShowAddUnit(true)}
          disabled={!selectedLineId}
        >
          <Plus className="w-3 h-3 mr-1" /> Add Unit for this Line
        </Button>
      )}

      {(autoPromoteLines.length > 0 || strictPendingLines.length > 0) && (
        <div className="space-y-1.5 text-xs">
          {autoPromoteLines.length > 0 && (
            <div className="border border-blue-200 bg-blue-50 dark:bg-blue-900/10 rounded p-2">
              <div className="font-medium text-blue-700 mb-0.5">
                Will be received as a single unit on Continue
              </div>
              <ul className="text-blue-700/80 list-disc ml-4">
                {autoPromoteLines.map((l) => (
                  <li key={l.id} data-testid={`autopromote-line-${l.id}`}>
                    {l.agPartNumber ?? 'Line'} — {l.receivedQty} {l.uom ?? ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {strictPendingLines.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 dark:bg-amber-900/10 rounded p-2">
              <div className="font-medium text-amber-700 mb-0.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Must be split before
                continuing
              </div>
              <ul className="text-amber-700/80 list-disc ml-4">
                {strictPendingLines.map((l) => {
                  const fields = lineStrictMap[l.id]?.fields ?? [];
                  return (
                    <li key={l.id} data-testid={`strict-line-${l.id}`}>
                      {l.agPartNumber ?? 'Line'} — requires{' '}
                      {fields
                        .map((f) => STRICT_FIELD_LABELS[f] ?? f)
                        .join(', ')}{' '}
                      per unit
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {(units.length > 0 || pendingLines.length > 0) && (
        <Button
          size="sm"
          className="w-full"
          onClick={handleAdvanceToDisposition}
          disabled={
            ensureUnitsMutation.isPending ||
            strictConfigLoading ||
            strictPendingLines.length > 0
          }
          data-testid="button-continue-to-disposition"
          title={
            strictConfigLoading
              ? 'Checking traceability requirements…'
              : strictPendingLines.length > 0
                ? 'Split the highlighted lines before continuing'
                : undefined
          }
        >
          {ensureUnitsMutation.isPending || strictConfigLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              Continue to Disposition <ChevronRight className="w-3 h-3 ml-1" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}

// Step 4: Disposition
export function DispositionStep({
  receipt,
  onNext,
  onUpdate,
}: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const units = receipt.units ?? [];
  const NONE_SENTINEL = '__none__';
  const [settingDisposition, setSettingDisposition] = useState<{
    unitId: number;
    disposition: string;
    notes: string;
    rejectionOutcome: string;
    departmentId: string;
    approverEmployeeId: string;
    supervisorConfirmed: boolean;
  } | null>(null);
  const [approvalScope, setApprovalScope] = useState<'all' | 'per_item'>('all');
  const [defaultApprovalDepartmentId, setDefaultApprovalDepartmentId] =
    useState(NONE_SENTINEL);
  const [defaultApproverEmployeeId, setDefaultApproverEmployeeId] =
    useState('');
  const [acceptAllConfirmationOpen, setAcceptAllConfirmationOpen] =
    useState(false);
  const [dispositionError, setDispositionError] = useState<{
    error: string;
    missingDocuments?: string[];
  } | null>(null);

  // Safety net: when Disposition opens, ensure any non-split lines have been promoted
  // into single units so they appear here even if the Step 3 → 4 promotion was skipped
  // (e.g., user navigated directly to Step 4 by other means). If the server reports any
  // skipped strict-traceability lines, surface a persistent banner so the receiver knows
  // those lines won't appear here until they go back to Step 3 and split them.
  const [skippedStrictLines, setSkippedStrictLines] = useState<
    Array<{
      lineId: number;
      agPartNumber: string | null;
      requiredFields: string[];
    }>
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await apiRequest(
          `/api/receipts/${receipt.id}/ensure-units`,
          { method: 'POST' }
        );
        if (cancelled) return;
        const skippedList = Array.isArray(result?.skipped)
          ? result.skipped
          : [];
        setSkippedStrictLines(skippedList);
        if ((result?.createdCount ?? 0) > 0) {
          const updated = await apiRequest(`/api/receipts/${receipt.id}`);
          if (!cancelled) onUpdate(updated);
        }
      } catch {
        // Non-fatal: Step 3 already attempted promotion; user can still split manually.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once per receipt id; we deliberately don't depend on receipt.units to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt.id]);

  const STRICT_FIELD_LABELS_DISPO: Record<string, string> = {
    serialNumber: 'Serial #',
    rollNumber: 'Roll #',
    lotNumber: 'Lot #',
  };

  const { data: departments = [] } = useQuery<InventoryDepartment[]>({
    queryKey: ['/api/inventory/departments'],
  });

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ['/api/employees'],
  });

  const { data: currentUser } = useQuery<{
    id: number;
    username: string;
    role: string;
    employeeId?: number;
  } | null>({
    queryKey: ['currentUser'],
  });

  const activeEmployees = useMemo(
    () => employees.filter((emp) => emp.isActive !== false),
    [employees]
  );

  useEffect(() => {
    if (
      defaultApproverEmployeeId ||
      !currentUser?.employeeId ||
      activeEmployees.length === 0
    )
      return;
    const currentEmployee = activeEmployees.find(
      (emp) => emp.id === currentUser.employeeId
    );
    if (currentEmployee)
      setDefaultApproverEmployeeId(String(currentEmployee.id));
  }, [activeEmployees, currentUser?.employeeId, defaultApproverEmployeeId]);

  const employeeLabel = (employee: EmployeeOption) => {
    const displayName =
      employee.preferredName || employee.name || `Employee ${employee.id}`;
    return employee.employeeCode
      ? `${displayName} (${employee.employeeCode})`
      : displayName;
  };

  const selectedDefaultDepartment = departments.find(
    (d) => String(d.id) === defaultApprovalDepartmentId
  );
  const selectedDefaultApprover = activeEmployees.find(
    (emp) => String(emp.id) === defaultApproverEmployeeId
  );
  const approvalDefaultsLabel = [
    selectedDefaultDepartment?.name ?? 'Receiving',
    selectedDefaultApprover
      ? employeeLabel(selectedDefaultApprover)
      : (currentUser?.username ?? 'Current user'),
  ].join(' / ');

  // Fetch missing required docs for this receipt
  const { data: requiredDocsData } = useQuery({
    queryKey: ['/api/receipts', receipt.id, 'required-docs'],
    queryFn: () => apiRequest(`/api/receipts/${receipt.id}/required-docs`),
    enabled: !!receipt.id,
    staleTime: 30000,
  });

  const hasMissingDocs = requiredDocsData?.hasMissing;
  const missingByPart: Record<string, string[]> =
    requiredDocsData?.missingByPartNumber ?? {};

  const dispositionMutation = useMutation({
    mutationFn: async () => {
      const draft = settingDisposition!;
      const selectedDepartment = departments.find(
        (d) => String(d.id) === draft.departmentId
      );
      const selectedApprover = activeEmployees.find(
        (emp) => String(emp.id) === draft.approverEmployeeId
      );
      const finalDisposition =
        draft.disposition === 'rejected'
          ? draft.rejectionOutcome
          : draft.disposition;
      const notes = [
        draft.notes.trim(),
        `Approved department: ${selectedDepartment?.name ?? 'Receiving'}`,
        selectedApprover
          ? `Approved employee: ${employeeLabel(selectedApprover)}`
          : `Approved employee: ${currentUser?.username ?? 'Current user'}`,
        `Approval scope: ${approvalScope === 'all' ? 'All items' : 'Per item'}`,
        draft.supervisorConfirmed ? 'Supervisor confirmation recorded' : '',
      ]
        .filter(Boolean)
        .join('\n');
      if (
        selectedDepartment &&
        receipt.departmentId !== selectedDepartment.id
      ) {
        await apiRequest(`/api/receipts/${receipt.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ departmentId: selectedDepartment.id }),
        });
      } else if (!selectedDepartment && receipt.departmentId) {
        await apiRequest(`/api/receipts/${receipt.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ departmentId: null }),
        });
      }
      return apiRequest(
        `/api/receipts/${receipt.id}/units/${draft.unitId}/disposition`,
        {
          method: 'POST',
          body: JSON.stringify({ disposition: finalDisposition, notes }),
        }
      );
    },
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setSettingDisposition(null);
      setDispositionError(null);
      toast.success('Disposition set');
    },
    onError: (err: any) => {
      if (err?.missingDocuments) {
        setDispositionError({
          error: err.message ?? 'Missing required documents',
          missingDocuments: err.missingDocuments,
        });
        apiRequest(`/api/receipts/${receipt.id}`)
          .then(onUpdate)
          .catch(() => {});
      } else if (err?.expirationStatus) {
        setDispositionError({ error: err.message ?? 'Unit is expired' });
        toast.error(err.message ?? 'Unit is expired');
      } else {
        toast.error(err?.message ?? 'Failed to set disposition');
      }
    },
  });

  const pendingUnits = units.filter(
    (unit) => unit.disposition === 'pending_inspection'
  );
  const expiredPendingUnits = pendingUnits.filter(
    (unit) => getExpirationStatus(unit.expirationDate) === 'expired'
  );

  const acceptAllMutation = useMutation({
    mutationFn: async () => {
      const selectedDepartment = departments.find(
        (d) => String(d.id) === defaultApprovalDepartmentId
      );
      const selectedApprover = activeEmployees.find(
        (emp) => String(emp.id) === defaultApproverEmployeeId
      );
      const notes = [
        'Bulk accepted from Receiving Control Center',
        `Approved department: ${selectedDepartment?.name ?? 'Receiving'}`,
        selectedApprover
          ? `Approved employee: ${employeeLabel(selectedApprover)}`
          : `Approved employee: ${currentUser?.username ?? 'Current user'}`,
        'Approval scope: All items',
      ].join('\n');

      if (
        selectedDepartment &&
        receipt.departmentId !== selectedDepartment.id
      ) {
        await apiRequest(`/api/receipts/${receipt.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ departmentId: selectedDepartment.id }),
        });
      } else if (!selectedDepartment && receipt.departmentId) {
        await apiRequest(`/api/receipts/${receipt.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ departmentId: null }),
        });
      }

      const results = await Promise.allSettled(
        pendingUnits.map((unit) =>
          apiRequest(
            `/api/receipts/${receipt.id}/units/${unit.id}/disposition`,
            {
              method: 'POST',
              body: JSON.stringify({ disposition: 'accepted', notes }),
            }
          )
        )
      );
      return {
        accepted: results.filter((result) => result.status === 'fulfilled')
          .length,
        failed: results.filter((result) => result.status === 'rejected').length,
      };
    },
    onSuccess: async ({ accepted, failed }) => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setAcceptAllConfirmationOpen(false);
      if (failed > 0) {
        toast.error(
          `Accepted ${accepted} unit(s); ${failed} unit(s) need attention`
        );
      } else {
        toast.success(`Accepted all ${accepted} pending unit(s)`);
      }
    },
    onError: (err: any) =>
      toast.error(err?.message ?? 'Failed to accept pending units'),
  });

  return (
    <div className="space-y-2">
      {/* Strict-traceability lines that were skipped by ensure-units */}
      {skippedStrictLines.length > 0 && (
        <div
          className="border border-amber-300 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3 text-xs"
          data-testid="banner-skipped-strict-lines"
        >
          <div className="flex items-center gap-1.5 font-medium text-amber-700 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Lines awaiting split — not
            shown below
          </div>
          {skippedStrictLines.map((s) => (
            <div key={s.lineId}>
              <span className="font-medium">
                {s.agPartNumber ?? `Line ${s.lineId}`}:
              </span>{' '}
              requires{' '}
              {(s.requiredFields ?? [])
                .map((f) => STRICT_FIELD_LABELS_DISPO[f] ?? f)
                .join(', ')}{' '}
              per unit
            </div>
          ))}
          <div className="text-amber-600 mt-1">
            Go back to Step 3 (Unit Splitting) to split these lines before they
            can be dispositioned.
          </div>
        </div>
      )}

      {/* Missing required docs banner */}
      {hasMissingDocs && (
        <div className="border border-amber-300 bg-amber-50 dark:bg-amber-900/10 rounded-lg p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-amber-700 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" /> Required Documents Missing
          </div>
          {Object.entries(missingByPart).map(([partNum, docs]) => (
            <div key={partNum}>
              <span className="font-medium">{partNum}:</span> {docs.join(', ')}
            </div>
          ))}
          <div className="text-amber-600 mt-1">
            Upload missing docs in the Documents tab before accepting units.
          </div>
        </div>
      )}

      {units.length === 0 && (
        <div className="text-center text-xs text-gray-500 py-4">
          No units to disposition yet
        </div>
      )}
      {units.length > 0 && (
        <div className="border rounded-lg p-3 bg-slate-50 dark:bg-slate-900/20 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium">Approval Defaults</div>
              <div className="text-xs text-gray-500">
                Applied when opening an item disposition.
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-normal">
              {approvalScope === 'all' ? 'All items' : 'Per item'}
            </Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Approved Department</Label>
              <Select
                value={defaultApprovalDepartmentId}
                onValueChange={setDefaultApprovalDepartmentId}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue placeholder="Receiving" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>Receiving</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={String(dept.id)}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Approved Employee</Label>
              <Select
                value={defaultApproverEmployeeId || NONE_SENTINEL}
                onValueChange={(v) =>
                  setDefaultApproverEmployeeId(v === NONE_SENTINEL ? '' : v)
                }
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue
                    placeholder={currentUser?.username ?? 'Current user'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>
                    {currentUser?.username ?? 'Current user'}
                  </SelectItem>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {employeeLabel(emp)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Apply To</Label>
              <Select
                value={approvalScope}
                onValueChange={(v) => setApprovalScope(v as 'all' | 'per_item')}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All items</SelectItem>
                  <SelectItem value="per_item">Per item</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="text-[11px] text-gray-500">
            Current approval default:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {approvalDefaultsLabel}
            </span>
          </div>
          {approvalScope === 'all' && pendingUnits.length > 0 && (
            <Button
              size="sm"
              className="w-full h-8 bg-green-600 hover:bg-green-700"
              onClick={() => setAcceptAllConfirmationOpen(true)}
              disabled={
                acceptAllMutation.isPending || expiredPendingUnits.length > 0
              }
              data-testid="button-accept-all-pending"
              title={
                expiredPendingUnits.length > 0
                  ? 'Resolve expired units before accepting all'
                  : undefined
              }
            >
              {acceptAllMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <CheckCircle2 className="w-3 h-3 mr-1" />
              )}
              Accept All {pendingUnits.length} Pending Unit
              {pendingUnits.length === 1 ? '' : 's'}
            </Button>
          )}
          {approvalScope === 'all' && expiredPendingUnits.length > 0 && (
            <div className="text-[11px] text-red-600">
              Accept All is locked until {expiredPendingUnits.length} expired
              unit{expiredPendingUnits.length === 1 ? ' is' : 's are'} corrected
              or dispositioned.
            </div>
          )}
        </div>
      )}
      {units.map((unit) => {
        const expStatus = getExpirationStatus(unit.expirationDate);
        return (
          <div
            key={unit.id}
            className={`border rounded-lg p-3 ${expStatus === 'expired' ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-mono text-xs text-blue-600">
                  {unit.barcode}
                </div>
                <div className="text-xs text-gray-500">
                  {unit.quantity} {unit.uom} · {unit.unitType}
                </div>
                {expStatus === 'expired' && (
                  <div className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-2.5 h-2.5" /> EXPIRED — cannot
                    accept
                  </div>
                )}
                {expStatus === 'near_expiry' && (
                  <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" /> Expires{' '}
                    {unit.expirationDate}
                  </div>
                )}
              </div>
              <DispositionBadge disposition={unit.disposition} />
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                ['accepted', 'document_hold', 'quarantine', 'rejected'] as const
              ).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={unit.disposition === d ? 'default' : 'outline'}
                  className="h-6 text-xs px-2"
                  disabled={d === 'accepted' && expStatus === 'expired'}
                  onClick={() => {
                    setSettingDisposition({
                      unitId: unit.id,
                      disposition: d,
                      notes: '',
                      rejectionOutcome: 'rejected_returned',
                      departmentId:
                        defaultApprovalDepartmentId === NONE_SENTINEL
                          ? ''
                          : defaultApprovalDepartmentId,
                      approverEmployeeId: defaultApproverEmployeeId,
                      supervisorConfirmed: false,
                    });
                    setDispositionError(null);
                  }}
                >
                  {d === 'accepted' && (
                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                  )}
                  {d === 'document_hold' && (
                    <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                  )}
                  {d === 'quarantine' && (
                    <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                  )}
                  {d === 'rejected' && <XCircle className="w-2.5 h-2.5 mr-1" />}
                  {d === 'accepted' && unit.disposition === 'document_hold'
                    ? 'Release'
                    : DISPOSITION_LABELS[d]}
                </Button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Disposition dialog */}
      <Dialog
        open={!!settingDisposition}
        onOpenChange={(open) => {
          if (!open) {
            setSettingDisposition(null);
            setDispositionError(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Set Disposition</DialogTitle>
          </DialogHeader>
          {settingDisposition && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">
                Setting disposition to:{' '}
                <span className="font-medium">
                  {DISPOSITION_LABELS[settingDisposition.disposition]}
                </span>
              </div>
              <div>
                <Label className="text-xs">Approved Department</Label>
                <Select
                  value={settingDisposition.departmentId || NONE_SENTINEL}
                  onValueChange={(v) =>
                    setSettingDisposition((s) =>
                      s
                        ? { ...s, departmentId: v === NONE_SENTINEL ? '' : v }
                        : s
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Receiving" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_SENTINEL}>Receiving</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={String(dept.id)}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Approved Employee</Label>
                <Select
                  value={settingDisposition.approverEmployeeId || NONE_SENTINEL}
                  onValueChange={(v) =>
                    setSettingDisposition((s) =>
                      s
                        ? {
                            ...s,
                            approverEmployeeId: v === NONE_SENTINEL ? '' : v,
                          }
                        : s
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue
                      placeholder={currentUser?.username ?? 'Current user'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_SENTINEL}>
                      {currentUser?.username ?? 'Current user'}
                    </SelectItem>
                    {activeEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {employeeLabel(emp)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {settingDisposition.disposition === 'rejected' && (
                <div>
                  <Label className="text-xs">Rejected Disposition</Label>
                  <Select
                    value={settingDisposition.rejectionOutcome}
                    onValueChange={(v) =>
                      setSettingDisposition((s) =>
                        s ? { ...s, rejectionOutcome: v } : s
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REJECTION_OUTCOMES.map((outcome) => (
                        <SelectItem key={outcome.value} value={outcome.value}>
                          {outcome.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(settingDisposition.disposition === 'quarantine' ||
                settingDisposition.disposition === 'rejected') && (
                <div>
                  <Label className="text-xs">Reason (required)</Label>
                  <Textarea
                    className="text-xs mt-1 resize-none"
                    rows={2}
                    value={settingDisposition.notes}
                    onChange={(e) =>
                      setSettingDisposition((s) =>
                        s ? { ...s, notes: e.target.value } : s
                      )
                    }
                    placeholder="Reason for quarantine/rejection..."
                  />
                </div>
              )}
              <label className="flex items-start gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={settingDisposition.supervisorConfirmed}
                  onChange={(e) =>
                    setSettingDisposition((s) =>
                      s ? { ...s, supervisorConfirmed: e.target.checked } : s
                    )
                  }
                />
                Department supervisor reviewed or authorized this disposition.
              </label>
              {/* Server-side doc / expiration error feedback */}
              {dispositionError && (
                <div className="border border-red-300 bg-red-50 dark:bg-red-900/10 rounded p-2 text-xs text-red-700">
                  <div className="font-medium mb-0.5">
                    {dispositionError.error}
                  </div>
                  {dispositionError.missingDocuments &&
                    dispositionError.missingDocuments.length > 0 && (
                      <ul className="list-disc list-inside space-y-0.5">
                        {dispositionError.missingDocuments.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSettingDisposition(null);
                setDispositionError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => dispositionMutation.mutate()}
              disabled={
                dispositionMutation.isPending ||
                ((settingDisposition?.disposition === 'quarantine' ||
                  settingDisposition?.disposition === 'rejected') &&
                  !settingDisposition?.notes)
              }
            >
              {dispositionMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Confirm'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={acceptAllConfirmationOpen}
        onOpenChange={setAcceptAllConfirmationOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Accept all pending units?
            </DialogTitle>
            <DialogDescription className="text-xs">
              This will accept {pendingUnits.length} pending unit
              {pendingUnits.length === 1 ? '' : 's'} using the approval default:{' '}
              {approvalDefaultsLabel}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAcceptAllConfirmationOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => acceptAllMutation.mutate()}
              disabled={acceptAllMutation.isPending}
              data-testid="button-confirm-accept-all"
            >
              {acceptAllMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              Accept All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {units.length > 0 && (
        <Button size="sm" className="w-full mt-2" onClick={onNext}>
          Continue to Putaway <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// Step 5: Putaway
export function PutawayStep({
  receipt,
  onComplete,
  onUpdate,
}: {
  receipt: Receipt;
  onComplete: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const units = receipt.units ?? [];
  const queryClient = useQueryClient();

  const NONE_SENTINEL = '__none__';
  const LEAVE_OPEN_SENTINEL = '__leave_open__';

  const [batchLocation, setBatchLocation] = useState('');
  const [batchFreezer, setBatchFreezer] = useState('');
  const [batchStorageType, setBatchStorageType] =
    useState<(typeof STORAGE_TYPES)[number]>('conex');
  const [batchStorageIdentifier, setBatchStorageIdentifier] = useState('');
  const [batchStorageNote, setBatchStorageNote] = useState('');
  const [batchTargetProjectId, setBatchTargetProjectId] =
    useState(NONE_SENTINEL);
  const [batchPending, setBatchPending] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState(
    receipt.departmentId ? String(receipt.departmentId) : NONE_SENTINEL
  );
  const [deptApplyPending, setDeptApplyPending] = useState(false);

  const { data: departments = [] } = useQuery<InventoryDepartment[]>({
    queryKey: ['/api/inventory/departments'],
  });

  const { data: projectTargetsResponse } = useQuery<{
    data: ReceivingProjectTarget[];
  }>({
    queryKey: ['/api/receipts/project-targets/open'],
  });
  const projectTargets = projectTargetsResponse?.data ?? [];

  const projectTargetValue = (project: ReceivingProjectTarget) =>
    `${project.targetType}:${project.id}`;
  const renderProjectTargetLabel = (project: ReceivingProjectTarget) =>
    `${project.targetType === 'rd_project' ? '[R&D] ' : ''}${project.projectCode} - ${project.projectName}${project.customerName ? ` (${project.customerName})` : ''}`;

  const projectTargetUpdates = (value: string): Record<string, unknown> => {
    if (value === LEAVE_OPEN_SENTINEL) {
      return {
        targetProjectId: null,
        targetRdProjectId: null,
        allocatedToType: 'stock',
        allocatedToId: null,
      };
    }
    const separatorIndex = value.indexOf(':');
    const targetType = value.slice(0, separatorIndex);
    const id = value.slice(separatorIndex + 1);
    return {
      targetProjectId: targetType === 'project' ? id : null,
      targetRdProjectId: targetType === 'rd_project' ? id : null,
      allocatedToType: targetType,
      allocatedToId: null,
    };
  };

  const needsPutaway = (unit: ReceivedUnit) =>
    unit.disposition === 'accepted' &&
    !unit.location?.trim() &&
    unit.freezerNumber == null;

  const pendingInspectionUnits = units.filter(
    (u) => u.disposition === 'pending_inspection'
  );
  const putawayBlockers = units.filter(needsPutaway);
  const canCompleteReceipt =
    units.length > 0 &&
    pendingInspectionUnits.length === 0 &&
    putawayBlockers.length === 0 &&
    !deptApplyPending &&
    !batchPending;

  const summarizeUnitList = (blockedUnits: ReceivedUnit[]) => {
    const labels = blockedUnits
      .slice(0, 6)
      .map((unit) => unit.barcode || `Unit ${unit.id}`);
    const extra = blockedUnits.length - labels.length;
    return `${labels.join(', ')}${extra > 0 ? `, +${extra} more` : ''}`;
  };

  const applyDeptDefaults = async (
    dept: InventoryDepartment | null,
    newLocation: string | null,
    newFreezer: number | null,
    silent = false
  ) => {
    if (!dept || (newLocation == null && newFreezer == null)) return;
    const unitsToFill = units.filter(
      (u) =>
        (newLocation != null && !u.location) ||
        (newFreezer != null && u.freezerNumber == null)
    );
    if (unitsToFill.length === 0) return;
    setDeptApplyPending(true);
    try {
      await Promise.all(
        unitsToFill.map((u) =>
          apiRequest(`/api/receipts/${receipt.id}/units/${u.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              location: newLocation,
              freezerNumber: newFreezer,
            }),
          })
        )
      );
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      if (!silent)
        toast.success(
          `Applied department defaults to ${unitsToFill.length} unit(s)`
        );
    } catch {
      if (!silent) toast.error('Failed to apply department defaults to units');
    } finally {
      setDeptApplyPending(false);
    }
  };

  // Auto-apply defaults on mount if receipt already has an associated department
  useEffect(() => {
    if (!receipt.departmentId || departments.length === 0) return;
    const dept = departments.find((d) => d.id === receipt.departmentId);
    if (!dept) return;
    const loc = dept.defaultReceivingLocation ?? null;
    const frz = dept.defaultReceivingFreezer ?? null;
    setBatchLocation(loc ?? '');
    setBatchFreezer(frz != null ? String(frz) : '');
    applyDeptDefaults(dept, loc, frz, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments]);

  const handleDeptChange = async (deptId: string) => {
    setSelectedDeptId(deptId);
    const dept =
      deptId === NONE_SENTINEL
        ? null
        : (departments.find((d) => String(d.id) === deptId) ?? null);
    const newLocation = dept?.defaultReceivingLocation ?? null;
    const newFreezer = dept?.defaultReceivingFreezer ?? null;

    setBatchLocation(newLocation ?? '');
    setBatchFreezer(newFreezer != null ? String(newFreezer) : '');

    await Promise.all([
      apiRequest(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ departmentId: dept ? dept.id : null }),
      }),
      applyDeptDefaults(dept, newLocation, newFreezer),
    ]);
  };

  const updateUnitMutation = useMutation({
    mutationFn: ({
      unitId,
      updates,
    }: {
      unitId: number;
      updates: Record<string, any>;
    }) =>
      apiRequest(`/api/receipts/${receipt.id}/units/${unitId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
    },
    onError: () => toast.error('Failed to update unit'),
  });

  const handleBatchAssign = async () => {
    const structuredLocation = buildStorageLocation(
      batchStorageType,
      batchStorageIdentifier,
      batchStorageNote
    );
    if (
      !batchLocation &&
      !structuredLocation &&
      !batchFreezer &&
      batchTargetProjectId === NONE_SENTINEL
    ) {
      toast.error('Enter at least one field to batch-assign');
      return;
    }
    setBatchPending(true);
    const updates: Record<string, any> = {};
    if (structuredLocation || batchLocation)
      updates.location = structuredLocation || batchLocation;
    if (batchStorageType === 'freezer' && batchStorageIdentifier) {
      updates.freezerNumber = parseInt(batchStorageIdentifier, 10);
    } else if (batchFreezer) {
      updates.freezerNumber = parseInt(batchFreezer, 10);
    }
    if (batchTargetProjectId !== NONE_SENTINEL) {
      Object.assign(updates, projectTargetUpdates(batchTargetProjectId));
    }
    try {
      await Promise.all(
        units.map((u) =>
          apiRequest(`/api/receipts/${receipt.id}/units/${u.id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
          })
        )
      );
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      toast.success(`Batch-assigned ${units.length} unit(s)`);
    } catch {
      toast.error('Batch assign failed');
    } finally {
      setBatchPending(false);
    }
  };

  const completeReceiptMutation = useMutation({
    mutationFn: () => {
      if (!canCompleteReceipt) {
        const message =
          putawayBlockers.length > 0
            ? `Put away ${putawayBlockers.length} accepted unit(s) before completing this receipt.`
            : `Inspect all units before completing this receipt.`;
        throw new Error(message);
      }

      return apiRequest(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'complete' }),
      });
    },
    onSuccess: (data) => {
      onUpdate({ ...receipt, ...data });
      for (const key of getRccCompleteInvalidationKeys(receipt.vendorPoId)) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      onComplete();
    },
    onError: (err: any) =>
      toast.error(err?.message ?? 'Failed to complete receipt'),
  });

  return (
    <div className="space-y-3">
      {/* Department auto-fill selector */}
      {departments.length > 0 && (
        <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Department Defaults
            </div>
            {deptApplyPending && (
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            )}
          </div>
          <div>
            <Label className="text-xs">
              Select Department to Auto-fill Location &amp; Freezer
            </Label>
            <Select
              value={selectedDeptId}
              onValueChange={handleDeptChange}
              disabled={deptApplyPending}
            >
              <SelectTrigger className="h-7 text-xs mt-0.5">
                <SelectValue placeholder="Choose department..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SENTINEL}>None</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={String(dept.id)}>
                    {dept.name}
                    {(dept.defaultReceivingLocation ||
                      dept.defaultReceivingFreezer != null) && (
                      <span className="text-gray-400 ml-1">
                        (
                        {[
                          dept.defaultReceivingLocation,
                          dept.defaultReceivingFreezer != null
                            ? `Freezer ${dept.defaultReceivingFreezer}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        )
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedDeptId !== NONE_SENTINEL && (
            <div className="text-xs text-gray-400">
              Defaults applied to all pending units. Override individual units
              below if needed.
            </div>
          )}
        </div>
      )}

      {/* Batch assign controls */}
      {units.length > 1 && (
        <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950 space-y-2">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Batch Assign All Units
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Storage Type</Label>
              <Select
                value={batchStorageType}
                onValueChange={(v) =>
                  setBatchStorageType(v as (typeof STORAGE_TYPES)[number])
                }
              >
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conex">Conex</SelectItem>
                  <SelectItem value="freezer">Freezer</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">
                {batchStorageType === 'other'
                  ? 'Storage Note'
                  : 'Number / Area'}
              </Label>
              <Input
                className="h-7 text-xs mt-0.5"
                value={
                  batchStorageType === 'other'
                    ? batchStorageNote
                    : batchStorageIdentifier
                }
                onChange={(e) =>
                  batchStorageType === 'other'
                    ? setBatchStorageNote(e.target.value)
                    : setBatchStorageIdentifier(e.target.value)
                }
                placeholder={
                  batchStorageType === 'conex'
                    ? '1, 2, 3...'
                    : batchStorageType === 'freezer'
                      ? '1, 2, 3...'
                      : batchStorageType === 'department'
                        ? 'CNC, paint...'
                        : 'Description'
                }
              />
            </div>
            <div>
              <Label className="text-xs">Manual Location Override</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                value={batchLocation}
                onChange={(e) => setBatchLocation(e.target.value)}
                placeholder="Shelf, bin, rack..."
              />
            </div>
            <div>
              <Label className="text-xs">Freezer #</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                type="number"
                min={1}
                value={batchFreezer}
                onChange={(e) => setBatchFreezer(e.target.value)}
                placeholder="1–5"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Target Project</Label>
              <Select
                value={batchTargetProjectId}
                onValueChange={setBatchTargetProjectId}
              >
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue placeholder="No batch project change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>
                    No batch project change
                  </SelectItem>
                  <SelectItem value={LEAVE_OPEN_SENTINEL}>
                    Leave open
                  </SelectItem>
                  {projectTargets.map((project) => (
                    <SelectItem
                      key={`${project.targetType}:${project.id}`}
                      value={projectTargetValue(project)}
                    >
                      {renderProjectTargetLabel(project)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs"
            onClick={handleBatchAssign}
            disabled={batchPending}
          >
            {batchPending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : null}
            Apply to All {units.length} Units
          </Button>
        </div>
      )}

      {units.length === 0 && (
        <div className="text-center text-xs text-gray-500 py-4">
          No units to assign location
        </div>
      )}
      {(pendingInspectionUnits.length > 0 || putawayBlockers.length > 0) && (
        <div
          data-testid="putaway-completion-blockers"
          className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-3 py-2 text-amber-800 dark:text-amber-300 text-xs space-y-1"
        >
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Complete receipt is locked until every accepted unit has a location
            or freezer.
          </div>
          {putawayBlockers.length > 0 && (
            <div>Needs putaway: {summarizeUnitList(putawayBlockers)}</div>
          )}
          {pendingInspectionUnits.length > 0 && (
            <div>
              Still needs disposition:{' '}
              {summarizeUnitList(pendingInspectionUnits)}
            </div>
          )}
        </div>
      )}
      {units.map((unit) => (
        <div key={unit.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs text-blue-600">
                {unit.barcode}
              </div>
              <div className="text-xs text-gray-500">
                {unit.quantity} {unit.uom}
              </div>
            </div>
            <DispositionBadge disposition={unit.disposition} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Location</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                defaultValue={unit.location ?? ''}
                placeholder="Shelf, bin, rack..."
                onBlur={(e) => {
                  if (e.target.value !== (unit.location ?? '')) {
                    updateUnitMutation.mutate({
                      unitId: unit.id,
                      updates: { location: e.target.value },
                    });
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Freezer #</Label>
              <Input
                className="h-7 text-xs mt-0.5"
                type="number"
                min={1}
                defaultValue={unit.freezerNumber ?? ''}
                placeholder="1–5"
                onBlur={(e) => {
                  const val = e.target.value
                    ? parseInt(e.target.value, 10)
                    : null;
                  if (val !== (unit.freezerNumber ?? null)) {
                    updateUnitMutation.mutate({
                      unitId: unit.id,
                      updates: { freezerNumber: val },
                    });
                  }
                }}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Target Project</Label>
              <Select
                value={
                  unit.targetRdProjectId
                    ? `rd_project:${unit.targetRdProjectId}`
                    : unit.targetProjectId
                      ? `project:${unit.targetProjectId}`
                      : LEAVE_OPEN_SENTINEL
                }
                onValueChange={(v) =>
                  updateUnitMutation.mutate({
                    unitId: unit.id,
                    updates: projectTargetUpdates(v),
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue placeholder="Leave open" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={LEAVE_OPEN_SENTINEL}>
                    Leave open
                  </SelectItem>
                  {projectTargets.map((project) => (
                    <SelectItem
                      key={`${project.targetType}:${project.id}`}
                      value={projectTargetValue(project)}
                    >
                      {renderProjectTargetLabel(project)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}

      {units.length > 0 && (
        <Button
          size="sm"
          className="w-full bg-green-600 hover:bg-green-700 mt-2"
          onClick={() => completeReceiptMutation.mutate()}
          disabled={completeReceiptMutation.isPending || !canCompleteReceipt}
        >
          {completeReceiptMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Check className="w-3 h-3 mr-1" />
          )}
          Complete Receipt
        </Button>
      )}
    </div>
  );
}

// ── Right Panel: Documents / Barcode / History ─────────────────────────────────

function RightPanel({
  receipt,
  onUpdate,
}: {
  receipt: Receipt | null;
  onUpdate: (r: Receipt) => void;
}) {
  if (!receipt) {
    return (
      <div className="h-full overflow-y-auto p-2">
        <div className="h-full flex items-center justify-center text-gray-300 text-xs">
          No active receipt
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="documents" className="h-full flex flex-col">
      <TabsList className="mx-2 mt-2 h-7 text-xs">
        <TabsTrigger value="documents" className="text-xs">
          Docs
        </TabsTrigger>
        <TabsTrigger value="barcode" className="text-xs">
          Labels
        </TabsTrigger>
        <TabsTrigger value="history" className="text-xs">
          History
        </TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-y-auto">
        <TabsContent value="documents" className="m-0 p-2">
          <DocumentsTab receipt={receipt} onUpdate={onUpdate} />
        </TabsContent>
        <TabsContent value="barcode" className="m-0 p-2">
          <BarcodesTab receipt={receipt} />
        </TabsContent>
        <TabsContent value="history" className="m-0 p-2">
          <HistoryTab receipt={receipt} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

function DepartmentActionQueue() {
  const {
    data: actions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<DepartmentReceivingAction[]>({
    queryKey: ['/api/receipts/department-actions'],
    queryFn: () => apiRequest('/api/receipts/department-actions'),
    refetchInterval: 30000,
  });

  const grouped = actions.reduce<Record<string, DepartmentReceivingAction[]>>(
    (acc, action) => {
      const name =
        action.department_name ?? `Department ${action.department_id}`;
      acc[name] = acc[name] ?? [];
      acc[name].push(action);
      return acc;
    },
    {}
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin mr-1" /> Loading department
        queue...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border rounded-lg p-3 text-xs text-red-600 bg-red-50">
        Failed to load department queue.
        <Button
          variant="outline"
          size="sm"
          className="h-6 ml-2 text-xs"
          onClick={() => refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/40 text-xs">
        <div className="font-semibold text-blue-800 dark:text-blue-200">
          Supervisor Receiving Queue
        </div>
        <div className="text-blue-700 dark:text-blue-300 mt-1">
          Department-assigned units appear here until disposition is set or
          accepted material is put away.
        </div>
      </div>
      {actions.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-4">
          No department receiving actions are waiting.
        </div>
      )}
      {Object.entries(grouped).map(([department, deptActions]) => (
        <div key={department} className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold">{department}</span>
            <Badge variant="outline" className="text-xs">
              {deptActions.length}
            </Badge>
          </div>
          <div className="divide-y">
            {deptActions.map((action) => (
              <div
                key={`${action.receipt_id}-${action.unit_id}`}
                className="p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-blue-600 truncate">
                    {action.barcode}
                  </span>
                  <Badge
                    className={
                      action.action_required === 'disposition_required'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-green-100 text-green-800'
                    }
                  >
                    {action.action_required === 'disposition_required'
                      ? 'Disposition'
                      : 'Putaway'}
                  </Badge>
                </div>
                <div className="font-medium truncate">
                  {action.ag_part_number ?? 'Unlinked part'}
                </div>
                <div className="text-gray-500 truncate">
                  {action.description ?? action.vendor_name ?? 'Receiving unit'}
                </div>
                <div className="flex flex-wrap gap-1 text-gray-400">
                  <span>
                    {action.quantity} {action.uom ?? ''}
                  </span>
                  <span>Receipt {action.receipt_number}</span>
                  {action.vendor_po_number && (
                    <span>PO {action.vendor_po_number}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({
  receipt,
  onUpdate,
}: {
  receipt: Receipt;
  onUpdate: (r: Receipt) => void;
}) {
  const documents = receipt.documents ?? [];
  const units = receipt.units ?? [];
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState(
    receipt.status === 'complete' ? 'CoC' : 'other'
  );
  const [docNotes, setDocNotes] = useState('');
  const RECEIPT_LEVEL = '__receipt_level__';
  const [assignToUnit, setAssignToUnit] = useState(RECEIPT_LEVEL);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setDocType(receipt.status === 'complete' ? 'CoC' : 'other');
  }, [receipt.id, receipt.status]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docType', docType);
      formData.append('notes', docNotes);
      const unitId = assignToUnit !== RECEIPT_LEVEL ? assignToUnit : '';
      if (unitId) formData.append('receivedUnitId', unitId);

      const resp = await fetch(`/api/receipts/${receipt.id}/documents`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('sessionToken') ?? localStorage.getItem('jwtToken') ?? ''}`,
        },
      });
      if (!resp.ok) {
        let message = 'Upload failed';
        try {
          const payload = await resp.json();
          message = payload?.error || payload?.message || message;
        } catch {
          // Keep the generic message when the server did not return JSON.
        }
        throw new Error(message);
      }
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      queryClient.invalidateQueries({
        queryKey: ['/api/receipts', receipt.id, 'required-docs'],
      });
      setDocNotes('');
      setAssignToUnit(RECEIPT_LEVEL);
      toast.success('Document uploaded');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (docId: number) =>
      apiRequest(`/api/receipts/${receipt.id}/documents/${docId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
    },
    onError: () => toast.error('Failed to delete'),
  });

  return (
    <div className="space-y-3">
      <div className="border rounded-lg p-2 space-y-2 bg-gray-50 dark:bg-gray-800/50">
        <div className="text-xs font-medium">Upload Document</div>
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {units.length > 0 && (
          <Select value={assignToUnit} onValueChange={setAssignToUnit}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Assign to unit (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RECEIPT_LEVEL}>
                Receipt-level (no unit)
              </SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.barcode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          className="h-7 text-xs"
          placeholder="Notes (optional)"
          value={docNotes}
          onChange={(e) => setDocNotes(e.target.value)}
        />
        <input
          type="file"
          ref={fileRef}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
            e.target.value = '';
          }}
        />
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Upload className="w-3 h-3 mr-1" />
          )}
          Choose File
        </Button>
      </div>

      {documents.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-2">
          No documents uploaded
        </div>
      )}
      <div className="space-y-1">
        {documents.map((doc) => (
          <div key={doc.id} className="border rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 min-w-0">
                <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="font-medium truncate max-w-[120px]">
                  {doc.filename ?? 'Document'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(doc.mediaId || doc.storagePath) && (
                  <a
                    href={
                      doc.mediaId
                        ? `/api/media/${doc.mediaId}/download`
                        : `/api/media/download?path=${encodeURIComponent(doc.storagePath!)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center h-6 w-6 rounded hover:bg-gray-100 justify-center text-blue-500"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-red-400"
                  onClick={() => deleteMutation.mutate(doc.id)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="text-gray-400 flex gap-2 mt-0.5">
              <Badge variant="outline" className="text-xs h-4">
                {doc.docType?.replace(/_/g, ' ')}
              </Badge>
              {doc.receivedUnitId && (
                <span className="text-gray-400">
                  Unit #{doc.receivedUnitId}
                </span>
              )}
              {doc.uploadedByDisplayName && (
                <span className="text-gray-400">
                  by {doc.uploadedByDisplayName}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarcodesTab({ receipt }: { receipt: Receipt }) {
  const units = receipt.units ?? [];
  const [barcodeImages, setBarcodeImages] = useState<Record<number, string>>(
    {}
  );
  const [loadingImages, setLoadingImages] = useState<Record<number, boolean>>(
    {}
  );
  const [labelSize, setLabelSize] = useState<ReceivingLabelSize>('avery-5160');
  const [printerName, setPrinterName] = useState(
    'Browser PDF / selected printer'
  );
  const [copies, setCopies] = useState(1);
  const [reprintReason, setReprintReason] = useState('');
  const controlledReceivingBarcodes =
    import.meta.env.VITE_P2_RECEIVING_BARCODE_IDENTITIES_ENABLED === 'true';
  const recordControlledPrint = (unitId: number) =>
    apiRequest(`/api/receipts/${receipt.id}/units/${unitId}/controlled-print`, {
      method: 'POST',
      body: JSON.stringify({
        labelFormat: labelSize,
        printerName,
        copies,
        reprintReason: reprintReason.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    });

  // Pre-fetch barcode images for all units when the tab renders
  useEffect(() => {
    if (!receipt.id || units.length === 0) return;
    for (const unit of units) {
      if (barcodeImages[unit.id] || loadingImages[unit.id]) continue;
      setLoadingImages((prev) => ({ ...prev, [unit.id]: true }));
      apiRequest(`/api/receipts/${receipt.id}/units/${unit.id}/label`)
        .then((data: any) => {
          if (data?.barcodeImage) {
            setBarcodeImages((prev) => ({
              ...prev,
              [unit.id]: data.barcodeImage,
            }));
          }
        })
        .catch(() => {})
        .finally(() =>
          setLoadingImages((prev) => ({ ...prev, [unit.id]: false }))
        );
    }
  }, [receipt.id, units.length]);

  const printLabel = async (unitId: number) => {
    try {
      const labelData = await apiRequest(
        `/api/receipts/${receipt.id}/units/${unitId}/label`
      );
      await printLabelPDF(
        Array.from({ length: copies }, () => labelData),
        `Label ${labelData.barcode}`,
        labelSize
      );
      if (controlledReceivingBarcodes) await recordControlledPrint(unitId);
    } catch {
      toast.error('Failed to fetch label data');
    }
  };

  const printBatch = async () => {
    try {
      const labels = controlledReceivingBarcodes
        ? await Promise.all(
            units.map((unit) =>
              apiRequest(`/api/receipts/${receipt.id}/units/${unit.id}/label`)
            )
          )
        : await apiRequest(`/api/receipts/${receipt.id}/labels/batch`, {
            method: 'POST',
          });
      const printableLabels = labels.flatMap((label: ReceivingLabel) =>
        Array.from({ length: copies }, () => label)
      );
      await printLabelPDF(
        printableLabels,
        `Batch Labels - ${receipt.receiptNumber}`,
        labelSize
      );
      if (controlledReceivingBarcodes)
        await Promise.all(units.map((unit) => recordControlledPrint(unit.id)));
    } catch {
      toast.error('Failed to fetch batch labels');
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-2">
        <Label htmlFor="receiving-label-size" className="text-xs">
          Label Size
        </Label>
        <Select
          value={labelSize}
          onValueChange={(value) => setLabelSize(value as ReceivingLabelSize)}
        >
          <SelectTrigger
            id="receiving-label-size"
            className="h-7 text-xs mt-1"
            data-testid="select-receiving-label-size"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="avery-5160">Avery 5160 — 2⅝ × 1 in</SelectItem>
            <SelectItem value="avery-5163">Avery 5163 — 4 × 2 in</SelectItem>
            <SelectItem value="receiving-4x6">Receiving — 4 × 6 in</SelectItem>
          </SelectContent>
        </Select>
        <div className="mt-1 text-[11px] text-gray-500">
          Every size includes the AG part number and description.
        </div>
        {controlledReceivingBarcodes && (
          <div className="mt-2 grid gap-2">
            <Label htmlFor="receiving-printer-name" className="text-xs">
              Printer / destination
            </Label>
            <Input
              id="receiving-printer-name"
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
            />
            <Label htmlFor="receiving-print-copies" className="text-xs">
              Copies
            </Label>
            <Input
              id="receiving-print-copies"
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(event) =>
                setCopies(Math.max(1, Number(event.target.value) || 1))
              }
            />
            <Label htmlFor="receiving-reprint-reason" className="text-xs">
              Reprint reason (required after first print)
            </Label>
            <Input
              id="receiving-reprint-reason"
              value={reprintReason}
              onChange={(event) => setReprintReason(event.target.value)}
            />
          </div>
        )}
      </div>

      {units.length > 1 && (
        <Button size="sm" className="w-full text-xs" onClick={printBatch} disabled={totalLabelCount === 0}>
          <Printer className="w-3 h-3 mr-1" /> Batch Print All ({totalLabelCount} labels)
        </Button>
      )}

      {units.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-2">
          No units to print
        </div>
      )}

      <div className="space-y-2">
        {units.map((unit) => (
          <div key={unit.id} className="border rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="font-mono text-xs text-blue-600">
                  {unit.barcode}
                </div>
                <div className="text-xs text-gray-500">
                  {unit.quantity} {unit.uom}
                </div>
              </div>
              <DispositionBadge disposition={unit.disposition} />
            </div>
            {/* Inline barcode preview */}
            {loadingImages[unit.id] && (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
              </div>
            )}
            {barcodeImages[unit.id] && (
              <div className="my-1 flex justify-center bg-white rounded p-1 border">
                <img
                  src={barcodeImages[unit.id]}
                  alt={`Barcode ${unit.barcode}`}
                  className="max-h-10 w-auto"
                />
              </div>
            )}
            {unit.lotNumber && (
              <div className="text-xs text-gray-400">Lot: {unit.lotNumber}</div>
            )}
            {unit.expirationDate && (
              <div className="text-xs text-gray-400">
                Exp: {new Date(unit.expirationDate).toLocaleDateString()}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full h-6 text-xs mt-2"
              onClick={() => printLabel(unit.id)}
            >
              <Printer className="w-3 h-3 mr-1" /> Print Label
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryTab({ receipt }: { receipt: Receipt }) {
  const { data: auditLog, isLoading } = useQuery<AuditEntry[]>({
    queryKey: ['/api/receipts', receipt.id, 'audit'],
    queryFn: () => apiRequest(`/api/receipts/${receipt.id}/audit`),
    refetchInterval: 30000,
  });

  const entries = auditLog ?? receipt.auditLog ?? [];

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-2">No history</div>
      )}
      {entries.map((entry) => (
        <div key={entry.id} className="border rounded p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{formatAction(entry.action)}</span>
            <span className="text-gray-400">
              {new Date(entry.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="text-gray-500">
            {entry.actorDisplayName ?? 'System'}
          </div>
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div className="text-gray-400 mt-0.5">
              {Object.entries(entry.metadata)
                .slice(0, 3)
                .map(([k, v]) => (
                  <span key={k} className="mr-2">
                    {k}: {String(v)}
                  </span>
                ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

// ── Label PDF Generation ───────────────────────────────────────────────────────

type ReceivingLabelSize = 'avery-5160' | 'avery-5163' | 'receiving-4x6';
type ReceivingLabel = {
  agPartNumber?: string | null;
  barcode: string;
  barcodeImage: string;
  batchNumber?: string | null;
  certReference?: string | null;
  description?: string | null;
  disposition: string;
  expirationDate?: string | null;
  heatLot?: string | null;
  internalControlNumber?: string | null;
  location?: string | null;
  lotNumber?: string | null;
  manufactureDate?: string | null;
  poNumber?: string | null;
  quantity?: string | number | null;
  receiptDate?: string | null;
  receiptNumber?: string | null;
  rollNumber?: string | null;
  serialNumber?: string | null;
  uom?: string | null;
  vendorName?: string | null;
};

const RECEIVING_LABEL_DIMENSIONS: Record<
  ReceivingLabelSize,
  { width: number; height: number }
> = {
  'avery-5160': { width: 2.625, height: 1 },
  'avery-5163': { width: 4, height: 2 },
  'receiving-4x6': { width: 4, height: 6 },
};

async function printLabelPDF(
  labels: ReceivingLabel[],
  title: string,
  labelSize: ReceivingLabelSize
) {
  if (!labels || labels.length === 0) {
    toast.error('No labels to print');
    return;
  }
  const dimensions = RECEIVING_LABEL_DIMENSIONS[labelSize];
  const isCompact = labelSize !== 'receiving-4x6';
  const margin = isCompact ? 0.08 : 0.2;
  const pdf = new jsPDF({
    orientation:
      dimensions.width >= dimensions.height ? 'landscape' : 'portrait',
    unit: 'in',
    format: [dimensions.width, dimensions.height],
  });

  for (let idx = 0; idx < labels.length; idx++) {
    const label = labels[idx];
    if (idx > 0) pdf.addPage([dimensions.width, dimensions.height]);

    if (isCompact) {
      const partNumber =
        String(label.agPartNumber ?? '').trim() || 'Not assigned';
      const description =
        String(label.description ?? '').trim() || 'No description';
      const descriptionLines = pdf
        .splitTextToSize(
          `Description: ${description}`,
          dimensions.width - margin * 2
        )
        .slice(0, labelSize === 'avery-5160' ? 1 : 2);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(labelSize === 'avery-5160' ? 7 : 10);
      pdf.text(
        `AG Part #: ${partNumber}`,
        margin,
        labelSize === 'avery-5160' ? 0.15 : 0.22
      );

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(labelSize === 'avery-5160' ? 5.5 : 8);
      pdf.text(
        descriptionLines,
        margin,
        labelSize === 'avery-5160' ? 0.28 : 0.42
      );

      const barcodeY = labelSize === 'avery-5160' ? 0.38 : 0.78;
      const barcodeHeight = labelSize === 'avery-5160' ? 0.35 : 0.65;
      if (label.barcodeImage) {
        try {
          pdf.addImage(
            label.barcodeImage,
            'PNG',
            margin,
            barcodeY,
            dimensions.width - margin * 2,
            barcodeHeight
          );
        } catch (_) {
          pdf.setFont('courier', 'normal');
          pdf.text(
            `| ${label.barcode} |`,
            dimensions.width / 2,
            barcodeY + 0.2,
            { align: 'center' }
          );
        }
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(labelSize === 'avery-5160' ? 5.5 : 7);
      pdf.text(
        String(label.barcode ?? ''),
        dimensions.width / 2,
        barcodeY + barcodeHeight + 0.1,
        { align: 'center' }
      );
      if (labelSize === 'avery-5163') {
        pdf.text(
          `Qty: ${label.quantity ?? ''} ${label.uom ?? ''}`,
          margin,
          1.72
        );
        if (label.lotNumber)
          pdf.text(`Lot: ${label.lotNumber}`, dimensions.width - margin, 1.72, {
            align: 'right',
          });
      }
      continue;
    }

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');

    // Keep the two primary item identifiers explicit and readable.
    pdf.text(
      `AG Part #: ${String(label.agPartNumber ?? '').trim() || 'Not assigned'}`,
      0.2,
      0.3
    );
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    const descriptionLines = pdf
      .splitTextToSize(
        `Description: ${String(label.description ?? '').trim() || 'No description'}`,
        3.6
      )
      .slice(0, 2);
    pdf.text(descriptionLines, 0.2, 0.48);

    // Vendor name
    if (label.vendorName) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.text(label.vendorName, 0.2, 0.78);
    }

    // CODE128 barcode image (base64 PNG from server via bwip-js)
    if (label.barcodeImage) {
      try {
        pdf.addImage(label.barcodeImage, 'PNG', 0.5, 0.88, 3.0, 0.7);
      } catch (_) {
        // Fallback: text representation
        pdf.setFontSize(10);
        pdf.setFont('courier', 'normal');
        pdf.text(`| ${label.barcode} |`, 2, 1.23, { align: 'center' });
      }
    } else {
      pdf.setFontSize(10);
      pdf.setFont('courier', 'normal');
      pdf.text(`| ${label.barcode} |`, 2, 1.23, { align: 'center' });
    }

    // Barcode text below image
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(label.barcode, 2, 1.68, { align: 'center' });

    let y = 1.93;
    const row = (key: string, val: any) => {
      if (!val && val !== 0) return;
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${key}:`, 0.2, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(String(val), 1.2, y);
      y += 0.22;
    };

    row('Qty', `${label.quantity} ${label.uom ?? ''}`);
    row('ICN', label.internalControlNumber);
    row('Lot', label.lotNumber);
    row('Batch', label.batchNumber);
    row('Serial', label.serialNumber);
    row('Roll', label.rollNumber);
    row('Heat Lot', label.heatLot);
    row('Cert Ref', label.certReference);
    row('PO #', label.poNumber);
    row('Receipt', label.receiptNumber);
    row(
      'Rcvd',
      label.receiptDate
        ? new Date(label.receiptDate).toLocaleDateString()
        : null
    );
    row(
      'Mfg',
      label.manufactureDate
        ? new Date(label.manufactureDate).toLocaleDateString()
        : null
    );
    row(
      'Exp',
      label.expirationDate
        ? new Date(label.expirationDate).toLocaleDateString()
        : null
    );
    row('Location', label.location);

    // Disposition badge at bottom
    pdf.setFontSize(8);
    const dispLabel =
      DISPOSITION_LABELS[label.disposition] ?? label.disposition ?? '';
    pdf.text(`Disposition: ${dispLabel}`, 0.2, 5.7);
  }

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    toast.error('Allow popups to print labels');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function InventoryReceivingControlCenter() {
  const queryClient = useQueryClient();
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [mobileTab, setMobileTab] = useState<'pos' | 'workflow' | 'sidebar'>(
    'pos'
  );
  const [showSupervisorQueue, setShowSupervisorQueue] = useState(false);

  const createReceiptMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest('/api/receipts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (receipt: any) => {
      setActiveReceipt(receipt);
      if (receipt._resumed) {
        toast.success(`Resumed in-progress receipt ${receipt.receiptNumber}`);
      } else {
        toast.success(`Receipt ${receipt.receiptNumber} started`);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/receipts'] });
    },
    onError: () => toast.error('Failed to create receipt'),
  });

  const handleStartReceipt = (po: VendorPO | null) => {
    const data: Record<string, any> = po
      ? {
          vendorId: po.vendorId,
          vendorName: po.vendorName,
          vendorPoId: po.id,
          vendorPoNumber: po.poNumber,
        }
      : {};
    createReceiptMutation.mutate(data);
    // On mobile, after starting a receipt, switch to workflow tab
    setMobileTab('workflow');
  };

  const handleUpdate = (r: Receipt) => setActiveReceipt(r);

  const handleSelectReceipt = async (receipt: Receipt) => {
    try {
      const fullReceipt = (await apiRequest(
        `/api/receipts/${receipt.id}`
      )) as Receipt;
      setActiveReceipt(fullReceipt);
      setMobileTab('sidebar');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to open receipt documents');
    }
  };

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-semibold">
              Receiving Control Center
            </h1>
          </div>
          {activeReceipt && (
            <Badge variant="outline" className="text-xs">
              Active: {activeReceipt.receiptNumber}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={showSupervisorQueue ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => {
              setShowSupervisorQueue((v) => !v);
              setMobileTab('workflow');
            }}
            data-testid="button-toggle-supervisor-receiving-queue"
          >
            {showSupervisorQueue ? 'Receipt Workflow' : 'Supervisor Queue'}
          </Button>
          <Link
            href="/inventory/receiving-legacy"
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Legacy view
          </Link>
        </div>
      </div>

      {/* Mobile tab nav (hidden on md+) */}
      <div className="md:hidden flex border-b bg-white dark:bg-gray-950 shrink-0">
        {(['pos', 'workflow', 'sidebar'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mobileTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'pos'
              ? 'Expected POs'
              : tab === 'workflow'
                ? 'Workflow'
                : 'Docs & Labels'}
          </button>
        ))}
      </div>

      {/* Desktop: Three-panel layout; Mobile: Tab-based */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop grid */}
        <div
          className="hidden md:grid h-full"
          style={{ gridTemplateColumns: '280px 1fr 320px' }}
        >
          <div className="border-r overflow-hidden">
            <LeftPanel
              onStartReceipt={handleStartReceipt}
              onSelectReceipt={handleSelectReceipt}
              activeReceiptId={activeReceipt?.id ?? null}
            />
          </div>
          <div className="overflow-hidden border-r">
            {showSupervisorQueue ? (
              <div className="h-full overflow-y-auto p-4">
                <DepartmentActionQueue />
              </div>
            ) : createReceiptMutation.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <CenterPanel
                receipt={activeReceipt}
                onReceiptUpdate={handleUpdate}
              />
            )}
          </div>
          <div className="overflow-hidden">
            <RightPanel receipt={activeReceipt} onUpdate={handleUpdate} />
          </div>
        </div>

        {/* Mobile single-panel */}
        <div className="md:hidden h-full overflow-hidden">
          {mobileTab === 'pos' && (
            <LeftPanel
              onStartReceipt={handleStartReceipt}
              onSelectReceipt={handleSelectReceipt}
              activeReceiptId={activeReceipt?.id ?? null}
            />
          )}
          {mobileTab === 'workflow' &&
            (showSupervisorQueue ? (
              <div className="h-full overflow-y-auto p-3">
                <DepartmentActionQueue />
              </div>
            ) : createReceiptMutation.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <CenterPanel
                receipt={activeReceipt}
                onReceiptUpdate={handleUpdate}
              />
            ))}
          {mobileTab === 'sidebar' && (
            <RightPanel receipt={activeReceipt} onUpdate={handleUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}

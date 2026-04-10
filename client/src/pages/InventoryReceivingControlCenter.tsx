import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { Link } from 'wouter';
import { jsPDF } from 'jspdf';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
} from 'lucide-react';

import { getTraceabilityFields } from '@/lib/traceabilityFields';

// ── Types ──────────────────────────────────────────────────────────────────────

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
}

interface ReceiptDocument {
  id: number;
  receiptId: number;
  receivedUnitId?: number;
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

// ── Constants ──────────────────────────────────────────────────────────────────

const DISPOSITION_COLORS: Record<string, string> = {
  pending_inspection: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  accepted: 'bg-green-100 text-green-800 border-green-200',
  quarantine: 'bg-orange-100 text-orange-800 border-orange-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

const DISPOSITION_LABELS: Record<string, string> = {
  pending_inspection: 'Pending Inspection',
  accepted: 'Accepted',
  quarantine: 'Quarantine',
  rejected: 'Rejected',
};

const DOC_TYPES = ['SDS', 'TDS', 'CoC', 'packing_slip', 'test_report', 'supplier_label_photo', 'damage_photo', 'other'];

const UNIT_TYPES = ['roll', 'box', 'bar', 'tube', 'serialized_piece', 'other'];

const CONDITIONS = ['good', 'damaged', 'partial', 'refused'];

function getExpirationStatus(expirationDate?: string | null): 'ok' | 'near_expiry' | 'expired' {
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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${DISPOSITION_COLORS[disposition] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {DISPOSITION_LABELS[disposition] ?? disposition}
    </span>
  );
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
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
            <div className={`h-0.5 w-6 ${i < currentStep ? 'bg-green-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Left Panel: Expected Receipts ─────────────────────────────────────────────

function LeftPanel({
  onStartReceipt,
  activeReceiptId,
}: {
  onStartReceipt: (po: VendorPO | null) => void;
  activeReceiptId: number | null;
}) {
  const [search, setSearch] = useState('');

  const { data: sentPOsResponse, isLoading: isLoadingSent } = useQuery<{ data: VendorPO[] }>({
    queryKey: ['/api/vendor-pos', 'Sent'],
    queryFn: () => apiRequest('/api/vendor-pos?status=Sent&pageSize=200'),
  });
  const { data: partialPOsResponse, isLoading: isLoadingPartial } = useQuery<{ data: VendorPO[] }>({
    queryKey: ['/api/vendor-pos', 'Partially Received'],
    queryFn: () => apiRequest('/api/vendor-pos?status=Partially%20Received&pageSize=200'),
  });
  const isLoadingPOs = isLoadingSent || isLoadingPartial;

  const { data: pendingByPo } = useQuery<Record<number, { count: number; latestStatus: string }>>({
    queryKey: ['/api/receipts/pending-by-po'],
    queryFn: () => apiRequest('/api/receipts/pending-by-po'),
    refetchInterval: 30000,
  });

  // Merge Sent + Partially Received POs, deduplicate by id
  const allPOs = [...(sentPOsResponse?.data ?? []), ...(partialPOsResponse?.data ?? [])];
  const seenIds = new Set<number>();
  const sentPOs = allPOs.filter(po => { if (seenIds.has(po.id)) return false; seenIds.add(po.id); return true; });

  const filteredPOs = sentPOs.filter(po =>
    po.poNumber?.toLowerCase().includes(search.toLowerCase()) ||
    po.vendorName?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by vendor
  const grouped = filteredPOs.reduce<Record<string, { vendor: string; pos: VendorPO[] }>>((acc, po) => {
    const key = po.vendorName || 'Unknown Vendor';
    if (!acc[key]) acc[key] = { vendor: key, pos: [] };
    acc[key].pos.push(po);
    return acc;
  }, {});

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
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Manual Receipt Option */}
        <button
          onClick={() => onStartReceipt(null)}
          className="w-full text-left p-2 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
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

        {Object.values(grouped).map(group => (
          <div key={group.vendor} className="border rounded-lg overflow-hidden">
            <div className="px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {group.vendor}
            </div>
            {group.pos.map(po => {
              const pending = pendingByPo?.[po.id];
              const isResuming = !!(pending || (po.pendingReceiptCount && po.pendingReceiptCount > 0));
              return (
                <div key={po.id} className="p-2 border-t text-xs hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                        {po.poNumber}
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
      </div>
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
  const queryClient = useQueryClient();

  if (!receipt) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 flex-col gap-3">
        <Package className="w-12 h-12 opacity-30" />
        <p className="text-sm">Select a PO or start a manual receipt to begin</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b bg-white dark:bg-gray-950">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="font-semibold text-sm">
              Receipt: <span className="text-blue-600">{receipt.receiptNumber}</span>
            </h2>
            <p className="text-xs text-gray-500">
              {receipt.vendorName ?? 'Manual Receipt'} {receipt.vendorPoNumber ? `· PO ${receipt.vendorPoNumber}` : ''}
            </p>
          </div>
          <Badge variant={receipt.status === 'complete' ? 'default' : 'outline'} className="text-xs">
            {receipt.status === 'complete' ? 'Complete' : receipt.status === 'in_progress' ? 'In Progress' : receipt.status}
          </Badge>
        </div>
        <StepIndicator currentStep={step} totalSteps={5} />
        <div className="text-xs text-gray-500 font-medium">{STEP_LABELS[step]}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {step === 0 && (
          <ShipmentInfoStep
            receipt={receipt}
            onNext={() => setStep(1)}
            onUpdate={onReceiptUpdate}
          />
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

      <div className="p-3 border-t flex items-center justify-between bg-white dark:bg-gray-950">
        <Button variant="outline" size="sm" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        {step < 4 && (
          <Button size="sm" onClick={() => setStep(s => Math.min(4, s + 1))}>
            Save & Continue
          </Button>
        )}
      </div>
    </div>
  );
}

// Step 1: Shipment Info
function ShipmentInfoStep({ receipt, onNext, onUpdate }: {
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
    receivedAt: receipt.receivedAt ? receipt.receivedAt.slice(0, 16) : new Date().toISOString().slice(0, 16),
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

  const mutation = useMutation({
    mutationFn: () => saveForm(form, true),
    onSuccess: () => {
      onNext();
    },
    onError: () => {},
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Carrier</Label>
          <Input className="h-8 text-xs mt-1" value={form.carrier} onChange={e => handleChange({ carrier: e.target.value })} placeholder="UPS, FedEx..." />
        </div>
        <div>
          <Label className="text-xs">Tracking Number</Label>
          <Input className="h-8 text-xs mt-1" value={form.trackingNumber} onChange={e => handleChange({ trackingNumber: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Packing Slip #</Label>
          <Input className="h-8 text-xs mt-1" value={form.packingSlipNumber} onChange={e => handleChange({ packingSlipNumber: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Condition on Arrival</Label>
          <Select value={form.conditionOnArrival} onValueChange={v => handleChange({ conditionOnArrival: v })}>
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Date / Time Received</Label>
        <Input
          type="datetime-local"
          className="h-8 text-xs mt-1"
          value={form.receivedAt}
          onChange={e => handleChange({ receivedAt: e.target.value })}
        />
        <p className="text-xs text-gray-400 mt-0.5">When the shipment physically arrived at the dock</p>
      </div>
      <div>
        <Label className="text-xs">Notes</Label>
        <Textarea className="text-xs mt-1 resize-none" rows={3} value={form.notes} onChange={e => handleChange({ notes: e.target.value })} placeholder="Any additional notes..." />
      </div>
      {dirty && (
        <div className="text-xs text-amber-500 flex items-center gap-1">
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Autosaving…</> : '● Unsaved changes'}
        </div>
      )}
      <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending || saving} className="w-full">
        {mutation.isPending || saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
        Save Shipment Info & Continue
      </Button>
    </div>
  );
}

// Step 2: Line Items
interface PurchasedItem {
  agPartNumber: string;
  name: string;
  purchaseUnit: string | null;
}

function LineItemsStep({ receipt, onNext, onUpdate }: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const lines = receipt.lines ?? [];
  const [addingLine, setAddingLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState('');
  const [newLine, setNewLine] = useState({ agPartNumber: '', description: '', orderedQty: '', receivedQty: '', uom: 'EA' });
  const [partComboOpen, setPartComboOpen] = useState(false);
  const [partSearch, setPartSearch] = useState('');

  const { data: purchasedItems = [] } = useQuery<PurchasedItem[]>({
    queryKey: ['/api/inventory/items/purchased'],
  });

  const addLineMutation = useMutation({
    mutationFn: () => apiRequest(`/api/receipts/${receipt.id}/lines`, {
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
      setNewLine({ agPartNumber: '', description: '', orderedQty: '', receivedQty: '', uom: 'EA' });
      setPartSearch('');
      setPartComboOpen(false);
    },
    onError: () => toast.error('Failed to add line'),
  });

  const updateReceivedQtyMutation = useMutation({
    mutationFn: ({ lineId, receivedQty, orderedQty }: { lineId: number; receivedQty: string; orderedQty?: string }) =>
      apiRequest(`/api/receipts/${receipt.id}/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          receivedQty,
          isPartial: orderedQty ? Number(receivedQty) < Number(orderedQty) : false,
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
      {lines.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="text-left p-2 font-medium">Part #</th>
                <th className="text-left p-2 font-medium">Description</th>
                <th className="text-right p-2 font-medium">Ordered</th>
                <th className="text-right p-2 font-medium">Received</th>
                <th className="text-center p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(line => {
                const ord = Number(line.orderedQty ?? 0);
                const rcv = Number(line.receivedQty ?? 0);
                const isOver = rcv > ord && ord > 0;
                const isPartial = rcv < ord && rcv > 0;
                const isComplete = ord > 0 && rcv >= ord;
                const isEditing = editingLineId === line.id;
                return (
                  <tr key={line.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-2 font-mono text-blue-600">{line.agPartNumber}</td>
                    <td className="p-2 text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{line.description}</td>
                    <td className="p-2 text-right">{ord > 0 ? `${ord} ${line.uom}` : '—'}</td>
                    <td className="p-2 text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-1 justify-end">
                          <Input
                            className="h-5 w-16 text-xs text-right p-1"
                            type="number"
                            step="0.001"
                            value={editQty}
                            onChange={e => setEditQty(e.target.value)}
                            autoFocus
                          />
                          <Button size="sm" className="h-5 w-5 p-0" onClick={() => updateReceivedQtyMutation.mutate({ lineId: line.id, receivedQty: editQty, orderedQty: line.orderedQty ?? undefined })}>
                            <Check className="w-2.5 h-2.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingLineId(null)}>
                            <X className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => { setEditingLineId(line.id); setEditQty(String(rcv)); }}
                          title="Click to edit received qty"
                        >
                          {rcv} {line.uom}
                        </span>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      {isOver && <Badge className="bg-orange-100 text-orange-700 text-xs">Over</Badge>}
                      {isPartial && <Badge className="bg-yellow-100 text-yellow-700 text-xs">Partial</Badge>}
                      {isComplete && <Badge className="bg-green-100 text-green-700 text-xs">Complete</Badge>}
                      {!ord && <Badge variant="outline" className="text-xs">Manual</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addingLine ? (
        <div className="border rounded-lg p-3 space-y-2 bg-blue-50 dark:bg-blue-900/10">
          <div className="text-xs font-medium text-blue-700">Add Receipt Line</div>
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
                    <span className="truncate">{newLine.agPartNumber || 'Search part...'}</span>
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
                          .filter(item => {
                            const q = partSearch.toLowerCase();
                            return !q || item.agPartNumber.toLowerCase().includes(q) || item.name.toLowerCase().includes(q);
                          })
                          .slice(0, 50)
                          .map(item => (
                            <CommandItem
                              key={item.agPartNumber}
                              value={`${item.agPartNumber} ${item.name}`}
                              onSelect={() => {
                                setNewLine(f => ({
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
                              <span className="font-mono mr-1.5">{item.agPartNumber}</span>
                              <span className="text-muted-foreground truncate">{item.name}</span>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                      {partSearch && !purchasedItems.some(i => i.agPartNumber.toLowerCase() === partSearch.toLowerCase()) && (
                        <CommandGroup>
                          <CommandItem
                            value={`__adhoc__${partSearch}`}
                            onSelect={() => {
                              setNewLine(f => ({ ...f, agPartNumber: partSearch }));
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
              <Input className="h-7 text-xs mt-0.5" value={newLine.uom} onChange={e => setNewLine(f => ({ ...f, uom: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Description</Label>
              <Input className="h-7 text-xs mt-0.5" value={newLine.description} onChange={e => setNewLine(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Ordered Qty</Label>
              <Input className="h-7 text-xs mt-0.5" type="number" value={newLine.orderedQty} onChange={e => setNewLine(f => ({ ...f, orderedQty: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Received Qty</Label>
              <Input className="h-7 text-xs mt-0.5" type="number" value={newLine.receivedQty} onChange={e => setNewLine(f => ({ ...f, receivedQty: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => addLineMutation.mutate()} disabled={addLineMutation.isPending}>
              {addLineMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setAddingLine(false); setPartSearch(''); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setAddingLine(true)}>
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
function UnitSplittingStep({ receipt, onNext, onUpdate }: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const lines = receipt.lines ?? [];
  const units = receipt.units ?? [];
  const [selectedLineId, setSelectedLineId] = useState<number | null>(lines[0]?.id ?? null);
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [unitForm, setUnitForm] = useState<Record<string, string>>({
    quantity: '1',
    uom: 'EA',
    unitType: 'other',
  });
  const [inventoryItem, setInventoryItem] = useState<any>(null);

  const selectedLine = lines.find(l => l.id === selectedLineId);
  const lineUnits = units.filter(u => u.receiptLineId === selectedLineId);

  // Fetch inventory item for traceability fields
  useEffect(() => {
    if (selectedLine?.agPartNumber) {
      apiRequest(`/api/inventory/items/by-part-number/${selectedLine.agPartNumber}`)
        .then(item => setInventoryItem(item))
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

  const [splitCount, setSplitCount] = useState('2');
  const [showSplitDialog, setShowSplitDialog] = useState(false);

  const addUnitMutation = useMutation({
    mutationFn: () => apiRequest(`/api/receipts/${receipt.id}/lines/${selectedLineId}/units`, {
      method: 'POST',
      body: JSON.stringify(unitForm),
    }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setShowAddUnit(false);
      setUnitForm({ quantity: '1', uom: selectedLine?.uom ?? 'EA', unitType: 'other' });
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to add unit'),
  });

  const splitLineMutation = useMutation({
    mutationFn: () => apiRequest(`/api/receipts/${receipt.id}/lines/${selectedLineId}/split`, {
      method: 'POST',
      body: JSON.stringify({ count: parseInt(splitCount, 10) }),
    }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setShowSplitDialog(false);
      toast.success(`Line split into ${splitCount} equal units`);
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to split line'),
  });

  const cloneUnitMutation = useMutation({
    mutationFn: (unitId: number) => apiRequest(`/api/receipts/${receipt.id}/units/${unitId}/clone`, { method: 'POST' }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      toast.success('Unit cloned');
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to clone unit'),
  });

  return (
    <div className="space-y-3">
      {/* Line selector */}
      {lines.length > 1 && (
        <div>
          <Label className="text-xs">Select Line</Label>
          <Select value={String(selectedLineId)} onValueChange={v => { setSelectedLineId(Number(v)); setShowAddUnit(false); }}>
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lines.map(l => (
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
          {selectedLine.description && <span className="text-gray-500 ml-2">{selectedLine.description}</span>}
          <span className="ml-2 text-gray-400">Received: {selectedLine.receivedQty} {selectedLine.uom}</span>
        </div>
      )}

      {/* Units for this line */}
      <div className="space-y-1">
        {lineUnits.map(unit => {
          const expStatus = getExpirationStatus(unit.expirationDate);
          return (
            <div key={unit.id} className={`flex items-center justify-between border rounded p-2 text-xs ${expStatus === 'expired' ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : expStatus === 'near_expiry' ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/10' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-blue-600">{unit.barcode}</div>
                <div className="text-gray-500">{unit.quantity} {unit.uom} · {unit.unitType}</div>
                {unit.lotNumber && <div className="text-gray-400">Lot: {unit.lotNumber}</div>}
                {unit.expirationDate && (
                  <div className={`flex items-center gap-1 mt-0.5 ${expStatus === 'expired' ? 'text-red-600' : expStatus === 'near_expiry' ? 'text-amber-600' : 'text-gray-400'}`}>
                    <Clock className="w-2.5 h-2.5" />
                    {expStatus === 'expired' ? 'EXPIRED' : expStatus === 'near_expiry' ? 'Near Expiry' : 'Exp'}: {unit.expirationDate}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2">
                <DispositionBadge disposition={unit.disposition} />
                <Button
                  variant="ghost" size="sm" className="h-5 px-1 text-xs"
                  title="Clone unit"
                  onClick={() => cloneUnitMutation.mutate(unit.id)}
                  disabled={cloneUnitMutation.isPending}
                >
                  <Plus className="w-2.5 h-2.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Split line helper */}
      {selectedLineId && !showAddUnit && (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowSplitDialog(true)}>
          <ChevronDown className="w-3 h-3 mr-1" /> Split Line into Equal Units
        </Button>
      )}

      {/* Split dialog */}
      <Dialog open={showSplitDialog} onOpenChange={setShowSplitDialog}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Split Line into Units</DialogTitle>
            <DialogDescription className="text-xs">
              Divides the received quantity equally across N units, each with a unique barcode.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Number of units</Label>
            <Input
              type="number" min="2" max="200"
              className="h-8 text-xs mt-1"
              value={splitCount}
              onChange={e => setSplitCount(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSplitDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={() => splitLineMutation.mutate()} disabled={splitLineMutation.isPending || parseInt(splitCount) < 2}>
              {splitLineMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : `Create ${splitCount} Units`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showAddUnit ? (
        <div className="border rounded-lg p-3 space-y-2 bg-blue-50 dark:bg-blue-900/10">
          <div className="text-xs font-medium text-blue-700">Add Traceable Unit</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Qty</Label>
              <Input className="h-7 text-xs mt-0.5" type="number" step="0.001" value={unitForm.quantity} onChange={e => setUnitForm(f => ({ ...f, quantity: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">UOM</Label>
              <Input className="h-7 text-xs mt-0.5" value={unitForm.uom ?? ''} onChange={e => setUnitForm(f => ({ ...f, uom: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Unit Type</Label>
              <Select value={unitForm.unitType ?? 'other'} onValueChange={v => setUnitForm(f => ({ ...f, unitType: v }))}>
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dynamic traceability fields */}
          {traceFields.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs font-medium text-gray-600 mb-2">Traceability Fields</div>
              <div className="grid grid-cols-2 gap-2">
                {traceFields.map(field => (
                  <div key={field.key}>
                    <Label className="text-xs">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</Label>
                    <Input
                      className="h-7 text-xs mt-0.5"
                      type={field.type}
                      value={unitForm[field.key] ?? ''}
                      onChange={e => setUnitForm(f => ({ ...f, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual traceability fields if no config */}
          {traceFields.length === 0 && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'lotNumber', label: 'Lot #', type: 'text' },
                { key: 'batchNumber', label: 'Batch #', type: 'text' },
                { key: 'serialNumber', label: 'Serial #', type: 'text' },
                { key: 'certReference', label: 'Cert Ref', type: 'text' },
                { key: 'manufactureDate', label: 'Mfg Date', type: 'date' },
                { key: 'expirationDate', label: 'Exp Date', type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <Label className="text-xs">{f.label}</Label>
                  <Input className="h-7 text-xs mt-0.5" type={f.type} value={unitForm[f.key] ?? ''} onChange={e => setUnitForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => addUnitMutation.mutate()} disabled={addUnitMutation.isPending}>
              {addUnitMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add Unit'}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddUnit(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowAddUnit(true)} disabled={!selectedLineId}>
          <Plus className="w-3 h-3 mr-1" /> Add Unit for this Line
        </Button>
      )}

      {units.length > 0 && (
        <Button size="sm" className="w-full" onClick={onNext}>
          Continue to Disposition <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

// Step 4: Disposition
function DispositionStep({ receipt, onNext, onUpdate }: {
  receipt: Receipt;
  onNext: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const units = receipt.units ?? [];
  const [settingDisposition, setSettingDisposition] = useState<{ unitId: number; disposition: string; notes: string } | null>(null);
  const [dispositionError, setDispositionError] = useState<{ error: string; missingDocuments?: string[] } | null>(null);

  // Fetch missing required docs for this receipt
  const { data: requiredDocsData } = useQuery({
    queryKey: ['/api/receipts', receipt.id, 'required-docs'],
    queryFn: () => apiRequest(`/api/receipts/${receipt.id}/required-docs`),
    enabled: !!receipt.id,
    staleTime: 30000,
  });

  const hasMissingDocs = requiredDocsData?.hasMissing;
  const missingByPart: Record<string, string[]> = requiredDocsData?.missingByPartNumber ?? {};

  const dispositionMutation = useMutation({
    mutationFn: () => apiRequest(`/api/receipts/${receipt.id}/units/${settingDisposition!.unitId}/disposition`, {
      method: 'POST',
      body: JSON.stringify({ disposition: settingDisposition!.disposition, notes: settingDisposition!.notes }),
    }),
    onSuccess: async () => {
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setSettingDisposition(null);
      setDispositionError(null);
      toast.success('Disposition set');
    },
    onError: (err: any) => {
      if (err?.missingDocuments) {
        setDispositionError({ error: err.message ?? 'Missing required documents', missingDocuments: err.missingDocuments });
      } else if (err?.expirationStatus) {
        setDispositionError({ error: err.message ?? 'Unit is expired' });
        toast.error(err.message ?? 'Unit is expired');
      } else {
        toast.error(err?.message ?? 'Failed to set disposition');
      }
    },
  });

  return (
    <div className="space-y-2">
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
          <div className="text-amber-600 mt-1">Upload missing docs in the Documents tab before accepting units.</div>
        </div>
      )}

      {units.length === 0 && (
        <div className="text-center text-xs text-gray-500 py-4">No units to disposition yet</div>
      )}
      {units.map(unit => {
        const expStatus = getExpirationStatus(unit.expirationDate);
        return (
          <div key={unit.id} className={`border rounded-lg p-3 ${expStatus === 'expired' ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : ''}`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-mono text-xs text-blue-600">{unit.barcode}</div>
                <div className="text-xs text-gray-500">{unit.quantity} {unit.uom} · {unit.unitType}</div>
                {expStatus === 'expired' && (
                  <div className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-2.5 h-2.5" /> EXPIRED — cannot accept
                  </div>
                )}
                {expStatus === 'near_expiry' && (
                  <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" /> Expires {unit.expirationDate}
                  </div>
                )}
              </div>
              <DispositionBadge disposition={unit.disposition} />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['accepted', 'quarantine', 'rejected'] as const).map(d => (
                <Button
                  key={d}
                  size="sm"
                  variant={unit.disposition === d ? 'default' : 'outline'}
                  className="h-6 text-xs px-2"
                  disabled={d === 'accepted' && expStatus === 'expired'}
                  onClick={() => { setSettingDisposition({ unitId: unit.id, disposition: d, notes: '' }); setDispositionError(null); }}
                >
                  {d === 'accepted' && <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                  {d === 'quarantine' && <AlertTriangle className="w-2.5 h-2.5 mr-1" />}
                  {d === 'rejected' && <XCircle className="w-2.5 h-2.5 mr-1" />}
                  {DISPOSITION_LABELS[d]}
                </Button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Disposition dialog */}
      <Dialog open={!!settingDisposition} onOpenChange={open => { if (!open) { setSettingDisposition(null); setDispositionError(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Set Disposition</DialogTitle>
          </DialogHeader>
          {settingDisposition && (
            <div className="space-y-3">
              <div className="text-xs text-gray-500">
                Setting disposition to: <span className="font-medium">{DISPOSITION_LABELS[settingDisposition.disposition]}</span>
              </div>
              {(settingDisposition.disposition === 'quarantine' || settingDisposition.disposition === 'rejected') && (
                <div>
                  <Label className="text-xs">Reason (required)</Label>
                  <Textarea
                    className="text-xs mt-1 resize-none"
                    rows={2}
                    value={settingDisposition.notes}
                    onChange={e => setSettingDisposition(s => s ? { ...s, notes: e.target.value } : s)}
                    placeholder="Reason for quarantine/rejection..."
                  />
                </div>
              )}
              {/* Server-side doc / expiration error feedback */}
              {dispositionError && (
                <div className="border border-red-300 bg-red-50 dark:bg-red-900/10 rounded p-2 text-xs text-red-700">
                  <div className="font-medium mb-0.5">{dispositionError.error}</div>
                  {dispositionError.missingDocuments && dispositionError.missingDocuments.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5">
                      {dispositionError.missingDocuments.map(d => <li key={d}>{d}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setSettingDisposition(null); setDispositionError(null); }}>Cancel</Button>
            <Button size="sm" onClick={() => dispositionMutation.mutate()} disabled={
              dispositionMutation.isPending ||
              ((settingDisposition?.disposition === 'quarantine' || settingDisposition?.disposition === 'rejected') && !settingDisposition?.notes)
            }>
              {dispositionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm'}
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
function PutawayStep({ receipt, onComplete, onUpdate }: {
  receipt: Receipt;
  onComplete: () => void;
  onUpdate: (r: Receipt) => void;
}) {
  const units = receipt.units ?? [];

  const [batchLocation, setBatchLocation] = useState('');
  const [batchFreezer, setBatchFreezer] = useState('');
  const [batchAllocType, setBatchAllocType] = useState('stock');
  const [batchAllocId, setBatchAllocId] = useState('');
  const [batchPending, setBatchPending] = useState(false);

  const updateUnitMutation = useMutation({
    mutationFn: ({ unitId, updates }: { unitId: number; updates: Record<string, any> }) =>
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
    if (!batchLocation && !batchFreezer && !batchAllocId) {
      toast.error('Enter at least one field to batch-assign');
      return;
    }
    setBatchPending(true);
    const updates: Record<string, any> = { allocatedToType: batchAllocType };
    if (batchLocation) updates.location = batchLocation;
    if (batchFreezer) updates.freezerNumber = parseInt(batchFreezer, 10);
    if (batchAllocId) updates.allocatedToId = parseInt(batchAllocId, 10);
    try {
      await Promise.all(units.map(u =>
        apiRequest(`/api/receipts/${receipt.id}/units/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        })
      ));
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
    mutationFn: () => apiRequest(`/api/receipts/${receipt.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'complete' }),
    }),
    onSuccess: (data) => {
      onUpdate({ ...receipt, ...data });
      onComplete();
    },
    onError: () => toast.error('Failed to complete receipt'),
  });

  return (
    <div className="space-y-3">
      {/* Batch assign controls */}
      {units.length > 1 && (
        <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950 space-y-2">
          <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">Batch Assign All Units</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Location</Label>
              <Input className="h-7 text-xs mt-0.5" value={batchLocation} onChange={e => setBatchLocation(e.target.value)} placeholder="Shelf, bin, rack..." />
            </div>
            <div>
              <Label className="text-xs">Freezer #</Label>
              <Input className="h-7 text-xs mt-0.5" type="number" min={1} value={batchFreezer} onChange={e => setBatchFreezer(e.target.value)} placeholder="1–5" />
            </div>
            <div>
              <Label className="text-xs">Allocation Type</Label>
              <Select value={batchAllocType} onValueChange={setBatchAllocType}>
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="work_order">Work Order</SelectItem>
                  <SelectItem value="po_demand">PO Demand</SelectItem>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Target ID <span className="text-gray-400">(WO/PO #)</span></Label>
              <Input className="h-7 text-xs mt-0.5" type="number" value={batchAllocId} onChange={e => setBatchAllocId(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={handleBatchAssign} disabled={batchPending}>
            {batchPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
            Apply to All {units.length} Units
          </Button>
        </div>
      )}

      {units.length === 0 && (
        <div className="text-center text-xs text-gray-500 py-4">No units to assign location</div>
      )}
      {units.map(unit => (
        <div key={unit.id} className="border rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-xs text-blue-600">{unit.barcode}</div>
              <div className="text-xs text-gray-500">{unit.quantity} {unit.uom}</div>
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
                onBlur={e => {
                  if (e.target.value !== (unit.location ?? '')) {
                    updateUnitMutation.mutate({ unitId: unit.id, updates: { location: e.target.value } });
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
                onBlur={e => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                  if (val !== (unit.freezerNumber ?? null)) {
                    updateUnitMutation.mutate({ unitId: unit.id, updates: { freezerNumber: val } });
                  }
                }}
              />
            </div>
            <div>
              <Label className="text-xs">Allocation</Label>
              <Select
                defaultValue={unit.allocatedToType ?? 'stock'}
                onValueChange={v => updateUnitMutation.mutate({ unitId: unit.id, updates: { allocatedToType: v } })}
              >
                <SelectTrigger className="h-7 text-xs mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="work_order">Work Order</SelectItem>
                  <SelectItem value="po_demand">PO Demand</SelectItem>
                  <SelectItem value="quarantine">Quarantine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Target ID <span className="text-gray-400">(WO/PO #)</span></Label>
              <Input
                className="h-7 text-xs mt-0.5"
                type="number"
                defaultValue={unit.allocatedToId ?? ''}
                placeholder="Optional"
                onBlur={e => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                  if (val !== (unit.allocatedToId ?? null)) {
                    updateUnitMutation.mutate({ unitId: unit.id, updates: { allocatedToId: val } });
                  }
                }}
              />
            </div>
          </div>
        </div>
      ))}

      {units.length > 0 && (
        <Button
          size="sm"
          className="w-full bg-green-600 hover:bg-green-700 mt-2"
          onClick={() => completeReceiptMutation.mutate()}
          disabled={completeReceiptMutation.isPending}
        >
          {completeReceiptMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Check className="w-3 h-3 mr-1" />}
          Complete Receipt
        </Button>
      )}
    </div>
  );
}

// ── Right Panel: Documents / Barcode / History ─────────────────────────────────

function RightPanel({ receipt, onUpdate }: { receipt: Receipt | null; onUpdate: (r: Receipt) => void }) {
  if (!receipt) {
    return (
      <div className="h-full flex items-center justify-center text-gray-300 text-xs">
        No active receipt
      </div>
    );
  }

  return (
    <Tabs defaultValue="documents" className="h-full flex flex-col">
      <TabsList className="mx-2 mt-2 h-7 text-xs">
        <TabsTrigger value="documents" className="text-xs">Docs</TabsTrigger>
        <TabsTrigger value="barcode" className="text-xs">Labels</TabsTrigger>
        <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
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

function DocumentsTab({ receipt, onUpdate }: { receipt: Receipt; onUpdate: (r: Receipt) => void }) {
  const documents = receipt.documents ?? [];
  const units = receipt.units ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('other');
  const [docNotes, setDocNotes] = useState('');
  const RECEIPT_LEVEL = '__receipt_level__';
  const [assignToUnit, setAssignToUnit] = useState(RECEIPT_LEVEL);
  const [uploading, setUploading] = useState(false);

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
      if (!resp.ok) throw new Error('Upload failed');
      const updated = await apiRequest(`/api/receipts/${receipt.id}`);
      onUpdate(updated);
      setDocNotes('');
      setAssignToUnit(RECEIPT_LEVEL);
      toast.success('Document uploaded');
    } catch (err) {
      toast.error('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => apiRequest(`/api/receipts/${receipt.id}/documents/${docId}`, { method: 'DELETE' }),
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
            {DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        {units.length > 0 && (
          <Select value={assignToUnit} onValueChange={setAssignToUnit}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Assign to unit (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={RECEIPT_LEVEL}>Receipt-level (no unit)</SelectItem>
              {units.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.barcode}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Input
          className="h-7 text-xs"
          placeholder="Notes (optional)"
          value={docNotes}
          onChange={e => setDocNotes(e.target.value)}
        />
        <input type="file" ref={fileRef} className="hidden" onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }} />
        <Button size="sm" className="w-full h-7 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
          Choose File
        </Button>
      </div>

      {documents.length === 0 && <div className="text-xs text-gray-500 text-center py-2">No documents uploaded</div>}
      <div className="space-y-1">
        {documents.map(doc => (
          <div key={doc.id} className="border rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 min-w-0">
                <FileText className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="font-medium truncate max-w-[120px]">{doc.filename ?? 'Document'}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {doc.storagePath && (
                  <a
                    href={`/api/media/download?path=${encodeURIComponent(doc.storagePath)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center h-6 w-6 rounded hover:bg-gray-100 justify-center text-blue-500"
                    title="Download"
                  >
                    <Download className="w-3 h-3" />
                  </a>
                )}
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400" onClick={() => deleteMutation.mutate(doc.id)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </div>
            <div className="text-gray-400 flex gap-2 mt-0.5">
              <Badge variant="outline" className="text-xs h-4">{doc.docType?.replace(/_/g, ' ')}</Badge>
              {doc.receivedUnitId && <span className="text-gray-400">Unit #{doc.receivedUnitId}</span>}
              {doc.uploadedByDisplayName && <span className="text-gray-400">by {doc.uploadedByDisplayName}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarcodesTab({ receipt }: { receipt: Receipt }) {
  const units = receipt.units ?? [];
  const [barcodeImages, setBarcodeImages] = useState<Record<number, string>>({});
  const [loadingImages, setLoadingImages] = useState<Record<number, boolean>>({});

  // Pre-fetch barcode images for all units when the tab renders
  useEffect(() => {
    if (!receipt.id || units.length === 0) return;
    for (const unit of units) {
      if (barcodeImages[unit.id] || loadingImages[unit.id]) continue;
      setLoadingImages(prev => ({ ...prev, [unit.id]: true }));
      apiRequest(`/api/receipts/${receipt.id}/units/${unit.id}/label`)
        .then((data: any) => {
          if (data?.barcodeImage) {
            setBarcodeImages(prev => ({ ...prev, [unit.id]: data.barcodeImage }));
          }
        })
        .catch(() => {})
        .finally(() => setLoadingImages(prev => ({ ...prev, [unit.id]: false })));
    }
  }, [receipt.id, units.length]);

  const printLabel = async (unitId: number) => {
    try {
      const labelData = await apiRequest(`/api/receipts/${receipt.id}/units/${unitId}/label`);
      await printLabelPDF([labelData], `Label ${labelData.barcode}`);
    } catch {
      toast.error('Failed to fetch label data');
    }
  };

  const printBatch = async () => {
    try {
      const labels = await apiRequest(`/api/receipts/${receipt.id}/labels/batch`, { method: 'POST' });
      await printLabelPDF(labels, `Batch Labels - ${receipt.receiptNumber}`);
    } catch {
      toast.error('Failed to fetch batch labels');
    }
  };

  return (
    <div className="space-y-3">
      {units.length > 1 && (
        <Button size="sm" className="w-full text-xs" onClick={printBatch}>
          <Printer className="w-3 h-3 mr-1" /> Batch Print All ({units.length})
        </Button>
      )}

      {units.length === 0 && <div className="text-xs text-gray-500 text-center py-2">No units to print</div>}

      <div className="space-y-2">
        {units.map(unit => (
          <div key={unit.id} className="border rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="font-mono text-xs text-blue-600">{unit.barcode}</div>
                <div className="text-xs text-gray-500">{unit.quantity} {unit.uom}</div>
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
            {unit.lotNumber && <div className="text-xs text-gray-400">Lot: {unit.lotNumber}</div>}
            {unit.expirationDate && <div className="text-xs text-gray-400">Exp: {new Date(unit.expirationDate).toLocaleDateString()}</div>}
            <Button size="sm" variant="outline" className="w-full h-6 text-xs mt-2" onClick={() => printLabel(unit.id)}>
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

  if (isLoading) return <div className="flex items-center justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>;

  return (
    <div className="space-y-2">
      {entries.length === 0 && <div className="text-xs text-gray-500 text-center py-2">No history</div>}
      {entries.map(entry => (
        <div key={entry.id} className="border rounded p-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{formatAction(entry.action)}</span>
            <span className="text-gray-400">{new Date(entry.createdAt).toLocaleString()}</span>
          </div>
          <div className="text-gray-500">{entry.actorDisplayName ?? 'System'}</div>
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div className="text-gray-400 mt-0.5">
              {Object.entries(entry.metadata).slice(0, 3).map(([k, v]) => (
                <span key={k} className="mr-2">{k}: {String(v)}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ── Label PDF Generation ───────────────────────────────────────────────────────

async function printLabelPDF(labels: any[], title: string) {
  if (!labels || labels.length === 0) {
    toast.error('No labels to print');
    return;
  }
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'in', format: [4, 6] });

  for (let idx = 0; idx < labels.length; idx++) {
    const label = labels[idx];
    if (idx > 0) pdf.addPage([4, 6]);

    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');

    // Part number + description
    pdf.text(`${label.agPartNumber ?? ''}  ${(label.description ?? '').slice(0, 40)}`, 0.2, 0.35);

    // Vendor name
    if (label.vendorName) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      pdf.text(label.vendorName, 0.2, 0.55);
    }

    // CODE128 barcode image (base64 PNG from server via bwip-js)
    if (label.barcodeImage) {
      try {
        pdf.addImage(label.barcodeImage, 'PNG', 0.5, 0.65, 3.0, 0.7);
      } catch (_) {
        // Fallback: text representation
        pdf.setFontSize(10);
        pdf.setFont('courier', 'normal');
        pdf.text(`| ${label.barcode} |`, 2, 1.0, { align: 'center' });
      }
    } else {
      pdf.setFontSize(10);
      pdf.setFont('courier', 'normal');
      pdf.text(`| ${label.barcode} |`, 2, 1.0, { align: 'center' });
    }

    // Barcode text below image
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.text(label.barcode, 2, 1.45, { align: 'center' });

    let y = 1.7;
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
    row('Rcvd', label.receiptDate ? new Date(label.receiptDate).toLocaleDateString() : null);
    row('Mfg', label.manufactureDate ? new Date(label.manufactureDate).toLocaleDateString() : null);
    row('Exp', label.expirationDate ? new Date(label.expirationDate).toLocaleDateString() : null);
    row('Location', label.location);

    // Disposition badge at bottom
    pdf.setFontSize(8);
    const dispLabel = DISPOSITION_LABELS[label.disposition] ?? label.disposition ?? '';
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
  const [mobileTab, setMobileTab] = useState<'pos' | 'workflow' | 'sidebar'>('pos');

  const createReceiptMutation = useMutation({
    mutationFn: (data: Record<string, any>) => apiRequest('/api/receipts', {
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

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-950 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-semibold">Receiving Control Center</h1>
          </div>
          {activeReceipt && (
            <Badge variant="outline" className="text-xs">
              Active: {activeReceipt.receiptNumber}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/inventory/receiving-legacy" className="text-xs text-gray-400 hover:text-gray-600 underline">
            Legacy view
          </Link>
        </div>
      </div>

      {/* Mobile tab nav (hidden on md+) */}
      <div className="md:hidden flex border-b bg-white dark:bg-gray-950 shrink-0">
        {(['pos', 'workflow', 'sidebar'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              mobileTab === tab
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'pos' ? 'Expected POs' : tab === 'workflow' ? 'Workflow' : 'Docs & Labels'}
          </button>
        ))}
      </div>

      {/* Desktop: Three-panel layout; Mobile: Tab-based */}
      <div className="flex-1 overflow-hidden">
        {/* Desktop grid */}
        <div className="hidden md:grid h-full" style={{ gridTemplateColumns: '280px 1fr 320px' }}>
          <div className="border-r overflow-hidden">
            <LeftPanel onStartReceipt={handleStartReceipt} activeReceiptId={activeReceipt?.id ?? null} />
          </div>
          <div className="overflow-hidden border-r">
            {createReceiptMutation.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <CenterPanel receipt={activeReceipt} onReceiptUpdate={handleUpdate} />
            )}
          </div>
          <div className="overflow-hidden">
            <RightPanel receipt={activeReceipt} onUpdate={handleUpdate} />
          </div>
        </div>

        {/* Mobile single-panel */}
        <div className="md:hidden h-full overflow-hidden">
          {mobileTab === 'pos' && (
            <LeftPanel onStartReceipt={handleStartReceipt} activeReceiptId={activeReceipt?.id ?? null} />
          )}
          {mobileTab === 'workflow' && (
            createReceiptMutation.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : (
              <CenterPanel receipt={activeReceipt} onReceiptUpdate={handleUpdate} />
            )
          )}
          {mobileTab === 'sidebar' && (
            <RightPanel receipt={activeReceipt} onUpdate={handleUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}

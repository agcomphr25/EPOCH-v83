import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  Package,
  CheckCircle,
  AlertTriangle,
  Shield,
  Loader2,
  Truck,
  Search,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  FileText,
  Download,
  ClipboardCheck,
  Zap,
  ExternalLink,
  Receipt,
  Ban,
} from 'lucide-react';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import ShipmentSummaryModal from './ShipmentSummaryModal';
import P2InvoicePreviewButton from './P2InvoicePreviewButton';

type SerializedUnit = {
  id: string;
  barcode: string;
  serialNumber: string;
  sequenceNumber: number;
  partNumber: string;
  partName: string;
  poNumber: string;
  poId: number;
  poItemId: number;
  customerName: string;
  customerId: string;
  status: string;
  currentDepartment: string;
  currentStageIndex: number;
  buildFamilyKey: string | null;
  sku: string | null;
  drawingName: string | null;
  customerSerialNumber: string | null;
  completedAt: string | null;
  finalizedAt: string | null;
  finalizedBy: string | null;
};

type POGroup = {
  poNumber: string;
  poId: number;
  customerName: string;
  units: SerializedUnit[];
  totalUnits: number;
  finalizedCount: number;
  readyToShip: number;
  inProduction: number;
};

type CreatedShipment = {
  lotId: string;
  lotNumber: string;
  slipId: string;
  slipNumber: string;
  certId?: string;
  certNumber?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  invoiceTotalAmount?: string;
  journalEntryId?: number;
  journalEntryStatus?: string;
  journalLineCount?: number;
};

function invoiceStatusColor(status?: string) {
  switch (status?.toUpperCase()) {
    case 'DRAFT': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'REVIEW': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'POSTED': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'SENT': return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'PAID': return 'bg-green-50 text-green-800 border-green-200';
    case 'VOID': return 'bg-gray-50 text-gray-600 border-gray-200';
    default: return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

export default function P2ShippingTab({ initialPO, initialUnits, selectedPOIds = [] }: { initialPO?: string; initialUnits?: string; selectedPOIds?: number[] } = {}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [finalizingPO, setFinalizingPO] = useState<string | null>(null);
  const [skuInputs, setSkuInputs] = useState<Record<string, string>>({});
  const [drawingInputs, setDrawingInputs] = useState<Record<string, string>>({});

  // Checkboxes for selecting which unfinalized units to finalize
  const [finalizationSelections, setFinalizationSelections] = useState<Record<string, Set<string>>>({});

  // Checkboxes for selecting which finalized units to include in a shipment
  const [selectedSerials, setSelectedSerials] = useState<Record<string, Set<string>>>({});

  const [createdShipments, setCreatedShipments] = useState<Record<string, CreatedShipment[]>>({});
  const [creatingShipmentFor, setCreatingShipmentFor] = useState<string | null>(null);
  const [generatingCertFor, setGeneratingCertFor] = useState<string | null>(null);
  const [summaryModalPO, setSummaryModalPO] = useState<string | null>(null);
  const [summaryModalSerials, setSummaryModalSerials] = useState<SerializedUnit[]>([]);
  const [cocModal, setCocModal] = useState<{ poNumber: string; lotId: string } | null>(null);
  const [cocSpecialProcesses, setCocSpecialProcesses] = useState('N/A');
  const [cocShipDate, setCocShipDate] = useState(() => new Date().toISOString().slice(0, 10));

  const autoTriggered = useRef(false);

  const { data: shippingUnitsRaw = [], isLoading, refetch } = useQuery<SerializedUnit[]>({
    queryKey: ['/api/p2/serialized-items/shipping-queue'],
    refetchInterval: 15000,
  });

  const shippingUnits = selectedPOIds.length > 0
    ? shippingUnitsRaw.filter((u) => selectedPOIds.includes(u.poId))
    : shippingUnitsRaw;

  type ExistingShipmentRow = {
    po_id: number;
    lot_id: string;
    lot_number: string;
    slip_id: string;
    slip_number: string;
    cert_id: string | null;
    cert_number: string | null;
    invoice_id: string | null;
    invoice_number: string | null;
    invoice_status: string | null;
    invoice_total_amount: string | null;
    journal_entry_id: number | null;
    journal_entry_status: string | null;
    journal_line_count: number | null;
  };

  const { data: existingShipmentRows = [] } = useQuery<ExistingShipmentRow[]>({
    queryKey: ['/api/p2/lots/existing-shipments'],
  });

  // Build poId → poNumber lookup from the live shipping queue
  const poIdToNumber = useMemo(() => {
    const map: Record<number, string> = {};
    for (const u of shippingUnits) {
      if (u.poId && u.poNumber) map[u.poId] = u.poNumber;
    }
    return map;
  }, [shippingUnits]);

  // Pre-populate createdShipments from server data so packing slip links survive navigation.
  // Merges server rows into existing local state: adds missing lots but preserves locally-enriched
  // fields (e.g. certId/certNumber set by handleGenerateCoC before the next server refetch).
  useEffect(() => {
    if (!existingShipmentRows.length || !Object.keys(poIdToNumber).length) return;
    setCreatedShipments((prev) => {
      const next: Record<string, CreatedShipment[]> = { ...prev };
      for (const row of existingShipmentRows) {
        const poNumber = poIdToNumber[row.po_id];
        if (!poNumber) continue;
        if (!next[poNumber]) next[poNumber] = [];
        const existingIdx = next[poNumber].findIndex((s) => s.lotId === row.lot_id);
        const serverEntry: CreatedShipment = {
          lotId: row.lot_id,
          lotNumber: row.lot_number,
          slipId: row.slip_id,
          slipNumber: row.slip_number,
          certId: row.cert_id ?? undefined,
          certNumber: row.cert_number ?? undefined,
          invoiceId: row.invoice_id ?? undefined,
          invoiceNumber: row.invoice_number ?? undefined,
          invoiceStatus: row.invoice_status ?? undefined,
          invoiceTotalAmount: row.invoice_total_amount ?? undefined,
          journalEntryId: row.journal_entry_id ?? undefined,
          journalEntryStatus: row.journal_entry_status ?? undefined,
          journalLineCount: row.journal_line_count ?? undefined,
        };
        if (existingIdx === -1) {
          next[poNumber] = [...next[poNumber], serverEntry];
        } else {
          const local = next[poNumber][existingIdx];
          // Prefer local cert fields if server hasn't caught up yet
          const merged: CreatedShipment = {
            ...serverEntry,
            certId: local.certId ?? serverEntry.certId,
            certNumber: local.certNumber ?? serverEntry.certNumber,
          };
          next[poNumber] = next[poNumber].map((s, i) => (i === existingIdx ? merged : s));
        }
      }
      return next;
    });
  }, [existingShipmentRows, poIdToNumber]);

  const poGroups = useMemo(() => {
    const groups: Record<string, POGroup> = {};
    for (const unit of shippingUnits) {
      const key = unit.poNumber;
      if (!groups[key]) {
        groups[key] = {
          poNumber: unit.poNumber,
          poId: unit.poId,
          customerName: unit.customerName,
          units: [],
          totalUnits: 0,
          finalizedCount: 0,
          readyToShip: 0,
          inProduction: 0,
        };
      }
      groups[key].units.push(unit);
      groups[key].totalUnits++;
      if (unit.finalizedAt && unit.sku && unit.drawingName) {
        groups[key].finalizedCount++;
      }
      if (unit.completedAt) {
        groups[key].readyToShip++;
      } else {
        groups[key].inProduction++;
      }
    }
    return Object.values(groups).sort((a, b) => {
      const aReady = a.readyToShip > 0 && a.finalizedCount < a.readyToShip ? 0 : 1;
      const bReady = b.readyToShip > 0 && b.finalizedCount < b.readyToShip ? 0 : 1;
      if (aReady !== bReady) return aReady - bReady;
      return a.poNumber.localeCompare(b.poNumber);
    });
  }, [shippingUnits]);

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return poGroups;
    const term = searchTerm.toLowerCase();
    return poGroups.filter(
      (g) =>
        g.poNumber.toLowerCase().includes(term) ||
        g.customerName.toLowerCase().includes(term) ||
        g.units.some(
          (u) =>
            u.barcode.toLowerCase().includes(term) ||
            u.serialNumber.toLowerCase().includes(term) ||
            u.partNumber.toLowerCase().includes(term)
        )
    );
  }, [poGroups, searchTerm]);

  // Auto-populate SKU + Drawing Name from first unit's partNumber / partName when a PO is expanded
  useEffect(() => {
    if (!expandedPO) return;
    const group = poGroups.find((g) => g.poNumber === expandedPO);
    if (!group) return;
    const unfinalized = group.units.filter(
      (u) => u.completedAt && (!u.finalizedAt || !u.sku || !u.drawingName)
    );
    if (unfinalized.length === 0) return;
    const sample = unfinalized[0];
    setSkuInputs((prev) => ({ ...prev, [expandedPO]: prev[expandedPO] || sample.partNumber || '' }));
    setDrawingInputs((prev) => ({ ...prev, [expandedPO]: prev[expandedPO] || sample.partName || '' }));
    setFinalizationSelections((prev) => ({
      ...prev,
      [expandedPO]: prev[expandedPO]?.size ? prev[expandedPO] : new Set(unfinalized.map((u) => u.id)),
    }));
  }, [expandedPO, poGroups]);

  // Auto-select and open modal when navigated here from the dashboard with a ?po= param
  useEffect(() => {
    if (!initialPO || autoTriggered.current || shippingUnits.length === 0) return;
    const readyForPO = shippingUnits.filter(
      (u) => u.poNumber === initialPO &&
             u.status === 'COMPLETED' &&
             !!(u.finalizedAt && u.sku && u.drawingName)
    );
    if (readyForPO.length === 0) return;
    autoTriggered.current = true;
    setExpandedPO(initialPO);

    // If specific unit IDs were passed via ?units=, pre-select only those; otherwise select all ready units
    const preselectedIds = initialUnits ? new Set(initialUnits.split(',').map((s) => s.trim()).filter(Boolean)) : null;
    const unitsToShip = preselectedIds
      ? readyForPO.filter((u) => preselectedIds.has(u.id))
      : readyForPO;

    if (unitsToShip.length === 0) {
      // Fallback: if none of the specified IDs match, open the PO expanded but don't auto-open modal
      return;
    }

    setSelectedSerials((prev) => ({ ...prev, [initialPO]: new Set(unitsToShip.map((u) => u.id)) }));
    setSummaryModalSerials(unitsToShip);
    setSummaryModalPO(initialPO);
  }, [initialPO, initialUnits, shippingUnits]);

  const finalizeMutation = useMutation({
    mutationFn: async (data: {
      serializedItemIds: string[];
      sku: string;
      drawingName: string;
      performedBy: string;
    }) => {
      return await apiRequest('/api/p2/serialized-items/finalize', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/shipping-queue'] });
      toast({ title: 'Units Finalized', description: 'SKU and drawing name assigned successfully.' });
      setFinalizingPO(null);
    },
    onError: (error: any) => {
      const rd = error?.responseData;
      toast({
        title: 'Finalization Failed',
        description: rd?.error || error.message || 'Failed to finalize units',
        variant: 'destructive',
      });
      setFinalizingPO(null);
    },
  });

  const handleFinalize = (poNumber: string) => {
    const sku = skuInputs[poNumber]?.trim();
    const drawing = drawingInputs[poNumber]?.trim();
    if (!sku || !drawing) {
      toast({
        title: 'Missing Fields',
        description: 'Both SKU and Drawing Name are required.',
        variant: 'destructive',
      });
      return;
    }
    const sel = finalizationSelections[poNumber];
    if (!sel || sel.size === 0) {
      toast({
        title: 'No Units Selected',
        description: 'Check the boxes next to the units you want to finalize.',
        variant: 'destructive',
      });
      return;
    }
    setFinalizingPO(poNumber);
    finalizeMutation.mutate({
      serializedItemIds: Array.from(sel),
      sku,
      drawingName: drawing,
      performedBy: 'shipping',
    });
  };

  // ── Finalization selection helpers ──
  const toggleFinalizationSerial = (poNumber: string, serialId: string) => {
    setFinalizationSelections((prev) => {
      const current = new Set(prev[poNumber] ?? []);
      if (current.has(serialId)) current.delete(serialId);
      else current.add(serialId);
      return { ...prev, [poNumber]: current };
    });
  };

  const toggleSelectAllUnfinalized = (poNumber: string, ids: string[]) => {
    setFinalizationSelections((prev) => {
      const current = prev[poNumber] ?? new Set<string>();
      const allSelected = ids.every((id) => current.has(id));
      return { ...prev, [poNumber]: new Set(allSelected ? [] : ids) };
    });
  };

  // ── Shipment selection helpers ──
  const toggleShipSerial = (poNumber: string, serialId: string) => {
    setSelectedSerials((prev) => {
      const current = new Set(prev[poNumber] ?? []);
      if (current.has(serialId)) current.delete(serialId);
      else current.add(serialId);
      return { ...prev, [poNumber]: current };
    });
  };

  const toggleSelectAllFinalized = (poNumber: string, ids: string[]) => {
    setSelectedSerials((prev) => {
      const current = prev[poNumber] ?? new Set<string>();
      const allSelected = ids.every((id) => current.has(id));
      return { ...prev, [poNumber]: new Set(allSelected ? [] : ids) };
    });
  };

  const handleCreateShipment = async (
    poNumber: string,
    serialIds: string[],
    billingAssignments: { serializedItemId: string; allocationId: string }[] = [],
  ) => {
    if (serialIds.length === 0) return;
    setCreatingShipmentFor(poNumber);
    try {
      const lot = await apiRequest('/api/p2/lots', {
        method: 'POST',
        body: JSON.stringify({ serialIds, createdBy: 'shipping', billingAssignments }),
      });
      const slip = await apiRequest('/api/p2/packing-slips', {
        method: 'POST',
        body: JSON.stringify({ lotId: lot.id, createdBy: 'shipping' }),
      });
      setCreatedShipments((prev) => {
        const existing = prev[poNumber] ?? [];
        const newEntry: CreatedShipment = { lotId: lot.id, lotNumber: lot.lotNumber, slipId: slip.id, slipNumber: slip.packingSlipNumber };
        return { ...prev, [poNumber]: [...existing, newEntry] };
      });
      setSelectedSerials((prev) => ({ ...prev, [poNumber]: new Set() }));
      setExpandedPO((prev) => (prev === poNumber ? null : prev));
      queryClient.invalidateQueries({ queryKey: ['/api/p2/lots/existing-shipments'] });
      toast({
        title: 'Shipment Created',
        description: `Lot ${lot.lotNumber} · Packing slip ${slip.packingSlipNumber} generated.`,
      });
    } catch (err: any) {
      toast({ title: 'Shipment Failed', description: err?.message || 'Failed to create shipment', variant: 'destructive' });
    } finally {
      setCreatingShipmentFor(null);
    }
  };

  const openCoCModal = (poNumber: string, lotId: string) => {
    setCocModal({ poNumber, lotId });
    setCocSpecialProcesses('N/A');
    setCocShipDate(new Date().toISOString().slice(0, 10));
  };

  const handleGenerateCoC = async () => {
    if (!cocModal) return;
    const { poNumber, lotId } = cocModal;
    const specialProcesses = cocSpecialProcesses.trim() || 'N/A';
    setGeneratingCertFor(lotId);
    try {
      const cert = await apiRequest('/api/p2/certificates', {
        method: 'POST',
        body: JSON.stringify({ lotId, createdBy: 'shipping', specialProcesses, shipDate: cocShipDate }),
      });
      setCreatedShipments((prev) => {
        const list = prev[poNumber] ?? [];
        return {
          ...prev,
          [poNumber]: list.map((s) =>
            s.lotId === lotId ? { ...s, certId: cert.id, certNumber: cert.certificateNumber } : s
          ),
        };
      });
      setCocModal(null);
      toast({ title: 'CoC Generated', description: `Certificate ${cert.certificateNumber} created.` });
    } catch (err: any) {
      toast({ title: 'CoC Failed', description: err?.message || 'Failed to generate certificate', variant: 'destructive' });
    } finally {
      setGeneratingCertFor(null);
    }
  };

  const handleInvoiceCreated = (poNumber: string, shipment: CreatedShipment, invoice: any) => {
    setCreatedShipments((prev) => {
      const list = prev[poNumber] ?? [];
      return {
        ...prev,
        [poNumber]: list.map((s) =>
          s.slipId === shipment.slipId
            ? {
                ...s,
                invoiceId: invoice?.id,
                invoiceNumber: invoice?.invoiceNumber,
                invoiceStatus: invoice?.status,
              }
            : s
        ),
      };
    });
    queryClient.invalidateQueries({ queryKey: ['/api/p2/lots/existing-shipments'] });
    queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/ar-invoices' });
  };

  const voidShipmentMutation = useMutation({
    mutationFn: async ({ poNumber, shipment, reason }: { poNumber: string; shipment: CreatedShipment; reason: string }) => {
      return apiRequest(`/api/p2/shipments/${shipment.lotId}/void`, {
        method: 'POST',
        body: { reason },
      });
    },
    onSuccess: (_result, variables) => {
      setCreatedShipments((prev) => ({
        ...prev,
        [variables.poNumber]: (prev[variables.poNumber] ?? []).filter((s) => s.lotId !== variables.shipment.lotId),
      }));
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/shipping-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/lots/existing-shipments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/shipments'] });
      queryClient.invalidateQueries({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === '/api/ar-invoices' });
      toast({
        title: 'Shipment voided',
        description: `${variables.shipment.lotNumber} was voided. Finalized units are available to regroup.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Void failed',
        description: err?.message || 'Shipment could not be voided.',
        variant: 'destructive',
      });
    },
  });

  const handleVoidShipment = (poNumber: string, shipment: CreatedShipment) => {
    const reason = window.prompt(`Reason for voiding lot ${shipment.lotNumber}? Finalized units will be released for regrouping.`);
    if (!reason || !reason.trim()) return;
    voidShipmentMutation.mutate({ poNumber, shipment, reason: reason.trim() });
  };

  const summary = useMemo(() => {
    let totalUnits = 0, finalized = 0, readyToShip = 0, needsFinalization = 0;
    for (const g of poGroups) {
      totalUnits += g.totalUnits;
      finalized += g.finalizedCount;
      readyToShip += g.readyToShip;
      needsFinalization += g.units.filter(
        (u) => u.completedAt && (!u.finalizedAt || !u.sku || !u.drawingName)
      ).length;
    }
    return { totalUnits, finalized, readyToShip, needsFinalization, poCount: poGroups.length };
  }, [poGroups]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span className="text-muted-foreground">Loading shipping queue...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {summaryModalPO && (
        <ShipmentSummaryModal
          serials={summaryModalSerials}
          onConfirm={(billingAssignments) => {
            const po = summaryModalPO!;
            const ids = summaryModalSerials.map((s) => s.id);
            setSummaryModalPO(null);
            setSummaryModalSerials([]);
            handleCreateShipment(po, ids, billingAssignments);
          }}
          onCancel={() => {
            setSummaryModalPO(null);
            setSummaryModalSerials([]);
          }}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card><div className="pt-4 pb-3 text-center"><div className="text-2xl font-bold">{summary.poCount}</div><div className="text-xs text-muted-foreground">POs with Units</div></div></Card>
        <Card><div className="pt-4 pb-3 text-center"><div className="text-2xl font-bold">{summary.totalUnits}</div><div className="text-xs text-muted-foreground">Total Units</div></div></Card>
        <Card><div className="pt-4 pb-3 text-center"><div className="text-2xl font-bold text-green-600">{summary.finalized}</div><div className="text-xs text-muted-foreground">Finalized</div></div></Card>
        <Card><div className="pt-4 pb-3 text-center"><div className={`text-2xl font-bold ${summary.needsFinalization > 0 ? 'text-amber-600' : 'text-green-600'}`}>{summary.needsFinalization}</div><div className="text-xs text-muted-foreground">Needs Finalization</div></div></Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by PO number, customer, barcode, or part number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/50">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground font-medium">
            {searchTerm ? 'No matching POs found' : 'No units in shipping pipeline'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchTerm ? 'Try a different search term' : 'Units will appear here when they reach Final QC, Shipping, or are completed'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedPO === group.poNumber;
            const completedUnfinalized = group.units.filter(
              (u) => u.completedAt && (!u.finalizedAt || !u.sku || !u.drawingName)
            );
            const finalizedUnits = group.units.filter(
              (u) => !!(u.finalizedAt && u.sku && u.drawingName)
            );
            const allCompletedFinalized = completedUnfinalized.length === 0 && group.readyToShip > 0;
            const statusColor = allCompletedFinalized
              ? 'border-green-200 dark:border-green-800'
              : completedUnfinalized.length > 0
              ? 'border-amber-200 dark:border-amber-800'
              : 'border-border';

            const unfinalizedIds = completedUnfinalized.map((u) => u.id);
            const finalizedIds = finalizedUnits.map((u) => u.id);
            const finSelForPO = finalizationSelections[group.poNumber] ?? new Set<string>();
            const shipSelForPO = selectedSerials[group.poNumber] ?? new Set<string>();
            const finalizeSelectedCount = finSelForPO.size;
            const shipSelectedCount = shipSelForPO.size;
            const shipments = createdShipments[group.poNumber] ?? [];

            // Show checkbox column whenever there are any actionable rows
            const showCheckboxCol = unfinalizedIds.length > 0 || finalizedIds.length > 0;

            return (
              <Card key={group.poNumber} className={statusColor}>
                {/* PO header row */}
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => setExpandedPO(isExpanded ? null : group.poNumber)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                      {isExpanded
                        ? <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    </div>
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {group.poNumber}
                        <span className="text-muted-foreground font-normal">— {group.customerName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                        <span>{group.totalUnits} unit(s)</span>
                        <span className="text-green-600">{finalizedUnits.length} ready</span>
                        {completedUnfinalized.length > 0 && (
                          <span className="text-amber-600">{completedUnfinalized.length} need finalization</span>
                        )}
                        {group.inProduction > 0 && <span className="text-blue-600">{group.inProduction} in production</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Ship All Ready — batch action */}
                    {finalizedUnits.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={finalizedUnits.length === 0}
                        className="border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20 text-xs h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSerials((prev) => ({
                            ...prev,
                            [group.poNumber]: new Set(finalizedUnits.map((u) => u.id)),
                          }));
                          setSummaryModalSerials(finalizedUnits);
                          setSummaryModalPO(group.poNumber);
                        }}
                      >
                        <Zap className="w-3 h-3 mr-1" />
                        Ship All Ready ({finalizedUnits.length})
                      </Button>
                    )}
                    {shipments.length > 0 ? (
                      <>
                        <Badge className="bg-green-600 text-white text-xs gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {shipments.length === 1 ? 'Shipment Created' : `${shipments.length} Shipments`}
                        </Badge>
                      </>
                    ) : allCompletedFinalized ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />Ready to Ship
                      </Badge>
                    ) : completedUnfinalized.length > 0 ? (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400">
                        <Shield className="w-3 h-3 mr-1" />{completedUnfinalized.length} Need Finalization
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400">
                        <Loader2 className="w-3 h-3 mr-1" />In Production
                      </Badge>
                    )}
                    {shipments.length === 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {group.finalizedCount}/{group.totalUnits} finalized
                      </Badge>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 space-y-4">

                    {/* ── Finalization panel ── */}
                    {completedUnfinalized.length > 0 && (
                      <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
                            <Shield className="w-4 h-4" />
                            Assign SKU &amp; Drawing to selected units
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="text-xs text-amber-600 hover:text-amber-800 underline"
                              onClick={() => toggleSelectAllUnfinalized(group.poNumber, unfinalizedIds)}
                            >
                              {unfinalizedIds.every((id) => finSelForPO.has(id)) ? 'Deselect All' : 'Select All'}
                            </button>
                            {finalizeSelectedCount > 0 && (
                              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                                {finalizeSelectedCount} selected
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor={`sku-${group.poNumber}`} className="text-xs font-medium">SKU *</Label>
                            <Input
                              id={`sku-${group.poNumber}`}
                              placeholder="Enter SKU"
                              value={skuInputs[group.poNumber] || ''}
                              onChange={(e) => setSkuInputs((prev) => ({ ...prev, [group.poNumber]: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`drawing-${group.poNumber}`} className="text-xs font-medium">Drawing Name *</Label>
                            <Input
                              id={`drawing-${group.poNumber}`}
                              placeholder="Enter drawing name"
                              value={drawingInputs[group.poNumber] || ''}
                              onChange={(e) => setDrawingInputs((prev) => ({ ...prev, [group.poNumber]: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleFinalize(group.poNumber)}
                            disabled={(finalizeMutation.isPending && finalizingPO === group.poNumber) || finalizeSelectedCount === 0}
                            className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                          >
                            {finalizeMutation.isPending && finalizingPO === group.poNumber ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Finalizing...</>
                            ) : (
                              <><CheckCircle className="w-3 h-3 mr-1" />
                                {finalizeSelectedCount > 0
                                  ? `Finalize ${finalizeSelectedCount} Unit(s)`
                                  : 'Select units below to finalize'}
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={finalizeSelectedCount === 0}
                            className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20 disabled:opacity-50"
                            onClick={() => setFinalizationSelections((prev) => ({ ...prev, [group.poNumber]: new Set<string>() }))}
                          >
                            Uncheck All
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ── Unit table grouped by status ── */}
                    {(() => {
                      const inProductionUnits = group.units.filter((u) => !u.completedAt);
                      const needsFinalizationUnits = group.units.filter(
                        (u) => u.completedAt && !(u.finalizedAt && u.sku && u.drawingName)
                      );

                      // Build status sections — only render non-empty ones
                      const sections: { label: string; units: SerializedUnit[]; key: string }[] = [];
                      if (inProductionUnits.length > 0) sections.push({ label: 'In Production', units: inProductionUnits, key: 'in-production' });
                      if (needsFinalizationUnits.length > 0) sections.push({ label: 'Needs Finalization', units: needsFinalizationUnits, key: 'needs-finalization' });
                      if (shipments.length === 0 && finalizedUnits.length > 0) sections.push({ label: 'Ready to Ship', units: finalizedUnits, key: 'ready-to-ship' });
                      if (shipments.length > 0 && finalizedUnits.length > 0) sections.push({ label: 'Shipment Created', units: finalizedUnits, key: 'shipment-created' });

                      const renderTableRows = (units: SerializedUnit[]) =>
                        units.map((unit) => {
                          const isFinalized = !!(unit.finalizedAt && unit.sku && unit.drawingName);
                          const isCompleted = !!unit.completedAt;
                          const isNeedingFinalization = isCompleted && !isFinalized;
                          const isSelectedForFinalize = finSelForPO.has(unit.id);
                          const isSelectedForShip = shipSelForPO.has(unit.id);
                          const rowBg = isSelectedForShip
                            ? 'bg-blue-50/60 dark:bg-blue-900/20'
                            : isSelectedForFinalize
                            ? 'bg-amber-50/80 dark:bg-amber-900/20'
                            : isFinalized
                            ? 'bg-green-50/50 dark:bg-green-900/10'
                            : isCompleted
                            ? 'bg-amber-50/30 dark:bg-amber-900/5'
                            : '';
                          return (
                            <tr key={unit.id} className={rowBg}>
                              {showCheckboxCol && (
                                <td className="px-3 py-2 text-center">
                                  {isFinalized ? (
                                    <Checkbox
                                      checked={isSelectedForShip}
                                      onCheckedChange={() => toggleShipSerial(group.poNumber, unit.id)}
                                      aria-label={`Select ${unit.serialNumber} for shipment`}
                                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                    />
                                  ) : isNeedingFinalization ? (
                                    <Checkbox
                                      checked={isSelectedForFinalize}
                                      onCheckedChange={() => toggleFinalizationSerial(group.poNumber, unit.id)}
                                      aria-label={`Select ${unit.serialNumber} for finalization`}
                                      className="data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                                    />
                                  ) : (
                                    <span className="w-4 h-4 inline-block" />
                                  )}
                                </td>
                              )}
                              <td className="px-3 py-2">
                                <div className="font-mono text-xs">{unit.barcode}</div>
                                <div className="text-[10px] text-muted-foreground">{unit.serialNumber}</div>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <div>{unit.partNumber}</div>
                                <div className="text-muted-foreground text-[10px]">{unit.partName}</div>
                              </td>
                              <td className="px-3 py-2 text-xs">{unit.currentDepartment}</td>
                              <td className="px-3 py-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${
                                  isCompleted
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                    : unit.status === 'HOLD'
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                }`}>
                                  {isCompleted ? 'COMPLETED' : unit.status}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {unit.sku || <span className="text-muted-foreground italic">—</span>}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {unit.drawingName || <span className="text-muted-foreground italic">—</span>}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {isFinalized
                                  ? <CheckCircle className="w-4 h-4 text-green-500 mx-auto" />
                                  : isCompleted
                                  ? <AlertTriangle className="w-4 h-4 text-amber-500 mx-auto" />
                                  : <span className="text-[10px] text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        });

                      return (
                        <div className="border rounded-lg">
                          <Accordion type="multiple" defaultValue={[]}>
                            {sections.map((section, sIdx) => (
                              <AccordionItem
                                key={section.key}
                                value={section.key}
                                className={sIdx === sections.length - 1 ? 'border-b-0' : ''}
                              >
                                <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline hover:bg-muted/40">
                                  <span>{section.label} <span className="text-muted-foreground font-normal">({section.units.length})</span></span>
                                </AccordionTrigger>
                                <AccordionContent className="pb-0">
                                  <div className="overflow-y-auto overflow-x-auto max-h-[400px]">
                                    <table className="w-full text-sm">
                                      <thead className="bg-muted/50 sticky top-0 z-10">
                                        <tr>
                                          {showCheckboxCol && (
                                            <th className="px-3 py-2 w-10 text-center">
                                              {(section.key === 'ready-to-ship' || section.key === 'shipment-created') && finalizedIds.length > 0 ? (
                                                <Checkbox
                                                  checked={finalizedIds.length > 0 && finalizedIds.every((id) => shipSelForPO.has(id))}
                                                  onCheckedChange={() => toggleSelectAllFinalized(group.poNumber, finalizedIds)}
                                                  aria-label="Select all finalized for shipment"
                                                  title="Select all finalized (for shipment)"
                                                />
                                              ) : (
                                                <span className="w-4 h-4 inline-block" />
                                              )}
                                            </th>
                                          )}
                                          <th className="px-3 py-2 text-left font-medium text-xs">Serial / Barcode</th>
                                          <th className="px-3 py-2 text-left font-medium text-xs">Part</th>
                                          <th className="px-3 py-2 text-left font-medium text-xs">Dept</th>
                                          <th className="px-3 py-2 text-left font-medium text-xs">Status</th>
                                          <th className="px-3 py-2 text-left font-medium text-xs">SKU</th>
                                          <th className="px-3 py-2 text-left font-medium text-xs">Drawing</th>
                                          <th className="px-3 py-2 text-center font-medium text-xs w-20">Finalized</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y">
                                        {renderTableRows(section.units)}
                                      </tbody>
                                    </table>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      );
                    })()}

                    {/* Column legend */}
                    {showCheckboxCol && (unfinalizedIds.length > 0 || finalizedIds.length > 0) && (
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1">
                        {unfinalizedIds.length > 0 && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm border border-amber-400 bg-amber-100 inline-block" />
                            Amber checkbox = select to finalize
                          </span>
                        )}
                        {finalizedIds.length > 0 && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm border border-blue-400 bg-blue-100 inline-block" />
                            Blue checkbox = select for shipment
                          </span>
                        )}
                      </div>
                    )}

                    {/* ── Create Shipment bar ── */}
                    {finalizedIds.length > 0 && (
                      <div className="flex items-center justify-between p-3 bg-muted/30 border rounded-lg">
                        <div className="text-sm text-muted-foreground">
                          {shipSelectedCount > 0
                            ? `${shipSelectedCount} finalized unit(s) selected for shipment`
                            : `${finalizedIds.length} finalized unit(s) available — check blue boxes to create a shipment`}
                        </div>
                        <Button
                          size="sm"
                          disabled={shipSelectedCount === 0 || creatingShipmentFor === group.poNumber}
                          onClick={() => {
                            const selected = group.units.filter((u) => shipSelForPO.has(u.id));
                            setSummaryModalSerials(selected);
                            setSummaryModalPO(group.poNumber);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {creatingShipmentFor === group.poNumber ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Creating...</>
                          ) : (
                            <><Truck className="w-3 h-3 mr-1" />Create Shipment ({shipSelectedCount})</>
                          )}
                        </Button>
                      </div>
                    )}

                    {/* ── Created shipment documents ── */}
                    {shipments.map((shipment) => {
                      const displayedShipmentDocumentNumber = shipment.invoiceNumber || shipment.slipNumber;
                      return (
                        <div key={shipment.lotId} className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-semibold">
                          <CheckCircle className="w-4 h-4" />
                          Shipment Created
                          <span className="font-mono font-normal text-xs text-green-600/80 dark:text-green-400/70">
                            Lot{' '}
                            <Link
                              to={`/p2/shipments/${shipment.lotId}`}
                              className="hover:underline cursor-pointer"
                            >
                              {shipment.lotNumber}
                            </Link>
                            {' '}· {displayedShipmentDocumentNumber}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm" variant="outline"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => window.open(`/p2/packing-slip/${shipment.slipId}`, '_blank')}
                          >
                            <FileText className="w-3 h-3 mr-1" />Packing Slip
                          </Button>
                          <Button
                            size="sm" variant="outline"
                            className="border-slate-300 text-slate-700 hover:bg-slate-50"
                            onClick={() => setLocation(`/p2/shipments/${shipment.lotId}`)}
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />Shipment Detail
                          </Button>
                          {shipment.certId ? (
                            <Button
                              size="sm" variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-50"
                              onClick={() => window.open(`/api/p2/certificates/${shipment.certId}/pdf`, '_blank')}
                            >
                              <Download className="w-3 h-3 mr-1" />CoC PDF — {shipment.certNumber}
                            </Button>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-50"
                              disabled={generatingCertFor === shipment.lotId}
                              onClick={() => openCoCModal(group.poNumber, shipment.lotId)}
                            >
                              {generatingCertFor === shipment.lotId ? (
                                <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Generating...</>
                              ) : (
                                <><ClipboardCheck className="w-3 h-3 mr-1" />Generate CoC</>
                              )}
                            </Button>
                          )}
                          {shipment.invoiceId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setLocation(`/finance/invoices/${shipment.invoiceId}`)}
                            >
                              <Receipt className="w-3 h-3 mr-1" />Invoice {shipment.invoiceNumber}
                            </Button>
                          ) : (
                            <P2InvoicePreviewButton
                              packingSlipId={shipment.slipId}
                              size="sm"
                              variant="outline"
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                              onCreated={(invoice) => handleInvoiceCreated(group.poNumber, shipment, invoice)}
                            />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-700 hover:bg-red-50"
                            disabled={voidShipmentMutation.isPending && voidShipmentMutation.variables?.shipment.lotId === shipment.lotId}
                            onClick={() => handleVoidShipment(group.poNumber, shipment)}
                          >
                            {voidShipmentMutation.isPending && voidShipmentMutation.variables?.shipment.lotId === shipment.lotId ? (
                              <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Voiding...</>
                            ) : (
                              <><Ban className="w-3 h-3 mr-1" />Void</>
                            )}
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {shipment.invoiceId ? (
                            <>
                              <Badge variant="outline" className={invoiceStatusColor(shipment.invoiceStatus)}>
                                Invoice {shipment.invoiceStatus || 'created'}
                              </Badge>
                              {shipment.journalEntryId ? (
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                  JE #{shipment.journalEntryId} {shipment.journalEntryStatus || 'POSTED'}
                                  {shipment.journalLineCount ? ` (${shipment.journalLineCount} lines)` : ''}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                  JE pending until invoice is posted
                                </Badge>
                              )}
                            </>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                              No invoice created
                            </Badge>
                          )}
                        </div>
                        </div>
                      );
                    })}

                    {allCompletedFinalized && shipments.length === 0 && (
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                          <Truck className="w-4 h-4" />
                          <span className="font-medium">All units finalized — check blue boxes above to select for shipment</span>
                        </div>
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          {group.readyToShip} unit(s) ready
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Dialog open={!!cocModal} onOpenChange={(open) => !open && setCocModal(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Generate Certificate of Conformance</DialogTitle>
            <DialogDescription>
              Confirm the shipping date and any special processes before creating the CoC.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="coc-ship-date">Shipping Date</Label>
              <Input
                id="coc-ship-date"
                type="date"
                value={cocShipDate}
                onChange={(event) => setCocShipDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="coc-special-processes">Special Processes</Label>
              <Textarea
                id="coc-special-processes"
                value={cocSpecialProcesses}
                onChange={(event) => setCocSpecialProcesses(event.target.value)}
                placeholder="N/A"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCocModal(null)}
              disabled={!!cocModal && generatingCertFor === cocModal.lotId}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGenerateCoC}
              disabled={!cocShipDate || (!!cocModal && generatingCertFor === cocModal.lotId)}
            >
              {!!cocModal && generatingCertFor === cocModal.lotId ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><ClipboardCheck className="w-4 h-4 mr-2" />Generate CoC</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

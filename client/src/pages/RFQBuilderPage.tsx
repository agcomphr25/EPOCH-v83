import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import RFQBuilderStep2Tooling, {
  type ToolingRow,
} from "@/components/estimating/RFQBuilderStep2Tooling";
import RFQBuilderStep3Bom, {
  type BomLineRow,
} from "@/components/estimating/RFQBuilderStep3Bom";

// ── Types ─────────────────────────────────────────────────────────────────────

type RfqPartRow = {
  id?: string;
  lineNumber: number;
  partNumber: string;
  partDescription: string;
  quantity: number;
  revision: string;
  uom: string;
  materialSpec: string;
  processFamily: string;
  makeBuyType: string;
  partType: string;
  notes: string;
};

type RfqHeader = {
  rfqNumber: string;
  customerId: string;
  customerNameSnapshot: string;
  revision: string;
  quoteDueDate: string;
  requestedDueDate: string;
  notes: string;
  assumptions: string;
  status: string;
};

type ProcessRow = {
  id?: string;
  rfqPartId: string;
  departmentName: string;
  sourceType: string;
  setupHours: number;
  hoursPerPart: number;
  hourlyRate: number;
  notes?: string;
};

type AdjustmentRow = {
  id?: string;
  rfqPartId?: string | null;
  adjustmentType: string;
  description: string;
  pricingMode: string;
  amount: number;
  percentValue?: number | null;
  appliesToScope: string;
  includeInCustomerPrice: boolean;
  notes?: string;
};

type ShippingRow = {
  id?: string;
  rfqPartId?: string | null;
  shippingMode: string;
  description?: string;
  method?: string;
  amount: number;
  allocationMethod?: string;
  includeInCustomerPrice: boolean;
  notes?: string;
};

type QuantityBreakRow = {
  id?: string;
  label: string;
  quantity: number;
  sortOrder: number;
};

type EstimateVersionRow = {
  id: string;
  version_number: number;
  created_at: string;
  created_by?: number | null;
  change_summary?: string | null;
  status: string;
  superseded_by?: string | null;
  margin_summary?: Record<string, unknown>;
  line_versions?: unknown[];
};

type EstimateAssumptionRow = {
  id: string;
  assumption_type: string;
  assumption_text: string;
  numeric_value?: string | null;
  uom?: string | null;
  confidence_level: string;
  source_reference?: string | null;
  created_at: string;
};

type EstimatingApprovalRow = {
  id: string;
  approval_role: string;
  approval_status: string;
  signer_display_name?: string | null;
  approval_comments?: string | null;
  signed_at?: string | null;
};

type RiskItemRow = {
  id: string;
  category: string;
  description: string;
  severity: number;
  probability: number;
  score: number;
  status: string;
  requires_approval: boolean;
  owner_display_name?: string | null;
};

type RiskAssessmentRow = {
  id: string;
  status: string;
  overall_score: number;
  overall_level: string;
  approval_routing?: string[];
  risk_items?: RiskItemRow[];
};

type ReleaseReadiness = {
  readyForQuoteRelease: boolean;
  requiredRoles: string[];
  missingRoles: string[];
  executiveRequired: boolean;
  executiveTriggers: string[];
  totalEstimateValue: number;
  minMarginPercent: number | null;
  risk: {
    assessmentId: string | null;
    status: string | null;
    overallScore: number;
    overallLevel: string;
    blockingRiskCount: number;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const defaultDepartmentOptions = [
  "CUTTING_TABLE", "LAYUP", "MOLD_ASSEMBLY_DISASSEMBLY", "CURE_OVEN",
  "CNC", "FINISH", "PAINT", "QC", "SHIPPING_PREP", "OTHER",
];

const adjustmentTypeOptions = [
  "OVERHEAD", "COMPLIANCE", "DOCUMENTATION", "ADMIN", "CAPEX", "SHIPPING_MISC", "OTHER",
];

const pricingModeOptions = [
  "FLAT", "PER_PART", "PERCENT_OF_MATERIAL", "PERCENT_OF_LABOR", "INTERNAL_ONLY",
];

const shippingModeOptions = ["PER_PART", "PER_PO", "INTERNAL_ONLY"];
const shippingAllocationOptions = ["EVEN", "BY_QUANTITY", "BY_VALUE", "MANUAL"];

// ── Factories ─────────────────────────────────────────────────────────────────

const emptyPart = (lineNumber: number): RfqPartRow => ({
  lineNumber, partNumber: "", partDescription: "", quantity: 1, revision: "",
  uom: "EA", materialSpec: "", processFamily: "", makeBuyType: "", partType: "", notes: "",
});

const emptyToolingRow = (): ToolingRow => ({
  description: "", toolingType: "MANDREL", quantity: 1, unitCost: 0,
  appliesToScope: "ALL_PARTS", pricingTreatment: "SEPARATE_LINE",
  amortizationQty: null, chargeTiming: "ONE_TIME", customerOwnedTooling: false, notes: "",
});

const emptyBomLine = (rfqPartId: string): BomLineRow => ({
  rfqPartId, inventoryItemId: null, childPartAgNumber: "", description: "",
  category: "PREPREG", quantityPerPart: 0, uom: "EA", estimatedUnitCost: 0,
  scrapPercent: 0, isEstimated: true, isDraftInventoryItem: false,
  vendorNameSnapshot: "", materialSpec: "", notes: "",
});

const emptyProcessRow = (rfqPartId: string): ProcessRow => ({
  rfqPartId, departmentName: "LAYUP", sourceType: "MANUAL",
  setupHours: 0, hoursPerPart: 0, hourlyRate: 0, notes: "",
});

const emptyAdjustmentRow = (): AdjustmentRow => ({
  rfqPartId: null, adjustmentType: "OVERHEAD", description: "",
  pricingMode: "FLAT", amount: 0, percentValue: null,
  appliesToScope: "RFQ", includeInCustomerPrice: true, notes: "",
});

const emptyShippingRow = (): ShippingRow => ({
  rfqPartId: null, shippingMode: "PER_PO", description: "", method: "",
  amount: 0, allocationMethod: "EVEN", includeInCustomerPrice: true, notes: "",
});

const emptyQuantityBreak = (sortOrder: number): QuantityBreakRow => ({
  label: "", quantity: 1, sortOrder,
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function RFQBuilderPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/rfq-builder/:id");
  const rfqId = params?.id;
  const queryClient = useQueryClient();

  const [header, setHeader] = useState<RfqHeader>({
    rfqNumber: "", customerId: "", customerNameSnapshot: "", revision: "",
    quoteDueDate: "", requestedDueDate: "", notes: "", assumptions: "", status: "DRAFT",
  });
  const [parts, setParts] = useState<RfqPartRow[]>([emptyPart(1)]);
  const [saveMessage, setSaveMessage] = useState("");

  const [toolingRows, setToolingRows] = useState<ToolingRow[]>([]);
  const [toolingMessage, setToolingMessage] = useState("");

  const [selectedBomPartId, setSelectedBomPartId] = useState("");
  const [bomLines, setBomLines] = useState<BomLineRow[]>([]);
  const [bomMessage, setBomMessage] = useState("");

  const [selectedProcessPartId, setSelectedProcessPartId] = useState("");
  const [processRows, setProcessRows] = useState<ProcessRow[]>([]);
  const [processMessage, setProcessMessage] = useState("");

  const [selectedAdjustmentPartId, setSelectedAdjustmentPartId] = useState("");
  const [adjustmentScopeFilter, setAdjustmentScopeFilter] = useState<"RFQ" | "PART">("RFQ");
  const [adjustmentRows, setAdjustmentRows] = useState<AdjustmentRow[]>([]);
  const [adjustmentMessage, setAdjustmentMessage] = useState("");

  const [selectedShippingPartId, setSelectedShippingPartId] = useState("");
  const [shippingScopeFilter, setShippingScopeFilter] = useState<"RFQ" | "PART">("RFQ");
  const [shippingRows, setShippingRows] = useState<ShippingRow[]>([]);
  const [shippingMessage, setShippingMessage] = useState("");

  const [quantityBreakRows, setQuantityBreakRows] = useState<QuantityBreakRow[]>([]);
  const [quantityBreakMessage, setQuantityBreakMessage] = useState("");
  const [pricingSnapshotMessage, setPricingSnapshotMessage] = useState("");
  const [quoteHandoffError, setQuoteHandoffError] = useState("");
  const [createdQuoteId, setCreatedQuoteId] = useState<string | null>(null);
  const [createdQuoteNumber, setCreatedQuoteNumber] = useState<string | null>(null);
  const [isHandingOff, setIsHandingOff] = useState(false);
  const [marginPercent, setMarginPercent] = useState(20);
  const [controlMessage, setControlMessage] = useState("");
  const [versionSummary, setVersionSummary] = useState("");
  const [assumptionDraft, setAssumptionDraft] = useState({
    assumptionType: "LABOR",
    assumptionText: "",
    numericValue: "",
    uom: "",
    confidenceLevel: "MEDIUM",
    sourceReference: "",
  });
  const [approvalDraft, setApprovalDraft] = useState({
    approvalRole: "ESTIMATOR",
    approvalStatus: "APPROVED",
    signerDisplayName: "",
    digitalSignature: "",
    approvalComments: "",
  });
  const [riskDraft, setRiskDraft] = useState({
    category: "TECHNICAL",
    description: "",
    severity: 3,
    probability: 3,
    ownerDisplayName: "",
    requiresApproval: false,
  });
  const [mitigationDraft, setMitigationDraft] = useState({
    actionDescription: "",
    assignedToDisplayName: "",
    status: "OPEN",
  });

  const isEditMode = useMemo(() => Boolean(rfqId), [rfqId]);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const rfqQuery = useQuery({
    queryKey: ["estimating-rfq", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}`),
  });

  const partsQuery = useQuery({
    queryKey: ["estimating-rfq-parts", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/parts`),
  });

  const toolingQuery = useQuery({
    queryKey: ["estimating-rfq-tooling", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/tooling`),
  });

  const bomLinesQuery = useQuery({
    queryKey: ["estimating-rfq-bom-lines", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/bom-lines`),
  });

  const processRowsQuery = useQuery({
    queryKey: ["estimating-rfq-process-rows", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/process-rows`),
  });

  const adjustmentsQuery = useQuery({
    queryKey: ["estimating-rfq-adjustments", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/adjustments`),
  });

  const shippingQuery = useQuery({
    queryKey: ["estimating-rfq-shipping", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/shipping`),
  });

  const quantityBreaksQuery = useQuery({
    queryKey: ["estimating-rfq-quantity-breaks", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/quantity-breaks`),
  });

  const versionsQuery = useQuery<EstimateVersionRow[]>({
    queryKey: ["estimating-rfq-versions", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/versions`),
  });

  const assumptionsQuery = useQuery<EstimateAssumptionRow[]>({
    queryKey: ["estimating-rfq-assumptions", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/assumptions`),
  });

  const approvalsQuery = useQuery<EstimatingApprovalRow[]>({
    queryKey: ["estimating-rfq-approvals", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/approvals`),
  });

  const riskAssessmentsQuery = useQuery<RiskAssessmentRow[]>({
    queryKey: ["estimating-rfq-risk-assessments", rfqId], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/risk-assessments`),
  });

  const releaseReadinessQuery = useQuery<ReleaseReadiness>({
    queryKey: ["estimating-rfq-release-readiness", rfqId, marginPercent], enabled: !!rfqId,
    queryFn: async () => apiRequest(`/api/estimating/rfqs/${rfqId}/approval-readiness`, { method: "POST", body: {} }),
  });

  // ── Hydration ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (rfqQuery.data) {
      const d = rfqQuery.data;
      setHeader({
        rfqNumber: d.rfqNumber ?? "", customerId: d.customerId ? String(d.customerId) : "",
        customerNameSnapshot: d.customerNameSnapshot ?? "", revision: d.revision ?? "",
        quoteDueDate: d.quoteDueDate ? String(d.quoteDueDate).slice(0, 10) : "",
        requestedDueDate: d.requestedDueDate ? String(d.requestedDueDate).slice(0, 10) : "",
        notes: d.notes ?? "", assumptions: d.assumptions ?? "", status: d.status ?? "DRAFT",
      });
    }
  }, [rfqQuery.data]);

  useEffect(() => {
    if (partsQuery.data && Array.isArray(partsQuery.data) && partsQuery.data.length > 0) {
      setParts(partsQuery.data.map((p: any, i: number) => ({
        id: p.id, lineNumber: p.lineNumber ?? i + 1, partNumber: p.partNumber ?? "",
        partDescription: p.partDescription ?? "", quantity: Number(p.quantity ?? 1),
        revision: p.revision ?? "", uom: p.uom ?? "EA", materialSpec: p.materialSpec ?? "",
        processFamily: p.processFamily ?? "", makeBuyType: p.makeBuyType ?? "",
        partType: p.partType ?? "", notes: p.notes ?? "",
      })));
    }
  }, [partsQuery.data]);

  useEffect(() => {
    if (toolingQuery.data && Array.isArray(toolingQuery.data)) {
      setToolingRows(toolingQuery.data.map((r: any) => ({
        id: r.id, description: r.description ?? "", toolingType: r.toolingType ?? "MANDREL",
        quantity: Number(r.quantity ?? 1), unitCost: Number(r.unitCost ?? 0),
        totalCost: Number(r.totalCost ?? 0), appliesToScope: r.appliesToScope ?? "ALL_PARTS",
        pricingTreatment: r.pricingTreatment ?? "SEPARATE_LINE",
        amortizationQty: r.amortizationQty ? Number(r.amortizationQty) : null,
        chargeTiming: r.chargeTiming ?? "ONE_TIME", customerOwnedTooling: !!r.customerOwnedTooling,
        notes: r.notes ?? "",
      })));
    }
  }, [toolingQuery.data]);

  useEffect(() => {
    if (bomLinesQuery.data && Array.isArray(bomLinesQuery.data)) {
      setBomLines(bomLinesQuery.data.map((l: any) => ({
        id: l.id, rfqPartId: l.rfqPartId, inventoryItemId: l.inventoryItemId ?? null,
        childPartAgNumber: l.childPartAgNumber ?? "", description: l.description ?? "",
        category: l.category ?? "PREPREG", quantityPerPart: Number(l.quantityPerPart ?? 0),
        uom: l.uom ?? "EA", estimatedUnitCost: Number(l.estimatedUnitCost ?? 0),
        scrapPercent: Number(l.scrapPercent ?? 0), isEstimated: !!l.isEstimated,
        isDraftInventoryItem: !!l.isDraftInventoryItem, vendorNameSnapshot: l.vendorNameSnapshot ?? "",
        materialSpec: l.materialSpec ?? "", notes: l.notes ?? "",
      })));
    }
  }, [bomLinesQuery.data]);

  useEffect(() => {
    if (processRowsQuery.data && Array.isArray(processRowsQuery.data)) {
      setProcessRows(processRowsQuery.data.map((r: any) => ({
        id: r.id, rfqPartId: r.rfqPartId, departmentName: r.departmentName ?? "LAYUP",
        sourceType: r.sourceType ?? "MANUAL", setupHours: Number(r.setupHours ?? 0),
        hoursPerPart: Number(r.hoursPerPart ?? 0), hourlyRate: Number(r.hourlyRate ?? 0),
        notes: r.notes ?? "",
      })));
    }
  }, [processRowsQuery.data]);

  useEffect(() => {
    if (adjustmentsQuery.data && Array.isArray(adjustmentsQuery.data)) {
      setAdjustmentRows(adjustmentsQuery.data.map((r: any) => ({
        id: r.id, rfqPartId: r.rfqPartId ?? null, adjustmentType: r.adjustmentType ?? "OVERHEAD",
        description: r.description ?? "", pricingMode: r.pricingMode ?? "FLAT",
        amount: Number(r.amount ?? 0),
        percentValue: r.percentValue != null ? Number(r.percentValue) : null,
        appliesToScope: r.appliesToScope ?? "RFQ",
        includeInCustomerPrice: r.includeInCustomerPrice !== false, notes: r.notes ?? "",
      })));
    }
  }, [adjustmentsQuery.data]);

  useEffect(() => {
    if (shippingQuery.data && Array.isArray(shippingQuery.data)) {
      setShippingRows(shippingQuery.data.map((r: any) => ({
        id: r.id, rfqPartId: r.rfqPartId ?? null, shippingMode: r.shippingMode ?? "PER_PO",
        description: r.description ?? "", method: r.method ?? "",
        amount: Number(r.amount ?? 0), allocationMethod: r.allocationMethod ?? "EVEN",
        includeInCustomerPrice: r.includeInCustomerPrice !== false, notes: r.notes ?? "",
      })));
    }
  }, [shippingQuery.data]);

  useEffect(() => {
    if (quantityBreaksQuery.data && Array.isArray(quantityBreaksQuery.data)) {
      setQuantityBreakRows(
        quantityBreaksQuery.data.map((r: any, index: number) => ({
          id: r.id, label: r.label ?? "",
          quantity: Number(r.quantity ?? 1),
          sortOrder: Number(r.sortOrder ?? index),
        }))
      );
    }
  }, [quantityBreaksQuery.data]);

  useEffect(() => {
    if (!selectedBomPartId && parts.length > 0) {
      const saved = parts.find((p) => p.id);
      if (saved?.id) setSelectedBomPartId(saved.id);
    }
  }, [parts, selectedBomPartId]);

  useEffect(() => {
    if (!selectedProcessPartId && parts.length > 0) {
      const saved = parts.find((p) => p.id);
      if (saved?.id) setSelectedProcessPartId(saved.id);
    }
  }, [parts, selectedProcessPartId]);

  // ── Parts helpers ────────────────────────────────────────────────────────────

  const saveParts = async (id: string) => {
    const valid = parts.filter((p) => p.partNumber.trim()).map((p, i) => ({
      lineNumber: i + 1, partNumber: p.partNumber, partDescription: p.partDescription,
      quantity: Number(p.quantity || 1), revision: p.revision, uom: p.uom || "EA",
      materialSpec: p.materialSpec, processFamily: p.processFamily,
      makeBuyType: p.makeBuyType, partType: p.partType, notes: p.notes,
    }));
    await apiRequest(`/api/estimating/rfqs/${id}/parts`, { method: "DELETE" });
    for (const p of valid) await apiRequest(`/api/estimating/rfqs/${id}/parts`, { method: "POST", body: p });
  };

  const handleHeaderChange = (field: keyof RfqHeader, value: string) =>
    setHeader((prev) => ({ ...prev, [field]: value }));

  const handlePartChange = (index: number, field: keyof RfqPartRow, value: string | number) =>
    setParts((prev) => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next; });

  const addPartRow = () => setParts((prev) => [...prev, emptyPart(prev.length + 1)]);

  const removePartRow = (index: number) =>
    setParts((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((_, i) => i !== index).map((r, i) => ({ ...r, lineNumber: i + 1 }));
    });

  const buildHeaderPayload = () => {
    const payload = {
      ...header,
      customerId: header.customerId ? Number(header.customerId) : null,
      quoteDueDate: header.quoteDueDate || null,
      requestedDueDate: header.requestedDueDate || null,
    };
    if (!payload.rfqNumber.trim()) delete (payload as Partial<RfqHeader>).rfqNumber;
    return payload;
  };

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createRfqMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/estimating/rfqs", { method: "POST", body: buildHeaderPayload() });
    },
    onSuccess: async (created) => {
      setHeader((prev) => ({ ...prev, rfqNumber: created.rfqNumber ?? prev.rfqNumber }));
      await saveParts(created.id);
      await queryClient.invalidateQueries({ queryKey: ["/api/estimating/rfqs"] });
      setSaveMessage(`Draft RFQ ${created.rfqNumber ?? ""} saved.`);
      setLocation(`/rfq-builder/${created.id}`);
    },
    onError: () => setSaveMessage("Failed to save RFQ. Please try again."),
  });

  const updateRfqMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/estimating/rfqs/${rfqId}`, { method: "PATCH", body: buildHeaderPayload() });
    },
    onSuccess: async () => {
      await saveParts(rfqId!);
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq", rfqId] });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-parts", rfqId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/estimating/rfqs"] });
      setSaveMessage("Draft RFQ updated.");
    },
    onError: () => setSaveMessage("Failed to update RFQ. Please try again."),
  });

  const onSaveDraft = () => {
    setSaveMessage("");
    if (!parts.some((p) => p.partNumber.trim())) { setSaveMessage("Add at least one part number before saving."); return; }
    if (isEditMode) updateRfqMutation.mutate(); else createRfqMutation.mutate();
  };

  // ── Tooling helpers ──────────────────────────────────────────────────────────

  const addToolingRow = () => {
    if (!rfqId) { setToolingMessage("Save the RFQ header first before adding tooling."); return; }
    setToolingRows((prev) => [...prev, emptyToolingRow()]);
  };

  const updateToolingRow = (index: number, field: keyof ToolingRow, value: string | number | boolean | null) => {
    setToolingRows((prev) => {
      const next = [...prev];
      const updated = { ...next[index], [field]: value };
      updated.totalCost = Number(updated.quantity || 0) * Number(updated.unitCost || 0);
      next[index] = updated; return next;
    });
  };

  const saveToolingRow = async (row: ToolingRow) => {
    if (!rfqId) { setToolingMessage("Save the RFQ header first before adding tooling."); return; }
    if (!row.description.trim()) { setToolingMessage("Tooling description is required."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/tooling`, { method: "POST", body: {
      description: row.description, toolingType: row.toolingType,
      quantity: Number(row.quantity || 0), unitCost: Number(row.unitCost || 0),
      appliesToScope: row.appliesToScope, pricingTreatment: row.pricingTreatment,
      amortizationQty: row.amortizationQty ? Number(row.amortizationQty) : null,
      chargeTiming: row.chargeTiming, customerOwnedTooling: !!row.customerOwnedTooling,
      notes: row.notes ?? "",
    } });
    setToolingMessage("Tooling row saved.");
    await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-tooling", rfqId] });
  };

  const deleteToolingRow = async (index: number, row: ToolingRow) => {
    if (row.id) {
      await apiRequest(`/api/estimating/tooling/${row.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-tooling", rfqId] });
      setToolingMessage("Tooling row deleted."); return;
    }
    setToolingRows((prev) => prev.filter((_, i) => i !== index));
  };

  // ── BOM helpers ──────────────────────────────────────────────────────────────

  const filteredBomLines = useMemo(() => {
    if (!selectedBomPartId) return [];
    return bomLines.filter((l) => l.rfqPartId === selectedBomPartId);
  }, [bomLines, selectedBomPartId]);

  const addBomLine = () => {
    if (!rfqId) { setBomMessage("Save the RFQ first before adding BOM lines."); return; }
    if (!selectedBomPartId) { setBomMessage("Select an RFQ part first."); return; }
    setBomLines((prev) => [...prev, emptyBomLine(selectedBomPartId)]);
  };

  const updateBomLine = (index: number, field: keyof BomLineRow, value: string | number | boolean | null) => {
    const matchingIndexes = bomLines.map((l, i) => ({ l, i }))
      .filter(({ l }) => l.rfqPartId === selectedBomPartId).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setBomLines((prev) => { const next = [...prev]; next[actual] = { ...next[actual], [field]: value }; return next; });
  };

  const saveBomLine = async (row: BomLineRow) => {
    if (!rfqId) { setBomMessage("Save the RFQ first before adding BOM lines."); return; }
    if (!row.description.trim()) { setBomMessage("BOM line description is required."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/bom-lines`, { method: "POST", body: {
      rfqPartId: row.rfqPartId, inventoryItemId: row.inventoryItemId ?? null,
      childPartAgNumber: row.childPartAgNumber || "", description: row.description,
      category: row.category, quantityPerPart: Number(row.quantityPerPart || 0),
      uom: row.uom || "EA", estimatedUnitCost: Number(row.estimatedUnitCost || 0),
      scrapPercent: Number(row.scrapPercent || 0), isEstimated: !!row.isEstimated,
      isDraftInventoryItem: !!row.isDraftInventoryItem, vendorNameSnapshot: row.vendorNameSnapshot || "",
      materialSpec: row.materialSpec || "", notes: row.notes || "",
    } });
    setBomMessage("BOM line saved.");
    await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-bom-lines", rfqId] });
  };

  const deleteBomLine = async (index: number, row: BomLineRow) => {
    if (row.id) {
      await apiRequest(`/api/estimating/bom-lines/${row.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-bom-lines", rfqId] });
      setBomMessage("BOM line deleted."); return;
    }
    const matchingIndexes = bomLines.map((l, i) => ({ l, i }))
      .filter(({ l }) => l.rfqPartId === selectedBomPartId).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setBomLines((prev) => prev.filter((_, i) => i !== actual));
  };

  const bomSummary = useMemo(() => {
    return filteredBomLines.reduce(
      (acc, r) => {
        const cost = Number(r.quantityPerPart || 0) * Number(r.estimatedUnitCost || 0) * (1 + Number(r.scrapPercent || 0) / 100);
        acc.totalPerPart += cost;
        if (r.category === "PREPREG") acc.prepreg += cost;
        if (r.category === "CONSUMABLE") acc.consumables += cost;
        if (r.category === "PAINT") acc.paint += cost;
        if (r.category === "HARDWARE") acc.hardware += cost;
        if (r.category === "PACKAGING") acc.packaging += cost;
        if (r.category === "ADHESIVE") acc.adhesive += cost;
        if (r.category === "OTHER") acc.other += cost;
        return acc;
      },
      { totalPerPart: 0, prepreg: 0, consumables: 0, paint: 0, hardware: 0, packaging: 0, adhesive: 0, other: 0 }
    );
  }, [filteredBomLines]);

  const selectedBomPart = useMemo(() => parts.find((p) => p.id === selectedBomPartId), [parts, selectedBomPartId]);
  const bomExtendedTotal = bomSummary.totalPerPart * Number(selectedBomPart?.quantity ?? 0);

  // ── Process row helpers ──────────────────────────────────────────────────────

  const filteredProcessRows = useMemo(() => {
    if (!selectedProcessPartId) return [];
    return processRows.filter((r) => r.rfqPartId === selectedProcessPartId);
  }, [processRows, selectedProcessPartId]);

  const addProcessRow = () => {
    if (!rfqId) { setProcessMessage("Save the RFQ first before adding process rows."); return; }
    if (!selectedProcessPartId) { setProcessMessage("Select an RFQ part first."); return; }
    setProcessRows((prev) => [...prev, emptyProcessRow(selectedProcessPartId)]);
  };

  const updateProcessRow = (index: number, field: keyof ProcessRow, value: string | number) => {
    const matchingIndexes = processRows.map((r, i) => ({ r, i }))
      .filter(({ r }) => r.rfqPartId === selectedProcessPartId).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setProcessRows((prev) => { const next = [...prev]; next[actual] = { ...next[actual], [field]: value }; return next; });
  };

  const saveProcessRow = async (row: ProcessRow) => {
    if (!rfqId) { setProcessMessage("Save the RFQ first before adding process rows."); return; }
    if (!row.departmentName.trim()) { setProcessMessage("Department name is required."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/process-rows`, { method: "POST", body: {
      rfqPartId: row.rfqPartId, departmentName: row.departmentName, sourceType: row.sourceType,
      setupHours: Number(row.setupHours || 0), hoursPerPart: Number(row.hoursPerPart || 0),
      hourlyRate: Number(row.hourlyRate || 0), notes: row.notes || "",
    } });
    setProcessMessage("Process row saved.");
    await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-process-rows", rfqId] });
  };

  const deleteProcessRow = async (index: number, row: ProcessRow) => {
    if (row.id) {
      await apiRequest(`/api/estimating/process-rows/${row.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-process-rows", rfqId] });
      setProcessMessage("Process row deleted."); return;
    }
    const matchingIndexes = processRows.map((r, i) => ({ r, i }))
      .filter(({ r }) => r.rfqPartId === selectedProcessPartId).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setProcessRows((prev) => prev.filter((_, i) => i !== actual));
  };

  const processSummary = useMemo(() => {
    return filteredProcessRows.reduce(
      (acc, r) => {
        const setup = Number(r.setupHours || 0) * Number(r.hourlyRate || 0);
        const recurring = Number(r.hoursPerPart || 0) * Number(r.hourlyRate || 0);
        acc.setupCost += setup; acc.recurringCostPerPart += recurring; acc.totalPerPart += recurring;
        return acc;
      },
      { setupCost: 0, recurringCostPerPart: 0, totalPerPart: 0 }
    );
  }, [filteredProcessRows]);

  const selectedProcessPart = useMemo(() => parts.find((p) => p.id === selectedProcessPartId), [parts, selectedProcessPartId]);
  const selectedProcessQty = Number(selectedProcessPart?.quantity ?? 0);
  const processExtendedTotal = processSummary.setupCost + processSummary.recurringCostPerPart * selectedProcessQty;

  // ── Adjustment helpers ───────────────────────────────────────────────────────

  const filteredAdjustmentRows = useMemo(() => {
    return adjustmentRows.filter((r) => {
      if (adjustmentScopeFilter === "RFQ") return r.appliesToScope === "RFQ";
      return r.appliesToScope === "PART" && r.rfqPartId === selectedAdjustmentPartId;
    });
  }, [adjustmentRows, adjustmentScopeFilter, selectedAdjustmentPartId]);

  const addAdjustmentRow = () => {
    if (!rfqId) { setAdjustmentMessage("Save the RFQ first before adding adjustments."); return; }
    if (adjustmentScopeFilter === "PART" && !selectedAdjustmentPartId) { setAdjustmentMessage("Select an RFQ part first."); return; }
    setAdjustmentRows((prev) => [...prev, { ...emptyAdjustmentRow(), appliesToScope: adjustmentScopeFilter,
      rfqPartId: adjustmentScopeFilter === "PART" ? selectedAdjustmentPartId : null }]);
  };

  const updateAdjustmentRow = (index: number, field: keyof AdjustmentRow, value: string | number | boolean | null) => {
    const matchingIndexes = adjustmentRows.map((r, i) => ({ r, i })).filter(({ r }) => {
      if (adjustmentScopeFilter === "RFQ") return r.appliesToScope === "RFQ";
      return r.appliesToScope === "PART" && r.rfqPartId === selectedAdjustmentPartId;
    }).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setAdjustmentRows((prev) => { const next = [...prev]; next[actual] = { ...next[actual], [field]: value }; return next; });
  };

  const saveAdjustmentRow = async (row: AdjustmentRow) => {
    if (!rfqId) { setAdjustmentMessage("Save the RFQ first before adding adjustments."); return; }
    if (!row.description.trim()) { setAdjustmentMessage("Adjustment description is required."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/adjustments`, { method: "POST", body: {
      rfqPartId: row.appliesToScope === "PART" ? row.rfqPartId : null,
      adjustmentType: row.adjustmentType, description: row.description,
      pricingMode: row.pricingMode, amount: Number(row.amount || 0),
      percentValue: row.percentValue != null ? Number(row.percentValue) : null,
      appliesToScope: row.appliesToScope, includeInCustomerPrice: !!row.includeInCustomerPrice,
      notes: row.notes || "",
    } });
    setAdjustmentMessage("Adjustment saved.");
    await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-adjustments", rfqId] });
  };

  const deleteAdjustmentRow = async (index: number, row: AdjustmentRow) => {
    if (row.id) {
      await apiRequest(`/api/estimating/adjustments/${row.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-adjustments", rfqId] });
      setAdjustmentMessage("Adjustment deleted."); return;
    }
    const matchingIndexes = adjustmentRows.map((r, i) => ({ r, i })).filter(({ r }) => {
      if (adjustmentScopeFilter === "RFQ") return r.appliesToScope === "RFQ";
      return r.appliesToScope === "PART" && r.rfqPartId === selectedAdjustmentPartId;
    }).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setAdjustmentRows((prev) => prev.filter((_, i) => i !== actual));
  };

  const selectedAdjustmentPart = useMemo(() => parts.find((p) => p.id === selectedAdjustmentPartId), [parts, selectedAdjustmentPartId]);
  const selectedAdjustmentQty = Number(selectedAdjustmentPart?.quantity ?? 0);

  const adjustmentSummary = useMemo(() => {
    return filteredAdjustmentRows.reduce(
      (acc, r) => {
        let computed = 0;
        if (r.pricingMode === "FLAT") computed = Number(r.amount || 0);
        else if (r.pricingMode === "PER_PART") computed = Number(r.amount || 0) * selectedAdjustmentQty;
        else if (r.pricingMode === "PERCENT_OF_MATERIAL") computed = bomSummary.totalPerPart * selectedAdjustmentQty * (Number(r.percentValue || 0) / 100);
        else if (r.pricingMode === "PERCENT_OF_LABOR") computed = processExtendedTotal * (Number(r.percentValue || 0) / 100);
        else if (r.pricingMode === "INTERNAL_ONLY") computed = Number(r.amount || 0);
        acc.total += computed;
        if (r.includeInCustomerPrice && r.pricingMode !== "INTERNAL_ONLY") acc.customerFacing += computed;
        else acc.internalOnly += computed;
        if (r.adjustmentType === "CAPEX") acc.capex += computed;
        if (r.adjustmentType === "OVERHEAD") acc.overhead += computed;
        if (r.adjustmentType === "COMPLIANCE") acc.compliance += computed;
        if (r.adjustmentType === "DOCUMENTATION") acc.documentation += computed;
        if (r.adjustmentType === "ADMIN") acc.admin += computed;
        return acc;
      },
      { total: 0, customerFacing: 0, internalOnly: 0, capex: 0, overhead: 0, compliance: 0, documentation: 0, admin: 0 }
    );
  }, [filteredAdjustmentRows, selectedAdjustmentQty, bomSummary.totalPerPart, processExtendedTotal]);

  // ── Shipping helpers ─────────────────────────────────────────────────────────

  const filteredShippingRows = useMemo(() => {
    return shippingRows.filter((r) => {
      if (shippingScopeFilter === "RFQ") return !r.rfqPartId;
      return r.rfqPartId === selectedShippingPartId;
    });
  }, [shippingRows, shippingScopeFilter, selectedShippingPartId]);

  const addShippingRow = () => {
    if (!rfqId) { setShippingMessage("Save the RFQ first before adding shipping."); return; }
    if (shippingScopeFilter === "PART" && !selectedShippingPartId) { setShippingMessage("Select an RFQ part first."); return; }
    setShippingRows((prev) => [...prev, { ...emptyShippingRow(),
      rfqPartId: shippingScopeFilter === "PART" ? selectedShippingPartId : null }]);
  };

  const updateShippingRow = (index: number, field: keyof ShippingRow, value: string | number | boolean | null) => {
    const matchingIndexes = shippingRows.map((r, i) => ({ r, i })).filter(({ r }) => {
      if (shippingScopeFilter === "RFQ") return !r.rfqPartId;
      return r.rfqPartId === selectedShippingPartId;
    }).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setShippingRows((prev) => { const next = [...prev]; next[actual] = { ...next[actual], [field]: value }; return next; });
  };

  const saveShippingRow = async (row: ShippingRow) => {
    if (!rfqId) { setShippingMessage("Save the RFQ first before adding shipping."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/shipping`, { method: "POST", body: {
      rfqPartId: shippingScopeFilter === "PART" ? row.rfqPartId : null,
      shippingMode: row.shippingMode, description: row.description || "",
      method: row.method || "", amount: Number(row.amount || 0),
      allocationMethod: row.allocationMethod || "EVEN",
      includeInCustomerPrice: !!row.includeInCustomerPrice, notes: row.notes || "",
    } });
    setShippingMessage("Shipping row saved.");
    await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-shipping", rfqId] });
  };

  const deleteShippingRow = async (index: number, row: ShippingRow) => {
    if (row.id) {
      await apiRequest(`/api/estimating/shipping/${row.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-shipping", rfqId] });
      setShippingMessage("Shipping row deleted."); return;
    }
    const matchingIndexes = shippingRows.map((r, i) => ({ r, i })).filter(({ r }) => {
      if (shippingScopeFilter === "RFQ") return !r.rfqPartId;
      return r.rfqPartId === selectedShippingPartId;
    }).map(({ i }) => i);
    const actual = matchingIndexes[index];
    if (actual === undefined) return;
    setShippingRows((prev) => prev.filter((_, i) => i !== actual));
  };

  const shippingSummary = useMemo(() => {
    return filteredShippingRows.reduce(
      (acc, r) => {
        const amount = Number(r.amount || 0);
        acc.total += amount;
        if (r.includeInCustomerPrice && r.shippingMode !== "INTERNAL_ONLY") acc.customerFacing += amount;
        else acc.internalOnly += amount;
        if (r.shippingMode === "PER_PART") acc.perPart += amount;
        if (r.shippingMode === "PER_PO") acc.perPo += amount;
        return acc;
      },
      { total: 0, customerFacing: 0, internalOnly: 0, perPart: 0, perPo: 0 }
    );
  }, [filteredShippingRows]);

  // ── Quantity break helpers ────────────────────────────────────────────────────

  const addQuantityBreakRow = () => {
    if (!rfqId) { setQuantityBreakMessage("Save the RFQ first before adding quantity breaks."); return; }
    setQuantityBreakRows((prev) => [...prev, emptyQuantityBreak(prev.length)]);
  };

  const updateQuantityBreakRow = (index: number, field: keyof QuantityBreakRow, value: string | number) => {
    setQuantityBreakRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const saveQuantityBreakRow = async (row: QuantityBreakRow) => {
    if (!rfqId) { setQuantityBreakMessage("Save the RFQ first before adding quantity breaks."); return; }
    if (!row.label.trim()) { setQuantityBreakMessage("Quantity break label is required."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/quantity-breaks`, { method: "POST", body: {
      label: row.label, quantity: Number(row.quantity || 1), sortOrder: Number(row.sortOrder || 0),
    } });
    setQuantityBreakMessage("Quantity break saved.");
    await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-quantity-breaks", rfqId] });
  };

  const deleteQuantityBreakRow = async (index: number, row: QuantityBreakRow) => {
    if (row.id) {
      await apiRequest(`/api/estimating/quantity-breaks/${row.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["estimating-rfq-quantity-breaks", rfqId] });
      setQuantityBreakMessage("Quantity break deleted."); return;
    }
    setQuantityBreakRows((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Pricing calculator functions ──────────────────────────────────────────────

  const getToolingCostPerPartForBreak = (breakQty: number) => {
    return toolingRows.reduce((sum, row) => {
      const total = Number(row.totalCost ?? 0);
      if (row.pricingTreatment === "BLENDED_UNIT_PRICE") return sum + (breakQty > 0 ? total / breakQty : 0);
      if (row.pricingTreatment === "AMORTIZED") {
        const amortQty = Number(row.amortizationQty || 0);
        return sum + (amortQty > 0 ? total / amortQty : 0);
      }
      return sum;
    }, 0);
  };

  const getMaterialCostPerPartForPart = (partId: string | undefined) => {
    return bomLines
      .filter((l) => l.rfqPartId === partId)
      .reduce((sum, r) => {
        return sum + Number(r.quantityPerPart || 0) * Number(r.estimatedUnitCost || 0) * (1 + Number(r.scrapPercent || 0) / 100);
      }, 0);
  };

  const getLaborCostPerPartForPartAndBreak = (partId: string | undefined, breakQty: number) => {
    const rows = processRows.filter((r) => r.rfqPartId === partId);
    const setupCost = rows.reduce((s, r) => s + Number(r.setupHours || 0) * Number(r.hourlyRate || 0), 0);
    const recurringPerPart = rows.reduce((s, r) => s + Number(r.hoursPerPart || 0) * Number(r.hourlyRate || 0), 0);
    return recurringPerPart + (breakQty > 0 ? setupCost / breakQty : 0);
  };

  const getAdjustmentCostForPartAndBreak = (
    partId: string | undefined,
    breakQty: number,
    materialCostPerPart: number,
    laborCostPerPart: number
  ) => {
    const applicable = adjustmentRows.filter((r) => {
      if (!r.includeInCustomerPrice) return false;
      if (r.pricingMode === "INTERNAL_ONLY") return false;
      if (r.appliesToScope === "RFQ") return true;
      return r.appliesToScope === "PART" && r.rfqPartId === partId;
    });
    return applicable.reduce((sum, r) => {
      if (r.pricingMode === "FLAT") return sum + (breakQty > 0 ? Number(r.amount || 0) / breakQty : 0);
      if (r.pricingMode === "PER_PART") return sum + Number(r.amount || 0);
      if (r.pricingMode === "PERCENT_OF_MATERIAL") return sum + materialCostPerPart * (Number(r.percentValue || 0) / 100);
      if (r.pricingMode === "PERCENT_OF_LABOR") return sum + laborCostPerPart * (Number(r.percentValue || 0) / 100);
      return sum;
    }, 0);
  };

  const getShippingCostPerPartForBreak = (partId: string | undefined, breakQty: number) => {
    const applicable = shippingRows.filter((r) => {
      if (!r.includeInCustomerPrice) return false;
      if (r.shippingMode === "INTERNAL_ONLY") return false;
      if (!r.rfqPartId) return true;
      return r.rfqPartId === partId;
    });
    return applicable.reduce((sum, r) => {
      if (r.shippingMode === "PER_PART") return sum + Number(r.amount || 0);
      if (r.shippingMode === "PER_PO") return sum + (breakQty > 0 ? Number(r.amount || 0) / breakQty : 0);
      return sum;
    }, 0);
  };

  const pricingMatrix = useMemo(() => {
    return quantityBreakRows
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((qb) => {
        const breakQty = Number(qb.quantity || 0);
        const toolingPerPart = getToolingCostPerPartForBreak(breakQty);
        const partRows = parts.filter((p) => p.id).map((part) => {
          const materialPerPart = getMaterialCostPerPartForPart(part.id);
          const laborPerPart = getLaborCostPerPartForPartAndBreak(part.id, breakQty);
          const adjustmentPerPart = getAdjustmentCostForPartAndBreak(part.id, breakQty, materialPerPart, laborPerPart);
          const shippingPerPart = getShippingCostPerPartForBreak(part.id, breakQty);
          const totalCostPerPart = materialPerPart + laborPerPart + toolingPerPart + adjustmentPerPart + shippingPerPart;
          const marginDecimal = Number(marginPercent || 0) / 100;
          const sellPricePerPart = marginDecimal >= 1 ? totalCostPerPart : totalCostPerPart / (1 - marginDecimal);
          return {
            partId: part.id, partNumber: part.partNumber,
            materialPerPart, laborPerPart, toolingPerPart, adjustmentPerPart, shippingPerPart,
            totalCostPerPart, sellPricePerPart,
            extendedPrice: sellPricePerPart * breakQty,
          };
        });
        const totalExtended = partRows.reduce((s, r) => s + r.extendedPrice, 0);
        const separateTooling = toolingRows
          .filter((t) => t.pricingTreatment === "SEPARATE_LINE")
          .reduce((s, t) => s + Number(t.totalCost ?? 0), 0);

        return { id: qb.id, label: qb.label, quantity: breakQty, rows: partRows, totalExtended, separateTooling };
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantityBreakRows, parts, bomLines, processRows, toolingRows, adjustmentRows, shippingRows, marginPercent]);

  // ── Step 8: Pricing Snapshot rows ────────────────────────────────────────────

  const pricingSnapshotRows = useMemo(() => {
    return pricingMatrix.flatMap((breakRow) =>
      breakRow.rows.map((row) => ({
        rfqId: rfqId as string,
        rfqPartId: row.partId,
        quantityBreakId: breakRow.id,
        materialCostPerPart: String(row.materialPerPart),
        laborCostPerPart: String(row.laborPerPart),
        overheadCostPerPart: String(row.adjustmentPerPart),
        shippingCostPerPart: String(row.shippingPerPart),
        toolingCostPerPart: String(row.toolingPerPart),
        totalCostPerPart: String(row.totalCostPerPart),
        marginPercent: String(marginPercent),
        sellPricePerPart: String(row.sellPricePerPart),
        extendedPrice: String(row.extendedPrice),
      })),
    );
  }, [pricingMatrix, rfqId, marginPercent]);

  const latestVersion = versionsQuery.data?.[0];
  const latestRiskAssessment = riskAssessmentsQuery.data?.[0];
  const riskItems = latestRiskAssessment?.risk_items ?? [];
  const releaseReadiness = releaseReadinessQuery.data;

  const refreshControls = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["estimating-rfq-versions", rfqId] }),
      queryClient.invalidateQueries({ queryKey: ["estimating-rfq-assumptions", rfqId] }),
      queryClient.invalidateQueries({ queryKey: ["estimating-rfq-approvals", rfqId] }),
      queryClient.invalidateQueries({ queryKey: ["estimating-rfq-risk-assessments", rfqId] }),
      queryClient.invalidateQueries({ queryKey: ["estimating-rfq-release-readiness", rfqId] }),
    ]);
  };

  const createEstimateVersion = async () => {
    if (!rfqId) { setControlMessage("Save the RFQ before creating a controlled estimate version."); return; }
    setControlMessage("");
    const data = await apiRequest(`/api/estimating/rfqs/${rfqId}/versions`, { method: "POST", body: {
      changeSummary: versionSummary || "Controlled pricing review snapshot",
      status: "DRAFT",
    } });
    setVersionSummary("");
    setControlMessage(`Estimate version ${data.version_number ?? data.versionNumber ?? ""} captured with ${data.lineCount ?? 0} controlled lines.`);
    await refreshControls();
  };

  const addAssumption = async () => {
    if (!rfqId) { setControlMessage("Save the RFQ before adding assumptions."); return; }
    if (!assumptionDraft.assumptionText.trim()) { setControlMessage("Assumption text is required."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/assumptions`, { method: "POST", body: {
      ...assumptionDraft,
      numericValue: assumptionDraft.numericValue || null,
      uom: assumptionDraft.uom || null,
      sourceReference: assumptionDraft.sourceReference || null,
    } });
    setAssumptionDraft((prev) => ({ ...prev, assumptionText: "", numericValue: "", uom: "", sourceReference: "" }));
    setControlMessage("Assumption added and audit event recorded.");
    await refreshControls();
  };

  const saveApproval = async () => {
    if (!rfqId) { setControlMessage("Save the RFQ before recording approvals."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/approvals`, { method: "POST", body: {
      ...approvalDraft,
      estimateVersionId: latestVersion?.id ?? null,
      signerDisplayName: approvalDraft.signerDisplayName || null,
      digitalSignature: approvalDraft.digitalSignature || null,
      approvalComments: approvalDraft.approvalComments || null,
    } });
    setApprovalDraft((prev) => ({ ...prev, digitalSignature: "", approvalComments: "" }));
    setControlMessage(`${approvalDraft.approvalRole} approval ${approvalDraft.approvalStatus.toLowerCase()} and audit event recorded.`);
    await refreshControls();
  };

  const ensureRiskAssessment = async () => {
    if (!rfqId) { setControlMessage("Save the RFQ before starting risk review."); return null; }
    if (latestRiskAssessment) return latestRiskAssessment;
    const data = await apiRequest(`/api/estimating/rfqs/${rfqId}/risk-assessments`, { method: "POST", body: {
      estimateVersionId: latestVersion?.id ?? null,
      status: "DRAFT",
    } });
    await refreshControls();
    return data as RiskAssessmentRow;
  };

  const addRiskItem = async () => {
    const assessment = await ensureRiskAssessment();
    if (!assessment) return;
    if (!riskDraft.description.trim()) { setControlMessage("Risk description is required."); return; }
    await apiRequest(`/api/estimating/risk-assessments/${assessment.id}/items`, { method: "POST", body: riskDraft });
    setRiskDraft((prev) => ({ ...prev, description: "", ownerDisplayName: "", requiresApproval: false }));
    setControlMessage("Risk item scored and audit event recorded.");
    await refreshControls();
  };

  const closeRiskItem = async (riskItemId: string) => {
    await apiRequest(`/api/estimating/risk-items/${riskItemId}`, { method: "PATCH", body: { status: "CLOSED" } });
    setControlMessage("Risk item closed and audit event recorded.");
    await refreshControls();
  };

  const addMitigation = async (riskItemId: string) => {
    if (!mitigationDraft.actionDescription.trim()) { setControlMessage("Mitigation action is required."); return; }
    await apiRequest(`/api/estimating/risk-items/${riskItemId}/mitigations`, { method: "POST", body: {
      ...mitigationDraft,
      assignedToDisplayName: mitigationDraft.assignedToDisplayName || null,
      completedAt: mitigationDraft.status === "CLOSED" ? new Date().toISOString() : null,
    } });
    setMitigationDraft({ actionDescription: "", assignedToDisplayName: "", status: "OPEN" });
    setControlMessage("Mitigation action recorded.");
    await refreshControls();
  };

  const updateRiskAssessmentStatus = async (status: string) => {
    const assessment = await ensureRiskAssessment();
    if (!assessment) return;
    await apiRequest(`/api/estimating/risk-assessments/${assessment.id}/status`, { method: "PATCH", body: { status } });
    setControlMessage(`Risk assessment marked ${status}.`);
    await refreshControls();
  };

  const savePricingSnapshots = async () => {
    if (!rfqId) { setPricingSnapshotMessage("Save the RFQ first before saving pricing."); return; }
    if (!pricingSnapshotRows.length) { setPricingSnapshotMessage("No pricing rows to save."); return; }
    await apiRequest(`/api/estimating/rfqs/${rfqId}/pricing-snapshots`, { method: "POST", body: pricingSnapshotRows });
    setPricingSnapshotMessage("Pricing snapshots saved.");
    await refreshControls();
  };

  const createDraftQuoteFromRfq = async () => {
    if (!rfqId) { setQuoteHandoffError("Save the RFQ first before creating a quote."); return; }
    setIsHandingOff(true);
    setQuoteHandoffError("");
    setCreatedQuoteId(null);
    setCreatedQuoteNumber(null);
    try {
      await savePricingSnapshots();
      const data = await apiRequest(`/api/estimating/rfqs/${rfqId}/create-draft-quote`, { method: "POST", body: {} });
      setCreatedQuoteId(data.quoteId);
      setCreatedQuoteNumber(data.quoteNumber);
      await refreshControls();
    } catch (error: any) {
      setQuoteHandoffError(error?.message || "Failed to create draft quote. Check the release controls above.");
    } finally {
      setIsHandingOff(false);
    }
  };

  // ── Misc ─────────────────────────────────────────────────────────────────────

  const isSaving = createRfqMutation.isPending || updateRfqMutation.isPending;
  const isLoading = rfqQuery.isLoading || partsQuery.isLoading;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="border rounded-lg p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">ROM Builder</h1>
            <p className="text-sm text-muted-foreground">
              Multi-step ROM builder — header, tooling, material, labor, overhead, shipping
            </p>
          </div>
          <div className="flex gap-2">
            <button className="border rounded px-4 py-2" onClick={() => setLocation("/estimating")} type="button">
              Back to ROM Builder
            </button>
            <button className="bg-primary text-primary-foreground rounded px-4 py-2 disabled:opacity-50"
              onClick={onSaveDraft} disabled={isSaving} type="button">
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
          </div>
        </div>
        {saveMessage && <div className="mt-4 rounded border px-3 py-2 text-sm">{saveMessage}</div>}
      </div>

      {isLoading ? (
        <div className="border rounded-lg p-5">Loading RFQ...</div>
      ) : (
        <>
          {/* ── Step 1: Header ──────────────────────────────────────────────── */}
          <div className="border rounded-lg p-5 space-y-4">
            <h2 className="text-lg font-semibold">Step 1 — RFQ Header</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm mb-1">RFQ Number</label>
                <input
                  className="w-full border rounded px-3 py-2 bg-muted text-muted-foreground"
                  value={header.rfqNumber || "Auto-generated when saved"}
                  readOnly
                />
              </div>
              {([
                ["customerId", "Customer ID"],
                ["customerNameSnapshot", "Customer Name Snapshot"], ["revision", "Revision"],
              ] as [keyof RfqHeader, string][]).map(([field, label]) => (
                <div key={field}>
                  <label className="block text-sm mb-1">{label}</label>
                  <input className="w-full border rounded px-3 py-2" value={header[field]}
                    onChange={(e) => handleHeaderChange(field, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="block text-sm mb-1">Quote Due Date</label>
                <input type="date" className="w-full border rounded px-3 py-2" value={header.quoteDueDate}
                  onChange={(e) => handleHeaderChange("quoteDueDate", e.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">Requested Due Date</label>
                <input type="date" className="w-full border rounded px-3 py-2" value={header.requestedDueDate}
                  onChange={(e) => handleHeaderChange("requestedDueDate", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">Notes</label>
              <textarea className="w-full border rounded px-3 py-2 min-h-[90px]" value={header.notes}
                onChange={(e) => handleHeaderChange("notes", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm mb-1">Assumptions</label>
              <textarea className="w-full border rounded px-3 py-2 min-h-[90px]" value={header.assumptions}
                onChange={(e) => handleHeaderChange("assumptions", e.target.value)} />
            </div>
          </div>

          {/* ── Step 1: Quoted Parts ─────────────────────────────────────────── */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Quoted Parts</h2>
                <p className="text-sm text-muted-foreground">Add one or more part lines for this RFQ.</p>
              </div>
              <button className="border rounded px-4 py-2" onClick={addPartRow} type="button">+ Add Part</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[1200px]">
                <thead>
                  <tr className="border-b">
                    {["Line","Part Number","Description","Qty","Rev","UOM","Material Spec","Process Family","Make/Buy","Part Type","Notes","Remove"].map((h) => (
                      <th key={h} className="text-left p-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, index) => (
                    <tr key={`${part.id ?? "new"}-${index}`} className="border-b align-top">
                      <td className="p-2">{part.lineNumber}</td>
                      <td className="p-2"><input className="w-[160px] border rounded px-2 py-1" value={part.partNumber} onChange={(e) => handlePartChange(index, "partNumber", e.target.value)} /></td>
                      <td className="p-2"><input className="w-[220px] border rounded px-2 py-1" value={part.partDescription} onChange={(e) => handlePartChange(index, "partDescription", e.target.value)} /></td>
                      <td className="p-2"><input type="number" min={1} className="w-[90px] border rounded px-2 py-1" value={part.quantity} onChange={(e) => handlePartChange(index, "quantity", Number(e.target.value))} /></td>
                      <td className="p-2"><input className="w-[90px] border rounded px-2 py-1" value={part.revision} onChange={(e) => handlePartChange(index, "revision", e.target.value)} /></td>
                      <td className="p-2"><input className="w-[90px] border rounded px-2 py-1" value={part.uom} onChange={(e) => handlePartChange(index, "uom", e.target.value)} /></td>
                      <td className="p-2"><input className="w-[180px] border rounded px-2 py-1" value={part.materialSpec} onChange={(e) => handlePartChange(index, "materialSpec", e.target.value)} /></td>
                      <td className="p-2">
                        <select className="w-[150px] border rounded px-2 py-1" value={part.processFamily} onChange={(e) => handlePartChange(index, "processFamily", e.target.value)}>
                          {["","CNC","COMPOSITE","ASSEMBLY","TUBE","TOOLING","OTHER"].map((v) => <option key={v} value={v}>{v || "Select"}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select className="w-[130px] border rounded px-2 py-1" value={part.makeBuyType} onChange={(e) => handlePartChange(index, "makeBuyType", e.target.value)}>
                          {["","MAKE","BUY","HYBRID"].map((v) => <option key={v} value={v}>{v || "Select"}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <select className="w-[160px] border rounded px-2 py-1" value={part.partType} onChange={(e) => handlePartChange(index, "partType", e.target.value)}>
                          {["","PURCHASED","MANUFACTURED","ASSEMBLY","SUB_ASSEMBLY"].map((v) => <option key={v} value={v}>{v || "Select"}</option>)}
                        </select>
                      </td>
                      <td className="p-2"><input className="w-[180px] border rounded px-2 py-1" value={part.notes} onChange={(e) => handlePartChange(index, "notes", e.target.value)} /></td>
                      <td className="p-2"><button className="border rounded px-3 py-1" onClick={() => removePartRow(index)} type="button">Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Step 2: Tooling (extracted component) ───────────────────────── */}
          <RFQBuilderStep2Tooling
            toolingRows={toolingRows} toolingMessage={toolingMessage}
            onAddToolingRow={addToolingRow} onUpdateToolingRow={updateToolingRow}
            onSaveToolingRow={saveToolingRow} onDeleteToolingRow={deleteToolingRow}
          />

          {/* ── Step 3: BOM Builder (extracted component) ────────────────────── */}
          <RFQBuilderStep3Bom
            parts={parts} selectedBomPartId={selectedBomPartId}
            setSelectedBomPartId={setSelectedBomPartId} filteredBomLines={filteredBomLines}
            bomMessage={bomMessage} bomSummary={bomSummary} bomExtendedTotal={bomExtendedTotal}
            onAddBomLine={addBomLine} onUpdateBomLine={updateBomLine}
            onSaveBomLine={saveBomLine} onDeleteBomLine={deleteBomLine}
          />

          {/* ── Step 4: Process Time ─────────────────────────────────────────── */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Step 4 — Process Time</h2>
                <p className="text-sm text-muted-foreground">Add labor and processing time by department for the selected quoted part.</p>
              </div>
              <button className="border rounded px-4 py-2" onClick={addProcessRow} type="button">+ Add Process Row</button>
            </div>
            {processMessage && <div className="rounded border px-3 py-2 text-sm">{processMessage}</div>}
            <div className="flex items-end gap-4">
              <div className="min-w-[320px]">
                <label className="block text-sm mb-1">Selected RFQ Part</label>
                <select className="w-full border rounded px-3 py-2" value={selectedProcessPartId} onChange={(e) => setSelectedProcessPartId(e.target.value)}>
                  <option value="">Select a part</option>
                  {parts.filter((p) => p.id).map((part) => (
                    <option key={part.id} value={part.id}>{part.lineNumber} - {part.partNumber} ({part.quantity})</option>
                  ))}
                </select>
              </div>
              {selectedProcessPart && <div className="text-sm text-muted-foreground">Labor cost will be calculated for <strong>{selectedProcessPart.partNumber}</strong></div>}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 overflow-x-auto">
                <table className="w-full border-collapse min-w-[1350px]">
                  <thead>
                    <tr className="border-b">
                      {["Department","Source","Setup Hours","Hours / Part","Hourly Rate","Setup Cost","Recurring / Part","Notes","Actions"].map((h) => (
                        <th key={h} className="text-left p-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedProcessPartId ? (
                      <tr><td colSpan={9} className="p-4 text-sm text-muted-foreground">Select an RFQ part to begin adding process rows.</td></tr>
                    ) : filteredProcessRows.length === 0 ? (
                      <tr><td colSpan={9} className="p-4 text-sm text-muted-foreground">No process rows yet for this part.</td></tr>
                    ) : (
                      filteredProcessRows.map((row, index) => {
                        const setupCost = Number(row.setupHours || 0) * Number(row.hourlyRate || 0);
                        const recurringPerPart = Number(row.hoursPerPart || 0) * Number(row.hourlyRate || 0);
                        return (
                          <tr key={`${row.id ?? "new"}-${index}`} className="border-b align-top">
                            <td className="p-2">
                              <select className="w-[200px] border rounded px-2 py-1" value={row.departmentName} onChange={(e) => updateProcessRow(index, "departmentName", e.target.value)}>
                                {defaultDepartmentOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                            </td>
                            <td className="p-2">
                              <select className="w-[160px] border rounded px-2 py-1" value={row.sourceType} onChange={(e) => updateProcessRow(index, "sourceType", e.target.value)}>
                                <option value="MANUAL">Manual</option>
                                <option value="ROUTING_TEMPLATE">Routing Template</option>
                                <option value="HISTORICAL">Historical</option>
                              </select>
                            </td>
                            <td className="p-2"><input type="number" step="0.01" min={0} className="w-[110px] border rounded px-2 py-1" value={row.setupHours} onChange={(e) => updateProcessRow(index, "setupHours", Number(e.target.value))} /></td>
                            <td className="p-2"><input type="number" step="0.0001" min={0} className="w-[110px] border rounded px-2 py-1" value={row.hoursPerPart} onChange={(e) => updateProcessRow(index, "hoursPerPart", Number(e.target.value))} /></td>
                            <td className="p-2"><input type="number" step="0.01" min={0} className="w-[110px] border rounded px-2 py-1" value={row.hourlyRate} onChange={(e) => updateProcessRow(index, "hourlyRate", Number(e.target.value))} /></td>
                            <td className="p-2">${setupCost.toFixed(2)}</td>
                            <td className="p-2">${recurringPerPart.toFixed(4)}</td>
                            <td className="p-2"><input className="w-[200px] border rounded px-2 py-1" value={row.notes ?? ""} onChange={(e) => updateProcessRow(index, "notes", e.target.value)} /></td>
                            <td className="p-2">
                              <div className="flex gap-2">
                                <button className="border rounded px-3 py-1" onClick={() => saveProcessRow(row)} type="button">Save</button>
                                <button className="border rounded px-3 py-1" onClick={() => deleteProcessRow(index, row)} type="button">Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border rounded-lg p-4 h-fit">
                <h3 className="font-semibold mb-3">Labor Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Setup Cost</span><span>${processSummary.setupCost.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Recurring / Part</span><span>${processSummary.recurringCostPerPart.toFixed(4)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-semibold"><span>Labor / Part</span><span>${processSummary.totalPerPart.toFixed(4)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total @ Qty</span><span>${processExtendedTotal.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 5: Overhead + Cap X ─────────────────────────────────────── */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Step 5 — Overhead + Cap X</h2>
                <p className="text-sm text-muted-foreground">Add burden, compliance, admin, documentation, and capital-cost adjustments.</p>
              </div>
              <button className="border rounded px-4 py-2" onClick={addAdjustmentRow} type="button">+ Add Adjustment</button>
            </div>
            {adjustmentMessage && <div className="rounded border px-3 py-2 text-sm">{adjustmentMessage}</div>}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm mb-1">Scope</label>
                <select className="border rounded px-3 py-2" value={adjustmentScopeFilter} onChange={(e) => setAdjustmentScopeFilter(e.target.value as "RFQ" | "PART")}>
                  <option value="RFQ">RFQ-Level</option>
                  <option value="PART">Part-Level</option>
                </select>
              </div>
              {adjustmentScopeFilter === "PART" && (
                <div className="min-w-[320px]">
                  <label className="block text-sm mb-1">Selected RFQ Part</label>
                  <select className="w-full border rounded px-3 py-2" value={selectedAdjustmentPartId} onChange={(e) => setSelectedAdjustmentPartId(e.target.value)}>
                    <option value="">Select a part</option>
                    {parts.filter((p) => p.id).map((part) => (
                      <option key={part.id} value={part.id}>{part.lineNumber} - {part.partNumber} ({part.quantity})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 overflow-x-auto">
                <table className="w-full border-collapse min-w-[1450px]">
                  <thead>
                    <tr className="border-b">
                      {["Type","Description","Pricing Mode","Amount ($)","Percent (%)","Computed","In Customer Price","Notes","Actions"].map((h) => (
                        <th key={h} className="text-left p-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdjustmentRows.length === 0 ? (
                      <tr><td colSpan={9} className="p-4 text-sm text-muted-foreground">No adjustments yet. Click "+ Add Adjustment" to begin.</td></tr>
                    ) : (
                      filteredAdjustmentRows.map((row, index) => {
                        let computed = 0;
                        if (row.pricingMode === "FLAT") computed = Number(row.amount || 0);
                        else if (row.pricingMode === "PER_PART") computed = Number(row.amount || 0) * selectedAdjustmentQty;
                        else if (row.pricingMode === "PERCENT_OF_MATERIAL") computed = bomSummary.totalPerPart * selectedAdjustmentQty * (Number(row.percentValue || 0) / 100);
                        else if (row.pricingMode === "PERCENT_OF_LABOR") computed = processExtendedTotal * (Number(row.percentValue || 0) / 100);
                        else if (row.pricingMode === "INTERNAL_ONLY") computed = Number(row.amount || 0);
                        return (
                          <tr key={`${row.id ?? "new"}-${index}`} className="border-b align-top">
                            <td className="p-2"><select className="w-[150px] border rounded px-2 py-1" value={row.adjustmentType} onChange={(e) => updateAdjustmentRow(index, "adjustmentType", e.target.value)}>{adjustmentTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                            <td className="p-2"><input className="w-[200px] border rounded px-2 py-1" value={row.description} onChange={(e) => updateAdjustmentRow(index, "description", e.target.value)} /></td>
                            <td className="p-2"><select className="w-[180px] border rounded px-2 py-1" value={row.pricingMode} onChange={(e) => updateAdjustmentRow(index, "pricingMode", e.target.value)}>{pricingModeOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                            <td className="p-2"><input type="number" step="0.01" min={0} className="w-[120px] border rounded px-2 py-1" value={row.amount} onChange={(e) => updateAdjustmentRow(index, "amount", Number(e.target.value))} /></td>
                            <td className="p-2"><input type="number" step="0.01" min={0} className="w-[110px] border rounded px-2 py-1" value={row.percentValue ?? ""} placeholder={row.pricingMode.startsWith("PERCENT") ? "e.g. 10" : "—"} disabled={!row.pricingMode.startsWith("PERCENT")} onChange={(e) => updateAdjustmentRow(index, "percentValue", e.target.value ? Number(e.target.value) : null)} /></td>
                            <td className="p-2">${computed.toFixed(2)}</td>
                            <td className="p-2 text-center"><input type="checkbox" checked={!!row.includeInCustomerPrice} onChange={(e) => updateAdjustmentRow(index, "includeInCustomerPrice", e.target.checked)} /></td>
                            <td className="p-2"><input className="w-[180px] border rounded px-2 py-1" value={row.notes ?? ""} onChange={(e) => updateAdjustmentRow(index, "notes", e.target.value)} /></td>
                            <td className="p-2">
                              <div className="flex gap-2">
                                <button className="border rounded px-3 py-1" onClick={() => saveAdjustmentRow(row)} type="button">Save</button>
                                <button className="border rounded px-3 py-1" onClick={() => deleteAdjustmentRow(index, row)} type="button">Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border rounded-lg p-4 h-fit">
                <h3 className="font-semibold mb-3">Overhead Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Overhead</span><span>${adjustmentSummary.overhead.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Compliance</span><span>${adjustmentSummary.compliance.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Documentation</span><span>${adjustmentSummary.documentation.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Admin</span><span>${adjustmentSummary.admin.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Cap X</span><span>${adjustmentSummary.capex.toFixed(2)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-semibold"><span>Total</span><span>${adjustmentSummary.total.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Customer Facing</span><span>${adjustmentSummary.customerFacing.toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Internal Only</span><span>${adjustmentSummary.internalOnly.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 6: Shipping ─────────────────────────────────────────────── */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Step 6 — Shipping</h2>
                <p className="text-sm text-muted-foreground">Add shipping estimates at the RFQ or part level.</p>
              </div>
              <button className="border rounded px-4 py-2" onClick={addShippingRow} type="button">+ Add Shipping</button>
            </div>
            {shippingMessage && <div className="rounded border px-3 py-2 text-sm">{shippingMessage}</div>}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm mb-1">Scope</label>
                <select className="border rounded px-3 py-2" value={shippingScopeFilter} onChange={(e) => setShippingScopeFilter(e.target.value as "RFQ" | "PART")}>
                  <option value="RFQ">RFQ-Level</option>
                  <option value="PART">Part-Level</option>
                </select>
              </div>
              {shippingScopeFilter === "PART" && (
                <div className="min-w-[320px]">
                  <label className="block text-sm mb-1">Selected RFQ Part</label>
                  <select className="w-full border rounded px-3 py-2" value={selectedShippingPartId} onChange={(e) => setSelectedShippingPartId(e.target.value)}>
                    <option value="">Select a part</option>
                    {parts.filter((p) => p.id).map((part) => (
                      <option key={part.id} value={part.id}>{part.lineNumber} - {part.partNumber} ({part.quantity})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 overflow-x-auto">
                <table className="w-full border-collapse min-w-[1400px]">
                  <thead>
                    <tr className="border-b">
                      {["Mode","Description","Method","Amount","Allocation","Include in Price","Notes","Actions"].map((h) => (
                        <th key={h} className="text-left p-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShippingRows.length === 0 ? (
                      <tr><td colSpan={8} className="p-4 text-sm text-muted-foreground">No shipping rows yet for this scope.</td></tr>
                    ) : (
                      filteredShippingRows.map((row, index) => (
                        <tr key={`${row.id ?? "new"}-${index}`} className="border-b align-top">
                          <td className="p-2"><select className="w-[140px] border rounded px-2 py-1" value={row.shippingMode} onChange={(e) => updateShippingRow(index, "shippingMode", e.target.value)}>{shippingModeOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                          <td className="p-2"><input className="w-[220px] border rounded px-2 py-1" value={row.description ?? ""} onChange={(e) => updateShippingRow(index, "description", e.target.value)} /></td>
                          <td className="p-2"><input className="w-[160px] border rounded px-2 py-1" value={row.method ?? ""} onChange={(e) => updateShippingRow(index, "method", e.target.value)} /></td>
                          <td className="p-2"><input type="number" step="0.01" min={0} className="w-[120px] border rounded px-2 py-1" value={row.amount} onChange={(e) => updateShippingRow(index, "amount", Number(e.target.value))} /></td>
                          <td className="p-2"><select className="w-[140px] border rounded px-2 py-1" value={row.allocationMethod ?? "EVEN"} onChange={(e) => updateShippingRow(index, "allocationMethod", e.target.value)}>{shippingAllocationOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                          <td className="p-2 text-center"><input type="checkbox" checked={!!row.includeInCustomerPrice} onChange={(e) => updateShippingRow(index, "includeInCustomerPrice", e.target.checked)} /></td>
                          <td className="p-2"><input className="w-[220px] border rounded px-2 py-1" value={row.notes ?? ""} onChange={(e) => updateShippingRow(index, "notes", e.target.value)} /></td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <button className="border rounded px-3 py-1" onClick={() => saveShippingRow(row)} type="button">Save</button>
                              <button className="border rounded px-3 py-1" onClick={() => deleteShippingRow(index, row)} type="button">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="border rounded-lg p-4 h-fit">
                <h3 className="font-semibold mb-3">Shipping Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Per Part</span><span>${shippingSummary.perPart.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Per PO</span><span>${shippingSummary.perPo.toFixed(2)}</span></div>
                  <div className="border-t pt-2 flex justify-between"><span>Customer-Facing</span><span>${shippingSummary.customerFacing.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Internal Only</span><span>${shippingSummary.internalOnly.toFixed(2)}</span></div>
                  <div className="border-t pt-2 flex justify-between font-semibold"><span>Total Shipping</span><span>${shippingSummary.total.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 7: Quantity Break Pricing ──────────────────────────────── */}
          <div className="border rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Step 7 — Quantity Break Pricing</h2>
                <p className="text-sm text-muted-foreground">Define quantity tiers and calculate price per part and total value.</p>
              </div>
              <button className="border rounded px-4 py-2" onClick={addQuantityBreakRow} type="button">+ Add Quantity Break</button>
            </div>

            {quantityBreakMessage && <div className="rounded border px-3 py-2 text-sm">{quantityBreakMessage}</div>}

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm mb-1">Margin %</label>
                <input type="number" min={0} step="0.01" className="border rounded px-3 py-2 w-[140px]"
                  value={marginPercent} onChange={(e) => setMarginPercent(Number(e.target.value))} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b">
                    {["Label","Quantity","Sort","Actions"].map((h) => <th key={h} className="text-left p-2">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {quantityBreakRows.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-sm text-muted-foreground">No quantity breaks yet.</td></tr>
                  ) : (
                    quantityBreakRows.map((row, index) => (
                      <tr key={`${row.id ?? "new"}-${index}`} className="border-b">
                        <td className="p-2">
                          <input className="w-[180px] border rounded px-2 py-1" value={row.label}
                            onChange={(e) => updateQuantityBreakRow(index, "label", e.target.value)} />
                        </td>
                        <td className="p-2">
                          <input type="number" min={1} className="w-[120px] border rounded px-2 py-1" value={row.quantity}
                            onChange={(e) => updateQuantityBreakRow(index, "quantity", Number(e.target.value))} />
                        </td>
                        <td className="p-2">
                          <input type="number" min={0} className="w-[100px] border rounded px-2 py-1" value={row.sortOrder}
                            onChange={(e) => updateQuantityBreakRow(index, "sortOrder", Number(e.target.value))} />
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <button className="border rounded px-3 py-1" onClick={() => saveQuantityBreakRow(row)} type="button">Save</button>
                            <button className="border rounded px-3 py-1" onClick={() => deleteQuantityBreakRow(index, row)} type="button">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-6">
              {pricingMatrix.length === 0 ? (
                <div className="rounded border p-4 text-sm text-muted-foreground">Add at least one quantity break to calculate pricing.</div>
              ) : (
                pricingMatrix.map((breakRow) => (
                  <div key={`${breakRow.label}-${breakRow.quantity}`} className="border rounded-lg p-4 space-y-3">
                    <h3 className="font-semibold">{breakRow.label} ({breakRow.quantity} pcs)</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse min-w-[1100px]">
                        <thead>
                          <tr className="border-b">
                            {["Part","Material / Part","Labor / Part","Tooling / Part","Adjustments / Part","Shipping / Part","Cost / Part","Sell / Part","Extended"].map((h) => (
                              <th key={h} className="text-left p-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {breakRow.rows.length === 0 ? (
                            <tr><td colSpan={9} className="p-4 text-sm text-muted-foreground">No parts with saved IDs yet.</td></tr>
                          ) : (
                            breakRow.rows.map((row) => (
                              <tr key={row.partId} className="border-b">
                                <td className="p-2">{row.partNumber}</td>
                                <td className="p-2">${row.materialPerPart.toFixed(4)}</td>
                                <td className="p-2">${row.laborPerPart.toFixed(4)}</td>
                                <td className="p-2">${row.toolingPerPart.toFixed(4)}</td>
                                <td className="p-2">${row.adjustmentPerPart.toFixed(4)}</td>
                                <td className="p-2">${row.shippingPerPart.toFixed(4)}</td>
                                <td className="p-2 font-medium">${row.totalCostPerPart.toFixed(4)}</td>
                                <td className="p-2 font-medium">${row.sellPricePerPart.toFixed(4)}</td>
                                <td className="p-2 font-semibold">${row.extendedPrice.toFixed(2)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap gap-6 pt-2 border-t text-sm">
                      <div>
                        <span className="text-muted-foreground">Total RFQ Extended: </span>
                        <span className="font-semibold">${breakRow.totalExtended.toFixed(2)}</span>
                      </div>
                      {breakRow.separateTooling > 0 && (
                        <div>
                          <span className="text-muted-foreground">Separate Tooling (not in unit price): </span>
                          <span className="font-semibold">${breakRow.separateTooling.toFixed(2)}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Grand Total incl. Tooling: </span>
                        <span className="font-semibold">${(breakRow.totalExtended + breakRow.separateTooling).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="border rounded-lg p-5 space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Step 8 - Controlled Estimate Release</h2>
                <p className="text-sm text-muted-foreground">Capture the controlled version, assumptions, approvals, risk score, and mitigation status before quote handoff.</p>
              </div>
              <div className={`rounded border px-4 py-3 text-sm ${releaseReadiness?.readyForQuoteRelease ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <p className="font-semibold">{releaseReadiness?.readyForQuoteRelease ? "Ready for quote release" : "Release controls incomplete"}</p>
                <p className="mt-1">Required roles: {(releaseReadiness?.requiredRoles ?? ["ESTIMATOR", "ENGINEERING", "FINANCE"]).join(", ")}</p>
                {releaseReadiness?.missingRoles?.length ? <p>Missing: {releaseReadiness.missingRoles.join(", ")}</p> : null}
                {releaseReadiness?.executiveRequired ? <p>Executive required: {releaseReadiness.executiveTriggers.join(", ")}</p> : null}
                <p>Risk: {releaseReadiness?.risk.status ?? "No assessment"} / {releaseReadiness?.risk.overallLevel ?? "UNKNOWN"} ({releaseReadiness?.risk.blockingRiskCount ?? 0} blockers)</p>
              </div>
            </div>

            {controlMessage && <div className="rounded border px-3 py-2 text-sm">{controlMessage}</div>}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Estimate Versions</h3>
                    <p className="text-xs text-muted-foreground">Historical pricing visibility and margin snapshots.</p>
                  </div>
                  <button type="button" className="border rounded px-3 py-2 text-sm" onClick={createEstimateVersion} disabled={!rfqId}>
                    Capture Version
                  </button>
                </div>
                <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Change summary" value={versionSummary} onChange={(e) => setVersionSummary(e.target.value)} />
                <div className="space-y-2 max-h-[180px] overflow-auto">
                  {(versionsQuery.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No controlled estimate versions yet.</p>
                  ) : (
                    (versionsQuery.data ?? []).map((version) => (
                      <div key={version.id} className="rounded border px-3 py-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="font-medium">Version {version.version_number}</span>
                          <span className={version.superseded_by ? "text-muted-foreground" : "text-green-700"}>{version.superseded_by ? "Superseded" : "Current"}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{version.change_summary || "No change summary"} - {new Date(version.created_at).toLocaleString()}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded border p-4 space-y-3">
                <h3 className="font-semibold">Assumption Review</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select className="border rounded px-3 py-2 text-sm" value={assumptionDraft.assumptionType} onChange={(e) => setAssumptionDraft((prev) => ({ ...prev, assumptionType: e.target.value }))}>
                    {["LABOR", "SCRAP", "MATERIAL_YIELD", "TOOLING_LIFE", "SETUP_TIME"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <input className="border rounded px-3 py-2 text-sm" placeholder="Value" value={assumptionDraft.numericValue} onChange={(e) => setAssumptionDraft((prev) => ({ ...prev, numericValue: e.target.value }))} />
                  <input className="border rounded px-3 py-2 text-sm" placeholder="UOM" value={assumptionDraft.uom} onChange={(e) => setAssumptionDraft((prev) => ({ ...prev, uom: e.target.value }))} />
                </div>
                <textarea className="w-full border rounded px-3 py-2 text-sm min-h-[70px]" placeholder="Assumption text" value={assumptionDraft.assumptionText} onChange={(e) => setAssumptionDraft((prev) => ({ ...prev, assumptionText: e.target.value }))} />
                <div className="flex gap-2">
                  <select className="border rounded px-3 py-2 text-sm" value={assumptionDraft.confidenceLevel} onChange={(e) => setAssumptionDraft((prev) => ({ ...prev, confidenceLevel: e.target.value }))}>
                    {["LOW", "MEDIUM", "HIGH"].map((level) => <option key={level} value={level}>{level}</option>)}
                  </select>
                  <input className="flex-1 border rounded px-3 py-2 text-sm" placeholder="Source reference" value={assumptionDraft.sourceReference} onChange={(e) => setAssumptionDraft((prev) => ({ ...prev, sourceReference: e.target.value }))} />
                  <button type="button" className="border rounded px-3 py-2 text-sm" onClick={addAssumption}>Add</button>
                </div>
                <div className="space-y-2 max-h-[160px] overflow-auto">
                  {(assumptionsQuery.data ?? []).map((assumption) => (
                    <div key={assumption.id} className="rounded border px-3 py-2 text-sm">
                      <p className="font-medium">{assumption.assumption_type} - {assumption.confidence_level}</p>
                      <p>{assumption.assumption_text}</p>
                      {(assumption.numeric_value || assumption.uom) && <p className="text-xs text-muted-foreground">{assumption.numeric_value ?? ""} {assumption.uom ?? ""}</p>}
                    </div>
                  ))}
                  {(assumptionsQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No structured assumptions yet.</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded border p-4 space-y-3">
                <h3 className="font-semibold">Role Approvals</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select className="border rounded px-3 py-2 text-sm" value={approvalDraft.approvalRole} onChange={(e) => setApprovalDraft((prev) => ({ ...prev, approvalRole: e.target.value }))}>
                    {["ESTIMATOR", "ENGINEERING", "FINANCE", "EXECUTIVE"].map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <select className="border rounded px-3 py-2 text-sm" value={approvalDraft.approvalStatus} onChange={(e) => setApprovalDraft((prev) => ({ ...prev, approvalStatus: e.target.value }))}>
                    {["PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <input className="border rounded px-3 py-2 text-sm" placeholder="Signer display name" value={approvalDraft.signerDisplayName} onChange={(e) => setApprovalDraft((prev) => ({ ...prev, signerDisplayName: e.target.value }))} />
                  <input className="border rounded px-3 py-2 text-sm" placeholder="Digital signature / initials" value={approvalDraft.digitalSignature} onChange={(e) => setApprovalDraft((prev) => ({ ...prev, digitalSignature: e.target.value }))} />
                </div>
                <textarea className="w-full border rounded px-3 py-2 text-sm min-h-[64px]" placeholder="Approval comments" value={approvalDraft.approvalComments} onChange={(e) => setApprovalDraft((prev) => ({ ...prev, approvalComments: e.target.value }))} />
                <button type="button" className="border rounded px-3 py-2 text-sm" onClick={saveApproval}>Save Approval</button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(approvalsQuery.data ?? []).map((approval) => (
                    <div key={approval.id} className="rounded border px-3 py-2 text-sm">
                      <p className="font-medium">{approval.approval_role}: {approval.approval_status}</p>
                      <p className="text-xs text-muted-foreground">{approval.signer_display_name || "No signer"} {approval.signed_at ? `- ${new Date(approval.signed_at).toLocaleString()}` : ""}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Risk Scoring + Mitigation</h3>
                    <p className="text-xs text-muted-foreground">Severity x probability drives approval routing.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => updateRiskAssessmentStatus("IN_REVIEW")}>Review</button>
                    <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => updateRiskAssessmentStatus("APPROVED")}>Approve Risk</button>
                  </div>
                </div>
                <div className="rounded border px-3 py-2 text-sm">
                  <p className="font-medium">Current: {latestRiskAssessment?.status ?? "Not started"} / {latestRiskAssessment?.overall_level ?? "UNKNOWN"} / Score {latestRiskAssessment?.overall_score ?? 0}</p>
                  <p className="text-xs text-muted-foreground">Routing: {(latestRiskAssessment?.approval_routing ?? []).join(", ") || "None"}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select className="border rounded px-3 py-2 text-sm" value={riskDraft.category} onChange={(e) => setRiskDraft((prev) => ({ ...prev, category: e.target.value }))}>
                    {["TECHNICAL", "SUPPLY_CHAIN", "FINANCIAL", "SCHEDULE", "COMPLIANCE", "QUALITY"].map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <input type="number" min={1} max={5} className="border rounded px-3 py-2 text-sm" value={riskDraft.severity} onChange={(e) => setRiskDraft((prev) => ({ ...prev, severity: Number(e.target.value) }))} />
                  <input type="number" min={1} max={5} className="border rounded px-3 py-2 text-sm" value={riskDraft.probability} onChange={(e) => setRiskDraft((prev) => ({ ...prev, probability: Number(e.target.value) }))} />
                  <label className="flex items-center gap-2 text-sm border rounded px-3 py-2">
                    <input type="checkbox" checked={riskDraft.requiresApproval} onChange={(e) => setRiskDraft((prev) => ({ ...prev, requiresApproval: e.target.checked }))} />
                    Requires approval
                  </label>
                </div>
                <textarea className="w-full border rounded px-3 py-2 text-sm min-h-[64px]" placeholder="Risk description" value={riskDraft.description} onChange={(e) => setRiskDraft((prev) => ({ ...prev, description: e.target.value }))} />
                <div className="flex gap-2">
                  <input className="flex-1 border rounded px-3 py-2 text-sm" placeholder="Risk owner" value={riskDraft.ownerDisplayName} onChange={(e) => setRiskDraft((prev) => ({ ...prev, ownerDisplayName: e.target.value }))} />
                  <button type="button" className="border rounded px-3 py-2 text-sm" onClick={addRiskItem}>Add Risk</button>
                </div>
                <div className="space-y-2 max-h-[240px] overflow-auto">
                  {riskItems.map((item) => (
                    <div key={item.id} className="rounded border px-3 py-2 text-sm space-y-2">
                      <div className="flex justify-between gap-3">
                        <p className="font-medium">{item.category} - Score {item.score} - {item.status}</p>
                        <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => closeRiskItem(item.id)}>Close</button>
                      </div>
                      <p>{item.description}</p>
                      <div className="flex gap-2">
                        <input className="flex-1 border rounded px-2 py-1 text-xs" placeholder="Mitigation action" value={mitigationDraft.actionDescription} onChange={(e) => setMitigationDraft((prev) => ({ ...prev, actionDescription: e.target.value }))} />
                        <button type="button" className="border rounded px-2 py-1 text-xs" onClick={() => addMitigation(item.id)}>Add Mitigation</button>
                      </div>
                    </div>
                  ))}
                  {riskItems.length === 0 && <p className="text-sm text-muted-foreground">No structured risk items yet.</p>}
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 9: Pricing Summary + Quote Handoff ─────────────────────── */}
          <div className="border rounded-lg p-5 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Step 9 - Pricing Summary + Quote Handoff</h2>
                <p className="text-sm text-muted-foreground">Review final pricing, save snapshots, and create a draft quote.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  className="border rounded px-4 py-2 text-sm"
                  onClick={savePricingSnapshots}
                  disabled={!rfqId || !pricingSnapshotRows.length}
                  type="button"
                >
                  Save Pricing Snapshots
                </button>
                <button
                  className="bg-primary text-primary-foreground rounded px-4 py-2 text-sm disabled:opacity-50"
                  onClick={createDraftQuoteFromRfq}
                  disabled={!rfqId || !pricingSnapshotRows.length || isHandingOff || !releaseReadiness?.readyForQuoteRelease}
                  type="button"
                >
                  {isHandingOff ? "Creating…" : "Create Draft Quote"}
                </button>
              </div>
            </div>

            {/* Quote summary table per break */}
            {pricingMatrix.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add quantity breaks in Step 7 to see the pricing summary.</p>
            ) : (
              <div className="space-y-4">
                {pricingMatrix.map((breakRow) => {
                  const grandTotal = breakRow.totalExtended + breakRow.separateTooling;
                  return (
                    <div key={breakRow.id} className="rounded border overflow-hidden">
                      <div className="bg-muted px-4 py-2 flex justify-between items-center">
                        <span className="font-medium text-sm">
                          {breakRow.label || `${breakRow.quantity} pc`} — {breakRow.quantity.toLocaleString()} pcs
                        </span>
                        <span className="text-sm font-semibold">Grand Total: ${grandTotal.toFixed(2)}</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            {["Part", "Sell / Part", "Qty", "Extended"].map((h) => (
                              <th key={h} className="text-left p-2 font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {breakRow.rows.map((row) => (
                            <tr key={row.partId} className="border-t">
                              <td className="p-2">{row.partNumber}</td>
                              <td className="p-2">${row.sellPricePerPart.toFixed(4)}</td>
                              <td className="p-2">{breakRow.quantity.toLocaleString()}</td>
                              <td className="p-2 font-medium">${row.extendedPrice.toFixed(2)}</td>
                            </tr>
                          ))}
                          {breakRow.rows.length === 0 && (
                            <tr><td colSpan={4} className="p-3 text-muted-foreground">No costed parts yet.</td></tr>
                          )}
                        </tbody>
                        <tfoot className="border-t bg-muted/30">
                          <tr>
                            <td colSpan={3} className="p-2 text-right text-muted-foreground">Parts subtotal</td>
                            <td className="p-2 font-semibold">${breakRow.totalExtended.toFixed(2)}</td>
                          </tr>
                          {breakRow.separateTooling > 0 && (
                            <tr>
                              <td colSpan={3} className="p-2 text-right text-muted-foreground">Separate tooling</td>
                              <td className="p-2 font-semibold">${breakRow.separateTooling.toFixed(2)}</td>
                            </tr>
                          )}
                          <tr>
                            <td colSpan={3} className="p-2 text-right font-medium">Quote total</td>
                            <td className="p-2 font-bold">${grandTotal.toFixed(2)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quote notes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded border p-3 space-y-1">
                <p className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Assumptions</p>
                <p>{header.assumptions || "—"}</p>
              </div>
              <div className="rounded border p-3 space-y-1">
                <p className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Quote Validity</p>
                <p>30 days from creation</p>
              </div>
              <div className="rounded border p-3 space-y-1">
                <p className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Lead Time</p>
                <p className="text-muted-foreground italic">TBD</p>
              </div>
            </div>

            {/* Snapshot save confirmation */}
            {pricingSnapshotMessage && (
              <p className="text-sm text-green-700 dark:text-green-400">{pricingSnapshotMessage}</p>
            )}

            {/* Quote handoff error */}
            {quoteHandoffError && (
              <p className="text-sm text-destructive">{quoteHandoffError}</p>
            )}

            {/* Quote handoff success banner */}
            {createdQuoteId && createdQuoteNumber && (
              <div className="flex items-center justify-between gap-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                    Draft quote {createdQuoteNumber} created successfully.
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                    Pricing snapshots saved. The quote is ready to review and submit.
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 bg-green-700 hover:bg-green-800 text-white text-sm rounded px-4 py-2 transition-colors"
                  onClick={() => setLocation(`/p2-quote-form?id=${createdQuoteId}`)}
                >
                  Open Draft Quote →
                </button>
              </div>
            )}
          </div>

          {/* ── Bottom action row ───────────────────────────────────────────── */}
          <div className="flex justify-end gap-2">
            <button className="border rounded px-4 py-2" onClick={() => setLocation("/estimating")} type="button">Cancel</button>
            <button className="bg-primary text-primary-foreground rounded px-4 py-2 disabled:opacity-50" onClick={onSaveDraft} disabled={isSaving} type="button">
              {isSaving ? "Saving..." : "Save Draft"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

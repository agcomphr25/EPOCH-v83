import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Plus,
  Trash2,
  Save,
  Send,
  AlertCircle,
  ChevronLeft,
  Loader2,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Link } from "wouter";

// ---------------------------------------------------------------------------
// Status badge map
// ---------------------------------------------------------------------------
const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  NEEDS_REVIEW: { label: "Needs Review", variant: "destructive" },
  CONFIRMED: { label: "Ready to Submit", variant: "default" },
  POSTED: { label: "Submitted", variant: "outline" },
  VOIDED: { label: "Voided", variant: "destructive" },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Segment = {
  id: string;
  startTime: string;
  endTime: string;
  chargeCodeId: number | null;
  indirectCodeId: number | null;
  notes: string;
};

type ConversationalSegment = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  laborCategory: "DIRECT" | "INDIRECT" | "AMBIGUOUS";
  chargeCodeId: number | null;
  indirectCodeId: number | null;
  indirectCodeLabel: string | null;
  resolvedTravelerId: string | null;
  resolvedTravelerNumber: string | null;
  description: string;
  confidence: number;
  needsReview: boolean;
  explanation: string | null;
};

type ChargeCode = {
  id: number;
  code: string;
  description: string | null;
  type: string;
  active: boolean;
};

type IndirectCode = {
  id: number;
  code: string;
  label: string;
  description: string | null;
  isActive: boolean;
  chargeCodeId: number;
};

type ValidationErrors = { global: string[]; segments: Record<string, string[]> };

type LaborEntryDraft = {
  id: number;
  entryDate: string;
  status: string;
  source: string;
  totalHours: string | null;
  parsedSegmentsJson: any[];
  rawInputText: string | null;
  validationErrorsJson: ValidationErrors | null;
};

type ParseResult = {
  draft: LaborEntryDraft;
  segments: ConversationalSegment[];
  validationErrors: Array<{ segmentIndex: number; segmentDescription: string; reason: string }>;
  overallConfidence: number;
  hasNeedsReview: boolean;
  totalHours: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function durationHours(seg: Segment): number {
  const diff = toMinutes(seg.endTime) - toMinutes(seg.startTime);
  return Math.max(0, diff / 60);
}

function fmtHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptySegment(): Segment {
  return { id: genId(), startTime: "09:00", endTime: "10:00", chargeCodeId: null, indirectCodeId: null, notes: "" };
}

function confidenceBadge(confidence: number): { label: string; colorClass: string; Icon: React.ElementType } {
  if (confidence >= 0.85) return { label: `${Math.round(confidence * 100)}%`, colorClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", Icon: CheckCircle2 };
  if (confidence >= 0.70) return { label: `${Math.round(confidence * 100)}%`, colorClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", Icon: AlertTriangle };
  return { label: `${Math.round(confidence * 100)}%`, colorClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", Icon: XCircle };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function SalariedTimeEntryPage() {
  const { portalId, draftId } = useParams<{ portalId: string; draftId?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(draftId);

  // Mode: "manual" or "conversational"
  const [mode, setMode] = useState<"manual" | "conversational">("manual");

  // ── Manual entry state ────────────────────────────────────────────────────
  const [entryDate, setEntryDate] = useState(todayStr());
  const [segments, setSegments] = useState<Segment[]>([emptySegment()]);
  const [rawInputText, setRawInputText] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors | null>(null);

  // ── Conversational entry state ────────────────────────────────────────────
  const [narrative, setNarrative] = useState("");
  const [refDate, setRefDate] = useState(todayStr());
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  // Editable conversational segments (user may adjust codes)
  const [convSegments, setConvSegments] = useState<ConversationalSegment[]>([]);

  // ---------------------------------------------------------------------------
  // Query keys
  // ---------------------------------------------------------------------------
  const chargeCodesKey = `/api/timekeeping/labor-entry-drafts/portal/${portalId}/charge-codes`;
  const indirectCodesKey = `/api/timekeeping/labor-entry-drafts/portal/${portalId}/indirect-codes`;
  const draftKey = `/api/timekeeping/labor-entry-drafts/portal/${portalId}/${draftId}`;

  const { data: featureFlag, isLoading: flagLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/timekeeping/labor-entry-drafts/feature-enabled'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: chargeCodes = [], isLoading: ccLoading } = useQuery<ChargeCode[]>({
    queryKey: [chargeCodesKey],
    enabled: featureFlag?.enabled === true,
  });

  const { data: indirectCodes = [], isLoading: icLoading } = useQuery<IndirectCode[]>({
    queryKey: [indirectCodesKey],
    enabled: featureFlag?.enabled === true,
  });

  const { data: existingDraft, isLoading: draftLoading } = useQuery<LaborEntryDraft>({
    queryKey: [draftKey],
    enabled: isEdit && featureFlag?.enabled === true,
  });

  // Populate state when editing an existing draft
  useEffect(() => {
    if (existingDraft) {
      setEntryDate(existingDraft.entryDate);
      setRawInputText(existingDraft.rawInputText ?? "");
      setValidationErrors(existingDraft.validationErrorsJson ?? null);

      if (existingDraft.source === "CONVERSATIONAL") {
        setMode("conversational");
        const segs = (existingDraft.parsedSegmentsJson ?? []) as ConversationalSegment[];
        setConvSegments(segs);
        setRefDate(existingDraft.entryDate);
        setNarrative(existingDraft.rawInputText ?? "");
      } else {
        setMode("manual");
        const segs = (existingDraft.parsedSegmentsJson ?? []).map((s: any) => ({
          id: s.id ?? genId(),
          startTime: s.startTime ?? "09:00",
          endTime: s.endTime ?? "10:00",
          chargeCodeId: s.chargeCodeId ?? null,
          indirectCodeId: s.indirectCodeId ?? null,
          notes: s.notes ?? "",
        }));
        setSegments(segs.length > 0 ? segs : [emptySegment()]);
      }
    }
  }, [existingDraft]);

  // Sync convSegments when parseResult arrives
  useEffect(() => {
    if (parseResult) {
      setConvSegments(parseResult.segments);
    }
  }, [parseResult]);

  const totalHours = segments.reduce((sum, s) => sum + durationHours(s), 0);
  const convTotalHours = convSegments.reduce((sum, s) => sum + s.durationHours, 0);

  // ---------------------------------------------------------------------------
  // Manual entry actions
  // ---------------------------------------------------------------------------
  const addSegment = useCallback(() => {
    setSegments((prev) => {
      const last = prev[prev.length - 1];
      const newStart = last ? last.endTime : "09:00";
      const [h, m] = newStart.split(":").map(Number);
      const newEndMins = (h ?? 9) * 60 + (m ?? 0) + 60;
      const newEnd = `${String(Math.floor(newEndMins / 60) % 24).padStart(2, "0")}:${String(newEndMins % 60).padStart(2, "0")}`;
      return [...prev, { id: genId(), startTime: newStart, endTime: newEnd, chargeCodeId: null, indirectCodeId: null, notes: "" }];
    });
  }, []);

  const removeSegment = useCallback((id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateSegment = useCallback(<K extends keyof Segment>(id: string, field: K, value: Segment[K]) => {
    setSegments((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const updated = { ...s, [field]: value };
        if (field === "chargeCodeId" && value) updated.indirectCodeId = null;
        if (field === "indirectCodeId" && value) updated.chargeCodeId = null;
        return updated;
      }),
    );
  }, []);

  const buildPayload = useCallback(() => ({
    entryDate,
    segments,
    rawInputText: rawInputText || null,
  }), [entryDate, segments, rawInputText]);

  function getSegmentCodeValue(seg: Segment): string {
    if (seg.chargeCodeId) return `direct-${seg.chargeCodeId}`;
    if (seg.indirectCodeId) return `indirect-${seg.indirectCodeId}`;
    return "";
  }

  function handleCodeChange(segId: string, value: string) {
    if (!value) {
      setSegments((prev) => prev.map((s) => s.id === segId ? { ...s, chargeCodeId: null, indirectCodeId: null } : s));
      return;
    }
    const [kind, rawId] = value.split("-");
    const numId = Number(rawId);
    setSegments((prev) =>
      prev.map((s) =>
        s.id === segId
          ? { ...s, chargeCodeId: kind === "direct" ? numId : null, indirectCodeId: kind === "indirect" ? numId : null }
          : s,
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Conversational segment editing
  // ---------------------------------------------------------------------------
  function getConvSegmentCodeValue(seg: ConversationalSegment): string {
    if (seg.chargeCodeId) return `direct-${seg.chargeCodeId}`;
    if (seg.indirectCodeId) return `indirect-${seg.indirectCodeId}`;
    return "";
  }

  function handleConvCodeChange(segId: string, value: string) {
    setConvSegments((prev) =>
      prev.map((s) => {
        if (s.id !== segId) return s;
        if (!value) return { ...s, chargeCodeId: null, indirectCodeId: null };
        const [kind, rawId] = value.split("-");
        const numId = Number(rawId);
        const updated = {
          ...s,
          chargeCodeId: kind === "direct" ? numId : null,
          indirectCodeId: kind === "indirect" ? numId : null,
        };
        // Resolve the indirectCodeLabel if selecting an indirect code
        if (kind === "indirect") {
          const ic = indirectCodes.find((c) => c.id === numId);
          updated.indirectCodeLabel = ic?.label ?? null;
        } else {
          updated.indirectCodeLabel = null;
        }
        // If user manually picks a code, clear the needsReview flag for code issues
        if (numId) {
          updated.needsReview = false;
        }
        return updated;
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Parse mutation (conversational)
  // ---------------------------------------------------------------------------
  const parseMutation = useMutation({
    mutationFn: async (): Promise<ParseResult> => {
      return await apiRequest(
        `/api/timekeeping/labor-entry-drafts/portal/${portalId}/conversational`,
        {
          method: "POST",
          body: { narrative, referenceDate: refDate },
        },
      );
    },
    onSuccess: (data) => {
      setParseResult(data);
      queryClient.invalidateQueries({ queryKey: [`/api/timekeeping/labor-entry-drafts/portal/${portalId}`] });
      if (data.hasNeedsReview) {
        toast({
          title: "Parsed with warnings",
          description: "Some segments need your review before confirming.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Parsed successfully", description: "Review the segments and confirm when ready." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Parse failed", description: err?.message ?? "Unable to parse narrative.", variant: "destructive" });
    },
  });

  // ---------------------------------------------------------------------------
  // Conversational confirm mutation
  // ---------------------------------------------------------------------------
  const convConfirmMutation = useMutation({
    mutationFn: async (): Promise<{ status: string; draft: LaborEntryDraft }> => {
      const draftId = parseResult?.draft?.id ?? (existingDraft?.id);
      if (!draftId) throw new Error("No draft to confirm.");

      // PATCH the draft with current (possibly edited) segments first
      await apiRequest(
        `/api/timekeeping/labor-entry-drafts/portal/${portalId}/${draftId}`,
        {
          method: "PATCH",
          body: {
            entryDate: refDate || existingDraft?.entryDate,
            segments: convSegments.map((s) => ({
              id: s.id,
              startTime: s.startTime,
              endTime: s.endTime,
              chargeCodeId: s.chargeCodeId,
              indirectCodeId: s.indirectCodeId,
              notes: s.description || null,
            })),
          },
        },
      );

      // Then confirm
      return await apiRequest(
        `/api/timekeeping/labor-entry-drafts/portal/${portalId}/${draftId}/confirm`,
        { method: "POST", body: {} },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/timekeeping/labor-entry-drafts/portal/${portalId}`] });
      toast({ title: "Confirmed", description: "Your time entry has been confirmed and queued for posting." });
      setLocation(`/employee-portal/${portalId}/drafts`);
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/timekeeping/labor-entry-drafts/portal/${portalId}`] });
      if (err.status === 422 && err.responseData?.status === "NEEDS_REVIEW") {
        const ve: ValidationErrors = err.responseData.validationErrors ?? { global: [], segments: {} };
        setValidationErrors(ve);
        toast({
          title: "Submission blocked",
          description: "Validation errors were found. Please review and correct the highlighted segments.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Confirmation failed", description: err?.message ?? "Unable to confirm.", variant: "destructive" });
    },
  });

  // ---------------------------------------------------------------------------
  // Manual entry mutations
  // ---------------------------------------------------------------------------
  const saveDraftMutation = useMutation({
    mutationFn: async (): Promise<LaborEntryDraft> => {
      if (isEdit && draftId) {
        return await apiRequest(
          `/api/timekeeping/labor-entry-drafts/portal/${portalId}/${draftId}`,
          { method: "PATCH", body: buildPayload() },
        );
      } else {
        return await apiRequest(
          `/api/timekeeping/labor-entry-drafts/portal/${portalId}`,
          { method: "POST", body: buildPayload() },
        );
      }
    },
    onSuccess: (data) => {
      setValidationErrors(null);
      queryClient.invalidateQueries({ queryKey: [`/api/timekeeping/labor-entry-drafts/portal/${portalId}`] });
      if (!isEdit && data.id) {
        toast({ title: "Draft saved", description: "Your time entry has been saved as a draft." });
        setLocation(`/employee-portal/${portalId}/time-entry/${data.id}`);
      } else {
        toast({ title: "Draft updated", description: "Your changes have been saved." });
        queryClient.invalidateQueries({ queryKey: [draftKey] });
      }
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message ?? "Unable to save draft.", variant: "destructive" });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (): Promise<{ status: string; draft: LaborEntryDraft }> => {
      if (isEdit && draftId) {
        return await apiRequest(
          `/api/timekeeping/labor-entry-drafts/portal/${portalId}/${draftId}/confirm`,
          { method: "POST", body: {} },
        );
      }
      const saved: LaborEntryDraft = await apiRequest(
        `/api/timekeeping/labor-entry-drafts/portal/${portalId}`,
        { method: "POST", body: buildPayload() },
      );
      return await apiRequest(
        `/api/timekeeping/labor-entry-drafts/portal/${portalId}/${saved.id}/confirm`,
        { method: "POST", body: {} },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/timekeeping/labor-entry-drafts/portal/${portalId}`] });
      setValidationErrors(null);
      toast({ title: "Submitted", description: "Your time entry has been confirmed and queued for posting." });
      setLocation(`/employee-portal/${portalId}/drafts`);
    },
    onError: (err: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/timekeeping/labor-entry-drafts/portal/${portalId}`] });
      if (err.status === 422 && err.responseData?.status === "NEEDS_REVIEW") {
        const ve: ValidationErrors = err.responseData.validationErrors ?? { global: [], segments: {} };
        setValidationErrors(ve);
        if (isEdit) {
          queryClient.invalidateQueries({ queryKey: [draftKey] });
        } else if (err.responseData.draft?.id) {
          setLocation(`/employee-portal/${portalId}/time-entry/${err.responseData.draft.id}`);
        }
        toast({
          title: "Submission blocked",
          description: "Validation errors were found. Please review and correct the highlighted segments.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Submission failed", description: err?.message ?? "Unable to submit.", variant: "destructive" });
    },
  });

  // ---------------------------------------------------------------------------
  // Loading / feature flag states
  // ---------------------------------------------------------------------------
  const loading = flagLoading || (featureFlag?.enabled && (ccLoading || icLoading || (isEdit && draftLoading)));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!featureFlag?.enabled) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <Link href={`/employee-portal/${portalId}`}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to portal
          </Button>
        </Link>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Feature not available</AlertTitle>
          <AlertDescription>
            Manual time entry for salaried employees is not currently enabled.
            Please contact your administrator for access.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const status = existingDraft?.status ?? "DRAFT";
  const isReadonly = status === "CONFIRMED" || status === "POSTED" || status === "VOIDED";
  const statusBadge = STATUS_BADGE[status] ?? STATUS_BADGE["DRAFT"]!;

  const convDraftId = parseResult?.draft?.id ?? (isEdit && existingDraft?.source === "CONVERSATIONAL" ? Number(draftId) : null);
  const showConvReview = (mode === "conversational") && (convSegments.length > 0);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/employee-portal/${portalId}/drafts`}>
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to drafts
          </Button>
        </Link>
        <div className="flex-1" />
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {isEdit ? "Edit Time Entry" : "New Time Entry"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mode tabs — only shown on new entries or matching source */}
          {(!isEdit || (isEdit && !existingDraft)) && !isReadonly && (
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "manual" | "conversational");
                setParseResult(null);
                setConvSegments([]);
                setValidationErrors(null);
              }}
            >
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                <TabsTrigger value="conversational">
                  <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                  Conversational Entry
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          {/* ── CONVERSATIONAL MODE ─────────────────────────────────────────── */}
          {mode === "conversational" && (
            <div className="space-y-5">
              {/* Input panel */}
              {!isReadonly && !showConvReview && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="ref-date">Date</Label>
                    <Input
                      id="ref-date"
                      type="date"
                      value={refDate}
                      onChange={(e) => setRefDate(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="narrative">Tell EPOCH what you worked on</Label>
                    <Textarea
                      id="narrative"
                      placeholder="Yesterday I spent 2 hours on quoting, 1.5 hours in a production meeting, and 4.5 hours on traveler TR-1042…"
                      value={narrative}
                      onChange={(e) => setNarrative(e.target.value)}
                      maxLength={2000}
                      rows={5}
                      className="resize-none"
                    />
                    <p className="text-xs text-muted-foreground text-right">
                      {narrative.length}/2000
                    </p>
                  </div>
                  <Button
                    onClick={() => parseMutation.mutate()}
                    disabled={parseMutation.isPending || narrative.trim().length === 0}
                    className="w-full"
                  >
                    {parseMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Parsing your narrative…
                      </>
                    ) : (
                      <>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Parse with AI
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Review panel — shown after parse or when editing a CONVERSATIONAL draft */}
              {showConvReview && (
                <div className="space-y-4">
                  {/* Original narrative (DCAA traceability) */}
                  {(parseResult?.draft?.rawInputText || existingDraft?.rawInputText) && (
                    <Alert>
                      <MessageSquare className="h-4 w-4" />
                      <AlertTitle>Original narrative</AlertTitle>
                      <AlertDescription className="text-sm italic mt-1">
                        {parseResult?.draft?.rawInputText ?? existingDraft?.rawInputText}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Overall confidence */}
                  {parseResult?.overallConfidence !== undefined && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Overall confidence:</span>
                      {(() => {
                        const cb = confidenceBadge(parseResult.overallConfidence);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cb.colorClass}`}>
                            <cb.Icon className="h-3 w-3" />
                            {cb.label}
                          </span>
                        );
                      })()}
                      <span className="ml-auto font-medium">
                        Total: {fmtHours(convTotalHours)}
                      </span>
                    </div>
                  )}

                  {/* Validation errors banner */}
                  {validationErrors && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Validation errors</AlertTitle>
                      <AlertDescription>
                        <ul className="list-disc pl-4 space-y-1 mt-1 text-sm">
                          {(validationErrors.global ?? []).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Segment review grid */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Parsed Segments — Review &amp; Confirm</h3>
                    {convSegments.map((seg, idx) => {
                      const cb = confidenceBadge(seg.confidence);
                      const segErrors = validationErrors?.segments?.[`segment_${idx}`] ?? [];
                      return (
                        <div
                          key={seg.id}
                          className={`rounded-lg border p-4 space-y-3 ${
                            seg.needsReview || segErrors.length > 0
                              ? "border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-950/20"
                              : "border-border"
                          }`}
                        >
                          {/* Segment header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-snug">{seg.description}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {seg.laborCategory === "DIRECT" && seg.resolvedTravelerNumber
                                  ? `Direct — Traveler ${seg.resolvedTravelerNumber}`
                                  : seg.laborCategory === "INDIRECT" && seg.indirectCodeLabel
                                    ? `Indirect — ${seg.indirectCodeLabel}`
                                    : seg.laborCategory}
                                {" · "}
                                {seg.startTime}–{seg.endTime}
                                {" · "}
                                {fmtHours(seg.durationHours)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cb.colorClass}`}
                                title="AI confidence score"
                              >
                                <cb.Icon className="h-3 w-3" />
                                {cb.label}
                              </span>
                              {seg.needsReview && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                                  <AlertTriangle className="h-3 w-3" />
                                  Review
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Explanation (needs review reason) */}
                          {seg.needsReview && seg.explanation && (
                            <p className="text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-900/40 rounded px-2 py-1.5">
                              {seg.explanation}
                            </p>
                          )}

                          {/* Charge / Indirect code selector */}
                          {!isReadonly && (
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {!seg.chargeCodeId && !seg.indirectCodeId
                                  ? "Select charge / indirect code (required)"
                                  : "Charge / Indirect Code"}
                              </Label>
                              <Select
                                value={getConvSegmentCodeValue(seg)}
                                onValueChange={(v) => handleConvCodeChange(seg.id, v)}
                              >
                                <SelectTrigger
                                  className={
                                    !seg.chargeCodeId && !seg.indirectCodeId
                                      ? "border-orange-400 focus:ring-orange-400"
                                      : ""
                                  }
                                >
                                  <SelectValue placeholder="Select a code…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {chargeCodes.length > 0 && (
                                    <>
                                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        Direct Charge Codes
                                      </div>
                                      {chargeCodes.map((cc) => (
                                        <SelectItem key={`direct-${cc.id}`} value={`direct-${cc.id}`}>
                                          {cc.code}{cc.description ? ` — ${cc.description}` : ""}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                  {indirectCodes.length > 0 && (
                                    <>
                                      <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        Indirect Codes
                                      </div>
                                      {indirectCodes.map((ic) => (
                                        <SelectItem key={`indirect-${ic.id}`} value={`indirect-${ic.id}`}>
                                          {ic.code} — {ic.label}
                                        </SelectItem>
                                      ))}
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {/* Segment validation errors */}
                          {segErrors.length > 0 && (
                            <ul className="text-xs text-destructive list-disc pl-4 space-y-0.5">
                              {segErrors.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Conversational action buttons */}
                  {!isReadonly && (
                    <div className="flex items-center justify-between pt-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setParseResult(null);
                          setConvSegments([]);
                          setValidationErrors(null);
                        }}
                      >
                        Re-enter narrative
                      </Button>
                      <Button
                        onClick={() => convConfirmMutation.mutate()}
                        disabled={
                          convConfirmMutation.isPending ||
                          convSegments.length === 0 ||
                          convSegments.some((s) => !s.chargeCodeId && !s.indirectCodeId)
                        }
                      >
                        {convConfirmMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-1" />
                        )}
                        Confirm Entry
                      </Button>
                    </div>
                  )}

                  {convSegments.some((s) => !s.chargeCodeId && !s.indirectCodeId) && (
                    <p className="text-xs text-muted-foreground text-center">
                      Select a charge or indirect code for all segments before confirming.
                    </p>
                  )}
                </div>
              )}

              {isReadonly && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Read-only</AlertTitle>
                  <AlertDescription>
                    This entry is in <strong>{status}</strong> status and cannot be edited.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* ── MANUAL MODE ─────────────────────────────────────────────────── */}
          {mode === "manual" && (
            <div className="space-y-5">
              <div className="space-y-1">
                <Label htmlFor="entry-date">Date</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  disabled={isReadonly}
                  className="max-w-xs"
                />
              </div>

              <Separator />

              {validationErrors && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation errors</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4 space-y-1 mt-1 text-sm">
                      {(validationErrors.global ?? []).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Time Segments</h3>
                  <span className="text-sm text-muted-foreground">
                    Total: <strong>{fmtHours(totalHours)}</strong>
                  </span>
                </div>

                {segments.map((seg, idx) => {
                  const segErrors = validationErrors?.segments?.[`segment_${idx}`] ?? [];
                  return (
                    <div
                      key={seg.id}
                      className={`rounded-lg border p-4 space-y-3 ${segErrors.length > 0 ? "border-destructive bg-destructive/5" : "border-border"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Segment {idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">
                            {fmtHours(durationHours(seg))}
                          </span>
                          {!isReadonly && segments.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeSegment(seg.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Start time</Label>
                          <Input
                            type="time"
                            value={seg.startTime}
                            onChange={(e) => updateSegment(seg.id, "startTime", e.target.value)}
                            disabled={isReadonly}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">End time</Label>
                          <Input
                            type="time"
                            value={seg.endTime}
                            onChange={(e) => updateSegment(seg.id, "endTime", e.target.value)}
                            disabled={isReadonly}
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Charge / Indirect Code</Label>
                        <Select
                          value={getSegmentCodeValue(seg)}
                          onValueChange={(v) => handleCodeChange(seg.id, v)}
                          disabled={isReadonly}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a code…" />
                          </SelectTrigger>
                          <SelectContent>
                            {chargeCodes.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Direct Charge Codes
                                </div>
                                {chargeCodes.map((cc) => (
                                  <SelectItem key={`direct-${cc.id}`} value={`direct-${cc.id}`}>
                                    {cc.code}{cc.description ? ` — ${cc.description}` : ""}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                            {indirectCodes.length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Indirect Codes
                                </div>
                                {indirectCodes.map((ic) => (
                                  <SelectItem key={`indirect-${ic.id}`} value={`indirect-${ic.id}`}>
                                    {ic.code} — {ic.label}
                                  </SelectItem>
                                ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Notes (optional)</Label>
                        <Input
                          value={seg.notes}
                          onChange={(e) => updateSegment(seg.id, "notes", e.target.value)}
                          placeholder="What did you work on?"
                          disabled={isReadonly}
                          maxLength={500}
                        />
                      </div>

                      {segErrors.length > 0 && (
                        <ul className="text-xs text-destructive list-disc pl-4 space-y-0.5">
                          {segErrors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}

                {!isReadonly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addSegment}
                    className="w-full border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add segment
                  </Button>
                )}
              </div>

              {!isReadonly && (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-sm text-muted-foreground">
                    Total hours: <strong className="text-foreground">{fmtHours(totalHours)}</strong>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => saveDraftMutation.mutate()}
                      disabled={saveDraftMutation.isPending || confirmMutation.isPending}
                    >
                      {saveDraftMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      Save Draft
                    </Button>
                    <Button
                      onClick={() => confirmMutation.mutate()}
                      disabled={saveDraftMutation.isPending || confirmMutation.isPending || segments.length === 0}
                    >
                      {confirmMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Submit
                    </Button>
                  </div>
                </div>
              )}

              {isReadonly && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Read-only</AlertTitle>
                  <AlertDescription>
                    This entry is in <strong>{status}</strong> status and cannot be edited.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

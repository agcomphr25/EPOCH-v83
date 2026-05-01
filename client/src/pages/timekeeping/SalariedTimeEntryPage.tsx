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
} from "lucide-react";
import { Link } from "wouter";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  NEEDS_REVIEW: { label: "Needs Review", variant: "destructive" },
  CONFIRMED: { label: "Ready to Submit", variant: "default" },
  POSTED: { label: "Submitted", variant: "outline" },
  VOIDED: { label: "Voided", variant: "destructive" },
};

type Segment = {
  id: string;
  startTime: string;
  endTime: string;
  chargeCodeId: number | null;
  indirectCodeId: number | null;
  notes: string;
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
  totalHours: string | null;
  parsedSegmentsJson: any[];
  rawInputText: string | null;
  validationErrorsJson: ValidationErrors | null;
};

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

export default function SalariedTimeEntryPage() {
  const { portalId, draftId } = useParams<{ portalId: string; draftId?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(draftId);

  const [entryDate, setEntryDate] = useState(todayStr());
  const [segments, setSegments] = useState<Segment[]>([emptySegment()]);
  const [rawInputText, setRawInputText] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors | null>(null);

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

  useEffect(() => {
    if (existingDraft) {
      setEntryDate(existingDraft.entryDate);
      const segs = (existingDraft.parsedSegmentsJson ?? []).map((s: any) => ({
        id: s.id ?? genId(),
        startTime: s.startTime ?? "09:00",
        endTime: s.endTime ?? "10:00",
        chargeCodeId: s.chargeCodeId ?? null,
        indirectCodeId: s.indirectCodeId ?? null,
        notes: s.notes ?? "",
      }));
      setSegments(segs.length > 0 ? segs : [emptySegment()]);
      setRawInputText(existingDraft.rawInputText ?? "");
      setValidationErrors(existingDraft.validationErrorsJson ?? null);
    }
  }, [existingDraft]);

  const totalHours = segments.reduce((sum, s) => sum + durationHours(s), 0);

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
    onSuccess: (data) => {
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
          // New draft was persisted as NEEDS_REVIEW — redirect into edit mode
          // so subsequent re-submits fix this draft rather than creating duplicates
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
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AccessDenied from "@/pages/AccessDenied";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Users,
  CalendarDays,
  FileText,
  Shield,
  ArrowRight,
  AlertCircle,
  Plus,
  Loader2,
  Ban,
  Eye,
  Settings,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

function formatDate(d: string | Date | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(d: string | Date | null): string {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function stageLabel(status: string): string {
  const map: Record<string, string> = {
    pending_supervisor: "Pending Supervisor",
    pending_hr: "Pending HR",
    pending_vp: "Pending VP",
    approved: "Approved",
    rejected: "Rejected",
    denied: "Denied",
    cancelled: "Cancelled",
    pending: "Pending",
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  if (status.startsWith("pending")) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  if (status === "approved") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (status === "rejected" || status === "denied") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  if (status === "cancelled") return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
  return "bg-gray-100 text-gray-800";
}

function getStageForStatus(status: string): string | null {
  const stageMap: Record<string, string> = {
    pending_supervisor: "supervisor",
    pending: "supervisor",
    pending_hr: "hr",
    pending_vp: "vp",
  };
  return stageMap[status] ?? null;
}

function isPending(status: string): boolean {
  return ["pending_supervisor", "pending_hr", "pending_vp", "pending"].includes(status);
}

function invalidateAllPtoQueries() {
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/summary"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/pipeline"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/alerts"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/payroll-exposure"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/payroll-readiness"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/staffing-impact"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/audit-trail"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/reversal-log"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/override-log"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/pto-command-center/missing-setup"] });
  queryClient.invalidateQueries({ queryKey: ["/api/timekeeping/time-off"] });
}

function SummaryCards({ data }: { data: any }) {
  const cards = [
    { label: "Total Pending", value: data.totalPending, icon: Clock, color: "text-yellow-600" },
    { label: "Supervisor", value: data.pendingSupervisor, icon: Users, color: "text-blue-600" },
    { label: "HR Review", value: data.pendingHr, icon: Shield, color: "text-purple-600" },
    { label: "VP Review", value: data.pendingVp, icon: FileText, color: "text-indigo-600" },
    { label: "Approved (Period)", value: data.approvedThisPeriod, icon: CheckCircle, color: "text-green-600" },
    { label: "Denied/Cancelled", value: data.deniedCancelled, icon: XCircle, color: "text-red-600" },
    { label: "On PTO Today", value: data.onPtoToday, icon: CalendarDays, color: "text-orange-600" },
    { label: "Upcoming 7 Days", value: data.upcoming7Days, icon: ArrowRight, color: "text-cyan-600" },
    { label: "Upcoming 14 Days", value: data.upcoming14Days, icon: CalendarDays, color: "text-teal-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="summary-cards">
      {cards.map((card) => (
        <Card key={card.label} className="border">
          <CardContent className="p-4 flex items-center gap-3">
            <card.icon className={`h-8 w-8 ${card.color}`} />
            <div>
              <p className="text-2xl font-bold" data-testid={`stat-${card.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}>
                {card.value ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AlertBanners({ data }: { data: any }) {
  if (!data) return null;
  const hasAlerts = data.missingSupervisor?.length > 0 || data.stuckRequests?.length > 0 || data.orphanedRequests?.length > 0;
  if (!hasAlerts) return null;

  return (
    <div className="space-y-2" data-testid="alert-banners">
      {data.missingSupervisor?.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">Missing Supervisor Assignments</p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {data.missingSupervisor.length} employee(s) with pending PTO have no supervisor assigned — requests route directly to HR:
              {" "}{data.missingSupervisor.map((e: any) => e.employeeName || `#${e.employeeId}`).join(", ")}
            </p>
          </div>
        </div>
      )}
      {data.stuckRequests?.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-200">Stuck Requests ({data.stuckRequests.length})</p>
            <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
              {data.stuckRequests.slice(0, 5).map((r: any) => (
                <p key={r.id}>
                  #{r.id} {r.employeeName || `Employee #${r.employeeId}`} — {r.thresholdLabel || "Exceeded threshold"}
                  {" "}({Math.round(r.stageAgeHours)}h at {stageLabel(r.status)})
                </p>
              ))}
              {data.stuckRequests.length > 5 && (
                <p className="text-xs">+{data.stuckRequests.length - 5} more</p>
              )}
            </div>
          </div>
        </div>
      )}
      {data.orphanedRequests?.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
          <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-orange-800 dark:text-orange-200">Orphaned Cancelled Requests ({data.orphanedRequests.length})</p>
            <p className="text-sm text-orange-700 dark:text-orange-300">
              Cancelled requests still have active (non-voided) leave entries.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function MissingSetupPanel() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/missing-setup"],
  });

  if (isLoading) return null;
  if (!data) return null;

  const hasIssues =
    (data.employeesWithoutSupervisor?.length > 0) ||
    (data.missingPtoCapabilities?.length > 0) ||
    (data.vpCapabilityIssues?.length > 0) ||
    (data.incompleteRouting?.length > 0);

  if (!hasIssues) return null;

  return (
    <Card className="border border-amber-200 dark:border-amber-800" data-testid="missing-setup-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-5 w-5 text-amber-600" />
          Missing Setup / Configuration Issues
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.employeesWithoutSupervisor?.length > 0 && (
          <div className="p-3 rounded bg-muted/30 border">
            <p className="text-sm font-medium mb-1">Employees Without Supervisor ({data.employeesWithoutSupervisor.length})</p>
            <div className="text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
              {data.employeesWithoutSupervisor.slice(0, 10).map((e: any) => (
                <p key={e.id}>{e.name || `#${e.id}`}{e.department ? ` — ${e.department}` : ""}</p>
              ))}
              {data.employeesWithoutSupervisor.length > 10 && (
                <p>+{data.employeesWithoutSupervisor.length - 10} more</p>
              )}
            </div>
          </div>
        )}
        {data.missingPtoCapabilities?.length > 0 && (
          <div className="p-3 rounded bg-muted/30 border">
            <p className="text-sm font-medium mb-1">Users Missing PTO Capabilities</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {data.missingPtoCapabilities.map((u: any) => (
                <p key={u.userId}>
                  {u.name || u.username} ({u.role}) — missing: {u.missingKeys?.join(", ")}
                </p>
              ))}
            </div>
          </div>
        )}
        {data.vpCapabilityIssues?.length > 0 && (
          <div className="p-3 rounded bg-muted/30 border">
            <p className="text-sm font-medium mb-1">VP Capability Issues</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {data.vpCapabilityIssues.map((u: any) => (
                <p key={u.userId}>{u.name || u.username} — {u.issue}</p>
              ))}
            </div>
          </div>
        )}
        {data.incompleteRouting?.length > 0 && (
          <div className="p-3 rounded bg-muted/30 border">
            <p className="text-sm font-medium mb-1">Requests with Incomplete Routing ({data.incompleteRouting.length})</p>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {data.incompleteRouting.map((r: any) => (
                <p key={r.requestId}>
                  #{r.requestId} {r.employeeName || `Employee #${r.employeeId}`} — {r.startDate} to {r.endDate}
                </p>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewDialog({
  reviewDialog,
  onClose,
}: {
  reviewDialog: { req: any; decision: "approved" | "denied"; stage: string } | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, stage, note }: { id: number; decision: string; stage: string; note: string }) =>
      apiRequest(`/api/timekeeping/time-off/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, stage, note: note || undefined }),
      }),
    onSuccess: (_data, vars) => {
      toast({
        title: vars.decision === "approved" ? "Stage approved" : "Request denied",
        description: vars.decision === "approved"
          ? "The request has been advanced to the next stage."
          : "The time-off request has been rejected.",
      });
      onClose();
      setNote("");
      invalidateAllPtoQueries();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message ?? "Failed to update request.", variant: "destructive" }),
  });

  if (!reviewDialog) return null;

  const r = reviewDialog.req;
  const empName = r.employeeFirstName && r.employeeLastName
    ? `${r.employeeFirstName} ${r.employeeLastName}`
    : r.employeeName || `Employee #${r.employeeId}`;

  return (
    <Dialog open={!!reviewDialog} onOpenChange={(o) => { if (!o) { onClose(); setNote(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {reviewDialog.decision === "approved"
              ? `Approve \u2014 ${reviewDialog.stage.toUpperCase()} Stage`
              : `Reject \u2014 ${reviewDialog.stage.toUpperCase()} Stage`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {empName} \u2014 {r.startDate || r.start_date} to {r.endDate || r.end_date}
            {r.requestUnit && r.requestUnit !== "full_day" ? ` \u00B7 ${r.requestUnit.replace(/_/g, " ")}` : ""}
            {r.requestedHours != null ? ` \u00B7 ${r.requestedHours}h` : ""}
          </p>
          {(r.supervisorDecision || r.hrDecision) && (
            <div className="text-xs space-y-0.5 text-muted-foreground border rounded p-2 bg-muted/30">
              {r.supervisorDecision && (
                <div>Supervisor: <span className="font-medium capitalize">{r.supervisorDecision}</span>{r.supervisorNote ? ` \u2014 ${r.supervisorNote}` : ""}</div>
              )}
              {r.hrDecision && (
                <div>HR: <span className="font-medium capitalize">{r.hrDecision}</span>{r.hrNote ? ` \u2014 ${r.hrNote}` : ""}</div>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label>
              {reviewDialog.decision === "denied"
                ? <span>Rejection Reason <span className="text-red-500">*</span></span>
                : <span>Note <span className="text-muted-foreground text-xs">(optional)</span></span>}
            </Label>
            <Textarea
              placeholder={reviewDialog.decision === "denied" ? "Required \u2014 reason for rejection\u2026" : "Optional note\u2026"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className={`resize-none ${reviewDialog.decision === "denied" && !note.trim() ? "border-red-400" : ""}`}
              data-testid="input-review-note"
            />
            {reviewDialog.decision === "denied" && !note.trim() && (
              <p className="text-xs text-red-500">A rejection reason is required.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setNote(""); }} data-testid="button-cancel-review">Cancel</Button>
          <Button
            variant={reviewDialog.decision === "approved" ? "default" : "destructive"}
            disabled={reviewMutation.isPending || (reviewDialog.decision === "denied" && !note.trim())}
            onClick={() => {
              if (reviewDialog.decision === "denied" && !note.trim()) return;
              reviewMutation.mutate({
                id: r.id,
                decision: reviewDialog.decision,
                stage: reviewDialog.stage,
                note: note.trim(),
              });
            }}
            data-testid="button-confirm-review"
          >
            {reviewMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> :
              reviewDialog.decision === "approved" ? <><CheckCircle className="h-4 w-4 mr-2" />Approve</> :
              <><XCircle className="h-4 w-4 mr-2" />Reject</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminCancelDialog({
  request,
  onClose,
}: {
  request: any | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiRequest(`/api/timekeeping/admin/time-off/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      toast({ title: "Request cancelled", description: "The PTO request has been cancelled." });
      onClose();
      setReason("");
      invalidateAllPtoQueries();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message ?? "Failed to cancel request.", variant: "destructive" }),
  });

  if (!request) return null;

  const empName = request.employeeFirstName && request.employeeLastName
    ? `${request.employeeFirstName} ${request.employeeLastName}`
    : request.employeeName || `Employee #${request.employeeId}`;

  return (
    <Dialog open={!!request} onOpenChange={(o) => { if (!o) { onClose(); setReason(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Admin Cancel PTO Request</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {empName} \u2014 {request.startDate || request.start_date} to {request.endDate || request.end_date}
          </p>
          {request.status === "approved" && (
            <div className="p-2 rounded bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
              This request is already approved. Cancelling will void all associated leave entries and reverse payroll effects.
            </div>
          )}
          <div className="space-y-1">
            <Label>Cancellation Reason <span className="text-red-500">*</span></Label>
            <Textarea
              placeholder="Required \u2014 reason for cancellation\u2026"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className={`resize-none ${!reason.trim() ? "border-red-400" : ""}`}
              data-testid="input-cancel-reason"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setReason(""); }} data-testid="button-cancel-dialog-close">Cancel</Button>
          <Button
            variant="destructive"
            disabled={cancelMutation.isPending || !reason.trim()}
            onClick={() => cancelMutation.mutate({ id: request.id, reason: reason.trim() })}
            data-testid="button-confirm-cancel"
          >
            {cancelMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling...</> :
              <><Ban className="h-4 w-4 mr-2" />Cancel Request</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OnBehalfDialog({
  open,
  onClose,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  employees: any[];
}) {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [unit, setUnit] = useState("full_day");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  const submitMutation = useMutation({
    mutationFn: (data: { employeeId: number; startDate: string; endDate: string; requestUnit: string; requestedHours?: number; employeeNote?: string }) =>
      apiRequest("/api/timekeeping/time-off", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast({ title: "PTO submitted", description: "Time-off request submitted on behalf of the employee." });
      onClose();
      setEmployeeId(""); setStartDate(""); setEndDate(""); setUnit("full_day"); setHours(""); setNote("");
      invalidateAllPtoQueries();
    },
    onError: (err: Error) => toast({ title: "Submission failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit PTO On Behalf of Employee</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger data-testid="select-onbehalf-employee">
                <SelectValue placeholder="Select employee\u2026" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e: any) => (
                  <SelectItem key={e.epochEmployeeId ?? e.id} value={String(e.epochEmployeeId ?? e.id)}>
                    {e.firstName || e.name?.split(" ")[0]} {e.lastName || e.name?.split(" ").slice(1).join(" ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Request Type</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger data-testid="select-onbehalf-unit"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="full_day">Full Day</SelectItem>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="multi_day">Multi-Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-onbehalf-start" />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate} data-testid="input-onbehalf-end" />
            </div>
          </div>
          {unit === "hourly" && (
            <div className="space-y-1">
              <Label>Hours</Label>
              <Input type="number" min="0.5" max="8" step="0.5" placeholder="e.g. 2" value={hours} onChange={(e) => setHours(e.target.value)} data-testid="input-onbehalf-hours" />
            </div>
          )}
          <div className="space-y-1">
            <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea placeholder="Reason for on-behalf submission\u2026" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="resize-none" data-testid="input-onbehalf-note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-onbehalf-cancel">Cancel</Button>
          <Button
            disabled={
              !employeeId || !startDate || !endDate || startDate > endDate ||
              (unit === "hourly" && (!hours || parseFloat(hours) <= 0)) ||
              submitMutation.isPending
            }
            onClick={() => {
              const empId = parseInt(employeeId, 10);
              if (!empId) return;
              submitMutation.mutate({
                employeeId: empId,
                startDate,
                endDate,
                requestUnit: unit,
                requestedHours: unit === "hourly" && hours ? parseFloat(hours) : undefined,
                employeeNote: note.trim() || undefined,
              });
            }}
            data-testid="button-onbehalf-submit"
          >
            {submitMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</> : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AuditTrailDrawer({
  requestId,
  onClose,
}: {
  requestId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center", requestId],
    queryFn: async () => {
      const res = await fetch(`/api/timekeeping/pto-command-center/${requestId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch request details");
      return res.json();
    },
    enabled: !!requestId,
  });

  return (
    <Sheet open={!!requestId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="audit-trail-drawer">
        <SheetHeader>
          <SheetTitle>Request #{requestId} — Full Lifecycle</SheetTitle>
        </SheetHeader>
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : data ? (
          <div className="space-y-6 mt-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Request Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Employee:</span> {data.request.employeeName || `#${data.request.employeeId}`}</div>
                <div><span className="text-muted-foreground">Department:</span> {data.request.employeeDepartment || "\u2014"}</div>
                <div><span className="text-muted-foreground">Dates:</span> {data.request.startDate} to {data.request.endDate}</div>
                <div><span className="text-muted-foreground">Type:</span> {data.request.requestUnit}{data.request.requestedHours ? ` (${data.request.requestedHours}h)` : ""}</div>
                <div><span className="text-muted-foreground">Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(data.request.status)}`}>{stageLabel(data.request.status)}</span></div>
                <div><span className="text-muted-foreground">Pay Type:</span> {data.request.employeePayType || "\u2014"}</div>
                {data.request.supervisorName && (
                  <div><span className="text-muted-foreground">Supervisor:</span> {data.request.supervisorName}</div>
                )}
                {data.request.submittedOnBehalf && (
                  <div><span className="text-muted-foreground">Submitted by:</span> {data.request.submittedByUsername || "Admin"}</div>
                )}
              </div>
              {data.request.employeeNote && (
                <div className="text-sm p-2 bg-muted/30 rounded border">
                  <span className="text-muted-foreground">Employee Note:</span> {data.request.employeeNote}
                </div>
              )}
              {data.request.adminNote && (
                <div className="text-sm p-2 bg-muted/30 rounded border">
                  <span className="text-muted-foreground">Admin Note:</span> {data.request.adminNote}
                </div>
              )}
              {(data.request.supervisorNote || data.request.hrNote || data.request.vpNote) && (
                <div className="text-sm p-2 bg-muted/30 rounded border space-y-0.5">
                  {data.request.supervisorNote && <div><span className="text-muted-foreground">Supervisor Note:</span> {data.request.supervisorNote}</div>}
                  {data.request.hrNote && <div><span className="text-muted-foreground">HR Note:</span> {data.request.hrNote}</div>}
                  {data.request.vpNote && <div><span className="text-muted-foreground">VP Note:</span> {data.request.vpNote}</div>}
                </div>
              )}
            </div>

            {data.payrollRelevance && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Payroll Export Relevance</h3>
                <div className="p-3 rounded border bg-muted/20 text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Current Pay Period:</span>
                    <span>{data.payrollRelevance.periodStart} to {data.payrollRelevance.periodEnd}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Overlaps Period:</span>
                    {data.payrollRelevance.overlapsCurrentPeriod ? (
                      <Badge variant="default" className="text-xs bg-green-600">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">No</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Pay Type:</span>
                    <span>{data.payrollRelevance.employeePayType || "\u2014"}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {data.payrollRelevance.hasLeaveEntries && <Badge variant="secondary" className="text-xs">Has Leave Entries</Badge>}
                    {data.payrollRelevance.hasVoidedEntries && <Badge variant="destructive" className="text-xs">Has Voided Entries</Badge>}
                    {data.payrollRelevance.hasSalariedLines && <Badge variant="secondary" className="text-xs">Has Salaried Lines</Badge>}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Timeline</h3>
              <div className="space-y-3 relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
                {(data.timeline || []).map((event: any, i: number) => {
                  const iconMap: Record<string, string> = {
                    submission: "bg-blue-500",
                    supervisor_review: "bg-purple-500",
                    hr_review: "bg-indigo-500",
                    vp_review: "bg-green-500",
                    cancellation: "bg-red-500",
                    leave_entry_created: "bg-green-400",
                    leave_entry_voided: "bg-orange-500",
                  };
                  return (
                    <div key={i} className="flex gap-3 relative" data-testid={`timeline-event-${i}`}>
                      <div className={`h-4 w-4 rounded-full shrink-0 mt-0.5 z-10 ${iconMap[event.type] || "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{event.label}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                        </div>
                        {event.details && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {event.details.decision && <span className="capitalize">{event.details.decision}</span>}
                            {event.details.note && <span> — {event.details.note}</span>}
                            {event.details.reviewerName && <span> by {event.details.reviewerName}</span>}
                            {event.details.reason && <span>Reason: {event.details.reason}</span>}
                            {event.details.actorEmail && <span> by {event.details.actorEmail}</span>}
                            {event.details.hours && <span>{event.details.hours}h</span>}
                            {event.details.voidReason && <span>Void: {event.details.voidReason}</span>}
                            {event.details.voidedByUsername && <span> by {event.details.voidedByUsername}</span>}
                            {event.details.submittedOnBehalf && <span>On behalf by {event.details.submittedByUsername || "admin"}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {data.leaveEntries?.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Leave Entries ({data.leaveEntries.length})</h3>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Hours</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.leaveEntries.map((le: any) => (
                        <tr key={le.id} className="border-t">
                          <td className="p-2">{le.date}</td>
                          <td className="p-2">{le.hours}h</td>
                          <td className="p-2">
                            {le.voidedAt ? (
                              <Badge variant="destructive" className="text-xs">Voided</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Active</Badge>
                            )}
                          </td>
                          <td className="p-2 max-w-[150px] truncate">
                            {le.voidedAt ? le.voidReason || "Voided" : le.note || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.salariedTimesheetLines?.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Salaried Timesheet Lines</h3>
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Hours</th>
                        <th className="text-left p-2 font-medium">Period</th>
                        <th className="text-left p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salariedTimesheetLines.map((sl: any) => (
                        <tr key={sl.id} className="border-t">
                          <td className="p-2">{sl.date}</td>
                          <td className="p-2">{sl.lineType}</td>
                          <td className="p-2">{sl.hours}h</td>
                          <td className="p-2 text-muted-foreground">{sl.periodStart} – {sl.periodEnd}</td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{sl.timesheetStatus}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.auditTrail?.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Raw Audit Log ({data.auditTrail.length})</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {data.auditTrail.map((a: any) => (
                    <div key={a.id} className="text-xs p-2 border rounded bg-muted/20">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{a.action}</Badge>
                        <span className="text-muted-foreground">{a.tableName} #{a.recordId}</span>
                        <span className="text-muted-foreground ml-auto">{formatDateTime(a.createdAt)}</span>
                      </div>
                      {a.actorEmail && <p className="text-muted-foreground mt-0.5">by {a.actorEmail} ({a.actorRole})</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-center text-muted-foreground p-8">Request not found</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function PipelineStageCard({
  stage,
  label,
  requests,
  onReview,
  onCancel,
  onViewDetail,
  canApproveStage,
  canAdminCancel,
}: {
  stage: string;
  label: string;
  requests: any[];
  onReview: (req: any, decision: "approved" | "denied", stage: string) => void;
  onCancel: (req: any) => void;
  onViewDetail: (id: number) => void;
  canApproveStage: boolean;
  canAdminCancel: boolean;
}) {
  const stageColors: Record<string, string> = {
    pending_supervisor: "border-l-blue-500",
    pending_hr: "border-l-purple-500",
    pending_vp: "border-l-indigo-500",
  };
  const reviewStage = stage.replace("pending_", "");

  return (
    <Card className={`border-l-4 ${stageColors[stage] || "border-l-gray-500"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{label}</span>
          <Badge variant="secondary">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-96 overflow-y-auto">
        {requests.length === 0 && (
          <p className="text-sm text-muted-foreground">No requests at this stage</p>
        )}
        {requests.map((req: any) => (
          <div
            key={req.id}
            className={`p-3 rounded-md border text-sm ${req.isStuck ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800" : "bg-muted/30"}`}
            data-testid={`pipeline-request-${req.id}`}
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{req.employeeName || `Employee #${req.employeeId}`}</p>
                <p className="text-muted-foreground">
                  {formatDate(req.startDate)} \u2014 {formatDate(req.endDate)}
                  {req.requestUnit !== "full_day" && ` (${req.requestUnit})`}
                  {req.requestedHours != null && ` · ${req.requestedHours}h`}
                </p>
                {req.employeeDepartment && (
                  <p className="text-muted-foreground text-xs">{req.employeeDepartment}</p>
                )}
                {req.nextApprover && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Next: {req.nextApprover}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  {req.stageAgeHours < 24
                    ? `${Math.round(req.stageAgeHours)}h at stage`
                    : `${Math.round(req.stageAgeHours / 24)}d at stage`}
                </p>
                {req.isStuck && (
                  <Badge variant="destructive" className="text-xs mt-1">Stuck</Badge>
                )}
                {req.nearPayrollFreeze && (
                  <Badge variant="outline" className="text-xs mt-1 border-amber-500 text-amber-600">Payroll Freeze</Badge>
                )}
              </div>
            </div>
            {req.employeeNote && (
              <p className="text-xs text-muted-foreground mt-1 italic truncate" title={req.employeeNote}>"{req.employeeNote}"</p>
            )}
            <div className="flex items-center justify-between mt-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground h-7 px-2"
                onClick={() => onViewDetail(req.id)}
                data-testid={`button-view-${req.id}`}
              >
                <Eye className="h-3 w-3 mr-1" />Detail
              </Button>
              {(canApproveStage || canAdminCancel) && (
                <div className="flex items-center gap-1">
                  {canApproveStage && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={`Approve at ${reviewStage} stage`}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 px-2"
                        onClick={() => onReview(req, "approved", reviewStage)}
                        data-testid={`button-approve-${req.id}`}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title={`Deny at ${reviewStage} stage`}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                        onClick={() => onReview(req, "denied", reviewStage)}
                        data-testid={`button-deny-${req.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />Deny
                      </Button>
                    </>
                  )}
                  {canAdminCancel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Admin cancel"
                      className="text-gray-500 hover:text-gray-700 h-7 px-2"
                      onClick={() => onCancel(req)}
                      data-testid={`button-cancel-${req.id}`}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ApprovalPipelineTab({
  onReview,
  onCancel,
  onViewDetail,
  capSet,
  isAdminUser,
}: {
  onReview: (req: any, decision: "approved" | "denied", stage: string) => void;
  onCancel: (req: any) => void;
  onViewDetail: (id: number) => void;
  capSet: Set<string>;
  isAdminUser: boolean;
}) {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/timekeeping/pto-command-center/pipeline"] });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading pipeline...</div>;
  if (!data?.pipeline) return null;

  const canAdminCancel = isAdminUser;
  const effectiveCapSet = new Set<string>([
    ...Array.from(capSet),
    ...(data.callerCapabilities ?? []),
  ]);

  return (
    <div className="space-y-4" data-testid="approval-pipeline">
      {data.stuckCount > 0 && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm font-medium text-red-800 dark:text-red-200">
            {data.stuckCount} request(s) stuck at an approval stage past threshold
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PipelineStageCard stage="pending_supervisor" label="Pending Supervisor" requests={data.pipeline.pending_supervisor || []} onReview={onReview} onCancel={onCancel} onViewDetail={onViewDetail} canApproveStage={isAdminUser || effectiveCapSet.has("timekeeping.pto.approve_supervisor")} canAdminCancel={canAdminCancel} />
        <PipelineStageCard stage="pending_hr" label="Pending HR" requests={data.pipeline.pending_hr || []} onReview={onReview} onCancel={onCancel} onViewDetail={onViewDetail} canApproveStage={isAdminUser || effectiveCapSet.has("timekeeping.pto.approve_hr")} canAdminCancel={canAdminCancel} />
        <PipelineStageCard stage="pending_vp" label="Pending VP" requests={data.pipeline.pending_vp || []} onReview={onReview} onCancel={onCancel} onViewDetail={onViewDetail} canApproveStage={isAdminUser || effectiveCapSet.has("timekeeping.pto.approve_vp")} canAdminCancel={canAdminCancel} />
      </div>
    </div>
  );
}

function AllRequestsTab({
  onReview,
  onCancel,
  onViewDetail,
  capSet,
  isAdminUser,
}: {
  onReview: (req: any, decision: "approved" | "denied", stage: string) => void;
  onCancel: (req: any) => void;
  onViewDetail: (id: number) => void;
  capSet: Set<string>;
  isAdminUser: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [supervisorFilter, setSupervisorFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/all-requests", statusFilter, departmentFilter, supervisorFilter, searchTerm, startDateFilter, endDateFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (departmentFilter) params.set("department", departmentFilter);
      if (supervisorFilter) params.set("supervisor", supervisorFilter);
      if (searchTerm) params.set("search", searchTerm);
      if (startDateFilter) params.set("startDate", startDateFilter);
      if (endDateFilter) params.set("endDate", endDateFilter);
      const res = await fetch(`/api/timekeeping/pto-command-center/all-requests?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
  });

  const filtered = (data?.requests || []);

  const sorted = [...filtered].sort((a: any, b: any) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (sortField === "createdAt" || sortField === "startDate") {
      aVal = new Date(aVal || 0).getTime();
      bVal = new Date(bVal || 0).getTime();
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(field: string) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortHeader({ field, children }: { field: string; children: any }) {
    return (
      <th className="text-left p-3 font-medium cursor-pointer hover:bg-muted/30 select-none" onClick={() => toggleSort(field)}>
        {children} {sortField === field ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : ""}
      </th>
    );
  }

  return (
    <div className="space-y-4" data-testid="all-requests-tab">
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search by name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-xs"
          data-testid="input-search-requests"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_supervisor">Pending Supervisor</SelectItem>
            <SelectItem value="pending_hr">Pending HR</SelectItem>
            <SelectItem value="pending_vp">Pending VP</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Department..."
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="max-w-[140px]"
          data-testid="input-department-filter"
        />
        <Input
          placeholder="Supervisor..."
          value={supervisorFilter}
          onChange={(e) => setSupervisorFilter(e.target.value)}
          className="max-w-[140px]"
          data-testid="input-supervisor-filter"
        />
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
          <Input type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} className="w-36" data-testid="input-requests-start-date" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
          <Input type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} className="w-36" data-testid="input-requests-end-date" />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading requests...</div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-sm" data-testid="requests-table">
            <thead className="bg-muted/50">
              <tr>
                <SortHeader field="employeeName">Employee</SortHeader>
                <SortHeader field="startDate">Dates</SortHeader>
                <th className="text-left p-3 font-medium">Unit</th>
                <th className="text-left p-3 font-medium">Hours</th>
                <SortHeader field="status">Status</SortHeader>
                <th className="text-left p-3 font-medium">Next Approver</th>
                <th className="text-left p-3 font-medium">Supervisor</th>
                <th className="text-left p-3 font-medium">Supv</th>
                <th className="text-left p-3 font-medium">HR</th>
                <th className="text-left p-3 font-medium">VP</th>
                <th className="text-left p-3 font-medium">Notes</th>
                <SortHeader field="createdAt">Age</SortHeader>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-6 text-center text-muted-foreground">No requests found</td>
                </tr>
              ) : (
                sorted.map((r: any) => {
                  const stage = getStageForStatus(r.status);
                  const ageMs = new Date().getTime() - new Date(r.createdAt).getTime();
                  const ageHours = Math.round(ageMs / (1000 * 60 * 60));
                  const ageLabel = ageHours < 24 ? `${ageHours}h` : `${Math.round(ageHours / 24)}d`;

                  let nextApprover = "\u2014";
                  if (r.status === "pending_supervisor" || r.status === "pending") {
                    nextApprover = r.supervisorName || (r.supervisorId ? `#${r.supervisorId}` : "Unassigned");
                  } else if (r.status === "pending_hr") {
                    nextApprover = "HR";
                  } else if (r.status === "pending_vp") {
                    nextApprover = "VP";
                  }

                  let hours = "\u2014";
                  if (r.requestedHours) hours = `${r.requestedHours}h`;
                  else if (r.requestUnit === "half_day") hours = "4h";
                  else if (r.requestUnit === "full_day") hours = "8h";
                  else if (r.startDate && r.endDate) {
                    const days = Math.floor((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1;
                    hours = `${days * 8}h`;
                  }

                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" data-testid={`row-request-${r.id}`} onClick={() => onViewDetail(r.id)}>
                      <td className="p-3">
                        <span className="font-medium">
                          {r.employeeName || `Employee #${r.employeeId}`}
                        </span>
                        {r.employeeDepartment && (
                          <span className="text-xs text-muted-foreground ml-1">({r.employeeDepartment})</span>
                        )}
                        {r.submittedOnBehalf && (
                          <Badge variant="outline" className="ml-1 text-xs">On behalf</Badge>
                        )}
                        {r.overlapsPayPeriod && (
                          <Badge variant="outline" className="ml-1 text-xs border-amber-500 text-amber-600">Payroll</Badge>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {formatDate(r.startDate)} \u2014 {formatDate(r.endDate)}
                      </td>
                      <td className="p-3 text-xs">{r.requestUnit}</td>
                      <td className="p-3 text-xs font-medium">{hours}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                          {stageLabel(r.status)}
                        </span>
                      </td>
                      <td className="p-3 text-xs">{nextApprover}</td>
                      <td className="p-3 text-xs">
                        {r.supervisorId ? (
                          <span>{r.supervisorName || `#${r.supervisorId}`}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-xs">
                        {r.supervisorDecision ? (
                          <span>{r.supervisorDecision === "approved" ? "\u2713" : "\u2717"}</span>
                        ) : "\u2014"}
                      </td>
                      <td className="p-3 text-xs">
                        {r.hrDecision ? (
                          <span>{r.hrDecision === "approved" ? "\u2713" : "\u2717"}</span>
                        ) : "\u2014"}
                      </td>
                      <td className="p-3 text-xs">
                        {r.vpDecision ? (
                          <span>{r.vpDecision === "approved" ? "\u2713" : "\u2717"}</span>
                        ) : "\u2014"}
                      </td>
                      <td className="p-3 text-xs max-w-[160px] truncate" title={[r.employeeNote, r.supervisorNote && `Supv: ${r.supervisorNote}`, r.hrNote && `HR: ${r.hrNote}`, r.vpNote && `VP: ${r.vpNote}`].filter(Boolean).join(" | ")}>
                        {r.employeeNote || r.supervisorNote || r.hrNote || r.vpNote ? (
                          <span className="text-muted-foreground">
                            {r.employeeNote ? r.employeeNote.slice(0, 30) : (r.supervisorNote ? `Supv: ${r.supervisorNote.slice(0, 25)}` : (r.hrNote ? `HR: ${r.hrNote.slice(0, 25)}` : `VP: ${(r.vpNote || "").slice(0, 25)}`))}
                            {(r.employeeNote?.length > 30 || r.supervisorNote?.length > 25 || r.hrNote?.length > 25 || r.vpNote?.length > 25) ? "..." : ""}
                          </span>
                        ) : "\u2014"}
                      </td>
                      <td className="p-3 text-xs whitespace-nowrap">{ageLabel}</td>
                      <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const stageCapMap: Record<string, string> = {
                            supervisor: "timekeeping.pto.approve_supervisor",
                            hr: "timekeeping.pto.approve_hr",
                            vp: "timekeeping.pto.approve_vp",
                          };
                          const canReviewThis = stage && (isAdminUser || capSet.has(stageCapMap[stage] || ""));
                          const canCancelThis = isAdminUser && r.status !== "cancelled";
                          if (!canReviewThis && !canCancelThis) return null;
                          return (
                            <div className="flex items-center justify-end gap-1">
                              {canReviewThis && stage && (
                                <>
                                  <Button size="sm" variant="ghost" className="text-green-600 hover:text-green-700 hover:bg-green-50 h-7 px-1" onClick={() => onReview(r, "approved", stage)} title="Approve" data-testid={`button-approve-${r.id}`}>
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-1" onClick={() => onReview(r, "denied", stage)} title="Deny" data-testid={`button-deny-${r.id}`}>
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {canCancelThis && (
                                <Button size="sm" variant="ghost" className="text-gray-500 hover:text-gray-700 h-7 px-1" onClick={() => onCancel(r)} title="Admin Cancel" data-testid={`button-cancel-${r.id}`}>
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PayrollExposureTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/timekeeping/pto-command-center/payroll-exposure"] });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading payroll data...</div>;
  if (!data?.periods) return null;

  return (
    <div className="space-y-6" data-testid="payroll-exposure-tab">
      {data.periods.map((period: any) => {
        const periodEnd = new Date(period.periodEnd);
        const now = new Date();
        const daysToEnd = Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        const nearFreeze = daysToEnd >= 0 && daysToEnd <= 3;

        return (
          <Card key={period.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {period.label}
                  {nearFreeze && (
                    <Badge variant="destructive" className="text-xs">
                      {daysToEnd === 0 ? "Closes today" : `${daysToEnd}d to freeze`}
                    </Badge>
                  )}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {formatDate(period.periodStart)} \u2014 {formatDate(period.periodEnd)}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-6 mb-4">
                <div>
                  <p className="text-2xl font-bold">{period.totalHours}h</p>
                  <p className="text-xs text-muted-foreground">Total PTO Hours</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{period.requestCount}</p>
                  <p className="text-xs text-muted-foreground">Requests</p>
                </div>
              </div>
              {period.requests.length > 0 && (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Employee</th>
                        <th className="text-left p-2 font-medium">Dates</th>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Pay Type</th>
                        <th className="text-right p-2 font-medium">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {period.requests.map((r: any) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2">{r.employeeName}</td>
                          <td className="p-2 whitespace-nowrap">{formatDate(r.startDate)} \u2014 {formatDate(r.endDate)}</td>
                          <td className="p-2">{r.requestUnit}</td>
                          <td className="p-2">
                            <Badge variant="outline" className="text-xs">{r.payType || "Unknown"}</Badge>
                          </td>
                          <td className="p-2 text-right font-medium">{r.hours}h</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PayrollReadinessPanel() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/payroll-readiness"],
  });

  if (isLoading) return <div className="p-4 text-center text-muted-foreground text-sm">Loading payroll readiness...</div>;
  if (!data) return null;

  return (
    <Card data-testid="payroll-readiness-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          Payroll Readiness — {formatDate(data.periodStart)} to {formatDate(data.periodEnd)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded border bg-muted/30">
            <p className="text-xl font-bold">{data.totalApprovedHours}h</p>
            <p className="text-xs text-muted-foreground">Total Approved</p>
          </div>
          <div className="text-center p-3 rounded border bg-muted/30">
            <p className="text-xl font-bold">{data.hourlyPtoHours}h</p>
            <p className="text-xs text-muted-foreground">Hourly PTO</p>
          </div>
          <div className="text-center p-3 rounded border bg-muted/30">
            <p className="text-xl font-bold">{data.salariedPtoHours}h</p>
            <p className="text-xs text-muted-foreground">Salaried PTO</p>
          </div>
          <div className="text-center p-3 rounded border bg-muted/30">
            <p className="text-xl font-bold">{data.salariedInjections?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Salaried Injections</p>
          </div>
        </div>

        {data.salariedInjections?.total > 0 && (
          <div className="p-3 rounded border bg-muted/20">
            <p className="text-sm font-medium mb-2">Salaried Injection Status</p>
            <div className="flex gap-4 mb-2 text-xs">
              <span className="text-green-600">{data.salariedInjections.synced} synced</span>
              <span className="text-amber-600">{data.salariedInjections.pending} pending</span>
              {data.salariedInjections.voided > 0 && (
                <span className="text-red-600">{data.salariedInjections.voided} voided</span>
              )}
            </div>
            {data.salariedInjections.details?.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.salariedInjections.details.map((d: any, i: number) => (
                  <div key={i} className={`text-xs p-1.5 rounded ${
                    d.syncStatus === "synced" ? "bg-green-50 dark:bg-green-950" :
                    d.syncStatus === "missing" ? "bg-amber-50 dark:bg-amber-950" :
                    "bg-red-50 dark:bg-red-950"
                  }`} data-testid={`injection-detail-${i}`}>
                    {d.employeeName || "Unknown"} — {d.date} — {d.hours}h —{" "}
                    <span className="font-medium">{d.syncStatus}</span>
                    {d.timesheetStatus && <span className="text-muted-foreground ml-1">({d.timesheetStatus})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {data.reversedEntries?.length > 0 && (
          <div className="p-3 rounded bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-1">
              Reversed PTO ({data.reversedEntries.length} entries)
            </p>
            <div className="text-xs text-orange-700 dark:text-orange-300 space-y-0.5">
              {data.reversedEntries.slice(0, 5).map((r: any) => (
                <p key={r.id}>{r.employeeName || `Entry #${r.id}`} — {r.date} ({r.hours}h) — {r.voidReason || "Reversed"}</p>
              ))}
            </div>
          </div>
        )}

        {data.warnings?.length > 0 && (
          <div className="space-y-1">
            {data.warnings.map((w: any, i: number) => (
              <div key={i} className={`p-2 rounded text-xs border ${
                w.type === "missing_leave_entry"
                  ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
                  : "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300"
              }`}>
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                {w.message}
              </div>
            ))}
          </div>
        )}

        {data.pendingInPeriod > 0 && (
          <p className="text-xs text-amber-600">
            {data.pendingInPeriod} pending request(s) fall within this pay period
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReversalLogTab() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/reversal-log", startDate, endDate, employeeSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (employeeSearch) params.set("employee", employeeSearch);
      const res = await fetch(`/api/timekeeping/pto-command-center/reversal-log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="space-y-4" data-testid="reversal-log-tab">
      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search employee..." value={employeeSearch} onChange={(e) => setEmployeeSearch(e.target.value)} className="max-w-xs" data-testid="input-reversal-employee" />
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" data-testid="input-reversal-start" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" data-testid="input-reversal-end" />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {(!data?.entries || data.entries.length === 0) && (
            <p className="text-center text-muted-foreground p-6">No cancellations or reversals found</p>
          )}
          {(data?.entries || []).map((entry: any) => (
            <Card key={entry.id} className="border" data-testid={`reversal-entry-${entry.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{entry.employeeName || `Employee #${entry.employeeId}`}</p>
                    <p className="text-xs text-muted-foreground">
                      #{entry.id} — {formatDate(entry.startDate)} to {formatDate(entry.endDate)} — {entry.requestUnit}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(entry.status)}`}>
                      {stageLabel(entry.status)}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{formatDateTime(entry.updatedAt)}</p>
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-xs">
                  {entry.voidedEntryCount > 0 && (
                    <span className="text-red-600">{entry.voidedEntryCount} voided leave entries</span>
                  )}
                  {entry.activeEntryCount > 0 && (
                    <span className="text-green-600">{entry.activeEntryCount} active leave entries</span>
                  )}
                </div>
                {entry.auditActions?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {entry.auditActions.slice(0, 3).map((a: any, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground bg-muted/30 rounded p-1.5">
                        {a.actorEmail || "System"} ({a.actorRole}) — {a.reason || a.action} — {formatDateTime(a.occurredAt)}
                      </div>
                    ))}
                  </div>
                )}
                {entry.affectedTimesheetLines?.length > 0 && (
                  <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">
                      Affected Timesheet Lines ({entry.affectedTimesheetLines.length})
                    </p>
                    <div className="space-y-0.5">
                      {entry.affectedTimesheetLines.slice(0, 5).map((tl: any, i: number) => (
                        <p key={i} className="text-xs text-blue-700 dark:text-blue-300">
                          {tl.date} — {tl.hours}h {tl.lineType} — {tl.timesheetStatus} ({tl.periodStart} to {tl.periodEnd})
                        </p>
                      ))}
                      {entry.affectedTimesheetLines.length > 5 && (
                        <p className="text-xs text-blue-500">+{entry.affectedTimesheetLines.length - 5} more</p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OverrideLogTab() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/override-log", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const res = await fetch(`/api/timekeeping/pto-command-center/override-log?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const categoryLabels: Record<string, string> = {
    clock_override: "Clock Override",
    pto_reversal: "PTO Reversal",
    cancellation: "Cancellation",
    timesheet_override: "Timesheet Override",
    payroll_override: "Payroll Override",
    admin_intervention: "Admin Intervention",
  };

  const categoryColors: Record<string, string> = {
    clock_override: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    pto_reversal: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    cancellation: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    timesheet_override: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    payroll_override: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    admin_intervention: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  return (
    <div className="space-y-4" data-testid="override-log-tab">
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" data-testid="input-override-start" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" data-testid="input-override-end" />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-2">
          {(!data?.entries || data.entries.length === 0) && (
            <p className="text-center text-muted-foreground p-6">No admin overrides or exceptions found</p>
          )}
          {(data?.entries || []).map((entry: any) => (
            <div key={entry.id} className="p-3 border rounded-md text-sm" data-testid={`override-entry-${entry.id}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[entry.category] || categoryColors.admin_intervention}`}>
                  {categoryLabels[entry.category] || entry.category}
                </span>
                <span className="text-xs text-muted-foreground">{entry.tableName} #{entry.recordId}</span>
                <Badge variant="outline" className="text-xs">{entry.action}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(entry.createdAt)}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                by {entry.actorEmail || "Unknown"} ({entry.actorRole})
              </div>
              {entry.newValues && (
                <div className="mt-1 text-xs bg-muted/30 rounded p-2 max-h-20 overflow-y-auto">
                  {Object.entries(entry.newValues as Record<string, any>).slice(0, 4).map(([k, v]) => (
                    <div key={k}><span className="font-medium">{k}:</span> {String(v)}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StaffingImpactTab() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/timekeeping/pto-command-center/staffing-impact"] });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading staffing data...</div>;
  if (!data?.calendar) return null;

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-4" data-testid="staffing-impact-tab">
      <div className="grid grid-cols-7 gap-2">
        {data.calendar.map((day: any) => {
          const d = new Date(day.date + "T12:00:00");
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <Card
              key={day.date}
              className={`border ${day.isHighImpact ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950" : isWeekend ? "bg-muted/30" : ""}`}
            >
              <CardContent className="p-2 text-center">
                <p className="text-xs text-muted-foreground">{dayNames[d.getDay()]}</p>
                <p className="text-sm font-medium">{d.getDate()}</p>
                <p className={`text-lg font-bold ${day.totalOut > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                  {day.totalOut}
                </p>
                <p className="text-xs text-muted-foreground">out</p>
                {day.entries?.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {day.entries.slice(0, 3).map((e: any, i: number) => (
                      <p key={i} className="text-xs truncate" title={e.employeeName}>
                        {e.employeeName?.split(" ")[0]}
                        {e.status.startsWith("pending") && <span className="text-yellow-600"> ?</span>}
                      </p>
                    ))}
                    {day.entries.length > 3 && (
                      <p className="text-xs text-muted-foreground">+{day.entries.length - 3} more</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-100 dark:bg-red-900 border border-red-300" /> 3+ employees out (high impact)
        </span>
        <span className="flex items-center gap-1">
          <span className="text-yellow-600">?</span> = pending approval
        </span>
      </div>
    </div>
  );
}

function AuditTrailTab({ onViewDetail }: { onViewDetail: (id: number) => void }) {
  const [actionFilter, setActionFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/audit-trail", actionFilter, employeeFilter, startDateFilter, endDateFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (actionFilter) params.set("action", actionFilter);
      if (startDateFilter) params.set("startDate", startDateFilter);
      if (endDateFilter) params.set("endDate", endDateFilter);
      if (employeeFilter) params.set("employee", employeeFilter);
      const res = await fetch(`/api/timekeeping/pto-command-center/audit-trail?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit trail");
      return res.json();
    },
  });

  const actionLabels: Record<string, string> = {
    INSERT: "Created",
    UPDATE: "Updated",
    DELETE: "Deleted",
  };

  function summarizeChange(entry: any): string {
    const nv = entry.newValues as Record<string, any> | null;
    const ov = entry.oldValues as Record<string, any> | null;
    if (!nv) return entry.action;
    if (nv.status && ov?.status) return `${ov.status} \u2192 ${nv.status}`;
    if (nv.status) return `Status: ${nv.status}`;
    if (nv.reversal) return "PTO Reversed";
    if (nv.warning) return String(nv.warning);
    if (entry.tableName === "leave_entries" && entry.action === "INSERT") return "Leave entry created";
    if (nv.voidedAt) return "Leave entry voided";
    if (nv.cancelledBy) return `Cancelled by user #${nv.cancelledBy}${nv.reason ? `: ${nv.reason}` : ""}`;
    return entry.action;
  }

  const filteredEntries = data?.entries || [];

  return (
    <div className="space-y-4" data-testid="audit-trail-tab">
      <div className="flex gap-3 flex-wrap">
        <Select value={actionFilter || "all"} onValueChange={(v) => setActionFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40" data-testid="select-audit-action-filter">
            <SelectValue placeholder="Filter by action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="INSERT">Created</SelectItem>
            <SelectItem value="UPDATE">Updated</SelectItem>
            <SelectItem value="DELETE">Deleted</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter by employee/actor..."
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="max-w-[200px]"
          data-testid="input-audit-employee-filter"
        />
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">From:</Label>
          <Input type="date" value={startDateFilter} onChange={(e) => setStartDateFilter(e.target.value)} className="w-36" data-testid="input-audit-start-date" />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">To:</Label>
          <Input type="date" value={endDateFilter} onChange={(e) => setEndDateFilter(e.target.value)} className="w-36" data-testid="input-audit-end-date" />
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading audit trail...</div>
      ) : (
        <div className="space-y-2">
          {filteredEntries.length === 0 && (
            <p className="text-center text-muted-foreground p-6">No audit entries found</p>
          )}
          {filteredEntries.map((entry: any) => {
            const ov = entry.oldValues as Record<string, any> | null;
            const nv = entry.newValues as Record<string, any> | null;
            const changedKeys = nv ? Object.keys(nv).filter(k => !ov || JSON.stringify(ov[k]) !== JSON.stringify(nv[k])) : [];
            const isTimeOff = entry.tableName === "time_off_requests";
            return (
              <div
                key={entry.id}
                className={`p-3 border rounded-md flex items-start gap-3 text-sm ${isTimeOff ? "cursor-pointer hover:bg-muted/30" : ""}`}
                data-testid={`audit-entry-${entry.id}`}
                onClick={isTimeOff ? () => onViewDetail(entry.recordId) : undefined}
              >
                <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                  entry.action === "INSERT" ? "bg-green-500" :
                  entry.action === "DELETE" ? "bg-red-500" : "bg-blue-500"
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{actionLabels[entry.action] || entry.action}</Badge>
                    <span className="text-xs text-muted-foreground">{entry.tableName} #{entry.recordId}</span>
                    {entry.resolvedEmployeeName && (
                      <span className="text-xs font-medium">{entry.resolvedEmployeeName}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{summarizeChange(entry)}</p>
                  {entry.action === "UPDATE" && changedKeys.length > 0 && (
                    <div className="mt-1.5 bg-muted/30 rounded p-2 text-xs space-y-0.5" data-testid={`audit-diff-${entry.id}`}>
                      {changedKeys.slice(0, 8).map((key) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-medium text-muted-foreground min-w-[100px]">{key}:</span>
                          <span className="text-red-600 line-through">{ov?.[key] != null ? String(ov[key]) : "\u2014"}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                          <span className="text-green-600">{nv?.[key] != null ? String(nv[key]) : "\u2014"}</span>
                        </div>
                      ))}
                      {changedKeys.length > 8 && (
                        <span className="text-muted-foreground">+{changedKeys.length - 8} more fields</span>
                      )}
                    </div>
                  )}
                  {entry.action === "INSERT" && nv && (
                    <div className="mt-1.5 bg-muted/30 rounded p-2 text-xs space-y-0.5" data-testid={`audit-new-${entry.id}`}>
                      {Object.entries(nv).slice(0, 6).map(([key, val]) => (
                        <div key={key} className="flex gap-2">
                          <span className="font-medium text-muted-foreground min-w-[100px]">{key}:</span>
                          <span className="text-green-600">{val != null ? String(val) : "\u2014"}</span>
                        </div>
                      ))}
                      {Object.keys(nv).length > 6 && (
                        <span className="text-muted-foreground">+{Object.keys(nv).length - 6} more fields</span>
                      )}
                    </div>
                  )}
                  {entry.actorEmail && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {entry.actorEmail} {entry.actorRole ? `(${entry.actorRole})` : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PTOCommandCenter() {
  const { data: currentUser } = useQuery<any>({
    queryKey: ["currentUser"],
  });

  const { data: myPermissions, isLoading: permissionsLoading } = useQuery<{ permissions: string[] }>({
    queryKey: ["/api/permissions/me"],
    staleTime: 1000 * 60 * 5,
  });
  const capSet = useMemo(() => new Set(myPermissions?.permissions ?? []), [myPermissions]);

  const userRole = (currentUser?.role ?? "").toUpperCase();
  const isRoleAdmin = userRole === "ADMIN" || userRole === "OWNER";
  const hasCapability =
    capSet.has("timekeeping.pto.view_all") ||
    capSet.has("timekeeping.pto.approve_supervisor") ||
    capSet.has("timekeeping.pto.approve_hr") ||
    capSet.has("timekeeping.pto.approve_vp");
  const authorized = Boolean(currentUser?.id) || isRoleAdmin || hasCapability;

  const { data: summaryData, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/summary"],
    refetchInterval: 60000,
    enabled: authorized,
  });

  const { data: alertsData } = useQuery<any>({
    queryKey: ["/api/timekeeping/pto-command-center/alerts"],
    refetchInterval: 60000,
    enabled: authorized,
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/timekeeping/employees"],
    enabled: authorized,
  });

  const isAdminUser = summaryData?.isAdmin === true || isRoleAdmin;
  const canSubmitOnBehalf = isAdminUser || capSet.has("timekeeping.pto.submit_on_behalf");

  const [reviewDialog, setReviewDialog] = useState<{ req: any; decision: "approved" | "denied"; stage: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [onBehalfOpen, setOnBehalfOpen] = useState(false);
  const [drawerRequestId, setDrawerRequestId] = useState<number | null>(null);

  function handleReview(req: any, decision: "approved" | "denied", stage: string) {
    setReviewDialog({ req, decision, stage });
  }

  function handleCancel(req: any) {
    setCancelTarget(req);
  }

  function handleViewDetail(id: number) {
    setDrawerRequestId(id);
  }

  if (!permissionsLoading && !authorized) {
    return <AccessDenied />;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-primary" />
            PTO Command Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Unified PTO governance, approval tracking, and staffing impact visibility
          </p>
        </div>
        {canSubmitOnBehalf && (
          <Button onClick={() => setOnBehalfOpen(true)} data-testid="button-submit-on-behalf">
            <Plus className="h-4 w-4 mr-2" />Submit On Behalf
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full max-w-4xl overflow-x-auto">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="pipeline" data-testid="tab-pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="requests" data-testid="tab-requests">All Requests</TabsTrigger>
          <TabsTrigger value="payroll" data-testid="tab-payroll">Payroll & Staffing</TabsTrigger>
          <TabsTrigger value="reversals" data-testid="tab-reversals" className="flex items-center gap-1">
            <RotateCcw className="h-3 w-3" />Reversals
          </TabsTrigger>
          <TabsTrigger value="overrides" data-testid="tab-overrides" className="flex items-center gap-1">
            <ShieldAlert className="h-3 w-3" />Overrides
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">Audit Trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {summaryLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading summary...</div>
          ) : (
            <>
              <SummaryCards data={summaryData || {}} />
              <AlertBanners data={alertsData} />
              <MissingSetupPanel />
            </>
          )}
        </TabsContent>

        <TabsContent value="pipeline">
          <ApprovalPipelineTab onReview={handleReview} onCancel={handleCancel} onViewDetail={handleViewDetail} capSet={capSet} isAdminUser={isAdminUser} />
        </TabsContent>

        <TabsContent value="requests">
          <AllRequestsTab onReview={handleReview} onCancel={handleCancel} onViewDetail={handleViewDetail} capSet={capSet} isAdminUser={isAdminUser} />
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6">
          <PayrollReadinessPanel />
          <div>
            <h2 className="text-lg font-semibold mb-3">Payroll Exposure</h2>
            <PayrollExposureTab />
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3">14-Day Staffing Impact</h2>
            <StaffingImpactTab />
          </div>
        </TabsContent>

        <TabsContent value="reversals">
          <ReversalLogTab />
        </TabsContent>

        <TabsContent value="overrides">
          <OverrideLogTab />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTrailTab onViewDetail={handleViewDetail} />
        </TabsContent>
      </Tabs>

      <ReviewDialog reviewDialog={reviewDialog} onClose={() => setReviewDialog(null)} />
      <AdminCancelDialog request={cancelTarget} onClose={() => setCancelTarget(null)} />
      {canSubmitOnBehalf && (
        <OnBehalfDialog open={onBehalfOpen} onClose={() => setOnBehalfOpen(false)} employees={employees} />
      )}
      <AuditTrailDrawer requestId={drawerRequestId} onClose={() => setDrawerRequestId(null)} />
    </div>
  );
}

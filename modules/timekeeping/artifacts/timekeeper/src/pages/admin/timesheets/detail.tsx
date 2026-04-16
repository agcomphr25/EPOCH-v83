import { AdminLayout } from "@/components/layout/admin-layout";
import { useParams, Link } from "wouter";
import {
  useGetTimesheet,
  useApproveTimesheet,
  useRejectTimesheet,
  useGetEmployee,
  getGetTimesheetQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { ArrowLeft, Check, X, AlertTriangle, FileEdit, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

interface GapsResponse {
  gapDays: string[];
  totalGaps: number;
  standardWorkWeekHours?: number;
  totalAccountedHours?: number;
  shortfallHours?: number;
}

interface Amendment {
  id: number;
  timesheetId: number;
  justification: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  status: string;
  createdByEmail: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export default function AdminTimesheetDetail() {
  const { id } = useParams();
  const tsId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();

  const [rejectionNote, setRejectionNote] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendForm, setAmendForm] = useState({
    fieldChanged: "",
    oldValue: "",
    newValue: "",
    justification: "",
  });

  const { data: timesheet, isLoading: loadingTs } = useGetTimesheet(tsId, {
    query: { enabled: !!tsId },
  });
  const { data: employee, isLoading: loadingEmp } = useGetEmployee(
    timesheet?.employeeId || 0,
    { query: { enabled: !!timesheet?.employeeId } }
  );

  const { data: gaps } = useQuery<GapsResponse>({
    queryKey: ["timesheet-gaps", tsId],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${tsId}/gaps`, { credentials: "include" });
      if (!res.ok) return { gapDays: [], totalGaps: 0 };
      return res.json();
    },
    enabled: !!timesheet && (timesheet.status === "submitted" || timesheet.status === "draft"),
  });

  const { data: amendments = [] } = useQuery<Amendment[]>({
    queryKey: ["timesheet-amendments", tsId],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${tsId}/amendments`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!timesheet,
  });

  interface LeaveSummaryEntry { id: number; date: string; leaveType: string; hours: number; note: string | null; }
  interface LeaveSummary { workedHours: number; leaveHours: number; totalAccountedHours: number; leaveEntries: LeaveSummaryEntry[]; }
  const { data: leaveSummary } = useQuery<LeaveSummary>({
    queryKey: ["timesheet-leave-summary", tsId],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${tsId}/leave-summary`, { credentials: "include" });
      if (!res.ok) return { totalLeaveHours: 0, entries: [] };
      return res.json();
    },
    enabled: !!timesheet,
  });

  const approveTimesheet = useApproveTimesheet();
  const rejectTimesheet = useRejectTimesheet();

  const createAmendment = useMutation({
    mutationFn: async (data: typeof amendForm) => {
      const res = await fetch(`/api/timesheets/${tsId}/amend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create amendment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Amendment created");
      queryClient.invalidateQueries({ queryKey: ["timesheet-amendments", tsId] });
      setAmendOpen(false);
      setAmendForm({ fieldChanged: "", oldValue: "", newValue: "", justification: "" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const approveAmendment = useMutation({
    mutationFn: async (amendId: number) => {
      const res = await fetch(`/api/amendments/${amendId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to approve amendment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Amendment approved and applied");
      queryClient.invalidateQueries({ queryKey: ["timesheet-amendments", tsId] });
      queryClient.invalidateQueries({ queryKey: getGetTimesheetQueryKey(tsId) });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectAmendment = useMutation({
    mutationFn: async (amendId: number) => {
      const res = await fetch(`/api/amendments/${amendId}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to reject amendment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Amendment rejected");
      queryClient.invalidateQueries({ queryKey: ["timesheet-amendments", tsId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleApprove = async () => {
    try {
      await approveTimesheet.mutateAsync({ id: tsId });
      queryClient.invalidateQueries({ queryKey: getGetTimesheetQueryKey(tsId) });
      toast.success("Timesheet approved");
    } catch (err: any) {
      toast.error(err.message || "Failed to approve");
    }
  };

  const handleReject = async () => {
    if (!rejectionNote.trim()) {
      toast.error("Rejection note is required");
      return;
    }
    try {
      await rejectTimesheet.mutateAsync({
        id: tsId,
        data: { rejectionNote },
      });
      queryClient.invalidateQueries({ queryKey: getGetTimesheetQueryKey(tsId) });
      toast.success("Timesheet rejected");
      setRejectOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reject");
    }
  };

  const handleCreateAmendment = () => {
    if (!amendForm.justification.trim() || !amendForm.fieldChanged) {
      toast.error("Field and justification are required");
      return;
    }
    if (!amendForm.newValue.trim()) {
      toast.error("New value is required");
      return;
    }
    createAmendment.mutate({
      fieldChanged: amendForm.fieldChanged,
      newValue: amendForm.newValue,
      justification: amendForm.justification,
    });
  };

  const fieldLabel = (f: string) => {
    const labels: Record<string, string> = {
      totalHours: "Total Hours",
      regularHours: "Regular Hours",
      overtimeHours: "Overtime Hours",
      periodStart: "Period Start",
      periodEnd: "Period End",
    };
    return labels[f] || f;
  };

  if (loadingTs || loadingEmp)
    return (
      <AdminLayout>
        <div className="p-8 text-muted-foreground">Loading timesheet...</div>
      </AdminLayout>
    );
  if (!timesheet)
    return (
      <AdminLayout>
        <div className="p-8 text-muted-foreground">Timesheet not found.</div>
      </AdminLayout>
    );

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/timesheets">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Timesheet Review</h1>
            {employee && (
              <p className="text-muted-foreground">
                {employee.firstName} {employee.lastName}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <span
            className={`px-4 py-2 rounded-full text-sm font-bold uppercase self-center ${
              timesheet.status === "approved"
                ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400"
                : timesheet.status === "submitted"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400"
                  : timesheet.status === "rejected"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400"
                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400"
            }`}
          >
            {timesheet.status}
          </span>
        </div>
      </div>

      {gaps && (gaps.totalGaps > 0 || (gaps.shortfallHours != null && gaps.shortfallHours > 0)) && (timesheet.status === "submitted" || timesheet.status === "draft") && (
        <Card className="mb-6 border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              {gaps.totalGaps > 0 && (
                <>
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    {gaps.totalGaps} day{gaps.totalGaps === 1 ? " has" : "s have"} no recorded time
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    Missing days: {gaps.gapDays.map((d) => format(new Date(d + "T12:00:00"), "EEE MMM d")).join(", ")}
                  </p>
                </>
              )}
              {gaps.shortfallHours != null && gaps.shortfallHours > 0 && (
                <p className="font-semibold text-amber-800 dark:text-amber-300 mt-1">
                  Weekly shortfall: {gaps.shortfallHours.toFixed(2)}h below {gaps.standardWorkWeekHours}h standard (worked + leave = {gaps.totalAccountedHours?.toFixed(2)}h)
                </p>
              )}
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                Verify with employee before approving — DCAA total-time-accounting requirement
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Hours Summary</CardTitle>
              <CardDescription>
                {format(new Date(timesheet.periodStart), "PP")} -{" "}
                {format(new Date(timesheet.periodEnd), "PP")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-muted/30 p-6 rounded-lg border border-border">
                  <div className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Regular
                  </div>
                  <div className="text-3xl font-bold">{timesheet.regularHours.toFixed(2)}</div>
                </div>
                <div className="bg-amber-500/10 p-6 rounded-lg border border-amber-500/20">
                  <div className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-wider">
                    Overtime
                  </div>
                  <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {timesheet.overtimeHours.toFixed(2)}
                  </div>
                </div>
                <div className="bg-purple-500/10 p-6 rounded-lg border border-purple-500/20">
                  <div className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-2 uppercase tracking-wider">
                    Leave
                  </div>
                  <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {(leaveSummary?.leaveHours ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="bg-primary/10 p-6 rounded-lg border border-primary/20">
                  <div className="text-sm font-medium text-primary mb-2 uppercase tracking-wider">
                    Total Accounted
                  </div>
                  <div className="text-3xl font-bold text-primary">
                    {(leaveSummary?.totalAccountedHours ?? timesheet.totalHours).toFixed(2)}
                  </div>
                </div>
              </div>
              {leaveSummary?.leaveEntries && leaveSummary.leaveEntries.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Leave Entries in Period</h4>
                  <div className="flex flex-wrap gap-2">
                    {leaveSummary.leaveEntries.map(e => (
                      <span key={e.id} className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                        {format(new Date(e.date + "T00:00:00"), "MMM d")} — {e.leaveType.toUpperCase()} ({e.hours}h)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {timesheet.rejectionNote && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-red-800 dark:text-red-400 text-lg">
                  Rejection Note
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-900 dark:text-red-200">{timesheet.rejectionNote}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Punches in Period</CardTitle>
              <CardDescription>Punch data relies on the punch log</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground text-center py-8">
                Refer to the Employee Punch Log for detailed breakdown.
                <br />
                <Link href={`/admin/employees/${timesheet.employeeId}`}>
                  <Button variant="link" className="mt-2">
                    View Employee Profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {(amendments.length > 0 || timesheet.status === "approved") && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileEdit className="h-5 w-5" />
                    Amendments
                  </CardTitle>
                  <CardDescription>
                    Post-approval corrections with documented justification
                  </CardDescription>
                </div>
                {timesheet.status === "approved" && (
                  <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Amendment
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Amendment</DialogTitle>
                        <DialogDescription>
                          Amend this approved timesheet. All amendments require separate approval
                          and are logged for DCAA compliance.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Field to Amend</Label>
                          <Select
                            value={amendForm.fieldChanged}
                            onValueChange={(v) =>
                              setAmendForm((f) => ({
                                ...f,
                                fieldChanged: v,
                                oldValue: String(
                                  (timesheet as Record<string, unknown>)[v] ?? ""
                                ),
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select field" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="totalHours">Total Hours</SelectItem>
                              <SelectItem value="regularHours">Regular Hours</SelectItem>
                              <SelectItem value="overtimeHours">Overtime Hours</SelectItem>
                              <SelectItem value="periodStart">Period Start</SelectItem>
                              <SelectItem value="periodEnd">Period End</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Current Value</Label>
                            <Input value={amendForm.oldValue} disabled />
                          </div>
                          <div className="space-y-2">
                            <Label>New Value</Label>
                            <Input
                              value={amendForm.newValue}
                              onChange={(e) =>
                                setAmendForm((f) => ({ ...f, newValue: e.target.value }))
                              }
                              placeholder="Enter corrected value"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Justification (required)</Label>
                          <Textarea
                            placeholder="Describe the reason for this correction..."
                            value={amendForm.justification}
                            onChange={(e) =>
                              setAmendForm((f) => ({ ...f, justification: e.target.value }))
                            }
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAmendOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={handleCreateAmendment}
                          disabled={createAmendment.isPending}
                        >
                          Submit Amendment
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              {amendments.length > 0 && (
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field</TableHead>
                        <TableHead>Old → New</TableHead>
                        <TableHead>Justification</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {amendments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">
                            {fieldLabel(a.fieldChanged)}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {a.oldValue ?? "—"} → {a.newValue ?? "—"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={a.justification}>
                            {a.justification}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                                a.status === "approved"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400"
                                  : a.status === "rejected"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                              }`}
                            >
                              {a.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {a.createdByEmail || "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {a.status === "pending" && (
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-green-600"
                                  onClick={() => approveAmendment.mutate(a.id)}
                                  disabled={approveAmendment.isPending}
                                >
                                  <Check className="h-3 w-3" /> Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1 text-red-600"
                                  onClick={() => rejectAmendment.mutate(a.id)}
                                  disabled={rejectAmendment.isPending}
                                >
                                  <X className="h-3 w-3" /> Reject
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {timesheet.status === "submitted" ? (
                <>
                  <Button
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                    size="lg"
                    onClick={handleApprove}
                    disabled={approveTimesheet.isPending}
                  >
                    <Check className="h-5 w-5" /> Approve Timesheet
                  </Button>

                  <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="w-full gap-2" size="lg">
                        <X className="h-5 w-5" /> Reject
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reject Timesheet</DialogTitle>
                        <DialogDescription>
                          Please provide a reason for rejecting this timesheet. The employee will
                          see this note.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Rejection Reason</Label>
                          <Textarea
                            placeholder="e.g., Missing lunch punch on Tuesday"
                            value={rejectionNote}
                            onChange={(e) => setRejectionNote(e.target.value)}
                            rows={4}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleReject}
                          disabled={rejectTimesheet.isPending}
                        >
                          Confirm Rejection
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              ) : (
                <div className="text-center p-4 bg-muted rounded-md text-sm text-muted-foreground">
                  No review actions available for {timesheet.status} timesheets.
                </div>
              )}

              <div className="pt-4 mt-4 border-t space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Created</span>
                  <span>{format(new Date(timesheet.createdAt), "MMM d, HH:mm")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Attested</span>
                  <span
                    className={
                      timesheet.employeeAttested
                        ? "text-green-600 dark:text-green-400 font-medium"
                        : "text-muted-foreground"
                    }
                  >
                    {timesheet.employeeAttested
                      ? timesheet.attestedAt
                        ? format(new Date(timesheet.attestedAt), "MMM d, HH:mm")
                        : "Yes"
                      : "Not yet"}
                  </span>
                </div>
                {timesheet.submittedAt && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Submitted</span>
                    <span>{format(new Date(timesheet.submittedAt), "MMM d, HH:mm")}</span>
                  </div>
                )}
                {timesheet.reviewedAt && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Reviewed</span>
                    <span>{format(new Date(timesheet.reviewedAt), "MMM d, HH:mm")}</span>
                  </div>
                )}
                {timesheet.reviewerEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewer</span>
                    <span
                      className="font-medium text-foreground truncate max-w-[160px]"
                      title={timesheet.reviewerEmail}
                    >
                      {timesheet.reviewerEmail}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

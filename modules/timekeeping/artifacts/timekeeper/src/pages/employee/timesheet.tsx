import { useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmployeeLayout } from "@/components/layout/employee-layout";
import { useGetTimesheet, useSubmitTimesheet, useGetEmployee, useListTimesheetPunches, useListLeaveEntries, useCreateLeaveEntry, getListLeaveEntriesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Shield, Plus } from "lucide-react";

async function attestTimesheet(id: number): Promise<void> {
  const res = await fetch(`/api/timesheets/${id}/attest`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Attestation failed");
  }
}

export default function EmployeeTimesheet() {
  const { id, timesheetId } = useParams();
  const empId = parseInt(id || "0", 10);
  const tsId = parseInt(timesheetId || "0", 10);

  const [attestationChecked, setAttestationChecked] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ date: "", leaveType: "pto", hours: "8", note: "" });
  const queryClient = useQueryClient();

  const { data: employee } = useGetEmployee(empId, { query: { enabled: !!empId } });
  const { data: timesheet, refetch } = useGetTimesheet(tsId, { query: { enabled: !!tsId } });
  const { data: punches = [] } = useListTimesheetPunches(tsId, {
    query: { enabled: !!timesheet },
  });
  const { data: leaveEntries = [] } = useListLeaveEntries(
    { employeeId: empId, from: timesheet?.periodStart, to: timesheet?.periodEnd },
    { query: { enabled: !!timesheet } }
  );
  const createLeave = useCreateLeaveEntry();
  const submitTimesheet = useSubmitTimesheet();

  interface LeaveSummary { workedHours: number; leaveHours: number; totalAccountedHours: number; leaveEntries: { id: number; date: string; leaveType: string; hours: number; note: string | null }[] }
  const { data: leaveSummary } = useQuery<LeaveSummary>({
    queryKey: ["timesheet-leave-summary", tsId],
    queryFn: async () => {
      const res = await fetch(`/api/timesheets/${tsId}/leave-summary`, { credentials: "include" });
      if (!res.ok) return { totalLeaveHours: 0, entries: [] };
      return res.json();
    },
    enabled: !!timesheet,
  });

  const attestMutation = useMutation({
    mutationFn: () => attestTimesheet(tsId),
    onSuccess: () => {
      toast.success("Timesheet attested");
      refetch();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Attestation failed");
      setAttestationChecked(false);
    },
  });

  const handleAttestationChange = (checked: boolean) => {
    setAttestationChecked(checked);
    if (checked && !timesheet?.employeeAttested) {
      attestMutation.mutate();
    }
  };

  const handleSubmit = async () => {
    try {
      await submitTimesheet.mutateAsync({ id: tsId });
      toast.success("Timesheet submitted successfully");
      refetch();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit timesheet";
      toast.error(message);
    }
  };

  if (!timesheet) return <EmployeeLayout><div className="p-8 text-center">Loading...</div></EmployeeLayout>;

  const isAttested = timesheet.employeeAttested || attestationChecked;
  const isDraft = timesheet.status === "draft";

  return (
    <EmployeeLayout employeeName={employee ? `${employee.firstName} ${employee.lastName}` : undefined}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link href={`/employee/${empId}`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
            timesheet.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" :
            timesheet.status === "submitted" ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" :
            timesheet.status === "rejected" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" :
            "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
          }`}>
            {timesheet.status}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Timesheet Details</CardTitle>
            <CardDescription>
              {format(new Date(timesheet.periodStart), "PP")} – {format(new Date(timesheet.periodEnd), "PP")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/30 p-4 rounded-lg border text-center">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Regular</div>
                <div className="text-2xl font-bold">{timesheet.regularHours.toFixed(2)}h</div>
              </div>
              <div className="bg-amber-500/10 p-4 rounded-lg border border-amber-500/20 text-center">
                <div className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Overtime</div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{timesheet.overtimeHours.toFixed(2)}h</div>
              </div>
              <div className="bg-purple-500/10 p-4 rounded-lg border border-purple-500/20 text-center">
                <div className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">Leave</div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{(leaveSummary?.leaveHours ?? 0).toFixed(2)}h</div>
              </div>
              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20 text-center">
                <div className="text-xs font-medium text-primary uppercase tracking-wider mb-1">Total Accounted</div>
                <div className="text-2xl font-bold text-primary">{(leaveSummary?.totalAccountedHours ?? timesheet.totalHours).toFixed(2)}h</div>
              </div>
            </div>
            {leaveSummary?.leaveEntries && leaveSummary.leaveEntries.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Leave in This Period</h4>
                <div className="flex flex-wrap gap-2">
                  {leaveSummary.leaveEntries.map(e => (
                    <span key={e.id} className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                      {format(new Date(e.date + "T00:00:00"), "MMM d")} — {e.leaveType.toUpperCase()} ({e.hours}h)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {timesheet.rejectionNote && (
              <div className="p-4 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200 rounded-md border border-red-200 dark:border-red-900">
                <div className="font-semibold mb-1">Rejection Reason:</div>
                <p>{timesheet.rejectionNote}</p>
              </div>
            )}

            {timesheet.status === "approved" && timesheet.reviewerEmail && (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-900/50 text-sm">
                <div className="font-semibold text-green-800 dark:text-green-300 mb-1">Approved</div>
                <div className="text-green-700 dark:text-green-400">
                  Reviewed by <span className="font-medium">{timesheet.reviewerEmail}</span>
                  {timesheet.reviewedAt && (
                    <span className="ml-1">on {format(new Date(timesheet.reviewedAt), "PPp")}</span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {punches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Punch Entries</CardTitle>
              <CardDescription>Individual clock events for this period</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    {punches.some(p => p.costCode) && <TableHead>Cost Code</TableHead>}
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {punches.map(punch => (
                    <TableRow key={punch.id}>
                      <TableCell className="font-medium">{format(new Date(punch.punchedAt), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-mono text-primary font-bold">{format(new Date(punch.punchedAt), "HH:mm:ss")}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                          punch.type === 'clock_in' ? 'bg-green-100 text-green-800' :
                          punch.type === 'clock_out' ? 'bg-slate-100 text-slate-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {punch.type.replace('_', ' ')}
                        </span>
                      </TableCell>
                      {punches.some(p => p.costCode) && (
                        <TableCell>
                          {punch.costCode ? (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
                              {punch.costCode}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="uppercase text-xs text-muted-foreground">{punch.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {isDraft && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Report Leave</CardTitle>
              <CardDescription>
                Add leave for days within this timesheet period ({format(new Date(timesheet.periodStart), "MMM d")} – {format(new Date(timesheet.periodEnd), "MMM d")})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={leaveForm.date}
                    min={timesheet.periodStart}
                    max={timesheet.periodEnd}
                    onChange={e => setLeaveForm(p => ({ ...p, date: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={leaveForm.leaveType} onValueChange={v => setLeaveForm(p => ({ ...p, leaveType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pto">PTO</SelectItem>
                      <SelectItem value="sick">Sick</SelectItem>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="bereavement">Bereavement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Hours</Label>
                  <Input type="number" min="0.5" max="24" step="0.5" value={leaveForm.hours} onChange={e => setLeaveForm(p => ({ ...p, hours: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Input value={leaveForm.note} onChange={e => setLeaveForm(p => ({ ...p, note: e.target.value }))} placeholder="Optional" />
                </div>
                <Button
                  disabled={createLeave.isPending || !leaveForm.date}
                  onClick={async () => {
                    try {
                      await createLeave.mutateAsync({ data: { employeeId: empId, date: leaveForm.date, leaveType: leaveForm.leaveType, hours: Number(leaveForm.hours), note: leaveForm.note || null } });
                      queryClient.invalidateQueries({ queryKey: getListLeaveEntriesQueryKey({ employeeId: empId }) });
                      queryClient.invalidateQueries({ queryKey: ["timesheet-leave-summary", tsId] });
                      setLeaveForm({ date: "", leaveType: "pto", hours: "8", note: "" });
                      toast.success("Leave entry recorded");
                    } catch (e: any) { toast.error(e?.response?.data?.error || e.message || "Failed to create leave entry"); }
                  }}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" /> Add Leave
                </Button>
              </div>
              {leaveEntries.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Your Leave in This Period</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Note</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaveEntries.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell>{format(new Date(entry.date + "T00:00:00"), "PP")}</TableCell>
                          <TableCell>
                            <span className="px-2 py-1 rounded-full text-xs font-semibold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-400">
                              {entry.leaveType}
                            </span>
                          </TableCell>
                          <TableCell>{entry.hours}h</TableCell>
                          <TableCell className="text-muted-foreground">{entry.note || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isDraft && (
          <Card className={isAttested ? "border-green-200 dark:border-green-900/50" : ""}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4 w-4" />
                Employee Attestation
              </CardTitle>
              <CardDescription>
                Required before submission — DCAA compliance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-md bg-muted/30 border">
                <Checkbox
                  id="attest"
                  checked={isAttested}
                  onCheckedChange={handleAttestationChange}
                  disabled={timesheet.employeeAttested || attestMutation.isPending}
                  className="mt-0.5"
                />
                <Label htmlFor="attest" className="leading-relaxed cursor-pointer">
                  I certify that the hours reported in this timesheet accurately reflect the time I worked during this pay period, and that I have not reported any hours that were not actually worked. I understand that falsification of time records is a violation of federal law.
                </Label>
              </div>

              {isAttested && (
                <Button
                  onClick={handleSubmit}
                  disabled={submitTimesheet.isPending}
                  className="w-full gap-2"
                  size="lg"
                >
                  <CheckCircle className="h-5 w-5" />
                  {submitTimesheet.isPending ? "Submitting…" : "Submit for Review"}
                </Button>
              )}

              {!isAttested && (
                <p className="text-xs text-muted-foreground text-center">
                  You must attest to the accuracy of your timesheet before submitting.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </EmployeeLayout>
  );
}

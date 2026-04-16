import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmployeeLayout } from "@/components/layout/employee-layout";
import { useGetEmployee } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle, Plus, Shield } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type LaborAuthorization = {
  id: number;
  chargeCodeId: number;
  projectId: string | null;
  workOrderId: string | null;
  travelerId: string | null;
  description: string | null;
  authorizedHours: number;
  consumedHours: number;
};

type LaborChargeCode = { id: number; code: string };

type DailyTimesheet = {
  id: number;
  employeeId: number;
  date: string;
  totalHours: number;
  status: string;
  notes: string | null;
  certifiedAt: string | null;
  approvedAt: string | null;
};

type ExtraHoursForm = {
  laborAuthorizationId: string;
  requestedHours: string;
  reason: string;
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 border-green-200">Approved</Badge>;
  if (status === "certified") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Certified</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Draft</Badge>;
}

export default function LaborTimesheets() {
  const { id } = useParams();
  const empId = parseInt(id || "0", 10);
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: employee } = useGetEmployee(empId, { query: { enabled: !!empId } });
  const [createDialog, setCreateDialog] = useState(false);
  const [createDate, setCreateDate] = useState("");
  const [extraHoursDialog, setExtraHoursDialog] = useState(false);
  const [extraHoursForm, setExtraHoursForm] = useState<ExtraHoursForm>({ laborAuthorizationId: "", requestedHours: "", reason: "" });

  const { data: timesheets = [], isLoading } = useQuery<DailyTimesheet[]>({
    queryKey: ["/api/labor/daily-timesheets", empId],
    queryFn: () => apiFetch(`/api/labor/daily-timesheets?employeeId=${empId}`),
  });

  const { data: authorizations = [] } = useQuery<LaborAuthorization[]>({
    queryKey: ["/api/labor/authorizations", "active"],
    queryFn: () => apiFetch("/api/labor/authorizations?status=active"),
    enabled: extraHoursDialog,
  });

  const { data: chargeCodes = [] } = useQuery<LaborChargeCode[]>({
    queryKey: ["/api/labor/charge-codes"],
    queryFn: () => apiFetch("/api/labor/charge-codes?active=true"),
    enabled: extraHoursDialog,
  });

  const codeMap = Object.fromEntries(chargeCodes.map(c => [c.id, c.code]));

  const createMut = useMutation({
    mutationFn: (data: object) => apiFetch("/api/labor/daily-timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/daily-timesheets", empId] }); setCreateDialog(false); setCreateDate(""); toast.success("Timesheet created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const certifyMut = useMutation({
    mutationFn: (tsId: number) => apiFetch(`/api/labor/daily-timesheets/${tsId}/certify`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/daily-timesheets", empId] }); toast.success("Timesheet certified"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveMut = useMutation({
    mutationFn: (tsId: number) => apiFetch(`/api/labor/daily-timesheets/${tsId}/approve`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/daily-timesheets", empId] }); toast.success("Timesheet approved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const extraHoursMut = useMutation({
    mutationFn: (data: object) => apiFetch("/api/labor/authorization-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { setExtraHoursDialog(false); setExtraHoursForm({ laborAuthorizationId: "", requestedHours: "", reason: "" }); toast.success("Extra-hours request submitted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!createDate) { toast.error("Date is required"); return; }
    createMut.mutate({ date: createDate });
  };

  const handleExtraHours = () => {
    if (!extraHoursForm.laborAuthorizationId) { toast.error("Authorization ID is required"); return; }
    if (!extraHoursForm.requestedHours || isNaN(parseFloat(extraHoursForm.requestedHours))) { toast.error("Hours must be a valid number"); return; }
    if (!extraHoursForm.reason.trim()) { toast.error("Reason is required"); return; }
    extraHoursMut.mutate({
      laborAuthorizationId: parseInt(extraHoursForm.laborAuthorizationId, 10),
      requestedHours: parseFloat(extraHoursForm.requestedHours),
      reason: extraHoursForm.reason.trim(),
    });
  };

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
          <h1 className="text-2xl font-bold tracking-tight">Daily Labor Timesheets</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setExtraHoursDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Request Extra Hours
            </Button>
            <Button onClick={() => setCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Timesheet
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Timesheets</CardTitle>
            <CardDescription>Daily labor records. Certify to confirm accuracy, supervisors can approve certified timesheets.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : timesheets.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No daily timesheets found. Create one to get started.</TableCell></TableRow>
                ) : timesheets.map(ts => (
                  <TableRow key={ts.id}>
                    <TableCell className="font-medium">{format(new Date(ts.date + "T00:00:00"), "PP")}</TableCell>
                    <TableCell className="font-semibold">{ts.totalHours.toFixed(2)}h</TableCell>
                    <TableCell>{statusBadge(ts.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{ts.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {ts.status === "draft" && (
                          <Button size="sm" variant="outline" className="gap-1"
                            onClick={() => {
                              if (!confirm("Certify this timesheet? This confirms the hours are accurate.")) return;
                              certifyMut.mutate(ts.id);
                            }}
                            disabled={certifyMut.isPending}
                          >
                            <Shield className="h-3.5 w-3.5" /> Certify
                          </Button>
                        )}
                        {ts.status === "certified" && isAdmin && (
                          <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              if (!confirm("Approve this certified timesheet?")) return;
                              approveMut.mutate(ts.id);
                            }}
                            disabled={approveMut.isPending}
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                        {ts.status === "approved" && (
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" /> Approved
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Create Daily Timesheet</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Date *</Label>
                <Input className="mt-1" type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} max={format(new Date(), "yyyy-MM-dd")} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={extraHoursDialog} onOpenChange={setExtraHoursDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Request Extra Hours</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Submit a request to increase the authorized budget for a labor authorization. A supervisor will review and approve or deny.</p>
              <div>
                <Label>Authorization *</Label>
                {authorizations.length > 0 ? (
                  <Select
                    value={extraHoursForm.laborAuthorizationId || "none"}
                    onValueChange={v => setExtraHoursForm({ ...extraHoursForm, laborAuthorizationId: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select an authorization" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select an authorization…</SelectItem>
                      {authorizations.map(auth => (
                        <SelectItem key={auth.id} value={String(auth.id)}>
                          #{auth.id} — {codeMap[auth.chargeCodeId] ?? `Code #${auth.chargeCodeId}`}
                          {auth.projectId ? ` / ${auth.projectId}` : ""}
                          {auth.workOrderId ? ` / WO:${auth.workOrderId}` : ""}
                          {" "}({auth.consumedHours.toFixed(1)}/{auth.authorizedHours.toFixed(1)}h)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="mt-1"
                    type="number"
                    value={extraHoursForm.laborAuthorizationId}
                    onChange={e => setExtraHoursForm({ ...extraHoursForm, laborAuthorizationId: e.target.value })}
                    placeholder="Authorization ID"
                  />
                )}
              </div>
              <div>
                <Label>Hours Requested *</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={extraHoursForm.requestedHours}
                  onChange={e => setExtraHoursForm({ ...extraHoursForm, requestedHours: e.target.value })}
                  placeholder="e.g. 8"
                />
              </div>
              <div>
                <Label>Reason *</Label>
                <Input
                  className="mt-1"
                  value={extraHoursForm.reason}
                  onChange={e => setExtraHoursForm({ ...extraHoursForm, reason: e.target.value })}
                  placeholder="Why are additional hours needed?"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setExtraHoursDialog(false)}>Cancel</Button>
              <Button onClick={handleExtraHours} disabled={extraHoursMut.isPending}>
                {extraHoursMut.isPending ? "Submitting…" : "Submit Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </EmployeeLayout>
  );
}

import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { EmployeeLayout } from "@/components/layout/employee-layout";
import { useGetEmployee } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Play, Square, Plus } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

type LaborChargeCode = { id: number; code: string; description: string | null };
type LaborAuthorization = {
  id: number;
  chargeCodeId: number;
  projectId: string | null;
  workOrderId: string | null;
  travelerId: string | null;
  description: string | null;
  authorizedHours: number;
  consumedHours: number;
  status: string;
};
type WorkSession = {
  id: number;
  employeeId: number;
  chargeCodeId: number;
  laborAuthorizationId: number | null;
  projectId: string | null;
  workOrderId: string | null;
  travelerId: string | null;
  startedAt: string;
  endedAt: string | null;
  totalHours: number | null;
  status: string;
  notes: string | null;
};

type OpenForm = {
  laborAuthorizationId: string;
  projectId: string;
  workOrderId: string;
  travelerId: string;
  chargeCodeId: string;
  notes: string;
};

const EMPTY_FORM: OpenForm = {
  laborAuthorizationId: "",
  projectId: "",
  workOrderId: "",
  travelerId: "",
  chargeCodeId: "",
  notes: "",
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
  if (status === "open") return <Badge className="bg-green-100 text-green-800 border-green-200 animate-pulse">Open</Badge>;
  if (status === "closed") return <Badge variant="outline" className="text-muted-foreground">Closed</Badge>;
  return <Badge variant="outline" className="text-destructive border-destructive/40">Cancelled</Badge>;
}

export default function LaborSessions() {
  const { id } = useParams();
  const empId = parseInt(id || "0", 10);
  const qc = useQueryClient();

  const { data: employee } = useGetEmployee(empId, { query: { enabled: !!empId } });
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState<OpenForm>(EMPTY_FORM);

  const { data: sessions = [], isLoading } = useQuery<WorkSession[]>({
    queryKey: ["/api/labor/sessions", empId],
    queryFn: () => apiFetch(`/api/labor/sessions?employeeId=${empId}`),
    refetchInterval: 30000,
  });

  const { data: chargeCodes = [] } = useQuery<LaborChargeCode[]>({
    queryKey: ["/api/labor/charge-codes"],
    queryFn: () => apiFetch("/api/labor/charge-codes?active=true"),
  });

  const { data: authorizations = [] } = useQuery<LaborAuthorization[]>({
    queryKey: ["/api/labor/authorizations"],
    queryFn: () => apiFetch("/api/labor/authorizations?status=active"),
  });

  const openMut = useMutation({
    mutationFn: (data: object) => apiFetch("/api/labor/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/labor/sessions"] });
      setOpenDialog(false);
      setForm(EMPTY_FORM);
      toast.success("Work session started");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: (sessionId: number) => apiFetch(`/api/labor/sessions/${sessionId}/close`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/labor/sessions"] });
      toast.success("Session closed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeSession = sessions.find(s => s.status === "open");
  const codeMap = Object.fromEntries(chargeCodes.map(c => [c.id, c.code]));

  const handleOpen = () => {
    const payload: Record<string, unknown> = {
      projectId: form.projectId.trim() || undefined,
      workOrderId: form.workOrderId.trim() || undefined,
      travelerId: form.travelerId.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (form.laborAuthorizationId) payload.laborAuthorizationId = parseInt(form.laborAuthorizationId, 10);
    if (form.chargeCodeId) payload.chargeCodeId = parseInt(form.chargeCodeId, 10);
    openMut.mutate(payload);
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
          <h1 className="text-2xl font-bold tracking-tight">Labor Work Sessions</h1>
          <Button onClick={() => { setForm(EMPTY_FORM); setOpenDialog(true); }} className="gap-2" disabled={!!activeSession}>
            <Play className="h-4 w-4" />
            Start Session
          </Button>
        </div>

        {activeSession && (
          <Card className="border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-300">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Active Session
              </CardTitle>
              <CardDescription>Started {formatDistanceToNow(new Date(activeSession.startedAt), { addSuffix: true })}</CardDescription>
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Charge Code: </span><span className="font-mono font-bold">{codeMap[activeSession.chargeCodeId] ?? activeSession.chargeCodeId}</span></div>
                {activeSession.projectId && <div><span className="text-muted-foreground">Project: </span>{activeSession.projectId}</div>}
                {activeSession.workOrderId && <div><span className="text-muted-foreground">Work Order: </span>{activeSession.workOrderId}</div>}
                {activeSession.travelerId && <div><span className="text-muted-foreground">Traveler: </span>{activeSession.travelerId}</div>}
                <div><span className="text-muted-foreground">Started: </span>{format(new Date(activeSession.startedAt), "PPp")}</div>
                {activeSession.notes && <div><span className="text-muted-foreground">Notes: </span>{activeSession.notes}</div>}
              </div>
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => closeMut.mutate(activeSession.id)}
                disabled={closeMut.isPending}
              >
                <Square className="h-4 w-4" />
                {closeMut.isPending ? "Closing…" : "Close Session"}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Session History</CardTitle>
            <CardDescription>All work sessions for this employee</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge Code</TableHead>
                  <TableHead>Project / WO / Traveler</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Ended</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : sessions.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No work sessions found.</TableCell></TableRow>
                ) : sessions.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono font-bold">{codeMap[s.chargeCodeId] ?? s.chargeCodeId}</TableCell>
                    <TableCell>
                      <div className="text-sm space-y-0.5">
                        {s.projectId && <div><span className="text-muted-foreground text-xs">Project: </span>{s.projectId}</div>}
                        {s.workOrderId && <div><span className="text-muted-foreground text-xs">WO: </span>{s.workOrderId}</div>}
                        {s.travelerId && <div><span className="text-muted-foreground text-xs">Traveler: </span>{s.travelerId}</div>}
                        {!s.projectId && !s.workOrderId && !s.travelerId && <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(s.startedAt), "PP p")}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.endedAt ? format(new Date(s.endedAt), "PP p") : "—"}</TableCell>
                    <TableCell className="font-semibold">{s.totalHours != null ? `${s.totalHours.toFixed(2)}h` : "—"}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Start New Work Session</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Authorization (optional)</Label>
                <Select value={form.laborAuthorizationId || "auto"} onValueChange={v => setForm({ ...form, laborAuthorizationId: v === "auto" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Auto-resolve from context" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-resolve</SelectItem>
                    {authorizations.map(auth => (
                      <SelectItem key={auth.id} value={String(auth.id)}>
                        #{auth.id} — {codeMap[auth.chargeCodeId] ?? auth.chargeCodeId}
                        {auth.projectId ? ` / ${auth.projectId}` : ""}
                        {auth.workOrderId ? ` / WO:${auth.workOrderId}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Select an authorization or fill in the context fields below to auto-resolve.</p>
              </div>
              <div>
                <Label>Manual Charge Code Override (optional)</Label>
                <Select value={form.chargeCodeId || "auto"} onValueChange={v => setForm({ ...form, chargeCodeId: v === "auto" ? "" : v })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Auto-resolved from authorization" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-resolve</SelectItem>
                    {chargeCodes.map(cc => (
                      <SelectItem key={cc.id} value={String(cc.id)}>
                        {cc.code}{cc.description ? ` — ${cc.description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Project ID</Label>
                  <Input className="mt-1" value={form.projectId} onChange={e => setForm({ ...form, projectId: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label>Work Order</Label>
                  <Input className="mt-1" value={form.workOrderId} onChange={e => setForm({ ...form, workOrderId: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <Label>Traveler</Label>
                  <Input className="mt-1" value={form.travelerId} onChange={e => setForm({ ...form, travelerId: e.target.value })} placeholder="Optional" />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input className="mt-1" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
              <Button onClick={handleOpen} disabled={openMut.isPending} className="gap-2">
                <Play className="h-4 w-4" />
                {openMut.isPending ? "Starting…" : "Start Session"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </EmployeeLayout>
  );
}

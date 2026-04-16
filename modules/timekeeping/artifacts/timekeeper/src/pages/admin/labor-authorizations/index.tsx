import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type LaborChargeCode = { id: number; code: string; description: string | null };
type LaborAuthorization = {
  id: number;
  chargeCodeId: number;
  projectId: string | null;
  workOrderId: string | null;
  travelerId: string | null;
  description: string | null;
  authorizedHours: number;
  approvedExtraHours: number;
  consumedHours: number;
  status: string;
};

type FormState = {
  id?: number;
  chargeCodeId: string;
  projectId: string;
  workOrderId: string;
  travelerId: string;
  description: string;
  authorizedHours: string;
  status: string;
};

const EMPTY_FORM: FormState = {
  chargeCodeId: "",
  projectId: "",
  workOrderId: "",
  travelerId: "",
  description: "",
  authorizedHours: "",
  status: "active",
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
  if (status === "active") return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
  if (status === "closed") return <Badge variant="outline" className="text-muted-foreground">Closed</Badge>;
  return <Badge variant="outline" className="text-destructive border-destructive/40">Cancelled</Badge>;
}

function budgetBar(consumed: number, authorized: number, extra: number) {
  const total = authorized + extra;
  const pct = total > 0 ? Math.min(100, (consumed / total) * 100) : 0;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="w-32">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{consumed.toFixed(1)}h</span>
        <span>{total.toFixed(1)}h</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function LaborAuthorizations() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const isEditing = form.id != null;

  const { data: authorizations = [], isLoading } = useQuery<LaborAuthorization[]>({
    queryKey: ["/api/labor/authorizations"],
    queryFn: () => apiFetch("/api/labor/authorizations"),
  });

  const { data: chargeCodes = [] } = useQuery<LaborChargeCode[]>({
    queryKey: ["/api/labor/charge-codes"],
    queryFn: () => apiFetch("/api/labor/charge-codes?active=true"),
  });

  const createMut = useMutation({
    mutationFn: (data: object) => apiFetch("/api/labor/authorizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/authorizations"] }); setDialogOpen(false); toast.success("Authorization created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiFetch(`/api/labor/authorizations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/authorizations"] }); setDialogOpen(false); toast.success("Authorization updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/labor/authorizations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/authorizations"] }); toast.success("Authorization deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (auth: LaborAuthorization) => {
    setForm({
      id: auth.id,
      chargeCodeId: String(auth.chargeCodeId),
      projectId: auth.projectId ?? "",
      workOrderId: auth.workOrderId ?? "",
      travelerId: auth.travelerId ?? "",
      description: auth.description ?? "",
      authorizedHours: String(auth.authorizedHours),
      status: auth.status,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.chargeCodeId) { toast.error("Charge code is required"); return; }
    if (!form.authorizedHours || isNaN(parseFloat(form.authorizedHours))) { toast.error("Authorized hours must be a valid number"); return; }
    const payload = {
      chargeCodeId: parseInt(form.chargeCodeId, 10),
      projectId: form.projectId.trim() || undefined,
      workOrderId: form.workOrderId.trim() || undefined,
      travelerId: form.travelerId.trim() || undefined,
      description: form.description.trim() || undefined,
      authorizedHours: parseFloat(form.authorizedHours),
      status: form.status,
    };
    if (isEditing) {
      updateMut.mutate({ id: form.id!, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this authorization?")) return;
    deleteMut.mutate(id);
  };

  const codeMap = Object.fromEntries(chargeCodes.map(c => [c.id, c.code]));
  const saving = createMut.isPending || updateMut.isPending;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Labor Authorizations</h1>
          <p className="text-muted-foreground mt-1">Budget envelopes controlling hours per project, work order, or traveler</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          New Authorization
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Charge Code</TableHead>
                <TableHead>Project / WO / Traveler</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Budget Usage</TableHead>
                <TableHead>Extra Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : authorizations.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No labor authorizations configured.</TableCell></TableRow>
              ) : authorizations.map(auth => (
                <TableRow key={auth.id}>
                  <TableCell className="font-mono font-bold">{codeMap[auth.chargeCodeId] ?? auth.chargeCodeId}</TableCell>
                  <TableCell>
                    <div className="text-sm space-y-0.5">
                      {auth.projectId && <div><span className="text-muted-foreground text-xs">Project: </span>{auth.projectId}</div>}
                      {auth.workOrderId && <div><span className="text-muted-foreground text-xs">WO: </span>{auth.workOrderId}</div>}
                      {auth.travelerId && <div><span className="text-muted-foreground text-xs">Traveler: </span>{auth.travelerId}</div>}
                      {!auth.projectId && !auth.workOrderId && !auth.travelerId && <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{auth.description || "—"}</TableCell>
                  <TableCell>{budgetBar(auth.consumedHours, auth.authorizedHours, auth.approvedExtraHours)}</TableCell>
                  <TableCell>
                    {auth.approvedExtraHours > 0
                      ? <span className="text-amber-600 font-medium">+{auth.approvedExtraHours.toFixed(1)}h</span>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{statusBadge(auth.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(auth)}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(auth.id)} disabled={deleteMut.isPending}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Authorization" : "New Labor Authorization"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Charge Code *</Label>
              <Select value={form.chargeCodeId} onValueChange={v => setForm({ ...form, chargeCodeId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select a charge code" /></SelectTrigger>
                <SelectContent>
                  {chargeCodes.map(cc => (
                    <SelectItem key={cc.id} value={String(cc.id)}>
                      {cc.code}{cc.description ? ` — ${cc.description}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Authorized Hours *</Label>
              <Input className="mt-1" type="number" step="0.5" min="0.5" value={form.authorizedHours} onChange={e => setForm({ ...form, authorizedHours: e.target.value })} placeholder="e.g. 40" />
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
              <Label>Description</Label>
              <Input className="mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
            </div>
            {isEditing && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

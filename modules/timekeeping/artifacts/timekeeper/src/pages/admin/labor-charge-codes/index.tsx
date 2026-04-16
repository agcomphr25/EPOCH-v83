import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type LaborChargeCode = {
  id: number;
  code: string;
  description: string | null;
  type: string;
  department: string | null;
  requiresApproval: boolean;
  maxHoursPerDay: number | null;
  billable: boolean;
  wadChargeCode: string | null;
  wadDepartment: string | null;
  active: boolean;
};

type FormState = {
  id?: number;
  code: string;
  description: string;
  type: string;
  department: string;
  requiresApproval: boolean;
  maxHoursPerDay: string;
  billable: boolean;
  wadChargeCode: string;
  wadDepartment: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  code: "",
  description: "",
  type: "direct",
  department: "",
  requiresApproval: false,
  maxHoursPerDay: "",
  billable: true,
  wadChargeCode: "",
  wadDepartment: "",
  active: true,
};

const TYPE_LABELS: Record<string, string> = {
  direct: "Direct",
  indirect: "Indirect",
  overhead: "Overhead",
  g_and_a: "G&A",
};

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export default function LaborChargeCodes() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const isEditing = form.id != null;

  const { data: codes = [], isLoading } = useQuery<LaborChargeCode[]>({
    queryKey: ["/api/labor/charge-codes"],
    queryFn: () => apiFetch("/api/labor/charge-codes"),
  });

  const createMut = useMutation({
    mutationFn: (data: object) => apiFetch("/api/labor/charge-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/charge-codes"] }); setDialogOpen(false); toast.success("Charge code created"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) => apiFetch(`/api/labor/charge-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/charge-codes"] }); setDialogOpen(false); toast.success("Charge code updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/labor/charge-codes/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/labor/charge-codes"] }); toast.success("Charge code deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (cc: LaborChargeCode) => {
    setForm({
      id: cc.id,
      code: cc.code,
      description: cc.description ?? "",
      type: cc.type,
      department: cc.department ?? "",
      requiresApproval: cc.requiresApproval,
      maxHoursPerDay: cc.maxHoursPerDay != null ? String(cc.maxHoursPerDay) : "",
      billable: cc.billable,
      wadChargeCode: cc.wadChargeCode ?? "",
      wadDepartment: cc.wadDepartment ?? "",
      active: cc.active,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) { toast.error("Code is required"); return; }
    const payload = {
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      department: form.department.trim() || undefined,
      requiresApproval: form.requiresApproval,
      maxHoursPerDay: form.maxHoursPerDay ? parseFloat(form.maxHoursPerDay) : undefined,
      billable: form.billable,
      wadChargeCode: form.wadChargeCode.trim() || undefined,
      wadDepartment: form.wadDepartment.trim() || undefined,
      active: form.active,
    };
    if (isEditing) {
      updateMut.mutate({ id: form.id!, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this labor charge code?")) return;
    deleteMut.mutate(id);
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Labor Charge Codes</h1>
          <p className="text-muted-foreground mt-1">Manage labor charge codes with type, approval, and billing settings</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Code
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Billable</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Max Hrs/Day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : codes.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No labor charge codes configured.</TableCell></TableRow>
              ) : codes.map(cc => (
                <TableRow key={cc.id}>
                  <TableCell className="font-mono font-bold">{cc.code}</TableCell>
                  <TableCell className="text-muted-foreground">{cc.description || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TYPE_LABELS[cc.type] ?? cc.type}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{cc.department || "—"}</TableCell>
                  <TableCell>
                    {cc.billable
                      ? <Badge className="bg-blue-100 text-blue-800 border-blue-200">Billable</Badge>
                      : <Badge variant="outline" className="text-muted-foreground">Non-Bill</Badge>}
                  </TableCell>
                  <TableCell>
                    {cc.requiresApproval
                      ? <Badge className="bg-amber-100 text-amber-800 border-amber-200">Required</Badge>
                      : <span className="text-muted-foreground text-sm">None</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{cc.maxHoursPerDay != null ? `${cc.maxHoursPerDay}h` : "—"}</TableCell>
                  <TableCell>
                    {cc.active
                      ? <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                      : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cc)}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cc.id)} disabled={deleteMut.isPending}>
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
            <DialogTitle>{isEditing ? "Edit Labor Charge Code" : "Add Labor Charge Code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code *</Label>
                <Input className="mt-1" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. DIR-001" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct</SelectItem>
                    <SelectItem value="indirect">Indirect</SelectItem>
                    <SelectItem value="overhead">Overhead</SelectItem>
                    <SelectItem value="g_and_a">G&A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input className="mt-1" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Department</Label>
                <Input className="mt-1" value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>Max Hours/Day</Label>
                <Input className="mt-1" type="number" step="0.5" min="0" value={form.maxHoursPerDay} onChange={e => setForm({ ...form, maxHoursPerDay: e.target.value })} placeholder="No limit" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>WAD Charge Code</Label>
                <Input className="mt-1" value={form.wadChargeCode} onChange={e => setForm({ ...form, wadChargeCode: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>WAD Department</Label>
                <Input className="mt-1" value={form.wadDepartment} onChange={e => setForm({ ...form, wadDepartment: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })} className="rounded border-gray-300" />
                <span className="text-sm font-medium">Billable</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.requiresApproval} onChange={e => setForm({ ...form, requiresApproval: e.target.checked })} className="rounded border-gray-300" />
                <span className="text-sm font-medium">Requires approval to charge</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="rounded border-gray-300" />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
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

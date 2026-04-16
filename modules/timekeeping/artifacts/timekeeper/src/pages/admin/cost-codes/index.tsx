import { useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useListCostCodes, useCreateCostCode, useUpdateCostCode, useDeleteCostCode } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type FormState = {
  id?: number;
  code: string;
  description: string;
  active: boolean;
};

const EMPTY_FORM: FormState = { code: "", description: "", active: true };

export default function AdminCostCodes() {
  const queryClient = useQueryClient();
  const { data: costCodes = [], isLoading } = useListCostCodes();
  const createMut = useCreateCostCode();
  const updateMut = useUpdateCostCode();
  const deleteMut = useDeleteCostCode();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const isEditing = form.id != null;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (cc: typeof costCodes[0]) => {
    setForm({
      id: cc.id,
      code: cc.code,
      description: cc.description ?? "",
      active: cc.active,
    });
    setDialogOpen(true);
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/cost-codes"] });
    queryClient.invalidateQueries({ queryKey: ["kiosk-cost-codes"] });
  };

  const handleSave = async () => {
    if (!form.code.trim()) {
      toast.error("Code is required");
      return;
    }
    try {
      if (isEditing) {
        await updateMut.mutateAsync({
          id: form.id!,
          data: { code: form.code, description: form.description || undefined, active: form.active },
        });
        toast.success("Cost code updated");
      } else {
        await createMut.mutateAsync({
          data: { code: form.code, description: form.description || undefined, active: form.active },
        });
        toast.success("Cost code created");
      }
      setDialogOpen(false);
      invalidate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this cost code? Existing punches will keep the code text.")) return;
    try {
      await deleteMut.mutateAsync({ id });
      toast.success("Cost code deleted");
      invalidate();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cost Codes</h1>
          <p className="text-muted-foreground mt-1">Manage labor distribution / cost objective codes</p>
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
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : costCodes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <p className="text-muted-foreground">No cost codes configured.</p>
                    <p className="text-xs text-muted-foreground mt-1">Cost code selection will be hidden from kiosk and employee views until codes are added.</p>
                  </TableCell>
                </TableRow>
              ) : costCodes.map(cc => (
                <TableRow key={cc.id}>
                  <TableCell className="font-mono font-bold">{cc.code}</TableCell>
                  <TableCell className="text-muted-foreground">{cc.description || "—"}</TableCell>
                  <TableCell>
                    {cc.active ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(cc)}>
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(cc.id)}>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Cost Code" : "Add Cost Code"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. PROJ-1234"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

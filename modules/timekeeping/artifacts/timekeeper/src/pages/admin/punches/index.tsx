import { useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useListPunches, useListEmployees, useUpdatePunch, useListCostCodes } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileEdit, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type EditingPunch = {
  id: number;
  punchedAt: string;
  note: string;
  costCode: string;
  editNote: string;
};

export default function AdminPunches() {
  const queryClient = useQueryClient();
  const { data: punches = [], isLoading: loadingPunches } = useListPunches();
  const { data: employees = [] } = useListEmployees();
  const { data: costCodes = [] } = useListCostCodes();
  const updatePunch = useUpdatePunch();
  const [editing, setEditing] = useState<EditingPunch | null>(null);

  const hasCostCodes = costCodes.length > 0;
  const showCostCodeColumn = hasCostCodes || punches.some(p => p.costCode);

  const getEmployeeName = (id: number) => {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : `ID: ${id}`;
  };

  const openEdit = (punch: typeof punches[0]) => {
    setEditing({
      id: punch.id,
      punchedAt: format(new Date(punch.punchedAt), "yyyy-MM-dd'T'HH:mm:ss"),
      note: punch.note ?? "",
      costCode: punch.costCode ?? "",
      editNote: "",
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.editNote.trim()) {
      toast.error("Edit note is required for audit trail");
      return;
    }
    try {
      await updatePunch.mutateAsync({
        id: editing.id,
        data: {
          punchedAt: new Date(editing.punchedAt).toISOString(),
          note: editing.note || undefined,
          editNote: editing.editNote,
          costCode: editing.costCode || null,
        },
      });
      toast.success("Punch updated");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["/api/punches"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update punch");
    }
  };

  const colSpan = showCostCodeColumn ? 7 : 6;

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Punch Log</h1>
        <Button variant="outline">Export Log</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Action</TableHead>
                {showCostCodeColumn && <TableHead>Cost Code</TableHead>}
                <TableHead>Source</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingPunches ? (
                <TableRow><TableCell colSpan={colSpan} className="text-center py-8">Loading punches...</TableCell></TableRow>
              ) : punches.length === 0 ? (
                <TableRow><TableCell colSpan={colSpan} className="text-center py-8">No punches recorded.</TableCell></TableRow>
              ) : punches.map(punch => (
                <TableRow key={punch.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <div className="text-sm">{format(new Date(punch.punchedAt), "MMM d, yyyy")}</div>
                    <div className="font-bold text-primary">{format(new Date(punch.punchedAt), "HH:mm:ss")}</div>
                  </TableCell>
                  <TableCell>{getEmployeeName(punch.employeeId)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                      punch.type === 'clock_in' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      punch.type === 'clock_out' ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' :
                      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {punch.type.replace('_', ' ')}
                    </span>
                  </TableCell>
                  {showCostCodeColumn && (
                    <TableCell>
                      {punch.costCode ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                          {punch.costCode}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="uppercase text-xs font-medium text-muted-foreground">{punch.source}</span>
                      {punch.isEdited && <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-500 text-amber-600">EDITED</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {punch.note || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(punch)}>
                      <FileEdit className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Punch</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Punch Time</Label>
                <Input
                  type="datetime-local"
                  value={editing.punchedAt}
                  onChange={(e) => setEditing({ ...editing, punchedAt: e.target.value })}
                  step="1"
                />
              </div>
              {hasCostCodes && (
                <div>
                  <Label>Cost Code</Label>
                  <div className="relative mt-1">
                    <select
                      value={editing.costCode}
                      onChange={(e) => setEditing({ ...editing, costCode: e.target.value })}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">No cost code</option>
                      {costCodes.map((cc) => (
                        <option key={cc.id} value={cc.code}>
                          {cc.code}{cc.description ? ` — ${cc.description}` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              )}
              <div>
                <Label>Note</Label>
                <Input
                  value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                  placeholder="Optional note"
                />
              </div>
              <div>
                <Label>Edit Reason (required)</Label>
                <Textarea
                  value={editing.editNote}
                  onChange={(e) => setEditing({ ...editing, editNote: e.target.value })}
                  placeholder="Why is this punch being edited?"
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updatePunch.isPending}>
              {updatePunch.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Plus, Edit, Trash2, CheckCircle2, Circle, Calendar } from "lucide-react";

type Employee = {
  id: number;
  name: string;
  jobTitle: string | null;
  department: string | null;
};

type TrainingModule = {
  id: number;
  title: string;
};

type TrainingMatrixEntry = {
  id: number;
  employeeId: number | null;
  employeeName: string | null;
  jobTitle: string | null;
  department: string | null;
  trainingName: string;
  lastCompleted: string | null;
  nextDue: string | null;
  status: string;
  notes: string | null;
};

type FormData = {
  employeeId?: number;
  employeeName?: string;
  jobTitle?: string;
  department?: string;
  trainingName: string;
  lastCompleted?: string;
  nextDue?: string;
  status: string;
  notes?: string;
};

export default function TrainingMatrixManage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TrainingMatrixEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [formData, setFormData] = useState<FormData>({
    trainingName: "",
    status: "PENDING",
  });

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  // Fetch training modules
  const { data: modules = [] } = useQuery<TrainingModule[]>({
    queryKey: ["/api/training/modules"],
  });

  // Fetch training matrix
  const { data: matrixData = [], isLoading } = useQuery<TrainingMatrixEntry[]>({
    queryKey: ["/api/training/matrix"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return apiRequest("/api/training/matrix", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/matrix"] });
      toast({
        title: "Success",
        description: "Training assignment added successfully",
      });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create training assignment",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<FormData> }) => {
      return apiRequest(`/api/training/matrix/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/matrix"] });
      toast({
        title: "Success",
        description: "Training assignment updated successfully",
      });
      setIsDialogOpen(false);
      setEditingEntry(null);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update training assignment",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/training/matrix/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/matrix"] });
      toast({
        title: "Success",
        description: "Training assignment deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete training assignment",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      trainingName: "",
      status: "PENDING",
    });
    setEditingEntry(null);
  };

  const handleOpenDialog = (entry?: TrainingMatrixEntry) => {
    if (entry) {
      setEditingEntry(entry);
      setFormData({
        employeeId: entry.employeeId || undefined,
        employeeName: entry.employeeName ?? undefined,
        jobTitle: entry.jobTitle ?? undefined,
        department: entry.department ?? undefined,
        trainingName: entry.trainingName,
        lastCompleted: entry.lastCompleted ? new Date(entry.lastCompleted).toISOString().split('T')[0] : undefined,
        nextDue: entry.nextDue ? new Date(entry.nextDue).toISOString().split('T')[0] : undefined,
        status: entry.status,
        notes: entry.notes ?? undefined,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.trainingName) {
      toast({
        title: "Validation Error",
        description: "Please select a training module",
        variant: "destructive",
      });
      return;
    }

    // If employee ID is selected, get employee details
    if (formData.employeeId) {
      const employee = employees.find(e => e.id === formData.employeeId);
      if (employee) {
        formData.employeeName = employee.name;
        formData.jobTitle = employee.jobTitle ?? undefined;
        formData.department = employee.department ?? undefined;
      }
    }

    if (editingEntry) {
      updateMutation.mutate({ id: editingEntry.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (entry: TrainingMatrixEntry) => {
    if (confirm(`Are you sure you want to delete this training assignment for ${entry.employeeName}?`)) {
      deleteMutation.mutate(entry.id);
    }
  };

  const filteredMatrix = matrixData.filter(entry =>
    ((entry.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.trainingName.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Training Matrix Management</h1>
          <p className="text-muted-foreground">Assign trainings to employees and track completion</p>
        </div>
        <Button onClick={() => handleOpenDialog()} data-testid="button-add-assignment">
          <Plus className="h-4 w-4 mr-2" />
          Add Assignment
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Training Assignments</CardTitle>
          <CardDescription>
            Manage employee training assignments and completion status
          </CardDescription>
          <Input
            placeholder="Search by employee or training..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
            data-testid="input-search"
          />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : filteredMatrix.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No training assignments found. Click "Add Assignment" to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Completed</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatrix.map((entry) => (
                  <TableRow key={entry.id} data-testid={`row-assignment-${entry.id}`}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{entry.employeeName}</span>
                        {entry.jobTitle && (
                          <span className="text-xs text-muted-foreground">{entry.jobTitle}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{entry.trainingName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={entry.status === 'COMPLETED' ? 'default' : entry.status === 'PENDING' ? 'secondary' : 'destructive'}
                        data-testid={`badge-status-${entry.id}`}
                      >
                        {entry.status === 'COMPLETED' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {entry.status === 'PENDING' && <Circle className="h-3 w-3 mr-1" />}
                        {entry.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(entry.lastCompleted)}</TableCell>
                    <TableCell>{formatDate(entry.nextDue)}</TableCell>
                    <TableCell className="max-w-xs truncate">{entry.notes || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(entry)}
                          data-testid={`button-edit-${entry.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(entry)}
                          data-testid={`button-delete-${entry.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-assignment">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Edit" : "Add"} Training Assignment</DialogTitle>
            <DialogDescription>
              {editingEntry ? "Update" : "Create"} a training assignment for an employee
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employee" className="text-right">
                Employee
              </Label>
              <Select
                value={formData.employeeId?.toString()}
                onValueChange={(value) => setFormData({ ...formData, employeeId: parseInt(value) })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-employee">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id.toString()}>
                      {emp.name} {emp.jobTitle && `- ${emp.jobTitle}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="training" className="text-right">
                Training *
              </Label>
              <Select
                value={formData.trainingName}
                onValueChange={(value) => setFormData({ ...formData, trainingName: value })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-training">
                  <SelectValue placeholder="Select training" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((mod) => (
                    <SelectItem key={mod.id} value={mod.title}>
                      {mod.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lastCompleted" className="text-right">
                Last Completed
              </Label>
              <Input
                id="lastCompleted"
                type="date"
                className="col-span-3"
                value={formData.lastCompleted || ""}
                onChange={(e) => setFormData({ ...formData, lastCompleted: e.target.value })}
                data-testid="input-last-completed"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nextDue" className="text-right">
                Next Due
              </Label>
              <Input
                id="nextDue"
                type="date"
                className="col-span-3"
                value={formData.nextDue || ""}
                onChange={(e) => setFormData({ ...formData, nextDue: e.target.value })}
                data-testid="input-next-due"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Notes
              </Label>
              <Textarea
                id="notes"
                className="col-span-3"
                value={formData.notes || ""}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any notes about this training..."
                data-testid="textarea-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingEntry
                ? "Update"
                : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

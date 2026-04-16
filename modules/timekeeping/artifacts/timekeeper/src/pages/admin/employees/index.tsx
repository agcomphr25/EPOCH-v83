import { AdminLayout } from "@/components/layout/admin-layout";
import { useListEmployees, useUpdateEmployeeStatus, useCreateEmployee, getListEmployeesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Search, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AdminEmployees() {
  const [search, setSearch] = useState("");
  const { data: employees = [], isLoading } = useListEmployees();
  const updateStatus = useUpdateEmployeeStatus();
  const createEmployee = useCreateEmployee();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  const filteredEmployees = employees.filter(emp => 
    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    emp.email.toLowerCase().includes(search.toLowerCase()) ||
    emp.department?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleStatus = async (id: number, currentStatus: string) => {
    try {
      await updateStatus.mutateAsync({
        id,
        data: { status: currentStatus === 'active' ? 'inactive' : 'active' }
      });
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      toast.success("Employee status updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update status");
    }
  };

  const handleCreate = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    try {
      await createEmployee.mutateAsync({
        data: formData
      });
      queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
      toast.success("Employee created successfully");
      setAddOpen(false);
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to create employee");
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>Create a new employee profile in the system.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>First Name</Label>
                <Input value={formData.firstName} onChange={e => setFormData(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Last Name</Label>
                <Input value={formData.lastName} onChange={e => setFormData(f => ({ ...f, lastName: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createEmployee.isPending}>Create Employee</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Department / Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading employees...</TableCell></TableRow>
              ) : filteredEmployees.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No employees found.</TableCell></TableRow>
              ) : (
                filteredEmployees.map(emp => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      {emp.firstName} {emp.lastName}
                      <div className="text-xs text-muted-foreground font-normal">{emp.employeeNumber || 'No ID'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{emp.email}</div>
                      <div className="text-xs text-muted-foreground">{emp.phone || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{emp.department || '-'}</div>
                      <div className="text-xs text-muted-foreground">{emp.jobTitle || '-'}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                        emp.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {emp.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/employees/${emp.id}`}>View Profile</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => toggleStatus(emp.id, emp.status)}>
                            Mark as {emp.status === 'active' ? 'Inactive' : 'Active'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  );
}

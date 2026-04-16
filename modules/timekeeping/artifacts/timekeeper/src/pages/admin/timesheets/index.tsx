import { AdminLayout } from "@/components/layout/admin-layout";
import { useListTimesheets, useListEmployees } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export default function AdminTimesheets() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Need to pass appropriate param based on string
  const getStatusParam = () => {
    if (statusFilter === "all") return undefined;
    return statusFilter as any;
  };

  const { data: timesheets = [], isLoading } = useListTimesheets({ status: getStatusParam() });
  const { data: employees = [] } = useListEmployees();

  const getEmployeeName = (id: number) => {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : `ID: ${id}`;
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Timesheets</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Timesheets</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Overtime</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading timesheets...</TableCell></TableRow>
              ) : timesheets.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No timesheets found.</TableCell></TableRow>
              ) : (
                timesheets.map(ts => (
                  <TableRow key={ts.id}>
                    <TableCell className="font-medium">{getEmployeeName(ts.employeeId)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(ts.periodStart), "MMM d")} - {format(new Date(ts.periodEnd), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right font-medium">{ts.totalHours.toFixed(2)}h</TableCell>
                    <TableCell className="text-right text-amber-600 dark:text-amber-400">{ts.overtimeHours > 0 ? `${ts.overtimeHours.toFixed(2)}h` : '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                        ts.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' :
                        ts.status === 'submitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400' :
                        ts.status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400' :
                        'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {ts.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/timesheets/${ts.id}`}>
                        <Button variant={ts.status === 'submitted' ? 'default' : 'ghost'} size="sm">
                          {ts.status === 'submitted' ? 'Review' : 'View'}
                        </Button>
                      </Link>
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

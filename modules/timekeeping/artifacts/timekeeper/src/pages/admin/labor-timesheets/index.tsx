import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/admin-layout";
import { useListEmployees } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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

export default function AdminLaborTimesheets() {
  const qc = useQueryClient();

  const [dateFilter, setDateFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: employees = [] } = useListEmployees();

  const queryParams = new URLSearchParams();
  if (dateFilter) queryParams.set("date", dateFilter);
  if (employeeFilter !== "all") queryParams.set("employeeId", employeeFilter);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  const qs = queryParams.toString();

  const { data: timesheets = [], isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<DailyTimesheet[]>({
    queryKey: ["/api/labor/daily-timesheets", "admin", dateFilter, employeeFilter, statusFilter],
    queryFn: () => apiFetch(`/api/labor/daily-timesheets${qs ? `?${qs}` : ""}`),
    refetchInterval: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: (tsId: number) => apiFetch(`/api/labor/daily-timesheets/${tsId}/approve`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/labor/daily-timesheets", "admin"] });
      toast.success("Timesheet approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function employeeName(id: number) {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : `Employee #${id}`;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Labor Timesheets</h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and approve daily labor timesheets across all employees.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle>Filters</CardTitle>
            <CardDescription>Narrow down timesheets by date, employee, or approval status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Date</span>
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="w-40"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Employee</span>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All employees</SelectItem>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={String(emp.id)}>
                        {emp.firstName} {emp.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="certified">Certified</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(dateFilter || employeeFilter !== "all" || statusFilter !== "all") && (
                <div className="flex flex-col gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setDateFilter(""); setEmployeeFilter("all"); setStatusFilter("all"); }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>All Timesheets</CardTitle>
                <CardDescription>
                  {isLoading
                    ? "Loading…"
                    : `${timesheets.length} timesheet${timesheets.length === 1 ? "" : "s"} found`}
                  {!isLoading && dataUpdatedAt > 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      · Updated {format(new Date(dataUpdatedAt), "h:mm:ss a")}
                    </span>
                  )}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="shrink-0 gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      Loading timesheets…
                    </TableCell>
                  </TableRow>
                ) : timesheets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      No timesheets match the current filters.
                    </TableCell>
                  </TableRow>
                ) : timesheets.map(ts => (
                  <TableRow key={ts.id}>
                    <TableCell className="font-medium">{employeeName(ts.employeeId)}</TableCell>
                    <TableCell>{format(new Date(ts.date + "T00:00:00"), "PP")}</TableCell>
                    <TableCell className="font-semibold">{ts.totalHours.toFixed(2)}h</TableCell>
                    <TableCell>{statusBadge(ts.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{ts.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      {ts.status === "certified" && (
                        <Button
                          size="sm"
                          className="gap-1 bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            if (!confirm(`Approve this timesheet for ${employeeName(ts.employeeId)}?`)) return;
                            approveMut.mutate(ts.id);
                          }}
                          disabled={approveMut.isPending}
                        >
                          <CheckCircle className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      {ts.status === "approved" && (
                        <span className="text-xs text-green-600 font-medium flex items-center justify-end gap-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Approved
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

import { AdminLayout } from "@/components/layout/admin-layout";
import { useListTimesheets, useListEmployees } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCurrentBiweeklyPeriod(): { start: string; end: string } {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const thisMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysToMonday);

  const refMonday = new Date(2026, 0, 5);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceRef = Math.round((thisMonday.getTime() - refMonday.getTime()) / msPerDay);
  const weeksSinceRef = Math.floor(daysSinceRef / 7);
  const periodWeekOffset = weeksSinceRef % 2 === 0 ? 0 : -7;

  const periodStart = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + periodWeekOffset);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate() + 13);

  return {
    start: toLocalDateString(periodStart),
    end: toLocalDateString(periodEnd),
  };
}

export default function AdminTimesheets() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [periodStart, setPeriodStart] = useState(() => getCurrentBiweeklyPeriod().start);
  const [periodEnd, setPeriodEnd] = useState(() => getCurrentBiweeklyPeriod().end);

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

  const handleExport = async () => {
    if (!periodStart || !periodEnd || isExporting) return;
    setIsExporting(true);
    try {
      const url = `/api/timekeeping/admin/export/gusto?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`;
      const response = await fetch(url);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error ?? "Export failed");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `gusto-export-${periodStart}-to-${periodEnd}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      setExportOpen(false);
    } finally {
      setIsExporting(false);
    }
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
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4 mr-2" />
            Export Approved Hours (Gusto)
          </Button>
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

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Approved Hours (Gusto)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Choose the pay period date range. Only approved timesheets fully within this range will be included.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="periodStart">Pay Period Start</Label>
                <Input
                  id="periodStart"
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="periodEnd">Pay Period End</Label>
                <Input
                  id="periodEnd"
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)} disabled={isExporting}>Cancel</Button>
            <Button onClick={handleExport} disabled={!periodStart || !periodEnd || isExporting}>
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {isExporting ? "Exporting..." : "Download CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

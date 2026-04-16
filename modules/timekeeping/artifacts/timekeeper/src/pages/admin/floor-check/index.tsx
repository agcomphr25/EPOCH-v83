import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetClockedInEmployees } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw, Users, Clock, Coffee } from "lucide-react";
import { format } from "date-fns";

export default function AdminFloorCheck() {
  const { data: clockedIn = [], isLoading, refetch } = useGetClockedInEmployees();

  const working = clockedIn.filter((e) => e.status === "clocked_in");
  const onBreak = clockedIn.filter((e) => e.status === "on_break");

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Floor Check</h1>
            <p className="text-muted-foreground">
              DCAA floor check verification — {format(new Date(), "PPPP 'at' p")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button className="gap-2" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 print:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total On Site</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{clockedIn.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Working</CardTitle>
              <Clock className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{working.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On Break</CardTitle>
              <Coffee className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{onBreak.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Currently Clocked-In Employees</CardTitle>
            <CardDescription>
              Compare against physical presence for DCAA compliance verification
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Employee #</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Clock-In Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Hours Today</TableHead>
                  <TableHead className="print:table-cell hidden">Present</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading employee status...
                    </TableCell>
                  </TableRow>
                ) : clockedIn.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No employees currently clocked in
                    </TableCell>
                  </TableRow>
                ) : (
                  clockedIn.map((entry) => (
                    <TableRow key={entry.employee.id}>
                      <TableCell className="font-medium">
                        {entry.employee.firstName} {entry.employee.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.employee.employeeNumber || "—"}
                      </TableCell>
                      <TableCell>{entry.employee.department || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(entry.clockedInAt), "h:mm a")}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                            entry.status === "on_break"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400"
                              : "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400"
                          }`}
                        >
                          {entry.status === "on_break" ? "On Break" : "Working"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {entry.hoursToday.toFixed(2)}h
                      </TableCell>
                      <TableCell className="print:table-cell hidden">
                        <div className="w-6 h-6 border-2 border-gray-400 rounded" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground text-center print:block">
          Floor check generated {format(new Date(), "PPPPpppp")} — Timekeeper System
        </div>
      </div>
    </AdminLayout>
  );
}

import { useGetEmployee, useGetCurrentPunchStatus, useListPunches, useListTimesheets, useGetWeeklyHours, useListCertifications } from "@workspace/api-client-react";
import { EmployeeLayout } from "@/components/layout/employee-layout";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { Clock, Calendar, FileText, CheckCircle, Play, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EmployeeDashboard() {
  const { id } = useParams();
  const empId = parseInt(id || "0", 10);
  
  const { data: employee } = useGetEmployee(empId, { query: { enabled: !!empId } });
  const { data: punchStatus } = useGetCurrentPunchStatus(empId, { query: { enabled: !!empId } });
  const { data: timesheets = [] } = useListTimesheets({ employeeId: empId });
  const { data: weeklyHours } = useGetWeeklyHours({ employeeId: empId });
  
  if (!employee) return <EmployeeLayout><div className="p-8 text-center">Loading...</div></EmployeeLayout>;

  return (
    <EmployeeLayout employeeName={`${employee.firstName} ${employee.lastName}`}>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="card-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Status</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold uppercase tracking-wide">
              {punchStatus?.status.replace('_', ' ') || 'UNKNOWN'}
            </div>
            <p className="text-xs text-muted-foreground">
              {punchStatus?.clockedInAt ? `Since ${format(new Date(punchStatus.clockedInAt), "p")}` : "Not clocked in"}
            </p>
          </CardContent>
        </Card>
        
        <Card className="card-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hours Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{punchStatus?.hoursToday?.toFixed(2) || "0.00"}h</div>
          </CardContent>
        </Card>

        <Card className="card-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hours This Week</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyHours?.reduce((acc, curr) => acc + curr.hours, 0).toFixed(2) || "0.00"}h</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Link href={`/employee/${empId}/labor-sessions`}>
          <Card className="card-lift cursor-pointer hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Labor Work Sessions</CardTitle>
              <Play className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Open or close a work session against a charge code or authorization</p>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/employee/${empId}/labor-timesheets`}>
          <Card className="card-lift cursor-pointer hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Labor Timesheets</CardTitle>
              <ClipboardList className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">View, certify, and submit your daily labor time records</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Timesheets</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {timesheets.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">No timesheets found</div>
              ) : (
                timesheets.map(ts => (
                  <div key={ts.id} className="row-hover flex items-center justify-between px-2 py-3 border-b last:border-0">
                    <div>
                      <div className="font-medium">
                        {format(new Date(ts.periodStart), "MMM d")} - {format(new Date(ts.periodEnd), "MMM d, yyyy")}
                      </div>
                      <div className="text-sm text-muted-foreground uppercase">{ts.status}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-bold">{ts.totalHours.toFixed(2)}h</div>
                      </div>
                      <Link href={`/employee/${empId}/timesheet/${ts.id}`}>
                        <Button variant="outline" size="sm">View</Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </EmployeeLayout>
  );
}
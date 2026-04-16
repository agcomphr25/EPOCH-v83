import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  useGetDashboardSummary, 
  useGetClockedInEmployees, 
  useGetPendingTimesheets, 
  useGetWeeklyHours
} from "@workspace/api-client-react";
import { Users, Clock, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: clockedIn = [], isLoading: loadingClockedIn } = useGetClockedInEmployees();
  const { data: pendingTimesheets = [], isLoading: loadingPending } = useGetPendingTimesheets();
  const { data: weeklyHours = [], isLoading: loadingHours } = useGetWeeklyHours();

  const chartData = weeklyHours.map(d => ({
    name: format(new Date(d.date), "EEE"),
    regular: d.regularHours,
    overtime: d.overtimeHours,
    total: d.hours
  }));

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        </div>
        
        {loadingSummary ? (
          <div className="text-muted-foreground">Loading summary...</div>
        ) : summary ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/timesheets">
              <Card className="card-lift cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Clocked In Now</CardTitle>
                  <Clock className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.clockedInNow}</div>
                  <p className="text-xs text-muted-foreground">{summary.onBreakNow} on break</p>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/admin/timesheets">
              <Card className="card-lift cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Timesheets</CardTitle>
                  <FileCheck className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.pendingTimesheets}</div>
                  <p className="text-xs text-muted-foreground">Require review</p>
                </CardContent>
              </Card>
            </Link>
            
            <Card className="card-lift">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Hours This Week</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.hoursThisWeek.toFixed(1)}h</div>
                <p className="text-xs text-muted-foreground">{summary.overtimeHoursThisWeek.toFixed(1)}h overtime</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Weekly Hours</CardTitle>
              <CardDescription>Total hours worked across all active employees</CardDescription>
            </CardHeader>
            <CardContent className="pl-2 h-[300px]">
              {loadingHours ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">Loading chart...</div>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                      dx={-10}
                    />
                    <Tooltip 
                      cursor={{fill: 'hsl(var(--muted))', opacity: 0.4}}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                    />
                    <Bar dataKey="regular" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="overtime" stackId="a" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No data for this week</div>
              )}
            </CardContent>
          </Card>

          <Card className="col-span-3">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle>Currently Clocked In</CardTitle>
                <CardDescription>Live status of the workforce</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loadingClockedIn ? (
                <div className="py-4 text-center text-sm text-muted-foreground">Loading statuses...</div>
              ) : clockedIn.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No employees currently clocked in</div>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-auto pr-2">
                  {clockedIn.map(status => (
                    <div key={status.employee.id} className="row-hover flex items-center justify-between px-2 py-3">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2 rounded-full">
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{status.employee.firstName} {status.employee.lastName}</div>
                          <div className="text-xs text-muted-foreground">
                            Since {format(new Date(status.clockedInAt), "p")}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-semibold uppercase px-2 py-1 rounded-full ${
                          status.status === 'on_break' 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-400'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400'
                        }`}>
                          {status.status.replace('_', ' ')}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 font-mono">
                          {status.hoursToday.toFixed(2)}h today
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="space-y-1">
              <CardTitle>Pending Timesheets</CardTitle>
              <CardDescription>Awaiting manager approval</CardDescription>
            </div>
            <Link href="/admin/timesheets">
              <Button variant="ghost" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loadingPending ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Loading timesheets...</div>
            ) : pendingTimesheets.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">All caught up</div>
            ) : (
              <div className="space-y-1">
                {pendingTimesheets.slice(0, 5).map(ts => (
                  <div key={ts.id} className="row-hover flex items-center justify-between px-2 py-3 border-b last:border-0">
                    <div>
                      <div className="font-medium text-sm">Employee ID: {ts.employeeId}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(ts.periodStart), "MMM d")} - {format(new Date(ts.periodEnd), "MMM d")}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-semibold">{ts.totalHours.toFixed(2)}h</div>
                      <Link href={`/admin/timesheets/${ts.id}`}>
                        <Button size="sm" variant="outline">Review</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

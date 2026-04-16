import { Link } from "wouter";
import { Clock, MonitorSmartphone, UserCircle, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-4">
            <Clock className="h-12 w-12 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Timekeeper</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Professional workforce time management system. Select your interface to begin.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 pt-8">
          <Link href="/kiosk">
            <Card className="h-full hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group hover-elevate">
              <CardHeader>
                <MonitorSmartphone className="h-10 w-10 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <CardTitle>Kiosk Terminal</CardTitle>
                <CardDescription>Shared device for employee clock-in and clock-out</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Launch the full-screen terminal surface meant for a dedicated iPad or tablet at the entrance.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/employee">
            <Card className="h-full hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group hover-elevate">
              <CardHeader>
                <UserCircle className="h-10 w-10 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <CardTitle>Employee Portal</CardTitle>
                <CardDescription>Personal timesheets and punch history</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Access your personal dashboard to review past punches, submit timesheets, and view hours.
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin">
            <Card className="h-full hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group hover-elevate">
              <CardHeader>
                <ShieldAlert className="h-10 w-10 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <CardTitle>Admin Dashboard</CardTitle>
                <CardDescription>Workforce management and settings</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Manage employees, approve timesheets, review analytics, and configure system settings.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

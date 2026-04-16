import type { ReactNode } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { RouteGuard } from "@/components/route-guard";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";

import Home from "@/pages/home";
import Kiosk from "@/pages/kiosk/index";
import EmployeeLanding from "@/pages/employee/landing";
import EmployeeDashboard from "@/pages/employee/dashboard";
import EmployeeTimesheet from "@/pages/employee/timesheet";

import AdminDashboard from "@/pages/admin/dashboard";
import AdminEmployees from "@/pages/admin/employees/index";
import AdminEmployeeDetail from "@/pages/admin/employees/detail";
import AdminTimesheets from "@/pages/admin/timesheets/index";
import AdminTimesheetDetail from "@/pages/admin/timesheets/detail";
import AdminPunches from "@/pages/admin/punches/index";
import AdminCostCodes from "@/pages/admin/cost-codes/index";
import AdminFloorCheck from "@/pages/admin/floor-check/index";
import AdminSettings from "@/pages/admin/settings/index";
import AdminLaborChargeCodes from "@/pages/admin/labor-charge-codes/index";
import AdminLaborAuthorizations from "@/pages/admin/labor-authorizations/index";
import AdminLaborAuthorizationRequests from "@/pages/admin/labor-authorization-requests/index";
import AdminLaborTimesheets from "@/pages/admin/labor-timesheets/index";
import EmployeeLaborSessions from "@/pages/employee/labor-sessions";
import EmployeeLaborTimesheets from "@/pages/employee/labor-timesheets";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error instanceof Error && "status" in error) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403) return false;
        }
        return failureCount < 2;
      },
    },
  },
});

const Guard = RouteGuard;
const AdminGuard = ({ children }: { children: ReactNode }) => (
  <RouteGuard requireAdmin>{children}</RouteGuard>
);

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/kiosk" component={Kiosk} />

      <Route path="/">
        <Guard><Home /></Guard>
      </Route>
      <Route path="/employee">
        <Guard><EmployeeLanding /></Guard>
      </Route>
      <Route path="/employee/:id">
        <Guard><EmployeeDashboard /></Guard>
      </Route>
      <Route path="/employee/:id/timesheet/:timesheetId">
        <Guard><EmployeeTimesheet /></Guard>
      </Route>

      <Route path="/admin">
        <AdminGuard><AdminDashboard /></AdminGuard>
      </Route>
      <Route path="/admin/employees">
        <AdminGuard><AdminEmployees /></AdminGuard>
      </Route>
      <Route path="/admin/employees/:id">
        <AdminGuard><AdminEmployeeDetail /></AdminGuard>
      </Route>
      <Route path="/admin/timesheets">
        <AdminGuard><AdminTimesheets /></AdminGuard>
      </Route>
      <Route path="/admin/timesheets/:id">
        <AdminGuard><AdminTimesheetDetail /></AdminGuard>
      </Route>
      <Route path="/admin/punches">
        <AdminGuard><AdminPunches /></AdminGuard>
      </Route>
      <Route path="/admin/cost-codes">
        <AdminGuard><AdminCostCodes /></AdminGuard>
      </Route>
      <Route path="/admin/floor-check">
        <AdminGuard><AdminFloorCheck /></AdminGuard>
      </Route>
      <Route path="/admin/settings">
        <AdminGuard><AdminSettings /></AdminGuard>
      </Route>
      <Route path="/admin/labor-charge-codes">
        <AdminGuard><AdminLaborChargeCodes /></AdminGuard>
      </Route>
      <Route path="/admin/labor-authorizations">
        <AdminGuard><AdminLaborAuthorizations /></AdminGuard>
      </Route>
      <Route path="/admin/labor-authorization-requests">
        <AdminGuard><AdminLaborAuthorizationRequests /></AdminGuard>
      </Route>
      <Route path="/admin/labor-timesheets">
        <AdminGuard><AdminLaborTimesheets /></AdminGuard>
      </Route>

      <Route path="/employee/:id/labor-sessions">
        <Guard><EmployeeLaborSessions /></Guard>
      </Route>
      <Route path="/employee/:id/labor-timesheets">
        <Guard><EmployeeLaborTimesheets /></Guard>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

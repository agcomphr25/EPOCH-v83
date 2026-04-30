import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Home,
  BarChart3,
  Settings2,
  Package,
  Users,
  FileText,
  PackageCheck,
  List,
  Plus,
  MessageSquare,
  ClipboardList,
  ShieldCheck,
  Wrench,
  CalendarClock,
  FolderKanban,
} from 'lucide-react';
import { Link } from 'wouter';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';

export default function LAURIETTestDashboard() {
  const [, setLocation] = useLocation();
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string; employeeId?: number }>({
    queryKey: ['currentUser'],
  });

  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('jwtToken');
    setLocation('/login');
  };

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/lauriet-dashboard">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2"
              data-testid="button-home"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Laurie's Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Purchasing & Inventory Management
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            EPOCH v8 Manufacturing ERP
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className="flex items-center gap-2 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-600" />
          Quick Access
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/p2-control-center">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200">
              <CardContent className="p-4 text-center">
                <Settings2 className="w-8 h-8 text-purple-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  P2 Control Center
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  P2 Workflow Management
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/communications/inbox">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-violet-200">
              <CardContent className="p-4 text-center">
                <MessageSquare className="w-8 h-8 text-violet-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Communications
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Internal messages and notifications
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/master-document-register">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-amber-200">
              <CardContent className="p-4 text-center">
                <ClipboardList className="w-8 h-8 text-amber-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Master Document Register
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Document control & revision tracking
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/qc">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
              <CardContent className="p-4 text-center">
                <ShieldCheck className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Quality Control
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  QC inspections & records
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/maintenance">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
              <CardContent className="p-4 text-center">
                <Wrench className="w-8 h-8 text-orange-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Preventative Maintenance
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Scheduled maintenance plans
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/maintenance-events">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200">
              <CardContent className="p-4 text-center">
                <CalendarClock className="w-8 h-8 text-red-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Maintenance Events
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Log & track maintenance activity
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/projects">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-indigo-200">
              <CardContent className="p-4 text-center">
                <FolderKanban className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  P2 Projects
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Project pipeline & tracking
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-green-100">
                <Plus className="w-5 h-5 text-green-600" />
              </div>
              <span>Vendors</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link href="/vendors">
              <Button
                variant="ghost"
                className="h-auto p-4 justify-start text-left w-full"
              >
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">Vendors</div>
                    <div className="text-xs text-gray-500">Manage vendor contacts</div>
                  </div>
                </div>
              </Button>
            </Link>
            <Link href="/vendor-pos">
              <Button
                variant="ghost"
                className="h-auto p-4 justify-start text-left w-full"
              >
                <div className="flex items-center space-x-3">
                  <List className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">Vendor POs</div>
                    <div className="text-xs text-gray-500">View and manage purchase orders</div>
                  </div>
                </div>
              </Button>
            </Link>
            <Link href="/inventory/receiving">
              <Button
                variant="ghost"
                className="h-auto p-4 justify-start text-left w-full"
              >
                <div className="flex items-center space-x-3">
                  <PackageCheck className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">Receiving</div>
                    <div className="text-xs text-gray-500">Inventory receiving</div>
                  </div>
                </div>
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-100">
                <BarChart3 className="w-5 h-5 text-blue-600" />
              </div>
              <span>Inventory Planning</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Link href="/inventory/enhanced-mrp">
              <Button
                variant="ghost"
                className="h-auto p-4 justify-start text-left w-full"
              >
                <div className="flex items-center space-x-3">
                  <BarChart3 className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">Enhanced MRP</div>
                    <div className="text-xs text-gray-500">Material Requirements Planning</div>
                  </div>
                </div>
              </Button>
            </Link>
            <Link href="/inventory/consolidated-needs">
              <Button
                variant="ghost"
                className="h-auto p-4 justify-start text-left w-full"
              >
                <div className="flex items-center space-x-3">
                  <List className="w-5 h-5 text-gray-600" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">Consolidated Parts Needs</div>
                    <div className="text-xs text-gray-500">View all parts requirements</div>
                  </div>
                </div>
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* My Tasks Control Center */}
      {currentUser?.employeeId && (
        <MyTasksControlCenter
          employeeId={currentUser.employeeId}
          userName={currentUser.username}
          compact={false}
        />
      )}
    </div>
  );
}

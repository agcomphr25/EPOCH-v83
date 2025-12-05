import { Card, CardContent } from '@/components/ui/card';
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
} from 'lucide-react';
import { Link } from 'wouter';

export default function LAURIETTestDashboard() {
  const handleLogout = () => {
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('jwtToken');
    window.location.href = '/login';
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
          <Link href="/inventory/enhanced-mrp">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
              <CardContent className="p-4 text-center">
                <BarChart3 className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Enhanced MRP
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Material Requirements Planning
                </p>
              </CardContent>
            </Card>
          </Link>

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
        </div>
      </div>

      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          <Users className="w-5 h-5 text-green-600" />
          Vendors
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/vendors">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Vendors
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Vendor Management
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/vendor-pos">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
              <CardContent className="p-4 text-center">
                <FileText className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Vendor POs
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Purchase Orders
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/inventory/receiving">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
              <CardContent className="p-4 text-center">
                <PackageCheck className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Receiving
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Inventory Receiving
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { 
  Plus, 
  List, 
  FileText, 
  Settings, 
  Package, 
  Shield, 
  Users, 
  DollarSign,
  BarChart3,
  CheckCircle
} from "lucide-react";

export default function Dashboard() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">EPOCH v8 Manufacturing ERP</h1>
        <p className="text-gray-600">Advanced Manufacturing Operations & Production Management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Order Management */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-blue-600" />
              Order Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Create and manage customer orders</p>
            <div className="space-y-2">
              <Link href="/order-entry">
                <Button className="w-full justify-start" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  New Order
                </Button>
              </Link>
              <Link href="/orders">
                <Button className="w-full justify-start" variant="outline">
                  <List className="h-4 w-4 mr-2" />
                  View All Orders
                </Button>
              </Link>
              <Link href="/draft-orders">
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Draft Orders
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Management */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-green-600" />
              Inventory
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Track and manage inventory items</p>
            <div className="space-y-2">
              <Link href="/inventory/dashboard">
                <Button className="w-full justify-start" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/inventory/scanner">
                <Button className="w-full justify-start" variant="outline">
                  <Package className="h-4 w-4 mr-2" />
                  Scanner
                </Button>
              </Link>
              <Link href="/inventory/manager">
                <Button className="w-full justify-start" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Manager
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Quality Control */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-600" />
              QC & Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Quality control and maintenance</p>
            <div className="space-y-2">
              <Link href="/qc">
                <Button className="w-full justify-start" variant="outline">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Quality Control
                </Button>
              </Link>
              <Link href="/maintenance">
                <Button className="w-full justify-start" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Maintenance
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Employee Portal */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-600" />
              Employee Portal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Employee management and time tracking</p>
            <div className="space-y-2">
              <Link href="/employee-portal">
                <Button className="w-full justify-start" variant="outline">
                  <Users className="h-4 w-4 mr-2" />
                  Employee Portal
                </Button>
              </Link>
              <Link href="/time-clock-admin">
                <Button className="w-full justify-start" variant="outline">
                  <Settings className="h-4 w-4 mr-2" />
                  Time Clock Admin
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Finance */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-600" />
              Finance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Financial reporting and management</p>
            <div className="space-y-2">
              <Link href="/finance/dashboard">
                <Button className="w-full justify-start" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/finance/ap-journal">
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  AP Journal
                </Button>
              </Link>
              <Link href="/finance/ar-journal">
                <Button className="w-full justify-start" variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  AR Journal
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Enhanced Forms */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Forms & Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">Enhanced form builder and reporting</p>
            <div className="space-y-2">
              <Link href="/enhanced-forms">
                <Button className="w-full justify-start" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Form Builder
                </Button>
              </Link>
              <Link href="/enhanced-reports">
                <Button className="w-full justify-start" variant="outline">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Reports
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/order-entry">
            <Button className="w-full h-12" variant="default">
              <Plus className="h-4 w-4 mr-2" />
              Create New Order
            </Button>
          </Link>
          <Link href="/discounts">
            <Button className="w-full h-12" variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Manage Discounts
            </Button>
          </Link>
          <Link href="/feature-manager">
            <Button className="w-full h-12" variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Feature Manager
            </Button>
          </Link>
          <Link href="/stock-models">
            <Button className="w-full h-12" variant="outline">
              <Package className="h-4 w-4 mr-2" />
              Stock Models
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
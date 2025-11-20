import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  XCircle,
  Users,
  Factory,
  RefreshCw,
  LogOut,
  Truck,
  Home,
  Star,
  GraduationCap,
  CreditCard,
  ClipboardList,
  Plus,
  List,
} from 'lucide-react';
import { Link } from 'wouter';
import PipelineVisualization from '@/components/PipelineVisualization';

export default function DARLENEBTestDashboard() {
  const handleLogout = () => {
    // Clear authentication tokens
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('jwtToken');

    // Redirect to login page
    window.location.href = '/login';
  };

  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/darleneb-dashboard">
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
              DARLENEB Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Order Management & Customer Relations
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

      {/* Order Management Card */}
      <Card className="border-2 border-blue-300 dark:border-blue-700 mb-6">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800">
          <CardTitle className="flex items-center gap-3 text-xl">
            <ClipboardList className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Order Management
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            Quick access to all order management tools
          </p>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/order-entry">
              <div className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-lg transition-all cursor-pointer bg-white dark:bg-gray-800 h-full" data-testid="card-order-entry">
                <div className="text-center">
                  <Plus className="w-6 h-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Order Entry
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Create single orders
                  </p>
                </div>
              </div>
            </Link>

            <Link href="/all-orders">
              <div className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-500 hover:shadow-lg transition-all cursor-pointer bg-white dark:bg-gray-800 h-full" data-testid="card-all-orders">
                <div className="text-center">
                  <List className="w-6 h-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    All Orders
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    View all created orders
                  </p>
                </div>
              </div>
            </Link>

            <Link href="/rts">
              <div className="p-4 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-teal-400 dark:hover:border-teal-500 hover:shadow-lg transition-all cursor-pointer bg-white dark:bg-gray-800 h-full" data-testid="card-rts">
                <div className="text-center">
                  <Truck className="w-6 h-6 text-teal-600 dark:text-teal-400 mx-auto mb-2" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    RTS (Ready to Ship)
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Manage shipments
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Link href="/cancelled-orders">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200">
            <CardContent className="p-4 text-center">
              <XCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Cancelled Orders
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                View cancelled orders
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customer-management">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200">
            <CardContent className="p-4 text-center">
              <Users className="w-8 h-8 text-orange-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Customer Management
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Manage customers
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/refund-request">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200">
            <CardContent className="p-4 text-center">
              <RefreshCw className="w-8 h-8 text-purple-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Request Refund
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Process refunds
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/shipping-tracker">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-teal-200">
            <CardContent className="p-4 text-center">
              <Truck className="w-8 h-8 text-teal-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Shipping Tracker
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Track shipments
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customer-satisfaction">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-indigo-200">
            <CardContent className="p-4 text-center">
              <Star className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Customer Satisfaction
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                View feedback
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/training">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-emerald-200">
            <CardContent className="p-4 text-center">
              <GraduationCap className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Training Modules
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Complete training courses
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/bulk-payment">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
            <CardContent className="p-4 text-center">
              <CreditCard className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Bulk Payment
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Process bulk payments
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Production Pipeline Overview */}
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <div className="p-2 rounded-lg bg-blue-100">
                <Factory className="w-5 h-5 text-blue-600" />
              </div>
              <span>Production Pipeline Overview</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <PipelineVisualization />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

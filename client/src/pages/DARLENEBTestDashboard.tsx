import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  PlusCircle,
  FilePenLine,
  XCircle,
  Users,
  User,
  Factory,
  RefreshCw,
  LogOut,
  Truck,
  Package,
  Home,
  Star,
  GraduationCap,
  CreditCard,
  List,
  ClipboardList,
  Eye,
  Settings,
  Percent,
  Mail,
} from 'lucide-react';
import { Link } from 'wouter';
import PipelineVisualization from '@/components/PipelineVisualization';
import WatchRuleCards from '@/components/WatchRuleCards';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';

export default function DARLENEBTestDashboard() {
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string; employeeId?: number }>({
    queryKey: ['currentUser'],
  });

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

      {/* Order Management Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          Order Management
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/order-entry">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
              <CardContent className="p-4 text-center">
                <PlusCircle className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Order Entry
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Create single orders
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/orders-list">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200">
              <CardContent className="p-4 text-center">
                <List className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  All Orders
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  View all created orders
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/nonconformance">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200">
              <CardContent className="p-4 text-center">
                <XCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Nonconforming Tracker
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Track quality issues
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/rts">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-teal-200">
              <CardContent className="p-4 text-center">
                <Truck className="w-8 h-8 text-teal-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  RTS (Ready to Ship)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Manage shipments
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Special Customer Watch Section - Always show on darleneb's dashboard */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-600" />
            Customer Watch Rules
          </h2>
          <Link href="/watch-rules">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 hover:bg-purple-50 hover:border-purple-300"
              data-testid="button-manage-watch-rules-header"
            >
              <Settings className="w-4 h-4" />
              Manage Watch Rules
            </Button>
          </Link>
        </div>
        <WatchRuleCards userId="darleneb" showManageButton={false} />
      </div>

      {/* Other Functions */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
          <Package className="w-5 h-5 text-purple-600" />
          Additional Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          <Link href="/draft-orders">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-yellow-200">
              <CardContent className="p-4 text-center">
                <FilePenLine className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Draft Orders
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Manage drafts
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

          <Link href="/discounts">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-amber-200">
              <CardContent className="p-4 text-center">
                <Percent className="w-8 h-8 text-amber-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Discounts
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Manage discounts and sales
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

          <Link href="/marketing-communications">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-cyan-200">
              <CardContent className="p-4 text-center">
                <Mail className="w-8 h-8 text-cyan-600 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Communications
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Marketing communications board
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* My Tasks Control Center */}
      {currentUser?.employeeId && (
        <MyTasksControlCenter
          employeeId={currentUser.employeeId}
          userName={currentUser.username}
          compact={false}
        />
      )}

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

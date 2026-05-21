import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  PlusCircle,
  FilePenLine,
  XCircle,
  Users,
  User,
  Factory,
  RefreshCw,
  Clock,
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
  Moon,
  Sun,
  MessageSquare,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import PipelineVisualization from '@/components/PipelineVisualization';
import WatchRuleCards from '@/components/WatchRuleCards';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';

export default function DARLENEBTestDashboard() {
  const [, setLocation] = useLocation();
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('darleneb-dark-mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('darleneb-dark-mode', isDarkMode.toString());
  }, [isDarkMode]);

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string; employeeId?: number }>({
    queryKey: ['currentUser'],
  });
  const { data: resolvedEmployee } = useQuery<{ employeeId: number | null }>({
    queryKey: ['/api/timekeeping/my-employee-id'],
    enabled: !!currentUser && !currentUser.employeeId,
  });
  const dashboardEmployeeId = currentUser?.employeeId ?? resolvedEmployee?.employeeId ?? null;

  const handleLogout = () => {
    // Clear authentication tokens
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('jwtToken');

    // Redirect to login page
    setLocation('/login');
  };

  return (
    <div className={`p-6 space-y-6 max-w-full mx-auto min-h-screen transition-colors duration-300 ${isDarkMode ? 'dark bg-gray-900' : 'bg-white'}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/darleneb-dashboard">
            <Button
              variant="ghost"
              size="sm"
              className={`flex items-center gap-2 ${isDarkMode ? 'text-gray-100 hover:bg-gray-800' : ''}`}
              data-testid="button-home"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </Button>
          </Link>
          <div>
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              DARLENEB Dashboard
            </h1>
            <p className={`mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Order Management & Customer Relations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Dark Mode Toggle */}
          <div className="flex items-center gap-2">
            <Sun className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-yellow-500'}`} />
            <Switch
              id="dark-mode"
              checked={isDarkMode}
              onCheckedChange={setIsDarkMode}
              data-testid="switch-dark-mode"
            />
            <Moon className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-gray-400'}`} />
          </div>
          <div className={`text-sm hidden md:block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            EPOCH v8 Manufacturing ERP
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            size="sm"
            className={`flex items-center gap-2 ${isDarkMode ? 'border-gray-600 text-gray-100 hover:bg-red-900 hover:border-red-700 hover:text-red-200' : 'hover:bg-red-50 hover:border-red-200 hover:text-red-600'}`}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </div>

      {/* Order Management Section */}
      <div className="mb-6">
        <h2 className={`text-xl font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <ClipboardList className="w-5 h-5 text-blue-600" />
          Order Management
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/order-entry">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <PlusCircle className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Order Entry
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Create single orders
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/orders-list">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-green-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <List className="w-8 h-8 text-green-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  All Orders
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  View all created orders
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/nonconformance">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <XCircle className="w-8 h-8 text-red-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Nonconforming Tracker
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Track quality issues
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/rts">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-teal-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Truck className="w-8 h-8 text-teal-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  RTS (Ready to Ship)
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
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
          <h2 className={`text-xl font-semibold flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            <Eye className="w-5 h-5 text-purple-600" />
            Customer Watch Rules
          </h2>
          <Link href="/watch-rules">
            <Button
              variant="outline"
              size="sm"
              className={`flex items-center gap-2 ${isDarkMode ? 'border-gray-600 text-gray-100 hover:bg-purple-900 hover:border-purple-700' : 'hover:bg-purple-50 hover:border-purple-300'}`}
              data-testid="button-manage-watch-rules-header"
            >
              <Settings className="w-4 h-4" />
              Manage Watch Rules
            </Button>
          </Link>
        </div>
        <WatchRuleCards userId="darleneb" employeeId={20} showManageButton={false} />
      </div>

      {/* Other Functions */}
      <div className="mb-6">
        <h2 className={`text-xl font-semibold mb-3 flex items-center gap-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          <Package className="w-5 h-5 text-purple-600" />
          Additional Tools
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

          <Link href="/draft-orders">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-yellow-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <FilePenLine className="w-8 h-8 text-yellow-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Draft Orders
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Manage drafts
                </p>
              </CardContent>
            </Card>
          </Link>

            <Link href="/customers">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Users className="w-8 h-8 text-orange-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Customer Management
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Manage customers
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/refund-request">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-purple-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <RefreshCw className="w-8 h-8 text-purple-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Request Refund
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Process refunds
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/refund-queue">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-orange-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 text-orange-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Refund Queue
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  View pending refunds
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/discounts">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-amber-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Percent className="w-8 h-8 text-amber-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Discounts
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Manage discounts and sales
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/shipping-tracker">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-teal-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Truck className="w-8 h-8 text-teal-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Shipping Tracker
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Track shipments
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/customer-satisfaction">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-indigo-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Star className="w-8 h-8 text-indigo-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Customer Satisfaction
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  View feedback
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/training">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-emerald-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <GraduationCap className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Training Modules
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Complete training courses
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/tickets">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-pink-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <MessageSquare className="w-8 h-8 text-pink-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Tickets
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Support tickets
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/finance/bulk-payment">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <CreditCard className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Bulk Payment
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Process bulk payments
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/marketing-communications">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-cyan-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <Mail className="w-8 h-8 text-cyan-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Communications
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Marketing communications board
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/urgent-orders-report">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-red-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <ClipboardList className="w-8 h-8 text-red-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Urgent Orders Report
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  View urgent and priority orders
                </p>
              </CardContent>
            </Card>
          </Link>

          <Link href="/employee-portal">
            <Card className={`hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-violet-200 ${isDarkMode ? 'bg-gray-800 border-gray-700' : ''}`}>
              <CardContent className="p-4 text-center">
                <User className="w-8 h-8 text-violet-600 mx-auto mb-3" />
                <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  My Employee Portal
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  View your employee profile
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* My Tasks Control Center */}
      {dashboardEmployeeId && (
        <MyTasksControlCenter
          employeeId={dashboardEmployeeId}
          userName={currentUser?.username ?? 'darleneb'}
          compact={false}
        />
      )}

      {/* Production Pipeline Overview */}
      <div className="mt-8">
        <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <CardTitle className={`flex items-center space-x-2 text-lg ${isDarkMode ? 'text-gray-100' : ''}`}>
              <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
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

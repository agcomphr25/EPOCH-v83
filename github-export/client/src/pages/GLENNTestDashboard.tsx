import React from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Plus, List, FilePenLine, TestTube, Users, ClipboardList, FileText, 
  TrendingUp, Package, Scan, Calendar, BarChart, Warehouse, Shield, 
  Wrench, FormInput, PieChart, DollarSign, Receipt, TrendingDown,
  Factory, User, Settings
} from 'lucide-react';

export default function ADMINTestDashboard() {
  const orderManagementItems = [
    {
      path: '/order-entry',
      label: 'New Order',
      icon: Plus,
      description: 'Create new customer orders'
    },
    {
      path: '/orders-list',
      label: 'View All Orders',
      icon: List,
      description: 'View and manage all orders'
    },
    {
      path: '/draft-orders',
      label: 'Draft Orders',
      icon: FilePenLine,
      description: 'Manage saved draft orders'
    }
  ];

  const inventoryItems = [
    {
      path: '/inventory/dashboard',
      label: 'Dashboard',
      icon: BarChart,
      description: 'Inventory overview and analytics'
    },
    {
      path: '/inventory/scanner',
      label: 'Scanner',
      icon: Scan,
      description: 'Scan inventory items'
    },
    {
      path: '/inventory/manager',
      label: 'Manager',
      icon: Package,
      description: 'Manage inventory items'
    },
    {
      path: '/inventory/receiving',
      label: 'Receiving',
      icon: Receipt,
      description: 'Receive incoming inventory'
    }
  ];

  const qcMaintenanceItems = [
    {
      path: '/qc',
      label: 'Quality Control',
      icon: Shield,
      description: 'QC inspections and definitions'
    },
    {
      path: '/maintenance',
      label: 'Maintenance',
      icon: Wrench,
      description: 'Equipment maintenance tracking'
    }
  ];

  const employeePortalItems = [
    {
      path: '/employee-portal',
      label: 'Employee Portal',
      icon: User,
      description: 'Employee time tracking and tasks'
    },
    {
      path: '/time-clock-admin',
      label: 'Time Clock Admin',
      icon: Settings,
      description: 'Administrative time tracking'
    }
  ];

  const financeItems = [
    {
      path: '/finance/dashboard',
      label: 'Dashboard',
      icon: BarChart,
      description: 'Financial overview and metrics'
    },
    {
      path: '/finance/ap-journal',
      label: 'AP Journal',
      icon: Receipt,
      description: 'Accounts payable journal'
    },
    {
      path: '/finance/ar-journal',
      label: 'AR Journal',
      icon: TrendingUp,
      description: 'Accounts receivable journal'
    },
    {
      path: '/finance/cogs-report',
      label: 'COGS Report',
      icon: TrendingDown,
      description: 'Cost of goods sold reporting'
    }
  ];

  const formsReportsItems = [
    {
      path: '/enhanced-forms',
      label: 'Form Builder',
      icon: FormInput,
      description: 'Enhanced form builder with drag-and-drop'
    },
    {
      path: '/enhanced-reports',
      label: 'Reports',
      icon: PieChart,
      description: 'Advanced reporting with PDF/CSV export'
    }
  ];

  const mainNavItems = [
    {
      path: '/module8-test',
      label: 'Module 8 Test',
      icon: TestTube,
      description: 'Test API integrations and communications'
    },
    {
      path: '/customers',
      label: 'Customer Management',
      icon: Users,
      description: 'Manage customer database'
    },
    {
      path: '/purchase-orders',
      label: 'P1 Purchase Orders',
      icon: ClipboardList,
      description: 'Customer PO management'
    },
    {
      path: '/p2-purchase-orders',
      label: 'P2 Purchase Orders',
      icon: FileText,
      description: 'P2 customer management and purchase orders'
    },
    {
      path: '/production-tracking',
      label: 'Production Tracking',
      icon: TrendingUp,
      description: 'Track production orders from POs'
    },
    {
      path: '/bom-administration',
      label: 'BOM Administration',
      icon: Package,
      description: 'Manage Bill of Materials for P2 operations'
    },
    {
      path: '/barcode-scanner',
      label: 'Barcode Scanner',
      icon: Scan,
      description: 'Scan order barcodes'
    },
    {
      path: '/layup-scheduler',
      label: 'Layup Scheduler',
      icon: Calendar,
      description: 'Schedule and manage layup production orders'
    },
    {
      path: '/agtest-dashboard',
      label: 'AGTEST Dashboard',
      icon: BarChart,
      description: 'Unified production dashboard'
    }
  ];

  const renderNavigationCard = (item: any) => (
    <Link key={item.path} href={item.path}>
      <Button variant="ghost" className="h-auto p-4 justify-start text-left w-full">
        <div className="flex items-center space-x-3">
          <item.icon className="w-5 h-5 text-gray-600" />
          <div>
            <div className="font-medium text-gray-900">{item.label}</div>
            <div className="text-xs text-gray-500">{item.description}</div>
          </div>
        </div>
      </Button>
    </Link>
  );

  const renderSectionCard = (title: string, items: any[], bgColor: string, iconColor: string, icon: any) => {
    const Icon = icon;
    return (
      <Card className="h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className={`p-2 rounded-lg ${bgColor}`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <span>{title}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {items.map(renderNavigationCard)}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">ADMINTEST Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Welcome to your comprehensive manufacturing management system
          </p>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          EPOCH v8 Manufacturing ERP
        </div>
      </div>

      {/* Main Navigation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Order Management */}
        {renderSectionCard(
          'Order Management', 
          orderManagementItems, 
          'bg-green-100', 
          'text-green-600',
          Plus
        )}

        {/* Inventory */}
        {renderSectionCard(
          'Inventory', 
          inventoryItems, 
          'bg-blue-100', 
          'text-blue-600',
          Warehouse
        )}

        {/* QC & Maintenance */}
        {renderSectionCard(
          'QC & Maintenance', 
          qcMaintenanceItems, 
          'bg-orange-100', 
          'text-orange-600',
          Shield
        )}

        {/* Employee Portal */}
        {renderSectionCard(
          'Employee Portal', 
          employeePortalItems, 
          'bg-purple-100', 
          'text-purple-600',
          User
        )}

        {/* Finance */}
        {renderSectionCard(
          'Finance', 
          financeItems, 
          'bg-red-100', 
          'text-red-600',
          DollarSign
        )}

        {/* Forms & Reports */}
        {renderSectionCard(
          'Forms & Reports', 
          formsReportsItems, 
          'bg-indigo-100', 
          'text-indigo-600',
          FormInput
        )}

      </div>

      {/* Additional Navigation Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-gray-100">
              <Factory className="w-5 h-5 text-gray-600" />
            </div>
            <span>Manufacturing Operations</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {mainNavItems.map(renderNavigationCard)}
          </div>
        </CardContent>
      </Card>

      {/* System Status Footer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">✓</div>
            <div className="text-sm font-medium">System Online</div>
            <div className="text-xs text-gray-500">All services operational</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">📊</div>
            <div className="text-sm font-medium">Real-time Data</div>
            <div className="text-xs text-gray-500">Live production tracking</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">🔧</div>
            <div className="text-sm font-medium">Manufacturing</div>
            <div className="text-xs text-gray-500">Complete ERP solution</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">⚡</div>
            <div className="text-sm font-medium">Quick Access</div>
            <div className="text-xs text-gray-500">Navigate anywhere fast</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
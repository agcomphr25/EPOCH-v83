import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { Factory, User, FileText, TrendingDown, Plus, Settings, Package, FilePenLine, ClipboardList, BarChart, ChevronDown, ChevronRight, FormInput, PieChart, Scan, Warehouse, Shield, Wrench, Users, TestTube, DollarSign, Receipt, TrendingUp, List, BookOpen, Calendar, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import InstallPWAButton from "./InstallPWAButton";

export default function Navigation() {
  const [location] = useLocation();

  const [verifiedModulesExpanded, setVerifiedModulesExpanded] = useState(false);
  const [formsReportsExpanded, setFormsReportsExpanded] = useState(false);
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [employeesExpanded, setEmployeesExpanded] = useState(false);
  const [qcMaintenanceExpanded, setQcMaintenanceExpanded] = useState(false);
  const [financeExpanded, setFinanceExpanded] = useState(false);
  const [testDashboardsExpanded, setTestDashboardsExpanded] = useState(false);
  const [purchaseOrdersExpanded, setPurchaseOrdersExpanded] = useState(false);
  const [productionSchedulingExpanded, setProductionSchedulingExpanded] = useState(false);
  const [departmentQueueExpanded, setDepartmentQueueExpanded] = useState(false);

  const navItems = [
    {
      path: '/order-entry',
      label: 'Order Entry',
      icon: Plus,
      description: 'Create single orders'
    },
    {
      path: '/orders-list',
      label: 'All Orders',
      icon: List,
      description: 'View all created orders'
    },
    {
      path: '/draft-orders',
      label: 'Draft Orders',
      icon: FilePenLine,
      description: 'Manage saved draft orders'
    },

    {
      path: '/customers',
      label: 'Customer Management',
      icon: Users,
      description: 'Manage customer database'
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
      description: 'Scan order barcodes to view pricing summary and payment status'
    },


    // Documentation button disabled per user request - was causing problems
    // {
    //   path: '/documentation',
    //   label: 'Documentation',
    //   icon: BookOpen,
    //   description: 'Complete system architecture and structure'
    // }

  ];

  const inventoryItems = [
    {
      path: '/inventory/scanner',
      label: 'Inventory Scanner',
      icon: Scan,
      description: 'Scan inventory items'
    },
    {
      path: '/inventory/dashboard',
      label: 'Inventory Dashboard',
      icon: Warehouse,
      description: 'View inventory overview'
    },
    {
      path: '/inventory/manager',
      label: 'Inventory Manager',
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

  const formsReportsItems = [
    {
      path: '/enhanced-forms',
      label: 'Enhanced Forms',
      icon: FormInput,
      description: 'Advanced form builder with drag-and-drop'
    },
    {
      path: '/enhanced-reports',
      label: 'Enhanced Reports',
      icon: PieChart,
      description: 'Advanced reporting with PDF/CSV export'
    },
    {
      path: '/ag-bottom-metal-report',
      label: 'AG Bottom Metal Report',
      icon: FileText,
      description: 'Orders with AG bottom metal specifications'
    },
    {
      path: '/p2-forms',
      label: 'P2 Forms',
      icon: ClipboardList,
      description: 'P2 specialized forms and documentation'
    },
    {
      path: '/task-tracker',
      label: 'Task Tracker',
      icon: CheckSquare,
      description: 'Collaborative task management with GJ, TM, and Finished checkboxes'
    },
    {
      path: '/document-management',
      label: 'Document Management',
      icon: FileText,
      description: 'Unified document repository with advanced tagging and organization'
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
      description: 'Preventive maintenance schedules'
    }
  ];

  const employeesItems = [
    {
      path: '/employee',
      label: 'Employee Management',
      icon: Users,
      description: 'Manage employee profiles, certifications, and evaluations'
    },
    {
      path: '/employee-portal',
      label: 'Employee Portal',
      icon: User,
      description: 'Employee time tracking and onboarding'
    },
    {
      path: '/time-clock-admin',
      label: 'Time Clock Admin',
      icon: Settings,
      description: 'Manage time clock entries and punches'
    }
  ];

  const financeItems = [
    {
      path: '/finance/dashboard',
      label: 'Finance Dashboard',
      icon: BarChart,
      description: 'Financial overview and KPIs'
    },
    {
      path: '/finance/ap',
      label: 'AP Journal',
      icon: Receipt,
      description: 'Accounts Payable transactions'
    },
    {
      path: '/finance/ar',
      label: 'AR Journal',
      icon: DollarSign,
      description: 'Accounts Receivable transactions'
    },
    {
      path: '/finance/cogs',
      label: 'COGS Report',
      icon: TrendingUp,
      description: 'Cost of Goods Sold reporting'
    }
  ];

  const testDashboardsItems = [
    {
      path: '/agtest-dashboard',
      label: 'AGTEST Dashboard',
      icon: BarChart,
      description: 'Unified dashboard with Pipeline Overview, All Orders, and Layup Scheduler'
    },
    {
      path: '/admintest-dashboard',
      label: 'ADMINTEST Dashboard',
      icon: Factory,
      description: 'Complete navigation dashboard for all system sections'
    },
    {
      path: '/stacitest-dashboard',
      label: 'STACITEST Dashboard',
      icon: BarChart,
      description: 'P1 & P2 production pipeline overview dashboard'
    }
  ];

  const purchaseOrdersItems = [
    {
      path: '/purchase-orders',
      label: 'P1 Purchase Orders',
      icon: ClipboardList,
      description: 'Module 12: Customer PO management'
    },
    {
      path: '/p2-purchase-orders',
      label: 'P2 Purchase Orders',
      icon: FileText,
      description: 'P2 customer management and purchase orders with Part #, Quantity, Price'
    }
  ];

  const verifiedModulesItems = [
    {
      path: '/',
      label: 'Order Management',
      icon: FileText,
      description: 'View orders and import historical data'
    },
    {
      path: '/discounts',
      label: 'Discount Management',
      icon: TrendingDown,
      description: 'Configure discounts and sales'
    },
    {
      path: '/feature-manager',
      label: 'Feature Manager',
      icon: Settings,
      description: 'Configure order features'
    },
    {
      path: '/stock-models',
      label: 'Stock Models',
      icon: Package,
      description: 'Manage stock models and pricing'
    },
    {
      path: '/module8-test',
      label: 'Module 8 Test',
      icon: TestTube,
      description: 'Test API integrations and communications'
    }
  ];

  const productionSchedulingItems = [
    {
      path: '/production-tracking',
      label: 'Production Tracking',
      icon: TrendingUp,
      description: 'Track production orders from POs'
    }
  ];

  const departmentQueueItems = [
    {
      path: '/layup-scheduler',
      label: 'Layup Scheduler',
      icon: Calendar,
      description: 'Schedule and manage layup production orders with drag-and-drop interface'
    },
    {
      path: '/department-queue/layup-department',
      label: 'Layup Department',
      icon: Factory,
      description: 'Complete layup department management with scheduling and queue'
    },
    {
      path: '/department-queue/barcode',
      label: 'Barcode',
      icon: Scan,
      description: 'Barcode processing department queue'
    },
    {
      path: '/department-queue/cnc',
      label: 'CNC',
      icon: Settings,
      description: 'CNC machining department queue'
    },
    {
      path: '/department-queue/finish-qc',
      label: 'Finish QC',
      icon: Shield,
      description: 'Finish quality control department queue'
    },
    {
      path: '/department-queue/paint',
      label: 'Paint',
      icon: Package,
      description: 'Paint department queue management'
    },
    {
      path: '/department-queue/qc-shipping',
      label: 'QC/Shipping',
      icon: TrendingUp,
      description: 'Quality control and shipping department queue'
    }
  ];

  const isVerifiedModulesActive = verifiedModulesItems.some(item => location === item.path);
  const isFormsReportsActive = formsReportsItems.some(item => location === item.path);
  const isInventoryActive = inventoryItems.some(item => location === item.path);
  const isQcMaintenanceActive = qcMaintenanceItems.some(item => location === item.path);
  const isEmployeesActive = employeesItems.some(item => location === item.path);
  const isFinanceActive = financeItems.some(item => location === item.path);
  const isTestDashboardsActive = testDashboardsItems.some(item => location === item.path);
  const isPurchaseOrdersActive = purchaseOrdersItems.some(item => location === item.path);
  const isProductionSchedulingActive = productionSchedulingItems.some(item => location === item.path);
  const isDepartmentQueueActive = departmentQueueItems.some(item => location === item.path);

  // Auto-expand dropdowns when on those pages
  useEffect(() => {
    if (isVerifiedModulesActive) {
      setVerifiedModulesExpanded(true);
    }
    if (isFormsReportsActive) {
      setFormsReportsExpanded(true);
    }
    if (isInventoryActive) {
      setInventoryExpanded(true);
    }
    if (isQcMaintenanceActive) {
      setQcMaintenanceExpanded(true);
    }
    if (isEmployeesActive) {
      setEmployeesExpanded(true);
    }
    if (isFinanceActive) {
      setFinanceExpanded(true);
    }
    if (isTestDashboardsActive) {
      setTestDashboardsExpanded(true);
    }
    if (isPurchaseOrdersActive) {
      setPurchaseOrdersExpanded(true);
    }
    if (isProductionSchedulingActive) {
      setProductionSchedulingExpanded(true);
    }
    if (isDepartmentQueueActive) {
      setDepartmentQueueExpanded(true);
    }
  }, [isVerifiedModulesActive, isFormsReportsActive, isInventoryActive, isQcMaintenanceActive, isEmployeesActive, isFinanceActive, isTestDashboardsActive, isPurchaseOrdersActive, isProductionSchedulingActive, isDepartmentQueueActive]);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <Factory className="h-6 w-6 text-primary mr-3" />
            <h1 className="text-xl font-semibold text-gray-900">EPOCH v8</h1>
          </div>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    className={cn(
                      "flex items-center gap-2 text-sm",
                      isActive && "bg-primary text-white"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            
            {/* Forms & Reports Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setFormsReportsExpanded(true)}
              onMouseLeave={() => setFormsReportsExpanded(false)}
            >
              <Button
                variant={isFormsReportsActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isFormsReportsActive && "bg-primary text-white"
                )}
              >
                <FormInput className="h-4 w-4" />
                Forms & Reports
                {formsReportsExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {formsReportsExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {formsReportsItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setFormsReportsExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Inventory Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setInventoryExpanded(true)}
              onMouseLeave={() => setInventoryExpanded(false)}
            >
              <Button
                variant={isInventoryActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isInventoryActive && "bg-primary text-white"
                )}
              >
                <Package className="h-4 w-4" />
                Inventory
                {inventoryExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {inventoryExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {inventoryItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setInventoryExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* QC & Maintenance Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setQcMaintenanceExpanded(true)}
              onMouseLeave={() => setQcMaintenanceExpanded(false)}
            >
              <Button
                variant={isQcMaintenanceActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isQcMaintenanceActive && "bg-primary text-white"
                )}
              >
                <Shield className="h-4 w-4" />
                QC & Maintenance
                {qcMaintenanceExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {qcMaintenanceExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {qcMaintenanceItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setQcMaintenanceExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Employees Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setEmployeesExpanded(true)}
              onMouseLeave={() => setEmployeesExpanded(false)}
            >
              <Button
                variant={isEmployeesActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isEmployeesActive && "bg-primary text-white"
                )}
              >
                <Users className="h-4 w-4" />
                Employees
                {employeesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {employeesExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {employeesItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setEmployeesExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Finance Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setFinanceExpanded(true)}
              onMouseLeave={() => setFinanceExpanded(false)}
            >
              <Button
                variant={isFinanceActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isFinanceActive && "bg-primary text-white"
                )}
              >
                <DollarSign className="h-4 w-4" />
                Finance
                {financeExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {financeExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {financeItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setFinanceExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Test Dashboards Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setTestDashboardsExpanded(true)}
              onMouseLeave={() => setTestDashboardsExpanded(false)}
            >
              <Button
                variant={isTestDashboardsActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isTestDashboardsActive && "bg-primary text-white"
                )}
              >
                <TestTube className="h-4 w-4" />
                Test Dashboards
                {testDashboardsExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {testDashboardsExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {testDashboardsItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setTestDashboardsExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Purchase Orders Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setPurchaseOrdersExpanded(true)}
              onMouseLeave={() => setPurchaseOrdersExpanded(false)}
            >
              <Button
                variant={isPurchaseOrdersActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isPurchaseOrdersActive && "bg-primary text-white"
                )}
              >
                <ClipboardList className="h-4 w-4" />
                Purchase Orders
                {purchaseOrdersExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {purchaseOrdersExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {purchaseOrdersItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setPurchaseOrdersExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Production Scheduling Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setProductionSchedulingExpanded(true)}
              onMouseLeave={() => setProductionSchedulingExpanded(false)}
            >
              <Button
                variant={isProductionSchedulingActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isProductionSchedulingActive && "bg-primary text-white"
                )}
              >
                <Calendar className="h-4 w-4" />
                Production Scheduling
                {productionSchedulingExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {productionSchedulingExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {productionSchedulingItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setProductionSchedulingExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Department Queue Management Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setDepartmentQueueExpanded(true)}
              onMouseLeave={() => setDepartmentQueueExpanded(false)}
            >
              <Button
                variant={isDepartmentQueueActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isDepartmentQueueActive && "bg-primary text-white"
                )}
              >
                <Factory className="h-4 w-4" />
                Department Queue Management
                {departmentQueueExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {departmentQueueExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[250px]">
                  {departmentQueueItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setDepartmentQueueExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Verified Modules Dropdown */}
            <div 
              className="relative"
              onMouseEnter={() => setVerifiedModulesExpanded(true)}
              onMouseLeave={() => setVerifiedModulesExpanded(false)}
            >
              <Button
                variant={isVerifiedModulesActive ? "default" : "ghost"}
                className={cn(
                  "flex items-center gap-2 text-sm",
                  isVerifiedModulesActive && "bg-primary text-white"
                )}
              >
                <Settings className="h-4 w-4" />
                Verified Modules
                {verifiedModulesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
              
              {verifiedModulesExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                  {verifiedModulesItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setVerifiedModulesExpanded(false)}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            

          </nav>

          <div className="flex items-center space-x-4">
            <InstallPWAButton />
            <span className="text-sm text-gray-600">Manufacturing ERP System</span>
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-gray-200">
        <div className="px-4 py-2">
          <nav className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className={cn(
                      "flex items-center gap-2 text-xs",
                      isActive && "bg-primary text-white"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
            
            {/* Forms & Reports in Mobile */}
            <div className="relative">
              <Button
                variant={isFormsReportsActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "flex items-center gap-2 text-xs",
                  isFormsReportsActive && "bg-primary text-white"
                )}
                onClick={() => setFormsReportsExpanded(!formsReportsExpanded)}
              >
                <FormInput className="h-3 w-3" />
                Forms & Reports
                {formsReportsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
              
              {formsReportsExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[150px]">
                  {formsReportsItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setFormsReportsExpanded(false)}
                        >
                          <Icon className="h-3 w-3" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Verified Modules in Mobile */}
            <div className="relative">
              <Button
                variant={isVerifiedModulesActive ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "flex items-center gap-2 text-xs",
                  isVerifiedModulesActive && "bg-primary text-white"
                )}
                onClick={() => setVerifiedModulesExpanded(!verifiedModulesExpanded)}
              >
                <Settings className="h-3 w-3" />
                Verified Modules
                {verifiedModulesExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </Button>
              
              {verifiedModulesExpanded && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[150px]">
                  {verifiedModulesItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-gray-100",
                            isActive && "bg-primary text-white hover:bg-primary"
                          )}
                          onClick={() => setVerifiedModulesExpanded(false)}
                        >
                          <Icon className="h-3 w-3" />
                          {item.label}
                        </button>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
            

          </nav>
        </div>
      </div>
    </header>
  );
}
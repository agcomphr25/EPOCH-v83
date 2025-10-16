import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import {
  Factory,
  User,
  FileText,
  TrendingDown,
  Plus,
  Settings,
  Package,
  FilePenLine,
  ClipboardList,
  BarChart,
  ChevronDown,
  ChevronRight,
  FormInput,
  PieChart,
  Scan,
  Warehouse,
  Shield,
  Wrench,
  Users,
  TestTube,
  DollarSign,
  Receipt,
  TrendingUp,
  List,
  BookOpen,
  Calendar,
  CheckSquare,
  Truck,
  Mail,
  MessageSquare,
  CreditCard,
  XCircle,
  Cog,
  ArrowRight,
  LogOut,
  Scissors,
  MapPin,
  Snowflake,
  ShoppingCart,
  GraduationCap,
  Home,
  FileSpreadsheet,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import InstallPWAButton from './InstallPWAButton';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasFullAccess, hasRouteAccess } from '@/config/userPermissions';
import { getDashboardRoute } from '@/config/dashboardMapping';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuContent,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuIndicator,
  NavigationMenuViewport,
} from '@/components/ui/navigation-menu';

export default function Navigation() {
  const [location, setLocation] = useLocation();

  // Check if we're in deployment environment to show logout button
  const isDeploymentEnvironment = () => {
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const isReplitEditor =
      hostname.includes('replit.dev') && !hostname.includes('.replit.dev');
    return !isLocalhost && !isReplitEditor;
  };

  // Fetch current user data
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const token =
        localStorage.getItem('sessionToken') ||
        localStorage.getItem('jwtToken');

      // In development, check localStorage for a stored username
      if (!isDeploymentEnvironment()) {
        const storedUsername = localStorage.getItem('dev_username');
        if (storedUsername) {
          return { username: storedUsername };
        }
        return null;
      }

      if (!token) {
        return null;
      }

      try {
        const response = await fetch('/api/auth/session', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const userData = await response.json();
          return userData;
        }
        return null;
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Logout function
  const handleLogout = async () => {
    try {
      // Call backend logout endpoint to destroy session
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include', // Include cookies
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear any local storage tokens
      localStorage.removeItem('sessionToken');
      localStorage.removeItem('jwtToken');

      // Redirect to login page
      window.location.href = '/login';
    }
  };

  const [verifiedModulesExpanded, setVerifiedModulesExpanded] = useState(false);
  const [formsReportsExpanded, setFormsReportsExpanded] = useState(false);
  const [trainingExpanded, setTrainingExpanded] = useState(false);
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [employeesExpanded, setEmployeesExpanded] = useState(false);
  const [qcMaintenanceExpanded, setQcMaintenanceExpanded] = useState(false);
  const [financeExpanded, setFinanceExpanded] = useState(false);
  const [userDashboardsExpanded, setUserDashboardsExpanded] = useState(false);
  const [purchaseOrdersExpanded, setPurchaseOrdersExpanded] = useState(false);
  const [productionSchedulingExpanded, setProductionSchedulingExpanded] =
    useState(false);
  const [departmentQueueExpanded, setDepartmentQueueExpanded] = useState(false);

  // Helper function to close all dropdowns
  const closeAllDropdowns = useCallback(() => {
    setFormsReportsExpanded(false);
    setTrainingExpanded(false);
    setInventoryExpanded(false);
    setQcMaintenanceExpanded(false);
    setEmployeesExpanded(false);
    setFinanceExpanded(false);
    setUserDashboardsExpanded(false);
    setPurchaseOrdersExpanded(false);
    setProductionSchedulingExpanded(false);
    setDepartmentQueueExpanded(false);
    setVerifiedModulesExpanded(false);
  }, []);

  // Helper function to toggle dropdown
  const toggleDropdown = useCallback(
    (
      dropdownName: string,
      isExpanded: boolean,
      setExpanded: (value: boolean) => void
    ) => {
      setExpanded(!isExpanded);

      // Close other dropdowns when opening a new one
      if (!isExpanded) {
        if (dropdownName !== 'formsReports') setFormsReportsExpanded(false);
        if (dropdownName !== 'training') setTrainingExpanded(false);
        if (dropdownName !== 'inventory') setInventoryExpanded(false);
        if (dropdownName !== 'qcMaintenance') setQcMaintenanceExpanded(false);
        if (dropdownName !== 'employees') setEmployeesExpanded(false);
        if (dropdownName !== 'finance') setFinanceExpanded(false);
        if (dropdownName !== 'userDashboards') setUserDashboardsExpanded(false);
        if (dropdownName !== 'purchaseOrders') setPurchaseOrdersExpanded(false);
        if (dropdownName !== 'productionScheduling')
          setProductionSchedulingExpanded(false);
        if (dropdownName !== 'departmentQueue')
          setDepartmentQueueExpanded(false);
        if (dropdownName !== 'verifiedModules')
          setVerifiedModulesExpanded(false);
      }
    },
    []
  );

  const navItems = [
    {
      path: '/order-entry',
      label: 'Order Entry',
      icon: Plus,
      description: 'Create single orders',
    },
    {
      path: '/orders-list',
      label: 'All Orders',
      icon: List,
      description: 'View all created orders',
    },
    {
      path: '/customers',
      label: 'Customer Management',
      icon: Users,
      description: 'Manage customer database',
    },

    {
      path: '/bom-administration',
      label: 'BOM Administration',
      icon: Package,
      description: 'Manage Bill of Materials for P2 operations',
    },
    {
      path: '/robust-bom-administration',
      label: 'P2 Robust BOM',
      icon: Factory,
      description:
        'Advanced BOM management with lifecycle tracking and cost analysis',
    },
    {
      path: '/barcode-scanner',
      label: 'Barcode Scanner',
      icon: Scan,
      description:
        'Scan order barcodes to view pricing summary and payment status',
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
      description: 'Scan inventory items',
    },
    {
      path: '/inventory/dashboard',
      label: 'Inventory Dashboard',
      icon: Warehouse,
      description: 'View inventory overview',
    },
    {
      path: '/inventory/manager',
      label: 'Inventory Manager',
      icon: Package,
      description: 'Manage inventory items',
    },
    {
      path: '/inventory/receiving',
      label: 'Receiving',
      icon: Receipt,
      description: 'Receive incoming inventory',
    },
    {
      path: '/inventory/enhanced-mrp',
      label: 'Enhanced Inventory & MRP',
      icon: Factory,
      description:
        'Advanced inventory management with material requirements planning',
    },
    {
      path: '/vendors',
      label: 'Vendor Management',
      icon: Users,
      description: 'Manage vendors and suppliers',
    },
    {
      path: '/vendor-pos',
      label: 'Vendor Purchase Orders',
      icon: ShoppingCart,
      description: 'Create and manage purchase orders to vendors',
    },
  ];

  const formsReportsItems = [
    {
      path: '/orders-management',
      label: 'Orders Management',
      icon: ClipboardList,
      description:
        'Comprehensive orders management with filtering and CSV export',
    },
    {
      path: '/enhanced-forms',
      label: 'Enhanced Forms',
      icon: FormInput,
      description: 'Advanced form builder with drag-and-drop',
    },
    {
      path: '/enhanced-reports',
      label: 'Enhanced Reports',
      icon: PieChart,
      description: 'Advanced reporting with PDF/CSV export',
    },
    {
      path: '/ag-bottom-metal-report',
      label: 'AG Bottom Metal Report',
      icon: DollarSign,
      description:
        'Comprehensive pricing analysis for AG bottom metal orders by price tiers',
    },
    {
      path: '/p2-forms',
      label: 'P2 Forms',
      icon: ClipboardList,
      description: 'P2 specialized forms and documentation',
    },
    {
      path: '/waste-management-form',
      label: 'Waste Management Form',
      icon: FileText,
      description: 'Waste Management Discovery Form for client assessment',
    },
    {
      path: '/task-tracker',
      label: 'Task Tracker',
      icon: CheckSquare,
      description:
        'Collaborative task management with GJ, TM, and Finished checkboxes',
    },
    {
      path: '/kickback-tracking',
      label: 'Kickback Tracking',
      icon: TrendingDown,
      description: 'Track production issues and resolutions',
    },
    {
      path: '/document-management',
      label: 'Document Management',
      icon: FileText,
      description:
        'Unified document repository with advanced tagging and organization',
    },
    {
      path: '/calendar',
      label: 'Calendar',
      icon: Calendar,
      description: 'Multi-user calendar system',
    },
    {
      path: '/shipping-tracker',
      label: 'Shipping Tracker',
      icon: Package,
      description: 'Track stocks shipped by company week',
    },
  ];

  const qcMaintenanceItems = [
    {
      path: '/qc',
      label: 'Quality Control',
      icon: Shield,
      description: 'QC inspections and definitions',
    },
    {
      path: '/nonconformance',
      label: 'Nonconformance Tracking',
      icon: ClipboardList,
      description: 'Track and manage quality issues and dispositions',
    },
    {
      path: '/maintenance',
      label: 'Maintenance',
      icon: Wrench,
      description: 'Preventive maintenance schedules',
    },
  ];

  const trainingItems = [
    {
      path: '/training',
      label: 'All Training Modules',
      icon: GraduationCap,
      description: 'View all available training modules',
    },
    {
      path: '/training-management',
      label: 'Training Management',
      icon: GraduationCap,
      description: 'Manage training modules and content',
    },
    {
      path: '/training-matrix',
      label: 'Training Matrix',
      icon: GraduationCap,
      description: 'View employee training completion matrix',
    },
    {
      path: '/training-matrix-import',
      label: 'Import Training Matrix',
      icon: FileSpreadsheet,
      description: 'Import training matrix from Google Sheets',
    },
    {
      path: '/training-matrix-manage',
      label: 'Manage Training Assignments',
      icon: GraduationCap,
      description: 'Add, edit, and delete training assignments for employees',
    },
  ];

  const employeesItems = [
    {
      path: '/employee',
      label: 'Employee Management',
      icon: Users,
      description: 'Manage employee profiles, certifications, and evaluations',
    },
    {
      path: '/user-management',
      label: 'User Management',
      icon: User,
      description: 'Manage usernames, passwords, and user access',
    },
    {
      path: '/employee-portal',
      label: 'Employee Portal',
      icon: User,
      description: 'Employee time tracking and onboarding',
    },
    {
      path: '/time-clock-admin',
      label: 'Time Clock Admin',
      icon: Settings,
      description: 'Manage time clock entries and punches',
    },
  ];

  const financeItems = [
    {
      path: '/finance/dashboard',
      label: 'Finance Dashboard',
      icon: BarChart,
      description: 'Financial overview and KPIs',
    },
    {
      path: '/payment-management',
      label: 'Payment Management',
      icon: CreditCard,
      description: 'Process credit card payments and view transaction history',
    },
    {
      path: '/refund-request',
      label: 'Refund Request',
      icon: TrendingDown,
      description: 'Submit refund requests for customer orders',
    },
    {
      path: '/refund-queue',
      label: 'Refund Queue',
      icon: List,
      description: 'Review and approve pending refund requests',
    },
    {
      path: '/finance/ap',
      label: 'AP Journal',
      icon: Receipt,
      description: 'Accounts Payable transactions',
    },
    {
      path: '/finance/ar',
      label: 'AR Journal',
      icon: DollarSign,
      description: 'Accounts Receivable transactions',
    },
    {
      path: '/finance/cogs',
      label: 'COGS Report',
      icon: TrendingUp,
      description: 'Cost of Goods Sold reporting',
    },
    {
      path: '/finance/monthly-fulfilled',
      label: 'Monthly FULFILLED Report',
      icon: FileText,
      description: 'Monthly report of orders changed to FULFILLED status',
    },
  ];

  const userDashboardsItems = [
    {
      path: '/ag-dashboard',
      label: 'AG Dashboard',
      icon: BarChart,
      description:
        'Unified dashboard with Pipeline Overview, All Orders, and Layup Scheduler',
    },
    {
      path: '/admin-dashboard',
      label: 'ADMIN Dashboard',
      icon: Factory,
      description: 'Complete navigation dashboard for all system sections',
    },
    {
      path: '/johnl-dashboard',
      label: 'JOHNL Dashboard',
      icon: Settings,
      description:
        'CNC Operations dashboard with queue, orders, and employee portal',
    },
    {
      path: '/jens-dashboard',
      label: 'JENS Dashboard',
      icon: Shield,
      description:
        'Quality Control dashboard with Finish QC queue, orders, and employee portal',
    },
    {
      path: '/staciw-dashboard',
      label: 'STACIW Dashboard',
      icon: Factory,
      description: 'Comprehensive order and production management dashboard',
    },
    {
      path: '/darleneb-dashboard',
      label: 'DARLENEB Dashboard',
      icon: Users,
      description: 'Order management and customer relations dashboard',
    },
    {
      path: '/tims-dashboard',
      label: 'TIMS Dashboard',
      icon: Cog,
      description: 'CNC operations and maintenance management dashboard',
    },
    {
      path: '/bradw-dashboard',
      label: 'BRADW Dashboard',
      icon: Users,
      description: 'Gunsmith queue, orders, and employee portal dashboard',
    },
    {
      path: '/faleeshah-dashboard',
      label: 'FALEESHAH Dashboard',
      icon: Shield,
      description: 'Quality Control, Shipping & Customer Management dashboard',
    },
    {
      path: '/joeyb-dashboard',
      label: 'JOEYB Dashboard',
      icon: Settings,
      description: 'Cutting Table, CNC & Gunsmith Operations dashboard',
    },
  ];

  const purchaseOrdersItems = [
    {
      path: '/purchase-orders',
      label: 'P1 Purchase Orders',
      icon: ClipboardList,
      description: 'Module 12: Customer PO management',
    },
    {
      path: '/p2-purchase-orders',
      label: 'P2 Purchase Orders',
      icon: FileText,
      description:
        'P2 customer management and purchase orders with Part #, Quantity, Price',
    },
    {
      path: '/po-products',
      label: 'PO Products',
      icon: Package,
      description: 'Product configuration for purchase orders',
    },
  ];

  const verifiedModulesItems = [
    {
      path: '/',
      label: 'Order Management',
      icon: FileText,
      description: 'View orders and import historical data',
    },
    {
      path: '/discounts',
      label: 'Discount Management',
      icon: TrendingDown,
      description: 'Configure discounts and sales',
    },
    {
      path: '/feature-manager',
      label: 'Feature Manager',
      icon: Settings,
      description: 'Configure order features',
    },
    {
      path: '/stock-models',
      label: 'Stock Models',
      icon: Package,
      description: 'Manage stock models and pricing',
    },
    {
      path: '/module8-test',
      label: 'Module 8 Test',
      icon: TestTube,
      description: 'Test API integrations and communications',
    },
    {
      path: '/order-department-transfer',
      label: 'Order Department Transfer',
      icon: ArrowRight,
      description: 'Move orders between departments for corrections',
    },
    {
      path: '/metal-accessories',
      label: 'Metal Accessories Tracker',
      icon: Package,
      description: 'Track metal accessories inventory and production demands',
    },
  ];

  const productionSchedulingItems = [
    {
      path: '/layup-scheduler',
      label: 'P1 Layup Scheduler',
      icon: Calendar,
      description:
        'Schedule and manage layup production orders with drag-and-drop interface',
    },
    {
      path: '/p2-layup-scheduler',
      label: 'P2 Layup Scheduler',
      icon: Calendar,
      description: 'Schedule and manage P2 layup production orders',
    },
    {
      path: '/production-tracking',
      label: 'Production Tracking',
      icon: TrendingUp,
      description: 'Track production orders from POs',
    },
  ];

  const departmentQueueItems = [
    {
      path: '/department-queue/production-queue',
      label: 'Production Queue',
      icon: List,
      description: 'Production queue department manager',
    },
    {
      path: '/department-queue/layup-plugging',
      label: 'Layup/Plugging',
      icon: Factory,
      description: 'Layup and plugging department manager',
    },
    {
      path: '/department-queue/barcode',
      label: 'Barcode',
      icon: Scan,
      description: 'Barcode processing department manager',
    },
    {
      path: '/department-queue/cnc',
      label: 'CNC',
      icon: Settings,
      description: 'CNC machining department manager',
    },
    {
      path: '/department-queue/gunsmith',
      label: 'Gunsmith',
      icon: Wrench,
      description: 'Gunsmith department manager',
    },
    {
      path: '/department-queue/finish',
      label: 'Finish',
      icon: CheckSquare,
      description: 'Finish assignment department manager',
    },
    {
      path: '/department-queue/finish-qc',
      label: 'Finish QC',
      icon: Shield,
      description: 'Finish quality control department manager',
    },
    {
      path: '/department-queue/paint',
      label: 'Paint',
      icon: Package,
      description: 'Paint department manager',
    },
    {
      path: '/department-queue/qc-shipping',
      label: 'Shipping QC',
      icon: TrendingUp,
      description: 'Shipping quality control department manager',
    },
    {
      path: '/department-queue/shipping',
      label: 'Shipping',
      icon: Package,
      description: 'Shipping department manager',
    },
  ];

  // Helper function to filter navigation items based on user permissions
  const filterByPermissions = <T extends { path: string }>(
    items: T[],
    username: string | undefined
  ): T[] => {
    if (!username) {
      return []; // No user logged in = no nav items
    }

    if (hasFullAccess(username)) {
      return items; // Admin users see everything
    }

    return items.filter((item) => hasRouteAccess(username, item.path));
  };

  // Apply permission filtering to all navigation arrays
  const filteredNavItems = useMemo(
    () => filterByPermissions(navItems, currentUser?.username),
    [navItems, currentUser?.username]
  );
  const filteredInventoryItems = useMemo(
    () => filterByPermissions(inventoryItems, currentUser?.username),
    [inventoryItems, currentUser?.username]
  );
  const filteredFormsReportsItems = useMemo(
    () => filterByPermissions(formsReportsItems, currentUser?.username),
    [formsReportsItems, currentUser?.username]
  );
  const filteredQcMaintenanceItems = useMemo(
    () => filterByPermissions(qcMaintenanceItems, currentUser?.username),
    [qcMaintenanceItems, currentUser?.username]
  );
  const filteredTrainingItems = useMemo(
    () => filterByPermissions(trainingItems, currentUser?.username),
    [trainingItems, currentUser?.username]
  );
  const filteredEmployeesItems = useMemo(
    () => filterByPermissions(employeesItems, currentUser?.username),
    [employeesItems, currentUser?.username]
  );
  const filteredFinanceItems = useMemo(
    () => filterByPermissions(financeItems, currentUser?.username),
    [financeItems, currentUser?.username]
  );
  const filteredUserDashboardsItems = useMemo(
    () => filterByPermissions(userDashboardsItems, currentUser?.username),
    [userDashboardsItems, currentUser?.username]
  );
  const filteredPurchaseOrdersItems = useMemo(
    () => filterByPermissions(purchaseOrdersItems, currentUser?.username),
    [purchaseOrdersItems, currentUser?.username]
  );
  const filteredVerifiedModulesItems = useMemo(
    () => filterByPermissions(verifiedModulesItems, currentUser?.username),
    [verifiedModulesItems, currentUser?.username]
  );
  const filteredProductionSchedulingItems = useMemo(
    () => filterByPermissions(productionSchedulingItems, currentUser?.username),
    [productionSchedulingItems, currentUser?.username]
  );
  const filteredDepartmentQueueItems = useMemo(
    () => filterByPermissions(departmentQueueItems, currentUser?.username),
    [departmentQueueItems, currentUser?.username]
  );

  const isVerifiedModulesActive = verifiedModulesItems.some(
    (item) => location === item.path
  );
  const isFormsReportsActive = formsReportsItems.some(
    (item) => location === item.path
  );
  const isTrainingActive = trainingItems.some((item) => location === item.path);
  const isInventoryActive = inventoryItems.some(
    (item) => location === item.path
  );
  const isQcMaintenanceActive = qcMaintenanceItems.some(
    (item) => location === item.path
  );
  const isEmployeesActive = employeesItems.some(
    (item) => location === item.path
  );
  const isFinanceActive = financeItems.some((item) => location === item.path);
  const isUserDashboardsActive = userDashboardsItems.some(
    (item) => location === item.path
  );
  const isPurchaseOrdersActive = purchaseOrdersItems.some(
    (item) => location === item.path
  );
  const isProductionSchedulingActive = productionSchedulingItems.some(
    (item) => location === item.path
  );
  const isDepartmentQueueActive = departmentQueueItems.some(
    (item) => location === item.path
  );

  // Close all dropdowns when navigating to a new page
  useEffect(() => {
    closeAllDropdowns();
  }, [location, closeAllDropdowns]);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center py-4 gap-4">
          <div className="flex items-center gap-3">
            <Factory className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold text-gray-900">EPOCH v8</h1>

            {/* Home button - navigates to user's personalized dashboard */}
            <Link
              href={
                currentUser?.username
                  ? getDashboardRoute(currentUser.username)
                  : '/'
              }
            >
              <Button
                variant="ghost"
                size="sm"
                className="flex items-center gap-2"
                data-testid="button-home"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline">Home</span>
              </Button>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-wrap items-center gap-2 lg:gap-4">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;

              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    className={cn(
                      'flex items-center gap-2 text-sm',
                      isActive && 'bg-primary text-white'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}

            {/* Communications Dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                className="flex items-center gap-2 text-sm"
                onClick={() => (window.location.href = '/communications/inbox')}
              >
                <Mail className="h-4 w-4" />
                Communications
              </Button>
            </div>

            {/* Forms & Reports Dropdown */}
            {filteredFormsReportsItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isFormsReportsActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isFormsReportsActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'formsReports',
                      formsReportsExpanded,
                      setFormsReportsExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredFormsReportsItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Training Dropdown */}
            {filteredTrainingItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isTrainingActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isTrainingActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'training',
                      trainingExpanded,
                      setTrainingExpanded
                    )
                  }
                >
                  <GraduationCap className="h-4 w-4" />
                  Training
                  {trainingExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {trainingExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredTrainingItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Inventory Dropdown */}
            {filteredInventoryItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isInventoryActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isInventoryActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'inventory',
                      inventoryExpanded,
                      setInventoryExpanded
                    )
                  }
                >
                  <Warehouse className="h-4 w-4" />
                  Inventory
                  {inventoryExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {inventoryExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredInventoryItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* QC & Maintenance Dropdown */}
            {filteredQcMaintenanceItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isQcMaintenanceActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isQcMaintenanceActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'qcMaintenance',
                      qcMaintenanceExpanded,
                      setQcMaintenanceExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredQcMaintenanceItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Employees Dropdown */}
            {filteredEmployeesItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isEmployeesActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isEmployeesActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'employees',
                      employeesExpanded,
                      setEmployeesExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredEmployeesItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Finance Dropdown */}
            {filteredFinanceItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isFinanceActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isFinanceActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'finance',
                      financeExpanded,
                      setFinanceExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredFinanceItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Purchase Orders Dropdown */}
            {filteredPurchaseOrdersItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isPurchaseOrdersActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isPurchaseOrdersActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'purchaseOrders',
                      purchaseOrdersExpanded,
                      setPurchaseOrdersExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredPurchaseOrdersItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Production Scheduling Dropdown */}
            {filteredProductionSchedulingItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isProductionSchedulingActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isProductionSchedulingActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'productionScheduling',
                      productionSchedulingExpanded,
                      setProductionSchedulingExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredProductionSchedulingItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Department Manager Dropdown */}
            {filteredDepartmentQueueItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isDepartmentQueueActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isDepartmentQueueActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'departmentQueue',
                      departmentQueueExpanded,
                      setDepartmentQueueExpanded
                    )
                  }
                >
                  <Factory className="h-4 w-4" />
                  P1 Department Manager
                  {departmentQueueExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {departmentQueueExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[250px]">
                    {filteredDepartmentQueueItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Verified Modules Dropdown */}
            {filteredVerifiedModulesItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isVerifiedModulesActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isVerifiedModulesActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'verifiedModules',
                      verifiedModulesExpanded,
                      setVerifiedModulesExpanded
                    )
                  }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredVerifiedModulesItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = location === item.path;

                      return (
                        <button
                          key={item.path}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100',
                            isActive && 'bg-primary text-white hover:bg-primary'
                          )}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>

          <div className="flex flex-wrap items-center gap-2 lg:gap-4">
            <InstallPWAButton />
            <span className="text-sm text-gray-600">
              Manufacturing ERP System
            </span>
            {isDeploymentEnvironment() && currentUser?.username && (
              <span
                className="text-sm font-medium text-gray-700"
                data-testid="text-username"
              >
                {currentUser.firstName || currentUser.username}
              </span>
            )}
            {isDeploymentEnvironment() && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            )}
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

// Helper component for NavigationMenu
function ListItem(props: {
  className?: string;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link href={props.href}>
          <a
            className={cn(
              'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
              props.className
            )}
          >
            <div className="text-sm font-medium leading-none">
              {props.title}
            </div>
            <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
              {props.children}
            </p>
          </a>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}

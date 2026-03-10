import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { KEYBOARD_SHORTCUTS, formatShortcut } from '@/config/keyboardShortcuts';

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
  BarChart3,
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
  HelpCircle,
  Scissors,
  MapPin,
  Snowflake,
  ShoppingCart,
  GraduationCap,
  Home,
  FileSpreadsheet,
  Search,
  Award,
  Building2,
  Calculator,
  Route,
  Megaphone,
  FileCheck,
  Printer,
  Activity,
  FolderKanban,
  Clock,
  FileSignature,
  Archive,
  Image,
  Eye,
  Boxes,
  Filter,
  Layers,
  Ticket,
  Database,
  QrCode,
  AlertTriangle,
  CalendarDays,
  Mic,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import InstallPWAButton from './InstallPWAButton';
import GlobalSearch from './GlobalSearch';
import ExecutiveRundownDropdown from './ExecutiveRundownDropdown';
import { useQuery } from '@tanstack/react-query';
import { hasFullAccess, hasRouteAccess, isUserInPermissionsList, DEFAULT_USER_ROUTES } from '@/config/userPermissions';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check if we're in deployment environment to show logout button
  const isDeploymentEnvironment = () => {
    const hostname = window.location.hostname;
    const isLocalhost =
      hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const isReplitEditor = hostname.includes('replit.dev');
    return !isLocalhost && !isReplitEditor;
  };

  // Fetch current user data
  const { data: currentUser, refetch: refetchUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const token =
        localStorage.getItem('sessionToken') ||
        localStorage.getItem('jwtToken');

      if (!isDeploymentEnvironment()) {
        const storedUsername = localStorage.getItem('dev_username');
        if (storedUsername) {
          return { username: storedUsername };
        }
        try {
          const response = await fetch('/api/auth/session', {
            credentials: 'include',
          });
          if (response.ok) {
            return await response.json();
          }
        } catch (error) {
          // Fall through to default
        }
        return { username: 'admin', role: 'ADMIN' };
      }

      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
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

  // Listen for storage events to refetch user data after login
  useEffect(() => {
    const handleStorageChange = () => {
      refetchUser();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refetchUser]);

  // Global keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === KEYBOARD_SHORTCUTS.GLOBAL_SEARCH.key) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      localStorage.removeItem('dev_username');

      // Redirect to login page
      window.location.href = '/login';
    }
  };

  const [verifiedModulesExpanded, setVerifiedModulesExpanded] = useState(false);
  const [orderManagementExpanded, setOrderManagementExpanded] = useState(false);
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
  const [centralStorageExpanded, setCentralStorageExpanded] = useState(false);

  // Helper function to close all dropdowns
  const closeAllDropdowns = useCallback(() => {
    setOrderManagementExpanded(false);
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
    setCentralStorageExpanded(false);
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
        if (dropdownName !== 'orderManagement') setOrderManagementExpanded(false);
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
        if (dropdownName !== 'centralStorage')
          setCentralStorageExpanded(false);
      }
    },
    []
  );

  const navItems = [
    {
      path: '/customers',
      label: 'Customer Management',
      icon: Users,
      description: 'Manage customer database',
    },
    {
      path: '/tickets',
      label: 'Tickets',
      icon: Ticket,
      description: 'Internal ticketing for complaints and issues',
    },
    // {
    //   path: '/bom-administration',
    //   label: 'BOM Administration',
    //   icon: Package,
    //   description: 'Manage Bill of Materials for P2 operations',
    // },
    {
      path: '/robust-bom-administration',
      label: 'P2 Robust BOM',
      icon: Factory,
      description:
        'Advanced BOM management with lifecycle tracking and cost analysis',
    },
    {
      path: '/p2-control-center',
      label: 'P2 Control Center',
      icon: Factory,
      description: 'Complete P2 workflow: orders, BOMs, scheduling, routing, and certifications',
    },
    {
      path: '/barcode-scanner',
      label: 'Barcode Scanner',
      icon: Scan,
      description:
        'Scan order barcodes to view pricing summary and payment status',
    },
    {
      path: '/bulk-barcode-reprint',
      label: 'Bulk Barcode Reprint',
      icon: Printer,
      description:
        'Select customer and reprint barcodes for multiple in-progress orders',
    },
    {
      path: '/admin/orders',
      label: 'Admin Panel',
      icon: Shield,
      description: 'Advanced order management and editing for administrators',
    },
    {
      path: '/admin/health-checks',
      label: 'System Health Checks',
      icon: Activity,
      description: 'Monitor and test critical system components daily',
    },
    {
      path: '/admin/domain-truth',
      label: 'Domain Truth Inspector',
      icon: Database,
      description: 'Read-only diagnostic tool — inspect true system state and queue eligibility for any order',
    },
    {
      path: '/admin/queue-integrity',
      label: 'Queue Integrity Monitor',
      icon: ShieldCheck,
      description: 'Detect mismatches between expected and actual department queue membership',
    },
    {
      path: '/admin/control-tower',
      label: 'Production Control Tower',
      icon: Factory,
      description: 'Real-time production heatmap with bottleneck detection and pipeline health overview',
    },
    {
      path: '/pdf-templates',
      label: 'PDF Templates',
      icon: FileText,
      description: 'Manage PDF templates with custom logos and styling for P1, P2, RFQ, etc.',
    },
    {
      path: '/watch-rules',
      label: 'Watch Rules',
      icon: Eye,
      description: 'Configure rules to monitor specific customer orders through departments',
    },
    {
      path: '/admin/qr-codes',
      label: 'QR Code Management',
      icon: QrCode,
      description: 'Create and manage QR codes for orders, equipment, and other items',
    },
    {
      path: '/admin/checklist-management',
      label: 'Checklist Management',
      icon: ClipboardList,
      description: 'Create and manage daily, weekly, and monthly checklists for employees',
    },

    // Documentation button disabled per user request - was causing problems
    // {
    //   path: '/documentation',
    //   label: 'Documentation',
    //   icon: BookOpen,
    //   description: 'Complete system architecture and structure'
    // }
  ];

  const orderManagementItems = [
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
      path: '/nonconformance',
      label: 'Nonconforming Tracker',
      icon: XCircle,
      description: 'Track and manage quality issues and dispositions',
    },
    {
      path: '/rts',
      label: 'RTS (Ready to Ship)',
      icon: Truck,
      description: 'View ready-to-ship orders and manage shipments',
    },
  ];

  const inventoryItems = [
    {
      path: '/inventory/scanner',
      label: 'Inventory Scanner',
      icon: Scan,
      description: 'Scan inventory items',
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
      path: '/inventory/parts-request',
      label: 'Parts Requests',
      icon: FileText,
      description: 'Submit and track requests for parts and materials',
    },
    {
      path: '/inventory/consolidated-needs',
      label: 'Consolidated Needs',
      icon: ClipboardList,
      description: 'Admin view of all pending parts requests by vendor',
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
    // {
    //   path: '/enhanced-forms',
    //   label: 'Enhanced Forms',
    //   icon: FormInput,
    //   description: 'Advanced form builder with drag-and-drop',
    // },
    // {
    //   path: '/enhanced-reports',
    //   label: 'Enhanced Reports',
    //   icon: PieChart,
    //   description: 'Advanced reporting with PDF/CSV export',
    // },
    {
      path: '/finish-qc-completed-report',
      label: 'Finish QC Completed Report',
      icon: CheckSquare,
      description: 'Orders completed in Finish QC by technician and progression user',
    },
    {
      path: '/due-date-capacity',
      label: 'Due Date Capacity Report',
      icon: Calendar,
      description: 'View orders grouped by due date week to identify capacity issues',
    },
    // {
    //   path: '/ag-bottom-metal-report',
    //   label: 'AG Bottom Metal Report',
    //   icon: DollarSign,
    //   description:
    //     'Comprehensive pricing analysis for AG bottom metal orders by price tiers',
    // },
    {
      path: '/waste-management-form',
      label: 'Waste Management Form',
      icon: FileText,
      description: 'Waste Management Discovery Form for client assessment',
    },
    // {
    //   path: '/task-tracker',
    //   label: 'Task Tracker',
    //   icon: CheckSquare,
    //   description:
    //     'Collaborative task management with GJ, TM, and Finished checkboxes',
    // },
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
      path: '/signature-workflow',
      label: 'Signature Routing',
      icon: FileSignature,
      description: 'Create and manage digital signature routing workflows',
    },
    {
      path: '/pdf-signature-tool',
      label: 'PDF Signature Tool',
      icon: FileSignature,
      description: 'Upload a PDF, position your signature, and download the signed document',
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
    {
      path: '/urgent-orders-report',
      label: 'Urgent Orders Report',
      icon: AlertTriangle,
      description: 'View all orders flagged as Urgent or Critical priority',
    },
    {
      path: '/otd-report',
      label: 'OTD Report',
      icon: TrendingUp,
      description: 'On-Time Delivery percentage for shipped and fulfilled orders',
    },
    {
      path: '/gateway-reports',
      label: 'Gateway Reports',
      icon: BarChart3,
      description: 'Track daily production totals for Buttpads, Sandblasting, Duratec, and Texture',
    },
    {
      path: '/master-document-register',
      label: 'Master Document Register',
      icon: FileText,
      description: 'Comprehensive document register with tracking and management',
    },
    {
      path: '/preproduction-checklists',
      label: 'Preproduction Checklist',
      icon: FileCheck,
      description: 'Quality control checklists for preproduction validation',
    },
    {
      path: '/filtered-orders-report',
      label: 'Filtered Orders Report',
      icon: Filter,
      description: 'Filter orders by status with customer exclusions and CSV export',
    },
    {
      path: '/order-heat-map',
      label: 'Order Heat Map',
      icon: MapPin,
      description: 'Visualize order distribution by customer location',
    },
    {
      path: '/fillable-pdf-templates',
      label: 'Fillable PDF Templates',
      icon: FileText,
      description: 'Create and manage fillable PDF templates for customer sign workflows',
    },
  ];

  const travelerItems = [
    {
      path: '/p2-traveler-viewer',
      label: 'Traveler Viewer',
      icon: ClipboardList,
      description: 'View and manage P2 travelers',
    },
    {
      path: '/p2-traveler',
      label: 'Badge Scanner',
      icon: Scan,
      description: 'Scan badges for P2 traveler operations',
    },
    {
      path: '/part-routing-management',
      label: 'Part Routing',
      icon: Route,
      description: 'Manage part routing configurations',
    },
    {
      path: '/p2-department-manager',
      label: 'Department Manager',
      icon: Factory,
      description: 'Manage P2 departments',
    },
    {
      path: '/p2-certifications-manager',
      label: 'Certifications',
      icon: Award,
      description: 'Manage P2 certifications',
    },
    {
      path: '/material-receiving',
      label: 'Material Receiving',
      icon: Package,
      description: 'Receive materials with ICN generation',
    },
    {
      path: '/material-inventory',
      label: 'Material Inventory',
      icon: Boxes,
      description: 'Manage material lots with full traceability',
    },
    {
      path: '/travelers',
      label: 'Traveler Management',
      icon: ClipboardList,
      description: 'Create and manage production travelers',
    },
  ];

  const communicationsItems = [
    {
      path: '/communications/inbox',
      label: 'Inbox',
      icon: Mail,
      description: 'View and manage messages',
    },
    {
      path: '/marketing-communications',
      label: 'Marketing Board',
      icon: Megaphone,
      description: 'Marketing communications board',
    },
    {
      path: '/email-templates',
      label: 'Email Templates',
      icon: FileText,
      description: 'Manage governed email templates',
    },
    {
      path: '/sign-order-page-settings',
      label: 'Sign Order Page',
      icon: FileText,
      description: 'Customize sign order page content',
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
      path: '/maintenance',
      label: 'Preventive Maintenance',
      icon: Calendar,
      description: 'Preventive maintenance schedules',
    },
    {
      path: '/maintenance-events',
      label: 'Maintenance Events',
      icon: Wrench,
      description: 'Work orders for equipment maintenance',
    },
    {
      path: '/assets',
      label: 'Assets',
      icon: Boxes,
      description: 'Equipment and machinery registry',
    },
    {
      path: '/asset-dashboard',
      label: 'Asset Dashboard',
      icon: Activity,
      description: 'Equipment health and maintenance overview',
    },
    {
      path: '/app/production/stations',
      label: 'Timer Station',
      icon: Clock,
      description: 'Step-based timing programs for production processes',
    },
  ];

  const trainingItems = [
    {
      path: '/training-control-center',
      label: 'Training Control Center',
      icon: GraduationCap,
      description: 'Unified training management: modules, matrix, and assignments',
    },
    {
      path: '/training/trainer-dashboard',
      label: 'Trainer Dashboard',
      icon: GraduationCap,
      description: 'Conduct training sessions using the 4-step method',
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
      path: '/onboarding',
      label: 'Onboarding',
      icon: Users,
      description: 'Admin-driven employee onboarding sessions',
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
    {
      path: '/badge-configuration',
      label: 'Badge Configuration',
      icon: Scan,
      description: 'Configure employee badge actions and workflows',
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
      path: '/finance/cost-centers',
      label: 'Cost Centers',
      icon: Building2,
      description: 'Manage cost centers for expense tracking and budgeting',
    },
    {
      path: '/finance/cost-accounting',
      label: 'Cost Accounting',
      icon: Calculator,
      description: 'Manage chart of accounts, monthly entries, and cost allocations',
    },
    {
      path: '/finance/accounting',
      label: 'Accounting Journal',
      icon: Calculator,
      description: 'View double-entry journal entries for wire payments',
    },
    {
      path: '/payment-management',
      label: 'Payment Management',
      icon: CreditCard,
      description: 'Process credit card payments and view transaction history',
    },
    {
      path: '/finance/bulk-payment',
      label: 'Bulk Payment',
      icon: CreditCard,
      description: 'Record payments for multiple customer orders at once',
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
      path: '/credit-memo',
      label: 'Credit Memo',
      icon: FileText,
      description: 'Create and apply credit memos to customer invoices',
    },
    {
      path: '/finance/ap',
      label: 'AP Journal',
      icon: Receipt,
      description: 'Accounts Payable transactions',
    },
    {
      path: '/finance/ar-journal',
      label: 'AR Journal',
      icon: DollarSign,
      description: 'Accounts Receivable transactions',
    },
    {
      path: '/finance/invoices',
      label: 'Invoices (AR)',
      icon: FileText,
      description: 'Accounts Receivable invoices and tracking',
    },
    {
      path: '/finance/ar-aging',
      label: 'AR Aging',
      icon: FileText,
      description: 'Accounts Receivable aging summary',
    },
    {
      path: '/finance/ar-payments',
      label: 'AR Payments',
      icon: DollarSign,
      description: 'Accounts Receivable payments and allocations',
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
    {
      path: '/payment-analytics',
      label: 'Payment Analytics',
      icon: TrendingUp,
      description: 'Track payments by type (Phone/Online) with monthly breakdowns',
    },
    {
      path: '/historical-data',
      label: 'Historical Data Entry',
      icon: Database,
      description: 'Enter legacy financial data for comparison with current analytics',
    },
    {
      path: '/finance/shipped-discounts',
      label: 'Shipped Discounts',
      icon: TrendingDown,
      description: 'Track income reduction from discounts on shipped orders',
    },
    {
      path: '/finance/invoice-breakdown',
      label: 'Invoice Breakdown',
      icon: PieChart,
      description: 'View invoice totals by category (Stock Model, Bottom Metal, etc.)',
    },
    {
      path: '/finance/scrap-report',
      label: 'Scrap Report',
      icon: TrendingDown,
      description: 'Track orders that were scrapped by month',
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
    {
      path: '/production-command-center',
      label: 'Production Command Center',
      icon: Activity,
      description: "Matt's production-focused operational awareness dashboard",
    },
    {
      path: '/production-control-center',
      label: 'Production Control Center',
      icon: Factory,
      description: 'Real-time production monitoring and operational awareness',
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
      path: '/p2-control-center',
      label: 'P2 Control Center',
      icon: Factory,
      description: 'Complete P2 workflow: orders, BOMs, scheduling, routing, and certifications',
    },
    {
      path: '/manufacturing-queue',
      label: 'Manufacturing Queue',
      icon: Factory,
      description:
        'View and manage manufactured parts queue by department (Cutting Table, CNC, Cores)',
    },
    {
      path: '/po-products',
      label: 'PO Product Items',
      icon: Package,
      description: 'Product configuration for purchase orders',
    },
    {
      path: '/product-labels',
      label: 'Product Labels',
      icon: Printer,
      description: 'Generate Avery 5162 product labels with barcodes',
    },
    {
      path: '/projects',
      label: 'P2 Projects',
      icon: FolderKanban,
      description: 'Track P2 project workflows through multi-step wizard',
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
      path: '/order-reports',
      label: 'Order Reports',
      icon: Search,
      description: 'Advanced search with AND/OR logic for filtering orders',
    },
    {
      path: '/admin/qr-codes',
      label: 'QR Code Management',
      icon: QrCode,
      description: 'Generate and manage QR codes for orders, employees, and products',
    },
    {
      path: '/due-date-capacity',
      label: 'Due Date Capacity',
      icon: Calendar,
      description: 'View orders grouped by due date week to identify capacity issues',
    },
    {
      path: '/analytics',
      label: 'Analytics Dashboard',
      icon: BarChart,
      description: 'View metrics and reports over different time periods',
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
    {
      path: '/app/production/stations',
      label: 'Timer Station',
      icon: Clock,
      description: 'Step-based timing programs for production processes',
    },
    {
      path: '/voice-notes',
      label: 'Voice Notes',
      icon: Mic,
      description: 'Voice-activated notes for production issues and tracking',
    },
  ];

  const productionSchedulingItems = [
    {
      path: '/cutting-control-center',
      label: 'Cutting Table Control Center',
      icon: Scissors,
      description: 'Unified control for production, materials, and planning',
    },
    {
      path: '/fabric-inventory',
      label: 'Fabric Inventory Admin',
      icon: Layers,
      description: 'AS9100 compliant fabric inventory management',
    },
    {
      path: '/production-tracking',
      label: 'Production Tracking',
      icon: TrendingUp,
      description: 'Track production orders from POs',
    },
    {
      path: '/production-forecast',
      label: 'Production Forecast',
      icon: BarChart3,
      description: 'Estimated department progression and ship dates',
    },
    {
      path: '/projects',
      label: 'Projects',
      icon: FolderKanban,
      description: 'Multi-step project workflow tracking',
    },
  ];

  const centralStorageItems = [
    {
      path: '/signature-workflow',
      label: 'Signed Documents',
      icon: FileSignature,
      description: 'View and manage signed documents',
    },
    {
      path: '/media-library',
      label: 'Media Library',
      icon: Image,
      description: 'Manage uploaded images and documents',
    },
    {
      path: '/reference-docs',
      label: 'Reference Docs',
      icon: BookOpen,
      description: 'Reference documents and resources',
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
    {
      path: '/oem-shipments',
      label: 'OEM Shipments',
      icon: Package,
      description: 'View shipped PO orders grouped as OEM shipments',
    },
  ];

  // Helper function to filter navigation items based on user permissions
  const filterByPermissions = <T extends { path: string }>(
    items: T[],
    username: string | undefined,
    userRole?: string
  ): T[] => {
    if (!username) {
      return []; // No user logged in = no nav items
    }

    if (hasFullAccess(username)) {
      return items; // Admin users see everything
    }

    // For users not in the permissions list, only show default routes
    if (!isUserInPermissionsList(username)) {
      return items.filter((item) => 
        DEFAULT_USER_ROUTES.some(route => item.path === route || item.path.startsWith(route + '/'))
      );
    }

    return items.filter((item) => hasRouteAccess(username, item.path, userRole));
  };

  // Get current user's role for permission checks
  const userRole = (currentUser as any)?.role;

  // Apply permission filtering to all navigation arrays
  const filteredNavItems = useMemo(
    () => filterByPermissions(navItems, currentUser?.username, userRole),
    [navItems, currentUser?.username, userRole]
  );
  const filteredOrderManagementItems = useMemo(
    () => filterByPermissions(orderManagementItems, currentUser?.username, userRole),
    [orderManagementItems, currentUser?.username, userRole]
  );
  const filteredInventoryItems = useMemo(
    () => filterByPermissions(inventoryItems, currentUser?.username, userRole),
    [inventoryItems, currentUser?.username, userRole]
  );
  const filteredFormsReportsItems = useMemo(
    () => filterByPermissions(formsReportsItems, currentUser?.username, userRole),
    [formsReportsItems, currentUser?.username, userRole]
  );
  const filteredTravelerItems = useMemo(
    () => filterByPermissions(travelerItems, currentUser?.username, userRole),
    [travelerItems, currentUser?.username, userRole]
  );
  const filteredCommunicationsItems = useMemo(
    () => filterByPermissions(communicationsItems, currentUser?.username, userRole),
    [communicationsItems, currentUser?.username, userRole]
  );
  const filteredQcMaintenanceItems = useMemo(
    () => filterByPermissions(qcMaintenanceItems, currentUser?.username, userRole),
    [qcMaintenanceItems, currentUser?.username, userRole]
  );
  const filteredTrainingItems = useMemo(
    () => filterByPermissions(trainingItems, currentUser?.username, userRole),
    [trainingItems, currentUser?.username, userRole]
  );
  const filteredEmployeesItems = useMemo(
    () => filterByPermissions(employeesItems, currentUser?.username, userRole),
    [employeesItems, currentUser?.username, userRole]
  );
  const filteredFinanceItems = useMemo(
    () => filterByPermissions(financeItems, currentUser?.username, userRole),
    [financeItems, currentUser?.username, userRole]
  );
  // For User Dashboards: admins see all, regular users see only their own dashboard
  const filteredUserDashboardsItems = useMemo(() => {
    if (!currentUser?.username) {
      return [];
    }
    
    // Admin users with full access see all dashboards
    if (hasFullAccess(currentUser.username)) {
      return userDashboardsItems;
    }
    
    // Regular users only see their own dashboard
    const ownDashboardPath = `/${currentUser.username.toLowerCase()}-dashboard`;
    const ownDashboard = userDashboardsItems.find((item) => 
      item.path.toLowerCase() === ownDashboardPath
    );
    
    // If user's dashboard exists in the list, return it
    if (ownDashboard) {
      return [ownDashboard];
    }
    
    // If user's dashboard doesn't exist in predefined list, create a dynamic entry
    return [{
      path: ownDashboardPath,
      label: `${currentUser.username.toUpperCase()} Dashboard`,
      icon: Home,
      description: `Personal dashboard for ${currentUser.username}`,
    }];
  }, [userDashboardsItems, currentUser?.username]);
  const filteredPurchaseOrdersItems = useMemo(
    () => filterByPermissions(purchaseOrdersItems, currentUser?.username, userRole),
    [purchaseOrdersItems, currentUser?.username, userRole]
  );
  const filteredVerifiedModulesItems = useMemo(
    () => filterByPermissions(verifiedModulesItems, currentUser?.username, userRole),
    [verifiedModulesItems, currentUser?.username, userRole]
  );
  const filteredProductionSchedulingItems = useMemo(
    () => filterByPermissions(productionSchedulingItems, currentUser?.username, userRole),
    [productionSchedulingItems, currentUser?.username, userRole]
  );
  const filteredCentralStorageItems = useMemo(
    () => filterByPermissions(centralStorageItems, currentUser?.username, userRole),
    [centralStorageItems, currentUser?.username, userRole]
  );
  const filteredDepartmentQueueItems = useMemo(
    () => filterByPermissions(departmentQueueItems, currentUser?.username, userRole),
    [departmentQueueItems, currentUser?.username, userRole]
  );

  const isVerifiedModulesActive = verifiedModulesItems.some(
    (item) => location === item.path
  );
  const isOrderManagementActive = orderManagementItems.some(
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
  const isCentralStorageActive = centralStorageItems.some(
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
          <div className="flex flex-col gap-2">
            {/* Live Date/Time Display - Above Home */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-gray-100 px-3 py-1.5 rounded-md w-fit" data-testid="system-datetime">
              <Clock className="h-4 w-4" />
              <span className="font-medium">
                {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-gray-400">|</span>
              <span className="font-mono">
                {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}
              </span>
            </div>
            
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

            {/* Order Management Dropdown */}
            {filteredOrderManagementItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isOrderManagementActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isOrderManagementActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'orderManagement',
                      orderManagementExpanded,
                      setOrderManagementExpanded
                    )
                  }
                >
                  <ClipboardList className="h-4 w-4" />
                  Order Management
                  {orderManagementExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {orderManagementExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredOrderManagementItems.map((item) => {
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

            {/* Communications Dropdown */}
            {filteredCommunicationsItems.length > 0 && (
              <div className="relative">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-2 text-sm"
                    >
                      <Mail className="h-4 w-4" />
                      Communications
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {filteredCommunicationsItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem
                          key={item.path}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                          className="cursor-pointer"
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Traveler Dropdown - P2 AS9100 Production Tracking */}
            {filteredTravelerItems.length > 0 && (
              <div className="relative">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="flex items-center gap-2 text-sm"
                    >
                      <Route className="h-4 w-4" />
                      Traveler
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {filteredTravelerItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem
                          key={item.path}
                          onClick={() => {
                            closeAllDropdowns();
                            setLocation(item.path);
                          }}
                          className="cursor-pointer"
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-gray-500">Document Generation (via Traveler)</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => {
                        closeAllDropdowns();
                        setLocation('/p2-traveler-viewer');
                      }}
                      className="cursor-pointer text-gray-600"
                    >
                      <Package className="h-4 w-4 mr-2" />
                      Generate Packing Slips
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        closeAllDropdowns();
                        setLocation('/p2-traveler-viewer');
                      }}
                      className="cursor-pointer text-gray-600"
                    >
                      <Award className="h-4 w-4 mr-2" />
                      Generate Certificates
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        closeAllDropdowns();
                        setLocation('/p2-traveler-viewer');
                      }}
                      className="cursor-pointer text-gray-600"
                    >
                      <FileCheck className="h-4 w-4 mr-2" />
                      Generate Test Reports
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

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
                            if ((item as any).external && (item as any).externalUrl) {
                              window.open(`${(item as any).externalUrl}/station-timers?from=epoch`, '_blank');
                            } else {
                              setLocation(item.path);
                            }
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
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px] max-h-[70vh] overflow-y-auto">
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

            {/* Central Storage Dropdown */}
            {filteredCentralStorageItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isCentralStorageActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isCentralStorageActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'centralStorage',
                      centralStorageExpanded,
                      setCentralStorageExpanded
                    )
                  }
                >
                  <Archive className="h-4 w-4" />
                  Central Storage
                  {centralStorageExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {centralStorageExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredCentralStorageItems.map((item) => {
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="gap-2"
              data-testid="button-open-search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden md:inline">Search</span>
              <kbd className="hidden md:inline px-2 py-0.5 text-xs border rounded bg-gray-50">
                {formatShortcut('GLOBAL_SEARCH')}
              </kbd>
            </Button>
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
            {/* Field - Calm thinking surface (single user: admin_glennj only) */}
            {/* Field does not affect EPOCH data - no integration allowed */}
            {currentUser?.username === 'glennj' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  closeAllDropdowns();
                  setLocation('/field');
                }}
                className="gap-2"
                data-testid="button-field"
                title="Think before acting."
              >
                <Layers className="h-4 w-4" />
                <span className="hidden lg:inline">Field</span>
              </Button>
            )}
            {currentUser?.username === 'glennj' && (
              <ExecutiveRundownDropdown />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                closeAllDropdowns();
                setLocation('/help');
              }}
              className="gap-2"
              data-testid="button-help"
              title="Help Center"
            >
              <HelpCircle className="h-4 w-4" />
              <span className="hidden lg:inline">Help</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                closeAllDropdowns();
                setLocation('/settings');
              }}
              className="gap-2"
              data-testid="button-settings"
              title="Settings"
            >
              <Cog className="h-4 w-4" />
              <span className="hidden lg:inline">Settings</span>
            </Button>
            {isDeploymentEnvironment() && (
              <Button
                variant="outline"
                size="sm"
                onClick={currentUser?.username ? handleLogout : () => setLocation('/login')}
                className="gap-2"
                data-testid={currentUser?.username ? "button-logout" : "button-login"}
              >
                <LogOut className="h-4 w-4" />
                {currentUser?.username ? 'Logout' : 'Login'}
              </Button>
            )}
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </div>
      
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
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

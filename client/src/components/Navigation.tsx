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
  ClipboardList,
  ClipboardCheck,
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
  LayoutGrid,
  PackageCheck,
  ShieldAlert,
  Tv,
  FileSearch,
  LayoutDashboard,
  Zap,
  Fingerprint,
  FlaskConical,
  Tag,
  HandCoins,
  Thermometer,
} from 'lucide-react';

interface NavItemDef {
  path: string;
  label: string;
  icon: React.ElementType;
  description?: string;
  legacyPath?: string;
}

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
import OfflineIndicator from './OfflineIndicator';
import GlobalSearch from './GlobalSearch';
import ExecutiveRundownDropdown from './ExecutiveRundownDropdown';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { hasFullAccess, hasRouteAccess, isUserInPermissionsList, DEFAULT_USER_ROUTES, isAdminUser, getRequiredCapability } from '@/config/userPermissions';
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
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch current user data
  const { data: currentUser, refetch: refetchUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const token =
        localStorage.getItem('sessionToken') ||
        localStorage.getItem('jwtToken');

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

  // Fetch expiring/expired training certification count for nav badge
  const { data: recertCountData } = useQuery<{ count: number; days: number }>({
    queryKey: ['/api/employees/recertification-count'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const trainingAlertCount = recertCountData?.count ?? 0;

  // Fetch score-impacting compliance backfill count for nav badge.
  // Legacy pre-policy items stay visible on the queue page, but are isolated from ERDI scoring.
  const { data: backfillRows } = useQuery<Array<{ id: number }>>({
    queryKey: ['/api/vendor-pos/compliance-backfill', 'enforced'],
    queryFn: () => apiRequest('/api/vendor-pos/compliance-backfill?filter=enforced'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const backfillCount = backfillRows?.length ?? 0;

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
      localStorage.removeItem('dev_user_role');
      queryClient.removeQueries({ queryKey: ['currentUser'] });
      queryClient.removeQueries({ queryKey: ['/api/permissions/me'] });

      // Redirect to login page
      setLocation('/login');
    }
  };

  const [verifiedModulesExpanded, setVerifiedModulesExpanded] = useState(false);
  const [orderManagementExpanded, setOrderManagementExpanded] = useState(false);
  const [formsReportsExpanded, setFormsReportsExpanded] = useState(false);
  const [trainingExpanded, setTrainingExpanded] = useState(false);
  const [inventoryExpanded, setInventoryExpanded] = useState(false);
  const [employeesExpanded, setEmployeesExpanded] = useState(false);
  const [qcMaintenanceExpanded, setQcMaintenanceExpanded] = useState(false);
  const [qmsExpanded, setQmsExpanded] = useState(false);
  const [financeExpanded, setFinanceExpanded] = useState(false);
  const [userDashboardsExpanded, setUserDashboardsExpanded] = useState(false);
  const [purchaseOrdersExpanded, setPurchaseOrdersExpanded] = useState(false);
  const [productionSchedulingExpanded, setProductionSchedulingExpanded] =
    useState(false);
  const [departmentQueueExpanded, setDepartmentQueueExpanded] = useState(false);
  const [centralStorageExpanded, setCentralStorageExpanded] = useState(false);
  const [systemHealthExpanded, setSystemHealthExpanded] = useState(false);
  const [estimatingExpanded, setEstimatingExpanded] = useState(false);

  // Helper function to close all dropdowns
  const closeAllDropdowns = useCallback(() => {
    setOrderManagementExpanded(false);
    setFormsReportsExpanded(false);
    setTrainingExpanded(false);
    setInventoryExpanded(false);
    setQcMaintenanceExpanded(false);
    setQmsExpanded(false);
    setEmployeesExpanded(false);
    setFinanceExpanded(false);
    setUserDashboardsExpanded(false);
    setPurchaseOrdersExpanded(false);
    setProductionSchedulingExpanded(false);
    setDepartmentQueueExpanded(false);
    setVerifiedModulesExpanded(false);
    setCentralStorageExpanded(false);
    setSystemHealthExpanded(false);
    setEstimatingExpanded(false);
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
        if (dropdownName !== 'qms') setQmsExpanded(false);
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
        if (dropdownName !== 'systemHealth')
          setSystemHealthExpanded(false);
        if (dropdownName !== 'estimating')
          setEstimatingExpanded(false);
      }
    },
    []
  );

  const navItems = [
    {
      path: '/tv-display',
      label: 'TV Display',
      icon: Tv,
      description: 'Multi-panel shop floor display for monitors and meeting room screens',
    },
    {
      path: '/time-clock-admin',
      label: 'Timekeeper',
      icon: Clock,
      description: 'Open the standalone Timekeeper app',
    },
    {
      path: '/pto-command-center',
      label: 'PTO Command Center',
      icon: CalendarDays,
      description: 'PTO governance, approval pipeline, and staffing impact',
    },
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
    {
      path: '/quick-notes',
      label: 'QuickNotes',
      icon: FileText,
      description: 'Create, manage, and share reusable notes with teammates',
    },
    // {
    //   path: '/bom-administration',
    //   label: 'BOM Administration',
    //   icon: Package,
    //   description: 'Manage Bill of Materials for P2 operations',
    // },
    {
      path: '/robust-bom-administration',
      label: 'Robust BOM',
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
      path: '/admin/order-lookup',
      label: 'Order Item Lookup',
      icon: Search,
      description: 'Find the item code for a production order by matching specifications',
    },
    {
      path: '/admin/order-override',
      label: 'Order Data Override',
      icon: ShieldAlert,
      description: 'Directly modify any column for a specific order with full audit trail (glennj only)',
    },
    {
      path: '/admin/roles-permissions',
      label: 'Roles & Permissions',
      icon: Shield,
      description: 'Manage capability-based role permissions and individual user overrides',
    },
    {
      path: '/admin/operator-sessions',
      label: 'Operator Sessions',
      icon: Shield,
      description: 'View and revoke active shop-floor operator badge sessions (Task #143)',
    },
    {
      path: '/admin/widget-catalog',
      label: 'Widget Catalog',
      icon: LayoutGrid,
      description: 'Browse all 16 registered widget types with live previews and copy-ready configs',
    },
    {
      path: '/pdf-forms',
      label: 'PDF Forms',
      icon: FormInput,
      description: 'Upload any PDF, draw fillable text fields, and let operators fill and download completed forms',
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

    // Documentation button disabled per user request - was causing problems
    // {
    //   path: '/documentation',
    //   label: 'Documentation',
    //   icon: BookOpen,
    //   description: 'Complete system architecture and structure'
    // }
  ];

  const systemHealthItems = [
    {
      path: '/admin/health-checks',
      label: 'System Health Checks',
      icon: Activity,
      description: 'Monitor and test critical system components daily',
    },
    {
      path: '/admin/inventory-reconciliation',
      label: 'Inventory Reconciliation',
      icon: PackageCheck,
      description: 'Compare lot quantities vs. inventory balance records to spot mismatches',
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
      path: '/admin/shipping-status-audit',
      label: 'Shipping Status Audit',
      icon: PackageCheck,
      description: 'Identify orders in Shipping Management with a FINISHED status mismatch',
    },
    {
      path: '/admin/p1-po-status-repair',
      label: 'P1 PO Status Repair',
      icon: Wrench,
      description: 'Review and apply P1 purchase order status repairs from dry-run results',
    },
    {
      path: '/system-audits',
      label: 'System Audit Library',
      icon: FileSearch,
      description: 'Browse all system audit reports as formatted documents',
    },
    {
      path: '/admin/policies',
      label: 'Policies Administration',
      icon: FileText,
      description: 'Publish, upload, and monitor written policy versions and acknowledgments',
    },
    {
      path: '/admin/audit-ledger',
      label: 'Unified Audit Ledger',
      icon: FileSearch,
      description: 'Append-only, hash-chained DCAA / CMMC audit ledger',
    },
    {
      path: '/admin/inventory-anomalies',
      label: 'Inventory Anomalies',
      icon: AlertTriangle,
      description: 'Fraud / error pattern detection across the inventory ledger',
    },
    {
      path: '/admin/anomaly-config',
      label: 'Anomaly Detector Config',
      icon: Settings,
      description: 'Tune thresholds and notifications for inventory anomaly detectors',
    },
  ];

  const estimatingItems: NavItemDef[] = [
    {
      path: '/estimating',
      label: 'ROM Builder',
      icon: FileSearch,
      description: 'View and manage ROM estimates',
    },
    {
      path: '/estimating/bom-drafts',
      label: 'Draft Builder',
      icon: FileSpreadsheet,
      description: 'Create reusable draft BOMs and sourcing picklists',
    },
    {
      path: '/design/rd-projects',
      label: 'R & D Projects',
      icon: FlaskConical,
      description: 'Create R & D projects, attach draft builder tabs, and track prototype readiness',
    },
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
      label: 'P1 Nonconforming',
      icon: XCircle,
      description: 'Track P1 stock-line nonconforming items and dispositions',
    },
    {
      path: '/rts',
      label: 'RTS (Ready to Sell)',
      icon: DollarSign,
      description: 'View sellable finished stock and create RTS sales',
    },
  ];

  const inventoryItems: NavItemDef[] = [
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
      legacyPath: '/inventory/receiving-legacy',
    },
    {
      path: '/inventory/enhanced-mrp',
      label: 'Enhanced Inventory & MRP',
      icon: Factory,
      description:
        'Advanced inventory management with material requirements planning',
    },
    {
      path: '/inventory/ledger',
      label: 'Inventory Ledger',
      icon: ClipboardList,
      description:
        'Filterable, exportable history of all inventory transactions',
    },
    {
      path: '/inventory/traceability',
      label: 'Material Traceability',
      icon: Shield,
      description:
        'Reconstruct end-to-end material chain from a lot, traveler, WAD, NCR, or barcode',
    },
    {
      path: '/inventory/cycle-counts',
      label: 'Cycle Counts',
      icon: ClipboardList,
      description:
        'Schedule, perform, approve, and post blind cycle counts to the inventory ledger',
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
    {
      path: '/vendor-pos/compliance-backfill',
      label: 'Compliance Backfill Queue',
      icon: ShieldAlert,
      description: 'Remediate issued POs with compliance gaps affecting the ERDI Procurement score',
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
      path: '/forms/document-builder',
      label: 'Form & Document Builder',
      icon: ClipboardList,
      description:
        'Create work instructions, assembly instructions, operator instructions, maintenance schedules, and reusable form templates',
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
      path: '/weekly-shipments',
      label: 'Weekly Shipments Overview',
      icon: Package,
      description: 'Combined view of all P1 and OEM shipments by week',
    },
    {
      path: '/urgent-orders-report',
      label: 'Urgent Orders Report',
      icon: AlertTriangle,
      description: 'View all orders flagged as Urgent or Critical priority',
    },
    {
      path: '/what-if-forecast',
      label: 'What-If Forecast',
      icon: TestTube,
      description: 'Simulate how intake/output changes affect past-due backlog over time',
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
      path: '/inventory/restock-signals',
      label: 'Restock Signals',
      icon: TrendingDown,
      description: 'See which materials need purchasing attention',
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
      path: '/freezer-temperature-log',
      label: 'Freezer Temperature Log',
      icon: Thermometer,
      description: 'Record and review freezer temperature checks',
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

  const qmsItems: NavItemDef[] = [
    {
      path: '/qms/change-control',
      label: 'Quality Action & Change Control',
      icon: FileSignature,
      description: 'Unified NCR, CAR, PCR, ECR, and ECN action and change control',
    },
    {
      path: '/qms/cars',
      label: 'CARs',
      icon: ShieldCheck,
      description: 'Corrective Action Reports and effectiveness checks',
    },
    {
      path: '/qms/ncr-central-record',
      label: 'NCR Central Record',
      icon: XCircle,
      description: 'Central register for nonconformance records and closure evidence',
    },
    {
      path: '/qms/nsia-registrar',
      label: 'NSIA Registrar',
      icon: FileCheck,
      description: 'Registrar records, evidence, renewal dates, and owners',
    },
    {
      path: '/qms/design-control',
      label: 'Design Control',
      icon: Route,
      description: 'Design inputs, review gates, validation, and release controls',
    },
    {
      path: '/qms/as9100-audit-readiness',
      label: 'AS9100 Audit Readiness',
      icon: ClipboardCheck,
      description: 'Evidence-based assessment cycles, approvals, auditor view, and controlled exports',
    },
    {
      path: '/qms/epoch-software-validation',
      label: 'EPOCH Software Validation',
      icon: ShieldCheck,
      description: 'Persistent intended-use validation packages, risk-based testing, evidence, and approvals',
    },
    {
      path: '/qms/parts-equipment',
      label: 'Parts and Equipment',
      icon: PackageCheck,
      description: 'Unified register with tabs for equipment, measuring devices, AS9100 calibration/validation, customer property, serialized items, returns, and archive history',
    },
    {
      path: '/assets',
      label: 'Assets',
      icon: Boxes,
      description: 'Existing asset registry and equipment records',
    },
  ];
  const qmsPartsEquipmentTabItems: NavItemDef[] = [
    {
      path: '/qms/parts-equipment?tab=equipment',
      label: 'Equipment',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=measuring-devices',
      label: 'Measuring Devices',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=as9100-calibration',
      label: 'AS9100 Calibration',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=as9100-validation',
      label: 'AS9100 Validation',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=customer-property',
      label: 'Customer Property',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=serialized-items',
      label: 'Serialized Items',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=returned-items',
      label: 'Returned Items',
      icon: PackageCheck,
    },
    {
      path: '/qms/parts-equipment?tab=calibration-archive',
      label: 'Calibration Archive',
      icon: PackageCheck,
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
    {
      path: '/skill-matrix',
      label: 'Skill Matrix',
      icon: GraduationCap,
      description: 'View employee qualification status and manage recertifications',
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
      label: 'Timekeeper',
      icon: Settings,
      description: 'Open the standalone Timekeeper app',
    },
    {
      path: '/pto-command-center',
      label: 'PTO Command Center',
      icon: CalendarDays,
      description: 'PTO governance, approval pipeline, and staffing impact',
    },
    {
      path: '/badge-configuration',
      label: 'Badge Configuration',
      icon: Scan,
      description: 'Configure employee badge actions and workflows',
    },
    {
      path: '/admin/checklist-management',
      label: 'Checklist Management',
      icon: ClipboardList,
      description: 'Create and manage daily, weekly, and monthly checklists for employees',
    },
  ];

  const financeItems = [
    {
      path: '/business-review',
      label: 'Business Review',
      icon: FileSpreadsheet,
      description: 'Monthly slide-format business and financial review',
    },
    {
      path: '/finance/dashboard',
      label: 'Finance Dashboard',
      icon: BarChart,
      description: 'Financial overview and KPIs',
    },
    {
      path: '/finance/charge-codes',
      label: 'Charge Codes',
      icon: Tag,
      description: 'View, create, and manage charge codes for labor cost allocation',
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
      path: '/finance/chart-of-accounts',
      label: 'Chart of Accounts',
      icon: BookOpen,
      description: 'View the authoritative 5-digit GAAP and DCAA account master',
    },
    {
      path: '/finance/burden-rates',
      label: 'Burden Rates',
      icon: Calculator,
      description: 'Indirect cost pools, rates, and applied burden runs (Fringe / Overhead / G&A)',
    },
    {
      path: '/finance/accounting-control',
      label: 'Accounting Control Center',
      icon: Receipt,
      description: 'Expense reimbursements, petty cash, owner expenses, GL queue, and DCAA review',
    },
    {
      path: '/finance/accounting',
      label: 'Accounting Journal',
      icon: Calculator,
      description: 'View double-entry journal entries for wire payments',
    },
    {
      path: '/finance/payroll-control',
      label: 'Payroll Control',
      icon: HandCoins,
      description: 'Track employee deductions, advances, reimbursements, and Gusto follow-through',
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
      path: '/finance/bulk-payment-history',
      label: 'Bulk Payment History',
      icon: CreditCard,
      description: 'Audit log of all bulk payment batches',
    },
    {
      path: '/finance/payment-reconciliation',
      label: 'Payment Reconciliation',
      icon: CreditCard,
      description: 'Reconcile payments against processor records by date range',
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
      path: '/finance/monthly-shipped',
      label: 'Monthly SHIPPED Report',
      icon: FileText,
      description: 'Monthly report of orders grouped by shipped date',
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
      path: '/angiet-dashboard',
      label: 'ANGIET Dashboard',
      icon: Settings,
      description: 'Cutting Table, CNC & Gunsmith Operations dashboard',
    },
    {
      path: '/bradw-dashboard',
      label: 'BRADW Dashboard',
      icon: Users,
      description: 'Gunsmith queue, orders, and employee portal dashboard',
    },
    {
      path: '/chasew-dashboard',
      label: 'ChaseW Dashboard',
      icon: Users,
      description: 'Projects, central storage, and P2 customers dashboard',
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
    {
      path: '/production-control-center-live',
      label: 'PCC Live',
      icon: Zap,
      description: 'High-contrast Lando Norris-styled live view of production metrics',
    },
    {
      path: '/daily-throughput-board',
      label: 'Daily Throughput Board',
      icon: LayoutDashboard,
      description: 'Real-time read-only board showing daily tube throughput across all 22 production slots',
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
      path: '/p2-customers',
      label: 'P2 Customers',
      icon: Users,
      description: 'Manage customers for P2 purchase orders and RFQ tracking',
    },
    {
      path: '/wad-wizard',
      label: 'WAD Wizard',
      icon: FileCheck,
      description: 'Launch the Work Authorization Document wizard for any Production Work Order',
    },
    {
      path: '/wad-status',
      label: 'WAD Status',
      icon: FileCheck,
      description: 'Backlog of projects in P2 Release / Production with WAD authoring status',
    },
    {
      path: '/help/p2-order-guide',
      label: 'P2 Order Guide',
      icon: BookOpen,
      description: 'Step-by-step guide for creating new P2 orders',
    },
    {
      path: '/manufacturing-queue',
      label: 'Manufacturing Queue',
      icon: Factory,
      description:
        'View and manage manufactured parts queue by department (Cutting Table, CNC, Cores)',
    },
    {
      path: '/kits-queue',
      label: 'Kits Queue',
      icon: Layers,
      description:
        'Readiness gating for kit manufacturing queue items — see which kits are ready, partial, or blocked',
    },
    {
      path: '/layup-queue',
      label: 'Layup Queue',
      icon: Layers,
      description:
        'Readiness gating for layup jobs — verify prepreg fabric, resin, and consumables with lot compliance checks',
    },
    {
      path: '/core-queue',
      label: 'Core Queue',
      icon: Layers,
      description:
        'Readiness gating for core prep jobs — confirm honeycomb/foam core stock, adhesive film, and consumables before release',
    },
    {
      path: '/sub-assembly-queue',
      label: 'Sub-Assembly Queue',
      icon: Layers,
      description:
        'Readiness gating for sub-assembly jobs — confirm child parts, kits, and consumables are allocated before controlled build-up begins',
    },
    {
      path: '/assembly-queue',
      label: 'Assembly Queue',
      icon: Layers,
      description:
        'Dependency-driven readiness gating for final assembly — confirm sub-assemblies are complete, kits released, and consumables staged before build-up begins',
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
    {
      path: '/projects/pipeline',
      label: 'Pipeline Board',
      icon: FolderKanban,
      description: 'Kanban view of project pipeline stages',
    },
    {
      path: '/pm-control-center',
      label: 'PM Control Center',
      icon: LayoutDashboard,
      description: 'Project health dashboard: production status, labor burn, and material budget in one view',
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
      path: '/knowledge-capture',
      label: 'Knowledge Capture',
      icon: Mic,
      description: 'Private voice journal for process observations and business knowledge',
    },
    {
      path: '/epoch-copilot',
      label: 'EPOCH Copilot',
      icon: MessageSquare,
      description: 'Admin assistant for EPOCH records and how-to guides',
    },
    {
      path: '/metric-directory',
      label: 'Metric Directory',
      icon: Database,
      description: 'Browse all registered system metrics grouped by category',
    },
    {
      path: '/identity-matrix',
      label: 'Identity Matrix',
      icon: Fingerprint,
      description: 'Audit identity field usage across features and view the employee/user roster',
    },
  ];

  const productionSchedulingItems = [
    {
      path: '/command-center',
      label: 'Command Center',
      icon: LayoutGrid,
      description: 'Shop floor decision surface — WADs grouped by priority: blocked, at risk, ready, in progress, and late',
    },
    {
      path: '/template-library',
      label: 'Template Library',
      icon: BookOpen,
      description: 'Manage approved routing, traveler, QC, and work instruction templates for WAD Step 6',
    },
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
      path: '/production-tracking/customer-wip',
      label: 'Customer WIP',
      icon: Users,
      description: 'View unfinished P1 work by customer, PO, and department',
    },
    {
      path: '/production-forecast',
      label: 'Production Forecast',
      icon: BarChart3,
      description: 'Estimated department progression and ship dates',
    },
    {
      path: '/daily-throughput-board',
      label: 'Daily Throughput Board',
      icon: LayoutDashboard,
      description: 'Real-time read-only board showing daily tube throughput across all 22 production slots',
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

  const { data: navPermissionsData } = useQuery<{ permissions: string[] }>({
    queryKey: ['/api/permissions/me'],
    staleTime: 5 * 60 * 1000,
    enabled: !!(currentUser as any)?.username,
  });
  const navCapSet = useMemo(
    () => new Set(navPermissionsData?.permissions ?? []),
    [navPermissionsData],
  );

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

    // For users not in the permissions list, only show default routes + capability-gated
    if (!isUserInPermissionsList(username)) {
      return items.filter((item) => {
        const cap = getRequiredCapability(item.path);
        const caps = Array.isArray(cap) ? cap : cap ? [cap] : [];
        if (caps.some((requiredCap) => navCapSet.has(requiredCap))) return true;
        return DEFAULT_USER_ROUTES.some(route => item.path === route || item.path.startsWith(route + '/'));
      });
    }

    return items.filter((item) => {
      const cap = getRequiredCapability(item.path);
      const caps = Array.isArray(cap) ? cap : cap ? [cap] : [];
      if (caps.some((requiredCap) => navCapSet.has(requiredCap))) return true;
      return hasRouteAccess(username, item.path, userRole);
    });
  };

  // Get current user's role for permission checks
  const userRole = (currentUser as any)?.role;

  // Apply permission filtering to all navigation arrays
  const filteredNavItems = useMemo(
    () => filterByPermissions(navItems, currentUser?.username, userRole),
    [navItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredOrderManagementItems = useMemo(
    () => filterByPermissions(orderManagementItems, currentUser?.username, userRole),
    [orderManagementItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredInventoryItems = useMemo(
    () => filterByPermissions(inventoryItems, currentUser?.username, userRole),
    [inventoryItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredFormsReportsItems = useMemo(
    () => filterByPermissions(formsReportsItems, currentUser?.username, userRole),
    [formsReportsItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredTravelerItems = useMemo(
    () => filterByPermissions(travelerItems, currentUser?.username, userRole),
    [travelerItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredCommunicationsItems = useMemo(
    () => filterByPermissions(communicationsItems, currentUser?.username, userRole),
    [communicationsItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredQcMaintenanceItems = useMemo(
    () => filterByPermissions(qcMaintenanceItems, currentUser?.username, userRole),
    [qcMaintenanceItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredQmsItems = useMemo(
    () => filterByPermissions(qmsItems, currentUser?.username, userRole),
    [qmsItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredTrainingItems = useMemo(
    () => filterByPermissions(trainingItems, currentUser?.username, userRole),
    [trainingItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredEmployeesItems = useMemo(
    () => filterByPermissions(employeesItems, currentUser?.username, userRole),
    [employeesItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredFinanceItems = useMemo(
    () => filterByPermissions(financeItems, currentUser?.username, userRole),
    [financeItems, currentUser?.username, userRole, navCapSet]
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
    [purchaseOrdersItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredVerifiedModulesItems = useMemo(
    () => filterByPermissions(verifiedModulesItems, currentUser?.username, userRole),
    [verifiedModulesItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredProductionSchedulingItems = useMemo(
    () => filterByPermissions(productionSchedulingItems, currentUser?.username, userRole),
    [productionSchedulingItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredCentralStorageItems = useMemo(
    () => filterByPermissions(centralStorageItems, currentUser?.username, userRole),
    [centralStorageItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredDepartmentQueueItems = useMemo(
    () => filterByPermissions(departmentQueueItems, currentUser?.username, userRole),
    [departmentQueueItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredSystemHealthItems = useMemo(
    () => filterByPermissions(systemHealthItems, currentUser?.username, userRole),
    [systemHealthItems, currentUser?.username, userRole, navCapSet]
  );
  const filteredEstimatingItems = useMemo(
    () => filterByPermissions(estimatingItems, currentUser?.username, userRole),
    [estimatingItems, currentUser?.username, userRole, navCapSet]
  );

  const isSystemHealthActive = systemHealthItems.some(
    (item) => location === item.path
  );
  const isVerifiedModulesActive = verifiedModulesItems.some(
    (item) => location === item.path
  );
  const isOrderManagementActive = orderManagementItems.some(
    (item) => location === item.path
  );
  const isEstimatingActive = estimatingItems.some(
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
  const isQmsActive = qmsItems.some((item) => location === item.path);
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

            {/* Design Dropdown */}
            {filteredEstimatingItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isEstimatingActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isEstimatingActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'estimating',
                      estimatingExpanded,
                      setEstimatingExpanded
                    )
                  }
                >
                  <Calculator className="h-4 w-4" />
                  Design
                  {estimatingExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {estimatingExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[200px]">
                    {filteredEstimatingItems.map((item) => {
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
                  {trainingAlertCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold min-w-[18px] h-[18px] px-1 leading-none">
                      {trainingAlertCount > 99 ? '99+' : trainingAlertCount}
                    </span>
                  )}
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
                      const legacyPath = item.legacyPath;

                      return (
                        <div key={item.path}>
                          <button
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
                            {item.path === '/vendor-pos/compliance-backfill' && backfillCount > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-xs font-bold min-w-[18px] h-[18px] px-1 leading-none">
                                {backfillCount > 99 ? '99+' : backfillCount}
                              </span>
                            )}
                          </button>
                          {legacyPath && (
                            <button
                              className="w-full text-left pl-9 pr-3 pb-1 text-xs text-gray-400 hover:text-gray-600 hover:underline"
                              onClick={() => {
                                closeAllDropdowns();
                                setLocation(legacyPath);
                              }}
                            >
                              ↳ Legacy view
                            </button>
                          )}
                        </div>
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

            {/* QMS Dropdown */}
            {filteredQmsItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isQmsActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isQmsActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'qms',
                      qmsExpanded,
                      setQmsExpanded
                    )
                  }
                >
                  <ShieldCheck className="h-4 w-4" />
                  QMS
                  {qmsExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {qmsExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[220px]">
                    {filteredQmsItems.map((item) => {
                      const Icon = item.icon;
                      const isPartsEquipment = item.path === '/qms/parts-equipment';
                      const isActive = isPartsEquipment
                        ? location.startsWith('/qms/parts-equipment')
                        : location === item.path;

                      return (
                        <div key={item.path}>
                          <button
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
                          {isPartsEquipment && (
                            <div className="border-l border-gray-200 ml-5 my-1">
                              {qmsPartsEquipmentTabItems.map((tabItem) => {
                                const TabIcon = tabItem.icon;
                                const tabActive = location === tabItem.path;
                                return (
                                  <button
                                    key={tabItem.path}
                                    className={cn(
                                      'w-full text-left pl-4 pr-3 py-1.5 text-xs flex items-center gap-2 text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                                      tabActive && 'bg-blue-50 text-blue-700'
                                    )}
                                    onClick={() => {
                                      closeAllDropdowns();
                                      setLocation(tabItem.path);
                                    }}
                                  >
                                    <TabIcon className="h-3.5 w-3.5" />
                                    {tabItem.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
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

            {/* System Health Checks Dropdown */}
            {filteredSystemHealthItems.length > 0 && (
              <div className="relative">
                <Button
                  variant={isSystemHealthActive ? 'default' : 'ghost'}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    isSystemHealthActive && 'bg-primary text-white'
                  )}
                  onClick={() =>
                    toggleDropdown(
                      'systemHealth',
                      systemHealthExpanded,
                      setSystemHealthExpanded
                    )
                  }
                >
                  <Activity className="h-4 w-4" />
                  System Health Checks
                  {systemHealthExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>

                {systemHealthExpanded && (
                  <div className="absolute top-full left-0 mt-0 pt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[250px]">
                    {filteredSystemHealthItems.map((item) => {
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

            {/* CNC Dashboard Direct Link */}
            <Button
              variant={location === '/cnc-dashboard' ? 'default' : 'ghost'}
              className={cn(
                'flex items-center gap-2 text-sm',
                location === '/cnc-dashboard' && 'bg-primary text-white'
              )}
              onClick={() => { closeAllDropdowns(); setLocation('/cnc-dashboard'); }}
            >
              <Settings className="h-4 w-4" />
              CNC Dashboard
            </Button>

            {/* EDRI — DCAA Readiness Index (ADMIN/OWNER only) */}
            {(userRole === 'ADMIN' || userRole === 'OWNER') && (
              <Button
                variant={location.startsWith('/admin/edri') ? 'default' : 'ghost'}
                className={cn(
                  'flex items-center gap-2 text-sm text-foreground hover:bg-gray-100 hover:text-foreground',
                  location.startsWith('/admin/edri') && 'bg-primary text-white hover:bg-primary hover:text-white'
                )}
                onClick={() => { closeAllDropdowns(); setLocation('/admin/edri'); }}
              >
                <ShieldCheck className="h-4 w-4" />
                DCAA Readiness
              </Button>
            )}

            {/* CMMC 2.0 Level 2 Dashboard (ADMIN/OWNER only) */}
            {(userRole === 'ADMIN' || userRole === 'OWNER') && (
              <Button
                variant={location.startsWith('/admin/cmmc') ? 'default' : 'ghost'}
                className={cn(
                  'flex items-center gap-2 text-sm',
                  location.startsWith('/admin/cmmc') && 'bg-primary text-white'
                )}
                onClick={() => { closeAllDropdowns(); setLocation('/admin/cmmc'); }}
              >
                <ShieldCheck className="h-4 w-4" />
                CMMC Readiness
              </Button>
            )}

            {/* Business Continuity Dashboard (ADMIN/OWNER only) */}
            {(userRole === 'ADMIN' || userRole === 'OWNER') && (
              <Button
                variant={location.startsWith('/admin/continuity') ? 'default' : 'ghost'}
                className={cn(
                  'flex items-center gap-2 text-sm text-foreground hover:bg-gray-100 hover:text-foreground',
                  location.startsWith('/admin/continuity') && 'bg-primary text-white hover:bg-primary hover:text-white'
                )}
                onClick={() => { closeAllDropdowns(); setLocation('/admin/continuity'); }}
              >
                <ShieldCheck className="h-4 w-4" />
                Business Continuity
              </Button>
            )}

            {/* Prompt Library (glennj only) */}
            {currentUser?.username === 'glennj' && (
              <Button
                variant={(location.startsWith('/prompt-library') || location.startsWith('/proteus-labs')) ? 'default' : 'ghost'}
                className={cn(
                  'flex items-center gap-2 text-sm',
                  (location.startsWith('/prompt-library') || location.startsWith('/proteus-labs')) && 'bg-primary text-white'
                )}
                onClick={() => { closeAllDropdowns(); setLocation('/prompt-library'); }}
              >
                <FlaskConical className="h-4 w-4" />
                Prompt Library
              </Button>
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
            <OfflineIndicator />
            <span className="text-sm text-gray-600">
              Manufacturing ERP System
            </span>
            {currentUser?.username && (
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
            {currentUser?.username && (
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

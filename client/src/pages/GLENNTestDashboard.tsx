import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import IndustrialSwitch from '@/components/proteus/controls/IndustrialSwitch';
import { useScrollDepth } from '@/hooks/useScrollDepth';
import '../styles/premiumDashboard.css';
import {
  Plus,
  List,
  FilePenLine,
  TestTube,
  Users,
  ClipboardList,
  FileText,
  TrendingUp,
  Package,
  Scan,
  Calendar,
  BarChart,
  Warehouse,
  Shield,
  Wrench,
  FormInput,
  PieChart,
  DollarSign,
  Receipt,
  TrendingDown,
  Factory,
  User,
  Settings,
  Eye,
  Mic,
  Image,
  FileSignature,
  FileBadge,
  Sun,
  Moon,
  ChevronRight,
  Activity,
  CheckCircle2,
  Clock,
  Zap,
  Bell,
  CreditCard,
  GraduationCap,
  Truck,
} from 'lucide-react';
import WeeklyShippingWidget from '@/components/WeeklyShippingWidget';
import WatchRuleCards from '@/components/WatchRuleCards';
import MyTasksControlCenter from '@/components/MyTasksControlCenter';
import SystemHealthWidget from '@/components/admin/SystemHealthWidget';

export default function GLENNTestDashboard() {
  const [isPremiumMode, setIsPremiumMode] = useState(() => {
    const saved = localStorage.getItem('glennj-premium-mode');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('glennj-premium-mode', isPremiumMode.toString());
  }, [isPremiumMode]);

  useScrollDepth();

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string; employeeId?: number }>({
    queryKey: ['currentUser'],
  });

  const { data: orderStats } = useQuery<{ pending: number; inProduction: number; completed: number }>({
    queryKey: ['/api/orders/stats'],
    enabled: isPremiumMode,
  });

  if (!isPremiumMode) {
    return <LightModeDashboard currentUser={currentUser} onToggleMode={() => setIsPremiumMode(true)} />;
  }

  return (
    <div className="premium-bg min-h-screen text-white p-6 md:p-10">
      <div className="premium-content max-w-7xl mx-auto">
        {/* Header */}
        <div className="premium-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="premium-title">Welcome back, Glenn</h1>
            <p className="premium-subtitle">Your manufacturing command center</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="premium-badge">
              <div className="status-indicator online"></div>
              <span>System Online</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Current Toggle</span>
                <div className="theme-toggle-container">
                  <Sun className="w-4 h-4 text-gray-500" />
                  <Switch
                    checked={isPremiumMode}
                    onCheckedChange={setIsPremiumMode}
                    data-testid="switch-premium-mode"
                  />
                  <Moon className="w-4 h-4 text-blue-400" />
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-medium">Alternate Industrial Toggle</span>
                <div className="theme-toggle-container">
                  <Sun className="w-4 h-4 text-gray-500" />
                  <IndustrialSwitch
                    checked={isPremiumMode}
                    onCheckedChange={setIsPremiumMode}
                    size={1.1}
                    data-testid="switch-premium-mode-industrial"
                  />
                  <Moon className="w-4 h-4 text-blue-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="dashboard-grid mb-8">
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-green-500/20">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <span className="depth-card-title">Orders Today</span>
            </div>
            <div className="kpi-value">{orderStats?.pending || 12}</div>
            <div className="kpi-trend positive">
              <TrendingUp className="w-4 h-4" />
              <span>+8% from yesterday</span>
            </div>
          </div>

          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-blue-500/20">
                <Factory className="w-5 h-5 text-blue-400" />
              </div>
              <span className="depth-card-title">In Production</span>
            </div>
            <div className="kpi-value">{orderStats?.inProduction || 47}</div>
            <div className="kpi-label">Active work orders</div>
          </div>

          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-purple-500/20">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
              </div>
              <span className="depth-card-title">Completed This Week</span>
            </div>
            <div className="kpi-value">{orderStats?.completed || 156}</div>
            <div className="kpi-trend positive">
              <TrendingUp className="w-4 h-4" />
              <span>On target</span>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="dashboard-grid">
          {/* Order Management */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-green-500/20">
                <Plus className="w-5 h-5 text-green-400" />
              </div>
              <span className="depth-card-title">Order Management</span>
            </div>
            <div className="space-y-2">
              <Link href="/order-entry" className="depth-card-link">
                <Plus className="depth-card-link-icon" />
                <span>New Order</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/orders-list" className="depth-card-link">
                <List className="depth-card-link-icon" />
                <span>View All Orders</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/draft-orders" className="depth-card-link">
                <FilePenLine className="depth-card-link-icon" />
                <span>Draft Orders</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          </div>

          {/* Inventory */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-blue-500/20">
                <Warehouse className="w-5 h-5 text-blue-400" />
              </div>
              <span className="depth-card-title">Inventory</span>
            </div>
            <div className="space-y-2">
              <Link href="/inventory/dashboard" className="depth-card-link">
                <BarChart className="depth-card-link-icon" />
                <span>Dashboard</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/inventory/scanner" className="depth-card-link">
                <Scan className="depth-card-link-icon" />
                <span>Scanner</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/inventory/manager" className="depth-card-link">
                <Package className="depth-card-link-icon" />
                <span>Manager</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/inventory/receiving" className="depth-card-link">
                <Receipt className="depth-card-link-icon" />
                <span>Receiving</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/inventory/parts-request" className="depth-card-link">
                <ClipboardList className="depth-card-link-icon" />
                <span>Parts Requests</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          </div>

          {/* QC & Maintenance */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-orange-500/20">
                <Shield className="w-5 h-5 text-orange-400" />
              </div>
              <span className="depth-card-title">QC & Maintenance</span>
            </div>
            <div className="space-y-2">
              <Link href="/qc" className="depth-card-link">
                <Shield className="depth-card-link-icon" />
                <span>Quality Control</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/maintenance" className="depth-card-link">
                <Wrench className="depth-card-link-icon" />
                <span>Maintenance</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          </div>

          {/* Employee Portal */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-purple-500/20">
                <User className="w-5 h-5 text-purple-400" />
              </div>
              <span className="depth-card-title">Employee Portal</span>
            </div>
            <div className="space-y-2">
              <Link href="/employee-portal" className="depth-card-link">
                <User className="depth-card-link-icon" />
                <span>Employee Portal</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/time-clock-admin" className="depth-card-link">
                <Clock className="depth-card-link-icon" />
                <span>Time Clock Admin</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          </div>

          {/* Finance */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-red-500/20">
                <DollarSign className="w-5 h-5 text-red-400" />
              </div>
              <span className="depth-card-title">Finance</span>
            </div>
            <div className="space-y-2">
              <Link href="/finance/dashboard" className="depth-card-link">
                <BarChart className="depth-card-link-icon" />
                <span>Dashboard</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/finance/ap-journal" className="depth-card-link">
                <Receipt className="depth-card-link-icon" />
                <span>AP Journal</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/finance/ar-journal" className="depth-card-link">
                <TrendingUp className="depth-card-link-icon" />
                <span>AR Journal</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/finance/cogs-report" className="depth-card-link">
                <TrendingDown className="depth-card-link-icon" />
                <span>COGS Report</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          </div>

          {/* Forms & Reports */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-indigo-500/20">
                <FormInput className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="depth-card-title">Forms & Reports</span>
            </div>
            <div className="space-y-2">
              <Link href="/enhanced-forms" className="depth-card-link">
                <FormInput className="depth-card-link-icon" />
                <span>Form Builder</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
              <Link href="/enhanced-reports" className="depth-card-link">
                <PieChart className="depth-card-link-icon" />
                <span>Reports</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
              </Link>
            </div>
          </div>

          {/* Manufacturing Operations */}
          <div className="depth-card col-span-1 md:col-span-2 lg:col-span-3">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-cyan-500/20">
                <Factory className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="depth-card-title">Manufacturing Operations</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              <Link href="/customers" className="depth-card-link">
                <Users className="depth-card-link-icon" />
                <span>Customers</span>
              </Link>
              <Link href="/purchase-orders" className="depth-card-link">
                <ClipboardList className="depth-card-link-icon" />
                <span>P1 Purchase Orders</span>
              </Link>
              <Link href="/p2-purchase-orders" className="depth-card-link">
                <FileText className="depth-card-link-icon" />
                <span>P2 Purchase Orders</span>
              </Link>
              <Link href="/production-tracking" className="depth-card-link">
                <TrendingUp className="depth-card-link-icon" />
                <span>Production Tracking</span>
              </Link>
              <Link href="/bom-administration" className="depth-card-link">
                <Package className="depth-card-link-icon" />
                <span>BOM Administration</span>
              </Link>
              <Link href="/barcode-scanner" className="depth-card-link">
                <Scan className="depth-card-link-icon" />
                <span>Barcode Scanner</span>
              </Link>
              <Link href="/layup-scheduler" className="depth-card-link">
                <Calendar className="depth-card-link-icon" />
                <span>Layup Scheduler</span>
              </Link>
              <Link href="/ag-dashboard" className="depth-card-link">
                <BarChart className="depth-card-link-icon" />
                <span>AG Dashboard</span>
              </Link>
              <Link href="/voice-notes" className="depth-card-link">
                <Mic className="depth-card-link-icon" />
                <span>Voice Notes</span>
              </Link>
              <Link href="/media-library" className="depth-card-link">
                <Image className="depth-card-link-icon" />
                <span>Media Library</span>
              </Link>
              <Link href="/sign-pdf" className="depth-card-link">
                <FileSignature className="depth-card-link-icon" />
                <span>Sign PDF</span>
              </Link>
              <Link href="/signed-documents" className="depth-card-link">
                <FileBadge className="depth-card-link-icon" />
                <span>Signed Documents</span>
              </Link>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-amber-500/20">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <span className="depth-card-title">Quick Actions</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/order-entry">
                <button className="quick-action-btn w-full">
                  <Plus className="w-4 h-4" />
                  New Order
                </button>
              </Link>
              <Link href="/barcode-scanner">
                <button className="quick-action-btn w-full">
                  <Scan className="w-4 h-4" />
                  Scan
                </button>
              </Link>
            </div>
          </div>

          {/* Activity */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-pink-500/20">
                <Activity className="w-5 h-5 text-pink-400" />
              </div>
              <span className="depth-card-title">Recent Activity</span>
            </div>
            <div className="depth-card-content space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                <span>Order EL071 completed</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                <span>New PO received</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                <span>Inventory alert: Low stock</span>
              </div>
            </div>
          </div>

          {/* System Status */}
          <div className="depth-card">
            <div className="depth-card-header">
              <div className="depth-card-icon bg-teal-500/20">
                <Settings className="w-5 h-5 text-teal-400" />
              </div>
              <span className="depth-card-title">System Status</span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Database</span>
                  <span className="text-green-400">Healthy</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill bg-green-500" style={{ width: '95%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">API Response</span>
                  <span className="text-green-400">Fast</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill bg-blue-500" style={{ width: '88%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* My Tasks Control Center */}
        {currentUser?.employeeId && (
          <div className="mt-8">
            <div className="depth-card">
              <MyTasksControlCenter
                employeeId={currentUser.employeeId}
                userName={currentUser.username}
                compact={false}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="section-divider"></div>
        <div className="text-center text-gray-500 text-sm">
          EPOCH v8 Manufacturing ERP - Premium Dashboard
        </div>
      </div>
    </div>
  );
}

function LightModeDashboard({ 
  currentUser, 
  onToggleMode 
}: { 
  currentUser?: { id: number; username: string; role: string; employeeId?: number }; 
  onToggleMode: () => void;
}) {
  const isStaciw = currentUser?.username === 'staciw';

  const orderManagementItems = [
    { path: '/order-entry', label: 'New Order', icon: Plus, description: 'Create new customer orders' },
    { path: '/orders-list', label: 'View All Orders', icon: List, description: 'View and manage all orders' },
    { path: '/draft-orders', label: 'Draft Orders', icon: FilePenLine, description: 'Manage saved draft orders' },
  ];

  const inventoryItems = [
    { path: '/inventory/dashboard', label: 'Dashboard', icon: BarChart, description: 'Inventory overview and analytics' },
    { path: '/inventory/scanner', label: 'Scanner', icon: Scan, description: 'Scan inventory items' },
    { path: '/inventory/manager', label: 'Manager', icon: Package, description: 'Manage inventory items' },
    { path: '/inventory/receiving', label: 'Receiving', icon: Receipt, description: 'Receive incoming inventory' },
    { path: '/inventory/parts-request', label: 'Parts Requests', icon: ClipboardList, description: 'Department parts requests' },
  ];

  const qcMaintenanceItems = [
    { path: '/qc', label: 'Quality Control', icon: Shield, description: 'QC inspections and definitions' },
    { path: '/maintenance', label: 'Maintenance', icon: Wrench, description: 'Equipment maintenance tracking' },
  ];

  const employeePortalItems = [
    { path: '/employee-portal', label: 'Employee Portal', icon: User, description: 'Employee time tracking and tasks' },
    { path: '/time-clock-admin', label: 'Time Clock Admin', icon: Settings, description: 'Administrative time tracking' },
  ];

  const financeItems = [
    { path: '/finance/dashboard', label: 'Dashboard', icon: BarChart, description: 'Financial overview and metrics' },
    { path: '/finance/ap-journal', label: 'AP Journal', icon: Receipt, description: 'Accounts payable journal' },
    { path: '/finance/ar-journal', label: 'AR Journal', icon: TrendingUp, description: 'Accounts receivable journal' },
    { path: '/finance/cogs-report', label: 'COGS Report', icon: TrendingDown, description: 'Cost of goods sold reporting' },
  ];

  const formsReportsItems = [
    { path: '/enhanced-forms', label: 'Form Builder', icon: FormInput, description: 'Enhanced form builder with drag-and-drop' },
    { path: '/enhanced-reports', label: 'Reports', icon: PieChart, description: 'Advanced reporting with PDF/CSV export' },
  ];

  const mainNavItems = [
    { path: '/module8-test', label: 'Module 8 Test', icon: TestTube, description: 'Test API integrations and communications' },
    { path: '/customers', label: 'Customer Management', icon: Users, description: 'Manage customer database' },
    { path: '/purchase-orders', label: 'P1 Purchase Orders', icon: ClipboardList, description: 'Customer PO management' },
    { path: '/p2-purchase-orders', label: 'P2 Purchase Orders', icon: FileText, description: 'P2 customer management and purchase orders' },
    { path: '/production-tracking', label: 'Production Tracking', icon: TrendingUp, description: 'Track production orders from POs' },
    { path: '/bom-administration', label: 'BOM Administration', icon: Package, description: 'Manage Bill of Materials for P2 operations' },
    { path: '/barcode-scanner', label: 'Barcode Scanner', icon: Scan, description: 'Scan order barcodes' },
    { path: '/layup-scheduler', label: 'Layup Scheduler', icon: Calendar, description: 'Schedule and manage layup production orders' },
    { path: '/ag-dashboard', label: 'AG Dashboard', icon: BarChart, description: 'Unified production dashboard' },
    { path: '/voice-notes', label: 'Voice Notes', icon: Mic, description: 'Voice-activated issue tracking and notes' },
    { path: '/media-library', label: 'Media Library', icon: Image, description: 'Browse and manage uploaded images and documents' },
    { path: '/sign-pdf', label: 'Sign PDF', icon: FileSignature, description: 'Sign PDF documents with digital signature' },
    { path: '/signed-documents', label: 'Signed Documents', icon: FileBadge, description: 'View all signed approval documents' },
  ];

  const renderNavigationCard = (item: any) => (
    <Link key={item.path} href={item.path}>
      <button className="h-auto p-4 justify-start text-left w-full hover:bg-gray-100 rounded-lg transition-colors">
        <div className="flex items-center space-x-3">
          <item.icon className="w-5 h-5 text-gray-600" />
          <div>
            <div className="font-medium text-gray-900">{item.label}</div>
            <div className="text-xs text-gray-500">{item.description}</div>
          </div>
        </div>
      </button>
    </Link>
  );

  const renderSectionCard = (title: string, items: any[], bgColor: string, iconColor: string, IconComponent: any) => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-fit">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center space-x-2 text-lg font-semibold">
          <div className={`p-2 rounded-lg ${bgColor}`}>
            <IconComponent className={`w-5 h-5 ${iconColor}`} />
          </div>
          <span>{title}</span>
        </div>
      </div>
      <div className="p-2 space-y-1">
        {items.map(renderNavigationCard)}
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            EPOCH v8 Manufacturing ERP
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Current Toggle</span>
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-yellow-500" />
                <Switch
                  checked={false}
                  onCheckedChange={onToggleMode}
                  data-testid="switch-premium-mode"
                />
                <Moon className="w-4 h-4 text-gray-400" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-amber-500 font-medium">Alternate Industrial Toggle</span>
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-yellow-500" />
                <IndustrialSwitch
                  checked={false}
                  onCheckedChange={onToggleMode}
                  size={1.1}
                  data-testid="switch-premium-mode-industrial"
                />
                <Moon className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Main Navigation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {renderSectionCard('Order Management', orderManagementItems, 'bg-green-100', 'text-green-600', Plus)}
        {renderSectionCard('Inventory', inventoryItems, 'bg-blue-100', 'text-blue-600', Warehouse)}
        {renderSectionCard('QC & Maintenance', qcMaintenanceItems, 'bg-orange-100', 'text-orange-600', Shield)}
        {renderSectionCard('Employee Portal', employeePortalItems, 'bg-purple-100', 'text-purple-600', User)}
        {renderSectionCard('Finance', financeItems, 'bg-red-100', 'text-red-600', DollarSign)}
        {renderSectionCard('Forms & Reports', formsReportsItems, 'bg-indigo-100', 'text-indigo-600', FormInput)}
        <WeeklyShippingWidget />
        <SystemHealthWidget />
      </div>

      {/* Customer Watch Rules Section - For staciw */}
      {isStaciw && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-lg font-semibold">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Eye className="w-5 h-5 text-purple-600" />
                </div>
                <span>Customer Watch Rules</span>
              </div>
              <Link href="/watch-rules">
                <button className="flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg hover:bg-purple-50 hover:border-purple-300">
                  <Settings className="w-4 h-4" />
                  Manage Watch Rules
                </button>
              </Link>
            </div>
          </div>
          <div className="p-4">
            <WatchRuleCards userId="staciw" employeeId={22} showManageButton={false} />
          </div>
        </div>
      )}

      {/* My Tasks Control Center */}
      {currentUser?.employeeId && (
        <MyTasksControlCenter
          employeeId={currentUser.employeeId}
          userName={currentUser.username}
          compact={false}
        />
      )}

      {/* Additional Navigation Items */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center space-x-2 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-gray-100">
              <Factory className="w-5 h-5 text-gray-600" />
            </div>
            <span>Manufacturing Operations</span>
          </div>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {mainNavItems.map(renderNavigationCard)}
          </div>
        </div>
      </div>

      {/* System Status Footer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">✓</div>
          <div className="text-sm font-medium">System Online</div>
          <div className="text-xs text-gray-500">All services operational</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">📊</div>
          <div className="text-sm font-medium">Real-time Data</div>
          <div className="text-xs text-gray-500">Live production tracking</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">🔧</div>
          <div className="text-sm font-medium">Manufacturing</div>
          <div className="text-xs text-gray-500">Complete ERP solution</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">⚡</div>
          <div className="text-sm font-medium">Quick Access</div>
          <div className="text-xs text-gray-500">Navigate anywhere fast</div>
        </div>
      </div>
    </div>
  );
}

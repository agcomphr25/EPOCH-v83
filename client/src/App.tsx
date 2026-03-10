import React from 'react';
import { Switch, Route, Router, Link, useLocation } from 'wouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { Toaster } from '@/components/ui/toaster';
// import { CSVProvider } from "./contexts/CSVContext"; // Temporarily disabled
import Navigation from './components/Navigation';
import OfflineIndicator from './components/OfflineIndicator';
import MessageNotificationPopup from './components/MessageNotificationPopup';
import { useWebSocketNotifications } from './hooks/useWebSocketNotifications';
import NotFound from './pages/not-found';
import AccessDenied from './pages/AccessDenied';
import RouteGuard from './components/auth/RouteGuard';
import Dashboard from './pages/Dashboard';
import OrderManagement from './pages/OrderManagement';
import OrdersManagementPage from './pages/OrdersManagementPage';
import DiscountManagement from './pages/DiscountManagement';
import OrderEntry from './pages/OrderEntry';
import OrderEntryTest from './components/OrderEntryTest';
import OrdersList from './pages/OrdersList';
import OrdersListSimple from './pages/OrdersListSimple';
import FeatureManager from './pages/FeatureManager';
import StockModels from './pages/StockModels';
import DraftOrders from './components/DraftOrders';
import AdminFormsPage from './pages/AdminFormsPage';
import FormPage from './pages/FormPage';
import ReportPage from './pages/ReportPage';
import InventoryScannerPage from './pages/InventoryScannerPage';
import InventoryDashboardPage from './pages/InventoryDashboardPage';
import InventoryManagerPage from './pages/InventoryManagerPage';
import InventoryReceivingPage from './pages/InventoryReceivingPage';
import EnhancedInventoryMRPPage from './pages/EnhancedInventoryMRPPage';
import MaterialReadinessDashboard from './pages/MaterialReadinessDashboard';
import MaterialIntelligenceDashboard from './pages/MaterialIntelligenceDashboard';
import DepartmentPartsRequestPage from './pages/DepartmentPartsRequestPage';
import ConsolidatedNeedsListPage from './pages/ConsolidatedNeedsListPage';
import QCPage from './pages/QCPage';
import AuditSettings from './pages/AuditSettings';
import OrderTimeline from './pages/OrderTimeline';
import MediaLibrary from './pages/MediaLibrary';
import SignPDFPage from './pages/SignPDFPage';
import SignedDocumentsLibrary from './pages/SignedDocumentsLibrary';
import SignatureWorkflowPage from './pages/SignatureWorkflowPage';
import ReferenceDocsPage from './pages/ReferenceDocsPage';
import VoiceNotesPage from './pages/VoiceNotesPage';
import ProcessRuns from './pages/ProcessRuns';
import ProductionStationDashboard from './pages/ProductionStationDashboard';
import TVDisplayPage from './pages/TVDisplayPage';
import ProductionTimerHistory from './pages/ProductionTimerHistory';
import TimerProgramsPage from './pages/TimerProgramsPage';
import FieldPage from './pages/FieldPage';
import ExecutiveRundown from './pages/ExecutiveRundown';
import TicketsPage from './pages/TicketsPage';
import PDFSignatureTool from './pages/PDFSignatureTool';
import MaintenancePage from './pages/MaintenancePage';
import MaintenanceEventsPage from './pages/MaintenanceEventsPage';
import WorkOrderDetailPage from './pages/WorkOrderDetailPage';
import AssetsPage from './pages/AssetsPage';
import AssetDashboardPage from './pages/AssetDashboardPage';
import EmployeePortalPage from './pages/EmployeePortalPage';
import TimeClockAdminPage from './pages/TimeClockAdminPage';
import Module8TestPage from './pages/Module8TestPage';
import CommunicationInboxPage from './pages/CommunicationInboxPage';
import MarketingCommunications from './pages/MarketingCommunications';
import EmailTemplateEditor from './pages/EmailTemplateEditor';
import SignOrderPageSettings from './pages/SignOrderPageSettings';
import APJournalPage from './pages/APJournalPage';
import ARJournalPage from './pages/ARJournalPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceFormPage from './pages/InvoiceFormPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import ARAgingPage from './pages/ARAgingPage';
import ARPaymentsPage from './pages/ARPaymentsPage';
import COGSReportPage from './pages/COGSReportPage';
import FinanceDashboardPage from './pages/FinanceDashboardPage';
import CostCenterManagement from './pages/CostCenterManagement';
import CostAccountingPage from './pages/CostAccountingPage';
import MonthlyFulfilledReport from './pages/MonthlyFulfilledReport';
import POProductionOrdersReport from './pages/POProductionOrdersReport';
import BulkPaymentPage from './pages/BulkPaymentPage';
import AccountingPage from './pages/AccountingPage';
import EmployeeBadgeConfiguration from './pages/EmployeeBadgeConfiguration';
import BadgeScanner from './pages/BadgeScanner';
import OnboardingDashboard from './pages/OnboardingDashboard';
import OnboardingPathsPage from './pages/OnboardingPathsPage';
import OnboardingSettingsPage from './pages/OnboardingSettingsPage';
import PendingEmployerSignaturesPage from './pages/PendingEmployerSignaturesPage';
import OnboardingFormsPage from './pages/OnboardingFormsPage';
import OnboardingSessionWizard from './pages/OnboardingSessionWizard';
import EnhancedFormsPage from './pages/EnhancedFormsPage';
import EnhancedReportsPage from './pages/EnhancedReportsPage';
import FormRendererPage from './pages/FormRendererPage';
import DocumentationPageNew from './pages/DocumentationPageNew';
import CustomerManagement from './pages/CustomerManagement';
import VendorManagement from './pages/VendorManagement';
import ManageGroups from './pages/ManageGroups';
import PurchaseOrders from './pages/PurchaseOrders';
import P2ControlCenter from './pages/P2ControlCenter';
import P2Forms from './pages/P2Forms';
import ManufacturingQueue from './pages/ManufacturingQueue';
import P2TravelerPage from './pages/P2TravelerPage';
import P2TravelerViewer from './pages/P2TravelerViewer';
import P2PackingSlipViewer from './pages/P2PackingSlipViewer';
import P2CertificateViewer from './pages/P2CertificateViewer';
import P2TestReportViewer from './pages/P2TestReportViewer';
import POProductsPage from './pages/POProductsPage';
import ProductLabelsPage from './pages/ProductLabelsPage';
import ProductionTracking from './pages/ProductionTracking';
import BarcodeScannerPage from './pages/BarcodeScannerPage';
import AllOrdersPage from './pages/AllOrdersPage';
import OrderReports from './pages/OrderReports';
import ProductionOrderInspector from './pages/ProductionOrderInspector';
import DomainTruthInspector from './pages/DomainTruthInspector';
import QueueIntegrityMonitor from './pages/admin/QueueIntegrityMonitor';
import ProductionControlTower from './pages/admin/ProductionControlTower';
import LinkGroupsReport from './pages/LinkGroupsReport';
import DueDateCapacityReport from './pages/DueDateCapacityReport';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import AGTestDashboard from './pages/AGTestDashboard';
import ADMINTestDashboard from './pages/GLENNTestDashboard';
import ProductionCommandCenter from './pages/ProductionCommandCenter';
import ProductionControlCenter from './pages/ProductionControlCenter';
import JOHNLTestDashboard from './pages/JOHNLTestDashboard';
import JENSTestDashboard from './pages/JENSTestDashboard';
import STACIWTestDashboard from './pages/STACIWTestDashboard';
import DARLENEBTestDashboard from './pages/DARLENEBTestDashboard';
import LAURIETTestDashboard from './pages/LAURIETTestDashboard';
import TIMSTestDashboard from './pages/TIMSTestDashboard';
import WatchRulesPage from './pages/WatchRulesPage';
import BRADWTestDashboard from './pages/BRADWTestDashboard';
import FALEESHAHTestDashboard from './pages/FALEESHAHTestDashboard';
import JOEYBTestDashboard from './pages/JOEYBTestDashboard';
import TANDYMTestDashboard from './pages/TANDYMTestDashboard';
import OrderDepartmentTransfer from './pages/OrderDepartmentTransfer';
import { BOMAdministration } from './pages/BOMAdministration';
import RobustBOMAdministration from './pages/RobustBOMAdministration';
import AGBottomMetalReport from './pages/AGBottomMetalReport';
import ShippingTracker from './pages/ShippingTracker';
import EmployeeDashboard from './pages/EmployeeDashboard';
import EmployeeDetail from './pages/EmployeeDetail';
import EmployeePortal from './pages/EmployeePortal';
import UserManagement from './pages/UserManagement';
import Settings from './pages/Settings';
import LoginPage from './pages/LoginPage';
import MasterDocumentRegister from '@/pages/MasterDocumentRegister';
import WasteManagementForm from '@/pages/WasteManagementForm';
import TaskTracker from '@/pages/TaskTracker';
import KickbackTracking from '@/components/KickbackTracking';
import DocumentManagement from './pages/DocumentManagement';
import RoutingDocumentManagement from './pages/RoutingDocumentManagement';
import ShutdownProceduresTraining from '@/pages/ShutdownProceduresTraining';
import CounterfeitPreventionTraining from '@/pages/CounterfeitPreventionTraining';
import TrainingControlCenter from '@/pages/TrainingControlCenter';
import TrainingModule from '@/pages/TrainingModule';
import TrainingPlans from '@/pages/TrainingPlans';
import TrainerDashboard from '@/pages/TrainerDashboard';
import TraineeTrainingPortal from '@/pages/TraineeTrainingPortal';
import TrainingContentLibrary from '@/pages/TrainingContentLibrary';
import {
  ProgramsPage,
  ProgramBuilderPage,
  AssignProgramPage,
  SessionDailySheetPage,
  WorkInstructionsPage,
  QuizManagementPage,
  DailyQuizSelectionPage,
} from '@/modules/training-builder';
import ImportCertifications from '@/pages/ImportCertifications';
import CertificationBacklog from '@/pages/CertificationBacklog';
import Calendar from './pages/Calendar';
import EmailInbox from './pages/EmailInbox';
import LayupPluggingQueuePage from './pages/LayupPluggingQueuePage';
import BarcodeQueuePage from './pages/BarcodeQueuePage';
import BulkBarcodeReprint from './pages/BulkBarcodeReprint';
import CNCQueuePage from './pages/CNCQueuePage';
import FinishQCQueuePage from './pages/FinishQCQueuePage';
import FinishQueuePage from './pages/FinishQueuePage';
import FinishQCPage from './pages/FinishQCPage';
import FinishQCCompletedReport from './pages/FinishQCCompletedReport';
import GunsimthQueuePage from './pages/GunsimthQueuePage';
import PaintQueuePage from './pages/PaintQueuePage';
import QCShippingQueuePage from './pages/QCShippingQueuePage';
import OEMShipmentsPage from './pages/OEMShipmentsPage';
import ShippingQueuePage from './pages/ShippingQueuePage';
import ShippingLabelPage from './pages/ShippingLabelPage';
import NonconformanceDashboard from './components/NonconformanceDashboard';
import NonconformanceReport from './components/NonconformanceReport';
import RTSPage from './pages/RTSPage';
import RFQRiskAssessment from './pages/RFQRiskAssessment';
import ProductionQueueManager from './components/ProductionQueueManager';
import EnhancedLayupSchedulerPage from './pages/EnhancedLayupSchedulerPage';
import WorkDayAwareScheduler from './components/WorkDayAwareScheduler';
import PurchaseReviewChecklist from './pages/PurchaseReviewChecklist';
import PurchaseReviewSubmissions from './pages/PurchaseReviewSubmissions';
import ManufacturersCertificate from './pages/ManufacturersCertificate';
import P2QuoteForm from './pages/P2QuoteForm';
import P2QuotesList from './pages/P2QuotesList';
import PaymentManagement from './pages/PaymentManagement';
import PaymentAnalytics from './pages/PaymentAnalytics';
import HistoricalDataEntry from './pages/HistoricalDataEntry';
import ShippedOrderDiscountsPage from './pages/ShippedOrderDiscountsPage';
import InvoiceCategoryBreakdownPage from './pages/InvoiceCategoryBreakdownPage';
import ScrapReportPage from './pages/ScrapReportPage';
import RefundRequest from './pages/RefundRequest';
import RefundQueue from './pages/RefundQueue';
import RMAFormPage from './pages/RMAFormPage';
import CreditMemoPage from './pages/CreditMemoPage';
import ProductionQueuePage from './pages/ProductionQueuePage';
import SimplifiedLayupScheduler from './components/SimplifiedLayupScheduler';
import CustomerSatisfaction from './pages/CustomerSatisfaction';
import AdminPanelPage from './pages/AdminPanelPage';
import AdminChecklistManagementPage from './pages/AdminChecklistManagementPage';
import ProductionForecastPage from './pages/ProductionForecastPage';
import ForecastSettings from './pages/ForecastSettings';
import AccountingPrepPage from './pages/AccountingPrepPage';
import SystemHealthChecksPage from './pages/SystemHealthChecksPage';
import CommunicationLogsPage from './pages/CommunicationLogsPage';
import MonitoredLinksManager from './pages/MonitoredLinksManager';
import VendorsPage from './pages/VendorsPage';
import VendorPOPage from './pages/VendorPOPage';
import PDFTemplateManager from './pages/PDFTemplateManager';
import CuttingTableControlCenter from './pages/CuttingTableControlCenter';
import CuttingControlCenterLayout from './pages/cutting/CuttingControlCenterLayout';
import FabricInventoryPage from './pages/FabricInventoryPage';
import MetalAccessoriesTracker from './pages/MetalAccessoriesTracker';
import DocumentIntelligence from './pages/DocumentIntelligence';
import SignOrderPage from './pages/SignOrderPage';
import FillAndSignPage from './pages/FillAndSignPage';
import QRCodeAdminPage from './pages/QRCodeAdminPage';
import QRErrorPage from './pages/QRErrorPage';
import AttentionDashboard from './pages/AttentionDashboard';
import FillablePdfTemplatesAdmin from './pages/FillablePdfTemplatesAdmin';
import VisualFieldEditor from './pages/VisualFieldEditor';
import PDFSettings from './pages/PDFSettings';
import GatewayReports from './pages/GatewayReports';
import MetricsSandbox from './pages/MetricsSandbox';
import PreproductionChecklistPage from './pages/PreproductionChecklistPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import HelpCenter from './pages/HelpCenter';
import TravelerManagement from './pages/TravelerManagement';
import TravelerExecution from './pages/TravelerExecution';
import MaterialReceivingPage from './pages/MaterialReceivingPage';
import MaterialInventoryPage from './pages/MaterialInventoryPage';
import BusinessReviewPresentation from './pages/BusinessReviewPresentation';
import FilteredOrdersReport from './pages/FilteredOrdersReport';
import UrgentOrdersReport from './pages/UrgentOrdersReport';
import OTDReport from './pages/OTDReport';
import OrderHeatMap from './pages/OrderHeatMap';

import { Toaster as HotToaster } from 'react-hot-toast';
import DeploymentAuthWrapper from './components/DeploymentAuthWrapper';
import { getDashboardRoute } from './config/dashboardMapping';

// Component to conditionally render Navigation
function ConditionalNavigation() {
  const [location] = useLocation();
  const hideNavigation =
    location === '/darleneb-dashboard' ||
    location === '/ag-dashboard' ||
    location === '/staciw-dashboard' ||
    location === '/login' ||
    location.startsWith('/sign-order') || // Hide navigation on customer sign order page
    location.startsWith('/fill-and-sign') || // Hide navigation on customer fill-and-sign page
    location.startsWith('/tv-display'); // Hide navigation on TV display page

  return hideNavigation ? null : <Navigation />;
}

// Root redirect component that intercepts "/" and redirects to personalized dashboards or login
function RootRedirect() {
  const [, setLocation] = useLocation();
  const [isRedirecting, setIsRedirecting] = React.useState(true);

  React.useEffect(() => {
    // Fetch session using credentials to work with cookie-based auth
    fetch('/api/auth/session', {
      credentials: 'include',
      headers: {
        // Also check for localStorage token as fallback
        Authorization: `Bearer ${
          localStorage.getItem('sessionToken') ||
          localStorage.getItem('jwtToken') ||
          ''
        }`,
      },
    })
      .then((res) => {
        if (res.ok) {
          return res.json();
        }
        throw new Error('Not authenticated');
      })
      .then((userData) => {
        if (userData?.username) {
          const personalizedRoute = getDashboardRoute(userData.username);
          // If user has a personalized dashboard, redirect immediately
          if (personalizedRoute !== '/') {
            console.log(
              `Redirecting ${userData.username} to ${personalizedRoute}`
            );
            setLocation(personalizedRoute);
            return;
          }
        }
        // If no personalized dashboard, show generic dashboard
        setIsRedirecting(false);
      })
      .catch((error) => {
        console.error('Failed to fetch session for redirect:', error);
        // User is not authenticated - redirect to login page
        setLocation('/login');
      });
  }, [setLocation]);

  // Show loading state while checking for redirect
  if (isRedirecting) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If we get here, user is authenticated but has no personalized dashboard - render the generic one
  return <Dashboard />;
}

function WebSocketNotifications() {
  useWebSocketNotifications();
  return null;
}

function App() {
  console.log('App component is rendering...');
  console.log('Environment:', import.meta.env.MODE);
  console.log('Base URL:', import.meta.env.BASE_URL);

  // Add error boundary
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global error caught:', event.error);
      setError(event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      setError(new Error(event.reason));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection
      );
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            Application Error
          </h1>
          <p className="text-gray-700 mb-4">
            An error occurred while loading the application:
          </p>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {error.message}
            {error.stack && '\n\nStack trace:\n' + error.stack}
          </pre>
          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            onClick={() => window.location.reload()}
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  try {
    return (
      <QueryClientProvider client={queryClient}>
        <DeploymentAuthWrapper>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <ConditionalNavigation />
              <OfflineIndicator />
              <main className="container mx-auto px-4 py-8">
                <RouteGuard>
                  <Switch>
                    <Route path="/" component={RootRedirect} />
                    <Route path="/access-denied" component={AccessDenied} />
                  <Route path="/order-management" component={OrderManagement} />
                  <Route
                    path="/orders-management"
                    component={OrdersManagementPage}
                  />
                  <Route path="/order-entry" component={OrderEntry} />
                  <Route path="/test-order-entry" component={OrderEntryTest} />
                  <Route path="/orders" component={OrdersList} />
                  <Route path="/orders-list" component={OrdersList} />
                  <Route path="/orders-simple" component={OrdersListSimple} />
                  <Route path="/all-orders" component={AllOrdersPage} />
                  <Route path="/order-reports" component={OrderReports} />
                  <Route path="/link-groups" component={LinkGroupsReport} />
                  <Route path="/due-date-capacity" component={DueDateCapacityReport} />
                  <Route path="/filtered-orders-report" component={FilteredOrdersReport} />
                  <Route path="/urgent-orders-report" component={UrgentOrdersReport} />
                  <Route path="/otd-report" component={OTDReport} />
                  <Route path="/order-heat-map" component={OrderHeatMap} />
                  <Route path="/business-review" component={BusinessReviewPresentation} />
                  <Route path="/analytics" component={AnalyticsDashboard} />
                  <Route path="/finish-qc-completed-report" component={FinishQCCompletedReport} />
                  <Route path="/discounts" component={DiscountManagement} />
                  <Route path="/feature-manager" component={FeatureManager} />
                  <Route path="/stock-models" component={StockModels} />
                  <Route path="/draft-orders" component={DraftOrders} />

                  {/* Customer Management Routes */}
                  <Route
                    path="/customer-management"
                    component={CustomerManagement}
                  />
                  <Route path="/customers" component={CustomerManagement} />
                  <Route
                    path="/customer-satisfaction"
                    component={CustomerSatisfaction}
                  />

                  {/* Admin Panel Routes */}
                  <Route path="/admin/orders" component={AdminPanelPage} />
                  <Route path="/admin/health-checks" component={SystemHealthChecksPage} />
                  <Route path="/admin/monitored-links" component={MonitoredLinksManager} />
                  <Route path="/admin/communication-logs" component={CommunicationLogsPage} />
                  <Route path="/admin/accounting-prep" component={AccountingPrepPage} />
                  <Route path="/admin/qr-codes" component={QRCodeAdminPage} />
                  <Route path="/admin/checklist-management" component={AdminChecklistManagementPage} />
                  <Route path="/production-forecast" component={ProductionForecastPage} />
                  <Route path="/production-forecast/settings" component={ForecastSettings} />
                  <Route path="/admin/attention" component={AttentionDashboard} />
                  <Route path="/admin/inspector/production-order" component={ProductionOrderInspector} />
                  <Route path="/admin/domain-truth" component={DomainTruthInspector} />
                  <Route path="/admin/queue-integrity" component={QueueIntegrityMonitor} />
                  <Route path="/admin/control-tower" component={ProductionControlTower} />
                  <Route path="/qr-error" component={QRErrorPage} />
                  <Route path="/audit-settings" component={AuditSettings} />
                  <Route path="/order-timeline/:entityType/:entityId" component={OrderTimeline} />
                  <Route path="/media-library" component={MediaLibrary} />
                  <Route path="/sign-pdf" component={SignPDFPage} />
                  <Route path="/signed-documents" component={SignedDocumentsLibrary} />
                  <Route path="/signature-workflow" component={SignatureWorkflowPage} />
                  <Route path="/reference-docs" component={ReferenceDocsPage} />
                  <Route path="/voice-notes" component={VoiceNotesPage} />
                  <Route path="/process-runs" component={ProcessRuns} />
                  <Route path="/app/production/stations" component={ProductionStationDashboard} />
                  <Route path="/tv-display" component={TVDisplayPage} />
                  <Route path="/app/production/timer-history" component={ProductionTimerHistory} />
                  <Route path="/app/production/timer-programs" component={TimerProgramsPage} />
                  
                  {/* Field - Calm thinking surface (single user: admin_glennj) */}
                  <Route path="/field" component={FieldPage} />
                  <Route path="/executive" component={ExecutiveRundown} />

                  {/* Ticketing System - Internal CSR Tool */}
                  <Route path="/tickets" component={TicketsPage} />
                  <Route path="/pdf-signature-tool" component={PDFSignatureTool} />

                  {/* Vendor Management Routes */}
                  <Route path="/vendor-management" component={VendorManagement} />
                  <Route path="/vendors" component={VendorManagement} />
                  <Route path="/vendor-pos" component={VendorPOPage} />
                  
                  {/* Cost Accounting Routes */}
                  <Route path="/cost-accounting" component={CostAccountingPage} />
                  
                  {/* PDF Template Routes */}
                  <Route path="/pdf-templates" component={PDFTemplateManager} />
                  <Route path="/fillable-pdf-templates" component={FillablePdfTemplatesAdmin} />
                  <Route path="/fillable-pdf-templates/:id/editor" component={VisualFieldEditor} />
                  
                  {/* Item Groups Management */}
                  <Route path="/manage-groups" component={ManageGroups} />

                  {/* Purchase Order Routes */}
                  <Route path="/purchase-orders" component={PurchaseOrders} />
                  <Route
                    path="/p1-purchase-orders"
                    component={PurchaseOrders}
                  />
                  <Route path="/p2-purchase-orders">{() => { window.location.href = '/p2-control-center'; return null; }}</Route>
                  <Route path="/p2-department-manager">{() => { window.location.href = '/p2-control-center'; return null; }}</Route>
                  <Route path="/po-products" component={POProductsPage} />
                  <Route path="/product-labels" component={ProductLabelsPage} />

                  {/* Production and BOM Routes */}
                  <Route
                    path="/production-tracking"
                    component={ProductionTracking}
                  />
                  {/* <Route
                    path="/bom-administration"
                    component={BOMAdministration}
                  /> */}
                  <Route
                    path="/robust-bom-administration"
                    component={RobustBOMAdministration}
                  />
                  <Route
                    path="/robust-bom"
                    component={RobustBOMAdministration}
                  />

                  {/* Barcode and Scanner Routes */}
                  <Route
                    path="/barcode-scanner"
                    component={BarcodeScannerPage}
                  />
                  <Route
                    path="/bulk-barcode-reprint"
                    component={BulkBarcodeReprint}
                  />

                  {/* Inventory Routes (Legacy) */}
                  <Route path="/inventory" component={InventoryManagerPage} />
                  <Route
                    path="/inventory/scanner"
                    component={InventoryScannerPage}
                  />
                  {/* <Route
                    path="/inventory/dashboard"
                    component={InventoryDashboardPage}
                  /> */}
                  <Route
                    path="/inventory/manager"
                    component={InventoryManagerPage}
                  />
                  <Route
                    path="/inventory/receiving"
                    component={InventoryReceivingPage}
                  />
                  <Route
                    path="/inventory/material-intelligence"
                    component={MaterialIntelligenceDashboard}
                  />
                  <Route
                    path="/inventory/enhanced-mrp"
                    component={EnhancedInventoryMRPPage}
                  />
                  <Route
                    path="/production/material-readiness"
                    component={MaterialReadinessDashboard}
                  />
                  <Route
                    path="/inventory/parts-request"
                    component={DepartmentPartsRequestPage}
                  />
                  <Route
                    path="/inventory/consolidated-needs"
                    component={ConsolidatedNeedsListPage}
                  />

                  {/* Enhanced System Routes (Independent) */}
                  <Route
                    path="/metal-accessories"
                    component={MetalAccessoriesTracker}
                  />

                  {/* QC and Maintenance Routes */}
                  <Route path="/qc" component={QCPage} />
                  <Route path="/maintenance" component={MaintenancePage} />
                  <Route path="/maintenance-events" component={MaintenanceEventsPage} />
                  <Route path="/maintenance-events/:id">
                    {(params) => <WorkOrderDetailPage params={params} />}
                  </Route>
                  <Route path="/assets" component={AssetsPage} />
                  <Route path="/asset-dashboard" component={AssetDashboardPage} />

                  {/* Employee Routes */}
                  <Route path="/employee" component={EmployeeDashboard} />
                  <Route path="/onboarding" component={OnboardingDashboard} />
                  <Route path="/onboarding/paths" component={OnboardingPathsPage} />
                  <Route path="/onboarding/settings" component={OnboardingSettingsPage} />
                  <Route path="/onboarding/employer-signatures" component={PendingEmployerSignaturesPage} />
                  {/* DEPRECATED: Form builder hidden - using fixed demographics instead */}
                  {/* <Route path="/onboarding/forms" component={OnboardingFormsPage} /> */}
                  <Route path="/onboarding/session/:id" component={OnboardingSessionWizard} />
                  <Route path="/user-management" component={UserManagement} />
                  <Route path="/settings" component={Settings} />
                  <Route path="/pdf-settings" component={PDFSettings} />
                  <Route
                    path="/employee-portal"
                    component={EmployeePortalPage}
                  />
                  <Route
                    path="/employee-portal/:portalId"
                    component={EmployeePortal}
                  />
                  <Route
                    path="/employee-dashboard"
                    component={EmployeeDashboard}
                  />
                  <Route
                    path="/employee-detail/:id"
                    component={EmployeeDetail}
                  />
                  <Route
                    path="/employee-portal-new"
                    component={EmployeePortal}
                  />
                  <Route
                    path="/time-clock-admin"
                    component={TimeClockAdminPage}
                  />

                  {/* Auth Routes */}
                  <Route path="/login" component={LoginPage} />

                  {/* Communication Routes */}
                  <Route path="/email-inbox" component={EmailInbox} />

                  {/* User Dashboard Routes */}
                  <Route path="/production-command-center" component={ProductionCommandCenter} />
                  <Route path="/production-control-center" component={ProductionControlCenter} />
                  <Route path="/ag-dashboard" component={AGTestDashboard} />
                  <Route
                    path="/admin-dashboard"
                    component={ADMINTestDashboard}
                  />
                  <Route
                    path="/johnl-dashboard"
                    component={JOHNLTestDashboard}
                  />
                  <Route path="/jens-dashboard" component={JENSTestDashboard} />
                  <Route
                    path="/staciw-dashboard"
                    component={STACIWTestDashboard}
                  />
                  <Route
                    path="/darleneb-dashboard"
                    component={DARLENEBTestDashboard}
                  />
                  <Route
                    path="/lauriet-dashboard"
                    component={LAURIETTestDashboard}
                  />
                  <Route path="/tims-dashboard" component={TIMSTestDashboard} />
                  <Route
                    path="/bradw-dashboard"
                    component={BRADWTestDashboard}
                  />
                  <Route
                    path="/faleeshah-dashboard"
                    component={FALEESHAHTestDashboard}
                  />
                  <Route
                    path="/joeyb-dashboard"
                    component={JOEYBTestDashboard}
                  />
                  <Route
                    path="/tandym-dashboard"
                    component={TANDYMTestDashboard}
                  />

                  {/* Watch Rules Management Route */}
                  <Route path="/watch-rules" component={WatchRulesPage} />

                  {/* Cutting Table Routes - 3-Page Structure */}
                  <Route path="/cutting-control-center/:rest*" component={CuttingControlCenterLayout} />
                  <Route path="/cutting-control-center" component={CuttingControlCenterLayout} />
                  <Route path="/cutting-table-legacy" component={CuttingTableControlCenter} />
                  <Route path="/cutting-table">{() => { window.location.href = '/cutting-control-center'; return null; }}</Route>
                  <Route path="/cutting-dashboard">{() => { window.location.href = '/cutting-control-center'; return null; }}</Route>
                  <Route path="/fabric-inventory" component={FabricInventoryPage} />

                  {/* Employee Badge Routes */}
                  <Route path="/badge-configuration" component={EmployeeBadgeConfiguration} />
                  <Route path="/badge-scanner" component={BadgeScanner} />

                  {/* Test Routes */}
                  <Route path="/module8-test" component={Module8TestPage} />
                  <Route
                    path="/order-department-transfer"
                    component={OrderDepartmentTransfer}
                  />
                  <Route
                    path="/communications/inbox"
                    component={CommunicationInboxPage}
                  />
                  <Route
                    path="/marketing-communications"
                    component={MarketingCommunications}
                  />
                  <Route
                    path="/email-templates"
                    component={EmailTemplateEditor}
                  />
                  <Route
                    path="/sign-order-page-settings"
                    component={SignOrderPageSettings}
                  />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route
                    path="/enhanced-reports"
                    component={EnhancedReportsPage}
                  />

                  {/* Finance Routes */}
                  <Route path="/finance/ap-journal" component={APJournalPage} />
                  <Route path="/finance/ar-journal" component={ARJournalPage} />
                  <Route path="/finance/ar-aging" component={ARAgingPage} />
                  <Route path="/finance/ar-payments" component={ARPaymentsPage} />
                  <Route path="/finance/invoices/new" component={InvoiceFormPage} />
                  <Route path="/finance/invoices/:id/edit" component={InvoiceFormPage} />
                  <Route path="/finance/invoices/:id" component={InvoiceDetailPage} />
                  <Route path="/finance/invoices" component={InvoicesPage} />
                  <Route
                    path="/finance/cogs-report"
                    component={COGSReportPage}
                  />
                  <Route
                    path="/finance/dashboard"
                    component={FinanceDashboardPage}
                  />
                  <Route
                    path="/finance/cost-centers"
                    component={CostCenterManagement}
                  />
                  <Route
                    path="/finance/cost-accounting"
                    component={CostAccountingPage}
                  />
                  <Route
                    path="/finance/monthly-fulfilled"
                    component={MonthlyFulfilledReport}
                  />
                  <Route
                    path="/finance/bulk-payment"
                    component={BulkPaymentPage}
                  />
                  <Route
                    path="/finance/accounting"
                    component={AccountingPage}
                  />

                  {/* Payment Processing Routes */}
                  <Route
                    path="/payment-management"
                    component={PaymentManagement}
                  />
                  <Route
                    path="/payment-analytics"
                    component={PaymentAnalytics}
                  />
                  <Route
                    path="/historical-data"
                    component={HistoricalDataEntry}
                  />
                  <Route
                    path="/finance/shipped-discounts"
                    component={ShippedOrderDiscountsPage}
                  />
                  <Route
                    path="/finance/invoice-breakdown"
                    component={InvoiceCategoryBreakdownPage}
                  />
                  <Route
                    path="/finance/scrap-report"
                    component={ScrapReportPage}
                  />

                  {/* Refund Management Routes */}
                  <Route path="/refund-request" component={RefundRequest} />
                  <Route path="/help" component={HelpCenter} />
                  <Route path="/refund-queue" component={RefundQueue} />
                  <Route path="/rma-form" component={RMAFormPage} />

                  {/* Credit Memo Management */}
                  <Route path="/credit-memo" component={CreditMemoPage} />

                  {/* Forms and Reports Routes */}
                  <Route path="/forms" component={AdminFormsPage} />
                  <Route path="/form/:id" component={FormPage} />
                  <Route path="/reports" component={ReportPage} />
                  <Route path="/reports/po-production-orders" component={POProductionOrdersReport} />
                  <Route
                    path="/form-renderer/:id"
                    component={FormRendererPage}
                  />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route
                    path="/enhanced-reports"
                    component={EnhancedReportsPage}
                  />
                  <Route
                    path="/documentation"
                    component={DocumentationPageNew}
                  />

                  {/* P2 Routes - Control Center consolidates all P2 functionality */}
                  <Route path="/p2-control-center" component={P2ControlCenter} />
                  <Route path="/p2-forms" component={P2Forms} />
                  <Route path="/p2-traveler" component={P2TravelerPage} />
                  <Route path="/p2-traveler-viewer" component={P2TravelerViewer} />
                  <Route path="/p2/packing-slip/:id" component={P2PackingSlipViewer} />
                  <Route path="/p2/certificate/:id" component={P2CertificateViewer} />
                  <Route path="/p2/test-report/:id" component={P2TestReportViewer} />
                  <Route path="/p2-production-queue">{() => { window.location.href = '/p2-control-center'; return null; }}</Route>
                  <Route path="/cutting-table-queue">{() => { window.location.href = '/cutting-control-center'; return null; }}</Route>
                  <Route path="/manufacturing-queue" component={ManufacturingQueue} />
                  <Route path="/cutting-table-mfg-queue">{() => { window.location.href = '/cutting-control-center'; return null; }}</Route>
                  <Route path="/part-routing-management">{() => { window.location.href = '/p2-control-center'; return null; }}</Route>
                  
                  {/* Traveler System - AS9100 compliant production travelers */}
                  <Route path="/travelers" component={TravelerManagement} />
                  <Route path="/travelers/:id" component={TravelerExecution} />
                  <Route path="/travelers/:id/execute" component={TravelerExecution} />
                  
                  {/* Material Traceability System - AS9100 compliant material tracking */}
                  <Route path="/material-receiving" component={MaterialReceivingPage} />
                  <Route path="/material-inventory" component={MaterialInventoryPage} />
                  <Route
                    path="/master-document-register"
                    component={MasterDocumentRegister}
                  />
                  <Route
                    path="/waste-management-form"
                    component={WasteManagementForm}
                  />
                  <Route
                    path="/rfq-risk-assessment"
                    component={RFQRiskAssessment}
                  />
                  <Route
                    path="/purchase-review-checklist"
                    component={PurchaseReviewChecklist}
                  />
                  <Route
                    path="/purchase-review-submissions"
                    component={PurchaseReviewSubmissions}
                  />
                  <Route path="/p2-quote-form" component={P2QuoteForm} />
                  <Route path="/p2-quotes-list" component={P2QuotesList} />
                  <Route
                    path="/manufacturers-certificate"
                    component={ManufacturersCertificate}
                  />
                  <Route path="/task-tracker" component={TaskTracker} />
                  <Route path="/preproduction-checklists" component={PreproductionChecklistPage} />
                  <Route path="/projects" component={ProjectsPage} />
                  <Route path="/projects/:id" component={ProjectDetailPage} />
                  <Route
                    path="/kickback-tracking"
                    component={KickbackTracking}
                  />
                  <Route
                    path="/document-management"
                    component={DocumentManagement}
                  />
                  <Route
                    path="/routing-document-management"
                    component={RoutingDocumentManagement}
                  />
                  <Route
                    path="/document-intelligence"
                    component={DocumentIntelligence}
                  />

                  {/* Training Routes */}
                  <Route path="/training-control-center" component={TrainingControlCenter} />
                  <Route path="/training">{() => { window.location.href = '/training-control-center'; return null; }}</Route>
                  <Route path="/training-management">{() => { window.location.href = '/training-control-center'; return null; }}</Route>
                  <Route path="/training-matrix">{() => { window.location.href = '/training-control-center'; return null; }}</Route>
                  <Route path="/training-matrix-import">{() => { window.location.href = '/training-control-center'; return null; }}</Route>
                  <Route path="/training-matrix-manage">{() => { window.location.href = '/training-control-center'; return null; }}</Route>
                  <Route path="/import-certifications" component={ImportCertifications} />
                  <Route path="/certification-backlog" component={CertificationBacklog} />
                  <Route path="/p2-certifications">{() => { window.location.href = '/p2-control-center'; return null; }}</Route>
                  <Route path="/shutdown-training" component={ShutdownProceduresTraining} />
                  <Route path="/counterfeit-prevention-training" component={CounterfeitPreventionTraining} />
                  <Route path="/training/programs" component={ProgramsPage} />
                  <Route path="/training/programs/:id" component={ProgramBuilderPage} />
                  <Route path="/training/plans" component={TrainingPlans} />
                  <Route path="/training/trainer-dashboard" component={TrainerDashboard} />
                  <Route path="/training/my-training" component={TraineeTrainingPortal} />
                  <Route path="/training/work-instructions" component={WorkInstructionsPage} />
                  <Route path="/training/quizzes" component={QuizManagementPage} />
                  <Route path="/training/daily-quizzes" component={DailyQuizSelectionPage} />
                  <Route path="/training/assign" component={AssignProgramPage} />
                  <Route path="/training/sessions/:sessionId" component={SessionDailySheetPage} />
                  <Route path="/training/content-library" component={TrainingContentLibrary} />
                  <Route path="/training/:moduleId" component={TrainingModule} />

                  <Route path="/calendar" component={Calendar} />

                  {/* Queue Management Routes */}
                  <Route
                    path="/enhanced-layup-scheduler"
                    component={EnhancedLayupSchedulerPage}
                  />
                  <Route
                    path="/work-day-scheduler"
                    component={() => <WorkDayAwareScheduler />}
                  />
                  <Route
                    path="/simplified-layup-scheduler"
                    component={SimplifiedLayupScheduler}
                  />
                  <Route path="/p2-serialized-scheduler">{() => { window.location.href = '/p2-control-center'; return null; }}</Route>
                  <Route
                    path="/production-queue"
                    component={ProductionQueueManager}
                  />

                  {/* Nonconformance Tracking Routes */}
                  <Route
                    path="/nonconformance"
                    component={NonconformanceDashboard}
                  />
                  <Route
                    path="/nonconformance-report"
                    component={NonconformanceReport}
                  />

                  {/* RTS (Ready to Ship) Page */}
                  <Route path="/rts" component={RTSPage} />

                  {/* Reports */}
                  <Route
                    path="/ag-bottom-metal-report"
                    component={AGBottomMetalReport}
                  />
                  <Route path="/shipping-tracker" component={ShippingTracker} />
                  <Route path="/gateway-reports" component={GatewayReports} />
                  <Route path="/metrics-sandbox" component={MetricsSandbox} />

                  {/* Department Queue Management Routes */}
                  <Route
                    path="/department-queue/production-queue"
                    component={ProductionQueuePage}
                  />
                  <Route
                    path="/department-queue/layup-plugging"
                    component={LayupPluggingQueuePage}
                  />
                  <Route
                    path="/department-queue/barcode"
                    component={BarcodeQueuePage}
                  />
                  <Route
                    path="/department-queue/cnc"
                    component={CNCQueuePage}
                  />
                  <Route
                    path="/department-queue/finish"
                    component={FinishQueuePage}
                  />
                  <Route
                    path="/department-queue/gunsmith"
                    component={GunsimthQueuePage}
                  />
                  <Route
                    path="/department-queue/finish-qc"
                    component={FinishQCQueuePage}
                  />
                  <Route
                    path="/finish-qc-queue"
                    component={FinishQCQueuePage}
                  />
                  <Route
                    path="/department-queue/paint"
                    component={PaintQueuePage}
                  />
                  <Route
                    path="/department-queue/qc-shipping"
                    component={QCShippingQueuePage}
                  />
                  <Route
                    path="/oem-shipments"
                    component={OEMShipmentsPage}
                  />
                  <Route
                    path="/department-queue/shipping"
                    component={ShippingQueuePage}
                  />

                  {/* Shipping Label Route */}
                  <Route
                    path="/shipping/label/:orderId"
                    component={ShippingLabelPage}
                  />

                  {/* Sign Order Routes - Public routes for customers */}
                  <Route
                    path="/sign-order/:token"
                    component={SignOrderPage}
                  />
                  <Route
                    path="/sign-order"
                    component={SignOrderPage}
                  />
                  
                  {/* Fill and Sign Routes - Public routes for customers */}
                  <Route
                    path="/fill-and-sign/:publicSignatureId"
                    component={FillAndSignPage}
                  />

                    {/* Catch-all route for 404 */}
                    <Route component={NotFound} />
                  </Switch>
                </RouteGuard>
              </main>
            </div>
            <Toaster />
            <HotToaster />
            <WebSocketNotifications />
            <MessageNotificationPopup />
          </Router>
        </DeploymentAuthWrapper>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error('Error in App component:', error);
    return <div>Error loading application</div>;
  }
}

export default App;

import React from "react";
import { Switch, Route, Router } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
// import { CSVProvider } from "./contexts/CSVContext"; // Temporarily disabled
import Navigation from "./components/Navigation";
import OfflineIndicator from "./components/OfflineIndicator";
import NotFound from "./pages/not-found";
import Dashboard from "./pages/Dashboard";
import OrderManagement from "./pages/OrderManagement";
import DiscountManagement from "./pages/DiscountManagement";
import OrderEntry from "./pages/OrderEntry";
import OrderEntryTest from "./components/OrderEntryTest";
import OrdersList from "./pages/OrdersList";
import OrdersListSimple from "./pages/OrdersListSimple";
import FeatureManager from "./pages/FeatureManager";
import StockModels from "./pages/StockModels";
import DraftOrders from "./components/DraftOrders";
import AdminFormsPage from "./pages/AdminFormsPage";
import FormPage from "./pages/FormPage";
import ReportPage from "./pages/ReportPage";
import InventoryScannerPage from "./pages/InventoryScannerPage";
import InventoryDashboardPage from "./pages/InventoryDashboardPage";
import InventoryManagerPage from "./pages/InventoryManagerPage";
import InventoryReceivingPage from "./pages/InventoryReceivingPage";
import QCPage from "./pages/QCPage";
import MaintenancePage from "./pages/MaintenancePage";
import EmployeePortalPage from "./pages/EmployeePortalPage";
import TimeClockAdminPage from "./pages/TimeClockAdminPage";
import Module8TestPage from "./pages/Module8TestPage";
import APJournalPage from "./pages/APJournalPage";
import ARJournalPage from "./pages/ARJournalPage";
import COGSReportPage from "./pages/COGSReportPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import EnhancedFormsPage from "./pages/EnhancedFormsPage";
import EnhancedReportsPage from "./pages/EnhancedReportsPage";
import FormRendererPage from "./pages/FormRendererPage";
import DocumentationPageNew from "./pages/DocumentationPageNew";
import CustomerManagement from "./pages/CustomerManagement";
import PurchaseOrders from "./pages/PurchaseOrders";
import P2PurchaseOrders from "./pages/P2PurchaseOrders";
import ProductionTracking from "./pages/ProductionTracking";
import BarcodeScannerPage from "./pages/BarcodeScannerPage";
import LayupSchedulerPage from "./pages/LayupSchedulerPage";

import AllOrdersPage from "./pages/AllOrdersPage";
import AGTestDashboard from "./pages/AGTestDashboard";
import ADMINTestDashboard from "./pages/GLENNTestDashboard";
import STACITestDashboard from "./pages/STACITestDashboard";
import { BOMAdministration } from "./pages/BOMAdministration";
import AGBottomMetalReport from "./pages/AGBottomMetalReport";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeDetail from "./pages/EmployeeDetail";
import EmployeePortal from "./pages/EmployeePortal";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import P2Forms from "./pages/P2Forms";
import PurchaseReviewChecklist from "./pages/PurchaseReviewChecklist";
import PurchaseReviewSubmissions from "./pages/PurchaseReviewSubmissions";
import RFQRiskAssessment from "./pages/RFQRiskAssessment";
import ManufacturersCertificate from "./pages/ManufacturersCertificate";
import PackingSlip from "./pages/PackingSlip";
import TaskTracker from "./pages/TaskTracker";
import KickbackTracking from "./components/KickbackTracking";
import DocumentManagement from "./pages/DocumentManagement";
import PurchaseOrderItemsQueuePage from "./pages/PurchaseOrderItemsQueuePage";
import LayupPluggingQueuePage from "./pages/LayupPluggingQueuePage";
import BarcodeQueuePage from "./pages/BarcodeQueuePage";
import CNCQueuePage from "./pages/CNCQueuePage";
import FinishQCQueuePage from "./pages/FinishQCQueuePage";
import PaintQueuePage from "./pages/PaintQueuePage";
import QCShippingQueuePage from "./pages/QCShippingQueuePage";

import { Toaster as HotToaster } from 'react-hot-toast';
import RouteDebugger from './components/RouteDebugger';

function App() {
  console.log("App component is rendering...");
  console.log("Environment:", import.meta.env.MODE);
  console.log("Base URL:", import.meta.env.BASE_URL);

  // Add error boundary
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Global error caught:", event.error);
      setError(event.error);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      setError(new Error(event.reason));
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl w-full">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Application Error</h1>
          <p className="text-gray-700 mb-4">
            An error occurred while loading the application:
          </p>
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {error.message}
            {error.stack && "\n\nStack trace:\n" + error.stack}
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
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Navigation />
            <OfflineIndicator />
            <main className="container mx-auto px-4 py-8">
                  <Switch>
                  <Route path="/" component={Dashboard} />
                  <Route path="/order-management" component={OrderManagement} />
                  <Route path="/order-entry" component={OrderEntry} />
                  <Route path="/test-order-entry" component={OrderEntryTest} />
                  <Route path="/orders" component={OrdersList} />
                  <Route path="/orders-list" component={OrdersList} />
                  <Route path="/orders-simple" component={OrdersListSimple} />
                  <Route path="/all-orders" component={OrdersList} />
                  <Route path="/discounts" component={DiscountManagement} />
                  <Route path="/feature-manager" component={FeatureManager} />
                  <Route path="/stock-models" component={StockModels} />
                  <Route path="/draft-orders" component={DraftOrders} />
                  
                  {/* Customer Management Routes */}
                  <Route path="/customer-management" component={CustomerManagement} />
                  <Route path="/customers" component={CustomerManagement} />
                  
                  {/* Purchase Order Routes */}
                  <Route path="/purchase-orders" component={PurchaseOrders} />
                  <Route path="/p1-purchase-orders" component={PurchaseOrders} />
                  <Route path="/p2-purchase-orders" component={P2PurchaseOrders} />
                  
                  {/* Production and BOM Routes */}
                  <Route path="/production-tracking" component={ProductionTracking} />
                  <Route path="/bom-administration" component={BOMAdministration} />
                  
                  {/* Barcode and Scanner Routes */}
                  <Route path="/barcode-scanner" component={BarcodeScannerPage} />
                  
                  {/* Inventory Routes */}
                  <Route path="/inventory" component={InventoryManagerPage} />
                  <Route path="/inventory/scanner" component={InventoryScannerPage} />
                  <Route path="/inventory/dashboard" component={InventoryDashboardPage} />
                  <Route path="/inventory/manager" component={InventoryManagerPage} />
                  <Route path="/inventory/receiving" component={InventoryReceivingPage} />
                  
                  {/* QC and Maintenance Routes */}
                  <Route path="/qc" component={QCPage} />
                  <Route path="/maintenance" component={MaintenancePage} />
                  
                  {/* Employee Routes */}
                  <Route path="/employee-portal" component={EmployeePortalPage} />
                  <Route path="/employee-dashboard" component={EmployeeDashboard} />
                  <Route path="/employee-detail/:id" component={EmployeeDetail} />
                  <Route path="/employee-portal-new" component={EmployeePortal} />
                  <Route path="/time-clock-admin" component={TimeClockAdminPage} />
                  
                  {/* Auth Routes */}
                  <Route path="/login" component={LoginPage} />
                  
                  {/* Test Routes */}
                  <Route path="/module8-test" component={Module8TestPage} />
                  <Route path="/agtest" component={AGTestDashboard} />
                  <Route path="/agtest-dashboard" component={AGTestDashboard} />
                  <Route path="/admintest" component={ADMINTestDashboard} />
                  <Route path="/admintest-dashboard" component={ADMINTestDashboard} />
                  <Route path="/stacitest" component={STACITestDashboard} />
                  <Route path="/stacitest-dashboard" component={STACITestDashboard} />
                  
                  {/* Finance Routes */}
                  <Route path="/finance/ap-journal" component={APJournalPage} />
                  <Route path="/finance/ar-journal" component={ARJournalPage} />
                  <Route path="/finance/cogs-report" component={COGSReportPage} />
                  <Route path="/finance/dashboard" component={FinanceDashboardPage} />
                  
                  {/* Forms and Reports Routes */}
                  <Route path="/forms" component={AdminFormsPage} />
                  <Route path="/form/:id" component={FormPage} />
                  <Route path="/reports" component={ReportPage} />
                  <Route path="/form-renderer/:id" component={FormRendererPage} />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route path="/enhanced-reports" component={EnhancedReportsPage} />
                  <Route path="/documentation" component={DocumentationPageNew} />
                  
                  {/* P2 Forms Routes */}
                  <Route path="/p2-forms" component={P2Forms} />
                  <Route path="/purchase-review-checklist" component={PurchaseReviewChecklist} />
                  <Route path="/purchase-review-submissions" component={PurchaseReviewSubmissions} />
                  <Route path="/rfq-risk-assessment" component={RFQRiskAssessment} />
                  <Route path="/manufacturers-certificate" component={ManufacturersCertificate} />
                  <Route path="/packing-slip" component={PackingSlip} />
                  
                  {/* Task and Document Management */}
                  <Route path="/task-tracker" component={TaskTracker} />
                  <Route path="/kickback-tracking" component={KickbackTracking} />
                  <Route path="/document-management" component={DocumentManagement} />
                  
                  {/* Queue Management Routes */}
                  <Route path="/purchase-order-items-queue" component={PurchaseOrderItemsQueuePage} />
                  <Route path="/layup-scheduler" component={LayupSchedulerPage} />
                  
                  {/* Reports */}
                  <Route path="/ag-bottom-metal-report" component={AGBottomMetalReport} />

                  {/* Department Queue Management Routes */}
                  <Route path="/department-queue/layup-plugging" component={LayupPluggingQueuePage} />
                  <Route path="/department-queue/barcode" component={BarcodeQueuePage} />
                  <Route path="/department-queue/cnc" component={CNCQueuePage} />
                  <Route path="/department-queue/finish-qc" component={FinishQCQueuePage} />
                  <Route path="/department-queue/paint" component={PaintQueuePage} />
                  <Route path="/department-queue/qc-shipping" component={QCShippingQueuePage} />

                  {/* Catch-all route for 404 */}
                  <Route component={NotFound} />
                </Switch>
              </main>
          </div>
          <Toaster />
          <HotToaster />
          <RouteDebugger routes={[
            '/', '/order-management', '/order-entry', '/test-order-entry', '/orders', '/orders-list', 
            '/orders-simple', '/all-orders', '/discounts', '/feature-manager', '/stock-models', '/draft-orders',
            '/customer-management', '/customers', '/purchase-orders', '/p1-purchase-orders', '/p2-purchase-orders',
            '/production-tracking', '/bom-administration', '/barcode-scanner', '/inventory', '/inventory/scanner',
            '/inventory/dashboard', '/inventory/manager', '/inventory/receiving', '/qc', '/maintenance',
            '/employee-portal', '/employee-dashboard', '/employee-portal-new', '/time-clock-admin', '/login',
            '/module8-test', '/agtest', '/agtest-dashboard', '/admintest', '/admintest-dashboard', '/stacitest', '/stacitest-dashboard', '/finance/ap-journal', '/finance/ar-journal',
            '/finance/cogs-report', '/finance/dashboard', '/forms', '/reports', '/enhanced-forms', '/enhanced-reports',
            '/documentation', '/p2-forms', '/purchase-review-checklist', '/purchase-review-submissions',
            '/rfq-risk-assessment', '/manufacturers-certificate', '/packing-slip', '/task-tracker', '/kickback-tracking', '/document-management',
            '/purchase-order-items-queue', '/layup-scheduler', '/ag-bottom-metal-report', '/department-queue/layup-plugging',
            '/department-queue/barcode', '/department-queue/cnc', '/department-queue/finish-qc', '/department-queue/paint',
            '/department-queue/qc-shipping'
          ]} />
        </Router>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error("Error in App component:", error);
    return <div>Error loading application</div>;
  }
}

export default App;
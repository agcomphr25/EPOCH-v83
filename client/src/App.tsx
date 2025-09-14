import React from "react";
import { Switch, Route, Router, Link, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
// import { CSVProvider } from "./contexts/CSVContext"; // Temporarily disabled
import Navigation from "./components/Navigation";
import OfflineIndicator from "./components/OfflineIndicator";
import NotFound from "./pages/not-found";
import Dashboard from "./pages/Dashboard";
import OrderManagement from "./pages/OrderManagement";
import OrdersManagementPage from "./pages/OrdersManagementPage";
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
import EnhancedInventoryMRPPage from "./pages/EnhancedInventoryMRPPage";
import QCPage from "./pages/QCPage";
import MaintenancePage from "./pages/MaintenancePage";
import EmployeePortalPage from "./pages/EmployeePortalPage";
import TimeClockAdminPage from "./pages/TimeClockAdminPage";
import Module8TestPage from "./pages/Module8TestPage";
import CommunicationInboxPage from './pages/CommunicationInboxPage';
import APJournalPage from "./pages/APJournalPage";
import ARJournalPage from "./pages/ARJournalPage";
import COGSReportPage from "./pages/COGSReportPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import EnhancedFormsPage from './pages/EnhancedFormsPage';
import EnhancedReportsPage from './pages/EnhancedReportsPage';
import FormRendererPage from "./pages/FormRendererPage";
import DocumentationPageNew from "./pages/DocumentationPageNew";
import CustomerManagement from "./pages/CustomerManagement";
import PurchaseOrders from "./pages/PurchaseOrders";
import P2PurchaseOrders from "./pages/P2PurchaseOrders";
import POProductsPage from "./pages/POProductsPage";
import ProductionTracking from "./pages/ProductionTracking";
import BarcodeScannerPage from "./pages/BarcodeScannerPage";
import LayupSchedulerPage from "./pages/LayupSchedulerPage";
import P2LayupSchedulerPage from './pages/P2LayupSchedulerPage';
import AllOrdersPage from "./pages/AllOrdersPage";
import CancelledOrdersPage from "./pages/CancelledOrdersPage";
import AGTestDashboard from "./pages/AGTestDashboard";
import ADMINTestDashboard from "./pages/GLENNTestDashboard";
import JOHNLTestDashboard from "./pages/JOHNLTestDashboard";
import JENSTestDashboard from "./pages/JENSTestDashboard";
import STACIWTestDashboard from "./pages/STACIWTestDashboard";
import DARLENEBTestDashboard from "./pages/DARLENEBTestDashboard";
import TIMSTestDashboard from "./pages/TIMSTestDashboard";
import BRADWTestDashboard from "./pages/BRADWTestDashboard";
import FALEESHAHTestDashboard from "./pages/FALEESHAHTestDashboard";
import JOEYBTestDashboard from "./pages/JOEYBTestDashboard";
import OrderDepartmentTransfer from "./pages/OrderDepartmentTransfer";
import { BOMAdministration } from "./pages/BOMAdministration";
import RobustBOMAdministration from "./pages/RobustBOMAdministration";
import AGBottomMetalReport from "./pages/AGBottomMetalReport";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import EmployeeDetail from "./pages/EmployeeDetail";
import EmployeePortal from "./pages/EmployeePortal";
import UserManagement from "./pages/UserManagement";
import LoginPage from "./pages/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import P2Forms from '@/pages/P2Forms';
import WasteManagementForm from '@/pages/WasteManagementForm';
import TaskTracker from '@/pages/TaskTracker';
import KickbackTracking from '@/components/KickbackTracking';
import DocumentManagement from "./pages/DocumentManagement";
import PurchaseOrderItemsQueuePage from "./pages/PurchaseOrderItemsQueuePage";
import LayupPluggingQueuePage from "./pages/LayupPluggingQueuePage";
import BarcodeQueuePage from "./pages/BarcodeQueuePage";
import CNCQueuePage from "./pages/CNCQueuePage";
import FinishQCQueuePage from "./pages/FinishQCQueuePage";
import FinishQueuePage from "./pages/FinishQueuePage";
import FinishQCPage from "./pages/FinishQCPage";
import GunsimthQueuePage from "./pages/GunsimthQueuePage";
import PaintQueuePage from "./pages/PaintQueuePage";
import QCShippingQueuePage from "./pages/QCShippingQueuePage";
import ShippingQueuePage from "./pages/ShippingQueuePage";
import ShippingLabelPage from "./pages/ShippingLabelPage";
import ShippingManagement from "./pages/ShippingManagement";
import CuttingTableQueuePage from "./pages/CuttingTableQueuePage";
import CuttingTableDashboard from "./pages/CuttingTableDashboard";
import MaterialTracker from "./pages/MaterialTracker";
import DefrostSchedule from "./pages/DefrostSchedule";
import NonconformanceDashboard from "./components/NonconformanceDashboard";
import NonconformanceReport from "./components/NonconformanceReport";
import RFQRiskAssessment from "./pages/RFQRiskAssessment";
import ProductionQueueManager from "./components/ProductionQueueManager";
import EnhancedLayupSchedulerPage from "./pages/EnhancedLayupSchedulerPage";
import WorkDayAwareScheduler from "./components/WorkDayAwareScheduler";
import PurchaseReviewChecklist from "./pages/PurchaseReviewChecklist";
import PurchaseReviewSubmissions from "./pages/PurchaseReviewSubmissions";
import ManufacturersCertificate from "./pages/ManufacturersCertificate";
import PaymentManagement from "./pages/PaymentManagement";
import RefundRequest from "./pages/RefundRequest";
import RefundQueue from "./pages/RefundQueue";
import ProductionQueuePage from "./pages/ProductionQueuePage";
import P2ProductionQueuePage from "./pages/P2ProductionQueuePage";
import SimplifiedLayupScheduler from "./components/SimplifiedLayupScheduler";
import CustomerSatisfaction from "./pages/CustomerSatisfaction";
import VendorsPage from "./pages/VendorsPage";

import { Toaster as HotToaster } from 'react-hot-toast';
import DeploymentAuthWrapper from './components/DeploymentAuthWrapper';


// Component to conditionally render Navigation
function ConditionalNavigation() {
  const [location] = useLocation();
  const hideNavigation = location === '/darleneb-dashboard' || location === '/ag-dashboard' || location === '/staciw-dashboard';
  
  return hideNavigation ? null : <Navigation />;
}

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
        <DeploymentAuthWrapper>
          <Router>
            <div className="min-h-screen bg-gray-50">
              <ConditionalNavigation />
              <OfflineIndicator />
              <main className="container mx-auto px-4 py-8">
                  <Switch>
                  <Route path="/" component={Dashboard} />
                  <Route path="/order-management" component={OrderManagement} />
                  <Route path="/orders-management" component={OrdersManagementPage} />
                  <Route path="/order-entry" component={OrderEntry} />
                  <Route path="/test-order-entry" component={OrderEntryTest} />
                  <Route path="/orders" component={OrdersList} />
                  <Route path="/orders-list" component={OrdersList} />
                  <Route path="/orders-simple" component={OrdersListSimple} />
                  <Route path="/all-orders" component={OrdersList} />
                  <Route path="/cancelled-orders" component={CancelledOrdersPage} />
                  <Route path="/discounts" component={DiscountManagement} />
                  <Route path="/feature-manager" component={FeatureManager} />
                  <Route path="/stock-models" component={StockModels} />
                  <Route path="/draft-orders" component={DraftOrders} />

                  {/* Customer Management Routes */}
                  <Route path="/customer-management" component={CustomerManagement} />
                  <Route path="/customers" component={CustomerManagement} />
                  <Route path="/customer-satisfaction" component={CustomerSatisfaction} />

                  {/* Vendor Management Routes */}
                  <Route path="/vendors" component={VendorsPage} />

                  {/* Purchase Order Routes */}
                  <Route path="/purchase-orders" component={PurchaseOrders} />
                  <Route path="/p1-purchase-orders" component={PurchaseOrders} />
                  <Route path="/p2-purchase-orders" component={P2PurchaseOrders} />
                  <Route path="/po-products" component={POProductsPage} />

                  {/* Production and BOM Routes */}
                  <Route path="/production-tracking" component={ProductionTracking} />
                  <Route path="/bom-administration" component={BOMAdministration} />
                  <Route path="/robust-bom-administration" component={RobustBOMAdministration} />

                  {/* Barcode and Scanner Routes */}
                  <Route path="/barcode-scanner" component={BarcodeScannerPage} />

                  {/* Inventory Routes */}
                  <Route path="/inventory" component={InventoryManagerPage} />
                  <Route path="/inventory/scanner" component={InventoryScannerPage} />
                  <Route path="/inventory/dashboard" component={InventoryDashboardPage} />
                  <Route path="/inventory/manager" component={InventoryManagerPage} />
                  <Route path="/inventory/receiving" component={InventoryReceivingPage} />
                  <Route path="/inventory/enhanced-mrp" component={EnhancedInventoryMRPPage} />

                  {/* QC and Maintenance Routes */}
                  <Route path="/qc" component={QCPage} />
                  <Route path="/maintenance" component={MaintenancePage} />

                  {/* Employee Routes */}
                  <Route path="/employee" component={EmployeeDashboard} />
                  <Route path="/user-management" component={UserManagement} />
                  <Route path="/employee-portal" component={EmployeePortalPage} />
                  <Route path="/employee-dashboard" component={EmployeeDashboard} />
                  <Route path="/employee-detail/:id" component={EmployeeDetail} />
                  <Route path="/employee-portal-new" component={EmployeePortal} />
                  <Route path="/time-clock-admin" component={TimeClockAdminPage} />

                  {/* Auth Routes */}
                  <Route path="/login" component={LoginPage} />

                  {/* User Dashboard Routes */}
                  <Route path="/ag-dashboard" component={AGTestDashboard} />
                  <Route path="/admin-dashboard" component={ADMINTestDashboard} />
                  <Route path="/johnl-dashboard" component={JOHNLTestDashboard} />
                  <Route path="/jens-dashboard" component={JENSTestDashboard} />
                  <Route path="/staciw-dashboard" component={STACIWTestDashboard} />
                  <Route path="/darleneb-dashboard" component={DARLENEBTestDashboard} />
                  <Route path="/tims-dashboard" component={TIMSTestDashboard} />
                  <Route path="/bradw-dashboard" component={BRADWTestDashboard} />
                  <Route path="/faleeshah-dashboard" component={FALEESHAHTestDashboard} />
                  <Route path="/joeyb-dashboard" component={JOEYBTestDashboard} />

                  {/* Test Routes */}
                  <Route path="/module8-test" component={Module8TestPage} />
                  <Route path="/order-department-transfer" component={OrderDepartmentTransfer} />
                  <Route path="/communications/inbox" component={CommunicationInboxPage} />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route path="/enhanced-reports" component={EnhancedReportsPage} />

                  {/* Finance Routes */}
                  <Route path="/finance/ap-journal" component={APJournalPage} />
                  <Route path="/finance/ar-journal" component={ARJournalPage} />
                  <Route path="/finance/cogs-report" component={COGSReportPage} />
                  <Route path="/finance/dashboard" component={FinanceDashboardPage} />

                  {/* Payment Processing Routes */}
                  <Route path="/payment-management" component={PaymentManagement} />

                  {/* Refund Management Routes */}
                  <Route path="/refund-request" component={RefundRequest} />
                  <Route path="/refund-queue" component={RefundQueue} />

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
                  <Route path="/waste-management-form" component={WasteManagementForm} />
                  <Route path="/rfq-risk-assessment" component={RFQRiskAssessment} />
                  <Route path="/purchase-review-checklist" component={PurchaseReviewChecklist} />
                  <Route path="/purchase-review-submissions" component={PurchaseReviewSubmissions} />
                  <Route path="/manufacturers-certificate" component={ManufacturersCertificate} />
                  <Route path="/task-tracker" component={TaskTracker} />
                  <Route path="/kickback-tracking" component={KickbackTracking} />
                  <Route path="/document-management" component={DocumentManagement} />

                  {/* Queue Management Routes */}
                  <Route path="/purchase-order-items-queue" component={PurchaseOrderItemsQueuePage} />
                  <Route path="/layup-scheduler" component={LayupSchedulerPage} />
                  <Route path="/enhanced-layup-scheduler" component={EnhancedLayupSchedulerPage} />
                  <Route path="/work-day-scheduler" component={() => <WorkDayAwareScheduler />} />
                  <Route path="/simplified-layup-scheduler" component={SimplifiedLayupScheduler} />
                  <Route path="/p2-layup-scheduler" component={P2LayupSchedulerPage} />
                  <Route path="/production-queue" component={ProductionQueueManager} />

                  {/* Nonconformance Tracking Routes */}
                  <Route path="/nonconformance" component={NonconformanceDashboard} />
                  <Route path="/nonconformance-report" component={NonconformanceReport} />

                  {/* Reports */}
                  <Route path="/ag-bottom-metal-report" component={AGBottomMetalReport} />

                  {/* Department Queue Management Routes */}
                  <Route path="/department-queue/production-queue" component={ProductionQueuePage} />
                  
                  {/* Cutting Table Management Routes */}
                  <Route path="/cutting-table" component={CuttingTableDashboard} />
                  <Route path="/cutting-table/dashboard" component={CuttingTableDashboard} />
                  <Route path="/cutting-table/p1-packets" component={CuttingTableQueuePage} />
                  <Route path="/department-queue/cutting-table" component={CuttingTableQueuePage} />
                  <Route path="/cutting-table/material-tracker" component={MaterialTracker} />
                  <Route path="/cutting-table/defrost-schedule" component={DefrostSchedule} />
                  
                  <Route path="/department-queue/layup-plugging" component={LayupPluggingQueuePage} />
                  <Route path="/department-queue/barcode" component={BarcodeQueuePage} />
                  <Route path="/department-queue/cnc" component={CNCQueuePage} />
                  <Route path="/department-queue/finish" component={FinishQueuePage} />
                  <Route path="/department-queue/gunsmith" component={GunsimthQueuePage} />
                  <Route path="/department-queue/finish-qc" component={FinishQCPage} />
                  <Route path="/department-queue/paint" component={PaintQueuePage} />
                  <Route path="/department-queue/qc-shipping" component={QCShippingQueuePage} />
                  <Route path="/department-queue/shipping" component={ShippingQueuePage} />

                  {/* P2 Department Manager Routes */}
                  <Route path="/p2-department-queue/production-queue" component={P2ProductionQueuePage} />
                  
                  {/* Shipping Label Route */}
                  <Route path="/shipping/label/:orderId" component={ShippingLabelPage} />

                  {/* Shipping Management Routes */}
                  <Route path="/shipping-management" component={ShippingManagement} />


                  {/* Catch-all route for 404 */}
                  <Route component={NotFound} />
                </Switch>
              </main>
          </div>
          <Toaster />
          <HotToaster />
        </Router>
        </DeploymentAuthWrapper>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error("Error in App component:", error);
    return <div>Error loading application</div>;
  }
}

export default App;
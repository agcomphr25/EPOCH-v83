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
import DocumentManagement from "./pages/DocumentManagement";

import { Toaster as HotToaster } from 'react-hot-toast';

function App() {
  console.log("App component is rendering...");
  
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
                  <Route path="/inventory/scanner" component={InventoryScannerPage} />
                  <Route path="/inventory/dashboard" component={InventoryDashboardPage} />
                  <Route path="/inventory/manager" component={InventoryManagerPage} />
                  <Route path="/inventory/receiving" component={InventoryReceivingPage} />
                  <Route path="/qc" component={QCPage} />
                  <Route path="/maintenance" component={MaintenancePage} />
                  <Route path="/employee-portal" component={EmployeePortalPage} />
                  <Route path="/time-clock-admin" component={TimeClockAdminPage} />
                  <Route path="/module8-test" component={Module8TestPage} />
                  <Route path="/finance/ap-journal" component={APJournalPage} />
                  <Route path="/finance/ar-journal" component={ARJournalPage} />
                  <Route path="/finance/cogs-report" component={COGSReportPage} />
                  <Route path="/finance/dashboard" component={FinanceDashboardPage} />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route path="/enhanced-reports" component={EnhancedReportsPage} />
                  <Route path="/p2-forms" component={P2Forms} />
                  <Route path="/purchase-review-checklist" component={PurchaseReviewChecklist} />
                  <Route path="/purchase-review-submissions" component={PurchaseReviewSubmissions} />
                  <Route path="/rfq-risk-assessment" component={RFQRiskAssessment} />
                  <Route path="/manufacturers-certificate" component={ManufacturersCertificate} />
                  <Route path="/packing-slip" component={PackingSlip} />
                  <Route path="/task-tracker" component={TaskTracker} />
                  <Route path="/document-management" component={DocumentManagement} />

                  <Route path="/ag-bottom-metal-report" component={AGBottomMetalReport} />
                  <Route path="/forms/render/:formId" component={FormRendererPage} />
                  <Route path="/documentation" component={DocumentationPageNew} />
                  <Route path="/customers" component={CustomerManagement} />
                  <Route path="/purchase-orders" component={PurchaseOrders} />
                  <Route path="/p2-purchase-orders" component={P2PurchaseOrders} />
                  <Route path="/production-tracking" component={ProductionTracking} />
                  <Route path="/bom-administration" component={BOMAdministration} />
                  <Route path="/barcode-scanner" component={BarcodeScannerPage} />
                  <Route path="/layup-scheduler" component={LayupSchedulerPage} />
                  <Route path="/agtest-dashboard" component={AGTestDashboard} />
                  <Route path="/admintest-dashboard" component={ADMINTestDashboard} />
                  <Route path="/stacitest-dashboard" component={STACITestDashboard} />
                  
                  {/* Employee Management Routes */}
                  <Route path="/login" component={LoginPage} />
                  <Route path="/employee">
                    {() => (
                      <ProtectedRoute requiredRole={['ADMIN', 'HR Manager']}>
                        <EmployeeDashboard />
                      </ProtectedRoute>
                    )}
                  </Route>
                  <Route path="/employee/:id">
                    {(params) => (
                      <ProtectedRoute requiredRole={['ADMIN', 'HR Manager']}>
                        <EmployeeDetail />
                      </ProtectedRoute>
                    )}
                  </Route>
                  <Route path="/employee-portal/:portalId" component={EmployeePortal} />
                  
                  <Route component={NotFound} />
                </Switch>
              </main>
          </div>
          <Toaster />
          <HotToaster />
        </Router>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error("Error in App component:", error);
    return <div>Error loading application</div>;
  }
}

export default App;
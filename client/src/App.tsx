import React from "react";
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CSVProvider } from "./contexts/CSVContext";
import Navigation from "./components/Navigation";
import OfflineIndicator from "./components/OfflineIndicator";
import NotFound from "./pages/not-found";
import SimpleTest from "./pages/SimpleTest";
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
import { Toaster as HotToaster } from 'react-hot-toast';


function App() {
  console.log("App component is rendering...");
  
  try {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <CSVProvider>
            <div className="min-h-screen bg-background">
              <Navigation />
              <OfflineIndicator />
              <main>
                <Switch>
                  <Route path="/" component={SimpleTest} />
                  <Route path="/order-management" component={OrderManagement} />
                  <Route path="/discounts" component={DiscountManagement} />
                  <Route path="/order-entry" component={OrderEntry} />
                  <Route path="/order-entry-test" component={OrderEntryTest} />
                  <Route path="/orders-list" component={OrdersList} />
                  <Route path="/orders" component={OrdersList} />
                  <Route path="/all-orders" component={OrdersList} />
                  <Route path="/draft-orders" component={DraftOrders} />
                  <Route path="/feature-manager" component={FeatureManager} />
                  <Route path="/stock-models" component={StockModels} />
                  <Route path="/admin/forms" component={AdminFormsPage} />
                  <Route path="/forms/:formId" component={FormPage} />
                  <Route path="/admin/reports" component={ReportPage} />
                  <Route path="/enhanced-forms" component={EnhancedFormsPage} />
                  <Route path="/enhanced-reports" component={EnhancedReportsPage} />
                  <Route path="/forms/render/:formId" component={FormRendererPage} />
                  <Route path="/inventory/scanner" component={InventoryScannerPage} />
                  <Route path="/inventory/dashboard" component={InventoryDashboardPage} />
                  <Route path="/inventory/manager" component={InventoryManagerPage} />
                  <Route path="/qc" component={QCPage} />
                  <Route path="/maintenance" component={MaintenancePage} />
                  <Route path="/employee-portal" component={EmployeePortalPage} />
                  <Route path="/time-clock-admin" component={TimeClockAdminPage} />
                  <Route path="/module8-test" component={Module8TestPage} />
                  <Route path="/finance/ap" component={APJournalPage} />
                  <Route path="/finance/ar" component={ARJournalPage} />
                  <Route path="/finance/cogs" component={COGSReportPage} />
                  <Route path="/finance/dashboard" component={FinanceDashboardPage} />
                  <Route path="/documentation" component={DocumentationPageNew} />

                  <Route component={NotFound} />
                </Switch>
              </main>
            </div>
            <Toaster />
            <HotToaster position="top-right" />
          </CSVProvider>
        </TooltipProvider>
      </QueryClientProvider>
    );
  } catch (error) {
    console.error("Error in App component:", error);
    return <div>Error loading application</div>;
  }
}

export default App;
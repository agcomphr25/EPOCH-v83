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
      <div style={{ padding: '20px', backgroundColor: '#f0f0f0', border: '2px solid #333' }}>
        <h1 style={{ color: '#333' }}>EPOCH v8 - Manufacturing ERP</h1>
        <h2 style={{ color: '#666' }}>Application is Working!</h2>
        <p>React is now rendering properly.</p>
        <div style={{ marginTop: '20px' }}>
          <h3>Available Features:</h3>
          <ul>
            <li>Order Management</li>
            <li>Order Entry</li>
            <li>Discount Management</li>
            <li>Feature Manager</li>
          </ul>
        </div>
      </div>
    );
  } catch (error) {
    console.error("Error in App component:", error);
    return <div>Error loading application</div>;
  }
}

export default App;
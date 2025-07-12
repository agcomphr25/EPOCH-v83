import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CSVProvider } from "./contexts/CSVContext";
import Navigation from "./components/Navigation";
import NotFound from "./pages/not-found";
import OrderManagement from "./pages/OrderManagement";
import DiscountManagement from "./pages/DiscountManagement";
import OrderEntry from "./pages/OrderEntry";
import FeatureManager from "./pages/FeatureManager";
import StockModels from "./pages/StockModels";
import DraftOrders from "./components/DraftOrders";
import AdminFormsPage from "./pages/AdminFormsPage";
import FormPage from "./pages/FormPage";
import ReportPage from "./pages/ReportPage";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CSVProvider>
          <div className="min-h-screen bg-background">
            <Navigation />
            <main>
              <Switch>
                <Route path="/" component={OrderManagement} />
                <Route path="/discounts" component={DiscountManagement} />
                <Route path="/order-entry" component={OrderEntry} />
                <Route path="/draft-orders" component={DraftOrders} />
                <Route path="/feature-manager" component={FeatureManager} />
                <Route path="/stock-models" component={StockModels} />
                <Route path="/admin/forms" component={AdminFormsPage} />
                <Route path="/forms/:formId" component={FormPage} />
                <Route path="/admin/reports" component={ReportPage} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
          <Toaster />
        </CSVProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
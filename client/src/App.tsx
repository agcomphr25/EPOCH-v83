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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CSVProvider>
          <Switch>
            <Route path="/" component={OrderManagement} />
            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </CSVProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
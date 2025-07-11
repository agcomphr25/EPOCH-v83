import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { CSVProvider } from "./contexts/CSVContext";
import NotFound from "./pages/not-found";
import OrderManagement from "./pages/OrderManagement";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CSVProvider>
        <Switch>
          <Route path="/" component={OrderManagement} />
          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </CSVProvider>
    </QueryClientProvider>
  );
}

export default App;
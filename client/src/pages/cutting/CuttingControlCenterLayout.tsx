import { useEffect } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { 
  Package, 
  Calendar, 
  Scissors,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import CuttingBomAssignment from "./CuttingBomAssignment";
import CuttingWeeklySchedule from "./CuttingWeeklySchedule";
import CuttingOperatorDashboard from "./CuttingOperatorDashboard";

const tabs = [
  { 
    id: "bom", 
    label: "BOM Assignment", 
    path: "/cutting-control-center/bom",
    icon: Package,
    description: "Link packets to BOMs with parts and ply schedules"
  },
  { 
    id: "schedule", 
    label: "Weekly Scheduling", 
    path: "/cutting-control-center/schedule",
    icon: Calendar,
    description: "View and manage weekly cutting queue"
  },
  { 
    id: "dashboard", 
    label: "Operator Dashboard", 
    path: "/cutting-control-center/dashboard",
    icon: Scissors,
    description: "Cutting workflow and label printing"
  },
];

export default function CuttingControlCenterLayout() {
  const [location, setLocation] = useLocation();
  
  const currentTab = tabs.find(tab => location.startsWith(tab.path))?.id || "bom";
  
  const handleTabChange = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setLocation(tab.path);
    }
  };

  useEffect(() => {
    if (location === "/cutting-control-center" || location === "/cutting-control-center/") {
      setLocation("/cutting-control-center/bom");
    }
  }, [location, setLocation]);

  if (location === "/cutting-control-center" || location === "/cutting-control-center/") {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="gap-2" data-testid="button-back-home">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-main-title">
                  <Scissors className="h-6 w-6" />
                  Cutting Table Control Center
                </h1>
                <p className="text-sm text-muted-foreground">
                  Packet BOM management, scheduling, and operator workflow
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-4">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2"
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mb-4">
          {tabs.map((tab) => (
            location.startsWith(tab.path) && (
              <Card key={tab.id} className="p-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <tab.icon className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="font-semibold">{tab.label}</h2>
                    <p className="text-sm text-muted-foreground">{tab.description}</p>
                  </div>
                </div>
              </Card>
            )
          ))}
        </div>

        <Switch>
          <Route path="/cutting-control-center/bom">
            <CuttingBomAssignment />
          </Route>
          <Route path="/cutting-control-center/schedule">
            <CuttingWeeklySchedule />
          </Route>
          <Route path="/cutting-control-center/dashboard">
            <CuttingOperatorDashboard />
          </Route>
          <Route>
            <CuttingBomAssignment />
          </Route>
        </Switch>
      </div>
    </div>
  );
}

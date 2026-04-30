import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { 
  Package, 
  Calendar, 
  Scissors,
  ArrowLeft,
  FileText,
  ClipboardCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import CuttingBomAssignment from "./CuttingBomAssignment";
import CuttingWeeklySchedule from "./CuttingWeeklySchedule";
import CuttingOperatorDashboard from "./CuttingOperatorDashboard";
import CuttingDocuments from "./CuttingDocuments";
import CuttingInventoryAudit from "./CuttingInventoryAudit";

type AuditSettings = {
  frequency: string;
  nextAuditDate: string | null;
  lastAuditDate: string | null;
};

function useAuditStatus(): "overdue" | "due_soon" | "ok" | "none" {
  const { data: settings } = useQuery<AuditSettings | null>({
    queryKey: ["/api/cutting-table/inventory-audit/settings"],
    staleTime: 60_000,
  });
  if (!settings || !settings.nextAuditDate) return "none";
  const next = new Date(settings.nextAuditDate);
  const now = new Date();
  const diff = next.getTime() - now.getTime();
  if (diff <= 0) return "overdue";
  if (diff <= 24 * 60 * 60 * 1000) return "due_soon";
  return "ok";
}

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
  {
    id: "documents",
    label: "Documents",
    path: "/cutting-control-center/documents",
    icon: FileText,
    description: "Ply charts, work instructions, and reference files",
  },
  {
    id: "inventory",
    label: "Inventory",
    path: "/cutting-control-center/inventory",
    icon: ClipboardCheck,
    description: "Packet audit counts and on-hand schedule",
  },
];

export default function CuttingControlCenterLayout() {
  const [location, setLocation] = useLocation();
  const auditStatus = useAuditStatus();
  
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
          <TabsList className="grid w-full grid-cols-5 mb-6">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 relative"
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === "inventory" && auditStatus === "overdue" && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                  </span>
                )}
                {tab.id === "inventory" && auditStatus === "due_soon" && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                  </span>
                )}
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
                  <div className="flex-1">
                    <h2 className="font-semibold flex items-center gap-2">
                      {tab.label}
                      {tab.id === "inventory" && auditStatus === "overdue" && (
                        <span className="flex items-center gap-1 text-xs font-normal text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" />Audit overdue
                        </span>
                      )}
                      {tab.id === "inventory" && auditStatus === "due_soon" && (
                        <span className="flex items-center gap-1 text-xs font-normal text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />Audit due within 24 hours
                        </span>
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground">{tab.description}</p>
                  </div>
                </div>
              </Card>
            )
          ))}
        </div>

        {currentTab === "bom" && <CuttingBomAssignment />}
        {currentTab === "schedule" && <CuttingWeeklySchedule />}
        {currentTab === "dashboard" && <CuttingOperatorDashboard />}
        {currentTab === "documents" && <CuttingDocuments />}
        {currentTab === "inventory" && <CuttingInventoryAudit />}
      </div>
    </div>
  );
}

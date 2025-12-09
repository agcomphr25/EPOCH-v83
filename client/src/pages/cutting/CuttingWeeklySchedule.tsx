import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar,
  ChevronLeft,
  ChevronRight,
  Package,
  Factory,
  Scissors,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Filter,
  ArrowRight,
  Box,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WeeklyCuttingQueueItem = {
  id: string;
  orderId: string;
  stockModel: string;
  source: 'P1' | 'P1_PO' | 'P2';
  orderType: 'regular' | 'oem' | 'p2_po';
  materialType: 'carbon_fiber' | 'fiberglass' | 'unknown';
  scheduledDate: string;
  dueDate: string;
  customer: string;
  priority: number;
  packetsNeeded: number;
  usesInventory: boolean;
  requiresNewCut: boolean;
  bomId?: string;
};

type WeeklySummary = {
  carbon_fiber: { regular: number; oem: number; p2: number; total: number };
  fiberglass: { regular: number; oem: number; p2: number; total: number };
  weekStart: string;
  weekEnd: string;
};

type PacketBOM = {
  id: string;
  partNumber: string;
  packetType: string;
  yieldPerCut: number;
  squareMetersPerCut: number;
};

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function formatWeekRange(startDate: string): string {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

export default function CuttingWeeklySchedule() {
  const { toast } = useToast();
  
  const [currentWeek, setCurrentWeek] = useState(getMondayOfWeek(new Date()));
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [showAllPending, setShowAllPending] = useState(true);

  const { data: weeklyQueueData, isLoading, refetch } = useQuery<{
    items: WeeklyCuttingQueueItem[];
    summary: WeeklySummary;
    totalItems: number;
  }>({
    queryKey: ['/api/cutting-table/weekly-cutting-queue', currentWeek, showAllPending],
    queryFn: async () => {
      const params = new URLSearchParams({
        weekStart: currentWeek,
        showAll: showAllPending.toString(),
      });
      const res = await fetch(`/api/cutting-table/weekly-cutting-queue?${params}`);
      if (!res.ok) throw new Error('Failed to fetch queue');
      return res.json();
    },
  });

  const { data: packetBOMs = [] } = useQuery<PacketBOM[]>({
    queryKey: ['/api/cutting-table/packet-boms'],
  });

  const { data: stockLevels = { carbon_fiber: 0, fiberglass: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/stock-levels'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/stock-levels');
      if (!res.ok) return { carbon_fiber: 0, fiberglass: 0 };
      return res.json();
    },
  });

  const scheduleItemMutation = useMutation({
    mutationFn: async (data: { orderId: string; bomId: string; quantity: number; priority: number; dueDate: string; source: string; materialType: string; notes?: string }) => {
      return apiRequest('/api/cutting-table/schedule-to-cutting', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-cutting-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      toast({ title: "Scheduled", description: "Item added to cutting queue." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to schedule item.", variant: "destructive" });
    },
  });

  const filteredItems = useMemo(() => {
    if (!weeklyQueueData?.items) return [];
    return weeklyQueueData.items.filter(item => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (materialFilter !== "all" && item.materialType !== materialFilter) return false;
      return true;
    });
  }, [weeklyQueueData?.items, sourceFilter, materialFilter]);

  const aggregatedDemand = useMemo(() => {
    if (!weeklyQueueData?.items) return { cf_regular: 0, cf_oem: 0, cf_total: 0, fg_regular: 0, fg_oem: 0, fg_total: 0 };
    
    const items = weeklyQueueData.items;
    return {
      cf_regular: items.filter(i => i.materialType === 'carbon_fiber' && i.usesInventory).reduce((sum, i) => sum + i.packetsNeeded, 0),
      cf_oem: items.filter(i => i.materialType === 'carbon_fiber' && i.requiresNewCut).reduce((sum, i) => sum + i.packetsNeeded, 0),
      cf_total: items.filter(i => i.materialType === 'carbon_fiber').reduce((sum, i) => sum + i.packetsNeeded, 0),
      fg_regular: items.filter(i => i.materialType === 'fiberglass' && i.usesInventory).reduce((sum, i) => sum + i.packetsNeeded, 0),
      fg_oem: items.filter(i => i.materialType === 'fiberglass' && i.requiresNewCut).reduce((sum, i) => sum + i.packetsNeeded, 0),
      fg_total: items.filter(i => i.materialType === 'fiberglass').reduce((sum, i) => sum + i.packetsNeeded, 0),
    };
  }, [weeklyQueueData?.items]);

  const navigateWeek = (direction: number) => {
    const current = new Date(currentWeek);
    current.setDate(current.getDate() + (direction * 7));
    setCurrentWeek(current.toISOString().split('T')[0]);
  };

  const handleScheduleItem = (item: WeeklyCuttingQueueItem) => {
    // First check if item already has a bomId
    let bomId = item.bomId;
    
    // If no bomId, try to find a matching BOM by material type or stock model
    if (!bomId) {
      const matchingBom = packetBOMs.find(b => 
        b.packetType?.toLowerCase().includes(item.materialType === 'carbon_fiber' ? 'cf' : 'fg') ||
        b.packetType?.toLowerCase().includes(item.stockModel?.toLowerCase() || '') ||
        b.partNumber?.toLowerCase().includes(item.stockModel?.toLowerCase() || '')
      );
      bomId = matchingBom?.id;
    }
    
    // For P2 items, allow scheduling without a BOM (will use generic packet workflow)
    if (!bomId && item.source !== 'P2') {
      toast({ title: "No BOM Found", description: "Please create a packet BOM for this material type first.", variant: "destructive" });
      return;
    }

    scheduleItemMutation.mutate({
      orderId: item.orderId,
      bomId: bomId || 'generic-p2-packet',
      quantity: item.packetsNeeded,
      priority: item.priority,
      dueDate: item.dueDate,
      source: item.source,
      materialType: item.materialType,
      notes: item.source === 'P2' ? `P2 PO Item: ${item.stockModel}` : undefined,
    });
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'P1':
        return <Badge variant="default" className="bg-blue-500">P1</Badge>;
      case 'P1_PO':
        return <Badge variant="default" className="bg-purple-500">P1 PO</Badge>;
      case 'P2':
        return <Badge variant="default" className="bg-green-500">P2</Badge>;
      default:
        return <Badge variant="outline">{source}</Badge>;
    }
  };

  const getMaterialBadge = (materialType: string) => {
    if (materialType === 'carbon_fiber') {
      return <Badge variant="outline" className="bg-gray-900 text-white border-gray-700">Carbon Fiber</Badge>;
    }
    return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">Fiberglass</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">
            {showAllPending ? "Cutting Task List" : "Weekly Schedule"}
          </h2>
          <p className="text-muted-foreground">
            {showAllPending 
              ? "All pending orders that need packets scheduled for cutting" 
              : "Aggregated demand from P1, P1 PO, and P2 production queues"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 mr-4">
            <Button 
              variant={showAllPending ? "default" : "outline"} 
              size="sm"
              onClick={() => setShowAllPending(true)}
              data-testid="button-show-all"
            >
              All Pending
            </Button>
            <Button 
              variant={!showAllPending ? "default" : "outline"} 
              size="sm"
              onClick={() => setShowAllPending(false)}
              data-testid="button-show-week"
            >
              This Week Only
            </Button>
          </div>
          {!showAllPending && (
            <>
              <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)} data-testid="button-prev-week">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md min-w-[200px] justify-center">
                <Calendar className="h-4 w-4" />
                <span className="font-medium">{formatWeekRange(currentWeek)}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => navigateWeek(1)} data-testid="button-next-week">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4 text-gray-600" />
              Carbon Fiber Demand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedDemand.cf_total}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {aggregatedDemand.cf_regular} from inventory • {aggregatedDemand.cf_oem} new cuts
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">On-hand:</span>
              <span className={cn("font-medium", stockLevels.carbon_fiber >= aggregatedDemand.cf_regular ? "text-green-600" : "text-red-600")}>
                {stockLevels.carbon_fiber}
              </span>
              {stockLevels.carbon_fiber < aggregatedDemand.cf_regular && (
                <AlertCircle className="h-4 w-4 text-red-500 ml-1" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4 text-amber-600" />
              Fiberglass Demand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedDemand.fg_total}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {aggregatedDemand.fg_regular} from inventory • {aggregatedDemand.fg_oem} new cuts
            </div>
            <div className="mt-2 flex items-center gap-1 text-sm">
              <span className="text-muted-foreground">On-hand:</span>
              <span className={cn("font-medium", stockLevels.fiberglass >= aggregatedDemand.fg_regular ? "text-green-600" : "text-red-600")}>
                {stockLevels.fiberglass}
              </span>
              {stockLevels.fiberglass < aggregatedDemand.fg_regular && (
                <AlertCircle className="h-4 w-4 text-red-500 ml-1" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Factory className="h-4 w-4" />
              New Cuts Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aggregatedDemand.cf_oem + aggregatedDemand.fg_oem}</div>
            <div className="text-xs text-muted-foreground mt-1">
              P1 PO and P2 orders requiring cutting
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Total Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weeklyQueueData?.totalItems || 0}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Across all production sources
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scissors className="h-5 w-5" />
                Weekly Cutting Queue
              </CardTitle>
              <CardDescription>
                Orders requiring packet allocation for the week of {formatWeekRange(currentWeek)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-32" data-testid="select-source-filter">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="P1">P1</SelectItem>
                  <SelectItem value="P1_PO">P1 PO</SelectItem>
                  <SelectItem value="P2">P2</SelectItem>
                </SelectContent>
              </Select>
              <Select value={materialFilter} onValueChange={setMaterialFilter}>
                <SelectTrigger className="w-40" data-testid="select-material-filter">
                  <SelectValue placeholder="Material" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Materials</SelectItem>
                  <SelectItem value="carbon_fiber">Carbon Fiber</SelectItem>
                  <SelectItem value="fiberglass">Fiberglass</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading queue...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in the cutting queue for this week.
            </div>
          ) : (
            <Tabs defaultValue="needs-cut" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="needs-cut" data-testid="tab-needs-cut">
                  Requires New Cut ({filteredItems.filter(i => i.requiresNewCut).length})
                </TabsTrigger>
                <TabsTrigger value="from-inventory" data-testid="tab-from-inventory">
                  Uses Inventory ({filteredItems.filter(i => i.usesInventory).length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="needs-cut">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Stock Model</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Packets</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.filter(i => i.requiresNewCut).map((item) => (
                      <TableRow key={item.id} data-testid={`row-queue-item-${item.id}`}>
                        <TableCell className="font-medium">{item.orderId}</TableCell>
                        <TableCell>{item.stockModel}</TableCell>
                        <TableCell>{getSourceBadge(item.source)}</TableCell>
                        <TableCell>{getMaterialBadge(item.materialType)}</TableCell>
                        <TableCell>{item.customer || '-'}</TableCell>
                        <TableCell>
                          {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.packetsNeeded}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.priority >= 80 ? "destructive" : item.priority >= 60 ? "default" : "outline"}>
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            onClick={() => handleScheduleItem(item)}
                            disabled={scheduleItemMutation.isPending}
                            data-testid={`button-schedule-${item.id}`}
                          >
                            <ArrowRight className="h-4 w-4 mr-1" />
                            Schedule
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="from-inventory">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Stock Model</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Packets</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.filter(i => i.usesInventory).map((item) => (
                      <TableRow key={item.id} data-testid={`row-queue-item-${item.id}`}>
                        <TableCell className="font-medium">{item.orderId}</TableCell>
                        <TableCell>{item.stockModel}</TableCell>
                        <TableCell>{getSourceBadge(item.source)}</TableCell>
                        <TableCell>{getMaterialBadge(item.materialType)}</TableCell>
                        <TableCell>{item.customer || '-'}</TableCell>
                        <TableCell>
                          {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.packetsNeeded}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.priority >= 80 ? "destructive" : item.priority >= 60 ? "default" : "outline"}>
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            From Inventory
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

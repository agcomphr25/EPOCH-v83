import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar,
  Scissors,
  RefreshCw,
  Plus,
  Minus,
  Send,
  Box,
  ChevronDown,
  ChevronRight,
  Factory,
  TrendingUp,
  AlertCircle,
  Package,
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
  carbon_fiber: { regular: number; oem: number; p2: number; total: number; fromInventory: number; needsCutting: number; onHand: number };
  fiberglass: { regular: number; oem: number; p2: number; total: number; fromInventory: number; needsCutting: number; onHand: number };
  weekStart: string;
  weekEnd: string;
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
  
  const [currentWeek] = useState(getMondayOfWeek(new Date()));
  const [scheduleQuantities, setScheduleQuantities] = useState<Record<string, number>>({});
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  const { data: weeklyQueueData, isLoading, refetch } = useQuery<{
    items: WeeklyCuttingQueueItem[];
    summary: WeeklySummary;
    totalItems: number;
  }>({
    queryKey: ['/api/cutting-table/weekly-cutting-queue', 'showAll'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/weekly-cutting-queue?showAll=true');
      if (!res.ok) throw new Error('Failed to fetch queue');
      return res.json();
    },
  });

  const { data: stockLevels = { carbon_fiber: 0, fiberglass: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/stock-levels'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/stock-levels');
      if (!res.ok) return { carbon_fiber: 0, fiberglass: 0 };
      return res.json();
    },
  });

  const { data: mfgQueueData } = useQuery<any[]>({
    queryKey: ['/api/cutting-table-mfg-queue/cutting-table', 'ALL'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table-mfg-queue/cutting-table?status=ALL');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const demandByCustomer = useMemo(() => {
    if (!weeklyQueueData?.items) return [];
    
    const grouped: Record<string, {
      customer: string;
      cfCount: number;
      fgCount: number;
      totalCount: number;
      items: WeeklyCuttingQueueItem[];
      sources: Set<string>;
    }> = {};
    
    weeklyQueueData.items.forEach(item => {
      const customer = item.customer || 'Unknown';
      if (!grouped[customer]) {
        grouped[customer] = {
          customer,
          cfCount: 0,
          fgCount: 0,
          totalCount: 0,
          items: [],
          sources: new Set(),
        };
      }
      grouped[customer].items.push(item);
      grouped[customer].totalCount += item.packetsNeeded;
      grouped[customer].sources.add(item.source);
      if (item.materialType === 'carbon_fiber') {
        grouped[customer].cfCount += item.packetsNeeded;
      } else if (item.materialType === 'fiberglass') {
        grouped[customer].fgCount += item.packetsNeeded;
      }
    });
    
    return Object.values(grouped).sort((a, b) => b.totalCount - a.totalCount);
  }, [weeklyQueueData?.items]);

  const scheduledCounts = useMemo(() => {
    let cf = 0, fg = 0;
    (mfgQueueData || []).forEach((item: any) => {
      try {
        const notes = item.notes ? JSON.parse(item.notes) : {};
        const remaining = item.quantityRequested - (item.quantityCompleted || 0);
        if (notes.materialType === 'carbon_fiber') cf += remaining;
        else if (notes.materialType === 'fiberglass') fg += remaining;
      } catch {}
    });
    return { carbon_fiber: cf, fiberglass: fg };
  }, [mfgQueueData]);

  const schedulePacketsMutation = useMutation({
    mutationFn: async (data: { packetType: string; quantity: number; materialType: string; customer?: string }) => {
      return apiRequest('/api/cutting-table/schedule-to-cutting', {
        method: 'POST',
        body: JSON.stringify({
          orderId: `SCHED-${data.packetType}-${Date.now()}`,
          bomId: 'generic-p2-packet',
          quantity: data.quantity,
          priority: 50,
          dueDate: new Date(currentWeek).toISOString(),
          source: 'MANUAL',
          materialType: data.materialType,
          notes: `Scheduled ${data.quantity} ${data.packetType} packets${data.customer ? ` for ${data.customer}` : ''}`,
        }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      setScheduleQuantities({});
      toast({ title: "Scheduled", description: `${variables.quantity} ${variables.packetType} packets added to cutting queue.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to schedule packets.", variant: "destructive" });
    },
  });

  const updateQuantity = (key: string, delta: number) => {
    setScheduleQuantities(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] || 0) + delta),
    }));
  };

  const setQuantity = (key: string, value: string) => {
    const num = parseInt(value) || 0;
    setScheduleQuantities(prev => ({
      ...prev,
      [key]: Math.max(0, num),
    }));
  };

  const handleSchedule = (packetType: string, materialType: string, customer?: string) => {
    const key = customer ? `${customer}-${materialType}` : materialType;
    const qty = scheduleQuantities[key] || 0;
    if (qty <= 0) {
      toast({ title: "Invalid", description: "Enter a quantity greater than 0.", variant: "destructive" });
      return;
    }
    schedulePacketsMutation.mutate({
      packetType,
      quantity: qty,
      materialType,
      customer,
    });
  };

  const summary = weeklyQueueData?.summary;
  const cfDemand = summary?.carbon_fiber?.total || 0;
  const fgDemand = summary?.fiberglass?.total || 0;
  const cfNeedsCutting = summary?.carbon_fiber?.needsCutting || 0;
  const fgNeedsCutting = summary?.fiberglass?.needsCutting || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">Weekly Cutting Schedule</h2>
          <p className="text-muted-foreground">
            Demand from P1, P1 PO, and P2 queues • Week of {formatWeekRange(currentWeek)}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-gray-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              CF Demand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{cfDemand}</div>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="text-red-600 font-medium">{cfNeedsCutting} need cutting</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              FG Demand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{fgDemand}</div>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="text-red-600 font-medium">{fgNeedsCutting} need cutting</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4" />
              CF On-Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stockLevels.carbon_fiber}</div>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{scheduledCounts.carbon_fiber} scheduled</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4" />
              FG On-Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stockLevels.fiberglass}</div>
            <div className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">{scheduledCounts.fiberglass} scheduled</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Schedule Carbon Fiber Packets
            </CardTitle>
            <CardDescription>
              Demand: {cfDemand} • On-hand: {stockLevels.carbon_fiber} • Gap: {Math.max(0, cfNeedsCutting - scheduledCounts.carbon_fiber)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg text-white">
              <div className="flex-1">
                <p className="font-bold text-lg">Carbon Fiber Packets</p>
                <p className="text-sm opacity-80">Schedule for cutting queue</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon" onClick={() => updateQuantity('carbon_fiber', -10)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={scheduleQuantities['carbon_fiber'] || 0}
                  onChange={(e) => setQuantity('carbon_fiber', e.target.value)}
                  className="text-center text-lg font-bold w-20 bg-white text-black"
                  data-testid="input-qty-cf"
                />
                <Button variant="secondary" size="icon" onClick={() => updateQuantity('carbon_fiber', 10)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button 
                onClick={() => handleSchedule('Carbon Fiber', 'carbon_fiber')}
                disabled={!scheduleQuantities['carbon_fiber'] || schedulePacketsMutation.isPending}
                className="bg-white text-black hover:bg-gray-200"
                data-testid="button-schedule-cf"
              >
                <Send className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Schedule Fiberglass Packets
            </CardTitle>
            <CardDescription>
              Demand: {fgDemand} • On-hand: {stockLevels.fiberglass} • Gap: {Math.max(0, fgNeedsCutting - scheduledCounts.fiberglass)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 bg-amber-500 rounded-lg text-white">
              <div className="flex-1">
                <p className="font-bold text-lg">Fiberglass Packets</p>
                <p className="text-sm opacity-80">Schedule for cutting queue</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon" onClick={() => updateQuantity('fiberglass', -10)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  type="number"
                  value={scheduleQuantities['fiberglass'] || 0}
                  onChange={(e) => setQuantity('fiberglass', e.target.value)}
                  className="text-center text-lg font-bold w-20 bg-white text-black"
                  data-testid="input-qty-fg"
                />
                <Button variant="secondary" size="icon" onClick={() => updateQuantity('fiberglass', 10)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Button 
                onClick={() => handleSchedule('Fiberglass', 'fiberglass')}
                disabled={!scheduleQuantities['fiberglass'] || schedulePacketsMutation.isPending}
                className="bg-white text-black hover:bg-gray-200"
                data-testid="button-schedule-fg"
              >
                <Send className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Demand by Customer
          </CardTitle>
          <CardDescription>
            {weeklyQueueData?.totalItems || 0} total items from {demandByCustomer.length} customers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading demand data...</div>
          ) : demandByCustomer.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No pending demand</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-center">CF</TableHead>
                  <TableHead className="text-center">FG</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demandByCustomer.map(row => (
                  <Collapsible key={row.customer} asChild>
                    <>
                      <TableRow className="cursor-pointer hover:bg-muted/50">
                        <TableCell>
                          <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedCustomers(prev => ({ ...prev, [row.customer]: !prev[row.customer] }))}>
                              {expandedCustomers[row.customer] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </Button>
                          </CollapsibleTrigger>
                        </TableCell>
                        <TableCell className="font-medium">{row.customer}</TableCell>
                        <TableCell className="text-center">
                          {row.cfCount > 0 && (
                            <Badge variant="outline" className="bg-gray-900 text-white">{row.cfCount}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.fgCount > 0 && (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800">{row.fgCount}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-bold">{row.totalCount}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {Array.from(row.sources).map(src => (
                              <Badge key={src} variant="outline" className="text-xs">
                                {src}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              value={scheduleQuantities[`${row.customer}-carbon_fiber`] || 0}
                              onChange={(e) => setQuantity(`${row.customer}-carbon_fiber`, e.target.value)}
                              className="w-16 h-8 text-center"
                              placeholder="CF"
                              data-testid={`input-qty-${row.customer}-cf`}
                            />
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleSchedule(`CF for ${row.customer}`, 'carbon_fiber', row.customer)}
                              disabled={!scheduleQuantities[`${row.customer}-carbon_fiber`]}
                              data-testid={`button-schedule-${row.customer}-cf`}
                            >
                              CF
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="py-2">
                            <div className="pl-8 text-sm">
                              <p className="font-medium mb-2">Order Details:</p>
                              <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                                {row.items.slice(0, 20).map(item => (
                                  <div key={item.id} className="text-xs p-1 bg-background rounded border">
                                    <span className="font-medium">{item.orderId}</span>
                                    <span className="text-muted-foreground ml-1">({item.source})</span>
                                  </div>
                                ))}
                                {row.items.length > 20 && (
                                  <div className="text-xs p-1 text-muted-foreground">
                                    +{row.items.length - 20} more...
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Currently Scheduled
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(mfgQueueData || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No packets currently scheduled for cutting
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-center">Done</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mfgQueueData || []).slice(0, 15).map((item: any) => {
                  let notes: any = {};
                  try { notes = JSON.parse(item.notes || '{}'); } catch {}
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {notes.userNotes || notes.orderId || `Queue #${item.id}`}
                      </TableCell>
                      <TableCell className="text-center">{item.quantityRequested}</TableCell>
                      <TableCell className="text-center">{item.quantityCompleted || 0}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'COMPLETED' ? 'default' : 'outline'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

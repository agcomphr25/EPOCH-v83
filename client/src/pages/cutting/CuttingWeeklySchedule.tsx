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
  Package,
  Layers,
} from "lucide-react";

type WeeklyCuttingQueueItem = {
  id: string;
  orderId: string;
  stockModel: string;
  source: 'P1' | 'P1_PO' | 'P2';
  orderType: 'regular' | 'oem' | 'p2_po';
  materialType: 'carbon_fiber' | 'fiberglass' | 'mesa' | 'unknown';
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ p1: true, p2: true });

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

  const { data: stockLevels = { carbon_fiber: 0, fiberglass: 0, mesa: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/stock-levels'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/stock-levels');
      if (!res.ok) return { carbon_fiber: 0, fiberglass: 0, mesa: 0 };
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

  const p1Demand = useMemo(() => {
    if (!weeklyQueueData?.items) return { cf: 0, fg: 0, mesa: 0, total: 0, byCustomer: [] };
    
    const p1Items = weeklyQueueData.items.filter(i => i.source === 'P1' || i.source === 'P1_PO');
    
    let cf = 0, fg = 0, mesa = 0;
    const customerMap: Record<string, { cf: number; fg: number; mesa: number }> = {};
    
    p1Items.forEach(item => {
      const customer = item.customer || 'Unknown';
      if (!customerMap[customer]) customerMap[customer] = { cf: 0, fg: 0, mesa: 0 };
      
      const stockModel = (item.stockModel || '').toLowerCase();
      if (stockModel.includes('mesa') || item.materialType === 'mesa') {
        mesa += item.packetsNeeded;
        customerMap[customer].mesa += item.packetsNeeded;
      } else if (item.materialType === 'carbon_fiber' || stockModel.includes('cf')) {
        cf += item.packetsNeeded;
        customerMap[customer].cf += item.packetsNeeded;
      } else if (item.materialType === 'fiberglass' || stockModel.includes('fg')) {
        fg += item.packetsNeeded;
        customerMap[customer].fg += item.packetsNeeded;
      }
    });
    
    const byCustomer = Object.entries(customerMap)
      .map(([customer, counts]) => ({ customer, ...counts, total: counts.cf + counts.fg + counts.mesa }))
      .sort((a, b) => b.total - a.total);
    
    return { cf, fg, mesa, total: cf + fg + mesa, byCustomer };
  }, [weeklyQueueData?.items]);

  const p2Demand = useMemo(() => {
    if (!weeklyQueueData?.items) return [];
    
    const p2Items = weeklyQueueData.items.filter(i => i.source === 'P2');
    
    const poMap: Record<string, {
      poId: string;
      customer: string;
      items: { name: string; qty: number; materialType: string }[];
      total: number;
    }> = {};
    
    p2Items.forEach(item => {
      const poId = item.orderId.split('-')[1] || item.orderId;
      if (!poMap[poId]) {
        poMap[poId] = {
          poId,
          customer: item.customer || 'P2 Order',
          items: [],
          total: 0,
        };
      }
      poMap[poId].items.push({
        name: item.stockModel,
        qty: item.packetsNeeded,
        materialType: item.materialType,
      });
      poMap[poId].total += item.packetsNeeded;
    });
    
    return Object.values(poMap).sort((a, b) => b.total - a.total);
  }, [weeklyQueueData?.items]);

  const scheduledCounts = useMemo(() => {
    let cf = 0, fg = 0, mesa = 0;
    (mfgQueueData || []).forEach((item: any) => {
      try {
        const notes = item.notes ? JSON.parse(item.notes) : {};
        const remaining = item.quantityRequested - (item.quantityCompleted || 0);
        if (notes.materialType === 'carbon_fiber') cf += remaining;
        else if (notes.materialType === 'fiberglass') fg += remaining;
        else if (notes.materialType === 'mesa') mesa += remaining;
      } catch {}
    });
    return { carbon_fiber: cf, fiberglass: fg, mesa };
  }, [mfgQueueData]);

  const schedulePacketsMutation = useMutation({
    mutationFn: async (data: { packetType: string; quantity: number; materialType: string; description?: string }) => {
      return apiRequest('/api/cutting-table/schedule-to-cutting', {
        method: 'POST',
        body: JSON.stringify({
          orderId: `SCHED-${data.packetType.toUpperCase()}-${Date.now()}`,
          bomId: 'generic-p2-packet',
          quantity: data.quantity,
          priority: 50,
          dueDate: new Date(currentWeek).toISOString(),
          source: 'MANUAL',
          materialType: data.materialType,
          notes: data.description || `Scheduled ${data.quantity} ${data.packetType} packets`,
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

  const handleSchedule = (packetType: string, materialType: string, description?: string) => {
    const qty = scheduleQuantities[materialType] || 0;
    if (qty <= 0) {
      toast({ title: "Invalid", description: "Enter a quantity greater than 0.", variant: "destructive" });
      return;
    }
    schedulePacketsMutation.mutate({ packetType, quantity: qty, materialType, description });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">Weekly Cutting Schedule</h2>
          <p className="text-muted-foreground">
            Week of {formatWeekRange(currentWeek)} • P1 Stock Packets + P2 PO Packets
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            <CardTitle>P1 Stock Packet Demand</CardTitle>
          </div>
          <CardDescription>
            3 standard packet types for P1 orders: CF, FG, and Mesa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-gray-900 text-white rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm opacity-80">Carbon Fiber Packets</p>
                  <p className="text-3xl font-bold">{p1Demand.cf}</p>
                  <p className="text-xs opacity-60">demand</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.carbon_fiber}</span></p>
                  <p className="text-sm">Scheduled: <span className="font-bold">{scheduledCounts.carbon_fiber}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity('carbon_fiber', -10)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  value={scheduleQuantities['carbon_fiber'] || 0}
                  onChange={(e) => setQuantity('carbon_fiber', e.target.value)}
                  className="text-center font-bold w-20 h-8 bg-white text-black"
                  data-testid="input-qty-cf"
                />
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity('carbon_fiber', 10)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleSchedule('CF Stock', 'carbon_fiber')}
                  disabled={!scheduleQuantities['carbon_fiber'] || schedulePacketsMutation.isPending}
                  className="bg-white text-black hover:bg-gray-200"
                  data-testid="button-schedule-cf"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Schedule
                </Button>
              </div>
            </div>

            <div className="p-4 bg-amber-500 text-white rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm opacity-80">Fiberglass Packets</p>
                  <p className="text-3xl font-bold">{p1Demand.fg}</p>
                  <p className="text-xs opacity-60">demand</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.fiberglass}</span></p>
                  <p className="text-sm">Scheduled: <span className="font-bold">{scheduledCounts.fiberglass}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity('fiberglass', -10)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  value={scheduleQuantities['fiberglass'] || 0}
                  onChange={(e) => setQuantity('fiberglass', e.target.value)}
                  className="text-center font-bold w-20 h-8 bg-white text-black"
                  data-testid="input-qty-fg"
                />
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity('fiberglass', 10)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleSchedule('FG Stock', 'fiberglass')}
                  disabled={!scheduleQuantities['fiberglass'] || schedulePacketsMutation.isPending}
                  className="bg-white text-black hover:bg-gray-200"
                  data-testid="button-schedule-fg"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Schedule
                </Button>
              </div>
            </div>

            <div className="p-4 bg-orange-600 text-white rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="text-sm opacity-80">Mesa Packets</p>
                  <p className="text-3xl font-bold">{p1Demand.mesa}</p>
                  <p className="text-xs opacity-60">demand</p>
                </div>
                <div className="text-right">
                  <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.mesa || 0}</span></p>
                  <p className="text-sm">Scheduled: <span className="font-bold">{scheduledCounts.mesa}</span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity('mesa', -10)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <Input
                  type="number"
                  value={scheduleQuantities['mesa'] || 0}
                  onChange={(e) => setQuantity('mesa', e.target.value)}
                  className="text-center font-bold w-20 h-8 bg-white text-black"
                  data-testid="input-qty-mesa"
                />
                <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity('mesa', 10)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button 
                  size="sm"
                  onClick={() => handleSchedule('Mesa Stock', 'mesa')}
                  disabled={!scheduleQuantities['mesa'] || schedulePacketsMutation.isPending}
                  className="bg-white text-black hover:bg-gray-200"
                  data-testid="button-schedule-mesa"
                >
                  <Send className="h-3 w-3 mr-1" />
                  Schedule
                </Button>
              </div>
            </div>
          </div>

          {p1Demand.byCustomer.length > 0 && (
            <Collapsible open={expandedSections.p1} onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, p1: open }))}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-2 text-sm text-muted-foreground">
                  {expandedSections.p1 ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  P1 Demand by Customer ({p1Demand.byCustomer.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-center">CF</TableHead>
                      <TableHead className="text-center">FG</TableHead>
                      <TableHead className="text-center">Mesa</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p1Demand.byCustomer.map(row => (
                      <TableRow key={row.customer}>
                        <TableCell className="font-medium">{row.customer}</TableCell>
                        <TableCell className="text-center">
                          {row.cf > 0 && <Badge variant="outline" className="bg-gray-900 text-white">{row.cf}</Badge>}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.fg > 0 && <Badge variant="outline" className="bg-amber-100 text-amber-800">{row.fg}</Badge>}
                        </TableCell>
                        <TableCell className="text-center">
                          {row.mesa > 0 && <Badge variant="outline" className="bg-orange-100 text-orange-800">{row.mesa}</Badge>}
                        </TableCell>
                        <TableCell className="text-center font-bold">{row.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {p2Demand.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <CardTitle>P2 PO Packet Demand</CardTitle>
            </div>
            <CardDescription>
              Individual packet types specific to each purchase order
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {(() => {
                let cfTotal = 0, fgTotal = 0, mesaTotal = 0;
                p2Demand.forEach(po => {
                  po.items.forEach(item => {
                    if (item.materialType === 'carbon_fiber') cfTotal += item.qty;
                    else if (item.materialType === 'fiberglass') fgTotal += item.qty;
                    else if (item.materialType === 'mesa') mesaTotal += item.qty;
                  });
                });
                return (
                  <>
                    <div className="p-4 bg-gray-900 text-white rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm opacity-80">Carbon Fiber Packets</p>
                          <p className="text-3xl font-bold">{cfTotal}</p>
                          <p className="text-xs opacity-60">P2 demand</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.carbon_fiber}</span></p>
                          <p className="text-sm">Scheduled: <span className="font-bold">{scheduledCounts.carbon_fiber}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-amber-500 text-white rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm opacity-80">Fiberglass Packets</p>
                          <p className="text-3xl font-bold">{fgTotal}</p>
                          <p className="text-xs opacity-60">P2 demand</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.fiberglass}</span></p>
                          <p className="text-sm">Scheduled: <span className="font-bold">{scheduledCounts.fiberglass}</span></p>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-orange-600 text-white rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm opacity-80">Mesa Packets</p>
                          <p className="text-3xl font-bold">{mesaTotal}</p>
                          <p className="text-xs opacity-60">P2 demand</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.mesa || 0}</span></p>
                          <p className="text-sm">Scheduled: <span className="font-bold">{scheduledCounts.mesa}</span></p>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <Collapsible open={expandedSections.p2} onOpenChange={(open) => setExpandedSections(prev => ({ ...prev, p2: open }))}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-2 text-sm text-muted-foreground">
                  {expandedSections.p2 ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  P2 Demand by PO ({p2Demand.length})
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO / Customer</TableHead>
                      <TableHead className="text-center">CF</TableHead>
                      <TableHead className="text-center">FG</TableHead>
                      <TableHead className="text-center">Mesa</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p2Demand.map(po => {
                      let cf = 0, fg = 0, mesa = 0;
                      po.items.forEach(item => {
                        if (item.materialType === 'carbon_fiber') cf += item.qty;
                        else if (item.materialType === 'fiberglass') fg += item.qty;
                        else if (item.materialType === 'mesa') mesa += item.qty;
                      });
                      return (
                        <TableRow key={po.poId}>
                          <TableCell className="font-medium">
                            PO-{po.poId}
                            <span className="text-muted-foreground ml-2">• {po.customer}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            {cf > 0 && <Badge variant="outline" className="bg-gray-900 text-white">{cf}</Badge>}
                          </TableCell>
                          <TableCell className="text-center">
                            {fg > 0 && <Badge variant="outline" className="bg-amber-100 text-amber-800">{fg}</Badge>}
                          </TableCell>
                          <TableCell className="text-center">
                            {mesa > 0 && <Badge variant="outline" className="bg-orange-100 text-orange-800">{mesa}</Badge>}
                          </TableCell>
                          <TableCell className="text-center font-bold">{po.total}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Currently Scheduled for Cutting
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

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Trash2,
  PlusCircle,
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
  const [customDemand, setCustomDemand] = useState({
    poNumber: '',
    packetType: '',
    quantity: '',
    notes: '',
  });

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
    if (!weeklyQueueData?.items) return { 
      cf: 0, fg: 0, mesa: 0, total: 0, byCustomer: [],
      regularOrders: { cf: 0, fg: 0, mesa: 0, total: 0 },
      oemOrders: { cf: 0, fg: 0, mesa: 0, total: 0 }
    };
    
    const p1Items = weeklyQueueData.items.filter(i => i.source === 'P1' || i.source === 'P1_PO');
    
    let cf = 0, fg = 0, mesa = 0;
    const regularOrders = { cf: 0, fg: 0, mesa: 0, total: 0 };
    const oemOrders = { cf: 0, fg: 0, mesa: 0, total: 0 };
    const customerMap: Record<string, { 
      cf: number; fg: number; mesa: number;
      poCf: number; poFg: number; poMesa: number;
      regCf: number; regFg: number; regMesa: number;
    }> = {};
    
    p1Items.forEach(item => {
      const customer = item.customer || 'Unknown';
      if (!customerMap[customer]) customerMap[customer] = { 
        cf: 0, fg: 0, mesa: 0,
        poCf: 0, poFg: 0, poMesa: 0,
        regCf: 0, regFg: 0, regMesa: 0
      };
      
      const stockModel = (item.stockModel || '').toLowerCase();
      const isP1PO = item.source === 'P1_PO';
      
      // Mesa packets are only for PO orders - regular P1 orders never need mesa packets
      if (isP1PO && (stockModel.includes('mesa') || item.materialType === 'mesa')) {
        mesa += item.packetsNeeded;
        customerMap[customer].mesa += item.packetsNeeded;
        oemOrders.mesa += item.packetsNeeded;
        customerMap[customer].poMesa += item.packetsNeeded;
      } else if (item.materialType === 'carbon_fiber' || stockModel.includes('cf')) {
        cf += item.packetsNeeded;
        customerMap[customer].cf += item.packetsNeeded;
        if (isP1PO) {
          oemOrders.cf += item.packetsNeeded;
          customerMap[customer].poCf += item.packetsNeeded;
        } else {
          regularOrders.cf += item.packetsNeeded;
          customerMap[customer].regCf += item.packetsNeeded;
        }
      } else if (item.materialType === 'fiberglass' || stockModel.includes('fg')) {
        fg += item.packetsNeeded;
        customerMap[customer].fg += item.packetsNeeded;
        if (isP1PO) {
          oemOrders.fg += item.packetsNeeded;
          customerMap[customer].poFg += item.packetsNeeded;
        } else {
          regularOrders.fg += item.packetsNeeded;
          customerMap[customer].regFg += item.packetsNeeded;
        }
      }
    });
    
    regularOrders.total = regularOrders.cf + regularOrders.fg + regularOrders.mesa;
    oemOrders.total = oemOrders.cf + oemOrders.fg + oemOrders.mesa;
    
    const byCustomer = Object.entries(customerMap)
      .map(([customer, counts]) => ({ 
        customer, 
        ...counts, 
        total: counts.cf + counts.fg + counts.mesa,
        poTotal: counts.poCf + counts.poFg + counts.poMesa,
        regTotal: counts.regCf + counts.regFg + counts.regMesa
      }))
      .sort((a, b) => b.total - a.total);
    
    return { cf, fg, mesa, total: cf + fg + mesa, byCustomer, regularOrders, oemOrders };
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
          packetName: data.packetType,
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

  const unscheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-cutting-queue'] });
      toast({ title: "Unscheduled", description: "Packet removed from cutting queue." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to unschedule packet.", variant: "destructive" });
    },
  });

  const customDemandMutation = useMutation({
    mutationFn: async (data: { poNumber: string; packetType: string; quantity: number; notes: string }) => {
      const materialTypeMap: Record<string, string> = {
        'Carbon Fiber Packet': 'carbon_fiber',
        'Fiberglass Packet': 'fiberglass',
        'Mesa Packet': 'mesa',
      };
      const materialType = materialTypeMap[data.packetType] || 'unknown';
      const description = data.poNumber
        ? `PO ${data.poNumber} - ${data.packetType}${data.notes ? ' - ' + data.notes : ''}`
        : `${data.packetType}${data.notes ? ' - ' + data.notes : ''}`;

      return apiRequest('/api/cutting-table/schedule-to-cutting', {
        method: 'POST',
        body: JSON.stringify({
          orderId: data.poNumber || `CUSTOM-${Date.now()}`,
          bomId: 'generic-p2-packet',
          quantity: data.quantity,
          priority: 50,
          dueDate: new Date(currentWeek).toISOString(),
          source: 'MANUAL',
          materialType,
          packetName: data.packetType,
          notes: description,
        }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      setCustomDemand({ poNumber: '', packetType: '', quantity: '', notes: '' });
      toast({
        title: "Packets Scheduled",
        description: `${variables.quantity} ${variables.packetType} packets added to cutting queue${variables.poNumber ? ` for PO ${variables.poNumber}` : ''}.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to schedule custom packets.", variant: "destructive" });
    },
  });

  const handleCustomDemandSubmit = () => {
    const qty = parseInt(customDemand.quantity) || 0;
    if (qty <= 0) {
      toast({ title: "Invalid Quantity", description: "Enter a quantity greater than 0.", variant: "destructive" });
      return;
    }
    if (!customDemand.packetType) {
      toast({ title: "Select Packet Type", description: "Choose a packet type before scheduling.", variant: "destructive" });
      return;
    }
    customDemandMutation.mutate({
      poNumber: customDemand.poNumber.trim(),
      packetType: customDemand.packetType,
      quantity: qty,
      notes: customDemand.notes.trim(),
    });
  };

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
                  <p className="text-3xl font-bold">{Math.max(0, p1Demand.cf - scheduledCounts.carbon_fiber)}</p>
                  <p className="text-xs opacity-70">Still needed</p>
                  <div className="text-xs opacity-70 mt-1">
                    <span className="text-gray-400">Demand: {p1Demand.cf}</span>
                    <span className="mx-1">|</span>
                    <span className="text-green-300">Scheduled: {scheduledCounts.carbon_fiber}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.carbon_fiber}</span></p>
                  <div className="text-xs opacity-70 mt-1">
                    <span className="text-red-300">PO: {p1Demand.oemOrders.cf}</span>
                    <span className="mx-1">|</span>
                    <span className="text-blue-300">Reg: {p1Demand.regularOrders.cf}</span>
                  </div>
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
                  <p className="text-3xl font-bold">{Math.max(0, p1Demand.fg - scheduledCounts.fiberglass)}</p>
                  <p className="text-xs opacity-70">Still needed</p>
                  <div className="text-xs opacity-70 mt-1">
                    <span className="text-gray-200">Demand: {p1Demand.fg}</span>
                    <span className="mx-1">|</span>
                    <span className="text-green-200">Scheduled: {scheduledCounts.fiberglass}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.fiberglass}</span></p>
                  <div className="text-xs opacity-70 mt-1">
                    <span className="text-red-100">PO: {p1Demand.oemOrders.fg}</span>
                    <span className="mx-1">|</span>
                    <span className="text-blue-100">Reg: {p1Demand.regularOrders.fg}</span>
                  </div>
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
                  <p className="text-3xl font-bold">{Math.max(0, p1Demand.mesa - scheduledCounts.mesa)}</p>
                  <p className="text-xs opacity-70">Still needed</p>
                  <div className="text-xs opacity-70 mt-1">
                    <span className="text-gray-200">Demand: {p1Demand.mesa}</span>
                    <span className="mx-1">|</span>
                    <span className="text-green-200">Scheduled: {scheduledCounts.mesa}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">On-hand: <span className="font-bold">{stockLevels.mesa || 0}</span></p>
                  <div className="text-xs opacity-70 mt-1">
                    <span className="text-red-100">PO: {p1Demand.oemOrders.mesa}</span>
                    <span className="mx-1">|</span>
                    <span className="text-blue-100">Reg: {p1Demand.regularOrders.mesa}</span>
                  </div>
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

          {(p1Demand.oemOrders.total > 0 || p1Demand.regularOrders.total > 0) && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Source</TableHead>
                    <TableHead className="text-center">CF</TableHead>
                    <TableHead className="text-center">FG</TableHead>
                    <TableHead className="text-center">Mesa</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p1Demand.oemOrders.total > 0 && (
                    <TableRow className="bg-red-50">
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="bg-red-100 text-red-700">PO Orders</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {p1Demand.oemOrders.cf > 0 && <Badge variant="outline" className="bg-gray-900 text-white">{p1Demand.oemOrders.cf}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {p1Demand.oemOrders.fg > 0 && <Badge variant="outline" className="bg-amber-100 text-amber-800">{p1Demand.oemOrders.fg}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {p1Demand.oemOrders.mesa > 0 && <Badge variant="outline" className="bg-orange-100 text-orange-800">{p1Demand.oemOrders.mesa}</Badge>}
                      </TableCell>
                      <TableCell className="text-center font-bold text-red-700">{p1Demand.oemOrders.total}</TableCell>
                    </TableRow>
                  )}
                  {p1Demand.regularOrders.total > 0 && (
                    <TableRow className="bg-blue-50">
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="bg-blue-100 text-blue-700">Reg Orders</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {p1Demand.regularOrders.cf > 0 && <Badge variant="outline" className="bg-gray-900 text-white">{p1Demand.regularOrders.cf}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {p1Demand.regularOrders.fg > 0 && <Badge variant="outline" className="bg-amber-100 text-amber-800">{p1Demand.regularOrders.fg}</Badge>}
                      </TableCell>
                      <TableCell className="text-center">
                        {p1Demand.regularOrders.mesa > 0 && <Badge variant="outline" className="bg-orange-100 text-orange-800">{p1Demand.regularOrders.mesa}</Badge>}
                      </TableCell>
                      <TableCell className="text-center font-bold text-blue-700">{p1Demand.regularOrders.total}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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
                const packetTypeCounts: Record<string, number> = {};
                let totalPackets = 0;
                p2Demand.forEach(po => {
                  po.items.forEach(item => {
                    packetTypeCounts[item.name] = (packetTypeCounts[item.name] || 0) + item.qty;
                    totalPackets += item.qty;
                  });
                });
                const sortedTypes = Object.entries(packetTypeCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6);
                const colors = ['bg-purple-600', 'bg-indigo-500', 'bg-teal-500', 'bg-pink-600', 'bg-cyan-600', 'bg-violet-600'];
                return sortedTypes.map(([name, count], idx) => {
                  const scheduleKey = `p2_${name.replace(/\s+/g, '_').toLowerCase()}`;
                  return (
                    <div key={name} className={`p-4 ${colors[idx % colors.length]} text-white rounded-lg`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm opacity-80">{name}</p>
                          <p className="text-3xl font-bold">{count}</p>
                          <p className="text-xs opacity-60">P2 demand</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">POs: <span className="font-bold">{p2Demand.filter(po => po.items.some(i => i.name === name)).length}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity(scheduleKey, -10)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={scheduleQuantities[scheduleKey] || 0}
                          onChange={(e) => setQuantity(scheduleKey, e.target.value)}
                          className="text-center font-bold w-20 h-8 bg-white text-black"
                          data-testid={`input-qty-p2-${name.replace(/\s+/g, '-').toLowerCase()}`}
                        />
                        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => updateQuantity(scheduleKey, 10)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button 
                          size="sm"
                          variant="secondary"
                          onClick={() => handleSchedule(name, scheduleKey, `P2 ${name} packets`)}
                          disabled={!scheduleQuantities[scheduleKey] || scheduleQuantities[scheduleKey] <= 0}
                          data-testid={`button-schedule-p2-${name.replace(/\s+/g, '-').toLowerCase()}`}
                        >
                          Schedule
                        </Button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {(() => {
              const allPacketTypes = new Set<string>();
              p2Demand.forEach(po => po.items.forEach(item => allPacketTypes.add(item.name)));
              const packetTypesList = Array.from(allPacketTypes).sort();
              const badgeColors = ['bg-purple-100 text-purple-800', 'bg-indigo-100 text-indigo-800', 'bg-teal-100 text-teal-800', 'bg-pink-100 text-pink-800', 'bg-cyan-100 text-cyan-800'];
              
              return (
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
                          <TableHead>Customer</TableHead>
                          {packetTypesList.map(type => (
                            <TableHead key={type} className="text-center">{type}</TableHead>
                          ))}
                          <TableHead className="text-center">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {p2Demand.map(po => {
                          const itemsByType: Record<string, number> = {};
                          po.items.forEach(item => {
                            itemsByType[item.name] = (itemsByType[item.name] || 0) + item.qty;
                          });
                          return (
                            <TableRow key={po.poId}>
                              <TableCell className="font-medium">{po.customer}</TableCell>
                              {packetTypesList.map((type, idx) => (
                                <TableCell key={type} className="text-center">
                                  {itemsByType[type] > 0 && (
                                    <Badge variant="outline" className={badgeColors[idx % badgeColors.length]}>
                                      {itemsByType[type]}
                                    </Badge>
                                  )}
                                </TableCell>
                              ))}
                              <TableCell className="text-center font-bold">{po.total}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5" />
            <CardTitle>Add Custom Packet Demand</CardTitle>
          </div>
          <CardDescription>
            Manually schedule packets for POs not shown above, or for future POs you want to start early
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="custom-po">PO Number (optional)</Label>
              <Input
                id="custom-po"
                placeholder="e.g. PO-1234"
                value={customDemand.poNumber}
                onChange={(e) => setCustomDemand(prev => ({ ...prev, poNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-packet-type">Packet Type</Label>
              <Select
                value={customDemand.packetType}
                onValueChange={(value) => setCustomDemand(prev => ({ ...prev, packetType: value }))}
              >
                <SelectTrigger id="custom-packet-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Carbon Fiber Packet">Carbon Fiber Packet</SelectItem>
                  <SelectItem value="Fiberglass Packet">Fiberglass Packet</SelectItem>
                  <SelectItem value="Mesa Packet">Mesa Packet</SelectItem>
                  <SelectItem value="Disruptor Packet">Disruptor Packet</SelectItem>
                  <SelectItem value="Antenna Cover Packet">Antenna Cover Packet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-qty">Quantity</Label>
              <Input
                id="custom-qty"
                type="number"
                min="1"
                placeholder="# of packets"
                value={customDemand.quantity}
                onChange={(e) => setCustomDemand(prev => ({ ...prev, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-notes">Notes (optional)</Label>
              <Input
                id="custom-notes"
                placeholder="e.g. Customer request, early start"
                value={customDemand.notes}
                onChange={(e) => setCustomDemand(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleCustomDemandSubmit}
              disabled={customDemandMutation.isPending || !customDemand.packetType || !customDemand.quantity}
            >
              <Plus className="h-4 w-4 mr-2" />
              {customDemandMutation.isPending ? 'Scheduling...' : 'Add to Cutting Queue'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Currently Scheduled for Cutting
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(mfgQueueData || []).filter((item: any) => item.status !== 'COMPLETED').length === 0 ? (
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
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mfgQueueData || []).filter((item: any) => item.status !== 'COMPLETED').slice(0, 15).map((item: any) => {
                  let notes: any = {};
                  let rawNotes = item.notes || '';
                  try { notes = JSON.parse(item.notes || '{}'); } catch {
                    // Not JSON - might be plain string notes
                  }
                  
                  const getDescription = () => {
                    if (item.displayName) return item.displayName;
                    if (notes.packetName) return notes.packetName;
                    if (notes.userNotes) return notes.userNotes;
                    if (notes.orderId) return notes.orderId;
                    if (item.partName) return item.partName;
                    // 4. Try material type from parsed notes
                    if (notes.materialType) {
                      const typeMap: Record<string, string> = {
                        'carbon_fiber': 'Carbon Fiber Packets',
                        'fiberglass': 'Fiberglass Packets',
                        'mesa': 'Mesa Packets'
                      };
                      return typeMap[notes.materialType] || notes.materialType;
                    }
                    // 5. Try materialType from item (parsed in backend)
                    if (item.materialType) {
                      const typeMap: Record<string, string> = {
                        'carbon_fiber': 'Carbon Fiber Packets',
                        'fiberglass': 'Fiberglass Packets',
                        'mesa': 'Mesa Packets'
                      };
                      return typeMap[item.materialType] || item.materialType;
                    }
                    // 6. If raw notes is a plain string (not empty object), use it
                    if (rawNotes && rawNotes !== '{}' && !rawNotes.startsWith('{')) {
                      return rawNotes;
                    }
                    // 7. Final fallback
                    return `Queue #${item.id}`;
                  };
                  
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        {getDescription()}
                      </TableCell>
                      <TableCell className="text-center">{item.quantityRequested}</TableCell>
                      <TableCell className="text-center">{item.quantityCompleted || 0}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'COMPLETED' ? 'default' : 'outline'}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.status !== 'COMPLETED' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={unscheduleMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Unschedule Packet?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove "{getDescription()}" ({item.quantityRequested} packets) from the cutting queue. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => unscheduleMutation.mutate(item.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Unschedule
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
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

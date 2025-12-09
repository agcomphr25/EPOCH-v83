import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  Calendar,
  Package,
  Scissors,
  RefreshCw,
  Plus,
  Minus,
  Send,
  Box,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PacketBOM = {
  id: string;
  partNumber: string;
  packetType: string;
  yieldPerCut: number;
  squareMetersPerCut: number;
  description?: string;
};

type ScheduleEntry = {
  bomId: string;
  packetType: string;
  quantity: number;
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

  const { data: packetBOMs = [], isLoading: loadingBOMs, refetch } = useQuery<PacketBOM[]>({
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

  const { data: mfgQueueData } = useQuery<any[]>({
    queryKey: ['/api/cutting-table-mfg-queue/cutting-table', 'ALL'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table-mfg-queue/cutting-table?status=ALL');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const scheduledCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (mfgQueueData || []).forEach((item: any) => {
      try {
        const notes = item.notes ? JSON.parse(item.notes) : {};
        if (notes.bomId) {
          counts[notes.bomId] = (counts[notes.bomId] || 0) + (item.quantityRequested - (item.quantityCompleted || 0));
        }
      } catch {}
    });
    return counts;
  }, [mfgQueueData]);

  const schedulePacketsMutation = useMutation({
    mutationFn: async (data: { bomId: string; quantity: number; packetType: string }) => {
      return apiRequest('/api/cutting-table/schedule-to-cutting', {
        method: 'POST',
        body: JSON.stringify({
          orderId: `SCHED-${Date.now()}`,
          bomId: data.bomId,
          quantity: data.quantity,
          priority: 50,
          dueDate: new Date(currentWeek).toISOString(),
          source: 'MANUAL',
          materialType: data.packetType.toLowerCase().includes('cf') || data.packetType.toLowerCase().includes('carbon') ? 'carbon_fiber' : 'fiberglass',
          notes: `Scheduled ${data.quantity} ${data.packetType} packets`,
        }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      setScheduleQuantities(prev => ({ ...prev, [variables.bomId]: 0 }));
      toast({ title: "Scheduled", description: `${variables.quantity} ${variables.packetType} packets added to cutting queue.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to schedule packets.", variant: "destructive" });
    },
  });

  const updateQuantity = (bomId: string, delta: number) => {
    setScheduleQuantities(prev => ({
      ...prev,
      [bomId]: Math.max(0, (prev[bomId] || 0) + delta),
    }));
  };

  const setQuantity = (bomId: string, value: string) => {
    const num = parseInt(value) || 0;
    setScheduleQuantities(prev => ({
      ...prev,
      [bomId]: Math.max(0, num),
    }));
  };

  const handleSchedule = (bom: PacketBOM) => {
    const qty = scheduleQuantities[bom.id] || 0;
    if (qty <= 0) {
      toast({ title: "Invalid", description: "Enter a quantity greater than 0.", variant: "destructive" });
      return;
    }
    schedulePacketsMutation.mutate({
      bomId: bom.id,
      quantity: qty,
      packetType: bom.packetType,
    });
  };

  const predefinedPackets = [
    { id: 'antenna-50', name: 'Antenna Packets 50', materialType: 'carbon_fiber', color: 'bg-gray-900 text-white' },
    { id: 'redhawk-cf', name: 'Red Hawk CF Packet', materialType: 'carbon_fiber', color: 'bg-red-600 text-white' },
    { id: 'fiberglass', name: 'Fiberglass Packet', materialType: 'fiberglass', color: 'bg-amber-500 text-white' },
    { id: 'regular-cf', name: 'Regular Orders CF', materialType: 'carbon_fiber', color: 'bg-blue-600 text-white' },
    { id: 'regular-fg', name: 'Regular Orders FG', materialType: 'fiberglass', color: 'bg-green-600 text-white' },
  ];

  const scheduleQuickPacketMutation = useMutation({
    mutationFn: async (data: { packetId: string; packetName: string; quantity: number; materialType: string }) => {
      return apiRequest('/api/cutting-table/schedule-to-cutting', {
        method: 'POST',
        body: JSON.stringify({
          orderId: `QUICK-${data.packetId}-${Date.now()}`,
          bomId: 'generic-p2-packet',
          quantity: data.quantity,
          priority: 50,
          dueDate: new Date(currentWeek).toISOString(),
          source: 'MANUAL',
          materialType: data.materialType,
          notes: `Quick schedule: ${data.quantity} ${data.packetName}`,
        }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      setScheduleQuantities(prev => ({ ...prev, [variables.packetId]: 0 }));
      toast({ title: "Scheduled", description: `${variables.quantity} ${variables.packetName} added to cutting queue.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to schedule packets.", variant: "destructive" });
    },
  });

  const handleQuickSchedule = (packet: typeof predefinedPackets[0]) => {
    const qty = scheduleQuantities[packet.id] || 0;
    if (qty <= 0) {
      toast({ title: "Invalid", description: "Enter a quantity greater than 0.", variant: "destructive" });
      return;
    }
    scheduleQuickPacketMutation.mutate({
      packetId: packet.id,
      packetName: packet.name,
      quantity: qty,
      materialType: packet.materialType,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">Weekly Cutting Schedule</h2>
          <p className="text-muted-foreground">
            Schedule packets for the week of {formatWeekRange(currentWeek)}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4" />
              Carbon Fiber On-Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stockLevels.carbon_fiber}</div>
            <p className="text-sm text-muted-foreground">packets available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Box className="h-4 w-4 text-amber-600" />
              Fiberglass On-Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stockLevels.fiberglass}</div>
            <p className="text-sm text-muted-foreground">packets available</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Quick Schedule Packets
          </CardTitle>
          <CardDescription>
            Select quantity and schedule packets for cutting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {predefinedPackets.map(packet => (
              <Card key={packet.id} className="border-2">
                <CardHeader className={cn("py-3 rounded-t-lg", packet.color)}>
                  <CardTitle className="text-lg">{packet.name}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => updateQuantity(packet.id, -1)}
                      data-testid={`button-minus-${packet.id}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      value={scheduleQuantities[packet.id] || 0}
                      onChange={(e) => setQuantity(packet.id, e.target.value)}
                      className="text-center text-lg font-bold w-20"
                      data-testid={`input-qty-${packet.id}`}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => updateQuantity(packet.id, 1)}
                      data-testid={`button-plus-${packet.id}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => handleQuickSchedule(packet)}
                    disabled={!scheduleQuantities[packet.id] || scheduleQuickPacketMutation.isPending}
                    data-testid={`button-schedule-${packet.id}`}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Schedule
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {packetBOMs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Schedule from Packet BOMs
            </CardTitle>
            <CardDescription>
              Schedule packets using defined Bill of Materials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packet Type</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead className="text-center">Currently Scheduled</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packetBOMs.map(bom => (
                  <TableRow key={bom.id}>
                    <TableCell className="font-medium">{bom.packetType}</TableCell>
                    <TableCell>{bom.partNumber}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{scheduledCounts[bom.id] || 0}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(bom.id, -1)}
                          data-testid={`button-minus-bom-${bom.id}`}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number"
                          value={scheduleQuantities[bom.id] || 0}
                          onChange={(e) => setQuantity(bom.id, e.target.value)}
                          className="text-center w-16 h-8"
                          data-testid={`input-qty-bom-${bom.id}`}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => updateQuantity(bom.id, 1)}
                          data-testid={`button-plus-bom-${bom.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button 
                        size="sm"
                        onClick={() => handleSchedule(bom)}
                        disabled={!scheduleQuantities[bom.id] || schedulePacketsMutation.isPending}
                        data-testid={`button-schedule-bom-${bom.id}`}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Schedule
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
          {loadingBOMs ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (mfgQueueData || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No packets currently scheduled for cutting
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(mfgQueueData || []).slice(0, 20).map((item: any) => {
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
                      <TableCell>
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
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

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Printer, 
  Scan, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  Target,
  Layers,
  Calendar,
  ArrowRight,
  RefreshCw
} from "lucide-react";

type FabricInventoryItem = {
  id: string;
  fabricType: string;
  lotNumber: string;
  batchNumber: string;
  rollNumber: string;
  quantityInStock: number;
  squareMeters: number;
  receivedDate: string;
  expirationDate: string | null;
  location: string;
  barcodeValue: string;
  status: 'available' | 'low' | 'expired';
};

type PacketSession = {
  id: string;
  packetType: 'carbon_fiber' | 'fiberglass';
  packetsBuilt: number;
  fabricLots: string[];
  createdAt: string;
  createdBy: string;
};

type LayupScheduleItem = {
  orderId: string;
  stockModel: string;
  material: string;
  scheduledDate: string;
};

const STOCK_TARGETS = {
  carbon_fiber: 400,
  fiberglass: 40,
};

export default function CuttingTableDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [scanMode, setScanMode] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedFabric, setSelectedFabric] = useState<FabricInventoryItem | null>(null);

  const [receivingForm, setReceivingForm] = useState({
    fabricType: "",
    lotNumber: "",
    batchNumber: "",
    rollNumber: "",
    quantity: "",
    squareMeters: "",
    expirationDate: "",
    location: "",
    notes: "",
  });

  const [packetForm, setPacketForm] = useState({
    packetType: "",
    quantity: "",
    scannedFabrics: [] as string[],
  });

  const { data: fabricInventory = [], isLoading: loadingFabric, refetch: refetchFabric } = useQuery<FabricInventoryItem[]>({
    queryKey: ['/api/cutting-table/fabric-inventory-full'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/fabric-inventory');
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((item: any) => ({
        ...item,
        barcodeValue: `FAB-${item.lotNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
        status: item.quantityInStock < 10 ? 'low' : 
                (item.expirationDate && new Date(item.expirationDate) < new Date() ? 'expired' : 'available'),
      }));
    },
  });

  const { data: currentStock = { carbon_fiber: 0, fiberglass: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/stock-levels'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/stock-levels');
      if (!res.ok) return { carbon_fiber: 0, fiberglass: 0 };
      return res.json();
    },
  });

  const { data: weeklyNeeds = { carbon_fiber: 0, fiberglass: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/weekly-packet-needs'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/layup-schedule/weekly-summary');
        if (!res.ok) return { carbon_fiber: 0, fiberglass: 0 };
        const data = await res.json();
        let cfCount = 0;
        let fgCount = 0;
        if (Array.isArray(data)) {
          data.forEach((item: any) => {
            const model = (item.stockModel || item.stock_model || '').toLowerCase();
            if (model.includes('cf_') || model.includes('carbon')) {
              cfCount += item.quantity || 1;
            } else if (model.includes('fg_') || model.includes('fiber')) {
              fgCount += item.quantity || 1;
            }
          });
        }
        return { carbon_fiber: cfCount, fiberglass: fgCount };
      } catch {
        return { carbon_fiber: 0, fiberglass: 0 };
      }
    },
  });

  const receiveFabricMutation = useMutation({
    mutationFn: async (data: typeof receivingForm) => {
      return apiRequest('/api/cutting-table/fabric-inventory', {
        method: 'POST',
        body: JSON.stringify({
          fabricType: data.fabricType,
          lotNumber: data.lotNumber,
          batchNumber: data.batchNumber,
          rollNumber: data.rollNumber,
          quantityInStock: parseInt(data.quantity) || 0,
          squareMeters: parseFloat(data.squareMeters) || 0,
          expirationDate: data.expirationDate || null,
          location: data.location,
          notes: data.notes,
          receivedDate: new Date().toISOString(),
        }),
      });
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: "Fabric received and added to inventory" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      setReceivingForm({
        fabricType: "",
        lotNumber: "",
        batchNumber: "",
        rollNumber: "",
        quantity: "",
        squareMeters: "",
        expirationDate: "",
        location: "",
        notes: "",
      });
      setSelectedFabric(data);
      setPrintDialogOpen(true);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to receive fabric", variant: "destructive" });
    },
  });

  const buildPacketMutation = useMutation({
    mutationFn: async (data: typeof packetForm) => {
      return apiRequest('/api/cutting-table/packet-sessions', {
        method: 'POST',
        body: JSON.stringify({
          packetType: data.packetType,
          packetsBuilt: parseInt(data.quantity) || 1,
          fabricLots: data.scannedFabrics,
          createdAt: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Packet session recorded with traceability" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/stock-levels'] });
      setPacketForm({ packetType: "", quantity: "", scannedFabrics: [] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record packet session", variant: "destructive" });
    },
  });

  const handleScanBarcode = () => {
    if (scannedBarcode) {
      setPacketForm(prev => ({
        ...prev,
        scannedFabrics: [...prev.scannedFabrics, scannedBarcode],
      }));
      toast({ title: "Scanned", description: `Fabric ${scannedBarcode} added to packet` });
      setScannedBarcode("");
    }
  };

  const handlePrintLabel = async (fabric: FabricInventoryItem) => {
    try {
      const response = await fetch('/api/cutting-table/print-fabric-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fabricId: fabric.id,
          barcodeValue: fabric.barcodeValue,
          fabricType: fabric.fabricType,
          lotNumber: fabric.lotNumber,
          batchNumber: fabric.batchNumber,
          rollNumber: fabric.rollNumber,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.barcodeImage) {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(`
              <html>
                <head><title>Fabric Label</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; }
                  .label { border: 2px solid #000; padding: 15px; width: 300px; }
                  .barcode { text-align: center; margin: 10px 0; }
                  .info { font-size: 12px; margin: 5px 0; }
                  .type { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
                </style>
                </head>
                <body>
                  <div class="label">
                    <div class="type">${fabric.fabricType}</div>
                    <div class="barcode"><img src="${data.barcodeImage}" alt="barcode" /></div>
                    <div class="info"><strong>Lot:</strong> ${fabric.lotNumber || 'N/A'}</div>
                    <div class="info"><strong>Batch:</strong> ${fabric.batchNumber || 'N/A'}</div>
                    <div class="info"><strong>Roll:</strong> ${fabric.rollNumber || 'N/A'}</div>
                    <div class="info"><strong>Location:</strong> ${fabric.location || 'N/A'}</div>
                  </div>
                  <script>window.print();</script>
                </body>
              </html>
            `);
            printWindow.document.close();
          }
        }
        toast({ title: "Success", description: "Label sent to printer" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to print label", variant: "destructive" });
    }
  };

  const cfShortfall = Math.max(0, STOCK_TARGETS.carbon_fiber - (currentStock.carbon_fiber || 0));
  const fgShortfall = Math.max(0, STOCK_TARGETS.fiberglass - (currentStock.fiberglass || 0));

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="cutting-table-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cutting Table Dashboard</h1>
          <p className="text-muted-foreground">Fabric receiving, packet building, and stock management</p>
        </div>
        <Button variant="outline" onClick={() => refetchFabric()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-cf-stock">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Carbon Fiber Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{currentStock.carbon_fiber || 0}</div>
            <p className="text-xs text-muted-foreground">Target: {STOCK_TARGETS.carbon_fiber}</p>
            {cfShortfall > 0 && (
              <Badge variant="destructive" className="mt-2">Need {cfShortfall} more</Badge>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-fg-stock">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Fiberglass Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{currentStock.fiberglass || 0}</div>
            <p className="text-xs text-muted-foreground">Target: {STOCK_TARGETS.fiberglass}</p>
            {fgShortfall > 0 && (
              <Badge variant="destructive" className="mt-2">Need {fgShortfall} more</Badge>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-weekly-cf">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              This Week - CF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{weeklyNeeds.carbon_fiber}</div>
            <p className="text-xs text-muted-foreground">From P1 Schedule</p>
          </CardContent>
        </Card>

        <Card data-testid="card-weekly-fg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              This Week - FG
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{weeklyNeeds.fiberglass}</div>
            <p className="text-xs text-muted-foreground">From P1 Schedule</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Target className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="receiving" data-testid="tab-receiving">
            <Plus className="h-4 w-4 mr-2" />
            Receive Fabric
          </TabsTrigger>
          <TabsTrigger value="packets" data-testid="tab-packets">
            <Layers className="h-4 w-4 mr-2" />
            Build Packets
          </TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <Package className="h-4 w-4 mr-2" />
            Fabric Inventory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Packet Production Targets
                </CardTitle>
                <CardDescription>Maintain stock levels based on P1 layup schedule</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <div>
                    <div className="font-semibold">Carbon Fiber Packets</div>
                    <div className="text-sm text-muted-foreground">Target: Keep 400 on hand</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{currentStock.carbon_fiber || 0} / 400</div>
                    {cfShortfall > 0 ? (
                      <Badge variant="destructive">Build {cfShortfall}</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-600">On Target</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                  <div>
                    <div className="font-semibold">Fiberglass Packets</div>
                    <div className="text-sm text-muted-foreground">Target: Keep 40 on hand</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{currentStock.fiberglass || 0} / 40</div>
                    {fgShortfall > 0 ? (
                      <Badge variant="destructive">Build {fgShortfall}</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-600">On Target</Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  This Week's Layup Requirements
                </CardTitle>
                <CardDescription>Packets needed based on P1 schedule</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                    <span className="font-medium">Carbon Fiber Orders</span>
                  </div>
                  <div className="text-xl font-bold">{weeklyNeeds.carbon_fiber}</div>
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-amber-600"></div>
                    <span className="font-medium">Fiberglass Orders</span>
                  </div>
                  <div className="text-xl font-bold">{weeklyNeeds.fiberglass}</div>
                </div>
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    Packet needs are calculated from the P1 Layup Schedule for this week.
                    Build packets to maintain target stock levels.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="receiving" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Receive Fabric into Inventory
              </CardTitle>
              <CardDescription>
                Add new fabric with full traceability (lot, batch, roll numbers)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fabricType">Fabric Type *</Label>
                    <Select
                      value={receivingForm.fabricType}
                      onValueChange={(v) => setReceivingForm({ ...receivingForm, fabricType: v })}
                    >
                      <SelectTrigger id="fabricType" data-testid="select-fabric-type">
                        <SelectValue placeholder="Select fabric type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Carbon Fiber">Carbon Fiber</SelectItem>
                        <SelectItem value="Fiberglass">Fiberglass</SelectItem>
                        <SelectItem value="Primtex">Primtex</SelectItem>
                        <SelectItem value="Kevlar">Kevlar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="lotNumber">Lot Number *</Label>
                      <Input
                        id="lotNumber"
                        placeholder="LOT-2024-001"
                        value={receivingForm.lotNumber}
                        onChange={(e) => setReceivingForm({ ...receivingForm, lotNumber: e.target.value })}
                        data-testid="input-lot-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="batchNumber">Batch Number</Label>
                      <Input
                        id="batchNumber"
                        placeholder="B001"
                        value={receivingForm.batchNumber}
                        onChange={(e) => setReceivingForm({ ...receivingForm, batchNumber: e.target.value })}
                        data-testid="input-batch-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rollNumber">Roll Number</Label>
                      <Input
                        id="rollNumber"
                        placeholder="R001"
                        value={receivingForm.rollNumber}
                        onChange={(e) => setReceivingForm({ ...receivingForm, rollNumber: e.target.value })}
                        data-testid="input-roll-number"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity (yards/meters)</Label>
                      <Input
                        id="quantity"
                        type="number"
                        placeholder="100"
                        value={receivingForm.quantity}
                        onChange={(e) => setReceivingForm({ ...receivingForm, quantity: e.target.value })}
                        data-testid="input-quantity"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="squareMeters">Square Meters</Label>
                      <Input
                        id="squareMeters"
                        type="number"
                        step="0.01"
                        placeholder="50.5"
                        value={receivingForm.squareMeters}
                        onChange={(e) => setReceivingForm({ ...receivingForm, squareMeters: e.target.value })}
                        data-testid="input-square-meters"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="expirationDate">Expiration Date</Label>
                    <Input
                      id="expirationDate"
                      type="date"
                      value={receivingForm.expirationDate}
                      onChange={(e) => setReceivingForm({ ...receivingForm, expirationDate: e.target.value })}
                      data-testid="input-expiration"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location">Storage Location</Label>
                    <Input
                      id="location"
                      placeholder="Rack A, Shelf 3"
                      value={receivingForm.location}
                      onChange={(e) => setReceivingForm({ ...receivingForm, location: e.target.value })}
                      data-testid="input-location"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Any additional notes about this fabric..."
                      value={receivingForm.notes}
                      onChange={(e) => setReceivingForm({ ...receivingForm, notes: e.target.value })}
                      data-testid="input-notes"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => receiveFabricMutation.mutate(receivingForm)}
                    disabled={!receivingForm.fabricType || !receivingForm.lotNumber || receiveFabricMutation.isPending}
                    data-testid="button-receive-fabric"
                  >
                    {receiveFabricMutation.isPending ? (
                      <>Processing...</>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Receive Fabric & Print Label
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packets" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Build Packets
                </CardTitle>
                <CardDescription>
                  Scan fabric barcodes to track which fabric goes into each packet
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Packet Type</Label>
                  <Select
                    value={packetForm.packetType}
                    onValueChange={(v) => setPacketForm({ ...packetForm, packetType: v })}
                  >
                    <SelectTrigger data-testid="select-packet-type">
                      <SelectValue placeholder="Select packet type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="carbon_fiber">Carbon Fiber Stock Packet</SelectItem>
                      <SelectItem value="fiberglass">Fiberglass Stock Packet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Number of Packets</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={packetForm.quantity}
                    onChange={(e) => setPacketForm({ ...packetForm, quantity: e.target.value })}
                    data-testid="input-packet-quantity"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Scan className="h-4 w-4" />
                    Scan Fabric Barcode
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Scan or enter barcode..."
                      value={scannedBarcode}
                      onChange={(e) => setScannedBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleScanBarcode()}
                      data-testid="input-scan-barcode"
                    />
                    <Button onClick={handleScanBarcode} variant="secondary" data-testid="button-scan">
                      <Scan className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {packetForm.scannedFabrics.length > 0 && (
                  <div className="space-y-2">
                    <Label>Scanned Fabrics ({packetForm.scannedFabrics.length})</Label>
                    <div className="flex flex-wrap gap-2">
                      {packetForm.scannedFabrics.map((code, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={() => buildPacketMutation.mutate(packetForm)}
                  disabled={!packetForm.packetType || packetForm.scannedFabrics.length === 0 || buildPacketMutation.isPending}
                  data-testid="button-build-packet"
                >
                  {buildPacketMutation.isPending ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Complete Packet & Record Traceability
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Reference</CardTitle>
                <CardDescription>Stock packet building workflow</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold">1</div>
                  <div>
                    <div className="font-medium">Select Packet Type</div>
                    <p className="text-sm text-muted-foreground">Choose Carbon Fiber or Fiberglass</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold">2</div>
                  <div>
                    <div className="font-medium">Scan Fabric Barcodes</div>
                    <p className="text-sm text-muted-foreground">Scan each fabric roll/lot used in the packet</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 font-bold">3</div>
                  <div>
                    <div className="font-medium">Complete Packet</div>
                    <p className="text-sm text-muted-foreground">Record the packet with full traceability to fabric lots</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                    <AlertCircle className="h-4 w-4" />
                    Traceability Required
                  </div>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    Always scan fabric barcodes to maintain lot traceability for quality control.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Fabric Inventory
              </CardTitle>
              <CardDescription>
                View all fabric in stock with lot tracking and print labels
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingFabric ? (
                <div className="text-center py-8 text-muted-foreground">Loading inventory...</div>
              ) : fabricInventory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No fabric in inventory. Use the Receive Fabric tab to add fabric.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fabric Type</TableHead>
                      <TableHead>Lot Number</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricInventory.map((fabric) => (
                      <TableRow key={fabric.id}>
                        <TableCell className="font-medium">{fabric.fabricType || 'Unknown'}</TableCell>
                        <TableCell>{fabric.lotNumber || '-'}</TableCell>
                        <TableCell>{fabric.batchNumber || '-'}</TableCell>
                        <TableCell>{fabric.rollNumber || '-'}</TableCell>
                        <TableCell>{fabric.quantityInStock || 0}</TableCell>
                        <TableCell>{fabric.location || '-'}</TableCell>
                        <TableCell>
                          {fabric.expirationDate 
                            ? new Date(fabric.expirationDate).toLocaleDateString() 
                            : '-'}
                        </TableCell>
                        <TableCell>
                          {fabric.status === 'expired' && (
                            <Badge variant="destructive">Expired</Badge>
                          )}
                          {fabric.status === 'low' && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">Low</Badge>
                          )}
                          {fabric.status === 'available' && (
                            <Badge variant="default" className="bg-green-100 text-green-800">Available</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePrintLabel(fabric)}
                            data-testid={`button-print-label-${fabric.id}`}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Print Label
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fabric Received Successfully</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Fabric has been added to inventory. Would you like to print a barcode label?</p>
            {selectedFabric && (
              <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="text-sm space-y-1">
                  <div><strong>Type:</strong> {selectedFabric.fabricType}</div>
                  <div><strong>Lot:</strong> {selectedFabric.lotNumber}</div>
                  <div><strong>Barcode:</strong> {selectedFabric.barcodeValue}</div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintDialogOpen(false)}>
              Skip
            </Button>
            <Button onClick={() => {
              if (selectedFabric) handlePrintLabel(selectedFabric);
              setPrintDialogOpen(false);
            }}>
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

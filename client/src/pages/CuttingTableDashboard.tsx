import { useState, useRef } from "react";
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
  RefreshCw,
  PlayCircle,
  Clock,
  Factory
} from "lucide-react";
import { BarcodeInputField } from "@/components/BarcodeInputField";

type FabricInventoryItem = {
  id: string;
  fabricType: string;
  fabricPartNumber: string | null;
  nickname: string | null;
  supplierPartNumber: string | null;
  internalControlNumber: string | null;
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

type ManufacturingQueueItem = {
  id: number;
  partNumber: string | null;
  partName: string | null;
  quantityOrdered: number;
  quantityCompleted: number;
  status: string;
  priority: number;
  assignedTo: string | null;
  fabricLot: string | null;
  fabricBatch: string | null;
  fabricRoll: string | null;
  notes: string | null;
  createdAt: string;
  dueDate: string | null;
};

type FabricInventory = {
  id: string;
  barcode: string;
  fabric: string | null;
  source: string | null;
  batchNumber: string | null;
  location: string | null;
  productionLineId: string | null;
  quantity: number;
  conformanceDocumentLink: string | null;
};

const STOCK_TARGETS = {
  carbon_fiber: 400,
  fiberglass: 40,
};

export default function CuttingTableDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedFabric, setSelectedFabric] = useState<FabricInventoryItem | null>(null);

  const [receivingForm, setReceivingForm] = useState({
    fabricType: "",
    fabricPartNumber: "",
    nickname: "",
    supplierPartNumber: "",
    internalControlNumber: "",
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

  const [mfgQueueStatus, setMfgQueueStatus] = useState<string>('ACTIVE');
  const [selectedMfgItem, setSelectedMfgItem] = useState<ManufacturingQueueItem | null>(null);
  const [isProductionDialogOpen, setIsProductionDialogOpen] = useState(false);
  const [quantityCompleted, setQuantityCompleted] = useState('');
  const [fabricBarcode, setFabricBarcode] = useState('');
  const previousFabricBarcode = useRef<string>('');
  const [fabricLot, setFabricLot] = useState('');
  const [fabricBatch, setFabricBatch] = useState('');
  const [fabricRoll, setFabricRoll] = useState('');
  const [materialDetails, setMaterialDetails] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [completedBy, setCompletedBy] = useState('');

  const [productionEntry, setProductionEntry] = useState({
    fabricType: '',
    packetsProduced: '',
    piecesYielded: '',
    fabricSquareMetersUsed: '',
    yieldPerCut: '4',
    wasteFactor: '0.05',
    notes: '',
  });

  const { data: currentUser } = useQuery<{ username: string }>({
    queryKey: ['currentUser'],
  });

  const { data: fabricInventory = [], isLoading: loadingFabric, refetch: refetchFabric } = useQuery<FabricInventoryItem[]>({
    queryKey: ['/api/cutting-table/fabric-inventory-full'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/fabric-inventory');
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((item: any) => ({
        ...item,
        fabricType: item.fabric || item.fabricType,
        fabricPartNumber: item.fabricPartNumber,
        nickname: item.nickname,
        supplierPartNumber: item.supplierPartNumber,
        internalControlNumber: item.internalControlNumber,
        barcodeValue: `FAB-${item.internalControlNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
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

  const { data: fabricItems = [], isLoading: loadingFabricItems } = useQuery<any[]>({
    queryKey: ['/api/cutting-table/fabric-items'],
  });

  const { data: mfgQueueItems = [], isLoading: loadingMfgQueue, refetch: refetchMfgQueue } = useQuery<ManufacturingQueueItem[]>({
    queryKey: ['/api/cutting-table-mfg-queue/cutting-table', mfgQueueStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (mfgQueueStatus && mfgQueueStatus !== 'ALL') {
        params.append('status', mfgQueueStatus);
      }
      return apiRequest(`/api/cutting-table-mfg-queue/cutting-table?${params.toString()}`);
    },
  });

  const { data: scannedFabricInventory } = useQuery<FabricInventory>({
    queryKey: [`/api/cutting-table/fabric-inventory-by-barcode/${fabricBarcode}`],
    enabled: isProductionDialogOpen && !!fabricBarcode && fabricBarcode.length >= 15,
    retry: false,
  });

  const { data: cutRecords = [], refetch: refetchCutRecords } = useQuery<any[]>({
    queryKey: ['/api/cutting-table/cut-records'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/cut-records?limit=50');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ['/api/cutting-table/product-categories'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/product-categories');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const receiveFabricMutation = useMutation({
    mutationFn: async (data: typeof receivingForm) => {
      return apiRequest('/api/cutting-table/fabric-inventory', {
        method: 'POST',
        body: JSON.stringify({
          fabric: data.fabricType,
          fabricPartNumber: data.fabricPartNumber,
          nickname: data.nickname,
          supplierPartNumber: data.supplierPartNumber,
          internalControlNumber: data.internalControlNumber,
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
        fabricPartNumber: "",
        nickname: "",
        supplierPartNumber: "",
        internalControlNumber: "",
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

  const productionEntryMutation = useMutation({
    mutationFn: async (data: typeof productionEntry) => {
      return apiRequest('/api/cutting-table/cut-records', {
        method: 'POST',
        body: JSON.stringify({
          workDate: new Date().toISOString().split('T')[0],
          fabricType: data.fabricType,
          piecesYielded: parseInt(data.piecesYielded) || 0,
          fabricSquareMetersUsed: data.fabricSquareMetersUsed,
          packetsProduced: parseInt(data.packetsProduced) || 0,
          yieldPerCut: parseFloat(data.yieldPerCut) || 4,
          wasteFactor: parseFloat(data.wasteFactor) || 0.05,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Production entry recorded" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/cut-records'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/stock-levels'] });
      setProductionEntry({
        fabricType: '',
        packetsProduced: '',
        piecesYielded: '',
        fabricSquareMetersUsed: '',
        yieldPerCut: '4',
        wasteFactor: '0.05',
        notes: '',
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record production", variant: "destructive" });
    },
  });

  const startItemMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo: currentUser?.username || 'unknown' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/cutting-table-mfg-queue/cutting-table'],
        exact: false 
      });
      toast({
        title: 'Item started',
        description: 'Manufacturing item has been marked as in progress.',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to start item. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const completeItemMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      quantityCompleted: number;
      fabricLot?: string;
      fabricBatch?: string;
      fabricRoll?: string;
      materialDetails?: string;
      completionNotes?: string;
      completedBy?: string;
    }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${data.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/cutting-table-mfg-queue/cutting-table'],
        exact: false 
      });
      setIsProductionDialogOpen(false);
      resetProductionForm();
      
      if (data.isPartialCompletion) {
        toast({
          title: 'Partial production recorded',
          description: `Completed ${data.quantityCompleted} items. ${data.remainingQuantity} remaining in progress.`,
        });
      } else {
        toast({
          title: 'Production completed',
          description: 'All items completed with traceability data.',
        });
      }
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to record production. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const generateLabelsMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: number; quantity: number }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${id}/generate-labels`, {
        method: 'POST',
        body: JSON.stringify({ quantityToLabel: quantity }),
      });
    },
    onSuccess: (data: any) => {
      if (data.labels && data.labels.length > 0) {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (printWindow) {
          const labelsHtml = data.labels.map((label: any) => `
            <div class="label">
              <div class="label-header">AG Composites - Packet Label</div>
              <div class="label-info"><strong>${label.partNumber}</strong></div>
              <div class="label-info">${label.partName}</div>
              ${label.fabricLot ? `<div class="label-info">Lot: ${label.fabricLot}</div>` : ''}
              ${label.fabricBatch ? `<div class="label-info">Batch: ${label.fabricBatch}</div>` : ''}
              ${label.fabricRoll ? `<div class="label-info">Roll: ${label.fabricRoll}</div>` : ''}
              <div class="barcode-container">
                ${label.barcodeImage ? `<img src="${label.barcodeImage}" alt="Barcode" />` : `<div class="barcode-text">${label.barcodeValue}</div>`}
              </div>
              <div class="item-number">${label.itemId} of ${data.count}</div>
            </div>
          `).join('');

          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Packet Labels</title>
              <style>
                @media print {
                  @page { margin: 0.5in; size: letter; }
                  body { margin: 0; }
                }
                body { font-family: Arial, sans-serif; background: #f5f5f5; padding: 20px; }
                .labels-container {
                  display: grid;
                  grid-template-columns: repeat(2, 4in);
                  gap: 10px;
                  justify-content: center;
                }
                .label {
                  width: 4in;
                  height: 2in;
                  padding: 0.15in;
                  box-sizing: border-box;
                  background: white;
                  border: 1px dashed #ccc;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                  align-items: center;
                  text-align: center;
                }
                .label-header { font-size: 9px; font-weight: bold; margin-bottom: 3px; }
                .label-info { font-size: 10px; margin: 1px 0; }
                .label-info strong { font-size: 12px; }
                .barcode-container { margin: 4px 0; max-width: 3.5in; }
                .barcode-container img { max-width: 100%; height: auto; }
                .item-number { font-size: 8px; color: #666; margin-top: 3px; }
                .print-btn { margin: 20px auto; display: block; padding: 10px 20px; font-size: 16px; cursor: pointer; }
              </style>
            </head>
            <body>
              <button class="print-btn" onclick="window.print()">Print Labels</button>
              <div class="labels-container">${labelsHtml}</div>
            </body>
            </html>
          `);
          printWindow.document.close();
        }
      }
      toast({ title: 'Labels generated', description: `Generated ${data.count} labels` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate labels', variant: 'destructive' });
    },
  });

  const resetProductionForm = () => {
    setQuantityCompleted('');
    setFabricBarcode('');
    setFabricLot('');
    setFabricBatch('');
    setFabricRoll('');
    setMaterialDetails('');
    setCompletionNotes('');
    setCompletedBy('');
    setSelectedMfgItem(null);
  };

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
          internalControlNumber: fabric.internalControlNumber,
          nickname: fabric.nickname,
          supplierPartNumber: fabric.supplierPartNumber,
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
                  .label { border: 2px solid #000; padding: 15px; width: 320px; }
                  .barcode { text-align: center; margin: 10px 0; }
                  .info { font-size: 11px; margin: 4px 0; }
                  .type { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
                  .control-number { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
                  .nickname { font-size: 12px; font-style: italic; margin-bottom: 5px; color: #555; }
                </style>
                </head>
                <body>
                  <div class="label">
                    <div class="control-number">ICN: ${fabric.internalControlNumber || 'N/A'}</div>
                    <div class="type">${fabric.fabricType}</div>
                    ${fabric.nickname ? `<div class="nickname">"${fabric.nickname}"</div>` : ''}
                    <div class="barcode"><img src="${data.barcodeImage}" alt="barcode" /></div>
                    ${fabric.supplierPartNumber ? `<div class="info"><strong>Supplier P/N:</strong> ${fabric.supplierPartNumber}</div>` : ''}
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

  const handleOpenProductionDialog = (item: ManufacturingQueueItem) => {
    setSelectedMfgItem(item);
    setQuantityCompleted(String(item.quantityOrdered - item.quantityCompleted));
    setCompletedBy(currentUser?.username || '');
    if (item.fabricLot) setFabricLot(item.fabricLot);
    if (item.fabricBatch) setFabricBatch(item.fabricBatch);
    if (item.fabricRoll) setFabricRoll(item.fabricRoll);
    setIsProductionDialogOpen(true);
  };

  const handleCompleteProduction = () => {
    if (!selectedMfgItem) return;
    
    const qty = parseInt(quantityCompleted);
    if (isNaN(qty) || qty <= 0) {
      toast({ title: 'Error', description: 'Please enter a valid quantity', variant: 'destructive' });
      return;
    }

    completeItemMutation.mutate({
      id: selectedMfgItem.id,
      quantityCompleted: qty,
      fabricLot: fabricLot || undefined,
      fabricBatch: fabricBatch || undefined,
      fabricRoll: fabricRoll || undefined,
      materialDetails: materialDetails || undefined,
      completionNotes: completionNotes || undefined,
      completedBy: completedBy || undefined,
    });
  };

  const cfShortfall = Math.max(0, STOCK_TARGETS.carbon_fiber - (currentStock.carbon_fiber || 0));
  const fgShortfall = Math.max(0, STOCK_TARGETS.fiberglass - (currentStock.fiberglass || 0));

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-600"><PlayCircle className="h-3 w-3 mr-1" />In Progress</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="cutting-table-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cutting Table Dashboard</h1>
          <p className="text-muted-foreground">Fabric receiving, packet building, manufacturing queue, and stock management</p>
        </div>
        <Button variant="outline" onClick={() => { refetchFabric(); refetchMfgQueue(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

        <Card data-testid="card-mfg-queue">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Factory className="h-4 w-4" />
              Active Queue Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{mfgQueueItems.filter(i => i.status !== 'COMPLETED').length}</div>
            <p className="text-xs text-muted-foreground">In Manufacturing Queue</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Target className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="production" data-testid="tab-production">
            <Layers className="h-4 w-4 mr-2" />
            Production
          </TabsTrigger>
          <TabsTrigger value="mfg-queue" data-testid="tab-mfg-queue">
            <Factory className="h-4 w-4 mr-2" />
            Mfg Queue
          </TabsTrigger>
          <TabsTrigger value="receiving" data-testid="tab-receiving">
            <Plus className="h-4 w-4 mr-2" />
            Receive Fabric
          </TabsTrigger>
          <TabsTrigger value="packets" data-testid="tab-packets">
            <Scan className="h-4 w-4 mr-2" />
            Build Packets
          </TabsTrigger>
          <TabsTrigger value="inventory" data-testid="tab-inventory">
            <Package className="h-4 w-4 mr-2" />
            Inventory
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
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="production" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  Record Production Entry
                </CardTitle>
                <CardDescription>
                  Enter cutting yields and fabric usage to track packet production
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fabric Type *</Label>
                  <Select
                    value={productionEntry.fabricType}
                    onValueChange={(v) => setProductionEntry({ ...productionEntry, fabricType: v })}
                  >
                    <SelectTrigger data-testid="select-production-fabric-type">
                      <SelectValue placeholder="Select fabric type" />
                    </SelectTrigger>
                    <SelectContent>
                      {fabricItems.length === 0 ? (
                        <div className="p-2 text-sm text-muted-foreground">No fabric items available</div>
                      ) : (
                        fabricItems.map((item: any) => (
                          <SelectItem 
                            key={item.id} 
                            value={item.fabric || item.agPartNumber || item.name}
                            data-testid={`option-fabric-${item.id}`}
                          >
                            {item.fabric || item.agPartNumber || item.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Packets Produced *</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 25"
                      value={productionEntry.packetsProduced}
                      onChange={(e) => setProductionEntry({ ...productionEntry, packetsProduced: e.target.value })}
                      data-testid="input-packets-produced"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pieces Yielded *</Label>
                    <Input
                      type="number"
                      placeholder="Total pieces cut"
                      value={productionEntry.piecesYielded}
                      onChange={(e) => setProductionEntry({ ...productionEntry, piecesYielded: e.target.value })}
                      data-testid="input-pieces-yielded"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Fabric Used (sq meters) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 15.5"
                    value={productionEntry.fabricSquareMetersUsed}
                    onChange={(e) => setProductionEntry({ ...productionEntry, fabricSquareMetersUsed: e.target.value })}
                    data-testid="input-fabric-sqm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Yield Per Cut</Label>
                    <Input
                      type="number"
                      placeholder="4"
                      value={productionEntry.yieldPerCut}
                      onChange={(e) => setProductionEntry({ ...productionEntry, yieldPerCut: e.target.value })}
                      data-testid="input-yield-per-cut"
                    />
                    <p className="text-xs text-muted-foreground">Pieces per single cut</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Waste Factor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.05"
                      value={productionEntry.wasteFactor}
                      onChange={(e) => setProductionEntry({ ...productionEntry, wasteFactor: e.target.value })}
                      data-testid="input-waste-factor"
                    />
                    <p className="text-xs text-muted-foreground">5% = 0.05</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Any production notes..."
                    value={productionEntry.notes}
                    onChange={(e) => setProductionEntry({ ...productionEntry, notes: e.target.value })}
                    data-testid="input-prod-notes"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => productionEntryMutation.mutate(productionEntry)}
                  disabled={!productionEntry.fabricType || !productionEntry.packetsProduced || !productionEntry.fabricSquareMetersUsed || productionEntryMutation.isPending}
                  data-testid="button-record-production"
                >
                  {productionEntryMutation.isPending ? 'Recording...' : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Record Production & Update Stock
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Yield Estimator
                </CardTitle>
                <CardDescription>Calculate fabric needed based on yield settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Yield per cut:</span>
                    <span className="font-medium">{productionEntry.yieldPerCut || 4} pieces</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Waste factor:</span>
                    <span className="font-medium">{((parseFloat(productionEntry.wasteFactor) || 0.05) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Effective yield:</span>
                    <span className="font-medium">
                      {Math.floor((parseFloat(productionEntry.yieldPerCut) || 4) * (1 - (parseFloat(productionEntry.wasteFactor) || 0.05)))} pieces/cut
                    </span>
                  </div>
                  {productionEntry.piecesYielded && productionEntry.fabricSquareMetersUsed && (
                    <>
                      <div className="border-t pt-3 flex justify-between">
                        <span className="text-sm text-muted-foreground">Efficiency:</span>
                        <span className="font-medium text-green-600">
                          {(parseInt(productionEntry.piecesYielded) / parseFloat(productionEntry.fabricSquareMetersUsed)).toFixed(2)} pieces/sq m
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">To Build Shortfall:</h4>
                  {cfShortfall > 0 && (
                    <div className="flex justify-between text-sm mb-1">
                      <span>Carbon Fiber ({cfShortfall} packets):</span>
                      <span className="font-medium">
                        ~{(cfShortfall * 4 / (parseFloat(productionEntry.yieldPerCut) || 4)).toFixed(0)} cuts needed
                      </span>
                    </div>
                  )}
                  {fgShortfall > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Fiberglass ({fgShortfall} packets):</span>
                      <span className="font-medium">
                        ~{(fgShortfall * 4 / (parseFloat(productionEntry.yieldPerCut) || 4)).toFixed(0)} cuts needed
                      </span>
                    </div>
                  )}
                  {cfShortfall === 0 && fgShortfall === 0 && (
                    <p className="text-sm text-green-600">All stock targets met!</p>
                  )}
                </div>

                <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-blue-700 dark:text-blue-400 mb-2">Production Tips</h4>
                  <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                    <li>• Track fabric lot/batch for traceability</li>
                    <li>• Record all pieces yielded to monitor efficiency</li>
                    <li>• Update waste factor if scrap rate changes</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Production Records</CardTitle>
              <CardDescription>Last 50 cutting table production entries</CardDescription>
            </CardHeader>
            <CardContent>
              {cutRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No production records yet. Use the form above to record production.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Fabric Type</TableHead>
                      <TableHead>Packets</TableHead>
                      <TableHead>Pieces Yielded</TableHead>
                      <TableHead>Fabric Used (sq m)</TableHead>
                      <TableHead>Efficiency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cutRecords.slice(0, 10).map((record: any) => {
                      const efficiency = record.fabricSquareMetersUsed && parseFloat(record.fabricSquareMetersUsed) > 0
                        ? (record.piecesYielded / parseFloat(record.fabricSquareMetersUsed)).toFixed(2)
                        : '-';
                      return (
                        <TableRow key={record.id}>
                          <TableCell>{record.workDate ? new Date(record.workDate).toLocaleDateString() : '-'}</TableCell>
                          <TableCell>{record.fabricType || '-'}</TableCell>
                          <TableCell className="font-medium">{record.packetsProduced || '-'}</TableCell>
                          <TableCell>{record.piecesYielded || 0}</TableCell>
                          <TableCell>{record.fabricSquareMetersUsed || '-'}</TableCell>
                          <TableCell>{efficiency} pcs/sq m</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mfg-queue" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Factory className="h-5 w-5" />
                    Manufacturing Queue
                  </CardTitle>
                  <CardDescription>
                    Cutting table production queue with fabric traceability
                  </CardDescription>
                </div>
                <Select value={mfgQueueStatus} onValueChange={setMfgQueueStatus}>
                  <SelectTrigger className="w-[180px]" data-testid="select-mfg-status">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Items</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingMfgQueue ? (
                <div className="text-center py-8 text-muted-foreground">Loading queue...</div>
              ) : mfgQueueItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items in the manufacturing queue for this status.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Part Name</TableHead>
                      <TableHead>Qty Ordered</TableHead>
                      <TableHead>Qty Completed</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Fabric Lot</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mfgQueueItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.partNumber || '-'}</TableCell>
                        <TableCell>{item.partName || '-'}</TableCell>
                        <TableCell>{item.quantityOrdered}</TableCell>
                        <TableCell>{item.quantityCompleted}</TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>{item.assignedTo || '-'}</TableCell>
                        <TableCell>{item.fabricLot || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {item.status === 'PENDING' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startItemMutation.mutate(item.id)}
                                disabled={startItemMutation.isPending}
                                data-testid={`button-start-${item.id}`}
                              >
                                <PlayCircle className="h-4 w-4 mr-1" />
                                Start
                              </Button>
                            )}
                            {(item.status === 'IN_PROGRESS' || item.status === 'ACTIVE') && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenProductionDialog(item)}
                                  data-testid={`button-complete-${item.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Complete
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => generateLabelsMutation.mutate({ id: item.id, quantity: item.quantityOrdered - item.quantityCompleted })}
                                  disabled={generateLabelsMutation.isPending}
                                  data-testid={`button-labels-${item.id}`}
                                >
                                  <Printer className="h-4 w-4 mr-1" />
                                  Labels
                                </Button>
                              </>
                            )}
                            {item.status === 'COMPLETED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => generateLabelsMutation.mutate({ id: item.id, quantity: item.quantityCompleted })}
                                disabled={generateLabelsMutation.isPending}
                                data-testid={`button-reprint-${item.id}`}
                              >
                                <Printer className="h-4 w-4 mr-1" />
                                Reprint
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receiving" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Receive Fabric into Inventory
              </CardTitle>
              <CardDescription>
                Add new fabric with full traceability (control number, lot, batch, roll)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="fabricType">Fabric Type (Part Number) *</Label>
                    <Select
                      value={receivingForm.fabricType}
                      onValueChange={(v) => {
                        const selectedItem = fabricItems.find((item: any) => 
                          (item.agPartNumber || item.fabric || item.name) === v
                        );
                        setReceivingForm({ 
                          ...receivingForm, 
                          fabricType: v,
                          fabricPartNumber: selectedItem?.agPartNumber || ''
                        });
                      }}
                    >
                      <SelectTrigger id="fabricType" data-testid="select-fabric-type">
                        <SelectValue placeholder="Select fabric type" />
                      </SelectTrigger>
                      <SelectContent>
                        {fabricItems.length === 0 ? (
                          <div className="p-2 text-sm text-muted-foreground">No fabric items available</div>
                        ) : (
                          fabricItems.map((item: any) => (
                            <SelectItem 
                              key={item.id} 
                              value={item.agPartNumber || item.fabric || item.name}
                              data-testid={`option-fabric-${item.id}`}
                            >
                              {item.agPartNumber ? `${item.agPartNumber} - ${item.name || item.fabric}` : (item.fabric || item.name)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="nickname">Nickname (In-House Name)</Label>
                    <Input
                      id="nickname"
                      placeholder="What we call it in the shop"
                      value={receivingForm.nickname}
                      onChange={(e) => setReceivingForm({ ...receivingForm, nickname: e.target.value })}
                      data-testid="input-nickname"
                    />
                    <p className="text-xs text-muted-foreground">The name your team uses for this fabric</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="internalControlNumber">Internal Control Number *</Label>
                      <Input
                        id="internalControlNumber"
                        placeholder="ICN-2024-001"
                        value={receivingForm.internalControlNumber}
                        onChange={(e) => setReceivingForm({ ...receivingForm, internalControlNumber: e.target.value })}
                        data-testid="input-internal-control-number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supplierPartNumber">Supplier Part Number</Label>
                      <Input
                        id="supplierPartNumber"
                        placeholder="SUP-12345"
                        value={receivingForm.supplierPartNumber}
                        onChange={(e) => setReceivingForm({ ...receivingForm, supplierPartNumber: e.target.value })}
                        data-testid="input-supplier-part-number"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                    disabled={!receivingForm.fabricType || !receivingForm.internalControlNumber || receiveFabricMutation.isPending}
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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Internal Control #</TableHead>
                        <TableHead>Fabric Type</TableHead>
                        <TableHead>Nickname</TableHead>
                        <TableHead>Supplier Part #</TableHead>
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
                          <TableCell className="font-medium">{fabric.internalControlNumber || '-'}</TableCell>
                          <TableCell>
                            {fabric.fabricPartNumber ? (
                              <div>
                                <span className="font-medium">{fabric.fabricPartNumber}</span>
                                {fabric.fabricType && <span className="text-muted-foreground ml-1">({fabric.fabricType})</span>}
                              </div>
                            ) : (
                              fabric.fabricType || 'Unknown'
                            )}
                          </TableCell>
                          <TableCell>{fabric.nickname || '-'}</TableCell>
                          <TableCell>{fabric.supplierPartNumber || '-'}</TableCell>
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
                </div>
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
                  <div><strong>Internal Control #:</strong> {selectedFabric.internalControlNumber || '-'}</div>
                  <div><strong>Type:</strong> {selectedFabric.fabricType}</div>
                  {selectedFabric.nickname && <div><strong>Nickname:</strong> {selectedFabric.nickname}</div>}
                  {selectedFabric.supplierPartNumber && <div><strong>Supplier Part #:</strong> {selectedFabric.supplierPartNumber}</div>}
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

      <Dialog open={isProductionDialogOpen} onOpenChange={setIsProductionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Production</DialogTitle>
          </DialogHeader>
          {selectedMfgItem && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                <div className="font-semibold">{selectedMfgItem.partNumber}</div>
                <div className="text-sm text-muted-foreground">{selectedMfgItem.partName}</div>
                <div className="text-sm mt-2">
                  Remaining: {selectedMfgItem.quantityOrdered - selectedMfgItem.quantityCompleted} of {selectedMfgItem.quantityOrdered}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Quantity Completed *</Label>
                <Input
                  type="number"
                  value={quantityCompleted}
                  onChange={(e) => setQuantityCompleted(e.target.value)}
                  placeholder="Enter quantity"
                  data-testid="input-qty-completed"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Scan className="h-4 w-4" />
                  Scan Fabric Barcode (for traceability)
                </Label>
                <BarcodeInputField
                  id="fabric-barcode-scan"
                  value={fabricBarcode}
                  onChange={setFabricBarcode}
                  placeholder="Scan fabric barcode..."
                  data-testid="input-fabric-barcode"
                />
                {scannedFabricInventory && (
                  <div className="text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200">
                    <CheckCircle2 className="h-4 w-4 inline mr-1 text-green-600" />
                    Found: {scannedFabricInventory.fabric} - Lot: {scannedFabricInventory.batchNumber}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-2">
                  <Label>Fabric Lot</Label>
                  <Input
                    value={fabricLot}
                    onChange={(e) => setFabricLot(e.target.value)}
                    placeholder="Lot #"
                    data-testid="input-fabric-lot"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch</Label>
                  <Input
                    value={fabricBatch}
                    onChange={(e) => setFabricBatch(e.target.value)}
                    placeholder="Batch #"
                    data-testid="input-fabric-batch"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Roll</Label>
                  <Input
                    value={fabricRoll}
                    onChange={(e) => setFabricRoll(e.target.value)}
                    placeholder="Roll #"
                    data-testid="input-fabric-roll"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Completed By</Label>
                <Input
                  value={completedBy}
                  onChange={(e) => setCompletedBy(e.target.value)}
                  placeholder="Your name"
                  data-testid="input-completed-by"
                />
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Any notes about this production run..."
                  data-testid="input-completion-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsProductionDialogOpen(false); resetProductionForm(); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCompleteProduction}
              disabled={completeItemMutation.isPending}
            >
              {completeItemMutation.isPending ? 'Saving...' : 'Complete Production'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

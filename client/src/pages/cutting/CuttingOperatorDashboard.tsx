import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Scissors, 
  Package, 
  PlayCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Printer,
  Scan,
  RefreshCw,
  Layers,
  Snowflake,
  Target,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BarcodeInputField } from "@/components/BarcodeInputField";

type FabricInventoryItem = {
  id: string;
  fabricType: string;
  fabricPartNumber: string | null;
  nickname: string | null;
  commonName: string | null;
  supplierPartNumber: string | null;
  internalControlNumber: string | null;
  lotNumber: string | null;
  batchNumber: string | null;
  rollNumber: string;
  quantityInStock: number;
  squareMeters: number;
  receivedDate: string;
  expirationDate: string | null;
  location: string;
  freezerLocation: string | null;
  barcodeValue: string;
  status: 'available' | 'low' | 'expired' | 'expiring';
  lowStockThreshold: number;
  isFifoNext: boolean;
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
  estimatedCuts: number;
  packetBomId: string | null;
};

type PacketBOM = {
  id: string;
  packetType: string;
  partNumber: string;
  yieldPerCut: number;
  squareMetersPerCut: number;
  cuts?: CutDefinition[];
};

type CutDefinition = {
  id: string;
  label: string;
  materialPartNumber: string;
  materialName: string;
  cutsNeeded: number;
  plySchedule?: { plyNumber: number; materialType: string; orientation: string }[];
  assignedParts: { partNumber: string; partDescription: string; partsPerCut: number }[];
};

const getFabricStatus = (
  quantity: number | null | undefined, 
  expirationDate: string | null | undefined,
  lowStockThreshold: number = 10
): 'available' | 'low' | 'expired' | 'expiring' => {
  if (expirationDate) {
    const expDate = new Date(expirationDate);
    const now = new Date();
    if (!isNaN(expDate.getTime())) {
      if (expDate < now) return 'expired';
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      if (expDate < thirtyDaysFromNow) return 'expiring';
    }
  }
  
  const qty = typeof quantity === 'number' ? quantity : null;
  if (qty === null) return 'available';
  if (qty <= lowStockThreshold) return 'low';
  return 'available';
};

export default function CuttingOperatorDashboard() {
  const { toast } = useToast();
  
  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  const [selectedMfgItem, setSelectedMfgItem] = useState<ManufacturingQueueItem | null>(null);
  const [isProductionDialogOpen, setIsProductionDialogOpen] = useState(false);
  const [isCuttingWorkflowOpen, setIsCuttingWorkflowOpen] = useState(false);
  
  const [universalBarcode, setUniversalBarcode] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [productionForm, setProductionForm] = useState({
    quantityCompleted: '',
    fabricBarcode: '',
    rollNumber: '',
    lotNumber: '',
    squareMetersUsed: '',
    completionNotes: '',
    labelQuantity: '',
    depletedRolls: [] as string[],
  });

  const [scannedFabrics, setScannedFabrics] = useState<FabricInventoryItem[]>([]);

  const { data: currentUser } = useQuery<{ username: string }>({
    queryKey: ['currentUser'],
  });

  const { data: packetBOMs = [] } = useQuery<PacketBOM[]>({
    queryKey: ['/api/cutting-table/packet-boms'],
  });

  const { data: fabricInventory = [], isLoading: loadingFabric, refetch: refetchFabric } = useQuery<FabricInventoryItem[]>({
    queryKey: ['/api/cutting-table/fabric-inventory-full'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/fabric-inventory');
      if (!res.ok) return [];
      const data = await res.json();
      
      const sortedByExpiration = [...data].sort((a: any, b: any) => {
        if (!a.expirationDate) return 1;
        if (!b.expirationDate) return -1;
        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
      });
      
      const fifoByType: Record<string, string> = {};
      sortedByExpiration.forEach((item: any) => {
        const fabricType = item.fabricType || item.fabric || item.nickname || 'unknown';
        const squareMeters = parseFloat(item.squareMeters) || 0;
        if (!fifoByType[fabricType] && squareMeters > 0) {
          fifoByType[fabricType] = item.id;
        }
      });
      
      return data.map((item: any) => {
        const fabricType = item.fabricType || item.fabric || item.nickname || 'unknown';
        const squareMeters = parseFloat(item.squareMeters) || 0;
        return {
          ...item,
          fabricType,
          commonName: item.nickname || item.fabricType || item.fabric || 'Unknown',
          barcodeValue: item.barcodeValue || `FAB-${item.internalControlNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
          status: getFabricStatus(squareMeters, item.expirationDate, item.lowStockThreshold || 10),
          isFifoNext: fifoByType[fabricType] === item.id,
          lowStockThreshold: item.lowStockThreshold || 10,
          freezerLocation: item.location || item.freezerLocation,
          squareMeters,
          quantityInStock: squareMeters,
        };
      });
    },
  });

  const { data: mfgQueueItemsRaw = [], isLoading: loadingMfgQueue, refetch: refetchMfgQueue } = useQuery<any[]>({
    queryKey: ['/api/cutting-table-mfg-queue/cutting-table', selectedStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStatus && selectedStatus !== 'ALL') {
        params.append('status', selectedStatus);
      }
      const res = await fetch(`/api/cutting-table-mfg-queue/cutting-table?${params.toString()}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const mfgQueueItems: ManufacturingQueueItem[] = useMemo(() => {
    return mfgQueueItemsRaw.map((item: any) => {
      const quantityOrdered = item.quantityOrdered || item.quantityRequested || 0;
      const quantityCompleted = item.quantityCompleted || 0;
      const remaining = Math.max(0, quantityOrdered - quantityCompleted);
      const matchingBOM = (packetBOMs || []).find((bom: PacketBOM) => 
        bom.partNumber === item.partNumber || bom.id === item.packetBomId
      );
      const yieldPerCut = matchingBOM?.yieldPerCut || 4;
      const estimatedCuts = remaining > 0 ? Math.ceil(remaining / yieldPerCut) : 0;
      return {
        ...item,
        quantityOrdered,
        quantityCompleted,
        estimatedCuts,
        packetBomId: item.packetBomId || matchingBOM?.id,
      };
    });
  }, [mfgQueueItemsRaw, packetBOMs]);

  const fifoSuggestions = useMemo(() => {
    const fifoRolls: Record<string, FabricInventoryItem[]> = {};
    const sortedByExpiration = [...fabricInventory].sort((a, b) => {
      if (!a.expirationDate) return 1;
      if (!b.expirationDate) return -1;
      return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
    });

    sortedByExpiration.forEach(item => {
      const type = item.fabricType || 'unknown';
      if (!fifoRolls[type]) fifoRolls[type] = [];
      if (fifoRolls[type].length < 3 && item.status !== 'expired' && item.squareMeters > 0) {
        fifoRolls[type].push(item);
      }
    });

    return fifoRolls;
  }, [fabricInventory]);

  const startItemMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo: currentUser?.username || 'unknown' }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      toast({ title: 'Started', description: 'Item is now in progress.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to start item.', variant: 'destructive' });
    },
  });

  const completeItemMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      quantityCompleted: number;
      fabricLot?: string;
      completionNotes?: string;
      completedBy?: string;
    }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${data.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      setIsProductionDialogOpen(false);
      resetProductionForm();
      toast({
        title: data.isPartialCompletion ? 'Partial Completion' : 'Completed',
        description: data.isPartialCompletion 
          ? `${data.quantityCompleted} completed. ${data.remainingQuantity} remaining.`
          : 'Production completed with traceability.',
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to complete.', variant: 'destructive' });
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
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>Packet Labels</title>
                <style>
                  body { font-family: Arial, sans-serif; margin: 0; }
                  .label { page-break-after: always; padding: 20px; border: 1px dashed #ccc; margin: 10px; }
                  .label:last-child { page-break-after: auto; }
                  .barcode { margin: 10px 0; }
                  .info { font-size: 12px; margin: 4px 0; }
                  .part-number { font-size: 16px; font-weight: bold; }
                </style>
              </head>
              <body>
                ${data.labels.map((label: any) => `
                  <div class="label">
                    <div class="part-number">${label.partNumber}</div>
                    <div class="info">${label.partName}</div>
                    ${label.barcodeImage ? `<img class="barcode" src="${label.barcodeImage}" alt="barcode" />` : `<div>${label.barcodeValue}</div>`}
                    <div class="info">Lot: ${label.fabricLot || 'N/A'}</div>
                    <div class="info">Roll: ${label.fabricRoll || 'N/A'}</div>
                    <div class="info">Date: ${new Date().toLocaleDateString()}</div>
                  </div>
                `).join('')}
              </body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      }
      toast({ title: 'Labels Generated', description: `${data.count} labels ready to print.` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate labels.', variant: 'destructive' });
    },
  });

  const resetProductionForm = () => {
    setProductionForm({
      quantityCompleted: '',
      fabricBarcode: '',
      rollNumber: '',
      lotNumber: '',
      squareMetersUsed: '',
      completionNotes: '',
      labelQuantity: '',
      depletedRolls: [],
    });
    setScannedFabrics([]);
    setSelectedMfgItem(null);
  };

  const toggleRollDepleted = (rollId: string) => {
    setProductionForm(prev => ({
      ...prev,
      depletedRolls: prev.depletedRolls.includes(rollId)
        ? prev.depletedRolls.filter(id => id !== rollId)
        : [...prev.depletedRolls, rollId]
    }));
  };

  const depleteRollMutation = useMutation({
    mutationFn: async (rollId: string) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${rollId}/deplete`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
    },
  });

  const handleBarcodeScan = (barcode: string) => {
    if (!barcode.trim()) return;
    
    const matchedFabric = fabricInventory.find(f => 
      f.barcodeValue === barcode || 
      f.internalControlNumber === barcode ||
      f.rollNumber === barcode
    );
    
    if (matchedFabric) {
      if (scannedFabrics.find(f => f.id === matchedFabric.id)) {
        toast({ title: "Already Scanned", description: "This fabric roll is already added.", variant: "default" });
        return;
      }
      setScannedFabrics(prev => [...prev, matchedFabric]);
      setProductionForm(prev => ({
        ...prev,
        rollNumber: matchedFabric.rollNumber,
        lotNumber: matchedFabric.lotNumber || matchedFabric.batchNumber || '',
      }));
      toast({
        title: "Fabric Found",
        description: `${matchedFabric.commonName || matchedFabric.fabricType} - Roll ${matchedFabric.rollNumber}`,
      });
    } else {
      toast({
        title: "Not Found",
        description: `No match found for barcode: ${barcode}`,
        variant: "destructive",
      });
    }
    
    setUniversalBarcode("");
  };

  const handleStartCuttingWorkflow = (item: ManufacturingQueueItem) => {
    setSelectedMfgItem(item);
    setIsCuttingWorkflowOpen(true);
    startItemMutation.mutate(item.id);
  };

  const completeWithTraceabilityMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      quantityCompleted: number;
      fabricSources: any[];
      completedBy: string;
      completionNotes?: string;
    }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/${data.id}/complete-with-traceability`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      setIsProductionDialogOpen(false);
      resetProductionForm();
      toast({
        title: data.isPartialCompletion ? 'Partial Completion' : 'Completed',
        description: `${data.createdPackets?.length || 0} packets created with full traceability.`,
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to complete with traceability.', variant: 'destructive' });
    },
  });

  const handleCompleteProduction = () => {
    if (!selectedMfgItem) return;
    
    const qty = parseInt(productionForm.quantityCompleted) || 0;
    if (qty <= 0) {
      toast({ title: "Invalid", description: "Enter a valid quantity.", variant: "destructive" });
      return;
    }

    // Process any depleted rolls
    if (productionForm.depletedRolls.length > 0) {
      productionForm.depletedRolls.forEach(rollId => {
        depleteRollMutation.mutate(rollId);
      });
      toast({
        title: "Rolls Depleted",
        description: `${productionForm.depletedRolls.length} roll(s) marked as depleted.`,
      });
    }

    // Use enhanced completion with full traceability if fabrics were scanned
    if (scannedFabrics.length > 0) {
      const fabricSources = scannedFabrics.map(f => ({
        fabricInventoryId: f.id,
        fabricType: f.fabricType,
        lotNumber: f.lotNumber,
        batchNumber: f.batchNumber,
        rollNumber: f.rollNumber,
        internalControlNumber: f.internalControlNumber,
        expirationDate: f.expirationDate,
        quantityUsed: 1,
        isDepleted: productionForm.depletedRolls.includes(f.id),
      }));

      completeWithTraceabilityMutation.mutate({
        id: selectedMfgItem.id,
        quantityCompleted: qty,
        fabricSources,
        completedBy: currentUser?.username || 'unknown',
        completionNotes: productionForm.completionNotes,
      });
    } else {
      // Fallback to basic completion
      completeItemMutation.mutate({
        id: selectedMfgItem.id,
        quantityCompleted: qty,
        fabricLot: productionForm.lotNumber,
        completionNotes: productionForm.completionNotes,
        completedBy: currentUser?.username || 'unknown',
      });
    }

    if (productionForm.labelQuantity && parseInt(productionForm.labelQuantity) > 0) {
      generateLabelsMutation.mutate({
        id: selectedMfgItem.id,
        quantity: parseInt(productionForm.labelQuantity),
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-500"><Clock className="h-3 w-3 mr-1" />In Progress</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Completed</Badge>;
      case 'PENDING':
        return <Badge variant="outline"><Target className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const matchingBOM = selectedMfgItem?.packetBomId 
    ? packetBOMs.find(b => b.id === selectedMfgItem.packetBomId) 
    : null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">Operator Dashboard</h2>
          <p className="text-muted-foreground">Cutting workflow, fabric selection, and label printing</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-40" data-testid="select-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ALL">All</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { refetchMfgQueue(); refetchFabric(); }} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scan className="h-5 w-5" />
              Barcode Scanner
            </CardTitle>
            <CardDescription>Scan fabric roll or part barcode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <BarcodeInputField
                id="universal-barcode"
                value={universalBarcode}
                onChange={(val) => {
                  setUniversalBarcode(val);
                  if (val && val.length > 5) {
                    handleBarcodeScan(val);
                  }
                }}
                placeholder="Scan or enter barcode..."
                data-testid="input-universal-barcode"
              />
              <Button onClick={() => handleBarcodeScan(universalBarcode)} data-testid="button-scan">
                <Scan className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5" />
              FIFO Fabric Suggestions
            </CardTitle>
            <CardDescription>Recommended rolls by expiration date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {Object.entries(fifoSuggestions).map(([type, rolls]) => (
                <div key={type} className="space-y-1">
                  <div className="text-sm font-medium">{type}</div>
                  <div className="flex flex-wrap gap-1">
                    {rolls.map(roll => (
                      <Badge 
                        key={roll.id} 
                        variant={roll.status === 'expiring' ? 'destructive' : 'secondary'}
                        className="cursor-pointer text-xs"
                        onClick={() => handleBarcodeScan(roll.barcodeValue)}
                        data-testid={`badge-fifo-roll-${roll.id}`}
                      >
                        {roll.rollNumber} - {roll.freezerLocation || 'N/A'}
                        {roll.isFifoNext && <ArrowRight className="h-3 w-3 ml-1" />}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(fifoSuggestions).length === 0 && (
                <div className="text-sm text-muted-foreground">No fabric inventory available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Scheduled Packets
          </CardTitle>
          <CardDescription>Manufacturing queue items for cutting table</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingMfgQueue ? (
            <div className="text-center py-8 text-muted-foreground">Loading queue...</div>
          ) : mfgQueueItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items in the queue. Schedule packets from the Weekly Schedule page.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Ordered</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Est. Cuts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mfgQueueItems.map((item) => (
                  <TableRow key={item.id} data-testid={`row-mfg-item-${item.id}`}>
                    <TableCell className="font-medium">{item.partNumber || '-'}</TableCell>
                    <TableCell>{item.partName || '-'}</TableCell>
                    <TableCell>{item.quantityOrdered}</TableCell>
                    <TableCell>
                      <span className={cn(
                        item.quantityCompleted >= item.quantityOrdered ? 'text-green-600' : ''
                      )}>
                        {item.quantityCompleted}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.estimatedCuts}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>
                      <Badge variant={item.priority >= 80 ? "destructive" : item.priority >= 60 ? "default" : "outline"}>
                        {item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.status === 'PENDING' && (
                          <Button 
                            size="sm" 
                            onClick={() => handleStartCuttingWorkflow(item)}
                            data-testid={`button-start-${item.id}`}
                          >
                            <PlayCircle className="h-4 w-4 mr-1" />
                            Start
                          </Button>
                        )}
                        {item.status === 'IN_PROGRESS' && (
                          <Button 
                            size="sm" 
                            variant="secondary"
                            onClick={() => { setSelectedMfgItem(item); setIsProductionDialogOpen(true); }}
                            data-testid={`button-complete-${item.id}`}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Complete
                          </Button>
                        )}
                        {item.status === 'COMPLETED' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => generateLabelsMutation.mutate({ id: item.id, quantity: item.quantityCompleted || 1 })}
                            data-testid={`button-print-${item.id}`}
                          >
                            <Printer className="h-4 w-4 mr-1" />
                            Labels
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

      <Dialog open={isCuttingWorkflowOpen} onOpenChange={setIsCuttingWorkflowOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Cutting Workflow: {selectedMfgItem?.partNumber}
            </DialogTitle>
            <DialogDescription>
              Follow the ply schedule and cut suggestions below
            </DialogDescription>
          </DialogHeader>

          {matchingBOM && matchingBOM.cuts && matchingBOM.cuts.length > 0 ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Cut Suggestions</h4>
                <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                  <div>
                    <Label className="text-muted-foreground">Yield Per Cut</Label>
                    <p className="font-medium">{matchingBOM.yieldPerCut} pieces</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Sq Meters/Cut</Label>
                    <p className="font-medium">{matchingBOM.squareMetersPerCut} m²</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Estimated Cuts</Label>
                    <p className="font-medium">{selectedMfgItem?.estimatedCuts}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium">Ply Schedule</h4>
                {matchingBOM.cuts.map((cut, idx) => (
                  <div key={cut.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{cut.label}</span>
                      <Badge>{cut.cutsNeeded} cut(s)</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Material: {cut.materialName || cut.materialPartNumber}
                    </p>
                    {cut.plySchedule && cut.plySchedule.length > 0 && (
                      <div className="bg-background rounded p-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">Ply #</TableHead>
                              <TableHead>Material</TableHead>
                              <TableHead className="w-24">Orientation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cut.plySchedule.map((ply) => (
                              <TableRow key={ply.plyNumber}>
                                <TableCell className="font-medium">{ply.plyNumber}</TableCell>
                                <TableCell>{ply.materialType}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{ply.orientation}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              No BOM configured for this packet. Create a BOM to see cut suggestions.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCuttingWorkflowOpen(false)} data-testid="button-close-workflow">
              Close
            </Button>
            <Button 
              onClick={() => { 
                setIsCuttingWorkflowOpen(false); 
                setIsProductionDialogOpen(true); 
              }}
              data-testid="button-proceed-complete"
            >
              Proceed to Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProductionDialogOpen} onOpenChange={setIsProductionDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Complete Production: {selectedMfgItem?.partNumber}</DialogTitle>
            <DialogDescription>
              Enter completion details with fabric traceability
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity Completed</Label>
                <Input
                  type="number"
                  value={productionForm.quantityCompleted}
                  onChange={(e) => setProductionForm(prev => ({ ...prev, quantityCompleted: e.target.value }))}
                  placeholder="Enter quantity"
                  data-testid="input-quantity-completed"
                />
                <p className="text-xs text-muted-foreground">
                  Remaining: {(selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Labels to Print</Label>
                <Input
                  type="number"
                  value={productionForm.labelQuantity}
                  onChange={(e) => setProductionForm(prev => ({ ...prev, labelQuantity: e.target.value }))}
                  placeholder="0 for none"
                  data-testid="input-label-quantity"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Scan Fabric Rolls</Label>
              <div className="flex gap-2">
                <BarcodeInputField
                  id="fabric-barcode"
                  value={productionForm.fabricBarcode}
                  onChange={(val: string) => { 
                    setProductionForm(prev => ({ ...prev, fabricBarcode: val }));
                    if (val && val.length > 5) {
                      handleBarcodeScan(val); 
                      setProductionForm(prev => ({ ...prev, fabricBarcode: '' })); 
                    }
                  }}
                  placeholder="Scan fabric barcode..."
                  data-testid="input-fabric-barcode"
                />
              </div>
              {scannedFabrics.length > 0 && (
                <div className="space-y-2 mt-2">
                  <p className="text-sm font-medium">Scanned Rolls:</p>
                  {scannedFabrics.map(fabric => (
                    <div key={fabric.id} className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {fabric.fabricType}
                        </Badge>
                        <span className="text-sm">Roll {fabric.rollNumber}</span>
                        <span className="text-xs text-muted-foreground">(Lot: {fabric.lotNumber || fabric.batchNumber || 'N/A'})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={productionForm.depletedRolls.includes(fabric.id)}
                            onChange={() => toggleRollDepleted(fabric.id)}
                            className="rounded border-gray-300"
                            data-testid={`checkbox-depleted-${fabric.id}`}
                          />
                          <span className={productionForm.depletedRolls.includes(fabric.id) ? "text-red-500 font-medium" : ""}>
                            Roll Depleted
                          </span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Completion Notes</Label>
              <Textarea
                value={productionForm.completionNotes}
                onChange={(e) => setProductionForm(prev => ({ ...prev, completionNotes: e.target.value }))}
                placeholder="Any notes about this production run..."
                rows={3}
                data-testid="input-completion-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsProductionDialogOpen(false); resetProductionForm(); }} data-testid="button-cancel-complete">
              Cancel
            </Button>
            <Button 
              onClick={handleCompleteProduction} 
              disabled={completeItemMutation.isPending}
              data-testid="button-submit-complete"
            >
              {completeItemMutation.isPending ? 'Completing...' : 'Complete Production'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

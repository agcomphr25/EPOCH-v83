import { useState, useRef, useEffect, useMemo } from "react";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { 
  Scissors, 
  Package, 
  Calendar,
  PlayCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Printer,
  Scan,
  Plus,
  RefreshCw,
  Target,
  Layers,
  Factory,
  Edit,
  Trash2,
  ChevronDown,
  ChevronRight,
  Snowflake,
  Search,
  AlertTriangle,
  ArrowRight,
  Box,
  TrendingUp,
  Settings,
  FileText,
  BarChart3,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

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
  conformanceDocumentLink: string | null;
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

type ProductionLine = {
  id: string;
  lineName: string;
  lineNumber: number;
  description: string;
  isActive: boolean;
};

type PacketBOM = {
  id: string;
  packetType: string;
  partNumber: string;
  description: string;
  materials: PacketBOMMaterial[];
  squareMetersPerCut: number;
  yieldPerCut: number;
  createdAt: string;
};

type PacketBOMMaterial = {
  id: string;
  packetBomId: string;
  fabricType: string;
  commonName: string | null;
  quantityNeeded: number;
  rollsRequired: number;
};

type WeeklyGoal = {
  id: string;
  weekDate: string;
  productionLineId: string;
  productCategoryId: string;
  categoryName: string;
  lineName: string;
  quantity: number;
  completedQuantity: number;
  estimatedCuts: number;
  completedCuts: number;
};

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

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

export default function CuttingTableControlCenter() {
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState("run");
  const [currentWeek, setCurrentWeek] = useState(getMondayOfWeek(new Date()));
  const [selectedLine, setSelectedLine] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  
  const [universalBarcode, setUniversalBarcode] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedMfgItem, setSelectedMfgItem] = useState<ManufacturingQueueItem | null>(null);
  const [isProductionDialogOpen, setIsProductionDialogOpen] = useState(false);
  const [quantityCompleted, setQuantityCompleted] = useState('');
  const [fabricBarcode, setFabricBarcode] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  
  const [isReceivingDialogOpen, setIsReceivingDialogOpen] = useState(false);
  const [receivingForm, setReceivingForm] = useState({
    fabricType: "",
    commonName: "",
    fabricPartNumber: "",
    supplierPartNumber: "",
    internalControlNumber: "",
    batchNumber: "",
    rollNumber: "",
    squareMeters: "",
    expirationDate: "",
    freezerLocation: "",
    notes: "",
  });
  
  const [fabricSearchOpen, setFabricSearchOpen] = useState(false);
  const [fabricSearchQuery, setFabricSearchQuery] = useState("");
  const [selectedFabricForThreshold, setSelectedFabricForThreshold] = useState<FabricInventoryItem | null>(null);
  const [isThresholdDialogOpen, setIsThresholdDialogOpen] = useState(false);
  const [newThreshold, setNewThreshold] = useState("");
  
  const [isPacketBuilderOpen, setIsPacketBuilderOpen] = useState(false);
  const [packetBuildForm, setPacketBuildForm] = useState({
    packetBomId: "",
    quantity: "",
    selectedRolls: [] as { rollId: string; rollNumber: string; lotNumber: string; squareMetersUsed: string }[],
    operatorName: "",
    notes: "",
  });
  const [selectedBOM, setSelectedBOM] = useState<PacketBOM | null>(null);

  const { data: currentUser } = useQuery<{ username: string }>({
    queryKey: ['currentUser'],
  });

  const { data: productionLines = [] } = useQuery<ProductionLine[]>({
    queryKey: ['/api/cutting-table/production-lines'],
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
        const type = item.fabric || item.fabricType || 'unknown';
        if (!fifoByType[type] && item.quantityInStock > 0) {
          fifoByType[type] = item.id;
        }
      });
      
      return data.map((item: any) => ({
        ...item,
        fabricType: item.fabric || item.fabricType,
        commonName: item.nickname || item.fabric || item.fabricType,
        barcodeValue: `FAB-${item.internalControlNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
        status: getFabricStatus(item.quantityInStock, item.expirationDate, item.lowStockThreshold || 10),
        isFifoNext: fifoByType[item.fabric || item.fabricType] === item.id,
        lowStockThreshold: item.lowStockThreshold || 10,
        freezerLocation: item.location,
      }));
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

  const { data: weeklyGoalsRaw = [], isLoading: loadingGoals } = useQuery<any[]>({
    queryKey: ['/api/cutting-table/weekly-goals', currentWeek],
    queryFn: async () => {
      const res = await fetch(`/api/cutting-table/weekly-data/by-week?weekDate=${currentWeek}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const weeklyGoals: WeeklyGoal[] = useMemo(() => {
    return weeklyGoalsRaw.map((item: any) => {
      const matchingBOM = (packetBOMs || []).find((bom: PacketBOM) => 
        bom.partNumber === item.categoryName || bom.packetType === item.categoryName
      );
      const yieldPerCut = matchingBOM?.yieldPerCut || 4;
      const quantity = item.quantity || 0;
      return {
        ...item,
        estimatedCuts: quantity > 0 ? Math.ceil(quantity / yieldPerCut) : 0,
        completedCuts: item.completedCuts || 0,
        completedQuantity: item.completedQuantity || 0,
      };
    });
  }, [weeklyGoalsRaw, packetBOMs]);

  const { data: stockLevels = { carbon_fiber: 0, fiberglass: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/stock-levels'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table/stock-levels');
      if (!res.ok) return { carbon_fiber: 0, fiberglass: 0 };
      return res.json();
    },
  });

  const { data: p1ScheduleNeeds = { carbon_fiber: 0, fiberglass: 0 } } = useQuery({
    queryKey: ['/api/cutting-table/p1-schedule-needs'],
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

  const handleUniversalBarcodeScan = (barcode: string) => {
    if (!barcode.trim()) return;
    
    const matchedFabric = fabricInventory.find(f => 
      f.barcodeValue === barcode || 
      f.internalControlNumber === barcode ||
      f.rollNumber === barcode
    );
    
    if (matchedFabric) {
      toast({
        title: "Fabric Found",
        description: `${matchedFabric.commonName || matchedFabric.fabricType} - Roll ${matchedFabric.rollNumber}`,
      });
      setActiveTab("build");
      return;
    }
    
    const matchedQueue = mfgQueueItems.find(q => 
      q.partNumber === barcode || 
      q.fabricLot === barcode
    );
    
    if (matchedQueue) {
      setSelectedMfgItem(matchedQueue);
      setIsProductionDialogOpen(true);
      return;
    }
    
    toast({
      title: "Not Found",
      description: `No match found for barcode: ${barcode}`,
      variant: "destructive",
    });
    
    setUniversalBarcode("");
  };

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
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-goals'] });
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

  const receiveFabricMutation = useMutation({
    mutationFn: async (data: typeof receivingForm) => {
      return apiRequest('/api/cutting-table/fabric-inventory', {
        method: 'POST',
        body: JSON.stringify({
          fabric: data.fabricType,
          nickname: data.commonName,
          fabricPartNumber: data.fabricPartNumber,
          supplierPartNumber: data.supplierPartNumber,
          internalControlNumber: data.internalControlNumber,
          batchNumber: data.batchNumber,
          rollNumber: data.rollNumber,
          quantityInStock: 1,
          squareMeters: data.squareMeters || '0',
          expirationDate: data.expirationDate || null,
          location: data.freezerLocation,
          notes: data.notes,
          receivedDate: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Received", description: "Fabric added and assigned to freezer location." });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      setIsReceivingDialogOpen(false);
      setReceivingForm({
        fabricType: "",
        commonName: "",
        fabricPartNumber: "",
        supplierPartNumber: "",
        internalControlNumber: "",
        batchNumber: "",
        rollNumber: "",
        squareMeters: "",
        expirationDate: "",
        freezerLocation: "",
        notes: "",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to receive fabric.", variant: "destructive" });
    },
  });

  const updateThresholdMutation = useMutation({
    mutationFn: async ({ id, threshold }: { id: string; threshold: number }) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ lowStockThreshold: threshold }),
      });
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Threshold updated successfully." });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      setIsThresholdDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update threshold.", variant: "destructive" });
    },
  });

  const recordCutMutation = useMutation({
    mutationFn: async (data: {
      packetBomId: string;
      fabricInventoryId: string;
      squareMetersUsed: number;
      piecesYielded: number;
      rollNumber: string;
      lotNumber: string;
      operatorName?: string;
      notes?: string;
    }) => {
      return apiRequest(`/api/cutting-table/packet-boms/${data.packetBomId}/cuts`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      toast({ title: "Cut Recorded", description: "Fabric cut and traceability logged." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record cut.", variant: "destructive" });
    },
  });

  const buildPacketMutation = useMutation({
    mutationFn: async () => {
      if (!selectedBOM || packetBuildForm.selectedRolls.length === 0) {
        throw new Error('BOM and rolls required');
      }

      const results = [];
      for (const roll of packetBuildForm.selectedRolls) {
        const result = await apiRequest(`/api/cutting-table/packet-boms/${selectedBOM.id}/cuts`, {
          method: 'POST',
          body: JSON.stringify({
            fabricInventoryId: roll.rollId,
            squareMetersUsed: parseFloat(roll.squareMetersUsed) || selectedBOM.squareMetersPerCut,
            piecesYielded: selectedBOM.yieldPerCut || 4,
            rollNumber: roll.rollNumber,
            lotNumber: roll.lotNumber,
            operatorName: packetBuildForm.operatorName || currentUser?.username || 'unknown',
            notes: packetBuildForm.notes,
          }),
        });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      setIsPacketBuilderOpen(false);
      setPacketBuildForm({
        packetBomId: "",
        quantity: "",
        selectedRolls: [],
        operatorName: "",
        notes: "",
      });
      setSelectedBOM(null);
      toast({ title: "Packets Built", description: "Cuts recorded with full traceability." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to build packets.", variant: "destructive" });
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
                @page { size: 4in 2in; margin: 0; }
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                .label {
                  width: 4in; height: 2in; padding: 0.25in;
                  box-sizing: border-box; page-break-after: always;
                  border: 1px solid #000;
                }
                .label-header { font-size: 10pt; font-weight: bold; margin-bottom: 0.1in; }
                .label-info { font-size: 9pt; margin: 0.05in 0; }
                .barcode-container { margin-top: 0.1in; text-align: center; }
                .barcode-container img { max-width: 100%; height: 0.5in; }
                .barcode-text { font-family: monospace; font-size: 12pt; }
                .item-number { font-size: 8pt; text-align: right; margin-top: 0.1in; }
              </style>
            </head>
            <body>${labelsHtml}</body>
            </html>
          `);
          printWindow.document.close();
          printWindow.print();
        }
      }
      toast({ title: "Labels Generated", description: `${data.count} labels ready to print.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate labels.", variant: "destructive" });
    },
  });

  const resetProductionForm = () => {
    setQuantityCompleted('');
    setFabricBarcode('');
    setCompletionNotes('');
    setSelectedMfgItem(null);
  };

  const handleCompleteProduction = () => {
    if (!selectedMfgItem) return;
    
    completeItemMutation.mutate({
      id: selectedMfgItem.id,
      quantityCompleted: parseInt(quantityCompleted) || 0,
      fabricLot: fabricBarcode,
      completionNotes,
      completedBy: currentUser?.username || 'unknown',
    });
  };

  const previousWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() - 7);
    setCurrentWeek(d.toISOString().split('T')[0]);
  };

  const nextWeek = () => {
    const d = new Date(currentWeek);
    d.setDate(d.getDate() + 7);
    setCurrentWeek(d.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setCurrentWeek(getMondayOfWeek(new Date()));
  };

  const getEstimatedCutsFromBOM = (quantity: number, partNumber?: string | null): number => {
    if (!partNumber) return Math.ceil(quantity / 4);
    
    const matchingBOM = packetBOMs.find(bom => 
      bom.partNumber === partNumber || bom.packetType === partNumber
    );
    
    if (matchingBOM) {
      const yieldPerCut = matchingBOM.yieldPerCut || 4;
      return Math.ceil(quantity / yieldPerCut);
    }
    
    return Math.ceil(quantity / 4);
  };

  const addRollToPacketBuild = (fabric: FabricInventoryItem) => {
    if (packetBuildForm.selectedRolls.find(r => r.rollId === fabric.id)) return;
    
    setPacketBuildForm(prev => ({
      ...prev,
      selectedRolls: [...prev.selectedRolls, {
        rollId: fabric.id,
        rollNumber: fabric.rollNumber,
        lotNumber: fabric.lotNumber || fabric.batchNumber || '',
        squareMetersUsed: selectedBOM?.squareMetersPerCut?.toString() || fabric.squareMeters.toString(),
      }],
    }));
  };

  const removeRollFromPacketBuild = (rollId: string) => {
    setPacketBuildForm(prev => ({
      ...prev,
      selectedRolls: prev.selectedRolls.filter(r => r.rollId !== rollId),
    }));
  };

  const groupedFabricByType = fabricInventory.reduce((acc, item) => {
    const type = item.commonName || item.fabricType || 'Unknown';
    if (!acc[type]) {
      acc[type] = { items: [], totalRolls: 0, fifoNext: null as FabricInventoryItem | null };
    }
    acc[type].items.push(item);
    acc[type].totalRolls += 1;
    if (item.isFifoNext) {
      acc[type].fifoNext = item;
    }
    return acc;
  }, {} as Record<string, { items: FabricInventoryItem[]; totalRolls: number; fifoNext: FabricInventoryItem | null }>);

  const filteredFabricGroups = Object.entries(groupedFabricByType).filter(([name]) =>
    name.toLowerCase().includes(fabricSearchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
      PENDING: { variant: 'secondary', icon: Clock },
      ACTIVE: { variant: 'default', icon: PlayCircle },
      IN_PROGRESS: { variant: 'default', icon: PlayCircle },
      COMPLETED: { variant: 'outline', icon: CheckCircle2 },
      CANCELLED: { variant: 'destructive', icon: AlertCircle },
    };

    const config = statusConfig[status] || { variant: 'secondary' as const, icon: Clock };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const renderRunTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Label>Status Filter:</Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => refetchMfgQueue()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loadingMfgQueue ? (
        <div className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Loading queue...</div>
        </div>
      ) : mfgQueueItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-48">
            <Scissors className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No items in queue</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {mfgQueueItems.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow" data-testid={`queue-item-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">{item.partName || 'Unknown Part'}</span>
                      {getStatusBadge(item.status)}
                      {item.priority <= 20 && (
                        <Badge variant="destructive" className="text-xs">High Priority</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Part #: {item.partNumber || 'N/A'} | 
                      Qty: {item.quantityCompleted}/{item.quantityOrdered} |
                      Est. Cuts: {item.estimatedCuts}
                    </div>
                    {item.dueDate && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Due: {new Date(item.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'PENDING' && (
                      <Button
                        size="sm"
                        onClick={() => startItemMutation.mutate(item.id)}
                        disabled={startItemMutation.isPending}
                        data-testid={`btn-start-${item.id}`}
                      >
                        <PlayCircle className="h-4 w-4 mr-1" />
                        Start
                      </Button>
                    )}
                    {(item.status === 'ACTIVE' || item.status === 'IN_PROGRESS') && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedMfgItem(item);
                            setIsProductionDialogOpen(true);
                          }}
                          data-testid={`btn-complete-${item.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateLabelsMutation.mutate({ 
                            id: item.id, 
                            quantity: item.quantityOrdered - item.quantityCompleted 
                          })}
                          disabled={generateLabelsMutation.isPending}
                          data-testid={`btn-labels-${item.id}`}
                        >
                          <Printer className="h-4 w-4 mr-1" />
                          Labels
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderBuildTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Fabric Inventory
              </CardTitle>
              <Button size="sm" onClick={() => setIsReceivingDialogOpen(true)} data-testid="btn-receive-fabric">
                <Plus className="h-4 w-4 mr-1" />
                Receive Fabric
              </Button>
            </div>
            <CardDescription>Search by common name, FIFO next roll highlighted</CardDescription>
          </CardHeader>
          <CardContent>
            <Popover open={fabricSearchOpen} onOpenChange={setFabricSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={fabricSearchOpen}
                  className="w-full justify-between"
                  data-testid="fabric-search-trigger"
                >
                  <span className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    {fabricSearchQuery || "Search fabric by common name..."}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command>
                  <CommandInput 
                    placeholder="Search fabric..." 
                    value={fabricSearchQuery}
                    onValueChange={setFabricSearchQuery}
                  />
                  <CommandList>
                    <CommandEmpty>No fabric found.</CommandEmpty>
                    <CommandGroup heading="Fabric Types">
                      {filteredFabricGroups.map(([name, group]) => (
                        <CommandItem
                          key={name}
                          onSelect={() => {
                            setFabricSearchQuery(name);
                            setFabricSearchOpen(false);
                          }}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span>{name}</span>
                            <Badge variant="outline" className="text-xs">
                              {group.totalRolls} rolls
                            </Badge>
                          </div>
                          {group.fifoNext && (
                            <Badge variant="secondary" className="text-xs">
                              FIFO: Roll {group.fifoNext.rollNumber}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto">
              {(fabricSearchQuery ? 
                fabricInventory.filter(f => 
                  (f.commonName || f.fabricType || '').toLowerCase().includes(fabricSearchQuery.toLowerCase())
                ) : 
                fabricInventory.slice(0, 10)
              ).map((fabric) => (
                <div
                  key={fabric.id}
                  className={cn(
                    "p-3 rounded-lg border",
                    fabric.isFifoNext && "border-green-500 bg-green-50 dark:bg-green-950",
                    fabric.status === 'low' && "border-yellow-500 bg-yellow-50 dark:bg-yellow-950",
                    fabric.status === 'expired' && "border-red-500 bg-red-50 dark:bg-red-950"
                  )}
                  data-testid={`fabric-item-${fabric.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{fabric.commonName || fabric.fabricType}</span>
                        {fabric.isFifoNext && (
                          <Badge variant="default" className="text-xs bg-green-600">
                            FIFO Next
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Roll: {fabric.rollNumber} | {fabric.squareMeters} m²
                      </div>
                      {fabric.freezerLocation && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Snowflake className="h-3 w-3" />
                          {fabric.freezerLocation}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedFabricForThreshold(fabric);
                          setNewThreshold(fabric.lowStockThreshold.toString());
                          setIsThresholdDialogOpen(true);
                        }}
                        data-testid={`btn-threshold-${fabric.id}`}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Manufacturing Queue
              </CardTitle>
            </div>
            <CardDescription>Items requiring cutting</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {mfgQueueItems.filter(i => i.status !== 'COMPLETED').slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    setSelectedMfgItem(item);
                    setActiveTab("run");
                  }}
                  data-testid={`mfg-queue-item-${item.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{item.partName}</span>
                      <div className="text-sm text-muted-foreground">
                        {item.quantityCompleted}/{item.quantityOrdered} | Est. {item.estimatedCuts} cuts
                      </div>
                    </div>
                    {getStatusBadge(item.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Packet Builder
            </CardTitle>
            <Button size="sm" onClick={() => setIsPacketBuilderOpen(true)} data-testid="btn-build-packet">
              <Plus className="h-4 w-4 mr-1" />
              Build Packets
            </Button>
          </div>
          <CardDescription>Build packets with multi-roll support</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold text-blue-600">{stockLevels.carbon_fiber || 0}</div>
              <div className="text-sm text-muted-foreground">Carbon Fiber Packets</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-600">{stockLevels.fiberglass || 0}</div>
              <div className="text-sm text-muted-foreground">Fiberglass Packets</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="text-2xl font-bold text-purple-600">{fabricInventory.length}</div>
              <div className="text-sm text-muted-foreground">Fabric Rolls</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-orange-50 dark:bg-orange-950">
              <div className="text-2xl font-bold text-orange-600">
                {mfgQueueItems.filter(i => i.status === 'ACTIVE' || i.status === 'IN_PROGRESS').length}
              </div>
              <div className="text-sm text-muted-foreground">In Progress</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderPlanTab = () => {
    const totalGoalPackets = weeklyGoals.reduce((sum, g) => sum + g.quantity, 0);
    const totalCompleted = weeklyGoals.reduce((sum, g) => sum + g.completedQuantity, 0);
    const totalEstimatedCuts = weeklyGoals.reduce((sum, g) => sum + g.estimatedCuts, 0);
    const totalCompletedCuts = weeklyGoals.reduce((sum, g) => sum + g.completedCuts, 0);
    const progressPercent = totalGoalPackets > 0 ? Math.round((totalCompleted / totalGoalPackets) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button onClick={previousWeek} variant="outline" size="sm" data-testid="btn-prev-week">
              ← Previous
            </Button>
            <span className="font-medium">Week of {currentWeek}</span>
            <Button onClick={nextWeek} variant="outline" size="sm" data-testid="btn-next-week">
              Next →
            </Button>
            <Button onClick={goToToday} variant="outline" size="sm" data-testid="btn-today">
              Today
            </Button>
          </div>
          <Select value={selectedLine} onValueChange={setSelectedLine}>
            <SelectTrigger className="w-[200px]" data-testid="select-line-filter">
              <SelectValue placeholder="All Lines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lines</SelectItem>
              {productionLines.map((line) => (
                <SelectItem key={line.id} value={line.id}>
                  {line.lineName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Goal</p>
                  <p className="text-2xl font-bold">{totalGoalPackets}</p>
                </div>
                <Target className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold">{totalCompleted}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Est. Cuts</p>
                  <p className="text-2xl font-bold">{totalEstimatedCuts}</p>
                </div>
                <Scissors className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Progress</p>
                  <p className="text-2xl font-bold">{progressPercent}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              P1 Layup Schedule - Packets Needed This Week
            </CardTitle>
            <CardDescription>
              Calculated from the P1 Layup Schedule based on scheduled orders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex items-center justify-between p-4 rounded-lg bg-white dark:bg-slate-900 border">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-blue-600"></div>
                  <div>
                    <p className="font-medium">Carbon Fiber Packets</p>
                    <p className="text-sm text-muted-foreground">From scheduled CF orders</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-blue-600">{p1ScheduleNeeds.carbon_fiber}</p>
                  <Badge variant={stockLevels.carbon_fiber >= p1ScheduleNeeds.carbon_fiber ? "default" : "destructive"} className="mt-1">
                    {stockLevels.carbon_fiber >= p1ScheduleNeeds.carbon_fiber 
                      ? `Stock OK (${stockLevels.carbon_fiber} on hand)` 
                      : `Need ${p1ScheduleNeeds.carbon_fiber - stockLevels.carbon_fiber} more`}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-white dark:bg-slate-900 border">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full bg-amber-600"></div>
                  <div>
                    <p className="font-medium">Fiberglass Packets</p>
                    <p className="text-sm text-muted-foreground">From scheduled FG orders</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-amber-600">{p1ScheduleNeeds.fiberglass}</p>
                  <Badge variant={stockLevels.fiberglass >= p1ScheduleNeeds.fiberglass ? "default" : "destructive"} className="mt-1">
                    {stockLevels.fiberglass >= p1ScheduleNeeds.fiberglass 
                      ? `Stock OK (${stockLevels.fiberglass} on hand)` 
                      : `Need ${p1ScheduleNeeds.fiberglass - stockLevels.fiberglass} more`}
                  </Badge>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Packet counts are derived from the P1 Layup Scheduler scheduled orders for this week
            </p>
          </CardContent>
        </Card>

        {loadingGoals ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Loading goals...</div>
          </div>
        ) : weeklyGoals.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center h-48">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No production goals for this week</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Weekly Production Goals</CardTitle>
              <CardDescription>Auto-calculated cuts from packet BOMs</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Category</TableHead>
                    <TableHead>Line</TableHead>
                    <TableHead className="text-right">Goal</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Est. Cuts</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyGoals
                    .filter(g => selectedLine === 'all' || g.productionLineId === selectedLine)
                    .map((goal) => {
                      const percent = goal.quantity > 0 
                        ? Math.round((goal.completedQuantity / goal.quantity) * 100) 
                        : 0;
                      return (
                        <TableRow key={goal.id}>
                          <TableCell className="font-medium">{goal.categoryName}</TableCell>
                          <TableCell>{goal.lineName}</TableCell>
                          <TableCell className="text-right">{goal.quantity}</TableCell>
                          <TableCell className="text-right">{goal.completedQuantity}</TableCell>
                          <TableCell className="text-right">{goal.estimatedCuts}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className={cn(
                                    "h-full rounded-full",
                                    percent >= 100 ? "bg-green-500" :
                                    percent >= 50 ? "bg-yellow-500" : "bg-red-500"
                                  )}
                                  style={{ width: `${Math.min(percent, 100)}%` }}
                                />
                              </div>
                              <span className="text-sm">{percent}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Stock vs. Needs Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Carbon Fiber</span>
                  {(stockLevels.carbon_fiber || 0) < totalEstimatedCuts / 2 && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Low
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold">{stockLevels.carbon_fiber || 0} packets</div>
                <div className="text-sm text-muted-foreground">
                  Need ~{Math.ceil(totalEstimatedCuts / 2)} for this week
                </div>
              </div>
              <div className="p-4 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Fiberglass</span>
                  {(stockLevels.fiberglass || 0) < totalEstimatedCuts / 4 && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Low
                    </Badge>
                  )}
                </div>
                <div className="text-2xl font-bold">{stockLevels.fiberglass || 0} packets</div>
                <div className="text-sm text-muted-foreground">
                  Need ~{Math.ceil(totalEstimatedCuts / 4)} for this week
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="page-title">
            <Scissors className="h-8 w-8" />
            Cutting Table Control Center
          </h1>
          <p className="text-muted-foreground mt-1">
            Unified control for production, materials, and planning
          </p>
        </div>
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="relative">
                <Scan className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  placeholder="Scan barcode or enter search..."
                  value={universalBarcode}
                  onChange={(e) => setUniversalBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUniversalBarcodeScan(universalBarcode);
                    }
                  }}
                  className="pl-10"
                  data-testid="input-universal-barcode"
                />
              </div>
            </div>
            <Button
              onClick={() => handleUniversalBarcodeScan(universalBarcode)}
              variant="secondary"
              data-testid="btn-search-barcode"
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="run" className="flex items-center gap-2" data-testid="tab-run">
            <PlayCircle className="h-4 w-4" />
            Run
          </TabsTrigger>
          <TabsTrigger value="build" className="flex items-center gap-2" data-testid="tab-build">
            <Package className="h-4 w-4" />
            Build
          </TabsTrigger>
          <TabsTrigger value="plan" className="flex items-center gap-2" data-testid="tab-plan">
            <Calendar className="h-4 w-4" />
            Plan
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run">{renderRunTab()}</TabsContent>
        <TabsContent value="build">{renderBuildTab()}</TabsContent>
        <TabsContent value="plan">{renderPlanTab()}</TabsContent>
      </Tabs>

      <Dialog open={isProductionDialogOpen} onOpenChange={setIsProductionDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Production</DialogTitle>
            <DialogDescription>
              Record production completion with traceability
            </DialogDescription>
          </DialogHeader>
          {selectedMfgItem && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm text-muted-foreground">Part</Label>
                <p className="font-medium">{selectedMfgItem.partName}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedMfgItem.quantityCompleted}/{selectedMfgItem.quantityOrdered} completed
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="qty-completed">Quantity Completed</Label>
                <Input
                  id="qty-completed"
                  type="number"
                  min="1"
                  max={selectedMfgItem.quantityOrdered - selectedMfgItem.quantityCompleted}
                  value={quantityCompleted}
                  onChange={(e) => setQuantityCompleted(e.target.value)}
                  placeholder="Enter quantity"
                  data-testid="input-qty-completed"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fabric-barcode">Fabric Lot/Barcode (for traceability)</Label>
                <Input
                  id="fabric-barcode"
                  value={fabricBarcode}
                  onChange={(e) => setFabricBarcode(e.target.value)}
                  placeholder="Scan or enter fabric barcode"
                  data-testid="input-fabric-barcode"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Optional notes..."
                  data-testid="input-completion-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProductionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCompleteProduction}
              disabled={!quantityCompleted || completeItemMutation.isPending}
              data-testid="btn-confirm-complete"
            >
              {completeItemMutation.isPending ? 'Saving...' : 'Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReceivingDialogOpen} onOpenChange={setIsReceivingDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5" />
              Receive Fabric to Freezer
            </DialogTitle>
            <DialogDescription>
              Add new fabric and assign to freezer location
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fabric-type">Fabric Type</Label>
                <Input
                  id="fabric-type"
                  value={receivingForm.fabricType}
                  onChange={(e) => setReceivingForm({ ...receivingForm, fabricType: e.target.value })}
                  placeholder="e.g., Carbon Fiber"
                  data-testid="input-fabric-type"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="common-name">Common Name</Label>
                <Input
                  id="common-name"
                  value={receivingForm.commonName}
                  onChange={(e) => setReceivingForm({ ...receivingForm, commonName: e.target.value })}
                  placeholder="In-house nickname"
                  data-testid="input-common-name"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roll-number">Roll Number</Label>
                <Input
                  id="roll-number"
                  value={receivingForm.rollNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, rollNumber: e.target.value })}
                  placeholder="Roll #"
                  data-testid="input-roll-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-number">Batch/Lot Number</Label>
                <Input
                  id="batch-number"
                  value={receivingForm.batchNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, batchNumber: e.target.value })}
                  placeholder="Batch/Lot #"
                  data-testid="input-batch-number"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="square-meters">Square Meters</Label>
                <Input
                  id="square-meters"
                  type="number"
                  value={receivingForm.squareMeters}
                  onChange={(e) => setReceivingForm({ ...receivingForm, squareMeters: e.target.value })}
                  placeholder="0"
                  data-testid="input-square-meters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiration-date">Expiration Date</Label>
                <Input
                  id="expiration-date"
                  type="date"
                  value={receivingForm.expirationDate}
                  onChange={(e) => setReceivingForm({ ...receivingForm, expirationDate: e.target.value })}
                  data-testid="input-expiration-date"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="freezer-location" className="flex items-center gap-2">
                <Snowflake className="h-4 w-4" />
                Freezer Location
              </Label>
              <Input
                id="freezer-location"
                value={receivingForm.freezerLocation}
                onChange={(e) => setReceivingForm({ ...receivingForm, freezerLocation: e.target.value })}
                placeholder="e.g., Freezer A - Shelf 2"
                data-testid="input-freezer-location"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="receiving-notes">Notes</Label>
              <Textarea
                id="receiving-notes"
                value={receivingForm.notes}
                onChange={(e) => setReceivingForm({ ...receivingForm, notes: e.target.value })}
                placeholder="Optional notes..."
                data-testid="input-receiving-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReceivingDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => receiveFabricMutation.mutate(receivingForm)}
              disabled={!receivingForm.fabricType || !receivingForm.rollNumber || receiveFabricMutation.isPending}
              data-testid="btn-confirm-receive"
            >
              {receiveFabricMutation.isPending ? 'Saving...' : 'Receive & Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isThresholdDialogOpen} onOpenChange={setIsThresholdDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Low Stock Threshold</DialogTitle>
            <DialogDescription>
              {selectedFabricForThreshold?.commonName || selectedFabricForThreshold?.fabricType}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="threshold">Threshold (rolls)</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                placeholder="Enter threshold"
                data-testid="input-threshold"
              />
              <p className="text-xs text-muted-foreground">
                Alert when stock falls to or below this level
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsThresholdDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedFabricForThreshold) {
                  updateThresholdMutation.mutate({
                    id: selectedFabricForThreshold.id,
                    threshold: parseInt(newThreshold) || 0,
                  });
                }
              }}
              disabled={updateThresholdMutation.isPending}
              data-testid="btn-save-threshold"
            >
              {updateThresholdMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPacketBuilderOpen} onOpenChange={setIsPacketBuilderOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Build Packets
            </DialogTitle>
            <DialogDescription>
              Select a Packet BOM and fabric rolls to build packets with full traceability
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Packet BOM</Label>
              <Select
                value={selectedBOM?.id || ""}
                onValueChange={(value) => {
                  const bom = packetBOMs.find(b => b.id === value);
                  setSelectedBOM(bom || null);
                  setPacketBuildForm(prev => ({ ...prev, packetBomId: value, selectedRolls: [] }));
                }}
              >
                <SelectTrigger data-testid="select-packet-bom">
                  <SelectValue placeholder="Select a packet type..." />
                </SelectTrigger>
                <SelectContent>
                  {packetBOMs.map((bom) => (
                    <SelectItem key={bom.id} value={bom.id}>
                      {bom.packetType} - {bom.partNumber} ({bom.yieldPerCut} per cut)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBOM && (
              <>
                <Card className="bg-muted/50">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Yield per Cut:</span>
                        <p className="font-medium">{selectedBOM.yieldPerCut} pieces</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">m² per Cut:</span>
                        <p className="font-medium">{selectedBOM.squareMetersPerCut} m²</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Materials:</span>
                        <p className="font-medium">{selectedBOM.materials?.length || 0} types</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <Label>Select Fabric Rolls (FIFO recommended)</Label>
                  <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto space-y-2">
                    {fabricInventory
                      .filter(f => f.status !== 'expired')
                      .sort((a, b) => {
                        if (a.isFifoNext && !b.isFifoNext) return -1;
                        if (!a.isFifoNext && b.isFifoNext) return 1;
                        return 0;
                      })
                      .slice(0, 20)
                      .map((fabric) => {
                        const isSelected = packetBuildForm.selectedRolls.find(r => r.rollId === fabric.id);
                        return (
                          <div
                            key={fabric.id}
                            onClick={() => isSelected ? removeRollFromPacketBuild(fabric.id) : addRollToPacketBuild(fabric)}
                            className={cn(
                              "p-2 rounded border cursor-pointer transition-colors",
                              isSelected && "border-primary bg-primary/10",
                              fabric.isFifoNext && !isSelected && "border-green-500 bg-green-50 dark:bg-green-950",
                              !isSelected && !fabric.isFifoNext && "hover:bg-muted"
                            )}
                            data-testid={`roll-select-${fabric.id}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                                <span className="font-medium">{fabric.commonName || fabric.fabricType}</span>
                                {fabric.isFifoNext && (
                                  <Badge variant="secondary" className="text-xs">FIFO</Badge>
                                )}
                              </div>
                              <span className="text-sm text-muted-foreground">
                                Roll {fabric.rollNumber} | {fabric.squareMeters} m²
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {packetBuildForm.selectedRolls.length > 0 && (
                  <div className="space-y-2">
                    <Label>Selected Rolls ({packetBuildForm.selectedRolls.length})</Label>
                    <div className="space-y-2">
                      {packetBuildForm.selectedRolls.map((roll) => {
                        const fabric = fabricInventory.find(f => f.id === roll.rollId);
                        return (
                          <div key={roll.rollId} className="flex items-center gap-2 p-2 bg-muted rounded">
                            <span className="flex-1 font-medium">Roll {roll.rollNumber}</span>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">m² used:</Label>
                              <Input
                                type="number"
                                step="0.1"
                                className="w-20 h-8"
                                value={roll.squareMetersUsed}
                                onChange={(e) => {
                                  setPacketBuildForm(prev => ({
                                    ...prev,
                                    selectedRolls: prev.selectedRolls.map(r =>
                                      r.rollId === roll.rollId
                                        ? { ...r, squareMetersUsed: e.target.value }
                                        : r
                                    ),
                                  }));
                                }}
                                data-testid={`input-sqm-${roll.rollId}`}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeRollFromPacketBuild(roll.rollId)}
                              data-testid={`btn-remove-roll-${roll.rollId}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="packet-notes">Notes (optional)</Label>
                  <Textarea
                    id="packet-notes"
                    value={packetBuildForm.notes}
                    onChange={(e) => setPacketBuildForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any notes about this build..."
                    data-testid="input-packet-notes"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPacketBuilderOpen(false);
                setSelectedBOM(null);
                setPacketBuildForm({
                  packetBomId: "",
                  quantity: "",
                  selectedRolls: [],
                  operatorName: "",
                  notes: "",
                });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => buildPacketMutation.mutate()}
              disabled={!selectedBOM || packetBuildForm.selectedRolls.length === 0 || buildPacketMutation.isPending}
              data-testid="btn-confirm-build"
            >
              {buildPacketMutation.isPending ? 'Building...' : `Build from ${packetBuildForm.selectedRolls.length} Roll(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

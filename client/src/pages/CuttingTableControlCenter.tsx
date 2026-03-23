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
  X,
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
  manufactureDate: string | null;
  receivedDate: string;
  expirationDate: string | null;
  location: string;
  freezerLocation: string | null;
  conformanceDocumentLink: string | null;
  barcode: string | null;
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
  parts?: PacketBOMPart[];
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

type PacketBOMPart = {
  id: string;
  packetBomId: string;
  partNumber: string;
  partDescription: string | null;
  fabricType: string;
  commonName: string | null;
  yieldPerCut: number;
  squareMetersPerPart: number | null;
  sortOrder: number;
  notes: string | null;
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
  const [labelQuantity, setLabelQuantity] = useState('');
  
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
    manufactureDate: "",
    receivedDate: new Date().toISOString().split('T')[0],
    expirationDate: "",
    freezerLocation: "",
    conformanceDocumentLink: "",
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
  
  // Packet BOM Management state
  const [isPacketBomDialogOpen, setIsPacketBomDialogOpen] = useState(false);
  const [editingPacketBom, setEditingPacketBom] = useState<PacketBOM | null>(null);
  const [packetBomWizardStep, setPacketBomWizardStep] = useState(1); // 1: Select Packet, 2: Add Parts, 3: Configure Cuts/Yield/Material
  // Cut assignment types for new model: cuts contain multiple parts
  type CutPartAssignment = { partNumber: string; partDescription: string; partsPerCut: number };
  type CutDefinition = { id: string; label: string; materialPartNumber: string; materialName: string; cutsNeeded: number; assignedParts: CutPartAssignment[] };
  
  const [packetBomForm, setPacketBomForm] = useState({
    partNumber: "",
    packetType: "",
    yieldPerCut: "4",
    squareMetersPerCut: "0.5",
    wasteFactor: "0.05",
    materials: [] as { fabricType: string; commonName: string; quantityNeeded: number }[],
    parts: [] as { partNumber: string; partDescription: string; quantity: number }[],
    cuts: [] as CutDefinition[],
  });
  const [newMaterialForm, setNewMaterialForm] = useState({ fabricType: "", commonName: "", quantityNeeded: 1 });
  const [newPacketPartForm, setNewPacketPartForm] = useState({
    partNumber: "",
    partDescription: "",
    quantity: 1,
  });
  const [selectedCutIndex, setSelectedCutIndex] = useState<number | null>(null);
  const [newCutForm, setNewCutForm] = useState({
    label: "",
    materialPartNumber: "",
    materialName: "",
    cutsNeeded: 1,
  });
  
  // Parts management within packet BOMs
  const [isPartsDialogOpen, setIsPartsDialogOpen] = useState(false);
  const [selectedBomForParts, setSelectedBomForParts] = useState<PacketBOM | null>(null);
  const [bomParts, setBomParts] = useState<PacketBOMPart[]>([]);
  const [newPartForm, setNewPartForm] = useState({
    partNumber: "",
    partDescription: "",
    fabricType: "",
    commonName: "",
    yieldPerCut: "1",
    squareMetersPerPart: "",
  });
  const [editingPart, setEditingPart] = useState<PacketBOMPart | null>(null);

  const { data: currentUser } = useQuery<{ username: string }>({
    queryKey: ['currentUser'],
  });

  const { data: productionLines = [] } = useQuery<ProductionLine[]>({
    queryKey: ['/api/cutting-table/production-lines'],
  });

  const { data: packetBOMs = [] } = useQuery<PacketBOM[]>({
    queryKey: ['/api/cutting-table/packet-boms'],
  });

  // Fetch inventory items marked as packet parts for dropdown selection
  const { data: availablePacketItems = [] } = useQuery<{ id: number; agPartNumber: string; name: string; description: string | null }[]>({
    queryKey: ['/api/cutting-table-mfg-queue/available-packets'],
  });

  // Fetch fabric items for material selection
  const { data: fabricItems = [] } = useQuery<{ id: number; agPartNumber: string; name: string; fabric: string }[]>({
    queryKey: ['/api/cutting-table/fabric-items'],
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
        barcode: item.barcode || null,
        barcodeValue: item.barcode || `FAB-${item.internalControlNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
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

  const pendingLabelPrint = useRef<{ id: number; quantity: number } | null>(null);
  
  const completeItemMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      quantityCompleted: number;
      fabricLot?: string;
      completionNotes?: string;
      completedBy?: string;
      labelsToPrint?: number;
    }) => {
      // Store label print info before making request
      if (data.labelsToPrint && data.labelsToPrint > 0) {
        pendingLabelPrint.current = { id: data.id, quantity: data.labelsToPrint };
      } else {
        pendingLabelPrint.current = null;
      }
      return apiRequest(`/api/cutting-table-mfg-queue/${data.id}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/weekly-goals'] });
      setIsProductionDialogOpen(false);
      
      // Trigger label printing if requested
      if (pendingLabelPrint.current) {
        generateLabelsMutation.mutate(pendingLabelPrint.current);
        pendingLabelPrint.current = null;
      }
      
      resetProductionForm();
      
      toast({
        title: data.isPartialCompletion ? 'Partial Completion' : 'Completed',
        description: data.isPartialCompletion 
          ? `${data.quantityCompleted} completed. ${data.remainingQuantity} remaining.`
          : 'Production completed with traceability.',
      });
    },
    onError: () => {
      pendingLabelPrint.current = null;
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
          lotNumber: data.batchNumber,
          rollNumber: data.rollNumber,
          quantityInStock: 1,
          squareMeters: data.squareMeters || '0',
          manufactureDate: data.manufactureDate || null,
          receivedDate: data.receivedDate || new Date().toISOString().split('T')[0],
          expirationDate: data.expirationDate || null,
          location: data.freezerLocation,
          conformanceDocumentLink: data.conformanceDocumentLink || null,
          notes: data.notes,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Received", description: "Fabric roll added with AS9100 traceability data." });
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
        manufactureDate: "",
        receivedDate: new Date().toISOString().split('T')[0],
        expirationDate: "",
        freezerLocation: "",
        conformanceDocumentLink: "",
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

  // Packet BOM CRUD mutations
  const createPacketBomMutation = useMutation({
    mutationFn: async (data: {
      partNumber: string;
      packetType: string;
      yieldPerCut: number;
      squareMetersPerCut: number;
      wasteFactor?: number;
      materials: { fabricType: string; commonName: string; quantityNeeded: number }[];
    }) => {
      return apiRequest('/api/cutting-table/packet-boms', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Created", description: "Packet BOM created successfully." });
      setIsPacketBomDialogOpen(false);
      resetPacketBomForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create packet BOM.", variant: "destructive" });
    },
  });

  const updatePacketBomMutation = useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      partNumber?: string;
      packetType?: string;
      yieldPerCut?: number;
      squareMetersPerCut?: number;
      wasteFactor?: number;
      materials?: { fabricType: string; commonName: string; quantityNeeded: number }[];
    }) => {
      return apiRequest(`/api/cutting-table/packet-boms/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Updated", description: "Packet BOM updated successfully." });
      setIsPacketBomDialogOpen(false);
      resetPacketBomForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update packet BOM.", variant: "destructive" });
    },
  });

  const deletePacketBomMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/packet-boms/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Deleted", description: "Packet BOM deleted successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete packet BOM.", variant: "destructive" });
    },
  });

  // Parts mutations
  const addPartMutation = useMutation({
    mutationFn: async ({ bomId, ...data }: {
      bomId: string;
      partNumber: string;
      partDescription?: string;
      fabricType: string;
      commonName?: string;
      yieldPerCut: number;
      squareMetersPerPart?: number;
    }) => {
      return apiRequest(`/api/cutting-table/packet-boms/${bomId}/parts`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      if (selectedBomForParts) {
        fetchPartsForBom(selectedBomForParts.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Added", description: "Part added successfully." });
      resetPartForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add part.", variant: "destructive" });
    },
  });

  const updatePartMutation = useMutation({
    mutationFn: async ({ partId, ...data }: {
      partId: string;
      partNumber?: string;
      partDescription?: string;
      fabricType?: string;
      commonName?: string;
      yieldPerCut?: number;
      squareMetersPerPart?: number;
    }) => {
      return apiRequest(`/api/cutting-table/packet-bom-parts/${partId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      if (selectedBomForParts) {
        fetchPartsForBom(selectedBomForParts.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Updated", description: "Part updated successfully." });
      resetPartForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update part.", variant: "destructive" });
    },
  });

  const deletePartMutation = useMutation({
    mutationFn: async (partId: string) => {
      return apiRequest(`/api/cutting-table/packet-bom-parts/${partId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      if (selectedBomForParts) {
        fetchPartsForBom(selectedBomForParts.id);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/packet-boms'] });
      toast({ title: "Deleted", description: "Part deleted successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete part.", variant: "destructive" });
    },
  });

  const fetchPartsForBom = async (bomId: string) => {
    try {
      const res = await fetch(`/api/cutting-table/packet-boms/${bomId}/parts`);
      if (res.ok) {
        const parts = await res.json();
        setBomParts(parts);
      }
    } catch (error) {
      console.error('Error fetching parts:', error);
    }
  };

  const openPartsDialog = (bom: PacketBOM) => {
    setSelectedBomForParts(bom);
    fetchPartsForBom(bom.id);
    setIsPartsDialogOpen(true);
  };

  const resetPartForm = () => {
    setEditingPart(null);
    setNewPartForm({
      partNumber: "",
      partDescription: "",
      fabricType: "",
      commonName: "",
      yieldPerCut: "1",
      squareMetersPerPart: "",
    });
  };

  const handleSavePart = () => {
    if (!selectedBomForParts) return;
    
    const data = {
      partNumber: newPartForm.partNumber,
      partDescription: newPartForm.partDescription || undefined,
      fabricType: newPartForm.fabricType,
      commonName: newPartForm.commonName || undefined,
      yieldPerCut: parseInt(newPartForm.yieldPerCut) || 1,
      squareMetersPerPart: newPartForm.squareMetersPerPart ? parseFloat(newPartForm.squareMetersPerPart) : undefined,
    };

    if (editingPart) {
      updatePartMutation.mutate({ partId: editingPart.id, ...data });
    } else {
      addPartMutation.mutate({ bomId: selectedBomForParts.id, ...data });
    }
  };

  const startEditPart = (part: PacketBOMPart) => {
    setEditingPart(part);
    setNewPartForm({
      partNumber: part.partNumber,
      partDescription: part.partDescription || "",
      fabricType: part.fabricType,
      commonName: part.commonName || "",
      yieldPerCut: String(part.yieldPerCut),
      squareMetersPerPart: part.squareMetersPerPart ? String(part.squareMetersPerPart) : "",
    });
  };

  const resetPacketBomForm = () => {
    setEditingPacketBom(null);
    setPacketBomWizardStep(1);
    setPacketBomForm({
      partNumber: "",
      packetType: "",
      yieldPerCut: "4",
      squareMetersPerCut: "0.5",
      wasteFactor: "0.05",
      materials: [],
      parts: [],
      cuts: [],
    });
    setNewMaterialForm({ fabricType: "", commonName: "", quantityNeeded: 1 });
    setNewPacketPartForm({
      partNumber: "",
      partDescription: "",
      quantity: 1,
    });
  };

  const addPacketPartToForm = () => {
    if (!newPacketPartForm.partNumber) {
      toast({ title: "Error", description: "Please select a part.", variant: "destructive" });
      return;
    }
    setPacketBomForm(prev => ({
      ...prev,
      parts: [...prev.parts, { ...newPacketPartForm }],
    }));
    setNewPacketPartForm({
      partNumber: "",
      partDescription: "",
      quantity: 1,
    });
  };

  const removePacketPartFromForm = (index: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== index),
    }));
  };

  const openPacketBomDialog = (bom?: PacketBOM) => {
    if (bom) {
      setEditingPacketBom(bom);
      setPacketBomWizardStep(1); // Start at step 1 for editing too
      setPacketBomForm({
        partNumber: bom.partNumber || "",
        packetType: bom.packetType || "",
        yieldPerCut: String(bom.yieldPerCut || 4),
        squareMetersPerCut: String(bom.squareMetersPerCut || 0.5),
        wasteFactor: "0.05",
        materials: bom.materials?.map(m => ({
          fabricType: m.fabricType,
          commonName: m.commonName || "",
          quantityNeeded: m.quantityNeeded || 1,
        })) || [],
        parts: bom.parts?.map((p: any) => ({
          partNumber: p.partNumber || "",
          partDescription: p.partDescription || "",
          quantity: p.quantity || 1,
        })) || [],
        cuts: (bom as any).cuts?.map((c: any) => ({
          id: c.id || `cut-${Date.now()}`,
          label: c.label || "",
          materialPartNumber: c.materialPartNumber || "",
          materialName: c.materialName || "",
          cutsNeeded: c.cutsNeeded || 1,
          assignedParts: c.assignedParts || [],
        })) || [],
      });
      setSelectedCutIndex(null);
    } else {
      resetPacketBomForm();
      setSelectedCutIndex(null);
    }
    setNewCutForm({ label: "", materialPartNumber: "", materialName: "", cutsNeeded: 1 });
    setIsPacketBomDialogOpen(true);
  };

  // Step 2: Add part with just part number and quantity
  const addPartStep2 = () => {
    if (!newPacketPartForm.partNumber) {
      toast({ title: "Error", description: "Please select a part.", variant: "destructive" });
      return;
    }
    setPacketBomForm(prev => ({
      ...prev,
      parts: [...prev.parts, { 
        partNumber: newPacketPartForm.partNumber,
        partDescription: newPacketPartForm.partDescription,
        quantity: newPacketPartForm.quantity,
      }],
    }));
    setNewPacketPartForm({
      partNumber: "",
      partDescription: "",
      quantity: 1,
    });
  };

  // Step 3: Add a new cut definition
  const addCut = () => {
    if (!newCutForm.materialPartNumber) {
      toast({ title: "Error", description: "Please select a material for this cut.", variant: "destructive" });
      return;
    }
    const cutId = `cut-${Date.now()}`;
    const label = newCutForm.label || `Cut ${packetBomForm.cuts.length + 1}`;
    setPacketBomForm(prev => ({
      ...prev,
      cuts: [...prev.cuts, {
        id: cutId,
        label,
        materialPartNumber: newCutForm.materialPartNumber,
        materialName: newCutForm.materialName,
        cutsNeeded: newCutForm.cutsNeeded,
        assignedParts: [],
      }],
    }));
    setNewCutForm({ label: "", materialPartNumber: "", materialName: "", cutsNeeded: 1 });
    setSelectedCutIndex(packetBomForm.cuts.length); // Select the new cut
  };

  // Step 3: Remove a cut
  const removeCut = (cutIndex: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      cuts: prev.cuts.filter((_, i) => i !== cutIndex),
    }));
    if (selectedCutIndex === cutIndex) {
      setSelectedCutIndex(null);
    } else if (selectedCutIndex !== null && selectedCutIndex > cutIndex) {
      setSelectedCutIndex(selectedCutIndex - 1);
    }
  };

  // Step 3: Update cut properties
  const updateCut = (cutIndex: number, field: string, value: any) => {
    setPacketBomForm(prev => ({
      ...prev,
      cuts: prev.cuts.map((cut, i) => 
        i === cutIndex ? { ...cut, [field]: value } : cut
      ),
    }));
  };

  // Step 3: Assign a part to the selected cut
  const assignPartToCut = (partNumber: string, partDescription: string) => {
    if (selectedCutIndex === null) return;
    setPacketBomForm(prev => ({
      ...prev,
      cuts: prev.cuts.map((cut, i) => {
        if (i !== selectedCutIndex) return cut;
        // Check if part is already assigned
        if (cut.assignedParts.some(p => p.partNumber === partNumber)) {
          return cut; // Already assigned
        }
        return {
          ...cut,
          assignedParts: [...cut.assignedParts, { partNumber, partDescription, partsPerCut: 1 }],
        };
      }),
    }));
  };

  // Step 3: Remove a part from a cut
  const removePartFromCut = (cutIndex: number, partNumber: string) => {
    setPacketBomForm(prev => ({
      ...prev,
      cuts: prev.cuts.map((cut, i) => {
        if (i !== cutIndex) return cut;
        return {
          ...cut,
          assignedParts: cut.assignedParts.filter(p => p.partNumber !== partNumber),
        };
      }),
    }));
  };

  // Step 3: Update parts per cut for an assigned part
  const updatePartsPerCut = (cutIndex: number, partNumber: string, partsPerCut: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      cuts: prev.cuts.map((cut, i) => {
        if (i !== cutIndex) return cut;
        return {
          ...cut,
          assignedParts: cut.assignedParts.map(p => 
            p.partNumber === partNumber ? { ...p, partsPerCut } : p
          ),
        };
      }),
    }));
  };

  // Get unassigned parts (parts not assigned to any cut)
  const getUnassignedParts = () => {
    const assignedPartNumbers = new Set<string>();
    packetBomForm.cuts.forEach(cut => {
      cut.assignedParts.forEach(p => assignedPartNumbers.add(p.partNumber));
    });
    return packetBomForm.parts.filter(p => !assignedPartNumbers.has(p.partNumber));
  };

  // Get total produced count for a part across all cuts
  const getPartTotalProduced = (partNumber: string) => {
    let total = 0;
    packetBomForm.cuts.forEach(cut => {
      const assignment = cut.assignedParts.find(p => p.partNumber === partNumber);
      if (assignment) {
        total += cut.cutsNeeded * assignment.partsPerCut;
      }
    });
    return total;
  };

  const handleSavePacketBom = () => {
    // Validate all parts are assigned to at least one cut
    const unassigned = getUnassignedParts();
    if (unassigned.length > 0) {
      toast({ 
        title: "Validation Error", 
        description: `${unassigned.length} part(s) not assigned to any cut. Please assign all parts.`, 
        variant: "destructive" 
      });
      return;
    }
    
    // Validate at least one cut exists
    if (packetBomForm.cuts.length === 0) {
      toast({ 
        title: "Validation Error", 
        description: "Please add at least one cut definition.", 
        variant: "destructive" 
      });
      return;
    }
    
    const data = {
      partNumber: packetBomForm.partNumber,
      packetType: packetBomForm.packetType,
      yieldPerCut: parseInt(packetBomForm.yieldPerCut) || 4,
      squareMetersPerCut: parseFloat(packetBomForm.squareMetersPerCut) || 0.5,
      wasteFactor: parseFloat(packetBomForm.wasteFactor) || 0.05,
      materials: packetBomForm.materials,
      parts: packetBomForm.parts,
      cuts: packetBomForm.cuts,
    };

    if (editingPacketBom) {
      updatePacketBomMutation.mutate({ id: editingPacketBom.id, ...data });
    } else {
      createPacketBomMutation.mutate(data);
    }
  };

  const addMaterialToForm = () => {
    if (!newMaterialForm.fabricType) {
      toast({ title: "Error", description: "Fabric type is required.", variant: "destructive" });
      return;
    }
    setPacketBomForm(prev => ({
      ...prev,
      materials: [...prev.materials, { ...newMaterialForm }],
    }));
    setNewMaterialForm({ fabricType: "", commonName: "", quantityNeeded: 1 });
  };

  const removeMaterialFromForm = (index: number) => {
    setPacketBomForm(prev => ({
      ...prev,
      materials: prev.materials.filter((_, i) => i !== index),
    }));
  };

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
              <title>Packet Labels - Avery 8160</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                .labels-container {
                  width: 8.5in;
                  padding: 0.5in 0.1875in;
                  display: grid;
                  grid-template-columns: repeat(3, 2.625in);
                  grid-template-rows: repeat(10, 1in);
                  column-gap: 0.125in;
                  row-gap: 0;
                }
                .label {
                  width: 2.625in;
                  height: 1in;
                  padding: 0.04in 0.06in;
                  box-sizing: border-box;
                  overflow: hidden;
                  border: 1px solid #ddd;
                }
                .label-header { font-size: 7pt; font-weight: bold; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .label-info { font-size: 6pt; margin: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .barcode-container { text-align: center; margin: 2px 0; }
                .barcode-container img { max-width: 100%; height: 0.28in; }
                .barcode-text { font-family: monospace; font-size: 7pt; }
                .item-number { font-size: 5pt; text-align: right; }
                @media print {
                  html, body { width: 8.5in; height: 11in; margin: 0; padding: 0; }
                  .label { border: none; }
                  @page { size: letter; margin: 0; }
                }
              </style>
            </head>
            <body><div class="labels-container">${labelsHtml}</div></body>
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
    setLabelQuantity('');
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
      labelsToPrint: parseInt(labelQuantity) || 0,
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
                          if (fabric.barcode) {
                            window.open(`/api/cutting-table/fabric-inventory/${fabric.id}/print-barcode`, '_blank');
                          } else {
                            toast({ 
                              title: "No Barcode", 
                              description: "This fabric item doesn't have a barcode assigned.", 
                              variant: "destructive" 
                            });
                          }
                        }}
                        title="Print Barcode"
                        data-testid={`btn-print-barcode-${fabric.id}`}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
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

        {/* Packet BOM Management Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Packet BOM Recipes
                </CardTitle>
                <CardDescription>
                  Define cuts, yields, and fabric requirements for each packet type
                </CardDescription>
              </div>
              <Button onClick={() => openPacketBomDialog()} data-testid="btn-add-packet-bom">
                <Plus className="h-4 w-4 mr-2" />
                New Packet BOM
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {packetBOMs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No packet BOMs defined yet.</p>
                <p className="text-sm">Create a packet BOM to define cuts, yields, and fabric requirements.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Packet Type</TableHead>
                    <TableHead className="text-right">Yield/Cut</TableHead>
                    <TableHead className="text-right">m²/Cut</TableHead>
                    <TableHead>Materials</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packetBOMs.map((bom) => (
                    <TableRow key={bom.id}>
                      <TableCell className="font-medium">{bom.partNumber}</TableCell>
                      <TableCell>{bom.packetType}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{bom.yieldPerCut} pcs</Badge>
                      </TableCell>
                      <TableCell className="text-right">{bom.squareMetersPerCut} m²</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {bom.materials?.slice(0, 3).map((m, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {m.commonName || m.fabricType}
                            </Badge>
                          ))}
                          {(bom.materials?.length || 0) > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{(bom.materials?.length || 0) - 3} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openPartsDialog(bom)}
                            data-testid={`btn-manage-parts-${bom.id}`}
                          >
                            <Layers className="h-4 w-4 mr-1" />
                            Parts
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openPacketBomDialog(bom)}
                            data-testid={`btn-edit-bom-${bom.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm('Delete this packet BOM?')) {
                                deletePacketBomMutation.mutate(bom.id);
                              }
                            }}
                            data-testid={`btn-delete-bom-${bom.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

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

  // Fabric Inventory Tab - Full CRUD with visual freezer display
  const [editingFabric, setEditingFabric] = useState<FabricInventoryItem | null>(null);
  const [isEditFabricDialogOpen, setIsEditFabricDialogOpen] = useState(false);
  const [fabricToDelete, setFabricToDelete] = useState<FabricInventoryItem | null>(null);
  const [fabricFilter, setFabricFilter] = useState("");

  const updateFabricMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FabricInventoryItem> }) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'PATCH',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      toast({ title: 'Success', description: 'Fabric roll updated successfully' });
      setIsEditFabricDialogOpen(false);
      setEditingFabric(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update fabric roll', variant: 'destructive' });
    },
  });

  const deleteFabricMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      toast({ title: 'Success', description: 'Fabric roll deleted' });
      setFabricToDelete(null);
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete fabric roll', variant: 'destructive' });
    },
  });

  // Group fabric by freezer for visual display
  const fabricByFreezer = useMemo(() => {
    const grouped: Record<string, FabricInventoryItem[]> = { 'Unassigned': [] };
    fabricInventory.forEach(item => {
      const freezer = item.freezerLocation || 'Unassigned';
      if (!grouped[freezer]) grouped[freezer] = [];
      grouped[freezer].push(item);
    });
    return grouped;
  }, [fabricInventory]);

  // Get unique fabric types for summary
  const fabricTypeSummary = useMemo(() => {
    const summary: Record<string, { count: number; totalSqMeters: number }> = {};
    fabricInventory.forEach(item => {
      const type = item.fabricType || item.commonName || 'Unknown';
      if (!summary[type]) summary[type] = { count: 0, totalSqMeters: 0 };
      summary[type].count += 1;
      summary[type].totalSqMeters += item.squareMeters || 0;
    });
    return summary;
  }, [fabricInventory]);

  const filteredFabricInventory = useMemo(() => {
    if (!fabricFilter) return fabricInventory;
    const lower = fabricFilter.toLowerCase();
    return fabricInventory.filter(f => 
      f.fabricType?.toLowerCase().includes(lower) ||
      f.commonName?.toLowerCase().includes(lower) ||
      f.rollNumber?.toLowerCase().includes(lower) ||
      f.lotNumber?.toLowerCase().includes(lower) ||
      f.freezerLocation?.toLowerCase().includes(lower) ||
      f.barcodeValue?.toLowerCase().includes(lower)
    );
  }, [fabricInventory, fabricFilter]);

  const renderFabricTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search fabric by type, roll, lot, freezer..."
              value={fabricFilter}
              onChange={(e) => setFabricFilter(e.target.value)}
              className="pl-10"
              data-testid="input-fabric-filter"
            />
          </div>
          <Button onClick={() => refetchFabric()} variant="outline" size="sm" data-testid="btn-refresh-fabric">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        <Button onClick={() => setIsReceivingDialogOpen(true)} data-testid="btn-add-fabric">
          <Plus className="h-4 w-4 mr-2" />
          Add Fabric Roll
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Rolls</p>
                <p className="text-2xl font-bold">{fabricInventory.length}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Freezers</p>
                <p className="text-2xl font-bold">{fabricInventory.filter(f => f.freezerLocation).length}</p>
              </div>
              <Snowflake className="h-8 w-8 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expiring Soon</p>
                <p className="text-2xl font-bold text-orange-600">{fabricInventory.filter(f => f.status === 'expiring').length}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-red-600">{fabricInventory.filter(f => f.status === 'expired').length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-cyan-600" />
            Freezer Inventory Visual
          </CardTitle>
          <CardDescription>Fabric rolls organized by freezer location</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(fabricByFreezer).sort(([a], [b]) => {
              if (a === 'Unassigned') return 1;
              if (b === 'Unassigned') return -1;
              return a.localeCompare(b);
            }).map(([freezer, rolls]) => (
              <Card key={freezer} className={cn(
                "border-2",
                freezer === 'Unassigned' ? "border-dashed border-gray-300" : "border-cyan-200 bg-cyan-50/30 dark:bg-cyan-950/20"
              )}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {freezer !== 'Unassigned' && <Snowflake className="h-4 w-4 text-cyan-600" />}
                      {freezer}
                    </span>
                    <Badge variant="secondary">{rolls.length} rolls</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {rolls.slice(0, 12).map((roll) => (
                      <div
                        key={roll.id}
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-all hover:scale-110 border-2",
                          roll.status === 'expired' ? "bg-red-100 border-red-400 text-red-700" :
                          roll.status === 'expiring' ? "bg-orange-100 border-orange-400 text-orange-700" :
                          roll.status === 'low' ? "bg-yellow-100 border-yellow-400 text-yellow-700" :
                          "bg-green-100 border-green-400 text-green-700"
                        )}
                        title={`${roll.fabricType || roll.commonName}\nRoll: ${roll.rollNumber}\nLot: ${roll.lotNumber || 'N/A'}\n${roll.squareMeters?.toFixed(1) || 0} m²`}
                        onClick={() => {
                          setEditingFabric(roll);
                          setIsEditFabricDialogOpen(true);
                        }}
                        data-testid={`fabric-roll-${roll.id}`}
                      >
                        {roll.rollNumber?.slice(-2) || '?'}
                      </div>
                    ))}
                    {rolls.length > 12 && (
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold bg-gray-100 border-2 border-gray-300">
                        +{rolls.length - 12}
                      </div>
                    )}
                  </div>
                  {rolls.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No rolls</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-600" />
            Fabric Type Summary
          </CardTitle>
          <CardDescription>Roll counts and total square meters by fabric type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(fabricTypeSummary).map(([type, data]) => (
              <div key={type} className="p-3 rounded-lg border bg-card">
                <p className="text-sm font-medium truncate" title={type}>{type}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-bold">{data.count}</span>
                  <span className="text-xs text-muted-foreground">rolls</span>
                </div>
                <p className="text-xs text-muted-foreground">{data.totalSqMeters.toFixed(1)} m² total</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            All Fabric Rolls
          </CardTitle>
          <CardDescription>Complete inventory with CRUD operations</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingFabric ? (
            <div className="text-center py-8 text-muted-foreground">Loading fabric inventory...</div>
          ) : filteredFabricInventory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No fabric rolls found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fabric Type</TableHead>
                    <TableHead>Roll #</TableHead>
                    <TableHead>Lot/Batch</TableHead>
                    <TableHead>Freezer</TableHead>
                    <TableHead className="text-right">Sq Meters</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFabricInventory.map((fabric) => (
                    <TableRow key={fabric.id} data-testid={`fabric-row-${fabric.id}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{fabric.fabricType || fabric.commonName || 'Unknown'}</p>
                          {fabric.fabricPartNumber && (
                            <p className="text-xs text-muted-foreground">PN: {fabric.fabricPartNumber}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{fabric.rollNumber || '-'}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {fabric.lotNumber && <p>Lot: {fabric.lotNumber}</p>}
                          {fabric.batchNumber && <p>Batch: {fabric.batchNumber}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {fabric.freezerLocation ? (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit">
                            <Snowflake className="h-3 w-3" />
                            {fabric.freezerLocation}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fabric.squareMeters?.toFixed(2) || '0'}</TableCell>
                      <TableCell>
                        {fabric.expirationDate ? (
                          <span className={cn(
                            fabric.status === 'expired' ? "text-red-600" :
                            fabric.status === 'expiring' ? "text-orange-600" : ""
                          )}>
                            {new Date(fabric.expirationDate).toLocaleDateString()}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          fabric.status === 'expired' ? 'destructive' :
                          fabric.status === 'expiring' ? 'secondary' :
                          fabric.status === 'low' ? 'outline' : 'default'
                        }>
                          {fabric.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingFabric(fabric);
                              setIsEditFabricDialogOpen(true);
                            }}
                            data-testid={`btn-edit-fabric-${fabric.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => setFabricToDelete(fabric)}
                            data-testid={`btn-delete-fabric-${fabric.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

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
        <TabsList className="grid w-full grid-cols-4">
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
          <TabsTrigger value="fabric" className="flex items-center gap-2" data-testid="tab-fabric">
            <Layers className="h-4 w-4" />
            Fabric
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run">{renderRunTab()}</TabsContent>
        <TabsContent value="build">{renderBuildTab()}</TabsContent>
        <TabsContent value="plan">{renderPlanTab()}</TabsContent>
        <TabsContent value="fabric">{renderFabricTab()}</TabsContent>
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
                <Label htmlFor="fabric-barcode">Fabric Lot/Barcode (scan or type)</Label>
                <BarcodeInputField
                  id="fabric-barcode"
                  value={fabricBarcode}
                  onChange={setFabricBarcode}
                  placeholder="Scan fabric barcode for traceability"
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
              <div className="border-t pt-4 mt-4">
                <Label className="text-sm font-medium mb-2 block">Print Labels After Completion</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="label-quantity"
                    type="number"
                    min="0"
                    value={labelQuantity}
                    onChange={(e) => setLabelQuantity(e.target.value)}
                    placeholder="# of labels"
                    className="w-32"
                    data-testid="input-label-quantity"
                  />
                  <span className="text-sm text-muted-foreground">labels to print</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to skip printing, or enter quantity to auto-print after completion
                </p>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Snowflake className="h-5 w-5" />
              Receive Fabric Roll
            </DialogTitle>
            <DialogDescription>
              Enter all required information for AS9100 traceability compliance
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fabric-part-number" className="flex items-center gap-1">
                  Part Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="fabric-part-number"
                  value={receivingForm.fabricPartNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, fabricPartNumber: e.target.value })}
                  placeholder="e.g., 011798"
                  data-testid="input-part-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="supplier-part-number">Supplier Part Number</Label>
                <Input
                  id="supplier-part-number"
                  value={receivingForm.supplierPartNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, supplierPartNumber: e.target.value })}
                  placeholder="e.g., 14002"
                  data-testid="input-supplier-part-number"
                />
              </div>
            </div>
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
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roll-number" className="flex items-center gap-1">
                  Roll Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="roll-number"
                  value={receivingForm.rollNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, rollNumber: e.target.value })}
                  placeholder="e.g., 1140620043"
                  data-testid="input-roll-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="batch-number">Lot/Batch Number</Label>
                <Input
                  id="batch-number"
                  value={receivingForm.batchNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, batchNumber: e.target.value })}
                  placeholder="Lot or Batch #"
                  data-testid="input-batch-number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="internal-control-number" className="flex items-center gap-1">
                  Internal Control # <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="internal-control-number"
                  value={receivingForm.internalControlNumber}
                  onChange={(e) => setReceivingForm({ ...receivingForm, internalControlNumber: e.target.value })}
                  placeholder="e.g., ICN-12345"
                  data-testid="input-internal-control-number"
                />
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
              <Label className="text-sm font-medium mb-3 block">Key Dates</Label>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="manufacture-date" className="text-xs text-muted-foreground">Manufacture Date</Label>
                  <Input
                    id="manufacture-date"
                    type="date"
                    value={receivingForm.manufactureDate}
                    onChange={(e) => setReceivingForm({ ...receivingForm, manufactureDate: e.target.value })}
                    data-testid="input-manufacture-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="received-date" className="text-xs text-muted-foreground">
                    Received Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="received-date"
                    type="date"
                    value={receivingForm.receivedDate}
                    onChange={(e) => setReceivingForm({ ...receivingForm, receivedDate: e.target.value })}
                    data-testid="input-received-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiration-date" className="text-xs text-muted-foreground">
                    Expiration Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="expiration-date"
                    type="date"
                    value={receivingForm.expirationDate}
                    onChange={(e) => setReceivingForm({ ...receivingForm, expirationDate: e.target.value })}
                    data-testid="input-expiration-date"
                  />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="square-meters">Square Meters</Label>
                <Input
                  id="square-meters"
                  type="number"
                  step="0.01"
                  value={receivingForm.squareMeters}
                  onChange={(e) => setReceivingForm({ ...receivingForm, squareMeters: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-square-meters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freezer-location" className="flex items-center gap-2">
                  <Snowflake className="h-4 w-4" />
                  Freezer Location
                </Label>
                <Select
                  value={receivingForm.freezerLocation || 'none'}
                  onValueChange={(val) => setReceivingForm({ ...receivingForm, freezerLocation: val === 'none' ? '' : val })}
                >
                  <SelectTrigger data-testid="select-freezer-location">
                    <SelectValue placeholder="Select freezer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not Assigned</SelectItem>
                    <SelectItem value="Freezer 1">Freezer 1</SelectItem>
                    <SelectItem value="Freezer 2">Freezer 2</SelectItem>
                    <SelectItem value="Freezer 3">Freezer 3</SelectItem>
                    <SelectItem value="Freezer 4">Freezer 4</SelectItem>
                    <SelectItem value="Freezer 5">Freezer 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20">
              <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                COC Document (Certificate of Conformance)
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Link the COC document for AS9100 traceability
              </p>
              <Input
                value={receivingForm.conformanceDocumentLink}
                onChange={(e) => setReceivingForm({ ...receivingForm, conformanceDocumentLink: e.target.value })}
                placeholder="Enter COC document link or file path"
                data-testid="input-coc-link"
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
              disabled={
                !receivingForm.fabricPartNumber || 
                !receivingForm.rollNumber || 
                !receivingForm.internalControlNumber ||
                !receivingForm.receivedDate || 
                !receivingForm.expirationDate || 
                receiveFabricMutation.isPending
              }
              data-testid="btn-confirm-receive"
            >
              {receiveFabricMutation.isPending ? 'Saving...' : 'Receive Fabric Roll'}
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

      {/* Packet BOM Create/Edit Dialog - 3-Step Wizard */}
      <Dialog open={isPacketBomDialogOpen} onOpenChange={(open) => {
        if (!open) resetPacketBomForm();
        setIsPacketBomDialogOpen(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {editingPacketBom ? 'Edit Packet BOM' : 'Create New Packet BOM'}
            </DialogTitle>
            <DialogDescription>
              Step {packetBomWizardStep} of 3: {
                packetBomWizardStep === 1 ? 'Select Packet' :
                packetBomWizardStep === 2 ? 'Add Parts' :
                'Configure Cuts, Yield & Materials'
              }
            </DialogDescription>
          </DialogHeader>

          {/* Step Progress Indicator */}
          <div className="flex items-center justify-center gap-2 py-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  packetBomWizardStep === step 
                    ? 'bg-primary text-primary-foreground' 
                    : packetBomWizardStep > step 
                    ? 'bg-green-500 text-white' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {packetBomWizardStep > step ? '✓' : step}
                </div>
                {step < 3 && (
                  <div className={`w-12 h-1 mx-1 ${
                    packetBomWizardStep > step ? 'bg-green-500' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>

          <div className="space-y-6 py-4">
            {/* STEP 1: Select Packet */}
            {packetBomWizardStep === 1 && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <Layers className="h-12 w-12 mx-auto mb-2 text-primary opacity-70" />
                  <h3 className="text-lg font-medium">Select a Packet</h3>
                  <p className="text-sm text-muted-foreground">Choose the packet type from your inventory</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bom-part-number">Packet Part Number *</Label>
                  <Select
                    value={packetBomForm.partNumber}
                    onValueChange={(value) => {
                      const selectedItem = availablePacketItems.find(item => item.agPartNumber === value);
                      setPacketBomForm({ 
                        ...packetBomForm, 
                        partNumber: value,
                        packetType: selectedItem?.name || packetBomForm.packetType
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-bom-part-number">
                      <SelectValue placeholder="Select packet from inventory" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePacketItems.map((item) => (
                        <SelectItem key={item.id} value={item.agPartNumber}>
                          {item.agPartNumber} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {packetBomForm.partNumber && (
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <p className="text-sm font-medium">Selected Packet:</p>
                    <p className="text-lg font-bold text-primary">{packetBomForm.partNumber}</p>
                    <p className="text-sm text-muted-foreground">{packetBomForm.packetType}</p>
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Add Parts with Quantities */}
            {packetBomWizardStep === 2 && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <Plus className="h-12 w-12 mx-auto mb-2 text-primary opacity-70" />
                  <h3 className="text-lg font-medium">Add Parts to Packet</h3>
                  <p className="text-sm text-muted-foreground">Select parts and specify quantities for "{packetBomForm.packetType}"</p>
                </div>

                {/* Added Parts List */}
                {packetBomForm.parts.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part</TableHead>
                          <TableHead className="text-center">Quantity</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {packetBomForm.parts.map((part, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="font-medium">{part.partNumber}</div>
                              <div className="text-xs text-muted-foreground">{part.partDescription}</div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{part.quantity}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-destructive"
                                onClick={() => removePacketPartFromForm(index)}
                                data-testid={`btn-remove-part-${index}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {packetBomForm.parts.length === 0 && (
                  <div className="text-center py-4 border rounded-lg bg-muted/30">
                    <Layers className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                    <p className="text-sm text-muted-foreground">No parts added yet. Add parts below.</p>
                  </div>
                )}
                
                {/* Add Part Form */}
                <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                  <p className="text-sm font-medium">Add Part</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Part *</Label>
                      <Select
                        value={newPacketPartForm.partNumber}
                        onValueChange={(value) => {
                          const selectedItem = availablePacketItems.find(item => item.agPartNumber === value);
                          setNewPacketPartForm({ 
                            ...newPacketPartForm, 
                            partNumber: value,
                            partDescription: selectedItem?.name || ""
                          });
                        }}
                      >
                        <SelectTrigger data-testid="select-new-part-step2">
                          <SelectValue placeholder="Select part from inventory" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePacketItems.map((item) => (
                            <SelectItem key={item.id} value={item.agPartNumber}>
                              {item.agPartNumber} - {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        min="1"
                        value={newPacketPartForm.quantity}
                        onChange={(e) => setNewPacketPartForm({ ...newPacketPartForm, quantity: parseInt(e.target.value) || 1 })}
                        data-testid="input-new-part-qty-step2"
                      />
                    </div>
                  </div>
                  <Button 
                    className="w-full"
                    size="sm" 
                    onClick={addPartStep2}
                    data-testid="btn-add-part-step2"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Part
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Define Cuts and Assign Parts to Cuts */}
            {packetBomWizardStep === 3 && (
              <div className="space-y-4">
                <div className="text-center mb-4">
                  <Settings className="h-12 w-12 mx-auto mb-2 text-primary opacity-70" />
                  <h3 className="text-lg font-medium">Define Cuts & Assign Parts</h3>
                  <p className="text-sm text-muted-foreground">Create cut definitions, then assign parts to each cut</p>
                </div>

                {packetBomForm.parts.length === 0 ? (
                  <div className="text-center py-8 border rounded-lg bg-muted/30">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                    <p className="text-sm text-muted-foreground">No parts to configure. Go back and add some parts.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left Panel: Cuts List */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Cuts ({packetBomForm.cuts.length})</Label>
                      
                      {/* Add Cut Form */}
                      <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Cut Label</Label>
                            <Input
                              placeholder="e.g., Main Cut"
                              value={newCutForm.label}
                              onChange={(e) => setNewCutForm({ ...newCutForm, label: e.target.value })}
                              data-testid="input-new-cut-label"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Cuts Needed</Label>
                            <Input
                              type="number"
                              min="1"
                              value={newCutForm.cutsNeeded}
                              onChange={(e) => setNewCutForm({ ...newCutForm, cutsNeeded: parseInt(e.target.value) || 1 })}
                              data-testid="input-new-cut-qty"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Material *</Label>
                          <Select
                            value={newCutForm.materialPartNumber}
                            onValueChange={(value) => {
                              const selectedFabric = fabricItems.find(f => f.agPartNumber === value);
                              setNewCutForm({ 
                                ...newCutForm, 
                                materialPartNumber: value,
                                materialName: selectedFabric?.name || ""
                              });
                            }}
                          >
                            <SelectTrigger data-testid="select-new-cut-material">
                              <SelectValue placeholder="Select material" />
                            </SelectTrigger>
                            <SelectContent>
                              {fabricItems.map((fabric) => (
                                <SelectItem key={fabric.id} value={fabric.agPartNumber}>
                                  {fabric.agPartNumber} - {fabric.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full"
                          onClick={addCut}
                          disabled={!newCutForm.materialPartNumber}
                          data-testid="btn-add-cut"
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Cut
                        </Button>
                      </div>

                      {/* Cuts List */}
                      {packetBomForm.cuts.length === 0 ? (
                        <div className="text-center py-4 border rounded-lg bg-muted/20">
                          <Scissors className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-50" />
                          <p className="text-xs text-muted-foreground">No cuts defined yet</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {packetBomForm.cuts.map((cut, index) => (
                            <div 
                              key={cut.id}
                              className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                                selectedCutIndex === index 
                                  ? 'border-primary bg-primary/5' 
                                  : 'hover:bg-muted/30'
                              }`}
                              onClick={() => setSelectedCutIndex(index)}
                              data-testid={`cut-item-${index}`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{cut.label}</p>
                                  <p className="text-xs text-muted-foreground">{cut.materialName}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-xs">{cut.cutsNeeded}x</Badge>
                                  <Badge variant="outline" className="text-xs">{cut.assignedParts.length} parts</Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive"
                                    onClick={(e) => { e.stopPropagation(); removeCut(index); }}
                                    data-testid={`btn-remove-cut-${index}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {cut.assignedParts.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {cut.assignedParts.map((p) => (
                                    <Badge key={p.partNumber} variant="outline" className="text-xs">
                                      {p.partNumber} ({p.partsPerCut}/cut)
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right Panel: Assign Parts to Selected Cut */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        {selectedCutIndex !== null 
                          ? `Assign Parts to "${packetBomForm.cuts[selectedCutIndex]?.label}"`
                          : "Select a cut to assign parts"
                        }
                      </Label>

                      {selectedCutIndex === null ? (
                        <div className="text-center py-8 border rounded-lg bg-muted/20">
                          <ArrowRight className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-50" />
                          <p className="text-xs text-muted-foreground">Click a cut on the left to assign parts</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* Unassigned Parts */}
                          {getUnassignedParts().length > 0 && (
                            <div className="border rounded-lg p-3 space-y-2">
                              <Label className="text-xs text-muted-foreground">Available Parts (click to assign)</Label>
                              <div className="space-y-1">
                                {getUnassignedParts().map((part) => (
                                  <div 
                                    key={part.partNumber}
                                    className="flex items-center justify-between p-2 rounded bg-muted/30 hover:bg-muted/50 cursor-pointer"
                                    onClick={() => assignPartToCut(part.partNumber, part.partDescription)}
                                    data-testid={`unassigned-part-${part.partNumber}`}
                                  >
                                    <div>
                                      <p className="text-sm font-medium">{part.partNumber}</p>
                                      <p className="text-xs text-muted-foreground">{part.partDescription}</p>
                                    </div>
                                    <Badge variant="secondary">Need {part.quantity}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Assigned Parts to this Cut */}
                          {packetBomForm.cuts[selectedCutIndex]?.assignedParts.length > 0 && (
                            <div className="border rounded-lg p-3 space-y-2 bg-green-50 dark:bg-green-950/20">
                              <Label className="text-xs text-green-700 dark:text-green-400">Assigned to this cut</Label>
                              <div className="space-y-2">
                                {packetBomForm.cuts[selectedCutIndex].assignedParts.map((ap) => {
                                  const originalPart = packetBomForm.parts.find(p => p.partNumber === ap.partNumber);
                                  const totalProduced = getPartTotalProduced(ap.partNumber);
                                  const needed = originalPart?.quantity || 0;
                                  return (
                                    <div key={ap.partNumber} className="flex items-center justify-between p-2 rounded bg-white dark:bg-gray-900">
                                      <div>
                                        <p className="text-sm font-medium">{ap.partNumber}</p>
                                        <p className="text-xs text-muted-foreground">{ap.partDescription}</p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1">
                                          <Label className="text-xs">Per cut:</Label>
                                          <Input
                                            type="number"
                                            min="1"
                                            className="w-16 h-7 text-xs"
                                            value={ap.partsPerCut}
                                            onChange={(e) => updatePartsPerCut(selectedCutIndex, ap.partNumber, parseInt(e.target.value) || 1)}
                                            onClick={(e) => e.stopPropagation()}
                                            data-testid={`input-parts-per-cut-${ap.partNumber}`}
                                          />
                                        </div>
                                        <Badge variant={totalProduced >= needed ? "default" : "destructive"} className="text-xs">
                                          {totalProduced}/{needed}
                                        </Badge>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 w-6 p-0 text-destructive"
                                          onClick={(e) => { e.stopPropagation(); removePartFromCut(selectedCutIndex, ap.partNumber); }}
                                          data-testid={`btn-remove-part-from-cut-${ap.partNumber}`}
                                        >
                                          <X className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {getUnassignedParts().length === 0 && packetBomForm.cuts[selectedCutIndex]?.assignedParts.length === 0 && (
                            <div className="text-center py-4 border rounded-lg bg-muted/20">
                              <p className="text-xs text-muted-foreground">All parts are assigned to other cuts</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Parts Summary */}
                      <div className="border-t pt-3">
                        <Label className="text-xs font-medium text-muted-foreground">Parts Summary</Label>
                        <div className="mt-2 space-y-1">
                          {packetBomForm.parts.map((part) => {
                            const totalProduced = getPartTotalProduced(part.partNumber);
                            const isComplete = totalProduced >= part.quantity;
                            return (
                              <div key={part.partNumber} className="flex items-center justify-between text-xs">
                                <span className={!isComplete ? 'text-red-500' : ''}>{part.partNumber}</span>
                                <Badge variant={isComplete ? "default" : "destructive"} className="text-xs">
                                  {totalProduced}/{part.quantity}
                                </Badge>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between">
            <div>
              {packetBomWizardStep > 1 && (
                <Button 
                  variant="outline" 
                  onClick={() => setPacketBomWizardStep(prev => prev - 1)}
                  data-testid="btn-wizard-back"
                >
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsPacketBomDialogOpen(false)}>
                Cancel
              </Button>
              {packetBomWizardStep < 3 ? (
                <Button
                  onClick={() => setPacketBomWizardStep(prev => prev + 1)}
                  disabled={
                    (packetBomWizardStep === 1 && !packetBomForm.partNumber) ||
                    (packetBomWizardStep === 2 && packetBomForm.parts.length === 0)
                  }
                  data-testid="btn-wizard-next"
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleSavePacketBom}
                  disabled={
                    packetBomForm.cuts.length === 0 ||
                    getUnassignedParts().length > 0 ||
                    createPacketBomMutation.isPending || 
                    updatePacketBomMutation.isPending
                  }
                  data-testid="btn-save-packet-bom"
                >
                  {createPacketBomMutation.isPending || updatePacketBomMutation.isPending ? 'Saving...' : editingPacketBom ? 'Update' : 'Create'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parts Management Dialog */}
      <Dialog open={isPartsDialogOpen} onOpenChange={(open) => {
        setIsPartsDialogOpen(open);
        if (!open) {
          resetPartForm();
          setBomParts([]);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Manage Parts - {selectedBomForParts?.packetType}
            </DialogTitle>
            <DialogDescription>
              Add individual parts to this packet. Each part has its own part number, fabric type, and yield per cut.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Existing Parts List */}
            {bomParts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-medium">Parts in this Packet</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Fabric</TableHead>
                      <TableHead className="text-right">Yield/Cut</TableHead>
                      <TableHead className="text-right">m²/Part</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomParts.map((part) => (
                      <TableRow key={part.id}>
                        <TableCell className="font-medium">{part.partNumber}</TableCell>
                        <TableCell className="text-muted-foreground">{part.partDescription || '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline">{part.fabricType}</Badge>
                            {part.commonName && <span className="text-xs text-muted-foreground">({part.commonName})</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{part.yieldPerCut}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{part.squareMetersPerPart || '-'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEditPart(part)}
                              data-testid={`btn-edit-part-${part.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm('Delete this part?')) {
                                  deletePartMutation.mutate(part.id);
                                }
                              }}
                              data-testid={`btn-delete-part-${part.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {bomParts.length === 0 && (
              <div className="text-center py-6 border rounded-lg bg-muted/30">
                <Layers className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No parts added yet.</p>
                <p className="text-sm text-muted-foreground">Add parts below to define what makes up this packet.</p>
              </div>
            )}

            {/* Add/Edit Part Form */}
            <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">
                  {editingPart ? 'Edit Part' : 'Add New Part'}
                </Label>
                {editingPart && (
                  <Button size="sm" variant="ghost" onClick={resetPartForm}>
                    Cancel Edit
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="part-number">Part Number *</Label>
                  <Select
                    value={newPartForm.partNumber}
                    onValueChange={(value) => {
                      const selectedItem = availablePacketItems.find(item => item.agPartNumber === value);
                      setNewPartForm({ 
                        ...newPartForm, 
                        partNumber: value,
                        partDescription: selectedItem?.name || newPartForm.partDescription
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-part-number">
                      <SelectValue placeholder="Select part number" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePacketItems.map((item) => (
                        <SelectItem key={item.id} value={item.agPartNumber}>
                          {item.agPartNumber} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-description">Description</Label>
                  <Input
                    id="part-description"
                    value={newPartForm.partDescription}
                    onChange={(e) => setNewPartForm({ ...newPartForm, partDescription: e.target.value })}
                    placeholder="Optional description"
                    data-testid="input-part-description"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="part-fabric-type">Fabric Type *</Label>
                  <Select
                    value={newPartForm.fabricType}
                    onValueChange={(value) => {
                      const selectedFabric = fabricItems.find(f => f.name === value);
                      setNewPartForm({ 
                        ...newPartForm, 
                        fabricType: value,
                        commonName: selectedFabric?.fabric || value
                      });
                    }}
                  >
                    <SelectTrigger data-testid="select-part-fabric-type">
                      <SelectValue placeholder="Select fabric" />
                    </SelectTrigger>
                    <SelectContent>
                      {fabricItems.map((fabric) => (
                        <SelectItem key={fabric.id} value={fabric.name}>
                          {fabric.agPartNumber} - {fabric.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-common-name">Common Name</Label>
                  <Input
                    id="part-common-name"
                    value={newPartForm.commonName}
                    onChange={(e) => setNewPartForm({ ...newPartForm, commonName: e.target.value })}
                    placeholder="Nickname for fabric"
                    data-testid="input-part-common-name"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="part-yield">Yield Per Cut *</Label>
                  <Input
                    id="part-yield"
                    type="number"
                    min="1"
                    value={newPartForm.yieldPerCut}
                    onChange={(e) => setNewPartForm({ ...newPartForm, yieldPerCut: e.target.value })}
                    placeholder="How many of this part per cut"
                    data-testid="input-part-yield"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many of this part are produced in one cut
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="part-sqm">Square Meters Per Part</Label>
                  <Input
                    id="part-sqm"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPartForm.squareMetersPerPart}
                    onChange={(e) => setNewPartForm({ ...newPartForm, squareMetersPerPart: e.target.value })}
                    placeholder="Optional"
                    data-testid="input-part-sqm"
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button
                  onClick={handleSavePart}
                  disabled={!newPartForm.partNumber || !newPartForm.fabricType || addPartMutation.isPending || updatePartMutation.isPending}
                  data-testid="btn-save-part"
                >
                  {addPartMutation.isPending || updatePartMutation.isPending 
                    ? 'Saving...' 
                    : editingPart 
                      ? 'Update Part' 
                      : 'Add Part'}
                </Button>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPartsDialogOpen(false)}>
              Done
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

      <Dialog open={isEditFabricDialogOpen} onOpenChange={setIsEditFabricDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Fabric Roll</DialogTitle>
            <DialogDescription>
              Update fabric roll details for AS9100 traceability
            </DialogDescription>
          </DialogHeader>
          {editingFabric && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Part Number</Label>
                  <Input
                    value={editingFabric.fabricPartNumber || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, fabricPartNumber: e.target.value })}
                    placeholder="e.g., 011798"
                    data-testid="input-edit-part-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Supplier Part Number</Label>
                  <Input
                    value={editingFabric.supplierPartNumber || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, supplierPartNumber: e.target.value })}
                    placeholder="e.g., 14002"
                    data-testid="input-edit-supplier-part"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fabric Type</Label>
                  <Input
                    value={editingFabric.fabricType || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, fabricType: e.target.value })}
                    data-testid="input-edit-fabric-type"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Common Name</Label>
                  <Input
                    value={editingFabric.commonName || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, commonName: e.target.value })}
                    data-testid="input-edit-common-name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Roll Number</Label>
                  <Input
                    value={editingFabric.rollNumber || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, rollNumber: e.target.value })}
                    placeholder="e.g., 1140620043"
                    data-testid="input-edit-roll-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lot/Batch Number</Label>
                  <Input
                    value={editingFabric.lotNumber || editingFabric.batchNumber || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, lotNumber: e.target.value, batchNumber: e.target.value })}
                    data-testid="input-edit-lot-number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internal Control #</Label>
                  <Input
                    value={editingFabric.internalControlNumber || ''}
                    onChange={(e) => setEditingFabric({ ...editingFabric, internalControlNumber: e.target.value })}
                    placeholder="e.g., ICN-12345"
                    data-testid="input-edit-icn"
                  />
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
                <Label className="text-sm font-medium mb-3 block">Key Dates</Label>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Manufacture Date</Label>
                    <Input
                      type="date"
                      value={editingFabric.manufactureDate?.split('T')[0] || ''}
                      onChange={(e) => setEditingFabric({ ...editingFabric, manufactureDate: e.target.value || null })}
                      data-testid="input-edit-manufacture-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Received Date</Label>
                    <Input
                      type="date"
                      value={editingFabric.receivedDate?.split('T')[0] || ''}
                      onChange={(e) => setEditingFabric({ ...editingFabric, receivedDate: e.target.value })}
                      data-testid="input-edit-received-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Expiration Date</Label>
                    <Input
                      type="date"
                      value={editingFabric.expirationDate?.split('T')[0] || ''}
                      onChange={(e) => setEditingFabric({ ...editingFabric, expirationDate: e.target.value || null })}
                      data-testid="input-edit-expiration"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Square Meters</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingFabric.squareMeters || 0}
                    onChange={(e) => setEditingFabric({ ...editingFabric, squareMeters: parseFloat(e.target.value) || 0 })}
                    data-testid="input-edit-square-meters"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Snowflake className="h-4 w-4" />
                    Freezer Location
                  </Label>
                  <Select
                    value={editingFabric.freezerLocation || 'none'}
                    onValueChange={(val) => setEditingFabric({ ...editingFabric, freezerLocation: val === 'none' ? null : val })}
                  >
                    <SelectTrigger data-testid="select-edit-freezer">
                      <SelectValue placeholder="Select freezer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Freezer</SelectItem>
                      <SelectItem value="Freezer 1">Freezer 1</SelectItem>
                      <SelectItem value="Freezer 2">Freezer 2</SelectItem>
                      <SelectItem value="Freezer 3">Freezer 3</SelectItem>
                      <SelectItem value="Freezer 4">Freezer 4</SelectItem>
                      <SelectItem value="Freezer 5">Freezer 5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20">
                <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  COC Document (Certificate of Conformance)
                </Label>
                <Input
                  value={editingFabric.conformanceDocumentLink || ''}
                  onChange={(e) => setEditingFabric({ ...editingFabric, conformanceDocumentLink: e.target.value || null })}
                  placeholder="Enter COC document link or file path"
                  data-testid="input-edit-coc-link"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditFabricDialogOpen(false); setEditingFabric(null); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingFabric) {
                  updateFabricMutation.mutate({
                    id: editingFabric.id,
                    data: {
                      fabricType: editingFabric.fabricType || null,
                      commonName: editingFabric.commonName || null,
                      rollNumber: editingFabric.rollNumber || null,
                      lotNumber: editingFabric.lotNumber || null,
                      batchNumber: editingFabric.batchNumber || null,
                      internalControlNumber: editingFabric.internalControlNumber || null,
                      squareMeters: editingFabric.squareMeters,
                      freezerLocation: editingFabric.freezerLocation,
                      manufactureDate: editingFabric.manufactureDate || null,
                      receivedDate: editingFabric.receivedDate || null,
                      expirationDate: editingFabric.expirationDate || null,
                      fabricPartNumber: editingFabric.fabricPartNumber || null,
                      supplierPartNumber: editingFabric.supplierPartNumber || null,
                      conformanceDocumentLink: editingFabric.conformanceDocumentLink || null,
                    },
                  });
                }
              }}
              disabled={
                !editingFabric?.rollNumber || 
                !editingFabric?.expirationDate || 
                updateFabricMutation.isPending
              }
              data-testid="btn-save-fabric"
            >
              {updateFabricMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!fabricToDelete} onOpenChange={(open) => !open && setFabricToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fabric Roll?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this fabric roll? This action cannot be undone.
              {fabricToDelete && (
                <div className="mt-2 p-2 bg-muted rounded">
                  <p><strong>Type:</strong> {fabricToDelete.fabricType || fabricToDelete.commonName}</p>
                  <p><strong>Roll:</strong> {fabricToDelete.rollNumber}</p>
                  <p><strong>Lot:</strong> {fabricToDelete.lotNumber || 'N/A'}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fabricToDelete && deleteFabricMutation.mutate(fabricToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-confirm-delete-fabric"
            >
              {deleteFabricMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

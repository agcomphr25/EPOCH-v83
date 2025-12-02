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
import { Checkbox } from "@/components/ui/checkbox";
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
  Factory,
  Edit,
  Trash2,
  ExternalLink,
  FileText
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
import { BarcodeInputField } from "@/components/BarcodeInputField";

type FabricInventoryItem = {
  id: string;
  fabricType: string;
  fabricPartNumber: string | null;
  nickname: string | null;
  supplierPartNumber: string | null;
  internalControlNumber: string | null;
  lotNumber: string | null;    // Primary lot/batch identifier from receiving (Supplier Batch/Lot/C #)
  batchNumber: string | null;  // Secondary identifier (Aluminum Heat # etc.)
  rollNumber: string;
  quantityInStock: number;
  squareMeters: number;
  receivedDate: string;
  expirationDate: string | null;
  location: string;
  barcodeValue: string;
  status: 'available' | 'low' | 'expired' | 'expiring';
  conformanceDocumentLink: string | null;  // Certificate of Conformance link
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

// Enhanced fabric type mapping for status thresholds
// Low threshold determines when status shows as "low" vs "available"
const FABRIC_TYPE_THRESHOLDS: Record<string, { low: number; target: number }> = {
  'carbon_fiber': { low: 50, target: 400 },
  'carbon fiber': { low: 50, target: 400 },
  'fiberglass': { low: 5, target: 40 },
  'kevlar': { low: 5, target: 100 },
  'default': { low: 3, target: 50 },  // Default: low only when 2 or fewer on hand
};

// Type for resolved fabric with full traceability data for packets
type ScannedFabricForPacket = {
  fabricId: string;
  barcodeValue: string;
  fabricType: string;
  fabricPartNumber: string | null;
  internalControlNumber: string | null;
  batchNumber: string | null;  // Batch/Lot #
  rollNumber: string | null;
  lotNumber: string | null;
  supplierPartNumber: string | null;
  expirationDate: string | null;
  scannedAt: string;
};

// Helper to get fabric status based on type and quantity
const getFabricStatus = (fabricType: string | null | undefined, quantity: number | null | undefined, expirationDate: string | null | undefined): 'available' | 'low' | 'expired' | 'expiring' => {
  // Check expiration first
  if (expirationDate) {
    const expDate = new Date(expirationDate);
    const now = new Date();
    if (!isNaN(expDate.getTime())) {
      if (expDate < now) return 'expired';
      // Warn if expiring within 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      if (expDate < thirtyDaysFromNow) return 'expiring';
    }
  }
  
  // Handle undefined or null quantity - default to available if quantity not tracked
  const qty = typeof quantity === 'number' ? quantity : null;
  if (qty === null) return 'available';
  
  // Normalize fabric type for lookup
  const normalizedType = (fabricType || '').toLowerCase().replace(/[-_]/g, ' ').trim();
  const thresholds = FABRIC_TYPE_THRESHOLDS[normalizedType] || FABRIC_TYPE_THRESHOLDS['default'];
  
  if (qty < thresholds.low) return 'low';
  return 'available';
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
    squareMeters: "",
    expirationDate: "",
    location: "",
    notes: "",
  });

  const [packetForm, setPacketForm] = useState({
    packetType: "",
    quantity: "",
    scannedFabrics: [] as ScannedFabricForPacket[],  // Now stores full fabric traceability data
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

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingFabric, setEditingFabric] = useState<FabricInventoryItem | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingFabric, setDeletingFabric] = useState<FabricInventoryItem | null>(null);
  
  // Multi-select for batch barcode printing
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [isBatchPrintDialogOpen, setIsBatchPrintDialogOpen] = useState(false);
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  
  // Packet scheduling state
  const [isSchedulePacketDialogOpen, setIsSchedulePacketDialogOpen] = useState(false);
  const [schedulePacketForm, setSchedulePacketForm] = useState({
    inventoryItemId: '',
    quantity: '',
    priority: '50',
    dueDate: '',
    notes: '',
  });
  
  const [editForm, setEditForm] = useState({
    fabricType: '',
    internalControlNumber: '',
    nickname: '',
    supplierPartNumber: '',
    batchNumber: '',
    rollNumber: '',
    quantity: '',
    squareMeters: '',
    expirationDate: '',
    location: '',
    cocLink: '',
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
        lotNumber: item.lotNumber,       // Supplier Batch/Lot/C # from receiving
        batchNumber: item.batchNumber,   // Secondary identifier (Aluminum Heat # etc.)
        rollNumber: item.rollNumber,     // Manufacture Roll # from receiving
        barcodeValue: `FAB-${item.internalControlNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
        status: getFabricStatus(item.fabric || item.fabricType, item.quantityInStock, item.expirationDate),
        conformanceDocumentLink: item.conformanceDocumentLink || null,
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

  // Available packet items for scheduling
  const { data: availablePackets = [] } = useQuery<any[]>({
    queryKey: ['/api/cutting-table-mfg-queue/available-packets'],
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
          quantityInStock: 1,
          squareMeters: data.squareMeters || '0',
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

  const updateFabricMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof editForm }) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fabric: data.fabricType,
          internalControlNumber: data.internalControlNumber,
          nickname: data.nickname,
          supplierPartNumber: data.supplierPartNumber,
          batchNumber: data.batchNumber,
          rollNumber: data.rollNumber,
          quantityInStock: parseInt(data.quantity) || 0,
          squareMeters: data.squareMeters || '0',
          expirationDate: data.expirationDate || null,
          location: data.location,
          conformanceDocumentLink: data.cocLink || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      setIsEditDialogOpen(false);
      setEditingFabric(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update fabric", variant: "destructive" });
    },
  });

  const deleteFabricMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory-full'] });
      setIsDeleteDialogOpen(false);
      setDeletingFabric(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete fabric", variant: "destructive" });
    },
  });

  const buildPacketMutation = useMutation({
    mutationFn: async (data: typeof packetForm) => {
      // Build traceability payload with full fabric details for AS9100 compliance
      const traceabilityData = data.scannedFabrics.map(fabric => ({
        fabricId: fabric.fabricId,
        barcodeValue: fabric.barcodeValue,
        fabricType: fabric.fabricType,
        fabricPartNumber: fabric.fabricPartNumber,
        internalControlNumber: fabric.internalControlNumber,
        batchNumber: fabric.batchNumber,  // Batch/Lot # for traceability
        rollNumber: fabric.rollNumber,
        lotNumber: fabric.lotNumber,
        supplierPartNumber: fabric.supplierPartNumber,
        expirationDate: fabric.expirationDate,
        scannedAt: fabric.scannedAt,
      }));
      
      return apiRequest('/api/cutting-table/packet-sessions', {
        method: 'POST',
        body: JSON.stringify({
          packetType: data.packetType,
          packetsBuilt: parseInt(data.quantity) || 1,
          fabricTraceability: traceabilityData,  // Full traceability data
          fabricLots: traceabilityData.map(f => f.barcodeValue),  // Backward compatibility
          createdAt: new Date().toISOString(),
        }),
      });
    },
    onSuccess: () => {
      const fabricCount = packetForm.scannedFabrics.length;
      toast({ 
        title: "Packet Created with Traceability", 
        description: `Packet recorded with ${fabricCount} fabric lot(s) linked for AS9100 compliance` 
      });
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

  // Schedule packet mutation
  const schedulePacketMutation = useMutation({
    mutationFn: async (data: typeof schedulePacketForm) => {
      return apiRequest('/api/cutting-table-mfg-queue/schedule-packet', {
        method: 'POST',
        body: JSON.stringify({
          inventoryItemId: parseInt(data.inventoryItemId),
          quantity: parseInt(data.quantity),
          priority: parseInt(data.priority) || 50,
          dueDate: data.dueDate || null,
          notes: data.notes || null,
          requestedBy: currentUser?.username || 'unknown',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/cutting-table-mfg-queue/cutting-table'],
        exact: false 
      });
      setIsSchedulePacketDialogOpen(false);
      setSchedulePacketForm({
        inventoryItemId: '',
        quantity: '',
        priority: '50',
        dueDate: '',
        notes: '',
      });
      toast({
        title: 'Packet scheduled',
        description: 'Packet has been added to the manufacturing queue.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to schedule packet',
        variant: 'destructive',
      });
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
    if (!scannedBarcode) return;
    
    // Look up the fabric in inventory by barcode or ICN
    const matchedFabric = fabricInventory.find(f => 
      f.barcodeValue === scannedBarcode || 
      f.internalControlNumber === scannedBarcode ||
      f.barcodeValue?.includes(scannedBarcode) ||
      scannedBarcode.includes(f.internalControlNumber || '')
    );
    
    if (!matchedFabric) {
      toast({ 
        title: "Fabric Not Found", 
        description: `No fabric found with barcode "${scannedBarcode}". Please verify the barcode is correct.`,
        variant: "destructive" 
      });
      return;
    }
    
    // Check if already scanned
    if (packetForm.scannedFabrics.some(sf => sf.fabricId === matchedFabric.id)) {
      toast({ 
        title: "Already Scanned", 
        description: `This fabric (${matchedFabric.internalControlNumber || matchedFabric.barcodeValue}) is already in this packet.`,
        variant: "destructive" 
      });
      setScannedBarcode("");
      return;
    }
    
    // Create resolved fabric record with full traceability data
    const resolvedFabric: ScannedFabricForPacket = {
      fabricId: matchedFabric.id,
      barcodeValue: matchedFabric.barcodeValue,
      fabricType: matchedFabric.fabricType,
      fabricPartNumber: matchedFabric.fabricPartNumber,
      internalControlNumber: matchedFabric.internalControlNumber,
      batchNumber: matchedFabric.batchNumber || matchedFabric.lotNumber,  // Use batch or lot
      rollNumber: matchedFabric.rollNumber,
      lotNumber: matchedFabric.lotNumber,
      supplierPartNumber: matchedFabric.supplierPartNumber,
      expirationDate: matchedFabric.expirationDate,
      scannedAt: new Date().toISOString(),
    };
    
    setPacketForm(prev => ({
      ...prev,
      scannedFabrics: [...prev.scannedFabrics, resolvedFabric],
    }));
    
    // Show success with fabric details
    const fabricInfo = [
      matchedFabric.fabricType,
      matchedFabric.batchNumber || matchedFabric.lotNumber ? `Batch: ${matchedFabric.batchNumber || matchedFabric.lotNumber}` : null,
      matchedFabric.rollNumber ? `Roll: ${matchedFabric.rollNumber}` : null,
    ].filter(Boolean).join(' | ');
    
    toast({ 
      title: "Fabric Scanned", 
      description: `Added: ${fabricInfo}` 
    });
    setScannedBarcode("");
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
            const formatExpDate = (dateStr: string | null) => {
              if (!dateStr) return 'N/A';
              try {
                const d = new Date(dateStr);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              } catch { return 'N/A'; }
            };
            printWindow.document.write(`
              <html>
                <head><title>Fabric Label</title>
                <style>
                  body { font-family: Arial, sans-serif; padding: 20px; }
                  .label { border: 2px solid #000; padding: 15px; width: 320px; }
                  .barcode { text-align: center; margin: 10px 0; }
                  .info { font-size: 11px; margin: 4px 0; }
                  .type { font-size: 12px; margin-bottom: 3px; color: #333; }
                  .control-number { font-size: 10px; color: #666; margin-bottom: 5px; }
                  .nickname { font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #000; }
                  .roll-number { font-size: 16px; font-weight: bold; margin-bottom: 8px; color: #1a56db; }
                  .expiration { font-size: 14px; font-weight: bold; margin-top: 8px; padding: 4px 8px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px; display: inline-block; }
                  .expiration.expired { background: #fee2e2; border-color: #dc2626; color: #dc2626; }
                </style>
                </head>
                <body>
                  <div class="label">
                    ${fabric.nickname ? `<div class="nickname">${fabric.nickname}</div>` : `<div class="nickname">${fabric.fabricType || 'Fabric'}</div>`}
                    <div class="roll-number">Roll #${fabric.rollNumber || 'N/A'}</div>
                    <div class="type">${fabric.fabricType || ''}</div>
                    <div class="control-number">ICN: ${fabric.internalControlNumber || 'N/A'}</div>
                    <div class="barcode"><img src="${data.barcodeImage}" alt="barcode" /></div>
                    <div class="info"><strong>Batch/Lot:</strong> ${fabric.batchNumber || fabric.lotNumber || 'N/A'}</div>
                    ${fabric.supplierPartNumber ? `<div class="info"><strong>Supplier P/N:</strong> ${fabric.supplierPartNumber}</div>` : ''}
                    <div class="expiration ${fabric.expirationDate && new Date(fabric.expirationDate) < new Date() ? 'expired' : ''}">
                      EXP: ${formatExpDate(fabric.expirationDate)}
                    </div>
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

  // Multi-select handlers for batch printing
  const toggleSelectForPrint = (id: string) => {
    setSelectedForPrint(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedForPrint.size === fabricInventory.length) {
      setSelectedForPrint(new Set());
    } else {
      setSelectedForPrint(new Set(fabricInventory.map(item => item.id)));
    }
  };

  const openBatchPrintDialog = () => {
    if (selectedForPrint.size === 0) {
      toast({ title: "No items selected", description: "Please select at least one fabric to print", variant: "destructive" });
      return;
    }
    const initialQuantities: Record<string, number> = {};
    selectedForPrint.forEach(id => {
      initialQuantities[id] = printQuantities[id] || 1;
    });
    setPrintQuantities(initialQuantities);
    setIsBatchPrintDialogOpen(true);
  };

  const handleBatchPrint = () => {
    const selectedItems = fabricInventory.filter(item => selectedForPrint.has(item.id));
    
    if (selectedItems.length === 0) {
      toast({ title: "Error", description: "No valid items to print", variant: "destructive" });
      return;
    }

    // Generate labels array with quantities
    const labels: Array<{ item: FabricInventoryItem; quantity: number }> = [];
    selectedItems.forEach(item => {
      const qty = printQuantities[item.id] || 1;
      for (let i = 0; i < qty; i++) {
        labels.push({ item, quantity: qty });
      }
    });

    // Create print window with Avery 5160 layout (30 labels per sheet, 3 columns x 10 rows)
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: "Error", description: "Could not open print window. Please allow popups.", variant: "destructive" });
      return;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Fabric Barcode Labels - Avery 5160</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <style>
    @page {
      size: letter;
      margin: 0.5in 0.1875in;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 8.5in;
      padding: 0.5in 0.1875in;
    }
    .labels-grid {
      display: grid;
      grid-template-columns: repeat(3, 2.625in);
      grid-auto-rows: 1in;
      gap: 0;
      justify-content: center;
    }
    .label {
      width: 2.625in;
      height: 1in;
      padding: 0.05in 0.1in;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      border: 1px dashed #ccc;
      page-break-inside: avoid;
    }
    @media print {
      .label {
        border: none;
      }
      .no-print {
        display: none !important;
      }
    }
    .label-content {
      text-align: center;
      width: 100%;
    }
    .label-nickname {
      font-size: 8px;
      font-weight: bold;
      margin-bottom: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label-roll {
      font-size: 7px;
      font-weight: bold;
      color: #1a56db;
      margin-bottom: 1px;
    }
    .label-exp {
      font-size: 6px;
      font-weight: bold;
      color: #b45309;
      background: #fef3c7;
      padding: 1px 3px;
      border-radius: 2px;
      display: inline-block;
    }
    .label-exp.expired {
      color: #dc2626;
      background: #fee2e2;
    }
    .barcode-container {
      margin: 2px 0;
      width: 100%;
      display: flex;
      justify-content: center;
    }
    .barcode-container svg {
      max-width: 2.4in;
      height: 28px;
    }
    .barcode-text {
      font-size: 7px;
      font-weight: bold;
      font-family: monospace;
    }
    .print-controls {
      position: fixed;
      top: 10px;
      right: 10px;
      background: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    .print-btn {
      padding: 10px 20px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 10px;
    }
    .print-btn:hover {
      background: #1d4ed8;
    }
    .close-btn {
      padding: 10px 20px;
      background: #6b7280;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="print-controls no-print">
    <button class="print-btn" onclick="window.print()">Print Labels</button>
    <button class="close-btn" onclick="window.close()">Close</button>
    <p style="margin-top: 10px; font-size: 12px; color: #666;">
      ${labels.length} label(s) ready to print on Avery 5160 sheets
    </p>
  </div>
  
  <div class="sheet">
    <div class="labels-grid">
      ${labels.map((labelData, index) => {
        const expDate = labelData.item.expirationDate;
        const isExpired = expDate ? new Date(expDate) < new Date() : false;
        const formatExp = (d: string | null) => {
          if (!d) return 'N/A';
          try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }); } 
          catch { return 'N/A'; }
        };
        return `
        <div class="label">
          <div class="label-content">
            <div class="label-nickname">${labelData.item.nickname || labelData.item.fabricType || 'Fabric'}</div>
            <div class="label-roll">Roll #${labelData.item.rollNumber || 'N/A'}</div>
            <div class="barcode-container">
              <svg id="barcode-${index}"></svg>
            </div>
            <div class="label-exp ${isExpired ? 'expired' : ''}">EXP: ${formatExp(expDate)}</div>
          </div>
        </div>
      `}).join('')}
    </div>
  </div>
  
  <script>
    ${labels.map((labelData, index) => `
      JsBarcode("#barcode-${index}", "${labelData.item.barcodeValue}", {
        format: "CODE128",
        width: 1.2,
        height: 28,
        displayValue: false,
        margin: 0
      });
    `).join('')}
  </script>
</body>
</html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    
    setIsBatchPrintDialogOpen(false);
    setSelectedForPrint(new Set());
    toast({ title: "Success", description: `Prepared ${labels.length} labels for printing` });
  };

  const handleOpenEditDialog = (fabric: FabricInventoryItem) => {
    setEditingFabric(fabric);
    setEditForm({
      fabricType: fabric.fabricType || '',
      internalControlNumber: fabric.internalControlNumber || '',
      nickname: fabric.nickname || '',
      supplierPartNumber: fabric.supplierPartNumber || '',
      batchNumber: fabric.batchNumber || '',
      rollNumber: fabric.rollNumber || '',
      quantity: String(fabric.quantityInStock || 0),
      squareMeters: String(fabric.squareMeters || 0),
      expirationDate: fabric.expirationDate ? fabric.expirationDate.split('T')[0] : '',
      location: fabric.location || '',
      cocLink: fabric.conformanceDocumentLink || '',
    });
    setIsEditDialogOpen(true);
  };

  const handleOpenDeleteDialog = (fabric: FabricInventoryItem) => {
    setDeletingFabric(fabric);
    setIsDeleteDialogOpen(true);
  };

  const handleUpdateFabric = () => {
    if (editingFabric) {
      updateFabricMutation.mutate({ id: editingFabric.id, data: editForm });
    }
  };

  const handleDeleteFabric = () => {
    if (deletingFabric) {
      deleteFabricMutation.mutate(deletingFabric.id);
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
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => setIsSchedulePacketDialogOpen(true)}
                    data-testid="button-schedule-packet"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Schedule Packet
                  </Button>
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
                      value={receivingForm.fabricPartNumber || receivingForm.fabricType}
                      onValueChange={(v) => {
                        const selectedItem = fabricItems.find((item: any) => 
                          (item.agPartNumber || item.fabric || item.name) === v
                        );
                        setReceivingForm({ 
                          ...receivingForm, 
                          fabricType: selectedItem?.name || selectedItem?.fabric || v,
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
                    <Label className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Scanned Fabrics for Traceability ({packetForm.scannedFabrics.length})
                    </Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {packetForm.scannedFabrics.map((fabric, idx) => (
                        <div 
                          key={idx} 
                          className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{fabric.fabricType || 'Unknown'}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                              onClick={() => setPacketForm(prev => ({
                                ...prev,
                                scannedFabrics: prev.scannedFabrics.filter((_, i) => i !== idx)
                              }))}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                            <div><strong>ICN:</strong> {fabric.internalControlNumber || 'N/A'}</div>
                            <div><strong>Batch/Lot #:</strong> {fabric.batchNumber || fabric.lotNumber || 'N/A'}</div>
                            {fabric.rollNumber && <div><strong>Roll #:</strong> {fabric.rollNumber}</div>}
                            {fabric.supplierPartNumber && <div><strong>Supplier P/N:</strong> {fabric.supplierPartNumber}</div>}
                            <div className="font-mono text-blue-600">{fabric.barcodeValue}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Full traceability data will be recorded for AS9100 compliance
                    </p>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Fabric Inventory
                  </CardTitle>
                  <CardDescription>
                    View all fabric in stock with lot tracking and print labels
                    {selectedForPrint.size > 0 && (
                      <span className="ml-2 text-blue-600 font-medium">
                        ({selectedForPrint.size} selected)
                      </span>
                    )}
                  </CardDescription>
                </div>
                {selectedForPrint.size > 0 && (
                  <Button
                    onClick={openBatchPrintDialog}
                    className="bg-blue-600 hover:bg-blue-700"
                    data-testid="button-batch-print"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print Labels ({selectedForPrint.size})
                  </Button>
                )}
              </div>
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
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedForPrint.size > 0 && selectedForPrint.size === fabricInventory.length}
                            onCheckedChange={toggleSelectAll}
                            data-testid="checkbox-select-all"
                            title="Select all for printing"
                          />
                        </TableHead>
                        <TableHead>Part #</TableHead>
                        <TableHead>Inventory Item Name</TableHead>
                        <TableHead>Common Name</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Batch #</TableHead>
                        <TableHead>Roll #</TableHead>
                        <TableHead>CoC</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Expiration Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fabricInventory.map((fabric) => (
                        <TableRow key={fabric.id} className={`${selectedForPrint.has(fabric.id) ? 'bg-blue-50 dark:bg-blue-950' : ''} ${fabric.status === 'expired' ? 'bg-red-50 dark:bg-red-950/30' : fabric.status === 'expiring' ? 'bg-amber-50 dark:bg-amber-950/30' : fabric.status === 'low' ? 'bg-yellow-50 dark:bg-yellow-950/30' : ''}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedForPrint.has(fabric.id)}
                              onCheckedChange={() => toggleSelectForPrint(fabric.id)}
                              data-testid={`checkbox-print-${fabric.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{fabric.internalControlNumber || '-'}</TableCell>
                          <TableCell>
                            {(() => {
                              const partNum = fabric.fabricPartNumber || fabric.fabricType;
                              const matchedItem = fabricItems.find((item: any) => item.agPartNumber === partNum);
                              const itemName = matchedItem?.name || fabric.fabricType;
                              const displayName = itemName && itemName !== partNum ? itemName : null;
                              
                              return partNum ? (
                                <div>
                                  <span className="font-medium">{partNum}</span>
                                  {displayName && (
                                    <span className="text-muted-foreground ml-1">({displayName})</span>
                                  )}
                                </div>
                              ) : (
                                fabric.fabricType || 'Unknown'
                              );
                            })()}
                          </TableCell>
                          <TableCell>{fabric.nickname || '-'}</TableCell>
                          <TableCell>{fabric.supplierPartNumber || '-'}</TableCell>
                          <TableCell>{fabric.lotNumber || fabric.batchNumber || '-'}</TableCell>
                          <TableCell>{fabric.rollNumber || '-'}</TableCell>
                          <TableCell>
                            {fabric.conformanceDocumentLink ? (
                              <a
                                href={fabric.conformanceDocumentLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                                title="View Certificate of Conformance"
                                data-testid={`link-coc-${fabric.id}`}
                              >
                                <FileText className="h-4 w-4" />
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {fabric.status === 'expired' && (
                              <Badge variant="destructive" className="text-xs">Expired</Badge>
                            )}
                            {fabric.status === 'expiring' && (
                              <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">Expiring Soon</Badge>
                            )}
                            {fabric.status === 'low' && (
                              <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-300">Low Stock</Badge>
                            )}
                            {fabric.status === 'available' && (
                              <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300">Available</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {fabric.quantityInStock ?? fabric.squareMeters ?? '-'}
                          </TableCell>
                          <TableCell>
                            {fabric.expirationDate 
                              ? new Date(fabric.expirationDate).toLocaleDateString() 
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePrintLabel(fabric)}
                                title="Print Label"
                                data-testid={`button-print-label-${fabric.id}`}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenEditDialog(fabric)}
                                title="Edit"
                                data-testid={`button-edit-fabric-${fabric.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDeleteDialog(fabric)}
                                title="Delete"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-delete-fabric-${fabric.id}`}
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

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Fabric Inventory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fabric Type *</Label>
                <Input
                  value={editForm.fabricType}
                  onChange={(e) => setEditForm({ ...editForm, fabricType: e.target.value })}
                  placeholder="e.g., Carbon Fiber"
                  data-testid="input-edit-fabric-type"
                />
              </div>
              <div className="space-y-2">
                <Label>Internal Control #</Label>
                <Input
                  value={editForm.internalControlNumber}
                  onChange={(e) => setEditForm({ ...editForm, internalControlNumber: e.target.value })}
                  placeholder="ICN-2024-001"
                  data-testid="input-edit-internal-control"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nickname</Label>
                <Input
                  value={editForm.nickname}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                  placeholder="In-house name"
                  data-testid="input-edit-nickname"
                />
              </div>
              <div className="space-y-2">
                <Label>Supplier Part #</Label>
                <Input
                  value={editForm.supplierPartNumber}
                  onChange={(e) => setEditForm({ ...editForm, supplierPartNumber: e.target.value })}
                  placeholder="Supplier part number"
                  data-testid="input-edit-supplier-part"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Batch Number</Label>
                <Input
                  value={editForm.batchNumber}
                  onChange={(e) => setEditForm({ ...editForm, batchNumber: e.target.value })}
                  placeholder="Batch number"
                  data-testid="input-edit-batch-number"
                />
              </div>
              <div className="space-y-2">
                <Label>Roll Number</Label>
                <Input
                  value={editForm.rollNumber}
                  onChange={(e) => setEditForm({ ...editForm, rollNumber: e.target.value })}
                  placeholder="Roll number"
                  data-testid="input-edit-roll-number"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  placeholder="Quantity"
                  data-testid="input-edit-quantity"
                />
              </div>
              <div className="space-y-2">
                <Label>Square Meters</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.squareMeters}
                  onChange={(e) => setEditForm({ ...editForm, squareMeters: e.target.value })}
                  placeholder="Square meters"
                  data-testid="input-edit-sqm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  placeholder="Storage location"
                  data-testid="input-edit-location"
                />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input
                  type="date"
                  value={editForm.expirationDate}
                  onChange={(e) => setEditForm({ ...editForm, expirationDate: e.target.value })}
                  data-testid="input-edit-expiration"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                Certificate of Conformance (CoC) Link
              </Label>
              <Input
                type="url"
                value={editForm.cocLink}
                onChange={(e) => setEditForm({ ...editForm, cocLink: e.target.value })}
                placeholder="https://drive.google.com/... or other link to CoC document"
                data-testid="input-edit-coc-link"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateFabric}
              disabled={updateFabricMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateFabricMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fabric Inventory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this fabric inventory item?
              {deletingFabric && (
                <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded">
                  <div className="font-medium">{deletingFabric.fabricType}</div>
                  <div className="text-sm">ICN: {deletingFabric.internalControlNumber || 'N/A'}</div>
                  <div className="text-sm">Batch: {deletingFabric.batchNumber || 'N/A'}</div>
                  <div className="text-sm">Qty: {deletingFabric.quantityInStock}</div>
                </div>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFabric}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteFabricMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteFabricMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Print Dialog */}
      <Dialog open={isBatchPrintDialogOpen} onOpenChange={setIsBatchPrintDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Print Barcode Labels</DialogTitle>
            <DialogDescription>
              Set the quantity of labels to print for each selected fabric. Labels will be formatted for Avery 5160 sheets (30 labels per sheet).
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto py-4">
            <div className="space-y-3">
              {fabricInventory
                .filter(item => selectedForPrint.has(item.id))
                .map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{item.fabricType || 'Unknown Fabric'}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.lotNumber || item.batchNumber ? `Batch: ${item.lotNumber || item.batchNumber}` : ''}
                        {item.rollNumber && ` | Roll: ${item.rollNumber}`}
                      </p>
                      <p className="text-xs font-mono text-blue-600">{item.barcodeValue}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Label htmlFor={`qty-${item.id}`} className="text-sm whitespace-nowrap">Qty:</Label>
                      <Input
                        id={`qty-${item.id}`}
                        type="number"
                        min={1}
                        max={100}
                        value={printQuantities[item.id] || 1}
                        onChange={(e) => setPrintQuantities(prev => ({
                          ...prev,
                          [item.id]: Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                        }))}
                        className="w-20"
                        data-testid={`input-print-qty-${item.id}`}
                      />
                    </div>
                  </div>
                ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                <strong>Total Labels:</strong> {Object.values(printQuantities).reduce((a, b) => a + b, 0)}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Labels will be arranged in a 3-column grid for Avery 5160 label sheets
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBatchPrint} className="bg-blue-600 hover:bg-blue-700" data-testid="button-confirm-print">
              <Printer className="h-4 w-4 mr-2" />
              Print Labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule Packet Dialog */}
      <Dialog open={isSchedulePacketDialogOpen} onOpenChange={setIsSchedulePacketDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Packet Production</DialogTitle>
            <DialogDescription>
              Add a packet item to the cutting table manufacturing queue. Select an inventory item marked as "Packet (Cutting Table)".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="packet-item">Packet Item *</Label>
              <Select 
                value={schedulePacketForm.inventoryItemId} 
                onValueChange={(value) => setSchedulePacketForm(prev => ({ ...prev, inventoryItemId: value }))}
              >
                <SelectTrigger data-testid="select-packet-item">
                  <SelectValue placeholder="Select a packet item" />
                </SelectTrigger>
                <SelectContent>
                  {availablePackets.map((packet: any) => (
                    <SelectItem key={packet.id} value={packet.id.toString()}>
                      {packet.agPartNumber} - {packet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availablePackets.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No packet items available. Mark inventory items as "Packet (Cutting Table)" in the Parts List to schedule them here.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="packet-quantity">Quantity *</Label>
              <Input
                id="packet-quantity"
                type="number"
                min={1}
                value={schedulePacketForm.quantity}
                onChange={(e) => setSchedulePacketForm(prev => ({ ...prev, quantity: e.target.value }))}
                placeholder="Enter quantity to produce"
                data-testid="input-packet-quantity"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packet-priority">Priority (1-100, lower = higher priority)</Label>
              <Input
                id="packet-priority"
                type="number"
                min={1}
                max={100}
                value={schedulePacketForm.priority}
                onChange={(e) => setSchedulePacketForm(prev => ({ ...prev, priority: e.target.value }))}
                placeholder="50"
                data-testid="input-packet-priority"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packet-due-date">Due Date (optional)</Label>
              <Input
                id="packet-due-date"
                type="date"
                value={schedulePacketForm.dueDate}
                onChange={(e) => setSchedulePacketForm(prev => ({ ...prev, dueDate: e.target.value }))}
                data-testid="input-packet-due-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packet-notes">Notes (optional)</Label>
              <Textarea
                id="packet-notes"
                value={schedulePacketForm.notes}
                onChange={(e) => setSchedulePacketForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes..."
                data-testid="input-packet-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSchedulePacketDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => schedulePacketMutation.mutate(schedulePacketForm)}
              disabled={!schedulePacketForm.inventoryItemId || !schedulePacketForm.quantity || schedulePacketMutation.isPending}
              data-testid="button-confirm-schedule"
            >
              {schedulePacketMutation.isPending ? 'Scheduling...' : 'Schedule Packet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

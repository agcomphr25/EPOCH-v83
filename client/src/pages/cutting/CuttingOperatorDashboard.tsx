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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
  Barcode,
  ChevronDown,
  ChevronRight,
  Pencil,
  History,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BarcodeInputField } from "@/components/BarcodeInputField";

type BuiltPacketFabricSource = {
  id: number;
  builtPacketId: number;
  fabricInventoryId: string | null;
  fabricType: string | null;
  lotNumber: string | null;
  batchNumber: string | null;
  rollNumber: string | null;
  supplierPartNumber: string | null;
  internalControlNumber: string | null;
  expirationDate: string | null;
  quantityUsed: number;
  isPrimary: boolean;
  createdAt: string;
};

type BuiltPacket = {
  id: number;
  barcode: string;
  packetNumber: number;
  buildDate: string;
  status: string;
  isMixedFabric: boolean;
  fabricSourceCount: number;
  notes: string | null;
  createdBy: string | null;
  allocatedToOrder: string | null;
  categoryName: string | null;
  sku: string | null;
  queueId: string | null;
  quantityOrdered: number | null;
  fabricSources: BuiltPacketFabricSource[];
};

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
  barcode: string | null;
  barcodeValue: string;
  status: 'available' | 'low' | 'expired' | 'expiring' | 'depleted';
  lowStockThreshold: number;
  isFifoNext: boolean;
};

type ManufacturingQueueItem = {
  id: number;
  partNumber: string | null;
  partName: string | null;
  displayName: string | null;
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
  inventoryItemId?: number | null;
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

type SessionUser = { id: number; username: string; role: string };

type MfgBarcodeSegments = {
  raw: string;
  wo: string | null;
  sku: string | null;
  sequence: string | null;
  isMfgFormat: boolean;
};

function parseMfgBarcode(barcode: string): MfgBarcodeSegments {
  if (!barcode) return { raw: barcode, wo: null, sku: null, sequence: null, isMfgFormat: false };
  const match = barcode.match(/^MFG-(\d+)-([^-]+)-(\d+)$/);
  if (match) {
    return { raw: barcode, wo: match[1], sku: match[2], sequence: match[3], isMfgFormat: true };
  }
  return { raw: barcode, wo: null, sku: null, sequence: null, isMfgFormat: false };
}

function buildMfgBarcode(queueId: string | null, sku: string | null, packetNumber: number): string | null {
  if (!queueId || !sku) return null;
  return `MFG-${queueId}-${sku}-${packetNumber}`;
}

function useIsAdmin() {
  const { data: session } = useQuery<SessionUser>({ queryKey: ['/api/auth/session'] });
  const role = session?.role;
  return role === 'ADMIN' || role === 'OWNER';
}

export default function CuttingOperatorDashboard() {
  const { toast } = useToast();
  const isAdmin = useIsAdmin();
  
  const [selectedStatus, setSelectedStatus] = useState<string>("ACTIVE");
  const [selectedMfgItem, setSelectedMfgItem] = useState<ManufacturingQueueItem | null>(null);
  const [isProductionDialogOpen, setIsProductionDialogOpen] = useState(false);
  const [isCuttingWorkflowOpen, setIsCuttingWorkflowOpen] = useState(false);
  const [workflowStep, setWorkflowStep] = useState<'fabric' | 'cutting' | 'complete' | 'disposition'>('fabric');
  const [retrievedFabrics, setRetrievedFabrics] = useState<FabricInventoryItem[]>([]);
  const [completionData, setCompletionData] = useState({
    packetQuantity: '',
    labelQuantity: '',
    printCompleted: false,
  });
  const [dispositionData, setDispositionData] = useState<{
    fabricId: string;
    action: 'depleted' | 'return' | '';
    freezerNumber: string;
  }[]>([]);
  
  const [universalBarcode, setUniversalBarcode] = useState("");
  const [fabricSearch, setFabricSearch] = useState("");
  const [allFabricSearch, setAllFabricSearch] = useState("");
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [selectedPrintIds, setSelectedPrintIds] = useState<number[]>([]);
  const [printQuantities, setPrintQuantities] = useState<Record<number, number>>({});
  const [packetScanBarcode, setPacketScanBarcode] = useState("");
  const [activeScannedPacket, setActiveScannedPacket] = useState<any>(null);
  const [materialScanBarcode, setMaterialScanBarcode] = useState("");
  const [validatedRolls, setValidatedRolls] = useState<any[]>([]);
  const autoCompletePendingRef = useRef(false);

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
  
  const [receivingForm, setReceivingForm] = useState({
    barcode: '',
    fabricId: '',
    fabricName: '',
    currentFreezer: '',
    freezerNumber: '',
    isP2: false,
    generatedBarcode: '',
  });

  const [expandedPacketId, setExpandedPacketId] = useState<number | null>(null);
  const [editFabricSourceOpen, setEditFabricSourceOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<BuiltPacketFabricSource | null>(null);
  const [editingPacketId, setEditingPacketId] = useState<number | null>(null);
  const [confirmDeleteSourceId, setConfirmDeleteSourceId] = useState<number | null>(null);
  const [fabricSourceForm, setFabricSourceForm] = useState({
    fabricType: '',
    lotNumber: '',
    batchNumber: '',
    rollNumber: '',
    supplierPartNumber: '',
    internalControlNumber: '',
    expirationDate: '',
  });

  const { data: currentUser } = useQuery<{ username: string }>({
    queryKey: ['currentUser'],
  });

  const { data: builtPackets = [], isLoading: loadingBuiltPackets, refetch: refetchBuiltPackets } = useQuery<BuiltPacket[]>({
    queryKey: ['/api/cutting-table-mfg-queue/built-packets'],
    queryFn: async () => {
      const res = await fetch('/api/cutting-table-mfg-queue/built-packets?limit=50');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateFabricSourceMutation = useMutation({
    mutationFn: async ({ packetId, sourceId, data }: { packetId: number; sourceId: number; data: Record<string, string> }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/built-packets/${packetId}/fabric-sources/${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/built-packets'] });
      setEditFabricSourceOpen(false);
      setEditingSource(null);
      toast({ title: 'Fabric updated', description: 'Fabric source information has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update fabric source.', variant: 'destructive' });
    },
  });

  const deleteFabricSourceMutation = useMutation({
    mutationFn: async ({ packetId, sourceId }: { packetId: number; sourceId: number }) => {
      return apiRequest(`/api/cutting-table-mfg-queue/built-packets/${packetId}/fabric-sources/${sourceId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/built-packets'] });
      setConfirmDeleteSourceId(null);
      toast({ title: 'Fabric source deleted', description: 'The fabric source record has been removed.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete fabric source.', variant: 'destructive' });
    },
  });

  const { data: packetBOMs = [] } = useQuery<PacketBOM[]>({
    queryKey: ['/api/cutting-table/packet-boms'],
  });

  const { data: fabricInventory = [], isLoading: loadingFabric, refetch: refetchFabric } = useQuery<FabricInventoryItem[]>({
    queryKey: ['/api/cutting-table/fabric-inventory'],
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
        const fabricName = item.fabric || 'Unknown';
        const squareMeters = parseFloat(item.squareMeters) || 0;
        if (!fifoByType[fabricName] && squareMeters > 0) {
          fifoByType[fabricName] = item.id;
        }
      });
      
      return data.map((item: any) => {
        const fabricName = item.fabric || 'Unknown';
        const squareMeters = parseFloat(item.squareMeters) || 0;
        const isDepletedInDB = item.status === 'depleted';
        return {
          ...item,
          fabricType: fabricName,
          commonName: fabricName,
          barcode: item.barcode || null,
          barcodeValue: item.barcode || item.barcodeValue || `FAB-${item.internalControlNumber || 'UNK'}-${item.id?.substring(0, 8) || 'X'}`,
          status: isDepletedInDB ? 'depleted' : getFabricStatus(squareMeters, item.expirationDate, item.lowStockThreshold || 10),
          isFifoNext: fifoByType[fabricName] === item.id,
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
      
      let bomId = item.packetBomId;
      let packetName: string | null = null;
      let userNotes: string | null = null;
      let orderId: string | null = null;
      let materialType: string | null = item.materialType || null;
      if (item.notes) {
        try {
          const parsedNotes = JSON.parse(item.notes);
          if (!bomId) bomId = parsedNotes.bomId;
          packetName = parsedNotes.packetName || null;
          userNotes = parsedNotes.userNotes || null;
          orderId = parsedNotes.orderId || null;
          if (!materialType) materialType = parsedNotes.materialType || null;
        } catch {}
      }

      const displayName = item.displayName || packetName || userNotes || item.partName || orderId || null;
      
      const materialToPacketType: Record<string, string> = {
        'carbon_fiber': 'carbon fiber packet',
        'fiberglass': 'fiberglass packet',
        'mesa': 'mesa packet',
        'p2_disruptor': 'disruptor',
        'p2_disruptor_packet': 'disruptor packet',
        'p2_antenna': 'antenna cover',
        'p2_antenna_cover': 'antenna cover packet',
      };
      
      const allBOMs = packetBOMs || [];
      
      const matchingBOM = 
        (bomId && allBOMs.find((bom: PacketBOM) => String(bom.id) === String(bomId))) ||
        (materialType && materialToPacketType[materialType] && allBOMs.find((bom: PacketBOM) => {
          const target = materialToPacketType[materialType!];
          return bom.packetType.toLowerCase() === target ||
            bom.packetType.toLowerCase().includes(target) ||
            target.includes(bom.packetType.toLowerCase());
        })) ||
        (packetName && allBOMs.find((bom: PacketBOM) => 
          bom.packetType.toLowerCase() === packetName!.toLowerCase() ||
          bom.packetType.toLowerCase().includes(packetName!.toLowerCase()) ||
          packetName!.toLowerCase().includes(bom.packetType.toLowerCase())
        )) ||
        (item.inventoryItemId && allBOMs.find((bom: PacketBOM) => bom.inventoryItemId != null && bom.inventoryItemId === item.inventoryItemId)) ||
        (item.partNumber && allBOMs.find((bom: PacketBOM) => bom.partNumber === item.partNumber)) ||
        (item.partName && allBOMs.find((bom: PacketBOM) => 
          bom.packetType.toLowerCase() === item.partName!.toLowerCase() ||
          bom.packetType.toLowerCase().includes(item.partName!.toLowerCase()) ||
          item.partName!.toLowerCase().includes(bom.packetType.toLowerCase())
        )) ||
        null;
      
      const yieldPerCut = matchingBOM?.yieldPerCut || 4;
      const estimatedCuts = remaining > 0 ? Math.ceil(remaining / yieldPerCut) : 0;
      return {
        ...item,
        quantityOrdered,
        quantityCompleted,
        estimatedCuts,
        displayName,
        packetBomId: bomId || matchingBOM?.id,
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
      if (fifoRolls[type].length < 3 && item.status !== 'expired' && item.status !== 'depleted' && item.squareMeters > 0) {
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
                <title>Packet Labels - Avery 8160</title>
                <style>
                  @page { size: letter; margin: 0.5in 0.1875in 0.5in 0.1875in; }
                  body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                  .labels-container { width: 8.125in; margin: 0 auto; overflow: hidden; }
                  .label {
                    width: 2.625in; height: 1in; padding: 0.04in 0.06in;
                    box-sizing: border-box; page-break-inside: avoid;
                    float: left; overflow: hidden;
                    border: 1px solid #ddd;
                  }
                  .part-number { font-size: 7pt; font-weight: bold; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                  .info { font-size: 6pt; margin: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                  .barcode { width: 2.4in; height: 0.4in; display: block; margin: 2px auto; }
                  .barcode-text { font-size: 5pt; text-align: center; font-family: monospace; margin: 0; }
                  @media print { .label { border: none; } }
                </style>
              </head>
              <body>
                <div class="labels-container">
                ${data.labels.map((label: any) => {
                  const esc = (s: string) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                  return `
                  <div class="label">
                    <div class="part-number">${esc(label.partNumber)}</div>
                    ${label.barcodeImage ? `<img class="barcode" src="${esc(label.barcodeImage)}" alt="barcode" /><div class="barcode-text">${esc(label.barcodeValue)}</div>` : `<div class="info" style="font-family:monospace;font-size:7pt;">${esc(label.barcodeValue)}</div>`}
                    <div class="info">Lot: ${esc(label.fabricLot || 'N/A')} | Roll: ${esc(label.fabricRoll || 'N/A')}</div>
                    <div class="info">${new Date().toLocaleDateString()}</div>
                  </div>`;
                }).join('')}
                </div>
                <script>
                  function waitForImages() {
                    var imgs = document.querySelectorAll('img.barcode');
                    if (imgs.length === 0) { window.print(); return; }
                    var loaded = 0;
                    imgs.forEach(function(img) {
                      if (img.complete) { loaded++; if (loaded === imgs.length) window.print(); }
                      else {
                        img.onload = function() { loaded++; if (loaded === imgs.length) window.print(); };
                        img.onerror = function() { loaded++; if (loaded === imgs.length) window.print(); };
                      }
                    });
                  }
                  if (document.readyState === 'complete') waitForImages();
                  else window.addEventListener('load', waitForImages);
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
        }
      }
      toast({ title: 'Labels Generated', description: `${data.count} labels ready to print.` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate labels.', variant: 'destructive' });
    },
  });

  const generateAllBarcodesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/cutting-table/fabric-inventory/generate-all-barcodes', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      toast({ 
        title: 'Barcodes Generated', 
        description: data.message || `Generated barcodes for ${data.totalProcessed} items.` 
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate barcodes.', variant: 'destructive' });
    },
  });

  const bulkPrintBarcodesMutation = useMutation({
    mutationFn: async ({ queueIds, quantities }: { queueIds: number[], quantities?: Record<number, number> }) => {
      return apiRequest('/api/cutting-table-mfg-queue/bulk-print-barcodes', {
        method: 'POST',
        body: JSON.stringify({ queueIds, quantities }),
      });
    },
    onSuccess: (data: any) => {
      if (data.labels && data.labels.length > 0) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <html>
              <head>
                <title>Packet Barcodes - Avery 8160</title>
                <style>
                  @page { size: letter; margin: 0.5in 0.1875in 0.5in 0.1875in; }
                  body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
                  .labels-container { width: 8.125in; margin: 0 auto; overflow: hidden; }
                  .label {
                    width: 2.625in; height: 1in; padding: 0.04in 0.06in;
                    box-sizing: border-box; page-break-inside: avoid;
                    float: left; overflow: hidden;
                    border: 1px solid #ddd;
                  }
                  .part-number { font-size: 8pt; font-weight: bold; margin-bottom: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                  .info { font-size: 6pt; margin: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                  .barcode { width: 2.4in; height: 0.4in; display: block; margin: 2px auto; }
                  .barcode-text { font-size: 5pt; text-align: center; font-family: monospace; margin: 0; }
                  @media print { .label { border: none; } }
                </style>
              </head>
              <body>
                <div class="labels-container">
                ${data.labels.map((label: any) => {
                  const esc = (s: string) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
                  return `
                  <div class="label">
                    <div class="part-number">${esc(label.partNumber)} — ${label.sequenceNumber}/${label.quantityRequested}</div>
                    ${label.barcodeImage ? `<img class="barcode" src="${esc(label.barcodeImage)}" alt="barcode" /><div class="barcode-text">${esc(label.barcodeValue)}</div>` : `<div class="info" style="font-family:monospace;font-size:7pt;">${esc(label.barcodeValue)}</div>`}
                    <div class="info">Due: ${label.dueDate ? new Date(label.dueDate).toLocaleDateString() : 'N/A'}</div>
                  </div>`;
                }).join('')}
                </div>
                <script>
                  function waitForImages() {
                    var imgs = document.querySelectorAll('img.barcode');
                    if (imgs.length === 0) { window.print(); return; }
                    var loaded = 0;
                    imgs.forEach(function(img) {
                      if (img.complete) { loaded++; if (loaded === imgs.length) window.print(); }
                      else {
                        img.onload = function() { loaded++; if (loaded === imgs.length) window.print(); };
                        img.onerror = function() { loaded++; if (loaded === imgs.length) window.print(); };
                      }
                    });
                  }
                  if (document.readyState === 'complete') waitForImages();
                  else window.addEventListener('load', waitForImages);
                </script>
              </body>
            </html>
          `);
          printWindow.document.close();
        }
      }
      setSelectedPrintIds([]);
      toast({ title: 'Barcodes Ready', description: `${data.count} packet barcode labels ready to print.` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to generate packet barcodes.', variant: 'destructive' });
    },
  });

  const scanStartMutation = useMutation({
    mutationFn: async (barcode: string) => {
      return apiRequest('/api/cutting-table-mfg-queue/scan-start', {
        method: 'POST',
        body: JSON.stringify({ barcode, username: currentUser?.username || 'scanner' }),
      });
    },
    onSuccess: (data: any) => {
      setActiveScannedPacket(data);
      setValidatedRolls([]);
      setMaterialScanBarcode("");
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table-mfg-queue/cutting-table'] });
      toast({ title: 'Packet Started', description: `${data.queueItem?.partNumber || 'Packet'} is now active. Scan material rolls to begin.` });
    },
    onError: (error: any) => {
      toast({ title: 'Scan Error', description: error?.message || 'Failed to start packet from barcode.', variant: 'destructive' });
    },
  });

  const validateMaterialMutation = useMutation({
    mutationFn: async ({ queueId, barcode }: { queueId: number; barcode: string }) => {
      const res = await fetch(`/api/cutting-table-mfg-queue/${queueId}/validate-material`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw { ...data, status: res.status };
      }
      return data;
    },
    onSuccess: (data: any) => {
      if (data.valid && data.roll) {
        if (validatedRolls.find(r => r.id === data.roll.id)) {
          toast({ title: 'Already Added', description: 'This roll is already in your list.' });
          return;
        }
        const updatedRolls = [...validatedRolls, { ...data.roll, warning: data.warning }];
        setValidatedRolls(updatedRolls);
        toast({
          title: 'Material Accepted',
          description: `${data.roll.fabric || data.roll.nickname} - Roll ${data.roll.rollNumber} matches the BOM.`,
        });

        const bomMaterials = activeScannedPacket?.bomMaterials || [];
        let totalRollsRequired = bomMaterials.reduce((sum: number, m: any) => sum + (m.rollsRequired || 1), 0);
        if (totalRollsRequired === 0) {
          const bomParts = activeScannedPacket?.bomParts || [];
          const distinctFabricTypes = new Set(bomParts.map((p: any) => (p.fabricType || p.commonName || '').toLowerCase()).filter(Boolean));
          totalRollsRequired = distinctFabricTypes.size;
        }
        if (totalRollsRequired > 0 && updatedRolls.length >= totalRollsRequired && activeScannedPacket?.queueItem && !autoCompletePendingRef.current) {
          autoCompletePendingRef.current = true;
          const qi = activeScannedPacket.queueItem;
          const fabricSources = updatedRolls.map((r: any) => ({
            fabricInventoryId: r.id,
            fabricType: r.fabric || r.nickname || '',
            lotNumber: r.lotNumber,
            batchNumber: r.batchNumber,
            rollNumber: r.rollNumber,
            internalControlNumber: r.internalControlNumber,
            expirationDate: r.expirationDate,
            quantityUsed: 1,
            isDepleted: false,
          }));
          toast({
            title: 'All Materials Scanned',
            description: `${totalRollsRequired} roll(s) validated — completing packet...`,
          });
          completeWithTraceabilityMutation.mutate({
            id: qi.id,
            quantityCompleted: 1,
            fabricSources,
            completedBy: currentUser?.username || 'unknown',
            completionNotes: 'Auto-completed: all required materials scanned.',
          }, {
            onSuccess: () => {
              autoCompletePendingRef.current = false;
              handleCloseScannedPacket();
            },
            onError: () => {
              autoCompletePendingRef.current = false;
            },
          });
        }
      }
      setMaterialScanBarcode("");
    },
    onError: (error: any) => {
      const errorMsg = error?.status === 404 
        ? `Roll not found in inventory. Scanned: ${error?.scannedBarcode || materialScanBarcode}` 
        : (error?.error || 'This material does not match the BOM requirements for this packet.');
      toast({
        title: error?.status === 404 ? 'Roll Not Found' : 'Material Rejected',
        description: errorMsg,
        variant: 'destructive',
      });
      setMaterialScanBarcode("");
    },
  });

  const handlePacketScan = (barcode: string) => {
    if (!barcode.trim() || scanStartMutation.isPending) return;
    scanStartMutation.mutate(barcode.trim());
    setPacketScanBarcode("");
  };

  const handleMaterialScan = (barcode: string) => {
    if (!barcode.trim() || !activeScannedPacket?.queueItem?.id || validateMaterialMutation.isPending) return;
    validateMaterialMutation.mutate({
      queueId: activeScannedPacket.queueItem.id,
      barcode: barcode.trim(),
    });
  };

  const packetScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSubmittedPacketRef = useRef<string>("");
  useEffect(() => {
    if (packetScanTimerRef.current) {
      clearTimeout(packetScanTimerRef.current);
      packetScanTimerRef.current = null;
    }
    if (packetScanBarcode && packetScanBarcode.length > 5 && packetScanBarcode.startsWith('MFG-') && /^MFG-\d+-[^-]+/.test(packetScanBarcode)) {
      packetScanTimerRef.current = setTimeout(() => {
        if (packetScanBarcode !== lastSubmittedPacketRef.current) {
          lastSubmittedPacketRef.current = packetScanBarcode;
          handlePacketScan(packetScanBarcode);
        }
      }, 400);
    }
    return () => {
      if (packetScanTimerRef.current) clearTimeout(packetScanTimerRef.current);
    };
  }, [packetScanBarcode]);

  const materialScanTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSubmittedMaterialRef = useRef<string>("");
  useEffect(() => {
    if (materialScanTimerRef.current) {
      clearTimeout(materialScanTimerRef.current);
      materialScanTimerRef.current = null;
    }
    if (materialScanBarcode && materialScanBarcode.length > 5 && activeScannedPacket?.queueItem?.id) {
      materialScanTimerRef.current = setTimeout(() => {
        if (materialScanBarcode !== lastSubmittedMaterialRef.current) {
          lastSubmittedMaterialRef.current = materialScanBarcode;
          handleMaterialScan(materialScanBarcode);
        }
      }, 400);
    }
    return () => {
      if (materialScanTimerRef.current) clearTimeout(materialScanTimerRef.current);
    };
  }, [materialScanBarcode]);

  const handleCloseScannedPacket = () => {
    setActiveScannedPacket(null);
    setValidatedRolls([]);
    setMaterialScanBarcode("");
    autoCompletePendingRef.current = false;
  };

  const handleCompleteScannedPacket = () => {
    if (!activeScannedPacket?.queueItem) return;
    const qi = activeScannedPacket.queueItem;

    if (validatedRolls.length > 0) {
      const fabricSources = validatedRolls.map((r: any) => ({
        fabricInventoryId: r.id,
        fabricType: r.fabric || r.nickname || '',
        lotNumber: r.lotNumber,
        batchNumber: r.batchNumber,
        rollNumber: r.rollNumber,
        internalControlNumber: r.internalControlNumber,
        expirationDate: r.expirationDate,
        quantityUsed: 1,
        isDepleted: false,
      }));
      completeWithTraceabilityMutation.mutate({
        id: qi.id,
        quantityCompleted: 1,
        fabricSources,
        completedBy: currentUser?.username || 'unknown',
        completionNotes: `Completed via scan. ${validatedRolls.length} roll(s) recorded.`,
      }, {
        onSuccess: () => {
          handleCloseScannedPacket();
        },
      });
    } else {
      completeItemMutation.mutate({
        id: qi.id,
        quantityCompleted: 1,
        fabricLot: '',
        completionNotes: 'Completed via scan (no material rolls scanned).',
        completedBy: currentUser?.username || 'unknown',
      }, {
        onSuccess: () => {
          handleCloseScannedPacket();
        },
      });
    }
  };

  const togglePrintId = (id: number) => {
    setSelectedPrintIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllPendingForPrint = () => {
    const pendingIds = mfgQueueItems
      .filter(i => i.status === 'PENDING' || i.status === 'IN_PROGRESS')
      .map(i => i.id);
    setSelectedPrintIds(prev => 
      prev.length === pendingIds.length ? [] : pendingIds
    );
  };

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
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
    },
  });

  const assignFreezerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${receivingForm.fabricId}/receive`, {
        method: 'POST',
        body: JSON.stringify({ 
          freezerNumber: parseInt(receivingForm.freezerNumber),
          isP2: receivingForm.isP2,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      if (data.generatedBarcode) {
        setReceivingForm(prev => ({ ...prev, generatedBarcode: data.generatedBarcode }));
        toast({
          title: 'P2 Item Received',
          description: `Barcode generated: ${data.generatedBarcode}`,
        });
      } else {
        toast({
          title: 'Freezer Assigned',
          description: `${receivingForm.fabricName} assigned to Freezer ${receivingForm.freezerNumber}`,
        });
        setReceivingForm({ barcode: '', fabricId: '', fabricName: '', currentFreezer: '', freezerNumber: '', isP2: false, generatedBarcode: '' });
      }
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to receive fabric.', variant: 'destructive' });
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
    setWorkflowStep('fabric');
    setRetrievedFabrics([]);
    setCompletionData({ packetQuantity: '', labelQuantity: '', printCompleted: false });
    setDispositionData([]);
    setScannedFabrics([]);
    setIsCuttingWorkflowOpen(true);
    startItemMutation.mutate(item.id);
  };
  
  const handleFabricRetrieved = (fabric: FabricInventoryItem) => {
    if (!retrievedFabrics.find(f => f.id === fabric.id)) {
      setRetrievedFabrics(prev => [...prev, fabric]);
      setDispositionData(prev => [...prev, { fabricId: fabric.id, action: '', freezerNumber: '' }]);
    }
  };
  
  const handleProceedToCutting = () => {
    if (retrievedFabrics.length === 0) {
      toast({ title: 'Select Fabric', description: 'Please retrieve at least one fabric roll first.', variant: 'destructive' });
      return;
    }
    setWorkflowStep('cutting');
  };
  
  const handleFinishCutting = () => {
    const remaining = (selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0);
    setCompletionData(prev => ({ ...prev, packetQuantity: String(remaining), labelQuantity: String(remaining) }));
    setWorkflowStep('complete');
  };
  
  const handlePrintLabels = () => {
    if (!selectedMfgItem) return;
    const qty = parseInt(completionData.labelQuantity) || 0;
    if (qty > 0) {
      generateLabelsMutation.mutate({ id: selectedMfgItem.id, quantity: qty });
    }
    setCompletionData(prev => ({ ...prev, printCompleted: true }));
  };
  
  const handleProceedToDisposition = () => {
    setWorkflowStep('disposition');
  };
  
  const handleCompleteWorkflow = async () => {
    if (!selectedMfgItem) return;
    
    const qty = parseInt(completionData.packetQuantity) || 0;
    if (qty <= 0) {
      toast({ title: 'Invalid', description: 'Enter a valid packet quantity.', variant: 'destructive' });
      return;
    }
    
    // Process fabric dispositions
    const depletedRollIds = dispositionData.filter(d => d.action === 'depleted').map(d => d.fabricId);
    const returnRolls = dispositionData.filter(d => d.action === 'return' && d.freezerNumber);
    
    // Mark depleted rolls
    if (depletedRollIds.length > 0) {
      try {
        await Promise.all(depletedRollIds.map(rollId => depleteRollMutation.mutateAsync(rollId)));
      } catch (err) {
        console.error('Error depleting rolls:', err);
      }
    }
    
    // Return rolls to freezer
    if (returnRolls.length > 0) {
      try {
        await Promise.all(returnRolls.map(roll => 
          apiRequest(`/api/cutting-table/fabric-inventory/${roll.fabricId}/assign-freezer`, {
            method: 'POST',
            body: JSON.stringify({ freezerNumber: parseInt(roll.freezerNumber) }),
          })
        ));
      } catch (err) {
        console.error('Error returning rolls to freezer:', err);
      }
    }
    
    // Complete with traceability using retrievedFabrics from guided workflow
    if (retrievedFabrics.length > 0) {
      const fabricSources = retrievedFabrics.map(f => ({
        fabricInventoryId: f.id,
        fabricType: f.fabricType,
        lotNumber: f.lotNumber,
        batchNumber: f.batchNumber,
        rollNumber: f.rollNumber,
        internalControlNumber: f.internalControlNumber,
        expirationDate: f.expirationDate,
        quantityUsed: 1,
        isDepleted: depletedRollIds.includes(f.id),
      }));
      
      completeWithTraceabilityMutation.mutate({
        id: selectedMfgItem.id,
        quantityCompleted: qty,
        fabricSources,
        completedBy: currentUser?.username || 'unknown',
        completionNotes: `Workflow completed. Labels printed: ${completionData.labelQuantity || 0}`,
      });
    } else {
      // Fallback to basic completion if no fabrics were retrieved
      completeItemMutation.mutate({
        id: selectedMfgItem.id,
        quantityCompleted: qty,
        fabricLot: '',
        completionNotes: `Workflow completed. Labels printed: ${completionData.labelQuantity || 0}`,
        completedBy: currentUser?.username || 'unknown',
      });
    }
    
    setIsCuttingWorkflowOpen(false);
    resetProductionForm();
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
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
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

  const handleCompleteProduction = async () => {
    if (!selectedMfgItem) return;
    
    const qty = parseInt(productionForm.quantityCompleted) || 0;
    if (qty <= 0) {
      toast({ title: "Invalid", description: "Enter a valid quantity.", variant: "destructive" });
      return;
    }

    // Process any depleted rolls first (await all depletion calls)
    if (productionForm.depletedRolls.length > 0) {
      try {
        await Promise.all(
          productionForm.depletedRolls.map(rollId => depleteRollMutation.mutateAsync(rollId))
        );
        toast({
          title: "Rolls Depleted",
          description: `${productionForm.depletedRolls.length} roll(s) marked as depleted.`,
        });
      } catch (err) {
        console.error('Error depleting rolls:', err);
        toast({ title: "Warning", description: "Some rolls may not have been marked as depleted.", variant: "destructive" });
      }
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

  // Find matching BOM with string comparison and notes parsing
  const matchingBOM = useMemo(() => {
    if (!selectedMfgItem) return null;
    
    // Get bomId from packetBomId or from notes
    let bomId = selectedMfgItem.packetBomId;
    if (!bomId && selectedMfgItem.notes) {
      try {
        const parsedNotes = JSON.parse(selectedMfgItem.notes);
        bomId = parsedNotes.bomId;
      } catch {}
    }
    
    // Find BOM by ID, inventory item FK, or part number (in priority order)
    return packetBOMs.find(b => bomId && String(b.id) === String(bomId)) ||
      packetBOMs.find(b => b.inventoryItemId != null && b.inventoryItemId === (selectedMfgItem as any).inventoryItemId) ||
      packetBOMs.find(b => b.partNumber === selectedMfgItem.partNumber) ||
      null;
  }, [selectedMfgItem, packetBOMs]);

  const pendingReceiving = fabricInventory.filter(f => f.squareMeters > 0 && !f.freezerLocation).length;
  const inProgressCount = mfgQueueItems.filter(i => i.status === 'IN_PROGRESS').length;
  const pendingCount = mfgQueueItems.filter(i => i.status === 'PENDING').length;

  return (
    <div className="space-y-6">
      {/* Header with Quick Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Scissors className="h-6 w-6 text-primary" />
            Operator Dashboard
          </h2>
          <p className="text-muted-foreground text-sm">Cutting workflow, fabric selection, and label printing</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-sm">
            {pendingReceiving > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Package className="h-3 w-3" />
                {pendingReceiving} to assign
              </Badge>
            )}
            {inProgressCount > 0 && (
              <Badge className="bg-blue-500 gap-1">
                <Clock className="h-3 w-3" />
                {inProgressCount} in progress
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <Target className="h-3 w-3" />
                {pendingCount} pending
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36 h-9" data-testid="select-status-filter">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { refetchMfgQueue(); refetchFabric(); }} data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Scan Packet to Start */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-2 rounded-lg bg-primary/10">
                <Scan className="h-4 w-4 text-primary" />
              </div>
              Scan Packet to Start
            </CardTitle>
            <CardDescription className="text-xs">Scan a printed packet barcode to begin work</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-3">
              <BarcodeInputField
                id="packet-scan-barcode"
                value={packetScanBarcode}
                onChange={(val) => {
                  setPacketScanBarcode(val);
                }}
                placeholder="Scan packet barcode (MFG-...)..."
                data-testid="input-packet-scan"
              />
              <Button 
                onClick={() => handlePacketScan(packetScanBarcode)} 
                className="shrink-0"
                disabled={scanStartMutation.isPending}
                data-testid="button-packet-scan"
              >
                {scanStartMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
              </Button>
            </div>
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
                placeholder="Quick scan fabric roll..."
                data-testid="input-universal-barcode"
              />
              <Button onClick={() => handleBarcodeScan(universalBarcode)} className="shrink-0" variant="outline" size="sm" data-testid="button-scan">
                <Scan className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* FIFO Lookup */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Snowflake className="h-4 w-4 text-blue-500" />
              </div>
              FIFO Fabric Lookup
              <span className="text-xs text-muted-foreground font-normal ml-auto">Find next roll to use</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Input
                placeholder="Search fabric type (e.g., cf_, fg_, mesa)..."
                value={fabricSearch}
                onChange={(e) => setFabricSearch(e.target.value)}
                className="w-full"
                data-testid="input-fabric-search"
              />
              
              {fabricSearch.trim() && (() => {
                const searchLower = fabricSearch.toLowerCase();
                const matchingTypes = Object.entries(fifoSuggestions).filter(([type]) => 
                  type.toLowerCase().includes(searchLower)
                );
                
                if (matchingTypes.length === 0) {
                  const directMatches = fabricInventory.filter(f => 
                    f.squareMeters > 0 && f.status !== 'depleted' &&
                    ((f.fabricType || '').toLowerCase().includes(searchLower) ||
                    (f.commonName || '').toLowerCase().includes(searchLower))
                  );
                  
                  if (directMatches.length === 0) {
                    return (
                      <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg text-center">
                        No fabric found matching "{fabricSearch}"
                      </div>
                    );
                  }
                  
                  const totalOnHand = directMatches.reduce((sum, f) => sum + (f.squareMeters || 0), 0);
                  const nextFifo = directMatches.sort((a, b) => {
                    const aExp = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
                    const bExp = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
                    return aExp - bExp;
                  })[0];
                  
                  return (
                    <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{nextFifo?.fabricType || fabricSearch}</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {totalOnHand.toFixed(1)} m² on hand
                        </Badge>
                      </div>
                      {nextFifo && (
                        <div className="flex items-center gap-2 p-2 bg-background rounded-lg border border-green-200 dark:border-green-800">
                          <Badge className="bg-green-600 shrink-0">FIFO Next</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">Roll {nextFifo.rollNumber}</p>
                            {nextFifo.internalControlNumber && (
                              <p className="text-xs font-mono text-blue-600">ICN: {nextFifo.internalControlNumber}</p>
                            )}
                            <p className="text-xs text-muted-foreground truncate">
                              {nextFifo.freezerLocation ? `Freezer ${nextFifo.freezerLocation}` : nextFifo.location || 'No location'}
                              {nextFifo.expirationDate && ` • Exp: ${new Date(nextFifo.expirationDate).toLocaleDateString()}`}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">{nextFifo.squareMeters.toFixed(1)} m²</Badge>
                          <Button size="sm" onClick={() => handleBarcodeScan(nextFifo.barcodeValue)}>
                            Select
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                }
                
                return matchingTypes.slice(0, 3).map(([type, rolls]) => {
                  const allOfType = fabricInventory.filter(f => (f.fabricType || '') === type && f.squareMeters > 0 && f.status !== 'depleted');
                  const totalOnHand = allOfType.reduce((sum, f) => sum + (f.squareMeters || 0), 0);
                  const nextRoll = rolls[0];
                  
                  return (
                    <div key={type} className="p-3 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{type}</span>
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {totalOnHand.toFixed(1)} m² ({allOfType.length} rolls)
                        </Badge>
                      </div>
                      {nextRoll && (
                        <div className="flex items-center gap-2 p-2 bg-background rounded-lg border border-green-200 dark:border-green-800">
                          <Badge className="bg-green-600 shrink-0">FIFO Next</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">Roll {nextRoll.rollNumber}</p>
                            {nextRoll.internalControlNumber && (
                              <p className="text-xs font-mono text-blue-600">ICN: {nextRoll.internalControlNumber}</p>
                            )}
                            <p className="text-xs text-muted-foreground truncate">
                              {nextRoll.freezerLocation ? `Freezer ${nextRoll.freezerLocation}` : nextRoll.location || 'No location'}
                              {nextRoll.expirationDate && ` • Exp: ${new Date(nextRoll.expirationDate).toLocaleDateString()}`}
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">{nextRoll.squareMeters.toFixed(1)} m²</Badge>
                          <Button size="sm" onClick={() => handleBarcodeScan(nextRoll.barcodeValue)}>
                            Select
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
              
              {!fabricSearch.trim() && (
                <div className="text-sm text-muted-foreground p-3 bg-muted/30 rounded-lg text-center">
                  Type a fabric name to see FIFO recommendation and stock levels
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Scanned Packet Panel */}
      {activeScannedPacket && (
        <Card className="border-2 border-blue-500 bg-gradient-to-br from-blue-50/50 to-background dark:from-blue-950/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">
                    Active Packet: {activeScannedPacket.queueItem?.partNumber || 'Unknown'}
                  </CardTitle>
                  <CardDescription>
                    {activeScannedPacket.queueItem?.displayName || activeScannedPacket.queueItem?.partName} — {activeScannedPacket.queueItem?.remaining || 0} packets remaining
                  </CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleCompleteScannedPacket}
                  disabled={completeWithTraceabilityMutation.isPending || completeItemMutation.isPending}
                >
                  {(completeWithTraceabilityMutation.isPending || completeItemMutation.isPending) ? (
                    <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-1" /> {validatedRolls.length > 0 ? `Complete — ${validatedRolls.length} Roll(s)` : 'Complete Packet'}</>
                  )}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCloseScannedPacket}>
                  Close
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Production Info */}
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 text-sm">Production Summary</h4>
                {(() => {
                  const remaining = activeScannedPacket.queueItem?.remaining || 0;
                  const yieldPerCut = activeScannedPacket.bom?.yieldPerCut || 0;
                  const estimatedCuts = activeScannedPacket.queueItem?.estimatedCuts || 0;
                  const bomParts = activeScannedPacket.bomParts || [];
                  const partsPerPacket = bomParts.length;
                  const totalSqm = bomParts.reduce((sum: number, p: any) => {
                    const sqm = parseFloat(p.squareMetersPerPart) || parseFloat(p.squareMetersPerCut) || 0;
                    const qty = parseInt(p.quantityNeeded) || 1;
                    return sum + (sqm * qty);
                  }, 0);
                  const headerSqm = parseFloat(activeScannedPacket.bom?.squareMetersPerCut) || 0;
                  const displaySqm = totalSqm > 0 ? totalSqm.toFixed(1) : (headerSqm > 0 ? headerSqm : '-');
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Remaining</p>
                        <p className="font-bold text-lg">{remaining}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Parts/Packet</p>
                        <p className="font-bold text-lg">{partsPerPacket || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Yield/Cut</p>
                        <p className="font-bold text-lg">{yieldPerCut || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">m²/Packet</p>
                        <p className="font-bold text-lg">{displaySqm}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Required Materials from BOM */}
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 text-sm flex items-center gap-2">
                  <Snowflake className="h-4 w-4" />
                  Required Materials (BOM)
                </h4>
                {activeScannedPacket.bomMaterials && activeScannedPacket.bomMaterials.length > 0 ? (
                  <div className="space-y-1">
                    {activeScannedPacket.bomMaterials.map((mat: any, idx: number) => (
                      <div key={mat.id || idx} className="flex items-center justify-between text-sm p-1.5 bg-background rounded">
                        <span className="font-medium">{mat.fabricType}</span>
                        <div className="flex items-center gap-2">
                          {mat.commonName && <span className="text-xs text-muted-foreground">({mat.commonName})</span>}
                          <Badge variant="secondary" className="text-xs">{mat.rollsRequired} roll(s)</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activeScannedPacket.bomParts && activeScannedPacket.bomParts.length > 0 ? (
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {activeScannedPacket.bomParts.map((part: any, idx: number) => (
                      <div key={part.id || idx} className="flex items-center justify-between text-sm p-1.5 bg-background rounded">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-xs text-muted-foreground font-mono shrink-0">{part.partNumber || `#${idx + 1}`}</span>
                          <span className="font-medium truncate">{part.partDescription || part.commonName || part.fabricType || 'Part'}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {part.quantityNeeded && <Badge variant="secondary" className="text-xs">x{part.quantityNeeded}</Badge>}
                          {part.squareMetersPerPart && <Badge variant="outline" className="text-xs">{part.squareMetersPerPart} m²</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No BOM configured</p>
                )}
              </div>

              {/* FIFO Recommended Rolls */}
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 text-sm flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  FIFO - Pull These Rolls
                </h4>
                {activeScannedPacket.requiredFabricTypes && activeScannedPacket.requiredFabricTypes.length > 0 && (
                  <div className="text-xs text-muted-foreground mb-2">
                    Required: {activeScannedPacket.requiredFabricTypes.join(', ')}
                  </div>
                )}
                {activeScannedPacket.fifoInventory && activeScannedPacket.fifoInventory.length > 0 ? (
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {(() => {
                      const rolls = activeScannedPacket.fifoInventory;
                      const grouped = new Map<string, any[]>();
                      rolls.forEach((roll: any) => {
                        const key = roll.fabricPartNumber || roll.fabric || roll.nickname || 'unknown';
                        if (!grouped.has(key)) grouped.set(key, []);
                        grouped.get(key)!.push(roll);
                      });
                      const displayRolls: any[] = [];
                      grouped.forEach((groupRolls) => {
                        displayRolls.push(groupRolls[0]);
                      });
                      grouped.forEach((groupRolls) => {
                        groupRolls.slice(1).forEach(r => displayRolls.push(r));
                      });
                      return displayRolls.map((roll: any, idx: number) => (
                        <div key={roll.id} className="flex items-center justify-between text-xs p-1.5 bg-background rounded">
                          <div className="flex items-center gap-1">
                            {idx === 0 && <Badge className="bg-green-600 text-[10px] px-1">FIRST</Badge>}
                            <span className="font-medium">{roll.fabric || roll.nickname}</span>
                            {roll.fabricPartNumber && <span className="text-muted-foreground">({roll.fabricPartNumber})</span>}
                          </div>
                          <div className="text-right">
                            <div>Roll {roll.rollNumber}</div>
                            <div className="text-muted-foreground">
                              {roll.freezerNumber ? `Freezer ${roll.freezerNumber}` : roll.location || '-'}
                              {roll.expirationDate && ` | Exp: ${new Date(roll.expirationDate).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                ) : (
                  <p className="text-sm text-amber-600">
                    {activeScannedPacket.requiredFabricTypes && activeScannedPacket.requiredFabricTypes.length > 0 
                      ? 'No matching fabric in inventory for required types' 
                      : 'No BOM fabric types configured - cannot determine required materials'}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Ply Schedule */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Ply Schedule
                </h4>
                {activeScannedPacket.plySchedule && Array.isArray(activeScannedPacket.plySchedule) && activeScannedPacket.plySchedule.length > 0 ? (
                  <div className="max-h-[250px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Ply #</TableHead>
                          <TableHead>Assigned Parts</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const partNameMap: Record<string, string> = {};
                          (activeScannedPacket.bomParts || []).forEach((p: any) => {
                            if (p.partNumber) partNameMap[p.partNumber] = p.partDescription || p.commonName || '';
                          });
                          return activeScannedPacket.plySchedule.map((ply: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{ply.plyNumber || idx + 1}</TableCell>
                              <TableCell>
                                {ply.assignedParts && Array.isArray(ply.assignedParts) ? (
                                  <div className="flex flex-wrap gap-1">
                                    {ply.assignedParts.map((part: any, pidx: number) => (
                                      <Badge key={pidx} variant="outline" className="text-xs">
                                        {partNameMap[part.partNumber] || part.partNumber}{part.quantity > 1 ? ` x${part.quantity}` : ''}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No ply schedule configured for this packet</p>
                )}
              </div>

              {/* Cutting Programs */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  Cutting Programs
                </h4>
                {(() => {
                  const partNameMap: Record<string, string> = {};
                  (activeScannedPacket.bomParts || []).forEach((p: any) => {
                    if (p.partNumber) partNameMap[p.partNumber] = p.partDescription || p.commonName || '';
                  });
                  if (activeScannedPacket.cutPrograms && Array.isArray(activeScannedPacket.cutPrograms) && activeScannedPacket.cutPrograms.length > 0) {
                    return (
                      <div className="max-h-[250px] overflow-y-auto space-y-2">
                        {activeScannedPacket.cutPrograms.map((prog: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-medium text-sm">{prog.programName || `Program ${idx + 1}`}</span>
                              {prog.squareMetersPerCut && (
                                <Badge variant="secondary">{prog.squareMetersPerCut} m²/cut</Badge>
                              )}
                            </div>
                            {prog.assignedParts && Array.isArray(prog.assignedParts) && prog.assignedParts.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {prog.assignedParts.map((part: any, pidx: number) => (
                                  <Badge key={pidx} variant="outline" className="text-xs">
                                    {partNameMap[part.partNumber] || part.partNumber} ({part.yieldPerCut}/cut)
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  } else if (activeScannedPacket.cutsConfig && Array.isArray(activeScannedPacket.cutsConfig) && activeScannedPacket.cutsConfig.length > 0) {
                    return (
                      <div className="max-h-[250px] overflow-y-auto space-y-2">
                        {activeScannedPacket.cutsConfig.map((cut: any, idx: number) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-medium text-sm">{cut.materialName || cut.materialPartNumber || `Cut ${idx + 1}`}</span>
                              <Badge>{cut.cutsNeeded} cut(s)</Badge>
                            </div>
                            {cut.assignedParts && Array.isArray(cut.assignedParts) && cut.assignedParts.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {cut.assignedParts.map((part: any, pidx: number) => (
                                  <Badge key={pidx} variant="secondary" className="text-xs">
                                    {partNameMap[part.partNumber] || part.partNumber} ({part.partsPerCut}/cut)
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  } else { return null; }
                })() || (
                  <p className="text-sm text-muted-foreground py-4 text-center">No cutting programs configured for this packet</p>
                )}
              </div>
            </div>

            {/* Material Roll Scanning */}
            <div className="border-2 border-dashed border-primary/30 rounded-lg p-4">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Barcode className="h-4 w-4" />
                Scan Material Rolls
              </h4>
              <div className="flex gap-2 mb-3">
                <BarcodeInputField
                  id="material-scan-barcode"
                  value={materialScanBarcode}
                  onChange={(val) => {
                    setMaterialScanBarcode(val);
                  }}
                  placeholder="Scan material roll barcode..."
                  data-testid="input-material-scan"
                />
                <Button
                  onClick={() => handleMaterialScan(materialScanBarcode)}
                  className="shrink-0"
                  disabled={validateMaterialMutation.isPending}
                  data-testid="button-material-scan"
                >
                  {validateMaterialMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Scan className="h-4 w-4" />}
                </Button>
              </div>

              {validatedRolls.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    {validatedRolls.length} roll(s) validated and ready
                  </p>
                  {validatedRolls.map((roll: any) => (
                    <div key={roll.id} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <div>
                          <span className="font-medium text-sm">{roll.fabric || roll.nickname}</span>
                          <span className="text-muted-foreground text-sm ml-2">Roll {roll.rollNumber}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right text-xs text-muted-foreground">
                          <div>Lot: {roll.lotNumber || 'N/A'} | Batch: {roll.batchNumber || 'N/A'}</div>
                          <div>
                            {parseFloat(roll.squareMeters || '0').toFixed(1)} m²
                            {roll.expirationDate && ` | Exp: ${new Date(roll.expirationDate).toLocaleDateString()}`}
                          </div>
                        </div>
                        <button
                          onClick={() => setValidatedRolls(prev => prev.filter(r => r.id !== roll.id))}
                          className="ml-1 p-1 text-muted-foreground hover:text-red-600 transition-colors"
                          aria-label="Remove roll"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  Scan material roll barcodes to validate against the BOM
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fabric Receiving Section */}
      {pendingReceiving > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Fabric Receiving</CardTitle>
                  <CardDescription>{pendingReceiving} rolls need freezer assignment</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <div className="max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                    <TableRow>
                      <TableHead>Fabric Type</TableHead>
                      <TableHead>ICN</TableHead>
                      <TableHead>Roll #</TableHead>
                      <TableHead>Lot #</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Assign Freezer</TableHead>
                      <TableHead className="w-20 text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricInventory
                      .filter(f => f.squareMeters > 0 && !f.freezerLocation)
                      .slice(0, 20)
                      .map((fabric) => (
                      <TableRow key={fabric.id} className="hover:bg-muted/50" data-testid={`row-fabric-${fabric.id}`}>
                        <TableCell className="font-medium">{fabric.fabricType || fabric.commonName}</TableCell>
                        <TableCell className="text-xs font-mono text-blue-600">{fabric.internalControlNumber || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">{fabric.rollNumber || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fabric.lotNumber || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono">
                            {fabric.squareMeters?.toFixed(1)} m²
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={fabric.freezerLocation || ''} 
                            onValueChange={(val) => {
                              setReceivingForm({
                                barcode: '',
                                fabricId: fabric.id,
                                fabricName: fabric.fabricType || fabric.commonName || '',
                                currentFreezer: fabric.freezerLocation || '',
                                freezerNumber: val,
                                isP2: false,
                                generatedBarcode: ''
                              });
                              apiRequest(`/api/cutting-table/fabric-inventory/${fabric.id}/assign-freezer`, {
                                method: 'POST',
                                body: JSON.stringify({ freezerNumber: val }),
                              }).then(() => {
                                queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
                                toast({ title: 'Updated', description: `Assigned to Freezer ${val}` });
                              }).catch(() => {
                                toast({ title: 'Error', description: 'Failed to update freezer', variant: 'destructive' });
                              });
                            }}
                          >
                            <SelectTrigger className="w-32" data-testid={`select-freezer-${fabric.id}`}>
                              <Snowflake className="h-3 w-3 mr-1 text-blue-500" />
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 20 }, (_, i) => (
                                <SelectItem key={i + 1} value={String(i + 1)}>Freezer {i + 1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => {
                                window.open(`/api/cutting-table/fabric-inventory/${fabric.id}/print-barcode`, '_blank');
                                if (!fabric.barcode) {
                                  refetchFabric();
                                }
                              }}
                              title="Print Barcode"
                              data-testid={`button-print-barcode-${fabric.id}`}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Accordion type="single" collapsible className="w-full" defaultValue="">
        <AccordionItem value="all-fabric" className="border rounded-lg bg-card">
          <AccordionTrigger className="px-6 py-4 hover:no-underline">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div className="text-left">
                <div className="font-semibold">All Fabric Inventory</div>
                <div className="text-sm text-muted-foreground font-normal">
                  {fabricInventory.filter(f => f.squareMeters > 0 && f.status !== 'depleted').length} rolls on hand - View and print barcodes
                </div>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <Input
                placeholder="Search by fabric type, roll, lot, or barcode..."
                value={allFabricSearch}
                onChange={(e) => setAllFabricSearch(e.target.value)}
                className="flex-1"
                data-testid="input-all-fabric-search"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateAllBarcodesMutation.mutate()}
                disabled={generateAllBarcodesMutation.isPending}
                data-testid="button-generate-all-barcodes"
              >
                <Barcode className="h-4 w-4 mr-1" />
                {generateAllBarcodesMutation.isPending ? 'Generating...' : 'Generate All Barcodes'}
              </Button>
            </div>
            <div className="max-h-[400px] overflow-y-auto rounded-md border">
              {loadingFabric ? (
                <p className="text-muted-foreground text-center py-8">Loading fabric...</p>
              ) : fabricInventory.filter(f => f.squareMeters > 0 && f.status !== 'depleted').length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No fabric on hand</p>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur">
                    <TableRow>
                      <TableHead>Fabric Type</TableHead>
                      <TableHead>ICN</TableHead>
                      <TableHead>Roll #</TableHead>
                      <TableHead>Lot #</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Freezer</TableHead>
                      <TableHead>Barcode</TableHead>
                      <TableHead>Exp Date</TableHead>
                      <TableHead className="w-16">Print</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fabricInventory
                      .filter(f => f.squareMeters > 0 && f.status !== 'depleted')
                      .filter(f => {
                        if (!allFabricSearch.trim()) return true;
                        const search = allFabricSearch.toLowerCase();
                        return (
                          (f.fabricType || '').toLowerCase().includes(search) ||
                          (f.commonName || '').toLowerCase().includes(search) ||
                          (f.rollNumber || '').toLowerCase().includes(search) ||
                          (f.lotNumber || '').toLowerCase().includes(search) ||
                          (f.barcode || '').toLowerCase().includes(search) ||
                          (f.internalControlNumber || '').toLowerCase().includes(search)
                        );
                      })
                      .map((fabric) => (
                      <TableRow key={fabric.id} className="hover:bg-muted/50" data-testid={`row-all-fabric-${fabric.id}`}>
                        <TableCell className="font-medium">{fabric.fabricType || fabric.commonName}</TableCell>
                        <TableCell className="text-xs font-mono text-blue-600">{fabric.internalControlNumber || '-'}</TableCell>
                        <TableCell>{fabric.rollNumber || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fabric.lotNumber || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono">
                            {fabric.squareMeters?.toFixed(1)} m²
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {fabric.freezerLocation ? (
                            <Badge variant="outline" className="text-xs">
                              <Snowflake className="h-3 w-3 mr-1" />
                              {fabric.freezerLocation}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {fabric.barcode ? (
                            <code className="text-xs bg-muted px-2 py-1 rounded">{fabric.barcode}</code>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {fabric.expirationDate ? (
                            <span className={cn(
                              "text-xs",
                              fabric.status === 'expired' ? 'text-red-600 font-medium' : 
                              fabric.status === 'expiring' ? 'text-amber-600' : 'text-muted-foreground'
                            )}>
                              {new Date(fabric.expirationDate).toLocaleDateString()}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              window.open(`/api/cutting-table/fabric-inventory/${fabric.id}/print-barcode`, '_blank');
                              if (!fabric.barcode) {
                                refetchFabric();
                              }
                            }}
                            title="Print Barcode Label"
                            data-testid={`button-print-all-${fabric.id}`}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Scissors className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <CardTitle className="text-base">Scheduled Packets</CardTitle>
                <CardDescription>
                  {mfgQueueItems.length} items in queue
                  {inProgressCount > 0 && ` • ${inProgressCount} in progress`}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  const printableItems = mfgQueueItems.filter(i => i.status === 'PENDING' || i.status === 'IN_PROGRESS');
                  const allIds = printableItems.map(i => i.id);
                  if (allIds.length > 0) bulkPrintBarcodesMutation.mutate({ queueIds: allIds, quantities: printQuantities });
                }}
                disabled={bulkPrintBarcodesMutation.isPending || mfgQueueItems.filter(i => i.status === 'PENDING' || i.status === 'IN_PROGRESS').length === 0}
                data-testid="button-print-all-barcodes"
              >
                <Printer className="h-4 w-4 mr-1" />
                {bulkPrintBarcodesMutation.isPending ? 'Generating...' : 'Print Barcodes'}
              </Button>
              {selectedPrintIds.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => bulkPrintBarcodesMutation.mutate({ queueIds: selectedPrintIds, quantities: printQuantities })}
                  disabled={bulkPrintBarcodesMutation.isPending}
                  data-testid="button-bulk-print-barcodes"
                >
                  <Printer className="h-4 w-4 mr-1" />
                  {`Print ${selectedPrintIds.length} Selected`}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingMfgQueue ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-50" />
              Loading queue...
            </div>
          ) : mfgQueueItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <Scissors className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No items in the queue</p>
              <p className="text-sm">Schedule packets from the Weekly Scheduling page</p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selectedPrintIds.length > 0 && selectedPrintIds.length === mfgQueueItems.filter(i => i.status === 'PENDING' || i.status === 'IN_PROGRESS').length}
                        onChange={selectAllPendingForPrint}
                        className="h-4 w-4 rounded border-gray-300"
                        title="Select all for printing"
                      />
                    </TableHead>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Progress</TableHead>
                    <TableHead className="text-center">Cuts</TableHead>
                    <TableHead className="text-center w-24"># to Print</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Priority</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mfgQueueItems.map((item) => (
                    <TableRow 
                      key={item.id} 
                      className={cn(
                        "hover:bg-muted/50 transition-colors",
                        item.status === 'IN_PROGRESS' && "bg-blue-50/50 dark:bg-blue-950/20",
                        selectedPrintIds.includes(item.id) && "bg-primary/5"
                      )}
                      data-testid={`row-mfg-item-${item.id}`}
                    >
                      <TableCell>
                        {(item.status === 'PENDING' || item.status === 'IN_PROGRESS') && (
                          <input
                            type="checkbox"
                            checked={selectedPrintIds.includes(item.id)}
                            onChange={() => togglePrintId(item.id)}
                            className="h-4 w-4 rounded border-gray-300"
                            data-testid={`checkbox-print-${item.id}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-medium">{item.partNumber || '-'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.displayName || item.partName || '-'}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <span className={cn(
                            "font-medium",
                            item.quantityCompleted >= item.quantityOrdered && 'text-green-600'
                          )}>
                            {item.quantityCompleted}
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span>{item.quantityOrdered}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">{item.estimatedCuts}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {(item.status === 'PENDING' || item.status === 'IN_PROGRESS') && (
                          <Input
                            type="number"
                            min={1}
                            max={item.quantityOrdered}
                            value={printQuantities[item.id] ?? item.quantityOrdered}
                            onChange={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              setPrintQuantities(prev => ({
                                ...prev,
                                [item.id]: Math.max(1, Math.min(val, item.quantityOrdered))
                              }));
                            }}
                            className="w-16 h-7 text-center text-sm mx-auto"
                            data-testid={`input-print-qty-${item.id}`}
                          />
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={item.priority >= 80 ? "destructive" : item.priority >= 60 ? "default" : "secondary"}
                          className="font-mono"
                        >
                          {item.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
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
                            <>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => { setSelectedMfgItem(item); setIsCuttingWorkflowOpen(true); }}
                                data-testid={`button-view-workflow-${item.id}`}
                              >
                                <Scissors className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button 
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => { setSelectedMfgItem(item); setIsProductionDialogOpen(true); }}
                                data-testid={`button-complete-${item.id}`}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            </>
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Made Packets — view & edit fabric traceability */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <History className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-base">Made Packets</CardTitle>
                <CardDescription className="text-xs">View and correct fabric traceability on completed packets</CardDescription>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchBuiltPackets()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingBuiltPackets ? (
            <div className="text-sm text-muted-foreground py-4 text-center">Loading...</div>
          ) : builtPackets.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No built packets found.</div>
          ) : (
            (() => {
              const packetsByDate = builtPackets.reduce<Record<string, typeof builtPackets>>((acc, packet) => {
                const d = new Date(packet.buildDate);
                const isoKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (!acc[isoKey]) acc[isoKey] = [];
                acc[isoKey].push(packet);
                return acc;
              }, {});
              const sortedDates = Object.keys(packetsByDate).sort((a, b) => b.localeCompare(a));
              const todayKey = (() => {
                const t = new Date();
                return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
              })();
              const defaultOpen = sortedDates.includes(todayKey) ? [todayKey] : [];
              return (
                <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
                  {sortedDates.map((isoKey) => {
                    const packets = packetsByDate[isoKey];
                    const displayDate = new Date(isoKey + 'T00:00:00').toLocaleDateString();
                    return (
                      <AccordionItem key={isoKey} value={isoKey} className="border rounded-lg overflow-hidden">
                        <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 hover:no-underline">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{displayDate}</span>
                            <Badge variant="secondary" className="text-xs">{packets.length} {packets.length === 1 ? 'packet' : 'packets'}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                          <div className="space-y-1 px-2 pb-2">
                            {packets.map((packet) => (
                              <div key={packet.id} className={`border rounded-lg overflow-hidden${packet.status === 'CONSUMED' ? ' opacity-60 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900' : ''}`}>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setExpandedPacketId(expandedPacketId === packet.id ? null : packet.id)}
                  >
                    <div className="flex items-center gap-3">
                      {expandedPacketId === packet.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div>
                        {(() => {
                          const mfgParsed = parseMfgBarcode(packet.barcode);
                          const mfgBarcode = mfgParsed.isMfgFormat
                            ? mfgParsed.raw
                            : buildMfgBarcode(packet.queueId, packet.sku, packet.packetNumber);
                          const segments = mfgBarcode ? parseMfgBarcode(mfgBarcode) : null;
                          const isInternalBarcode = !mfgParsed.isMfgFormat;

                          const totalPackets = packet.quantityOrdered
                            ?? builtPackets.filter((p) => p.queueId && p.queueId === packet.queueId).length;

                          return (
                            <>
                              <div className="flex items-center gap-2 flex-wrap">
                                {mfgBarcode && (
                                  <span className={`font-mono font-semibold text-sm tracking-wide${packet.status === 'CONSUMED' ? ' line-through text-muted-foreground' : ''}`}>
                                    {mfgBarcode}
                                  </span>
                                )}
                                <Badge variant={packet.status === 'AVAILABLE' ? 'secondary' : packet.status === 'CONSUMED' ? 'destructive' : 'default'} className="text-xs">
                                  {packet.status}
                                </Badge>
                                {packet.isMixedFabric && (
                                  <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Mixed Fabric</Badge>
                                )}
                              </div>
                              {segments?.isMfgFormat && (
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">MFG</span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs font-medium text-foreground">{segments.wo}</span>
                                  <span className="text-xs text-muted-foreground">(WO)</span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs font-medium text-foreground">{segments.sku}</span>
                                  <span className="text-xs text-muted-foreground">(SKU)</span>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <span className="text-xs font-medium text-foreground">{segments.sequence}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {totalPackets > 0 && (
                                  <span className="text-xs font-medium text-foreground">
                                    Packet {packet.packetNumber} of {totalPackets}
                                  </span>
                                )}
                                {packet.categoryName && (
                                  <span className="text-xs text-muted-foreground">{packet.categoryName}</span>
                                )}
                                {packet.allocatedToOrder && (
                                  <span className="text-xs text-muted-foreground">Order: {packet.allocatedToOrder}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {isInternalBarcode && (
                                  <span className="mr-2">Internal ID: <span className="font-mono">{packet.barcode}</span> ·</span>
                                )}
                                Built {new Date(packet.buildDate).toLocaleDateString()} by {packet.createdBy || 'unknown'}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {packet.fabricSources.length} fabric {packet.fabricSources.length === 1 ? 'source' : 'sources'}
                    </div>
                  </button>

                  {expandedPacketId === packet.id && (
                    <div className="border-t bg-muted/20 px-4 py-3">
                      {packet.fabricSources.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No fabric source records for this packet.</p>
                      ) : (
                        <div className="space-y-2">
                          {packet.fabricSources.map((source) => (
                            <div key={source.id} className="flex items-start justify-between gap-3 bg-background border rounded p-3">
                              <div className="space-y-0.5 text-sm">
                                <div className="font-medium">{source.fabricType || 'Unknown fabric'}</div>
                                <div className="text-muted-foreground text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                                  {source.lotNumber && <span>Lot: {source.lotNumber}</span>}
                                  {source.batchNumber && <span>Batch: {source.batchNumber}</span>}
                                  {source.rollNumber && <span>Roll: {source.rollNumber}</span>}
                                  {source.internalControlNumber && <span>ICN: {source.internalControlNumber}</span>}
                                  {source.supplierPartNumber && <span>Supplier P/N: {source.supplierPartNumber}</span>}
                                  {source.expirationDate && <span>Exp: {new Date(source.expirationDate).toLocaleDateString()}</span>}
                                  <span>Qty used: {source.quantityUsed}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingSource(source);
                                    setEditingPacketId(packet.id);
                                    setFabricSourceForm({
                                      fabricType: source.fabricType || '',
                                      lotNumber: source.lotNumber || '',
                                      batchNumber: source.batchNumber || '',
                                      rollNumber: source.rollNumber || '',
                                      supplierPartNumber: source.supplierPartNumber || '',
                                      internalControlNumber: source.internalControlNumber || '',
                                      expirationDate: source.expirationDate || '',
                                    });
                                    setEditFabricSourceOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                {isAdmin && (
                                  confirmDeleteSourceId === source.id ? (
                                    <div className="flex items-center gap-1">
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        disabled={deleteFabricSourceMutation.isPending}
                                        onClick={() => {
                                          deleteFabricSourceMutation.mutate({ packetId: packet.id, sourceId: source.id });
                                        }}
                                      >
                                        Confirm
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setConfirmDeleteSourceId(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"
                                      onClick={() => setConfirmDeleteSourceId(source.id)}
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete
                                    </Button>
                                  )
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                            </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Edit Fabric Source Dialog */}
      <Dialog open={editFabricSourceOpen} onOpenChange={(open) => { setEditFabricSourceOpen(open); if (!open) setEditingSource(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit Fabric Source
            </DialogTitle>
            <DialogDescription>Update the fabric traceability information for this packet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fabric Type</Label>
                <Input
                  value={fabricSourceForm.fabricType}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, fabricType: e.target.value }))}
                  placeholder="e.g. Carbon Fiber"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Roll Number</Label>
                <Input
                  value={fabricSourceForm.rollNumber}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, rollNumber: e.target.value }))}
                  placeholder="Roll #"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lot Number</Label>
                <Input
                  value={fabricSourceForm.lotNumber}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, lotNumber: e.target.value }))}
                  placeholder="Lot #"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Batch Number</Label>
                <Input
                  value={fabricSourceForm.batchNumber}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, batchNumber: e.target.value }))}
                  placeholder="Batch #"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Internal Control #</Label>
                <Input
                  value={fabricSourceForm.internalControlNumber}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, internalControlNumber: e.target.value }))}
                  placeholder="ICN"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Supplier P/N</Label>
                <Input
                  value={fabricSourceForm.supplierPartNumber}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, supplierPartNumber: e.target.value }))}
                  placeholder="Supplier part #"
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Expiration Date</Label>
                <Input
                  type="date"
                  value={fabricSourceForm.expirationDate}
                  onChange={(e) => setFabricSourceForm(prev => ({ ...prev, expirationDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditFabricSourceOpen(false); setEditingSource(null); }}>
              Cancel
            </Button>
            <Button
              disabled={updateFabricSourceMutation.isPending}
              onClick={() => {
                if (!editingSource || !editingPacketId) return;
                updateFabricSourceMutation.mutate({
                  packetId: editingPacketId,
                  sourceId: editingSource.id,
                  data: fabricSourceForm,
                });
              }}
            >
              {updateFabricSourceMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCuttingWorkflowOpen} onOpenChange={setIsCuttingWorkflowOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Cutting Workflow: {selectedMfgItem?.displayName || selectedMfgItem?.partNumber || selectedMfgItem?.partName}
            </DialogTitle>
            <DialogDescription>
              Step {workflowStep === 'fabric' ? '1 of 4: Retrieve Fabric' : workflowStep === 'cutting' ? '2 of 4: Cutting Programs' : workflowStep === 'complete' ? '3 of 4: Complete & Print Labels' : '4 of 4: Fabric Disposition'}
            </DialogDescription>
          </DialogHeader>

          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 py-2">
            {['fabric', 'cutting', 'complete', 'disposition'].map((step, idx) => (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  workflowStep === step ? "bg-primary text-primary-foreground" : 
                  ['fabric', 'cutting', 'complete', 'disposition'].indexOf(workflowStep) > idx ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {idx + 1}
                </div>
                {idx < 3 && <div className={cn("w-8 h-0.5", ['fabric', 'cutting', 'complete', 'disposition'].indexOf(workflowStep) > idx ? "bg-green-500" : "bg-muted")} />}
              </div>
            ))}
          </div>

          {/* STEP 1: Fabric Retrieval */}
          {workflowStep === 'fabric' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Production Summary
                </h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">Packets Needed</Label>
                    <p className="font-bold text-lg">{(selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Cuts Needed</Label>
                    <p className="font-bold text-lg">{
                      matchingBOM
                        ? Math.ceil(((selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)) / (matchingBOM.yieldPerCut || 4))
                        : (selectedMfgItem?.estimatedCuts || Math.ceil(((selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)) / 4))
                    }</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Sq Meters/Cut</Label>
                    <p className="font-bold text-lg">{matchingBOM?.squareMetersPerCut || 0.5} m²</p>
                  </div>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Snowflake className="h-4 w-4" />
                  Fabric Needed - Go to Freezer Location
                </h4>
                <p className="text-sm text-muted-foreground mb-3">Retrieve fabric from these locations (FIFO - oldest expiration first):</p>
                <div className="space-y-2">
                  {(() => {
                    const hasBOM = matchingBOM !== null;

                    // Step 1: Collect ALL material identifiers from every cut + ply entry in the BOM
                    const bomMaterialIds: string[] = [];
                    if (matchingBOM?.cuts && matchingBOM.cuts.length > 0) {
                      const addIfNew = (val: string | undefined | null) => {
                        if (val) {
                          const lower = val.toLowerCase().trim();
                          if (lower && !bomMaterialIds.includes(lower)) bomMaterialIds.push(lower);
                        }
                      };
                      matchingBOM.cuts.forEach(cut => {
                        addIfNew(cut.materialName);
                        addIfNew(cut.materialPartNumber);
                        cut.plySchedule?.forEach(ply => addIfNew(ply.materialType));
                      });
                    }

                    const bomHasMaterials = bomMaterialIds.length > 0;

                    // Step 2: Build filtered fabric list using priority-ordered matching
                    const baseFabrics = fabricInventory.filter(
                      f => f.squareMeters > 0 && f.status !== 'expired' && f.status !== 'depleted'
                    );

                    let relevantFabrics: typeof baseFabrics = [];
                    let isFallback = false;

                    if (hasBOM && bomHasMaterials) {
                      // Priority 1: exact match on fabricType or commonName
                      const exactMatches = baseFabrics.filter(f => {
                        const ft = (f.fabricType || '').toLowerCase().trim();
                        const cn = (f.commonName || '').toLowerCase().trim();
                        return bomMaterialIds.some(id => id === ft || id === cn);
                      });

                      if (exactMatches.length > 0) {
                        relevantFabrics = exactMatches;
                      } else {
                        // Priority 2: substring match — never fall through to generic keywords when BOM was matched
                        relevantFabrics = baseFabrics.filter(f => {
                          const ft = (f.fabricType || '').toLowerCase();
                          const cn = (f.commonName || '').toLowerCase();
                          return bomMaterialIds.some(id =>
                            ft.includes(id) || cn.includes(id) || id.includes(ft) || id.includes(cn)
                          );
                        });
                      }
                    } else if (!hasBOM) {
                      // No BOM on file: generic keyword fallback, clearly labelled
                      isFallback = true;
                      const materialType = (() => {
                        try {
                          const notes = selectedMfgItem?.notes ? JSON.parse(selectedMfgItem.notes) : {};
                          return notes.materialType || 'carbon_fiber';
                        } catch { return 'carbon_fiber'; }
                      })();
                      relevantFabrics = baseFabrics.filter(f => {
                        const ft = (f.fabricType || '').toLowerCase();
                        if (materialType === 'carbon_fiber') return ft.includes('carbon') || ft.includes('cf');
                        if (materialType === 'fiberglass') return ft.includes('fiber') || ft.includes('fg');
                        if (materialType === 'mesa') return ft.includes('mesa');
                        if (materialType === 'p2_disruptor') return ft.includes('disruptor');
                        if (materialType === 'p2_antenna') return ft.includes('antenna');
                        return true;
                      });
                    }
                    // if hasBOM && !bomHasMaterials: relevantFabrics stays [] — caught below

                    relevantFabrics = relevantFabrics
                      .sort((a, b) => {
                        if (!a.expirationDate) return 1;
                        if (!b.expirationDate) return -1;
                        return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
                      })
                      .slice(0, 3);

                    // Step 3: BOM matched but has no material specs at all
                    if (hasBOM && !bomHasMaterials) {
                      return (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 p-3 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-sm text-amber-800 dark:text-amber-300">
                            BOM has no material specifications — contact engineering before retrieving fabric.
                          </p>
                        </div>
                      );
                    }

                    // Step 3b: BOM matched and materials extracted but nothing in inventory matches
                    if (hasBOM && bomHasMaterials && relevantFabrics.length === 0) {
                      return (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 p-3 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-sm text-amber-800 dark:text-amber-300">
                            BOM specifies required materials but none are currently in inventory. Check stock levels or contact engineering.
                          </p>
                        </div>
                      );
                    }

                    if (relevantFabrics.length === 0) {
                      return <p className="text-sm text-amber-600">No matching fabric in inventory. Check stock levels.</p>;
                    }

                    return (
                      <>
                        {relevantFabrics.map((fabric, idx) => (
                          <div key={fabric.id} className={cn(
                            "flex items-center justify-between p-3 rounded border",
                            retrievedFabrics.find(f => f.id === fabric.id) ? "bg-green-100 border-green-300 dark:bg-green-900 dark:border-green-700" : "bg-background"
                          )}>
                            <div className="flex items-center gap-3">
                              {idx === 0 && <Badge className="bg-green-600">FIFO</Badge>}
                              <div>
                                <p className="font-medium">{fabric.fabricType} - Roll {fabric.rollNumber}</p>
                                {fabric.internalControlNumber && (
                                  <p className="text-xs font-mono text-blue-600 dark:text-blue-400">ICN: {fabric.internalControlNumber}</p>
                                )}
                                <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                  Freezer {fabric.freezerLocation || fabric.location || 'Unknown'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {fabric.squareMeters.toFixed(2)} m² available
                                  {fabric.expirationDate && ` • Expires: ${new Date(fabric.expirationDate).toLocaleDateString()}`}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant={retrievedFabrics.find(f => f.id === fabric.id) ? "secondary" : "default"}
                              onClick={() => handleFabricRetrieved(fabric)}
                              disabled={!!retrievedFabrics.find(f => f.id === fabric.id)}
                              data-testid={`button-retrieve-fabric-${fabric.id}`}
                            >
                              {retrievedFabrics.find(f => f.id === fabric.id) ? (
                                <>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Retrieved
                                </>
                              ) : (
                                'Retrieved'
                              )}
                            </Button>
                          </div>
                        ))}
                        {isFallback && (
                          <p className="text-xs text-muted-foreground mt-2 italic">
                            No BOM on file — showing fabric by generic material type.
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {retrievedFabrics.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-sm font-medium text-green-600 dark:text-green-400">
                    {retrievedFabrics.length} fabric roll(s) retrieved and ready for cutting
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Cutting Programs & Ply Schedule */}
          {workflowStep === 'cutting' && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <Scissors className="h-4 w-4" />
                  Cutting Programs
                </h4>
                <p className="text-sm text-muted-foreground">
                  Execute the following cutting program for {(selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)} packets
                </p>
                <div className="mt-3 p-3 bg-background rounded border">
                  <p className="font-mono text-sm">Program: {selectedMfgItem?.partNumber || 'STANDARD'}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Cuts Required: {selectedMfgItem?.estimatedCuts || Math.ceil(((selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)) / (matchingBOM?.yieldPerCut || 4))}
                  </p>
                </div>
              </div>

              {matchingBOM && matchingBOM.cuts && matchingBOM.cuts.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Ply Schedule
                  </h4>
                  {matchingBOM.cuts.map((cut) => (
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
              ) : (
                <div className="border rounded-lg p-4 bg-amber-50 dark:bg-amber-950">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Standard Cutting Procedure</p>
                      <p className="text-sm text-muted-foreground">No custom BOM configured. Follow standard cutting procedure for this part.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-muted/50 rounded-lg p-3">
                <h4 className="font-medium mb-2">Retrieved Fabric Rolls</h4>
                <div className="space-y-1">
                  {retrievedFabrics.map(fabric => (
                    <div key={fabric.id} className="flex items-center justify-between text-sm">
                      <span>{fabric.fabricType} - Roll {fabric.rollNumber}</span>
                      <span className="text-muted-foreground">{fabric.squareMeters.toFixed(2)} m²</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Completion & Labels */}
          {workflowStep === 'complete' && (
            <div className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Complete Cutting Task
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Packet Quantity Completed</Label>
                    <Input
                      type="number"
                      value={completionData.packetQuantity}
                      onChange={(e) => setCompletionData(prev => ({ ...prev, packetQuantity: e.target.value }))}
                      placeholder="Enter quantity"
                      data-testid="input-packet-quantity"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Labels to Print</Label>
                    <Input
                      type="number"
                      value={completionData.labelQuantity}
                      onChange={(e) => setCompletionData(prev => ({ ...prev, labelQuantity: e.target.value }))}
                      placeholder="Enter label count"
                      data-testid="input-label-count"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Fabric Used (Barcodes)</h4>
                <div className="space-y-2">
                  {retrievedFabrics.map(fabric => (
                    <div key={fabric.id} className="flex items-center justify-between p-2 bg-background rounded border">
                      <div>
                        <span className="font-medium">{fabric.fabricType}</span>
                        <span className="text-muted-foreground ml-2">Roll {fabric.rollNumber}</span>
                      </div>
                      <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{fabric.barcodeValue || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center">
                <Button 
                  size="lg"
                  onClick={handlePrintLabels}
                  disabled={generateLabelsMutation.isPending || completionData.printCompleted}
                  className="w-full max-w-xs"
                  data-testid="button-print-labels"
                >
                  <Printer className="h-5 w-5 mr-2" />
                  {generateLabelsMutation.isPending ? 'Printing...' : completionData.printCompleted ? 'Labels Printed' : 'Print Labels'}
                </Button>
              </div>

              {completionData.printCompleted && (
                <div className="text-center text-sm text-green-600 dark:text-green-400 font-medium">
                  Labels sent to printer. Click Next to continue.
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Fabric Disposition */}
          {workflowStep === 'disposition' && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <Snowflake className="h-4 w-4" />
                  Fabric Roll Disposition
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  For each fabric roll used, indicate if it was depleted or return it to a freezer.
                </p>
                <div className="space-y-4">
                  {retrievedFabrics.map((fabric, idx) => {
                    const disposition = dispositionData.find(d => d.fabricId === fabric.id);
                    return (
                      <div key={fabric.id} className="p-3 bg-background rounded border">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className="font-medium">{fabric.fabricType}</span>
                            <span className="text-muted-foreground ml-2">Roll {fabric.rollNumber}</span>
                          </div>
                          <span className="text-sm">{fabric.squareMeters.toFixed(2)} m² remaining</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`disposition-${fabric.id}`}
                              checked={disposition?.action === 'depleted'}
                              onChange={() => setDispositionData(prev => 
                                prev.map(d => d.fabricId === fabric.id ? { ...d, action: 'depleted', freezerNumber: '' } : d)
                              )}
                              className="h-4 w-4"
                              data-testid={`radio-depleted-${fabric.id}`}
                            />
                            <span className="text-red-600 font-medium">Roll Depleted</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name={`disposition-${fabric.id}`}
                              checked={disposition?.action === 'return'}
                              onChange={() => setDispositionData(prev => 
                                prev.map(d => d.fabricId === fabric.id ? { ...d, action: 'return' } : d)
                              )}
                              className="h-4 w-4"
                              data-testid={`radio-return-${fabric.id}`}
                            />
                            <span>Return to Freezer</span>
                          </label>
                        </div>
                        {disposition?.action === 'return' && (
                          <div className="mt-3">
                            <Label className="text-sm">Freezer Number</Label>
                            <Select 
                              value={disposition.freezerNumber} 
                              onValueChange={(val) => setDispositionData(prev => 
                                prev.map(d => d.fabricId === fabric.id ? { ...d, freezerNumber: val } : d)
                              )}
                            >
                              <SelectTrigger className="w-40" data-testid={`select-freezer-${fabric.id}`}>
                                <SelectValue placeholder="Select freezer..." />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 20 }, (_, i) => (
                                  <SelectItem key={i + 1} value={String(i + 1)}>Freezer {i + 1}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between">
            {workflowStep !== 'fabric' && (
              <Button 
                variant="outline" 
                onClick={() => {
                  if (workflowStep === 'cutting') setWorkflowStep('fabric');
                  else if (workflowStep === 'complete') setWorkflowStep('cutting');
                  else if (workflowStep === 'disposition') setWorkflowStep('complete');
                }}
                data-testid="button-back"
              >
                Back
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => setIsCuttingWorkflowOpen(false)} data-testid="button-close-workflow">
                Cancel
              </Button>
              {workflowStep === 'fabric' && (
                <Button onClick={handleProceedToCutting} data-testid="button-proceed-cutting">
                  Fabric Retrieved <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {workflowStep === 'cutting' && (
                <Button onClick={handleFinishCutting} data-testid="button-finish-cutting">
                  Finish Cutting <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {workflowStep === 'complete' && (
                <Button onClick={handleProceedToDisposition} data-testid="button-proceed-disposition">
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {workflowStep === 'disposition' && (
                <Button 
                  onClick={handleCompleteWorkflow} 
                  disabled={dispositionData.some(d => !d.action || (d.action === 'return' && !d.freezerNumber)) || completeWithTraceabilityMutation.isPending}
                  data-testid="button-complete-workflow"
                >
                  {completeWithTraceabilityMutation.isPending ? 'Completing...' : 'Complete Task'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProductionDialogOpen} onOpenChange={setIsProductionDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Production: {selectedMfgItem?.displayName || selectedMfgItem?.partNumber || selectedMfgItem?.partName}</DialogTitle>
            <DialogDescription>
              Enter completion details with fabric traceability
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Package className="h-4 w-4" />
                Production Summary
              </h4>
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground text-xs">Ordered</Label>
                  <p className="font-bold text-lg">{selectedMfgItem?.quantityOrdered || 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Completed</Label>
                  <p className="font-bold text-lg">{selectedMfgItem?.quantityCompleted || 0}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Remaining</Label>
                  <p className="font-bold text-lg text-orange-600">{(selectedMfgItem?.quantityOrdered || 0) - (selectedMfgItem?.quantityCompleted || 0)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Est. Cuts</Label>
                  <p className="font-bold text-lg">{selectedMfgItem?.estimatedCuts || 0}</p>
                </div>
              </div>
            </div>

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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setScannedFabrics(prev => prev.filter(f => f.id !== fabric.id));
                            setProductionForm(prev => ({
                              ...prev,
                              depletedRolls: prev.depletedRolls.filter(id => id !== fabric.id),
                            }));
                          }}
                          title="Remove scanned roll"
                        >
                          <X className="h-4 w-4" />
                        </Button>
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
              disabled={completeItemMutation.isPending || completeWithTraceabilityMutation.isPending}
              data-testid="button-submit-complete"
            >
              {(completeItemMutation.isPending || completeWithTraceabilityMutation.isPending) ? 'Completing...' : 'Complete Production'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

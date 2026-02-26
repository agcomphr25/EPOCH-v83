import { useState, useMemo, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Package,
  Scan,
  Plus,
  Check,
  Clock,
  AlertCircle,
  Search,
  QrCode,
  FileText,
  Loader2,
  Save,
  Printer,
  CheckSquare,
  Square,
  Tag,
  ClipboardList,
  Copy,
  ArrowRight,
  ExternalLink,
  Upload,
  FileText as FilePdf,
  X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiRequest } from '@/lib/queryClient';
import P2ReceivingDialog from '@/components/inventory/P2ReceivingDialog';

// Traceability field definitions - must match TraceabilityConfigModal
const TRACEABILITY_FIELD_LABELS: Record<string, string> = {
  supplierPartNumber: 'Supplier Part Number',
  batchLotNumber: 'Batch/Lot #',
  rollNumber: 'Roll Number',
  manufactureDate: 'Manufacture Date',
  expirationDate: 'Expiration Date',
  receivedDate: 'Received Date',
  aluminumHeat: 'Aluminum Heat #',
  // Legacy field mappings for backwards compatibility
  supplierBatchLotC: 'Batch/Lot #',
  manufactureRoll: 'Roll Number',
};

// Fields that should use date input
const DATE_FIELDS = ['manufactureDate', 'expirationDate', 'receivedDate'];

interface ReceivingItem {
  id?: number;
  agPartNumber: string;
  name: string;
  expectedQuantity: number;
  receivedQuantity: number;
  lotNumber?: string;
  batchNumber?: string;
  expirationDate?: string;
  status: 'pending' | 'partial' | 'complete';
  notes?: string;
  receivedDate?: string;
  receivedBy?: string;
}

interface VendorPO {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName: string;
  status: string;
  requestedDeliveryDate?: string;
  notes?: string;
  createdAt?: string;
}

interface VendorPOItem {
  id: number;
  vendorPoId: number;
  lineNumber: number;
  agPartNumber: string;
  description: string;
  quantity: number;
  vendorUnit: string;
  unitPrice: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  purchaseUnitPrice?: number;
  receivedQuantity?: number;
}

// Function to detect if an item is a P2 product
function isP2Product(item: any): boolean {
  if (!item) return false;

  // Check if the AG Part Number or name contains P2 indicators
  const partNumber = (item.agPartNumber || '').toLowerCase();
  const name = (item.name || '').toLowerCase();

  return (
    partNumber.includes('p2') ||
    name.includes('p2') ||
    name.includes('production line 2') ||
    partNumber.startsWith('p2-') ||
    // Add other P2 detection criteria as needed
    false
  );
}

// Helper to get traceability info for an item from inventory
function getItemTraceability(
  agPartNumber: string,
  inventoryItems: any[] | undefined
): { required: boolean; fields: string[] } {
  if (!inventoryItems || !Array.isArray(inventoryItems)) {
    return { required: false, fields: [] };
  }
  const invItem = inventoryItems.find(
    (inv: any) => inv.agPartNumber?.toLowerCase() === agPartNumber?.toLowerCase()
  );
  if (invItem) {
    return {
      required: invItem.traceabilityRequired || false,
      fields: invItem.traceabilityFields || [],
    };
  }
  return { required: false, fields: [] };
}

type OrderLineForReceiving = {
  orderLineId: number;
  partNumber: string | null;
  partName: string | null;
  agPartNumber: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  remainingQty: number;
  status: string;
  allocations: Array<{
    allocationId: number;
    partsRequestId: number;
    departmentId: number | null;
    qtyAllocated: number;
    qtyReceivedApplied: number;
  }>;
};

type PendingBatchInfo = {
  batchId: number;
  batchStatus: string;
  orderDate: string | null;
  orderLines: OrderLineForReceiving[];
};

type PendingReceiptVendorGroup = {
  vendorId: number | null;
  vendorName: string;
  batches: PendingBatchInfo[];
  totalOrdered: number;
  totalReceived: number;
};

export default function InventoryReceivingPage() {
  const [scanMode, setScanMode] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  const [p2DialogOpen, setP2DialogOpen] = useState(false);
  const [selectedP2Item, setSelectedP2Item] = useState<any>(null);
  const [receivingDialogOpen, setReceivingDialogOpen] = useState(false);
  const [selectedReceivingItem, setSelectedReceivingItem] = useState<(ReceivingItem & { poNumber: string; vendorName: string }) | null>(null);
  const [selectedItemTraceability, setSelectedItemTraceability] = useState<{
    required: boolean;
    fields: string[];
  }>({ required: false, fields: [] });
  const [dialogReceivingData, setDialogReceivingData] = useState({
    receivedQuantity: 0,
    notes: '',
    cocLink: '',
    pdfUrl: '',
  });
  const [receivingPdfFile, setReceivingPdfFile] = useState<File | null>(null);
  const [isUploadingReceivingPdf, setIsUploadingReceivingPdf] = useState(false);
  const [traceabilityData, setTraceabilityData] = useState<Record<string, string>>({});
  const [receivingData, setReceivingData] = useState<ReceivingItem>({
    agPartNumber: '',
    name: '',
    expectedQuantity: 0,
    receivedQuantity: 0,
    status: 'pending',
  });
  const [selectedForPrint, setSelectedForPrint] = useState<Set<number>>(new Set());
  const [recentlyReceived, setRecentlyReceived] = useState<Array<ReceivingItem & { poNumber: string; vendorName: string }>>([]);
  
  // Multi-item receiving state for auto-advance and copy functionality
  const [currentPoGroupItems, setCurrentPoGroupItems] = useState<(ReceivingItem & { poNumber: string; vendorName: string })[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [lastTraceabilityData, setLastTraceabilityData] = useState<Record<string, string>>({});
  const [receivedItemIds, setReceivedItemIds] = useState<Set<number>>(new Set());
  
  // Per-unit traceability entry state (when receiving qty > 1 for traceable items)
  const [perUnitMode, setPerUnitMode] = useState(false);
  const [currentUnitIndex, setCurrentUnitIndex] = useState(0);
  const [totalUnitsToReceive, setTotalUnitsToReceive] = useState(0);
  const [allUnitsTraceabilityData, setAllUnitsTraceabilityData] = useState<Record<string, string>[]>([]);

  const queryClient = useQueryClient();

  const { data: user } = useQuery<{ username: string; firstName: string; lastName: string }>({
    queryKey: ['/api/auth/session'],
  });

  const [expandedBatchVendors, setExpandedBatchVendors] = useState<Set<string>>(new Set());
  const [batchReceiveQuantities, setBatchReceiveQuantities] = useState<Record<number, number>>({});
  const [isBatchReceiveDialogOpen, setIsBatchReceiveDialogOpen] = useState(false);
  const [batchReceiveVendorGroup, setBatchReceiveVendorGroup] = useState<PendingReceiptVendorGroup | null>(null);
  const [batchReceiveBatchId, setBatchReceiveBatchId] = useState<number | null>(null);
  const [batchReceiveNotes, setBatchReceiveNotes] = useState('');

  const { data: pendingBatchReceipts = [], isLoading: isLoadingBatchReceipts } = useQuery<PendingReceiptVendorGroup[]>({
    queryKey: ['/api/inventory/parts-requests/pending-receipts'],
  });

  const batchReceiveMutation = useMutation({
    mutationFn: async (data: {
      batchId: number;
      receivedBy: string;
      notes?: string;
      lines: Array<{ orderLineId: number; qtyReceived: number }>;
    }) => {
      return apiRequest('/api/inventory/parts-requests/receive', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests/pending-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/parts-requests/batches'] });
      toast.success('Parts received successfully');
      setIsBatchReceiveDialogOpen(false);
      setBatchReceiveVendorGroup(null);
      setBatchReceiveBatchId(null);
      setBatchReceiveQuantities({});
      setBatchReceiveNotes('');
    },
    onError: () => {
      toast.error('Failed to receive parts');
    },
  });

  const openBatchReceiveDialog = (group: PendingReceiptVendorGroup) => {
    setBatchReceiveVendorGroup(group);
    const lines = group.batches.flatMap(b => b.orderLines);
    const defaultQty: Record<number, number> = {};
    lines.forEach(l => {
      defaultQty[l.orderLineId] = l.remainingQty;
    });
    setBatchReceiveQuantities(defaultQty);
    const firstBatchId = group.batches[0]?.batchId || null;
    setBatchReceiveBatchId(firstBatchId);
    setIsBatchReceiveDialogOpen(true);
  };

  const handleBatchReceive = () => {
    if (!user || !batchReceiveBatchId) return;
    const lines = Object.entries(batchReceiveQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ orderLineId: parseInt(id), qtyReceived: qty }));

    if (lines.length === 0) {
      toast.error('Enter quantities for at least one item');
      return;
    }

    batchReceiveMutation.mutate({
      batchId: batchReceiveBatchId,
      receivedBy: `${user.firstName} ${user.lastName}`,
      notes: batchReceiveNotes || undefined,
      lines,
    });
  };

  const getAllBatchOrderLines = (group: PendingReceiptVendorGroup) => group.batches.flatMap(b => b.orderLines);

  // Mock data for demonstration - in real implementation, this would come from purchase orders or expected shipments
  const mockReceivingItems: ReceivingItem[] = [
    {
      id: 1,
      agPartNumber: 'AG001',
      name: 'Steel Rod - 1/2 inch',
      expectedQuantity: 50,
      receivedQuantity: 0,
      status: 'pending',
      notes: 'From Supplier A - PO #12345',
    },
    {
      id: 2,
      agPartNumber: 'P2-ALU-001',
      name: 'P2 Aluminum Tubing - Special Grade',
      expectedQuantity: 25,
      receivedQuantity: 0,
      status: 'pending',
      notes: 'P2 Production Line - Requires detailed tracking',
    },
    {
      id: 3,
      agPartNumber: 'AG002',
      name: 'Aluminum Sheet - 6x8',
      expectedQuantity: 25,
      receivedQuantity: 20,
      status: 'partial',
      lotNumber: 'LOT-2024-001',
    },
    {
      id: 4,
      agPartNumber: 'P2-STEEL-002',
      name: 'P2 Heat-Treated Steel Components',
      expectedQuantity: 15,
      receivedQuantity: 0,
      status: 'pending',
      notes: 'P2 Manufacturing - Critical batch tracking required',
    },
    {
      id: 5,
      agPartNumber: 'AG003',
      name: 'Precision Screws - M4',
      expectedQuantity: 100,
      receivedQuantity: 100,
      status: 'complete',
      receivedDate: new Date().toISOString(),
      receivedBy: 'John Doe',
    },
  ];

  const { data: inventoryItems } = useQuery({
    queryKey: ['/api/inventory'],
    enabled: true,
  });

  // Fetch Vendor POs with status "Sent" for Pending Receipts
  const { data: sentPOsResponse, isLoading: isLoadingPOs } = useQuery<{ data: VendorPO[] }>({
    queryKey: ['/api/vendor-pos', 'Sent'],
    queryFn: () => apiRequest('/api/vendor-pos?status=Sent'),
  });
  
  const sentPOs = sentPOsResponse?.data || [];

  // Fetch line items for all sent POs
  const { data: poItemsMap, isLoading: isLoadingItems } = useQuery<Record<number, VendorPOItem[]>>({
    queryKey: ['/api/vendor-pos/items', sentPOs.map(po => po.id)],
    queryFn: async () => {
      if (sentPOs.length === 0) return {};
      const itemsMap: Record<number, VendorPOItem[]> = {};
      await Promise.all(
        sentPOs.map(async (po) => {
          try {
            const items = await apiRequest(`/api/vendor-pos/${po.id}/items`);
            itemsMap[po.id] = items || [];
          } catch (error) {
            console.error(`Failed to fetch items for PO ${po.id}:`, error);
            itemsMap[po.id] = [];
          }
        })
      );
      return itemsMap;
    },
    enabled: sentPOs.length > 0,
  });

  // Get valid inventory part numbers for filtering
  const validPartNumbers = new Set<string>();
  if (inventoryItems && Array.isArray(inventoryItems)) {
    inventoryItems.forEach((item: any) => {
      if (item.agPartNumber) {
        validPartNumbers.add(item.agPartNumber.toLowerCase());
      }
    });
  }

  // Transform PO items into receiving items format - only include items with valid inventory part numbers
  const pendingReceivingItems: (ReceivingItem & { poNumber: string; vendorName: string })[] = [];
  if (poItemsMap) {
    sentPOs.forEach((po) => {
      const items = poItemsMap[po.id] || [];
      items.forEach((item) => {
        // Only include items that exist in the inventory
        if (!item.agPartNumber || !validPartNumbers.has(item.agPartNumber.toLowerCase())) {
          return; // Skip items not in inventory
        }

        const expectedQty = item.quantity || 0;
        const receivedQty = item.receivedQuantity || 0;
        let status: 'pending' | 'partial' | 'complete' = 'pending';
        if (receivedQty >= expectedQty && expectedQty > 0) {
          status = 'complete';
        } else if (receivedQty > 0) {
          status = 'partial';
        }
        
        pendingReceivingItems.push({
          id: item.id,
          agPartNumber: item.agPartNumber || '',
          name: item.description || '',
          expectedQuantity: expectedQty,
          receivedQuantity: receivedQty,
          status,
          notes: `${po.poNumber} from ${po.vendorName}`,
          poNumber: po.poNumber,
          vendorName: po.vendorName,
        });
      });
    });
  }

  // Group pending items by VPO-# for accordion display
  const groupedByVPO = useMemo(() => {
    const pendingItems = pendingReceivingItems.filter(item => item.status !== 'complete');
    const grouped: Record<string, { 
      poNumber: string; 
      vendorName: string; 
      items: typeof pendingItems;
      pendingCount: number;
      partialCount: number;
    }> = {};
    
    pendingItems.forEach(item => {
      if (!grouped[item.poNumber]) {
        grouped[item.poNumber] = {
          poNumber: item.poNumber,
          vendorName: item.vendorName,
          items: [],
          pendingCount: 0,
          partialCount: 0,
        };
      }
      grouped[item.poNumber].items.push(item);
      if (item.status === 'pending') {
        grouped[item.poNumber].pendingCount++;
      } else if (item.status === 'partial') {
        grouped[item.poNumber].partialCount++;
      }
    });
    
    return Object.values(grouped).sort((a, b) => a.poNumber.localeCompare(b.poNumber));
  }, [pendingReceivingItems]);

  const createInventoryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to add inventory item');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      toast.success('Item received and added to inventory');
      resetForm();
    },
    onError: () => {
      toast.error('Failed to receive item');
    },
  });

  const searchSuggestions = useMemo(() => {
    if (!scannedCode || scannedCode.length < 1 || !inventoryItems || !Array.isArray(inventoryItems)) return [];
    const term = scannedCode.toLowerCase();
    return inventoryItems
      .filter((item: any) =>
        (item.agPartNumber && item.agPartNumber.toLowerCase().includes(term)) ||
        (item.name && item.name.toLowerCase().includes(term))
      )
      .slice(0, 15);
  }, [scannedCode, inventoryItems]);

  const selectInventoryItem = (item: any) => {
    setReceivingData({
      agPartNumber: item.agPartNumber || '',
      name: item.name || '',
      expectedQuantity: 0,
      receivedQuantity: 0,
      status: 'pending',
    });
    setTraceabilityData({});
    setScannedCode('');
    toast.success(`Selected item: ${item.name}`);
  };

  const handleScan = () => {
    if (!scannedCode) return;
    if (!inventoryItems || !Array.isArray(inventoryItems) || inventoryItems.length === 0) {
      toast.error('Inventory items are still loading, please try again');
      return;
    }
    const term = scannedCode.toLowerCase();
    const foundItem = inventoryItems.find(
      (item: any) =>
        (item.agPartNumber && item.agPartNumber.toLowerCase() === term) ||
        (item.name && item.name.toLowerCase().includes(term))
    );

    if (foundItem) {
      selectInventoryItem(foundItem);
    } else {
      toast.error('Item not found in inventory item list');
    }
    setScannedCode('');
    setScanMode(false);
  };

  const handleReceive = () => {
    if (
      !receivingData.agPartNumber ||
      !receivingData.name ||
      receivingData.receivedQuantity <= 0
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    const itemTrace = getItemTraceability(receivingData.agPartNumber, inventoryItems as any[]);
    if (itemTrace.required && itemTrace.fields.length > 0) {
      const missingFields = itemTrace.fields.filter((f: string) => !traceabilityData[f]?.trim());
      if (missingFields.length > 0) {
        const missingLabels = missingFields.map((f: string) => TRACEABILITY_FIELD_LABELS[f] || f);
        toast.error(`Missing required traceability fields: ${missingLabels.join(', ')}`);
        return;
      }
    }

    // Check if this is a P2 product
    if (isP2Product(receivingData)) {
      setSelectedP2Item(receivingData);
      setP2DialogOpen(true);
      return;
    }

    const traceNotes = itemTrace.required && itemTrace.fields.length > 0
      ? itemTrace.fields.map((f: string) => `${TRACEABILITY_FIELD_LABELS[f] || f}: ${traceabilityData[f] || ''}`).join(', ')
      : '';

    const inventoryData = {
      agPartNumber: receivingData.agPartNumber,
      name: receivingData.name,
      notes: `Received: ${receivingData.receivedQuantity} units.${traceNotes ? ` Traceability: ${traceNotes}.` : ''} ${receivingData.notes || ''}`.trim(),
      department: 'Receiving',
      orderDate: new Date().toISOString().split('T')[0],
      ...(receivingData.lotNumber ? { lotNumber: receivingData.lotNumber } : {}),
      ...(receivingData.batchNumber ? { batchNumber: receivingData.batchNumber } : {}),
      ...(itemTrace.required && itemTrace.fields.length > 0 ? { traceabilityData } : {}),
    };

    createInventoryMutation.mutate(inventoryData);
  };

  const handleReceiveFromPending = (item: ReceivingItem & { poNumber: string; vendorName: string }, skipGroupSetup = false) => {
    // Check if this is a P2 product
    if (isP2Product(item)) {
      setSelectedP2Item(item);
      setP2DialogOpen(true);
      return;
    }

    // Look up the inventory item to get traceability settings
    let traceabilityRequired = false;
    let traceabilityFields: string[] = [];
    
    if (inventoryItems && Array.isArray(inventoryItems)) {
      const invItem = inventoryItems.find(
        (inv: any) => inv.agPartNumber?.toLowerCase() === item.agPartNumber?.toLowerCase()
      );
      if (invItem) {
        traceabilityRequired = invItem.traceabilityRequired || false;
        traceabilityFields = invItem.traceabilityFields || [];
      }
    }

    // Set up PO group items for multi-item receiving (only on first item click)
    if (!skipGroupSetup) {
      // Find all items in the same PO from the pending items list
      const samePoItems = pendingReceivingItems.filter(
        (i: ReceivingItem & { poNumber: string; vendorName: string }) => 
          i.poNumber === item.poNumber && 
          !isP2Product(i) && 
          (i.status === 'pending' || i.status === 'partial')
      );
      if (samePoItems.length > 0) {
        setCurrentPoGroupItems(samePoItems);
        const itemIndex = samePoItems.findIndex(
          (i: ReceivingItem & { poNumber: string; vendorName: string }) => i.id === item.id
        );
        setCurrentItemIndex(itemIndex >= 0 ? itemIndex : 0);
      } else {
        setCurrentPoGroupItems([item]);
        setCurrentItemIndex(0);
      }
      // Reset last traceability data and received IDs when starting a new PO group
      setLastTraceabilityData({});
      setReceivedItemIds(new Set());
    }

    // For non-P2 products, open the receiving dialog
    setSelectedReceivingItem(item);
    setSelectedItemTraceability({
      required: traceabilityRequired,
      fields: traceabilityFields,
    });
    
    const quantityToReceive = item.expectedQuantity - item.receivedQuantity;
    setDialogReceivingData({
      receivedQuantity: quantityToReceive,
      notes: '',
      cocLink: '',
      pdfUrl: '',
    });
    setReceivingPdfFile(null);
    
    // Initialize traceability data with empty values for each field
    const initialTraceabilityData: Record<string, string> = {};
    traceabilityFields.forEach((field) => {
      // Pre-fill receivedDate with today's date
      if (field === 'receivedDate') {
        initialTraceabilityData[field] = new Date().toISOString().split('T')[0];
      } else {
        initialTraceabilityData[field] = '';
      }
    });
    setTraceabilityData(initialTraceabilityData);
    
    // Set up per-unit mode only if traceable item with whole-number quantity > 1
    const isWholeNumber = Number.isInteger(quantityToReceive);
    if (traceabilityRequired && traceabilityFields.length > 0 && quantityToReceive > 1 && isWholeNumber) {
      setPerUnitMode(true);
      setCurrentUnitIndex(0);
      setTotalUnitsToReceive(quantityToReceive);
      setAllUnitsTraceabilityData([]);
    } else {
      setPerUnitMode(false);
      setCurrentUnitIndex(0);
      setTotalUnitsToReceive(0);
      setAllUnitsTraceabilityData([]);
    }
    
    setReceivingDialogOpen(true);
  };

  // Copy traceability data from previous item (for multi-PO-item workflow)
  const handleCopyFromPrevious = () => {
    if (Object.keys(lastTraceabilityData).length === 0) {
      toast.error('No previous traceability data to copy');
      return;
    }
    // Copy only fields that are configured for this item
    const copiedData: Record<string, string> = {};
    selectedItemTraceability.fields.forEach((field) => {
      if (lastTraceabilityData[field]) {
        // For received date, always use today
        if (field === 'receivedDate') {
          copiedData[field] = new Date().toISOString().split('T')[0];
        } else {
          copiedData[field] = lastTraceabilityData[field];
        }
      } else if (field === 'receivedDate') {
        copiedData[field] = new Date().toISOString().split('T')[0];
      } else {
        copiedData[field] = '';
      }
    });
    setTraceabilityData(copiedData);
    toast.success('Copied traceability data from previous item');
  };
  
  // Copy traceability data from previous unit (for per-unit workflow)
  const handleCopyFromPreviousUnit = () => {
    if (allUnitsTraceabilityData.length === 0 || currentUnitIndex === 0) {
      toast.error('No previous unit data to copy');
      return;
    }
    const previousUnitData = allUnitsTraceabilityData[currentUnitIndex - 1];
    if (!previousUnitData) {
      toast.error('No previous unit data to copy');
      return;
    }
    // Copy data, but always use today for receivedDate
    const copiedData: Record<string, string> = { ...previousUnitData };
    if (copiedData.receivedDate) {
      copiedData.receivedDate = new Date().toISOString().split('T')[0];
    }
    setTraceabilityData(copiedData);
    toast.success(`Copied data from Unit ${currentUnitIndex}`);
  };
  
  // Handle advancing to next unit in per-unit mode
  const handleNextUnit = () => {
    // Validate current unit's traceability fields
    const missingFields = selectedItemTraceability.fields.filter(
      (field) => !traceabilityData[field] || traceabilityData[field].trim() === ''
    );
    if (missingFields.length > 0) {
      const missingLabels = missingFields.map((f) => TRACEABILITY_FIELD_LABELS[f] || f);
      toast.error(`Please fill in required fields: ${missingLabels.join(', ')}`);
      return;
    }
    
    // Save current unit's data
    const updatedAllUnitsData = [...allUnitsTraceabilityData];
    updatedAllUnitsData[currentUnitIndex] = { ...traceabilityData };
    setAllUnitsTraceabilityData(updatedAllUnitsData);
    
    // Advance to next unit
    const nextIndex = currentUnitIndex + 1;
    setCurrentUnitIndex(nextIndex);
    
    // Pre-fill next unit with current unit's data (user can adjust)
    const nextUnitData: Record<string, string> = { ...traceabilityData };
    // Always use today for receivedDate
    if (nextUnitData.receivedDate) {
      nextUnitData.receivedDate = new Date().toISOString().split('T')[0];
    }
    setTraceabilityData(nextUnitData);
    
    toast.success(`Unit ${currentUnitIndex + 1} saved. Now entering Unit ${nextIndex + 1} of ${totalUnitsToReceive}`);
  };

  const handleDialogReceive = async () => {
    if (!selectedReceivingItem) return;

    if (dialogReceivingData.receivedQuantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    // For per-unit traceability mode, ensure quantity is a whole number
    if (perUnitMode && !Number.isInteger(dialogReceivingData.receivedQuantity)) {
      toast.error('When traceability is required, quantity must be a whole number');
      return;
    }

    // Validate required traceability fields for current unit
    if (selectedItemTraceability.required && selectedItemTraceability.fields.length > 0) {
      const missingFields = selectedItemTraceability.fields.filter(
        (field) => !traceabilityData[field] || traceabilityData[field].trim() === ''
      );
      if (missingFields.length > 0) {
        const missingLabels = missingFields.map((f) => TRACEABILITY_FIELD_LABELS[f] || f);
        toast.error(`Please fill in required traceability fields: ${missingLabels.join(', ')}`);
        return;
      }
    }

    try {
      // Collect all units' traceability data for per-unit mode
      let finalUnitsData: Record<string, string>[] = [];
      if (perUnitMode) {
        // Save current (last) unit's data
        finalUnitsData = [...allUnitsTraceabilityData];
        finalUnitsData[currentUnitIndex] = { ...traceabilityData };
        
        // Validate that we have traceability data for all units being received
        if (finalUnitsData.length !== dialogReceivingData.receivedQuantity) {
          toast.error(`Traceability data mismatch: expected ${dialogReceivingData.receivedQuantity} units but have ${finalUnitsData.length}`);
          return;
        }
      }
      
      // Build notes with traceability info
      const noteParts = [];
      if (perUnitMode && finalUnitsData.length > 0) {
        // Include summary of all units
        noteParts.push(`[${finalUnitsData.length} units with individual traceability]`);
        finalUnitsData.forEach((unitData, idx) => {
          const unitParts: string[] = [];
          selectedItemTraceability.fields.forEach((field) => {
            if (unitData[field]) {
              const label = TRACEABILITY_FIELD_LABELS[field] || field;
              unitParts.push(`${label}: ${unitData[field]}`);
            }
          });
          noteParts.push(`Unit ${idx + 1}: ${unitParts.join(', ')}`);
        });
      } else {
        // Single unit - add traceability data to notes
        selectedItemTraceability.fields.forEach((field) => {
          if (traceabilityData[field]) {
            const label = TRACEABILITY_FIELD_LABELS[field] || field;
            noteParts.push(`${label}: ${traceabilityData[field]}`);
          }
        });
      }
      if (dialogReceivingData.notes) {
        noteParts.push(dialogReceivingData.notes);
      }
      const combinedNotes = noteParts.join(' | ');

      // Update the vendor PO item with received quantity
      await apiRequest(`/api/vendor-pos/items/${selectedReceivingItem.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          receivedQuantity: dialogReceivingData.receivedQuantity,
          notes: combinedNotes || undefined,
          cocLink: dialogReceivingData.cocLink || undefined,
          documentUrl: dialogReceivingData.pdfUrl || undefined,
        }),
      });

      // Track recently received items for barcode printing (if traceable)
      const isTraceable = selectedItemTraceability.required && selectedItemTraceability.fields.length > 0;
      if (isTraceable) {
        if (perUnitMode && finalUnitsData.length > 0) {
          // Add each unit as a separate entry for barcode printing
          const newReceivedItems = finalUnitsData.map((unitData, idx) => ({
            id: selectedReceivingItem.id! + idx * 0.001, // Unique ID for each unit
            agPartNumber: selectedReceivingItem.agPartNumber,
            name: selectedReceivingItem.name,
            expectedQuantity: 1,
            receivedQuantity: 1,
            lotNumber: unitData.batchLotNumber || unitData.rollNumber || unitData.supplierBatchLotC || unitData.manufactureRoll || '',
            batchNumber: unitData.aluminumHeat || '',
            status: 'complete' as const,
            receivedDate: new Date().toISOString(),
            poNumber: selectedReceivingItem.poNumber,
            vendorName: selectedReceivingItem.vendorName,
            notes: selectedItemTraceability.fields.map(f => 
              `${TRACEABILITY_FIELD_LABELS[f] || f}: ${unitData[f] || ''}`
            ).join(' | '),
          }));
          setRecentlyReceived(prev => [...newReceivedItems, ...prev]);
        } else {
          // Single unit
          const receivedItem: ReceivingItem & { poNumber: string; vendorName: string } = {
            id: selectedReceivingItem.id,
            agPartNumber: selectedReceivingItem.agPartNumber,
            name: selectedReceivingItem.name,
            expectedQuantity: selectedReceivingItem.expectedQuantity,
            receivedQuantity: dialogReceivingData.receivedQuantity,
            lotNumber: traceabilityData.batchLotNumber || traceabilityData.rollNumber || traceabilityData.supplierBatchLotC || traceabilityData.manufactureRoll || '',
            batchNumber: traceabilityData.aluminumHeat || '',
            status: 'complete',
            receivedDate: new Date().toISOString(),
            poNumber: selectedReceivingItem.poNumber,
            vendorName: selectedReceivingItem.vendorName,
            notes: combinedNotes,
          };
          setRecentlyReceived(prev => [receivedItem, ...prev]);
        }
      }

      // Save last traceability data for "Copy from Previous" feature
      if (selectedItemTraceability.required && Object.keys(traceabilityData).length > 0) {
        setLastTraceabilityData({ ...traceabilityData });
      }

      // Track this item as received
      const currentItemId = selectedReceivingItem.id;
      setReceivedItemIds(prev => {
        const updated = new Set(prev);
        if (currentItemId) updated.add(currentItemId);
        return updated;
      });

      toast.success(`Successfully received ${dialogReceivingData.receivedQuantity} units of ${selectedReceivingItem.agPartNumber}`);
      
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      
      // Store PO number and update received IDs before advancing
      const poNumberForAdvance = selectedReceivingItem.poNumber;
      const groupItemsCopy = [...currentPoGroupItems];
      const currentIdx = currentItemIndex;
      
      // Update received IDs state
      const newReceivedIds = new Set(receivedItemIds);
      if (currentItemId) newReceivedIds.add(currentItemId);
      setReceivedItemIds(newReceivedIds);
      
      // Helper function to close dialog and reset state
      const closeAndReset = (showCompletion = false) => {
        setReceivingDialogOpen(false);
        setSelectedReceivingItem(null);
        setSelectedItemTraceability({ required: false, fields: [] });
        setDialogReceivingData({ receivedQuantity: 0, notes: '', cocLink: '', pdfUrl: '' });
        setTraceabilityData({});
        setCurrentPoGroupItems([]);
        setCurrentItemIndex(0);
        setReceivedItemIds(new Set());
        // Reset per-unit state
        setPerUnitMode(false);
        setCurrentUnitIndex(0);
        setTotalUnitsToReceive(0);
        setAllUnitsTraceabilityData([]);
        // Reset PDF upload state
        setReceivingPdfFile(null);
        if (showCompletion) {
          toast.success('All items in this PO have been received!');
        }
      };
      
      // Find next unreceived item using the cached group, skipping received IDs
      let nextItemIdx = -1;
      for (let i = currentIdx + 1; i < groupItemsCopy.length; i++) {
        const item = groupItemsCopy[i];
        if (item.id && !newReceivedIds.has(item.id)) {
          nextItemIdx = i;
          break;
        }
      }
      
      if (nextItemIdx < 0 || groupItemsCopy.length <= 1) {
        closeAndReset(groupItemsCopy.length > 1);
      } else {
        const nextItem = groupItemsCopy[nextItemIdx];
        setCurrentItemIndex(nextItemIdx);
        // Small delay for toast visibility before advancing
        setTimeout(() => {
          handleReceiveFromPending(nextItem, true);
        }, 400);
      }
    } catch (error) {
      toast.error('Failed to receive item');
      console.error('Receiving error:', error);
    }
  };

  const handleDialogClose = () => {
    setReceivingDialogOpen(false);
    setSelectedReceivingItem(null);
    setSelectedItemTraceability({ required: false, fields: [] });
    setDialogReceivingData({
      receivedQuantity: 0,
      notes: '',
      cocLink: '',
      pdfUrl: '',
    });
    setTraceabilityData({});
    // Reset all multi-item tracking state
    setCurrentPoGroupItems([]);
    setCurrentItemIndex(0);
    setReceivedItemIds(new Set());
    setLastTraceabilityData({});
    // Reset per-unit tracking state
    setPerUnitMode(false);
    setCurrentUnitIndex(0);
    setTotalUnitsToReceive(0);
    setAllUnitsTraceabilityData([]);
    // Reset PDF upload state
    setReceivingPdfFile(null);
  };

  // Toggle item selection for barcode printing
  const togglePrintSelection = (itemId: number) => {
    setSelectedForPrint(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Select all traceable items for printing
  const selectAllForPrint = () => {
    const allIds = recentlyReceived.map(item => item.id!).filter(Boolean);
    setSelectedForPrint(new Set(allIds));
  };

  // Clear all selections
  const clearPrintSelection = () => {
    setSelectedForPrint(new Set());
  };

  // Batch print barcodes for selected items
  const handleBatchPrintBarcodes = () => {
    const selectedItems = recentlyReceived.filter(item => selectedForPrint.has(item.id!));
    
    if (selectedItems.length === 0) {
      toast.error('Please select items to print barcodes');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print barcodes');
      return;
    }

    // Generate barcode label content
    const generateLabelContent = (item: ReceivingItem & { poNumber: string; vendorName: string }, index: number) => {
      const barcodeValue = item.lotNumber || item.batchNumber || item.agPartNumber;
      return `
        <div class="label">
          <div class="label-content">
            <div class="part-number">${item.agPartNumber}</div>
            <div class="item-name">${item.name}</div>
            <div class="barcode-container">
              <canvas id="barcode-${index}" width="200" height="50"></canvas>
            </div>
            ${item.lotNumber ? `<div class="lot-info">Lot: ${item.lotNumber}</div>` : ''}
            ${item.batchNumber ? `<div class="batch-info">Batch: ${item.batchNumber}</div>` : ''}
            <div class="qty-info">Qty: ${item.receivedQuantity} | PO: ${item.poNumber}</div>
            <div class="date-info">${new Date(item.receivedDate!).toLocaleDateString()}</div>
          </div>
        </div>
      `;
    };

    printWindow.document.write(`
      <html>
        <head>
          <title>Inventory Barcodes</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 10px; }
            .labels-container {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
            }
            .label {
              width: 2.625in;
              height: 1.2in;
              border: 1px solid #ccc;
              padding: 5px;
              page-break-inside: avoid;
            }
            .label-content {
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              text-align: center;
            }
            .part-number {
              font-size: 10pt;
              font-weight: bold;
              color: #000;
            }
            .item-name {
              font-size: 7pt;
              color: #333;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            .barcode-container {
              display: flex;
              justify-content: center;
              margin: 3px 0;
            }
            .lot-info, .batch-info {
              font-size: 8pt;
              font-weight: bold;
              color: #0066cc;
            }
            .qty-info {
              font-size: 7pt;
              color: #666;
            }
            .date-info {
              font-size: 6pt;
              color: #999;
            }
            @media print {
              body { margin: 0; }
              .label { border: none; }
              @page {
                size: 8.5in 11in;
                margin: 0.5in;
              }
            }
          </style>
        </head>
        <body>
          <div class="labels-container">
            ${selectedItems.map((item, idx) => generateLabelContent(item, idx)).join('')}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();

    // Generate barcodes after DOM is ready
    setTimeout(() => {
      selectedItems.forEach((item, idx) => {
        const canvas = printWindow.document.getElementById(`barcode-${idx}`) as HTMLCanvasElement;
        if (canvas) {
          const barcodeValue = item.lotNumber || item.batchNumber || item.agPartNumber;
          const format = getBarcodeFormat(barcodeValue);
          try {
            JsBarcode(canvas, barcodeValue, {
              format: format,
              width: format === 'CODE128' ? 1.2 : 1.5,
              height: 35,
              displayValue: true,
              fontSize: 10,
              margin: 2,
              lineColor: '#000000',
            });
          } catch (error) {
            console.error('Error generating barcode:', error);
          }
        }
      });

      // Print and close
      printWindow.focus();
      printWindow.print();
    }, 300);

    toast.success(`Printing barcodes for ${selectedItems.length} items`);
    clearPrintSelection();
  };

  // Remove item from recently received list
  const removeFromRecentlyReceived = (itemId: number) => {
    setRecentlyReceived(prev => prev.filter(item => item.id !== itemId));
    setSelectedForPrint(prev => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  const resetForm = () => {
    setReceivingData({
      agPartNumber: '',
      name: '',
      expectedQuantity: 0,
      receivedQuantity: 0,
      status: 'pending',
    });
    setTraceabilityData({});
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="secondary" className="bg-orange-100 text-orange-800">
            <AlertCircle className="w-3 h-3 mr-1" />
            Partial
          </Badge>
        );
      case 'complete':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <Check className="w-3 h-3 mr-1" />
            Complete
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Inventory Receiving
          </h1>
          <p className="text-muted-foreground">
            Receive and process incoming inventory items
          </p>
        </div>
        <Button
          onClick={() => setScanMode(!scanMode)}
          variant={scanMode ? 'default' : 'outline'}
        >
          <Scan className="w-4 h-4 mr-2" />
          {scanMode ? 'Exit Scan Mode' : 'Scan Mode'}
        </Button>
      </div>

      <Tabs defaultValue="receive" className="space-y-6">
        <TabsList>
          <TabsTrigger value="receive">Receive Items</TabsTrigger>
          <TabsTrigger value="pending">Pending Receipts</TabsTrigger>
          <TabsTrigger value="history">Receiving History</TabsTrigger>
        </TabsList>

        <TabsContent value="receive">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scan/Search Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Item Lookup
                </CardTitle>
                <CardDescription>
                  Scan barcode or search for items to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scanMode && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 mb-2">
                      Scan Mode Active
                    </p>
                    <Input
                      placeholder="Scan barcode or enter item code..."
                      value={scannedCode}
                      onChange={(e) => setScannedCode(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                      autoFocus
                    />
                    <Button onClick={handleScan} className="mt-2 w-full">
                      Process Scan
                    </Button>
                  </div>
                )}

                {!scanMode && (
                  <div className="space-y-4">
                    <div className="relative">
                      <Label htmlFor="search">Search by AG Part# or Name</Label>
                      <Input
                        id="search"
                        placeholder="Enter AG Part# or item name..."
                        value={scannedCode}
                        onChange={(e) => setScannedCode(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleScan()}
                      />
                      {searchSuggestions.length > 0 && scannedCode.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {searchSuggestions.map((item: any, index: number) => (
                            <button
                              key={item.id || index}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 flex items-center justify-between"
                              onClick={() => selectInventoryItem(item)}
                            >
                              <div>
                                <span className="font-medium text-sm">{item.agPartNumber}</span>
                                <span className="text-sm text-gray-500 ml-2">— {item.name}</span>
                              </div>
                              <ArrowRight className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                      {scannedCode.length > 0 && searchSuggestions.length === 0 && inventoryItems && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
                          <div className="px-3 py-2 text-sm text-gray-500">No matching items found</div>
                        </div>
                      )}
                    </div>
                    <Button onClick={handleScan} className="w-full">
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Receiving Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Receive Item
                </CardTitle>
                <CardDescription>
                  Enter details for the item being received
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="agPartNumber">AG Part# *</Label>
                    <Input
                      id="agPartNumber"
                      value={receivingData.agPartNumber}
                      onChange={(e) =>
                        setReceivingData((prev) => ({
                          ...prev,
                          agPartNumber: e.target.value,
                        }))
                      }
                      placeholder="Enter AG Part#"
                    />
                  </div>
                  <div>
                    <Label htmlFor="receivedQuantity">
                      Received Quantity *
                    </Label>
                    <Input
                      id="receivedQuantity"
                      type="number"
                      value={receivingData.receivedQuantity}
                      onChange={(e) =>
                        setReceivingData((prev) => ({
                          ...prev,
                          receivedQuantity: parseInt(e.target.value) || 0,
                        }))
                      }
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">Item Name *</Label>
                  <Input
                    id="name"
                    value={receivingData.name}
                    onChange={(e) =>
                      setReceivingData((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Enter item name"
                  />
                </div>

                {(() => {
                  const itemTrace = getItemTraceability(receivingData.agPartNumber, inventoryItems as any[]);
                  const hasTraceFields = itemTrace.required && itemTrace.fields.length > 0;
                  return (
                    <>
                      {hasTraceFields && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <ClipboardList className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                              Traceability Required — {itemTrace.fields.length} field{itemTrace.fields.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {itemTrace.fields.map((fieldId: string) => {
                              const label = TRACEABILITY_FIELD_LABELS[fieldId] || fieldId;
                              const isDate = DATE_FIELDS.includes(fieldId);
                              return (
                                <div key={fieldId}>
                                  <Label htmlFor={`trace-${fieldId}`} className="text-xs">
                                    {label} *
                                  </Label>
                                  <Input
                                    id={`trace-${fieldId}`}
                                    type={isDate ? 'date' : 'text'}
                                    value={traceabilityData[fieldId] || ''}
                                    onChange={(e) =>
                                      setTraceabilityData((prev) => ({
                                        ...prev,
                                        [fieldId]: e.target.value,
                                      }))
                                    }
                                    placeholder={isDate ? '' : `Enter ${label}`}
                                    className="h-8 text-sm"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {!hasTraceFields && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="lotNumber">Lot Number</Label>
                            <Input
                              id="lotNumber"
                              value={receivingData.lotNumber || ''}
                              onChange={(e) =>
                                setReceivingData((prev) => ({
                                  ...prev,
                                  lotNumber: e.target.value,
                                }))
                              }
                              placeholder="Optional"
                            />
                          </div>
                          <div>
                            <Label htmlFor="batchNumber">Batch Number</Label>
                            <Input
                              id="batchNumber"
                              value={receivingData.batchNumber || ''}
                              onChange={(e) =>
                                setReceivingData((prev) => ({
                                  ...prev,
                                  batchNumber: e.target.value,
                                }))
                              }
                              placeholder="Optional"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={receivingData.notes || ''}
                    onChange={(e) =>
                      setReceivingData((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Additional notes about this receipt..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleReceive}
                    className={`flex-1 ${isP2Product(receivingData) ? 'bg-orange-500 hover:bg-orange-600' : ''}`}
                    disabled={createInventoryMutation.isPending}
                  >
                    {isP2Product(receivingData) ? (
                      <QrCode className="w-4 h-4 mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {createInventoryMutation.isPending
                      ? 'Receiving...'
                      : isP2Product(receivingData)
                        ? 'P2 Receive'
                        : 'Receive Item'}
                  </Button>
                  <Button onClick={resetForm} variant="outline">
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Vendor Purchase Orders
                </CardTitle>
                <CardDescription>
                  Items from issued Purchase Orders awaiting receipt ({pendingReceivingItems.filter(item => item.status !== 'complete').length} items from {groupedByVPO.length} POs)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(isLoadingPOs || isLoadingItems) ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-muted-foreground">Loading pending receipts...</span>
                  </div>
                ) : groupedByVPO.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No pending vendor PO receipts</p>
                    <p className="text-sm">Issue a Purchase Order to see items here</p>
                  </div>
                ) : (
                  <Accordion type="multiple" className="w-full" defaultValue={[]}>
                    {groupedByVPO.map((group) => (
                      <AccordionItem key={group.poNumber} value={group.poNumber} data-testid={`accordion-vpo-${group.poNumber}`}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3 flex-1">
                            <Badge variant="outline" className="font-mono text-sm font-semibold">
                              {group.poNumber}
                            </Badge>
                            <span className="text-muted-foreground text-sm">
                              {group.vendorName}
                            </span>
                            <div className="flex items-center gap-2 ml-auto mr-4">
                              {group.pendingCount > 0 && (
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {group.pendingCount} pending
                                </Badge>
                              )}
                              {group.partialCount > 0 && (
                                <Badge variant="secondary" className="bg-orange-100 text-orange-800 text-xs">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  {group.partialCount} partial
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                              </Badge>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {group.items.map((item) => (
                              <div
                                key={`${item.poNumber}-${item.id}`}
                                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                data-testid={`receipt-item-${item.id}`}
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">
                                      #{item.agPartNumber}
                                    </span>
                                    <span className="text-muted-foreground">-</span>
                                    <span className="truncate max-w-[300px]">{item.name}</span>
                                    {isP2Product(item) && (
                                      <Badge
                                        variant="secondary"
                                        className="bg-orange-100 text-orange-800 text-xs"
                                      >
                                        <QrCode className="w-3 h-3 mr-1" />
                                        P2
                                      </Badge>
                                    )}
                                    {getItemTraceability(item.agPartNumber, inventoryItems as any[]).required && (
                                      <Badge
                                        variant="secondary"
                                        className="bg-blue-100 text-blue-800 text-xs"
                                      >
                                        <ClipboardList className="w-3 h-3 mr-1" />
                                        Traceable
                                      </Badge>
                                    )}
                                    {getStatusBadge(item.status)}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Expected: {item.expectedQuantity} | Received:{' '}
                                    {item.receivedQuantity}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleReceiveFromPending(item)}
                                  className={
                                    isP2Product(item)
                                      ? 'bg-orange-500 hover:bg-orange-600'
                                      : ''
                                  }
                                  data-testid={`button-receive-${item.id}`}
                                >
                                  {isP2Product(item) && (
                                    <QrCode className="w-4 h-4 mr-1" />
                                  )}
                                  Receive
                                </Button>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Parts Request Orders
                </CardTitle>
                <CardDescription>
                  Ordered parts from department requests awaiting receipt
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingBatchReceipts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-muted-foreground">Loading pending receipts...</span>
                  </div>
                ) : pendingBatchReceipts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No pending parts request receipts</p>
                    <p className="text-sm">Order batches created from parts requests will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingBatchReceipts.map((group) => {
                      const vendorKey = `batch-vendor-${group.vendorId || 'unknown'}`;
                      const isExpanded = expandedBatchVendors.has(vendorKey);
                      const remainingTotal = group.totalOrdered - group.totalReceived;
                      const lines = getAllBatchOrderLines(group);

                      return (
                        <div key={vendorKey} className="border rounded-lg">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                            onClick={() => {
                              setExpandedBatchVendors(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(vendorKey)) newSet.delete(vendorKey);
                                else newSet.add(vendorKey);
                                return newSet;
                              });
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Package className="w-5 h-5 text-purple-500" />
                              <div>
                                <p className="font-medium">{group.vendorName}</p>
                                <p className="text-sm text-muted-foreground">
                                  {lines.length} line items | {remainingTotal} units remaining
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); openBatchReceiveDialog(group); }}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Receive
                              </Button>
                              {isExpanded ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t px-4 pb-4">
                              {group.batches.map(batch => (
                                <div key={batch.batchId} className="mt-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge variant="secondary">{batch.batchStatus}</Badge>
                                    {batch.orderDate && (
                                      <span className="text-xs text-muted-foreground">
                                        Ordered: {new Date(batch.orderDate).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  <table className="w-full">
                                    <thead>
                                      <tr className="text-xs text-gray-500 uppercase">
                                        <th className="text-left py-2">Part</th>
                                        <th className="text-center py-2">Ordered</th>
                                        <th className="text-center py-2">Received</th>
                                        <th className="text-center py-2">Remaining</th>
                                        <th className="text-left py-2">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                      {batch.orderLines.map(line => (
                                        <tr key={line.orderLineId} className="text-sm">
                                          <td className="py-2">
                                            <div className="font-medium">{line.partName}</div>
                                            <div className="text-xs text-gray-500">{line.partNumber}</div>
                                          </td>
                                          <td className="py-2 text-center">{line.qtyOrdered}</td>
                                          <td className="py-2 text-center">{line.qtyReceived}</td>
                                          <td className="py-2 text-center font-medium">{line.remainingQty}</td>
                                          <td className="py-2">
                                            <Badge variant={line.remainingQty === 0 ? 'default' : 'secondary'}>
                                              {line.status.replace(/_/g, ' ')}
                                            </Badge>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Dialog open={isBatchReceiveDialogOpen} onOpenChange={setIsBatchReceiveDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Receive Ordered Parts</DialogTitle>
                <DialogDescription>
                  {batchReceiveVendorGroup ? `Receive parts from ${batchReceiveVendorGroup.vendorName}. Enter quantities received per line item.` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-4">
                {batchReceiveVendorGroup && (
                  <>
                    <div className="max-h-80 overflow-y-auto border rounded-lg">
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Part</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ordered</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Already Rcvd</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Remaining</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Receive Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {getAllBatchOrderLines(batchReceiveVendorGroup).map(line => (
                            <tr key={line.orderLineId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="px-3 py-2">
                                <div className="text-sm font-medium">{line.partName}</div>
                                <div className="text-xs text-gray-500">{line.partNumber}</div>
                              </td>
                              <td className="px-3 py-2 text-center text-sm">{line.qtyOrdered}</td>
                              <td className="px-3 py-2 text-center text-sm">{line.qtyReceived}</td>
                              <td className="px-3 py-2 text-center text-sm">{line.remainingQty}</td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max={line.remainingQty}
                                  value={batchReceiveQuantities[line.orderLineId] ?? 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setBatchReceiveQuantities(prev => ({ ...prev, [line.orderLineId]: val }));
                                  }}
                                  className="w-20 text-center mx-auto"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <Label>Notes (optional)</Label>
                      <Textarea
                        value={batchReceiveNotes}
                        onChange={(e) => setBatchReceiveNotes(e.target.value)}
                        placeholder="Receiving notes..."
                        rows={2}
                      />
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsBatchReceiveDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleBatchReceive} disabled={batchReceiveMutation.isPending}>
                        {batchReceiveMutation.isPending ? 'Receiving...' : 'Confirm Receipt'}
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="history">
          <div className="space-y-6">
            {/* Recently Received Traceable Items - For Barcode Printing */}
            {recentlyReceived.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Tag className="h-5 w-5" />
                        Recently Received - Print Barcodes
                      </CardTitle>
                      <CardDescription>
                        Traceable items ready for barcode printing (Lot/Batch tracked)
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectedForPrint.size === recentlyReceived.length ? clearPrintSelection : selectAllForPrint}
                        data-testid="button-select-all-print"
                      >
                        {selectedForPrint.size === recentlyReceived.length ? (
                          <>
                            <Square className="h-4 w-4 mr-2" />
                            Deselect All
                          </>
                        ) : (
                          <>
                            <CheckSquare className="h-4 w-4 mr-2" />
                            Select All ({recentlyReceived.length})
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleBatchPrintBarcodes}
                        disabled={selectedForPrint.size === 0}
                        data-testid="button-print-barcodes"
                      >
                        <Printer className="h-4 w-4 mr-2" />
                        Print Barcodes ({selectedForPrint.size})
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentlyReceived.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                          selectedForPrint.has(item.id!) ? 'bg-blue-50 border-blue-300' : 'bg-green-50'
                        }`}
                        data-testid={`received-item-${item.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Checkbox
                            checked={selectedForPrint.has(item.id!)}
                            onCheckedChange={() => togglePrintSelection(item.id!)}
                            data-testid={`checkbox-print-${item.id}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="font-mono text-xs">
                                {item.poNumber}
                              </Badge>
                              <span className="font-medium">{item.agPartNumber}</span>
                              <span className="text-muted-foreground">-</span>
                              <span className="text-sm">{item.name}</span>
                              {getStatusBadge('complete')}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              <span>Qty: {item.receivedQuantity}</span>
                              {item.lotNumber && (
                                <Badge variant="secondary" className="text-xs">
                                  Lot: {item.lotNumber}
                                </Badge>
                              )}
                              {item.batchNumber && (
                                <Badge variant="secondary" className="text-xs">
                                  Batch: {item.batchNumber}
                                </Badge>
                              )}
                              <span>
                                {new Date(item.receivedDate!).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromRecentlyReceived(item.id!)}
                          className="text-muted-foreground hover:text-destructive"
                          data-testid={`button-remove-${item.id}`}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Regular Receiving History */}
            <Card>
              <CardHeader>
                <CardTitle>Receiving History</CardTitle>
                <CardDescription>Previously completed receipts</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {mockReceivingItems
                    .filter((item) => item.status === 'complete')
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-green-50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {item.agPartNumber}
                            </span>
                            <span className="text-muted-foreground">-</span>
                            <span>{item.name}</span>
                            {getStatusBadge(item.status)}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Received: {item.receivedQuantity} units
                          </p>
                          {item.receivedBy && (
                            <p className="text-sm text-muted-foreground">
                              By: {item.receivedBy} on{' '}
                              {new Date(item.receivedDate!).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  {mockReceivingItems.filter((item) => item.status === 'complete').length === 0 && recentlyReceived.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No completed receipts yet
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* P2 Receiving Dialog */}
      <P2ReceivingDialog
        open={p2DialogOpen}
        onOpenChange={setP2DialogOpen}
        item={selectedP2Item}
      />

      {/* Standard Receiving Dialog */}
      <Dialog open={receivingDialogOpen} onOpenChange={setReceivingDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Package className="h-5 w-5" />
              Receive Item
              {currentPoGroupItems.length > 1 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Item {currentItemIndex + 1} of {currentPoGroupItems.length}
                </Badge>
              )}
              {perUnitMode && (
                <Badge variant="default" className="ml-2 text-xs bg-purple-600">
                  Unit {currentUnitIndex + 1} of {totalUnitsToReceive}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {perUnitMode ? (
                <span className="block">
                  Enter traceability data for each unit individually
                  <span className="block text-xs mt-1 text-purple-600 dark:text-purple-400">
                    Each unit requires separate traceability information. Data auto-copies to next unit.
                  </span>
                </span>
              ) : (
                <>
                  Enter receiving details for this item
                  {currentPoGroupItems.length > 1 && (
                    <span className="block text-xs mt-1">
                      After receiving, the next item will open automatically
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedReceivingItem && (
            <div className="space-y-4">
              {/* Item Info */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="font-mono text-xs">
                    {selectedReceivingItem.poNumber}
                  </Badge>
                  <span className="font-medium">#{selectedReceivingItem.agPartNumber}</span>
                </div>
                <p className="text-sm text-muted-foreground">{selectedReceivingItem.name}</p>
                <p className="text-sm mt-1">
                  <span className="text-muted-foreground">Expected:</span> {selectedReceivingItem.expectedQuantity} | 
                  <span className="text-muted-foreground ml-2">Already Received:</span> {selectedReceivingItem.receivedQuantity}
                </p>
              </div>

              {/* Per-Unit Progress Bar */}
              {perUnitMode && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Unit Progress</span>
                    <span className="font-medium text-purple-600">
                      {currentUnitIndex + 1} / {totalUnitsToReceive}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${((currentUnitIndex + 1) / totalUnitsToReceive) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Quantity - Editable in per-unit mode only before starting entry */}
              {!perUnitMode ? (
                <div>
                  <Label htmlFor="dialogQuantity">Quantity to Receive *</Label>
                  <Input
                    id="dialogQuantity"
                    type="number"
                    value={dialogReceivingData.receivedQuantity}
                    onChange={(e) =>
                      setDialogReceivingData((prev) => ({
                        ...prev,
                        receivedQuantity: parseFloat(e.target.value) || 0,
                      }))
                    }
                    min="0.01"
                    step="0.01"
                    max={selectedReceivingItem.expectedQuantity - selectedReceivingItem.receivedQuantity}
                    data-testid="input-receive-quantity"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Remaining to receive: {selectedReceivingItem.expectedQuantity - selectedReceivingItem.receivedQuantity}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Quantity to Receive</Label>
                    {/* Allow editing quantity only before starting per-unit entry */}
                    {currentUnitIndex === 0 && allUnitsTraceabilityData.length === 0 ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={dialogReceivingData.receivedQuantity}
                          onChange={(e) => {
                            const newQty = parseFloat(e.target.value) || 0.01;
                            const maxQty = selectedReceivingItem.expectedQuantity - selectedReceivingItem.receivedQuantity;
                            const clampedQty = Math.max(0.01, Math.min(newQty, maxQty));
                            setDialogReceivingData((prev) => ({
                              ...prev,
                              receivedQuantity: clampedQty,
                            }));
                            // Exit per-unit mode if quantity becomes a decimal or 1
                            if (!Number.isInteger(clampedQty) || clampedQty <= 1) {
                              setPerUnitMode(false);
                              setTotalUnitsToReceive(0);
                              setCurrentUnitIndex(0);
                              setAllUnitsTraceabilityData([]);
                              toast('Switched to single-unit mode for decimal/single quantity', { icon: 'ℹ️' });
                            } else {
                              setTotalUnitsToReceive(clampedQty);
                            }
                          }}
                          min="0.01"
                          step="0.01"
                          max={selectedReceivingItem.expectedQuantity - selectedReceivingItem.receivedQuantity}
                          className="w-24 h-8 text-center"
                          data-testid="input-receive-quantity-perunit"
                        />
                        <span className="text-sm text-muted-foreground">units</span>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="font-mono">
                        {dialogReceivingData.receivedQuantity} units (locked)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {currentUnitIndex === 0 && allUnitsTraceabilityData.length === 0 
                      ? 'Adjust quantity before entering unit data. Each unit requires separate traceability.'
                      : 'Quantity is locked after entering unit traceability data.'}
                  </p>
                </div>
              )}

              {/* Traceability Fields - Dynamic based on item configuration */}
              {selectedItemTraceability.required && selectedItemTraceability.fields.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
                      <ClipboardList className="h-4 w-4" />
                      {perUnitMode ? (
                        <span>Unit {currentUnitIndex + 1} Traceability</span>
                      ) : (
                        <span>Traceability Information Required</span>
                      )}
                    </div>
                    {/* Copy button for per-unit mode (from previous unit) */}
                    {perUnitMode && currentUnitIndex > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyFromPreviousUnit}
                        className="text-xs"
                        data-testid="button-copy-from-previous-unit"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy from Unit {currentUnitIndex}
                      </Button>
                    )}
                    {/* Copy button for multi-item mode (from previous item) */}
                    {!perUnitMode && Object.keys(lastTraceabilityData).length > 0 && currentItemIndex > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCopyFromPrevious}
                        className="text-xs"
                        data-testid="button-copy-traceability"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy from Previous
                      </Button>
                    )}
                  </div>
                  <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20 space-y-3">
                    {selectedItemTraceability.fields.map((field) => (
                      <div key={field}>
                        <Label htmlFor={`traceability-${field}`}>
                          {TRACEABILITY_FIELD_LABELS[field] || field} *
                        </Label>
                        <Input
                          id={`traceability-${field}`}
                          type={DATE_FIELDS.includes(field) ? 'date' : 'text'}
                          value={traceabilityData[field] || ''}
                          onChange={(e) =>
                            setTraceabilityData((prev) => ({
                              ...prev,
                              [field]: e.target.value,
                            }))
                          }
                          placeholder={`Enter ${TRACEABILITY_FIELD_LABELS[field] || field}`}
                          data-testid={`input-traceability-${field}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CoC Link and Notes - Only show on last unit or when not in per-unit mode */}
              {(!perUnitMode || currentUnitIndex === totalUnitsToReceive - 1) && (
                <>
                  <div>
                    <Label htmlFor="dialogCocLink" className="flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" />
                      Certificate of Conformance (CoC) Link
                    </Label>
                    <Input
                      id="dialogCocLink"
                      type="url"
                      value={dialogReceivingData.cocLink}
                      onChange={(e) =>
                        setDialogReceivingData((prev) => ({
                          ...prev,
                          cocLink: e.target.value,
                        }))
                      }
                      placeholder="https://drive.google.com/... or other link to CoC document"
                      data-testid="input-receive-coc-link"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Paste a link to the Certificate of Conformance for this material
                    </p>
                  </div>
                  {/* PDF Document Upload */}
                  <div>
                    <Label className="flex items-center gap-1">
                      <FilePdf className="h-3 w-3" />
                      Supporting Document (PDF)
                    </Label>
                    <div className="mt-1.5 space-y-2">
                      {!receivingPdfFile && !dialogReceivingData.pdfUrl ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('receiving-pdf-upload')?.click()}
                            disabled={isUploadingReceivingPdf}
                            data-testid="button-upload-receiving-pdf"
                          >
                            {isUploadingReceivingPdf ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <Upload className="h-4 w-4 mr-2" />
                                Upload PDF
                              </>
                            )}
                          </Button>
                          <input
                            id="receiving-pdf-upload"
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  toast.error('File size must be less than 10MB');
                                  return;
                                }
                                if (!file.type.includes('pdf')) {
                                  toast.error('Only PDF files are allowed');
                                  return;
                                }
                                setReceivingPdfFile(file);
                                setIsUploadingReceivingPdf(true);
                                try {
                                  const formData = new FormData();
                                  formData.append('file', file);
                                  formData.append('title', `Receiving Doc - ${selectedReceivingItem?.agPartNumber || 'Item'}`);
                                  formData.append('documentType', 'receiving');
                                  const response = await fetch('/api/documents/upload', {
                                    method: 'POST',
                                    body: formData,
                                    credentials: 'include',
                                  });
                                  if (!response.ok) {
                                    throw new Error('Upload failed');
                                  }
                                  const data = await response.json();
                                  const documentUrl = data.id ? `/api/documents/${data.id}/download` : '';
                                  setDialogReceivingData((prev) => ({ ...prev, pdfUrl: documentUrl }));
                                  toast.success('Document uploaded successfully');
                                } catch (error) {
                                  toast.error('Failed to upload document');
                                  setReceivingPdfFile(null);
                                } finally {
                                  setIsUploadingReceivingPdf(false);
                                }
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-2 border rounded bg-muted/50">
                          <FilePdf className="h-4 w-4 text-red-600" />
                          <span className="text-sm flex-1 truncate">
                            {receivingPdfFile?.name || (dialogReceivingData.pdfUrl?.split('/').pop())}
                          </span>
                          {dialogReceivingData.pdfUrl && (
                            <a
                              href={dialogReceivingData.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-sm"
                            >
                              View
                            </a>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReceivingPdfFile(null);
                              setDialogReceivingData((prev) => ({ ...prev, pdfUrl: '' }));
                            }}
                            className="h-6 w-6 p-0"
                            data-testid="button-remove-receiving-pdf"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Upload supporting documentation like packing slips, inspection reports, or CoC documents
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="dialogNotes">Notes</Label>
                    <Textarea
                      id="dialogNotes"
                      value={dialogReceivingData.notes}
                      onChange={(e) =>
                        setDialogReceivingData((prev) => ({
                          ...prev,
                          notes: e.target.value,
                        }))
                      }
                      placeholder="Any additional notes about this receipt..."
                      rows={2}
                      data-testid="input-receive-notes"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={handleDialogClose} data-testid="button-cancel-receive">
              Cancel
            </Button>
            {perUnitMode && currentUnitIndex < totalUnitsToReceive - 1 ? (
              <Button onClick={handleNextUnit} data-testid="button-next-unit" className="bg-purple-600 hover:bg-purple-700">
                <ArrowRight className="h-4 w-4 mr-2" />
                Next Unit ({currentUnitIndex + 2} of {totalUnitsToReceive})
              </Button>
            ) : (
              <Button onClick={handleDialogReceive} data-testid="button-confirm-receive">
                <Save className="h-4 w-4 mr-2" />
                {perUnitMode ? `Receive All ${totalUnitsToReceive} Units` : 'Receive Item'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

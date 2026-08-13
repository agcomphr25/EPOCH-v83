import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { 
  Package, 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  RefreshCw,
  Printer,
  ExternalLink,
  AlertTriangle,
  Clock,
  CheckSquare,
  Square,
  Upload,
  Link,
  FileCheck,
  Loader2,
  Archive,
  Filter
} from "lucide-react";
import JsBarcode from "jsbarcode";

type FabricInventory = {
  id: string;
  materialId: string | null;
  productionLineId: string | null;
  inventoryItemId: number | null;
  source: string | null;
  fabric: string | null;
  fabricPartNumber: string | null;
  supplierPartNumber: string | null;
  supplierPoNumber: string | null;
  manufacturerPoNumber: string | null;
  rollNumber: string | null;
  batchNumber: string | null;
  internalControlNumber: string | null;
  manufactureDate: string | null;
  receivedDate: string | null;
  expirationDate: string | null;
  location: string | null;
  conformanceDocumentLink: string | null;
  quantityInStock: number;
  squareMeters: string | null;
  lowStockThreshold: number | null;
  barcode: string | null;
  notes: string | null;
  status: string | null;
  depletedAt: string | null;
  depletedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProductionLine = {
  id: string;
  lineName: string;
  lineNumber: number;
  description: string | null;
  isActive: boolean;
};

type CuttingMaterial = {
  id: string;
  materialName: string;
  materialType: string | null;
  description: string | null;
  isActive: boolean;
};

type FabricItem = {
  id: number;
  agPartNumber: string;
  name: string;
  source: string | null;
  supplierPartNumber: string | null;
};

const emptyForm = {
  materialId: "",
  productionLineId: "",
  inventoryItemId: "",
  source: "",
  fabric: "",
  fabricPartNumber: "",
  supplierPartNumber: "",
  supplierPoNumber: "",
  manufacturerPoNumber: "",
  rollNumber: "",
  batchNumber: "",
  internalControlNumber: "",
  manufactureDate: "",
  receivedDate: "",
  expirationDate: "",
  location: "",
  conformanceDocumentLink: "",
  quantityInStock: "1",
  squareMeters: "",
  lowStockThreshold: "",
  notes: "",
};

type PrintSelection = {
  id: string;
  quantity: number;
};

type FabricGroup = {
  fabricName: string;
  totalQuantity: number;
  rollCount: number;
  rolls: FabricInventory[];
};

type RollHistoryEntry = {
  id: string;
  fabricInventoryId: string;
  sessionLotId: string | null;
  changeType: string;
  quantityDelta: number;
  notes: string | null;
  performedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export default function FabricInventoryPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDepleteDialogOpen, setIsDepleteDialogOpen] = useState(false);
  const [isReactivateDialogOpen, setIsReactivateDialogOpen] = useState(false);
  const [reactivateSquareMeters, setReactivateSquareMeters] = useState("");
  const [selectedItem, setSelectedItem] = useState<FabricInventory | null>(null);
  const [historyRoll, setHistoryRoll] = useState<FabricInventory | null>(null);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "depleted">("active");
  
  // Multi-select for barcode printing
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set());
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printQuantities, setPrintQuantities] = useState<Record<string, number>>({});
  
  // Conformance document link type (url or storage)
  const [conformanceLinkType, setConformanceLinkType] = useState<"url" | "storage">("url");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Additional rolls for batch entry (same batch info, different roll numbers)
  const [additionalRolls, setAdditionalRolls] = useState<Array<{ rollNumber: string; internalControlNumber: string }>>([]);

  // File upload hook for object storage
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (response) => {
      // Object storage serves files at /objects/... path - trust the objectPath verbatim
      setForm(prev => ({ ...prev, conformanceDocumentLink: response.objectPath }));
      setUploadedFileName(response.metadata.name);
      toast({ title: "Success", description: "Document uploaded successfully" });
    },
    onError: (error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    }
  });
  
  // Helper to check if a link is from storage (internal path or GCS URL)
  const isStorageLink = (link: string): boolean => {
    return link.startsWith("/objects/") || 
           link.includes("storage.googleapis.com") ||
           link.includes("storage.cloud.google.com");
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const { data: fabricInventory = [], isLoading, refetch } = useQuery<FabricInventory[]>({
    queryKey: ['/api/cutting-table/fabric-inventory'],
  });

  const { data: productionLines = [] } = useQuery<ProductionLine[]>({
    queryKey: ['/api/cutting-table/production-lines'],
  });

  const { data: materials = [] } = useQuery<CuttingMaterial[]>({
    queryKey: ['/api/cutting-table/materials'],
  });

  const { data: fabricItems = [], isLoading: isLoadingFabricItems } = useQuery<FabricItem[]>({
    queryKey: ['/api/inventory/items/fabric-items'],
    select: (data: any[]) => {
      if (!Array.isArray(data)) return [];
      return data.filter(item => item && item.agPartNumber);
    },
  });

  const { data: rollHistory = [], isLoading: isHistoryLoading } = useQuery<RollHistoryEntry[]>({
    queryKey: ['/api/cutting-table/fabric-inventory', historyRoll?.id, 'history'],
    enabled: isHistoryDrawerOpen && !!historyRoll?.id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      return apiRequest('/api/cutting-table/fabric-inventory', {
        method: 'POST',
        body: JSON.stringify({
          materialId: data.materialId || null,
          productionLineId: data.productionLineId || null,
          inventoryItemId: data.inventoryItemId ? parseInt(data.inventoryItemId) : null,
          source: data.source || null,
          fabric: data.fabric || null,
          fabricPartNumber: data.fabricPartNumber || null,
          supplierPartNumber: data.supplierPartNumber || null,
          supplierPoNumber: data.supplierPoNumber || null,
          manufacturerPoNumber: data.manufacturerPoNumber || null,
          rollNumber: data.rollNumber || null,
          batchNumber: data.batchNumber || null,
          internalControlNumber: data.internalControlNumber || null,
          manufactureDate: data.manufactureDate || null,
          receivedDate: data.receivedDate || null,
          expirationDate: data.expirationDate || null,
          location: data.location || null,
          conformanceDocumentLink: data.conformanceDocumentLink || null,
          quantityInStock: parseInt(data.quantityInStock) || 0,
          squareMeters: data.squareMeters || null,
          lowStockThreshold: parseInt(data.lowStockThreshold) || 10,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory item created" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsAddDialogOpen(false);
      setForm(emptyForm);
      setAdditionalRolls([]);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create fabric inventory item", variant: "destructive" });
    },
  });

  const batchCreateMutation = useMutation({
    mutationFn: async (data: { form: typeof form; additionalRolls: Array<{ rollNumber: string; internalControlNumber: string }> }) => {
      const baseData = {
        materialId: data.form.materialId || null,
        productionLineId: data.form.productionLineId || null,
        inventoryItemId: data.form.inventoryItemId ? parseInt(data.form.inventoryItemId) : null,
        source: data.form.source || null,
        fabric: data.form.fabric || null,
        fabricPartNumber: data.form.fabricPartNumber || null,
        supplierPartNumber: data.form.supplierPartNumber || null,
        supplierPoNumber: data.form.supplierPoNumber || null,
        manufacturerPoNumber: data.form.manufacturerPoNumber || null,
        batchNumber: data.form.batchNumber || null,
        manufactureDate: data.form.manufactureDate || null,
        receivedDate: data.form.receivedDate || null,
        expirationDate: data.form.expirationDate || null,
        location: data.form.location || null,
        conformanceDocumentLink: data.form.conformanceDocumentLink || null,
        quantityInStock: parseInt(data.form.quantityInStock) || 0,
        squareMeters: data.form.squareMeters || null,
        lowStockThreshold: parseInt(data.form.lowStockThreshold) || 10,
        notes: data.form.notes || null,
      };

      const allRolls = [
        { rollNumber: data.form.rollNumber || null, internalControlNumber: data.form.internalControlNumber || null },
        ...data.additionalRolls.map(r => ({
          rollNumber: r.rollNumber || null,
          internalControlNumber: r.internalControlNumber || null,
        }))
      ];

      const results = await Promise.all(
        allRolls.map(roll =>
          apiRequest('/api/cutting-table/fabric-inventory', {
            method: 'POST',
            body: JSON.stringify({
              ...baseData,
              rollNumber: roll.rollNumber,
              internalControlNumber: roll.internalControlNumber,
            }),
          })
        )
      );
      return results;
    },
    onSuccess: (results) => {
      const count = results.length;
      toast({ title: "Success", description: `Created ${count} fabric rolls from the same batch` });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsAddDialogOpen(false);
      setForm(emptyForm);
      setAdditionalRolls([]);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create fabric inventory items", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof form }) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          materialId: data.materialId || null,
          productionLineId: data.productionLineId || null,
          inventoryItemId: data.inventoryItemId ? parseInt(data.inventoryItemId) : null,
          source: data.source || null,
          fabric: data.fabric || null,
          fabricPartNumber: data.fabricPartNumber || null,
          supplierPartNumber: data.supplierPartNumber || null,
          supplierPoNumber: data.supplierPoNumber || null,
          manufacturerPoNumber: data.manufacturerPoNumber || null,
          rollNumber: data.rollNumber || null,
          batchNumber: data.batchNumber || null,
          internalControlNumber: data.internalControlNumber || null,
          manufactureDate: data.manufactureDate || null,
          receivedDate: data.receivedDate || null,
          expirationDate: data.expirationDate || null,
          location: data.location || null,
          conformanceDocumentLink: data.conformanceDocumentLink || null,
          quantityInStock: parseInt(data.quantityInStock) || 0,
          squareMeters: data.squareMeters || null,
          lowStockThreshold: parseInt(data.lowStockThreshold) || 10,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory item updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      setForm(emptyForm);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update fabric inventory item", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Fabric inventory item deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsDeleteDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to delete fabric roll",
        description: error.message || "Failed to delete fabric inventory item",
        variant: "destructive",
      });
    },
  });

  const depleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}/deplete`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Roll marked as depleted - traceability preserved" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsDepleteDialogOpen(false);
      setSelectedItem(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to mark roll as depleted", variant: "destructive" });
    },
  });

  const handleAdd = () => {
    setForm(emptyForm);
    setConformanceLinkType("url");
    setUploadedFileName("");
    setAdditionalRolls([]);
    setIsAddDialogOpen(true);
  };

  const handleEdit = (item: FabricInventory) => {
    setSelectedItem(item);
    setForm({
      materialId: item.materialId || "",
      productionLineId: item.productionLineId || "",
      inventoryItemId: item.inventoryItemId ? String(item.inventoryItemId) : "",
      source: item.source || "",
      fabric: item.fabric || "",
      fabricPartNumber: item.fabricPartNumber || "",
      supplierPartNumber: item.supplierPartNumber || "",
      supplierPoNumber: item.supplierPoNumber || "",
      manufacturerPoNumber: item.manufacturerPoNumber || "",
      rollNumber: item.rollNumber || "",
      batchNumber: item.batchNumber || "",
      internalControlNumber: item.internalControlNumber || "",
      manufactureDate: item.manufactureDate ? item.manufactureDate.split('T')[0] : "",
      receivedDate: item.receivedDate ? item.receivedDate.split('T')[0] : "",
      expirationDate: item.expirationDate ? item.expirationDate.split('T')[0] : "",
      location: item.location || "",
      conformanceDocumentLink: item.conformanceDocumentLink || "",
      quantityInStock: String(item.quantityInStock || 0),
      squareMeters: item.squareMeters || "",
      lowStockThreshold: String(item.lowStockThreshold || 10),
      notes: item.notes || "",
    });
    // Detect if existing link is from storage or external URL
    const link = item.conformanceDocumentLink || "";
    if (link && isStorageLink(link)) {
      setConformanceLinkType("storage");
      // Extract filename from path or provide fallback
      const pathParts = link.split("/");
      const lastPart = pathParts[pathParts.length - 1] || "";
      setUploadedFileName(lastPart.includes("-") ? "Uploaded document" : lastPart || "Uploaded document");
    } else {
      setConformanceLinkType("url");
      setUploadedFileName("");
    }
    setIsEditDialogOpen(true);
  };

  const reactivateMutation = useMutation({
    mutationFn: async ({ id, squareMeters }: { id: string; squareMeters: string }) => {
      return apiRequest(`/api/cutting-table/fabric-inventory/${id}/reactivate`, {
        method: 'POST',
        body: JSON.stringify({ squareMeters }),
      });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Roll reactivated and set to active" });
      queryClient.invalidateQueries({ queryKey: ['/api/cutting-table/fabric-inventory'] });
      setIsReactivateDialogOpen(false);
      setSelectedItem(null);
      setReactivateSquareMeters("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reactivate roll", variant: "destructive" });
    },
  });

  const handleDelete = (item: FabricInventory) => {
    setSelectedItem(item);
    setIsDeleteDialogOpen(true);
  };

  const handleViewHistory = (item: FabricInventory) => {
    setHistoryRoll(item);
    setIsHistoryDrawerOpen(true);
  };

  const handleDeplete = (item: FabricInventory) => {
    setSelectedItem(item);
    setIsDepleteDialogOpen(true);
  };

  const handleReactivate = (item: FabricInventory) => {
    setSelectedItem(item);
    setReactivateSquareMeters(item.squareMeters ? String(item.squareMeters) : "");
    setIsReactivateDialogOpen(true);
  };

  const handlePrintLabel = async (item: FabricInventory) => {
    if (!item.barcode) {
      toast({ title: "Error", description: "This item doesn't have a barcode", variant: "destructive" });
      return;
    }
    window.open(`/api/cutting-table/fabric-inventory/${item.id}/print-barcode`, '_blank');
  };

  // Multi-select handlers
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
    const itemsWithBarcodes = filteredInventory.filter(item => item.barcode);
    if (selectedForPrint.size === itemsWithBarcodes.length) {
      setSelectedForPrint(new Set());
    } else {
      setSelectedForPrint(new Set(itemsWithBarcodes.map(item => item.id)));
    }
  };

  const openPrintDialog = () => {
    if (selectedForPrint.size === 0) {
      toast({ title: "No items selected", description: "Please select at least one fabric with a barcode to print", variant: "destructive" });
      return;
    }
    // Initialize quantities to 1 for each selected item
    const initialQuantities: Record<string, number> = {};
    selectedForPrint.forEach(id => {
      initialQuantities[id] = printQuantities[id] || 1;
    });
    setPrintQuantities(initialQuantities);
    setIsPrintDialogOpen(true);
  };

  const handleBatchPrint = () => {
    const selectedItems = fabricInventory.filter(item => selectedForPrint.has(item.id) && item.barcode);
    
    if (selectedItems.length === 0) {
      toast({ title: "Error", description: "No valid items to print", variant: "destructive" });
      return;
    }

    // Generate labels array with quantities
    const labels: Array<{ item: FabricInventory; quantity: number }> = [];
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
    .label-title {
      font-size: 7px;
      font-weight: bold;
      margin-bottom: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .label-info {
      font-size: 6px;
      color: #000;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      ${labels.map((labelData, index) => `
        <div class="label">
          <div class="label-content">
            <div class="label-title">${labelData.item.fabric || 'Fabric'}</div>
            ${labelData.item.rollNumber ? `<div class="label-info">Roll #: <strong>${labelData.item.rollNumber}</strong></div>` : ''}
            ${labelData.item.expirationDate ? `<div class="label-info">Exp: <strong>${new Date(labelData.item.expirationDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' })}</strong></div>` : ''}
            <div class="barcode-container">
              <svg id="barcode-${index}"></svg>
            </div>
            <div class="barcode-text">${labelData.item.barcode}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  
  <script>
    ${labels.map((labelData, index) => `
      JsBarcode("#barcode-${index}", "${labelData.item.barcode}", {
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
    
    setIsPrintDialogOpen(false);
    setSelectedForPrint(new Set());
    toast({ title: "Success", description: `Prepared ${labels.length} labels for printing` });
  };

  const getStatusBadge = (item: FabricInventory) => {
    const quantity = item.quantityInStock || 0;
    const threshold = item.lowStockThreshold || 10;
    const expDate = item.expirationDate ? new Date(item.expirationDate) : null;
    const isExpired = expDate && expDate < new Date();

    if (item.status === 'depleted') {
      return <Badge className="bg-gray-500 hover:bg-gray-600 flex items-center gap-1"><Archive className="h-3 w-3" />Depleted</Badge>;
    }
    if (isExpired) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Expired</Badge>;
    }
    if (quantity <= 0) {
      return <Badge variant="destructive">Out of Stock</Badge>;
    }
    if (quantity <= threshold) {
      return <Badge className="bg-yellow-600 hover:bg-yellow-700">Low Stock</Badge>;
    }
    return <Badge className="bg-green-600 hover:bg-green-700">In Stock</Badge>;
  };

  const filteredInventory = fabricInventory.filter(item => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = (
      (item.fabric || "").toLowerCase().includes(query) ||
      (item.source || "").toLowerCase().includes(query) ||
      (item.fabricPartNumber || "").toLowerCase().includes(query) ||
      (item.supplierPartNumber || "").toLowerCase().includes(query) ||
      (item.rollNumber || "").toLowerCase().includes(query) ||
      (item.batchNumber || "").toLowerCase().includes(query) ||
      (item.internalControlNumber || "").toLowerCase().includes(query) ||
      (item.location || "").toLowerCase().includes(query) ||
      (item.barcode || "").toLowerCase().includes(query)
    );
    
    const itemStatus = item.status || 'active';
    const matchesStatus = statusFilter === 'all' || itemStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getProductionLineName = (lineId: string | null) => {
    if (!lineId) return "-";
    const line = productionLines.find(l => l.id === lineId);
    return line?.lineName || "-";
  };

  const getMaterialName = (materialId: string | null) => {
    if (!materialId) return "-";
    const material = materials.find(m => m.id === materialId);
    return material?.materialName || "-";
  };

  // Group fabrics by name, calculate totals, and sort rolls by FIFO (oldest manufacture date first)
  const fabricGroups: FabricGroup[] = (() => {
    const groupMap: Record<string, FabricGroup> = {};
    
    filteredInventory.forEach(item => {
      const fabricName = item.fabric?.trim() || "Unknown";
      const key = fabricName.toLowerCase();
      
      if (!groupMap[key]) {
        groupMap[key] = {
          fabricName,
          totalQuantity: 0,
          rollCount: 0,
          rolls: [],
        };
      }
      
      groupMap[key].rolls.push(item);
      groupMap[key].totalQuantity += item.quantityInStock || 0;
      groupMap[key].rollCount += 1;
    });
    
    // Sort rolls within each group by FIFO (oldest manufacture date first)
    Object.values(groupMap).forEach(group => {
      group.rolls.sort((a, b) => {
        const getDateValue = (item: FabricInventory): number => {
          if (item.manufactureDate) return new Date(item.manufactureDate).getTime();
          if (item.receivedDate) return new Date(item.receivedDate).getTime();
          if (item.createdAt) return new Date(item.createdAt).getTime();
          return 0; // Fallback for missing dates - sort to beginning
        };
        return getDateValue(a) - getDateValue(b); // Oldest first (FIFO)
      });
    });
    
    // Sort groups alphabetically by fabric name
    return Object.values(groupMap).sort((a, b) => 
      a.fabricName.localeCompare(b.fabricName)
    );
  })();

  const getRollCount = (fabricName: string | null) => {
    if (!fabricName) return 0;
    const group = fabricGroups.find(g => g.fabricName.toLowerCase() === fabricName.toLowerCase().trim());
    return group?.rollCount || 0;
  };

  const fabricFormContent = (
    <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fabric">Fabric Type *</Label>
          <Select
            value={form.inventoryItemId}
            onValueChange={(value) => {
              const selectedItem = fabricItems.find(item => String(item.id) === value);
              if (selectedItem) {
                setForm({
                  ...form,
                  inventoryItemId: value,
                  fabric: selectedItem.name,
                  fabricPartNumber: selectedItem.agPartNumber,
                  source: selectedItem.source || form.source,
                  supplierPartNumber: selectedItem.supplierPartNumber || form.supplierPartNumber,
                });
              }
            }}
          >
            <SelectTrigger data-testid="select-fabric-type">
              <SelectValue placeholder={isLoadingFabricItems ? "Loading..." : "Select fabric (from inventory)"} />
            </SelectTrigger>
            <SelectContent>
              {isLoadingFabricItems ? (
                <SelectItem value="__loading__" disabled>
                  Loading fabric items...
                </SelectItem>
              ) : fabricItems.length === 0 ? (
                <SelectItem value="__empty__" disabled>
                  No fabric items found (mark items as Fabric in Inventory)
                </SelectItem>
              ) : (
                fabricItems.map((item) => (
                  <SelectItem key={String(item.id)} value={String(item.id)}>
                    {item.agPartNumber} - {item.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Source/Manufacturer</Label>
          <Input
            id="source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="e.g., Hexcel, Toray"
            data-testid="input-source"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="productionLineId">Production Line</Label>
          <Select
            value={form.productionLineId}
            onValueChange={(value) => setForm({ ...form, productionLineId: value })}
          >
            <SelectTrigger data-testid="select-production-line">
              <SelectValue placeholder="Select production line" />
            </SelectTrigger>
            <SelectContent>
              {productionLines.map((line) => (
                <SelectItem key={line.id} value={line.id}>
                  {line.lineName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="materialId">Material Category</Label>
          <Select
            value={form.materialId}
            onValueChange={(value) => setForm({ ...form, materialId: value })}
          >
            <SelectTrigger data-testid="select-material">
              <SelectValue placeholder="Select material" />
            </SelectTrigger>
            <SelectContent>
              {materials.map((mat) => (
                <SelectItem key={mat.id} value={mat.id}>
                  {mat.materialName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* AS9100 Traceability Section */}
      <div className="border-t pt-4 mt-2">
        <h4 className="text-sm font-medium text-muted-foreground mb-3">AS9100 Traceability Information</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fabricPartNumber">Part Number *</Label>
            <Input
              id="fabricPartNumber"
              value={form.fabricPartNumber}
              readOnly
              placeholder="Auto-filled from fabric type"
              className="bg-muted"
              data-testid="input-part-number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplierPartNumber">Supplier Part Number</Label>
            <Input
              id="supplierPartNumber"
              value={form.supplierPartNumber}
              onChange={(e) => setForm({ ...form, supplierPartNumber: e.target.value })}
              placeholder="e.g., 14002"
              data-testid="input-supplier-part-number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rollNumber">Roll Number *</Label>
            <Input
              id="rollNumber"
              value={form.rollNumber}
              onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
              placeholder="e.g., 1140620043"
              data-testid="input-roll-number"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="batchNumber">Batch/Lot Number</Label>
          <Input
            id="batchNumber"
            value={form.batchNumber}
            onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
            placeholder="e.g., LOT-2024-001"
            data-testid="input-batch-number"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="internalControlNumber">Internal Control #</Label>
          <Input
            id="internalControlNumber"
            value={form.internalControlNumber}
            onChange={(e) => setForm({ ...form, internalControlNumber: e.target.value })}
            placeholder="e.g., ICN-12345"
            data-testid="input-internal-control"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="supplierPoNumber">Supplier PO#</Label>
          <Input
            id="supplierPoNumber"
            value={form.supplierPoNumber}
            onChange={(e) => setForm({ ...form, supplierPoNumber: e.target.value })}
            placeholder="e.g., PO-2024-0001"
            data-testid="input-supplier-po"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="manufacturerPoNumber">Manufacturer PO#</Label>
          <Input
            id="manufacturerPoNumber"
            value={form.manufacturerPoNumber}
            onChange={(e) => setForm({ ...form, manufacturerPoNumber: e.target.value })}
            placeholder="e.g., MFG-PO-12345"
            data-testid="input-manufacturer-po"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="squareMeters">Square Meters</Label>
        <Input
          id="squareMeters"
          value={form.squareMeters}
          onChange={(e) => setForm({ ...form, squareMeters: e.target.value })}
          placeholder="e.g., 100.5"
          data-testid="input-square-meters"
        />
        <p className="text-xs text-muted-foreground">Each roll counts as 1 unit in stock</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
          <Input
            id="lowStockThreshold"
            type="number"
            value={form.lowStockThreshold}
            onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            placeholder="10"
            data-testid="input-threshold"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Storage Location</Label>
          <Input
            id="location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="e.g., Freezer 1, Shelf A3"
            data-testid="input-location"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="manufactureDate">Manufacture Date</Label>
          <Input
            id="manufactureDate"
            type="date"
            value={form.manufactureDate}
            onChange={(e) => setForm({ ...form, manufactureDate: e.target.value })}
            data-testid="input-manufacture-date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="receivedDate">Received Date</Label>
          <Input
            id="receivedDate"
            type="date"
            value={form.receivedDate}
            onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
            data-testid="input-received-date"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expirationDate">Expiration Date</Label>
          <Input
            id="expirationDate"
            type="date"
            value={form.expirationDate}
            onChange={(e) => setForm({ ...form, expirationDate: e.target.value })}
            data-testid="input-expiration-date"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Conformance Document</Label>
        <RadioGroup
          value={conformanceLinkType}
          onValueChange={(value: "url" | "storage") => {
            setConformanceLinkType(value);
            // Don't clear the link when switching - preserve existing data
          }}
          className="flex gap-4"
          data-testid="radio-conformance-type"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="url" id="link-type-url" />
            <Label htmlFor="link-type-url" className="flex items-center gap-1 cursor-pointer font-normal">
              <Link className="h-4 w-4" />
              External URL
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="storage" id="link-type-storage" />
            <Label htmlFor="link-type-storage" className="flex items-center gap-1 cursor-pointer font-normal">
              <Upload className="h-4 w-4" />
              Upload to Storage
            </Label>
          </div>
        </RadioGroup>
        
        {conformanceLinkType === "url" ? (
          <Input
            id="conformanceDocumentLink"
            type="url"
            value={form.conformanceDocumentLink}
            onChange={(e) => setForm({ ...form, conformanceDocumentLink: e.target.value })}
            placeholder="https://..."
            data-testid="input-conformance-link"
          />
        ) : (
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-conformance-file"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-upload-conformance"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading... {progress}%
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Choose File
                  </>
                )}
              </Button>
              {uploadedFileName && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <FileCheck className="h-4 w-4" />
                  <span>{uploadedFileName}</span>
                </div>
              )}
            </div>
            {form.conformanceDocumentLink && (
              <div className="flex items-center justify-between p-2 bg-muted rounded-md">
                <div className="flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{uploadedFileName || "Document uploaded"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href={form.conformanceDocumentLink} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-xs flex items-center gap-1"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm(prev => ({ ...prev, conformanceDocumentLink: "" }));
                      setUploadedFileName("");
                    }}
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    data-testid="button-remove-document"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Additional notes..."
          rows={3}
          data-testid="input-notes"
        />
      </div>
    </div>
  );

  const additionalRollsSection = (
    <div className="border-t pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium">Additional Rolls (Same Batch)</h4>
          <p className="text-xs text-muted-foreground">Add more rolls with the same batch info but different roll numbers</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdditionalRolls([...additionalRolls, { rollNumber: "", internalControlNumber: "" }])}
          data-testid="button-add-another-roll"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Another Roll
        </Button>
      </div>
      {additionalRolls.length > 0 && (
        <div className="space-y-2">
          {additionalRolls.map((roll, index) => (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
              <span className="text-xs text-muted-foreground w-8">#{index + 2}</span>
              <Input
                placeholder="Roll Number"
                value={roll.rollNumber}
                onChange={(e) => {
                  const updated = [...additionalRolls];
                  updated[index].rollNumber = e.target.value;
                  setAdditionalRolls(updated);
                }}
                className="flex-1"
                data-testid={`input-additional-roll-${index}`}
              />
              <Input
                placeholder="Internal Control #"
                value={roll.internalControlNumber}
                onChange={(e) => {
                  const updated = [...additionalRolls];
                  updated[index].internalControlNumber = e.target.value;
                  setAdditionalRolls(updated);
                }}
                className="flex-1"
                data-testid={`input-additional-icn-${index}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  const updated = additionalRolls.filter((_, i) => i !== index);
                  setAdditionalRolls(updated);
                }}
                className="h-8 w-8 text-destructive hover:text-destructive"
                data-testid={`button-remove-roll-${index}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground mt-2">
            Total rolls to create: {additionalRolls.length + 1} (primary + {additionalRolls.length} additional)
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="fabric-inventory-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fabric Inventory</h1>
          <p className="text-muted-foreground">Manage cutting table fabric inventory with full traceability</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleAdd} data-testid="button-add-fabric">
            <Plus className="h-4 w-4 mr-2" />
            Add Fabric
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Inventory Items</CardTitle>
              <CardDescription>
                {filteredInventory.length} of {fabricInventory.length} items
                {selectedForPrint.size > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    ({selectedForPrint.size} selected for printing)
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              {selectedForPrint.size > 0 && (
                <Button
                  onClick={openPrintDialog}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-batch-print"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Labels ({selectedForPrint.size})
                </Button>
              )}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "depleted")}>
                <SelectTrigger className="w-36" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="depleted">Depleted</SelectItem>
                  <SelectItem value="all">All Rolls</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by fabric, ICN, roll #, batch #, barcode..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInventory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package className="h-12 w-12 mb-4" />
              <p>No fabric inventory items found</p>
              <Button variant="link" onClick={handleAdd}>Add your first fabric</Button>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full space-y-2">
              {fabricGroups.map((group) => (
                <AccordionItem 
                  key={group.fabricName} 
                  value={group.fabricName}
                  className="border rounded-lg px-4"
                  data-testid={`accordion-fabric-${group.fabricName.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-lg">{group.fabricName}</span>
                        <Badge variant="outline" className="font-mono">
                          {group.rollCount} roll{group.rollCount !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Total Qty: <span className="font-mono font-medium">{group.totalQuantity}</span>
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-2 pb-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12">
                              <Checkbox
                                checked={group.rolls.filter(r => r.barcode).every(r => selectedForPrint.has(r.id))}
                                onCheckedChange={() => {
                                  const rollsWithBarcodes = group.rolls.filter(r => r.barcode);
                                  const allSelected = rollsWithBarcodes.every(r => selectedForPrint.has(r.id));
                                  setSelectedForPrint(prev => {
                                    const newSet = new Set(prev);
                                    rollsWithBarcodes.forEach(r => {
                                      if (allSelected) {
                                        newSet.delete(r.id);
                                      } else {
                                        newSet.add(r.id);
                                      }
                                    });
                                    return newSet;
                                  });
                                }}
                                data-testid={`checkbox-select-all-${group.fabricName.toLowerCase().replace(/\s+/g, '-')}`}
                                title="Select all rolls in this group"
                              />
                            </TableHead>
                            <TableHead>Roll #</TableHead>
                            <TableHead>Batch #</TableHead>
                            <TableHead>Mfg Date</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead>Supplier PO#</TableHead>
                            <TableHead>Mfg PO#</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.rolls.map((item, index) => (
                            <TableRow 
                              key={item.id} 
                              data-testid={`row-roll-${item.id}`}
                              className={`${selectedForPrint.has(item.id) ? 'bg-blue-50 dark:bg-blue-950' : ''} ${index === 0 ? 'bg-green-50 dark:bg-green-950/30' : ''}`}
                              title={index === 0 ? 'FIFO: Use this roll first' : ''}
                            >
                              <TableCell>
                                {item.barcode ? (
                                  <Checkbox
                                    checked={selectedForPrint.has(item.id)}
                                    onCheckedChange={() => toggleSelectForPrint(item.id)}
                                    data-testid={`checkbox-print-${item.id}`}
                                  />
                                ) : (
                                  <span className="text-gray-300" title="No barcode">-</span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono">
                                {index === 0 && (
                                  <Badge className="bg-green-600 hover:bg-green-700 mr-2 text-xs">FIFO</Badge>
                                )}
                                {item.rollNumber || "-"}
                              </TableCell>
                              <TableCell>{item.batchNumber || "-"}</TableCell>
                              <TableCell>
                                {item.manufactureDate ? new Date(item.manufactureDate).toLocaleDateString() : "-"}
                              </TableCell>
                              <TableCell>
                                {item.expirationDate ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {new Date(item.expirationDate).toLocaleDateString()}
                                  </span>
                                ) : "-"}
                              </TableCell>
                              <TableCell>{item.supplierPoNumber || "-"}</TableCell>
                              <TableCell>{item.manufacturerPoNumber || "-"}</TableCell>
                              <TableCell>{item.location || "-"}</TableCell>
                              <TableCell className="text-right font-mono">{item.quantityInStock}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {getStatusBadge(item)}
                                  <div className="flex gap-1">
                                    {item.conformanceDocumentLink && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => window.open(item.conformanceDocumentLink!, '_blank')}
                                        title="View conformance document"
                                        data-testid={`button-view-doc-${item.id}`}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleViewHistory(item)}
                                      title="View roll history"
                                      data-testid={`button-history-${item.id}`}
                                    >
                                      <Clock className="h-4 w-4" />
                                    </Button>
                                    {item.barcode && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handlePrintLabel(item)}
                                        title="Print barcode label"
                                        data-testid={`button-print-${item.id}`}
                                      >
                                        <Printer className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEdit(item)}
                                      title="Edit"
                                      data-testid={`button-edit-${item.id}`}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {item.status !== 'depleted' && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDeplete(item)}
                                        title="Mark as Depleted (preserves traceability)"
                                        className="text-gray-600 hover:text-gray-800"
                                        data-testid={`button-deplete-${item.id}`}
                                      >
                                        <Archive className="h-4 w-4" />
                                      </Button>
                                    )}
                                    {item.status === 'depleted' && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleReactivate(item)}
                                        title="Reactivate Roll"
                                        className="text-green-600 hover:text-green-800"
                                        data-testid={`button-reactivate-${item.id}`}
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDelete(item)}
                                      title="Delete permanently"
                                      className="text-destructive hover:text-destructive"
                                      data-testid={`button-delete-${item.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Fabric Inventory</DialogTitle>
            <DialogDescription>
              Add a new fabric item to the cutting table inventory.
            </DialogDescription>
          </DialogHeader>
          {fabricFormContent}
          {additionalRollsSection}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (additionalRolls.length > 0) {
                  batchCreateMutation.mutate({ form, additionalRolls });
                } else {
                  createMutation.mutate(form);
                }
              }}
              disabled={!form.inventoryItemId || createMutation.isPending || batchCreateMutation.isPending}
              data-testid="button-save-add"
            >
              {(createMutation.isPending || batchCreateMutation.isPending) 
                ? "Saving..." 
                : additionalRolls.length > 0 
                  ? `Add ${additionalRolls.length + 1} Rolls`
                  : "Add Fabric"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Fabric Inventory</DialogTitle>
            <DialogDescription>
              Update the fabric inventory item details.
            </DialogDescription>
          </DialogHeader>
          {fabricFormContent}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                selectedItem && updateMutation.mutate({ id: selectedItem.id, data: form });
              }}
              disabled={(!form.inventoryItemId && !form.fabric) || updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fabric Inventory Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedItem?.fabric}"? 
              This action cannot be undone and will remove all associated tracking data.
              <br /><br />
              <strong>Tip:</strong> If you want to keep traceability records, use "Mark as Depleted" instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && deleteMutation.mutate(selectedItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDepleteDialogOpen} onOpenChange={setIsDepleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark Roll as Depleted?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark "{selectedItem?.fabric}" (Roll: {selectedItem?.rollNumber || 'N/A'}, Batch: {selectedItem?.batchNumber || 'N/A'}) as depleted.
              <br /><br />
              <strong>Traceability will be preserved:</strong> The roll's information, batch numbers, and conformance documents will remain accessible for auditing and AS9100 compliance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && depleteMutation.mutate(selectedItem.id)}
              className="bg-gray-600 text-white hover:bg-gray-700"
              data-testid="button-confirm-deplete"
            >
              {depleteMutation.isPending ? "Marking..." : "Mark as Depleted"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isReactivateDialogOpen} onOpenChange={(open) => {
        setIsReactivateDialogOpen(open);
        if (!open) { setSelectedItem(null); setReactivateSquareMeters(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reactivate Roll</DialogTitle>
            <DialogDescription>
              Reactivating "{selectedItem?.fabric}" (Roll: {selectedItem?.rollNumber || 'N/A'}, Batch: {selectedItem?.batchNumber || 'N/A'}) will set its status back to active.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div>
              <Label htmlFor="reactivate-sq-meters">Remaining Square Meters</Label>
              <Input
                id="reactivate-sq-meters"
                type="number"
                min="0"
                step="0.01"
                value={reactivateSquareMeters}
                onChange={(e) => setReactivateSquareMeters(e.target.value)}
                placeholder="Enter remaining quantity"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Set the remaining quantity for this roll. Leave blank to keep the existing value.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsReactivateDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 text-white hover:bg-green-700"
              disabled={reactivateMutation.isPending}
              onClick={() => selectedItem && reactivateMutation.mutate({ id: selectedItem.id, squareMeters: reactivateSquareMeters })}
              data-testid="button-confirm-reactivate"
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate Roll"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Print Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
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
                      <p className="font-medium text-sm">{item.fabric || 'Unknown Fabric'}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.batchNumber && `Batch: ${item.batchNumber}`}
                        {item.source && ` | ${item.source}`}
                      </p>
                      <p className="text-xs font-mono text-blue-600">{item.barcode}</p>
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
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBatchPrint} className="bg-blue-600 hover:bg-blue-700" data-testid="button-confirm-print">
              <Printer className="h-4 w-4 mr-2" />
              Print Labels
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Roll History Drawer */}
      <Sheet open={isHistoryDrawerOpen} onOpenChange={(open) => {
        setIsHistoryDrawerOpen(open);
        if (!open) setHistoryRoll(null);
      }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Roll History
            </SheetTitle>
            <SheetDescription>
              {historyRoll && (
                <span>
                  <span className="font-medium text-foreground">{historyRoll.rollNumber || historyRoll.id}</span>
                  {historyRoll.fabric && <span> · {historyRoll.fabric}</span>}
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          {isHistoryLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : rollHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Clock className="h-10 w-10 opacity-30" />
              <p className="text-sm">No history recorded for this roll.</p>
            </div>
          ) : (
            <ol className="relative border-l border-border ml-3 space-y-6">
              {rollHistory.map((entry) => {
                const isDepletion = entry.notes?.toLowerCase().includes('depleted');
                const isReactivation = entry.notes?.toLowerCase().includes('reactivat');
                const isReceipt = entry.changeType === 'RECEIPT';
                const isIssue = entry.changeType === 'ISSUE';

                let badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' = 'secondary';
                let badgeLabel = entry.changeType;
                if (isDepletion) { badgeVariant = 'destructive'; badgeLabel = 'DEPLETED'; }
                else if (isReactivation) { badgeVariant = 'default'; badgeLabel = 'REACTIVATED'; }
                else if (isReceipt) { badgeVariant = 'default'; badgeLabel = 'RECEIPT'; }
                else if (isIssue) { badgeVariant = 'secondary'; badgeLabel = 'ISSUE'; }

                const formattedDate = entry.createdAt
                  ? new Date(entry.createdAt).toLocaleString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })
                  : '—';

                return (
                  <li key={entry.id} className="ml-6">
                    <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border ring-4 ring-background">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    </span>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant={badgeVariant} className="text-xs">
                        {badgeLabel}
                      </Badge>
                      <time className="text-xs text-muted-foreground">{formattedDate}</time>
                    </div>
                    {entry.performedBy && (
                      <p className="text-sm text-foreground">
                        <span className="font-medium">{entry.performedBy}</span>
                      </p>
                    )}
                    {entry.quantityDelta !== 0 && (
                      <p className="text-sm text-muted-foreground">
                        Qty change:{' '}
                        <span className={entry.quantityDelta > 0 ? 'text-green-600' : 'text-red-600'}>
                          {entry.quantityDelta > 0 ? '+' : ''}{entry.quantityDelta}
                        </span>
                      </p>
                    )}
                    {entry.notes && (
                      <p className="text-sm text-muted-foreground mt-0.5">{entry.notes}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

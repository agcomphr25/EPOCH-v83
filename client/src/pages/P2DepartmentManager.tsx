import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useBarcodeInput } from '@/hooks/useBarcodeInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Scan,
  Package,
  ArrowRight,
  Pause,
  Play,
  Trash2,
  History,
  CheckCircle,
  Clock,
  AlertCircle,
  Route,
  Printer,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import PartRoutingWizard from '@/components/PartRoutingWizard';
import DepartmentTransferSignatureDialog from '@/components/DepartmentTransferSignatureDialog';

const P2_DEPARTMENTS = [
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
] as const;

type Department = typeof P2_DEPARTMENTS[number];

interface P2SerializedItem {
  id: string;  // UUID
  serialNumber: string;
  barcode: string;
  travelerBarcode?: string;
  poNumber: string;
  partNumber: string;
  partName: string;
  customerName: string;
  currentDepartment: string;
  currentStageIndex: number;
  status: 'ACTIVE' | 'COMPLETED' | 'SCRAPPED' | 'HOLD';
  sequenceNumber: number;
  notes?: string;
  holdReason?: string;
  scrapReason?: string;
  createdAt: string;
  updatedAt: string;
}

interface P2SerializedItemEvent {
  id: string;  // UUID
  eventType: string;
  fromDepartment?: string;
  toDepartment?: string;
  performedBy: string;
  notes?: string;
  createdAt: string;
}

interface MaterialRequirement {
  partId: string;
  partNumber: string;
  partName: string;
  requiredFields: string[];
}

interface CustomDataField {
  fieldName: string;
  fieldType: 'text' | 'number' | 'date' | 'textarea';
  isRequired: boolean;
}

interface DepartmentConfiguration {
  materials: MaterialRequirement[];
  assignedTechnicianId: number | null;
  qcStandards: any[];
  ovenCuringSteps?: any[];
  specialProcess?: string;
  customDataFields?: CustomDataField[];
}

interface PartRouting {
  id: string;
  inventoryItemId: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  traceabilityConfig: Record<string, string[]>;
  departmentMaterials?: Record<string, MaterialRequirement[]>;
  departmentConfig?: Record<string, DepartmentConfiguration>;
}

interface TraceabilityData {
  lotNumber?: string;
  batchNumber?: string;
  expirationDate?: string;
  serialNumber?: string;
  revision?: string;
}

interface MaterialTraceabilityData {
  [partId: string]: TraceabilityData;
}

function TravelerBarcodeCell({ item }: { item: P2SerializedItem }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.travelerBarcode || '');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setValue(item.travelerBarcode || '');
  }, [item.travelerBarcode]);

  const saveMutation = useMutation({
    mutationFn: async (travelerBarcode: string) => {
      return apiRequest(`/api/p2-traveler-viewer/item/${item.id}/traveler-barcode`, {
        method: 'PATCH',
        body: { travelerBarcode },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items'] });
      toast({ title: 'Saved', description: 'Traveler barcode linked' });
      setEditing(false);
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to save', variant: 'destructive' });
    },
  });

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-7 text-xs w-44"
          placeholder="Scan or type barcode..."
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveMutation.mutate(value.trim());
            if (e.key === 'Escape') { setEditing(false); setValue(item.travelerBarcode || ''); }
          }}
        />
        <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => saveMutation.mutate(value.trim())} disabled={saveMutation.isPending}>
          <CheckCircle className="h-3 w-3 text-green-600" />
        </Button>
      </div>
    );
  }

  if (item.travelerBarcode) {
    return (
      <div
        className="cursor-pointer text-xs font-mono hover:text-primary"
        onClick={() => setEditing(true)}
        title="Click to edit physical traveler barcode"
      >
        {item.travelerBarcode}
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-xs text-muted-foreground"
      onClick={() => setEditing(true)}
    >
      <Scan className="h-3 w-3 mr-1" />
      Link barcode
    </Button>
  );
}

export default function P2DepartmentManager() {
  const [selectedDepartment, setSelectedDepartment] = useState<Department>('Layup');
  const [selectedItem, setSelectedItem] = useState<P2SerializedItem | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [scrapReason, setScrapReason] = useState('');
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showScrapDialog, setShowScrapDialog] = useState(false);
  const [showRoutingWizard, setShowRoutingWizard] = useState(false);
  const [showTraceabilityDialog, setShowTraceabilityDialog] = useState(false);
  const [traceabilityData, setTraceabilityData] = useState<TraceabilityData>({});
  const [materialTraceabilityData, setMaterialTraceabilityData] = useState<MaterialTraceabilityData>({});
  const [pendingTransitionItemId, setPendingTransitionItemId] = useState<string | null>(null);
  const [pendingTransitionDepartment, setPendingTransitionDepartment] = useState<string | null>(null);
  const [requiredTraceabilityFields, setRequiredTraceabilityFields] = useState<string[]>([]);
  const [requiredMaterials, setRequiredMaterials] = useState<MaterialRequirement[]>([]);
  const [customDataFields, setCustomDataFields] = useState<CustomDataField[]>([]);
  const [customDataValues, setCustomDataValues] = useState<Record<string, string>>({});
  const [showSignatureDialog, setShowSignatureDialog] = useState(false);
  const [signatureDialogItem, setSignatureDialogItem] = useState<P2SerializedItem | null>(null);
  const [signatureDialogNextDepartment, setSignatureDialogNextDepartment] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle barcode scan - defined early so it can be used by the hook
  const handleBarcodeScan = async (scanned: string) => {
    try {
      const item: P2SerializedItem = await apiRequest(`/api/customers/barcode/${encodeURIComponent(scanned)}`);
      
      if (item.currentDepartment !== selectedDepartment) {
        toast({
          title: 'Wrong Department',
          description: `This item is in ${item.currentDepartment}, not ${selectedDepartment}`,
          variant: 'destructive',
        });
        return;
      }

      setSelectedItem(item);
      toast({
        title: 'Item Scanned',
        description: `${item.partName} - ${item.serialNumber}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Item not found',
        variant: 'destructive',
      });
    }
  };

  // Barcode scanner hook
  const {
    barcode,
    scannedBarcode,
    setBarcode,
    clearScan,
  } = useBarcodeInput();

  // Handle barcode scan when scannedBarcode changes
  useEffect(() => {
    if (scannedBarcode) {
      handleBarcodeScan(scannedBarcode);
      clearScan();
    }
  }, [scannedBarcode, clearScan, handleBarcodeScan]);

  // Fetch department queue
  const { data: queueItems = [], isLoading } = useQuery<P2SerializedItem[]>({
    queryKey: [`/api/p2/departments/${selectedDepartment}/queue?status=ACTIVE`],
  });

  // Fetch item history
  const { data: itemHistory = [] } = useQuery<P2SerializedItemEvent[]>({
    queryKey: selectedItem ? [`/api/p2/serialized-items/${selectedItem.id}/history`] : [],
    enabled: !!selectedItem && showHistory,
  });

  // Fetch part routing for selected item
  const { data: partRouting } = useQuery<PartRouting>({
    queryKey: selectedItem ? [`/api/part-routings/part/${selectedItem.partNumber}`] : [],
    enabled: !!selectedItem,
  });

  // Fetch current user session for signatures
  const { data: currentUser } = useQuery<{
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
  }>({
    queryKey: ['/api/auth/session'],
  });

  // Helper function to get next department in sequence
  const getNextDepartment = (currentDept: string): string => {
    const currentIndex = P2_DEPARTMENTS.indexOf(currentDept as Department);
    if (currentIndex >= 0 && currentIndex < P2_DEPARTMENTS.length - 1) {
      return P2_DEPARTMENTS[currentIndex + 1];
    }
    return 'Completed';
  };

  // Get required traceability fields for current department
  const getRequiredTraceabilityFields = () => {
    if (!partRouting || !selectedItem) return [];
    return partRouting.traceabilityConfig[selectedItem.currentDepartment] || [];
  };

  // Get required fields for a specific item and department (independent of state)
  const getRequiredFieldsForItem = async (partNumber: string, department: string): Promise<{ itemFields: string[]; materials: MaterialRequirement[]; customFields: CustomDataField[] }> => {
    const routing: PartRouting = await apiRequest(`/api/part-routings/part/${partNumber}`);
    return {
      itemFields: routing.traceabilityConfig[department] || [],
      materials: routing.departmentMaterials?.[department] || [],
      customFields: routing.departmentConfig?.[department]?.customDataFields || [],
    };
  };

  // Save traceability mutation
  const saveTraceabilityMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: TraceabilityData & { department: string } }) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/traceability`, {
        method: 'POST',
        body: {
          ...data,
          recordedBy: 'system',
        },
      }),
    onSuccess: () => {
      toast({
        title: 'Traceability Recorded',
        description: 'Traceability data saved successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save traceability data',
        variant: 'destructive',
      });
    },
  });

  const departmentHasRoutingSignature = (partNumber: string, department: string): boolean => {
    if (!partRouting?.departmentConfig?.[department]) return false;
    const config = partRouting.departmentConfig[department] as any;
    const hasFinishSigCheck = config.finishChecks?.some(
      (check: any) => check.taskType === 'SIGNATURE' && check.required
    );
    const hasSigConfig = config.signatureConfig?.finishRequiresSignature &&
      (config.signatureConfig?.requiredSignatures?.length || 0) > 0;
    return !!(hasFinishSigCheck || hasSigConfig);
  };

  // Show signature dialog before transitioning
  // If the department already has a required signature in its routing config, skip the extra transfer signature
  const showSignatureBeforeTransition = (item: P2SerializedItem) => {
    if (item.currentDepartment === 'Final QC' && departmentHasRoutingSignature(item.partNumber, item.currentDepartment)) {
      transitionMutation.mutate(item.id);
      return;
    }
    const nextDept = getNextDepartment(item.currentDepartment);
    setSignatureDialogItem(item);
    setSignatureDialogNextDepartment(nextDept);
    setShowSignatureDialog(true);
  };

  // Handle signature completion - proceed with transition
  const handleSignatureComplete = () => {
    if (signatureDialogItem) {
      transitionMutation.mutate(signatureDialogItem.id);
    }
    // Reset signature state
    setShowSignatureDialog(false);
    setSignatureDialogItem(null);
    setSignatureDialogNextDepartment('');
  };

  // Handle transition - check for traceability requirements first
  const handleTransition = async (item: P2SerializedItem) => {
    try {
      // Fetch traceability requirements for this specific item
      const requirements = await getRequiredFieldsForItem(item.partNumber, item.currentDepartment);
      
      if (requirements.itemFields.length > 0 || requirements.materials.length > 0 || requirements.customFields.length > 0) {
        // Capture item and requirements for traceability dialog
        setSelectedItem(item);
        setPendingTransitionItemId(item.id);
        setPendingTransitionDepartment(item.currentDepartment);
        setRequiredTraceabilityFields(requirements.itemFields);
        setRequiredMaterials(requirements.materials);
        setCustomDataFields(requirements.customFields);
        setShowTraceabilityDialog(true);
      } else {
        // No traceability required, proceed to signature
        showSignatureBeforeTransition(item);
      }
    } catch (error: any) {
      // Fail closed - routing fetch failed, block advancement
      const errorMessage = (error.message || '').toLowerCase();
      const isNoRoutingConfigured = 
        errorMessage.includes('no active routing found') ||
        errorMessage.includes('part routing not found') ||
        errorMessage.includes('404');
      
      if (isNoRoutingConfigured) {
        // No routing configured for this part, still require signature for AS9100 compliance
        showSignatureBeforeTransition(item);
      } else {
        // Network error or server error - block advancement and show error
        toast({
          title: 'Cannot Verify Traceability Requirements',
          description: error.message || 'Failed to load routing configuration. Cannot advance item.',
          variant: 'destructive',
        });
      }
    }
  };

  // Transition mutation
  const transitionMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/transition`, {
        method: 'POST',
        body: { username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since held items can be released then advanced
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      toast({
        title: 'Success',
        description: 'Item transitioned to next department',
      });
      clearScan();
      setSelectedItem(null);
      setTraceabilityData({});
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to transition item',
        variant: 'destructive',
      });
    },
  });

  // Hold mutation
  const holdMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/hold`, {
        method: 'POST',
        body: { reason, username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since items move between statuses
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      // Also invalidate history if we're viewing it
      if (selectedItem) {
        queryClient.invalidateQueries({
          queryKey: [`/api/p2/serialized-items/${selectedItem.id}/history`]
        });
      }
      toast({
        title: 'Success',
        description: 'Item placed on hold',
      });
      setShowHoldDialog(false);
      setHoldReason('');
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to place item on hold',
        variant: 'destructive',
      });
    },
  });

  // Release mutation
  const releaseMutation = useMutation({
    mutationFn: (itemId: string) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/release`, {
        method: 'POST',
        body: { username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since items move between statuses
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      toast({
        title: 'Success',
        description: 'Item released from hold',
      });
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to release item from hold',
        variant: 'destructive',
      });
    },
  });

  // Scrap mutation
  const scrapMutation = useMutation({
    mutationFn: ({ itemId, reason }: { itemId: string; reason: string }) =>
      apiRequest(`/api/p2/serialized-items/${itemId}/scrap`, {
        method: 'POST',
        body: { reason, username: 'system' },
      }),
    onSuccess: () => {
      // Invalidate both ACTIVE and HOLD queues since scrapped items disappear from view
      P2_DEPARTMENTS.forEach((dept) => {
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=ACTIVE`] 
        });
        queryClient.invalidateQueries({ 
          queryKey: [`/api/p2/departments/${dept}/queue?status=HOLD`] 
        });
      });
      // Also invalidate history if we're viewing it
      if (selectedItem) {
        queryClient.invalidateQueries({
          queryKey: [`/api/p2/serialized-items/${selectedItem.id}/history`]
        });
      }
      toast({
        title: 'Success',
        description: 'Item scrapped',
      });
      setShowScrapDialog(false);
      setScrapReason('');
      setSelectedItem(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to scrap item',
        variant: 'destructive',
      });
    },
  });

  // Focus input on department change
  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedDepartment]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: any }> = {
      ACTIVE: { variant: 'default', icon: CheckCircle },
      HOLD: { variant: 'secondary', icon: Pause },
      SCRAPPED: { variant: 'destructive', icon: Trash2 },
      COMPLETED: { variant: 'outline', icon: CheckCircle },
    };

    const config = variants[status] || variants.ACTIVE;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  // Print Avery labels for all items in current queue
  const handlePrintAveryLabels = () => {
    if (queueItems.length === 0) {
      toast({
        title: 'No Items',
        description: 'No items in queue to print labels for',
        variant: 'destructive',
      });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Error',
        description: 'Could not open print window. Please allow popups.',
        variant: 'destructive',
      });
      return;
    }

    const generateLabelContent = (item: P2SerializedItem, index: number) => {
      return `
        <div class="avery-label">
          <div class="label-content">
            <div class="line1">${item.serialNumber}</div>
            <div class="line2">${item.partNumber}</div>
            <div class="line3">${item.partName}</div>
            <div class="line4">${item.poNumber} - ${item.customerName}</div>
            <div class="line5">
              <canvas id="barcode-${index}" width="180" height="25"></canvas>
            </div>
          </div>
        </div>
      `;
    };

    printWindow.document.write(`
      <html>
        <head>
          <title>P2 Layup Queue Labels</title>
          <style>
            body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
            .avery-label {
              width: 2.625in;
              height: 1in;
              border: 1px solid #ddd;
              margin: 0;
              padding: 0.03in;
              display: inline-block;
              vertical-align: top;
              box-sizing: border-box;
              page-break-inside: avoid;
              background: white;
            }
            .label-content {
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              text-align: center;
              padding: 2px;
              box-sizing: border-box;
            }
            .line1 { font-size: 9pt; font-weight: bold; color: #000; }
            .line2 { font-size: 7pt; font-weight: bold; color: #333; }
            .line3 { font-size: 6pt; color: #000; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
            .line4 { font-size: 5pt; color: #666; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
            .line5 { display: flex; justify-content: center; align-items: center; min-height: 0.25in; }
            @media print {
              body { margin: 0; }
              .avery-label { border: none; margin: 0; }
              @page { size: 8.5in 11in; margin: 0.45in 0.1875in 0.5in 0.1875in; }
            }
            .labels-container { display: flex; flex-wrap: wrap; justify-content: flex-start; width: 8.5in; }
          </style>
        </head>
        <body>
          <div class="labels-container">
            ${queueItems.map((item, i) => generateLabelContent(item, i)).join('')}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    // Generate barcodes after content is loaded
    setTimeout(() => {
      queueItems.forEach((item, i) => {
        const canvas = printWindow.document.getElementById(`barcode-${i}`) as HTMLCanvasElement;
        if (canvas && item.barcode) {
          try {
            const format = getBarcodeFormat(item.barcode);
            JsBarcode(canvas, item.barcode, {
              format: format,
              width: format === 'CODE128' ? 1.2 : 1.5,
              height: 22,
              displayValue: false,
              margin: 2,
              lineColor: '#000000',
            });
          } catch (error) {
            console.error(`Error generating barcode for item ${i}:`, error);
          }
        }
      });
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            P2 Department Manager
          </h1>
          <p className="text-muted-foreground">
            Track and manage serialized items through manufacturing workflow
          </p>
        </div>
        <Button
          data-testid="button-configure-routing"
          onClick={() => setShowRoutingWizard(true)}
          className="flex items-center gap-2"
        >
          <Route className="h-4 w-4" />
          Configure Part Routing
        </Button>
      </div>

      {/* Barcode Scanner Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Barcode Scanner
          </CardTitle>
          <CardDescription>
            Scan item barcode to select and process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="barcode-input">Barcode</Label>
              <Input
                id="barcode-input"
                ref={inputRef}
                data-testid="input-barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or enter barcode..."
                className="font-mono text-lg"
                autoFocus
              />
            </div>
            {selectedItem && (
              <div className="flex gap-2">
                <Button
                  data-testid="button-transition"
                  onClick={() => handleTransition(selectedItem)}
                  disabled={transitionMutation.isPending}
                >
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Advance to Next Department
                </Button>
                <Button
                  data-testid="button-hold"
                  variant="outline"
                  onClick={() => setShowHoldDialog(true)}
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Hold
                </Button>
                <Button
                  data-testid="button-scrap"
                  variant="destructive"
                  onClick={() => setShowScrapDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Scrap
                </Button>
                <Button
                  data-testid="button-history"
                  variant="outline"
                  onClick={() => setShowHistory(true)}
                >
                  <History className="mr-2 h-4 w-4" />
                  History
                </Button>
              </div>
            )}
          </div>

          {/* Selected Item Display */}
          {selectedItem && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/50" data-testid="card-selected-item">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Serial Number</p>
                  <p className="font-mono font-semibold" data-testid="text-serial-number">{selectedItem.serialNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Part</p>
                  <p className="font-semibold" data-testid="text-part-name">{selectedItem.partName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">PO Number</p>
                  <p className="font-semibold">{selectedItem.poNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-semibold">{selectedItem.customerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  {getStatusBadge(selectedItem.status)}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Department</p>
                  <p className="font-semibold">{selectedItem.currentDepartment}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Department Tabs */}
      <Tabs value={selectedDepartment} onValueChange={(v) => setSelectedDepartment(v as Department)}>
        <TabsList className="grid w-full grid-cols-6">
          {P2_DEPARTMENTS.map((dept) => (
            <TabsTrigger key={dept} value={dept} data-testid={`tab-${dept.toLowerCase().replace(/[\/\s]/g, '-')}`}>
              {dept}
            </TabsTrigger>
          ))}
        </TabsList>

        {P2_DEPARTMENTS.map((dept) => (
          <TabsContent key={dept} value={dept} className="mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      {dept} Queue ({queueItems.length} items)
                    </CardTitle>
                    <CardDescription>
                      Items currently in the {dept} department
                    </CardDescription>
                  </div>
                  {dept === 'Layup' && queueItems.length > 0 && (
                    <Button
                      variant="outline"
                      onClick={handlePrintAveryLabels}
                      data-testid="button-print-labels"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      Print Avery Labels ({queueItems.length})
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Loading queue...</p>
                  </div>
                ) : queueItems.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">No items in this department</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>System Barcode</TableHead>
                        <TableHead>Traveler Barcode</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead>Part Name</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueItems.map((item) => (
                        <TableRow 
                          key={item.id} 
                          data-testid={`row-item-${item.id}`}
                          className={selectedItem?.id === item.id ? 'bg-muted' : ''}
                        >
                          <TableCell className="font-mono text-sm">{item.serialNumber}</TableCell>
                          <TableCell className="font-mono text-xs">{item.barcode}</TableCell>
                          <TableCell>
                            <TravelerBarcodeCell item={item} />
                          </TableCell>
                          <TableCell className="font-mono">{item.partNumber}</TableCell>
                          <TableCell>{item.partName}</TableCell>
                          <TableCell>{item.poNumber}</TableCell>
                          <TableCell>{item.customerName}</TableCell>
                          <TableCell>{getStatusBadge(item.status)}</TableCell>
                          <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                data-testid={`button-advance-${item.id}`}
                                onClick={() => handleTransition(item)}
                                disabled={transitionMutation.isPending || item.status !== 'ACTIVE'}
                              >
                                <ArrowRight className="mr-1 h-3 w-3" />
                                Advance
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-hold-${item.id}`}
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowHoldDialog(true);
                                }}
                                disabled={item.status !== 'ACTIVE'}
                              >
                                <Pause className="mr-1 h-3 w-3" />
                                Hold
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-scrap-${item.id}`}
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowScrapDialog(true);
                                }}
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Scrap
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                data-testid={`button-history-${item.id}`}
                                onClick={() => {
                                  setSelectedItem(item);
                                  setShowHistory(true);
                                }}
                              >
                                <History className="h-3 w-3" />
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
          </TabsContent>
        ))}
      </Tabs>

      {/* Hold Dialog */}
      <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
        <DialogContent data-testid="dialog-hold">
          <DialogHeader>
            <DialogTitle>Place Item on Hold</DialogTitle>
            <DialogDescription>
              Provide a reason for placing this item on hold
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="hold-reason">Hold Reason</Label>
              <Textarea
                id="hold-reason"
                data-testid="input-hold-reason"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Enter reason for hold..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowHoldDialog(false)}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-hold"
                onClick={() => {
                  if (selectedItem && holdReason) {
                    holdMutation.mutate({ itemId: selectedItem.id, reason: holdReason });
                  }
                }}
                disabled={!holdReason || holdMutation.isPending}
              >
                Confirm Hold
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scrap Dialog */}
      <Dialog open={showScrapDialog} onOpenChange={setShowScrapDialog}>
        <DialogContent data-testid="dialog-scrap">
          <DialogHeader>
            <DialogTitle>Scrap Item</DialogTitle>
            <DialogDescription>
              Provide a reason for scrapping this item
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="scrap-reason">Scrap Reason</Label>
              <Textarea
                id="scrap-reason"
                data-testid="input-scrap-reason"
                value={scrapReason}
                onChange={(e) => setScrapReason(e.target.value)}
                placeholder="Enter reason for scrap..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowScrapDialog(false)}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-scrap"
                variant="destructive"
                onClick={() => {
                  if (selectedItem && scrapReason) {
                    scrapMutation.mutate({ itemId: selectedItem.id, reason: scrapReason });
                  }
                }}
                disabled={!scrapReason || scrapMutation.isPending}
              >
                Confirm Scrap
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-3xl" data-testid="dialog-history">
          <DialogHeader>
            <DialogTitle>Item History</DialogTitle>
            <DialogDescription>
              {selectedItem?.serialNumber} - {selectedItem?.partName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {itemHistory.map((event) => (
              <div key={event.id} className="border rounded p-3 space-y-1" data-testid={`event-${event.id}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <Badge>{event.eventType}</Badge>
                    {event.fromDepartment && event.toDepartment && (
                      <span className="ml-2 text-sm">
                        {event.fromDepartment} → {event.toDepartment}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">By: {event.performedBy}</p>
                {event.notes && (
                  <p className="text-sm">{event.notes}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Traceability Dialog */}
      <Dialog open={showTraceabilityDialog} onOpenChange={setShowTraceabilityDialog}>
        <DialogContent data-testid="dialog-traceability">
          <DialogHeader>
            <DialogTitle>Record Traceability Data</DialogTitle>
            <DialogDescription>
              Enter required traceability information for {selectedItem?.currentDepartment}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {requiredTraceabilityFields.includes('lotNumber') && (
              <div>
                <Label htmlFor="lot-number">Lot Number *</Label>
                <Input
                  id="lot-number"
                  data-testid="input-lot-number"
                  value={traceabilityData.lotNumber || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, lotNumber: e.target.value })}
                  placeholder="Scan or enter lot number..."
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('batchNumber') && (
              <div>
                <Label htmlFor="batch-number">Batch Number *</Label>
                <Input
                  id="batch-number"
                  data-testid="input-batch-number"
                  value={traceabilityData.batchNumber || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, batchNumber: e.target.value })}
                  placeholder="Scan or enter batch number..."
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('expirationDate') && (
              <div>
                <Label htmlFor="expiration-date">Expiration Date *</Label>
                <Input
                  id="expiration-date"
                  data-testid="input-expiration-date"
                  type="date"
                  value={traceabilityData.expirationDate || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, expirationDate: e.target.value })}
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('serialNumber') && (
              <div>
                <Label htmlFor="component-serial">Component Serial Number *</Label>
                <Input
                  id="component-serial"
                  data-testid="input-component-serial"
                  value={traceabilityData.serialNumber || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, serialNumber: e.target.value })}
                  placeholder="Scan or enter component serial..."
                />
              </div>
            )}
            {requiredTraceabilityFields.includes('revision') && (
              <div>
                <Label htmlFor="revision">Revision *</Label>
                <Input
                  id="revision"
                  data-testid="input-revision"
                  value={traceabilityData.revision || ''}
                  onChange={(e) => setTraceabilityData({ ...traceabilityData, revision: e.target.value })}
                  placeholder="Enter revision..."
                />
              </div>
            )}

            {/* Materials Traceability */}
            {requiredMaterials.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <h4 className="font-semibold mb-3">Materials Used in {selectedItem?.currentDepartment}</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter traceability data for each material used in this department
                </p>
                {requiredMaterials.map((material) => {
                  const materialData = materialTraceabilityData[material.partId] || {};
                  return (
                    <Card key={material.partId} className="mb-4">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-mono">{material.partNumber}</CardTitle>
                        <CardDescription className="text-xs">{material.partName}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {material.requiredFields.includes('lotNumber') && (
                          <div>
                            <Label htmlFor={`material-${material.partId}-lot`}>Lot Number *</Label>
                            <Input
                              id={`material-${material.partId}-lot`}
                              value={materialData.lotNumber || ''}
                              onChange={(e) => setMaterialTraceabilityData({
                                ...materialTraceabilityData,
                                [material.partId]: { ...materialData, lotNumber: e.target.value }
                              })}
                              placeholder="Scan or enter lot number..."
                            />
                          </div>
                        )}
                        {material.requiredFields.includes('batchNumber') && (
                          <div>
                            <Label htmlFor={`material-${material.partId}-batch`}>Batch Number *</Label>
                            <Input
                              id={`material-${material.partId}-batch`}
                              value={materialData.batchNumber || ''}
                              onChange={(e) => setMaterialTraceabilityData({
                                ...materialTraceabilityData,
                                [material.partId]: { ...materialData, batchNumber: e.target.value }
                              })}
                              placeholder="Scan or enter batch number..."
                            />
                          </div>
                        )}
                        {material.requiredFields.includes('expirationDate') && (
                          <div>
                            <Label htmlFor={`material-${material.partId}-exp`}>Expiration Date *</Label>
                            <Input
                              id={`material-${material.partId}-exp`}
                              type="date"
                              value={materialData.expirationDate || ''}
                              onChange={(e) => setMaterialTraceabilityData({
                                ...materialTraceabilityData,
                                [material.partId]: { ...materialData, expirationDate: e.target.value }
                              })}
                            />
                          </div>
                        )}
                        {material.requiredFields.includes('serialNumber') && (
                          <div>
                            <Label htmlFor={`material-${material.partId}-serial`}>Serial Number *</Label>
                            <Input
                              id={`material-${material.partId}-serial`}
                              value={materialData.serialNumber || ''}
                              onChange={(e) => setMaterialTraceabilityData({
                                ...materialTraceabilityData,
                                [material.partId]: { ...materialData, serialNumber: e.target.value }
                              })}
                              placeholder="Scan or enter serial number..."
                            />
                          </div>
                        )}
                        {material.requiredFields.includes('revision') && (
                          <div>
                            <Label htmlFor={`material-${material.partId}-rev`}>Revision *</Label>
                            <Input
                              id={`material-${material.partId}-rev`}
                              value={materialData.revision || ''}
                              onChange={(e) => setMaterialTraceabilityData({
                                ...materialTraceabilityData,
                                [material.partId]: { ...materialData, revision: e.target.value }
                              })}
                              placeholder="Enter revision..."
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Custom Data Fields */}
            {customDataFields.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <h4 className="font-semibold mb-3">Custom Data Entry Fields</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Fill in the required information for this department
                </p>
                <div className="space-y-3">
                  {customDataFields.map((field, idx) => (
                    <div key={idx}>
                      <Label htmlFor={`custom-${idx}`}>
                        {field.fieldName} {field.isRequired && '*'}
                      </Label>
                      {field.fieldType === 'textarea' ? (
                        <Textarea
                          id={`custom-${idx}`}
                          data-testid={`input-custom-field-${idx}`}
                          value={customDataValues[field.fieldName] || ''}
                          onChange={(e) => setCustomDataValues({
                            ...customDataValues,
                            [field.fieldName]: e.target.value
                          })}
                          placeholder={`Enter ${field.fieldName.toLowerCase()}...`}
                        />
                      ) : (
                        <Input
                          id={`custom-${idx}`}
                          data-testid={`input-custom-field-${idx}`}
                          type={field.fieldType}
                          value={customDataValues[field.fieldName] || ''}
                          onChange={(e) => setCustomDataValues({
                            ...customDataValues,
                            [field.fieldName]: e.target.value
                          })}
                          placeholder={`Enter ${field.fieldName.toLowerCase()}...`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowTraceabilityDialog(false);
                setTraceabilityData({});
                setMaterialTraceabilityData({});
                setPendingTransitionItemId(null);
                setPendingTransitionDepartment(null);
                setRequiredTraceabilityFields([]);
                setRequiredMaterials([]);
                setCustomDataFields([]);
                setCustomDataValues({});
              }}>
                Cancel
              </Button>
              <Button
                data-testid="button-confirm-traceability"
                onClick={async () => {
                  if (!pendingTransitionItemId || !pendingTransitionDepartment) {
                    toast({
                      title: 'Error',
                      description: 'No item queued for transition',
                      variant: 'destructive',
                    });
                    return;
                  }

                  // Validate item-level required fields are filled
                  const missingFields = requiredTraceabilityFields.filter(field => {
                    const value = traceabilityData[field as keyof TraceabilityData];
                    return !value || value.trim() === '';
                  });

                  if (missingFields.length > 0) {
                    toast({
                      title: 'Missing Item Traceability Fields',
                      description: 'Please fill in all required traceability fields for the item',
                      variant: 'destructive',
                    });
                    return;
                  }

                  // Validate materials required fields are filled
                  for (const material of requiredMaterials) {
                    const materialData = materialTraceabilityData[material.partId] || {};
                    const missingMaterialFields = material.requiredFields.filter(field => {
                      const value = materialData[field as keyof TraceabilityData];
                      return !value || (typeof value === 'string' && value.trim() === '');
                    });

                    if (missingMaterialFields.length > 0) {
                      toast({
                        title: 'Missing Material Traceability',
                        description: `Please fill in all required fields for ${material.partNumber}`,
                        variant: 'destructive',
                      });
                      return;
                    }
                  }

                  // Validate custom data fields are filled
                  const missingCustomFields = customDataFields.filter(field => {
                    if (!field.isRequired) return false;
                    const value = customDataValues[field.fieldName];
                    return !value || value.trim() === '';
                  });

                  if (missingCustomFields.length > 0) {
                    toast({
                      title: 'Missing Custom Fields',
                      description: `Please fill in all required custom fields: ${missingCustomFields.map(f => f.fieldName).join(', ')}`,
                      variant: 'destructive',
                    });
                    return;
                  }

                  try {
                    // Save item-level traceability data first
                    if (requiredTraceabilityFields.length > 0) {
                      await saveTraceabilityMutation.mutateAsync({
                        itemId: pendingTransitionItemId,
                        data: { ...traceabilityData, department: pendingTransitionDepartment },
                      });
                    }

                    // Save materials traceability data
                    for (const material of requiredMaterials) {
                      const materialData = materialTraceabilityData[material.partId];
                      if (materialData && material.requiredFields.length > 0) {
                        await apiRequest(`/api/p2/serialized-items/${pendingTransitionItemId}/traceability`, {
                          method: 'POST',
                          body: {
                            ...materialData,
                            department: pendingTransitionDepartment,
                            inventoryPartId: material.partId,
                            inventoryPartNumber: material.partNumber,
                            recordedBy: 'system',
                          },
                        });
                      }
                    }

                    // Save custom data field values
                    if (customDataFields.length > 0 && Object.keys(customDataValues).length > 0) {
                      await apiRequest(`/api/p2/serialized-items/${pendingTransitionItemId}/custom-data`, {
                        method: 'POST',
                        body: {
                          department: pendingTransitionDepartment,
                          customData: customDataValues,
                          recordedBy: 'system',
                        },
                      });
                    }

                    // Reset traceability dialog state
                    setShowTraceabilityDialog(false);
                    setTraceabilityData({});
                    setMaterialTraceabilityData({});
                    setRequiredTraceabilityFields([]);
                    setRequiredMaterials([]);
                    setCustomDataFields([]);
                    setCustomDataValues({});
                    
                    // Proceed to signature dialog after successful traceability save
                    if (selectedItem) {
                      showSignatureBeforeTransition(selectedItem);
                    }
                    
                    // Reset pending transition state after signature dialog is shown
                    setPendingTransitionItemId(null);
                    setPendingTransitionDepartment(null);
                  } catch (error: any) {
                    toast({
                      title: 'Error Saving Traceability',
                      description: error.message || 'Failed to save traceability data',
                      variant: 'destructive',
                    });
                  }
                }}
                disabled={saveTraceabilityMutation.isPending || transitionMutation.isPending || (requiredTraceabilityFields.length === 0 && requiredMaterials.length === 0 && customDataFields.length === 0)}
              >
                Save & Advance
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Part Routing Wizard */}
      <PartRoutingWizard
        open={showRoutingWizard}
        onOpenChange={setShowRoutingWizard}
      />

      {/* Department Transfer Signature Dialog - AS9100 Compliance */}
      {signatureDialogItem && currentUser && (
        <DepartmentTransferSignatureDialog
          open={showSignatureDialog}
          onOpenChange={(open) => {
            if (!open) {
              setShowSignatureDialog(false);
              setSignatureDialogItem(null);
              setSignatureDialogNextDepartment('');
            }
          }}
          onSignatureComplete={handleSignatureComplete}
          serializedItemId={signatureDialogItem.id}
          barcode={signatureDialogItem.barcode}
          partNumber={signatureDialogItem.partNumber}
          partName={signatureDialogItem.partName}
          fromDepartment={signatureDialogItem.currentDepartment}
          toDepartment={signatureDialogNextDepartment}
          workInstructionRef={partRouting?.departmentConfig?.[signatureDialogItem.currentDepartment]?.specialProcess}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}

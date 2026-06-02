import { useState, type KeyboardEvent } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Factory, 
  Search, 
  Play, 
  Pause, 
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Package,
  Scan,
  XCircle,
  Eye,
  Loader2,
  ChevronRight,
  Printer,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Check,
  Users,
  FolderOpen,
  FileText
} from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface ActiveTask {
  id: number;
  employeeName: string;
  employeeCode: string;
  startedAt: string;
}

interface QueueItem {
  id: string;
  poId: number | null;
  barcode: string;
  serialNumber: string;
  partNumber: string;
  partName: string;
  poNumber: string;
  customerName: string;
  status: string;
  currentDepartment: string;
  currentStageIndex: number;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  isReplacement?: boolean;
  replacementForSerializedItemId?: string | null;
  replacementForSerialNumber?: string | null;
  replacementReason?: string | null;
  isLegacyProductionOrder?: boolean;
  isLegacyProjectWorkOrder?: boolean;
  productionWorkOrderId?: string | null;
  workOrderNumber?: string | null;
  linkedWadId?: string | null;
  linkedWadNumber?: string | null;
  linkedWadStatus?: string | null;
  linkedWadWorkOrderStatus?: string | null;
  p2WadConnectionStatus?: 'WAD_READY' | 'WAD_INCOMPLETE' | 'WAD_MISSING' | 'WAD_NOT_MATCHED' | 'NO_PROJECT_LINK';
  p2WadConnectionLabel?: string;
  activeTravelerId?: string | null;
  activeTravelerNumber?: string | null;
  hasActiveTask: boolean;
  activeTask: ActiveTask | null;
  barcodePrintedAt?: string | null;
}

interface Department {
  name: string;
  totalItems: number;
  inProgress: number;
  waiting: number;
  items: QueueItem[];
}

interface ProductionQueueData {
  departments: Department[];
  summary: {
    totalActive: number;
    totalInProgress: number;
    departmentCount: number;
  };
}

interface PartInfo {
  serializedItem: {
    id: string;
    barcode: string;
    serialNumber: string;
    partNumber: string;
    partName: string;
    customerName: string;
    currentDepartment: string;
    currentStageIndex: number;
    status: string;
  };
  routing: {
    id: string;
    departmentSequence: string[];
  };
  nextDepartment: string;
  departmentConfig: any;
  traceabilityRequirements: any[];
}

const getP2WadBadgeClass = (status?: string | null) => {
  switch (status) {
    case 'WAD_READY':
      return 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300';
    case 'WAD_INCOMPLETE':
    case 'WAD_NOT_MATCHED':
      return 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300';
    case 'WAD_MISSING':
      return 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300';
  }
};

interface P2ProductionQueueProps {
  selectedPONumbers?: string[];
}

const STANDARD_DEPARTMENT_ORDER = [
  'Pending Layup',
  'Layup',
  'Assemble/Disassembly',
  'CNC',
  'Finish',
  'Paint',
  'Final QC',
  'Shipping',
];

const isDepartmentAfterLayup = (departmentName: string) => {
  const departmentIndex = STANDARD_DEPARTMENT_ORDER.indexOf(departmentName);
  if (departmentIndex === -1) {
    return departmentName !== 'Pending Layup' && departmentName !== 'Layup';
  }
  return departmentIndex > STANDARD_DEPARTMENT_ORDER.indexOf('Layup');
};

export default function P2ProductionQueue({ selectedPONumbers = [] }: P2ProductionQueueProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [scanInput, setScanInput] = useState('');
  const [scannedItem, setScannedItem] = useState<PartInfo | null>(null);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const [showScrapDialog, setShowScrapDialog] = useState(false);
  const [showOffSystemDialog, setShowOffSystemDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [scrapReason, setScrapReason] = useState('');
  const [scrapRequiresRma, setScrapRequiresRma] = useState<boolean | null>(null);
  const [offSystemNotes, setOffSystemNotes] = useState('');
  const [offSystemLinkedTraveler, setOffSystemLinkedTraveler] = useState('');
  const [expandedDepartments, setExpandedDepartments] = useState<string[]>([]);
  const [expandedCustomerGroups, setExpandedCustomerGroups] = useState<string[]>([]);
  const [selectedLayupItems, setSelectedLayupItems] = useState<Set<string>>(new Set());
  const [sortByPO, setSortByPO] = useState<'asc' | 'desc' | null>(null);

  const {
    data: queueDataRaw,
    error: queueError,
    isError: isQueueError,
    isLoading,
    refetch: refetchQueue,
  } = useQuery<ProductionQueueData>({
    queryKey: ['/api/p2/control-center/production-queue'],
    refetchInterval: 10000,
  });

  const queueData: ProductionQueueData | undefined = queueDataRaw && selectedPONumbers.length > 0
    ? {
        departments: queueDataRaw.departments.map((dept) => ({
          ...dept,
          items: dept.items.filter((item) => selectedPONumbers.includes(item.poNumber)),
          totalItems: dept.items.filter((item) => selectedPONumbers.includes(item.poNumber)).length,
          inProgress: dept.items.filter((item) => selectedPONumbers.includes(item.poNumber) && item.hasActiveTask).length,
          waiting: dept.items.filter((item) => selectedPONumbers.includes(item.poNumber) && !item.hasActiveTask).length,
        })).filter((dept) => dept.items.length > 0),
        summary: {
          totalActive: queueDataRaw.departments
            .flatMap((d) => d.items)
            .filter((item) => selectedPONumbers.includes(item.poNumber)).length,
          totalInProgress: queueDataRaw.departments
            .flatMap((d) => d.items)
            .filter((item) => selectedPONumbers.includes(item.poNumber) && item.hasActiveTask).length,
          departmentCount: queueDataRaw.departments
            .filter((d) => d.items.some((item) => selectedPONumbers.includes(item.poNumber))).length,
        },
      }
    : queueDataRaw;

  const scanMutation = useMutation({
    mutationFn: async (barcode: string) => {
      const response = await fetch(`/api/p2-traveler/part-info/${barcode}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to find part');
      }
      return response.json();
    },
    onSuccess: (data: PartInfo) => {
      setScannedItem(data);
      setShowScanDialog(true);
      setScanInput('');
    },
    onError: (error: any) => {
      toast({
        title: 'Scan Error',
        description: error.message || 'Part not found',
        variant: 'destructive',
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status, reason, notes, linkedTravelerId, rmaRequired }: { itemId: string; status: string; reason: string; notes?: string; linkedTravelerId?: string; rmaRequired?: boolean }) => {
      return apiRequest(`/api/p2/control-center/item-status/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason, notes, linkedTravelerId, rmaRequired, performedBy: 'Supervisor' }),
      });
    },
    onSuccess: (data: any, variables) => {
      const desc = variables.status === 'COMPLETED'
        ? 'Item marked as completed (off-system production) and added to traveler management'
        : variables.status === 'SCRAPPED'
          ? variables.rmaRequired
            ? data?.replacementItem?.serialNumber
              ? `NCR opened. Replacement ${data.replacementItem.serialNumber} was added for scheduling, and the original item moved to open nonconforming.`
              : 'NCR opened. The original item moved to open nonconforming for disposition.'
            : 'NCR opened. The item moved out of production and into open nonconforming for disposition.'
          : `Item status changed to ${variables.status}`;
      toast({
        title: 'Status Updated',
        description: desc,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/production-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/scheduling-list'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/po-statuses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/serialized-items/scrapped'] });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowHoldDialog(false);
      setShowScrapDialog(false);
      setShowOffSystemDialog(false);
      setSelectedItem(null);
      setHoldReason('');
      setScrapReason('');
      setScrapRequiresRma(null);
      setOffSystemNotes('');
      setOffSystemLinkedTraveler('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive',
      });
    },
  });

  const stampPrintMutation = useMutation({
    mutationFn: async (serialNumbers: string[]) => {
      return apiRequest('/api/p2/control-center/stamp-barcode-printed', {
        method: 'PATCH',
        body: JSON.stringify({ serialNumbers }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/production-queue'] });
    },
    onError: () => {
      toast({ title: 'Warning', description: 'Labels printed but print history could not be saved. The "previously printed" indicator may not appear until the next refresh.', variant: 'destructive' });
    },
  });

  const openLegacyTravelerMutation = useMutation({
    mutationFn: async (item: QueueItem) => {
      if (item.activeTravelerId) {
        return {
          travelerId: item.activeTravelerId,
          travelerNumber: item.activeTravelerNumber,
          created: false,
        };
      }

      if (!item.productionWorkOrderId) {
        throw new Error('This project work order is missing its production work order link.');
      }

      const traveler = await apiRequest(`/api/travelers/from-part-number/${encodeURIComponent(item.partNumber)}`, {
        method: 'POST',
        body: {
          productionWorkOrderId: item.productionWorkOrderId,
          workOrderId: item.workOrderNumber || item.productionWorkOrderId,
          lotNumber: item.poNumber,
          serialNumber: item.workOrderNumber || undefined,
          quantity: 1,
          createdBy: 'P2 Control Center',
        },
      });

      if (traveler?.id && traveler?.status === 'DRAFT') {
        try {
          await apiRequest(`/api/travelers/${traveler.id}/start`, { method: 'POST' });
        } catch (startError: any) {
          if (!String(startError?.message || '').includes('not in DRAFT status')) {
            throw startError;
          }
        }
      }

      return traveler;
    },
    onSuccess: (traveler: any) => {
      const travelerId = traveler?.travelerId || traveler?.id;
      if (!travelerId) {
        toast({
          title: 'Traveler Error',
          description: 'Traveler was created, but the response did not include an ID.',
          variant: 'destructive',
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/p2/control-center/production-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setLocation(`/travelers/${travelerId}/execute`);
    },
    onError: (error: any) => {
      toast({
        title: 'Traveler Error',
        description: error.message || 'Failed to open the linked traveler',
        variant: 'destructive',
      });
    },
  });

  const handleScan = () => {
    if (scanInput.trim()) {
      scanMutation.mutate(scanInput.trim());
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleScan();
    }
  };

  const openHoldDialog = (item: QueueItem) => {
    setSelectedItem(item);
    setShowHoldDialog(true);
  };

  const openScrapDialog = (item: QueueItem) => {
    setSelectedItem(item);
    setScrapRequiresRma(null);
    setShowScrapDialog(true);
  };

  const openOffSystemDialog = (item: QueueItem) => {
    setSelectedItem(item);
    setShowOffSystemDialog(true);
  };

  const confirmOffSystem = () => {
    if (selectedItem) {
      updateStatusMutation.mutate({
        itemId: selectedItem.id,
        status: 'COMPLETED',
        reason: 'Off-system production completed',
        notes: offSystemNotes,
        linkedTravelerId: offSystemLinkedTraveler || undefined,
      } as any);
    }
  };

  const confirmHold = () => {
    if (selectedItem && holdReason.trim()) {
      updateStatusMutation.mutate({
        itemId: selectedItem.id,
        status: 'HOLD',
        reason: holdReason,
      });
    }
  };

  const confirmScrap = () => {
    if (selectedItem && scrapReason.trim() && scrapRequiresRma !== null) {
      updateStatusMutation.mutate({
        itemId: selectedItem.id,
        status: 'SCRAPPED',
        reason: scrapReason,
        rmaRequired: scrapRequiresRma,
      });
    }
  };

  const getDepartmentColor = (name: string) => {
    const colors: Record<string, string> = {
      'Pending Layup': 'bg-gray-100 dark:bg-gray-800 border-gray-300',
      'Layup': 'bg-blue-50 dark:bg-blue-950 border-blue-300',
      'Assemble/Disassembly': 'bg-purple-50 dark:bg-purple-950 border-purple-300',
      'CNC': 'bg-orange-50 dark:bg-orange-950 border-orange-300',
      'Finish': 'bg-amber-50 dark:bg-amber-950 border-amber-300',
      'Paint': 'bg-green-50 dark:bg-green-950 border-green-300',
      'Repair': 'bg-rose-50 dark:bg-rose-950 border-rose-300',
      'Final QC': 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300',
      'Shipping': 'bg-cyan-50 dark:bg-cyan-950 border-cyan-300',
    };
    return colors[name] || 'bg-slate-50 dark:bg-slate-900 border-slate-300';
  };

  const toggleLayupItem = (itemId: string) => {
    setSelectedLayupItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const toggleAllLayupItems = (dept: Department) => {
    const allIds = dept.items.map(i => i.id);
    const allSelected = allIds.every(id => selectedLayupItems.has(id));
    if (allSelected) {
      setSelectedLayupItems(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedLayupItems(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const printAveryLabels = (items: QueueItem[], title: string): boolean => {
    if (items.length === 0) {
      toast({
        title: 'No Items',
        description: 'No items selected to print labels for',
        variant: 'destructive',
      });
      return false;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Error',
        description: 'Could not open print window. Please allow popups.',
        variant: 'destructive',
      });
      return false;
    }

    const labelsPerSheet = 30;

    const generateLabelContent = (item: QueueItem, index: number) => {
      return `
        <div class="avery-label">
          <div class="label-content">
            <div class="line1">${item.serialNumber}</div>
            <div class="line2">${item.partNumber}</div>
            <div class="line3">${item.partName}</div>
            <div class="line4">${item.poNumber} - ${item.customerName}</div>
            <div class="line5">
              <canvas id="barcode-${index}" width="160" height="18"></canvas>
            </div>
          </div>
        </div>
      `;
    };

    const sheets: string[] = [];
    for (let i = 0; i < items.length; i += labelsPerSheet) {
      const sheetItems = items.slice(i, i + labelsPerSheet);
      sheets.push(`
        <div class="labels-sheet">
          ${sheetItems.map((item, j) => generateLabelContent(item, i + j)).join('')}
        </div>
      `);
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .labels-sheet {
              width: 8.5in;
              height: 11in;
              padding: 0.5in 0.1875in;
              display: grid;
              grid-template-columns: repeat(3, 2.625in);
              grid-template-rows: repeat(10, 1in);
              column-gap: 0.125in;
              row-gap: 0;
              align-content: start;
              page-break-after: always;
            }
            .labels-sheet:last-child {
              page-break-after: auto;
            }
            .avery-label {
              width: 2.625in;
              height: 1in;
              box-sizing: border-box;
              border: 1px solid #ccc;
              overflow: hidden;
              background: white;
            }
            .label-content {
              width: 100%;
              height: 100%;
              padding: 2px 4px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              text-align: center;
            }
            .line1 { font-size: 9pt; font-weight: bold; color: #000; line-height: 1.1; }
            .line2 { font-size: 7pt; font-weight: bold; color: #333; line-height: 1.1; }
            .line3 { font-size: 6pt; color: #000; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.1; }
            .line4 { font-size: 5pt; color: #666; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; line-height: 1.1; }
            .line5 { height: 20px; display: flex; justify-content: center; align-items: center; }
            .line5 canvas { max-width: 100%; height: 18px !important; }
            @media print {
              html, body { width: 8.5in; height: 11in; margin: 0; padding: 0; }
              .avery-label { border: none; }
              @page {
                size: letter;
                margin: 0;
              }
            }
          </style>
        </head>
        <body>
          ${sheets.join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();

    setTimeout(() => {
      items.forEach((item, i) => {
        const canvas = printWindow.document.getElementById(`barcode-${i}`) as HTMLCanvasElement;
        if (canvas && item.barcode) {
          try {
            const format = getBarcodeFormat(item.barcode);
            JsBarcode(canvas, item.barcode, {
              format: format,
              width: 1,
              height: 18,
              displayValue: false,
              margin: 0,
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
    return true;
  };

  const handlePrintAveryLabels = (dept: Department) => {
    const printed = printAveryLabels(dept.items, `P2 ${dept.name} Queue Labels`);
    if (printed) {
      const sns = [...new Set(dept.items.map(i => i.serialNumber).filter(Boolean))];
      if (sns.length > 0) stampPrintMutation.mutate(sns);
    }
  };

  const handlePrintSelectedLabels = (dept: Department) => {
    const selected = dept.items.filter(item => selectedLayupItems.has(item.id));
    const printed = printAveryLabels(selected, `P2 Layup Selected Labels (${selected.length})`);
    if (printed) {
      const sns = [...new Set(selected.map(i => i.serialNumber).filter(Boolean))];
      if (sns.length > 0) stampPrintMutation.mutate(sns);
      setSelectedLayupItems(new Set());
    }
  };

  const handlePrintCustomerLabels = (items: QueueItem[], deptName: string, customerName: string) => {
    const printed = printAveryLabels(items, `P2 ${deptName} — ${customerName} Labels`);
    if (printed) {
      const sns = [...new Set(items.map(i => i.serialNumber).filter(Boolean))];
      if (sns.length > 0) stampPrintMutation.mutate(sns);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading production queue...</p>
        </CardContent>
      </Card>
    );
  }

  if (isQueueError) {
    const message = queueError instanceof Error
      ? queueError.message
      : 'Failed to fetch production queue';

    return (
      <Card className="border-destructive/40">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <p className="font-medium text-destructive">P2 production queue could not be loaded</p>
          <p className="text-sm text-muted-foreground mt-2">{message}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => refetchQueue()}
            data-testid="button-retry-p2-production-queue"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Barcode Scanner Input */}
      <Card className="border-2 border-dashed border-primary/30">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Scan className="h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="Scan barcode or enter part ID..."
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="text-lg"
                  data-testid="input-barcode-scan"
                />
                <Button 
                  onClick={handleScan} 
                  disabled={!scanInput.trim() || scanMutation.isPending}
                  data-testid="button-scan"
                >
                  {scanMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Look Up
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Factory className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{queueData?.summary.totalActive || 0}</div>
                <div className="text-sm text-muted-foreground">Total Active Items</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Play className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{queueData?.summary.totalInProgress || 0}</div>
                <div className="text-sm text-muted-foreground">Being Worked On</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">{queueData?.summary.departmentCount || 0}</div>
                <div className="text-sm text-muted-foreground">Active Departments</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Department Queues */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Department Queues
          </CardTitle>
          <CardDescription>
            View items at each production stage. Click a department to see items.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion 
            type="multiple" 
            value={expandedDepartments}
            onValueChange={setExpandedDepartments}
            className="space-y-2"
          >
            {queueData?.departments.map((dept) => {
              const isReprintDepartment = isDepartmentAfterLayup(dept.name);

              return (
              <AccordionItem 
                key={dept.name} 
                value={dept.name}
                className={`border rounded-lg ${getDepartmentColor(dept.name)}`}
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{dept.name}</span>
                      <Badge variant="secondary" className="ml-2">
                        {dept.totalItems} items
                      </Badge>
                      {isReprintDepartment && (
                        <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">
                          <Printer className="h-3 w-3" />
                          Reprint Barcode
                        </Badge>
                      )}
                      {dept.inProgress > 0 && (
                        <Badge variant="default" className="bg-green-600">
                          <Play className="h-3 w-3 mr-1" />
                          {dept.inProgress} in progress
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {dept.waiting > 0 && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {dept.waiting} waiting
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4" stickyChildren={dept.name === 'Layup' && dept.items.length > 0}>
                  {dept.name === 'Layup' && dept.items.length > 0 && (
                    <div className="sticky top-[44px] z-10 mb-4 flex items-center justify-between gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="select-all-layup"
                            checked={dept.items.length > 0 && dept.items.every(i => selectedLayupItems.has(i.id))}
                            onCheckedChange={() => toggleAllLayupItems(dept)}
                          />
                          <label htmlFor="select-all-layup" className="text-sm font-medium cursor-pointer">
                            Select All
                          </label>
                        </div>
                        {selectedLayupItems.size > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {dept.items.filter(i => selectedLayupItems.has(i.id)).length} selected
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedLayupItems.size > 0 && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePrintSelectedLabels(dept)}
                            data-testid="button-print-selected-labels"
                          >
                            <Printer className="mr-2 h-4 w-4" />
                            Print Selected ({dept.items.filter(i => selectedLayupItems.has(i.id)).length})
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePrintAveryLabels(dept)}
                          data-testid="button-print-layup-labels"
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Print All ({dept.items.length})
                        </Button>
                      </div>
                    </div>
                  )}
                  {dept.items.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No items in this department</p>
                    </div>
                  ) : (() => {
                    // Group items by customer
                    const customerMap = new Map<string, QueueItem[]>();
                    const sortedItems = sortByPO
                      ? [...dept.items].sort((a, b) => {
                          const apo = a.poNumber || '';
                          const bpo = b.poNumber || '';
                          if (!apo && !bpo) return 0;
                          if (!apo) return 1;
                          if (!bpo) return -1;
                          const cmp = apo.localeCompare(bpo);
                          return sortByPO === 'asc' ? cmp : -cmp;
                        })
                      : dept.items;
                    sortedItems.forEach(item => {
                      const key = item.customerName || 'Unknown Customer';
                      if (!customerMap.has(key)) customerMap.set(key, []);
                      customerMap.get(key)!.push(item);
                    });
                    const customerEntries = Array.from(customerMap.entries());
                    return (
                      <Accordion
                        type="multiple"
                        value={expandedCustomerGroups}
                        onValueChange={setExpandedCustomerGroups}
                        className="space-y-2"
                      >
                        {customerEntries.map(([customerName, customerItems]) => {
                          const groupKey = `${dept.name}||${customerName}`;
                          const printedCount = customerItems.filter(i => i.barcodePrintedAt).length;
                          const layupSelectedInGroup = dept.name === 'Layup' ? customerItems.filter(i => selectedLayupItems.has(i.id)).length : 0;
                          const allGroupSelected = dept.name === 'Layup' && customerItems.length > 0 && customerItems.every(i => selectedLayupItems.has(i.id));
                          return (
                            <AccordionItem
                              key={groupKey}
                              value={groupKey}
                              className="border rounded-md bg-white/60 dark:bg-gray-900/40"
                            >
                              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                                <div className="flex items-center justify-between w-full pr-2">
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    <span className="font-medium text-sm">{customerName}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {customerItems.length} item{customerItems.length !== 1 ? 's' : ''}
                                    </Badge>
                                    {printedCount > 0 && (
                                      <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                                        <Printer className="h-3 w-3" />
                                        <Check className="h-2.5 w-2.5 text-green-600" />
                                        {printedCount}/{customerItems.length}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mr-2">
                                    {dept.name === 'Layup' && (
                                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                        <Checkbox
                                          id={`select-all-${groupKey}`}
                                          checked={allGroupSelected}
                                          onCheckedChange={() => {
                                            const ids = customerItems.map(i => i.id);
                                            if (allGroupSelected) {
                                              setSelectedLayupItems(prev => {
                                                const next = new Set(prev);
                                                ids.forEach(id => next.delete(id));
                                                return next;
                                              });
                                            } else {
                                              setSelectedLayupItems(prev => {
                                                const next = new Set(prev);
                                                ids.forEach(id => next.add(id));
                                                return next;
                                              });
                                            }
                                          }}
                                        />
                                        <label
                                          htmlFor={`select-all-${groupKey}`}
                                          className="text-xs text-muted-foreground cursor-pointer"
                                          onClick={e => e.stopPropagation()}
                                        >
                                          {layupSelectedInGroup > 0 ? `${layupSelectedInGroup} selected` : 'Select all'}
                                        </label>
                                      </div>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={e => {
                                        e.stopPropagation();
                                        handlePrintCustomerLabels(customerItems, dept.name, customerName);
                                      }}
                                    >
                                      <Printer className="h-3 w-3 mr-1" />
                                      {isReprintDepartment ? 'Reprint' : 'Print'}
                                    </Button>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-3 pb-3">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      {dept.name === 'Layup' && <TableHead className="w-10"></TableHead>}
                                      <TableHead>Barcode</TableHead>
                                      <TableHead>Part Number</TableHead>
                                      <TableHead
                                        className="cursor-pointer select-none hover:bg-muted/50"
                                        onClick={() => setSortByPO(prev => prev === 'asc' ? 'desc' : 'asc')}
                                      >
                                        <span className="inline-flex items-center gap-1">
                                          PO / Customer
                                          {sortByPO === 'asc' && <ArrowUp className="h-3 w-3" />}
                                          {sortByPO === 'desc' && <ArrowDown className="h-3 w-3" />}
                                        </span>
                                      </TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {customerItems.map((item) => (
                                      <TableRow key={item.id} className={dept.name === 'Layup' && selectedLayupItems.has(item.id) ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''}>
                                        {dept.name === 'Layup' && (
                                          <TableCell>
                                            <Checkbox
                                              checked={selectedLayupItems.has(item.id)}
                                              onCheckedChange={() => toggleLayupItem(item.id)}
                                            />
                                          </TableCell>
                                        )}
                                        <TableCell className="font-mono font-semibold">
                                          <div className="flex items-center gap-1.5">
                                            {item.barcode || item.serialNumber}
                                            {item.isReplacement && (
                                              <Badge
                                                variant="outline"
                                                className="border-blue-300 bg-blue-50 text-blue-700 text-[10px] font-sans"
                                                title={item.replacementReason || undefined}
                                              >
                                                Replacement
                                              </Badge>
                                            )}
                                            {item.isLegacyProductionOrder && (
                                              <Badge
                                                variant="outline"
                                                className="border-slate-300 bg-slate-50 text-slate-700 text-[10px] font-sans"
                                                title="Legacy production order without serialized traveler records"
                                              >
                                                Legacy
                                              </Badge>
                                            )}
                                            {item.isLegacyProjectWorkOrder && (
                                              <Badge
                                                variant="outline"
                                                className="border-blue-300 bg-blue-50 text-blue-700 text-[10px] font-sans"
                                                title="Legacy project work order. Continue production from the linked PM Control Center."
                                              >
                                                Project WO
                                              </Badge>
                                            )}
                                            {item.barcodePrintedAt && (
                                              <span
                                                className="inline-flex items-center gap-0.5 text-muted-foreground/70"
                                                title={`Label printed ${new Date(item.barcodePrintedAt).toLocaleString()}`}
                                              >
                                                <Printer className="h-3 w-3" />
                                                <Check className="h-2.5 w-2.5 text-green-500" />
                                              </span>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <div>{item.partNumber}</div>
                                          <div className="text-xs text-muted-foreground">{item.partName}</div>
                                          {item.isReplacement && (
                                            <div className="text-xs text-blue-700 dark:text-blue-300">
                                              Replaces {item.replacementForSerialNumber || item.replacementForSerializedItemId || 'NCR item'}
                                            </div>
                                          )}
                                        </TableCell>
                                        <TableCell>
                                          <div>{item.poNumber}</div>
                                          <div className="text-xs text-muted-foreground">{item.customerName}</div>
                                          {item.projectId ? (
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                              <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                                title={item.projectName || undefined}
                                                onClick={() => setLocation(`/projects/${item.projectId}`)}
                                              >
                                                <FolderOpen className="h-3 w-3" />
                                                {item.projectCode || 'Linked Project'}
                                              </button>
                                              <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                                onClick={() => setLocation(`/pm-control-center?project=${item.projectId}`)}
                                              >
                                                <Factory className="h-3 w-3" />
                                                PM Control
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="mt-1 text-xs text-muted-foreground">
                                              Assign project from the POs tab
                                            </div>
                                          )}
                                          <div className="mt-1 flex flex-wrap items-center gap-2">
                                            {item.linkedWadId && item.linkedWadNumber && (
                                              <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                                onClick={() => setLocation(`/production-work-orders/${item.linkedWadId}`)}
                                                title={item.linkedWadStatus || item.linkedWadWorkOrderStatus || undefined}
                                              >
                                                <FileText className="h-3 w-3" />
                                                {item.linkedWadNumber}
                                              </button>
                                            )}
                                            <Badge
                                              variant="outline"
                                              className={`gap-1 text-[10px] ${getP2WadBadgeClass(item.p2WadConnectionStatus)}`}
                                              title={item.linkedWadStatus || item.linkedWadWorkOrderStatus || item.p2WadConnectionLabel || undefined}
                                            >
                                              <FileText className="h-3 w-3" />
                                              {item.p2WadConnectionLabel || (item.projectId ? 'WAD missing' : 'No project link')}
                                            </Badge>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {item.status === 'COMPLETED' ? (
                                            <Badge className="bg-green-600">
                                              <CheckCircle className="h-3 w-3 mr-1" />
                                              Completed
                                            </Badge>
                                          ) : item.hasActiveTask && item.activeTask ? (
                                            <div className="flex items-center gap-2">
                                              <Badge className="bg-green-600">
                                                <Play className="h-3 w-3 mr-1" />
                                                In Progress
                                              </Badge>
                                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                {item.activeTask.employeeName}
                                              </span>
                                            </div>
                                          ) : item.isLegacyProductionOrder || item.isLegacyProjectWorkOrder ? (
                                            <Badge variant="outline">
                                              <Clock className="h-3 w-3 mr-1" />
                                              {item.isLegacyProjectWorkOrder ? 'Project Work Order' : 'Legacy Order'}
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary">
                                              <Clock className="h-3 w-3 mr-1" />
                                              Waiting
                                            </Badge>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            {!item.isLegacyProductionOrder && !item.isLegacyProjectWorkOrder && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                  setScanInput(item.barcode);
                                                  scanMutation.mutate(item.barcode);
                                                }}
                                                data-testid={`button-view-${item.id}`}
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {item.isLegacyProjectWorkOrder && item.projectId && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setLocation(`/pm-control-center?project=${item.projectId}`)}
                                                title="Continue in PM Control Center"
                                                data-testid={`button-open-pm-${item.id}`}
                                              >
                                                <Factory className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {item.isLegacyProjectWorkOrder && item.status !== 'COMPLETED' && (
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openLegacyTravelerMutation.mutate(item)}
                                                disabled={openLegacyTravelerMutation.isPending}
                                                title={item.activeTravelerId ? 'Open active traveler' : 'Create linked traveler'}
                                                data-testid={`button-open-legacy-traveler-${item.id}`}
                                              >
                                                {openLegacyTravelerMutation.isPending ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Play className="h-4 w-4" />
                                                )}
                                              </Button>
                                            )}
                                            {item.status !== 'COMPLETED' && !item.isLegacyProductionOrder && !item.isLegacyProjectWorkOrder && (
                                              <>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => openHoldDialog(item)}
                                                  className="text-amber-600 hover:text-amber-700"
                                                  data-testid={`button-hold-${item.id}`}
                                                >
                                                  <Pause className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => openOffSystemDialog(item)}
                                                  className="text-indigo-600 hover:text-indigo-700"
                                                  title="Off-System Production Complete"
                                                  data-testid={`button-off-system-${item.id}`}
                                                >
                                                  <ExternalLink className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  onClick={() => openScrapDialog(item)}
                                                  className="text-red-600 hover:text-red-700"
                                                  data-testid={`button-scrap-${item.id}`}
                                                >
                                                  <XCircle className="h-4 w-4" />
                                                </Button>
                                              </>
                                            )}
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    );
                  })()}
                </AccordionContent>
              </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Scan Result Dialog */}
      <Dialog open={showScanDialog} onOpenChange={setShowScanDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scan className="h-5 w-5" />
              Part Information
            </DialogTitle>
            <DialogDescription>
              Scanned part details and routing information
            </DialogDescription>
          </DialogHeader>
          
          {scannedItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Barcode</label>
                  <div className="font-mono text-lg">{scannedItem.serializedItem.barcode}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Serial Number</label>
                  <div className="font-mono text-lg">{scannedItem.serializedItem.serialNumber}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Part Number</label>
                  <div className="font-semibold">{scannedItem.serializedItem.partNumber}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Part Name</label>
                  <div>{scannedItem.serializedItem.partName}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Customer</label>
                  <div>{scannedItem.serializedItem.customerName}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <Badge variant={scannedItem.serializedItem.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {scannedItem.serializedItem.status}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium text-muted-foreground">Routing Progress</label>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {scannedItem.routing.departmentSequence.map((dept, idx) => (
                    <div key={dept} className="flex items-center">
                      <Badge 
                        variant={idx < scannedItem.serializedItem.currentStageIndex 
                          ? 'default' 
                          : idx === scannedItem.serializedItem.currentStageIndex
                            ? 'secondary'
                            : 'outline'}
                        className={idx < scannedItem.serializedItem.currentStageIndex 
                          ? 'bg-green-600' 
                          : idx === scannedItem.serializedItem.currentStageIndex
                            ? 'bg-blue-600 text-white'
                            : ''}
                      >
                        {idx < scannedItem.serializedItem.currentStageIndex && (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        )}
                        {dept}
                      </Badge>
                      {idx < scannedItem.routing.departmentSequence.length - 1 && (
                        <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                <div className="flex items-center gap-2">
                  <Factory className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="font-medium">Current Department</div>
                    <div className="text-lg font-semibold">{scannedItem.serializedItem.currentDepartment}</div>
                  </div>
                </div>
                {scannedItem.nextDepartment && (
                  <div className="mt-2 text-sm text-muted-foreground">
                    Next: {scannedItem.nextDepartment}
                  </div>
                )}
              </div>

              {scannedItem.traceabilityRequirements.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-sm font-medium text-muted-foreground">Traceability Requirements</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scannedItem.traceabilityRequirements.map((req: any, idx: number) => (
                      <Badge key={idx} variant="outline">
                        {req.label || req}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button 
              variant="default"
              onClick={() => {
                if (scannedItem) {
                  setLocation(`/p2-traveler/${scannedItem.serializedItem.id}`);
                }
              }}
              data-testid="button-open-traveler"
            >
              <Eye className="h-4 w-4 mr-2" />
              Open Full Traveler
            </Button>
            <Button variant="outline" onClick={() => setShowScanDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold Dialog */}
      <Dialog open={showHoldDialog} onOpenChange={setShowHoldDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <Pause className="h-5 w-5" />
              Put Item on Hold
            </DialogTitle>
            <DialogDescription>
              This will pause production on this item until it is released.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
                <div className="font-medium">{selectedItem.barcode}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedItem.partNumber} - {selectedItem.partName}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Reason for Hold *</label>
                <Textarea
                  placeholder="Enter reason for holding this item..."
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  className="mt-1"
                  data-testid="input-hold-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHoldDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmHold}
              disabled={!holdReason.trim() || updateStatusMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
              data-testid="button-confirm-hold"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              Put on Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scrap Dialog */}
      <Dialog open={showScrapDialog} onOpenChange={setShowScrapDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Mark Item NCR / Scrap
            </DialogTitle>
            <DialogDescription>
              This removes the original item from active production and sends it to open nonconforming for disposition.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="bg-red-50 dark:bg-red-950 p-3 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">P2 NCR disposition required</span>
                </div>
                <div className="mt-2">
                  <div className="font-medium">{selectedItem.barcode}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedItem.partNumber} - {selectedItem.partName}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Is an RMA required? *</Label>
                <RadioGroup
                  value={scrapRequiresRma === null ? '' : scrapRequiresRma ? 'yes' : 'no'}
                  onValueChange={(value) => setScrapRequiresRma(value === 'yes')}
                  className="grid gap-2"
                >
                  <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value="yes" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">Yes, create RMA replacement</span>
                      <span className="block text-xs text-muted-foreground">
                        Add a schedulable replacement and keep the original item in open nonconforming.
                      </span>
                    </span>
                  </Label>
                  <Label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                    <RadioGroupItem value="no" className="mt-0.5" />
                    <span>
                      <span className="block font-medium">No, disposition only</span>
                      <span className="block text-xs text-muted-foreground">
                        Move this item out of production so Quality can file the disposition.
                      </span>
                    </span>
                  </Label>
                </RadioGroup>
              </div>
              
              <div>
                <label className="text-sm font-medium">NCR / Scrap Reason *</label>
                <Textarea
                  placeholder="Enter the NCR reason and replacement context..."
                  value={scrapReason}
                  onChange={(e) => setScrapReason(e.target.value)}
                  className="mt-1"
                  data-testid="input-scrap-reason"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScrapDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmScrap}
              disabled={!scrapReason.trim() || scrapRequiresRma === null || updateStatusMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-scrap"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              {scrapRequiresRma ? 'Open NCR & Create Replacement' : 'Open NCR for Disposition'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Off-System Production Dialog */}
      <Dialog open={showOffSystemDialog} onOpenChange={setShowOffSystemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <ExternalLink className="h-5 w-5" />
              Off-System Production Complete
            </DialogTitle>
            <DialogDescription>
              Mark this item as completed outside the digital traveler system. The item will be removed from production and a completed traveler record will be created.
            </DialogDescription>
          </DialogHeader>
          
          {selectedItem && (
            <div className="space-y-4">
              <div className="bg-indigo-50 dark:bg-indigo-950 p-3 rounded-lg border border-indigo-200">
                <div className="font-medium">{selectedItem.barcode}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedItem.partNumber} - {selectedItem.partName}
                </div>
                <div className="text-sm text-muted-foreground">
                  Department: {selectedItem.currentDepartment} · PO: {selectedItem.poNumber}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  placeholder="Add any notes about the off-system production (optional)..."
                  value={offSystemNotes}
                  onChange={(e) => setOffSystemNotes(e.target.value)}
                  className="mt-1"
                  data-testid="input-off-system-notes"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Link to Existing Traveler</label>
                <Input
                  placeholder="Enter traveler ID to link (optional)..."
                  value={offSystemLinkedTraveler}
                  onChange={(e) => setOffSystemLinkedTraveler(e.target.value)}
                  className="mt-1"
                  data-testid="input-off-system-traveler"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If a traveler was already completed for this item, enter its ID to link them. Otherwise a new completed traveler will be created automatically.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOffSystemDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmOffSystem}
              disabled={updateStatusMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="button-confirm-off-system"
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Complete Off-System
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

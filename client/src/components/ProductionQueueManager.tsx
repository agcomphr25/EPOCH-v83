import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAdminUser } from '@/config/userPermissions';
import { apiRequest } from '@/lib/queryClient';
import JsBarcode from 'jsbarcode';
import { getBarcodeFormat } from '@/lib/barcodeFormat';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import {
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Clock,
  AlertTriangle,
  CheckCircle,
  Calendar,
  User,
  Package,
  ArrowRight,
  Zap,
  ShoppingCart,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Settings,
  RotateCcw,
  BarChart3,
} from 'lucide-react';
import OrderActionButtons from '@/components/OrderActionButtons';
import type { P1POQueueCustomer } from '@shared/schema';
import { LayupSchedulePreview } from './LayupSchedulePreview';
import { ScheduleHistoryDialog } from './ScheduleHistoryDialog';
import { MoldSettings } from './MoldSettings';
import { deriveOrderLabels } from '@/utils/deriveOrderLabels';

interface ProductionQueueOrder {
  orderId: string;
  fbOrderNumber?: string;
  modelId: string;
  stockModelId: string;
  dueDate: string;
  orderDate: string;
  currentDepartment: string;
  status: string;
  customerId: string;
  customerName?: string;
  features?: any;
  isFlattop?: boolean;
  priorityScore: number;
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  isManualUrgency?: boolean;
  queuePosition: number;
  daysToDue: number;
  isOverdue: boolean;
  urgencyLevel: 'critical' | 'high' | 'medium' | 'normal';
}

interface ProductionQueueReconciliation {
  department: string;
  total: number;
  ready: number;
  needsAttention: number;
  otherNotReady: number;
}

type QueueView = 'orders' | 'customer' | 'stock-model' | 'due-date';

interface QueueSummaryRow {
  key: string;
  orderCount: number;
  overdueCount: number;
  earliestDueDate: string | null;
}

interface StockModelSummaryRow extends QueueSummaryRow {
  customerCount: number;
  orders: ProductionQueueOrder[];
}

interface DueDateSummaryRow {
  dueDate: string;
  orderCount: number;
  stockModels: Array<{ stockModel: string; orderCount: number }>;
}

const parseQueueDueDate = (dateValue: string | null | undefined) => {
  if (!dateValue) return null;

  const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDueDate = (dateValue: string | null) => {
  const date = parseQueueDueDate(dateValue);
  if (!date) return 'No due date';
  return date.toLocaleDateString();
};

const getDueDateKey = (dateValue: string | null | undefined) => {
  const date = parseQueueDueDate(dateValue);
  if (!date) return 'No due date';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isEarlierDueDate = (candidate: string | null, current: string | null) => {
  if (!candidate) return false;
  if (!current) return true;

  const candidateTime = parseQueueDueDate(candidate)?.getTime();
  const currentTime = parseQueueDueDate(current)?.getTime();

  if (candidateTime === undefined) return false;
  if (currentTime === undefined) return true;

  return candidateTime < currentTime;
};

// POItem interface removed - P1 POs now managed via OEM Priority Settings only

interface Kickback {
  id: number;
  orderId: string;
  department: string;
  issueDescription: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
  resolutionNotes?: string;
}

// Removed: WeekSchedule and ProductionSchedule interfaces
// P1 PO week selection functionality now managed via OEM Priority Settings


export default function ProductionQueueManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });
  const isAdmin = isAdminUser(currentUser);

  // Helper function to check if order has rush fees
  const hasRushFee = (order: ProductionQueueOrder, feeType: 'rush_fee1' | 'rush_fee2') => {
    if (!order.features?.other_options) return false;
    const otherOptions = Array.isArray(order.features.other_options) 
      ? order.features.other_options 
      : [];
    return otherOptions.includes(feeType);
  };

  // Removed: P1 PO week selection dialog state - now managed via OEM Priority Settings

  // State for P1 Production Queue order selection
  const [selectedQueueOrders, setSelectedQueueOrders] = useState<Set<string>>(
    new Set()
  );

  // State for P1 Purchase Orders filter
  const [selectedPOFilter, setSelectedPOFilter] = useState<string>('all');

  // State for retry stuck selections
  const [retryingPO, setRetryingPO] = useState<string | null>(null);

  // State for P1 Purchase Order item selection (Map of PO number to Map of item ID to selected quantity)
  const [selectedPOItems, setSelectedPOItems] = useState<Map<string, Map<number, number>>>(
    new Map()
  );
  const [isProgressingPOItems, setIsProgressingPOItems] = useState(false);

  // State for "Select Next N" for regular production queue
  const [selectNextQueueCount, setSelectNextQueueCount] = useState<string>('');

  // State for regular production queue search
  const [queueSearchQuery, setQueueSearchQuery] = useState<string>('');

  // Read-only analysis views for the regular production queue
  const [queueView, setQueueView] = useState<QueueView>('orders');
  const [stockModelAnalysisQuery, setStockModelAnalysisQuery] = useState<string>('');

  // State for layup schedule preview modal
  const [schedulePreviewOpen, setSchedulePreviewOpen] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<{
    scheduledItems: any[];
    overflowItems: any[];
    weekStart: string;
    totalItems: number;
  } | null>(null);

  // State for day selection
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4]); // Default: Mon-Thu
  const [daySelectionDialogOpen, setDaySelectionDialogOpen] = useState(false);
  const [selectedWeekOffset, setSelectedWeekOffset] = useState<number>(0); // 0 = next week, 1 = week after, etc.
  
  // State for schedule history dialog
  const [scheduleHistoryOpen, setScheduleHistoryOpen] = useState(false);
  
  // State for mold settings dialog
  const [moldSettingsOpen, setMoldSettingsOpen] = useState(false);

  // Fetch prioritized production queue
  const {
    data: productionQueue = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ProductionQueueOrder[]>({
    queryKey: ['/api/production-queue/prioritized'],
    queryFn: async () => {
      console.log('🔍 Fetching production queue...');
      const result = await apiRequest('/api/production-queue/prioritized');
      console.log('🔍 Production queue result:', result?.length || 0, 'orders');
      return result;
    },
  });

  // Log errors for debugging
  if (isError) {
    console.error('❌ Production queue fetch error:', error);
  }

  // Fetch open P1 Purchase Orders
  const {
    data: p1PurchaseOrders = [],
    isLoading: isLoadingPOs,
    refetch: refetchPOs,
  } = useQuery<P1POQueueCustomer[]>({
    queryKey: ['/api/p1-po-queue/purchase-orders/open'],
    queryFn: () => apiRequest('/api/p1-po-queue/purchase-orders/open'),
  });

  // Fetch stock models for display name resolution in PO queue
  const { data: stockModels = [] } = useQuery<{ id: string; displayName: string }[]>({
    queryKey: ['/api/stock-models'],
  });

  // Fetch stuck counts per PO to conditionally show "Retry Failed Items" button
  const { data: stuckCounts = {}, refetch: refetchStuckCounts } = useQuery<Record<string, number>>({
    queryKey: ['/api/p1-po-queue/stuck-counts'],
    queryFn: () => apiRequest('/api/p1-po-queue/stuck-counts'),
    refetchOnWindowFocus: false,
  });

  const getStockModelDisplayName = (modelId: string | null): string => {
    if (!modelId) return '-';
    const model = stockModels.find((m) => m.id === modelId);
    return model ? model.displayName : modelId;
  };

  // P1 Purchase Order items query removed - now managed via OEM Priority Settings

  // Fetch orders that need attention (missing critical information for layup scheduling)
  const {
    data: attentionOrders = [],
    isLoading: isLoadingAttention,
    refetch: refetchAttention,
  } = useQuery<any[]>({
    queryKey: ['/api/production-queue/attention'],
    queryFn: () => apiRequest('/api/production-queue/attention'),
  });

  const {
    data: queueReconciliation,
    refetch: refetchReconciliation,
  } = useQuery<ProductionQueueReconciliation>({
    queryKey: ['/api/production-queue/reconciliation'],
    queryFn: () => apiRequest('/api/production-queue/reconciliation'),
  });

  // Auto-populate production queue mutation
  const autoPopulateMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/production-queue/auto-populate', { method: 'POST' }),
    onSuccess: (result: any) => {
      toast({
        title: 'Production Queue Updated',
        description: `Successfully auto-populated queue with ${result.ordersProcessed} orders`,
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/reconciliation'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Auto-Populate Failed',
        description:
          error.message || 'Failed to auto-populate production queue',
        variant: 'destructive',
      });
    },
  });

  // Update priorities mutation
  const updatePrioritiesMutation = useMutation({
    mutationFn: (orders: ProductionQueueOrder[]) =>
      apiRequest('/api/production-queue/update-priorities', {
        method: 'POST',
        body: JSON.stringify({ orders }),
      }),
    onSuccess: () => {
      toast({
        title: 'Priorities Updated',
        description: 'Successfully updated order priorities',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Priority Update Failed',
        description: error.message || 'Failed to update priorities',
        variant: 'destructive',
      });
    },
  });

  // Removed: Fetch production schedule for PO mutation
  // Removed: Move selected weeks to layup scheduler mutation
  // Removed: Move selected PO items to layup scheduler mutation
  // All P1 PO functionality now managed via OEM Priority Settings

  // Progress orders to Barcode mutation
  const progressToBarcodeMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      const progressPromises = orderIds.map((orderId) =>
        apiRequest(`/api/orders/${orderId}/progress`, {
          method: 'POST',
          body: { toDepartment: 'Barcode' },
        })
      );
      return Promise.all(progressPromises);
    },
    onSuccess: (_result, orderIds) => {
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/reconciliation'],
      });
      toast({
        title: 'Success',
        description: `Successfully progressed ${orderIds.length} order(s) to Barcode`,
      });
      setSelectedQueueOrders(new Set());
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to progress orders',
        variant: 'destructive',
      });
    },
  });

  // Generate layup schedule mutation
  const generateScheduleMutation = useMutation({
    mutationFn: async () => {
      // Prepare selected P1 PO items with their selected quantities
      const selectedPOItemsArray: any[] = [];
      safePurchaseOrders.forEach((customer) => {
        customer.purchaseOrders.forEach((po) => {
          const selectedItems = selectedPOItems.get(po.poNumber);
          if (selectedItems) {
            po.items.forEach((item) => {
              const selectedQuantity = selectedItems.get(item.id);
              if (selectedQuantity && selectedQuantity > 0) {
                selectedPOItemsArray.push({
                  poNumber: po.poNumber,
                  itemId: item.id,
                  stockModel: item.stockModel || '',
                  quantity: selectedQuantity, // Use selected quantity instead of remaining
                });
              }
            });
          }
        });
      });

      // Calculate week start date based on selected week offset
      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
      nextMonday.setDate(nextMonday.getDate() + (selectedWeekOffset * 7));
      
      return apiRequest('/api/layup-schedule/generate', {
        method: 'POST',
        body: {
          selectedOrderIds: Array.from(selectedQueueOrders),
          selectedPOItems: selectedPOItemsArray,
          workDays: selectedDays,
          weekStart: nextMonday.toISOString(),
        },
      });
    },
    onSuccess: (result: any) => {
      setGeneratedSchedule({
        scheduledItems: result.scheduledItems || [],
        overflowItems: result.overflowItems || [],
        weekStart: result.weekStart || '',
        totalItems: result.totalItems || 0,
      });
      setSchedulePreviewOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Schedule Generation Failed',
        description: error.message || 'Failed to generate layup schedule',
        variant: 'destructive',
      });
    },
  });

  // Approve schedule mutation
  const approveScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!generatedSchedule) return;

      const entries = generatedSchedule.scheduledItems.map((item) => ({
        orderId: item.orderId,
        scheduledDate: item.scheduledDate,
        moldId: item.moldId,
        employeeAssignments: [],
      }));

      return apiRequest('/api/layup-schedule/save', {
        method: 'POST',
        body: {
          entries,
          workDays: [1, 2, 3, 4, 5],
          weekStart: generatedSchedule.weekStart,
        },
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: 'Schedule Approved',
        description: `Successfully scheduled ${generatedSchedule?.scheduledItems.length} items and progressed ${result.ordersProgressed || 0} orders to Layup/Plugging`,
      });
      
      // Clear selections
      setSelectedQueueOrders(new Set());
      setSelectedPOItems(new Map());
      setSchedulePreviewOpen(false);
      setGeneratedSchedule(null);
      
      // Refresh queues
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p1-po-queue/purchase-orders/open'] });
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule/weeks'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Schedule Approval Failed',
        description: error.message || 'Failed to save layup schedule',
        variant: 'destructive',
      });
    },
  });

  // Handlers for P1 Production Queue selection
  const handleToggleOrderSelection = (orderId: string) => {
    setSelectedQueueOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleSelectAllQueueOrders = () => {
    if (selectedQueueOrders.size === filteredProductionQueue.length) {
      setSelectedQueueOrders(new Set());
    } else {
      setSelectedQueueOrders(new Set(filteredProductionQueue.map((o) => o.orderId)));
    }
  };

  // Handler for "Select Next N" in regular production queue
  const handleSelectNextQueueOrders = () => {
    const count = parseInt(selectNextQueueCount);
    if (isNaN(count) || count <= 0) {
      toast({
        title: 'Invalid Input',
        description: 'Please enter a valid number greater than 0',
        variant: 'destructive',
      });
      return;
    }

    const ordersToSelect = filteredProductionQueue
      .slice(0, Math.min(count, filteredProductionQueue.length))
      .map((order) => order.orderId);

    setSelectedQueueOrders(new Set(ordersToSelect));
    
    toast({
      title: 'Orders Selected',
      description: `Selected ${ordersToSelect.length} order${ordersToSelect.length !== 1 ? 's' : ''} from the ${queueSearchQuery ? 'filtered ' : ''}queue`,
    });
  };

  const handleProgressSelectedToBarcode = () => {
    if (selectedQueueOrders.size === 0) return;
    progressToBarcodeMutation.mutate(Array.from(selectedQueueOrders));
  };

  const generateOrderBarcodeDataUrl = (barcodeValue: string): string => {
    if (!barcodeValue) return '';
    const canvas = document.createElement('canvas');
    const format = getBarcodeFormat(barcodeValue);
    try {
      JsBarcode(canvas, barcodeValue, {
        format: format,
        width: format === 'CODE128' ? 1.5 : 2,
        height: 30,
        displayValue: false,
        background: '#ffffff',
        lineColor: '#000000',
        margin: 3,
      });
      return canvas.toDataURL('image/png', 1.0);
    } catch (e) {
      console.error('Barcode generation error:', e, barcodeValue);
      return '';
    }
  };

  // Function to print barcode labels for multiple orders
  const printBarcodeLabelsForOrders = (orders: any[]) => {
    if (!orders || orders.length === 0) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: 'Pop-up Blocked',
        description: 'Please allow pop-ups to print labels',
        variant: 'destructive',
      });
      return;
    }

    // Pre-generate all barcode images before writing to the print window
    const labelsHTML = orders.map((order) => {
      const barcode = order.orderId || 'UNKNOWN';
      const customerName = order.customerName || 'No Customer';
      const stockModel = order.stockModelId || order.modelId || '';
      const dueDate = order.dueDate || '';
      const barcodeDataUrl = generateOrderBarcodeDataUrl(barcode);

      return `
        <div class="avery-label">
          <div class="label-content">
            <div class="line1">${barcode}</div>
            <div class="line2">${customerName}</div>
            ${stockModel ? `<div class="line3">${stockModel}</div>` : ''}
            ${dueDate ? `<div class="line4">Due: ${new Date(dueDate).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })}</div>` : ''}
            <div class="line5">
              ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" class="barcode-img" alt="barcode" />` : `<span style="font-size:5pt;color:#999">Barcode Error</span>`}
            </div>
          </div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Barcode Labels</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
            }

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
              overflow: hidden;
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

            .line1 {
              font-size: 8pt;
              font-weight: bold;
              color: #000;
              text-overflow: ellipsis;
              overflow: hidden;
              white-space: nowrap;
            }

            .line2 {
              font-size: 6pt;
              color: #000;
              text-overflow: ellipsis;
              overflow: hidden;
              white-space: nowrap;
            }

            .line3 {
              font-size: 6pt;
              color: #000;
              text-overflow: ellipsis;
              overflow: hidden;
              white-space: nowrap;
            }

            .line4 {
              font-size: 5pt;
              color: #000;
            }

            .line5 {
              display: flex;
              justify-content: center;
              align-items: center;
              flex-shrink: 0;
            }

            .barcode-img {
              max-width: 100%;
              height: 28px;
              display: block;
            }

            @media print {
              body { margin: 0; padding: 0; }
              .avery-label { border: none; }
              @page {
                size: letter;
                margin: 0.5in 0.1875in 0.5in 0.1875in;
              }
            }
          </style>
        </head>
        <body>
          ${labelsHTML}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 250);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Handler for progressing P1 PO items to Barcode
  const handleProgressToBarcode = async () => {
    if (selectedPOItems.size === 0) {
      toast({
        title: 'No Items Selected',
        description: 'Please select items to progress to Barcode',
        variant: 'destructive',
      });
      return;
    }

    // Convert selected PO items to the format expected by the API
    const selections: Array<{ poProductId: number; quantity: number }> = [];
    selectedPOItems.forEach((itemMap, poNumber) => {
      itemMap.forEach((quantity, itemId) => {
        selections.push({ poProductId: itemId, quantity });
      });
    });

    setIsProgressingPOItems(true);
    try {
      const response = await apiRequest('/api/p1-po-queue/progress', {
        method: 'POST',
        body: JSON.stringify({ selections }),
        headers: { 'Content-Type': 'application/json' },
      });

      const expectedUnits = selections.reduce((sum, selection) => sum + selection.quantity, 0);
      if (response.itemsProgressed !== expectedUnits) {
        throw new Error(`Barcode progression only confirmed ${response.itemsProgressed || 0} of ${expectedUnits} selected units`);
      }

      toast({
        title: 'Success',
        description: `Progressed all ${expectedUnits} selected PO units to Barcode (no labels needed for PO orders)`,
      });

      // Clear selections
      setSelectedPOItems(new Map());

      // Refetch data
      refetchPOs();
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });

      // PO orders do not need labels printed when progressed to Barcode
      // Labels are only required for regular production orders
    } catch (error: any) {
      console.error('Error progressing to Barcode:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to progress items to Barcode',
        variant: 'destructive',
      });
    } finally {
      setIsProgressingPOItems(false);
    }
  };

  // Handlers for P1 PO item selection with quantity support
  const handlePOItemQuantityChange = (poNumber: string, itemId: number, quantity: number, maxQuantity: number) => {
    const validQuantity = Math.max(0, Math.min(quantity, maxQuantity));
    
    setSelectedPOItems((prev) => {
      const newMap = new Map(prev);
      const itemMap = newMap.get(poNumber) || new Map();
      const newItemMap = new Map(itemMap);
      
      if (validQuantity === 0) {
        newItemMap.delete(itemId);
      } else {
        newItemMap.set(itemId, validQuantity);
      }
      
      if (newItemMap.size === 0) {
        newMap.delete(poNumber);
      } else {
        newMap.set(poNumber, newItemMap);
      }
      
      return newMap;
    });
  };

  const handleRetryStuck = async (poNumber: string) => {
    setRetryingPO(poNumber);
    try {
      const result = await apiRequest(`/api/p1-po-queue/retry-stuck/${encodeURIComponent(poNumber)}`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      });

      if (result.recovered > 0) {
        toast({
          title: 'Retry Successful',
          description: `Recovered ${result.recovered} order(s) for PO #${poNumber}${result.failed > 0 ? `. ${result.failed} item(s) still failing.` : '.'}`,
        });
        refetchPOs();
        refetchStuckCounts();
        queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
        queryClient.invalidateQueries({ queryKey: ['/api/production-queue/reconciliation'] });
      } else if (result.stuckSelectionsFound === 0) {
        toast({
          title: 'No Stuck Items',
          description: `PO #${poNumber} has no stuck selections — all selections already have production orders.`,
        });
        refetchStuckCounts();
      } else {
        toast({
          title: 'Retry Failed',
          description: `Found ${result.stuckSelectionsFound} stuck selection(s) but could not recover them. Check server logs.`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Retry Error',
        description: error.message || `Failed to retry stuck items for PO #${poNumber}`,
        variant: 'destructive',
      });
    } finally {
      setRetryingPO(null);
    }
  };

  const handleSelectAllPOItems = (poNumber: string, items: any[]) => {
    setSelectedPOItems((prev) => {
      const newMap = new Map(prev);
      const itemMap = newMap.get(poNumber) || new Map();
      // Filter out "no stock" items from selection
      const eligibleItems = items.filter((item) => item.stockModel !== "no stock");
      const allSelected = eligibleItems.every((item) => itemMap.get(item.id) === item.quantity);
      
      if (allSelected) {
        // Deselect all
        newMap.delete(poNumber);
      } else {
        // Select all eligible items with their full quantities
        const newItemMap = new Map();
        eligibleItems.forEach((item) => {
          newItemMap.set(item.id, item.quantity);
        });
        newMap.set(poNumber, newItemMap);
      }
      
      return newMap;
    });
  };


  const getUrgencyBadgeColor = (urgencyLevel: string) => {
    switch (urgencyLevel) {
      case 'critical':
        return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high':
        return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'medium':
        return 'bg-yellow-500 hover:bg-yellow-600 text-white';
      default:
        return 'bg-green-500 hover:bg-green-600 text-white';
    }
  };

  // Removed: handleOpenWeekSelection, handleWeekToggle, handleMoveSelectedWeeks
  // All P1 PO week selection functionality now managed via OEM Priority Settings

  const movePriority = (index: number, direction: 'up' | 'down') => {
    const newQueue = [...productionQueue];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newQueue.length) return;

    // Swap orders
    [newQueue[index], newQueue[targetIndex]] = [
      newQueue[targetIndex],
      newQueue[index],
    ];

    // Update priority scores and queue positions
    const updatedOrders = newQueue.map((order, idx) => ({
      ...order,
      queuePosition: idx + 1,
      priorityScore: 1000 - idx, // Higher position = higher score
    }));

    updatePrioritiesMutation.mutate(updatedOrders);
  };

  // Ensure p1PurchaseOrders is always an array
  const safePurchaseOrders = Array.isArray(p1PurchaseOrders) ? p1PurchaseOrders : [];

  // A refetch can remove or reduce PO demand after another operator releases it.
  // Keep the selection state aligned with the currently visible, server-backed
  // remaining quantities so an old checkbox cannot submit duplicate demand.
  useEffect(() => {
    const availableByPo = new Map<string, Map<number, number>>();
    safePurchaseOrders.forEach((customer) => {
      customer.purchaseOrders.forEach((po) => {
        availableByPo.set(
          po.poNumber,
          new Map(po.items.map((item) => [item.id, item.quantity])),
        );
      });
    });

    setSelectedPOItems((previous) => {
      const next = new Map<string, Map<number, number>>();
      previous.forEach((items, poNumber) => {
        const availableItems = availableByPo.get(poNumber);
        if (!availableItems) return;

        const validItems = new Map<number, number>();
        items.forEach((selectedQuantity, itemId) => {
          const availableQuantity = availableItems.get(itemId) ?? 0;
          const validQuantity = Math.min(selectedQuantity, availableQuantity);
          if (validQuantity > 0) validItems.set(itemId, validQuantity);
        });
        if (validItems.size > 0) next.set(poNumber, validItems);
      });

      const unchanged =
        next.size === previous.size &&
        Array.from(next).every(([poNumber, items]) => {
          const oldItems = previous.get(poNumber);
          return oldItems?.size === items.size &&
            Array.from(items).every(([itemId, quantity]) => oldItems.get(itemId) === quantity);
        });
      return unchanged ? previous : next;
    });
  }, [p1PurchaseOrders]);
  
  // Debug: Log what's being received from API
  console.log('🛒 P1 Purchase Orders received:', {
    isArray: Array.isArray(p1PurchaseOrders),
    length: safePurchaseOrders.length,
    isLoading: isLoadingPOs,
    data: safePurchaseOrders.slice(0, 2)
  });

  // Filter out "no stock" items and calculate total items needing layup
  const totalPOItemsNeedingLayup = safePurchaseOrders.reduce(
    (total, customer) =>
      total +
      customer.purchaseOrders.reduce(
        (customerTotal, po) =>
          customerTotal + po.items.filter(item => item.stockModel !== "no stock").reduce((sum, item) => sum + item.quantity, 0),
        0
      ),
    0
  );

  // Filter and sort purchase orders by selected PO and due date, excluding "no stock" items
  const filteredPurchaseOrders = (selectedPOFilter === 'all'
    ? safePurchaseOrders
    : safePurchaseOrders.map((customer) => ({
        ...customer,
        purchaseOrders: customer.purchaseOrders.filter(
          (po) => po.poNumber === selectedPOFilter
        ),
      })).filter((customer) => customer.purchaseOrders.length > 0)
  ).map((customer) => ({
    ...customer,
    purchaseOrders: [...customer.purchaseOrders].map((po) => ({
      ...po,
      items: po.items.filter((item) => item.stockModel !== "no stock"),
      totalItems: po.items.filter((item) => item.stockModel !== "no stock").reduce((sum, item) => sum + item.quantity, 0),
    })).sort((a, b) => {
      // Sort by due date (expectedDelivery)
      const dateA = a.expectedDelivery ? new Date(a.expectedDelivery).getTime() : Infinity;
      const dateB = b.expectedDelivery ? new Date(b.expectedDelivery).getTime() : Infinity;
      return dateA - dateB;
    }),
  })).filter((customer) => customer.purchaseOrders.some(po => po.items.length > 0));

  // Get all unique PO numbers for dropdown
  const allPONumbers = Array.from(
    new Set(
      safePurchaseOrders.flatMap((customer) =>
        customer.purchaseOrders.map((po) => po.poNumber)
      )
    )
  ).sort();

  // Filter regular production queue by search query (order ID or customer name)
  const filteredProductionQueue = productionQueue.filter((order) => {
    if (!queueSearchQuery.trim()) return true;
    
    const searchLower = queueSearchQuery.toLowerCase().trim();
    const orderId = (order.orderId || '').toLowerCase();
    const fbOrderNumber = (order.fbOrderNumber || '').toLowerCase();
    const customerName = (order.customerName || '').toLowerCase();
    
    return orderId.includes(searchLower) || 
           fbOrderNumber.includes(searchLower) || 
           customerName.includes(searchLower);
  });

  const customerSummary = useMemo<QueueSummaryRow[]>(() => {
    const rows = new Map<string, QueueSummaryRow>();

    productionQueue.forEach((order) => {
      const key = order.customerName || order.customerId || 'Unknown Customer';
      const existing =
        rows.get(key) ||
        {
          key,
          orderCount: 0,
          overdueCount: 0,
          earliestDueDate: null,
        };

      existing.orderCount += 1;
      existing.overdueCount += order.isOverdue ? 1 : 0;
      if (isEarlierDueDate(order.dueDate, existing.earliestDueDate)) {
        existing.earliestDueDate = order.dueDate;
      }

      rows.set(key, existing);
    });

    return Array.from(rows.values()).sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return a.key.localeCompare(b.key);
    });
  }, [productionQueue]);

  const stockModelSummary = useMemo<StockModelSummaryRow[]>(() => {
    const rows = new Map<string, StockModelSummaryRow & { customers: Set<string> }>();

    filteredProductionQueue.forEach((order) => {
      const key = order.stockModelId || order.modelId || 'Unknown Stock Model';
      const existing =
        rows.get(key) ||
        {
          key,
          orderCount: 0,
          overdueCount: 0,
          earliestDueDate: null,
          customerCount: 0,
          orders: [],
          customers: new Set<string>(),
        };

      existing.orderCount += 1;
      existing.overdueCount += order.isOverdue ? 1 : 0;
      existing.orders.push(order);
      existing.customers.add(order.customerName || order.customerId || 'Unknown Customer');
      existing.customerCount = existing.customers.size;
      if (isEarlierDueDate(order.dueDate, existing.earliestDueDate)) {
        existing.earliestDueDate = order.dueDate;
      }

      rows.set(key, existing);
    });

    return Array.from(rows.values())
      .map(({ customers: _customers, ...row }) => ({
        ...row,
        orders: [...row.orders].sort((a, b) => {
          if (a.queuePosition !== b.queuePosition) return a.queuePosition - b.queuePosition;
          return (a.fbOrderNumber || a.orderId).localeCompare(b.fbOrderNumber || b.orderId);
        }),
      }))
      .sort((a, b) => {
        return a.key.localeCompare(b.key);
      });
  }, [filteredProductionQueue]);

  const filteredStockModelSummary = useMemo(() => {
    const query = stockModelAnalysisQuery.trim().toLowerCase();
    if (!query) return stockModelSummary;

    return stockModelSummary.filter((row) =>
      row.key.toLowerCase().includes(query)
    );
  }, [stockModelAnalysisQuery, stockModelSummary]);

  const dueDateSummary = useMemo<DueDateSummaryRow[]>(() => {
    const rows = new Map<string, Map<string, number>>();

    productionQueue.forEach((order) => {
      const dueDate = getDueDateKey(order.dueDate);
      const stockModel = order.stockModelId || order.modelId || 'Unknown Stock Model';
      const stockModels = rows.get(dueDate) || new Map<string, number>();

      stockModels.set(stockModel, (stockModels.get(stockModel) || 0) + 1);
      rows.set(dueDate, stockModels);
    });

    return Array.from(rows.entries())
      .map(([dueDate, stockModels]) => {
        const stockModelRows = Array.from(stockModels.entries())
          .map(([stockModel, orderCount]) => ({ stockModel, orderCount }))
          .sort((a, b) => {
            if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
            return a.stockModel.localeCompare(b.stockModel);
          });

        return {
          dueDate,
          orderCount: stockModelRows.reduce((sum, row) => sum + row.orderCount, 0),
          stockModels: stockModelRows,
        };
      })
      .sort((a, b) => {
        if (a.dueDate === 'No due date') return 1;
        if (b.dueDate === 'No due date') return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [productionQueue]);

  const renderQueueOrderTable = (orders: ProductionQueueOrder[], testIdPrefix: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <Checkbox
              checked={
                orders.length > 0 &&
                orders.every((order) => selectedQueueOrders.has(order.orderId))
              }
              onCheckedChange={(checked) => {
                setSelectedQueueOrders((current) => {
                  const next = new Set(current);
                  orders.forEach((order) => {
                    if (checked) {
                      next.add(order.orderId);
                    } else {
                      next.delete(order.orderId);
                    }
                  });
                  return next;
                });
              }}
            />
          </TableHead>
          <TableHead className="w-20">Priority</TableHead>
          <TableHead>Order ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Stock Model</TableHead>
          <TableHead>Action Length</TableHead>
          <TableHead>Bottom Metal</TableHead>
          <TableHead>LOP / Fill</TableHead>
          <TableHead>Due Date</TableHead>
          <TableHead>Days to Due</TableHead>
          <TableHead>Urgency</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="w-32">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          let actionLength = order.features?.action_length;
          if (!actionLength || actionLength === 'none') {
            const actionInlet = order.features?.action_inlet;
            if (actionInlet) {
              if (actionInlet.toLowerCase().includes('short')) actionLength = 'Short';
              else if (actionInlet.toLowerCase().includes('long')) actionLength = 'Long';
            }
          }
          const hasActionLength = actionLength && actionLength !== 'none';
          const isTikkaModel = (order.modelId || '').toLowerCase().includes('tikka');
          const bottomMetal = order.features?.bottom_metal;
          const showBottomMetal =
            bottomMetal &&
            typeof bottomMetal === 'string' &&
            bottomMetal.toLowerCase().includes('adl');
          const bottomMetalDisplay = showBottomMetal
            ? bottomMetal.replace(/_/g, ' ').toUpperCase()
            : '';
          const lop = order.features?.length_of_pull;
          const hasLopAdjustment = lop && lop !== 'no_lop_change' && lop.includes('lop_adj_');
          const lopDisplay = hasLopAdjustment
            ? lop.replace('lop_adj_', 'LOP ').replace('_', '.')
            : '';
          const otherOptions = order.features?.other_options || [];
          const hasHeavyFill = Array.isArray(otherOptions) && otherOptions.includes('heavy_fill');
          const queueIndex = productionQueue.findIndex((queueOrder) => queueOrder.orderId === order.orderId);

          return (
            <TableRow
              key={order.orderId}
              interactive
              className={order.isOverdue ? 'bg-red-50' : ''}
            >
              <TableCell>
                <Checkbox
                  checked={selectedQueueOrders.has(order.orderId)}
                  onCheckedChange={() => handleToggleOrderSelection(order.orderId)}
                  data-testid={`${testIdPrefix}-select-${order.orderId}`}
                />
              </TableCell>
              <TableCell className="font-bold text-center">
                #{order.queuePosition}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <div>
                    {order.fbOrderNumber || order.orderId}
                    {order.fbOrderNumber && (
                      <div className="text-xs text-gray-500">
                        {order.orderId}
                      </div>
                    )}
                  </div>
                  {order.isManualUrgency && (
                    <Badge className="bg-orange-500 text-white animate-pulse flex items-center gap-1 px-2 py-1 font-bold">
                      <Zap className="w-3 h-3" />
                      URGENT!!!
                    </Badge>
                  )}
                  {hasRushFee(order, 'rush_fee2') && (
                    <Badge
                      className="bg-purple-600 text-white flex items-center gap-1 px-2 py-1 font-semibold"
                      title="Expedite - 4 weeks faster ($250)"
                    >
                      EXPEDITE
                    </Badge>
                  )}
                  {hasRushFee(order, 'rush_fee1') && (
                    <Badge
                      className="bg-blue-600 text-white flex items-center gap-1 px-2 py-1 font-semibold"
                      title="Rush - 2 weeks faster ($200)"
                    >
                      RUSH
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-400" />
                  {order.customerName || order.customerId}
                </div>
              </TableCell>
              <TableCell>{order.modelId}</TableCell>
              <TableCell>
                <Badge variant="outline">{order.stockModelId}</Badge>
              </TableCell>
              <TableCell>
                {hasActionLength ? (
                  <Badge variant="secondary" className="font-medium">
                    {actionLength}
                  </Badge>
                ) : order.isFlattop ? (
                  <Badge
                    className="bg-yellow-100 text-yellow-900 border-yellow-300 font-semibold"
                    title="Flattop stock: action length is not machined"
                  >
                    FLATTOP
                  </Badge>
                ) : isTikkaModel ? (
                  <Badge
                    variant="secondary"
                    className="font-medium"
                    title="Tikka stock: action length is not differentiated"
                  >
                    None
                  </Badge>
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </TableCell>
              <TableCell>
                {showBottomMetal && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold">
                    {bottomMetalDisplay}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {hasLopAdjustment && (
                    <Badge className="bg-green-100 text-green-800 border-green-200 font-semibold text-xs">
                      {lopDisplay}
                    </Badge>
                  )}
                  {hasHeavyFill && (
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold text-xs">
                      HEAVY FILL
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  {new Date(order.dueDate).toLocaleDateString()}
                </div>
              </TableCell>
              <TableCell className={order.isOverdue ? 'text-red-600 font-semibold' : ''}>
                {order.daysToDue} days
              </TableCell>
              <TableCell>
                <Badge className={getUrgencyBadgeColor(order.urgencyLevel)}>
                  {order.urgencyLevel.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {order.priorityScore}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => movePriority(queueIndex, 'up')}
                    disabled={queueIndex <= 0 || updatePrioritiesMutation.isPending}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => movePriority(queueIndex, 'down')}
                    disabled={
                      queueIndex < 0 ||
                      queueIndex === productionQueue.length - 1 ||
                      updatePrioritiesMutation.isPending
                    }
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                  <OrderActionButtons
                    orderId={order.orderId}
                    showReassignButton={isAdmin}
                  />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  // Explicit guards to distinguish truly empty queue from filtered-to-empty
  const isTrulyEmpty = productionQueue.length === 0;
  const isFilteredEmpty = productionQueue.length > 0 && filteredProductionQueue.length === 0;
  const readyOrderCount = queueReconciliation?.ready ?? productionQueue.length;
  const needsAttentionCount = queueReconciliation?.needsAttention ?? attentionOrders.length;
  const departmentTotal =
    queueReconciliation?.total ?? readyOrderCount + needsAttentionCount;
  const otherNotReadyCount = queueReconciliation?.otherNotReady ?? 0;

  if (isLoading || isLoadingAttention || isLoadingPOs) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">Loading production queues...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-8">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-red-700 mb-2">Error Loading Production Queue</h2>
              <p className="text-red-600 mb-4">
                {error instanceof Error ? error.message : 'An unexpected error occurred'}
              </p>
              <Button onClick={() => refetch()} variant="outline" className="mr-2">
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto pb-32">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Production Queue Manager
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-populate queue, set priorities, and manage production flow
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              refetch();
              refetchAttention();
              refetchReconciliation();
              refetchPOs();
            }}
            variant="outline"
            disabled={isLoading || isLoadingPOs}
            className="flex items-center gap-2"
            data-testid="button-refresh"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            onClick={() => setScheduleHistoryOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-schedule-history"
          >
            <Calendar className="w-4 h-4" />
            View Schedule History
          </Button>
          <Button
            onClick={() => setMoldSettingsOpen(true)}
            variant="outline"
            className="flex items-center gap-2"
            data-testid="button-mold-settings"
          >
            <Settings className="w-4 h-4" />
            Mold Settings
          </Button>
          <Button
            onClick={() => autoPopulateMutation.mutate()}
            disabled={autoPopulateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            Auto-Populate Queue
          </Button>
        </div>
      </div>

      {/* Floating Sticky Action Bar - Shows when items are selected */}
      {(selectedQueueOrders.size > 0 || Array.from(selectedPOItems.values()).some(map => map.size > 0)) && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 to-blue-700 border-t-4 border-blue-400 shadow-2xl">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-white">
                <h3 className="font-bold text-lg">
                  {(() => {
                    const regularCount = selectedQueueOrders.size;
                    const poCount = Array.from(selectedPOItems.values()).reduce((sum, map) => {
                      return sum + Array.from(map.values()).reduce((qtySum, qty) => qtySum + qty, 0);
                    }, 0);
                    const total = regularCount + poCount;
                    return `${total} Item${total !== 1 ? 's' : ''} Selected`;
                  })()}
                </h3>
                <p className="text-sm text-blue-100">
                  {selectedQueueOrders.size} from Regular Queue • {' '}
                  {Array.from(selectedPOItems.values()).reduce((sum, map) => {
                    return sum + Array.from(map.values()).reduce((qtySum, qty) => qtySum + qty, 0);
                  }, 0)} from Purchase Orders
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => {
                    setSelectedQueueOrders(new Set());
                    setSelectedPOItems(new Map());
                  }}
                  className="bg-white text-gray-700 hover:bg-gray-100 border-2 border-white font-medium"
                  data-testid="button-clear-all-selections"
                >
                  Clear All
                </Button>
                {selectedQueueOrders.size > 0 && (
                  <Button
                    onClick={handleProgressSelectedToBarcode}
                    disabled={progressToBarcodeMutation.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white border-2 border-green-400 font-medium shadow-lg flex items-center gap-2"
                    size="default"
                    data-testid="button-progress-barcode-sticky"
                  >
                    <ArrowRight className="h-5 w-5" />
                    Progress to Barcode ({selectedQueueOrders.size})
                  </Button>
                )}
                <Button
                  onClick={() => setDaySelectionDialogOpen(true)}
                  disabled={generateScheduleMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white border-2 border-purple-400 font-medium shadow-lg flex items-center gap-2"
                  data-testid="button-generate-schedule-sticky"
                >
                  <CalendarCheck className="w-5 h-5" />
                  Generate Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-sm text-gray-500">P1 Dept Total</p>
                <p className="text-xl font-bold">{departmentTotal}</p>
                <p className="text-xs text-gray-400">Matches pipeline</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-sky-500" />
              <div>
                <p className="text-sm text-gray-500">Ready Orders</p>
                <p className="text-xl font-bold">{readyOrderCount}</p>
                <p className="text-xs text-gray-400">Actionable below</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={needsAttentionCount > 0 || otherNotReadyCount > 0 ? 'bg-red-50 border-red-200' : ''}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-500">Not Ready</p>
                <p className="text-xl font-bold">{needsAttentionCount + otherNotReadyCount}</p>
                <p className="text-xs text-gray-400">
                  {needsAttentionCount} attention
                  {otherNotReadyCount > 0 ? ` + ${otherNotReadyCount} other` : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-600 animate-pulse" />
              <div>
                <p className="text-sm text-orange-600 font-semibold">Urgent Orders</p>
                <p className="text-xl font-bold text-orange-700">
                  {productionQueue.filter((o) => o.isManualUrgency).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm text-gray-500">Critical</p>
                <p className="text-xl font-bold">
                  {
                    productionQueue.filter((o) => o.urgencyLevel === 'critical')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-sm text-gray-500">High Priority</p>
                <p className="text-xl font-bold">
                  {
                    productionQueue.filter((o) => o.urgencyLevel === 'high')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm text-gray-500">Normal</p>
                <p className="text-xl font-bold">
                  {
                    productionQueue.filter((o) => o.urgencyLevel === 'normal')
                      .length
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Accordion type="multiple" defaultValue={['regular-queue']} className="space-y-4">
        {/* Orders That Need Attention */}
        <AccordionItem value="attention-orders">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  Orders That Need Attention
                  {attentionOrders.length > 0 && (
                    <Badge className="bg-red-500 hover:bg-red-600 text-white ml-2">
                      {attentionOrders.length}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Orders missing critical information required for layup
                  scheduling
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                {attentionOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-300" />
                    <p>No orders requiring attention</p>
                    <p className="text-sm">
                      All production issues are resolved
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Stock Model</TableHead>
                        <TableHead>Missing Items</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(attentionOrders) &&
                        attentionOrders.map((order) => (
                          <TableRow key={order.orderId} interactive className="bg-amber-50">
                            <TableCell className="font-medium">
                              {order.orderId}
                            </TableCell>
                            <TableCell>
                              {order.customerName || order.customerId}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.modelId || 'Missing'}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <div className="flex flex-wrap gap-1">
                                {order.missingItems?.map((item: string) => (
                                  <Badge
                                    key={item}
                                    className="bg-red-500 hover:bg-red-600 text-white text-xs"
                                  >
                                    {item}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                {order.dueDate
                                  ? new Date(order.dueDate).toLocaleDateString()
                                  : 'Not set'}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-blue-600 hover:text-blue-700"
                                onClick={() =>
                                  setLocation(
                                    `/order-entry?edit=${order.orderId}`
                                  )
                                }
                                data-testid={`button-edit-${order.orderId}`}
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* P1 Purchase Orders Queue */}
        <AccordionItem value="purchase-orders">
          <Card>
            <AccordionTrigger 
              className="px-6 py-4 hover:no-underline"
              data-testid="accordion-purchase-orders"
            >
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                  P1 Purchase Orders ({totalPOItemsNeedingLayup} items need layup)
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Open purchase orders with stock items that need to be laid up
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                {/* Action bar for selected items */}
                {(() => {
                  const totalSelected = Array.from(selectedPOItems.values()).reduce(
                    (sum, map) => sum + Array.from(map.values()).reduce((qtySum, qty) => qtySum + qty, 0),
                    0
                  );
                  return totalSelected > 0 ? (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                        <span className="font-medium text-blue-900">
                          {totalSelected} {totalSelected === 1 ? 'item' : 'items'} selected
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedPOItems(new Map())}
                          data-testid="button-clear-selection"
                        >
                          Clear Selection
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                          disabled={isProgressingPOItems}
                          onClick={() => {
                            handleProgressToBarcode();
                          }}
                          data-testid="button-progress-to-barcode"
                        >
                          <ArrowRight className="w-4 h-4 mr-2" />
                          {isProgressingPOItems ? 'Progressing...' : 'Progress to Barcode'}
                        </Button>
                      </div>
                    </div>
                  ) : null;
                })()}

                {p1PurchaseOrders.length > 0 && (
                  <div className="mb-4 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Filter by PO Number:
                      </label>
                      <Select
                        value={selectedPOFilter}
                        onValueChange={setSelectedPOFilter}
                      >
                        <SelectTrigger className="w-64" data-testid="select-po-filter">
                          <SelectValue placeholder="All Purchase Orders" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Purchase Orders</SelectItem>
                          {allPONumbers.map((poNumber) => (
                            <SelectItem key={poNumber} value={poNumber}>
                              {poNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {filteredPurchaseOrders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No open purchase orders requiring layup</p>
                    <p className="text-sm">All PO items have been fulfilled</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {filteredPurchaseOrders.map((customer) => (
                      <div
                        key={customer.customerId}
                        className="border rounded-lg p-4 bg-gray-50"
                        data-testid={`customer-section-${customer.customerId}`}
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <User className="w-5 h-5 text-gray-600" />
                          <h3 
                            className="text-lg font-semibold text-gray-900"
                            data-testid={`text-customer-name-${customer.customerId}`}
                          >
                            {customer.customerName}
                          </h3>
                          <Badge 
                            variant="outline" 
                            className="ml-2"
                            data-testid={`badge-customer-id-${customer.customerId}`}
                          >
                            {customer.customerId}
                          </Badge>
                        </div>

                        {customer.purchaseOrders.map((po) => (
                          <Collapsible
                            key={po.poNumber}
                            className="mb-4 last:mb-0 bg-white rounded-md shadow-sm"
                            data-testid={`po-section-${po.poNumber}`}
                          >
                            <CollapsibleTrigger className="w-full p-4 hover:bg-gray-50 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                                <Badge 
                                  className="bg-blue-600 text-white font-medium"
                                  data-testid={`badge-po-number-${po.poNumber}`}
                                >
                                  PO: {po.poNumber}
                                </Badge>
                                {po.expectedDelivery && (
                                  <span 
                                    className="text-sm text-gray-500"
                                    data-testid={`text-due-date-${po.poNumber}`}
                                  >
                                    Due: {new Date(po.expectedDelivery).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="outline"
                                  data-testid={`badge-items-total-${po.poNumber}`}
                                >
                                  {po.totalItems} {po.totalItems === 1 ? 'item' : 'items'}
                                </Badge>
                                {(stuckCounts[po.poNumber] > 0 || retryingPO === po.poNumber) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-amber-700 border-amber-300 hover:bg-amber-50 flex items-center gap-1"
                                    disabled={retryingPO === po.poNumber}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRetryStuck(po.poNumber);
                                    }}
                                    data-testid={`button-retry-stuck-${po.poNumber}`}
                                    title={`Retry ${stuckCounts[po.poNumber]} failed selection(s) that did not generate production orders`}
                                  >
                                    <RotateCcw className={`w-3 h-3 ${retryingPO === po.poNumber ? 'animate-spin' : ''}`} />
                                    {retryingPO === po.poNumber
                                      ? 'Retrying…'
                                      : `Retry Failed Items (${stuckCounts[po.poNumber]})`}
                                  </Button>
                                )}
                              </div>
                            </CollapsibleTrigger>
                            
                            <CollapsibleContent className="p-4 pt-0">
                              {/* Select All Checkbox */}
                              <div className="mb-3 flex items-center gap-2">
                                <Checkbox
                                  id={`select-all-${po.poNumber}`}
                                  checked={
                                    po.items.length > 0 &&
                                    po.items.every((item) => 
                                      (selectedPOItems.get(po.poNumber) || new Map()).get(item.id) === item.quantity
                                    )
                                  }
                                  onCheckedChange={() => handleSelectAllPOItems(po.poNumber, po.items)}
                                  data-testid={`checkbox-select-all-${po.poNumber}`}
                                />
                                <label
                                  htmlFor={`select-all-${po.poNumber}`}
                                  className="text-sm font-medium text-gray-700 cursor-pointer"
                                >
                                  Select All Items
                                  {(() => {
                                    const itemMap = selectedPOItems.get(po.poNumber);
                                    const totalQty = itemMap ? Array.from(itemMap.values()).reduce((sum, qty) => sum + qty, 0) : 0;
                                    return totalQty > 0 ? (
                                      <span className="ml-2 text-blue-600">
                                        ({totalQty} unit{totalQty !== 1 ? 's' : ''} selected)
                                      </span>
                                    ) : null;
                                  })()}
                                </label>
                              </div>

                              <Table data-testid={`table-po-items-${po.poNumber}`}>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="w-40">Quantity to Schedule</TableHead>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead>Stock Model</TableHead>
                                    <TableHead>Action Length</TableHead>
                                    <TableHead>Material</TableHead>
                                    <TableHead>Handedness</TableHead>
                                    <TableHead>Available Qty</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Notes</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {po.items.map((item) => {
                                    const selectedQty = (selectedPOItems.get(po.poNumber) || new Map()).get(item.id) || 0;
                                    return (
                                      <TableRow
                                        key={item.id}
                                        interactive
                                        data-testid={`row-po-item-${item.id}`}
                                        className={selectedQty > 0 ? 'bg-blue-50' : ''}
                                      >
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 w-8 p-0"
                                              onClick={() => handlePOItemQuantityChange(po.poNumber, item.id, selectedQty - 1, item.quantity)}
                                              disabled={selectedQty === 0}
                                              data-testid={`button-decrement-${item.id}`}
                                            >
                                              -
                                            </Button>
                                            <Input
                                              type="number"
                                              min="0"
                                              max={item.quantity}
                                              value={selectedQty}
                                              onChange={(e) => {
                                                const val = parseInt(e.target.value) || 0;
                                                handlePOItemQuantityChange(po.poNumber, item.id, val, item.quantity);
                                              }}
                                              className="w-16 h-8 text-center"
                                              data-testid={`input-quantity-${item.id}`}
                                            />
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-8 w-8 p-0"
                                              onClick={() => handlePOItemQuantityChange(po.poNumber, item.id, selectedQty + 1, item.quantity)}
                                              disabled={selectedQty >= item.quantity}
                                              data-testid={`button-increment-${item.id}`}
                                            >
                                              +
                                            </Button>
                                            <span className="text-xs text-gray-500 ml-1">
                                              of {item.quantity}
                                            </span>
                                          </div>
                                        </TableCell>
                                      <TableCell className="font-medium">
                                        {item.productName}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline">
                                          {getStockModelDisplayName(item.specifications?.stockModel || item.stockModel)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {item.actionLength || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {item.material || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm">
                                        {item.handedness || '-'}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className="bg-orange-500 text-white">
                                          {item.quantity}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge 
                                          variant={
                                            item.status === 'completed' ? 'default' :
                                            item.status === 'pending' ? 'secondary' :
                                            'outline'
                                          }
                                        >
                                          {item.status || 'pending'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-sm text-gray-600 max-w-xs truncate">
                                        {item.notes || '-'}
                                      </TableCell>
                                    </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Regular Production Queue */}
        <AccordionItem value="regular-queue">
          <Card>
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <CardHeader className="p-0">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Regular Production Queue ({filteredProductionQueue.length}
                  {queueSearchQuery && ` of ${productionQueue.length}`})
                </CardTitle>
                <p className="text-sm text-gray-500 text-left">
                  Inventory items ready to progress to Barcode
                </p>
              </CardHeader>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent>
                <Tabs
                  value={queueView}
                  onValueChange={(value) => setQueueView(value as QueueView)}
                  className="space-y-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      <span>Queue Views</span>
                    </div>
                    <TabsList className="grid h-auto w-full grid-cols-2 lg:w-auto lg:grid-cols-4">
                      <TabsTrigger value="orders">Orders</TabsTrigger>
                      <TabsTrigger value="customer">By Customer</TabsTrigger>
                      <TabsTrigger value="stock-model">By Stock Model</TabsTrigger>
                      <TabsTrigger value="due-date">By Due Date</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="orders" className="mt-0">
                {productionQueue.length > 0 && (
                  <div className="space-y-4 mb-4">
                    {/* Search box */}
                    <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <Input
                        type="text"
                        placeholder="Search by Order ID or Customer Name..."
                        value={queueSearchQuery}
                        onChange={(e) => setQueueSearchQuery(e.target.value)}
                        className="flex-1"
                        data-testid="input-queue-search"
                      />
                      {queueSearchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setQueueSearchQuery('')}
                          data-testid="button-clear-search"
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAllQueueOrders}
                        className="flex items-center gap-2"
                        data-testid="button-select-all-queue"
                      >
                        {selectedQueueOrders.size === filteredProductionQueue.length
                          ? 'Deselect All'
                          : 'Select All'}
                      </Button>
                      {selectedQueueOrders.size > 0 && (
                        <Button
                          onClick={handleProgressSelectedToBarcode}
                          disabled={progressToBarcodeMutation.isPending}
                          className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                          size="sm"
                          data-testid="button-progress-barcode"
                        >
                          <ArrowRight className="h-4 w-4" />
                          Progress to Barcode ({selectedQueueOrders.size})
                        </Button>
                      )}
                    </div>

                    {/* Select Next N feature for regular queue */}
                    <div className="flex items-end gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex-1">
                        <label 
                          htmlFor="select-next-queue-count" 
                          className="text-sm font-medium text-gray-700 mb-2 block"
                        >
                          Select Next N Orders:
                        </label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="select-next-queue-count"
                            type="number"
                            min="1"
                            value={selectNextQueueCount}
                            onChange={(e) => setSelectNextQueueCount(e.target.value)}
                            placeholder="Enter quantity (e.g., 30)"
                            className="w-64"
                            data-testid="input-select-next-queue-count"
                          />
                          <Button
                            onClick={handleSelectNextQueueOrders}
                            disabled={!selectNextQueueCount || parseInt(selectNextQueueCount) <= 0}
                            data-testid="button-select-next-queue"
                          >
                            Select Next {selectNextQueueCount || 'N'}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Automatically selects the next orders from the queue in order
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {isTrulyEmpty ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No orders in production queue</p>
                    <p className="text-sm">
                      Use Auto-Populate to add eligible orders
                    </p>
                  </div>
                ) : isFilteredEmpty ? (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No orders match your search</p>
                    <p className="text-sm mb-4">
                      {productionQueue.length} order{productionQueue.length !== 1 ? 's' : ''} in queue, but none match "{queueSearchQuery}"
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQueueSearchQuery('')}
                      data-testid="button-clear-search"
                    >
                      Clear Search
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={
                              selectedQueueOrders.size ===
                                filteredProductionQueue.length &&
                              filteredProductionQueue.length > 0
                            }
                            onCheckedChange={handleSelectAllQueueOrders}
                          />
                        </TableHead>
                        <TableHead className="w-20">Priority</TableHead>
                        <TableHead>Order ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Stock Model</TableHead>
                        <TableHead>Action Length</TableHead>
                        <TableHead>Bottom Metal</TableHead>
                        <TableHead>LOP / Fill</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Days to Due</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProductionQueue.map((order, index) => {
                        const orderLabels = deriveOrderLabels(order);
                        const actionLength = orderLabels.actionLengthRaw;
                        const actionLengthDisplay = orderLabels.actionBadgeLabel;
                        const hasActionLength = actionLength !== 'unknown';
                        const isTikkaModel = (order.modelId || '').toLowerCase().includes('tikka');

                        // Check if bottom metal contains "adl"
                        const bottomMetal = order.features?.bottom_metal;
                        const showBottomMetal =
                          bottomMetal &&
                          typeof bottomMetal === 'string' &&
                          bottomMetal.toLowerCase().includes('adl');
                        const bottomMetalDisplay = showBottomMetal
                          ? bottomMetal.replace(/_/g, ' ').toUpperCase()
                          : '';

                        // Check for LOP adjustments
                        const lop = order.features?.length_of_pull;
                        const hasLopAdjustment = lop && lop !== 'no_lop_change' && lop.includes('lop_adj_');
                        const lopDisplay = hasLopAdjustment 
                          ? lop.replace('lop_adj_', 'LOP ').replace('_', '.')
                          : '';

                        // Check for heavy fill option
                        const otherOptions = order.features?.other_options || [];
                        const hasHeavyFill = Array.isArray(otherOptions) && otherOptions.includes('heavy_fill');

                        return (
                          <TableRow
                            key={order.orderId}
                            interactive
                            className={order.isOverdue ? 'bg-red-50' : ''}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedQueueOrders.has(order.orderId)}
                                onCheckedChange={() =>
                                  handleToggleOrderSelection(order.orderId)
                                }
                              />
                            </TableCell>
                            <TableCell className="font-bold text-center">
                              #{order.queuePosition}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <div>
                                  {order.fbOrderNumber || order.orderId}
                                  {order.fbOrderNumber && (
                                    <div className="text-xs text-gray-500">
                                      {order.orderId}
                                    </div>
                                  )}
                                </div>
                                {order.isManualUrgency && (
                                  <Badge className="bg-orange-500 text-white animate-pulse flex items-center gap-1 px-2 py-1 font-bold">
                                    <Zap className="w-3 h-3" />
                                    URGENT!!!
                                  </Badge>
                                )}
                                {hasRushFee(order, 'rush_fee2') && (
                                  <Badge 
                                    className="bg-purple-600 text-white flex items-center gap-1 px-2 py-1 font-semibold"
                                    title="Expedite - 4 weeks faster ($250)"
                                  >
                                    EXPEDITE
                                  </Badge>
                                )}
                                {hasRushFee(order, 'rush_fee1') && (
                                  <Badge 
                                    className="bg-blue-600 text-white flex items-center gap-1 px-2 py-1 font-semibold"
                                    title="Rush - 2 weeks faster ($200)"
                                  >
                                    RUSH
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <User className="w-3 h-3 text-gray-400" />
                                {order.customerName || order.customerId}
                              </div>
                            </TableCell>
                            <TableCell>{order.modelId}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {order.stockModelId}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {hasActionLength ? (
                                <Badge
                                  variant="secondary"
                                  className="font-medium"
                                >
                                  {actionLengthDisplay}
                                </Badge>
                              ) : order.isFlattop ? (
                                <Badge
                                  className="bg-yellow-100 text-yellow-900 border-yellow-300 font-semibold"
                                  title="Flattop stock: action length is not machined"
                                >
                                  FLATTOP
                                </Badge>
                              ) : isTikkaModel ? (
                                <Badge
                                  variant="secondary"
                                  className="font-medium"
                                  title="Tikka stock: action length is not differentiated"
                                >
                                  None
                                </Badge>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {showBottomMetal && (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold">
                                  {bottomMetalDisplay}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {hasLopAdjustment && (
                                  <Badge className="bg-green-100 text-green-800 border-green-200 font-semibold text-xs">
                                    {lopDisplay}
                                  </Badge>
                                )}
                                {hasHeavyFill && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 font-semibold text-xs">
                                    HEAVY FILL
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-gray-400" />
                                {new Date(order.dueDate).toLocaleDateString()}
                              </div>
                            </TableCell>
                            <TableCell
                              className={
                                order.isOverdue
                                  ? 'text-red-600 font-semibold'
                                  : ''
                              }
                            >
                              {order.daysToDue} days
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={getUrgencyBadgeColor(
                                  order.urgencyLevel
                                )}
                              >
                                {order.urgencyLevel.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {order.priorityScore}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => movePriority(index, 'up')}
                                  disabled={
                                    index === 0 ||
                                    updatePrioritiesMutation.isPending
                                  }
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => movePriority(index, 'down')}
                                  disabled={
                                    index === productionQueue.length - 1 ||
                                    updatePrioritiesMutation.isPending
                                  }
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </Button>
                                <OrderActionButtons
                                  orderId={order.orderId}
                                  showReassignButton={isAdmin}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
                  </TabsContent>

                  <TabsContent value="customer" className="mt-0">
                    {customerSummary.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No customer summary available</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead className="text-right">Overdue</TableHead>
                            <TableHead>Earliest Due Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customerSummary.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell className="font-medium">{row.key}</TableCell>
                              <TableCell className="text-right font-semibold">
                                {row.orderCount}
                              </TableCell>
                              <TableCell className="text-right">
                                {row.overdueCount > 0 ? (
                                  <Badge className="bg-red-100 text-red-800 border-red-200">
                                    {row.overdueCount}
                                  </Badge>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </TableCell>
                              <TableCell>{formatDueDate(row.earliestDueDate)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="stock-model" className="mt-0 space-y-4">
                    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20 sm:flex-row sm:items-center">
                      <Input
                        type="text"
                        placeholder="Filter stock model contains... e.g. privateer"
                        value={stockModelAnalysisQuery}
                        onChange={(e) => setStockModelAnalysisQuery(e.target.value)}
                        className="flex-1"
                        data-testid="input-stock-model-analysis-filter"
                      />
                      {stockModelAnalysisQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setStockModelAnalysisQuery('')}
                          data-testid="button-clear-stock-model-analysis-filter"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    {filteredStockModelSummary.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No stock models match your filter</p>
                      </div>
                    ) : (
                      <Accordion type="multiple" className="space-y-3">
                        {filteredStockModelSummary.map((row) => (
                          <AccordionItem
                            key={row.key}
                            value={row.key}
                            className="rounded-lg border border-gray-200 bg-white px-4"
                          >
                            <AccordionTrigger
                              className="py-4 hover:no-underline"
                              data-testid={`accordion-stock-model-${row.key}`}
                            >
                              <div className="flex w-full flex-col gap-2 pr-4 text-left lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">{row.key}</Badge>
                                  <span className="font-semibold text-gray-900">
                                    {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                                  </span>
                                  <span className="text-sm text-gray-500">
                                    {row.customerCount} customer{row.customerCount === 1 ? '' : 's'}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                                  {row.overdueCount > 0 ? (
                                    <Badge className="bg-red-100 text-red-800 border-red-200">
                                      {row.overdueCount} overdue
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-400">0 overdue</span>
                                  )}
                                  <span>Earliest due {formatDueDate(row.earliestDueDate)}</span>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="overflow-x-auto pb-4">
                                {renderQueueOrderTable(row.orders, `stock-model-${row.key}`)}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </TabsContent>

                  <TabsContent value="due-date" className="mt-0">
                    {dueDateSummary.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No due date summary available</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Due Date</TableHead>
                            <TableHead className="text-right">Orders</TableHead>
                            <TableHead>Stock Model Breakdown</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dueDateSummary.map((row) => (
                            <TableRow key={row.dueDate}>
                              <TableCell className="font-medium">
                                {formatDueDate(row.dueDate)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {row.orderCount}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  {row.stockModels.map((stockModelRow) => (
                                    <Badge
                                      key={stockModelRow.stockModel}
                                      variant="outline"
                                      className="bg-white"
                                    >
                                      {stockModelRow.stockModel}: {stockModelRow.orderCount}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>

      {/* Day Selection Dialog for Layup Schedule */}
      <Dialog open={daySelectionDialogOpen} onOpenChange={setDaySelectionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Week and Days for Layup Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Week Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Week:</label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedWeekOffset(Math.max(-1, selectedWeekOffset - 1))}
                  disabled={selectedWeekOffset === -1}
                  data-testid="button-prev-week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-semibold text-blue-900">
                    {(() => {
                      const today = new Date();
                      const nextMonday = new Date(today);
                      nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
                      nextMonday.setDate(nextMonday.getDate() + (selectedWeekOffset * 7));
                      return nextMonday.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      });
                    })()}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {selectedWeekOffset === -1 ? 'This week' : selectedWeekOffset === 0 ? 'Next week' : selectedWeekOffset === 1 ? 'Week after next' : `${selectedWeekOffset + 1} weeks ahead`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedWeekOffset(selectedWeekOffset + 1)}
                  disabled={selectedWeekOffset >= 8}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Day Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Days to Schedule:</label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { day: 1, label: 'Monday' },
                  { day: 2, label: 'Tuesday' },
                  { day: 3, label: 'Wednesday' },
                  { day: 4, label: 'Thursday' },
                  { day: 5, label: 'Friday' },
                ].map(({ day, label }) => (
                  <label
                    key={day}
                    className={`flex flex-col items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                      selectedDays.includes(day)
                        ? 'bg-blue-50 border-blue-500 text-blue-900'
                        : 'bg-white border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedDays([...selectedDays, day].sort());
                        } else {
                          setSelectedDays(selectedDays.filter(d => d !== day));
                        }
                      }}
                      className="sr-only"
                      data-testid={`checkbox-day-${day}`}
                    />
                    <span className="text-xs font-medium">{label.substring(0, 3)}</span>
                    {selectedDays.includes(day) && (
                      <CalendarCheck className="w-4 h-4 mt-1 text-blue-600" />
                    )}
                  </label>
                ))}
              </div>
              {selectedDays.length === 0 && (
                <p className="text-sm text-red-600">Please select at least one day</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDaySelectionDialogOpen(false)}
              data-testid="button-cancel-day-selection"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                generateScheduleMutation.mutate();
                setDaySelectionDialogOpen(false);
              }}
              disabled={selectedDays.length === 0 || generateScheduleMutation.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
              data-testid="button-confirm-generate"
            >
              {generateScheduleMutation.isPending ? 'Generating...' : 'Generate Schedule'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Layup Schedule Preview Modal */}
      {generatedSchedule && (
        <LayupSchedulePreview
          open={schedulePreviewOpen}
          onClose={() => setSchedulePreviewOpen(false)}
          scheduledItems={generatedSchedule.scheduledItems}
          overflowItems={generatedSchedule.overflowItems}
          weekStart={generatedSchedule.weekStart}
          totalItems={generatedSchedule.totalItems}
          onApprove={() => approveScheduleMutation.mutateAsync()}
          isApproving={approveScheduleMutation.isPending}
        />
      )}

      {/* Schedule History & Reprint Dialog */}
      <ScheduleHistoryDialog
        open={scheduleHistoryOpen}
        onClose={() => setScheduleHistoryOpen(false)}
      />

      {/* Mold Settings Dialog */}
      <MoldSettings
        open={moldSettingsOpen}
        onOpenChange={setMoldSettingsOpen}
      />
    </div>
  );
}

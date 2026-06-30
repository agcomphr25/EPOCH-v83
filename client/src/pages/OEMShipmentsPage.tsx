import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Package,
  Download,
  Search,
  Calendar,
  Filter,
  FileText,
  Truck,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  Pencil,
  Check,
  Undo2,
  BarChart3,
  Layers,
  Wrench,
  Printer,
  Receipt,
  ExternalLink,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Plus } from 'lucide-react';

interface ShipmentItem {
  id: string;
  poItemId: number;
  orderId: string;
  quantity: number;
  description: string;
  poNumber: string;
  hasPackingSlip: boolean;
  packingSlipItemId?: string | null;
  itemType: 'stock_model' | 'custom_model' | string;
  unitPrice?: number | null;
  lineTotal?: number | null;
  packingSlipInvoiceNumber?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
}

interface Shipment {
  id: string;
  customer_id: number;
  customer_name: string;
  customer_address: string;
  customer_city: string;
  customer_state: string;
  customer_zip: string;
  master_tracking_number: string;
  service_code: string;
  total_weight_lbs: number;
  package_count: number;
  bill_type: string;
  reference: string;
  invoice_number: string | null;
  created_at: string;
  created_by: string;
  has_shipping_label: boolean;
  item_count: number;
  stock_count: number;
  accessory_count: number;
  po_count: number;
  shipmentInvoiceId?: string | null;
  shipmentInvoiceNumber?: string | null;
  shipmentInvoiceStatus?: string | null;
  items: ShipmentItem[];
}

interface OEMStats {
  stocksThisWeek: number;
  accessoriesThisWeek: number;
  stocksThisMonth: number;
  accessoriesThisMonth: number;
  stocksAllTime: number;
  accessoriesAllTime: number;
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const SERVICE_NAMES: Record<string, string> = {
  '03': 'UPS Ground',
  '02': 'UPS 2nd Day Air',
  '01': 'UPS Next Day Air',
  '12': 'UPS 3 Day Select',
  '13': 'UPS Next Day Air Saver',
  '14': 'UPS Next Day Air Early',
  '59': 'UPS 2nd Day Air A.M.',
};

export default function OEMShipmentsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'date' | 'po'>('date');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedPOs, setExpandedPOs] = useState<Set<string>>(new Set());
  const [editingTrackingId, setEditingTrackingId] = useState<string | null>(null);
  const [editingTrackingValue, setEditingTrackingValue] = useState('');
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [addItemShipmentId, setAddItemShipmentId] = useState<string | null>(null);
  const [addItemPoItemId, setAddItemPoItemId] = useState('');
  const [addItemOrderId, setAddItemOrderId] = useState('');
  const [addItemPoNumber, setAddItemPoNumber] = useState('');
  const [invoicePreview, setInvoicePreview] = useState<any | null>(null);
  const [invoicePreviewRequest, setInvoicePreviewRequest] = useState<{
    shipmentId: string;
    poNumber: string;
  } | null>(null);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const limit = 20;

  // Fetch shipments with filters
  const { data, isLoading, refetch } = useQuery<{
    shipments: Shipment[];
    pagination: PaginationInfo;
  }>({
    queryKey: [
      '/api/po-orders/oem-shipments',
      { search, startDate, endDate, limit, offset: page * limit },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('limit', limit.toString());
      params.append('offset', (page * limit).toString());

      const response = await fetch(
        `/api/po-orders/oem-shipments?${params.toString()}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch shipments');
      }

      return response.json();
    },
  });

  const shipments = data?.shipments || [];
  const pagination = data?.pagination;

  const { data: session } = useQuery<{ username?: string; role?: string }>({
    queryKey: ['/api/auth/session'],
    queryFn: () => apiRequest('/api/auth/session'),
  });
  const isGlennj = session?.username === 'glennj';
  const isGlennAdmin = isGlennj && String(session?.role || '').toUpperCase() === 'ADMIN';

  // Fetch weekly/monthly stats
  const { data: stats } = useQuery<OEMStats>({
    queryKey: ['/api/po-orders/oem-shipments/stats'],
    queryFn: async () => {
      const response = await fetch('/api/po-orders/oem-shipments/stats', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    staleTime: 60_000,
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(0);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSearchInput('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const getShipmentValue = (shipment: Shipment) =>
    shipment.items.reduce(
      (sum, item) =>
        sum + Number(item.lineTotal ?? Number(item.unitPrice || 0) * Number(item.quantity || 0)),
      0
    );

  const getPoInvoice = (items: ShipmentItem[], _shipment?: Shipment) => {
    const invoiceItem = items.find((item) => item.invoiceId);
    const packingSlipItem = items.find((item) => item.packingSlipInvoiceNumber);
    return invoiceItem
      ? {
          id: invoiceItem.invoiceId || null,
          invoiceNumber: invoiceItem.invoiceNumber || null,
          status: invoiceItem.invoiceStatus || null,
          packingSlipInvoiceNumber: invoiceItem.packingSlipInvoiceNumber || packingSlipItem?.packingSlipInvoiceNumber || null,
        }
      : packingSlipItem
        ? {
            id: null,
            invoiceNumber: null,
            status: null,
            packingSlipInvoiceNumber: packingSlipItem.packingSlipInvoiceNumber || null,
          }
        : null;
  };

  const getShipmentPoGroups = (shipment: Shipment) =>
    Object.entries(
      shipment.items.reduce<Record<string, ShipmentItem[]>>((acc, item) => {
        if (!acc[item.poNumber]) acc[item.poNumber] = [];
        acc[item.poNumber].push(item);
        return acc;
      }, {})
    );

  const createInvoiceMutation = useMutation({
    mutationFn: async ({ shipmentId, poNumber }: { shipmentId: string; poNumber: string }) => {
      return await apiRequest(`/api/po-orders/oem-shipments/${shipmentId}/invoices`, {
        method: 'POST',
        body: { poNumber },
      });
    },
    onSuccess: (invoice: any) => {
      setInvoicePreviewOpen(false);
      setInvoicePreview(null);
      setInvoicePreviewRequest(null);
      toast({
        title: invoice?.existing ? 'Invoice already exists' : 'Invoice ready for review',
        description: invoice?.invoiceNumber
          ? invoice.existing
            ? `Invoice ${invoice.invoiceNumber} is already linked to this P1 packing slip.`
            : `Invoice ${invoice.invoiceNumber} was created from this P1 packing slip.`
          : invoice?.existing
            ? 'An invoice is already linked to this P1 packing slip.'
            : 'Invoice was created from this P1 packing slip.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      if (invoice?.id) setLocation(`/finance/invoices/${invoice.id}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Invoice creation failed',
        description: error.message || 'Unable to create invoice from this P1 packing slip.',
        variant: 'destructive',
      });
    },
  });

  const previewInvoiceMutation = useMutation({
    mutationFn: async ({ shipmentId, poNumber }: { shipmentId: string; poNumber: string }) => {
      return await apiRequest(`/api/po-orders/oem-shipments/${shipmentId}/invoices/preview`, {
        method: 'POST',
        body: { poNumber },
      });
    },
    onSuccess: (preview: any, variables) => {
      if (preview?.exists && preview?.id) {
        setLocation(`/finance/invoices/${preview.id}`);
        return;
      }
      setInvoicePreview(preview);
      setInvoicePreviewRequest(variables);
      setInvoicePreviewOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Invoice preview failed',
        description: error.message || 'Unable to preview invoice from this P1 packing slip.',
        variant: 'destructive',
      });
    },
  });

  const renderInvoiceButton = (
    shipmentId: string | number,
    poNumber: string,
    items: ShipmentItem[],
    shipment?: Shipment,
    size: 'sm' = 'sm'
  ) => {
    const invoice = getPoInvoice(items, shipment);
    const isCreating =
      createInvoiceMutation.isPending &&
      createInvoiceMutation.variables?.shipmentId === String(shipmentId) &&
      createInvoiceMutation.variables?.poNumber === poNumber;

    if (invoice?.id) {
      return (
        <Button
          size={size}
          variant="outline"
          onClick={() => setLocation(`/finance/invoices/${invoice.id}`)}
        >
          <Receipt className="h-3 w-3 mr-1" />
          View Invoice
          <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      );
    }

    return (
      <Button
        size={size}
        variant="outline"
        onClick={() => previewInvoiceMutation.mutate({ shipmentId: String(shipmentId), poNumber })}
        disabled={!isGlennAdmin || createInvoiceMutation.isPending || previewInvoiceMutation.isPending}
      >
        {isCreating || (
          previewInvoiceMutation.isPending &&
          previewInvoiceMutation.variables?.shipmentId === String(shipmentId) &&
          previewInvoiceMutation.variables?.poNumber === poNumber
        ) ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Receipt className="h-3 w-3 mr-1" />
        )}
        Preview Invoice
      </Button>
    );
  };

  const toggleExpanded = (shipmentId: string) => {
    const newExpanded = new Set(expandedShipments);
    if (newExpanded.has(shipmentId)) {
      newExpanded.delete(shipmentId);
    } else {
      newExpanded.add(shipmentId);
    }
    setExpandedShipments(newExpanded);
  };

  const downloadShippingLabel = async (shipmentId: string, trackingNumber: string) => {
    const newTab = window.open('', '_blank');
    try {
      const response = await fetch(`/api/po-orders/oem-shipments/${shipmentId}/label`, {
        credentials: 'include',
      });

      if (response.status === 404) {
        newTab?.close();
        toast({
          title: 'No label on file',
          description: 'No label on file — return this shipment to QC to regenerate.',
          variant: 'destructive',
        });
        return;
      }

      if (!response.ok) {
        newTab?.close();
        throw new Error('Failed to open shipping label');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast({ title: 'Shipping label opened in new tab' });
    } catch (error: any) {
      newTab?.close();
      toast({
        title: 'Failed to open label',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getAttachedPackingSlipItemId = (item: ShipmentItem) =>
    item.packingSlipItemId || item.id;

  const getPackingSlipItemForGroup = (items: ShipmentItem[]) =>
    items.find((item) => item.packingSlipItemId) ||
    items.find((item) => item.hasPackingSlip) ||
    items[0];

  const downloadPackingSlip = async (itemId: string, poNumber: string, orderId: string) => {
    const newTab = window.open('', '_blank');
    try {
      const params = new URLSearchParams();
      if (poNumber) params.set('poNumber', poNumber);
      if (orderId) params.set('orderId', orderId);
      const response = await fetch(`/api/po-orders/oem-shipments/packing-slip/${itemId}?${params.toString()}`, {
        credentials: 'include',
      });

      if (response.status === 404) {
        newTab?.close();
        const errorBody = await response.json().catch(() => null);
        toast({
          title: 'No packing slip available',
          description: errorBody?.details || errorBody?._error || 'No packing slip could be found or regenerated for this shipment.',
          variant: 'destructive',
        });
        return;
      }

      if (!response.ok) {
        newTab?.close();
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.details || errorBody?._error || 'Failed to open packing slip');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast({ title: 'Packing slip opened in new tab' });
    } catch (error: any) {
      newTab?.close();
      toast({
        title: 'Failed to open packing slip',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const copyTracking = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    toast({ title: 'Tracking number copied to clipboard' });
  };

  const updateTrackingMutation = useMutation({
    mutationFn: async ({ shipmentId, trackingNumber }: { shipmentId: string; trackingNumber: string }) => {
      return await apiRequest(`/api/po-orders/oem-shipments/${shipmentId}/tracking`, { 
        method: 'PATCH', 
        body: { trackingNumber } 
      });
    },
    onSuccess: () => {
      toast({ title: 'Tracking number updated successfully' });
      setEditingTrackingId(null);
      setEditingTrackingValue('');
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update tracking number', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const startEditingTracking = (shipmentId: string, currentValue: string) => {
    setEditingTrackingId(shipmentId);
    setEditingTrackingValue(currentValue);
  };

  const saveTrackingNumber = (shipmentId: string) => {
    if (editingTrackingValue.trim()) {
      updateTrackingMutation.mutate({ shipmentId, trackingNumber: editingTrackingValue.trim() });
    }
  };

  const cancelEditingTracking = () => {
    setEditingTrackingId(null);
    setEditingTrackingValue('');
  };

  const addItemMutation = useMutation({
    mutationFn: async ({ shipmentId, poItemId, orderId, poNumber }: { 
      shipmentId: string; 
      poItemId: number; 
      orderId: string;
      poNumber?: string;
    }) => {
      return await apiRequest(`/api/po-orders/oem-shipments/${shipmentId}/items`, { 
        method: 'POST', 
        body: { poItemId, orderId, quantity: 1, poNumber: poNumber || '' } 
      });
    },
    onSuccess: (data: any) => {
      toast({ title: 'Item added successfully', description: data.message });
      closeAddItemDialog();
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to add item', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const openAddItemDialog = (shipmentId: string) => {
    setAddItemShipmentId(shipmentId);
    setAddItemPoItemId('');
    setAddItemOrderId('');
    setAddItemPoNumber('');
    setAddItemDialogOpen(true);
  };

  const returnToQCMutation = useMutation({
    mutationFn: async ({ shipmentId, reason }: { shipmentId: string; reason?: string }) => {
      return await apiRequest(`/api/po-orders/oem-shipments/${shipmentId}/return-to-qc`, { 
        method: 'POST', 
        body: { reason } 
      });
    },
    onSuccess: (data: any) => {
      toast({ title: 'Returned to Shipping QC', description: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to return to QC', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const handleReturnToQC = (shipmentId: string) => {
    if (confirm('Are you sure you want to return this shipment to Shipping QC? This will allow reprinting shipping labels and packing slips.')) {
      returnToQCMutation.mutate({ shipmentId, reason: 'Reprint/edit required' });
    }
  };

  const closeAddItemDialog = () => {
    setAddItemDialogOpen(false);
    setAddItemShipmentId(null);
    setAddItemPoItemId('');
    setAddItemOrderId('');
    setAddItemPoNumber('');
  };

  const handleAddItem = () => {
    if (!addItemShipmentId || !addItemPoItemId || !addItemOrderId) {
      toast({ 
        title: 'Missing required fields', 
        description: 'Please fill in PO Item ID and Order ID',
        variant: 'destructive' 
      });
      return;
    }
    addItemMutation.mutate({ 
      shipmentId: addItemShipmentId, 
      poItemId: parseInt(addItemPoItemId), 
      orderId: addItemOrderId,
      poNumber: addItemPoNumber
    });
  };

  const toggleDateExpanded = (date: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(date)) {
      newExpanded.delete(date);
    } else {
      newExpanded.add(date);
    }
    setExpandedDates(newExpanded);
  };

  const togglePOExpanded = (po: string) => {
    const newExpanded = new Set(expandedPOs);
    if (newExpanded.has(po)) {
      newExpanded.delete(po);
    } else {
      newExpanded.add(po);
    }
    setExpandedPOs(newExpanded);
  };

  // Group shipments by date
  const shipmentsByDate = shipments.reduce((acc, shipment) => {
    const dateKey = format(new Date(shipment.created_at), 'yyyy-MM-dd');
    const displayDate = format(new Date(shipment.created_at), 'EEEE, MMMM d, yyyy');
    if (!acc[dateKey]) {
      acc[dateKey] = { displayDate, shipments: [] };
    }
    acc[dateKey].shipments.push(shipment);
    return acc;
  }, {} as Record<string, { displayDate: string; shipments: Shipment[] }>);

  // Group all items by customer + PO number to avoid mixing shipments across customers
  const itemsByPO = shipments.reduce((acc, shipment) => {
    shipment.items.forEach((item) => {
      const poKey = `${shipment.customer_id}-${item.poNumber}`;
      if (!acc[poKey]) {
        acc[poKey] = {
          poNumber: item.poNumber,
          customerName: shipment.customer_name,
          customerId: shipment.customer_id,
          items: [],
        };
      }
      acc[poKey].items.push({
        ...item,
        trackingNumber: shipment.master_tracking_number,
        shippedDate: shipment.created_at,
        shipmentId: shipment.id,
        hasLabel: shipment.has_shipping_label,
      });
    });
    return acc;
  }, {} as Record<string, { poNumber: string; customerName: string; customerId: number; items: Array<ShipmentItem & { trackingNumber: string; shippedDate: string; shipmentId: string; hasLabel: boolean }> }>);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8 text-blue-600" />
            OEM Shipments
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track all P1 PO shipments with UPS tracking and documents
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
            <Button
              size="sm"
              variant={viewMode === 'date' ? 'default' : 'ghost'}
              onClick={() => setViewMode('date')}
              className="gap-2"
            >
              <Calendar className="h-4 w-4" />
              By Date
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'po' ? 'default' : 'ghost'}
              onClick={() => setViewMode('po')}
              className="gap-2"
            >
              <FileText className="h-4 w-4" />
              By PO
            </Button>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            {pagination?.total || 0} Total Shipments
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search customer, PO, order, stock, tracking, reference, or invoice #..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-9"
                    data-testid="input-search-shipments"
                  />
                </div>
                <Button onClick={handleSearch} data-testid="button-search">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Date Range */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9"
                  data-testid="input-start-date"
                />
              </div>
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                  className="pl-9"
                  data-testid="input-end-date"
                />
              </div>
            </div>

            {/* Clear Filters */}
            <Button
              variant="outline"
              onClick={handleClearFilters}
              disabled={!search && !startDate && !endDate}
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary Card */}
      {stats && (
        <Card className="bg-gradient-to-r from-slate-50 to-blue-50 border-blue-200 dark:from-slate-900 dark:to-blue-950 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Shipment Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* This Week — Stocks */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-blue-100 dark:border-blue-900">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Stocks — This Week</span>
                </div>
                <div className="text-3xl font-bold text-blue-600">{stats.stocksThisWeek}</div>
              </div>
              {/* This Week — Metal Accessories */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-orange-100 dark:border-orange-900">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Metal Accessories — This Week</span>
                </div>
                <div className="text-3xl font-bold text-orange-600">{stats.accessoriesThisWeek}</div>
              </div>
              {/* This Month — Stocks */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-blue-100 dark:border-blue-900">
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Stocks — This Month</span>
                </div>
                <div className="text-3xl font-bold text-blue-600">{stats.stocksThisMonth}</div>
              </div>
              {/* This Month — Metal Accessories */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-orange-100 dark:border-orange-900">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">Metal Accessories — This Month</span>
                </div>
                <div className="text-3xl font-bold text-orange-600">{stats.accessoriesThisMonth}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading shipments...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && shipments.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No shipments found</h3>
            <p className="text-gray-600 dark:text-gray-400">
              {search || startDate || endDate
                ? 'Try adjusting your filters'
                : 'Shipments will appear here after processing'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Shipments List - Date View */}
      {!isLoading && shipments.length > 0 && viewMode === 'date' && (
        <div className="space-y-6">
          {Object.entries(shipmentsByDate)
            .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
            .map(([dateKey, { displayDate, shipments: dateShipments }]) => (
              <div key={dateKey} className="space-y-3">
                <div 
                  className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-2 rounded-lg"
                  onClick={() => toggleDateExpanded(dateKey)}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <h2 className="text-lg font-semibold">{displayDate}</h2>
                    <Badge variant="secondary">
                      {dateShipments.length} shipment{dateShipments.length !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                      <Layers className="h-3 w-3 mr-1" />
                      {dateShipments.reduce((sum, s) => sum + Number(s.stock_count || 0), 0)} stocks
                    </Badge>
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">
                      <Wrench className="h-3 w-3 mr-1" />
                      {dateShipments.reduce((sum, s) => sum + Number(s.accessory_count || 0), 0)} accessories
                    </Badge>
                  </div>
                  {expandedDates.has(dateKey) ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {expandedDates.has(dateKey) && (
                  <div className="space-y-3 ml-4 border-l-2 border-blue-200 pl-4">
                    {dateShipments.map((shipment) => (
                      <Card key={shipment.id} className="overflow-hidden">
                        <Collapsible
                          open={expandedShipments.has(shipment.id)}
                          onOpenChange={() => toggleExpanded(shipment.id)}
                        >
                          <CardHeader className="bg-gray-50 dark:bg-gray-800/50 pb-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                  <Truck className="h-5 w-5 text-blue-600" />
                                  <h3 className="text-lg font-semibold">{shipment.customer_name}</h3>
                                  <Badge variant="secondary">
                                    {shipment.po_count} PO{shipment.po_count !== 1 ? 's' : ''}
                                  </Badge>
                                  {Number(shipment.stock_count || 0) > 0 && (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                                      <Layers className="h-3 w-3 mr-1" />
                                      {Number(shipment.stock_count)} Stock{Number(shipment.stock_count) !== 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                  {Number(shipment.accessory_count || 0) > 0 && (
                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">
                                      <Wrench className="h-3 w-3 mr-1" />
                                      {Number(shipment.accessory_count)} Accessor{Number(shipment.accessory_count) !== 1 ? 'ies' : 'y'}
                                    </Badge>
                                  )}
                                </div>
                                
                                {/* PO Numbers and Items Summary */}
                                <div className="mt-2 p-2 bg-white dark:bg-gray-900 rounded border text-sm">
                                  <div className="flex flex-wrap gap-2 mb-2">
                                    <span className="text-gray-500 font-medium">POs:</span>
                                    {Array.from(new Set(shipment.items.map(i => i.poNumber))).map((poNum) => (
                                      <Badge key={poNum} variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200">
                                        {poNum}
                                      </Badge>
                                    ))}
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400">
                                    <span className="font-medium text-gray-500">Items: </span>
                                    {shipment.items.slice(0, 3).map((item, idx) => (
                                      <span key={item.id}>
                                        {item.description || item.orderId}
                                        {idx < Math.min(shipment.items.length, 3) - 1 ? ', ' : ''}
                                      </span>
                                    ))}
                                    {shipment.items.length > 3 && (
                                      <span className="text-gray-400"> +{shipment.items.length - 3} more</span>
                                    )}
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                                  <div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                      Tracking Number
                                    </p>
                                    {editingTrackingId === shipment.id ? (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          value={editingTrackingValue}
                                          onChange={(e) => setEditingTrackingValue(e.target.value)}
                                          className="h-8 font-mono text-sm w-48"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveTrackingNumber(shipment.id);
                                            if (e.key === 'Escape') cancelEditingTracking();
                                          }}
                                          autoFocus
                                        />
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => saveTrackingNumber(shipment.id)}
                                          disabled={updateTrackingMutation.isPending}
                                        >
                                          <Check className="h-4 w-4 text-green-600" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={cancelEditingTracking}
                                        >
                                          <X className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <code className="text-sm font-mono bg-white dark:bg-gray-900 px-2 py-1 rounded border">
                                          {shipment.master_tracking_number}
                                        </code>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => startEditingTracking(shipment.id, shipment.master_tracking_number)}
                                          title="Edit tracking number"
                                        >
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => copyTracking(shipment.master_tracking_number)}
                                          title="Copy tracking number"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                      Service & Weight
                                    </p>
                                    <p className="text-sm font-medium">
                                      {SERVICE_NAMES[shipment.service_code] || shipment.service_code} • {shipment.total_weight_lbs} lbs
                                    </p>
                                  </div>
                                  {isGlennj && (
                                    <div>
                                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                        Shipment Value
                                      </p>
                                      <p className="text-sm font-medium">
                                        {formatCurrency(getShipmentValue(shipment))}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-orange-600 hover:bg-orange-50 border-orange-300"
                                  onClick={() => handleReturnToQC(shipment.id.toString())}
                                  disabled={returnToQCMutation.isPending}
                                  title="Return to Shipping QC for reprint/edit"
                                >
                                  <Undo2 className="h-4 w-4 mr-1" />
                                  Return to QC
                                </Button>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => downloadShippingLabel(shipment.id, shipment.master_tracking_number)}
                                          disabled={!shipment.has_shipping_label}
                                          className={!shipment.has_shipping_label ? 'pointer-events-none opacity-50' : ''}
                                        >
                                          <Printer className="h-4 w-4 mr-2" />
                                          View Label
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    {!shipment.has_shipping_label && (
                                      <TooltipContent>
                                        <p>No shipping label on file</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                                {(() => {
                                  const poGroups = getShipmentPoGroups(shipment);
                                  if (poGroups.length === 0) return null;
                                  if (poGroups.length === 1) {
                                    const [poNumber, items] = poGroups[0];
                                    const hasSlip = items.some(i => i.hasPackingSlip);
                                    return (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => { const slipItem = getPackingSlipItemForGroup(items); downloadPackingSlip(getAttachedPackingSlipItemId(slipItem), poNumber, slipItem.orderId); }}
                                              >
                                                <FileText className="h-4 w-4 mr-2" />
                                                View Packing Slip
                                              </Button>
                                            </span>
                                          </TooltipTrigger>
                                          {!hasSlip && (
                                            <TooltipContent>
                                              <p>Packing slip will be generated if not available</p>
                                            </TooltipContent>
                                          )}
                                        </Tooltip>
                                      </TooltipProvider>
                                    );
                                  }
                                  return (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="outline">
                                          <FileText className="h-4 w-4 mr-2" />
                                          View Packing Slip
                                          <ChevronDown className="h-3 w-3 ml-1" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {poGroups.map(([poNumber, items]) => {
                                          const hasSlip = items.some(i => i.hasPackingSlip);
                                          return (
                                            <TooltipProvider key={poNumber}>
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <div>
                                                    <DropdownMenuItem
                                                      onClick={() => { const slipItem = getPackingSlipItemForGroup(items); downloadPackingSlip(getAttachedPackingSlipItemId(slipItem), poNumber, slipItem.orderId); }}
                                                    >
                                                      <Printer className="h-3 w-3 mr-2 flex-shrink-0" />
                                                      <div className="flex flex-col">
                                                        <span>PO {poNumber}</span>
                                                        <span className="text-xs text-muted-foreground">
                                                          {items.map(i => i.orderId).join(', ')}
                                                        </span>
                                                      </div>
                                                    </DropdownMenuItem>
                                                  </div>
                                                </TooltipTrigger>
                                                {!hasSlip && (
                                                  <TooltipContent>
                                                    <p>Packing slip will be generated if not available</p>
                                                  </TooltipContent>
                                                )}
                                              </Tooltip>
                                            </TooltipProvider>
                                          );
                                        })}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  );
                                })()}
                                {(() => {
                                  const poGroups = getShipmentPoGroups(shipment);
                                  if (poGroups.length === 0 || !isGlennAdmin) return null;
                                  if (poGroups.length === 1) {
                                    const [poNumber, items] = poGroups[0];
                                    return renderInvoiceButton(shipment.id, poNumber, items, shipment);
                                  }
                                  return (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button size="sm" variant="outline">
                                          <Receipt className="h-4 w-4 mr-2" />
                                          Invoices
                                          <ChevronDown className="h-3 w-3 ml-1" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        {poGroups.map(([poNumber, items]) => {
                                          const invoice = getPoInvoice(items, shipment);
                                          const isCreating =
                                            createInvoiceMutation.isPending &&
                                            createInvoiceMutation.variables?.shipmentId === String(shipment.id) &&
                                            createInvoiceMutation.variables?.poNumber === poNumber;
                                          return (
                                            <DropdownMenuItem
                                              key={poNumber}
                                              onClick={() => {
                                                if (invoice?.id) {
                                                  setLocation(`/finance/invoices/${invoice.id}`);
                                                } else {
                                                  previewInvoiceMutation.mutate({ shipmentId: String(shipment.id), poNumber });
                                                }
                                              }}
                                              disabled={
                                                (createInvoiceMutation.isPending && !isCreating) ||
                                                previewInvoiceMutation.isPending
                                              }
                                            >
                                              {isCreating || (
                                                previewInvoiceMutation.isPending &&
                                                previewInvoiceMutation.variables?.shipmentId === String(shipment.id) &&
                                                previewInvoiceMutation.variables?.poNumber === poNumber
                                              ) ? (
                                                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                              ) : (
                                                <Receipt className="h-3 w-3 mr-2" />
                                              )}
                                              <div className="flex flex-col">
                                                <span>{invoice?.id ? 'View' : 'Preview'} invoice for PO {poNumber}</span>
                                                {invoice?.invoiceNumber && (
                                                  <span className="text-xs text-muted-foreground">
                                                    {invoice.invoiceNumber} {invoice.status ? `- ${invoice.status}` : ''}
                                                  </span>
                                                )}
                                                {!invoice?.invoiceNumber && invoice?.packingSlipInvoiceNumber && (
                                                  <span className="text-xs text-muted-foreground">
                                                    Packing slip # {invoice.packingSlipInvoiceNumber}
                                                  </span>
                                                )}
                                              </div>
                                            </DropdownMenuItem>
                                          );
                                        })}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  );
                                })()}
                                <CollapsibleTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    {expandedShipments.has(shipment.id) ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                              </div>
                            </div>
                          </CardHeader>

                          <CollapsibleContent>
                            <CardContent className="pt-4">
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-100 dark:bg-gray-800">
                                    <tr>
                                      <th className="text-left p-3 font-semibold">PO Number</th>
                                      <th className="text-left p-3 font-semibold">Order ID</th>
                                      <th className="text-left p-3 font-semibold">Description</th>
                                      <th className="text-center p-3 font-semibold">Qty</th>
                                      {isGlennAdmin && <th className="text-center p-3 font-semibold">Invoice</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shipment.items.map((item) => (
                                      <tr key={item.id} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="p-3">
                                          <span className="font-mono text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-2 py-1 rounded">
                                            PO {item.poNumber}
                                          </span>
                                        </td>
                                        <td className="p-3 font-mono text-xs">{item.orderId}</td>
                                        <td className="p-3">
                                          <div className="flex items-center gap-2">
                                            <span>{item.description || item.orderId}</span>
                                            {item.itemType === 'custom_model' ? (
                                              <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">
                                                <Wrench className="h-2.5 w-2.5 mr-1" />Metal
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                                                <Layers className="h-2.5 w-2.5 mr-1" />Stock
                                              </Badge>
                                            )}
                                          </div>
                                        </td>
                                        <td className="p-3 text-center">
                                          <Badge variant="outline">{item.quantity}</Badge>
                                        </td>
                                        {isGlennAdmin && (
                                          <td className="p-3 text-center">
                                            {renderInvoiceButton(
                                              shipment.id,
                                              item.poNumber,
                                              shipment.items.filter((poItem) => poItem.poNumber === item.poNumber),
                                              shipment
                                            )}
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="mt-3 flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAddItemDialog(String(shipment.id))}
                                  className="gap-1"
                                >
                                  <Plus className="h-4 w-4" />
                                  Add Item
                                </Button>
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Shipments List - PO View */}
      {!isLoading && shipments.length > 0 && viewMode === 'po' && (
        <div className="space-y-4">
          {Object.values(itemsByPO)
            .sort((a, b) => {
              const aNum = parseInt(a.poNumber || '0') || 0;
              const bNum = parseInt(b.poNumber || '0') || 0;
              if (aNum !== bNum) return bNum - aNum;
              return (a.poNumber || '').localeCompare(b.poNumber || '');
            })
            .map((poGroup) => (
              <Card key={poGroup.poNumber} className="overflow-hidden">
                <Collapsible
                  open={expandedPOs.has(poGroup.poNumber)}
                  onOpenChange={() => togglePOExpanded(poGroup.poNumber)}
                >
                  <CardHeader className="bg-purple-50 dark:bg-purple-900/20 pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-purple-600" />
                        <h3 className="text-lg font-semibold">PO {poGroup.poNumber}</h3>
                        <Badge variant="secondary">{poGroup.customerName}</Badge>
                        <Badge variant="outline">
                          {poGroup.items.length} item{poGroup.items.length !== 1 ? 's' : ''} shipped
                        </Badge>
                        {getPoInvoice(poGroup.items) && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Invoice {getPoInvoice(poGroup.items)?.invoiceNumber}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isGlennAdmin && poGroup.items.length > 0 && renderInvoiceButton(poGroup.items[0].shipmentId, poGroup.poNumber, poGroup.items)}
                        <CollapsibleTrigger asChild>
                          <Button size="sm" variant="ghost">
                            {expandedPOs.has(poGroup.poNumber) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </div>
                    </div>
                  </CardHeader>

                  <CollapsibleContent>
                    <CardContent className="pt-4">
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100 dark:bg-gray-800">
                            <tr>
                              <th className="text-left p-3 font-semibold">Order ID</th>
                              <th className="text-left p-3 font-semibold">Description</th>
                              <th className="text-center p-3 font-semibold">Qty</th>
                              <th className="text-left p-3 font-semibold">Shipped Date</th>
                              <th className="text-left p-3 font-semibold">Tracking</th>
                              <th className="text-center p-3 font-semibold">Documents</th>
                            </tr>
                          </thead>
                          <tbody>
                            {poGroup.items.map((item, idx) => (
                              <tr key={`${item.id}-${idx}`} className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="p-3 font-mono text-xs">{item.orderId}</td>
                                <td className="p-3">{item.description}</td>
                                <td className="p-3 text-center">
                                  <Badge variant="outline">{item.quantity}</Badge>
                                </td>
                                <td className="p-3 text-sm">
                                  {format(new Date(item.shippedDate), 'MMM dd, yyyy')}
                                </td>
                                <td className="p-3">
                                  {editingTrackingId === item.shipmentId ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingTrackingValue}
                                        onChange={(e) => setEditingTrackingValue(e.target.value)}
                                        className="h-7 font-mono text-xs w-36"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveTrackingNumber(item.shipmentId);
                                          if (e.key === 'Escape') cancelEditingTracking();
                                        }}
                                        autoFocus
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => saveTrackingNumber(item.shipmentId)}
                                        disabled={updateTrackingMutation.isPending}
                                      >
                                        <Check className="h-3 w-3 text-green-600" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={cancelEditingTracking}
                                      >
                                        <X className="h-3 w-3 text-red-600" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                        {item.trackingNumber}
                                      </code>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => startEditingTracking(item.shipmentId, item.trackingNumber)}
                                        title="Edit tracking number"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => copyTracking(item.trackingNumber)}
                                        title="Copy tracking number"
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center gap-2 justify-center flex-wrap">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => downloadPackingSlip(getAttachedPackingSlipItemId(item), item.poNumber, item.orderId)}
                                    >
                                      <Printer className="h-3 w-3 mr-1" />
                                      View Packing Slip
                                    </Button>
                                    {isGlennAdmin && renderInvoiceButton(item.shipmentId, item.poNumber, poGroup.items)}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => downloadShippingLabel(item.shipmentId, item.trackingNumber)}
                                    >
                                      <Printer className="h-3 w-3 mr-1" />
                                      View Label
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            ))}
        </div>
      )}

      {/* Legacy Shipments List - Keeping for backward compatibility */}
      {!isLoading && shipments.length > 0 && false && (
        <div className="space-y-4">
          {shipments.map((shipment) => (
            <Card key={shipment.id} className="overflow-hidden">
              <Collapsible
                open={expandedShipments.has(shipment.id)}
                onOpenChange={() => toggleExpanded(shipment.id)}
              >
                <CardHeader className="bg-gray-50 dark:bg-gray-800/50 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <Truck className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold">{shipment.customer_name}</h3>
                        <Badge variant="secondary">
                          {shipment.po_count} PO{shipment.po_count !== 1 ? 's' : ''}
                        </Badge>
                        {Number(shipment.stock_count || 0) > 0 && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                            <Layers className="h-3 w-3 mr-1" />
                            {Number(shipment.stock_count)} Stock{Number(shipment.stock_count) !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        {Number(shipment.accessory_count || 0) > 0 && (
                          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">
                            <Wrench className="h-3 w-3 mr-1" />
                            {Number(shipment.accessory_count)} Accessor{Number(shipment.accessory_count) !== 1 ? 'ies' : 'y'}
                          </Badge>
                        )}
                      </div>

                      {/* PO Numbers and Items Summary */}
                      <div className="mt-2 p-2 bg-white dark:bg-gray-900 rounded border text-sm">
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="text-gray-500 font-medium">POs:</span>
                          {Array.from(new Set(shipment.items.map(i => i.poNumber))).map((poNum) => (
                            <Badge key={poNum} variant="outline" className="bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200">
                              {poNum}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-gray-500">Items: </span>
                          {shipment.items.slice(0, 3).map((item, idx) => (
                            <span key={item.id}>
                              {item.description || item.orderId}
                              {idx < Math.min(shipment.items.length, 3) - 1 ? ', ' : ''}
                            </span>
                          ))}
                          {shipment.items.length > 3 && (
                            <span className="text-gray-400"> +{shipment.items.length - 3} more</span>
                          )}
                        </div>
                        {isGlennj && (
                          <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <TrendingUp className="h-4 w-4 text-emerald-600" />
                            <span className="font-medium text-gray-500">Shipment Value:</span>
                            <span>{formatCurrency(getShipmentValue(shipment))}</span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                        {/* Tracking */}
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Tracking Number
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono bg-white dark:bg-gray-900 px-2 py-1 rounded border">
                              {shipment.master_tracking_number}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyTracking(shipment.master_tracking_number)}
                              data-testid={`button-copy-tracking-${shipment.id}`}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Service & Weight */}
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Service & Weight
                          </p>
                          <p className="text-sm font-medium">
                            {SERVICE_NAMES[shipment.service_code] || shipment.service_code} •{' '}
                            {shipment.total_weight_lbs} lbs
                          </p>
                        </div>

                        {/* Shipped Date */}
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                            Shipped On
                          </p>
                          <p className="text-sm font-medium">
                            {format(new Date(shipment.created_at), 'MMM dd, yyyy h:mm a')}
                          </p>
                          <p className="text-xs text-gray-500">by {shipment.created_by}</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Return to QC */}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-orange-600 hover:bg-orange-50 border-orange-300"
                        onClick={() => handleReturnToQC(shipment.id.toString())}
                        disabled={returnToQCMutation.isPending}
                        title="Return to Shipping QC for reprint/edit"
                      >
                        <Undo2 className="h-4 w-4 mr-1" />
                        Return to QC
                      </Button>

                      {/* Download Label */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          downloadShippingLabel(shipment.id, shipment.master_tracking_number)
                        }
                        data-testid={`button-download-label-${shipment.id}`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Label
                      </Button>

                      {/* Expand/Collapse */}
                      <CollapsibleTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          data-testid={`button-toggle-shipment-${shipment.id}`}
                        >
                          {expandedShipments.has(shipment.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="pt-4">
                    {/* Shipping Address */}
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
                      <p className="text-xs text-blue-800 dark:text-blue-300 font-semibold mb-1">
                        Shipping Address
                      </p>
                      <p className="text-sm">
                        {shipment.customer_address}
                        <br />
                        {shipment.customer_city}, {shipment.customer_state} {shipment.customer_zip}
                      </p>
                    </div>

                    {/* Items Table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                          <tr>
                            <th className="text-left p-3 font-semibold">PO Number</th>
                            <th className="text-left p-3 font-semibold">Order ID</th>
                            <th className="text-left p-3 font-semibold">Description</th>
                            <th className="text-center p-3 font-semibold">Qty</th>
                            <th className="text-center p-3 font-semibold">Documents</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipment.items.map((item) => (
                            <tr
                              key={item.id}
                              className="border-t hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            >
                              <td className="p-3">
                                <span className="font-mono text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-2 py-1 rounded">
                                  PO {item.poNumber}
                                </span>
                              </td>
                              <td className="p-3">
                                <span className="font-mono text-xs">{item.orderId}</span>
                              </td>
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  <span>{item.description || item.orderId}</span>
                                  {item.itemType === 'custom_model' ? (
                                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300">
                                      <Wrench className="h-2.5 w-2.5 mr-1" />Metal
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">
                                      <Layers className="h-2.5 w-2.5 mr-1" />Stock
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="outline">{item.quantity}</Badge>
                              </td>
                              <td className="p-3 text-center">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    downloadPackingSlip(item.id, item.poNumber, item.orderId)
                                  }
                                  data-testid={`button-download-packing-slip-${item.id}`}
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Packing Slip
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && pagination && pagination.total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Showing {page * limit + 1}-{Math.min((page + 1) * limit, pagination.total)} of{' '}
            {pagination.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              data-testid="button-prev-page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage(page + 1)}
              disabled={!pagination.hasMore}
              data-testid="button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Dialog open={invoicePreviewOpen} onOpenChange={setInvoicePreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview P1 Packing Slip Invoice</DialogTitle>
            <DialogDescription>
              Review the invoice generated from this PO-specific packing slip before creating it.
            </DialogDescription>
          </DialogHeader>

          {invoicePreview && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Invoice #</p>
                  <p className="font-mono font-semibold">{invoicePreview.invoiceNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">PO</p>
                  <p className="font-semibold">{invoicePreview.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-semibold">{invoicePreview.customerName || 'P1 OEM Customer'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold">{formatCurrency(Number(invoicePreview.totalAmount || 0))}</p>
                </div>
              </div>

              {invoicePreview.pricingMismatch && (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  One or more lines are missing unit pricing. The invoice will be created for review.
                </div>
              )}

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-800">
                    <tr>
                      <th className="text-left p-3 font-semibold">Part</th>
                      <th className="text-left p-3 font-semibold">Description</th>
                      <th className="text-center p-3 font-semibold">Qty</th>
                      <th className="text-right p-3 font-semibold">Unit Price</th>
                      <th className="text-right p-3 font-semibold">Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoicePreview.lines || []).map((line: any, index: number) => (
                      <tr key={`${line.description}-${index}`} className="border-t">
                        <td className="p-3 font-mono text-xs">{line.partNumber || '-'}</td>
                        <td className="p-3">
                          <div>{line.description}</div>
                          {line.orderIds?.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              {line.orderIds.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">{line.quantity}</td>
                        <td className="p-3 text-right">{formatCurrency(Number(line.unitPrice || 0))}</td>
                        <td className="p-3 text-right font-medium">{formatCurrency(Number(line.lineTotal || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setInvoicePreviewOpen(false);
                setInvoicePreview(null);
                setInvoicePreviewRequest(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (invoicePreviewRequest) {
                  createInvoiceMutation.mutate(invoicePreviewRequest);
                }
              }}
              disabled={!invoicePreviewRequest || createInvoiceMutation.isPending}
            >
              {createInvoiceMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Receipt className="h-4 w-4 mr-2" />
                  Create Invoice
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={addItemDialogOpen} onOpenChange={setAddItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Item to Shipment</DialogTitle>
            <DialogDescription>
              Add a missing item to this shipment. The Order ID format is PO-[poItemId]-[sequence] (e.g., PO-201-7).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="poItemId">PO Item ID *</Label>
              <Input
                id="poItemId"
                type="number"
                placeholder="e.g., 201"
                value={addItemPoItemId}
                onChange={(e) => setAddItemPoItemId(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                The purchase_order_items table ID for this stock model
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderId">Order ID *</Label>
              <Input
                id="orderId"
                placeholder="e.g., PO-201-7"
                value={addItemOrderId}
                onChange={(e) => setAddItemOrderId(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Format: PO-[poItemId]-[sequence number]
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="poNumber">PO Number (optional)</Label>
              <Input
                id="poNumber"
                placeholder="e.g., RFPO-002612"
                value={addItemPoNumber}
                onChange={(e) => setAddItemPoNumber(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddItemDialog}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddItem} 
              disabled={addItemMutation.isPending}
            >
              {addItemMutation.isPending ? 'Adding...' : 'Add Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

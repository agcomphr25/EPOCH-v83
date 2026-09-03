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
  ClipboardCheck,
  AlertTriangle,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

interface DailyInvoiceRunItem {
  shipmentId: string;
  poNumber: string;
  customerName: string;
  trackingNumber?: string | null;
  hasPackingSlip: boolean;
  packingSlipItemId?: string | null;
  exists?: boolean;
  id?: string | null;
  invoiceNumber?: string | null;
  status?: string | null;
  pricingMismatch?: boolean;
  pricingAmbiguous?: boolean;
  postedAt?: string | null;
  sentAt?: string | null;
  readiness: 'READY' | 'WARNING' | 'BLOCKED' | 'EXISTING';
  blockers: string[];
  warnings: string[];
  totalAmount: string;
  lines: Array<{
    partNumber?: string | null;
    description: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    orderIds?: string[];
  }>;
}

interface DailyInvoiceRun {
  shipmentDate: string;
  generatedAt: string;
  items: DailyInvoiceRunItem[];
  summary: { total: number; ready: number; blocked: number; existing: number };
}

interface DailyInvoiceRecipient {
  name: string;
  email: string;
  type: 'primary' | 'additional' | 'contact';
}

interface DailyInvoiceAttachment {
  attachment: { id: string; mediaId: string; entityType: string; entityId: string };
  media: { id: string; filename: string; title?: string | null; mimeType?: string | null; fileSize?: number | null };
}

interface DailyInvoiceSendOptions {
  loading: boolean;
  loaded: boolean;
  recipients: DailyInvoiceRecipient[];
  selectedRecipients: string[];
  attachments: DailyInvoiceAttachment[];
  selectedAttachmentIds: string[];
  customerMessage: string;
  error?: string;
}

interface DailyInvoiceActionResult {
  key: string;
  action: 'POST' | 'SEND';
  ok: boolean;
  invoiceNumber?: string;
  error?: string;
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
  const initialSearch = new URLSearchParams(window.location.search).get('search') || '';
  const [search, setSearch] = useState(initialSearch);
  const [searchInput, setSearchInput] = useState(initialSearch);
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
    invoiceDate?: string;
  } | null>(null);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [dailyInvoiceRunOpen, setDailyInvoiceRunOpen] = useState(false);
  const [dailyInvoiceRun, setDailyInvoiceRun] = useState<DailyInvoiceRun | null>(null);
  const [dailyInvoiceRunDate, setDailyInvoiceRunDate] = useState('');
  const [dailyInvoiceSharedDate, setDailyInvoiceSharedDate] = useState('');
  const [dailyInvoiceSelections, setDailyInvoiceSelections] = useState<Set<string>>(new Set());
  const [dailyInvoiceDates, setDailyInvoiceDates] = useState<Record<string, string>>({});
  const [dailyInvoiceConfirmed, setDailyInvoiceConfirmed] = useState(false);
  const [dailyPostSelections, setDailyPostSelections] = useState<Set<string>>(new Set());
  const [dailySendSelections, setDailySendSelections] = useState<Set<string>>(new Set());
  const [dailyPostConfirmed, setDailyPostConfirmed] = useState(false);
  const [dailySendConfirmed, setDailySendConfirmed] = useState(false);
  const [dailyInvoiceSendOptions, setDailyInvoiceSendOptions] = useState<Record<string, DailyInvoiceSendOptions>>({});
  const [dailyInvoiceActionResults, setDailyInvoiceActionResults] = useState<DailyInvoiceActionResult[]>([]);
  const [dailyInvoiceResults, setDailyInvoiceResults] = useState<Array<{
    key: string;
    ok: boolean;
    invoiceNumber?: string;
    invoiceId?: string;
    error?: string;
  }>>([]);
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
    mutationFn: async ({ shipmentId, poNumber, invoiceDate }: { shipmentId: string; poNumber: string; invoiceDate?: string }) => {
      return await apiRequest(`/api/po-orders/oem-shipments/${shipmentId}/invoices`, {
        method: 'POST',
        body: { poNumber, invoiceDate },
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
      setInvoicePreviewRequest({
        ...variables,
        invoiceDate: preview?.invoiceDate || new Date().toISOString().split('T')[0],
      });
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

  const dailyInvoiceKey = (item: Pick<DailyInvoiceRunItem, 'shipmentId' | 'poNumber'>) =>
    `${item.shipmentId}:${item.poNumber}`;

  const prepareDailyInvoiceRunMutation = useMutation({
    mutationFn: async (shipmentDate: string) => {
      return await apiRequest('/api/po-orders/oem-shipments/invoice-runs/preview', {
        method: 'POST',
        body: { shipmentDate },
      }) as DailyInvoiceRun;
    },
    onSuccess: (run) => {
      const defaultInvoiceDate = run.shipmentDate;
      const selectable = run.items.filter((item) =>
        item.readiness === 'READY' || item.readiness === 'WARNING'
      );
      setDailyInvoiceRun(run);
      setDailyInvoiceSharedDate(defaultInvoiceDate);
      setDailyInvoiceSelections(new Set(selectable.map(dailyInvoiceKey)));
      setDailyInvoiceDates(Object.fromEntries(run.items.map((item) => [dailyInvoiceKey(item), defaultInvoiceDate])));
      setDailyInvoiceResults([]);
      setDailyInvoiceConfirmed(false);
      setDailyPostSelections(new Set(run.items
        .filter((item) => item.id && ['DRAFT', 'REVIEW'].includes(String(item.status)) && !item.pricingMismatch && !item.pricingAmbiguous)
        .map(dailyInvoiceKey)));
      setDailySendSelections(new Set(run.items
        .filter((item) => item.id && item.status === 'POSTED')
        .map(dailyInvoiceKey)));
      setDailyPostConfirmed(false);
      setDailySendConfirmed(false);
      setDailyInvoiceSendOptions({});
      setDailyInvoiceActionResults([]);
      setDailyInvoiceRunOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: 'Daily invoice preparation failed',
        description: error.message || 'The daily readiness review could not be generated.',
        variant: 'destructive',
      });
    },
  });

  const createDailyInvoicesMutation = useMutation({
    mutationFn: async (items: DailyInvoiceRunItem[]) => {
      const results: Array<{
        key: string;
        ok: boolean;
        invoiceNumber?: string;
        invoiceId?: string;
        error?: string;
      }> = [];
      // Process one at a time so invoice-number assignment remains deterministic and
      // every PO receives an individual success/failure result.
      for (const item of items) {
        const key = dailyInvoiceKey(item);
        try {
          const invoice: any = await apiRequest(
            `/api/po-orders/oem-shipments/${item.shipmentId}/invoices`,
            {
              method: 'POST',
              body: { poNumber: item.poNumber, invoiceDate: dailyInvoiceDates[key] || dailyInvoiceSharedDate },
            }
          );
          results.push({
            key,
            ok: true,
            invoiceNumber: invoice.invoiceNumber,
            invoiceId: invoice.id,
          });
        } catch (error: any) {
          results.push({ key, ok: false, error: error.message || 'Invoice creation failed' });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      setDailyInvoiceResults(results);
      const successes = results.filter((result) => result.ok).length;
      const failures = results.length - successes;
      setDailyInvoiceRun((current) => {
        if (!current) return current;
        const nextItems = current.items.map((item) => {
          const result = results.find((candidate) => candidate.key === dailyInvoiceKey(item));
          return result?.ok ? {
            ...item,
            readiness: 'EXISTING' as const,
            exists: true,
            id: result.invoiceId || null,
            invoiceNumber: result.invoiceNumber || item.invoiceNumber,
            status: 'REVIEW',
          } : item;
        });
        return {
          ...current,
          items: nextItems,
          summary: {
            total: nextItems.length,
            ready: nextItems.filter((item) => item.readiness === 'READY' || item.readiness === 'WARNING').length,
            blocked: nextItems.filter((item) => item.readiness === 'BLOCKED').length,
            existing: nextItems.filter((item) => item.readiness === 'EXISTING').length,
          },
        };
      });
      setDailyInvoiceSelections(new Set(results.filter((result) => !result.ok).map((result) => result.key)));
      setDailyPostSelections((current) => new Set([
        ...current,
        ...results.filter((result) => result.ok).map((result) => result.key),
      ]));
      setDailyPostConfirmed(false);
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
      queryClient.invalidateQueries({ predicate: (query) =>
        Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices'
      });
      toast({
        title: failures ? 'Daily invoice run completed with exceptions' : 'Daily invoice drafts created',
        description: `${successes} created or confirmed${failures ? `; ${failures} need attention` : ''}. Nothing was posted or emailed.`,
        variant: failures ? 'destructive' : 'default',
      });
    },
  });

  const loadDailyInvoiceSendOptions = async (item: DailyInvoiceRunItem) => {
    if (!item.id) return;
    const key = dailyInvoiceKey(item);
    setDailyInvoiceSendOptions((current) => ({
      ...current,
      [key]: {
        loading: true,
        loaded: false,
        recipients: [],
        selectedRecipients: [],
        attachments: [],
        selectedAttachmentIds: [],
        customerMessage: current[key]?.customerMessage || '',
      },
    }));
    try {
      const [recipients, attachments] = await Promise.all([
        apiRequest(`/api/ar-invoices/${item.id}/email-recipients`) as Promise<DailyInvoiceRecipient[]>,
        fetch(`/api/media/attachments/invoice/${item.id}`, { credentials: 'include' }).then(async (response) => {
          if (!response.ok) throw new Error('Failed to load invoice attachments');
          return response.json() as Promise<DailyInvoiceAttachment[]>;
        }),
      ]);
      const uniqueRecipients = recipients.filter((recipient, index, list) =>
        list.findIndex((candidate) => candidate.email.trim().toLowerCase() === recipient.email.trim().toLowerCase()) === index
      );
      const primary = uniqueRecipients.find((recipient) => recipient.type === 'primary');
      setDailyInvoiceSendOptions((current) => ({
        ...current,
        [key]: {
          loading: false,
          loaded: true,
          recipients: uniqueRecipients,
          selectedRecipients: primary ? [primary.email] : uniqueRecipients.slice(0, 1).map((recipient) => recipient.email),
          attachments,
          selectedAttachmentIds: attachments.map((attachment) => attachment.media.id),
          customerMessage: current[key]?.customerMessage || '',
        },
      }));
    } catch (error: any) {
      setDailyInvoiceSendOptions((current) => ({
        ...current,
        [key]: {
          loading: false,
          loaded: false,
          recipients: [],
          selectedRecipients: [],
          attachments: [],
          selectedAttachmentIds: [],
          customerMessage: current[key]?.customerMessage || '',
          error: error.message || 'Send options could not be loaded',
        },
      }));
    }
  };

  const postDailyInvoicesMutation = useMutation({
    mutationFn: async (items: DailyInvoiceRunItem[]) => {
      const results: DailyInvoiceActionResult[] = [];
      for (const item of items) {
        const key = dailyInvoiceKey(item);
        try {
          await apiRequest(`/api/ar-invoices/${item.id}/post`, { method: 'POST' });
          results.push({ key, action: 'POST', ok: true, invoiceNumber: item.invoiceNumber || undefined });
        } catch (error: any) {
          results.push({ key, action: 'POST', ok: false, invoiceNumber: item.invoiceNumber || undefined, error: error.message || 'Posting failed' });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      setDailyInvoiceActionResults((current) => [...current.filter((result) => result.action !== 'POST'), ...results]);
      const successfulKeys = new Set(results.filter((result) => result.ok).map((result) => result.key));
      const failedKeys = results.filter((result) => !result.ok).map((result) => result.key);
      setDailyInvoiceRun((current) => current ? {
        ...current,
        items: current.items.map((item) => successfulKeys.has(dailyInvoiceKey(item)) ? { ...item, status: 'POSTED', postedAt: new Date().toISOString() } : item),
      } : current);
      setDailyPostSelections(new Set(failedKeys));
      setDailySendSelections((current) => new Set([...current, ...successfulKeys]));
      setDailyPostConfirmed(false);
      setDailySendConfirmed(false);
      const failed = results.filter((result) => !result.ok).length;
      toast({
        title: failed ? 'Posting completed with exceptions' : 'Selected invoices posted',
        description: `${results.length - failed} posted${failed ? `; ${failed} can be retried` : ''}. No email was sent.`,
        variant: failed ? 'destructive' : 'default',
      });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices' });
    },
  });

  const sendDailyInvoicesMutation = useMutation({
    mutationFn: async (items: DailyInvoiceRunItem[]) => {
      const results: DailyInvoiceActionResult[] = [];
      for (const item of items) {
        const key = dailyInvoiceKey(item);
        const options = dailyInvoiceSendOptions[key];
        if (!options?.loaded || options.selectedRecipients.length === 0) {
          results.push({ key, action: 'SEND', ok: false, invoiceNumber: item.invoiceNumber || undefined, error: 'Select at least one verified recipient before sending' });
          continue;
        }
        try {
          await apiRequest(`/api/ar-invoices/${item.id}/send`, {
            method: 'POST',
            body: {
              recipients: options.selectedRecipients,
              attachmentMediaIds: options.selectedAttachmentIds,
              customerMessage: options.customerMessage.trim() || undefined,
            },
          });
          results.push({ key, action: 'SEND', ok: true, invoiceNumber: item.invoiceNumber || undefined });
        } catch (error: any) {
          results.push({ key, action: 'SEND', ok: false, invoiceNumber: item.invoiceNumber || undefined, error: error.message || 'Sending failed' });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      setDailyInvoiceActionResults((current) => [...current.filter((result) => result.action !== 'SEND'), ...results]);
      const successfulKeys = new Set(results.filter((result) => result.ok).map((result) => result.key));
      const failedKeys = results.filter((result) => !result.ok).map((result) => result.key);
      setDailyInvoiceRun((current) => current ? {
        ...current,
        items: current.items.map((item) => successfulKeys.has(dailyInvoiceKey(item)) ? { ...item, status: 'SENT', sentAt: new Date().toISOString() } : item),
      } : current);
      setDailySendSelections(new Set(failedKeys));
      setDailySendConfirmed(false);
      const failed = results.filter((result) => !result.ok).length;
      toast({
        title: failed ? 'Sending completed with exceptions' : 'Selected invoices sent',
        description: `${results.length - failed} accepted by SendGrid${failed ? `; ${failed} can be retried` : ''}.`,
        variant: failed ? 'destructive' : 'default',
      });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === '/api/ar-invoices' });
      queryClient.invalidateQueries({ queryKey: ['/api/po-orders/oem-shipments'] });
    },
  });

  const openDailyInvoiceRun = (shipmentDate: string) => {
    setDailyInvoiceRunDate(shipmentDate);
    prepareDailyInvoiceRunMutation.mutate(shipmentDate);
  };

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
        const routeVersion = errorBody?.routeVersion
          ? ` [${errorBody.routeVersion}]`
          : '';
        toast({
          title: 'No packing slip available',
          description: `${errorBody?.details || errorBody?._error || 'No packing slip could be found or regenerated for this shipment.'}${routeVersion}`,
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

  const dailyPostItems = dailyInvoiceRun?.items.filter((item) =>
    dailyPostSelections.has(dailyInvoiceKey(item)) && item.id && ['DRAFT', 'REVIEW'].includes(String(item.status))
  ) || [];
  const dailySendItems = dailyInvoiceRun?.items.filter((item) =>
    dailySendSelections.has(dailyInvoiceKey(item)) && item.id && item.status === 'POSTED'
  ) || [];
  const dailySendConfigurationReady = dailySendItems.length > 0 && dailySendItems.every((item) => {
    const options = dailyInvoiceSendOptions[dailyInvoiceKey(item)];
    return options?.loaded && options.selectedRecipients.length > 0;
  });

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
                  {isGlennAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        openDailyInvoiceRun(dateKey);
                      }}
                      disabled={prepareDailyInvoiceRunMutation.isPending}
                    >
                      {prepareDailyInvoiceRunMutation.isPending && dailyInvoiceRunDate === dateKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ClipboardCheck className="h-4 w-4" />
                      )}
                      Prepare Daily Invoices
                    </Button>
                  )}
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
                                      <form
                                        className="flex items-center gap-2"
                                        onSubmit={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          saveTrackingNumber(shipment.id);
                                        }}
                                      >
                                        <Input
                                          value={editingTrackingValue}
                                          onChange={(e) => setEditingTrackingValue(e.target.value)}
                                          className="h-8 font-mono text-sm w-48"
                                          onKeyDown={(e) => {
                                            if (e.key === 'Escape') cancelEditingTracking();
                                          }}
                                          autoFocus
                                        />
                                        <Button
                                          type="submit"
                                          size="sm"
                                          variant="ghost"
                                          disabled={
                                            updateTrackingMutation.isPending ||
                                            !editingTrackingValue.trim()
                                          }
                                          aria-label="Save tracking number"
                                          title="Save tracking number"
                                        >
                                          <Check className="h-4 w-4 text-green-600" />
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="ghost"
                                          onClick={cancelEditingTracking}
                                          aria-label="Cancel tracking number edit"
                                          title="Cancel tracking number edit"
                                        >
                                          <X className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </form>
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
                                    <form
                                      className="flex items-center gap-2"
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        saveTrackingNumber(item.shipmentId);
                                      }}
                                    >
                                      <Input
                                        value={editingTrackingValue}
                                        onChange={(e) => setEditingTrackingValue(e.target.value)}
                                        className="h-7 font-mono text-xs w-36"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') cancelEditingTracking();
                                        }}
                                        autoFocus
                                      />
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        disabled={
                                          updateTrackingMutation.isPending ||
                                          !editingTrackingValue.trim()
                                        }
                                        aria-label="Save tracking number"
                                        title="Save tracking number"
                                      >
                                        <Check className="h-3 w-3 text-green-600" />
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={cancelEditingTracking}
                                        aria-label="Cancel tracking number edit"
                                        title="Cancel tracking number edit"
                                      >
                                        <X className="h-3 w-3 text-red-600" />
                                      </Button>
                                    </form>
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

      <Dialog open={dailyInvoiceRunOpen} onOpenChange={setDailyInvoiceRunOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prepare Daily OEM Invoices</DialogTitle>
            <DialogDescription>
              Verify every PO shipped on {dailyInvoiceRunDate}. Creating drafts does not post or email any invoice.
            </DialogDescription>
          </DialogHeader>

          {dailyInvoiceRun && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">PO invoices</p><p className="text-2xl font-bold">{dailyInvoiceRun.summary.total}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Ready</p><p className="text-2xl font-bold text-green-600">{dailyInvoiceRun.summary.ready}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Blocked</p><p className="text-2xl font-bold text-red-600">{dailyInvoiceRun.summary.blocked}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Already exists</p><p className="text-2xl font-bold text-blue-600">{dailyInvoiceRun.summary.existing}</p></CardContent></Card>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3">
                <div className="space-y-2">
                  <Label htmlFor="daily-shared-invoice-date">Default invoice date</Label>
                  <Input
                    id="daily-shared-invoice-date"
                    type="date"
                    className="w-48"
                    value={dailyInvoiceSharedDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDailyInvoiceSharedDate(value);
                      setDailyInvoiceDates(Object.fromEntries(
                        dailyInvoiceRun.items.map((item) => [dailyInvoiceKey(item), value])
                      ));
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Net 30 due dates are calculated from each invoice date.</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDailyInvoiceSelections(new Set(
                      dailyInvoiceRun.items
                        .filter((item) => item.readiness === 'READY' || item.readiness === 'WARNING')
                        .map(dailyInvoiceKey)
                    ))}
                  >
                    Select all ready
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDailyInvoiceSelections(new Set())}>
                    Clear selection
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border divide-y">
                {dailyInvoiceRun.items.map((item) => {
                  const key = dailyInvoiceKey(item);
                  const selectable = item.readiness === 'READY' || item.readiness === 'WARNING';
                  const selected = dailyInvoiceSelections.has(key);
                  const result = dailyInvoiceResults.find((entry) => entry.key === key);
                  return (
                    <div key={key} className={`p-3 ${selected ? 'bg-blue-50/60 dark:bg-blue-950/20' : ''}`}>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selected}
                          disabled={!selectable || createDailyInvoicesMutation.isPending}
                          onChange={(event) => setDailyInvoiceSelections((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(key); else next.delete(key);
                            return next;
                          })}
                          aria-label={`Select invoice for PO ${item.poNumber}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{item.customerName}</span>
                            <Badge variant="outline">PO {item.poNumber}</Badge>
                            <Badge className={
                              item.readiness === 'READY' ? 'bg-green-100 text-green-800' :
                              item.readiness === 'WARNING' ? 'bg-amber-100 text-amber-800' :
                              item.readiness === 'BLOCKED' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }>
                              {item.readiness}
                            </Badge>
                            {item.invoiceNumber && <span className="font-mono text-sm">{item.invoiceNumber}</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {item.trackingNumber ? `Tracking ${item.trackingNumber} • ` : ''}
                            {item.lines.length} line{item.lines.length === 1 ? '' : 's'} • {formatCurrency(Number(item.totalAmount || 0))}
                          </div>
                        </div>
                        {selectable && (
                          <Input
                            type="date"
                            className="w-44"
                            value={dailyInvoiceDates[key] || dailyInvoiceSharedDate}
                            onChange={(event) => setDailyInvoiceDates((current) => ({ ...current, [key]: event.target.value }))}
                            aria-label={`Invoice date for PO ${item.poNumber}`}
                          />
                        )}
                        {item.id && (
                          <Button size="sm" variant="outline" onClick={() => setLocation(`/finance/invoices/${item.id}`)}>
                            View Invoice
                          </Button>
                        )}
                        {item.packingSlipItemId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(
                              `/api/po-orders/oem-shipments/packing-slip/${item.packingSlipItemId}?poNumber=${encodeURIComponent(item.poNumber)}`,
                              '_blank'
                            )}
                          >
                            View Packing Slip
                          </Button>
                        )}
                        {item.id && ['DRAFT', 'REVIEW'].includes(String(item.status)) && (
                          <label className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                            <input
                              type="checkbox"
                              checked={dailyPostSelections.has(key)}
                              disabled={Boolean(item.pricingMismatch || item.pricingAmbiguous) || postDailyInvoicesMutation.isPending}
                              onChange={(event) => setDailyPostSelections((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(key); else next.delete(key);
                                setDailyPostConfirmed(false);
                                return next;
                              })}
                            />
                            Post
                          </label>
                        )}
                        {item.id && item.status === 'POSTED' && (
                          <>
                            <label className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                              <input
                                type="checkbox"
                                checked={dailySendSelections.has(key)}
                                disabled={sendDailyInvoicesMutation.isPending}
                                onChange={(event) => setDailySendSelections((current) => {
                                  const next = new Set(current);
                                  if (event.target.checked) next.add(key); else next.delete(key);
                                  setDailySendConfirmed(false);
                                  return next;
                                })}
                              />
                              Send
                            </label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => loadDailyInvoiceSendOptions(item)}
                              disabled={dailyInvoiceSendOptions[key]?.loading}
                            >
                              {dailyInvoiceSendOptions[key]?.loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              {dailyInvoiceSendOptions[key]?.loaded ? 'Reload Delivery Options' : 'Configure Delivery'}
                            </Button>
                          </>
                        )}
                      </div>

                      {(item.blockers.length > 0 || item.warnings.length > 0) && (
                        <div className="mt-2 ml-7 space-y-1 text-sm">
                          {item.blockers.map((message) => (
                            <div key={message} className="flex items-center gap-2 text-red-700">
                              <AlertTriangle className="h-4 w-4" />{message}
                            </div>
                          ))}
                          {item.warnings.map((message) => (
                            <div key={message} className="flex items-center gap-2 text-amber-700">
                              <AlertTriangle className="h-4 w-4" />{message}
                            </div>
                          ))}
                        </div>
                      )}

                      {result && (
                        <div className={`mt-2 ml-7 text-sm ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
                          {result.ok ? `Created ${result.invoiceNumber || 'invoice'} in REVIEW` : result.error}
                        </div>
                      )}

                      {dailyInvoiceActionResults.filter((entry) => entry.key === key).map((entry) => (
                        <div key={entry.action} className={`mt-2 ml-7 text-sm ${entry.ok ? 'text-green-700' : 'text-red-700'}`}>
                          {entry.ok ? `${entry.action === 'POST' ? 'Posted to accounting' : 'Email accepted by SendGrid'}` : `${entry.action}: ${entry.error}`}
                        </div>
                      ))}

                      {item.id && item.status === 'POSTED' && dailyInvoiceSendOptions[key] && (
                        <div className="mt-3 ml-7 rounded-lg border bg-background p-3 space-y-3">
                          {dailyInvoiceSendOptions[key].error ? (
                            <div className="text-sm text-red-700">{dailyInvoiceSendOptions[key].error}</div>
                          ) : dailyInvoiceSendOptions[key].loaded ? (
                            <>
                              <div>
                                <p className="text-sm font-semibold mb-2">Recipients *</p>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {dailyInvoiceSendOptions[key].recipients.map((recipient) => (
                                    <label key={recipient.email} className="flex items-start gap-2 rounded border p-2 text-sm">
                                      <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={dailyInvoiceSendOptions[key].selectedRecipients.includes(recipient.email)}
                                        onChange={(event) => setDailyInvoiceSendOptions((current) => {
                                          const options = current[key];
                                          const selectedRecipients = event.target.checked
                                            ? [...options.selectedRecipients, recipient.email]
                                            : options.selectedRecipients.filter((email) => email !== recipient.email);
                                          setDailySendConfirmed(false);
                                          return { ...current, [key]: { ...options, selectedRecipients } };
                                        })}
                                      />
                                      <span><strong>{recipient.name}</strong><br/><span className="text-muted-foreground">{recipient.email} • {recipient.type}</span></span>
                                    </label>
                                  ))}
                                  {!dailyInvoiceSendOptions[key].recipients.length && (
                                    <div className="text-sm text-red-700">No customer email recipients were found. Add one on the invoice/customer before sending.</div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <Label htmlFor={`daily-message-${key}`}>Customer message override</Label>
                                <Textarea
                                  id={`daily-message-${key}`}
                                  rows={2}
                                  className="mt-1"
                                  value={dailyInvoiceSendOptions[key].customerMessage}
                                  placeholder="Optional message; leave blank to use the invoice's customer-visible notes"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setDailyInvoiceSendOptions((current) => ({ ...current, [key]: { ...current[key], customerMessage: value } }));
                                    setDailySendConfirmed(false);
                                  }}
                                />
                              </div>
                              <div>
                                <p className="text-sm font-semibold mb-2">Optional invoice attachments</p>
                                <div className="grid gap-2 md:grid-cols-2">
                                  {dailyInvoiceSendOptions[key].attachments.map((attachment) => (
                                    <label key={attachment.media.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                                      <input
                                        type="checkbox"
                                        checked={dailyInvoiceSendOptions[key].selectedAttachmentIds.includes(attachment.media.id)}
                                        onChange={(event) => setDailyInvoiceSendOptions((current) => {
                                          const options = current[key];
                                          const selectedAttachmentIds = event.target.checked
                                            ? [...options.selectedAttachmentIds, attachment.media.id]
                                            : options.selectedAttachmentIds.filter((id) => id !== attachment.media.id);
                                          setDailySendConfirmed(false);
                                          return { ...current, [key]: { ...options, selectedAttachmentIds } };
                                        })}
                                      />
                                      <span className="truncate">{attachment.media.title || attachment.media.filename}</span>
                                      <Button type="button" size="sm" variant="ghost" onClick={(event) => {
                                        event.preventDefault();
                                        window.open(`/api/media/${attachment.media.id}/download`, '_blank');
                                      }}>Open</Button>
                                    </label>
                                  ))}
                                  {!dailyInvoiceSendOptions[key].attachments.length && (
                                    <div className="text-xs text-muted-foreground">No optional invoice attachments. The generated invoice PDF is always included.</div>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}

                      {item.lines.length > 0 && (
                        <details className="mt-3 ml-7">
                          <summary className="cursor-pointer text-sm font-medium text-blue-700">Review line items</summary>
                          <div className="mt-2 overflow-x-auto rounded border">
                            <table className="w-full text-sm">
                              <thead className="bg-muted"><tr><th className="p-2 text-left">Part</th><th className="p-2 text-left">Description</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Unit</th><th className="p-2 text-right">Total</th></tr></thead>
                              <tbody>{item.lines.map((line, index) => (
                                <tr key={`${line.partNumber}-${index}`} className="border-t">
                                  <td className="p-2 font-mono text-xs">{line.partNumber || '-'}</td>
                                  <td className="p-2">{line.description}{line.orderIds?.length ? <div className="text-xs text-muted-foreground">{line.orderIds.join(', ')}</div> : null}</td>
                                  <td className="p-2 text-right">{line.quantity}</td>
                                  <td className="p-2 text-right">{formatCurrency(Number(line.unitPrice || 0))}</td>
                                  <td className="p-2 text-right font-medium">{formatCurrency(Number(line.lineTotal || 0))}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Selected: {dailyInvoiceSelections.size} invoice{dailyInvoiceSelections.size === 1 ? '' : 's'} totaling{' '}
                {formatCurrency(dailyInvoiceRun.items
                  .filter((item) => dailyInvoiceSelections.has(dailyInvoiceKey(item)))
                  .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0))}.
                These will be created in <strong>REVIEW</strong>; nothing will be posted or emailed.
              </div>
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={dailyInvoiceConfirmed}
                  onChange={(event) => setDailyInvoiceConfirmed(event.target.checked)}
                />
                <span>I reviewed the selected POs, invoice dates, line items, pricing, and totals and want to create these review drafts.</span>
              </label>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-violet-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">2. Post reviewed invoices</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Posting creates the accounting journal entries. It does not email customers.
                    </p>
                    <p className="text-sm"><strong>{dailyPostItems.length}</strong> review invoice{dailyPostItems.length === 1 ? '' : 's'} selected.</p>
                    <label className="flex items-start gap-2 rounded border p-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={dailyPostConfirmed}
                        onChange={(event) => setDailyPostConfirmed(event.target.checked)}
                      />
                      <span>I verified the selected invoice totals and authorize posting them to accounting.</span>
                    </label>
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={!dailyPostItems.length || !dailyPostConfirmed || postDailyInvoicesMutation.isPending}
                      onClick={() => postDailyInvoicesMutation.mutate(dailyPostItems)}
                    >
                      {postDailyInvoicesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Post Selected ({dailyPostItems.length})
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-green-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">3. Verify delivery and send</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Review recipients, optional attachments, and messages above before sending.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The generated invoice PDF is always attached, and glenn@agadvanced.com is automatically copied by the existing invoice-delivery control.
                    </p>
                    <p className="text-sm"><strong>{dailySendItems.length}</strong> posted invoice{dailySendItems.length === 1 ? '' : 's'} selected.</p>
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={!dailySendItems.length}
                      onClick={() => dailySendItems.forEach((item) => {
                        const options = dailyInvoiceSendOptions[dailyInvoiceKey(item)];
                        if (!options?.loaded && !options?.loading) loadDailyInvoiceSendOptions(item);
                      })}
                    >
                      Load Selected Delivery Options
                    </Button>
                    {!dailySendConfigurationReady && dailySendItems.length > 0 && (
                      <p className="text-xs text-amber-700">Every selected invoice must have loaded delivery options and at least one recipient.</p>
                    )}
                    <label className="flex items-start gap-2 rounded border p-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={dailySendConfirmed}
                        onChange={(event) => setDailySendConfirmed(event.target.checked)}
                      />
                      <span>I verified each recipient, message, and attachment selection and authorize sending these invoices.</span>
                    </label>
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700"
                      disabled={!dailySendConfigurationReady || !dailySendConfirmed || sendDailyInvoicesMutation.isPending}
                      onClick={() => sendDailyInvoicesMutation.mutate(dailySendItems)}
                    >
                      {sendDailyInvoicesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Send Selected ({dailySendItems.length})
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDailyInvoiceRunOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (!dailyInvoiceRun) return;
                createDailyInvoicesMutation.mutate(
                  dailyInvoiceRun.items.filter((item) => dailyInvoiceSelections.has(dailyInvoiceKey(item)))
                );
              }}
              disabled={!dailyInvoiceSelections.size || !dailyInvoiceConfirmed || createDailyInvoicesMutation.isPending}
            >
              {createDailyInvoicesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Receipt className="h-4 w-4 mr-2" />}
              Create Selected Drafts ({dailyInvoiceSelections.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

              <div className="max-w-xs space-y-2">
                <Label htmlFor="p1-invoice-date">Invoice date *</Label>
                <Input
                  id="p1-invoice-date"
                  type="date"
                  required
                  value={invoicePreviewRequest?.invoiceDate || invoicePreview.invoiceDate || ''}
                  onChange={(event) => setInvoicePreviewRequest((current) => current ? {
                    ...current,
                    invoiceDate: event.target.value,
                  } : current)}
                />
                <p className="text-xs text-muted-foreground">The Net 30 due date will be calculated from this date.</p>
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
              disabled={!invoicePreviewRequest?.invoiceDate || createInvoiceMutation.isPending}
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

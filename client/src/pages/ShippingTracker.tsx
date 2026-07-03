import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import WeeklyShipmentsOverview from './WeeklyShipmentsOverview';
import {
  Package,
  TrendingUp,
  Calendar,
  Search,
  Truck,
  CheckCircle,
  XCircle,
  ExternalLink,
  Mail,
  Send,
  History,
  MessageSquare,
  Phone,
  Pencil,
  Trash2,
  Loader2,
  Printer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  getCurrentOperationalWeek,
  formatOperationalWeekRange,
  getShippingWeekInfo,
  getOperationalWeekStart,
  getOperationalWeekEnd,
} from '@shared/weekUtils';
import { format } from 'date-fns';
import { ManualTrackingEntry } from '@/components/ManualTrackingEntry';
import CustomerDetailsTooltip from '@/components/CustomerDetailsTooltip';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Label } from '@/components/ui/label';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  status: string;
  currentDepartment?: string;
  modelId: string;
  customerId?: string;
  updatedAt: string;
  trackingNumber?: string;
  shippedDate?: string;
  customerNotified?: boolean;
  notificationSentAt?: string;
  shippingCarrier?: string;
  shippingMethod?: string;
  isRtsOrder?: boolean;
  rtsSaleId?: string;
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface WeeklyStats {
  week: number;
  year: number;
  stocksShipped: number;
  orders: string[];
}

interface NotificationHistoryItem {
  id: number;
  method: string;
  type: string;
  recipient: string;
  subject: string | null;
  message: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  externalId: string | null;
}

interface NotificationHistoryResponse {
  orderId: string;
  count: number;
  notifications: NotificationHistoryItem[];
}

function formatNotificationFailure(result: any): string {
  const details = Array.isArray(result?.details)
    ? result.details.filter(Boolean).join('; ')
    : typeof result?.details === 'string'
      ? result.details
      : '';

  return [result?.error || 'Failed to send notification', details]
    .filter(Boolean)
    .join(': ');
}

type DateRangeMode = 'week' | 'month' | 'quarter';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const QUARTER_LABELS = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];
const SHIPMENT_PAGE_SIZE = 50;

export default function ShippingTracker() {
  const { week: currentWeek, year: currentOpYear } = getCurrentOperationalWeek();
  const { toast } = useToast();

  const { data: session } = useQuery<any>({ queryKey: ['/api/auth/session'] });
  const isAdmin = session?.role === 'ADMIN' || session?.role === 'OWNER';

  const [selectedYear, setSelectedYear] = useState<number>(currentOpYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);
  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('week');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3));
  const initialSearchFromUrl = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search') || '';
  }, []);
  const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);
  const [historyOrderId, setHistoryOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editCarrier, setEditCarrier] = useState('UPS');
  const [shipmentPage, setShipmentPage] = useState(1);

  // Mutation to update tracking info
  const updateTrackingMutation = useMutation({
    mutationFn: async ({ orderId, trackingNumber, carrier }: { orderId: string; trackingNumber: string; carrier: string }) => {
      return apiRequest(`/api/shipping/tracking/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({ trackingNumber, shippingCarrier: carrier }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Tracking Updated', description: 'Tracking information has been updated successfully.' });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/fulfilled-shipped'] });
      setEditingOrder(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Update Failed', description: error.message, variant: 'destructive' });
    },
  });

  // Mutation to delete/clear tracking info
  const deleteTrackingMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/shipping/tracking/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({ trackingNumber: '', shippingCarrier: '' }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Tracking Deleted', description: 'Tracking information has been removed.' });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/fulfilled-shipped'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Delete Failed', description: error.message, variant: 'destructive' });
    },
  });

  const openEditDialog = (order: Order) => {
    setEditingOrder(order);
    setEditTrackingNumber(order.trackingNumber || '');
    setEditCarrier(order.shippingCarrier || 'UPS');
  };

  const handleUpdateTracking = () => {
    if (!editingOrder || !editTrackingNumber.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter a tracking number', variant: 'destructive' });
      return;
    }
    updateTrackingMutation.mutate({
      orderId: editingOrder.orderId,
      trackingNumber: editTrackingNumber.trim(),
      carrier: editCarrier,
    });
  };

  const handleDeleteTracking = (order: Order) => {
    if (confirm(`Are you sure you want to delete the tracking number for order ${order.orderId}?`)) {
      deleteTrackingMutation.mutate(order.orderId);
    }
  };

  const handlePrintWeek = (stat: WeeklyStats) => {
    if (!orders) return;
    const weekStart = getOperationalWeekStart(stat.week, stat.year);
    const weekEnd = getOperationalWeekEnd(stat.week, stat.year);
    const weekLabel = formatOperationalWeekRange(stat.week, stat.year);

    const weekOrders = orders
      .filter((o) => o.status === 'FULFILLED' && o.shippedDate)
      .filter((o) => {
        const d = new Date(o.shippedDate!);
        return d >= weekStart && d <= weekEnd;
      })
      .sort((a, b) => {
        if (!a.shippedDate && !b.shippedDate) return 0;
        if (!a.shippedDate) return 1;
        if (!b.shippedDate) return -1;
        return new Date(a.shippedDate).getTime() - new Date(b.shippedDate).getTime();
      });

    const rows = weekOrders.map((o) => {
      const customer = customers?.find((c) => String(c.id) === String(o.customerId));
      return `
        <tr>
          <td>${o.orderId}</td>
          <td>${customer?.name || 'Unknown'}</td>
          <td>${o.trackingNumber || '—'}</td>
          <td>${o.shippedDate ? format(new Date(o.shippedDate), 'MMM d, yyyy') : '—'}</td>
          <td>${o.shippingCarrier || '—'}</td>
          <td>${o.customerNotified ? 'Yes' : 'No'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Shipping Report — Week ${stat.week}, ${stat.year}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .subtitle { font-size: 13px; color: #555; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #1e40af; color: #fff; padding: 6px 10px; text-align: left; }
    td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) td { background: #f8fafc; }
    .footer { margin-top: 16px; font-size: 11px; color: #888; }
  </style>
</head>
<body>
  <h1>Shipping Report — Week ${stat.week}, ${stat.year}</h1>
  <div class="subtitle">${weekLabel} &nbsp;|&nbsp; ${weekOrders.length} order${weekOrders.length !== 1 ? 's' : ''} shipped</div>
  <table>
    <thead>
      <tr>
        <th>Order #</th><th>Customer</th><th>Tracking Number</th>
        <th>Shipped Date</th><th>Carrier</th><th>Notified</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Printed ${format(new Date(), 'MMM d, yyyy h:mm a')} — AG Composites EPOCH</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  // Mutation to send notification to customer
  const sendNotificationMutation = useMutation({
    mutationFn: async (orderId: string) => {
      console.log('[UI] Sending notify request for order:', orderId);
      const response = await fetch(`/api/shipping/notify-customer/${orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();
      console.log('[UI RESPONSE] status:', response.status, 'body:', result);

      if (!response.ok) {
        console.error('[NOTIFY FAIL RESULT]', result);
        throw new Error(formatNotificationFailure(result));
      }

      return result;
    },
    onSuccess: (data, orderId) => {
      console.log('[UI SUCCESS]', data);
      toast({
        title: 'Notification Sent',
        description: data.message || `Customer notified via ${data.methods?.join(' and ')}`,
      });
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/orders/fulfilled-shipped'] });
    },
    onError: (error: Error, orderId) => {
      console.error('[UI ERROR] Failed notification for order:', orderId, error);
      toast({
        title: 'Failed to Send Notification',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fetch fulfilled + shipped orders from dedicated endpoint
  // This endpoint sorts by shippedDate DESC and applies a generous row limit,
  // so recent shipments are always included regardless of order creation date.
  const { data: orders, isLoading, isError: ordersError } = useQuery<Order[]>({
    queryKey: ['/api/orders/fulfilled-shipped'],
    retry: 2,
    refetchInterval: 30000,
  });

  // Fetch customers for name search
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch notification history when an order is selected
  const { data: notificationHistory, isLoading: historyLoading, isError: historyError } = useQuery<NotificationHistoryResponse>({
    queryKey: ['/api/communications/order', historyOrderId, 'history'],
    queryFn: async () => {
      const response = await fetch(`/api/communications/order/${historyOrderId}/history`);
      if (!response.ok) throw new Error('Failed to fetch notification history');
      return response.json();
    },
    enabled: !!historyOrderId,
    retry: 1,
  });

  const getDateRangeForMode = useMemo(() => {
    if (dateRangeMode === 'month') {
      const start = startOfMonth(new Date(selectedYear, selectedMonth));
      const end = endOfMonth(new Date(selectedYear, selectedMonth));
      return { start, end };
    }
    if (dateRangeMode === 'quarter') {
      const quarterStartMonth = selectedQuarter * 3;
      const start = startOfQuarter(new Date(selectedYear, quarterStartMonth));
      const end = endOfQuarter(new Date(selectedYear, quarterStartMonth));
      return { start, end };
    }
    if (dateRangeMode === 'week') {
      const start = getOperationalWeekStart(selectedWeek, selectedYear);
      const end = getOperationalWeekEnd(selectedWeek, selectedYear);
      return { start, end };
    }
    return null;
  }, [dateRangeMode, selectedYear, selectedMonth, selectedQuarter, selectedWeek]);

  // Filter orders by search term (order number or customer name) and date range
  // Note: status === 'FULFILLED' filter is not needed here; the endpoint already guarantees it.
  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    let filtered = orders;

    if (isAdmin && dateRangeMode !== 'week' && getDateRangeForMode && !searchTerm) {
      const { start, end } = getDateRangeForMode;
      filtered = filtered.filter((order) => {
        const shippedDate = order.shippedDate ? new Date(order.shippedDate) : null;
        if (!shippedDate) return false;
        return shippedDate >= start && shippedDate <= end;
      });
    }
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((order) => {
        if (order.orderId.toLowerCase().includes(searchLower)) return true;

        if (order.trackingNumber && order.trackingNumber.toLowerCase().includes(searchLower)) return true;

        if (order.customerId && customers) {
          const customer = customers.find(
            (c) => String(c.id) === String(order.customerId)
          );
          if (customer && customer.name.toLowerCase().includes(searchLower))
            return true;
        }

        return false;
      });
    }

    return filtered.sort((a, b) => {
      if (!a.shippedDate && !b.shippedDate) return 0;
      if (!a.shippedDate) return 1;
      if (!b.shippedDate) return -1;
      
      return new Date(b.shippedDate).getTime() - new Date(a.shippedDate).getTime();
    });
  }, [orders, searchTerm, customers, isAdmin, dateRangeMode, getDateRangeForMode]);

  useEffect(() => {
    setShipmentPage(1);
  }, [searchTerm, dateRangeMode, selectedYear, selectedWeek, selectedMonth, selectedQuarter]);

  const shipmentTotalPages = Math.max(1, Math.ceil(filteredOrders.length / SHIPMENT_PAGE_SIZE));
  const currentShipmentPage = Math.min(shipmentPage, shipmentTotalPages);
  const shipmentStartIndex = (currentShipmentPage - 1) * SHIPMENT_PAGE_SIZE;
  const paginatedShipmentOrders = filteredOrders.slice(
    shipmentStartIndex,
    shipmentStartIndex + SHIPMENT_PAGE_SIZE
  );

  // Group orders by tracking number to identify consolidated shipments
  const trackingGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    
    filteredOrders.forEach((order) => {
      if (order.trackingNumber) {
        const existing = groups.get(order.trackingNumber) || [];
        existing.push(order.orderId);
        groups.set(order.trackingNumber, existing);
      }
    });
    
    return groups;
  }, [filteredOrders]);

  // Check if an order is part of a consolidated shipment
  const isConsolidated = (trackingNumber: string) => {
    if (!trackingNumber) return false;
    const group = trackingGroups.get(trackingNumber);
    return group && group.length > 1;
  };

  // Get consolidated order IDs for a tracking number
  const getConsolidatedOrders = (trackingNumber: string) => {
    return trackingGroups.get(trackingNumber) || [];
  };

  // Calculate weekly stats using operational weeks
  const weeklyStats: WeeklyStats[] = [];

  if (orders) {
    // Group fulfilled orders by operational week (direct computation, no loop)
    const weekMap = new Map<
      string,
      { stocksShipped: number; orders: string[] }
    >();

    orders
      .filter((order) => order.status === 'FULFILLED' && order.shippedDate)
      .forEach((order) => {
        // Only use orders with an actual shipped date — never fall back to updatedAt
        const fulfillmentDate = new Date(order.shippedDate!);
        
        // Directly compute operational week and year (no looping)
        const weekInfo = getShippingWeekInfo(fulfillmentDate);
        const key = `${weekInfo.operationalYear}-W${weekInfo.operationalWeek}`;

        if (!weekMap.has(key)) {
          weekMap.set(key, { stocksShipped: 0, orders: [] });
        }

        const stats = weekMap.get(key)!;
        stats.stocksShipped += 1;
        stats.orders.push(order.orderId);
      });

    // Convert to array and sort by week descending
    weekMap.forEach((stats, key) => {
      const [yearStr, weekStr] = key.split('-W');
      weeklyStats.push({
        week: parseInt(weekStr),
        year: parseInt(yearStr),
        stocksShipped: stats.stocksShipped,
        orders: stats.orders,
      });
    });

    weeklyStats.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.week - a.week;
    });
  }

  // Get stats for selected week
  const selectedWeekStats = weeklyStats.find(
    (s) => s.week === selectedWeek && s.year === selectedYear
  ) || { week: selectedWeek, year: selectedYear, stocksShipped: 0, orders: [] };

  // Generate year options (current operational year and 2 previous years)
  const yearOptions = [currentOpYear, currentOpYear - 1, currentOpYear - 2];

  // Generate week options (1-52)
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="h-6 w-6" />
          Shipping Tracker
        </h1>
        <p className="text-gray-600 mt-1">
          Track stocks shipped by company week (Wednesday - Tuesday)
        </p>
      </div>

      {ordersError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Failed to load shipment data</p>
            <p className="text-sm text-red-600 mt-0.5">
              The server could not load fulfilled/shipped orders. Check your connection and try refreshing.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="shipping-tracker" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="shipping-tracker">Shipping Tracker</TabsTrigger>
          <TabsTrigger value="weekly-shipments">Weekly Shipments</TabsTrigger>
        </TabsList>

        <TabsContent value="shipping-tracker">
        <div>

      {/* Current Week Summary Card */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Current Week Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">Current Week</div>
              <div className="text-2xl font-bold text-blue-600">
                Week {currentWeek}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {formatOperationalWeekRange(currentWeek, currentOpYear)}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">
                Stocks Shipped This Week
              </div>
              <div className="text-2xl font-bold text-green-600">
                {weeklyStats.find(
                  (s) => s.week === currentWeek && s.year === currentOpYear
                )?.stocksShipped || 0}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Specific Period */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            {dateRangeMode === 'week' ? 'View Specific Week' : dateRangeMode === 'month' ? 'View by Month' : 'View by Quarter'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            {isAdmin && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">
                  View by:
                </label>
                <Select
                  value={dateRangeMode}
                  onValueChange={(v) => setDateRangeMode(v as DateRangeMode)}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Week</SelectItem>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="quarter">Quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">
                Year:
              </label>
              <Select
                value={selectedYear.toString()}
                onValueChange={(v) => setSelectedYear(parseInt(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {dateRangeMode === 'week' && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">
                  Week:
                </label>
                <Select
                  value={selectedWeek.toString()}
                  onValueChange={(v) => setSelectedWeek(parseInt(v))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {weekOptions.map((week) => (
                      <SelectItem key={week} value={week.toString()}>
                        Week {week}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dateRangeMode === 'month' && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">
                  Month:
                </label>
                <Select
                  value={selectedMonth.toString()}
                  onValueChange={(v) => setSelectedMonth(parseInt(v))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dateRangeMode === 'quarter' && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium whitespace-nowrap">
                  Quarter:
                </label>
                <Select
                  value={selectedQuarter.toString()}
                  onValueChange={(v) => setSelectedQuarter(parseInt(v))}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUARTER_LABELS.map((label, i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {dateRangeMode === 'week' && (
              <div className="text-sm text-gray-600">
                {formatOperationalWeekRange(selectedWeek, selectedYear)}
              </div>
            )}
            {dateRangeMode === 'month' && (
              <div className="text-sm text-gray-600">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </div>
            )}
            {dateRangeMode === 'quarter' && (
              <div className="text-sm text-gray-600">
                {QUARTER_LABELS[selectedQuarter]} {selectedYear}
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Stocks Shipped</div>
                <div className="text-3xl font-bold text-blue-600">
                  {dateRangeMode === 'week'
                    ? selectedWeekStats.stocksShipped
                    : filteredOrders.length}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Orders</div>
                <div className="text-xl font-semibold text-gray-700">
                  {dateRangeMode === 'week'
                    ? selectedWeekStats.orders.length
                    : filteredOrders.length}
                </div>
              </div>
            </div>
            {dateRangeMode === 'week' && selectedWeekStats.orders.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-600 mb-2">Order IDs:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedWeekStats.orders.map((orderId) => (
                    <span
                      key={orderId}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                    >
                      {orderId}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {dateRangeMode !== 'week' && filteredOrders.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-600 mb-2">Order IDs ({filteredOrders.length}):</div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {filteredOrders.map((order) => (
                    <span
                      key={order.orderId}
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                    >
                      {order.orderId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Accordion Section for All Weeks and Shipping Details */}
      <Accordion
        type="multiple"
        className="space-y-4"
        defaultValue={['shipping-details']}
      >
        {/* All Weeks Accordion — shown first */}
        <AccordionItem value="all-weeks" className="border rounded-lg">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span className="font-semibold">All Weeks</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">
                Loading shipping data...
              </div>
            ) : weeklyStats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No fulfilled orders found
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Stocks Shipped</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="w-24">Print</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyStats.map((stat) => (
                    <TableRow
                      key={`${stat.year}-W${stat.week}`}
                      className={
                        stat.week === currentWeek && stat.year === currentOpYear
                          ? 'bg-blue-50'
                          : ''
                      }
                    >
                      <TableCell className="font-medium">
                        Week {stat.week}, {stat.year}
                        {stat.week === currentWeek &&
                          stat.year === currentOpYear && (
                            <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                              Current
                            </span>
                          )}
                      </TableCell>
                      <TableCell>
                        {formatOperationalWeekRange(stat.week, stat.year)}
                      </TableCell>
                      <TableCell>
                        <span className="text-lg font-semibold text-blue-600">
                          {stat.stocksShipped}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {stat.orders.join(', ')}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1"
                          onClick={() => handlePrintWeek(stat)}
                        >
                          <Printer className="h-3 w-3" />
                          <span className="text-xs">Print</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Shipping Details Accordion */}
        <AccordionItem value="shipping-details" className="border rounded-lg">
          <AccordionTrigger className="px-6 hover:no-underline">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              <span className="font-semibold">Shipping Details</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            {/* Search Input */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by order number, customer name, or tracking number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-shipping"
                />
              </div>
              {searchTerm && (
                <p className="text-sm text-gray-600 mt-2">
                  Found {filteredOrders.length} order
                  {filteredOrders.length !== 1 ? 's' : ''}
                </p>
              )}
              {isAdmin && dateRangeMode !== 'week' && !searchTerm && (
                <p className="text-sm text-blue-600 mt-2 font-medium">
                  Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} shipped in{' '}
                  {dateRangeMode === 'month'
                    ? `${MONTH_NAMES[selectedMonth]} ${selectedYear}`
                    : `${QUARTER_LABELS[selectedQuarter]} ${selectedYear}`}
                </p>
              )}
            </div>

            {/* Detailed Shipping Table */}
            {filteredOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Tracking Number</TableHead>
                      <TableHead>Shipped Date</TableHead>
                      <TableHead>Carrier</TableHead>
                      <TableHead>Customer Notified</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedShipmentOrders.map((order) => {
                      const customer = customers?.find(
                        (c) => String(c.id) === String(order.customerId)
                      );
                      const consolidated = order.trackingNumber && isConsolidated(order.trackingNumber);
                      const consolidatedOrders = order.trackingNumber ? getConsolidatedOrders(order.trackingNumber) : [];
                      
                      return (
                        <TableRow
                          key={order.id}
                          data-testid={`row-shipment-${order.orderId}`}
                          className={consolidated ? 'bg-amber-50 hover:bg-amber-100' : ''}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {order.orderId}
                              {order.isRtsOrder && (
                                <Badge 
                                  variant="secondary" 
                                  className="bg-blue-100 text-blue-800 text-xs"
                                  data-testid={`badge-rts-${order.orderId}`}
                                >
                                  RTS
                                </Badge>
                              )}
                              {consolidated && (
                                <Badge 
                                  variant="secondary" 
                                  className="bg-amber-200 text-amber-800 text-xs"
                                  data-testid={`badge-consolidated-${order.orderId}`}
                                >
                                  <Package className="h-3 w-3 mr-1" />
                                  Consolidated
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {order.customerId ? (
                              <CustomerDetailsTooltip
                                customerId={order.customerId}
                                customerName={customer?.name || 'Unknown Customer'}
                              >
                                <span 
                                  className="cursor-pointer hover:text-blue-600 hover:underline"
                                  data-testid={`customer-name-${order.orderId}`}
                                >
                                  {customer?.name || 'Unknown Customer'}
                                </span>
                              </CustomerDetailsTooltip>
                            ) : (
                              <span className="text-gray-500">Unknown Customer</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {order.trackingNumber ? (
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm">
                                    {order.trackingNumber}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2"
                                    onClick={() =>
                                      window.open(
                                        `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(order.trackingNumber || '')}`,
                                        '_blank',
                                        'noopener,noreferrer'
                                      )
                                    }
                                    data-testid={`button-track-${order.orderId}`}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Track
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={() => openEditDialog(order)}
                                    data-testid={`button-edit-tracking-${order.orderId}`}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-red-600 hover:text-red-700"
                                    onClick={() => handleDeleteTracking(order)}
                                    disabled={deleteTrackingMutation.isPending}
                                    data-testid={`button-delete-tracking-${order.orderId}`}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                {consolidated && (
                                  <div className="text-xs text-amber-700">
                                    Shipped with: {consolidatedOrders.filter(id => id !== order.orderId).join(', ')}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {order.shippedDate ? (
                              format(new Date(order.shippedDate), 'MMM d, yyyy')
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {order.shippingCarrier ? (
                              <Badge variant="outline">
                                {order.shippingCarrier}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {order.customerNotified ? (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="h-4 w-4" />
                                  <span className="text-xs">
                                    {order.notificationSentAt &&
                                      format(
                                        new Date(order.notificationSentAt),
                                        'MMM d'
                                      )}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 text-gray-400">
                                  <XCircle className="h-4 w-4" />
                                  <span className="text-xs">No</span>
                                </div>
                              )}
                              {order.trackingNumber && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2"
                                    onClick={() => sendNotificationMutation.mutate(order.orderId)}
                                    disabled={sendNotificationMutation.isPending}
                                    data-testid={`button-notify-${order.orderId}`}
                                  >
                                    {sendNotificationMutation.isPending ? (
                                      <span className="text-xs">Sending...</span>
                                    ) : (
                                      <>
                                        <Send className="h-3 w-3 mr-1" />
                                        <span className="text-xs">Notify</span>
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={() => setHistoryOrderId(order.orderId)}
                                    data-testid={`button-history-${order.orderId}`}
                                  >
                                    <History className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ManualTrackingEntry orderId={order.orderId} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredOrders.length > SHIPMENT_PAGE_SIZE && (
                  <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600 text-center sm:text-left">
                      Showing {shipmentStartIndex + 1}-
                      {Math.min(shipmentStartIndex + SHIPMENT_PAGE_SIZE, filteredOrders.length)} of{' '}
                      {filteredOrders.length} shipments
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShipmentPage((page) => Math.max(1, page - 1))}
                        disabled={currentShipmentPage === 1}
                        data-testid="button-shipping-previous-page"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <span className="text-sm text-gray-600 min-w-24 text-center">
                        Page {currentShipmentPage} of {shipmentTotalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShipmentPage((page) => Math.min(shipmentTotalPages, page + 1))}
                        disabled={currentShipmentPage === shipmentTotalPages}
                        data-testid="button-shipping-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : searchTerm ? (
              <div className="text-center py-8 text-gray-500">
                No orders found matching "{searchTerm}"
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Enter a search term to view detailed shipping information
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Notification History Dialog */}
      <Dialog open={!!historyOrderId} onOpenChange={(open) => !open && setHistoryOrderId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Notification History - Order {historyOrderId}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[500px]">
            {historyLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : historyError ? (
              <div className="text-center py-8 text-red-500">
                <XCircle className="h-12 w-12 mx-auto text-red-300 mb-2" />
                <p>Failed to load notification history.</p>
                <p className="text-sm text-gray-500 mt-1">Please try again later.</p>
              </div>
            ) : !notificationHistory?.notifications?.length ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p>No notifications have been sent for this order yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500 mb-4">
                  {notificationHistory.count} notification(s) sent
                </p>
                {notificationHistory.notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="border rounded-lg p-4 bg-gray-50"
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {notification.method === 'email' ? (
                          <Mail className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Phone className="h-4 w-4 text-green-600" />
                        )}
                        <Badge variant={notification.status === 'sent' ? 'default' : 'destructive'}>
                          {notification.status}
                        </Badge>
                        <Badge variant="outline">{notification.method}</Badge>
                      </div>
                      <span className="text-xs text-gray-500">
                        {notification.sentAt
                          ? format(new Date(notification.sentAt), 'MMM d, yyyy h:mm a')
                          : 'Unknown'}
                      </span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="font-medium">To:</span> {notification.recipient}
                      </p>
                      {notification.subject && (
                        <p>
                          <span className="font-medium">Subject:</span> {notification.subject}
                        </p>
                      )}
                      {notification.message && (
                        <p className="text-gray-600 text-xs mt-2 bg-white p-2 rounded border">
                          {notification.message}
                        </p>
                      )}
                      {notification.error && (
                        <p className="text-red-600 text-xs mt-2">
                          <span className="font-medium">Error:</span> {notification.error}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Tracking Dialog */}
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Tracking Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-gray-600 mb-2">Order: <span className="font-medium">{editingOrder?.orderId}</span></p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-tracking-number">Tracking Number</Label>
              <Input
                id="edit-tracking-number"
                value={editTrackingNumber}
                onChange={(e) => setEditTrackingNumber(e.target.value)}
                placeholder="Enter tracking number"
                data-testid="input-edit-tracking-number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-carrier">Carrier</Label>
              <Select value={editCarrier} onValueChange={setEditCarrier}>
                <SelectTrigger id="edit-carrier" data-testid="select-edit-carrier">
                  <SelectValue placeholder="Select carrier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UPS">UPS</SelectItem>
                  <SelectItem value="USPS">USPS</SelectItem>
                  <SelectItem value="FedEx">FedEx</SelectItem>
                  <SelectItem value="DHL">DHL</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingOrder(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTracking}
              disabled={updateTrackingMutation.isPending}
              data-testid="button-save-tracking"
            >
              {updateTrackingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        </div>
        </TabsContent>

        <TabsContent value="weekly-shipments">
          <WeeklyShipmentsOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

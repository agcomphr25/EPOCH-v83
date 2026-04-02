import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Package,
  Calendar,
  TrendingUp,
  Search,
  Truck,
  Factory,
  Layers,
  ExternalLink,
  Plus,
  X,
  PenLine,
} from 'lucide-react';
import {
  getCurrentOperationalWeek,
  formatOperationalWeekRange,
  getOperationalWeekStart,
  getOperationalWeekEnd,
} from '@shared/weekUtils';
import { format } from 'date-fns';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

interface P1Order {
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
  shippingCarrier?: string;
  isRtsOrder?: boolean;
}

interface Customer {
  id: string;
  name: string;
}

interface OEMShipmentItem {
  id: number;
  poItemId: number;
  orderId: string;
  quantity: number;
  description: string;
  poNumber: string;
  hasPackingSlip: boolean;
  itemType?: string;
}

interface OEMShipment {
  id: number;
  customer_id: number;
  customer_name: string;
  master_tracking_number: string;
  service_code: string;
  total_weight_lbs: number;
  package_count: number;
  created_at: string;
  created_by: string;
  item_count: number;
  po_count: number;
  items: OEMShipmentItem[];
}

interface UnifiedShipment {
  id: string;
  type: 'P1' | 'OEM' | 'Ad Hoc';
  orderId: string;
  modelOrDescription: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  shippedDate: Date;
  itemCount: number;
}

type AdHocOrderEntry = {
  type: 'order';
  orderId: string;
  addedAt: string;
};

type AdHocBulkEntry = {
  type: 'bulk';
  id: string;
  quantity: number;
  note?: string;
  addedAt: string;
};

type AdHocEntry = AdHocOrderEntry | AdHocBulkEntry;

function getAdHocStorageKey(week: number, year: number): string {
  return `epoch-adhoc-shipments-${year}-W${week}`;
}

function loadAdHocEntries(week: number, year: number): AdHocEntry[] {
  try {
    const raw = localStorage.getItem(getAdHocStorageKey(week, year));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: AdHocEntry[] = [];
    for (const e of parsed) {
      if (typeof e !== 'object' || e === null) continue;
      if (typeof e.addedAt !== 'string') continue;
      if (e.type === 'bulk') {
        if (typeof e.id === 'string' && typeof e.quantity === 'number') {
          result.push({
            type: 'bulk',
            id: e.id,
            quantity: e.quantity,
            note: typeof e.note === 'string' ? e.note : undefined,
            addedAt: e.addedAt,
          });
        }
      } else {
        if (typeof e.orderId === 'string') {
          result.push({
            type: 'order',
            orderId: e.orderId,
            addedAt: e.addedAt,
          });
        }
      }
    }
    return result;
  } catch {
    return [];
  }
}

function saveAdHocEntries(week: number, year: number, entries: AdHocEntry[]) {
  localStorage.setItem(getAdHocStorageKey(week, year), JSON.stringify(entries));
}

export default function WeeklyShipmentsOverview() {
  const { week: currentWeek, year: currentOpYear } = getCurrentOperationalWeek();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState<number>(currentOpYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [adHocEntries, setAdHocEntries] = useState<AdHocEntry[]>([]);
  const [adHocInputMode, setAdHocInputMode] = useState<'order' | 'bulk'>('order');
  const [adHocInput, setAdHocInput] = useState('');
  const [bulkQuantity, setBulkQuantity] = useState('');
  const [bulkNote, setBulkNote] = useState('');

  useEffect(() => {
    setAdHocEntries(loadAdHocEntries(selectedWeek, selectedYear));
  }, [selectedWeek, selectedYear]);

  const addAdHocOrders = useCallback(() => {
    const raw = adHocInput.trim();
    if (!raw) return;

    const newIds = raw
      .split(/[\s,;]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (newIds.length === 0) return;

    const existingOrderIds = new Set(
      adHocEntries.filter((e): e is AdHocOrderEntry => e.type === 'order').map((e) => e.orderId)
    );
    const added: string[] = [];
    const skipped: string[] = [];

    const now = new Date().toISOString();
    const updatedEntries = [...adHocEntries];

    newIds.forEach((id) => {
      if (existingOrderIds.has(id)) {
        skipped.push(id);
      } else {
        existingOrderIds.add(id);
        updatedEntries.push({ type: 'order', orderId: id, addedAt: now });
        added.push(id);
      }
    });

    setAdHocEntries(updatedEntries);
    saveAdHocEntries(selectedWeek, selectedYear, updatedEntries);
    setAdHocInput('');

    if (added.length > 0) {
      toast({
        title: `Added ${added.length} order${added.length > 1 ? 's' : ''}`,
        description: added.join(', ') + (skipped.length > 0 ? ` (${skipped.length} already existed)` : ''),
      });
    } else if (skipped.length > 0) {
      toast({
        title: 'Already added',
        description: `${skipped.join(', ')} already in ad hoc list`,
      });
    }
  }, [adHocInput, adHocEntries, selectedWeek, selectedYear, toast]);

  const addBulkEntry = useCallback(() => {
    const qty = parseInt(bulkQuantity, 10);
    if (isNaN(qty) || qty === 0) {
      toast({ title: 'Invalid quantity', description: 'Please enter a non-zero number.' });
      return;
    }
    const now = new Date().toISOString();
    const newEntry: AdHocBulkEntry = {
      type: 'bulk',
      id: `bulk-${Date.now()}`,
      quantity: qty,
      note: bulkNote.trim() || undefined,
      addedAt: now,
    };
    const updated = [...adHocEntries, newEntry];
    setAdHocEntries(updated);
    saveAdHocEntries(selectedWeek, selectedYear, updated);
    setBulkQuantity('');
    setBulkNote('');
    toast({
      title: `Added bulk entry`,
      description: `${qty} unit${Math.abs(qty) !== 1 ? 's' : ''}${newEntry.note ? ` — ${newEntry.note}` : ''}`,
    });
  }, [bulkQuantity, bulkNote, adHocEntries, selectedWeek, selectedYear, toast]);

  const removeAdHocEntry = useCallback(
    (entryId: string) => {
      const updated = adHocEntries.filter((e) => {
        if (e.type === 'order') return e.orderId !== entryId;
        return e.id !== entryId;
      });
      setAdHocEntries(updated);
      saveAdHocEntries(selectedWeek, selectedYear, updated);
    },
    [adHocEntries, selectedWeek, selectedYear]
  );

  const clearAllAdHoc = useCallback(() => {
    setAdHocEntries([]);
    saveAdHocEntries(selectedWeek, selectedYear, []);
    toast({ title: 'Cleared', description: 'All ad hoc entries removed for this week' });
  }, [selectedWeek, selectedYear, toast]);

  const { data: orders, isLoading: ordersLoading, isError: ordersError } = useQuery<P1Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: async () => {
      const response = await fetch('/api/orders/with-payment-status');
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const weekStart = getOperationalWeekStart(selectedWeek, selectedYear);
  const weekEnd = getOperationalWeekEnd(selectedWeek, selectedYear);

  const endDateForQuery = format(weekEnd, 'yyyy-MM-dd') + 'T23:59:59';

  const { data: oemData, isLoading: oemLoading, isError: oemError } = useQuery<{
    shipments: OEMShipment[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
  }>({
    queryKey: [
      '/api/po-orders/oem-shipments',
      {
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: endDateForQuery,
        limit: 200,
        offset: 0,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('startDate', format(weekStart, 'yyyy-MM-dd'));
      params.append('endDate', endDateForQuery);
      params.append('limit', '200');
      params.append('offset', '0');
      const response = await fetch(
        `/api/po-orders/oem-shipments?${params.toString()}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch OEM shipments');
      return response.json();
    },
  });

  const SERVICE_NAMES: Record<string, string> = {
    '03': 'UPS Ground',
    '02': 'UPS 2nd Day Air',
    '01': 'UPS Next Day Air',
    '12': 'UPS 3 Day Select',
    '13': 'UPS Next Day Air Saver',
    '14': 'UPS Next Day Air Early',
    '59': 'UPS 2nd Day Air A.M.',
  };

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (customers) {
      customers.forEach((c) => map.set(String(c.id), c.name));
    }
    return map;
  }, [customers]);

  const adHocShipments: UnifiedShipment[] = useMemo(() => {
    return adHocEntries.map((entry) => {
      if (entry.type === 'bulk') {
        return {
          id: `adhoc-bulk-${entry.id}`,
          type: 'Ad Hoc' as const,
          orderId: '',
          modelOrDescription: entry.note || 'Bulk shipment',
          customerName: '—',
          trackingNumber: '',
          carrier: '',
          shippedDate: new Date(entry.addedAt),
          itemCount: entry.quantity,
        };
      }
      return {
        id: `adhoc-${entry.orderId}`,
        type: 'Ad Hoc' as const,
        orderId: entry.orderId,
        modelOrDescription: 'Manually added',
        customerName: '—',
        trackingNumber: '',
        carrier: '',
        shippedDate: new Date(entry.addedAt),
        itemCount: 1,
      };
    });
  }, [adHocEntries]);

  const unifiedShipments = useMemo(() => {
    const items: UnifiedShipment[] = [];

    if (orders) {
      const fulfilled = orders.filter((o) => o.status === 'FULFILLED');
      fulfilled.forEach((order) => {
        const shipDate = new Date(order.shippedDate || order.updatedAt);
        if (shipDate >= weekStart && shipDate <= weekEnd) {
          items.push({
            id: `p1-${order.orderId}`,
            type: 'P1',
            orderId: order.orderId,
            modelOrDescription: order.modelId || 'N/A',
            customerName: order.customerId
              ? customerMap.get(String(order.customerId)) || 'Unknown'
              : 'Unknown',
            trackingNumber: order.trackingNumber || '',
            carrier: order.shippingCarrier || '',
            shippedDate: shipDate,
            itemCount: 1,
          });
        }
      });
    }

    if (oemData?.shipments) {
      oemData.shipments.forEach((shipment) => {
        const shipDate = new Date(shipment.created_at);
        shipment.items
          .filter((item) => !item.itemType || item.itemType === 'stock_model')
          .forEach((item) => {
            items.push({
              id: `oem-${shipment.id}-${item.id}`,
              type: 'OEM',
              orderId: item.orderId,
              modelOrDescription: item.description || `PO# ${item.poNumber}`,
              customerName: shipment.customer_name,
              trackingNumber: shipment.master_tracking_number || '',
              carrier: SERVICE_NAMES[shipment.service_code] || shipment.service_code || 'UPS',
              shippedDate: shipDate,
              itemCount: item.quantity,
            });
          });
      });
    }

    items.push(...adHocShipments);

    items.sort((a, b) => b.shippedDate.getTime() - a.shippedDate.getTime());
    return items;
  }, [orders, oemData, weekStart, weekEnd, customerMap, adHocShipments]);

  const filteredShipments = useMemo(() => {
    let filtered = unifiedShipments;

    if (activeTab === 'p1') {
      filtered = filtered.filter((s) => s.type === 'P1');
    } else if (activeTab === 'oem') {
      filtered = filtered.filter((s) => s.type === 'OEM');
    } else if (activeTab === 'adhoc') {
      filtered = filtered.filter((s) => s.type === 'Ad Hoc');
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.orderId.toLowerCase().includes(lower) ||
          s.customerName.toLowerCase().includes(lower) ||
          s.trackingNumber.toLowerCase().includes(lower) ||
          s.modelOrDescription.toLowerCase().includes(lower)
      );
    }

    return filtered;
  }, [unifiedShipments, activeTab, searchTerm]);

  const p1Count = unifiedShipments.filter((s) => s.type === 'P1').length;
  const oemCount = unifiedShipments.filter((s) => s.type === 'OEM').length;
  const adHocCount = adHocShipments.reduce((sum, s) => sum + s.itemCount, 0);
  const totalItems = unifiedShipments.reduce((sum, s) => sum + s.itemCount, 0);

  const uniqueTrackingNumbers = new Set(
    unifiedShipments.filter((s) => s.trackingNumber).map((s) => s.trackingNumber)
  ).size;

  const yearOptions = [currentOpYear, currentOpYear - 1, currentOpYear - 2];
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  const isLoading = ordersLoading || oemLoading;
  const hasError = ordersError || oemError;

  const renderShipmentTable = (shipments: UnifiedShipment[]) => (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Order ID</TableHead>
            <TableHead>Model / Description</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Tracking #</TableHead>
            <TableHead>Carrier</TableHead>
            <TableHead>Shipped Date</TableHead>
            <TableHead className="text-right">Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shipments.map((shipment) => (
            <TableRow key={shipment.id}>
              <TableCell>
                <Badge
                  variant={shipment.type === 'P1' ? 'default' : 'secondary'}
                  className={
                    shipment.type === 'P1'
                      ? 'bg-green-100 text-green-800 hover:bg-green-100'
                      : shipment.type === 'OEM'
                        ? 'bg-purple-100 text-purple-800 hover:bg-purple-100'
                        : 'bg-amber-100 text-amber-800 hover:bg-amber-100'
                  }
                >
                  {shipment.type}
                </Badge>
              </TableCell>
              <TableCell className="font-mono font-medium">
                {shipment.orderId}
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {shipment.modelOrDescription}
              </TableCell>
              <TableCell>{shipment.customerName}</TableCell>
              <TableCell className="font-mono text-xs">
                {shipment.trackingNumber || (
                  <span className="text-gray-400 italic">No tracking</span>
                )}
              </TableCell>
              <TableCell>{shipment.carrier || '—'}</TableCell>
              <TableCell>
                {format(shipment.shippedDate, 'MMM d, yyyy')}
              </TableCell>
              <TableCell className="text-right font-medium">
                {shipment.itemCount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Layers className="h-6 w-6" />
          Weekly Shipments Overview
        </h1>
        <p className="text-gray-600 mt-1">
          Combined view of all P1 and OEM stocks shipped by operational week (Wednesday - Tuesday)
        </p>
      </div>

      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Week Selection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Year:</label>
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
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Week:</label>
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
            <div className="text-sm text-gray-600 font-medium">
              {formatOperationalWeekRange(selectedWeek, selectedYear)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600">Total Stocks Shipped</div>
            <div className="text-3xl font-bold text-blue-600">{totalItems}</div>
            <div className="text-xs text-gray-500 mt-1">
              {unifiedShipments.length} line items
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600 flex items-center gap-1">
              <Truck className="h-3 w-3" /> P1 Orders
            </div>
            <div className="text-3xl font-bold text-green-600">{p1Count}</div>
            <div className="text-xs text-gray-500 mt-1">Standard shipments</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600 flex items-center gap-1">
              <Factory className="h-3 w-3" /> OEM Items
            </div>
            <div className="text-3xl font-bold text-purple-600">{oemCount}</div>
            <div className="text-xs text-gray-500 mt-1">PO shipments</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600 flex items-center gap-1">
              <PenLine className="h-3 w-3" /> Ad Hoc
            </div>
            <div className="text-3xl font-bold text-amber-600">{adHocCount}</div>
            <div className="text-xs text-gray-500 mt-1">Manually added</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-gray-600 flex items-center gap-1">
              <Package className="h-3 w-3" /> Packages
            </div>
            <div className="text-3xl font-bold text-orange-600">{uniqueTrackingNumbers}</div>
            <div className="text-xs text-gray-500 mt-1">Unique tracking #s</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Shipment Details — Week {selectedWeek}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search orders, customers, tracking..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <Link href="/shipping-tracker">
                <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 gap-1">
                  <ExternalLink className="h-3 w-3" /> Shipping Tracker
                </Badge>
              </Link>
              <Link href="/oem-shipments">
                <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 gap-1">
                  <ExternalLink className="h-3 w-3" /> OEM Shipments
                </Badge>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">
                All ({p1Count + oemCount + adHocCount})
              </TabsTrigger>
              <TabsTrigger value="p1">
                P1 Orders ({p1Count})
              </TabsTrigger>
              <TabsTrigger value="oem">
                OEM ({oemCount})
              </TabsTrigger>
              <TabsTrigger value="adhoc">
                Ad Hoc ({adHocCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="adhoc" className="mt-4">
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <PenLine className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    Manually add shipments that should count toward this week
                  </span>
                </div>
                <div className="flex gap-1 mb-3 bg-amber-100 rounded-md p-1 w-fit">
                  <button
                    onClick={() => setAdHocInputMode('order')}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      adHocInputMode === 'order'
                        ? 'bg-white text-amber-900 shadow-sm'
                        : 'text-amber-700 hover:text-amber-900'
                    }`}
                  >
                    By Order #
                  </button>
                  <button
                    onClick={() => setAdHocInputMode('bulk')}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                      adHocInputMode === 'bulk'
                        ? 'bg-white text-amber-900 shadow-sm'
                        : 'text-amber-700 hover:text-amber-900'
                    }`}
                  >
                    By Quantity
                  </button>
                </div>

                {adHocInputMode === 'order' ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter order #s separated by commas or spaces (e.g. AG100, AG101, AG102)"
                      value={adHocInput}
                      onChange={(e) => setAdHocInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addAdHocOrders();
                      }}
                      className="flex-1 bg-white"
                    />
                    <Button onClick={addAdHocOrders} size="sm" className="gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Quantity (e.g. 12)"
                      value={bulkQuantity}
                      onChange={(e) => setBulkQuantity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addBulkEntry();
                      }}
                      className="w-36 bg-white"
                    />
                    <Input
                      placeholder="Note (optional)"
                      value={bulkNote}
                      onChange={(e) => setBulkNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addBulkEntry();
                      }}
                      className="flex-1 bg-white"
                    />
                    <Button onClick={addBulkEntry} size="sm" className="gap-1">
                      <Plus className="h-4 w-4" /> Add
                    </Button>
                  </div>
                )}
              </div>

              {adHocEntries.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <PenLine className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium">No ad hoc entries</p>
                  <p className="text-sm mt-1">
                    Add order numbers or bulk quantities above to manually include them in this week's count
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">
                      {adHocEntries.length} {adHocEntries.length !== 1 ? 'entries' : 'entry'} manually added for Week {selectedWeek}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllAdHoc}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                    >
                      <X className="h-3 w-3" /> Clear All
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {adHocEntries.map((entry) => {
                      const timeAdded = format(new Date(entry.addedAt), 'MMM d, h:mm a');
                      if (entry.type === 'bulk') {
                        return (
                          <Badge
                            key={entry.id}
                            variant="secondary"
                            className="bg-blue-100 text-blue-800 hover:bg-blue-200 gap-1 pl-3 pr-1 py-1.5 text-sm"
                          >
                            <span className="font-medium">Bulk · {entry.quantity} units</span>
                            {entry.note && (
                              <span className="text-blue-600 ml-1">— {entry.note}</span>
                            )}
                            <span className="text-blue-500 ml-1 text-xs">· {timeAdded}</span>
                            <button
                              onClick={() => removeAdHocEntry(entry.id)}
                              className="ml-1 rounded-full hover:bg-blue-300 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      }
                      return (
                        <Badge
                          key={entry.orderId}
                          variant="secondary"
                          className="bg-amber-100 text-amber-800 hover:bg-amber-200 gap-1 pl-3 pr-1 py-1.5 text-sm"
                        >
                          <span className="font-mono font-medium">{entry.orderId}</span>
                          <span className="text-amber-600 ml-1 text-xs">· {timeAdded}</span>
                          <button
                            onClick={() => removeAdHocEntry(entry.orderId)}
                            className="ml-1 rounded-full hover:bg-amber-300 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                </>
              )}
            </TabsContent>

            {['all', 'p1', 'oem'].map((tabValue) => (
              <TabsContent key={tabValue} value={tabValue} className="mt-4">
                {hasError ? (
                  <div className="text-center py-12 text-red-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-red-300" />
                    <p className="text-lg font-medium">Failed to load shipment data</p>
                    <p className="text-sm mt-1 text-gray-500">
                      {ordersError ? 'Could not load P1 orders. ' : ''}
                      {oemError ? 'Could not load OEM shipments. ' : ''}
                      Please try refreshing the page.
                    </p>
                  </div>
                ) : isLoading ? (
                  <div className="flex items-center justify-center py-12 text-gray-500">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
                    Loading shipments...
                  </div>
                ) : filteredShipments.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-lg font-medium">No shipments found</p>
                    <p className="text-sm mt-1">
                      {searchTerm
                        ? 'Try adjusting your search term'
                        : 'No stocks were shipped during this week'}
                    </p>
                  </div>
                ) : (
                  renderShipmentTable(filteredShipments)
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

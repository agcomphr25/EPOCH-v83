import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import {
  getCurrentOperationalWeek,
  formatOperationalWeekRange,
  getShippingWeekInfo,
  getOperationalWeekStart,
  getOperationalWeekEnd,
} from '@shared/weekUtils';
import { format } from 'date-fns';
import { Link } from 'wouter';

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
  type: 'P1' | 'OEM';
  orderId: string;
  modelOrDescription: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  shippedDate: Date;
  itemCount: number;
}

export default function WeeklyShipmentsOverview() {
  const { week: currentWeek, year: currentOpYear } = getCurrentOperationalWeek();

  const [selectedYear, setSelectedYear] = useState<number>(currentOpYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');

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
        shipment.items.forEach((item) => {
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

    items.sort((a, b) => b.shippedDate.getTime() - a.shippedDate.getTime());
    return items;
  }, [orders, oemData, weekStart, weekEnd, customerMap]);

  const filteredShipments = useMemo(() => {
    let filtered = unifiedShipments;

    if (activeTab === 'p1') {
      filtered = filtered.filter((s) => s.type === 'P1');
    } else if (activeTab === 'oem') {
      filtered = filtered.filter((s) => s.type === 'OEM');
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
  const totalItems = unifiedShipments.reduce((sum, s) => sum + s.itemCount, 0);

  const uniqueTrackingNumbers = new Set(
    unifiedShipments.filter((s) => s.trackingNumber).map((s) => s.trackingNumber)
  ).size;

  const yearOptions = [currentOpYear, currentOpYear - 1, currentOpYear - 2];
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  const isLoading = ordersLoading || oemLoading;
  const hasError = ordersError || oemError;

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                All ({unifiedShipments.length})
              </TabsTrigger>
              <TabsTrigger value="p1">
                P1 Orders ({p1Count})
              </TabsTrigger>
              <TabsTrigger value="oem">
                OEM ({oemCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
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
                      {filteredShipments.map((shipment) => (
                        <TableRow key={shipment.id}>
                          <TableCell>
                            <Badge
                              variant={shipment.type === 'P1' ? 'default' : 'secondary'}
                              className={
                                shipment.type === 'P1'
                                  ? 'bg-green-100 text-green-800 hover:bg-green-100'
                                  : 'bg-purple-100 text-purple-800 hover:bg-purple-100'
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
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

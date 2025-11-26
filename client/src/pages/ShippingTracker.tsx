import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  MapPin,
} from 'lucide-react';
import {
  getCurrentCompanyWeek,
  formatWeekRange,
  isDateInCompanyWeek,
} from '@shared/weekUtils';
import { format } from 'date-fns';
import { ManualTrackingEntry } from '@/components/ManualTrackingEntry';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

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
  hasAltShipTo?: boolean;
  altShipToCustomerId?: string;
  altShipToName?: string;
  altShipToCompany?: string;
  altShipToEmail?: string;
  altShipToPhone?: string;
  altShipToAddress?: {
    street?: string;
    street2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

interface CustomerAddress {
  id: number;
  customerId: string;
  street: string;
  street2?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  type: string;
  isDefault: boolean;
}

interface WeeklyStats {
  week: number;
  year: number;
  stocksShipped: number;
  orders: string[];
}

export default function ShippingTracker() {
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentCompanyWeek();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);
  const [searchTerm, setSearchTerm] = useState('');

  // Mutation to send notification to customer
  const sendNotificationMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`/api/shipping/notify-customer/${orderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send notification');
      }

      return response.json();
    },
    onSuccess: (data, orderId) => {
      toast({
        title: 'Notification Sent',
        description: data.message || `Customer notified via ${data.methods?.join(' and ')}`,
      });
      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
    },
    onError: (error: Error, orderId) => {
      toast({
        title: 'Failed to Send Notification',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fetch all fulfilled orders
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: async () => {
      const response = await fetch('/api/orders/with-payment-status');
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    },
  });

  // Fetch customers for name search
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch customer addresses for ship-to tooltips
  const { data: customerAddresses, isLoading: isLoadingAddresses } = useQuery<CustomerAddress[]>({
    queryKey: ['/api/customer-addresses'],
  });

  // Helper function to safely parse altShipToAddress (could be object, string, or null)
  const parseAltShipToAddress = (addr: unknown): Order['altShipToAddress'] => {
    if (!addr) return undefined;
    if (typeof addr === 'object' && addr !== null) {
      const obj = addr as Record<string, unknown>;
      return {
        street: typeof obj.street === 'string' ? obj.street : undefined,
        street2: typeof obj.street2 === 'string' ? obj.street2 : undefined,
        city: typeof obj.city === 'string' ? obj.city : undefined,
        state: typeof obj.state === 'string' ? obj.state : undefined,
        zipCode: typeof obj.zipCode === 'string' ? obj.zipCode : undefined,
        country: typeof obj.country === 'string' ? obj.country : undefined,
      };
    }
    return undefined;
  };

  // Helper function to get shipping address for an order
  const getShipToInfo = (order: Order, customer: Customer | undefined) => {
    // Check if order has alt ship-to info
    if (order.hasAltShipTo) {
      const altAddr = parseAltShipToAddress(order.altShipToAddress);
      return {
        name: order.altShipToName || order.altShipToCompany || 'Alt Ship To',
        company: order.altShipToCompany,
        email: order.altShipToEmail,
        phone: order.altShipToPhone,
        street: altAddr?.street,
        street2: altAddr?.street2,
        city: altAddr?.city,
        state: altAddr?.state,
        zipCode: altAddr?.zipCode,
        country: altAddr?.country,
        isAltShipTo: true,
      };
    }

    // Get default shipping address for customer
    if (customer && customerAddresses) {
      const custAddresses = customerAddresses.filter(
        (addr) => String(addr.customerId) === String(customer.id)
      );
      const shippingAddress = custAddresses.find(
        (addr) => addr.isDefault && (addr.type === 'shipping' || addr.type === 'both')
      ) || custAddresses.find(
        (addr) => addr.type === 'shipping' || addr.type === 'both'
      ) || custAddresses[0];

      if (shippingAddress) {
        return {
          name: customer.name,
          company: customer.company,
          email: customer.email,
          phone: customer.phone,
          street: shippingAddress.street,
          street2: shippingAddress.street2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          zipCode: shippingAddress.zipCode,
          country: shippingAddress.country,
          isAltShipTo: false,
        };
      }
    }

    // Fallback to customer info only
    if (customer) {
      return {
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        isAltShipTo: false,
      };
    }

    return null;
  };

  // Filter orders by search term (order number or customer name)
  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    const fulfilled = orders.filter((order) => order.status === 'FULFILLED');

    let filtered = fulfilled;
    
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = fulfilled.filter((order) => {
        // Search by order number
        if (order.orderId.toLowerCase().includes(searchLower)) return true;

        // Search by customer name
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

    // Sort by shipped date (most recent first)
    return filtered.sort((a, b) => {
      // Orders without a shipped date go to the end
      if (!a.shippedDate && !b.shippedDate) return 0;
      if (!a.shippedDate) return 1;
      if (!b.shippedDate) return -1;
      
      // Sort by shipped date descending (most recent first)
      return new Date(b.shippedDate).getTime() - new Date(a.shippedDate).getTime();
    });
  }, [orders, searchTerm, customers]);

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

  // Calculate weekly stats
  const weeklyStats: WeeklyStats[] = [];

  if (orders) {
    // Group fulfilled orders by company week
    const weekMap = new Map<
      string,
      { stocksShipped: number; orders: string[] }
    >();

    orders
      .filter((order) => order.status === 'FULFILLED')
      .forEach((order) => {
        // Use shippedDate as the fulfillment date (fallback to updatedAt for older records)
        const fulfillmentDate = new Date(order.shippedDate || order.updatedAt);
        const year = fulfillmentDate.getFullYear();

        // Find which company week this order was fulfilled in
        for (let week = 1; week <= 52; week++) {
          if (isDateInCompanyWeek(fulfillmentDate, week, year)) {
            const key = `${year}-W${week}`;

            if (!weekMap.has(key)) {
              weekMap.set(key, { stocksShipped: 0, orders: [] });
            }

            const stats = weekMap.get(key)!;
            stats.stocksShipped += 1;
            stats.orders.push(order.orderId);
            break;
          }
        }
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

  // Generate year options (current year and 2 previous years)
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

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
                {formatWeekRange(currentWeek, currentYear)}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">
                Stocks Shipped This Week
              </div>
              <div className="text-2xl font-bold text-green-600">
                {weeklyStats.find(
                  (s) => s.week === currentWeek && s.year === currentYear
                )?.stocksShipped || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">Total Weeks Tracked</div>
              <div className="text-2xl font-bold text-indigo-600">
                {weeklyStats.length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Specific Week - Moved under Current Week Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            View Specific Week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
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
            <div className="text-sm text-gray-600">
              {formatWeekRange(selectedWeek, selectedYear)}
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Stocks Shipped</div>
                <div className="text-3xl font-bold text-blue-600">
                  {selectedWeekStats.stocksShipped}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Orders</div>
                <div className="text-xl font-semibold text-gray-700">
                  {selectedWeekStats.orders.length}
                </div>
              </div>
            </div>
            {selectedWeekStats.orders.length > 0 && (
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
          </div>
        </CardContent>
      </Card>

      {/* Accordion Section for Shipping Details and All Weeks */}
      <Accordion
        type="multiple"
        className="space-y-4"
        defaultValue={['shipping-details']}
      >
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
                  placeholder="Search by order number or customer name..."
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
                    {filteredOrders.slice(0, 50).map((order) => {
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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span 
                                    className="cursor-pointer hover:text-blue-600 hover:underline inline-flex items-center gap-1"
                                    data-testid={`customer-name-${order.orderId}`}
                                  >
                                    {customer?.name || 'Unknown Customer'}
                                    {order.hasAltShipTo && (
                                      <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs ml-1">
                                        Alt
                                      </Badge>
                                    )}
                                    <MapPin className="h-3 w-3 text-gray-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {(() => {
                                    if (isLoadingAddresses && !order.hasAltShipTo) {
                                      return (
                                        <div className="text-gray-500 flex items-center gap-2">
                                          <div className="h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                          Loading address...
                                        </div>
                                      );
                                    }
                                    const shipToInfo = getShipToInfo(order, customer);
                                    if (!shipToInfo) {
                                      return (
                                        <div className="text-gray-500">
                                          No shipping information available
                                        </div>
                                      );
                                    }
                                    return (
                                      <div className="space-y-2">
                                        <div className="font-semibold text-sm border-b pb-1 flex items-center gap-2">
                                          <MapPin className="h-4 w-4" />
                                          Ship To Address
                                          {shipToInfo.isAltShipTo && (
                                            <Badge variant="secondary" className="bg-purple-100 text-purple-800 text-xs">
                                              Alternate
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="space-y-1 text-sm">
                                          <div className="font-medium">{shipToInfo.name}</div>
                                          {shipToInfo.company && shipToInfo.company !== shipToInfo.name && (
                                            <div className="text-gray-600">{shipToInfo.company}</div>
                                          )}
                                          {shipToInfo.street && (
                                            <div>
                                              <div>{shipToInfo.street}</div>
                                              {shipToInfo.street2 && <div>{shipToInfo.street2}</div>}
                                              <div>
                                                {shipToInfo.city}, {shipToInfo.state} {shipToInfo.zipCode}
                                              </div>
                                              {shipToInfo.country && shipToInfo.country !== 'United States' && (
                                                <div>{shipToInfo.country}</div>
                                              )}
                                            </div>
                                          )}
                                          {!shipToInfo.street && (
                                            <div className="text-gray-500 italic">
                                              No address on file
                                            </div>
                                          )}
                                          {(shipToInfo.email || shipToInfo.phone) && (
                                            <div className="pt-1 border-t mt-2 space-y-1">
                                              {shipToInfo.email && (
                                                <div className="text-gray-600 text-xs">{shipToInfo.email}</div>
                                              )}
                                              {shipToInfo.phone && (
                                                <div className="text-gray-600 text-xs">{shipToInfo.phone}</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
                {filteredOrders.length > 50 && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    Showing first 50 of {filteredOrders.length} results
                  </p>
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

        {/* All Weeks Accordion */}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyStats.map((stat) => (
                    <TableRow
                      key={`${stat.year}-W${stat.week}`}
                      className={
                        stat.week === currentWeek && stat.year === currentYear
                          ? 'bg-blue-50'
                          : ''
                      }
                    >
                      <TableCell className="font-medium">
                        Week {stat.week}, {stat.year}
                        {stat.week === currentWeek &&
                          stat.year === currentYear && (
                            <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                              Current
                            </span>
                          )}
                      </TableCell>
                      <TableCell>
                        {formatWeekRange(stat.week, stat.year)}
                      </TableCell>
                      <TableCell>
                        <span className="text-lg font-semibold text-blue-600">
                          {stat.stocksShipped}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {stat.orders.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

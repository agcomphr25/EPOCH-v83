import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface ShipmentItem {
  id: number;
  poItemId: number;
  orderId: string;
  quantity: number;
  description: string;
  poNumber: string;
  hasPackingSlip: boolean;
}

interface Shipment {
  id: number;
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
  created_at: string;
  created_by: string;
  has_shipping_label: boolean;
  item_count: number;
  po_count: number;
  items: ShipmentItem[];
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
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const [expandedShipments, setExpandedShipments] = useState<Set<number>>(new Set());
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

  const toggleExpanded = (shipmentId: number) => {
    const newExpanded = new Set(expandedShipments);
    if (newExpanded.has(shipmentId)) {
      newExpanded.delete(shipmentId);
    } else {
      newExpanded.add(shipmentId);
    }
    setExpandedShipments(newExpanded);
  };

  const downloadShippingLabel = async (shipmentId: number, trackingNumber: string) => {
    try {
      const response = await fetch(`/api/po-orders/oem-shipments/${shipmentId}/label`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download shipping label');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shipping-label-${trackingNumber}.gif`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Shipping label downloaded' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const downloadPackingSlip = async (itemId: number, poNumber: string, orderId: string) => {
    try {
      const response = await fetch(`/api/po-orders/oem-shipments/packing-slip/${itemId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to download packing slip');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `packing-slip-PO${poNumber}-${orderId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Packing slip downloaded' });
    } catch (error: any) {
      toast({
        title: 'Download failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const copyTracking = (trackingNumber: string) => {
    navigator.clipboard.writeText(trackingNumber);
    toast({ title: 'Tracking number copied to clipboard' });
  };

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
        <Badge variant="outline" className="text-lg px-4 py-2">
          {pagination?.total || 0} Total Shipments
        </Badge>
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
                    placeholder="Search by customer, tracking, or reference..."
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

      {/* Shipments List */}
      {!isLoading && shipments.length > 0 && (
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
                      <div className="flex items-center gap-3 mb-2">
                        <Truck className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold">{shipment.customer_name}</h3>
                        <Badge variant="secondary">
                          {shipment.po_count} PO{shipment.po_count !== 1 ? 's' : ''}
                        </Badge>
                        <Badge variant="outline">
                          {shipment.item_count} Item{shipment.item_count !== 1 ? 's' : ''}
                        </Badge>
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
                      {/* Download Label */}
                      {shipment.has_shipping_label && (
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
                      )}

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
                              <td className="p-3">{item.description}</td>
                              <td className="p-3 text-center">
                                <Badge variant="outline">{item.quantity}</Badge>
                              </td>
                              <td className="p-3 text-center">
                                {item.hasPackingSlip ? (
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
                                ) : (
                                  <span className="text-xs text-gray-400">N/A</span>
                                )}
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
    </div>
  );
}

import { useState, useMemo } from 'react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Factory,
  ArrowRight,
  Package,
  CheckCircle,
  AlertTriangle,
  Search,
  X,
} from 'lucide-react';
import { ReturnsRepairsSection } from '@/components/ReturnsRepairsSection';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAdminUser } from '@/config/userPermissions';
import { format } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useUnifiedLayupOrders } from '@/hooks/useUnifiedLayupOrders';
import KickbackReportModal from '@/components/KickbackReportModal';
import TicketBadge, { useOrderTicketCounts } from '@/components/TicketBadge';
import OrderActionButtons from '@/components/OrderActionButtons';
import DepartmentOrderNotes from '@/components/DepartmentOrderNotes';

export default function LayupPluggingQueuePage() {
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [kickbackModalOpen, setKickbackModalOpen] = useState(false);
  const [selectedOrderForKickback, setSelectedOrderForKickback] = useState<{orderId: string, department: string} | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast} = useToast();

  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['currentUser'],
  });
  const isAdmin = isAdminUser(currentUser);

  // Fetch all kickbacks
  const { data: allKickbacks = [] } = useQuery({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000,
  });


  const hasKickbacks = (orderId: string) => {
    return (allKickbacks as any[]).some(
      (kickback: any) => kickback.orderId === orderId
    );
  };

  const getKickbackStatus = (orderId: string) => {
    const orderKickbacks = (allKickbacks as any[]).filter(
      (kickback: any) => kickback.orderId === orderId
    );
    if (orderKickbacks.length === 0) return null;

    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const highestPriority = orderKickbacks.reduce(
      (highest: string, kickback: any) => {
        const currentIndex = priorities.indexOf(kickback.priority);
        const highestIndex = priorities.indexOf(highest);
        return currentIndex < highestIndex ? kickback.priority : highest;
      },
      'LOW'
    );
    return highestPriority;
  };

  const handleKickbackClick = (orderId: string) => {
    setLocation('/kickback-tracking');
  };

  // Get ALL orders in Layup/Plugging department
  const { orders: availableOrders, loading: ordersLoading } =
    useUnifiedLayupOrders();

  // Filter to show only orders in Layup/Plugging department
  const layupPluggingOrders = useMemo(() => {
    if (!availableOrders || availableOrders.length === 0) {
      return [];
    }

    const filtered = availableOrders.filter((order: any) => {
      return order.currentDepartment === 'Layup/Plugging';
    });

    return filtered;
  }, [availableOrders]);

  // Apply search filter
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) {
      return layupPluggingOrders;
    }

    const query = searchQuery.toLowerCase();
    return layupPluggingOrders.filter((order: any) => {
      const orderId = order.orderId?.toLowerCase() || '';
      const customer = order.customer?.toLowerCase() || '';
      const fbOrderNumber = order.fbOrderNumber?.toLowerCase() || '';

      return (
        orderId.includes(query) ||
        customer.includes(query) ||
        fbOrderNumber.includes(query)
      );
    });
  }, [layupPluggingOrders, searchQuery]);

  const orderIdsForTickets = useMemo(() => filteredOrders.map((o: any) => o.orderId), [filteredOrders]);
  const { data: ticketMap } = useOrderTicketCounts(orderIdsForTickets);

  // Get stock models for display
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: async () => {
      return await apiRequest('/api/stock-models');
    },
  });

  const getModelDisplayName = (modelId: string) => {
    if (!modelId) return 'Unknown Model';
    const model = (stockModels as any[]).find((m: any) => m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Get barcode queue count
  const { data: allOrders = [] } = useQuery({
    queryKey: ['/api/orders/all'],
    queryFn: async () => {
      return await apiRequest('/api/orders/all');
    },
  });

  const barcodeQueueCount = useMemo(() => {
    if (!Array.isArray(allOrders)) {
      return 0;
    }
    return allOrders.filter(
      (order: any) =>
        order?.currentDepartment === 'Barcode' ||
        (order?.department === 'Barcode' && order?.status === 'IN_PROGRESS')
    ).length;
  }, [allOrders]);

  // Handle order selection
  const handleOrderSelect = (orderId: string, checked: boolean) => {
    if (checked) {
      setSelectedOrders((prev) => [...prev, orderId]);
    } else {
      setSelectedOrders((prev) => prev.filter((id) => id !== orderId));
    }
  };

  // Move orders to Barcode department
  const moveToDepartmentMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      return await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: {
          orderIds,
          department: 'Barcode',
          status: 'IN_PROGRESS',
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: `Successfully moved ${selectedOrders.length} orders to Barcode Department`,
      });
      setSelectedOrders([]);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/all'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
    },
    onError: (error) => {
      console.error('Error moving orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to move orders to next department',
        variant: 'destructive',
      });
    },
  });

  const handleMoveToNextDepartment = () => {
    if (selectedOrders.length === 0) {
      toast({
        title: 'No Selection',
        description: 'Please select orders to move',
        variant: 'destructive',
      });
      return;
    }
    moveToDepartmentMutation.mutate(selectedOrders);
  };

  // Auto-select order when scanned OR fetch schedule orders when schedule barcode scanned
  const handleOrderScanned = async (barcode: string) => {
    console.log('🔍 Barcode scanned:', barcode);
    
    // Check if this is a schedule barcode
    // Format 1: LAYUP20251102 (LAYUP + YYYYMMDD)
    // Format 2: LAYUP-2025-11-02 (LAYUP- + YYYY-MM-DD)
    // Format 3: 2025-11-02 (YYYY-MM-DD only)
    let scheduleDate: string | null = null;
    
    // Check for LAYUP + 8 digits (LAYUPYYYYMMDD)
    const compactPattern = /^LAYUP(\d{8})$/i;
    const compactMatch = barcode.match(compactPattern);
    
    if (compactMatch) {
      // Parse YYYYMMDD to YYYY-MM-DD
      const dateStr = compactMatch[1];
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      scheduleDate = `${year}-${month}-${day}`;
      console.log('📅 Schedule barcode detected (compact):', scheduleDate);
    } else {
      // Check for standard format with dashes
      const standardPattern = /^(LAYUP-)?(\d{4}-\d{2}-\d{2})$/i;
      const standardMatch = barcode.match(standardPattern);
      
      if (standardMatch) {
        scheduleDate = standardMatch[2]; // YYYY-MM-DD
        console.log('📅 Schedule barcode detected (standard):', scheduleDate);
      }
    }
    
    if (scheduleDate) {
      
      try {
        toast({
          title: 'Loading Schedule',
          description: `Fetching orders for schedule ${scheduleDate}...`,
        });
        
        // Fetch orders for this schedule date
        const response = await apiRequest(`/api/layup-schedule/by-schedule-date/${scheduleDate}`);
        
        if (response.success && Array.isArray(response.orderIds)) {
          const scheduleOrderIds = response.orderIds;
          console.log('📦 Found schedule orders:', scheduleOrderIds);
          
          // Filter to only orders that exist in current layup/plugging queue
          const validOrderIds = scheduleOrderIds.filter((orderId: string) =>
            layupPluggingOrders.some((order: any) => order.orderId === orderId)
          );
          
          if (validOrderIds.length > 0) {
            setSelectedOrders((prev) => {
              // Combine existing selection with new orders (avoid duplicates)
              const combined = [...new Set([...prev, ...validOrderIds])];
              return combined;
            });
            
            toast({
              title: 'Schedule Orders Selected',
              description: `Selected ${validOrderIds.length} orders from schedule ${scheduleDate}`,
            });
          } else {
            toast({
              title: 'No Matching Orders',
              description: `No orders from schedule ${scheduleDate} are in the Layup/Plugging queue`,
              variant: 'destructive',
            });
          }
        } else {
          toast({
            title: 'No Orders Found',
            description: `No orders found for schedule ${scheduleDate}`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Error fetching schedule orders:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch schedule orders',
          variant: 'destructive',
        });
      }
    } else {
      // Regular order barcode - select single order
      const orderExists = filteredOrders.some(
        (order: any) => order.orderId === barcode
      );
      if (orderExists) {
        setSelectedOrders((prev) => {
          if (prev.includes(barcode)) return prev; // Already selected
          return [...prev, barcode];
        });
        toast({
          title: 'Order Selected',
          description: `Order ${barcode} selected automatically`,
        });
      } else {
        toast({
          title: 'Order Not Found',
          description: `Order ${barcode} is not in the Layup/Plugging department`,
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Factory className="h-6 w-6" />
        <h1 className="text-3xl font-bold">Layup/Plugging Department</h1>
        <Badge variant="secondary" className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
          {layupPluggingOrders.length} Orders
        </Badge>
      </div>

      {/* Barcode Scanner - accepts both order barcodes and schedule barcodes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Barcode Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Scan an <strong>order barcode</strong> (e.g., AG1234, P1-P18918-7-1) to select a single order,
            or scan a <strong>schedule barcode</strong> (e.g., LAYUP-2025-11-04 or 2025-11-04) to select all orders from that layup schedule.
          </p>
          <BarcodeScanner onOrderScanned={handleOrderScanned} />
        </CardContent>
      </Card>

      <ReturnsRepairsSection repairDepartment="Layup/Plugging" />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
              <Package className="h-5 w-5" />
              Layup/Plugging Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {layupPluggingOrders.length}
            </div>
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
              Orders ready for layup and plugging work
            </p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-green-700 dark:text-green-300 flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Next: Barcode Queue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {barcodeQueueCount}
            </div>
            <p className="text-sm text-green-600 dark:text-green-400 mt-1">
              Orders ready for barcode processing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Multi-select Actions */}
      {selectedOrders.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg">
          <div className="container mx-auto p-4">
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="py-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-blue-800 dark:text-blue-200">
                      {selectedOrders.length} order{selectedOrders.length > 1 ? 's' : ''} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedOrders([])}
                      disabled={moveToDepartmentMutation.isPending}
                      data-testid="button-clear-selection"
                    >
                      Clear Selection
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleMoveToNextDepartment}
                      disabled={moveToDepartmentMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                      data-testid="button-move-to-barcode"
                    >
                      {moveToDepartmentMutation.isPending
                        ? 'Moving...'
                        : 'Progress to Barcode Department →'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Spacer for sticky bottom bar */}
      {selectedOrders.length > 0 && <div className="h-24"></div>}

      {/* Orders Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between flex-wrap gap-2">
            <span>Layup/Plugging Orders</span>
            <Badge variant="secondary" className="text-sm">
              {filteredOrders.length} {searchQuery ? 'filtered' : 'total'}
            </Badge>
          </CardTitle>
          
          {/* Search Bar */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by Order ID, FB Order, or Customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
              data-testid="input-search"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Selection Controls */}
          {filteredOrders.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedOrders(filteredOrders.map((o: any) => o.orderId))}
                disabled={selectedOrders.length === filteredOrders.length}
                data-testid="button-select-all"
              >
                Select All ({filteredOrders.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedOrders([])}
                disabled={selectedOrders.length === 0}
                data-testid="button-clear-all"
              >
                Clear ({selectedOrders.length})
              </Button>
            </div>
          )}

          {ordersLoading ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300 animate-pulse" />
              <p>Loading orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-xl font-medium mb-2">
                {searchQuery ? 'No Matching Orders' : 'No Orders in Queue'}
              </h3>
              <p className="text-sm">
                {searchQuery
                  ? 'Try adjusting your search terms'
                  : 'Orders will appear here when moved from Production Queue'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredOrders.map((order: any) => {
                const isSelected = selectedOrders.includes(order.orderId);
                const modelId = order.stockModelId || order.modelId;
                const materialType = modelId?.startsWith('cf_') ? 'CF' : modelId?.startsWith('fg_') ? 'FG' : null;
                const isPO = !!(order.poId || order.productionOrderId);

                return (
                  <Card
                    key={order.orderId}
                    className={`relative border-l-4 transition-all cursor-pointer ${
                      isPO ? 'border-l-green-500' : 'border-l-blue-500'
                    } ${isSelected ? 'ring-2 ring-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                    onClick={() => handleOrderSelect(order.orderId, !isSelected)}
                    data-testid={`card-order-${order.orderId}`}
                  >
                    <div className="absolute top-2 right-2 z-10">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => handleOrderSelect(order.orderId, !!checked)}
                        className="bg-white dark:bg-gray-800 border-2 shadow-sm"
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`checkbox-order-${order.orderId}`}
                      />
                    </div>

                    <CardContent className="p-4 pr-10">
                      <div className="space-y-2">
                        <div className="font-bold text-lg flex items-center gap-2">
                          <span data-testid={`text-order-id-${order.orderId}`}>
                            {getDisplayOrderId(order)}
                          </span>
                          <TicketBadge orderId={order.orderId} ticketMap={ticketMap} />
                          {isPO && (
                            <Badge className="bg-green-500 text-white text-xs">PO</Badge>
                          )}
                          {materialType && (
                            <Badge variant="outline" className="text-xs">{materialType}</Badge>
                          )}
                        </div>

                        {modelId && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {getModelDisplayName(modelId)}
                          </div>
                        )}

                        {order.customer && (
                          <div className="text-xs text-gray-500">
                            Customer: {order.customer}
                          </div>
                        )}

                        {order.dueDate && (
                          <div className="text-xs text-gray-500">
                            Due: {format(new Date(order.dueDate), 'MMM d, yyyy')}
                          </div>
                        )}

                        <DepartmentOrderNotes notes={order.notes} departmentNotes={(order as any).departmentNotes} currentDepartment={order.currentDepartment} />

                        {hasKickbacks(order.orderId) && (
                          <Badge
                            variant="destructive"
                            className={`cursor-pointer text-xs ${
                              getKickbackStatus(order.orderId) === 'CRITICAL'
                                ? 'bg-red-600'
                                : getKickbackStatus(order.orderId) === 'HIGH'
                                  ? 'bg-orange-600'
                                  : 'bg-yellow-600'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleKickbackClick(order.orderId);
                            }}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Kickback
                          </Badge>
                        )}
                        
                        <OrderActionButtons
                          orderId={order.orderId}
                          onReportKickback={(id) => {
                            setSelectedOrderForKickback({ orderId: id, department: 'Layup/Plugging' });
                            setKickbackModalOpen(true);
                          }}
                          showReassignButton={isAdmin}
                          className="mt-2"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kickback Report Modal */}
      <KickbackReportModal
        open={kickbackModalOpen}
        onOpenChange={(open) => {
          setKickbackModalOpen(open);
          if (!open) setSelectedOrderForKickback(null);
        }}
        orderId={selectedOrderForKickback?.orderId || ''}
        department={selectedOrderForKickback?.department || ''}
      />
    </div>
  );
}

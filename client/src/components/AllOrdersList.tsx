import React, { useState } from 'react';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customer?: string;
  product?: string;
  modelId: string;
  currentDepartment: string;
  status: string;
  fbOrderNumber?: string;
  paymentTotal?: number;
  isFullyPaid?: boolean;
  isVerified?: boolean;
}

interface Kickback {
  id: number;
  orderId: string;
  status: string;
  priority: string;
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowRight, AlertTriangle, Package2, Edit, Search, X, Mail, MessageSquare } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import ScrapOrderModal from './ScrapOrderModal';
import OrderSummaryModal from './OrderSummaryModal';
import toast from 'react-hot-toast';
import { Link, useLocation } from 'wouter';
import { getDisplayOrderId } from '@/lib/orderUtils';
import CustomerDetailsTooltip from './CustomerDetailsTooltip';
import CommunicationCompose from './CommunicationCompose';

const departments = ['P1 Production Queue', 'Layup/Plugging', 'Barcode', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'Shipping QC', 'Shipping'];

export default function AllOrdersList() {
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [showCancelled, setShowCancelled] = useState(false);
  const [sortBy, setSortBy] = useState<'orderDate' | 'dueDate' | 'customer' | 'model'>('orderDate');
  const [scrapModalOrder, setScrapModalOrder] = useState<Order | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();
  const [communicationModalOpen, setCommunicationModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [, setLocation] = useLocation();

  // Set up global handler for communication buttons in tooltip
  React.useEffect(() => {
    (window as any).handleCommunicationOpen = handleCommunicationOpen;
    return () => {
      delete (window as any).handleCommunicationOpen;
    };
  }, []);

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: () => {
      const result = apiRequest('/api/orders/with-payment-status');
      result.then(data => {
        console.log('📊 API Response sample:', data.slice(0, 2).map((o: any) => ({
          orderId: o.orderId, 
          fbOrderNumber: o.fbOrderNumber, 
          currentDepartment: o.currentDepartment,
          isVerified: o.isVerified
        })));
        
        // Debug logging for isVerified field
        const verifiedOrders = data.filter((order: any) => order.isVerified);
        console.log('🟢 Verified orders count:', verifiedOrders.length);
        if (verifiedOrders.length > 0) {
          console.log('🟢 Found verified orders:', verifiedOrders.map((o: any) => ({orderId: o.orderId, fbOrderNumber: o.fbOrderNumber, isVerified: o.isVerified})));
        }
        
        // Check specific orders
        const ag402 = data.find((o: any) => o.orderId === 'AG402');
        if (ag402) {
          console.log('🔍 AG402 data:', {orderId: ag402.orderId, currentDepartment: ag402.currentDepartment, isVerified: ag402.isVerified});
        }
        
        const ag630 = data.find((o: any) => o.orderId === 'AG630');
        if (ag630) {
          console.log('🔍 AG630 data:', {orderId: ag630.orderId, currentDepartment: ag630.currentDepartment, isVerified: ag630.isVerified});
        }
      });
      return result;
    }
  });



  // Fetch stock models to get display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  // Fetch all kickbacks to determine which orders have kickbacks
  const { data: allKickbacks = [] } = useQuery<Kickback[]>({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Helper function to get model display name
  const getModelDisplayName = (modelId: string) => {
    if (!modelId || !stockModels || stockModels.length === 0) {
      return modelId || 'Unknown Model';
    }
    const model = (stockModels as any[]).find((m: any) => m && m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  // Helper function to check if an order has kickbacks
  const hasKickbacks = (orderId: string) => {
    return allKickbacks.some(kickback => kickback.orderId === orderId);
  };

  // Helper function to get the most severe kickback status for an order
  const getKickbackStatus = (orderId: string) => {
    const orderKickbacks = allKickbacks.filter(kickback => kickback.orderId === orderId);
    if (orderKickbacks.length === 0) return null;

    // Priority order: CRITICAL > HIGH > MEDIUM > LOW
    const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const highestPriority = orderKickbacks.reduce((highest, kickback) => {
      const currentIndex = priorities.indexOf(kickback.priority);
      const highestIndex = priorities.indexOf(highest);
      return currentIndex < highestIndex ? kickback.priority : highest;
    }, 'LOW');

    return highestPriority;
  };

  // Function to handle kickback badge click
  const handleKickbackClick = (orderId: string) => {
    setLocation('/kickback-tracking');
  };

  const progressOrderMutation = useMutation({
    mutationFn: async ({ orderId, nextDepartment }: { orderId: string, nextDepartment: string }) => {
      console.log(`🔄 ALL ORDERS PROGRESSION: Attempting to progress order ${orderId} to ${nextDepartment}`);
      
      const requestBody = {
        orderIds: [orderId],
        department: nextDepartment,
        status: 'IN_PROGRESS'
      };
      console.log(`🔄 ALL ORDERS PROGRESSION: Request body:`, requestBody);
      
      // Use the bulk department update endpoint that actually exists
      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: requestBody
      });
      console.log(`✅ ALL ORDERS PROGRESSION: API Response:`, response);
      return response;
    },
    onMutate: async ({ orderId, nextDepartment }) => {
      // Cancel outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: ['/api/orders/with-payment-status'] });
      
      // Snapshot the previous value
      const previousOrders = queryClient.getQueryData(['/api/orders/with-payment-status']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['/api/orders/with-payment-status'], (old: any[]) => {
        if (!old) return old;
        
        return old.map((order: any) => {
          if (order.orderId === orderId) {
            console.log(`🔄 OPTIMISTIC UPDATE: ${orderId} from ${order.currentDepartment} to ${nextDepartment}`);
            return { ...order, currentDepartment: nextDepartment };
          }
          return order;
        });
      });
      
      // Return a context object with the snapshotted value
      return { previousOrders };
    },
    onError: (err, variables, context) => {
      console.error(`❌ ALL ORDERS PROGRESSION: Failed to progress order ${variables.orderId}:`, err);
      
      // Rollback optimistic update on error
      if (context?.previousOrders) {
        queryClient.setQueryData(['/api/orders/with-payment-status'], context.previousOrders);
      }
      
      toast.error(`Failed to progress order: ${err.message}`);
    },
    onSuccess: async (data, variables) => {
      console.log(`✅ ALL ORDERS PROGRESSION SUCCESS: Order ${variables.orderId} progressed to ${variables.nextDepartment}`);
      toast.success(`Order progressed to ${variables.nextDepartment}`);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
    }
  });

  const scrapOrderMutation = useMutation({
    mutationFn: async ({ orderId, scrapData }: { orderId: string, scrapData: any }) => {
      return apiRequest(`/api/orders/${orderId}/scrap`, {
        method: 'POST',
        body: scrapData
      });
    },
    onSuccess: () => {
      toast.success('Order scrapped successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
      setScrapModalOrder(null);
    },
    onError: (error) => {
      toast.error(`Failed to scrap order: ${error.message}`);
    }
  });

  const createReplacementMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/${orderId}/reload-replacement`, {
        method: 'POST'
      });
    },
    onSuccess: () => {
      toast.success('Replacement order created successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
    },
    onError: (error) => {
      toast.error(`Failed to create replacement: ${error.message}`);
    }
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string, reason?: string }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    onSuccess: () => {
      toast.success('Order cancelled successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p1-layup-queue'] });
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
    },
    onError: (error) => {
      toast.error(`Failed to cancel order: ${error.message}`);
    }
  });



  const filteredOrders = (orders || []).filter((order: any) => {
    // Show cancelled orders only when specifically viewing cancelled orders
    const isCancelled = order.status === 'CANCELLED' || order.isCancelled === true;
    
    if (showCancelled) {
      // When showing cancelled orders, only show cancelled ones
      if (!isCancelled) {
        return false;
      }
    } else {
      // When showing active orders, exclude cancelled ones
      if (isCancelled) {
        console.log(`🚫 Filtering out cancelled order: ${order.orderId}, status: ${order.status}, isCancelled: ${order.isCancelled}`);
        return false;
      }
    }

    // Department filter (only apply to non-cancelled orders)
    if (!showCancelled) {
      const departmentMatch = selectedDepartment === 'all' || order.currentDepartment === selectedDepartment;
      if (!departmentMatch) return false;
    }

    // Search filter - search in multiple fields
    if (!searchTerm.trim()) {
      return true;
    }

    const searchLower = searchTerm.toLowerCase();
    const searchFields = [
      order.orderId?.toLowerCase(),
      order.fbOrderNumber?.toLowerCase(),
      order.customer?.toLowerCase(),
      order.customerId?.toLowerCase(),
      order.product?.toLowerCase(),
      order.modelId?.toLowerCase()
    ].filter(Boolean);

    const searchMatch = searchFields.some(field => field?.includes(searchLower));

    return searchMatch;
  });

  // Sort orders based on selected sort option
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    switch (sortBy) {
      case 'orderDate':
        return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(); // Newest first
      case 'dueDate':
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); // Earliest due date first
      case 'customer':
        return (a.customer || '').localeCompare(b.customer || '');
      case 'model':
        return (a.modelId || '').localeCompare(b.modelId || '');
      default:
        return 0;
    }
  });

  const departments = [
    'P1 Production Queue', 'Layup/Plugging', 'Barcode', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'Shipping QC', 'Shipping'
  ];

  const getNextDepartment = (currentDepartment: string) => {
    // Handle alternative department names
    const normalizedDepartment = currentDepartment === 'Layup' ? 'Layup/Plugging' : currentDepartment;
    
    const currentIndex = departments.indexOf(normalizedDepartment);
    if (currentIndex >= 0 && currentIndex < departments.length - 1) {
      return departments[currentIndex + 1];
    }
    return null;
  };

  const [processingOrders, setProcessingOrders] = React.useState<Set<string>>(new Set());

  const handleProgressOrder = React.useCallback((orderId: string, currentDepartment: string) => {
    // Prevent multiple clicks on the same order
    if (processingOrders.has(orderId)) {
      console.log(`⚠️ Order ${orderId} is already being processed, ignoring click`);
      return;
    }

    const nextDepartment = getNextDepartment(currentDepartment);
    if (nextDepartment) {
      console.log(`🔄 ALL ORDERS: Progressing ${orderId} from ${currentDepartment} to ${nextDepartment}`);
      setProcessingOrders(prev => new Set(prev).add(orderId));
      progressOrderMutation.mutate({ orderId, nextDepartment });
    } else {
      console.log(`⚠️ ALL ORDERS: No next department found for ${currentDepartment}`);
      toast.error('No next department available');
    }
  }, [processingOrders, progressOrderMutation]);

  // Reset processing state when mutation completes
  React.useEffect(() => {
    if (!progressOrderMutation.isPending) {
      setProcessingOrders(new Set());
    }
  }, [progressOrderMutation.isPending]);

  const handlePushToLayupPlugging = (orderId: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment: 'Layup/Plugging' });
  };

  const handleScrapOrder = (scrapData: any) => {
    if (scrapModalOrder) {
      scrapOrderMutation.mutate({ 
        orderId: scrapModalOrder.orderId, 
        scrapData 
      });
    }
  };

  const getDepartmentBadgeColor = (department: string) => {
    const colors: { [key: string]: string } = {
      'P1 Production Queue': 'bg-slate-600',
      'Layup/Plugging': 'bg-blue-500',
      'Barcode': 'bg-cyan-500',
      'CNC': 'bg-green-500',
      'Finish': 'bg-yellow-500',
      'Gunsmith': 'bg-purple-500',
      'Paint': 'bg-pink-500',
      'Shipping QC': 'bg-indigo-500',
      'Shipping': 'bg-gray-500'
    };
    return colors[department] || 'bg-gray-400';
  };

  const handleCommunicationOpen = (customer: any, communicationType: string) => {
    setSelectedCustomer({
      ...customer,
      preferredCommunication: communicationType
    });
    setCommunicationModalOpen(true);
  };

  const handleCommunicationClose = () => {
    setCommunicationModalOpen(false);
    setSelectedCustomer(null);
  };



  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>All Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading orders...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            {showCancelled ? 'Cancelled Orders' : 'All Orders'} ({sortedOrders.length})
            <div className="flex items-center gap-4">
              {/* Toggle between Active and Cancelled Orders */}
              <Button
                variant={showCancelled ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setShowCancelled(!showCancelled);
                  setSelectedDepartment('all'); // Reset department filter when switching
                }}
                className="flex items-center gap-2"
              >
                {showCancelled ? 'Show Active Orders' : 'Show Cancelled Orders'}
              </Button>
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search Order ID, FB Order #, Customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-80"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 h-6 w-6 p-0"
                    onClick={() => setSearchTerm('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Department Filter - only show for active orders */}
              {!showCancelled && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Department:</span>
                  <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All Departments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map(dept => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Sort By */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sort by:</span>
                <Select value={sortBy} onValueChange={(value: 'orderDate' | 'dueDate' | 'customer' | 'model') => setSortBy(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orderDate">Order Date</SelectItem>
                    <SelectItem value="dueDate">Due Date</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="model">Model</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Current Department</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Order Total / Payment Status</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOrders.map(order => {
                const nextDept = getNextDepartment(order.currentDepartment);
                const isComplete = order.currentDepartment === 'Shipping';
                const isScrapped = order.status === 'SCRAPPED';

                // Debug logging for verified orders
                if (order.isVerified) {
                  console.log(`✅ Verified order found: ${order.orderId}`, order.isVerified);
                  console.log(`✅ Applying green background to ${order.orderId}`);
                }

                const rowClassName = order.isVerified 
                  ? "bg-green-100 hover:bg-green-150 dark:bg-green-900/30 dark:hover:bg-green-900/40" 
                  : "";
                
                console.log(`Row ${order.orderId}: isVerified=${order.isVerified}, className="${rowClassName}"`);

                return (
                  <TableRow 
                    key={order.orderId}
                    className={rowClassName}
                    style={order.isVerified ? { backgroundColor: '#dcfce7' } : undefined}
                  >
                    <TableCell className="font-medium">
                      <OrderSummaryModal orderId={order.orderId}>
                        <span className="font-medium">
                          {getDisplayOrderId(order)}
                        </span>
                      </OrderSummaryModal>
                    </TableCell>
                    <TableCell>
                      {order.orderDate ? (() => {
                        // Handle timezone issues by creating date without timezone conversion
                        const date = new Date(order.orderDate);
                        // If the date string contains 'T' (ISO format), extract just the date part
                        if (typeof order.orderDate === 'string' && order.orderDate.includes('T')) {
                          const datePart = order.orderDate.split('T')[0];
                          const [year, month, day] = datePart.split('-');
                          return `${month}/${day}/${year}`;
                        }
                        return date.toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit',
                          timeZone: 'UTC'
                        });
                      })() : '-'}
                    </TableCell>
                    <TableCell>
                      <CustomerDetailsTooltip customerId={order.customerId} customerName={order.customer || 'N/A'}>
                        <span className="cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                          {order.customer || 'N/A'}
                        </span>
                      </CustomerDetailsTooltip>
                    </TableCell>
                    <TableCell>
                      {order.product || getModelDisplayName(order.modelId)}
                      {stockModels.length === 0 && (
                        <span className="text-xs text-gray-400 ml-2">(Loading...)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${getDepartmentBadgeColor(order.currentDepartment)} text-white`}>
                        {order.currentDepartment}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.dueDate ? (() => {
                        // Handle timezone issues by creating date without timezone conversion
                        const date = new Date(order.dueDate);
                        // If the date string contains 'T' (ISO format), extract just the date part
                        if (typeof order.dueDate === 'string' && order.dueDate.includes('T')) {
                          const datePart = order.dueDate.split('T')[0];
                          const [year, month, day] = datePart.split('-');
                          return `${month}/${day}/${year}`;
                        }
                        return date.toLocaleDateString('en-US', { 
                          year: 'numeric', 
                          month: '2-digit', 
                          day: '2-digit',
                          timeZone: 'UTC'
                        });
                      })() : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold text-sm">
                          ${order.paymentTotal ? order.paymentTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                        </div>
                        <div>
                          {order.isFullyPaid ? (
                            <Badge className="bg-green-600 text-white hover:bg-green-700 text-xs">
                              PAID
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs">
                              NOT PAID
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={isScrapped ? 'destructive' : 'default'}>
                          {order.status || 'ACTIVE'}
                        </Badge>
                        {hasKickbacks(order.orderId) && (
                          <Badge
                            variant="destructive"
                            className={`cursor-pointer hover:opacity-80 transition-opacity ${
                              getKickbackStatus(order.orderId) === 'CRITICAL' ? 'bg-red-600 hover:bg-red-700' :
                              getKickbackStatus(order.orderId) === 'HIGH' ? 'bg-orange-600 hover:bg-orange-700' :
                              getKickbackStatus(order.orderId) === 'MEDIUM' ? 'bg-yellow-600 hover:bg-yellow-700' :
                              'bg-gray-600 hover:bg-gray-700'
                            }`}
                            onClick={() => handleKickbackClick(order.orderId)}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Kickback
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        {/* Edit Button - Always available for all orders */}
                        <Link href={`/order-entry?draft=${order.orderId}`}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                        </Link>

                        {!isScrapped && !isComplete && order.currentDepartment === 'P1 Production Queue' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              console.log(`🔄 Pushing order ${order.orderId} from P1 Production Queue to Layup/Plugging`);
                              handlePushToLayupPlugging(order.orderId);
                            }}
                            disabled={processingOrders.has(order.orderId)}
                            className={processingOrders.has(order.orderId) ? 'opacity-50 cursor-not-allowed bg-gray-400' : 'bg-green-600 hover:bg-green-700 text-white'}
                          >
                            <ArrowRight className="w-4 h-4 mr-1" />
                            {processingOrders.has(order.orderId) ? 'Processing...' : 'Push to Layup/Plugging'}
                          </Button>
                        )}

                        {!isScrapped && !isComplete && nextDept && order.currentDepartment !== 'P1 Production Queue' && (
                          <Button
                            size="sm"
                            onClick={() => {
                              console.log(`🔄 Button clicked for order ${order.orderId}: ${order.currentDepartment} → ${nextDept}`);
                              handleProgressOrder(order.orderId, order.currentDepartment);
                            }}
                            disabled={processingOrders.has(order.orderId)}
                            className={processingOrders.has(order.orderId) ? 'opacity-50 cursor-not-allowed bg-gray-400' : 'bg-blue-600 hover:bg-blue-700 text-white'}
                          >
                            <ArrowRight className="w-4 h-4 mr-1" />
                            {processingOrders.has(order.orderId) ? 'Processing...' : nextDept}
                          </Button>
                        )}

                        {!isScrapped && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setScrapModalOrder(order)}
                            disabled={scrapOrderMutation.isPending}
                          >
                            <AlertTriangle className="w-4 h-4 mr-1" />
                            Scrap
                          </Button>
                        )}

                        {isScrapped && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => createReplacementMutation.mutate(order.orderId)}
                            disabled={createReplacementMutation.isPending}
                          >
                            <Package2 className="w-4 h-4 mr-1" />
                            Replace
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {filteredOrders.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No orders found for the selected criteria
            </div>
          )}
        </CardContent>
      </Card>

      {scrapModalOrder && (
        <ScrapOrderModal
          order={scrapModalOrder}
          onSubmit={handleScrapOrder}
          onClose={() => setScrapModalOrder(null)}
        />
      )}

      {communicationModalOpen && selectedCustomer && (
        <CommunicationCompose
          isOpen={communicationModalOpen}
          customer={selectedCustomer}
          onClose={handleCommunicationClose}
          defaultType={selectedCustomer.preferredCommunication}
        />
      )}
    </>
  );
}
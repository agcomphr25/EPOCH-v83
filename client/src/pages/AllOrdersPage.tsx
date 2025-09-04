import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Search, X, Download, MoreHorizontal, XCircle, ArrowRight, AlertTriangle, Edit, FileText } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  isVerified?: boolean;
  createdAt?: string;
}

interface PaginatedOrdersResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AllOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [sortBy, setSortBy] = useState<'orderDate' | 'dueDate' | 'customer' | 'model' | 'enteredDate'>('orderDate');
  const [cancelReason, setCancelReason] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50); // Orders per page

  // Department progression flow
  const departments = [
    'P1 Production Queue',
    'Layup/Plugging',
    'Barcode',
    'CNC',
    'Finish',
    'Gunsmith',
    'Finish QC',
    'Paint',
    'Shipping QC',
    'Shipping'
  ];
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Progress order mutation
  const progressOrderMutation = useMutation({
    mutationFn: async ({ orderId, nextDepartment }: { orderId: string, nextDepartment?: string }) => {
      console.log(`🔄 Progressing order ${orderId} to ${nextDepartment || 'next department'}`);
      return apiRequest(`/api/orders/${orderId}/progress`, {
        method: 'POST',
        body: JSON.stringify({ nextDepartment })
      });
    },
    onSuccess: async (data, variables) => {
      console.log(`✅ Order ${variables.orderId} progressed successfully`);
      toast({
        title: "Success",
        description: "Order progressed successfully",
      });
      
      // Clear all caches and force immediate refetch
      queryClient.clear();
      await queryClient.refetchQueries({ queryKey: ['/api/orders/with-payment-status/paginated'] });
      await queryClient.refetchQueries({ queryKey: ['/api/orders/with-payment-status'] });
    },
    onError: (error: any, variables) => {
      console.error(`❌ Failed to progress order ${variables.orderId}:`, error);
      toast({
        title: "Error",
        description: "Failed to progress order: " + (error.message || 'Unknown error'),
        variant: "destructive",
      });
    }
  });

  const { data: paginatedData, isLoading } = useQuery<PaginatedOrdersResponse>({
    queryKey: ['/api/orders/with-payment-status/paginated', currentPage, pageSize],
    queryFn: () => apiRequest(`/api/orders/with-payment-status/paginated?page=${currentPage}&limit=${pageSize}`),
    staleTime: 30000, // Cache for 30 seconds to improve performance
    gcTime: 60000 // Keep in cache for 1 minute
  });

  const orders = paginatedData?.orders || [];
  const totalOrders = paginatedData?.total || 0;
  const totalPages = paginatedData?.totalPages || 1;

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status/paginated'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/pipeline-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/production-queue/prioritized'] });
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
      toast({
        title: "Order Cancelled",
        description: "The order has been cancelled successfully.",
      });
      setIsDialogOpen(false);
      setCancelReason('');
      setOrderToCancel('');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: "Failed to cancel order: " + (error.message || 'Unknown error'),
        variant: "destructive",
      });
    }
  });

  const handleCancelOrder = (orderId: string) => {
    setOrderToCancel(orderId);
    setIsDialogOpen(true);
  };

  const handleViewSalesOrder = (orderId: string) => {
    const link = document.createElement('a');
    link.href = `/api/shipping-pdf/sales-order/${orderId}`;
    link.download = `Sales-Order-${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const confirmCancel = () => {
    if (orderToCancel && cancelReason.trim()) {
      cancelOrderMutation.mutate({ orderId: orderToCancel, reason: cancelReason });
    }
  };

  // Department progression helpers
  const getNextDepartment = (currentDept: string) => {
    const index = departments.indexOf(currentDept);
    return index >= 0 && index < departments.length - 1 ? departments[index + 1] : null;
  };

  const handleProgressOrder = (orderId: string, nextDepartment?: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment });
  };

  const handlePushToLayupPlugging = (orderId: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment: 'Layup/Plugging' });
  };

  const getDepartmentBadgeColor = (department: string) => {
    // Keep badges black/default as requested
    return 'bg-gray-600';
  };

  // Filter orders based on search and department, excluding cancelled orders
  const filteredOrders = orders.filter(order => {
    // Exclude cancelled orders from main list
    if (order.isCancelled || order.status === 'CANCELLED') {
      return false;
    }

    // Department filter
    const departmentMatch = selectedDepartment === 'all' || order.currentDepartment === selectedDepartment;

    // Search filter - search in multiple fields including FB Order Number
    if (!searchTerm.trim()) {
      return departmentMatch;
    }

    const searchLower = searchTerm.toLowerCase();
    const searchFields = [
      order.orderId?.toLowerCase(),
      order.fbOrderNumber?.toLowerCase(), // Include FB Order Number in search
      order.customer?.toLowerCase(),
      order.customerId?.toLowerCase(),
      order.product?.toLowerCase(),
      order.modelId?.toLowerCase()
    ].filter(Boolean);

    const searchMatch = searchFields.some(field => field?.includes(searchLower));

    return departmentMatch && searchMatch;
  });

  // Function to calculate search relevance score
  const getSearchRelevanceScore = (order: any, searchTerm: string) => {
    if (!searchTerm.trim()) return 0;
    
    const searchLower = searchTerm.toLowerCase();
    let score = 0;
    
    // Higher scores for exact matches and earlier field matches
    if (order.orderId?.toLowerCase() === searchLower) score += 100;
    else if (order.orderId?.toLowerCase().startsWith(searchLower)) score += 50;
    else if (order.orderId?.toLowerCase().includes(searchLower)) score += 20;
    
    if (order.fbOrderNumber?.toLowerCase() === searchLower) score += 90;
    else if (order.fbOrderNumber?.toLowerCase().startsWith(searchLower)) score += 45;
    else if (order.fbOrderNumber?.toLowerCase().includes(searchLower)) score += 18;
    
    if (order.customer?.toLowerCase() === searchLower) score += 80;
    else if (order.customer?.toLowerCase().startsWith(searchLower)) score += 40;
    else if (order.customer?.toLowerCase().includes(searchLower)) score += 15;
    
    if (order.customerId?.toLowerCase() === searchLower) score += 70;
    else if (order.customerId?.toLowerCase().includes(searchLower)) score += 10;
    
    if (order.modelId?.toLowerCase() === searchLower) score += 60;
    else if (order.modelId?.toLowerCase().startsWith(searchLower)) score += 30;
    else if (order.modelId?.toLowerCase().includes(searchLower)) score += 8;
    
    if (order.product?.toLowerCase().includes(searchLower)) score += 5;
    
    return score;
  };

  // Sort orders based on search relevance first, then selected sort option
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    // If search term exists, prioritize by relevance first
    if (searchTerm.trim()) {
      const scoreA = getSearchRelevanceScore(a, searchTerm);
      const scoreB = getSearchRelevanceScore(b, searchTerm);
      
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Higher relevance first
      }
    }
    
    // Then apply regular sorting
    switch (sortBy) {
      case 'orderDate':
        return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime(); // Newest first
      case 'dueDate':
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); // Earliest due date first
      case 'customer':
        return (a.customer || '').localeCompare(b.customer || '');
      case 'model':
        return (a.modelId || '').localeCompare(b.modelId || '');
      case 'enteredDate':
        return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime(); // Newest entered first
      default:
        return 0;
    }
  });



  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
          <div className="text-sm text-gray-500">
            Order Management & Department Progression
          </div>
        </div>
        <Card>
          <CardContent>
            <div className="text-center py-8">Loading orders...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">All Orders</h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            View and manage all created orders - with CSV export
          </div>
          <Button variant="outline" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>📋 All Orders</span>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages} ({totalOrders} total orders)
              </span>
            </div>
            <div className="flex items-center gap-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Order ID, Customer Name, Phone, or FB Order #..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-96"
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

              {/* Department Filter */}
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

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Sort by:</span>
                <Select value={sortBy} onValueChange={(value: 'orderDate' | 'dueDate' | 'customer' | 'model' | 'enteredDate') => setSortBy(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orderDate">Order Date</SelectItem>
                    <SelectItem value="dueDate">Due Date</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="model">Model</SelectItem>
                    <SelectItem value="enteredDate">Entered Date</SelectItem>
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
                <TableHead>Current Department</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => (
                <TableRow key={order.orderId} className={order.isVerified ? "bg-green-50 dark:bg-green-950" : ""}>
                  <TableCell className="font-medium">
                    {order.fbOrderNumber || order.orderId}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${getDepartmentBadgeColor(order.currentDepartment)} text-white`}>
                      {order.currentDepartment}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.customer || 'N/A'}</TableCell>
                  <TableCell>{order.product || order.modelId}</TableCell>
                  <TableCell>
                    {order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={order.status === 'SCRAPPED' ? 'destructive' : 'default'}>
                        {order.status || 'ACTIVE'}
                      </Badge>
                      {order.isFullyPaid ? (
                        <Badge className="bg-green-500 hover:bg-green-600 text-white">
                          PAID
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500 hover:bg-red-600 text-white">
                          NOT PAID
                        </Badge>
                      )}
                      {order.status === 'FULFILLED' && (
                        <Badge className="bg-blue-500 hover:bg-blue-600 text-white">
                          FULFILLED
                        </Badge>
                      )}
                      {order.isCancelled && (
                        <Badge variant="destructive" className="bg-red-100 text-red-800">
                          CANCELLED
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {(() => {
                        const nextDept = getNextDepartment(order.currentDepartment);
                        const isComplete = order.currentDepartment === 'Shipping';
                        const isScrapped = order.status === 'SCRAPPED';
                        const isFulfilled = order.status === 'FULFILLED'; // Only exclude FULFILLED, not FINALIZED
                        
                        return (
                          <>
                            {/* Push to Layup/Plugging Button - Only for P1 Production Queue */}
                            {!isScrapped && !isComplete && !isFulfilled && order.currentDepartment === 'P1 Production Queue' && (
                              <Button
                                size="sm"
                                onClick={() => handlePushToLayupPlugging(order.orderId)}
                                disabled={progressOrderMutation.isPending}
                                className="bg-green-600 hover:bg-green-700 text-white"
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                Push to Layup/Plugging
                              </Button>
                            )}
                            
                            {/* Progress to Next Department Button - For all other departments */}
                            {!isScrapped && !isComplete && !isFulfilled && nextDept && order.currentDepartment !== 'P1 Production Queue' && (
                              <Button
                                size="sm"
                                onClick={() => handleProgressOrder(order.orderId, nextDept)}
                                disabled={progressOrderMutation.isPending}
                                className={progressOrderMutation.isPending ? 'opacity-50 cursor-not-allowed' : ''}
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                {progressOrderMutation.isPending ? 'Progressing...' : nextDept}
                              </Button>
                            )}
                            
                            {/* More Actions Dropdown */}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem 
                                  onClick={() => handleViewSalesOrder(order.orderId)}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Sales Order PDF
                                </DropdownMenuItem>
                                {!order.isCancelled && (
                                  <DropdownMenuItem 
                                    onClick={() => handleCancelOrder(order.orderId)}
                                    className="text-red-600"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancel Order
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        );
                      })()}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {orders.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              No orders found for the selected criteria
            </div>
          )}
        </CardContent>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="text-sm text-gray-500">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalOrders)} of {totalOrders} orders
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious 
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
                
                {/* Page Numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNumber;
                  if (totalPages <= 5) {
                    pageNumber = i + 1;
                  } else if (currentPage <= 3) {
                    pageNumber = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNumber = totalPages - 4 + i;
                  } else {
                    pageNumber = currentPage - 2 + i;
                  }
                  
                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNumber)}
                        isActive={currentPage === pageNumber}
                        className="cursor-pointer"
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                {totalPages > 5 && currentPage < totalPages - 2 && (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                )}
                
                <PaginationItem>
                  <PaginationNext 
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </Card>

      {/* Cancel Order Dialog */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order {orderToCancel}? This action cannot be undone.
              Please provide a reason for cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <Textarea
              placeholder="Enter reason for cancellation..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              disabled={!cancelReason.trim() || cancelOrderMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {cancelOrderMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
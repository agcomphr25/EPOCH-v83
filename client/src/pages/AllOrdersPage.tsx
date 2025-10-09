import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
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
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Search, X, Download, MoreHorizontal, XCircle, ArrowRight, AlertTriangle, Edit, FileText, QrCode, User, CalendarDays, Package, Mail, MessageSquare, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import CustomerDetailsTooltip from '@/components/CustomerDetailsTooltip';
import OrderSummaryTooltip from '@/components/OrderSummaryTooltip';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import CommunicationCompose from '@/components/CommunicationCompose';
import { getDisplayOrderId } from '@/lib/orderUtils';
import hotToast from 'react-hot-toast';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customer?: string;
  product?: string;
  customerPO?: string;
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
  barcode?: string;
}

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
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
  const [communicationModal, setCommunicationModal] = useState<{
    isOpen: boolean;
    customer: { id: number; name: string; email?: string; phone?: string };
    orderId?: string;
  } | null>(null);
  const [, setLocation] = useLocation();

  // Department progression flow
  const departments = [
    'P1 Production Queue',
    'Layup/Plugging',
    'Barcode',
    'CNC',
    'Gunsmith',
    'Finish',
    'Finish QC',
    'Paint',
    'Shipping QC',
    'Shipping',
    'Fulfilled'
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

  // Fetch ALL orders (not paginated) - using same pattern as OrdersList
  const { data: allOrders, isLoading, error } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: () => apiRequest('/api/orders/with-payment-status'),
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Fetch customers for communication
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch kickbacks to check for unresolved issues
  const { data: kickbacks } = useQuery<any[]>({
    queryKey: ['/api/kickbacks'],
    refetchInterval: 60000,
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    onSuccess: () => {
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

  // CSV Export handlers
  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/orders/export/csv');
      if (!response.ok) {
        throw new Error('Failed to export CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `orders_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('CSV export error:', error);
      hotToast.error('Failed to export CSV. Please try again.');
    }
  };

  const handleExportAllCSV = async () => {
    try {
      const response = await fetch('/api/orders/export/csv-all');
      if (!response.ok) {
        throw new Error('Failed to export all orders CSV');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `all_orders_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Full CSV export error:', error);
      hotToast.error('Failed to export all orders CSV. Please try again.');
    }
  };

  const handleCancelOrder = (orderId: string) => {
    setOrderToCancel(orderId);
    setIsDialogOpen(true);
  };

  const handleViewSalesOrder = (orderId: string) => {
    window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');
  };

  const confirmCancel = () => {
    if (orderToCancel && cancelReason.trim()) {
      cancelOrderMutation.mutate({ orderId: orderToCancel, reason: cancelReason });
    }
  };

  const handleKickbackClick = () => {
    setLocation('/kickback-tracking');
  };

  const handleOpenCommunication = (order: Order, customersList: Customer[]) => {
    const customer = customersList?.find(c => c.id.toString() === order.customerId);
    if (customer) {
      setCommunicationModal({
        isOpen: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone
        },
        orderId: order.orderId
      });
    }
  };

  const handleCloseCommunication = () => {
    setCommunicationModal(null);
  };

  // Check if an order has unresolved kickbacks
  const hasUnresolvedKickback = (orderId: string) => {
    if (!kickbacks) return false;
    return kickbacks?.some((kickback: any) => 
      kickback.orderId === orderId && 
      kickback.status !== 'RESOLVED' && 
      kickback.status !== 'CLOSED'
    );
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

  const getDepartmentDisplayName = (department: string) => {
    if (department === 'Fulfilled') {
      return 'Shipping Management';
    }
    return department;
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'HOLDING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'FINALIZED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'IN_PROGRESS':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'FULFILLED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'SHIPPED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  // Filter orders based on search and department, excluding cancelled orders
  const filteredOrders = React.useMemo(() => {
    if (!allOrders) return [];

    return allOrders.filter(order => {
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
        order.fbOrderNumber?.toLowerCase(),
        order.customer?.toLowerCase(),
        order.customerId?.toLowerCase(),
        order.product?.toLowerCase(),
        order.modelId?.toLowerCase()
      ].filter(Boolean);

      const searchMatch = searchFields.some(field => field?.includes(searchLower));

      return departmentMatch && searchMatch;
    });
  }, [allOrders, searchTerm, selectedDepartment]);

  // Function to calculate search relevance score
  const getSearchRelevanceScore = (order: any, searchTerm: string) => {
    if (!searchTerm.trim()) return 0;
    
    const searchLower = searchTerm.toLowerCase();
    let score = 0;
    
    if (order.orderId?.toLowerCase() === searchLower) score += 100;
    else if (order.orderId?.toLowerCase().startsWith(searchLower)) score += 50;
    else if (order.orderId?.toLowerCase().includes(searchLower)) score += 20;
    
    if (order.fbOrderNumber?.toLowerCase() === searchLower) score += 90;
    else if (order.fbOrderNumber?.toLowerCase().startsWith(searchLower)) score += 45;
    else if (order.fbOrderNumber?.toLowerCase().includes(searchLower)) score += 18;
    
    if (order.customer?.toLowerCase() === searchLower) score += 80;
    else if (order.customer?.toLowerCase().startsWith(searchLower)) score += 40;
    else if (order.customer?.toLowerCase().includes(searchLower)) score += 15;
    
    return score;
  };

  // Sort orders based on search relevance first, then selected sort option
  const sortedOrders = React.useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      if (searchTerm.trim()) {
        const scoreA = getSearchRelevanceScore(a, searchTerm);
        const scoreB = getSearchRelevanceScore(b, searchTerm);
        
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }
      }
      
      switch (sortBy) {
        case 'orderDate':
          return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
        case 'dueDate':
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'customer':
          return (a.customer || '').localeCompare(b.customer || '');
        case 'model':
          return (a.modelId || '').localeCompare(b.modelId || '');
        case 'enteredDate':
          return new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime();
        default:
          return 0;
      }
    });
  }, [filteredOrders, searchTerm, sortBy]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepartment, sortBy]);

  // Calculate client-side pagination
  const paginationData = React.useMemo(() => {
    const totalOrders = sortedOrders.length;
    const totalPages = Math.ceil(totalOrders / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const orders = sortedOrders.slice(startIndex, endIndex);
    
    return { totalOrders, totalPages, orders };
  }, [sortedOrders, currentPage, pageSize]);

  const { totalOrders, totalPages, orders } = paginationData;

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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="h-6 w-6" />
          All Orders
        </h1>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleExportCSV}
            variant="outline" 
            className="flex items-center gap-2"
            data-testid="export-csv-button"
          >
            <Download className="h-4 w-4" />
            Export CSV (Active)
          </Button>
          <Button 
            onClick={handleExportAllCSV}
            variant="outline" 
            className="flex items-center gap-2"
            data-testid="export-all-csv-button"
          >
            <Download className="h-4 w-4" />
            Export All CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <span>Orders ({sortedOrders.length})</span>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages} ({totalOrders} total orders)
              </span>
            </div>
            <div className="flex items-center gap-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by Order ID, Customer, FB Order #..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-96"
                  data-testid="input-search-orders"
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
                <TableHead>Customer PO</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => (
                <TableRow key={order.orderId} className={cn(order.isVerified ? "bg-green-50 dark:bg-green-950" : "")}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <OrderSummaryTooltip orderId={order.orderId}>
                        <span className="text-blue-600 hover:text-blue-800 cursor-pointer">
                          {getDisplayOrderId(order)}
                        </span>
                      </OrderSummaryTooltip>
                      {order.status && (
                        <Badge 
                          className={`${getStatusColor(order.status)} text-xs px-1 py-0`}
                          title={`Order Status: ${order.status}`}
                        >
                          {order.status}
                        </Badge>
                      )}
                      {hasUnresolvedKickback(order.orderId) && (
                        <Badge 
                          className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-xs px-1 py-0 cursor-pointer hover:bg-red-200 hover:text-red-900 transition-colors"
                          title="This order has unresolved kickbacks - Click to view Kickback Tracking"
                          onClick={handleKickbackClick}
                        >
                          KICKBACK
                        </Badge>
                      )}
                      {order.isFullyPaid ? (
                        <Badge 
                          className="bg-green-500 hover:bg-green-600 text-white text-xs px-1 py-0"
                          title="Order is paid"
                        >
                          PAID
                        </Badge>
                      ) : (
                        <Badge 
                          className="bg-red-500 hover:bg-red-600 text-white text-xs px-1 py-0"
                        >
                          NOT PAID
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {getDepartmentDisplayName(order.currentDepartment) || 'Not Set'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="relative group">
                      <CustomerDetailsTooltip 
                        customerId={order.customerId} 
                        customerName={order.customer || 'N/A'}
                      >
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          {order.customer || 'N/A'}
                        </div>
                      </CustomerDetailsTooltip>

                      {/* Communication Buttons - Show on Hover */}
                      <div className="absolute left-0 top-full mt-1 hidden group-hover:flex bg-white border border-gray-200 rounded-md shadow-lg p-1 z-10">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:bg-blue-50"
                          onClick={() => handleOpenCommunication(order, customers || [])}
                          title="Send Email"
                        >
                          <Mail className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:bg-green-50"
                          onClick={() => handleOpenCommunication(order, customers || [])}
                          title="Send SMS"
                        >
                          <MessageSquare className="h-4 w-4 text-green-600" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-gray-600">
                      {order.customerPO || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-gray-400" />
                      {order.product || order.modelId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-gray-400" />
                      {order.orderDate ? format(new Date(order.orderDate), 'MMM d, yyyy') : '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-gray-400" />
                      {order.dueDate ? format(new Date(order.dueDate), 'MMM d, yyyy') : '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {/* Edit Button */}
                      <Link href={`/order-entry?draft=${order.orderId}`}>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      
                      {/* View Sales Order */}
                      <Badge
                        variant="outline"
                        className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs ml-1 border-blue-300 text-blue-700 dark:text-blue-300"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewSalesOrder(order.orderId);
                        }}
                      >
                        <Eye className="w-3 h-3" />
                      </Badge>

                      {/* Barcode Button */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <QrCode className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>Order Barcode</DialogTitle>
                          </DialogHeader>
                          {order.barcode && <BarcodeDisplay orderId={order.orderId} barcode={order.barcode} />}
                        </DialogContent>
                      </Dialog>

                      {/* Progress Button */}
                      {(() => {
                        const nextDept = getNextDepartment(order.currentDepartment);
                        const isComplete = order.currentDepartment === 'Fulfilled';
                        const isScrapped = order.status === 'SCRAPPED';
                        const isFulfilled = order.status === 'FULFILLED';

                        if (!isScrapped && !isComplete && !isFulfilled && nextDept) {
                          return (
                            <Button
                              size="sm"
                              onClick={() => handleProgressOrder(order.orderId, nextDept)}
                              disabled={progressOrderMutation.isPending}
                            >
                              <ArrowRight className="w-4 h-4 mr-1" />
                              {getDepartmentDisplayName(nextDept)}
                            </Button>
                          );
                        }
                        return null;
                      })()}

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
                          <DropdownMenuItem 
                            onClick={() => setLocation('/kickback-tracking')}
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            Report Kickback
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {sortedOrders.length === 0 && !isLoading && (
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

      {/* Communication Modal */}
      {communicationModal && (
        <CommunicationCompose
          isOpen={communicationModal.isOpen}
          onClose={handleCloseCommunication}
          customer={communicationModal.customer}
          orderId={communicationModal.orderId}
        />
      )}

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

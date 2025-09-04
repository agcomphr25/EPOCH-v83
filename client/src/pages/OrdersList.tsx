import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Edit, Eye, Package, CalendarDays, User, FileText, Download, QrCode, ArrowRight, Search, TrendingDown, Plus, CalendarIcon, Mail, MessageSquare, MoreHorizontal, XCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import CustomerDetailsTooltip from '@/components/CustomerDetailsTooltip';
import OrderSummaryTooltip from '@/components/OrderSummaryTooltip';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertKickbackSchema } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getDisplayOrderId } from '@/lib/orderUtils';
import toast from 'react-hot-toast';
import CommunicationCompose from '@/components/CommunicationCompose';

// Form validation schema for kickback creation
const kickbackFormSchema = insertKickbackSchema.extend({
  kickbackDate: z.date(),
  resolvedAt: z.date().optional().nullable(),
});

type KickbackFormData = z.infer<typeof kickbackFormSchema>;

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerPO: string;
  fbOrderNumber: string;
  agrOrderDetails: string;
  isCustomOrder: string | null;
  modelId: string;
  handedness: string;
  features: any;
  featureQuantities: any;
  discountCode: string;
  shipping: number;
  status: string;
  currentDepartment?: string;
  barcode?: string;
  // Payment Information
  isPaid: boolean;
  paymentType?: string;
  paymentAmount?: number;
  paymentDate?: string;
  paymentTimestamp?: string;
  paymentTotal?: number;
  isFullyPaid?: boolean;
  // Cancellation Information
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  // Verification Information
  isVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  customerType: string;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function OrdersList() {
  console.log('OrdersList component rendering - with CSV export');
  const [selectedOrderBarcode, setSelectedOrderBarcode] = useState<{orderId: string, barcode: string} | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedOrderForKickback, setSelectedOrderForKickback] = useState<Order | null>(null);
  const [isKickbackDialogOpen, setIsKickbackDialogOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('orderDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [communicationModal, setCommunicationModal] = useState<{
    isOpen: boolean;
    customer: { id: number; name: string; email?: string; phone?: string };
    orderId?: string;
  } | null>(null);
  const { toast: showToast } = useToast();
  const [, setLocation] = useLocation();

  // Cancel order state
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string>('');

  // Initialize kickback form
  const kickbackForm = useForm<KickbackFormData>({
    resolver: zodResolver(kickbackFormSchema),
    defaultValues: {
      kickbackDate: new Date(),
      status: 'OPEN',
      priority: 'MEDIUM',
      impactedDepartments: [],
    },
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
      showToast({
        title: "Order Cancelled",
        description: "The order has been cancelled successfully.",
      });
      setIsCancelDialogOpen(false);
      setCancelReason('');
      setOrderToCancel('');
    },
    onError: (error: any) => {
      showToast({
        title: "Error",
        description: "Failed to cancel order: " + (error.message || 'Unknown error'),
        variant: "destructive",
      });
    }
  });

  // Create kickback mutation
  const createKickbackMutation = useMutation({
    mutationFn: async (data: KickbackFormData) => {
      return apiRequest('/api/kickbacks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      // Invalidate kickback queries so KickbackTracking component refreshes
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/kickbacks/analytics'] });

      showToast({ title: 'Success', description: 'Kickback reported successfully' });
      kickbackForm.reset();
      setIsKickbackDialogOpen(false);
      setSelectedOrderForKickback(null);
    },
    onError: (error: any) => {
      showToast({ 
        title: 'Error', 
        description: error?.message || 'Failed to create kickback',
        variant: 'destructive'
      });
    }
  });

  // Handle kickback form submission
  const onKickbackSubmit = (data: KickbackFormData) => {
    createKickbackMutation.mutate(data);
  };

  // Handle opening kickback dialog for specific order
  const handleReportKickback = (order: Order) => {
    setSelectedOrderForKickback(order);
    kickbackForm.setValue('orderId', order.orderId);
    setIsKickbackDialogOpen(true);
  };

  // Department progression functions
  const getNextDepartment = (currentDepartment: string) => {
    const departmentFlow = [
      'P1 Production Queue', 'Layup/Plugging', 'Barcode', 'CNC', 'Finish', 'Gunsmith', 'Paint', 'Shipping QC', 'Shipping'
    ];

    // Handle alternative department names
    const normalizedDepartment = currentDepartment === 'Layup' ? 'Layup/Plugging' : currentDepartment;

    const currentIndex = departmentFlow.indexOf(normalizedDepartment);
    if (currentIndex >= 0 && currentIndex < departmentFlow.length - 1) {
      return departmentFlow[currentIndex + 1];
    }
    return null;
  };

  // Local state for immediate UI updates - using reliable dual approach
  const [localOrderUpdates, setLocalOrderUpdates] = React.useState<Record<string, string>>({});

  // Track orders being updated to prevent query invalidation interference
  const [updatingOrders, setUpdatingOrders] = React.useState<Set<string>>(new Set());

  // Progress order mutation with immediate local state update
  const progressOrderMutation = useMutation({
    mutationFn: async ({ orderId, nextDepartment }: { orderId: string, nextDepartment: string }) => {
      const requestBody = {
        orderIds: [orderId],
        department: nextDepartment,
        status: 'IN_PROGRESS'
      };

      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
      return response;
    },
    onSuccess: (data, variables) => {
      console.log(`✅ API Success: ${variables.orderId} -> ${variables.nextDepartment}`);
      toast.success('Department updated');

      // Cache is already updated from button click - just clean up local state
      setTimeout(() => {
        setLocalOrderUpdates(prev => {
          const newState = { ...prev };
          delete newState[variables.orderId];
          return newState;
        });
        setUpdatingOrders(prev => {
          const newSet = new Set(prev);
          newSet.delete(variables.orderId);
          return newSet;
        });
      }, 1000); // Longer delay to ensure UI stability
    },
    onError: (err, variables) => {
      // Remove failed local update and updating flag immediately
      setLocalOrderUpdates(prev => {
        const newState = { ...prev };
        delete newState[variables.orderId];
        return newState;
      });
      setUpdatingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders/with-payment-status'] });
      toast.error('Failed to update department');
    }
  });

  const handleProgressOrder = React.useCallback((orderId: string, currentDepartment: string) => {
    const nextDepartment = getNextDepartment(currentDepartment);
    if (!nextDepartment) {
      toast.error('No next department available');
      return;
    }

    console.log(`🔄 Progressing order ${orderId} from ${currentDepartment} to ${nextDepartment}`);

    // IMMEDIATELY update React Query cache - this prevents any reversion
    queryClient.setQueryData(['/api/orders/with-payment-status', 'v2'], (old: any[]) => {
      if (!old) return old;
      const updated = old.map((order: any) => {
        if (order.orderId === orderId) {
          console.log(`✅ Cache updated: ${orderId} -> ${nextDepartment}`);
          return { ...order, currentDepartment: nextDepartment };
        }
        return order;
      });
      return updated;
    });

    // Also update local state for redundancy
    setLocalOrderUpdates(prev => ({ ...prev, [orderId]: nextDepartment }));

    // Make the API call in the background
    progressOrderMutation.mutate({ orderId, nextDepartment });
  }, [progressOrderMutation, queryClient]);

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

  const handleKickbackClick = () => {
    setLocation('/kickback-tracking');
  };

  // Function to handle sales order view - downloads PDF
  const handleSalesOrderView = async (orderId: string) => {
    try {
      const response = await fetch(`/api/shipping-pdf/sales-order/${orderId}`);

      if (!response.ok) {
        throw new Error('Failed to generate sales order PDF');
      }

      // Get the PDF blob
      const blob = await response.blob();

      // Create a URL for the blob
      const url = window.URL.createObjectURL(blob);

      // Create a link and trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sales-Order-${orderId}.pdf`;
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast({
        title: "Success",
        description: "Sales order PDF downloaded successfully",
      });
    } catch (error) {
      showToast({
        title: "Error",
        description: "Failed to download sales order PDF",
        variant: "destructive",
      });
    }
  };

  const handleCancelOrder = (orderId: string) => {
    setOrderToCancel(orderId);
    setIsCancelDialogOpen(true);
  };

  const confirmCancel = () => {
    if (orderToCancel && cancelReason.trim()) {
      cancelOrderMutation.mutate({ orderId: orderToCancel, reason: cancelReason });
    }
  };

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
      alert('Failed to export CSV. Please try again.');
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
      alert('Failed to export all orders CSV. Please try again.');
    }
  };

  try {
    const { data: orders, isLoading, error } = useQuery<Order[]>({
      queryKey: ['/api/orders/with-payment-status', 'v2'],
      queryFn: () => apiRequest('/api/orders/with-payment-status'),
      refetchInterval: false, // Completely disable automatic refetching
      refetchOnWindowFocus: false, // Disable refetch on window focus
      refetchOnReconnect: false, // Disable refetch on network reconnect
    });

    // Debug logging to check if isVerified field is present
    if (orders && orders.length > 0) {
      const testOrder = orders.find(o => o.orderId === 'AG640');
      if (testOrder) {
        console.log('🔍 DEBUG: AG640 order data:', testOrder);
        console.log('🔍 DEBUG: AG640 isVerified:', testOrder.isVerified);
        console.log('🔍 DEBUG: AG640 keys:', Object.keys(testOrder));
      }
    }

    const { data: customers } = useQuery<Customer[]>({
      queryKey: ['/api/customers'],
    });

    const { data: stockModels } = useQuery<StockModel[]>({
      queryKey: ['/api/stock-models'],
    });

    // Fetch kickbacks to check for unresolved issues
    const { data: kickbacks } = useQuery<any[]>({
      queryKey: ['/api/kickbacks'],
      refetchInterval: 60000, // Auto-refresh every 60 seconds
    });

    console.log('Orders data:', orders);
    console.log('Customers data:', customers);
    console.log('Loading state:', isLoading);
    console.log('Error state:', error);

  const getCustomerName = (customerId: string) => {
    if (!customers || !customerId) return customerId || '';
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.name || customerId || '';
  };

  const getCustomerPhone = (customerId: string) => {
    if (!customers || !customerId) return '';
    const customer = customers.find(c => c.id.toString() === customerId);
    return customer?.phone || '';
  };

  // Get unique departments for filter options
  const availableDepartments = useMemo(() => {
    if (!orders) return [];
    const departments = orders
      .map(order => order.currentDepartment || 'Not Set')
      .filter((dept, index, arr) => arr.indexOf(dept) === index)
      .sort();
    return departments;
  }, [orders]);

  // Filter and sort orders based on search term, department filter, and sort options
  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    let filtered = [...orders];

    // Exclude cancelled orders from main list
    filtered = filtered.filter((order) => !order.isCancelled && order.status !== 'CANCELLED');

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((order) => {
        // Search by Order ID
        if (order.orderId && order.orderId.toLowerCase().includes(term)) {
          return true;
        }

        // Search by Customer Name
        const customerName = getCustomerName(order.customerId);
        if (customerName && customerName.toLowerCase().includes(term)) {
          return true;
        }

        // Search by Customer Phone
        const customerPhone = getCustomerPhone(order.customerId);
        if (customerPhone && customerPhone.toLowerCase().includes(term)) {
          return true;
        }

        // Search by FB Order Number
        if (order.fbOrderNumber && order.fbOrderNumber.toLowerCase().includes(term)) {
          return true;
        }

        return false;
      });
    }

    // Apply department filter
    if (departmentFilter !== 'all') {
      filtered = filtered.filter(order => {
        const dept = order.currentDepartment || 'Not Set';
        return dept === departmentFilter;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'department':
          aValue = a.currentDepartment || 'Not Set';
          bValue = b.currentDepartment || 'Not Set';
          break;
        case 'orderId':
          aValue = a.orderId;
          bValue = b.orderId;
          break;
        case 'customer':
          aValue = getCustomerName(a.customerId);
          bValue = getCustomerName(b.customerId);
          break;
        case 'model':
          aValue = a.modelId || '';
          bValue = b.modelId || '';
          break;
        case 'dueDate':
          aValue = new Date(a.dueDate);
          bValue = new Date(b.dueDate);
          break;
        case 'enteredDate':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        case 'orderDate':
        default:
          aValue = new Date(a.orderDate);
          bValue = new Date(b.orderDate);
          break;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [orders, customers, searchTerm, departmentFilter, sortBy, sortOrder]);

  const getModelDisplayName = (modelId: string) => {
    if (!stockModels) return modelId;
    const model = stockModels.find(m => m.id === modelId);
    return model ? model.displayName : modelId;
  };

  const getStockModelName = (modelId: string | null) => {
    if (!modelId) return '';
    const stockModel = stockModels?.find(sm => sm.id === modelId);
    return stockModel ? stockModel.displayName : '';
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

  const getActionLengthAbbreviation = (features: any) => {
    if (!features || typeof features !== 'object') return '';

    const actionLength = features.action_length;
    if (!actionLength) return '';

    switch (actionLength.toLowerCase()) {
      case 'long':
        return 'LA';
      case 'medium':
        return 'MA';
      case 'short':
        return 'SA';
      default:
        return actionLength.toUpperCase().substring(0, 2);
    }
  };

  const getPaintOption = (features: any) => {
    if (!features || typeof features !== 'object') return 'Standard';

    const paintOptions = [];

    // Check for paint_options_combined first (newer format)
    if (features.paint_options_combined) {
      const combined = features.paint_options_combined;
      if (typeof combined === 'string') {
        // Parse format like "camo_patterns:canyon_rogue" or "cerakote_colors:carbon_black"
        const parts = combined.split(':');
        if (parts.length === 2) {
          const [category, value] = parts;
          // Convert underscore format to display format with proper casing
          let displayValue = value.replace(/_/g, ' ');

          // Handle special cases and proper capitalization
          displayValue = displayValue.replace(/\b\w/g, l => l.toUpperCase());

          // Fix common formatting issues
          displayValue = displayValue
            .replace(/Rogue/g, 'Rogue')
            .replace(/Camo/g, 'Camo')
            .replace(/Web/g, 'Web')
            .replace(/Desert Night/g, 'Desert Night')
            .replace(/Carbon/g, 'Carbon');

          paintOptions.push(displayValue);
        }
      }
    }

    // Check for individual paint/coating features
    const paintKeys = [
      'cerakote_color', 
      'cerakote_colors',
      'camo_patterns',
      'paint_finish', 
      'coating', 
      'finish',
      'protective_coatings',
      'surface_treatment',
      'anodizing',
      'powder_coating'
    ];

    for (const key of paintKeys) {
      if (features[key] && features[key] !== '' && features[key] !== 'none') {
        // Convert underscore format to display format
        const displayValue = features[key].replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        paintOptions.push(displayValue);
      }
    }

    // If no paint options found, return Standard
    if (paintOptions.length === 0) {
      return 'Standard';
    }

    // Combine all paint options into a single line
    return paintOptions.join(' + ');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-red-600">
              Error loading orders. Please try again later.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800';
      case 'FINALIZED':
        return 'bg-green-100 text-green-800';
      case 'SHIPPED':
        return 'bg-blue-100 text-blue-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="h-6 w-6" />
              All Orders
            </h1>
            <p className="text-gray-600 mt-1">
              View and manage all created orders - with CSV export
            </p>
          </div>
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
            <Link href="/order-entry">
              <Button className="flex items-center gap-2" data-testid="create-order-button">
                <FileText className="h-4 w-4" />
                Create New Order
              </Button>
            </Link>
          </div>
        </div>

        {/* Search and Filter Controls */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder="Search by Order ID, Customer Name, Phone, or FB Order #..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            {searchTerm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchTerm('')}
                className="px-3"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Filter and Sort Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <Label htmlFor="department-filter" className="text-sm font-medium whitespace-nowrap">
                Department:
              </Label>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-40" id="department-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {availableDepartments.map(dept => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort By */}
            <div className="flex items-center gap-2">
              <Label htmlFor="sort-by" className="text-sm font-medium whitespace-nowrap">
                Sort by:
              </Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40" id="sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="orderDate">Order Date</SelectItem>
                  <SelectItem value="dueDate">Due Date</SelectItem>
                  <SelectItem value="enteredDate">Entered Date</SelectItem>
                  <SelectItem value="orderId">Order ID</SelectItem>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="model">Model</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort Order */}
            <div className="flex items-center gap-2">
              <Label htmlFor="sort-order" className="text-sm font-medium whitespace-nowrap">
                Order:
              </Label>
              <Select value={sortOrder} onValueChange={(value: 'asc' | 'desc') => setSortOrder(value)}>
                <SelectTrigger className="w-32" id="sort-order">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button */}
            {(departmentFilter !== 'all' || sortBy !== 'orderDate' || sortOrder !== 'desc') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDepartmentFilter('all');
                  setSortBy('orderDate');
                  setSortOrder('desc');
                }}
                className="px-3"
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>
      </div>

      {!filteredOrders || filteredOrders.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              {searchTerm ? (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders match your search</h3>
                  <p className="text-gray-600 mb-4">
                    No orders found for "{searchTerm}". Try a different search term.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setSearchTerm('')}
                  >
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders found</h3>
                  <p className="text-gray-600 mb-4">
                    You haven't created any orders yet. Start by creating your first order.
                  </p>
                  <Link href="/order-entry">
                    <Button>
                      Create Your First Order
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Orders ({filteredOrders.length}{searchTerm ? ` of ${orders?.length || 0}` : ''})
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
                  <TableHead>Model</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow 
                    key={order.id}
                    className={cn(
                      order.isCustomOrder === 'yes' ? 'bg-pink-50 hover:bg-pink-100' : '',
                      order.isVerified ? 'bg-green-50 hover:bg-green-100' : ''
                    )}
                  >
                    <TableCell className="font-medium" title={order.fbOrderNumber ? `FB Order: ${order.fbOrderNumber} (Order ID: ${order.orderId})` : `Order ID: ${order.orderId}`}>
                      <div className="flex items-center gap-2">
                        <OrderSummaryTooltip orderId={order.orderId}>
                          <span className="text-blue-600 hover:text-blue-800 cursor-pointer">
                            {getDisplayOrderId(order)}
                          </span>
                        </OrderSummaryTooltip>
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
                            title={`Paid $${order.paymentAmount || 0} via ${order.paymentType || 'Unknown'} ${order.paymentDate ? `on ${format(new Date(order.paymentDate), 'MMM d, yyyy')}` : ''}`}
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
                        {order.isCancelled && (
                          <Badge variant="destructive" className="bg-red-100 text-red-800 text-xs px-1 py-0">
                            CANCELLED
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {localOrderUpdates[order.orderId] || order.currentDepartment || 'Not Set'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="relative group">
                        <CustomerDetailsTooltip 
                          customerId={order.customerId} 
                          customerName={getCustomerName(order.customerId) || 'N/A'}
                        >
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            {getCustomerName(order.customerId) || 'N/A'}
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
                        {getModelDisplayName(order.modelId) || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-gray-400" />
                        {format(new Date(order.orderDate), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-gray-400" />
                        {format(new Date(order.dueDate), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {/* IMPORTANT: Use order.orderId (e.g. "AG245") NOT order.id (database record ID) 
                            The order entry page expects the actual order identifier */}
                        <Link href={`/order-entry?draft=${order.orderId}`}>
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs ml-1 border-blue-300 text-blue-700 dark:text-blue-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSalesOrderView(order.orderId);
                          }}
                        >
                          <Eye className="w-3 h-3" />
                        </Badge>
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 text-xs ml-1 border-orange-300 text-orange-700 dark:text-orange-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReportKickback(order);
                          }}
                          title="Report Kickback"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Kickback
                        </Badge>
                        {(() => {
                          // Use local update if available, otherwise server data
                          const displayDepartment = localOrderUpdates[order.orderId] || order.currentDepartment;
                          const nextDept = getNextDepartment(displayDepartment || '');
                          const isComplete = displayDepartment === 'Shipping';
                          const isScrapped = order.status === 'SCRAPPED';
                          const isFulfilled = order.status === 'FULFILLED'; // Only exclude FULFILLED, not FINALIZED

                          if (!isScrapped && !isComplete && !isFulfilled && nextDept) {
                            return (
                              <Button
                                size="sm"
                                onClick={() => handleProgressOrder(order.orderId, displayDepartment || '')}
                                disabled={progressOrderMutation.isPending}
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                {nextDept}
                              </Button>
                            );
                          }
                          return null;
                        })()}
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
                            {selectedOrderBarcode && (
                              <BarcodeDisplay 
                                orderId={selectedOrderBarcode.orderId}
                                barcode={selectedOrderBarcode.barcode}
                                showTitle={false}
                                customerName={getCustomerName(order.customerId)}
                                orderDate={order.orderDate}
                                dueDate={order.dueDate}
                                status={order.status}
                                actionLength={getActionLengthAbbreviation(order.features)}
                                stockModel={getStockModelName(order.modelId)}
                                paintOption={getPaintOption(order.features)}
                              />
                            )}
                          </DialogContent>
                        </Dialog>

                        {/* More Actions Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!order.isCancelled && (
                              <DropdownMenuItem 
                                onClick={() => handleCancelOrder(order.orderId)}
                                className="text-red-600"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Order
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem 
                              onClick={() => handleSalesOrderView(order.orderId)}
                              className="text-blue-600"
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View Sales Order
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleSalesOrderView(order.orderId)}
                              className="text-blue-600"
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              Download Sales Order
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Kickback Report Modal */}
      <Dialog open={isKickbackDialogOpen} onOpenChange={setIsKickbackDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Report Kickback for {selectedOrderForKickback?.orderId}</DialogTitle>
            <DialogDescription>
              Report a production issue that requires attention for this order
            </DialogDescription>
          </DialogHeader>
          <Form {...kickbackForm}>
            <form onSubmit={kickbackForm.handleSubmit(onKickbackSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={kickbackForm.control}
                  name="orderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Order ID</FormLabel>
                      <FormControl>
                        <Input {...field} disabled />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={kickbackForm.control}
                  name="kickbackDept"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Layup">Layup</SelectItem>
                          <SelectItem value="Plugging">Plugging</SelectItem>
                          <SelectItem value="CNC">CNC</SelectItem>
                          <SelectItem value="Finish">Finish</SelectItem>
                          <SelectItem value="Gunsmith">Gunsmith</SelectItem>
                          <SelectItem value="Paint">Paint</SelectItem>
                          <SelectItem value="QC">QC</SelectItem>
                          <SelectItem value="Shipping">Shipping</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={kickbackForm.control}
                  name="reasonCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason Code</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select reason" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MATERIAL_DEFECT">Material Defect</SelectItem>
                          <SelectItem value="OPERATOR_ERROR">Operator Error</SelectItem>
                          <SelectItem value="MACHINE_FAILURE">Machine Failure</SelectItem>
                          <SelectItem value="DESIGN_ISSUE">Design Issue</SelectItem>
                          <SelectItem value="QUALITY_ISSUE">Quality Issue</SelectItem>
                          <SelectItem value="PROCESS_ISSUE">Process Issue</SelectItem>
                          <SelectItem value="SUPPLIER_ISSUE">Supplier Issue</SelectItem>
                          <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={kickbackForm.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                          <SelectItem value="CRITICAL">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={kickbackForm.control}
                  name="kickbackDate"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Kickback Date</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP")
                              ) : (
                                <span>Pick a date</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={kickbackForm.control}
                  name="reportedBy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reported By</FormLabel>
                      <FormControl>
                        <Input placeholder="Employee name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={kickbackForm.control}
                name="reasonText"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Detailed description of the issue..."
                        className="resize-none"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsKickbackDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createKickbackMutation.isPending}>
                  {createKickbackMutation.isPending ? 'Reporting...' : 'Report Kickback'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Dialog */}
      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
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

      {/* Communication Compose Modal */}
      {communicationModal && (
        <CommunicationCompose
          isOpen={communicationModal.isOpen}
          onClose={handleCloseCommunication}
          customer={communicationModal.customer}
          orderId={communicationModal.orderId}
        />
      )}

    </div>
  );
  } catch (error) {
    console.error('Error in OrdersList component:', error);
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Orders</h3>
            <p className="text-red-700">An error occurred while loading the orders page. Please try refreshing the page.</p>
            <p className="text-sm text-red-600 mt-2">Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        </div>
      </div>
    );
  }
}
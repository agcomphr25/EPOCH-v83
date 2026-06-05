import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Search,
  X,
  Download,
  MoreHorizontal,
  XCircle,
  ArrowRight,
  AlertTriangle,
  Edit,
  FileText,
  QrCode,
  User,
  CalendarDays,
  Package,
  Mail,
  MessageSquare,
  Eye,
  RefreshCw,
  FileDown,
  Paperclip,
  Image as ImageIcon,
  File,
} from 'lucide-react';
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
import TicketBadge, { useOrderTicketCounts } from '@/components/TicketBadge';

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
  modelDisplayName?: string;
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
  shippedDate?: string;
  layupCompletedAt?: string;
  pluggingCompletedAt?: string;
  cncCompletedAt?: string;
  finishCompletedAt?: string;
  gunsmithCompletedAt?: string;
  paintCompletedAt?: string;
  qcCompletedAt?: string;
  shippingCompletedAt?: string;
}

function getDeptEntryDate(order: { currentDepartment: string; createdAt?: string; layupCompletedAt?: string; pluggingCompletedAt?: string; cncCompletedAt?: string; finishCompletedAt?: string; gunsmithCompletedAt?: string; paintCompletedAt?: string; qcCompletedAt?: string }): Date | null {
  const raw = (() => {
    switch (order.currentDepartment) {
      case 'Layup':
      case 'Layup/Plugging': return order.createdAt;
      case 'Plugging':       return order.layupCompletedAt    || order.createdAt;
      case 'CNC':            return order.pluggingCompletedAt || order.createdAt;
      case 'Finish':         return order.cncCompletedAt      || order.createdAt;
      case 'Finish QC':      return order.finishCompletedAt   || order.createdAt;
      case 'Gunsmith':       return order.finishCompletedAt   || order.createdAt;
      case 'Paint':          return order.gunsmithCompletedAt || order.createdAt;
      case 'QC':             return order.paintCompletedAt    || order.createdAt;
      case 'Shipping':       return order.qcCompletedAt       || order.createdAt;
      default:               return order.createdAt;
    }
  })();
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
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

interface OrderAttachmentRow {
  id: number;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  notes?: string | null;
  createdAt: string;
}

interface MediaAttachmentRow {
  attachment: {
    id: string;
    notes?: string | null;
    attachedAt: string;
  };
  media: {
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
    title?: string | null;
  };
}

function AttachmentQuickView({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);

  const { data: orderAttachments = [], isLoading: orderAttachmentsLoading } =
    useQuery<OrderAttachmentRow[]>({
      queryKey: ['order-attachments', orderId],
      queryFn: () => apiRequest(`/api/order-attachments/${orderId}`),
      enabled: open && !!orderId,
      staleTime: 30000,
    });

  const { data: mediaAttachments = [], isLoading: mediaAttachmentsLoading } =
    useQuery<MediaAttachmentRow[]>({
      queryKey: ['/api/media/attachments', 'order', orderId],
      queryFn: async () => {
        const res = await fetch(`/api/media/attachments/order/${orderId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to fetch linked media');
        return res.json();
      },
      enabled: open && !!orderId,
      staleTime: 30000,
    });

  const isLoading = orderAttachmentsLoading || mediaAttachmentsLoading;
  const totalAttachments = orderAttachments.length + mediaAttachments.length;

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1);
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  };

  const iconFor = (mimeType?: string) => {
    if (mimeType?.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-600" />;
    if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-600" />;
    return <File className="h-4 w-4 text-gray-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="View order attachments"
          onClick={(e) => e.stopPropagation()}
          className="relative"
        >
          <Paperclip className="h-4 w-4" />
          {!isLoading && totalAttachments > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] leading-none text-white">
              {totalAttachments}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order Attachments</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {orderAttachments.map((attachment) => (
            <div
              key={`order-${attachment.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {iconFor(attachment.mimeType)}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{attachment.originalFileName}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.fileSize)}
                    {attachment.notes ? ` - ${attachment.notes}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/api/order-attachments/download/${attachment.id}`, '_blank')}
                  title="View file"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`/api/order-attachments/download/${attachment.id}?download=true`, '_blank')}
                  title="Download file"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {mediaAttachments.map((attachment) => (
            <div
              key={`media-${attachment.attachment.id}`}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {iconFor(attachment.media.mimeType)}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {attachment.media.title || attachment.media.filename}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.media.fileSize)}
                    {attachment.attachment.notes ? ` - ${attachment.attachment.notes}` : ''}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/api/media/${attachment.media.id}/download`, '_blank')}
                title="View linked media"
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {!isLoading && totalAttachments === 0 && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">
              No attachments linked to this order.
            </div>
          )}
          {isLoading && (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">
              Loading attachments...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AllOrdersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [departmentFilterMode, setDepartmentFilterMode] = useState<'include' | 'exclude'>('include');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [statusFilterMode, setStatusFilterMode] = useState<'include' | 'exclude'>('include');
  const [sortBy, setSortBy] = useState<
    'orderDate' | 'dueDate' | 'customer' | 'model' | 'enteredDate'
  >('orderDate');
  const [cancelReason, setCancelReason] = useState('');
  const [sendToRts, setSendToRts] = useState(true);
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

  // Department progression flow (Shipping is final department)
  const departments = [
    'Awaiting Customer Signature',
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
  ];

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Progress order mutation
  const progressOrderMutation = useMutation({
    mutationFn: async ({
      orderId,
      nextDepartment,
    }: {
      orderId: string;
      nextDepartment?: string;
    }) => {
      console.log(
        `🔄 Progressing order ${orderId} to ${nextDepartment || 'next department'}`
      );
      return apiRequest(`/api/orders/${orderId}/progress`, {
        method: 'POST',
        body: JSON.stringify({ nextDepartment }),
      });
    },
    onSuccess: async (data, variables) => {
      console.log(`✅ Order ${variables.orderId} progressed successfully`);
      toast({
        title: 'Success',
        description: 'Order progressed successfully',
      });

      // Clear all caches and force immediate refetch
      queryClient.clear();
      await queryClient.refetchQueries({
        queryKey: ['/api/orders/with-payment-status'],
      });
    },
    onError: (error: any, variables) => {
      console.error(`❌ Failed to progress order ${variables.orderId}:`, error);
      toast({
        title: 'Error',
        description:
          'Failed to progress order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Fetch ALL orders (not paginated) - using same pattern as OrdersList
  const {
    data: allOrders,
    isLoading,
    error,
  } = useQuery<Order[]>({
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

  // Fetch current user to check role (for admin-only features)
  const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
    queryKey: ['/api/auth/session'],
  });

  // Cancel order mutation
  const cancelOrderMutation = useMutation({
    mutationFn: async ({
      orderId,
      reason,
      sendToRts,
    }: {
      orderId: string;
      reason: string;
      sendToRts: boolean;
    }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason, sendToRts }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/with-payment-status'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/pipeline-counts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      toast({
        title: 'Order Cancelled',
        description: 'The order has been cancelled successfully.',
      });
      setIsDialogOpen(false);
      setCancelReason('');
      setSendToRts(true);
      setOrderToCancel('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          'Failed to cancel order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Undo cancel mutation (restore order)
  const undoCancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/undo-cancel/${orderId}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/with-payment-status'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/pipeline-counts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
      toast({
        title: 'Order Restored',
        description: 'The order has been restored to production queue.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          'Failed to restore order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Resend signature email mutation
  const resendSignatureEmailMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/followup-orders/${orderId}/resend-email`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Email Sent',
        description: 'Review and sign email has been resent to the customer.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          'Failed to send email: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Send updated order email mutation (creates new snapshot with current order data)
  const sendUpdatedOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/followup-orders/${orderId}/send-updated-order`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Updated Order Sent',
        description: 'A new signature request with the updated order has been sent.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          'Failed to send updated order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Email PDF Copy mutation (no signature workflow, just sends PDF attachment)
  const emailPdfCopyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/orders/${orderId}/email-pdf-copy`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'PDF Emailed',
        description: 'A PDF copy of the order has been emailed to the customer.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          'Failed to email PDF: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Test reminder mutation - manually triggers the 5-day reminder check
  const testReminderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/followup-orders/test-reminder`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Reminder Check Complete',
        description: data.message || 'Reminder check finished.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description:
          'Failed to run reminder check: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
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
      cancelOrderMutation.mutate({
        orderId: orderToCancel,
        reason: cancelReason,
        sendToRts: sendToRts,
      });
    }
  };

  const handleKickbackClick = () => {
    setLocation('/kickback-tracking');
  };

  const handleOpenCommunication = (order: Order, customersList: Customer[]) => {
    const customer = customersList?.find(
      (c) => c.id.toString() === order.customerId
    );
    if (customer) {
      setCommunicationModal({
        isOpen: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
        },
        orderId: order.orderId,
      });
    }
  };

  const handleCloseCommunication = () => {
    setCommunicationModal(null);
  };

  // Check if an order has unresolved kickbacks
  const hasUnresolvedKickback = (orderId: string) => {
    if (!kickbacks) return false;
    return kickbacks?.some(
      (kickback: any) =>
        kickback.orderId === orderId &&
        kickback.status !== 'RESOLVED' &&
        kickback.status !== 'CLOSED'
    );
  };

  // Department progression helpers
  const getNextDepartment = (currentDept: string) => {
    const index = departments.indexOf(currentDept);
    return index >= 0 && index < departments.length - 1
      ? departments[index + 1]
      : null;
  };

  const handleProgressOrder = (orderId: string, nextDepartment?: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment });
  };

  const handlePushToLayupPlugging = (orderId: string) => {
    progressOrderMutation.mutate({ orderId, nextDepartment: 'Layup/Plugging' });
  };

  const normalizeStatus = (status?: string | null) =>
    String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

  const getStatusLabel = (status?: string | null) => {
    switch (normalizeStatus(status)) {
      case 'READY_TO_SHIP':
        return 'Ready to Ship';
      case 'PENDING_SIGNATURE':
        return 'Pending Signature';
      case 'IN_PROGRESS':
        return 'In Progress';
      default:
        return status || '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (normalizeStatus(status)) {
      case 'HOLDING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'PENDING_SIGNATURE':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'FINALIZED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'IN_PROGRESS':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'READY_TO_SHIP':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300';
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

  // Filter orders based on search, department, and status, excluding cancelled orders
  const filteredOrders = React.useMemo(() => {
    if (!allOrders) return [];

    // Deduplicate by orderId, keeping the first occurrence
    const seen = new Set<string>();
    const deduped = allOrders.filter((order) => {
      if (!order.orderId || seen.has(order.orderId)) return false;
      seen.add(order.orderId);
      return true;
    });

    return deduped.filter((order) => {
      // Exclude cancelled orders from main list
      if (order.isCancelled || normalizeStatus(order.status) === 'CANCELLED') {
        return false;
      }

      // Department filter (include or exclude mode)
      let departmentMatch: boolean;
      if (selectedDepartment === 'all') {
        departmentMatch = true;
      } else if (departmentFilterMode === 'exclude') {
        departmentMatch = order.currentDepartment !== selectedDepartment;
      } else {
        departmentMatch = order.currentDepartment === selectedDepartment;
      }

      // Status filter (include or exclude mode)
      let statusMatch: boolean;
      if (selectedStatus === 'all') {
        statusMatch = true;
      } else if (statusFilterMode === 'exclude') {
        statusMatch = normalizeStatus(order.status) !== normalizeStatus(selectedStatus);
      } else {
        statusMatch = normalizeStatus(order.status) === normalizeStatus(selectedStatus);
      }

      // Search filter - search in multiple fields including FB Order Number
      if (!searchTerm.trim()) {
        return departmentMatch && statusMatch;
      }

      const searchLower = searchTerm.toLowerCase();
      const searchFields = [
        order.orderId?.toLowerCase(),
        order.fbOrderNumber?.toLowerCase(),
        order.customer?.toLowerCase(),
        order.customerId?.toLowerCase(),
        order.product?.toLowerCase(),
        order.modelId?.toLowerCase(),
      ].filter(Boolean);

      const searchMatch = searchFields.some((field) =>
        field?.includes(searchLower)
      );

      return departmentMatch && statusMatch && searchMatch;
    });
  }, [allOrders, searchTerm, selectedDepartment, departmentFilterMode, selectedStatus, statusFilterMode]);

  // Function to calculate search relevance score
  const getSearchRelevanceScore = (order: any, searchTerm: string) => {
    if (!searchTerm.trim()) return 0;

    const searchLower = searchTerm.toLowerCase();
    let score = 0;

    if (order.orderId?.toLowerCase() === searchLower) score += 100;
    else if (order.orderId?.toLowerCase().startsWith(searchLower)) score += 50;
    else if (order.orderId?.toLowerCase().includes(searchLower)) score += 20;

    if (order.fbOrderNumber?.toLowerCase() === searchLower) score += 90;
    else if (order.fbOrderNumber?.toLowerCase().startsWith(searchLower))
      score += 45;
    else if (order.fbOrderNumber?.toLowerCase().includes(searchLower))
      score += 18;

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
          return (
            new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
          );
        case 'dueDate':
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'customer':
          return (a.customer || '').localeCompare(b.customer || '');
        case 'model':
          return (a.modelId || '').localeCompare(b.modelId || '');
        case 'enteredDate':
          return (
            new Date(b.createdAt || '').getTime() -
            new Date(a.createdAt || '').getTime()
          );
        default:
          return 0;
      }
    });
  }, [filteredOrders, searchTerm, sortBy]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepartment, departmentFilterMode, selectedStatus, statusFilterMode, sortBy]);

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

  const orderIds = React.useMemo(() => orders.map((o) => o.orderId), [orders]);
  const { data: ticketMap } = useOrderTicketCounts(orderIds);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[95%] mx-auto">
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
    <div className="p-6 space-y-6 max-w-[95%] mx-auto">
      <div className="sticky top-0 z-20 bg-background pb-4 border-b space-y-4">
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
            <Link href="/order-reports">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                data-testid="link-advanced-reports"
              >
                <FileText className="h-4 w-4" />
                Advanced Reports
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <span className="font-semibold">Orders ({sortedOrders.length})</span>
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
              <Select
                value={selectedDepartment}
                onValueChange={(val) => {
                  setSelectedDepartment(val);
                  if (val === 'all') setDepartmentFilterMode('include');
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedDepartment !== 'all' && (
                <Button
                  variant={departmentFilterMode === 'exclude' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => setDepartmentFilterMode(departmentFilterMode === 'include' ? 'exclude' : 'include')}
                  className="text-xs px-2 h-8"
                  title={departmentFilterMode === 'include' ? 'Click to exclude this department instead' : 'Click to include this department instead'}
                >
                  {departmentFilterMode === 'include' ? 'Include' : 'Exclude'}
                </Button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Status:</span>
              <Select
                value={selectedStatus}
                onValueChange={(val) => {
                  setSelectedStatus(val);
                  if (val === 'all') setStatusFilterMode('include');
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="PENDING_SIGNATURE">Pending Signature</SelectItem>
                  <SelectItem value="FINALIZED">Finalized</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="READY_TO_SHIP">Ready to Ship</SelectItem>
                  <SelectItem value="FULFILLED">Fulfilled</SelectItem>
                  <SelectItem value="SHIPPED">Shipped</SelectItem>
                  <SelectItem value="HOLDING">Holding</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                </SelectContent>
              </Select>
              {selectedStatus !== 'all' && (
                <Button
                  variant={statusFilterMode === 'exclude' ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilterMode(statusFilterMode === 'include' ? 'exclude' : 'include')}
                  className="text-xs px-2 h-8"
                  title={statusFilterMode === 'include' ? 'Click to exclude this status instead' : 'Click to include this status instead'}
                >
                  {statusFilterMode === 'include' ? 'Include' : 'Exclude'}
                </Button>
              )}
              {/* Test Reminder Button - visible when filtering for PENDING_SIGNATURE or for admin */}
              {((selectedStatus === 'PENDING_SIGNATURE' && statusFilterMode === 'include') || currentUser?.role === 'ADMIN') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testReminderMutation.mutate()}
                  disabled={testReminderMutation.isPending}
                  title="Manually run the 5-day reminder check for unsigned orders"
                  data-testid="button-test-reminder"
                >
                  <Mail className="h-4 w-4 mr-1" />
                  {testReminderMutation.isPending ? 'Checking...' : 'Test Reminder'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Sort by:</span>
              <Select
                value={sortBy}
                onValueChange={(
                  value:
                    | 'orderDate'
                    | 'dueDate'
                    | 'customer'
                    | 'model'
                    | 'enteredDate'
                ) => setSortBy(value)}
              >
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
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
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
              {orders.map((order) => (
                <TableRow
                  key={order.orderId}
                  interactive
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button, a, [role="menu"], [role="menuitem"], input, select, [data-radix-collection-item]')) return;
                    setLocation(`/order-entry?draft=${order.orderId}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !(e.target as HTMLElement).closest('button, a, [role="menu"], input, select')) {
                      setLocation(`/order-entry?draft=${order.orderId}`);
                    }
                  }}
                  className={cn(
                    order.isVerified ? 'bg-green-50 dark:bg-green-950' : ''
                  )}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <OrderSummaryTooltip orderId={order.orderId}>
                        <span className="text-blue-600 hover:text-blue-800 cursor-pointer">
                          {getDisplayOrderId(order)}
                        </span>
                      </OrderSummaryTooltip>
                      {order.status && (
                        <div className="relative group/status">
                          {(normalizeStatus(order.status) === 'FULFILLED' || normalizeStatus(order.status) === 'SHIPPED') && (order.shippedDate || order.shippingCompletedAt) ? (
                            <RadixTooltip.Provider delayDuration={200}>
                              <RadixTooltip.Root>
                                <RadixTooltip.Trigger asChild>
                                  <span>
                                    <Badge
                                      className={`${getStatusColor(order.status)} text-xs px-1 py-0 cursor-default`}
                                    >
                                      {getStatusLabel(order.status)}
                                    </Badge>
                                  </span>
                                </RadixTooltip.Trigger>
                                <RadixTooltip.Portal>
                                  <RadixTooltip.Content
                                    side="top"
                                    sideOffset={5}
                                    className="z-[9999] rounded bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md select-none"
                                  >
                                    Shipped: {new Date(order.shippedDate || order.shippingCompletedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    <RadixTooltip.Arrow className="fill-gray-900" />
                                  </RadixTooltip.Content>
                                </RadixTooltip.Portal>
                              </RadixTooltip.Root>
                            </RadixTooltip.Provider>
                          ) : (
                            <Badge
                              className={`${getStatusColor(order.status)} text-xs px-1 py-0`}
                              title={`Order Status: ${getStatusLabel(order.status)}`}
                            >
                              {getStatusLabel(order.status)}
                            </Badge>
                          )}
                          {/* Resend Email Button - Show on hover for PENDING_SIGNATURE (any user) or FINALIZED (admin only) */}
                          {(normalizeStatus(order.status) === 'PENDING_SIGNATURE' ||
                            (normalizeStatus(order.status) === 'FINALIZED' && currentUser?.role === 'ADMIN')) && (
                            <div className="absolute left-full top-0 ml-2 opacity-0 group-hover/status:opacity-100 pointer-events-none group-hover/status:pointer-events-auto transition-opacity z-20">
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-7 px-2 bg-white ${
                                  normalizeStatus(order.status) === 'PENDING_SIGNATURE'
                                    ? 'hover:bg-orange-50 border-orange-300 text-orange-700'
                                    : 'hover:bg-blue-50 border-blue-300 text-blue-700'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resendSignatureEmailMutation.mutate(order.orderId);
                                }}
                                disabled={resendSignatureEmailMutation.isPending}
                                title={normalizeStatus(order.status) === 'PENDING_SIGNATURE'
                                  ? "Resend Review and Sign Email" 
                                  : "Resend Review and Confirm Email"}
                                data-testid={`button-resend-email-${order.orderId}`}
                              >
                                <Mail className="h-3 w-3 mr-1" />
                                Resend Email
                              </Button>
                            </div>
                          )}
                        </div>
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
                      <TicketBadge orderId={order.orderId} ticketMap={ticketMap} />
                      {order.isFullyPaid ? (
                        <Badge
                          className="bg-green-500 hover:bg-green-600 text-white text-xs px-1 py-0"
                          title="Order is paid"
                        >
                          PAID
                        </Badge>
                      ) : (
                        <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs px-1 py-0">
                          NOT PAID
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RadixTooltip.Provider delayDuration={200}>
                      <RadixTooltip.Root>
                        <RadixTooltip.Trigger asChild>
                          <span className="inline-flex">
                            <Badge variant="secondary" className="cursor-default">
                              {order.currentDepartment || 'Completed'}
                            </Badge>
                          </span>
                        </RadixTooltip.Trigger>
                        <RadixTooltip.Portal>
                          <RadixTooltip.Content
                            side="top"
                            sideOffset={5}
                            className="z-[9999] rounded bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md select-none"
                          >
                            {(() => {
                              const entryDate = getDeptEntryDate(order);
                              if (!entryDate) return `In ${order.currentDepartment || 'Completed'}`;
                              const days = (Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
                              return `${days.toFixed(1)} days in ${order.currentDepartment || 'Completed'}`;
                            })()}
                            <RadixTooltip.Arrow className="fill-gray-900" />
                          </RadixTooltip.Content>
                        </RadixTooltip.Portal>
                      </RadixTooltip.Root>
                    </RadixTooltip.Provider>
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
                          onClick={() =>
                            handleOpenCommunication(order, customers || [])
                          }
                          title="Send Email"
                        >
                          <Mail className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:bg-green-50"
                          onClick={() =>
                            handleOpenCommunication(order, customers || [])
                          }
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
                      {order.modelDisplayName || order.product || order.modelId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-gray-400" />
                      {order.orderDate
                        ? format(new Date(order.orderDate), 'MMM d, yyyy')
                        : '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-gray-400" />
                      {order.dueDate
                        ? format(new Date(order.dueDate), 'MMM d, yyyy')
                        : '-'}
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

                      <AttachmentQuickView orderId={order.orderId} />

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
                          {order.barcode && (
                            <BarcodeDisplay
                              orderId={order.orderId}
                              barcode={order.barcode}
                            />
                          )}
                        </DialogContent>
                      </Dialog>

                      {/* Progress Button */}
                      {(() => {
                        const nextDept = getNextDepartment(
                          order.currentDepartment
                        );
                        const isScrapped = normalizeStatus(order.status) === 'SCRAPPED';
                        const isFulfilled = normalizeStatus(order.status) === 'FULFILLED';
                        const isInShipping =
                          order.currentDepartment === 'Shipping';

                        if (!isScrapped && !isFulfilled) {
                          // Special case: Shipping is final department, show "Complete" button
                          if (isInShipping && !nextDept) {
                            return (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleProgressOrder(order.orderId)
                                }
                                disabled={progressOrderMutation.isPending}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                Complete Shipping
                              </Button>
                            );
                          }
                          // Regular progression to next department
                          else if (nextDept) {
                            return (
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleProgressOrder(order.orderId, nextDept)
                                }
                                disabled={progressOrderMutation.isPending}
                              >
                                <ArrowRight className="w-4 h-4 mr-1" />
                                {nextDept}
                              </Button>
                            );
                          }
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
                            View Sales Order
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleViewSalesOrder(order.orderId)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download Sales Order
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setLocation('/kickback-tracking')}
                          >
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            Report Kickback
                          </DropdownMenuItem>
                          {/* Send Updated Order Email - for orders that need customer to sign updated version */}
                          {(normalizeStatus(order.status) === 'PENDING_SIGNATURE' ||
                            normalizeStatus(order.status) === 'FINALIZED') && (
                            <DropdownMenuItem
                              onClick={() => sendUpdatedOrderMutation.mutate(order.orderId)}
                              disabled={sendUpdatedOrderMutation.isPending}
                              className="text-blue-600"
                            >
                              <RefreshCw className={`mr-2 h-4 w-4 ${sendUpdatedOrderMutation.isPending ? 'animate-spin' : ''}`} />
                              {sendUpdatedOrderMutation.isPending ? 'Sending...' : 'Send Updated Order Email'}
                            </DropdownMenuItem>
                          )}
                          {/* Email PDF Copy - sends PDF without signature workflow, available for all orders */}
                          <DropdownMenuItem
                            onClick={() => emailPdfCopyMutation.mutate(order.orderId)}
                            disabled={emailPdfCopyMutation.isPending}
                            className="text-green-600"
                          >
                            <FileDown className={`mr-2 h-4 w-4 ${emailPdfCopyMutation.isPending ? 'animate-pulse' : ''}`} />
                            {emailPdfCopyMutation.isPending ? 'Sending...' : 'Email PDF Copy'}
                          </DropdownMenuItem>
                          {order.isCancelled ? (
                            <DropdownMenuItem
                              onClick={() =>
                                undoCancelMutation.mutate(order.orderId)
                              }
                              className="text-green-600"
                            >
                              <ArrowRight className="mr-2 h-4 w-4" />
                              Restore Order
                            </DropdownMenuItem>
                          ) : (
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
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, totalOrders)} of {totalOrders}{' '}
              orders
            </div>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    className={
                      currentPage === 1
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
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
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
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
              Are you sure you want to cancel order {orderToCancel}? This action
              cannot be undone. Please provide a reason for cancellation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4 space-y-4">
            <div>
              <Textarea
                placeholder="Enter reason for cancellation..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendToRts"
                checked={sendToRts}
                onCheckedChange={(checked) => setSendToRts(checked as boolean)}
                data-testid="checkbox-send-to-rts"
              />
              <Label
                htmlFor="sendToRts"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Send produced items to RTS inventory (if order is in production)
              </Label>
            </div>
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

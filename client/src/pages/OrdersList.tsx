import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { isAdminUser } from '@/config/userPermissions';
import { Link, useLocation, useSearch } from 'wouter';
import { Badge } from '@/components/ui/badge';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { Button } from '@/components/ui/button';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Edit,
  Eye,
  Package,
  CalendarDays,
  User,
  FileText,
  Download,
  QrCode,
  ArrowRight,
  Search,
  TrendingDown,
  Plus,
  CalendarIcon,
  Mail,
  MessageSquare,
  MoreHorizontal,
  XCircle,
  AlertTriangle,
  Link as LinkIcon,
  Zap,
  Copy,
  Shuffle,
} from 'lucide-react';
import { format } from 'date-fns';
import CustomerDetailsTooltip from '@/components/CustomerDetailsTooltip';
import OrderSummaryTooltip from '@/components/OrderSummaryTooltip';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { queryClient, apiRequest, duplicateOrder } from '@/lib/queryClient';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { insertKickbackSchema } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getDisplayOrderId } from '@/lib/orderUtils';
import AuditDrawer from '@/components/AuditDrawer';
import { History, Clock, CopyPlus, Eraser, FileDown, BookOpen } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import OrderStoryPanel from '@/components/OrderStoryPanel';
import toast from 'react-hot-toast';
import CommunicationCompose from '@/components/CommunicationCompose';
import LinkOrdersDialog from '@/components/LinkOrdersDialog';
import { WebsiteOrderImport } from '@/components/WebsiteOrderImport';
import TicketBadge, { useOrderTicketCounts } from '@/components/TicketBadge';

// Quick-filter preset definitions — every dimension is declared so the
// active-preset check can compare the full filter state at once.
const FILTER_PRESETS = [
  {
    id: 'active',
    label: 'Active Orders',
    filters: {
      searchTerm: '',
      departmentFilter: 'all',
      departmentFilterMode: 'include' as const,
      customerIdFilter: '',
      statusFilter: 'all',
      statusFilterMode: 'include' as const,
      excludeStatuses: ['FULFILLED', 'CANCELLED'],
      sortBy: 'dueDate',
      sortOrder: 'asc' as const,
    },
  },
  {
    id: 'fulfilled',
    label: 'Fulfilled',
    filters: {
      searchTerm: '',
      departmentFilter: 'all',
      departmentFilterMode: 'include' as const,
      customerIdFilter: '',
      statusFilter: 'FULFILLED',
      statusFilterMode: 'include' as const,
      excludeStatuses: [] as string[],
      sortBy: 'dueDate',
      sortOrder: 'desc' as const,
    },
  },
  {
    id: 'cancelled',
    label: 'Cancelled',
    filters: {
      searchTerm: '',
      departmentFilter: 'all',
      departmentFilterMode: 'include' as const,
      customerIdFilter: '',
      statusFilter: 'CANCELLED',
      statusFilterMode: 'include' as const,
      excludeStatuses: [] as string[],
      sortBy: 'orderDate',
      sortOrder: 'desc' as const,
    },
  },
  {
    id: 'all',
    label: 'All Orders',
    filters: {
      searchTerm: '',
      departmentFilter: 'all',
      departmentFilterMode: 'include' as const,
      customerIdFilter: '',
      statusFilter: 'all',
      statusFilterMode: 'include' as const,
      excludeStatuses: [] as string[],
      sortBy: 'orderDate',
      sortOrder: 'desc' as const,
    },
  },
];

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
  // Urgency/Priority fields
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  priorityScore?: number;
  isManualUrgency?: boolean;
  createdAt: string;
  updatedAt: string;
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

function getDeptEntryDate(order: { currentDepartment?: string; createdAt: string; layupCompletedAt?: string; pluggingCompletedAt?: string; cncCompletedAt?: string; finishCompletedAt?: string; gunsmithCompletedAt?: string; paintCompletedAt?: string; qcCompletedAt?: string }): Date | null {
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

  const [, setLocation] = useLocation();
  const searchString = useSearch();
  
  // Read search parameters from URL
  const searchParams = new URLSearchParams(searchString);
  const urlSearchTerm = searchParams.get('search') || '';
  const urlDepartmentFilter = searchParams.get('department') || 'all';
  const urlStatusFilter = searchParams.get('status') || 'all';
  const urlCustomerId = searchParams.get('customerId') || '';
  const rawDepartmentMode = searchParams.get('departmentMode');
  const urlDepartmentMode: 'include' | 'exclude' = rawDepartmentMode === 'exclude' ? 'exclude' : 'include';
  const rawStatusMode = searchParams.get('statusMode');
  const urlStatusMode: 'include' | 'exclude' = rawStatusMode === 'exclude' ? 'exclude' : 'include';
  const urlSortBy = searchParams.get('sortBy') || 'orderDate';
  const rawSortOrder = searchParams.get('sortOrder');
  const urlSortOrder: 'asc' | 'desc' = rawSortOrder === 'asc' ? 'asc' : (rawSortOrder === 'desc' ? 'desc' : 'desc');
  const urlExcludeStatuses: string[] = (searchParams.get('excludeStatuses') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const [selectedOrderBarcode, setSelectedOrderBarcode] = useState<{
    orderId: string;
    barcode: string;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>(urlSearchTerm);
  const [selectedOrderForKickback, setSelectedOrderForKickback] =
    useState<Order | null>(null);
  const [isKickbackDialogOpen, setIsKickbackDialogOpen] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>(urlDepartmentFilter);
  const [statusFilter, setStatusFilter] = useState<string>(urlStatusFilter);
  const [departmentFilterMode, setDepartmentFilterMode] = useState<'include' | 'exclude'>(urlDepartmentMode);
  const [statusFilterMode, setStatusFilterMode] = useState<'include' | 'exclude'>(urlStatusMode);
  const [customerIdFilter, setCustomerIdFilter] = useState<string>(urlCustomerId);
  const [sortBy, setSortBy] = useState<string>(urlSortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(urlSortOrder);
  const [excludeStatuses, setExcludeStatuses] = useState<string[]>(urlExcludeStatuses);
  const [communicationModal, setCommunicationModal] = useState<{
    isOpen: boolean;
    customer: { id: number; name: string; email?: string; phone?: string };
    orderId?: string;
  } | null>(null);
  const { toast: showToast } = useToast();
  
  // Track whether the state change was user-initiated (vs from URL sync)
  const isUserInitiatedRef = React.useRef(false);
  
  // Sync state FROM URL when URL changes (e.g., browser back/forward)
  // This runs when searchString (from useSearch) changes
  useEffect(() => {
    // Only sync if values actually differ to prevent loops
    if (urlSearchTerm !== searchTerm) {
      setSearchTerm(urlSearchTerm);
    }
    if (urlDepartmentFilter !== departmentFilter) {
      setDepartmentFilter(urlDepartmentFilter);
    }
    if (urlStatusFilter !== statusFilter) {
      setStatusFilter(urlStatusFilter);
    }
    if (urlCustomerId !== customerIdFilter) {
      setCustomerIdFilter(urlCustomerId);
    }
    if (urlDepartmentMode !== departmentFilterMode) {
      setDepartmentFilterMode(urlDepartmentMode);
    }
    if (urlStatusMode !== statusFilterMode) {
      setStatusFilterMode(urlStatusMode);
    }
    if (urlSortBy !== sortBy) {
      setSortBy(urlSortBy);
    }
    if (urlSortOrder !== sortOrder) {
      setSortOrder(urlSortOrder);
    }
    const excludeJoined = excludeStatuses.join(',');
    const urlExcludeJoined = urlExcludeStatuses.join(',');
    if (urlExcludeJoined !== excludeJoined) {
      setExcludeStatuses(urlExcludeStatuses);
    }
    // After syncing from URL, mark as not user-initiated
    isUserInitiatedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString]); // Only trigger when the URL search string changes
  
  // Update URL when filters change (with debounce)
  useEffect(() => {
    // Don't update URL if the change came from URL sync (prevents loops)
    if (!isUserInitiatedRef.current) {
      return;
    }
    
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (searchTerm) params.set('search', searchTerm);
      if (departmentFilter && departmentFilter !== 'all') {
        params.set('department', departmentFilter);
        if (departmentFilterMode === 'exclude') params.set('departmentMode', 'exclude');
      }
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
        if (statusFilterMode === 'exclude') params.set('statusMode', 'exclude');
      }
      if (customerIdFilter) params.set('customerId', customerIdFilter);
      if (sortBy !== 'orderDate') params.set('sortBy', sortBy);
      if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
      if (excludeStatuses.length > 0) params.set('excludeStatuses', excludeStatuses.join(','));
      
      const queryString = params.toString();
      const newUrl = queryString ? `/orders-list?${queryString}` : '/orders-list';
      
      // Only update if URL actually differs
      const currentUrl = window.location.pathname + window.location.search;
      if (currentUrl !== newUrl) {
        window.history.replaceState(null, '', newUrl);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, departmentFilter, statusFilter, customerIdFilter, departmentFilterMode, statusFilterMode, sortBy, sortOrder, excludeStatuses]);
  
  // Wrapper functions that mark changes as user-initiated and reset to page 1
  const handleSearchChange = useCallback((value: string) => {
    isUserInitiatedRef.current = true;
    setSearchTerm(value);
    setCurrentPage(1);
  }, []);
  
  const handleDepartmentChange = useCallback((value: string) => {
    isUserInitiatedRef.current = true;
    setDepartmentFilter(value);
    setCurrentPage(1);
  }, []);
  
  const handleStatusChange = useCallback((value: string) => {
    isUserInitiatedRef.current = true;
    setStatusFilter(value);
    setExcludeStatuses([]);
    setCurrentPage(1);
  }, []);
  
  const handleDepartmentModeToggle = useCallback(() => {
    isUserInitiatedRef.current = true;
    setDepartmentFilterMode((prev) => (prev === 'include' ? 'exclude' : 'include'));
    setCurrentPage(1);
  }, []);

  const handleStatusModeToggle = useCallback(() => {
    isUserInitiatedRef.current = true;
    setStatusFilterMode((prev) => (prev === 'include' ? 'exclude' : 'include'));
    setCurrentPage(1);
  }, []);

  const handleSortByChange = useCallback((value: string) => {
    isUserInitiatedRef.current = true;
    setSortBy(value);
    setCurrentPage(1);
  }, []);

  const handleSortOrderChange = useCallback((value: 'asc' | 'desc') => {
    isUserInitiatedRef.current = true;
    setSortOrder(value);
    setCurrentPage(1);
  }, []);

  const handleResetAll = useCallback(() => {
    isUserInitiatedRef.current = true;
    setSearchTerm('');
    setDepartmentFilter('all');
    setStatusFilter('all');
    setDepartmentFilterMode('include');
    setStatusFilterMode('include');
    setCustomerIdFilter('');
    setExcludeStatuses([]);
    setSortBy('orderDate');
    setSortOrder('desc');
    setCurrentPage(1);
  }, []);

  const handleApplyPreset = useCallback((presetId: string) => {
    const preset = FILTER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    isUserInitiatedRef.current = true;
    setSearchTerm(preset.filters.searchTerm);
    setDepartmentFilter(preset.filters.departmentFilter);
    setDepartmentFilterMode(preset.filters.departmentFilterMode);
    setCustomerIdFilter(preset.filters.customerIdFilter);
    setStatusFilter(preset.filters.statusFilter);
    setStatusFilterMode(preset.filters.statusFilterMode);
    setExcludeStatuses(preset.filters.excludeStatuses);
    setSortBy(preset.filters.sortBy);
    setSortOrder(preset.filters.sortOrder);
    setCurrentPage(1);
  }, []);

  // Derive the active preset by matching ALL filter dimensions
  const activePreset = FILTER_PRESETS.find(
    (p) =>
      p.filters.searchTerm === searchTerm &&
      p.filters.departmentFilter === departmentFilter &&
      p.filters.departmentFilterMode === departmentFilterMode &&
      p.filters.customerIdFilter === customerIdFilter &&
      p.filters.statusFilter === statusFilter &&
      p.filters.statusFilterMode === statusFilterMode &&
      [...p.filters.excludeStatuses].sort().join(',') === [...excludeStatuses].sort().join(',') &&
      p.filters.sortBy === sortBy &&
      p.filters.sortOrder === sortOrder
  )?.id ?? null;

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  // Cancel order state
  const [cancelReason, setCancelReason] = useState('');
  const [sendToRts, setSendToRts] = useState(true);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string>('');

  // PDF modal state
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [currentPdfUrl, setCurrentPdfUrl] = useState<string>('');

  // Link Orders dialog state
  const [linkOrdersDialogOpen, setLinkOrdersDialogOpen] = useState<string | null>(null);

  // Order Story panel state
  const [storyPanelOrderId, setStoryPanelOrderId] = useState<string | null>(null);

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
        queryKey: ['/api/orders/with-payment-status/paginated'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/rts-inventory'] });
      showToast({
        title: 'Order Cancelled',
        description: 'The order has been cancelled successfully.',
      });
      setIsCancelDialogOpen(false);
      setCancelReason('');
      setSendToRts(true);
      setOrderToCancel('');
    },
    onError: (error: any) => {
      showToast({
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
        queryKey: ['/api/orders/with-payment-status/paginated'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/pipeline-counts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/layup-schedule'] });
      showToast({
        title: 'Order Restored',
        description: 'The order has been restored to production queue.',
      });
    },
    onError: (error: any) => {
      showToast({
        title: 'Error',
        description:
          'Failed to restore order: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
  });

  // Set order urgency mutation
  const setUrgencyMutation = useMutation({
    mutationFn: async ({ orderId, urgency }: { orderId: string; urgency: string }) => {
      return apiRequest(`/api/orders/${orderId}/urgency`, {
        method: 'PUT',
        body: JSON.stringify({ urgency }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/with-payment-status/paginated'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/production-queue/prioritized'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/pipeline-counts'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/all'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/layup-schedule'],
      });
      showToast({
        title: 'Urgency Updated',
        description: 'Order has been marked as high priority/rush!',
      });
    },
    onError: (error: any) => {
      showToast({
        title: 'Error',
        description:
          'Failed to update urgency: ' + (error.message || 'Unknown error'),
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
      showToast({
        title: 'PDF Emailed',
        description: 'A PDF copy of the order has been emailed to the customer.',
      });
    },
    onError: (error: any) => {
      showToast({
        title: 'Error',
        description:
          'Failed to email PDF: ' + (error.message || 'Unknown error'),
        variant: 'destructive',
      });
    },
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

      showToast({
        title: 'Success',
        description: 'Kickback reported successfully',
      });
      kickbackForm.reset();
      setIsKickbackDialogOpen(false);
      setSelectedOrderForKickback(null);
    },
    onError: (error: any) => {
      showToast({
        title: 'Error',
        description: error?.message || 'Failed to create kickback',
        variant: 'destructive',
      });
    },
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

    // Handle alternative department names
    const normalizedDepartment =
      currentDepartment === 'Layup' ? 'Layup/Plugging' : currentDepartment;

    const currentIndex = departmentFlow.indexOf(normalizedDepartment);
    if (currentIndex >= 0 && currentIndex < departmentFlow.length - 1) {
      return departmentFlow[currentIndex + 1];
    }
    return null;
  };

  // Local state for immediate UI updates - using reliable dual approach
  const [localOrderUpdates, setLocalOrderUpdates] = React.useState<
    Record<string, string>
  >({});

  // Track orders being updated to prevent query invalidation interference
  const [updatingOrders, setUpdatingOrders] = React.useState<Set<string>>(
    new Set()
  );

  // Progress order mutation with immediate local state update
  const progressOrderMutation = useMutation({
    mutationFn: async ({
      orderId,
      nextDepartment,
    }: {
      orderId: string;
      nextDepartment: string;
    }) => {
      const requestBody = {
        orderIds: [orderId],
        department: nextDepartment,
        status: 'IN_PROGRESS',
      };

      const response = await apiRequest('/api/orders/update-department', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });
      return response;
    },
    onSuccess: (data, variables) => {
      console.log(
        `✅ API Success: ${variables.orderId} -> ${variables.nextDepartment}`
      );
      toast.success('Department updated');

      // Cache is already updated from button click - just clean up local state
      setTimeout(() => {
        setLocalOrderUpdates((prev) => {
          const newState = { ...prev };
          delete newState[variables.orderId];
          return newState;
        });
        setUpdatingOrders((prev) => {
          const newSet = new Set(prev);
          newSet.delete(variables.orderId);
          return newSet;
        });
      }, 1000); // Longer delay to ensure UI stability
    },
    onError: (err, variables) => {
      // Remove failed local update and updating flag immediately
      setLocalOrderUpdates((prev) => {
        const newState = { ...prev };
        delete newState[variables.orderId];
        return newState;
      });
      setUpdatingOrders((prev) => {
        const newSet = new Set(prev);
        newSet.delete(variables.orderId);
        return newSet;
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/orders/with-payment-status/paginated'],
      });
      toast.error('Failed to update department');
    },
  });

  const handleProgressOrder = React.useCallback(
    (orderId: string, currentDepartment: string) => {
      const nextDepartment = getNextDepartment(currentDepartment);
      if (!nextDepartment) {
        toast.error('No next department available');
        return;
      }

      console.log(
        `🔄 Progressing order ${orderId} from ${currentDepartment} to ${nextDepartment}`
      );

      // Update local state for immediate UI feedback
      setLocalOrderUpdates((prev) => ({ ...prev, [orderId]: nextDepartment }));

      // Make the API call in the background
      progressOrderMutation.mutate({ orderId, nextDepartment });
    },
    [progressOrderMutation]
  );

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

  const handleKickbackClick = () => {
    setLocation('/kickback-tracking');
  };

  // Function to handle sales order view - opens PDF in modal
  const handleSalesOrderView = (orderId: string) => {
    setCurrentPdfUrl(`/api/shipping-pdf/sales-order/${orderId}`);
    setIsPdfModalOpen(true);
  };

  const handleCancelOrder = (orderId: string) => {
    setOrderToCancel(orderId);
    setIsCancelDialogOpen(true);
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

  // Reset to page 1 whenever any filter/sort param changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, departmentFilter, statusFilter, departmentFilterMode, statusFilterMode, sortBy, sortOrder, customerIdFilter, excludeStatuses]);

  try {
    // Build query params for server-side filtering/sorting/pagination
    const paginatedQueryParams: Record<string, string> = {
      page: String(currentPage),
      limit: String(itemsPerPage),
      sortBy,
      sortOrder,
    };
    if (searchTerm.trim()) paginatedQueryParams.search = searchTerm.trim();
    if (departmentFilter !== 'all') {
      paginatedQueryParams.department = departmentFilter;
      paginatedQueryParams.departmentMode = departmentFilterMode;
    }
    if (statusFilter !== 'all') {
      paginatedQueryParams.status = statusFilter;
      paginatedQueryParams.statusMode = statusFilterMode;
    }
    if (customerIdFilter) paginatedQueryParams.customerId = customerIdFilter;
    if (excludeStatuses.length > 0) paginatedQueryParams.excludeStatuses = excludeStatuses.join(',');

    const paginatedQueryString = new URLSearchParams(paginatedQueryParams).toString();

    const {
      data: paginatedData,
      isLoading,
      error,
    } = useQuery<{ orders: Order[]; total: number; page: number; limit: number; totalPages: number }>({
      queryKey: ['/api/orders/with-payment-status/paginated', paginatedQueryParams],
      queryFn: () => apiRequest(`/api/orders/with-payment-status/paginated?${paginatedQueryString}`),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      placeholderData: (prev) => prev,
    });

    const orders = paginatedData?.orders ?? [];
    const totalOrders = paginatedData?.total ?? 0;
    const totalPages = paginatedData?.totalPages ?? 0;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalOrders);
    const paginatedOrders = orders;

    // Debug logging to check if isVerified field is present
    if (orders && orders.length > 0) {
      const testOrder = orders.find((o) => o.orderId === 'AG640');
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

    // Fetch current user for Link Orders functionality and admin checks
    const { data: currentUser } = useQuery<{ id: number; username: string; role: string }>({
      queryKey: ['/api/auth/session'],
    });
    const isAdmin = isAdminUser(currentUser);

    const orderIds = useMemo(() => (orders ?? []).map((o) => o.orderId), [orders]);
    const { data: ticketMap } = useOrderTicketCounts(orderIds);

    console.log('Orders data:', orders);
    console.log('Customers data:', customers);
    console.log('Loading state:', isLoading);
    console.log('Error state:', error);

    const getCustomerName = (customerId: string) => {
      if (!customers || !customerId) return customerId || '';
      const customer = customers.find((c) => c.id.toString() === customerId);
      return customer?.name || customerId || '';
    };

    const getCustomerPhone = (customerId: string) => {
      if (!customers || !customerId) return '';
      const customer = customers.find((c) => c.id.toString() === customerId);
      return customer?.phone || '';
    };

    // Fixed list of valid departments based on production flow
    const availableDepartments = [
      'P1 Production Queue',
      'Layup/Plugging',
      'Barcode',
      'CNC',
      'Finish',
      'Paint',
      'Finish QC',
      'Gunsmith',
      'Shipping QC',
      'Shipping',
    ];

    // Fixed list of valid statuses
    const availableStatuses = [
      'HOLDING',
      'FINALIZED',
      'IN_PROGRESS',
      'FULFILLED',
      'CANCELLED',
    ];


    const getModelDisplayName = (modelId: string) => {
      if (!stockModels) return modelId;
      const model = stockModels.find((m) => m.id === modelId);
      return model ? model.displayName : modelId;
    };

    const getStockModelName = (modelId: string | null) => {
      if (!modelId) return '';
      const stockModel = stockModels?.find((sm) => sm.id === modelId);
      return stockModel ? stockModel.displayName : '';
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

    // Helper function to check if order has rush fees
    const hasRushFee = (order: Order, feeType: 'rush_fee1' | 'rush_fee2') => {
      if (!order.features?.other_options) return false;
      const otherOptions = Array.isArray(order.features.other_options) 
        ? order.features.other_options 
        : [];
      return otherOptions.includes(feeType);
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
            displayValue = displayValue.replace(/\b\w/g, (l) =>
              l.toUpperCase()
            );

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
        'powder_coating',
      ];

      for (const key of paintKeys) {
        if (features[key] && features[key] !== '' && features[key] !== 'none') {
          // Convert underscore format to display format
          const displayValue = features[key]
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (l: string) => l.toUpperCase());
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
      const errorDetails = [
        error instanceof Error ? error.message : String(error),
        (error as any)?.status ? `Status: ${(error as any).status}` : '',
        (error as any)?.responseData?.details ? `Details: ${(error as any).responseData.details}` : '',
      ].filter(Boolean).join(' | ');

      return (
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-red-600">
                Error loading orders. Please try again later.
              </div>
              {errorDetails && (
                <div className="mt-3 rounded-md bg-red-50 p-3 text-center font-mono text-xs text-red-700">
                  {errorDetails}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

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

    return (
      <div className="container mx-auto p-6">
        <div className="sticky top-0 z-20 bg-background pb-4 mb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="h-6 w-6" />
                All Orders
              </h1>
              <p className="text-gray-600 mt-1">
                {searchTerm
                  ? `Search results for "${searchTerm}" — ${totalOrders} order${totalOrders !== 1 ? 's' : ''} found`
                  : `${totalOrders} order${totalOrders !== 1 ? 's' : ''} total`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by Order ID, FB Order #, Customer PO, or Customer Name..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10 pr-4"
                  data-testid="input-search-orders"
                />
              </div>
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
                <Button
                  className="flex items-center gap-2"
                  data-testid="create-order-button"
                >
                  <FileText className="h-4 w-4" />
                  Create New Order
                </Button>
              </Link>
            </div>
          </div>

          {/* Filter and Sort Controls */}
          <div className="flex flex-col gap-4 mt-4">
            {/* Quick-filter preset chips */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Quick filter:</span>
              {FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset.id)}
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                    activePreset === preset.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  )}
                  data-testid={`preset-btn-${preset.id}`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {/* Department Filter */}
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="department-filter"
                  className="text-sm font-medium whitespace-nowrap"
                >
                  Department:
                </Label>
                <Select
                  value={departmentFilter}
                  onValueChange={handleDepartmentChange}
                >
                  <SelectTrigger className="w-40" id="department-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {availableDepartments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {departmentFilter !== 'all' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDepartmentModeToggle}
                    className={cn(
                      "h-8 w-8 p-0 font-mono text-sm",
                      departmentFilterMode === 'exclude' && "border-red-400 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950"
                    )}
                    title={departmentFilterMode === 'include' ? 'Include mode: showing only this department. Click to switch to exclude mode.' : 'Exclude mode: hiding this department. Click to switch to include mode.'}
                  >
                    {departmentFilterMode === 'include' ? '=' : '≠'}
                  </Button>
                )}
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="status-filter"
                  className="text-sm font-medium whitespace-nowrap"
                >
                  Status:
                </Label>
                <Select value={statusFilter} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-40" id="status-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {availableStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {statusFilter !== 'all' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStatusModeToggle}
                    className={cn(
                      "h-8 w-8 p-0 font-mono text-sm",
                      statusFilterMode === 'exclude' && "border-red-400 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950"
                    )}
                    title={statusFilterMode === 'include' ? 'Include mode: showing only this status. Click to switch to exclude mode.' : 'Exclude mode: hiding this status. Click to switch to include mode.'}
                  >
                    {statusFilterMode === 'include' ? '=' : '≠'}
                  </Button>
                )}
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="sort-by"
                  className="text-sm font-medium whitespace-nowrap"
                >
                  Sort by:
                </Label>
                <Select value={sortBy} onValueChange={handleSortByChange}>
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
                <Label
                  htmlFor="sort-order"
                  className="text-sm font-medium whitespace-nowrap"
                >
                  Order:
                </Label>
                <Select
                  value={sortOrder}
                  onValueChange={(value: 'asc' | 'desc') => handleSortOrderChange(value)}
                >
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
              {(searchTerm ||
                departmentFilter !== 'all' ||
                statusFilter !== 'all' ||
                excludeStatuses.length > 0 ||
                sortBy !== 'orderDate' ||
                sortOrder !== 'desc') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetAll}
                  className="px-3"
                  data-testid="btn-reset-filters"
                >
                  Reset All
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Website Order Import Section */}
        <div className="mb-6">
          <WebsiteOrderImport />
        </div>

        {paginatedOrders.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                {searchTerm ? (
                  <>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No orders match your search
                    </h3>
                    <p className="text-gray-600 mb-4">
                      No orders found for "{searchTerm}". Try a different search
                      term.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                      <Button variant="outline" onClick={() => handleSearchChange('')}>
                        Clear Search
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="outline"
                          className="border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:hover:bg-purple-900/20"
                          onClick={() => setLocation(`/order-department-transfer?orderId=${encodeURIComponent(searchTerm)}`)}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Can't find this order? Try the Transfer Tool
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No orders found
                    </h3>
                    <p className="text-gray-600 mb-4">
                      You haven't created any orders yet. Start by creating your
                      first order.
                    </p>
                    <Link href="/order-entry">
                      <Button>Create Your First Order</Button>
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
                Orders ({totalOrders})
                {totalPages > 1 && (
                  <span className="text-sm font-normal text-gray-500">
                    (Page {currentPage} of {totalPages})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table key={`table-${totalOrders}-${currentPage}-${searchTerm}`}>
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
                  {paginatedOrders.map((order) => (
                    <TableRow
                      key={`${order.id}-${order.orderId}`}
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
                        order.isCustomOrder === 'yes'
                          ? 'bg-pink-50 hover:bg-pink-100'
                          : '',
                        order.isVerified ? 'bg-green-50 hover:bg-green-100' : ''
                      )}
                    >
                      <TableCell
                        className="font-medium"
                        title={
                          order.fbOrderNumber
                            ? `FB Order: ${order.fbOrderNumber} (Order ID: ${order.orderId})`
                            : `Order ID: ${order.orderId}`
                        }
                      >
                        <div className="flex items-center gap-2">
                          <OrderSummaryTooltip orderId={order.orderId}>
                            <span className="text-blue-600 hover:text-blue-800 cursor-pointer">
                              {getDisplayOrderId(order)}
                            </span>
                          </OrderSummaryTooltip>
                          {order.status && (
                            <div className="relative group/status">
                              {(order.status?.toUpperCase() === 'FULFILLED' || order.status?.toUpperCase() === 'SHIPPED') ? (
                                <RadixTooltip.Provider delayDuration={200}>
                                  <RadixTooltip.Root>
                                    <RadixTooltip.Trigger asChild>
                                      <span>
                                        <Badge
                                          className={`${getStatusColor(order.status)} text-xs px-1 py-0 cursor-default`}
                                        >
                                          {order.status}
                                        </Badge>
                                      </span>
                                    </RadixTooltip.Trigger>
                                    <RadixTooltip.Portal>
                                      <RadixTooltip.Content
                                        side="top"
                                        sideOffset={5}
                                        className="z-[9999] rounded bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md select-none"
                                      >
                                        {(order.shippedDate || order.shippingCompletedAt)
                                          ? `Shipped: ${new Date(order.shippedDate || order.shippingCompletedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                          : 'Shipped (date not recorded)'}
                                        <RadixTooltip.Arrow className="fill-gray-900" />
                                      </RadixTooltip.Content>
                                    </RadixTooltip.Portal>
                                  </RadixTooltip.Root>
                                </RadixTooltip.Provider>
                              ) : (
                                <Badge
                                  className={`${getStatusColor(order.status)} text-xs px-1 py-0`}
                                  title={`Order Status: ${order.status}`}
                                >
                                  {order.status}
                                </Badge>
                              )}
                              {order.status?.toUpperCase() === 'FINALIZED' && currentUser?.role === 'ADMIN' && (
                                <div className="absolute left-full top-0 ml-2 opacity-0 group-hover/status:opacity-100 pointer-events-none group-hover/status:pointer-events-auto transition-opacity z-20">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      emailPdfCopyMutation.mutate(order.orderId);
                                    }}
                                    disabled={emailPdfCopyMutation.isPending}
                                    title="Email PDF Copy"
                                    data-testid={`button-resend-email-${order.orderId}`}
                                  >
                                    <Mail className="h-3 w-3 mr-1" />
                                    Email PDF
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                          {(order.urgency === 'high' || order.urgency === 'critical') && (
                            <Badge
                              className="bg-orange-500 text-white dark:bg-orange-600 dark:text-white text-xs px-2 py-0.5 font-bold animate-pulse"
                              title="High Priority / Urgent Order"
                              data-testid={`badge-urgent-${order.orderId}`}
                            >
                              <Zap className="h-3 w-3 mr-1 inline" />
                              URGENT!!!
                            </Badge>
                          )}
                          {hasRushFee(order, 'rush_fee2') && (
                            <Badge
                              className="bg-purple-600 text-white dark:bg-purple-700 dark:text-white text-xs px-2 py-0.5 font-semibold"
                              title="Expedite - 4 weeks faster ($250)"
                              data-testid={`badge-expedite-${order.orderId}`}
                            >
                              EXPEDITE
                            </Badge>
                          )}
                          {hasRushFee(order, 'rush_fee1') && (
                            <Badge
                              className="bg-blue-600 text-white dark:bg-blue-700 dark:text-white text-xs px-2 py-0.5 font-semibold"
                              title="Rush - 2 weeks faster ($200)"
                              data-testid={`badge-rush-${order.orderId}`}
                            >
                              RUSH
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
                          <TicketBadge orderId={order.orderId} ticketMap={ticketMap} />
                          {order.isFullyPaid ? (
                            <Badge
                              className="bg-green-500 hover:bg-green-600 text-white text-xs px-1 py-0"
                              title={`Paid $${order.paymentAmount || 0} via ${order.paymentType || 'Unknown'} ${order.paymentDate ? `on ${format(new Date(order.paymentDate), 'MMM d, yyyy')}` : ''}`}
                            >
                              PAID
                            </Badge>
                          ) : (
                            <Badge className="bg-red-500 hover:bg-red-600 text-white text-xs px-1 py-0">
                              NOT PAID
                            </Badge>
                          )}
                          {order.isCancelled && (
                            <Badge
                              variant="destructive"
                              className="bg-red-100 text-red-800 text-xs px-1 py-0"
                            >
                              CANCELLED
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
                                  {localOrderUpdates[order.orderId] ||
                                    order.currentDepartment ||
                                    'Not Set'}
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
                                  const dept = localOrderUpdates[order.orderId] || order.currentDepartment;
                                  const entryDate = getDeptEntryDate(order);
                                  if (!entryDate) return `In ${dept || 'Not Set'}`;
                                  const days = (Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
                                  return `${days.toFixed(1)} days in ${dept || 'Not Set'}`;
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
                            customerName={
                              getCustomerName(order.customerId) || 'N/A'
                            }
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
                            const displayDepartment =
                              localOrderUpdates[order.orderId] ||
                              order.currentDepartment;
                            const nextDept = getNextDepartment(
                              displayDepartment || ''
                            );
                            const isComplete = displayDepartment === 'Shipping';
                            const isScrapped = order.status === 'SCRAPPED';
                            const isFulfilled = order.status === 'FULFILLED'; // Only exclude FULFILLED, not FINALIZED

                            if (
                              !isScrapped &&
                              !isComplete &&
                              !isFulfilled &&
                              nextDept
                            ) {
                              return (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    handleProgressOrder(
                                      order.orderId,
                                      displayDepartment || ''
                                    )
                                  }
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
                                  customerName={getCustomerName(
                                    order.customerId
                                  )}
                                  orderDate={order.orderDate}
                                  dueDate={order.dueDate}
                                  status={order.status}
                                  actionLength={getActionLengthAbbreviation(
                                    order.features
                                  )}
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
                              <DropdownMenuItem
                                onClick={() =>
                                  handleSalesOrderView(order.orderId)
                                }
                                className="text-blue-600"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View Sales Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleSalesOrderView(order.orderId)
                                }
                                className="text-blue-600"
                              >
                                <Download className="mr-2 h-4 w-4" />
                                Download Sales Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setLinkOrdersDialogOpen(order.orderId)}
                                data-testid={`button-link-orders-${order.orderId}`}
                              >
                                <LinkIcon className="mr-2 h-4 w-4" />
                                Link Orders
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await duplicateOrder(order.orderId);
                                    toast.success(`Duplicated → ${res.newOrderId}`);
                                    setLocation(`/order-entry?duplicate=${res.newOrderId}&editMode=true`);
                                  } catch (error) {
                                    toast.error('Failed to duplicate order');
                                  }
                                }}
                                data-testid={`button-duplicate-order-${order.orderId}`}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Duplicate Order
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  const countStr = prompt('How many duplicates? (enter number 1-50)');
                                  if (!countStr) return;
                                  const count = parseInt(countStr, 10);
                                  if (isNaN(count) || count < 1 || count > 50) {
                                    toast.error('Please enter a number between 1 and 50');
                                    return;
                                  }
                                  try {
                                    const res = await duplicateOrder(order.orderId, { count });
                                    if (res.created) {
                                      toast.success(`${res.created.length} duplicates created`);
                                    } else {
                                      toast.success(`Duplicated → ${res.newOrderId}`);
                                    }
                                    setLocation('/orders');
                                  } catch (error) {
                                    toast.error('Failed to duplicate orders');
                                  }
                                }}
                                data-testid={`button-duplicate-xn-${order.orderId}`}
                              >
                                <CopyPlus className="mr-2 h-4 w-4" />
                                Duplicate xN
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await duplicateOrder(order.orderId);
                                    toast.success(`Duplicated (Specs Cleared) → ${res.newOrderId}`);
                                    setLocation(`/order-entry?duplicate=${res.newOrderId}&clearSpecs=true&editMode=true`);
                                  } catch (error) {
                                    toast.error('Failed to duplicate order');
                                  }
                                }}
                                data-testid={`button-duplicate-clear-specs-${order.orderId}`}
                              >
                                <Eraser className="mr-2 h-4 w-4" />
                                Duplicate (Clear Specs)
                              </DropdownMenuItem>
                              {(order.urgency === 'high' || order.urgency === 'critical') ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setUrgencyMutation.mutate({
                                      orderId: order.orderId,
                                      urgency: 'medium',
                                    })
                                  }
                                  className="text-gray-600"
                                  disabled={setUrgencyMutation.isPending}
                                  data-testid={`button-remove-urgent-${order.orderId}`}
                                >
                                  <Zap className="mr-2 h-4 w-4" />
                                  {setUrgencyMutation.isPending ? 'Updating...' : 'Remove Urgent Priority'}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    setUrgencyMutation.mutate({
                                      orderId: order.orderId,
                                      urgency: 'high',
                                    })
                                  }
                                  className="text-orange-600"
                                  disabled={setUrgencyMutation.isPending}
                                  data-testid={`button-set-urgent-${order.orderId}`}
                                >
                                  <Zap className="mr-2 h-4 w-4" />
                                  {setUrgencyMutation.isPending ? 'Updating...' : 'Set as Urgent'}
                                </DropdownMenuItem>
                              )}
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
                                  onClick={() =>
                                    handleCancelOrder(order.orderId)
                                  }
                                  className="text-red-600"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel Order
                                </DropdownMenuItem>
                              )}
                              <AuditDrawer
                                entityType="p1_order"
                                entityId={order.orderId}
                                trigger={
                                  <DropdownMenuItem
                                    onSelect={(e) => e.preventDefault()}
                                    data-testid={`button-audit-trail-${order.orderId}`}
                                  >
                                    <History className="mr-2 h-4 w-4" />
                                    View Audit Trail
                                  </DropdownMenuItem>
                                }
                              />
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setStoryPanelOrderId(order.orderId);
                                }}
                                data-testid={`button-order-story-${order.orderId}`}
                              >
                                <BookOpen className="mr-2 h-4 w-4" />
                                Order Story
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setLocation(`/order-timeline/p1_order/${order.orderId}`)}
                                data-testid={`button-view-timeline-${order.orderId}`}
                              >
                                <Clock className="mr-2 h-4 w-4" />
                                View Timeline
                              </DropdownMenuItem>
                              {isAdmin && (
                                <DropdownMenuItem
                                  onClick={() => setLocation(`/order-department-transfer?orderId=${encodeURIComponent(order.orderId)}`)}
                                  className="text-purple-600 dark:text-purple-400"
                                  data-testid={`button-reassign-dept-${order.orderId}`}
                                >
                                  <Shuffle className="mr-2 h-4 w-4" />
                                  Reassign Department
                                </DropdownMenuItem>
                              )}
                              {/* Email PDF Copy - sends PDF without signature workflow, available for all orders */}
                              <DropdownMenuItem
                                onClick={() => emailPdfCopyMutation.mutate(order.orderId)}
                                disabled={emailPdfCopyMutation.isPending}
                                className="text-green-600"
                                data-testid={`button-email-pdf-copy-${order.orderId}`}
                              >
                                <FileDown className={`mr-2 h-4 w-4 ${emailPdfCopyMutation.isPending ? 'animate-pulse' : ''}`} />
                                {emailPdfCopyMutation.isPending ? 'Sending...' : 'Email PDF Copy'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    // First check if signed PDF is available
                                    const response = await fetch(`/api/followup-orders/signature-info/${order.orderId}`);
                                    const data = await response.json();
                                    if (data.hasSignature && data.signedPdfAvailable) {
                                      window.open(`/api/followup-orders/signed-pdf/${order.orderId}`, '_blank');
                                    } else if (data.hasSignature) {
                                      toast.error('Signed PDF file not found on server');
                                    } else {
                                      toast.error('Order has not been signed by customer yet');
                                    }
                                  } catch (error) {
                                    toast.error('Failed to check signature status');
                                  }
                                }}
                                data-testid={`button-view-signed-pdf-${order.orderId}`}
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View Signed Confirmation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          
                          {/* Link Orders Dialog */}
                          {linkOrdersDialogOpen === order.orderId && (
                            <LinkOrdersDialog
                              orderId={order.orderId}
                              isOpen={true}
                              onClose={() => setLinkOrdersDialogOpen(null)}
                              currentUser={currentUser?.username || 'System'}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-gray-600">
                    Showing {startIndex + 1} to{' '}
                    {endIndex} of{' '}
                    {totalOrders} orders
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      data-testid="button-previous-page"
                    >
                      Previous
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (pageNum) => {
                          // Show first page, last page, current page, and pages around current
                          const showPage =
                            pageNum === 1 ||
                            pageNum === totalPages ||
                            Math.abs(pageNum - currentPage) <= 1;

                          if (!showPage) {
                            // Show ellipsis
                            if (
                              pageNum === currentPage - 2 ||
                              pageNum === currentPage + 2
                            ) {
                              return (
                                <span key={pageNum} className="px-2">
                                  ...
                                </span>
                              );
                            }
                            return null;
                          }

                          return (
                            <Button
                              key={pageNum}
                              variant={
                                currentPage === pageNum ? 'default' : 'outline'
                              }
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              className="min-w-[40px]"
                              data-testid={`button-page-${pageNum}`}
                            >
                              {pageNum}
                            </Button>
                          );
                        }
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Kickback Report Modal */}
        <Dialog
          open={isKickbackDialogOpen}
          onOpenChange={setIsKickbackDialogOpen}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Report Kickback for {selectedOrderForKickback?.orderId}
              </DialogTitle>
              <DialogDescription>
                Report a production issue that requires attention for this order
              </DialogDescription>
            </DialogHeader>
            <Form {...kickbackForm}>
              <form
                onSubmit={kickbackForm.handleSubmit(onKickbackSubmit)}
                className="space-y-4"
              >
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
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
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
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MATERIAL_DEFECT">
                              Material Defect
                            </SelectItem>
                            <SelectItem value="OPERATOR_ERROR">
                              Operator Error
                            </SelectItem>
                            <SelectItem value="MACHINE_FAILURE">
                              Machine Failure
                            </SelectItem>
                            <SelectItem value="DESIGN_ISSUE">
                              Design Issue
                            </SelectItem>
                            <SelectItem value="QUALITY_ISSUE">
                              Quality Issue
                            </SelectItem>
                            <SelectItem value="PROCESS_ISSUE">
                              Process Issue
                            </SelectItem>
                            <SelectItem value="SUPPLIER_ISSUE">
                              Supplier Issue
                            </SelectItem>
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
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
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
                                  'pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? (
                                  format(field.value, 'PPP')
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
                                date > new Date() ||
                                date < new Date('1900-01-01')
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
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsKickbackDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createKickbackMutation.isPending}
                  >
                    {createKickbackMutation.isPending
                      ? 'Reporting...'
                      : 'Report Kickback'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Cancel Order Dialog */}
        <AlertDialog
          open={isCancelDialogOpen}
          onOpenChange={setIsCancelDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Order</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel order {orderToCancel}? This
                action cannot be undone. Please provide a reason for
                cancellation.
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
                {cancelOrderMutation.isPending
                  ? 'Cancelling...'
                  : 'Cancel Order'}
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

        {/* Sales Order PDF Modal */}
        <Dialog open={isPdfModalOpen} onOpenChange={setIsPdfModalOpen}>
          <DialogContent className="max-w-[90vw] max-h-[90vh] w-full h-full">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Sales Order PDF
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 w-full h-[80vh]">
              {currentPdfUrl && (
                <iframe
                  src={currentPdfUrl}
                  className="w-full h-full border-0 rounded"
                  title="Sales Order PDF"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Order Story Mode Panel */}
        <Sheet
          open={!!storyPanelOrderId}
          onOpenChange={(open) => { if (!open) setStoryPanelOrderId(null); }}
        >
          <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
            <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <SheetTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Order Story
                {storyPanelOrderId && (
                  <span className="text-muted-foreground font-normal text-sm ml-1">
                    — {storyPanelOrderId}
                  </span>
                )}
              </SheetTitle>
              <SheetDescription>
                Full chronological history of every event for this order
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1 px-6 py-4">
              {storyPanelOrderId && (
                <OrderStoryPanel orderId={storyPanelOrderId} />
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
    );
  } catch (error) {
    console.error('Error in OrdersList component:', error);
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              Error Loading Orders
            </h3>
            <p className="text-red-700">
              An error occurred while loading the orders page. Please try
              refreshing the page.
            </p>
            <p className="text-sm text-red-600 mt-2">
              Error: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      </div>
    );
  }
}

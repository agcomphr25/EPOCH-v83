import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import {
  Pencil,
  Trash2,
  Plus,
  FileText,
  Package,
  Calendar,
  Upload,
  X,
  ExternalLink,
  Factory,
  Lock,
  LockOpen,
  FolderOpen,
  Search,
  Eye,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';

const p2PurchaseOrderSchema = z.object({
  poNumber: z.string().min(1, 'PO Number is required'),
  customerId: z.string().min(1, 'Customer is required'),
  customerName: z.string().min(1, 'Customer Name is required'),
  poDate: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Valid PO date is required',
  }),
  expectedDelivery: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Valid expected delivery date is required',
  }),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELED']).default('OPEN'),
  notes: z.string().optional(),
  sourceQuoteId: z.string().optional().nullable(),
  contractReviewRole: z.enum(['primary', 'secondary']).default('secondary'),
  projectName: z.string().optional().nullable(),
});

type P2PurchaseOrderForm = z.infer<typeof p2PurchaseOrderSchema>;

interface P2Customer {
  id: number;
  customerId: string;
  customerName: string;
  status: string;
}

interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  description: string;
  totalAmount: number;
  status: string;
  validUntil: string;
  quotedBy: string;
  createdAt: string;
}

interface P2PurchaseOrder
  extends Omit<P2PurchaseOrderForm, 'poDate' | 'expectedDelivery'> {
  id: number;
  poDate: string;
  expectedDelivery: string;
  attachments?: string[];
  sourceQuoteId?: string | null;
  contractReviewRole?: 'primary' | 'secondary' | null;
  projectName?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface QuotePoReconciliation {
  id: string;
  p2_purchase_order_id: number;
  status: 'MATCH' | 'MISMATCH' | string;
  revision_mismatch: boolean;
  pricing_mismatch: boolean;
  clause_mismatch: boolean;
  schedule_mismatch: boolean;
  quantity_mismatch: boolean;
  mismatch_summary?: Record<string, any> | null;
  checked_at: string;
}

interface P2POManagerProps {
  onManageItems?: (poId: number, poNumber: string) => void;
  selectedPOIds?: number[];
  initialSearch?: string;
}

export function P2POManager({ onManageItems, selectedPOIds = [], initialSearch = '' }: P2POManagerProps) {
  const [selectedPO, setSelectedPO] = useState<P2PurchaseOrder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [generatingPoId, setGeneratingPoId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'default' | 'project_asc' | 'project_desc'>('default');
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: purchaseOrders = [], isLoading } = useQuery<P2PurchaseOrder[]>({
    queryKey: ['/api/p2-purchase-orders-bypass'],
  });

  const { data: customers = [] } = useQuery<P2Customer[]>({
    queryKey: ['/api/p2-customers-bypass'],
  });

  const { data: allQuotes = [] } = useQuery<Quote[]>({
    queryKey: ['/api/quotes'],
  });

  const { data: quoteReconciliations = [] } = useQuery<QuotePoReconciliation[]>({
    queryKey: ['/api/p2/quote-po-reconciliations/latest'],
  });

  const reconciliationByPoId = new Map(
    quoteReconciliations.map((reconciliation) => [
      reconciliation.p2_purchase_order_id,
      reconciliation,
    ])
  );

  const sentQuotes = allQuotes.filter((quote) => quote.status === 'SENT');

  const form = useForm<P2PurchaseOrderForm>({
    resolver: zodResolver(p2PurchaseOrderSchema),
    defaultValues: {
      poNumber: '',
      customerId: '',
      customerName: '',
      poDate: new Date().toISOString().split('T')[0],
      expectedDelivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      status: 'OPEN',
      notes: '',
      sourceQuoteId: null,
      contractReviewRole: 'secondary',
      projectName: null,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: P2PurchaseOrderForm) =>
      apiRequest('/api/p2-purchase-orders-bypass', {
        method: 'POST',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-purchase-orders-bypass'],
      });
      toast({
        title: 'Success',
        description: 'P2 Purchase Order created successfully',
      });
      setDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create P2 purchase order',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<P2PurchaseOrderForm>;
    }) =>
      apiRequest(`/api/p2-purchase-orders-bypass/${id}`, {
        method: 'PUT',
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-purchase-orders-bypass'],
      });
      toast({
        title: 'Success',
        description: 'P2 Purchase Order updated successfully',
      });
      setDialogOpen(false);
      setSelectedPO(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update P2 purchase order',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/p2-purchase-orders-bypass/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-purchase-orders-bypass'],
      });
      toast({
        title: 'Success',
        description: 'P2 Purchase Order deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete P2 purchase order',
        variant: 'destructive',
      });
    },
  });

  const generateProductionOrdersMutation = useMutation({
    mutationFn: (purchaseOrderId: number) =>
      apiRequest(`/api/orders/production-orders/generate/${purchaseOrderId}`, {
        method: 'POST',
        timeout: 120000,
      }),
    onSuccess: (data: any) => {
      const orderCount = Array.isArray(data) ? data.length : 0;
      toast({
        title: 'Success',
        description: `Generated ${orderCount} production order${orderCount !== 1 ? 's' : ''} from BOM explosion`,
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-production-orders'],
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/cutting-table/weekly-cutting-queue'],
      });
      setGeneratingPoId(null);
    },
    onError: (error: any) => {
      const isTimeout = error?.name === 'AbortError' || error?.message?.includes('aborted');
      toast({
        title: 'BOM Explosion Failed',
        description: isTimeout 
          ? 'The operation timed out. The server may still be processing — please wait a moment and refresh.'
          : (error.message || 'Failed to generate production orders. Make sure the PO has items with valid BOMs.'),
        variant: 'destructive',
      });
      setGeneratingPoId(null);
    },
  });

  const [clearingPoId, setClearingPoId] = useState<number | null>(null);

  const clearProductionOrdersMutation = useMutation({
    mutationFn: (purchaseOrderId: number) =>
      apiRequest(`/api/orders/production-orders/clear/${purchaseOrderId}`, {
        method: 'DELETE',
      }),
    onSuccess: (data: any) => {
      toast({
        title: 'Success',
        description: data.message || 'Production orders cleared',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/p2-production-orders'],
      });
      setClearingPoId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to clear production orders',
        variant: 'destructive',
      });
      setClearingPoId(null);
    },
  });

  const lockMutation = useMutation({
    mutationFn: (poId: number) =>
      apiRequest(`/api/p2-purchase-orders/${poId}/lock`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast({ title: 'PO Locked', description: 'Purchase order is now locked for production and cannot be edited.' });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to lock PO', variant: 'destructive' });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (poId: number) =>
      apiRequest(`/api/p2-purchase-orders/${poId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      toast({ title: 'PO Unlocked', description: 'Purchase order is now unlocked and can be edited.' });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to unlock PO', variant: 'destructive' });
    },
  });

  const reconcileQuoteMutation = useMutation({
    mutationFn: (poId: number) =>
      apiRequest(`/api/p2-purchase-orders/${poId}/reconcile-quote`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: (_data, poId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/quote-po-reconciliations/latest'] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2-purchase-orders-bypass'] });
      toast({
        title: 'Quote reconciliation updated',
        description: `PO ${poId} was checked against its source quote snapshot.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Quote reconciliation failed',
        description: error.message || 'Failed to reconcile this PO against its source quote.',
        variant: 'destructive',
      });
    },
  });

  const handleGenerateProductionOrders = (po: P2PurchaseOrder) => {
    if (
      confirm(
        `Generate production orders for ${po.poNumber}?\n\nThis will explode the BOM for all items in this purchase order and create individual production orders for MANUFACTURED items only.`
      )
    ) {
      setGeneratingPoId(po.id);
      generateProductionOrdersMutation.mutate(po.id);
    }
  };

  const handleClearProductionOrders = (po: P2PurchaseOrder) => {
    if (
      confirm(
        `Clear ALL production orders for ${po.poNumber}?\n\nThis will delete all generated production orders for this PO. You can regenerate them afterwards.`
      )
    ) {
      setClearingPoId(po.id);
      clearProductionOrdersMutation.mutate(po.id);
    }
  };

  const handleSubmit = (data: P2PurchaseOrderForm) => {
    if (selectedPO) {
      updateMutation.mutate({ id: selectedPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find((c) => c.customerId === customerId);
    if (customer) {
      form.setValue('customerId', customer.customerId);
      form.setValue('customerName', customer.customerName);
    }
  };

  const openEditDialog = (po: P2PurchaseOrder) => {
    setSelectedPO(po);
    form.reset({
      poNumber: po.poNumber,
      customerId: po.customerId,
      customerName: po.customerName,
      poDate: po.poDate,
      expectedDelivery: po.expectedDelivery,
      status: po.status,
      notes: po.notes || '',
      sourceQuoteId: po.sourceQuoteId || null,
      contractReviewRole: po.contractReviewRole || 'secondary',
      projectName: po.projectName || null,
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setSelectedPO(null);
    form.reset({
      poNumber: '',
      customerId: '',
      customerName: '',
      poDate: new Date().toISOString().split('T')[0],
      expectedDelivery: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
      status: 'OPEN',
      notes: '',
      sourceQuoteId: null,
      contractReviewRole: 'secondary',
      projectName: null,
    });
    setDialogOpen(true);
  };

  const handleAttachmentUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPO) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
      return;
    }

    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `/api/p2-purchase-orders/${selectedPO.id}/upload-attachment`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      
      await queryClient.invalidateQueries({
        queryKey: ['/api/p2-purchase-orders-bypass'],
      });
      
      // Refresh selectedPO with latest data from the query cache
      const updatedData = queryClient.getQueryData<P2PurchaseOrder[]>([
        '/api/p2-purchase-orders-bypass',
      ]);
      const updatedPO = updatedData?.find((po) => po.id === selectedPO.id);
      if (updatedPO) {
        setSelectedPO(updatedPO);
      }
      
      toast({ title: 'Attachment uploaded successfully' });
      
      // Reset the input
      e.target.value = '';
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: 'Failed to upload attachment',
        variant: 'destructive',
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDeleteAttachment = async (attachmentUrl: string) => {
    if (!selectedPO) return;

    try {
      const response = await fetch(
        `/api/p2-purchase-orders/${selectedPO.id}/attachment`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attachmentUrl }),
        }
      );

      if (!response.ok) throw new Error('Delete failed');

      await queryClient.invalidateQueries({
        queryKey: ['/api/p2-purchase-orders-bypass'],
      });
      
      // Refresh selectedPO with latest data from the query cache
      const updatedData = queryClient.getQueryData<P2PurchaseOrder[]>([
        '/api/p2-purchase-orders-bypass',
      ]);
      const updatedPO = updatedData?.find((po) => po.id === selectedPO.id);
      if (updatedPO) {
        setSelectedPO(updatedPO);
      }
      
      toast({ title: 'Attachment removed successfully' });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: 'Failed to remove attachment',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'default';
      case 'CLOSED':
        return 'secondary';
      case 'CANCELED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getMismatchFlags = (reconciliation?: QuotePoReconciliation | null) => {
    if (!reconciliation) return [];
    return [
      reconciliation.revision_mismatch && 'Revision',
      reconciliation.pricing_mismatch && 'Pricing',
      reconciliation.clause_mismatch && 'Clauses',
      reconciliation.schedule_mismatch && 'Schedule',
      reconciliation.quantity_mismatch && 'Quantity',
    ].filter(Boolean) as string[];
  };

  const baseFilteredPOs = selectedPOIds.length > 0
    ? purchaseOrders.filter((po) => selectedPOIds.includes(po.id))
    : purchaseOrders;

  const lowerSearch = searchTerm.trim().toLowerCase();
  const filteredPurchaseOrders = lowerSearch
    ? baseFilteredPOs.filter(
        (po) =>
          po.poNumber.toLowerCase().includes(lowerSearch) ||
          po.customerName.toLowerCase().includes(lowerSearch) ||
          (po.projectName || '').toLowerCase().includes(lowerSearch)
      )
    : baseFilteredPOs;

  const sortedPurchaseOrders = [...filteredPurchaseOrders].sort((a, b) => {
    if (sortBy === 'default') return 0;
    const aProject = a.projectName || '';
    const bProject = b.projectName || '';
    if (!aProject && !bProject) return 0;
    if (!aProject) return 1;
    if (!bProject) return -1;
    const cmp = aProject.localeCompare(bProject);
    return sortBy === 'project_asc' ? cmp : -cmp;
  });

  if (isLoading) {
    return <div className="p-6">Loading P2 purchase orders...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            P2 Purchase Orders
          </h2>
          <p className="text-muted-foreground">
            Manage P2 purchase orders and line items
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search POs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-48"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-44" data-testid="select-sort-by">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default Order</SelectItem>
              <SelectItem value="project_asc">Project A→Z</SelectItem>
              <SelectItem value="project_desc">Project Z→A</SelectItem>
            </SelectContent>
          </Select>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add P2 Purchase Order
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedPO
                  ? 'Edit P2 Purchase Order'
                  : 'Add P2 Purchase Order'}
              </DialogTitle>
              <DialogDescription>
                {selectedPO
                  ? 'Update purchase order information'
                  : 'Create a new P2 purchase order'}
              </DialogDescription>
            </DialogHeader>
            {selectedPO?.lockedAt && (
              <Alert className="bg-amber-50 border-amber-200">
                <Lock className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  This PO is locked for production. You can still upload and manage PDF attachments below.
                </AlertDescription>
              </Alert>
            )}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="poNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PO Number</FormLabel>
                        <FormControl>
                          <Input placeholder="P2-PO-001" {...field} disabled={!!selectedPO?.lockedAt} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            handleCustomerChange(value);
                          }}
                          value={field.value}
                          disabled={!!selectedPO?.lockedAt}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem
                                key={customer.id}
                                value={customer.customerId}
                              >
                                {customer.customerName} ({customer.customerId})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="poDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PO Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={!!selectedPO?.lockedAt} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expectedDelivery"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Delivery</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} disabled={!!selectedPO?.lockedAt} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          disabled={!!selectedPO?.lockedAt}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="OPEN">Open</SelectItem>
                            <SelectItem value="CLOSED">Closed</SelectItem>
                            <SelectItem value="CANCELED">Canceled</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="sourceQuoteId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source Quote</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                          value={field.value || 'none'}
                          disabled={!!selectedPO?.lockedAt}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-source-quote">
                              <SelectValue placeholder="Select source quote" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {sentQuotes.map((quote) => (
                              <SelectItem key={quote.id} value={quote.id}>
                                {quote.quoteNumber} - {quote.customerName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="contractReviewRole"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Are we primary or secondary on this PO?</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || 'secondary'}
                        disabled={!!selectedPO?.lockedAt}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-contract-review-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="secondary">Secondary - contract review not required now</SelectItem>
                          <SelectItem value="primary">Primary - contract review required for P2 release</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional notes..."
                          {...field}
                          disabled={!!selectedPO?.lockedAt}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="projectName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Project Alpha or PRJ-001"
                          {...field}
                          value={field.value || ''}
                          disabled={!!selectedPO?.lockedAt}
                          data-testid="input-po-manager-project-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* PDF Attachments Section - Only show when editing */}
                {selectedPO && (
                  <div className="space-y-3 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium">PDF Attachments</h3>
                      <label className="cursor-pointer">
                        <Input
                          type="file"
                          accept="application/pdf"
                          onChange={handleAttachmentUpload}
                          className="hidden"
                          disabled={uploadingAttachment}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={uploadingAttachment}
                          onClick={(e) => {
                            e.preventDefault();
                            (e.currentTarget.previousElementSibling as HTMLInputElement)?.click();
                          }}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {uploadingAttachment ? 'Uploading...' : 'Upload PDF'}
                        </Button>
                      </label>
                    </div>

                    {selectedPO.attachments && selectedPO.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {selectedPO.attachments.map((attachmentUrl, index) => {
                          const filename = attachmentUrl.split('/').pop() || 'document.pdf';
                          return (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 border rounded-lg bg-gray-50 dark:bg-gray-800"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                <span className="text-sm truncate">{filename}</span>
                              </div>
                              <div className="flex gap-1 flex-shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => window.open(attachmentUrl, '_blank')}
                                  title="View PDF"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        'Are you sure you want to delete this attachment?'
                                      )
                                    ) {
                                      handleDeleteAttachment(attachmentUrl);
                                    }
                                  }}
                                  title="Delete attachment"
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No attachments yet. Upload PDFs to attach them to this purchase
                        order.
                      </p>
                    )}
                  </div>
                )}

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    {selectedPO?.lockedAt ? 'Close' : 'Cancel'}
                  </Button>
                  {!selectedPO?.lockedAt && (
                    <Button
                      type="submit"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                    >
                      {selectedPO ? 'Update' : 'Create'} Purchase Order
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-4">
        {purchaseOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No P2 Purchase Orders
              </h3>
              <p className="text-muted-foreground text-center mb-4">
                Get started by creating your first P2 purchase order
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add P2 Purchase Order
              </Button>
            </CardContent>
          </Card>
        ) : sortedPurchaseOrders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No results found</h3>
              <p className="text-muted-foreground text-center">
                No purchase orders match &ldquo;{searchTerm}&rdquo;
              </p>
            </CardContent>
          </Card>
        ) : (
          sortedPurchaseOrders.map((po) => {
            const quoteReconciliation = reconciliationByPoId.get(po.id);
            const mismatchFlags = getMismatchFlags(quoteReconciliation);

            return (
            <Card key={po.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {po.poNumber}
                    </CardTitle>
                    <CardDescription>
                      Customer: {po.customerName} • Created:{' '}
                      {format(new Date(po.createdAt), 'MMM d, yyyy')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Badge variant={getStatusBadgeVariant(po.status)}>
                      {po.status}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        po.contractReviewRole === 'primary'
                          ? 'border-blue-500 text-blue-700 dark:text-blue-400'
                          : 'border-slate-300 text-slate-600 dark:text-slate-300'
                      }
                    >
                      {po.contractReviewRole === 'primary' ? 'Primary - review required' : 'Secondary'}
                    </Badge>
                    {po.lockedAt && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        Locked
                      </Badge>
                    )}
                    {po.sourceQuoteId && quoteReconciliation?.status === 'MATCH' && (
                      <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Quote Match
                      </Badge>
                    )}
                    {po.sourceQuoteId && quoteReconciliation?.status === 'MISMATCH' && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Quote Mismatch
                      </Badge>
                    )}
                    {po.sourceQuoteId && !quoteReconciliation && (
                      <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
                        Reconcile Needed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      PO Date: {format(new Date(po.poDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Expected:{' '}
                      {format(new Date(po.expectedDelivery), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span>Customer ID: {po.customerId}</span>
                  </div>
                </div>
                {po.projectName && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <FolderOpen className="h-4 w-4" />
                    <span>Project: <span className="font-medium text-foreground">{po.projectName}</span></span>
                  </div>
                )}
                {po.sourceQuoteId && (
                  <div className={`mb-4 rounded-md border p-3 text-sm ${
                    quoteReconciliation?.status === 'MISMATCH'
                      ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200'
                      : !quoteReconciliation
                      ? 'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/20 dark:text-yellow-200'
                      : 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-200'
                  }`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium">
                        {quoteReconciliation?.status === 'MISMATCH' || !quoteReconciliation ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        Quote Snapshot Reconciliation
                      </div>
                      {quoteReconciliation?.checked_at && (
                        <span className="text-xs opacity-75">
                          Checked {format(new Date(quoteReconciliation.checked_at), 'MMM d, yyyy h:mm a')}
                      </span>
                      )}
                    </div>
                    {!quoteReconciliation ? (
                      <p className="mt-1 text-xs opacity-80">
                        Run reconciliation to compare revision, pricing, clauses, schedule, and quantity against the latest sent quote snapshot.
                      </p>
                    ) : mismatchFlags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {mismatchFlags.map((flag) => (
                          <Badge key={flag} variant="destructive" className="text-xs">
                            {flag} mismatch
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs opacity-80">
                        Revision, pricing, clauses, schedule, and quantity are aligned with the latest sent quote snapshot.
                      </p>
                    )}
                  </div>
                )}
                {po.notes && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {po.notes}
                  </p>
                )}
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onManageItems?.(po.id, po.poNumber)}
                    data-testid={`button-manage-items-${po.id}`}
                  >
                    Manage Items
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/p2/purchase-orders/${po.id}/preview`, '_blank')}
                    data-testid={`button-preview-po-${po.id}`}
                    title="Preview and print this purchase order"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Preview PO
                  </Button>
                  {po.sourceQuoteId && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => reconcileQuoteMutation.mutate(po.id)}
                      disabled={reconcileQuoteMutation.isPending}
                      data-testid={`button-reconcile-quote-${po.id}`}
                      title="Re-check revision, pricing, clauses, schedule, and quantity against the sent quote snapshot"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reconcile Quote
                    </Button>
                  )}
                  {po.status === 'OPEN' && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleGenerateProductionOrders(po)}
                        disabled={generatingPoId === po.id}
                        data-testid={`button-generate-production-orders-${po.id}`}
                        title="Explode BOM and create production orders for manufactured items"
                      >
                        <Factory className="h-4 w-4 mr-2" />
                        {generatingPoId === po.id
                          ? 'Generating...'
                          : 'Generate Production Orders'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClearProductionOrders(po)}
                        disabled={clearingPoId === po.id}
                        data-testid={`button-clear-production-orders-${po.id}`}
                        title="Delete all production orders for this PO"
                        className="text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {clearingPoId === po.id
                          ? 'Clearing...'
                          : 'Clear Orders'}
                      </Button>
                    </>
                  )}
                  {po.lockedAt ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Unlock ${po.poNumber}?\n\nThis will allow editing the purchase order again.`)) {
                          unlockMutation.mutate(po.id);
                        }
                      }}
                      disabled={unlockMutation.isPending}
                      data-testid={`button-unlock-po-${po.id}`}
                      title="Unlock this PO to allow editing"
                      className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 border-amber-400"
                    >
                      <LockOpen className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Lock ${po.poNumber}?\n\nThis will prevent any further edits to this purchase order. Attachments can still be managed.`)) {
                          lockMutation.mutate(po.id);
                        }
                      }}
                      disabled={lockMutation.isPending}
                      data-testid={`button-lock-po-${po.id}`}
                      title="Lock this PO to prevent editing"
                    >
                      <Lock className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(po)}
                    data-testid={`button-edit-po-${po.id}`}
                    disabled={!!po.lockedAt}
                    title={po.lockedAt ? 'PO is locked' : 'Edit PO'}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(po.id)}
                    disabled={deleteMutation.isPending || !!po.lockedAt}
                    data-testid={`button-delete-po-${po.id}`}
                    title={po.lockedAt ? 'PO is locked and cannot be deleted' : 'Delete PO'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

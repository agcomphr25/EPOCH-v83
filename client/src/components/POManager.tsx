import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchPOs,
  createPO,
  updatePO,
  deletePO,
  fetchPOItems,
  type PurchaseOrder,
  type CreatePurchaseOrderData,
  type PurchaseOrderItem,
} from '@/lib/poUtils';
import { generateProductionOrdersFromPO } from '@/lib/productionUtils';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Pencil,
  Trash2,
  Plus,
  Eye,
  Package,
  Search,
  TrendingUp,
  ShoppingCart,
  ChevronsUpDown,
  Check,
  UserPlus,
  Mail,
  Phone,
  Paperclip,
  Download,
  Upload,
  FileText,
  X,
  Loader2,
  ArrowLeftRight,
  RotateCcw,
} from 'lucide-react';
// @ts-ignore
import debounce from 'lodash.debounce';
import { toast } from 'react-hot-toast';
import POProductSelector from './POProductSelector';
import POItemsManager from './POItemsManager';
import AddressInput from './AddressInput';
import { type AddressData } from '@/utils/addressUtils';
import { format as formatDate } from 'date-fns';

// Component to display PO quantity
function POQuantityDisplay({ poId }: { poId: number }) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: [`/api/pos/${poId}/items`],
    queryFn: () => fetchPOItems(poId),
  });

  const totalQuantity = items.reduce(
    (sum, item: PurchaseOrderItem) => sum + item.quantity,
    0
  );

  if (isLoading) {
    return <span className="text-gray-500">Loading...</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <Package className="w-4 h-4 text-blue-600" />
      <span className="font-medium text-blue-600">{totalQuantity} items</span>
    </div>
  );
}

// Component to display production status breakdown — receives pre-fetched orders from POCard
function ProductionStatusBadge({ productionOrders, totalPoQuantity }: {
  productionOrders: any[];
  totalPoQuantity: number;
}) {
  if (productionOrders.length === 0) {
    return null;
  }

  const total = productionOrders.length;
  const pending = productionOrders.filter((o: any) => o.productionStatus === 'PENDING').length;
  const inProgress = productionOrders.filter((o: any) => o.productionStatus === 'LAID_UP').length;
  const shipped = productionOrders.filter((o: any) => o.productionStatus === 'SHIPPED').length;
  const cancelled = productionOrders.filter((o: any) => o.productionStatus === 'CANCELLED').length;
  const active = total - cancelled;
  // Flag when orders outnumber the PO quantity — likely indicates duplicate generation
  const hasDuplicates = totalPoQuantity > 0 && total > totalPoQuantity;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Duplicate warning */}
      {hasDuplicates && (
        <Badge className="bg-orange-100 text-orange-800 text-xs font-semibold" title={`${total} orders generated but PO only has ${totalPoQuantity} units — possible duplicate generation`}>
          ⚠ {total - totalPoQuantity} Duplicate{total - totalPoQuantity !== 1 ? 's' : ''}
        </Badge>
      )}
      {/* Overall total */}
      <Badge variant="outline" className="text-xs font-medium">
        {total} Orders
      </Badge>
      {/* In Progress */}
      {inProgress > 0 && (
        <Badge className="bg-yellow-100 text-yellow-800 text-xs">
          {inProgress} In Progress
        </Badge>
      )}
      {/* Pending */}
      {pending > 0 && (
        <Badge className="bg-blue-100 text-blue-800 text-xs">
          {pending} Pending
        </Badge>
      )}
      {/* Shipped */}
      {shipped > 0 && (
        <Badge className={shipped === active ? 'bg-green-100 text-green-800 text-xs' : 'bg-emerald-50 text-emerald-700 text-xs'}>
          {shipped}/{active} Shipped
        </Badge>
      )}
      {/* Cancelled — only show when present */}
      {cancelled > 0 && (
        <Badge className="bg-red-100 text-red-700 text-xs">
          {cancelled} Cancelled
        </Badge>
      )}
    </div>
  );
}

function POProductionOrdersTab({ poId }: { poId: number }) {
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string>('');
  const [cancelReason, setCancelReason] = useState('');

  const { data: productionOrders = [], isLoading } = useQuery({
    queryKey: [`/api/production-orders/by-po/${poId}`],
    queryFn: () => apiRequest(`/api/production-orders/by-po/${poId}`),
  });

  const { data: poItems = [] } = useQuery({
    queryKey: [`/api/pos/${poId}/items`],
    queryFn: () => fetchPOItems(poId),
  });

  // Build a set of production order IDs that are duplicates.
  // Group by normalized itemName; expected count = matching PO item quantity.
  // Within each group, sort by id ascending (oldest = original); the tail are duplicates.
  const duplicateOrderIds = useMemo((): Set<number> => {
    const result = new Set<number>();
    // Build expected quantity map: normalized itemName → quantity
    const expectedQty = new Map<string, number>();
    for (const item of poItems as PurchaseOrderItem[]) {
      const key = (item.itemName || item.stockModelId || item.itemId || '').toLowerCase().trim();
      if (key) expectedQty.set(key, (expectedQty.get(key) ?? 0) + item.quantity);
    }
    // Group orders by normalized itemName, excluding cancelled orders
    const groups = new Map<string, any[]>();
    for (const order of productionOrders) {
      if (order.productionStatus === 'CANCELLED') continue;
      const key = (order.itemName || order.itemCode || '').toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(order);
    }
    // Within each group, sort oldest first; mark excess as duplicates
    for (const [key, group] of groups) {
      const expected = expectedQty.get(key) ?? 0;
      if (expected === 0) continue; // can't determine expected — skip
      const sorted = [...group].sort((a, b) => a.id - b.id);
      const extras = sorted.slice(expected);
      for (const o of extras) result.add(o.id);
    }
    return result;
  }, [productionOrders, poItems]);

  const duplicateCount = duplicateOrderIds.size;

  const cancelMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      return apiRequest(`/api/orders/cancel/${orderId}`, {
        method: 'POST',
        body: JSON.stringify({ reason, sendToRts: false }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/production-orders/by-po/${poId}`] });
      toast.success('Order cancelled successfully.');
      setCancelDialogOpen(false);
      setCancelReason('');
      setOrderToCancel('');
    },
    onError: (error: any) => {
      toast.error('Failed to cancel order: ' + (error.message || 'Unknown error'));
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return apiRequest(`/api/production-orders/${orderId}/reactivate`, { method: 'POST' });
    },
    onSuccess: (_data, orderId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/production-orders/by-po/${poId}`] });
      toast.success(`Order ${orderId} reactivated — status reset to Pending.`);
    },
    onError: (error: any) => {
      toast.error('Failed to reactivate order: ' + (error.message || 'Unknown error'));
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge className="bg-blue-100 text-blue-800">Pending</Badge>;
      case 'ACTIVE':
        return <Badge className="bg-yellow-100 text-yellow-800">Active</Badge>;
      case 'LAID_UP':
        return <Badge className="bg-orange-100 text-orange-800">Laid Up</Badge>;
      case 'SHIPPED':
        return <Badge className="bg-green-100 text-green-800">Shipped</Badge>;
      case 'CANCELLED':
        return <Badge className="bg-red-100 text-red-800">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading production orders...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (productionOrders.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No production orders generated from this PO.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5" />
          Production Orders ({productionOrders.length})
          {duplicateCount > 0 && (
            <Badge className="bg-orange-100 text-orange-800 text-xs font-semibold ml-1">
              ⚠ {duplicateCount} Duplicate{duplicateCount !== 1 ? 's' : ''} detected
            </Badge>
          )}
        </CardTitle>
        {duplicateCount > 0 && (
          <p className="text-xs text-orange-700 mt-1">
            Rows highlighted in orange were generated beyond the PO item quantity. Cancel them to clean up.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Production Order #</th>
                <th className="text-left p-3 font-medium">Item Name</th>
                <th className="text-left p-3 font-medium">Material</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Department</th>
                <th className="text-left p-3 font-medium">Created</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {productionOrders.map((order: any) => {
                const isDuplicate = duplicateOrderIds.has(order.id);
                return (
                <tr
                  key={order.id}
                  className={`border-b transition-colors ${isDuplicate ? 'bg-orange-50 hover:bg-orange-100' : 'hover:bg-muted/50'}`}
                >
                  <td className="p-3 font-medium text-blue-600">
                    <a href={`/barcode-queue?highlight=${order.orderId}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {order.orderId}
                    </a>
                    {isDuplicate && (
                      <Badge className="bg-orange-200 text-orange-900 text-[10px] ml-1.5 px-1 py-0">DUPE</Badge>
                    )}
                  </td>
                  <td className="p-3">{order.itemName || '—'}</td>
                  <td className="p-3">{order.materialCanonical || '—'}</td>
                  <td className="p-3">{getStatusBadge(order.productionStatus)}</td>
                  <td className="p-3 text-muted-foreground">{order.currentDepartment || '—'}</td>
                  <td className="p-3 text-muted-foreground">
                    {order.createdAt ? formatDate(new Date(order.createdAt), 'M/d/yy') : '—'}
                  </td>
                  <td className="p-3 flex items-center gap-1">
                    {order.productionStatus === 'CANCELLED' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-green-700 hover:text-green-800 hover:bg-green-50 border-green-300 h-7 px-2"
                        disabled={reactivateMutation.isPending}
                        onClick={() => reactivateMutation.mutate(order.orderId)}
                        title="Reset this order to Pending so it re-enters the production queue"
                      >
                        {reactivateMutation.isPending && reactivateMutation.variables === order.orderId
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
                        Reactivate
                      </Button>
                    ) : order.productionStatus !== 'SHIPPED' && (
                      <Button
                        variant={isDuplicate ? 'destructive' : 'ghost'}
                        size="sm"
                        className={isDuplicate ? 'h-7 px-2 text-xs' : 'text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2'}
                        onClick={() => {
                          setOrderToCancel(order.orderId);
                          setCancelReason(isDuplicate ? 'Duplicate order — generated beyond PO item quantity' : '');
                          setCancelDialogOpen(true);
                        }}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        {isDuplicate ? 'Cancel Duplicate' : 'Cancel'}
                      </Button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={cancelDialogOpen} onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) { setCancelReason(''); setOrderToCancel(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Production Order</DialogTitle>
            <DialogDescription>
              Cancel order <strong>{orderToCancel}</strong>. Please provide a reason for cancellation.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="cancel-reason" className="mb-1 block">Reason</Label>
            <Textarea
              id="cancel-reason"
              placeholder="Enter cancellation reason..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Keep Order
            </Button>
            <Button
              variant="destructive"
              disabled={!cancelReason.trim() || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ orderId: orderToCancel, reason: cancelReason.trim() })}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Confirm Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Component for PO Attachments management
function POAttachments({ poId, poNumber }: { poId: number; poNumber: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const queryClient = useQueryClient();
  const fileInputRef = { current: null as HTMLInputElement | null };

  const handlePreview = (attachmentId: string, fileName: string) => {
    setPreviewFileName(fileName);
    setPreviewUrl(`/api/pos/${poId}/attachments/${attachmentId}/download`);
  };

  const { data: attachments = [], isLoading, refetch } = useQuery({
    queryKey: [`/api/pos/${poId}/attachments`],
    queryFn: () => apiRequest(`/api/pos/${poId}/attachments`),
    enabled: isOpen,
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest(`/api/pos/${poId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      toast.success('Attachment deleted');
      refetch();
    },
    onError: () => {
      toast.error('Failed to delete attachment');
    },
  });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please select a PDF file');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error('File size must be less than 20MB');
      return;
    }

    setIsUploading(true);
    try {
      const urlResponse = await apiRequest(`/api/pos/${poId}/attachments/request-upload-url`, {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      await fetch(urlResponse.uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      await apiRequest(`/api/pos/${poId}/attachments/complete-upload`, {
        method: 'POST',
        body: JSON.stringify({
          objectPath: urlResponse.objectPath,
          originalFileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      });

      toast.success('PDF attached successfully');
      refetch();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload PDF');
    } finally {
      setIsUploading(false);
      if (event.target) event.target.value = '';
    }
  };

  const handleDownload = (attachmentId: string, fileName: string) => {
    window.open(`/api/pos/${poId}/attachments/${attachmentId}/download?download=true`, '_blank');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-1">
          <Paperclip className="w-4 h-4" />
          {(attachments as any[]).length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded">
              {(attachments as any[]).length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>PO Attachments - {poNumber}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Attach PDF copies of purchase orders
            </p>
            <div>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
                id={`po-upload-${poId}`}
                ref={(el) => (fileInputRef.current = el)}
              />
              <Button 
                size="sm" 
                onClick={() => document.getElementById(`po-upload-${poId}`)?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload PDF
                  </>
                )}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading attachments...
            </div>
          ) : (attachments as any[]).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No attachments yet</p>
              <p className="text-xs">Upload a PDF copy of this PO</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(attachments as any[]).map((attachment: any) => (
                <div
                  key={attachment.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {attachment.originalFileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(attachment.fileSize)} • {new Date(attachment.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePreview(attachment.id, attachment.originalFileName)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownload(attachment.id, attachment.originalFileName)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm('Delete this attachment?')) {
                          deleteMutation.mutate(attachment.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) { setPreviewUrl(null); setPreviewFileName(''); } }}>
      <DialogContent className="max-w-4xl w-full h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="truncate pr-4">{previewFileName}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title={previewFileName}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// Component for individual PO card to safely use hooks
function POCard({
  po,
  onEdit,
  onDelete,
  onViewItems,
  onCalculateSchedule,
  onGenerateProductionOrders,
  onReassignCustomer,
  isLoadingPreview,
  isGeneratingOrdersForThisPO,
}: {
  po: PurchaseOrder;
  onEdit: (po: PurchaseOrder) => void;
  onDelete: (id: number) => void;
  onViewItems: (po: PurchaseOrder) => void;
  onCalculateSchedule: (id: number) => void;
  onGenerateProductionOrders: (id: number) => void;
  onReassignCustomer: (po: PurchaseOrder) => void;
  isLoadingPreview: boolean;
  isGeneratingOrdersForThisPO: boolean;
}) {
  const { data: productionOrders = [] } = useQuery({
    queryKey: [`/api/production-orders/by-po/${po.id}`],
    queryFn: () => apiRequest(`/api/production-orders/by-po/${po.id}`),
  });

  const { data: poItems = [] } = useQuery({
    queryKey: [`/api/pos/${po.id}/items`],
    queryFn: () => fetchPOItems(po.id),
  });

  const totalPoQuantity = (poItems as PurchaseOrderItem[]).reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  const hasOrders = productionOrders.length > 0;
  const orderCount = productionOrders.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-green-100 text-green-800';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{po.poNumber}</CardTitle>
            <CardDescription className="mt-1">
              {po.customerName} ({po.customerId})
            </CardDescription>
            <div className="mt-2 flex items-center gap-1">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="font-medium text-blue-600">{totalPoQuantity} items</span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Badge className={getStatusColor(po.status)}>{po.status}</Badge>
            <ProductionStatusBadge productionOrders={productionOrders} totalPoQuantity={totalPoQuantity} />
            <div className="flex gap-1 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewItems(po)}
                className="flex items-center gap-1"
              >
                <Package className="w-4 h-4" />
                Manage Items
              </Button>
              <POAttachments poId={po.id} poNumber={po.poNumber} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEdit(po)}
                title="Edit PO Details"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onReassignCustomer(po)}
                title="Reassign Customer"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </Button>

              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCalculateSchedule(po.id)}
                >
                  Calculate Schedule
                </Button>
                {(() => {
                  const hasGap = hasOrders && orderCount < totalPoQuantity;
                  const fullyGenerated = hasOrders && orderCount >= totalPoQuantity;
                  return (
                    <Button
                      variant={hasGap ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onGenerateProductionOrders(po.id)}
                      disabled={isGeneratingOrdersForThisPO || isLoadingPreview || fullyGenerated}
                      className={hasGap ? 'bg-amber-500 hover:bg-amber-600 text-white border-0' : ''}
                      title={
                        fullyGenerated
                          ? `All ${orderCount} production orders already generated`
                          : hasGap
                            ? `${totalPoQuantity - orderCount} item(s) missing production orders — click to fill gaps`
                            : 'Generate production orders from this PO'
                      }
                    >
                      {isGeneratingOrdersForThisPO
                        ? 'Generating...'
                        : isLoadingPreview
                          ? 'Loading Preview...'
                          : fullyGenerated
                            ? `Orders Generated (${orderCount})`
                            : hasGap
                              ? `Fill Missing Orders (${totalPoQuantity - orderCount})`
                              : 'Generate Production Orders'}
                    </Button>
                  );
                })()}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(po.id)}
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">PO Date:</span>{' '}
            {new Date(po.poDate).toLocaleDateString()}
          </div>
          <div>
            <span className="font-medium">Expected Delivery:</span>{' '}
            {new Date(po.expectedDelivery).toLocaleDateString()}
          </div>
        </div>
        {po.notes && (
          <div className="mt-3 pt-3 border-t">
            <span className="font-medium text-sm">Notes:</span> {po.notes}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  customerType: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description?: string;
  isActive: boolean;
}

export default function POManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'OPEN' | 'CLOSED' | 'CANCELED'
  >('ALL');
  const [poListTab, setPoListTab] = useState<'active' | 'completed'>('active');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchValue, setCustomerSearchValue] = useState('');
  const queryClient = useQueryClient();
  const [isGeneratingOrders, setIsGeneratingOrders] = useState(false);
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    willGenerate: { name: string; quantity: number; orderCount: number }[];
    willSkip: { name: string; quantity: number; reason: string }[];
    totalOrderCount: number;
  } | null>(null);
  const [previewPoId, setPreviewPoId] = useState<number | null>(null);
  const [loadingPreviewPoId, setLoadingPreviewPoId] = useState<number | null>(null);
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [reassignPO, setReassignPO] = useState<PurchaseOrder | null>(null);
  const [reassignCustomerSearch, setReassignCustomerSearch] = useState('');
  const [reassignCustomerOpen, setReassignCustomerOpen] = useState(false);
  const [reassignTargetCustomer, setReassignTargetCustomer] = useState<Customer | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<string[]>([]);
  const [newCustomerData, setNewCustomerData] = useState({
    name: '',
    email: '',
    phone: '',
    contact: '',
    customerType: 'standard' as string,
    preferredCommunicationMethod: [] as string[],
    notes: '',
    isActive: true,
    address: {
      street: '',
      street2: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'United States',
      type: 'both' as 'shipping' | 'billing' | 'both',
    },
  });

  // Form state
  const [formData, setFormData] = useState({
    poNumber: '',
    customerId: '',
    customerName: '',
    poDate: new Date().toISOString().split('T')[0],
    expectedDelivery: '',
    status: 'OPEN' as 'OPEN' | 'CLOSED' | 'CANCELED',
    notes: '',
  });

  const {
    data: pos = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['/api/pos'],
    queryFn: fetchPOs,
  });

  // Fetch all customers for dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('/api/customers'),
  });

  // Fetch stock models for order entry
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
  });

  const createMutation = useMutation({
    mutationFn: createPO,
    onSuccess: (newPO) => {
      toast.success('Purchase order created successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
      // Show order entry for new POs
      if (!editingPO && selectedCustomer) {
        setShowOrderEntry(true);
      }
    },
    onError: (error: any) => {
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        'Failed to create purchase order';
      toast.error(errorMessage);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<CreatePurchaseOrderData>;
    }) => updatePO(id, data),
    onSuccess: () => {
      toast.success('Purchase order updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to update purchase order');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePO,
    onSuccess: () => {
      toast.success('Purchase order deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
    },
    onError: () => {
      toast.error('Failed to delete purchase order');
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      // Flatten address for backend compatibility
      const flattenedData = {
        ...customerData,
        address: customerData.address.street,
        city: customerData.address.city,
        state: customerData.address.state,
        zipCode: customerData.address.zipCode,
      };
      return apiRequest('/api/customers/create-bypass', {
        method: 'POST',
        body: JSON.stringify(flattenedData),
      });
    },
    onSuccess: (newCustomer) => {
      toast.success('Customer created successfully');
      // Update form data with new customer
      setFormData({
        ...formData,
        customerName: newCustomer.name,
        customerId: newCustomer.id.toString(),
      });
      setSelectedCustomer(newCustomer);
      // Refresh customers list
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setShowCreateCustomer(false);
      // Reset new customer form
      setNewCustomerData({
        name: '',
        email: '',
        phone: '',
        contact: '',
        customerType: 'standard',
        preferredCommunicationMethod: [],
        notes: '',
        isActive: true,
        address: {
          street: '',
          street2: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'United States',
          type: 'both',
        },
      });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create customer');
    },
  });

  const handleCalculateSchedule = async (poId: number) => {
    try {
      const result = await apiRequest(
        `/api/pos/${poId}/calculate-production-schedule`,
        {
          method: 'POST',
        }
      );

      console.log('Production schedule calculated:', result);
      setScheduleData(result);
      setShowScheduleModal(true);
    } catch (error) {
      console.error('Calculate schedule error:', error);
      toast.error('Failed to calculate production schedule');
    }
  };

  const handleGenerateProductionOrders = async (poId: number) => {
    setLoadingPreviewPoId(poId);
    try {
      const preview = await apiRequest(
        `/api/pos/${poId}/preview-production-orders`,
        { method: 'POST' }
      );
      setPreviewData(preview);
      setPreviewPoId(poId);
      setPreviewDialogOpen(true);
    } catch (error) {
      console.error('Preview production orders error:', error);
      toast.error('Failed to load production order preview');
    } finally {
      setLoadingPreviewPoId(null);
    }
  };

  const handleConfirmGenerateProductionOrders = async () => {
    if (previewPoId === null) return;
    setPreviewDialogOpen(false);
    setIsGeneratingOrders(true);
    try {
      const result = await apiRequest(
        `/api/pos/${previewPoId}/generate-production-orders`,
        { method: 'POST' }
      );

      console.log('Generated production orders:', result);
      toast.success(`Generated ${result.createdOrders} production orders`);

      refetch();

      try {
        console.log('🟢 Auto-scheduling new OEM production orders...');
        const scheduleResult = await apiRequest('/api/algorithmic-schedule', {
          method: 'POST',
        });
        console.log('✅ OEM orders automatically scheduled:', scheduleResult);
        toast.success(
          `OEM orders scheduled! ${result.createdOrders} green cards now visible on schedule.`
        );
      } catch (scheduleError) {
        console.error('❌ Auto-schedule failed:', scheduleError);
        toast.error(
          'Production orders created but auto-scheduling failed. Use Generate Schedule button.'
        );
      }
    } catch (error) {
      console.error('Generate production orders error:', error);
      toast.error('Failed to generate production orders');
    } finally {
      setIsGeneratingOrders(false);
      setPreviewPoId(null);
      setPreviewData(null);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    console.log('🟢 Form submitted with formData:', formData);

    // Validate required fields
    if (
      !formData.poNumber ||
      !formData.customerId ||
      !formData.customerName ||
      !formData.poDate ||
      !formData.expectedDelivery
    ) {
      const missingFields = {
        poNumber: !formData.poNumber,
        customerId: !formData.customerId,
        customerName: !formData.customerName,

        poDate: !formData.poDate,
        expectedDelivery: !formData.expectedDelivery,
      };
      console.log('❌ Validation failed - missing fields:', missingFields);

      // More specific error message
      const missing = Object.entries(missingFields)
        .filter(([_, isMissing]) => isMissing)
        .map(([field]) => field)
        .join(', ');

      toast.error(`Please fill in all required fields: ${missing}`);
      return;
    }

    const data: CreatePurchaseOrderData = {
      poNumber: formData.poNumber,
      customerId: formData.customerId,
      customerName: formData.customerName,
      itemType: 'multiple', // Default to multiple since we're using the advanced order entry
      poDate: formData.poDate,
      expectedDelivery: formData.expectedDelivery,
      status: formData.status,
      notes: formData.notes || undefined,
    };

    console.log('Submitting PO data:', data);

    if (editingPO) {
      updateMutation.mutate({ id: editingPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Initialize form data on component mount
  useEffect(() => {
    if (!editingPO) {
      setFormData({
        poNumber: '',
        customerId: '',
        customerName: '',
        poDate: new Date().toISOString().split('T')[0],
        expectedDelivery: '',
        status: 'OPEN',
        notes: '',
      });
    }
  }, [editingPO]);

  const handleEdit = (po: PurchaseOrder) => {
    setEditingPO(po);
    setFormData({
      poNumber: po.poNumber,
      customerId: po.customerId,
      customerName: po.customerName,

      poDate: po.poDate ? new Date(po.poDate).toISOString().split('T')[0] : '',
      expectedDelivery: po.expectedDelivery
        ? new Date(po.expectedDelivery).toISOString().split('T')[0]
        : '',
      status: po.status,
      notes: po.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingPO(null);
    setFormData({
      poNumber: '',
      customerId: '',
      customerName: '',
      poDate: new Date().toISOString().split('T')[0],
      expectedDelivery: '',
      status: 'OPEN',
      notes: '',
    });
  };

  const handleCreateCustomer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate required fields
    if (!newCustomerData.name) {
      toast.error('Customer name is required');
      return;
    }

    createCustomerMutation.mutate(newCustomerData);
  };

  const handleCreateCustomerDialogClose = () => {
    setShowCreateCustomer(false);
    setNewCustomerData({
      name: '',
      email: '',
      phone: '',
      contact: '',
      customerType: 'standard',
      preferredCommunicationMethod: [],
      notes: '',
      isActive: true,
      address: {
        street: '',
        street2: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'United States',
        type: 'both',
      },
    });
  };

  const handleDelete = (id: number) => {
    if (
      window.confirm('Are you sure you want to delete this purchase order?')
    ) {
      deleteMutation.mutate(id);
    }
  };

  const handleViewItems = (po: PurchaseOrder) => {
    setSelectedPO(po);
  };

  const handleReassignCustomer = async () => {
    if (!reassignPO || !reassignTargetCustomer) return;
    try {
      await apiRequest(`/api/pos/${reassignPO.id}/reassign-customer`, {
        method: 'PUT',
        body: JSON.stringify({ newCustomerId: reassignTargetCustomer.id }),
        headers: { 'Content-Type': 'application/json' },
      });
      toast.success(`PO ${reassignPO.poNumber} reassigned to ${reassignTargetCustomer.name}`);
      queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
      setReassignPO(null);
      setReassignTargetCustomer(null);
      setReassignCustomerSearch('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reassign customer');
    }
  };

  const filteredPOs = pos.filter((po) => {
    const matchesSearch =
      po.poNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.customerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      po.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab =
      poListTab === 'active'
        ? po.status === 'OPEN'
        : po.status === 'CLOSED' || po.status === 'CANCELED';
    return matchesSearch && matchesTab;
  });

  const groupedPOs = (() => {
    // Group by customer name (case-insensitive) so that POs for the same customer
    // are merged even when they carry different internal customer IDs.
    const groups: Record<string, { customerName: string; customerId: string; groupKey: string; pos: typeof filteredPOs }> = {};
    filteredPOs.forEach((po) => {
      const key = (po.customerName || '').toLowerCase().trim();
      if (!groups[key]) {
        groups[key] = { customerName: po.customerName, customerId: po.customerId, groupKey: key, pos: [] };
      }
      groups[key].pos.push(po);
    });
    Object.values(groups).forEach((group) => {
      group.pos.sort((a, b) => {
        const numA = parseInt(a.poNumber.replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(b.poNumber.replace(/\D/g, ''), 10) || 0;
        return numA - numB;
      });
    });
    return Object.values(groups).sort((a, b) => a.customerName.localeCompare(b.customerName));
  })();

  const allGroupKeys = groupedPOs.map((g) => g.groupKey);

  const allExpanded = allGroupKeys.length > 0 && allGroupKeys.every((k) => expandedCustomers.includes(k));

  const toggleAllAccordions = () => {
    if (allExpanded) {
      setExpandedCustomers([]);
    } else {
      setExpandedCustomers(allGroupKeys);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-green-100 text-green-800';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {selectedPO ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <Button
              variant="outline"
              onClick={() => setSelectedPO(null)}
              className="mb-4"
            >
              ← Back to POs
            </Button>
          </div>

          <Tabs defaultValue="line-items" className="w-full">
            <TabsList>
              <TabsTrigger value="line-items">Line Items</TabsTrigger>
              <TabsTrigger value="production-orders">Production Orders</TabsTrigger>
            </TabsList>

            <TabsContent value="line-items">
              <div className="space-y-4">
                <POItemsManager
                  poId={selectedPO.id}
                  poNumber={selectedPO.poNumber}
                  customerName={selectedPO.customerName}
                  onAddItem={() => setShowOrderEntry(true)}
                />
              </div>
            </TabsContent>

            <TabsContent value="production-orders">
              <POProductionOrdersTab poId={selectedPO.id} />
            </TabsContent>
          </Tabs>

          {/* Product Selection Dialog */}
          <POProductSelector
            poId={selectedPO.id}
            customerName={selectedPO.customerName}
            isOpen={showOrderEntry}
            onClose={() => setShowOrderEntry(false)}
            onSuccess={() => {
              setShowOrderEntry(false);
              queryClient.invalidateQueries({
                queryKey: [`/api/pos/${selectedPO.id}/items`],
              });
              queryClient.invalidateQueries({ queryKey: ['/api/pos'] });
            }}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Purchase Order Management</h2>
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                console.log('🔵 Dialog onOpenChange called, open:', open);
                if (open) {
                  console.log('🔵 Dialog opening, resetting form...');
                  setEditingPO(null);
                  setFormData({
                    poNumber: '',
                    customerId: '',
                    customerName: '',

                    poDate: new Date().toISOString().split('T')[0],
                    expectedDelivery: '',
                    status: 'OPEN',
                    notes: '',
                  });
                }
                setIsDialogOpen(open);
                console.log('🔵 Dialog state set to:', open);
              }}
            >
              <DialogTrigger asChild>
                <Button data-testid="button-add-purchase-order">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Purchase Order
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingPO
                      ? 'Edit Purchase Order'
                      : 'Add New Purchase Order'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="poNumber">PO Number</Label>
                    <Input
                      id="poNumber"
                      name="poNumber"
                      value={formData.poNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, poNumber: e.target.value })
                      }
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <Label htmlFor="customerName">Customer Name</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowCreateCustomer(true)}
                        className="flex items-center gap-1"
                      >
                        <UserPlus className="w-4 h-4" />
                        Create New Customer
                      </Button>
                    </div>
                    <Popover
                      open={customerSearchOpen}
                      onOpenChange={setCustomerSearchOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerSearchOpen}
                          className="w-full justify-between"
                        >
                          {formData.customerName ||
                            'Search and select customer...'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="Type to search customers..."
                            value={customerSearchValue}
                            onValueChange={setCustomerSearchValue}
                          />
                          <CommandList>
                            <CommandEmpty>
                              <div className="text-center py-4">
                                <p className="text-sm text-gray-500 mb-2">
                                  No customers found.
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCustomerSearchOpen(false);
                                    setShowCreateCustomer(true);
                                  }}
                                  className="flex items-center gap-1"
                                >
                                  <UserPlus className="w-4 h-4" />
                                  Create New Customer
                                </Button>
                              </div>
                            </CommandEmpty>
                            <CommandGroup>
                              {customers
                                .filter(
                                  (customer: Customer) =>
                                    customer.name
                                      .toLowerCase()
                                      .includes(
                                        customerSearchValue.toLowerCase()
                                      ) ||
                                    (customer.company &&
                                      customer.company
                                        .toLowerCase()
                                        .includes(
                                          customerSearchValue.toLowerCase()
                                        ))
                                )
                                .map((customer: Customer) => (
                                  <CommandItem
                                    key={customer.id}
                                    value={customer.name}
                                    onSelect={() => {
                                      setFormData({
                                        ...formData,
                                        customerName: customer.name,
                                        customerId: customer.id.toString(),
                                      });
                                      setSelectedCustomer(customer);
                                      setCustomerSearchOpen(false);
                                      setCustomerSearchValue('');
                                    }}
                                  >
                                    <Check
                                      className={`mr-2 h-4 w-4 ${
                                        formData.customerName === customer.name
                                          ? 'opacity-100'
                                          : 'opacity-0'
                                      }`}
                                    />
                                    {customer.name}{' '}
                                    {customer.company &&
                                      `(${customer.company})`}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="poDate">PO Date</Label>
                      <Input
                        id="poDate"
                        name="poDate"
                        type="date"
                        value={formData.poDate}
                        onChange={(e) =>
                          setFormData({ ...formData, poDate: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="expectedDelivery">
                        Expected Delivery
                      </Label>
                      <Input
                        id="expectedDelivery"
                        name="expectedDelivery"
                        type="date"
                        value={formData.expectedDelivery}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            expectedDelivery: e.target.value,
                          })
                        }
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) =>
                        setFormData({
                          ...formData,
                          status: value as 'OPEN' | 'CLOSED' | 'CANCELED',
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPEN">Open</SelectItem>
                        <SelectItem value="CLOSED">Closed</SelectItem>
                        <SelectItem value="CANCELED">Canceled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={(e) =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                      rows={3}
                    />
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDialogClose}
                      data-testid="button-cancel-po"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        createMutation.isPending || updateMutation.isPending
                      }
                      data-testid="button-submit-po"
                    >
                      {editingPO ? 'Update' : 'Create'} PO
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Active / Completed tabs + search */}
          <Tabs value={poListTab} onValueChange={(v) => { setPoListTab(v as 'active' | 'completed'); setSearchTerm(''); }}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <TabsList>
                <TabsTrigger value="active">
                  Active POs
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {pos.filter((p) => p.status === 'OPEN').length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed POs
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {pos.filter((p) => p.status === 'CLOSED' || p.status === 'CANCELED').length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <div className="flex gap-3 items-center flex-1 min-w-0">
                <div className="flex-1 relative min-w-0">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by PO number or customer..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {groupedPOs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleAllAccordions}
                  >
                    {allExpanded ? 'Collapse All' : 'Expand All'}
                  </Button>
                )}
              </div>
            </div>

            {/* Purchase Orders List - Grouped by Customer */}
            <TabsContent value={poListTab} className="mt-4">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-center py-8">Loading purchase orders...</div>
                ) : filteredPOs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {searchTerm
                      ? 'No purchase orders match your search.'
                      : poListTab === 'active'
                      ? 'No open purchase orders. Click "Add Purchase Order" to create one.'
                      : 'No completed purchase orders yet.'}
                  </div>
                ) : (
                  <Accordion
                    type="multiple"
                    value={expandedCustomers}
                    onValueChange={setExpandedCustomers}
                    className="space-y-4"
                  >
                    {groupedPOs.map((group) => (
                      <AccordionItem
                        key={group.groupKey}
                        value={group.groupKey}
                        className="border rounded-lg px-4"
                      >
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-800">{group.customerName}</h3>
                            <Badge variant="secondary" className="text-xs">{group.pos.length} PO{group.pos.length !== 1 ? 's' : ''}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="grid gap-4 pt-2 pb-2">
                            {group.pos.map((po) => (
                              <POCard
                                key={po.id}
                                po={po}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                                onViewItems={handleViewItems}
                                onCalculateSchedule={handleCalculateSchedule}
                                onGenerateProductionOrders={handleGenerateProductionOrders}
                                onReassignCustomer={(po) => {
                                  setReassignPO(po);
                                  setReassignTargetCustomer(null);
                                  setReassignCustomerSearch('');
                                }}
                                isLoadingPreview={loadingPreviewPoId === po.id}
                                isGeneratingOrdersForThisPO={isGeneratingOrders && previewPoId === po.id}
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Production Schedule Modal */}
      <Dialog open={showScheduleModal} onOpenChange={setShowScheduleModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>P1 Production Schedule Analysis</DialogTitle>
          </DialogHeader>

          {scheduleData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div>
                  <label className="text-sm font-medium">PO Number:</label>
                  <p className="text-lg">{scheduleData.poNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Final Due Date:</label>
                  <p className="text-lg">
                    {new Date(scheduleData.finalDueDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Available Weeks:
                  </label>
                  <p className="text-lg">{scheduleData.availableWeeks}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Total Items:</label>
                  <p className="text-lg">{scheduleData.totalItemsNeeded}</p>
                </div>
              </div>

              <div
                className={`p-4 rounded-lg ${
                  scheduleData.overallFeasible
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}
              >
                <h3
                  className={`font-semibold ${
                    scheduleData.overallFeasible
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-red-800 dark:text-red-200'
                  }`}
                >
                  {scheduleData.recommendations.feasible
                    ? '✅ Schedule Feasible'
                    : '⚠️ Schedule Requires Attention'}
                </h3>
                <p className="text-sm mt-1">
                  {scheduleData.recommendations.message}
                </p>
                <ul className="text-sm mt-2 space-y-1">
                  {scheduleData.recommendations.suggestedActions.map(
                    (action: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>{action}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                  Item Production Schedules
                </h3>
                {scheduleData.itemSchedules.map((item: any, index: number) => (
                  <div
                    key={index}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold">{item.itemName}</h4>
                        <p className="text-sm text-gray-600">
                          Total Quantity: {item.totalQuantity}
                        </p>
                      </div>
                      <div className="text-right">
                        <div
                          className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                            item.feasible
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                          }`}
                        >
                          {item.feasible ? 'Feasible' : 'Requires Attention'}
                        </div>
                        <p className="text-sm mt-1">
                          {item.itemsPerWeek} items/week for {item.weeksNeeded}{' '}
                          weeks
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {item.weeklySchedule.map(
                        (week: any, weekIndex: number) => (
                          <div
                            key={weekIndex}
                            className="bg-gray-50 dark:bg-gray-800 p-3 rounded border"
                          >
                            <div className="font-medium">Week {week.week}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Due: {new Date(week.dueDate).toLocaleDateString()}
                            </div>
                            <div className="text-sm">
                              Complete: {week.itemsToComplete} items
                            </div>
                            <div className="text-xs text-gray-500">
                              Cumulative: {week.cumulativeItems}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Customer Creation Dialog */}
      <Dialog
        open={showCreateCustomer}
        onOpenChange={(open) => {
          if (!open) {
            handleCreateCustomerDialogClose();
          }
          setShowCreateCustomer(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Create New Customer</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleCreateCustomer}
            className="space-y-4 overflow-y-auto flex-1 pr-2"
          >
            {/* Name - Full width */}
            <div>
              <Label htmlFor="customerNameNew">Customer Name *</Label>
              <Input
                id="customerNameNew"
                data-testid="input-customer-name"
                value={newCustomerData.name}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    name: e.target.value,
                  })
                }
                required
                placeholder="John Smith"
              />
            </div>

            {/* Contact - Full width */}
            <div>
              <Label htmlFor="customerContact">Contact Person</Label>
              <Input
                id="customerContact"
                data-testid="input-customer-contact"
                value={newCustomerData.contact}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    contact: e.target.value,
                  })
                }
                placeholder="John Doe"
              />
            </div>

            {/* Email and Phone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerEmail">Email</Label>
                <Input
                  id="customerEmail"
                  data-testid="input-customer-email"
                  type="email"
                  value={newCustomerData.email}
                  onChange={(e) =>
                    setNewCustomerData({
                      ...newCustomerData,
                      email: e.target.value,
                    })
                  }
                  placeholder="customer@email.com"
                />
              </div>
              <div>
                <Label htmlFor="customerPhone">Phone</Label>
                <Input
                  id="customerPhone"
                  data-testid="input-customer-phone"
                  value={newCustomerData.phone}
                  onChange={(e) =>
                    setNewCustomerData({
                      ...newCustomerData,
                      phone: e.target.value,
                    })
                  }
                  placeholder="555-0123"
                />
              </div>
            </div>

            {/* Customer Type */}
            <div>
              <Label htmlFor="customerType">Customer Type</Label>
              <Select
                value={newCustomerData.customerType}
                onValueChange={(value) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    customerType: value,
                  })
                }
              >
                <SelectTrigger data-testid="select-customer-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Individual">Individual</SelectItem>
                  <SelectItem value="Business">Business</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Military">Military</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Communication Method - Checkboxes */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Preferred Communication Method
              </Label>
              <div className="flex flex-col gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="comm-email-po"
                    data-testid="checkbox-comm-email"
                    checked={newCustomerData.preferredCommunicationMethod.includes(
                      'email'
                    )}
                    onCheckedChange={(checked) => {
                      const methods =
                        newCustomerData.preferredCommunicationMethod;
                      setNewCustomerData({
                        ...newCustomerData,
                        preferredCommunicationMethod: checked
                          ? [...methods, 'email']
                          : methods.filter((m) => m !== 'email'),
                      });
                    }}
                  />
                  <Label
                    htmlFor="comm-email-po"
                    className="text-sm font-normal cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <span>Email</span>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="comm-sms-po"
                    data-testid="checkbox-comm-sms"
                    checked={newCustomerData.preferredCommunicationMethod.includes(
                      'sms'
                    )}
                    onCheckedChange={(checked) => {
                      const methods =
                        newCustomerData.preferredCommunicationMethod;
                      setNewCustomerData({
                        ...newCustomerData,
                        preferredCommunicationMethod: checked
                          ? [...methods, 'sms']
                          : methods.filter((m) => m !== 'sms'),
                      });
                    }}
                  />
                  <Label
                    htmlFor="comm-sms-po"
                    className="text-sm font-normal cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span>SMS</span>
                    </div>
                  </Label>
                </div>
              </div>
              {newCustomerData.preferredCommunicationMethod.length === 0 && (
                <p className="text-sm text-gray-500 italic">
                  No communication method selected
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label htmlFor="customerNotes">Notes</Label>
              <Textarea
                id="customerNotes"
                data-testid="textarea-customer-notes"
                value={newCustomerData.notes}
                onChange={(e) =>
                  setNewCustomerData({
                    ...newCustomerData,
                    notes: e.target.value,
                  })
                }
                placeholder="Additional notes..."
                className="min-h-[80px]"
              />
            </div>

            {/* Address */}
            <AddressInput
              label="Address (Optional)"
              value={newCustomerData.address}
              onChange={(address) =>
                setNewCustomerData({
                  ...newCustomerData,
                  address: {
                    ...address,
                    street2: newCustomerData.address.street2 || '',
                    type: newCustomerData.address.type || 'both',
                  },
                })
              }
              required={false}
            />

            {/* Is Active Toggle */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActiveCustomer"
                data-testid="switch-is-active"
                checked={newCustomerData.isActive}
                onCheckedChange={(checked) =>
                  setNewCustomerData({ ...newCustomerData, isActive: checked })
                }
              />
              <Label htmlFor="isActiveCustomer" className="cursor-pointer">
                Active Customer
              </Label>
            </div>

            <div className="flex justify-end space-x-2 flex-shrink-0 pt-4 border-t mt-4 sticky bottom-0 bg-white dark:bg-gray-900">
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateCustomerDialogClose}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createCustomerMutation.isPending}
                data-testid="button-create-customer"
              >
                {createCustomerMutation.isPending
                  ? 'Creating...'
                  : 'Create Customer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reassign Customer Dialog */}
      <Dialog open={!!reassignPO} onOpenChange={(open) => { if (!open) setReassignPO(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Customer</DialogTitle>
          </DialogHeader>
          {reassignPO && (
            <div className="space-y-4">
              <div className="text-sm">
                <span className="font-medium">PO:</span> {reassignPO.poNumber}
              </div>
              <div className="text-sm">
                <span className="font-medium">Current Customer:</span> {reassignPO.customerName} ({reassignPO.customerId})
              </div>
              <div>
                <Label>New Customer</Label>
                <Popover open={reassignCustomerOpen} onOpenChange={setReassignCustomerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between mt-1"
                    >
                      {reassignTargetCustomer
                        ? `${reassignTargetCustomer.name} (${reassignTargetCustomer.id})`
                        : 'Select customer...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput
                        placeholder="Search customers..."
                        value={reassignCustomerSearch}
                        onValueChange={setReassignCustomerSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          {(customers || [])
                            .filter((c: Customer) =>
                              c.name.toLowerCase().includes(reassignCustomerSearch.toLowerCase()) ||
                              String(c.id).includes(reassignCustomerSearch)
                            )
                            .slice(0, 20)
                            .map((c: Customer) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.name} ${c.id}`}
                                onSelect={() => {
                                  setReassignTargetCustomer(c);
                                  setReassignCustomerOpen(false);
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${reassignTargetCustomer?.id === c.id ? 'opacity-100' : 'opacity-0'}`} />
                                {c.name} ({c.id})
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setReassignPO(null)}>Cancel</Button>
                <Button
                  onClick={handleReassignCustomer}
                  disabled={!reassignTargetCustomer || reassignTargetCustomer.id === parseInt(reassignPO.customerId)}
                >
                  Reassign
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Production Order Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={(open) => { if (!open) { setPreviewDialogOpen(false); setPreviewData(null); setPreviewPoId(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Production Order Preview</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              {previewData.willGenerate.length > 0 ? (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-green-700">Items that will generate orders</h4>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Item</th>
                          <th className="text-right p-2 font-medium">Qty</th>
                          <th className="text-right p-2 font-medium">Orders</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.willGenerate.map((item: any, i: number) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="p-2">{item.name}</td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2 text-right font-medium text-green-700">
                              {item.alreadyGenerated > 0
                                ? <span title={`${item.alreadyGenerated} already exist; generating ${item.orderCount} more`}>+{item.orderCount} <span className="text-gray-400 font-normal text-xs">({item.alreadyGenerated} exist)</span></span>
                                : item.orderCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No items will generate production orders.</p>
              )}

              {previewData.willSkip.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-gray-500">Items that will be skipped</h4>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">Item</th>
                          <th className="text-right p-2 font-medium">Qty</th>
                          <th className="text-left p-2 font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.willSkip.map((item, i) => (
                          <tr key={i} className="border-b last:border-0 text-muted-foreground">
                            <td className="p-2">{item.name}</td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2">{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm font-semibold">Total orders to create: <span className="text-green-700">{previewData.totalOrderCount}</span></span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => { setPreviewDialogOpen(false); setPreviewData(null); setPreviewPoId(null); }}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmGenerateProductionOrders}
                    disabled={previewData.totalOrderCount === 0}
                  >
                    Confirm &amp; Generate
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

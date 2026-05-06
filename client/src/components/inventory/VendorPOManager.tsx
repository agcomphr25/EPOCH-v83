import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

import {
  Pencil,
  Trash2,
  Plus,
  Eye,
  Package,
  Search,
  TrendingUp,
  ShoppingCart,
  Calendar as CalendarIcon,
  Building2,
  FileDown,
  Send,
  CheckCircle,
  XCircle,
  FileText,
  Check,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Paperclip,
  Clock,
  Archive,
  ArchiveRestore,
  ThumbsDown,
  Timer,
  ThumbsUp,
  ChevronDown,
  ChevronRight,
  Truck,
  ClipboardList,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'react-hot-toast';
import { Checkbox } from '@/components/ui/checkbox';
import VendorPOItemSelector from './VendorPOItemSelector';
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
import { getResendConfirmationKey, getSendRFQInvalidationKeys } from '@/lib/vendorPOInvalidation';

// Helper function to format numbers with commas
function formatNumber(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return '0.00';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Helper function to format currency with commas
function formatCurrency(value: number | undefined | null, decimals: number = 2): string {
  if (value === undefined || value === null) return '$0.00';
  return '$' + value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

type EmailRecipient = {
  name: string;
  email: string;
  type: 'primary' | 'additional' | 'contact';
};

function RecipientPickerList({
  recipients,
  selected,
  onChange,
  isLoading,
}: {
  recipients: EmailRecipient[];
  selected: string[];
  onChange: (emails: string[]) => void;
  isLoading: boolean;
}) {
  const toggle = (email: string) => {
    if (selected.includes(email)) {
      onChange(selected.filter((e) => e !== email));
    } else {
      onChange([...selected, email]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recipients…
      </div>
    );
  }

  if (recipients.length === 0) {
    return (
      <div className="py-2 text-sm text-muted-foreground italic">
        No additional contacts found for this vendor.
      </div>
    );
  }

  return (
    <div className="space-y-2 py-1">
      {recipients.map((r) => (
        <div
          key={r.email}
          className="flex items-start gap-3 p-2.5 border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors"
          onClick={() => toggle(r.email)}
        >
          <Checkbox
            id={`recipient-${r.email}`}
            checked={selected.includes(r.email)}
            onCheckedChange={() => toggle(r.email)}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{r.name}</div>
            <div className="text-xs text-muted-foreground truncate">{r.email}</div>
          </div>
          {r.type === 'primary' && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
              Primary
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Types based on our schema
type VendorPO = {
  id: number;
  poNumber: string | null;
  vendorId: number;
  vendorName?: string; // From join
  status:
    | 'Draft'
    | 'RFQ Sent'
    | 'Quote Received'
    | 'Declined'
    | 'Expired'
    | 'Sent'
    | 'Partially Received'
    | 'Fully Received'
    | 'Cancelled';
  expectedDeliveryDate?: string;
  shipVia?: string;
  notes?: string;
  totalCost: number;
  barcode: string;
  createdAt: string;
  updatedAt: string;
  // Revision tracking fields
  revisionNumber?: number;
  parentPoId?: number;
  changeReason?: string;
  isCurrentRevision?: boolean;
  revisedAt?: string;
  revisedBy?: string;
  // Internal issuance fields
  issuedWithoutEmail?: boolean;
  issuedWithoutEmailReason?: string | null;
  issuedWithoutEmailAt?: string | null;
  // External / legacy reference
  externalPoNumber?: string | null;
  // Receiving progress (aggregated from line items by the list endpoint)
  totalLines?: number;
  receivedLines?: number;
  // Vendor confirmation badge (augmented by the list endpoint, no extra per-row calls)
  // null = non-issued PO; 'no_link' = issued but no confirmation email ever sent
  confirmationBadge?: 'confirmed' | 'awaiting' | 'expired' | 'no_link' | null;
  // ISO timestamp of when the vendor clicked the confirmation link (only set when confirmationBadge === 'confirmed')
  confirmationUsedAt?: string | null;
  // ISO timestamp of when the confirmation link expires (set for 'awaiting' and 'expired' badges)
  confirmationExpiresAt?: string | null;
  // Archived flag
  archived?: boolean;
  // RFQ outcome notes (set when status is Declined or Expired)
  rfqOutcomeNotes?: string | null;
  // Compliance review status (augmented by list endpoint)
  complianceStatus?: 'Pending Review' | 'Reviewed' | 'Blocked' | 'Requires Attention';
};

type VendorPOItem = {
  id: number;
  vendorPoId: number;
  lineNumber: number;
  agPartNumber?: string;
  vendorPartNumber?: string;
  supplierPartNumber?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  uom?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  purchaseQty?: number;
  purchaseUnitPrice?: number;
  purchaseUnit?: string;
  vendorUnit?: string;
  conversionFactor?: number;
  historicalAvgPrice?: number | null;
  priceVariancePercent?: number | null;
  varianceFlag?: boolean | null;
};

type CreateVendorPOData = {
  vendorId: number;
  expectedDeliveryDate?: string;
  shipVia?: string;
  notes?: string;
  externalPoNumber?: string;
};

// Vendor PO line items display component
function VendorPOItemsDisplay({ vendorPoId }: { vendorPoId: number }) {
  const { data: items = [], isLoading } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`),
  });

  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (isLoading) {
    return <span className="text-gray-500">Loading...</span>;
  }

  if (items.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">No items added yet</div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 mb-2">
        <Package className="w-4 h-4 text-blue-600" />
        <span className="font-medium text-blue-600">
          {formatNumber(totalQuantity)} total qty
        </span>
      </div>
      <div className="space-y-1">
        {items.slice(0, 3).map((item) => (
          <div
            key={item.id}
            className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 overflow-hidden"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0 space-y-0.5 overflow-hidden">
                {item.agPartNumber && (
                  <div className="text-blue-600 font-medium truncate">
                    #{item.agPartNumber}
                  </div>
                )}
                <div className="font-medium text-gray-900 dark:text-gray-100 break-words line-clamp-2">
                  {item.description}
                </div>
                {item.supplierPartNumber && (
                  <div className="text-gray-500 text-xs truncate">
                    Supplier Part #: {item.supplierPartNumber}
                  </div>
                )}
                {/* Show purchase unit info if available */}
                {item.purchaseQty != null && item.purchaseQty > 0 && item.purchaseUnit && (
                  <div className="text-green-600 text-xs">
                    Ordered: {formatNumber(item.purchaseQty)} {item.purchaseUnit} @ {formatCurrency(item.purchaseUnitPrice, 4)}/{item.purchaseUnit}
                  </div>
                )}
                {item.varianceFlag && item.priceVariancePercent != null && (
                  <div className="text-orange-600 text-xs font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Price variance {item.priceVariancePercent > 0 ? '+' : ''}{item.priceVariancePercent.toFixed(1)}% vs historical avg
                  </div>
                )}
                {!item.varianceFlag && item.priceVariancePercent != null && (
                  <div className="text-gray-400 text-xs">
                    Variance {item.priceVariancePercent > 0 ? '+' : ''}{item.priceVariancePercent.toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="text-right ml-2 flex-shrink-0 whitespace-nowrap">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {formatNumber(item.quantity ?? 0)} {item.vendorUnit || item.uom || ''}
                </div>
                <div className="text-gray-500 text-xs">
                  $
                  {(item.unitPrice ?? 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  {item.vendorUnit ? `/${item.vendorUnit}` : 'ea'}
                </div>
              </div>
            </div>
          </div>
        ))}
        {items.length > 3 && (
          <div className="text-xs text-gray-500 italic">
            ...and {items.length - 3} more items
          </div>
        )}
      </div>
    </div>
  );
}

// Component to display calculated total cost from line items
function VendorPOTotalCost({ vendorPoId }: { vendorPoId: number }) {
  const { data: items = [], isLoading } = useQuery<VendorPOItem[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'items'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/items`),
  });

  const totalCost = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

  if (isLoading) {
    return <span className="text-gray-500">Calculating...</span>;
  }

  return (
    <>
      $
      {totalCost.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </>
  );
}

// Status color helper
function getStatusColor(status: VendorPO['status']) {
  switch (status) {
    case 'Draft':
      return 'bg-gray-100 text-gray-800';
    case 'RFQ Sent':
      return 'bg-orange-100 text-orange-800';
    case 'Quote Received':
      return 'bg-green-100 text-green-800';
    case 'Declined':
      return 'bg-red-100 text-red-800';
    case 'Expired':
      return 'bg-slate-100 text-slate-600';
    case 'Sent':
      return 'bg-blue-100 text-blue-800';
    case 'Partially Received':
      return 'bg-yellow-100 text-yellow-800';
    case 'Fully Received':
      return 'bg-emerald-100 text-emerald-800';
    case 'Cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function OptionalSettingsSelector({ vendorPoId }: { vendorPoId: number }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<number[]>([]);

  const { data: allSettings = [], isError: allSettingsError } = useQuery<any[]>({
    queryKey: ['/api/vendor-pos/optional-settings'],
    queryFn: () => apiRequest('/api/vendor-pos/optional-settings'),
  });

  const { data: currentSettings = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'optional-settings'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/optional-settings`),
  });

  useEffect(() => {
    if (!isLoading && !isError && currentSettings && !hasInitialized) {
      setSelectedIds(currentSettings.map((s: any) => s.id));
      setHasInitialized(true);
    }
  }, [isLoading, isError, currentSettings, hasInitialized]);

  const updateMutation = useMutation({
    mutationFn: async (optionalSettingIds: number[]) => {
      return await apiRequest(`/api/vendor-pos/${vendorPoId}/optional-settings`, {
        method: 'PUT',
        body: JSON.stringify({ optionalSettingIds }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'optional-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Optional statements updated');
    },
    onError: () => {
      toast.error('Failed to update optional statements');
    },
  });

  const openModal = () => {
    setDraftIds([...selectedIds]);
    setIsModalOpen(true);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    setDraftIds([...selectedIds]);
  };

  const handleSave = () => {
    setSelectedIds(draftIds);
    updateMutation.mutate(draftIds);
    setIsModalOpen(false);
  };

  const handleDraftToggle = (settingId: number) => {
    setDraftIds((prev) =>
      prev.includes(settingId)
        ? prev.filter((id) => id !== settingId)
        : [...prev, settingId]
    );
  };

  if (allSettingsError || isError) {
    return (
      <div className="text-sm text-red-600 py-2 flex items-center gap-2">
        Failed to load optional statements.
        {isError && (
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading statements...
      </div>
    );
  }

  if (allSettings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label>Optional Statements</Label>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openModal}
          data-testid="button-manage-statements"
        >
          Manage Statements
        </Button>
        {selectedIds.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedIds.length} statement{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Optional Statements</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-1">
            {allSettings.map((setting) => (
              <div
                key={setting.id}
                className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => handleDraftToggle(setting.id)}
                data-testid={`optional-setting-item-${setting.id}`}
              >
                <Checkbox
                  id={`modal-setting-${setting.id}`}
                  checked={draftIds.includes(setting.id)}
                  onCheckedChange={() => handleDraftToggle(setting.id)}
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`checkbox-optional-setting-${setting.id}`}
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={`modal-setting-${setting.id}`}
                    className="font-medium text-sm cursor-pointer"
                  >
                    {setting.name}
                  </label>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {setting.statement}
                  </p>
                </div>
                {draftIds.includes(setting.id) && (
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="pt-2 border-t">
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-muted-foreground">
                {draftIds.length > 0
                  ? `${draftIds.length} statement${draftIds.length !== 1 ? 's' : ''} selected`
                  : 'None selected'}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-statements"
                >
                  {updateMutation.isPending ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-1" />Saving...</>
                  ) : 'Save'}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Vendor PO Attachments component
function VendorPOAttachments({ vendorPoId }: { vendorPoId: number }) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClientLocal = useQueryClient();

  const { data: attachments = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/vendor-po-attachments/list', vendorPoId],
    queryFn: () => apiRequest(`/api/vendor-po-attachments/list/${vendorPoId}`),
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append('files', file));
      const response = await fetch(`/api/vendor-po-attachments/upload/${vendorPoId}`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      return response.json();
    },
    onSuccess: () => {
      queryClientLocal.invalidateQueries({ queryKey: ['/api/vendor-po-attachments/list', vendorPoId] });
      toast.success('Files uploaded successfully');
      setIsUploading(false);
    },
    onError: () => {
      toast.error('Failed to upload files');
      setIsUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      return apiRequest(`/api/vendor-po-attachments/delete/${attachmentId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClientLocal.invalidateQueries({ queryKey: ['/api/vendor-po-attachments/list', vendorPoId] });
      toast.success('Attachment deleted');
    },
    onError: () => toast.error('Failed to delete attachment'),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      uploadMutation.mutate(e.target.files);
    }
  };

  if (isLoading) return <div className="text-gray-500">Loading attachments...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple />
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading} data-testid="button-upload-attachment">
          {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          {isUploading ? 'Uploading...' : 'Upload Files'}
        </Button>
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-gray-500 italic">No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att: any) => (
            <div key={att.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 dark:bg-gray-800" data-testid={`attachment-item-${att.id}`}>
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <a href={`/api/vendor-po-attachments/download/${att.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">{att.originalFileName}</a>
                  <p className="text-xs text-gray-500">{(att.fileSize / 1024).toFixed(1)} KB - {format(new Date(att.createdAt), 'MMM dd, yyyy')}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(att.id)} className="text-red-600 hover:text-red-800" data-testid={`button-delete-attachment-${att.id}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Vendor PO card component
function VendorPOCard({
  vendorPo,
  onEdit,
  onDelete,
  onViewItems,
  onIssuePO,
  onCreateRevision,
  onViewPDF,
  onReviewCompliance,
}: {
  vendorPo: VendorPO;
  onEdit: (vendorPo: VendorPO) => void;
  onDelete: (id: number) => void;
  onViewItems: (vendorPo: VendorPO) => void;
  onIssuePO: (id: number, skipEmail?: boolean) => void;
  onCreateRevision: (vendorPo: VendorPO) => void;
  onViewPDF: (vendorPo: VendorPO) => void;
  onReviewCompliance?: (id: number) => void;
}) {
  // Check if PO is formally issued (cannot be directly edited) — RFQ Sent remains editable
  const isIssued = ['Sent', 'Partially Received', 'Fully Received'].includes(vendorPo.status);
  const [showAttachments, setShowAttachments] = useState(false);

  const { data: attachments = [] } = useQuery<any[]>({
    queryKey: ['/api/vendor-po-attachments/list', vendorPo.id],
    queryFn: () => apiRequest(`/api/vendor-po-attachments/list/${vendorPo.id}`),
    enabled: isIssued,
  });
  
  return (
    <Card
      className="hover:shadow-md transition-shadow"
      data-testid={`card-vendor-po-${vendorPo.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle
              className="text-lg"
              data-testid={`text-po-number-${vendorPo.id}`}
            >
              {vendorPo.poNumber || `Draft #${vendorPo.id}`}
            </CardTitle>
            {vendorPo.externalPoNumber && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Ref: {vendorPo.externalPoNumber}
              </div>
            )}
            <CardDescription
              className="mt-1"
              data-testid={`text-vendor-name-${vendorPo.id}`}
            >
              <div className="flex items-center gap-1">
                <Building2 className="w-4 h-4" />
                {vendorPo.vendorName || 'Unknown Vendor'}
              </div>
            </CardDescription>
            <div className="mt-3">
              <VendorPOItemsDisplay vendorPoId={vendorPo.id} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              className={getStatusColor(vendorPo.status)}
              data-testid={`status-${vendorPo.id}`}
            >
              {vendorPo.status}
            </Badge>
            {/* Show if this is not the current revision (superseded) */}
            {vendorPo.isCurrentRevision === false && (
              <Badge className="bg-gray-200 text-gray-600 text-xs" data-testid={`superseded-badge-${vendorPo.id}`}>
                Superseded
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="text-gray-500">Total Cost:</span>
            <p
              className="font-medium"
              data-testid={`text-total-cost-${vendorPo.id}`}
            >
              <VendorPOTotalCost vendorPoId={vendorPo.id} />
            </p>
          </div>
          {vendorPo.expectedDeliveryDate && (
            <div>
              <span className="text-gray-500">Requested Delivery Date:</span>
              <p
                className="font-medium"
                data-testid={`text-delivery-date-${vendorPo.id}`}
              >
                {format(
                  new Date(vendorPo.expectedDeliveryDate),
                  'MMM dd, yyyy'
                )}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {isIssued && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewItems(vendorPo)}
              data-testid={`button-view-items-${vendorPo.id}`}
            >
              <Eye className="w-4 h-4 mr-1" />
              View Items
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewPDF(vendorPo)}
            data-testid={`button-view-pdf-${vendorPo.id}`}
          >
            <FileText className="w-4 h-4 mr-1" />
            {vendorPo.poNumber ? 'View PO' : 'View RFQ'}
          </Button>
          {/* Show Edit button only for Draft POs */}
          {!isIssued && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(vendorPo)}
              data-testid={`button-edit-${vendorPo.id}`}
            >
              <Pencil className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
          {/* Compliance Review button for non-issued POs that haven't been reviewed */}
          {!isIssued && onReviewCompliance && vendorPo.complianceStatus !== 'Reviewed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReviewCompliance(vendorPo.id)}
              className="text-amber-700 hover:text-amber-900 border-amber-300 hover:border-amber-400"
              data-testid={`button-compliance-review-${vendorPo.id}`}
            >
              <Shield className="w-4 h-4 mr-1" />
              Compliance Review
            </Button>
          )}
          {/* Show Create Revision button for issued POs */}
          {isIssued && vendorPo.isCurrentRevision !== false && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCreateRevision(vendorPo)}
              className="text-purple-600 hover:text-purple-800 border-purple-300 hover:border-purple-400"
              data-testid={`button-create-revision-${vendorPo.id}`}
            >
              <Pencil className="w-4 h-4 mr-1" />
              Create Revision
            </Button>
          )}
          {/* Show Attach Docs button for issued POs */}
          {isIssued && (
            <Button
              variant={showAttachments ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowAttachments(prev => !prev)}
              data-testid={`button-attach-docs-${vendorPo.id}`}
            >
              <Paperclip className="w-4 h-4 mr-1" />
              Attach Docs{attachments.length > 0 && ` (${attachments.length})`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(vendorPo.id)}
            className="text-red-600 hover:text-red-800"
            data-testid={`button-delete-${vendorPo.id}`}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>

        {vendorPo.notes && (
          <div className="mt-3 pt-3 border-t">
            <span className="text-gray-500 text-xs">Notes:</span>
            <p
              className="text-sm text-gray-700 mt-1"
              data-testid={`text-notes-${vendorPo.id}`}
            >
              {vendorPo.notes}
            </p>
          </div>
        )}

        {isIssued && showAttachments && (
          <div className="mt-3 pt-3 border-t">
            <VendorPOAttachments vendorPoId={vendorPo.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Create/Edit form component
function VendorPOForm({
  vendorPo,
  isOpen,
  onClose,
  onSubmit,
  inline = false,
}: {
  vendorPo?: VendorPO;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateVendorPOData) => void;
  inline?: boolean;
}) {
  const [formData, setFormData] = useState<CreateVendorPOData>({
    vendorId: vendorPo?.vendorId || 0,
    expectedDeliveryDate: vendorPo?.expectedDeliveryDate || '',
    shipVia: vendorPo?.shipVia || '',
    notes: vendorPo?.notes || '',
    externalPoNumber: vendorPo?.externalPoNumber || '',
  });

  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(
    vendorPo?.expectedDeliveryDate
      ? new Date(vendorPo.expectedDeliveryDate)
      : undefined
  );

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Fetch vendors for the dropdown
  const { data: vendorsResponse } = useQuery<{ data: any[]; meta: any }>({
    queryKey: ['/api/vendors?pageSize=1000'],
  });
  const vendors = (vendorsResponse?.data || []).slice().sort((a: any, b: any) =>
    a.name.localeCompare(b.name)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.vendorId === 0) {
      toast.error('Please select a vendor');
      return;
    }

    onSubmit({
      ...formData,
      expectedDeliveryDate: deliveryDate
        ? deliveryDate.toISOString().split('T')[0]
        : undefined,
    });
  };

  const shipViaOptions = [
    'FedEx Ground',
    'FedEx Express',
    'UPS Ground',
    'UPS Next Day',
    'USPS',
    'Freight',
    'Will Call',
    'Prepaid & Add – Best Way',
    'Other',
  ];

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="vendorId">Vendor *</Label>
        <Select
          value={formData.vendorId.toString()}
          onValueChange={(value) =>
            setFormData({ ...formData, vendorId: parseInt(value) })
          }
          data-testid="select-vendor"
        >
          <SelectTrigger>
            <SelectValue placeholder="Select vendor..." />
          </SelectTrigger>
          <SelectContent>
            {(vendors || []).map((vendor: any) => (
              <SelectItem key={vendor.id} value={vendor.id.toString()}>
                {vendor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="expectedDeliveryDate">Requested Delivery Date</Label>
        <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                !deliveryDate && 'text-muted-foreground'
              )}
              data-testid="button-delivery-date"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {deliveryDate ? format(deliveryDate, 'PPP') : 'Select date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={deliveryDate}
              onSelect={(date) => {
                setDeliveryDate(date);
                setIsDatePickerOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <Label htmlFor="shipVia">Ship Via</Label>
        <Select
          value={formData.shipVia}
          onValueChange={(value) =>
            setFormData({ ...formData, shipVia: value })
          }
          data-testid="select-ship-via"
        >
          <SelectTrigger>
            <SelectValue placeholder="Select shipping method..." />
          </SelectTrigger>
          <SelectContent>
            {shipViaOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {vendorPo && (
        <OptionalSettingsSelector key={vendorPo.id} vendorPoId={vendorPo.id} />
      )}

      <div>
        <Label htmlFor="externalPoNumber">External / Legacy PO #</Label>
        <Input
          id="externalPoNumber"
          value={formData.externalPoNumber || ''}
          onChange={(e) => setFormData({ ...formData, externalPoNumber: e.target.value })}
          placeholder="Optional — previous ERP or vendor reference number"
          data-testid="input-external-po-number"
        />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes..."
          rows={3}
          data-testid="input-notes"
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" data-testid="button-submit">
          {vendorPo ? 'Update' : 'Create'} Purchase Order
        </Button>
        {!inline && (
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );

  if (inline) {
    return formContent;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle data-testid="dialog-title">
            {vendorPo
              ? 'Edit Vendor Purchase Order'
              : 'Create New Vendor Purchase Order'}
          </DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

// Small self-contained badge that opens a resend popover for 'awaiting' and 'expired' states
export function ConfirmationBadgeResend({ vendorPo }: { vendorPo: VendorPO }) {
  const [open, setOpen] = useState(false);

  const { data: confirmationInfo } = useQuery<{
    found: boolean;
    email?: string;
    expiresAt?: string;
    usedAt?: string | null;
  }>({
    queryKey: ['/api/vendor-pos', vendorPo.id, 'confirmation'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPo.id}/confirmation`),
    enabled: open,
    staleTime: 30_000,
  });

  const resendMutation = useMutation<
    { message?: string; emailSent: boolean; emailRecipient: string },
    Error
  >({
    mutationFn: () =>
      apiRequest(`/api/vendor-pos/${vendorPo.id}/resend`, { method: 'POST' }),
    onSuccess: (data) => {
      toast.success(data?.message ?? 'Confirmation email resent successfully.');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPo.id, 'confirmation'] });
    },
    onError: (err) => {
      toast.error(err?.message ?? 'Failed to resend confirmation email.');
    },
  });

  const isAwaiting = vendorPo.confirmationBadge === 'awaiting';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium cursor-pointer hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded',
            isAwaiting
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400'
          )}
        >
          {isAwaiting ? (
            <>
              <Clock className="w-3.5 h-3.5" />
              Awaiting
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              Link Expired
            </>
          )}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {isAwaiting ? 'Awaiting vendor confirmation' : 'Confirmation link expired'}
          </p>
          {confirmationInfo?.found && confirmationInfo.email ? (
            <p className="text-xs text-muted-foreground">
              Last link sent to{' '}
              <span className="font-medium text-foreground">{confirmationInfo.email}</span>
              .
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Resend the confirmation link to{' '}
              <span className="font-medium">{vendorPo.vendorName ?? 'the vendor'}</span>
              .
            </p>
          )}
          <Button
            size="sm"
            className="w-full"
            disabled={resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
          >
            {resendMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Resending…
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Resend Confirmation
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Vendor Confirmation card content ──────────────────────────────────────────
// Exported so automated tests can render it in isolation without needing the
// entire VendorPOManager context.

export type ConfirmationStatus = {
  found: boolean;
  email?: string;
  usedAt?: string | null;
  expiresAt?: string | null;
};

export interface VendorConfirmationCardContentProps {
  isLoading: boolean;
  confirmationStatus: ConfirmationStatus | undefined | null;
  isPending: boolean;
  onResend: () => void;
}

export function VendorConfirmationCardContent({
  isLoading,
  confirmationStatus,
  isPending,
  onResend,
  confirmationUsedAt,
}: VendorConfirmationCardContentProps & { confirmationUsedAt?: string | null }) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading confirmation status…
      </div>
    );
  }

  if (!confirmationStatus || !confirmationStatus.found) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground italic">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No confirmation link on record for this PO.
        </div>
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onResend}
            disabled={isPending}
            data-testid="button-send-confirmation-link"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
            {isPending ? 'Sending…' : 'Send Confirmation Link'}
          </Button>
        </div>
      </div>
    );
  }

  if (confirmationStatus.usedAt) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Confirmed
        </div>
        <div className="text-sm text-muted-foreground">
          {(() => {
            const usedAt = confirmationUsedAt || confirmationStatus.usedAt;
            const d = new Date(usedAt!);
            const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return <>Confirmed on{' '}<span className="font-medium text-foreground">{datePart} at {timePart}</span></>;
          })()}
        </div>
        <div className="text-sm text-muted-foreground">
          Link sent to{' '}
          <span className="font-medium text-foreground">
            {confirmationStatus.email}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Awaiting confirmation
      </div>
      <div className="text-sm text-muted-foreground">
        Link sent to{' '}
        <span className="font-medium text-foreground">
          {confirmationStatus.email}
        </span>
      </div>
      {confirmationStatus.expiresAt && (
        <div className="text-sm text-muted-foreground">
          Link expires{' '}
          <span
            className={`font-medium ${
              new Date(confirmationStatus.expiresAt) < new Date()
                ? 'text-red-600 dark:text-red-400'
                : 'text-foreground'
            }`}
          >
            {new Date(confirmationStatus.expiresAt) < new Date()
              ? `expired on ${new Date(confirmationStatus.expiresAt).toLocaleString()}`
              : new Date(confirmationStatus.expiresAt).toLocaleString()}
          </span>
        </div>
      )}
      <div className="pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onResend}
          disabled={isPending}
          data-testid="button-resend-confirmation-link"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
          {isPending ? 'Resending…' : 'Resend Link'}
        </Button>
      </div>
    </div>
  );
}

function NoLinkBadgeSend({ vendorPo }: { vendorPo: VendorPO }) {
  const [open, setOpen] = useState(false);

  const sendMutation = useMutation<
    { message?: string; emailSent: boolean; emailRecipient: string },
    Error
  >({
    mutationFn: () =>
      apiRequest(`/api/vendor-pos/${vendorPo.id}/resend`, { method: 'POST' }),
    onSuccess: (data) => {
      toast.success(data?.message ?? 'Confirmation email sent successfully.');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
    },
    onError: (err) => {
      toast.error(err?.message ?? 'Failed to send confirmation email.');
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground cursor-pointer hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        >
          <XCircle className="w-3.5 h-3.5" />
          No Link
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <p className="text-sm font-medium">No confirmation sent yet</p>
          <p className="text-xs text-muted-foreground">
            Send the first confirmation link to{' '}
            <span className="font-medium text-foreground">
              {vendorPo.vendorName ?? 'the vendor'}
            </span>
            .
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Send Confirmation
              </>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Receipt history types ──────────────────────────────────────────────────────

type ReceiptSummary = {
  id: number;
  receiptNumber: string;
  receiptDate: string;
  receivedAt?: string | null;
  receiverDisplayName?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  packingSlipNumber?: string | null;
  conditionOnArrival?: string | null;
  status: string;
  notes?: string | null;
  vendorPoId?: number | null;
};

type ReceiptLineDetail = {
  id: number;
  agPartNumber?: string | null;
  description?: string | null;
  orderedQty?: string | null;
  receivedQty: string;
  uom?: string | null;
  isPartial?: boolean | null;
  isOver?: boolean | null;
};

type ReceiptDetail = ReceiptSummary & {
  lines: ReceiptLineDetail[];
};

function conditionLabel(condition: string | null | undefined): string {
  switch (condition) {
    case 'good': return 'Good';
    case 'damaged': return 'Damaged';
    case 'partial': return 'Partial';
    case 'refused': return 'Refused';
    default: return condition ?? '—';
  }
}

function conditionBadgeClass(condition: string | null | undefined): string {
  switch (condition) {
    case 'good': return 'bg-green-100 text-green-800';
    case 'damaged': return 'bg-red-100 text-red-800';
    case 'partial': return 'bg-yellow-100 text-yellow-800';
    case 'refused': return 'bg-red-200 text-red-900';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function receiptStatusBadgeClass(status: string): string {
  switch (status) {
    case 'complete': return 'bg-emerald-100 text-emerald-800';
    case 'in_progress': return 'bg-blue-100 text-blue-800';
    case 'cancelled': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function receiptStatusLabel(status: string): string {
  switch (status) {
    case 'complete': return 'Complete';
    case 'in_progress': return 'In Progress';
    case 'cancelled': return 'Cancelled';
    default: return status;
  }
}

// A single expandable receipt card
function ReceiptCard({ receipt }: { receipt: ReceiptSummary }) {
  const [expanded, setExpanded] = useState(false);

  const { data: detail, isLoading: isLoadingDetail } = useQuery<ReceiptDetail>({
    queryKey: ['/api/receipts', receipt.id],
    queryFn: () => apiRequest(`/api/receipts/${receipt.id}`),
    enabled: expanded,
  });

  const dateStr = (() => {
    const src = receipt.receivedAt ?? receipt.receiptDate;
    if (!src) return '—';
    const d = new Date(src);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  })();

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5 text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{receipt.receiptNumber}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', receiptStatusBadgeClass(receipt.status))}>
              {receiptStatusLabel(receipt.status)}
            </span>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">{dateStr}</div>
          {receipt.receiverDisplayName && (
            <div className="text-sm text-muted-foreground col-span-full sm:col-span-1">
              Received by: <span className="text-foreground font-medium">{receipt.receiverDisplayName}</span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 col-span-full sm:col-span-1 sm:justify-end">
            {receipt.carrier && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {receipt.carrier}
              </span>
            )}
            {receipt.packingSlipNumber && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ClipboardList className="h-3 w-3" />
                Slip: {receipt.packingSlipNumber}
              </span>
            )}
            {receipt.conditionOnArrival && (
              <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', conditionBadgeClass(receipt.conditionOnArrival))}>
                {conditionLabel(receipt.conditionOnArrival)}
              </span>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 bg-muted/20">
          {isLoadingDetail ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : detail?.lines && detail.lines.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-1.5 pr-4 font-medium">Part #</th>
                  <th className="text-left py-1.5 pr-4 font-medium">Description</th>
                  <th className="text-right py-1.5 pr-2 font-medium">Ordered</th>
                  <th className="text-right py-1.5 font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.id} className="border-b last:border-0">
                    <td className="py-1.5 pr-4 font-mono text-xs">{line.agPartNumber ?? '—'}</td>
                    <td className="py-1.5 pr-4 text-muted-foreground">{line.description ?? '—'}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                      {line.orderedQty != null ? `${line.orderedQty} ${line.uom ?? ''}`.trim() : '—'}
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      <span className={cn(
                        'font-medium',
                        line.isOver ? 'text-orange-600' : line.isPartial ? 'text-yellow-600' : 'text-green-700'
                      )}>
                        {line.receivedQty} {line.uom ?? ''}
                      </span>
                      {line.isOver && <span className="ml-1 text-xs text-orange-500">(over)</span>}
                      {line.isPartial && !line.isOver && <span className="ml-1 text-xs text-yellow-500">(partial)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground italic">No line items recorded for this receipt.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Receipts tab content for a given PO
function ReceiptHistoryTab({ vendorPoId }: { vendorPoId: number }) {
  const { data: receipts = [], isLoading } = useQuery<ReceiptSummary[]>({
    queryKey: ['/api/receipts', { vendorPoId }],
    queryFn: () => apiRequest(`/api/receipts?vendorPoId=${vendorPoId}`),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (receipts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground italic">No receipts recorded for this PO yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipt History</CardTitle>
        <CardDescription>
          All material receipts recorded against this purchase order
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {receipts.map((r) => (
          <ReceiptCard key={r.id} receipt={r} />
        ))}
      </CardContent>
    </Card>
  );
}

// Compliance Summary Card — shows all compliance fields at a glance in the PO detail view
function ComplianceSummaryCard({
  vendorPoId,
  onOpenModal,
}: {
  vendorPoId: number;
  onOpenModal: () => void;
}) {
  const { data: review, isLoading } = useQuery<ComplianceReviewData>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'compliance-review'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/compliance-review`),
  });

  const BoolField = ({ label, value }: { label: string; value: boolean }) => (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${value ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {value ? 'Yes' : 'No'}
      </span>
    </div>
  );

  const status = review?.reviewStatus ?? 'pending';
  const isPending = !review || status === 'pending';
  const isRequiresAttention = status === 'requires_attention';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Procurement Compliance Summary</CardTitle>
          </div>
          <ComplianceBadge status={
            status === 'reviewed' ? 'Reviewed'
              : status === 'blocked' ? 'Blocked'
              : status === 'requires_attention' ? 'Requires Attention'
              : 'Pending Review'
          } />
        </div>
        {isRequiresAttention && (
          <div className="mt-2 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This PO changed after compliance review. Re-review is required before issue.</span>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : isPending ? (
          <div className="text-center py-4 space-y-3">
            <p className="text-sm text-muted-foreground">No compliance review has been completed for this PO.</p>
            <Button size="sm" onClick={onOpenModal}>
              <Shield className="w-4 h-4 mr-2" />
              Complete Compliance Review
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-0">
              <BoolField label="Government Contract" value={review!.governmentContract} />
              <BoolField label="FAR/DFARS Required" value={review!.farRequired} />
              <BoolField label="DPAS Required" value={review!.dpasRequired} />
              <BoolField label="COC Required" value={review!.cocRequired} />
              <BoolField label="MTR Required" value={review!.mtrRequired} />
              <BoolField label="Source Inspection Required" value={review!.sourceInspectionRequired} />
              <BoolField label="Second-Party Approval Complete" value={review!.secondPartyComplete} />
              <BoolField label="Vendor Approved" value={review!.vendorApproved} />
            </div>
            {review!.reviewNotes && (
              <div className="pt-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Compliance Notes</p>
                <p className="text-sm">{review!.reviewNotes}</p>
              </div>
            )}
            <div className="pt-1 text-xs text-muted-foreground space-y-0.5">
              {review!.reviewedByDisplayName && (
                <p>Reviewed by: <span className="font-medium text-foreground">{review!.reviewedByDisplayName}</span></p>
              )}
              {review!.reviewedAt && (
                <p>Reviewed at: <span className="font-medium text-foreground">{new Date(review!.reviewedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></p>
              )}
            </div>
            <div className="pt-2">
              <Button size="sm" variant={isRequiresAttention ? 'default' : 'outline'} onClick={onOpenModal}>
                <ShieldCheck className="w-4 h-4 mr-2" />
                {isRequiresAttention ? 'Reopen Compliance Review' : 'Update Compliance Review'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Compliance status badge helper
function ComplianceBadge({ status, onClick }: { status?: string; onClick?: () => void }) {
  const isActionable = onClick && (!status || status === 'Pending Review' || status === 'Requires Attention');
  const baseClick = isActionable ? onClick : undefined;
  const hoverClass = isActionable ? 'cursor-pointer hover:opacity-80 active:opacity-60' : '';

  if (!status || status === 'Pending Review') {
    return (
      <span onClick={baseClick} className={`inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full ${hoverClass}`} title={isActionable ? 'Click to start compliance review' : undefined}>
        <Shield className="w-3 h-3" />
        Pending Review
      </span>
    );
  }
  if (status === 'Reviewed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
        <ShieldCheck className="w-3 h-3" />
        Reviewed
      </span>
    );
  }
  if (status === 'Blocked') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
        <ShieldX className="w-3 h-3" />
        Blocked
      </span>
    );
  }
  return (
    <span onClick={baseClick} className={`inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full ${hoverClass}`} title={isActionable ? 'Click to re-do compliance review' : undefined}>
      <ShieldAlert className="w-3 h-3" />
      Requires Attention
    </span>
  );
}

type OptionalSetting = {
  id: number;
  name: string;
  statement: string;
};

type ComplianceReviewData = {
  governmentContract: boolean;
  farRequired: boolean;
  dpasRequired: boolean;
  cocRequired: boolean;
  mtrRequired: boolean;
  sourceInspectionRequired: boolean;
  secondPartyComplete: boolean;
  vendorApproved: boolean;
  reviewNotes: string;
  reviewStatus: string;
  reviewedByDisplayName?: string | null;
  reviewedAt?: string | null;
  blockingReasons?: string[];
};

type ComplianceSaveResult = ComplianceReviewData & {
  blockingReasons: string[];
};

function ComplianceReviewModal({
  vendorPoId,
  isOpen,
  onClose,
  onComplianceApproved,
  allOptionalSettings,
  currentOptionalSettingIds,
  onAutoSelectOptionals,
}: {
  vendorPoId: number;
  isOpen: boolean;
  onClose: () => void;
  onComplianceApproved: () => void;
  allOptionalSettings: OptionalSetting[];
  currentOptionalSettingIds: number[];
  onAutoSelectOptionals: (ids: number[]) => Promise<void>;
}) {
  const [form, setForm] = useState<ComplianceReviewData>({
    governmentContract: false,
    farRequired: false,
    dpasRequired: false,
    cocRequired: false,
    mtrRequired: false,
    sourceInspectionRequired: false,
    secondPartyComplete: false,
    vendorApproved: false,
    reviewNotes: '',
    reviewStatus: 'reviewed',
  });
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [blockingReasons, setBlockingReasons] = useState<string[]>([]);

  const { data: existingReview, isLoading: isLoadingReview } = useQuery<ComplianceReviewData>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'compliance-review'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/compliance-review`),
    enabled: isOpen && !!vendorPoId,
  });

  useEffect(() => {
    if (existingReview && isOpen) {
      setForm({
        governmentContract: existingReview.governmentContract ?? false,
        farRequired: existingReview.farRequired ?? false,
        dpasRequired: existingReview.dpasRequired ?? false,
        cocRequired: existingReview.cocRequired ?? false,
        mtrRequired: existingReview.mtrRequired ?? false,
        sourceInspectionRequired: existingReview.sourceInspectionRequired ?? false,
        secondPartyComplete: existingReview.secondPartyComplete ?? false,
        vendorApproved: existingReview.vendorApproved ?? false,
        reviewNotes: existingReview.reviewNotes ?? '',
        reviewStatus: existingReview.reviewStatus ?? 'reviewed',
      });
      setBlockingReasons(existingReview.blockingReasons ?? []);
    }
  }, [existingReview, isOpen]);

  const saveMutation = useMutation<ComplianceSaveResult, Error, ComplianceReviewData>({
    mutationFn: (data: ComplianceReviewData) =>
      apiRequest(`/api/vendor-pos/${vendorPoId}/compliance-review`, {
        method: 'PUT',
        body: JSON.stringify({ ...data, reviewStatus: 'reviewed' }),
      }) as Promise<ComplianceSaveResult>,
    onSuccess: async (saved: ComplianceSaveResult) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'compliance-review'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });

      // If the saved review is blocked, record it for audit trail but do NOT proceed to issue
      if (saved.reviewStatus === 'blocked' || saved.blockingReasons.length > 0) {
        setBlockingReasons(saved.blockingReasons);
        toast.error(
          'Compliance review saved (blocked). Resolve the issues below before issuing the PO.'
        );
        return; // modal stays open so user can fix issues
      }

      // Review is approved — auto-select optional statements based on compliance flags
      const autoSelectIds = [...currentOptionalSettingIds];
      const toastLines: string[] = [];

      const findOptionalByKeyword = (keyword: string): OptionalSetting | undefined =>
        allOptionalSettings.find(
          (s) =>
            s.name?.toLowerCase().includes(keyword.toLowerCase()) ||
            s.statement?.toLowerCase().includes(keyword.toLowerCase())
        );

      const autoSelect = (flag: boolean, keyword: string, label: string) => {
        if (!flag) return;
        const match = findOptionalByKeyword(keyword);
        if (match && !autoSelectIds.includes(match.id)) {
          autoSelectIds.push(match.id);
          toastLines.push(label);
        }
      };

      autoSelect(saved.farRequired, 'FAR', 'FAR/DFARS');
      autoSelect(saved.dpasRequired, 'DPAS', 'DPAS');
      autoSelect(saved.cocRequired, 'CoC', 'Certificate of Conformance');
      autoSelect(saved.mtrRequired, 'MTR', 'Material Test Report');

      if (toastLines.length > 0) {
        // Await auto-selection before proceeding so optional settings are committed
        // before the issue flow begins (prevents race condition on PO issue).
        await onAutoSelectOptionals(autoSelectIds);
        toast.success(`Auto-selected optional statements: ${toastLines.join(', ')}`);
      }

      toast.success('Compliance review approved. Proceeding to issue PO.');
      onComplianceApproved();
      onClose();
    },
    onError: (error: Error) => {
      toast.error(error?.message || 'Failed to save compliance review');
    },
  });

  const handleBooleanField = (field: keyof ComplianceReviewData, value: boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setValidationErrors([]);
  };

  const handleSave = () => {
    const errors: string[] = [];
    if (!form.reviewNotes.trim()) errors.push('Justification is required');
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);
    saveMutation.mutate(form);
  };

  const BooleanToggle = ({
    label,
    field,
    trueLabel = 'Yes',
    falseLabel = 'No',
    trueDescription,
  }: {
    label: string;
    field: keyof ComplianceReviewData;
    trueLabel?: string;
    falseLabel?: string;
    trueDescription?: string;
  }) => {
    const value = form[field] as boolean;
    return (
      <div className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</div>
          {trueDescription && value && (
            <div className="text-xs text-blue-600 mt-0.5">{trueDescription}</div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleBooleanField(field, true)}
            className={cn(
              'px-3 py-1 text-xs rounded-l-md border font-medium transition-colors',
              value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
            )}
          >
            {trueLabel}
          </button>
          <button
            type="button"
            onClick={() => handleBooleanField(field, false)}
            className={cn(
              'px-3 py-1 text-xs rounded-r-md border-t border-r border-b font-medium transition-colors',
              !value
                ? 'bg-gray-600 text-white border-gray-600'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
            )}
          >
            {falseLabel}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Compliance Review — Required Before Issue
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Complete all 8 compliance questions and provide a justification. PO cannot be issued
            if second-party approval or vendor approval is missing.
          </p>
        </DialogHeader>

        {isLoadingReview ? (
          <div className="flex items-center gap-2 py-8 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading existing review...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <div className="rounded-lg border p-3 space-y-1">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contract & Regulatory</h4>
              <BooleanToggle
                label="Government contract applies to this PO"
                field="governmentContract"
              />
              <BooleanToggle
                label="FAR/DFARS flowdown required"
                field="farRequired"
                trueLabel="Required"
                falseLabel="Not Required"
                trueDescription="FAR/DFARS optional statement will be auto-selected"
              />
              <BooleanToggle
                label="DPAS rating required"
                field="dpasRequired"
                trueLabel="Required"
                falseLabel="Not Required"
                trueDescription="DPAS optional statement will be auto-selected"
              />
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quality & Certification</h4>
              <BooleanToggle
                label="Certificate of Conformance (CoC) required"
                field="cocRequired"
                trueLabel="Required"
                falseLabel="Not Required"
                trueDescription="CoC optional statement will be auto-selected"
              />
              <BooleanToggle
                label="Material Test Report (MTR) required"
                field="mtrRequired"
                trueLabel="Required"
                falseLabel="Not Required"
                trueDescription="MTR optional statement will be auto-selected"
              />
              <BooleanToggle
                label="Source inspection required"
                field="sourceInspectionRequired"
              />
            </div>

            <div className="rounded-lg border p-3 space-y-1">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approval Gates</h4>
              <BooleanToggle
                label="Second-party approval complete"
                field="secondPartyComplete"
                trueLabel="Complete"
                falseLabel="Not Complete"
              />
              <BooleanToggle
                label="Vendor is approved for this purchase"
                field="vendorApproved"
                trueLabel="Approved"
                falseLabel="Not Approved"
              />
            </div>

            {/* Blocking warnings */}
            {(!form.secondPartyComplete || !form.vendorApproved) && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-3">
                <div className="flex items-start gap-2">
                  <ShieldX className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-red-700 dark:text-red-400">PO cannot be issued</div>
                    <ul className="mt-1 text-xs text-red-600 dark:text-red-400 space-y-0.5">
                      {!form.secondPartyComplete && <li>• Second-party approval is not complete</li>}
                      {!form.vendorApproved && <li>• Vendor is not approved</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Saved blocking reasons from previous save attempt */}
            {blockingReasons.length > 0 && form.secondPartyComplete && form.vendorApproved && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                    {blockingReasons.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {/* Justification */}
            <div className="space-y-1.5">
              <Label htmlFor="review-notes" className="text-sm font-medium">
                Compliance Justification <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="review-notes"
                placeholder="Describe the compliance rationale for this purchase (required)..."
                value={form.reviewNotes}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, reviewNotes: e.target.value }));
                  setValidationErrors([]);
                }}
                className="min-h-[80px] text-sm"
              />
              {validationErrors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">{err}</p>
              ))}
            </div>

            {existingReview?.reviewedByDisplayName && existingReview?.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                Last reviewed by {existingReview.reviewedByDisplayName} on{' '}
                {new Date(existingReview.reviewedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending || isLoadingReview}
            className={(!form.secondPartyComplete || !form.vendorApproved)
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-blue-600 hover:bg-blue-700'}
          >
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (!form.secondPartyComplete || !form.vendorApproved) ? (
              <><ShieldAlert className="w-4 h-4 mr-2" />Save Blocked Review</>
            ) : (
              <><ShieldCheck className="w-4 h-4 mr-2" />Save Review & Issue PO</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main component
export default function VendorPOManager({ preSelectedPoId }: { preSelectedPoId?: number } = {}) {
  const [selectedVendorPO, setSelectedVendorPO] = useState<VendorPO | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  // Task #83: Purchasing Controls modal
  const [purchasingControlsOpen, setPurchasingControlsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [listTab, setListTab] = useState<'active' | 'closed' | 'archived'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('any');
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>('');
  const [noEmailMode, setNoEmailMode] = useState(false);
  const [noEmailReason, setNoEmailReason] = useState('');
  const [noEmailConfirmed, setNoEmailConfirmed] = useState(false);
  const [showRfqOutcomeDialog, setShowRfqOutcomeDialog] = useState(false);
  const [pendingRfqStatus, setPendingRfqStatus] = useState<'Declined' | 'Expired' | null>(null);
  const [rfqOutcomeNote, setRfqOutcomeNote] = useState('');

  // Recipient picker state (shared across Issue / RFQ / Resend dialogs)
  const [dialogRecipients, setDialogRecipients] = useState<EmailRecipient[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [isLoadingRecipients, setIsLoadingRecipients] = useState(false);

  // RFQ confirmation dialog state
  const [showRFQDialog, setShowRFQDialog] = useState(false);

  // Resend confirmation dialog state
  const [showResendDialog, setShowResendDialog] = useState(false);

  // Revision dialog state
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionPO, setRevisionPO] = useState<VendorPO | null>(null);

  // Compliance review modal state
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [compliancePoId, setCompliancePoId] = useState<number | null>(null);
  // Track current optional setting IDs for the PO being compliance-reviewed
  const [compliancePoOptionalIds, setCompliancePoOptionalIds] = useState<number[]>([]);

  const queryClient = useQueryClient();

  // Fetch all optional settings (needed for compliance auto-selection)
  const { data: allOptionalSettings = [] } = useQuery<OptionalSetting[]>({
    queryKey: ['/api/vendor-pos/optional-settings'],
    queryFn: () => apiRequest('/api/vendor-pos/optional-settings') as Promise<OptionalSetting[]>,
  });

  // Fetch vendor POs — archived param changes based on the selected tab
  const archivedQueryParam = listTab === 'archived' ? 'true' : 'false';
  const {
    data: vendorPOsResponse,
    isLoading,
    error,
  } = useQuery<{ data: VendorPO[]; meta?: any }>({
    queryKey: ['/api/vendor-pos', { archived: archivedQueryParam }],
    queryFn: () => apiRequest(`/api/vendor-pos?archived=${archivedQueryParam}`),
  });

  const vendorPOs = vendorPOsResponse?.data || [];

  // Fetch tab counts for Active / Closed / Archived badges.
  // Key is nested under '/api/vendor-pos' so existing broad invalidations refresh it automatically.
  const { data: tabCounts } = useQuery<{ active: number; closed: number; archived: number }>({
    queryKey: ['/api/vendor-pos', 'counts'],
    queryFn: () => apiRequest('/api/vendor-pos/counts'),
    staleTime: 30_000,
  });

  // Fetch the selected PO's detail directly so progress counts stay accurate
  // even if the list omits those fields or hasn't loaded yet.
  const { data: selectedVendorPODetail } = useQuery<VendorPO>({
    queryKey: ['/api/vendor-pos', selectedVendorPO?.id],
    queryFn: () => apiRequest(`/api/vendor-pos/${selectedVendorPO!.id}`),
    enabled: !!selectedVendorPO,
  });

  const issuedStatuses = ['Sent', 'Partially Received', 'Fully Received'];
  const { data: confirmationStatus, isLoading: isConfirmationLoading } = useQuery<{
    found: boolean;
    email?: string;
    expiresAt?: string;
    usedAt?: string | null;
  }>({
    queryKey: ['/api/vendor-pos', selectedVendorPO?.id, 'confirmation'],
    queryFn: () => apiRequest(`/api/vendor-pos/${selectedVendorPO!.id}/confirmation`),
    enabled: !!selectedVendorPO && issuedStatuses.includes(selectedVendorPO.status),
  });

  // Merge per-PO detail (totalLines / receivedLines / status) into selected state
  // whenever the dedicated query returns fresher data.
  useEffect(() => {
    if (!selectedVendorPODetail || !selectedVendorPO) return;
    if (
      selectedVendorPODetail.totalLines !== selectedVendorPO.totalLines ||
      selectedVendorPODetail.receivedLines !== selectedVendorPO.receivedLines ||
      selectedVendorPODetail.status !== selectedVendorPO.status
    ) {
      setSelectedVendorPO((prev) =>
        prev ? { ...prev, ...selectedVendorPODetail } : prev
      );
    }
  }, [selectedVendorPODetail]);

  // Auto-select and open a PO when navigated here with ?poId=X
  const [preSelectApplied, setPreSelectApplied] = useState(false);
  useEffect(() => {
    if (!preSelectedPoId || preSelectApplied || vendorPOs.length === 0) return;
    const match = vendorPOs.find((po) => po.id === preSelectedPoId);
    if (match) {
      setSelectedVendorPO(match);
      setShowDetailView(true);
      setPreSelectApplied(true);
    }
  }, [preSelectedPoId, vendorPOs, preSelectApplied]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateVendorPOData) =>
      apiRequest('/api/vendor-pos', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Vendor purchase order created successfully');
      setShowForm(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create vendor purchase order');
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Partial<CreateVendorPOData>;
    }) =>
      apiRequest(`/api/vendor-pos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Vendor purchase order updated successfully');
      setShowForm(false);
      setSelectedVendorPO(null);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update vendor purchase order');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/vendor-pos/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Vendor purchase order deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete vendor purchase order');
    },
  });

  // Status change mutation
  const changeStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest(`/api/vendor-pos/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Status updated successfully');
      setShowStatusChangeDialog(false);
      setPendingStatus('');
      // Update the selected PO status
      if (selectedVendorPO) {
        setSelectedVendorPO({ ...selectedVendorPO, status: pendingStatus as any });
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update status');
    },
  });

  // Create revision mutation
  const createRevisionMutation = useMutation({
    mutationFn: ({ id, changeReason }: { id: number; changeReason: string }) =>
      apiRequest(`/api/vendor-pos/${id}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ changeReason }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success(`Revision created${data.poNumber ? `: ${data.poNumber}` : ''}. You can now edit the new draft.`);
      setShowRevisionDialog(false);
      setRevisionReason('');
      setRevisionPO(null);
      // Open the new revision for editing
      if (data) {
        setSelectedVendorPO(data);
        setShowDetailView(true);
        setActiveTab('items');
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create revision');
    },
  });

  // Issue PO mutation - sends confirmation email to vendor
  const issuePOMutation = useMutation({
    mutationFn: ({ id, skipEmail = false, reason, recipients }: { id: number; skipEmail?: boolean; reason?: string; recipients?: string[] }) =>
      apiRequest(`/api/vendor-pos/${id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ skipEmail, reason, recipients }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      if (data.emailSent === false) {
        toast.success('PO issued internally (vendor not notified)');
      } else if (data.emailSent) {
        toast.success(`PO issued! Email sent to ${data.emailRecipient}`);
      } else {
        toast.error(data.message || 'PO issued but email failed to send');
      }
      if (selectedVendorPO) {
        setSelectedVendorPO({
          ...selectedVendorPO,
          status: 'Sent',
          poNumber: data.po_number || data.poNumber || selectedVendorPO.poNumber,
          issuedWithoutEmail: data.issuedWithoutEmail ?? false,
          issuedWithoutEmailReason: data.issuedWithoutEmailReason ?? null,
          issuedWithoutEmailAt: data.issuedWithoutEmailAt ?? null,
        });
      }
      setNoEmailMode(false);
      setNoEmailReason('');
      setNoEmailConfirmed(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to issue PO');
    },
  });

  // Send RFQ mutation - sends quote request email to vendor
  const sendRFQMutation = useMutation({
    mutationFn: ({ id, recipients }: { id: number; recipients: string[] }) =>
      apiRequest(`/api/vendor-pos/${id}/send-rfq`, {
        method: 'POST',
        body: JSON.stringify({ recipients }),
      }),
    onSuccess: (data: any, variables) => {
      getSendRFQInvalidationKeys(variables.id).forEach((key) =>
        queryClient.invalidateQueries({ queryKey: key }),
      );
      if (data.emailSent) {
        toast.success(`RFQ sent to ${data.emailRecipient}`);
      } else {
        toast.error(data.message || 'Failed to send RFQ');
      }
      if (selectedVendorPO) {
        setSelectedVendorPO({ ...selectedVendorPO, status: 'RFQ Sent' });
      }
      setShowRFQDialog(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to send RFQ');
    },
  });

  const resendPOMutation = useMutation({
    mutationFn: ({ id, recipients }: { id: number; recipients: string[] }) =>
      apiRequest(`/api/vendor-pos/${id}/resend`, {
        method: 'POST',
        body: JSON.stringify({ recipients }),
      }),
    onSuccess: (data: any, variables) => {
      queryClient.invalidateQueries({ queryKey: getResendConfirmationKey(variables.id) });
      if (data.emailSent) {
        toast.success(`PO resent! Confirmation email sent to ${data.emailRecipient}`);
      } else {
        toast.error(data.message || 'Failed to resend PO');
      }
      setShowResendDialog(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to resend PO');
    },
  });

  // RFQ lifecycle transition mutation (Quote Received / Declined / Expired)
  const rfqTransitionMutation = useMutation({
    mutationFn: ({ id, status, rfqOutcomeNotes }: { id: number; status: 'Quote Received' | 'Declined' | 'Expired'; rfqOutcomeNotes?: string }) =>
      apiRequest(`/api/vendor-pos/${id}/rfq-transition`, {
        method: 'POST',
        body: JSON.stringify({ status, rfqOutcomeNotes }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success(`RFQ marked as ${data.status}`);
      if (selectedVendorPO) {
        setSelectedVendorPO({ ...selectedVendorPO, status: data.status, rfqOutcomeNotes: data.rfqOutcomeNotes ?? null });
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update RFQ status');
    },
  });

  // Archive / unarchive mutation
  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      apiRequest(`/api/vendor-pos/${id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success(data.archived ? 'RFQ archived' : 'RFQ unarchived');
      if (selectedVendorPO) {
        setSelectedVendorPO({ ...selectedVendorPO, archived: data.archived });
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update archive status');
    },
  });

  // Filter vendor POs
  const ACTIVE_STATUSES = ['Draft', 'RFQ Sent', 'Quote Received', 'Sent', 'Partially Received'];
  const CLOSED_STATUSES = ['Declined', 'Expired', 'Cancelled', 'Fully Received'];

  const filteredVendorPOs = (vendorPOs || []).filter((vendorPo) => {
    const matchesSearch =
      (vendorPo.poNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vendorPo.externalPoNumber || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendorPo.vendorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `Draft #${vendorPo.id}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      false;

    // Tab-level filter
    let matchesTab: boolean;
    if (listTab === 'active') {
      matchesTab = ACTIVE_STATUSES.includes(vendorPo.status);
    } else if (listTab === 'closed') {
      matchesTab = CLOSED_STATUSES.includes(vendorPo.status);
    } else {
      matchesTab = true; // archived tab shows all archived records
    }

    // Per-status sub-filter within the tab
    const matchesStatus = statusFilter === 'any' || vendorPo.status === statusFilter;

    return matchesSearch && matchesTab && matchesStatus;
  });

  // Event handlers
  const handleCreate = () => {
    setSelectedVendorPO(null);
    setShowForm(true);
  };

  const handleEdit = (vendorPo: VendorPO) => {
    setSelectedVendorPO(vendorPo);
    setShowDetailView(true);
    setActiveTab('details');
  };

  const handleBackToList = () => {
    setShowDetailView(false);
    setSelectedVendorPO(null);
    setActiveTab('details');
  };

  const handleDelete = (id: number) => {
    if (
      confirm('Are you sure you want to delete this vendor purchase order?')
    ) {
      deleteMutation.mutate(id);
    }
  };

  const loadRecipientsForPO = async (poId: number) => {
    setIsLoadingRecipients(true);
    setDialogRecipients([]);
    setSelectedRecipients([]);
    try {
      const raw: EmailRecipient[] = await apiRequest(`/api/vendor-pos/${poId}/email-recipients`);
      const seen = new Set<string>();
      const recipients = raw.filter((r) => {
        const key = r.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setDialogRecipients(recipients);
      const primary = recipients.find((r) => r.type === 'primary');
      setSelectedRecipients(primary ? [primary.email] : recipients.slice(0, 1).map((r) => r.email));
    } catch {
      setDialogRecipients([]);
      setSelectedRecipients([]);
      toast.error('Could not load recipients — failed to load vendor contacts. Please close and try again.');
    } finally {
      setIsLoadingRecipients(false);
    }
  };

  const handleOpenRFQDialog = () => {
    if (!selectedVendorPO) return;
    setShowRFQDialog(true);
    loadRecipientsForPO(selectedVendorPO.id);
  };

  const handleOpenResendDialog = () => {
    if (!selectedVendorPO) return;
    setShowResendDialog(true);
    loadRecipientsForPO(selectedVendorPO.id);
  };

  const openComplianceModal = async (poId: number) => {
    setCompliancePoId(poId);
    // Pre-fetch current optional settings for auto-selection logic
    try {
      const currentOpts = await apiRequest(`/api/vendor-pos/${poId}/optional-settings`) as OptionalSetting[];
      setCompliancePoOptionalIds(currentOpts.map((s) => s.id));
    } catch {
      setCompliancePoOptionalIds([]);
    }
    setShowComplianceModal(true);
  };

  const handleComplianceApproved = () => {
    if (!compliancePoId) return;
    // Find the PO in the list to ensure selectedVendorPO is set
    const poFromList = (vendorPOs as VendorPO[] | undefined)?.find((p) => p.id === compliancePoId);
    if (poFromList) setSelectedVendorPO(poFromList);
    // Now proceed to show the email/issue dialog
    setNoEmailMode(false);
    setNoEmailReason('');
    setNoEmailConfirmed(false);
    setPendingStatus('Sent');
    setShowStatusChangeDialog(true);
    loadRecipientsForPO(compliancePoId);
  };

  const handleAutoSelectOptionals = async (newIds: number[]) => {
    if (!compliancePoId) return;
    try {
      await apiRequest(`/api/vendor-pos/${compliancePoId}/optional-settings`, {
        method: 'PUT',
        body: JSON.stringify({ optionalSettingIds: newIds }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', compliancePoId, 'optional-settings'] });
    } catch {
      // Non-fatal
    }
  };

  const handleIssuePO = (id: number, _skipEmail: boolean = false) => {
    // Find the PO in the list so it can be set as selectedVendorPO (list-view entry point)
    const poFromList = (vendorPOs as VendorPO[] | undefined)?.find((p) => p.id === id);
    if (poFromList) {
      setSelectedVendorPO(poFromList);
    }
    // Navigate into detail view so we have full PO context
    setShowDetailView(true);
    // Show compliance review modal first before proceeding to issue
    openComplianceModal(id);
  };

  const handleViewItems = (vendorPo: VendorPO) => {
    setSelectedVendorPO(vendorPo);
    setShowDetailView(true);
    setActiveTab('items');
  };

  const handleCreateRevision = (vendorPo: VendorPO) => {
    setRevisionPO(vendorPo);
    setRevisionReason('');
    setShowRevisionDialog(true);
  };

  const confirmCreateRevision = () => {
    if (revisionPO && revisionReason.trim()) {
      createRevisionMutation.mutate({ 
        id: revisionPO.id, 
        changeReason: revisionReason.trim() 
      });
    }
  };

  const handleFormSubmit = (data: CreateVendorPOData) => {
    if (selectedVendorPO) {
      updateMutation.mutate({ id: selectedVendorPO.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === 'Sent' && selectedVendorPO) {
      // Intercept Issue PO to show compliance review modal first
      openComplianceModal(selectedVendorPO.id);
      return;
    }
    setPendingStatus(newStatus);
    setShowStatusChangeDialog(true);
  };

  const confirmStatusChange = (skipEmail: boolean = false) => {
    if (selectedVendorPO) {
      if (pendingStatus === 'Sent') {
        issuePOMutation.mutate({
          id: selectedVendorPO.id,
          skipEmail,
          reason: skipEmail ? noEmailReason.trim() : undefined,
          recipients: skipEmail ? undefined : selectedRecipients,
        });
        setShowStatusChangeDialog(false);
        setPendingStatus('');
      } else {
        changeStatusMutation.mutate({ id: selectedVendorPO.id, status: pendingStatus });
      }
    }
  };

  const handleDownloadPDF = async (poToView?: VendorPO) => {
    const po = poToView || selectedVendorPO;
    if (!po) return;
    
    try {
      console.log('Starting PO view generation...');
      
      // Fetch line items for this PO
      const items: VendorPOItem[] = await apiRequest(`/api/vendor-pos/${po.id}/items`);
      console.log('Fetched items:', items);
      
      // Fetch vendor details to get vendor-specific PO settings
      const vendor: any = await apiRequest(`/api/vendors/${po.vendorId}`);
      console.log('Fetched vendor:', vendor);
      
      // Fetch global PO settings
      const globalSettings: any = await apiRequest('/api/vendor-pos/settings');
      console.log('Fetched global settings:', globalSettings);
      
      // Fetch central company settings
      const companySettings: any = await apiRequest('/api/vendor-pos/company-settings');
      console.log('Fetched company settings:', companySettings);
      
      // Fetch optional settings attached to this PO
      const optionalSettings: any[] = await apiRequest(`/api/vendor-pos/${po.id}/optional-settings`);
      console.log('Fetched optional settings:', optionalSettings);
      
      // Combine company info + PO contact info + PO terms
      const settings = {
        companyName: companySettings?.companyName || '',
        companyAddress: companySettings?.companyAddress || '',
        companyPhone: companySettings?.companyPhone || '',
        companyEmail: companySettings?.companyEmail || '',
        companyWebsite: companySettings?.companyWebsite || '',
        contactName: globalSettings?.contactName || '',
        contactTitle: globalSettings?.contactTitle || '',
        contactPhone: globalSettings?.contactPhone || '',
        contactEmail: globalSettings?.contactEmail || '',
        termsAndConditions: vendor?.termsAndConditions || globalSettings?.termsAndConditions || '',
        paymentTerms: vendor?.paymentTerms || globalSettings?.paymentTerms || '',
        shippingInstructions: vendor?.shippingInstructions || globalSettings?.shippingInstructions || '',
      };
      
      console.log('Building HTML content...');
      
      // Create a simple HTML structure for PDF conversion
      const printWindow = window.open('', '', 'height=600,width=800');
      if (!printWindow) {
        toast.error('Please allow popups to view the Purchase Order');
        return;
      }
      
      console.log('Popup window opened successfully');
      
      const isRFQ = !po.poNumber;
      const docTitle = isRFQ ? 'REQUEST FOR QUOTE' : 'PURCHASE ORDER';
      const accentColor = isRFQ ? '#e67e22' : '#1a3a5c';
      const formattedPONumber = po.poNumber ? po.poNumber.replace('VPO-', '') : '';
      const orderDate = po.createdAt ? new Date(po.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const deliveryDate = po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A';
      const lineItemTotal = items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)), 0);

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>${isRFQ ? 'Request for Quote' : 'Purchase Order'} - ${po.poNumber || 'Draft #' + po.id}</title>
  
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      padding: 36px 40px;
      color: #1a1a1a;
      font-size: 12px;
      line-height: 1.5;
      position: relative;
    }

    .print-controls {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 1000;
      display: flex;
      gap: 8px;
    }
    .print-btn {
      background-color: #2563eb;
      color: #fff;
      border: none;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 5px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12);
    }
    .print-btn:hover { background-color: #1d4ed8; }

    /* ── RFQ Watermark ── */
    .rfq-watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 120px;
      font-weight: 800;
      color: #000;
      opacity: 0.04;
      z-index: 0;
      pointer-events: none;
      white-space: nowrap;
      letter-spacing: 8px;
    }

    /* ── Top Header Grid ── */
    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0;
    }
    .company-block h1 {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 4px;
    }
    .company-block p {
      font-size: 12px;
      color: #555;
      margin: 1px 0;
      line-height: 1.6;
    }

    .meta-panel {
      border: 1.5px solid ${accentColor};
      border-radius: 6px;
      min-width: 260px;
      max-width: 300px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .meta-panel-title {
      background-color: ${accentColor};
      color: #fff;
      text-align: center;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 8px 16px;
      text-transform: uppercase;
    }
    .meta-panel-body {
      padding: 10px 16px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      padding: 3px 0;
      font-size: 12px;
    }
    .meta-label { color: #666; font-weight: 500; }
    .meta-value { font-weight: 600; color: #1a1a1a; text-align: right; }
    .meta-divider { border-top: 1px solid #e5e5e5; margin: 6px 0; }
    

    /* ── Divider ── */
    .section-divider {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20px 0;
    }

    /* ── Vendor / Ship-To Panels ── */
    .panels-row {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
    }
    .panel {
      flex: 1;
      border: 1px solid #ddd;
      border-radius: 5px;
      overflow: hidden;
    }
    .panel-header {
      background-color: #f5f5f5;
      padding: 6px 14px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #555;
      border-bottom: 1px solid #ddd;
    }
    .panel-body {
      padding: 12px 14px;
      font-size: 12px;
      line-height: 1.7;
    }
    .panel-body strong { color: #1a1a1a; }

    /* ── Line Items Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 4px;
    }
    thead th {
      background-color: #f5f5f5;
      border-bottom: 2px solid #ccc;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: #444;
      text-align: left;
    }
    thead th.num { text-align: right; }
    tbody td {
      padding: 8px 10px;
      border-bottom: 1px solid #eee;
      font-size: 12px;
      vertical-align: top;
    }
    tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tbody tr:nth-child(even) { background-color: #fafafa; }
    tbody td small { color: #777; font-size: 11px; }

    /* ── Totals Box ── */
    .totals-box {
      display: flex;
      justify-content: flex-end;
      margin-top: 4px;
      margin-bottom: 24px;
    }
    .totals-inner {
      background-color: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 5px;
      padding: 12px 24px;
      min-width: 220px;
      text-align: right;
    }
    .totals-inner .total-label {
      font-size: 12px;
      color: #666;
      font-weight: 500;
    }
    .totals-inner .total-amount {
      font-size: 14px;
      font-weight: 700;
      color: #1a1a1a;
      margin-top: 2px;
    }

    /* ── Notes ── */
    .notes-section {
      margin-bottom: 20px;
    }
    .section-label {
      font-size: 13px;
      font-weight: 700;
      color: #333;
      margin-bottom: 4px;
    }
    .notes-body {
      font-size: 12px;
      color: #444;
      line-height: 1.6;
    }

    /* ── Footer Terms ── */
    .terms-section {
      margin-top: 28px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
    }
    .term-block {
      margin-bottom: 14px;
    }
    .term-block-title {
      font-size: 12px;
      font-weight: 700;
      color: #333;
      margin-bottom: 3px;
    }
    .term-block-body {
      font-size: 11px;
      color: #555;
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .optional-item {
      margin-top: 8px;
      padding-left: 12px;
    }
    .optional-item-name {
      font-size: 11px;
      font-weight: 700;
      color: #444;
    }
    .optional-item-body {
      font-size: 11px;
      color: #555;
      white-space: pre-wrap;
      margin-top: 2px;
      line-height: 1.5;
    }

    /* ── Contact Strip ── */
    .contact-strip {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      padding: 10px 14px;
      background-color: #f9f9f9;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
      font-size: 12px;
    }
    .contact-strip strong { color: #555; font-weight: 600; }

    @media print {
      body { padding: 20px; }
      .print-controls { display: none !important; }
      .rfq-watermark { position: fixed; }
    }
  </style>
</head>
<body>
  <div class="print-controls">
    <button class="print-btn" onclick="window.print()">
      <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"></polyline>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
        <rect x="6" y="14" width="12" height="8"></rect>
      </svg>
      Print
    </button>
  </div>

  ${isRFQ ? '<div class="rfq-watermark">REQUEST FOR QUOTE</div>' : ''}

  <!-- ── Header: Company + Meta Panel ── -->
  <div class="doc-header">
    <div class="company-block">
      ${settings.companyName ? '<h1>' + settings.companyName + '</h1>' : ''}
      ${settings.companyAddress ? '<p style="white-space:pre-wrap;">' + settings.companyAddress + '</p>' : ''}
      ${settings.companyPhone ? '<p>' + settings.companyPhone + '</p>' : ''}
      ${settings.companyWebsite ? '<p>' + settings.companyWebsite + '</p>' : ''}
    </div>
    <div class="meta-panel">
      <div class="meta-panel-title">${docTitle}</div>
      <div class="meta-panel-body">
        ${isRFQ
          ? '<div style="text-align:center;color:#e67e22;font-weight:600;font-size:11px;padding:2px 0;">Non-binding quote request</div>'
          : '<div class="meta-row"><span class="meta-label">PO Number</span><span class="meta-value">' + formattedPONumber + '</span></div>'
        }
        ${po.externalPoNumber ? '<div class="meta-row"><span class="meta-label">Legacy ERP PO #</span><span class="meta-value">' + po.externalPoNumber + '</span></div>' : ''}
        <div class="meta-row"><span class="meta-label">Date</span><span class="meta-value">${orderDate}</span></div>
        <div class="meta-row"><span class="meta-label">Delivery</span><span class="meta-value">${deliveryDate}</span></div>
        <div class="meta-row"><span class="meta-label">Ship Via</span><span class="meta-value">${po.shipVia || 'N/A'}</span></div>
        <div class="meta-row"><span class="meta-label">Status</span><span class="meta-value">${po.status}</span></div>
      </div>
    </div>
  </div>

  <hr class="section-divider" />

  <!-- ── Purchasing Contact ── -->
  ${settings.contactName || settings.contactPhone || settings.contactEmail ? '<div class="contact-strip"><div><strong>Purchasing Contact:</strong> ' + (settings.contactName || '') + (settings.contactTitle ? ', ' + settings.contactTitle : '') + '</div>' + (settings.contactPhone || settings.contactEmail ? '<div>' + (settings.contactPhone || '') + (settings.contactPhone && settings.contactEmail ? ' | ' : '') + (settings.contactEmail || '') + '</div>' : '') + '</div>' : ''}

  <!-- ── Vendor + Ship-To Panels ── -->
  <div class="panels-row">
    <div class="panel">
      <div class="panel-header">Vendor</div>
      <div class="panel-body">
        <strong>${po.vendorName || 'Vendor ID: ' + po.vendorId}</strong>
        ${vendor?.street ? '<br/>' + vendor.street : (vendor?.address ? '<br/>' + vendor.address : '')}
        ${vendor?.city || vendor?.state || vendor?.zip_code ? '<br/>' + [vendor.city, vendor.state].filter(Boolean).join(', ') + (vendor.zip_code ? ' ' + vendor.zip_code : '') : ''}
        ${vendor?.phone ? '<br/>Ph: ' + vendor.phone : ''}
        ${vendor?.email ? '<br/>' + vendor.email : ''}
        ${vendor?.contactPerson ? '<br/>Attn: ' + vendor.contactPerson : ''}
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Ship To</div>
      <div class="panel-body">
        <strong>${settings.companyName || ''}</strong>
        ${settings.companyAddress ? '<br/><span style="white-space:pre-wrap;">' + settings.companyAddress + '</span>' : ''}
        ${settings.companyPhone ? '<br/>Ph: ' + settings.companyPhone : ''}
      </div>
    </div>
  </div>

  <!-- ── Line Items ── -->
  <table>
    <thead>
      <tr>
        <th style="width:40px;">Line</th>
        <th>Supplier Part #</th>
        <th>Description</th>
        <th class="num" style="width:70px;">Qty</th>
        <th style="width:60px;">Unit</th>
        <th class="num" style="width:90px;">Unit Price</th>
        <th class="num" style="width:100px;">Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        const lineTotal = qty * price;
        return '<tr>' +
          '<td>' + item.lineNumber + '</td>' +
          '<td>' + (item.supplierPartNumber || '-') + '</td>' +
          '<td>' + (item.description || '-') +
            (item.purchaseQty != null && item.purchaseQty > 0 && item.purchaseUnit
              ? '<br/><small>(' + Number(item.purchaseQty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + item.purchaseUnit + ' ordered)</small>'
              : '') +
          '</td>' +
          '<td class="num">' + qty.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
          '<td>' + (item.vendorUnit || item.uom || '-') + '</td>' +
          '<td class="num">$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
          '<td class="num">$' + lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>' +
        '</tr>';
      }).join('')}
    </tbody>
  </table>

  <!-- ── Totals ── -->
  <div class="totals-box">
    <div class="totals-inner">
      <div class="total-label">Total</div>
      <div class="total-amount">$${lineItemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    </div>
  </div>

  <!-- ── Notes ── -->
  ${po.notes ? '<div class="notes-section"><div class="section-label">Notes</div><div class="notes-body">' + po.notes + '</div></div>' : ''}

  <!-- ── Terms / Footer ── -->
  ${settings.termsAndConditions || settings.paymentTerms || settings.shippingInstructions || optionalSettings.length > 0 ? '<div class="terms-section">' +
    (settings.paymentTerms ? '<div class="term-block"><div class="term-block-title">Payment Terms</div><div class="term-block-body">' + settings.paymentTerms + '</div></div>' : '') +
    (settings.shippingInstructions ? '<div class="term-block"><div class="term-block-title">Shipping Instructions</div><div class="term-block-body">' + settings.shippingInstructions + '</div></div>' : '') +
    (settings.termsAndConditions ? '<div class="term-block"><div class="term-block-title">Terms and Conditions</div><div class="term-block-body">' + settings.termsAndConditions + '</div></div>' : '') +
    (optionalSettings.length > 0 ? '<div class="term-block"><div class="term-block-title">Additional Requirements</div>' +
      optionalSettings.map(function(s, i) { return '<div class="optional-item"><div class="optional-item-name">' + (i+1) + '. ' + s.name + '</div><div class="optional-item-body">' + s.statement + '</div></div>'; }).join('') +
    '</div>' : '') +
  '</div>' : ''}

  
</body>
</html>
      `;
      
      console.log('Writing HTML to popup window...');
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      console.log('HTML written successfully');
      
      // Window stays open for viewing - user can print if they want
      toast.success(po.poNumber ? 'Purchase Order opened in new window' : 'Request for Quote opened in new window');
      
    } catch (error) {
      console.error('PDF generation error:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      toast.error('Failed to view Purchase Order: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const getNextStatus = (currentStatus: string): string | null => {
    switch (currentStatus) {
      case 'Draft':
        return 'Sent';
      case 'RFQ Sent':
        return 'Sent';
      case 'Quote Received':
        return 'Sent';
      case 'Sent':
        return 'Partially Received';
      case 'Partially Received':
        return 'Fully Received';
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex justify-center items-center py-8"
        data-testid="loading-state"
      >
        <div className="text-gray-500">Loading vendor purchase orders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" data-testid="error-state">
        <div className="text-red-600">
          Failed to load vendor purchase orders
        </div>
        <Button
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] })
          }
          className="mt-2"
          data-testid="button-retry"
        >
          Retry
        </Button>
      </div>
    );
  }

  const activeStatusOptions = [
    { value: 'any', label: 'All Active' },
    { value: 'Draft', label: 'Draft' },
    { value: 'RFQ Sent', label: 'RFQ Sent' },
    { value: 'Quote Received', label: 'Quote Received' },
    { value: 'Sent', label: 'Sent' },
    { value: 'Partially Received', label: 'Partially Received' },
  ];
  const closedStatusOptions = [
    { value: 'any', label: 'All Closed' },
    { value: 'Declined', label: 'Declined' },
    { value: 'Expired', label: 'Expired' },
    { value: 'Cancelled', label: 'Cancelled' },
    { value: 'Fully Received', label: 'Fully Received' },
  ];
  const statusOptions = listTab === 'active' ? activeStatusOptions : listTab === 'closed' ? closedStatusOptions : [];

  const handleListTabChange = (tab: 'active' | 'closed' | 'archived') => {
    setListTab(tab);
    setStatusFilter('any');
  };

  // Show detail view if a PO is selected
  if (showDetailView && selectedVendorPO) {
    const nextStatus = getNextStatus(selectedVendorPO.status);
    
    return (
      <div className="space-y-6">
        {/* Detail Header */}
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={handleBackToList}
                data-testid="button-back-to-list"
              >
                ← Back to List
              </Button>
              <div>
                <h2
                  className="text-2xl font-bold tracking-tight"
                  data-testid="detail-po-number"
                >
                  {selectedVendorPO.poNumber || `Draft #${selectedVendorPO.id}`}
                </h2>
                {selectedVendorPO.externalPoNumber && (
                  <div className="text-sm text-muted-foreground">
                    External Ref: {selectedVendorPO.externalPoNumber}
                  </div>
                )}
                <p className="text-muted-foreground">
                  {selectedVendorPO.vendorName ||
                    `Vendor ID: ${selectedVendorPO.vendorId}`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {['Sent', 'Partially Received', 'Fully Received'].includes(selectedVendorPO.status) &&
              (selectedVendorPO.totalLines ?? 0) > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="detail-receiving-progress">
                  <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${Math.min(100, Math.round(((selectedVendorPO.receivedLines ?? 0) / (selectedVendorPO.totalLines ?? 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <span>
                    {selectedVendorPO.receivedLines ?? 0} / {selectedVendorPO.totalLines} lines fully received
                  </span>
                </div>
              )}
            <Badge
              className={getStatusColor(selectedVendorPO.status)}
              data-testid="detail-status"
            >
              {selectedVendorPO.status}
            </Badge>
            {/* Compliance status badge in detail view — clickable to open review modal */}
            <ComplianceBadge
              status={selectedVendorPO.complianceStatus}
              onClick={() => openComplianceModal(selectedVendorPO.id)}
            />

            {/* Task #83: Purchasing Controls quick-link */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPurchasingControlsOpen(true)}
              data-testid="button-purchasing-controls"
              title="Requisition link, competition method, FAR flowdowns, debarment evidence, direct-PO exception"
            >
              Purchasing Controls
            </Button>

            {/* Send RFQ Button (only for Draft) */}
            {selectedVendorPO.status === 'Draft' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenRFQDialog}
                disabled={sendRFQMutation.isPending}
                className="text-orange-600 hover:text-orange-800 border-orange-300 hover:border-orange-400"
                data-testid="button-send-rfq"
              >
                <Send className="w-4 h-4 mr-2" />
                {sendRFQMutation.isPending ? 'Sending...' : 'Send RFQ'}
              </Button>
            )}

            {/* RFQ Lifecycle Transition Buttons (only when RFQ Sent) */}
            {selectedVendorPO.status === 'RFQ Sent' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => rfqTransitionMutation.mutate({ id: selectedVendorPO.id, status: 'Quote Received' })}
                  disabled={rfqTransitionMutation.isPending}
                  className="text-green-700 hover:text-green-900 border-green-300 hover:border-green-400"
                  data-testid="button-rfq-quote-received"
                >
                  <ThumbsUp className="w-4 h-4 mr-2" />
                  Quote Received
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPendingRfqStatus('Declined');
                    setRfqOutcomeNote('');
                    setShowRfqOutcomeDialog(true);
                  }}
                  disabled={rfqTransitionMutation.isPending}
                  className="text-red-600 hover:text-red-800 border-red-300 hover:border-red-400"
                  data-testid="button-rfq-declined"
                >
                  <ThumbsDown className="w-4 h-4 mr-2" />
                  Declined
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPendingRfqStatus('Expired');
                    setRfqOutcomeNote('');
                    setShowRfqOutcomeDialog(true);
                  }}
                  disabled={rfqTransitionMutation.isPending}
                  className="text-slate-600 hover:text-slate-800 border-slate-300 hover:border-slate-400"
                  data-testid="button-rfq-expired"
                >
                  <Timer className="w-4 h-4 mr-2" />
                  Expired
                </Button>
              </>
            )}

            {/* Status Workflow Buttons */}
            {nextStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange(nextStatus)}
                data-testid="button-change-status"
              >
                {nextStatus === 'Sent' && <Send className="w-4 h-4 mr-2" />}
                {nextStatus === 'Partially Received' && <Package className="w-4 h-4 mr-2" />}
                {nextStatus === 'Fully Received' && <CheckCircle className="w-4 h-4 mr-2" />}
                {nextStatus === 'Sent' ? 'Issue PO' : `Mark as ${nextStatus}`}
              </Button>
            )}
            
            {/* Resend PO Button (only for Sent or Partially Received) */}
            {(['Sent', 'Partially Received'].includes(selectedVendorPO.status)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenResendDialog}
                disabled={resendPOMutation.isPending}
                className="text-blue-600 hover:text-blue-800 border-blue-300 hover:border-blue-400"
                data-testid="button-resend-po"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${resendPOMutation.isPending ? 'animate-spin' : ''}`} />
                {resendPOMutation.isPending ? 'Resending...' : 'Resend PO'}
              </Button>
            )}

            {/* Cancel Button (only for Draft, RFQ Sent, Quote Received, or Sent) */}
            {(['Draft', 'RFQ Sent', 'Quote Received', 'Sent'].includes(selectedVendorPO.status)) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleStatusChange('Cancelled')}
                data-testid="button-cancel-po"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Cancel PO
              </Button>
            )}

            {/* Archive / Unarchive Button for closed-state records */}
            {(['Quote Received', 'Declined', 'Expired', 'Cancelled'].includes(selectedVendorPO.status)) && (
              selectedVendorPO.archived ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archiveMutation.mutate({ id: selectedVendorPO.id, archived: false })}
                  disabled={archiveMutation.isPending}
                  className="text-slate-600 hover:text-slate-800"
                  data-testid="button-unarchive"
                >
                  <ArchiveRestore className="w-4 h-4 mr-2" />
                  {archiveMutation.isPending ? 'Saving...' : 'Unarchive'}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => archiveMutation.mutate({ id: selectedVendorPO.id, archived: true })}
                  disabled={archiveMutation.isPending}
                  className="text-slate-600 hover:text-slate-800"
                  data-testid="button-archive"
                >
                  <Archive className="w-4 h-4 mr-2" />
                  {archiveMutation.isPending ? 'Saving...' : 'Archive'}
                </Button>
              )
            )}
            
            {/* PDF Download Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadPDF()}
              data-testid="button-view-po"
            >
              <Eye className="w-4 h-4 mr-2" />
              {selectedVendorPO.poNumber ? 'View PO' : 'View RFQ'}
            </Button>
          </div>
        </div>

        {/* Archived Banner */}
        {selectedVendorPO.archived && (
          <div className="flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <Archive className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
            <div>
              <span className="font-semibold">Archived</span>
              {' — this RFQ is archived and hidden from the default list. Use the Unarchive button to make it active again.'}
            </div>
          </div>
        )}

        {/* RFQ Outcome Notes Banner (shown when Declined or Expired) */}
        {(['Declined', 'Expired'].includes(selectedVendorPO.status)) && selectedVendorPO.rfqOutcomeNotes && (
          <div className="flex items-start gap-3 rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-800">
            <div>
              <span className="font-semibold">Outcome note:</span>{' '}
              <span className="italic">{selectedVendorPO.rfqOutcomeNotes}</span>
            </div>
          </div>
        )}

        {/* Internal Issuance Banner */}
        {selectedVendorPO.issuedWithoutEmail && (
          <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
            <div>
              <span className="font-semibold">Vendor NOT notified</span>
              {' — issued internally'}
              {selectedVendorPO.issuedWithoutEmailAt && (
                <> on {new Date(selectedVendorPO.issuedWithoutEmailAt).toLocaleDateString()}</>
              )}
              {selectedVendorPO.issuedWithoutEmailReason && (
                <>. Reason: <span className="italic">{selectedVendorPO.issuedWithoutEmailReason}</span></>
              )}
            </div>
          </div>
        )}

        {/* RFQ Outcome Dialog (Declined / Expired) */}
        <Dialog
          open={showRfqOutcomeDialog}
          onOpenChange={(open) => {
            setShowRfqOutcomeDialog(open);
            if (!open) {
              setPendingRfqStatus(null);
              setRfqOutcomeNote('');
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Mark RFQ as {pendingRfqStatus}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {pendingRfqStatus === 'Declined'
                  ? 'Optionally record why the vendor declined this RFQ (e.g. pricing, lead time, capacity).'
                  : 'Optionally record why this RFQ expired without a response.'}
              </p>
              <div className="space-y-1">
                <Label htmlFor="rfq-outcome-note" className="text-sm">
                  Reason / Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="rfq-outcome-note"
                  placeholder="e.g. Pricing too high, no response after 2 weeks…"
                  value={rfqOutcomeNote}
                  onChange={(e) => setRfqOutcomeNote(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowRfqOutcomeDialog(false);
                  setPendingRfqStatus(null);
                  setRfqOutcomeNote('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant={pendingRfqStatus === 'Declined' ? 'destructive' : 'default'}
                disabled={rfqTransitionMutation.isPending}
                onClick={() => {
                  if (!selectedVendorPO || !pendingRfqStatus) return;
                  rfqTransitionMutation.mutate(
                    {
                      id: selectedVendorPO.id,
                      status: pendingRfqStatus,
                      rfqOutcomeNotes: rfqOutcomeNote.trim() || undefined,
                    },
                    {
                      onSettled: () => {
                        setShowRfqOutcomeDialog(false);
                        setPendingRfqStatus(null);
                        setRfqOutcomeNote('');
                      },
                    }
                  );
                }}
              >
                {rfqTransitionMutation.isPending ? 'Saving…' : `Confirm ${pendingRfqStatus}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status Change / Issue PO Confirmation Dialog */}
        <AlertDialog
          open={showStatusChangeDialog}
          onOpenChange={(open) => {
            setShowStatusChangeDialog(open);
            if (!open) {
              setNoEmailMode(false);
              setNoEmailReason('');
              setNoEmailConfirmed(false);
            }
          }}
        >
          <AlertDialogContent className="sm:max-w-lg">
            {pendingStatus === 'Sent' ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Issue Purchase Order</AlertDialogTitle>
                  <AlertDialogDescription>
                    {noEmailMode
                      ? 'Provide a reason for issuing this PO without notifying the vendor.'
                      : 'Choose how to issue this purchase order.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                {!noEmailMode && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Email Recipients</Label>
                    <RecipientPickerList
                      recipients={dialogRecipients}
                      selected={selectedRecipients}
                      onChange={setSelectedRecipients}
                      isLoading={isLoadingRecipients}
                    />
                  </div>
                )}

                {noEmailMode && (
                  <div className="space-y-3 py-2">
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>Internal only — the vendor will <strong>NOT</strong> be emailed.</span>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="no-email-reason" className="text-sm font-medium">
                        Reason <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="no-email-reason"
                        placeholder="Explain why the vendor is not being notified (min 10 characters)…"
                        value={noEmailReason}
                        onChange={(e) => setNoEmailReason(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                      {noEmailReason.length > 0 && noEmailReason.trim().length < 10 && (
                        <p className="text-xs text-red-500">
                          Must be at least 10 characters ({noEmailReason.trim().length}/10)
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="no-email-confirm"
                        checked={noEmailConfirmed}
                        onCheckedChange={(v) => setNoEmailConfirmed(!!v)}
                      />
                      <Label htmlFor="no-email-confirm" className="text-sm cursor-pointer">
                        I confirm the vendor will <strong>NOT</strong> be emailed.
                      </Label>
                    </div>
                  </div>
                )}

                <AlertDialogFooter className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:justify-end">
                  {noEmailMode ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setNoEmailMode(false);
                          setNoEmailReason('');
                          setNoEmailConfirmed(false);
                        }}
                      >
                        ← Back
                      </Button>
                      <Button
                        onClick={() => confirmStatusChange(true)}
                        disabled={
                          noEmailReason.trim().length < 10 ||
                          !noEmailConfirmed ||
                          issuePOMutation.isPending
                        }
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        data-testid="button-confirm-internal-issue"
                      >
                        {issuePOMutation.isPending ? 'Issuing…' : 'Confirm Internal Issue'}
                      </Button>
                    </>
                  ) : (
                    <>
                      <AlertDialogCancel className="sm:mr-auto mt-0">Cancel</AlertDialogCancel>
                      <Button
                        variant="outline"
                        onClick={() => setNoEmailMode(true)}
                        data-testid="button-issue-no-email"
                        className="whitespace-nowrap text-sm"
                      >
                        Issue Internally (No Vendor Notification)
                      </Button>
                      <AlertDialogAction
                        onClick={() => confirmStatusChange(false)}
                        disabled={issuePOMutation.isPending || selectedRecipients.length === 0}
                        data-testid="button-confirm-status-change"
                        className="whitespace-nowrap"
                      >
                        {issuePOMutation.isPending ? 'Issuing…' : 'Issue & Send Email'}
                      </AlertDialogAction>
                    </>
                  )}
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to change the status of this purchase order from{' '}
                    <strong>{selectedVendorPO.status}</strong> to <strong>{pendingStatus}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => confirmStatusChange(false)}
                    data-testid="button-confirm-status-change"
                  >
                    Confirm
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>

        {/* Send RFQ Confirmation Dialog */}
        <AlertDialog open={showRFQDialog} onOpenChange={setShowRFQDialog}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Send Request for Quote</AlertDialogTitle>
              <AlertDialogDescription>
                Select the recipients for this RFQ email. At least one recipient must be checked.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email Recipients</Label>
              <RecipientPickerList
                recipients={dialogRecipients}
                selected={selectedRecipients}
                onChange={setSelectedRecipients}
                isLoading={isLoadingRecipients}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                onClick={() => {
                  if (selectedVendorPO) {
                    sendRFQMutation.mutate({ id: selectedVendorPO.id, recipients: selectedRecipients });
                  }
                }}
                disabled={sendRFQMutation.isPending || selectedRecipients.length === 0}
                data-testid="button-confirm-send-rfq"
              >
                {sendRFQMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>
                ) : 'Send RFQ'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Resend PO Confirmation Dialog */}
        <AlertDialog open={showResendDialog} onOpenChange={setShowResendDialog}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle>Resend Purchase Order</AlertDialogTitle>
              <AlertDialogDescription>
                Select the recipients for this resend email. A fresh confirmation link will be included. At least one recipient must be checked.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email Recipients</Label>
              <RecipientPickerList
                recipients={dialogRecipients}
                selected={selectedRecipients}
                onChange={setSelectedRecipients}
                isLoading={isLoadingRecipients}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                onClick={() => {
                  if (selectedVendorPO) {
                    resendPOMutation.mutate({ id: selectedVendorPO.id, recipients: selectedRecipients });
                  }
                }}
                disabled={resendPOMutation.isPending || selectedRecipients.length === 0}
                data-testid="button-confirm-resend-po"
              >
                {resendPOMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Resending…</>
                ) : 'Resend PO'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Tabbed Interface */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="details" data-testid="tab-details">
              PO Details
            </TabsTrigger>
            <TabsTrigger value="items" data-testid="tab-items">
              Line Items
            </TabsTrigger>
            <TabsTrigger value="receipts" data-testid="tab-receipts">
              Receipts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Purchase Order Details</CardTitle>
                <CardDescription>
                  Edit the details for this purchase order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VendorPOForm
                  vendorPo={selectedVendorPO}
                  isOpen={true}
                  onClose={() => {}}
                  onSubmit={handleFormSubmit}
                  inline={true}
                />
              </CardContent>
            </Card>

            <ComplianceSummaryCard
              vendorPoId={selectedVendorPO.id}
              onOpenModal={() => openComplianceModal(selectedVendorPO.id)}
            />

            <Card>
              <CardHeader>
                <CardTitle>Attachments</CardTitle>
                <CardDescription>
                  Upload reference documents, emails, or other files related to this PO
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VendorPOAttachments vendorPoId={selectedVendorPO.id} />
              </CardContent>
            </Card>

            {!issuedStatuses.includes(selectedVendorPO.status) && selectedVendorPO.confirmationUsedAt && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-muted-foreground" />
                    Vendor Confirmation
                  </CardTitle>
                  <CardDescription>
                    This PO has a recorded vendor confirmation date
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      Confirmed
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const d = new Date(selectedVendorPO.confirmationUsedAt!);
                        const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                        return <>Confirmed on{' '}<span className="font-medium text-foreground">{datePart} at {timePart}</span></>;
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {issuedStatuses.includes(selectedVendorPO.status) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-muted-foreground" />
                    Vendor Confirmation
                  </CardTitle>
                  <CardDescription>
                    Whether the vendor has acknowledged receipt of this purchase order
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <VendorConfirmationCardContent
                    isLoading={isConfirmationLoading}
                    confirmationStatus={confirmationStatus}
                    isPending={resendPOMutation.isPending}
                    onResend={handleOpenResendDialog}
                    confirmationUsedAt={selectedVendorPO.confirmationUsedAt}
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <VendorPOItemSelector
              vendorPoId={selectedVendorPO.id}
              vendorId={selectedVendorPO.vendorId}
              poNumber={selectedVendorPO.poNumber || `Draft #${selectedVendorPO.id}`}
              onTotalChange={(total: number) => {
                queryClient.invalidateQueries({
                  queryKey: ['/api/vendor-pos'],
                });
              }}
            />
          </TabsContent>

          <TabsContent value="receipts" className="space-y-4">
            <ReceiptHistoryTab vendorPoId={selectedVendorPO.id} />
          </TabsContent>
        </Tabs>

        {/* Compliance Review Modal — hoisted here so it's mounted in detail-view branch */}
        {showComplianceModal && compliancePoId != null && (
          <ComplianceReviewModal
            vendorPoId={compliancePoId}
            isOpen={showComplianceModal}
            onClose={() => {
              setShowComplianceModal(false);
              setCompliancePoId(null);
            }}
            onComplianceApproved={handleComplianceApproved}
            allOptionalSettings={allOptionalSettings}
            currentOptionalSettingIds={compliancePoOptionalIds}
            onAutoSelectOptionals={handleAutoSelectOptionals}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            data-testid="page-title"
          >
            Vendor Purchase Orders
          </h2>
          <p className="text-muted-foreground">
            Manage purchase orders to vendors for procurement
          </p>
        </div>
        <Button onClick={handleCreate} data-testid="button-create-vendor-po">
          <Plus className="w-4 h-4 mr-2" />
          Create Vendor PO
        </Button>
      </div>

      {/* Tab Filter Bar */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border bg-muted p-1 gap-1">
          <button
            onClick={() => handleListTabChange('active')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              listTab === 'active'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-active"
          >
            Active
            {tabCounts !== undefined && (
              <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                listTab === 'active'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                {tabCounts.active}
              </span>
            )}
          </button>
          <button
            onClick={() => handleListTabChange('closed')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              listTab === 'closed'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-closed"
          >
            Fulfilled
            {tabCounts !== undefined && (
              <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                listTab === 'closed'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                {tabCounts.closed}
              </span>
            )}
          </button>
          <button
            onClick={() => handleListTabChange('archived')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              listTab === 'archived'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="tab-archived"
          >
            <Archive className="w-3.5 h-3.5" />
            Archived
            {tabCounts !== undefined && (
              <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-semibold ${
                listTab === 'archived'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted-foreground/20 text-muted-foreground'
              }`}>
                {tabCounts.archived}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by PO number or vendor name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Per-status sub-filter (not shown on archived tab) */}
        {listTab !== 'archived' && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Vendor PO List */}
      {filteredVendorPOs.length === 0 ? (
        <div className="text-center py-8" data-testid="empty-state">
          <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {vendorPOs.length === 0
              ? 'No vendor purchase orders'
              : 'No matching purchase orders'}
          </h3>
          <p className="text-gray-500">
            {vendorPOs.length === 0
              ? 'Create your first vendor purchase order to get started.'
              : 'Try adjusting your search or filters.'}
          </p>
          {vendorPOs.length === 0 && (
            <Button
              onClick={handleCreate}
              className="mt-4"
              data-testid="button-create-first-vendor-po"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Vendor PO
            </Button>
          )}
        </div>
      ) : (
        <Accordion type="multiple" className="space-y-4" data-testid="accordion-vendor-pos">
          {filteredVendorPOs.map((vendorPo) => (
            <AccordionItem
              key={vendorPo.id}
              value={`po-${vendorPo.id}`}
              className="border rounded-lg px-4 bg-card"
              data-testid={`accordion-item-vendor-po-${vendorPo.id}`}
            >
              <AccordionTrigger className="hover:no-underline" data-testid={`accordion-trigger-${vendorPo.id}`}>
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <div className="font-semibold">{vendorPo.poNumber || `Draft #${vendorPo.id}`}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {vendorPo.vendorName || 'Unknown Vendor'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {['Sent', 'Partially Received', 'Fully Received'].includes(vendorPo.status) &&
                      (vendorPo.totalLines ?? 0) > 0 && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${Math.round(((vendorPo.receivedLines ?? 0) / (vendorPo.totalLines ?? 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <span>
                            {vendorPo.receivedLines ?? 0} / {vendorPo.totalLines} lines
                          </span>
                        </div>
                      )}
                    <Badge className={getStatusColor(vendorPo.status)}>
                      {vendorPo.status}
                    </Badge>
                    {vendorPo.confirmationBadge === 'confirmed' && (
                      <TooltipProvider>
                        <Tooltip className="inline-flex w-auto">
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 cursor-default">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Confirmed
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="w-auto px-3 py-1.5 text-xs">
                            {vendorPo.confirmationUsedAt
                              ? `Vendor confirmed on ${new Date(vendorPo.confirmationUsedAt).toLocaleString()}`
                              : 'Vendor confirmed'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {(vendorPo.confirmationBadge === 'awaiting' ||
                      vendorPo.confirmationBadge === 'expired') &&
                      (['Sent', 'Partially Received'].includes(vendorPo.status) ? (
                        <ConfirmationBadgeResend vendorPo={vendorPo} />
                      ) : (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 text-xs font-medium',
                                  vendorPo.confirmationBadge === 'awaiting'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-red-600 dark:text-red-400'
                                )}
                              >
                                {vendorPo.confirmationBadge === 'awaiting' ? (
                                  <>
                                    <Clock className="w-3.5 h-3.5" />
                                    Awaiting
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Link Expired
                                  </>
                                )}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="w-auto px-3 py-1.5 text-xs">
                              {vendorPo.confirmationBadge === 'awaiting'
                                ? 'Awaiting vendor confirmation'
                                : 'Confirmation link expired'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ))}
                    {vendorPo.confirmationBadge === 'no_link' &&
                      (['Sent', 'Partially Received'].includes(vendorPo.status) ? (
                        <NoLinkBadgeSend vendorPo={vendorPo} />
                      ) : (
                        <span
                          title="No confirmation link sent — send not available for fully received POs"
                          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          No Link
                        </span>
                      ))}
                    {/* Compliance status badge — shown for all POs at all statuses */}
                    <ComplianceBadge
                      status={vendorPo.complianceStatus}
                      onClick={() => openComplianceModal(vendorPo.id)}
                    />
                    {vendorPo.isCurrentRevision === false && (
                      <Badge className="bg-gray-200 text-gray-600 text-xs">
                        Superseded
                      </Badge>
                    )}
                    {vendorPo.archived && (
                      <Badge className="bg-slate-100 text-slate-500 text-xs flex items-center gap-1">
                        <Archive className="w-3 h-3" />
                        Archived
                      </Badge>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <VendorPOCard
                  vendorPo={vendorPo}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onViewItems={handleViewItems}
                  onIssuePO={handleIssuePO}
                  onCreateRevision={handleCreateRevision}
                  onViewPDF={handleDownloadPDF}
                  onReviewCompliance={(id) => openComplianceModal(id)}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Create/Edit Form */}
      <VendorPOForm
        vendorPo={selectedVendorPO || undefined}
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSelectedVendorPO(null);
        }}
        onSubmit={handleFormSubmit}
      />

      {/* Create Revision Dialog */}
      <AlertDialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="revision-dialog-title">
              Create Revision for {revisionPO?.poNumber || `Draft #${revisionPO?.id}`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new draft revision of this purchase order. The original 
              PO will be marked as superseded and the new revision will be available for editing.
              <div className="mt-4">
                <Label htmlFor="revision-reason" className="text-foreground font-medium">
                  Reason for Revision *
                </Label>
                <Textarea
                  id="revision-reason"
                  placeholder="Enter the reason for this revision (e.g., quantity adjustment, price correction, additional items needed...)"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  className="mt-2"
                  rows={3}
                  data-testid="input-revision-reason"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revision">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCreateRevision}
              disabled={!revisionReason.trim() || createRevisionMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-confirm-revision"
            >
              {createRevisionMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Revision'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compliance Review Modal */}
      {showComplianceModal && compliancePoId != null && (
        <ComplianceReviewModal
          vendorPoId={compliancePoId}
          isOpen={showComplianceModal}
          onClose={() => {
            setShowComplianceModal(false);
            setCompliancePoId(null);
          }}
          onComplianceApproved={handleComplianceApproved}
          allOptionalSettings={allOptionalSettings}
          currentOptionalSettingIds={compliancePoOptionalIds}
          onAutoSelectOptionals={handleAutoSelectOptionals}
        />
      )}

      {/* Task #83: Purchasing Controls Modal — captures requisition link,
          competition method, sole-source justification, FAR flowdown
          checklist, debarment-check evidence, and direct-PO exception. */}
      {selectedVendorPO && (
        <PurchasingControlsDialog
          open={purchasingControlsOpen}
          onOpenChange={setPurchasingControlsOpen}
          vendorPo={selectedVendorPO}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
            queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', selectedVendorPO.id] });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task #83: Purchasing Controls dialog
// ─────────────────────────────────────────────────────────────────────────────
function PurchasingControlsDialog({
  open, onOpenChange, vendorPo, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  vendorPo: any;
  onChanged: () => void;
}) {
  const [requisitionId, setRequisitionId] = useState<string>(vendorPo.requisitionId ? String(vendorPo.requisitionId) : '');
  const [competitionMethod, setCompetitionMethod] = useState<string>(vendorPo.competitionMethod ?? '');
  const [soleSourceJustification, setSoleSourceJustification] = useState<string>(vendorPo.soleSourceJustification ?? '');
  const [exceptionReason, setExceptionReason] = useState('');
  const [debarmentNotes, setDebarmentNotes] = useState('');
  const [debarmentSource, setDebarmentSource] = useState<'sam.gov' | 'manual_attestation' | 'document_upload'>('manual_attestation');
  const [debarmentResult, setDebarmentResult] = useState<'pass' | 'fail' | 'inconclusive'>('pass');

  const { data: clauses = [] } = useQuery<any[]>({ queryKey: ['/api/far-flowdown-clauses'] });
  const { data: appliedFlowdowns = [], refetch: refetchFlowdowns } = useQuery<any[]>({
    queryKey: ['/api/far-flowdown-clauses/po', vendorPo.id],
    queryFn: () => apiRequest(`/api/far-flowdown-clauses/po/${vendorPo.id}`),
    enabled: open,
  });
  const [flowdownReasoning, setFlowdownReasoning] = useState<string>('Required by contract scope');

  const saveBasics = useMutation({
    mutationFn: () => apiRequest(`/api/vendor-pos/${vendorPo.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        requisitionId: requisitionId ? Number(requisitionId) : null,
        competitionMethod: competitionMethod || null,
        soleSourceJustification: soleSourceJustification || null,
      }),
    }),
    onSuccess: () => { toast.success('Saved'); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? 'Save failed'),
  });

  const recordDebarment = useMutation({
    mutationFn: () => apiRequest('/api/vendor-debarment-checks', {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendorPo.vendorId,
        context: 'po_issuance',
        contextRefId: vendorPo.id,
        source: debarmentSource,
        result: debarmentResult,
        notes: debarmentNotes,
      }),
    }),
    onSuccess: () => { toast.success('Debarment check recorded'); setDebarmentNotes(''); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? 'Record failed'),
  });

  const recordException = useMutation({
    mutationFn: () => apiRequest(`/api/vendor-pos/${vendorPo.id}/direct-po-exception`, {
      method: 'POST',
      body: JSON.stringify({ reason: exceptionReason }),
    }),
    onSuccess: () => { toast.success('Direct-PO exception approved'); setExceptionReason(''); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? 'Exception failed'),
  });

  // The backend uses PUT /api/far-flowdown-clauses/po/:poId with the FULL list
  // (replace-all semantics). Compose the new list locally and PUT it.
  const putFlowdowns = useMutation({
    mutationFn: (flowdowns: { clauseId: number; applicable: boolean; reasoning: string }[]) =>
      apiRequest(`/api/far-flowdown-clauses/po/${vendorPo.id}`, {
        method: 'PUT',
        body: JSON.stringify({ flowdowns }),
      }),
    onSuccess: () => { toast.success('FAR flowdowns saved'); refetchFlowdowns(); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? 'Update failed'),
  });

  const appliedById = new Map<number, any>(appliedFlowdowns.map((f: any) => [f.clauseId, f]));
  const toggleClause = (clauseId: number, applicable: boolean) => {
    const next = clauses.map((c: any) => {
      const existing = appliedById.get(c.id);
      const isThis = c.id === clauseId;
      const eff = isThis ? applicable : (existing?.applicable ?? false);
      const reasoning = isThis
        ? (flowdownReasoning.trim() || 'Required by contract scope')
        : (existing?.reasoning ?? 'Not applicable');
      return { clauseId: c.id, applicable: eff, reasoning };
    });
    putFlowdowns.mutate(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-purchasing-controls">
        <DialogHeader>
          <DialogTitle>Purchasing Controls — PO #{vendorPo.poNumber ?? vendorPo.id}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="font-semibold">Requisition & Competition</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Linked Requisition ID</Label>
                <Input value={requisitionId} onChange={(e) => setRequisitionId(e.target.value)} placeholder="APPROVED requisition id" data-testid="input-po-requisition-id" />
              </div>
              <div>
                <Label>Competition Method</Label>
                <select className="w-full border rounded px-2 py-2 text-sm" value={competitionMethod} onChange={(e) => setCompetitionMethod(e.target.value)} data-testid="select-po-competition-method">
                  <option value="">— select —</option>
                  <option value="competed">Competed</option>
                  <option value="sole-source">Sole-Source</option>
                  <option value="small-purchase">Small Purchase</option>
                  <option value="exception">Exception</option>
                </select>
              </div>
            </div>
            {competitionMethod === 'sole-source' && (
              <div>
                <Label>Sole-Source Justification</Label>
                <Textarea rows={2} value={soleSourceJustification} onChange={(e) => setSoleSourceJustification(e.target.value)} data-testid="input-po-sole-source-justification" />
              </div>
            )}
            <Button size="sm" onClick={() => saveBasics.mutate()} disabled={saveBasics.isPending} data-testid="button-save-purchasing-basics">
              {saveBasics.isPending ? 'Saving…' : 'Save'}
            </Button>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">FAR Flowdown Checklist</h3>
            <div>
              <Label>Applicability Reasoning (used when toggling on)</Label>
              <Input value={flowdownReasoning} onChange={(e) => setFlowdownReasoning(e.target.value)} data-testid="input-flowdown-reasoning" />
            </div>
            <div className="border rounded divide-y max-h-60 overflow-y-auto">
              {clauses.map((c: any) => {
                const existing = appliedById.get(c.id);
                const on = !!existing?.applicable;
                return (
                  <div key={c.id} className="p-2 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={on}
                      onCheckedChange={(v) => toggleClause(c.id, !!v)}
                      data-testid={`checkbox-flowdown-${c.id}`}
                    />
                    <div className="flex-1">
                      <div className="font-mono text-xs">{c.clauseNumber}</div>
                      <div>{c.title}</div>
                      {existing?.reasoning && (
                        <div className="text-xs text-gray-500 italic">{existing.reasoning}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Debarment Check Evidence</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Source</Label>
                <select className="w-full border rounded px-2 py-2 text-sm" value={debarmentSource} onChange={(e) => setDebarmentSource(e.target.value as any)} data-testid="select-debarment-source">
                  <option value="manual_attestation">Manual Attestation</option>
                  <option value="sam.gov">SAM.gov</option>
                  <option value="document_upload">Document Upload</option>
                </select>
              </div>
              <div>
                <Label>Result</Label>
                <select className="w-full border rounded px-2 py-2 text-sm" value={debarmentResult} onChange={(e) => setDebarmentResult(e.target.value as any)} data-testid="select-debarment-result">
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="inconclusive">Inconclusive</option>
                </select>
              </div>
            </div>
            <Textarea rows={2} value={debarmentNotes} onChange={(e) => setDebarmentNotes(e.target.value)} placeholder="Notes / evidence reference" data-testid="input-debarment-notes" />
            <Button size="sm" onClick={() => recordDebarment.mutate()} disabled={recordDebarment.isPending || !vendorPo.vendorId} data-testid="button-record-debarment">
              {recordDebarment.isPending ? 'Recording…' : 'Record Debarment Check'}
            </Button>
          </section>

          {!vendorPo.requisitionId && (
            <section className="space-y-2 border-t pt-4">
              <h3 className="font-semibold">Direct-PO Exception (privileged)</h3>
              <p className="text-xs text-gray-600">
                Records an exception when no approved requisition backs this PO. Requires the
                <code className="mx-1 px-1 bg-gray-100 rounded">purchasing.direct_po_exception</code>
                capability. Approver identity is captured from your session.
              </p>
              <Textarea rows={2} value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} placeholder="Reason (≥10 chars) — recorded in audit trail" data-testid="input-direct-po-exception-reason" />
              <Button size="sm" variant="destructive" onClick={() => recordException.mutate()} disabled={recordException.isPending || exceptionReason.trim().length < 10} data-testid="button-direct-po-exception">
                {recordException.isPending ? 'Approving…' : 'Approve Direct-PO Exception'}
              </Button>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

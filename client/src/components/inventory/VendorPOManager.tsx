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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
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
} from 'lucide-react';
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

// Types based on our schema
type VendorPO = {
  id: number;
  poNumber: string;
  vendorId: number;
  vendorName?: string; // From join
  status:
    | 'Draft'
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
};

type CreateVendorPOData = {
  vendorId: number;
  expectedDeliveryDate?: string;
  shipVia?: string;
  notes?: string;
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
    case 'Sent':
      return 'bg-blue-100 text-blue-800';
    case 'Partially Received':
      return 'bg-yellow-100 text-yellow-800';
    case 'Fully Received':
      return 'bg-green-100 text-green-800';
    case 'Cancelled':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Optional Settings Selector Component
function OptionalSettingsSelector({ vendorPoId }: { vendorPoId: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Fetch all available optional settings
  const { data: allSettings = [], isError: allSettingsError } = useQuery<any[]>({
    queryKey: ['/api/vendor-pos/optional-settings'],
    queryFn: () => apiRequest('/api/vendor-pos/optional-settings'),
  });

  // Fetch currently selected optional settings for this PO
  const { data: currentSettings = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ['/api/vendor-pos', vendorPoId, 'optional-settings'],
    queryFn: () => apiRequest(`/api/vendor-pos/${vendorPoId}/optional-settings`),
    enabled: isOpen,
  });

  // Reset and initialize selected IDs when dialog opens and data loads
  useEffect(() => {
    if (isOpen && !isLoading && !isError && currentSettings && currentSettings.length >= 0) {
      // Only set once when data finishes loading
      setSelectedIds(currentSettings.map((s: any) => s.id));
    }
  }, [isOpen, isLoading, isError]);

  // Clear selected IDs when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds([]);
    }
  }, [isOpen]);

  const updateMutation = useMutation({
    mutationFn: async (optionalSettingIds: number[]) => {
      return await apiRequest(`/api/vendor-pos/${vendorPoId}/optional-settings`, {
        method: 'PUT',
        body: JSON.stringify({ optionalSettingIds }),
      });
    },
    onSuccess: () => {
      // Invalidate both the PO's optional settings and the main PO list
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos', vendorPoId, 'optional-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      toast.success('Optional settings updated successfully');
      setIsOpen(false);
    },
    onError: () => {
      toast.error('Failed to update optional settings');
    },
  });

  const handleToggle = (settingId: number) => {
    setSelectedIds((prev) =>
      prev.includes(settingId)
        ? prev.filter((id) => id !== settingId)
        : [...prev, settingId]
    );
  };

  const handleSave = () => {
    // Block save if there was an error loading current settings
    if (isError) {
      toast.error('Cannot save - failed to load current selections. Please retry.');
      return;
    }
    updateMutation.mutate(selectedIds);
  };

  const handleRetry = () => {
    refetch();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-optional-settings-${vendorPoId}`}>
          <FileText className="w-4 h-4 mr-1" />
          Optional Statements
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Select Optional Statements</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-96 overflow-y-auto py-4">
          {allSettingsError ? (
            <div className="text-center py-8 text-red-600">
              <XCircle className="h-12 w-12 mx-auto mb-2" />
              <p>Failed to load available optional statements.</p>
              <p className="text-sm mt-1">Please close the dialog and try again.</p>
            </div>
          ) : isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-red-600">
              <XCircle className="h-12 w-12 mx-auto mb-2" />
              <p>Failed to load this PO's optional settings.</p>
              <Button
                onClick={handleRetry}
                variant="outline"
                size="sm"
                className="mt-4"
                data-testid="button-retry-load"
              >
                Retry
              </Button>
            </div>
          ) : allSettings.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <p>No optional statements available.</p>
              <p className="text-sm mt-1">Create statements in PO Settings first.</p>
            </div>
          ) : (
            allSettings.map((setting) => (
              <div
                key={setting.id}
                className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                data-testid={`optional-setting-item-${setting.id}`}
              >
                <Checkbox
                  id={`setting-${setting.id}`}
                  checked={selectedIds.includes(setting.id)}
                  onCheckedChange={() => handleToggle(setting.id)}
                  data-testid={`checkbox-optional-setting-${setting.id}`}
                />
                <div className="flex-1">
                  <label
                    htmlFor={`setting-${setting.id}`}
                    className="font-medium text-sm cursor-pointer"
                  >
                    {setting.name}
                  </label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {setting.statement}
                  </p>
                </div>
                {selectedIds.includes(setting.id) && (
                  <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
                )}
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} data-testid="button-cancel-optional-settings">
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            data-testid="button-save-optional-settings"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
}: {
  vendorPo: VendorPO;
  onEdit: (vendorPo: VendorPO) => void;
  onDelete: (id: number) => void;
  onViewItems: (vendorPo: VendorPO) => void;
  onIssuePO: (id: number, skipEmail?: boolean) => void;
  onCreateRevision: (vendorPo: VendorPO) => void;
  onViewPDF: (vendorPo: VendorPO) => void;
}) {
  // Check if PO is issued (cannot be directly edited)
  const isIssued = ['Sent', 'Partially Received', 'Fully Received'].includes(vendorPo.status);
  
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
              {vendorPo.poNumber}
            </CardTitle>
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
            View PO
          </Button>
          <OptionalSettingsSelector vendorPoId={vendorPo.id} />
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
  });

  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(
    vendorPo?.expectedDeliveryDate
      ? new Date(vendorPo.expectedDeliveryDate)
      : undefined
  );

  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  // Fetch vendors for the dropdown
  const { data: vendorsResponse } = useQuery<{ data: any[]; meta: any }>({
    queryKey: ['/api/vendors'],
  });
  const vendors = vendorsResponse?.data || [];

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

// Main component
export default function VendorPOManager() {
  const [selectedVendorPO, setSelectedVendorPO] = useState<VendorPO | null>(
    null
  );
  const [showForm, setShowForm] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>('');
  
  // Revision dialog state
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionPO, setRevisionPO] = useState<VendorPO | null>(null);

  const queryClient = useQueryClient();

  // Fetch vendor POs
  const {
    data: vendorPOsResponse,
    isLoading,
    error,
  } = useQuery<{ data: VendorPO[]; meta?: any }>({
    queryKey: ['/api/vendor-pos'],
    queryFn: () => apiRequest('/api/vendor-pos'),
  });

  const vendorPOs = vendorPOsResponse?.data || [];

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
      toast.success(`Revision created: ${data.poNumber}. You can now edit the new draft.`);
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
    mutationFn: ({ id, skipEmail = false }: { id: number; skipEmail?: boolean }) =>
      apiRequest(`/api/vendor-pos/${id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ skipEmail }),
      }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vendor-pos'] });
      if (data.emailSkipped) {
        toast.success('PO marked as issued (no email sent)');
      } else if (data.emailSent) {
        toast.success(`PO issued! Confirmation email sent to ${data.emailRecipient}`);
      } else {
        toast.error(data.message || 'PO issued but email failed to send');
      }
      // Update the selected PO if viewing details
      if (selectedVendorPO) {
        setSelectedVendorPO({ ...selectedVendorPO, status: 'Sent' });
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to issue PO');
    },
  });

  // Filter vendor POs
  const filteredVendorPOs = (vendorPOs || []).filter((vendorPo) => {
    const matchesSearch =
      vendorPo.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendorPo.vendorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      false;
    const matchesStatus =
      statusFilter === 'all' || vendorPo.status === statusFilter;
    return matchesSearch && matchesStatus;
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

  const handleIssuePO = (id: number, skipEmail: boolean = false) => {
    if (skipEmail) {
      if (
        confirm('Are you sure you want to mark this purchase order as issued WITHOUT sending an email to the vendor? This is useful for POs that were already submitted outside of EPOCH.')
      ) {
        issuePOMutation.mutate({ id, skipEmail: true });
      }
    } else {
      if (
        confirm('Are you sure you want to issue this purchase order? This will send a confirmation email to the vendor.')
      ) {
        issuePOMutation.mutate({ id, skipEmail: false });
      }
    }
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
    setPendingStatus(newStatus);
    setShowStatusChangeDialog(true);
  };

  const confirmStatusChange = (skipEmail: boolean = false) => {
    if (selectedVendorPO) {
      // If changing to 'Sent' status, use the issue endpoint which sends the email
      if (pendingStatus === 'Sent') {
        issuePOMutation.mutate({ id: selectedVendorPO.id, skipEmail });
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
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Purchase Order - ${po.poNumber}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; }
              .print-controls { 
                position: fixed; 
                top: 10px; 
                right: 10px; 
                z-index: 1000;
                display: flex;
                gap: 10px;
              }
              .print-btn {
                background-color: #2563eb;
                color: white;
                border: none;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .print-btn:hover {
                background-color: #1d4ed8;
              }
              .company-header { margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #333; }
              .company-header h1 { margin: 0 0 10px 0; font-size: 26px; color: #333; }
              .company-header p { margin: 3px 0; color: #555; font-size: 13px; }
              .header { text-align: center; margin-bottom: 30px; }
              .header h1 { margin: 0; font-size: 24px; }
              .info-section { margin-bottom: 20px; }
              .info-row { display: flex; margin-bottom: 8px; }
              .info-label { font-weight: bold; width: 200px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
              th { background-color: #f2f2f2; font-weight: bold; }
              .totals { text-align: right; margin-top: 20px; }
              .total-line { font-size: 18px; font-weight: bold; }
              @media print {
                body { padding: 20px; }
                .print-controls { display: none !important; }
              }
            </style>
          </head>
          <body>
            <div class="print-controls">
              <button class="print-btn" onclick="window.print()">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Print PO
              </button>
            </div>
            ${settings?.companyName || settings?.companyAddress || settings?.companyPhone || settings?.companyEmail ? `
              <div class="company-header">
                ${settings.companyName ? `<h1>${settings.companyName}</h1>` : ''}
                ${settings.companyAddress ? `<p style="white-space: pre-wrap;">${settings.companyAddress}</p>` : ''}
                ${settings.companyPhone || settings.companyEmail ? `
                  <p>
                    ${settings.companyPhone ? settings.companyPhone : ''}
                    ${settings.companyPhone && settings.companyEmail ? ' | ' : ''}
                    ${settings.companyEmail ? settings.companyEmail : ''}
                  </p>
                ` : ''}
                ${settings.companyWebsite ? `<p>${settings.companyWebsite}</p>` : ''}
              </div>
            ` : ''}
            
            ${settings?.contactName || settings?.contactTitle || settings?.contactPhone || settings?.contactEmail ? `
              <div style="margin-bottom: 30px; padding: 15px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;">
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #555;">Purchasing Contact:</div>
                ${settings.contactName ? `<div style="font-size: 13px; margin-bottom: 3px;"><strong>${settings.contactName}</strong>${settings.contactTitle ? `, ${settings.contactTitle}` : ''}</div>` : ''}
                ${settings.contactPhone || settings.contactEmail ? `
                  <div style="font-size: 13px; color: #666;">
                    ${settings.contactPhone ? settings.contactPhone : ''}
                    ${settings.contactPhone && settings.contactEmail ? ' | ' : ''}
                    ${settings.contactEmail ? settings.contactEmail : ''}
                  </div>
                ` : ''}
              </div>
            ` : ''}
            
            <div class="header">
              <h1>PURCHASE ORDER</h1>
              <p>PO Number: ${po.poNumber.replace('VPO-', '').replace(/-R[A-Z0-9]+$/, '')}</p>
            </div>
            
            <div class="info-section">
              <div class="info-row">
                <div class="info-label">Vendor:</div>
                <div>${po.vendorName || `ID: ${po.vendorId}`}</div>
              </div>
              <div class="info-row">
                <div class="info-label">Status:</div>
                <div>${po.status}</div>
              </div>
              <div class="info-row">
                <div class="info-label">Requested Delivery Date:</div>
                <div>${po.expectedDeliveryDate || 'N/A'}</div>
              </div>
              <div class="info-row">
                <div class="info-label">Ship Via:</div>
                <div>${po.shipVia || 'N/A'}</div>
              </div>
              <div class="info-row">
                <div class="info-label">Barcode:</div>
                <div>${po.barcode}</div>
              </div>
            </div>
            
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Supplier Part#</th>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Price</th>
                  <th>Line Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(item => `
                  <tr>
                    <td>${item.lineNumber}</td>
                    <td>${item.supplierPartNumber || '-'}</td>
                    <td>${item.description || '-'}${item.purchaseQty != null && item.purchaseQty > 0 && item.purchaseUnit ? `<br/><small style="color: #666;">(${Number(item.purchaseQty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${item.purchaseUnit} ordered)</small>` : ''}</td>
                    <td>${item.quantity != null ? Number(item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</td>
                    <td>${item.vendorUnit || item.uom || '-'}</td>
                    <td>$${item.unitPrice != null ? Number(item.unitPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</td>
                    <td>$${((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="totals">
              <div class="total-line">
                Total: $${items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            
            ${po.notes ? `
              <div style="margin-top: 30px;">
                <div style="font-weight: bold;">Notes:</div>
                <div>${po.notes}</div>
              </div>
            ` : ''}
            
            ${settings?.termsAndConditions || settings?.paymentTerms || settings?.shippingInstructions || optionalSettings.length > 0 ? `
              <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd;">
                ${settings?.paymentTerms ? `
                  <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; font-size: 14px;">Payment Terms:</div>
                    <div style="white-space: pre-wrap; margin-top: 5px;">${settings.paymentTerms}</div>
                  </div>
                ` : ''}
                
                ${settings?.shippingInstructions ? `
                  <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; font-size: 14px;">Shipping Instructions:</div>
                    <div style="white-space: pre-wrap; margin-top: 5px;">${settings.shippingInstructions}</div>
                  </div>
                ` : ''}
                
                ${settings?.termsAndConditions ? `
                  <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; font-size: 14px;">Terms and Conditions:</div>
                    <div style="white-space: pre-wrap; margin-top: 5px;">${settings.termsAndConditions}</div>
                  </div>
                ` : ''}
                
                ${optionalSettings.length > 0 ? `
                  <div style="margin-bottom: 15px;">
                    <div style="font-weight: bold; font-size: 14px;">Additional Requirements:</div>
                    ${optionalSettings.map((setting, index) => `
                      <div style="margin-top: 10px; padding-left: 10px;">
                        <div style="font-weight: bold; font-size: 12px;">${index + 1}. ${setting.name}</div>
                        <div style="white-space: pre-wrap; margin-top: 5px; font-size: 12px;">${setting.statement}</div>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </body>
        </html>
      `;
      
      console.log('Writing HTML to popup window...');
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      console.log('HTML written successfully');
      
      // Window stays open for viewing - user can print if they want
      toast.success('Purchase Order opened in new window');
      
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

  const statusOptions = [
    'all',
    'Draft',
    'Sent',
    'Partially Received',
    'Fully Received',
    'Cancelled',
  ];

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
                  {selectedVendorPO.poNumber}
                </h2>
                <p className="text-muted-foreground">
                  {selectedVendorPO.vendorName ||
                    `Vendor ID: ${selectedVendorPO.vendorId}`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={getStatusColor(selectedVendorPO.status)}
              data-testid="detail-status"
            >
              {selectedVendorPO.status}
            </Badge>
            
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
            
            {/* Cancel Button (only for Draft or Sent) */}
            {(selectedVendorPO.status === 'Draft' || selectedVendorPO.status === 'Sent') && (
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
            
            {/* PDF Download Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownloadPDF()}
              data-testid="button-view-po"
            >
              <Eye className="w-4 h-4 mr-2" />
              View PO
            </Button>
          </div>
        </div>

        {/* Status Change Confirmation Dialog */}
        <AlertDialog open={showStatusChangeDialog} onOpenChange={setShowStatusChangeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to change the status of this purchase order from{' '}
                <strong>{selectedVendorPO.status}</strong> to <strong>{pendingStatus}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className={pendingStatus === 'Sent' ? 'flex-col sm:flex-row gap-2' : ''}>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              {pendingStatus === 'Sent' && (
                <Button
                  variant="outline"
                  onClick={() => confirmStatusChange(true)}
                  data-testid="button-issue-no-email"
                >
                  Mark as Issued (No Email)
                </Button>
              )}
              <AlertDialogAction onClick={() => confirmStatusChange(false)} data-testid="button-confirm-status-change">
                {pendingStatus === 'Sent' ? 'Issue & Send Email' : 'Confirm'}
              </AlertDialogAction>
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
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <VendorPOItemSelector
              vendorPoId={selectedVendorPO.id}
              vendorId={selectedVendorPO.vendorId}
              poNumber={selectedVendorPO.poNumber}
              onTotalChange={(total: number) => {
                queryClient.invalidateQueries({
                  queryKey: ['/api/vendor-pos'],
                });
              }}
            />
          </TabsContent>
        </Tabs>
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

      {/* Filters */}
      <div className="flex gap-4 items-center">
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status === 'all' ? 'All Statuses' : status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                      <div className="font-semibold">{vendorPo.poNumber}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {vendorPo.vendorName || 'Unknown Vendor'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getStatusColor(vendorPo.status)}>
                      {vendorPo.status}
                    </Badge>
                    {vendorPo.isCurrentRevision === false && (
                      <Badge className="bg-gray-200 text-gray-600 text-xs">
                        Superseded
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
              Create Revision for {revisionPO?.poNumber}
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
    </div>
  );
}

import { useState } from 'react';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Package,
  Search,
  Filter,
  MoreVertical,
  MapPin,
  GitBranch,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  History,
  Loader2,
  Printer,
  ArrowRightLeft,
  Scissors,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import JsBarcode from 'jsbarcode';

interface MaterialLot {
  id: string;
  internalControlNumber: string;
  materialPartNumber: string;
  materialName: string;
  supplier: string;
  supplierLotNumber?: string;
  supplierPartNumber?: string;
  purchaseOrderNumber?: string;
  receivedQty: string;
  remainingQty: string;
  unitOfMeasure: string;
  expirationDate?: string;
  cureDate?: string;
  manufactureDate?: string;
  storageLocation?: string;
  storageRequirements?: string;
  status: string;
  maxOutTimeMinutes?: number;
  totalOutTimeMinutes?: number;
  currentlyOutOfStorage?: boolean;
  lastOutAt?: string;
  parentLotId?: string;
  receivedBy?: string;
  receivedAt?: string;
  acceptedBy?: string;
  acceptedAt?: string;
}

interface Transaction {
  id: string;
  materialLotId: string;
  internalControlNumber: string;
  transactionType: string;
  qtyBefore?: string;
  qtyChange?: string;
  qtyAfter?: string;
  fromLocation?: string;
  toLocation?: string;
  performedBy: string;
  performedAt: string;
  reason?: string;
  notes?: string;
}

function buildScrapSchema(remainingQty: number) {
  return z.object({
    qty: z
      .number({ invalid_type_error: 'Quantity must be a number' })
      .positive('Quantity must be greater than 0')
      .max(remainingQty, `Quantity cannot exceed remaining quantity (${remainingQty})`),
    reason: z.string().trim().min(1, 'Reason is required'),
    performedBy: z.string().trim().min(1, 'Performed by is required'),
  });
}

export default function MaterialInventoryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLot, setSelectedLot] = useState<MaterialLot | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'move' | 'split' | 'status' | 'scrap' | 'return' | 'adjust' | null>(null);
  const [moveLocation, setMoveLocation] = useState('');
  const [splitQty, setSplitQty] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [scrapQty, setScrapQty] = useState('');
  const [scrapReason, setScrapReason] = useState('');
  const [scrapPerformedBy, setScrapPerformedBy] = useState('');
  const [returnQty, setReturnQty] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnPerformedBy, setReturnPerformedBy] = useState('');
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReasonCode, setAdjustReasonCode] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustPerformedBy, setAdjustPerformedBy] = useState('');
  const [adjustAllowNegative, setAdjustAllowNegative] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery<{ id: number; username: string; firstName?: string; lastName?: string; role: string }>({
    queryKey: ['/api/auth/session'],
  });

  const { data: lots = [], isLoading } = useQuery<MaterialLot[]>({
    queryKey: ['/api/material-lots'],
  });

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery<Transaction[]>({
    queryKey: ['/api/material-lots', selectedLot?.id, 'transactions'],
    enabled: !!selectedLot && historyDialogOpen,
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, toLocation }: { id: string; toLocation: string }) => {
      return apiRequest(`/api/material-lots/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ toLocation, performedBy: 'Current User' }),
      });
    },
    onSuccess: () => {
      toast.success('Material moved successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      closeActionDialog();
    },
    onError: (error: any) => {
      const msg = error.responseData?.code || error.responseData?.error || error.message || 'Failed to move material';
      toast.error(msg);
    },
  });

  const splitMutation = useMutation({
    mutationFn: async ({ id, splitQty }: { id: string; splitQty: string }) => {
      return apiRequest(`/api/material-lots/${id}/split`, {
        method: 'POST',
        body: JSON.stringify({ splitQty, performedBy: 'Current User' }),
      });
    },
    onSuccess: (result: any) => {
      toast.success(`Lot split successfully. New lot: ${result.childLot.internalControlNumber}`);
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      closeActionDialog();
    },
    onError: (error: any) => {
      const msg = error.responseData?.code || error.responseData?.error || error.message || 'Failed to split lot';
      toast.error(msg);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, newStatus, reason }: { id: string; newStatus: string; reason: string }) => {
      return apiRequest(`/api/material-lots/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ newStatus, performedBy: 'Current User', reason }),
      });
    },
    onSuccess: () => {
      toast.success('Status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      closeActionDialog();
    },
    onError: (error: any) => {
      const msg = error.responseData?.code || error.responseData?.error || error.message || 'Failed to update status';
      toast.error(msg);
    },
  });

  const issueMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/material-lots/${id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ performedBy: 'Current User' }),
      });
    },
    onSuccess: () => {
      toast.success('Material issued from storage');
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
    },
    onError: (error: any) => {
      const msg = error.responseData?.code || error.responseData?.error || error.message || 'Failed to issue material';
      toast.error(msg);
    },
  });

  const returnMutation = useMutation({
    mutationFn: async ({ id, qty, reason, performedBy }: { id: string; qty: number; reason: string; performedBy: string }) => {
      return apiRequest(`/api/material-lots/${id}/return`, {
        method: 'POST',
        body: JSON.stringify({ qty, reason, performedBy }),
      });
    },
    onSuccess: () => {
      toast.success('Material returned to storage');
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      closeActionDialog();
    },
    onError: (error: any) => {
      const msg = error.responseData?.message || error.responseData?.error || error.message || 'Failed to return material';
      toast.error(msg);
    },
  });

  const scrapMutation = useMutation({
    mutationFn: async ({ id, qty, reason, performedBy }: { id: string; qty: number; reason: string; performedBy: string }) => {
      return apiRequest(`/api/material-lots/${id}/scrap`, {
        method: 'POST',
        body: JSON.stringify({ qty, reason, performedBy }),
      });
    },
    onSuccess: () => {
      toast.success('Lot scrapped successfully');
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      closeActionDialog();
    },
    onError: (error: any) => {
      const msg = error.responseData?.code || error.responseData?.error || error.message || 'Failed to scrap lot';
      toast.error(msg);
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ id, delta, reasonCode, notes, performedBy, allowNegative }: {
      id: string;
      delta: number;
      reasonCode: string;
      notes?: string;
      performedBy: string;
      allowNegative: boolean;
    }) => {
      return apiRequest(`/api/material-lots/${id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ delta, reasonCode, notes, performedBy, allowNegative }),
      });
    },
    onSuccess: (result: any) => {
      const newQty = result?.lot?.remainingQty ?? result?.remainingQty;
      const qtyMsg = newQty != null ? ` New quantity: ${newQty}` : '';
      toast.success(`Quantity adjusted successfully.${qtyMsg}`);
      queryClient.invalidateQueries({ queryKey: ['/api/material-lots'] });
      closeActionDialog();
    },
    onError: (error: any) => {
      const msg = error.responseData?.message || error.responseData?.error || error.message || 'Failed to adjust quantity';
      toast.error(msg);
    },
  });

  const closeActionDialog = () => {
    setActionDialogOpen(false);
    setActionType(null);
    setSelectedLot(null);
    setMoveLocation('');
    setSplitQty('');
    setNewStatus('');
    setStatusReason('');
    setScrapQty('');
    setScrapReason('');
    setScrapPerformedBy('');
    setReturnQty('');
    setReturnReason('');
    setReturnPerformedBy('');
    setAdjustDelta('');
    setAdjustReasonCode('');
    setAdjustNotes('');
    setAdjustPerformedBy('');
    setAdjustAllowNegative(false);
  };

  const openActionDialog = (lot: MaterialLot, type: 'move' | 'split' | 'status' | 'scrap' | 'return' | 'adjust') => {
    setSelectedLot(lot);
    setActionType(type);
    const displayName = currentUser
      ? ([currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.username)
      : '';
    if (type === 'scrap') {
      setScrapPerformedBy(displayName);
    }
    if (type === 'return') {
      setReturnQty(lot.remainingQty);
      setReturnPerformedBy(displayName);
    }
    if (type === 'adjust') {
      setAdjustPerformedBy(displayName);
    }
    setActionDialogOpen(true);
  };

  const openHistoryDialog = (lot: MaterialLot) => {
    setSelectedLot(lot);
    setHistoryDialogOpen(true);
  };

  const handleActionSubmit = () => {
    if (!selectedLot) return;

    if (actionType === 'move' && moveLocation) {
      moveMutation.mutate({ id: selectedLot.id, toLocation: moveLocation });
    } else if (actionType === 'split' && splitQty) {
      splitMutation.mutate({ id: selectedLot.id, splitQty });
    } else if (actionType === 'status' && newStatus) {
      statusMutation.mutate({ id: selectedLot.id, newStatus, reason: statusReason });
    } else if (actionType === 'scrap') {
      const remaining = parseFloat(selectedLot.remainingQty);
      const schema = buildScrapSchema(remaining);
      const parsed = schema.safeParse({
        qty: scrapQty === '' ? undefined : Number(scrapQty),
        reason: scrapReason,
        performedBy: scrapPerformedBy,
      });
      if (!parsed.success) {
        toast.error(parsed.error.errors[0].message);
        return;
      }
      scrapMutation.mutate({
        id: selectedLot.id,
        qty: parsed.data.qty,
        reason: parsed.data.reason,
        performedBy: parsed.data.performedBy,
      });
    } else if (actionType === 'return') {
      const remaining = parseFloat(selectedLot.remainingQty);
      const returnSchema = z.object({
        qty: z
          .number({ invalid_type_error: 'Quantity must be a number' })
          .positive('Quantity must be greater than 0')
          .max(remaining, `Quantity cannot exceed remaining quantity (${remaining})`),
        reason: z.string().trim().min(1, 'Reason is required'),
        performedBy: z.string().trim().min(1, 'Performed by is required'),
      });
      const parsed = returnSchema.safeParse({
        qty: returnQty === '' ? undefined : Number(returnQty),
        reason: returnReason,
        performedBy: returnPerformedBy,
      });
      if (!parsed.success) {
        toast.error(parsed.error.errors[0].message);
        return;
      }
      returnMutation.mutate({
        id: selectedLot.id,
        qty: parsed.data.qty,
        reason: parsed.data.reason,
        performedBy: parsed.data.performedBy,
      });
    } else if (actionType === 'adjust') {
      const adjustSchema = z.object({
        delta: z
          .number({ invalid_type_error: 'Delta must be a number' })
          .refine((v) => v !== 0, { message: 'Delta must be non-zero' }),
        reasonCode: z.string().trim().min(1, 'Reason code is required'),
        notes: z.string().optional(),
        performedBy: z.string().trim().min(1, 'Performed by is required'),
      });
      const parsed = adjustSchema.safeParse({
        delta: adjustDelta === '' ? undefined : Number(adjustDelta),
        reasonCode: adjustReasonCode,
        notes: adjustNotes || undefined,
        performedBy: adjustPerformedBy,
      });
      if (!parsed.success) {
        toast.error(parsed.error.errors[0].message);
        return;
      }
      adjustMutation.mutate({
        id: selectedLot.id,
        delta: parsed.data.delta,
        reasonCode: parsed.data.reasonCode,
        notes: parsed.data.notes,
        performedBy: parsed.data.performedBy,
        allowNegative: adjustAllowNegative,
      });
    }
  };

  const printLabel = (lot: MaterialLot) => {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, lot.internalControlNumber, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 12,
    });
    const barcodeDataUrl = canvas.toDataURL('image/png');
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print labels');
      return;
    }

    const labelHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Material Label - ${lot.internalControlNumber}</title>
        <style>
          @page { size: 4in 2in; margin: 0.1in; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 8px; font-size: 10px; }
          .label-container { border: 1px solid #000; padding: 8px; max-width: 3.8in; }
          .icn-header { font-size: 14px; font-weight: bold; text-align: center; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 4px; }
          .barcode-container { text-align: center; margin: 8px 0; }
          .barcode-container img { max-width: 100%; height: auto; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
          .info-row { display: flex; gap: 4px; }
          .info-label { font-weight: bold; min-width: 60px; }
          .info-value { flex: 1; }
          .full-width { grid-column: 1 / -1; }
        </style>
      </head>
      <body>
        <div class="label-container">
          <div class="icn-header">${lot.internalControlNumber}</div>
          <div class="barcode-container"><img src="${barcodeDataUrl}" alt="Barcode" /></div>
          <div class="info-grid">
            <div class="info-row full-width"><span class="info-label">Part #:</span><span class="info-value">${lot.materialPartNumber}</span></div>
            <div class="info-row full-width"><span class="info-label">Name:</span><span class="info-value">${lot.materialName}</span></div>
            <div class="info-row"><span class="info-label">Qty:</span><span class="info-value">${lot.remainingQty} ${lot.unitOfMeasure}</span></div>
            <div class="info-row"><span class="info-label">Location:</span><span class="info-value">${lot.storageLocation || 'TBD'}</span></div>
          </div>
        </div>
        <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; };</script>
      </body>
      </html>
    `;
    printWindow.document.write(labelHtml);
    printWindow.document.close();
  };

  const filteredLots = lots.filter((lot) => {
    const matchesSearch =
      searchQuery === '' ||
      lot.internalControlNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.materialPartNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lot.supplier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lot.supplierLotNumber?.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || lot.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: any }> = {
      RECEIVED: { variant: 'secondary', label: 'Received', icon: Package },
      QUARANTINE: { variant: 'outline', label: 'Quarantine', icon: Pause },
      ACCEPTED: { variant: 'default', label: 'Accepted', icon: CheckCircle },
      ISSUED: { variant: 'default', label: 'Issued', icon: Play },
      REJECTED: { variant: 'destructive', label: 'Rejected', icon: XCircle },
      EXPIRED: { variant: 'destructive', label: 'Expired', icon: AlertTriangle },
      CONSUMED: { variant: 'secondary', label: 'Consumed', icon: CheckCircle },
      SCRAPPED: { variant: 'destructive', label: 'Scrapped', icon: Trash2 },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status, icon: Package };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getValidStatusTransitions = (currentStatus: string): string[] => {
    const transitions: Record<string, string[]> = {
      RECEIVED: ['QUARANTINE', 'ACCEPTED', 'REJECTED'],
      QUARANTINE: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['ISSUED', 'QUARANTINE', 'REJECTED'],
      ISSUED: ['ACCEPTED', 'CONSUMED', 'QUARANTINE'],
    };
    return transitions[currentStatus] || [];
  };

  const isExpiringSoon = (lot: MaterialLot): boolean => {
    if (!lot.expirationDate) return false;
    const expDate = new Date(lot.expirationDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  };

  const isExpired = (lot: MaterialLot): boolean => {
    if (!lot.expirationDate) return false;
    return new Date(lot.expirationDate) < new Date();
  };

  const isOutTimeCritical = (lot: MaterialLot): boolean => {
    if (!lot.maxOutTimeMinutes || !lot.totalOutTimeMinutes) return false;
    const percentUsed = (lot.totalOutTimeMinutes / lot.maxOutTimeMinutes) * 100;
    return percentUsed >= 80;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8" />
            Material Inventory
          </h1>
          <p className="text-muted-foreground">
            View and manage material lots with full traceability
          </p>
        </div>
        <Button onClick={() => window.location.href = '/material-receiving'} data-testid="button-receive-new">
          Receive New Material
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ICN, part number, name, supplier, or lot number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="RECEIVED">Received</SelectItem>
                <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="ISSUED">Issued</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="CONSUMED">Consumed</SelectItem>
                <SelectItem value="SCRAPPED">Scrapped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLots.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery || statusFilter !== 'all'
                ? 'No materials match your search criteria'
                : 'No materials in inventory. Click "Receive New Material" to add materials.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ICN</TableHead>
                    <TableHead>Part Number</TableHead>
                    <TableHead>Material Name</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Alerts</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLots.map((lot) => (
                    <TableRow key={lot.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{lot.internalControlNumber}</TableCell>
                      <TableCell>{lot.materialPartNumber}</TableCell>
                      <TableCell>{lot.materialName}</TableCell>
                      <TableCell>{lot.supplier}</TableCell>
                      <TableCell>
                        {lot.remainingQty} / {lot.receivedQty} {lot.unitOfMeasure}
                      </TableCell>
                      <TableCell>{lot.storageLocation || '-'}</TableCell>
                      <TableCell>{getStatusBadge(lot.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isExpired(lot) && (
                            <Badge variant="destructive" className="text-xs">Expired</Badge>
                          )}
                          {isExpiringSoon(lot) && !isExpired(lot) && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">Expiring Soon</Badge>
                          )}
                          {isOutTimeCritical(lot) && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
                              <Clock className="h-3 w-3 mr-1" />
                              Out-Time
                            </Badge>
                          )}
                          {lot.currentlyOutOfStorage && (
                            <Badge variant="secondary" className="text-xs">Out</Badge>
                          )}
                          {lot.parentLotId && (
                            <Badge variant="outline" className="text-xs">
                              <GitBranch className="h-3 w-3 mr-1" />
                              Split
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" data-testid={`button-actions-${lot.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openHistoryDialog(lot)}>
                              <History className="h-4 w-4 mr-2" />
                              View History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => printLabel(lot)}>
                              <Printer className="h-4 w-4 mr-2" />
                              Print Label
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openActionDialog(lot, 'move')}>
                              <MapPin className="h-4 w-4 mr-2" />
                              Move Location
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openActionDialog(lot, 'split')}
                              disabled={parseFloat(lot.remainingQty) <= 0}
                            >
                              <Scissors className="h-4 w-4 mr-2" />
                              Split Lot
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openActionDialog(lot, 'status')}>
                              <ArrowRightLeft className="h-4 w-4 mr-2" />
                              Change Status
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openActionDialog(lot, 'adjust')}
                              disabled={['SCRAPPED', 'CONSUMED', 'REJECTED'].includes(lot.status)}
                            >
                              <SlidersHorizontal className="h-4 w-4 mr-2" />
                              Adjust Quantity
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openActionDialog(lot, 'scrap')}
                              disabled={lot.status === 'SCRAPPED' || Number(lot.remainingQty) <= 0}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Scrap Lot
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {lot.status === 'ACCEPTED' && !lot.currentlyOutOfStorage && (
                              <DropdownMenuItem onClick={() => issueMutation.mutate(lot.id)}>
                                <Play className="h-4 w-4 mr-2" />
                                Issue from Storage
                              </DropdownMenuItem>
                            )}
                            {lot.currentlyOutOfStorage && (
                              <DropdownMenuItem
                                onClick={() => openActionDialog(lot, 'return')}
                                disabled={returnMutation.isPending}
                              >
                                <Pause className="h-4 w-4 mr-2" />
                                Return to Storage
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionDialogOpen} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'move' && 'Move Material'}
              {actionType === 'split' && 'Split Lot'}
              {actionType === 'status' && 'Change Status'}
              {actionType === 'scrap' && 'Scrap Lot'}
              {actionType === 'return' && 'Return to Storage'}
              {actionType === 'adjust' && 'Adjust Quantity'}
            </DialogTitle>
            <DialogDescription>
              {selectedLot?.internalControlNumber} - {selectedLot?.materialName}
            </DialogDescription>
          </DialogHeader>

          {actionType === 'move' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Current Location</Label>
                <Input value={selectedLot?.storageLocation || 'Not set'} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newLocation">New Location</Label>
                <Input
                  id="newLocation"
                  value={moveLocation}
                  onChange={(e) => setMoveLocation(e.target.value)}
                  placeholder="e.g., Shelf-B2, Freezer-A"
                  data-testid="input-new-location"
                />
              </div>
            </div>
          )}

          {actionType === 'split' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Current Quantity</Label>
                <Input value={`${selectedLot?.remainingQty} ${selectedLot?.unitOfMeasure}`} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="splitQty">Split Quantity</Label>
                <Input
                  id="splitQty"
                  type="number"
                  step="0.001"
                  value={splitQty}
                  onChange={(e) => setSplitQty(e.target.value)}
                  placeholder="Quantity to split off"
                  data-testid="input-split-qty"
                />
                <p className="text-xs text-muted-foreground">
                  A new lot will be created with the split quantity and a new ICN
                </p>
              </div>
            </div>
          )}

          {actionType === 'status' && selectedLot && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Current Status</Label>
                <div>{getStatusBadge(selectedLot.status)}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newStatus">New Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger data-testid="select-new-status">
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent>
                    {getValidStatusTransitions(selectedLot.status).map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="statusReason">Reason</Label>
                <Input
                  id="statusReason"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Reason for status change"
                  data-testid="input-status-reason"
                />
              </div>
            </div>
          )}

          {actionType === 'return' && selectedLot && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="returnQty">Quantity to Return</Label>
                <Input
                  id="returnQty"
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={Number(selectedLot.remainingQty)}
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  placeholder="Quantity to return"
                  data-testid="input-return-qty"
                />
                <p className="text-xs text-muted-foreground">
                  Remaining: {selectedLot.remainingQty} {selectedLot.unitOfMeasure}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="returnReason">Reason <span className="text-destructive">*</span></Label>
                <Input
                  id="returnReason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Reason for return (e.g. unused, job complete)"
                  data-testid="input-return-reason"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="returnPerformedBy">Performed By <span className="text-destructive">*</span></Label>
                <Input
                  id="returnPerformedBy"
                  value={returnPerformedBy}
                  onChange={(e) => setReturnPerformedBy(e.target.value)}
                  placeholder="Name of person performing return"
                  data-testid="input-return-performed-by"
                />
              </div>
            </div>
          )}

          {actionType === 'scrap' && selectedLot && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="scrapQty">Quantity to Scrap</Label>
                <Input
                  id="scrapQty"
                  type="number"
                  step="0.001"
                  min="0.001"
                  max={Number(selectedLot.remainingQty)}
                  value={scrapQty}
                  onChange={(e) => setScrapQty(e.target.value)}
                  placeholder="Quantity to scrap"
                  data-testid="input-scrap-qty"
                />
                <p className="text-xs text-muted-foreground">
                  Remaining: {selectedLot.remainingQty} {selectedLot.unitOfMeasure}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scrapReason">Reason <span className="text-destructive">*</span></Label>
                <Input
                  id="scrapReason"
                  value={scrapReason}
                  onChange={(e) => setScrapReason(e.target.value)}
                  placeholder="Reason for scrapping (e.g. damaged, contaminated)"
                  data-testid="input-scrap-reason"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scrapPerformedBy">Performed By <span className="text-destructive">*</span></Label>
                <Input
                  id="scrapPerformedBy"
                  value={scrapPerformedBy}
                  onChange={(e) => setScrapPerformedBy(e.target.value)}
                  placeholder="Name of person performing scrap"
                  data-testid="input-scrap-performed-by"
                />
              </div>
            </div>
          )}

          {actionType === 'adjust' && selectedLot && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="adjustDelta">
                  Quantity Delta <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="adjustDelta"
                  type="number"
                  step="0.001"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  placeholder="Positive = found/added, negative = removed/corrected"
                  data-testid="input-adjust-delta"
                />
                <p className="text-xs text-muted-foreground">
                  Current remaining: {selectedLot.remainingQty} {selectedLot.unitOfMeasure}. Enter a positive number to increase or a negative number to decrease.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustReasonCode">
                  Reason Code <span className="text-destructive">*</span>
                </Label>
                <Select value={adjustReasonCode} onValueChange={setAdjustReasonCode}>
                  <SelectTrigger data-testid="select-adjust-reason-code">
                    <SelectValue placeholder="Select a reason code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cycle Count Correction">Cycle Count Correction</SelectItem>
                    <SelectItem value="Admin Correction">Admin Correction</SelectItem>
                    <SelectItem value="Found / Lost Material">Found / Lost Material</SelectItem>
                    <SelectItem value="Data Repair">Data Repair</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustNotes">Notes</Label>
                <Textarea
                  id="adjustNotes"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Optional additional notes"
                  data-testid="input-adjust-notes"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustPerformedBy">
                  Performed By <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="adjustPerformedBy"
                  value={adjustPerformedBy}
                  onChange={(e) => setAdjustPerformedBy(e.target.value)}
                  placeholder="Name of person performing adjustment"
                  data-testid="input-adjust-performed-by"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="adjustAllowNegative"
                  checked={adjustAllowNegative}
                  onCheckedChange={(checked) => setAdjustAllowNegative(checked === true)}
                  data-testid="checkbox-adjust-allow-negative"
                />
                <Label htmlFor="adjustAllowNegative" className="cursor-pointer font-normal">
                  Allow negative balance (admin override)
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeActionDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleActionSubmit}
              disabled={
                moveMutation.isPending ||
                splitMutation.isPending ||
                statusMutation.isPending ||
                scrapMutation.isPending ||
                returnMutation.isPending ||
                adjustMutation.isPending
              }
              variant={actionType === 'scrap' ? 'destructive' : 'default'}
              data-testid="button-confirm-action"
            >
              {(moveMutation.isPending || splitMutation.isPending || statusMutation.isPending || scrapMutation.isPending || returnMutation.isPending || adjustMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {actionType === 'scrap' ? 'Scrap Lot' : actionType === 'return' ? 'Return to Storage' : actionType === 'adjust' ? 'Apply Adjustment' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Transaction History</DialogTitle>
            <DialogDescription>
              {selectedLot?.internalControlNumber} - {selectedLot?.materialName}
            </DialogDescription>
          </DialogHeader>
          {!loadingTransactions && transactions.filter(tx => tx.transactionType === 'RETURN').length > 0 && (
            <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                Returns ({transactions.filter(tx => tx.transactionType === 'RETURN').length})
              </p>
              <div className="space-y-1">
                {transactions
                  .filter(tx => tx.transactionType === 'RETURN')
                  .map(tx => (
                    <div key={tx.id} className="text-sm text-blue-700 dark:text-blue-400 flex flex-wrap gap-x-4 gap-y-0.5">
                      <span className="font-medium">{format(new Date(tx.performedAt), 'MM/dd/yyyy HH:mm')}</span>
                      {tx.qtyChange && (
                        <span>
                          Qty: <span className="font-medium text-green-700 dark:text-green-400">+{Math.abs(parseFloat(tx.qtyChange))}</span>
                        </span>
                      )}
                      <span>By: <span className="font-medium">{tx.performedBy}</span></span>
                      {(tx.reason || tx.notes) && (
                        <span className="italic">{tx.reason || tx.notes}</span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
          <div className="max-h-[360px] overflow-y-auto">
            {loadingTransactions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No transactions recorded</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Qty Change</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Performed By</TableHead>
                    <TableHead>Notes / Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className={tx.transactionType === 'RETURN' ? 'bg-blue-50 dark:bg-blue-950/20' : undefined}
                    >
                      <TableCell className="text-sm">
                        {format(new Date(tx.performedAt), 'MM/dd/yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {tx.transactionType === 'RETURN' ? (
                          <Badge className="bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700">
                            RETURN
                          </Badge>
                        ) : (
                          <Badge variant="outline">{tx.transactionType}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.qtyChange && (
                          <span className={parseFloat(tx.qtyChange) < 0 ? 'text-red-600' : 'text-green-600'}>
                            {parseFloat(tx.qtyChange) > 0 ? '+' : ''}{tx.qtyChange}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tx.fromLocation && tx.toLocation
                          ? `${tx.fromLocation} → ${tx.toLocation}`
                          : tx.toLocation || tx.fromLocation || '-'}
                      </TableCell>
                      <TableCell>{tx.performedBy}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {tx.notes || tx.reason || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setHistoryDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

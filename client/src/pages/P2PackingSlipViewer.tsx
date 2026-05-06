import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link, useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Printer, Download, ArrowLeft, Package, Clock, Pencil, X, Check, Loader2, Receipt, ClipboardList, ExternalLink, AlertTriangle, History, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { COMPANY_INFO } from '@shared/company-config';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface PackingSlipLineItem {
  partNumber: string;
  partName: string;
  quantity: number;
  serialNumbers?: string | string[];
}

interface PackingSlipData {
  id: string;
  packingSlipNumber: string;
  lotNumberId?: string;
  lotNumber?: string;
  customerId: string;
  customerName: string;
  customerAddress?: string;
  poNumber?: string;
  invoiceNumber?: string;
  shipDate?: string;
  shipmentNumber?: string;
  carrier?: string;
  trackingNumber?: string;
  lineItems: PackingSlipLineItem[];
  totalQuantity: number;
  packedBy?: string;
  packedBySignature?: string;
  verifiedBy?: string;
  verifiedBySignature?: string;
  status: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  reason: string | null;
  changed_at: string;
}

interface CurrentUser {
  id: number;
  username: string;
  role: string;
}

export default function P2PackingSlipViewer() {
  const [match, params] = useRoute('/p2/packing-slip/:id');
  const packingSlipId = params?.id;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const [editMode, setEditMode] = useState(false);
  const [editSlipNumber, setEditSlipNumber] = useState('');
  const [editShipDate, setEditShipDate] = useState('');
  const [editLotNumber, setEditLotNumber] = useState('');
  const [editReason, setEditReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: currentUser } = useQuery<CurrentUser | null>({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'include' });
        if (res.ok) return res.json();
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const canEdit = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';

  const { data: packingSlip, isLoading, error } = useQuery<PackingSlipData>({
    queryKey: ['/api/p2/packing-slips', packingSlipId],
    enabled: !!packingSlipId,
  });

  const { data: auditLog = [], isLoading: auditLoading } = useQuery<AuditLogEntry[]>({
    queryKey: ['/api/p2/packing-slips', packingSlipId, 'audit-log'],
    queryFn: () =>
      fetch(`/api/p2/packing-slips/${packingSlipId}/audit-log`, { credentials: 'include' }).then(r =>
        r.ok ? r.json() : []
      ),
    enabled: !!packingSlipId && canEdit,
  });

  const { data: linkedInvoices = [] } = useQuery<any[]>({
    queryKey: ['/api/ar-invoices', { packingSlipId }],
    queryFn: () => fetch(`/api/ar-invoices?packingSlipId=${packingSlipId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    enabled: !!packingSlipId,
  });

  const { data: linkedRmas = [] } = useQuery<any[]>({
    queryKey: ['/api/p2/rmas', { packingSlipId }],
    queryFn: () => fetch(`/api/p2/rmas?packingSlipId=${packingSlipId}`, { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    enabled: !!packingSlipId,
  });

  const editMutation = useMutation({
    mutationFn: async (payload: { packingSlipNumber: string; shipDate: string | null; lotNumber: string; reason: string }) => {
      return apiRequest(`/api/p2/packing-slips/${packingSlipId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2/packing-slips', packingSlipId] });
      qc.invalidateQueries({ queryKey: ['/api/p2/packing-slips', packingSlipId, 'audit-log'] });
      toast({ title: 'Packing slip updated', description: 'Changes have been saved and logged.' });
      setEditMode(false);
      setEditReason('');
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save', description: err.message || 'An error occurred.', variant: 'destructive' });
    },
  });

  const handleStartEdit = () => {
    if (!packingSlip) return;
    setEditSlipNumber(packingSlip.packingSlipNumber);
    setEditShipDate(
      packingSlip.shipDate
        ? format(new Date(packingSlip.shipDate), 'yyyy-MM-dd')
        : ''
    );
    setEditLotNumber(packingSlip.lotNumber || '');
    setEditReason('');
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditReason('');
  };

  const handleSaveEdit = () => {
    if (!packingSlip) return;
    if (!editReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for the change.', variant: 'destructive' });
      return;
    }
    if (!editLotNumber.trim()) {
      toast({ title: 'Lot number required', description: 'Lot number cannot be empty.', variant: 'destructive' });
      return;
    }
    editMutation.mutate({
      packingSlipNumber: editSlipNumber,
      shipDate: editShipDate ? new Date(editShipDate).toISOString() : null,
      lotNumber: editLotNumber.trim(),
      reason: editReason.trim(),
    });
  };

  const handleBack = () => {
    if (packingSlip?.lotNumberId) {
      setLocation(`/p2/shipments/${packingSlip.lotNumberId}`);
    } else {
      setLocation('/p2-traveler-viewer');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    window.open(`/api/p2/packing-slips/${packingSlipId}/pdf`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="print:hidden mb-6">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="text-center">
          <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="text-gray-500 mt-4">Loading packing slip...</p>
        </div>
      </div>
    );
  }

  if (error || !packingSlip) {
    return (
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="print:hidden mb-6">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="text-center">
          <Package className="h-8 w-8 mx-auto text-red-400" />
          <p className="text-red-500 mt-4">Failed to load packing slip</p>
        </div>
      </div>
    );
  }

  const lineItems = (packingSlip.lineItems as any[]) || [];

  const displayDate = packingSlip.shipDate
    ? format(new Date(packingSlip.shipDate), 'MMM d, yyyy')
    : format(new Date(packingSlip.createdAt), 'MMM d, yyyy');

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="print:hidden flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          {canEdit && !editMode && (
            <Button variant="outline" onClick={handleStartEdit}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf} data-testid="button-download-pdf">
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      {editMode && (
        <Card className="print:hidden mb-6 border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="p-5 space-y-4">
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">Edit Packing Slip</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-slip-number">Packing Slip Number</Label>
                <Input
                  id="edit-slip-number"
                  value={editSlipNumber}
                  onChange={e => setEditSlipNumber(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-ship-date">Ship Date</Label>
                <Input
                  id="edit-ship-date"
                  type="date"
                  value={editShipDate}
                  onChange={e => setEditShipDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-lot-number">Lot Number <span className="text-red-500">*</span></Label>
              <Input
                id="edit-lot-number"
                data-testid="input-edit-lot-number"
                value={editLotNumber}
                onChange={e => setEditLotNumber(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-reason">Reason for Change <span className="text-red-500">*</span></Label>
              <Textarea
                id="edit-reason"
                placeholder="Explain why this correction is needed…"
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleCancelEdit} disabled={editMutation.isPending}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={editMutation.isPending}>
                {editMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="print:shadow-none print:border-0" data-testid="packing-slip-document">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-2xl font-bold">{COMPANY_INFO.name}</h1>
              <p className="text-sm text-gray-600">{COMPANY_INFO.streetAddress}</p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.city}, {COMPANY_INFO.state} {COMPANY_INFO.zipCode}</p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.phone}</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-800">PACKING SLIP</h2>
              <p className="font-mono font-bold text-lg" data-testid="text-packing-slip-number">{packingSlip.packingSlipNumber}</p>
              <Badge className={packingSlip.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : packingSlip.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}>
                {packingSlip.status}
              </Badge>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-2">SHIP TO:</h3>
              <p className="font-bold" data-testid="text-customer-name">{packingSlip.customerName}</p>
              <p className="text-sm whitespace-pre-line">{packingSlip.customerAddress || 'Address on file'}</p>
            </div>
            <div className="text-right">
              <div className="mb-4">
                <span className="text-sm text-gray-500">Date:</span>
                <p data-testid="text-date">{displayDate}</p>
              </div>
              <div className="mb-4">
                <span className="text-sm text-gray-500">PO Number:</span>
                <p className="font-semibold" data-testid="text-po-number">{packingSlip.poNumber || 'N/A'}</p>
              </div>
              <div className="mb-4">
                <span className="text-sm text-gray-500">Lot Number:</span>
                <p className="font-mono" data-testid="text-lot-number">{packingSlip.lotNumber || 'N/A'}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="mb-8">
            <h3 className="font-semibold mb-4">LINE ITEMS</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Quantity</TableHead>
                  <TableHead>Serial Numbers</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item: any, index: number) => (
                  <TableRow key={index} data-testid={`row-line-item-${index}`}>
                    <TableCell className="font-mono">{item.partNumber}</TableCell>
                    <TableCell>{item.partName || item.partNumber || 'N/A'}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {Array.isArray(item.serialNumbers) ? item.serialNumbers.join(', ') : item.serialNumbers || 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end mb-8">
            <div className="text-right">
              <span className="text-gray-500">Total Quantity:</span>
              <span className="ml-4 font-bold text-lg" data-testid="text-total-quantity">{packingSlip.totalQuantity}</span>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-2">SHIPPING INFORMATION</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Carrier:</span>
                  <span className="ml-2">{packingSlip.carrier || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Tracking #:</span>
                  <span className="ml-2 font-mono">{packingSlip.trackingNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Shipment #:</span>
                  <span className="ml-2">{packingSlip.shipmentNumber || 'N/A'}</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-2">VERIFICATION</h3>
              <div className="space-y-4">
                <div>
                  <span className="text-gray-500 text-sm">Packed By:</span>
                  <div className="border-b border-gray-300 min-h-[2rem] mt-1 flex items-end pb-1">
                    {packingSlip.packedBy || ''}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">Verified By:</span>
                  <div className="border-b border-gray-300 min-h-[2rem] mt-1 flex items-end pb-1">
                    {packingSlip.verifiedBy || ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {packingSlip.notes && (
            <>
              <Separator className="my-6" />
              <div>
                <h3 className="font-semibold text-gray-500 text-sm mb-2">NOTES</h3>
                <p className="text-sm">{packingSlip.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Change History — not printed, admin/owner only */}
      {canEdit && (
        <div className="print:hidden mt-6">
          <Card>
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-3 cursor-pointer hover:bg-muted/40" data-testid="button-toggle-history">
                  <CardTitle className="text-base flex items-center gap-2">
                    {historyOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <History className="h-4 w-4 text-muted-foreground" />
                    Change History
                    {Array.isArray(auditLog) && auditLog.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{auditLog.length}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  {auditLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading change history…
                    </div>
                  ) : !Array.isArray(auditLog) || auditLog.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2" data-testid="text-no-history">
                      No edits recorded for this packing slip.
                    </p>
                  ) : (
                    <Table data-testid="table-audit-log">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Old → New</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auditLog.map((entry) => (
                          <TableRow key={entry.id} data-testid={`row-audit-${entry.id}`}>
                            <TableCell className="font-mono text-xs">{entry.field_name}</TableCell>
                            <TableCell className="text-xs">
                              <span className="text-muted-foreground line-through">
                                {entry.old_value ?? '∅'}
                              </span>
                              <span className="mx-1">→</span>
                              <span className="font-medium">{entry.new_value ?? '∅'}</span>
                            </TableCell>
                            <TableCell className="text-sm">{entry.changed_by}</TableCell>
                            <TableCell className="text-sm max-w-xs truncate" title={entry.reason ?? ''}>
                              {entry.reason || '—'}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(new Date(entry.changed_at), 'MMM d, yyyy h:mm a')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      )}

      {/* Linked Records — not printed */}
      <div className="print:hidden mt-6 space-y-4">
        {/* Linked Invoice section — always visible */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Linked Invoice
              {Array.isArray(linkedInvoices) && linkedInvoices.length > 0 && (
                <Badge variant="secondary" className="ml-1">{linkedInvoices.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!Array.isArray(linkedInvoices) || linkedInvoices.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Receipt className="h-4 w-4 opacity-50" />
                No invoice created for this packing slip yet.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedInvoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                    <div>
                      <p className="text-sm font-medium font-mono">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{inv.customerName || inv.customerId}</p>
                      {(inv.pricingMismatch || inv.pricingAmbiguous) && (
                        <p className="text-xs text-yellow-700 flex items-center gap-1 mt-0.5">
                          <AlertTriangle className="h-3 w-3" /> Pricing requires review
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        inv.status === 'PAID' ? 'bg-green-100 text-green-800' :
                        inv.status === 'POSTED' ? 'bg-indigo-100 text-indigo-700' :
                        inv.status === 'SENT' ? 'bg-teal-100 text-teal-700' :
                        inv.status === 'VOID' ? 'bg-gray-100 text-gray-600' :
                        inv.status === 'DRAFT' ? 'bg-blue-50 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }>{inv.status}</Badge>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/finance/invoices/${inv.id}`}>
                          View Invoice <ExternalLink className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Linked RMAs section — always visible */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Return Merchandise Authorizations (RMAs)
              {Array.isArray(linkedRmas) && linkedRmas.length > 0 && (
                <Badge variant="secondary" className="ml-1">{linkedRmas.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!Array.isArray(linkedRmas) || linkedRmas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No RMAs linked to this packing slip.</p>
            ) : (
              <div className="space-y-2">
                {linkedRmas.map((rma: any) => (
                  <div key={rma.id} className="p-3 rounded-md border bg-muted/30">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium font-mono">{rma.rmaNumber}</p>
                        <p className="text-xs text-muted-foreground">{rma.reason}</p>
                        <p className="text-xs text-muted-foreground">{rma.createdAt ? format(new Date(rma.createdAt), 'MMM d, yyyy') : '—'}</p>
                      </div>
                      <Badge className={
                        rma.status === 'CLOSED' ? 'bg-blue-100 text-blue-800' :
                        rma.status === 'RECEIVED' ? 'bg-green-100 text-green-800' :
                        'bg-yellow-100 text-yellow-800'
                      }>{rma.status}</Badge>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/p2/rma/${rma.id}`}>
                          <ClipboardList className="h-3.5 w-3.5 mr-1" /> View RMA Detail
                        </Link>
                      </Button>
                      {packingSlip?.lotNumberId && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/p2/shipments/${packingSlip.lotNumberId}`}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Shipment Record
                          </Link>
                        </Button>
                      )}
                      {rma.invoiceId && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/finance/invoices/${rma.invoiceId}`}>
                            <Receipt className="h-3.5 w-3.5 mr-1" /> View Invoice
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          [data-testid="packing-slip-document"],
          [data-testid="packing-slip-document"] * {
            visibility: visible;
          }
          [data-testid="packing-slip-document"] {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

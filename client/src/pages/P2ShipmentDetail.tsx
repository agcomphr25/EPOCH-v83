import { useState, useRef, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  ArrowLeft,
  Package,
  Truck,
  FileText,
  CheckCircle2,
  Upload,
  Download,
  ExternalLink,
  AlertCircle,
  Loader2,
  RefreshCw,
  ClipboardList,
  Shield,
  Receipt,
  ShieldAlert,
  History,
} from 'lucide-react';
import OverrideShippingDataModal from '@/components/p2/OverrideShippingDataModal';

interface ShipmentLot {
  id: string;
  lot_number: string;
  lot_type: string;
  part_number: string | null;
  part_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  po_number: string | null;
  po_id: number | null;
  quantity: number | null;
  serialized_item_ids: string[] | null;
  status: string;
  closed_at: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  packing_slip_id: string | null;
  certificate_id: string | null;
  notes: string | null;
  tracking_number: string | null;
  carrier: string | null;
  bill_of_lading_url: string | null;
  created_by: string;
  created_at: string;
}

interface PackingSlip {
  id: string;
  packing_slip_number: string;
  status: string;
  total_quantity: number;
  ship_date: string | null;
  tracking_number: string | null;
  carrier: string | null;
}

interface Certificate {
  id: string;
  certificate_number: string;
  status: string;
  quantity: number;
  ship_date: string | null;
  approved_by: string | null;
  approved_at: string | null;
  issued_at: string | null;
}

interface SerializedItem {
  id: string;
  serial_number: string;
  part_number: string | null;
  part_name: string | null;
  status: string;
  barcode: string | null;
  completed_at: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total_amount: string;
  status: string;
}

interface ShipmentDetail {
  lot: ShipmentLot;
  packingSlip: PackingSlip | null;
  certificate: Certificate | null;
  serializedItems: SerializedItem[];
  invoice: Invoice | null;
}

interface AuditLogEntry {
  id: number;
  entity_type: string;
  entity_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
  reason: string;
}

interface CurrentUser {
  id: number;
  username: string;
  role: string;
}

function statusColor(status: string) {
  switch (status?.toUpperCase()) {
    case 'SHIPPED': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'CLOSED': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'OPEN': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'FINALIZED': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
    case 'APPROVED': case 'ISSUED': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'DRAFT': return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
    default: return 'bg-gray-100 text-gray-700';
  }
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function P2ShipmentDetail() {
  const [, params] = useRoute('/p2/shipments/:lotId');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lotId = params?.lotId ?? '';

  const [tracking, setTracking] = useState('');
  const [carrier, setCarrier] = useState('');
  const [notes, setNotes] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);

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

  const canOverride = currentUser?.role === 'ADMIN' || currentUser?.role === 'OWNER';

  const { data, isLoading, error, refetch } = useQuery<ShipmentDetail>({
    queryKey: ['/api/p2/shipments', lotId],
    queryFn: async () => {
      const r = await fetch(`/api/p2/shipments/${lotId}`);
      if (!r.ok) throw new Error('Failed to load shipment');
      return r.json();
    },
    enabled: !!lotId,
  });

  const { data: auditLog = [], refetch: refetchAuditLog } = useQuery<AuditLogEntry[]>({
    queryKey: ['/api/p2/lots', lotId, 'audit-log'],
    queryFn: async () => {
      const r = await fetch(`/api/p2/lots/${lotId}/audit-log`, { credentials: 'include' });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!lotId && canOverride,
  });

  useEffect(() => {
    if (data?.lot) {
      setTracking(data.lot.tracking_number ?? '');
      setCarrier(data.lot.carrier ?? '');
      setNotes(data.lot.notes ?? '');
    }
  }, [data?.lot?.id]);

  const updateMutation = useMutation({
    mutationFn: (payload: object) =>
      apiRequest('PATCH', `/api/p2/shipments/${lotId}`, payload),
    onSuccess: () => {
      toast({ title: 'Shipment updated', description: 'Changes saved successfully.' });
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ['/api/p2/shipments', lotId] });
    },
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  const markShippedMutation = useMutation({
    mutationFn: () =>
      apiRequest('PATCH', `/api/p2/shipments/${lotId}`, {
        trackingNumber: tracking,
        carrier,
        notes,
        markShipped: true,
        shippedBy: 'user',
      }),
    onSuccess: () => {
      toast({ title: 'Marked as Shipped', description: 'Lot status updated to SHIPPED.' });
      qc.invalidateQueries({ queryKey: ['/api/p2/shipments', lotId] });
      qc.invalidateQueries({ queryKey: ['/api/p2/lots/existing-shipments'] });
    },
    onError: () => toast({ title: 'Mark shipped failed', variant: 'destructive' }),
  });

  async function handleBolUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/p2/shipments/${lotId}/upload-bol`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error('Upload failed');
      toast({ title: 'Bill of Lading uploaded' });
      qc.invalidateQueries({ queryKey: ['/api/p2/shipments', lotId] });
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/p2/ready-to-ship')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <Card>
          <CardContent className="pt-8 text-center text-muted-foreground">
            <AlertCircle className="h-10 w-10 mx-auto mb-3 text-destructive" />
            <p className="font-medium">Shipment not found.</p>
            <p className="text-sm mt-1">Lot ID: {lotId}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { lot, packingSlip, certificate, serializedItems, invoice } = data;
  const isShipped = lot.status === 'SHIPPED';

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">

      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/p2/ready-to-ship')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Ready to Ship
        </Button>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-muted-foreground" />
                <h1 className="text-2xl font-bold font-mono tracking-tight">{lot.lot_number}</h1>
                <Badge className={statusColor(lot.status)}>{lot.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {lot.part_number && <span className="font-mono mr-2">{lot.part_number}</span>}
                {lot.part_name}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-2">
                {lot.customer_name && (
                  <span><span className="font-medium text-foreground">Customer:</span> {lot.customer_name}</span>
                )}
                {lot.po_number && (
                  <span><span className="font-medium text-foreground">PO:</span> {lot.po_number}</span>
                )}
                <span><span className="font-medium text-foreground">Qty:</span> {lot.quantity ?? serializedItems.length}</span>
                {lot.shipped_at && (
                  <span><span className="font-medium text-foreground">Shipped:</span> {fmt(lot.shipped_at)}</span>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              {!isShipped && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => markShippedMutation.mutate()}
                  disabled={markShippedMutation.isPending}
                >
                  {markShippedMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Mark as Shipped
                </Button>
              )}
              {canOverride && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  onClick={() => setShowOverrideModal(true)}
                >
                  <ShieldAlert className="h-4 w-4 mr-1" />
                  Override Shipping Data
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Carrier & Tracking */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              Carrier & Tracking
            </CardTitle>
            {!editMode ? (
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => {
                  setEditMode(false);
                  setTracking(lot.tracking_number ?? '');
                  setCarrier(lot.carrier ?? '');
                  setNotes(lot.notes ?? '');
                }}>Cancel</Button>
                <Button size="sm" onClick={() => updateMutation.mutate({ trackingNumber: tracking, carrier, notes })}
                  disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Carrier</Label>
                <Input placeholder="e.g. FedEx, UPS, USPS" value={carrier} onChange={e => setCarrier(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tracking Number</Label>
                <Input placeholder="Tracking #" value={tracking} onChange={e => setTracking(e.target.value)} />
              </div>
              <div className="col-span-full space-y-1.5">
                <Label>Notes</Label>
                <Textarea placeholder="Shipment notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Carrier</p>
                <p className="font-medium">{lot.carrier || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Tracking #</p>
                <p className="font-mono font-medium">{lot.tracking_number || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Ship Date</p>
                <p className="font-medium">{fmt(lot.shipped_at)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Shipped By</p>
                <p className="font-medium">{lot.shipped_by || '—'}</p>
              </div>
              {lot.notes && (
                <div className="col-span-full">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Notes</p>
                  <p>{lot.notes}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Packing Slip */}
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Packing Slip</p>
                {packingSlip ? (
                  <p className="text-xs text-muted-foreground font-mono">
                    {packingSlip.packing_slip_number}
                    <Badge className={`ml-2 text-xs ${statusColor(packingSlip.status)}`}>{packingSlip.status}</Badge>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not generated</p>
                )}
              </div>
            </div>
            {packingSlip && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/p2/packing-slip/${packingSlip.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/p2/packing-slips/${packingSlip.id}/pdf`} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1" /> PDF
                  </a>
                </Button>
              </div>
            )}
          </div>

          {/* Certificate of Conformance */}
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Certificate of Conformance</p>
                {certificate ? (
                  <p className="text-xs text-muted-foreground font-mono">
                    {certificate.certificate_number}
                    <Badge className={`ml-2 text-xs ${statusColor(certificate.status)}`}>{certificate.status}</Badge>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not generated</p>
                )}
              </div>
            </div>
            {certificate && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/p2/certificate/${certificate.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> View
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/p2/certificates/${certificate.id}/pdf`} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1" /> PDF
                  </a>
                </Button>
              </div>
            )}
          </div>

          {/* Bill of Lading */}
          <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
            <div className="flex items-center gap-3">
              <Truck className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Bill of Lading</p>
                <p className="text-xs text-muted-foreground">
                  {lot.bill_of_lading_url ? 'File attached' : 'No file uploaded'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {lot.bill_of_lading_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/p2/shipments/${lotId}/bill-of-lading`} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1" /> Download
                  </a>
                </Button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) handleBolUpload(f);
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                {lot.bill_of_lading_url ? 'Replace' : 'Upload'}
              </Button>
            </div>
          </div>

          {/* Invoice */}
          {invoice && (
            <>
              <Separator />
              <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                <div className="flex items-center gap-3">
                  <Receipt className="h-5 w-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">AR Invoice</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {invoice.invoice_number}
                      <Badge className={`ml-2 text-xs ${statusColor(invoice.status)}`}>{invoice.status}</Badge>
                    </p>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium">${parseFloat(invoice.total_amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{fmt(invoice.invoice_date)}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Serialized Items Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Items in Lot
            <Badge variant="secondary" className="ml-1">{serializedItems.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {serializedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No serialized items linked to this lot.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">Serial #</th>
                    <th className="text-left py-2 pr-4 font-medium">Part #</th>
                    <th className="text-left py-2 pr-4 font-medium">Part Name</th>
                    <th className="text-left py-2 pr-4 font-medium">Barcode</th>
                    <th className="text-left py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {serializedItems.map(item => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-mono font-medium">{item.serial_number}</td>
                      <td className="py-2 pr-4 font-mono text-muted-foreground">{item.part_number || '—'}</td>
                      <td className="py-2 pr-4">{item.part_name || '—'}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{item.barcode || '—'}</td>
                      <td className="py-2">
                        <Badge className={`text-xs ${statusColor(item.status)}`}>{item.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Override Audit Log (visible to admin/owner only) */}
      {canOverride && auditLog.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              Shipping Data Override History
              <Badge variant="secondary" className="ml-1">{auditLog.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditLog.map((entry) => (
                <div key={entry.id} className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold font-mono text-amber-800 dark:text-amber-300">{entry.field_name}</span>
                    <span className="text-muted-foreground">changed by</span>
                    <span className="font-medium">{entry.changed_by}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground text-xs">{fmt(entry.changed_at)}</span>
                    <Badge variant="outline" className="text-xs">{entry.entity_type}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span><span className="font-medium text-foreground">From:</span> {entry.old_value || '—'}</span>
                    <span><span className="font-medium text-foreground">To:</span> {entry.new_value || '—'}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="font-medium text-foreground">Reason:</span>{' '}
                    <span className="text-muted-foreground italic">{entry.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lot metadata footer */}
      <div className="text-xs text-muted-foreground text-center pb-4">
        Lot created by {lot.created_by} on {fmt(lot.created_at)} · ID: <span className="font-mono">{lot.id}</span>
      </div>

      {/* Override Shipping Data Modal */}
      {showOverrideModal && (
        <OverrideShippingDataModal
          lotId={lot.id}
          currentLotNumber={lot.lot_number}
          currentShippedAt={lot.shipped_at}
          onSuccess={() => {
            setShowOverrideModal(false);
            toast({ title: 'Override applied', description: 'Shipping data updated and audit log entry created.' });
            qc.invalidateQueries({ queryKey: ['/api/p2/shipments', lotId] });
            qc.invalidateQueries({ queryKey: ['/api/p2/lots', lotId, 'audit-log'] });
          }}
          onClose={() => setShowOverrideModal(false)}
        />
      )}
    </div>
  );
}

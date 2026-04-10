import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Printer, Download, ArrowLeft, Package, Clock, Pencil, X, Check, Loader2 } from 'lucide-react';
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

  const [editMode, setEditMode] = useState(false);
  const [editSlipNumber, setEditSlipNumber] = useState('');
  const [editShipDate, setEditShipDate] = useState('');
  const [editReason, setEditReason] = useState('');

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

  const editMutation = useMutation({
    mutationFn: async (payload: { packingSlipNumber: string; shipDate: string | null; reason: string }) => {
      return apiRequest(`/api/p2/packing-slips/${packingSlipId}`, {
        method: 'PATCH',
        body: payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/p2/packing-slips', packingSlipId] });
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
    editMutation.mutate({
      packingSlipNumber: editSlipNumber,
      shipDate: editShipDate ? new Date(editShipDate).toISOString() : null,
      reason: editReason.trim(),
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    window.open(`/api/p2/packing-slips/${packingSlipId}/pdf`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-4">Loading packing slip...</p>
      </div>
    );
  }

  if (error || !packingSlip) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Package className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-red-500 mt-4">Failed to load packing slip</p>
        <Link href="/p2-traveler-viewer">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Traveler Viewer
          </Button>
        </Link>
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
        <Link href="/p2-traveler-viewer">
          <Button variant="ghost">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
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
                    <TableCell>{item.partName}</TableCell>
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

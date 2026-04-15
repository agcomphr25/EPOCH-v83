import { useRoute, Link, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ClipboardList,
  Package,
  Receipt,
  ExternalLink,
  RefreshCw,
  Loader2,
  Ship,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

function statusColor(status: string) {
  if (status === 'CLOSED') return 'bg-blue-100 text-blue-800';
  if (status === 'RECEIVED') return 'bg-green-100 text-green-800';
  return 'bg-yellow-100 text-yellow-800';
}

export default function P2RmaDetailPage() {
  const [, params] = useRoute('/p2/rma/:id');
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const rmaId = params?.id;

  const { data: rma, isLoading, error } = useQuery<any>({
    queryKey: ['/api/p2/rmas', rmaId],
    queryFn: () => apiRequest(`/api/p2/rmas/${rmaId}`),
    enabled: !!rmaId,
    retry: false,
  });

  const { data: packingSlip } = useQuery<any>({
    queryKey: ['/api/p2/packing-slips', rma?.packingSlipId],
    queryFn: () => apiRequest(`/api/p2/packing-slips/${rma.packingSlipId}`),
    enabled: !!rma?.packingSlipId,
  });

  const { data: invoice } = useQuery<any>({
    queryKey: ['/api/ar-invoices', rma?.invoiceId],
    queryFn: () => apiRequest(`/api/ar-invoices/${rma.invoiceId}`),
    enabled: !!rma?.invoiceId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiRequest(`/api/p2/rmas/${rmaId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/p2/rmas', rmaId] });
      queryClient.invalidateQueries({ queryKey: ['/api/p2/rmas'] });
      toast({ title: 'RMA status updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update RMA status', description: err?.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !rma) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <ClipboardList className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-red-500 mt-4">Failed to load RMA record.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/p2/shipments')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Shipments
        </Button>
      </div>
    );
  }

  const nextStatus = rma.status === 'OPEN' ? 'RECEIVED' : rma.status === 'RECEIVED' ? 'CLOSED' : null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
            RMA {rma.rmaNumber}
          </h1>
          <p className="text-sm text-muted-foreground">Return Merchandise Authorization</p>
        </div>
        <Badge className={statusColor(rma.status)}>{rma.status}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">RMA Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">RMA Number</p>
              <p className="font-mono font-medium">{rma.rmaNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge className={statusColor(rma.status)}>{rma.status}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created By</p>
              <p>{rma.createdBy || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Created At</p>
              <p>{rma.createdAt ? format(new Date(rma.createdAt), 'MMM d, yyyy') : '—'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Reason</p>
              <p>{rma.reason}</p>
            </div>
          </div>

          {nextStatus && (
            <div className="pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateStatusMutation.mutate(nextStatus)}
                disabled={updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Mark as {nextStatus}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            Source Packing Slip
          </CardTitle>
        </CardHeader>
        <CardContent>
          {packingSlip ? (
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
              <div>
                <p className="text-sm font-medium font-mono">{packingSlip.packingSlipNumber}</p>
                <p className="text-xs text-muted-foreground">{packingSlip.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  Shipped: {packingSlip.shipDate ? format(new Date(packingSlip.shipDate), 'MMM d, yyyy') : '—'}
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/p2/packing-slip/${rma.packingSlipId}`}>
                  View Packing Slip <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">Loading packing slip…</p>
          )}
        </CardContent>
      </Card>

      {rma.invoiceId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Linked Invoice
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoice ? (
              <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
                <div>
                  <p className="text-sm font-medium font-mono">{invoice.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">{invoice.customerName || invoice.customerId}</p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/finance/invoices/${rma.invoiceId}`}>
                    View Invoice <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-2">Loading invoice…</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ship className="h-4 w-4 text-muted-foreground" />
            Replacement Shipments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Use Shipment History to locate replacement shipments created after this RMA was received.
          </p>
          <div className="flex gap-2 flex-wrap">
            {packingSlip?.lotNumberId && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/p2/shipments/${packingSlip.lotNumberId}`}>
                  <Ship className="h-3.5 w-3.5 mr-1.5" /> View Original Shipment
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" asChild>
              <Link href="/p2/shipments">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> All Shipment Records
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

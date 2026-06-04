import { useQuery } from '@tanstack/react-query';
import { useRoute, Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, Download, ArrowLeft, FileText, Clock } from 'lucide-react';
import { formatDateOnlyMedium } from '@shared/utils/dateNormalization';
import { COMPANY_INFO } from '@shared/company-config';

interface P2POLineItem {
  id: number;
  partNumber: string;
  partName: string;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  specifications?: string | null;
  notes?: string | null;
}

interface P2PurchaseOrderDetail {
  id: number;
  poNumber: string;
  customerId: string;
  customerName: string;
  poDate: string;
  expectedDelivery: string;
  status: string;
  notes?: string | null;
  projectName?: string | null;
  lockedAt?: string | null;
  createdAt: string;
  items?: P2POLineItem[];
  lineItems?: P2POLineItem[];
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return '$' + value.toFixed(2);
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'OPEN': return 'bg-green-100 text-green-800';
    case 'CLOSED': return 'bg-gray-100 text-gray-700';
    case 'CANCELED': return 'bg-red-100 text-red-800';
    default: return 'bg-blue-100 text-blue-800';
  }
}

export default function P2POViewer() {
  const [, params] = useRoute('/p2/purchase-orders/:id/preview');
  const poId = params?.id;

  const { data: po, isLoading, error } = useQuery<P2PurchaseOrderDetail>({
    queryKey: ['/api/p2-purchase-orders', poId],
    queryFn: () =>
      fetch(`/api/p2-purchase-orders/${poId}`, { credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('Failed to load purchase order');
        return r.json();
      }),
    enabled: !!poId,
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    window.open(`/api/p2/purchase-orders/${poId}/pdf`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <Clock className="h-8 w-8 animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-4">Loading purchase order...</p>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <FileText className="h-8 w-8 mx-auto text-red-400" />
        <p className="text-red-500 mt-4">Failed to load purchase order</p>
        <Link href="/p2-control-center">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Control Center
          </Button>
        </Link>
      </div>
    );
  }

  const lineItems: P2POLineItem[] = po.lineItems || po.items || [];
  const grandTotal = lineItems.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white; }
          .shadow-sm { box-shadow: none !important; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline" onClick={handleDownloadPdf}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-2xl font-bold">{COMPANY_INFO.name}</h1>
              <p className="text-sm text-gray-600">{COMPANY_INFO.streetAddress}</p>
              <p className="text-sm text-gray-600">
                {COMPANY_INFO.city}, {COMPANY_INFO.state} {COMPANY_INFO.zipCode}
              </p>
              <p className="text-sm text-gray-600">{COMPANY_INFO.phone}</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-800">PURCHASE ORDER</h2>
              <p className="font-mono font-bold text-lg">{po.poNumber}</p>
              <Badge className={getStatusClass(po.status)}>{po.status}</Badge>
            </div>
          </div>

          <Separator className="my-6" />

          {/* PO Metadata */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-500 text-sm mb-2">CUSTOMER:</h3>
              <p className="font-bold text-lg">{po.customerName}</p>
              <p className="text-sm text-gray-500">Customer ID: {po.customerId}</p>
              {po.projectName && (
                <p className="text-sm text-gray-500 mt-1">Project: <span className="font-medium text-gray-700">{po.projectName}</span></p>
              )}
            </div>
            <div className="text-right space-y-3">
              <div>
                <span className="text-sm text-gray-500">PO Date:</span>
                <p className="font-semibold">{formatDateOnlyMedium(po.poDate)}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Expected Delivery:</span>
                <p className="font-semibold">{formatDateOnlyMedium(po.expectedDelivery)}</p>
              </div>
            </div>
          </div>

          <Separator className="my-6" />

          {/* Line Items Table */}
          <div className="mb-8">
            <h3 className="font-semibold mb-4">LINE ITEMS</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      No line items on this purchase order.
                    </TableCell>
                  </TableRow>
                ) : (
                  lineItems.map((item) => {
                    const lineTotal = (item.unitPrice ?? 0) * item.quantity;
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono">{item.partNumber}</TableCell>
                        <TableCell>
                          <div>{item.partName}</div>
                          {item.specifications && (
                            <div className="text-xs text-muted-foreground mt-0.5">{item.specifications}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(lineTotal)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="text-right">
              <span className="text-gray-500">Total:</span>
              <span className="ml-4 font-bold text-lg">{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Notes */}
          {po.notes && (
            <>
              <Separator className="my-6" />
              <div>
                <h3 className="font-semibold text-gray-500 text-sm mb-2">NOTES</h3>
                <p className="text-sm whitespace-pre-line">{po.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

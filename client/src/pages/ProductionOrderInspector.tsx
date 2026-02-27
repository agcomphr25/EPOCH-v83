import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import {
  Search,
  FileText,
  Package,
  ExternalLink,
  Loader2,
  AlertCircle,
  Database,
  Tag,
  LinkIcon,
} from 'lucide-react';

export default function ProductionOrderInspector() {
  const [searchId, setSearchId] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['/api/production-orders', activeId],
    queryFn: () => apiRequest(`/api/production-orders/${activeId}`),
    enabled: activeId !== null,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(searchId);
    if (!isNaN(parsed)) {
      setActiveId(parsed);
    }
  };

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

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" />
          Production Order Inspector
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Read-only view of production order canonical data and source snapshot
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          type="number"
          placeholder="Enter production order ID (numeric)"
          value={searchId}
          onChange={(e) => setSearchId(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={!searchId}>
          <Search className="h-4 w-4 mr-2" />
          Inspect
        </Button>
      </form>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading...</span>
        </div>
      )}

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <span>Production order not found or failed to load.</span>
          </CardContent>
        </Card>
      )}

      {order && !isLoading && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Canonical Fields
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Order ID</span>
                  <span className="font-medium">{order.orderId}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Status</span>
                  {getStatusBadge(order.productionStatus)}
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Material (Canonical)</span>
                  <span className="font-medium">{order.materialCanonical || <span className="text-muted-foreground italic">empty</span>}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Stock Model ID</span>
                  <span className="font-mono text-xs">{order.itemId || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Item Name</span>
                  <span>{order.itemName || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Current Department</span>
                  <span>{order.currentDepartment || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Customer</span>
                  <span>{order.customerName || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Database ID</span>
                  <span className="font-mono text-xs">{order.id}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Linked Purchase Order
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">PO ID</span>
                  {order.poId ? (
                    <Link href="/purchase-orders" className="text-blue-600 hover:underline flex items-center gap-1">
                      {order.poId}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">PO Item ID</span>
                  <span className="font-mono text-xs">{order.poItemId || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">PO Number</span>
                  <span className="font-medium">{order.poNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-1">Customer ID</span>
                  <span className="font-mono text-xs">{order.customerId || '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Source Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent>
              {order.sourceSnapshot ? (
                <pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(
                    typeof order.sourceSnapshot === 'string'
                      ? JSON.parse(order.sourceSnapshot)
                      : order.sourceSnapshot,
                    null,
                    2
                  )}
                </pre>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Package className="h-5 w-5" />
                  <span>No source snapshot recorded for this order.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {order.specifications && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Raw Specifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-md p-4 text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(
                    typeof order.specifications === 'string'
                      ? JSON.parse(order.specifications)
                      : order.specifications,
                    null,
                    2
                  )}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface ProductionOrder {
  order_id: string;
  po_id: number;
  po_number: string;
  customer_name: string;
  item_name: string;
  current_department: string;
  production_status: string;
  created_at: string;
  updated_at: string;
}

interface Summary {
  current_department: string;
  production_status: string;
  count: number;
}

interface NewSystemOrder {
  order_id: string;
  order_source: string;
  source_po_id: number;
  current_department: string;
  status: string;
  created_at: string;
}

interface ReportData {
  productionOrders: ProductionOrder[];
  summary: Summary[];
  newSystemOrders: NewSystemOrder[];
  totalCount: number;
  newSystemCount: number;
}

export default function POProductionOrdersReport() {
  const { data, isLoading, error } = useQuery<ReportData>({
    queryKey: ['/api/reports/po-production-orders'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="text-red-500">Error Loading Report</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PENDING': return 'bg-yellow-500';
      case 'LAID_UP': return 'bg-blue-500';
      case 'IN_PROGRESS': return 'bg-green-500';
      case 'COMPLETED': return 'bg-emerald-600';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">PO Production Orders Report</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Legacy System Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data?.totalCount || 0}</p>
            <p className="text-sm text-muted-foreground">Orders in production_orders table</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>New System Orders (Phase 1B)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data?.newSystemCount || 0}</p>
            <p className="text-sm text-muted-foreground">Orders with order_source = 'PO_RELEASE'</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary by Department & Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.summary?.map((row, idx) => (
                <TableRow key={idx}>
                  <TableCell>{row.current_department || 'Unknown'}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(row.production_status)}>
                      {row.production_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All PO Production Orders ({data?.totalCount || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.productionOrders?.map((order) => (
                  <TableRow key={order.order_id}>
                    <TableCell className="font-mono text-sm">{order.order_id}</TableCell>
                    <TableCell>{order.po_number}</TableCell>
                    <TableCell>{order.customer_name || '-'}</TableCell>
                    <TableCell>{order.item_name || '-'}</TableCell>
                    <TableCell>{order.current_department || '-'}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(order.production_status)}>
                        {order.production_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {data?.newSystemOrders && data.newSystemOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>New System Orders (Phase 1B) ({data.newSystemCount})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Order Source</TableHead>
                  <TableHead>Source PO ID</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.newSystemOrders.map((order) => (
                  <TableRow key={order.order_id}>
                    <TableCell className="font-mono text-sm">{order.order_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{order.order_source}</Badge>
                    </TableCell>
                    <TableCell>{order.source_po_id || '-'}</TableCell>
                    <TableCell>{order.current_department || '-'}</TableCell>
                    <TableCell>{order.status}</TableCell>
                    <TableCell className="text-sm">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString() : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Search, Download, PackageCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AuditOrder {
  order_id: string;
  fb_order_number: string | null;
  customer_id: string | null;
  model_id: string | null;
  status: string;
  current_department: string;
  shipped_date: string | null;
  due_date: string | null;
  updated_at: string | null;
  source: string | null;
}

export default function ShippingStatusAuditPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [queryParams, setQueryParams] = useState<{ startDate: string; endDate: string }>({ startDate: '', endDate: '' });

  const { data, isLoading, isFetching } = useQuery<{ success: boolean; orders: AuditOrder[]; total: number }>({
    queryKey: ['/api/admin/shipping-status-audit', queryParams.startDate, queryParams.endDate],
    enabled: true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (queryParams?.startDate) params.set('startDate', queryParams.startDate);
      if (queryParams?.endDate) params.set('endDate', queryParams.endDate);
      const res = await fetch(`/api/admin/shipping-status-audit?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch audit data');
      return res.json();
    },
  });

  const orders = data?.orders ?? [];

  function runSearch() {
    setQueryParams({ startDate, endDate });
  }

  function exportCsv() {
    if (!orders.length) return;
    const headers = ['Order ID', 'FB Order #', 'Customer', 'Model', 'Status', 'Department', 'Shipped Date', 'Due Date', 'Last Updated', 'Source'];
    const rows = orders.map((o) => [
      o.order_id,
      o.fb_order_number ?? '',
      o.customer_id ?? '',
      o.model_id ?? '',
      o.status,
      o.current_department,
      o.shipped_date ? format(parseISO(o.shipped_date), 'yyyy-MM-dd') : '',
      o.due_date ? format(parseISO(o.due_date), 'yyyy-MM-dd') : '',
      o.updated_at ? format(parseISO(o.updated_at), 'yyyy-MM-dd HH:mm') : '',
      o.source ?? '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shipping-status-audit-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <PackageCheck className="h-8 w-8" />
            Shipping Status Audit
          </h1>
          <p className="text-muted-foreground mt-1">
            Finds orders in <strong>Shipping Management</strong> whose status is still <strong>FINALIZED</strong> — these should have been updated to <strong>FULFILLED</strong> when shipped.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filter by Ship Date Range
          </CardTitle>
          <CardDescription>
            Filters by the date the order was shipped. Leave blank to show all mismatches across all time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={runSearch} disabled={isLoading || isFetching}>
              {isFetching ? 'Searching…' : 'Search'}
            </Button>
            {orders.length > 0 && (
              <Button variant="outline" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Mismatch Results
              </CardTitle>
              {!isFetching && (
                <Badge variant={orders.length > 0 ? 'destructive' : 'secondary'}>
                  {orders.length} {orders.length === 1 ? 'order' : 'orders'} found
                </Badge>
              )}
            </div>
            {orders.length === 0 && !isFetching && (
              <CardDescription className="text-green-600 dark:text-green-400">
                No mismatches found for the selected date range.
              </CardDescription>
            )}
          </CardHeader>
          {(isFetching || orders.length > 0) && (
            <CardContent>
              {isFetching ? (
                <div className="text-center py-8 text-muted-foreground">Loading…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>FB Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Shipped Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Last Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.order_id}>
                        <TableCell className="font-mono font-medium">{order.order_id}</TableCell>
                        <TableCell>{order.fb_order_number ?? '—'}</TableCell>
                        <TableCell>{order.customer_id ?? '—'}</TableCell>
                        <TableCell>{order.model_id ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.current_department}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.shipped_date
                            ? format(parseISO(order.shipped_date), 'MMM d, yyyy')
                            : <span className="text-muted-foreground text-sm">Not recorded</span>}
                        </TableCell>
                        <TableCell>
                          {order.due_date
                            ? format(parseISO(order.due_date), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {order.updated_at
                            ? format(parseISO(order.updated_at), 'MMM d, yyyy HH:mm')
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          )}
      </Card>
    </div>
  );
}

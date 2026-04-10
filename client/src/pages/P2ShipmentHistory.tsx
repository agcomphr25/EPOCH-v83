import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  Package,
  Search,
  ExternalLink,
  Loader2,
  Truck,
} from 'lucide-react';

interface ShipmentRow {
  id: string;
  lot_number: string;
  po_number: string | null;
  po_id: number | null;
  customer_name: string | null;
  part_number: string | null;
  part_name: string | null;
  quantity: number | null;
  status: string;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  created_at: string;
  packing_slip_id: string | null;
  packing_slip_number: string | null;
}

function statusColor(status: string) {
  switch (status?.toUpperCase()) {
    case 'SHIPPED':  return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'CLOSED':   return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'OPEN':     return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:         return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
  }
}

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function P2ShipmentHistory() {
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useQuery<ShipmentRow[]>({
    queryKey: ['/api/p2/shipments'],
    queryFn: async () => {
      const r = await fetch('/api/p2/shipments');
      if (!r.ok) throw new Error('Failed to load');
      return r.json();
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.lot_number?.toLowerCase().includes(q) ||
      r.po_number?.toLowerCase().includes(q) ||
      r.customer_name?.toLowerCase().includes(q) ||
      r.part_number?.toLowerCase().includes(q) ||
      r.tracking_number?.toLowerCase().includes(q) ||
      r.packing_slip_number?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    shipped: rows.filter(r => r.status === 'SHIPPED').length,
    open: rows.filter(r => r.status === 'OPEN').length,
    closed: rows.filter(r => r.status === 'CLOSED').length,
  }), [rows]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">

      {/* Back nav */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/p2/ready-to-ship">
            <ArrowLeft className="h-4 w-4 mr-1" /> Ready to Ship
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Truck className="h-6 w-6 text-muted-foreground" />
            Shipment History
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">All P2 lots with shipment records</p>
        </div>

        {/* Summary chips */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{counts.total} Total</Badge>
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            {counts.shipped} Shipped
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {counts.closed} Closed
          </Badge>
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            {counts.open} Open
          </Badge>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search lot, packing slip #, PO, customer, tracking…"
          className="pl-8"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">{search ? 'No matches found' : 'No shipments yet'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">Lot #</th>
                    <th className="text-left px-4 py-3 font-medium">Packing Slip</th>
                    <th className="text-left px-4 py-3 font-medium">PO</th>
                    <th className="text-left px-4 py-3 font-medium">Customer</th>
                    <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Part</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(row => (
                    <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-xs">
                        <Link
                          to={`/p2/shipments/${row.id}`}
                          className="hover:underline cursor-pointer"
                        >
                          {row.lot_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.packing_slip_id ? (
                          <Link
                            to={`/p2/packing-slip/${row.packing_slip_id}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            {row.packing_slip_number || '—'}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {row.po_number || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {row.customer_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                        <span className="font-mono text-xs">{row.part_number}</span>
                        {row.part_name && (
                          <span className="ml-1 text-xs">{row.part_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
                        {fmt(row.shipped_at || row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${statusColor(row.status)}`}>
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                          <Link to={`/p2/shipments/${row.id}`}>
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Shipment
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center pb-2">
        Showing {filtered.length} of {rows.length} records · newest first
      </p>
    </div>
  );
}

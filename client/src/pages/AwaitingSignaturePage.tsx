import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PenLine,
  Search,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  RefreshCw,
} from 'lucide-react';
import { format, isAfter } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface AwaitingOrder {
  orderId: string;
  orderDate: string;
  dueDate: string;
  status: string;
  modelId: string | null;
  handedness: string | null;
  notes: string | null;
  urgency: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  createdAt: string;
  hasSigned: boolean;
  signedAt: string | null;
  isReplacement: boolean;
  daysWaiting: number;
}

interface ApiResponse {
  orders: AwaitingOrder[];
  total: number;
  overdue: number;
  signed: number;
}

type SortKey = 'orderId' | 'customerName' | 'modelId' | 'dueDate' | 'daysWaiting' | 'hasSigned';

function formatModel(modelId: string | null): string {
  if (!modelId) return '—';
  return modelId
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function urgencyBadge(urgency: string) {
  const map: Record<string, { label: string; className: string }> = {
    critical: { label: 'Critical', className: 'bg-red-100 text-red-800 border-red-300' },
    high:     { label: 'High',     className: 'bg-orange-100 text-orange-800 border-orange-300' },
    medium:   { label: 'Medium',   className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    low:      { label: 'Low',      className: 'bg-slate-100 text-slate-600 border-slate-300' },
  };
  const cfg = map[urgency?.toLowerCase()] ?? map['low'];
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

export default function AwaitingSignaturePage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data, isLoading, refetch, isRefetching } = useQuery<ApiResponse>({
    queryKey: ['/api/orders/awaiting-signature'],
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    if (!data?.orders) return [];
    const q = search.toLowerCase().trim();
    let list = data.orders;

    if (q) {
      list = list.filter(
        (o) =>
          o.orderId.toLowerCase().includes(q) ||
          (o.customerName ?? '').toLowerCase().includes(q) ||
          (o.modelId ?? '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'orderId') cmp = a.orderId.localeCompare(b.orderId);
      else if (sortKey === 'customerName') cmp = (a.customerName ?? '').localeCompare(b.customerName ?? '');
      else if (sortKey === 'modelId') cmp = (a.modelId ?? '').localeCompare(b.modelId ?? '');
      else if (sortKey === 'dueDate') cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      else if (sortKey === 'daysWaiting') cmp = a.daysWaiting - b.daysWaiting;
      else if (sortKey === 'hasSigned') cmp = Number(a.hasSigned) - Number(b.hasSigned);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 text-slate-400" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5 ml-1 text-blue-600" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1 text-blue-600" />;
  }

  function exportCSV() {
    if (!filtered.length) return;
    const headers = ['Order ID', 'Customer', 'Model', 'Handedness', 'Due Date', 'Days Waiting', 'Signed', 'Signed At', 'Urgency'];
    const rows = filtered.map((o) => [
      o.orderId,
      o.customerName ?? '',
      formatModel(o.modelId),
      o.handedness ?? '',
      format(new Date(o.dueDate), 'MM/dd/yyyy'),
      o.daysWaiting,
      o.hasSigned ? 'Yes' : 'No',
      o.signedAt ? format(new Date(o.signedAt), 'MM/dd/yyyy') : '',
      o.urgency,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `awaiting-signature-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `${filtered.length} orders exported to CSV.` });
  }

  const now = new Date();
  const overdueCount = filtered.filter((o) => isAfter(now, new Date(o.dueDate))).length;
  const signedCount = filtered.filter((o) => o.hasSigned).length;

  return (
    <div className="p-6 max-w-screen-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <PenLine className="h-5 w-5 text-blue-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              Awaiting Customer Signature
            </h1>
            <p className="text-sm text-slate-500">
              Active orders pending customer signature
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            disabled={!filtered.length}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Total</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {isLoading ? '—' : filtered.length}
                </p>
                {search && data && (
                  <p className="text-xs text-slate-400 mt-0.5">of {data.total} total</p>
                )}
              </div>
              <div className="p-2.5 bg-blue-50 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Overdue</p>
                <p className="text-3xl font-bold text-red-600 mt-0.5">
                  {isLoading ? '—' : overdueCount}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">past due date</p>
              </div>
              <div className="p-2.5 bg-red-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">Signed</p>
                <p className="text-3xl font-bold text-green-600 mt-0.5">
                  {isLoading ? '—' : signedCount}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">have signature on file</p>
              </div>
              <div className="p-2.5 bg-green-50 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold">Orders</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by order, customer, model…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 h-8 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading orders…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
              <PenLine className="h-8 w-8 opacity-30" />
              <p className="text-sm">{search ? 'No orders match your search.' : 'No orders awaiting signature.'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort('orderId')}
                    >
                      <span className="flex items-center">Order ID <SortIcon col="orderId" /></span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('customerName')}
                    >
                      <span className="flex items-center">Customer <SortIcon col="customerName" /></span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('modelId')}
                    >
                      <span className="flex items-center">Model <SortIcon col="modelId" /></span>
                    </TableHead>
                    <TableHead>Hand</TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort('dueDate')}
                    >
                      <span className="flex items-center">Due Date <SortIcon col="dueDate" /></span>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => toggleSort('daysWaiting')}
                    >
                      <span className="flex items-center">Days Waiting <SortIcon col="daysWaiting" /></span>
                    </TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => toggleSort('hasSigned')}
                    >
                      <span className="flex items-center">Signed <SortIcon col="hasSigned" /></span>
                    </TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((order) => {
                    const isOverdue = isAfter(now, new Date(order.dueDate));
                    return (
                      <TableRow
                        key={order.orderId}
                        className={isOverdue ? 'bg-red-50/40 dark:bg-red-900/10' : undefined}
                      >
                        <TableCell className="font-mono font-semibold text-sm">
                          <div className="flex items-center gap-1.5">
                            {order.isReplacement && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 border-purple-300 text-purple-700 bg-purple-50">
                                Repl
                              </Badge>
                            )}
                            {order.orderId}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <div className="truncate text-sm">
                            {order.customerName ?? (
                              <span className="text-slate-400 italic">Unknown</span>
                            )}
                          </div>
                          {order.customerEmail && (
                            <div className="text-xs text-slate-400 truncate">{order.customerEmail}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                          {formatModel(order.modelId)}
                        </TableCell>
                        <TableCell className="text-sm capitalize">
                          {order.handedness ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                            {format(new Date(order.dueDate), 'MM/dd/yyyy')}
                          </div>
                          {isOverdue && (
                            <div className="text-xs text-red-500 flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> Overdue
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-medium ${order.daysWaiting > 14 ? 'text-orange-600' : order.daysWaiting > 7 ? 'text-yellow-600' : 'text-slate-600'}`}>
                            {order.daysWaiting}d
                          </span>
                        </TableCell>
                        <TableCell>{urgencyBadge(order.urgency)}</TableCell>
                        <TableCell>
                          {order.hasSigned ? (
                            <div className="flex flex-col gap-0.5">
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 w-fit">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Signed
                              </Badge>
                              {order.signedAt && (
                                <span className="text-[10px] text-slate-400">
                                  {format(new Date(order.signedAt), 'MM/dd/yy')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
                              <Clock className="h-3 w-3 mr-1" /> Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link href={`/orders-management?orderId=${order.orderId}`}>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                              View <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/30">
              Showing {filtered.length} {filtered.length === 1 ? 'order' : 'orders'}
              {search && data && ` (filtered from ${data.total})`}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

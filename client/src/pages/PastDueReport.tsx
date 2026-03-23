import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, differenceInDays, subDays } from 'date-fns';
import { Calendar, ChevronUp, ChevronDown, ChevronsUpDown, Download, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const EXCLUDED_STATUSES = ['FULFILLED', 'CANCELLED', 'HOLDING'];
const DEFAULT_DAYS_THRESHOLD = 14;

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerName?: string;
  customerPO: string;
  modelId: string;
  status: string;
  currentDepartment?: string;
  urgency?: string;
}

type SortKey = 'daysOverdue' | 'orderId' | 'customerName' | 'modelId' | 'dueDate' | 'status' | 'currentDepartment';
type SortDir = 'asc' | 'desc';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  REWORK: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  QC_HOLD: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const URGENCY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-gray-400 inline ml-0.5" />;
  return sortDir === 'asc'
    ? <ChevronUp className="w-3 h-3 text-blue-500 inline ml-0.5" />
    : <ChevronDown className="w-3 h-3 text-blue-500 inline ml-0.5" />;
}

export default function PastDueReport() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [selectedDate, setSelectedDate] = useState(today);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('daysOverdue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: allOrders = [], isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
  });

  const cutoff = useMemo(() => {
    const base = new Date(selectedDate + 'T00:00:00');
    return subDays(base, DEFAULT_DAYS_THRESHOLD);
  }, [selectedDate]);

  const filteredOrders = useMemo(() => {
    return allOrders
      .filter((o) => {
        if (EXCLUDED_STATUSES.includes(o.status)) return false;
        if (o.currentDepartment === 'Fulfilled') return false;
        const due = new Date(o.dueDate);
        if (isNaN(due.getTime())) return false;
        return due < cutoff;
      })
      .map((o) => {
        const due = new Date(o.dueDate);
        const refDate = new Date(selectedDate + 'T00:00:00');
        const daysOverdue = differenceInDays(refDate, due);
        return { ...o, daysOverdue };
      })
      .filter((o) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          o.orderId.toLowerCase().includes(q) ||
          (o.customerName ?? '').toLowerCase().includes(q) ||
          o.modelId.toLowerCase().includes(q) ||
          (o.currentDepartment ?? '').toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q)
        );
      });
  }, [allOrders, cutoff, search, selectedDate]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredOrders].sort((a, b) => {
      const av = a[sortKey as keyof typeof a] ?? '';
      const bv = b[sortKey as keyof typeof b] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredOrders, sortKey, sortDir]);

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col);
      setSortDir('desc');
    }
  }

  function exportCSV() {
    const header = ['Order ID', 'Customer', 'Model', 'Due Date', 'Days Overdue', 'Status', 'Department'];
    const rows = sorted.map((o) => [
      o.orderId,
      o.customerName ?? '',
      o.modelId,
      format(new Date(o.dueDate), 'yyyy-MM-dd'),
      String(o.daysOverdue),
      o.status,
      o.currentDepartment ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `past-due-report-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-gray-800 dark:hover:text-gray-200"
      onClick={() => toggleSort(col)}
    >
      {label}
      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </th>
  );

  return (
    <div className="p-4 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Past Due Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Active orders with a due date more than 14 days before the selected date. Excludes FULFILLED, CANCELLED, and HOLDING.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={sorted.length === 0} className="shrink-0">
          <Download className="w-4 h-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-1.5 shadow-sm">
          <Calendar className="w-4 h-4 text-gray-500" />
          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">Reference date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-sm bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 cursor-pointer"
          />
        </div>
        <Input
          placeholder="Search order, customer, model, department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-9 text-sm"
        />
        {!isLoading && (
          <span className="text-sm text-gray-500 ml-auto">
            {sorted.length} order{sorted.length !== 1 ? 's' : ''} found
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm bg-white dark:bg-gray-900">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-500 text-sm">Loading orders…</div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
            <AlertTriangle className="w-8 h-8 text-gray-300" />
            <p className="text-sm">No past-due orders for the selected date.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <Th col="orderId" label="Order ID" />
                  <Th col="customerName" label="Customer" />
                  <Th col="modelId" label="Model" />
                  <Th col="dueDate" label="Due Date" />
                  <Th col="daysOverdue" label="Days Overdue" />
                  <Th col="status" label="Status" />
                  <Th col="currentDepartment" label="Department" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {sorted.map((order) => {
                  const overdueSeverity =
                    order.daysOverdue >= 60
                      ? 'text-red-700 font-bold dark:text-red-400'
                      : order.daysOverdue >= 30
                      ? 'text-orange-600 font-semibold dark:text-orange-400'
                      : 'text-yellow-700 dark:text-yellow-400';

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                    >
                      {/* Order ID */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {order.urgency && URGENCY_DOT[order.urgency] && (
                            <span className={`w-2 h-2 rounded-full shrink-0 ${URGENCY_DOT[order.urgency]}`} />
                          )}
                          <a
                            href={`/order-timeline?orderId=${order.orderId}`}
                            className="font-mono font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                          >
                            {order.orderId}
                          </a>
                        </div>
                      </td>
                      {/* Customer */}
                      <td className="px-3 py-2.5 text-gray-700 dark:text-gray-300 max-w-[180px] truncate">
                        {order.customerName ?? order.customerId}
                      </td>
                      {/* Model */}
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {order.modelId}
                      </td>
                      {/* Due Date */}
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">
                        {format(new Date(order.dueDate), 'MMM d, yyyy')}
                      </td>
                      {/* Days Overdue */}
                      <td className={`px-3 py-2.5 whitespace-nowrap ${overdueSeverity}`}>
                        {order.daysOverdue}d
                      </td>
                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                            STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      {/* Department */}
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400 max-w-[160px] truncate">
                        {order.currentDepartment ?? <span className="text-gray-400 italic">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary bar */}
      {!isLoading && sorted.length > 0 && (
        <div className="mt-3 flex gap-4 text-xs text-gray-500">
          <span>
            <span className="font-bold text-red-600">{sorted.filter((o) => o.daysOverdue >= 60).length}</span> ≥ 60d overdue
          </span>
          <span>
            <span className="font-bold text-orange-500">{sorted.filter((o) => o.daysOverdue >= 30 && o.daysOverdue < 60).length}</span> 30–59d overdue
          </span>
          <span>
            <span className="font-bold text-yellow-600">{sorted.filter((o) => o.daysOverdue >= 14 && o.daysOverdue < 30).length}</span> 14–29d overdue
          </span>
        </div>
      )}
    </div>
  );
}

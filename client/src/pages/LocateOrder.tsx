import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, AlertCircle, CheckCircle2, Clock, Building2, CalendarDays, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LocateResult {
  found: true;
  orderId: string;
  sourceType: 'SO' | 'PRODUCTION_ORDER' | 'DRAFT';
  currentDepartment: string | null;
  status: string | null;
  customer: string | null;
  dueDate: string | null;
  lastUpdated: string | null;
}

interface LocateNotFound {
  found: false;
}

type LocateResponse = LocateResult | LocateNotFound;

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  SO: { label: 'Sales Order', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  PRODUCTION_ORDER: { label: 'Production Order', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

function formatDate(val: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(val: string | null): string {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function LocateOrder() {
  const [inputValue, setInputValue] = useState('');
  const [searchId, setSearchId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching, isError } = useQuery<LocateResponse>({
    queryKey: ['/api/orders/locate', searchId],
    enabled: !!searchId,
    retry: false,
    staleTime: 0,
  });

  function handleSearch() {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSearchId(trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSearch();
  }

  function handleClear() {
    setInputValue('');
    setSearchId(null);
    inputRef.current?.focus();
  }

  const hasSearched = !!searchId;
  const result = data;
  const found = result?.found === true ? (result as LocateResult) : null;
  const isOverdue = found?.dueDate ? new Date(found.dueDate) < new Date() : false;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MapPin className="h-6 w-6 text-blue-600" />
            Locate Order
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Find any order across Sales Orders, Production Orders (PO/P1), and Drafts.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              ref={inputRef}
              className="pl-9 font-mono"
              placeholder="e.g. P1-P19206-122-1 · PO-58621458-414-1 · 2024-0001"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
          <Button onClick={handleSearch} disabled={isFetching || !inputValue.trim()}>
            {isFetching ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Search'}
          </Button>
          {hasSearched && (
            <Button variant="ghost" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>

        {isFetching && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-gray-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
              Searching all_orders → production_orders → order_drafts…
            </CardContent>
          </Card>
        )}

        {isError && !isFetching && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="py-6 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm">Lookup failed. Check server logs for details.</span>
            </CardContent>
          </Card>
        )}

        {!isFetching && !isError && hasSearched && result && !result.found && (
          <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="py-6 flex items-center gap-3 text-yellow-700 dark:text-yellow-400">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Order not found</p>
                <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-0.5">
                  <span className="font-mono">{searchId}</span> was not found in all_orders, production_orders, or order_drafts.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!isFetching && found && (
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <CardTitle className="text-base font-mono">{found.orderId}</CardTitle>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SOURCE_LABELS[found.sourceType]?.color}`}>
                    {SOURCE_LABELS[found.sourceType]?.label ?? found.sourceType}
                  </span>
                </div>
                {found.status && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {found.status}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Building2 className="h-3.5 w-3.5" />
                    Current Department
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {found.currentDepartment ?? <span className="text-gray-400 font-normal">Not assigned</span>}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Due Date
                  </div>
                  <p className={`text-sm font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                    {formatDate(found.dueDate)}
                    {isOverdue && <span className="text-xs ml-1 font-normal">(overdue)</span>}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 space-y-0.5">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Customer</div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {found.customer ?? <span className="text-gray-400 font-normal">—</span>}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-md p-3 space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                    Last Updated
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatDateTime(found.lastUpdated)}
                  </p>
                </div>
              </div>

              <div className="text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
                Source table:{' '}
                <span className="font-mono">
                  {found.sourceType === 'SO' ? 'all_orders' : found.sourceType === 'PRODUCTION_ORDER' ? 'production_orders' : 'order_drafts'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {!hasSearched && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-600 text-sm space-y-1">
            <MapPin className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>Enter any Order ID to locate it across all tables.</p>
            <p className="text-xs">Searches: all_orders → production_orders → order_drafts</p>
          </div>
        )}
      </div>
    </div>
  );
}

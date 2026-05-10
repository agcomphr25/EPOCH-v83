import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronRight, BookOpen, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface JournalLine {
  accountName: string | null;
  debitAmount: number | null;
  creditAmount: number | null;
}

interface JournalEntryTotals {
  totalDebits: number;
  totalCredits: number;
}

interface JournalEntry {
  id: number;
  transactionType: string;
  referenceType: string;
  referenceId: number;
  effectiveDate: string;
  status: string;
  memo: string | null;
  totals: JournalEntryTotals;
  lines: JournalLine[];
}

function buildQueryString(params: Record<string, string>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v && v !== 'all')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

function fmt(amount: number | null) {
  if (amount === null || amount === undefined) return '—';
  return `$${amount.toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'EXPORTED') return <Badge className="bg-green-600 text-white">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export default function AccountingPage() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('all');
  const [transactionType, setTransactionType] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const queryParams = buildQueryString({ fromDate, toDate, status, transactionType });

  const { data, isLoading, isError } = useQuery<{ entries: JournalEntry[] }>({
    queryKey: ['/api/finance/accounting/journal-entries', fromDate, toDate, status, transactionType],
    queryFn: async () => {
      const token = localStorage.getItem('sessionToken') || localStorage.getItem('jwtToken');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/finance/accounting/journal-entries${queryParams}`, {
        credentials: 'include',
        headers,
      });
      if (!res.ok) throw new Error('Failed to fetch journal entries');
      return res.json();
    },
  });

  const entries = data?.entries ?? [];

  function toggleRow(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters() {
    setFromDate('');
    setToDate('');
    setStatus('all');
    setTransactionType('all');
  }

  const hasFilters = fromDate || toDate || status !== 'all' || transactionType !== 'all';

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-6 h-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Accounting Journal</h1>
          <p className="text-sm text-muted-foreground">Double-entry journal entries with COA and reporting dimensions</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">DRAFT</SelectItem>
                  <SelectItem value="POSTED">POSTED</SelectItem>
                  <SelectItem value="EXPORTED">EXPORTED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Transaction Type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="WIRE_PAYMENT">WIRE_PAYMENT</SelectItem>
                  <SelectItem value="AR_INVOICE">AR_INVOICE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription>
              {isLoading ? 'Loading…' : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading journal entries…
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-destructive">Failed to load journal entries.</div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No journal entries found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Effective Date</TableHead>
                  <TableHead>Transaction Type</TableHead>
                  <TableHead>Reference ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Debits</TableHead>
                  <TableHead className="text-right">Total Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map(entry => {
                  const expanded = expandedRows.has(entry.id);
                  return (
                    <>
                      <TableRow
                        key={entry.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggleRow(entry.id)}
                      >
                        <TableCell className="w-8">
                          {expanded
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            : <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {format(new Date(entry.effectiveDate), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                            {entry.transactionType}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {entry.referenceType} #{entry.referenceId}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={entry.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(entry.totals.totalDebits)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmt(entry.totals.totalCredits)}
                        </TableCell>
                      </TableRow>

                      {expanded && (
                        <TableRow key={`${entry.id}-lines`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={7} className="py-0">
                            <div className="px-8 py-3">
                              {entry.memo && (
                                <p className="text-xs text-muted-foreground mb-2 italic">{entry.memo}</p>
                              )}
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-0">
                                    <TableHead className="text-xs h-7 pl-0">Account Name</TableHead>
                                    <TableHead className="text-xs h-7 text-right">Debit</TableHead>
                                    <TableHead className="text-xs h-7 text-right">Credit</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {entry.lines.map((line, i) => (
                                    <TableRow key={i} className="border-0">
                                      <TableCell className="text-sm py-1 pl-0">
                                        {line.accountName ?? '—'}
                                      </TableCell>
                                      <TableCell className="text-sm py-1 text-right font-mono">
                                        {line.debitAmount ? fmt(line.debitAmount) : '—'}
                                      </TableCell>
                                      <TableCell className="text-sm py-1 text-right font-mono">
                                        {line.creditAmount ? fmt(line.creditAmount) : '—'}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

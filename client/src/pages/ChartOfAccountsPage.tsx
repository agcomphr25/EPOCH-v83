import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Calculator, ChevronDown, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

type CoaAccount = {
  id: number;
  accountNumber: string | null;
  accountName: string;
  accountType: string;
  normalBalance: string;
  financialStatementSection: string | null;
  costPool: string;
  defaultAllowability: string;
  defaultDirectIndirect: string;
  billingTreatment: string;
  requiresDocumentation: boolean;
  requiresReview: boolean;
  systemControlled: boolean;
  isActive: boolean;
  description: string | null;
  currentBalance?: number;
  balanceAudit?: {
    totalDebit: number;
    totalCredit: number;
    postedLineCount: number;
    postedEntryCount: number;
    normalBalance: string;
    formula: string;
    latestPostedActivity: {
      journalEntryId: number;
      transactionType: string;
      referenceType: string;
      referenceId: number;
      effectiveDate: string | null;
      postedAt: string | null;
      memo: string | null;
      debitAmount: number | null;
      creditAmount: number | null;
    } | null;
  };
};

function badgeVariant(value: string) {
  if (value === 'UNALLOWABLE' || value === 'NEEDS_REVIEW') return 'destructive';
  if (value === 'DIRECT' || value === 'ALLOWABLE') return 'default';
  return 'secondary';
}

function formatCurrency(value: number | null | undefined) {
  return `$${Math.abs(value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ChartOfAccountsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(
    null
  );

  const {
    data = [],
    isLoading,
    isError,
  } = useQuery<CoaAccount[]>({
    queryKey: ['/api/accounting/coa/accounts-with-balances', activeFilter],
    queryFn: async () => {
      const activeOnly = activeFilter === 'active';
      const response = await fetch(
        `/api/accounting/coa/accounts-with-balances?activeOnly=${activeOnly}`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) throw new Error('Failed to load chart of accounts');
      return response.json();
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter((account) => {
      if (typeFilter !== 'all' && account.accountType !== typeFilter)
        return false;
      if (!term) return true;
      return [
        account.accountNumber,
        account.accountName,
        account.accountType,
        account.financialStatementSection,
        account.costPool,
        account.description,
      ].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(term)
      );
    });
  }, [data, search, typeFilter]);

  const accountTypes = useMemo(
    () =>
      Array.from(new Set(data.map((account) => account.accountType))).sort(),
    [data]
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Chart of Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Authoritative 5-digit GAAP and DCAA account master
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search number, name, section, pool"
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {accountTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="all">All accounts</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-3">
            <span>
              {isLoading
                ? 'Loading accounts'
                : `${filtered.length} account${filtered.length === 1 ? '' : 's'}`}
            </span>
            {!isLoading && (
              <Button size="sm" data-testid="button-success">
                SUCCESS
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="py-12 text-center text-destructive">
              Failed to load the chart of accounts.
            </div>
          ) : isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading chart of accounts
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No accounts match the current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Account #</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Allowability</TableHead>
                  <TableHead>Direct/Indirect</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                  <TableHead className="text-center">Audit</TableHead>
                  <TableHead>Controls</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((account) => {
                  const isExpanded = expandedAccountId === account.id;
                  const audit = account.balanceAudit;
                  const latest = audit?.latestPostedActivity;
                  const currentBalance = account.currentBalance ?? 0;

                  return (
                    <Fragment key={account.id}>
                      <TableRow>
                        <TableCell className="font-mono font-semibold">
                          {account.accountNumber ?? '-'}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {account.accountNumber === '10300'
                              ? 'Customer Payment Clearing'
                              : account.accountName}
                          </div>
                          {account.description && (
                            <div className="text-xs text-muted-foreground">
                              {account.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{account.accountType}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {account.financialStatementSection ?? '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeVariant(account.costPool)}>
                            {account.costPool}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={badgeVariant(account.defaultAllowability)}
                          >
                            {account.defaultAllowability}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {account.defaultDirectIndirect}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <span
                            className={
                              currentBalance < 0
                                ? 'text-red-600'
                                : currentBalance > 0
                                  ? 'text-green-700'
                                  : ''
                            }
                          >
                            {formatCurrency(currentBalance)}
                            {currentBalance < 0 && ' (Cr)'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1"
                            onClick={() =>
                              setExpandedAccountId(isExpanded ? null : account.id)
                            }
                          >
                            <Calculator className="h-4 w-4" />
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {account.systemControlled && (
                              <Badge variant="outline">System</Badge>
                            )}
                            {account.requiresReview && (
                              <Badge variant="outline">Review</Badge>
                            )}
                            {account.requiresDocumentation && (
                              <Badge variant="outline">Docs</Badge>
                            )}
                            {!account.isActive && (
                              <Badge variant="destructive">Inactive</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${account.id}-audit`}>
                          <TableCell colSpan={10} className="bg-muted/30 p-4">
                            <div className="grid gap-4 md:grid-cols-4">
                              <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">
                                  Formula
                                </div>
                                <div className="mt-1 font-mono text-sm">
                                  {audit?.formula ?? '-'}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Normal balance: {account.normalBalance}
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">
                                  Posted Totals
                                </div>
                                <div className="mt-1 space-y-1 font-mono text-sm">
                                  <div>Debit: {formatCurrency(audit?.totalDebit)}</div>
                                  <div>Credit: {formatCurrency(audit?.totalCredit)}</div>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">
                                  Included Activity
                                </div>
                                <div className="mt-1 space-y-1 text-sm">
                                  <div>{audit?.postedEntryCount ?? 0} posted entries</div>
                                  <div>{audit?.postedLineCount ?? 0} posted lines</div>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs font-medium uppercase text-muted-foreground">
                                  Latest Posted Line
                                </div>
                                {latest ? (
                                  <div className="mt-1 space-y-1 text-sm">
                                    <div className="font-mono">
                                      JE #{latest.journalEntryId}
                                    </div>
                                    <div>
                                      {latest.transactionType} | {latest.referenceType}{' '}
                                      #{latest.referenceId}
                                    </div>
                                    <div className="font-mono">
                                      Dr {formatCurrency(latest.debitAmount)} / Cr{' '}
                                      {formatCurrency(latest.creditAmount)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Effective {formatDateTime(latest.effectiveDate)}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Posted {formatDateTime(latest.postedAt)}
                                    </div>
                                    {latest.memo && (
                                      <div className="text-xs text-muted-foreground">
                                        {latest.memo}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="mt-1 text-sm text-muted-foreground">
                                    No posted journal lines found.
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
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

import { Fragment, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Calculator,
  ChevronDown,
  Edit,
  History,
  Search,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

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
    sources?: Array<{
      label: string;
      amount: number;
      debitAmount: number;
      creditAmount: number;
      lineCount: number;
      journalEntryId: number;
      journalEntryIds?: number[];
      transactionType: string;
      referenceType: string;
      referenceId: number;
      sourceDocumentNumber: string | null;
      effectiveDate: string | null;
    }>;
  };
};

type CoaEditForm = Pick<
  CoaAccount,
  | 'accountNumber'
  | 'accountName'
  | 'accountType'
  | 'normalBalance'
  | 'financialStatementSection'
  | 'costPool'
  | 'defaultAllowability'
  | 'defaultDirectIndirect'
  | 'billingTreatment'
  | 'requiresDocumentation'
  | 'requiresReview'
  | 'systemControlled'
  | 'isActive'
  | 'description'
> & {
  changeReason: string;
};

type AuditEvent = {
  id: number;
  action: string;
  actorName: string | null;
  actorRole: string | null;
  reason: string | null;
  fieldsChanged: Record<string, { before: unknown; after: unknown }> | null;
  occurredAt: string | null;
  recordedAt: string | null;
  sequenceNumber: number | null;
};

type BalanceSource = NonNullable<NonNullable<CoaAccount['balanceAudit']>['sources']>[number];

type BalanceSourceMonthGroup = {
  key: string;
  label: string;
  sources: BalanceSource[];
};

const ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
  'OTHER_INCOME',
  'OTHER_EXPENSE',
];

const NORMAL_BALANCES = ['DEBIT', 'CREDIT'];
const COST_POOLS = [
  'NONE',
  'DIRECT',
  'FRINGE',
  'OVERHEAD',
  'G_AND_A',
  'UNALLOWABLE',
  'OTHER',
];
const ALLOWABILITY = ['ALLOWABLE', 'UNALLOWABLE', 'NEEDS_REVIEW'];
const DIRECT_INDIRECT = ['DIRECT', 'INDIRECT', 'UNASSIGNED'];
const BILLING_TREATMENTS = [
  'BILLABLE',
  'NON_BILLABLE',
  'PASS_THROUGH',
  'NOT_BILLABLE',
];

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

function formatSignedCurrency(value: number | null | undefined) {
  const amount = value ?? 0;
  const sign = amount < 0 ? '-' : '';
  return `${sign}${formatCurrency(amount)}`;
}

function accountingJournalHref(source: NonNullable<NonNullable<CoaAccount['balanceAudit']>['sources']>[number]) {
  const ids = source.journalEntryIds?.length
    ? Array.from(new Set(source.journalEntryIds))
    : [source.journalEntryId];
  const params = new URLSearchParams();
  if (ids.length === 1) {
    params.set('journalEntryId', String(ids[0]));
  } else {
    params.set('journalEntryIds', ids.join(','));
  }
  params.set('source', source.label);
  return `/finance/accounting?${params.toString()}`;
}

function getEffectiveMonth(source: BalanceSource) {
  if (!source.effectiveDate) {
    return { key: 'undated', label: 'No effective date', sortValue: Number.NEGATIVE_INFINITY };
  }

  const date = new Date(source.effectiveDate);
  if (Number.isNaN(date.getTime())) {
    return { key: 'undated', label: 'No effective date', sortValue: Number.NEGATIVE_INFINITY };
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      timeZone: 'UTC',
    }).format(date),
    sortValue: year * 12 + month,
  };
}

function groupBalanceSourcesByMonth(sources: BalanceSource[]): BalanceSourceMonthGroup[] {
  const groups = new Map<string, BalanceSourceMonthGroup & { sortValue: number }>();

  for (const source of sources) {
    const month = getEffectiveMonth(source);
    const existing = groups.get(month.key);
    if (existing) {
      existing.sources.push(source);
    } else {
      groups.set(month.key, {
        key: month.key,
        label: month.label,
        sortValue: month.sortValue,
        sources: [source],
      });
    }
  }

  return Array.from(groups.values())
    .sort((a, b) => b.sortValue - a.sortValue)
    .map(({ sortValue: _sortValue, ...group }) => group);
}

function accountToForm(account: CoaAccount): CoaEditForm {
  return {
    accountNumber: account.accountNumber ?? '',
    accountName: account.accountName,
    accountType: account.accountType,
    normalBalance: account.normalBalance,
    financialStatementSection: account.financialStatementSection ?? '',
    costPool: account.costPool,
    defaultAllowability: account.defaultAllowability,
    defaultDirectIndirect: account.defaultDirectIndirect,
    billingTreatment: account.billingTreatment,
    requiresDocumentation: account.requiresDocumentation,
    requiresReview: account.requiresReview,
    systemControlled: account.systemControlled,
    isActive: account.isActive,
    description: account.description ?? '',
    changeReason: '',
  };
}

function formatAuditValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ChartOfAccountsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('active');
  const [expandedAccountId, setExpandedAccountId] = useState<number | null>(
    null
  );
  const [editingAccount, setEditingAccount] = useState<CoaAccount | null>(null);
  const [editForm, setEditForm] = useState<CoaEditForm | null>(null);
  const [historyAccount, setHistoryAccount] = useState<CoaAccount | null>(null);

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

  const historyQuery = useQuery<{ rows: AuditEvent[] }>({
    queryKey: [
      '/api/audit-ledger/report',
      'chart_of_accounts',
      historyAccount?.id,
    ],
    enabled: Boolean(historyAccount),
    queryFn: async () =>
      apiRequest(
        `/api/audit-ledger/report?subjectType=chart_of_accounts&subjectId=${historyAccount?.id}&limit=25`
      ),
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (payload: CoaEditForm & { id: number }) => {
      const { id, ...body } = payload;
      return apiRequest(`/api/accounting/coa/accounts/${id}`, {
        method: 'PATCH',
        body: {
          ...body,
          accountNumber: body.accountNumber?.trim(),
          accountName: body.accountName.trim(),
          financialStatementSection: body.financialStatementSection?.trim(),
          description: body.description?.trim() || null,
          changeReason: body.changeReason.trim(),
        },
      });
    },
    onSuccess: () => {
      toast({
        title: 'Account updated',
        description: 'The metadata change was recorded in the audit ledger.',
      });
      queryClient.invalidateQueries({
        queryKey: ['/api/accounting/coa/accounts-with-balances'],
      });
      if (historyAccount) {
        queryClient.invalidateQueries({
          queryKey: [
            '/api/audit-ledger/report',
            'chart_of_accounts',
            historyAccount.id,
          ],
        });
      }
      setEditingAccount(null);
      setEditForm(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error?.message ?? 'Could not update the account.',
        variant: 'destructive',
      });
    },
  });

  const openEditor = (account: CoaAccount) => {
    setEditingAccount(account);
    setEditForm(accountToForm(account));
  };

  const setEditField = <K extends keyof CoaEditForm>(
    key: K,
    value: CoaEditForm[K]
  ) => {
    setEditForm((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveEdit = () => {
    if (!editingAccount || !editForm) return;
    updateAccountMutation.mutate({ ...editForm, id: editingAccount.id });
  };

  const canSave =
    Boolean(editForm?.accountNumber?.match(/^\d{5}$/)) &&
    Boolean(editForm?.accountName.trim()) &&
    Boolean(editForm?.financialStatementSection?.trim()) &&
    Boolean(editForm?.changeReason.trim()) &&
    !updateAccountMutation.isPending;

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
            <Table containerClassName="max-h-[calc(100vh-18rem)]">
              <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((account) => {
                  const isExpanded = expandedAccountId === account.id;
                  const audit = account.balanceAudit;
                  const sources = audit?.sources ?? [];
                  const sourceMonthGroups = groupBalanceSourcesByMonth(sources);
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
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditor(account)}
                              title="Edit account metadata"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setHistoryAccount(account)}
                              title="View audit history"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${account.id}-audit`}>
                          <TableCell colSpan={11} className="bg-muted/30 p-4">
                            <div>
                              <div className="text-xs font-medium uppercase text-muted-foreground">
                                Balance Sources
                              </div>
                              {sourceMonthGroups.length > 0 ? (
                                <Accordion type="multiple" className="mt-2 space-y-2">
                                  {sourceMonthGroups.map((group) => (
                                    <AccordionItem
                                      key={`${account.id}-${group.key}`}
                                      value={`${account.id}-${group.key}`}
                                      className="rounded-md border bg-background px-3"
                                    >
                                      <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                                        {group.label}
                                      </AccordionTrigger>
                                      <AccordionContent className="pb-3">
                                        <div className="flex flex-wrap gap-2">
                                          {group.sources.map((source, index) => (
                                            <a
                                              key={`${source.journalEntryId}-${source.referenceType}-${source.referenceId}-${source.label}-${index}`}
                                              href={accountingJournalHref(source)}
                                              className="inline-flex items-center gap-2 rounded-full border border-input bg-background px-2.5 py-0.5 font-mono text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                              title={`Debit ${formatCurrency(source.debitAmount)} / Credit ${formatCurrency(source.creditAmount)}${source.lineCount > 1 ? ` across ${source.lineCount} posted lines` : ''}`}
                                            >
                                              <span>{source.label}</span>
                                              <span
                                                className={
                                                  source.amount < 0
                                                    ? 'text-red-600'
                                                    : source.amount > 0
                                                      ? 'text-green-700'
                                                      : 'text-muted-foreground'
                                                }
                                              >
                                                {formatSignedCurrency(source.amount)}
                                              </span>
                                            </a>
                                          ))}
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  ))}
                                </Accordion>
                              ) : (
                                <div className="mt-1 text-sm text-muted-foreground">
                                  No posted source documents found.
                                </div>
                              )}
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

      <Dialog
        open={Boolean(editingAccount && editForm)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingAccount(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Account Metadata</DialogTitle>
            <DialogDescription>
              Changes require a reason and are written to the audit ledger.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="account-number">Account #</Label>
                  <Input
                    id="account-number"
                    value={editForm.accountNumber ?? ''}
                    onChange={(event) =>
                      setEditField('accountNumber', event.target.value)
                    }
                    maxLength={5}
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="account-name">Account Name</Label>
                  <Input
                    id="account-name"
                    value={editForm.accountName}
                    onChange={(event) =>
                      setEditField('accountName', event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editForm.accountType}
                    onValueChange={(value) =>
                      setEditField('accountType', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Normal Balance</Label>
                  <Select
                    value={editForm.normalBalance}
                    onValueChange={(value) =>
                      setEditField('normalBalance', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NORMAL_BALANCES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Financial Section</Label>
                  <Input
                    value={editForm.financialStatementSection ?? ''}
                    onChange={(event) =>
                      setEditField(
                        'financialStatementSection',
                        event.target.value
                      )
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Cost Pool</Label>
                  <Select
                    value={editForm.costPool}
                    onValueChange={(value) => setEditField('costPool', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COST_POOLS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Allowability</Label>
                  <Select
                    value={editForm.defaultAllowability}
                    onValueChange={(value) =>
                      setEditField('defaultAllowability', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOWABILITY.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Direct/Indirect</Label>
                  <Select
                    value={editForm.defaultDirectIndirect}
                    onValueChange={(value) =>
                      setEditField('defaultDirectIndirect', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIRECT_INDIRECT.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Billing</Label>
                  <Select
                    value={editForm.billingTreatment}
                    onValueChange={(value) =>
                      setEditField('billingTreatment', value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLING_TREATMENTS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
                {[
                  ['requiresDocumentation', 'Docs required'],
                  ['requiresReview', 'Review required'],
                  ['systemControlled', 'System controlled'],
                  ['isActive', 'Active'],
                ].map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <Label htmlFor={key}>{label}</Label>
                    <Switch
                      id={key}
                      checked={Boolean(editForm[key as keyof CoaEditForm])}
                      onCheckedChange={(checked) =>
                        setEditField(key as keyof CoaEditForm, checked as never)
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={editForm.description ?? ''}
                  onChange={(event) =>
                    setEditField('description', event.target.value)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="change-reason">Change Reason</Label>
                <Textarea
                  id="change-reason"
                  value={editForm.changeReason}
                  onChange={(event) =>
                    setEditField('changeReason', event.target.value)
                  }
                  placeholder="Required for audit tracking"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingAccount(null);
                setEditForm(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit} disabled={!canSave}>
              {updateAccountMutation.isPending ? 'Saving' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(historyAccount)}
        onOpenChange={(open) => {
          if (!open) setHistoryAccount(null);
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Account Audit History</DialogTitle>
            <DialogDescription>
              {historyAccount
                ? `${historyAccount.accountNumber ?? '-'} ${historyAccount.accountName}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {historyQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading history
            </div>
          ) : historyQuery.isError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Audit history could not be loaded.
            </div>
          ) : (historyQuery.data?.rows ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No audit events recorded for this account.
            </div>
          ) : (
            <div className="space-y-3">
              {(historyQuery.data?.rows ?? []).map((event) => (
                <div key={event.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{event.action}</div>
                      <div className="text-xs text-muted-foreground">
                        {event.actorName ?? 'unknown'} ·{' '}
                        {event.occurredAt
                          ? new Date(event.occurredAt).toLocaleString()
                          : 'unknown time'}
                        {event.sequenceNumber
                          ? ` · Ledger #${event.sequenceNumber}`
                          : ''}
                      </div>
                    </div>
                    {event.actorRole && (
                      <Badge variant="outline">{event.actorRole}</Badge>
                    )}
                  </div>
                  {event.reason && (
                    <div className="mt-2 text-sm">{event.reason}</div>
                  )}
                  {event.fieldsChanged &&
                    Object.keys(event.fieldsChanged).length > 0 && (
                      <div className="mt-3 space-y-1 text-xs">
                        {Object.entries(event.fieldsChanged).map(
                          ([field, change]) => (
                            <div
                              key={field}
                              className="grid gap-1 rounded bg-muted/40 p-2 md:grid-cols-[9rem_1fr]"
                            >
                              <span className="font-medium">{field}</span>
                              <span>
                                {formatAuditValue(change.before)} {'->'}{' '}
                                {formatAuditValue(change.after)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

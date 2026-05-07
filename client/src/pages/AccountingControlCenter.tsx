import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  Download,
  FileCheck,
  Landmark,
  Loader2,
  Receipt,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

type TransactionType = 'EMPLOYEE_REIMBURSEMENT' | 'PETTY_CASH' | 'OWNER_EXPENSE';

interface AccountingTransaction {
  id: string;
  transactionNumber: string;
  transactionType: TransactionType;
  transactionDate: string;
  direction: 'IN' | 'OUT';
  status: string;
  paidByType: string;
  paidByName: string;
  vendorName: string;
  amount: string;
  businessPurpose: string;
  projectId: string | null;
  contractNumber: string | null;
  directIndirect: string;
  costCategory: string;
  reimbursementRequired: boolean;
  payrollReimbursement: boolean;
  payrollStatus: string;
  receiptStatus: string;
  glAccountId: number | null;
  glAccountName: string | null;
  glAccountNameSnapshot: string | null;
  glPostingStatus: string;
  allowabilityStatus: string;
  dcaaReviewStatus: string;
  submittedByDisplayName: string;
  submittedAt: string;
}

interface Summary {
  totalCount: number;
  submittedCount: number;
  payrollReadyCount: number;
  glPendingCount: number;
  dcaaNeedsReviewCount: number;
  reimbursableTotal: number;
  pettyCashBalanceImpact: number;
  ownerExpenseTotal: number;
}

interface Account {
  id: number;
  accountName: string;
  accountType: string;
}

const initialForm = {
  transactionType: 'EMPLOYEE_REIMBURSEMENT' as TransactionType,
  transactionDate: new Date().toISOString().slice(0, 10),
  direction: 'OUT',
  paidByType: 'EMPLOYEE',
  paidByName: '',
  vendorName: '',
  amount: '',
  paymentMethod: '',
  businessPurpose: '',
  projectId: '',
  projectName: '',
  contractNumber: '',
  costObjective: '',
  directIndirect: 'DIRECT',
  costCategory: 'MATERIALS',
  reimbursementRequired: true,
  payrollReimbursement: true,
  receiptStatus: 'MISSING',
  receiptUrl: '',
  glAccountId: 'none',
  allowabilityStatus: 'PENDING_REVIEW',
  dcaaReviewStatus: 'NEEDS_REVIEW',
  notes: '',
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0));
}

function TypeBadge({ type }: { type: TransactionType }) {
  const label = {
    EMPLOYEE_REIMBURSEMENT: 'Employee',
    PETTY_CASH: 'Petty Cash',
    OWNER_EXPENSE: 'Owner',
  }[type];
  return <Badge variant="outline">{label}</Badge>;
}

function StatusBadge({ value }: { value: string }) {
  const complete = ['COMPLETE', 'READY', 'PAID', 'POSTED', 'ALLOWABLE', 'APPROVED', 'ATTACHED'].includes(value);
  const risk = ['BLOCKED', 'MISSING', 'HELD', 'UNALLOWABLE', 'NEEDS_REVIEW'].includes(value);
  return (
    <Badge variant={risk ? 'destructive' : complete ? 'default' : 'secondary'} className="whitespace-nowrap">
      {value.replaceAll('_', ' ')}
    </Badge>
  );
}

function buildQuery(tab: string) {
  if (tab === 'reimbursements') return '?type=EMPLOYEE_REIMBURSEMENT';
  if (tab === 'petty-cash') return '?type=PETTY_CASH';
  if (tab === 'owner-expenses') return '?type=OWNER_EXPENSE';
  if (tab === 'gl-queue') return '?glStatus=PENDING_COA';
  if (tab === 'dcaa-review') return '?dcaaStatus=NEEDS_REVIEW';
  return '';
}

export default function AccountingControlCenter() {
  const { toast } = useToast();
  const [tab, setTab] = useState('all');
  const [form, setForm] = useState(initialForm);

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ['/api/accounting-control/summary'],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['/api/accounting-control/accounts'],
  });

  const { data: rows = [], isLoading, refetch } = useQuery<AccountingTransaction[]>({
    queryKey: [`/api/accounting-control${buildQuery(tab)}`],
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiRequest('/api/accounting-control', { method: 'POST', body: payload }),
    onSuccess: () => {
      toast({ title: 'Transaction submitted', description: 'The accounting control item is now in the review queue.' });
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-control/summary'] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting-control${buildQuery(tab)}`] });
      setForm(initialForm);
    },
    onError: (error: any) => {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiRequest(`/api/accounting-control/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-control/summary'] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting-control${buildQuery(tab)}`] });
    },
    onError: (error: any) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const cards = useMemo(() => [
    { label: 'Open Intake', value: summary?.submittedCount ?? 0, icon: Receipt },
    { label: 'Payroll Ready', value: summary?.payrollReadyCount ?? 0, icon: WalletCards },
    { label: 'GL Pending', value: summary?.glPendingCount ?? 0, icon: Landmark },
    { label: 'DCAA Review', value: summary?.dcaaNeedsReviewCount ?? 0, icon: FileCheck },
  ], [summary]);

  function setType(type: TransactionType) {
    setForm((prev) => ({
      ...prev,
      transactionType: type,
      paidByType: type === 'PETTY_CASH' ? 'PETTY_CASH' : type === 'OWNER_EXPENSE' ? 'OWNER' : 'EMPLOYEE',
      reimbursementRequired: type === 'EMPLOYEE_REIMBURSEMENT',
      payrollReimbursement: type === 'EMPLOYEE_REIMBURSEMENT',
    }));
  }

  function submit() {
    if (!form.paidByName.trim() || !form.vendorName.trim() || !form.amount || !form.businessPurpose.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Paid by, vendor, amount, and business purpose are required.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      ...form,
      glAccountId: form.glAccountId === 'none' ? null : Number(form.glAccountId),
      amount: Number(form.amount),
      reimbursementRequired: Boolean(form.reimbursementRequired),
      payrollReimbursement: Boolean(form.payrollReimbursement),
    });
  }

  function quickPatch(row: AccountingTransaction, patch: Record<string, unknown>) {
    updateMutation.mutate({ id: row.id, patch });
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Accounting Control Center</h1>
          <p className="text-muted-foreground">
            Expense intake, petty cash, owner-paid costs, payroll reimbursement readiness, and DCAA review.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.assign('/api/accounting-control/export.csv')}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {card.label}
                </CardDescription>
                <CardTitle className="text-2xl">{summaryLoading ? '-' : card.value}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              New Accounting Item
            </CardTitle>
            <CardDescription>One intake model supports employee, owner, and petty cash transactions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Widget</Label>
                <Select value={form.transactionType} onValueChange={(value) => setType(value as TransactionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE_REIMBURSEMENT">Employee Reimbursement</SelectItem>
                    <SelectItem value="PETTY_CASH">Petty Cash</SelectItem>
                    <SelectItem value="OWNER_EXPENSE">Owner Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Direction</Label>
                <Select value={form.direction} onValueChange={(direction) => setForm({ ...form, direction })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OUT">Cash Out</SelectItem>
                    <SelectItem value="IN">Cash In</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Paid By</Label>
                <Input value={form.paidByName} onChange={(e) => setForm({ ...form, paidByName: e.target.value })} placeholder="Employee, owner, custodian" />
              </div>
              <div className="space-y-1">
                <Label>Vendor</Label>
                <Input value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} placeholder="Lowes, UPS, etc." />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Business Purpose</Label>
              <Textarea value={form.businessPurpose} onChange={(e) => setForm({ ...form, businessPurpose: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Project / Job</Label>
                <Input value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Contract</Label>
                <Input value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Direct / Indirect</Label>
                <Select value={form.directIndirect} onValueChange={(directIndirect) => setForm({ ...form, directIndirect })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIRECT">Direct</SelectItem>
                    <SelectItem value="INDIRECT">Indirect</SelectItem>
                    <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cost Category</Label>
                <Select value={form.costCategory} onValueChange={(costCategory) => setForm({ ...form, costCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MATERIALS">Materials</SelectItem>
                    <SelectItem value="SUPPLIES">Supplies</SelectItem>
                    <SelectItem value="TRAVEL">Travel</SelectItem>
                    <SelectItem value="TOOLS">Tools</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Receipt</Label>
                <Select value={form.receiptStatus} onValueChange={(receiptStatus) => setForm({ ...form, receiptStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MISSING">Missing</SelectItem>
                    <SelectItem value="ATTACHED">Attached</SelectItem>
                    <SelectItem value="EXCEPTION_APPROVED">Exception Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>GL Account</Label>
                <Select value={form.glAccountId} onValueChange={(glAccountId) => setForm({ ...form, glAccountId })}>
                  <SelectTrigger><SelectValue placeholder="Pending COA" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Pending COA</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.reimbursementRequired} onCheckedChange={(checked) => setForm({ ...form, reimbursementRequired: checked === true })} />
                Reimburse
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.payrollReimbursement} onCheckedChange={(checked) => setForm({ ...form, payrollReimbursement: checked === true })} />
                Paycheck
              </label>
            </div>

            <Button className="w-full" onClick={submit} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Item
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Control Queues</CardTitle>
                <CardDescription>
                  {rows.length} item{rows.length === 1 ? '' : 's'} shown. Reimbursable total {money(summary?.reimbursableTotal)}.
                </CardDescription>
              </div>
              {summary && summary.pettyCashBalanceImpact < 0 && (
                <Badge variant="secondary">Petty cash net {money(summary.pettyCashBalanceImpact)}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex flex-wrap h-auto justify-start">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="reimbursements">Reimbursements</TabsTrigger>
                <TabsTrigger value="petty-cash">Petty Cash</TabsTrigger>
                <TabsTrigger value="owner-expenses">Owner</TabsTrigger>
                <TabsTrigger value="gl-queue">GL Queue</TabsTrigger>
                <TabsTrigger value="dcaa-review">DCAA Review</TabsTrigger>
              </TabsList>
              <TabsContent value={tab} className="mt-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Loading accounting items
                  </div>
                ) : rows.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground">No accounting items in this queue.</div>
                ) : (
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Paid By / Vendor</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Controls</TableHead>
                          <TableHead className="w-[220px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="font-mono text-xs">{row.transactionNumber}</div>
                                <TypeBadge type={row.transactionType} />
                              </div>
                            </TableCell>
                            <TableCell>{format(new Date(`${row.transactionDate}T00:00:00`), 'MMM d, yyyy')}</TableCell>
                            <TableCell>
                              <div className="font-medium">{row.paidByName}</div>
                              <div className="text-xs text-muted-foreground">{row.vendorName}</div>
                            </TableCell>
                            <TableCell className="max-w-[260px]">
                              <div className="truncate">{row.businessPurpose}</div>
                              <div className="text-xs text-muted-foreground">
                                {row.directIndirect} / {row.costCategory}
                                {row.projectId ? ` / ${row.projectId}` : ''}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{money(row.amount)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <StatusBadge value={row.status} />
                                <StatusBadge value={row.receiptStatus} />
                                <StatusBadge value={row.payrollStatus} />
                                <StatusBadge value={row.glPostingStatus} />
                                <StatusBadge value={row.dcaaReviewStatus} />
                              </div>
                              {!row.businessPurpose || row.receiptStatus === 'MISSING' ? (
                                <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Review support needed
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {row.status === 'SUBMITTED' && (
                                  <Button size="sm" variant="outline" onClick={() => quickPatch(row, { status: 'APPROVED' })}>
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Approve
                                  </Button>
                                )}
                                {row.dcaaReviewStatus !== 'COMPLETE' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => quickPatch(row, { dcaaReviewStatus: 'COMPLETE', allowabilityStatus: 'ALLOWABLE' })}
                                  >
                                    DCAA
                                  </Button>
                                )}
                                {row.glPostingStatus === 'PENDING_COA' && (
                                  <Badge variant="secondary">Needs COA</Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

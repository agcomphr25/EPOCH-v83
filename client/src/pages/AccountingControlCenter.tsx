import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  Download,
  FileCheck,
  FileText,
  Landmark,
  Loader2,
  Paperclip,
  Receipt,
  RefreshCw,
  Trash2,
  Upload,
  WalletCards,
} from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
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
  attachmentCount: number;
}

interface AccountingAttachment {
  id: number;
  transactionId: string;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
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

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [documentRow, setDocumentRow] = useState<AccountingTransaction | null>(null);
  const [detailFiles, setDetailFiles] = useState<File[]>([]);

  const { data: summary, isLoading: summaryLoading } = useQuery<Summary>({
    queryKey: ['/api/accounting-control/summary'],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['/api/accounting-control/accounts'],
  });

  const { data: rows = [], isLoading, refetch } = useQuery<AccountingTransaction[]>({
    queryKey: [`/api/accounting-control${buildQuery(tab)}`],
  });

  const { data: attachmentData } = useQuery<{ attachments: AccountingAttachment[] }>({
    queryKey: ['/api/accounting-control', documentRow?.id, 'attachments'],
    queryFn: () => apiRequest(`/api/accounting-control/${documentRow?.id}/attachments`),
    enabled: !!documentRow?.id,
  });

  const attachments = attachmentData?.attachments ?? [];

  async function uploadFiles(transactionId: string, files: File[]) {
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    await apiRequest(`/api/accounting-control/${transactionId}/attachments`, {
      method: 'POST',
      body: formData,
      timeout: 120000,
    });
  }

  const createMutation = useMutation({
    mutationFn: async ({ payload, files }: { payload: any; files: File[] }) => {
      const created = await apiRequest('/api/accounting-control', { method: 'POST', body: payload });
      await uploadFiles(created.id, files);
      return created;
    },
    onSuccess: () => {
      toast({ title: 'Transaction submitted', description: 'The accounting control item is now in the review queue.' });
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-control/summary'] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting-control${buildQuery(tab)}`] });
      setForm(initialForm);
      setCreateFiles([]);
    },
    onError: (error: any) => {
      toast({ title: 'Submit failed', description: error.message, variant: 'destructive' });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) => uploadFiles(id, files),
    onSuccess: () => {
      toast({ title: 'Documents uploaded' });
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-control', documentRow?.id, 'attachments'] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting-control${buildQuery(tab)}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-control/summary'] });
      setDetailFiles([]);
    },
    onError: (error: any) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ id, attachmentId }: { id: string; attachmentId: number }) =>
      apiRequest(`/api/accounting-control/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Document removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/accounting-control', documentRow?.id, 'attachments'] });
      queryClient.invalidateQueries({ queryKey: [`/api/accounting-control${buildQuery(tab)}`] });
    },
    onError: (error: any) => {
      toast({ title: 'Remove failed', description: error.message, variant: 'destructive' });
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
    { label: 'Ready to Reimburse', value: summary?.payrollReadyCount ?? 0, icon: WalletCards },
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
      payload: {
        ...form,
        receiptStatus: createFiles.length ? 'ATTACHED' : form.receiptStatus,
        glAccountId: form.glAccountId === 'none' ? null : Number(form.glAccountId),
        amount: Number(form.amount),
        reimbursementRequired: Boolean(form.reimbursementRequired),
        payrollReimbursement: Boolean(form.payrollReimbursement),
      },
      files: createFiles,
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
            Expense intake, reimbursement documentation, petty cash, owner-paid costs, GL queue, and DCAA review.
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
            <CardDescription>One intake model supports employee reimbursements, owner-paid expense documentation, and petty cash transactions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.transactionType} onValueChange={(value) => setType(value as TransactionType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE_REIMBURSEMENT">Employee Reimbursement</SelectItem>
                    <SelectItem value="PETTY_CASH">Petty Cash</SelectItem>
                    <SelectItem value="OWNER_EXPENSE">Owner-Paid Expense Documentation</SelectItem>
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
                Manual payroll payback
              </label>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Receipts / Documents
              </Label>
              <Input
                type="file"
                multiple
                accept="application/pdf,image/*"
                capture="environment"
                onChange={(event) => setCreateFiles(Array.from(event.target.files ?? []))}
              />
              <p className="text-xs text-muted-foreground">
                Missing documents are allowed, but the item will remain flagged for support.
              </p>
              {createFiles.length > 0 && (
                <div className="space-y-1 text-sm">
                  {createFiles.map((file) => (
                    <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">{fileSizeLabel(file.size)}</span>
                    </div>
                  ))}
                </div>
              )}
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
                          <TableHead>Docs</TableHead>
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
                              <Button size="sm" variant="outline" onClick={() => setDocumentRow(row)}>
                                <Paperclip className="h-3 w-3 mr-1" />
                                {row.attachmentCount ?? 0}
                              </Button>
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

      <Dialog open={!!documentRow} onOpenChange={(open) => !open && setDocumentRow(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {documentRow && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Paperclip className="h-5 w-5" />
                  Documents - {documentRow.transactionNumber}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-md border p-4 space-y-3">
                  <Label className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Add Receipts / Documents
                  </Label>
                  <Input
                    type="file"
                    multiple
                    accept="application/pdf,image/*"
                    capture="environment"
                    onChange={(event) => setDetailFiles(Array.from(event.target.files ?? []))}
                  />
                  {detailFiles.length > 0 && (
                    <div className="space-y-1 text-sm">
                      {detailFiles.map((file) => (
                        <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                          <span className="truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground">{fileSizeLabel(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    onClick={() => uploadMutation.mutate({ id: documentRow.id, files: detailFiles })}
                    disabled={!detailFiles.length || uploadMutation.isPending}
                  >
                    {uploadMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Upload
                  </Button>
                </div>

                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Document</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attachments.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                            No documents uploaded yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        attachments.map((attachment) => (
                          <TableRow key={attachment.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span className="max-w-sm truncate">{attachment.originalFileName}</span>
                              </div>
                            </TableCell>
                            <TableCell>{attachment.mimeType}</TableCell>
                            <TableCell>{fileSizeLabel(attachment.fileSizeBytes)}</TableCell>
                            <TableCell className="text-xs">
                              {new Date(attachment.uploadedAt).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => window.open(`/api/accounting-control/${documentRow.id}/attachments/${attachment.id}/download`, '_blank')}
                                >
                                  Open
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => deleteAttachmentMutation.mutate({ id: documentRow.id, attachmentId: attachment.id })}
                                  disabled={deleteAttachmentMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

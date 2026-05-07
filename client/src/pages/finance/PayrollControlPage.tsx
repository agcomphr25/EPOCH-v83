import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BadgeDollarSign,
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  HandCoins,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

type ItemType = 'deduction' | 'advance' | 'owner_reimbursement';
type RecurrenceType = 'one_time' | 'recurring';
type ItemStatus =
  | 'draft'
  | 'ready_for_gusto'
  | 'entered_in_gusto'
  | 'partially_repaid'
  | 'complete'
  | 'voided';

interface EmployeeOption {
  id: number;
  employeeCode: string | null;
  name: string;
  department: string | null;
}

interface PayrollItem {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string | null;
  employeeDepartment: string | null;
  itemType: ItemType;
  category: string;
  description: string;
  originalAmount: number;
  balanceRemaining: number;
  recurrenceType: RecurrenceType;
  recurringAmount: number | null;
  maxTotalAmount: number | null;
  startPayPeriod: string | null;
  nextPayPeriod: string | null;
  expectedDeductionPayPeriod: string | null;
  fundingSource: string | null;
  givenDate: string | null;
  linkedItemId: number | null;
  status: ItemStatus;
  gustoEnteredAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Summary {
  openAdvanceBalance: number;
  openDeductionBalance: number;
  needsGustoEntryCount: number;
  openAdvanceCount: number;
  activeRecurringCount: number;
}

interface EventRow {
  id: number;
  eventType: string;
  amount: number | null;
  payPeriod: string | null;
  oldStatus: string | null;
  newStatus: string | null;
  note: string | null;
  actorEmail: string | null;
  createdAt: string;
}

interface AttachmentRow {
  id: number;
  itemId: number;
  originalFileName: string;
  storedFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

const statusLabels: Record<ItemStatus, string> = {
  draft: 'Draft',
  ready_for_gusto: 'Ready for Gusto',
  entered_in_gusto: 'Entered in Gusto',
  partially_repaid: 'Partially Repaid',
  complete: 'Complete',
  voided: 'Voided',
};

const itemTypeLabels: Record<ItemType, string> = {
  deduction: 'Deduction',
  advance: 'Advance',
  owner_reimbursement: 'Owner Reimbursement',
};

const categoryOptions = [
  'Apparel',
  'Tools',
  'Paycheck advance',
  'Owner reimbursement',
  'Other',
];

function money(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value ?? 0));
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Not set';
  return value;
}

function statusClass(status: ItemStatus) {
  switch (status) {
    case 'ready_for_gusto':
      return 'bg-amber-100 text-amber-900 border-amber-200';
    case 'entered_in_gusto':
      return 'bg-blue-100 text-blue-900 border-blue-200';
    case 'partially_repaid':
      return 'bg-cyan-100 text-cyan-900 border-cyan-200';
    case 'complete':
      return 'bg-green-100 text-green-900 border-green-200';
    case 'voided':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

const blankForm = {
  employeeId: '',
  itemType: 'deduction' as ItemType,
  category: 'Apparel',
  description: '',
  originalAmount: '',
  recurrenceType: 'one_time' as RecurrenceType,
  recurringAmount: '',
  maxTotalAmount: '',
  startPayPeriod: '',
  nextPayPeriod: '',
  expectedDeductionPayPeriod: '',
  fundingSource: '',
  givenDate: '',
  notes: '',
  createOwnerReimbursement: false,
  ownerEmployeeId: '',
};

function itemToForm(item: PayrollItem) {
  return {
    employeeId: String(item.employeeId),
    itemType: item.itemType,
    category: item.category,
    description: item.description,
    originalAmount: String(item.originalAmount),
    recurrenceType: item.recurrenceType,
    recurringAmount:
      item.recurringAmount === null || item.recurringAmount === undefined
        ? ''
        : String(item.recurringAmount),
    maxTotalAmount:
      item.maxTotalAmount === null || item.maxTotalAmount === undefined
        ? ''
        : String(item.maxTotalAmount),
    startPayPeriod: item.startPayPeriod ?? '',
    nextPayPeriod: item.nextPayPeriod ?? '',
    expectedDeductionPayPeriod: item.expectedDeductionPayPeriod ?? '',
    fundingSource: item.fundingSource ?? '',
    givenDate: item.givenDate ?? '',
    notes: item.notes ?? '',
    createOwnerReimbursement: false,
    ownerEmployeeId: '',
  };
}

function fileSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function PayrollControlPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<PayrollItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentPeriod, setPaymentPeriod] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [form, setForm] = useState(blankForm);
  const [editForm, setEditForm] = useState(blankForm);
  const [isEditing, setIsEditing] = useState(false);
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const [detailFiles, setDetailFiles] = useState<File[]>([]);

  const itemParams = new URLSearchParams();
  if (statusFilter !== 'active' && statusFilter !== 'all')
    itemParams.set('status', statusFilter);
  if (statusFilter === 'all') itemParams.set('includeClosed', 'true');
  if (typeFilter !== 'all') itemParams.set('itemType', typeFilter);
  if (employeeFilter !== 'all') itemParams.set('employeeId', employeeFilter);

  const { data: employeeData } = useQuery<{ employees: EmployeeOption[] }>({
    queryKey: ['/api/payroll-control/employees'],
    queryFn: () => apiRequest('/api/payroll-control/employees'),
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ['/api/payroll-control/summary'],
    queryFn: () => apiRequest('/api/payroll-control/summary'),
  });

  const { data: itemData, isLoading } = useQuery<{ items: PayrollItem[] }>({
    queryKey: ['/api/payroll-control/items', itemParams.toString()],
    queryFn: () =>
      apiRequest(`/api/payroll-control/items?${itemParams.toString()}`),
  });

  const { data: eventData } = useQuery<{ events: EventRow[] }>({
    queryKey: ['/api/payroll-control/items', selectedItem?.id, 'events'],
    queryFn: () =>
      apiRequest(`/api/payroll-control/items/${selectedItem?.id}/events`),
    enabled: !!selectedItem?.id,
  });

  const { data: attachmentData } = useQuery<{
    attachments: AttachmentRow[];
  }>({
    queryKey: ['/api/payroll-control/items', selectedItem?.id, 'attachments'],
    queryFn: () =>
      apiRequest(`/api/payroll-control/items/${selectedItem?.id}/attachments`),
    enabled: !!selectedItem?.id,
  });

  const employees = employeeData?.employees ?? [];
  const items = useMemo(() => itemData?.items ?? [], [itemData?.items]);
  const events = eventData?.events ?? [];
  const attachments = attachmentData?.attachments ?? [];

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      return [
        item.employeeName,
        item.employeeCode,
        item.category,
        item.description,
        item.notes,
      ].some((value) =>
        String(value ?? '')
          .toLowerCase()
          .includes(needle)
      );
    });
  }, [items, search]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/payroll-control/items'] });
    queryClient.invalidateQueries({
      queryKey: ['/api/payroll-control/summary'],
    });
  };

  const openItem = (item: PayrollItem) => {
    setSelectedItem(item);
    setEditForm(itemToForm(item));
    setIsEditing(false);
    setStatusReason('');
    setDetailFiles([]);
  };

  const uploadFiles = async (itemId: number, files: File[]) => {
    if (!files.length) return;
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    await apiRequest(`/api/payroll-control/items/${itemId}/attachments`, {
      method: 'POST',
      body: formData,
      timeout: 120000,
    });
  };

  const createMutation = useMutation({
    mutationFn: async ({
      body,
      files,
    }: {
      body: Record<string, unknown>;
      files: File[];
    }) => {
      const item = await apiRequest('/api/payroll-control/items', {
        method: 'POST',
        body,
      });
      await uploadFiles(item.id, files);
      return item as PayrollItem;
    },
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setForm(blankForm);
      setCreateFiles([]);
      toast({ title: 'Payroll control item created' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Create failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Record<string, unknown>;
    }) =>
      apiRequest(`/api/payroll-control/items/${id}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (item: PayrollItem) => {
      invalidate();
      setSelectedItem(item);
      setEditForm(itemToForm(item));
      setIsEditing(false);
      queryClient.invalidateQueries({
        queryKey: ['/api/payroll-control/items', item.id, 'events'],
      });
      toast({ title: 'Payroll control item updated' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/payroll-control/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      setSelectedItem(null);
      setIsEditing(false);
      toast({ title: 'Payroll control item deleted' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const attachmentMutation = useMutation({
    mutationFn: ({ id, files }: { id: number; files: File[] }) =>
      uploadFiles(id, files),
    onSuccess: () => {
      if (selectedItem?.id) {
        queryClient.invalidateQueries({
          queryKey: ['/api/payroll-control/items', selectedItem.id, 'attachments'],
        });
        queryClient.invalidateQueries({
          queryKey: ['/api/payroll-control/items', selectedItem.id, 'events'],
        });
      }
      invalidate();
      setDetailFiles([]);
      toast({ title: 'Document uploaded' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({
      itemId,
      attachmentId,
    }: {
      itemId: number;
      attachmentId: number;
    }) =>
      apiRequest(
        `/api/payroll-control/items/${itemId}/attachments/${attachmentId}`,
        { method: 'DELETE' }
      ),
    onSuccess: () => {
      if (selectedItem?.id) {
        queryClient.invalidateQueries({
          queryKey: ['/api/payroll-control/items', selectedItem.id, 'attachments'],
        });
        queryClient.invalidateQueries({
          queryKey: ['/api/payroll-control/items', selectedItem.id, 'events'],
        });
      }
      invalidate();
      toast({ title: 'Document removed' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Remove failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({
      id,
      status,
      reason,
    }: {
      id: number;
      status: ItemStatus;
      reason: string;
    }) =>
      apiRequest(`/api/payroll-control/items/${id}/status`, {
        method: 'POST',
        body: { status, reason },
      }),
    onSuccess: (item: PayrollItem) => {
      invalidate();
      setSelectedItem(item);
      setStatusReason('');
      queryClient.invalidateQueries({
        queryKey: ['/api/payroll-control/items', item.id, 'events'],
      });
      toast({ title: 'Status updated' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Status update failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  const paymentMutation = useMutation({
    mutationFn: ({
      id,
      amount,
      payPeriod,
      note,
    }: {
      id: number;
      amount: number;
      payPeriod?: string;
      note?: string;
    }) =>
      apiRequest(`/api/payroll-control/items/${id}/payments`, {
        method: 'POST',
        body: { amount, payPeriod, note },
      }),
    onSuccess: (item: PayrollItem) => {
      invalidate();
      setSelectedItem(item);
      setShowPayment(false);
      setPaymentAmount('');
      setPaymentPeriod('');
      setPaymentNote('');
      queryClient.invalidateQueries({
        queryKey: ['/api/payroll-control/items', item.id, 'events'],
      });
      toast({ title: 'Balance updated' });
    },
    onError: (error: Error) =>
      toast({
        title: 'Balance update failed',
        description: error.message,
        variant: 'destructive',
      }),
  });

  function submitCreate() {
    if (!form.employeeId || !form.description.trim() || !form.originalAmount) {
      toast({
        title: 'Missing fields',
        description: 'Employee, description, and amount are required.',
        variant: 'destructive',
      });
      return;
    }
    if (
      form.itemType === 'advance' &&
      form.createOwnerReimbursement &&
      !form.ownerEmployeeId
    ) {
      toast({
        title: 'Reimbursement employee required',
        description:
          'Select who should receive the linked reimbursement reminder.',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      body: {
        employeeId: Number(form.employeeId),
        itemType: form.itemType,
        category: form.category,
        description: form.description.trim(),
        originalAmount: Number(form.originalAmount),
        recurrenceType: form.recurrenceType,
        recurringAmount: form.recurringAmount
          ? Number(form.recurringAmount)
          : null,
        maxTotalAmount: form.maxTotalAmount ? Number(form.maxTotalAmount) : null,
        startPayPeriod: form.startPayPeriod || null,
        nextPayPeriod: form.nextPayPeriod || null,
        expectedDeductionPayPeriod: form.expectedDeductionPayPeriod || null,
        fundingSource: form.fundingSource || null,
        givenDate: form.givenDate || null,
        notes: form.notes || null,
        createOwnerReimbursement:
          form.itemType === 'advance' && form.createOwnerReimbursement,
        ownerEmployeeId:
          form.createOwnerReimbursement && form.ownerEmployeeId
            ? Number(form.ownerEmployeeId)
            : null,
      },
      files: createFiles,
    });
  }

  function submitUpdate() {
    if (!selectedItem) return;
    if (
      !editForm.employeeId ||
      !editForm.description.trim() ||
      !editForm.originalAmount
    ) {
      toast({
        title: 'Missing fields',
        description: 'Employee, description, and amount are required.',
        variant: 'destructive',
      });
      return;
    }
    updateMutation.mutate({
      id: selectedItem.id,
      body: {
        employeeId: Number(editForm.employeeId),
        category: editForm.category,
        description: editForm.description.trim(),
        originalAmount: Number(editForm.originalAmount),
        recurrenceType: editForm.recurrenceType,
        recurringAmount: editForm.recurringAmount
          ? Number(editForm.recurringAmount)
          : null,
        maxTotalAmount: editForm.maxTotalAmount
          ? Number(editForm.maxTotalAmount)
          : null,
        startPayPeriod: editForm.startPayPeriod || null,
        nextPayPeriod: editForm.nextPayPeriod || null,
        expectedDeductionPayPeriod:
          editForm.expectedDeductionPayPeriod || editForm.nextPayPeriod || null,
        fundingSource: editForm.fundingSource || null,
        givenDate: editForm.givenDate || null,
        notes: editForm.notes || null,
      },
    });
  }

  function deleteSelectedItem() {
    if (!selectedItem) return;
    if (
      window.confirm(
        `Delete payroll control item #${selectedItem.id} for ${selectedItem.employeeName}?`
      )
    ) {
      deleteMutation.mutate(selectedItem.id);
    }
  }

  function changeStatus(status: ItemStatus) {
    if (!selectedItem) return;
    if (!statusReason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Add a note before changing status.',
        variant: 'destructive',
      });
      return;
    }
    statusMutation.mutate({
      id: selectedItem.id,
      status,
      reason: statusReason.trim(),
    });
  }

  function applyPayment() {
    if (!selectedItem) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Enter an amount greater than zero.',
        variant: 'destructive',
      });
      return;
    }
    paymentMutation.mutate({
      id: selectedItem.id,
      amount,
      payPeriod: paymentPeriod || undefined,
      note: paymentNote || undefined,
    });
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-normal">
            Payroll Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Internal tracking for deductions, advances, reimbursements, and
            manual Gusto follow-through.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => invalidate()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HandCoins className="h-4 w-4 text-muted-foreground" />
              Open Advances
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {money(summary?.openAdvanceBalance)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.openAdvanceCount ?? 0} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BadgeDollarSign className="h-4 w-4 text-muted-foreground" />
              Open Deductions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {money(summary?.openDeductionBalance)}
            </div>
            <p className="text-xs text-muted-foreground">employee balances</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              Needs Gusto Entry
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {summary?.needsGustoEntryCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">manual actions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Recurring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {summary?.activeRecurringCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">active schedules</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              Export Boundary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-semibold">Hours only</div>
            <p className="text-xs text-muted-foreground">not included in CSV</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Control Ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee, item, note"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="all">All</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(itemTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border max-h-[560px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      Loading payroll control items...
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No items found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => openItem(item)}
                    >
                      <TableCell>
                        <div className="font-medium">{item.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.employeeCode || 'No code'}{' '}
                          {item.employeeDepartment
                            ? `- ${item.employeeDepartment}`
                            : ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.category}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {item.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {item.recurrenceType === 'recurring'
                            ? `${money(item.recurringAmount)} recurring`
                            : 'One time'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Next:{' '}
                          {dateLabel(
                            item.nextPayPeriod ||
                              item.expectedDeductionPayPeriod
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusClass(item.status)}
                        >
                          {statusLabels[item.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Paperclip className="h-4 w-4" />
                          {item.attachmentCount ?? 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {money(item.originalAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {money(item.balanceRemaining)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Payroll Control Item</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={form.employeeId}
                onValueChange={(value) =>
                  setForm({ ...form, employeeId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.itemType}
                onValueChange={(value: ItemType) =>
                  setForm({ ...form, itemType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deduction">Deduction</SelectItem>
                  <SelectItem value="advance">Paycheck Advance</SelectItem>
                  <SelectItem value="owner_reimbursement">
                    Owner Reimbursement
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm({ ...form, category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.originalAmount}
                onChange={(e) =>
                  setForm({ ...form, originalAmount: e.target.value })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Apparel charge, ATM cash advance, reimbursement note"
              />
            </div>
            <div className="space-y-2">
              <Label>Recurrence</Label>
              <Select
                value={form.recurrenceType}
                onValueChange={(value: RecurrenceType) =>
                  setForm({ ...form, recurrenceType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One Time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Recurring Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.recurringAmount}
                onChange={(e) =>
                  setForm({ ...form, recurringAmount: e.target.value })
                }
                disabled={form.recurrenceType !== 'recurring'}
              />
            </div>
            <div className="space-y-2">
              <Label>Start Pay Period</Label>
              <Input
                type="date"
                value={form.startPayPeriod}
                onChange={(e) =>
                  setForm({ ...form, startPayPeriod: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Next / Expected Pay Period</Label>
              <Input
                type="date"
                value={form.nextPayPeriod}
                onChange={(e) =>
                  setForm({
                    ...form,
                    nextPayPeriod: e.target.value,
                    expectedDeductionPayPeriod: e.target.value,
                  })
                }
              />
            </div>
            {form.itemType === 'advance' && (
              <>
                <div className="space-y-2">
                  <Label>Cash Date</Label>
                  <Input
                    type="date"
                    value={form.givenDate}
                    onChange={(e) =>
                      setForm({ ...form, givenDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Funding Source</Label>
                  <Input
                    value={form.fundingSource}
                    onChange={(e) =>
                      setForm({ ...form, fundingSource: e.target.value })
                    }
                    placeholder="ATM cash"
                  />
                </div>
                <div className="space-y-2 md:col-span-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={form.createOwnerReimbursement}
                      onCheckedChange={(checked) =>
                        setForm({
                          ...form,
                          createOwnerReimbursement: checked === true,
                        })
                      }
                    />
                    <Label>Create linked owner reimbursement reminder</Label>
                  </div>
                  {form.createOwnerReimbursement && (
                    <div className="mt-3 space-y-2">
                      <Label>Reimburse To</Label>
                      <Select
                        value={form.ownerEmployeeId}
                        onValueChange={(value) =>
                          setForm({ ...form, ownerEmployeeId: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select owner employee record" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees.map((employee) => (
                            <SelectItem
                              key={employee.id}
                              value={String(employee.id)}
                            >
                              {employee.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2 rounded-md border p-3">
              <Label className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Documents
              </Label>
              <Input
                type="file"
                multiple
                accept="application/pdf,image/*"
                capture="environment"
                onChange={(e) =>
                  setCreateFiles(Array.from(e.target.files ?? []))
                }
              />
              <p className="text-xs text-muted-foreground">
                Upload PDFs, photos, or camera images with the new item.
              </p>
              {createFiles.length > 0 && (
                <div className="space-y-1 text-sm">
                  {createFiles.map((file) => (
                    <div
                      key={`${file.name}-${file.lastModified}`}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                    >
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fileSizeLabel(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Item'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
            setIsEditing(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedItem.itemType === 'advance' ? (
                    <Banknote className="h-5 w-5" />
                  ) : (
                    <CircleDollarSign className="h-5 w-5" />
                  )}
                  {itemTypeLabels[selectedItem.itemType]} -{' '}
                  {selectedItem.employeeName}
                </DialogTitle>
                <div className="flex flex-wrap gap-2 pt-2">
                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={submitUpdate}
                        disabled={updateMutation.isPending}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {updateMutation.isPending ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditForm(itemToForm(selectedItem));
                          setIsEditing(false);
                        }}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={deleteSelectedItem}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                  </Button>
                </div>
              </DialogHeader>
              <Tabs defaultValue="details">
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="space-y-4 pt-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Original
                      </Label>
                      <div className="font-mono text-lg">
                        {money(selectedItem.originalAmount)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Balance
                      </Label>
                      <div className="font-mono text-lg">
                        {money(selectedItem.balanceRemaining)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Status
                      </Label>
                      <div>
                        <Badge
                          variant="outline"
                          className={statusClass(selectedItem.status)}
                        >
                          {statusLabels[selectedItem.status]}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Next Period
                      </Label>
                      <div>
                        {dateLabel(
                          selectedItem.nextPayPeriod ||
                            selectedItem.expectedDeductionPayPeriod
                        )}
                      </div>
                    </div>
                  </div>
                  <Separator />
                  {isEditing && (
                    <div className="grid gap-4 md:grid-cols-2 rounded-md border p-4">
                      <div className="space-y-2">
                        <Label>Employee</Label>
                        <Select
                          value={editForm.employeeId}
                          onValueChange={(value) =>
                            setEditForm({ ...editForm, employeeId: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {employees.map((employee) => (
                              <SelectItem
                                key={employee.id}
                                value={String(employee.id)}
                              >
                                {employee.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={editForm.category}
                          onValueChange={(value) =>
                            setEditForm({ ...editForm, category: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryOptions.map((category) => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Amount</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.originalAmount}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              originalAmount: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Recurrence</Label>
                        <Select
                          value={editForm.recurrenceType}
                          onValueChange={(value: RecurrenceType) =>
                            setEditForm({
                              ...editForm,
                              recurrenceType: value,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one_time">One Time</SelectItem>
                            <SelectItem value="recurring">Recurring</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Recurring Amount</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.recurringAmount}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              recurringAmount: e.target.value,
                            })
                          }
                          disabled={editForm.recurrenceType !== 'recurring'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Next / Expected Pay Period</Label>
                        <Input
                          type="date"
                          value={editForm.nextPayPeriod}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              nextPayPeriod: e.target.value,
                              expectedDeductionPayPeriod: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cash Date</Label>
                        <Input
                          type="date"
                          value={editForm.givenDate}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              givenDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Funding Source</Label>
                        <Input
                          value={editForm.fundingSource}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              fundingSource: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <Input
                          value={editForm.description}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              description: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Notes</Label>
                        <Textarea
                          rows={3}
                          value={editForm.notes}
                          onChange={(e) =>
                            setEditForm({ ...editForm, notes: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Description
                      </Label>
                      <p className="text-sm mt-1">{selectedItem.description}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Notes
                      </Label>
                      <p className="text-sm mt-1">
                        {selectedItem.notes || 'No notes'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Status Note</Label>
                    <Textarea
                      rows={2}
                      value={statusReason}
                      onChange={(e) => setStatusReason(e.target.value)}
                      placeholder="Required for status changes"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => changeStatus('ready_for_gusto')}
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Ready for Gusto
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => changeStatus('entered_in_gusto')}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Entered in Gusto
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowPayment(true)}
                    >
                      <HandCoins className="h-4 w-4 mr-2" />
                      Apply Deduction
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => changeStatus('complete')}
                    >
                      Complete
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => changeStatus('voided')}
                    >
                      Void
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="documents" className="space-y-4 pt-4">
                  <div className="rounded-md border p-4 space-y-3">
                    <Label className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload Documents
                    </Label>
                    <Input
                      type="file"
                      multiple
                      accept="application/pdf,image/*"
                      capture="environment"
                      onChange={(e) =>
                        setDetailFiles(Array.from(e.target.files ?? []))
                      }
                    />
                    {detailFiles.length > 0 && (
                      <div className="space-y-1 text-sm">
                        {detailFiles.map((file) => (
                          <div
                            key={`${file.name}-${file.lastModified}`}
                            className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                          >
                            <span className="truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {fileSizeLabel(file.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      onClick={() =>
                        selectedItem &&
                        attachmentMutation.mutate({
                          id: selectedItem.id,
                          files: detailFiles,
                        })
                      }
                      disabled={
                        !detailFiles.length || attachmentMutation.isPending
                      }
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {attachmentMutation.isPending
                        ? 'Uploading...'
                        : 'Upload'}
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
                            <TableCell
                              colSpan={5}
                              className="h-20 text-center text-muted-foreground"
                            >
                              No documents uploaded yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          attachments.map((attachment) => (
                            <TableRow key={attachment.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                  <span className="max-w-sm truncate">
                                    {attachment.originalFileName}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>{attachment.mimeType}</TableCell>
                              <TableCell>
                                {fileSizeLabel(attachment.fileSizeBytes)}
                              </TableCell>
                              <TableCell className="text-xs">
                                {new Date(
                                  attachment.uploadedAt
                                ).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      window.open(
                                        `/api/payroll-control/items/${selectedItem.id}/attachments/${attachment.id}/download`,
                                        '_blank'
                                      )
                                    }
                                  >
                                    Open
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() =>
                                      selectedItem &&
                                      deleteAttachmentMutation.mutate({
                                        itemId: selectedItem.id,
                                        attachmentId: attachment.id,
                                      })
                                    }
                                    disabled={
                                      deleteAttachmentMutation.isPending
                                    }
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
                </TabsContent>
                <TabsContent value="history" className="pt-4">
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>When</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Note</TableHead>
                          <TableHead>Actor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {events.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="h-20 text-center text-muted-foreground"
                            >
                              No history yet.
                            </TableCell>
                          </TableRow>
                        ) : (
                          events.map((event) => (
                            <TableRow key={event.id}>
                              <TableCell className="text-xs">
                                {new Date(event.createdAt).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                {event.eventType.replaceAll('_', ' ')}
                              </TableCell>
                              <TableCell>
                                {event.amount ? money(event.amount) : '-'}
                              </TableCell>
                              <TableCell className="max-w-sm truncate">
                                {event.note || '-'}
                              </TableCell>
                              <TableCell>{event.actorEmail || '-'}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Deduction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Pay Period</Label>
              <Input
                type="date"
                value={paymentPeriod}
                onChange={(e) => setPaymentPeriod(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={
                  !!paymentAmount && selectedItem
                    ? Number(paymentAmount) >= selectedItem.balanceRemaining
                    : false
                }
                disabled
              />
              <Label className="text-sm text-muted-foreground">
                Completes automatically when balance reaches zero
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Note</Label>
              <Textarea
                rows={3}
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowPayment(false)}>
              Cancel
            </Button>
            <Button onClick={applyPayment} disabled={paymentMutation.isPending}>
              {paymentMutation.isPending ? 'Applying...' : 'Apply'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

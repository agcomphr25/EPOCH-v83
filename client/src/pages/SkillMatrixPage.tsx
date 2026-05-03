import { useState, useMemo, useEffect } from 'react';
import { useSearch } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  MinusCircle,
  RefreshCw,
  Filter,
  Calendar,
  User,
  Award,
  ChevronRight,
  Search,
  PlusCircle,
  Pencil,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CellStatus = 'CERTIFIED' | 'EXPIRED' | 'EXPIRING_SOON' | 'NOT_QUALIFIED';

interface MatrixRow {
  employeeId: number;
  employeeName: string;
  jobTitle: string | null;
  department: string | null;
  certificationId: number;
  certificationName: string;
  certType: string | null;
  validityPeriodMonths: number | null;
  recordId: number | null;
  dateObtained: string | null;
  expiryDate: string | null;
  isActive: boolean;
  notes: string | null;
  status: CellStatus;
}

interface RecertDueRow {
  recordId: number;
  employeeId: number;
  employeeName: string;
  jobTitle: string | null;
  department: string | null;
  certificationId: number;
  certificationName: string;
  certType: string | null;
  validityPeriodMonths: number | null;
  dateObtained: string | null;
  expiryDate: string | null;
  notes: string | null;
  status: 'EXPIRED' | 'EXPIRING_SOON';
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<CellStatus, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: typeof CheckCircle2;
}> = {
  CERTIFIED: {
    label: 'Certified',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: CheckCircle2,
  },
  EXPIRING_SOON: {
    label: 'Expiring Soon',
    color: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: Clock,
  },
  EXPIRED: {
    label: 'Expired',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: AlertTriangle,
  },
  NOT_QUALIFIED: {
    label: 'Not Qualified',
    color: 'text-gray-400',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
    icon: MinusCircle,
  },
};

function StatusBadge({ status }: { status: CellStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ─── Cell Component ───────────────────────────────────────────────────────────

function MatrixCell({
  row,
  onClick,
}: {
  row: MatrixRow;
  onClick: (row: MatrixRow) => void;
}) {
  const cfg = STATUS_CONFIG[row.status];
  const Icon = cfg.icon;

  return (
    <td
      className={`border border-gray-200 p-1 text-center cursor-pointer hover:brightness-95 transition-colors ${cfg.bg}`}
      title={`${row.employeeName} — ${row.certificationName}: ${cfg.label}${row.expiryDate ? ` (expires ${formatDate(row.expiryDate)})` : ''}`}
      onClick={() => onClick(row)}
    >
      <Icon className={`h-4 w-4 mx-auto ${cfg.color}`} />
    </td>
  );
}

// ─── Add Training Dialog ──────────────────────────────────────────────────────

function AddTrainingDialog({
  open,
  onOpenChange,
  row,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: MatrixRow | null;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [lastCompleted, setLastCompleted] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');

  function resetForm() {
    setLastCompleted('');
    setNextDue('');
    setNotes('');
  }

  function handleOpenChange(v: boolean) {
    if (!v) resetForm();
    onOpenChange(v);
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error('No cell selected');
      return apiRequest('/api/employees/training-matrix', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: row.employeeId,
          trainingName: row.certificationName,
          lastCompleted,
          nextDue: nextDue || undefined,
          notes: notes || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Training Added', description: `${row?.certificationName} added for ${row?.employeeName}.` });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/skill-matrix'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/recertification-due'] });
      onAdded();
      handleOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to add training', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Training Record</DialogTitle>
          <DialogDescription>
            {row && `${row.employeeName} — ${row.certificationName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="add-last-completed">Completion Date <span className="text-red-500">*</span></Label>
            <Input
              id="add-last-completed"
              type="date"
              value={lastCompleted}
              onChange={(e) => setLastCompleted(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-next-due">Next Due Date <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Input
              id="add-next-due"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-notes">Notes <span className="text-gray-400 text-xs">(optional)</span></Label>
            <Input
              id="add-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Completed initial certification"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!lastCompleted || addMutation.isPending}
          >
            <PlusCircle className="h-4 w-4 mr-1.5" />
            {addMutation.isPending ? 'Saving…' : 'Add Training'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Training Dialog ─────────────────────────────────────────────────────

function EditTrainingDialog({
  open,
  onOpenChange,
  row,
  onEdited,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: MatrixRow | null;
  onEdited: () => void;
}) {
  const { toast } = useToast();
  const [lastCompleted, setLastCompleted] = useState('');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');

  // Pre-fill form fields whenever the target row changes
  useEffect(() => {
    if (row) {
      setLastCompleted(row.dateObtained ? row.dateObtained.split('T')[0] : '');
      setNextDue(row.expiryDate ? row.expiryDate.split('T')[0] : '');
      setNotes(row.notes || '');
    }
  }, [row]);

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!row || !row.recordId) throw new Error('No record to edit');
      return apiRequest(`/api/employees/training-matrix/${row.recordId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          lastCompleted: lastCompleted || undefined,
          nextDue: nextDue || null,
          notes: notes || undefined,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Record Updated', description: `${row?.certificationName} updated for ${row?.employeeName}.` });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/skill-matrix'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/recertification-due'] });
      onEdited();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to update record', variant: 'destructive' });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Training Record</DialogTitle>
          <DialogDescription>
            {row && `${row.employeeName} — ${row.certificationName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="edit-last-completed">Completion Date</Label>
            <Input
              id="edit-last-completed"
              type="date"
              value={lastCompleted}
              onChange={(e) => setLastCompleted(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-next-due">Next Due Date <span className="text-gray-400 text-xs">(leave blank to remove)</span></Label>
            <Input
              id="edit-next-due"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-notes">Notes</Label>
            <Input
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Notes about this training record"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => editMutation.mutate()}
            disabled={editMutation.isPending}
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            {editMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Renew Dialog ─────────────────────────────────────────────────────────────

function RenewDialog({
  open,
  onOpenChange,
  row,
  onRenewed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: MatrixRow | RecertDueRow | null;
  onRenewed: () => void;
}) {
  const { toast } = useToast();
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');

  const renewMutation = useMutation({
    mutationFn: async () => {
      if (!row || !row.recordId) throw new Error('No record to renew');
      return apiRequest(`/api/employees/certifications/${row.recordId}/renew`, {
        method: 'POST',
        body: JSON.stringify({ expiryDate, notes }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Renewed', description: `${row?.certificationName} renewed successfully.` });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/skill-matrix'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/recertification-due'] });
      onRenewed();
      onOpenChange(false);
      setExpiryDate('');
      setNotes('');
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to renew', variant: 'destructive' });
    },
  });

  const suggestedDate = useMemo(() => {
    if (!row) return '';
    const months = row.validityPeriodMonths;
    if (!months) return '';
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }, [row]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew Certification</DialogTitle>
          <DialogDescription>
            {row && `${row.employeeName} — ${row.certificationName}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="expiry-date">New Expiry Date</Label>
            <Input
              id="expiry-date"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            {suggestedDate && (
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setExpiryDate(suggestedDate)}
              >
                Use suggested ({formatDate(suggestedDate)})
              </button>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="renew-notes">Notes (optional)</Label>
            <Input
              id="renew-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Annual recertification completed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => renewMutation.mutate()}
            disabled={!expiryDate || renewMutation.isPending}
          >
            {renewMutation.isPending ? 'Saving…' : 'Mark as Recertified'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cell Detail Drawer ───────────────────────────────────────────────────────

function CellDrawer({
  row,
  onClose,
  onRenew,
  onRevoke,
  onEdit,
}: {
  row: MatrixRow | null;
  onClose: () => void;
  onRenew: (row: MatrixRow) => void;
  onRevoke: (row: MatrixRow) => void;
  onEdit: (row: MatrixRow) => void;
}) {
  if (!row) return null;
  const cfg = STATUS_CONFIG[row.status];
  const days = daysUntilExpiry(row.expiryDate);

  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[400px] sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>{row.certificationName}</SheetTitle>
          <SheetDescription className="flex items-center gap-2 pt-1">
            <User className="h-3.5 w-3.5" />
            {row.employeeName}
            {row.department && <span className="text-gray-400">· {row.department}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Status */}
          <div className={`flex items-center gap-2 rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}>
            <cfg.icon className={`h-5 w-5 ${cfg.color}`} />
            <div>
              <p className={`font-semibold text-sm ${cfg.color}`}>{cfg.label}</p>
              {row.expiryDate && days !== null && (
                <p className="text-xs text-gray-500">
                  {days < 0
                    ? `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`
                    : days === 0
                    ? 'Expires today'
                    : `Expires in ${days} day${days !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3 text-sm">
            {row.certType && (
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <Badge variant="secondary">{row.certType}</Badge>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Date Obtained</span>
              <span>{formatDate(row.dateObtained)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Expiry Date</span>
              <span>{formatDate(row.expiryDate)}</span>
            </div>
            {row.validityPeriodMonths && (
              <div className="flex justify-between">
                <span className="text-gray-500">Validity Period</span>
                <span>{row.validityPeriodMonths} months</span>
              </div>
            )}
            {row.notes && (
              <div>
                <span className="text-gray-500 block mb-1">Notes</span>
                <p className="bg-gray-50 rounded p-2 text-xs">{row.notes}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {row.status !== 'NOT_QUALIFIED' && (
            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => onRenew(row)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Renew
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onRevoke(row)}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />
                  Revoke
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => onEdit(row)}
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit Record
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Recertification Due List ─────────────────────────────────────────────────

function RecertDueList({
  days,
  onRenew,
}: {
  days: number;
  onRenew: (row: RecertDueRow) => void;
}) {
  const { data, isLoading } = useQuery<RecertDueRow[]>({
    queryKey: ['/api/employees/recertification-due', days],
    queryFn: async () => {
      const res = await fetch(`/api/employees/recertification-due?days=${days}`);
      if (!res.ok) throw new Error('Failed to load recertification list');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-400" />
        <p className="font-medium">No certifications due within {days} days</p>
        <p className="text-sm mt-1">All credentials are up to date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((row) => {
        const days2 = daysUntilExpiry(row.expiryDate);
        const isExpired = row.status === 'EXPIRED';
        return (
          <div
            key={`${row.employeeId}-${row.certificationId}`}
            className={`flex items-center justify-between rounded-lg border p-3 ${
              isExpired ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              {isExpired ? (
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{row.employeeName}</p>
                <p className="text-xs text-gray-600 truncate">{row.certificationName}</p>
                <p className={`text-xs font-medium mt-0.5 ${isExpired ? 'text-red-600' : 'text-yellow-700'}`}>
                  {isExpired
                    ? `Expired ${days2 !== null ? Math.abs(days2) + ' days ago' : formatDate(row.expiryDate)}`
                    : days2 !== null
                    ? `Expires in ${days2} day${days2 !== 1 ? 's' : ''} · ${formatDate(row.expiryDate)}`
                    : formatDate(row.expiryDate)}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 ml-2" onClick={() => onRenew(row)}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Renew
            </Button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SkillMatrixPage() {
  const { toast } = useToast();
  const searchString = useSearch();

  // Filters — pre-fill employee name from ?employee=<name> link
  const [department, setDepartment] = useState('all');
  const [machineClass, setMachineClass] = useState('all');
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(searchString);
    return params.get('employee') ?? '';
  });

  // Drawer / dialog state
  const [selectedCell, setSelectedCell] = useState<MatrixRow | null>(null);
  const [renewTarget, setRenewTarget] = useState<MatrixRow | RecertDueRow | null>(null);
  const [addTrainingTarget, setAddTrainingTarget] = useState<MatrixRow | null>(null);
  const [editTarget, setEditTarget] = useState<MatrixRow | null>(null);

  // Handle cell click: NOT_QUALIFIED opens "Add Training" dialog; others open the drawer
  function handleCellClick(row: MatrixRow) {
    if (row.status === 'NOT_QUALIFIED') {
      setAddTrainingTarget(row);
    } else {
      setSelectedCell(row);
    }
  }

  // Fetch matrix data — machineClass param filters to a single training/qualification column
  const matrixParams = new URLSearchParams();
  if (department !== 'all') matrixParams.set('department', department);
  if (machineClass !== 'all') matrixParams.set('machineClass', machineClass);
  matrixParams.set('days', String(days));

  const { data: matrixData, isLoading: matrixLoading } = useQuery<MatrixRow[]>({
    queryKey: ['/api/employees/skill-matrix', department, machineClass, days],
    queryFn: async () => {
      const res = await fetch(`/api/employees/skill-matrix?${matrixParams}`);
      if (!res.ok) throw new Error('Failed to load skill matrix');
      return res.json();
    },
  });

  // Revoke mutation
  const revokeMutation = useMutation({
    mutationFn: async (row: MatrixRow) => {
      if (!row.recordId) throw new Error('No record to revoke');
      return apiRequest(`/api/employees/certifications/${row.recordId}/revoke`, {
        method: 'PATCH',
        body: JSON.stringify({ revokedBy: 'admin' }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Revoked', description: 'Certification has been revoked.' });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/skill-matrix'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/recertification-due'] });
      setSelectedCell(null);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message || 'Failed to revoke', variant: 'destructive' });
    },
  });

  // Derived data: build matrix structure (employees × qualifications)
  const { employees, certNames, cellMap, departments, trainingNames } = useMemo(() => {
    if (!matrixData) return { employees: [], certNames: [], cellMap: new Map(), departments: [], trainingNames: [] };

    const empMap = new Map<number, { id: number; name: string; department: string | null; jobTitle: string | null }>();
    const certSet = new Set<string>();
    const cellMap = new Map<string, MatrixRow>();
    const deptSet = new Set<string>();
    const trainingSet = new Set<string>();

    for (const row of matrixData) {
      empMap.set(row.employeeId, {
        id: row.employeeId,
        name: row.employeeName,
        department: row.department,
        jobTitle: row.jobTitle,
      });
      certSet.add(row.certificationName);
      if (row.department) deptSet.add(row.department);
      trainingSet.add(row.certificationName);
      cellMap.set(`${row.employeeId}:${row.certificationName}`, row);
    }

    const searchLower = search.toLowerCase();
    const allEmps = [...empMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const filteredEmps = search
      ? allEmps.filter((e) => e.name.toLowerCase().includes(searchLower))
      : allEmps;

    return {
      employees: filteredEmps,
      certNames: [...certSet].sort(),
      cellMap,
      departments: [...deptSet].sort(),
      trainingNames: [...trainingSet].sort(),
    };
  }, [matrixData, search]);

  // Status summary counts
  const summary = useMemo(() => {
    const counts = { CERTIFIED: 0, EXPIRING_SOON: 0, EXPIRED: 0, NOT_QUALIFIED: 0 };
    if (matrixData) {
      for (const row of matrixData) counts[row.status]++;
    }
    return counts;
  }, [matrixData]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Skill Matrix</h1>
        <p className="text-sm text-gray-500 mt-1">
          Employee qualification status across all certifications and training requirements. Click any cell to view details and take action.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(Object.entries(STATUS_CONFIG) as [CellStatus, typeof STATUS_CONFIG[CellStatus]][]).map(([status, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card key={status} className={`border ${cfg.border}`}>
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`h-6 w-6 ${cfg.color} shrink-0`} />
                <div>
                  <p className="text-xl font-bold text-gray-900">{summary[status]}</p>
                  <p className="text-xs text-gray-500">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Matrix View</TabsTrigger>
          <TabsTrigger value="recertification">
            Recertification Due
            {summary.EXPIRED + summary.EXPIRING_SOON > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-xs w-4 h-4">
                {Math.min(summary.EXPIRED + summary.EXPIRING_SOON, 99)}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Matrix Tab */}
        <TabsContent value="matrix" className="mt-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                className="pl-8 w-48"
                placeholder="Search employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-44">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={machineClass} onValueChange={setMachineClass}>
              <SelectTrigger className="w-52">
                <Award className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                <SelectValue placeholder="Cert / Machine Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Qualifications</SelectItem>
                {trainingNames.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-44">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="14">Expiring in 14 days</SelectItem>
                <SelectItem value="30">Expiring in 30 days</SelectItem>
                <SelectItem value="60">Expiring in 60 days</SelectItem>
                <SelectItem value="90">Expiring in 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-3 text-xs">
            {(Object.entries(STATUS_CONFIG) as [CellStatus, typeof STATUS_CONFIG[CellStatus]][]).map(([status, cfg]) => {
              const Icon = cfg.icon;
              return (
                <span key={status} className={`flex items-center gap-1 ${cfg.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </span>
              );
            })}
          </div>

          {/* Matrix Table */}
          {matrixLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-8 bg-gray-100 rounded" />
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-50 rounded" />
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <User className="h-10 w-10 mx-auto mb-2" />
              <p className="font-medium">No employees found</p>
              <p className="text-sm mt-1">Try adjusting your filters.</p>
            </div>
          ) : certNames.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Award className="h-10 w-10 mx-auto mb-2" />
              <p className="font-medium">No qualifications found</p>
              <p className="text-sm mt-1">Add training records to see the matrix.</p>
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-gray-200">
              <table className="text-xs border-collapse min-w-max">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="sticky left-0 z-10 bg-gray-50 border border-gray-200 px-3 py-2 text-left font-semibold text-gray-700 min-w-[160px]">
                      Employee
                    </th>
                    <th className="border border-gray-200 px-2 py-2 text-left font-semibold text-gray-700 min-w-[80px]">
                      Dept
                    </th>
                    {certNames.map((cert) => (
                      <th
                        key={cert}
                        className="border border-gray-200 px-2 py-2 text-center font-semibold text-gray-700 whitespace-nowrap max-w-[120px]"
                        title={cert}
                      >
                        <div className="truncate max-w-[110px]">{cert}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="sticky left-0 z-10 bg-white border border-gray-200 px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">
                        {emp.name}
                        {emp.jobTitle && (
                          <span className="block text-gray-400 text-xs font-normal">{emp.jobTitle}</span>
                        )}
                      </td>
                      <td className="border border-gray-200 px-2 py-1.5 text-gray-500 whitespace-nowrap">
                        {emp.department || '—'}
                      </td>
                      {certNames.map((cert) => {
                        const row = cellMap.get(`${emp.id}:${cert}`);
                        if (!row) return null;
                        return (
                          <MatrixCell key={cert} row={row} onClick={handleCellClick} />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Recertification Due Tab */}
        <TabsContent value="recertification" className="mt-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">Recertification Due</h2>
              <p className="text-sm text-gray-500">Credentials expiring within {days} days, sorted soonest first.</p>
            </div>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-44">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="14">Next 14 days</SelectItem>
                <SelectItem value="30">Next 30 days</SelectItem>
                <SelectItem value="60">Next 60 days</SelectItem>
                <SelectItem value="90">Next 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <RecertDueList
            days={days}
            onRenew={(row) => setRenewTarget(row)}
          />
        </TabsContent>
      </Tabs>

      {/* Cell Detail Drawer */}
      <CellDrawer
        row={selectedCell}
        onClose={() => setSelectedCell(null)}
        onRenew={(row) => {
          setRenewTarget(row);
          setSelectedCell(null);
        }}
        onRevoke={(row) => {
          if (window.confirm(`Revoke ${row.certificationName} for ${row.employeeName}?`)) {
            revokeMutation.mutate(row);
          }
        }}
        onEdit={(row) => {
          setEditTarget(row);
          setSelectedCell(null);
        }}
      />

      {/* Renew Dialog */}
      <RenewDialog
        open={!!renewTarget}
        onOpenChange={(v) => !v && setRenewTarget(null)}
        row={renewTarget}
        onRenewed={() => setRenewTarget(null)}
      />

      {/* Add Training Dialog (for NOT_QUALIFIED cells) */}
      <AddTrainingDialog
        open={!!addTrainingTarget}
        onOpenChange={(v) => !v && setAddTrainingTarget(null)}
        row={addTrainingTarget}
        onAdded={() => setAddTrainingTarget(null)}
      />

      {/* Edit Training Dialog */}
      <EditTrainingDialog
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        row={editTarget}
        onEdited={() => setEditTarget(null)}
      />
    </div>
  );
}

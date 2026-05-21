import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText,
  Plus,
  Play,
  CheckCircle,
  XCircle,
  Search,
  Eye,
  AlertTriangle,
  Clock,
  Clipboard,
  Filter,
  Loader2,
  MoreHorizontal,
  Ban,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  ExternalLink,
  StickyNote,
  Link2,
  X,
} from 'lucide-react';
import { Link } from 'wouter';

interface AuthorizedNote {
  id: string;
  travelerId: string;
  department: string;
  note: string;
  linkedPurchaseOrderId: string | null;
  linkedDocumentUrls: { url: string; label: string }[];
  toleranceChangeAuthorized: boolean;
  signedBy: string;
  signedByName: string;
  signatureRole: string | null;
  signatureData: string | null;
  createdAt: string;
}

interface Traveler {
  id: string;
  travelerNumber: string;
  travelerRevision: number;
  inventoryItemId: string | null;
  partNumber: string | null;
  partName: string | null;
  salesOrderId: string | null;
  workOrderId: string | null;
  lotNumber: string | null;
  serialNumber: string | null;
  internalControlNumber: string | null;
  quantity: number;
  status: string;
  partRoutingId: string | null;
  partRoutingRevision: number | null;
  offSystemCompletionLink: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PartRouting {
  id: string;
  partNumber: string;
  partName: string;
  departmentSequence: string[];
  isActive?: boolean;
}

interface LegacyRocBackfillStepAction {
  stepId: string;
  stepNumber: number;
  departmentName: string;
  status: string;
  mapsTo: string;
  targetChargeCode: { id?: number; code: string; active: boolean; missing?: boolean };
  incompleteRequiredTasks: { id: string; title: string; status: string }[];
  missingRequiredFields: { id: string; fieldLabel: string; fieldKey: string }[];
  proposedAction: 'already_completed_no_write' | 'eligible_for_legacy_mapping_apply' | 'manual_review_required';
}

interface LegacyRocBackfillReportRow {
  inputSerial: string;
  classification: 'safe_to_apply' | 'needs_review' | 'do_not_touch';
  reasons: string[];
  traveler: {
    id: string;
    travelerNumber: string;
    serialNumber: string | null;
    status: string;
    partNumber: string | null;
    createdAt: string;
  } | null;
  serializedItem: {
    serialNumber: string;
    barcode: string;
    currentDepartment: string;
    status: string;
    partNumber: string;
  } | null;
  proposedActions: LegacyRocBackfillStepAction[];
}

interface LegacyRocBackfillReport {
  mode: 'dry_run';
  writesPerformed: false;
  scope: {
    serials: string[];
    cutoffDate: string;
    approver: string;
    departmentMapping: Record<string, string>;
  };
  chargeCodes: {
    layup: { id: number; code: string; active: boolean } | null;
    qualityControl: { id: number; code: string; active: boolean } | null;
  };
  summary: {
    totalRows: number;
    safe_to_apply: number;
    needs_review: number;
    do_not_touch: number;
    proposedStepActions: number;
    manualReviewStepActions: number;
  };
  rows: LegacyRocBackfillReportRow[];
}

interface LegacyRocBackfillApplyResult {
  mode: 'apply';
  writesPerformed: true;
  approver: string;
  summary: {
    requested: number;
    applied: number;
    skipped: number;
  };
  results: {
    travelerId: string;
    travelerNumber: string;
    serialNumber?: string | null;
    status: 'applied' | 'skipped';
    reason?: string;
    travelerCompleted?: boolean;
    serializedItemUpdated?: boolean;
    stepCount?: number;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  BLOCKED: 'bg-red-100 text-red-800',
  CANCELED: 'bg-yellow-100 text-yellow-800',
  SCRAPPED: 'bg-orange-100 text-orange-800',
};

const STATUS_ICONS: Record<string, any> = {
  DRAFT: FileText,
  IN_PROGRESS: Play,
  COMPLETED: CheckCircle,
  BLOCKED: AlertTriangle,
  CANCELED: XCircle,
  SCRAPPED: Trash2,
};

export default function TravelerManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showAuthorizedNotesDialog, setShowAuthorizedNotesDialog] = useState(false);
  const [showOffSystemLinkDialog, setShowOffSystemLinkDialog] = useState(false);
  const [showLegacyRocBackfillDialog, setShowLegacyRocBackfillDialog] = useState(false);
  const [legacyRocBackfillReport, setLegacyRocBackfillReport] = useState<LegacyRocBackfillReport | null>(null);
  const [legacyRocApplyResult, setLegacyRocApplyResult] = useState<LegacyRocBackfillApplyResult | null>(null);
  const [offSystemLinkDraft, setOffSystemLinkDraft] = useState('');
  const [selectedTraveler, setSelectedTraveler] = useState<Traveler | null>(null);
  const [selectedRouting, setSelectedRouting] = useState<string>('');
  const [cancelReason, setCancelReason] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [createFormData, setCreateFormData] = useState({
    workOrderId: '',
    salesOrderId: '',
    lotNumber: '',
    serialNumber: '',
    internalControlNumber: '',
    quantity: 1,
  });
  const [noteFormData, setNoteFormData] = useState({
    department: '',
    note: '',
    linkedPurchaseOrderId: '',
    toleranceChangeAuthorized: false,
    signedByName: '',
    signatureRole: '',
    documentLinks: [{ url: '', label: '' }] as { url: string; label: string }[],
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: travelers = [], isLoading } = useQuery<Traveler[]>({
    queryKey: ['/api/travelers'],
  });

  const { data: routings = [] } = useQuery<PartRouting[]>({
    queryKey: ['/api/part-routings'],
  });

  const legacyRocBackfillDryRunMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/travelers/legacy-roc-backfill/dry-run', {
        method: 'POST',
        body: {},
        timeout: 120000,
      }) as Promise<LegacyRocBackfillReport>,
    onSuccess: (report) => {
      setLegacyRocBackfillReport(report);
      setLegacyRocApplyResult(null);
      setShowLegacyRocBackfillDialog(true);
      toast({
        title: 'Dry-run complete',
        description: `${report.summary.safe_to_apply} safe, ${report.summary.needs_review} need review, ${report.summary.do_not_touch} skipped`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Dry-run failed',
        description: error.message || 'Could not generate the legacy ROC backfill report',
        variant: 'destructive',
      });
    },
  });

  const legacyRocBackfillApplyMutation = useMutation({
    mutationFn: () =>
      apiRequest('/api/travelers/legacy-roc-backfill/apply', {
        method: 'POST',
        body: { confirmSupervisorApproval: true },
        timeout: 120000,
      }) as Promise<LegacyRocBackfillApplyResult>,
    onSuccess: (result) => {
      setLegacyRocApplyResult(result);
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      toast({
        title: 'Legacy backfill applied',
        description: `${result.summary.applied} travelers updated, ${result.summary.skipped} skipped`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Apply failed',
        description: error.message || 'Could not apply the legacy ROC backfill',
        variant: 'destructive',
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { partRoutingId: string; formData: typeof createFormData }) =>
      apiRequest(`/api/travelers/from-routing/${data.partRoutingId}`, {
        method: 'POST',
        body: JSON.stringify({
          ...data.formData,
          createdBy: 'system',
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Created',
        description: 'New traveler has been generated from the routing template',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowCreateDialog(false);
      setSelectedRouting('');
      setCreateFormData({
        workOrderId: '',
        salesOrderId: '',
        lotNumber: '',
        serialNumber: '',
        internalControlNumber: '',
        quantity: 1,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create traveler',
        variant: 'destructive',
      });
    },
  });

  const addAuthorizedNoteMutation = useMutation({
    mutationFn: (data: { travelerId: string; body: any }) =>
      apiRequest(`/api/travelers/${data.travelerId}/authorized-notes`, {
        method: 'POST',
        body: JSON.stringify(data.body),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Authorized Note Added',
        description: 'The signed note and linked documents have been recorded on this traveler.',
      });
      if (selectedTraveler) {
        queryClient.invalidateQueries({ queryKey: ['/api/travelers', selectedTraveler.id, 'authorized-notes'] });
      }
      resetNoteForm();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add authorized note',
        variant: 'destructive',
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}/start`, {
        method: 'POST',
        body: JSON.stringify({ startedBy: 'system' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Started',
        description: 'Traveler is now in progress',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start traveler',
        variant: 'destructive',
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completedBy: 'system' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Completed',
        description: 'Traveler has been marked as completed',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete traveler. Ensure all steps are completed and signed.',
        variant: 'destructive',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (data: { id: string; reason: string }) =>
      apiRequest(`/api/travelers/${data.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ canceledBy: 'system', reason: data.reason }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Canceled',
        description: 'Traveler has been canceled',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowCancelDialog(false);
      setSelectedTraveler(null);
      setCancelReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel traveler',
        variant: 'destructive',
      });
    },
  });

  const blockMutation = useMutation({
    mutationFn: (data: { id: string; reason: string }) =>
      apiRequest(`/api/travelers/${data.id}/block`, {
        method: 'POST',
        body: JSON.stringify({ blockedBy: 'system', reason: data.reason }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Blocked',
        description: 'Traveler has been blocked',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowBlockDialog(false);
      setSelectedTraveler(null);
      setBlockReason('');
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to block traveler',
        variant: 'destructive',
      });
    },
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}/unblock`, {
        method: 'POST',
        body: JSON.stringify({ unblockedBy: 'system' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Traveler Unblocked',
        description: 'Traveler is back in progress',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to unblock traveler',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/travelers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({
        title: 'Traveler Deleted',
        description: 'Draft traveler has been deleted',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete traveler',
        variant: 'destructive',
      });
    },
  });

  const handleCreate = () => {
    if (!selectedRouting) {
      toast({
        title: 'Select Routing',
        description: 'Please select a part routing first',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate({
      partRoutingId: selectedRouting,
      formData: createFormData,
    });
  };

  const handleOpenAuthorizedNotes = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    resetNoteForm();
    setShowAuthorizedNotesDialog(true);
  };

  const isOffSystemTraveler = (traveler: Traveler): boolean => {
    // Off-system completions always have a non-null offSystemCompletionLink
    // (empty string is the sentinel for "off-system, no notes captured").
    // We also fall back to the workOrderId 'Off-system' prefix so legacy
    // rows recorded before the sentinel was introduced are still detected.
    if (traveler.offSystemCompletionLink !== null && traveler.offSystemCompletionLink !== undefined) return true;
    return !!traveler.workOrderId && traveler.workOrderId.startsWith('Off-system');
  };

  const getDisplayedOffSystemLink = (traveler: Traveler): string => {
    if (traveler.offSystemCompletionLink) return traveler.offSystemCompletionLink;
    if (traveler.workOrderId && traveler.workOrderId.startsWith('Off-system: ')) {
      return traveler.workOrderId.slice('Off-system: '.length);
    }
    return '';
  };

  const handleOpenOffSystemLink = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setOffSystemLinkDraft(getDisplayedOffSystemLink(traveler));
    setShowOffSystemLinkDialog(true);
  };

  const offSystemLinkMutation = useMutation({
    mutationFn: (data: { travelerId: string; offSystemCompletionLink: string | null }) =>
      apiRequest(`/api/travelers/${data.travelerId}/off-system-link`, {
        method: 'PATCH',
        body: JSON.stringify({ offSystemCompletionLink: data.offSystemCompletionLink }),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      toast({
        title: 'Off-system link updated',
        description: 'The completion link has been saved on this traveler.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/travelers'] });
      setShowOffSystemLinkDialog(false);
      setOffSystemLinkDraft('');
      setSelectedTraveler(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update off-system link',
        variant: 'destructive',
      });
    },
  });

  const handleSaveOffSystemLink = () => {
    if (!selectedTraveler) return;
    const trimmed = offSystemLinkDraft.trim();
    offSystemLinkMutation.mutate({
      travelerId: selectedTraveler.id,
      offSystemCompletionLink: trimmed.length === 0 ? null : trimmed,
    });
  };

  const resetNoteForm = () => {
    setNoteFormData({
      department: '',
      note: '',
      linkedPurchaseOrderId: '',
      toleranceChangeAuthorized: false,
      signedByName: '',
      signatureRole: '',
      documentLinks: [{ url: '', label: '' }],
    });
  };

  const handleSubmitAuthorizedNote = () => {
    if (!selectedTraveler) return;
    if (!noteFormData.department || !noteFormData.note || !noteFormData.signedByName) {
      toast({
        title: 'Missing Fields',
        description: 'Department, note, and signer name are required.',
        variant: 'destructive',
      });
      return;
    }

    const validLinks = noteFormData.documentLinks.filter(l => l.url.trim() && l.label.trim());

    addAuthorizedNoteMutation.mutate({
      travelerId: selectedTraveler.id,
      body: {
        department: noteFormData.department,
        note: noteFormData.note,
        linkedPurchaseOrderId: noteFormData.linkedPurchaseOrderId || null,
        linkedDocumentUrls: validLinks,
        toleranceChangeAuthorized: noteFormData.toleranceChangeAuthorized,
        signedBy: noteFormData.signedByName.toLowerCase().replace(/\s+/g, '_'),
        signedByName: noteFormData.signedByName,
        signatureRole: noteFormData.signatureRole || null,
      },
    });
  };

  const handleStart = (id: string) => {
    startMutation.mutate(id);
  };

  const handleComplete = (id: string) => {
    if (confirm('Complete this traveler? All steps must be completed and signed.')) {
      completeMutation.mutate(id);
    }
  };

  const handleCancelClick = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setCancelReason('');
    setShowCancelDialog(true);
  };

  const handleConfirmCancel = () => {
    if (!selectedTraveler) return;
    cancelMutation.mutate({
      id: selectedTraveler.id,
      reason: cancelReason,
    });
  };

  const handleBlockClick = (traveler: Traveler) => {
    setSelectedTraveler(traveler);
    setBlockReason('');
    setShowBlockDialog(true);
  };

  const handleConfirmBlock = () => {
    if (!selectedTraveler) return;
    blockMutation.mutate({
      id: selectedTraveler.id,
      reason: blockReason,
    });
  };

  const handleUnblock = (id: string) => {
    unblockMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this draft traveler?')) {
      deleteMutation.mutate(id);
    }
  };

  const filteredTravelers = travelers.filter((t) => {
    const matchesSearch =
      (t.travelerNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.partNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.workOrderId?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.lotNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (t.serialNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeRoutings = routings.filter((r) => r.isActive !== false);

  const stats = {
    total: travelers.length,
    draft: travelers.filter((t) => t.status === 'DRAFT').length,
    inProgress: travelers.filter((t) => t.status === 'IN_PROGRESS').length,
    completed: travelers.filter((t) => t.status === 'COMPLETED').length,
    blocked: travelers.filter((t) => t.status === 'BLOCKED').length,
    scrapped: travelers.filter((t) => t.status === 'SCRAPPED').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">Traveler Management</h1>
          <p className="text-muted-foreground">
            AS9100-compliant production travelers for manufacturing execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => legacyRocBackfillDryRunMutation.mutate()}
            disabled={legacyRocBackfillDryRunMutation.isPending}
            data-testid="button-legacy-roc-dry-run"
          >
            {legacyRocBackfillDryRunMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Clipboard className="h-4 w-4 mr-2" />
            )}
            Legacy ROC Dry Run
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-traveler">
            <Plus className="h-4 w-4 mr-2" />
            Create Traveler
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold" data-testid="stat-total">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-gray-500">Draft</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-gray-600" data-testid="stat-draft">{stats.draft}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-blue-500">In Progress</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-blue-600" data-testid="stat-in-progress">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-green-500">Completed</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-green-600" data-testid="stat-completed">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-red-500">Blocked</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-red-600" data-testid="stat-blocked">{stats.blocked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-sm font-medium text-orange-500">Scrapped</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-2xl font-bold text-orange-600" data-testid="stat-scrapped">{stats.scrapped}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Travelers</CardTitle>
              <CardDescription>
                Production travelers for tracking work through departments
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search travelers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="BLOCKED">Blocked</SelectItem>
                  <SelectItem value="CANCELED">Canceled</SelectItem>
                  <SelectItem value="SCRAPPED">Scrapped</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Traveler #</TableHead>
                <TableHead>Part Number</TableHead>
                <TableHead>Part Name</TableHead>
                <TableHead>Serial Number</TableHead>
                <TableHead>Work Order</TableHead>
                <TableHead>Lot #</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTravelers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    {searchTerm || statusFilter !== 'all'
                      ? 'No travelers match your search criteria'
                      : 'No travelers yet. Create one from a part routing.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTravelers.map((traveler) => {
                  const StatusIcon = STATUS_ICONS[traveler.status] || FileText;
                  const isTerminal = traveler.status === 'COMPLETED' || traveler.status === 'CANCELED' || traveler.status === 'SCRAPPED';
                  return (
                    <TableRow key={traveler.id} data-testid={`row-traveler-${traveler.id}`}>
                      <TableCell className="font-mono font-medium">
                        {traveler.travelerNumber}
                        {traveler.travelerRevision > 1 && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            Rev {traveler.travelerRevision}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{traveler.partNumber || '-'}</TableCell>
                      <TableCell>{traveler.partName || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {traveler.serialNumber || '-'}
                      </TableCell>
                      <TableCell>{traveler.workOrderId || '-'}</TableCell>
                      <TableCell>{traveler.lotNumber || '-'}</TableCell>
                      <TableCell>{traveler.quantity}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[traveler.status] || 'bg-gray-100'}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {traveler.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(traveler.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/travelers/${traveler.id}`}>
                            <Badge
                              className="cursor-pointer bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors px-3 py-1 inline-flex items-center gap-1"
                              data-testid={`badge-view-${traveler.id}`}
                            >
                              <Eye className="h-3 w-3" />
                              View Traveler
                            </Badge>
                          </Link>
                          <Badge
                            className="cursor-pointer bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors px-3 py-1 inline-flex items-center gap-1"
                            data-testid={`badge-authorized-notes-${traveler.id}`}
                            onClick={() => handleOpenAuthorizedNotes(traveler)}
                          >
                            <StickyNote className="h-3 w-3" />
                            Authorized Notes
                          </Badge>
                          {isOffSystemTraveler(traveler) && (
                            <Badge
                              className="cursor-pointer bg-indigo-100 text-indigo-800 hover:bg-indigo-200 transition-colors px-3 py-1 inline-flex items-center gap-1 max-w-[220px]"
                              data-testid={`badge-off-system-link-${traveler.id}`}
                              onClick={() => handleOpenOffSystemLink(traveler)}
                              title={getDisplayedOffSystemLink(traveler) || 'Add off-system completion link'}
                            >
                              <Link2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {getDisplayedOffSystemLink(traveler) || 'Add off-system link'}
                              </span>
                            </Badge>
                          )}
                          {(traveler.serialNumber || traveler.lotNumber) && (
                            <Link href={`/p2-traveler-viewer?barcode=${encodeURIComponent(traveler.serialNumber || traveler.lotNumber || '')}`}>
                              <Badge
                                className="cursor-pointer bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors px-3 py-1 inline-flex items-center gap-1"
                                data-testid={`badge-p2-view-${traveler.id}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                P2 View
                              </Badge>
                            </Link>
                          )}
                          {traveler.status === 'IN_PROGRESS' && (
                            <Link href={`/travelers/${traveler.id}/execute`}>
                              <Button variant="outline" size="sm" data-testid={`button-execute-${traveler.id}`}>
                                <Clipboard className="h-4 w-4 mr-1" />
                                Execute
                              </Button>
                            </Link>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" data-testid={`button-actions-${traveler.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleOpenAuthorizedNotes(traveler)}>
                                <StickyNote className="h-4 w-4 mr-2" />
                                Authorized Notes
                              </DropdownMenuItem>
                              {traveler.status === 'DRAFT' && (
                                <DropdownMenuItem onClick={() => handleStart(traveler.id)}>
                                  <Play className="h-4 w-4 mr-2" />
                                  Start Traveler
                                </DropdownMenuItem>
                              )}
                              {traveler.status === 'IN_PROGRESS' && (
                                <>
                                  <DropdownMenuItem onClick={() => handleComplete(traveler.id)}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Complete Traveler
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleBlockClick(traveler)}>
                                    <ShieldAlert className="h-4 w-4 mr-2" />
                                    Block Traveler
                                  </DropdownMenuItem>
                                </>
                              )}
                              {traveler.status === 'BLOCKED' && (
                                <DropdownMenuItem onClick={() => handleUnblock(traveler.id)}>
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Unblock Traveler
                                </DropdownMenuItem>
                              )}
                              {!isTerminal && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => handleCancelClick(traveler)}
                                    className="text-orange-600"
                                  >
                                    <Ban className="h-4 w-4 mr-2" />
                                    Cancel Traveler
                                  </DropdownMenuItem>
                                </>
                              )}
                              {traveler.status === 'DRAFT' && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(traveler.id)}
                                  className="text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Traveler
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showLegacyRocBackfillDialog} onOpenChange={setShowLegacyRocBackfillDialog}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Legacy ROC Traveler Backfill Dry Run</DialogTitle>
            <DialogDescription>
              Read-only report for the May 20 routing change. No traveler, task, charge-code, or audit records are changed by this report.
            </DialogDescription>
          </DialogHeader>

          {legacyRocBackfillReport && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Rows</p>
                  <p className="text-xl font-semibold">{legacyRocBackfillReport.summary.totalRows}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Safe</p>
                  <p className="text-xl font-semibold text-emerald-700">{legacyRocBackfillReport.summary.safe_to_apply}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Review</p>
                  <p className="text-xl font-semibold text-amber-700">{legacyRocBackfillReport.summary.needs_review}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Skipped</p>
                  <p className="text-xl font-semibold text-slate-700">{legacyRocBackfillReport.summary.do_not_touch}</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-xs text-muted-foreground">Step Actions</p>
                  <p className="text-xl font-semibold">{legacyRocBackfillReport.summary.proposedStepActions}</p>
                </div>
              </div>

              <div className="rounded border p-3 text-sm">
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <span className="text-muted-foreground">Approver: </span>
                    <span className="font-medium">{legacyRocBackfillReport.scope.approver}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cutoff: </span>
                    <span className="font-medium">{legacyRocBackfillReport.scope.cutoffDate}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Writes: </span>
                    <span className="font-medium">{legacyRocBackfillReport.writesPerformed ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>

              <ScrollArea className="h-[520px] rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ROC ID</TableHead>
                      <TableHead>Traveler</TableHead>
                      <TableHead>Current Dept</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Mapped Steps</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legacyRocBackfillReport.rows.map((row, index) => (
                      <TableRow key={`${row.inputSerial}-${row.traveler?.id ?? index}`}>
                        <TableCell className="font-mono text-sm">{row.inputSerial}</TableCell>
                        <TableCell>
                          {row.traveler ? (
                            <div>
                              <p className="font-medium">{row.traveler.travelerNumber}</p>
                              <p className="text-xs text-muted-foreground">{row.traveler.partNumber || row.serializedItem?.partNumber || '-'}</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No traveler</span>
                          )}
                        </TableCell>
                        <TableCell>{row.serializedItem?.currentDepartment || '-'}</TableCell>
                        <TableCell>{row.traveler?.status || row.serializedItem?.status || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              row.classification === 'safe_to_apply'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.classification === 'needs_review'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-800'
                            }
                          >
                            {row.classification.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {row.proposedActions.length === 0 ? (
                              <span className="text-muted-foreground">None</span>
                            ) : (
                              row.proposedActions.map((action) => (
                                <div key={action.stepId} className="text-xs">
                                  <span className="font-medium">{action.stepNumber}. {action.departmentName}</span>
                                  <span className="text-muted-foreground"> to {action.mapsTo}</span>
                                  <span className="font-mono"> {action.targetChargeCode.code}</span>
                                  {(action.missingRequiredFields.length > 0 || action.incompleteRequiredTasks.length > 0) && (
                                    <span className="text-amber-700"> review</span>
                                  )}
                                  {action.incompleteRequiredTasks.length > 0 && (
                                    <div className="text-[11px] text-amber-700">
                                      Tasks: {action.incompleteRequiredTasks.map((task) => task.title).join(', ')}
                                    </div>
                                  )}
                                  {action.missingRequiredFields.length > 0 && (
                                    <div className="text-[11px] text-amber-700">
                                      Fields: {action.missingRequiredFields.map((field) => field.fieldLabel || field.fieldKey).join(', ')}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[320px] text-xs text-muted-foreground">
                          {row.reasons.join(' ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {legacyRocApplyResult && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
                  <p className="font-medium text-emerald-900">
                    Applied {legacyRocApplyResult.summary.applied} traveler backfill(s); skipped {legacyRocApplyResult.summary.skipped}.
                  </p>
                  <div className="mt-2 grid gap-1 md:grid-cols-2">
                    {legacyRocApplyResult.results.map((result) => (
                      <div key={result.travelerId} className="text-emerald-900">
                        <span className="font-mono">{result.travelerNumber}</span>
                        <span className="text-emerald-700"> {result.status}</span>
                        {result.stepCount ? <span className="text-emerald-700"> ({result.stepCount} steps)</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLegacyRocBackfillDialog(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                const ok = window.confirm('Apply the supervised legacy ROC backfill to the 11 active travelers and write timestamped audit records?');
                if (ok) legacyRocBackfillApplyMutation.mutate();
              }}
              disabled={legacyRocBackfillApplyMutation.isPending || !legacyRocBackfillReport}
              data-testid="button-legacy-roc-apply"
            >
              {legacyRocBackfillApplyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Apply Supervised Backfill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Traveler</DialogTitle>
            <DialogDescription>
              Generate a traveler from an existing part routing template
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="routing">Part Routing *</Label>
              <Select value={selectedRouting} onValueChange={setSelectedRouting}>
                <SelectTrigger data-testid="select-routing">
                  <SelectValue placeholder="Select a part routing..." />
                </SelectTrigger>
                <SelectContent>
                  {activeRoutings.map((routing) => (
                    <SelectItem key={routing.id} value={routing.id}>
                      {routing.partNumber} - {routing.partName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeRoutings.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active part routings available. Create one first.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="workOrderId">Work Order ID</Label>
                <Input
                  id="workOrderId"
                  value={createFormData.workOrderId}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, workOrderId: e.target.value })
                  }
                  placeholder="WO-12345"
                  data-testid="input-work-order"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salesOrderId">Sales Order ID</Label>
                <Input
                  id="salesOrderId"
                  value={createFormData.salesOrderId}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, salesOrderId: e.target.value })
                  }
                  placeholder="SO-12345"
                  data-testid="input-sales-order"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lotNumber">Lot Number</Label>
                <Input
                  id="lotNumber"
                  value={createFormData.lotNumber}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, lotNumber: e.target.value })
                  }
                  placeholder="LOT-2024-001"
                  data-testid="input-lot"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serialNumber">Serial Number</Label>
                <Input
                  id="serialNumber"
                  value={createFormData.serialNumber}
                  onChange={(e) =>
                    setCreateFormData({ ...createFormData, serialNumber: e.target.value })
                  }
                  placeholder="SN-001"
                  data-testid="input-serial"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icn">Internal Control Number</Label>
                <Input
                  id="icn"
                  value={createFormData.internalControlNumber}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      internalControlNumber: e.target.value,
                    })
                  }
                  placeholder="ICN-001"
                  data-testid="input-icn"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={createFormData.quantity}
                  onChange={(e) =>
                    setCreateFormData({
                      ...createFormData,
                      quantity: parseInt(e.target.value) || 1,
                    })
                  }
                  data-testid="input-quantity"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !selectedRouting}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Authorized Notes Dialog */}
      <AuthorizedNotesDialog
        open={showAuthorizedNotesDialog}
        onOpenChange={setShowAuthorizedNotesDialog}
        traveler={selectedTraveler}
        noteFormData={noteFormData}
        setNoteFormData={setNoteFormData}
        onSubmit={handleSubmitAuthorizedNote}
        isPending={addAuthorizedNoteMutation.isPending}
      />

      {/* Off-System Completion Link Dialog */}
      <Dialog open={showOffSystemLinkDialog} onOpenChange={(open) => {
        setShowOffSystemLinkDialog(open);
        if (!open) {
          setOffSystemLinkDraft('');
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-700">
              <Link2 className="h-5 w-5" />
              Off-System Completion Link
            </DialogTitle>
            <DialogDescription>
              {selectedTraveler ? (
                <>Edit the link or notes recorded when traveler {selectedTraveler.travelerNumber} was completed off-system. The full text is preserved (no 100-character cap).</>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="off-system-link-textarea">Link / Notes</Label>
            <Textarea
              id="off-system-link-textarea"
              value={offSystemLinkDraft}
              onChange={(e) => setOffSystemLinkDraft(e.target.value)}
              placeholder="https://… or descriptive notes about the off-system completion"
              rows={5}
              data-testid="textarea-off-system-link"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to clear the link. Saving updates this traveler immediately.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOffSystemLinkDialog(false)}
              disabled={offSystemLinkMutation.isPending}
              data-testid="button-cancel-off-system-link"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveOffSystemLink}
              disabled={offSystemLinkMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="button-save-off-system-link"
            >
              {offSystemLinkMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Traveler</DialogTitle>
            <DialogDescription>
              Cancel traveler {selectedTraveler?.travelerNumber}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason for Cancellation *</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason for canceling this traveler..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending || !cancelReason.trim()}
            >
              {cancelMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Block Traveler</DialogTitle>
            <DialogDescription>
              Block traveler {selectedTraveler?.travelerNumber}? This will pause all work on this traveler.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="block-reason">Reason for Blocking *</Label>
            <Textarea
              id="block-reason"
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder="Enter reason for blocking this traveler..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Go Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmBlock}
              disabled={blockMutation.isPending || !blockReason.trim()}
            >
              {blockMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Block Traveler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuthorizedNotesDialog({
  open,
  onOpenChange,
  traveler,
  noteFormData,
  setNoteFormData,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  traveler: Traveler | null;
  noteFormData: {
    department: string;
    note: string;
    linkedPurchaseOrderId: string;
    toleranceChangeAuthorized: boolean;
    signedByName: string;
    signatureRole: string;
    documentLinks: { url: string; label: string }[];
  };
  setNoteFormData: (data: any) => void;
  onSubmit: () => void;
  isPending: boolean;
}) {
  const { data: existingNotes = [] } = useQuery<AuthorizedNote[]>({
    queryKey: ['/api/travelers', traveler?.id, 'authorized-notes'],
    enabled: !!traveler?.id && open,
  });

  const departments = [
    'Layup', 'Assemble/Disassembly', 'CNC', 'Finish', 'Paint', 'Final QC', 'Shipping'
  ];

  const addDocumentLink = () => {
    setNoteFormData({
      ...noteFormData,
      documentLinks: [...noteFormData.documentLinks, { url: '', label: '' }],
    });
  };

  const removeDocumentLink = (index: number) => {
    const updated = noteFormData.documentLinks.filter((_: any, i: number) => i !== index);
    setNoteFormData({ ...noteFormData, documentLinks: updated.length ? updated : [{ url: '', label: '' }] });
  };

  const updateDocumentLink = (index: number, field: 'url' | 'label', value: string) => {
    const updated = [...noteFormData.documentLinks];
    updated[index] = { ...updated[index], [field]: value };
    setNoteFormData({ ...noteFormData, documentLinks: updated });
  };

  if (!traveler) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-emerald-600" />
            Authorized Notes
          </DialogTitle>
          <DialogDescription>
            Traveler {traveler.travelerNumber}
            {traveler.partNumber && ` - ${traveler.partNumber}`}
            {' '}— Add signed notes to authorize tolerance changes and link PO documents.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 max-h-[60vh]">
          <div className="space-y-6">
            {existingNotes.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Existing Notes ({existingNotes.length})
                </h4>
                {existingNotes.map((note) => (
                  <Card key={note.id} className="border-emerald-200">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                            {note.department}
                          </Badge>
                          {note.toleranceChangeAuthorized && (
                            <Badge className="bg-amber-100 text-amber-800">
                              Tolerance Change Authorized
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{note.note}</p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Signed by: <strong>{note.signedByName}</strong>{note.signatureRole ? ` (${note.signatureRole})` : ''}</span>
                        {note.linkedPurchaseOrderId && (
                          <span>PO: <strong>{note.linkedPurchaseOrderId}</strong></span>
                        )}
                      </div>
                      {note.linkedDocumentUrls && note.linkedDocumentUrls.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                          {note.linkedDocumentUrls.map((doc: { url: string; label: string }, idx: number) => (
                            <a
                              key={idx}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                            >
                              <Link2 className="h-3 w-3" />
                              {doc.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <div className="space-y-4 border-t pt-4">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Add New Authorized Note
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="note-department">Department *</Label>
                  <Select
                    value={noteFormData.department}
                    onValueChange={(val) => setNoteFormData({ ...noteFormData, department: val })}
                  >
                    <SelectTrigger id="note-department">
                      <SelectValue placeholder="Select department..." />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note-po">Linked Purchase Order</Label>
                  <Input
                    id="note-po"
                    value={noteFormData.linkedPurchaseOrderId}
                    onChange={(e) => setNoteFormData({ ...noteFormData, linkedPurchaseOrderId: e.target.value })}
                    placeholder="PO-12345"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note-text">Note *</Label>
                <Textarea
                  id="note-text"
                  value={noteFormData.note}
                  onChange={(e) => setNoteFormData({ ...noteFormData, note: e.target.value })}
                  placeholder="Describe the authorized change, tolerance deviation, or instructions..."
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="tolerance-auth"
                  checked={noteFormData.toleranceChangeAuthorized}
                  onChange={(e) => setNoteFormData({ ...noteFormData, toleranceChangeAuthorized: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="tolerance-auth" className="cursor-pointer text-sm">
                  Authorize tolerance changes for this department
                </Label>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Document Links</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addDocumentLink}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Link
                  </Button>
                </div>
                {noteFormData.documentLinks.map((link: { url: string; label: string }, index: number) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      placeholder="Document label"
                      value={link.label}
                      onChange={(e) => updateDocumentLink(index, 'label', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="URL or path"
                      value={link.url}
                      onChange={(e) => updateDocumentLink(index, 'url', e.target.value)}
                      className="flex-[2]"
                    />
                    {noteFormData.documentLinks.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocumentLink(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  These documents will follow the remaining travelers throughout PO completion.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="note-signer">Signed By *</Label>
                  <Input
                    id="note-signer"
                    value={noteFormData.signedByName}
                    onChange={(e) => setNoteFormData({ ...noteFormData, signedByName: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note-role">Role</Label>
                  <Select
                    value={noteFormData.signatureRole}
                    onValueChange={(val) => setNoteFormData({ ...noteFormData, signatureRole: val })}
                  >
                    <SelectTrigger id="note-role">
                      <SelectValue placeholder="Select role..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="QC">QC</SelectItem>
                      <SelectItem value="ENGINEERING">Engineering</SelectItem>
                      <SelectItem value="LEAD">Lead</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="OPERATOR">Operator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isPending || !noteFormData.department || !noteFormData.note || !noteFormData.signedByName}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <StickyNote className="h-4 w-4 mr-2" />
            Sign & Add Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

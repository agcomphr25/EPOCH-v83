import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft,
  Wrench,
  Play,
  CheckCircle,
  Lock,
  Clock,
  AlertTriangle,
  Plus,
  FileText,
  Package,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { format } from 'date-fns';

type WorkOrderDetail = {
  id: string;
  assetId: string | null;
  type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  severity: string | null;
  reportedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  downtimeStart: string | null;
  downtimeEnd: string | null;
  createdBy: number | null;
  closedBy: number | null;
  maintenanceScheduleId: number | null;
  createdAt: string;
  assetName: string | null;
  assetTag: string | null;
  createdByUsername: string | null;
  parts: Array<{
    id: string;
    workOrderId: string;
    inventoryItemId: number | null;
    partName: string | null;
    quantity: string;
    costSnapshot: string | null;
    inventoryPartNumber: string | null;
    inventoryPartName: string | null;
  }>;
  attachments: Array<{
    id: string;
    workOrderId: string;
    fileUrl: string;
    fileName: string | null;
    uploadedBy: number | null;
    uploadedAt: string;
    uploadedByUsername: string | null;
  }>;
};

type LaborStatus = 'OK' | 'WARNING' | 'BLOCKED';

type LaborStatusResult = {
  workOrderId: string;
  totalHours: number;
  departmentHours: number | null;
  totalBudget: number | null;
  departmentBudget: number | null;
  percentUsed: number | null;
  departmentPercentUsed: number | null;
  status: LaborStatus;
  latestApprovalId: number | null;
  latestApprovalAt: string | null;
};

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  waiting_parts: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
};

const laborStatusConfig: Record<LaborStatus, { label: string; badgeClass: string }> = {
  OK: { label: 'OK', badgeClass: 'bg-green-100 text-green-800' },
  WARNING: { label: 'WARNING', badgeClass: 'bg-yellow-100 text-yellow-800' },
  BLOCKED: { label: 'BLOCKED', badgeClass: 'bg-red-100 text-red-800' },
};

function useIsAdmin() {
  const { data: session } = useQuery<any>({ queryKey: ['/api/auth/session'] });
  const role = session?.role;
  return role === 'ADMIN' || role === 'OWNER';
}

function useIsSupervisorOrAdmin() {
  const { data: session } = useQuery<any>({ queryKey: ['/api/auth/session'] });
  const role = session?.role;
  return role === 'ADMIN' || role === 'OWNER' || role === 'SUPERVISOR';
}

function LaborBudgetSection({ woId }: { woId: string }) {
  const isSupervisorOrAdmin = useIsSupervisorOrAdmin();
  const { toast } = useToast();

  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalForm, setApprovalForm] = useState({ employeeId: '', reason: '' });

  const { data: laborData, isLoading, isError } = useQuery<LaborStatusResult | null>({
    queryKey: ['/api/work-orders', woId, 'labor-status'],
    queryFn: async (): Promise<LaborStatusResult | null> => {
      const res = await fetch(`/api/work-orders/${woId}/labor-status`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch labor status');
      return res.json() as Promise<LaborStatusResult>;
    },
    retry: false,
  });

  const approvalMutation = useMutation({
    mutationFn: async (data: { employeeId: string; reason: string }) => {
      const res = await apiRequest(`/api/work-orders/${woId}/approve-overrun`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: (result) => {
      const approvalId = result?.approval?.id ?? null;
      setShowApprovalForm(false);
      setApprovalForm({ employeeId: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', woId, 'labor-status'] });
      toast({ title: 'Overrun approved', description: approvalId ? `Approval ID: ${approvalId}` : undefined });
    },
    onError: (err: any) => {
      toast({ title: 'Approval failed', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Labor Budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400">Loading budget data...</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Labor Budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">Budget data unavailable — unable to load labor status.</p>
        </CardContent>
      </Card>
    );
  }

  if (!laborData || laborData.totalBudget == null) {
    return null;
  }

  const config = laborStatusConfig[laborData.status] ?? laborStatusConfig.OK;
  const pct = laborData.percentUsed;
  const displayPct = pct != null ? Math.min(pct, 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4" /> Labor Budget
          <Badge className={`ml-2 ${config.badgeClass}`}>{config.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500 mb-1">Budget Hours</p>
            <p className="text-lg font-bold">{laborData.totalBudget.toFixed(1)} h</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Hours Used</p>
            <p className="text-lg font-bold">{laborData.totalHours.toFixed(1)} h</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Consumed</p>
            <p className="text-lg font-bold">{pct != null ? `${pct.toFixed(1)}%` : '—'}</p>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>0 h</span>
            <span>{laborData.totalBudget.toFixed(1)} h budget</span>
          </div>
          <Progress value={displayPct} className="h-3" />
        </div>

        {laborData.status === 'WARNING' && (
          <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>This work order is approaching its labor budget limit. Clock-in may be blocked once 100% is reached.</span>
          </div>
        )}

        {laborData.status === 'BLOCKED' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>Labor budget exceeded. Clock-in is blocked until a supervisor approves an overrun.</span>
            </div>

            {laborData.latestApprovalId != null && (
              <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                <p className="font-medium flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" /> Overrun approved
                </p>
                <p className="mt-1 font-mono text-xs break-all">
                  Approval ID: <span className="font-bold">{laborData.latestApprovalId}</span>
                </p>
                {laborData.latestApprovalAt && (
                  <p className="mt-0.5 text-xs text-green-700">
                    Approved: {format(new Date(laborData.latestApprovalAt), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
                <p className="mt-1 text-xs text-green-700">Provide this approval ID when clocking in to bypass the budget gate.</p>
              </div>
            )}

            {isSupervisorOrAdmin && !showApprovalForm && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowApprovalForm(true)}
              >
                <ShieldCheck className="h-4 w-4 mr-1" /> Approve Overrun
              </Button>
            )}

            {isSupervisorOrAdmin && showApprovalForm && (
              <div className="space-y-3 rounded-md border border-gray-200 p-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700">Supervisor Approval</p>
                <div>
                  <Label className="text-xs">Supervisor Employee ID *</Label>
                  <Input
                    value={approvalForm.employeeId}
                    onChange={(e) => setApprovalForm({ ...approvalForm, employeeId: e.target.value })}
                    placeholder="e.g. EMP-001"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Reason for Approval *</Label>
                  <Textarea
                    value={approvalForm.reason}
                    onChange={(e) => setApprovalForm({ ...approvalForm, reason: e.target.value })}
                    placeholder="Explain why the overrun is authorized..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setShowApprovalForm(false); setApprovalForm({ employeeId: '', reason: '' }); }}
                    disabled={approvalMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => approvalMutation.mutate({ employeeId: approvalForm.employeeId, reason: approvalForm.reason })}
                    disabled={!approvalForm.employeeId || !approvalForm.reason || approvalMutation.isPending}
                  >
                    {approvalMutation.isPending ? 'Submitting...' : 'Submit Approval'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WorkOrderDetailPage({ params }: { params: { id: string } }) {
  const isAdmin = useIsAdmin();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const woId = params.id;
  const [showAddPart, setShowAddPart] = useState(false);
  const [showAddAttachment, setShowAddAttachment] = useState(false);
  const [showEditDesc, setShowEditDesc] = useState(false);
  const [editDescription, setEditDescription] = useState('');

  const [partForm, setPartForm] = useState({ partName: '', quantity: '1', costSnapshot: '' });
  const [attachForm, setAttachForm] = useState({ fileUrl: '', fileName: '' });

  const { data: wo, isLoading } = useQuery<WorkOrderDetail>({
    queryKey: ['/api/work-orders', woId],
  });

  const transitionMutation = useMutation({
    mutationFn: async (action: string) => {
      const res = await apiRequest(`/api/work-orders/${woId}/${action}`, { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', woId] });
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      toast({ title: 'Status updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/work-orders/${woId}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', woId] });
      setShowEditDesc(false);
      toast({ title: 'Updated' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const addPartMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/work-orders/${woId}/add-part`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', woId] });
      setShowAddPart(false);
      setPartForm({ partName: '', quantity: '1', costSnapshot: '' });
      toast({ title: 'Part added' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const addAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest(`/api/work-orders/${woId}/add-attachment`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders', woId] });
      setShowAddAttachment(false);
      setAttachForm({ fileUrl: '', fileName: '' });
      toast({ title: 'Attachment added' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-gray-400">Loading work order...</p>
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="p-6">
        <p className="text-red-500">Work order not found</p>
        <Button variant="outline" className="mt-2" onClick={() => setLocation('/maintenance-events')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>
    );
  }

  const canStart = wo.status === 'open' || wo.status === 'waiting_parts';
  const canComplete = wo.status === 'in_progress' || wo.status === 'open';
  const canClose = wo.status !== 'closed';

  function calcDowntimeHours() {
    if (!wo.downtimeStart) return null;
    const start = new Date(wo.downtimeStart);
    const end = wo.downtimeEnd ? new Date(wo.downtimeEnd) : new Date();
    return ((end.getTime() - start.getTime()) / 3600000).toFixed(1);
  }

  const totalPartsCost = wo.parts.reduce((sum, p) => {
    const cost = parseFloat(p.costSnapshot || '0');
    const qty = parseFloat(p.quantity || '0');
    return sum + cost * qty;
  }, 0);

  const timeline = [];
  timeline.push({ date: wo.reportedAt, label: 'Reported', icon: FileText });
  if (wo.startedAt) timeline.push({ date: wo.startedAt, label: 'Started', icon: Play });
  if (wo.downtimeStart) timeline.push({ date: wo.downtimeStart, label: 'Downtime began', icon: AlertTriangle });
  if (wo.completedAt) timeline.push({ date: wo.completedAt, label: 'Completed', icon: CheckCircle });
  if (wo.downtimeEnd) timeline.push({ date: wo.downtimeEnd, label: 'Downtime ended', icon: Clock });
  if (wo.status === 'closed') timeline.push({ date: wo.completedAt || wo.createdAt, label: 'Closed', icon: Lock });
  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/maintenance-events')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          {wo.title}
        </h1>
        <Badge className={statusColors[wo.status] || ''}>{wo.status.replace('_', ' ')}</Badge>
        <Badge className={priorityColors[wo.priority] || ''}>{wo.priority}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Work Order ID:</span>
                <span className="ml-2 font-mono">{wo.id.slice(0, 8)}</span>
              </div>
              <div>
                <span className="text-gray-500">Type:</span>
                <span className="ml-2 capitalize">{wo.type}</span>
              </div>
              <div>
                <span className="text-gray-500">Asset:</span>
                <span className="ml-2">{wo.assetTag && wo.assetName ? `${wo.assetTag} - ${wo.assetName}` : 'Unassigned'}</span>
              </div>
              <div>
                <span className="text-gray-500">Created by:</span>
                <span className="ml-2">{wo.createdByUsername || '—'}</span>
              </div>
              {wo.severity && (
                <div>
                  <span className="text-gray-500">Severity:</span>
                  <span className="ml-2">{wo.severity}</span>
                </div>
              )}
              {wo.maintenanceScheduleId && (
                <div>
                  <span className="text-gray-500">PM Schedule:</span>
                  <span className="ml-2">#{wo.maintenanceScheduleId}</span>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-500">Description</span>
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => { setEditDescription(wo.description || ''); setShowEditDesc(true); }}>
                    Edit
                  </Button>
                )}
              </div>
              <p className="text-sm bg-gray-50 rounded-md p-3">{wo.description || 'No description provided'}</p>
            </div>

            {isAdmin && (
              <div className="flex gap-2 pt-2">
                {canStart && (
                  <Button size="sm" onClick={() => transitionMutation.mutate('start')} disabled={transitionMutation.isPending}>
                    <Play className="h-4 w-4 mr-1" /> Start Work
                  </Button>
                )}
                {canComplete && wo.status !== 'open' && (
                  <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate('complete')} disabled={transitionMutation.isPending}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Complete
                  </Button>
                )}
                {canClose && (
                  <Button size="sm" variant="outline" onClick={() => transitionMutation.mutate('close')} disabled={transitionMutation.isPending}>
                    <Lock className="h-4 w-4 mr-1" /> Close
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Downtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            {wo.downtimeStart ? (
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-gray-500">Started:</span>
                  <p className="font-medium">{format(new Date(wo.downtimeStart), 'MM/dd/yyyy h:mm a')}</p>
                </div>
                {wo.downtimeEnd ? (
                  <div className="text-sm">
                    <span className="text-gray-500">Ended:</span>
                    <p className="font-medium">{format(new Date(wo.downtimeEnd), 'MM/dd/yyyy h:mm a')}</p>
                  </div>
                ) : (
                  <Badge className="bg-red-100 text-red-800 animate-pulse">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Active
                  </Badge>
                )}
                <div className="text-sm">
                  <span className="text-gray-500">Total hours:</span>
                  <p className="text-lg font-bold">{calcDowntimeHours()}h</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No downtime tracked</p>
            )}
          </CardContent>
        </Card>
      </div>

      <LaborBudgetSection woId={woId} />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> Parts Used
            </CardTitle>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowAddPart(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add Part
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {wo.parts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No parts recorded</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wo.parts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">
                          {p.inventoryPartNumber ? `${p.inventoryPartNumber} - ${p.inventoryPartName}` : p.partName || '—'}
                        </TableCell>
                        <TableCell className="text-sm">{p.quantity}</TableCell>
                        <TableCell className="text-sm">{p.costSnapshot ? `$${parseFloat(p.costSnapshot).toFixed(2)}` : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="text-right text-sm font-medium pt-2 border-t">
                  Total: ${totalPartsCost.toFixed(2)}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> Attachments
            </CardTitle>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowAddAttachment(true)}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {wo.attachments.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No attachments</p>
            ) : (
              <div className="space-y-2">
                {wo.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm border-b pb-2">
                    <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {a.fileName || 'File'}
                    </a>
                    <span className="text-xs text-gray-400">
                      {a.uploadedByUsername} - {format(new Date(a.uploadedAt), 'MM/dd/yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {timeline.map((event, i) => {
              const Icon = event.icon;
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{event.label}</p>
                    <p className="text-xs text-gray-400">{format(new Date(event.date), 'MMM d, yyyy h:mm a')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showEditDesc} onOpenChange={setShowEditDesc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
          </DialogHeader>
          <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={5} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditDesc(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate({ description: editDescription })} disabled={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddPart} onOpenChange={setShowAddPart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Part</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Part Name *</Label>
              <Input value={partForm.partName} onChange={(e) => setPartForm({ ...partForm, partName: e.target.value })} placeholder="e.g. Bearing, Belt, Filter" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" value={partForm.quantity} onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })} min="1" />
              </div>
              <div>
                <Label>Unit Cost ($)</Label>
                <Input type="number" step="0.01" value={partForm.costSnapshot} onChange={(e) => setPartForm({ ...partForm, costSnapshot: e.target.value })} placeholder="0.00" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddPart(false)}>Cancel</Button>
            <Button
              onClick={() => addPartMutation.mutate({ partName: partForm.partName, quantity: partForm.quantity, costSnapshot: partForm.costSnapshot || undefined })}
              disabled={!partForm.partName || addPartMutation.isPending}
            >
              Add Part
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddAttachment} onOpenChange={setShowAddAttachment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Attachment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>File URL *</Label>
              <Input value={attachForm.fileUrl} onChange={(e) => setAttachForm({ ...attachForm, fileUrl: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>File Name</Label>
              <Input value={attachForm.fileName} onChange={(e) => setAttachForm({ ...attachForm, fileName: e.target.value })} placeholder="e.g. photo.jpg" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddAttachment(false)}>Cancel</Button>
            <Button
              onClick={() => addAttachmentMutation.mutate({ fileUrl: attachForm.fileUrl, fileName: attachForm.fileName || undefined })}
              disabled={!attachForm.fileUrl || addAttachmentMutation.isPending}
            >
              Add Attachment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

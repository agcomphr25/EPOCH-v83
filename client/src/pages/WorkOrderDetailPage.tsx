import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

function useIsAdmin() {
  const { data: session } = useQuery<any>({ queryKey: ['/api/auth/session'] });
  const role = session?.role;
  return role === 'ADMIN' || role === 'OWNER';
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const isActive = wo.downtimeStart && !wo.downtimeEnd;

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
        {/* Overview */}
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

        {/* Downtime */}
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

      <div className="grid grid-cols-2 gap-4">
        {/* Parts */}
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

        {/* Attachments */}
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

      {/* Activity Timeline */}
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

      {/* Edit Description Dialog */}
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

      {/* Add Part Dialog */}
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

      {/* Add Attachment Dialog */}
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

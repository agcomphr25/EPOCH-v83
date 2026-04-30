import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Wrench, Filter, CheckCircle2, UserPlus, Calendar } from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';

const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping', CHARGE_CODE: 'Charge Code', ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement', INVENTORY: 'Inventory', POLICY: 'Policy',
};

function PriorityBadge({ priority }: { priority: string }) {
  const labels: Record<string, string> = { P1_CRITICAL: 'P1', P2_HIGH: 'P2', P3_MEDIUM: 'P3', P4_LOW: 'P4' };
  const colors: Record<string, string> = {
    P1_CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    P2_HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    P3_MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    P4_LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[priority] ?? ''}`}>{labels[priority] ?? priority}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    OPEN: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    RESOLVED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    WAIVED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? ''}`}>{status}</span>;
}

export default function EdriRemediation() {
  const { toast } = useToast();
  const [domainFilter, setDomainFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const { data: session } = useQuery<any>({ queryKey: ['/api/auth/session'] });
  const currentUserId: number | null = session?.id ?? null;
  const currentRole: string = session?.role ?? 'EMPLOYEE';
  const isAdmin = currentRole === 'ADMIN' || currentRole === 'OWNER';
  const isOwner = currentRole === 'OWNER';

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [waiverJustification, setWaiverJustification] = useState('');

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState('UNASSIGNED');
  const [assignDueDate, setAssignDueDate] = useState('');

  const params = new URLSearchParams();
  if (domainFilter !== 'all') params.set('domainKey', domainFilter);
  if (priorityFilter !== 'all') params.set('priority', priorityFilter);
  if (statusFilter !== 'all') params.set('status', statusFilter);
  if (assigneeFilter !== 'all') params.set('assignedToUserId', assigneeFilter);

  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/edri/remediation', domainFilter, priorityFilter, statusFilter, assigneeFilter],
    queryFn: async () => {
      const res = await fetch(`/api/edri/remediation?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: users = [] } = useQuery<any[]>({ queryKey: ['/api/users'] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status, note, waiver }: any) =>
      apiRequest('PATCH', `/api/edri/remediation/${id}`, {
        action: 'status', status, note, waiverJustification: waiver,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/remediation'] });
      setStatusDialogOpen(false);
      setStatusNote('');
      setWaiverJustification('');
      toast({ title: 'Status updated' });
    },
    onError: (err: any) => toast({ title: err?.message || 'Failed to update status', variant: 'destructive' }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, assignToUserId, assignToDisplayName, dueDate }: any) =>
      apiRequest('PATCH', `/api/edri/remediation/${id}`, {
        action: 'assign',
        assignToUserId: assignToUserId ? Number(assignToUserId) : undefined,
        assignToDisplayName,
        dueDate: dueDate || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/edri/remediation'] });
      setAssignDialogOpen(false);
      setAssignUserId('UNASSIGNED');
      setAssignDueDate('');
      toast({ title: 'Assignment updated' });
    },
    onError: (err: any) => toast({ title: err?.message || 'Failed to assign item', variant: 'destructive' }),
  });

  function openAssignDialog(item: any) {
    setSelectedItem(item);
    const existingUser = users.find((u: any) => u.id === item.assignedToUserId);
    setAssignUserId(item.assignedToUserId ? String(item.assignedToUserId) : 'UNASSIGNED');
    setAssignDueDate(item.dueDate ?? '');
    setAssignDialogOpen(true);
  }

  function handleAssign() {
    if (!selectedItem) return;
    const selectedUser = users.find((u: any) => String(u.id) === String(assignUserId));
    assignMutation.mutate({
      id: selectedItem.id,
      assignToUserId: assignUserId && assignUserId !== 'UNASSIGNED' ? Number(assignUserId) : undefined,
      assignToDisplayName: selectedUser?.displayName ?? selectedUser?.username ?? '',
      dueDate: assignDueDate || null,
    });
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <EdriSubNav />

      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Wrench className="h-8 w-8 text-blue-500" />
          Remediation Queue
        </h1>
        <p className="text-muted-foreground">Actionable tasks generated from DCAA compliance failures</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Filter className="h-4 w-4" />Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Domain</Label>
              <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  {Object.entries(DOMAIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="P1_CRITICAL">P1 Critical</SelectItem>
                  <SelectItem value="P2_HIGH">P2 High</SelectItem>
                  <SelectItem value="P3_MEDIUM">P3 Medium</SelectItem>
                  <SelectItem value="P4_LOW">P4 Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  <SelectItem value="WAIVED">Waived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assignee</Label>
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.filter((u: any) => u.id).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.displayName ?? u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-muted-foreground">No remediation items match the current filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item: any) => (
            <div key={item.id} className="p-4 rounded-lg border bg-background">
              <div className="flex items-start gap-3">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PriorityBadge priority={item.priority} />
                    <Badge variant="outline" className="text-xs">{DOMAIN_LABELS[item.domainKey] ?? item.domainKey}</Badge>
                    <StatusBadge status={item.status} />
                    <span className="font-semibold text-sm">{item.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {item.assignedToDisplayName
                      ? <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400"><UserPlus className="h-3 w-3" />{item.assignedToDisplayName}</span>
                      : <span className="flex items-center gap-1 italic">Unassigned</span>
                    }
                    {item.dueDate
                      ? <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Due: {item.dueDate}</span>
                      : <span className="italic">No due date</span>
                    }
                    <span>Recovery: +{item.potentialScoreRecovery ?? 0} pts</span>
                    {item.waiverJustification && <span className="italic">Waived: {item.waiverJustification}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => openAssignDialog(item)} title="Assign owner and due date">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  )}
                  {(item.status === 'OPEN' || item.status === 'IN_PROGRESS') &&
                    (isAdmin || item.assignedToUserId === currentUserId) && (
                    <Button size="sm" variant="outline" onClick={() => { setSelectedItem(item); setNewStatus('IN_PROGRESS'); setStatusDialogOpen(true); }}>
                      Update
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status update dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Remediation Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{selectedItem?.title}</p>
            <div className="space-y-1">
              <Label>New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                  {isOwner && <SelectItem value="WAIVED">Waived</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Note</Label>
              <Textarea placeholder="Describe the action taken..." value={statusNote} onChange={e => setStatusNote(e.target.value)} rows={2} />
            </div>
            {newStatus === 'WAIVED' && (
              <div className="space-y-1">
                <Label>Waiver Justification <span className="text-red-500">*</span></Label>
                <Textarea placeholder="Provide a written justification for waiving this item..." value={waiverJustification} onChange={e => setWaiverJustification(e.target.value)} rows={2} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => selectedItem && statusMutation.mutate({ id: selectedItem.id, status: newStatus, note: statusNote, waiver: waiverJustification })}
              disabled={!newStatus || (newStatus === 'WAIVED' && !waiverJustification.trim()) || statusMutation.isPending}
            >
              {statusMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign owner + due date dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Assign Owner & Due Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">{selectedItem?.title}</p>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                  {(users as any[]).map((u: any) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.displayName ?? u.username} ({u.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={assignDueDate} onChange={e => setAssignDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={assignMutation.isPending}>
              {assignMutation.isPending ? 'Saving...' : 'Save Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

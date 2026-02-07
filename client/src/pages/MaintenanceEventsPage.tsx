import { useState, useMemo } from 'react';
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
import { Plus, Wrench, Search, AlertTriangle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { format } from 'date-fns';

type WorkOrderRow = {
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
};

type AssetOption = {
  id: string;
  assetTag: string;
  name: string;
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

const typeLabels: Record<string, string> = {
  reactive: 'Reactive',
  preventive: 'Preventive',
  predictive: 'Predictive',
  corrective: 'Corrective',
};

export default function MaintenanceEventsPage() {
  const isAdmin = useIsAdmin();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    assetId: '',
    type: 'reactive',
    priority: 'medium',
    severity: '',
    description: '',
  });

  const { data: workOrders = [], isLoading } = useQuery<WorkOrderRow[]>({
    queryKey: ['/api/work-orders'],
  });

  const { data: assets = [] } = useQuery<AssetOption[]>({
    queryKey: ['/api/assets'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('/api/work-orders', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      return res.json();
    },
    onSuccess: (wo: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/work-orders'] });
      setShowCreateForm(false);
      setFormData({ title: '', assetId: '', type: 'reactive', priority: 'medium', severity: '', description: '' });
      toast({ title: 'Work order created' });
      setLocation(`/maintenance-events/${wo.id}`);
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const filtered = useMemo(() => {
    let result = [...workOrders];
    if (statusFilter !== 'all') result = result.filter((wo) => wo.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter((wo) => wo.type === typeFilter);
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (wo) =>
          wo.title.toLowerCase().includes(lower) ||
          wo.id.toLowerCase().includes(lower) ||
          (wo.assetName && wo.assetName.toLowerCase().includes(lower)) ||
          (wo.assetTag && wo.assetTag.toLowerCase().includes(lower))
      );
    }
    return result;
  }, [workOrders, statusFilter, typeFilter, searchTerm]);

  const stats = useMemo(() => {
    const open = workOrders.filter((wo) => wo.status === 'open').length;
    const inProgress = workOrders.filter((wo) => wo.status === 'in_progress').length;
    const downtimeActive = workOrders.filter((wo) => wo.downtimeStart && !wo.downtimeEnd).length;
    return { open, inProgress, downtimeActive, total: workOrders.length };
  }, [workOrders]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="h-6 w-6" />
            Maintenance Events
          </h1>
          <p className="text-gray-500">Work orders for equipment maintenance and repairs</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Work Order
          </Button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.open}</p>
            <p className="text-xs text-gray-500">Open</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.inProgress}</p>
            <p className="text-xs text-gray-500">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.downtimeActive}</p>
            <p className="text-xs text-gray-500">Downtime Active</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by title, ID, or asset..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="reactive">Reactive</SelectItem>
            <SelectItem value="preventive">Preventive</SelectItem>
            <SelectItem value="predictive">Predictive</SelectItem>
            <SelectItem value="corrective">Corrective</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Work Order</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Downtime</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">Loading...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">No work orders found</TableCell>
                </TableRow>
              ) : (
                filtered.map((wo) => (
                  <TableRow
                    key={wo.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setLocation(`/maintenance-events/${wo.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{wo.title}</p>
                        <p className="text-xs text-gray-400 font-mono">{wo.id.slice(0, 8)}...</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {wo.assetName ? (
                        <span className="text-sm">{wo.assetTag} - {wo.assetName}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">Unassigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{typeLabels[wo.type] || wo.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={priorityColors[wo.priority] || ''}>{wo.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[wo.status] || ''}>{wo.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>
                      {wo.downtimeStart && !wo.downtimeEnd ? (
                        <Badge className="bg-red-100 text-red-800 animate-pulse">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      ) : wo.downtimeStart && wo.downtimeEnd ? (
                        <span className="text-xs text-gray-500">Resolved</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {format(new Date(wo.reportedAt), 'MM/dd/yyyy')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Form */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Title *</Label>
              <Input value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Brief description of the issue" />
            </div>
            <div>
              <Label>Asset</Label>
              <Select value={formData.assetId} onValueChange={(v) => setFormData({ ...formData, assetId: v })}>
                <SelectTrigger><SelectValue placeholder="Select asset (optional)" /></SelectTrigger>
                <SelectContent>
                  {assets.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.assetTag} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reactive">Reactive</SelectItem>
                    <SelectItem value="preventive">Preventive</SelectItem>
                    <SelectItem value="predictive">Predictive</SelectItem>
                    <SelectItem value="corrective">Corrective</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Severity</Label>
              <Input value={formData.severity} onChange={(e) => setFormData({ ...formData, severity: e.target.value })} placeholder="e.g. Minor, Major, Safety" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={3} placeholder="Detailed description of the issue..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const payload: any = { title: formData.title, type: formData.type, priority: formData.priority, status: 'open' };
                if (formData.assetId) payload.assetId = formData.assetId;
                if (formData.severity) payload.severity = formData.severity;
                if (formData.description) payload.description = formData.description;
                createMutation.mutate(payload);
              }}
              disabled={!formData.title || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Work Order'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

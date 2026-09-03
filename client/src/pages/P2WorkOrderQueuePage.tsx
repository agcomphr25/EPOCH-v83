import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Cog,
  Factory,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useRoute } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
import { usePermissions } from '@/hooks/usePermissions';
import { apiRequest } from '@/lib/queryClient';

type Blocker = {
  dependencyId?: string;
  materialRequirementId?: string;
  childWorkOrderId?: string;
  childWorkOrderNumber?: string;
  childPartNumber?: string;
  partNumber?: string;
  requiredQuantity: string;
  satisfiedQuantity: string;
  shortageQuantity: string;
  department?: string;
};
type QueueWorkOrder = {
  authorityId: string;
  workOrderId: string;
  workOrderNumber: string;
  projectCode: string;
  partNumber: string;
  description: string;
  revision?: string;
  requiredQuantity: string;
  completedQuantity: string;
  currentDepartmentName: string;
  dueDate?: string | null;
  priority: 'LOW' | 'URGENT' | 'CRITICAL';
  travelerRequirement: 'REQUIRED' | 'NOT_REQUIRED_APPROVED';
  travelerId?: string;
  travelerCoveredQuantity: number;
  travelerRemainingQuantity: number;
  travelerCoverage: Array<{
    travelerId: string;
    travelerType: string;
    coverageQuantity: number;
    outputIdentity: string;
  }>;
  parentAuthorityId?: string;
  concurrencyVersion: number;
  readiness: string;
  blockers: Blocker[];
};
type QueueResponse = { departmentId: string; workOrders: QueueWorkOrder[] };
type QueueDepartment = {
  id: number;
  name: string;
  departmentCode?: string | null;
};

const queueReadsEnabled =
  import.meta.env.VITE_P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED ===
  'true';
const executionEnabled =
  import.meta.env.VITE_P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED === 'true';
const provisioningEnabled =
  import.meta.env.VITE_P2_TRAVELER_PROVISIONING_WRITES_ENABLED === 'true';

const label = (readiness: string) =>
  readiness
    .replace('BLOCKED_', 'BLOCKED — ')
    .replaceAll('_', ' ')
    .toUpperCase();

export default function P2WorkOrderQueuePage() {
  const manufacturedOutputReadsEnabled =
    import.meta.env.VITE_P2_MANUFACTURED_OUTPUT_READS_ENABLED === 'true';
  const manufacturedOutputWritesEnabled =
    import.meta.env.VITE_P2_MANUFACTURED_OUTPUT_WRITES_ENABLED === 'true';
  const [, params] = useRoute('/p2-work-orders/queues/:departmentId');
  const departmentId = params?.departmentId ?? '';
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusView, setStatusView] = useState<'ACTIVE' | 'ALL' | 'COMPLETE'>(
    'ACTIVE'
  );
  const [sortBy, setSortBy] = useState<'DEPARTMENT' | 'PRIORITY'>('DEPARTMENT');
  const [editing, setEditing] = useState<QueueWorkOrder | null>(null);
  const [editPriority, setEditPriority] =
    useState<QueueWorkOrder['priority']>('LOW');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editReason, setEditReason] = useState('');
  const queryKey = ['/api/p2-work-orders/queues', departmentId];
  const departments = useQuery<QueueDepartment[]>({
    queryKey: ['/api/shared-departments', 'p2-work-order-queue-page'],
    queryFn: () => apiRequest('/api/shared-departments?routingOnly=true'),
    enabled: queueReadsEnabled && Boolean(departmentId),
    staleTime: 5 * 60 * 1000,
  });
  const queue = useQuery<QueueResponse>({
    queryKey,
    queryFn: () => apiRequest(`/api/p2-work-orders/queues/${departmentId}`),
    enabled: queueReadsEnabled && Boolean(departmentId),
  });
  const start = useMutation({
    mutationFn: (workOrder: QueueWorkOrder) =>
      apiRequest(`/api/p2-work-orders/${workOrder.authorityId}/start`, {
        method: 'POST',
        body: JSON.stringify({
          expectedConcurrencyVersion: Number(workOrder.concurrencyVersion),
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const provision = useMutation({
    mutationFn: (workOrder: QueueWorkOrder) =>
      apiRequest(
        `/api/p2-work-orders/${workOrder.authorityId}/travelers/provision`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedConcurrencyVersion: Number(workOrder.concurrencyVersion),
            idempotencyKey: crypto.randomUUID(),
          }),
        }
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const completeOperation = useMutation({
    mutationFn: (workOrder: QueueWorkOrder) =>
      apiRequest(
        `/api/p2-work-orders/${workOrder.authorityId}/operations/current/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedConcurrencyVersion: Number(workOrder.concurrencyVersion),
          }),
        }
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  const updateManagement = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('Select a work order to edit.');
      return apiRequest(
        `/api/p2-work-orders/${editing.authorityId}/management`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            expectedConcurrencyVersion: Number(editing.concurrencyVersion),
            priority: editPriority,
            dueDate: editDueDate || null,
            description: editDescription,
            reason: editReason,
          }),
        }
      );
    },
    onSuccess: () => {
      setEditing(null);
      setEditReason('');
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const priorityRank = { CRITICAL: 0, URGENT: 1, LOW: 2 } as const;
  const visibleWorkOrders = [...(queue.data?.workOrders ?? [])]
    .filter((workOrder) => {
      if (statusView === 'ALL') return true;
      if (statusView === 'COMPLETE') return workOrder.readiness === 'COMPLETE';
      return workOrder.readiness !== 'COMPLETE';
    })
    .sort((left, right) => {
      if (sortBy === 'PRIORITY') {
        const priorityDifference =
          priorityRank[left.priority] - priorityRank[right.priority];
        if (priorityDifference) return priorityDifference;
      }
      return (
        left.currentDepartmentName.localeCompare(right.currentDepartmentName) ||
        priorityRank[left.priority] - priorityRank[right.priority] ||
        String(left.dueDate ?? '').localeCompare(String(right.dueDate ?? ''))
      );
    });

  const openEditor = (workOrder: QueueWorkOrder) => {
    setEditing(workOrder);
    setEditPriority(workOrder.priority);
    setEditDueDate(workOrder.dueDate?.slice(0, 10) ?? '');
    setEditDescription(workOrder.description);
    setEditReason('');
  };

  const currentDepartment = departments.data?.find(
    (department) => String(department.id) === departmentId
  );
  const departmentIdentity = `${currentDepartment?.departmentCode ?? ''} ${
    currentDepartment?.name ?? ''
  }`.toUpperCase();
  const isMachinedPartsQueue =
    departmentIdentity.includes('CNC') || departmentIdentity.includes('MACHIN');
  const queueTitle = isMachinedPartsQueue
    ? 'CNC / Machined Parts Work Orders'
    : `${currentDepartment?.name ?? 'P2'} Work Order Queue`;

  if (!queueReadsEnabled)
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>P2 W/O Queues are disabled</CardTitle>
          </CardHeader>
          <CardContent>
            Phase 6 remains inactive until its server and client read flags are
            explicitly enabled after certification.
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div
      className="space-y-4 p-6"
      data-testid="p2-work-order-queue"
      data-manufactured-output-reads={manufacturedOutputReadsEnabled}
      data-manufactured-output-writes={manufacturedOutputWritesEnabled}
    >
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {isMachinedPartsQueue ? (
            <Cog className="h-6 w-6" />
          ) : (
            <Factory className="h-6 w-6" />
          )}{' '}
          {queueTitle}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isMachinedPartsQueue
            ? 'Controlled CNC work orders for inventory classified as machined parts. Open the released traveler before machining.'
            : 'Frozen released P2 work only. Blocked work remains visible and cannot be started.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select
          value={statusView}
          onValueChange={(value) => setStatusView(value as typeof statusView)}
        >
          <SelectTrigger
            className="w-[210px]"
            data-testid="select-work-order-status-view"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Pending &amp; In Progress</SelectItem>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="COMPLETE">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sortBy}
          onValueChange={(value) => setSortBy(value as typeof sortBy)}
        >
          <SelectTrigger
            className="w-[210px]"
            data-testid="select-work-order-sort"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEPARTMENT">Sort by Department</SelectItem>
            <SelectItem value="PRIORITY">Sort by Priority</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {queue.isLoading && <p>Loading work orders…</p>}
      {queue.isError && (
        <Card>
          <CardContent className="flex gap-2 pt-6 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Unable to load this P2 queue.
          </CardContent>
        </Card>
      )}
      {queue.data?.workOrders.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            No P2 work is assigned here.
          </CardContent>
        </Card>
      )}
      {visibleWorkOrders.map((workOrder) => {
        const open = expanded.has(workOrder.authorityId);
        const blocked = workOrder.readiness.startsWith('BLOCKED');
        return (
          <Card key={workOrder.authorityId}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">
                    {workOrder.workOrderNumber} | {workOrder.partNumber} |{' '}
                    {workOrder.description} | Qty {workOrder.requiredQuantity}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {workOrder.projectCode} · {workOrder.currentDepartmentName}{' '}
                    · {workOrder.completedQuantity}/{workOrder.requiredQuantity}{' '}
                    complete · {workOrder.priority}
                    {workOrder.dueDate ? ` · Due ${workOrder.dueDate}` : ''}
                  </p>
                  {isMachinedPartsQueue && (
                    <div
                      className="mt-2 flex flex-wrap gap-2 text-xs"
                      data-testid="cnc-machined-work-order-details"
                    >
                      <Badge variant="secondary">Machined Part</Badge>
                      <span className="rounded-md border px-2 py-1">
                        Revision {workOrder.revision || 'Not specified'}
                      </span>
                      <span className="rounded-md border px-2 py-1">
                        Traveler{' '}
                        {workOrder.travelerRequirement === 'REQUIRED'
                          ? 'required'
                          : 'not required (approved)'}
                      </span>
                    </div>
                  )}
                </div>
                <Badge variant={blocked ? 'destructive' : 'outline'}>
                  {label(workOrder.readiness)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {can('p2.work_orders.manage') &&
                  workOrder.readiness !== 'COMPLETE' && (
                    <Button
                      variant="outline"
                      onClick={() => openEditor(workOrder)}
                    >
                      Edit Work Order
                    </Button>
                  )}
                {workOrder.travelerRequirement === 'REQUIRED' &&
                  workOrder.travelerRemainingQuantity > 0 &&
                  can('p2.travelers.provision') && (
                    <Button
                      variant="outline"
                      disabled={!provisioningEnabled || provision.isPending}
                      onClick={() => provision.mutate(workOrder)}
                    >
                      Provision Traveler Coverage (
                      {workOrder.travelerRemainingQuantity} remaining)
                    </Button>
                  )}
                {workOrder.travelerCoverage?.map((coverage) => (
                  <Button key={coverage.travelerId} asChild variant="outline">
                    <Link href={`/travelers/${coverage.travelerId}/execute`}>
                      Open {coverage.travelerType} Traveler · Qty{' '}
                      {coverage.coverageQuantity}
                    </Link>
                  </Button>
                ))}
                {workOrder.travelerId && !workOrder.travelerCoverage?.length ? (
                  <Button asChild>
                    <Link href={`/travelers/${workOrder.travelerId}/execute`}>
                      Open Traveler
                    </Link>
                  </Button>
                ) : (
                  <Button
                    disabled={
                      !executionEnabled ||
                      workOrder.readiness !== 'READY' ||
                      start.isPending
                    }
                    onClick={() => start.mutate(workOrder)}
                  >
                    Start Work / Open Traveler
                  </Button>
                )}
                {workOrder.readiness === 'IN_PROGRESS' && (
                  <Button
                    variant="outline"
                    disabled={!executionEnabled || completeOperation.isPending}
                    onClick={() => completeOperation.mutate(workOrder)}
                  >
                    Complete Current Operation
                  </Button>
                )}
                {workOrder.blockers.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(workOrder.authorityId))
                          next.delete(workOrder.authorityId);
                        else next.add(workOrder.authorityId);
                        return next;
                      })
                    }
                  >
                    {open ? (
                      <ChevronDown className="mr-1 h-4 w-4" />
                    ) : (
                      <ChevronRight className="mr-1 h-4 w-4" />
                    )}
                    {workOrder.blockers.length} blocker
                    {workOrder.blockers.length === 1 ? '' : 's'}
                  </Button>
                )}
              </div>
              {open && (
                <div className="space-y-2 rounded-md border p-3">
                  {workOrder.blockers.map((blocker) => (
                    <div
                      key={
                        blocker.dependencyId ?? blocker.materialRequirementId
                      }
                      className="text-sm"
                    >
                      <div className="font-medium">
                        {blocker.childWorkOrderNumber
                          ? 'Waiting on manufactured child'
                          : 'Waiting on material'}
                      </div>
                      <div>
                        {blocker.childWorkOrderNumber ?? 'Material'} —{' '}
                        {blocker.childPartNumber ?? blocker.partNumber} —{' '}
                        {blocker.satisfiedQuantity}/{blocker.requiredQuantity}{' '}
                        satisfied
                        {blocker.department ? ` — ${blocker.department}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editing?.workOrderNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Priority</Label>
              <Select
                value={editPriority}
                onValueChange={(value) =>
                  setEditPriority(value as QueueWorkOrder['priority'])
                }
              >
                <SelectTrigger data-testid="select-work-order-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="work-order-due-date">Due date</Label>
              <Input
                id="work-order-due-date"
                type="date"
                value={editDueDate}
                onChange={(event) => setEditDueDate(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="work-order-description">Description</Label>
              <Input
                id="work-order-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="work-order-edit-reason">Reason for change</Label>
              <Input
                id="work-order-edit-reason"
                value={editReason}
                onChange={(event) => setEditReason(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={
                editReason.trim().length < 10 || updateManagement.isPending
              }
              onClick={() => updateManagement.mutate()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

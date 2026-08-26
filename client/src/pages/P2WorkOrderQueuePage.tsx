import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Factory,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useRoute } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  travelerRequirement: 'REQUIRED' | 'NOT_REQUIRED_APPROVED';
  travelerId?: string;
  parentAuthorityId?: string;
  concurrencyVersion: number;
  readiness: string;
  blockers: Blocker[];
};
type QueueResponse = { departmentId: string; workOrders: QueueWorkOrder[] };

const queueReadsEnabled =
  import.meta.env.VITE_P2_MANUFACTURING_WORK_ORDER_QUEUE_READS_ENABLED ===
  'true';
const executionEnabled =
  import.meta.env.VITE_P2_MANUFACTURING_WORK_ORDER_EXECUTION_ENABLED === 'true';

const label = (readiness: string) =>
  readiness
    .replace('BLOCKED_', 'BLOCKED — ')
    .replaceAll('_', ' ')
    .toUpperCase();

export default function P2WorkOrderQueuePage() {
  const [, params] = useRoute('/p2-work-orders/queues/:departmentId');
  const departmentId = params?.departmentId ?? '';
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const queryKey = ['/api/p2-work-orders/queues', departmentId];
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
    <div className="space-y-4 p-6" data-testid="p2-work-order-queue">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Factory className="h-6 w-6" /> P2 W/O Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Frozen released P2 work only. Blocked work remains visible and cannot
          be started.
        </p>
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
      {queue.data?.workOrders.map((workOrder) => {
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
                    complete
                  </p>
                </div>
                <Badge variant={blocked ? 'destructive' : 'outline'}>
                  {label(workOrder.readiness)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {workOrder.travelerId ? (
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
    </div>
  );
}

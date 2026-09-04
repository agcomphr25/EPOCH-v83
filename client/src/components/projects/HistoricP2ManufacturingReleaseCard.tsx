import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

type HistoricReleaseEvidence = {
  key: string;
  label: string;
  passed: boolean;
  referenceIds?: string[];
};

type HistoricReleaseBlocker = {
  code: string;
  message: string;
};

type HistoricWorkOrder = {
  id: string | number;
  workOrderNumber?: string;
  work_order_number?: string;
  status?: string;
  wadStatus?: string | null;
  wad_status?: string | null;
};

type HistoricWorkOrderReadiness = {
  workOrder: HistoricWorkOrder | null;
  eligible: boolean;
  alreadyReleased: boolean;
  evidence: HistoricReleaseEvidence[];
  blockers: HistoricReleaseBlocker[];
};

type HistoricReleaseReadinessResponse = {
  authorityMode: 'HISTORIC_P2_COMPATIBILITY' | string;
  projectId: string | number;
  workflowVersion: 'legacy_v1' | string;
  orders: HistoricWorkOrderReadiness[];
};

type HistoricReleaseResponse = {
  released: boolean;
  alreadyReleased: boolean;
  eligibility: HistoricWorkOrderReadiness;
  workOrder: HistoricWorkOrder;
};

type HistoricP2ManufacturingReleaseCardProps = {
  projectId: string;
  workflowVersion?: string | null;
  linkedP2PoId?: number | null;
};

export function isHistoricP2ManufacturingReleaseProject(
  workflowVersion: string | null | undefined,
  linkedP2PoId: number | null | undefined
) {
  return workflowVersion === 'legacy_v1' && linkedP2PoId != null;
}

function displayStatus(status: string | null | undefined) {
  if (!status) return 'Unknown';
  return status
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function workOrderNumber(workOrder: HistoricWorkOrder) {
  return (
    workOrder.workOrderNumber ??
    workOrder.work_order_number ??
    `Work order ${workOrder.id}`
  );
}

function releaseErrorMessage(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return 'The manufacturing order could not be released.';
  }

  const requestError = error as {
    message?: string;
    responseData?: {
      blockers?: HistoricReleaseBlocker[];
      eligibility?: { blockers?: HistoricReleaseBlocker[] };
    };
  };
  const blockers =
    requestError.responseData?.blockers ??
    requestError.responseData?.eligibility?.blockers ??
    [];

  if (blockers.length > 0) {
    return blockers.map((blocker) => blocker.message).join(' ');
  }

  return (
    requestError.message ?? 'The manufacturing order could not be released.'
  );
}

export default function HistoricP2ManufacturingReleaseCard({
  projectId,
  workflowVersion,
  linkedP2PoId,
}: HistoricP2ManufacturingReleaseCardProps) {
  const { toast } = useToast();
  const shouldLoad =
    isHistoricP2ManufacturingReleaseProject(workflowVersion, linkedP2PoId) &&
    Boolean(projectId);
  const readinessEndpoint = `/api/work-orders/project/${projectId}/historic-p2-release-readiness`;
  const readinessQueryKey = [
    '/api/work-orders/project',
    projectId,
    'historic-p2-release-readiness',
  ] as const;

  const readinessQuery = useQuery<HistoricReleaseReadinessResponse>({
    queryKey: readinessQueryKey,
    queryFn: () => apiRequest(readinessEndpoint),
    enabled: shouldLoad,
  });

  const releaseMutation = useMutation<
    HistoricReleaseResponse,
    Error,
    HistoricWorkOrder
  >({
    mutationFn: (workOrder) =>
      apiRequest(`/api/work-orders/${workOrder.id}/historic-p2-release`, {
        method: 'POST',
        body: { projectId },
      }),
    onSuccess: async (result, requestedWorkOrder) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: readinessQueryKey }),
        queryClient.invalidateQueries({
          queryKey: ['/api/work-orders/project', projectId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['/api/projects', projectId, 'p2-hub'],
        }),
      ]);

      const number = workOrderNumber(result.workOrder ?? requestedWorkOrder);
      if (result.alreadyReleased) {
        toast({
          title: 'Manufacturing order already released',
          description: `${number} was already available for manufacturing. No duplicate release was recorded.`,
        });
        return;
      }

      toast({
        title: 'Manufacturing order released',
        description: `${number} was released using verified historic production authority.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Manufacturing order cannot be released',
        description: releaseErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  if (!shouldLoad) return null;

  if (readinessQuery.isLoading) {
    return (
      <Card data-testid="historic-p2-manufacturing-release-card">
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying historic manufacturing-release evidence…
        </CardContent>
      </Card>
    );
  }

  if (readinessQuery.error || !readinessQuery.data) {
    return (
      <Card
        className="border-red-300"
        data-testid="historic-p2-manufacturing-release-card"
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Historic P2 Workflow
          </CardTitle>
          <CardDescription>
            Historic release evidence could not be verified.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-red-700" role="alert">
          {releaseErrorMessage(readinessQuery.error)}
        </CardContent>
      </Card>
    );
  }

  const readiness = readinessQuery.data;
  if (readiness.authorityMode !== 'HISTORIC_P2_COMPATIBILITY') return null;
  const orders = Array.isArray(readiness.orders) ? readiness.orders : [];

  return (
    <Card data-testid="historic-p2-manufacturing-release-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Historic P2 Workflow
            </CardTitle>
            <CardDescription className="mt-1">
              This project keeps its original workflow and uses verified
              historic production-release evidence for existing manufacturing
              orders.
            </CardDescription>
          </div>
          <Badge variant="outline">Historic compatibility authority</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {orders.length === 0 ? (
          <div className="rounded border border-dashed p-4 text-sm text-muted-foreground">
            No existing manufacturing orders were found for this project.
          </div>
        ) : (
          orders.map((order) => {
            const workOrder = order.workOrder;
            if (!workOrder) return null;
            const number = workOrderNumber(workOrder);
            const blockers = Array.isArray(order.blockers)
              ? order.blockers
              : [];
            const evidence = Array.isArray(order.evidence)
              ? order.evidence
              : [];
            const alreadyReleased =
              order.alreadyReleased || workOrder.status === 'RELEASED';
            const isReleasing =
              releaseMutation.isPending &&
              releaseMutation.variables?.id === workOrder.id;

            return (
              <section
                className="space-y-3 rounded border p-4"
                data-testid={`historic-release-order-${workOrder.id}`}
                key={workOrder.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Factory className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-semibold">{number}</h3>
                      <Badge
                        variant={
                          alreadyReleased
                            ? 'secondary'
                            : order.eligible
                              ? 'default'
                              : 'destructive'
                        }
                      >
                        {alreadyReleased
                          ? 'Released'
                          : order.eligible
                            ? 'Ready to release'
                            : 'Blocked'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Order status: {displayStatus(workOrder.status)} · WAD
                      status:{' '}
                      {displayStatus(
                        workOrder.wadStatus ?? workOrder.wad_status
                      )}
                    </p>
                  </div>
                  {order.eligible && !alreadyReleased && (
                    <Button
                      data-testid={`historic-release-button-${workOrder.id}`}
                      disabled={releaseMutation.isPending}
                      onClick={() => releaseMutation.mutate(workOrder)}
                      size="sm"
                    >
                      {isReleasing && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {isReleasing
                        ? 'Releasing…'
                        : 'Release Manufacturing Order'}
                    </Button>
                  )}
                </div>

                <div>
                  <p className="text-sm font-medium">
                    Historic release evidence
                  </p>
                  {evidence.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      No qualifying evidence was returned.
                    </p>
                  ) : (
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {evidence.map((item) => (
                        <li
                          className="flex items-start gap-2 text-sm"
                          key={item.key}
                        >
                          {item.passed ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-green-600" />
                          ) : (
                            <XCircle className="mt-0.5 h-4 w-4 flex-none text-red-600" />
                          )}
                          <span>{item.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {blockers.length > 0 && (
                  <div
                    className="rounded border border-amber-300 bg-amber-50 p-3 text-amber-950"
                    role="alert"
                  >
                    <p className="text-sm font-medium">
                      Manufacturing order cannot be released.
                    </p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {blockers.map((blocker) => (
                        <li key={blocker.code}>{blocker.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, PackageCheck, ShieldAlert, Truck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Row = Record<string, unknown>;
type Dashboard = {
  ctx: {
    project: { po_number?: string; customer_name?: string; status?: string };
    shippingStep: { status: string };
  };
  eligibleAllocations: Row[];
  allocations: Row[];
  shippingHolds: Row[];
  review?: Row | null;
  authorizations: Row[];
  closeout?: Row | null;
  approvals: Row[];
  closeoutEvents: Row[];
};

const releasedDocument = {
  documentId: 'customer-shipment-package',
  documentNumber: 'SHIPMENT-MANIFEST',
  revision: 'CURRENT',
  status: 'RELEASED',
  inclusionReason: 'Controlled customer shipment deliverables',
  required: true,
};

export default function P2V2ShippingProjectCloseout({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const key = ['/api/projects', projectId, 'workflow-v2', 'shipping-closeout'];
  const [selected, setSelected] = useState<string[]>([]);
  const [tracking, setTracking] = useState('');
  const [pod, setPod] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [signatureMeaning, setSignatureMeaning] = useState(
    'I authorize the exact released allocations and evidence identified in this revision'
  );
  const [actionError, setActionError] = useState('');
  const [packageData, setPackageData] = useState({
    packagingMethod: '',
    preservationMethod: '',
    packageCount: 1,
    weightLbs: 0,
    length: 0,
    width: 0,
    height: 0,
    carrier: '',
    serviceLevel: '',
    name: '',
    line1: '',
    city: '',
    region: '',
    postalCode: '',
    country: 'US',
  });
  const { data, isLoading, error } = useQuery<Dashboard>({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/shipping-closeout`,
        { credentials: 'include' }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Unable to load Stage 10 evidence');
      return body;
    },
  });
  const action = useMutation({
    mutationFn: async ({
      path,
      body,
    }: {
      path: string;
      body: Record<string, unknown>;
    }) => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/shipping-closeout/${path}`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      const responseBody = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          responseBody?.message || 'Shipping or closeout action failed'
        );
      return responseBody;
    },
    onSuccess: (body) => {
      setActionError('');
      queryClient.setQueryData(key, body.dashboard ?? body);
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (mutationError) =>
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Shipping or closeout action failed'
      ),
  });
  const post = (path: string, body: Record<string, unknown>) =>
    action.mutate({ path, body });
  const currentAuthorization = useMemo(
    () =>
      data?.authorizations.find((entry) =>
        ['AUTHORIZED', 'CONFIRMED', 'DELIVERY_EXCEPTION'].includes(
          String(entry.status)
        )
      ),
    [data?.authorizations]
  );
  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6">
          Loading Shipping and closeout evidence…
        </CardContent>
      </Card>
    );
  if (error || !data)
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Stage 10 unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Unable to load Stage 10.'}
        </AlertDescription>
      </Alert>
    );
  const reviewLock = Number(data.review?.lock_version ?? 0);
  const closeoutLock = Number(data.closeout?.lock_version ?? 0);
  const reviewBody = {
    ...(reviewLock ? { expectedLockVersion: reviewLock } : {}),
    allocationIds: selected,
    packaging: {
      packagingMethod: packageData.packagingMethod,
      preservationMethod: packageData.preservationMethod,
      packageCount: packageData.packageCount,
      packageIdentifiers: Array.from(
        { length: packageData.packageCount },
        (_, index) => `PKG-${index + 1}`
      ),
      weightLbs: packageData.weightLbs,
      dimensions: {
        length: packageData.length,
        width: packageData.width,
        height: packageData.height,
      },
      moistureFodControls: 'Verified clean, dry, and protected',
      handlingLabels: ['Customer PO', 'Part', 'Revision', 'Serial/Lot'],
    },
    shipTo: {
      name: packageData.name,
      line1: packageData.line1,
      city: packageData.city,
      region: packageData.region,
      postalCode: packageData.postalCode,
      country: packageData.country,
    },
    carrier: {
      carrier: packageData.carrier,
      serviceLevel: packageData.serviceLevel,
      manualTrackingAllowed: true,
      partialShipmentAllowed: true,
      deliveryRequired: true,
    },
    documentManifest: [releasedDocument],
  };
  const closeoutBody = {
    ...(closeoutLock ? { expectedLockVersion: closeoutLock } : {}),
    deliveryRequired: true,
    financeTransferredOrComplete: true,
    financeDisposition: 'Transferred to Finance under existing company policy',
    productionReconciled: true,
    qualityReconciled: true,
    supplierAndPropertyReconciled: true,
    openActions: [],
    documentArchiveManifest: [releasedDocument],
  };
  const setField = (field: keyof typeof packageData, value: string | number) =>
    setPackageData((current) => ({ ...current, [field]: value }));
  return (
    <div className="space-y-4" data-testid="p2-v2-shipping-project-closeout">
      <Alert>
        <Truck className="h-4 w-4" />
        <AlertTitle>Stage 10 — Shipping & Project Closing</AlertTitle>
        <AlertDescription>
          Product Release is required before Shipping. Shipment does not
          automatically close the project. Project Closing is a separate
          approved action that freezes the workflow and evidence.
        </AlertDescription>
      </Alert>
      {actionError && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Action not completed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <CardTitle>Shipping readiness and packaging</CardTitle>
              <CardDescription>
                {data.ctx.project.customer_name || 'Customer'} · PO{' '}
                {data.ctx.project.po_number || '—'} · exact immutable Product
                Release allocations
              </CardDescription>
            </div>
            <Badge>{String(data.review?.status ?? 'NOT_STARTED')}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            {data.eligibleAllocations.map((allocation) => {
              const allocationId = String(allocation.id);
              return (
                <label
                  key={allocationId}
                  className="flex items-center gap-2 rounded border p-3"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(allocationId)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, allocationId]
                          : current.filter((id) => id !== allocationId)
                      )
                    }
                  />
                  <span>
                    {String(allocation.release_number)} ·{' '}
                    {String(allocation.part_number)} ·{' '}
                    {String(
                      allocation.serial_number || allocation.batch_lot || 'bulk'
                    )}{' '}
                    · qty {String(allocation.quantity)}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              ['Packaging method', 'packagingMethod'],
              ['Preservation method', 'preservationMethod'],
              ['Weight (lb)', 'weightLbs'],
              ['Length', 'length'],
              ['Width', 'width'],
              ['Height', 'height'],
              ['Ship-to name', 'name'],
              ['Address', 'line1'],
              ['City', 'city'],
              ['State/region', 'region'],
              ['Postal code', 'postalCode'],
              ['Country', 'country'],
              ['Carrier', 'carrier'],
              ['Service', 'serviceLevel'],
            ].map(([label, field]) => (
              <label key={field} className="space-y-1 text-sm">
                <span>{label}</span>
                <Input
                  aria-label={label}
                  type={
                    ['weightLbs', 'length', 'width', 'height'].includes(field)
                      ? 'number'
                      : 'text'
                  }
                  value={String(packageData[field as keyof typeof packageData])}
                  onChange={(event) =>
                    setField(
                      field as keyof typeof packageData,
                      event.target.type === 'number'
                        ? Number(event.target.value)
                        : event.target.value
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => post('shipping/reviews', reviewBody)}
              disabled={action.isPending || !selected.length}
            >
              <PackageCheck className="mr-2 h-4 w-4" />
              Verify packaging and readiness
            </Button>
            <Button
              onClick={() =>
                post('shipping/authorize', {
                  expectedLockVersion: reviewLock,
                  idempotencyKey: crypto.randomUUID(),
                  signatureMeaning,
                })
              }
              disabled={
                action.isPending || data.review?.status !== 'READY_TO_SHIP'
              }
            >
              Authorize Shipment
            </Button>
          </div>
          <Input
            aria-label="Authorization signature meaning"
            value={signatureMeaning}
            onChange={(event) => setSignatureMeaning(event.target.value)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Shipment, tracking, delivery, and holds</CardTitle>
          <CardDescription>
            Carrier labels use the established carrier boundary when configured;
            otherwise authorized manual tracking remains identified as manual.
            Tracking alone is not proof of delivery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            aria-label="Carrier or manual tracking number"
            placeholder="Tracking or controlled manual evidence"
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
          />
          <Input
            aria-label="Proof of delivery reference"
            placeholder="Proof-of-delivery reference"
            value={pod}
            onChange={(event) => setPod(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                post(
                  `shipping/authorizations/${String(currentAuthorization?.id)}/confirm`,
                  {
                    idempotencyKey: crypto.randomUUID(),
                    trackingNumber: tracking,
                    manualTracking: true,
                  }
                )
              }
              disabled={
                action.isPending ||
                currentAuthorization?.status !== 'AUTHORIZED' ||
                !tracking
              }
            >
              Confirm Shipment
            </Button>
            <Button
              onClick={() =>
                post(
                  `shipping/authorizations/${String(currentAuthorization?.id)}/delivery`,
                  {
                    status: 'DELIVERED',
                    evidenceSource: 'MANUAL_POD',
                    proofOfDeliveryReference: pod,
                  }
                )
              }
              disabled={
                action.isPending ||
                currentAuthorization?.status !== 'CONFIRMED' ||
                !pod
              }
            >
              Confirm Delivery
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                post(
                  `shipping/authorizations/${String(currentAuthorization?.id)}/delivery`,
                  {
                    status: 'DELIVERY_EXCEPTION',
                    evidenceSource: 'CARRIER',
                    exception:
                      'Carrier delivery exception requires disposition',
                  }
                )
              }
              disabled={
                action.isPending || currentAuthorization?.status !== 'CONFIRMED'
              }
            >
              Record delivery exception
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              aria-label="Shipping hold reason"
              placeholder="Shipping hold reason"
              value={holdReason}
              onChange={(event) => setHoldReason(event.target.value)}
            />
            <Button
              variant="destructive"
              onClick={() =>
                post('shipping/holds', {
                  scope: 'PROJECT',
                  reason: holdReason,
                  reviewId: data.review?.id,
                })
              }
              disabled={!holdReason}
            >
              Place Shipping hold
            </Button>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Immutable shipment history</p>
            {data.authorizations.map((authorization) => (
              <div
                key={String(authorization.id)}
                className="rounded border p-2"
              >
                {String(authorization.authorization_number)} ·{' '}
                {String(authorization.status)} ·{' '}
                {String(
                  (authorization.carrier_snapshot as Row | undefined)
                    ?.carrier ?? 'manual'
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Controlled Project Closing</CardTitle>
          <CardDescription>
            Reconcile PO quantities, releases, shipments, deliveries, Quality,
            Production, commercial actions, and the immutable archive before
            approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ['PROJECT_MANAGEMENT', 'project-management'],
              ['QUALITY', 'quality'],
              ['OPERATIONS', 'operations'],
              ['SHIPPING_LOGISTICS', 'shipping'],
            ].map(([type, path]) => (
              <div key={type} className="rounded border p-2">
                <p className="text-xs text-muted-foreground">{type}</p>
                <p>
                  {data.approvals
                    .find((approval) => approval.approval_type === type)
                    ?.decision?.toString() || 'Pending'}
                </p>
                <div className="mt-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      post(`closeout/decisions/${path}`, {
                        expectedLockVersion: closeoutLock,
                        decision: 'APPROVED',
                        signatureMeaning: `${type} approves closeout revision ${String(data.closeout?.revision_number)}`,
                        reason: '',
                      })
                    }
                    disabled={
                      action.isPending ||
                      data.closeout?.status !== 'PENDING_APPROVAL'
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      post(`closeout/decisions/${path}`, {
                        expectedLockVersion: closeoutLock,
                        decision: 'REJECTED',
                        signatureMeaning: `${type} rejects closeout revision ${String(data.closeout?.revision_number)}`,
                        reason: 'Closeout evidence requires correction',
                      })
                    }
                    disabled={
                      action.isPending ||
                      data.closeout?.status !== 'PENDING_APPROVAL'
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => post('closeout/reviews', closeoutBody)}
              disabled={action.isPending}
            >
              <Archive className="mr-2 h-4 w-4" />
              Recalculate closeout readiness
            </Button>
            <Button
              onClick={() =>
                post('closeout/submit', {
                  expectedLockVersion: closeoutLock,
                })
              }
              disabled={
                action.isPending ||
                data.closeout?.status !== 'READY_FOR_CLOSEOUT_REVIEW'
              }
            >
              Submit closeout review
            </Button>
            <Button
              onClick={() =>
                post('closeout/close', {
                  expectedLockVersion: closeoutLock,
                  idempotencyKey: crypto.randomUUID(),
                  signatureMeaning:
                    'I close the fully reconciled customer-order project scope',
                })
              }
              disabled={
                action.isPending || data.closeout?.status !== 'PENDING_APPROVAL'
              }
            >
              Close Project
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                post('closeout/reopen', {
                  reason: 'Controlled follow-up requires reopening Stage 10',
                  responsibleOwner: 'Project Management',
                })
              }
              disabled={data.ctx.project.status !== 'completed'}
            >
              Controlled Reopen
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Approval controls are capability-gated by Project Management,
            Quality, Operations, Shipping/Logistics, Finance, and Supply Chain
            as applicable. Segregation of duties applies to the exact closeout
            revision.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

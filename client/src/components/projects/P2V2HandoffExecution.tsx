import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Model = {
  p2PoNumber?: string | null;
  state: string;
  currentP2Status: string;
  quantityRequired: number;
  quantityPending: number;
  quantityInProduction: number;
  quantityCompleted: number;
  quantityDispositioned: number;
  quantityAcceptedByQuality: number;
  quantityReleased: number;
  quantityShipped: number;
  productionHolds: number;
  qualityHolds: number;
  shippingHolds: number;
  openNcrs: number;
  certificationStatus: string;
  shippingStatus: string;
  executionComplete: boolean;
  closingUnlocked: boolean;
  blockers: string[];
  nextAction: string;
  lastAuthoritativeUpdate?: string | null;
  links: {
    controlCenter: string;
    production?: string | null;
    productionMap?: string | null;
    projectProduction?: string | null;
    pmControlCenter?: string | null;
    dailyTagUp?: string | null;
    p2WorkOrderQueues?: string | null;
  };
};

export default function P2V2HandoffExecution({
  projectId,
  mode,
  showNavigation = true,
}: {
  projectId: string;
  mode: 'handoff' | 'execution';
  showNavigation?: boolean;
}) {
  const key = ['/api/projects', projectId, 'workflow-v2', 'p2-handoff'];
  const queryClient = useQueryClient();
  const releaseKey = useRef<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [errorText, setErrorText] = useState('');
  const { data, isLoading, error } = useQuery<Model>({
    queryKey: key,
    queryFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/p2-handoff`,
        { credentials: 'include' }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Unable to load P2 handoff evidence');
      return {
        ...body,
        blockers: Array.isArray(body?.blockers) ? body.blockers : [],
        links:
          body?.links && typeof body.links === 'object'
            ? body.links
            : { controlCenter: '/p2-control-center' },
      };
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/p2-handoff/approve`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmation: 'APPROVE PRODUCTION RELEASE',
          }),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Production Release approval failed');
      return body;
    },
    onSuccess: () => {
      setErrorText('');
      queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) =>
      setErrorText(e instanceof Error ? e.message : 'Approval failed'),
  });
  const release = useMutation({
    mutationFn: async () => {
      releaseKey.current ||= crypto.randomUUID();
      const response = await fetch(
        `/api/projects/${projectId}/workflow-v2/p2-handoff/release`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: releaseKey.current,
            confirmation,
            signatureMeaning:
              'I release the approved customer order to the authoritative P2 Control Center for controlled execution',
          }),
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(body?.message || 'Release to P2 failed');
      return body;
    },
    onSuccess: (body) => {
      setErrorText('');
      queryClient.setQueryData(key, body);
      queryClient.invalidateQueries({
        queryKey: ['/api/projects', projectId, 'workflow-v2'],
      });
    },
    onError: (e) =>
      setErrorText(e instanceof Error ? e.message : 'Release failed'),
  });
  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        Loading authoritative P2 status…
      </p>
    );
  if (error || !data)
    return (
      <p className="text-sm text-red-700">
        {error instanceof Error ? error.message : 'P2 status unavailable.'}
      </p>
    );
  const blockers = Array.isArray(data.blockers) ? data.blockers : [];
  const controlCenterLink =
    data.links && typeof data.links.controlCenter === 'string'
      ? data.links.controlCenter
      : '/p2-control-center';
  const encodedProjectId = encodeURIComponent(projectId);
  const navigationLinks = [
    { label: 'Open P2 Control Center', href: controlCenterLink },
    {
      label: 'Open Production Queue',
      href:
        data.links?.production ??
        `/p2-control-center?tab=production&projectId=${encodedProjectId}`,
    },
    {
      label: 'Open Production Map',
      href:
        data.links?.productionMap ??
        `/p2-control-center?tab=production-map&projectId=${encodedProjectId}`,
    },
    {
      label: 'Open Project Production',
      href:
        data.links?.projectProduction ??
        `/projects/${encodedProjectId}?tab=production`,
    },
    {
      label: 'Open PM Dashboard',
      href:
        data.links?.pmControlCenter ??
        `/pm-control-center?project=${encodedProjectId}`,
    },
    {
      label: 'Open Daily Tag Up',
      href:
        data.links?.dailyTagUp ?? `/daily-tag-up?projectId=${encodedProjectId}`,
    },
    {
      label: 'Open P2 Work Order Queues',
      href:
        data.links?.p2WorkOrderQueues ??
        `/p2-work-orders/queues/all?projectId=${encodedProjectId}`,
    },
  ];
  const navigation = (
    <div
      className="flex flex-wrap gap-2"
      data-testid="p2-v2-context-navigation"
    >
      {navigationLinks.map((link, index) => (
        <Button
          key={link.label}
          asChild
          variant={index === 0 ? 'default' : 'outline'}
        >
          <a href={link.href}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {link.label}
          </a>
        </Button>
      ))}
    </div>
  );
  if (mode === 'handoff')
    return (
      <Card data-testid="p2-v2-handoff-actions">
        <CardHeader>
          <CardTitle>Two controlled actions</CardTitle>
          <CardDescription>
            Approval records the exact readiness baseline. Release is a separate
            consequential handoff and does not create production orders or
            travelers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
            A. Approve Production Release
          </Button>
          <div className="space-y-2 rounded border p-3">
            <p className="font-medium">B. Release to P2 Control Center</p>
            <Input
              aria-label="Release confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Type RELEASE TO P2 CONTROL CENTER"
            />
            <Button
              onClick={() => release.mutate()}
              disabled={
                release.isPending ||
                confirmation !== 'RELEASE TO P2 CONTROL CENTER'
              }
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Release to P2 Control Center
            </Button>
          </div>
          {errorText && <p className="text-sm text-red-700">{errorText}</p>}
          {showNavigation && navigation}
        </CardContent>
      </Card>
    );
  const quantities = [
    ['Required', data.quantityRequired],
    ['Pending', data.quantityPending],
    ['In production', data.quantityInProduction],
    ['Completed', data.quantityCompleted],
    ['Formally dispositioned', data.quantityDispositioned],
    ['Accepted by Quality', data.quantityAcceptedByQuality],
    ['Released', data.quantityReleased],
    ['Shipped', data.quantityShipped],
  ];
  return (
    <Card data-testid="p2-v2-execution-summary">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>P2 Execution — authoritative summary</CardTitle>
            <CardDescription>
              Read-only. Scheduling, travelers, production, inspection,
              certification, packing, and shipping are recorded in the P2
              Control Center.
            </CardDescription>
          </div>
          <Badge>{data.state}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">P2 PO</p>
            <p className="font-medium">{data.p2PoNumber || 'Not linked'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">P2 status</p>
            <p className="font-medium">{data.currentP2Status}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Certification</p>
            <p className="font-medium">{data.certificationStatus}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Shipping</p>
            <p className="font-medium">{data.shippingStatus}</p>
          </div>
          {quantities.map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded border p-3 text-sm">
          <p>
            <strong>Holds:</strong> Production {data.productionHolds} · Quality{' '}
            {data.qualityHolds} · Shipping {data.shippingHolds}
          </p>
          <p>
            <strong>Open NCRs:</strong> {data.openNcrs}
          </p>
          <p>
            <strong>Next required action:</strong> {data.nextAction}
          </p>
          <p>
            <strong>Last authoritative update:</strong>{' '}
            {data.lastAuthoritativeUpdate
              ? new Date(data.lastAuthoritativeUpdate).toLocaleString()
              : 'Not recorded'}
          </p>
        </div>
        {blockers.length > 0 && (
          <div className="rounded bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Blockers</strong>
            <ul className="list-disc pl-5">
              {blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}
        {showNavigation && navigation}
      </CardContent>
    </Card>
  );
}

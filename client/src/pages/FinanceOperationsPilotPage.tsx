import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';

const variants = [
  ['clean', 'Clean candidate'],
  ['missing-contact', 'Missing billing contact'],
  ['missing-terms', 'Missing payment terms'],
  ['quantity-mismatch', 'Quantity mismatch'],
  ['duplicate-risk', 'Duplicate risk'],
  ['source-changed', 'Source changed'],
] as const;

type Scenario = {
  scenarioId: string;
  candidate: {
    status: 'CLEAN' | 'BLOCKED';
    eligibleForDraftPreparation: boolean;
    revenueStream: string;
    invoiceStatusIfPrepared: string;
    subtotal: number;
    blockers: string[];
    sourceVersion: string;
    evidenceHash: string;
    evidence: Record<string, string | number | null>;
  };
  approval: { status: string; reason: string };
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export default function FinanceOperationsPilotPage() {
  const [variant, setVariant] = useState<(typeof variants)[number][0]>('clean');
  const { data, isLoading, error } = useQuery<Scenario>({
    queryKey: ['/api/finance-operations/pilot-scenarios/syn-p2-001', variant],
    queryFn: () =>
      apiRequest(
        `/api/finance-operations/pilot-scenarios/syn-p2-001?variant=${variant}`
      ),
  });

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <FlaskConical className="h-7 w-7 text-indigo-600" />
          <h1 className="text-2xl font-bold">
            Finance Operations Pilot — SYN-P2-001
          </h1>
        </div>
        <p className="mt-2 text-muted-foreground">
          Read-only P2 invoice-candidate simulation. It never queries or
          modifies production records.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/finance/p2-observation">Real P2 observation</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/finance/billing-recipients">
            Manage billing recipients
          </Link>
        </Button>
      </div>

      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="flex gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <strong>Training simulation.</strong> No packing slip, invoice,
            approval, posting, or email is created.
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {variants.map(([value, label]) => (
          <Button
            key={value}
            variant={variant === value ? 'default' : 'outline'}
            onClick={() => setVariant(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading && <p>Loading simulation…</p>}
      {error && (
        <Card className="border-red-300">
          <CardContent className="p-4 text-red-700">
            {(error as Error).message}
          </CardContent>
        </Card>
      )}
      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Candidate status</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                {data.candidate.status === 'CLEAN' ? (
                  <CheckCircle2 className="text-green-600" />
                ) : (
                  <AlertTriangle className="text-amber-600" />
                )}
                <Badge
                  variant={
                    data.candidate.status === 'CLEAN'
                      ? 'default'
                      : 'destructive'
                  }
                >
                  {data.candidate.status}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Simulated subtotal</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">
                {money.format(data.candidate.subtotal)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Execution boundary</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-green-700">
                <ShieldCheck /> All writes blocked
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Deterministic decision</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p>
                {data.candidate.eligibleForDraftPreparation
                  ? 'Eligible for draft preparation.'
                  : 'Not eligible for draft preparation.'}
              </p>
              {data.candidate.blockers.length > 0 && (
                <ul className="list-disc space-y-1 pl-6">
                  {data.candidate.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              )}
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Revenue stream</dt>
                  <dd>{data.candidate.revenueStream}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    Hypothetical draft status
                  </dt>
                  <dd>{data.candidate.invoiceStatusIfPrepared}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Source version</dt>
                  <dd>{data.candidate.sourceVersion}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Approval state</dt>
                  <dd>{data.approval.status}</dd>
                </div>
              </dl>
              {data.approval.status === 'REVOKED' && (
                <p className="font-medium text-amber-700">
                  {data.approval.reason}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sanitized synthetic evidence</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(data.candidate.evidence).map(
                    ([key, value]) => (
                      <tr key={key} className="border-b">
                        <th className="py-2 pr-6 text-left font-medium">
                          {key}
                        </th>
                        <td className="py-2">{value ?? 'Missing'}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
              <p className="mt-4 break-all text-xs text-muted-foreground">
                Evidence hash: {data.candidate.evidenceHash}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

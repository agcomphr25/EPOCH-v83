import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'wouter';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';

type Candidate = {
  packingSlipId: string;
  packingSlipNumber: string;
  customerName: string;
  poNumber: string | null;
  status: 'CLEAN' | 'BLOCKED';
  blockers: string[];
  observedSubtotal: number;
  billingRecipientToCount: number;
  billingRecipientCcCount: number;
};

type Observation = {
  recordCount: number;
  cleanCount: number;
  blockedCount: number;
  modelGap: string;
  candidates: Candidate[];
};

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export default function FinanceP2ObservationPage() {
  const observation = useQuery<Observation>({
    queryKey: ['/api/finance-operations/p2-candidates'],
    queryFn: () => apiRequest('/api/finance-operations/p2-candidates'),
  });

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/finance/operations-pilot"
            className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to simulation
          </Link>
          <h1 className="text-2xl font-bold">
            Real P2 Invoice-Candidate Observation
          </h1>
          <p className="mt-1 text-muted-foreground">
            Live evidence evaluated deterministically with every financial write
            disabled.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/finance/billing-recipients">
              <Users className="mr-2 h-4 w-4" /> Billing recipients
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => observation.refetch()}
            disabled={observation.isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${observation.isFetching ? 'animate-spin' : ''}`}
            />{' '}
            Refresh
          </Button>
        </div>
      </div>

      <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950/30">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div>
            <strong>Observation only.</strong> Limited P2, customer, PO,
            recipient, and AR fields are read. No AI is used. Drafting,
            approval, posting, sending, and all data changes are disabled on
            this page.
          </div>
        </CardContent>
      </Card>

      {observation.isLoading && <p>Reading P2 candidates…</p>}
      {observation.error && (
        <Card className="border-red-300">
          <CardContent className="p-4 text-red-700">
            {(observation.error as Error).message}
          </CardContent>
        </Card>
      )}
      {observation.data && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Metric title="Observed" value={observation.data.recordCount} />
            <Metric
              title="Clean"
              value={observation.data.cleanCount}
              tone="text-green-700"
            />
            <Metric
              title="Blocked"
              value={observation.data.blockedCount}
              tone="text-amber-700"
            />
          </div>
          <Card className="border-amber-300">
            <CardContent className="p-4 text-sm">
              <strong>Recipient migration note:</strong>{' '}
              {observation.data.modelGap}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>P2 packing-slip observations</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {observation.data.candidates.length === 0 ? (
                <p className="text-muted-foreground">
                  No P2 packing slips exist yet. The observer is ready and will
                  populate automatically when one is created.
                </p>
              ) : (
                <table className="w-full min-w-[1050px] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4">Packing slip</th>
                      <th className="py-2 pr-4">Customer</th>
                      <th className="py-2 pr-4">PO</th>
                      <th className="py-2 pr-4">Recipients</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {observation.data.candidates.map((candidate) => (
                      <tr
                        key={candidate.packingSlipId}
                        className="border-b align-top"
                      >
                        <td className="py-3 pr-4">
                          {candidate.packingSlipNumber}
                        </td>
                        <td className="py-3 pr-4">{candidate.customerName}</td>
                        <td className="py-3 pr-4">
                          {candidate.poNumber ?? 'Missing'}
                        </td>
                        <td className="py-3 pr-4">
                          {candidate.billingRecipientToCount} To /{' '}
                          {candidate.billingRecipientCcCount} CC
                        </td>
                        <td className="py-3 pr-4">
                          {money.format(candidate.observedSubtotal)}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              candidate.status === 'CLEAN'
                                ? 'default'
                                : 'destructive'
                            }
                          >
                            {candidate.status}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {candidate.blockers.length ? (
                            <ul className="list-disc space-y-1 pl-5">
                              {candidate.blockers.map((blocker) => (
                                <li key={blocker}>{blocker}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-green-700">
                              No blockers detected.
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  tone = '',
}: {
  title: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className={`text-2xl font-semibold ${tone}`}>
        {value}
      </CardContent>
    </Card>
  );
}

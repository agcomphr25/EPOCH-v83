import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

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
import { Textarea } from '@/components/ui/textarea';

type Category = {
  key: string;
  label: string;
  status: 'COMPLETE' | 'INCOMPLETE' | 'BLOCKED' | 'NOT_APPLICABLE';
  reason: string;
  owner: string;
  recordId: string;
  href: string;
};
type Readiness = {
  status: string;
  categories: Category[];
  blocking: Category[];
  calculatedAt: string;
  source: string;
};

async function request(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.message || payload.error || 'The request failed.');
  return payload;
}

export function FinalDesignReviewPanel({
  recordId,
  readOnly,
}: {
  recordId: string;
  readOnly: boolean;
}) {
  const query = useQuery<Readiness>({
    queryKey: [
      '/api/qms/design-control',
      recordId,
      'final-review',
      'readiness',
    ],
    queryFn: () =>
      request(`/api/qms/design-control/${recordId}/final-review/readiness`),
  });
  const [reviewRecordId, setReviewRecordId] = useState('');
  const [reviewVersionId, setReviewVersionId] = useState('');
  const [exception, setException] = useState({
    requirementKey: '',
    justification: '',
    risk: '',
    effectiveAt: new Date().toISOString().slice(0, 10),
    expiresAt: '',
    followUpAction: '',
  });
  const [message, setMessage] = useState('');
  const mutate = async (action: () => Promise<unknown>) => {
    setMessage('');
    try {
      await action();
      await query.refetch();
      setMessage('Authoritative Final Design Review evidence was saved.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Authoritative Final Design Review</CardTitle>
        <CardDescription>
          Readiness is aggregated from persisted lifecycle, configuration,
          document, change, verification, validation, and traceability
          evidence—not stage completion alone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.data && (
          <>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  query.data.status === 'COMPLETE' ? 'default' : 'destructive'
                }
              >
                {query.data.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {query.data.blocking.length} blocking category(s)
              </span>
            </div>
            <div className="divide-y rounded-md border">
              {query.data.categories.map((category) => (
                <div
                  className="grid gap-2 p-3 md:grid-cols-[12rem_10rem_1fr_10rem]"
                  key={category.key}
                >
                  <strong className="text-sm">{category.label}</strong>
                  <Badge
                    className="w-fit"
                    variant={
                      category.status === 'COMPLETE' ? 'default' : 'outline'
                    }
                  >
                    {category.status.replaceAll('_', ' ')}
                  </Badge>
                  <div className="text-sm">
                    <p>{category.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      Owner: {category.owner} · record {category.recordId}
                    </p>
                  </div>
                  <a className="text-sm underline" href={category.href}>
                    Open evidence
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
        {!readOnly && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Authorized exception</h3>
              <p className="text-xs text-muted-foreground">
                Exceptions require category, justification, risk, approving
                authority, effectivity, and follow-up evidence.
              </p>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={exception.requirementKey}
                onChange={(event) =>
                  setException((prior) => ({
                    ...prior,
                    requirementKey: event.target.value,
                  }))
                }
              >
                <option value="">Select readiness category…</option>
                {query.data?.categories
                  .filter((item) => item.status !== 'COMPLETE')
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
              </select>
              <Textarea
                placeholder="Justification"
                value={exception.justification}
                onChange={(event) =>
                  setException((prior) => ({
                    ...prior,
                    justification: event.target.value,
                  }))
                }
              />
              <Textarea
                placeholder="Risk introduced or accepted"
                value={exception.risk}
                onChange={(event) =>
                  setException((prior) => ({
                    ...prior,
                    risk: event.target.value,
                  }))
                }
              />
              <Input
                type="date"
                value={exception.effectiveAt}
                onChange={(event) =>
                  setException((prior) => ({
                    ...prior,
                    effectiveAt: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Expiry date (optional)"
                type="date"
                value={exception.expiresAt}
                onChange={(event) =>
                  setException((prior) => ({
                    ...prior,
                    expiresAt: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="Follow-up action"
                value={exception.followUpAction}
                onChange={(event) =>
                  setException((prior) => ({
                    ...prior,
                    followUpAction: event.target.value,
                  }))
                }
              />
              <Button
                disabled={
                  !exception.requirementKey ||
                  !exception.justification.trim() ||
                  !exception.risk.trim()
                }
                variant="outline"
                onClick={() =>
                  mutate(() =>
                    request(
                      `/api/qms/design-control/${recordId}/final-review/exceptions`,
                      'POST',
                      exception
                    )
                  )
                }
              >
                Approve exception
              </Button>
            </div>
            <div className="space-y-3 rounded-md border p-4">
              <h3 className="font-medium">Lock approved review snapshot</h3>
              <p className="text-xs text-muted-foreground">
                Requires a submitted and approved structured Final Design Review
                plus zero unresolved mandatory readiness blockers. Engineering
                Release references this immutable snapshot.
              </p>
              <Input
                placeholder="Final review record ID"
                value={reviewRecordId}
                onChange={(event) => setReviewRecordId(event.target.value)}
              />
              <Input
                placeholder="Approved review version ID"
                value={reviewVersionId}
                onChange={(event) => setReviewVersionId(event.target.value)}
              />
              <Button
                disabled={
                  query.data?.status !== 'COMPLETE' ||
                  !reviewRecordId ||
                  !reviewVersionId
                }
                onClick={() =>
                  mutate(() =>
                    request(
                      `/api/qms/design-control/${recordId}/final-review/snapshot`,
                      'POST',
                      { reviewRecordId, reviewVersionId }
                    )
                  )
                }
              >
                Lock immutable Final Design Review snapshot
              </Button>
            </div>
          </div>
        )}
        {query.isError && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm">
            {(query.error as Error).message}
          </p>
        )}
        {message && (
          <p className="rounded-md border p-3 text-sm" role="status">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

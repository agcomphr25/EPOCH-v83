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

type Assignment = {
  id: string;
  userId: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  projectRole: string;
  responsibilityClass: string;
  status: string;
  rowVersion: number;
  effectiveAt: string;
  revokedAt?: string | null;
  reason: string;
};
type Team = {
  activated: boolean;
  assignments: Assignment[];
  history: Array<{
    id: string;
    eventType: string;
    actorDisplayName: string;
    reason: string;
    occurredAt: string;
  }>;
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

export function ProjectTeamPanel({
  recordId,
  readOnly,
}: {
  recordId: string;
  readOnly: boolean;
}) {
  const query = useQuery<Team>({
    queryKey: ['/api/qms/design-control', recordId, 'project-team'],
    queryFn: () => request(`/api/qms/design-control/${recordId}/project-team`),
  });
  const [reason, setReason] = useState(
    'Enable prospective Design Control project assignment policy'
  );
  const [form, setForm] = useState({
    userId: '',
    projectRole: 'CONTRIBUTOR',
    responsibilityClass: 'ENGINEERING',
    effectiveAt: new Date().toISOString().slice(0, 10),
    reason: '',
  });
  const [message, setMessage] = useState('');
  const mutate = async (action: () => Promise<unknown>) => {
    setMessage('');
    try {
      await action();
      await query.refetch();
      setMessage('Project assignment history updated.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Team</CardTitle>
        <CardDescription>
          Prospective per-user authorization for this R&amp;D Design Project.
          Legacy behavior remains unchanged until explicit activation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!query.data?.activated ? (
          <div className="rounded-md border p-4">
            <p className="text-sm">
              Assignment enforcement is not activated for this project.
            </p>
            {!readOnly && (
              <div className="mt-3 flex gap-2">
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button
                  disabled={!reason.trim()}
                  onClick={() =>
                    mutate(() =>
                      request(
                        `/api/qms/design-control/${recordId}/project-team/activate`,
                        'POST',
                        { reason }
                      )
                    )
                  }
                >
                  Activate and assign me as Design Authority
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y rounded-md border">
              {query.data.assignments.map((assignment) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                  key={assignment.id}
                >
                  <div>
                    <p className="font-medium">
                      {[assignment.firstName, assignment.lastName]
                        .filter(Boolean)
                        .join(' ') || assignment.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {assignment.projectRole.replaceAll('_', ' ')} ·{' '}
                      {assignment.responsibilityClass} · effective{' '}
                      {new Date(assignment.effectiveAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{assignment.status}</Badge>
                    {!readOnly && assignment.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const revocationReason = window.prompt(
                            'Reason for prospective revocation'
                          );
                          if (revocationReason?.trim())
                            mutate(() =>
                              request(
                                `/api/qms/design-control/${recordId}/project-team/assignments/${assignment.id}/revoke`,
                                'POST',
                                {
                                  expectedVersion: assignment.rowVersion,
                                  reason: revocationReason,
                                }
                              )
                            );
                        }}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!readOnly && (
              <div className="space-y-3 rounded-md border p-4">
                <h3 className="font-medium">Add assignment</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">
                    User ID
                    <Input
                      value={form.userId}
                      onChange={(event) =>
                        setForm((prior) => ({
                          ...prior,
                          userId: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Project role
                    <select
                      className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                      value={form.projectRole}
                      onChange={(event) =>
                        setForm((prior) => ({
                          ...prior,
                          projectRole: event.target.value,
                        }))
                      }
                    >
                      {[
                        'DESIGN_AUTHORITY',
                        'PROJECT_MANAGER',
                        'QUALITY',
                        'MANUFACTURING',
                        'REVIEWER',
                        'CONTRIBUTOR',
                        'AUDITOR',
                      ].map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Responsibility class
                    <Input
                      value={form.responsibilityClass}
                      onChange={(event) =>
                        setForm((prior) => ({
                          ...prior,
                          responsibilityClass: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm">
                    Effective date
                    <Input
                      type="date"
                      value={form.effectiveAt}
                      onChange={(event) =>
                        setForm((prior) => ({
                          ...prior,
                          effectiveAt: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="text-sm md:col-span-2">
                    Reason
                    <Input
                      value={form.reason}
                      onChange={(event) =>
                        setForm((prior) => ({
                          ...prior,
                          reason: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <Button
                  disabled={!form.userId || !form.reason.trim()}
                  onClick={() =>
                    mutate(() =>
                      request(
                        `/api/qms/design-control/${recordId}/project-team/assignments`,
                        'POST',
                        {
                          ...form,
                          userId: Number(form.userId),
                          capabilities: [],
                        }
                      )
                    )
                  }
                >
                  Add assignment
                </Button>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Assignment history
              </summary>
              <div className="mt-2 divide-y rounded-md border">
                {query.data.history.map((event) => (
                  <div className="p-3 text-sm" key={event.id}>
                    <strong>{event.eventType.replaceAll('_', ' ')}</strong> by{' '}
                    {event.actorDisplayName} ·{' '}
                    {new Date(event.occurredAt).toLocaleString()}
                    <p className="text-muted-foreground">{event.reason}</p>
                  </div>
                ))}
              </div>
            </details>
          </>
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

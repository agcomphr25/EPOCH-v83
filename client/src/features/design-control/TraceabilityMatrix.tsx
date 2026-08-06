import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type MatrixRow = {
  requirementId: string;
  requirementNumber: string;
  statement: string;
  owner: string;
  lifecycleStatus: string;
  statuses: string[];
  primaryStatus: string;
  links: Array<{
    id: string;
    type: string;
    targetId: string;
    revision?: string | null;
    status?: string | null;
    href: string;
  }>;
  remediation?: { reason: string; owner: string; href: string } | null;
};
type Matrix = {
  source: string;
  calculatedAt: string;
  rows: MatrixRow[];
  totals: {
    requirements: number;
    fullyTraced: number;
    releaseReady: boolean;
    byStatus: Record<string, number>;
  };
};

export function TraceabilityMatrix({ recordId }: { recordId: string }) {
  const query = useQuery<Matrix>({
    queryKey: ['/api/qms/design-control', recordId, 'traceability'],
    queryFn: async () => {
      const response = await fetch(
        `/api/qms/design-control/${recordId}/traceability`,
        { credentials: 'include' }
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message || 'Unable to calculate traceability.');
      return payload;
    },
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const rows = useMemo(
    () =>
      (query.data?.rows ?? []).filter(
        (row) =>
          (status === 'ALL' || row.statuses.includes(status)) &&
          `${row.requirementNumber} ${row.statement} ${row.owner}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [query.data, search, status]
  );
  const statuses = Object.keys(query.data?.totals.byStatus ?? {});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operational Traceability Matrix</CardTitle>
        <CardDescription>
          Calculated on the server from persisted relationships. Text similarity
          is never treated as evidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isError && (
          <p className="rounded-md border border-destructive/40 p-3 text-sm">
            {(query.error as Error).message}
          </p>
        )}
        {query.data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <span className="text-xs text-muted-foreground">
                  Requirements
                </span>
                <p className="text-xl font-semibold">
                  {query.data.totals.requirements}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <span className="text-xs text-muted-foreground">
                  Fully traced
                </span>
                <p className="text-xl font-semibold">
                  {query.data.totals.fullyTraced}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <span className="text-xs text-muted-foreground">
                  Release readiness
                </span>
                <p className="text-xl font-semibold">
                  {query.data.totals.releaseReady ? 'Ready' : 'Blocked'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-md"
                placeholder="Filter by requirement, owner, or text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select
                className="h-10 rounded-md border bg-background px-3"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="ALL">All statuses</option>
                {statuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Design input</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Persisted links</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.requirementId}>
                      <TableCell>
                        <strong>{row.requirementNumber}</strong>
                        <p className="max-w-md text-xs text-muted-foreground">
                          {row.statement}
                        </p>
                      </TableCell>
                      <TableCell>{row.owner || 'Unassigned'}</TableCell>
                      <TableCell>
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {row.statuses.map((item) => (
                            <Badge
                              key={item}
                              variant={
                                item === 'FULLY_TRACED' ? 'default' : 'outline'
                              }
                            >
                              {item.replaceAll('_', ' ')}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-sm flex-wrap gap-1">
                          {row.links.map((link) => (
                            <a
                              className="text-xs underline"
                              href={link.href}
                              key={link.id}
                            >
                              {link.type.replaceAll('_', ' ')}
                              {link.revision ? ` ${link.revision}` : ''}
                            </a>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.remediation ? (
                          <a
                            className="text-sm underline"
                            href={row.remediation.href}
                          >
                            Fix {row.remediation.reason}
                          </a>
                        ) : (
                          'No action'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length === 0 && (
              <p className="rounded-md border p-4 text-sm text-muted-foreground">
                No requirements match the current filters.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Source: {query.data.source.replaceAll('_', ' ')} · recalculated{' '}
              {new Date(query.data.calculatedAt).toLocaleString()}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

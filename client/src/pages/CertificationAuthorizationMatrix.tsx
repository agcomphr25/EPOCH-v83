import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, History, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Props = { defaultProgram?: 'P2'; defaultStatus?: 'ACTIVE' };
type Row = {
  id: string;
  employee_number: string;
  employee_name: string;
  program: string;
  part_number?: string;
  product_family?: string;
  department?: string;
  operation_scope?: string;
  authorization_type: string;
  status: string;
  effective_date?: string;
  expiration_date?: string;
  approver_username?: string;
  revision: number;
};
const labels: Record<string, string> = {
  WORK: 'Work Authorization',
  QC_INSPECTION: 'QC Inspection',
  ROUTING_RELEASE: 'Routing Release',
  FINAL_QC: 'Final QC',
  FINAL_PRODUCT_RELEASE: 'Final Product Release',
  COC_APPROVAL: 'CoC Approval',
};

export default function CertificationAuthorizationMatrix({
  defaultProgram,
  defaultStatus,
}: Props) {
  const [employee, setEmployee] = useState('');
  const [program, setProgram] = useState(defaultProgram || 'ALL');
  const [status, setStatus] = useState(defaultStatus || 'ALL');
  const [part, setPart] = useState('');
  const [type, setType] = useState('ALL');
  const params = new URLSearchParams();
  if (program !== 'ALL') params.set('program', program);
  if (status !== 'ALL') params.set('status', status);
  if (part) params.set('partNumber', part);
  if (type !== 'ALL') params.set('authorizationType', type);
  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['/api/training/certification-authorizations', params.toString()],
    queryFn: async () => {
      const r = await fetch(
        `/api/training/certification-authorizations?${params}`,
        { credentials: 'include' }
      );
      if (!r.ok) throw new Error('Unable to load authorization register');
      return r.json();
    },
  });
  const visible = rows.filter(
    (r) =>
      !employee ||
      `${r.employee_number} ${r.employee_name}`
        .toLowerCase()
        .includes(employee.toLowerCase())
  );
  const soon = (date?: string) =>
    date &&
    new Date(date) > new Date() &&
    new Date(date).getTime() <= Date.now() + 60 * 86400000;
  return (
    <div className="space-y-4" data-testid="certification-authorization-matrix">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Award className="h-6 w-6" />
            Certification &amp; Authorization Matrix
          </h2>
          <p className="text-muted-foreground">
            Training-owned authoritative register. Training completion does not
            grant QC, product-release, or CoC authority.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print register
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Current authorization register</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 print:hidden">
            <Input
              value={employee}
              onChange={(e) => setEmployee(e.target.value)}
              placeholder="Employee ID or name"
            />
            <Input
              value={part}
              onChange={(e) => setPart(e.target.value)}
              placeholder="Exact part number"
            />
            <Select value={program} onValueChange={setProgram}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['ALL', 'P1', 'P2', 'DESIGN', 'GENERAL', 'OTHER'].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Authority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All authorities</SelectItem>
                {Object.entries(labels).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  'ALL',
                  'DRAFT',
                  'ACTIVE',
                  'SUSPENDED',
                  'EXPIRED',
                  'REVOKED',
                ].map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isLoading ? (
            <p>Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Program / scope</TableHead>
                  <TableHead>Authority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Effective / review</TableHead>
                  <TableHead>Approver</TableHead>
                  <TableHead>History</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.employee_number}
                      <br />
                      <span className="text-muted-foreground">
                        {r.employee_name}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.program} ·{' '}
                      {r.part_number || r.product_family || 'General'}
                      <br />
                      <span className="text-muted-foreground">
                        {[r.department, r.operation_scope]
                          .filter(Boolean)
                          .join(' / ')}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      {labels[r.authorization_type]}
                    </TableCell>
                    <TableCell
                      className={
                        r.status === 'EXPIRED' || r.status === 'REVOKED'
                          ? 'text-red-700'
                          : soon(r.expiration_date)
                            ? 'text-amber-700'
                            : ''
                      }
                    >
                      {r.status}
                      {soon(r.expiration_date) ? ' · expiring soon' : ''}
                    </TableCell>
                    <TableCell>
                      {r.effective_date
                        ? new Date(r.effective_date).toLocaleDateString()
                        : '—'}
                      <br />
                      {r.expiration_date
                        ? new Date(r.expiration_date).toLocaleDateString()
                        : 'No expiration'}
                    </TableCell>
                    <TableCell>{r.approver_username || 'Pending'}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={`/api/training/certification-authorizations/${r.id}/history`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <History className="h-4 w-4" />
                          <span className="sr-only">
                            View history revision {r.revision}
                          </span>
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  Hash,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Severity = 'info' | 'warning' | 'critical';

interface PolicyTrainingAcknowledgmentReportData {
  generatedAt: string;
  filters: {
    topic: string | null;
    driftOnly: boolean;
  };
  summary: {
    totalTopics: number;
    publishedPolicies: number;
    policiesWithHashes: number;
    acknowledgmentEligibleUsers: number;
    acknowledgedUsers: number;
    overdueAcknowledgments: number;
    trainingModules: number;
    completedTrainingRecords: number;
    expiredTrainingRecords: number;
    policyDriftCount: number;
    topicDriftCount: number;
  };
  topics: Array<{
    topicKey: string;
    topicLabel: string;
    policyKey: string | null;
    policyTitle: string | null;
    policySource: string | null;
    currentVersionNumber: number | null;
    currentVersionId: string | null;
    publishedAt: string | null;
    contentHash: string | null;
    requiresAcknowledgment: boolean;
    eligibleUserCount: number;
    acknowledgedUserCount: number;
    overdueUserCount: number;
    overdueUsers: Array<{ userId: number; username: string; role: string }>;
    driftState: string;
    liveHash: string | null;
    publishedHash: string | null;
    trainingModuleCount: number;
    trainingCompletionCount: number;
    trainingPassedCount: number;
    expiredTrainingCount: number;
    latestTrainingCompletedAt: string | null;
    trainingModules: Array<{
      id: number;
      title: string;
      category: string | null;
      version: number | null;
      isActive: boolean;
      completionCount: number;
      passedCount: number;
      expiredCount: number;
      latestCompletedAt: string | null;
    }>;
    driftStatus: 'current' | 'policy_drift' | 'ack_overdue' | 'training_gap' | 'training_expired' | 'no_published_policy';
    flags: string[];
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    topicKey: string | null;
  }>;
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function shortHash(value: string | null) {
  if (!value) return '-';
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value;
}

function pct(numerator: number, denominator: number) {
  if (!denominator) return '0%';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function SeverityBadge({ severity }: { severity: Severity }) {
  if (severity === 'critical') return <Badge variant="destructive">Critical</Badge>;
  if (severity === 'warning') return <Badge variant="secondary">Warning</Badge>;
  return <Badge variant="outline">Info</Badge>;
}

function DriftBadge({ status }: { status: PolicyTrainingAcknowledgmentReportData['topics'][number]['driftStatus'] }) {
  const bad = ['policy_drift', 'no_published_policy'].includes(status);
  const warn = ['ack_overdue', 'training_gap', 'training_expired'].includes(status);
  const label = status.replaceAll('_', ' ');
  return <Badge variant={bad ? 'destructive' : warn ? 'secondary' : 'default'}>{label}</Badge>;
}

function downloadCsv(report: PolicyTrainingAcknowledgmentReportData) {
  const header = [
    'Topic',
    'Policy Key',
    'Policy Title',
    'Policy Version',
    'Published At',
    'Content Hash',
    'Drift State',
    'Eligible Users',
    'Acknowledged Users',
    'Overdue Users',
    'Training Modules',
    'Training Completions',
    'Passed Training',
    'Expired Training',
    'Latest Training Completion',
    'Drift Status',
    'Flags',
  ];
  const exceptionHeader = ['Severity', 'Type', 'Message', 'Topic'];
  const lines = [
    ['Policy And Training Acknowledgment Report'],
    ['Generated At', report.generatedAt],
    [],
    header,
    ...report.topics.map((row) => [
      row.topicLabel,
      row.policyKey,
      row.policyTitle,
      row.currentVersionNumber,
      row.publishedAt,
      row.contentHash,
      row.driftState,
      row.eligibleUserCount,
      row.acknowledgedUserCount,
      row.overdueUserCount,
      row.trainingModuleCount,
      row.trainingCompletionCount,
      row.trainingPassedCount,
      row.expiredTrainingCount,
      row.latestTrainingCompletedAt,
      row.driftStatus,
      row.flags.join('; '),
    ]),
    [],
    ['Exceptions'],
    exceptionHeader,
    ...report.exceptions.map((row) => [row.severity, row.exceptionType, row.message, row.topicKey]),
  ];
  const csv = lines.map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `policy-training-acknowledgment-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PolicyTrainingAcknowledgmentReport() {
  const [topic, setTopic] = useState('all');
  const [driftOnly, setDriftOnly] = useState('false');

  const reportUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (topic !== 'all') params.set('topic', topic);
    if (driftOnly === 'true') params.set('driftOnly', 'true');
    return `/api/edri/policy-training-acknowledgment${params.toString() ? `?${params.toString()}` : ''}`;
  }, [topic, driftOnly]);

  const { data, isLoading, isFetching, refetch, error } = useQuery<PolicyTrainingAcknowledgmentReportData>({
    queryKey: ['policy-training-acknowledgment-report', reportUrl],
    queryFn: () => apiRequest(reportUrl),
  });

  const criticalExceptions = data?.exceptions.filter((row) => row.severity === 'critical').length ?? 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <EdriSubNav />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-6 w-6 text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight">Policy And Training Acknowledgment Report</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Published policy versions, content hashes, acknowledgments, training completion, and drift status for core DCAA governance areas.
          </p>
          {data && <p className="text-xs text-muted-foreground">Generated {formatDateTime(data.generatedAt)}.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={() => data && downloadCsv(data)} disabled={!data}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Topic</Label>
            <Select value={topic} onValueChange={setTopic}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All topics</SelectItem>
                <SelectItem value="timekeeping">Timekeeping</SelectItem>
                <SelectItem value="labor-charging">Labor charging</SelectItem>
                <SelectItem value="corrections">Corrections</SelectItem>
                <SelectItem value="approvals">Approvals</SelectItem>
                <SelectItem value="period-close">Period close</SelectItem>
                <SelectItem value="indirect-costs">Indirect costs</SelectItem>
                <SelectItem value="unallowable-costs">Unallowable costs</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Population</Label>
            <Select value={driftOnly} onValueChange={setDriftOnly}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="false">All topics</SelectItem>
                <SelectItem value="true">Drift only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Unable to load policy and training acknowledgment report.'}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Published Policies</p>
                <p className="text-2xl font-bold">{data?.summary.publishedPolicies ?? 0}/{data?.summary.totalTopics ?? 0}</p>
              </div>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.policiesWithHashes ?? 0} with content hashes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Acknowledgment Coverage</p>
                <p className="text-2xl font-bold">{pct(data?.summary.acknowledgedUsers ?? 0, data?.summary.acknowledgmentEligibleUsers ?? 0)}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.overdueAcknowledgments ?? 0} overdue acknowledgments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Training Evidence</p>
                <p className="text-2xl font-bold">{data?.summary.trainingModules ?? 0}</p>
              </div>
              <GraduationCap className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.completedTrainingRecords ?? 0} completion records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical Drift</p>
                <p className="text-2xl font-bold">{criticalExceptions}</p>
              </div>
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data?.summary.topicDriftCount ?? 0} topics flagged</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Governance Topic Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Policy Version</TableHead>
                  <TableHead>Content Hash</TableHead>
                  <TableHead>Acknowledgments</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>Drift</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Loading policy and training report...
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && data?.topics.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No topics matched the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {data?.topics.map((row) => (
                  <TableRow key={row.topicKey}>
                    <TableCell className="min-w-[190px] align-top">
                      <div className="font-medium">{row.topicLabel}</div>
                      <div className="text-xs text-muted-foreground">{row.policyKey ?? '-'}</div>
                    </TableCell>
                    <TableCell className="min-w-[220px] align-top">
                      <div className="font-medium">{row.policyTitle ?? 'No published policy'}</div>
                      <div className="text-xs text-muted-foreground">
                        Version {row.currentVersionNumber ?? '-'} · {formatDateTime(row.publishedAt)}
                      </div>
                      <div className="text-xs text-muted-foreground">{row.policySource ?? '-'}</div>
                    </TableCell>
                    <TableCell className="min-w-[170px] align-top">
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <Hash className="h-3.5 w-3.5" />
                        {shortHash(row.contentHash)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.driftState}</div>
                    </TableCell>
                    <TableCell className="min-w-[180px] align-top">
                      <div className="text-sm">{row.acknowledgedUserCount}/{row.eligibleUserCount} acknowledged</div>
                      <div className={row.overdueUserCount > 0 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        {row.overdueUserCount} overdue
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[190px] align-top">
                      <div className="text-sm">{row.trainingModuleCount} modules</div>
                      <div className="text-xs text-muted-foreground">{row.trainingCompletionCount} completions · {row.trainingPassedCount} passed</div>
                      <div className={row.expiredTrainingCount > 0 ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                        {row.expiredTrainingCount} expired · latest {formatDateTime(row.latestTrainingCompletedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <DriftBadge status={row.driftStatus} />
                    </TableCell>
                    <TableCell className="min-w-[250px] align-top">
                      {row.flags.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.flags.map((flag) => <Badge key={flag} variant="outline">{flag}</Badge>)}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Current</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Exceptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(data?.exceptions ?? []).slice(0, 14).map((row, index) => (
              <div key={`${row.topicKey}-${row.exceptionType}-${index}`} className="rounded-md border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={row.severity} />
                  <span className="font-medium">{row.exceptionType.replaceAll('_', ' ')}</span>
                </div>
                <p className="text-muted-foreground">{row.message}</p>
              </div>
            ))}
            {!isLoading && (data?.exceptions.length ?? 0) === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No policy or training acknowledgment exceptions were found.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

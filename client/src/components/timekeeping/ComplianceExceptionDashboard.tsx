import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';

type ComplianceExceptionType = 'uncertified' | 'correction_pending' | 'admin_override' | 'late_submission';
type ComplianceSeverity = 'Critical' | 'High' | 'Medium' | 'Low';

interface ComplianceException {
  id: string;
  exceptionType: ComplianceExceptionType;
  severity: ComplianceSeverity;
  employeeId: number;
  employeeName: string;
  timesheetId?: number;
  correctionId?: number;
  detailLabel: string;
  periodLabel: string;
}

const EXCEPTION_TYPE_LABELS: Record<ComplianceExceptionType, string> = {
  uncertified: 'Uncertified Timesheet',
  correction_pending: 'Correction Pending',
  admin_override: 'Admin Override',
  late_submission: 'Late Submission',
};

const EXCEPTION_TYPE_ACTION: Record<ComplianceExceptionType, string> = {
  uncertified: 'Certify',
  correction_pending: 'Review Correction',
  admin_override: 'View Override',
  late_submission: 'Contact Employee',
};

const SEVERITY_COLORS: Record<ComplianceSeverity, string> = {
  Critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800',
  High: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800',
  Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800',
  Low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
};

function SeverityBadge({ severity }: { severity: ComplianceSeverity }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_COLORS[severity]}`}>
      {severity}
    </span>
  );
}

interface Props {
  onNavigateToTimesheets?: (timesheetId?: number) => void;
  onNavigateToCorrections?: (correctionId?: number) => void;
}

export function ComplianceExceptionDashboard({ onNavigateToTimesheets, onNavigateToCorrections }: Props) {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const queryParams = new URLSearchParams();
  if (typeFilter !== 'all') queryParams.set('type', typeFilter);
  if (severityFilter !== 'all') queryParams.set('severity', severityFilter);
  const qs = queryParams.toString() ? `?${queryParams.toString()}` : '';

  const { data: exceptions, isLoading, isError, refetch } = useQuery<ComplianceException[]>({
    queryKey: ['/api/timekeeping/compliance-exceptions', typeFilter, severityFilter],
    queryFn: async () => {
      const res = await fetch(`/api/timekeeping/compliance-exceptions${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load compliance exceptions');
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const severityCounts = (exceptions ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.severity] = (acc[e.severity] ?? 0) + 1;
    return acc;
  }, {});

  function handleAction(exc: ComplianceException) {
    if (exc.exceptionType === 'correction_pending' && exc.correctionId != null) {
      onNavigateToCorrections?.(exc.correctionId);
    } else if (exc.timesheetId != null) {
      onNavigateToTimesheets?.(exc.timesheetId);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      {!isLoading && !isError && exceptions && (
        <div className="flex flex-wrap gap-3">
          {(['Critical', 'High', 'Medium', 'Low'] as ComplianceSeverity[]).map(sev => {
            const count = severityCounts[sev] ?? 0;
            if (count === 0) return null;
            return (
              <button
                key={sev}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer ${SEVERITY_COLORS[sev]} ${severityFilter === sev ? 'ring-2 ring-offset-1 ring-current' : ''}`}
                onClick={() => setSeverityFilter(severityFilter === sev ? 'all' : sev)}
              >
                {count} {sev}
              </button>
            );
          })}
          {exceptions.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-1.5 rounded-full">
              <ShieldCheck className="h-4 w-4" />
              No open exceptions
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                Compliance Exceptions
              </CardTitle>
              <CardDescription className="mt-1">
                Open timekeeping compliance issues requiring action — severity linked to ERDI scoring weights.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-8"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="All issue types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All issue types</SelectItem>
                <SelectItem value="uncertified">Uncertified Timesheet</SelectItem>
                <SelectItem value="correction_pending">Correction Pending</SelectItem>
                <SelectItem value="admin_override">Admin Override</SelectItem>
                <SelectItem value="late_submission">Late Submission</SelectItem>
              </SelectContent>
            </Select>

            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="Critical">Critical</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>

            {(typeFilter !== 'all' || severityFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { setTypeFilter('all'); setSeverityFilter('all'); }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-8 w-28" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">
              Failed to load compliance exceptions. Please refresh.
            </div>
          ) : !exceptions || exceptions.length === 0 ? (
            <div className="p-8 text-center">
              <ShieldCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">No open exceptions</p>
              <p className="text-xs text-muted-foreground mt-1">
                {typeFilter !== 'all' || severityFilter !== 'all'
                  ? 'No exceptions match the current filters.'
                  : 'All timekeeping compliance checks are passing.'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-48">Employee</TableHead>
                    <TableHead className="w-44">Issue Type</TableHead>
                    <TableHead className="w-36">Period</TableHead>
                    <TableHead className="w-24">Severity</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="w-36 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map(exc => (
                    <TableRow key={exc.id} className="text-sm">
                      <TableCell className="font-medium">{exc.employeeName}</TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {EXCEPTION_TYPE_LABELS[exc.exceptionType]}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{exc.periodLabel}</TableCell>
                      <TableCell>
                        <SeverityBadge severity={exc.severity} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {exc.detailLabel}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleAction(exc)}
                          disabled={!exc.timesheetId && !exc.correctionId}
                        >
                          {EXCEPTION_TYPE_ACTION[exc.exceptionType]}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

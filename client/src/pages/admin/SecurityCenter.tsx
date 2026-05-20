import { useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Eye, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface SecurityFinding {
  id: number;
  ruleId: string;
  severity: string;
  entityType: string;
  entityId: string;
  description: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
  status: string;
}

interface FindingsResult {
  findings: SecurityFinding[];
  total: number;
}

interface ForensicRule {
  ruleId: string;
  domain: string;
  severity: string;
  description: string;
  expectedCondition: string;
  remediationGuidance: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

function severityClass(severity: string) {
  return SEVERITY_STYLES[severity.toLowerCase()] ?? SEVERITY_STYLES.low;
}

export default function SecurityCenter() {
  const { toast } = useToast();

  const { data, isLoading } = useQuery<FindingsResult>({
    queryKey: ['/api/forensic-audit/findings', 'SECURITY', 'active'],
    queryFn: async () => {
      const params = new URLSearchParams({
        domain: 'SECURITY',
        status: 'open,acknowledged',
        pageSize: '100',
      });
      const res = await fetch(`/api/forensic-audit/findings?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load security findings');
      return res.json();
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
  });

  const { data: rules = [] } = useQuery<ForensicRule[]>({
    queryKey: ['/api/forensic-audit/rules'],
    queryFn: async () => {
      const res = await fetch('/api/forensic-audit/rules', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load forensic rules');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const runScanMutation = useMutation({
    mutationFn: () => apiRequest('/api/forensic-audit/run', { method: 'POST', body: {} }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/findings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/summary'] });
      queryClient.invalidateQueries({ queryKey: ['/api/forensic-audit/scan-history'] });
      const summary = result?.summary;
      toast({
        title: summary?.rulesFailed ? 'Security scan completed with warnings' : 'Security scan complete',
        description: summary
          ? `${summary.rulesRun} rules run, ${summary.newFindings} new findings, ${summary.violationsClosed} closed.`
          : 'Scan finished.',
        variant: summary?.rulesFailed ? 'destructive' : 'default',
      });
    },
    onError: () => {
      toast({ title: 'Security scan failed', variant: 'destructive' });
    },
  });

  const securityRules = useMemo(
    () => rules.filter((rule) => rule.domain === 'SECURITY'),
    [rules],
  );
  const findings = data?.findings ?? [];
  const counts = findings.reduce<Record<'total' | 'critical' | 'high' | 'medium' | 'low', number>>(
    (acc, finding) => {
      acc.total += 1;
      const severity = finding.severity.toLowerCase();
      if (severity === 'critical' || severity === 'high' || severity === 'medium' || severity === 'low') {
        acc[severity] += 1;
      }
      return acc;
    },
    { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <EdriSubNav />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            <h1 className="text-2xl font-bold">Security Center</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => runScanMutation.mutate()}
              disabled={runScanMutation.isPending}
            >
              {runScanMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Run Security Scan
            </Button>
            <Button asChild variant="ghost">
              <a href="/admin/dcaa-findings">All Findings</a>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">Active Security Findings</p>
              <p className="text-3xl font-bold">{counts.total}</p>
            </CardContent>
          </Card>
          {(['critical', 'high', 'medium', 'low'] as const).map((severity) => (
            <Card key={severity}>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground capitalize">{severity}</p>
                <p className="text-3xl font-bold">{counts[severity]}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Active Security Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded" />
                ))}
              </div>
            ) : findings.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <p className="font-medium">No active security findings</p>
                <p className="text-sm text-muted-foreground">Run a scan to check runtime, account, session, and PIN controls.</p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Rule</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Severity</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Finding</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Detected</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {findings.map((finding) => (
                      <tr key={finding.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs font-semibold">{finding.ruleId}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={severityClass(finding.severity)}>
                            {finding.severity}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium leading-snug">{finding.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {finding.entityType} / {finding.entityId}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                          {format(new Date(finding.detectedAt), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge variant="secondary">{finding.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              Security Rules in This Scan Pack
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {securityRules.map((rule) => (
                <div key={rule.ruleId} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{rule.ruleId}</span>
                    <Badge variant="outline" className={severityClass(rule.severity)}>{rule.severity}</Badge>
                  </div>
                  <p className="text-sm font-medium">{rule.description}</p>
                  <p className="text-xs text-muted-foreground">{rule.expectedCondition}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

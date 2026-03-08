import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Link } from 'wouter';
import { CheckCircle, XCircle, AlertTriangle, ShieldCheck, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IntegrityStatus {
  healthy: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  affectedDepartments: string[];
  lastCheckTime: string | null;
}

export default function SystemHealthWidget() {
  const { data, isLoading } = useQuery<IntegrityStatus>({
    queryKey: ['/api/admin/queue-integrity/status'],
    queryFn: () => apiRequest('/api/admin/queue-integrity/status'),
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <ShieldCheck className="h-4 w-4 text-indigo-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Queue Integrity Status</span>
      </div>

      <div className="px-4 py-3">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking…
          </div>
        ) : data.healthy ? (
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">No critical mismatches</p>
              {data.warningCount > 0 && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
                  {data.warningCount} warning{data.warningCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                {data.criticalCount} critical issue{data.criticalCount !== 1 ? 's' : ''}
              </p>
            </div>
            {data.warningCount > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400 flex-shrink-0" />
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  {data.warningCount} warning{data.warningCount !== 1 ? 's' : ''}
                </p>
              </div>
            )}
            {data.affectedDepartments.length > 0 && (
              <p className="text-xs text-gray-400 pl-6">
                {data.affectedDepartments.slice(0, 3).join(', ')}
                {data.affectedDepartments.length > 3 && ` +${data.affectedDepartments.length - 3} more`}
              </p>
            )}
          </div>
        )}

        {data?.lastCheckTime && (
          <p className="text-xs text-gray-400 mt-2">
            Last checked {new Date(data.lastCheckTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      <div className="px-4 pb-3">
        <Link href="/admin/queue-integrity">
          <Button variant="outline" size="sm" className="w-full flex items-center gap-1.5 text-xs">
            <ExternalLink className="h-3 w-3" />
            Open Queue Integrity Monitor
          </Button>
        </Link>
      </div>
    </div>
  );
}

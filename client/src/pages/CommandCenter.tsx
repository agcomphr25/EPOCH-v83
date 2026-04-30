import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, AlertCircle, CheckCircle2, Activity, Clock, Loader2, RefreshCw, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface CommandCenterCard {
  id: string;
  workOrderNumber: string;
  partNumber: string | null;
  projectId: string | null;
  status: string;
  percentUsed: number | null;
  dueDate: string | null;
  lastUpdatedAt: string | null;
  reason?: string;
}

const RECENT_HOURS = 2;

function isRecentlyUpdated(lastUpdatedAt: string | null): boolean {
  if (!lastUpdatedAt) return false;
  const cutoff = Date.now() - RECENT_HOURS * 60 * 60 * 1000;
  return new Date(lastUpdatedAt).getTime() >= cutoff;
}

function formatRelativeTime(lastUpdatedAt: string | null): string {
  if (!lastUpdatedAt) return '';
  const diffMs = Date.now() - new Date(lastUpdatedAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

interface CommandCenterData {
  blocked: CommandCenterCard[];
  atRisk: CommandCenterCard[];
  ready: CommandCenterCard[];
  inProgress: CommandCenterCard[];
  late: CommandCenterCard[];
}

interface SectionConfig {
  key: keyof CommandCenterData;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeVariant: 'destructive' | 'secondary' | 'default' | 'outline';
  icon: React.ElementType;
  emptyMessage: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'blocked',
    label: 'BLOCKED',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    badgeVariant: 'destructive',
    icon: AlertTriangle,
    emptyMessage: 'No blocked WADs — all clear.',
  },
  {
    key: 'atRisk',
    label: 'AT RISK',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    badgeVariant: 'secondary',
    icon: AlertCircle,
    emptyMessage: 'Nothing at risk right now.',
  },
  {
    key: 'ready',
    label: 'READY',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    badgeVariant: 'outline',
    icon: CheckCircle2,
    emptyMessage: 'No WADs ready to start.',
  },
  {
    key: 'inProgress',
    label: 'IN PROGRESS',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    badgeVariant: 'default',
    icon: Activity,
    emptyMessage: 'No WADs currently in progress.',
  },
  {
    key: 'late',
    label: 'LATE / OVERDUE',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    badgeVariant: 'secondary',
    icon: Clock,
    emptyMessage: 'Nothing overdue — great work!',
  },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function WADCard({ card, showReason }: { card: CommandCenterCard; showReason?: boolean }) {
  const recent = isRecentlyUpdated(card.lastUpdatedAt);
  return (
    <Link href={`/work-orders/${card.id}`}>
      <div className={`bg-white rounded-lg p-4 shadow-sm space-y-2 cursor-pointer transition-shadow ${recent ? 'border-2 border-amber-400 ring-1 ring-amber-300 hover:border-amber-500 hover:shadow-md' : 'border border-gray-200 hover:border-blue-400 hover:shadow-md'}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-gray-900">{card.workOrderNumber}</span>
          <div className="flex items-center gap-1.5">
            {recent && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <Zap className="h-3 w-3" />
                Updated {formatRelativeTime(card.lastUpdatedAt)}
              </span>
            )}
            <Badge variant="outline" className="text-xs">{card.status}</Badge>
          </div>
        </div>
        <div className="text-sm text-gray-600 grid grid-cols-2 gap-x-4 gap-y-1">
          <div>
            <span className="font-medium text-gray-500">Part:</span>{' '}
            {card.partNumber ?? '—'}
          </div>
          <div>
            <span className="font-medium text-gray-500">Project:</span>{' '}
            {card.projectId ? card.projectId.slice(0, 8) + '…' : '—'}
          </div>
          <div>
            <span className="font-medium text-gray-500">Labor:</span>{' '}
            {card.percentUsed != null ? `${card.percentUsed}%` : '—'}
          </div>
          <div>
            <span className="font-medium text-gray-500">Due:</span>{' '}
            {formatDate(card.dueDate)}
          </div>
        </div>
        {showReason && card.reason && (
          <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 mt-1">
            {card.reason}
          </div>
        )}
      </div>
    </Link>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CommandCenter() {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery<CommandCenterData>({
    queryKey: ['/api/command-center'],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const lastUpdated = useMemo(
    () => (dataUpdatedAt > 0 ? new Date(dataUpdatedAt) : null),
    [dataUpdatedAt],
  );

  function formatTime(date: Date): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Command Center</h1>
          <p className="text-sm text-gray-500 mt-1">Shop floor decision surface — WADs grouped by priority</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Last updated at {formatTime(lastUpdated)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 text-sm">
          Failed to load command center data: {(error as Error)?.message ?? 'Unknown error'}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const cards = data?.[section.key] ?? [];

          return (
            <div
              key={section.key}
              className={`rounded-xl border ${section.borderColor} ${section.bgColor} p-4 space-y-3`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 font-bold text-sm ${section.color}`}>
                  <Icon className="h-4 w-4" />
                  {section.label}
                </div>
                {!isLoading && (
                  <Badge variant={section.badgeVariant} className="text-xs">
                    {cards.length}
                  </Badge>
                )}
              </div>

              {isLoading ? (
                <SectionSkeleton />
              ) : cards.length === 0 ? (
                <p className="text-sm text-gray-500 italic py-2">{section.emptyMessage}</p>
              ) : (
                <div className="space-y-2">
                  {cards.map((card) => (
                    <WADCard
                      key={card.id}
                      card={card}
                      showReason={section.key === 'blocked' || section.key === 'atRisk'}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

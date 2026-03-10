import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Package,
  DollarSign,
  FileText,
  ClipboardList,
} from 'lucide-react';

interface RibbonSignal {
  id: string;
  label: string;
  value: number;
  severity: 'info' | 'warning' | 'critical';
  domain: 'company' | 'p1' | 'p2';
  route: string;
  icon?: string;
}

const ICON_MAP: Record<string, typeof AlertTriangle> = {
  AlertTriangle,
  Package,
  DollarSign,
  FileText,
  ClipboardList,
};

const SEVERITY_STYLES = {
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
};

const SEVERITY_BADGE = {
  critical: 'bg-red-500 text-white',
  warning: 'bg-yellow-500 text-white',
  info: 'bg-blue-500 text-white',
};

export default function ControlTowerRibbon() {
  const { businessContext } = useDashboardFilters();
  const [, setLocation] = useLocation();

  const { data } = useQuery<{ signals: RibbonSignal[] }>({
    queryKey: ['/api/control-tower/signals'],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const signals = (data?.signals ?? []).filter(
    (s) => s.domain === 'company' || s.domain === businessContext || businessContext === 'company',
  );

  if (signals.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-800 bg-muted/40 px-3 py-2">
      <div className="flex gap-3 overflow-x-auto py-1">
        {signals.map((signal) => {
          const IconComponent = ICON_MAP[signal.icon ?? ''] ?? AlertTriangle;
          return (
            <button
              key={signal.id}
              onClick={() => setLocation(signal.route)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all hover:shadow-sm hover:scale-[1.02] cursor-pointer',
                SEVERITY_STYLES[signal.severity],
              )}
            >
              <IconComponent className="h-3.5 w-3.5 shrink-0" />
              <span>{signal.label}</span>
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[20px] h-5 rounded-full px-1.5 text-xs font-bold',
                  SEVERITY_BADGE[signal.severity],
                )}
              >
                {signal.value}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

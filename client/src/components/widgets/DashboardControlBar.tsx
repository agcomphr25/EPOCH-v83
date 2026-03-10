import { useLocation } from 'wouter';
import { useDashboardFilters } from '@/contexts/DashboardFilterContext';
import { cn } from '@/lib/utils';
import {
  Plus,
  Truck,
  Package,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const TIME_OPTIONS = [
  { value: 'week' as const, label: 'Week' },
  { value: 'mtd' as const, label: 'MTD' },
  { value: 'ytd' as const, label: 'YTD' },
];

const CONTEXT_OPTIONS = [
  { value: 'company' as const, label: 'Company' },
  { value: 'p1' as const, label: 'P1' },
  { value: 'p2' as const, label: 'P2' },
];

const QUICK_ACTIONS = [
  { label: 'Order', icon: Plus, route: '/order-entry' },
  { label: 'Vendors', icon: Truck, route: '/vendor-pos' },
  { label: 'Inventory', icon: Package, route: '/inventory' },
  { label: 'Maintenance', icon: Wrench, route: '/maintenance' },
];

export default function DashboardControlBar() {
  const { timeRange, businessContext, setTimeRange, setBusinessContext } = useDashboardFilters();
  const [, setLocation] = useLocation();

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 shadow-sm">
      <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTimeRange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
              timeRange === opt.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden sm:block" />

      <div className="flex items-center rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
        {CONTEXT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setBusinessContext(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all',
              businessContext === opt.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1.5">
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.label}
            variant="ghost"
            size="sm"
            onClick={() => setLocation(action.route)}
            className="text-xs gap-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <action.icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{action.label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

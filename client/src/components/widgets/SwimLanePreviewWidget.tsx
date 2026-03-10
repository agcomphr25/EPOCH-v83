import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, ChevronRight, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_DEPARTMENTS } from '@/constants/pipelineDepartments';

interface SwimLanePreviewWidgetProps {
  className?: string;
}

const stageColors: Record<string, string> = {
  'P1 Production Queue': 'bg-blue-500',
  'Layup/Plugging': 'bg-indigo-500',
  'Barcode': 'bg-violet-500',
  'CNC': 'bg-purple-500',
  'Gunsmith': 'bg-fuchsia-500',
  'Finish': 'bg-pink-500',
  'Finish QC': 'bg-rose-500',
  'Paint': 'bg-orange-500',
  'Shipping QC': 'bg-amber-500',
  'Shipping': 'bg-green-500',
};

export default function SwimLanePreviewWidget({ className }: SwimLanePreviewWidgetProps) {
  const [open, setOpen] = useState(false);

  const { data: countsData, isLoading, isError } = useQuery({
    queryKey: ['/api/orders/pipeline-counts'],
  });

  const stageCounts: { name: string; count: number }[] = (() => {
    const raw = countsData as any;
    if (!raw) return PIPELINE_DEPARTMENTS.map((d) => ({ name: d, count: 0 }));

    if (Array.isArray(raw)) {
      return raw.map((item: any) => ({
        name: item.department ?? item.name ?? 'Unknown',
        count: item.count ?? 0,
      }));
    }

    return PIPELINE_DEPARTMENTS.map((dept) => {
      const key = dept.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return {
        name: dept,
        count: raw[key] ?? raw[dept] ?? 0,
      };
    });
  })();

  const totalOrders = stageCounts.reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      <div
        className={cn(
          'rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
          'px-5 py-4 shadow-sm flex flex-col gap-3 cursor-pointer',
          'hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all',
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
            Production Pipeline
          </span>
          <div className="flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
            <span className="text-xs">{totalOrders} orders</span>
            <Maximize2 className="h-3.5 w-3.5" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-16">
            <Loader2 className="h-5 w-5 animate-spin text-gray-300 dark:text-gray-600" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center h-16 gap-2 text-red-500 text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>Pipeline unavailable</span>
          </div>
        ) : (
          <div className="flex items-center gap-0.5 h-8">
            {stageCounts.map((stage) => {
              const widthPct = totalOrders > 0 ? Math.max(4, (stage.count / totalOrders) * 100) : 10;
              const colorClass = stageColors[stage.name] ?? 'bg-gray-400';
              return (
                <div
                  key={stage.name}
                  className={cn('h-full rounded-sm relative group', colorClass)}
                  style={{ width: `${widthPct}%`, minWidth: '12px', opacity: stage.count > 0 ? 1 : 0.3 }}
                  title={`${stage.name}: ${stage.count}`}
                >
                  {stage.count > 0 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white">
                      {stage.count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {stageCounts.filter((s) => s.count > 0).slice(0, 5).map((stage) => (
            <Badge key={stage.name} variant="secondary" className="text-[10px] px-1.5 py-0">
              {stage.name.replace('/', '/')}: {stage.count}
            </Badge>
          ))}
          {stageCounts.filter((s) => s.count > 0).length > 5 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              +{stageCounts.filter((s) => s.count > 0).length - 5} more
            </Badge>
          )}
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[480px] sm:max-w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Production Pipeline</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-3">
            {stageCounts.map((stage, idx) => {
              const colorClass = stageColors[stage.name] ?? 'bg-gray-400';
              return (
                <div key={stage.name} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-36 shrink-0">
                    <div className={cn('w-3 h-3 rounded-sm shrink-0', colorClass)} />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                      {stage.name}
                    </span>
                  </div>
                  <div className="flex-1 h-8 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden relative">
                    <div
                      className={cn('h-full rounded-md transition-all', colorClass)}
                      style={{
                        width: totalOrders > 0
                          ? `${Math.max(2, (stage.count / Math.max(...stageCounts.map((s) => s.count), 1)) * 100)}%`
                          : '0%',
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-200">
                      {stage.count}
                    </span>
                  </div>
                  {idx < stageCounts.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Total Orders in Pipeline</span>
              <span className="font-bold text-gray-900 dark:text-gray-100 text-lg">{totalOrders}</span>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

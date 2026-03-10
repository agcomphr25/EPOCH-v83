import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, Package, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface KitComponent {
  name: string;
  progress: number;
}

interface KitData {
  kitName: string;
  components: KitComponent[];
  overallProgress: number;
  bottleneck: string;
}

interface KitProgressWidgetProps {
  className?: string;
}

export default function KitProgressWidget({ className }: KitProgressWidgetProps) {
  const { data: mrpData, isLoading, isError } = useQuery({
    queryKey: ['/api/mrp/material-readiness'],
  });

  const kits: KitData[] = (() => {
    const raw = mrpData as any;
    if (!raw || !Array.isArray(raw)) {
      return [
        {
          kitName: 'Standard Build Kit',
          components: [
            { name: 'Stock Blank', progress: 100 },
            { name: 'Barrel Channel', progress: 85 },
            { name: 'Action Inlet', progress: 72 },
            { name: 'Bottom Metal', progress: 45 },
          ],
          overallProgress: 45,
          bottleneck: 'Bottom Metal',
        },
        {
          kitName: 'Paint Kit',
          components: [
            { name: 'Primer', progress: 90 },
            { name: 'Base Coat', progress: 60 },
            { name: 'Clear Coat', progress: 80 },
          ],
          overallProgress: 60,
          bottleneck: 'Base Coat',
        },
      ];
    }

    return raw.map((item: any) => {
      const materials: KitComponent[] = (item.materials ?? []).map((m: any) => ({
        name: m.name ?? m.partNumber ?? 'Unknown',
        progress: item.max_buildable_units > 0
          ? Math.min(100, Math.round((m.available / (m.required || 1)) * 100))
          : 0,
      }));

      const minProgress = materials.length > 0
        ? Math.min(...materials.map((c) => c.progress))
        : 0;

      const bottleneckMat = materials.reduce(
        (min, c) => (c.progress < min.progress ? c : min),
        materials[0] ?? { name: 'N/A', progress: 0 },
      );

      return {
        kitName: item.sku ?? item.name ?? 'Kit',
        components: materials,
        overallProgress: minProgress,
        bottleneck: bottleneckMat.name,
      };
    });
  })();

  return (
    <div
      className={cn(
        'rounded-xl border bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800',
        'px-5 py-4 shadow-sm flex flex-col gap-3',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
          Kit Progress
        </span>
        <Package className="h-4 w-4 text-gray-300 dark:text-gray-600" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-gray-300 dark:text-gray-600" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center h-32 gap-2 text-red-500 text-sm">
          <AlertCircle className="h-5 w-5" />
          <span>Failed to load kit data</span>
        </div>
      ) : kits.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          No kit data available
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-h-64 overflow-y-auto">
          {kits.slice(0, 5).map((kit) => (
            <div key={kit.kitName} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                  {kit.kitName}
                </span>
                <span className="text-xs font-bold tabular-nums text-gray-600 dark:text-gray-300">
                  {kit.overallProgress}%
                </span>
              </div>

              <Progress
                value={kit.overallProgress}
                className={cn(
                  'h-2',
                  kit.overallProgress < 50 && '[&>div]:bg-red-500',
                  kit.overallProgress >= 50 && kit.overallProgress < 80 && '[&>div]:bg-yellow-500',
                  kit.overallProgress >= 80 && '[&>div]:bg-green-500',
                )}
              />

              <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <AlertTriangle className="h-3 w-3 text-amber-500" />
                <span>Bottleneck: {kit.bottleneck}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

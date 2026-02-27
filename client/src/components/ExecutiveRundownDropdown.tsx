import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ClipboardCheck, Check, Circle, AlertTriangle, ArrowUp, Minus, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RundownItem {
  id: number;
  group_id: number;
  title: string;
  description: string | null;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  category: string | null;
  sort_order: number;
  is_completed: boolean;
  completed_at: string | null;
}

interface RundownResponse {
  group: { id: number; group_date: string; title: string | null } | null;
  items: RundownItem[];
}

const priorityConfig = {
  CRITICAL: { color: 'bg-red-500 text-white', icon: AlertTriangle, label: 'CRIT' },
  HIGH: { color: 'bg-orange-500 text-white', icon: ArrowUp, label: 'HIGH' },
  NORMAL: { color: 'bg-blue-500 text-white', icon: Minus, label: 'NORM' },
  LOW: { color: 'bg-gray-400 text-white', icon: ArrowDown, label: 'LOW' },
};

export default function ExecutiveRundownDropdown() {
  const { data, isLoading } = useQuery<RundownResponse>({
    queryKey: ['/api/executive/rundown/today'],
    staleTime: 60000,
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('POST', `/api/executive/rundown/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/today'] });
    },
  });

  const items = data?.items ?? [];
  const displayItems = items.slice(0, 15);
  const completedCount = items.filter((i) => i.is_completed).length;
  const totalCount = items.length;
  const hasIncomplete = completedCount < totalCount;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 relative"
          data-testid="button-executive-rundown"
          title="Executive Rundown"
        >
          <ClipboardCheck className="h-4 w-4" />
          <span className="hidden lg:inline">Rundown</span>
          {hasIncomplete && totalCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">
              {totalCount - completedCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Today's Rundown</span>
          {totalCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">Loading...</div>
        ) : displayItems.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">No items today</div>
        ) : (
          displayItems.map((item) => {
            const pCfg = priorityConfig[item.priority];
            return (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-default',
                  item.is_completed && 'opacity-50'
                )}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!item.is_completed) {
                      completeMutation.mutate(item.id);
                    }
                  }}
                  disabled={item.is_completed || completeMutation.isPending}
                  className="shrink-0"
                >
                  {item.is_completed ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Circle className="h-4 w-4 text-gray-400 hover:text-green-500" />
                  )}
                </button>
                <span
                  className={cn(
                    'flex-1 text-sm truncate',
                    item.is_completed && 'line-through text-muted-foreground'
                  )}
                >
                  {item.title}
                </span>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0', pCfg.color)}>
                  {pCfg.label}
                </span>
              </div>
            );
          })
        )}
        {items.length > 15 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-1 text-xs text-muted-foreground text-center">
              +{items.length - 15} more items
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

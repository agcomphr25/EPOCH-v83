import { useState } from 'react';
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
import { ClipboardCheck, Check, Circle, AlertTriangle, ArrowUp, Minus, ArrowDown, RotateCcw } from 'lucide-react';
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
  group_date?: string;
}

interface RundownResponse {
  group: { id: number; group_date: string; title: string | null } | null;
  items: RundownItem[];
}

interface OverdueResponse {
  items: RundownItem[];
}

const priorityConfig = {
  CRITICAL: { color: 'bg-red-500 text-white', label: 'CRIT' },
  HIGH: { color: 'bg-orange-500 text-white', label: 'HIGH' },
  NORMAL: { color: 'bg-blue-500 text-white', label: 'NORM' },
  LOW: { color: 'bg-gray-400 text-white', label: 'LOW' },
};

export default function ExecutiveRundownDropdown() {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading } = useQuery<RundownResponse>({
    queryKey: ['/api/executive/rundown/today'],
    staleTime: 60000,
  });

  const { data: overdueData } = useQuery<OverdueResponse>({
    queryKey: ['/api/executive/rundown/overdue'],
    staleTime: 60000,
    enabled: isOpen,
  });

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('POST', `/api/executive/rundown/${id}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/today'] });
    },
  });

  const carryForwardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/executive/rundown/carry-forward');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/today'] });
      queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/overdue'] });
    },
  });

  const items = data?.items ?? [];
  const displayItems = items.slice(0, 15);
  const completedCount = items.filter((i) => i.is_completed).length;
  const totalCount = items.length;
  const hasIncomplete = completedCount < totalCount;
  const overdueItems = overdueData?.items ?? [];
  const overdueCount = overdueItems.length;

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
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
        {overdueCount > 0 && (
          <>
            <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-200">
              <span className="text-xs font-medium text-amber-800">
                Carry forward {overdueCount} item{overdueCount !== 1 ? 's' : ''}?
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100"
                onClick={(e) => {
                  e.stopPropagation();
                  carryForwardMutation.mutate();
                }}
                disabled={carryForwardMutation.isPending}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                {carryForwardMutation.isPending ? 'Moving...' : 'Carry Forward'}
              </Button>
            </div>
          </>
        )}
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

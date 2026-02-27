import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Check,
  Circle,
  GripVertical,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ClipboardCheck,
  AlertTriangle,
} from 'lucide-react';
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
  completed_by: number | null;
  group_date?: string;
}

interface RundownGroup {
  id: number;
  user_id: number;
  group_date: string;
  title: string | null;
  notes: string | null;
}

interface TodayResponse {
  group: RundownGroup | null;
  items: RundownItem[];
}

interface WeekResponse {
  groups: RundownGroup[];
  items: RundownItem[];
}

interface OverdueResponse {
  items: RundownItem[];
}

const priorityConfig: Record<string, { color: string; bg: string; label: string }> = {
  CRITICAL: { color: 'text-red-700', bg: 'bg-red-100 border-red-300', label: 'CRITICAL' },
  HIGH: { color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300', label: 'HIGH' },
  NORMAL: { color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300', label: 'NORMAL' },
  LOW: { color: 'text-gray-600', bg: 'bg-gray-100 border-gray-300', label: 'LOW' },
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SortableItem({
  item,
  onComplete,
  onDelete,
  isPending,
}: {
  item: RundownItem;
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  isPending: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pCfg = priorityConfig[item.priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-md border bg-white group',
        isDragging && 'opacity-50 shadow-lg z-50',
        item.is_completed && 'opacity-50 bg-gray-50'
      )}
    >
      <button
        className="shrink-0 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        onClick={() => !item.is_completed && onComplete(item.id)}
        disabled={item.is_completed || isPending}
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
          'flex-1 text-sm',
          item.is_completed && 'line-through text-muted-foreground'
        )}
      >
        {item.title}
      </span>
      {item.category && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
          {item.category}
        </span>
      )}
      <span
        className={cn(
          'text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0',
          pCfg.bg,
          pCfg.color
        )}
      >
        {pCfg.label}
      </span>
      <button
        onClick={() => onDelete(item.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ExecutiveRundown() {
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<string>('NORMAL');
  const [newCategory, setNewCategory] = useState('');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'week' | 'braindump'>('today');

  const { data: sessionData, isLoading: sessionLoading } = useQuery<{ username: string }>({
    queryKey: ['/api/auth/session'],
    staleTime: 300000,
  });

  const isGlenn = sessionData?.username === 'glennj';

  const { data: todayData, isLoading: todayLoading } = useQuery<TodayResponse>({
    queryKey: ['/api/executive/rundown/today'],
    staleTime: 30000,
    enabled: isGlenn,
  });

  const { data: weekData } = useQuery<WeekResponse>({
    queryKey: ['/api/executive/rundown/week'],
    staleTime: 60000,
    enabled: isGlenn && activeTab === 'week',
  });

  const { data: overdueData } = useQuery<OverdueResponse>({
    queryKey: ['/api/executive/rundown/overdue'],
    staleTime: 60000,
    enabled: isGlenn,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/today'] });
    queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/week'] });
    queryClient.invalidateQueries({ queryKey: ['/api/executive/rundown/overdue'] });
  };

  const completeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('POST', `/api/executive/rundown/${id}/complete`);
    },
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/executive/rundown/${id}`);
    },
    onSuccess: invalidateAll,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { title: string; priority: string; category?: string; taskDate?: string }) => {
      await apiRequest('POST', '/api/executive/rundown', body);
    },
    onSuccess: () => {
      setNewTitle('');
      setNewCategory('');
      setNewPriority('NORMAL');
      invalidateAll();
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ id, sortOrder }: { id: number; sortOrder: number }) => {
      await apiRequest('PATCH', `/api/executive/rundown/${id}/reorder`, { sortOrder });
    },
  });

  const carryForwardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/executive/rundown/carry-forward');
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const todayItems = todayData?.items ?? [];
  const activeItems = todayItems.filter((i) => !i.is_completed);
  const completedItems = todayItems.filter((i) => i.is_completed);
  const overdueItems = overdueData?.items ?? [];

  const weekGrouped = useMemo(() => {
    if (!weekData) return {};
    const byDate: Record<string, { group: RundownGroup; items: RundownItem[] }> = {};
    for (const g of weekData.groups) {
      byDate[g.group_date] = { group: g, items: [] };
    }
    for (const item of weekData.items) {
      const group = weekData.groups.find((g) => g.id === item.group_id);
      if (group && byDate[group.group_date]) {
        byDate[group.group_date].items.push(item);
      }
    }
    return byDate;
  }, [weekData]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeItems.findIndex((i) => i.id === active.id);
    const newIndex = activeItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activeItems, oldIndex, newIndex);
    reordered.forEach((item, idx) => {
      reorderMutation.mutate({ id: item.id, sortOrder: idx });
    });

    queryClient.setQueryData<TodayResponse>(['/api/executive/rundown/today'], (old) => {
      if (!old) return old;
      const newItems = [...reordered, ...completedItems];
      return { ...old, items: newItems };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({
      title: newTitle.trim(),
      priority: newPriority,
      category: newCategory.trim() || undefined,
    });
  }

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isGlenn) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-sm">This page is restricted.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Executive Rundown</h1>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['today', 'week', 'braindump'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {tab === 'today' ? 'Today' : tab === 'week' ? 'This Week' : 'Brain Dump'}
            </button>
          ))}
        </div>
      </div>

      {overdueItems.length > 0 && activeTab === 'today' && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                {overdueItems.length} overdue item{overdueItems.length !== 1 ? 's' : ''} from previous days
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-400 text-amber-700 hover:bg-amber-100"
              onClick={() => carryForwardMutation.mutate()}
              disabled={carryForwardMutation.isPending}
            >
              {carryForwardMutation.isPending ? 'Moving...' : 'Carry Forward'}
            </Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'today' && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>
                  Active
                  {activeItems.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {activeItems.length} item{activeItems.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {todayLoading ? (
                <div className="text-sm text-muted-foreground text-center py-8">Loading...</div>
              ) : activeItems.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  No active items. Add one below.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={activeItems.map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {activeItems.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        onComplete={(id) => completeMutation.mutate(id)}
                        onDelete={(id) => deleteMutation.mutate(id)}
                        isPending={completeMutation.isPending}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}

              <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-3 border-t mt-3">
                <Plus className="h-4 w-4 text-gray-400 shrink-0" />
                <Input
                  placeholder="Add item..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="flex-1 h-8 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
                />
                <Input
                  placeholder="Category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-24 h-8 text-xs"
                />
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm" className="h-8" disabled={createMutation.isPending || !newTitle.trim()}>
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          {completedItems.length > 0 && (
            <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="pb-3 cursor-pointer hover:bg-gray-50 transition-colors">
                    <CardTitle className="text-base flex items-center gap-2">
                      {completedOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      Completed
                      <span className="text-xs font-normal text-muted-foreground">
                        {completedItems.length} item{completedItems.length !== 1 ? 's' : ''}
                      </span>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-1.5 pt-0">
                    {completedItems.map((item) => {
                      const pCfg = priorityConfig[item.priority];
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 opacity-60 group"
                        >
                          <Check className="h-4 w-4 text-green-500 shrink-0" />
                          <span className="flex-1 text-sm line-through text-muted-foreground">
                            {item.title}
                          </span>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0', pCfg.bg, pCfg.color)}>
                            {pCfg.label}
                          </span>
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </>
      )}

      {activeTab === 'week' && (
        <div className="space-y-4">
          {(() => {
            const today = new Date();
            const dayOfWeek = today.getDay();
            const monday = new Date(today);
            monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

            return Array.from({ length: 7 }, (_, i) => {
              const date = new Date(monday);
              date.setDate(monday.getDate() + i);
              const dateStr = date.toISOString().slice(0, 10);
              const dayData = weekGrouped[dateStr];
              const dayItems = dayData?.items ?? [];
              const isToday = dateStr === todayStr;
              const activeCount = dayItems.filter((i) => !i.is_completed).length;
              const completedCount = dayItems.filter((i) => i.is_completed).length;

              return (
                <Card key={dateStr} className={cn(isToday && 'border-primary shadow-sm')}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={cn('font-semibold', isToday && 'text-primary')}>
                          {DAY_NAMES[i]}
                        </span>
                        <span className="font-normal text-muted-foreground">
                          {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        {isToday && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-white font-medium">
                            TODAY
                          </span>
                        )}
                      </div>
                      {dayItems.length > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {activeCount} active · {completedCount} done
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  {dayItems.length > 0 && (
                    <CardContent className="pt-0 space-y-1">
                      {dayItems.map((item) => {
                        const pCfg = priorityConfig[item.priority];
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'flex items-center gap-2 px-2 py-1.5 rounded text-sm',
                              item.is_completed && 'opacity-50'
                            )}
                          >
                            {item.is_completed ? (
                              <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            )}
                            <span className={cn('flex-1', item.is_completed && 'line-through text-muted-foreground')}>
                              {item.title}
                            </span>
                            <span className={cn('text-[9px] px-1 py-0.5 rounded border font-medium shrink-0', pCfg.bg, pCfg.color)}>
                              {pCfg.label}
                            </span>
                          </div>
                        );
                      })}
                    </CardContent>
                  )}
                  {dayItems.length === 0 && (
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">No items</p>
                    </CardContent>
                  )}
                </Card>
              );
            });
          })()}
        </div>
      )}

      {activeTab === 'braindump' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Brain Dump</CardTitle>
            <p className="text-sm text-muted-foreground">
              Quick capture. Items land in today's rundown.
            </p>
          </CardHeader>
          <CardContent>
            <BrainDump onAdd={(title, priority) => createMutation.mutate({ title, priority })} isPending={createMutation.isPending} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BrainDump({ onAdd, isPending }: { onAdd: (title: string, priority: string) => void; isPending: boolean }) {
  const [lines, setLines] = useState('');

  function handleDump() {
    const items = lines
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const item of items) {
      let priority = 'NORMAL';
      let title = item;
      if (item.startsWith('!!!') || item.startsWith('!!!')) {
        priority = 'CRITICAL';
        title = item.replace(/^!{1,3}\s*/, '');
      } else if (item.startsWith('!!')) {
        priority = 'HIGH';
        title = item.replace(/^!{1,2}\s*/, '');
      } else if (item.startsWith('!')) {
        priority = 'HIGH';
        title = item.replace(/^!\s*/, '');
      }
      if (title.trim()) {
        onAdd(title.trim(), priority);
      }
    }
    setLines('');
  }

  return (
    <div className="space-y-3">
      <textarea
        value={lines}
        onChange={(e) => setLines(e.target.value)}
        placeholder={"One item per line.\nPrefix with ! for HIGH, !!! for CRITICAL.\n\nExample:\n!!! Call supplier about late delivery\n! Review Q1 numbers\nUpdate org chart"}
        className="w-full h-48 rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {lines.split('\n').filter((l) => l.trim()).length} item{lines.split('\n').filter((l) => l.trim()).length !== 1 ? 's' : ''} ready
        </span>
        <Button
          onClick={handleDump}
          disabled={isPending || !lines.trim()}
          size="sm"
        >
          Add All to Today
        </Button>
      </div>
    </div>
  );
}

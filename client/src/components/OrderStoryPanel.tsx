import { useState, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Factory,
  DollarSign,
  Truck,
  AlertCircle,
  GitBranch,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  Filter,
  X,
  BookOpen,
  History,
  Shield,
  Wrench,
  Code,
  ChevronsUpDown,
  Check,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  useOrderActivity,
  type OrderActivityEvent,
} from '@/hooks/useOrderActivity';

const CATEGORY_CONFIG: Record<
  string,
  { label: string; color: string; bgColor: string; icon: any }
> = {
  status_department: {
    label: 'Status/Dept',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500',
    icon: GitBranch,
  },
  spec_change: {
    label: 'Spec Change',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500',
    icon: Wrench,
  },
  shipping: {
    label: 'Shipping',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500',
    icon: Truck,
  },
  payment: {
    label: 'Payment',
    color: 'text-green-600',
    bgColor: 'bg-green-500',
    icon: DollarSign,
  },
  ncr_scrap: {
    label: 'NCR/Scrap',
    color: 'text-red-600',
    bgColor: 'bg-red-500',
    icon: AlertCircle,
  },
  admin_override: {
    label: 'Admin Override',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500',
    icon: Shield,
  },
  production: {
    label: 'Production',
    color: 'text-sky-600',
    bgColor: 'bg-sky-500',
    icon: Factory,
  },
};

const ALL_SOURCES = [
  { value: 'badge_scan', label: 'Badge Scan' },
  { value: 'admin', label: 'Admin' },
  { value: 'system', label: 'System' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'ncr', label: 'NCR' },
];

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  ALL_SOURCES.map(s => [s.value, s.label])
);

function getCategoryConfig(category: string) {
  return (
    CATEGORY_CONFIG[category] || {
      label: category,
      color: 'text-gray-600',
      bgColor: 'bg-gray-500',
      icon: Factory,
    }
  );
}

function formatTs(timestamp: string): string {
  try {
    return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
  } catch {
    return timestamp;
  }
}

function timeAgo(timestamp: string): string {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  } catch {
    return '';
  }
}

interface EventCardProps {
  event: OrderActivityEvent;
}

function EventCard({ event }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const config = getCategoryConfig(event.eventCategory);
  const IconComponent = config.icon;
  const hasDetails =
    (event.fieldsChanged && Object.keys(event.fieldsChanged).length > 0) ||
    event.reason ||
    event.durationMinutes != null;

  const sourceLabel = SOURCE_LABELS[event.source] || event.source;

  return (
    <div className="relative pl-12">
      <div
        className={`absolute left-3.5 w-5 h-5 rounded-full ${config.bgColor} flex items-center justify-center shadow-sm`}
      >
        <IconComponent className="w-3 h-3 text-white" />
      </div>

      <Collapsible open={expanded} onOpenChange={hasDetails ? setExpanded : undefined}>
        <Card className="hover:shadow-md transition-shadow">
          <CollapsibleTrigger asChild disabled={!hasDetails}>
            <CardContent className={`p-3 ${hasDetails ? 'cursor-pointer' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="font-medium text-sm leading-tight">{event.title}</span>
                    {event.isLegacy && (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground border-dashed shrink-0"
                      >
                        Historical record
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTs(event.timestamp)}
                    </span>
                    <span className="opacity-70">({timeAgo(event.timestamp)})</span>
                    {event.actorName && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {event.actorName}
                      </span>
                    )}
                    <Badge
                      variant="secondary"
                      className={`text-xs px-1.5 py-0 ${config.color}`}
                    >
                      {config.label}
                    </Badge>
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      {sourceLabel}
                    </Badge>
                  </div>

                  {event.beforeAfterSummary && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {event.beforeAfterSummary}
                    </p>
                  )}
                </div>

                {hasDetails && (
                  <div className="text-muted-foreground shrink-0 mt-0.5">
                    {expanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleTrigger>

          {hasDetails && (
            <CollapsibleContent>
              <div className="px-3 pb-3 border-t space-y-2 pt-2">
                {event.fieldsChanged &&
                  Object.keys(event.fieldsChanged).length > 0 && (
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Field Changes
                      </Label>
                      <div className="mt-1 space-y-1">
                        {Object.entries(event.fieldsChanged).map(([field, change]) => (
                          <div key={field} className="flex flex-wrap gap-1 items-center text-sm">
                            <span className="font-medium text-muted-foreground">{field}:</span>
                            <span className="text-red-500 line-through">
                              {String(change.before ?? 'none')}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-600">
                              {String(change.after ?? 'none')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {event.reason && (
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Reason
                    </Label>
                    <p className="text-sm mt-0.5">{event.reason}</p>
                  </div>
                )}

                {event.durationMinutes != null && (
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Duration in Department
                    </Label>
                    <p className="text-sm mt-0.5">{event.durationMinutes} minutes</p>
                  </div>
                )}

                {event.department && (
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Department
                    </Label>
                    <p className="text-sm mt-0.5">{event.department}</p>
                  </div>
                )}

                {event.cycleNumber != null && (
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Cycle
                    </Label>
                    <p className="text-sm mt-0.5">Cycle #{event.cycleNumber}</p>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          )}
        </Card>
      </Collapsible>
    </div>
  );
}

interface RawEventsTableProps {
  events: OrderActivityEvent[];
}

function RawEventsTable({ events }: RawEventsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Timestamp</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Event Type</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Category</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Actor</th>
            <th className="text-left py-2 pr-3 font-medium text-muted-foreground">Source</th>
            <th className="text-left py-2 font-medium text-muted-foreground">Summary</th>
          </tr>
        </thead>
        <tbody>
          {events.map(event => (
            <tr key={event.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                {formatTs(event.timestamp)}
              </td>
              <td className="py-1.5 pr-3 font-mono">{event.eventType}</td>
              <td className="py-1.5 pr-3">{event.eventCategory}</td>
              <td className="py-1.5 pr-3">{event.actorName || '—'}</td>
              <td className="py-1.5 pr-3">
                <Badge variant="outline" className="text-xs px-1 py-0">
                  {SOURCE_LABELS[event.source] || event.source}
                </Badge>
              </td>
              <td className="py-1.5 max-w-xs truncate">{event.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface MultiSelectSourceProps {
  selected: string[];
  onChange: (sources: string[]) => void;
}

function MultiSelectSource({ selected, onChange }: MultiSelectSourceProps) {
  const toggleSource = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const label =
    selected.length === 0
      ? 'All sources'
      : selected.length === 1
      ? SOURCE_LABELS[selected[0]] || selected[0]
      : `${selected.length} sources`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs w-[150px] justify-between font-normal"
        >
          {label}
          <ChevronsUpDown className="w-3 h-3 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] p-2">
        <div className="space-y-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-1 py-0.5"
            onClick={() => onChange([])}
          >
            Clear selection
          </button>
          {ALL_SOURCES.map(source => (
            <div key={source.value} className="flex items-center gap-2 px-1 py-0.5">
              <Checkbox
                id={`src-${source.value}`}
                checked={selected.includes(source.value)}
                onCheckedChange={() => toggleSource(source.value)}
                className="h-3 w-3"
              />
              <label
                htmlFor={`src-${source.value}`}
                className="text-xs cursor-pointer flex-1"
              >
                {source.label}
              </label>
              {selected.includes(source.value) && (
                <Check className="w-3 h-3 text-primary" />
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FilterBarProps {
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  actorFilter: string;
  setActorFilter: (v: string) => void;
  selectedSources: string[];
  setSelectedSources: (v: string[]) => void;
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  onClear: () => void;
  hasFilters: boolean;
}

function FilterBar({
  categoryFilter,
  setCategoryFilter,
  actorFilter,
  setActorFilter,
  selectedSources,
  setSelectedSources,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onClear,
  hasFilters,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 bg-muted/30 rounded-lg border">
      <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground shrink-0">
        <Filter className="w-3.5 h-3.5" />
        <span>Filters</span>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-7 text-xs w-[150px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1 min-w-[150px]">
        <Label className="text-xs text-muted-foreground">Actor (search)</Label>
        <Input
          placeholder="Search by actor..."
          value={actorFilter}
          onChange={e => setActorFilter(e.target.value)}
          className="h-7 text-xs"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Source</Label>
        <MultiSelectSource selected={selectedSources} onChange={setSelectedSources} />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">From date</Label>
        <Input
          type="date"
          value={fromDate}
          onChange={e => setFromDate(e.target.value)}
          className="h-7 text-xs w-[140px]"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">To date</Label>
        <Input
          type="date"
          value={toDate}
          onChange={e => setToDate(e.target.value)}
          className="h-7 text-xs w-[140px]"
        />
      </div>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 text-xs text-muted-foreground"
        >
          <X className="w-3 h-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}

interface TimelineViewProps {
  events: OrderActivityEvent[];
  isLoading: boolean;
}

function TimelineView({ events, isLoading }: TimelineViewProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="relative pl-12">
            <div className="absolute left-3.5 w-5 h-5 rounded-full bg-muted" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <History className="w-12 h-12 mb-3 opacity-30" />
        <p className="font-medium">No events recorded</p>
        <p className="text-sm mt-1">
          Events will appear here as the order progresses through production.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[22px] top-0 bottom-0 w-px bg-border" />
      <div className="space-y-2">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

const TAB_DEFINITIONS: Array<{
  key: string;
  label: string;
  icon: any;
  category: string | null;
}> = [
  { key: 'story', label: 'Story', icon: BookOpen, category: null },
  { key: 'status_department', label: 'Status/Dept', icon: GitBranch, category: 'status_department' },
  { key: 'spec_change', label: 'Spec Changes', icon: Wrench, category: 'spec_change' },
  { key: 'shipping', label: 'Shipping', icon: Truck, category: 'shipping' },
  { key: 'payment', label: 'Payments', icon: DollarSign, category: 'payment' },
  { key: 'ncr_scrap', label: 'NCR/Scrap', icon: AlertCircle, category: 'ncr_scrap' },
  { key: 'admin_override', label: 'Admin Overrides', icon: Shield, category: 'admin_override' },
  { key: 'raw', label: 'Raw Events', icon: Code, category: null },
];

interface OrderStoryPanelProps {
  orderId: string;
}

export default function OrderStoryPanel({ orderId }: OrderStoryPanelProps) {
  const [activeTab, setActiveTab] = useState('story');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const { data: allEvents = [], isLoading } = useOrderActivity(orderId);

  const baseFilteredEvents = useMemo(() => {
    let filtered = allEvents;

    if (actorFilter.trim()) {
      const lower = actorFilter.toLowerCase();
      filtered = filtered.filter(e => e.actorName?.toLowerCase().includes(lower));
    }
    if (selectedSources.length > 0) {
      filtered = filtered.filter(e => selectedSources.includes(e.source));
    }
    if (fromDate) {
      const from = new Date(fromDate);
      filtered = filtered.filter(e => new Date(e.timestamp) >= from);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(e => new Date(e.timestamp) <= to);
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(e => e.eventCategory === categoryFilter);
    }

    return filtered;
  }, [allEvents, actorFilter, selectedSources, fromDate, toDate, categoryFilter]);

  function getEventsForTab(tabCategory: string | null): OrderActivityEvent[] {
    if (!tabCategory) return baseFilteredEvents;
    return baseFilteredEvents.filter(e => e.eventCategory === tabCategory);
  }

  function countForCategory(cat: string): number {
    return baseFilteredEvents.filter(e => e.eventCategory === cat).length;
  }

  const hasFilters =
    categoryFilter !== 'all' ||
    !!actorFilter.trim() ||
    selectedSources.length > 0 ||
    !!fromDate ||
    !!toDate;

  const clearFilters = () => {
    setCategoryFilter('all');
    setActorFilter('');
    setSelectedSources([]);
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="space-y-4">
      <FilterBar
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        actorFilter={actorFilter}
        setActorFilter={setActorFilter}
        selectedSources={selectedSources}
        setSelectedSources={setSelectedSources}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        onClear={clearFilters}
        hasFilters={hasFilters}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted p-1 rounded-lg w-full">
          {TAB_DEFINITIONS.map(tab => {
            const IconComp = tab.icon;
            const count = tab.category
              ? countForCategory(tab.category)
              : tab.key === 'story'
              ? baseFilteredEvents.length
              : null;
            return (
              <TabsTrigger key={tab.key} value={tab.key} className="flex items-center gap-1.5 text-xs">
                <IconComp className="w-3.5 h-3.5" />
                {tab.label}
                {!isLoading && count != null && count > 0 && (
                  <Badge variant="secondary" className="text-xs ml-1 py-0 h-4">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {TAB_DEFINITIONS.filter(t => t.key !== 'raw').map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="mt-4">
            <TimelineView
              events={getEventsForTab(tab.category)}
              isLoading={isLoading}
            />
          </TabsContent>
        ))}

        <TabsContent value="raw" className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : baseFilteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <History className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">No events recorded</p>
            </div>
          ) : (
            <RawEventsTable events={baseFilteredEvents} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

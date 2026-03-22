import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { format, formatDistanceToNow } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Filter,
  LayoutList,
  List,
  User,
  Factory,
  DollarSign,
  Truck,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  X,
  GitBranch,
} from 'lucide-react';
import ManufacturingTimeline from '@/components/ManufacturingTimeline';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';

interface TimelineItem {
  id: string;
  type: 'audit' | 'transition' | 'scrap';
  timestamp: string;
  category: string;
  action: string;
  description: string;
  actor: string | null;
  details: {
    fieldsChanged?: Record<string, { before: any; after: any }>;
    reason?: string;
    meta?: Record<string, any>;
    department?: string;
    cycleNumber?: number;
    durationMinutes?: number;
    exitReason?: string;
    scrapReason?: string;
    scrapDepartment?: string;
    restartEntityId?: string;
  };
}

const CENTRAL_TIMEZONE = 'America/Chicago';

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const zonedDate = toZonedTime(date, CENTRAL_TIMEZONE);
  return format(zonedDate, 'MMM d, yyyy h:mm a');
}

function formatTimeAgo(timestamp: string): string {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

const categoryConfig: Record<string, { label: string; color: string; icon: any }> = {
  production: { label: 'Production', color: 'bg-blue-500', icon: Factory },
  finance: { label: 'Finance', color: 'bg-green-500', icon: DollarSign },
  shipping: { label: 'Shipping', color: 'bg-purple-500', icon: Truck },
  qc: { label: 'Quality Control', color: 'bg-orange-500', icon: AlertCircle },
};

function getCategoryConfig(category: string) {
  return categoryConfig[category] || { label: category, color: 'bg-gray-500', icon: Factory };
}

export default function OrderTimeline() {
  const [, params] = useRoute('/order-timeline/:entityType/:entityId');
  const [, setLocation] = useLocation();
  
  const entityType = params?.entityType || 'p1_order';
  const entityId = params?.entityId || '';

  const [activeTab, setActiveTab] = useState<'event-log' | 'process-flow'>('event-log');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actorFilter, setActorFilter] = useState('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data: timelineData = [], isLoading } = useQuery<TimelineItem[]>({
    queryKey: ['/api/audit/timeline', entityType, entityId, { categoryFilter, startDate, endDate, actorFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (actorFilter && actorFilter !== 'all') params.set('actor', actorFilter);
      
      const res = await fetch(`/api/audit/timeline/${entityType}/${entityId}?${params}`, {
        credentials: 'include',
      });
      return res.json();
    },
    enabled: !!entityId,
  });

  const uniqueActors = useMemo(() => {
    const actors = new Set<string>();
    timelineData.forEach(item => {
      if (item.actor) actors.add(item.actor);
    });
    return Array.from(actors).sort();
  }, [timelineData]);

  const hasFilters = categoryFilter !== 'all' || startDate || endDate || actorFilter;

  const clearFilters = () => {
    setCategoryFilter('all');
    setStartDate('');
    setEndDate('');
    setActorFilter('');
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderFieldChanges = (fieldsChanged: Record<string, { before: any; after: any }>) => {
    return (
      <div className="space-y-1 text-sm">
        {Object.entries(fieldsChanged).map(([field, change]) => (
          <div key={field} className="flex flex-wrap gap-2">
            <span className="font-medium text-muted-foreground">{field}:</span>
            <span className="text-red-500 line-through">{String(change.before ?? 'none')}</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-green-600">{String(change.after ?? 'none')}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderTimelineView = () => (
    <div className="relative">
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-4">
        {timelineData.map((item, index) => {
          const config = getCategoryConfig(item.category);
          const IconComponent = config.icon;
          const isExpanded = expandedItems.has(item.id);
          const hasDetails = item.details.fieldsChanged || item.details.reason || item.details.durationMinutes;

          return (
            <div key={item.id} className="relative pl-14">
              <div className={`absolute left-4 w-5 h-5 rounded-full ${config.color} flex items-center justify-center`}>
                <IconComponent className="w-3 h-3 text-white" />
              </div>
              
              <Card className="hover:shadow-md transition-shadow">
                <Collapsible open={isExpanded} onOpenChange={() => hasDetails && toggleExpanded(item.id)}>
                  <CollapsibleTrigger asChild disabled={!hasDetails}>
                    <CardContent className={`p-4 ${hasDetails ? 'cursor-pointer' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{item.description}</span>
                            <Badge variant="outline" className="text-xs">
                              {config.label}
                            </Badge>
                            {item.type === 'scrap' && (
                              <Badge variant="destructive" className="text-xs">Scrap Event</Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTimestamp(item.timestamp)}
                            </span>
                            <span className="text-xs">({formatTimeAgo(item.timestamp)})</span>
                            {item.actor && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {item.actor}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {hasDetails && (
                          <div className="text-muted-foreground">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  
                  {hasDetails && (
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0 space-y-2 border-t">
                        <div className="pt-3" />
                        {item.details.fieldsChanged && Object.keys(item.details.fieldsChanged).length > 0 && (
                          <div>
                            <Label className="text-xs font-medium">Changes</Label>
                            {renderFieldChanges(item.details.fieldsChanged)}
                          </div>
                        )}
                        {item.details.reason && (
                          <div>
                            <Label className="text-xs font-medium">Reason</Label>
                            <p className="text-sm">{item.details.reason}</p>
                          </div>
                        )}
                        {item.details.durationMinutes && (
                          <div>
                            <Label className="text-xs font-medium">Duration</Label>
                            <p className="text-sm">{item.details.durationMinutes} minutes</p>
                          </div>
                        )}
                        {item.details.scrapReason && (
                          <div>
                            <Label className="text-xs font-medium">Scrap Reason</Label>
                            <p className="text-sm">{item.details.scrapReason}</p>
                          </div>
                        )}
                        {item.details.restartEntityId && (
                          <div>
                            <Label className="text-xs font-medium">Restarted As</Label>
                            <p className="text-sm">{item.details.restartEntityId}</p>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  )}
                </Collapsible>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderTableView = () => (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {timelineData.map((item) => {
            const config = getCategoryConfig(item.category);
            return (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">
                  <div className="flex flex-col">
                    <span>{formatTimestamp(item.timestamp)}</span>
                    <span className="text-xs text-muted-foreground">{formatTimeAgo(item.timestamp)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={`${config.color} text-white`}>
                    {config.label}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{item.description}</span>
                    {item.type === 'scrap' && (
                      <Badge variant="destructive" className="text-xs w-fit mt-1">Scrap</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{item.actor || '-'}</TableCell>
                <TableCell className="max-w-xs">
                  {item.details.fieldsChanged && Object.keys(item.details.fieldsChanged).length > 0 && (
                    <div className="text-xs">
                      {Object.entries(item.details.fieldsChanged).slice(0, 2).map(([field, change]) => (
                        <div key={field}>
                          {field}: {String(change.before ?? 'none')} → {String(change.after ?? 'none')}
                        </div>
                      ))}
                      {Object.keys(item.details.fieldsChanged).length > 2 && (
                        <span className="text-muted-foreground">+{Object.keys(item.details.fieldsChanged).length - 2} more</span>
                      )}
                    </div>
                  )}
                  {item.details.reason && <div className="text-xs">{item.details.reason}</div>}
                  {item.details.scrapReason && <div className="text-xs text-red-500">{item.details.scrapReason}</div>}
                </TableCell>
              </TableRow>
            );
          })}
          {timelineData.length === 0 && !isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                No events found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  );

  if (!entityId) {
    return (
      <div className="container mx-auto py-6 px-4">
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No order specified. Please access this page from an order.</p>
          <Button className="mt-4" onClick={() => setLocation('/orders')}>
            Go to Orders
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Order Timeline</h1>
          <p className="text-muted-foreground">
            {entityType === 'p1_order' ? 'P1 Order' : 'P2 Order'}: {entityId}
          </p>
        </div>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────── */}
      <div className="flex border rounded-lg overflow-hidden w-fit mb-4">
        <Button
          variant={activeTab === 'event-log' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('event-log')}
          className="rounded-none border-r"
        >
          <List className="w-4 h-4 mr-1.5" />
          Event Log
        </Button>
        <Button
          variant={activeTab === 'process-flow' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('process-flow')}
          className="rounded-none"
        >
          <GitBranch className="w-4 h-4 mr-1.5" />
          Process Flow
        </Button>
      </div>

      {/* ── Process Flow tab ─────────────────────────────────────────── */}
      {activeTab === 'process-flow' && (
        <ManufacturingTimeline orderId={entityId} />
      )}

      {/* ── Event Log tab (existing, unchanged) ─────────────────────── */}
      {activeTab === 'event-log' && (<>
      <Card className="mb-6">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              )}
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('timeline')}
                  className="rounded-r-none"
                  data-testid="button-view-timeline"
                >
                  <List className="w-4 h-4 mr-1" />
                  Timeline
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="rounded-l-none"
                  data-testid="button-view-table"
                >
                  <LayoutList className="w-4 h-4 mr-1" />
                  Table
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="category-filter">Category</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="category-filter" data-testid="select-category">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="shipping">Shipping</SelectItem>
                  <SelectItem value="qc">Quality Control</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-start-date"
              />
            </div>
            
            <div>
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                data-testid="input-end-date"
              />
            </div>
            
            <div>
              <Label htmlFor="actor-filter">Actor</Label>
              <Select value={actorFilter} onValueChange={setActorFilter}>
                <SelectTrigger id="actor-filter" data-testid="select-actor">
                  <SelectValue placeholder="All users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {uniqueActors.map(actor => (
                    <SelectItem key={actor} value={actor}>{actor}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="pl-14 relative">
              <Skeleton className="absolute left-4 w-5 h-5 rounded-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : timelineData.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">
            No timeline events found for this order.
            {hasFilters && ' Try adjusting your filters.'}
          </p>
        </Card>
      ) : viewMode === 'timeline' ? (
        renderTimelineView()
      ) : (
        renderTableView()
      )}

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Showing {timelineData.length} event{timelineData.length !== 1 ? 's' : ''} (Central Time)
      </div>
      </>)}

    </div>
  );
}

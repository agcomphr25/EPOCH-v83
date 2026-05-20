import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock,
  Inbox,
  Link2,
  MessageSquare,
  PauseCircle,
  Search,
  ShieldAlert,
  User,
  Users,
} from 'lucide-react';
import { differenceInHours, formatDistanceToNow } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { getUserName as resolveUserName } from '@/lib/ticketAssigneeHelpers';

interface Ticket {
  id: string;
  ticketType: 'customer' | 'internal' | 'technical';
  category: string | null;
  priority: 'low' | 'normal' | 'high';
  status: 'new' | 'in_progress' | 'waiting_on_customer' | 'waiting_on_production' | 'resolved' | 'closed';
  title: string;
  description: string | null;
  customerId: number | null;
  ownerUserId: number;
  assignedUserId: number | null;
  assignedUserIds: number[];
  slaDueAt: string | null;
  slaBreached: boolean;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface TicketActivity {
  id: string;
  ticketId: string;
  activityType: 'comment' | 'status_change' | 'assignment' | 'priority_change';
  message: string | null;
  previousValue: string | null;
  newValue: string | null;
  createdBy: number;
  createdAt: string;
}

interface TicketOrder {
  id: string;
  ticketId: string;
  orderId: string;
  createdAt: string;
}

interface TicketMetrics {
  openByAge: { under24h: number; under48h: number; over48h: number };
  slaBreached: number;
  totalOpen: number;
}

interface Employee {
  id: number;
  name: string;
  email?: string;
  department?: string;
  userId?: number | null;
}

type SavedView = 'attention' | 'my_tickets' | 'production' | 'waiting' | 'unassigned' | 'recently_closed';

const statusLabels: Record<Ticket['status'], string> = {
  new: 'New',
  in_progress: 'In Progress',
  waiting_on_customer: 'Waiting on Customer',
  waiting_on_production: 'Waiting on Production',
  resolved: 'Resolved',
  closed: 'Closed',
};

const priorityLabels: Record<Ticket['priority'], string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

const laneConfig = [
  {
    key: 'needs_assignment',
    title: 'Needs Assignment',
    icon: Inbox,
  },
  {
    key: 'needs_action',
    title: 'Needs Action',
    icon: ShieldAlert,
  },
  {
    key: 'in_progress',
    title: 'In Progress',
    icon: CircleDot,
  },
  {
    key: 'waiting',
    title: 'Waiting',
    icon: PauseCircle,
  },
  {
    key: 'ready_to_close',
    title: 'Ready to Close',
    icon: CheckCircle2,
  },
  {
    key: 'recently_closed',
    title: 'Recently Closed',
    icon: CheckCircle2,
  },
];

const viewLabels: { value: SavedView; label: string }[] = [
  { value: 'attention', label: 'Needs Attention' },
  { value: 'my_tickets', label: 'My Tickets' },
  { value: 'production', label: 'Production Blockers' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'recently_closed', label: 'Recently Closed' },
];

function ticketAgeHours(ticket: Ticket) {
  return differenceInHours(new Date(), new Date(ticket.createdAt));
}

function lastTouchHours(ticket: Ticket) {
  return differenceInHours(new Date(), new Date(ticket.lastActivityAt || ticket.updatedAt || ticket.createdAt));
}

function getNextAction(ticket: Ticket) {
  if ((ticket.assignedUserIds?.length || 0) === 0 && ticket.status !== 'closed') return 'Assign owner';
  if (ticket.slaBreached) return 'Escalate';
  if (ticket.status === 'new') return 'Triage';
  if (ticket.status === 'waiting_on_customer') return 'Customer follow-up';
  if (ticket.status === 'waiting_on_production') return 'Production follow-up';
  if (ticket.status === 'resolved') return 'Verify and close';
  if (lastTouchHours(ticket) > 72 && ticket.status !== 'closed') return 'Refresh status';
  return 'Continue work';
}

function getTicketLaneKey(ticket: Ticket) {
  if (ticket.status === 'closed') return 'recently_closed';
  if (ticket.status === 'resolved') return 'ready_to_close';
  if ((ticket.assignedUserIds?.length || 0) === 0) return 'needs_assignment';
  if (ticket.slaBreached || ticket.priority === 'high' || ticket.status === 'new') return 'needs_action';
  if (ticket.status === 'waiting_on_customer' || ticket.status === 'waiting_on_production') return 'waiting';
  return 'in_progress';
}

function getPriorityClass(ticket: Ticket) {
  if (ticket.slaBreached) return 'border-red-300 bg-red-50 text-red-800';
  if (ticket.priority === 'high') return 'border-amber-300 bg-amber-50 text-amber-800';
  if (ticket.priority === 'low') return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return response.json();
}

export default function TicketsCommandCenter() {
  const [, navigate] = useLocation();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [savedView, setSavedView] = useState<SavedView>('attention');
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', 'command-center'],
    queryFn: () => fetchJson<Ticket[]>('/api/tickets?archived=false'),
  });

  const { data: metrics } = useQuery<TicketMetrics>({
    queryKey: ['/api/tickets/metrics'],
    queryFn: () => fetchJson<TicketMetrics>('/api/tickets/metrics'),
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: () => fetchJson<Employee[]>('/api/employees'),
  });

  const { data: currentUserData } = useQuery<{ valid: boolean; user: { id: number; username: string } }>({
    queryKey: ['/api/auth/validate'],
    queryFn: () => fetchJson<{ valid: boolean; user: { id: number; username: string } }>('/api/auth/validate'),
  });

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) || null;

  const { data: selectedTicketDetail } = useQuery<Ticket>({
    queryKey: ['/api/tickets', selectedTicketId, 'command-center-detail'],
    queryFn: () => fetchJson<Ticket>(`/api/tickets/${selectedTicketId}`),
    enabled: !!selectedTicketId,
  });

  const activeTicket = selectedTicketDetail || selectedTicket;

  const { data: ticketActivity = [] } = useQuery<TicketActivity[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'activity'],
    queryFn: () => fetchJson<TicketActivity[]>(`/api/tickets/${selectedTicketId}/activity`),
    enabled: !!selectedTicketId,
  });

  const { data: ticketOrders = [] } = useQuery<TicketOrder[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'orders'],
    queryFn: () => fetchJson<TicketOrder[]>(`/api/tickets/${selectedTicketId}/orders`),
    enabled: !!selectedTicketId,
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Ticket> }) =>
      apiRequest(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', variables.id, 'command-center-detail'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', variables.id, 'activity'] });
    },
  });

  const getUserName = (userId: number | null | undefined) =>
    userId ? resolveUserName(userId, employees) : 'Unassigned';

  const filteredTickets = useMemo(() => {
    const currentUserId = currentUserData?.user?.id;
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return tickets
      .filter((ticket) => {
        if (savedView === 'attention') {
          if (
            ticket.status === 'closed' ||
            ticket.status === 'resolved' ||
            (!ticket.slaBreached &&
              ticket.priority !== 'high' &&
              ticket.status !== 'new' &&
              (ticket.assignedUserIds?.length || 0) > 0 &&
              lastTouchHours(ticket) <= 72)
          ) {
            return false;
          }
        }
        if (savedView === 'my_tickets' && currentUserId) {
          if (ticket.ownerUserId !== currentUserId && !(ticket.assignedUserIds || []).includes(currentUserId)) return false;
        }
        if (savedView === 'production' && ticket.status !== 'waiting_on_production') return false;
        if (savedView === 'waiting' && !ticket.status.startsWith('waiting_on_')) return false;
        if (savedView === 'unassigned' && (ticket.assignedUserIds?.length || 0) > 0) return false;
        if (savedView === 'recently_closed' && ticket.status !== 'closed' && ticket.status !== 'resolved') return false;
        if (ownerFilter !== 'all') {
          const ownerId = Number(ownerFilter);
          if (ticket.ownerUserId !== ownerId && !(ticket.assignedUserIds || []).includes(ownerId)) return false;
        }
        if (priorityFilter !== 'all' && ticket.priority !== priorityFilter) return false;
        if (normalizedSearch) {
          const haystack = `${ticket.id} ${ticket.title} ${ticket.description || ''} ${ticket.category || ''}`.toLowerCase();
          if (!haystack.includes(normalizedSearch)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const urgencyA = Number(a.slaBreached) * 100 + Number(a.priority === 'high') * 30 + ticketAgeHours(a);
        const urgencyB = Number(b.slaBreached) * 100 + Number(b.priority === 'high') * 30 + ticketAgeHours(b);
        return urgencyB - urgencyA;
      });
  }, [currentUserData?.user?.id, ownerFilter, priorityFilter, savedView, searchQuery, tickets]);

  const lanes = useMemo(
    () =>
      laneConfig.map((lane) => ({
        ...lane,
        tickets: filteredTickets.filter((ticket) => getTicketLaneKey(ticket) === lane.key).slice(0, 14),
      })),
    [filteredTickets]
  );

  const triageCounts = useMemo(() => {
    const unassigned = tickets.filter((ticket) => ticket.status !== 'closed' && (ticket.assignedUserIds?.length || 0) === 0).length;
    const stale = tickets.filter((ticket) => ticket.status !== 'closed' && lastTouchHours(ticket) > 72).length;
    const waiting = tickets.filter((ticket) => ticket.status.startsWith('waiting_on_')).length;
    const high = tickets.filter((ticket) => ticket.priority === 'high' && ticket.status !== 'closed').length;
    return { unassigned, stale, waiting, high };
  }, [tickets]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="border-b border-slate-300 bg-white">
        <div className="px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-slate-950 text-white">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Ticket Command Center</h1>
                  <p className="text-sm text-slate-500">Triage, ownership, waiting work, and next actions</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {viewLabels.map((view) => (
                <Button
                  key={view.value}
                  type="button"
                  variant={savedView === view.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSavedView(view.value)}
                  className="h-8"
                >
                  {view.label}
                </Button>
              ))}
              <Button size="sm" onClick={() => navigate('/tickets')} className="h-8">
                New Ticket
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-slate-300 bg-slate-50 px-5 py-3 md:grid-cols-2 xl:grid-cols-6">
        <MetricTile label="Open" value={metrics?.totalOpen ?? tickets.filter((ticket) => ticket.status !== 'closed').length} />
        <MetricTile label="SLA Breached" value={metrics?.slaBreached ?? tickets.filter((ticket) => ticket.slaBreached).length} tone="danger" />
        <MetricTile label="High Priority" value={triageCounts.high} tone="warning" />
        <MetricTile label="Unassigned" value={triageCounts.unassigned} tone="attention" />
        <MetricTile label="Waiting" value={triageCounts.waiting} />
        <MetricTile label="Stale 72h+" value={triageCounts.stale} tone="warning" />
      </div>

      <div className="grid min-h-[calc(100vh-154px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 border-r border-slate-300">
          <div className="sticky top-0 z-10 border-b border-slate-300 bg-white px-5 py-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search ticket, order, customer signal, category, or description"
                  className="h-9 border-slate-300 bg-white pl-9"
                />
              </div>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-9 w-full border-slate-300 bg-white lg:w-52">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {employees.filter((employee) => employee.userId).map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.userId)}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-9 w-full border-slate-300 bg-white lg:w-40">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoadingTickets ? (
            <div className="p-8 text-sm text-slate-500">Loading ticket command center...</div>
          ) : (
            <ScrollArea className="h-[calc(100vh-216px)]">
              <div className="grid min-w-[1120px] grid-cols-6 gap-3 p-5">
                {lanes.map((lane) => (
                  <section key={lane.key} className="min-w-0">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <lane.icon className="h-4 w-4 text-slate-500" />
                        <h2 className="text-sm font-semibold">{lane.title}</h2>
                      </div>
                      <Badge variant="outline" className="border-slate-300 bg-white text-slate-600">
                        {lane.tickets.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {lane.tickets.length === 0 ? (
                        <div className="rounded-md border border-dashed border-slate-300 bg-white/60 p-4 text-center text-xs text-slate-400">
                          Clear
                        </div>
                      ) : (
                        lane.tickets.map((ticket) => (
                          <TicketTile
                            key={`${lane.key}-${ticket.id}`}
                            ticket={ticket}
                            selected={selectedTicketId === ticket.id}
                            ownerName={getUserName(ticket.ownerUserId)}
                            assigneeNames={(ticket.assignedUserIds || []).map(getUserName)}
                            onClick={() => setSelectedTicketId(ticket.id)}
                          />
                        ))
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </ScrollArea>
          )}
        </main>

        <aside className="min-h-full bg-white">
          {!activeTicket ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-slate-500">
              <MessageSquare className="mb-3 h-10 w-10 text-slate-300" />
              <h2 className="text-base font-semibold text-slate-800">Select a ticket</h2>
              <p className="mt-1 text-sm">The detail panel keeps context visible while you triage the queue.</p>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-154px)]">
              <div className="space-y-5 p-5">
                <div>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <Badge className={cn('mb-2 border text-xs', getPriorityClass(activeTicket))}>
                        {activeTicket.slaBreached ? 'SLA breached' : priorityLabels[activeTicket.priority]}
                      </Badge>
                      <h2 className="text-lg font-semibold leading-tight">{activeTicket.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">{activeTicket.id}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/tickets?ticketId=${activeTicket.id}`)}>
                      Full view
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <InfoCell label="Age" value={formatDistanceToNow(new Date(activeTicket.createdAt), { addSuffix: false })} />
                    <InfoCell label="Last touch" value={formatDistanceToNow(new Date(activeTicket.lastActivityAt || activeTicket.updatedAt), { addSuffix: true })} />
                    <InfoCell label="Owner" value={getUserName(activeTicket.ownerUserId)} />
                    <InfoCell label="Next action" value={getNextAction(activeTicket)} strong />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Status</Label>
                    <Select
                      value={activeTicket.status}
                      onValueChange={(value) =>
                        updateTicketMutation.mutate({ id: activeTicket.id, data: { status: value as Ticket['status'] } })
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Priority</Label>
                    <Select
                      value={activeTicket.priority}
                      onValueChange={(value) =>
                        updateTicketMutation.mutate({ id: activeTicket.id, data: { priority: value as Ticket['priority'] } })
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(priorityLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-slate-500" />
                    Ownership
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Owner</span>
                      <span className="font-medium">{getUserName(activeTicket.ownerUserId)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Assigned</span>
                      <span className="text-right font-medium">
                        {(activeTicket.assignedUserIds || []).length
                          ? activeTicket.assignedUserIds.map(getUserName).join(', ')
                          : 'Unassigned'}
                      </span>
                    </div>
                  </div>
                </div>

                {activeTicket.description && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Summary</h3>
                    <p className="rounded-md border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
                      {activeTicket.description}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Link2 className="h-4 w-4 text-slate-500" />
                    Related Orders
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {ticketOrders.length ? (
                      ticketOrders.map((order) => (
                        <Button key={order.id} variant="outline" size="sm" onClick={() => navigate(`/order-entry?draft=${order.orderId}`)}>
                          {order.orderId}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      ))
                    ) : (
                      <span className="text-sm text-slate-400">No linked orders</span>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <Clock className="h-4 w-4 text-slate-500" />
                    Recent Timeline
                  </h3>
                  <div className="space-y-3">
                    {ticketActivity.length ? (
                      [...ticketActivity]
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .slice(0, 8)
                        .map((activity) => (
                          <div key={activity.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700">{getUserName(activity.createdBy)}</span>
                              <span className="text-xs text-slate-400">
                                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700">{activity.message || activity.activityType.replace(/_/g, ' ')}</p>
                          </div>
                        ))
                    ) : (
                      <div className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                        No recent activity
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </aside>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'danger' | 'warning' | 'attention';
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    danger: 'text-red-700',
    warning: 'text-amber-700',
    attention: 'text-blue-700',
  }[tone];

  return (
    <Card className="rounded-md border-slate-300 shadow-none">
      <CardContent className="p-3">
        <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
        <div className={cn('mt-1 text-2xl font-semibold', toneClass)}>{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="text-[11px] font-medium uppercase text-slate-500">{label}</div>
      <div className={cn('mt-1 truncate text-sm', strong ? 'font-semibold text-slate-950' : 'text-slate-700')}>{value}</div>
    </div>
  );
}

function TicketTile({
  ticket,
  selected,
  ownerName,
  assigneeNames,
  onClick,
}: {
  ticket: Ticket;
  selected: boolean;
  ownerName: string;
  assigneeNames: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border bg-white p-3 text-left shadow-sm transition hover:border-slate-400 hover:shadow',
        selected ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold leading-5">{ticket.title}</h3>
        {ticket.slaBreached && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />}
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        <Badge className={cn('border text-[11px]', getPriorityClass(ticket))}>{priorityLabels[ticket.priority]}</Badge>
        <Badge variant="outline" className="border-slate-300 bg-white text-[11px]">
          {statusLabels[ticket.status]}
        </Badge>
      </div>
      <div className="space-y-1 text-xs text-slate-500">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{ownerName}</span>
          </span>
          <span>{formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: false })}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{assigneeNames.length ? assigneeNames.join(', ') : 'Unassigned'}</span>
          <span className="font-medium text-slate-700">{getNextAction(ticket)}</span>
        </div>
      </div>
    </button>
  );
}

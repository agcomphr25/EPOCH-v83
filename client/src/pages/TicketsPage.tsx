import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Archive, 
  AlertTriangle, 
  Clock, 
  User, 
  Users,
  MessageSquare,
  Link2,
  X,
  Filter,
  Search,
  ChevronDown,
  Check,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'wouter';
import {
  getUserName as resolveUserName,
  filterAssignableEmployees,
  isAssigneeSelected,
  toggleAssignee,
} from '@/lib/ticketAssigneeHelpers';

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

const TICKET_STATUSES = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'waiting_on_customer', label: 'Waiting on Customer', color: 'bg-orange-100 text-orange-800' },
  { value: 'waiting_on_production', label: 'Waiting on Production', color: 'bg-purple-100 text-purple-800' },
  { value: 'resolved', label: 'Resolved', color: 'bg-green-100 text-green-800' },
  { value: 'closed', label: 'Closed', color: 'bg-gray-100 text-gray-800' },
];

const TICKET_PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-700' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'High', color: 'bg-red-100 text-red-700' },
];

const TICKET_TYPES = [
  { value: 'customer', label: 'Customer' },
  { value: 'internal', label: 'Internal' },
  { value: 'technical', label: 'Technical' },
];

const CATEGORIES = [
  'Order Status',
  'Complaint',
  'Return Request',
  'Technical Issue',
  'Billing',
  'Shipping',
  'Quality Issue',
  'Other',
];

type TicketQuickView = 'my_open' | 'unassigned' | 'sla_risk' | 'waiting' | 'all_open' | 'closed';

export default function TicketsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickView, setQuickView] = useState<TicketQuickView>('my_open');

  const urlParams = new URLSearchParams(window.location.search);
  const filterOrderId = urlParams.get('orderId') || '';
  const urlTicketId = urlParams.get('ticketId') || '';

  const [filters, setFilters] = useState({
    status: '',
    ticketType: '',
    priority: '',
    slaBreached: '',
    archived: 'false',
  });

  const [newTicket, setNewTicket] = useState({
    title: '',
    description: '',
    ticketType: 'customer' as 'customer' | 'internal' | 'technical',
    category: '',
    priority: 'normal' as 'low' | 'normal' | 'high',
    assignedUserIds: [] as number[],
  });
  const [newTicketOrderIds, setNewTicketOrderIds] = useState<string[]>([]);
  const [newTicketOrderInput, setNewTicketOrderInput] = useState('');

  const [newComment, setNewComment] = useState('');
  const [newOrderId, setNewOrderId] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.ticketType) params.append('ticketType', filters.ticketType);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.slaBreached) params.append('slaBreached', filters.slaBreached);
    params.append('archived', filters.archived);
    if (filterOrderId) params.append('orderId', filterOrderId);
    return params.toString();
  };

  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', filters, filterOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/tickets?${buildFilterParams()}`);
      if (!response.ok) throw new Error('Failed to fetch tickets');
      return response.json();
    },
  });

  const { data: metrics } = useQuery<TicketMetrics>({
    queryKey: ['/api/tickets/metrics'],
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
  });

  const { data: currentUserData } = useQuery<{ valid: boolean; user: { id: number; username: string; role: string; employeeId: number | null } }>({
    queryKey: ['/api/auth/validate'],
  });
  const currentUserId = currentUserData?.user?.id;

  const { data: selectedTicket, isLoading: isLoadingSelectedTicket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', selectedTicketId],
    enabled: !!selectedTicketId,
  });

  const { data: ticketActivity = [] } = useQuery<TicketActivity[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'activity'],
    enabled: !!selectedTicketId,
  });

  const { data: ticketOrders = [] } = useQuery<TicketOrder[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'orders'],
    enabled: !!selectedTicketId,
  });

  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  useEffect(() => {
    if (urlTicketId && !hasAutoSelected) {
      setSelectedTicketId(urlTicketId);
      setHasAutoSelected(true);
    }
  }, [urlTicketId, hasAutoSelected]);

  useEffect(() => {
    if (!urlTicketId && filterOrderId && tickets.length === 1 && !hasAutoSelected && !searchQuery) {
      setSelectedTicketId(tickets[0].id);
      setHasAutoSelected(true);
    }
  }, [filterOrderId, tickets, urlTicketId, hasAutoSelected, searchQuery]);

  const createTicketMutation = useMutation({
    mutationFn: async (data: typeof newTicket & { ownerUserId?: number | null }) => {
      const response = await apiRequest('/api/tickets', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: async (ticket: Ticket) => {
      if (newTicketOrderIds.length > 0) {
        for (const orderId of newTicketOrderIds) {
          try {
            await apiRequest(`/api/tickets/${ticket.id}/orders`, {
              method: 'POST',
              body: JSON.stringify({ orderId }),
            });
          } catch (err) {
            console.error('Failed to link order:', orderId, err);
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      setIsCreateDialogOpen(false);
      setNewTicket({
        title: '',
        description: '',
        ticketType: 'customer',
        category: '',
        priority: 'normal',
        assignedUserIds: [],
      });
      setNewTicketOrderIds([]);
      setNewTicketOrderInput('');
      toast({ title: 'Ticket created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create ticket', variant: 'destructive' });
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Ticket> }) => {
      return apiRequest(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', variables.id, 'activity'] });
      toast({ title: 'Ticket updated' });
    },
    onError: () => {
      toast({ title: 'Failed to update ticket', variant: 'destructive' });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      return apiRequest(`/api/tickets/${ticketId}/activity`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', selectedTicketId, 'activity'] });
      setNewComment('');
      toast({ title: 'Comment added' });
    },
  });

  const linkOrderMutation = useMutation({
    mutationFn: async ({ ticketId, orderId }: { ticketId: string; orderId: string }) => {
      return apiRequest(`/api/tickets/${ticketId}/orders`, {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', selectedTicketId, 'orders'] });
      setNewOrderId('');
      toast({ title: 'Order linked' });
    },
  });

  const unlinkOrderMutation = useMutation({
    mutationFn: async ({ ticketId, orderId }: { ticketId: string; orderId: string }) => {
      return apiRequest(`/api/tickets/${ticketId}/orders/${orderId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', selectedTicketId, 'orders'] });
      toast({ title: 'Order unlinked' });
    },
  });

  const archiveTicketMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      return apiRequest(`/api/tickets/${ticketId}/archive`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      setSelectedTicketId(null);
      toast({ title: 'Ticket archived' });
    },
  });

  const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const waitingStatuses = new Set(['waiting_on_customer', 'waiting_on_production']);
  const isOpenTicket = (ticket: Ticket) => ticket.status !== 'closed';
  const isAssignedToCurrentUser = (ticket: Ticket) =>
    currentUserId != null && (
      ticket.ownerUserId === currentUserId ||
      (ticket.assignedUserIds ?? []).includes(currentUserId)
    );
  const ticketAgeMs = (ticket: Ticket) =>
    Date.now() - new Date(ticket.lastActivityAt ?? ticket.createdAt).getTime();
  const formatTicketAge = (ticket: Ticket) => {
    const sourceDate = ticket.lastActivityAt ?? ticket.createdAt;
    return formatDistanceToNow(new Date(sourceDate), { addSuffix: true });
  };

  const ticketCounts = {
    myOpen: tickets.filter(ticket => isOpenTicket(ticket) && isAssignedToCurrentUser(ticket)).length,
    unassigned: tickets.filter(ticket => isOpenTicket(ticket) && (ticket.assignedUserIds?.length ?? 0) === 0).length,
    slaRisk: tickets.filter(ticket => isOpenTicket(ticket) && ticket.slaBreached).length,
    waiting: tickets.filter(ticket => isOpenTicket(ticket) && waitingStatuses.has(ticket.status)).length,
    allOpen: tickets.filter(isOpenTicket).length,
    closed: tickets.filter(ticket => ticket.status === 'closed').length,
    highPriority: tickets.filter(ticket => isOpenTicket(ticket) && ticket.priority === 'high').length,
  };

  const handleQuickViewChange = (view: TicketQuickView) => {
    setQuickView(view);
    setFilters(prev => ({ ...prev, status: '', slaBreached: '' }));
  };

  const quickViews: Array<{ value: TicketQuickView; label: string; count: number }> = [
    { value: 'my_open', label: 'My Open', count: ticketCounts.myOpen },
    { value: 'unassigned', label: 'Unassigned', count: ticketCounts.unassigned },
    { value: 'sla_risk', label: 'SLA Risk', count: ticketCounts.slaRisk },
    { value: 'waiting', label: 'Waiting', count: ticketCounts.waiting },
    { value: 'all_open', label: 'All Open', count: ticketCounts.allOpen },
    { value: 'closed', label: 'Closed', count: ticketCounts.closed },
  ];

  const filteredTickets = tickets.filter(ticket => {
    if (quickView === 'my_open' && (!isOpenTicket(ticket) || !isAssignedToCurrentUser(ticket))) return false;
    if (quickView === 'unassigned' && (!isOpenTicket(ticket) || (ticket.assignedUserIds?.length ?? 0) > 0)) return false;
    if (quickView === 'sla_risk' && (!isOpenTicket(ticket) || !ticket.slaBreached)) return false;
    if (quickView === 'waiting' && (!isOpenTicket(ticket) || !waitingStatuses.has(ticket.status))) return false;
    if (quickView === 'all_open' && !isOpenTicket(ticket)) return false;
    if (quickView === 'closed' && ticket.status !== 'closed') return false;
    if (!filters.status && quickView !== 'closed' && ticket.status === 'closed') return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ticket.title.toLowerCase().includes(q) ||
      ticket.id.toLowerCase().includes(q) ||
      (ticket.description?.toLowerCase().includes(q) ?? false)
    );
  }).sort((a, b) => {
    if (a.slaBreached !== b.slaBreached) return a.slaBreached ? -1 : 1;
    const priorityDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (priorityDiff !== 0) return priorityDiff;
    return ticketAgeMs(b) - ticketAgeMs(a);
  });

  const getStatusBadge = (status: string) => {
    const s = TICKET_STATUSES.find(st => st.value === status);
    return s ? <Badge className={cn(s.color, 'text-xs')}>{s.label}</Badge> : null;
  };

  const getPriorityBadge = (priority: string) => {
    const p = TICKET_PRIORITIES.find(pr => pr.value === priority);
    return p ? <Badge className={cn(p.color, 'text-xs')}>{p.label}</Badge> : null;
  };

  const getUserName = (userId: number) => resolveUserName(userId, employees);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Tickets</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Internal CSR ticketing system</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-ticket">
              <Plus className="h-4 w-4 mr-2" />
              New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col overflow-hidden">
            <DialogHeader className="shrink-0">
              <DialogTitle>Create New Ticket</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 pr-1">
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  placeholder="Brief description of the issue"
                  data-testid="input-ticket-title"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select
                    value={newTicket.ticketType}
                    onValueChange={(v) => setNewTicket({ ...newTicket, ticketType: v as 'customer' | 'internal' | 'technical' })}
                  >
                    <SelectTrigger data-testid="select-ticket-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Priority</Label>
                  <Select
                    value={newTicket.priority}
                    onValueChange={(v) => setNewTicket({ ...newTicket, priority: v as 'low' | 'normal' | 'high' })}
                  >
                    <SelectTrigger data-testid="select-ticket-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_PRIORITIES.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={newTicket.category}
                  onValueChange={(v) => setNewTicket({ ...newTicket, category: v })}
                >
                  <SelectTrigger data-testid="select-ticket-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  placeholder="Detailed description of the issue..."
                  rows={4}
                  data-testid="input-ticket-description"
                />
              </div>
              <div className="grid gap-2">
                <Label>Owner (Created By)</Label>
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted text-sm">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium">
                    {(() => {
                      const empId = currentUserData?.user?.employeeId;
                      if (empId) {
                        const emp = employees.find(e => e.id === empId);
                        if (emp) return emp.name;
                      }
                      return currentUserId ? getUserName(currentUserId) : 'You';
                    })()}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">Auto-assigned</span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Assigned To</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      data-testid="select-ticket-assigned"
                    >
                      {newTicket.assignedUserIds.length === 0 
                        ? 'Select assignees...' 
                        : `${newTicket.assignedUserIds.length} selected`}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <ScrollArea className="h-64">
                      <div className="p-2 space-y-1">
                        {filterAssignableEmployees(employees).map(emp => {
                          const isSelected = isAssigneeSelected(emp, newTicket.assignedUserIds);
                          return (
                            <div 
                              key={emp.id} 
                              className={cn(
                                "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
                                isSelected && "bg-blue-50 dark:bg-blue-900/20"
                              )}
                              onClick={() => {
                                setNewTicket({
                                  ...newTicket,
                                  assignedUserIds: toggleAssignee(emp, newTicket.assignedUserIds),
                                });
                              }}
                            >
                              <Checkbox checked={isSelected} />
                              <span className="text-sm">{emp.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                {newTicket.assignedUserIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {newTicket.assignedUserIds.map(userId => {
                      return (
                        <Badge key={userId} variant="secondary" className="text-xs flex items-center gap-1">
                          {getUserName(userId)}
                          <button
                            type="button"
                            onClick={() => setNewTicket({
                              ...newTicket,
                              assignedUserIds: newTicket.assignedUserIds.filter(id => id !== userId)
                            })}
                            className="ml-1 hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid gap-2">
                <Label className="text-xs text-gray-500 flex items-center gap-2">
                  <Link2 className="h-3 w-3" />
                  Link Orders ({newTicketOrderIds.length})
                </Label>
                <div className="flex flex-wrap gap-2">
                  {newTicketOrderIds.map(orderId => (
                    <Badge key={orderId} variant="outline" className="flex items-center gap-1">
                      {orderId}
                      <button
                        type="button"
                        onClick={() => setNewTicketOrderIds(newTicketOrderIds.filter(id => id !== orderId))}
                        className="ml-1 hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="Order ID..."
                      value={newTicketOrderInput}
                      onChange={(e) => setNewTicketOrderInput(e.target.value)}
                      className="h-6 w-24 text-xs"
                      data-testid="input-link-order-create"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const orderId = newTicketOrderInput.trim().toUpperCase();
                          if (orderId && !newTicketOrderIds.includes(orderId)) {
                            setNewTicketOrderIds([...newTicketOrderIds, orderId]);
                            setNewTicketOrderInput('');
                          }
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2"
                      onClick={() => {
                        const orderId = newTicketOrderInput.trim().toUpperCase();
                        if (orderId && !newTicketOrderIds.includes(orderId)) {
                          setNewTicketOrderIds([...newTicketOrderIds, orderId]);
                          setNewTicketOrderInput('');
                        }
                      }}
                      disabled={!newTicketOrderInput.trim()}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            </div>
            <DialogFooter className="shrink-0 pt-2">
              <Button
                onClick={() => createTicketMutation.mutate({ ...newTicket, ownerUserId: currentUserId })}
                disabled={!newTicket.title || createTicketMutation.isPending}
                data-testid="button-submit-ticket"
              >
                {createTicketMutation.isPending ? 'Creating...' : 'Create Ticket'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {metrics && (
        <div className="grid grid-cols-2 gap-3 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => handleQuickViewChange('sla_risk')}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-colors hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20',
              quickView === 'sla_risk' && 'border-red-300 bg-red-50 dark:bg-red-950/20'
            )}
          >
            <div className="flex items-center gap-2 text-xs text-gray-500">
              SLA Breached
              {metrics.slaBreached > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
            </div>
            <div className={cn('text-2xl font-bold', metrics.slaBreached > 0 ? 'text-red-600' : 'text-gray-600')}>
              {metrics.slaBreached}
            </div>
          </button>
          <button
            type="button"
            onClick={() => setFilters({ ...filters, priority: filters.priority === 'high' ? '' : 'high' })}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-colors hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/20',
              filters.priority === 'high' && 'border-red-300 bg-red-50 dark:bg-red-950/20'
            )}
          >
            <div className="text-xs text-gray-500">High Priority</div>
            <div className="text-2xl font-bold text-red-600">{ticketCounts.highPriority}</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickViewChange('unassigned')}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/20',
              quickView === 'unassigned' && 'border-blue-300 bg-blue-50 dark:bg-blue-950/20'
            )}
          >
            <div className="text-xs text-gray-500">Unassigned</div>
            <div className="text-2xl font-bold text-blue-600">{ticketCounts.unassigned}</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickViewChange('waiting')}
            className={cn(
              'rounded-lg border bg-card p-3 text-left transition-colors hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/20',
              quickView === 'waiting' && 'border-purple-300 bg-purple-50 dark:bg-purple-950/20'
            )}
          >
            <div className="text-xs text-gray-500">Waiting</div>
            <div className="text-2xl font-bold text-purple-600">{ticketCounts.waiting}</div>
          </button>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4 space-y-3 border-b border-gray-200 dark:border-gray-700">
            {filterOrderId && (
              <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded px-3 py-2 text-sm">
                <span>Showing tickets for order: <strong>{filterOrderId}</strong></span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                  onClick={() => navigate('/tickets')}
                  title="Clear order filter"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-tickets"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {quickViews.map(view => (
                <button
                  key={view.value}
                  type="button"
                  onClick={() => handleQuickViewChange(view.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    quickView === view.value
                      ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  )}
                >
                  {view.label}
                  <span className="ml-1 tabular-nums text-gray-400">{view.count}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters({ ...filters, status: v === 'all' ? '' : v })}
              >
                <SelectTrigger className="w-[130px] h-8 text-xs" data-testid="filter-status">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {TICKET_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.priority}
                onValueChange={(v) => setFilters({ ...filters, priority: v === 'all' ? '' : v })}
              >
                <SelectTrigger className="w-[110px] h-8 text-xs" data-testid="filter-priority">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  {TICKET_PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filters.slaBreached}
                onValueChange={(v) => setFilters({ ...filters, slaBreached: v === 'all' ? '' : v })}
              >
                <SelectTrigger className="w-[100px] h-8 text-xs" data-testid="filter-sla">
                  <SelectValue placeholder="SLA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="true">Breached</SelectItem>
                  <SelectItem value="false">OK</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {isLoadingTickets ? (
              <div className="p-4 text-center text-gray-500">Loading tickets...</div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No tickets found</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredTickets.map(ticket => (
                  <div
                    key={ticket.id}
                    className={cn(
                      'p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                      selectedTicketId === ticket.id && 'bg-blue-50 dark:bg-blue-900/20'
                    )}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    data-testid={`ticket-item-${ticket.id}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
                        {ticket.title}
                      </h3>
                      {ticket.slaBreached && (
                        <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(ticket.status)}
                      {getPriorityBadge(ticket.priority)}
                      <Badge variant="outline" className="text-xs">
                        {ticket.ticketType}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {getUserName(ticket.ownerUserId)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                      <span>
                        {ticket.lastActivityAt ? 'Last activity' : 'Created'} {formatTicketAge(ticket)}
                      </span>
                      {ticket.slaDueAt && (
                        <span className={cn('font-medium', ticket.slaBreached ? 'text-red-600' : 'text-gray-500')}>
                          SLA {ticket.slaBreached ? 'breached' : formatDistanceToNow(new Date(ticket.slaDueAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    {ticket.assignedUserIds && ticket.assignedUserIds.length > 0 && (
                      <div className="flex items-center gap-1 mt-2 flex-wrap">
                        <Users className="h-3 w-3 text-gray-400" />
                        {ticket.assignedUserIds.map((userId) => (
                          <Badge key={userId} variant="secondary" className="text-xs py-0 px-1.5">
                            {getUserName(userId)}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex-1 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          {!selectedTicketId ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              Select a ticket to view details
            </div>
          ) : isLoadingSelectedTicket ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              Loading ticket...
            </div>
          ) : selectedTicket ? (
            <div className="h-full flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
              <div className="p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 mr-4">
                    {isEditingTitle ? (
                      <div className="flex items-center gap-2 mb-2">
                        <Input
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="text-xl font-semibold"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editedTitle.trim()) {
                              updateTicketMutation.mutate({ 
                                id: selectedTicket.id, 
                                data: { title: editedTitle.trim() } 
                              });
                              setIsEditingTitle(false);
                            } else if (e.key === 'Escape') {
                              setIsEditingTitle(false);
                              setEditedTitle(selectedTicket.title);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (editedTitle.trim()) {
                              updateTicketMutation.mutate({ 
                                id: selectedTicket.id, 
                                data: { title: editedTitle.trim() } 
                              });
                              setIsEditingTitle(false);
                            }
                          }}
                          disabled={!editedTitle.trim() || updateTicketMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setIsEditingTitle(false);
                            setEditedTitle(selectedTicket.title);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div 
                        className="flex items-center gap-2 group cursor-pointer mb-2"
                        onClick={() => {
                          setEditedTitle(selectedTicket.title);
                          setIsEditingTitle(true);
                        }}
                      >
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                          {selectedTicket.title}
                        </h2>
                        <Pencil className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getStatusBadge(selectedTicket.status)}
                      {getPriorityBadge(selectedTicket.priority)}
                      <Badge variant="outline">{selectedTicket.ticketType}</Badge>
                      {selectedTicket.category && (
                        <Badge variant="secondary">{selectedTicket.category}</Badge>
                      )}
                      {ticketOrders.length > 0 && ticketOrders.map(to => (
                        <Badge 
                          key={to.id} 
                          className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300 cursor-pointer hover:bg-indigo-200 dark:hover:bg-indigo-900/50"
                          onClick={() => navigate(`/order-entry?draft=${to.orderId}`)}
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          {to.orderId}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => archiveTicketMutation.mutate(selectedTicket.id)}
                    disabled={archiveTicketMutation.isPending}
                    data-testid="button-archive-ticket"
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    Archive
                  </Button>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4 lg:order-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ticket Controls</h3>
                      {selectedTicket.slaBreached && (
                        <Badge className="bg-red-100 text-red-700">SLA breached</Badge>
                      )}
                    </div>
                  <div>
                    <Label className="text-xs text-gray-500">Status</Label>
                    <Select
                      value={selectedTicket.status}
                      onValueChange={(v) => updateTicketMutation.mutate({ id: selectedTicket.id, data: { status: v as any } })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-update-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_STATUSES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Priority</Label>
                    <Select
                      value={selectedTicket.priority}
                      onValueChange={(v) => updateTicketMutation.mutate({ id: selectedTicket.id, data: { priority: v as any } })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-update-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TICKET_PRIORITIES.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Owner (Created By)</Label>
                    <Select
                      value={String(selectedTicket.ownerUserId)}
                      onValueChange={(v) => updateTicketMutation.mutate({ id: selectedTicket.id, data: { ownerUserId: parseInt(v) } })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-update-owner">
                        <SelectValue>{getUserName(selectedTicket.ownerUserId)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {filterAssignableEmployees(employees).map(emp => (
                          <SelectItem key={emp.id} value={String(emp.userId)}>
                            {emp.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Assigned To</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className="w-full justify-between mt-1 h-9 text-sm"
                          data-testid="select-update-assignee"
                        >
                          {(selectedTicket.assignedUserIds?.length || 0) === 0 
                            ? 'Unassigned' 
                            : `${selectedTicket.assignedUserIds?.length} assigned`}
                          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-0" align="start">
                        <ScrollArea className="h-64">
                          <div className="p-2 space-y-1">
                            {filterAssignableEmployees(employees).map(emp => {
                              const currentIds = selectedTicket.assignedUserIds || [];
                              const isSelected = isAssigneeSelected(emp, currentIds);
                              return (
                                <div 
                                  key={emp.id} 
                                  className={cn(
                                    "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800",
                                    isSelected && "bg-blue-50 dark:bg-blue-900/20"
                                  )}
                                  onClick={() => {
                                    updateTicketMutation.mutate({ 
                                      id: selectedTicket.id, 
                                      data: { assignedUserIds: toggleAssignee(emp, currentIds) } 
                                    });
                                  }}
                                >
                                  <Checkbox checked={isSelected} />
                                  <span className="text-sm">{emp.name}</span>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                    {(selectedTicket.assignedUserIds?.length || 0) > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedTicket.assignedUserIds?.map(userId => {
                          return (
                            <Badge key={userId} variant="secondary" className="text-xs flex items-center gap-1">
                              {getUserName(userId)}
                              <button
                                type="button"
                                onClick={() => {
                                  const newIds = (selectedTicket.assignedUserIds || []).filter(id => id !== userId);
                                  updateTicketMutation.mutate({ 
                                    id: selectedTicket.id, 
                                    data: { assignedUserIds: newIds } 
                                  });
                                }}
                                className="ml-1 hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                  <div className="space-y-4 lg:order-1">
                    {selectedTicket.description && (
                      <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                        <Label className="text-xs text-gray-500">Description</Label>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {selectedTicket.description}
                        </p>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs text-gray-500 flex items-center gap-2">
                        <Link2 className="h-3 w-3" />
                        Linked Orders ({ticketOrders.length})
                      </Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                    {ticketOrders.map(to => (
                      <Badge key={to.id} variant="outline" className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/order-entry?draft=${to.orderId}`)}
                          className="hover:underline hover:text-blue-600 cursor-pointer"
                        >
                          {to.orderId}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            unlinkOrderMutation.mutate({ ticketId: selectedTicket.id, orderId: to.orderId });
                          }}
                          className="ml-1 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder="Order ID..."
                        value={newOrderId}
                        onChange={(e) => setNewOrderId(e.target.value)}
                        className="h-6 w-24 text-xs"
                        data-testid="input-link-order"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => newOrderId && linkOrderMutation.mutate({ ticketId: selectedTicket.id, orderId: newOrderId })}
                        disabled={!newOrderId || linkOrderMutation.isPending}
                        data-testid="button-link-order"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-white dark:bg-gray-800">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Notes & Activity
                </h3>
                <div className="space-y-4">
                  {ticketActivity.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">No notes yet. Add a note below.</p>
                  ) : (
                    [...ticketActivity].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(activity => {
                      const isComment = activity.activityType === 'comment';
                      return (
                        <div
                          key={activity.id}
                          className={cn(
                            'flex gap-3 rounded-lg',
                            isComment
                              ? 'p-3 bg-gray-50 dark:bg-gray-900'
                              : 'px-3 py-2 border border-dashed border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40'
                          )}
                        >
                          <div className={cn(
                            'flex-shrink-0 rounded-full flex items-center justify-center',
                            isComment ? 'w-8 h-8 bg-gray-200 dark:bg-gray-700' : 'w-6 h-6 bg-blue-50 dark:bg-blue-950/40'
                          )}>
                            {isComment ? (
                              <User className="h-4 w-4 text-gray-500" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-blue-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {getUserName(activity.createdBy)}
                              </span>
                              {!isComment && (
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px] capitalize">
                                  {activity.activityType.replace(/_/g, ' ')}
                                </Badge>
                              )}
                              <span className="text-xs text-gray-500">
                                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                            <div className={cn('text-sm whitespace-pre-wrap', isComment ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-400')}>
                              {activity.message || `${activity.previousValue ?? 'None'} -> ${activity.newValue ?? 'None'}`}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              </ScrollArea>

              <div className="p-4 bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                <Label className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  Add Note
                </Label>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Type your note here..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                    className="resize-none bg-white dark:bg-gray-800"
                    data-testid="input-new-comment"
                  />
                  <Button
                    onClick={() => newComment && addCommentMutation.mutate({ ticketId: selectedTicket.id, message: newComment })}
                    disabled={!newComment || addCommentMutation.isPending}
                    data-testid="button-add-comment"
                    className="self-end"
                  >
                    {addCommentMutation.isPending ? 'Saving...' : 'Add Note'}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

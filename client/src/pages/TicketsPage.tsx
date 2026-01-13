import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Archive, 
  AlertTriangle, 
  Clock, 
  User, 
  MessageSquare,
  Link2,
  X,
  Filter,
  Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useLocation } from 'wouter';

interface Ticket {
  id: string;
  ticketType: 'customer' | 'internal';
  category: string | null;
  priority: 'low' | 'normal' | 'high';
  status: 'new' | 'in_progress' | 'waiting_on_customer' | 'waiting_on_production' | 'resolved' | 'closed';
  title: string;
  description: string | null;
  customerId: number | null;
  ownerUserId: number;
  assignedUserId: number | null;
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

interface User {
  id: number;
  username: string;
  firstName?: string;
  lastName?: string;
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

export default function TicketsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
    ticketType: 'customer' as 'customer' | 'internal',
    category: '',
    priority: 'normal' as 'low' | 'normal' | 'high',
    assignedUserId: null as number | null,
  });
  const [newTicketOrderIds, setNewTicketOrderIds] = useState<string[]>([]);
  const [newTicketOrderInput, setNewTicketOrderInput] = useState('');

  const [newComment, setNewComment] = useState('');
  const [newOrderId, setNewOrderId] = useState('');

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.ticketType) params.append('ticketType', filters.ticketType);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.slaBreached) params.append('slaBreached', filters.slaBreached);
    params.append('archived', filters.archived);
    return params.toString();
  };

  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', filters],
    queryFn: async () => {
      const response = await fetch(`/api/tickets?${buildFilterParams()}`);
      if (!response.ok) throw new Error('Failed to fetch tickets');
      return response.json();
    },
  });

  const { data: metrics } = useQuery<TicketMetrics>({
    queryKey: ['/api/tickets/metrics'],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });

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

  const createTicketMutation = useMutation({
    mutationFn: async (data: typeof newTicket) => {
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
        assignedUserId: null,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
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

  const filteredTickets = tickets.filter(ticket => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      ticket.title.toLowerCase().includes(q) ||
      ticket.id.toLowerCase().includes(q) ||
      (ticket.description?.toLowerCase().includes(q) ?? false)
    );
  });

  const getStatusBadge = (status: string) => {
    const s = TICKET_STATUSES.find(st => st.value === status);
    return s ? <Badge className={cn(s.color, 'text-xs')}>{s.label}</Badge> : null;
  };

  const getPriorityBadge = (priority: string) => {
    const p = TICKET_PRIORITIES.find(pr => pr.value === priority);
    return p ? <Badge className={cn(p.color, 'text-xs')}>{p.label}</Badge> : null;
  };

  const getUserName = (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return `User ${userId}`;
    return user.firstName && user.lastName 
      ? `${user.firstName} ${user.lastName}` 
      : user.username;
  };

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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Ticket</DialogTitle>
            </DialogHeader>
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
                    onValueChange={(v) => setNewTicket({ ...newTicket, ticketType: v as 'customer' | 'internal' })}
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
                <Label>Assigned To</Label>
                <Select
                  value={newTicket.assignedUserId?.toString() || 'unassigned'}
                  onValueChange={(v) => setNewTicket({ ...newTicket, assignedUserId: v === 'unassigned' ? null : parseInt(v) })}
                >
                  <SelectTrigger data-testid="select-ticket-assigned">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <DialogFooter>
              <Button
                onClick={() => createTicketMutation.mutate(newTicket)}
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
        <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <Card className="p-3">
            <div className="text-xs text-gray-500">Total Open</div>
            <div className="text-2xl font-bold">{metrics.totalOpen}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-gray-500">&lt; 24h</div>
            <div className="text-2xl font-bold text-green-600">{metrics.openByAge.under24h}</div>
          </Card>
          <Card className="p-3">
            <div className="text-xs text-gray-500">24-48h</div>
            <div className="text-2xl font-bold text-yellow-600">{metrics.openByAge.under48h}</div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <div className="text-xs text-gray-500">SLA Breached</div>
              {metrics.slaBreached > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
            </div>
            <div className={cn('text-2xl font-bold', metrics.slaBreached > 0 ? 'text-red-600' : 'text-gray-600')}>
              {metrics.slaBreached}
            </div>
          </Card>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="w-96 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col">
          <div className="p-4 space-y-3 border-b border-gray-200 dark:border-gray-700">
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
            <div className="h-full flex flex-col">
              <div className="p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {selectedTicket.title}
                    </h2>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(selectedTicket.status)}
                      {getPriorityBadge(selectedTicket.priority)}
                      <Badge variant="outline">{selectedTicket.ticketType}</Badge>
                      {selectedTicket.category && (
                        <Badge variant="secondary">{selectedTicket.category}</Badge>
                      )}
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

                <div className="grid grid-cols-2 gap-4">
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
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map(u => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Assigned To</Label>
                    <Select
                      value={selectedTicket.assignedUserId ? String(selectedTicket.assignedUserId) : 'unassigned'}
                      onValueChange={(v) => updateTicketMutation.mutate({ 
                        id: selectedTicket.id, 
                        data: { assignedUserId: v === 'unassigned' ? null : parseInt(v) } 
                      })}
                    >
                      <SelectTrigger className="mt-1" data-testid="select-update-assignee">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {users.map(u => (
                          <SelectItem key={u.id} value={String(u.id)}>
                            {u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.username}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedTicket.description && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <Label className="text-xs text-gray-500">Description</Label>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {selectedTicket.description}
                    </p>
                  </div>
                )}

                <div className="mt-4">
                  <Label className="text-xs text-gray-500 flex items-center gap-2">
                    <Link2 className="h-3 w-3" />
                    Linked Orders ({ticketOrders.length})
                  </Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ticketOrders.map(to => (
                      <Badge key={to.id} variant="outline" className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(`/order-entry/${to.orderId}`)}
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

              <ScrollArea className="flex-1 p-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Activity
                </h3>
                <div className="space-y-4">
                  {ticketActivity.map(activity => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {getUserName(activity.createdBy)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {activity.message}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={2}
                    className="resize-none"
                    data-testid="input-new-comment"
                  />
                  <Button
                    onClick={() => newComment && addCommentMutation.mutate({ ticketId: selectedTicket.id, message: newComment })}
                    disabled={!newComment || addCommentMutation.isPending}
                    data-testid="button-add-comment"
                  >
                    Send
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

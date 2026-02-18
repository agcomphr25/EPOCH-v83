import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface WeeklyOrder {
  orderId: string;
  model: string | null;
  actualDepartment: string | null;
  expectedDepartment: string;
  estimatedShipDate: string;
  status: 'on_track' | 'late';
  isVerified: boolean;
  verificationNotes: string | null;
  verifiedBy: number | null;
  verifiedAt: string | null;
}

interface WeeklyResponse {
  weekStart: string;
  weekEnd: string;
  orders: WeeklyOrder[];
}

export default function WeeklyProductionForecast() {
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => formatDate(getMonday(new Date())));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data, isLoading, error } = useQuery<WeeklyResponse>({
    queryKey: ['/api/forecast/weekly', weekStart],
    queryFn: async () => {
      const res = await fetch(`/api/forecast/weekly?weekStart=${weekStart}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch weekly forecast');
      return res.json();
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ orderId, department, verify }: { orderId: string; department: string; verify: boolean }) => {
      if (verify) {
        await apiRequest('POST', '/api/forecast/verify', {
          orderId,
          department,
          weekStartDate: weekStart,
        });
      } else {
        await apiRequest('DELETE', '/api/forecast/verify', {
          orderId,
          department,
          weekStartDate: weekStart,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/forecast/weekly', weekStart] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update verification', variant: 'destructive' });
    },
  });

  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    return data.orders.filter(order => {
      const matchesSearch = !searchTerm ||
        order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.model && order.model.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data?.orders, searchTerm, statusFilter]);

  const navigateWeek = (direction: number) => {
    const current = new Date(weekStart + 'T00:00:00');
    current.setDate(current.getDate() + direction * 7);
    setWeekStart(formatDate(current));
  };

  const goToThisWeek = () => {
    setWeekStart(formatDate(getMonday(new Date())));
  };

  const statusCounts = useMemo(() => {
    if (!data?.orders) return { on_track: 0, late: 0, verified: 0, total: 0 };
    return {
      on_track: data.orders.filter(o => o.status === 'on_track').length,
      late: data.orders.filter(o => o.status === 'late').length,
      verified: data.orders.filter(o => o.isVerified).length,
      total: data.orders.length,
    };
  }, [data?.orders]);

  const statusBadge = (status: string) => {
    switch (status) {
      case 'on_track':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">On Track</Badge>;
      case 'late':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Late</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Weekly Production Forecast
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            View and verify production forecasts by week
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => navigateWeek(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center min-w-[200px]">
              <div className="font-semibold">
                {data ? `${formatDisplayDate(data.weekStart)} - ${formatDisplayDate(data.weekEnd)}` : formatDisplayDate(weekStart)}
              </div>
              <div className="text-xs text-muted-foreground">Week of {weekStart}</div>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateWeek(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToThisWeek}>
              This Week
            </Button>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="all">All Status</option>
                <option value="on_track">On Track</option>
                <option value="late">Late</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold">{statusCounts.total}</div>
            <div className="text-xs text-muted-foreground">Total Orders</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-green-600">{statusCounts.on_track}</div>
            <div className="text-xs text-muted-foreground">On Track</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-red-600">{statusCounts.late}</div>
            <div className="text-xs text-muted-foreground">Late</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{statusCounts.verified}</div>
            <div className="text-xs text-muted-foreground">Verified</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Forecast Orders ({filteredOrders.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading weekly forecast...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-red-500">
              Failed to load forecast data. Please try again.
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No orders found for this week.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Actual Dept</TableHead>
                    <TableHead>Expected Dept</TableHead>
                    <TableHead>Est. Ship</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow
                      key={`${order.orderId}-${order.actualDepartment}`}
                      className={order.isVerified ? 'bg-green-50 dark:bg-green-950/20' : ''}
                    >
                      <TableCell className="font-medium">{order.orderId}</TableCell>
                      <TableCell>{order.model || '—'}</TableCell>
                      <TableCell>{order.actualDepartment || '—'}</TableCell>
                      <TableCell>{order.expectedDepartment}</TableCell>
                      <TableCell>{formatDisplayDate(order.estimatedShipDate)}</TableCell>
                      <TableCell>{statusBadge(order.status)}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={order.isVerified}
                          disabled={verifyMutation.isPending}
                          onCheckedChange={(checked) => {
                            verifyMutation.mutate({
                              orderId: order.orderId,
                              department: order.actualDepartment || '',
                              verify: !!checked,
                            });
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

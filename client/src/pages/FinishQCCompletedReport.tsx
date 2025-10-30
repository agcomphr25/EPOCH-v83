import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  FileBarChart, 
  Download,
  Users,
  CheckCircle,
  Calendar,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, addDays, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { getDisplayOrderId } from '@/lib/orderUtils';
import { toast } from 'react-hot-toast';

interface ReportOrder {
  orderId: string;
  customerPO: string;
  fbOrderNumber: string;
  modelId: string;
  currentDepartment: string;
  completedAt: string;
  progressedBy: string;
  progressionDate: string;
  dueDate: string;
  orderDate: string;
}

interface ReportData {
  startDate: string;
  endDate: string;
  totalOrders: number;
  byTechnician: Record<string, ReportOrder[]>;
  allTechnicians: string[];
}

// Helper to get start of week (Monday)
const getWeekStart = (date: Date) => {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
  return start;
};

// Helper to get end of week (Sunday)
const getWeekEnd = (date: Date) => {
  const end = endOfWeek(date, { weekStartsOn: 1 }); // 1 = Monday
  return end;
};

export default function FinishQCCompletedReport() {
  const [expandedTechnicians, setExpandedTechnicians] = useState<Set<string>>(new Set());
  
  // Initialize with last week's dates
  const initialWeekStart = getWeekStart(subDays(new Date(), 7));
  const initialWeekEnd = getWeekEnd(subDays(new Date(), 7));
  
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weekEnd, setWeekEnd] = useState(initialWeekEnd);

  const { data, isLoading, error, refetch } = useQuery<ReportData>({
    queryKey: ['/api/reports/finish-qc-completed', weekStart.toISOString(), weekEnd.toISOString()],
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/finish-qc-completed?startDate=${weekStart.toISOString()}&endDate=${weekEnd.toISOString()}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch report');
      return res.json();
    },
  });

  const goToPreviousWeek = () => {
    const newStart = subDays(weekStart, 7);
    const newEnd = subDays(weekEnd, 7);
    setWeekStart(newStart);
    setWeekEnd(newEnd);
  };

  const goToNextWeek = () => {
    const newStart = addDays(weekStart, 7);
    const newEnd = addDays(weekEnd, 7);
    setWeekStart(newStart);
    setWeekEnd(newEnd);
  };

  const goToCurrentWeek = () => {
    const now = new Date();
    setWeekStart(getWeekStart(now));
    setWeekEnd(getWeekEnd(now));
  };

  const toggleTechnician = (technician: string) => {
    const newExpanded = new Set(expandedTechnicians);
    if (newExpanded.has(technician)) {
      newExpanded.delete(technician);
    } else {
      newExpanded.add(technician);
    }
    setExpandedTechnicians(newExpanded);
  };

  const expandAll = () => {
    if (data) {
      setExpandedTechnicians(new Set(Object.keys(data.byTechnician)));
    }
  };

  const collapseAll = () => {
    setExpandedTechnicians(new Set());
  };

  const exportToCSV = () => {
    if (!data) return;

    const rows: string[][] = [
      ['Technician', 'Order ID', 'FB Number', 'Customer PO', 'Model', 'Completed At', 'Progressed By', 'Current Department', 'Due Date'],
    ];

    Object.entries(data.byTechnician).forEach(([technician, orders]) => {
      orders.forEach(order => {
        rows.push([
          technician,
          order.orderId,
          order.fbOrderNumber || '',
          order.customerPO || '',
          order.modelId || '',
          format(new Date(order.completedAt), 'MM/dd/yyyy HH:mm'),
          order.progressedBy,
          order.currentDepartment,
          order.dueDate ? format(new Date(order.dueDate), 'MM/dd/yyyy') : '',
        ]);
      });
    });

    const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const weekLabel = `${format(weekStart, 'yyyy-MM-dd')}_to_${format(weekEnd, 'yyyy-MM-dd')}`;
    a.download = `finish-qc-completed-${weekLabel}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported to CSV');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Loading report...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-8 text-center text-red-600">
            <p>Error loading report: {(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const technicians = Object.keys(data.byTechnician).sort();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileBarChart className="h-8 w-8 text-blue-600" />
            Finish QC Completed Orders Report
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Orders completed in Finish QC from {format(weekStart, 'MMM dd, yyyy')} to {format(weekEnd, 'MMM dd, yyyy')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetch()}
            variant="outline"
            data-testid="button-refresh"
          >
            Refresh
          </Button>
          <Button
            onClick={exportToCSV}
            variant="default"
            className="flex items-center gap-2"
            data-testid="button-export"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Week Navigation */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button
              onClick={goToPreviousWeek}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              data-testid="button-previous-week"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Week
            </Button>
            
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-2 text-lg font-semibold text-blue-900 dark:text-blue-100">
                <Calendar className="h-5 w-5" />
                Week of {format(weekStart, 'MMM dd, yyyy')}
              </div>
              <Button
                onClick={goToCurrentWeek}
                variant="link"
                size="sm"
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                data-testid="button-current-week"
              >
                Go to Current Week
              </Button>
            </div>
            
            <Button
              onClick={goToNextWeek}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              data-testid="button-next-week"
            >
              Next Week
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Orders</p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{data.totalOrders}</p>
              </div>
              <CheckCircle className="h-12 w-12 text-blue-600 dark:text-blue-400 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600 dark:text-green-400 font-medium">Technicians</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{technicians.length}</p>
              </div>
              <Users className="h-12 w-12 text-green-600 dark:text-green-400 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">Avg per Technician</p>
                <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                  {technicians.length > 0 ? Math.round(data.totalOrders / technicians.length) : 0}
                </p>
              </div>
              <TrendingUp className="h-12 w-12 text-purple-600 dark:text-purple-400 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button onClick={expandAll} variant="outline" size="sm" data-testid="button-expand-all">
          Expand All
        </Button>
        <Button onClick={collapseAll} variant="outline" size="sm" data-testid="button-collapse-all">
          Collapse All
        </Button>
      </div>

      {/* Orders by Technician */}
      <div className="space-y-4">
        {technicians.map((technician) => {
          const orders = data.byTechnician[technician];
          const isExpanded = expandedTechnicians.has(technician);

          return (
            <Card key={technician} className="overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => toggleTechnician(technician)}
                data-testid={`header-technician-${technician}`}
              >
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-blue-600" />
                    <span className="text-lg">{technician}</span>
                    <Badge variant="secondary" className="ml-2">
                      {orders.length} {orders.length === 1 ? 'order' : 'orders'}
                    </Badge>
                  </div>
                  <span className="text-2xl text-gray-400">
                    {isExpanded ? '−' : '+'}
                  </span>
                </CardTitle>
              </CardHeader>

              {isExpanded && (
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order ID</TableHead>
                        <TableHead>FB Number</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Completed At</TableHead>
                        <TableHead>Progressed By</TableHead>
                        <TableHead>Current Dept</TableHead>
                        <TableHead>Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.orderId} data-testid={`row-order-${order.orderId}`}>
                          <TableCell className="font-medium">
                            {getDisplayOrderId({ orderId: order.orderId, fbOrderNumber: order.fbOrderNumber })}
                          </TableCell>
                          <TableCell>
                            {order.fbOrderNumber ? (
                              <Badge variant="outline" className="text-xs">
                                {order.fbOrderNumber}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {order.modelId || '—'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(order.completedAt), 'MMM dd, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="bg-green-600">
                              {order.progressedBy}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.currentDepartment}
                          </TableCell>
                          <TableCell className="text-sm">
                            {order.dueDate ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-gray-400" />
                                {format(new Date(order.dueDate), 'MMM dd, yyyy')}
                              </div>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          );
        })}

        {technicians.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-gray-500">
              No orders completed in Finish QC during this period.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

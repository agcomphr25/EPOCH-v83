import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, TrendingUp, AlertTriangle, CheckCircle, BarChart3 } from 'lucide-react';
import { useState, useMemo } from 'react';

interface ForecastItem {
  orderId: string;
  model: string | null;
  actualDepartment: string | null;
  expectedDepartment: string;
  estimatedShipDate: string;
  status: 'early' | 'on_track' | 'late';
}

export default function ProductionForecastPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: forecastData, isLoading, error } = useQuery<ForecastItem[]>({
    queryKey: ['/api/forecast/dashboard'],
  });

  const filteredData = useMemo(() => {
    if (!forecastData) return [];
    return forecastData.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        item.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [forecastData, searchTerm, statusFilter]);

  const statusCounts = useMemo(() => {
    if (!forecastData) return { early: 0, on_track: 0, late: 0, total: 0 };
    return {
      early: forecastData.filter((i) => i.status === 'early').length,
      on_track: forecastData.filter((i) => i.status === 'on_track').length,
      late: forecastData.filter((i) => i.status === 'late').length,
      total: forecastData.length,
    };
  }, [forecastData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'early':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
            <TrendingUp className="w-3 h-3 mr-1" />
            Early
          </Badge>
        );
      case 'on_track':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            On Track
          </Badge>
        );
      case 'late':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Late
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6 text-center text-red-500">
            Failed to load forecast data. Please try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Production Forecast
          </h1>
          <p className="text-muted-foreground mt-1">
            Estimated department progression and ship dates for active orders
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">On Track</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{statusCounts.on_track}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600">Early</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{statusCounts.early}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">Late</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{statusCounts.late}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <CardTitle>Order Forecast</CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search by Order ID or Model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="early">Early</SelectItem>
                  <SelectItem value="late">Late</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Generating forecast...</span>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Est Ship Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm || statusFilter !== 'all'
                          ? 'No orders match your filters'
                          : 'No active orders found for forecasting'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((item) => (
                      <TableRow key={item.orderId}>
                        <TableCell className="font-medium">{item.orderId}</TableCell>
                        <TableCell>{item.model || '—'}</TableCell>
                        <TableCell>{item.actualDepartment || '—'}</TableCell>
                        <TableCell>{item.expectedDepartment}</TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>{item.estimatedShipDate}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

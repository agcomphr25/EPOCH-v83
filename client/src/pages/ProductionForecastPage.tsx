import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, AlertTriangle, CheckCircle, BarChart3, Settings, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

interface ForecastItem {
  orderId: string;
  model: string | null;
  actualDepartment: string | null;
  expectedDepartment: string;
  estimatedShipDate: string;
  status: 'on_track' | 'off_track';
}

type SortField = 'orderId' | 'model' | 'actualDepartment' | 'expectedDepartment' | 'status' | 'estimatedShipDate';
type SortDirection = 'asc' | 'desc';

export default function ProductionForecastPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('off_track');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [expectedDeptFilter, setExpectedDeptFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: forecastData, isLoading, error } = useQuery<ForecastItem[]>({
    queryKey: ['/api/forecast/dashboard'],
  });

  const uniqueDepartments = useMemo(() => {
    if (!forecastData) return [];
    const depts = new Set(forecastData.map((i) => i.actualDepartment).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [forecastData]);

  const uniqueExpectedDepts = useMemo(() => {
    if (!forecastData) return [];
    const depts = new Set(forecastData.map((i) => i.expectedDepartment).filter(Boolean) as string[]);
    return Array.from(depts).sort();
  }, [forecastData]);

  const uniqueModels = useMemo(() => {
    if (!forecastData) return [];
    const models = new Set(forecastData.map((i) => i.model).filter(Boolean) as string[]);
    return Array.from(models).sort();
  }, [forecastData]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter !== 'all') count++;
    if (departmentFilter !== 'all') count++;
    if (expectedDeptFilter !== 'all') count++;
    if (modelFilter !== 'all') count++;
    return count;
  }, [searchTerm, statusFilter, departmentFilter, expectedDeptFilter, modelFilter]);

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDepartmentFilter('all');
    setExpectedDeptFilter('all');
    setModelFilter('all');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    if (sortDirection === 'asc') return <ArrowUp className="w-3 h-3 ml-1" />;
    return <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const filteredAndSortedData = useMemo(() => {
    if (!forecastData) return [];

    let result = forecastData.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        item.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.model && item.model.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesDept = departmentFilter === 'all' || item.actualDepartment === departmentFilter;
      const matchesExpectedDept = expectedDeptFilter === 'all' || item.expectedDepartment === expectedDeptFilter;
      const matchesModel = modelFilter === 'all' || item.model === modelFilter;
      return matchesSearch && matchesStatus && matchesDept && matchesExpectedDept && matchesModel;
    });

    if (sortField) {
      result = [...result].sort((a, b) => {
        let aVal = a[sortField] ?? '';
        let bVal = b[sortField] ?? '';

        if (sortField === 'estimatedShipDate') {
          const aDate = new Date(aVal).getTime();
          const bDate = new Date(bVal).getTime();
          return sortDirection === 'asc' ? aDate - bDate : bDate - aDate;
        }

        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        const cmp = aStr.localeCompare(bStr);
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [forecastData, searchTerm, statusFilter, departmentFilter, expectedDeptFilter, modelFilter, sortField, sortDirection]);

  const statusCounts = useMemo(() => {
    if (!forecastData) return { on_track: 0, off_track: 0, total: 0 };
    return {
      on_track: forecastData.filter((i) => i.status === 'on_track').length,
      off_track: forecastData.filter((i) => i.status === 'off_track').length,
      total: forecastData.length,
    };
  }, [forecastData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'on_track':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            ON TRACK
          </Badge>
        );
      case 'off_track':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            OFF TRACK
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
        <Link href="/production-forecast/settings">
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-1" />
            Calibration
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <CardTitle className="text-sm font-medium text-red-600">Off Track</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{statusCounts.off_track}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <CardTitle>Order Forecast</CardTitle>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground">
                  <X className="w-3 h-3 mr-1" />
                  Clear all filters ({activeFilterCount})
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search by Order ID or Model..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-56"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="on_track">On Track</SelectItem>
                  <SelectItem value="off_track">Off Track</SelectItem>
                </SelectContent>
              </Select>
              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Actual Dept" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actual Depts</SelectItem>
                  {uniqueDepartments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expectedDeptFilter} onValueChange={setExpectedDeptFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Expected Dept" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Expected Depts</SelectItem>
                  {uniqueExpectedDepts.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  {uniqueModels.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {activeFilterCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Showing {filteredAndSortedData.length} of {forecastData?.length ?? 0} orders
              </p>
            )}
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
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('orderId')}>
                      <div className="flex items-center">Order {getSortIcon('orderId')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('model')}>
                      <div className="flex items-center">Model {getSortIcon('model')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('actualDepartment')}>
                      <div className="flex items-center">Actual Dept {getSortIcon('actualDepartment')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('expectedDepartment')}>
                      <div className="flex items-center">Expected Dept {getSortIcon('expectedDepartment')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('status')}>
                      <div className="flex items-center">Status {getSortIcon('status')}</div>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleSort('estimatedShipDate')}>
                      <div className="flex items-center">Est Ship Date {getSortIcon('estimatedShipDate')}</div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {searchTerm || statusFilter !== 'all' || departmentFilter !== 'all' || expectedDeptFilter !== 'all' || modelFilter !== 'all'
                          ? 'No orders match your filters'
                          : 'No active orders found for forecasting'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAndSortedData.map((item) => (
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

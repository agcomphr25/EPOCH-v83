import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertTriangle, CheckCircle, BarChart3, Settings, ArrowUpDown, ArrowUp, ArrowDown, X, CalendarDays, TrendingDown } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

const DEPARTMENT_SEQUENCE = [
  'P1 Production Queue',
  'Layup/Plugging',
  'Barcode',
  'CNC',
  'Gunsmith',
  'Finish',
  'Finish QC',
  'Shipping QC',
  'Shipping',
];

function getDeptGap(actualDept: string | null, expectedDept: string): number {
  if (!actualDept) return -1;
  const actualIdx = DEPARTMENT_SEQUENCE.indexOf(actualDept);
  const expectedIdx = DEPARTMENT_SEQUENCE.indexOf(expectedDept);
  if (actualIdx === -1 || expectedIdx === -1) return -1;
  return expectedIdx - actualIdx;
}

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
type DriftSortField = 'orderId' | 'model' | 'actualDepartment' | 'expectedDepartment' | 'gap' | 'estimatedShipDate';

export default function ProductionForecastPage() {
  const [activeTab, setActiveTab] = useState('forecast');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('off_track');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [expectedDeptFilter, setExpectedDeptFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const [driftSearch, setDriftSearch] = useState('');
  const [driftSortField, setDriftSortField] = useState<DriftSortField | null>('gap');
  const [driftSortDirection, setDriftSortDirection] = useState<SortDirection>('desc');

  const [forecastPage, setForecastPage] = useState(1);
  const [driftPage, setDriftPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => { setForecastPage(1); }, [searchTerm, statusFilter, departmentFilter, expectedDeptFilter, modelFilter, sortField, sortDirection, dateFrom, dateTo]);
  useEffect(() => { setDriftPage(1); }, [driftSearch, driftSortField, driftSortDirection]);

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
    if (dateFrom) count++;
    if (dateTo) count++;
    return count;
  }, [searchTerm, statusFilter, departmentFilter, expectedDeptFilter, modelFilter, dateFrom, dateTo]);

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDepartmentFilter('all');
    setExpectedDeptFilter('all');
    setModelFilter('all');
    setDateFrom('');
    setDateTo('');
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

  const handleDriftSort = (field: DriftSortField) => {
    if (driftSortField === field) {
      if (driftSortDirection === 'asc') {
        setDriftSortDirection('desc');
      } else {
        setDriftSortField(null);
        setDriftSortDirection('asc');
      }
    } else {
      setDriftSortField(field);
      setDriftSortDirection('asc');
    }
  };

  const getDriftSortIcon = (field: DriftSortField) => {
    if (driftSortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    if (driftSortDirection === 'asc') return <ArrowUp className="w-3 h-3 ml-1" />;
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
      const itemDate = item.estimatedShipDate ? item.estimatedShipDate.slice(0, 10) : '';
      const matchesDateFrom = !dateFrom || itemDate >= dateFrom;
      const matchesDateTo = !dateTo || itemDate <= dateTo;
      return matchesSearch && matchesStatus && matchesDept && matchesExpectedDept && matchesModel && matchesDateFrom && matchesDateTo;
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
  }, [forecastData, searchTerm, statusFilter, departmentFilter, expectedDeptFilter, modelFilter, sortField, sortDirection, dateFrom, dateTo]);

  const statusCounts = useMemo(() => {
    if (!forecastData) return { on_track: 0, off_track: 0, total: 0 };
    return {
      on_track: forecastData.filter((i) => i.status === 'on_track').length,
      off_track: forecastData.filter((i) => i.status === 'off_track').length,
      total: forecastData.length,
    };
  }, [forecastData]);

  const driftData = useMemo(() => {
    if (!forecastData) return { behind1: [], behind2: [], behind3Plus: [], summary: { behind1: 0, behind2: 0, behind3Plus: 0 } };

    const offTrackOrders = forecastData
      .filter((item) => item.status === 'off_track')
      .map((item) => ({
        ...item,
        gap: getDeptGap(item.actualDepartment, item.expectedDepartment),
      }))
      .filter((item) => item.gap > 0);

    const behind1 = offTrackOrders.filter((o) => o.gap === 1);
    const behind2 = offTrackOrders.filter((o) => o.gap === 2);
    const behind3Plus = offTrackOrders.filter((o) => o.gap >= 3);

    return {
      behind1,
      behind2,
      behind3Plus,
      summary: {
        behind1: behind1.length,
        behind2: behind2.length,
        behind3Plus: behind3Plus.length,
      },
    };
  }, [forecastData]);

  const filteredDriftOrders = useMemo(() => {
    const allDrift = [...driftData.behind2, ...driftData.behind3Plus];

    let result = allDrift.filter((item) => {
      if (!driftSearch) return true;
      const term = driftSearch.toLowerCase();
      return (
        item.orderId.toLowerCase().includes(term) ||
        (item.model && item.model.toLowerCase().includes(term))
      );
    });

    if (driftSortField) {
      result = [...result].sort((a, b) => {
        if (driftSortField === 'gap') {
          return driftSortDirection === 'asc' ? a.gap - b.gap : b.gap - a.gap;
        }
        if (driftSortField === 'estimatedShipDate') {
          const aDate = new Date(a.estimatedShipDate).getTime();
          const bDate = new Date(b.estimatedShipDate).getTime();
          return driftSortDirection === 'asc' ? aDate - bDate : bDate - aDate;
        }
        const aVal = String(a[driftSortField as keyof typeof a] ?? '').toLowerCase();
        const bVal = String(b[driftSortField as keyof typeof b] ?? '').toLowerCase();
        const cmp = aVal.localeCompare(bVal);
        return driftSortDirection === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [driftData, driftSearch, driftSortField, driftSortDirection]);

  const forecastTotalPages = Math.max(1, Math.ceil(filteredAndSortedData.length / PAGE_SIZE));
  const forecastStart = (forecastPage - 1) * PAGE_SIZE;
  const forecastEnd = forecastStart + PAGE_SIZE;
  const pagedForecastData = filteredAndSortedData.slice(forecastStart, forecastEnd);

  const driftTotalPages = Math.max(1, Math.ceil(filteredDriftOrders.length / PAGE_SIZE));
  const driftStart = (driftPage - 1) * PAGE_SIZE;
  const driftEnd = driftStart + PAGE_SIZE;
  const pagedDriftOrders = filteredDriftOrders.slice(driftStart, driftEnd);

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

  const getGapBadge = (gap: number) => {
    if (gap === 2) {
      return (
        <Badge className="bg-orange-100 text-orange-800 border-orange-300">
          <AlertTriangle className="w-3 h-3 mr-1" />
          2 BEHIND
        </Badge>
      );
    }
    return (
      <Badge className="bg-red-100 text-red-800 border-red-300">
        <AlertTriangle className="w-3 h-3 mr-1" />
        {gap} BEHIND
      </Badge>
    );
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="forecast" className="flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            Forecast Overview
          </TabsTrigger>
          <TabsTrigger value="drift" className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4" />
            Drift Analysis
            {driftData.summary.behind2 + driftData.summary.behind3Plus > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0">
                {driftData.summary.behind2 + driftData.summary.behind3Plus}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="mt-4">
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
                  <div className="flex items-center gap-1.5 border rounded-md px-2 py-1 bg-background">
                    <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="text-sm bg-transparent outline-none w-[130px] text-foreground"
                      title="Due date from"
                    />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="text-sm bg-transparent outline-none w-[130px] text-foreground"
                      title="Due date to"
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {filteredAndSortedData.length === 0
                    ? 'No orders to show'
                    : `Showing ${forecastStart + 1}–${Math.min(forecastEnd, filteredAndSortedData.length)} of ${filteredAndSortedData.length} orders${activeFilterCount > 0 ? ` (filtered from ${forecastData?.length ?? 0})` : ''}`}
                </p>
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
                        <TableHead className="w-12 text-muted-foreground">#</TableHead>
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
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            {searchTerm || statusFilter !== 'all' || departmentFilter !== 'all' || expectedDeptFilter !== 'all' || modelFilter !== 'all'
                              ? 'No orders match your filters'
                              : 'No active orders found for forecasting'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        pagedForecastData.map((item, index) => (
                          <TableRow key={item.orderId}>
                            <TableCell className="text-muted-foreground text-xs">{forecastStart + index + 1}</TableCell>
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
              {!isLoading && forecastTotalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForecastPage((p) => Math.max(1, p - 1))}
                    disabled={forecastPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {forecastPage} of {forecastTotalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setForecastPage((p) => Math.min(forecastTotalPages, p + 1))}
                    disabled={forecastPage === forecastTotalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift" className="mt-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              <span>Analyzing drift...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-yellow-600">1 Department Behind</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-600">{driftData.summary.behind1}</div>
                    <p className="text-xs text-muted-foreground mt-1">Slightly off schedule</p>
                  </CardContent>
                </Card>
                <Card className="border-orange-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-orange-600">2 Departments Behind</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{driftData.summary.behind2}</div>
                    <p className="text-xs text-muted-foreground mt-1">Significantly behind schedule</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-red-600">3+ Departments Behind</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{driftData.summary.behind3Plus}</div>
                    <p className="text-xs text-muted-foreground mt-1">Critical — needs immediate attention</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <TrendingDown className="w-5 h-5" />
                        Orders 2+ Departments Behind
                      </CardTitle>
                      <span className="text-sm text-muted-foreground">
                        {filteredDriftOrders.length} orders
                      </span>
                    </div>
                    <Input
                      placeholder="Search by Order ID or Model..."
                      value={driftSearch}
                      onChange={(e) => setDriftSearch(e.target.value)}
                      className="w-full sm:w-56"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-muted-foreground">#</TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleDriftSort('orderId')}>
                            <div className="flex items-center">Order {getDriftSortIcon('orderId')}</div>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleDriftSort('model')}>
                            <div className="flex items-center">Model {getDriftSortIcon('model')}</div>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleDriftSort('actualDepartment')}>
                            <div className="flex items-center">Actual Dept {getDriftSortIcon('actualDepartment')}</div>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleDriftSort('expectedDepartment')}>
                            <div className="flex items-center">Expected Dept {getDriftSortIcon('expectedDepartment')}</div>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleDriftSort('gap')}>
                            <div className="flex items-center">Drift {getDriftSortIcon('gap')}</div>
                          </TableHead>
                          <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => handleDriftSort('estimatedShipDate')}>
                            <div className="flex items-center">Est Ship Date {getDriftSortIcon('estimatedShipDate')}</div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDriftOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              {driftSearch
                                ? 'No orders match your search'
                                : 'No orders are 2+ departments behind — looking good!'}
                            </TableCell>
                          </TableRow>
                        ) : (
                          pagedDriftOrders.map((item, index) => (
                            <TableRow key={item.orderId} className={item.gap >= 3 ? 'bg-red-50' : ''}>
                              <TableCell className="text-muted-foreground text-xs">{driftStart + index + 1}</TableCell>
                              <TableCell className="font-medium">{item.orderId}</TableCell>
                              <TableCell>{item.model || '—'}</TableCell>
                              <TableCell>{item.actualDepartment || '—'}</TableCell>
                              <TableCell>{item.expectedDepartment}</TableCell>
                              <TableCell>{getGapBadge(item.gap)}</TableCell>
                              <TableCell>{item.estimatedShipDate}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  {driftTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDriftPage((p) => Math.max(1, p - 1))}
                        disabled={driftPage === 1}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {driftPage} of {driftTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDriftPage((p) => Math.min(driftTotalPages, p + 1))}
                        disabled={driftPage === driftTotalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

import React, { useState } from 'react';
import { useAPTransactions, useARTransactions, useCOGS } from '../hooks/useTransactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  AlertTriangle,
  Target,
  RefreshCw
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { format, subDays } from 'date-fns';

/**
 * Finance Dashboard component displaying high-level financial KPIs
 * Aggregates data from AP, AR, and COGS to provide executive overview
 */
export default function FinanceDashboard() {
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);
    return {
      dateFrom: format(thirtyDaysAgo, 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd')
    };
  });

  // Fetch data from all three financial modules
  const { data: apData, loading: apLoading, refresh: refreshAP } = useAPTransactions(dateRange);
  const { data: arData, loading: arLoading, refresh: refreshAR } = useARTransactions(dateRange);
  const { data: cogsData, loading: cogsLoading, refresh: refreshCOGS } = useCOGS(dateRange);

  const isLoading = apLoading || arLoading || cogsLoading;

  // Calculate KPIs from fetched data
  const calculateKPIs = () => {
    // Ensure data is array before calling reduce
    const apDataArray = Array.isArray(apData) ? apData : [];
    const arDataArray = Array.isArray(arData) ? arData : [];
    
    const totalAP = apDataArray.reduce((sum, tx) => sum + tx.amount, 0);
    const totalAR = arDataArray.reduce((sum, tx) => sum + tx.amount, 0);
    
    // AR Aging buckets (days overdue)
    const today = new Date();
    const arAging = arDataArray.reduce((buckets, tx) => {
      const txDate = new Date(tx.date);
      const daysOverdue = Math.floor((today - txDate) / (1000 * 60 * 60 * 24));
      
      if (daysOverdue <= 30) buckets.current += tx.amount;
      else if (daysOverdue <= 60) buckets.days30 += tx.amount;
      else if (daysOverdue <= 90) buckets.days60 += tx.amount;
      else buckets.days90Plus += tx.amount;
      
      return buckets;
    }, { current: 0, days30: 0, days60: 0, days90Plus: 0 });

    // Mock additional KPIs (in real implementation, these would come from production data)
    const wipValue = 85000; // Work in Progress value
    const scrapPercentage = 2.3; // Scrap percentage
    const utilizationPercentage = 87.5; // Machine utilization percentage
    
    return {
      totalAP,
      totalAR,
      arAging,
      wipValue,
      scrapPercentage,
      utilizationPercentage,
      cogsVariance: cogsData && typeof cogsData === 'object' 
        ? (cogsData.actualCost - cogsData.standardCost) 
        : 0
    };
  };

  const kpis = calculateKPIs();

  // Mock revenue vs target data for trend chart
  const revenueData = [
    { month: 'Jan', revenue: 45000, target: 50000 },
    { month: 'Feb', revenue: 52000, target: 55000 },
    { month: 'Mar', revenue: 48000, target: 52000 },
    { month: 'Apr', revenue: 61000, target: 58000 },
    { month: 'May', revenue: 55000, target: 60000 },
    { month: 'Jun', revenue: 67000, target: 65000 },
  ];

  // Mock slow-moving orders data
  const slowMovingOrders = [
    { orderId: 'AG001', customer: 'Acme Corp', daysInProduction: 45, value: 12500 },
    { orderId: 'AG002', customer: 'Beta Industries', daysInProduction: 38, value: 8900 },
    { orderId: 'AG003', customer: 'Gamma Ltd', daysInProduction: 32, value: 15600 },
    { orderId: 'AG004', customer: 'Delta Systems', daysInProduction: 28, value: 6700 },
    { orderId: 'AG005', customer: 'Echo Manufacturing', daysInProduction: 25, value: 9800 },
  ];

  // AR Aging pie chart data
  const arAgingData = [
    { name: 'Current', value: kpis.arAging.current, color: '#22c55e' },
    { name: '30 Days', value: kpis.arAging.days30, color: '#f59e0b' },
    { name: '60 Days', value: kpis.arAging.days60, color: '#ef4444' },
    { name: '90+ Days', value: kpis.arAging.days90Plus, color: '#7c2d12' },
  ];

  // Format currency for display
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Handle date range preset selection
  const handleDateRangeChange = (preset) => {
    const today = new Date();
    let startDate;
    
    switch (preset) {
      case 'today':
        startDate = today;
        break;
      case '7days':
        startDate = subDays(today, 7);
        break;
      case '30days':
        startDate = subDays(today, 30);
        break;
      case '90days':
        startDate = subDays(today, 90);
        break;
      default:
        startDate = subDays(today, 30);
    }
    
    setDateRange({
      dateFrom: format(startDate, 'yyyy-MM-dd'),
      dateTo: format(today, 'yyyy-MM-dd')
    });
  };

  const refreshAll = () => {
    refreshAP();
    refreshAR();
    refreshCOGS();
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Select onValueChange={handleDateRangeChange} defaultValue="30days">
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={refreshAll} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh All
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total AP
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.totalAP)}</div>
                <p className="text-xs text-muted-foreground">Outstanding payables</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total AR
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.totalAR)}</div>
                <p className="text-xs text-muted-foreground">Outstanding receivables</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  WIP Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(kpis.wipValue)}</div>
                <p className="text-xs text-muted-foreground">Work in progress</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{kpis.utilizationPercentage}%</div>
                <p className="text-xs text-muted-foreground">Machine utilization</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue vs Target Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue vs Target</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Actual Revenue" />
                      <Line type="monotone" dataKey="target" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" name="Target Revenue" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* AR Aging Chart */}
            <Card>
              <CardHeader>
                <CardTitle>AR Aging</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={arAgingData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {arAgingData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Additional KPIs */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">COGS Variance</span>
                    <Badge variant={kpis.cogsVariance > 0 ? 'destructive' : 'default'}>
                      {formatCurrency(kpis.cogsVariance)}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Scrap Percentage</span>
                    <Badge variant={kpis.scrapPercentage > 3 ? 'destructive' : 'default'}>
                      {kpis.scrapPercentage}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Overdue AR</span>
                    <Badge variant={kpis.arAging.days90Plus > 0 ? 'destructive' : 'default'}>
                      {formatCurrency(kpis.arAging.days90Plus)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Top 5 Slowest Moving Orders */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Slowest Moving Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {slowMovingOrders.map((order) => (
                    <div key={order.orderId} className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm">{order.orderId}</div>
                        <div className="text-xs text-muted-foreground">{order.customer}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{order.daysInProduction} days</div>
                        <div className="text-xs text-muted-foreground">{formatCurrency(order.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
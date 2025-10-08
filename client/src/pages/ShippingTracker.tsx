import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, TrendingUp, Calendar } from 'lucide-react';
import { getCurrentCompanyWeek, formatWeekRange, isDateInCompanyWeek } from '@shared/weekUtils';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  status: string;
  currentDepartment?: string;
  modelId: string;
  updatedAt: string;
}

interface WeeklyStats {
  week: number;
  year: number;
  stocksShipped: number;
  orders: string[];
}

export default function ShippingTracker() {
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentCompanyWeek();
  
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);

  // Fetch all fulfilled orders
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: async () => {
      const response = await fetch('/api/orders/with-payment-status');
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    }
  });

  // Calculate weekly stats
  const weeklyStats: WeeklyStats[] = [];
  
  if (orders) {
    // Group fulfilled orders by company week
    const weekMap = new Map<string, { stocksShipped: number; orders: string[] }>();
    
    orders
      .filter(order => order.status === 'FULFILLED' || order.currentDepartment === 'Fulfilled')
      .forEach(order => {
        // Use updatedAt as the fulfillment date
        const fulfillmentDate = new Date(order.updatedAt);
        const year = fulfillmentDate.getFullYear();
        
        // Find which company week this order was fulfilled in
        for (let week = 1; week <= 52; week++) {
          if (isDateInCompanyWeek(fulfillmentDate, week, year)) {
            const key = `${year}-W${week}`;
            
            if (!weekMap.has(key)) {
              weekMap.set(key, { stocksShipped: 0, orders: [] });
            }
            
            const stats = weekMap.get(key)!;
            stats.stocksShipped += 1;
            stats.orders.push(order.orderId);
            break;
          }
        }
      });
    
    // Convert to array and sort by week descending
    weekMap.forEach((stats, key) => {
      const [yearStr, weekStr] = key.split('-W');
      weeklyStats.push({
        week: parseInt(weekStr),
        year: parseInt(yearStr),
        stocksShipped: stats.stocksShipped,
        orders: stats.orders
      });
    });
    
    weeklyStats.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.week - a.week;
    });
  }

  // Get stats for selected week
  const selectedWeekStats = weeklyStats.find(
    s => s.week === selectedWeek && s.year === selectedYear
  ) || { week: selectedWeek, year: selectedYear, stocksShipped: 0, orders: [] };

  // Generate year options (current year and 2 previous years)
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // Generate week options (1-52)
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="h-6 w-6" />
          Shipping Tracker
        </h1>
        <p className="text-gray-600 mt-1">
          Track stocks shipped by company week (Wednesday - Tuesday)
        </p>
      </div>

      {/* Current Week Summary Card */}
      <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Current Week Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">Current Week</div>
              <div className="text-2xl font-bold text-blue-600">Week {currentWeek}</div>
              <div className="text-xs text-gray-500 mt-1">{formatWeekRange(currentWeek, currentYear)}</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">Stocks Shipped This Week</div>
              <div className="text-2xl font-bold text-green-600">
                {weeklyStats.find(s => s.week === currentWeek && s.year === currentYear)?.stocksShipped || 0}
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="text-sm text-gray-600">Total Weeks Tracked</div>
              <div className="text-2xl font-bold text-indigo-600">{weeklyStats.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Week Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            View Specific Week
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Year:</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Week:</label>
              <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(week => (
                    <SelectItem key={week} value={week.toString()}>Week {week}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-gray-600">
              {formatWeekRange(selectedWeek, selectedYear)}
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600">Stocks Shipped</div>
                <div className="text-3xl font-bold text-blue-600">{selectedWeekStats.stocksShipped}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Orders</div>
                <div className="text-xl font-semibold text-gray-700">{selectedWeekStats.orders.length}</div>
              </div>
            </div>
            {selectedWeekStats.orders.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-gray-600 mb-2">Order IDs:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedWeekStats.orders.map(orderId => (
                    <span key={orderId} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      {orderId}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Stats Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Weeks</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading shipping data...</div>
          ) : weeklyStats.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No fulfilled orders found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Stocks Shipped</TableHead>
                  <TableHead>Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeklyStats.map(stat => (
                  <TableRow 
                    key={`${stat.year}-W${stat.week}`}
                    className={stat.week === currentWeek && stat.year === currentYear ? 'bg-blue-50' : ''}
                  >
                    <TableCell className="font-medium">
                      Week {stat.week}, {stat.year}
                      {stat.week === currentWeek && stat.year === currentYear && (
                        <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Current</span>
                      )}
                    </TableCell>
                    <TableCell>{formatWeekRange(stat.week, stat.year)}</TableCell>
                    <TableCell>
                      <span className="text-lg font-semibold text-blue-600">{stat.stocksShipped}</span>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{stat.orders.join(', ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

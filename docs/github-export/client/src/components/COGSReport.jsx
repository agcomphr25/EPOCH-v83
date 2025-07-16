import React, { useState } from 'react';
import { useCOGS } from '../hooks/useTransactions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * Cost of Goods Sold (COGS) Report component
 * @param {Object} props - Component props
 * @param {string} props.dateFrom - Start date for filtering data
 * @param {string} props.dateTo - End date for filtering data
 */
export default function COGSReport({ dateFrom, dateTo }) {
  const [dateRange, setDateRange] = useState({ dateFrom, dateTo });
  const { data, loading, error, refresh } = useCOGS(dateRange);

  // Handle date range changes
  const handleDateChange = (field, value) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  // Format currency for display
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Calculate variance between actual and standard costs
  const calculateVariance = (actual, standard) => {
    const variance = actual - standard;
    const percentage = standard > 0 ? (variance / standard) * 100 : 0;
    return { variance, percentage };
  };

  // Format chart data for recharts
  const chartData = data.breakdown.map(item => ({
    category: item.category,
    standard: item.standard,
    actual: item.actual,
    variance: item.actual - item.standard
  }));

  const totalVariance = calculateVariance(data.actualCost, data.standardCost);

  return (
    <div className="space-y-4">
      {/* Date Range Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Filter Period</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateRange.dateFrom}
                onChange={(e) => handleDateChange('dateFrom', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateRange.dateTo}
                onChange={(e) => handleDateChange('dateTo', e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={refresh} className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500">
          Error loading COGS data: {error}
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Standard COGS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.standardCost)}</div>
                <p className="text-xs text-muted-foreground">Budgeted cost</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Actual COGS</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.actualCost)}</div>
                <p className="text-xs text-muted-foreground">Actual cost incurred</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Variance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold flex items-center gap-2 ${
                  totalVariance.variance > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {totalVariance.variance > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                  {formatCurrency(Math.abs(totalVariance.variance))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {totalVariance.percentage.toFixed(1)}% {totalVariance.variance > 0 ? 'over' : 'under'} budget
                </p>
              </CardContent>
            </Card>
          </div>

          {/* COGS Breakdown Chart */}
          <Card>
            <CardHeader>
              <CardTitle>COGS Breakdown by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="category" />
                    <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <Tooltip 
                      formatter={(value, name) => [formatCurrency(value), name]}
                      labelFormatter={(label) => `Category: ${label}`}
                    />
                    <Legend />
                    <Bar dataKey="standard" fill="#3b82f6" name="Standard Cost" />
                    <Bar dataKey="actual" fill="#ef4444" name="Actual Cost" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed COGS Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full table-auto border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-4 font-medium">Category</th>
                      <th className="text-right p-4 font-medium">Standard Cost</th>
                      <th className="text-right p-4 font-medium">Actual Cost</th>
                      <th className="text-right p-4 font-medium">Variance</th>
                      <th className="text-right p-4 font-medium">Variance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.breakdown.map((item, index) => {
                      const variance = calculateVariance(item.actual, item.standard);
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className="p-4 font-medium">{item.category}</td>
                          <td className="p-4 text-right">{formatCurrency(item.standard)}</td>
                          <td className="p-4 text-right">{formatCurrency(item.actual)}</td>
                          <td className={`p-4 text-right font-medium ${
                            variance.variance > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {variance.variance > 0 ? '+' : ''}{formatCurrency(variance.variance)}
                          </td>
                          <td className={`p-4 text-right ${
                            variance.variance > 0 ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {variance.percentage > 0 ? '+' : ''}{variance.percentage.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Users, Star, AlertTriangle, Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface AnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  stockModel?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function SurveyAnalytics() {
  const [filters, setFilters] = useState<AnalyticsFilters>({});

  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['/api/surveys/analytics', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      return await apiRequest(`/api/surveys/analytics?${params.toString()}`);
    },
  });

  const updateFilter = (key: keyof AnalyticsFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-gray-500">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex justify-center items-center h-64">
            <div className="text-center">
              <AlertTriangle className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">No analytics data available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    avgCsat,
    nps: npsValue,
    issuePct,
    csatByWeek,
    npsBuckets,
    csatByModel
  } = analytics;

  // Format data for charts
  const formattedNpsBuckets = npsBuckets.map((bucket: any, index: number) => ({
    ...bucket,
    fill: COLORS[index % COLORS.length]
  }));

  return (
    <div className="space-y-6">
      {/* Filter Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <CardTitle>Survey Analytics</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Report
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex gap-2">
              <Input
                type="date"
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value)}
                className="w-[150px]"
                placeholder="From"
              />
              <Input
                type="date"
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value)}
                className="w-[150px]"
                placeholder="To"
              />
            </div>
            
            <Input
              placeholder="Stock model filter..."
              value={filters.stockModel || ''}
              onChange={(e) => updateFilter('stockModel', e.target.value)}
              className="w-[200px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average CSAT</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${avgCsat >= 4 ? 'text-green-600' : avgCsat >= 3 ? 'text-yellow-600' : 'text-red-600'}`}>
              {avgCsat.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Out of 5.0</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Promoter Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${npsValue >= 50 ? 'text-green-600' : npsValue >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
              {npsValue}
            </div>
            <p className="text-xs text-muted-foreground">
              {npsValue >= 70 ? 'Excellent' : npsValue >= 50 ? 'Great' : npsValue >= 0 ? 'Good' : 'Needs Improvement'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issue Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${issuePct < 0.1 ? 'text-green-600' : issuePct < 0.2 ? 'text-yellow-600' : 'text-red-600'}`}>
              {(issuePct * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Of customers experienced issues
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Response Trend</CardTitle>
            {avgCsat >= 4 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${avgCsat >= 4 ? 'text-green-600' : 'text-red-600'}`}>
              {avgCsat >= 4 ? '↗' : '↘'}
            </div>
            <p className="text-xs text-muted-foreground">
              Overall satisfaction trend
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSAT Trend Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>CSAT Trend Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={csatByWeek}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis domain={[1, 5]} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="avg" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* NPS Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>NPS Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={formattedNpsBuckets}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ type, count, percent }: any) => `${type}: ${count} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {formattedNpsBuckets.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* CSAT by Stock Model */}
      <Card>
        <CardHeader>
          <CardTitle>CSAT by Stock Model</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={csatByModel} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="model" />
              <YAxis domain={[1, 5]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avg" fill="#82ca9d" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* NPS Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>NPS Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {npsBuckets.map((bucket: any) => (
              <div key={bucket.type} className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold mb-2">{bucket.count}</div>
                <Badge 
                  variant={
                    bucket.type === 'Promoter' ? 'default' : 
                    bucket.type === 'Passive' ? 'secondary' : 
                    'destructive'
                  }
                  className="mb-2"
                >
                  {bucket.type}
                </Badge>
                <p className="text-sm text-gray-600">
                  {bucket.type === 'Promoter' && 'Score 9-10: Loyal enthusiasts'}
                  {bucket.type === 'Passive' && 'Score 7-8: Satisfied but unenthusiastic'}
                  {bucket.type === 'Detractor' && 'Score 0-6: Unhappy customers'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
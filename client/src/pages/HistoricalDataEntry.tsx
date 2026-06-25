import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Save, RefreshCw } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface HistoricalEntry {
  id?: number;
  year: number;
  month: number;
  dataType: string;
  category: string;
  amount: string;
  notes?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const YEARS = [2023, 2024, 2025, 2026];

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function getDefaultComparisonMonthKey(): string {
  const now = new Date();
  const previousFullMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${previousFullMonth.getFullYear()}-${String(previousFullMonth.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [yearText, monthText] = monthKey.split('-');
  return { year: Number(yearText), month: Number(monthText) };
}

function shiftMonth(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function formatPeriodLabel(start: { year: number; month: number }, end: { year: number; month: number }): string {
  return `${MONTHS[start.month - 1]} ${start.year} - ${MONTHS[end.month - 1]} ${end.year}`;
}

export default function HistoricalDataEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('credit_card');
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [comparisonMonthKey, setComparisonMonthKey] = useState(getDefaultComparisonMonthKey);

  const { data: historicalData, isLoading, refetch } = useQuery<HistoricalEntry[]>({
    queryKey: ['/api/historical-data'],
  });

  const saveMutation = useMutation({
    mutationFn: async (entries: HistoricalEntry[]) => {
      return apiRequest('/api/historical-data/bulk', {
        method: 'POST',
        body: JSON.stringify({ entries }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Historical data saved successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/historical-data'] });
      setHasChanges(false);
      setEditedData({});
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save data',
        variant: 'destructive'
      });
    },
  });

  const getKey = (year: number, month: number, category: string) => 
    `${year}-${month}-${category}`;

  const getValue = (year: number, month: number, category: string): string => {
    const key = getKey(year, month, category);
    if (editedData[key] !== undefined) {
      return editedData[key];
    }
    const entry = historicalData?.find(
      d => d.year === year && d.month === month && d.category === category && d.dataType === activeTab
    );
    return entry?.amount || '';
  };

  const getDisplayValue = (year: number, month: number, category: string): string => {
    const key = getKey(year, month, category);
    const rawValue = getValue(year, month, category);
    if (focusedField === key) {
      return rawValue;
    }
    return rawValue ? formatCurrency(rawValue) : '';
  };

  const handleChange = (year: number, month: number, category: string, value: string) => {
    const key = getKey(year, month, category);
    const cleaned = value.replace(/[$,\s]/g, '');
    setEditedData(prev => ({ ...prev, [key]: cleaned }));
    setHasChanges(true);
  };

  const handleFocus = (year: number, month: number, category: string) => {
    const key = getKey(year, month, category);
    setFocusedField(key);
  };

  const handleBlur = () => {
    setFocusedField(null);
  };

  const handleSave = () => {
    const entries: HistoricalEntry[] = [];
    
    Object.entries(editedData).forEach(([key, amount]) => {
      const [yearStr, monthStr, category] = key.split('-');
      entries.push({
        year: parseInt(yearStr),
        month: parseInt(monthStr),
        dataType: activeTab,
        category,
        amount,
      });
    });

    if (entries.length > 0) {
      saveMutation.mutate(entries);
    }
  };

  const getYearTotal = (year: number, category: string): number => {
    let total = 0;
    for (let month = 1; month <= 12; month++) {
      const val = getValue(year, month, category);
      total += parseFloat(val) || 0;
    }
    return total;
  };

  const getMonthTotal = (year: number, month: number, cats: string[]): number => {
    return cats.reduce((sum, cat) => sum + (parseFloat(getValue(year, month, cat)) || 0), 0);
  };

  const getRollingPeriodTotal = (
    endYear: number,
    endMonth: number,
    cats: string[],
  ): number => {
    let total = 0;
    for (let i = 11; i >= 0; i--) {
      const { year, month } = shiftMonth(endYear, endMonth, -i);
      total += cats.reduce(
        (sum, cat) => sum + (parseFloat(getValue(year, month, cat)) || 0),
        0,
      );
    }
    return total;
  };

  const renderCreditCardTab = () => {
    const comparisonEnd = parseMonthKey(comparisonMonthKey);
    const currentStart = shiftMonth(comparisonEnd.year, comparisonEnd.month, -11);
    const priorEnd = shiftMonth(comparisonEnd.year, comparisonEnd.month, -12);
    const priorStart = shiftMonth(comparisonEnd.year, comparisonEnd.month, -23);
    const currentLabel = formatPeriodLabel(currentStart, comparisonEnd);
    const priorLabel = formatPeriodLabel(priorStart, priorEnd);
    const currentFY = getRollingPeriodTotal(comparisonEnd.year, comparisonEnd.month, ['online', 'phone']);
    const priorFY = getRollingPeriodTotal(priorEnd.year, priorEnd.month, ['online', 'phone']);
    const ratio = priorFY > 0 ? currentFY / priorFY : null;
    const pctChange = priorFY > 0 ? ((currentFY - priorFY) / priorFY) * 100 : null;
    const isUp = pctChange !== null && pctChange >= 0;

    return (
      <div className="space-y-6">
        <Card data-testid="card-yoy-comparison">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">YoY Comparison</CardTitle>
            <CardDescription>
              {currentLabel} vs {priorLabel} (Total)
            </CardDescription>
            <div className="flex flex-col gap-1 pt-2 sm:w-48">
              <label htmlFor="comparison-ending-month" className="text-xs font-medium text-muted-foreground">
                Ending month
              </label>
              <Input
                id="comparison-ending-month"
                type="month"
                value={comparisonMonthKey}
                max={getDefaultComparisonMonthKey()}
                onChange={(event) => {
                  if (event.target.value) setComparisonMonthKey(event.target.value);
                }}
                className="h-9"
                data-testid="input-yoy-ending-month"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  {currentLabel}
                </div>
                <div
                  className="text-lg font-bold"
                  data-testid="text-yoy-current"
                >
                  {formatCurrency(currentFY)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  {priorLabel}
                </div>
                <div
                  className="text-lg font-bold"
                  data-testid="text-yoy-prior"
                >
                  {formatCurrency(priorFY)}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">Ratio</div>
                <div
                  className="text-lg font-bold"
                  data-testid="text-yoy-ratio"
                >
                  {ratio !== null ? `${ratio.toFixed(2)}x` : '—'}
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground mb-1">
                  % Change
                </div>
                <div
                  className={`text-lg font-bold ${
                    pctChange === null
                      ? ''
                      : isUp
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                  data-testid="text-yoy-pct-change"
                >
                  {pctChange !== null
                    ? `${isUp ? '+' : ''}${pctChange.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3 text-left font-medium">Month</th>
                {YEARS.map(year => (
                  <th key={year} colSpan={3} className="py-2 px-3 text-center font-medium border-l">
                    {year}
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/50">
                <th className="py-1 px-3"></th>
                {YEARS.map(year => (
                  <>
                    <th key={`${year}-online`} className="py-1 px-2 text-center text-xs text-muted-foreground border-l">
                      Online
                    </th>
                    <th key={`${year}-phone`} className="py-1 px-2 text-center text-xs text-muted-foreground">
                      Phone
                    </th>
                    <th key={`${year}-cctotal`} className="py-1 px-2 text-center text-xs font-semibold text-muted-foreground">
                      Total
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((monthName, idx) => (
                <tr key={monthName} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-3 font-medium">{monthName}</td>
                  {YEARS.map(year => (
                    <>
                      <td key={`${year}-${idx + 1}-online`} className="py-1 px-1 border-l">
                        <Input
                          type="text"
                          className="h-8 text-right text-sm"
                          placeholder="$0.00"
                          value={getDisplayValue(year, idx + 1, 'online')}
                          onChange={(e) => handleChange(year, idx + 1, 'online', e.target.value)}
                          onFocus={() => handleFocus(year, idx + 1, 'online')}
                          onBlur={handleBlur}
                        />
                      </td>
                      <td key={`${year}-${idx + 1}-phone`} className="py-1 px-1">
                        <Input
                          type="text"
                          className="h-8 text-right text-sm"
                          placeholder="$0.00"
                          value={getDisplayValue(year, idx + 1, 'phone')}
                          onChange={(e) => handleChange(year, idx + 1, 'phone', e.target.value)}
                          onFocus={() => handleFocus(year, idx + 1, 'phone')}
                          onBlur={handleBlur}
                        />
                      </td>
                      <td key={`${year}-${idx + 1}-cctotal`} className="py-1 px-2 text-right font-medium bg-muted/30">
                        {formatCurrency(getMonthTotal(year, idx + 1, ['online', 'phone']))}
                      </td>
                    </>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted font-medium">
                <td className="py-2 px-3">Year Totals</td>
                {YEARS.map(year => (
                  <>
                    <td key={`${year}-total-online`} className="py-2 px-2 text-right border-l">
                      {formatCurrency(getYearTotal(year, 'online'))}
                    </td>
                    <td key={`${year}-total-phone`} className="py-2 px-2 text-right">
                      {formatCurrency(getYearTotal(year, 'phone'))}
                    </td>
                    <td key={`${year}-total-cctotal`} className="py-2 px-2 text-right font-bold">
                      {formatCurrency(getYearTotal(year, 'online') + getYearTotal(year, 'phone'))}
                    </td>
                  </>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderRevenueTab = () => {
    return (
      <div className="space-y-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3 text-left font-medium">Month</th>
                {YEARS.map(year => (
                  <th key={year} colSpan={3} className="py-2 px-3 text-center font-medium border-l">
                    {year}
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/50">
                <th className="py-1 px-3"></th>
                {YEARS.map(year => (
                  <>
                    <th key={`${year}-stocks`} className="py-1 px-2 text-center text-xs text-muted-foreground border-l">
                      Stocks
                    </th>
                    <th key={`${year}-aerospace`} className="py-1 px-2 text-center text-xs text-muted-foreground">
                      Aerospace
                    </th>
                    <th key={`${year}-combined`} className="py-1 px-2 text-center text-xs font-semibold text-muted-foreground">
                      Combined
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((monthName, idx) => (
                <tr key={monthName} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-3 font-medium">{monthName}</td>
                  {YEARS.map(year => (
                    <>
                      <td key={`${year}-${idx + 1}-stocks`} className="py-1 px-1 border-l">
                        <Input
                          type="text"
                          className="h-8 text-right text-sm"
                          placeholder="$0.00"
                          value={getDisplayValue(year, idx + 1, 'stocks')}
                          onChange={(e) => handleChange(year, idx + 1, 'stocks', e.target.value)}
                          onFocus={() => handleFocus(year, idx + 1, 'stocks')}
                          onBlur={handleBlur}
                        />
                      </td>
                      <td key={`${year}-${idx + 1}-aerospace`} className="py-1 px-1">
                        <Input
                          type="text"
                          className="h-8 text-right text-sm"
                          placeholder="$0.00"
                          value={getDisplayValue(year, idx + 1, 'aerospace')}
                          onChange={(e) => handleChange(year, idx + 1, 'aerospace', e.target.value)}
                          onFocus={() => handleFocus(year, idx + 1, 'aerospace')}
                          onBlur={handleBlur}
                        />
                      </td>
                      <td key={`${year}-${idx + 1}-combined`} className="py-1 px-2 text-right font-medium bg-muted/30">
                        {formatCurrency(getMonthTotal(year, idx + 1, ['stocks', 'aerospace']))}
                      </td>
                    </>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted font-medium">
                <td className="py-2 px-3">Year Totals</td>
                {YEARS.map(year => (
                  <>
                    <td key={`${year}-total-stocks`} className="py-2 px-2 text-right border-l">
                      {formatCurrency(getYearTotal(year, 'stocks'))}
                    </td>
                    <td key={`${year}-total-aerospace`} className="py-2 px-2 text-right">
                      {formatCurrency(getYearTotal(year, 'aerospace'))}
                    </td>
                    <td key={`${year}-total-combined`} className="py-2 px-2 text-right font-bold">
                      {formatCurrency(getYearTotal(year, 'stocks') + getYearTotal(year, 'aerospace'))}
                    </td>
                  </>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-2xl">Historical Data Entry</CardTitle>
            <CardDescription>
              Enter monthly financial data from previous systems for comparison with current analytics
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={saveMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!hasChanges || saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="credit_card">Credit Card Processing</TabsTrigger>
              <TabsTrigger value="revenue">Total Revenue</TabsTrigger>
            </TabsList>
            <TabsContent value="credit_card">
              {renderCreditCardTab()}
            </TabsContent>
            <TabsContent value="revenue">
              {renderRevenueTab()}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

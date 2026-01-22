import { useState, useEffect } from 'react';
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

function parseCurrency(value: string): string {
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return '0';
  return num.toString();
}

export default function HistoricalDataEntry() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('credit_card');
  const [editedData, setEditedData] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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

  const renderCreditCardTab = () => {
    const categories = ['online', 'phone'];
    
    return (
      <div className="space-y-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3 text-left font-medium">Month</th>
                {YEARS.map(year => (
                  <th key={year} colSpan={2} className="py-2 px-3 text-center font-medium border-l">
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
    const categories = ['aerospace', 'combined'];
    
    return (
      <div className="space-y-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 px-3 text-left font-medium">Month</th>
                {YEARS.map(year => (
                  <th key={year} colSpan={2} className="py-2 px-3 text-center font-medium border-l">
                    {year}
                  </th>
                ))}
              </tr>
              <tr className="border-b bg-muted/50">
                <th className="py-1 px-3"></th>
                {YEARS.map(year => (
                  <>
                    <th key={`${year}-aerospace`} className="py-1 px-2 text-center text-xs text-muted-foreground border-l">
                      Aerospace
                    </th>
                    <th key={`${year}-combined`} className="py-1 px-2 text-center text-xs text-muted-foreground">
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
                      <td key={`${year}-${idx + 1}-aerospace`} className="py-1 px-1 border-l">
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
                      <td key={`${year}-${idx + 1}-combined`} className="py-1 px-1">
                        <Input
                          type="text"
                          className="h-8 text-right text-sm"
                          placeholder="$0.00"
                          value={getDisplayValue(year, idx + 1, 'combined')}
                          onChange={(e) => handleChange(year, idx + 1, 'combined', e.target.value)}
                          onFocus={() => handleFocus(year, idx + 1, 'combined')}
                          onBlur={handleBlur}
                        />
                      </td>
                    </>
                  ))}
                </tr>
              ))}
              <tr className="bg-muted font-medium">
                <td className="py-2 px-3">Year Totals</td>
                {YEARS.map(year => (
                  <>
                    <td key={`${year}-total-aerospace`} className="py-2 px-2 text-right border-l">
                      {formatCurrency(getYearTotal(year, 'aerospace'))}
                    </td>
                    <td key={`${year}-total-combined`} className="py-2 px-2 text-right">
                      {formatCurrency(getYearTotal(year, 'combined'))}
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

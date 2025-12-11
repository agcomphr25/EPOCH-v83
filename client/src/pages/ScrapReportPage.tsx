import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

interface ScrapData {
  totalScrapped: number;
  month: number;
  year: number;
  monthName: string;
  orders: { 
    orderId: string; 
    customer: string;
    product: string;
    scrapDate: string; 
    scrapReason: string;
    scrapDisposition: string;
  }[];
}

const MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

export default function ScrapReportPage() {
  const currentDate = new Date();
  const [scrapMonth, setScrapMonth] = useState(String(currentDate.getMonth() + 1));
  const [scrapYear, setScrapYear] = useState(String(currentDate.getFullYear()));

  const { data: scrapData, isLoading } = useQuery<ScrapData>({
    queryKey: ['/api/finance/scrap-report', scrapMonth, scrapYear],
    queryFn: async () => {
      const response = await fetch(`/api/finance/scrap-report?month=${scrapMonth}&year=${scrapYear}`);
      if (!response.ok) throw new Error('Failed to fetch scrap data');
      return response.json();
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/finance/dashboard">
          <Button variant="ghost" size="sm" data-testid="button-back-finance">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Finance
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            Scrap Report
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track orders that were scrapped by month
          </p>
        </div>
      </div>

      <Card data-testid="widget-scrap-report">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-red-100">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <span>Scrap Summary</span>
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Select value={scrapMonth} onValueChange={setScrapMonth}>
              <SelectTrigger className="w-32" data-testid="select-scrap-month">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={scrapYear} onValueChange={setScrapYear}>
              <SelectTrigger className="w-24" data-testid="select-scrap-year">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-red-600" />
            </div>
          ) : scrapData ? (
            <div className="space-y-6">
              <div className="text-center py-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-4xl font-bold text-red-600" data-testid="text-scrap-total">
                  {scrapData.totalScrapped}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Orders scrapped in {scrapData.monthName} {scrapData.year}
                </p>
              </div>
              {scrapData.orders.length > 0 ? (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-500 mb-3">Order Details:</p>
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {scrapData.orders.map((order) => (
                      <div key={order.orderId} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-sm font-medium" data-testid={`text-order-id-${order.orderId}`}>
                              {order.orderId}
                            </span>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {order.customer} - {order.product}
                            </p>
                          </div>
                          <span className="text-xs text-gray-500">
                            {new Date(order.scrapDate).toLocaleDateString()}
                          </span>
                        </div>
                        {order.scrapReason && (
                          <p className="text-sm text-red-600 mt-1">
                            <strong>Reason:</strong> {order.scrapReason}
                          </p>
                        )}
                        {order.scrapDisposition && (
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            <strong>Disposition:</strong> {order.scrapDisposition}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="border-t pt-4">
                  <p className="text-center text-gray-500 py-4">
                    No orders were scrapped during this period
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No scrap data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { DollarSign, Loader2, ArrowLeft, ChevronDown, Package } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

interface CategoryData {
  category: string;
  total: number;
  count: number;
  orders: { orderId: string; amount: number; detail: string }[];
}

interface InvoiceBreakdownData {
  grandTotal: number;
  totalOrders: number;
  month: number;
  year: number;
  monthName: string;
  categories: CategoryData[];
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

const CATEGORY_COLORS: Record<string, string> = {
  'Stock Model': 'bg-blue-100 text-blue-800',
  'Bottom Metal': 'bg-green-100 text-green-800',
  'QDs': 'bg-purple-100 text-purple-800',
  'Texture': 'bg-orange-100 text-orange-800',
  'Rails': 'bg-cyan-100 text-cyan-800',
  'LOP': 'bg-pink-100 text-pink-800',
  'Paint': 'bg-yellow-100 text-yellow-800',
  'Swivels': 'bg-indigo-100 text-indigo-800',
  'Other': 'bg-gray-100 text-gray-800',
};

export default function InvoiceCategoryBreakdownPage() {
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(currentDate.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(currentDate.getFullYear()));
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set([
    'Stock Model', 'Bottom Metal', 'QDs', 'Texture', 'Rails', 'LOP', 'Paint', 'Swivels', 'Other'
  ]));

  const { data: breakdownData, isLoading } = useQuery<InvoiceBreakdownData>({
    queryKey: ['/api/finance/invoice-category-breakdown', selectedMonth, selectedYear],
    queryFn: async () => {
      const response = await fetch(`/api/finance/invoice-category-breakdown?month=${selectedMonth}&year=${selectedYear}`);
      if (!response.ok) throw new Error('Failed to fetch invoice breakdown');
      return response.json();
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    setSelectedCategories(new Set([
      'Stock Model', 'Bottom Metal', 'QDs', 'Texture', 'Rails', 'LOP', 'Paint', 'Swivels', 'Other'
    ]));
  };

  const deselectAll = () => {
    setSelectedCategories(new Set());
  };

  const filteredTotal = breakdownData?.categories
    .filter(cat => selectedCategories.has(cat.category))
    .reduce((sum, cat) => sum + cat.total, 0) || 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
            Invoice Category Breakdown
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            View invoice totals by category with customizable filtering
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-blue-100">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <span>Select Period</span>
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-32" data-testid="select-breakdown-month">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-24" data-testid="select-breakdown-year">
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
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : breakdownData ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Categories Total</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-blue-600" data-testid="text-filtered-total">
                  {formatCurrency(filteredTotal)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {selectedCategories.size} of {breakdownData.categories.length} categories selected
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Grand Total (All Categories)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold text-gray-600" data-testid="text-grand-total">
                  {formatCurrency(breakdownData.grandTotal)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {breakdownData.totalOrders} invoices for {breakdownData.monthName} {breakdownData.year}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Category Selection</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">
                    Select All
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll} data-testid="button-deselect-all">
                    Deselect All
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {breakdownData.categories.map((cat) => (
                  <div key={cat.category} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${cat.category}`}
                      checked={selectedCategories.has(cat.category)}
                      onCheckedChange={() => toggleCategory(cat.category)}
                      data-testid={`checkbox-category-${cat.category.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <label
                      htmlFor={`category-${cat.category}`}
                      className={`text-sm font-medium px-2 py-1 rounded cursor-pointer ${CATEGORY_COLORS[cat.category] || 'bg-gray-100 text-gray-800'}`}
                    >
                      {cat.category} ({formatCurrency(cat.total)})
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg">
                <Package className="w-5 h-5" />
                <span>Category Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                {breakdownData.categories
                  .filter(cat => selectedCategories.has(cat.category))
                  .map((cat) => (
                    <AccordionItem key={cat.category} value={cat.category} data-testid={`accordion-${cat.category.toLowerCase().replace(/\s+/g, '-')}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${CATEGORY_COLORS[cat.category] || 'bg-gray-100 text-gray-800'}`}>
                              {cat.category}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {cat.count} items
                            </span>
                          </div>
                          <span className="font-semibold text-lg" data-testid={`text-category-total-${cat.category.toLowerCase().replace(/\s+/g, '-')}`}>
                            {formatCurrency(cat.total)}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pt-2">
                          {cat.orders.length > 0 ? (
                            <div className="max-h-60 overflow-y-auto space-y-2">
                              {cat.orders.map((order, idx) => (
                                <div
                                  key={`${order.orderId}-${idx}`}
                                  className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                                >
                                  <div className="flex flex-col">
                                    <span className="font-mono text-sm">{order.orderId}</span>
                                    <span className="text-xs text-muted-foreground">{order.detail}</span>
                                  </div>
                                  <span className="font-medium text-green-600">
                                    {formatCurrency(order.amount)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No order details available for this category
                            </p>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">No invoice data available for the selected period</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

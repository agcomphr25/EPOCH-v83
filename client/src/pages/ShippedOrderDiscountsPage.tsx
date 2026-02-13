import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Percent, Loader2, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';

type OrderSortKey = 'orderId' | 'discountAmount' | 'discountType';
type SortDir = 'asc' | 'desc';

interface ShippedDiscountsData {
  totalDiscountAmount: number;
  orderCount: number;
  month: number;
  year: number;
  monthName: string;
  orders: { orderId: string; discountAmount: number; discountType: string }[];
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

export default function ShippedOrderDiscountsPage() {
  const currentDate = new Date();
  const [discountMonth, setDiscountMonth] = useState(String(currentDate.getMonth() + 1));
  const [discountYear, setDiscountYear] = useState(String(currentDate.getFullYear()));
  const [sortKey, setSortKey] = useState<OrderSortKey>('orderId');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: shippedDiscounts, isLoading: isDiscountsLoading } = useQuery<ShippedDiscountsData>({
    queryKey: ['/api/finance/shipped-order-discounts', discountMonth, discountYear],
    queryFn: async () => {
      const response = await fetch(`/api/finance/shipped-order-discounts?month=${discountMonth}&year=${discountYear}`);
      if (!response.ok) throw new Error('Failed to fetch discount data');
      return response.json();
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const handleSort = (key: OrderSortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'discountAmount' ? 'desc' : 'asc');
    }
  };

  const sortedOrders = shippedDiscounts?.orders ? [...shippedDiscounts.orders].sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    let cmp = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      cmp = valA - valB;
    } else {
      cmp = String(valA).localeCompare(String(valB));
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }) : [];

  const SortIcon = ({ col }: { col: OrderSortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === 'asc'
      ? <ArrowUp className="ml-1 h-3 w-3 inline" />
      : <ArrowDown className="ml-1 h-3 w-3 inline" />;
  };

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
            Shipped Order Discounts
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track income reduction from discounts on shipped orders
          </p>
        </div>
      </div>

      <Card data-testid="widget-shipped-discounts">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-amber-100">
              <Percent className="w-5 h-5 text-amber-600" />
            </div>
            <span>Discount Summary</span>
          </CardTitle>
          <div className="flex gap-2 mt-2">
            <Select value={discountMonth} onValueChange={setDiscountMonth}>
              <SelectTrigger className="w-32" data-testid="select-discount-month">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={discountYear} onValueChange={setDiscountYear}>
              <SelectTrigger className="w-24" data-testid="select-discount-year">
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
          {isDiscountsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            </div>
          ) : shippedDiscounts ? (
            <div className="space-y-6">
              <div className="text-center py-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-4xl font-bold text-amber-600" data-testid="text-discount-total">
                  {formatCurrency(shippedDiscounts.totalDiscountAmount)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  Income reduction for {shippedDiscounts.monthName} {shippedDiscounts.year}
                </p>
              </div>
              <div className="border-t pt-4">
                <p className="text-lg text-gray-700 dark:text-gray-300">
                  <span className="font-semibold">{shippedDiscounts.orderCount}</span> shipped orders with discounts
                </p>
              </div>
              {shippedDiscounts.orders.length > 0 && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-1 p-3 bg-gray-100 dark:bg-gray-700 rounded-t-lg text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    <span className="flex-1 cursor-pointer select-none hover:text-gray-900 dark:hover:text-white" onClick={() => handleSort('orderId')}>
                      Order ID <SortIcon col="orderId" />
                    </span>
                    <span className="cursor-pointer select-none hover:text-gray-900 dark:hover:text-white text-right w-32" onClick={() => handleSort('discountType')}>
                      Type <SortIcon col="discountType" />
                    </span>
                    <span className="cursor-pointer select-none hover:text-gray-900 dark:hover:text-white text-right w-36" onClick={() => handleSort('discountAmount')}>
                      Amount <SortIcon col="discountAmount" />
                    </span>
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-1">
                    {sortedOrders.map((order) => (
                      <div key={order.orderId} className="flex items-center gap-1 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <span className="flex-1 font-mono text-sm" data-testid={`text-order-id-${order.orderId}`}>{order.orderId}</span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 text-right w-32">{order.discountType}</span>
                        <span className="text-amber-600 font-medium text-right w-36" data-testid={`text-order-discount-${order.orderId}`}>
                          {formatCurrency(order.discountAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No discount data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

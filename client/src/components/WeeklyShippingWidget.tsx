import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, Calendar } from 'lucide-react';
import { getCurrentCompanyWeek, formatWeekRange } from '@shared/weekUtils';
import { Link } from 'wouter';

export default function WeeklyShippingWidget() {
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentCompanyWeek();

  // Fetch all orders
  const { data: orders } = useQuery<any[]>({
    queryKey: ['/api/orders/with-payment-status'],
    queryFn: async () => {
      const response = await fetch('/api/orders/with-payment-status');
      if (!response.ok) throw new Error('Failed to fetch orders');
      return response.json();
    }
  });

  // Calculate current week stocks shipped
  const currentWeekShipped = orders?.filter(order => 
    order.currentDepartment === 'Fulfilled' || order.status === 'FULFILLED'
  ).length || 0;

  return (
    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-blue-600" />
          Weekly Shipping Tracker
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600">Current Week</div>
              <div className="text-2xl font-bold text-blue-600">Week {currentWeek}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Stocks Shipped</div>
              <div className="text-3xl font-bold text-green-600">{currentWeekShipped}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="h-3 w-3" />
            <span>{formatWeekRange(currentWeek, currentYear)}</span>
          </div>
          <Link href="/shipping-tracker">
            <div className="mt-3 text-center">
              <button className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 mx-auto">
                <TrendingUp className="h-4 w-4" />
                View Full Tracker
              </button>
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

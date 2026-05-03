import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Truck } from 'lucide-react';
import { Link } from 'wouter';
import type { AllOrder } from '@shared/schema';
import {
  getCurrentOperationalWeek,
  getOperationalWeekStart,
  getOperationalWeekEnd,
} from '@shared/weekUtils';

export default function ShippingTrackerWidget() {
  const { data: orders, isLoading } = useQuery<AllOrder[]>({
    queryKey: ['/api/orders/with-payment-status'],
    staleTime: 30000,
    refetchInterval: 30000,
  });

  // Get current operational week's start and end dates (Wednesday-Tuesday)
  const { week: currentWeek, year: currentOpYear } = getCurrentOperationalWeek();
  const startOfWeek = getOperationalWeekStart(currentWeek, currentOpYear);
  const endOfWeek = getOperationalWeekEnd(currentWeek, currentOpYear);

  // Filter for orders shipped this week
  const shippedThisWeek = (orders ?? []).filter((order) => {
    if (!order.shippedDate) return false;
    const shippedDate = new Date(order.shippedDate);
    return shippedDate >= startOfWeek && shippedDate <= endOfWeek;
  }).length;

  if (isLoading) {
    return (
      <Link href="/department-queue/shipping" data-testid="link-shipping-tracker">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200">
          <CardContent className="p-4 text-center">
            <Truck className="w-8 h-8 text-blue-600 mx-auto mb-3 animate-pulse" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Stocks Shipped This Week (...)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Click to view all shipments
            </p>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href="/department-queue/shipping" data-testid="link-shipping-tracker">
      <Card 
        className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-200"
        data-testid="card-shipping-tracker"
      >
        <CardContent className="p-4 text-center">
          <Truck className="w-8 h-8 text-blue-600 mx-auto mb-3" />
          <h3 
            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
            data-testid="text-shipped-count"
          >
            Stocks Shipped This Week ({shippedThisWeek})
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Click to view all shipments
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

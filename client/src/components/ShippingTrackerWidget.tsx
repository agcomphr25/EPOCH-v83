import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Truck } from 'lucide-react';
import { Link } from 'wouter';
import type { AllOrder } from '@shared/schema';

export default function ShippingTrackerWidget() {
  const { data: orders, isLoading } = useQuery<AllOrder[]>({
    queryKey: ['/api/orders/with-payment-status'],
    staleTime: 30000, // Refresh every 30 seconds
  });

  // Get current week's start and end dates
  const getCurrentWeekRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek); // Start from Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // End on Saturday
    endOfWeek.setHours(23, 59, 59, 999);
    
    return { startOfWeek, endOfWeek };
  };

  // Filter for orders shipped this week
  const { startOfWeek, endOfWeek } = getCurrentWeekRange();
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
              Shipped This Week
            </h3>
            <p className="text-2xl font-bold text-blue-600 mt-2">
              ...
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
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Shipped This Week
          </h3>
          <p 
            className="text-2xl font-bold text-blue-600 mt-2"
            data-testid="text-shipped-count"
          >
            {shippedThisWeek}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Click to view all shipments
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

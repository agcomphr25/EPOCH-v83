import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Package, ExternalLink, Calendar, AlertCircle } from 'lucide-react';
import { Link } from 'wouter';

interface ShippedOrder {
  orderId: string;
  customerName?: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  shippedDate?: string;
  estimatedDelivery?: string;
  deliveryConfirmed?: boolean;
  currentDepartment?: string;
}

export default function ShippingTrackerWidget() {
  const { data: orders, isLoading } = useQuery<ShippedOrder[]>({
    queryKey: ['/api/orders/with-payment-status'],
    staleTime: 30000, // Refresh every 30 seconds
  });

  // Filter for shipped orders (those with tracking numbers or in shipping department)
  const shippedOrders = orders?.filter(
    (order: any) =>
      order.trackingNumber ||
      order.currentDepartment === 'Shipping' ||
      order.currentDepartment === 'Shipping QC'
  ).slice(0, 5); // Show only latest 5

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTrackingUrl = (trackingNumber: string, carrier?: string) => {
    const upperCarrier = carrier?.toUpperCase();
    if (upperCarrier === 'UPS') {
      return `https://www.ups.com/track?tracknum=${trackingNumber}`;
    } else if (upperCarrier === 'FEDEX') {
      return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
    } else if (upperCarrier === 'USPS') {
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-blue-100">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <span>Shipping Tracker</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Package className="w-5 h-5 animate-pulse mr-2" />
            Loading shipments...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!shippedOrders || shippedOrders.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-blue-100">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <span>Shipping Tracker</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Package className="w-5 h-5 mr-2" />
            No active shipments
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-lg">
            <div className="p-2 rounded-lg bg-blue-100">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <span>Shipping Tracker</span>
          </div>
          <Badge variant="secondary">{shippedOrders.length} Active</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {shippedOrders.map((order: any) => {
            const trackingUrl = order.trackingNumber
              ? getTrackingUrl(order.trackingNumber, order.shippingCarrier)
              : null;

            return (
              <div
                key={order.orderId}
                className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                data-testid={`shipping-tracker-order-${order.orderId}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <Link href={`/order-entry?orderId=${order.orderId}`}>
                      <h4 className="font-semibold text-blue-600 hover:underline cursor-pointer">
                        {order.orderId}
                      </h4>
                    </Link>
                    {order.customerName && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {order.customerName}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={order.trackingNumber ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {order.currentDepartment || 'Processing'}
                  </Badge>
                </div>

                {order.trackingNumber ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        Tracking:
                      </span>
                      <div className="flex items-center gap-2">
                        <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                          {order.trackingNumber}
                        </code>
                        {trackingUrl && (
                          <a
                            href={trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700"
                            data-testid={`tracking-link-${order.orderId}`}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {order.shippingCarrier && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Carrier:
                        </span>
                        <span className="font-medium">{order.shippingCarrier}</span>
                      </div>
                    )}

                    {order.shippedDate && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Shipped:
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(order.shippedDate)}
                        </span>
                      </div>
                    )}

                    {order.estimatedDelivery && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Est. Delivery:
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(order.estimatedDelivery)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>Awaiting tracking number</span>
                  </div>
                )}
              </div>
            );
          })}

          <Link href="/department-queue/shipping">
            <Button
              variant="outline"
              className="w-full mt-2"
              data-testid="view-all-shipments-button"
            >
              View All Shipments
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

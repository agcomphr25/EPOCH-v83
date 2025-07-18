import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { FileText, Package, Settings, CreditCard, User, Calendar } from 'lucide-react';

interface Order {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerPO: string;
  fbOrderNumber: string;
  agrOrderDetails: string;
  modelId: string;
  handedness: string;
  shankLength: string;
  features: any;
  featureQuantities: any;
  discountCode: string;
  shipping: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderPricingTooltipProps {
  orderId: string;
  children: React.ReactNode;
}

export default function OrderPricingTooltip({ orderId, children }: OrderPricingTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Fetch order details
  const { data: order, isLoading } = useQuery<Order>({
    queryKey: [`/api/orders/${orderId}`],
    enabled: isOpen && !!orderId,
  });

  // Helper function to get payment status
  const getPaymentStatus = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return { label: 'Paid', variant: 'default' as const, icon: CreditCard };
      case 'pending':
        return { label: 'Payment Pending', variant: 'secondary' as const, icon: CreditCard };
      case 'draft':
        return { label: 'Draft - Not Invoiced', variant: 'outline' as const, icon: FileText };
      case 'cancelled':
        return { label: 'Cancelled', variant: 'destructive' as const, icon: FileText };
      default:
        return { label: 'Unknown Status', variant: 'secondary' as const, icon: CreditCard };
    }
  };

  const paymentStatus = order ? getPaymentStatus(order.status) : null;

  return (
    <HoverCard open={isOpen} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors">
          {children}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 p-4" align="start">
        <div className="space-y-4">
          {/* Order Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <span className="font-medium">Order {orderId}</span>
            </div>
            {paymentStatus && (
              <Badge variant={paymentStatus.variant} className="text-xs">
                <paymentStatus.icon className="h-3 w-3 mr-1" />
                {paymentStatus.label}
              </Badge>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-4 text-sm text-gray-500">
              Loading order details...
            </div>
          )}

          {/* Order Details */}
          {order && (
            <div className="space-y-3">
              {/* Customer PO */}
              {order.customerPO && (
                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Customer PO:</span>
                  <span>{order.customerPO}</span>
                </div>
              )}

              {/* Order Dates */}
              <div className="border-t pt-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">Order Date:</span>
                    </div>
                    <div className="text-gray-600 ml-6">
                      {new Date(order.orderDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">Due Date:</span>
                    </div>
                    <div className="text-gray-600 ml-6">
                      {new Date(order.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Information */}
              {order.modelId && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Package className="h-4 w-4 text-gray-500" />
                    <span>Product Details</span>
                  </div>
                  <div className="text-sm ml-6">
                    <div className="mb-1">
                      <span className="font-medium">Model:</span>
                      <span className="ml-2 text-gray-600">{order.modelId}</span>
                    </div>
                    {order.handedness && (
                      <div className="mb-1">
                        <span className="font-medium">Handedness:</span>
                        <span className="ml-2 text-gray-600">{order.handedness}</span>
                      </div>
                    )}
                    {order.shankLength && (
                      <div className="mb-1">
                        <span className="font-medium">Shank Length:</span>
                        <span className="ml-2 text-gray-600">{order.shankLength}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Features/Options */}
              {order.features && Object.keys(order.features).length > 0 && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Settings className="h-4 w-4 text-gray-500" />
                    <span>Selected Features</span>
                  </div>
                  <div className="text-sm ml-6 space-y-1">
                    {Object.entries(order.features).map(([key, value]) => {
                      if (!value || value === 'none' || value === '') return null;
                      
                      // Format the feature name
                      const featureName = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                      
                      return (
                        <div key={key} className="flex justify-between">
                          <span className="font-medium">{featureName}:</span>
                          <span className="text-gray-600 ml-2">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Additional Information */}
              {(order.fbOrderNumber || order.agrOrderDetails) && (
                <div className="border-t pt-3">
                  <div className="text-sm space-y-2">
                    {order.fbOrderNumber && (
                      <div>
                        <span className="font-medium">FB Order Number:</span>
                        <span className="ml-2 text-gray-600">{order.fbOrderNumber}</span>
                      </div>
                    )}
                    {order.agrOrderDetails && (
                      <div>
                        <span className="font-medium">AGR Order Details:</span>
                        <span className="ml-2 text-gray-600">{order.agrOrderDetails}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
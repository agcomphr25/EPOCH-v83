import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, FileText, Package, Truck, Tag, CreditCard } from 'lucide-react';

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

              {/* Pricing Summary Labels */}
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 text-sm font-medium mb-3">
                  <DollarSign className="h-4 w-4 text-gray-500" />
                  <span>Pricing Summary</span>
                </div>
                
                <div className="space-y-2 text-sm ml-6">
                  {/* Base Price */}
                  <div className="flex justify-between">
                    <span>Base Price:</span>
                    <span className="text-gray-400">***</span>
                  </div>

                  {/* Features Total */}
                  <div className="flex justify-between">
                    <span>Features Total:</span>
                    <span className="text-gray-400">***</span>
                  </div>

                  {/* Additional Items */}
                  <div className="flex justify-between">
                    <span>Additional Items:</span>
                    <span className="text-gray-400">***</span>
                  </div>

                  {/* Shipping */}
                  <div className="flex justify-between">
                    <span>Shipping & Handling:</span>
                    <span className="text-gray-400">***</span>
                  </div>

                  {/* Discount */}
                  {order.discountCode && order.discountCode !== 'none' && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount Applied:</span>
                      <span className="text-gray-400">***</span>
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total:</span>
                    <span className="text-gray-400">***</span>
                  </div>
                </div>
              </div>

              {/* Discount Information */}
              {order.discountCode && order.discountCode !== 'none' && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Tag className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">Discount Code:</span>
                    <Badge variant="outline" className="text-xs">
                      {order.discountCode}
                    </Badge>
                  </div>
                </div>
              )}

              {/* Order Details */}
              <div className="border-t pt-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Order Date:</span>
                    <div className="text-gray-600">
                      {new Date(order.orderDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Due Date:</span>
                    <div className="text-gray-600">
                      {new Date(order.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Model Information */}
              {order.modelId && (
                <div className="border-t pt-3">
                  <div className="text-sm">
                    <span className="font-medium">Model:</span>
                    <div className="text-gray-600 mt-1">
                      {order.modelId}
                      {order.handedness && (
                        <span className="ml-2 text-gray-500">
                          ({order.handedness})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Note about pricing */}
              <div className="border-t pt-3">
                <div className="text-xs text-gray-500 italic">
                  * Pricing details hidden for privacy
                </div>
              </div>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
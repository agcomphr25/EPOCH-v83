import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Calendar, Package, User, DollarSign } from 'lucide-react';
import type { OrderDraft } from '@shared/schema';

export default function OutstandingOrdersCard() {
  // Load outstanding orders (orders that are not COMPLETED)
  const { data: orders = [], isLoading } = useQuery<OrderDraft[]>({
    queryKey: ['/api/orders/outstanding'],
    queryFn: () => apiRequest('/api/orders/outstanding'),
  });

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'bg-gray-100 text-gray-800';
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'CONFIRMED': return 'bg-blue-100 text-blue-800';
      case 'IN_PRODUCTION': return 'bg-purple-100 text-purple-800';
      case 'READY': return 'bg-green-100 text-green-800';
      case 'SHIPPED': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const calculateOrderTotal = (order: OrderDraft) => {
    // Basic calculation - in real app, you'd calculate based on model price + features
    return Math.random() * 1000 + 500; // Placeholder calculation
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Outstanding Orders</h3>
        <div className="text-sm text-gray-500">
          {orders.length} active orders
        </div>
      </div>

      {/* Outstanding Orders Grid */}
      {isLoading ? (
        <div className="text-center py-8">Loading outstanding orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No outstanding orders found
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <div key={order.id} className="border rounded-lg p-4 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">Order {order.orderId}</h4>
                  {order.customerPO && (
                    <p className="text-sm text-gray-600">PO: {order.customerPO}</p>
                  )}
                </div>
                <Badge className={getStatusBadgeColor(order.status)}>
                  {order.status}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                {order.customerId && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span>{order.customerId}</span>
                  </div>
                )}

                {order.modelId && (
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-gray-400" />
                    <span>{order.modelId}</span>
                    {order.handedness && <span className="text-gray-500">({order.handedness})</span>}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  <span>Due: {formatDate(order.dueDate)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-gray-400" />
                  <span>Est: ${calculateOrderTotal(order).toFixed(2)}</span>
                  {order.shipping && order.shipping > 0 && (
                    <span className="text-gray-500">+ ${order.shipping.toFixed(2)} shipping</span>
                  )}
                </div>

                {order.agrOrderDetails && (
                  <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                    {order.agrOrderDetails}
                  </div>
                )}
              </div>

              {/* Progress indicator based on status */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: order.status === 'DRAFT' ? '10%' :
                           order.status === 'PENDING' ? '25%' :
                           order.status === 'CONFIRMED' ? '40%' :
                           order.status === 'IN_PRODUCTION' ? '70%' :
                           order.status === 'READY' ? '90%' :
                           order.status === 'SHIPPED' ? '100%' : '10%'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
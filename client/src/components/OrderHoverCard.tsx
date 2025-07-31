import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Calendar, 
  User, 
  Package, 
  CreditCard, 
  MapPin, 
  Building,
  Clock,
  Hash,
  FileText,
  CheckCircle,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface OrderHoverCardProps {
  orderId: string;
  children: React.ReactNode;
}

interface DetailedOrder {
  id: number;
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerPO?: string;
  fbOrderNumber?: string;
  agrOrderDetails?: string;
  modelId: string;
  handedness?: string;
  features?: any;
  discountCode?: string;
  notes?: string;
  shipping?: number;
  status: string;
  currentDepartment: string;
  isPaid?: boolean;
  paymentType?: string;
  paymentAmount?: number;
  isReplacement?: boolean;
  replacedOrderId?: string;
  scrapReason?: string;
  createdAt: string;
}

export default function OrderHoverCard({ orderId, children }: OrderHoverCardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  const { data: order, isLoading } = useQuery<DetailedOrder>({
    queryKey: ['/api/orders', orderId],
    queryFn: () => apiRequest(`/api/orders/${orderId}`),
    enabled: isHovered,
  });

  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
    enabled: isHovered,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['/api/payments', orderId],
    queryFn: () => apiRequest(`/api/payments?orderId=${orderId}`),
    enabled: isHovered,
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const getModelDisplayName = (modelId: string) => {
    if (!modelId || !stockModels || stockModels.length === 0) {
      return modelId || 'Unknown Model';
    }
    const model = (stockModels as any[]).find((m: any) => m && m.id === modelId);
    return model?.displayName || model?.name || modelId;
  };

  const getDepartmentBadgeColor = (department: string) => {
    const colors: { [key: string]: string } = {
      'Layup': 'bg-blue-500',
      'Plugging': 'bg-orange-500',
      'CNC': 'bg-green-500',
      'Finish': 'bg-yellow-500',
      'Gunsmith': 'bg-purple-500',
      'Paint': 'bg-pink-500',
      'QC': 'bg-indigo-500',
      'Shipping': 'bg-gray-500'
    };
    return colors[department] || 'bg-gray-400';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const renderFeatures = (features: any) => {
    if (!features || typeof features !== 'object') return null;
    
    const entries = Object.entries(features);
    if (entries.length === 0) return null;
    
    return entries.slice(0, 3).map(([key, value]) => (
      <div key={key} className="flex justify-between text-xs">
        <span className="text-gray-600 capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
        <span className="font-medium ml-2 truncate max-w-24">{String(value)}</span>
      </div>
    ));
  };

  const totalPayments = payments.reduce((sum: number, payment: any) => sum + (payment.paymentAmount || 0), 0);

  return (
    <HoverCard 
      openDelay={300} 
      closeDelay={100}
      onOpenChange={(open) => setIsHovered(open)}
    >
      <HoverCardTrigger asChild>
        {children}
      </HoverCardTrigger>
      <HoverCardContent className="w-96 p-4" side="right" align="start">
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            <span className="ml-2 text-sm text-gray-600">Loading order details...</span>
          </div>
        ) : order ? (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-gray-900">Order {order.orderId}</span>
              </div>
              <Badge variant={order.status === 'SCRAPPED' ? 'destructive' : 'default'}>
                {order.status || 'ACTIVE'}
              </Badge>
            </div>

            <Separator />

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3 text-gray-500" />
                <div>
                  <div className="text-gray-600">Order Date</div>
                  <div className="font-medium">{formatDate(order.orderDate)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-gray-500" />
                <div>
                  <div className="text-gray-600">Due Date</div>
                  <div className="font-medium">{formatDate(order.dueDate)}</div>
                </div>
              </div>
            </div>

            {/* Customer & Product */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <User className="h-3 w-3 text-gray-500" />
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium">{order.customerId}</span>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-3 w-3 text-gray-500" />
                <span className="text-gray-600">Model:</span>
                <span className="font-medium">{getModelDisplayName(order.modelId)}</span>
              </div>
              {order.handedness && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 ml-5">Handedness:</span>
                  <span className="font-medium">{order.handedness}</span>
                </div>
              )}
            </div>

            {/* Department Status */}
            <div className="flex items-center gap-2">
              <Building className="h-3 w-3 text-gray-500" />
              <span className="text-gray-600">Department:</span>
              <Badge className={`${getDepartmentBadgeColor(order.currentDepartment)} text-white text-xs`}>
                {order.currentDepartment}
              </Badge>
            </div>

            {/* Features (if any) */}
            {order.features && Object.keys(order.features).length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-700">Key Features:</div>
                <div className="space-y-1 pl-2">
                  {renderFeatures(order.features)}
                  {Object.keys(order.features).length > 3 && (
                    <div className="text-xs text-gray-500 italic">+{Object.keys(order.features).length - 3} more...</div>
                  )}
                </div>
              </div>
            )}

            <Separator />

            {/* Additional Details */}
            <div className="space-y-2 text-sm">
              {/* Payment Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-3 w-3 text-gray-500" />
                  <span className="text-gray-600">Payment:</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={order.isPaid ? 'default' : 'secondary'}>
                    {order.isPaid ? 'PAID' : 'UNPAID'}
                  </Badge>
                  {totalPayments > 0 && (
                    <span className="text-xs font-medium">{formatCurrency(totalPayments)}</span>
                  )}
                </div>
              </div>

              {/* Shipping */}
              {order.shipping && order.shipping > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-gray-500" />
                    <span className="text-gray-600">Shipping:</span>
                  </div>
                  <span className="font-medium">{formatCurrency(order.shipping)}</span>
                </div>
              )}

              {/* Special Order Numbers */}
              {order.fbOrderNumber && (
                <div className="flex items-center gap-2">
                  <Hash className="h-3 w-3 text-gray-500" />
                  <span className="text-gray-600">FB Order:</span>
                  <span className="font-medium">{order.fbOrderNumber}</span>
                </div>
              )}

              {order.customerPO && (
                <div className="flex items-center gap-2">
                  <FileText className="h-3 w-3 text-gray-500" />
                  <span className="text-gray-600">Customer PO:</span>
                  <span className="font-medium">{order.customerPO}</span>
                </div>
              )}

              {/* Special Conditions */}
              {order.isReplacement && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-blue-500" />
                  <span className="text-blue-700 font-medium">Replacement Order</span>
                  {order.replacedOrderId && (
                    <span className="text-xs text-gray-600">for {order.replacedOrderId}</span>
                  )}
                </div>
              )}

              {order.discountCode && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">Discount:</span>
                  <Badge variant="outline">{order.discountCode}</Badge>
                </div>
              )}
            </div>

            {/* Notes (if any) */}
            {order.notes && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-700">Notes:</div>
                <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded max-h-16 overflow-y-auto">
                  {order.notes.length > 100 ? `${order.notes.substring(0, 100)}...` : order.notes}
                </div>
              </div>
            )}

            {/* Scrap Information */}
            {order.status === 'SCRAPPED' && order.scrapReason && (
              <div className="bg-red-50 border border-red-200 rounded p-2">
                <div className="text-xs font-medium text-red-700">Scrapped:</div>
                <div className="text-xs text-red-600">{order.scrapReason}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-4 text-gray-500 text-sm">
            Failed to load order details
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
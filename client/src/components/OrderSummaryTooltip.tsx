import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Package, 
  Calendar, 
  User, 
  FileText, 
  Hash, 
  CheckCircle, 
  AlertTriangle,
  Clock,
  Building
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface OrderSummaryTooltipProps {
  children: React.ReactNode;
  orderId: string;
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
  shankLength?: string;
  features?: any;
  discountCode?: string;
  notes?: string;
  shipping?: number;
  tikkaOption?: string;
  status: string;
  currentDepartment: string;
  isPaid?: boolean;
  paymentType?: string;
  paymentAmount?: number;
  isReplacement?: boolean;
  replacedOrderId?: string;
  scrapDate?: string;
  scrapReason?: string;
  scrapDisposition?: string;
  scrapAuthorization?: string;
  createdAt: string;
  updatedAt: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Feature {
  id: string;
  name: string;
  display_name: string;
  options: Array<{ value: string; label: string; price: number }>;
}

export default function OrderSummaryTooltip({ children, orderId }: OrderSummaryTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: order, isLoading } = useQuery<DetailedOrder>({
    queryKey: ['/api/orders', orderId],
    queryFn: () => apiRequest(`/api/orders/${orderId}`),
    enabled: isOpen,
  });

  const { data: stockModels = [] } = useQuery<StockModel[]>({
    queryKey: ['/api/stock-models'],
    enabled: isOpen,
  });

  const { data: features = [] } = useQuery<Feature[]>({
    queryKey: ['/api/features'],
    enabled: isOpen,
  });

  // Helper function to get feature display value
  const getFeatureDisplayValue = (featureId: string, value: string): string => {
    const feature = features.find(f => f.id === featureId);
    if (feature && feature.options) {
      const option = feature.options.find(opt => opt.value === value);
      if (option) return option.label;
    }
    return formatBasicValue(value);
  };

  // Helper function for basic value formatting (for non-database features)
  const formatBasicValue = (value: string): string => {
    if (!value) return value;
    
    // Handle common cases
    if (value === 'right' || value === 'left') {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    
    // Convert underscores to spaces and capitalize
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Get stock model display name
  const getStockModelName = (modelId: string): string => {
    const model = stockModels.find(m => m.id === modelId);
    return model?.displayName || modelId;
  };

  return (
    <HoverCard open={isOpen} onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer hover:underline transition-all">
          {children}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 p-4" align="start">
        <div className="space-y-3">
          {isLoading && (
            <div className="text-center py-4 text-sm text-gray-500">
              Loading order details...
            </div>
          )}

          {order && (
            <>
              {/* Order Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">{order.orderId}</span>
                </div>
                <Badge className={getStatusColor(order.status)}>
                  {order.status}
                </Badge>
              </div>

              {/* Current Department */}
              <div className="flex items-center gap-2 text-sm">
                <Building className="h-4 w-4 text-gray-500" />
                <span className="font-medium">Department:</span>
                <Badge variant="secondary" className="text-xs">
                  {order.currentDepartment || 'Not Set'}
                </Badge>
              </div>

              <Separator />

              {/* Product Information */}
              {order.modelId && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Package className="h-4 w-4 text-gray-500" />
                    <span>Product Details</span>
                  </div>
                  <div className="text-sm ml-6 space-y-1">
                    <div>
                      <span className="font-medium">Model:</span>
                      <span className="ml-2 text-gray-600">
                        {getStockModelName(order.modelId)}
                      </span>
                    </div>
                    {order.handedness && (
                      <div>
                        <span className="font-medium">Handedness:</span>
                        <span className="ml-2 text-gray-600">
                          {order.handedness === 'right' ? 'Right' : order.handedness === 'left' ? 'Left' : order.handedness}
                        </span>
                      </div>
                    )}
                    {order.shankLength && (
                      <div>
                        <span className="font-medium">Shank Length:</span>
                        <span className="ml-2 text-gray-600">{order.shankLength}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Features */}
              {order.features && Object.keys(order.features).length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2">Features:</div>
                  <div className="text-sm ml-4 space-y-1">
                    {Object.entries(order.features)
                      .filter(([_, value]) => value && value !== '' && value !== 'none')
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-600 capitalize">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <span className="font-medium">
                            {getFeatureDisplayValue(key, value as string)}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {order.notes && (
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <span>Notes</span>
                  </div>
                  <div className="text-sm text-gray-600 ml-6 bg-gray-50 p-2 rounded">
                    {order.notes}
                  </div>
                </div>
              )}

              {/* Special Conditions */}
              {(order.agrOrderDetails || order.isReplacement || order.customerPO) && (
                <div>
                  <div className="text-sm font-medium mb-2">Special Conditions:</div>
                  <div className="text-sm ml-4 space-y-1">
                    {order.agrOrderDetails && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-orange-500" />
                        <span className="text-orange-700">AGR Details: {order.agrOrderDetails}</span>
                      </div>
                    )}
                    {order.isReplacement && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-blue-500" />
                        <span className="text-blue-700">
                          Replacement Order
                          {order.replacedOrderId && ` (for ${order.replacedOrderId})`}
                        </span>
                      </div>
                    )}
                    {order.customerPO && (
                      <div>
                        <span className="font-medium">Customer PO:</span>
                        <span className="ml-2 text-gray-600">{order.customerPO}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Helper function for status colors
function getStatusColor(status: string) {
  switch (status?.toUpperCase()) {
    case 'DRAFT':
      return 'bg-yellow-100 text-yellow-800';
    case 'FINALIZED':
      return 'bg-green-100 text-green-800';
    case 'SHIPPED':
      return 'bg-blue-100 text-blue-800';
    case 'CANCELLED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
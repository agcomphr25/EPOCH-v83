import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  Calendar,
  User,
  CreditCard,
  MapPin,
  FileText,
  Building,
  Hash,
  CheckCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface OrderSummaryModalProps {
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

export default function OrderSummaryModal({ children, orderId }: OrderSummaryModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const { data: order, isLoading } = useQuery<DetailedOrder>({
    queryKey: ['/api/orders', orderId],
    queryFn: () => apiRequest(`/api/orders/${orderId}`),
    enabled: isOpen,
  });

  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
    enabled: isOpen,
  });

  const { data: paymentsData = [] } = useQuery({
    queryKey: ['/api/payments', orderId],
    queryFn: () => apiRequest(`/api/payments?orderId=${orderId}`),
    enabled: isOpen,
  });

  // Handle the payments data structure - API returns { payments: [] }
  const payments = Array.isArray(paymentsData) ? paymentsData : (paymentsData?.payments || []);

  const { data: features = [] } = useQuery({
    queryKey: ['/api/features'],
    queryFn: () => apiRequest('/api/features'),
    enabled: isOpen,
  });

  const handleMouseEnter = () => {
    const timeout = setTimeout(() => {
      setIsOpen(true);
    }, 500); // 500ms delay before opening
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
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

  const getFeatureDisplayName = (featureType: string, featureValue: string) => {
    if (!features || !Array.isArray(features)) {
      // If no features data, provide basic formatting for common values
      return formatBasicValue(featureValue);
    }
    
    // Find the feature by id matching the featureType
    const feature = features.find((f: any) => f.id === featureType);
    
    if (!feature || !feature.options) {
      // If no feature definition found, provide basic formatting
      return formatBasicValue(featureValue);
    }
    
    // Parse the options if it's a string
    let options = feature.options;
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch (e) {
        return formatBasicValue(featureValue);
      }
    }
    
    // Find the option by value
    const option = options.find((opt: any) => opt.value === featureValue);
    
    return option?.label || option?.displayName || formatBasicValue(featureValue);
  };

  const formatBasicValue = (value: string) => {
    // Handle common formatting cases
    if (value === 'right' || value === 'left') {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    if (value === 'no_lop_change') {
      return 'No LOP Change';
    }
    if (value === 'grip_only') {
      return 'Grip Only';
    }
    // For other values, capitalize first letter and replace underscores
    return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
  };

  const renderFeatures = (orderFeatures: any) => {
    if (!orderFeatures || typeof orderFeatures !== 'object') return null;
    
    return Object.entries(orderFeatures).map(([key, value]) => {
      let displayValue;
      
      if (Array.isArray(value)) {
        // Handle array values (like other_options, rail_accessory)
        displayValue = value.map(v => getFeatureDisplayName(key, String(v))).join(', ');
      } else {
        // Handle single values
        displayValue = getFeatureDisplayName(key, String(value));
      }
      
      return (
        <div key={key} className="flex justify-between text-sm py-1">
          <span className="font-medium capitalize text-gray-700">
            {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}:
          </span>
          <span className="text-gray-900 ml-4">
            {displayValue}
          </span>
        </div>
      );
    });
  };

  const totalPayments = payments.reduce((sum: number, payment: any) => sum + (payment.paymentAmount || 0), 0);
  const isScrapped = order?.status === 'SCRAPPED';

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer hover:text-blue-600 transition-colors"
      >
        {children}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Summary - {orderId}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3">Loading order summary...</span>
            </div>
          ) : !order ? (
            <div className="text-center p-8 text-red-600">
              Failed to load order details. Please try again.
            </div>
          ) : (
            <div className="space-y-6">

              {/* Product Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Product Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Model:</span>
                      <span className="font-medium">{getModelDisplayName(order.modelId)}</span>
                    </div>
                    {order.handedness && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Handedness:</span>
                        <span className="font-medium">{order.handedness}</span>
                      </div>
                    )}
                    {order.shankLength && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Shank Length:</span>
                        <span className="font-medium">{order.shankLength}</span>
                      </div>
                    )}
                    {order.tikkaOption && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Tikka Option:</span>
                        <span className="font-medium">{order.tikkaOption}</span>
                      </div>
                    )}
                  </div>

                  {/* Product Features */}
                  {order.features && Object.keys(order.features).length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium text-gray-900 mb-3">Product Features</h4>
                      <div className="space-y-1 bg-gray-50 p-3 rounded">
                        {renderFeatures(order.features)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>



              {/* Order Notes */}
              {order.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Order Notes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-700 whitespace-pre-wrap">{order.notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Special Conditions */}
              {(order.isReplacement || isScrapped) && (
                <Card className={isScrapped ? "border-red-200" : "border-blue-200"}>
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-2 ${isScrapped ? "text-red-700" : "text-blue-700"}`}>
                      {isScrapped ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
                      {isScrapped ? "Scrapped Order" : "Replacement Order"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {order.isReplacement && order.replacedOrderId && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Replaces Order:</span>
                        <span className="font-medium">{order.replacedOrderId}</span>
                      </div>
                    )}
                    {isScrapped && (
                      <>
                        {order.scrapDate && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Scrap Date:</span>
                            <span className="font-medium">{formatDate(order.scrapDate)}</span>
                          </div>
                        )}
                        {order.scrapReason && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Reason:</span>
                            <span className="font-medium">{order.scrapReason}</span>
                          </div>
                        )}
                        {order.scrapDisposition && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Disposition:</span>
                            <span className="font-medium">{order.scrapDisposition}</span>
                          </div>
                        )}
                        {order.scrapAuthorization && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Authorization:</span>
                            <span className="font-medium">{order.scrapAuthorization}</span>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}


            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
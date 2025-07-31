import React from 'react';
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
  DollarSign,
  Clock,
  Building,
  Hash,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface OrderDetailsModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
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
  featureQuantities?: any;
  discountCode?: string;
  notes?: string;
  shipping?: number;
  tikkaOption?: string;
  status: string;
  currentDepartment: string;
  departmentHistory?: any[];
  barcode?: string;
  isPaid?: boolean;
  paymentType?: string;
  paymentAmount?: number;
  paymentDate?: string;
  isReplacement?: boolean;
  replacedOrderId?: string;
  // Department completion timestamps
  layupCompletedAt?: string;
  pluggingCompletedAt?: string;
  cncCompletedAt?: string;
  finishCompletedAt?: string;
  gunsmithCompletedAt?: string;
  paintCompletedAt?: string;
  qcCompletedAt?: string;
  shippingCompletedAt?: string;
  // Scrap information
  scrapDate?: string;
  scrapReason?: string;
  scrapDisposition?: string;
  scrapAuthorization?: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrderDetailsModal({ orderId, isOpen, onClose }: OrderDetailsModalProps) {
  const { data: order, isLoading, error } = useQuery<DetailedOrder>({
    queryKey: ['/api/orders', orderId],
    queryFn: () => apiRequest(`/api/orders/${orderId}`),
    enabled: !!orderId && isOpen,
  });

  // Fetch stock models to get display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
    queryFn: () => apiRequest('/api/stock-models'),
    enabled: isOpen,
  });

  // Fetch payments for the order
  const { data: payments = [] } = useQuery({
    queryKey: ['/api/payments', orderId],
    queryFn: () => apiRequest(`/api/payments?orderId=${orderId}`),
    enabled: !!orderId && isOpen,
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

  const getPaymentStatusColor = (isPaid: boolean) => {
    return isPaid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const renderFeatures = (features: any) => {
    if (!features || typeof features !== 'object') return null;
    
    return Object.entries(features).map(([key, value]) => (
      <div key={key} className="flex justify-between text-sm">
        <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
        <span className="text-gray-600">{String(value)}</span>
      </div>
    ));
  };

  const departmentCompletionFields = [
    { field: 'layupCompletedAt', name: 'Layup' },
    { field: 'pluggingCompletedAt', name: 'Plugging' },
    { field: 'cncCompletedAt', name: 'CNC' },
    { field: 'finishCompletedAt', name: 'Finish' },
    { field: 'gunsmithCompletedAt', name: 'Gunsmith' },
    { field: 'paintCompletedAt', name: 'Paint' },
    { field: 'qcCompletedAt', name: 'QC' },
    { field: 'shippingCompletedAt', name: 'Shipping' },
  ];

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Loading Order Details...</DialogTitle>
          </DialogHeader>
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error || !order) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Error Loading Order</DialogTitle>
          </DialogHeader>
          <div className="p-8 text-center text-red-600">
            Failed to load order details. Please try again.
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isScrapped = order.status === 'SCRAPPED';
  const totalPayments = payments.reduce((sum: number, payment: any) => sum + (payment.paymentAmount || 0), 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Order {order.orderId} - Details Summary
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Basic Order Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Order Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Order ID:</span>
                    <span className="font-medium">{order.orderId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Order Date:</span>
                    <span className="font-medium">{formatDate(order.orderDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Due Date:</span>
                    <span className="font-medium">{formatDate(order.dueDate)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={isScrapped ? 'destructive' : 'default'}>
                      {order.status || 'ACTIVE'}
                    </Badge>
                  </div>
                </div>

                {order.fbOrderNumber && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">FB Order Number:</span>
                    <span className="font-medium">{order.fbOrderNumber}</span>
                  </div>
                )}

                {order.agrOrderDetails && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">AGR Order Details:</span>
                    <span className="font-medium">{order.agrOrderDetails}</span>
                  </div>
                )}

                {order.customerPO && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Customer PO:</span>
                    <span className="font-medium">{order.customerPO}</span>
                  </div>
                )}

                {order.barcode && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Barcode:</span>
                    <span className="font-mono text-sm">{order.barcode}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Customer ID:</span>
                  <span className="font-medium">{order.customerId}</span>
                </div>
              </CardContent>
            </Card>

            {/* Product Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Product Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
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

                {order.shipping && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">Shipping:</span>
                    <span className="font-medium">{formatCurrency(order.shipping)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Features */}
            {order.features && Object.keys(order.features).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Product Features</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {renderFeatures(order.features)}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Department Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Department Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-gray-600">Current Department:</span>
                  <Badge className={`${getDepartmentBadgeColor(order.currentDepartment)} text-white`}>
                    {order.currentDepartment}
                  </Badge>
                </div>

                <Separator className="my-4" />
                
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Department Progress</h4>
                  {departmentCompletionFields.map(({ field, name }) => {
                    const completedAt = order[field as keyof DetailedOrder] as string;
                    const isCompleted = !!completedAt;
                    
                    return (
                      <div key={field} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                          )}
                          <span className={`text-sm ${isCompleted ? 'text-gray-900' : 'text-gray-500'}`}>
                            {name}
                          </span>
                        </div>
                        {isCompleted && (
                          <span className="text-xs text-gray-500">
                            {formatDateTime(completedAt)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Payment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Payment Status:</span>
                  <Badge className={getPaymentStatusColor(order.isPaid || false)}>
                    {order.isPaid ? 'PAID' : 'UNPAID'}
                  </Badge>
                </div>

                {payments.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">Payment History</h4>
                    {payments.map((payment: any, index: number) => (
                      <div key={index} className="flex justify-between items-center text-sm border-b pb-2">
                        <div>
                          <span className="font-medium">{payment.paymentType}</span>
                          <span className="text-gray-500 ml-2">{formatDate(payment.paymentDate)}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(payment.paymentAmount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-sm font-bold pt-2">
                      <span>Total Payments:</span>
                      <span>{formatCurrency(totalPayments)}</span>
                    </div>
                  </div>
                )}

                {order.discountCode && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Discount Code:</span>
                    <span className="font-medium">{order.discountCode}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scrap Information */}
            {isScrapped && (
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    Scrap Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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
                </CardContent>
              </Card>
            )}

            {/* Replacement Information */}
            {order.isReplacement && (
              <Card className="border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <Package className="h-4 w-4" />
                    Replacement Order
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {order.replacedOrderId && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Replaces Order:</span>
                      <span className="font-medium">{order.replacedOrderId}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Notes */}
            {order.notes && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Order Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Timestamps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Record Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Created:</span>
                  <span>{formatDateTime(order.createdAt)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Updated:</span>
                  <span>{formatDateTime(order.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  FileText,
  Download,
  Loader2,
  User,
  Package,
  Calendar,
  DollarSign,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

interface SalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
}

interface OrderData {
  orderId: string;
  orderDate: string;
  dueDate?: string;
  customerName: string;
  customerEmail?: string;
  customerPO?: string;
  modelId: string;
  totalPrice: number;
  currentDepartment: string;
  features?: Record<string, any>;
  isPaid?: boolean;
  notes?: string;
}

export function SalesOrderModal({
  isOpen,
  onClose,
  orderId,
}: SalesOrderModalProps) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Fetch order data - we'll use the existing orders API
  const {
    data: orderData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/orders/all', orderId],
    queryFn: async () => {
      const response = await fetch('/api/orders/all');
      if (!response.ok) throw new Error('Failed to fetch orders');
      const allOrders = await response.json();
      return allOrders.find((order: any) => order.orderId === orderId);
    },
    enabled: isOpen && !!orderId,
  });

  // Fetch RTS sale data if this is an RTS order
  const {
    data: rtsSaleData,
    isLoading: isLoadingRtsSale,
  } = useQuery({
    queryKey: ['/api/rts-sales', orderData?.rtsSaleId],
    queryFn: async () => {
      if (!orderData?.rtsSaleId) return null;
      const response = await fetch(`/api/rts-sales/${orderData.rtsSaleId}`);
      if (!response.ok) throw new Error('Failed to fetch RTS sale');
      return response.json();
    },
    enabled: isOpen && !!orderData?.isRtsOrder && !!orderData?.rtsSaleId,
  });

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      window.open(`/api/shipping-pdf/sales-order/${orderId}`, '_blank');
    } catch (error) {
      console.error('Error downloading PDF:', error);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const formatFeatureValue = (key: string, value: any): string => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'string') {
      return value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    }
    return String(value);
  };

  const formatFeatureName = (key: string): string => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Sales Order Summary - {orderId}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading order details...
          </div>
        )}

        {error && (
          <div className="text-red-600 py-4">
            Error loading order data. Please try again.
          </div>
        )}

        {orderData && (
          <div className="space-y-6">
            {/* Notes - Moved to top for visibility */}
            {orderData.notes && (
              <>
                <div className="space-y-2">
                  <h3 className="font-semibold">Notes</h3>
                  <p className="text-sm text-gray-600 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg border border-yellow-200 dark:border-yellow-800">
                    {orderData.notes}
                  </p>
                </div>
                <Separator />
              </>
            )}

            {/* Header Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-semibold">Customer</span>
                </div>
                <p className="text-sm">{orderData.customerName}</p>
                {orderData.customerEmail && (
                  <p className="text-sm text-gray-600">
                    {orderData.customerEmail}
                  </p>
                )}
                {orderData.customerPO && (
                  <p className="text-sm">
                    <span className="text-gray-600">Customer PO:</span>{' '}
                    <span className="font-medium">{orderData.customerPO}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="font-semibold">Dates</span>
                </div>
                <p className="text-sm">
                  <span className="text-gray-600">Ordered:</span>{' '}
                  {format(new Date(orderData.orderDate), 'MMM d, yyyy')}
                </p>
                {orderData.dueDate && (
                  <p className="text-sm">
                    <span className="text-gray-600">Due:</span>{' '}
                    {format(new Date(orderData.dueDate), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* RTS Stock Items or Regular Product Information */}
            {orderData.isRtsOrder ? (
              isLoadingRtsSale ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                  Loading RTS stock items...
                </div>
              ) : rtsSaleData?.items ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold">RTS Stock Items</span>
                    <Badge className="bg-orange-500 text-white">RTS</Badge>
                  </div>
                  <div className="space-y-2">
                    {rtsSaleData.items.map((item: any, index: number) => (
                      <div
                        key={item.id || index}
                        className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.stockModel}</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
                              {item.actionLength && (
                                <div>
                                  <span className="font-medium">Length:</span> {item.actionLength}
                                </div>
                              )}
                              {item.action && (
                                <div>
                                  <span className="font-medium">Action:</span> {item.action}
                                </div>
                              )}
                              {item.barrel && (
                                <div>
                                  <span className="font-medium">Barrel:</span> {item.barrel}
                                </div>
                              )}
                              {item.bottomMetal && (
                                <div>
                                  <span className="font-medium">Bottom Metal:</span> {item.bottomMetal}
                                </div>
                              )}
                              {item.color && (
                                <div>
                                  <span className="font-medium">Color:</span> {item.color}
                                </div>
                              )}
                              {item.extras && (
                                <div className="col-span-2">
                                  <span className="font-medium">Extras:</span> {item.extras}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right ml-4">
                            <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                            <p className="font-bold text-base">
                              ${item.unitPrice.toFixed(2)}
                            </p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-gray-500">
                                Total: ${item.lineTotal.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-red-600">
                  <p>Unable to load RTS sale data</p>
                </div>
              )
            ) : (
              <>
                {/* Regular Product Information */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-gray-500" />
                    <span className="font-semibold">Product Details</span>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="font-medium">
                      {orderData.modelId
                        ?.replace(/_/g, ' ')
                        .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline">{orderData.currentDepartment}</Badge>
                      {orderData.isPaid && <Badge variant="secondary">PAID</Badge>}
                    </div>
                  </div>
                </div>

                {/* Features/Options */}
                {orderData.features &&
                  Object.keys(orderData.features).length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <h3 className="font-semibold">Features & Options</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {/* Ensure action_length is always shown if it exists */}
                          {orderData.features.action_length && (
                            <div
                              key="action_length"
                              className="flex justify-between items-center text-sm"
                            >
                              <span className="text-gray-600">Action Length:</span>
                              <span className="font-medium">
                                {formatFeatureValue(
                                  'action_length',
                                  orderData.features.action_length
                                )}
                              </span>
                            </div>
                          )}
                          {/* Show all other features */}
                          {Object.entries(orderData.features)
                            .filter(([key]) => key !== 'action_length') // Avoid duplicating action_length
                            .map(([key, value]) => (
                              <div
                                key={key}
                                className="flex justify-between items-center text-sm"
                              >
                                <span className="text-gray-600">
                                  {formatFeatureName(key)}:
                                </span>
                                <span className="font-medium">
                                  {formatFeatureValue(key, value)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </>
                  )}
              </>
            )}

            {/* Pricing */}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <span className="font-semibold">Pricing</span>
              </div>
              {orderData.isRtsOrder && rtsSaleData ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Subtotal:</span>
                    <span>${rtsSaleData.subtotal?.toFixed(2) || '0.00'}</span>
                  </div>
                  {rtsSaleData.shippingCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Shipping:</span>
                      <span>${rtsSaleData.shippingCost?.toFixed(2) || '0.00'}</span>
                    </div>
                  )}
                  {rtsSaleData.tax > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Tax:</span>
                      <span>${rtsSaleData.tax?.toFixed(2) || '0.00'}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      ${rtsSaleData.totalAmount?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-right">
                  <p className="text-2xl font-bold">
                    ${orderData.totalPrice?.toFixed(2) || '0.00'}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <Separator />
            <div className="flex justify-between">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-2"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Download PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Loader2, User, Package, Calendar, DollarSign } from "lucide-react";
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
  modelId: string;
  totalPrice: number;
  currentDepartment: string;
  features?: Record<string, any>;
  isPaid?: boolean;
  notes?: string;
}

export function SalesOrderModal({ isOpen, onClose, orderId }: SalesOrderModalProps) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Fetch order data - we'll use the existing orders API
  const { data: orderData, isLoading, error } = useQuery({
    queryKey: ['/api/orders/all', orderId],
    queryFn: async () => {
      const response = await fetch('/api/orders/all');
      if (!response.ok) throw new Error('Failed to fetch orders');
      const allOrders = await response.json();
      return allOrders.find((order: any) => order.orderId === orderId);
    },
    enabled: isOpen && !!orderId
  });

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      window.open(`/api/sales-order/${orderId}`, '_blank');
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
      return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    return String(value);
  };

  const formatFeatureName = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
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
            {/* Header Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-semibold">Customer</span>
                </div>
                <p className="text-sm">{orderData.customerName}</p>
                {orderData.customerEmail && (
                  <p className="text-sm text-gray-600">{orderData.customerEmail}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="font-semibold">Dates</span>
                </div>
                <p className="text-sm">
                  <span className="text-gray-600">Ordered:</span> {format(new Date(orderData.orderDate), 'MMM d, yyyy')}
                </p>
                {orderData.dueDate && (
                  <p className="text-sm">
                    <span className="text-gray-600">Due:</span> {format(new Date(orderData.dueDate), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Product Information */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span className="font-semibold">Product Details</span>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <p className="font-medium">{orderData.modelId?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{orderData.currentDepartment}</Badge>
                  {orderData.isPaid && (
                    <Badge variant="secondary">PAID</Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Features/Options */}
            {orderData.features && Object.keys(orderData.features).length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Features & Options</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {Object.entries(orderData.features).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">{formatFeatureName(key)}:</span>
                        <span className="font-medium">{formatFeatureValue(key, value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Pricing */}
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-500" />
                <span className="font-semibold">Pricing</span>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">${orderData.totalPrice?.toFixed(2) || '0.00'}</p>
              </div>
            </div>

            {/* Notes */}
            {orderData.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Notes</h3>
                  <p className="text-sm text-gray-600 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    {orderData.notes}
                  </p>
                </div>
              </>
            )}

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
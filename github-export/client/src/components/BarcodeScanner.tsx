import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Scan, Package, User, Calendar, DollarSign, CreditCard, Settings } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { formatOrderDetails } from '@/components/OrderTooltip';

interface LineItem {
  type: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
}

interface DiscountDetail {
  name: string;
  type: string;
  value: number;
  amount: number;
}

interface OrderFeature {
  id: string;
  name: string;
  value: string;
  type: string;
}

interface OrderSummary {
  orderId: string;
  orderDate: string;
  customer: {
    name: string;
    email: string;
  } | null;
  baseModel: {
    name: string;
    id: string;
  } | null;
  features: OrderFeature[];
  lineItems: LineItem[];
  pricing: {
    subtotal: number;
    discounts: DiscountDetail[];
    discountTotal: number;
    afterDiscounts: number;
    total: number;
    override: boolean;
  };
  paymentStatus: string;
  status: string;
}

export function BarcodeScanner() {
  const [location] = useLocation();
  const [barcode, setBarcode] = useState('');
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);

  // Check for URL parameter and auto-scan
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const scanParam = searchParams.get('scan');
    if (scanParam) {
      setBarcode(scanParam);
      setScannedBarcode(scanParam);
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const { data: orderSummary, isLoading, error } = useQuery({
    queryKey: ['/api/barcode/scan', scannedBarcode],
    enabled: !!scannedBarcode,
    retry: false
  });

  const handleScan = () => {
    if (barcode.trim()) {
      setScannedBarcode(barcode.trim());
    }
  };

  const handleInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan();
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'UNPAID':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            Order Barcode Scanner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Scan or enter barcode (e.g., P1-AG185)"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyPress={handleInputKeyPress}
              className="flex-1"
            />
            <Button onClick={handleScan} disabled={!barcode.trim()}>
              <Scan className="h-4 w-4 mr-2" />
              Scan
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading order details...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-red-600">
              <Package className="h-8 w-8 mx-auto mb-2" />
              <p className="font-medium">Order not found</p>
              <p className="text-sm text-gray-600 mt-1">
                Please check the barcode and try again.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {orderSummary && (
        <div className="space-y-6">
          {/* Enhanced Order Display using OrderTooltip style */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Scanned Order: {orderSummary.orderId}
                </CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className={getPaymentStatusColor(orderSummary.paymentStatus)}>
                    <CreditCard className="h-3 w-3 mr-1" />
                    {orderSummary.paymentStatus}
                  </Badge>
                  <Badge variant="outline">
                    {orderSummary.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <div className="font-semibold text-blue-600 dark:text-blue-400 border-b border-gray-200 dark:border-gray-600 pb-2 mb-3">
                  Order Details
                </div>
                <div className="text-sm whitespace-pre-line text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
                  {formatOrderDetails(orderSummary, stockModels)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Base Model & Features */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Product Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Base Model */}
                {orderSummary.baseModel && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <div className="font-semibold text-blue-900">Base Model</div>
                    <div className="text-lg font-medium">{orderSummary.baseModel.name}</div>
                  </div>
                )}
                
                {/* Features */}
                {orderSummary.features && orderSummary.features.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-semibold text-gray-700 border-b pb-1">Selected Features</div>
                    {orderSummary.features.map((feature, index) => (
                      <div key={index} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{feature.name}</div>
                          <div className="text-sm text-gray-600">{feature.value}</div>
                        </div>
                        <Badge variant="outline" className="text-xs ml-2">
                          {feature.type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
                
                {(!orderSummary.features || orderSummary.features.length === 0) && (
                  <div className="text-center text-gray-500 py-4">
                    No custom features selected
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Line Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Contents
                <span className="text-sm font-normal text-gray-500 ml-2">
                  (Pricing hidden for security)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {orderSummary.lineItems.map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-600">{item.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Qty: {item.quantity}</div>
                      <Badge variant="outline" className="text-xs mt-1">
                        {item.type}
                      </Badge>
                    </div>
                  </div>
                ))}
                
                <Separator />
                
                <div className="space-y-2 pt-2 text-center text-gray-500">
                  <div className="flex items-center justify-center gap-2">
                    <span>💰</span>
                    <span>Pricing information is hidden for security</span>
                  </div>
                  {orderSummary.pricing.discounts && orderSummary.pricing.discounts.length > 0 && (
                    <div className="text-sm text-blue-600">
                      ✅ {orderSummary.pricing.discounts.length} discount(s) applied
                    </div>
                  )}
                  {orderSummary.pricing.override && (
                    <div className="text-sm text-orange-600">
                      ⚠️ Custom pricing override applied
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Status Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center p-6">
                <Badge 
                  variant="outline" 
                  className={`${getPaymentStatusColor(orderSummary.paymentStatus)} text-lg px-4 py-2`}
                >
                  {orderSummary.paymentStatus}
                </Badge>
              </div>
              <div className="text-center text-sm text-gray-600">
                {orderSummary.paymentStatus === 'PAID' && 'Payment has been processed successfully'}
                {orderSummary.paymentStatus === 'PENDING' && 'Payment is being processed'}
                {orderSummary.paymentStatus === 'UNPAID' && 'Payment is required for this order'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
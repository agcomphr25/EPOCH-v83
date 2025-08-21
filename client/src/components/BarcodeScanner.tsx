import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Scan, Package, User, Calendar, DollarSign, CreditCard, Settings, Camera, Smartphone, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { formatOrderDetails } from '@/components/OrderTooltip';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { useBarcodeInput } from '@/hooks/useBarcodeInput';
import { CameraScanner } from '@/components/CameraScanner';
import { MobileCameraDiagnostic } from '@/components/MobileCameraDiagnostic';

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
  description: string;
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
  currentDepartment?: string;
  dueDate?: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  } | null;
  baseModel: {
    name: string;
    id: string;
    price: number;
  } | null;
  features: Record<string, any> | null;
  specifications: Record<string, any> | null;
  productionDetails?: {
    partName: string;
    quantity: number;
    department: string;
    priority: number;
  };
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
  notes?: string;
  displayFeatures?: {
    model: string;
    actionLength: string;
    color: string;
    finish: string;
  };
}

interface BarcodeScannerProps {
  onOrderScanned?: (orderId: string) => void;
}

export function BarcodeScanner({ onOrderScanned }: BarcodeScannerProps = {}) {
  const [location] = useLocation();
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Device detection for smart UI
  const { isMobile, hasCamera } = useDeviceDetection();

  // Unified barcode input handling
  const {
    barcode,
    scannedBarcode,
    isValidBarcode,
    barcodeType,
    setBarcode,
    handleScan,
    handleBarcodeDetected,
    clearScan
  } = useBarcodeInput();

  // Check for URL parameter and auto-scan
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const scanParam = searchParams.get('scan');
    if (scanParam) {
      handleBarcodeDetected(scanParam);
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location, handleBarcodeDetected]);

  // Get stock models for display names
  const { data: stockModels = [] } = useQuery({
    queryKey: ['/api/stock-models'],
  });

  const { data: orderSummary, isLoading, error } = useQuery<OrderSummary>({
    queryKey: ['/api/barcode/scan', scannedBarcode],
    enabled: !!scannedBarcode,
    retry: false
  });

  // Auto-select order in department queue when successfully scanned
  useEffect(() => {
    if (orderSummary && onOrderScanned) {
      onOrderScanned(orderSummary.orderId);
      // Auto-select the input text for quick replacement with next scan
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select();
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [orderSummary, onOrderScanned]);

  const handleInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan();
      // Auto-select the input text for quick replacement with next scan
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.select();
          inputRef.current.focus();
        }
      }, 100);
    }
  };

  const handleManualScan = () => {
    handleScan();
    // Auto-select the input text for quick replacement with next scan
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
        inputRef.current.focus();
      }
    }, 100);
  };

  const handleCameraScan = (detectedBarcode: string) => {
    handleBarcodeDetected(detectedBarcode);
    setShowCameraScanner(false);
    // Auto-select the input text for quick replacement with next scan
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.select();
        inputRef.current.focus();
      }
    }, 500); // Slightly longer delay for camera scanning
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
    if (!dateString) return 'N/A';
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
          <div className="space-y-4">
            {/* Input method selection */}
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                placeholder="Scan or enter barcode (e.g., P1-AG185)"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyPress={handleInputKeyPress}
                className={`flex-1 ${!isValidBarcode && barcode.length > 0 ? 'border-red-300' : ''}`}
              />
              <Button 
                onClick={handleManualScan} 
                disabled={!isValidBarcode}
                variant={isValidBarcode ? "default" : "secondary"}
              >
                <Scan className="h-4 w-4 mr-2" />
                Scan
              </Button>
            </div>

            {/* Camera scanning option for mobile devices */}
            {hasCamera && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCameraScanner(true)}
                    className="flex-1"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    {isMobile ? 'Use Camera' : 'Camera Scanner'}
                  </Button>
                  {isMobile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDiagnostic(!showDiagnostic)}
                      className="text-xs"
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      {showDiagnostic ? 'Hide' : 'Camera'} Diagnostics
                    </Button>
                  )}
                </div>
                {isMobile && (
                  <div className="flex items-center text-xs text-gray-500 gap-1">
                    <Smartphone className="h-3 w-3" />
                    <span>Camera issues? Try the diagnostic tool above</span>
                  </div>
                )}
              </div>
            )}

            {/* Barcode validation feedback */}
            {barcode.length > 0 && (
              <div className="text-xs">
                {isValidBarcode ? (
                  <div className="text-green-600 flex items-center gap-1">
                    <span>✓</span>
                    <span>Valid {barcodeType?.replace('_', ' ').toLowerCase()} barcode</span>
                  </div>
                ) : (
                  <div className="text-orange-600 flex items-center gap-1">
                    <span>⚠</span>
                    <span>Enter a valid barcode (e.g., P1-AG185, PART001)</span>
                  </div>
                )}
              </div>
            )}

            {/* Clear scan button */}
            {scannedBarcode && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearScan}
                className="w-fit"
              >
                Clear & Scan Again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile Camera Diagnostic Tool */}
      {isMobile && showDiagnostic && (
        <div className="mb-6">
          <MobileCameraDiagnostic />
        </div>
      )}

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
          {/* Order Header */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Order Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-medium">Order ID:</span> {orderSummary.orderId}
                </div>
                <div>
                  <span className="font-medium">Date:</span> {formatDate(orderSummary.orderDate)}
                </div>
                <div>
                  <span className="font-medium">Customer:</span> {orderSummary.customer?.name || 'N/A'}
                </div>
                <div>
                  <span className="font-medium">Status:</span>{' '}
                  <Badge variant={orderSummary.status === 'COMPLETED' ? 'default' : 'secondary'}>
                    {orderSummary.status}
                  </Badge>
                </div>
                {orderSummary.currentDepartment && (
                  <div>
                    <span className="font-medium">Current Department:</span>{' '}
                    <Badge variant="outline">{orderSummary.currentDepartment}</Badge>
                  </div>
                )}
                {orderSummary.dueDate && (
                  <div>
                    <span className="font-medium">Due Date:</span> {formatDate(orderSummary.dueDate)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customer Information */}
          {orderSummary.customer && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-medium">Name:</span> {orderSummary.customer.name}
                  </div>
                  {orderSummary.customer.company && (
                    <div>
                      <span className="font-medium">Company:</span> {orderSummary.customer.company}
                    </div>
                  )}
                  {orderSummary.customer.email && (
                    <div>
                      <span className="font-medium">Email:</span> {orderSummary.customer.email}
                    </div>
                  )}
                  {orderSummary.customer.phone && (
                    <div>
                      <span className="font-medium">Phone:</span> {orderSummary.customer.phone}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Base Model */}
          {orderSummary.baseModel && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Base Model
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-lg font-semibold">
                    {orderSummary.baseModel.name}
                  </div>
                  <div className="text-sm text-gray-600">
                    Model ID: {orderSummary.baseModel.id}
                  </div>
                  {orderSummary.baseModel.price > 0 && (
                    <div className="text-sm font-medium text-green-600">
                      Base Price: {formatCurrency(orderSummary.baseModel.price)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Features & Specifications - Complete Display with Proper Names */}
          {((orderSummary.features && Object.keys(orderSummary.features).length > 0) || 
            (orderSummary.specifications && Object.keys(orderSummary.specifications).length > 0)) && (
            <Card>
              <CardHeader>
                <CardTitle>Configuration Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {orderSummary.features && Object.keys(orderSummary.features).length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Selected Features:</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(orderSummary.features).map(([key, value], index) => {
                          // Format the display name for the key
                          const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                          // Format the display value
                          let displayValue = value;
                          if (typeof value === 'string') {
                            displayValue = value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                          }
                          
                          return (
                            <div key={index} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                              <span className="font-medium">{displayKey}:</span>
                              <Badge variant="outline" className="ml-2">
                                {typeof displayValue === 'string' ? displayValue : JSON.stringify(displayValue)}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {orderSummary.specifications && Object.keys(orderSummary.specifications).length > 0 && (
                    <div>
                      <h4 className="font-medium mb-3">Specifications:</h4>
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(orderSummary.specifications).map(([key, value], index) => {
                          // Format the display name for the key
                          const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                          // Format the display value
                          let displayValue = value;
                          if (typeof value === 'string') {
                            displayValue = value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                          }
                          
                          return (
                            <div key={index} className="flex justify-between items-center text-sm p-2 bg-blue-50 rounded">
                              <span className="font-medium">{displayKey}:</span>
                              <Badge variant="outline" className="ml-2">
                                {typeof displayValue === 'string' ? displayValue : JSON.stringify(displayValue)}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Production Details (if applicable) */}
          {orderSummary.productionDetails && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Production Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {orderSummary.productionDetails.partName && (
                    <div>
                      <span className="font-medium">Part Name:</span> {orderSummary.productionDetails.partName}
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Quantity:</span> {orderSummary.productionDetails.quantity}
                  </div>
                  {orderSummary.productionDetails.department && (
                    <div>
                      <span className="font-medium">Department:</span>{' '}
                      <Badge variant="outline">{orderSummary.productionDetails.department}</Badge>
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Priority:</span> {orderSummary.productionDetails.priority}/5
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Pricing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>{formatCurrency(orderSummary.pricing.subtotal)}</span>
                </div>
                {orderSummary.pricing.discounts && orderSummary.pricing.discounts.length > 0 && (
                  <>
                    <div className="space-y-1">
                      {orderSummary.pricing.discounts.map((discount, index) => (
                        <div key={index} className="flex justify-between text-sm text-red-600">
                          <span>- {discount.description}</span>
                          <span>-{formatCurrency(discount.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>After Discounts:</span>
                      <span>{formatCurrency(orderSummary.pricing.afterDiscounts)}</span>
                    </div>
                  </>
                )}
                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-green-600">
                      {formatCurrency(orderSummary.pricing.total)}
                    </span>
                  </div>
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

          {/* Notes */}
          {orderSummary.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
                  {orderSummary.notes}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Camera Scanner Modal */}
      <CameraScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onBarcodeDetected={handleCameraScan}
      />
    </div>
  );
}
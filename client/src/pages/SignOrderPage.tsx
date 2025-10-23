import { useEffect, useState, useRef } from 'react';
import { useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface FollowupOrder {
  id: number;
  orderId: string;
  customerId: string;
  customerEmail: string;
  signatureToken: string;
  signatureSigned: boolean;
  signedAt: string | null;
  modelDisplayName?: string;
  featureDisplayInfo?: Record<string, {
    displayName: string;
    selections: Record<string, string>;
  }>;
  orderSummary: {
    orderId: string;
    orderDate: string;
    dueDate: string;
    customerPO?: string;
    modelId?: string;
    handedness?: string;
    features?: Record<string, any>;
    notes?: string;
    shipping?: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: {
      street: string;
      street2?: string;
      city: string;
      state: string;
      zipCode: string;
    };
  };
}

export default function SignOrderPage() {
  const [, params] = useRoute('/sign-order/:token');
  const token = params?.token;
  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  const { data: followupOrder, isLoading, error } = useQuery<FollowupOrder>({
    queryKey: ['/api/followup-orders/by-token', token],
    enabled: !!token,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!signatureRef.current || signatureEmpty) {
        throw new Error('Please provide a signature');
      }

      const signatureData = signatureRef.current.toDataURL();
      
      return await apiRequest(`/api/followup-orders/${followupOrder?.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          signatureData,
          signatureToken: token
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Order Signed Successfully',
        description: 'Your order has been approved and moved to production.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to sign order',
        variant: 'destructive',
      });
    },
  });

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureEmpty(true);
  };

  const handleSignatureEnd = () => {
    setSignatureEmpty(signatureRef.current?.isEmpty() || false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading order details...</span>
        </div>
      </div>
    );
  }

  if (error || !followupOrder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Order Not Found</CardTitle>
            <CardDescription>
              The order link is invalid or has expired. Please contact support.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (followupOrder.signatureSigned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <CardTitle className="text-green-600">Order Already Signed</CardTitle>
            </div>
            <CardDescription>
              This order was signed on {new Date(followupOrder.signedAt!).toLocaleString()}.
              Your order is in production.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { orderSummary } = followupOrder;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Review & Sign Sales Order</CardTitle>
            <CardDescription>
              Please review the order details below carefully before signing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Order Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Order Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Order ID</p>
                  <p className="font-medium" data-testid="text-order-id">{orderSummary.orderId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Order Date</p>
                  <p className="font-medium" data-testid="text-order-date">
                    {new Date(orderSummary.orderDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Due Date</p>
                  <p className="font-medium" data-testid="text-due-date">
                    {new Date(orderSummary.dueDate).toLocaleDateString()}
                  </p>
                </div>
                {orderSummary.customerPO && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Customer PO</p>
                    <p className="font-medium" data-testid="text-customer-po">{orderSummary.customerPO}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Customer Information */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Customer Information</h3>
              <div className="space-y-3">
                {orderSummary.customerName && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Name:</span>
                    <span className="font-medium" data-testid="text-customer-name">{orderSummary.customerName}</span>
                  </div>
                )}
                {orderSummary.customerEmail && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Email:</span>
                    <span className="font-medium" data-testid="text-customer-email">{orderSummary.customerEmail}</span>
                  </div>
                )}
                {orderSummary.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Phone:</span>
                    <span className="font-medium" data-testid="text-customer-phone">{orderSummary.customerPhone}</span>
                  </div>
                )}
                {orderSummary.customerAddress && (
                  <div>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">Shipping Address:</p>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                      <p className="font-medium" data-testid="text-shipping-address-street">{orderSummary.customerAddress.street}</p>
                      {orderSummary.customerAddress.street2 && (
                        <p className="font-medium" data-testid="text-shipping-address-street2">{orderSummary.customerAddress.street2}</p>
                      )}
                      <p className="font-medium" data-testid="text-shipping-address-city">
                        {orderSummary.customerAddress.city}, {orderSummary.customerAddress.state} {orderSummary.customerAddress.zipCode}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Order Details */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Order Details</h3>
              <div className="space-y-3">
                {orderSummary.modelId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Model:</span>
                    <span className="font-medium" data-testid="text-model">
                      {followupOrder.modelDisplayName || orderSummary.modelId}
                    </span>
                  </div>
                )}
                {orderSummary.features && Object.entries(orderSummary.features).map(([key, value]) => {
                  if (!value || value === false || value === '' || (Array.isArray(value) && value.length === 0)) return null;
                  
                  // Get display names from featureDisplayInfo if available
                  const featureInfo = followupOrder.featureDisplayInfo?.[key];
                  const displayKey = featureInfo?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  
                  let displayValue: string;
                  if (Array.isArray(value)) {
                    // For arrays, join display names
                    displayValue = value.map(val => featureInfo?.selections?.[val] || val).join(', ');
                  } else {
                    displayValue = featureInfo?.selections?.[value] || String(value);
                  }
                  
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{displayKey}:</span>
                      <span className="font-medium" data-testid={`text-feature-${key}`}>{displayValue}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {orderSummary.notes && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-2">Special Instructions</h3>
                  <p className="text-gray-700 dark:text-gray-300" data-testid="text-notes">
                    {orderSummary.notes}
                  </p>
                </div>
              </>
            )}

            <Separator />

            {/* Signature Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Digital Signature</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                By signing below, you confirm that the order details above are correct and authorize
                AG Composites to begin production.
              </p>
              
              <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <SignatureCanvas
                  ref={signatureRef}
                  penColor="black"
                  canvasProps={{
                    className: 'w-full h-48 cursor-crosshair'
                  }}
                  onEnd={handleSignatureEnd}
                  data-testid="canvas-signature"
                />
              </div>
              
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={handleClearSignature}
                  data-testid="button-clear-signature"
                >
                  Clear Signature
                </Button>
                <Button
                  onClick={() => signMutation.mutate()}
                  disabled={signatureEmpty || signMutation.isPending}
                  className="flex-1"
                  data-testid="button-submit-signature"
                >
                  {signMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Sign & Approve Order'
                  )}
                </Button>
              </div>
            </div>

            {signMutation.isSuccess && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <p className="text-green-800 dark:text-green-200 font-medium">
                    Order signed successfully! Your order has been moved to the production queue.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

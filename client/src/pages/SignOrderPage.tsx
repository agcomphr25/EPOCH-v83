import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute } from 'wouter';
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
  pricing?: {
    basePrice: number;
    subtotal: number;
    discountAmount: number;
    shipping: number;
    total: number;
    paidAmount: number;
    balanceDue: number;
  };
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

interface PageSettings {
  pageTitle: string;
  pageDescription: string;
  signatureDisclaimer: string;
  successMessage: string;
  alreadySignedTitle: string;
  alreadySignedMessage: string;
  invalidLinkMessage: string;
  orderNotFoundMessage: string;
}

const DEFAULTS: PageSettings = {
  pageTitle: 'Review & Sign Sales Order',
  pageDescription: 'Please review the order details below carefully before signing.',
  signatureDisclaimer: 'By signing below, you confirm that the order details above are correct and authorize AG Composites to begin production.',
  successMessage: 'Order signed successfully! Your order has been moved to the production queue.',
  alreadySignedTitle: 'Order Already Signed',
  alreadySignedMessage: 'Your order is in production.',
  invalidLinkMessage: 'Invalid or missing signature link. Please use the link from your email to sign your order.',
  orderNotFoundMessage: 'The order link is invalid or has expired. Please contact support.',
};

export default function SignOrderPage() {
  const [, pathParams] = useRoute('/sign-order/:identifier');
  const queryParams = new URLSearchParams(window.location.search);
  const legacyToken = queryParams.get('token');
  
  const { identifier, apiEndpoint, isPublicId } = useMemo(() => {
    if (pathParams?.identifier && pathParams.identifier.startsWith('sig_')) {
      return {
        identifier: pathParams.identifier,
        apiEndpoint: `/api/followup-orders/sign/${pathParams.identifier}`,
        isPublicId: true,
      };
    }
    if (pathParams?.identifier && pathParams.identifier.length > 20) {
      return {
        identifier: pathParams.identifier,
        apiEndpoint: `/api/followup-orders/by-token/${pathParams.identifier}`,
        isPublicId: false,
      };
    }
    if (legacyToken) {
      return {
        identifier: legacyToken,
        apiEndpoint: `/api/followup-orders/by-token/${legacyToken}`,
        isPublicId: false,
      };
    }
    return { identifier: null, apiEndpoint: null, isPublicId: false };
  }, [pathParams?.identifier, legacyToken]);

  const { toast } = useToast();
  const signatureRef = useRef<SignatureCanvas>(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);

  const { data: pageSettings } = useQuery<PageSettings>({
    queryKey: ['/api/sign-order-settings'],
  });

  const content = pageSettings || DEFAULTS;

  const { data: followupOrder, isLoading, error } = useQuery<FollowupOrder>({
    queryKey: [apiEndpoint],
    enabled: !!identifier && !!apiEndpoint,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!signatureRef.current || signatureEmpty) {
        throw new Error('Please provide a signature');
      }

      const signatureData = signatureRef.current.toDataURL();
      
      try {
        return await apiRequest(`/api/followup-orders/${followupOrder?.id}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            signatureData,
            ...(isPublicId 
              ? { publicSignatureId: identifier }
              : { signatureToken: identifier }
            ),
          }),
        });
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to sign order. Please try again or contact support.';
        throw new Error(errorMessage);
      }
    },
    onSuccess: () => {
      toast({
        title: 'Order Signed Successfully',
        description: 'Your order has been approved and moved to production. You will receive a confirmation email shortly.',
      });
    },
    onError: (error: Error) => {
      console.error('Sign order error:', error);
      toast({
        title: 'Unable to Sign Order',
        description: error.message || 'An unexpected error occurred. Please contact support at sales@agcomposites.com',
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

  if (!identifier) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Link</CardTitle>
            <CardDescription>
              {content.invalidLinkMessage}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

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
              {content.orderNotFoundMessage}
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
              <CardTitle className="text-green-600">{content.alreadySignedTitle}</CardTitle>
            </div>
            <CardDescription>
              This order was signed on {new Date(followupOrder.signedAt!).toLocaleString()}.
              {' '}{content.alreadySignedMessage}
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
            <CardTitle className="text-2xl">{content.pageTitle}</CardTitle>
            <CardDescription>
              {content.pageDescription}
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
                  
                  if (key === 'miscItems') return null;
                  
                  const featureInfo = followupOrder.featureDisplayInfo?.[key];
                  const displayKey = featureInfo?.displayName || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  
                  let displayValue: string;
                  if (Array.isArray(value)) {
                    displayValue = value.map(val => {
                      if (typeof val === 'string') {
                        return featureInfo?.selections?.[val] || val;
                      }
                      return String(val);
                    }).join(', ');
                  } else if (typeof value === 'object') {
                    return null;
                  } else {
                    const valueStr = String(value);
                    displayValue = featureInfo?.selections?.[valueStr] || valueStr;
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

            {/* Miscellaneous Items */}
            {orderSummary.features?.miscItems && Array.isArray(orderSummary.features.miscItems) && orderSummary.features.miscItems.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-4">Miscellaneous Items</h3>
                  <div className="space-y-3">
                    {orderSummary.features.miscItems.map((item: any, index: number) => (
                      <div key={item.id || index} className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100" data-testid={`text-misc-item-description-${index}`}>
                            {item.description}
                          </p>
                          {item.quantity > 1 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400" data-testid={`text-misc-item-quantity-${index}`}>
                              Quantity: {item.quantity} @ ${item.unitPrice.toFixed(2)} each
                            </p>
                          )}
                        </div>
                        <span className="font-medium ml-4" data-testid={`text-misc-item-total-${index}`}>
                          ${item.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {orderSummary.notes && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-2">Notes</h3>
                  <p className="text-gray-700 dark:text-gray-300" data-testid="text-notes">
                    {orderSummary.notes}
                  </p>
                </div>
              </>
            )}

            <Separator />

            {/* Pricing Section */}
            {followupOrder.pricing && (
              <>
                <div>
                  <h3 className="text-lg font-semibold mb-4">Order Pricing</h3>
                  <div className="space-y-2 bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Subtotal:</span>
                      <span className="font-medium" data-testid="text-subtotal">
                        ${followupOrder.pricing.subtotal.toFixed(2)}
                      </span>
                    </div>
                    {followupOrder.pricing.discountAmount > 0 && (
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span>Discount:</span>
                        <span className="font-medium" data-testid="text-discount">
                          -${followupOrder.pricing.discountAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Shipping:</span>
                      <span className="font-medium" data-testid="text-shipping">
                        ${followupOrder.pricing.shipping.toFixed(2)}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold" data-testid="text-total">
                        ${followupOrder.pricing.total.toFixed(2)}
                      </span>
                    </div>
                    {followupOrder.pricing.paidAmount > 0 && (
                      <>
                        <div className="flex justify-between text-blue-600 dark:text-blue-400">
                          <span>Amount Paid:</span>
                          <span className="font-medium" data-testid="text-paid">
                            ${followupOrder.pricing.paidAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-lg font-semibold text-red-600 dark:text-red-400">
                          <span>Balance Due:</span>
                          <span data-testid="text-balance-due">
                            ${followupOrder.pricing.balanceDue.toFixed(2)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Signature Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Digital Signature</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {content.signatureDisclaimer}
              </p>
              
              <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800">
                <SignatureCanvas
                  ref={signatureRef}
                  penColor="black"
                  clearOnResize={false}
                  canvasProps={{
                    className: 'w-full h-48 cursor-crosshair',
                    style: { touchAction: 'none' }
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
                    {content.successMessage}
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

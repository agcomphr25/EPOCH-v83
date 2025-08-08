import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { AlertCircle, CreditCard, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Credit card payment form schema
const creditCardSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  cardNumber: z.string()
    .min(13, "Card number must be at least 13 digits")
    .max(19, "Card number must be at most 19 digits")
    .regex(/^\d+$/, "Card number must contain only digits"),
  expirationDate: z.string()
    .regex(/^\d{2}\/\d{2}$/, "Expiration date must be in MM/YY format"),
  cvv: z.string()
    .min(3, "CVV must be at least 3 digits")
    .max(4, "CVV must be at most 4 digits")
    .regex(/^\d+$/, "CVV must contain only digits"),
  billingAddress: z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(2, "State is required"),
    zip: z.string().min(5, "ZIP code is required"),
    country: z.string().default("US"),
  }),
  customerEmail: z.string().email().optional().or(z.literal("")),
  taxAmount: z.number().min(0).default(0),
  shippingAmount: z.number().min(0).default(0),
});

type CreditCardFormData = z.infer<typeof creditCardSchema>;

interface CreditCardPaymentProps {
  orderId: string;
  defaultAmount?: number;
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
}

export default function CreditCardPayment({ 
  orderId, 
  defaultAmount = 0, 
  onSuccess, 
  onCancel 
}: CreditCardPaymentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [paymentResult, setPaymentResult] = useState<any>(null);

  const form = useForm<CreditCardFormData>({
    resolver: zodResolver(creditCardSchema),
    defaultValues: {
      orderId,
      amount: defaultAmount,
      cardNumber: '',
      expirationDate: '',
      cvv: '',
      billingAddress: {
        firstName: '',
        lastName: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        country: 'US',
      },
      customerEmail: '',
      taxAmount: 0,
      shippingAmount: 0,
    },
  });

  const processPaymentMutation = useMutation({
    mutationFn: async (data: CreditCardFormData) => {
      return await apiRequest('/api/payments/credit-card', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (result) => {
      setPaymentResult(result);
      if (result.success) {
        toast({
          title: "Payment Successful",
          description: `Transaction ID: ${result.transactionId}`,
        });
        queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
        onSuccess?.(result);
      } else {
        toast({
          title: "Payment Failed",
          description: result.message || "Payment processing failed",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: error.message || "An error occurred while processing payment",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreditCardFormData) => {
    processPaymentMutation.mutate(data);
  };

  // Format card number with spaces for display
  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  // Format expiration date as MM/YY
  const formatExpirationDate = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  if (paymentResult) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {paymentResult.success ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                Payment Successful
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                Payment Failed
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p><strong>Order ID:</strong> {orderId}</p>
            <p><strong>Transaction ID:</strong> {paymentResult.transactionId || 'N/A'}</p>
            <p><strong>Authorization Code:</strong> {paymentResult.authCode || 'N/A'}</p>
            <p><strong>Response:</strong> {paymentResult.message}</p>
            {paymentResult.avsResult && (
              <p><strong>Address Verification:</strong> {paymentResult.avsResult}</p>
            )}
            {paymentResult.cvvResult && (
              <p><strong>CVV Verification:</strong> {paymentResult.cvvResult}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPaymentResult(null)} variant="outline">
              Process Another Payment
            </Button>
            {onCancel && (
              <Button onClick={onCancel} variant="default">
                Close
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Credit Card Payment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Order and Amount Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order ID</FormLabel>
                    <FormControl>
                      <Input {...field} readOnly className="bg-gray-50" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Additional Amounts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="taxAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shippingAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shipping Amount ($)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Credit Card Information */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Credit Card Information</h3>
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="cardNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Card Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="1234 5678 9012 3456"
                          onChange={(e) => {
                            const formatted = formatCardNumber(e.target.value);
                            const cleaned = formatted.replace(/\s/g, '');
                            field.onChange(cleaned);
                            e.target.value = formatted;
                          }}
                          maxLength={19}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="expirationDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiration Date</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="MM/YY"
                            onChange={(e) => {
                              const formatted = formatExpirationDate(e.target.value);
                              field.onChange(formatted);
                              e.target.value = formatted;
                            }}
                            maxLength={5}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cvv"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CVV</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="123"
                            maxLength={4}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '');
                              field.onChange(value);
                              e.target.value = value;
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Billing Address</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="billingAddress.firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingAddress.lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Doe" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="billingAddress.address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="123 Main Street" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="billingAddress.city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="City" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingAddress.state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="CA" maxLength={2} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="billingAddress.zip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP Code</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="12345" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="customerEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Email (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="customer@example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">Secure Payment Processing</p>
                  <p>Your payment information is encrypted and processed securely through Authorize.Net. We do not store your credit card information.</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={processPaymentMutation.isPending}
                className="flex-1"
              >
                {processPaymentMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Process Payment
                  </>
                )}
              </Button>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
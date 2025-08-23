import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  CreditCard, 
  Search, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Eye
} from 'lucide-react';
import CreditCardPayment from '@/components/CreditCardPayment';
import BatchPayment from '@/components/BatchPayment';

interface Payment {
  payment: {
    id: number;
    orderId: string;
    paymentType: string;
    paymentAmount: number;
    paymentDate: string;
    notes?: string;
    createdAt: string;
  };
  transaction?: {
    id: number;
    transactionId: string;
    authCode?: string;
    responseCode: string;
    responseReasonText?: string;
    avsResult?: string;
    cvvResult?: string;
    cardType?: string;
    lastFourDigits?: string;
    amount: number;
    taxAmount: number;
    shippingAmount: number;
    customerEmail?: string;
    billingFirstName?: string;
    billingLastName?: string;
    status: string;
    isTest: boolean;
    processedAt: string;
  };
}

export default function PaymentManagement() {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [searchOrderId, setSearchOrderId] = useState('');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  // Fetch all payments
  const { data: paymentsData, isLoading: paymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: ['/api/payments'],
    queryFn: async () => {
      const response = await fetch('/api/payments');
      if (!response.ok) throw new Error('Failed to fetch payments');
      return response.json();
    },
  });

  // Fetch payments for specific order
  const { data: orderPaymentsData, isLoading: orderPaymentsLoading, refetch: refetchOrderPayments } = useQuery({
    queryKey: ['/api/payments/order', searchOrderId],
    queryFn: async () => {
      if (!searchOrderId) return null;
      const response = await fetch(`/api/payments/order/${searchOrderId}`);
      if (!response.ok) throw new Error('Failed to fetch order payments');
      return response.json();
    },
    enabled: !!searchOrderId,
  });

  const handlePaymentSuccess = (result: any) => {
    setShowPaymentDialog(false);
    refetchPayments();
    if (searchOrderId) {
      refetchOrderPayments();
    }
  };

  const getStatusBadge = (status: string, responseCode?: string) => {
    if (status === 'completed' || responseCode === '1') {
      return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    } else if (status === 'failed' || responseCode === '2') {
      return <Badge variant="destructive">Declined</Badge>;
    } else if (status === 'voided') {
      return <Badge variant="secondary">Voided</Badge>;
    } else if (status === 'refunded') {
      return <Badge className="bg-orange-100 text-orange-800">Refunded</Badge>;
    } else if (responseCode === '4') {
      return <Badge className="bg-yellow-100 text-yellow-800">Held for Review</Badge>;
    } else {
      return <Badge variant="outline">Pending</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const PaymentCard = ({ payment }: { payment: Payment }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold text-lg">Order: {payment.payment.orderId}</h3>
            <p className="text-sm text-gray-600">
              {payment.payment.paymentType === 'credit_card' ? 'Credit Card' : payment.payment.paymentType}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg">{formatCurrency(payment.payment.paymentAmount)}</p>
            {payment.transaction && getStatusBadge(payment.transaction.status, payment.transaction.responseCode)}
          </div>
        </div>

        {payment.transaction && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Transaction ID:</span>
                <span className="text-sm">{payment.transaction.transactionId}</span>
              </div>
              {payment.transaction.authCode && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Auth Code:</span>
                  <span className="text-sm">{payment.transaction.authCode}</span>
                </div>
              )}
              {payment.transaction.lastFourDigits && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Card:</span>
                  <span className="text-sm">
                    {payment.transaction.cardType} ending in {payment.transaction.lastFourDigits}
                  </span>
                </div>
              )}
              {payment.transaction.avsResult && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">AVS:</span>
                  <span className="text-sm">{payment.transaction.avsResult}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm font-medium">Processed:</span>
                <span className="text-sm">{formatDate(payment.transaction.processedAt)}</span>
              </div>
              {payment.transaction.billingFirstName && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Billing Name:</span>
                  <span className="text-sm">
                    {payment.transaction.billingFirstName} {payment.transaction.billingLastName}
                  </span>
                </div>
              )}
              {payment.transaction.customerEmail && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Email:</span>
                  <span className="text-sm">{payment.transaction.customerEmail}</span>
                </div>
              )}
              {payment.transaction.isTest && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
                  Test Transaction
                </Badge>
              )}
            </div>
          </div>
        )}

        {payment.payment.notes && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-sm text-gray-600">{payment.payment.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Payment Management</h1>
          <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
            <DialogTrigger asChild>
              <Button>
                <CreditCard className="h-4 w-4 mr-2" />
                Process Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Process Credit Card Payment</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <div className="mb-4 space-y-4">
                  <div>
                    <Label htmlFor="orderIdInput">Order ID</Label>
                    <Input
                      id="orderIdInput"
                      placeholder="Enter Order ID"
                      value={selectedOrderId}
                      onChange={(e) => setSelectedOrderId(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="amountInput">Payment Amount ($)</Label>
                    <Input
                      id="amountInput"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={paymentAmount || ''}
                      onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                {selectedOrderId && paymentAmount > 0 && (
                  <CreditCardPayment
                    orderId={selectedOrderId}
                    defaultAmount={paymentAmount}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => setShowPaymentDialog(false)}
                  />
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="all-payments" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all-payments">All Payments</TabsTrigger>
            <TabsTrigger value="search-order">Search by Order</TabsTrigger>
            <TabsTrigger value="batch-payment">Batch Payment</TabsTrigger>
          </TabsList>

          <TabsContent value="all-payments" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Recent Payments</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => refetchPayments()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {paymentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                    Loading payments...
                  </div>
                ) : paymentsData?.payments?.length > 0 ? (
                  <div className="space-y-4">
                    {paymentsData.payments.map((payment: Payment) => (
                      <PaymentCard key={payment.payment.id} payment={payment} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No payments found</h3>
                    <p className="text-gray-500">No payment transactions have been processed yet.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search-order" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Search Payments by Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-6">
                  <div className="flex-1">
                    <Label htmlFor="searchInput">Order ID</Label>
                    <Input
                      id="searchInput"
                      placeholder="Enter Order ID to search"
                      value={searchOrderId}
                      onChange={(e) => setSearchOrderId(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={() => refetchOrderPayments()}>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                  </div>
                </div>

                {orderPaymentsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                    Searching...
                  </div>
                ) : orderPaymentsData?.payments?.length > 0 ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Payments for Order: {searchOrderId}
                    </h3>
                    {orderPaymentsData.payments.map((payment: Payment) => (
                      <PaymentCard key={payment.payment.id} payment={payment} />
                    ))}
                  </div>
                ) : searchOrderId && orderPaymentsData ? (
                  <div className="text-center py-8">
                    <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No payments found</h3>
                    <p className="text-gray-500">No payment transactions found for order {searchOrderId}.</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batch-payment" className="space-y-6">
            <BatchPayment onPaymentSuccess={() => handlePaymentSuccess(null)} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}